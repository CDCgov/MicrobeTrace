/// <reference types="cypress" />

import * as XLSX from 'xlsx';
import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  goToTableView,
  launchProfileToTwoD,
  openGlobalFilteringTab,
  setTN93DistanceDisplayFormat,
} from '../../../support/journey-helpers';
import {
  assertTableVisibleRowCount,
  setTableFilterType,
  setTableFilterValue,
  openTableExportDialog,
  selectTableDataset,
} from '../../../support/table-helpers';

describe('Journey Flow - Table export', () => {
  const profile = getProfile('map-color-by-uploaded');
  const tn93Profile = getProfile('nn-angulartesting-tn93-edgelist');

  it('exports the uploaded table as current-column CSV and all-column XLSX artifacts', () => {
    const csvFileBase = `cypress_table_nodes_current_${Date.now()}`;
    const csvPath = `cypress/downloads/${csvFileBase}.csv`;
    const xlsxFileBase = `${csvFileBase}_links_all`;
    const xlsxPath = `cypress/downloads/${xlsxFileBase}.xlsx`;

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    goToTableView();

    openTableExportDialog();
    cy.get('@tableExport')
      .find('input[type="text"]')
      .clear()
      .type(csvFileBase);
    cy.get('@tableExport').contains('button', 'Export').click({ force: true });
    cy.contains('.p-dialog-title', 'Export Table').should('not.exist');

    cy.readFile(csvPath, 'utf8', { timeout: 20000 }).should((csvText) => {
      expect(csvText, 'exported CSV content').to.include('Index');
      expect(csvText, 'exported CSV content').to.include('Id');
      expect(csvText, 'exported CSV content').to.include('A');
      expect(csvText, 'current-column export omits non-visible node columns').not.to.include('Profession');
    });

    selectTableDataset('Link');
    openTableExportDialog();
    cy.get('@tableExport')
      .find('input[type="text"]')
      .clear()
      .type(xlsxFileBase);
    cy.get('@tableExport').find('.col-4 .p-select').click({ force: true });
    cy.contains('li[role="option"]', 'xlsx', { timeout: 15000 }).click({ force: true });
    cy.window().then((win: any) => {
      win.commonService.visuals.tableComp.exportAllColumns = true;
    });

    cy.window()
      .its('commonService.visuals.tableComp.SelectedTableExportFileTypeListVariable')
      .should('equal', 'xlsx');
    cy.window()
      .its('commonService.visuals.tableComp.exportAllColumns')
      .should('equal', true);

    cy.get('@tableExport').contains('button', 'Export').click({ force: true });
    cy.contains('.p-dialog-title', 'Export Table').should('not.exist');

    cy.readFile(xlsxPath, 'binary', { timeout: 20000 }).then((binaryWorkbook) => {
      const workbook = XLSX.read(binaryWorkbook, { type: 'binary' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

      expect(rows, 'xlsx rows').to.have.length(4);
      expect(Object.keys(rows[0] || {}), 'xlsx all-column headers').to.include.members([
        'Source',
        'Target',
        'Distance',
        'Contact type',
      ]);
      expect(rows[0]?.Source, 'first xlsx source').to.equal('A');
    });
  });

  it('exports only the filtered rows when a table filter is active', () => {
    const filteredCsvFileBase = `cypress_table_nodes_filtered_${Date.now()}`;
    const filteredCsvPath = `cypress/downloads/${filteredCsvFileBase}.csv`;

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    goToTableView();

    setTableFilterValue('Id', 'D');
    assertTableVisibleRowCount(1);

    openTableExportDialog();
    cy.get('@tableExport')
      .find('input[type="text"]')
      .clear()
      .type(filteredCsvFileBase);
    cy.get('@tableExport').contains('button', 'Export').click({ force: true });
    cy.contains('.p-dialog-title', 'Export Table').should('not.exist');

    cy.readFile(filteredCsvPath, 'utf8', { timeout: 20000 }).should((csvText) => {
      const workbook = XLSX.read(csvText, { type: 'string' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

      expect(rows, 'filtered csv row count').to.have.length(1);
      expect(rows[0]?.Id, 'filtered csv data row').to.equal('D');
      expect(rows[0]?.Id, 'filtered csv omits non-matching rows').not.to.equal('A');
    });
  });

  it('covers the remaining all-column CSV and current-column XLSX export combinations', () => {
    const allCsvFileBase = `cypress_table_nodes_all_${Date.now()}`;
    const allCsvPath = `cypress/downloads/${allCsvFileBase}.csv`;
    const currentXlsxFileBase = `${allCsvFileBase}_current`;
    const currentXlsxPath = `cypress/downloads/${currentXlsxFileBase}.xlsx`;

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    goToTableView();

    openTableExportDialog();
    cy.get('@tableExport')
      .find('input[type="text"]')
      .clear()
      .type(allCsvFileBase);
    cy.window().then((win: any) => {
      win.commonService.visuals.tableComp.exportAllColumns = true;
    });
    cy.window()
      .its('commonService.visuals.tableComp.exportAllColumns')
      .should('equal', true);
    cy.get('@tableExport').contains('button', 'Export').click({ force: true });
    cy.contains('.p-dialog-title', 'Export Table').should('not.exist');

    cy.readFile(allCsvPath, 'utf8', { timeout: 20000 }).should((csvText) => {
      expect(csvText, 'all-column csv includes non-visible node field').to.include('Profession');
      expect(csvText, 'all-column csv includes uploaded node data').to.include('Healthcare');
    });

    openTableExportDialog();
    cy.get('@tableExport')
      .find('input[type="text"]')
      .clear()
      .type(currentXlsxFileBase);
    cy.get('@tableExport').find('.col-4 .p-select').click({ force: true });
    cy.contains('li[role="option"]', 'xlsx', { timeout: 15000 }).click({ force: true });
    cy.window().then((win: any) => {
      win.commonService.visuals.tableComp.exportAllColumns = false;
    });
    cy.window()
      .its('commonService.visuals.tableComp.SelectedTableExportFileTypeListVariable')
      .should('equal', 'xlsx');
    cy.window()
      .its('commonService.visuals.tableComp.exportAllColumns')
      .should('equal', false);
    cy.get('@tableExport').contains('button', 'Export').click({ force: true });
    cy.contains('.p-dialog-title', 'Export Table').should('not.exist');

    cy.readFile(currentXlsxPath, 'binary', { timeout: 20000 }).then((binaryWorkbook) => {
      const workbook = XLSX.read(binaryWorkbook, { type: 'binary' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      const headers = Object.keys(rows[0] || {});

      expect(rows, 'current-column xlsx rows').to.have.length(4);
      expect(headers, 'current-column xlsx headers').to.include.members(['Index', 'Id']);
      expect(headers, 'current-column xlsx omits non-visible node headers').not.to.include('Profession');
    });
  });

  it('exports TN93 distance values using the active percentage display format', () => {
    const csvFileBase = `cypress_table_tn93_links_${Date.now()}`;
    const csvPath = `cypress/downloads/${csvFileBase}.csv`;
    const xlsxFileBase = `${csvFileBase}_clusters`;
    const xlsxPath = `cypress/downloads/${xlsxFileBase}.xlsx`;

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
    });

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

      expect(rows, 'filtered TN93 link csv rows').to.have.length(1);
      expect(rows[0]?.Distance, 'filtered TN93 link distance csv value').to.equal('1.5%');
    });

    selectTableDataset('Cluster');
    let expectedClusterDistance = '';
    cy.window().then((win: any) => {
      const firstClusterRow = win.commonService.visuals.tableComp.SelectedTableData.data?.[0];
      expect(firstClusterRow, 'first cluster export row').to.exist;

      expectedClusterDistance = win.commonService.formatDisplayedDistanceValue(
        firstClusterRow.mean_genetic_distance,
        'mean_genetic_distance',
      );
      expect(expectedClusterDistance, 'cluster export mean genetic distance').to.match(/^-?\d+(?:\.\d+)?%$/);
    });

    openTableExportDialog();
    cy.get('@tableExport')
      .find('input[type="text"]')
      .clear()
      .type(xlsxFileBase);
    cy.get('@tableExport').find('.col-4 .p-select').click({ force: true });
    cy.contains('li[role="option"]', 'xlsx', { timeout: 15000 }).click({ force: true });
    cy.window().then((win: any) => {
      win.commonService.visuals.tableComp.exportAllColumns = true;
    });
    cy.get('@tableExport').contains('button', 'Export').click({ force: true });
    cy.contains('.p-dialog-title', 'Export Table').should('not.exist');

    cy.readFile(xlsxPath, 'binary', { timeout: 20000 }).then((binaryWorkbook) => {
      const workbook = XLSX.read(binaryWorkbook, { type: 'binary' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

      expect(rows.length, 'cluster xlsx export row count').to.be.greaterThan(0);
      expect(Object.values(rows[0] || {}), 'cluster xlsx exported values').to.include(expectedClusterDistance);
    });
  });
});
