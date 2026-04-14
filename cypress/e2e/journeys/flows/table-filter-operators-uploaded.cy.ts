/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  goToTableView,
  launchProfileToTwoD,
} from '../../../support/journey-helpers';
import {
  assertFirstVisibleRowValue,
  assertSingleVisibleRowValue,
  assertTableDatasetMatchesSession,
  assertTableVisibleRowCount,
  clearTableFilterValue,
  selectTableDataset,
  setTableFilterType,
  setTableFilterValue,
} from '../../../support/table-helpers';

describe('Journey Flow - Table filter operators on uploaded data', () => {
  const nodeAndLinkProfile = getProfile('map-color-by-uploaded');
  const clusterProfile = getProfile('filtering-min-cluster-reveal-epi-linklist');

  it('applies the string filter operators on node-table columns', () => {
    launchProfileToTwoD(nodeAndLinkProfile);
    assertAfterLaunchCounts(nodeAndLinkProfile);
    goToTableView();

    setTableFilterType('Id', 'Contains');
    setTableFilterValue('Id', 'D');
    assertSingleVisibleRowValue('Id', 'D');

    setTableFilterType('Id', '=');
    setTableFilterValue('Id', 'A');
    assertSingleVisibleRowValue('Id', 'A');

    setTableFilterType('Id', '!=');
    setTableFilterValue('Id', 'A');
    assertTableVisibleRowCount(3);
    assertFirstVisibleRowValue('Id', 'B');

    setTableFilterType('Id', 'Starts With');
    setTableFilterValue('Id', 'C');
    assertSingleVisibleRowValue('Id', 'C');

    setTableFilterType('Id', 'Ends With');
    setTableFilterValue('Id', 'D');
    assertSingleVisibleRowValue('Id', 'D');
  });

  it('applies numeric filter operators on link-table columns', () => {
    launchProfileToTwoD(nodeAndLinkProfile);
    assertAfterLaunchCounts(nodeAndLinkProfile);
    goToTableView();
    selectTableDataset('Link');
    assertTableDatasetMatchesSession('Link');

    setTableFilterType('Distance', '<');
    setTableFilterValue('Distance', '7');
    assertTableVisibleRowCount(1);
    assertFirstVisibleRowValue('Distance', '5');

    setTableFilterType('Distance', '<=');
    setTableFilterValue('Distance', '7');
    assertTableVisibleRowCount(2);
    assertFirstVisibleRowValue('Distance', '5');

    setTableFilterType('Distance', '>');
    setTableFilterValue('Distance', '7');
    assertTableVisibleRowCount(2);
    assertFirstVisibleRowValue('Distance', '9');

    setTableFilterType('Distance', '>=');
    setTableFilterValue('Distance', '9');
    assertTableVisibleRowCount(2);
    assertFirstVisibleRowValue('Distance', '9');
  });

  it('filters the cluster table by numeric node-count values', () => {
    launchProfileToTwoD(clusterProfile);
    assertAfterLaunchCounts(clusterProfile);
    goToTableView();
    selectTableDataset('Cluster');
    assertTableDatasetMatchesSession('Cluster');

    setTableFilterType('Nodes', '>');
    setTableFilterValue('Nodes', '2');
    assertTableVisibleRowCount(2);

    setTableFilterType('Nodes', '=');
    setTableFilterValue('Nodes', '2');
    assertSingleVisibleRowValue('Nodes', '2');

    clearTableFilterValue('Nodes');
    assertTableVisibleRowCount(3);
  });
});
