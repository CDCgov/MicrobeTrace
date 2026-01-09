/// <reference types="cypress" />

import { getProfilesByTag } from '../datasets/profile';
import type { DatasetProfile } from '../datasets/profile';

import {
  visitAppAndAcceptEula,
  applyPreLaunchFileSettings,
  launchAndWaitForProcessing,
  goTo2DNetworkView,
  assertAfterLaunchCounts,
  enableGroupingShow,
  assertGroupedByCluster
} from '../../../support/journey-helpers';

describe('Journey Flow - Grouping (basic) - Cluster', () => {
  const profiles = getProfilesByTag('grouping-basic');

  profiles.forEach((profile: DatasetProfile) => {
    it(profile.title, () => {
      visitAppAndAcceptEula();

      cy.loadFiles(profile.files);

      applyPreLaunchFileSettings(profile);

      launchAndWaitForProcessing(60000);

      goTo2DNetworkView();
    //   cy.waitForNetworkToRender(30000);

      assertAfterLaunchCounts(profile);

      enableGroupingShow('cluster');
      assertGroupedByCluster();
    });
  });
});
