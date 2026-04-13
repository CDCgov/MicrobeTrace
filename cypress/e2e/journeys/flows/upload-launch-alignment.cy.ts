/// <reference types="cypress" />

import type { DatasetProfile } from '../datasets/profile';
import { getProfilesByTag } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  assertAlignmentState,
  launchProfileToAlignment,
} from '../../../support/journey-helpers';

describe('Journey - upload -> launch -> Alignment View', () => {
  const profiles = getProfilesByTag('load-to-alignment');

  profiles.forEach((profile: DatasetProfile) => {
    it(profile.title, () => {
      launchProfileToAlignment(profile);
      assertAfterLaunchCounts(profile);
      assertAlignmentState(profile);
    });
  });
});
