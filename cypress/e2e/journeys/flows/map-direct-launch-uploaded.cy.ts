/// <reference types="cypress" />

import type { DatasetProfile } from '../datasets/profile';
import { getProfile } from '../datasets/profile';
import {
  applyPreLaunchFileSettings,
  assertMapReady,
  assertMapRenderedCounts,
  assertSessionAfterLaunchCounts,
  ensurePreLaunchProfileSynced,
  openMapSettingsDialog,
  selectMapField,
  setMapNodeCollapsing,
  visitAppAndAcceptEula,
} from '../../../support/journey-helpers';

const EXCLUDED_NODE_IDS = ['P1', 'P2', 'P3'];

const asDirectMapProfile = (profile: DatasetProfile): DatasetProfile => ({
  ...profile,
  preLaunch: {
    ...profile.preLaunch,
    defaultView: 'Map',
  },
});

const launchProfileDirectToMap = (profile: DatasetProfile): void => {
  visitAppAndAcceptEula();
  cy.loadFiles(profile.files);
  applyPreLaunchFileSettings(profile);
  ensurePreLaunchProfileSynced(profile);

  cy.get('#launch', { timeout: 15000 }).should('not.be.disabled').click({ force: true });
  cy.get('#loading-information', { timeout: 120000 }).should('not.exist');
  cy.window({ timeout: 120000 })
    .its('commonService.session.network.isFullyLoaded')
    .should('equal', true);

  assertMapReady(120000);
};

describe('Journey Flow - Map direct launch on uploaded data', () => {
  const profile = asDirectMapProfile(getProfile('map-covid-zipcode-threshold'));

  it('launches uploaded node and link files directly into Map from File Settings and keeps zipcode rendering deterministic', () => {
    launchProfileDirectToMap(profile);
    assertSessionAfterLaunchCounts(profile);

    cy.window()
      .its('commonService.session.style.widgets.default-view')
      .should('equal', 'Map');

    cy.window()
      .its('commonService.visuals.gisMap.lmap')
      .should('exist');

    openMapSettingsDialog();
    selectMapField('map-field-zipcode', 'Zipcode', 'map-field-zipcode', 'Zip_code');
    setMapNodeCollapsing('Off');
    cy.closeSettingsPane('Geospatial Settings');

    assertMapRenderedCounts({
      nodes: 30,
      links: 46,
      excludedNodes: EXCLUDED_NODE_IDS,
    });
  });
});
