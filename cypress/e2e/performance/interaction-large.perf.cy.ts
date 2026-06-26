/// <reference types="cypress" />

import {
  launchPerformanceScenarioToTwoD,
  measureTwoDInteractionResponsiveness,
  writePerformanceResult,
  type PerformanceScenario,
} from '../../support/perf-helpers';

const describeLargePerf = Cypress.env('perfMode') && Cypress.env('perfLarge')
  ? describe
  : describe.skip;

const scenario: PerformanceScenario = {
  id: 'large-graph-2d-interactions',
  title: 'Large generated graph: 2D interaction responsiveness',
  files: [
    {
      name: 'performance/large-graph-nodes.csv',
      datatype: 'node',
      field1: '_id',
    },
    {
      name: 'performance/large-graph-links.csv',
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
    nodes: 5000,
    totalLinks: 10000,
    visibleLinks: 10000,
  },
  metadata: {
    fixtureKind: 'deterministic-generated',
    generator: 'scripts/generate-performance-fixtures.js',
    tier: 'large',
    interactions: ['pan', 'zoom', 'drag-node', 'box-select', 'threshold-change'],
  },
};

describeLargePerf('Performance Baseline - large graph 2D interactions', () => {
  it('records frame gaps for core 2D interactions on the large graph tier', () => {
    launchPerformanceScenarioToTwoD(scenario, 300000)
      .then((measurement) => measureTwoDInteractionResponsiveness(measurement, {
        dragNodeId: 'LG00001',
      }))
      .then((measurement) => writePerformanceResult(scenario, measurement));
  });
});
