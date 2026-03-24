/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  launchProfileToTwoD,
} from '../../../support/journey-helpers';

describe('Journey Flow - 2D network export', () => {
  const profile = getProfile('color-by-uploaded-categorical');
  const exportButtonSelector = '#tool-btn-container a[title="Export Screen"]';

  it('exports the loaded 2D network as an SVG file', () => {
    const exportFileBase = `cypress_twod_export_${Date.now()}`;
    const exportPath = `cypress/downloads/${exportFileBase}.svg`;

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);

    cy.get(exportButtonSelector).click({ force: true });
    cy.contains('.p-dialog-title', 'Export Network Image')
      .should('be.visible')
      .parents('.p-dialog')
      .as('exportDialog');

    cy.get('@exportDialog')
      .find('#network-export-filename')
      .invoke('val', exportFileBase)
      .trigger('input')
      .trigger('change');

    cy.get('@exportDialog').find('#network-export-filetype').click({ force: true });
    cy.contains('li[role="option"]', 'svg').click({ force: true });

    cy.get('@exportDialog').find('#network-export').click({ force: true });
    cy.contains('.p-dialog-title', 'Export Network Image').should('not.exist');

    cy.readFile(exportPath, 'utf8', { timeout: 20000 }).should((svgText) => {
      expect(svgText, 'exported SVG content').to.include('<svg');
      expect(svgText.length, 'exported SVG length').to.be.greaterThan(100);
    });
  });
});
