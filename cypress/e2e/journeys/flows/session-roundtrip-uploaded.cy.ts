/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  applyStyleFromProfile,
  assertAfterLaunchCounts,
  assertGroupedByCluster,
  assertVisibleStylePreserved,
  enableGroupingShow,
  launchProfileToTwoD,
  snapshotVisibleStyles,
  visitAppAndAcceptEula,
} from '../../../support/journey-helpers';
import type { StyleSnapshot } from '../../../support/journey-helpers';

describe('Journey Flow - Session save and reload round-trip', () => {
  const profile = getProfile('style-apply-cypress-test-style');

  it('restores styled and grouped 2D state after saving and re-uploading a session file', () => {
    const sessionFileBase = `cypress_session_roundtrip_${Date.now()}`;
    const sessionFilePath = `${Cypress.config('downloadsFolder')}/${sessionFileBase}.microbetrace`;

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    applyStyleFromProfile(profile);
    cy.closeGlobalSettings();

    enableGroupingShow('cluster');
    assertGroupedByCluster();

    snapshotVisibleStyles().as('preSaveStyles');

    cy.get('#top-toolbar').contains('button', 'File').click({ force: true });
    cy.contains('button[mat-menu-item]', 'Save').click({ force: true });
    cy.contains('.p-dialog-title', 'Save Session')
      .should('be.visible')
      .parents('.p-dialog')
      .as('saveSessionDialog');

    cy.get('@saveSessionDialog')
      .find('#stash-name')
      .invoke('val', sessionFileBase)
      .trigger('input')
      .trigger('change');

    cy.get('@saveSessionDialog')
      .find('#save-file-compress')
      .uncheck({ force: true });

    cy.get('@saveSessionDialog').find('#stash-data').click({ force: true });
    cy.contains('.p-dialog-title', 'Save Session').should('not.exist');

    cy.readFile(sessionFilePath, 'utf8', { timeout: 20000 }).should((savedSession) => {
      expect(savedSession, 'saved .microbetrace content').to.include('"session"');
      expect(savedSession.length, 'saved .microbetrace length').to.be.greaterThan(100);
    });

    visitAppAndAcceptEula();
    cy.get('#fileDropRef', { timeout: 15000 }).selectFile(sessionFilePath, { force: true });

    cy.get('#cy', { timeout: 30000 }).should('be.visible');
    cy.window({ timeout: 30000 }).should('have.property', 'cytoscapeInstance');

    cy.window()
      .its('commonService.session.style.widgets')
      .should((widgets) => {
        expect(widgets['node-color-variable']).to.equal('Profession');
        expect(widgets['link-color-variable']).to.equal('Contact type');
        expect(widgets['node-symbol-variable']).to.equal('Node type');
        expect(widgets['node-radius-variable']).to.equal('degree');
        expect(widgets['polygons-show']).to.equal(true);
        expect(widgets['polygons-foci']).to.equal('cluster');
      });

    assertGroupedByCluster();

    snapshotVisibleStyles().then((afterReloadStyles) => {
      cy.get<StyleSnapshot>('@preSaveStyles').then((before) => {
        assertVisibleStylePreserved(before, afterReloadStyles);
      });
    });
  });
});
