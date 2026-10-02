/// <reference types="cypress" />

import * as XLSX from 'xlsx';
import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  installSaveAsCaptureHook,
  launchProfileToTwoD,
  setGlobalLinkThreshold,
  writeCapturedDownloadToDisk,
} from '../../../support/journey-helpers';

const waitForStatistics = (expectedLinks: number): void => {
  cy.window({ timeout: 30000 }).should((win: any) => {
    const result = win.commonService.visuals.networkStatistics?.networkStatisticsResult;
    expect(result, 'network statistics result').to.exist;
    expect(result.summary.linkCount, 'statistics visible link count').to.equal(expectedLinks);
  });
};

const openNetworkStatisticsView = (): void => {
  cy.get('[data-testid="app-view-menu-button"]', { timeout: 15000 }).click({ force: true });
  cy.get('[data-testid="app-view-menu-network-statistics"]', { timeout: 15000 }).click({ force: true });
  cy.get('[data-testid="network-statistics-view"]', { timeout: 15000 }).should('be.visible');
};

const selectStatisticsSection = (label: string): void => {
  cy.get('[data-testid="network-statistics-section-select"]')
    .find('.p-select-dropdown')
    .click({ force: true });
  cy.get('.p-select-overlay:visible li[role="option"]', { timeout: 15000 })
    .contains(label)
    .click({ force: true });
};

const expectTrimmedCellText = (index: number, text: string): void => {
  cy.get('td')
    .eq(index)
    .invoke('text')
    .then((cellText) => {
      expect(cellText.trim()).to.equal(text);
    });
};

describe('Journey Flow - Network Statistics view', () => {
  const profile = getProfile('network-statistics-panel');
  const mixedLinkProfile = getProfile('filtering-mixed-origin-nearest-neighbor');

  it('recalculates filter-aware statistics and exports each section to its own workbook sheet', () => {
    const exportPath = 'cypress/downloads/network_statistics_view.xlsx';

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);

    cy.get('#network-statistics-wrapper', { timeout: 15000 }).should('be.visible');
    cy.get('#numberOfNodes').should('have.text', '6');
    cy.get('#numberOfVisibleLinks').should('have.text', '6');
    cy.get('#numberOfSingletonNodes').should('have.text', '0');
    cy.get('#network-statistics-wrapper').within(() => {
      cy.get('[data-testid="network-statistics-export"]').should('not.exist');
      cy.get('[data-testid="network-statistics-summary"]').should('not.exist');
    });

    openNetworkStatisticsView();
    waitForStatistics(6);

    cy.get('[data-testid="network-statistics-narrative"]')
      .should('be.visible')
      .and('contain.text', 'Genetic network interpretation')
      .and('contain.text', 'All 6 nodes in the visible genetic network are connected in one component')
      .and('contain.text', '6 molecular-only (100%)')
      .and('contain.text', '0 epidemiologic-only (0%)')
      .and('contain.text', '0 duo-links (0%)')
      .and('contain.text', 'Each visible node pair counts as one link')
      .and('contain.text', 'do not establish transmission direction or causality');
    cy.get('[data-testid="network-statistics-narrative-method"]')
      .should('contain.text', 'How this was calculated')
      .and('not.contain.text', 'artificial intelligence');
    cy.get('[data-testid="network-statistics-calculation-mode"]')
      .invoke('text')
      .then((text) => expect(text.trim()).to.equal('Exact calculation'));

    cy.window().then((win: any) => {
      const metrics = win.commonService.visuals.networkStatistics.networkStatisticsResult.summary.componentMetrics;

      expect(metrics, 'component metrics for the visible network').to.deep.include({
        nodeCount: 6,
        componentCount: 1,
        clusterCount: 1,
        singletonCount: 0,
        clusteredNodeCount: 6,
        largestClusterSize: 6,
        secondLargestClusterSize: 0,
        largestClusterFraction: 1,
        secondLargestClusterFraction: 0,
        clusteredFraction: 1,
        singletonFraction: 0,
        giniCoefficient: 0,
        meanClusterSize: 6,
        medianClusterSize: 6,
        largestToMeanClusterRatio: 1,
        largestToMedianClusterRatio: 1,
        l2ToL1Ratio: 0,
      });
    });
    cy.get('[data-testid="network-statistics-table-shell"]')
      .should('contain.text', 'Nodes')
      .and('contain.text', '6')
      .and('contain.text', 'Non-singleton Components')
      .and('contain.text', 'Largest Component Fraction (L1)')
      .and('contain.text', 'Connected-node Fraction')
      .and('contain.text', 'Component-size Gini')
      .and('contain.text', 'Largest / Median Component Size')
      .and('contain.text', 'L2 / L1')
      .and('not.contain.text', 'Approximate Betweenness')
      .and('not.contain.text', 'Approximate Path Metrics')
      .and('not.contain.text', 'Sampled Sources')
      .and('contain.text', 'Density');
    cy.get('[data-testid="network-statistics-table-shell"] .p-paginator-rpp-dropdown .p-select-label')
      .should(($label) => {
        expect($label.text().trim()).to.equal('25');
      });
    cy.get('[data-testid="network-statistics-table-shell"]').then(($shell) => {
      const shellWidth = $shell[0].getBoundingClientRect().width;
      cy.wrap($shell)
        .find('.p-datatable-table')
        .first()
        .should(($table) => {
          expect($table[0].getBoundingClientRect().width).to.be.greaterThan(shellWidth - 24);
        });
    });

    selectStatisticsSection('Components');
    cy.get('[data-testid="network-statistics-table-shell"]')
      .should('contain.text', 'Component ID');

    selectStatisticsSection('Node Centrality');

    cy.get('[data-testid="network-statistics-table-shell"] tbody tr')
      .first()
      .within(() => {
        expectTrimmedCellText(0, 'C');
        expectTrimmedCellText(1, '0');
        expectTrimmedCellText(2, '3');
        expectTrimmedCellText(3, '0.6');
      });

    installSaveAsCaptureHook();
    cy.get('[data-testid="network-statistics-export"]').click({ force: true });
    cy.get('[data-testid="network-statistics-export-confirm"]').click({ force: true });
    writeCapturedDownloadToDisk('network_statistics.xlsx', exportPath);
    cy.readFile(exportPath, 'binary').should((binaryWorkbook) => {
      const workbook = XLSX.read(binaryWorkbook, { type: 'binary' });
      expect(workbook.SheetNames).to.deep.equal([
        'Summary',
        'Degree Distribution',
        'Node Centrality',
        'Components',
        'Interpretation',
      ]);

      const summaryRows = XLSX.utils.sheet_to_json<any[]>(workbook.Sheets.Summary, { header: 1 });
      const degreeRows = XLSX.utils.sheet_to_json<any[]>(workbook.Sheets['Degree Distribution'], { header: 1 });
      const centralityRows = XLSX.utils.sheet_to_json<any[]>(workbook.Sheets['Node Centrality'], { header: 1 });
      const clusterRows = XLSX.utils.sheet_to_json<any[]>(workbook.Sheets.Components, { header: 1 });
      const interpretationRows = XLSX.utils.sheet_to_json<any[]>(workbook.Sheets.Interpretation, { header: 1 });

      expect(summaryRows[0]).to.deep.equal(['Metric', 'Value']);
      expect(summaryRows).to.deep.include(['Nodes', 6]);
      expect(summaryRows).to.deep.include(['Molecular-only Links', 6]);
      expect(summaryRows).to.deep.include(['Epidemiologic-only Links', 0]);
      expect(summaryRows).to.deep.include(['Duo-links', 0]);
      expect(summaryRows).to.deep.include(['Non-singleton Components', 1]);
      expect(summaryRows).to.deep.include(['Largest Component Fraction (L1)', 1]);
      expect(summaryRows).to.deep.include(['Second-largest Component Fraction (L2)', 0]);
      expect(summaryRows).to.deep.include(['Connected-node Fraction', 1]);
      expect(summaryRows).to.deep.include(['Singleton Fraction', 0]);
      expect(summaryRows).to.deep.include(['Component-size Gini', 0]);
      expect(summaryRows).to.deep.include(['Largest / Median Component Size', 1]);
      expect(summaryRows).to.deep.include(['L2 / L1', 0]);
      expect(degreeRows[0]).to.deep.equal(['Degree', 'Node Count', 'Fraction']);
      expect(centralityRows[0]).to.deep.equal([
        'Node ID',
        'Component ID',
        'Degree',
        'Normalized Degree',
        'Betweenness',
        'Normalized Betweenness',
      ]);
      expect(clusterRows[0]).to.deep.equal([
        'Component ID',
        'Node Count',
        'Link Count',
        'Density',
        'Average Degree',
        'Max Degree',
        'Diameter',
        'Diameter Approximate',
        'Member IDs',
      ]);
      expect(interpretationRows[0]).to.deep.equal(['Section', 'Interpretation']);
      expect(interpretationRows).to.deep.include([
        'Calculation mode',
        'Exact calculation',
      ]);
      expect(
        interpretationRows.some((row) => row[0] === 'Interpretation limits'
          && String(row[1]).includes('do not establish transmission direction or causality')),
        'deterministic interpretation caveat',
      ).to.equal(true);

      const workbookText = JSON.stringify(workbook.Sheets);
      expect(workbookText).not.to.include('record_type');
      expect(workbookText).not.to.include('component_id');
      expect(workbookText).not.to.include('componentCount');
    });

    cy.openGlobalSettings();
    cy.contains('#global-settings-modal .nav-link', 'Filtering').click({ force: true });
    setGlobalLinkThreshold(0.5);
    cy.closeGlobalSettings();

    waitForStatistics(0);
    cy.window().then((win: any) => {
      const metrics = win.commonService.visuals.networkStatistics.networkStatisticsResult.summary.componentMetrics;

      expect(metrics, 'component metrics after visible-network threshold filtering').to.deep.include({
        nodeCount: 6,
        componentCount: 6,
        clusterCount: 0,
        singletonCount: 6,
        clusteredNodeCount: 0,
        largestClusterSize: 0,
        secondLargestClusterSize: 0,
        largestClusterFraction: 0,
        secondLargestClusterFraction: 0,
        clusteredFraction: 0,
        singletonFraction: 1,
        giniCoefficient: 0,
        meanClusterSize: 0,
        medianClusterSize: 0,
        largestToMeanClusterRatio: 0,
        largestToMedianClusterRatio: 0,
        l2ToL1Ratio: 0,
      });
    });
    selectStatisticsSection('Summary');
    cy.get('[data-testid="network-statistics-narrative"]')
      .should('be.visible')
      .and('contain.text', '6 visible nodes have no visible links')
      .and('contain.text', 'All visible nodes are singletons');
    cy.get('[data-testid="network-statistics-table-shell"]')
      .should('contain.text', 'Links')
      .and('contain.text', '0')
      .and('contain.text', 'Singleton Fraction');

    selectStatisticsSection('Degree Distribution');
    cy.get('[data-testid="network-statistics-table-shell"] tbody tr')
      .first()
      .within(() => {
        expectTrimmedCellText(0, '0');
        expectTrimmedCellText(1, '6');
      });
  });

  it('counts a visible molecular and epidemiologic relationship as one duo-link', () => {
    launchProfileToTwoD(mixedLinkProfile);
    assertAfterLaunchCounts(mixedLinkProfile);
    openNetworkStatisticsView();
    waitForStatistics(17);

    cy.window().then((win: any) => {
      const summary = win.commonService.visuals.networkStatistics.networkStatisticsResult.summary;
      expect(summary.linkCount, 'deduplicated visible endpoint pairs').to.equal(17);
      expect(summary.linkEvidence, 'visible evidence categories').to.deep.equal({
        molecularOnlyLinkCount: 10,
        epidemiologicOnlyLinkCount: 0,
        duoLinkCount: 7,
        unclassifiedLinkCount: 0,
      });
    });

    cy.get('[data-testid="network-statistics-layer-select"] .p-select-label')
      .should('contain.text', 'Compare all');
    cy.get('[data-testid="network-statistics-layer-comparison"]')
      .should('be.visible')
      .and('contain.text', 'Layer-specific statistics are authoritative')
      .and('contain.text', 'counts once in the combined graph');
    cy.get('[data-testid="network-statistics-layer-row-genetic"]')
      .should('contain.text', 'Genetic')
      .and('contain.text', '17');
    cy.get('[data-testid="network-statistics-layer-row-epidemiologic"]')
      .should('contain.text', 'Epidemiologic')
      .and('contain.text', '7');
    cy.get('[data-testid="network-statistics-layer-row-combined"]')
      .should('contain.text', 'Combined')
      .and('contain.text', '17');
    cy.get('[data-testid="network-statistics-evidence-composition"]')
      .should('contain.text', 'Genetic only')
      .and('contain.text', '10')
      .and('contain.text', 'Epidemiologic only')
      .and('contain.text', 'Genetic + epidemiologic')
      .and('contain.text', '7')
      .and('contain.text', 'Total unique relationships')
      .and('contain.text', '17');
  });
});
