/// <reference types="cypress" />

import { assertTwoDNetworkSummary } from '../../support/twod-renderer-harness';

const loadSampleDataset = (): void => {
  cy.contains('button', 'Continue with Sample Dataset', { timeout: 15000 })
    .should('be.visible')
    .click({ force: true });
  cy.get('#overlay', { timeout: 15000 }).should('not.be.visible');
  assertTwoDNetworkSummary(33, 74);
};

describe('Sigma renderer feature parity', () => {
  it('supports grouping, box selection, and composite export together', () => {
    let groupedAdapter: any;

    cy.visit('/?skipEula=1');
    loadSampleDataset();

    cy.window().then(win => {
      const appWindow = win as any;
      const twoD = appWindow.commonService.visuals.twoD;
      const sessionNodes = appWindow.commonService.session.data.nodes as any[];
      const filteredNodes = appWindow.commonService.session.data.nodeFilteredValues as any[];
      const groupById = new Map<string, string>();

      sessionNodes.forEach((node, index) => {
        const nodeId = String(node._id ?? node.id);
        const group = `Migration group ${index % 3 + 1}`;
        node.MigrationGroup = group;
        groupById.set(nodeId, group);
      });
      filteredNodes.forEach(node => {
        const nodeId = String(node._id ?? node.id);
        node.MigrationGroup = groupById.get(nodeId);
      });

      groupedAdapter = twoD.sigmaRenderer;
      twoD.widgets['polygons-foci'] = 'MigrationGroup';
      twoD.polygonsToggle(true);
    });

    cy.window({ timeout: 30000 }).should(win => {
      const twoD = (win as any).commonService.visuals.twoD;
      expect(twoD.sigmaRenderer, 'grouped render uses a fresh adapter').not.to.equal(groupedAdapter);
      expect(twoD.sigmaSummary.groupHullCount, 'Sigma group hull count').to.equal(3);
      const graph = twoD.sigmaRenderer.getGraph();
      const groups = new Set(graph.nodes().map((nodeId: string) => graph.getNodeAttribute(nodeId, 'group')));
      expect([...groups].sort()).to.deep.equal([
        'Migration group 1',
        'Migration group 2',
        'Migration group 3',
      ]);
    });
    cy.get('[data-testid="network-group-hull-overlay"]')
      .should('exist')
      .and('have.attr', 'data-renderer', 'sigma');

    cy.window().then(win => {
      const appWindow = win as any;
      const twoD = appWindow.commonService.visuals.twoD;
      const adapter = twoD.sigmaRenderer;
      const renderer = adapter.getRenderer();
      const container = win.document.querySelector('[data-testid="sigma-network"]') as HTMLElement;
      const bounds = container.getBoundingClientRect();
      const dimensions = renderer.getDimensions();
      const pointerId = 91;

      container.dispatchEvent(new win.PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        shiftKey: true,
        button: 0,
        buttons: 1,
        pointerId,
        clientX: bounds.left + 1,
        clientY: bounds.top + 1,
      }));
      win.document.dispatchEvent(new win.PointerEvent('pointermove', {
        bubbles: true,
        cancelable: true,
        shiftKey: true,
        button: 0,
        buttons: 1,
        pointerId,
        clientX: bounds.left + dimensions.width - 1,
        clientY: bounds.top + dimensions.height - 1,
      }));
      win.document.dispatchEvent(new win.PointerEvent('pointerup', {
        bubbles: true,
        cancelable: true,
        shiftKey: true,
        button: 0,
        pointerId,
        clientX: bounds.left + dimensions.width - 1,
        clientY: bounds.top + dimensions.height - 1,
      }));
    });

    cy.window().then(async win => {
      const appWindow = win as any;
      const twoD = appWindow.commonService.visuals.twoD;
      expect(twoD.sigmaRenderer.getSelectedNodeIds(), 'Sigma box-selected nodes')
        .to.have.length(33);
      expect(
        appWindow.commonService.session.data.nodes.filter((node: any) => node.selected === true),
        'session selection synchronized from Sigma box selection',
      ).to.have.length(33);

      const composite = await twoD.exportRendererComposite(1);
      expect(composite.metadata.renderer).to.equal('sigma');
      expect(composite.metadata.residentNodeCount).to.equal(33);
      expect(composite.metadata.residentEdgeCount).to.equal(74);
      expect(composite.canvasLayerCount).to.be.greaterThan(0);
      expect(composite.pngDataUrl).to.match(/^data:image\/png/);
    });
  });
});
