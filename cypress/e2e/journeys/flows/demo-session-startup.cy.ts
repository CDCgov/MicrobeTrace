/// <reference types="cypress" />

describe('Demo Session Startup', () => {
  it('renders the preloaded 2D network behind the welcome overlay and keeps it ready after continue', () => {
    cy.visit('/?skipEula=1');

    cy.window({ timeout: 15000 }).its('cytoscapeInstance').should('exist');
    cy.window({ timeout: 15000 }).then((win: any) => {
      const microbeTrace = win.commonService?.visuals?.microbeTrace;
      expect(microbeTrace?.SelectedColorNodesByVariable).to.equal('State');
      expect(microbeTrace?.SelectedColorLinksByVariable).to.equal('origin');
      expect(microbeTrace?.GlobalSettingsNodeColorDialogSettings?.isVisible).to.equal(true);
      expect(microbeTrace?.GlobalSettingsLinkColorDialogSettings?.isVisible).to.equal(true);
      expect(win.document.querySelectorAll('#node-color-table tr').length).to.be.greaterThan(1);
      expect(win.document.querySelectorAll('#link-color-table tr').length).to.be.greaterThan(1);
    });
    cy.get('#numberOfNodes').should('contain.text', '33');
    cy.get('#numberOfVisibleLinks').should('contain.text', '74');
    cy.get('[role="alert"]').should('not.exist');

    cy.get('[data-testid="app-sample-dataset-button"]', { timeout: 15000 }).click({ force: true });
    cy.get('#overlay', { timeout: 15000 }).should('not.be.visible');
    cy.get('#cy', { timeout: 15000 }).should('be.visible');
    cy.get('#cy canvas', { timeout: 15000 }).should('exist');
    cy.window({ timeout: 15000 }).its('cytoscapeInstance').should('exist');

    cy.get('#numberOfNodes').should('contain.text', '33');
    cy.get('#numberOfVisibleLinks').should('contain.text', '74');
    cy.window().then((win: any) => {
      expect(win.document.querySelectorAll('#node-color-table tr').length).to.be.greaterThan(1);
      expect(win.document.querySelectorAll('#link-color-table tr').length).to.be.greaterThan(1);
    });
  });
});
