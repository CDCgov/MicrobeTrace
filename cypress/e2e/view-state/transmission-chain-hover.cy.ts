/// <reference types="cypress" />

import { goTo2DNetworkView, goToTransmissionChainView, visitAppAndAcceptEula } from '../../support/journey-helpers';

const captureCanvasHover = (view: 'twoD' | 'transmissionChain', selector: string, filename: string): void => {
  const drawFrame = (win: any) => new Cypress.Promise<void>(resolve => {
    const graph = win.commonService.visuals[view].cy;
    graph.one('render', () => resolve());
    graph.forceRender();
  });
  cy.get(selector).should('be.visible');
  cy.window().then(drawFrame);
  cy.window().should((win: any) => expect(win.commonService.visuals[view].cy.nodes('[customIconKey]:backgrounding').length, 'glyph images decoded').to.equal(0));
  cy.window().then(drawFrame);
  cy.window().should((win: any) => expect(win.commonService.visuals[view].cy.nodes('.network-neighbor-dimmed').length, 'hover remains active after redraw').to.be.greaterThan(0));
  // Capture the renderer directly: Cypress UI screenshots can move the pointer
  // and clear the very hover state being inspected.
  cy.window().then((win: any) => {
    const graph = win.commonService.visuals[view].cy;
    const png = graph.png(win.JSON.parse('{"full":false,"scale":2,"bg":"#ffffff"}'));
    cy.writeFile(`${Cypress.config('screenshotsFolder')}/${Cypress.spec.name}/${filename}.png`, png.split(',')[1], 'base64');
  });
};

const configureMixedShapes = (win: any): void => {
  const service = win.commonService;
  const ids = service.session.data.nodes.map((node: any) => String(node._id));
  service.session.style.widgets['node-symbol-variable'] = '_id';
  service.session.style.nodeSymbolsTableKeys['_id'] = ids;
  service.session.style.nodeSymbolsTable['_id'] = ids.map((_id: string, index: number) => ['rectangle', 'flea', 'provider'][index % 3]);
  service.visuals.microbeTrace.SelectedNodeSymbolVariable = '_id';
  service.GlobalSettingsModel.SelectedNodeSymbolVariable = '_id';
  service.visuals.microbeTrace.publishUpdateNodeShapes();
};

const expectOpaqueCustomOutline = (win: any, node: any, fillOpacity: number): void => {
  const image = String(node.style('background-image'));
  const svg = new win.DOMParser().parseFromString(decodeURIComponent(image.slice(image.indexOf(',') + 1)), 'image/svg+xml');
  const outlines = Array.from(svg.querySelectorAll('[stroke]:not([stroke="none"])')) as Element[];
  expect(outlines.length, `${node.data('shapeKey')} silhouette outline`).to.be.greaterThan(0);
  outlines.forEach(element => {
    expect(element.getAttribute('stroke'), 'black silhouette border').to.equal('#000000');
    const width = Number(element.getAttribute('stroke-width'));
    // Glyph paths use a nested SVG with its own padded coordinate system.
    const viewBox = element.closest('svg').getAttribute('viewBox').split(/\s+/).map(Number);
    expect(width, 'visible silhouette border').to.be.greaterThan(0);
    expect(width * node.width() / Math.max(viewBox[2], viewBox[3]), 'same border units as native shapes').to.be.closeTo(Number(node.data('borderWidth')), 0.1);
    expect(Number(element.getAttribute('stroke-opacity') ?? 1), 'opaque silhouette border').to.equal(1);
    expect(Number(element.getAttribute('opacity') ?? 1), 'opaque outline element').to.equal(1);
  });
  const fills = Array.from(svg.querySelectorAll('[fill]:not([fill="none"])')) as Element[];
  expect(fills.length, 'colored glyph fills').to.be.greaterThan(0);
  fills.forEach(element => expect(Number(element.getAttribute('fill-opacity') ?? 1), 'glyph fill opacity').to.be.closeTo(fillOpacity, 0.001));
};

describe('Transmission Chain Explorer neighbor hover', () => {
  beforeEach(() => {
    visitAppAndAcceptEula({ skipDemoSession: false, dismissWelcomeOverlay: true });
    goToTransmissionChainView();
    cy.get('#transmission-chain-date-field').click({ force: true });
    cy.get('.p-select-overlay:visible').last().find('.p-select-option')
      .filter((_index, option) => String(option.textContent || '').trim() === 'Date of symptom onset Date')
      .click({ force: true });
    cy.window().should((win: any) => expect(win.commonService.visuals.transmissionChain.cy.nodes().length).to.be.greaterThan(1));
    cy.closeSettingsPane('Transmission Chain Explorer Settings');
    cy.window().then(configureMixedShapes);
    cy.window().should((win: any) => {
      const shapes = win.commonService.visuals.transmissionChain.cy.nodes().map((node: any) => node.data('shapeKey'));
      expect(shapes).to.include.members(['rectangle', 'flea', 'provider']);
    });
    cy.window().then((win: any) => win.commonService.visuals.transmissionChain.openCenter());
  });

  it('dims unrelated fills and links to 20% while keeping native and custom outlines opaque', () => {
    cy.window().then((win: any) => {
      const graph = win.commonService.visuals.transmissionChain.cy;
      const hovered = graph.nodes().filter((node: any) => {
        const others = graph.nodes().difference(node.closedNeighborhood());
        return node.degree() > 0 && ['rectangle', 'flea', 'provider'].every(shape => others.some((other: any) => other.data('shapeKey') === shape));
      }).first();
      expect(hovered.length, 'node with unrelated native and custom shapes').to.equal(1);
      win.__explorerHoveredNode = hovered.id();
      win.__explorerNormalLinkWidth = parseFloat(hovered.connectedEdges().first().style('width'));
      hovered.emit(win.Object.assign(new win.Object(), { type: 'mouseover', originalEvent: new win.MouseEvent('mousemove') }));
    });
    cy.window().should((win: any) => {
      const graph = win.commonService.visuals.transmissionChain.cy;
      const hovered = graph.getElementById(win.__explorerHoveredNode);
      const unrelated = graph.nodes().difference(hovered.closedNeighborhood());
      unrelated.forEach((node: any) => {
        expect(node.hasClass('network-neighbor-dimmed')).to.equal(true);
        expect(Number(node.style('opacity')), 'node silhouette stays opaque').to.equal(1);
        if (node.data('customIconKey')) expectOpaqueCustomOutline(win, node, 0.2);
        else {
          expect(Number(node.style('background-opacity'))).to.equal(0.2);
          expect(Number(node.style('border-opacity'))).to.equal(1);
          expect(node.style('border-color').replace(/\s/g, ''), 'black native border').to.equal('rgb(0,0,0)');
          expect(parseFloat(node.style('border-width'))).to.be.greaterThan(0);
        }
      });
      hovered.closedNeighborhood().nodes().forEach((node: any) => expect(node.hasClass('network-neighbor-dimmed')).to.equal(false));
      graph.edges().difference(hovered.connectedEdges()).forEach((edge: any) => {
        expect(Number(edge.style('opacity')), 'unrelated links remain visible at 20%').to.equal(0.2);
      });
      hovered.connectedEdges().forEach((edge: any) => {
        expect(Number(edge.style('opacity'))).to.equal(1);
        expect(parseFloat(edge.style('width'))).to.be.greaterThan(win.__explorerNormalLinkWidth);
        expect(Number(edge.style('z-index'))).to.be.greaterThan(Number(graph.edges('.network-neighbor-dimmed').first().style('z-index')));
      });
    });
    captureCanvasHover('transmissionChain', '#transmission-chain-cy', 'explorer-mixed-shape-neighbor-hover');
    cy.window().then((win: any) => win.commonService.visuals.transmissionChain.cy.getElementById(win.__explorerHoveredNode).emit('mouseout'));
    cy.window().should((win: any) => {
      const graph = win.commonService.visuals.transmissionChain.cy;
      expect(graph.elements('.network-neighbor-dimmed, .highlighted').length, 'hover cleared').to.equal(0);
      graph.nodes('[customIconKey]').forEach((node: any) => expectOpaqueCustomOutline(win, node, 1));
    });
    cy.window().then((win: any) => win.commonService.visuals.transmissionChain.cy.edges().first().emit(win.Object.assign(new win.Object(), { type: 'mouseover', originalEvent: new win.MouseEvent('mousemove') })));
    cy.window().should((win: any) => {
      const graph = win.commonService.visuals.transmissionChain.cy;
      expect(graph.edges('.highlighted').length, 'direct link hover has no emphasis').to.equal(0);
    });
  });

  it('describes the loaded graph and weighted mixed-value nodes for screen readers', () => {
    let mixedId = '';
    cy.window().then((win: any) => {
      const service = win.commonService;
      const component = service.visuals.transmissionChain;
      mixedId = component.cy.nodes().first().id();
      for (const node of [...service.session.data.nodes, ...service.session.data.nodeFilteredValues]) {
        if (String(node._id ?? node.id) === mixedId) node.State = 'Texas:3/Florida:1';
      }
      const globalSettings = service.visuals.microbeTrace;
      globalSettings.SelectedColorNodesByVariable = 'State';
      globalSettings.SelectedNodeMixedColorsEnabledVariable = true;
      globalSettings.onColorNodesByChanged();
      component.onFilterDataChange();
    });
    cy.window().should((win: any) => {
      const component = win.commonService.visuals.transmissionChain;
      expect(component.rendererAccessibleFeatureSummary).to.equal(`${component.cy.nodes().length} network nodes; 1 mixed-value nodes`);
      expect(component.rendererAccessibleFeatureItems).to.deep.equal([
        { id: mixedId, description: 'State: Texas 75%, Florida 25%', selected: false },
      ]);
    });
    cy.get('app-transmission-chain-explorer [data-testid="renderer-accessible-feature-summary"]')
      .should('contain.text', 'State: Texas 75%, Florida 25%');
    cy.window().then((win: any) => win.commonService.visuals.transmissionChain.cy.getElementById(mixedId).select());
    cy.window().should((win: any) => expect(win.commonService.visuals.transmissionChain.rendererAccessibleFeatureItems[0].selected).to.equal(true));
  });

  it('keeps guides behind the graph and lets the pointer reach nodes crossed by raised links', () => {
    cy.get('.timeline-grid-overlay').should('have.css', 'pointer-events', 'none');
    cy.get('.timeline-grid-overlay').then($grid => {
      cy.get('#transmission-chain-cy').should($scene => expect(Number($grid.css('z-index'))).to.be.lessThan(Number($scene.css('z-index'))));
    });
    cy.window().then((win: any) => {
      const graph = win.commonService.visuals.transmissionChain.cy;
      const edge = graph.edges().first();
      const target = graph.nodes().difference(edge.connectedNodes()).filter((node: any) => node.data('shapeKey') === 'rectangle' && node.degree() > 0).first();
      expect(target.length, 'node crossed by a link').to.equal(1);
      // A straight, raised link crosses the middle of this unrelated node.
      graph.batch(() => {
        // This hit-testing fixture deliberately bypasses the date-lock event.
        edge.source().silentPosition('x', target.position('x') - 100).silentPosition('y', target.position('y'));
        edge.target().silentPosition('x', target.position('x') + 100).silentPosition('y', target.position('y'));
        edge.style('curve-style', 'straight');
        edge.addClass('highlighted');
      });
      expect(edge.source().position('x')).to.be.lessThan(target.position('x'));
      expect(edge.target().position('x')).to.be.greaterThan(target.position('x'));
      expect(edge.source().position('y')).to.equal(target.position('y'));
      expect(edge.target().position('y')).to.equal(target.position('y'));
      graph.center(target);
      graph.zoom(win.Object.assign(new win.Object(), { level: 2, renderedPosition: target.renderedPosition() }));
      win.__explorerPointerTarget = target.id();
    });
    cy.get('#transmission-chain-cy canvas').last().trigger('mousemove', 5, 5, { force: true, eventConstructor: 'MouseEvent' });
    cy.window().then((win: any) => {
      const node = win.commonService.visuals.transmissionChain.cy.getElementById(win.__explorerPointerTarget);
      const point = node.renderedPosition();
      // Near the edge of the node, rather than just its exact center.
      cy.get('#transmission-chain-cy canvas').last().trigger('mousemove', point.x + node.renderedWidth() * 0.3, point.y, { force: true, eventConstructor: 'MouseEvent' });
    });
    cy.window().should((win: any) => {
      const graph = win.commonService.visuals.transmissionChain.cy;
      const target = graph.getElementById(win.__explorerPointerTarget);
      expect(target.connectedEdges().length).to.be.greaterThan(0);
      expect(target.connectedEdges().every((edge: any) => edge.hasClass('highlighted')), 'pointer reached the node above crossing links').to.equal(true);
    });
    cy.get('#transmission-chain-cy canvas').last().trigger('mousemove', 5, 5, { force: true, eventConstructor: 'MouseEvent' });
    cy.window().should((win: any) => expect(win.commonService.visuals.transmissionChain.cy.edges('.highlighted').length).to.equal(0));
  });
});

describe('2D Cytoscape neighbor hover', () => {
  it('keeps native and custom outlines opaque while unrelated fills fade', () => {
    visitAppAndAcceptEula({ skipDemoSession: false, dismissWelcomeOverlay: true, extraQuery: { renderer: 'cytoscape-canvas' } });
    goTo2DNetworkView();
    cy.window().should((win: any) => expect(win.commonService.session.network.rendering).to.equal(false));
    cy.window().then(configureMixedShapes);
    cy.window().should((win: any) => {
      const graph = win.commonService.visuals.twoD.cy;
      expect(graph.nodes().map((node: any) => node.data('shapeKey'))).to.include.members(['rectangle', 'flea', 'provider']);
    });
    cy.window().then((win: any) => {
      const graph = win.commonService.visuals.twoD.cy;
      const hovered = graph.nodes(':childless').filter((node: any) => node.degree() > 0).first();
      hovered.emit(win.Object.assign(new win.Object(), { type: 'mouseover', originalEvent: new win.MouseEvent('mousemove') }));
    });
    cy.window().should((win: any) => {
      const graph = win.commonService.visuals.twoD.cy;
      const unrelated = graph.nodes('.network-neighbor-dimmed');
      expect(unrelated.length).to.be.greaterThan(0);
      expect(unrelated.filter('[customIconKey]').length, 'unrelated custom glyphs').to.be.greaterThan(0);
      unrelated.forEach((node: any) => {
        if (node.data('customIconKey')) expectOpaqueCustomOutline(win, node, 0.12);
        else {
          expect(Number(node.style('background-opacity'))).to.equal(0.12);
          expect(Number(node.style('border-opacity'))).to.equal(1);
          expect(node.style('border-color').replace(/\s/g, ''), 'black native border').to.equal('rgb(0,0,0)');
        }
      });
    });
    captureCanvasHover('twoD', '#cy', 'cytoscape-mixed-shape-neighbor-hover');
  });
});

describe('2D Sigma neighbor hover', () => {
  it('keeps custom-shape silhouette borders opaque while unrelated fills fade', () => {
    visitAppAndAcceptEula({ skipDemoSession: false, dismissWelcomeOverlay: true, extraQuery: { renderer: 'sigma' } });
    goTo2DNetworkView();
    cy.window().then((win: any) => win.commonService.visuals.twoD.onNodeBorderWidthChange(4));
    cy.window().then(configureMixedShapes);
    cy.window().should((win: any) => {
      const twoD = win.commonService.visuals.twoD;
      expect(twoD.sigmaLoading).to.equal(false);
      const graph = twoD.sigmaRenderer.getGraph();
      expect(graph.nodes().map((id: string) => graph.getNodeAttribute(id, 'shapeKey'))).to.include.members(['rectangle', 'flea', 'provider']);
    });
    cy.get('[data-testid="network-node-feature-overlay"]').should($canvas => {
      expect(Number($canvas.attr('data-loaded-image-count')), 'custom glyph images loaded').to.be.greaterThan(1);
      expect(Number($canvas.attr('data-pending-image-count'))).to.equal(0);
    });
    cy.window().then((win: any) => {
      const adapter = win.commonService.visuals.twoD.sigmaRenderer;
      const graph = adapter.getGraph();
      const hovered = graph.nodes().find((id: string) => graph.degree(id) > 0);
      adapter.handleNodeHover(hovered, new win.MouseEvent('mousemove'));
      const context = adapter.featureLayer.getContext('2d');
      const drawImage = context.drawImage;
      const stroke = context.stroke;
      const fillAlphas: number[] = [];
      const strokeAlphas: number[] = [];
      const strokeWidths: number[] = [];
      // Observe actual canvas drawing, including images and their silhouette paths.
      context.drawImage = function (...args: any[]) { fillAlphas.push(this.globalAlpha); return drawImage.apply(this, args); };
      context.stroke = function (...args: any[]) {
        if (args[0] instanceof win.Path2D) {
          strokeAlphas.push(this.globalAlpha);
          strokeWidths.push(this.lineWidth * Math.abs(this.getTransform().a) / (win.devicePixelRatio || 1));
        }
        return stroke.apply(this, args);
      };
      try {
        adapter.drawNodeFeatures();
        expect(fillAlphas, 'custom glyphs outside the neighborhood are dimmed').to.include(0.12);
        expect(strokeAlphas.length, 'custom silhouette paths drawn').to.be.greaterThan(1);
        expect(strokeAlphas.every(alpha => alpha === 1), 'every silhouette stroke stays opaque').to.equal(true);
        strokeWidths.forEach(width => expect(width, 'same border units as native shapes').to.be.closeTo(4, 0.1));
      } finally {
        context.drawImage = drawImage;
        context.stroke = stroke;
      }
    });
    cy.screenshot('sigma-mixed-shape-neighbor-hover', { capture: 'runner' });
  });
});
