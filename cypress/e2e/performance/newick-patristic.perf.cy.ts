/// <reference types="cypress" />

import {
  appendMeasuredView,
  collectPerformanceCounts,
  getPatristicPerformance,
  launchPerformanceScenarioToTwoD,
  writePerformanceResult,
  type PerformanceMeasurement,
  type PerformanceScenario,
} from '../../support/perf-helpers';
import {
  assertMetricCount,
  goToPhyloTreeView,
  openGlobalFilteringTab,
  setGlobalLinkThreshold,
  waitForProcessingDialogToClear,
} from '../../support/journey-helpers';

const describePerf = Cypress.env('perfMode') ? describe : describe.skip;

const scenario: PerformanceScenario = {
  id: 'average-newick-500',
  title: 'Average generated Newick: 500 leaves with clustered patristic distances',
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
    leaves: 500,
    thresholdRequery: 0.006,
  },
};

describePerf('Performance Baseline - generated Newick patristic worker', () => {
  it('records Newick load metrics and verifies threshold re-query reuses the cached tree', () => {
    let measurement: PerformanceMeasurement | null = null;
    let thresholdStart = 0;
    let initialTreeInitCount = 0;

    launchPerformanceScenarioToTwoD(scenario, 180000)
      .then((result) => {
        measurement = result;
      });

    cy.window().then((win: unknown) => {
      const patristic = getPatristicPerformance(win as any) as any;
      expect(patristic?.treeReady?.timings, 'initial patristic tree timings').to.exist;
      expect(patristic?.edgeGeneration?.timings, 'initial patristic edge timings').to.exist;
      expect(patristic.edgeGeneration.timings.emittedEdgeCount, 'initial emitted edge count').to.equal(3000);
      initialTreeInitCount = Number(patristic.treeInitCount || 0);
      thresholdStart = (win as Window).performance.now();
    });

    openGlobalFilteringTab();
    setGlobalLinkThreshold(0.006);
    cy.closeGlobalSettings();
    waitForProcessingDialogToClear(180000);
    assertMetricCount('#numberOfVisibleLinks', 12250, 180000);

    cy.window({ timeout: 180000 }).should((win: unknown) => {
      const patristic = getPatristicPerformance(win as any) as any;
      expect(patristic?.edgeGeneration?.timings, 'threshold re-query edge timings').to.exist;
      expect(patristic.edgeGeneration.timings.emittedEdgeCount, 'threshold emitted edge count').to.equal(12250);
      expect(Number(patristic.treeInitCount || 0), 'tree init count after threshold re-query')
        .to.equal(initialTreeInitCount);
    });

    cy.window().then((win: unknown) => {
      expect(measurement, 'base measurement').to.exist;
      const perfWindow = win as any;
      const counts = collectPerformanceCounts(perfWindow);
      expect(counts.totalLinks, 'post-threshold total links').to.equal(12250);
      expect(counts.visibleLinks, 'post-threshold visible links').to.equal(12250);

      measurement = {
        ...(measurement as PerformanceMeasurement),
        metrics: {
          ...(measurement as PerformanceMeasurement).metrics,
          thresholdRequeryToVisibleMs: perfWindow.performance.now() - thresholdStart,
        },
        counts,
        app: {
          ...(measurement as PerformanceMeasurement).app,
          patristic: getPatristicPerformance(perfWindow),
        },
      };
    });

    cy.then(() => {
      expect(measurement, 'measurement before phylogenetic view').to.exist;
      return appendMeasuredView(
        measurement as PerformanceMeasurement,
        'phylogeneticTree',
        goToPhyloTreeView,
      );
    }).then((result) => writePerformanceResult(scenario, result));
  });
});
