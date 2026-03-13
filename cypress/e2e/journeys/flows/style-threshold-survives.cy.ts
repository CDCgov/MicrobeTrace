/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  applyStyleFromProfile,
  assertAfterLaunchCounts,
  assertMetricCount,
  assertStyleTablesFromProfile,
  assertStyleWidgetsFromProfile,
  assertVisibleStylePreserved,
  launchProfileToTwoD,
  openGlobalFilteringTab,
  snapshotVisibleStyles,
} from '../../../support/journey-helpers';
import type { StyleSnapshot } from '../../../support/journey-helpers';

describe('Journey Flow - Style survives threshold filtering', () => {
  const profile = getProfile('style-apply-cypress-test-style-threshold');
  const filteredThreshold = 0.1;
  const expectedVisibleLinksAfterThreshold = 7;

  const assertDegreeSizingStillFollowsVisibleDegrees = (): void => {
    cy.window().then((win: any) => {
      const cyInstance = win.cytoscapeInstance;
      const rankedByDegree = cyInstance
        .nodes()
        .filter((node: any) => !node.hasClass('parent') && node.visible())
        .map((node: any) => ({
          id: String(node.id()),
          degree: Number(node.data('degree') ?? 0),
          width: parseFloat(String(node.style('width'))),
        }))
        .sort((a: any, b: any) => a.degree - b.degree);

      expect(rankedByDegree.length, 'visible nodes available for degree sizing').to.be.greaterThan(1);

      const smallest = rankedByDegree[0];
      const largest = rankedByDegree[rankedByDegree.length - 1];

      expect(largest.degree, 'visible degree range after threshold').to.be.greaterThan(smallest.degree);
      expect(largest.width, 'higher visible degree still renders larger after threshold').to.be.greaterThan(smallest.width);
    });
  };

  it('preserves rendered style mappings after the visible link set changes', () => {
    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    applyStyleFromProfile(profile);
    cy.closeGlobalSettings();
    assertStyleTablesFromProfile(profile);

    snapshotVisibleStyles().as('preThresholdStyles');

    openGlobalFilteringTab();
    cy.get('#link-threshold').clear().type(String(filteredThreshold)).blur();
    cy.window()
      .its('commonService.session.style.widgets.link-threshold')
      .should((value) => {
        expect(Number(value)).to.equal(filteredThreshold);
      });
    cy.closeGlobalSettings();

    assertMetricCount('#numberOfVisibleLinks', expectedVisibleLinksAfterThreshold);
    assertStyleWidgetsFromProfile(profile);
    assertStyleTablesFromProfile(profile);
    assertDegreeSizingStillFollowsVisibleDegrees();

    snapshotVisibleStyles().then((afterThreshold) => {
      expect(Object.keys(afterThreshold.edges), 'visible styled edges after threshold').to.have.length(expectedVisibleLinksAfterThreshold);

      cy.get<StyleSnapshot>('@preThresholdStyles').then((before) => {
        assertVisibleStylePreserved(before, afterThreshold, { ignoreNodeWidths: true });
      });
    });
  });
});
