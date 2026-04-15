/// <reference types="cypress" />

import * as L from 'leaflet';

import { getProfile } from '../datasets/profile';
import {
  applyStyleFromProfile,
  assertAfterLaunchCounts,
  assertMapRenderedCounts,
  goToMapView,
  launchProfileToTwoD,
  openMapSettingsDialog,
  selectMapField,
} from '../../../support/journey-helpers';

type WinWithMap = Window & {
  commonService: any;
};

const normalizeColor = (value: string): string => String(value || '').replace(/\s+/g, '').toLowerCase();

const getRenderedNodeLayer = (win: WinWithMap, nodeId: string) =>
  win.commonService.visuals.gisMap.layers.featureGroup
    .getLayers()
    .find((layer: any) => String(layer?.data?._id ?? layer?.data?.ID) === nodeId);

const getRenderedLinkLayersByValue = (win: WinWithMap, field: string, value: string) =>
  win.commonService.visuals.gisMap.layers.links
    .getLayers()
    .filter((layer: any) => layer?.data?.[field] === value);

const getExpectedLinkStyleColor = (win: WinWithMap, variable: string, value: string): string => {
  const keys = win.commonService.session.style.linkColorsTableKeys?.[variable] || [];
  const colors = win.commonService.session.style.linkColorsTable?.[variable] || [];
  const index = keys.findIndex((candidate: string) => candidate === value);

  expect(index, `style-table index for ${variable}=${value}`).to.be.greaterThan(-1);
  expect(colors[index], `style-table color for ${variable}=${value}`).to.exist;

  return normalizeColor(colors[index]);
};

describe('Journey Flow - Uploaded style file reflected on Map', () => {
  const profile = getProfile('style-apply-cypress-test-style-threshold');

  it('applies an uploaded style file and reflects its Map styling, tooltip, and layer widget state on zipcode-mapped data', () => {
    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    applyStyleFromProfile(profile);

    cy.window()
      .its('commonService.session.style.widgets')
      .should((widgets) => {
        expect(widgets['map-basemap-show']).to.equal(true);
        expect(widgets['map-countries-show']).to.equal(false);
        expect(widgets['map-collapsing-on']).to.equal(false);
        expect(widgets['map-node-tooltip-variable']).to.equal('Lineage');
      });

    cy.closeGlobalSettings();

    goToMapView();
    openMapSettingsDialog();
    selectMapField('map-field-zipcode', 'Zipcode', 'map-field-zipcode', 'Zip_code');
    cy.closeSettingsPane('Geospatial Settings');

    assertMapRenderedCounts({
      nodes: 12,
      links: 9,
      excludedNodes: ['G1', 'G2', 'G3'],
    });

    cy.window().should((win: unknown) => {
      const typedWindow = win as WinWithMap;
      const mapView = typedWindow.commonService.visuals.gisMap;
      const educationNode = getRenderedNodeLayer(typedWindow, '797980');
      const sportsTeamLinks = getRenderedLinkLayersByValue(typedWindow, 'Contact type', 'sports team');
      const classroomLinks = getRenderedLinkLayersByValue(typedWindow, 'Contact type', 'classroom');
      const familyLinks = getRenderedLinkLayersByValue(typedWindow, 'Contact type', 'family member');
      const expectedSportsTeamColor = getExpectedLinkStyleColor(typedWindow, 'Contact type', 'sports team');
      const expectedClassroomColor = getExpectedLinkStyleColor(typedWindow, 'Contact type', 'classroom');
      const expectedFamilyColor = getExpectedLinkStyleColor(typedWindow, 'Contact type', 'family member');

      expect(mapView.lmap.hasLayer(mapView.layers.basemap), 'style-enabled basemap layer attached').to.equal(true);
      expect(mapView.lmap.hasLayer(mapView.layers.countries), 'style-disabled countries layer detached').to.equal(false);
      expect(educationNode, 'education node rendered on map').to.exist;
      expect(normalizeColor(educationNode.options.fillColor), 'education node fill color from style file')
        .to.equal(normalizeColor('#f22020'));
      expect(sportsTeamLinks.length, 'sports team links rendered on map').to.be.greaterThan(0);
      expect(classroomLinks.length, 'classroom links rendered on map').to.be.greaterThan(0);
      expect(familyLinks.length, 'family member links rendered on map').to.be.greaterThan(0);

      sportsTeamLinks.forEach((link: any) => {
        expect(normalizeColor(link.options.color), 'sports team map link color from style file')
          .to.equal(expectedSportsTeamColor);
      });

      classroomLinks.forEach((link: any) => {
        expect(normalizeColor(link.options.color), 'classroom map link color from style file')
          .to.equal(expectedClassroomColor);
      });

      familyLinks.forEach((link: any) => {
        expect(normalizeColor(link.options.color), 'family member map link color from style file')
          .to.equal(expectedFamilyColor);
      });

      expect(expectedSportsTeamColor, 'style-file link categories stay distinct on Map')
        .not.to.equal(expectedClassroomColor);
    });

    cy.window().then((win: unknown) => {
      const typedWindow = win as WinWithMap;
      const nodeLayer = getRenderedNodeLayer(typedWindow, '375596');
      const lmap = typedWindow.commonService.visuals.gisMap.lmap;

      expect(nodeLayer, 'rendered map node 375596').to.exist;

      const point = nodeLayer._point;
      const container = lmap.getContainer() as HTMLElement;
      const rect = container.getBoundingClientRect();
      const clientX = Math.round(rect.left + point.x);
      const clientY = Math.round(rect.top + point.y);
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
      const containerPoint = L.point(point.x, point.y);
      const latlng = lmap.containerPointToLatLng(containerPoint);

      nodeLayer.fire('mouseover', { latlng, layer: nodeLayer, containerPoint, originalEvent: fakeOriginalEvent });
    });

    cy.get('#mapTooltip', { timeout: 5000 }).should('be.visible').and('contain', 'B.1.617.2');
  });
});
