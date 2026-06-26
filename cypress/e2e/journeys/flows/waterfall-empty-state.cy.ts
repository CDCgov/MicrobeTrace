/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  launchProfileToWaterfall,
  openGlobalFilteringTab,
  visitAppAndAcceptEula,
  waitForProcessingDialogToClear,
} from '../../../support/journey-helpers';
import { byTestId, testIds } from '../../../support/selectors';

describe('Journey Flow - Waterfall empty states', () => {
  const filteringProfile = getProfile('filtering-min-cluster-reveal-epi-linklist');

  it('shows the empty-state prompt when Waterfall opens without uploaded data', () => {
    visitAppAndAcceptEula();
    cy.get('[data-testid="app-view-menu-button"]', { timeout: 15000 }).click({ force: true });
    cy.contains('button[mat-menu-item]', 'Waterfall', { timeout: 15000 }).click({ force: true });

    cy.get('#waterfall-view', { timeout: 15000 }).should('be.visible');

    cy.get('#waterfall-empty-state', { timeout: 15000 })
      .should('be.visible')
      .and('contain.text', 'Please add data files to load...');

    cy.get('#waterfall-cluster-table-container .p-datatable').should('not.exist');
    cy.get('#waterfall-node-table-container .p-datatable').should('not.exist');
    cy.get('#waterfall-link-table-container .p-datatable').should('not.exist');

    cy.window()
      .its('commonService.visuals.waterfall.IsDataAvailable')
      .should('equal', false);
  });

  it('switches into the empty state when filtering hides every visible cluster and Reveal Everything restores Waterfall', () => {
    launchProfileToWaterfall(filteringProfile);
    assertAfterLaunchCounts(filteringProfile);

    cy.window().then((win: any) => {
      const largestClusterSize = Math.max(
        ...((win.commonService.session.data.clusters || []).map((cluster: any) => Number(cluster.nodes ?? 0))),
      );

      expect(largestClusterSize, 'largest cluster size').to.be.greaterThan(0);
      cy.wrap(largestClusterSize + 1, { log: false }).as('waterfallHideAllMinimumClusterSize');
    });

    cy.get<number>('@waterfallHideAllMinimumClusterSize').then((minimumClusterSize) => {
      openGlobalFilteringTab();
      cy.get(byTestId(testIds.filterMinimumClusterSize))
        .should('be.visible')
        .then(($input) => {
          const input = $input.get(0) as HTMLInputElement;
          input.focus();
          input.value = String(minimumClusterSize);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          input.blur();
        });
      cy.closeGlobalSettings();
      waitForProcessingDialogToClear();

      cy.get('#waterfall-empty-state', { timeout: 20000 })
        .should('be.visible')
        .and('contain.text', 'Please add data files to load...');

      cy.get('#waterfall-cluster-table-container .p-datatable').should('not.exist');
      cy.get('#waterfall-node-table-container .p-datatable').should('not.exist');
      cy.get('#waterfall-link-table-container .p-datatable').should('not.exist');

      cy.window().should((win: any) => {
        const waterfall = win.commonService.visuals.waterfall;
        expect(waterfall.IsDataAvailable, 'Waterfall empty-state availability').to.equal(false);
        expect(waterfall.clusterTableData, 'Waterfall cluster rows').to.deep.equal([]);
        expect(waterfall.nodeTableData, 'Waterfall node rows').to.deep.equal([]);
        expect(waterfall.linkTableData, 'Waterfall link rows').to.deep.equal([]);
      });

      openGlobalFilteringTab();
      cy.get(byTestId(testIds.filterRevealEverything)).click({ force: true });
      cy.closeGlobalSettings();
      waitForProcessingDialogToClear();

      cy.get('#waterfall-empty-state').should('not.exist');
      cy.get('#waterfall-cluster-table-container tbody tr.ui-selectable-row', { timeout: 20000 })
        .should(($rows) => {
          expect($rows.length, 'restored Waterfall cluster row count').to.be.greaterThan(0);
        });

      cy.window().should((win: any) => {
        const waterfall = win.commonService.visuals.waterfall;
        expect(waterfall.IsDataAvailable, 'Waterfall data restored').to.equal(true);
        expect((waterfall.clusterTableData || []).length, 'restored Waterfall cluster rows').to.be.greaterThan(0);
      });
    });
  });
});
