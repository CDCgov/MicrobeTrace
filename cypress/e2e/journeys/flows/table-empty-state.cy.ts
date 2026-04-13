/// <reference types="cypress" />

import { visitAppAndAcceptEula } from '../../../support/journey-helpers';
import { byTestId, testIds } from '../../../support/selectors';

describe('Journey Flow - Table empty state', () => {
  it('shows the empty-state prompt when Table opens without uploaded data', () => {
    visitAppAndAcceptEula();

    cy.get(byTestId(testIds.appViewMenuButton), { timeout: 15000 }).click({ force: true });
    cy.contains('button[mat-menu-item]', 'Table', { timeout: 15000 }).click({ force: true });

    cy.get('.table-wrapper', { timeout: 15000 }).should('be.visible');
    cy.get('tablecomponent #file-prompt', { timeout: 15000 })
      .should('be.visible')
      .and('contain.text', 'Please add data files to load...');
    cy.get('.table-wrapper .p-datatable').should('not.exist');
  });
});
