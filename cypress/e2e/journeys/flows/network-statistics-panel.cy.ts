/// <reference types="cypress" />

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

  it('recalculates filter-aware statistics and exports the current rows', () => {
    const exportPath = 'cypress/downloads/network_statistics_view.csv';

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
    writeCapturedDownloadToDisk('network_statistics.csv', exportPath);
    cy.readFile(exportPath, 'utf8').should((csvText) => {
      expect(csvText).to.include('Network Statistics Summary');
      expect(csvText).to.include('Metric,Value');
      expect(csvText).to.include('Nodes,6');
      expect(csvText).to.include('Clusters,1');
      expect(csvText).to.include('Degree Distribution');
      expect(csvText).to.include('Degree,Node Count,Fraction');
      expect(csvText).to.include('Node Centrality');
      expect(csvText).to.include('Node ID,Cluster ID,Degree,Normalized Degree,Betweenness,Normalized Betweenness');
      expect(csvText).to.include('Cluster ID,Node Count,Link Count,Density,Average Degree,Max Degree,Diameter,Diameter Approximate,Member IDs');
      expect(csvText).not.to.include('record_type');
      expect(csvText).not.to.include('component_id');
      expect(csvText).not.to.include('componentCount');
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
