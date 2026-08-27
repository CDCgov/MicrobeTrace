/// <reference types="cypress" />

import {
  collectPerformanceCounts,
  launchPerformanceScenarioToTwoD,
  measureFrameGaps,
  refreshPerformanceMeasurement,
  writePerformanceResult,
  type PerformanceMeasurement,
  type PerformanceScenario,
} from '../../support/perf-helpers';

const describePerf = Cypress.env('perfMode') ? describe : describe.skip;

const scenario: PerformanceScenario = {
  id: 'adaptive-network-dense-newick-500',
  title: 'Adaptive LOD for a dense 500-leaf Newick above the legacy guardrail',
  files: [{
    name: 'performance/dense-newick-500-above-guardrail.nwk',
    datatype: 'newick',
  }],
  preLaunch: {
    metric: 'tn93',
    threshold: 0.006,
    defaultView: '2D Network',
  },
  expected: { nodes: 500 },
  metadata: {
    fixtureKind: 'deterministic-generated',
    generator: 'scripts/generate-performance-fixtures.js',
    qualifyingLinks: 124750,
    legacyDrawingGuardrail: 100000,
  },
};

describePerf('Performance - adaptive network LOD above the legacy guardrail', () => {
  it('records exact, represented, drawn, heap, long-task, zoom, and expansion metrics', () => {
    let measurement: PerformanceMeasurement;

    launchPerformanceScenarioToTwoD(scenario, 180000)
      .then(result => {
        measurement = result;
        const counts = result.counts;
        expect(counts.filteredNodes, 'filtered nodes').to.equal(500);
        expect(counts.filteredLinks, 'filtered links').to.equal(124750);
        expect(counts.representedNodes, 'represented nodes').to.equal(500);
        expect(counts.representedLinks, 'represented links').to.equal(124750);
        expect(counts.drawnNodes, 'drawn node budget').to.be.at.most(200);
        expect(counts.drawnEdges, 'drawn edge budget').to.be.at.most(20000);
        expect(counts.drawnLabels, 'label budget').to.be.at.most(500);
        expect(counts.cytoscapeTotalNodes, 'initial Cytoscape node primitives').to.equal(counts.drawnNodes);
        expect(counts.cytoscapeTotalEdges, 'initial Cytoscape edge primitives').to.equal(counts.drawnEdges);
        return measureFrameGaps('adaptiveZoom', win => {
          const cyInstance = win.cytoscapeInstance;
          cyInstance.zoom(cyInstance.zoom() * 1.5);
          cyInstance.emit('zoom');
        }, 1000);
      })
      .then(metrics => {
        Object.assign(measurement.metrics, metrics);
        return measureFrameGaps('adaptiveExpand', win => {
          const aggregate = win.cytoscapeInstance.nodes('[adaptiveAggregate]').first();
          if (!aggregate?.length) throw new Error('No adaptive aggregate available for expansion');
          (win as any).Cypress.adaptiveNetwork.expandAggregate(aggregate.id());
        }, 1000);
      })
      .then(metrics => {
        Object.assign(measurement.metrics, metrics);
        return refreshPerformanceMeasurement(measurement);
      })
      .then(result => {
        measurement = result;
        return cy.window().then(win => {
          const counts = collectPerformanceCounts(win as any);
          expect(counts.filteredLinks, 'post-interaction filtered links').to.equal(124750);
          expect(counts.representedLinks, 'post-interaction represented links').to.equal(124750);
          expect(counts.drawnNodes, 'post-interaction node budget').to.be.at.most(200);
          expect(counts.drawnEdges, 'post-interaction edge budget').to.be.at.most(20000);
          expect(counts.cytoscapeTotalNodes, 'total Cytoscape nodes match the view')
            .to.equal(counts.drawnNodes);
          expect(counts.cytoscapeTotalEdges, 'total Cytoscape edges match the view')
            .to.equal(counts.drawnEdges);
        });
      })
      .then(() => writePerformanceResult(scenario, measurement));
  });
});
