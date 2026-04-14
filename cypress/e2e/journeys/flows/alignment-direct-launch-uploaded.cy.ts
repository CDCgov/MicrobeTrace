/// <reference types="cypress" />

import type { DatasetProfile } from '../datasets/profile';
import { getProfile } from '../datasets/profile';
import {
  applyPreLaunchFileSettings,
  assertAlignmentReady,
  assertAlignmentState,
  assertSessionAfterLaunchCounts,
  ensurePreLaunchProfileSynced,
  launchAndWaitForProcessing,
  visitAppAndAcceptEula,
} from '../../../support/journey-helpers';

type AlignmentDirectLaunchCase = {
  profileId: string;
  title: string;
};

const ALIGNMENT_DIRECT_LAUNCH_CASES: AlignmentDirectLaunchCase[] = [
  {
    profileId: 'alignment-angulartesting-fasta',
    title: 'Alignment direct launch: uploaded FASTA reaches interactive Alignment on launch',
  },
  {
    profileId: 'alignment-angulartesting-sequence-node-list',
    title: 'Alignment direct launch: uploaded sequence node list reaches interactive Alignment on launch',
  },
  {
    profileId: 'alignment-covid-node-link-excluded',
    title: 'Alignment direct launch: uploaded node plus link files reach interactive Alignment on launch',
  },
];

const asDirectAlignmentProfile = (profile: DatasetProfile): DatasetProfile => ({
  ...profile,
  preLaunch: {
    ...profile.preLaunch,
    defaultView: 'Alignment View',
  },
});

const launchProfileDirectToAlignment = (profile: DatasetProfile): void => {
  visitAppAndAcceptEula();
  cy.loadFiles(profile.files);
  applyPreLaunchFileSettings(profile);
  ensurePreLaunchProfileSynced(profile);
  launchAndWaitForProcessing(120000);
  assertAlignmentReady(120000);
};

describe('Journey Flow - Alignment direct launch uploaded-data smoke matrix', () => {
  ALIGNMENT_DIRECT_LAUNCH_CASES.forEach(({ profileId, title }: AlignmentDirectLaunchCase) => {
    const profile = asDirectAlignmentProfile(getProfile(profileId));

    it(title, () => {
      launchProfileDirectToAlignment(profile);

      cy.window()
        .its('commonService.session.style.widgets.default-view')
        .should('equal', 'Alignment View');

      assertSessionAfterLaunchCounts(profile);
      assertAlignmentState(profile);
    });
  });
});
