/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertPhyloTreeReady,
  launchProfileToPhyloTree,
} from '../../../support/journey-helpers';

const SELECTORS = {
  treeContainer: '#phylocanvas',
  treeSvg: '#phylocanvas svg',
  settingsBtn: '#tool-btn-container-phylo a[title="Settings"]',
  exportBtn: '#tool-btn-container-phylo a[title="Export Screen"]',
};

type PhyloImageFileType = 'png' | 'jpeg' | 'svg';

const normalizeNewickText = (value: string): string => value.replace(/\r\n/g, '\n').trim();

const setExportFileType = (fileType: PhyloImageFileType): void => {
  cy.get('#network-export-filetype').click({ force: true });
  cy.contains('li[role="option"]', new RegExp(`^${fileType}$`, 'i')).click({ force: true });
};

const assertLeafLabelState = (visible: boolean): void => {
  cy.window()
    .its('commonService.visuals.phylogenetic.SelectedLeafLabelShowVariable')
    .should('equal', visible);

  cy.get(SELECTORS.treeSvg)
    .find('g.tidytree-node-leaf text')
    .then(($labels) => {
      if (visible) {
        expect($labels.length, 'leaf label elements').to.be.greaterThan(0);
        cy.wrap($labels.first()).should('be.visible');
        return;
      }

      if ($labels.length > 0) {
        cy.wrap($labels.first()).should('not.be.visible');
      }
    });
};

describe('Journey Flow - Phylogenetic Tree Export (Newick file)', () => {
  const profile = getProfile('load-phylo-tree-newick-snp');

  beforeEach(() => {
    launchProfileToPhyloTree(profile);
    assertPhyloTreeReady();
  });

  context('Export', () => {
    beforeEach(() => {
      cy.get(SELECTORS.exportBtn).click();
      cy.contains('.p-dialog-title', 'Export Phylogenetic Tree').should('be.visible');
    });

    it('should open the export dialog', () => {
      cy.contains('.p-dialog-title', 'Export Phylogenetic Tree').should('be.visible');
    });

    it('should change filename and export as png', () => {
      const exportFileBase = `cypress_tree_test_${Date.now()}`;
      const exportPath = `cypress/downloads/${exportFileBase}.png`;

      cy.get('#tree-image-filename')
        .invoke('val', exportFileBase)
        .trigger('input')
        .trigger('change');

      cy.window()
        .its('commonService.visuals.phylogenetic.SelectedTreeImageFilenameVariable')
        .should('equal', exportFileBase);

      cy.get('#export-tree').click();
      cy.readFile(exportPath, 'binary', { timeout: 30000 }).should((pngBinary) => {
        expect(pngBinary.length, 'exported PNG byte length').to.be.greaterThan(1000);
      });
    });

    it('should change filename and export as svg', () => {
      const exportFileBase = `cypress_tree_test_${Date.now()}`;
      const exportPath = `cypress/downloads/${exportFileBase}.svg`;

      cy.get('#tree-image-filename')
        .invoke('val', exportFileBase)
        .trigger('input')
        .trigger('change');

      cy.window()
        .its('commonService.visuals.phylogenetic.SelectedNetworkExportFileTypeListVariable')
        .should('equal', 'png');

      setExportFileType('svg');

      cy.window()
        .its('commonService.visuals.phylogenetic.SelectedNetworkExportFileTypeListVariable')
        .should('equal', 'svg');

      cy.get('#export-tree').click();
      cy.readFile(exportPath, 'utf8', { timeout: 30000 }).should((svgText) => {
        expect(svgText, 'exported SVG contents').to.contain('<svg');
      });
    });

    it('should change filename and export as jpeg', () => {
      const exportFileBase = `cypress_tree_test_${Date.now()}`;
      const exportPath = `cypress/downloads/${exportFileBase}.jpeg`;

      cy.get('#tree-image-filename')
        .invoke('val', exportFileBase)
        .trigger('input')
        .trigger('change');

      setExportFileType('jpeg');

      cy.window()
        .its('commonService.visuals.phylogenetic.SelectedNetworkExportFileTypeListVariable')
        .should('equal', 'jpeg');

      cy.get('#export-tree').click();
      cy.readFile(exportPath, 'binary', { timeout: 30000 }).should((jpegBinary) => {
        expect(jpegBinary.length, 'exported JPEG byte length').to.be.greaterThan(1000);
      });
    });

    it('should change filename and export newick string', () => {
      const exportFileBase = `cypress_tree_test_nwk_${Date.now()}`;
      const exportPath = `cypress/downloads/${exportFileBase}.txt`;

      cy.contains('.p-dialog-title', 'Export Phylogenetic Tree')
        .parents('.p-dialog')
        .contains('Newick')
        .click();

      cy.get('#newick-string-filename')
        .invoke('val', exportFileBase)
        .trigger('input')
        .trigger('change');

      cy.window()
        .its('commonService.visuals.phylogenetic.SelectedNewickStringFilenameVariable')
        .should('equal', exportFileBase);

      cy.get('#export-newick').click();

      cy.window().its('commonService.visuals.phylogenetic.tree.data').then((treeData: any) => {
        const expectedString = normalizeNewickText(treeData.toNewick(false));

        cy.readFile(exportPath, 'utf8', { timeout: 30000 }).should((savedText) => {
          expect(normalizeNewickText(savedText), 'saved Newick export').to.equal(expectedString);
        });
      });
    });
  });

  context('Settings', () => {
    beforeEach(() => {
      cy.get(SELECTORS.settingsBtn).click();
      cy.contains('.p-dialog-title', 'Phylogenetic Tree Settings')
        .should('be.visible')
        .parents('.p-dialog')
        .as('dialog');
    });

    it('should open and close the settings dialog', () => {
      cy.closeSettingsPane('Phylogenetic Tree Settings');
      cy.contains('.p-dialog-title', 'Phylogenetic Tree Settings').should('not.exist');
    });

    it('should change tree layout to vertical', () => {
      cy.window()
        .its('commonService.visuals.phylogenetic.SelectedTreeLayoutVariable')
        .should('equal', 'horizontal');

      cy.get('@dialog').contains('p-accordion-panel', 'Layout').click();
      cy.get('@dialog').find('#tree-layout').click();
      cy.contains('li[role="option"]', 'Vertical').click();

      cy.closeSettingsPane('Phylogenetic Tree Settings');

      cy.window()
        .its('commonService.visuals.phylogenetic.SelectedTreeLayoutVariable')
        .should('equal', 'vertical');
    });

    it('should change tree layout to circular', () => {
      cy.get('@dialog').contains('p-accordion-panel', 'Layout').click();
      cy.get('@dialog').find('#tree-layout').click();
      cy.contains('li[role="option"]', 'Circular').click();

      cy.closeSettingsPane('Phylogenetic Tree Settings');

      cy.window()
        .its('commonService.visuals.phylogenetic.SelectedTreeLayoutVariable')
        .should('equal', 'circular');
    });

    it('should change tree mode to smooth', () => {
      cy.window()
        .its('commonService.visuals.phylogenetic.SelectedTreeModeVariable')
        .should('equal', 'square');

      cy.get('@dialog').contains('p-accordion-panel', 'Mode').click();
      cy.get('@dialog').find('#tree-mode').click();
      cy.contains('li[role="option"]', 'Smooth').click();

      cy.closeSettingsPane('Phylogenetic Tree Settings');

      cy.window()
        .its('commonService.visuals.phylogenetic.SelectedTreeModeVariable')
        .should('equal', 'smooth');
    });

    it('should change tree type to Dendrogram', () => {
      cy.window()
        .its('commonService.visuals.phylogenetic.SelectedTreeTypeVariable')
        .should('equal', 'weighted');

      cy.get('@dialog').contains('p-accordion-panel', 'Type').click();
      cy.get('@dialog').find('#tree-type').click();
      cy.contains('li[role="option"]', 'Dendrogram').click();

      cy.closeSettingsPane('Phylogenetic Tree Settings');

      cy.window()
        .its('commonService.visuals.phylogenetic.SelectedTreeTypeVariable')
        .should('equal', 'dendrogram');
    });

    it('should toggle leaf labels on and off', () => {
      cy.get('@dialog').contains('Leaves').click();
      cy.get('@dialog').contains('Labels and Tooltips').click();

      cy.window()
        .its('commonService.visuals.phylogenetic.SelectedLeafLabelShowVariable')
        .then((initiallyShown) => {
          const initialState = Boolean(initiallyShown);
          const toggledState = !initialState;

          assertLeafLabelState(initialState);

          cy.get('@dialog')
            .find('#leaf-label-visibility')
            .contains(toggledState ? 'Show' : 'Hide')
            .click();

          assertLeafLabelState(toggledState);

          cy.get('@dialog')
            .find('#leaf-label-visibility')
            .contains(initialState ? 'Show' : 'Hide')
            .click();

          assertLeafLabelState(initialState);
        });
    });
  });
});
