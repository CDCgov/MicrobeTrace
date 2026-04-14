/// <reference types="cypress" />

import type { DatasetProfile } from '../datasets/profile';
import { getProfile } from '../datasets/profile';
import {
  applyPreLaunchFileSettings,
  assertSankeyReady,
  ensurePreLaunchProfileSynced,
  launchAndWaitForProcessing,
  visitAppAndAcceptEula,
} from '../../../support/journey-helpers';
import {
  addSankeyFields,
  aliasSankeySelection,
  assertRenderedSankey,
} from '../../../support/sankey-ui-helpers';

type SankeyDirectLaunchCase = {
  profileId: string;
  title: string;
};

const SANKEY_DIRECT_LAUNCH_CASES: SankeyDirectLaunchCase[] = [
  {
    profileId: 'nn-snps16-edgelist',
    title: 'Sankey direct launch: uploaded distance edgelist reaches interactive Sankey on launch',
  },
  {
    profileId: 'nn-snps16-matrix',
    title: 'Sankey direct launch: uploaded distance matrix reaches interactive Sankey on launch',
  },
  {
    profileId: 'nn-snps16-fasta',
    title: 'Sankey direct launch: uploaded FASTA reaches interactive Sankey on launch',
  },
  {
    profileId: 'style-apply-cypress-test-style',
    title: 'Sankey direct launch: uploaded node plus link files reach interactive Sankey on launch',
  },
  {
    profileId: 'filtering-metric-switch-sequence-node-list',
    title: 'Sankey direct launch: uploaded sequence node list reaches interactive Sankey on launch',
  },
  {
    profileId: 'load-twod-newick-tn93-angular-testing',
    title: 'Sankey direct launch: uploaded Newick reaches interactive Sankey on launch',
  },
  {
    profileId: 'filtering-mixed-origin-nearest-neighbor',
    title: 'Sankey direct launch: uploaded mixed-origin network reaches interactive Sankey on launch',
  },
];

const requestedProfileId = Cypress.env('SANKEY_DIRECT_PROFILE_ID') as string | undefined;
const ACTIVE_SANKEY_DIRECT_LAUNCH_CASES = requestedProfileId
  ? SANKEY_DIRECT_LAUNCH_CASES.filter(({ profileId }) => profileId === requestedProfileId)
  : SANKEY_DIRECT_LAUNCH_CASES;

const asDirectSankeyProfile = (profile: DatasetProfile): DatasetProfile => ({
  ...profile,
  preLaunch: {
    ...profile.preLaunch,
    defaultView: 'Sankey',
  },
});

const launchProfileDirectToSankey = (profile: DatasetProfile): void => {
  visitAppAndAcceptEula();
  cy.loadFiles(profile.files);
  applyPreLaunchFileSettings(profile);
  ensurePreLaunchProfileSynced(profile);
  launchAndWaitForProcessing(60000);
  assertSankeyReady();
};

describe('Journey Flow - Sankey direct launch uploaded-data smoke matrix', () => {
  ACTIVE_SANKEY_DIRECT_LAUNCH_CASES.forEach(({ profileId, title }: SankeyDirectLaunchCase) => {
    const profile = asDirectSankeyProfile(getProfile(profileId));

    it(title, () => {
      launchProfileDirectToSankey(profile);

      cy.window()
        .its('commonService.session.style.widgets.default-view')
        .should('equal', 'Sankey');

      aliasSankeySelection();
      addSankeyFields();
      assertRenderedSankey();
    });
  });
});
