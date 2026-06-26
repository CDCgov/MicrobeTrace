/// <reference types="cypress" />

import type { DatasetProfile } from '../datasets/profile';
import { getProfile } from '../datasets/profile';
import {
  applyPreLaunchFileSettings,
  assertEpiCurveReady,
  assertSessionAfterLaunchCounts,
  ensurePreLaunchProfileSynced,
  launchAndWaitForProcessing,
  openEpiCurveSettingsDialog,
  visitAppAndAcceptEula,
} from '../../../support/journey-helpers';
import {
  assertEpiCurveHasBars,
  selectEpiCurveDropdown,
} from '../../../support/epi-curve-helpers';

const asDirectEpiCurveProfile = (profile: DatasetProfile): DatasetProfile => ({
  ...profile,
  preLaunch: {
    ...profile.preLaunch,
    defaultView: 'Epi Curve',
  },
});

const launchProfileDirectToEpiCurve = (profile: DatasetProfile): void => {
  visitAppAndAcceptEula();
  cy.loadFiles(profile.files);
  applyPreLaunchFileSettings(profile);
  ensurePreLaunchProfileSynced(profile);
  launchAndWaitForProcessing(60000);
  assertEpiCurveReady();
};

describe('Journey Flow - Epi Curve direct launch on uploaded data', () => {
  const profile = asDirectEpiCurveProfile(getProfile('timeline-covid-node-link'));

  it('launches uploaded node and link data directly into an interactive Epi Curve', () => {
    launchProfileDirectToEpiCurve(profile);
    assertSessionAfterLaunchCounts(profile);

    cy.window()
      .its('commonService.session.style.widgets.default-view')
      .should('equal', 'Epi Curve');

    openEpiCurveSettingsDialog();
    selectEpiCurveDropdown('Date Field', 'Date of symptom onset Date');
    assertEpiCurveHasBars();

    cy.get('#epiCurveSVG text.x.label').should('contain.text', 'Date');
    cy.get('#epiCurveSVG text.y.label').should('contain.text', 'Number of Cases');

    cy.closeSettingsPane('Epi Curve Settings');
  });
});
