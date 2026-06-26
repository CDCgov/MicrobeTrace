/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  goToTableView,
  launchProfileToTwoD,
} from '../../../support/journey-helpers';
import {
  assertFirstVisibleRowValue,
  assertTableDatasetMatchesSession,
  assertTableVisibleRowCount,
  clearTableFilterValue,
  clickFirstVisibleTableRow,
  openTableSettingsDialog,
  selectTableDataset,
  setTableFilterValue,
} from '../../../support/table-helpers';

const assertSelectedNodeIds = (expectedIds: string[]): void => {
  cy.window()
    .its('commonService.session.data.nodes')
    .should((nodes: any[]) => {
      const selectedIds = nodes
        .filter((node) => node.selected)
        .map((node) => String(node._id ?? node.ID ?? ''))
        .sort();

      expect(selectedIds, 'selected node ids').to.deep.equal([...expectedIds].sort());
    });
};

describe('Journey Flow - Table uploaded selection', () => {
  const profile = getProfile('map-color-by-uploaded');

  it('keeps link and cluster rows non-selectable and restores node row order after deselection', () => {
    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    goToTableView();

    openTableSettingsDialog();
    cy.get('@tableSettings')
      .find('.p-selectbutton .p-togglebutton-label')
      .contains('Large')
      .click({ force: true });
    cy.window()
      .its('commonService.visuals.tableComp.selectedSize')
      .should('equal', 'p-datatable-lg');
    cy.closeSettingsPane('Table Settings');

    setTableFilterValue('Id', 'D');
    assertTableVisibleRowCount(1);
    assertFirstVisibleRowValue('Id', 'D');

    clickFirstVisibleTableRow();
    assertSelectedNodeIds(['D']);

    selectTableDataset('Link');
    assertTableDatasetMatchesSession('Link');
    setTableFilterValue('Source', 'A');
    assertTableVisibleRowCount(2);
    clickFirstVisibleTableRow();
    assertSelectedNodeIds(['D']);

    selectTableDataset('Cluster');
    assertTableDatasetMatchesSession('Cluster');
    clickFirstVisibleTableRow();
    assertSelectedNodeIds(['D']);

    selectTableDataset('Node');
    assertSelectedNodeIds(['D']);
    cy.window()
      .its('commonService.visuals.tableComp.SelectedTableData.data')
      .should((rows: any[]) => {
        expect(rows[0]?.id ?? rows[0]?._id ?? rows[0]?.ID).to.equal('D');
      });
    cy.window()
      .its('commonService.visuals.tableComp.dataTable.filteredValue')
      .should((rows: any[] | null) => {
        expect(rows?.length).to.equal(1);
        expect(rows?.[0]?.id ?? rows?.[0]?._id ?? rows?.[0]?.ID).to.equal('D');
      });
    assertTableVisibleRowCount(1);
    assertFirstVisibleRowValue('Id', 'D');
    clearTableFilterValue('Id');
    assertTableVisibleRowCount(4);
    assertFirstVisibleRowValue('Id', 'D');
    clickFirstVisibleTableRow();
    assertSelectedNodeIds([]);
    assertFirstVisibleRowValue('Id', 'A');
  });
});
