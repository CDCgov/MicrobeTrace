/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  launchProfileToEpiCurve,
  openEpiCurveSettingsDialog,
} from '../../../support/journey-helpers';
import {
  selectEpiCurveDropdown,
} from '../../../support/epi-curve-helpers';

describe('Journey Flow - Epi Curve export on uploaded data', () => {
  const profile = getProfile('timeline-covid-node-link');

  const closeDialogIfVisible = (dialogTitle: string): void => {
    cy.get('body').then(($body) => {
      const hasVisibleDialog =
        $body.find(`.p-dialog:visible .p-dialog-title:contains("${dialogTitle}")`).length > 0;

      if (hasVisibleDialog) {
        cy.closeSettingsPane(dialogTitle);
      }
    });
  };

  const openExportDialog = (): void => {
    cy.get('#tool-btn-container-epi a[title="Export Screen"]').click({ force: true });
    cy.contains('.p-dialog-title', 'Export Epi Curve')
      .should('be.visible')
      .parents('.p-dialog')
      .as('exportDialog');
  };

  const fillExportFilename = (exportFileBase: string): void => {
    cy.get('@exportDialog')
      .find('input[placeholder="Filename"]')
      .clear()
      .type(exportFileBase)
      .should('have.value', exportFileBase);
  };

  beforeEach(() => {
    launchProfileToEpiCurve(profile);
    assertAfterLaunchCounts(profile);
    openEpiCurveSettingsDialog();
    selectEpiCurveDropdown('Date Field', 'Date of symptom onset Date');
    closeDialogIfVisible('Epi Curve Settings');
  });

  it('exports the uploaded Epi Curve view as a PNG file', () => {
    const exportFileBase = `cypress_epi_curve_export_${Date.now()}`;
    const exportPath = `cypress/downloads/${exportFileBase}.png`;

    openExportDialog();
    fillExportFilename(exportFileBase);

    cy.get('@exportDialog').contains('button', 'Export').click({ force: true });
    cy.contains('.p-dialog-title', 'Export Epi Curve').should('not.exist');

    cy.readFile(exportPath, 'binary', { timeout: 30000 }).should((pngBinary) => {
      expect(pngBinary.length, 'exported PNG byte length').to.be.greaterThan(1000);
    });
  });

  it('exports the uploaded Epi Curve view as an SVG file', () => {
    const exportFileBase = `cypress_epi_curve_export_${Date.now()}`;
    const exportPath = `cypress/downloads/${exportFileBase}.svg`;

    openExportDialog();
    fillExportFilename(exportFileBase);

    cy.get('@exportDialog')
      .find('select.form-control.form-control-sm')
      .select('svg');

    cy.get('@exportDialog').contains('button', 'Export').click({ force: true });
    cy.contains('.p-dialog-title', 'Export Epi Curve').should('not.exist');

    cy.readFile(exportPath, 'utf8', { timeout: 30000 }).should((svgText) => {
      expect(svgText, 'exported SVG content').to.include('<svg');
      expect(svgText.length, 'exported SVG length').to.be.greaterThan(100);
    });
  });

  it('updates calculated resolution when the uploaded PNG export scale changes', () => {
    const exportFileBase = `cypress_epi_curve_export_scaled_${Date.now()}`;
    const exportPath = `cypress/downloads/${exportFileBase}.png`;
    const updatedScale = 1.5;

    openExportDialog();
    fillExportFilename(exportFileBase);

    cy.get('@exportDialog')
      .contains('.p-accordionheader, .p-accordion-header', 'Advanced')
      .click({ force: true });

    cy.get('@exportDialog')
      .find('#network-export-advanced')
      .should('be.visible');

    cy.window().then((win: unknown) => {
      const typedWindow = win as Window & {
        commonService: any;
      };
      const [width, height] = typedWindow.commonService.visuals.epiCurve.getImageDimensions();
      const expectedResolution = `${Math.round(width * updatedScale)} x ${Math.round(height * updatedScale)}px`;

      cy.get('@exportDialog')
        .find('#network-export-scale')
        .should('have.value', '1')
        .then(($input) => {
          const input = $input.get(0) as HTMLInputElement;
          input.value = String(updatedScale);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          input.dispatchEvent(new Event('blur', { bubbles: true }));
        });

      cy.get('@exportDialog')
        .find('#network-export-scale')
        .should('have.value', String(updatedScale));

      cy.get('@exportDialog')
        .find('#network-export-dimensions')
        .should('contain.text', expectedResolution);
    });

    cy.get('@exportDialog').contains('button', 'Export').click({ force: true });
    cy.contains('.p-dialog-title', 'Export Epi Curve').should('not.exist');

    cy.readFile(exportPath, 'binary', { timeout: 30000 }).should((pngBinary) => {
      expect(pngBinary.length, 'scaled PNG byte length').to.be.greaterThan(1000);
    });
  });

  it('does not expose an inert PNG quality slider in advanced export settings', () => {
    openExportDialog();

    cy.get('@exportDialog')
      .contains('.p-accordionheader, .p-accordion-header', 'Advanced')
      .click({ force: true });

    cy.get('@exportDialog')
      .find('#network-export-advanced')
      .should('be.visible');

    cy.get('@exportDialog')
      .find('#network-export-quality')
      .should('not.exist');
  });
});
