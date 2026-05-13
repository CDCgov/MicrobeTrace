/// <reference types="cypress" />

import {
  appendMeasuredView,
  getPatristicPerformance,
  launchPerformanceScenarioToTwoD,
  writePerformanceResult,
  type PerformanceScenario,
} from '../../support/perf-helpers';
import { goToPhyloTreeView } from '../../support/journey-helpers';

const describeLargePerf = Cypress.env('perfMode') && Cypress.env('perfLarge')
  ? describe
  : describe.skip;

const scenario: PerformanceScenario = {
  id: 'large-newick-1000',
  title: 'Large generated Newick: 1000 leaves with clustered patristic distances',
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
    leaves: 1000,
  },
};

describeLargePerf('Performance Baseline - generated large Newick patristic worker', () => {
  it('records Newick load and Phylogenetic Tree readiness for the large Newick tier', () => {
    launchPerformanceScenarioToTwoD(scenario, 300000)
      .then((measurement) => appendMeasuredView(measurement, 'phylogeneticTree', goToPhyloTreeView))
      .then((measurement) => {
        return cy.window().then((win: unknown) => {
          const patristic = getPatristicPerformance(win as any) as any;
          expect(patristic?.treeReady?.timings, 'large patristic tree timings').to.exist;
          expect(patristic?.edgeGeneration?.timings, 'large patristic edge timings').to.exist;
          expect(patristic.edgeGeneration.timings.emittedEdgeCount, 'large emitted edge count').to.equal(6000);
          return measurement;
        });
      })
      .then((measurement) => writePerformanceResult(scenario, measurement));
  });
});
