/// <reference types="cypress" />

import type { DatasetProfile } from '../datasets/profile';
import { getProfilesByTag } from '../datasets/profile';
import {
  assertNetworkMatchesOracleSnapshot,
  computeOracleForProfile,
  getOracleSnapshot,
  launchProfileToTwoD,
  openGlobalFilteringTab,
  setFilteringEpsilonExponent,
  setFilteringPruneWith,
  waitForProcessingDialogToClear,
} from '../../../support/journey-helpers';
import type { OracleStep } from '../../../oracle/types';

describe('Journey Flow - Nearest Neighbor Epsilon', () => {
  const profiles = getProfilesByTag('nn-epsilon');

  profiles.forEach((profile: DatasetProfile) => {
    it(`${profile.title} and epsilon adds links back in controlled steps`, () => {
      const nn = profile.expectations.nn;
      const epsilon = profile.expectations.filtering?.epsilonAfterNearestNeighbor;

      expect(nn, 'nearest neighbor expectation').to.exist;
      expect(epsilon, 'epsilon expectation').to.exist;
      expect(epsilon?.steps.length, 'epsilon step count').to.be.greaterThan(0);

      const oracleSteps: OracleStep[] = [
        {
          id: 'after-nn',
          kind: 'set-nearest-neighbor',
          enabled: true,
        },
        ...epsilon!.steps.map((step, index) => ({
          id: `epsilon-step-${index}`,
          kind: 'set-epsilon' as const,
          exponent: step.toExponent,
        })),
      ];
      computeOracleForProfile(profile, oracleSteps);

      launchProfileToTwoD(profile);
      getOracleSnapshot().then((snapshot) => {
        assertNetworkMatchesOracleSnapshot(snapshot);
      });

      openGlobalFilteringTab();
      cy.get('#filtering-epsilon-row').should('not.be.visible');
      cy.window()
        .its('commonService.session.style.widgets.filtering-epsilon')
        .should((value) => {
          expect(Number(value)).to.equal(epsilon!.fromExponent);
        });

      setFilteringPruneWith('Nearest Neighbor');
      cy.closeGlobalSettings();

      getOracleSnapshot('oracleResult', 'after-nn').then((snapshot) => {
        assertNetworkMatchesOracleSnapshot(snapshot);
      });

      epsilon!.steps.forEach((step, index) => {
        openGlobalFilteringTab();
        setFilteringEpsilonExponent(step.toExponent);
        cy.closeGlobalSettings();

        waitForProcessingDialogToClear();
        getOracleSnapshot('oracleResult', `epsilon-step-${index}`).then((snapshot) => {
          assertNetworkMatchesOracleSnapshot(snapshot);
        });
      });
    });
  });
});
