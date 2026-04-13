/// <reference types="cypress" />

import * as L from 'leaflet';

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

const getRenderedNodeLayer = (win: WinWithMap, nodeId: string) =>
  win.commonService.visuals.gisMap.layers.featureGroup
    .getLayers()
    .find((layer: any) => String(layer?.data?._id ?? layer?.data?.ID) === nodeId);

describe('Journey Flow - Map uploaded node selection', () => {
  const profile = getProfile('map-color-by-uploaded');

  it('selects an uploaded rendered Map node and syncs the selected state back into the backing model', () => {
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

    cy.window().should((win: unknown) => {
      const typedWindow = win as WinWithMap;
      const nodeLayer = getRenderedNodeLayer(typedWindow, 'A');
      const visibleNodes = typedWindow.commonService.getVisibleNodes();

      expect(nodeLayer, 'rendered map node A').to.exist;
      expect(nodeLayer.data.selected, 'node layer selection before click').to.equal(false);
      expect(nodeLayer.options.color, 'node layer border before click').to.equal('#000000');
      expect(nodeLayer.options.weight, 'node layer border width before click').to.equal(1);

      expect(
        visibleNodes.some((node: any) => node.selected),
        'no visible nodes selected before click',
      ).to.equal(false);
    });

    cy.window().then((win: unknown) => {
      const typedWindow = win as WinWithMap;
      const nodeLayer = getRenderedNodeLayer(typedWindow, 'A');
      const lmap = typedWindow.commonService.visuals.gisMap.lmap;

      expect(nodeLayer, 'rendered map node A').to.exist;

      const point = nodeLayer._point;
      const fakeOriginalEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        composed: true,
        button: 0,
      });
      const containerPoint = L.point(point.x, point.y);
      const latlng = lmap.containerPointToLatLng(containerPoint);

      nodeLayer.fire('click', {
        latlng,
        layer: nodeLayer,
        containerPoint,
        originalEvent: fakeOriginalEvent,
      });
    });

    cy.window().should((win: unknown) => {
      const typedWindow = win as WinWithMap;
      const nodeLayer = getRenderedNodeLayer(typedWindow, 'A');
      const visibleNodes = typedWindow.commonService.getVisibleNodes();
      const selectedNode = visibleNodes.find((node: any) => String(node._id ?? node.ID) === 'A');
      const otherSelectedNodes = visibleNodes.filter((node: any) =>
        String(node._id ?? node.ID) !== 'A' && node.selected,
      );

      expect(nodeLayer, 'rendered map node A after click').to.exist;
      expect(nodeLayer.data.selected, 'node layer selection after click').to.equal(true);
      expect(nodeLayer.options.color, 'node layer border after click').to.equal('#ff8300');
      expect(nodeLayer.options.weight, 'node layer border width after click').to.equal(3);

      expect(selectedNode?.selected, 'selected node in commonService').to.equal(true);
      expect(otherSelectedNodes.length, 'only one visible node remains selected').to.equal(0);
    });
  });
});
