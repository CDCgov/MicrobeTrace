/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  assertWaterfallReady,
  goToWaterfallView,
  installSaveAsCaptureHook,
  launchProfileToWaterfall,
  saveSessionFromFileMenu,
  visitAppAndAcceptEula,
  waitForProcessingDialogToClear,
  writeCapturedDownloadToDisk,
} from '../../../support/journey-helpers';

type WaterfallRoundTripCase = {
  clusterId: string;
  nodeId: string;
  nodeRowCount: number;
  linkRowCount: number;
};

const persistWaterfallAsDefaultView = (): void => {
  cy.window().then((win: any) => {
    win.commonService.localStorageService.setItem('default-view', 'Waterfall');
    win.commonService.session.style.widgets['default-view'] = 'Waterfall';
    win.commonService.session.layout.content[0].type = 'Waterfall';
    win.commonService.GlobalSettingsModel.SelectedDefaultViewVariable = 'Waterfall';
  });
};

const ensureWaterfallViewAfterReload = (): void => {
  cy.get('body', { timeout: 15000 }).then(($body) => {
    if ($body.find('#waterfall-view:visible').length) {
      assertWaterfallReady(60000);
      return;
    }

    goToWaterfallView();
    assertWaterfallReady(60000);
  });
};

describe('Journey Flow - Waterfall session round-trip', () => {
  const profile = getProfile('style-apply-cypress-test-style');

  it('reopens a saved uploaded session and rebuilds the same Waterfall drilldown from session data', () => {
    const sessionFileBase = `cypress_waterfall_session_roundtrip_${Date.now()}`;
    const sessionFilePath = `${Cypress.config('downloadsFolder')}/${sessionFileBase}.microbetrace`;

    launchProfileToWaterfall(profile);
    assertAfterLaunchCounts(profile);

    cy.window().then((win: any) => {
      const clusterRow = (win.commonService.visuals.waterfall.clusterTableData || [])
        .find((row: any) => Number(row.nodeCount) > 1);

      expect(clusterRow, 'Waterfall cluster row with multiple nodes').to.exist;
      cy.wrap(String(clusterRow.id), { log: false }).as('waterfallRoundTripClusterId');
      cy.wrap(Number(clusterRow.nodeCount), { log: false }).as('waterfallRoundTripNodeRowCount');
    });

    cy.get<string>('@waterfallRoundTripClusterId').then((clusterId) => {
      cy.contains('#waterfall-cluster-table-container tbody tr.ui-selectable-row', clusterId)
        .should('exist')
        .click();
    });

    cy.get('#waterfall-node-table-container tbody tr.ui-selectable-row', { timeout: 20000 })
      .first()
      .then(($row) => {
        const cells = $row.find('td');
        cy.wrap(String(cells.eq(0).text()).trim(), { log: false }).as('waterfallRoundTripNodeId');
        cy.wrap($row).click();
      });

    cy.window().then((win: any) => {
      const waterfall = win.commonService.visuals.waterfall;
      expect((waterfall.linkTableData || []).length, 'Waterfall link rows before save').to.be.greaterThan(0);
      cy.wrap((waterfall.linkTableData || []).length, { log: false }).as('waterfallRoundTripLinkRowCount');
    });

    cy.get<string>('@waterfallRoundTripClusterId').then((clusterId) => {
      cy.get<string>('@waterfallRoundTripNodeId').then((nodeId) => {
        cy.get<number>('@waterfallRoundTripNodeRowCount').then((nodeRowCount) => {
          cy.get<number>('@waterfallRoundTripLinkRowCount').then((linkRowCount) => {
            cy.wrap<WaterfallRoundTripCase>({
              clusterId,
              nodeId,
              nodeRowCount,
              linkRowCount,
            }, { log: false }).as('waterfallRoundTripCase');
          });
        });
      });
    });

    persistWaterfallAsDefaultView();

    installSaveAsCaptureHook();
    saveSessionFromFileMenu(sessionFileBase);
    writeCapturedDownloadToDisk(`${sessionFileBase}.microbetrace`, sessionFilePath);

    cy.readFile(sessionFilePath, 'utf8', { timeout: 30000 }).should((savedSession) => {
      expect(savedSession, 'saved .microbetrace content').to.include('"session"');
      expect(savedSession, 'saved Waterfall default view').to.include('"default-view":"Waterfall"');
      expect(savedSession.length, 'saved .microbetrace length').to.be.greaterThan(100);
    });

    visitAppAndAcceptEula();
    cy.get('#fileDropRef', { timeout: 15000 }).selectFile(sessionFilePath, { force: true });
    waitForProcessingDialogToClear(60000);
    cy.window({ timeout: 60000 }).should((win: any) => {
      expect(win.commonService.session.files, 'restored session file count').to.have.length(2);
      expect(
        win.commonService.session.style.widgets['default-view'],
        'Waterfall default view after reload',
      ).to.equal('Waterfall');
      expect(
        win.commonService.session.layout?.content?.[0]?.type,
        'restored layout default view',
      ).to.equal('Waterfall');
      expect(
        win.commonService.visuals?.microbeTrace?.launchView,
        'restored launch view',
      ).to.equal('Waterfall');
    });

    cy.get('#waterfall-view', { timeout: 60000 }).should('be.visible');
    ensureWaterfallViewAfterReload();

    cy.get<WaterfallRoundTripCase>('@waterfallRoundTripCase').then((waterfallCase) => {
      cy.contains('#waterfall-cluster-table-container tbody tr.ui-selectable-row', waterfallCase.clusterId)
        .should('exist')
        .click();

      cy.get('#waterfall-node-table-container tbody tr.ui-selectable-row')
        .should('have.length', waterfallCase.nodeRowCount);

      cy.contains('#waterfall-node-table-container tbody tr.ui-selectable-row', waterfallCase.nodeId)
        .should('exist')
        .click();

      cy.get('#waterfall-link-table-container tbody tr.ui-selectable-row')
        .should('have.length', waterfallCase.linkRowCount);
    });
  });
});
