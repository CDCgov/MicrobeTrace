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
import { getRenderedMapNodeContainerPoint, readRenderedMapNodeStyle } from '../../../support/map-helpers';

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
    let strokeWidthBefore = 0;

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
      const nodeStyle = readRenderedMapNodeStyle(nodeLayer);

      expect(nodeLayer, 'rendered map node A').to.exist;
      expect(nodeLayer.data.selected, 'node layer selection before click').to.equal(false);
      expect(nodeStyle.strokeColor, 'node layer border before click').to.equal('#000000');
      expect(nodeStyle.strokeWidth, 'node layer stroke width before click').to.be.greaterThan(0);
      strokeWidthBefore = Number(nodeStyle.strokeWidth);

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

      const containerPoint = getRenderedMapNodeContainerPoint(lmap, nodeLayer);
      const fakeOriginalEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        composed: true,
        button: 0,
      });
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
      const nodeStyle = readRenderedMapNodeStyle(nodeLayer);

      expect(nodeLayer, 'rendered map node A after click').to.exist;
      expect(nodeLayer.data.selected, 'node layer selection after click').to.equal(true);
      expect(nodeStyle.strokeColor, 'node layer border after click').to.equal('#ff8300');
      expect(nodeStyle.strokeWidth, 'node layer stroke width after click').to.be.greaterThan(strokeWidthBefore);

      expect(selectedNode?.selected, 'selected node in commonService').to.equal(true);
      expect(otherSelectedNodes.length, 'only one visible node remains selected').to.equal(0);
    });
  });
});
