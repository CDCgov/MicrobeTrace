/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  goToMapView,
  launchProfileToTwoD,
  openMapSettingsDialog,
  selectMapField,
  setMapNodeCollapsing,
} from '../../../support/journey-helpers';

type WinWithMap = Window & {
  commonService: any;
};

type JitterSnapshot = Record<string, { theta: number; jitter: number }>;

const readRenderedNodeJitter = (win: WinWithMap): JitterSnapshot =>
  win.commonService.visuals.gisMap.layers.featureGroup
    .getLayers()
    .reduce((acc: JitterSnapshot, layer: any) => {
    const nodeId = String(layer?.data?._id ?? layer?.data?.ID ?? '');
    if (!nodeId) return acc;

    acc[nodeId] = {
      theta: Number(layer.data._theta),
      jitter: Number(layer.data._j),
    };

      return acc;
    }, {});

describe('Journey Flow - Map uploaded jitter controls', () => {
  const profile = getProfile('map-covid-zipcode-threshold');

  it('updates node jitter amount and rerolls stored jitter values on uploaded zipcode-mapped data', () => {
    const updatedJitter = 1.6;
    let jitterBefore: JitterSnapshot = {};

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    goToMapView();

    openMapSettingsDialog();
    selectMapField('map-field-zipcode', 'Zipcode', 'map-field-zipcode', 'Zip_code');
    setMapNodeCollapsing('Off');

    cy.get('@mapSettings').contains('.nav-link', 'Nodes').click({ force: true });
    cy.get('@mapSettings')
      .find('#map-node-jitter')
      .invoke('val', updatedJitter)
      .trigger('input')
      .trigger('change');

    cy.window()
      .its('commonService.session.style.widgets.map-node-jitter')
      .should('equal', updatedJitter);

    cy.window().then((win: unknown) => {
      jitterBefore = readRenderedNodeJitter(win as WinWithMap);
      expect(Object.keys(jitterBefore).length, 'rendered map nodes with stored jitter').to.be.greaterThan(0);

      Object.values(jitterBefore).forEach((jitterState) => {
        expect(Number.isFinite(jitterState.theta), 'stored jitter angle').to.equal(true);
        expect(Number.isFinite(jitterState.jitter), 'stored jitter magnitude').to.equal(true);
      });
    });

    cy.get('@mapSettings').find('#map-node-jitter-reroll').click({ force: true });

    cy.window().should((win: unknown) => {
      const jitterAfter = readRenderedNodeJitter(win as WinWithMap);
      const changedNodeIds = Object.keys(jitterAfter).filter((nodeId) => {
        const before = jitterBefore[nodeId];
        const after = jitterAfter[nodeId];
        if (!before || !after) return false;

        return before.theta !== after.theta || before.jitter !== after.jitter;
      });

      expect(changedNodeIds.length, 'at least one rendered node rerolled jitter state').to.be.greaterThan(0);
    });

    cy.closeSettingsPane('Geospatial Settings');
  });
});
