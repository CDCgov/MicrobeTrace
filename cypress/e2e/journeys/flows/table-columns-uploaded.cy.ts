/// <reference types="cypress" />

import * as XLSX from 'xlsx';
import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  goToTableView,
  launchProfileToTwoD,
} from '../../../support/journey-helpers';
import {
  assertVisibleTableHeaders,
  openTableExportDialog,
  selectTableDataset,
  setVisibleTableColumns,
} from '../../../support/table-helpers';

describe('Journey Flow - Table uploaded columns', () => {
  const profile = getProfile('map-color-by-uploaded');

  it('shows and hides visible columns through the Table multiselect and exports the same current-column subset', () => {
    const csvFileBase = `cypress_table_columns_current_${Date.now()}`;
    const csvPath = `cypress/downloads/${csvFileBase}.csv`;

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    goToTableView();

    setVisibleTableColumns(['_id', 'degree']);
    assertVisibleTableHeaders(['index', '_id', 'degree']);

    openTableExportDialog();
    cy.get('@tableExport')
      .find('input[type="text"]')
      .clear()
      .type(csvFileBase);
    cy.get('@tableExport').contains('button', 'Export').click({ force: true });
    cy.contains('.p-dialog-title', 'Export Table').should('not.exist');

    cy.readFile(csvPath, 'utf8', { timeout: 20000 }).should((csvText) => {
      const workbook = XLSX.read(csvText, { type: 'string' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      const headers = Object.keys(rows[0] || {});

      expect(headers, 'current-column csv headers').to.deep.equal(['index', '_id', 'degree']);
      expect(headers, 'current-column csv omits non-selected columns').not.to.include.members([
        'cluster',
        'Profession',
      ]);
    });
  });

  it('persists an independent visible-column subset for each dataset while switching away and back', () => {
    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    goToTableView();

    setVisibleTableColumns(['_id', 'degree']);
    assertVisibleTableHeaders(['index', '_id', 'degree']);

    selectTableDataset('Link');
    setVisibleTableColumns(['source', 'target', 'distance']);
    assertVisibleTableHeaders(['index', 'source', 'target', 'distance']);

    selectTableDataset('Node');
    assertVisibleTableHeaders(['index', '_id', 'degree']);

    selectTableDataset('Link');
    assertVisibleTableHeaders(['index', 'source', 'target', 'distance']);
  });
});
