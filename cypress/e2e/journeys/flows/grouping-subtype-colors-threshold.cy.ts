/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  applyTwoDGroupingFromProfile,
  assertAfterLaunchCounts,
  launchProfileToTwoD,
  readMetricCount,
} from '../../../support/journey-helpers';

type ParentSnapshot = {
  id: string;
  label: string;
  color: string;
  childCount: number;
};

describe('Journey Flow - Grouping Subtype Colors and Threshold', () => {
  const profile = getProfile('grouping-tn93-sequences-subtype-colors-threshold');

  const snapshotParentGroups = (): Cypress.Chainable<ParentSnapshot[]> => {
    return cy.window().then((win: any) => {
      const cyInstance = win.cytoscapeInstance;
      const parents = cyInstance.nodes('.parent');

      return parents
        .map((parentNode: any) => ({
          id: String(parentNode.id()),
          label: String(parentNode.style('label') || ''),
          color: String(parentNode.style('background-color') || '').replace(/\s+/g, ''),
          childCount: parentNode.children().length,
        }))
        .sort((a: ParentSnapshot, b: ParentSnapshot) => a.id.localeCompare(b.id));
    });
  };

  it(profile.title, () => {
    const thresholdChange = profile.expectations.grouping?.thresholdChange;

    expect(thresholdChange, 'threshold change expectation').to.exist;

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    applyTwoDGroupingFromProfile(profile);

    snapshotParentGroups().as('initialParentGroups');

    cy.openGlobalSettings();
    cy.contains('#global-settings-modal .nav-link', 'Filtering').click();
    cy.get('#link-threshold').clear().type(String(thresholdChange!.to)).blur();
    cy.window().its('commonService.session.style.widgets.link-threshold').should('equal', thresholdChange!.to);
    cy.closeGlobalSettings();

    readMetricCount('#numberOfVisibleLinks').should('equal', thresholdChange!.expectedVisibleLinksAfter as number);

    cy.get('@initialParentGroups').then((initialParentGroups) => {
      snapshotParentGroups().should((currentParentGroups) => {
        expect(currentParentGroups).to.deep.equal(initialParentGroups);
      });
    });
  });
});
