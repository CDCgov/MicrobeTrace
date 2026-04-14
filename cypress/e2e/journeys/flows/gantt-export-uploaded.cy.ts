/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  createGanttEntry,
  goToGanttView,
  launchProfileToTwoD,
} from '../../../support/journey-helpers';

type ExportType = 'svg' | 'png' | 'jpeg';

function openGanttExportDialog(): void {
  cy.get('ganttcomponent #tool-btn-container a[title="Export Screen"]:visible').click({ force: true });
  cy.contains('.p-dialog-title', 'Export Gantt Chart')
    .should('be.visible')
    .parents('.p-dialog')
    .as('exportDialog');
}

function setGanttExportDetails(fileName: string, exportType: ExportType): void {
  cy.get('@exportDialog')
    .find('#gantt-image-filename')
    .invoke('val', fileName)
    .trigger('input')
    .trigger('change');

  cy.get('@exportDialog').find('#network-export-filetype').click({ force: true });
  cy.contains('li[role="option"]', exportType).click({ force: true });
}

function assertBinarySignature(fileBinary: string, expectedPrefixHex: string, minSize: number): void {
  const bytes = Cypress.Buffer.from(fileBinary, 'binary');
  const prefix = bytes.subarray(0, expectedPrefixHex.length / 2).toString('hex');

  expect(prefix, 'downloaded file signature').to.equal(expectedPrefixHex);
  expect(bytes.byteLength, 'downloaded file byte length').to.be.greaterThan(minSize);
}

describe('Journey Flow - Gantt export on uploaded data', () => {
  const profile = getProfile('gantt-covid-node-link');

  beforeEach(() => {
    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    goToGanttView();

    createGanttEntry({
      name: 'Symptom Window',
      startField: 'Date of symptom onset Date',
      endField: 'Date symptoms resolved',
    });
  });

  it('exports the uploaded Gantt view as an SVG file', () => {
    const exportFileName = `cypress_gantt_export_${Date.now()}.svg`;
    const exportPath = `cypress/downloads/${exportFileName}`;

    openGanttExportDialog();
    setGanttExportDetails(exportFileName, 'svg');

    cy.get('@exportDialog').find('#export-tree').click({ force: true });

    cy.readFile(exportPath, 'utf8', { timeout: 30000 }).should((svgText) => {
      expect(svgText, 'exported SVG content').to.include('<svg');
      expect(svgText, 'exported SVG content').to.include('Symptom Window');
      expect(svgText.length, 'exported SVG byte length').to.be.greaterThan(200);
    });

    cy.contains('.p-dialog-title', 'Export Gantt Chart').should('not.exist');
  });

  it('exports the uploaded Gantt view as a PNG file', () => {
    const exportFileName = `cypress_gantt_export_${Date.now()}.png`;
    const exportPath = `cypress/downloads/${exportFileName}`;

    openGanttExportDialog();
    setGanttExportDetails(exportFileName, 'png');

    cy.get('@exportDialog').find('#export-tree').click({ force: true });

    cy.readFile(exportPath, 'binary', { timeout: 30000 }).should((fileBinary) => {
      assertBinarySignature(fileBinary, '89504e470d0a1a0a', 1000);
    });

    cy.contains('.p-dialog-title', 'Export Gantt Chart').should('not.exist');
  });

  it('exports the uploaded Gantt view as a JPEG file', () => {
    const exportFileName = `cypress_gantt_export_${Date.now()}.jpeg`;
    const exportPath = `cypress/downloads/${exportFileName}`;

    openGanttExportDialog();
    setGanttExportDetails(exportFileName, 'jpeg');

    cy.get('@exportDialog').find('#export-tree').click({ force: true });

    cy.readFile(exportPath, 'binary', { timeout: 30000 }).should((fileBinary) => {
      assertBinarySignature(fileBinary, 'ffd8ff', 1000);
    });

    cy.contains('.p-dialog-title', 'Export Gantt Chart').should('not.exist');
  });

  it('toggles export file types and closes the dialog without exporting', () => {
    const customFileName = `gantt_toggle_${Date.now()}`;

    openGanttExportDialog();

    cy.window().its('commonService.visuals.gantt.SelectedNetworkExportFileTypeListVariable').should('equal', 'png');

    cy.get('@exportDialog')
      .find('#gantt-image-filename')
      .invoke('val', customFileName)
      .trigger('input')
      .trigger('change');

    setGanttExportDetails(customFileName, 'jpeg');
    cy.window().its('commonService.visuals.gantt.SelectedNetworkExportFileTypeListVariable').should('equal', 'jpeg');

    setGanttExportDetails(customFileName, 'svg');
    cy.window().its('commonService.visuals.gantt.SelectedNetworkExportFileTypeListVariable').should('equal', 'svg');

    setGanttExportDetails(customFileName, 'png');
    cy.window().its('commonService.visuals.gantt.SelectedNetworkExportFileTypeListVariable').should('equal', 'png');

    cy.closeSettingsPane('Export Gantt Chart');

    openGanttExportDialog();
    cy.get('@exportDialog')
      .find('#gantt-image-filename')
      .invoke('val')
      .should((value) => {
        expect(String(value || '').trim(), 'reopened export filename').to.not.equal('');
      });

    cy.window().should((win: any) => {
      const selectedType = win.commonService.visuals.gantt.SelectedNetworkExportFileTypeListVariable;
      expect(['png', 'jpeg', 'svg'], 'reopened export file type').to.include(selectedType);
    });

    cy.closeSettingsPane('Export Gantt Chart');
  });
});
