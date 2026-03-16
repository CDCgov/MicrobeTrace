/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  applyStyleFromProfile,
  assertAfterLaunchCounts,
  assertGroupedByCluster,
  assertStyleTablesFromProfile,
  assertVisibleStylePreserved,
  enableGroupingShow,
  launchProfileToTwoD,
  snapshotVisibleStyles,
} from '../../../support/journey-helpers';
import type { StyleSnapshot } from '../../../support/journey-helpers';

describe('Journey Flow - Style survives grouping', () => {
  const profile = getProfile('style-apply-cypress-test-style');

  it('preserves child-node and link styling after cluster grouping is enabled', () => {
    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    applyStyleFromProfile(profile);
    cy.closeGlobalSettings();
    assertStyleTablesFromProfile(profile);

    snapshotVisibleStyles().as('preGroupingStyles');

    enableGroupingShow('cluster');
    assertGroupedByCluster();
    assertStyleTablesFromProfile(profile);

    snapshotVisibleStyles().then((afterGrouping) => {
      expect(Object.keys(afterGrouping.nodes), 'visible styled child nodes after grouping').to.have.length.greaterThan(0);
      expect(Object.keys(afterGrouping.edges), 'visible styled edges after grouping').to.have.length.greaterThan(0);

      cy.get<StyleSnapshot>('@preGroupingStyles').then((before) => {
        assertVisibleStylePreserved(before, afterGrouping);
      });
    });
  });
});
