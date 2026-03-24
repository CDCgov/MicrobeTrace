/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  expandAccordionTabByHeader,
  launchProfileToTwoD,
  openTwoDSettingsDialog,
} from '../../../support/journey-helpers';

type WinWithCy = Window & {
  cytoscapeInstance?: any;
};

describe('Journey Flow - Uploaded node label visibility', () => {
  const profile = getProfile('color-by-uploaded-categorical');
  const targetNodeId = '797703';
  const labelVariable = 'Profession';
  const expectedLabel = 'Healthcare';

  it('hides and restores uploaded node labels by switching the label field to None and back', () => {
    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);

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

    cy.window().should((win: unknown) => {
      const typedWindow = win as WinWithCy;
      const cyInstance = typedWindow.cytoscapeInstance;
      const targetNode = cyInstance.getElementById(targetNodeId);

      expect(targetNode.empty(), `target node exists: ${targetNodeId}`).to.equal(false);
      expect(String(targetNode.style('label')), 'visible uploaded label').to.equal(expectedLabel);
    });

    cy.get('@nodesTab').find('#node-label-variable').click({ force: true });
    cy.contains('li[role="option"]', 'None').click({ force: true });

    cy.window().its('commonService.session.style.widgets.node-label-variable').should('equal', 'None');

    cy.window().should((win: unknown) => {
      const typedWindow = win as WinWithCy;
      const cyInstance = typedWindow.cytoscapeInstance;
      const targetNode = cyInstance.getElementById(targetNodeId);

      expect(targetNode.empty(), `target node exists after hide: ${targetNodeId}`).to.equal(false);
      expect(String(targetNode.style('label')), 'hidden uploaded label').to.equal('');
    });

    cy.get('@nodesTab').find('#node-label-variable').click({ force: true });
    cy.contains('li[role="option"]', labelVariable).click({ force: true });

    cy.window().its('commonService.session.style.widgets.node-label-variable').should('equal', labelVariable);

    cy.window().should((win: unknown) => {
      const typedWindow = win as WinWithCy;
      const cyInstance = typedWindow.cytoscapeInstance;
      const targetNode = cyInstance.getElementById(targetNodeId);

      expect(targetNode.empty(), `target node exists after restore: ${targetNodeId}`).to.equal(false);
      expect(String(targetNode.style('label')), 'restored uploaded label').to.equal(expectedLabel);
    });

    cy.get('@twoDSettings')
      .find('button.p-dialog-close-button')
      .click({ force: true });
    cy.contains('.p-dialog-title', '2D Network Settings').should('not.exist');
  });
});
