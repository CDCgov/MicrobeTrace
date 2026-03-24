/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  expandAccordionTabByHeader,
  launchProfileToTwoD,
  openTwoDSettingsDialog,
} from '../../../support/journey-helpers';

describe('Journey Flow - Uploaded link tooltip contents', () => {
  const profile = getProfile('nn-angulartesting-tn93-edgelist');
  const tooltipOptions = ['Source ID', 'Target ID'];

  it('shows the selected uploaded link fields in the rendered tooltip', () => {
    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);

    cy.window().then((win: any) => {
      const cyInstance = win.cytoscapeInstance;
      const firstVisibleEdge = cyInstance.edges(':visible').first();

      expect(firstVisibleEdge.empty(), 'visible edge exists').to.equal(false);

      cy.wrap(
        {
          edgeId: String(firstVisibleEdge.id()),
          sourceId: String(firstVisibleEdge.data('source')),
          targetId: String(firstVisibleEdge.data('target')),
        },
        { log: false },
      ).as('tooltipEdge');
    });

    openTwoDSettingsDialog();
    cy.get('@twoDSettings').contains('.nav-link', 'Links').click({ force: true });
    cy.get('@twoDSettings')
      .find('.tab-pane:visible', { timeout: 15000 })
      .should('exist')
      .as('linksTab');

    expandAccordionTabByHeader('@linksTab', 'Labels and Tooltips');

    cy.window().its('commonService.session.style.widgets.link-tooltip-variable').should('be.empty');

    cy.get('@linksTab').contains('.form-group', 'Tooltip').find('p-multiselect').click({ force: true });
    tooltipOptions.forEach((optionLabel) => {
      cy.contains('li[role="option"]', optionLabel).click({ force: true });
    });
    cy.get('body').click(5, 5);

    cy.window()
      .its('commonService.session.style.widgets.link-tooltip-variable')
      .should('include.members', ['source_id', 'target_id']);

    cy.get('@twoDSettings')
      .find('button.p-dialog-close-button')
      .click({ force: true });
    cy.contains('.p-dialog-title', '2D Network Settings').should('not.exist');

    cy.get('@tooltipEdge').then((tooltipEdge) => {
      const edge = tooltipEdge as { edgeId: string; sourceId: string; targetId: string };

      cy.window().invoke('Cypress.test.linkTooltip', 'show', edge.edgeId);
      cy.get('#tooltip #tooltip-table').should('be.visible').within(() => {
        cy.contains('td', 'Source_id').should('be.visible');
        cy.contains('td', edge.sourceId).should('be.visible');
        cy.contains('td', 'Target_id').should('be.visible');
        cy.contains('td', edge.targetId).should('be.visible');
      });
      cy.window().invoke('Cypress.test.linkTooltip', 'hide', edge.edgeId);
    });
  });
});
