/// <reference types="cypress" />

import {
  assertMetricCount,
  ensureTwoDNetworkView,
  launchAndWaitForProcessing,
  visitAppAndAcceptEula,
} from '../../../support/journey-helpers';
import { byTestId, testIds } from '../../../support/selectors';

describe('Journey Flow - Load screen threshold', () => {
  it('honors typed SNP threshold 1 from File Settings when launching uploaded distance links', () => {
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

    cy.get('select[id="file-COVID_Dummy_distance_edgelist_snp.csv-field-3"]')
      .should('have.value', 'distance');

    cy.get(byTestId(testIds.filesSettingsButton), { timeout: 15000 }).click({ force: true });
    cy.contains('.p-dialog-title', 'File Settings', { timeout: 15000 })
      .should('be.visible')
      .parents('.p-dialog')
      .as('fileSettingsDialog');

    cy.get('@fileSettingsDialog').find('#default-distance-metric').select('snps', { force: true });
    cy.get('@fileSettingsDialog').find('#default-distance-metric')
      .should('have.value', 'snps');
    cy.window().then((win: any) => {
      // Cached/default SNPs can leave the settings UI on SNPs before the metric stream emits SNPs.
      win.commonService.store.setMetricChanged(null);
    });
    cy.get('@fileSettingsDialog').find('#default-distance-threshold')
      .clear()
      .type('1')
      .blur()
      .should('have.value', '1');
    cy.get('@fileSettingsDialog').find('#default-view').select('2D Network', { force: true });

    cy.closeSettingsPane('File Settings');
    cy.window().then((win: any) => {
      const widgets = win.commonService.session.style.widgets;

      expect(widgets['default-distance-metric'], 'pre-launch session distance metric').to.equal('snps');
      expect(Number(widgets['link-threshold']), 'pre-launch session link threshold').to.equal(1);
    });

    launchAndWaitForProcessing(60000);
    ensureTwoDNetworkView();

    cy.window().then((win: any) => {
      const widgets = win.commonService.session.style.widgets;

      expect(widgets['default-distance-metric'], 'session distance metric').to.equal('snps');
      expect(Number(widgets['link-threshold']), 'session link threshold').to.equal(1);
      expect(Number(win.commonService.GlobalSettingsModel.SelectedLinkThresholdVariable), 'global threshold')
        .to.equal(1);
    });

    assertMetricCount('#numberOfVisibleLinks', 1);

    cy.openGlobalSettings();
    cy.contains('#global-settings-modal .nav-link', 'Filtering').click({ force: true });
    cy.get('#link-threshold').should('have.value', '1');
  });
});
