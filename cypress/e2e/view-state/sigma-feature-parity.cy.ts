/// <reference types="cypress" />

import { assertTwoDNetworkSummary, assertTwoDRendererReady } from '../../support/twod-renderer-harness';
import { visitAppAndAcceptEula, waitForProcessingDialogToClear } from '../../support/journey-helpers';

const loadSampleDataset = (): void => {
  cy.contains('button', 'Continue with Sample Dataset', { timeout: 15000 })
    .should('be.visible')
    .click({ force: true });
  cy.get('#overlay', { timeout: 15000 }).should('not.be.visible');
  assertTwoDNetworkSummary(33, 74);
};

describe('Sigma renderer feature parity', () => {
  it('restores a legacy geographic toggle into the Layout dropdown', () => {
    const path = `${Cypress.config('downloadsFolder')}/legacy-geographic-${Date.now()}.microbetrace`;
    cy.readFile('src/COVID_DummySession.microbetrace').then(saved => {
      const session = typeof saved === 'string' ? JSON.parse(saved) : saved;
      session.style.widgets['network-layout'] = 'order-by-size';
      session.style.widgets['network-geographic-overlay'] = true;
      cy.writeFile(path, session);
    });
    visitAppAndAcceptEula({ extraQuery: { renderer: 'sigma' } });
    cy.get('#fileDropRef').selectFile(path, { force: true });
    waitForProcessingDialogToClear(60000);
    assertTwoDRendererReady('sigma');
    cy.window().its('commonService.session.style.widgets.network-layout').should('equal', 'geographic');
    cy.get('[data-testid="twod-settings-button"]').click();
    cy.contains('.p-dialog-title', '2D Network Settings').parents('.p-dialog').as('networkSettings');
    cy.get('@networkSettings').contains('.nav-link', 'Network').click();
    cy.get('@networkSettings').contains('p-accordion-header', 'Display').click();
    cy.get('@networkSettings').find('#network-layout').should('contain.text', 'Geographic');
    cy.get('@networkSettings').find('#network-geographic-latitude, #network-geographic-longitude').should('be.visible');
    cy.get('@networkSettings').find('#network-geographic-overlay').should('not.exist');
  });

  it('supports grouping, geographic overlays, box selection, and composite export together', () => {
    let groupedAdapter: any;
    let geographicAdapter: any;

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
        node.MigrationLatitude = 25 + (index % 11) * 3.5;
        node.MigrationLongitude = -124 + (index % 11) * 5.5 + Math.floor(index / 11);
        groupById.set(nodeId, group);
      });
      filteredNodes.forEach(node => {
        const nodeId = String(node._id ?? node.id);
        const source = sessionNodes.find(candidate => String(candidate._id ?? candidate.id) === nodeId);
        node.MigrationGroup = groupById.get(nodeId);
        node.MigrationLatitude = source?.MigrationLatitude;
        node.MigrationLongitude = source?.MigrationLongitude;
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
      const twoD = (win as any).commonService.visuals.twoD;
      geographicAdapter = twoD.sigmaRenderer;
      twoD.widgets['map-field-lat'] = 'MigrationLatitude';
      twoD.widgets['map-field-lon'] = 'MigrationLongitude';
    });

    cy.get('[data-testid="twod-settings-button"]').click();
    cy.contains('.p-dialog-title', '2D Network Settings').parents('.p-dialog').as('networkSettings');
    cy.get('@networkSettings').contains('.nav-link', 'Network').click();
    cy.get('@networkSettings').contains('p-accordion-header', 'Display').click();
    cy.get('@networkSettings').find('#network-layout').click();
    cy.contains('li[role="option"]', /^Geographic$/).click();
    cy.get('@networkSettings').find('#network-layout').should('contain.text', 'Geographic');
    cy.get('@networkSettings').find('#network-geographic-latitude, #network-geographic-longitude').should('be.visible');
    cy.get('@networkSettings').find('#network-geographic-overlay').should('not.exist');
    cy.closeSettingsPane('2D Network Settings');

    cy.window({ timeout: 30000 }).should(win => {
      const twoD = (win as any).commonService.visuals.twoD;
      expect(twoD.widgets['network-layout'], 'saved geographic layout choice').to.equal('geographic');
      expect(twoD.sigmaRenderer, 'geographic render uses a fresh adapter')
        .not.to.equal(geographicAdapter);
      expect(twoD.sigmaSummary.residentNodeCount).to.equal(33);
      expect(twoD.sigmaSummary.residentLinkCount).to.equal(74);
      const graph = twoD.sigmaRenderer.getGraph();
      const validGeographicNodes = graph.nodes().filter((nodeId: string) => (
        graph.getNodeAttribute(nodeId, 'raw')?.raw?.geographicCoordinateValid === true
      ));
      expect(validGeographicNodes, 'geographically positioned nodes').to.have.length(33);
    });
    cy.get('[data-testid="network-geographic-overlay"]')
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
      expect(composite.metadata.geographicOverlayActive).to.equal(true);
      expect(composite.metadata.residentNodeCount).to.equal(33);
      expect(composite.metadata.residentEdgeCount).to.equal(74);
      expect(composite.canvasLayerCount).to.be.greaterThan(0);
      expect(composite.pngDataUrl).to.match(/^data:image\/png/);
    });
  });
});
