/// <reference types="cypress" />

import type { DatasetProfile } from '../datasets/profile';
import { getProfilesByTag } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  assertTwoDNetworkReady,
  launchProfileToTwoD,
} from '../../../support/journey-helpers';

describe('Journey - upload -> launch -> 2D Network', () => {
  const profiles = getProfilesByTag('load-to-twod');

  profiles.forEach((profile: DatasetProfile) => {
    it(profile.title, () => {
      launchProfileToTwoD(profile);
      assertTwoDNetworkReady();
      assertAfterLaunchCounts(profile);

      cy.window().its('commonService').then((commonService: any) => {
        expect(commonService.session.data.nodes.length, 'nodes loaded').to.be.greaterThan(0);
        expect(commonService.session.data.links.length, 'links loaded').to.be.greaterThan(0);
      });
    });
  });
});
