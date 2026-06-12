/// <reference types="cypress" />

import {
  assertPerformanceTimingEntry,
  launchPerformanceScenarioToTwoD,
  measureStatisticsRefresh,
  writePerformanceResult,
  type PerformanceMeasurement,
  type PerformanceScenario,
} from '../../support/perf-helpers';

const describeStressPerf = Cypress.env('perfMode') && Cypress.env('perfStress')
  ? describe
  : describe.skip;

const scenario: PerformanceScenario = {
  id: 'stress-clustered-sequences-2000',
  title: 'Stress generated clustered sequence FASTA: 2,000 aligned sequences',
  files: [
    {
      name: 'performance/stress-sequences-2000.fasta',
      datatype: 'fasta',
    },
  ],
  preLaunch: {
    metric: 'snps',
    threshold: 16,
    defaultView: '2D Network',
  },
  expected: {
    nodes: 2000,
    totalLinks: 1999000,
    visibleLinks: 49000,
    sequences: 2000,
  },
  metadata: {
    fixtureKind: 'deterministic-generated-clustered',
    generator: 'scripts/generate-performance-fixtures.js',
    clusterCount: 40,
    samplesPerCluster: 50,
    snpThreshold: 16,
    tier: 'stress',
    sequenceLength: 1800,
    distancePath: 'generated-fasta-snp',
    manualOnly: true,
  },
};

function expectNumericTiming(entry: Record<string, any>, field: string, label: string): void {
  expect(entry[field], label).to.be.a('number');
  expect(entry[field], label).to.be.gte(0);
}

function assertFastaAndStatisticsTimings(measurement: PerformanceMeasurement): void {
  const translateToInts = assertPerformanceTimingEntry(measurement, 'sequence', 'translateToInts', [
    'nodes',
    'sequences',
    'sequenceLength',
  ]);
  expect(translateToInts.sequences, 'translateToInts sequence count').to.equal(2000);

  ['computeConsensus', 'computeConsensusDistances', 'computeAmbiguityCounts'].forEach((name) => {
    const entry = assertPerformanceTimingEntry(measurement, 'sequence', name, [
      'workerComputeDurationMs',
      'roundTripDurationMs',
      'responseTransitDurationMs',
    ]);
    expectNumericTiming(entry, 'workerComputeDurationMs', `${name}.workerComputeDurationMs`);
    expectNumericTiming(entry, 'roundTripDurationMs', `${name}.roundTripDurationMs`);
    expectNumericTiming(entry, 'responseTransitDurationMs', `${name}.responseTransitDurationMs`);
  });

  const processTotal = assertPerformanceTimingEntry(measurement, 'sequence', 'processSequenceTotal', [
    'nodes',
    'sequences',
    'sequenceLength',
    'generatedLinks',
  ]);
  expect(processTotal.generatedLinks, 'processSequenceTotal generated links').to.equal(1999000);

  const computeLinks = assertPerformanceTimingEntry(measurement, 'load', 'computeLinks', [
    'pairCount',
    'generatedLinks',
    'workerComputeDurationMs',
    'roundTripDurationMs',
    'responseTransitDurationMs',
    'mergeDurationMs',
    'skippedByGuardrail',
  ]);
  expect(computeLinks.pairCount, 'computeLinks pair count').to.equal(1999000);
  expect(computeLinks.generatedLinks, 'computeLinks generated links').to.equal(1999000);
  expect(computeLinks.skippedByGuardrail, 'computeLinks guardrail state').to.equal(false);
  expectNumericTiming(computeLinks, 'workerComputeDurationMs', 'computeLinks.workerComputeDurationMs');
  expectNumericTiming(computeLinks, 'roundTripDurationMs', 'computeLinks.roundTripDurationMs');
  expectNumericTiming(computeLinks, 'responseTransitDurationMs', 'computeLinks.responseTransitDurationMs');
  expectNumericTiming(computeLinks, 'mergeDurationMs', 'computeLinks.mergeDurationMs');

  const statistics = assertPerformanceTimingEntry(measurement, 'statistics', 'updateStatistics', [
    'visibleNodes',
    'visibleLinks',
    'nodes',
    'links',
    'timelineMode',
  ]);
  expect(statistics.visibleNodes, 'statistics visible nodes').to.equal(2000);
  expect(statistics.visibleLinks, 'statistics visible links').to.equal(49000);
  expect(statistics.links, 'statistics total links').to.equal(1999000);
}

describeStressPerf('Performance Baseline - stress generated sequence FASTA', () => {
  it('records FASTA CPU, merge, rendering, and statistics timings for 2,000 sequences', () => {
    launchPerformanceScenarioToTwoD(scenario, 900000)
      .then((measurement) => measureStatisticsRefresh(measurement))
      .then((measurement) => {
        assertFastaAndStatisticsTimings(measurement);
        return writePerformanceResult(scenario, measurement);
      });
  });
});
