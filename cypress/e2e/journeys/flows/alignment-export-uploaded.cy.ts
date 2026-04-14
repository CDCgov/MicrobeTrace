/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  assertAlignmentReady,
  expandAccordionTabByHeader,
  launchProfileToAlignment,
  openAlignmentExportDialog,
  openAlignmentSettingsDialog,
} from '../../../support/journey-helpers';

type AlignmentWindow = Window & {
  commonService: {
    visuals: {
      alignment: any;
    };
  };
};

function openAlignmentDataSettings(): void {
  openAlignmentSettingsDialog();
  expandAccordionTabByHeader('@alignmentSettings', 'Data');
}

function closeAlignmentSettings(): void {
  cy.get('@alignmentSettings')
    .find('button.p-dialog-close-button')
    .click({ force: true });
  cy.contains('.p-dialog-title', 'Alignment View Settings').should('not.exist');
}

function setNumberInput(selector: string, value: number): void {
  cy.get('@alignmentSettings')
    .find(selector)
    .should('exist')
    .invoke('val', String(value))
    .trigger('input')
    .trigger('change');
}

function setAlignmentRange(start: number, end: number): void {
  setNumberInput('#alignment-start-position', start);
  cy.window()
    .its('commonService.visuals.alignment.startPos')
    .should('equal', start);

  setNumberInput('#alignment-end-position', end);
  cy.window()
    .its('commonService.visuals.alignment.endPos')
    .should('equal', end);

  assertAlignmentReady();
}

function selectAlignmentMode(label: 'Amino Acids'): void {
  cy.get('@alignmentSettings')
    .find('#alignment-seq-type')
    .contains(label)
    .click({ force: true });

  assertAlignmentReady();
}

describe('Journey Flow - Alignment export on uploaded data', () => {
  const profile = getProfile('alignment-angulartesting-sequence-node-list');

  it('exports the uploaded Alignment view as SVG plus FASTA and CSV data artifacts', () => {
    const exportBase = `cypress_alignment_export_${Date.now()}`;
    const svgPath = `cypress/downloads/${exportBase}.svg`;
    const fastaPath = `cypress/downloads/${exportBase}.fasta`;
    const csvPath = `cypress/downloads/${exportBase}.csv`;

    launchProfileToAlignment(profile);
    assertAfterLaunchCounts(profile);
    assertAlignmentReady();

    openAlignmentExportDialog();

    cy.get('@alignmentExportDialog')
      .find('#alignment-export-visual-filename')
      .clear()
      .type(exportBase);
    cy.get('@alignmentExportDialog')
      .find('#alignment-export-visual-filetype')
      .select('svg');
    cy.get('@alignmentExportDialog')
      .find('#alignment-export-visual')
      .click({ force: true });

    cy.readFile(svgPath, 'utf8', { timeout: 30000 }).should((svgText) => {
      expect(svgText, 'exported alignment SVG content').to.include('<svg');
      expect(svgText.length, 'exported alignment SVG length').to.be.greaterThan(100);
    });

    cy.get('@alignmentExportDialog').contains('.nav-link', 'Data').click({ force: true });
    cy.get('@alignmentExportDialog')
      .find('#alignment-export-data-filename')
      .clear()
      .type(exportBase);
    cy.get('@alignmentExportDialog')
      .find('#alignment-export-data-filetype')
      .select('fasta');
    cy.get('@alignmentExportDialog')
      .find('#alignment-export-data')
      .click({ force: true });

    cy.readFile(fastaPath, 'utf8', { timeout: 30000 }).should((fastaText) => {
      expect(fastaText, 'exported alignment FASTA content').to.include('>');
      expect(fastaText, 'exported alignment FASTA sequence data').to.include('KF773430');
    });

    cy.get('@alignmentExportDialog').contains('.nav-link', 'DataTable').click({ force: true });
    cy.get('@alignmentExportDialog')
      .find('#alignment-export-table-filename')
      .clear()
      .type(exportBase);
    cy.get('@alignmentExportDialog')
      .find('#alignment-export-table')
      .click({ force: true });

    cy.readFile(csvPath, 'utf8', { timeout: 30000 }).should((csvText) => {
      expect(csvText, 'exported alignment CSV header').to.include('position,');
      expect(csvText.length, 'exported alignment CSV length').to.be.greaterThan(100);
    });
  });

  it('exports the uploaded Alignment view as PNG with resolution text matching the rendered size', () => {
    const exportBase = `cypress_alignment_export_png_${Date.now()}`;
    const pngPath = `cypress/downloads/${exportBase}.png`;

    launchProfileToAlignment(profile);
    assertAfterLaunchCounts(profile);
    assertAlignmentReady();

    openAlignmentExportDialog();

    cy.get('@alignmentExportDialog')
      .find('#alignment-export-visual-filename')
      .clear()
      .type(exportBase);
    cy.get('@alignmentExportDialog')
      .find('#alignment-export-visual-filetype')
      .select('png');

    cy.window().then((win: unknown) => {
      const alignment = (win as AlignmentWindow).commonService.visuals.alignment;
      const expectedResolution =
        `${alignment.spanWidth * alignment.longestSeqLength} x ` +
        `${alignment.spanHeight * alignment.nodesWithSeq.length + 140} px`;

      cy.get('@alignmentExportDialog')
        .find('#alignment-export-visual-resolution')
        .invoke('text')
        .then((resolutionText) => {
          expect(String(resolutionText).trim(), 'PNG export resolution text').to.equal(expectedResolution);
        });
    });

    cy.get('@alignmentExportDialog')
      .find('#alignment-export-visual')
      .click({ force: true });

    cy.readFile(pngPath, 'binary', { timeout: 30000 }).should((pngBinary) => {
      expect(pngBinary.length, 'exported alignment PNG byte length').to.be.greaterThan(1000);
    });
  });

  it('exports uploaded Alignment MEGA plus consensus-enabled FASTA and DataTable artifacts', () => {
    const megaBase = `cypress_alignment_export_mega_${Date.now()}`;
    const megaConsensusBase = `cypress_alignment_export_mega_consensus_${Date.now()}`;
    const fastaConsensusBase = `cypress_alignment_export_consensus_${Date.now()}`;
    const csvConsensusBase = `cypress_alignment_export_table_consensus_${Date.now()}`;
    const megaPath = `cypress/downloads/${megaBase}.meg`;
    const megaConsensusPath = `cypress/downloads/${megaConsensusBase}.meg`;
    const fastaPath = `cypress/downloads/${fastaConsensusBase}.fasta`;
    const csvPath = `cypress/downloads/${csvConsensusBase}.csv`;

    launchProfileToAlignment(profile);
    assertAfterLaunchCounts(profile);
    assertAlignmentReady();

    openAlignmentExportDialog();

    cy.get('@alignmentExportDialog').contains('.nav-link', 'Data').click({ force: true });

    cy.get('@alignmentExportDialog')
      .find('#alignment-export-data-filename')
      .clear()
      .type(megaBase);
    cy.get('@alignmentExportDialog')
      .find('#alignment-export-data-filetype')
      .select('mega');
    cy.get('@alignmentExportDialog')
      .find('#alignment-export-data')
      .click({ force: true });

    cy.readFile(megaPath, 'utf8', { timeout: 30000 }).should((megaText) => {
      expect(megaText, 'exported alignment MEGA header').to.include('#mega');
      expect(megaText, 'exported alignment MEGA content').to.include('#KF773430');
    });

    cy.get('@alignmentExportDialog')
      .find('#alignment-export-data-filename')
      .clear()
      .type(fastaConsensusBase);
    cy.get('@alignmentExportDialog')
      .find('#alignment-export-data-filetype')
      .select('fasta');
    cy.get('@alignmentExportDialog')
      .find('#alignment-export-data-include-consensus')
      .check({ force: true });
    cy.get('@alignmentExportDialog')
      .find('#alignment-export-data')
      .click({ force: true });

    cy.readFile(fastaPath, 'utf8', { timeout: 30000 }).should((fastaText) => {
      expect(fastaText, 'exported alignment FASTA consensus header').to.include('>consensus');
      expect(fastaText, 'exported alignment FASTA sequence content').to.include('>KF773430');
    });

    cy.get('@alignmentExportDialog')
      .find('#alignment-export-data-filename')
      .clear()
      .type(megaConsensusBase);
    cy.get('@alignmentExportDialog')
      .find('#alignment-export-data-filetype')
      .select('mega');
    cy.get('@alignmentExportDialog')
      .find('#alignment-export-data')
      .click({ force: true });

    cy.readFile(megaConsensusPath, 'utf8', { timeout: 30000 }).should((megaText) => {
      expect(megaText, 'exported alignment MEGA consensus header').to.include('#consensus');
      expect(megaText, 'exported alignment MEGA sequence content').to.include('#KF773430');
    });

    cy.get('@alignmentExportDialog').contains('.nav-link', 'DataTable').click({ force: true });
    cy.get('@alignmentExportDialog')
      .find('#alignment-export-table-filename')
      .clear()
      .type(csvConsensusBase);
    cy.get('@alignmentExportDialog')
      .find('#alignment-export-table-include-consensus')
      .check({ force: true });
    cy.get('@alignmentExportDialog')
      .find('#alignment-export-table')
      .click({ force: true });

    cy.readFile(csvPath, 'utf8', { timeout: 30000 }).should((csvText) => {
      expect(csvText, 'exported alignment consensus CSV header').to.include('position,consensus,');
      expect(csvText, 'exported alignment consensus CSV content').to.match(/1,[A-Z*-]/);
    });
  });

  it('exports translated amino-acid FASTA content from uploaded Alignment data', () => {
    const exportBase = `cypress_alignment_export_aa_${Date.now()}`;
    const fastaPath = `cypress/downloads/${exportBase}.fasta`;
    let expectedFirstLabel = '';
    let expectedFirstSequence = '';
    let expectedSequenceLength = 0;

    launchProfileToAlignment(profile);
    assertAfterLaunchCounts(profile);
    assertAlignmentReady();

    openAlignmentDataSettings();
    setAlignmentRange(2, 52);
    selectAlignmentMode('Amino Acids');

    cy.window().then((win: unknown) => {
      const alignment = (win as AlignmentWindow).commonService.visuals.alignment;

      expectedFirstLabel = String(alignment.labelArray[0]._id);
      expectedFirstSequence = String(alignment.seqArray[0]);
      expectedSequenceLength = Number(alignment.currentSeqLength);
    });

    closeAlignmentSettings();

    openAlignmentExportDialog();
    cy.get('@alignmentExportDialog').contains('.nav-link', 'Data').click({ force: true });
    cy.get('@alignmentExportDialog')
      .find('#alignment-export-data-filename')
      .clear()
      .type(exportBase);
    cy.get('@alignmentExportDialog')
      .find('#alignment-export-data-filetype')
      .select('fasta');
    cy.get('@alignmentExportDialog')
      .find('#alignment-export-data')
      .click({ force: true });

    cy.readFile(fastaPath, 'utf8', { timeout: 30000 }).should((fastaText) => {
      const exportedSequenceLines = fastaText
        .split(/\r?\n/)
        .filter((line) => Boolean(line) && !line.startsWith('>'));

      expect(fastaText, 'amino-acid FASTA header').to.include(`>${expectedFirstLabel}`);
      expect(fastaText, 'amino-acid FASTA sequence').to.include(expectedFirstSequence);
      expect(
        exportedSequenceLines.every((line) => line.length <= expectedSequenceLength),
        'translated amino-acid export line lengths',
      ).to.equal(true);
      expect(
        exportedSequenceLines.some((line) => line.length === expectedSequenceLength),
        'translated amino-acid export contains amino-acid-length lines',
      ).to.equal(true);
    });
  });

  it('exports translated amino-acid MEGA and consensus DataTable artifacts from uploaded Alignment data', () => {
    const megaBase = `cypress_alignment_export_aa_mega_${Date.now()}`;
    const csvBase = `cypress_alignment_export_aa_table_${Date.now()}`;
    const megaPath = `cypress/downloads/${megaBase}.meg`;
    const csvPath = `cypress/downloads/${csvBase}.csv`;

    launchProfileToAlignment(profile);
    assertAfterLaunchCounts(profile);
    assertAlignmentReady();

    openAlignmentDataSettings();
    setAlignmentRange(2, 52);
    selectAlignmentMode('Amino Acids');
    closeAlignmentSettings();

    openAlignmentExportDialog();
    cy.get('@alignmentExportDialog').contains('.nav-link', 'Data').click({ force: true });

    cy.get('@alignmentExportDialog')
      .find('#alignment-export-data-filename')
      .clear()
      .type(megaBase);
    cy.get('@alignmentExportDialog')
      .find('#alignment-export-data-filetype')
      .select('mega');
    cy.get('@alignmentExportDialog')
      .find('#alignment-export-data')
      .click({ force: true });

    cy.readFile(megaPath, 'utf8', { timeout: 30000 }).should((megaText) => {
      expect(megaText, 'amino-acid MEGA header').to.include('#mega');
      expect(megaText, 'amino-acid MEGA datatype').to.include('DataType=Protein');
      expect(megaText, 'amino-acid MEGA identifiers').to.include('#KF773430');
    });

    cy.get('@alignmentExportDialog').contains('.nav-link', 'DataTable').click({ force: true });
    cy.get('@alignmentExportDialog')
      .find('#alignment-export-table-filename')
      .clear()
      .type(csvBase);
    cy.get('@alignmentExportDialog')
      .find('#alignment-export-table-include-consensus')
      .check({ force: true });
    cy.get('@alignmentExportDialog')
      .find('#alignment-export-table')
      .click({ force: true });

    cy.readFile(csvPath, 'utf8', { timeout: 30000 }).should((csvText) => {
      expect(csvText, 'amino-acid DataTable consensus header')
        .to.include('position,consensus,"consensus ambiguities (most prevalent AA outside of brackets, other AAs found at this position inside brackets)",A,R,N,D,C,E,Q,G,H,I,L,K,M,F,P,S,T,W,Y,V,stop,gap,ambiguous');
      expect(csvText, 'amino-acid DataTable first row').to.match(/^1,[A-Z*X-],/m);
    });
  });
});
