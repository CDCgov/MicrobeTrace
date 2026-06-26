/// <reference types="cypress" />

import type { DatasetProfile } from '../datasets/profile';
import { getProfile } from '../datasets/profile';
import {
  applyPreLaunchFileSettings,
  assertTableReady,
  ensurePreLaunchProfileSynced,
  launchAndWaitForProcessing,
  visitAppAndAcceptEula,
} from '../../../support/journey-helpers';
import {
  assertTableDatasetMatchesSession,
  selectTableDataset,
} from '../../../support/table-helpers';

type TableDirectLaunchCase = {
  profileId: string;
  title: string;
};

const TABLE_DIRECT_LAUNCH_CASES: TableDirectLaunchCase[] = [
  {
    profileId: 'nn-snps16-edgelist',
    title: 'Table direct launch: uploaded distance edgelist reaches interactive Table on launch',
  },
  {
    profileId: 'nn-snps16-matrix',
    title: 'Table direct launch: uploaded distance matrix reaches interactive Table on launch',
  },
  {
    profileId: 'nn-snps16-fasta',
    title: 'Table direct launch: uploaded FASTA reaches interactive Table on launch',
  },
  {
    profileId: 'color-by-uploaded-categorical',
    title: 'Table direct launch: uploaded node plus link files reach interactive Table on launch',
  },
  {
    profileId: 'filtering-metric-switch-sequence-node-list',
    title: 'Table direct launch: uploaded sequence node list reaches interactive Table on launch',
  },
];

const asDirectTableProfile = (profile: DatasetProfile): DatasetProfile => ({
  ...profile,
  preLaunch: {
    ...profile.preLaunch,
    defaultView: 'Table',
  },
});

const launchProfileToTable = (profile: DatasetProfile): void => {
  visitAppAndAcceptEula();
  cy.loadFiles(profile.files);
  applyPreLaunchFileSettings(profile);
  ensurePreLaunchProfileSynced(profile);
  launchAndWaitForProcessing(60000);
  assertTableReady();
};

describe('Journey Flow - Table direct launch uploaded-data smoke matrix', () => {
  TABLE_DIRECT_LAUNCH_CASES.forEach(({ profileId, title }: TableDirectLaunchCase) => {
    const profile = asDirectTableProfile(getProfile(profileId));

    it(title, () => {
      launchProfileToTable(profile);

      cy.window()
        .its('commonService.session.style.widgets.default-view')
        .should('equal', 'Table');

      assertTableDatasetMatchesSession('Node');

      selectTableDataset('Link');
      assertTableDatasetMatchesSession('Link');

      selectTableDataset('Cluster');
      assertTableDatasetMatchesSession('Cluster');
    });
  });

  it('Table direct launch: uploaded Newick reaches interactive Table on launch', () => {
    const profile = asDirectTableProfile(getProfile('load-twod-newick-tn93-angular-testing'));

    launchProfileToTable(profile);

    cy.window()
      .its('commonService.session.style.widgets.default-view')
      .should('equal', 'Table');

    assertTableDatasetMatchesSession('Node');

    selectTableDataset('Link');
    assertTableDatasetMatchesSession('Link');

    selectTableDataset('Cluster');
    assertTableDatasetMatchesSession('Cluster');
  });
});
