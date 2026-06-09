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

  const setMinimumClusterSize = (value: number): void => {
    cy.get(byTestId(testIds.filterMinimumClusterSize))
      .should('be.visible')
      .then(($input) => {
        const input = $input.get(0) as HTMLInputElement;

        input.focus();
        input.value = String(value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.blur();
      });
  };

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
    setMinimumClusterSize(2);
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
