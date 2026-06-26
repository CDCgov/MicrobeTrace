/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertPhyloTreeReady,
  launchProfileToPhyloTree,
} from '../../../support/journey-helpers';

type WinWithMT = Window & {
  commonService: any;
};

const SELECTORS = {
  internalNodeGroups: '#phylocanvas svg g.tidytree-node-internal',
  settingsButton: '#tool-btn-container-phylo a[title="Settings"]',
  restoreTreeButton: '#tool-btn-container-phylo a[title="Restore Full Tree"]',
};

const profile = getProfile('load-phylo-tree-newick-snp-via-twod');

const openPhyloSettingsDialog = (): void => {
  cy.get(SELECTORS.settingsButton).click({ force: true });
  cy.contains('.p-dialog-title', 'Phylogenetic Tree Settings')
    .should('be.visible')
    .parents('.p-dialog')
    .as('phyloSettings');
};

const setBranchNodesVisible = (): void => {
  openPhyloSettingsDialog();
  cy.get('@phyloSettings').contains('a', 'Branches').click({ force: true });
  cy.get('@phyloSettings').contains('p-accordion-panel', 'Branch Nodes').click({ force: true });

  cy.window()
    .its('commonService.visuals.phylogenetic.SelectedBranchNodeShowVariable')
    .then((visible) => {
      if (Boolean(visible)) return;
      cy.get('@phyloSettings').find('#branch-node-visibility').contains('Show').click({ force: true });
    });

  cy.window()
    .its('commonService.visuals.phylogenetic.SelectedBranchNodeShowVariable')
    .should('equal', true);

  cy.closeSettingsPane('Phylogenetic Tree Settings');
};

const captureInitialTreeState = (): void => {
  cy.window().then((win: WinWithMT) => {
    const treeData = win.commonService.visuals.phylogenetic.tree.data;
    cy.wrap(treeData.toNewick(false)).as('initialTreeNewick');
    cy.wrap(treeData.getLeaves().length).as('initialLeafCount');
  });
};

const assertTreeMatchesInitialNewick = (): void => {
  cy.get('@initialTreeNewick').then((initialTreeNewick) => {
    cy.window().then((win: WinWithMT) => {
      expect(win.commonService.visuals.phylogenetic.tree.data.toNewick(false)).to.equal(initialTreeNewick);
    });
  });
};

const assertTreeDiffersFromInitialNewick = (): void => {
  cy.get('@initialTreeNewick').then((initialTreeNewick) => {
    cy.window().then((win: WinWithMT) => {
      expect(win.commonService.visuals.phylogenetic.tree.data.toNewick(false)).to.not.equal(initialTreeNewick);
    });
  });
};

const assertRestoreButtonState = (enabled: boolean): void => {
  cy.window()
    .its('commonService.visuals.phylogenetic.hasTreeBeenModifiedFromOriginal')
    .should(enabled ? 'be.true' : 'be.false');

  cy.get(SELECTORS.restoreTreeButton)
    .should('have.css', 'pointer-events', enabled ? 'auto' : 'none');
};

const openContextMenuOnInteractiveBranch = (): void => {
  cy.window().then((win: WinWithMT) => {
    const totalLeaves = win.commonService.visuals.phylogenetic.tree.data.getLeaves().length;

    cy.get(SELECTORS.internalNodeGroups).then(($groups) => {
      const match = Array.from($groups).find((group) => {
        const branch = (group as any).__data__?.data;
        const subtreeLeaves = typeof branch?.getLeaves === 'function' ? branch.getLeaves().length : 0;
        return subtreeLeaves > 1 && subtreeLeaves < totalLeaves;
      });

      expect(match, 'internal branch with a proper subtree').to.exist;

      cy.wrap(match as HTMLElement)
        .find('circle')
        .trigger('contextmenu', {
          force: true,
          button: 2,
          eventConstructor: 'MouseEvent',
          pageX: 300,
          pageY: 300,
          clientX: 300,
          clientY: 300,
        });
    });
  });

  cy.get('#phylo-context-menu').should('have.css', 'display', 'block');
};

const applyContextMenuAction = (actionId: 'reroot' | 'rotate' | 'flip' | 'view-subtree'): void => {
  openContextMenuOnInteractiveBranch();
  cy.get(`#${actionId}`).should('be.visible').click({ force: true });
};

describe('Journey Flow - Phylogenetic Tree context menu mutations on uploaded data', () => {
  beforeEach(() => {
    launchProfileToPhyloTree(profile);
    assertPhyloTreeReady();
    setBranchNodesVisible();
  });

  it('reroots a rendered uploaded tree branch and restores the original tree', () => {
    captureInitialTreeState();
    assertRestoreButtonState(false);

    applyContextMenuAction('reroot');

    assertTreeDiffersFromInitialNewick();
    assertRestoreButtonState(true);

    cy.get('@initialLeafCount').then((initialLeafCount) => {
      cy.window().then((win: WinWithMT) => {
        expect(win.commonService.visuals.phylogenetic.tree.data.getLeaves().length).to.equal(initialLeafCount);
      });
    });

    cy.get(SELECTORS.restoreTreeButton).click({ force: true });
    assertTreeMatchesInitialNewick();
    assertRestoreButtonState(false);
  });

  it('rotates a rendered uploaded tree branch and restores the original tree', () => {
    captureInitialTreeState();
    assertRestoreButtonState(false);

    applyContextMenuAction('rotate');

    assertTreeDiffersFromInitialNewick();
    assertRestoreButtonState(true);

    cy.get('@initialLeafCount').then((initialLeafCount) => {
      cy.window().then((win: WinWithMT) => {
        expect(win.commonService.visuals.phylogenetic.tree.data.getLeaves().length).to.equal(initialLeafCount);
      });
    });

    cy.get(SELECTORS.restoreTreeButton).click({ force: true });
    assertTreeMatchesInitialNewick();
    assertRestoreButtonState(false);
  });

  it('flips a rendered uploaded tree branch and restores the original tree', () => {
    captureInitialTreeState();
    assertRestoreButtonState(false);

    applyContextMenuAction('flip');

    assertTreeDiffersFromInitialNewick();
    assertRestoreButtonState(true);

    cy.get('@initialLeafCount').then((initialLeafCount) => {
      cy.window().then((win: WinWithMT) => {
        expect(win.commonService.visuals.phylogenetic.tree.data.getLeaves().length).to.equal(initialLeafCount);
      });
    });

    cy.get(SELECTORS.restoreTreeButton).click({ force: true });
    assertTreeMatchesInitialNewick();
    assertRestoreButtonState(false);
  });

  it('shows a subtree from the branch context menu and restores the full uploaded tree', () => {
    captureInitialTreeState();
    assertRestoreButtonState(false);

    applyContextMenuAction('view-subtree');

    assertTreeDiffersFromInitialNewick();
    assertRestoreButtonState(true);

    cy.get('@initialLeafCount').then((initialLeafCount) => {
      cy.window().then((win: WinWithMT) => {
        expect(
          win.commonService.visuals.phylogenetic.tree.data.getLeaves().length,
          'subtree leaf count',
        ).to.be.lessThan(initialLeafCount as number);
      });
    });

    cy.get(SELECTORS.restoreTreeButton).click({ force: true });
    assertTreeMatchesInitialNewick();

    cy.get('@initialLeafCount').then((initialLeafCount) => {
      cy.window().then((win: WinWithMT) => {
        expect(win.commonService.visuals.phylogenetic.tree.data.getLeaves().length).to.equal(initialLeafCount);
      });
    });

    assertRestoreButtonState(false);
  });
});
