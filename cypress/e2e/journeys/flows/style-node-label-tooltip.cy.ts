/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  applyStyleFromProfile,
  assertAfterLaunchCounts,
  assertStyleTablesFromProfile,
  assertVisibleStylePreserved,
  expandAccordionTabByHeader,
  launchProfileToTwoD,
  openTwoDSettingsDialog,
  snapshotVisibleStyles,
} from '../../../support/journey-helpers';
import type { StyleSnapshot } from '../../../support/journey-helpers';

describe('Journey Flow - Uploaded node labels and tooltips coexist with style', () => {
  const profile = getProfile('style-apply-cypress-test-style');
  const targetNodeId = '797703';
  const labelVariable = 'Profession';
  const expectedNodeLabel = 'Healthcare';
  const labelSize = 28;
  const labelOrientation = 'Top';
  const tooltipVariables = ['Profession', 'Node type'];

  it('keeps styled node and link rendering intact while changing label and tooltip settings', () => {
    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    applyStyleFromProfile(profile);
    cy.closeGlobalSettings();
    assertStyleTablesFromProfile(profile);

    snapshotVisibleStyles().as('preLabelStyleSnapshot');

    openTwoDSettingsDialog();
    cy.get('@twoDSettings').contains('.nav-link', 'Nodes').click({ force: true });
    cy.get('@twoDSettings')
      .find('.tab-pane:visible', { timeout: 15000 })
      .should('exist')
      .as('nodesTab');

    expandAccordionTabByHeader('@nodesTab', 'Labels and Tooltips');

    cy.window().its('commonService.session.style.widgets.node-label-variable').should('equal', 'None');
    cy.get('@nodesTab').find('#node-label-variable').click({ force: true });
    cy.contains('li[role="option"]', labelVariable).click({ force: true });
    cy.window().its('commonService.session.style.widgets.node-label-variable').should('equal', labelVariable);

    cy.get('@nodesTab')
      .find('#node-label-size')
      .invoke('val', String(labelSize))
      .trigger('change', { force: true });
    cy.window().its('commonService.session.style.widgets.node-label-size').should('equal', labelSize);

    cy.get('@nodesTab').find('#node-label-orientation').click({ force: true });
    cy.contains('li[role="option"]', labelOrientation).click({ force: true });
    cy.window().its('commonService.session.style.widgets.node-label-orientation').should('equal', labelOrientation);

    cy.get('@nodesTab').contains('.form-group', 'Tooltip').find('p-multiselect').click({ force: true });
    tooltipVariables.forEach((tooltipVariable) => {
      cy.contains('li[role="option"]', tooltipVariable).click({ force: true });
    });
    cy.get('body').click(5, 5);

    cy.window()
      .its('commonService.session.style.widgets.node-tooltip-variable')
      .should('include.members', tooltipVariables);

    cy.get('@twoDSettings')
      .find('button.p-dialog-close-button')
      .click({ force: true });
    cy.contains('.p-dialog-title', '2D Network Settings').should('not.exist');

    assertStyleTablesFromProfile(profile);

    cy.window().then((win: any) => {
      const cyInstance = win.cytoscapeInstance;
      const targetNode = cyInstance.getElementById(targetNodeId);

      expect(targetNode.empty(), `target node exists: ${targetNodeId}`).to.equal(false);
      expect(String(targetNode.data('label')), 'node label data').to.equal(expectedNodeLabel);
      expect(String(targetNode.style('label')), 'rendered node label').to.equal(expectedNodeLabel);
      expect(String(targetNode.style('font-size')), 'node label font size').to.contain(String(labelSize));
      expect(String(targetNode.style('text-valign')), 'node label vertical alignment').to.equal('top');
    });

    cy.window().invoke('Cypress.test.tooltip', 'show', targetNodeId);
    cy.get('#tooltip #tooltip-table').should('be.visible').within(() => {
      cy.contains('td', 'Profession').should('be.visible');
      cy.contains('td', expectedNodeLabel).should('be.visible');
      cy.contains('td', 'Node Type').should('be.visible');
      cy.contains('td', 'Person').should('be.visible');
    });
    cy.window().invoke('Cypress.test.tooltip', 'hide', targetNodeId);

    snapshotVisibleStyles().then((afterLabelAndTooltipChanges) => {
      cy.get<StyleSnapshot>('@preLabelStyleSnapshot').then((before) => {
        assertVisibleStylePreserved(before, afterLabelAndTooltipChanges);
      });
    });
  });
});
