/// <reference types="cypress" />

import type { DatasetProfile } from '../datasets/profile';
import { getProfile, resolveExpected } from '../datasets/profile';
import {
  applyPreLaunchFileSettings,
  assertPhyloTreeReady,
  assertSessionAfterLaunchCounts,
  ensurePreLaunchProfileSynced,
  launchAndWaitForProcessing,
  visitAppAndAcceptEula,
} from '../../../support/journey-helpers';

const LEAF_NODE_SELECTOR = '#phylocanvas svg g.tidytree-node-leaf circle';
const LEAF_LABEL_SELECTOR = '#phylocanvas svg g.tidytree-node-leaf text';
const BRANCH_PATH_SELECTOR = '#phylocanvas svg g.tidytree-link path';

const DIRECT_PROFILE_IDS = [
  'phylo-snps16-edgelist',
  'phylo-snps16-matrix',
  'phylo-snps16-fasta',
  'phylo-tn93-sequence-node-list',
] as const;

function asDirectPhyloProfile(profile: DatasetProfile): DatasetProfile {
  return {
    ...profile,
    title: `${profile.title} (direct tree launch)`,
    preLaunch: {
      ...profile.preLaunch,
      defaultView: 'Phylogenetic Tree',
    },
  };
}

function assertRenderedPhyloTree(profile: DatasetProfile): void {
  const expectedAfterLaunch = resolveExpected(profile.expectations.afterLaunch);
  const expectedLeafCount = expectedAfterLaunch?.nodes;

  cy.window().then((win: any) => {
    const sessionNodeCount = win.commonService.session.data.nodes.length;
    const tree = win.commonService.visuals.phylogenetic.tree;

    expect(tree, 'phylogenetic tree instance').to.exist;
    expect(String(win.commonService.session.data.newickString || '').trim(), 'stored Newick string').to.not.equal('');
    expect(String(tree.data.toNewick(false) || '').trim(), 'rendered tree Newick string').to.not.equal('');

    const leafCount = tree.data.getLeaves().length;
    expect(leafCount, 'tree leaf count').to.equal(expectedLeafCount ?? sessionNodeCount);
  });

  cy.window()
    .its('commonService.session.data.nodes.length')
    .then((sessionNodeCount) => {
      const expectedCount = expectedLeafCount ?? Number(sessionNodeCount);

      cy.get(LEAF_NODE_SELECTOR, { timeout: 30000 }).should('have.length', expectedCount);
      cy.get(LEAF_LABEL_SELECTOR, { timeout: 30000 }).should('have.length', expectedCount);
    });

  cy.get(BRANCH_PATH_SELECTOR, { timeout: 30000 }).should(($paths) => {
    expect($paths.length, 'rendered branch count').to.be.greaterThan(0);
  });
}

describe('Journey - upload -> direct launch to Phylogenetic Tree', () => {
  const profileFilter = Cypress.env('phyloProfileId');
  const profiles = DIRECT_PROFILE_IDS
    .map((id) => asDirectPhyloProfile(getProfile(id)))
    .filter((profile) => !profileFilter || profile.id === profileFilter);

  profiles.forEach((profile) => {
    it(`directly launches ${profile.id} into an interactive tree`, () => {
      visitAppAndAcceptEula();
      cy.loadFiles(profile.files);
      applyPreLaunchFileSettings(profile);
      ensurePreLaunchProfileSynced(profile);
      launchAndWaitForProcessing(60000);

      assertSessionAfterLaunchCounts(profile);
      assertPhyloTreeReady(60000);
      assertRenderedPhyloTree(profile);
    });
  });
});
