/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  goToMapView,
  launchProfileToTwoD,
  openMapSettingsDialog,
} from '../../../support/journey-helpers';

type WinWithMap = Window & {
  commonService: any;
};

const ENGLISH_LABEL_EXPRESSION = [
  'coalesce',
  ['get', 'name:en'],
  ['get', 'name_en'],
  ['get', 'name:latin'],
  '',
];

describe('Journey Flow - OpenFreeMap basemap', () => {
  const profile = getProfile('map-covid-zipcode-threshold');

  it('loads OpenFreeMap and uses English or Latin labels', () => {
    launchProfileToTwoD(profile);
    goToMapView();
    openMapSettingsDialog();

    cy.get('@mapSettings').contains('.nav-link', 'Components').click({ force: true });
    cy.get('@mapSettings')
      .find('.p-accordionheader, .p-accordion-header')
      .contains('Online')
      .then(($header) => {
        if ($header.attr('aria-expanded') !== 'true') {
          cy.wrap($header).click({ force: true });
        }
      });
    cy.get('@mapSettings')
      .find('#map-basemap-show-hide')
      .contains('Show')
      .click({ force: true });

    cy.window({ timeout: 60000 }).should((win: unknown) => {
      const mapView = (win as WinWithMap).commonService.visuals.gisMap;
      const basemap = mapView.layers.basemap;
      const maplibreMap = basemap.getMaplibreMap();

      expect(mapView.lmap.hasLayer(basemap), 'basemap layer attached').to.equal(true);
      expect(basemap.getContainer().dataset.basemapProvider).to.equal('OpenFreeMap');
      expect(basemap.getAttribution()).to.contain('OpenFreeMap');
      expect(maplibreMap.isStyleLoaded(), 'OpenFreeMap style loaded').to.equal(true);

      const style = maplibreMap.getStyle();
      expect(style.sources.openmaptiles.url).to.contain('tiles.openfreemap.org');

      const nameLabelFields = style.layers
        .filter((layer: any) => layer.type === 'symbol' && layer.layout?.['text-field'])
        .map((layer: any) => layer.layout['text-field'])
        .filter((textField: any) => JSON.stringify(textField).includes('name'));

      expect(nameLabelFields.length, 'name label layers').to.be.greaterThan(0);
      nameLabelFields.forEach((textField: any) => {
        expect(textField).to.deep.equal(ENGLISH_LABEL_EXPRESSION);
      });
    });
  });
});
