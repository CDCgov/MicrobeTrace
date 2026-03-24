/// <reference types="cypress" />

/**
 * Legacy file-settings coverage retained for reference only.
 *
 * These tests depended on AngularTesting_nodelist_withseqs_TN93_small (2).csv,
 * which is no longer present in cypress/fixtures. They are quarantined from the
 * maintained suite until they are rebuilt against current fixtures.
 */

import { byTestId, testIds } from '../../support/selectors';

describe('Files Plugin - Settings (legacy)', () => {
  const nodeFile = 'AngularTesting_nodelist_withseqs_TN93_small (2).csv';

  beforeEach(() => {
    cy.visit('/');
    cy.attach_file('#fileDropRef', nodeFile);
    cy.get('#overlay').should('not.be.visible', { timeout: 10000 });
    cy.get(byTestId(testIds.filesSettingsButton)).click();
  });

  it('should change the Distance Metric and update the session', () => {
    cy.window().its('commonService.session.style.widgets.default-distance-metric').should('equal', 'snps');
    cy.get('#default-distance-metric').select('tn93');
    cy.window().its('commonService.session.style.widgets.default-distance-metric').should('equal', 'tn93');
  });

  it('should change the Ambiguity Resolution Strategy and update the session', () => {
    cy.window().its('commonService.session.style.widgets.ambiguity-resolution-strategy').should('equal', 'AVERAGE');
    cy.get('#default-distance-metric').select('tn93');
    cy.get('#ambiguity-resolution-strategy').select('RESOLVE');
    cy.window().its('commonService.session.style.widgets.ambiguity-resolution-strategy').should('equal', 'RESOLVE');
  });

  it('should change the Link Threshold and update the session', () => {
    const newThreshold = '4';

    cy.window().its('commonService.session.style.widgets.link-threshold').should('equal', 164);
    cy.get('#default-distance-threshold').clear().type(newThreshold);
    cy.window().its('commonService.session.style.widgets.link-threshold').should('equal', parseFloat(newThreshold));
  });

  it('should change the View to Launch and update the session', () => {
    cy.window().its('commonService.session.style.widgets.default-view').should('equal', '2d_network');
    cy.get('#default-view').select('Table');
    cy.window().its('commonService.session.style.widgets.default-view').should('equal', 'Table');
  });
});
