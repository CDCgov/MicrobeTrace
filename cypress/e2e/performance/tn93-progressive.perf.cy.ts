/// <reference types="cypress" />

import {
  collectPerformanceCounts,
  launchPerformanceScenarioToTwoD,
  writePerformanceResult,
  type PerformanceCounts,
  type PerformanceMeasurement,
  type PerformanceScenario,
  type PerfWindow,
} from '../../support/perf-helpers';

/*
 * Opt-in because this acceptance probe intentionally reloads each fixture at
 * least five times. Run with perfMode=1,perfTn93Progressive=1. Supplying
 * perfTn93ExhaustiveBaselineP50Ms and/or perfTn93FallbackBaselineP50Ms turns
 * the recorded before/after ratios into timing gates.
 */
type Tn93FixtureSummary = {
  id?: string;
  factorFamily?: string;
  ambiguityRate?: number;
  nonFiniteShare?: number;
  radialProfile?: string;
  requestedCandidateRatio?: number | null;
  fasta: string;
  nodes: number;
  sequenceLength: number;
  threshold: number;
  ambiguityStrategy: string;
  ambiguityThreshold: number;
  totalPairs: number;
  candidatePairs: number;
  candidateRatio: number;
  deferredPairs: number;
  expectedProgressive: boolean;
  fallbackReason: string | null;
  visibleLinks: number;
  finiteDistances: number;
  distanceFloat32Hash: string;
};

type Tn93FixtureManifest = {
  schemaVersion: number;
  generator: string;
  acceptance: {
    minimumRuns: number;
    progressiveMinimumPairCount: number;
    progressiveMaximumCandidateRatio: number;
    maximumFallbackP50RegressionRatio: number;
  };
  fixtures: {
    progressive: Tn93FixtureSummary;
    adaptiveFallback: Tn93FixtureSummary;
    scaling: Tn93FixtureSummary[];
    factors: Tn93FixtureSummary[];
  };
};

type Tn93RunSample = {
  run: number;
  initialNetworkMs: number;
  fullCompletionMs: number;
  lifecycleToInitialViewMs: number;
  endToEndViewMs: number;
  computeLinksMs: number;
  initialComputedPairs: number;
  candidatePairs: number;
  totalPairs: number;
  candidateRatio: number;
  fallbackReason: string | null;
  finalLinkCount: number;
  finalVisibleLinkCount: number;
  finalDistanceFloat32Hash: string;
  finalFiniteDistances: number;
  correctedBelowThresholdLinks: number | null;
  batchCount: number | null;
  payloadBytes: number | null;
  counts: PerformanceCounts;
  finalPerformance: Record<string, any>;
  measurement: PerformanceMeasurement;
};

type Tn93RunAggregate = {
  samples: Tn93RunSample[];
  initialNetworkP50Ms: number;
  fullCompletionP50Ms: number;
  lifecycleToInitialViewP50Ms: number;
  endToEndViewP50Ms: number;
  computeLinksP50Ms: number;
  baselineP50Ms: number | null;
  baselineRatio: number | null;
};

type Tn93RunMode = 'production' | 'dense-exhaustive';

const describeTn93Perf = Cypress.env('perfMode') && Cypress.env('perfTn93Progressive')
  ? describe
  : describe.skip;
const describeTn93ScalingPerf = Cypress.env('perfMode') && Cypress.env('perfTn93Scaling')
  ? describe
  : describe.skip;
const describeTn93FactorPerf = Cypress.env('perfMode') && Cypress.env('perfTn93Factors')
  ? describe
  : describe.skip;
const scalingSizePoints = [100, 250, 500, 750, 1000];
const configuredScalingSizes = String(Cypress.env('perfTn93ScalingSizes') || '')
  .split(',')
  .map((value) => Number(value.trim()))
  .filter((value) => scalingSizePoints.includes(value));
const selectedScalingSizes = configuredScalingSizes.length > 0
  ? scalingSizePoints.filter((size) => configuredScalingSizes.includes(size))
  : scalingSizePoints;
const requestedRuns = Number(Cypress.env('perfTn93Runs') || 5);
const runCount = Math.max(
  5,
  Number.isFinite(requestedRuns) ? Math.floor(requestedRuns) : 5,
);
const timeoutMs = 300000;

function p50(values: number[]): number {
  const sorted = values
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
  if (sorted.length === 0) {
    throw new Error('Cannot calculate a TN93 p50 without finite samples.');
  }

  const position = (sorted.length - 1) * 0.5;
  const base = Math.floor(position);
  const remainder = position - base;
  const next = sorted[base + 1];
  return next === undefined
    ? sorted[base]
    : sorted[base] + remainder * (next - sorted[base]);
}

function endpointId(endpoint: any): string {
  if (endpoint && typeof endpoint === 'object') {
    return String(
      endpoint._id
      ?? endpoint.id
      ?? endpoint.data?._id
      ?? endpoint.data?.id
      ?? '',
    );
  }
  return String(endpoint);
}

function updateFnv1a(hash: number, value: number): number {
  return Math.imul((hash ^ value) >>> 0, 16777619) >>> 0;
}

function hashFloat32Distances(links: any[]): {
  hash: string;
  finiteDistances: number;
} {
  const floatBuffer = new ArrayBuffer(4);
  const floatView = new DataView(floatBuffer);
  let hash = 2166136261;
  let finiteDistances = 0;
  const records = links.map((link) => {
    const ids = [endpointId(link.source), endpointId(link.target)].sort();
    const distance = Math.fround(Number(link.distance));
    if (Number.isFinite(distance)) finiteDistances++;
    return {
      source: ids[0],
      target: ids[1],
      distance,
    };
  }).sort((left, right) => (
    left.source.localeCompare(right.source)
    || left.target.localeCompare(right.target)
  ));

  records.forEach((record) => {
    `${record.source}\0${record.target}\0`.split('').forEach((character) => {
      hash = updateFnv1a(hash, character.charCodeAt(0));
    });
    floatView.setFloat32(0, record.distance, true);
    for (let byte = 0; byte < 4; byte++) {
      hash = updateFnv1a(hash, floatView.getUint8(byte));
    }
  });

  return {
    hash: hash.toString(16).padStart(8, '0'),
    finiteDistances,
  };
}

function scenarioForFixture(
  id: string,
  title: string,
  fixture: Tn93FixtureSummary,
  manifest: Tn93FixtureManifest,
): PerformanceScenario {
  return {
    id,
    title,
    files: [
      {
        name: fixture.fasta,
        datatype: 'fasta',
      },
    ],
    preLaunch: {
      metric: 'tn93',
      threshold: fixture.threshold,
      defaultView: '2D Network',
    },
    expected: {
      nodes: fixture.nodes,
      sequences: fixture.nodes,
    },
    metadata: {
      fixtureKind: fixture.expectedProgressive
        ? 'deterministic-generated-diverse-tn93'
        : 'deterministic-generated-tn93-adaptive-fallback',
      generator: manifest.generator,
      sequenceLength: fixture.sequenceLength,
      threshold: fixture.threshold,
      expectedCandidatePairs: fixture.candidatePairs,
      expectedCandidateRatio: fixture.candidateRatio,
      expectedTotalPairs: fixture.totalPairs,
      expectedFinalVisibleLinks: fixture.visibleLinks,
      expectedFinalDistanceFloat32Hash: fixture.distanceFloat32Hash,
      repeatedSamples: runCount,
    },
  };
}

function denseExhaustiveFixture(
  fixture: Tn93FixtureSummary,
): Tn93FixtureSummary {
  return {
    ...fixture,
    candidatePairs: fixture.totalPairs,
    candidateRatio: 1,
    deferredPairs: 0,
    expectedProgressive: false,
    fallbackReason: null,
  };
}

function installTn93BenchmarkProbe(
  win: PerfWindow,
  fixture: Tn93FixtureSummary,
  mode: Tn93RunMode,
): void {
  const browserWindow = win as any;
  const commonService = browserWindow.commonService;
  if (!commonService) {
    throw new Error('CommonService is unavailable for TN93 benchmarking.');
  }

  const originalComputeLinks = commonService.computeLinks.bind(commonService);
  applyTn93FixtureSettings(win, fixture);
  commonService.computeLinks = (...args: any[]) => {
    commonService.session.style.widgets['ambiguity-resolution-strategy'] =
      fixture.ambiguityStrategy;
    commonService.session.style.widgets['ambiguity-threshold'] =
      fixture.ambiguityThreshold;
    browserWindow.__tn93BenchmarkComputeStartedAt = win.performance.now();
    return originalComputeLinks(...args);
  };

  if (mode === 'dense-exhaustive') {
    const coordinator = commonService.workerComputeService;
    if (!coordinator?.startTn93DistanceJob) {
      throw new Error('TN93 coordinator is unavailable for the dense baseline.');
    }
    coordinator.startTn93DistanceJob = () => Promise.reject(
      new Error('Benchmark-forced dense exhaustive TN93 path.'),
    );
  }
}

function applyTn93FixtureSettings(
  win: PerfWindow,
  fixture: Tn93FixtureSummary,
): void {
  const commonService = (win as any).commonService;
  commonService.session.style.widgets['ambiguity-resolution-strategy'] =
    fixture.ambiguityStrategy;
  commonService.session.style.widgets['ambiguity-threshold'] =
    fixture.ambiguityThreshold;

  const strategyControl = win.document.querySelector(
    '#ambiguity-resolution-strategy',
  ) as HTMLSelectElement | null;
  if (strategyControl) {
    strategyControl.value = fixture.ambiguityStrategy;
    strategyControl.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const thresholdControl = win.document.querySelector(
    '#ambiguity-threshold',
  ) as HTMLInputElement | null;
  if (thresholdControl) {
    thresholdControl.value = String(fixture.ambiguityThreshold);
    thresholdControl.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function getTn93Status(win: any): Record<string, any> | null {
  return win.commonService?.store?.tn93DistanceStatusValue || null;
}

function getTn93Performance(win: any): Record<string, any> {
  return win.commonService?.session?.meta?.performance || {};
}

function assertPlanningSignals(
  computeLinks: Record<string, any>,
  fixture: Tn93FixtureSummary,
): void {
  expect(computeLinks, 'load.computeLinks telemetry').to.be.an('object');
  expect(computeLinks.pairCount, 'eventual all-pair count').to.equal(fixture.totalPairs);
  expect(computeLinks.candidatePairs, 'exact radial-window candidate count')
    .to.equal(fixture.candidatePairs);
  expect(computeLinks.initialComputedPairs, 'foreground pair count').to.equal(
    fixture.expectedProgressive ? fixture.candidatePairs : fixture.totalPairs,
  );
  expect(computeLinks.candidateRatio, 'radial-window candidate ratio')
    .to.be.closeTo(fixture.candidateRatio, 1e-12);
  expect(Boolean(computeLinks.provisional), 'provisional activation')
    .to.equal(fixture.expectedProgressive);
  expect(computeLinks.fallbackReason || null, 'adaptive fallback reason')
    .to.equal(fixture.fallbackReason);
}

function runTn93Sample(
  scenario: PerformanceScenario,
  fixture: Tn93FixtureSummary,
  run: number,
  mode: Tn93RunMode = 'production',
): Cypress.Chainable<Tn93RunSample> {
  let initialMeasurement: PerformanceMeasurement;
  let lifecycleToInitialViewMs = Number.NaN;

  return launchPerformanceScenarioToTwoD(
    scenario,
    timeoutMs,
    (win) => installTn93BenchmarkProbe(win, fixture, mode),
    (win) => applyTn93FixtureSettings(win, fixture),
  )
    .then((measurement) => {
      initialMeasurement = measurement;
      const computeLinks = (measurement.app.performance as any)?.load?.computeLinks;
      assertPlanningSignals(computeLinks, fixture);

      return cy.window({ timeout: timeoutMs }).then((win: any) => {
        const computeStartedAt = Number(win.__tn93BenchmarkComputeStartedAt);
        expect(computeStartedAt, 'TN93 lifecycle benchmark start').to.be.a('number');
        lifecycleToInitialViewMs = win.performance.now() - computeStartedAt;
      }).then(() => {
        if (!fixture.expectedProgressive) return undefined;
        return cy.window({ timeout: timeoutMs }).should((win: any) => {
          const initialReady = getTn93Performance(win)?.tn93?.initialNetworkReady;
          expect(initialReady, 'TN93 initial-network milestone').to.be.an('object');
          expect(initialReady.durationMs, 'TN93 time-to-initial-network').to.be.a('number');
          expect(initialReady.initialComputedPairs, 'initial milestone pair count')
            .to.equal(fixture.candidatePairs);
        });
      });
    })
    .then(() => cy.window({ timeout: timeoutMs }).should((win: any) => {
      const status = getTn93Status(win);
      const links = win.commonService?.session?.data?.links || [];
      const performance = getTn93Performance(win);

      expect(status, 'TN93 completion status').to.be.an('object');
      expect(status.phase, 'TN93 completion phase').to.equal('complete');
      expect(status.provisional, 'TN93 exactness after completion').to.equal(false);
      expect(status.computedPairs, 'TN93 status computed pair count')
        .to.equal(fixture.totalPairs);
      expect(links.length, 'final materialized pair count').to.equal(fixture.totalPairs);
      if (fixture.expectedProgressive) {
        expect(
          performance?.tn93?.backgroundFullCompletion,
          'TN93 full-completion milestone',
        ).to.be.an('object');
      }
    }))
    .then((win: any) => {
      const performance = getTn93Performance(win);
      const computeLinks = performance?.load?.computeLinks;
      const initialReady = performance?.tn93?.initialNetworkReady;
      const fullCompletion = performance?.tn93?.backgroundFullCompletion;
      const links = win.commonService.session.data.links || [];
      const distanceParity = hashFloat32Distances(links);
      const counts = collectPerformanceCounts(win as PerfWindow);
      const initialNetworkMs = fixture.expectedProgressive
        ? Number(initialReady?.durationMs)
        : Number(initialMeasurement.metrics.totalMeasuredMs);
      const fullCompletionMs = fixture.expectedProgressive
        ? Number(fullCompletion?.durationMs)
        : Number(initialMeasurement.metrics.totalMeasuredMs);

      expect(counts.totalLinks, 'final full-matrix link count').to.equal(fixture.totalPairs);
      expect(counts.visibleLinks, 'final threshold-visible links').to.equal(fixture.visibleLinks);
      expect(distanceParity.finiteDistances, 'final finite TN93 distances')
        .to.equal(fixture.finiteDistances);
      expect(distanceParity.hash, 'final Float32 all-pair distance hash')
        .to.equal(fixture.distanceFloat32Hash);
      expect(initialNetworkMs, 'finite time-to-initial-network').to.be.gte(0);
      expect(fullCompletionMs, 'finite time-to-full-completion').to.be.gte(0);

      return {
        run,
        initialNetworkMs,
        fullCompletionMs,
        lifecycleToInitialViewMs,
        endToEndViewMs: Number(initialMeasurement.metrics.totalMeasuredMs),
        computeLinksMs: Number(computeLinks.durationMs),
        initialComputedPairs: Number(computeLinks.initialComputedPairs),
        candidatePairs: Number(computeLinks.candidatePairs),
        totalPairs: Number(computeLinks.pairCount),
        candidateRatio: Number(computeLinks.candidateRatio),
        fallbackReason: computeLinks.fallbackReason || null,
        finalLinkCount: counts.totalLinks,
        finalVisibleLinkCount: counts.visibleLinks,
        finalDistanceFloat32Hash: distanceParity.hash,
        finalFiniteDistances: distanceParity.finiteDistances,
        correctedBelowThresholdLinks: Number.isFinite(
          Number(fullCompletion?.correctedBelowThresholdLinks),
        )
          ? Number(fullCompletion.correctedBelowThresholdLinks)
          : null,
        batchCount: Number.isFinite(Number(fullCompletion?.batches))
          ? Number(fullCompletion.batches)
          : null,
        payloadBytes: Number.isFinite(Number(fullCompletion?.payloadBytes))
          ? Number(fullCompletion.payloadBytes)
          : null,
        counts,
        finalPerformance: performance,
        measurement: initialMeasurement,
      };
    });
}

function collectTn93Runs(
  scenario: PerformanceScenario,
  fixture: Tn93FixtureSummary,
  baselineEnvironmentKey: string,
  mode: Tn93RunMode = 'production',
): Cypress.Chainable<Tn93RunAggregate> {
  const samples: Tn93RunSample[] = [];
  let chain = cy.wrap(null, { log: false }) as Cypress.Chainable<any>;

  for (let run = 1; run <= runCount; run++) {
    chain = chain
      .then(() => runTn93Sample(scenario, fixture, run, mode))
      .then((sample) => {
        samples.push(sample);
      });
  }

  return chain.then(() => {
    expect(samples.length, 'TN93 repeated performance sample count').to.be.gte(5);
    const initialNetworkP50Ms = p50(samples.map((sample) => sample.initialNetworkMs));
    const fullCompletionP50Ms = p50(samples.map((sample) => sample.fullCompletionMs));
    const lifecycleToInitialViewP50Ms = p50(
      samples.map((sample) => sample.lifecycleToInitialViewMs),
    );
    const endToEndViewP50Ms = p50(samples.map((sample) => sample.endToEndViewMs));
    const computeLinksP50Ms = p50(samples.map((sample) => sample.computeLinksMs));
    const configuredBaseline = Number(Cypress.env(baselineEnvironmentKey));
    const baselineP50Ms = Number.isFinite(configuredBaseline) && configuredBaseline > 0
      ? configuredBaseline
      : null;

    return {
      samples,
      initialNetworkP50Ms,
      fullCompletionP50Ms,
      lifecycleToInitialViewP50Ms,
      endToEndViewP50Ms,
      computeLinksP50Ms,
      baselineP50Ms,
      baselineRatio: baselineP50Ms === null
        ? null
        : initialNetworkP50Ms / baselineP50Ms,
    };
  });
}

function writeTn93Aggregate(
  scenario: PerformanceScenario,
  fixture: Tn93FixtureSummary,
  aggregate: Tn93RunAggregate,
): Cypress.Chainable<{ filePath: string; summaryPath: string; runId: string }> {
  const finalSample = aggregate.samples[aggregate.samples.length - 1];
  const measurement: PerformanceMeasurement = {
    ...finalSample.measurement,
    metrics: {
      ...finalSample.measurement.metrics,
      tn93SampleCount: aggregate.samples.length,
      tn93InitialNetworkP50Ms: aggregate.initialNetworkP50Ms,
      tn93FullCompletionP50Ms: aggregate.fullCompletionP50Ms,
      tn93LifecycleToInitialViewP50Ms: aggregate.lifecycleToInitialViewP50Ms,
      tn93EndToEndViewP50Ms: aggregate.endToEndViewP50Ms,
      tn93ComputeLinksP50Ms: aggregate.computeLinksP50Ms,
      tn93InitialToFullP50Ratio:
        aggregate.initialNetworkP50Ms / aggregate.fullCompletionP50Ms,
      tn93ReferenceBaselineP50Ms: aggregate.baselineP50Ms,
      tn93ReferenceBaselineRatio: aggregate.baselineRatio,
      tn93CandidatePairs: fixture.candidatePairs,
      tn93CandidateRatio: fixture.candidateRatio,
      tn93TotalPairs: fixture.totalPairs,
    },
    counts: finalSample.counts,
    app: {
      ...finalSample.measurement.app,
      performance: finalSample.finalPerformance,
      tn93ProgressiveAcceptance: {
        minimumRuns: 5,
        samples: aggregate.samples.map((sample) => ({
          run: sample.run,
          initialNetworkMs: sample.initialNetworkMs,
          fullCompletionMs: sample.fullCompletionMs,
          lifecycleToInitialViewMs: sample.lifecycleToInitialViewMs,
          endToEndViewMs: sample.endToEndViewMs,
          computeLinksMs: sample.computeLinksMs,
          initialComputedPairs: sample.initialComputedPairs,
          candidatePairs: sample.candidatePairs,
          totalPairs: sample.totalPairs,
          candidateRatio: sample.candidateRatio,
          fallbackReason: sample.fallbackReason,
          finalLinkCount: sample.finalLinkCount,
          finalVisibleLinkCount: sample.finalVisibleLinkCount,
          finalDistanceFloat32Hash: sample.finalDistanceFloat32Hash,
          finalFiniteDistances: sample.finalFiniteDistances,
          correctedBelowThresholdLinks: sample.correctedBelowThresholdLinks,
          batchCount: sample.batchCount,
          payloadBytes: sample.payloadBytes,
        })),
        p50: {
          initialNetworkMs: aggregate.initialNetworkP50Ms,
          fullCompletionMs: aggregate.fullCompletionP50Ms,
          lifecycleToInitialViewMs: aggregate.lifecycleToInitialViewP50Ms,
          endToEndViewMs: aggregate.endToEndViewP50Ms,
          computeLinksMs: aggregate.computeLinksP50Ms,
          referenceBaselineMs: aggregate.baselineP50Ms,
          referenceBaselineRatio: aggregate.baselineRatio,
        },
      },
    } as any,
  };

  return writePerformanceResult(scenario, measurement);
}

describeTn93Perf('Performance Acceptance - progressive TN93 consensus window', () => {
  let manifest: Tn93FixtureManifest;

  before(() => {
    cy.fixture('performance/tn93-progressive-summary.json').then((loaded) => {
      manifest = loaded as Tn93FixtureManifest;
      expect(manifest.schemaVersion, 'TN93 fixture schema').to.equal(1);
      expect(runCount, 'configured TN93 sample count')
        .to.be.gte(manifest.acceptance.minimumRuns);
    });
  });

  it('records five-run p50 time-to-initial-network and exact final parity', () => {
    const fixture = manifest.fixtures.progressive;
    const scenario = scenarioForFixture(
      'tn93-progressive-diverse-180',
      'Progressive TN93 diverse FASTA: 180 aligned sequences',
      fixture,
      manifest,
    );

    expect(fixture.totalPairs, 'activation fixture dyads')
      .to.be.gte(manifest.acceptance.progressiveMinimumPairCount);
    expect(fixture.candidateRatio, 'activation fixture candidate ratio')
      .to.be.at.most(manifest.acceptance.progressiveMaximumCandidateRatio);

    let progressiveAggregate: Tn93RunAggregate;
    return collectTn93Runs(
      scenario,
      fixture,
      'perfTn93ExhaustiveBaselineP50Ms',
    ).then((aggregate) => {
      progressiveAggregate = aggregate;
      expect(
        aggregate.initialNetworkP50Ms,
        'p50 provisional network should precede p50 exact completion',
      ).to.be.lessThan(aggregate.fullCompletionP50Ms);
      if (aggregate.baselineP50Ms !== null) {
        expect(
          aggregate.initialNetworkP50Ms,
          'p50 initial network versus exhaustive reference',
        ).to.be.lessThan(aggregate.baselineP50Ms);
      }
      return writeTn93Aggregate(scenario, fixture, aggregate);
    }).then(() => {
      const denseFixture = denseExhaustiveFixture(fixture);
      const denseScenario = scenarioForFixture(
        'tn93-dense-exhaustive-diverse-180',
        'Dense exhaustive TN93 baseline: 180 aligned sequences',
        denseFixture,
        manifest,
      );
      return collectTn93Runs(
        denseScenario,
        denseFixture,
        'perfTn93DenseActivatingBaselineP50Ms',
        'dense-exhaustive',
      ).then((denseAggregate) => {
        expect(
          progressiveAggregate.lifecycleToInitialViewP50Ms,
          'progressive p50 lifecycle-to-view versus the dense exhaustive path',
        ).to.be.lessThan(denseAggregate.lifecycleToInitialViewP50Ms);
        return writeTn93Aggregate(
          denseScenario,
          denseFixture,
          denseAggregate,
        );
      });
    });
  });

  it('records five-run adaptive-fallback parity without a dense-path regression', () => {
    const fixture = manifest.fixtures.adaptiveFallback;
    const scenario = scenarioForFixture(
      'tn93-adaptive-fallback-180',
      'Adaptive-fallback TN93 FASTA: 180 aligned sequences',
      fixture,
      manifest,
    );

    expect(fixture.candidateRatio, 'adaptive-fallback fixture candidate ratio')
      .to.be.greaterThan(manifest.acceptance.progressiveMaximumCandidateRatio);
    expect(fixture.fallbackReason, 'adaptive-fallback fixture reason')
      .to.equal('candidate-ratio-too-high');

    let fallbackAggregate: Tn93RunAggregate;
    return collectTn93Runs(
      scenario,
      fixture,
      'perfTn93FallbackBaselineP50Ms',
    ).then((aggregate) => {
      fallbackAggregate = aggregate;
      if (aggregate.baselineRatio !== null) {
        expect(
          aggregate.baselineRatio,
          'adaptive-fallback p50 regression ratio',
        ).to.be.at.most(
          manifest.acceptance.maximumFallbackP50RegressionRatio,
        );
      }
      return writeTn93Aggregate(scenario, fixture, aggregate);
    }).then(() => {
      const denseFixture = denseExhaustiveFixture(fixture);
      const denseScenario = scenarioForFixture(
        'tn93-dense-exhaustive-fallback-180',
        'Dense exhaustive TN93 fallback baseline: 180 aligned sequences',
        denseFixture,
        manifest,
      );
      return collectTn93Runs(
        denseScenario,
        denseFixture,
        'perfTn93DenseFallbackBaselineP50Ms',
        'dense-exhaustive',
      ).then((denseAggregate) => {
        const regressionRatio = fallbackAggregate.lifecycleToInitialViewP50Ms
          / denseAggregate.lifecycleToInitialViewP50Ms;
        expect(
          regressionRatio,
          'adaptive-fallback lifecycle-to-view p50 regression ratio',
        ).to.be.at.most(
          manifest.acceptance.maximumFallbackP50RegressionRatio,
        );
        return writeTn93Aggregate(
          denseScenario,
          denseFixture,
          denseAggregate,
        );
      });
    });
  });
});

describeTn93ScalingPerf('Performance Characterization - progressive TN93 scaling', () => {
  let manifest: Tn93FixtureManifest;

  before(() => {
    cy.fixture('performance/tn93-progressive-summary.json').then((loaded) => {
      manifest = loaded as Tn93FixtureManifest;
      expect(manifest.schemaVersion, 'TN93 fixture schema').to.equal(1);
      expect(manifest.fixtures.scaling, 'TN93 scaling fixtures')
        .to.have.length(scalingSizePoints.length);
      expect(runCount, 'configured TN93 sample count')
        .to.be.gte(manifest.acceptance.minimumRuns);
    });
  });

  selectedScalingSizes.forEach((sequenceCount) => {
    it(`compares progressive and dense TN93 at ${sequenceCount} sequences`, () => {
      const fixture = manifest.fixtures.scaling.find(
        (candidate) => candidate.nodes === sequenceCount,
      );
      expect(fixture, `TN93 ${sequenceCount}-sequence fixture`).to.be.an('object');
      if (!fixture) {
        throw new Error(`Missing TN93 scaling fixture for ${sequenceCount} sequences.`);
      }

      const productionScenario = scenarioForFixture(
        `tn93-scaling-production-${sequenceCount}`,
        `Production TN93 scaling: ${sequenceCount} aligned sequences`,
        fixture,
        manifest,
      );
      let productionAggregate: Tn93RunAggregate;

      return collectTn93Runs(
        productionScenario,
        fixture,
        `perfTn93ScalingProduction${sequenceCount}BaselineP50Ms`,
      ).then((aggregate) => {
        productionAggregate = aggregate;
        return writeTn93Aggregate(productionScenario, fixture, aggregate);
      }).then(() => {
        const denseFixture = denseExhaustiveFixture(fixture);
        const denseScenario = scenarioForFixture(
          `tn93-scaling-dense-${sequenceCount}`,
          `Dense exhaustive TN93 scaling: ${sequenceCount} aligned sequences`,
          denseFixture,
          manifest,
        );

        return collectTn93Runs(
          denseScenario,
          denseFixture,
          `perfTn93ScalingDense${sequenceCount}BaselineP50Ms`,
          'dense-exhaustive',
        ).then((denseAggregate) => {
          const productionHashes = new Set(
            productionAggregate.samples.map(
              (sample) => sample.finalDistanceFloat32Hash,
            ),
          );
          const denseHashes = new Set(
            denseAggregate.samples.map(
              (sample) => sample.finalDistanceFloat32Hash,
            ),
          );
          expect(
            [...productionHashes],
            `${sequenceCount}-sequence production parity hashes`,
          ).to.deep.equal([fixture.distanceFloat32Hash]);
          expect(
            [...denseHashes],
            `${sequenceCount}-sequence dense parity hashes`,
          ).to.deep.equal([fixture.distanceFloat32Hash]);

          if (fixture.expectedProgressive) {
            expect(
              productionAggregate.lifecycleToInitialViewP50Ms,
              `${sequenceCount}-sequence progressive lifecycle-to-view p50`,
            ).to.be.lessThan(denseAggregate.lifecycleToInitialViewP50Ms);
          } else {
            expect(
              productionAggregate.lifecycleToInitialViewP50Ms
                / denseAggregate.lifecycleToInitialViewP50Ms,
              `${sequenceCount}-sequence fallback lifecycle regression ratio`,
            ).to.be.at.most(
              manifest.acceptance.maximumFallbackP50RegressionRatio,
            );
          }

          return writeTn93Aggregate(
            denseScenario,
            denseFixture,
            denseAggregate,
          );
        });
      });
    });
  });
});

describeTn93FactorPerf('Performance Characterization - progressive TN93 data factors', () => {
  let manifest: Tn93FixtureManifest;
  const configuredIds = String(Cypress.env('perfTn93FactorIds') || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);

  before(() => {
    cy.fixture('performance/tn93-progressive-summary.json').then((loaded) => {
      manifest = loaded as Tn93FixtureManifest;
      expect(manifest.schemaVersion, 'TN93 fixture schema').to.equal(1);
      expect(manifest.fixtures.factors, 'TN93 factor fixtures')
        .to.have.length.greaterThan(0);
      expect(runCount, 'configured TN93 sample count')
        .to.be.gte(manifest.acceptance.minimumRuns);
    });
  });

  [
    'candidate-05-n500',
    'topology-shell-n500',
    'topology-nested-n500',
    'length-5000-n250',
    'resolve-ambiguity-05-n250',
    'nonfinite-10-n250',
  ].filter(id => configuredIds.length === 0 || configuredIds.includes(id))
    .forEach((factorId) => {
      it(`compares production and dense TN93 for ${factorId}`, () => {
        const fixture = manifest.fixtures.factors.find(
          candidate => candidate.id === factorId,
        );
        expect(fixture, `TN93 factor fixture ${factorId}`).to.be.an('object');
        if (!fixture) {
          throw new Error(`Missing TN93 factor fixture ${factorId}.`);
        }

        const productionScenario = scenarioForFixture(
          `tn93-factor-production-${factorId}`,
          `Production TN93 factor: ${factorId}`,
          fixture,
          manifest,
        );
        let productionAggregate: Tn93RunAggregate;

        return collectTn93Runs(
          productionScenario,
          fixture,
          `perfTn93FactorProduction${factorId}BaselineP50Ms`,
        ).then((aggregate) => {
          productionAggregate = aggregate;
          return writeTn93Aggregate(productionScenario, fixture, aggregate);
        }).then(() => {
          const denseFixture = denseExhaustiveFixture(fixture);
          const denseScenario = scenarioForFixture(
            `tn93-factor-dense-${factorId}`,
            `Dense exhaustive TN93 factor: ${factorId}`,
            denseFixture,
            manifest,
          );
          return collectTn93Runs(
            denseScenario,
            denseFixture,
            `perfTn93FactorDense${factorId}BaselineP50Ms`,
            'dense-exhaustive',
          ).then((denseAggregate) => {
            const productionHash = productionAggregate.samples[0]
              .finalDistanceFloat32Hash;
            const denseHash = denseAggregate.samples[0]
              .finalDistanceFloat32Hash;
            expect(productionHash, `${factorId} production distance hash`)
              .to.equal(fixture.distanceFloat32Hash);
            expect(denseHash, `${factorId} dense distance hash`)
              .to.equal(fixture.distanceFloat32Hash);

            if (fixture.expectedProgressive) {
              expect(
                productionAggregate.lifecycleToInitialViewP50Ms,
                `${factorId} progressive lifecycle-to-view p50`,
              ).to.be.lessThan(denseAggregate.lifecycleToInitialViewP50Ms);
            } else {
              expect(
                productionAggregate.lifecycleToInitialViewP50Ms
                  / denseAggregate.lifecycleToInitialViewP50Ms,
                `${factorId} fallback lifecycle regression ratio`,
              ).to.be.at.most(
                manifest.acceptance.maximumFallbackP50RegressionRatio,
              );
            }

            return writeTn93Aggregate(
              denseScenario,
              denseFixture,
              denseAggregate,
            );
          });
        });
      });
    });
});
