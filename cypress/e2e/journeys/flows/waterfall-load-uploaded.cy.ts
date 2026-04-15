/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  launchProfileToWaterfall,
} from '../../../support/journey-helpers';

type WaterfallWindow = Window & {
  commonService: any;
};

type WaterfallClusterRow = {
  id: string;
  nodeCount: number;
};

const WATERFALL_LOAD_CASES = [
  { label: 'distance edgelist', profileId: 'nn-snps16-edgelist' },
  { label: 'distance matrix', profileId: 'nn-snps16-matrix' },
  { label: 'FASTA', profileId: 'nn-snps16-fasta' },
  { label: 'node list + link list', profileId: 'style-apply-cypress-test-style' },
  { label: 'sequence node list', profileId: 'filtering-metric-switch-sequence-node-list' },
  { label: 'Newick', profileId: 'load-twod-newick-tn93-angular-testing' },
  { label: 'sequence node list + epi link list', profileId: 'filtering-mixed-origin-nearest-neighbor' },
] as const;

function assertWaterfallClusterRowsMatchSession(): void {
  cy.window().then((win: unknown) => {
    const w = win as WaterfallWindow;
    const expectedRows: WaterfallClusterRow[] = (w.commonService.session.data.clusters || []).map((cluster: any) => ({
      id: String(cluster.id),
      nodeCount: Number(cluster.nodes),
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

        expect(actualRows, 'waterfall cluster rows').to.deep.equal(expectedRows);
      });
  });
}

describe('Journey Flow - Waterfall uploaded load matrix', () => {
  WATERFALL_LOAD_CASES.forEach(({ label, profileId }) => {
    const profile = getProfile(profileId);

    it(`loads ${label} data into Waterfall and renders the cluster summary table`, () => {
      launchProfileToWaterfall(profile);
      assertAfterLaunchCounts(profile);
      assertWaterfallClusterRowsMatchSession();

      cy.get('#waterfall-empty-state').should('not.exist');
      cy.window().its('commonService.visuals.waterfall.clusterTableData.length').should('be.greaterThan', 0);
    });
  });
});
