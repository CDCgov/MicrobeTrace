/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  launchProfileToTwoD,
  openGlobalFilteringTab,
  waitForProcessingDialogToClear,
} from '../../../support/journey-helpers';

describe('Journey Flow - Threshold Stability Panel', () => {
  const profile = getProfile('nn-angulartesting-tn93-edgelist');

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

    cy.get('[data-testid="threshold-stability-apply"]').first().then(($button) => {
      const suggestedThreshold = Number($button.attr('data-threshold'));

      expect(suggestedThreshold, 'suggested threshold').to.be.a('number');
      cy.wrap(suggestedThreshold, { log: false }).as('suggestedThreshold');
      cy.wrap($button).click({ force: true });
    });

    waitForProcessingDialogToClear();

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
});
