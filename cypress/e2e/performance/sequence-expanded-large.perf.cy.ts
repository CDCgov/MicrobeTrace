/// <reference types="cypress" />

import {
  assertPerformanceTimingEntry,
  launchPerformanceScenarioToTwoD,
  measureStatisticsRefresh,
  writePerformanceResult,
  type PerformanceMeasurement,
  type PerformanceScenario,
} from '../../support/perf-helpers';

const describeExpandedLargePerf = Cypress.env('perfMode') && Cypress.env('perfLarge')
  ? describe
  : describe.skip;

const scenario: PerformanceScenario = {
  id: 'expanded-large-clustered-sequences-1000',
  title: 'Expanded large generated clustered sequence FASTA: 1,000 aligned sequences',
  files: [
    {
      name: 'performance/expanded-large-sequences-1000.fasta',
      datatype: 'fasta',
    },
  ],
  preLaunch: {
    metric: 'snps',
    threshold: 16,
    defaultView: '2D Network',
  },
  expected: {
    nodes: 1000,
    totalLinks: 499500,
    visibleLinks: 19500,
    sequences: 1000,
  },
  metadata: {
    fixtureKind: 'deterministic-generated-clustered',
    generator: 'scripts/generate-performance-fixtures.js',
    clusterCount: 25,
    samplesPerCluster: 40,
    snpThreshold: 16,
    tier: 'expanded-large',
    sequenceLength: 1800,
    distancePath: 'generated-fasta-snp',
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
  expect(translateToInts.sequences, 'translateToInts sequence count').to.equal(1000);

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
  expect(processTotal.generatedLinks, 'processSequenceTotal generated links').to.equal(499500);

  const computeLinks = assertPerformanceTimingEntry(measurement, 'load', 'computeLinks', [
    'pairCount',
    'generatedLinks',
    'workerComputeDurationMs',
    'roundTripDurationMs',
    'responseTransitDurationMs',
    'mergeDurationMs',
    'skippedByGuardrail',
  ]);
  expect(computeLinks.pairCount, 'computeLinks pair count').to.equal(499500);
  expect(computeLinks.generatedLinks, 'computeLinks generated links').to.equal(499500);
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
  expect(statistics.visibleNodes, 'statistics visible nodes').to.equal(1000);
  expect(statistics.visibleLinks, 'statistics visible links').to.equal(19500);
  expect(statistics.links, 'statistics total links').to.equal(499500);
}

describeExpandedLargePerf('Performance Baseline - expanded large generated sequence FASTA', () => {
  it('records FASTA CPU, merge, rendering, and statistics timings for 1,000 sequences', () => {
    launchPerformanceScenarioToTwoD(scenario, 600000)
      .then((measurement) => measureStatisticsRefresh(measurement))
      .then((measurement) => {
        assertFastaAndStatisticsTimings(measurement);
        return writePerformanceResult(scenario, measurement);
      });
  });
});
