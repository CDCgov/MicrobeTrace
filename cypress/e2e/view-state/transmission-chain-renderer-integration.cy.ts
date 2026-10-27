/// <reference types="cypress" />

import {
  assertTwoDNetworkReady,
  goToTransmissionChainView,
  visitAppAndAcceptEula,
} from '../../support/journey-helpers';

const dateField = 'Date of symptom onset Date';

(['sigma', 'cytoscape-canvas'] as const).forEach((renderer) => {
  describe(`Transmission Chain integration with ${renderer}`, () => {
    it('keeps hidden 2D settings and data coordinates unchanged while editing Explorer settings', () => {
      const keys = ['node-label-variable', 'node-label-size', 'node-label-orientation', 'node-radius-variable', 'node-radius-min', 'node-radius-max', 'node-border-width', 'link-length', 'link-directed'];
      let settingsBefore: any;
      let coordinatesBefore: any;
      visitAppAndAcceptEula({ skipDemoSession: false, dismissWelcomeOverlay: true, extraQuery: { renderer } });
      assertTwoDNetworkReady();
      let lastCoordinates = '';
      let coordinatesStableSince = 0;
      cy.window().should((win: any) => {
        const service = win.commonService;
        const coordinates = JSON.stringify(service.session.data.nodeFilteredValues.map((node: any) => [node._id, node.x, node.y]));
        if (coordinates !== lastCoordinates) {
          lastCoordinates = coordinates;
          coordinatesStableSince = Date.now();
        }
        expect(service.session.network.rendering, 'initial 2D render completed').to.equal(false);
        expect(service.visuals.twoD.pendingPartialUpdate, 'queued 2D layout completed').to.equal(false);
        expect(Date.now() - coordinatesStableSince, '2D force layout settled before recording coordinates').to.be.greaterThan(300);
      });
      cy.window().then((win: any) => {
        const service = win.commonService;
        settingsBefore = Object.fromEntries(keys.map(key => [key, service.session.style.widgets[key]]));
        coordinatesBefore = service.session.data.nodeFilteredValues.map((node: any) => [node._id, node.x, node.y]);
      });
      goToTransmissionChainView();
      cy.contains('.p-dialog-title', 'Transmission Chain Explorer Settings').parents('.p-dialog').as('explorerSettings');
      cy.get('@explorerSettings').find('#transmission-chain-date-field').click({ force: true });
      cy.get('.p-select-overlay:visible').last().find('.p-select-option')
        .filter((_index, option) => String(option.textContent || '').trim() === dateField).click({ force: true });
      cy.window().should((win: any) => expect(win.commonService.visuals.transmissionChain.cy.nodes().length).to.be.greaterThan(1));
      cy.window().then((win: any) => {
        const chain = win.commonService.visuals.transmissionChain;
        expect(chain.widgets, 'owned presentation settings').not.to.equal(win.commonService.visuals.twoD.widgets);
        expect(chain.widgets).to.equal(win.commonService.session.style.transmissionChain);
        chain.onNodeLabelVaribleChange('_id');
        chain.setNodeLabelSize(48);
        chain.onNodeLabelOrientationChange('Left');
        chain.widgets['node-radius-min'] = 25;
        chain.widgets['node-radius-max'] = 95;
        chain.onNodeRadiusVariableChange('degree');
        chain.onNodeBorderWidthChange(4);
        chain.onLinkDirectedUndirectedChange('Show');
      });
      cy.window().should((win: any) => {
        const service = win.commonService;
        expect(Object.fromEntries(keys.map(key => [key, service.session.style.widgets[key]])), '2D presentation').to.deep.equal(settingsBefore);
        expect(service.session.data.nodeFilteredValues.map((node: any) => [node._id, node.x, node.y]), 'canonical node coordinates').to.deep.equal(coordinatesBefore);
        const chain = service.visuals.transmissionChain;
        expect(Number(chain.cy.nodes().first().data('fontSize'))).to.equal(48);
        expect(chain.cy.nodes().first().style('text-halign')).to.equal('left');
      });
      cy.get('.lm_tab[title="2D Network"]').click({ force: true });
      assertTwoDNetworkReady();
      cy.window().then((win: any) => {
        const twoD = win.commonService.visuals.twoD;
        twoD.onNodeLabelVaribleChange('None');
        if (twoD.sigmaActive) {
          cy.wrap(null).should(() => twoD.sigmaRenderer.getGraph().forEachNode((_id: string, attrs: any) => expect(attrs.label, 'None produces no display label').to.equal('')));
        } else {
          expect(twoD.cy.nodes().map((node: any) => node.data('label'))).to.satisfy((labels: string[]) => labels.every(label => label === ''));
        }
        expect(win.commonService.visuals.transmissionChain.widgets['node-label-variable']).to.equal('_id');
        expect(win.commonService.visuals.transmissionChain.widgets['node-label-size']).to.equal(48);
      });
    });

    it('renders dated chains independently and preserves the saved network camera', () => {
      let networkViewState: any;

      visitAppAndAcceptEula({
        skipDemoSession: false,
        dismissWelcomeOverlay: true,
        extraQuery: { renderer },
      });
      assertTwoDNetworkReady();
      cy.window().then((win: any) => {
        const twoD = win.commonService.visuals.twoD;
        expect(twoD.sigmaActive, 'regular network renderer').to.equal(renderer === 'sigma');
        const state = twoD.getRendererViewState();
        expect(state, 'regular network camera').to.exist;
        twoD.setRendererViewState({ ...state, centerX: state.centerX + 250 });
        networkViewState = JSON.parse(JSON.stringify(win.commonService.session.meta.rendererViewState));
      });

      goToTransmissionChainView();
      cy.contains('.p-dialog-title', 'Transmission Chain Explorer Settings')
        .should('be.visible')
        .parents('.p-dialog')
        .as('transmissionSettings');
      cy.get('@transmissionSettings').contains('.nav-link', 'Layout').click({ force: true });
      cy.get('@transmissionSettings').find('#transmission-chain-date-field').click({ force: true });
      cy.get('.p-select-overlay:visible').last().find('.p-select-option')
        .filter((_index, option) => String(option.textContent || '').trim() === dateField)
        .click({ force: true });
      cy.get('.timeline-axis-overlay:not(.hidden)').should('exist');
      cy.window().should((win: any) => {
        const chain = win.commonService.visuals.transmissionChain;
        expect(chain.constructor, 'separate Explorer component').not.to.equal(win.commonService.visuals.twoD.constructor);
        expect(chain.cy, 'Explorer uses Cytoscape').to.exist;
        expect(chain.cy.nodes(':visible').length, 'dated chain nodes').to.be.greaterThan(1);
        expect(chain.cy.edges(':visible').first().style('curve-style'), 'chain routing').to.equal('taxi');
      });

      cy.clock();
      cy.window().then((win: any) => {
        const graph = win.commonService.visuals.transmissionChain.cy;
        const before = { ...graph.pan() };
        graph.panBy('x', 40);
        graph.panBy('y', 20);
        expect(graph.pan().x, 'Explorer actually pans horizontally').to.equal(before.x + 40);
        expect(graph.pan().y, 'Explorer actually pans vertically').to.equal(before.y + 20);
      });
      cy.tick(200);
      cy.window().then((win: any) => {
        const saved = win.commonService.session.meta.rendererViewState;
        // Sigma may round coordinates when it normalizes a restored camera.
        expect(saved.centerX, 'saved network camera X').to.be.closeTo(networkViewState.centerX, 0.001);
        expect(saved.centerY, 'saved network camera Y').to.be.closeTo(networkViewState.centerY, 0.001);
        expect(saved.graphUnitsPerPixel, 'saved network camera scale')
          .to.be.closeTo(networkViewState.graphUnitsPerPixel, 0.000001);
        expect(saved.edgeDetailMode, 'saved network link detail').to.equal(networkViewState.edgeDetailMode);
      });
    });
  });
});
