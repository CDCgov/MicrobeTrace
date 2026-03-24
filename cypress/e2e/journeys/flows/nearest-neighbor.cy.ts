/// <reference types="cypress" />

import type { DatasetProfile } from '../datasets/profile';
import { getProfilesByTag } from '../datasets/profile';
import {
  assertNetworkMatchesOracleSnapshot,
  computeOracleForProfile,
  getOracleSnapshot,
  launchProfileToTwoD,
  openGlobalFilteringTab,
  setFilteringPruneWith,
} from '../../../support/journey-helpers';
import type { OracleStep } from '../../../oracle/types';

describe('Journey Flow - Nearest Neighbor', () => {
  const profiles = getProfilesByTag('nn');

  profiles.forEach((profile: DatasetProfile) => {
    it(profile.title, () => {
      const nn = profile.expectations.nn;
      expect(nn, 'nearest neighbor expectation').to.exist;

      const oracleSteps: OracleStep[] = [
        {
          id: 'after-nn',
          kind: 'set-nearest-neighbor',
          enabled: true,
        },
      ];
      computeOracleForProfile(profile, oracleSteps);

      launchProfileToTwoD(profile);

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
