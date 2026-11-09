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

    cy.get('[data-testid="network-detail-control"]', { timeout: 20000 })
      .should('be.visible')
      .and('contain.text', 'Link detail')
      .and('not.contain.text', 'Sigma')
      .and('not.contain.text', 'WebGL')
      .and('not.contain.text', 'Cytoscape')
      .then($control => {
        // GoldenLayout mounts this component virtually, so the component host
        // receives the exact content bounds instead of nesting under .lm_content.
        const container = $control.closest('twodcomponent')[0];
        expect(container, 'GoldenLayout component bounds').to.exist;
        const controlRect = $control[0].getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const topInset = controlRect.top - containerRect.top;
        const rightInset = containerRect.right - controlRect.right;
        expect(topInset, 'top inset').to.be.closeTo(12, 1);
        expect(rightInset, 'right inset').to.be.closeTo(12, 1);
      });
    cy.get('[data-testid="network-detail-tooltip"]').should('not.be.visible');
    cy.get('[data-testid="network-detail-info"]')
      .focus()
      .should('have.attr', 'aria-label', 'About link detail options');
    cy.get('[data-testid="network-detail-tooltip"]')
      .should('be.visible')
      .and('contain.text', 'Overview')
      .and('contain.text', 'Detailed')
      .and('contain.text', 'All links')
      .and('contain.text', 'not your data, filters, or link totals')
      .and('contain.text', 'based on network size and zoom')
      .and('contain.text', 'stable shortest-link backbone')
      .and('contain.text', 'same selection rules with a higher link allowance')
      .and('contain.text', 'remaining after your filters and Link Threshold')
      .and('contain.text', 'Highlight neighbors')
      .then($tooltip => {
        const container = $tooltip.closest('twodcomponent')[0];
        expect(container, 'GoldenLayout component bounds').to.exist;
        const tooltipRect = $tooltip[0].getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        expect(tooltipRect.right, 'tooltip right edge')
          .to.be.at.most(containerRect.right);
        expect(tooltipRect.left, 'tooltip left edge')
          .to.be.at.least(containerRect.left);
      });
    cy.get('[data-testid="network-detail-info"]').blur();
    cy.get('[data-testid="network-detail-tooltip"]').should('not.be.visible');
    cy.get('[data-testid="sigma-network"]')
      .should('be.visible')
      .find('canvas.sigma-stage')
      .should('exist');
    cy.get('#cy').should('not.exist');
    cy.get('[data-testid="network-render-summary"]')
      .should('be.visible')
      .should('contain.text', '33 nodes')
      .and('contain.text', '74 links shown');
    cy.get('[data-testid="renderer-accessible-feature-summary"]')
      .should('contain.text', '33 network nodes');
    cy.window().then(win => {
      const graph = (win as any).commonService.visuals.twoD.sigmaRenderer.getGraph();
      const nodeShapes = graph.nodes().map((nodeId: string) => graph.getNodeAttribute(nodeId, 'shape'));
      expect(nodeShapes).to.include('circle').and.include('triangle');
    });

    cy.get('[data-testid="network-detail-detailed"]')
      .click({ force: true })
      .should('have.class', 'active')
      .and('have.attr', 'aria-pressed', 'true');
    cy.get('[data-testid="network-detail-control"]')
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
    cy.get('[data-testid="network-render-summary"]', { timeout: 20000 })
      .should('contain.text', '33 nodes')
      .and('contain.text', '74 links shown');
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
    cy.get('[data-testid="network-display-status"]', { timeout: 10000 })
      .should('contain.text', 'Network display restored.')
      .and('not.contain.text', 'WebGL');
    cy.get('[data-testid="sigma-network"] canvas.sigma-stage').should('exist');
    cy.get('#cy').should('not.exist');
    cy.get('[data-testid="twod-settings-button"]').click({ force: true });
    cy.contains('.p-dialog-title', '2D Network Settings').should('be.visible');
    cy.contains('Scientific Overlays').should('not.exist');
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
    });
    cy.get('[data-testid="network-render-summary"]', { timeout: 20000 })
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
      expect(renderer.getGraph().getEdgeAttribute(firstEdge, 'size')).to.equal(3);
      expect(edgeHeads.filter((head: string) => head === 'arrow').length).to.be.greaterThan(0);
      expect(edgeTails.filter((tail: string) => tail === 'arrow').length).to.be.greaterThan(0);
      expect((await twoD.exportRendererComposite(1)).metadata).not.to.have.property('qcOverlayNodeCount');
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

    cy.get('[data-testid="network-detail-control"]').should('not.exist');
    cy.get('#cy').should('be.visible');
    cy.get('#cy').should('have.attr', 'aria-label', 'Network visualization');
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
    cy.get('[data-testid="network-detail-control"]').should('not.exist');
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
    cy.get('[data-testid="network-detail-control"]').should('not.exist');
    cy.get('[data-testid="network-canvas-safety-message"]')
      .should('contain.text', 'Interactive network display unavailable')
      .and('not.contain.text', 'WebGL')
      .and('not.contain.text', 'Sigma')
      .and('not.contain.text', 'Cytoscape');
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
