/// <reference types="cypress" />

import {
  DATASET_PROFILES,
  hasExpectedDeviation,
  resolveExpected,
  type DatasetProfile,
} from '../datasets/profile';
import {
  applyTwoDGroupingFromProfile,
  launchProfileToTwoD,
  readMetricCount,
} from '../../../support/journey-helpers';

const contractMode =
  Cypress.env('contractMode') === true ||
  Cypress.env('contractMode') === '1' ||
  Cypress.env('contractMode') === 1;

(contractMode ? describe : describe.skip)('Journey Contracts - Intended Behavior', () => {
  const thresholdProfiles = DATASET_PROFILES.filter((profile: DatasetProfile) =>
    hasExpectedDeviation(profile.expectations.grouping?.thresholdChange?.expectedVisibleLinksAfter),
  );

  thresholdProfiles.forEach((profile: DatasetProfile) => {
    it(`${profile.title} applies the intended threshold behavior`, () => {
      const thresholdChange = profile.expectations.grouping?.thresholdChange;
      const intendedVisibleLinksAfter = resolveExpected(
        thresholdChange?.expectedVisibleLinksAfter,
        'intended',
      );

      expect(thresholdChange, 'threshold change contract').to.exist;
      expect(intendedVisibleLinksAfter, 'intended visible links after threshold change').to.be.a('number');

      launchProfileToTwoD(profile);
      applyTwoDGroupingFromProfile(profile);

      cy.openGlobalSettings();
      cy.contains('#global-settings-modal .nav-link', 'Filtering').click();
      cy.get('#link-threshold').clear().type(String(thresholdChange!.to)).blur();
      cy.window().its('commonService.session.style.widgets.link-threshold').should('equal', thresholdChange!.to);
      cy.closeGlobalSettings();

      cy.wait(1200);
      readMetricCount('#numberOfVisibleLinks').should('equal', intendedVisibleLinksAfter);
    });
  });
});
