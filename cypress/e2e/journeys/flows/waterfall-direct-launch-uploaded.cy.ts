/// <reference types="cypress" />

import type { DatasetProfile } from '../datasets/profile';
import { getProfile } from '../datasets/profile';
import {
  applyPreLaunchFileSettings,
  assertSessionAfterLaunchCounts,
  assertWaterfallReady,
  ensurePreLaunchProfileSynced,
  launchAndWaitForProcessing,
  visitAppAndAcceptEula,
} from '../../../support/journey-helpers';

type WaterfallWindow = Window & {
  commonService: any;
};

type WaterfallClusterRow = {
  id: string;
  nodeCount: number;
};

type WaterfallDirectLaunchCase = {
  profileId: string;
  title: string;
};

const WATERFALL_DIRECT_LAUNCH_CASES: WaterfallDirectLaunchCase[] = [
  {
    profileId: 'nn-snps16-edgelist',
    title: 'Waterfall direct launch: uploaded distance edgelist reaches interactive Waterfall on launch',
  },
  {
    profileId: 'nn-snps16-matrix',
    title: 'Waterfall direct launch: uploaded distance matrix reaches interactive Waterfall on launch',
  },
  {
    profileId: 'nn-snps16-fasta',
    title: 'Waterfall direct launch: uploaded FASTA reaches interactive Waterfall on launch',
  },
  {
    profileId: 'style-apply-cypress-test-style',
    title: 'Waterfall direct launch: uploaded node plus link files reach interactive Waterfall on launch',
  },
  {
    profileId: 'filtering-metric-switch-sequence-node-list',
    title: 'Waterfall direct launch: uploaded sequence node list reaches interactive Waterfall on launch',
  },
  {
    profileId: 'load-twod-newick-tn93-angular-testing',
    title: 'Waterfall direct launch: uploaded Newick reaches interactive Waterfall on launch',
  },
  {
    profileId: 'filtering-mixed-origin-nearest-neighbor',
    title: 'Waterfall direct launch: uploaded sequence node list plus epi link list reaches interactive Waterfall on launch',
  },
] as const;

const requestedProfileId = Cypress.env('WATERFALL_DIRECT_PROFILE_ID') as string | undefined;
const ACTIVE_WATERFALL_DIRECT_LAUNCH_CASES = requestedProfileId
  ? WATERFALL_DIRECT_LAUNCH_CASES.filter(({ profileId }) => profileId === requestedProfileId)
  : WATERFALL_DIRECT_LAUNCH_CASES;

const asDirectWaterfallProfile = (profile: DatasetProfile): DatasetProfile => ({
  ...profile,
  preLaunch: {
    ...profile.preLaunch,
    defaultView: 'Waterfall' as DatasetProfile['preLaunch']['defaultView'],
  },
});

function assertWaterfallClusterRowsRender(): void {
  cy.window().then((win: unknown) => {
    const typedWindow = win as WaterfallWindow;
    const expectedRows: WaterfallClusterRow[] = (typedWindow.commonService.visuals.waterfall.clusterTableData || [])
      .map((row: any) => ({
        id: String(row.id),
        nodeCount: Number(row.nodeCount),
      }));

    cy.get('#waterfall-cluster-table-container tbody tr.ui-selectable-row', { timeout: 20000 })
      .should('have.length', expectedRows.length)
      .then(($rows) => {
        const actualRows: WaterfallClusterRow[] = Array.from($rows).map((row) => {
          const cells = row.querySelectorAll('td');
          return {
            id: String(cells[0]?.textContent || '').trim(),
            nodeCount: parseInt(String(cells[1]?.textContent || '0').replace(/,/g, '').trim(), 10),
          };
        });

        expect(actualRows, 'rendered Waterfall cluster rows').to.deep.equal(expectedRows);
      });
  });
}

function launchProfileDirectToWaterfall(profile: DatasetProfile): void {
  visitAppAndAcceptEula();
  cy.loadFiles(profile.files);
  applyPreLaunchFileSettings(profile);
  ensurePreLaunchProfileSynced(profile);
  launchAndWaitForProcessing(120000);
  assertWaterfallReady(120000);
}

describe('Journey Flow - Waterfall direct launch uploaded-data smoke matrix', () => {
  ACTIVE_WATERFALL_DIRECT_LAUNCH_CASES.forEach(({ profileId, title }: WaterfallDirectLaunchCase) => {
    const profile = asDirectWaterfallProfile(getProfile(profileId));

    it(title, () => {
      launchProfileDirectToWaterfall(profile);
      assertSessionAfterLaunchCounts(profile);

      cy.window()
        .its('commonService.session.style.widgets.default-view')
        .should('equal', 'Waterfall');

      cy.get('#waterfall-empty-state').should('not.exist');
      cy.window().its('commonService.visuals.waterfall.clusterTableData.length').should('be.greaterThan', 0);
      assertWaterfallClusterRowsRender();
    });
  });
});
