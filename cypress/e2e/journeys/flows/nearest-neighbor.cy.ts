/// <reference types="cypress" />

import type { DatasetProfile } from '../datasets/profile';
import { getProfilesByTag, resolveExpected } from '../datasets/profile';
import {
  launchProfileToTwoD,
  readMetricCount,
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

      readMetricCount('#numberOfVisibleLinks').should('equal', before!.visibleLinks);

      cy.openGlobalSettings();
      cy.contains('#global-settings-modal .nav-link', 'Filtering').click();
      cy.get('#prune-select').contains('span', 'Nearest Neighbor').click({ force: true });
      cy.window().its('commonService.session.style.widgets.link-show-nn').should('equal', true);
      cy.closeGlobalSettings();

      readMetricCount('#numberOfVisibleLinks').should('equal', after!.visibleLinks);
    });
  });
});
