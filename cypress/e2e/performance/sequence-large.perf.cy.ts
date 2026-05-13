/// <reference types="cypress" />

import {
  appendMeasuredView,
  launchPerformanceScenarioToTwoD,
  writePerformanceResult,
  type PerformanceScenario,
} from '../../support/perf-helpers';
import { goToAlignmentView } from '../../support/journey-helpers';

const describeLargePerf = Cypress.env('perfMode') && Cypress.env('perfLarge')
  ? describe
  : describe.skip;

const scenario: PerformanceScenario = {
  id: 'large-clustered-sequences-300',
  title: 'Large generated clustered sequence FASTA: 300 aligned sequences',
  files: [
    {
      name: 'performance/large-sequences.fasta',
      datatype: 'fasta',
    },
  ],
  preLaunch: {
    metric: 'snps',
    threshold: 16,
    defaultView: '2D Network',
  },
  expected: {
    nodes: 300,
    totalLinks: 44850,
    visibleLinks: 2850,
    sequences: 300,
  },
  metadata: {
    fixtureKind: 'deterministic-generated-clustered',
    generator: 'scripts/generate-performance-fixtures.js',
    clusterCount: 15,
    samplesPerCluster: 20,
    snpThreshold: 16,
    tier: 'large',
    sequenceLength: 1800,
  },
};

describeLargePerf('Performance Baseline - generated large sequence FASTA', () => {
  it('records sequence load, graph readiness, and Alignment readiness for the large sequence tier', () => {
    launchPerformanceScenarioToTwoD(scenario, 300000)
      .then((measurement) => appendMeasuredView(measurement, 'alignment', goToAlignmentView))
      .then((measurement) => {
        expect(measurement.counts.sequencesWithData, 'Alignment sequence count').to.equal(300);
        return writePerformanceResult(scenario, measurement);
      });
  });
});
