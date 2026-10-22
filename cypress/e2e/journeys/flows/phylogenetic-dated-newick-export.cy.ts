/// <reference types="cypress" />

import {
  assertPhyloTreeReady,
  goToPhyloTreeView,
  launchAndWaitForProcessing,
  visitAppAndAcceptEula,
} from '../../../support/journey-helpers';

const FIXTURE_ROOT = 'docs/integrations/examples/dated-newick';
const NEWICK_PATH = `${FIXTURE_ROOT}/dated-tree.nwk`;
const NODE_PATH = `${FIXTURE_ROOT}/dated-tree-nodes.csv`;

const EXPECTED_NUM_DATES: Record<string, number> = {
  ROOT: 2020,
  SOUTH: 2021,
  AB_CLADE: 2022,
  A: 2024,
  B: 2024.5,
  CD_CLADE: 2022.25,
  C: 2025,
  D: 2025.5,
  NORTH: 2021.5,
  EF_CLADE: 2023,
  E: 2025.25,
  F: 2025.75,
  GH_CLADE: 2023.5,
  G: 2026,
  H: 2026.5,
};

const selectFileType = (fileName: string, type: 'newick' | 'node'): void => {
  cy.contains('#file-table .file-table-row', fileName, { timeout: 20000 })
    .should('exist')
    .then(($row) => {
      const activeType = $row.find('label.active input').attr('data-type');
      if (activeType === type) return;
      cy.wrap($row).find(`input[data-type="${type}"]`).click({ force: true });
    });
};

describe('Journey Flow - explicitly dated Newick Auspice export', () => {
  it('preserves every supplied node date as Auspice num_date', () => {
    const exportBase = `cypress_dated_newick_${Date.now()}`;
    const exportPath = `cypress/downloads/${exportBase}.json`;

    visitAppAndAcceptEula();
    cy.get('#fileDropRef', { timeout: 15000 }).selectFile(
      [NEWICK_PATH, NODE_PATH],
      { force: true },
    );

    selectFileType('dated-tree.nwk', 'newick');
    selectFileType('dated-tree-nodes.csv', 'node');
    cy.get('select[id="file-dated-tree-nodes.csv-field-1"]', { timeout: 20000 })
      .select('_id', { force: true })
      .should('have.value', '_id');

    launchAndWaitForProcessing(60000);
    goToPhyloTreeView();
    assertPhyloTreeReady();

    cy.window().then((win: any) => {
      const leaves = win.commonService.visuals.phylogenetic.tree.data
        .getLeaves()
        .map((leaf: any) => String(leaf.id))
        .sort();
      expect(leaves, 'dated Newick sample IDs').to.deep.equal(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
    });

    cy.get('#tool-btn-container-phylo a[title="Export Screen"]').click({ force: true });
    cy.contains('.p-dialog-title', 'Export Phylogenetic Tree').should('be.visible');
    cy.contains('.p-dialog:visible .nav-link', /^Auspice JSON$/).click({ force: true });
    cy.get('#auspice-json-filename')
      .clear({ force: true })
      .type(exportBase, { delay: 0, force: true });
    cy.get('#export-auspice-json').click({ force: true });

    cy.readFile(exportPath, null, { timeout: 30000 }).then((savedContents) => {
      const savedText = Cypress.Buffer.from(savedContents).toString('utf8');
      const dataset = JSON.parse(savedText);
      const actualNumDates: Record<string, number> = {};

      const visit = (node: any): void => {
        const children = Array.isArray(node.children) ? node.children : [];
        const sourceName = children.length
          ? String(node.branch_attrs?.labels?.microbetrace ?? '')
          : String(node.name ?? '');
        const value = node.node_attrs?.num_date?.value;
        if (sourceName && typeof value === 'number') actualNumDates[sourceName] = value;
        children.forEach(visit);
      };
      visit(dataset.tree);

      const observed = {
        numDates: actualNumDates,
        distanceMeasure: dataset.meta?.display_defaults?.distance_measure,
        hasNumDateColoring: (dataset.meta?.colorings || []).some((coloring: any) => (
          coloring.key === 'num_date' && coloring.type === 'temporal'
        )),
        panels: dataset.meta?.panels,
        hasValidDateColoring: (dataset.meta?.colorings || []).some((coloring: any) => (
          coloring.key === 'valid_date' && coloring.type === 'temporal'
        )),
      };

      expect(observed, 'dated Newick Auspice contract').to.deep.equal({
        numDates: EXPECTED_NUM_DATES,
        distanceMeasure: 'num_date',
        hasNumDateColoring: true,
        panels: ['tree', 'map'],
        hasValidDateColoring: true,
      });
    });
  });
});
