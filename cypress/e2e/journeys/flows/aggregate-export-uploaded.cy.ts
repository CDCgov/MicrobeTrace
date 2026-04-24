/// <reference types="cypress" />

import JSZip from 'jszip';
import * as XLSX from 'xlsx';

import { getProfile } from '../datasets/profile';
import {
  addAggregateTable,
  assertAggregateTableCount,
  assertAggregateTableMatchesModel,
  assertAggregateTableTitles,
  getAggregateFieldOption,
  readDisplayedAggregateRows,
  reorderAggregateTables,
  selectAggregateField,
} from '../../../support/aggregate-helpers';
import {
  assertAfterLaunchCounts,
  assertAggregateReady,
  goToAggregateView,
  launchProfileToTwoD,
  openGlobalFilteringTab,
  openAggregateExportDialog,
  openAggregateSettingsDialog,
  setTN93DistanceDisplayFormat,
} from '../../../support/journey-helpers';

const setAggregateExportFileName = (fileBase: string): void => {
  cy.get('@aggregateExport')
    .find('#aggregate-export-filename')
    .invoke('val', fileBase)
    .trigger('input')
    .trigger('change');

  cy.window()
    .its('commonService.visuals.aggregate.SelectedAggregateExportFilename')
    .should('equal', fileBase);
};

const selectAggregateExportType = (label: string, expectedValue: string): void => {
  cy.get('@aggregateExport')
    .find('p-select')
    .first()
    .click({ force: true });

  cy.contains('li[role="option"]', label).click({ force: true });

  cy.window()
    .its('commonService.visuals.aggregate.SelectedAggregateExportFileType')
    .should('equal', expectedValue);
};

describe('Journey Flow - Aggregate uploaded export ordering', () => {
  const profile = getProfile('filtering-min-cluster-reveal-epi-linklist');
  const tn93Profile = getProfile('nn-angulartesting-tn93-edgelist');

  it('exports reordered Aggregate tables with Cluster data in the same order shown in the UI', () => {
    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);

    goToAggregateView();
    assertAggregateReady();

    openAggregateSettingsDialog();
    addAggregateTable();
    getAggregateFieldOption('Cluster-nodes').then((option) => {
      selectAggregateField(1, option.shortLabel, option.value);
    });
    addAggregateTable();
    getAggregateFieldOption('Link-distance').then((option) => {
      selectAggregateField(2, option.shortLabel, option.value);
    });

    reorderAggregateTables(1, 0);
    reorderAggregateTables(2, 1);
    cy.window()
      .its('commonService.visuals.aggregate.SelectedDataFields')
      .should('deep.equal', ['Cluster-nodes', 'Link-distance', 'Node-cluster']);

    cy.closeSettingsPane('Aggregate Settings');

    assertAggregateTableCount(3);
    assertAggregateTableTitles(['Nodes', 'Distance', 'Cluster']);
    assertAggregateTableMatchesModel(0, 'Cluster-nodes');
    assertAggregateTableMatchesModel(1, 'Link-distance');
    assertAggregateTableMatchesModel(2, 'Node-cluster');

    const downloadsFolder = Cypress.config('downloadsFolder');

    const jsonFileBase = `cypress_aggregate_reordered_${Date.now()}_json`;
    openAggregateExportDialog();
    setAggregateExportFileName(jsonFileBase);
    selectAggregateExportType('json', 'json');
    cy.get('@aggregateExport').contains('button', 'Export').click({ force: true });
    cy.readFile(`${downloadsFolder}/${jsonFileBase}.json`, { timeout: 20000 }).then((rawPayload) => {
      const payload = typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload;

      expect(payload, 'aggregate json payload').to.have.length(3);
      expect(payload.map((entry: any) => `${entry.dataset}:${entry.column}`)).to.deep.equal([
        'cluster:nodes',
        'link:distance',
        'node:cluster',
      ]);
    });
    cy.closeSettingsPane('Aggregate Export');

    const xlsxFileBase = `cypress_aggregate_reordered_${Date.now()}_xlsx`;
    openAggregateExportDialog();
    setAggregateExportFileName(xlsxFileBase);
    selectAggregateExportType('xlsx', 'xlsx');
    cy.get('@aggregateExport').contains('button', 'Export').click({ force: true });
    cy.readFile(`${downloadsFolder}/${xlsxFileBase}.xlsx`, 'binary', { timeout: 20000 }).then((binary) => {
      const workbook = XLSX.read(binary, { type: 'binary' });
      expect(workbook.SheetNames).to.deep.equal(['Cluster-nodes', 'Link-distance', 'Node-cluster']);
    });
    cy.closeSettingsPane('Aggregate Export');

    const zipFileBase = `cypress_aggregate_reordered_${Date.now()}_zip`;
    openAggregateExportDialog();
    setAggregateExportFileName(zipFileBase);
    selectAggregateExportType('csv.zip', 'csv.zip');
    cy.get('@aggregateExport').contains('button', 'Export').click({ force: true });
    cy.readFile(`${downloadsFolder}/${zipFileBase}.zip`, 'binary', { timeout: 20000 }).then((binary) => {
      return JSZip.loadAsync(binary).then((zip) => {
        const fileNames = Object.keys(zip.files).filter((name) => !zip.files[name].dir);
        expect(fileNames).to.deep.equal(['Cluster-nodes.csv', 'Link-distance.csv', 'Node-cluster.csv']);
      });
    });
    cy.closeSettingsPane('Aggregate Export');

    const pdfFileBase = `cypress_aggregate_reordered_${Date.now()}_pdf`;
    openAggregateExportDialog();
    setAggregateExportFileName(pdfFileBase);
    selectAggregateExportType('pdf', 'pdf');
    cy.get('@aggregateExport').contains('button', 'Export').click({ force: true });
    cy.readFile(`${downloadsFolder}/${pdfFileBase}.pdf`, 'binary', { timeout: 20000 }).should((binary) => {
      expect(binary.startsWith('%PDF'), 'pdf signature').to.equal(true);
      expect(binary.length, 'pdf byte length').to.be.greaterThan(500);
    });
    cy.closeSettingsPane('Aggregate Export');
  });

  it('exports TN93 aggregate distance buckets using percentage-formatted labels', () => {
    let expectedLinkRows: string[] = [];
    let expectedClusterRows: string[] = [];

    launchProfileToTwoD(tn93Profile);
    assertAfterLaunchCounts(tn93Profile);

    openGlobalFilteringTab();
    setTN93DistanceDisplayFormat('percentage');
    cy.closeGlobalSettings();

    goToAggregateView();
    assertAggregateReady();

    openAggregateSettingsDialog();
    addAggregateTable();
    getAggregateFieldOption('Link-distance').then((option) => {
      selectAggregateField(1, option.shortLabel, option.value);
    });
    addAggregateTable();
    getAggregateFieldOption('Cluster-mean_genetic_distance').then((option) => {
      selectAggregateField(2, option.shortLabel, option.value);
    });
    cy.closeSettingsPane('Aggregate Settings');

    readDisplayedAggregateRows(1).then((rows) => {
      expectedLinkRows = rows.map((row) => row.groupName);
      expect(expectedLinkRows, 'expected TN93 link aggregate labels').to.include('1.5%');
    });
    readDisplayedAggregateRows(2).then((rows) => {
      expectedClusterRows = rows.map((row) => row.groupName);
      expect(expectedClusterRows.length, 'expected TN93 cluster aggregate labels').to.be.greaterThan(0);
    });

    const downloadsFolder = Cypress.config('downloadsFolder');

    const jsonFileBase = `cypress_aggregate_tn93_${Date.now()}_json`;
    openAggregateExportDialog();
    setAggregateExportFileName(jsonFileBase);
    selectAggregateExportType('json', 'json');
    cy.get('@aggregateExport').contains('button', 'Export').click({ force: true });
    cy.readFile(`${downloadsFolder}/${jsonFileBase}.json`, { timeout: 20000 }).then((rawPayload) => {
      const payload = typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload;
      const linkEntry = payload.find((entry: any) => entry.dataset === 'link' && entry.column === 'distance');
      const clusterEntry = payload.find((entry: any) => entry.dataset === 'cluster' && entry.column === 'mean_genetic_distance');

      expect(linkEntry?.data.map((row: any) => row.distance), 'json link distance labels').to.deep.equal(expectedLinkRows);
      expect(clusterEntry?.data.map((row: any) => row.mean_genetic_distance), 'json cluster distance labels')
        .to.deep.equal(expectedClusterRows);
    });
    cy.closeSettingsPane('Aggregate Export');

    const xlsxFileBase = `cypress_aggregate_tn93_${Date.now()}_xlsx`;
    openAggregateExportDialog();
    setAggregateExportFileName(xlsxFileBase);
    selectAggregateExportType('xlsx', 'xlsx');
    cy.get('@aggregateExport').contains('button', 'Export').click({ force: true });
    cy.readFile(`${downloadsFolder}/${xlsxFileBase}.xlsx`, 'binary', { timeout: 20000 }).then((binary) => {
      const workbook = XLSX.read(binary, { type: 'binary' });
      const linkRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets['Link-distance'], { defval: '' });
      const clusterRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets['Cluster-mean_genetic_distance'], { defval: '' });

      expect(linkRows.map((row) => row.distance), 'xlsx link distance labels').to.deep.equal(expectedLinkRows);
      expect(clusterRows.map((row) => row.mean_genetic_distance), 'xlsx cluster distance labels').to.deep.equal(expectedClusterRows);
    });
    cy.closeSettingsPane('Aggregate Export');

    const zipFileBase = `cypress_aggregate_tn93_${Date.now()}_zip`;
    openAggregateExportDialog();
    setAggregateExportFileName(zipFileBase);
    selectAggregateExportType('csv.zip', 'csv.zip');
    cy.get('@aggregateExport').contains('button', 'Export').click({ force: true });
    cy.readFile(`${downloadsFolder}/${zipFileBase}.zip`, 'binary', { timeout: 20000 }).then((binary) => {
      return JSZip.loadAsync(binary).then(async (zip) => {
        const linkCsv = await zip.file('Link-distance.csv')?.async('string');
        const clusterCsv = await zip.file('Cluster-mean_genetic_distance.csv')?.async('string');
        const linkWorkbook = XLSX.read(linkCsv || '', { type: 'string' });
        const clusterWorkbook = XLSX.read(clusterCsv || '', { type: 'string' });
        const linkRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
          linkWorkbook.Sheets[linkWorkbook.SheetNames[0]],
          { defval: '' },
        );
        const clusterRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
          clusterWorkbook.Sheets[clusterWorkbook.SheetNames[0]],
          { defval: '' },
        );

        expect(linkRows.map((row) => row.distance), 'csv.zip link distance labels').to.deep.equal(expectedLinkRows);
        expect(clusterRows.map((row) => row.mean_genetic_distance), 'csv.zip cluster distance labels')
          .to.deep.equal(expectedClusterRows);
      });
    });
    cy.closeSettingsPane('Aggregate Export');

    const pdfFileBase = `cypress_aggregate_tn93_${Date.now()}_pdf`;
    openAggregateExportDialog();
    setAggregateExportFileName(pdfFileBase);
    selectAggregateExportType('pdf', 'pdf');
    cy.get('@aggregateExport').contains('button', 'Export').click({ force: true });
    cy.readFile(`${downloadsFolder}/${pdfFileBase}.pdf`, 'binary', { timeout: 20000 }).should((binary) => {
      expect(binary.startsWith('%PDF'), 'tn93 pdf signature').to.equal(true);
      expect(binary.length, 'tn93 pdf byte length').to.be.greaterThan(500);
    });
    cy.closeSettingsPane('Aggregate Export');
  });
});
