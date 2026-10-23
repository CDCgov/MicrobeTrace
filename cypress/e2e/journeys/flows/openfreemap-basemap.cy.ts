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

const OPENFREEMAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

const OPENFREEMAP_TEST_STYLE = {
  version: 8,
  name: 'Cypress OpenFreeMap style',
  sources: {
    openmaptiles: {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: {
            'name:en': 'Test place',
            name: 'Test place',
          },
          geometry: {
            type: 'Point',
            coordinates: [-95, 37],
          },
        }],
      },
    },
  },
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': '#eef2f5' },
    },
    {
      id: 'place-label',
      type: 'symbol',
      source: 'openmaptiles',
      layout: {
        'text-field': ['get', 'name'],
        'text-size': 12,
      },
      paint: { 'text-color': '#243746' },
    },
  ],
};

describe('Journey Flow - OpenFreeMap basemap', () => {
  const profile = getProfile('map-covid-zipcode-threshold');

  it('loads OpenFreeMap and uses English or Latin labels', () => {
    cy.intercept('GET', OPENFREEMAP_STYLE_URL, {
      statusCode: 200,
      body: OPENFREEMAP_TEST_STYLE,
    }).as('openFreeMapStyle');

    cy.request({
      url: '/assets/maplibre/maplibre-gl-worker.mjs',
      encoding: 'binary',
    }).then((response) => {
      expect(response.status, 'MapLibre worker response').to.equal(200);
      expect(response.body.length, 'MapLibre worker bundle size').to.be.greaterThan(1000);
    });
    cy.request({
      url: '/assets/maplibre/maplibre-gl-shared.mjs',
      encoding: 'binary',
    }).then((response) => {
      expect(response.status, 'MapLibre shared module response').to.equal(200);
      expect(response.body.length, 'MapLibre shared module bundle size').to.be.greaterThan(1000);
    });

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

    cy.wait('@openFreeMapStyle').its('response.statusCode').should('equal', 200);

    cy.window({ timeout: 60000 }).should((win: unknown) => {
      const mapView = (win as WinWithMap).commonService.visuals.gisMap;
      const basemap = mapView.layers.basemap;
      const maplibreMap = basemap.getMaplibreMap();

      expect(mapView.lmap.hasLayer(basemap), 'basemap layer attached').to.equal(true);
      expect(basemap.getContainer().dataset.basemapProvider).to.equal('OpenFreeMap');
      expect(basemap.getAttribution()).to.contain('OpenFreeMap');
      expect(maplibreMap.isStyleLoaded(), 'OpenFreeMap style loaded').to.equal(true);

      const style = maplibreMap.getStyle();
      expect(style.name).to.equal(OPENFREEMAP_TEST_STYLE.name);
      expect(style.sources.openmaptiles.type).to.equal('geojson');

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
