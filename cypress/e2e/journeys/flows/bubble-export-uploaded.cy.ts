/// <reference types="cypress" />

import { byTestId, testIds } from '../../../support/selectors';
import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  goToBubbleView,
  launchProfileToTwoD,
} from '../../../support/journey-helpers';

describe('Journey Flow - Bubble export on uploaded data', () => {
  const profile = getProfile('color-by-uploaded-categorical');

  it('exports the uploaded Bubble view as an SVG file', () => {
    const exportFileBase = `cypress_bubble_export_${Date.now()}`;
    const exportPath = `cypress/downloads/${exportFileBase}.svg`;

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    goToBubbleView();

    cy.get(byTestId(testIds.bubbleExportButton), { timeout: 15000 }).click({ force: true });
    cy.contains('.p-dialog-title', 'Export Bubble View')
      .should('be.visible')
      .parents('.p-dialog')
      .as('exportDialog');

    cy.get('@exportDialog')
      .find('#bubble-export-filename')
      .invoke('val', exportFileBase)
      .trigger('input')
      .trigger('change');

    cy.get('@exportDialog').find('#bubble-export-filetype').select('svg');
    cy.get('@exportDialog').find('#bubble-export-confirm').click({ force: true });
    cy.contains('.p-dialog-title', 'Export Bubble View').should('not.exist');

    cy.readFile(exportPath, 'utf8', { timeout: 20000 }).should((svgText) => {
      expect(svgText, 'exported Bubble SVG content').to.include('<svg');
      expect(svgText.length, 'exported Bubble SVG length').to.be.greaterThan(100);
    });
  });

  it('exports the uploaded Bubble view as a PNG file after changing the advanced scale', () => {
    const exportFileBase = `cypress_bubble_export_png_${Date.now()}`;
    const exportPath = `cypress/downloads/${exportFileBase}.png`;
    const exportScale = '1.5';
    let initialDimensions = '';

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    goToBubbleView();

    cy.get(byTestId(testIds.bubbleExportButton), { timeout: 15000 }).click({ force: true });
    cy.contains('.p-dialog-title', 'Export Bubble View')
      .should('be.visible')
      .parents('.p-dialog')
      .as('exportDialog');

    cy.get('@exportDialog')
      .find('#bubble-export-filename')
      .invoke('val', exportFileBase)
      .trigger('input')
      .trigger('change');

    cy.get('@exportDialog').find('#bubble-export-filetype').select('png');
    cy.get('@exportDialog').contains('p-accordion-header', 'Advanced').click({ force: true });
    cy.get('@exportDialog').find('#bubble-export-scale').should('be.visible');

    cy.get('@exportDialog')
      .find('#bubble-export-dimensions')
      .invoke('text')
      .then((text) => {
        initialDimensions = String(text).trim();
      });

    cy.get('@exportDialog')
      .find('#bubble-export-scale')
      .clear()
      .type(exportScale)
      .trigger('input')
      .trigger('change');

    cy.get('@exportDialog')
      .find('#bubble-export-dimensions')
      .invoke('text')
      .should((text) => {
        expect(String(text).trim(), 'updated Bubble export dimensions').not.to.equal(initialDimensions);
      });

    cy.get('@exportDialog').find('#bubble-export-confirm').click({ force: true });
    cy.contains('.p-dialog-title', 'Export Bubble View').should('not.exist');

    cy.readFile(exportPath, null, { timeout: 30000 }).should((pngBuffer) => {
      const byteLength = (pngBuffer as { byteLength?: number; length?: number } | null)?.byteLength
        ?? (pngBuffer as { length?: number } | null)?.length
        ?? 0;

      expect(pngBuffer, 'exported Bubble PNG buffer').not.to.equal(null);
      expect(byteLength, 'exported Bubble PNG byte length').to.be.greaterThan(1000);
    });
  });
});
