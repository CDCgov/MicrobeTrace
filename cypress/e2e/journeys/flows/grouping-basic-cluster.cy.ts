/// <reference types="cypress" />

import { getProfilesByTag } from '../datasets/profile';
import type { DatasetProfile } from '../datasets/profile';

import {
  assertAfterLaunchCounts,
  enableGroupingShow,
  assertGroupedByCluster,
  assertGroupingMembershipFromProfile,
  launchProfileToTwoD,
} from '../../../support/journey-helpers';

describe('Journey Flow - Grouping (basic) - Cluster', () => {
  const profiles = getProfilesByTag('grouping-basic');

  profiles.forEach((profile: DatasetProfile) => {
    it(profile.title, () => {
      launchProfileToTwoD(profile);
      assertAfterLaunchCounts(profile);

      enableGroupingShow('cluster');
      assertGroupedByCluster();
      assertGroupingMembershipFromProfile(profile);
    });
  });
});
