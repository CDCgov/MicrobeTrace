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

type RgbPixel = {
  r: number;
  g: number;
  b: number;
  a: number;
};

function openAlignmentSettingsSection(headerText: string): void {
  openAlignmentSettingsDialog();
  expandAccordionTabByHeader('@alignmentSettings', headerText);
}

function closeAlignmentSettings(): void {
  cy.get('@alignmentSettings')
    .find('button.p-dialog-close-button')
    .click({ force: true });
  cy.contains('.p-dialog-title', 'Alignment View Settings').should('not.exist');
}

function selectAlignmentToggle(selector: string, label: string): void {
  cy.get('@alignmentSettings')
    .find(selector)
    .contains(label)
    .click({ force: true });

  assertAlignmentReady();
}

function setNumberInput(selector: string, value: number): void {
  cy.get('@alignmentSettings')
    .find(selector)
    .should('exist')
    .invoke('val', String(value))
    .trigger('input')
    .trigger('change');
}

function readCanvasPixel(
  selector: string,
  x: number,
  y: number,
): Cypress.Chainable<RgbPixel> {
  return cy.get(selector).then(($canvas) => {
    const canvas = $canvas.get(0) as HTMLCanvasElement;
    const context = canvas.getContext('2d');

    expect(context, `2d context for ${selector}`).to.exist;

    const pixel = context!.getImageData(x, y, 1, 1).data;

    return {
      r: pixel[0],
      g: pixel[1],
      b: pixel[2],
      a: pixel[3],
    };
  });
}

function hexToRgb(hex: string): RgbPixel {
  const normalized = hex.replace('#', '');
  const value = normalized.length === 3
    ? normalized.split('').map((char) => `${char}${char}`).join('')
    : normalized;

  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
    a: 255,
  };
}

function expectPixelToMatch(pixel: RgbPixel, hex: string): void {
  const expected = hexToRgb(hex);

  expect(pixel.r, `red channel for ${hex}`).to.be.within(expected.r - 2, expected.r + 2);
  expect(pixel.g, `green channel for ${hex}`).to.be.within(expected.g - 2, expected.g + 2);
  expect(pixel.b, `blue channel for ${hex}`).to.be.within(expected.b - 2, expected.b + 2);
}

describe('Journey Flow - Alignment uploaded appearance settings', () => {
  const nodeListProfile = getProfile('alignment-angulartesting-sequence-node-list');

  it('applies preset and custom sizing controls coherently on uploaded Alignment data', () => {
    launchProfileToAlignment(nodeListProfile);
    assertAfterLaunchCounts(nodeListProfile);
    assertAlignmentReady();

    openAlignmentSettingsSection('Sizing');

    selectAlignmentToggle('#alignment-size-preset', 'Medium');
    cy.window().then((win: unknown) => {
      const alignment = (win as AlignmentWindow).commonService.visuals.alignment;
      const expectedWidth = alignment.longestSeqLength * 6;
      const expectedHeight = alignment.nodesWithSeq.length * 12;

      expect(alignment.widgets['alignView-selectedSize']).to.equal('m');
      expect(alignment.spanWidth).to.equal(6);
      expect(alignment.spanHeight).to.equal(12);
      expect(alignment.fontSize).to.equal(12);
      expect(alignment.leftWidth).to.equal(200);

      cy.get('.canvasHolder canvas').should(($canvas) => {
        const canvas = $canvas.get(0) as HTMLCanvasElement;
        expect(canvas.width).to.equal(expectedWidth);
        expect(canvas.height).to.equal(expectedHeight);
      });
    });

    selectAlignmentToggle('#alignment-size-preset', 'Large');
    cy.window().then((win: unknown) => {
      const alignment = (win as AlignmentWindow).commonService.visuals.alignment;
      const expectedWidth = alignment.longestSeqLength * 10;
      const expectedHeight = alignment.nodesWithSeq.length * 16;

      expect(alignment.widgets['alignView-selectedSize']).to.equal('l');
      expect(alignment.spanWidth).to.equal(10);
      expect(alignment.spanHeight).to.equal(16);
      expect(alignment.fontSize).to.equal(16);
      expect(alignment.leftWidth).to.equal(250);

      cy.get('.canvasHolder canvas').should(($canvas) => {
        const canvas = $canvas.get(0) as HTMLCanvasElement;
        expect(canvas.width).to.equal(expectedWidth);
        expect(canvas.height).to.equal(expectedHeight);
      });
    });

    selectAlignmentToggle('#alignment-size-preset', 'Small');
    cy.window().then((win: unknown) => {
      const alignment = (win as AlignmentWindow).commonService.visuals.alignment;
      const expectedWidth = alignment.longestSeqLength * 2;
      const expectedHeight = alignment.nodesWithSeq.length * 10;

      expect(alignment.widgets['alignView-selectedSize']).to.equal('s');
      expect(alignment.spanWidth).to.equal(2);
      expect(alignment.spanHeight).to.equal(10);
      expect(alignment.fontSize).to.equal(10);
      expect(alignment.leftWidth).to.equal(150);
      expect(alignment.widgets['alignView-charSetting']).to.equal('hide');

      cy.get('.canvasHolder canvas').should(($canvas) => {
        const canvas = $canvas.get(0) as HTMLCanvasElement;
        expect(canvas.width).to.equal(expectedWidth);
        expect(canvas.height).to.equal(expectedHeight);
      });
    });

    setNumberInput('#alignment-custom-height', 18);
    setNumberInput('#alignment-custom-width', 7);
    assertAlignmentReady();

    cy.window().then((win: unknown) => {
      const alignment = (win as AlignmentWindow).commonService.visuals.alignment;
      const expectedWidth = alignment.longestSeqLength * 7;
      const expectedHeight = alignment.nodesWithSeq.length * 18;

      expect(alignment.widgets['alignView-selectedSize']).to.equal('c');
      expect(alignment.widgets['alignView-spanHeight']).to.equal(18);
      expect(alignment.widgets['alignView-spanWidth']).to.equal(7);
      expect(alignment.spanHeight).to.equal(18);
      expect(alignment.spanWidth).to.equal(7);
      expect(alignment.fontSize).to.equal(16);
      expect(alignment.leftWidth).to.equal(250);

      cy.get('.canvasHolder canvas').should(($canvas) => {
        const canvas = $canvas.get(0) as HTMLCanvasElement;
        expect(canvas.width).to.equal(expectedWidth);
        expect(canvas.height).to.equal(expectedHeight);
      });
    });

    closeAlignmentSettings();

    openAlignmentExportDialog();
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
          expect(String(resolutionText).trim()).to.equal(expectedResolution);
        });
    });
  });

  it('applies alternative and custom nucleotide colors and switches to the amino-acid palette', () => {
    const customAColor = '#123456';

    launchProfileToAlignment(nodeListProfile);
    assertAfterLaunchCounts(nodeListProfile);
    assertAlignmentReady();

    openAlignmentSettingsSection('Colors');

    readCanvasPixel('.canvasHolder canvas', 1, 1).then((normalMainPixel) => {
      expectPixelToMatch(normalMainPixel, '#ccff00');
    });
    readCanvasPixel('#miniMap canvas', 0, 0).then((normalMiniMapPixel) => {
      expectPixelToMatch(normalMiniMapPixel, '#ccff00');
    });

    selectAlignmentToggle('#alignment-color-scheme', 'Alternative');
    cy.window().then((win: unknown) => {
      const alignment = (win as AlignmentWindow).commonService.visuals.alignment;
      expect(alignment.widgets['alignView-colorSchemeName']).to.equal('a');
      expect(alignment.useCustomColorScheme).to.equal(false);
    });
    readCanvasPixel('.canvasHolder canvas', 1, 1).then((alternativeMainPixel) => {
      expectPixelToMatch(alternativeMainPixel, '#009E73');
    });
    readCanvasPixel('#miniMap canvas', 0, 0).then((alternativeMiniMapPixel) => {
      expectPixelToMatch(alternativeMiniMapPixel, '#009E73');
    });

    selectAlignmentToggle('#alignment-color-scheme', 'Custom');
    cy.get('@alignmentSettings')
      .find('#alignment-custom-color-a')
      .should('exist')
      .invoke('val', customAColor)
      .trigger('change');
    assertAlignmentReady();

    cy.window().then((win: unknown) => {
      const alignment = (win as AlignmentWindow).commonService.visuals.alignment;
      expect(alignment.widgets['alignView-colorSchemeName']).to.equal('c');
      expect(alignment.widgets['alignView-customColorScheme']['A']).to.equal(customAColor);
      expect(alignment.useCustomColorScheme).to.equal(true);
    });
    readCanvasPixel('.canvasHolder canvas', 1, 1).then((customMainPixel) => {
      expectPixelToMatch(customMainPixel, customAColor);
    });
    readCanvasPixel('#miniMap canvas', 0, 0).then((customMiniMapPixel) => {
      expectPixelToMatch(customMiniMapPixel, customAColor);
    });

    expandAccordionTabByHeader('@alignmentSettings', 'Data');
    selectAlignmentToggle('#alignment-seq-type', 'Amino Acids');

    cy.window().then((win: unknown) => {
      const alignment = (win as AlignmentWindow).commonService.visuals.alignment;
      const firstAminoAcid = String(alignment.seqArray[0][0] || 'X');
      const expectedAminoAcidColor = alignment.colorScheme[firstAminoAcid] || alignment.colorScheme.X;

      expect(alignment.selectedSeqType).to.equal('aa');

      cy.get('@alignmentSettings').find('#alignment-custom-color-a').should('not.exist');
      readCanvasPixel('.canvasHolder canvas', 1, 1).then((aminoAcidPixel) => {
        expectPixelToMatch(aminoAcidPixel, expectedAminoAcidColor);
      });
    });

    closeAlignmentSettings();
  });
});
