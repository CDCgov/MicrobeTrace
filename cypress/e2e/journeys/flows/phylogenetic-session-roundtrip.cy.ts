/// <reference types="cypress" />
import { getProfile } from '../datasets/profile';
import {
  assertPhyloTreeReady,
  goToPhyloTreeView,
  installSaveAsCaptureHook,
  launchProfileToPhyloTree,
  saveSessionFromFileMenu,
  visitAppAndAcceptEula,
  waitForProcessingDialogToClear,
  writeCapturedDownloadToDisk,
} from '../../../support/journey-helpers';

type WinWithMT = Window & {
  commonService: any;
};

const SELECTORS = {
  settingsButton: '#tool-btn-container-phylo a[title="Settings"]',
  branchPaths: '#phylocanvas svg g.tidytree-link path',
  leafLabels: '#phylocanvas svg g.tidytree-node-leaf text',
};

const openPhyloSettingsDialog = (): void => {
  cy.get(SELECTORS.settingsButton).click({ force: true });
  cy.contains('.p-dialog-title', 'Phylogenetic Tree Settings')
    .should('be.visible')
    .parents('.p-dialog')
    .as('phyloSettings');
};

const openPhyloSettingsTab = (label: 'Tree' | 'Leaves'): void => {
  cy.get('@phyloSettings').contains('a', label).click({ force: true });
};

const openPhyloAccordion = (label: string): void => {
  cy.get('@phyloSettings').contains('p-accordion-panel', label).click({ force: true });
};

const assertLeafLabelsHidden = (): void => {
  cy.get(SELECTORS.leafLabels).then(($labels) => {
    expect($labels.length, 'leaf label elements').to.be.greaterThan(0);
    cy.wrap($labels.first()).should('not.be.visible');
  });
};

const persistPhyloAsDefaultView = (): void => {
  cy.window().then((win: WinWithMT) => {
    win.commonService.session.style.widgets['default-view'] = 'Phylogenetic Tree';
    win.commonService.GlobalSettingsModel.SelectedDefaultViewVariable = 'Phylogenetic Tree';
  });
};

const ensurePhyloViewAfterReload = (): void => {
  cy.wait(200).get('body', { timeout: 15000 }).then(($body) => {
    if ($body.find('#phylocanvas:visible').length) {
      assertPhyloTreeReady(60000);
      return;
    }

    goToPhyloTreeView();
    assertPhyloTreeReady(60000);
  });
};

describe('Journey Flow - Phylogenetic Tree session round-trip', () => {
  const profile = getProfile('load-phylo-tree-newick-snp-via-twod');

  it('restores uploaded phylogenetic settings after saving and reloading a session', () => {
    const sessionFileBase = `cypress_phylo_session_roundtrip_${Date.now()}`;
    const sessionFilePath = `${Cypress.config('downloadsFolder')}/${sessionFileBase}.microbetrace`;

    launchProfileToPhyloTree(profile);
    assertPhyloTreeReady();

    openPhyloSettingsDialog();

    openPhyloAccordion('Layout');
    cy.get('@phyloSettings').find('#tree-layout').click({ force: true });
    cy.contains('li[role="option"]', 'Circular').click();

    openPhyloAccordion('Mode');
    cy.get('@phyloSettings').find('#tree-mode').click({ force: true });
    cy.contains('li[role="option"]', 'Smooth').click();

    openPhyloSettingsTab('Leaves');
    openPhyloAccordion('Labels and Tooltips');
    cy.get('@phyloSettings').find('#leaf-label-visibility').contains('Hide').click({ force: true });

    cy.closeSettingsPane('Phylogenetic Tree Settings');
    persistPhyloAsDefaultView();

    cy.get(SELECTORS.branchPaths).first().invoke('attr', 'd').as('preSaveBranchPath');
    assertLeafLabelsHidden();

    installSaveAsCaptureHook();
    saveSessionFromFileMenu(sessionFileBase);
    writeCapturedDownloadToDisk(`${sessionFileBase}.microbetrace`, sessionFilePath);

    cy.readFile(sessionFilePath, 'utf8', { timeout: 30000 }).should((savedSession) => {
      expect(savedSession, 'saved .microbetrace content').to.include('"session"');
      expect(savedSession.length, 'saved .microbetrace length').to.be.greaterThan(100);
    });

    visitAppAndAcceptEula();
    cy.get('#fileDropRef', { timeout: 15000 }).selectFile(sessionFilePath, { force: true });
    waitForProcessingDialogToClear(60000);
    cy.window({ timeout: 60000 })
      .its('commonService.session.network.isFullyLoaded')
      .should('equal', true);

    ensurePhyloViewAfterReload();

    cy.window()
      .its('commonService.session.style.widgets')
      .should((widgets) => {
        expect(widgets['tree-layout-circular']).to.equal(true);
        expect(widgets['tree-mode-smooth']).to.equal(true);
        expect(widgets['tree-leaf-label-show']).to.equal(false);
      });

    cy.window().then((win: WinWithMT) => {
      const phylo = win.commonService.visuals.phylogenetic;
      expect(phylo.SelectedTreeLayoutVariable, 'reloaded tree layout').to.equal('circular');
      expect(phylo.SelectedTreeModeVariable, 'reloaded tree mode').to.equal('smooth');
      expect(phylo.SelectedLeafLabelShowVariable, 'reloaded leaf-label visibility').to.equal(false);
    });

    assertLeafLabelsHidden();

    cy.get('@preSaveBranchPath').then((preSaveBranchPath) => {
      cy.get(SELECTORS.branchPaths).first().should(($path) => {
        expect(String($path.attr('d')), 'reloaded branch path geometry').to.equal(String(preSaveBranchPath));
      });
    });
  });
});
