/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  assertWaterfallReady,
  goToWaterfallView,
  launchProfileToTwoD,
} from '../../../support/journey-helpers';

type LargeWaterfallCase = {
  firstClusterId: string;
  firstClusterNodeCount: number;
  expectedClusterCount: number;
  interactiveClusterId: string;
  interactiveClusterNodeCount: number;
};

describe('Journey Flow - Waterfall large uploaded smoke', () => {
  const profile = getProfile('load-large-node-link-smoke');

  it('opens Waterfall on the large uploaded network and keeps the drilldown interactive', () => {
    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);

    goToWaterfallView();
    assertWaterfallReady(60000);

    cy.window().then((win: any) => {
      const rows = win.commonService.visuals.waterfall.clusterTableData || [];
      const interactiveRow = rows.find((row: any) => Number(row.nodeCount) > 1);

      expect(rows.length, 'large Waterfall cluster count').to.be.greaterThan(1000);
      expect(interactiveRow, 'cluster with multiple nodes').to.exist;

      cy.wrap<LargeWaterfallCase>({
        firstClusterId: String(rows[0].id),
        firstClusterNodeCount: Number(rows[0].nodeCount),
        expectedClusterCount: rows.length,
        interactiveClusterId: String(interactiveRow.id),
        interactiveClusterNodeCount: Number(interactiveRow.nodeCount),
      }, { log: false }).as('largeWaterfallCase');
    });

    cy.get<LargeWaterfallCase>('@largeWaterfallCase').then((largeWaterfallCase) => {
      cy.get('#waterfall-cluster-table-container tbody tr.ui-selectable-row', { timeout: 60000 })
        .should(($rows) => {
          expect($rows.length, 'rendered Waterfall cluster rows').to.equal(largeWaterfallCase.expectedClusterCount);
        });

      cy.get('#waterfall-cluster-table-container tbody tr.ui-selectable-row')
        .first()
        .find('td')
        .then(($cells) => {
          expect(String($cells.eq(0).text()).trim(), 'first rendered cluster id').to.equal(largeWaterfallCase.firstClusterId);
          expect(parseInt(String($cells.eq(1).text()).replace(/,/g, '').trim(), 10), 'first rendered cluster node count')
            .to.equal(largeWaterfallCase.firstClusterNodeCount);
        });

      cy.contains('#waterfall-cluster-table-container tbody tr.ui-selectable-row', largeWaterfallCase.interactiveClusterId)
        .should('exist')
        .click();

      cy.window()
        .its('commonService.visuals.waterfall.selectedClusterRow.id')
        .should((selectedClusterId) => {
          expect(String(selectedClusterId), 'selected large Waterfall cluster').to.equal(largeWaterfallCase.interactiveClusterId);
        });

      cy.get('#waterfall-node-table-container tbody tr.ui-selectable-row', { timeout: 60000 })
        .should('have.length', largeWaterfallCase.interactiveClusterNodeCount)
        .first()
        .click();

      cy.window().should((win: any) => {
        const waterfall = win.commonService.visuals.waterfall;
        expect(String(waterfall.selectedNodeRow?.id ?? ''), 'selected Waterfall node').to.not.equal('');
        expect((waterfall.linkTableData || []).length, 'large Waterfall link drilldown rows').to.be.greaterThan(0);
      });

      cy.get('#waterfall-link-table-container tbody tr.ui-selectable-row', { timeout: 60000 })
        .should(($rows) => {
          expect($rows.length, 'rendered Waterfall link drilldown rows').to.be.greaterThan(0);
        });
    });
  });
});
