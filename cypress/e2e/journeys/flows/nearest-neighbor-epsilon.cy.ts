/// <reference types="cypress" />

import type { DatasetProfile } from '../datasets/profile';
import { getProfilesByTag, resolveExpected } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  assertMetricCount,
  launchProfileToTwoD,
  openGlobalFilteringTab,
  setFilteringEpsilonExponent,
  setFilteringPruneWith,
  waitForProcessingDialogToClear,
} from '../../../support/journey-helpers';

describe('Journey Flow - Nearest Neighbor Epsilon', () => {
  const profiles = getProfilesByTag('nn-epsilon');

  profiles.forEach((profile: DatasetProfile) => {
    it(`${profile.title} and epsilon adds links back in controlled steps`, () => {
      const nn = profile.expectations.nn;
      const epsilon = profile.expectations.filtering?.epsilonAfterNearestNeighbor;
      const afterNearestNeighbor = resolveExpected(nn?.after, 'observed');

      expect(nn, 'nearest neighbor expectation').to.exist;
      expect(afterNearestNeighbor?.visibleLinks, 'visible links after nearest neighbor').to.be.a('number');
      expect(epsilon, 'epsilon expectation').to.exist;
      expect(epsilon?.steps.length, 'epsilon step count').to.be.greaterThan(0);

      launchProfileToTwoD(profile);
      assertAfterLaunchCounts(profile);

      openGlobalFilteringTab();
      cy.get('#filtering-epsilon-row').should('not.be.visible');
      cy.window()
        .its('commonService.session.style.widgets.filtering-epsilon')
        .should((value) => {
          expect(Number(value)).to.equal(epsilon!.fromExponent);
        });

      setFilteringPruneWith('Nearest Neighbor');
      cy.closeGlobalSettings();

      assertMetricCount('#numberOfVisibleLinks', afterNearestNeighbor!.visibleLinks);

      epsilon!.steps.forEach((step) => {
        const expectedAfter = resolveExpected(step.after, 'observed');

        expect(expectedAfter?.visibleLinks, `visible links after epsilon ${step.toExponent}`).to.be.a('number');

        openGlobalFilteringTab();
        setFilteringEpsilonExponent(step.toExponent);
        cy.closeGlobalSettings();

        waitForProcessingDialogToClear();
        assertMetricCount('#numberOfVisibleLinks', expectedAfter!.visibleLinks);
      });
    });
  });
});
