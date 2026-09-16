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

describe('Journey Flow - Map uploaded latitude and longitude mapping', () => {
  const profile = getProfile('map-angulartesting-lat-long');

  it('maps uploaded lat and long fields to exact rendered coordinates with no excluded nodes', () => {
    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    goToMapView();

    openMapSettingsDialog();
    selectMapField('map-field-lat', 'Lat', 'map-field-lat', 'lat');
    selectMapField('map-field-lon', 'Long', 'map-field-lon', 'long');
    setMapNodeCollapsing('Off');
    cy.closeSettingsPane('Geospatial Settings');

    cy.get('#tool-btn-container-map a[title="Nodes without Location Data"]')
      .should('contain.text', '0')
      .click({ force: true });

    cy.contains('.p-dialog-title', 'Excluded Nodes')
      .parents('.p-dialog')
      .should('contain.text', 'All nodes contain map location data.');

    cy.closeSettingsPane('Excluded Nodes');

    assertMapRenderedCounts({
      nodes: 4,
      links: 4,
    });

    cy.window().its('commonService.visuals.gisMap.layers.featureGroup').should((featureGroup: any) => {
      const renderedNodeLayers = featureGroup.getLayers();

      expect(renderedNodeLayers.length, 'rendered node layers').to.equal(4);

      renderedNodeLayers.forEach((layer: any) => {
        expect(String(layer._latlng.lat), `layer latitude for ${layer?.data?._id}`).to.equal(String(layer.data.lat));
        expect(String(layer._latlng.lng), `layer longitude for ${layer?.data?._id}`).to.equal(String(layer.data.long));
      });
    });
  });
});
