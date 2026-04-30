/// <reference types="cypress" />

import { getProfile, type DatasetProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  assertMetricCount,
  ensureTwoDNetworkView,
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

const tn93Profile = getProfile('load-twod-newick-tn93-angular-testing');

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

    cy.get('#link-threshold').invoke('val').should((value) => {
      expect(Number(value), 'threshold input value').to.equal(16);
    });
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
});
