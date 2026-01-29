/// <reference types="cypress" />

import { getProfilesByTag } from '../datasets/profile';
import type { DatasetProfile } from '../datasets/profile';

import {
  visitAppAndAcceptEula,
  launchAndWaitForProcessing,
  goTo2DNetworkView,
  assertAfterLaunchCounts,
  enableGroupingShow,
  assertGroupedByCluster,
  applyPreLaunchSessionSettings,
  applyTwoDGroupingFromProfile,
  assertGroupingMembershipFromProfile
} from '../../../support/journey-helpers';

describe('Journey Flow - Grouping (basic) - Cluster', () => {
  const profiles = getProfilesByTag('grouping-basic');

  profiles.forEach((profile: DatasetProfile) => {
    it(profile.title, () => {
      visitAppAndAcceptEula();

      cy.loadFiles(profile.files);

      applyPreLaunchSessionSettings(profile);

      launchAndWaitForProcessing(60000);

      goTo2DNetworkView();

      assertAfterLaunchCounts(profile);

      // Either keep the old explicit calls...
      enableGroupingShow('cluster');
      assertGroupedByCluster();
      assertGroupingMembershipFromProfile(profile);

      // ...or let the profile drive grouping behavior (including colors/labels):
      // applyTwoDGroupingFromProfile(profile);
    });
  });
});
