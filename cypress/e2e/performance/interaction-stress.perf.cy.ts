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
  id: 'stress-graph-2d-interactions',
  title: 'Stress generated graph: 2D interaction responsiveness',
  files: [
    {
      name: 'performance/stress-graph-nodes.csv',
      datatype: 'node',
      field1: '_id',
    },
    {
      name: 'performance/stress-graph-links.csv',
      datatype: 'link',
      field1: 'source',
      field2: 'target',
      field3: 'distance',
    },
  ],
  preLaunch: {
    metric: 'snps',
    threshold: 16,
    defaultView: '2D Network',
  },
  expected: {
    nodes: 10000,
    totalLinks: 25000,
    visibleLinks: 25000,
  },
  metadata: {
    fixtureKind: 'deterministic-generated',
    generator: 'scripts/generate-performance-fixtures.js',
    tier: 'stress',
    interactions: ['pan', 'zoom', 'drag-node', 'box-select', 'threshold-change'],
  },
};

describeStressPerf('Performance Baseline - stress graph 2D interactions', () => {
  it('records frame gaps for core 2D interactions on the stress graph tier', () => {
    launchPerformanceScenarioToTwoD(scenario, 600000)
      .then((measurement) => measureTwoDInteractionResponsiveness(measurement, {
        dragNodeId: 'SG00001',
        restoreTimeoutMs: 120000,
      }))
      .then((measurement) => writePerformanceResult(scenario, measurement));
  });
});
