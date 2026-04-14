/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  addAggregateTable,
  assertAggregateTableCount,
  assertAggregateTableHeaders,
  assertAggregateTableMatchesModel,
  getAggregateFieldOption,
  readRenderedAggregateRows,
  selectAggregateField,
} from '../../../support/aggregate-helpers';
import {
  assertAfterLaunchCounts,
  assertAggregateReady,
  goToAggregateView,
  launchProfileToTwoD,
  openAggregateSettingsDialog,
  openGlobalFilteringTab,
  setGlobalLinkThreshold,
  waitForProcessingDialogToClear,
} from '../../../support/journey-helpers';
import { byTestId, testIds } from '../../../support/selectors';

describe('Journey Flow - Aggregate uploaded controls and reactivity', () => {
  const clusteredProfile = getProfile('filtering-min-cluster-reveal-epi-linklist');
  const categoricalProfile = getProfile('color-by-uploaded-categorical');
  const alternateMetricProfile = getProfile('filtering-link-sort-alternate-metric');

  it('renders Cluster dataset aggregate tables for uploaded clustered data', () => {
    launchProfileToTwoD(clusteredProfile);
    assertAfterLaunchCounts(clusteredProfile);

    goToAggregateView();
    assertAggregateReady();

    openAggregateSettingsDialog();
    addAggregateTable();

    getAggregateFieldOption('Cluster-nodes').then((option) => {
      selectAggregateField(1, option.shortLabel, option.value);
    });

    cy.closeSettingsPane('Aggregate Settings');

    assertAggregateTableCount(2);
    assertAggregateTableMatchesModel(0, 'Node-cluster');
    assertAggregateTableMatchesModel(1, 'Cluster-nodes');
    assertAggregateTableHeaders(1, ['Nodes', 'Number of Clusters', 'Percent of Total Clusters']);

    readRenderedAggregateRows(1).then((rows) => {
      expect(rows, 'cluster aggregate row count').to.have.length(3);
      expect(rows.map((row) => row.groupName), 'cluster size groups').to.deep.equal(['2', '3', '5']);
    });
  });

  it('supports additional uploaded Cluster fields beyond the default cluster size smoke', () => {
    launchProfileToTwoD(clusteredProfile);
    assertAfterLaunchCounts(clusteredProfile);

    goToAggregateView();
    assertAggregateReady();

    openAggregateSettingsDialog();
    addAggregateTable();

    getAggregateFieldOption('Cluster-links').then((option) => {
      selectAggregateField(1, option.shortLabel, option.value);
    });

    cy.closeSettingsPane('Aggregate Settings');

    assertAggregateTableCount(2);
    assertAggregateTableMatchesModel(0, 'Node-cluster');
    assertAggregateTableMatchesModel(1, 'Cluster-links');
    assertAggregateTableHeaders(1, ['Links', 'Number of Clusters', 'Percent of Total Clusters']);

    readRenderedAggregateRows(1).then((rows) => {
      expect(rows, 'cluster link-count aggregate row count').to.have.length(3);
      expect(rows.map((row) => row.groupName), 'cluster link-count groups').to.deep.equal(['1', '2', '4']);
    });
  });

  it('keeps Aggregate field options limited to user-facing uploaded and derived fields', () => {
    launchProfileToTwoD(categoricalProfile);
    assertAfterLaunchCounts(categoricalProfile);

    goToAggregateView();
    assertAggregateReady();
    openAggregateSettingsDialog();

    cy.window()
      .its('commonService.visuals.aggregate.fieldOptions')
      .should((fieldOptions: Array<{ label: string; items: Array<{ value: string }> }>) => {
        const groups = Object.fromEntries(
          fieldOptions.map((group) => [group.label, group.items.map((item) => String(item.value))]),
        ) as Record<string, string[]>;

        expect(Object.keys(groups).sort(), 'aggregate option groups').to.deep.equal(['Cluster', 'Link', 'Node']);

        expect(groups.Node, 'Node fields').to.include.members([
          'Node-cluster',
          'Node-selected',
          'Node-degree',
          'Node-Node type',
        ]);
        expect(groups.Node, 'Node internal exclusions').not.to.include.members([
          'Node-seq',
          'Node-origin',
          'Node-_diff',
          'Node-_ambiguity',
          'Node-index',
          'Node-_id',
        ]);

        expect(groups.Link, 'Link fields').to.include.members([
          'Link-distance',
          'Link-source',
          'Link-target',
          'Link-Contact type',
        ]);
        expect(groups.Link, 'Link internal exclusions').not.to.include.members([
          'Link-index',
          'Link-origin',
          'Link-nearest neighbor',
          'Link-nn',
        ]);

        expect(groups.Cluster, 'Cluster fields').to.include.members([
          'Cluster-id',
          'Cluster-nodes',
          'Cluster-links',
          'Cluster-visible',
        ]);
      });

    cy.closeSettingsPane('Aggregate Settings');
  });

  it('refreshes cluster aggregate tables when Minimum Cluster Size changes and Reveal Everything restores them', () => {
    launchProfileToTwoD(clusteredProfile);
    assertAfterLaunchCounts(clusteredProfile);

    goToAggregateView();
    assertAggregateReady();

    openAggregateSettingsDialog();
    addAggregateTable();

    getAggregateFieldOption('Cluster-nodes').then((option) => {
      selectAggregateField(1, option.shortLabel, option.value);
    });

    cy.closeSettingsPane('Aggregate Settings');

    assertAggregateTableMatchesModel(0, 'Node-cluster');
    assertAggregateTableMatchesModel(1, 'Cluster-nodes');

    openGlobalFilteringTab();
    cy.get(byTestId(testIds.filterMinimumClusterSize))
      .clear()
      .type('3')
      .blur();
    cy.closeGlobalSettings();
    waitForProcessingDialogToClear();

    assertAggregateTableMatchesModel(0, 'Node-cluster');
    assertAggregateTableMatchesModel(1, 'Cluster-nodes');

    readRenderedAggregateRows(1).then((rows) => {
      expect(rows, 'cluster aggregate rows after minimum cluster size').to.have.length(2);
      expect(rows.map((row) => row.groupName), 'remaining visible cluster sizes').to.deep.equal(['3', '5']);
    });

    openGlobalFilteringTab();
    cy.get(byTestId(testIds.filterRevealEverything)).click({ force: true });
    cy.closeGlobalSettings();
    waitForProcessingDialogToClear();

    assertAggregateTableMatchesModel(0, 'Node-cluster');
    assertAggregateTableMatchesModel(1, 'Cluster-nodes');

    readRenderedAggregateRows(1).then((rows) => {
      expect(rows, 'cluster aggregate rows after reveal everything').to.have.length(3);
      expect(rows.map((row) => row.groupName), 'restored cluster sizes').to.deep.equal(['2', '3', '5']);
    });
  });

  it('keeps Link and Node aggregate tables in sync when filtering changes visible data', () => {
    launchProfileToTwoD(alternateMetricProfile);
    assertAfterLaunchCounts(alternateMetricProfile);

    goToAggregateView();
    assertAggregateReady();

    openAggregateSettingsDialog();
    addAggregateTable();
    getAggregateFieldOption('Link-distance').then((option) => {
      selectAggregateField(1, option.shortLabel, option.value);
    });
    cy.closeSettingsPane('Aggregate Settings');

    assertAggregateTableMatchesModel(0, 'Node-cluster');
    assertAggregateTableMatchesModel(1, 'Link-distance');

    openGlobalFilteringTab();
    cy.window().its('commonService.session.style.widgets.link-sort-variable').should('equal', 'distance');
    cy.get('#link-sort-variable').click({ force: true });
    cy.contains('li[role="option"]', 'Score').click({ force: true });
    setGlobalLinkThreshold(0.1);
    cy.closeGlobalSettings();
    waitForProcessingDialogToClear();

    assertAggregateTableMatchesModel(1, 'Link-distance');
  });
});
