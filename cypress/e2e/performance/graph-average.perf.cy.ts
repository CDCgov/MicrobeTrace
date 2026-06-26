/// <reference types="cypress" />

import {
  launchPerformanceScenarioToTwoD,
  writePerformanceResult,
  type PerformanceScenario,
} from '../../support/perf-helpers';

const describePerf = Cypress.env('perfMode') ? describe : describe.skip;

const scenario: PerformanceScenario = {
  id: 'average-graph-1600n-3200l',
  title: 'Average generated graph: 1600 nodes and 3200 links',
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
  },
};

describePerf('Performance Baseline - generated average graph', () => {
  it('records 2D load and render metrics without enforcing timing budgets', () => {
    launchPerformanceScenarioToTwoD(scenario, 180000)
      .then((measurement) => writePerformanceResult(scenario, measurement));
  });
});
