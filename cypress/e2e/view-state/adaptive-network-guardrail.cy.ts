/// <reference types="cypress" />

import type { DatasetProfile } from '../journeys/datasets/profile';
import {
  assertMetricCount,
  launchProfileToTwoD,
} from '../../support/journey-helpers';

const denseAboveGuardrailProfile: DatasetProfile = {
  id: 'adaptive-network-dense-above-default-guardrail',
  title: 'Dense 500-leaf Newick exceeds the default exact-link drawing guardrail',
  tags: ['newick', 'patristic-worker', 'adaptive-view', 'large'],
  files: [{
    name: 'performance/dense-newick-500-above-guardrail.nwk',
    datatype: 'newick',
  }],
  preLaunch: {
    metric: 'tn93',
    threshold: 0.006,
    defaultView: '2D Network',
  },
  expectations: {},
};

describe('2D adaptive network rendering above the Newick guardrail', () => {
  it('keeps exact full-network statistics while drawing a bounded semantic view', () => {
    launchProfileToTwoD(denseAboveGuardrailProfile);
    assertMetricCount('#numberOfNodes', 500, 120000);
    assertMetricCount('#numberOfVisibleLinks', 124750, 120000);
    assertMetricCount('#numberOfSingletonNodes', 0, 120000);
    assertMetricCount('#numberOfDisjointComponents', 1, 120000);
    cy.get('[data-testid="adaptive-network-view-row"]', { timeout: 120000 }).should('be.visible');

    cy.window({ timeout: 120000 }).should((win: any) => {
      const adaptive = win.commonService.session.meta.adaptiveNetwork;
      const summary = adaptive?.fullGraphSummary;
      const view = adaptive?.lastView;
      const timings = win.commonService.session.meta.performance.patristic.edgeGeneration.timings;
      const cyNodes = win.cytoscapeInstance.nodes();
      const cyEdges = win.cytoscapeInstance.edges();

      expect(summary?.filteredNodeCount, 'exact filtered nodes').to.equal(500);
      expect(summary?.filteredLinkCount, 'exact filtered links').to.equal(124750);
      expect(summary?.singletonCount, 'exact singletons').to.equal(0);
      expect(summary?.componentCount, 'exact components').to.equal(1);
      expect(Array.from(summary?.componentSizes || []), 'exact component sizes').to.deep.equal([500]);
      expect(summary?.degreeHistogram?.[499], 'complete-graph degree distribution').to.equal(500);
      expect(summary?.distanceSummary?.min, 'distance minimum').to.be.closeTo(0.002, 0.00001);
      expect(summary?.distanceSummary?.max, 'distance maximum').to.be.closeTo(0.005, 0.00001);
      expect(summary?.pairScanComplete, 'exact pair scan complete').to.equal(true);
      expect(timings?.matchedEdgeCount, 'worker matched edges').to.equal(124750);
      expect(timings?.pairsProcessed, 'worker processed pairs').to.equal(124750);
      expect(timings?.pairScanComplete, 'worker pair scan complete').to.equal(true);
      expect(timings?.emittedEdgeCount, 'bounded exact edge transfer').to.be.at.most(100001);

      expect(view?.active, 'adaptive view active').to.equal(true);
      expect(view?.representationComplete, 'complete semantic representation').to.equal(true);
      expect(view?.representedNodeCount, 'represented node count').to.equal(500);
      expect(view?.representedLinkCount, 'represented link count').to.equal(124750);
      expect(view?.drawnNodeCount, 'drawn node budget').to.be.at.most(200);
      expect(view?.drawnEdgeCount, 'drawn edge budget').to.be.at.most(20000);
      expect(cyNodes.length, 'Cytoscape node primitives').to.equal(view.drawnNodeCount);
      expect(cyEdges.length, 'Cytoscape edge primitives').to.equal(view.drawnEdgeCount);

      const representedNodes = cyNodes.reduce(
        (sum: number, node: any) => sum + Number(node.data('memberNodeCount') || 1),
        0,
      );
      const representedLinks = cyNodes.reduce(
        (sum: number, node: any) => sum + Number(node.data('internalEdgeCount') || 0),
        cyEdges.reduce(
          (sum: number, edge: any) => sum + Number(edge.data('underlyingEdgeCount') || 1),
          0,
        ),
      );
      expect(representedNodes, 'node representation invariant').to.equal(500);
      expect(representedLinks, 'link representation invariant').to.equal(124750);
    });

    cy.get('[data-testid="adaptive-network-reset-detail"]').click({ force: true });
    cy.window().should((win: any) => {
      expect(win.commonService.session.meta.adaptiveNetwork.lastView.drawnNodeCount).to.be.at.most(50);
    });

    cy.get('#numberOfVisibleLinks').invoke('text').then((beforeZoomText) => {
      cy.window().then((win: any) => {
        const cyInstance = win.cytoscapeInstance;
        cyInstance.zoom(cyInstance.zoom() * 1.5);
        cyInstance.emit('zoom');
      });
      cy.window({ timeout: 30000 }).should((win: any) => {
        const view = win.commonService.session.meta.adaptiveNetwork.lastView;
        expect(view.drawnNodeCount, 'zoom-refined drawn nodes').to.be.greaterThan(50);
        expect(view.drawnNodeCount, 'zoom-refined node budget').to.be.at.most(200);
        expect(view.representedNodeCount, 'zoom-refined represented nodes').to.equal(500);
        expect(view.representedLinkCount, 'zoom-refined represented links').to.equal(124750);
        expect(win.cytoscapeInstance.nodes().length, 'zoom-refined total node primitives')
          .to.equal(view.drawnNodeCount);
        expect(win.cytoscapeInstance.edges().length, 'zoom-refined total edge primitives')
          .to.equal(view.drawnEdgeCount);
      });
      cy.get('#numberOfVisibleLinks').should('have.text', beforeZoomText);
    });

    cy.get('[data-testid="adaptive-network-reset-detail"]').click({ force: true });
    cy.window({ timeout: 30000 }).should((win: any) => {
      expect(win.commonService.session.meta.adaptiveNetwork.lastView.drawnNodeCount).to.be.at.most(50);
    });
    cy.window().then((win: any) => {
      const aggregate = win.cytoscapeInstance.nodes('[adaptiveAggregate]').first();
      expect(aggregate.length, 'expandable aggregate').to.equal(1);
      expect(win.Cypress.adaptiveNetwork.expandAggregate(aggregate.id()), 'expand command').to.equal(true);
    });
    cy.window({ timeout: 30000 }).should((win: any) => {
      const view = win.commonService.session.meta.adaptiveNetwork.lastView;
      expect(view.drawnNodeCount, 'expanded drawn nodes').to.be.greaterThan(50);
      expect(view.representedLinkCount, 'expanded represented links').to.equal(124750);
      expect(view.representationComplete, 'expanded representation').to.equal(true);
      expect(win.cytoscapeInstance.nodes().length, 'expanded total node primitives')
        .to.equal(view.drawnNodeCount);
    });
    assertMetricCount('#numberOfVisibleLinks', 124750, 30000);

    cy.window().then((win: any) => {
      const selectedId = 'DNWK0001';
      [...win.commonService.session.data.nodes, ...win.commonService.session.data.nodeFilteredValues]
        .filter((node: any) => String(node._id ?? node.id) === selectedId)
        .forEach((node: any) => node.selected = true);
      win.$(win.document).trigger('node-selected');
    });
    cy.window({ timeout: 60000 }).should((win: any) => {
      const state = win.commonService.session.meta.adaptiveNetwork;
      const selected = win.cytoscapeInstance.getElementById('DNWK0001');
      expect(state.analyticsStatus, 'focus analytics status').to.equal('ready');
      expect(state.lastView.focusExactNodeCount, 'focus exact count').to.be.greaterThan(0);
      expect(selected.length, 'selected search result primitive').to.equal(1);
      expect(selected.data('adaptiveAggregate'), 'selected search result is exact').not.to.equal(true);
      expect(selected.hasClass('adaptive-aggregate'), 'selected search result has no aggregate styling').to.equal(false);
      expect(state.lastView.representedLinkCount, 'focus represented links').to.equal(124750);
      expect(state.lastView.representationComplete, 'focus representation').to.equal(true);
    });
    assertMetricCount('#numberOfVisibleLinks', 124750, 30000);

    cy.window().then((win: any) => {
      win.commonService.session.data.nodes.forEach((node: any) => node.selected = false);
      win.commonService.session.data.nodeFilteredValues.forEach((node: any, index: number) => {
        node.selected = false;
        if (index < 100) node.visible = false;
      });
      win.$(win.document).trigger('node-visibility');
    });
    assertMetricCount('#numberOfNodes', 400, 60000);
    assertMetricCount('#numberOfVisibleLinks', 79800, 60000);
    cy.window({ timeout: 60000 }).should((win: any) => {
      const state = win.commonService.session.meta.adaptiveNetwork;
      const view = state.lastView;
      expect(state.fullGraphSummary.filteredNodeCount, 'subset exact nodes').to.equal(400);
      expect(state.fullGraphSummary.filteredLinkCount, 'subset exact links').to.equal(79800);
      expect(view.filteredNodeCount, 'subset view nodes').to.equal(400);
      expect(view.filteredLinkCount, 'subset view links').to.equal(79800);
      expect(view.representedNodeCount, 'subset represented nodes').to.equal(400);
      expect(view.representedLinkCount, 'subset represented links').to.equal(79800);
      expect(view.representationComplete, 'subset representation complete').to.equal(true);
      expect(view.drawnNodeCount, 'subset node budget').to.be.at.most(200);
      expect(view.drawnEdgeCount, 'subset edge budget').to.be.at.most(20000);
      expect(win.cytoscapeInstance.nodes().length, 'subset total node primitives')
        .to.equal(view.drawnNodeCount);
      expect(win.cytoscapeInstance.edges().length, 'subset total edge primitives')
        .to.equal(view.drawnEdgeCount);
    });
    cy.window().then((win: any) => win.Cypress.adaptiveNetwork.exportFullData())
      .then((links: any[]) => {
        expect(links, 'full filtered scientific export').to.have.length(79800);
        expect(links.every(link => Number(String(link.source).slice(-4)) > 100), 'export source subset')
          .to.equal(true);
        expect(links.every(link => Number(String(link.target).slice(-4)) > 100), 'export target subset')
          .to.equal(true);
      });
  });
});
