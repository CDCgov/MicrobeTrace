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

    cy.get('[data-testid="network-statistics-table-shell"]')
      .should('contain.text', 'Nodes')
      .and('contain.text', '6')
      .and('contain.text', 'Clusters')
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
    selectStatisticsSection('Summary');
    cy.get('[data-testid="network-statistics-table-shell"]')
      .should('contain.text', 'Links')
      .and('contain.text', '0');

    selectStatisticsSection('Degree Distribution');
    cy.get('[data-testid="network-statistics-table-shell"] tbody tr')
      .first()
      .within(() => {
        expectTrimmedCellText(0, '0');
        expectTrimmedCellText(1, '6');
      });
  });
});
