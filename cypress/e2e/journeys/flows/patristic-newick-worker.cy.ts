/// <reference types="cypress" />

import { getProfile, type DatasetProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  assertMetricCount,
  applyPreLaunchFileSettings,
  ensureTwoDNetworkView,
  ensurePreLaunchProfileSynced,
  launchAndWaitForProcessing,
  launchProfileToTwoD,
  openGlobalFilteringTab,
  saveSessionFromFileMenu,
  setGlobalLinkThreshold,
  visitAppAndAcceptEula,
  waitForProcessingDialogToClear,
} from '../../../support/journey-helpers';

const TN93_NEWICK_FILE = 'AngularTesting_seqs_TN93_BS.nwk';
const SYNTHETIC_SNP_FILE = 'PatristicSynthetic_snp_gt1.nwk';
const DUPLICATE_TIP_FILE = 'PatristicDuplicateTips.nwk';
const CORRECTED_TIP_FILE = 'PatristicCorrectedTips.nwk';
const INVALID_ROOT_DEPTH_FILE = 'PatristicInvalidRootDepth.nwk';
const NEGATIVE_BRANCH_FILE = 'PatristicNegativeBranch.nwk';
const NEGATIVE_TERMINAL_BRANCH_FILE = 'PatristicNegativeTerminalBranch.nwk';
const MULTIPLE_NEGATIVE_BRANCHES_A_FILE = 'PatristicMultipleNegativeBranchesA.nwk';
const MULTIPLE_NEGATIVE_BRANCHES_B_FILE = 'PatristicMultipleNegativeBranchesB.nwk';

const tn93Profile = getProfile('load-twod-newick-tn93-angular-testing');

const highThresholdGuardrailProfile: DatasetProfile = {
  ...tn93Profile,
  id: 'patristic-guardrail-initial-fallback',
  title: 'TN93 Newick renders a bounded backbone when initial threshold exceeds guardrail',
  preLaunch: {
    ...tn93Profile.preLaunch,
    threshold: 0.02,
  },
};

const syntheticSnpProfile: DatasetProfile = {
  id: 'patristic-synthetic-snp-gt1',
  title: 'Synthetic SNP Newick switches metric after patristic import',
  tags: ['newick', 'snp', 'patristic-worker'],
  files: [
    {
      name: SYNTHETIC_SNP_FILE,
      datatype: 'newick',
    },
  ],
  preLaunch: {
    metric: 'tn93',
    threshold: 0.015,
    defaultView: '2D Network',
  },
  expectations: {},
};

const duplicateTipProfile: DatasetProfile = {
  id: 'patristic-duplicate-tip-validation',
  title: 'Duplicate-tip Newick is rejected by patristic import',
  tags: ['newick', 'patristic-worker', 'invalid'],
  files: [
    {
      name: DUPLICATE_TIP_FILE,
      datatype: 'newick',
    },
  ],
  preLaunch: {
    metric: 'tn93',
    threshold: 0.015,
    defaultView: '2D Network',
  },
  expectations: {},
};

const correctedTipProfile: DatasetProfile = {
  id: 'patristic-corrected-tip-retry',
  title: 'Corrected-tip Newick loads after a duplicate-tip failure',
  tags: ['newick', 'patristic-worker'],
  files: [
    {
      name: CORRECTED_TIP_FILE,
      datatype: 'newick',
    },
  ],
  preLaunch: {
    metric: 'tn93',
    threshold: 0.02,
    defaultView: '2D Network',
  },
  expectations: {},
};

const invalidRootDepthProfile: DatasetProfile = {
  id: 'patristic-invalid-root-depth-validation',
  title: 'Malformed Newick reports its validation reason',
  tags: ['newick', 'patristic-worker', 'invalid'],
  files: [
    {
      name: INVALID_ROOT_DEPTH_FILE,
      datatype: 'newick',
    },
  ],
  preLaunch: {
    metric: 'tn93',
    threshold: 0.015,
    defaultView: '2D Network',
  },
  expectations: {},
};

const negativeBranchProfile: DatasetProfile = {
  id: 'patristic-negative-branch-normalization',
  title: 'Negative internal Newick branches are normalized with a warning',
  tags: ['newick', 'patristic-worker'],
  files: [
    {
      name: NEGATIVE_BRANCH_FILE,
      datatype: 'newick',
    },
  ],
  preLaunch: {
    metric: 'tn93',
    threshold: 0.015,
    defaultView: '2D Network',
  },
  expectations: {},
};

const negativeTerminalBranchProfile: DatasetProfile = {
  id: 'patristic-negative-terminal-branch-normalization',
  title: 'Negative terminal Newick branches are normalized for NJ round trips',
  tags: ['newick', 'patristic-worker'],
  files: [
    {
      name: NEGATIVE_TERMINAL_BRANCH_FILE,
      datatype: 'newick',
    },
  ],
  preLaunch: {
    metric: 'tn93',
    threshold: 0.015,
    defaultView: '2D Network',
  },
  expectations: {},
};

const multipleNegativeBranchesProfile: DatasetProfile = {
  id: 'patristic-multiple-negative-branch-normalization',
  title: 'Multiple Newick files aggregate negative-branch warnings',
  tags: ['newick', 'patristic-worker'],
  files: [
    {
      name: MULTIPLE_NEGATIVE_BRANCHES_A_FILE,
      datatype: 'newick',
    },
    {
      name: MULTIPLE_NEGATIVE_BRANCHES_B_FILE,
      datatype: 'newick',
    },
  ],
  preLaunch: {
    metric: 'tn93',
    threshold: 0.015,
    defaultView: '2D Network',
  },
  expectations: {},
};

const assertVisibleLinkCount = (expected: number): void => {
  assertMetricCount('#numberOfVisibleLinks', expected, 30000);

  cy.window({ timeout: 30000 }).should((win: any) => {
    const visibleEdges = win.cytoscapeInstance.edges(':visible');
    expect(visibleEdges.length, 'visible Cytoscape edge count').to.equal(expected);
  });
};

const assertStoredNewickString = (): void => {
  cy.window().should((win: any) => {
    const newick = String(win.commonService.session.data.newickString || '').trim();
    expect(newick, 'stored Newick string').to.not.equal('');
  });
};

const assertVisibleEdgesHaveNewickMetadata = (fileName: string): void => {
  cy.window().then((win: any) => {
    const visibleEdges = win.cytoscapeInstance.edges(':visible');

    expect(visibleEdges.length, 'visible Newick-derived edges').to.be.greaterThan(0);

    visibleEdges.forEach((edge: any) => {
      const data = edge.data();
      const distance = Number(data.distance);

      expect(distance, `numeric distance for ${edge.id()}`).to.be.finite;
      expect(data.hasDistance, `hasDistance for ${edge.id()}`).to.equal(true);
      expect(data.origin, `origin for ${edge.id()}`).to.include(fileName);
      expect(data.distanceOrigin, `distanceOrigin for ${edge.id()}`).to.equal(fileName);
    });
  });
};

const assertVisibleEdgesHaveNumericDistances = (): void => {
  cy.window().then((win: any) => {
    const visibleEdges = win.cytoscapeInstance.edges(':visible');

    expect(visibleEdges.length, 'visible edges with distances').to.be.greaterThan(0);

    visibleEdges.forEach((edge: any) => {
      expect(Number(edge.data('distance')), `distance for ${edge.id()}`).to.be.finite;
      expect(edge.data('hasDistance'), `hasDistance for ${edge.id()}`).to.equal(true);
    });
  });
};

const setThresholdAndAssertVisibleLinks = (threshold: number, expectedVisibleLinks: number): void => {
  openGlobalFilteringTab();
  setGlobalLinkThreshold(threshold);
  cy.closeGlobalSettings();
  waitForProcessingDialogToClear(60000);
  assertVisibleLinkCount(expectedVisibleLinks);
};

const confirmNegativeBranchWarning = (fileName: string, normalizedBranchCount = 1): void => {
  const branchLabel = normalizedBranchCount === 1 ? 'branch length' : 'branch lengths';
  const pronoun = normalizedBranchCount === 1 ? 'it' : 'them';

  cy.contains('.p-dialog-title', 'NWK Branch Length Warning', { timeout: 30000 })
    .should('be.visible')
    .parents('.p-dialog')
    .as('newickBranchWarning');

  cy.get('@newickBranchWarning')
    .should(
      'contain.text',
      `MicrobeTrace found ${normalizedBranchCount} negative ${branchLabel} in ${fileName} and set ${pronoun} to zero before processing.`,
    )
    .contains('button', 'OK')
    .should('be.visible')
    .click({ force: true });
};

const launchAndCaptureNewickError = (expectedMessage: string): void => {
  cy.get('#launch', { timeout: 15000 }).should('not.be.disabled');
  cy.get('#launch').click({ force: true });

  cy.contains('.p-dialog-title', 'Unable to Process NWK', { timeout: 30000 })
    .should('be.visible')
    .parents('.p-dialog')
    .as('newickErrorDialog');

  cy.get('@newickErrorDialog').should('contain.text', expectedMessage);
  waitForProcessingDialogToClear(30000);
};

describe('Journey Flow - Patristic Newick worker safeguards', () => {
  it('preserves Newick launch counts, distances, and file metadata', () => {
    launchProfileToTwoD(tn93Profile);
    cy.contains('.p-dialog-title', 'NWK Branch Length Warning').should('not.exist');
    assertAfterLaunchCounts(tn93Profile);
    assertStoredNewickString();
    assertVisibleEdgesHaveNewickMetadata(TN93_NEWICK_FILE);
  });

  it('recovers threshold-passing Newick edges when threshold moves upward and downward', () => {
    launchProfileToTwoD(tn93Profile);
    assertVisibleLinkCount(14);

    setThresholdAndAssertVisibleLinks(0.02, 45);
    setThresholdAndAssertVisibleLinks(0.001, 2);
    setThresholdAndAssertVisibleLinks(0.015, 14);
  });

  it('reuses the cached Newick tree when only trailing whitespace changes', () => {
    launchProfileToTwoD(tn93Profile);
    assertVisibleLinkCount(14);

    let initialTreeInitCount = 0;
    cy.window().then((win: any) => {
      initialTreeInitCount = Number(
        win.commonService.session.meta.performance.patristic.treeInitCount || 0,
      );
      win.commonService.session.data.newickString += '\r\n  ';
    });

    setThresholdAndAssertVisibleLinks(0.02, 45);

    cy.window().should((win: any) => {
      expect(
        Number(win.commonService.session.meta.performance.patristic.treeInitCount || 0),
        'tree init count after whitespace-only Newick change',
      ).to.equal(initialTreeInitCount);
    });
  });

  it('warns and skips additional Newick edges when a threshold exceeds the browser guardrail', () => {
    visitAppAndAcceptEula();
    cy.loadFiles(tn93Profile.files);
    applyPreLaunchFileSettings(tn93Profile);
    ensurePreLaunchProfileSynced(tn93Profile);

    cy.window().then((win: any) => {
      win.commonService.session.meta.guardrails = {
        newickVisibleLinkWarningThreshold: 20,
        newickVisibleLinkHardLimit: 20,
      };
    });

    launchAndWaitForProcessing(60000);
    ensureTwoDNetworkView();
    assertVisibleLinkCount(14);

    openGlobalFilteringTab();
    setGlobalLinkThreshold(0.02);
    cy.closeGlobalSettings();
    waitForProcessingDialogToClear(60000);

    cy.get('#network-guardrail-warning', { timeout: 30000 })
      .should('be.visible')
      .and('contain.text', 'exceeded the 20 visible-link browser guardrail');

    assertVisibleLinkCount(14);

    cy.window().should((win: any) => {
      const warning = win.commonService.session.warnings.find((entry: any) => (
        entry?.type === 'newick-visible-link-guardrail'
      ));
      expect(warning, 'Newick visible-link guardrail warning').to.exist;
      expect(warning.hardLimitHit, 'hard limit hit').to.equal(true);
      expect(warning.hardLimit, 'hard limit').to.equal(20);
      expect(
        win.commonService.session.meta.performance.patristic.edgeGeneration.guardrail.hardLimitHit,
        'patristic guardrail telemetry',
      ).to.equal(true);
    });
  });

  it('renders a nearest-neighbor backbone when the initial Newick threshold exceeds the browser guardrail', () => {
    visitAppAndAcceptEula();
    cy.loadFiles(highThresholdGuardrailProfile.files);
    applyPreLaunchFileSettings(highThresholdGuardrailProfile);
    ensurePreLaunchProfileSynced(highThresholdGuardrailProfile);

    cy.window().then((win: any) => {
      win.commonService.session.meta.guardrails = {
        newickVisibleLinkWarningThreshold: 20,
        newickVisibleLinkHardLimit: 20,
      };
    });

    launchAndWaitForProcessing(60000);
    ensureTwoDNetworkView();

    cy.get('#network-guardrail-warning', { timeout: 30000 })
      .should('be.visible')
      .and('contain.text', 'exceeded the 20 visible-link browser guardrail')
      .and('contain.text', 'nearest-neighbor tree backbone');

    cy.window().should((win: any) => {
      const visibleEdges = win.cytoscapeInstance.edges(':visible');
      const warning = win.commonService.session.warnings.find((entry: any) => (
        entry?.type === 'newick-visible-link-guardrail'
      ));
      const fallback = win.commonService.session.meta.performance.patristic.edgeGeneration.fallback;

      expect(visibleEdges.length, 'fallback visible Newick edge count').to.be.greaterThan(0);
      expect(visibleEdges.length, 'fallback visible Newick edge count').to.be.at.most(20);
      expect(warning?.hardLimitHit, 'hard limit hit').to.equal(true);
      expect(warning?.fallbackApplied, 'fallback warning marker').to.equal(true);
      expect(fallback?.type, 'fallback telemetry type').to.equal('nearest-neighbor-backbone');
      expect(fallback?.totalLinks, 'fallback telemetry link count').to.be.greaterThan(0);
      expect(warning?.fallbackLinkCount, 'fallback warning link count').to.equal(fallback.totalLinks);
    });
  });

  it('preserves raised-threshold Newick state through a session save and reload', () => {
    const sessionFileBase = `cypress_patristic_newick_roundtrip_${Date.now()}`;
    const sessionFilePath = `${Cypress.config('downloadsFolder')}/${sessionFileBase}.microbetrace`;

    launchProfileToTwoD(tn93Profile);
    setThresholdAndAssertVisibleLinks(0.02, 45);

    cy.window().then((win: any) => {
      cy.wrap(String(win.commonService.session.data.newickString || '').trim(), { log: false }).as('savedNewick');
    });

    saveSessionFromFileMenu(sessionFileBase);

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

    ensureTwoDNetworkView();
    assertVisibleLinkCount(45);

    cy.window().then((win: any) => {
      expect(Number(win.commonService.session.style.widgets['link-threshold']), 'reloaded link threshold').to.equal(0.02);
    });

    cy.get<string>('@savedNewick').then((savedNewick) => {
      cy.window().then((win: any) => {
        expect(String(win.commonService.session.data.newickString || '').trim(), 'reloaded Newick string').to.equal(savedNewick);
      });
    });
  });

  it('preserves SNP metric detection for Newick distances greater than one', () => {
    launchProfileToTwoD(syntheticSnpProfile);

    assertMetricCount('#numberOfNodes', 3);
    assertVisibleLinkCount(3);

    cy.window().should((win: any) => {
      const widgets = win.commonService.session.style.widgets;

      expect(widgets['default-distance-metric'], 'session distance metric').to.equal('snps');
      expect(Number(widgets['link-threshold']), 'session SNP threshold').to.equal(16);
      expect(win.commonService.GlobalSettingsModel.SelectedDistanceMetricVariable, 'global distance metric').to.equal('snps');
      expect(Number(win.commonService.GlobalSettingsModel.SelectedLinkThresholdVariable), 'global SNP threshold').to.equal(16);
    });

    openGlobalFilteringTab();
    cy.get('#link-threshold').invoke('val').should((value) => {
      expect(Number(value), 'threshold input value').to.equal(16);
    });
    cy.closeGlobalSettings();
    assertVisibleEdgesHaveNumericDistances();
  });

  it('rejects duplicate-tip Newick input without creating a corrupt network', () => {
    visitAppAndAcceptEula();
    cy.loadFiles(duplicateTipProfile.files);

    launchAndCaptureNewickError(
      'Unable to process NWK due to duplication in leaf names. Please re-try after fixing the naming issue.',
    );
    cy.get('#loading-information-modal').should('not.be.visible');
    cy.get('#loading-information-modal img[alt="logo"]').should('not.exist');

    cy.window().should((win: any) => {
      expect(win.commonService.session.network.isFullyLoaded, 'network should not finish loading').to.equal(false);
      expect(win.commonService.session.data.nodes || [], 'nodes after duplicate-tip rejection').to.have.length(0);
      expect(win.commonService.session.data.links || [], 'links after duplicate-tip rejection').to.have.length(0);
      expect(
        win.commonService.session.files.some((file: any) => file.name === DUPLICATE_TIP_FILE),
        'duplicate-tip file remains available for correction/replacement',
      ).to.equal(true);
    });

    cy.contains('#file-table .file-table-row', DUPLICATE_TIP_FILE).should('be.visible');
    cy.get('#launch').should('be.visible').and('not.be.disabled').and('contain.text', 'Launch');
    cy.get('@newickErrorDialog').contains('button', 'OK').click({ force: true });
  });

  it('shows the validation reason for other malformed Newick input', () => {
    visitAppAndAcceptEula();
    cy.loadFiles(invalidRootDepthProfile.files);

    launchAndCaptureNewickError('Unable to process NWK: Invalid root depth in Newick tree');
    cy.get('@newickErrorDialog')
      .should('contain.text', 'Check for missing or invalid branch lengths.')
      .contains('button', 'OK')
      .click({ force: true });

    cy.window().should((win: any) => {
      expect(win.commonService.session.network.isFullyLoaded, 'network should not finish loading').to.equal(false);
      expect(win.commonService.session.data.nodes || [], 'nodes after malformed-tree rejection').to.have.length(0);
      expect(win.commonService.session.data.links || [], 'links after malformed-tree rejection').to.have.length(0);
    });
  });

  it('loads a corrected Newick file after a duplicate-tip failure without refreshing', () => {
    visitAppAndAcceptEula();
    cy.loadFiles(duplicateTipProfile.files);
    applyPreLaunchFileSettings(correctedTipProfile);
    ensurePreLaunchProfileSynced(correctedTipProfile);

    launchAndCaptureNewickError(
      'Unable to process NWK due to duplication in leaf names. Please re-try after fixing the naming issue.',
    );
    cy.get('@newickErrorDialog').contains('button', 'OK').click({ force: true });

    cy.window().should((win: any) => {
      const widgets = win.commonService.session.style.widgets;
      expect(widgets['default-distance-metric'], 'metric retained after failed launch').to.equal('tn93');
      expect(Number(widgets['link-threshold']), 'threshold retained after failed launch').to.equal(0.02);
      expect(widgets['default-view'], 'default view retained after failed launch').to.equal('2D Network');
    });

    cy.contains('#file-table .file-table-row', DUPLICATE_TIP_FILE)
      .find('.flaticon-delete-1')
      .click({ force: true });
    cy.contains('#file-table .file-table-row', DUPLICATE_TIP_FILE).should('not.exist');

    cy.loadFiles(correctedTipProfile.files);
    cy.window().should((win: any) => {
      const widgets = win.commonService.session.style.widgets;
      expect(widgets['default-distance-metric'], 'metric retained for retry').to.equal('tn93');
      expect(Number(widgets['link-threshold']), 'threshold retained for retry').to.equal(0.02);
      expect(widgets['default-view'], 'default view retained for retry').to.equal('2D Network');
    });

    launchAndWaitForProcessing(30000);
    waitForProcessingDialogToClear(30000);
    ensureTwoDNetworkView();
    assertMetricCount('#numberOfNodes', 3);
    assertVisibleLinkCount(1);

    cy.window().should((win: any) => {
      const storedNewick = String(win.commonService.session.data.newickString || '');
      expect(win.commonService.session.network.isFullyLoaded, 'corrected retry should finish loading').to.equal(true);
      expect(storedNewick, 'corrected leaf name is stored').to.contain('C');
      expect(
        win.commonService.session.files.some((file: any) => file.name === DUPLICATE_TIP_FILE),
        'invalid file removed before retry',
      ).to.equal(false);
      expect(
        win.commonService.session.files.some((file: any) => file.name === CORRECTED_TIP_FILE),
        'corrected file retained after retry',
      ).to.equal(true);
    });

    cy.wait(250, { log: false });
    assertMetricCount('#numberOfNodes', 3);
    assertVisibleLinkCount(1);
  });

  it('normalizes negative terminal branches from neighbor-joining exports', () => {
    visitAppAndAcceptEula();
    cy.loadFiles(negativeTerminalBranchProfile.files);

    cy.get('#launch', { timeout: 15000 }).should('not.be.disabled');
    cy.get('#launch').click({ force: true });
    confirmNegativeBranchWarning(NEGATIVE_TERMINAL_BRANCH_FILE);
    waitForProcessingDialogToClear(30000);

    cy.window().should((win: any) => {
      const storedNewick = String(win.commonService.session.data.newickString || '');
      expect(win.commonService.session.network.isFullyLoaded, 'network should finish loading').to.equal(true);
      expect(win.commonService.session.data.nodes || [], 'imported leaf nodes').to.have.length(3);
      expect(storedNewick, 'normalized terminal branch remains present').to.contain('A');
      expect(storedNewick, 'no negative branch lengths remain').not.to.match(/:-(?:\d|\.)/);
    });
  });

  it('normalizes negative internal branches and preserves their labels', () => {
    visitAppAndAcceptEula();
    cy.loadFiles(negativeBranchProfile.files);

    cy.get('#launch', { timeout: 15000 }).should('not.be.disabled');
    cy.get('#launch').click({ force: true });
    confirmNegativeBranchWarning(NEGATIVE_BRANCH_FILE);
    waitForProcessingDialogToClear(30000);

    cy.window().should((win: any) => {
      const storedNewick = String(win.commonService.session.data.newickString || '');
      expect(win.commonService.session.network.isFullyLoaded, 'network should finish loading').to.equal(true);
      expect(win.commonService.session.data.nodes || [], 'imported leaf nodes').to.have.length(3);
      expect(storedNewick, 'internal branch label remains present').to.contain('BAD_INTERNAL');
      expect(storedNewick, 'no negative branch lengths remain').not.to.match(/:-(?:\d|\.)/);
    });
  });

  it('aggregates plural negative-branch warnings for multiple Newick files', () => {
    visitAppAndAcceptEula();
    cy.loadFiles(multipleNegativeBranchesProfile.files);

    cy.get('#launch', { timeout: 15000 }).should('not.be.disabled');
    cy.get('#launch').click({ force: true });

    cy.contains('.p-dialog-title', 'NWK Branch Length Warning', { timeout: 30000 })
      .should('be.visible')
      .parents('.p-dialog')
      .as('aggregatedNewickBranchWarning');

    cy.contains('.p-dialog-title:visible', 'NWK Branch Length Warning').should('have.length', 1);
    cy.get('@aggregatedNewickBranchWarning')
      .should(
        'contain.text',
        `MicrobeTrace found 2 negative branch lengths in ${MULTIPLE_NEGATIVE_BRANCHES_A_FILE} and set them to zero before processing.`,
      )
      .and(
        'contain.text',
        `MicrobeTrace found 3 negative branch lengths in ${MULTIPLE_NEGATIVE_BRANCHES_B_FILE} and set them to zero before processing.`,
      )
      .contains('button', 'OK')
      .click({ force: true });

    waitForProcessingDialogToClear(30000);
    cy.window().should((win: any) => {
      const storedNewick = String(win.commonService.session.data.newickString || '');
      expect(win.commonService.session.network.isFullyLoaded, 'multi-file import should finish loading').to.equal(true);
      expect(win.commonService.session.data.nodes || [], 'imported leaf nodes').to.have.length(3);
      expect(storedNewick, 'last normalized file remains stored').to.contain('GROUP_B');
      expect(storedNewick, 'stored Newick has no negative branch lengths').not.to.match(/:-(?:\d|\.)/);
    });
  });
});
