/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  goToTableView,
  launchProfileToTwoD,
  openGlobalFilteringTab,
  setTN93DistanceDisplayFormat,
} from '../../../support/journey-helpers';
import {
  assertFirstVisibleRowValue,
  assertSingleVisibleRowValue,
  assertTableFilterType,
  assertTableFilterValue,
  assertTableVisibleRowCount,
  selectTableDataset,
  setTableFilterType,
  setTableFilterValue,
} from '../../../support/table-helpers';

describe('Journey Flow - Table uploaded controls', () => {
  const profile = getProfile('map-color-by-uploaded');
  const tn93Profile = getProfile('nn-angulartesting-tn93-edgelist');

  it('sorts node-table rows ascending and descending by Id', () => {
    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    goToTableView();

    assertFirstVisibleRowValue('Id', 'A');

    cy.get('.table-wrapper .p-datatable-thead tr')
      .first()
      .contains('th', 'Id')
      .click({ force: true });
    assertFirstVisibleRowValue('Id', 'A');

    cy.get('.table-wrapper .p-datatable-thead tr')
      .first()
      .contains('th', 'Id')
      .click({ force: true });
    assertFirstVisibleRowValue('Id', 'D');

    cy.get('.table-wrapper .p-datatable-thead tr')
      .first()
      .contains('th', 'Id')
      .click({ force: true });
    assertFirstVisibleRowValue('Id', 'A');
  });

  it('reapplies per-dataset filters after switching away and back', () => {
    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    goToTableView();

    setTableFilterType('Id', '=');
    setTableFilterValue('Id', 'D');
    assertTableVisibleRowCount(1);

    selectTableDataset('Link');
    setTableFilterType('Source', '=');
    setTableFilterValue('Source', 'A');
    assertTableVisibleRowCount(2);

    selectTableDataset('Node');
    assertTableFilterType('Id', '=');
    assertTableFilterValue('Id', 'D');
    assertTableVisibleRowCount(1);

    selectTableDataset('Link');
    assertTableFilterType('Source', '=');
    assertTableFilterValue('Source', 'A');
    assertTableVisibleRowCount(2);
  });

  it('renders TN93 link and cluster distance values as percentages while keeping raw filters usable', () => {
    launchProfileToTwoD(tn93Profile);
    assertAfterLaunchCounts(tn93Profile);
    goToTableView();

    openGlobalFilteringTab();
    setTN93DistanceDisplayFormat('percentage');
    cy.closeGlobalSettings();

    selectTableDataset('Link');
    cy.window().then((win: any) => {
      const linkRows = win.commonService.visuals.tableComp.SelectedTableData.data || [];
      const targetRow = linkRows.find((row: any) => (
        win.commonService.formatDisplayedDistanceValue(row.distance, 'distance') === '1.5%'
      ));

      expect(targetRow, 'TN93 link row with 1.5% distance').to.exist;

      setTableFilterType('Source', '=');
      setTableFilterValue('Source', String(targetRow.source));
      setTableFilterType('Target', '=');
      setTableFilterValue('Target', String(targetRow.target));
      assertTableVisibleRowCount(1);
      assertSingleVisibleRowValue('Distance', '1.5%');
    });

    selectTableDataset('Cluster');
    cy.window().then((win: any) => {
      const tableComp = win.commonService.visuals.tableComp;
      const clusterRows = tableComp.SelectedTableData.data || [];
      const firstClusterRow = clusterRows[0];
      const meanDistanceColumnIndex = tableComp.SelectedTableData.tableColumns
        .findIndex((column: { field: string }) => column.field === 'mean_genetic_distance');

      expect(firstClusterRow, 'first cluster table row').to.exist;
      expect(meanDistanceColumnIndex, 'cluster mean genetic distance column index').to.be.greaterThan(-1);

      const expectedDisplay = win.commonService.formatDisplayedDistanceValue(
        firstClusterRow.mean_genetic_distance,
        'mean_genetic_distance',
      );

      expect(expectedDisplay, 'cluster mean genetic distance display').to.match(/^-?\d+(?:\.\d+)?%$/);

      cy.get('.table-wrapper .p-datatable-tbody > tr')
        .first()
        .find('td')
        .eq(meanDistanceColumnIndex)
        .should(($cell) => {
          expect(String($cell.text()).trim()).to.equal(expectedDisplay);
        });
    });
  });
});
