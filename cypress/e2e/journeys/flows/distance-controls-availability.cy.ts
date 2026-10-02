/// <reference types="cypress" />

import * as XLSX from 'xlsx';
import { getProfile } from '../datasets/profile';
import {
  ensureTwoDNetworkView,
  installSaveAsCaptureHook,
  launchProfileToTwoD,
  openGlobalFilteringTab,
  saveSessionFromFileMenu,
  setGlobalLinkThreshold,
  visitAppAndAcceptEula,
  waitForProcessingDialogToClear,
  writeCapturedDownloadToDisk,
} from '../../../support/journey-helpers';
import { byTestId, testIds } from '../../../support/selectors';

const epiProfile = getProfile('filtering-min-cluster-reveal-epi-linklist');
const fastaProfile = getProfile('filtering-metric-switch-fasta');
const newickProfile = getProfile('load-twod-newick-tn93-angular-testing');

const assertDistanceControlsDisabled = (): void => {
  cy.get('[data-testid="distance-controls-unavailable"]').should('be.visible');
  cy.get('#default-distance-metric').should('be.disabled');
  cy.get('#prune-select')
    .should('have.attr', 'aria-disabled', 'true')
    .find('[role="button"]')
    .should('have.attr', 'data-p-disabled', 'true');
  cy.get('#link-sort-variable [role="combobox"]').should('have.attr', 'aria-disabled', 'true');
  cy.get('#link-threshold').should('be.disabled');
  cy.get('[data-testid="threshold-stability-toggle"]').should('be.disabled');
};

const assertDistanceControlsEnabled = (): void => {
  cy.get('[data-testid="distance-controls-unavailable"]').should('not.exist');
  cy.get('#default-distance-metric').should('be.enabled');
  cy.get('#prune-select').should('have.attr', 'aria-disabled', 'false');
  cy.get('#link-sort-variable [role="combobox"]').should('have.attr', 'aria-disabled', 'false');
  cy.get('#link-threshold').should('be.enabled');
  cy.get('[data-testid="threshold-stability-toggle"]').should('be.enabled');
};

const assertNoMaterializedDistanceLinks = (): void => {
  cy.window({ timeout: 30000 }).should((win: any) => {
    const distanceLinks = (win.commonService.session.data.links || [])
      .filter((link: any) => link?.hasDistance === true);

    expect(distanceLinks, 'materialized distance links').to.have.length(0);
    expect(win.commonService.hasDistanceDataAvailable(), 'distance-source capability').to.equal(true);
  });
};

const removeMaterializedDistanceLinks = (): void => {
  cy.window().then((win: any) => {
    const commonService = win.commonService;
    const microbeTrace = commonService.visuals.microbeTrace;

    commonService.session.data.links = (commonService.session.data.links || [])
      .filter((link: any) => link?.hasDistance !== true);
    commonService.rebuildLinkMatrix();
    commonService.updateStatistics();
    microbeTrace.refreshThresholdStabilityPanel(false);
    microbeTrace.cdref.detectChanges();
  });
};

const openNetworkStatisticsView = (): void => {
  cy.get('[data-testid="app-view-menu-button"]', { timeout: 15000 }).click({ force: true });
  cy.get('[data-testid="app-view-menu-network-statistics"]', { timeout: 15000 }).click({ force: true });
  cy.get('[data-testid="network-statistics-view"]', { timeout: 15000 }).should('be.visible');
  cy.window({ timeout: 30000 }).should((win: any) => {
    expect(win.commonService.visuals.networkStatistics?.networkStatisticsResult).to.exist;
  });
};

describe('Journey Flow - Distance control availability', () => {
  it('disables pre-launch distance settings for epi-only files and enables them when a distance source is added', () => {
    visitAppAndAcceptEula();
    cy.loadFiles([
      { name: 'Issue1761Nodes.csv', datatype: 'node', field1: '_id', field2: 'None' },
      { name: 'Issue1761EpiLinks.csv', datatype: 'link', field1: 'source', field2: 'target' },
    ]);

    cy.get(byTestId(testIds.filesSettingsButton), { timeout: 15000 }).click({ force: true });
    cy.contains('.p-dialog-title', 'File Settings').parents('.p-dialog').as('fileSettingsDialog');
    cy.get('@fileSettingsDialog').find('[data-testid="file-distance-controls-unavailable"]')
      .should('contain.text', 'no molecular-distance data');
    cy.get('@fileSettingsDialog').find('#default-distance-metric').should('be.disabled');
    cy.get('@fileSettingsDialog').find('#default-distance-threshold').should('be.disabled');
    cy.get('@fileSettingsDialog').find('#default-view').should('be.enabled');
    cy.closeSettingsPane('File Settings');

    cy.loadFiles([
      {
        name: 'Issue1761DistanceLinks.csv',
        datatype: 'link',
        field1: 'source',
        field2: 'target',
        field3: 'distance',
      },
    ]);

    cy.get(byTestId(testIds.filesSettingsButton), { timeout: 15000 }).click({ force: true });
    cy.contains('.p-dialog-title', 'File Settings').parents('.p-dialog').as('fileSettingsDialogWithDistance');
    cy.get('@fileSettingsDialogWithDistance').find('[data-testid="file-distance-controls-unavailable"]')
      .should('not.exist');
    cy.get('@fileSettingsDialogWithDistance').find('#default-distance-metric').should('be.enabled');
    cy.get('@fileSettingsDialogWithDistance').find('#default-distance-threshold').should('be.enabled');
  });

  it('updates disabled state when distance links are added or removed and omits distance rows from epi statistics', () => {
    const csvExportPath = 'cypress/downloads/epi_network_statistics.csv';
    const workbookExportPath = 'cypress/downloads/epi_network_statistics.xlsx';

    launchProfileToTwoD(epiProfile);
    openGlobalFilteringTab();
    assertDistanceControlsDisabled();

    cy.window().then((win: any) => {
      const commonService = win.commonService;
      const microbeTrace = commonService.visuals.microbeTrace;
      const [source, target] = commonService.session.data.nodes;

      commonService.session.data.links.push({
        id: 'cypress-live-distance-capability',
        source: source._id,
        target: target._id,
        distance: 1,
        snps: 1,
        hasDistance: true,
        origin: ['Synthetic Distance'],
        distanceOrigin: 'Synthetic Distance',
        visible: true,
      });
      microbeTrace.refreshThresholdStabilityPanel(false);
      microbeTrace.cdref.detectChanges();
    });
    assertDistanceControlsEnabled();

    cy.window().then((win: any) => {
      const commonService = win.commonService;
      const microbeTrace = commonService.visuals.microbeTrace;

      commonService.session.data.links = commonService.session.data.links
        .filter((link: any) => link.id !== 'cypress-live-distance-capability');
      microbeTrace.refreshThresholdStabilityPanel(false);
      microbeTrace.cdref.detectChanges();
    });
    assertDistanceControlsDisabled();
    cy.closeGlobalSettings();

    openNetworkStatisticsView();
    cy.get('[data-testid="network-statistics-table-shell"]')
      .contains('td', /^Distance Metric$/)
      .should('not.exist');
    cy.get('[data-testid="network-statistics-table-shell"]')
      .contains('td', /^Threshold$/)
      .should('not.exist');

    installSaveAsCaptureHook();
    cy.window().then((win: any) => {
      win.commonService.visuals.networkStatistics.exportNetworkStatisticsCsv();
    });
    writeCapturedDownloadToDisk('network_statistics.csv', csvExportPath);
    cy.readFile(csvExportPath, 'utf8').should((csv) => {
      expect(csv).not.to.include('\r\nDistance Metric,');
      expect(csv).not.to.include('\r\nThreshold,');
      expect(csv).to.include('\r\nCalculation Mode,');
    });

    cy.get('[data-testid="network-statistics-export"]').click({ force: true });
    cy.get('[data-testid="network-statistics-export-confirm"]').click({ force: true });
    writeCapturedDownloadToDisk('network_statistics.xlsx', workbookExportPath);
    cy.readFile(workbookExportPath, 'binary').should((binaryWorkbook) => {
      const workbook = XLSX.read(binaryWorkbook, { type: 'binary' });
      const summaryRows = XLSX.utils.sheet_to_json<any[]>(workbook.Sheets.Summary, { header: 1 });
      const summaryMetrics = summaryRows.slice(1).map(([metric]) => metric);

      expect(summaryMetrics).not.to.include('Distance Metric');
      expect(summaryMetrics).not.to.include('Threshold');
      expect(summaryMetrics).to.include('Calculation Mode');
    });
  });

  it('keeps controls enabled for a FASTA session with no current distance links after save and restore', () => {
    const sessionFileBase = `cypress_distance_capability_${Date.now()}`;
    const sessionFilePath = `${Cypress.config('downloadsFolder')}/${sessionFileBase}.microbetrace`;

    launchProfileToTwoD(fastaProfile);
    openGlobalFilteringTab();
    setGlobalLinkThreshold(-1);
    cy.closeGlobalSettings();
    waitForProcessingDialogToClear(60000);
    removeMaterializedDistanceLinks();
    assertNoMaterializedDistanceLinks();
    cy.get('#link-threshold-statistic').should('be.visible');

    openGlobalFilteringTab();
    assertDistanceControlsEnabled();
    cy.closeGlobalSettings();
    saveSessionFromFileMenu(sessionFileBase);
    cy.readFile(sessionFilePath, 'utf8', { timeout: 30000 }).should('include', '"session"');

    visitAppAndAcceptEula();
    cy.get('#fileDropRef', { timeout: 15000 }).selectFile(sessionFilePath, { force: true });
    cy.window({ timeout: 60000 })
      .its('commonService.session.network.isFullyLoaded')
      .should('equal', true);
    ensureTwoDNetworkView();

    cy.window().then((win: any) => {
      expect(win.commonService.session.meta.anySequences, 'restored legacy metadata flag').to.equal(false);
      expect(
        win.commonService.session.data.nodes.some((node: any) => Boolean(node?.seq)),
        'restored sequence nodes',
      ).to.equal(true);
    });
    assertNoMaterializedDistanceLinks();
    cy.get('#link-threshold-statistic').should('be.visible');
    openGlobalFilteringTab();
    assertDistanceControlsEnabled();
  });

  it('keeps controls enabled for a Newick source after its materialized distance links are removed', () => {
    launchProfileToTwoD(newickProfile);
    removeMaterializedDistanceLinks();
    assertNoMaterializedDistanceLinks();
    cy.window().its('commonService.session.data.newickString').should('be.a', 'string').and('not.be.empty');
    cy.get('#link-threshold-statistic').should('be.visible');
    openGlobalFilteringTab();
    assertDistanceControlsEnabled();
  });
});
