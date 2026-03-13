/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  applyStyleFromProfile,
  assertAfterLaunchCounts,
  assertStyleTablesFromProfile,
  assertVisibleStylePreserved,
  launchProfileToTwoD,
  openGlobalFilteringTab,
  readMetricCount,
  snapshotVisibleStyles,
} from '../../../support/journey-helpers';
import type { StyleSnapshot } from '../../../support/journey-helpers';
import { byTestId, testIds } from '../../../support/selectors';

describe('Journey Flow - Style survives Minimum Cluster Size filtering', () => {
  const profile = getProfile('style-apply-cypress-test-style');

  it('preserves node and link styling after filter changes and after reveal', () => {
    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    applyStyleFromProfile(profile);
    cy.closeGlobalSettings();
    assertStyleTablesFromProfile(profile);

    snapshotVisibleStyles().as('preFilterStyles');

    let launchNodeCount = 0;
    let launchLinkCount = 0;

    readMetricCount('#numberOfNodes').then((count) => {
      launchNodeCount = count;
    });

    readMetricCount('#numberOfVisibleLinks').then((count) => {
      launchLinkCount = count;
    });

    openGlobalFilteringTab();
    cy.get(byTestId(testIds.filterMinimumClusterSize)).clear().type('2').blur();
    cy.window().its('commonService.session.style.widgets.cluster-minimum-size').should('equal', 2);
    cy.closeGlobalSettings();
    assertStyleTablesFromProfile(profile);

    readMetricCount('#numberOfNodes').then((filteredNodeCount) => {
      expect(filteredNodeCount, 'nodes reduced after minimum cluster filtering').to.be.lessThan(launchNodeCount);
    });

    readMetricCount('#numberOfVisibleLinks').then((filteredLinkCount) => {
      expect(filteredLinkCount, 'links not increased after minimum cluster filtering').to.be.at.most(launchLinkCount);
    });

    snapshotVisibleStyles().then((afterFilter) => {
      cy.get<StyleSnapshot>('@preFilterStyles').then((before) => {
        assertVisibleStylePreserved(before, afterFilter);
      });
    });

    openGlobalFilteringTab();
    cy.get(byTestId(testIds.filterRevealEverything)).click({ force: true });
    cy.closeGlobalSettings();
    assertStyleTablesFromProfile(profile);

    readMetricCount('#numberOfNodes').then((revealedNodeCount) => {
      expect(revealedNodeCount, 'nodes restored after reveal').to.equal(launchNodeCount);
    });

    readMetricCount('#numberOfVisibleLinks').then((revealedLinkCount) => {
      expect(revealedLinkCount, 'links restored after reveal').to.equal(launchLinkCount);
    });

    snapshotVisibleStyles().then((afterReveal) => {
      cy.get<StyleSnapshot>('@preFilterStyles').then((before) => {
        assertVisibleStylePreserved(before, afterReveal);
      });
    });
  });
});
