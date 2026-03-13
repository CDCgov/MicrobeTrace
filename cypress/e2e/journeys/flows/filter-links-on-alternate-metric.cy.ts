/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  launchProfileToTwoD,
  openGlobalFilteringTab,
  setGlobalLinkThreshold,
} from '../../../support/journey-helpers';

const assertVisibleEdgeIds = (expectedEdgeIds: string[]): void => {
  cy.window().should((win: any) => {
    const cyInstance = win.cytoscapeInstance;
    const visibleEdgeIds = cyInstance
      .edges(':visible')
      .map((edge: any) => String(edge.id()))
      .sort() as string[];

    expect(visibleEdgeIds, `visible edge ids`).to.deep.equal(expectedEdgeIds);
  });
};

describe('Journey Flow - Filter Links on alternate uploaded numeric metric', () => {
  const profile = getProfile('filtering-link-sort-alternate-metric');

  it('filters visible links by the selected alternate numeric field instead of distance', () => {
    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);

    assertVisibleEdgeIds(['A-B', 'A-C']);

    openGlobalFilteringTab();

    cy.window().its('commonService.session.style.widgets.link-sort-variable').should('equal', 'distance');

    cy.get('#link-sort-variable').click({ force: true });
    cy.contains('li[role="option"]', 'Score').click({ force: true });

    cy.window().its('commonService.session.style.widgets.link-sort-variable').should('equal', 'score');
    cy.window().its('commonService.GlobalSettingsModel.SelectedLinkSortVariable').should('equal', 'score');

    setGlobalLinkThreshold(0.1);
    cy.closeGlobalSettings();

    cy.get('#link-threshold').should('have.value', '0.1');
    cy.get('#numberOfVisibleLinks').should('contain.text', '1');

    assertVisibleEdgeIds(['C-D']);
  });
});
