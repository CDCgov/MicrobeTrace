/// <reference types="cypress" />

import type { DatasetProfile } from '../datasets/profile';
import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  goToTableView,
  launchProfileToTwoD,
} from '../../../support/journey-helpers';
import {
  assertTableDatasetMatchesSession,
  selectTableDataset,
} from '../../../support/table-helpers';

type TableSmokeCase = {
  profileId: string;
  title: string;
};

const TABLE_SMOKE_CASES: TableSmokeCase[] = [
  {
    profileId: 'nn-snps16-edgelist',
    title: 'Table smoke: uploaded distance edgelist keeps node, link, and cluster tables aligned',
  },
  {
    profileId: 'nn-snps16-matrix',
    title: 'Table smoke: uploaded distance matrix keeps node, link, and cluster tables aligned',
  },
  {
    profileId: 'nn-snps16-fasta',
    title: 'Table smoke: uploaded FASTA keeps node, link, and cluster tables aligned',
  },
  {
    profileId: 'color-by-uploaded-categorical',
    title: 'Table smoke: uploaded node plus link files keep node, link, and cluster tables aligned',
  },
  {
    profileId: 'filtering-metric-switch-sequence-node-list',
    title: 'Table smoke: uploaded sequence node list keeps node, link, and cluster tables aligned',
  },
  {
    profileId: 'load-twod-newick-tn93-angular-testing',
    title: 'Table smoke: uploaded Newick keeps node, link, and cluster tables aligned',
  },
  {
    profileId: 'load-large-node-link-smoke',
    title: 'Table smoke: larger uploaded data still populates node, link, and cluster tables coherently',
  },
];

describe('Journey Flow - Table uploaded-data smoke matrix', () => {
  TABLE_SMOKE_CASES.forEach(({ profileId, title }: TableSmokeCase) => {
    const profile = getProfile(profileId) as DatasetProfile;

    it(title, () => {
      launchProfileToTwoD(profile);
      assertAfterLaunchCounts(profile);
      goToTableView();

      assertTableDatasetMatchesSession('Node');

      selectTableDataset('Link');
      assertTableDatasetMatchesSession('Link');

      selectTableDataset('Cluster');
      assertTableDatasetMatchesSession('Cluster');
    });
  });
});
