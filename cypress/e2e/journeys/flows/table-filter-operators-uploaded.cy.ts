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

    setTableFilterType('_id', 'Contains');
    setTableFilterValue('_id', 'D');
    assertSingleVisibleRowValue('_id', 'D');

    setTableFilterType('_id', '=');
    setTableFilterValue('_id', 'A');
    assertSingleVisibleRowValue('_id', 'A');

    setTableFilterType('_id', '!=');
    setTableFilterValue('_id', 'A');
    assertTableVisibleRowCount(3);
    assertFirstVisibleRowValue('_id', 'B');

    setTableFilterType('_id', 'Starts With');
    setTableFilterValue('_id', 'C');
    assertSingleVisibleRowValue('_id', 'C');

    setTableFilterType('_id', 'Ends With');
    setTableFilterValue('_id', 'D');
    assertSingleVisibleRowValue('_id', 'D');
  });

  it('applies numeric filter operators on link-table columns', () => {
    launchProfileToTwoD(nodeAndLinkProfile);
    assertAfterLaunchCounts(nodeAndLinkProfile);
    goToTableView();
    selectTableDataset('Link');
    assertTableDatasetMatchesSession('Link');

    setTableFilterType('distance', '<');
    setTableFilterValue('distance', '7');
    assertTableVisibleRowCount(1);
    assertFirstVisibleRowValue('distance', '5');

    setTableFilterType('distance', '<=');
    setTableFilterValue('distance', '7');
    assertTableVisibleRowCount(2);
    assertFirstVisibleRowValue('distance', '5');

    setTableFilterType('distance', '>');
    setTableFilterValue('distance', '7');
    assertTableVisibleRowCount(2);
    assertFirstVisibleRowValue('distance', '9');

    setTableFilterType('distance', '>=');
    setTableFilterValue('distance', '9');
    assertTableVisibleRowCount(2);
    assertFirstVisibleRowValue('distance', '9');
  });

  it('filters the cluster table by numeric node-count values', () => {
    launchProfileToTwoD(clusterProfile);
    assertAfterLaunchCounts(clusterProfile);
    goToTableView();
    selectTableDataset('Cluster');
    assertTableDatasetMatchesSession('Cluster');

    setTableFilterType('nodes', '>');
    setTableFilterValue('nodes', '2');
    assertTableVisibleRowCount(2);

    setTableFilterType('nodes', '=');
    setTableFilterValue('nodes', '2');
    assertSingleVisibleRowValue('nodes', '2');

    clearTableFilterValue('nodes');
    assertTableVisibleRowCount(3);
  });
});
