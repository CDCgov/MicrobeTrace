/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  goToTableView,
  launchProfileToTwoD,
} from '../../../support/journey-helpers';
import {
  assertFirstVisibleRowValue,
  assertTableFilterType,
  assertTableFilterValue,
  assertTableVisibleRowCount,
  selectTableDataset,
  setTableFilterType,
  setTableFilterValue,
} from '../../../support/table-helpers';

describe('Journey Flow - Table uploaded controls', () => {
  const profile = getProfile('map-color-by-uploaded');

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
});
