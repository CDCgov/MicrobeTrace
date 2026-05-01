/// <reference types="cypress" />

import JSZip from 'jszip';
import * as XLSX from 'xlsx';

import {
  addAggregateTable,
  assertAggregateTableCount,
  assertAggregateTableMatchesModel,
  readDisplayedAggregateRows,
  selectAggregateField,
} from '../../../support/aggregate-helpers';
import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  assertAggregateReady,
  goToAggregateView,
  launchProfileToTwoD,
  openAggregateExportDialog,
  openAggregateSettingsDialog,
} from '../../../support/journey-helpers';
import type { AggregateRow } from '../../../support/aggregate-helpers';

const compareAggregateRows = (left: AggregateRow, right: AggregateRow): number => {
  if (left.groupName !== right.groupName) {
    return left.groupName.localeCompare(right.groupName, undefined, { numeric: true });
  }

  if (left.count !== right.count) {
    return left.count - right.count;
  }

  return left.percent.localeCompare(right.percent);
};

const computeNormalizedNodeFieldRows = (win: any, field: string): AggregateRow[] => {
  const counts = new Map<string, number>();
  let total = 0;

  win.commonService.getVisibleNodes().forEach((node: any) => {
    const rawValue = node?.[field];
    const trimmedValue = rawValue == null ? '' : String(rawValue).trim();
    const visibleLabel = trimmedValue === '' ? 'null' : trimmedValue;

    counts.set(visibleLabel, (counts.get(visibleLabel) || 0) + 1);
    total += 1;
  });

  return Array.from(counts.entries())
    .map(([groupName, count]) => ({
      groupName,
      count,
      percent: `${((count * 100) / total).toFixed(2)}%`,
    }))
    .sort(compareAggregateRows);
};

type AggregateUploadedCase = {
  profileId: string;
  aggregateFieldOption: string;
  aggregateFieldValue: string;
};

const AGGREGATE_CASES: AggregateUploadedCase[] = [
  {
    profileId: 'nn-snps16-edgelist',
    aggregateFieldOption: 'Distance',
    aggregateFieldValue: 'Link-distance',
  },
  {
    profileId: 'nn-snps16-matrix',
    aggregateFieldOption: 'Distance',
    aggregateFieldValue: 'Link-distance',
  },
  {
    profileId: 'nn-snps16-fasta',
    aggregateFieldOption: 'Distance',
    aggregateFieldValue: 'Link-distance',
  },
  {
    profileId: 'color-by-uploaded-categorical',
    aggregateFieldOption: 'Node type',
    aggregateFieldValue: 'Node-Node type',
  },
  {
    profileId: 'grouping-tn93-sequences-subtype-colors-threshold',
    aggregateFieldOption: 'Subtype',
    aggregateFieldValue: 'Node-subtype',
  },
  {
    profileId: 'load-twod-newick-tn93-angular-testing',
    aggregateFieldOption: 'Distance',
    aggregateFieldValue: 'Link-distance',
  },
];

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

describe('Journey Flow - Aggregate uploaded data coverage', () => {
  AGGREGATE_CASES.forEach(({ profileId, aggregateFieldOption, aggregateFieldValue }) => {
    const profile = getProfile(profileId);

    it(`summarizes uploaded data for ${profileId}`, () => {
      launchProfileToTwoD(profile);
      assertAfterLaunchCounts(profile);

      goToAggregateView();
      assertAggregateReady();
      assertAggregateTableCount(1);
      assertAggregateTableMatchesModel(0, 'Node-cluster');

      openAggregateSettingsDialog();
      addAggregateTable();
      selectAggregateField(1, aggregateFieldOption, aggregateFieldValue);
      cy.closeSettingsPane('Aggregate Settings');

      assertAggregateTableCount(2);
      assertAggregateTableMatchesModel(0, 'Node-cluster');
      assertAggregateTableMatchesModel(1, aggregateFieldValue);
    });
  });

  it('exports uploaded aggregate summaries as json, xlsx, csv.zip, and pdf', () => {
    const profile = getProfile('color-by-uploaded-categorical');

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);

    goToAggregateView();
    assertAggregateReady();

    openAggregateSettingsDialog();
    addAggregateTable();
    selectAggregateField(1, 'Contact type', 'Link-Contact type');
    cy.closeSettingsPane('Aggregate Settings');

    assertAggregateTableCount(2);
    assertAggregateTableMatchesModel(0, 'Node-cluster');
    assertAggregateTableMatchesModel(1, 'Link-Contact type');

    const downloadsFolder = Cypress.config('downloadsFolder');

    const jsonFileBase = `cypress_aggregate_${Date.now()}_json`;
    openAggregateExportDialog();
    setAggregateExportFileName(jsonFileBase);
    selectAggregateExportType('json', 'json');
    cy.get('@aggregateExport').contains('button', 'Export').click({ force: true });
    cy.readFile(`${downloadsFolder}/${jsonFileBase}.json`, { timeout: 20000 }).then((rawPayload) => {
      const payload = typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload;

      expect(payload, 'aggregate json payload').to.have.length(2);
      expect(payload[0]?.dataset, 'first json dataset').to.equal('node');
      expect(payload[0]?.column, 'first json column').to.equal('cluster');
      expect(payload[1]?.dataset, 'second json dataset').to.equal('link');
      expect(payload[1]?.column, 'second json column').to.equal('Contact type');
      expect(payload[0].data.length, 'node cluster aggregate rows').to.be.greaterThan(0);
      expect(payload[1].data.length, 'link contact aggregate rows').to.be.greaterThan(0);
    });
    cy.closeSettingsPane('Aggregate Export');

    const xlsxFileBase = `cypress_aggregate_${Date.now()}_xlsx`;
    openAggregateExportDialog();
    setAggregateExportFileName(xlsxFileBase);
    selectAggregateExportType('xlsx', 'xlsx');
    cy.get('@aggregateExport').contains('button', 'Export').click({ force: true });
    cy.readFile(`${downloadsFolder}/${xlsxFileBase}.xlsx`, 'binary', { timeout: 20000 }).then((binary) => {
      const workbook = XLSX.read(binary, { type: 'binary' });
      expect(workbook.SheetNames).to.include.members(['Node-cluster', 'Link-Contact type']);
      expect(workbook.Sheets['Node-cluster'], 'Node-cluster sheet').to.exist;
      expect(workbook.Sheets['Link-Contact type'], 'Link-Contact type sheet').to.exist;
    });
    cy.closeSettingsPane('Aggregate Export');

    const zipFileBase = `cypress_aggregate_${Date.now()}_zip`;
    openAggregateExportDialog();
    setAggregateExportFileName(zipFileBase);
    selectAggregateExportType('csv.zip', 'csv.zip');
    cy.get('@aggregateExport').contains('button', 'Export').click({ force: true });
    cy.readFile(`${downloadsFolder}/${zipFileBase}.zip`, 'binary', { timeout: 20000 }).then((binary) => {
      return JSZip.loadAsync(binary).then((zip) => {
        expect(Object.keys(zip.files)).to.include.members(['Node-cluster.csv', 'Link-Contact type.csv']);
      });
    });
    cy.closeSettingsPane('Aggregate Export');

    const pdfFileBase = `cypress_aggregate_${Date.now()}_pdf`;
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

  it('normalizes sparse uploaded Profession buckets into unique visible aggregate rows', () => {
    const profile = getProfile('color-by-uploaded-categorical');

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);

    goToAggregateView();
    assertAggregateReady();
    assertAggregateTableCount(1);
    assertAggregateTableMatchesModel(0, 'Node-cluster');

    openAggregateSettingsDialog();
    addAggregateTable();
    selectAggregateField(1, 'Profession', 'Node-Profession');
    cy.closeSettingsPane('Aggregate Settings');

    assertAggregateTableCount(2);

    cy.window().then((win: any) => {
      const expectedRows = computeNormalizedNodeFieldRows(win, 'Profession');

      readDisplayedAggregateRows(1).then((rows) => {
        const normalizedRows = [...rows].sort(compareAggregateRows);
        const uniqueVisibleLabels = new Set(rows.map((row) => row.groupName));
        const nullLikeBuckets = rows.filter((row) => row.groupName === 'null' || row.groupName === '');

        expect(uniqueVisibleLabels.size, 'visible Profession bucket labels are unique').to.equal(rows.length);
        expect(nullLikeBuckets.length, 'missing and blank Profession values share one visible bucket').to.equal(1);
        expect(normalizedRows, 'normalized Profession aggregate rows').to.deep.equal(expectedRows);
      });
    });
  });
});
