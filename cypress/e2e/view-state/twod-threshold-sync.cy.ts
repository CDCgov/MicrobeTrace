/// <reference types="cypress" />

import {
  ensureTwoDNetworkView,
  openGlobalFilteringTab,
  setGlobalDistanceMetric,
  visitAppAndAcceptEula,
  waitForProcessingDialogToClear,
} from '../../support/journey-helpers';

const assertThresholdState = (expectedRaw: number, expectedInput: string, expectedStats: string): void => {
  cy.window()
    .its('commonService.session.style.widgets.link-threshold')
    .should((threshold) => {
      expect(Number(threshold), 'raw link threshold widget').to.equal(expectedRaw);
    });

  cy.window()
    .its('commonService.GlobalSettingsModel.SelectedLinkThresholdVariable')
    .should((threshold) => {
      expect(Number(threshold), 'GlobalSettingsModel link threshold').to.equal(expectedRaw);
    });

  cy.get('#link-threshold').should('have.value', expectedInput);
  cy.get('#currentLinkThreshold').should('have.text', expectedStats);
};

const assertHistogramHoverReadout = (): void => {
  cy.get('#threshold-sparkline-readout').should('contain', 'Hover chart for cluster count');
  cy.get('#link-threshold-sparkline .bar').should(($bars) => {
    expect($bars.length, 'threshold histogram bars').to.be.greaterThan(0);
  });
  cy.get('#link-threshold-sparkline')
    .should('exist')
    .then(($svg) => {
      const svg = $svg.get(0) as SVGElement;
      const rect = svg.getBoundingClientRect();
      expect(rect.width, 'threshold histogram width').to.be.greaterThan(0);
      expect(rect.height, 'threshold histogram height').to.be.greaterThan(0);

      cy.wrap($svg).trigger('mousemove', {
        clientX: rect.left + rect.width * 0.4,
        clientY: rect.top + rect.height / 2,
        force: true,
      });
    });

  cy.get('#threshold-sparkline-readout')
    .should('contain', 'Orange line at')
    .and('contain', 'cluster');
};

describe('2D Network - Threshold Display Sync', () => {
  beforeEach(() => {
    visitAppAndAcceptEula({ skipDemoSession: false, dismissWelcomeOverlay: true });
    ensureTwoDNetworkView();
  });

  it('keeps sample SNP threshold synchronized after a TN93 metric round trip', () => {
    cy.get('#currentLinkThreshold').should('have.text', '16');

    openGlobalFilteringTab();
    cy.get('#default-distance-metric').should('have.value', 'snps');
    assertThresholdState(16, '16', '16');

    setGlobalDistanceMetric('tn93');
    waitForProcessingDialogToClear();
    cy.get('#default-distance-metric').should('have.value', 'tn93');
    assertThresholdState(0.015, '0.015', '0.015');
    assertHistogramHoverReadout();

    setGlobalDistanceMetric('snps');
    waitForProcessingDialogToClear();
    cy.get('#default-distance-metric').should('have.value', 'snps');
    assertThresholdState(16, '16', '16');

    cy.closeGlobalSettings();
  });
});
