/// <reference types="cypress" />

import {
  launchPerformanceScenarioToTwoD,
  measureTwoDInteractionResponsiveness,
  writePerformanceResult,
  type PerformanceScenario,
  type TwoDInteractionMeasurementOptions,
} from '../../support/perf-helpers';

const describeLargePerf = Cypress.env('perfMode') && Cypress.env('perfLarge')
  ? describe
  : describe.skip;

const scenarios: Array<{
  scenario: PerformanceScenario;
  timeoutMs: number;
  interactions: TwoDInteractionMeasurementOptions;
}> = [
  {
    scenario: {
      id: 'large-clustered-sequences-300-2d-interactions',
      title: 'Large clustered sequence FASTA: 2D interaction responsiveness',
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
        tier: 'large',
        interactions: ['pan', 'zoom', 'drag-node', 'box-select', 'threshold-change'],
        distancePath: 'generated-fasta-snp',
      },
    },
    timeoutMs: 300000,
    interactions: {
      dragNodeId: 'LSEQ0001',
      restoreTimeoutMs: 120000,
    },
  },
  {
    scenario: {
      id: 'large-newick-1000-2d-interactions',
      title: 'Large generated Newick: 2D interaction responsiveness',
      files: [
        {
          name: 'performance/large-newick-1000.nwk',
          datatype: 'newick',
        },
      ],
      preLaunch: {
        metric: 'tn93',
        threshold: 0.003,
        defaultView: '2D Network',
      },
      expected: {
        nodes: 1000,
        totalLinks: 6000,
        visibleLinks: 6000,
      },
      metadata: {
        fixtureKind: 'deterministic-generated',
        generator: 'scripts/generate-performance-fixtures.js',
        tier: 'large',
        interactions: ['pan', 'zoom', 'drag-node', 'box-select', 'threshold-change'],
        distancePath: 'generated-newick-patristic',
      },
    },
    timeoutMs: 300000,
    interactions: {
      dragNodeId: 'LNWK0001',
      thresholdDuringChange: 0.001,
      restoreThreshold: 0.003,
      restoreTimeoutMs: 180000,
    },
  },
];

describeLargePerf('Performance Baseline - large genetic distance 2D interactions', () => {
  scenarios.forEach(({ scenario, timeoutMs, interactions }) => {
    it(`records frame gaps for ${scenario.id}`, () => {
      launchPerformanceScenarioToTwoD(scenario, timeoutMs)
        .then((measurement) => measureTwoDInteractionResponsiveness(measurement, interactions))
        .then((measurement) => writePerformanceResult(scenario, measurement));
    });
  });
});
