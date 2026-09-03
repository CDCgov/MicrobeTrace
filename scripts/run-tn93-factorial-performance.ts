#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import * as tn93 from 'tn93';

import {
  complementTn93PairIndices,
  createTn93CandidatePlan,
  tn93PairCoordinates,
  tn93PairCount,
} from '../src/app/workers/tn93-candidate-planner';
import {
  computeTn93AmbiguityFraction,
  tn93DistanceForStrategy,
} from '../src/app/workers/tn93-distance';
import type {
  Tn93AmbiguityStrategy,
} from '../src/app/workers/tn93-engine.types';

type RadialProfile =
  | 'gradient'
  | 'bands'
  | 'narrow'
  | 'shell'
  | 'nested';

type FactorFamily =
  | 'candidate-density'
  | 'radial-topology'
  | 'sequence-length'
  | 'ambiguity-strategy'
  | 'ambiguity-rate'
  | 'non-finite-radii';

type BenchmarkSequence = {
  _seqInt: Uint8Array;
  _ambiguity: number;
  validForConsensus: boolean;
};

type DatasetDefinition = {
  id: string;
  sequenceCount: number;
  sequenceLength: number;
  radialProfile: RadialProfile;
  ambiguityRate: number;
  nonFiniteShare: number;
  seed: number;
};

type ScenarioDefinition = {
  id: string;
  family: FactorFamily;
  dataset: DatasetDefinition;
  strategy: Tn93AmbiguityStrategy;
  ambiguityThreshold: number;
  candidateTarget?: number;
  fixedThreshold?: number;
};

type DenseCorpus = {
  distances: Float32Array;
  finiteDistances: number;
  hash: string;
  denseP50Ms: number;
  denseSamplesMs: number[];
};

type ScenarioResult = {
  id: string;
  family: FactorFamily;
  sequenceCount: number;
  sequenceLength: number;
  totalPairs: number;
  radialProfile: RadialProfile;
  ambiguityStrategy: Tn93AmbiguityStrategy;
  ambiguityRate: number;
  nonFiniteShare: number;
  threshold: number;
  requestedCandidateRatio: number | null;
  candidatePairs: number;
  candidateRatio: number;
  initialComputedPairs: number;
  deferredPairs: number;
  progressive: boolean;
  fallbackReason: string | null;
  planningP50Ms: number;
  foregroundP50Ms: number;
  initialP50Ms: number;
  denseP50Ms: number;
  initialImprovementPct: number;
  backgroundP50Ms: number;
  workerExactP50Ms: number;
  visibleLinks: number;
  visibleRatio: number;
  finiteDistances: number;
  distanceFloat32Hash: string;
  planningSamplesMs: number[];
  foregroundSamplesMs: number[];
  backgroundSamplesMs: number[];
  denseSamplesMs: number[];
};

const DNA = ['a', 'c', 'g', 't'];
const DEFAULT_REPETITIONS = 5;
const DEFAULT_AMBIGUITY_THRESHOLD = 0.15;
const DEFAULT_THRESHOLD = 0.01;
const MINIMUM_PROGRESSIVE_PAIRS = 5000;
const MAXIMUM_PROGRESSIVE_CANDIDATE_RATIO = 0.8;
const outputDirectory = path.join(
  process.cwd(),
  'cypress',
  'downloads',
  'performance',
);
let benchmarkSink = 0;

function parseRepetitions(): number {
  const argument = process.argv.find(value => value.startsWith('--repetitions='));
  const requested = Number(argument?.split('=')[1] ?? DEFAULT_REPETITIONS);
  return Number.isFinite(requested) && requested >= 3
    ? Math.floor(requested)
    : DEFAULT_REPETITIONS;
}

function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function p50(values: number[]): number {
  const sorted = values.slice().sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function round(value: number, digits = 3): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function buildReference(sequenceLength: number): string[] {
  return Array.from(
    { length: sequenceLength },
    (_value, index) => DNA[index % DNA.length],
  );
}

function shuffledPositions(
  sequenceLength: number,
  random: () => number,
): number[] {
  const positions = Array.from({ length: sequenceLength }, (_value, index) => index);
  for (let index = positions.length - 1; index > 0; index--) {
    const replacement = Math.floor(random() * (index + 1));
    [positions[index], positions[replacement]] = [
      positions[replacement],
      positions[index],
    ];
  }
  return positions;
}

function mutationFractionForProfile(
  profile: RadialProfile,
  sequenceIndex: number,
  sequenceCount: number,
): number {
  const position = sequenceIndex / Math.max(1, sequenceCount - 1);
  switch (profile) {
    case 'bands': {
      const bands = [0, 0.0225, 0.045, 0.0675, 0.09];
      return bands[sequenceIndex % bands.length]
        + ((sequenceIndex % 3) - 1) * 0.0005;
    }
    case 'narrow':
      return position * 0.015;
    case 'shell':
      return 0.045;
    case 'nested':
    case 'gradient':
    default:
      return position * 0.09;
  }
}

function buildDataset(definition: DatasetDefinition): BenchmarkSequence[] {
  const reference = buildReference(definition.sequenceLength);
  const random = makeRandom(definition.seed);
  const nestedPositions = shuffledPositions(definition.sequenceLength, random);
  const nonFiniteCount = Math.floor(
    definition.sequenceCount * definition.nonFiniteShare,
  );
  const sequences: BenchmarkSequence[] = [];

  for (let sequenceIndex = 0; sequenceIndex < definition.sequenceCount; sequenceIndex++) {
    let sequence: string[];
    if (sequenceIndex < nonFiniteCount) {
      // R resolves to a two-base ambiguity with no concrete observations.
      // The TN93 radius is therefore non-finite, exercising the planner's
      // conservative "include every pair involving this sequence" rule.
      sequence = Array.from({ length: definition.sequenceLength }, () => 'r');
    } else {
      sequence = reference.slice();
      const mutationFraction = Math.max(
        0,
        mutationFractionForProfile(
          definition.radialProfile,
          sequenceIndex - nonFiniteCount,
          definition.sequenceCount - nonFiniteCount,
        ),
      );
      const mutationCount = Math.min(
        definition.sequenceLength,
        Math.floor(definition.sequenceLength * mutationFraction),
      );
      const positions = definition.radialProfile === 'nested'
        ? nestedPositions
        : shuffledPositions(definition.sequenceLength, random);
      for (let mutationIndex = 0; mutationIndex < mutationCount; mutationIndex++) {
        const position = positions[mutationIndex];
        const baseIndex = DNA.indexOf(sequence[position]);
        sequence[position] = DNA[(baseIndex + 1) % DNA.length];
      }

      const ambiguityCount = Math.floor(
        definition.sequenceLength * definition.ambiguityRate,
      );
      const ambiguityPositions = shuffledPositions(definition.sequenceLength, random);
      for (let ambiguityIndex = 0; ambiguityIndex < ambiguityCount; ambiguityIndex++) {
        sequence[ambiguityPositions[ambiguityIndex]] = ambiguityIndex % 2 === 0
          ? 'n'
          : 'r';
      }
    }

    const encoded = tn93.toInts(sequence.join(''));
    sequences.push({
      _seqInt: encoded,
      _ambiguity: computeTn93AmbiguityFraction(encoded),
      validForConsensus: true,
    });
  }

  return sequences;
}

function thresholdForCandidateTarget(
  radii: Float64Array,
  requestedRatio: number,
): number {
  const finiteDifferences: number[] = [];
  let nonFinitePairs = 0;
  for (let source = 1; source < radii.length; source++) {
    for (let target = 0; target < source; target++) {
      if (Number.isFinite(radii[source]) && Number.isFinite(radii[target])) {
        finiteDifferences.push(Math.abs(radii[source] - radii[target]));
      } else {
        nonFinitePairs++;
      }
    }
  }
  finiteDifferences.sort((left, right) => left - right);
  const totalPairs = tn93PairCount(radii.length);
  const desiredPairs = Math.max(
    nonFinitePairs,
    Math.min(totalPairs, Math.floor(totalPairs * requestedRatio)),
  );
  const desiredFinitePairs = desiredPairs - nonFinitePairs;
  if (desiredFinitePairs <= 0 || finiteDifferences.length === 0) return 0;
  return finiteDifferences[
    Math.min(finiteDifferences.length - 1, desiredFinitePairs - 1)
  ];
}

function updateFnv1a(hash: number, value: number): number {
  return Math.imul((hash ^ value) >>> 0, 16777619) >>> 0;
}

function hashDistances(distances: Float32Array): string {
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  let hash = 2166136261;
  for (let index = 0; index < distances.length; index++) {
    view.setFloat32(0, distances[index], true);
    for (let byte = 0; byte < 4; byte++) {
      hash = updateFnv1a(hash, view.getUint8(byte));
    }
  }
  return hash.toString(16).padStart(8, '0');
}

function distanceForPair(
  sequences: BenchmarkSequence[],
  strategy: Tn93AmbiguityStrategy,
  ambiguityThreshold: number,
  sourceIndex: number,
  targetIndex: number,
): number {
  const source = sequences[sourceIndex];
  const target = sequences[targetIndex];
  return tn93DistanceForStrategy(
    source._seqInt,
    target._seqInt,
    strategy,
    source._ambiguity,
    target._ambiguity,
    ambiguityThreshold,
  );
}

function scanAllPairs(
  sequences: BenchmarkSequence[],
  strategy: Tn93AmbiguityStrategy,
  ambiguityThreshold: number,
  output?: Float32Array,
): number {
  let checksum = 0;
  let pairIndex = 0;
  for (let source = 1; source < sequences.length; source++) {
    for (let target = 0; target < source; target++) {
      const distance = distanceForPair(
        sequences,
        strategy,
        ambiguityThreshold,
        source,
        target,
      );
      if (output) output[pairIndex] = Math.fround(distance);
      if (Number.isFinite(distance)) checksum += distance;
      pairIndex++;
    }
  }
  benchmarkSink += checksum;
  return checksum;
}

function scanPairIndices(
  sequences: BenchmarkSequence[],
  pairIndices: Uint32Array,
  strategy: Tn93AmbiguityStrategy,
  ambiguityThreshold: number,
): number {
  let checksum = 0;
  for (let index = 0; index < pairIndices.length; index++) {
    const coordinates = tn93PairCoordinates(pairIndices[index]);
    const distance = distanceForPair(
      sequences,
      strategy,
      ambiguityThreshold,
      coordinates.sourceIndex,
      coordinates.targetIndex,
    );
    if (Number.isFinite(distance)) checksum += distance;
  }
  benchmarkSink += checksum;
  return checksum;
}

function measure(operation: () => void, repetitions: number): number[] {
  operation();
  const samples: number[] = [];
  for (let run = 0; run < repetitions; run++) {
    const startedAt = performance.now();
    operation();
    samples.push(performance.now() - startedAt);
  }
  return samples;
}

function createDenseCorpus(
  sequences: BenchmarkSequence[],
  strategy: Tn93AmbiguityStrategy,
  ambiguityThreshold: number,
  repetitions: number,
): DenseCorpus {
  const totalPairs = tn93PairCount(sequences.length);
  const distances = new Float32Array(totalPairs);
  scanAllPairs(sequences, strategy, ambiguityThreshold, distances);
  const samples = measure(
    () => scanAllPairs(sequences, strategy, ambiguityThreshold),
    repetitions,
  );
  let finiteDistances = 0;
  for (let index = 0; index < distances.length; index++) {
    if (Number.isFinite(distances[index])) finiteDistances++;
  }
  return {
    distances,
    finiteDistances,
    hash: hashDistances(distances),
    denseP50Ms: p50(samples),
    denseSamplesMs: samples,
  };
}

function buildScenarioDefinitions(): ScenarioDefinition[] {
  const scenarios: ScenarioDefinition[] = [];
  const baseDataset = (
    id: string,
    sequenceCount: number,
    sequenceLength = 1200,
    radialProfile: RadialProfile = 'gradient',
    ambiguityRate = 0,
    nonFiniteShare = 0,
  ): DatasetDefinition => ({
    id,
    sequenceCount,
    sequenceLength,
    radialProfile,
    ambiguityRate,
    nonFiniteShare,
    seed: 0x544e0000
      + sequenceCount
      + sequenceLength
      + Math.floor(ambiguityRate * 1000)
      + Math.floor(nonFiniteShare * 10000),
  });

  [100, 250, 500, 1000].forEach(sequenceCount => {
    const targets = sequenceCount === 100
      ? [0.2]
      : [0.05, 0.1, 0.2, 0.4, 0.6, 0.79, 0.95];
    const dataset = baseDataset(`size-${sequenceCount}`, sequenceCount);
    targets.forEach(target => {
      scenarios.push({
        id: `candidate-n${sequenceCount}-r${Math.round(target * 100)}`,
        family: 'candidate-density',
        dataset,
        strategy: 'AVERAGE',
        ambiguityThreshold: DEFAULT_AMBIGUITY_THRESHOLD,
        candidateTarget: target,
      });
    });
  });

  (['gradient', 'bands', 'narrow', 'shell', 'nested'] as RadialProfile[])
    .forEach(profile => {
      scenarios.push({
        id: `topology-${profile}`,
        family: 'radial-topology',
        dataset: baseDataset(`topology-${profile}`, 500, 1200, profile),
        strategy: 'AVERAGE',
        ambiguityThreshold: DEFAULT_AMBIGUITY_THRESHOLD,
        fixedThreshold: DEFAULT_THRESHOLD,
      });
    });

  [300, 1200, 5000].forEach(sequenceLength => {
    scenarios.push({
      id: `length-${sequenceLength}`,
      family: 'sequence-length',
      dataset: baseDataset(`length-${sequenceLength}`, 500, sequenceLength),
      strategy: 'AVERAGE',
      ambiguityThreshold: DEFAULT_AMBIGUITY_THRESHOLD,
      candidateTarget: 0.2,
    });
  });

  (['AVERAGE', 'RESOLVE', 'SKIP', 'GAPMM', 'HIVTRACE-G'] as Tn93AmbiguityStrategy[])
    .forEach(strategy => {
      scenarios.push({
        id: `strategy-${strategy.toLowerCase()}`,
        family: 'ambiguity-strategy',
        dataset: baseDataset('strategy-ambiguity-5', 250, 1200, 'gradient', 0.05),
        strategy,
        ambiguityThreshold: DEFAULT_AMBIGUITY_THRESHOLD,
        candidateTarget: 0.2,
      });
    });

  [0, 0.01, 0.05, 0.2].forEach(ambiguityRate => {
    scenarios.push({
      id: `ambiguity-resolve-${Math.round(ambiguityRate * 100)}`,
      family: 'ambiguity-rate',
      dataset: baseDataset(
        `ambiguity-${ambiguityRate}`,
        250,
        1200,
        'gradient',
        ambiguityRate,
      ),
      strategy: 'RESOLVE',
      ambiguityThreshold: DEFAULT_AMBIGUITY_THRESHOLD,
      candidateTarget: 0.2,
    });
  });

  [0, 0.01, 0.05, 0.1, 0.25].forEach(nonFiniteShare => {
    scenarios.push({
      id: `nonfinite-${Math.round(nonFiniteShare * 100)}`,
      family: 'non-finite-radii',
      dataset: baseDataset(
        `nonfinite-${nonFiniteShare}`,
        250,
        1200,
        'gradient',
        0,
        nonFiniteShare,
      ),
      strategy: 'AVERAGE',
      ambiguityThreshold: DEFAULT_AMBIGUITY_THRESHOLD,
      fixedThreshold: DEFAULT_THRESHOLD,
    });
  });

  return scenarios;
}

function formatCsv(results: ScenarioResult[]): string {
  const columns: Array<keyof ScenarioResult> = [
    'id',
    'family',
    'sequenceCount',
    'sequenceLength',
    'totalPairs',
    'radialProfile',
    'ambiguityStrategy',
    'ambiguityRate',
    'nonFiniteShare',
    'threshold',
    'requestedCandidateRatio',
    'candidatePairs',
    'candidateRatio',
    'initialComputedPairs',
    'deferredPairs',
    'progressive',
    'fallbackReason',
    'planningP50Ms',
    'foregroundP50Ms',
    'initialP50Ms',
    'denseP50Ms',
    'initialImprovementPct',
    'backgroundP50Ms',
    'workerExactP50Ms',
    'visibleLinks',
    'visibleRatio',
    'finiteDistances',
    'distanceFloat32Hash',
  ];
  const escape = (value: unknown): string => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [
    columns.join(','),
    ...results.map(result => columns.map(column => escape(result[column])).join(',')),
  ].join('\n');
}

function run(): void {
  const repetitions = parseRepetitions();
  const scenarios = buildScenarioDefinitions();
  const sequenceCache = new Map<string, BenchmarkSequence[]>();
  const denseCache = new Map<string, DenseCorpus>();
  const results: ScenarioResult[] = [];

  for (const [scenarioIndex, scenario] of scenarios.entries()) {
    const sequences = sequenceCache.get(scenario.dataset.id)
      ?? buildDataset(scenario.dataset);
    sequenceCache.set(scenario.dataset.id, sequences);

    const calibrationPlan = createTn93CandidatePlan(
      sequences,
      scenario.strategy,
      scenario.ambiguityThreshold,
      0,
    );
    const threshold = scenario.fixedThreshold ?? thresholdForCandidateTarget(
      calibrationPlan.radii,
      scenario.candidateTarget ?? 0.2,
    );

    let finalPlan = calibrationPlan;
    const planningSamples = measure(() => {
      finalPlan = createTn93CandidatePlan(
        sequences,
        scenario.strategy,
        scenario.ambiguityThreshold,
        threshold,
      );
    }, repetitions);

    const foregroundSamples = measure(
      () => scanPairIndices(
        sequences,
        finalPlan.foregroundPairIndices,
        scenario.strategy,
        scenario.ambiguityThreshold,
      ),
      repetitions,
    );
    const complement = finalPlan.progressive
      ? complementTn93PairIndices(
        finalPlan.totalPairs,
        finalPlan.foregroundPairIndices,
      )
      : new Uint32Array();
    const backgroundSamples = complement.length > 0
      ? measure(
        () => scanPairIndices(
          sequences,
          complement,
          scenario.strategy,
          scenario.ambiguityThreshold,
        ),
        repetitions,
      )
      : Array.from({ length: repetitions }, () => 0);

    const denseKey = [
      scenario.dataset.id,
      scenario.strategy,
      scenario.ambiguityThreshold,
    ].join('|');
    const denseCorpus = denseCache.get(denseKey)
      ?? createDenseCorpus(
        sequences,
        scenario.strategy,
        scenario.ambiguityThreshold,
        repetitions,
      );
    denseCache.set(denseKey, denseCorpus);

    let visibleLinks = 0;
    for (let pairIndex = 0; pairIndex < denseCorpus.distances.length; pairIndex++) {
      if (denseCorpus.distances[pairIndex] <= threshold) visibleLinks++;
    }

    const planningP50Ms = p50(planningSamples);
    const foregroundP50Ms = p50(foregroundSamples);
    const backgroundP50Ms = p50(backgroundSamples);
    const initialP50Ms = planningP50Ms + foregroundP50Ms;
    const expectedProgressive = finalPlan.totalPairs >= MINIMUM_PROGRESSIVE_PAIRS
      && finalPlan.candidateRatio <= MAXIMUM_PROGRESSIVE_CANDIDATE_RATIO;
    if (finalPlan.progressive !== expectedProgressive) {
      throw new Error(
        `${scenario.id} progressive decision mismatch: expected ${expectedProgressive}, got ${finalPlan.progressive}.`,
      );
    }
    if (
      finalPlan.foregroundPairIndices.length + complement.length
      !== finalPlan.totalPairs
    ) {
      throw new Error(`${scenario.id} candidate/complement partition is incomplete.`);
    }

    results.push({
      id: scenario.id,
      family: scenario.family,
      sequenceCount: scenario.dataset.sequenceCount,
      sequenceLength: scenario.dataset.sequenceLength,
      totalPairs: finalPlan.totalPairs,
      radialProfile: scenario.dataset.radialProfile,
      ambiguityStrategy: scenario.strategy,
      ambiguityRate: scenario.dataset.ambiguityRate,
      nonFiniteShare: scenario.dataset.nonFiniteShare,
      threshold: round(threshold, 9),
      requestedCandidateRatio: scenario.candidateTarget ?? null,
      candidatePairs: finalPlan.candidatePairs,
      candidateRatio: round(finalPlan.candidateRatio, 6),
      initialComputedPairs: finalPlan.foregroundPairIndices.length,
      deferredPairs: finalPlan.deferredPairs,
      progressive: finalPlan.progressive,
      fallbackReason: finalPlan.fallbackReason ?? null,
      planningP50Ms: round(planningP50Ms),
      foregroundP50Ms: round(foregroundP50Ms),
      initialP50Ms: round(initialP50Ms),
      denseP50Ms: round(denseCorpus.denseP50Ms),
      initialImprovementPct: round(
        (1 - initialP50Ms / denseCorpus.denseP50Ms) * 100,
        2,
      ),
      backgroundP50Ms: round(backgroundP50Ms),
      workerExactP50Ms: round(initialP50Ms + backgroundP50Ms),
      visibleLinks,
      visibleRatio: round(visibleLinks / finalPlan.totalPairs, 6),
      finiteDistances: denseCorpus.finiteDistances,
      distanceFloat32Hash: denseCorpus.hash,
      planningSamplesMs: planningSamples.map(value => round(value)),
      foregroundSamplesMs: foregroundSamples.map(value => round(value)),
      backgroundSamplesMs: backgroundSamples.map(value => round(value)),
      denseSamplesMs: denseCorpus.denseSamplesMs.map(value => round(value)),
    });

    process.stdout.write(
      `[${scenarioIndex + 1}/${scenarios.length}] ${scenario.id}: `
      + `${round(finalPlan.candidateRatio * 100, 1)}% candidates, `
      + `${round((1 - initialP50Ms / denseCorpus.denseP50Ms) * 100, 1)}% initial improvement\n`,
    );
  }

  fs.mkdirSync(outputDirectory, { recursive: true });
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = path.join(
    outputDirectory,
    `${runId}-tn93-factorial-worker.json`,
  );
  const csvPath = path.join(
    outputDirectory,
    `${runId}-tn93-factorial-worker.csv`,
  );
  fs.writeFileSync(jsonPath, `${JSON.stringify({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    repetitions,
    scenarioCount: results.length,
    benchmarkSink,
    results,
  }, null, 2)}\n`, 'utf8');
  fs.writeFileSync(csvPath, `${formatCsv(results)}\n`, 'utf8');
  process.stdout.write(`JSON ${jsonPath}\nCSV ${csvPath}\n`);
}

run();
