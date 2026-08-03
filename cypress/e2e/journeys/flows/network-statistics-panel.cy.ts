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
      .and('contain.text', 'Clusters')
      .and('contain.text', 'Largest Cluster Fraction (L1)')
      .and('contain.text', 'Clustered Fraction')
      .and('contain.text', 'Component-size Gini')
      .and('contain.text', 'Largest / Median Cluster Size')
      .and('contain.text', 'L2 / L1')
      .and('not.contain.text', 'Non-singleton Clusters')
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

    selectStatisticsSection('Clusters');
    cy.get('[data-testid="network-statistics-table-shell"]')
      .should('contain.text', 'Cluster ID');

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
        'Clusters',
      ]);

      const summaryRows = XLSX.utils.sheet_to_json<any[]>(workbook.Sheets.Summary, { header: 1 });
      const degreeRows = XLSX.utils.sheet_to_json<any[]>(workbook.Sheets['Degree Distribution'], { header: 1 });
      const centralityRows = XLSX.utils.sheet_to_json<any[]>(workbook.Sheets['Node Centrality'], { header: 1 });
      const clusterRows = XLSX.utils.sheet_to_json<any[]>(workbook.Sheets.Clusters, { header: 1 });

      expect(summaryRows[0]).to.deep.equal(['Metric', 'Value']);
      expect(summaryRows).to.deep.include(['Nodes', 6]);
      expect(summaryRows).to.deep.include(['Clusters', 1]);
      expect(summaryRows).to.deep.include(['Largest Cluster Fraction (L1)', 1]);
      expect(summaryRows).to.deep.include(['Second-largest Cluster Fraction (L2)', 0]);
      expect(summaryRows).to.deep.include(['Clustered Fraction', 1]);
      expect(summaryRows).to.deep.include(['Singleton Fraction', 0]);
      expect(summaryRows).to.deep.include(['Component-size Gini', 0]);
      expect(summaryRows).to.deep.include(['Largest / Median Cluster Size', 1]);
      expect(summaryRows).to.deep.include(['L2 / L1', 0]);
      expect(degreeRows[0]).to.deep.equal(['Degree', 'Node Count', 'Fraction']);
      expect(centralityRows[0]).to.deep.equal([
        'Node ID',
        'Cluster ID',
        'Degree',
        'Normalized Degree',
        'Betweenness',
        'Normalized Betweenness',
      ]);
      expect(clusterRows[0]).to.deep.equal([
        'Cluster ID',
        'Node Count',
        'Link Count',
        'Density',
        'Average Degree',
        'Max Degree',
        'Diameter',
        'Diameter Approximate',
        'Member IDs',
      ]);

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
});
