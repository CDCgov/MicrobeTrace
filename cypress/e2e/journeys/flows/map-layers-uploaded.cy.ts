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

type WinWithMap = Window & {
  commonService: any;
};

type LayerKey = 'basemap' | 'satellite' | 'countries' | 'states' | 'counties';

const EXCLUDED_NODE_IDS = ['P1', 'P2', 'P3'];

const openMapSettingsTab = (label: 'Components' | 'Data' | 'Nodes'): void => {
  cy.get('@mapSettings').contains('.nav-link', label).click({ force: true });
};

const expandMapAccordion = (label: 'Online' | 'Offline'): void => {
  cy.get('@mapSettings')
    .find('.p-accordionheader, .p-accordion-header')
    .contains(label)
    .then(($header) => {
      const expanded = $header.attr('aria-expanded') === 'true';
      if (!expanded) {
        cy.wrap($header).click({ force: true });
      }
    });
};

const ensureMapToggleState = (
  selector: string,
  expectedPath: string,
  expectedValue: boolean,
): void => {
  cy.window().its(expectedPath).then((currentValue) => {
    if (Boolean(currentValue) === expectedValue) return;

    cy.get('@mapSettings')
      .find(selector)
      .contains(expectedValue ? 'Show' : 'Hide')
      .click({ force: true });
  });

  cy.window().its(expectedPath).should('equal', expectedValue);
};

const assertLayerVisible = (layerKey: LayerKey, visible: boolean): void => {
  cy.window({ timeout: 15000 }).should((win: unknown) => {
    const mapView = (win as WinWithMap).commonService.visuals.gisMap;
    expect(mapView.lmap.hasLayer(mapView.layers[layerKey]), `${layerKey} layer visibility`).to.equal(visible);

    if (
      visible &&
      (layerKey === 'countries' || layerKey === 'states' || layerKey === 'counties')
    ) {
      expect(mapView.layers[layerKey].getLayers().length, `${layerKey} features loaded`).to.be.greaterThan(0);
    }
  });
};

describe('Journey Flow - Map uploaded layer controls', () => {
  const profile = getProfile('map-covid-zipcode-threshold');

  it('keeps the online basemap toggle deterministic on uploaded zipcode-mapped data', () => {
    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    goToMapView();

    openMapSettingsDialog();
    selectMapField('map-field-zipcode', 'Zipcode', 'map-field-zipcode', 'Zip_code');
    setMapNodeCollapsing('Off');
    openMapSettingsTab('Components');

    expandMapAccordion('Online');
    ensureMapToggleState('#map-basemap-show-hide', 'commonService.session.style.widgets.map-basemap-show', true);

    assertLayerVisible('basemap', true);
    assertLayerVisible('satellite', false);
    assertLayerVisible('countries', false);
    assertLayerVisible('states', true);
    assertLayerVisible('counties', false);

    cy.closeSettingsPane('Geospatial Settings');

    assertMapRenderedCounts({
      nodes: 30,
      links: 46,
      excludedNodes: EXCLUDED_NODE_IDS,
    });
  });

  it('keeps offline layer toggles synchronized with widget state and Leaflet layers on uploaded zipcode-mapped data', () => {
    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    goToMapView();

    openMapSettingsDialog();
    selectMapField('map-field-zipcode', 'Zipcode', 'map-field-zipcode', 'Zip_code');
    setMapNodeCollapsing('Off');
    openMapSettingsTab('Components');

    expandMapAccordion('Online');
    ensureMapToggleState('#map-basemap-show-hide', 'commonService.session.style.widgets.map-basemap-show', false);
    assertLayerVisible('basemap', false);
    assertLayerVisible('satellite', false);

    expandMapAccordion('Offline');

    ensureMapToggleState('#map-countries-show-hide', 'commonService.session.style.widgets.map-countries-show', true);
    assertLayerVisible('countries', true);

    ensureMapToggleState('#map-countries-show-hide', 'commonService.session.style.widgets.map-countries-show', false);
    assertLayerVisible('countries', false);

    ensureMapToggleState('#map-states-show-hide', 'commonService.session.style.widgets.map-states-show', true);
    assertLayerVisible('states', true);

    ensureMapToggleState('#map-states-show-hide', 'commonService.session.style.widgets.map-states-show', false);
    assertLayerVisible('states', false);

    ensureMapToggleState('#map-counties-show-hide', 'commonService.session.style.widgets.map-counties-show', false);
    assertLayerVisible('counties', false);

    ensureMapToggleState('#map-counties-show-hide', 'commonService.session.style.widgets.map-counties-show', false);
    assertLayerVisible('counties', false);

    cy.closeSettingsPane('Geospatial Settings');

    assertMapRenderedCounts({
      nodes: 30,
      links: 46,
      excludedNodes: EXCLUDED_NODE_IDS,
    });
  });
});
