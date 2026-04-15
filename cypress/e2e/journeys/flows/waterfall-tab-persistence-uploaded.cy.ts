/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  assertTableReady,
  assertWaterfallReady,
  goToTableView,
  goToWaterfallView,
  launchProfileToWaterfall,
} from '../../../support/journey-helpers';
import { byTestId, testIds } from '../../../support/selectors';

type WaterfallPersistenceCase = {
  clusterId: string;
  nodeId: string;
  nodeRowCount: number;
  linkPeerId: string;
  linkIndex: number;
  linkRowCount: number;
  clusterExpansionText: string;
  nodeExpansionText: string;
  linkExpansionText: string;
};

describe('Journey Flow - Waterfall tab persistence on uploaded data', () => {
  const profile = getProfile('style-apply-cypress-test-style');

  it('keeps the selected Waterfall drilldown and visible expansion rows after switching away and back', () => {
    launchProfileToWaterfall(profile);
    assertAfterLaunchCounts(profile);

    cy.window().then((win: any) => {
      const clusterRow = (win.commonService.visuals.waterfall.clusterTableData || [])
        .find((row: any) => Number(row.nodeCount) > 1);

      expect(clusterRow, 'Waterfall cluster row with multiple nodes').to.exist;
      cy.wrap(String(clusterRow.id), { log: false }).as('waterfallPersistenceClusterId');
      cy.wrap(Number(clusterRow.nodeCount), { log: false }).as('waterfallPersistenceNodeRowCount');
    });

    cy.get<string>('@waterfallPersistenceClusterId').then((clusterId) => {
      cy.contains('#waterfall-cluster-table-container tbody tr.ui-selectable-row', clusterId)
        .should('exist')
        .click();
    });

    cy.get(byTestId(testIds.waterfallClusterExpansion), { timeout: 20000 })
      .should('be.visible')
      .invoke('text')
      .then((text) => {
        cy.wrap(String(text).trim(), { log: false }).as('waterfallPersistenceClusterExpansionText');
      });

    cy.get('#waterfall-node-table-container tbody tr.ui-selectable-row', { timeout: 20000 })
      .first()
      .then(($row) => {
        const cells = $row.find('td');
        cy.wrap(String(cells.eq(0).text()).trim(), { log: false }).as('waterfallPersistenceNodeId');
        cy.wrap($row).click();
      })

    cy.get(byTestId(testIds.waterfallNodeExpansion), { timeout: 20000 })
      .should('be.visible')
      .invoke('text')
      .then((text) => {
        cy.wrap(String(text).trim(), { log: false }).as('waterfallPersistenceNodeExpansionText');
      });

    cy.window().then((win: any) => {
      const waterfall = win.commonService.visuals.waterfall;
      expect((waterfall.linkTableData || []).length, 'Waterfall link rows after node selection').to.be.greaterThan(0);
      cy.wrap((waterfall.linkTableData || []).length, { log: false }).as('waterfallPersistenceLinkRowCount');
    });

    cy.get('#waterfall-link-table-container tbody tr.ui-selectable-row', { timeout: 20000 })
      .first()
      .then(($row) => {
        const cells = $row.find('td');
        cy.wrap(String(cells.eq(0).text()).trim(), { log: false }).as('waterfallPersistenceLinkPeerId');
        cy.wrap($row).click();
      })

    cy.window()
      .its('commonService.visuals.waterfall.selectedLinkRow.index')
      .then((linkIndex) => {
        cy.wrap(Number(linkIndex), { log: false }).as('waterfallPersistenceLinkIndex');
      });

    cy.get(byTestId(testIds.waterfallLinkExpansion), { timeout: 20000 })
      .should('be.visible')
      .invoke('text')
      .then((text) => {
        cy.wrap(String(text).trim(), { log: false }).as('waterfallPersistenceLinkExpansionText');
      });

    cy.get<string>('@waterfallPersistenceClusterId').then((clusterId) => {
      cy.get<string>('@waterfallPersistenceNodeId').then((nodeId) => {
        cy.get<number>('@waterfallPersistenceNodeRowCount').then((nodeRowCount) => {
          cy.get<string>('@waterfallPersistenceLinkPeerId').then((linkPeerId) => {
            cy.get<number>('@waterfallPersistenceLinkIndex').then((linkIndex) => {
              cy.get<number>('@waterfallPersistenceLinkRowCount').then((linkRowCount) => {
                cy.get<string>('@waterfallPersistenceClusterExpansionText').then((clusterExpansionText) => {
                  cy.get<string>('@waterfallPersistenceNodeExpansionText').then((nodeExpansionText) => {
                    cy.get<string>('@waterfallPersistenceLinkExpansionText').then((linkExpansionText) => {
                      cy.wrap<WaterfallPersistenceCase>({
                        clusterId,
                        nodeId,
                        nodeRowCount,
                        linkPeerId,
                        linkIndex,
                        linkRowCount,
                        clusterExpansionText,
                        nodeExpansionText,
                        linkExpansionText,
                      }, { log: false }).as('waterfallPersistenceCase');
                    });
                  });
                });
              });
            });
          });
        });
      });
    });

    goToTableView();
    assertTableReady();

    cy.get<WaterfallPersistenceCase>('@waterfallPersistenceCase').then((waterfallCase) => {
      goToWaterfallView();
      assertWaterfallReady();

      cy.window().should((win: any) => {
        const waterfall = win.commonService.visuals.waterfall;
        expect(String(waterfall.selectedClusterRow?.id ?? ''), 'restored Waterfall cluster').to.equal(waterfallCase.clusterId);
        expect(String(waterfall.selectedNodeRow?.id ?? ''), 'restored Waterfall node').to.equal(waterfallCase.nodeId);
        expect(Number(waterfall.selectedLinkRow?.index), 'restored Waterfall link').to.equal(waterfallCase.linkIndex);
      });

      cy.get('#waterfall-node-table-container tbody tr.ui-selectable-row')
        .should('have.length', waterfallCase.nodeRowCount);
      cy.get('#waterfall-link-table-container tbody tr.ui-selectable-row')
        .should('have.length', waterfallCase.linkRowCount);

      cy.contains('#waterfall-node-table-container tbody tr.ui-selectable-row', waterfallCase.nodeId)
        .should('exist');
      cy.contains('#waterfall-link-table-container tbody tr.ui-selectable-row', waterfallCase.linkPeerId)
        .should('exist');

      cy.get(byTestId(testIds.waterfallClusterExpansion))
        .should('be.visible')
        .and('contain.text', waterfallCase.clusterExpansionText);
      cy.get(byTestId(testIds.waterfallNodeExpansion))
        .should('be.visible')
        .and('contain.text', waterfallCase.nodeExpansionText);
      cy.get(byTestId(testIds.waterfallLinkExpansion))
        .should('be.visible')
        .and('contain.text', waterfallCase.linkExpansionText);
    });
  });
});
