/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  assertMapRenderedCounts,
  goToMapView,
  launchProfileToTwoD,
  openGlobalFilteringTab,
  openMapSettingsDialog,
  selectMapField,
  setMapNodeCollapsing,
  setTN93DistanceDisplayFormat,
} from '../../../support/journey-helpers';
import {
  getRenderedMapLinkContainerPoint,
  getRenderedMapNodeContainerPoint,
} from '../../../support/map-helpers';

type WinWithMap = Window & {
  commonService: any;
};

const selectPrimeOption = (selector: string, label: string): void => {
  cy.get(selector).click({ force: true });
  cy.contains('li[role="option"]', label, { timeout: 15000 }).click({ force: true });
};

const getRenderedNodeLayer = (win: WinWithMap, nodeId: string) =>
  win.commonService.visuals.gisMap.layers.featureGroup
    .getLayers()
    .find((layer: any) => String(layer?.data?._id ?? layer?.data?.ID) === nodeId);

const getRenderedLinkLayer = (win: WinWithMap, source: string, target: string) =>
  win.commonService.visuals.gisMap.layers.links
    .getLayers()
    .find((layer: any) => {
      const a = String(layer?.data?.source ?? '');
      const b = String(layer?.data?.target ?? '');
      return (a === source && b === target) || (a === target && b === source);
    });

describe('Journey Flow - Map uploaded tooltip controls', () => {
  const profile = getProfile('map-color-by-uploaded');
  const tn93Profile = getProfile('map-angulartesting-lat-long');

  it('shows uploaded node and link tooltip contents on the rendered map', () => {
    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    goToMapView();

    openMapSettingsDialog();
    selectMapField('map-field-zipcode', 'Zipcode', 'map-field-zipcode', 'Zip_code');
    setMapNodeCollapsing('Off');

    cy.get('@mapSettings').contains('.nav-link', 'Nodes').click({ force: true });
    cy.window().its('commonService.session.style.widgets.map-node-tooltip-variable').should('equal', '_id');

    cy.get('@mapSettings').contains('.nav-link', 'Links').click({ force: true });
    selectPrimeOption('#map-link-tooltip-variable', 'Contact type');

    cy.closeSettingsPane('Geospatial Settings');

    assertMapRenderedCounts({
      nodes: 4,
      links: 4,
    });

    cy.window().then((win: unknown) => {
      const typedWindow = win as WinWithMap;
      const lmap = typedWindow.commonService.visuals.gisMap.lmap;
      const nodeLayer = getRenderedNodeLayer(typedWindow, 'A');

      expect(nodeLayer, 'rendered map node A').to.exist;

      const containerPoint = getRenderedMapNodeContainerPoint(lmap, nodeLayer);
      const container = lmap.getContainer() as HTMLElement;
      const rect = container.getBoundingClientRect();
      const clientX = Math.round(rect.left + containerPoint.x);
      const clientY = Math.round(rect.top + containerPoint.y);
      const eventInit = {
        bubbles: true,
        cancelable: true,
        composed: true,
        button: 0,
        x: clientX,
        y: clientY,
        pageX: clientX,
        pageY: clientY,
      };
      const fakeOriginalEvent = new MouseEvent('mouseover', eventInit);
      const latlng = lmap.containerPointToLatLng(containerPoint);

      nodeLayer.fire('mouseover', { latlng, layer: nodeLayer, containerPoint, originalEvent: fakeOriginalEvent });
    });

    cy.get('#mapTooltip', { timeout: 5000 }).should('be.visible').and('contain', 'A');

    cy.window().then((win: unknown) => {
      const nodeLayer = getRenderedNodeLayer(win as WinWithMap, 'A');
      expect(nodeLayer, 'rendered map node A').to.exist;
      nodeLayer.fire('mouseout');
    });

    cy.get('#mapTooltip', { timeout: 5000 }).should('not.be.visible');

    cy.window().then((win: unknown) => {
      const typedWindow = win as WinWithMap;
      const lmap = typedWindow.commonService.visuals.gisMap.lmap;
      const linkLayer = getRenderedLinkLayer(typedWindow, 'A', 'C');

      expect(linkLayer, 'rendered map link A-C').to.exist;

      const containerPoint = getRenderedMapLinkContainerPoint(lmap, linkLayer);
      const rect = (lmap.getContainer() as HTMLElement).getBoundingClientRect();
      const clientX = rect.left + containerPoint.x;
      const clientY = rect.top + containerPoint.y;
      const eventInit = {
        bubbles: true,
        cancelable: true,
        composed: true,
        button: 0,
        x: clientX,
        y: clientY,
        pageX: clientX,
        pageY: clientY,
      };
      const fakeOriginalEvent = new MouseEvent('mouseover', eventInit);
      const latlng = lmap.containerPointToLatLng(containerPoint);

      linkLayer.fire('mouseover', { latlng, layer: linkLayer, containerPoint, originalEvent: fakeOriginalEvent });
    });

    cy.get('#mapTooltip', { timeout: 5000 }).should('be.visible').and('contain', 'sports team');

    cy.window().then((win: unknown) => {
      const linkLayer = getRenderedLinkLayer(win as WinWithMap, 'A', 'C');
      expect(linkLayer, 'rendered map link A-C').to.exist;
      linkLayer.fire('mouseout');
    });

    cy.get('#mapTooltip', { timeout: 5000 }).should('not.be.visible');
  });

  it('shows TN93 link distance tooltips as percentages when that display format is enabled', () => {
    launchProfileToTwoD(tn93Profile);
    assertAfterLaunchCounts(tn93Profile);
    goToMapView();

    openGlobalFilteringTab();
    setTN93DistanceDisplayFormat('percentage');
    cy.closeGlobalSettings();

    openMapSettingsDialog();
    selectMapField('map-field-lat', 'Lat', 'map-field-lat', 'lat');
    selectMapField('map-field-lon', 'Long', 'map-field-lon', 'long');
    setMapNodeCollapsing('Off');

    cy.get('@mapSettings').contains('.nav-link', 'Links').click({ force: true });
    selectPrimeOption('#map-link-tooltip-variable', 'Distance');

    cy.closeSettingsPane('Geospatial Settings');

    assertMapRenderedCounts({
      nodes: 4,
      links: 4,
    });

    cy.window().then((win: unknown) => {
      const typedWindow = win as WinWithMap;
      const lmap = typedWindow.commonService.visuals.gisMap.lmap;
      const linkLayer = typedWindow.commonService.visuals.gisMap.layers.links.getLayers()[0];

      expect(linkLayer, 'rendered TN93 map link').to.exist;

      const expectedTooltipValue = typedWindow.commonService.formatDisplayedDistanceValue(linkLayer.data.distance, 'distance');
      expect(expectedTooltipValue, 'formatted TN93 map tooltip value').to.match(/^-?\d+(?:\.\d+)?%$/);

      const containerPoint = getRenderedMapLinkContainerPoint(lmap, linkLayer);
      const rect = (lmap.getContainer() as HTMLElement).getBoundingClientRect();
      const clientX = rect.left + containerPoint.x;
      const clientY = rect.top + containerPoint.y;
      const eventInit = {
        bubbles: true,
        cancelable: true,
        composed: true,
        button: 0,
        x: clientX,
        y: clientY,
        pageX: clientX,
        pageY: clientY,
      };
      const fakeOriginalEvent = new MouseEvent('mouseover', eventInit);
      const latlng = lmap.containerPointToLatLng(containerPoint);

      linkLayer.fire('mouseover', { latlng, layer: linkLayer, containerPoint, originalEvent: fakeOriginalEvent });

      cy.get('#mapTooltip', { timeout: 5000 }).should('be.visible').and('contain', expectedTooltipValue);
    });
  });
});
