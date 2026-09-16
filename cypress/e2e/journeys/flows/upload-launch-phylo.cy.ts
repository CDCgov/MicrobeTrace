/// <reference types="cypress" />

import * as patristic from 'patristic';
import type { DatasetProfile } from '../datasets/profile';
import { getProfilesByTag, resolveExpected } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  assertPhyloTreeReady,
  goToPhyloTreeView,
  launchProfileToTwoD,
} from '../../../support/journey-helpers';

const LEAF_NODE_SELECTOR = '#phylocanvas svg g.tidytree-node-leaf circle';
const LEAF_LABEL_SELECTOR = '#phylocanvas svg g.tidytree-node-leaf text';
const BRANCH_PATH_SELECTOR = '#phylocanvas svg g.tidytree-link path';

function assertRenderedPhyloTree(profile: DatasetProfile): void {
  const expectedAfterLaunch = resolveExpected(profile.expectations.afterLaunch);
  const expectedLeafCount = expectedAfterLaunch?.nodes;
  const newickInput = profile.files.find((file) => file.datatype === 'newick');

  cy.window().then((win: any) => {
    const sessionNodeCount = win.commonService.session.data.nodes.length;
    const tree = win.commonService.visuals.phylogenetic.tree;
    const storedNewick = String(win.commonService.session.data.newickString || '').trim();
    const renderedNewick = String(tree.data.toNewick(false) || '').trim();

    expect(tree, 'phylogenetic tree instance').to.exist;
    expect(storedNewick, 'stored Newick string').to.not.equal('');
    expect(renderedNewick, 'rendered tree Newick string').to.not.equal('');

    if (newickInput) {
      const canonicalStoredNewick = patristic.parseNewick(storedNewick).toNewick(false).trim();
      expect(renderedNewick, 'rendered tree matches the stored Newick tree')
        .to.equal(canonicalStoredNewick);
    }

    const leafCount = tree.data.getLeaves().length;
    expect(leafCount, 'tree leaf count').to.equal(expectedLeafCount ?? sessionNodeCount);
  });

  if (newickInput) {
    cy.fixture(newickInput.name).then((inputNewick: string) => {
      const canonicalInputNewick = patristic.parseNewick(String(inputNewick).trim()).toNewick(false).trim();

      cy.window().then((win: any) => {
        const storedNewick = String(win.commonService.session.data.newickString || '').trim();
        const canonicalStoredNewick = patristic.parseNewick(storedNewick).toNewick(false).trim();

        expect(canonicalStoredNewick, 'stored Newick tree matches the uploaded Newick tree')
          .to.equal(canonicalInputNewick);
      });
    });
  }

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

describe('Journey - upload -> launch -> switch to Phylogenetic Tree', () => {
  const profileFilter = Cypress.env('phyloProfileId');
  const profiles = getProfilesByTag('phylo-smoke')
    .filter((profile) => !profileFilter || profile.id === profileFilter);

  it('loads supported uploaded tree-capable file types and renders them in the tree view', () => {
    cy.wrap(profiles).each((profile: DatasetProfile) => {
      cy.log(profile.title);
      launchProfileToTwoD(profile);
      assertAfterLaunchCounts(profile);
      goToPhyloTreeView();
      assertPhyloTreeReady();
      assertRenderedPhyloTree(profile);
    });
  });
});
