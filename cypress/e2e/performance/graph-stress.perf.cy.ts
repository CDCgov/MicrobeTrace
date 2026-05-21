/// <reference types="cypress" />

import {
  launchPerformanceScenarioToTwoD,
  writePerformanceResult,
  type PerformanceScenario,
} from '../../support/perf-helpers';

const describeStressPerf = Cypress.env('perfMode') && Cypress.env('perfStress')
  ? describe
  : describe.skip;

const scenario: PerformanceScenario = {
  id: 'stress-graph-10000n-25000l',
  title: 'Stress generated graph: 10000 nodes and 25000 links',
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
  },
};

describeStressPerf('Performance Baseline - generated stress graph', () => {
  it('records 2D load and render metrics for the stress graph tier', () => {
    launchPerformanceScenarioToTwoD(scenario, 600000)
      .then((measurement) => writePerformanceResult(scenario, measurement));
  });
});
