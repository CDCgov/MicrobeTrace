/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  assertMapRenderedCounts,
  goToMapView,
  launchProfileToTwoD,
  openMapSettingsDialog,
  selectMapField,
  setMapNodeCollapsing,
} from '../../../support/journey-helpers';

const EXCLUDED_NODE_IDS = ['P1', 'P2', 'P3'];

describe('Journey Flow - Map export on uploaded data', () => {
  const profile = getProfile('map-covid-zipcode-threshold');

  it('exports the uploaded Map view as a PNG file', () => {
    const exportFileBase = `cypress_map_export_${Date.now()}`;
    const exportPath = `cypress/downloads/${exportFileBase}.png`;

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    goToMapView();

    openMapSettingsDialog();
    selectMapField('map-field-zipcode', 'Zipcode', 'map-field-zipcode', 'Zip_code');
    setMapNodeCollapsing('Off');
    cy.closeSettingsPane('Geospatial Settings');

    assertMapRenderedCounts({
      nodes: 30,
      links: 46,
      excludedNodes: EXCLUDED_NODE_IDS,
    });

    cy.get('#tool-btn-container-map a[title="Export Screen"]').click({ force: true });
    cy.contains('.p-dialog-title', 'Export Geospatial Data')
      .should('be.visible')
      .parents('.p-dialog')
      .as('exportDialog');

    cy.get('@exportDialog')
      .find('#map-export-filename')
      .invoke('val', exportFileBase)
      .trigger('input')
      .trigger('change');

    cy.get('@exportDialog').find('#map-export').click({ force: true });
    cy.contains('.p-dialog-title', 'Export Geospatial Data').should('not.exist');

    cy.readFile(exportPath, 'binary', { timeout: 30000 }).should((pngBinary) => {
      expect(pngBinary.length, 'exported PNG byte length').to.be.greaterThan(1000);
    });
  });
});
