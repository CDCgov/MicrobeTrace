/// <reference types="cypress" />

import {
  appendMeasuredView,
  launchPerformanceScenarioToTwoD,
  writePerformanceResult,
  type PerformanceScenario,
} from '../../support/perf-helpers';
import { goToAlignmentView } from '../../support/journey-helpers';

const describePerf = Cypress.env('perfMode') ? describe : describe.skip;

const scenario: PerformanceScenario = {
  id: 'average-clustered-sequences-120',
  title: 'Average generated clustered sequence FASTA: 120 aligned sequences',
  files: [
    {
      name: 'performance/average-sequences.fasta',
      datatype: 'fasta',
    },
  ],
  preLaunch: {
    metric: 'snps',
    threshold: 16,
    defaultView: '2D Network',
  },
  expected: {
    nodes: 120,
    totalLinks: 7140,
    visibleLinks: 840,
    sequences: 120,
  },
  metadata: {
    fixtureKind: 'deterministic-generated-clustered',
    clusterCount: 8,
    samplesPerCluster: 15,
    snpThreshold: 16,
    sequenceLength: 2400,
    generator: 'scripts/generate-performance-fixtures.js',
  },
};

describePerf('Performance Baseline - generated sequence FASTA', () => {
  it('records sequence load, graph readiness, and Alignment view readiness metrics', () => {
    launchPerformanceScenarioToTwoD(scenario, 180000)
      .then((measurement) => appendMeasuredView(measurement, 'alignment', goToAlignmentView))
      .then((measurement) => {
        expect(measurement.counts.sequencesWithData, 'Alignment sequence count').to.equal(120);
        return writePerformanceResult(scenario, measurement);
      });
  });
});
