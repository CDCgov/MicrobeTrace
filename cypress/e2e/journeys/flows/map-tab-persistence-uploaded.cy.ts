/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  assertMapRenderedCounts,
  assertMapReady,
  goToMapView,
  launchProfileToTwoD,
  openMapSettingsDialog,
  selectMapField,
  setMapNodeCollapsing,
} from '../../../support/journey-helpers';

type WinWithMap = Window & {
  commonService: any;
};

const EXCLUDED_NODE_IDS = ['P1', 'P2', 'P3'];

const openMapSettingsTab = (label: 'Components' | 'Nodes' | 'Links' | 'Data'): void => {
  cy.get('@mapSettings').contains('.nav-link', label).click({ force: true });
};

const expandMapAccordion = (label: 'Online' | 'Offline' | 'Network'): void => {
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

const setMapSelectButton = (
  selector: string,
  value: 'Show' | 'Hide',
  expectedPath: string,
  expectedValue: boolean,
): void => {
  cy.get('@mapSettings').find(selector).contains(value).click({ force: true });
  cy.window().its(expectedPath).should('equal', expectedValue);
};

const assertSatelliteLayerVisible = (visible: boolean): void => {
  cy.window().should((win: unknown) => {
    const mapView = (win as WinWithMap).commonService.visuals.gisMap;
    expect(mapView.lmap.hasLayer(mapView.layers.satellite), 'satellite layer visibility').to.equal(visible);
  });
};

const closeMapTab = (): void => {
  cy.get('.lm_tab[title="Map"]>.lm_close_tab', { timeout: 15000 }).click({ force: true });
  cy.get('.mapStyle', { timeout: 15000 }).should('not.exist');
};

describe('Journey Flow - Map tab persistence on uploaded data', () => {
  const profile = getProfile('map-covid-zipcode-threshold');

  it('keeps uploaded Map field mapping and a selected satellite layer after closing and reopening the Map tab', () => {
    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    goToMapView();

    openMapSettingsDialog();
    selectMapField('map-field-zipcode', 'Zipcode', 'map-field-zipcode', 'Zip_code');
    setMapNodeCollapsing('Off');
    openMapSettingsTab('Components');
    expandMapAccordion('Online');

    cy.window().its('commonService.session.style.widgets.map-satellite-show').should('equal', false);
    setMapSelectButton('#map-satellite-show-hide', 'Show', 'commonService.session.style.widgets.map-satellite-show', true);
    assertSatelliteLayerVisible(true);

    cy.closeSettingsPane('Geospatial Settings');

    assertMapRenderedCounts({
      nodes: 30,
      links: 46,
      excludedNodes: EXCLUDED_NODE_IDS,
    });

    closeMapTab();
    goToMapView();
    assertMapReady();

    cy.window().its('commonService.session.style.widgets.map-field-zipcode').should('equal', 'Zip_code');
    cy.window().its('commonService.session.style.widgets.map-collapsing-on').should('equal', false);
    cy.window().its('commonService.session.style.widgets.map-satellite-show').should('equal', true);

    assertSatelliteLayerVisible(true);
    assertMapRenderedCounts({
      nodes: 30,
      links: 46,
      excludedNodes: EXCLUDED_NODE_IDS,
    });
  });
});
