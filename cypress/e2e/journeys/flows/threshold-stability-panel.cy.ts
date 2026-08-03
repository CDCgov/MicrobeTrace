/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  applyPreLaunchFileSettings,
  ensurePreLaunchProfileSynced,
  ensureTwoDNetworkView,
  launchAndWaitForProcessing,
  launchProfileToTwoD,
  openGlobalFilteringTab,
  setGlobalLinkThreshold,
  visitAppAndAcceptEula,
  waitForProcessingDialogToClear,
} from '../../../support/journey-helpers';

describe('Journey Flow - Threshold Stability Panel', () => {
  const profile = getProfile('nn-angulartesting-tn93-edgelist');
  const mixedOriginProfile = getProfile('threshold-score-genetic-policy');

  it('shows the composite recommendation and applies its genetic threshold', () => {
    launchProfileToTwoD(profile);

    openGlobalFilteringTab();

    cy.get('[data-testid="threshold-stability-toggle"]')
      .should('exist')
      .scrollIntoView()
      .should('be.visible')
      .and('have.attr', 'aria-expanded', 'false')
      .click({ force: true })
      .should('have.attr', 'aria-expanded', 'true');

    cy.get('[data-testid="threshold-stability-panel"]')
      .should('exist')
      .scrollIntoView()
      .should('be.visible');

    cy.contains('[data-testid="threshold-stability-panel"]', 'Orange line = cluster count at each threshold.').should('be.visible');
    cy.get('[data-testid="threshold-stability-apply"]').its('length').should('be.greaterThan', 0);
    cy.get('[data-testid="threshold-score-recommendation"]')
      .should('be.visible')
      .and('contain.text', 'Component Structure Score')
      .and('contain.text', 'Largest / median')
      .and('contain.text', 'Decision support');

    cy.window().then((win: any) => {
      const metric = win.commonService.session.style.widgets['link-sort-variable'];
      const summary = win.commonService.getThresholdSweepSummary(metric);

      expect(summary.recommendedIndex, 'recommended sweep index').to.be.at.least(0);
      expect(summary.componentMetrics, 'metric snapshots').to.have.length(summary.thresholds.length);
      expect(summary.componentStructureScores, 'score snapshots').to.have.length(summary.thresholds.length);
      expect(
        summary.componentStructureScores.every((score: number) => score >= 0 && score <= 100),
        'bounded component-structure scores',
      ).to.equal(true);

      const expectedThreshold = summary.thresholds[summary.recommendedIndex];
      const expectedScore = summary.componentStructureScores[summary.recommendedIndex];
      cy.wrap({ expectedThreshold, expectedScore }, { log: false }).as('scoreRecommendation');
    });

    cy.get<{ expectedThreshold: number; expectedScore: number }>('@scoreRecommendation').then((recommendation) => {
      cy.get('[data-testid="threshold-score-recommendation"]')
        .should('contain.text', recommendation.expectedScore.toFixed(1));
      cy.get('[data-testid="threshold-score-apply"]')
        .should('have.attr', 'data-threshold', String(recommendation.expectedThreshold))
        .click({ force: true });
    });

    waitForProcessingDialogToClear();

    cy.get<{ expectedThreshold: number }>('@scoreRecommendation').then(({ expectedThreshold }) => {
      cy.window()
        .its('commonService.session.style.widgets.link-threshold')
        .should((threshold) => {
          expect(Number(threshold)).to.equal(expectedThreshold);
        });

      cy.get('#link-threshold').invoke('val').then((value) => {
        expect(Number(value)).to.equal(expectedThreshold);
      });
    });
  });

  it('uses distance-backed genetic links only and applies NN mode consistently', () => {
    launchProfileToTwoD(mixedOriginProfile);

    cy.window().then((win: any) => {
      const commonService = win.commonService;
      const metric = commonService.session.style.widgets['link-sort-variable'];
      const links = commonService.session.data.links as any[];
      const summary = commonService.getThresholdSweepSummary(metric);
      const cache = commonService.temp.analysis.storedDistanceCache[metric];
      const endpointId = (endpoint: any) => String(endpoint?._id ?? endpoint?.id ?? endpoint);
      const endpointKey = (link: any) => [endpointId(link.source), endpointId(link.target)].sort().join('|');
      const cachedEndpointKeys = new Set(cache.sortedEdges.map((edge: any) => (
        [String(edge.sourceId), String(edge.targetId)].sort().join('|')
      )));
      const epiOnlyLinks = links.filter((link) => link.hasDistance !== true);
      const mixedOriginGeneticLinks = links.filter((link) => (
          link.hasDistance === true
          && Array.isArray(link.origin)
          && link.origin.length > 1
          && Number.isFinite(Number(link[metric]))
        ));

      expect(epiOnlyLinks.length, 'epi-only links in fixture').to.be.greaterThan(0);
      expect(mixedOriginGeneticLinks.length, 'distance-backed mixed-origin links in fixture').to.be.greaterThan(0);
      expect(summary.thresholds, 'genetic threshold samples').to.deep.equal([1, 2, 3, 4]);
      expect(summary.componentMetrics[0], 'genetic-only structure at threshold 1').to.deep.include({
        clusterCount: 2,
        singletonCount: 2,
        largestClusterSize: 2,
      });
      expect(summary.thresholds[summary.recommendedIndex], 'recommended genetic threshold').to.equal(2);
      epiOnlyLinks.forEach((link) => {
        expect(cachedEndpointKeys.has(endpointKey(link)), `epi-only link ${endpointKey(link)} excluded from sweep`).to.equal(false);
      });
      mixedOriginGeneticLinks.forEach((link) => {
        expect(cachedEndpointKeys.has(endpointKey(link)), `mixed-origin genetic link ${endpointKey(link)} included in sweep`).to.equal(true);
      });

      const originalSweep = {
        thresholds: [...summary.thresholds],
        clusterCounts: [...summary.clusterCounts],
        componentStructureScores: [...summary.componentStructureScores],
        recommendedIndex: summary.recommendedIndex,
      };
      const epiOnlyLink = epiOnlyLinks[0];
      const originalMetricValue = epiOnlyLink[metric];
      epiOnlyLink[metric] = summary.thresholds[0];
      commonService.invalidateThresholdAnalysisCache();
      const afterEpiMetricMutation = commonService.getThresholdSweepSummary(metric);

      expect({
        thresholds: afterEpiMetricMutation.thresholds,
        clusterCounts: afterEpiMetricMutation.clusterCounts,
        componentStructureScores: afterEpiMetricMutation.componentStructureScores,
        recommendedIndex: afterEpiMetricMutation.recommendedIndex,
      }, 'epi-only metric values do not influence genetic threshold scoring').to.deep.equal(originalSweep);

      epiOnlyLink[metric] = originalMetricValue;
      commonService.invalidateThresholdAnalysisCache();
      commonService.session.style.widgets['link-show-nn'] = true;
      const nearestNeighborSweep = commonService.getThresholdSweepSummary(metric);

      expect(nearestNeighborSweep.thresholds, 'NN sweep retains genetic threshold samples')
        .to.deep.equal(originalSweep.thresholds);
      expect(nearestNeighborSweep.componentMetrics, 'NN mode changes component structure')
        .not.to.deep.equal(summary.componentMetrics);

      commonService.session.style.widgets['link-show-nn'] = false;
      commonService.invalidateThresholdAnalysisCache();
    });
  });

  it('keeps Newick threshold guidance available when render links are guardrailed', () => {
    const newickProfile = {
      ...getProfile('load-twod-newick-tn93-angular-testing'),
      preLaunch: {
        metric: 'snps' as const,
        threshold: 16,
        defaultView: '2D Network' as const,
      },
    };

    visitAppAndAcceptEula();
    cy.loadFiles(newickProfile.files);
    applyPreLaunchFileSettings(newickProfile);
    ensurePreLaunchProfileSynced(newickProfile);
    cy.window().then((win: any) => {
      win.commonService.session.meta.guardrails = {
        ...(win.commonService.session.meta.guardrails || {}),
        newickVisibleLinkWarningThreshold: 1,
        newickVisibleLinkHardLimit: 1,
      };
    });
    launchAndWaitForProcessing(60000);
    ensureTwoDNetworkView();

    cy.window().then((win: any) => {
      expect(win.commonService.session.style.widgets['default-distance-metric']).to.equal('tn93');
      expect(Number(win.commonService.session.style.widgets['link-threshold'])).to.equal(0.015);
    });
    cy.get('#network-guardrail-warning', { timeout: 15000 })
      .should('be.visible')
      .and('contain', 'Newick threshold 0.015');

    openGlobalFilteringTab();
    cy.get('#link-threshold-sparkline .bar rect', { timeout: 15000 })
      .its('length')
      .should('be.greaterThan', 0);
    cy.get('[data-testid="threshold-stability-toggle"]')
      .scrollIntoView()
      .should('be.visible')
      .should('contain', 'distinct thresholds')
      .click({ force: true });
    cy.get('[data-testid="threshold-stability-panel"]')
      .scrollIntoView()
      .should('be.visible')
      .and('contain', 'Orange line = cluster count at each threshold.');

    setGlobalLinkThreshold(0);
    waitForProcessingDialogToClear();

    cy.get('#network-guardrail-warning').should('not.exist');
    cy.window().then((win: any) => {
      const warnings = win.commonService.session.warnings || [];
      const newickWarnings = warnings.filter((warning: any) => warning?.type === 'newick-visible-link-guardrail');
      expect(newickWarnings).to.have.length(0);
    });
  });
});
