/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  installSaveAsCaptureHook,
  launchProfileToTwoD,
  saveSessionFromFileMenu,
  visitAppAndAcceptEula,
  waitForProcessingDialogToClear,
  writeCapturedDownloadToDisk,
} from '../../../support/journey-helpers';
import {
  applyDeterministicDashboardSplitLayout,
  assertActiveDashboardTab,
  assertDashboardOpenComponentCount,
  assertDashboardViewReady,
  assertDistinctDashboardPaneRects,
  assertNoDashboardRuntimeBanner,
  assertOpenDashboardTabs,
  captureDashboardPaneRects,
  configureDashboardMapZipcode,
  focusDashboardTab,
  openDashboardViews,
} from '../../../support/dashboard-helpers';

type DashboardPaneRects = Record<string, {
  x: number;
  y: number;
  width: number;
  height: number;
}>;

type TextFileSummary = {
  length: number;
  missing: string[];
  meetsMinLength: boolean;
};

const DASHBOARD_TABS = ['2D Network', 'Map', 'Bubble', 'Table', 'Aggregate', 'Crosstab', 'Waterfall'];

const closeDialogIfPresent = (title: string): void => {
  cy.get('body').then(($body) => {
    const dialogTitle = $body
      .find('.p-dialog-title')
      .toArray()
      .find((candidate) => String(candidate.textContent || '').trim() === title);

    if (!dialogTitle) {
      return;
    }

    cy.contains('.p-dialog-title', title)
      .parents('.p-dialog')
      .find('button.p-dialog-close-button')
      .click({ force: true });

    cy.contains('.p-dialog-title', title).should('not.exist');
  });
};

const prepareDashboard = (): void => {
  const profile = getProfile('map-covid-zipcode-threshold');

  launchProfileToTwoD(profile);
  assertAfterLaunchCounts(profile);
  openDashboardViews(['Map', 'Bubble', 'Table', 'Aggregate', 'Crosstab', 'Waterfall']);
  closeDialogIfPresent('Aggregate Settings');
  closeDialogIfPresent('Crosstab Settings');
  configureDashboardMapZipcode('Off');
  waitForProcessingDialogToClear();
  assertOpenDashboardTabs(DASHBOARD_TABS);
  assertNoDashboardRuntimeBanner();
};

const assertPaneOrderingPreserved = (before: DashboardPaneRects, after: DashboardPaneRects): void => {
  expect(before['2D Network'].x, 'saved 2D pane should be left of Map').to.be.lessThan(before.Map.x);
  expect(after['2D Network'].x, 'restored 2D pane should stay left of Map').to.be.lessThan(after.Map.x);

  expect(before['2D Network'].y, 'saved 2D pane should be above Table').to.be.lessThan(before.Table.y);
  expect(after['2D Network'].y, 'restored 2D pane should stay above Table').to.be.lessThan(after.Table.y);

  expect(before.Aggregate.y, 'saved Aggregate pane should be above Crosstab').to.be.lessThan(before.Crosstab.y);
  expect(after.Aggregate.y, 'restored Aggregate pane should stay above Crosstab').to.be.lessThan(after.Crosstab.y);
};

const assertWaterfallInteractive = (): void => {
  focusDashboardTab('Waterfall');
  cy.get('#waterfall-cluster-table-container tbody tr.ui-selectable-row', { timeout: 15000 })
    .should('have.length.greaterThan', 0)
    .first()
    .click({ force: true });

  cy.get('#waterfall-node-table-container tbody tr.ui-selectable-row', { timeout: 15000 })
    .should('have.length.greaterThan', 0);
};

const assertSavedDashboardSessionFile = (sessionFilePath: string): void => {
  cy.task<TextFileSummary>('file:textSummary', {
    filePath: sessionFilePath,
    contains: ['"session"', '"tabs"', '"dashboardLayout"'],
    minLength: 100,
  }).should((summary) => {
    expect(summary.missing, 'missing saved dashboard session metadata').to.deep.equal([]);
    expect(summary.meetsMinLength, 'saved .microbetrace length > 100').to.equal(true);
  });
};

describe('Journey Flow - Dashboard session round-trip on uploaded data', () => {
  it('restores the same saved multi-pane dashboard after saving and re-uploading a .microbetrace session', () => {
    const sessionFileBase = `cypress_dashboard_session_roundtrip_${Date.now()}`;
    const sessionFilePath = `${Cypress.config('downloadsFolder')}/${sessionFileBase}.microbetrace`;

    prepareDashboard();

    applyDeterministicDashboardSplitLayout(DASHBOARD_TABS, 'Table');
    focusDashboardTab('Table');

    assertDashboardOpenComponentCount(7);
    captureDashboardPaneRects(['2D Network', 'Map', 'Table', 'Aggregate', 'Crosstab'], 'savedDashboardPaneRects');
    assertDistinctDashboardPaneRects('savedDashboardPaneRects', 3);

    assertDashboardViewReady('2D Network');
    assertDashboardViewReady('Map');
    assertDashboardViewReady('Bubble');
    assertDashboardViewReady('Table');
    assertDashboardViewReady('Waterfall');
    assertWaterfallInteractive();
    focusDashboardTab('Table');

    closeDialogIfPresent('Crosstab Settings');
    closeDialogIfPresent('Aggregate Settings');

    installSaveAsCaptureHook();
    saveSessionFromFileMenu(sessionFileBase);
    writeCapturedDownloadToDisk(`${sessionFileBase}.microbetrace`, sessionFilePath);
    assertSavedDashboardSessionFile(sessionFilePath);

    visitAppAndAcceptEula();
    cy.get('#fileDropRef', { timeout: 15000 }).selectFile(sessionFilePath, { force: true });
    waitForProcessingDialogToClear(60000);

    assertDashboardOpenComponentCount(7);
    assertOpenDashboardTabs(DASHBOARD_TABS);
    assertActiveDashboardTab('Table');
    captureDashboardPaneRects(['2D Network', 'Map', 'Table', 'Aggregate', 'Crosstab'], 'restoredDashboardPaneRects');
    assertDistinctDashboardPaneRects('restoredDashboardPaneRects', 3);

    cy.get<DashboardPaneRects>('@savedDashboardPaneRects').then((before) => {
      cy.get<DashboardPaneRects>('@restoredDashboardPaneRects').then((after) => {
        assertPaneOrderingPreserved(before, after);
      });
    });

    assertDashboardViewReady('2D Network');
    assertDashboardViewReady('Map');
    assertDashboardViewReady('Bubble');
    assertDashboardViewReady('Table');
    assertDashboardViewReady('Waterfall');
    assertWaterfallInteractive();

    waitForProcessingDialogToClear();
    assertNoDashboardRuntimeBanner();
  });
});
