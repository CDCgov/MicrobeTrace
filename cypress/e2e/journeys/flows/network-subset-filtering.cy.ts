/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  assertMetricCount,
  goTo2DNetworkView,
  goToTableView,
  launchProfileToTwoD,
  openGlobalFilteringTab,
} from '../../../support/journey-helpers';
import {
  assertTableDatasetMatchesSession,
  selectTableDataset,
} from '../../../support/table-helpers';

const profile = getProfile('map-color-by-uploaded');

const closeGlobalSettings = (): void => {
  cy.get('#global-settings-modal button.p-dialog-close-button', { timeout: 15000 })
    .click({ force: true });
  cy.get('#global-settings-modal').should('not.be.visible');
};

const assertDatalistIncludes = (selector: string, value: string): void => {
  cy.get(`${selector} option`, { timeout: 15000 }).should(($options) => {
    expect(
      $options.toArray().map((option) => option.getAttribute('value')),
      `${selector} suggestions`
    ).to.include(value);
  });
};

const assertDatalistExcludes = (selector: string, value: string): void => {
  cy.get(`${selector} option`, { timeout: 15000 }).should(($options) => {
    expect(
      $options.toArray().map((option) => option.getAttribute('value')),
      `${selector} suggestions`
    ).not.to.include(value);
  });
};

const applyNodeSubset = (field: string, operator: string, value: string, excludedValue: string): void => {
  openGlobalFilteringTab();
  cy.get('#network-subset-node-field').select(field);
  cy.get('#network-subset-node-operator').select(operator);
  assertDatalistIncludes('#network-subset-node-value-options', value);
  assertDatalistExcludes('#network-subset-node-value-options', excludedValue);
  cy.get('#network-subset-node-value').clear().type(value.slice(0, 4));
  assertDatalistIncludes('#network-subset-node-value-options', value);
  assertDatalistExcludes('#network-subset-node-value-options', excludedValue);
  cy.get('#network-subset-node-value').clear().type(value);
  cy.get('#network-subset-apply').click({ force: true });
  cy.get('#network-subset-active', { timeout: 15000 }).should('contain', field).and('contain', value);
  closeGlobalSettings();
};

const applyLinkSubset = (field: string, operator: string, value: string, excludedValue: string): void => {
  openGlobalFilteringTab();
  cy.get('#network-subset-link-field').select(field);
  cy.get('#network-subset-link-operator').select(operator);
  assertDatalistIncludes('#network-subset-link-value-options', value);
  assertDatalistExcludes('#network-subset-link-value-options', excludedValue);
  cy.get('#network-subset-link-value').clear().type(value.slice(0, 4));
  assertDatalistIncludes('#network-subset-link-value-options', value);
  assertDatalistExcludes('#network-subset-link-value-options', excludedValue);
  cy.get('#network-subset-link-value').clear().type(value);
  cy.get('#network-subset-apply').click({ force: true });
  cy.get('#network-subset-active', { timeout: 15000 }).should('contain', field).and('contain', value);
  closeGlobalSettings();
};

const clearSubset = (): void => {
  openGlobalFilteringTab();
  cy.get('#network-subset-clear').click({ force: true });
  cy.get('#network-subset-active').should('not.exist');
  closeGlobalSettings();
};

describe('Journey Flow - Network subset filtering', () => {
  it('filters visible network data by node and link metadata without changing source data', () => {
    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);

    applyNodeSubset('Profession', 'equals', 'Healthcare', 'Texas');
    cy.get('[data-testid="network-subset-filter-notice"]', { timeout: 15000 })
      .should('contain', 'Subset active')
      .and('contain', 'Healthcare');
    assertMetricCount('#numberOfNodes', 2);
    assertMetricCount('#numberOfVisibleLinks', 1);
    cy.window().should((win: any) => {
      expect(win.commonService.session.data.nodes.length, 'source node count').to.equal(4);
      expect(win.commonService.session.data.links.length, 'source link count').to.equal(4);
      expect(win.commonService.getVisibleNodes().map((node: any) => node._id).sort(), 'visible node ids')
        .to.deep.equal(['A', 'C']);
    });

    goToTableView();
    assertTableDatasetMatchesSession('Node');
    selectTableDataset('Link');
    assertTableDatasetMatchesSession('Link');

    goTo2DNetworkView();
    clearSubset();
    assertMetricCount('#numberOfNodes', 4);
    assertMetricCount('#numberOfVisibleLinks', 4);

    applyLinkSubset('Contact type', 'equals', 'classroom', 'Healthcare');
    assertMetricCount('#numberOfNodes', 3);
    assertMetricCount('#numberOfVisibleLinks', 2);
    cy.window().should((win: any) => {
      expect(win.commonService.getVisibleNodes().map((node: any) => node._id).sort(), 'link subset endpoint nodes')
        .to.deep.equal(['A', 'B', 'D']);
      expect(
        win.commonService.getVisibleLinks().map((link: any) => link['Contact type']).sort(),
        'visible link contact types'
      ).to.deep.equal(['classroom', 'classroom']);
    });

    cy.get('[data-testid="network-subset-filter-clear"]').click({ force: true });
    cy.get('[data-testid="network-subset-filter-notice"]').should('not.exist');
    assertAfterLaunchCounts(profile);
  });
});
