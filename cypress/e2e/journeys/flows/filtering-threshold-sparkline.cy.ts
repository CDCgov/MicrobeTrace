/// <reference types="cypress" />

import { getProfile, resolveExpected } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  launchProfileToTwoD,
  openGlobalFilteringTab,
  waitForProcessingDialogToClear,
} from '../../../support/journey-helpers';

describe('Journey Flow - Threshold Sparkline Interaction', () => {
  const profile = getProfile('nn-angulartesting-tn93-edgelist');

  it('drags the filtering threshold sparkline instead of typing and updates counts', () => {
    const afterLaunch = resolveExpected(profile.expectations.afterLaunch, 'observed');

    expect(afterLaunch?.visibleLinks, 'after-launch visible link count').to.be.a('number');

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);

    let beforeThreshold = 0;

    openGlobalFilteringTab();
    cy.get('#link-threshold').invoke('val').then((value) => {
      beforeThreshold = Number(value);
      expect(beforeThreshold, 'initial threshold input').to.equal(profile.preLaunch.threshold);
    });

    cy.get('#link-threshold-sparkline')
      .scrollIntoView()
      .should('be.visible');
    cy.get('#threshold-sparkline-readout').should('contain', 'Hover chart for cluster count');
    cy.click_histogram_at('#link-threshold-sparkline', 0.40);
    cy.window()
      .its('commonService.session.style.widgets.link-threshold')
      .should('not.equal', beforeThreshold);

    waitForProcessingDialogToClear();

    cy.get('#numberOfVisibleLinks', { timeout: 30000 }).should(($metric) => {
      const current = parseInt(String($metric.text()).replace(/,/g, ''), 10);
      expect(current, 'link count after sparkline drag').to.not.equal(afterLaunch!.visibleLinks!);
    });

    cy.get('#numberOfVisibleLinks').then(($metric) => {
      const currentLinks = parseInt(String($metric.text()).replace(/,/g, ''), 10);

      expect(currentLinks, 'link count after sparkline drag').to.be.greaterThan(afterLaunch!.visibleLinks!);
    });

    cy.closeGlobalSettings();
  });
});
