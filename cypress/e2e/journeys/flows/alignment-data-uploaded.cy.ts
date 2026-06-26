/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  assertAlignmentReady,
  expandAccordionTabByHeader,
  launchProfileToAlignment,
  openAlignmentSettingsDialog,
} from '../../../support/journey-helpers';

type AlignmentWindow = Window & {
  commonService: {
    visuals: {
      alignment: any;
    };
  };
};

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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

function selectAlignmentMode(label: 'Nucleotides' | 'Codons' | 'Amino Acids'): void {
  cy.get('@alignmentSettings')
    .find('#alignment-seq-type')
    .contains(label)
    .click({ force: true });

  assertAlignmentReady();
}

function selectAlignmentOption(selector: string, label: string): void {
  cy.get('@alignmentSettings')
    .find(selector)
    .click({ force: true });

  cy.contains(
    'li[role="option"]',
    new RegExp(`^${escapeForRegex(label)}$`),
    { timeout: 15000 },
  ).click({ force: true });

  assertAlignmentReady();
}

function readCanvasDimensions(): Cypress.Chainable<{ width: number; height: number }> {
  return cy.get('.canvasHolder canvas').then(($canvas) => {
    const canvas = $canvas.get(0) as HTMLCanvasElement;

    return {
      width: canvas.width,
      height: canvas.height,
    };
  });
}

describe('Journey Flow - Alignment uploaded data controls', () => {
  const profile = getProfile('alignment-angulartesting-sequence-node-list');

  it('updates uploaded Alignment windowing coherently when start and end positions change', () => {
    launchProfileToAlignment(profile);
    assertAfterLaunchCounts(profile);
    assertAlignmentReady();

    readCanvasDimensions().then((initialCanvas) => {
      openAlignmentDataSettings();
      setAlignmentRange(10, 60);

      cy.get('@alignmentSettings')
        .find('#alignment-length-string')
        .should('have.text', '51 nt');

      cy.window().then((win: unknown) => {
        const alignment = (win as AlignmentWindow).commonService.visuals.alignment;

        expect(alignment.currentSeqLength, 'current sequence length').to.equal(51);
        expect(alignment.lengthString, 'length string').to.equal('51 nt');
      });

      cy.contains('#tool-btn-container', 'Position: 10-60').should('be.visible');

      cy.get('#alignmentTop svg text').then(($texts) => {
        const visibleTicks = [...$texts].map((node) => String(node.textContent || '').trim());
        expect(visibleTicks, 'ruler ticks within selected window').to.include('10');
        expect(visibleTicks, 'ruler ticks within selected window').to.include('50');
      });

      readCanvasDimensions().then((updatedCanvas) => {
        expect(updatedCanvas.width, 'windowed canvas width').to.be.lessThan(initialCanvas.width);
        expect(updatedCanvas.height, 'row count remains stable').to.equal(initialCanvas.height);
      });

      closeAlignmentSettings();
      assertAlignmentReady();
    });
  });

  it('supports uploaded Alignment codon and amino-acid sequence branches', () => {
    launchProfileToAlignment(profile);
    assertAfterLaunchCounts(profile);
    assertAlignmentReady();

    openAlignmentDataSettings();
    setAlignmentRange(1, 12);

    cy.get('@alignmentSettings')
      .find('#alignment-length-string')
      .should('have.text', '12 nt');

    readCanvasDimensions().then((nucleotideCanvas) => {
      selectAlignmentMode('Codons');

      cy.window().then((win: unknown) => {
        const alignment = (win as AlignmentWindow).commonService.visuals.alignment;

        expect(alignment.selectedSeqType, 'selected sequence type').to.equal('codon');
        expect(alignment.currentSeqLength, 'codon mode keeps nucleotide length').to.equal(12);
        expect(alignment.seqArray[0], 'codon-spaced sequence').to.match(/^[A-Z-]{3}( [A-Z-]{3}){3}$/);
      });

      cy.get('@alignmentSettings')
        .find('#alignment-length-string')
        .should('have.text', '12 nt');

      readCanvasDimensions().then((codonCanvas) => {
        expect(codonCanvas.width, 'codon canvas width').to.be.greaterThan(nucleotideCanvas.width);
      });

      selectAlignmentMode('Amino Acids');

      cy.get('@alignmentSettings')
        .find('#alignment-translation-setting')
        .should('be.visible');
      cy.get('@alignmentSettings')
        .find('#alignment-length-string')
        .should('have.text', '12 nt => 4 aa');

      cy.window().then((win: unknown) => {
        const alignment = (win as AlignmentWindow).commonService.visuals.alignment;

        expect(alignment.selectedSeqType, 'selected sequence type').to.equal('aa');
        expect(alignment.currentSeqLength, 'amino-acid sequence length').to.equal(4);
        expect(alignment.seqArray[0], 'translated amino-acid sequence').to.match(/^[A-Z*X-]{4}$/);
      });

      readCanvasDimensions().then((aminoAcidCanvas) => {
        expect(aminoAcidCanvas.width, 'amino-acid canvas width').to.be.lessThan(nucleotideCanvas.width);
      });

      closeAlignmentSettings();
      assertAlignmentReady();
    });
  });

  it('changes translated amino-acid output when translation settings change on gapped uploaded sequences', () => {
    let codonTranslatedSequences: string[] = [];

    launchProfileToAlignment(profile);
    assertAfterLaunchCounts(profile);
    assertAlignmentReady();

    openAlignmentDataSettings();
    setAlignmentRange(2, 52);
    selectAlignmentMode('Amino Acids');

    cy.get('@alignmentSettings')
      .find('#alignment-length-string')
      .should('have.text', '51 nt => 17 aa');

    cy.window().then((win: unknown) => {
      const alignment = (win as AlignmentWindow).commonService.visuals.alignment;

      codonTranslatedSequences = [...alignment.seqArray];
      expect(alignment.translationSetting, 'default translation setting').to.equal('Maintain Codons');
      expect(
        codonTranslatedSequences.some((sequence) => sequence.includes('X')),
        'gapped codon translation includes ambiguous amino acids',
      ).to.equal(true);
    });

    selectAlignmentOption('#alignment-translation-setting', 'Maintain Reading Frame');

    cy.window().then((win: unknown) => {
      const alignment = (win as AlignmentWindow).commonService.visuals.alignment;
      const readingFrameSequences = [...alignment.seqArray];
      const codonXCount = codonTranslatedSequences.join('').split('').filter((char) => char === 'X').length;
      const readingFrameXCount = readingFrameSequences.join('').split('').filter((char) => char === 'X').length;

      expect(alignment.translationSetting, 'updated translation setting').to.equal('Maintain Reading Frame');
      expect(readingFrameSequences, 'translated sequences change with reading-frame mode')
        .to.not.deep.equal(codonTranslatedSequences);
      expect(readingFrameXCount, 'reading-frame translation reduces ambiguous amino acids')
        .to.be.lessThan(codonXCount);
    });

    closeAlignmentSettings();
    assertAlignmentReady();
  });
});
