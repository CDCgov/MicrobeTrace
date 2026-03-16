/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  expandAccordionTabByHeader,
  launchProfileToTwoD,
  openTwoDSettingsDialog,
} from '../../../support/journey-helpers';

const openNetworkDisplayPanel = (): void => {
  openTwoDSettingsDialog();
  cy.get('@twoDSettings').contains('.nav-link', 'Network').click({ force: true });
  cy.get('@twoDSettings')
    .find('.tab-pane:visible', { timeout: 15000 })
    .should('exist')
    .as('networkTab');

  expandAccordionTabByHeader('@networkTab', 'Display');
};

const closeTwoDSettingsDialog = (): void => {
  cy.get('@twoDSettings')
    .find('button.p-dialog-close-button')
    .click({ force: true });

  cy.contains('.p-dialog-title', '2D Network Settings').should('not.exist');
};

describe('Journey Flow - Uploaded network display controls', () => {
  const profile = getProfile('nn-angulartesting-tn93-edgelist');

  it('toggles gridlines on uploaded data', () => {
    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);

    openNetworkDisplayPanel();

    cy.window().its('commonService.session.style.widgets.network-gridlines-show').should('equal', false);
    cy.get('.grid-overlay').should('have.class', 'hidden');

    cy.get('@networkTab')
      .find('#network-gridlines-show-hide')
      .contains('Show')
      .click({ force: true });

    cy.window().its('commonService.session.style.widgets.network-gridlines-show').should('equal', true);
    cy.get('.grid-overlay').should('not.have.class', 'hidden');

    cy.get('@networkTab')
      .find('#network-gridlines-show-hide')
      .contains('Hide')
      .click({ force: true });

    cy.window().its('commonService.session.style.widgets.network-gridlines-show').should('equal', false);
    cy.get('.grid-overlay').should('have.class', 'hidden');

    closeTwoDSettingsDialog();
  });

  it('toggles neighbor highlighting on uploaded data and affects connected edges on hover', () => {
    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);

    cy.window().then((win: any) => {
      const cyInstance = win.cytoscapeInstance;
      const targetNode = cyInstance
        .nodes(':visible')
        .filter((node: any) => node.connectedEdges(':visible').length > 0)
        .first();

      expect(targetNode.empty(), 'connected visible node exists').to.equal(false);
      cy.wrap(String(targetNode.id()), { log: false }).as('highlightNodeId');
    });

    cy.get('@highlightNodeId').then((nodeId) => {
      cy.window().then((win: any) => {
        const node = win.cytoscapeInstance.getElementById(String(nodeId));
        win.Cypress.test.hoverNode('show', String(nodeId));
        expect(node.connectedEdges('.highlighted').length, 'no highlighted edges before enabling setting').to.equal(0);
        win.Cypress.test.hoverNode('hide', String(nodeId));
      });
    });

    openNetworkDisplayPanel();

    cy.window().its('commonService.session.style.widgets.node-highlight').should('equal', false);

    cy.get('@networkTab')
      .find('#dont-highlight-neighbors-highlight-neighbors')
      .contains('Highlighted')
      .click({ force: true });

    cy.window().its('commonService.session.style.widgets.node-highlight').should('equal', true);
    closeTwoDSettingsDialog();

    cy.get('@highlightNodeId').then((nodeId) => {
      cy.window().then((win: any) => {
        const node = win.cytoscapeInstance.getElementById(String(nodeId));
        win.Cypress.test.hoverNode('show', String(nodeId));
        expect(node.connectedEdges('.highlighted').length, 'connected edges highlighted on hover').to.be.greaterThan(0);
        node.connectedEdges('.highlighted').forEach((edge: any) => {
          expect(String(edge.style('width')), 'highlighted edge width').to.equal('3px');
        });

        win.Cypress.test.hoverNode('hide', String(nodeId));
        expect(node.connectedEdges('.highlighted').length, 'highlighted edges removed on mouseout').to.equal(0);
      });
    });

    openNetworkDisplayPanel();
    cy.get('@networkTab')
      .find('#dont-highlight-neighbors-highlight-neighbors')
      .contains('Normal')
      .click({ force: true });
    cy.window().its('commonService.session.style.widgets.node-highlight').should('equal', false);
    closeTwoDSettingsDialog();
  });
});
