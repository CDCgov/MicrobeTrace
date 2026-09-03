/// <reference types="cypress" />

import { getProfile, type DatasetProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  assertMetricCount,
  applyPreLaunchFileSettings,
  ensureTwoDNetworkView,
  ensurePreLaunchProfileSynced,
  goToHeatmapView,
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
const NEGATIVE_BRANCH_FILE = 'PatristicNegativeBranch.nwk';
const NEGATIVE_TERMINAL_BRANCH_FILE = 'PatristicNegativeTerminalBranch.nwk';

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

const negativeBranchProfile: DatasetProfile = {
  id: 'patristic-negative-branch-validation',
  title: 'Negative-branch Newick is rejected with branch context',
  tags: ['newick', 'patristic-worker', 'invalid'],
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

describe('Journey Flow - Patristic Newick worker safeguards', () => {
  it('preserves Newick launch counts, distances, and file metadata', () => {
    launchProfileToTwoD(tn93Profile);
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

  it('renders all cached patristic pairs in Heatmap even when the network threshold is sparse', () => {
    launchProfileToTwoD(tn93Profile);
    assertVisibleLinkCount(14);

    cy.window().then((win: any) => win.commonService.getDM()).then(({ dm, labels }: any) => {
      const expectedPairCount = labels.length * (labels.length - 1) / 2;
      let populatedPairCount = 0;

      expect(labels, 'Heatmap labels').to.have.length(14);
      expect(dm, 'Heatmap matrix rows').to.have.length(labels.length);

      for (let row = 0; row < dm.length; row++) {
        expect(dm[row], `Heatmap matrix row ${row}`).to.have.length(labels.length);
        expect(dm[row][row], `Heatmap diagonal ${row}`).to.equal(0);
        for (let column = 0; column < row; column++) {
          expect(Number(dm[row][column]), `Heatmap distance ${row},${column}`).to.be.finite;
          expect(dm[row][column], `symmetric Heatmap distance ${row},${column}`).to.equal(dm[column][row]);
          populatedPairCount++;
        }
      }

      expect(populatedPairCount, 'populated Heatmap pairs').to.equal(expectedPairCount);
      expect(expectedPairCount, 'complete pairs exceed thresholded network links').to.be.greaterThan(14);
    });

    goToHeatmapView();
    cy.window({ timeout: 30000 }).should((win: any) => {
      const trace = win.commonService.visuals.heatmap?.heatmapData?.[0];
      const values = trace?.z?.flat?.() || [];

      expect(trace, 'Heatmap trace').to.exist;
      expect(values, 'rendered Heatmap values').to.have.length(14 * 14);
      expect(values.every((value: unknown) => Number.isFinite(Number(value))), 'rendered Heatmap is dense').to.equal(true);
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

    cy.get('#launch', { timeout: 15000 }).should('not.be.disabled');
    cy.get('#launch').click({ force: true });

    cy.contains(
      '#loading-information',
      /duplicate (leaf|tip|tax|name)|Error processing Newick tree/i,
      { timeout: 30000 },
    ).should('be.visible');

    cy.window().should((win: any) => {
      expect(win.commonService.session.network.isFullyLoaded, 'network should not finish loading').to.not.equal(true);
      expect(win.commonService.session.data.links || [], 'links after duplicate-tip rejection').to.have.length(0);
    });
  });

  it('normalizes negative terminal branches from neighbor-joining exports', () => {
    visitAppAndAcceptEula();
    cy.loadFiles(negativeTerminalBranchProfile.files);

    cy.get('#launch', { timeout: 15000 }).should('not.be.disabled');
    cy.get('#launch').click({ force: true });
    waitForProcessingDialogToClear(30000);

    cy.window().should((win: any) => {
      const storedNewick = String(win.commonService.session.data.newickString || '');
      expect(win.commonService.session.network.isFullyLoaded, 'network should finish loading').to.equal(true);
      expect(win.commonService.session.data.nodes || [], 'imported leaf nodes').to.have.length(3);
      expect(storedNewick, 'normalized terminal branch remains present').to.contain('A');
      expect(storedNewick, 'no negative branch lengths remain').not.to.match(/:-(?:\d|\.)/);
    });
  });

  it('rejects negative-branch Newick input with branch label context', () => {
    visitAppAndAcceptEula();
    cy.loadFiles(negativeBranchProfile.files);

    cy.get('#launch', { timeout: 15000 }).should('not.be.disabled');
    cy.get('#launch').click({ force: true });

    cy.contains(
      '#loading-information',
      /Negative branch length.*BAD_INTERNAL.*parent/i,
      { timeout: 30000 },
    ).should('be.visible');

    cy.window().should((win: any) => {
      expect(win.commonService.session.network.isFullyLoaded, 'network should not finish loading').to.not.equal(true);
      expect(win.commonService.session.data.links || [], 'links after negative-branch rejection').to.have.length(0);
    });
  });
});
