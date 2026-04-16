/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  installSaveAsCaptureHook,
  launchProfileToTwoD,
  openGlobalStylingTab,
  waitForProcessingDialogToClear,
  writeCapturedDownloadToDisk,
} from '../../../support/journey-helpers';
import {
  applyDeterministicDashboardSplitLayout,
  assertDashboardExportDialogControls,
  assertDashboardOpenComponentCount,
  assertNoDashboardRuntimeBanner,
  assertOpenDashboardTabs,
  captureDashboardPaneRects,
  configureDashboardMapZipcode,
  dragGoldenLayoutSplitter,
  focusDashboardTab,
  openDashboardExportDialog,
  openDashboardViews,
  readDashboardExportResolutionSummary,
  setDashboardExportFilename,
  setDashboardExportScale,
} from '../../../support/dashboard-helpers';
import { byTestId, testIds } from '../../../support/selectors';

type DashboardWindow = Window & {
  commonService: any;
};

type DashboardPaneRects = Record<string, {
  x: number;
  y: number;
  width: number;
  height: number;
}>;

const DASHBOARD_TABS = ['2D Network', 'Map', 'Bubble', 'Table', 'Aggregate', 'Crosstab', 'Waterfall'];

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const clickVisiblePrimeOption = (label: string): void => {
  cy.get('.p-select-overlay:visible', { timeout: 15000 })
    .last()
    .contains('li[role="option"]', new RegExp(`^${escapeRegExp(label)}$`))
    .click({ force: true });
};

const normalizeColor = (value: string): string => String(value || '').replace(/\s+/g, '').toLowerCase();

const hexToRgbString = (hex: string): string => {
  const normalized = hex.replace('#', '');
  const expanded = normalized.length === 3
    ? normalized.split('').map((char) => `${char}${char}`).join('')
    : normalized;

  const red = parseInt(expanded.slice(0, 2), 16);
  const green = parseInt(expanded.slice(2, 4), 16);
  const blue = parseInt(expanded.slice(4, 6), 16);

  return `rgb(${red}, ${green}, ${blue})`;
};

const matchesExpectedColor = (actual: string, expectedHex: string): boolean => {
  const normalizedActual = normalizeColor(actual);
  return normalizedActual === normalizeColor(expectedHex) ||
    normalizedActual === normalizeColor(hexToRgbString(expectedHex));
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

const setFixedDashboardNodeColor = (color: string): void => {
  openGlobalStylingTab();
  cy.get('#node-color-variable').click({ force: true });
  clickVisiblePrimeOption('None');

  cy.get('#node-color')
    .invoke('val', color)
    .trigger('input')
    .trigger('change');

  cy.window().its('commonService.session.style.widgets.node-color-variable').should('equal', 'None');
  cy.window().its('commonService.session.style.widgets.node-color').should('equal', color);
  cy.closeGlobalSettings();
  waitForProcessingDialogToClear();
};

const assertDashboardFixedNodeColor = (expectedHex: string): void => {
  focusDashboardTab('2D Network');
  cy.window().should((win: unknown) => {
    const cyInstance = (win as DashboardWindow).commonService.visuals.twoD.cy;
    const nodes = cyInstance.nodes(':visible').filter((node: any) => !node.hasClass('parent'));

    expect(nodes.length, 'visible 2D nodes').to.be.greaterThan(0);
    nodes.forEach((node: any) => {
      expect(
        matchesExpectedColor(String(node.style('background-color') || ''), expectedHex),
        `2D node color for ${node.id()}`,
      ).to.equal(true);
    });
  });

  focusDashboardTab('Bubble');
  cy.window().should((win: unknown) => {
    const bubble = (win as DashboardWindow).commonService.visuals.bubble;
    const nodes = bubble.cy.nodes().filter((node: any) => !node.hasClass('X_axis') && !node.hasClass('Y_axis'));

    expect(nodes.length, 'Bubble rendered nodes').to.be.greaterThan(0);
    nodes.forEach((node: any) => {
      expect(
        matchesExpectedColor(String(node.style('background-color') || ''), expectedHex),
        `Bubble node color for ${node.id()}`,
      ).to.equal(true);
    });
  });

  focusDashboardTab('Map');
  cy.window().should((win: unknown) => {
    const layers = (win as DashboardWindow).commonService.visuals.gisMap.layers.featureGroup.getLayers();

    expect(layers.length, 'Map rendered nodes').to.be.greaterThan(0);
    layers.forEach((layer: any) => {
      expect(
        matchesExpectedColor(String(layer.options.fillColor || ''), expectedHex),
        `Map node color for ${String(layer?.data?._id || '')}`,
      ).to.equal(true);
    });
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

describe('Journey Flow - Dashboard export on uploaded data', () => {
  it('exports the real dashboard as a PNG after layout and root styling changes', () => {
    const exportFileBase = `cypress_dashboard_export_${Date.now()}`;
    const exportPath = `${Cypress.config('downloadsFolder')}/${exportFileBase}.png`;
    const fixedNodeColor = '#224466';

    prepareDashboard();

    applyDeterministicDashboardSplitLayout(DASHBOARD_TABS, 'Table');
    assertDashboardOpenComponentCount(7);
    captureDashboardPaneRects(['2D Network', 'Map', 'Table'], 'beforeExportDrag');

    dragGoldenLayoutSplitter(0, 140, 0);

    captureDashboardPaneRects(['2D Network', 'Map', 'Table'], 'afterExportDrag');
    cy.get<DashboardPaneRects>('@beforeExportDrag').then((before) => {
      cy.get<DashboardPaneRects>('@afterExportDrag').then((after) => {
        expect(
          Math.abs(after['2D Network'].width - before['2D Network'].width),
          '2D pane width changes after real splitter drag',
        ).to.be.greaterThan(20);
      });
    });

    setFixedDashboardNodeColor(fixedNodeColor);
    assertDashboardFixedNodeColor(fixedNodeColor);
    assertNoDashboardRuntimeBanner();

    installSaveAsCaptureHook();

    openDashboardExportDialog();
    assertDashboardExportDialogControls();
    cy.closeSettingsPane('Export Dashboard');
    cy.contains('.p-dialog-title', 'Export Dashboard').should('not.exist');

    openDashboardExportDialog();
    assertDashboardExportDialogControls();
    setDashboardExportFilename(exportFileBase);

    cy.contains('.p-dialog-title', 'Export Dashboard')
      .parents('.p-dialog')
      .as('dashboardExportDialog');

    cy.get('@dashboardExportDialog')
      .contains('p-accordion-header', 'Advanced')
      .click({ force: true });

    cy.get(byTestId(testIds.dashboardExportScale)).should('be.visible');
    readDashboardExportResolutionSummary('dashboardExportResolutionBefore');
    setDashboardExportScale('1.6');

    cy.window()
      .its('commonService.visuals.microbeTrace.ExportDashboardResolution.summary')
      .then((summary) => {
        cy.get<string>('@dashboardExportResolutionBefore').then((beforeSummary) => {
          expect(String(summary).trim(), 'updated dashboard export resolution summary').not.to.equal(beforeSummary);
          cy.get(byTestId(testIds.dashboardExportDimensions))
            .invoke('text')
            .should((renderedSummary) => {
              expect(String(renderedSummary).trim()).to.equal(String(summary).trim());
            });
        });
      });

    cy.get(byTestId(testIds.dashboardExportConfirm)).click({ force: true });
    cy.contains('.p-dialog-title', 'Export Dashboard').should('not.exist');

    writeCapturedDownloadToDisk(`${exportFileBase}.png`, exportPath);

    cy.readFile(exportPath, null, { timeout: 30000 }).should((pngBuffer) => {
      const uint8 = new Uint8Array(pngBuffer as ArrayBuffer);
      const byteLength = uint8.byteLength;
      const signature = Array.from(uint8.slice(0, 8)).map((value) => value.toString(16).padStart(2, '0')).join('');

      expect(signature, 'PNG signature').to.equal('89504e470d0a1a0a');
      expect(byteLength, 'exported dashboard PNG byte length').to.be.greaterThan(15000);
    });

    waitForProcessingDialogToClear();
    assertNoDashboardRuntimeBanner();
  });
});
