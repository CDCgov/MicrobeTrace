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
    const result = win.commonService.visuals.twoD?.networkStatisticsResult;
    expect(result, 'network statistics result').to.exist;
    expect(result.summary.linkCount, 'statistics visible link count').to.equal(expectedLinks);
  });
};

describe('Journey Flow - Network Statistics panel', () => {
  const profile = getProfile('network-statistics-panel');

  it('recalculates filter-aware statistics and exports the current rows', () => {
    const exportPath = 'cypress/downloads/network_statistics_panel.csv';

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    waitForStatistics(6);

    cy.get('[data-testid="network-statistics-panel"]', { timeout: 15000 })
      .should('be.visible');
    cy.get('[data-testid="network-statistics-summary"]')
      .should('contain.text', 'Components')
      .and('contain.text', 'Density');
    cy.get('#numberOfNodes').should('have.text', '6');
    cy.get('#numberOfVisibleLinks').should('have.text', '6');
    cy.get('#numberOfSingletonNodes').should('have.text', '0');

    cy.get('[data-testid="network-statistics-centrality-table"] tbody tr')
      .first()
      .within(() => {
        cy.get('td').eq(0).should('have.text', 'C');
        cy.get('td').eq(1).should('have.text', '0');
        cy.get('td').eq(2).should('have.text', '3');
        cy.get('td').eq(3).should('have.text', '0.6');
      });

    installSaveAsCaptureHook();
    cy.get('[data-testid="network-statistics-export"]').click({ force: true });
    writeCapturedDownloadToDisk('network_statistics.csv', exportPath);
    cy.readFile(exportPath, 'utf8').should((csvText) => {
      expect(csvText).to.include('record_type,key,value');
      expect(csvText).to.include('summary,nodeCount,6');
      expect(csvText).to.include('degree_bucket');
      expect(csvText).to.include('node_centrality');
      expect(csvText).to.include('component');
    });

    cy.openGlobalSettings();
    cy.contains('#global-settings-modal .nav-link', 'Filtering').click({ force: true });
    setGlobalLinkThreshold(0.5);
    cy.closeGlobalSettings();

    waitForStatistics(0);
    cy.get('#numberOfVisibleLinks').should('have.text', '0');
    cy.get('#numberOfSingletonNodes').should('have.text', '6');
    cy.get('[data-testid="network-statistics-degree-table"] tbody tr')
      .first()
      .within(() => {
        cy.get('td').eq(0).should('have.text', '0');
        cy.get('td').eq(1).should('have.text', '6');
      });
  });
});
