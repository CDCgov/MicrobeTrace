/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  assertMetricCount,
  goTo2DNetworkView,
  goToTableView,
  launchProfileToTwoD,
  openGlobalFilteringTab,
  setGlobalLinkThreshold,
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

const getEndpointId = (endpoint: any): string =>
  String(
    endpoint && typeof endpoint === 'object'
      ? endpoint._id ?? endpoint.id ?? endpoint.data?.id
      : endpoint
  );

const assertVisibleGraph = (nodeIds: string[], linkIds: string[]): void => {
  const expectedNodeIds = [...nodeIds].sort();
  const expectedLinkIds = [...linkIds].sort();

  assertMetricCount('#numberOfNodes', expectedNodeIds.length);
  assertMetricCount('#numberOfVisibleLinks', expectedLinkIds.length);

  cy.window({ timeout: 15000 }).should((win: any) => {
    expect(
      win.commonService.getVisibleNodes().map((node: any) => String(node._id)).sort(),
      'visible node ids'
    ).to.deep.equal(expectedNodeIds);
    expect(
      win.commonService.getVisibleLinks().map((link: any) =>
        `${getEndpointId(link.source)}-${getEndpointId(link.target)}`
      ).sort(),
      'visible link ids'
    ).to.deep.equal(expectedLinkIds);
  });
};

const setSubsetRuleField = (
  target: 'node' | 'link',
  field: string,
  preservedValue?: string
): void => {
  openGlobalFilteringTab();
  cy.get(`#network-subset-${target}-field`).select(field);
  if (preservedValue !== undefined) {
    cy.get(`#network-subset-${target}-value`).should('have.value', preservedValue);
  }
  cy.get('#network-subset-apply').click({ force: true });
  cy.window().should((win: any) => {
    const rule = win.commonService.session.state.networkSubsetFilter[target];
    expect(rule.enabled, `${target} subset enabled`).to.equal(field !== 'None');
    expect(rule.field, `${target} subset field`).to.equal(field);
  });
  closeGlobalSettings();
};

const setLinkThreshold = (threshold: number): void => {
  openGlobalFilteringTab();
  setGlobalLinkThreshold(threshold);
  closeGlobalSettings();
};

const setMinimumClusterSize = (minimumSize: number): void => {
  openGlobalFilteringTab();
  cy.get('[data-testid="filter-minimum-cluster-size"]')
    .scrollIntoView()
    .then(($input) => {
      const input = $input.get(0) as HTMLInputElement;
      input.value = String(minimumSize);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  cy.window()
    .its('commonService.session.style.widgets.cluster-minimum-size')
    .should('equal', minimumSize);
  closeGlobalSettings();
};

const revealEverything = (): void => {
  openGlobalFilteringTab();
  cy.get('[data-testid="filter-reveal-everything"]').click({ force: true });
  cy.get('#network-subset-active').should('not.exist');
  cy.window().should((win: any) => {
    const subset = win.commonService.session.state.networkSubsetFilter;
    expect(subset.node.enabled, 'node subset disabled').to.equal(false);
    expect(subset.link.enabled, 'link subset disabled').to.equal(false);
    expect(
      win.commonService.session.style.widgets['cluster-minimum-size'],
      'minimum cluster size reset'
    ).to.equal(1);
  });
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

  it('keeps combined node and link rules coherent across toggles, thresholds, views, and resets', () => {
    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);

    applyNodeSubset('Node type', 'equals', 'Person', 'classroom');
    applyLinkSubset('Contact type', 'equals', 'classroom', 'Person');
    assertVisibleGraph(['A', 'B'], ['A-B']);

    setSubsetRuleField('node', 'None');
    assertVisibleGraph(['A', 'B', 'D'], ['A-B', 'B-D']);

    setSubsetRuleField('node', 'Node type', 'Person');
    assertVisibleGraph(['A', 'B'], ['A-B']);

    setSubsetRuleField('link', 'None');
    assertVisibleGraph(['A', 'B', 'C'], ['A-B', 'A-C']);

    setSubsetRuleField('link', 'Contact type', 'classroom');
    assertVisibleGraph(['A', 'B'], ['A-B']);

    setLinkThreshold(4);
    assertVisibleGraph(['A', 'B'], []);

    setLinkThreshold(6);
    assertVisibleGraph(['A', 'B'], ['A-B']);

    goToTableView();
    assertTableDatasetMatchesSession('Node');
    selectTableDataset('Link');
    assertTableDatasetMatchesSession('Link');

    goTo2DNetworkView();
    assertVisibleGraph(['A', 'B'], ['A-B']);

    setLinkThreshold(16);
    setMinimumClusterSize(3);
    assertVisibleGraph([], []);

    revealEverything();
    cy.get('[data-testid="network-subset-filter-notice"]').should('not.exist');
    assertVisibleGraph(['A', 'B', 'C', 'D'], ['A-B', 'A-C', 'B-D', 'C-D']);

    applyNodeSubset('Node type', 'equals', 'Person', 'classroom');
    applyLinkSubset('Contact type', 'equals', 'classroom', 'Person');
    setLinkThreshold(6);
    assertVisibleGraph(['A', 'B'], ['A-B']);

    clearSubset();
    cy.get('[data-testid="network-subset-filter-notice"]').should('not.exist');
    assertVisibleGraph(['A', 'B', 'C', 'D'], ['A-B']);

    goToTableView();
    assertTableDatasetMatchesSession('Link');
    selectTableDataset('Node');
    assertTableDatasetMatchesSession('Node');
    selectTableDataset('Link');
    assertTableDatasetMatchesSession('Link');

    goTo2DNetworkView();
    assertVisibleGraph(['A', 'B', 'C', 'D'], ['A-B']);
  });
});
