/// <reference types="cypress" />

import type { DatasetProfile } from '../datasets/profile';
import { getProfilesByTags } from '../datasets/profile';
import {
  assertNetworkMatchesOracleSnapshot,
  computeOracleForProfile,
  getOracleSnapshot,
  launchProfileToTwoD,
  openGlobalFilteringTab,
  setFilteringPruneWith,
  setTwoDLinkLabelVariable,
} from '../../../support/journey-helpers';
import type { OracleStep } from '../../../oracle/types';

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

      expect(nn, 'nearest neighbor contract').to.exist;

      const oracleSteps: OracleStep[] = [
        {
          id: 'after-nn',
          kind: 'set-nearest-neighbor',
          enabled: true,
        },
      ];
      computeOracleForProfile(profile, oracleSteps);

      launchProfileToTwoD(profile);

      cy.window()
        .its('commonService.session.style.widgets.default-distance-metric')
        .should('equal', profile.preLaunch.metric);
      cy.window()
        .its('commonService.session.style.widgets.link-threshold')
        .should('equal', profile.preLaunch.threshold);

      getOracleSnapshot().then((snapshot) => {
        assertNetworkMatchesOracleSnapshot(snapshot);
      });

      setTwoDLinkLabelVariable(labelLinksWith);
      getOracleSnapshot().then((snapshot) => {
        assertNetworkMatchesOracleSnapshot(snapshot);
      });

      openGlobalFilteringTab();
      setFilteringPruneWith('Nearest Neighbor');
      cy.closeGlobalSettings();

      getOracleSnapshot('oracleResult', 'after-nn').then((snapshot) => {
        assertNetworkMatchesOracleSnapshot(snapshot);
      });
    });
  });
});
