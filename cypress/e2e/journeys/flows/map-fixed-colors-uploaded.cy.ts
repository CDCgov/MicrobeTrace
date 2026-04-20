/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  assertMapRenderedCounts,
  goToMapView,
  launchProfileToTwoD,
  openGlobalStylingTab,
  openMapSettingsDialog,
  selectMapField,
  setMapNodeCollapsing,
} from '../../../support/journey-helpers';
import { readRenderedMapNodeStyle } from '../../../support/map-helpers';

type WinWithMap = Window & {
  commonService: any;
};

const EXCLUDED_NODE_IDS = ['P1', 'P2', 'P3'];

const normalizeColor = (value: string): string => String(value || '').replace(/\s+/g, '').toLowerCase();

const selectPrimeOption = (selector: string, label: string): void => {
  cy.get(selector).click({ force: true });
  cy.contains('li[role="option"]:visible', label, { timeout: 15000 }).click({ force: true });
};

const setColorInputValue = (selector: string, value: string): void => {
  cy.get(selector)
    .should('be.visible')
    .then(($input) => {
      const input = $input.get(0) as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

  cy.get(selector).should('have.value', value);
};

const assertCollapsedLeafNodeColor = (expectedColor: string): void => {
  cy.window().should((win: unknown) => {
    const mapView = (win as WinWithMap).commonService.visuals.gisMap;
    const leafLayers = mapView.layers.markerClusterGroup._featureGroup
      .getLayers()
      .filter((layer: any) => Number(layer?._childCount || 0) === 0);

    expect(leafLayers.length, 'collapsed visible leaf markers').to.be.greaterThan(0);
    leafLayers.forEach((layer: any) => {
      expect(readRenderedMapNodeStyle(layer).fillColor, 'collapsed map node color')
        .to.equal(expectedColor);
    });
  });
};

const assertExpandedNodeColor = (expectedColor: string): void => {
  cy.window().should((win: unknown) => {
    const mapView = (win as WinWithMap).commonService.visuals.gisMap;
    const layers = mapView.layers.featureGroup.getLayers();

    expect(layers.length, 'expanded map nodes').to.equal(30);
    layers.forEach((layer: any) => {
      expect(readRenderedMapNodeStyle(layer).fillColor, 'expanded map node color')
        .to.equal(expectedColor);
    });
  });
};

const assertRenderedLinkColor = (expectedColor: string): void => {
  cy.window().should((win: unknown) => {
    const mapView = (win as WinWithMap).commonService.visuals.gisMap;
    const layers = mapView.layers.links.getLayers();

    expect(layers.length, 'rendered map links').to.equal(46);
    layers.forEach((layer: any) => {
      expect(normalizeColor(layer.options.color), 'rendered map link color')
        .to.equal(expectedColor);
    });
  });
};

describe('Journey Flow - Map uploaded fixed colors', () => {
  const profile = getProfile('map-covid-zipcode-threshold');

  it('keeps a fixed node color coherent on uploaded Map data in both collapsed and uncollapsed node modes', () => {
    const nodeColor = '#ff0000';
    const expectedNodeColor = normalizeColor(nodeColor);

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    goToMapView();

    openMapSettingsDialog();
    selectMapField('map-field-zipcode', 'Zipcode', 'map-field-zipcode', 'Zip_code');
    cy.closeSettingsPane('Geospatial Settings');

    openGlobalStylingTab();
    selectPrimeOption('#node-color-variable', 'None');

    cy.window().its('commonService.session.style.widgets.node-color-variable').should('equal', 'None');

    setColorInputValue('#node-color', nodeColor);

    cy.window().its('commonService.session.style.widgets.node-color').should('equal', nodeColor);
    cy.closeGlobalSettings();

    assertCollapsedLeafNodeColor(expectedNodeColor);

    openMapSettingsDialog();
    setMapNodeCollapsing('Off');
    cy.closeSettingsPane('Geospatial Settings');

    assertExpandedNodeColor(expectedNodeColor);
    assertMapRenderedCounts({
      nodes: 30,
      links: 46,
      excludedNodes: EXCLUDED_NODE_IDS,
    });
  });

  it('keeps a fixed link color coherent on uploaded Map data', () => {
    const linkColor = '#00aa44';
    const expectedLinkColor = normalizeColor(linkColor);

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    goToMapView();

    openMapSettingsDialog();
    selectMapField('map-field-zipcode', 'Zipcode', 'map-field-zipcode', 'Zip_code');
    cy.closeSettingsPane('Geospatial Settings');

    openGlobalStylingTab();
    cy.window().its('commonService.session.style.widgets.link-color-variable').should('equal', 'None');

    setColorInputValue('#link-color', linkColor);

    cy.window().its('commonService.session.style.widgets.link-color').should('equal', linkColor);
    cy.closeGlobalSettings();

    assertRenderedLinkColor(expectedLinkColor);
    cy.window().should((win: unknown) => {
      const mapView = (win as WinWithMap).commonService.visuals.gisMap;
      const renderedLogicalLinks = new Set(mapView.layers.links.getLayers()
        .map((layer: any) => {
          const data = layer?.data;
          if (!data?.source || !data?.target) return null;

          const a = String(data.source);
          const b = String(data.target);
          return a < b ? `${a}-${b}` : `${b}-${a}`;
        })
        .filter(Boolean));

      expect(renderedLogicalLinks.size, 'rendered map logical links after fixed link recolor').to.equal(46);
    });
  });
});
