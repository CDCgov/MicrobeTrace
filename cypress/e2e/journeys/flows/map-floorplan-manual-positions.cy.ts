/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  assertMapReady,
  assertMapRenderedCounts,
  goToMapView,
  installSaveAsCaptureHook,
  launchProfileToTwoD,
  openMapSettingsDialog,
  saveSessionFromFileMenu,
  selectMapField,
  setMapNodeCollapsing,
  visitAppAndAcceptEula,
  writeCapturedDownloadToDisk,
} from '../../../support/journey-helpers';

type WinWithMap = Window & {
  commonService: any;
};

const floorplanFixture = 'map-floorplan.geojson';
const floorplanMimeType = 'application/geo+json';
const imageFloorplanFixture = 'map-floorplan-square.svg';
const imageFloorplanMimeType = 'image/svg+xml';
const placedNodeId = 'A';
const missingLocationNodeId = 'A';
const placedPoint = {
  x: 12,
  y: 8,
};
const manualMapPoint = {
  latitude: 39.5,
  longitude: -82.5,
};
const excludedNodesButtonSelector = '#tool-btn-container-map a[title="Nodes without Location Data"]';

const openMapSettingsTab = (label: 'Components' | 'Custom Map' | 'Data' | 'Nodes'): void => {
  cy.get('@mapSettings').contains('.nav-link', label).click({ force: true });
};

const openCustomMapTab = (): void => {
  openMapSettingsTab('Custom Map');
  cy.get('@mapSettings').find('#map-floorplan-background-file').should('exist');
  cy.get('@mapSettings')
    .contains('label.custom-file-label', 'Choose Custom Map File')
    .should('be.visible');
  cy.get('@mapSettings')
    .contains('a[href="https://github.com/CDCgov/MicrobeTrace/wiki/Map-View"]', 'More Information')
    .should('have.attr', 'target', '_blank')
    .and('have.attr', 'title', 'Open the custom map tutorial document for GeoJSON and image floorplans.');
};

const setFloorplanLayer = (selection: 'Show' | 'Hide'): void => {
  cy.get('@mapSettings')
    .find('#map-floorplan-background-show-hide')
    .contains(selection)
    .click({ force: true });
};

const selectManualPositionNode = (nodeId: string): void => {
  cy.get('@mapSettings')
    .find('#map-manual-position-node')
    .click({ force: true });
  cy.contains('li[role="option"]', new RegExp(`^${nodeId} \\(`), { timeout: 15000 })
    .click({ force: true });

  cy.window()
    .its('commonService.visuals.gisMap.SelectedManualPositionNodeId')
    .should('equal', nodeId);
};

const fireFloorplanClick = (x: number, y: number): void => {
  cy.window().then((win: unknown) => {
    const mapView = (win as WinWithMap).commonService.visuals.gisMap;
    mapView.lmap.fire('click', {
      latlng: {
        lat: y,
        lng: x,
      },
    });
  });
};

const fireMapClick = (latitude: number, longitude: number): void => {
  cy.window().then((win: unknown) => {
    const mapView = (win as WinWithMap).commonService.visuals.gisMap;
    mapView.lmap.fire('click', {
      latlng: {
        lat: latitude,
        lng: longitude,
      },
    });
  });
};

const getSessionNode = (win: WinWithMap, nodeId: string) =>
  win.commonService.session.data.nodes.find((node: any) => String(node._id) === nodeId);

const getRenderedNodeLayer = (win: WinWithMap, nodeId: string) =>
  win.commonService.visuals.gisMap.layers.featureGroup
    .getLayers()
    .find((layer: any) => String(layer?.data?._id ?? '') === nodeId);

const assertFloorplanBackgroundHidden = (): void => {
  cy.window({ timeout: 15000 }).should((win: unknown) => {
    const mapView = (win as WinWithMap).commonService.visuals.gisMap;
    const widgets = mapView.commonService.session.style.widgets;

    expect(widgets['map-user-geojson-show'], 'user GeoJSON widget').to.equal(false);
    expect(mapView.lmap.hasLayer(mapView.layers.userGeoJSON), 'user GeoJSON layer hidden').to.equal(false);
  });
};

const assertFloorplanBackgroundShown = (): void => {
  cy.window({ timeout: 15000 }).should((win: unknown) => {
    const mapView = (win as WinWithMap).commonService.visuals.gisMap;
    const session = mapView.commonService.session;
    const widgets = session.style.widgets;

    expect(session.data.geoJSON?.type, 'stored GeoJSON type').to.equal('FeatureCollection');
    expect(session.data.geoJSONLayerName, 'stored GeoJSON layer name').to.equal(floorplanFixture);
    expect(widgets['map-user-geojson-show'], 'user GeoJSON widget').to.equal(true);
    expect(widgets['map-floorplan-image-show'], 'floorplan image widget').to.equal(false);
    expect(mapView.lmap.hasLayer(mapView.layers.userGeoJSON), 'user GeoJSON layer visible').to.equal(true);
    expect(mapView.layers.userGeoJSON.getLayers().length, 'user GeoJSON features rendered').to.be.greaterThan(0);

    [
      ['basemap', 'map-basemap-show'],
      ['satellite', 'map-satellite-show'],
      ['countries', 'map-countries-show'],
      ['states', 'map-states-show'],
      ['counties', 'map-counties-show'],
    ].forEach(([layerKey, widgetKey]) => {
      expect(widgets[widgetKey], `${widgetKey} hidden by floorplan`).to.equal(false);
      expect(mapView.lmap.hasLayer(mapView.layers[layerKey]), `${layerKey} layer hidden by floorplan`).to.equal(false);
    });
  });
};

const assertSquareImageFloorplanBackgroundShown = (): void => {
  cy.window({ timeout: 15000 }).should((win: unknown) => {
    const mapView = (win as WinWithMap).commonService.visuals.gisMap;
    const session = mapView.commonService.session;
    const widgets = session.style.widgets;

    expect(session.data.floorplanImageLayerName, 'stored image layer name').to.equal(imageFloorplanFixture);
    expect(session.data.floorplanImageWidth, 'stored image width').to.equal(100);
    expect(session.data.floorplanImageHeight, 'stored image height').to.equal(100);
    expect(session.data.floorplanImageBounds, 'stored normalized image bounds').to.deep.equal([[0, 0], [80, 80]]);
    expect(widgets['map-floorplan-image-show'], 'floorplan image widget').to.equal(true);
    expect(widgets['map-user-geojson-show'], 'user GeoJSON widget').to.equal(false);
    expect(mapView.layers.floorplanImage, 'floorplan image layer').to.exist;
    expect(mapView.lmap.hasLayer(mapView.layers.floorplanImage), 'floorplan image layer visible').to.equal(true);

    const overlayBounds = mapView.layers.floorplanImage.getBounds();
    expect(overlayBounds.getWest(), 'projected image west').to.equal(0);
    expect(overlayBounds.getEast(), 'projected image east').to.equal(80);
    expect(overlayBounds.getSouth(), 'projected image south').to.equal(0);
    expect(overlayBounds.getNorth(), 'projected image north').to.be.lessThan(80);

    [
      ['basemap', 'map-basemap-show'],
      ['satellite', 'map-satellite-show'],
      ['countries', 'map-countries-show'],
      ['states', 'map-states-show'],
      ['counties', 'map-counties-show'],
    ].forEach(([layerKey, widgetKey]) => {
      expect(widgets[widgetKey], `${widgetKey} hidden by image floorplan`).to.equal(false);
      expect(mapView.lmap.hasLayer(mapView.layers[layerKey]), `${layerKey} layer hidden by image floorplan`).to.equal(false);
    });
  });

  cy.get('.mapStyle img.leaflet-image-layer', { timeout: 15000 }).should(($images) => {
    expect($images.length, 'rendered image overlay count').to.be.greaterThan(0);

    const rect = ($images[0] as HTMLImageElement).getBoundingClientRect();
    expect(rect.width, 'rendered image width').to.be.greaterThan(40);
    expect(rect.height, 'rendered image height').to.be.greaterThan(40);
    expect(rect.width / rect.height, 'rendered image aspect ratio').to.be.closeTo(1, 0.08);
  });
};

const assertNodeUsesFloorplanCoordinates = (nodeId: string, x: number, y: number): void => {
  cy.window({ timeout: 15000 }).should((win: unknown) => {
    const typedWindow = win as WinWithMap;
    const node = getSessionNode(typedWindow, nodeId);
    const layer = getRenderedNodeLayer(typedWindow, nodeId);

    expect(node, `session node ${nodeId}`).to.exist;
    expect(Number(node.map_floorplan_x), `${nodeId} stored floorplan x`).to.be.closeTo(x, 0.0001);
    expect(Number(node.map_floorplan_y), `${nodeId} stored floorplan y`).to.be.closeTo(y, 0.0001);
    expect(Number(node._lon), `${nodeId} rendered floorplan longitude`).to.be.closeTo(x, 0.0001);
    expect(Number(node._lat), `${nodeId} rendered floorplan latitude`).to.be.closeTo(y, 0.0001);
    expect(layer, `rendered map marker ${nodeId}`).to.exist;
    expect(layer.getLatLng().lng, `${nodeId} marker floorplan x`).to.be.closeTo(x, 0.0001);
    expect(layer.getLatLng().lat, `${nodeId} marker floorplan y`).to.be.closeTo(y, 0.0001);
  });
};

const assertNodeUsesGeographicCoordinates = (nodeId: string, x: number, y: number): void => {
  cy.window({ timeout: 15000 }).should((win: unknown) => {
    const typedWindow = win as WinWithMap;
    const node = getSessionNode(typedWindow, nodeId);

    expect(node, `session node ${nodeId}`).to.exist;
    expect(Number(node.map_floorplan_x), `${nodeId} retained floorplan x`).to.be.closeTo(x, 0.0001);
    expect(Number(node.map_floorplan_y), `${nodeId} retained floorplan y`).to.be.closeTo(y, 0.0001);
    expect(Math.abs(Number(node._lon) - x), `${nodeId} longitude no longer floorplan x`).to.be.greaterThan(1);
    expect(Math.abs(Number(node._lat) - y), `${nodeId} latitude no longer floorplan y`).to.be.greaterThan(1);
  });
};

describe('Journey Flow - Map custom floorplan GeoJSON and manual positions', () => {
  const profile = getProfile('map-color-by-uploaded');

  it('uploads a GeoJSON floorplan, applies manual positions only while shown, and restores them from a saved session', () => {
    const sessionFileBase = `cypress_floorplan_manual_positions_${Date.now()}`;
    const sessionFilePath = `${Cypress.config('downloadsFolder')}/${sessionFileBase}.microbetrace`;

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    goToMapView();

    openMapSettingsDialog();
    selectMapField('map-field-zipcode', 'Zipcode', 'map-field-zipcode', 'Zip_code');
    setMapNodeCollapsing('Off');
    cy.closeSettingsPane('Geospatial Settings');

    assertMapRenderedCounts({
      nodes: 4,
      links: 4,
    });

    openMapSettingsDialog();
    openCustomMapTab();
    cy.attach_file('#map-floorplan-background-file', floorplanFixture, floorplanMimeType);
    cy.get('@mapSettings')
      .find('.map-user-geojson-summary', { timeout: 15000 })
      .should('contain.text', floorplanFixture)
      .and('contain.text', '2 features');
    assertFloorplanBackgroundShown();

    cy.get('@mapSettings')
      .find('#map-manual-positioning')
      .contains('On')
      .click({ force: true });
    cy.window()
      .its('commonService.visuals.gisMap.SelectedManualPositionTypeVariable')
      .should('equal', 'On');

    selectManualPositionNode(placedNodeId);
    fireFloorplanClick(placedPoint.x, placedPoint.y);
    assertNodeUsesFloorplanCoordinates(placedNodeId, placedPoint.x, placedPoint.y);

    setFloorplanLayer('Hide');
    assertFloorplanBackgroundHidden();
    assertNodeUsesGeographicCoordinates(placedNodeId, placedPoint.x, placedPoint.y);

    setFloorplanLayer('Show');
    assertFloorplanBackgroundShown();
    assertNodeUsesFloorplanCoordinates(placedNodeId, placedPoint.x, placedPoint.y);

    cy.closeSettingsPane('Geospatial Settings');

    installSaveAsCaptureHook();
    saveSessionFromFileMenu(sessionFileBase);
    writeCapturedDownloadToDisk(`${sessionFileBase}.microbetrace`, sessionFilePath);

    cy.readFile(sessionFilePath, 'utf8', { timeout: 30000 }).should((savedSession) => {
      expect(savedSession, 'saved session contains GeoJSON').to.include('"geoJSON"');
      expect(savedSession, 'saved session contains manual floorplan x').to.include('"map_floorplan_x"');
      expect(savedSession, 'saved session contains floorplan layer flag').to.include('"map-user-geojson-show"');
    });

    visitAppAndAcceptEula();
    cy.get('#fileDropRef', { timeout: 15000 }).selectFile(sessionFilePath, { force: true });
    assertMapReady(30000);

    assertFloorplanBackgroundShown();
    assertNodeUsesFloorplanCoordinates(placedNodeId, placedPoint.x, placedPoint.y);
  });

  it('uploads a square image floorplan without vertical stretch', () => {
    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    goToMapView();

    openMapSettingsDialog();
    openCustomMapTab();
    cy.attach_file('#map-floorplan-background-file', imageFloorplanFixture, imageFloorplanMimeType);
    cy.get('@mapSettings')
      .find('.map-user-geojson-summary', { timeout: 15000 })
      .should('contain.text', imageFloorplanFixture)
      .and('contain.text', '100 x 100px')
      .and('contain.text', 'x 0.00-80.00, y 0.00-80.00');

    assertSquareImageFloorplanBackgroundShown();
  });

  it('updates the excluded-node count when a node is manually placed on the map', () => {
    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    goToMapView();

    cy.window().then((win: unknown) => {
      const typedWindow = win as WinWithMap;
      [
        typedWindow.commonService.session.data.nodes,
        typedWindow.commonService.session.data.nodeFilteredValues,
      ].forEach((nodes: any[]) => {
        const node = nodes.find((candidate) => String(candidate._id) === missingLocationNodeId);
        expect(node, `${missingLocationNodeId} fixture node`).to.exist;
        node.Zip_code = '';
      });
    });

    openMapSettingsDialog();
    selectMapField('map-field-zipcode', 'Zipcode', 'map-field-zipcode', 'Zip_code');
    setMapNodeCollapsing('Off');
    cy.closeSettingsPane('Geospatial Settings');

    cy.get(excludedNodesButtonSelector)
      .should('have.text', '1')
      .and('have.css', 'color', 'rgb(255, 0, 0)');
    cy.window().its('commonService.visuals.gisMap.nodesWithoutLoc').should((nodesWithoutLoc: any[]) => {
      expect(nodesWithoutLoc.map((node) => String(node.ID)), 'excluded node ids')
        .to.include(missingLocationNodeId);
    });

    openMapSettingsDialog();
    openCustomMapTab();
    cy.get('@mapSettings')
      .find('#map-manual-positioning')
      .contains('On')
      .click({ force: true });
    selectManualPositionNode(missingLocationNodeId);
    cy.closeSettingsPane('Geospatial Settings');

    fireMapClick(manualMapPoint.latitude, manualMapPoint.longitude);

    cy.get(excludedNodesButtonSelector)
      .should('have.text', '0')
      .and('have.css', 'color', 'rgb(0, 93, 170)');
    cy.window().should((win: unknown) => {
      const typedWindow = win as WinWithMap;
      const mapView = typedWindow.commonService.visuals.gisMap;
      const node = getSessionNode(typedWindow, missingLocationNodeId);

      expect(mapView.nodesWithoutLoc.map((entry: any) => String(entry.ID)), 'excluded node ids after manual placement')
        .not.to.include(missingLocationNodeId);
      expect(Number(node.map_manual_latitude), `${missingLocationNodeId} stored manual latitude`)
        .to.be.closeTo(manualMapPoint.latitude, 0.0001);
      expect(Number(node.map_manual_longitude), `${missingLocationNodeId} stored manual longitude`)
        .to.be.closeTo(manualMapPoint.longitude, 0.0001);
      expect(Number(node._lat), `${missingLocationNodeId} rendered manual latitude`)
        .to.be.closeTo(manualMapPoint.latitude, 0.0001);
      expect(Number(node._lon), `${missingLocationNodeId} rendered manual longitude`)
        .to.be.closeTo(manualMapPoint.longitude, 0.0001);
    });
  });
});
