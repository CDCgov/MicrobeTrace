/// <reference types="cypress" />

import type { DatasetProfile } from '../datasets/profile';
import { getProfilesByTag, resolveExpected } from '../datasets/profile';
import {
  assertMetricCount,
  launchProfileToTwoD,
  openGlobalFilteringTab,
  setFilteringPruneWith,
} from '../../../support/journey-helpers';

describe('Journey Flow - Nearest Neighbor', () => {
  const profiles = getProfilesByTag('nn');

  profiles.forEach((profile: DatasetProfile) => {
    it(profile.title, () => {
      const nn = profile.expectations.nn;
      const before = resolveExpected(nn?.before, 'observed');
      const after = resolveExpected(nn?.after, 'observed');
      expect(nn, 'nearest neighbor expectation').to.exist;
      expect(before, 'observed nearest neighbor baseline').to.exist;
      expect(after, 'observed nearest neighbor post-condition').to.exist;

      launchProfileToTwoD(profile);

      assertMetricCount('#numberOfVisibleLinks', before!.visibleLinks);

      openGlobalFilteringTab();
      setFilteringPruneWith('Nearest Neighbor');
      cy.closeGlobalSettings();

      assertMetricCount('#numberOfVisibleLinks', after!.visibleLinks);
    });
  });
});
