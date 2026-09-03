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

const takeScreenshots = Cypress.env('takeScreenshots') === true;

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
const customGeoJSONColor = '#ff00aa';
const customGeoJSONTransparency = 0.4;
const excludedNodesButtonSelector = '#tool-btn-container-map a[title="Nodes without Location Data"]';

const openMapSettingsTab = (label: 'Components' | 'Custom Map' | 'Data' | 'Nodes'): void => {
  cy.get('@mapSettings').contains('.nav-link', label).click({ force: true });
};

const openCustomMapTab = (): void => {
  openMapSettingsTab('Custom Map');
  cy.get('@mapSettings')
    .find('.p-dialog-content')
    .scrollTo('top', { duration: 0, ensureScrollable: false });
  cy.get('@mapSettings').find('#map-floorplan-background-file').should('exist');
  cy.get('@mapSettings')
    .contains('label.custom-file-label', 'Choose Custom Map File')
    .should('be.visible');
  cy.get('@mapSettings')
    .contains('a[href="https://github.com/CDCgov/MicrobeTrace/wiki/Map-View-with-GeoJSON-Files-and-Custom-Maps"]', 'More Information')
    .should('have.attr', 'target', '_blank')
    .and('have.attr', 'title', 'Open the custom map tutorial document for GeoJSON and image floorplans.');
};

const setFloorplanLayer = (selection: 'Show' | 'Overlay' | 'Hide'): void => {
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
    expect(widgets['map-floorplan-background-mode'], 'custom map mode').to.equal('Hide');
    expect(mapView.lmap.hasLayer(mapView.layers.userGeoJSON), 'user GeoJSON layer hidden').to.equal(false);
    expect(widgets['map-countries-show'], 'offline map restored after hiding exclusive custom map').to.equal(true);
    expect(mapView.lmap.hasLayer(mapView.layers.countries), 'restored offline map layer visible').to.equal(true);
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
    expect(widgets['map-floorplan-background-mode'], 'custom map mode').to.equal('Show');
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

const selectGeoJSONLabelField = (field: 'None' | 'name'): void => {
  cy.get('@mapSettings')
    .find('#map-user-geojson-label-field .p-select-dropdown')
    .click({ force: true });
  cy.get('.p-select-overlay:visible li[role="option"]', { timeout: 15000 })
    .contains(new RegExp(`^${field}$`))
    .click({ force: true });
  cy.get('.p-select-overlay:visible').should('not.exist');
  cy.window()
    .its('commonService.session.style.widgets.map-user-geojson-label-field')
    .should('equal', field);
};

const assertFloorplanBackgroundOverlay = (): void => {
  cy.window({ timeout: 15000 }).should((win: unknown) => {
    const typedWindow = win as WinWithMap;
    const mapView = typedWindow.commonService.visuals.gisMap;
    const widgets = mapView.commonService.session.style.widgets;

    expect(widgets['map-floorplan-background-mode'], 'custom map mode').to.equal('Overlay');
    expect(widgets['map-user-geojson-show'], 'user GeoJSON widget').to.equal(true);
    expect(widgets['map-basemap-show'], 'basemap preserved under overlay').to.equal(true);
    expect(mapView.lmap.hasLayer(mapView.layers.userGeoJSON), 'user GeoJSON overlay visible').to.equal(true);
    expect(mapView.lmap.hasLayer(mapView.layers.basemap), 'basemap visible under overlay').to.equal(true);

    const customPane = mapView.lmap.getPane('map-custom-background');
    const linkPane = mapView.lmap.getPane('map-network-links');
    const tilePane = mapView.lmap.getPane('tilePane');
    const markerPane = mapView.lmap.getPane('markerPane');
    const paneZIndex = (pane: HTMLElement) => Number(typedWindow.getComputedStyle(pane).zIndex);

    expect(paneZIndex(customPane), 'custom map above basemap tiles').to.be.greaterThan(paneZIndex(tilePane));
    expect(paneZIndex(customPane), 'custom map below links').to.be.lessThan(paneZIndex(linkPane));
    expect(paneZIndex(customPane), 'custom map below nodes').to.be.lessThan(paneZIndex(markerPane));
  });
};

const assertFloorplanBackgroundOverOfflineMap = (): void => {
  cy.window({ timeout: 15000 }).should((win: unknown) => {
    const typedWindow = win as WinWithMap;
    const mapView = typedWindow.commonService.visuals.gisMap;
    const widgets = mapView.commonService.session.style.widgets;

    expect(widgets['map-floorplan-background-mode'], 'custom map mode').to.equal('Overlay');
    expect(widgets['map-countries-show'], 'offline countries layer preserved').to.equal(true);
    expect(widgets['map-basemap-show'], 'online basemap remains hidden').to.equal(false);
    expect(mapView.lmap.hasLayer(mapView.layers.countries), 'offline countries layer visible').to.equal(true);
    expect(mapView.lmap.hasLayer(mapView.layers.userGeoJSON), 'user GeoJSON overlay visible').to.equal(true);

    const customPane = mapView.lmap.getPane('map-custom-background');
    const offlinePane = mapView.lmap.getPane('overlayPane');
    const linkPane = mapView.lmap.getPane('map-network-links');
    const paneZIndex = (pane: HTMLElement) => Number(typedWindow.getComputedStyle(pane).zIndex);

    expect(paneZIndex(customPane), 'custom map above offline map').to.be.greaterThan(paneZIndex(offlinePane));
    expect(paneZIndex(customPane), 'custom map below links').to.be.lessThan(paneZIndex(linkPane));
  });
};

const assertCustomGeoJSONStyle = (): void => {
  cy.window({ timeout: 15000 }).should((win: unknown) => {
    const mapView = (win as WinWithMap).commonService.visuals.gisMap;
    const widgets = mapView.commonService.session.style.widgets;
    const layers = mapView.layers.userGeoJSON.getLayers();

    expect(widgets['map-user-geojson-color'], 'stored GeoJSON color').to.equal(customGeoJSONColor);
    expect(widgets['map-user-geojson-transparency'], 'stored GeoJSON transparency').to.equal(customGeoJSONTransparency);
    expect(layers.length, 'styled GeoJSON features').to.be.greaterThan(0);
    layers.forEach((layer: any) => {
      expect(layer.options.color, 'GeoJSON stroke color').to.equal(customGeoJSONColor);
      expect(layer.options.fillColor, 'GeoJSON fill color').to.equal(customGeoJSONColor);
      expect(layer.options.opacity, 'GeoJSON stroke remains opaque').to.equal(1);
      expect(layer.options.fillOpacity, 'GeoJSON fill opacity').to.equal(1 - customGeoJSONTransparency);
      expect(layer.options.pane, 'GeoJSON pane').to.equal('map-custom-background');
    });
  });
};

const assertCustomGeoJSONFullyTransparentFill = (): void => {
  cy.window({ timeout: 15000 }).should((win: unknown) => {
    const mapView = (win as WinWithMap).commonService.visuals.gisMap;
    const layers = mapView.layers.userGeoJSON.getLayers();

    expect(layers.length, 'styled GeoJSON features').to.be.greaterThan(0);
    layers.forEach((layer: any) => {
      expect(layer.options.color, 'GeoJSON stroke retains selected color').to.equal(customGeoJSONColor);
      expect(layer.options.fillColor, 'GeoJSON fill retains selected color').to.equal(customGeoJSONColor);
      expect(layer.options.opacity, 'GeoJSON stroke remains visible').to.equal(1);
      expect(layer.options.fillOpacity, 'GeoJSON fill is fully transparent').to.equal(0);
    });
  });
};

const assertCustomGeoJSONLabels = (): void => {
  cy.get('.mapStyle .map-user-geojson-label', { timeout: 15000 })
    .should('have.length', 2)
    .then(($labels) => {
      const labelText = Array.from($labels, label => label.textContent?.trim());
      expect(labelText, 'rendered GeoJSON labels').to.have.members(['Cypress Floorplan', 'Interior Wall']);
      $labels.each((_index, label) => {
        expect(label.classList.contains('map-admin-label'), 'custom label uses administrative label styling').to.equal(true);
        expect(label.classList.contains('map-admin-label-states'), 'custom label uses state label styling').to.equal(true);
      });
    });

  cy.window().should((win: unknown) => {
    const typedWindow = win as WinWithMap;
    const mapView = typedWindow.commonService.visuals.gisMap;
    const labelPane = mapView.lmap.getPane('map-custom-labels');
    const backgroundPane = mapView.lmap.getPane('map-custom-background');
    const linkPane = mapView.lmap.getPane('map-network-links');
    const markerPane = mapView.lmap.getPane('markerPane');
    const paneZIndex = (pane: HTMLElement) => Number(typedWindow.getComputedStyle(pane).zIndex);

    expect(mapView.SelectedUserGeoJSONLabelField, 'selected GeoJSON label property').to.equal('name');
    expect(paneZIndex(labelPane), 'labels above custom geometry').to.be.greaterThan(paneZIndex(backgroundPane));
    expect(paneZIndex(labelPane), 'labels below links').to.be.lessThan(paneZIndex(linkPane));
    expect(paneZIndex(labelPane), 'labels below nodes').to.be.lessThan(paneZIndex(markerPane));

    const renderedLabels = typedWindow.document.querySelectorAll<HTMLElement>('.mapStyle .map-user-geojson-label');
    renderedLabels.forEach(label => {
      const style = typedWindow.getComputedStyle(label);
      expect(style.backgroundColor, 'custom label background').to.equal('rgba(0, 0, 0, 0)');
      expect(style.borderTopWidth, 'custom label border').to.equal('0px');
      expect(style.boxShadow, 'custom label box shadow').to.equal('none');
      expect(style.fontFamily, 'custom label font family').to.contain('Arial');
      expect(style.fontSize, 'custom label font size').to.equal('11px');
      expect(style.fontWeight, 'custom label font weight').to.equal('600');
      expect(style.textShadow, 'custom label text halo').not.to.equal('none');
      expect(style.paddingTop, 'custom label padding').to.equal('0px');
      expect(typedWindow.getComputedStyle(label, '::before').display, 'custom label tooltip arrow').to.equal('none');
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
    cy.get('@mapSettings').find('#map-user-geojson-color').should('be.visible');
    cy.get('@mapSettings').find('#map-user-geojson-transparency').should('be.visible');
    cy.get('@mapSettings')
      .find('#map-user-geojson-label-field')
      .should('be.visible')
      .find('.p-select-label')
      .should('contain.text', 'None');
    cy.window().should((win: unknown) => {
      const mapView = (win as WinWithMap).commonService.visuals.gisMap;
      expect(mapView.UserGeoJSONLabelFields.map((option: any) => option.value), 'GeoJSON property options')
        .to.deep.equal(['None', 'name']);
      expect(mapView.SelectedUserGeoJSONLabelField, 'default label property').to.equal('None');
    });
    cy.get('.mapStyle .map-user-geojson-label').should('not.exist');

    selectGeoJSONLabelField('name');
    assertCustomGeoJSONLabels();
    if (takeScreenshots) {
      cy.screenshot('map/custom-geojson-label-controls', { overwrite: true });
      cy.closeSettingsPane('Geospatial Settings');
      cy.window().then((win: unknown) => {
        const mapView = (win as WinWithMap).commonService.visuals.gisMap;
        mapView.lmap.fitBounds(mapView.layers.userGeoJSON.getBounds(), { animate: false, padding: [30, 30] });
      });
      cy.get('.mapStyle .map-user-geojson-label').should('be.visible');
      cy.screenshot('map/custom-geojson-labels', { overwrite: true });
      openMapSettingsDialog();
      openCustomMapTab();
    }
    selectGeoJSONLabelField('None');
    cy.get('.mapStyle .map-user-geojson-label').should('not.exist');
    selectGeoJSONLabelField('name');
    assertCustomGeoJSONLabels();

    setFloorplanLayer('Overlay');
    assertFloorplanBackgroundOverlay();
    cy.get('@mapSettings')
      .find('#map-user-geojson-color')
      .invoke('val', customGeoJSONColor)
      .trigger('input');
    cy.get('@mapSettings')
      .find('#map-user-geojson-transparency')
      .invoke('val', String(customGeoJSONTransparency))
      .trigger('input');
    cy.get('@mapSettings').find('.map-geojson-transparency-value').should('have.text', '40%');
    assertCustomGeoJSONStyle();

    cy.get('@mapSettings')
      .find('#map-user-geojson-transparency')
      .invoke('val', '1')
      .trigger('input');
    cy.get('@mapSettings').find('.map-geojson-transparency-value').should('have.text', '100%');
    assertCustomGeoJSONFullyTransparentFill();
    if (takeScreenshots) {
      cy.closeSettingsPane('Geospatial Settings');
      cy.window().then((win: unknown) => {
        const mapView = (win as WinWithMap).commonService.visuals.gisMap;
        mapView.lmap.fitBounds(mapView.layers.userGeoJSON.getBounds(), { animate: false, padding: [30, 30] });
      });
      cy.screenshot('map/custom-geojson-transparent-fill-solid-border', { overwrite: true });
      openMapSettingsDialog();
      openCustomMapTab();
    }
    cy.get('@mapSettings')
      .find('#map-user-geojson-transparency')
      .invoke('val', String(customGeoJSONTransparency))
      .trigger('input');
    assertCustomGeoJSONStyle();

    setFloorplanLayer('Hide');
    openMapSettingsTab('Components');
    cy.get('@mapSettings')
      .find('#map-countries-show-hide')
      .contains('Borders Only')
      .click({ force: true });
    cy.window().should((win: unknown) => {
      const mapView = (win as WinWithMap).commonService.visuals.gisMap;
      expect(mapView.commonService.session.style.widgets['map-countries-show'], 'offline countries selected').to.equal(true);
      expect(mapView.lmap.hasLayer(mapView.layers.countries), 'offline countries rendered').to.equal(true);
    });
    openCustomMapTab();
    setFloorplanLayer('Overlay');
    assertFloorplanBackgroundOverOfflineMap();

    setFloorplanLayer('Show');
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
      expect(savedSession, 'saved session contains custom map mode').to.include('"map-floorplan-background-mode":"Show"');
      expect(savedSession, 'saved session contains GeoJSON color').to.include(`"map-user-geojson-color":"${customGeoJSONColor}"`);
      expect(savedSession, 'saved session contains GeoJSON transparency').to.include(`"map-user-geojson-transparency":${customGeoJSONTransparency}`);
      expect(savedSession, 'saved session contains GeoJSON label property').to.include('"map-user-geojson-label-field":"name"');
    });

    visitAppAndAcceptEula();
    cy.get('#fileDropRef', { timeout: 15000 }).selectFile(sessionFilePath, { force: true });
    assertMapReady(30000);

    assertFloorplanBackgroundShown();
    assertCustomGeoJSONStyle();
    assertCustomGeoJSONLabels();
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
    cy.get('@mapSettings').find('#map-user-geojson-color').should('not.exist');
    cy.get('@mapSettings').find('#map-user-geojson-transparency').should('not.exist');
    cy.get('@mapSettings').find('#map-user-geojson-label-field').should('not.exist');

    cy.readFile(`cypress/fixtures/${floorplanFixture}`, 'utf8').then((contents: string) => {
      cy.get('@mapSettings').find('#map-floorplan-background-file').selectFile({
        contents: Cypress.Buffer.from(contents),
        fileName: 'map-floorplan.json',
        mimeType: 'application/json',
      }, { force: true });
    });
    cy.get('@mapSettings')
      .find('.map-user-geojson-summary', { timeout: 15000 })
      .should('contain.text', 'map-floorplan.json')
      .and('contain.text', '2 features');
    cy.get('@mapSettings').find('#map-user-geojson-color').should('be.visible');
    cy.get('@mapSettings').find('#map-user-geojson-transparency').should('be.visible');
    cy.get('@mapSettings')
      .find('#map-user-geojson-label-field')
      .should('be.visible')
      .find('.p-select-label')
      .should('contain.text', 'None');
    cy.window().should((win: unknown) => {
      const session = (win as WinWithMap).commonService.session;
      expect(session.data.geoJSONLayerName, 'JSON background layer name').to.equal('map-floorplan.json');
      expect(session.style.widgets['map-floorplan-image-show'], 'image layer replaced by JSON').to.equal(false);
      expect(session.style.widgets['map-user-geojson-show'], 'JSON layer visible').to.equal(true);
      expect(session.style.widgets['map-user-geojson-label-field'], 'JSON label property defaults to None').to.equal('None');
    });
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
