import {
  applyPreLaunchFileSettings,
  ensurePreLaunchProfileSynced,
  launchAndWaitForProcessing,
} from '../../support/journey-helpers';

const loadSampleDataset = (): void => {
  cy.contains('button', 'Continue with Sample Dataset', { timeout: 15000 })
    .should('be.visible')
    .click({ force: true });

  cy.get('#overlay', { timeout: 15000 }).should('not.be.visible');
};

const installMissingWebGl2Stub = (win: Window): void => {
  const originalGetContext = win.HTMLCanvasElement.prototype.getContext;
  (win.HTMLCanvasElement.prototype as any).getContext = function (
    contextId: string,
    ...args: unknown[]
  ) {
    if (contextId === 'webgl2') {
      return null;
    }

    return (originalGetContext as any).call(this, contextId, ...args);
  };
};

describe('Sigma renderer migration', () => {
  it('renders the sample network with Sigma when WebGL2 is available', () => {
    cy.visit('/?skipEula=1');
    loadSampleDataset();

    cy.get('[data-testid="network-renderer-banner"]', { timeout: 20000 })
      .should('be.visible')
      .and('contain.text', 'Sigma WebGL renderer');
    cy.get('[data-testid="sigma-network"]')
      .should('be.visible')
      .find('canvas.sigma-stage')
      .should('exist');
    cy.get('#cy').should('not.exist');
    cy.get('[data-testid="sigma-renderer-summary"]')
      .should('contain.text', '33 nodes')
      .and('contain.text', '74 links resident')
      .and('contain.text', '74 links drawn');
    cy.get('[data-testid="renderer-accessible-feature-summary"]')
      .should('contain.text', '33 network nodes');
    cy.window().then(win => {
      const graph = (win as any).commonService.visuals.twoD.sigmaRenderer.getGraph();
      const nodeShapes = graph.nodes().map((nodeId: string) => graph.getNodeAttribute(nodeId, 'shape'));
      expect(nodeShapes).to.include('circle').and.include('triangle');
    });

    cy.contains('.sigma-detail-controls button', 'Detail')
      .click({ force: true })
      .should('have.class', 'active');
    cy.get('[data-testid="network-renderer-banner"]')
      .should('not.contain.text', 'fallback');
    cy.window().then(async win => {
      const twoD = (win as any).commonService.visuals.twoD;
      const initialState = twoD.getRendererViewState();
      expect(initialState).to.not.equal(null);
      twoD.setRendererViewState({
        centerX: initialState.centerX + 5,
        centerY: initialState.centerY + 5,
        graphUnitsPerPixel: initialState.graphUnitsPerPixel * 1.1,
        edgeDetailMode: 'detail',
      });
      expect((win as any).commonService.session.meta.rendererViewState.edgeDetailMode)
        .to.equal('detail');

      const composite = await twoD.exportRendererComposite(1);
      expect(composite.metadata.renderer).to.equal('sigma');
      expect(composite.metadata.residentNodeCount).to.equal(33);
      expect(composite.metadata.residentEdgeCount).to.equal(74);
      expect(composite.canvasLayerCount).to.be.greaterThan(0);
      expect(composite.pngDataUrl).to.match(/^data:image\/png/);
    });
    cy.get('[data-testid="twod-pin-all-button"]').click({ force: true });
    cy.window().its('commonService.session.network.allPinned').should('equal', true);
    cy.get('[data-testid="twod-recalculate-layout-button"]').should('have.class', 'disabled');
    cy.get('[data-testid="twod-pin-all-button"]').click({ force: true });
    cy.window().its('commonService.session.network.allPinned').should('equal', false);
    cy.get('[data-testid="twod-recalculate-layout-button"]')
      .should('not.have.class', 'disabled')
      .click({ force: true });
    cy.get('[data-testid="sigma-renderer-summary"]', { timeout: 20000 })
      .should('contain.text', '33 nodes')
      .and('contain.text', '74 links resident');
    cy.get('[data-testid="sigma-network"]').focus().trigger('keydown', { key: 'ArrowRight' });
    cy.get('[data-testid="network-renderer-live-status"]').should('contain.text', 'Node 2 of 33');
    cy.get('[data-testid="sigma-network"]').trigger('keydown', { key: 'Enter' });
    cy.window().then(win => {
      const selectedNodes = (win as any).commonService.session.data.nodes
        .filter((node: any) => node.selected === true);
      expect(selectedNodes).to.have.length(1);
    });
    cy.get('[data-testid="sigma-network"]').trigger('keydown', { key: 'Escape' });
    cy.window().then(win => {
      const selectedNodes = (win as any).commonService.session.data.nodes
        .filter((node: any) => node.selected === true);
      expect(selectedNodes).to.have.length(0);
    });
    cy.get('[data-testid="sigma-network"] canvas.sigma-stage').then($canvas => {
      $canvas[0].dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    });
    cy.get('[data-testid="sigma-recovery-status"]', { timeout: 10000 })
      .should('contain.text', 'recovered from a WebGL context loss');
    cy.get('[data-testid="sigma-network"] canvas.sigma-stage').should('exist');
    cy.get('#cy').should('not.exist');
    cy.get('[data-testid="twod-settings-button"]').click({ force: true });
    cy.contains('.p-dialog-title', '2D Network Settings').should('be.visible');
    cy.window().then(win => {
      const twoD = (win as any).commonService.visuals.twoD;
      twoD.SelectedNodeRadiusSizeVariable = 80;
      twoD.onNodeRadiusChange(80);
      twoD.onNodeLabelOrientationChange('Top');
      twoD.widgets['node-symbol-variable'] = 'None';
      twoD.widgets['node-symbol'] = 'house';
      twoD.onNodeBorderWidthChange(4);
      twoD.onLinkWidthChange(3);
      twoD.onLinkDirectedUndirectedChange('Show');
      twoD.onLinkBidirectionalChange('Show');
      twoD.onRendererFeatureFieldChange('node-qc-status-variable', 'Lineage');
    });
    cy.get('[data-testid="sigma-renderer-summary"]', { timeout: 20000 })
      .should('contain.text', '33 nodes');
    cy.window().then(async win => {
      const twoD = (win as any).commonService.visuals.twoD;
      const renderer = twoD.sigmaRenderer;
      const firstNode = renderer.getGraph().nodes()[0];
      const firstEdge = renderer.getGraph().edges()[0];
      const edgeHeads = renderer.getGraph().edges()
        .map((edgeId: string) => renderer.getGraph().getEdgeAttribute(edgeId, 'head'));
      const edgeTails = renderer.getGraph().edges()
        .map((edgeId: string) => renderer.getGraph().getEdgeAttribute(edgeId, 'tail'));
      expect(renderer.getGraph().getNodeAttribute(firstNode, 'size')).to.equal(21);
      expect(renderer.getGraph().getNodeAttribute(firstNode, 'labelPosition')).to.equal('above');
      expect(renderer.getGraph().getNodeAttribute(firstNode, 'borderWidth')).to.equal(4);
      expect(renderer.getGraph().getNodeAttribute(firstNode, 'shape')).to.equal('square');
      expect(renderer.getGraph().getNodeAttribute(firstNode, 'shapeKey')).to.equal('house');
      expect(renderer.getGraph().getNodeAttribute(firstNode, 'iconVectorData')).to.not.equal(null);
      expect(renderer.getGraph().getNodeAttribute(firstNode, 'features').qc).to.not.equal(null);
      expect(renderer.getGraph().getEdgeAttribute(firstEdge, 'size')).to.equal(3);
      expect(edgeHeads.filter((head: string) => head === 'arrow').length).to.be.greaterThan(0);
      expect(edgeTails.filter((tail: string) => tail === 'arrow').length).to.be.greaterThan(0);
      const expectedQcOverlays = (win as any).commonService.session.data.nodes
        .filter((node: any) => String(node.Lineage ?? '').trim().length > 0)
        .length;
      expect((await twoD.exportRendererComposite(1)).metadata.qcOverlayNodeCount)
        .to.equal(expectedQcOverlays);
    });
    cy.window().then(win => {
      const rendererResources = win.performance.getEntriesByType('resource')
        .map(entry => entry.name)
        .filter(name => /cytoscape(?:\.esm|-svg)/i.test(name));
      expect(rendererResources, 'Cytoscape resources on the Sigma path').to.deep.equal([]);
    });
  });

  it('uses the Cytoscape Canvas fallback when WebGL2 is unavailable', () => {
    cy.visit('/?skipEula=1', {
      onBeforeLoad: installMissingWebGl2Stub,
    });
    loadSampleDataset();

    cy.get('[data-testid="network-renderer-banner"]', { timeout: 20000 })
      .should('be.visible')
      .and('contain.text', 'Cytoscape Canvas fallback')
      .and('contain.text', 'WebGL 2 is unavailable');
    cy.get('#cy').should('be.visible');
    cy.get('[data-testid="sigma-network"]').should('not.exist');
    cy.window().then(win => {
      const rendererResources = win.performance.getEntriesByType('resource')
        .map(entry => entry.name)
        .filter(name => /cytoscape(?:\.esm|-svg)/i.test(name));
      expect(rendererResources.length, 'Cytoscape resources on the fallback path')
        .to.be.greaterThan(0);
    });
  });

  it('honors the explicit Cytoscape Canvas compatibility override', () => {
    cy.visit('/?renderer=cytoscape-canvas&skipEula=1');
    loadSampleDataset();

    cy.get('#cy', { timeout: 20000 }).should('be.visible');
    cy.get('[data-testid="sigma-network"]').should('not.exist');
    cy.get('[data-testid="network-renderer-banner"]').should('not.exist');
    cy.window().then(win => {
      expect((win as any).commonService.visuals.twoD.requestedRendererMode)
        .to.equal('cytoscape-canvas');
    });
  });

  it('keeps an unsafe large Canvas fallback in table-only safety mode', () => {
    const files = [{
      name: 'performance/problem_10k.csv',
      datatype: 'node' as const,
      field1: 'Sample Identifier',
      field2: 'None',
    }];
    const profile = {
      id: 'sigma-table-only-fallback-10k',
      title: 'Sigma table-only fallback safety contract',
      tags: ['renderer', 'fallback'],
      files,
      preLaunch: {
        metric: 'snps' as const,
        threshold: 16,
        defaultView: '2D Network' as const,
      },
      expectations: {},
    };

    cy.visit('/?skipEula=1&skipDemoSession=1', {
      onBeforeLoad: installMissingWebGl2Stub,
    });
    cy.loadFiles(files);
    applyPreLaunchFileSettings(profile);
    ensurePreLaunchProfileSynced(profile);
    launchAndWaitForProcessing(120000);

    cy.get('[data-testid="network-canvas-safety-message"]', { timeout: 120000 })
      .should('be.visible')
      .and('contain.text', '10,253-node')
      .and('contain.text', 'available through the data tables');
    cy.get('[data-testid="network-renderer-banner"]')
      .should('contain.text', 'Table-only network safety mode');
    cy.get('#cy').should('not.exist');
    cy.get('[data-testid="sigma-network"]').should('not.exist');
    cy.window().then(win => {
      const appWindow = win as any;
      expect(appWindow.commonService.session.data.nodes).to.have.length(10253);
      expect(appWindow.commonService.visuals.twoD.canvasFallbackSuppressed).to.equal(true);

      const rendererResources = win.performance.getEntriesByType('resource')
        .map(entry => entry.name)
        .filter(name => /cytoscape(?:\.esm|-svg)/i.test(name));
      expect(rendererResources, 'Cytoscape resources in table-only safety mode')
        .to.deep.equal([]);
    });
  });
});
