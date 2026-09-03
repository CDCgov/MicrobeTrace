#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const tn93 = require('tn93');

const outDir = path.join(__dirname, '..', 'cypress', 'fixtures', 'performance');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function makeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function csvEscape(value) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(fileName, rows) {
  const body = rows.map((row) => row.map(csvEscape).join(',')).join('\n');
  fs.writeFileSync(path.join(outDir, fileName), `${body}\n`, 'utf8');
}

function wrapSequence(sequence, width = 80) {
  const chunks = [];
  for (let index = 0; index < sequence.length; index += width) {
    chunks.push(sequence.slice(index, index + width));
  }
  return chunks.join('\n');
}

function buildGraphFixture({
  nodeCount,
  linkCount,
  nodeFile,
  linkFile,
  idPrefix,
  idPad,
  seed,
}) {
  const subtypes = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const nodes = [['_id', 'subtype', 'Diag date']];
  const nodeId = (index) => `${idPrefix}${String(index + 1).padStart(idPad, '0')}`;

  for (let index = 0; index < nodeCount; index++) {
    const day = (index % 28) + 1;
    const month = (Math.floor(index / 28) % 12) + 1;
    nodes.push([
      nodeId(index),
      subtypes[index % subtypes.length],
      `${month}/${day}/2024`,
    ]);
  }

  const links = [['source', 'target', 'distance']];
  const seen = new Set();
  const addLink = (a, b, distance) => {
    const sourceIndex = Math.min(a, b);
    const targetIndex = Math.max(a, b);
    const key = `${sourceIndex}:${targetIndex}`;
    if (sourceIndex === targetIndex || seen.has(key)) return false;
    seen.add(key);
    links.push([
      nodeId(sourceIndex),
      nodeId(targetIndex),
      distance.toFixed(3),
    ]);
    return true;
  };

  for (let index = 0; index < nodeCount; index++) {
    addLink(index, (index + 1) % nodeCount, 4 + (index % 8));
  }

  const random = makeRandom(seed);
  while (seen.size < linkCount) {
    const sourceIndex = Math.floor(random() * nodeCount);
    const offset = 2 + Math.floor(random() * 96);
    const targetIndex = (sourceIndex + offset) % nodeCount;
    const distance = 6 + Math.floor(random() * 7);
    addLink(sourceIndex, targetIndex, distance);
  }

  writeCsv(nodeFile, nodes);
  writeCsv(linkFile, links);
}

function buildGraphFixtures() {
  buildGraphFixture({
    nodeCount: 1600,
    linkCount: 3200,
    nodeFile: 'average-graph-nodes.csv',
    linkFile: 'average-graph-links.csv',
    idPrefix: 'P',
    idPad: 4,
    seed: 0x4d544750,
  });

  buildGraphFixture({
    nodeCount: 5000,
    linkCount: 10000,
    nodeFile: 'large-graph-nodes.csv',
    linkFile: 'large-graph-links.csv',
    idPrefix: 'LG',
    idPad: 5,
    seed: 0x4d544c47,
  });

  buildGraphFixture({
    nodeCount: 10000,
    linkCount: 25000,
    nodeFile: 'stress-graph-nodes.csv',
    linkFile: 'stress-graph-links.csv',
    idPrefix: 'SG',
    idPad: 5,
    seed: 0x4d545347,
  });
}

const DNA_ALPHABET = ['a', 'c', 'g', 't'];

function nextBase(current, step = 1) {
  const index = DNA_ALPHABET.indexOf(current);
  return DNA_ALPHABET[(index + step) % DNA_ALPHABET.length];
}

function choosePositions(random, count, sequenceLength, blockedPositions) {
  const positions = [];
  const chosen = new Set(blockedPositions);

  if (sequenceLength - chosen.size < count) {
    throw new Error(`Cannot choose ${count} positions from ${sequenceLength} bases with ${chosen.size} blocked positions.`);
  }

  while (positions.length < count) {
    const position = Math.floor(random() * sequenceLength);
    if (chosen.has(position)) continue;
    chosen.add(position);
    positions.push(position);
  }

  return positions;
}

function countSnps(sequenceA, sequenceB) {
  const limit = Math.min(sequenceA.length, sequenceB.length);
  let count = 0;

  for (let index = 0; index < limit; index++) {
    if (sequenceA[index] !== sequenceB[index]) {
      count++;
    }
  }

  return count + Math.abs(sequenceA.length - sequenceB.length);
}

function validateClusteredSequenceFixture({
  fileName,
  records,
  clusterCount,
  samplesPerCluster,
  threshold,
  expectedVisibleLinks,
}) {
  const expectedTotalLinks = (records.length * (records.length - 1)) / 2;
  const expectedWithinClusterLinks = clusterCount * ((samplesPerCluster * (samplesPerCluster - 1)) / 2);
  let visibleLinks = 0;
  let withinClusterLinks = 0;
  let maxWithinClusterSnps = 0;
  let minCrossClusterSnps = Number.POSITIVE_INFINITY;

  for (let sourceIndex = 0; sourceIndex < records.length; sourceIndex++) {
    const source = records[sourceIndex];
    for (let targetIndex = 0; targetIndex < sourceIndex; targetIndex++) {
      const target = records[targetIndex];
      const distance = countSnps(source.sequence, target.sequence);
      const sameCluster = source.cluster === target.cluster;
      const visible = distance <= threshold;

      if (sameCluster) {
        withinClusterLinks++;
        maxWithinClusterSnps = Math.max(maxWithinClusterSnps, distance);
        if (!visible) {
          throw new Error(`${fileName} has an above-threshold within-cluster pair: ${source.id}/${target.id} = ${distance}.`);
        }
      } else {
        minCrossClusterSnps = Math.min(minCrossClusterSnps, distance);
        if (visible) {
          throw new Error(`${fileName} has a threshold-visible cross-cluster pair: ${source.id}/${target.id} = ${distance}.`);
        }
      }

      if (visible) {
        visibleLinks++;
      }
    }
  }

  if (withinClusterLinks !== expectedWithinClusterLinks) {
    throw new Error(`${fileName} expected ${expectedWithinClusterLinks} within-cluster pairs but found ${withinClusterLinks}.`);
  }

  if (visibleLinks !== expectedVisibleLinks) {
    throw new Error(`${fileName} expected ${expectedVisibleLinks} threshold-visible links but found ${visibleLinks}.`);
  }

  return {
    totalLinks: expectedTotalLinks,
    visibleLinks,
    maxWithinClusterSnps,
    minCrossClusterSnps,
  };
}

function buildSequenceFixture({
  clusterCount,
  samplesPerCluster,
  sequenceLength,
  fileName,
  idPrefix,
  idPad,
  seed,
  threshold,
  clusterSignatureSnps,
  sampleMutationBase,
  sampleMutationSpread,
  expectedVisibleLinks,
}) {
  const random = makeRandom(seed);
  const reference = Array.from({ length: sequenceLength }, () => DNA_ALPHABET[Math.floor(random() * DNA_ALPHABET.length)]);
  const allSignaturePositions = new Set();
  const clusterSignatures = [];
  const lines = [];
  const records = [];

  for (let clusterIndex = 0; clusterIndex < clusterCount; clusterIndex++) {
    const signature = choosePositions(random, clusterSignatureSnps, sequenceLength, allSignaturePositions);
    signature.forEach((position) => allSignaturePositions.add(position));
    clusterSignatures.push(signature);
  }

  for (let clusterIndex = 0; clusterIndex < clusterCount; clusterIndex++) {
    const clusterReference = reference.slice();
    clusterSignatures[clusterIndex].forEach((position, signatureIndex) => {
      clusterReference[position] = nextBase(clusterReference[position], 1 + ((clusterIndex + signatureIndex) % 3));
    });

    for (let sampleIndex = 0; sampleIndex < samplesPerCluster; sampleIndex++) {
      const sequence = clusterReference.slice();
      const mutationCount = sampleMutationBase + ((clusterIndex + sampleIndex) % sampleMutationSpread);
      const mutationPositions = choosePositions(random, mutationCount, sequenceLength, allSignaturePositions);
      const globalIndex = clusterIndex * samplesPerCluster + sampleIndex;
      const id = `${idPrefix}${String(globalIndex + 1).padStart(idPad, '0')}`;

      mutationPositions.forEach((position, mutationIndex) => {
        sequence[position] = nextBase(sequence[position], 1 + ((clusterIndex + sampleIndex + mutationIndex) % 3));
      });

      const sequenceText = sequence.join('');
      records.push({
        id,
        cluster: clusterIndex,
        sequence: sequenceText,
      });
      lines.push(`>${id}`);
      lines.push(wrapSequence(sequenceText));
    }
  }

  validateClusteredSequenceFixture({
    fileName,
    records,
    clusterCount,
    samplesPerCluster,
    threshold,
    expectedVisibleLinks,
  });

  fs.writeFileSync(path.join(outDir, fileName), `${lines.join('\n')}\n`, 'utf8');
}

function buildSequenceFixtures() {
  buildSequenceFixture({
    clusterCount: 8,
    samplesPerCluster: 15,
    sequenceLength: 2400,
    fileName: 'average-sequences.fasta',
    idPrefix: 'SEQ',
    idPad: 4,
    seed: 0x53455150,
    threshold: 16,
    clusterSignatureSnps: 12,
    sampleMutationBase: 4,
    sampleMutationSpread: 3,
    expectedVisibleLinks: 840,
  });

  buildSequenceFixture({
    clusterCount: 15,
    samplesPerCluster: 20,
    sequenceLength: 1800,
    fileName: 'large-sequences.fasta',
    idPrefix: 'LSEQ',
    idPad: 4,
    seed: 0x4d544c53,
    threshold: 16,
    clusterSignatureSnps: 12,
    sampleMutationBase: 4,
    sampleMutationSpread: 3,
    expectedVisibleLinks: 2850,
  });

  buildSequenceFixture({
    clusterCount: 25,
    samplesPerCluster: 40,
    sequenceLength: 1800,
    fileName: 'expanded-large-sequences-1000.fasta',
    idPrefix: 'ELSEQ',
    idPad: 4,
    seed: 0x45534c31,
    threshold: 16,
    clusterSignatureSnps: 12,
    sampleMutationBase: 4,
    sampleMutationSpread: 3,
    expectedVisibleLinks: 19500,
  });

  buildSequenceFixture({
    clusterCount: 40,
    samplesPerCluster: 50,
    sequenceLength: 1800,
    fileName: 'stress-sequences-2000.fasta',
    idPrefix: 'SSEQ',
    idPad: 4,
    seed: 0x53535132,
    threshold: 16,
    clusterSignatureSnps: 12,
    sampleMutationBase: 4,
    sampleMutationSpread: 3,
    expectedVisibleLinks: 49000,
  });
}

const TN93_PROGRESSIVE_SEQUENCE_COUNT = 180;
const TN93_PROGRESSIVE_SEQUENCE_LENGTH = 1200;
const TN93_PROGRESSIVE_THRESHOLD = 0.01;
const TN93_PROGRESSIVE_MINIMUM_PAIR_COUNT = 5000;
const TN93_PROGRESSIVE_MAXIMUM_CANDIDATE_RATIO = 0.8;
const TN93_PROGRESSIVE_SCALING_COUNTS = [100, 250, 500, 750, 1000];

function buildBalancedReference(sequenceLength) {
  return Array.from(
    { length: sequenceLength },
    (_value, index) => DNA_ALPHABET[index % DNA_ALPHABET.length],
  );
}

function chooseBalancedMutationPositions(random, perBaseCounts, reference) {
  const positionsByBase = DNA_ALPHABET.map(() => []);
  reference.forEach((base, index) => {
    positionsByBase[DNA_ALPHABET.indexOf(base)].push(index);
  });

  return perBaseCounts.flatMap((count, baseIndex) => {
    const available = positionsByBase[baseIndex].slice();
    const chosen = [];

    while (chosen.length < count) {
      const positionIndex = Math.floor(random() * available.length);
      chosen.push(available[positionIndex]);
      available.splice(positionIndex, 1);
    }
    return chosen;
  });
}

function mutateReference(reference, positions) {
  const sequence = reference.slice();
  positions.forEach((position) => {
    sequence[position] = nextBase(sequence[position]);
  });
  return sequence.join('');
}

function buildTn93Consensus(records) {
  const sequenceLength = records.reduce(
    (maximum, record) => Math.max(maximum, record.encoded.length),
    0,
  );
  const consensus = new Uint8Array(sequenceLength);

  for (let site = 0; site < sequenceLength; site++) {
    const counts = [0, 0, 0, 0, 0];
    records.forEach((record) => {
      if (site >= record.encoded.length) return;
      const base = record.encoded[site];
      if (base < 4) counts[base]++;
      else if (base === 17) counts[4]++;
    });

    let selected = 0;
    let maximum = counts[0];
    for (let candidate = 1; candidate < counts.length; candidate++) {
      if (maximum <= counts[candidate]) {
        maximum = counts[candidate];
        selected = candidate;
      }
    }
    consensus[site] = selected === 4 ? 17 : selected;
  }

  return consensus;
}

function enumerateTn93CandidatePairs(radii, threshold) {
  const finite = radii
    .map((radius, index) => ({ radius, index }))
    .filter((entry) => Number.isFinite(entry.radius))
    .sort((left, right) => left.radius - right.radius || left.index - right.index);
  const nonFiniteCount = radii.length - finite.length;
  let candidates = nonFiniteCount * finite.length
    + (nonFiniteCount * (nonFiniteCount - 1)) / 2;
  let windowEnd = 1;

  for (let windowStart = 0; windowStart < finite.length; windowStart++) {
    windowEnd = Math.max(windowEnd, windowStart + 1);
    while (
      windowEnd < finite.length
      && finite[windowEnd].radius - finite[windowStart].radius <= threshold
    ) {
      windowEnd++;
    }
    candidates += windowEnd - windowStart - 1;
  }

  return candidates;
}

function updateFnv1a(hash, value) {
  return Math.imul((hash ^ value) >>> 0, 16777619) >>> 0;
}

function hashTn93Distances(distanceRecords) {
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  let hash = 2166136261;

  distanceRecords
    .slice()
    .sort((left, right) => (
      left.source.localeCompare(right.source)
      || left.target.localeCompare(right.target)
    ))
    .forEach((record) => {
      `${record.source}\0${record.target}\0`.split('').forEach((character) => {
        hash = updateFnv1a(hash, character.charCodeAt(0));
      });
      view.setFloat32(0, Math.fround(record.distance), true);
      for (let byte = 0; byte < 4; byte++) {
        hash = updateFnv1a(hash, view.getUint8(byte));
      }
    });

  return hash.toString(16).padStart(8, '0');
}

function validateAndSummarizeTn93Fixture({
  fileName,
  records,
  threshold,
  expectedProgressive,
  ambiguityStrategy = 'AVERAGE',
  ambiguityThreshold = 1,
}) {
  const consensus = buildTn93Consensus(records);
  const consensusSequence = Array.from(
    consensus,
    base => (['a', 'c', 'g', 't'][base] ?? '-'),
  ).join('');
  const ambiguityFraction = record => (
    record.encoded.reduce((count, base) => count + (base > 3 ? 1 : 0), 0)
      / Math.max(1, record.encoded.length)
  );
  const distanceBetween = (source, target, targetSequence) => {
    let strategy = ambiguityStrategy;
    if (strategy === 'HIVTRACE-G') {
      strategy = ambiguityFraction(source) < ambiguityThreshold
        && ambiguityFraction(target) < ambiguityThreshold
        ? 'RESOLVE'
        : 'AVERAGE';
    }
    return strategy === 'RESOLVE'
      ? tn93(source.sequence, targetSequence, 'RESOLVE')
      : tn93.onInts(source.encoded, target.encoded, strategy);
  };
  const consensusRecord = {
    sequence: consensusSequence,
    encoded: consensus,
  };
  const radii = records.map((record) => (
    distanceBetween(record, consensusRecord, consensusSequence)
  ));
  const totalPairs = (records.length * (records.length - 1)) / 2;
  const candidatePairs = enumerateTn93CandidatePairs(radii, threshold);
  const candidateRatio = candidatePairs / totalPairs;
  const fallbackReason = expectedProgressive
    ? null
    : totalPairs < TN93_PROGRESSIVE_MINIMUM_PAIR_COUNT
      ? 'below-minimum-pair-count'
      : 'candidate-ratio-too-high';
  const distanceRecords = [];
  let visibleLinks = 0;
  let finiteDistances = 0;

  for (let sourceIndex = 1; sourceIndex < records.length; sourceIndex++) {
    for (let targetIndex = 0; targetIndex < sourceIndex; targetIndex++) {
      const rawDistance = distanceBetween(
        records[sourceIndex],
        records[targetIndex],
        records[targetIndex].sequence,
      );
      const distance = Math.fround(rawDistance);
      if (Number.isFinite(distance)) finiteDistances++;
      if (distance <= threshold) visibleLinks++;
      const ids = [records[sourceIndex].id, records[targetIndex].id].sort();
      distanceRecords.push({
        source: ids[0],
        target: ids[1],
        distance,
      });
    }
  }

  if (
    expectedProgressive
    && totalPairs < TN93_PROGRESSIVE_MINIMUM_PAIR_COUNT
  ) {
    throw new Error(
      `${fileName} has ${totalPairs} dyads; at least ${TN93_PROGRESSIVE_MINIMUM_PAIR_COUNT} are required.`,
    );
  }
  if (
    expectedProgressive
    && candidateRatio > TN93_PROGRESSIVE_MAXIMUM_CANDIDATE_RATIO
  ) {
    throw new Error(
      `${fileName} candidate ratio ${candidateRatio} does not activate progressive TN93.`,
    );
  }
  if (
    !expectedProgressive
    && totalPairs >= TN93_PROGRESSIVE_MINIMUM_PAIR_COUNT
    && candidateRatio <= TN93_PROGRESSIVE_MAXIMUM_CANDIDATE_RATIO
  ) {
    throw new Error(
      `${fileName} candidate ratio ${candidateRatio} does not exercise adaptive fallback.`,
    );
  }

  return {
    fasta: `performance/${fileName}`,
    nodes: records.length,
    sequenceLength: records[0].sequence.length,
    threshold,
    ambiguityStrategy,
    ambiguityThreshold,
    totalPairs,
    candidatePairs,
    candidateRatio,
    deferredPairs: expectedProgressive ? totalPairs - candidatePairs : 0,
    expectedProgressive,
    fallbackReason,
    visibleLinks,
    finiteDistances,
    distanceFloat32Hash: hashTn93Distances(distanceRecords),
  };
}

function writeTn93Fasta(fileName, records) {
  const lines = [];
  records.forEach((record) => {
    lines.push(`>${record.id}`);
    lines.push(wrapSequence(record.sequence));
  });
  fs.writeFileSync(path.join(outDir, fileName), `${lines.join('\n')}\n`, 'utf8');
}

function buildProgressiveTn93Records() {
  const reference = buildBalancedReference(TN93_PROGRESSIVE_SEQUENCE_LENGTH);
  const random = makeRandom(0x544e3931);
  const records = [];

  for (let index = 0; index < TN93_PROGRESSIVE_SEQUENCE_COUNT; index++) {
    const mutationCount = Math.floor(index * 0.62);
    const perBaseCounts = DNA_ALPHABET.map((_, baseIndex) => (
      Math.floor((mutationCount + DNA_ALPHABET.length - 1 - baseIndex) / DNA_ALPHABET.length)
    ));
    const positions = chooseBalancedMutationPositions(
      random,
      perBaseCounts,
      reference,
    );
    const sequence = mutateReference(reference, positions);
    records.push({
      id: `TPD${String(index + 1).padStart(4, '0')}`,
      sequence,
      encoded: tn93.toInts(sequence),
    });
  }

  return records;
}

function buildFallbackTn93Records() {
  const reference = buildBalancedReference(TN93_PROGRESSIVE_SEQUENCE_LENGTH);
  const random = makeRandom(0x544e3932);
  const records = [];

  for (let index = 0; index < TN93_PROGRESSIVE_SEQUENCE_COUNT; index++) {
    const positions = chooseBalancedMutationPositions(
      random,
      [9, 9, 9, 9],
      reference,
    );
    const sequence = mutateReference(reference, positions);
    records.push({
      id: `TAF${String(index + 1).padStart(4, '0')}`,
      sequence,
      encoded: tn93.toInts(sequence),
    });
  }

  return records;
}

function buildProgressiveTn93ScalingRecords(sequenceCount) {
  const reference = buildBalancedReference(TN93_PROGRESSIVE_SEQUENCE_LENGTH);
  const random = makeRandom((0x544e4000 + sequenceCount) >>> 0);
  const records = [];
  const maximumMutationCount = Math.floor(
    (TN93_PROGRESSIVE_SEQUENCE_COUNT - 1) * 0.62,
  );

  for (let index = 0; index < sequenceCount; index++) {
    const mutationCount = Math.floor(
      index * maximumMutationCount / Math.max(1, sequenceCount - 1),
    );
    const perBaseCounts = DNA_ALPHABET.map((_, baseIndex) => (
      Math.floor((mutationCount + DNA_ALPHABET.length - 1 - baseIndex) / DNA_ALPHABET.length)
    ));
    const positions = chooseBalancedMutationPositions(
      random,
      perBaseCounts,
      reference,
    );
    const sequence = mutateReference(reference, positions);
    records.push({
      id: `TPS${String(index + 1).padStart(4, '0')}`,
      sequence,
      encoded: tn93.toInts(sequence),
    });
  }

  return records;
}

function thresholdForTn93CandidateRatio(
  records,
  ambiguityStrategy,
  ambiguityThreshold,
  requestedRatio,
) {
  const consensus = buildTn93Consensus(records);
  const consensusSequence = Array.from(
    consensus,
    base => (['a', 'c', 'g', 't'][base] ?? '-'),
  ).join('');
  const ambiguities = records.map(record => (
    record.encoded.reduce((count, base) => count + (base > 3 ? 1 : 0), 0)
      / Math.max(1, record.encoded.length)
  ));
  const consensusAmbiguity = consensus.reduce(
    (count, base) => count + (base > 3 ? 1 : 0),
    0,
  ) / Math.max(1, consensus.length);
  const radii = records.map((record, index) => {
    let strategy = ambiguityStrategy;
    if (strategy === 'HIVTRACE-G') {
      strategy = ambiguities[index] < ambiguityThreshold
        && consensusAmbiguity < ambiguityThreshold
        ? 'RESOLVE'
        : 'AVERAGE';
    }
    return strategy === 'RESOLVE'
      ? tn93(record.sequence, consensusSequence, 'RESOLVE')
      : tn93.onInts(record.encoded, consensus, strategy);
  });
  const finiteDifferences = [];
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
  const totalPairs = (records.length * (records.length - 1)) / 2;
  const desiredPairs = Math.max(
    nonFinitePairs,
    Math.min(totalPairs, Math.floor(totalPairs * requestedRatio)),
  );
  const desiredFinitePairs = desiredPairs - nonFinitePairs;
  return desiredFinitePairs <= 0
    ? 0
    : finiteDifferences[
      Math.min(finiteDifferences.length - 1, desiredFinitePairs - 1)
    ];
}

function buildFactorTn93Records({
  sequenceCount,
  sequenceLength,
  profile,
  ambiguityRate = 0,
  nonFiniteShare = 0,
  seed,
}) {
  const reference = buildBalancedReference(sequenceLength);
  const random = makeRandom(seed);
  const records = [];
  const maximumMutationCount = Math.floor(sequenceLength * 0.09);
  const nestedPositions = chooseBalancedMutationPositions(
    random,
    DNA_ALPHABET.map((_, baseIndex) => (
      Math.floor(
        (
          maximumMutationCount
          + DNA_ALPHABET.length
          - 1
          - baseIndex
        ) / DNA_ALPHABET.length,
      )
    )),
    reference,
  );
  const nonFiniteCount = Math.floor(sequenceCount * nonFiniteShare);

  for (let index = 0; index < sequenceCount; index++) {
    let sequence;
    if (index < nonFiniteCount) {
      sequence = 'r'.repeat(sequenceLength);
    } else {
      const finiteIndex = index - nonFiniteCount;
      const finiteCount = sequenceCount - nonFiniteCount;
      const position = finiteIndex / Math.max(1, finiteCount - 1);
      const mutationCount = profile === 'shell'
        ? Math.floor(sequenceLength * 0.045)
        : Math.floor(maximumMutationCount * position);
      const perBaseCounts = DNA_ALPHABET.map((_, baseIndex) => (
        Math.floor((mutationCount + DNA_ALPHABET.length - 1 - baseIndex) / DNA_ALPHABET.length)
      ));
      const mutationPositions = profile === 'nested'
        ? nestedPositions.slice(0, mutationCount)
        : chooseBalancedMutationPositions(random, perBaseCounts, reference);
      const sequenceCharacters = mutateReference(reference, mutationPositions).split('');
      const ambiguityCount = Math.floor(sequenceLength * ambiguityRate);
      const ambiguityPositions = choosePositions(
        random,
        ambiguityCount,
        sequenceLength,
        new Set(),
      );
      ambiguityPositions.forEach((ambiguityPosition, ambiguityIndex) => {
        sequenceCharacters[ambiguityPosition] = ambiguityIndex % 2 === 0
          ? 'n'
          : 'r';
      });
      sequence = sequenceCharacters.join('');
    }
    records.push({
      id: `TPF${String(index + 1).padStart(4, '0')}`,
      sequence,
      encoded: tn93.toInts(sequence),
    });
  }

  return records;
}

function buildTn93FactorFixtures() {
  const definitions = [
    {
      id: 'candidate-05-n500',
      sequenceCount: 500,
      sequenceLength: 1200,
      profile: 'gradient',
      candidateTarget: 0.05,
      ambiguityStrategy: 'AVERAGE',
    },
    {
      id: 'topology-shell-n500',
      sequenceCount: 500,
      sequenceLength: 1200,
      profile: 'shell',
      threshold: TN93_PROGRESSIVE_THRESHOLD,
      ambiguityStrategy: 'AVERAGE',
    },
    {
      id: 'topology-nested-n500',
      sequenceCount: 500,
      sequenceLength: 1200,
      profile: 'nested',
      threshold: TN93_PROGRESSIVE_THRESHOLD,
      ambiguityStrategy: 'AVERAGE',
    },
    {
      id: 'length-5000-n250',
      sequenceCount: 250,
      sequenceLength: 5000,
      profile: 'gradient',
      candidateTarget: 0.2,
      ambiguityStrategy: 'AVERAGE',
    },
    {
      id: 'resolve-ambiguity-05-n250',
      sequenceCount: 250,
      sequenceLength: 1200,
      profile: 'gradient',
      ambiguityRate: 0.05,
      candidateTarget: 0.2,
      ambiguityStrategy: 'RESOLVE',
    },
    {
      id: 'nonfinite-10-n250',
      sequenceCount: 250,
      sequenceLength: 1200,
      profile: 'gradient',
      nonFiniteShare: 0.1,
      threshold: TN93_PROGRESSIVE_THRESHOLD,
      ambiguityStrategy: 'AVERAGE',
    },
  ];

  return definitions.map((definition, definitionIndex) => {
    const records = buildFactorTn93Records({
      ...definition,
      ambiguityRate: definition.ambiguityRate || 0,
      nonFiniteShare: definition.nonFiniteShare || 0,
      seed: 0x544f0000 + definitionIndex,
    });
    const threshold = definition.threshold ?? thresholdForTn93CandidateRatio(
      records,
      definition.ambiguityStrategy,
      0.15,
      definition.candidateTarget,
    );
    const fileName = `tn93-factor-${definition.id}.fasta`;
    writeTn93Fasta(fileName, records);
    const summary = validateAndSummarizeTn93Fixture({
      fileName,
      records,
      threshold,
      expectedProgressive: definition.id !== 'topology-shell-n500',
      ambiguityStrategy: definition.ambiguityStrategy,
      ambiguityThreshold: 0.15,
    });
    return {
      ...summary,
      id: definition.id,
      factorFamily: definition.id.split('-n')[0],
      ambiguityRate: definition.ambiguityRate || 0,
      nonFiniteShare: definition.nonFiniteShare || 0,
      radialProfile: definition.profile,
      requestedCandidateRatio: definition.candidateTarget ?? null,
    };
  });
}

function buildProgressiveTn93Fixtures() {
  const progressiveFileName = 'tn93-progressive-diverse-180.fasta';
  const fallbackFileName = 'tn93-adaptive-fallback-180.fasta';
  const progressiveRecords = buildProgressiveTn93Records();
  const fallbackRecords = buildFallbackTn93Records();
  const factorFixtures = buildTn93FactorFixtures();
  const scalingFixtures = TN93_PROGRESSIVE_SCALING_COUNTS.map((sequenceCount) => {
    const fileName = `tn93-progressive-scaling-${sequenceCount}.fasta`;
    const records = buildProgressiveTn93ScalingRecords(sequenceCount);
    writeTn93Fasta(fileName, records);
    return validateAndSummarizeTn93Fixture({
      fileName,
      records,
      threshold: TN93_PROGRESSIVE_THRESHOLD,
      expectedProgressive:
        (sequenceCount * (sequenceCount - 1)) / 2
          >= TN93_PROGRESSIVE_MINIMUM_PAIR_COUNT,
    });
  });

  writeTn93Fasta(progressiveFileName, progressiveRecords);
  writeTn93Fasta(fallbackFileName, fallbackRecords);

  const summary = {
    schemaVersion: 1,
    generator: 'scripts/generate-performance-fixtures.js',
    seed: {
      progressive: '0x544e3931',
      adaptiveFallback: '0x544e3932',
    },
    acceptance: {
      minimumRuns: 5,
      progressiveMinimumPairCount: TN93_PROGRESSIVE_MINIMUM_PAIR_COUNT,
      progressiveMaximumCandidateRatio:
        TN93_PROGRESSIVE_MAXIMUM_CANDIDATE_RATIO,
      maximumFallbackP50RegressionRatio: 1.1,
    },
    fixtures: {
      progressive: validateAndSummarizeTn93Fixture({
        fileName: progressiveFileName,
        records: progressiveRecords,
        threshold: TN93_PROGRESSIVE_THRESHOLD,
        expectedProgressive: true,
      }),
      adaptiveFallback: validateAndSummarizeTn93Fixture({
        fileName: fallbackFileName,
        records: fallbackRecords,
        threshold: TN93_PROGRESSIVE_THRESHOLD,
        expectedProgressive: false,
      }),
      scaling: scalingFixtures,
      factors: factorFixtures,
    },
  };

  fs.writeFileSync(
    path.join(outDir, 'tn93-progressive-summary.json'),
    `${JSON.stringify(summary, null, 2)}\n`,
    'utf8',
  );
}

function buildNewickFixture({
  fileName,
  leafPrefix,
  clusterCount,
  leavesPerCluster,
}) {
  const clusters = [];

  for (let clusterIndex = 0; clusterIndex < clusterCount; clusterIndex++) {
    const leaves = [];
    for (let leafIndex = 0; leafIndex < leavesPerCluster; leafIndex++) {
      const globalIndex = clusterIndex * leavesPerCluster + leafIndex + 1;
      const branchLength = leafIndex < leavesPerCluster / 2 ? '0.0010' : '0.0025';
      leaves.push(`${leafPrefix}${String(globalIndex).padStart(4, '0')}:${branchLength}`);
    }
    clusters.push(`(${leaves.join(',')}):0.0500`);
  }

  fs.writeFileSync(path.join(outDir, fileName), `(${clusters.join(',')});\n`, 'utf8');
}

function buildNewickFixtures() {
  buildNewickFixture({
    fileName: 'average-newick-500.nwk',
    leafPrefix: 'NWK',
    clusterCount: 10,
    leavesPerCluster: 50,
  });

  buildNewickFixture({
    fileName: 'large-newick-1000.nwk',
    leafPrefix: 'LNWK',
    clusterCount: 20,
    leavesPerCluster: 50,
  });

  buildNewickFixture({
    fileName: 'stress-newick-2000.nwk',
    leafPrefix: 'SNWK',
    clusterCount: 40,
    leavesPerCluster: 50,
  });
}

ensureDir(outDir);
buildGraphFixtures();
buildSequenceFixtures();
buildProgressiveTn93Fixtures();
buildNewickFixtures();

console.log(`Generated performance fixtures in ${path.relative(process.cwd(), outDir)}`);
