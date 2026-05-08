/// <reference types="cypress" />

import { visitAppAndAcceptEula, waitForProcessingDialogToClear } from '../../../support/journey-helpers';

const expectedLegacyLayoutViews = ['2D Network', 'Map', 'Table'];

const loadOutbreakNormSession = () => {
  cy.get('body').then(($body) => {
    const uploadSelector = $body.find('#fileDropRef').length ? '#fileDropRef' : '#data-files1';

    cy.get(uploadSelector, { timeout: 15000 })
      .selectFile('src/outbreaknorm.microbetrace', { force: true });
  });

  waitForProcessingDialogToClear(60000);
};

const assertRestoredNodeShapeByNone = () => {
  cy.window().then((win: any) => {
    const home = win.commonService.visuals.microbeTrace;

    expect(win.commonService.session.style.widgets['node-symbol-variable']).to.equal('None');
    expect(win.commonService.session.style.widgets['node-symbol-table-visible']).to.equal('Hide');
    expect(home.SelectedNodeSymbolVariable).to.equal('None');
    expect(home.SelectedNodeShapeTableTypesVariable).to.equal('Hide');
    expect(win.commonService.GlobalSettingsModel.SelectedNodeSymbolVariable).to.equal('None');
    expect(win.commonService.GlobalSettingsModel.SelectedNodeShapeTableTypesVariable).to.equal('Hide');
    expect(home.ShowGlobalSettingsNodeShapeTable).to.equal(false);
    expect(home.GlobalSettingsNodeShapeDialogSettings.isVisible).to.equal(false);
  });
};

const assertGlobalSettingsNodeShapeByNone = () => {
  cy.openGlobalSettings();
  cy.contains('#global-settings-modal .nav-link', 'Styling').click({ force: true });
  cy.get('#node-symbol-variable', { timeout: 15000 }).should('contain.text', 'None');
  cy.get('body').then(($body) => {
    const visibleNodeShapeDialogs = $body
      .find('.p-dialog:visible .p-dialog-title')
      .filter((_, element) => element.textContent?.trim() === 'Node Shape Table');

    expect(visibleNodeShapeDialogs.length).to.equal(0);
  });
  assertRestoredNodeShapeByNone();
  cy.closeGlobalSettings();
};

describe('Journey Flow - Legacy session layout restore', () => {
  it('opens an unwrapped classic session and restores saved layout views', () => {
    visitAppAndAcceptEula();

    cy.window().then((win: any) => {
      win.__legacyLayoutConsoleErrors = [];
      cy.stub(win.console, 'error').callsFake((...args: unknown[]) => {
        win.__legacyLayoutConsoleErrors.push(args.map(String).join(' '));
      });
    });

    loadOutbreakNormSession();

    cy.window({ timeout: 120000 }).should((win: any) => {
      expect(win.commonService.session.data.nodes.length, 'loaded node count').to.be.greaterThan(0);
      expect(win.commonService.session.data.links.length, 'loaded link count').to.be.greaterThan(0);
    });

    cy.window({ timeout: 120000 }).should((win: any) => {
      const tabs = win.commonService.visuals.microbeTrace.homepageTabs.map((tab: any) => tab.label);

      expect(win.commonService.session.style.widgets['default-view']).to.equal('2D Network');
      expect(win.commonService.pendingDashboardRestore).to.equal(null);
      expect(tabs).to.include.members(expectedLegacyLayoutViews);
    });

    cy.get('#cy', { timeout: 60000 }).should('be.visible');

    assertRestoredNodeShapeByNone();
    assertGlobalSettingsNodeShapeByNone();

    cy.window().then((win: any) => {
      win.commonService.visuals.microbeTrace.Viewclick('Map');
    });
    cy.get('.mapStyle', { timeout: 60000 }).should('be.visible');

    cy.window().then((win: any) => {
      const map = win.commonService.visuals.gisMap;

      expect(win.commonService.session.style.widgets['map-field-zipcode']).to.equal('zip');
      expect(map.SelectedZipCode).to.equal('zip');
    });

    cy.get('#tool-btn-container-map a[title="Settings"]').click({ force: true });
    cy.contains('.p-dialog-title', 'Geospatial Settings')
      .parents('.p-dialog')
      .as('mapSettingsDialog');
    cy.get('@mapSettingsDialog')
      .find('#map-field-zipcode', { timeout: 15000 })
      .should('contain.text', 'Zip');
    cy.closeSettingsPane('Geospatial Settings');

    cy.window().then((win: any) => {
      win.commonService.visuals.microbeTrace.Viewclick('Table');
    });
    cy.get('.table-wrapper', { timeout: 60000 }).should('be.visible');

    cy.window().then((win: any) => {
      const notifyErrors = win.__legacyLayoutConsoleErrors.filter((message: string) =>
        message.includes("Cannot read properties of null (reading 'notify')")
      );

      expect(notifyErrors).to.deep.equal([]);
    });
  });

  it('does not carry default dataset node shape settings into a loaded session', () => {
    visitAppAndAcceptEula({ skipDemoSession: false });

    cy.window({ timeout: 120000 }).should((win: any) => {
      expect(win.commonService.session.data.nodes.length, 'default node count').to.be.greaterThan(0);
      expect(win.commonService.session.style.widgets['node-symbol-variable']).to.equal('Node type');
    });

    loadOutbreakNormSession();

    cy.window({ timeout: 120000 }).should((win: any) => {
      expect(win.commonService.session.data.nodes.length, 'loaded node count').to.be.greaterThan(0);
      expect(win.commonService.session.style.widgets['node-symbol-variable']).to.equal('None');
    });

    assertRestoredNodeShapeByNone();
    assertGlobalSettingsNodeShapeByNone();
  });
});
