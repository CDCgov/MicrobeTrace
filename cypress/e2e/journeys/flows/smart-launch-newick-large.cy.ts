/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  applyPreLaunchFileSettings,
  ensurePreLaunchProfileSynced,
  openGlobalFilteringTab,
  visitAppAndAcceptEula,
  waitForProcessingDialogToClear,
} from '../../../support/journey-helpers';

const smallProfile = getProfile('load-twod-newick-tn93-angular-testing');

const launchSmallTree = (analysisLimit?: number): void => {
  visitAppAndAcceptEula();
  cy.loadFiles(smallProfile.files);
  applyPreLaunchFileSettings(smallProfile);
  ensurePreLaunchProfileSynced(smallProfile);

  if (analysisLimit !== undefined) {
    cy.window().then((win: any) => {
      win.commonService.session.meta.guardrails = {
        ...(win.commonService.session.meta.guardrails || {}),
        newickThresholdAnalysisPairLimit: analysisLimit,
      };
    });
  }

  cy.get('[data-testid="files-smart-launch-button"]').click({ force: true });
  waitForProcessingDialogToClear(60000);
  cy.window().its('commonService.session.network.isFullyLoaded').should('eq', true);
};

describe('Smart Launch Newick analysis above the pair limit', () => {
  it('uses spanning edges for the same composite recommendation as all pairs', () => {
    let expectedThreshold = 0;
    let expectedScore = 0;

    launchSmallTree();
    cy.window().then((win: any) => {
      const service = win.commonService;
      const summary = service.getThresholdSweepSummary('distance');
      expectedThreshold = Number(service.session.style.widgets['link-threshold']);
      expectedScore = summary.componentStructureScores[summary.recommendedIndex];
      expect(service.session.meta.performance.ingestion.buildNewickThresholdAnalysis.method).to.eq('all-pairs');
    });

    launchSmallTree(1);
    cy.window().then((win: any) => {
      const service = win.commonService;
      const summary = service.getThresholdSweepSummary('distance');
      const analysis = service.session.meta.performance.ingestion.buildNewickThresholdAnalysis;

      expect(analysis.method).to.eq('mst');
      expect(analysis.skipped).to.eq(false);
      expect(analysis.sampledPairs).to.eq(service.session.data.nodes.length - 1);
      expect(Number(service.session.style.widgets['link-threshold'])).to.eq(expectedThreshold);
      expect(summary.componentStructureScores[summary.recommendedIndex]).to.be.closeTo(expectedScore, 1e-9);
      expect(service.formatDisplayedDistanceValue(0.0000252, 'distance')).to.eq('0.0000252');
    });
  });

  it('selects a renderable scored threshold for a 2,000-leaf Newick tree', () => {
    visitAppAndAcceptEula();
    cy.loadFiles([{ name: 'performance/stress-newick-2000.nwk', datatype: 'newick' }]);
    cy.get('[data-testid="files-smart-launch-button"]').click({ force: true });
    waitForProcessingDialogToClear(120000);
    cy.window().its('commonService.session.network.isFullyLoaded').should('eq', true);

    cy.window().then((win: any) => {
      const service = win.commonService;
      const analysis = service.session.meta.performance.ingestion.buildNewickThresholdAnalysis;
      const edgeGeneration = service.session.meta.performance.patristic.edgeGeneration;
      const selectedThreshold = Number(service.session.style.widgets['link-threshold']);
      const summary = service.getThresholdSweepSummary('distance');

      expect(service.session.data.nodes).to.have.length(2000);
      expect(analysis.totalPairs).to.eq(1999000);
      expect(analysis.method).to.eq('mst');
      expect(analysis.sampledPairs).to.eq(1999);
      expect(summary.recommendedIndex).to.be.greaterThan(-1);
      expect(Number.isFinite(selectedThreshold)).to.eq(true);
      expect(selectedThreshold).to.eq(Number(edgeGeneration.threshold));
      expect(edgeGeneration.matchedEdgeCount).to.be.at.most(100000);
      expect(edgeGeneration.guardrail?.hardLimitHit).not.to.eq(true);
      expect(service.session.data.links.length).to.be.greaterThan(0);
    });
  });

  it('shows the renderable Smart Launch recommendation in Global Settings', () => {
    let selected = 0;
    visitAppAndAcceptEula();
    cy.loadFiles(smallProfile.files);
    applyPreLaunchFileSettings(smallProfile);
    ensurePreLaunchProfileSynced(smallProfile);
    cy.window().then((win: any) => {
      win.commonService.session.meta.guardrails = {
        ...(win.commonService.session.meta.guardrails || {}),
        newickVisibleLinkHardLimit: 10,
      };
    });

    cy.get('[data-testid="files-smart-launch-button"]').click({ force: true });
    waitForProcessingDialogToClear(60000);
    cy.window().its('commonService.session.network.isFullyLoaded').should('eq', true);

    cy.window().then((win: any) => {
      const service = win.commonService;
      const summary = service.getThresholdSweepSummary('distance');
      selected = Number(service.session.style.widgets['link-threshold']);
      expect(selected).not.to.eq(summary.thresholds[summary.recommendedIndex]);
      expect(service.session.meta.performance.patristic.edgeGeneration.guardrail?.hardLimitHit).not.to.eq(true);
    });

    openGlobalFilteringTab();
    cy.get('[data-testid="threshold-stability-toggle"]').click({ force: true });
    cy.get('[data-testid="threshold-score-recommendation"]')
      .should('contain.text', '10-link browser limit')
      .find('[data-testid="threshold-score-apply"]')
      .should(($button) => {
        expect(Number($button.attr('data-threshold'))).to.eq(selected);
      });
  });
});
