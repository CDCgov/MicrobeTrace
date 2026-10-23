/// <reference types="cypress" />

import * as patristic from 'patristic';
import { visitAppAndAcceptEula, waitForProcessingDialogToClear } from '../../../support/journey-helpers';

type Partition = string[][];

const normalize = (groups: string[][]): Partition => groups
  .map((group) => [...group].sort())
  .sort((a, b) => a.join('|').localeCompare(b.join('|')));

const topLevelClades = (newick: string): Partition => {
  const root: any = patristic.parseNewick(newick);
  return normalize(root.children.map((branch: any) => (
    branch.getLeaves().map((leaf: any) => String(leaf.id))
  )));
};

const recoveringThreshold = (newick: string, expected: Partition): number | null => {
  const root: any = patristic.parseNewick(newick);
  const leaves: any[] = root.getLeaves();
  const links: any[] = [];
  for (let source = 0; source < leaves.length; source++) {
    for (let target = source + 1; target < leaves.length; target++) {
      links.push({
        source: leaves[source].id,
        target: leaves[target].id,
        distance: leaves[source].distanceTo(leaves[target]),
        hasDistance: true,
      });
    }
  }
  const session = { data: { nodes: leaves.map((leaf) => ({ id: leaf.id })), links } };
  const thresholds = [...new Set(links.map((link) => link.distance))].sort((a, b) => a - b);
  return thresholds.find((threshold) => (
    JSON.stringify(networkComponents(session, threshold)) === JSON.stringify(expected)
  )) ?? null;
};

// Read the loaded links directly so the oracle does not call MT's threshold-analysis code.
const networkComponents = (session: any, threshold: number): Partition => {
  const ids = session.data.nodes.map((node: any) => String(node._id ?? node.id));
  const parent = new Map(ids.map((id: string) => [id, id]));
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    return root;
  };
  const endpointId = (endpoint: any) => String(endpoint?._id ?? endpoint?.id ?? endpoint);

  for (const link of session.data.links) {
    if (link.hasDistance !== true || Number(link.distance) > threshold) continue;
    const source = endpointId(link.source);
    const target = endpointId(link.target);
    if (parent.has(source) && parent.has(target)) parent.set(find(source), find(target));
  }

  const groups = new Map<string, string[]>();
  for (const id of ids) {
    const root = find(id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(id);
  }
  return normalize([...groups.values()]);
};

const launchFixture = (name: string): void => {
  visitAppAndAcceptEula();
  cy.loadFiles([{ name, datatype: 'newick' }]);
  cy.get('[data-testid="files-smart-launch-button"]').click({ force: true });
  waitForProcessingDialogToClear(60000);
  cy.window().its('commonService.session.network.isFullyLoaded').should('eq', true);
};

describe('Smart Launch recovery of Newick clades', () => {
  it('recovers balanced root clades when their distances are separated', () => {
    const name = 'smart-launch/clades-balanced.nwk';
    cy.fixture(name).then((newick: string) => {
      const expected = topLevelClades(newick);
      expect(recoveringThreshold(newick, expected), 'an exact cutoff exists').not.to.eq(null);
      launchFixture(name);
      cy.window().then((win: any) => {
        const session = win.commonService.session;
        const threshold = Number(session.style.widgets['link-threshold']);
        expect(networkComponents(session, threshold)).to.deep.equal(expected);
        expect(session.meta.performance.patristic.edgeGeneration.guardrail?.hardLimitHit).not.to.eq(true);
      });
    });
  });

  it('keeps uneven clades separate and recovers most of them', () => {
    const name = 'smart-launch/clades-uneven.nwk';
    cy.fixture(name).then((newick: string) => {
      const expected = topLevelClades(newick);
      expect(recoveringThreshold(newick, expected), 'an exact cutoff exists').not.to.eq(null);
      launchFixture(name);
      cy.window().then((win: any) => {
        const session = win.commonService.session;
        const threshold = Number(session.style.widgets['link-threshold']);
        const observed = networkComponents(session, threshold);
        const exactClades = expected.filter((clade) => observed.some((group) => (
          JSON.stringify(group) === JSON.stringify(clade)
        )));
        expect(observed.every((group) => expected.some((clade) => (
          group.every((id) => clade.includes(id))
        ))), 'no threshold component crosses a root-clade boundary').to.eq(true);
        expect(exactClades.length, 'root clades fully recovered').to.be.at.least(2);
      });
    });
  });

  it('records a tree whose branch lengths prevent exact root-clade recovery', () => {
    const name = 'smart-launch/clades-overlap.nwk';
    cy.fixture(name).then((newick: string) => {
      const expected = topLevelClades(newick);
      expect(recoveringThreshold(newick, expected), 'no exact cutoff exists').to.eq(null);
      launchFixture(name);
      cy.window().then((win: any) => {
        const session = win.commonService.session;
        const threshold = Number(session.style.widgets['link-threshold']);
        const observed = networkComponents(session, threshold);
        expect(observed, 'a distance cutoff cannot always reproduce phylogenetic clades')
          .not.to.deep.equal(expected);
      });
    });
  });
});
