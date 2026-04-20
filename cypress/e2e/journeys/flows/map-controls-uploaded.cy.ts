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
import { readRenderedMapNodeStyle } from '../../../support/map-helpers';

type WinWithMap = Window & {
  commonService: any;
};

const RENDERED_NODE_COUNT = 30;
const RENDERED_LINK_COUNT = 46;
const REDUCED_OPACITY = 0.25;

const openMapTab = (label: 'Nodes' | 'Links' | 'Components'): void => {
  cy.get('@mapSettings').contains('.nav-link', label).click({ force: true });
};

const expandMapNetworkAccordion = (): void => {
  cy.get('@mapSettings')
    .find('.p-accordionheader, .p-accordion-header')
    .contains('Network')
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

const setMapRangeValue = (selector: string, value: number, expectedPath: string): void => {
  cy.get('@mapSettings')
    .find(selector)
    .invoke('val', value)
    .trigger('input')
    .trigger('change');

  cy.window().its(expectedPath).should('equal', value);
};

const assertExpandedNodeLayers = (expectedNodes: number): void => {
  cy.window().should((win: unknown) => {
    const mapView = (win as WinWithMap).commonService.visuals.gisMap;

    expect(mapView.layers.featureGroup.getLayers().length, 'expanded map nodes').to.equal(expectedNodes);
    expect(mapView.layers.markerClusterGroup.getLayers().length, 'cluster group should be empty').to.equal(0);
  });
};

const assertCollapsedNodeLayers = (expectedNodes: number): void => {
  cy.window().should((win: unknown) => {
    const mapView = (win as WinWithMap).commonService.visuals.gisMap;

    expect(mapView.layers.featureGroup.getLayers().length, 'feature group should be empty').to.equal(0);
    expect(mapView.layers.markerClusterGroup.getLayers().length, 'clustered node store').to.equal(expectedNodes);
  });
};

const assertVisibleMapLinkCount = (expectedLinks: number): void => {
  cy.window().should((win: unknown) => {
    const mapView = (win as WinWithMap).commonService.visuals.gisMap;
    const renderedLogicalLinks = new Set(
      mapView.layers.links.getLayers()
        .map((layer: any) => {
          const data = layer?.data;
          if (!data?.source || !data?.target) return null;

          const a = String(data.source);
          const b = String(data.target);
          return a < b ? `${a}-${b}` : `${b}-${a}`;
        })
        .filter(Boolean),
    );

    expect(mapView.lmap.hasLayer(mapView.layers.links), 'map links layer attached').to.equal(true);
    expect(renderedLogicalLinks.size, 'rendered logical map links').to.equal(expectedLinks);
  });
};

const assertMapLinkVisibility = (visible: boolean): void => {
  cy.window().should((win: unknown) => {
    const mapView = (win as WinWithMap).commonService.visuals.gisMap;

    expect(mapView.lmap.hasLayer(mapView.layers.links), 'map links layer visibility').to.equal(visible);
  });
};

const assertExpandedNodeOpacity = (expectedOpacity: number): void => {
  cy.window().should((win: unknown) => {
    const mapView = (win as WinWithMap).commonService.visuals.gisMap;
    const layers = mapView.layers.featureGroup.getLayers();

    expect(layers.length, 'expanded node layers present').to.be.greaterThan(0);
    layers.forEach((layer: any) => {
      const style = readRenderedMapNodeStyle(layer);
      expect(style.opacity, 'map node stroke opacity').to.equal(expectedOpacity);
      expect(style.fillOpacity, 'map node fill opacity').to.equal(expectedOpacity);
    });
  });
};

const assertMapLinkOpacity = (expectedOpacity: number): void => {
  cy.window().should((win: unknown) => {
    const mapView = (win as WinWithMap).commonService.visuals.gisMap;
    const layers = mapView.layers.links.getLayers();

    expect(layers.length, 'map link layers present').to.be.greaterThan(0);
    layers.forEach((layer: any) => {
      expect(layer.options.opacity, 'map link opacity').to.equal(expectedOpacity);
    });
  });
};

describe('Journey Flow - Map uploaded controls', () => {
  const profile = getProfile('map-covid-zipcode-threshold');

  it('keeps uploaded Map control mechanics deterministic for collapsing, transparency, and hide/show', () => {
    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    goToMapView();

    openMapSettingsDialog();
    selectMapField('map-field-zipcode', 'Zipcode', 'map-field-zipcode', 'Zip_code');
    setMapNodeCollapsing('Off');

    assertExpandedNodeLayers(RENDERED_NODE_COUNT);
    assertVisibleMapLinkCount(RENDERED_LINK_COUNT);
    assertMapRenderedCounts({
      nodes: RENDERED_NODE_COUNT,
      links: RENDERED_LINK_COUNT,
      excludedNodes: ['P1', 'P2', 'P3'],
    });

    openMapTab('Nodes');
    setMapRangeValue('#map-node-transparency', 0.75, 'commonService.session.style.widgets.map-node-transparency');
    assertExpandedNodeOpacity(REDUCED_OPACITY);

    openMapTab('Links');
    setMapRangeValue('#map-link-transparency', 0.75, 'commonService.session.style.widgets.map-link-transparency');
    assertMapLinkOpacity(REDUCED_OPACITY);

    openMapTab('Components');
    expandMapNetworkAccordion();

    setMapSelectButton('#map-link-show-hide', 'Hide', 'commonService.session.style.widgets.map-link-show', false);
    assertExpandedNodeLayers(RENDERED_NODE_COUNT);
    assertMapLinkVisibility(false);

    setMapSelectButton('#map-link-show-hide', 'Show', 'commonService.session.style.widgets.map-link-show', true);
    assertExpandedNodeLayers(RENDERED_NODE_COUNT);
    assertVisibleMapLinkCount(RENDERED_LINK_COUNT);
    assertMapLinkOpacity(REDUCED_OPACITY);

    setMapSelectButton('#map-node-show-hide', 'Hide', 'commonService.session.style.widgets.map-node-show', false);
    assertExpandedNodeLayers(0);
    assertVisibleMapLinkCount(RENDERED_LINK_COUNT);

    setMapSelectButton('#map-node-show-hide', 'Show', 'commonService.session.style.widgets.map-node-show', true);
    assertExpandedNodeLayers(RENDERED_NODE_COUNT);
    assertExpandedNodeOpacity(REDUCED_OPACITY);
    assertVisibleMapLinkCount(RENDERED_LINK_COUNT);

    openMapTab('Nodes');
    setMapNodeCollapsing('On');
    assertCollapsedNodeLayers(RENDERED_NODE_COUNT);
    assertVisibleMapLinkCount(RENDERED_LINK_COUNT);

    setMapNodeCollapsing('Off');
    assertExpandedNodeLayers(RENDERED_NODE_COUNT);
    assertExpandedNodeOpacity(REDUCED_OPACITY);
    assertVisibleMapLinkCount(RENDERED_LINK_COUNT);
    assertMapLinkOpacity(REDUCED_OPACITY);

    cy.closeSettingsPane('Geospatial Settings');

    assertMapRenderedCounts({
      nodes: RENDERED_NODE_COUNT,
      links: RENDERED_LINK_COUNT,
      excludedNodes: ['P1', 'P2', 'P3'],
    });
  });
});
