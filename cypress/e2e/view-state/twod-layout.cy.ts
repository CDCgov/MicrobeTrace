/// <reference types="cypress" />

import { Core } from 'cytoscape';
import { ensureTwoDNetworkView, visitAppAndAcceptEula } from '../../support/journey-helpers';
import { byTestId, testIds } from '../../support/selectors';

interface RenderedComponentBand {
  size: number;
  minX: number;
  maxX: number;
}

interface RenderedNodePosition {
  x: number;
  y: number;
}

const getRenderedNodePositions = (cyInstance: Core): Map<string, RenderedNodePosition> => new Map(
  cyInstance.nodes()
    .filter(node => !node.hasClass('parent') && !node.hasClass('hidden') && node.children().length === 0)
    .map(node => [node.id(), { ...node.position() }])
);

const getRenderedComponentBands = (cyInstance: Core): RenderedComponentBand[] => {
  const nodes = cyInstance.nodes().filter((node: any) => (
    !node.hasClass('parent')
    && node.children().length === 0
    && !node.hasClass('hidden')
  ));
  const nodeIds = new Set(nodes.map(node => node.id()));
  const edges = cyInstance.edges().filter((edge: any) => (
    !edge.hasClass('hidden')
    && nodeIds.has(edge.source().id())
    && nodeIds.has(edge.target().id())
  ));

  return nodes.union(edges).components().map((component: any) => {
    const componentNodes = component.nodes();
    const positions = componentNodes.map((node: any) => node.position('x'));
    const size = componentNodes.reduce((count: number, node: any) => {
      const aggregateCount = Number(node.data('totalCount'));
      return count + (
        node.data('isCollapsedAggregate') === true
        && Number.isFinite(aggregateCount)
        && aggregateCount > 0
          ? aggregateCount
          : 1
      );
    }, 0);

    return {
      size,
      minX: Math.min(...positions),
      maxX: Math.max(...positions)
    };
  }).sort((left: RenderedComponentBand, right: RenderedComponentBand) => left.minX - right.minX);
};

describe('2D Network - Cluster Size Layout', () => {
  beforeEach(() => {
    visitAppAndAcceptEula({ skipDemoSession: false, dismissWelcomeOverlay: true });
    ensureTwoDNetworkView();
    cy.get('#cy', { timeout: 15000 }).should('be.visible');
    cy.window({ timeout: 15000 }).should('have.property', 'cytoscapeInstance');
  });

  it('orders connected components into ascending, non-overlapping left-to-right size bands', () => {
    let originalPositions: Map<string, RenderedNodePosition>;

    cy.window().then((win: any) => {
      originalPositions = getRenderedNodePositions(win.cytoscapeInstance as Core);
    });

    cy.get(byTestId(testIds.twodSettingsButton)).click();
    cy.contains('.p-dialog-title', '2D Network Settings')
      .should('be.visible')
      .parents('.p-dialog')
      .as('settingsDialog');

    cy.get('@settingsDialog').contains('.nav-link', 'Network').click();
    cy.get('@settingsDialog').find('.tab-pane.active').contains('p-accordion-panel', 'Display').click();

    cy.window().its('commonService.session.style.widgets.network-layout').should('equal', 'force-directed');
    cy.get('@settingsDialog').find(byTestId(testIds.twodNetworkLayout)).should('contain.text', 'Force directed').click();
    cy.contains('li[role="option"]', 'Order clusters by size').click();
    cy.window().its('commonService.session.style.widgets.network-layout').should('equal', 'order-by-size');
    cy.get('@settingsDialog').find(byTestId(testIds.twodNetworkLayout)).should('contain.text', 'Order clusters by size');

    cy.window().should((win: any) => {
      const bands = getRenderedComponentBands(win.cytoscapeInstance as Core);

      expect(bands.length, 'rendered connected components').to.be.greaterThan(1);
      bands.slice(1).forEach((band, index) => {
        const previousBand = bands[index];
        expect(previousBand.size, 'component sizes increase from left to right').to.be.lessThan(band.size);
        expect(previousBand.maxX, 'component bands do not overlap horizontally').to.be.lessThan(band.minX);
      });
    });

    cy.window().should((win: any) => {
      const orderedPositions = getRenderedNodePositions(win.cytoscapeInstance as Core);
      const movedNodeCount = Array.from(originalPositions.entries()).filter(([nodeId, originalPosition]) => {
        const orderedPosition = orderedPositions.get(nodeId);
        return orderedPosition && Math.hypot(
          orderedPosition.x - originalPosition.x,
          orderedPosition.y - originalPosition.y
        ) > 1;
      }).length;

      expect(movedNodeCount, 'nodes moved into size bands').to.be.greaterThan(0);
    });

    cy.get('@settingsDialog').find(byTestId(testIds.twodNetworkLayout)).click();
    cy.contains('li[role="option"]', 'Force directed').click();
    cy.window().its('commonService.session.style.widgets.network-layout').should('equal', 'force-directed');

    cy.window().should((win: any) => {
      const restoredPositions = getRenderedNodePositions(win.cytoscapeInstance as Core);
      expect(restoredPositions.size, 'restored node count').to.equal(originalPositions.size);
      originalPositions.forEach((originalPosition, nodeId) => {
        const restoredPosition = restoredPositions.get(nodeId);
        expect(restoredPosition, `${nodeId} restored`).to.exist;
        if (!restoredPosition) return;
        expect(restoredPosition.x, `${nodeId} x position`).to.be.closeTo(originalPosition.x, 0.01);
        expect(restoredPosition.y, `${nodeId} y position`).to.be.closeTo(originalPosition.y, 0.01);
      });
    });
  });
});
