/// <reference types="cypress" />

import {
  ensureTwoDNetworkView,
  launchAndWaitForProcessing,
  openGlobalFilteringTab,
  visitAppAndAcceptEula,
  waitForProcessingDialogToClear,
} from '../../../support/journey-helpers';
import { byTestId, testIds } from '../../../support/selectors';

describe('Journey Flow - MLST distance metric equivalence', () => {
  it('uses SNP calculation state when MLST is selected before launch', () => {
    visitAppAndAcceptEula();

    cy.loadFiles([
      {
        name: 'COVID_Dummy_distance_edgelist_snp.csv',
        datatype: 'link',
        field1: 'source',
        field2: 'target',
        field3: 'distance',
      },
      {
        name: 'COVID-19_simulated_NodeList_snp.csv',
        datatype: 'node',
        field1: 'ID',
        field2: 'None',
      },
    ]);

    cy.get(byTestId(testIds.filesSettingsButton), { timeout: 15000 }).click({ force: true });
    cy.contains('.p-dialog-title', 'File Settings', { timeout: 15000 })
      .should('be.visible')
      .parents('.p-dialog')
      .as('fileSettingsDialog');

    cy.get('@fileSettingsDialog').find('#default-distance-metric').select('mlst', { force: true });
    cy.get('@fileSettingsDialog').find('#default-distance-metric').should('have.value', 'mlst');
    cy.get('@fileSettingsDialog').find('[data-testid="files-mlst-equivalence-note"]')
      .should('be.visible')
      .and('contain.text', 'equivalent to SNP distance');
    cy.get('@fileSettingsDialog').find('#ambiguities-row').should('not.exist');
    cy.get('@fileSettingsDialog').find('#default-distance-threshold')
      .should('have.attr', 'step', '1')
      .and('have.value', '16');

    cy.window().then((win: any) => {
      expect(win.commonService.session.style.widgets['default-distance-metric']).to.equal('snps');
      expect(Number(win.commonService.session.style.widgets['link-threshold'])).to.equal(16);
    });

    cy.get('@fileSettingsDialog').find('#default-view').select('2D Network', { force: true });
    cy.closeSettingsPane('File Settings');
    launchAndWaitForProcessing(60000);
    ensureTwoDNetworkView();

    cy.window().then((win: any) => {
      expect(win.commonService.session.style.widgets['default-distance-metric']).to.equal('snps');
      expect(Number(win.commonService.session.style.widgets['link-threshold'])).to.equal(16);
    });
  });

  it('keeps the SNP network and threshold when MLST is selected after launch', () => {
    visitAppAndAcceptEula({ skipDemoSession: false });
    ensureTwoDNetworkView();

    cy.get('#numberOfVisibleLinks')
      .invoke('text')
      .then((initialVisibleLinkCount) => {
        openGlobalFilteringTab();
        cy.get('#default-distance-metric').select('mlst', { force: true });
        waitForProcessingDialogToClear();

        cy.get('#default-distance-metric').should('have.value', 'mlst');
        cy.get('[data-testid="settings-mlst-equivalence-note"]')
          .should('be.visible')
          .and('contain.text', 'equivalent to SNP distance');
        cy.get('#tn93-distance-display-format').should('not.exist');
        cy.get('#link-threshold').should('have.value', '16');
        cy.window().then((win: any) => {
          expect(win.commonService.session.style.widgets['default-distance-metric']).to.equal('snps');
          expect(win.commonService.GlobalSettingsModel.SelectedDistanceMetricVariable).to.equal('snps');
          expect(Number(win.commonService.session.style.widgets['link-threshold'])).to.equal(16);
        });

        cy.closeGlobalSettings();
        cy.get('#numberOfVisibleLinks').should('have.text', initialVisibleLinkCount);
      });
  });
});
