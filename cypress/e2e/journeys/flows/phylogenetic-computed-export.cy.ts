/// <reference types="cypress" />

import type { DatasetProfile } from '../datasets/profile';
import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  assertPhyloTreeReady,
  goToPhyloTreeView,
  launchProfileToTwoD,
} from '../../../support/journey-helpers';

const SELECTORS = {
  exportButton: '#tool-btn-container-phylo a[title="Export Screen"]',
};

type PhyloImageFileType = 'png' | 'svg';

const normalizeNewickText = (value: string): string => value.replace(/\r\n/g, '\n').trim();

const openPhyloExportDialog = (): void => {
  cy.get(SELECTORS.exportButton).click({ force: true });
  cy.contains('.p-dialog-title', 'Export Phylogenetic Tree').should('be.visible');
};

const setExportFileType = (fileType: PhyloImageFileType): void => {
  cy.get('#network-export-filetype').click({ force: true });
  cy.contains('li[role="option"]', new RegExp(`^${fileType}$`, 'i')).click({ force: true });
};

const openNewickExportTab = (): void => {
  cy.contains('.p-dialog:visible .nav-link', /^Newick$/).click({ force: true });
  cy.get('#newick-string-filename').should('be.visible');
};

describe('Journey Flow - Computed Phylogenetic Tree export on uploaded non-Newick data', () => {
  const profiles: DatasetProfile[] = [
    getProfile('phylo-snps16-matrix'),
    getProfile('phylo-snps16-fasta'),
    getProfile('phylo-tn93-sequence-node-list'),
  ];

  it('exports png svg and newick artifacts from derived tree state across computed file types', () => {
    cy.wrap(profiles).each((profile: DatasetProfile) => {
      const runId = `${profile.id}_${Date.now()}`;
      const pngFileBase = `cypress_tree_computed_png_${runId}`;
      const pngPath = `cypress/downloads/${pngFileBase}.png`;
      const svgFileBase = `cypress_tree_computed_svg_${runId}`;
      const svgPath = `cypress/downloads/${svgFileBase}.svg`;
      const newickFileBase = `cypress_tree_computed_nwk_${runId}`;
      const newickPath = `cypress/downloads/${newickFileBase}.txt`;

      launchProfileToTwoD(profile);
      assertAfterLaunchCounts(profile);
      goToPhyloTreeView();
      assertPhyloTreeReady();

      openPhyloExportDialog();
      setExportFileType('png');
      cy.get('#tree-image-filename')
        .invoke('val', pngFileBase)
        .trigger('input')
        .trigger('change');

      cy.get('#export-tree').click({ force: true });
      cy.readFile(pngPath, 'binary', { timeout: 30000 }).should((pngBinary) => {
        expect(pngBinary.length, `PNG byte length for ${profile.id}`).to.be.greaterThan(1000);
      });

      openPhyloExportDialog();
      cy.get('#tree-image-filename')
        .invoke('val', svgFileBase)
        .trigger('input')
        .trigger('change');

      setExportFileType('svg');
      cy.get('#export-tree').click({ force: true });
      cy.readFile(svgPath, 'utf8', { timeout: 30000 }).should((svgText) => {
        expect(svgText, `SVG export contents for ${profile.id}`).to.contain('<svg');
      });

      openPhyloExportDialog();
      openNewickExportTab();

      cy.get('#newick-string-filename')
        .invoke('val', newickFileBase)
        .trigger('input')
        .trigger('change');

      cy.get('#export-newick').click({ force: true });

      cy.window().its('commonService.visuals.phylogenetic.tree.data').then((treeData: any) => {
        const expectedNewick = normalizeNewickText(treeData.toNewick(false));

        cy.readFile(newickPath, 'utf8', { timeout: 30000 }).should((savedText) => {
          expect(normalizeNewickText(savedText), `Newick export contents for ${profile.id}`).to.equal(expectedNewick);
          expect(savedText, `non-negative Newick branches for ${profile.id}`).not.to.match(/:-(?:\d|\.)/);
        });
      });
    });
  });
});
