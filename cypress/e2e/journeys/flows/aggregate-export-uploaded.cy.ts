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
  reorderAggregateTables,
  selectAggregateField,
} from '../../../support/aggregate-helpers';
import {
  assertAfterLaunchCounts,
  assertAggregateReady,
  goToAggregateView,
  launchProfileToTwoD,
  openAggregateExportDialog,
  openAggregateSettingsDialog,
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
});
