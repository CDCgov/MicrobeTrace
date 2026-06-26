/// <reference types="cypress" />

import {
  launchPerformanceScenarioToTwoD,
  writePerformanceResult,
  type PerformanceScenario,
} from '../../support/perf-helpers';

const describeLargePerf = Cypress.env('perfMode') && Cypress.env('perfLarge')
  ? describe
  : describe.skip;

const scenario: PerformanceScenario = {
  id: 'large-graph-5000n-10000l',
  title: 'Large generated graph: 5000 nodes and 10000 links',
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
  },
};

describeLargePerf('Performance Baseline - generated large graph', () => {
  it('records 2D load and render metrics for the large graph tier', () => {
    launchPerformanceScenarioToTwoD(scenario, 300000)
      .then((measurement) => writePerformanceResult(scenario, measurement));
  });
});
