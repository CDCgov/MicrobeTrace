/// <reference types="cypress" />

import type { DatasetProfile } from '../datasets/profile';
import { getProfilesByTag } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  assertHeatmapMatchesBackingMatrix,
  launchProfileToHeatmap,
} from '../../../support/journey-helpers';

describe('Journey - upload -> launch -> Heatmap', () => {
  const profiles = getProfilesByTag('load-to-heatmap');

  profiles.forEach((profile: DatasetProfile) => {
    it(profile.title, () => {
      launchProfileToHeatmap(profile);
      assertAfterLaunchCounts(profile);
      assertHeatmapMatchesBackingMatrix({
        metric: profile.preLaunch.metric,
      });
    });
  });
});
