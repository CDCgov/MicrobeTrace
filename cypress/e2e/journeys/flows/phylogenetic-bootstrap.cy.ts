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
const mixedLabelProfile = {
  ...getProfile('phylo-tn93-newick'),
  files: [{ name: 'BootstrapMixedLabels.nwk', datatype: 'newick' as const }],
};

const assertExactSupportLabels = (visible: string[], hidden: string[] = [], size = 12): void => {
  cy.get(SELECTORS.internalNodeLabels).should(($labels) => {
    const supportLabels = Array.from($labels).filter(label => /^\d+(?:\.\d+)?$/.test(label.textContent || ''));
    const texts = (isVisible: boolean) => supportLabels
      .filter(label => (getComputedStyle(label).opacity !== '0') === isVisible)
      .map(label => label.textContent || '').sort();
    expect(texts(true), 'all visible support values').to.deep.equal([...visible].sort());
    expect(texts(false), 'all hidden support values').to.deep.equal([...hidden].sort());
    supportLabels.forEach(label => expect(getComputedStyle(label).fontSize).to.equal(`${size}px`));
  });
};

const assertNamedLabels = (visible: boolean, size = 12): void => {
  cy.get(SELECTORS.internalNodeLabels).should(($labels) => {
    const named = Array.from($labels).filter(label => /^Clade_[AB]$/.test(label.textContent || ''));
    expect(named.map(label => label.textContent).sort()).to.deep.equal(['Clade_A', 'Clade_B']);
    named.forEach(label => {
      expect(getComputedStyle(label).opacity).to.equal(visible ? '1' : '0');
      expect(getComputedStyle(label).fontSize).to.equal(`${size}px`);
    });
  });
};

const assertImportedCalculationDisabled = (): void => {
  openBootstrapTab();
  cy.get('@phyloSettings').find('#tree-bootstrap-tab-link').should('have.class', 'active');
  cy.get('@phyloSettings').find('#calculate-bootstrap').scrollIntoView().should('be.visible').and('be.disabled');
  cy.get('@phyloSettings').find('#bootstrap-status')
    .should('contain.text', 'This imported tree already contains support values.');
};

const setInternalLabelSize = (size: number): void => {
  openBootstrapSupportControls();
  cy.get('@phyloSettings').find('#internal-label-size').scrollIntoView().should('be.visible')
    .invoke('val', String(size)).trigger('input').trigger('change');
};

const openPhyloSettingsDialog = (): void => {
  cy.get(SELECTORS.settingsButton).click({ force: true });
  cy.get('.p-dialog:visible:has(#tree-bootstrap-tab-link)')
    .should('be.visible')
    .as('phyloSettings');
};

const openBootstrapTab = (): void => {
  cy.get('@phyloSettings').find('#tree-bootstrap-tab-link')
    .should('not.have.class', 'disabled')
    .click({ force: true });
  cy.get('@phyloSettings').contains('p-accordion-header', 'Calculate Bootstrap').then(($header) => {
    if ($header.attr('aria-expanded') !== 'true') {
      cy.wrap($header).scrollIntoView().click();
    }
  });
  cy.get('@phyloSettings').find('#bootstrap-replicates').scrollIntoView().should('be.visible');
};

const openBootstrapSupportControls = (): void => {
  cy.get('@phyloSettings').find('#tree-bootstrap-tab-link').click();
  cy.get('@phyloSettings').contains('p-accordion-header', 'Branch Node Labels/Support Values').then(($header) => {
    if ($header.attr('aria-expanded') !== 'true') {
      cy.wrap($header).scrollIntoView().click();
    }
  });
  cy.get('@phyloSettings').find('#internal-label-visibility').scrollIntoView().should('be.visible');
};

const assertInternalLabelControlsUnavailable = (): void => {
  openBootstrapSupportControls();
  cy.get('@phyloSettings').find('#internal-label-visibility [role="button"]')
    .should('have.length', 2).each($button => {
      cy.wrap($button).should('have.attr', 'data-p-disabled', 'true').and('have.attr', 'tabindex', '-1');
    });
  cy.get('@phyloSettings').should('contain.text', 'Load a tree with labels or calculate bootstrap support to enable these settings.');
  cy.get('@phyloSettings').find('#internal-label-size, #bootstrap-decimal-length, #bootstrap-support-threshold').should('not.exist');
  cy.window().then((win: WinWithMT) => {
    const widgets = win.commonService.session.style.widgets;
    const visibility = widgets['tree-node-label-show'];
    const legacyVisibility = widgets['tree-bootstrap-label-show'];
    // Intentionally try the disabled option: it must not change saved settings.
    cy.get('@phyloSettings').find('#internal-label-visibility').contains('Show').click({ force: true });
    cy.window().its('commonService.session.style.widgets').should(updated => {
      expect(updated['tree-node-label-show']).to.equal(visibility);
      expect(updated['tree-bootstrap-label-show']).to.equal(legacyVisibility);
    });
  });
};

const selectBootstrapDecimals = (label: string): void => {
  openBootstrapSupportControls();
  cy.get('@phyloSettings').find('#bootstrap-decimal-length').scrollIntoView().click();
  cy.get('li[role="option"]').contains(new RegExp(`^${label}$`)).click();
  cy.get('@phyloSettings').find('#bootstrap-decimal-length').should('contain.text', label);
  cy.get('.p-select-overlay:visible').should('not.exist');
};

const setBootstrapReplicates = (replicates: string): void => {
  openBootstrapTab();
  const normalizedReplicates = String(Math.min(1000, Math.max(1, Math.round(Number(replicates)))));
  cy.get('@phyloSettings').find('#bootstrap-replicates')
    .should('be.visible')
    .invoke('val', replicates)
    .trigger('input', { force: true })
    .trigger('change', { force: true })
    .should('have.value', normalizedReplicates);
};

const setBootstrapSupportThreshold = (threshold: string): void => {
  openBootstrapSupportControls();
  cy.get('@phyloSettings').find('#bootstrap-support-threshold')
    .clear({ force: true })
    .type(threshold, { force: true })
    .trigger('change', { force: true })
    .should('have.value', threshold);
};

const setInternalLabelsVisible = (visible: boolean): void => {
  openBootstrapSupportControls();
  cy.get('@phyloSettings').find('#internal-label-visibility')
    .contains(visible ? 'Show' : 'Hide')
    .closest('[role="button"]').should('have.attr', 'data-p-disabled', 'false').click()
    .should('have.attr', 'aria-pressed', 'true');
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

const assertBootstrapLabelsVisible = (pattern: RegExp = /^\d+\.\d$/): void => {
  cy.get(SELECTORS.internalNodeLabels, { timeout: 15000 }).should(($labels) => {
    const visibleTexts = Array.from($labels)
      .filter(label => getComputedStyle(label).opacity !== '0')
      .map(label => String(label.textContent || '').trim())
      .filter(Boolean);
    const supportTexts = visibleTexts.filter(text => /^\d+(?:\.\d+)?$/.test(text));
    expect(supportTexts.length, 'visible bootstrap support labels').to.be.greaterThan(0);
    expect(supportTexts.every(text => pattern.test(text)), 'all support labels use requested precision').to.equal(true);
  });
};

const assertBootstrapLabelsHidden = (): void => {
  cy.get(SELECTORS.internalNodeLabels, { timeout: 15000 }).should(($labels) => {
    const numericLabels = Array.from($labels)
      .filter(label => Number.isFinite(parseFloat(String(label.textContent || ''))));
    expect(numericLabels.length, 'bootstrap support labels').to.be.greaterThan(0);
    expect(
      numericLabels.every(label => getComputedStyle(label).opacity === '0'),
      'all bootstrap support labels hidden',
    ).to.equal(true);
  });
};

const persistPhyloAsDefaultView = (): void => {
  cy.window().then((win: WinWithMT) => {
    win.commonService.session.style.widgets['default-view'] = 'Phylogenetic Tree';
    win.commonService.GlobalSettingsModel.SelectedDefaultViewVariable = 'Phylogenetic Tree';
  });
};

const ensureRestoredTreeReady = (leafCount: number, nodeCount = leafCount): void => {
  // Wait for both the uploaded data and its saved dashboard to finish loading
  // before navigating or capturing DOM aliases.
  cy.window({ timeout: 60000 }).should((win: WinWithMT) => {
    // The empty startup session also reports "loaded" with no pending restore.
    // Require the uploaded session's data before testing completion flags.
    // Assert the count, not the sequence-bearing array: logging the full nodes
    // during retries can stall the runner and delay application callbacks.
    expect(win.commonService.session.data.nodes.length, 'restored session node count').to.equal(nodeCount);
    expect(win.commonService.session.network.isFullyLoaded, 'session loaded').to.equal(true);
    expect(win.commonService.pendingDashboardRestore, 'no pending layout restore').to.equal(null);
    expect(win.commonService.visuals.microbeTrace.applyingPendingDashboardRestore, 'layout restore finished').to.equal(false);
  });
  cy.get('body').then($body => {
    const treeTab = $body.find('.lm_tab[title="Phylogenetic Tree"]');
    if (treeTab.length) cy.wrap(treeTab).click();
    else goToPhyloTreeView();
  });
  cy.get('.lm_tab[title="Phylogenetic Tree"]').click();
  assertPhyloTreeReady(60000);
  cy.get('#phylocanvas svg g.tidytree-node-leaf', { timeout: 60000 }).should('have.length', leafCount);
  cy.get(SELECTORS.internalNodeLabels, { timeout: 60000 }).should($labels => {
    expect($labels.length, 'restored internal labels').to.be.greaterThan(0);
  });
};

describe('Journey Flow - Phylogenetic bootstrap support', () => {
  it('enables label settings on the default dataset only after bootstrap is calculated', () => {
    visitAppAndAcceptEula({ skipDemoSession: false, dismissWelcomeOverlay: true });
    // The welcome overlay closes before the sample data and dashboard finish loading.
    // Only 30 of its 33 network nodes have sequences for the tree.
    ensureRestoredTreeReady(30, 33);
    openPhyloSettingsDialog();
    assertInternalLabelControlsUnavailable();
    calculateSmallBootstrap();
    assertBootstrapLabelsVisible();
    setInternalLabelsVisible(false);
    assertBootstrapLabelsHidden();
    setInternalLabelsVisible(true);
    assertBootstrapLabelsVisible();
  });

  it('controls mixed names and support together while filtering only support values', () => {
    launchProfileToPhyloTree(mixedLabelProfile);
    assertPhyloTreeReady();
    assertExactSupportLabels(['95.5', '72.0', '100.0', '40.0']);
    assertNamedLabels(true);
    openPhyloSettingsDialog();
    // Display settings are expanded on first entering the Bootstrap tab.
    cy.get('@phyloSettings').find('#tree-bootstrap-tab-link').click();
    cy.get('@phyloSettings').find('#internal-label-visibility').should('be.visible');
    assertImportedCalculationDisabled();
    selectBootstrapDecimals('2');
    setInternalLabelSize(16);
    setBootstrapSupportThreshold('72');
    assertExactSupportLabels(['95.50', '72.00', '100.00'], ['40.00'], 16);
    assertNamedLabels(true, 16);
    setInternalLabelSize(14);
    assertNamedLabels(true, 14);
    assertExactSupportLabels(['95.50', '72.00', '100.00'], ['40.00'], 14);
    setInternalLabelsVisible(false);
    assertExactSupportLabels([], ['95.50', '72.00', '100.00', '40.00'], 14);
    assertNamedLabels(false, 14);
    setInternalLabelsVisible(true);
    assertNamedLabels(true, 14);
    setBootstrapSupportThreshold('100');
    assertExactSupportLabels(['100.00'], ['95.50', '72.00', '40.00'], 14);
    assertNamedLabels(true, 14);
    setBootstrapSupportThreshold('0');
    assertExactSupportLabels(['95.50', '72.00', '100.00', '40.00'], [], 14);
  });

  it('preserves imported support formatting across layout redraws and reopening the tree view', () => {
    launchProfileToPhyloTree(mixedLabelProfile);
    assertPhyloTreeReady();
    openPhyloSettingsDialog();
    selectBootstrapDecimals('2');
    setInternalLabelSize(14);
    setBootstrapSupportThreshold('90');
    cy.get('@phyloSettings').contains('a', 'Tree').click();
    cy.get('@phyloSettings').contains('p-accordion-header', 'Layout').click();
    cy.get('@phyloSettings').find('#tree-layout').click();
    cy.contains('li[role="option"]', 'Circular').click();
    assertExactSupportLabels(['95.50', '100.00'], ['72.00', '40.00'], 14);
    setInternalLabelsVisible(false);
    cy.closeSettingsPane('Phylogenetic Tree Settings');
    cy.get('.lm_tab[title="Phylogenetic Tree"]>.lm_close_tab').click({ force: true });
    cy.get('#phylocanvas').should('not.exist');
    goToPhyloTreeView();
    assertPhyloTreeReady();
    assertExactSupportLabels([], ['95.50', '72.00', '100.00', '40.00'], 14);
    assertNamedLabels(false, 14);
    openPhyloSettingsDialog();
    assertImportedCalculationDisabled();
    setInternalLabelsVisible(true);
    assertExactSupportLabels(['95.50', '100.00'], ['72.00', '40.00'], 14);
    assertNamedLabels(true, 14);
  });

  const sessionCases = [
    { version: 'current', title: 'preserves unified label settings through a session round-trip' },
    { version: 'separate', title: 'restores legacy separate support settings into the unified controls' },
    { version: 'defaults', title: 'defaults imported support to visible at 12px without saved support settings' },
  ];
  sessionCases.forEach(({ version, title }) => {
    it(title, () => {
      const defaultSettings = version === 'defaults';
      const restoredSize = defaultSettings ? 12 : 16;
      const filename = `cypress_imported_bootstrap_${version}_${Date.now()}.microbetrace`;
      const path = `${Cypress.config('downloadsFolder')}/${filename}`;
      launchProfileToPhyloTree(mixedLabelProfile);
      assertPhyloTreeReady();
      openPhyloSettingsDialog();
      selectBootstrapDecimals('2');
      setInternalLabelSize(16);
      setBootstrapSupportThreshold('72');
      setInternalLabelsVisible(false);
      cy.closeSettingsPane('Phylogenetic Tree Settings');
      persistPhyloAsDefaultView();
      installSaveAsCaptureHook();
      saveSessionFromFileMenu(filename.replace('.microbetrace', ''));
      writeCapturedDownloadToDisk(filename, path);
      cy.readFile(path).then(saved => {
        const payload = typeof saved === 'string' ? JSON.parse(saved) : saved;
        expect(payload.session.data.phylogeneticBootstrap, 'imported tree has no calculated metadata').to.be.null;
        const widgets = payload.session.style.widgets;
        expect(widgets['tree-node-label-show']).to.equal(false);
        expect(widgets['tree-node-label-size']).to.equal(16);
        if (version !== 'current') {
          delete widgets['tree-node-label-show'];
          delete widgets['tree-node-label-size'];
          if (defaultSettings) {
            delete widgets['tree-bootstrap-label-show'];
            delete widgets['tree-bootstrap-label-size'];
          } else {
            // Conflicting old branch preferences must not override support preferences.
            widgets['tree-branch-label-show'] = true;
            widgets['tree-branch-label-size'] = 9;
          }
          cy.writeFile(path, payload);
        }
      });
      visitAppAndAcceptEula();
      cy.window().then((win: WinWithMT) => {
        cy.spy(win.commonService.visuals.microbeTrace, 'Viewclick').as('restoreViewClick');
      });
      cy.get('#fileDropRef').selectFile(path, { force: true });
      waitForProcessingDialogToClear(60000);
      cy.window().its('commonService.session.network.isFullyLoaded').should('equal', true);
      ensureRestoredTreeReady(8);
      // Restoring a saved dashboard must not open a disposable default tree
      // through Viewclick before loading the final layout.
      cy.get('@restoreViewClick').should('not.have.been.calledWith', 'Phylogenetic Tree');
      assertNamedLabels(defaultSettings, restoredSize);
      if (defaultSettings) {
        assertExactSupportLabels(['95.50', '72.00', '100.00'], ['40.00'], 12);
      } else {
        assertExactSupportLabels([], ['95.50', '72.00', '100.00', '40.00'], 16);
      }
      openPhyloSettingsDialog();
      assertImportedCalculationDisabled();
      setInternalLabelsVisible(true);
      cy.get('@phyloSettings').find('#bootstrap-decimal-length').should('contain.text', '2');
      cy.get('@phyloSettings').find('#bootstrap-support-threshold').should('have.value', '72');
      assertExactSupportLabels(['95.50', '72.00', '100.00'], ['40.00'], restoredSize);
      assertNamedLabels(true, restoredSize);
    });
  });

  it('shows newly recalculated support after hiding labels and retains the shared label size', () => {
    launchProfileToPhyloTree(getProfile('phylo-snps16-fasta'));
    assertPhyloTreeReady();
    openPhyloSettingsDialog();
    calculateSmallBootstrap();
    setInternalLabelSize(14);
    setInternalLabelsVisible(false);
    assertBootstrapLabelsHidden();
    setBootstrapReplicates('7');
    cy.get('@phyloSettings').find('#calculate-bootstrap').should('not.be.disabled').click();
    confirmBootstrapCalculation();
    cy.get('#bootstrap-status', { timeout: 60000 }).should('contain.text', 'calculated from 7 replicates');
    cy.window().its('commonService.session.data.phylogeneticBootstrap').should(metadata => {
      expect(metadata.requestedReplicates).to.equal(7);
      expect(metadata.completedReplicates).to.equal(7);
    });
    cy.window().its('commonService.session.style.widgets').should(widgets => {
      expect(widgets['tree-node-label-show']).to.equal(true);
      expect(widgets['tree-node-label-size']).to.equal(14);
    });
    assertBootstrapLabelsVisible();
    cy.get(SELECTORS.internalNodeLabels).should('have.css', 'font-size', '14px');
    openBootstrapSupportControls();
    cy.get('@phyloSettings').find('#internal-label-visibility').contains('Show')
      .closest('[role="button"]').should('have.attr', 'aria-pressed', 'true');
  });

  it('calculates sequence-backed bootstrap support and reformats labels', () => {
    let newickAfterBootstrap = '';

    launchProfileToPhyloTree(getProfile('phylo-snps16-fasta'));
    assertPhyloTreeReady();

    openPhyloSettingsDialog();
    assertInternalLabelControlsUnavailable();
    openBootstrapTab();

    cy.window()
      .its('commonService.session.style.widgets')
      .should((widgets) => {
        expect(widgets['tree-bootstrap-stop-when-stable']).to.equal(false);
        expect(widgets['tree-bootstrap-custom-replicates']).to.equal(100);
        expect(widgets['tree-bootstrap-decimal-length']).to.equal(1);
        expect(widgets['tree-bootstrap-label-show']).to.equal(true);
        expect(widgets['tree-bootstrap-label-size']).to.equal(12);
        expect(widgets['tree-bootstrap-support-threshold']).to.equal(0);
      });
    cy.get('@phyloSettings').find('#bootstrap-replicates').should('have.value', '100');
    cy.get('@phyloSettings').find('#calculate-bootstrap').should('not.be.disabled');
    cy.get('@phyloSettings').find('#calculate-bootstrap').click({ force: true });
    assertBootstrapConfirmationVisible();
    cy.get('@bootstrapConfirmDialog').contains('button', 'Cancel').click({ force: true });
    cy.contains('.p-dialog:visible', BOOTSTRAP_CONFIRMATION_TEXT).should('not.exist');
    cy.get('#bootstrap-status').should('not.exist');
    assertInternalLabelControlsUnavailable();

    calculateSmallBootstrap();
    cy.get('@phyloSettings').find('#tree-bootstrap-tab-link').should('not.have.class', 'disabled');

    cy.window()
      .its('commonService.session.data.phylogeneticBootstrap')
      .should((metadata) => {
        expect(metadata.completedReplicates).to.equal(5);
        expect(metadata.method).to.equal('snp-pseudoalignment-neighbor-joining');
        expect(Object.keys(metadata.supportBySplitKey || {}).length).to.be.greaterThan(0);
      });
    assertBootstrapLabelsVisible();
    openBootstrapSupportControls();
    cy.get('@phyloSettings').find('#internal-label-visibility [role="button"]')
      .each($button => cy.wrap($button).should('have.attr', 'data-p-disabled', 'false'));
    cy.window().then((win: WinWithMT) => {
      newickAfterBootstrap = win.commonService.session.data.newickString;
      expect(newickAfterBootstrap).to.match(/\)(?:0(?:\.\d+)?|1(?:\.0+)?):/);
      expect(newickAfterBootstrap).not.to.include('%');
    });

    selectBootstrapDecimals('2');
    assertBootstrapLabelsVisible(/^\d+\.\d{2}$/);
    cy.window().then((win: WinWithMT) => {
      expect(win.commonService.session.data.newickString).to.equal(newickAfterBootstrap);
    });

    setBootstrapReplicates('5000');
    cy.get('@phyloSettings').find('#bootstrap-replicates').should('have.value', '1000');

    cy.window().then((win: WinWithMT) => {
      const phylo = win.commonService.visuals.phylogenetic;
      phylo.hasTreeBeenModifiedFromOriginal = true;
      phylo.cdref.detectChanges();
    });
    cy.get('@phyloSettings').find('#calculate-bootstrap').should('be.disabled');
    cy.get('#bootstrap-status')
      .should('contain.text', 'Bootstrap support calculated from 5 replicates.')
      .and('contain.text', 'Restore the full tree before calculating bootstrap support.');
  });

  it('formats and filters bootstrap support imported with a Newick tree', () => {
    launchProfileToPhyloTree(getProfile('phylo-tn93-newick'));
    assertPhyloTreeReady();
    assertBootstrapLabelsVisible();

    openPhyloSettingsDialog();
    assertImportedCalculationDisabled();
    openBootstrapSupportControls();

    assertBootstrapLabelsVisible();
    selectBootstrapDecimals('2');
    assertBootstrapLabelsVisible(/^\d+\.\d{2}$/);

    setBootstrapSupportThreshold('90');
    cy.get(SELECTORS.internalNodeLabels).should(($labels) => {
      const supportLabels = Array.from($labels)
        .map(label => ({
          value: parseFloat(String(label.textContent || '')),
          opacity: getComputedStyle(label).opacity,
        }))
        .filter(label => Number.isFinite(label.value));
      const visible = supportLabels.filter(label => label.opacity !== '0');
      const hidden = supportLabels.filter(label => label.opacity === '0');

      expect(visible.length, 'visible support labels').to.be.greaterThan(0);
      expect(hidden.length, 'hidden support labels').to.be.greaterThan(0);
      expect(visible.every(label => label.value >= 90), 'visible labels meet threshold').to.equal(true);
    });

    setInternalLabelSize(16);
    cy.get(SELECTORS.internalNodeLabels).should(($labels) => {
      const visibleSupportLabel = Array.from($labels).find(label =>
        Number.isFinite(parseFloat(String(label.textContent || ''))) && getComputedStyle(label).opacity !== '0'
      );
      expect(visibleSupportLabel, 'visible support label').to.exist;
      expect(getComputedStyle(visibleSupportLabel!).fontSize).to.equal('16px');
    });

    setInternalLabelsVisible(false);
    assertBootstrapLabelsHidden();
    setInternalLabelsVisible(true);
    assertBootstrapLabelsVisible(/^\d+\.\d{2}$/);
  });

  it('keeps bootstrap guidance available for inputs without bootstrap support', () => {
    ['phylo-snps16-matrix', 'phylo-newick-without-bootstrap'].forEach(profileId => {
      launchProfileToPhyloTree(getProfile(profileId));
      assertPhyloTreeReady();

      openPhyloSettingsDialog();
      assertInternalLabelControlsUnavailable();
      openBootstrapTab();

      cy.get('@phyloSettings').find('#calculate-bootstrap').should('be.disabled');
      cy.get('#bootstrap-status').should('contain.text', 'sequence');
      cy.closeSettingsPane('Phylogenetic Tree Settings');
    });
  });

  it('enables imported node names without treating a numeric root or leaf names as support', () => {
    launchProfileToPhyloTree({
      ...mixedLabelProfile,
      files: [{ name: 'BranchNamedLabels.nwk', datatype: 'newick' as const }],
    });
    assertPhyloTreeReady();
    openPhyloSettingsDialog();
    setInternalLabelsVisible(true);
    cy.get('@phyloSettings').find('#bootstrap-decimal-length, #bootstrap-support-threshold').should('not.exist');
    setInternalLabelSize(14);
    assertNamedLabels(true, 14);
    cy.get(SELECTORS.internalNodeLabels).should($labels => {
      const root = Array.from($labels).find(label => label.textContent === '0.95');
      expect(root, 'numeric root remains a literal node label').to.exist;
      expect(getComputedStyle(root!).opacity).to.equal('1');
      expect(getComputedStyle(root!).fontSize).to.equal('14px');
      expect(Array.from($labels).map(label => label.textContent).filter(Boolean).sort())
        .to.deep.equal(['0.95', 'Clade_A', 'Clade_B']);
    });
    cy.get('#phylocanvas svg g.tidytree-node-leaf text').should($labels => {
      expect(Array.from($labels).map(label => label.textContent).sort()).to.deep.equal(['0.8', '95', 'A', 'B']);
    });
    setInternalLabelsVisible(false);
    assertNamedLabels(false, 14);
    cy.get(SELECTORS.internalNodeLabels).should('have.css', 'opacity', '0');
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
    openBootstrapSupportControls();
    setInternalLabelSize(14);
    setInternalLabelsVisible(false);
    assertBootstrapLabelsHidden();
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

    ensureRestoredTreeReady(30);

    cy.window()
      .its('commonService.session.data.phylogeneticBootstrap')
      .should((metadata) => {
        expect(metadata.completedReplicates).to.equal(5);
        expect(Object.keys(metadata.supportBySplitKey || {}).length).to.be.greaterThan(0);
      });
    cy.window()
      .its('commonService.session.style.widgets')
      .should((widgets) => {
        expect(widgets['tree-node-label-show']).to.equal(false);
        expect(widgets['tree-node-label-size']).to.equal(14);
        expect(widgets['tree-bootstrap-label-show']).to.equal(false);
        expect(widgets['tree-bootstrap-label-size']).to.equal(14);
      });
    assertBootstrapLabelsHidden();

    openPhyloSettingsDialog();
    cy.get('@phyloSettings').find('#tree-bootstrap-tab-link').should('not.have.class', 'disabled');
    setInternalLabelsVisible(true);
    assertBootstrapLabelsVisible();
  });
});
