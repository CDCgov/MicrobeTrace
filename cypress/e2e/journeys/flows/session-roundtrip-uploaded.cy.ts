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

const tinyPatristicProfile = getProfile('load-twod-newick-tiny-replace-source');

describe('Journey Flow - Session save and reload round-trip', () => {
  const profile = getProfile('style-apply-cypress-test-style');
  const readSessionLinkSignature = (win: any) =>
    win.commonService.session.data.links
      .map((link: any) => ({
        source: String(link.source),
        target: String(link.target),
        distance: Number(link.distance),
      }))
      .sort((left: { source: string; target: string; distance: number }, right: { source: string; target: string; distance: number }) => {
        const bySource = left.source.localeCompare(right.source);
        if (bySource !== 0) return bySource;
        const byTarget = left.target.localeCompare(right.target);
        if (byTarget !== 0) return byTarget;
        return left.distance - right.distance;
      });

  const saveSessionFile = (sessionFilePath: string, sessionFileBase: string) => {
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
  };

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

    saveSessionFile(sessionFilePath, sessionFileBase);

    visitAppAndAcceptEula();
    cy.get('#fileDropRef', { timeout: 15000 }).selectFile(sessionFilePath, { force: true });

    cy.get('#cy', { timeout: 30000 }).should('be.visible');
    cy.window({ timeout: 30000 }).should('have.property', 'cytoscapeInstance');

    cy.window({ timeout: 30000 }).its('commonService.activeTab').should('equal', '2D Network');

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

  it('preserves Newick-derived patristic links on .microbetrace save/reload', () => {
    const sessionFileBase = `cypress_session_roundtrip_patristic_${Date.now()}`;
    const sessionFilePath = `${Cypress.config('downloadsFolder')}/${sessionFileBase}.microbetrace`;
    let preSaveLinkSignature: Array<{ source: string; target: string; distance: number }> = [];
    let preSaveNodeCount = 0;

    visitAppAndAcceptEula();
    launchProfileToTwoD(tinyPatristicProfile);
    assertAfterLaunchCounts(tinyPatristicProfile);

    cy.window().then((win: any) => {
      preSaveLinkSignature = readSessionLinkSignature(win);
      preSaveNodeCount = win.commonService.session.data.nodes.length;
    });

    saveSessionFile(sessionFilePath, sessionFileBase);

    visitAppAndAcceptEula();
    cy.get('#fileDropRef', { timeout: 15000 }).selectFile(sessionFilePath, { force: true });

    cy.get('#cy', { timeout: 30000 }).should('be.visible');
    cy.window({ timeout: 30000 }).should('have.property', 'cytoscapeInstance');
    cy.window({ timeout: 30000 }).its('commonService.activeTab').should('equal', '2D Network');

    cy.window().then((win: any) => {
      const postSaveLinkSignature = readSessionLinkSignature(win);

      expect(win.commonService.session.data.nodes.length, 'node count should survive session import').to.equal(preSaveNodeCount);
      expect(postSaveLinkSignature.length, 'link count should survive session import').to.equal(preSaveLinkSignature.length);
      expect(postSaveLinkSignature).to.deep.equal(preSaveLinkSignature);
    });
  });
});
