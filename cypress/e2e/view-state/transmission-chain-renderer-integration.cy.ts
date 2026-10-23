/// <reference types="cypress" />

import {
  assertTwoDNetworkReady,
  goToTransmissionChainView,
  visitAppAndAcceptEula,
} from '../../support/journey-helpers';

const dateField = 'Date of symptom onset Date';

(['sigma', 'cytoscape-canvas'] as const).forEach((renderer) => {
  describe(`Transmission Chain integration with ${renderer}`, () => {
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
      cy.contains('.p-dialog-title', 'Transmission Chain View Settings')
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
        expect(chain.sigmaActive, 'chain uses Cytoscape for date-based layout').to.equal(false);
        expect(chain.cy.nodes(':visible').length, 'dated chain nodes').to.be.greaterThan(1);
        expect(chain.cy.edges(':visible').first().style('curve-style'), 'chain routing').to.equal('taxi');
      });

      cy.clock();
      cy.window().then((win: any) => {
        win.commonService.visuals.transmissionChain.cy.panBy({ x: 40, y: 20 });
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
