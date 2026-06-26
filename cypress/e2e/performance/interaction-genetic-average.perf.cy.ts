/// <reference types="cypress" />

import {
  launchPerformanceScenarioToTwoD,
  measureTwoDInteractionResponsiveness,
  writePerformanceResult,
  type PerformanceScenario,
  type TwoDInteractionMeasurementOptions,
} from '../../support/perf-helpers';

const describePerf = Cypress.env('perfMode') ? describe : describe.skip;

const scenarios: Array<{
  scenario: PerformanceScenario;
  timeoutMs: number;
  interactions: TwoDInteractionMeasurementOptions;
}> = [
  {
    scenario: {
      id: 'average-clustered-sequences-120-2d-interactions',
      title: 'Average clustered sequence FASTA: 2D interaction responsiveness',
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
        generator: 'scripts/generate-performance-fixtures.js',
        interactions: ['pan', 'zoom', 'drag-node', 'box-select', 'threshold-change'],
        distancePath: 'generated-fasta-snp',
      },
    },
    timeoutMs: 180000,
    interactions: {
      dragNodeId: 'SEQ0001',
    },
  },
  {
    scenario: {
      id: 'average-newick-500-2d-interactions',
      title: 'Average generated Newick: 2D interaction responsiveness',
      files: [
        {
          name: 'performance/average-newick-500.nwk',
          datatype: 'newick',
        },
      ],
      preLaunch: {
        metric: 'tn93',
        threshold: 0.003,
        defaultView: '2D Network',
      },
      expected: {
        nodes: 500,
        totalLinks: 3000,
        visibleLinks: 3000,
      },
      metadata: {
        fixtureKind: 'deterministic-generated',
        generator: 'scripts/generate-performance-fixtures.js',
        interactions: ['pan', 'zoom', 'drag-node', 'box-select', 'threshold-change'],
        distancePath: 'generated-newick-patristic',
      },
    },
    timeoutMs: 180000,
    interactions: {
      dragNodeId: 'NWK0001',
      thresholdDuringChange: 0.001,
      restoreThreshold: 0.003,
      restoreTimeoutMs: 120000,
    },
  },
];

describePerf('Performance Baseline - average genetic distance 2D interactions', () => {
  scenarios.forEach(({ scenario, timeoutMs, interactions }) => {
    it(`records frame gaps for ${scenario.id}`, () => {
      launchPerformanceScenarioToTwoD(scenario, timeoutMs)
        .then((measurement) => measureTwoDInteractionResponsiveness(measurement, interactions))
        .then((measurement) => writePerformanceResult(scenario, measurement));
    });
  });
});
