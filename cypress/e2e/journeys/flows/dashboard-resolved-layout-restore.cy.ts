/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  installSaveAsCaptureHook,
  launchProfileToTwoD,
  openBubbleSettingsDialog,
  openGlobalStylingTab,
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

const mapBubbleTableTabs = ['2D Network', 'Map', 'Bubble', 'Table'];
const keyTablesTabs = ['2D Network', 'Aggregate', 'Crosstab', 'Waterfall', 'Docked Key Tables'];

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const clickVisiblePrimeOption = (label: string): void => {
  cy.get('.p-select-overlay:visible, .p-dropdown-panel:visible', { timeout: 15000 })
    .last()
    .contains('li[role="option"]', new RegExp(`^${escapeRegExp(label)}$`), { timeout: 15000 })
    .scrollIntoView()
    .click({ force: true });
};

const selectPrimeOption = (selector: string, label: string): void => {
  cy.get(selector, { timeout: 15000 }).then(($elements) => {
    const visibleElement = $elements.filter(':visible').first();

    expect(visibleElement.length, `visible select ${selector}`).to.be.greaterThan(0);
    cy.wrap(visibleElement).click({ force: true });
  });
  clickVisiblePrimeOption(label);
};

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

const closeGlobalSettingsIfVisible = (): void => {
  cy.get('body').then(($body) => {
    const hasVisibleGlobalSettings =
      $body.find('.p-dialog:visible .p-dialog-title:contains("Global Settings")').length > 0;

    if (hasVisibleGlobalSettings) {
      cy.closeGlobalSettings();
    }
  });
};

const captureDashboardRestoreErrors = () => {
  cy.window().then((win: any) => {
    win.__dashboardLayoutRestoreErrors = [];
    const originalConsoleError = win.console.error.bind(win.console);

    cy.stub(win.console, 'error').callsFake((...args: unknown[]) => {
      win.__dashboardLayoutRestoreErrors.push(args.map(String).join(' '));
      return originalConsoleError(...args);
    });
  });
};

const assertNoDashboardRestoreErrors = () => {
  cy.window().then((win: any) => {
    const restoreErrors = (win.__dashboardLayoutRestoreErrors || []).filter((message: string) =>
      message.includes('Unable to restore the saved dashboard layout') ||
      message.includes('value2.trimStart is not a function') ||
      message.includes("Cannot read properties of null (reading 'notify')")
    );

    expect(restoreErrors, 'dashboard restore errors').to.deep.equal([]);
  });
};

const setBubbleAxis = (
  selector: '#bubble-axis-x' | '#bubble-axis-y',
  label: string,
  expectedWidget: 'bubble-x' | 'bubble-y',
  expectedValue: string,
): void => {
  cy.get('@bubbleSettings').find(selector).find('.p-select-dropdown').click({ force: true });
  clickVisiblePrimeOption(label);
  cy.get('@bubbleSettings').find(selector).find('.p-select-label').should('contain', label);
  cy.window().its(`commonService.session.style.widgets.${expectedWidget}`).should('equal', expectedValue);
};

const setBubbleNodeSize = (value: number): void => {
  cy.get('@bubbleSettings')
    .find('#bubble-node-size')
    .invoke('val', value)
    .trigger('input')
    .trigger('change');

  cy.window().its('commonService.session.style.widgets.bubble-size').should('equal', value);
};

const saveDashboardSessionToDisk = (sessionFileBase: string, sessionFilePath: string): void => {
  installSaveAsCaptureHook();
  saveSessionFromFileMenu(sessionFileBase);
  writeCapturedDownloadToDisk(`${sessionFileBase}.microbetrace`, sessionFilePath);

  cy.readFile(sessionFilePath, 'utf8', { timeout: 30000 }).should((savedSession) => {
    expect(savedSession, 'saved .microbetrace content').to.include('"session"');
    expect(savedSession, 'saved dashboard tabs metadata').to.include('"tabs"');
    expect(savedSession, 'saved dashboard layout metadata').to.include('"dashboardLayout"');
    expect(savedSession.length, 'saved .microbetrace length').to.be.greaterThan(100);
  });
};

const reloadSavedDashboardSession = (sessionFilePath: string): void => {
  visitAppAndAcceptEula();
  captureDashboardRestoreErrors();
  cy.get('#fileDropRef', { timeout: 15000 }).selectFile(sessionFilePath, { force: true });
  waitForProcessingDialogToClear(90000);
  cy.window({ timeout: 90000 })
    .its('commonService.session.network.isFullyLoaded')
    .should('equal', true);
  assertNoDashboardRestoreErrors();
};

const focusDockedKeyTables = (): void => {
  cy.window().then((win: any) => {
    const app = win.commonService.visuals.microbeTrace;
    const tabIndex = app.homepageTabs.findIndex((tab: any) => tab.label === 'Docked Key Tables');

    expect(tabIndex, 'Docked Key Tables tab index').to.be.greaterThan(-1);

    app._goldenLayoutHostComponent.focusComponent('Docked Key Tables');
    app.setActiveTabProperties(tabIndex);
  });

  cy.wait(50, { log: false });
};

const openDockedKeyTablesView = (): void => {
  openGlobalStylingTab();
  cy.get('#open-key-tables-view', { timeout: 15000 }).then(($buttons) => {
    const visibleButton = $buttons.filter(':visible').first();

    expect(visibleButton.length, 'visible Docked Key Tables button').to.be.greaterThan(0);
    cy.wrap(visibleButton).click({ force: true });
  });
  cy.window({ timeout: 15000 }).its('commonService.visuals.keyTables').should('exist');
  closeGlobalSettingsIfVisible();
  cy.get('.key-tables-view', { timeout: 15000 }).should('be.visible');
};

const dockAllKeyTables = (): void => {
  cy.window().then((win: any) => {
    win.commonService.visuals.microbeTrace.openKeyTablesView();
  });

  cy.wait(50, { log: false });
};

const assertDockedKeyTablesState = (): void => {
  cy.window().should((win: any) => {
    const app = win.commonService.visuals.microbeTrace;

    expect(app.isKeyTableDocked('node-color'), 'node color table docked').to.equal(true);
    expect(app.isKeyTableDocked('link-color'), 'link color table docked').to.equal(true);
    expect(app.isKeyTableDocked('node-shape'), 'node shape table docked').to.equal(true);
  });
};

const assertDockedKeyTablesReady = (): void => {
  focusDockedKeyTables();
  assertDockedKeyTablesState();

  cy.get('.key-tables-view', { timeout: 15000 }).should('be.visible');
  cy.get('#key-tables-node-table', { timeout: 15000 }).should('contain.text', 'Healthcare');
  cy.get('#key-tables-link-table', { timeout: 15000 }).should('contain.text', 'sports team');
  cy.get('#key-tables-node-shape-table', { timeout: 15000 }).should('contain.text', 'Florida');
};

const assertSessionDataCounts = (nodes: number, links?: number): void => {
  cy.window({ timeout: 90000 }).should((win: any) => {
    expect(win.commonService.session.data.nodes.length, 'session node count').to.equal(nodes);

    if (links !== undefined) {
      expect(win.commonService.session.data.links.length, 'session link count').to.equal(links);
    }
  });
};

describe('Journey Flow - Dashboard resolved layout restore', () => {
  afterEach(() => {
    cy.window({ log: false }).then((win) => {
      win.location.href = 'about:blank';
    });
  });

  it('roundtrips an uploaded Map/Bubble/Table dashboard with changed view settings', () => {
    const profile = getProfile('map-color-by-uploaded');
    const sessionFileBase = `cypress_dashboard_map_bubble_table_roundtrip_${Date.now()}`;
    const sessionFilePath = `${Cypress.config('downloadsFolder')}/${sessionFileBase}.microbetrace`;
    const bubbleNodeSize = 26;

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    openDashboardViews(['Map', 'Bubble', 'Table']);

    configureDashboardMapZipcode('Off');

    focusDashboardTab('Bubble');
    openBubbleSettingsDialog();
    cy.get('@bubbleSettings').find('#bubble-node-collapsing').contains('On').click({ force: true });
    cy.window().its('commonService.visuals.bubble.SelectedNodeCollapsingTypeVariable').should('equal', true);
    setBubbleNodeSize(bubbleNodeSize);
    cy.closeSettingsPane('Bubble Settings');

    applyDeterministicDashboardSplitLayout(mapBubbleTableTabs, 'Bubble');
    assertDashboardOpenComponentCount(4);
    assertOpenDashboardTabs(mapBubbleTableTabs);
    assertActiveDashboardTab('Bubble');
    captureDashboardPaneRects(['2D Network', 'Map', 'Bubble', 'Table'], 'savedMapBubbleTableRects');
    assertDistinctDashboardPaneRects('savedMapBubbleTableRects', 4);

    saveDashboardSessionToDisk(sessionFileBase, sessionFilePath);
    reloadSavedDashboardSession(sessionFilePath);

    assertSessionDataCounts(4, 4);
    assertDashboardOpenComponentCount(4);
    assertOpenDashboardTabs(mapBubbleTableTabs);
    assertActiveDashboardTab('Bubble');

    assertDashboardViewReady('Map');
    assertDashboardViewReady('Bubble');
    assertDashboardViewReady('Table');

    cy.window().its('commonService.session.style.widgets').should((widgets) => {
      expect(widgets['map-field-zipcode'], 'restored map zipcode field').to.equal('Zip_code');
      expect(widgets['map-collapsing-on'], 'restored map node collapsing').to.equal(false);
      expect(widgets['bubble-collapsed'], 'restored Bubble collapse').to.equal(true);
      expect(widgets['bubble-size'], 'restored Bubble node size').to.equal(bubbleNodeSize);
    });

    captureDashboardPaneRects(['2D Network', 'Map', 'Bubble', 'Table'], 'restoredMapBubbleTableRects');
    assertDistinctDashboardPaneRects('restoredMapBubbleTableRects', 4);
    cy.get<DashboardPaneRects>('@restoredMapBubbleTableRects').then((rects) => {
      expect(rects['2D Network'].x, '2D pane should be left of Map').to.be.lessThan(rects.Map.x);
      expect(rects.Bubble.y, 'Bubble pane should be below 2D').to.be.greaterThan(rects['2D Network'].y);
      expect(rects.Table.y, 'Table pane should be below Map').to.be.greaterThan(rects.Map.y);
    });

    assertNoDashboardRuntimeBanner();
  });

  it('roundtrips an uploaded Aggregate/Crosstab/Waterfall dashboard with docked key tables', () => {
    const profile = getProfile('color-by-uploaded-categorical');
    const sessionFileBase = `cypress_dashboard_key_tables_roundtrip_${Date.now()}`;
    const sessionFilePath = `${Cypress.config('downloadsFolder')}/${sessionFileBase}.microbetrace`;

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);

    openDashboardViews(['Aggregate', 'Crosstab', 'Waterfall']);
    closeDialogIfPresent('Aggregate Settings');
    closeDialogIfPresent('Crosstab Settings');

    openGlobalStylingTab();
    selectPrimeOption('#node-color-variable', 'Profession');
    selectPrimeOption('#link-tooltip-variable', 'Contact type');
    selectPrimeOption('#node-symbol-variable', 'State');
    cy.window().its('commonService.session.style.widgets').should((widgets) => {
      expect(widgets['node-color-variable']).to.equal('Profession');
      expect(widgets['link-color-variable']).to.equal('Contact type');
      expect(widgets['node-symbol-variable']).to.equal('State');
      expect(widgets['node-symbol-table-visible']).to.equal('Show');
    });
    cy.closeGlobalSettings();

    openDockedKeyTablesView();
    assertDockedKeyTablesReady();

    applyDeterministicDashboardSplitLayout(keyTablesTabs, 'Docked Key Tables');
    dockAllKeyTables();
    closeDialogIfPresent('Aggregate Settings');
    closeDialogIfPresent('Crosstab Settings');
    assertDockedKeyTablesReady();
    assertDashboardOpenComponentCount(5);
    assertOpenDashboardTabs(keyTablesTabs);

    saveDashboardSessionToDisk(sessionFileBase, sessionFilePath);
    cy.readFile(sessionFilePath, 'utf8').should((savedSession) => {
      expect(savedSession, 'saved dashboard key table state').to.include('"dashboardState"');
      expect(savedSession, 'saved dashboard key table docked state').to.include('"dockedTables"');
    });

    reloadSavedDashboardSession(sessionFilePath);

    assertSessionDataCounts(24, 12);
    assertDashboardOpenComponentCount(5);
    assertOpenDashboardTabs(keyTablesTabs);
    assertDockedKeyTablesReady();

    focusDashboardTab('Aggregate');
    focusDashboardTab('Crosstab');
    focusDashboardTab('Waterfall');

    cy.window().its('commonService.session.style.widgets').should((widgets) => {
      expect(widgets['node-color-variable'], 'restored node color variable').to.equal('Profession');
      expect(widgets['link-color-variable'], 'restored link color variable').to.equal('Contact type');
      expect(widgets['node-symbol-variable'], 'restored node shape variable').to.equal('State');
      expect(widgets['node-symbol-table-visible'], 'restored node shape table visibility').to.equal('Show');
    });

    assertNoDashboardRuntimeBanner();
  });
});
