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

const describeStressPerf = Cypress.env('perfMode') && Cypress.env('perfStress')
  ? describe
  : describe.skip;

const scenario: PerformanceScenario = {
  id: 'stress-newick-2000',
  title: 'Stress generated Newick: 2000 leaves with clustered patristic distances',
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
    leaves: 2000,
    clusterCount: 40,
    leavesPerCluster: 50,
    thresholdRequery: 0.006,
  },
};

describeStressPerf('Performance Baseline - generated stress Newick patristic worker', () => {
  it('records stress Newick load metrics and verifies cached threshold re-query', () => {
    let measurement: PerformanceMeasurement | null = null;
    let thresholdStart = 0;
    let initialTreeInitCount = 0;

    launchPerformanceScenarioToTwoD(scenario, 600000)
      .then((result) => {
        measurement = result;
      });

    cy.window().then((win: unknown) => {
      const patristic = getPatristicPerformance(win as any) as any;
      expect(patristic?.treeReady?.timings, 'stress patristic tree timings').to.exist;
      expect(patristic?.edgeGeneration?.timings, 'stress patristic edge timings').to.exist;
      expect(patristic.edgeGeneration.timings.emittedEdgeCount, 'stress emitted edge count')
        .to.equal(12000);
      initialTreeInitCount = Number(patristic.treeInitCount || 0);
      thresholdStart = (win as Window).performance.now();
    });

    openGlobalFilteringTab();
    setGlobalLinkThreshold(0.006);
    cy.closeGlobalSettings();
    waitForProcessingDialogToClear(600000);
    assertMetricCount('#numberOfVisibleLinks', 49000, 600000);

    cy.window({ timeout: 600000 }).should((win: unknown) => {
      const patristic = getPatristicPerformance(win as any) as any;
      expect(patristic?.edgeGeneration?.timings, 'stress re-query edge timings').to.exist;
      expect(patristic.edgeGeneration.timings.emittedEdgeCount, 'stress re-query emitted edge count')
        .to.equal(49000);
      expect(Number(patristic.treeInitCount || 0), 'stress tree init count after threshold re-query')
        .to.equal(initialTreeInitCount);
    });

    cy.window().then((win: unknown) => {
      expect(measurement, 'stress measurement').to.exist;
      const perfWindow = win as any;
      const counts = collectPerformanceCounts(perfWindow);
      expect(counts.totalLinks, 'stress post-threshold total links').to.equal(49000);
      expect(counts.visibleLinks, 'stress post-threshold visible links').to.equal(49000);

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
      expect(measurement, 'stress measurement before phylogenetic view').to.exist;
      return appendMeasuredView(
        measurement as PerformanceMeasurement,
        'phylogeneticTree',
        () => goToPhyloTreeView(300000),
      );
    }).then((result) => writePerformanceResult(scenario, result));
  });
});
