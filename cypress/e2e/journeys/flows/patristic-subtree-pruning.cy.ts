/// <reference types="cypress" />

import { visitAppAndAcceptEula } from '../../../support/journey-helpers';

const EXPECTED_PRUNED_PAIRS = [
  'A-B',
  'A-C',
  'A-D',
  'B-C',
  'B-D',
  'C-D',
  'E-F',
  'E-G',
  'E-H',
  'F-G',
  'F-H',
  'G-H',
];

describe('Journey Flow - Patristic subtree pruning', () => {
  it('reports subtree-pruned threshold stats for a balanced Newick search', () => {
    visitAppAndAcceptEula();

    cy.fixture('AngularTesting_prunable_balanced_Newick.nwk', 'utf8').then((newick: string) => {
      cy.window().then((win: any) => {
        const workerCompute = win?.commonService?.workerComputeService || win?.workerComputeService;
        expect(workerCompute, 'worker compute service should be available').to.exist;

        const emittedPairs: string[] = [];

        return workerCompute.computePatristicEdges(
          newick,
          0.12,
          (link: any) => {
            emittedPairs.push([link.source, link.target].sort().join('-'));
            return 1;
          },
          (value: string) => value,
          {
            origin: ['cypress-subtree-pruning'],
            distanceOrigin: 'cypress-subtree-pruning',
          },
        ).then((result: any) => {
          const buildStats = workerCompute.getLastPatristicBuildStats?.();

          expect(result.totalLinks).to.equal(12);
          expect(result.leafNames).to.have.length(8);
          expect(emittedPairs.sort()).to.deep.equal(EXPECTED_PRUNED_PAIRS);
          expect(buildStats).to.deep.equal({
            totalLeafPairs: 28,
            accountedLeafPairs: 28,
            evaluatedLeafPairs: 12,
            prunedLeafPairs: 16,
            prunedSubtreeComparisons: 1,
          });
          expect(result.buildStats).to.deep.equal(buildStats);
        });
      });
    });
  });
});
