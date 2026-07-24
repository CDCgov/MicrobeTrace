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
  internalNodeLabels: '#phylocanvas svg g.tidytree-node-internal text',
};
const BOOTSTRAP_CONFIRMATION_TEXT = 'Bootstrap support generates replicate trees by resampling columns from the alignment';

const openPhyloSettingsDialog = (): void => {
  cy.get(SELECTORS.settingsButton).click({ force: true });
  cy.contains('.p-dialog-title', 'Phylogenetic Tree Settings')
    .should('be.visible')
    .parents('.p-dialog')
    .as('phyloSettings');
};

const openBootstrapTab = (): void => {
  cy.get('@phyloSettings').contains('a', 'Bootstrap').click({ force: true });
  cy.get('@phyloSettings').find('#bootstrap-replicates').then(($replicates) => {
    if (!$replicates.is(':visible')) {
      cy.get('@phyloSettings').contains('p-accordion-header', 'Bootstrap').click({ force: true });
    }
  });
  cy.get('@phyloSettings').find('#bootstrap-replicates').should('be.visible');
};

const selectBootstrapDecimals = (label: string): void => {
  cy.get('@phyloSettings').find('#bootstrap-decimal-length').click({ force: true });
  cy.contains('li[role="option"]', label).click({ force: true });
};

const setBootstrapReplicates = (replicates: string): void => {
  cy.get('@phyloSettings').find('#bootstrap-replicates')
    .should('be.visible')
    .clear({ force: true })
    .type(replicates, { force: true });
  cy.get('@phyloSettings').find('#bootstrap-replicates')
    .should('have.value', replicates)
    .trigger('change', { force: true });
};

const assertBootstrapConfirmationVisible = (): void => {
  cy.contains('.p-dialog:visible', BOOTSTRAP_CONFIRMATION_TEXT, { timeout: 15000 })
    .as('bootstrapConfirmDialog')
    .should('contain.text', 'will not work with tree or distance matrix inputs')
    .and('contain.text', 'Are you sure that you want to proceed?');
};

const confirmBootstrapCalculation = (): void => {
  assertBootstrapConfirmationVisible();
  cy.get('@bootstrapConfirmDialog').contains('button', 'Confirm').click({ force: true });
  cy.contains('.p-dialog:visible', BOOTSTRAP_CONFIRMATION_TEXT).should('not.exist');
};

const calculateSmallBootstrap = (): void => {
  setBootstrapReplicates('5');
  cy.get('@phyloSettings').find('#calculate-bootstrap').click({ force: true });
  confirmBootstrapCalculation();
  cy.get('#bootstrap-status', { timeout: 60000 }).should('contain.text', 'Bootstrap support calculated');
};

const assertBootstrapLabelsVisible = (pattern: RegExp = /^\d+\.\d%$/): void => {
  cy.get(SELECTORS.internalNodeLabels, { timeout: 15000 }).should(($labels) => {
    const texts = Array.from($labels).map(label => String(label.textContent || '').trim()).filter(Boolean);
    expect(texts.some(text => pattern.test(text)), 'bootstrap support labels').to.equal(true);
  });
};

const persistPhyloAsDefaultView = (): void => {
  cy.window().then((win: WinWithMT) => {
    win.commonService.session.style.widgets['default-view'] = 'Phylogenetic Tree';
    win.commonService.GlobalSettingsModel.SelectedDefaultViewVariable = 'Phylogenetic Tree';
  });
};

describe('Journey Flow - Phylogenetic bootstrap support', () => {
  it('calculates sequence-backed bootstrap support and reformats labels', () => {
    let newickAfterBootstrap = '';

    launchProfileToPhyloTree(getProfile('phylo-snps16-fasta'));
    assertPhyloTreeReady();

    openPhyloSettingsDialog();
    openBootstrapTab();

    cy.window()
      .its('commonService.session.style.widgets')
      .should((widgets) => {
        expect(widgets['tree-bootstrap-stop-when-stable']).to.equal(false);
        expect(widgets['tree-bootstrap-custom-replicates']).to.equal(100);
        expect(widgets['tree-bootstrap-decimal-length']).to.equal(1);
      });
    cy.get('@phyloSettings').find('#bootstrap-replicates').should('have.value', '100');
    cy.get('@phyloSettings').find('#calculate-bootstrap').should('not.be.disabled');
    cy.get('@phyloSettings').find('#calculate-bootstrap').click({ force: true });
    assertBootstrapConfirmationVisible();
    cy.get('@bootstrapConfirmDialog').contains('button', 'Cancel').click({ force: true });
    cy.contains('.p-dialog:visible', BOOTSTRAP_CONFIRMATION_TEXT).should('not.exist');
    cy.get('#bootstrap-status').should('not.exist');

    calculateSmallBootstrap();

    cy.window()
      .its('commonService.session.data.phylogeneticBootstrap')
      .should((metadata) => {
        expect(metadata.completedReplicates).to.equal(5);
        expect(metadata.method).to.equal('snp-pseudoalignment-neighbor-joining');
        expect(Object.keys(metadata.supportBySplitKey || {}).length).to.be.greaterThan(0);
      });
    assertBootstrapLabelsVisible();
    cy.window().then((win: WinWithMT) => {
      newickAfterBootstrap = win.commonService.session.data.newickString;
      expect(newickAfterBootstrap).to.match(/\)(?:0(?:\.\d+)?|1(?:\.0+)?):/);
      expect(newickAfterBootstrap).not.to.include('%');
    });

    selectBootstrapDecimals('2');
    assertBootstrapLabelsVisible(/^\d+\.\d{2}%$/);
    cy.window().then((win: WinWithMT) => {
      expect(win.commonService.session.data.newickString).to.equal(newickAfterBootstrap);
    });

    setBootstrapReplicates('5000');
    cy.get('@phyloSettings').find('#bootstrap-replicates').should('have.value', '1000');
  });

  it('shows bootstrap as unavailable for matrix-only and Newick-only phylogeny inputs', () => {
    ['phylo-snps16-matrix', 'phylo-tn93-newick'].forEach((profileId) => {
      launchProfileToPhyloTree(getProfile(profileId));
      assertPhyloTreeReady();

      openPhyloSettingsDialog();
      openBootstrapTab();

      cy.get('@phyloSettings').find('#calculate-bootstrap').should('be.disabled');
      cy.get('#bootstrap-status').should('contain.text', 'sequence');
      cy.closeSettingsPane('Phylogenetic Tree Settings');
    });
  });

  it('can display an early stop when the stable-support rule is satisfied', () => {
    launchProfileToPhyloTree(getProfile('phylo-snps16-fasta'));
    assertPhyloTreeReady();

    openPhyloSettingsDialog();
    openBootstrapTab();
    setBootstrapReplicates('200');
    cy.get('@phyloSettings').find('#bootstrap-stop-stable').contains('Enable').click({ force: true });

    cy.window().then((win: WinWithMT) => {
      const phylo = win.commonService.visuals.phylogenetic;
      const input = phylo.getBootstrapInput();
      const supportBySplitKey = Object.fromEntries(input.baseSplitKeys.map((key: string) => [key, 100]));
      phylo.workerComputeService.computePhylogeneticBootstrap = (options: any) => {
        options.onProgress({
          completedReplicates: 100,
          requestedReplicates: 200,
          progressPercent: 50,
          stoppedEarly: true,
          stable: true,
        });
        return Promise.resolve({
          requestedReplicates: 200,
          completedReplicates: 100,
          stoppedEarly: true,
          stable: true,
          splitCounts: Object.fromEntries(input.baseSplitKeys.map((key: string) => [key, 100])),
          supportBySplitKey,
        });
      };
    });

    cy.get('@phyloSettings').find('#calculate-bootstrap').click({ force: true });
    confirmBootstrapCalculation();
    cy.get('#bootstrap-status', { timeout: 15000 }).should('contain.text', 'stabilized after 100 replicates');
    assertBootstrapLabelsVisible();
  });

  it('preserves bootstrap labels and metadata through a session round-trip', () => {
    const sessionFileBase = `cypress_phylo_bootstrap_session_${Date.now()}`;
    const sessionFilePath = `${Cypress.config('downloadsFolder')}/${sessionFileBase}.microbetrace`;

    launchProfileToPhyloTree(getProfile('phylo-snps16-fasta'));
    assertPhyloTreeReady();

    openPhyloSettingsDialog();
    openBootstrapTab();
    calculateSmallBootstrap();
    cy.closeSettingsPane('Phylogenetic Tree Settings');
    persistPhyloAsDefaultView();

    installSaveAsCaptureHook();
    saveSessionFromFileMenu(sessionFileBase);
    writeCapturedDownloadToDisk(`${sessionFileBase}.microbetrace`, sessionFilePath);

    visitAppAndAcceptEula();
    cy.get('#fileDropRef', { timeout: 15000 }).selectFile(sessionFilePath, { force: true });
    waitForProcessingDialogToClear(60000);
    cy.window({ timeout: 60000 })
      .its('commonService.session.network.isFullyLoaded')
      .should('equal', true);

    goToPhyloTreeView();
    assertPhyloTreeReady(60000);

    cy.window()
      .its('commonService.session.data.phylogeneticBootstrap')
      .should((metadata) => {
        expect(metadata.completedReplicates).to.equal(5);
        expect(Object.keys(metadata.supportBySplitKey || {}).length).to.be.greaterThan(0);
      });
    assertBootstrapLabelsVisible();
  });
});
