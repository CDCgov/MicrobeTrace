/// <reference types="cypress" />

const loadSampleDataset = (): void => {
  cy.contains('button', 'Continue with Sample Dataset', { timeout: 15000 })
    .should('be.visible')
    .click({ force: true });
  cy.get('#overlay', { timeout: 15000 }).should('not.be.visible');
  cy.get('[data-testid="sigma-renderer-summary"]', { timeout: 30000 })
    .should('contain.text', '33 nodes')
    .and('contain.text', '74 links resident');
};

describe('Sigma renderer feature parity', () => {
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
      twoD.widgets['network-geographic-overlay'] = true;
      twoD.widgets['map-field-lat'] = 'MigrationLatitude';
      twoD.widgets['map-field-lon'] = 'MigrationLongitude';
      twoD.onRendererGeographicSettingsChange();
    });

    cy.window({ timeout: 30000 }).should(win => {
      const twoD = (win as any).commonService.visuals.twoD;
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
