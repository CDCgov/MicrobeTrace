/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  assertMapRenderedCounts,
  assertMetricCount,
  goToMapView,
  launchProfileToTwoD,
  openGlobalFilteringTab,
  openMapSettingsDialog,
  selectMapField,
  setGlobalLinkThreshold,
  setMapNodeCollapsing,
} from '../../../support/journey-helpers';

const EXCLUDED_NODE_IDS = ['P1', 'P2', 'P3'];
const RENDERED_NODE_COUNT = 30;
const LINKS_AT_THRESHOLD_16 = 46;
const LINKS_AT_THRESHOLD_24 = 73;

describe('Journey Flow - Map zipcode rendering and threshold round-trip', () => {
  const profile = getProfile('map-covid-zipcode-threshold');

  it('renders uploaded zipcode nodes on the map and keeps rendered counts stable across a threshold round-trip', () => {
    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    goToMapView();

    openMapSettingsDialog();
    selectMapField('map-field-zipcode', 'Zipcode', 'map-field-zipcode', 'Zip_code');
    setMapNodeCollapsing('Off');
    cy.closeSettingsPane('Geospatial Settings');

    cy.get('#tool-btn-container-map a[title="Nodes without Location Data"]')
      .should('contain.text', String(EXCLUDED_NODE_IDS.length))
      .click({ force: true });

    cy.contains('.p-dialog-title', 'Excluded Nodes')
      .parents('.p-dialog')
      .should('contain.text', 'omitted from Map View');

    EXCLUDED_NODE_IDS.forEach((nodeId) => {
      cy.contains('.p-dialog', `ID: ${nodeId}`).should('be.visible');
    });

    cy.closeSettingsPane('Excluded Nodes');

    assertMapRenderedCounts({
      nodes: RENDERED_NODE_COUNT,
      links: LINKS_AT_THRESHOLD_16,
      excludedNodes: EXCLUDED_NODE_IDS,
    });

    openGlobalFilteringTab();
    setGlobalLinkThreshold(24);
    cy.closeGlobalSettings();

    assertMetricCount('#numberOfNodes', 33);
    assertMetricCount('#numberOfVisibleLinks', LINKS_AT_THRESHOLD_24);
    assertMapRenderedCounts({
      nodes: RENDERED_NODE_COUNT,
      links: LINKS_AT_THRESHOLD_24,
      excludedNodes: EXCLUDED_NODE_IDS,
    });

    openGlobalFilteringTab();
    setGlobalLinkThreshold(16);
    cy.closeGlobalSettings();

    assertAfterLaunchCounts(profile);
    assertMapRenderedCounts({
      nodes: RENDERED_NODE_COUNT,
      links: LINKS_AT_THRESHOLD_16,
      excludedNodes: EXCLUDED_NODE_IDS,
    });
  });
});
