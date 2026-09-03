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

type AnalyticsWindow = Window & {
  dataLayer?: Array<ArrayLike<unknown>>;
};

type AnalysisActionCall = ['event', 'analysis_action', {
  action: string;
}];

function enableLocalTestAnalytics(): void {
  cy.readFile('src/assets/analytics-bootstrap.js', 'utf8').then((source) => {
    const locallyEnabledSource = source.replace(
      /const analyticsDisabledForLocalHost = (?:true|false);/,
      'const analyticsDisabledForLocalHost = false;',
    );
    cy.intercept('GET', '**/assets/analytics-bootstrap.js', {
      statusCode: 200,
      headers: { 'content-type': 'application/javascript' },
      body: locallyEnabledSource,
    });
  });
  cy.intercept('GET', 'https://www.googletagmanager.com/gtag/js*', {
    statusCode: 200,
    body: '',
  });
}

function getAnalysisActionCalls(win: AnalyticsWindow): AnalysisActionCall[] {
  return (win.dataLayer || [])
    .map((entry) => Array.from(entry))
    .filter((entry) => entry[0] === 'event' && entry[1] === 'analysis_action') as AnalysisActionCall[];
}

describe('Journey Flow - Threshold Stability Panel', () => {
  const profile = getProfile('nn-angulartesting-tn93-edgelist');

  beforeEach(() => {
    enableLocalTestAnalytics();
  });

  it('shows stable regions and applies a suggested threshold', () => {
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

    cy.get('#link-threshold').invoke('val').then((value) => {
      cy.wrap(Number(value), { log: false }).as('beforeThreshold');
    });

    cy.window().then((rawWindow) => {
      cy.wrap(getAnalysisActionCalls(rawWindow as AnalyticsWindow).length, { log: false })
        .as('analysisActionCountBeforeSuggestion');
    });

    cy.get('[data-testid="threshold-stability-apply"]').first().then(($button) => {
      const suggestedThreshold = Number($button.attr('data-threshold'));

      expect(suggestedThreshold, 'suggested threshold').to.be.a('number');
      cy.wrap(suggestedThreshold, { log: false }).as('suggestedThreshold');
      cy.wrap($button).click({ force: true });
    });

    waitForProcessingDialogToClear();

    cy.get('@analysisActionCountBeforeSuggestion').then((countBeforeSuggestion) => {
      cy.window().should((rawWindow) => {
        const newCalls = getAnalysisActionCalls(rawWindow as AnalyticsWindow)
          .slice(Number(countBeforeSuggestion));

        expect(newCalls, 'analytics emitted by applying the suggestion').to.deep.equal([
          ['event', 'analysis_action', {
            action: 'threshold_stability_applied',
          }],
        ]);
      });
    });

    cy.get('@beforeThreshold').then((beforeThreshold) => {
      cy.get('@suggestedThreshold').then((suggestedThreshold) => {
        expect(Number(suggestedThreshold), 'suggested threshold changed').to.not.equal(Number(beforeThreshold));

        cy.window()
          .its('commonService.session.style.widgets.link-threshold')
          .should((threshold) => {
            expect(Number(threshold)).to.equal(Number(suggestedThreshold));
          });

        cy.get('#link-threshold').invoke('val').then((value) => {
          expect(Number(value)).to.equal(Number(suggestedThreshold));
        });
      });
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
