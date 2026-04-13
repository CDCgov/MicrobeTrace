/// <reference types="cypress" />

import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import {
  buildExpectedCrosstabExportModel,
  chooseCrosstabFields,
  selectCrosstabField,
} from '../../support/crosstab-helpers';
import {
  goToCrosstabView,
  openCrosstabExportDialog,
  visitAppAndAcceptEula,
} from '../../support/journey-helpers';

type WinWithMT = Window & {
  commonService: any;
  context?: {
    commonService: any;
  };
};

const closeSettingsIfPresent = (): void => {
  cy.get('body').then(($body) => {
    if (!$body.find('.p-dialog-title:contains("Crosstab Settings")').length) return;
    cy.closeSettingsPane('Crosstab Settings');
  });
};

const normalizeMatrix = (rows: unknown[][]): string[][] => rows.map((row) =>
  row.map((cell) => (cell === undefined || cell === null ? '' : String(cell))),
);

const configureChosenFields = (): Cypress.Chainable<{ xField: string; yField: string }> => {
  return cy.window().then((rawWin: unknown) => {
    const win = rawWin as WinWithMT;
    const { xField, yField } = chooseCrosstabFields(win);

    selectCrosstabField('@crosstabSettings', 'crosstab-x-variable', xField, 'crosstab-xVariable');
    selectCrosstabField('@crosstabSettings', 'crosstab-y-variable', yField, 'crosstab-yVariable');

    return cy.wrap({ xField, yField }, { log: false });
  });
};

const ensureWindowContext = (win: WinWithMT): void => {
  win.context = win.context || { commonService: win.commonService };
  win.context.commonService = win.commonService;
};

const injectSyntheticNullCategory = (): void => {
  cy.window().then((rawWin: unknown) => {
    const win = rawWin as WinWithMT;
    const field = 'cypress_null_category';
    const nodeFields: string[] = win.commonService.session.data.nodeFields || [];
    const applyCategory = (nodes: any[]) => {
      nodes.forEach((node, index) => {
        node[field] = index % 3 === 0 ? null : `group-${index % 2}`;
      });
    };

    ensureWindowContext(win);

    applyCategory(win.commonService.session.data.nodeFilteredValues || []);

    if (Array.isArray(win.commonService.session.data.nodes)) {
      applyCategory(win.commonService.session.data.nodes);
    }

    if (!nodeFields.includes(field)) {
      nodeFields.push(field);
    }

    win.commonService.visuals.crossTab.updateFieldLists();
    win.commonService.session.style.widgets['crosstab-xVariable'] = 'cluster';
    win.commonService.session.style.widgets['crosstab-yVariable'] = field;
    win.commonService.session.style.widgets['crosstab-useProportion'] = false;
    win.commonService.visuals.crossTab.applyStyleFileSettings();
  });
};

const exportCrosstab = (
  fileBase: string,
  fileType: 'csv' | 'json' | 'xlsx' | 'pdf',
  expectDialogToClose = true,
): void => {
  closeSettingsIfPresent();
  openCrosstabExportDialog();

  cy.get('@crosstabExport')
    .find('#crosstab-export-filename')
    .invoke('val', fileBase)
    .trigger('input')
    .trigger('change');

  if (fileType !== 'csv') {
    cy.get('@crosstabExport')
      .find('#crosstab-export-filetype')
      .click({ force: true });

    cy.contains('li[role="option"]', fileType, { timeout: 15000 }).click({ force: true });
  }

  cy.window()
    .its('commonService.visuals.crossTab.SelectedCrossTabExportFileType')
    .should('equal', fileType);

  cy.get('@crosstabExport').find('#crosstab-export-submit').click({ force: true });

  if (expectDialogToClose) {
    cy.contains('.p-dialog-title', 'Export Crosstab').should('not.exist');
  }
};

describe('Crosstab Export', () => {
  beforeEach(() => {
    visitAppAndAcceptEula({ skipDemoSession: false });
    goToCrosstabView();

    cy.contains('.p-dialog-title', 'Crosstab Settings', { timeout: 10000 })
      .should('be.visible')
      .parents('.p-dialog')
      .as('crosstabSettings');
  });

  it('exports the crosstab as CSV', () => {
    const fileBase = `cypress_crosstab_${Date.now()}`;
    const exportPath = `cypress/downloads/${fileBase}.csv`;

    configureChosenFields().then(() => {
      cy.window().then((rawWin: unknown) => {
        const expected = buildExpectedCrosstabExportModel(rawWin as WinWithMT);

        exportCrosstab(fileBase, 'csv');

        cy.readFile(exportPath, 'utf8', { timeout: 30000 }).then((csvText) => {
          const parsed = Papa.parse<string[]>(csvText, {
            skipEmptyLines: 'greedy',
          }).data;
          if (parsed[0]?.[0]) {
            parsed[0][0] = parsed[0][0].replace(/^\uFEFF/, '');
          }

          expect(parsed[0], 'csv header row').to.deep.equal(expected.fieldHeaders);
          expect(parsed.slice(1), 'csv body plus total row').to.deep.equal([
            ...expected.rows,
            expected.footer,
          ]);
        });
      });
    });
  });

  it('exports the crosstab as JSON', () => {
    const fileBase = `cypress_crosstab_${Date.now()}`;
    const exportPath = `cypress/downloads/${fileBase}.json`;

    configureChosenFields().then(() => {
      cy.window().then((rawWin: unknown) => {
        const expected = buildExpectedCrosstabExportModel(rawWin as WinWithMT);

        exportCrosstab(fileBase, 'json');

        cy.readFile(exportPath, { timeout: 30000 }).then((rawPayload) => {
          const parsed = typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload;

          expect(parsed, 'json export').to.deep.equal(expected.jsonRows);
          (parsed as Array<Record<string, unknown>>).forEach((row, index) => {
            expect(row, `json row ${index} omits Total`).to.not.have.property('Total');
          });
        });
      });
    });
  });

  it('exports JSON null buckets as JSON null and omits the Total property', () => {
    const fileBase = `cypress_crosstab_null_${Date.now()}`;
    const exportPath = `cypress/downloads/${fileBase}.json`;

    injectSyntheticNullCategory();

    cy.window().then((rawWin: unknown) => {
      const expected = buildExpectedCrosstabExportModel(rawWin as WinWithMT);

      exportCrosstab(fileBase, 'json');

      cy.readFile(exportPath, { timeout: 30000 }).then((rawPayload) => {
        const parsed = typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload;

        expect(parsed, 'json export with synthetic null bucket').to.deep.equal(expected.jsonRows);
        expect(
          (parsed as Array<Record<string, unknown>>).some((row) => row.col === null),
          'at least one exported row uses JSON null for the bucket label',
        ).to.equal(true);

        (parsed as Array<Record<string, unknown>>).forEach((row, index) => {
          expect(row, `json row ${index} omits Total`).to.not.have.property('Total');
        });
      });
    });
  });

  it('exports the crosstab as XLSX', () => {
    const fileBase = `cypress_crosstab_${Date.now()}`;
    const exportPath = `cypress/downloads/${fileBase}.xlsx`;

    configureChosenFields().then(() => {
      cy.window().then((rawWin: unknown) => {
        const expected = buildExpectedCrosstabExportModel(rawWin as WinWithMT);

        exportCrosstab(fileBase, 'xlsx');

        cy.readFile(exportPath, 'binary', { timeout: 30000 }).then((xlsxBinary) => {
          const workbook = XLSX.read(xlsxBinary, { type: 'binary' });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
            header: 1,
            defval: '',
            raw: false,
          });
          const normalizedRows = normalizeMatrix(rows);

          expect(normalizedRows[0], 'xlsx header row').to.deep.equal(expected.fieldHeaders);
          expect(normalizedRows.slice(1), 'xlsx body plus total row').to.deep.equal([
            ...expected.rows,
            expected.footer,
          ]);
        });
      });
    });
  });

  it('exports the crosstab as PDF', () => {
    const fileBase = `cypress_crosstab_${Date.now()}`;
    const exportPath = `cypress/downloads/${fileBase}.pdf`;

    exportCrosstab(fileBase, 'pdf');

    cy.readFile(exportPath, 'binary', { timeout: 30000 }).should((pdfBinary) => {
      expect(pdfBinary.length, 'pdf byte length').to.be.greaterThan(500);
    });
  });
});
