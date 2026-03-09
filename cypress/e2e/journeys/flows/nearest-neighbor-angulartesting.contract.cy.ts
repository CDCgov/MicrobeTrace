/// <reference types="cypress" />

import type { DatasetProfile } from '../datasets/profile';
import { getProfilesByTags, resolveExpected } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  launchProfileToTwoD,
  readMetricCount,
  setTwoDLinkLabelVariable,
} from '../../../support/journey-helpers';

const contractMode =
  Cypress.env('contractMode') === true ||
  Cypress.env('contractMode') === '1' ||
  Cypress.env('contractMode') === 1;

(contractMode ? describe : describe.skip)('Journey Contracts - AngularTesting Nearest Neighbor', () => {
  const profiles = getProfilesByTags(['nn-contract', 'angulartesting']);

  profiles.forEach((profile: DatasetProfile) => {
    it(profile.title, () => {
      const nn = profile.expectations.nn;
      const labelLinksWith = nn?.labelLinksWith ?? 'distance';
      const before = resolveExpected(nn?.before, 'intended');
      const after = resolveExpected(nn?.after, 'intended');

      expect(nn, 'nearest neighbor contract').to.exist;
      expect(before?.visibleLinks, 'intended visible links before nearest neighbor').to.be.a('number');
      expect(after?.visibleLinks, 'intended visible links after nearest neighbor').to.be.a('number');

      launchProfileToTwoD(profile);

      cy.window()
        .its('commonService.session.style.widgets.default-distance-metric')
        .should('equal', profile.preLaunch.metric);
      cy.window()
        .its('commonService.session.style.widgets.link-threshold')
        .should('equal', profile.preLaunch.threshold);

      assertAfterLaunchCounts(profile, 'intended');
      readMetricCount('#numberOfVisibleLinks').should('equal', before!.visibleLinks);

      setTwoDLinkLabelVariable(labelLinksWith);
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
