/// <reference types="cypress" />

import {
  launchPerformanceScenarioToTwoD,
  measureTwoDInteractionResponsiveness,
  writePerformanceResult,
  type PerformanceScenario,
} from '../../support/perf-helpers';

const describeStressPerf = Cypress.env('perfMode') && Cypress.env('perfStress')
  ? describe
  : describe.skip;

const scenario: PerformanceScenario = {
  id: 'stress-newick-2000-2d-interactions',
  title: 'Stress generated Newick: 2D interaction responsiveness',
  files: [
    {
      name: 'performance/stress-newick-2000.nwk',
      datatype: 'newick',
    },
  ],
  preLaunch: {
    metric: 'tn93',
    threshold: 0.003,
    defaultView: '2D Network',
  },
  expected: {
    nodes: 2000,
    totalLinks: 12000,
    visibleLinks: 12000,
  },
  metadata: {
    fixtureKind: 'deterministic-generated',
    generator: 'scripts/generate-performance-fixtures.js',
    tier: 'stress',
    interactions: ['pan', 'zoom', 'drag-node', 'box-select', 'threshold-change'],
    distancePath: 'generated-newick-patristic',
  },
};

describeStressPerf('Performance Baseline - stress genetic distance 2D interactions', () => {
  it('records frame gaps for stress Newick interactions', () => {
    launchPerformanceScenarioToTwoD(scenario, 600000)
      .then((measurement) => measureTwoDInteractionResponsiveness(measurement, {
        dragNodeId: 'SNWK0001',
        thresholdDuringChange: 0.001,
        restoreThreshold: 0.003,
        restoreTimeoutMs: 300000,
      }))
      .then((measurement) => writePerformanceResult(scenario, measurement));
  });
});
