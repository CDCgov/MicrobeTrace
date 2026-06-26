/// <reference types="cypress" />

import type { DatasetProfile } from '../datasets/profile';
import { getProfilesByTag } from '../datasets/profile';
import {
  applyPreLaunchFileSettings,
  assertHeatmapMatchesBackingMatrix,
  assertHeatmapReady,
  assertSessionAfterLaunchCounts,
  ensurePreLaunchProfileSynced,
  launchAndWaitForProcessing,
  visitAppAndAcceptEula,
} from '../../../support/journey-helpers';

const asDirectHeatmapProfile = (profile: DatasetProfile): DatasetProfile => ({
  ...profile,
  preLaunch: {
    ...profile.preLaunch,
    defaultView: 'Heatmap',
  },
});

const launchProfileDirectToHeatmap = (profile: DatasetProfile): void => {
  visitAppAndAcceptEula();
  cy.loadFiles(profile.files);
  applyPreLaunchFileSettings(profile);
  ensurePreLaunchProfileSynced(profile);
  launchAndWaitForProcessing(120000);
  assertHeatmapReady(120000);
};

describe('Journey Flow - Heatmap direct launch uploaded-data smoke matrix', () => {
  const profiles = getProfilesByTag('load-to-heatmap');

  profiles.forEach((baseProfile: DatasetProfile) => {
    const profile = asDirectHeatmapProfile(baseProfile);

    it(`${baseProfile.title} via direct launch`, () => {
      launchProfileDirectToHeatmap(profile);
      assertSessionAfterLaunchCounts(profile);

      cy.window()
        .its('commonService.session.style.widgets.default-view')
        .should('equal', 'Heatmap');

      assertHeatmapMatchesBackingMatrix({
        metric: profile.preLaunch.metric,
      });
    });
  });
});
