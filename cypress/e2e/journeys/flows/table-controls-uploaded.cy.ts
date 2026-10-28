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

  it('sorts node-table rows ascending and descending by _id', () => {
    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    goToTableView();

    assertFirstVisibleRowValue('_id', 'A');

    cy.get('.table-wrapper .p-datatable-thead tr')
      .first()
      .contains('th', '_id')
      .click({ force: true });
    assertFirstVisibleRowValue('_id', 'A');

    cy.get('.table-wrapper .p-datatable-thead tr')
      .first()
      .contains('th', '_id')
      .click({ force: true });
    assertFirstVisibleRowValue('_id', 'D');

    cy.get('.table-wrapper .p-datatable-thead tr')
      .first()
      .contains('th', '_id')
      .click({ force: true });
    assertFirstVisibleRowValue('_id', 'A');
  });

  it('reapplies per-dataset filters after switching away and back', () => {
    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    goToTableView();

    setTableFilterType('_id', '=');
    setTableFilterValue('_id', 'D');
    assertTableVisibleRowCount(1);

    selectTableDataset('Link');
    setTableFilterType('source', '=');
    setTableFilterValue('source', 'A');
    assertTableVisibleRowCount(2);

    selectTableDataset('Node');
    assertTableFilterType('_id', '=');
    assertTableFilterValue('_id', 'D');
    assertTableVisibleRowCount(1);

    selectTableDataset('Link');
    assertTableFilterType('source', '=');
    assertTableFilterValue('source', 'A');
    assertTableVisibleRowCount(2);
  });
});
