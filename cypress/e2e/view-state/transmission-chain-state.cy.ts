/// <reference types="cypress" />

import { closeDashboardTab } from '../../support/dashboard-helpers';
import {
  goToTransmissionChainView,
  installSaveAsCaptureHook,
  saveSessionFromFileMenu,
  visitAppAndAcceptEula,
  writeCapturedDownloadToDisk,
} from '../../support/journey-helpers';

describe('Transmission Chain Explorer state ownership', () => {
  it('retains its own settings and camera through close/reopen and a saved-session round trip', () => {
    const filename = `cypress_explorer_state_${Date.now()}`;
    const path = `${Cypress.config('downloadsFolder')}/${filename}.microbetrace`;
    let retired: any;
    let twoD: any;
    let expectedCamera: any;
    let expectedCount: number;
    let networkSettings: any;
    visitAppAndAcceptEula({ skipDemoSession: false, dismissWelcomeOverlay: true });
    goToTransmissionChainView();
    cy.get('#transmission-chain-date-field').click({ force: true });
    cy.get('.p-select-overlay:visible').last().find('.p-select-option')
      .filter((_index, option) => String(option.textContent || '').trim() === 'Date of symptom onset Date')
      .click({ force: true });
    cy.closeSettingsPane('Transmission Chain Explorer Settings');
    cy.window().should((win: any) => expect(win.commonService.visuals.transmissionChain.cy.nodes().length).to.be.greaterThan(1));
    cy.window().then((win: any) => {
      const service = win.commonService;
      const chain = service.visuals.transmissionChain;
      twoD = service.visuals.twoD;
      networkSettings = { label: twoD.widgets['node-label-variable'], size: twoD.widgets['node-label-size'], border: twoD.widgets['node-border-width'] };
      chain.onNodeLabelVaribleChange('_id');
      chain.setNodeLabelSize(28);
      chain.onNodeBorderWidthChange(5);
      chain.onLinkLabelVariableChange('source_id');
      chain.setLinkLabelSize(32);
      chain.onTransmissionChainLineStyleChange('Straight');
    });
    cy.window().should((win: any) => {
      const chain = win.commonService.visuals.transmissionChain;
      expect(chain.rendering, 'Explorer style layout completed before moving the camera').to.equal(false);
      expect(chain.renderQueued, 'Explorer has no queued style layout').to.equal(false);
    });
    cy.window().then((win: any) => {
      const chain = win.commonService.visuals.transmissionChain;
      const state = chain.getRendererViewState();
      expectedCamera = { ...state, centerX: state.centerX + 75, graphUnitsPerPixel: state.graphUnitsPerPixel * 1.2 };
      chain.setRendererViewState(expectedCamera);
      expectedCount = chain.cy.nodes().length;
      retired = chain.cy;
    });
    closeDashboardTab('Transmission Chain Explorer');
    cy.window().should((win: any) => {
      expect(retired.destroyed(), 'closed Explorer renderer released').to.equal(true);
      expect(win.commonService.visuals.transmissionChain).to.equal(null);
      expect(win.commonService.visuals.twoD, '2D instance survives Explorer teardown').to.equal(twoD);
      expect(twoD.isRendererReady(), '2D renderer survives Explorer teardown').to.equal(true);
    });
    goToTransmissionChainView();
    const expectOwnedState = (win: any): void => {
      const service = win.commonService;
      const chain = service.visuals.transmissionChain;
      expect(chain.cy.nodes().length).to.equal(expectedCount);
      expect(chain.widgets['node-label-variable']).to.equal('_id');
      expect(chain.widgets['node-label-size']).to.equal(28);
      expect(chain.widgets['node-border-width']).to.equal(5);
      expect(chain.widgets['transmission-chain-line-style']).to.equal('Straight');
      expect(chain.widgets['link-label-size']).to.equal(32);
      chain.cy.edges().forEach((edge: any) => expect(parseFloat(edge.style('font-size')), 'restored link label size').to.equal(32));
      expect({ label: service.session.style.widgets['node-label-variable'], size: service.session.style.widgets['node-label-size'], border: service.session.style.widgets['node-border-width'] }).to.deep.equal(networkSettings);
      const camera = chain.getRendererViewState();
      for (const key of ['centerX', 'centerY', 'graphUnitsPerPixel']) expect(camera[key], `Explorer ${key}`).to.be.closeTo(expectedCamera[key], 0.001);
    };
    cy.window().should(expectOwnedState);
    installSaveAsCaptureHook();
    saveSessionFromFileMenu(filename);
    writeCapturedDownloadToDisk(`${filename}.microbetrace`, path);
    cy.readFile(path, 'utf8').then(text => {
      const saved = JSON.parse(String(text));
      expect(saved.session.style.transmissionChain['node-label-size']).to.equal(28);
      expect(saved.session.style.widgets['node-label-size']).to.equal(networkSettings.size);
    });
    cy.visit('/?skipEula=1&skipDemoSession=1');
    cy.get('#fileDropRef', { timeout: 15000 }).selectFile(path, { force: true });
    cy.window({ timeout: 60000 }).its('commonService.session.network.isFullyLoaded').should('equal', true);
    goToTransmissionChainView();
    cy.window().should(expectOwnedState);
  });
});
