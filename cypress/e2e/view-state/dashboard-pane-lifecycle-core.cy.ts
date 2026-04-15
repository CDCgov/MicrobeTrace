/// <reference types="cypress" />

import {
  visitAppAndAcceptEula,
} from '../../support/journey-helpers';
import {
  assertDashboardViewReady,
  assertOpenDashboardTabs,
  assertPaneRect,
  emitDashboardContainerLifecycle,
  focusDashboardTab,
  loadDashboardSessionFixture,
} from '../../support/dashboard-helpers';
import { readRenderedAggregateRows } from '../../support/aggregate-helpers';
import { readRenderedCrosstab } from '../../support/crosstab-helpers';

type WaterfallClusterRow = {
  id: string;
  nodeCount: number;
};

const LIFECYCLE_TABS = ['2D Network', 'Table', 'Aggregate', 'Crosstab', 'Waterfall'];

const readWaterfallClusterRows = (): Cypress.Chainable<WaterfallClusterRow[]> => {
  return cy.get('#waterfall-cluster-table-container tbody tr.ui-selectable-row', { timeout: 15000 })
    .then(($rows) => {
      return Array.from($rows).map((row) => {
        const cells = row.querySelectorAll('td');

        return {
          id: String(cells.item(0)?.textContent || '').trim(),
          nodeCount: Number(String(cells.item(1)?.textContent || '').trim()),
        };
      });
    });
};

const captureVisibleTableState = (): Cypress.Chainable<{
  scrollHeight: string;
  selectedRows: number;
  visibleRows: number;
}> => {
  return cy.window().then((win: any) => ({
    scrollHeight: String(win.commonService.visuals.tableComp.scrollHeight || ''),
    selectedRows: Number(win.commonService.visuals.tableComp.selectedRows || 0),
    visibleRows: Number(
      win.document.querySelectorAll('.table-wrapper .p-datatable-tbody > tr').length || 0,
    ),
  }));
};

describe('Dashboard View State - pane lifecycle resilience', () => {
  beforeEach(() => {
    visitAppAndAcceptEula();
    loadDashboardSessionFixture('dashboard-pane-lifecycle-core.microbetrace');
    assertOpenDashboardTabs(LIFECYCLE_TABS);
  });

  it('keeps Table, Aggregate, Crosstab, and Waterfall coherent through hide, show, and resize lifecycle events', () => {
    focusDashboardTab('Table');
    captureVisibleTableState().as('tableBeforeResize');
    emitDashboardContainerLifecycle('Table', 'resize');

    cy.get('@tableBeforeResize').then((before) => {
      captureVisibleTableState().should((after) => {
        expect(after.visibleRows, 'Table visible rows after resize').to.be.greaterThan(0);
        expect(after.selectedRows, 'Table selectedRows after resize').to.be.greaterThan(0);
        expect(after.scrollHeight, 'Table scrollHeight after resize').not.to.equal((before as any).scrollHeight);
      });
    });

    emitDashboardContainerLifecycle('Table', 'hide');
    cy.get('.table-wrapper').should('not.be.visible');
    emitDashboardContainerLifecycle('Table', 'show');
    assertDashboardViewReady('Table');
    assertPaneRect('.table-wrapper', 180, 140);

    focusDashboardTab('Aggregate');
    readRenderedAggregateRows(0).as('aggregateBaselineRows');
    emitDashboardContainerLifecycle('Aggregate', 'resize');
    readRenderedAggregateRows(0).should((rows) => {
      expect(rows.length, 'Aggregate rows after resize').to.be.greaterThan(0);
    });
    emitDashboardContainerLifecycle('Aggregate', 'hide');
    cy.get('#tablesContainer').should('not.be.visible');
    emitDashboardContainerLifecycle('Aggregate', 'show');
    assertDashboardViewReady('Aggregate');
    cy.get('@aggregateBaselineRows').then((baselineRows) => {
      readRenderedAggregateRows(0).should((rows) => {
        expect(rows, 'Aggregate rows after hide/show').to.deep.equal(baselineRows);
      });
    });

    focusDashboardTab('Crosstab');
    readRenderedCrosstab().as('crosstabBaseline');
    emitDashboardContainerLifecycle('Crosstab', 'resize');
    readRenderedCrosstab().should((rendered) => {
      expect(rendered.body.length, 'Crosstab rows after resize').to.be.greaterThan(0);
      expect(rendered.headers.length, 'Crosstab headers after resize').to.be.greaterThan(1);
    });
    emitDashboardContainerLifecycle('Crosstab', 'hide');
    cy.get('.crosstab-wrapper').should('not.be.visible');
    emitDashboardContainerLifecycle('Crosstab', 'show');
    assertDashboardViewReady('Crosstab');
    cy.get('@crosstabBaseline').then((baseline) => {
      readRenderedCrosstab().should((rendered) => {
        expect(rendered, 'Crosstab rendering after hide/show').to.deep.equal(baseline);
      });
    });

    focusDashboardTab('Waterfall');
    readWaterfallClusterRows().as('waterfallBaselineRows');
    cy.get('#waterfall-cluster-table-container tbody tr.ui-selectable-row', { timeout: 15000 })
      .should(($rows) => {
        expect($rows.length, 'Waterfall cluster rows before drilldown').to.be.greaterThan(0);
      })
      .first()
      .click({ force: true });

    cy.window().its('commonService.visuals.waterfall.selectedClusterRow.id').as('waterfallSelectedClusterId');
    cy.get('#waterfall-node-table-container tbody tr.ui-selectable-row', { timeout: 15000 })
      .should(($rows) => {
        expect($rows.length, 'Waterfall node rows before hide').to.be.greaterThan(0);
      });

    emitDashboardContainerLifecycle('Waterfall', 'resize');
    cy.window().its('commonService.visuals.waterfall.scrollHeight').should((scrollHeight) => {
      expect(String(scrollHeight), 'Waterfall scrollHeight after resize').to.not.equal('');
    });

    emitDashboardContainerLifecycle('Waterfall', 'hide');
    cy.get('#waterfall-view').should('not.be.visible');
    emitDashboardContainerLifecycle('Waterfall', 'show');
    assertDashboardViewReady('Waterfall');

    cy.get('@waterfallSelectedClusterId').then((selectedClusterId) => {
      cy.window().its('commonService.visuals.waterfall.selectedClusterRow.id').should((currentClusterId) => {
        expect(String(currentClusterId), 'Waterfall selected cluster after hide/show').to.equal(String(selectedClusterId));
      });
    });

    cy.get('@waterfallBaselineRows').then((baselineRows) => {
      readWaterfallClusterRows().should((rows) => {
        expect(rows, 'Waterfall cluster rows after hide/show').to.deep.equal(baselineRows);
      });
    });

    cy.get('#waterfall-node-table-container tbody tr.ui-selectable-row', { timeout: 15000 })
      .should('have.length.greaterThan', 0);
  });
});
