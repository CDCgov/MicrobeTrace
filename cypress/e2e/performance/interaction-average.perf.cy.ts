/// <reference types="cypress" />

import {
  launchPerformanceScenarioToTwoD,
  measureTwoDInteractionResponsiveness,
  writePerformanceResult,
  type PerformanceScenario,
} from '../../support/perf-helpers';

const describePerf = Cypress.env('perfMode') ? describe : describe.skip;

const scenario: PerformanceScenario = {
  id: 'average-graph-2d-interactions',
  title: 'Average generated graph: 2D interaction responsiveness',
  files: [
    {
      name: 'performance/average-graph-nodes.csv',
      datatype: 'node',
      field1: '_id',
    },
    {
      name: 'performance/average-graph-links.csv',
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
    nodes: 1600,
    totalLinks: 3200,
    visibleLinks: 3200,
  },
  metadata: {
    fixtureKind: 'deterministic-generated',
    generator: 'scripts/generate-performance-fixtures.js',
    interactions: ['pan', 'zoom', 'drag-node', 'box-select', 'threshold-change'],
  },
};

describePerf('Performance Baseline - average graph 2D interactions', () => {
  it('records frame gaps for core 2D interactions without enforcing budgets', () => {
    launchPerformanceScenarioToTwoD(scenario, 180000)
      .then((measurement) => measureTwoDInteractionResponsiveness(measurement, {
        dragNodeId: 'P0001',
      }))
      .then((refreshedMeasurement) => writePerformanceResult(scenario, refreshedMeasurement));
  });
});
