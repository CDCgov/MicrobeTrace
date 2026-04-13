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

type MapCenter = {
  lat: number;
  lng: number;
};

type WinWithMap = Window & {
  commonService: any;
};

const EXCLUDED_NODE_IDS = ['P1', 'P2', 'P3'];

const dispatchMapDrag = (win: WinWithMap, start: { clientX: number; clientY: number }, end: { clientX: number; clientY: number }): void => {
  const map = win.commonService.visuals.gisMap.lmap;
  const container = map.getContainer() as HTMLElement;

  container.dispatchEvent(new MouseEvent('mousedown', {
    bubbles: true,
    cancelable: true,
    composed: true,
    button: 0,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    clientX: start.clientX,
    clientY: start.clientY,
  }));

  container.dispatchEvent(new MouseEvent('mousemove', {
    bubbles: true,
    cancelable: true,
    composed: true,
    button: 0,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    clientX: end.clientX,
    clientY: end.clientY,
  }));

  container.dispatchEvent(new MouseEvent('mouseend', {
    bubbles: true,
    cancelable: true,
    composed: true,
    button: 0,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    clientX: end.clientX,
    clientY: end.clientY,
  }));
};

const clickAndWaitForMapEvent = (selector: string, eventName: 'zoomend' | 'moveend'): void => {
  let mapEventPromise: Promise<void>;

  cy.window().then((win: unknown) => {
    const map = (win as WinWithMap).commonService.visuals.gisMap.lmap;
    mapEventPromise = new Cypress.Promise<void>((resolve) => {
      map.once(eventName, () => resolve());
    });
  });

  cy.get(selector).click({ force: true });
  cy.then(() => mapEventPromise);
};

describe('Journey Flow - Map navigation controls on uploaded data', () => {
  const profile = getProfile('map-covid-zipcode-threshold');

  it('keeps pan, zoom, and center controls deterministic on uploaded zipcode-mapped data', () => {
    let baselineCenter: MapCenter;
    let baselineZoom = 0;

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

    cy.window().then((win: unknown) => {
      const map = (win as WinWithMap).commonService.visuals.gisMap.lmap;
      const center = map.getCenter();

      baselineCenter = { lat: center.lat, lng: center.lng };
      baselineZoom = map.getZoom();

      expect(Number.isFinite(baselineCenter.lat), 'baseline latitude').to.equal(true);
      expect(Number.isFinite(baselineCenter.lng), 'baseline longitude').to.equal(true);
      expect(baselineZoom, 'baseline zoom').to.be.greaterThan(0);
    });

    cy.window().then((win: unknown) => {
      dispatchMapDrag(
        win as WinWithMap,
        { clientX: 300, clientY: 300 },
        { clientX: 120, clientY: 460 },
      );
    });

    cy.window().should((win: unknown) => {
      const map = (win as WinWithMap).commonService.visuals.gisMap.lmap;
      const center = map.getCenter();
      const latDiff = Math.abs(center.lat - baselineCenter.lat);
      const lngDiff = Math.abs(center.lng - baselineCenter.lng);

      expect(latDiff + lngDiff, 'map center changed after drag').to.be.greaterThan(0.1);
      expect(map.getZoom(), 'zoom unchanged by pan').to.equal(baselineZoom);
    });

    cy.get('#centerMapButton').click({ force: true });

    cy.window().should((win: unknown) => {
      const map = (win as WinWithMap).commonService.visuals.gisMap.lmap;
      const center = map.getCenter();

      expect(Math.abs(center.lat - baselineCenter.lat), 'latitude restored by center control').to.be.lessThan(0.05);
      expect(Math.abs(center.lng - baselineCenter.lng), 'longitude restored by center control').to.be.lessThan(0.05);
      expect(map.getZoom(), 'zoom restored after centering').to.equal(baselineZoom);
    });

    clickAndWaitForMapEvent('.leaflet-control-zoom-in span', 'zoomend');
    cy.window().should((win: unknown) => {
      const map = (win as WinWithMap).commonService.visuals.gisMap.lmap;
      expect(map.getZoom(), 'zoom after zoom-in click').to.equal(baselineZoom + 1);
    });

    clickAndWaitForMapEvent('.leaflet-control-zoom-out span', 'zoomend');
    cy.window().should((win: unknown) => {
      const map = (win as WinWithMap).commonService.visuals.gisMap.lmap;
      expect(map.getZoom(), 'zoom after zoom-out click').to.equal(baselineZoom);
    });

    cy.get('#centerMapButton').click({ force: true });

    cy.window().should((win: unknown) => {
      const map = (win as WinWithMap).commonService.visuals.gisMap.lmap;
      const center = map.getCenter();

      expect(map.getZoom(), 'zoom reset by center control').to.equal(baselineZoom);
      expect(Math.abs(center.lat - baselineCenter.lat), 'latitude reset after zooming').to.be.lessThan(0.05);
      expect(Math.abs(center.lng - baselineCenter.lng), 'longitude reset after zooming').to.be.lessThan(0.05);
    });

    assertMapRenderedCounts({
      nodes: 30,
      links: 46,
      excludedNodes: EXCLUDED_NODE_IDS,
    });
  });
});
