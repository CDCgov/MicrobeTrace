/// <reference types="cypress" />

describe('Local session links', () => {
  it('saves a session in this browser and restores it from a bookmarkable link', () => {
    cy.visit('/?skipEula=1');
    cy.window().its('commonService.session.data.nodes').should('have.length.greaterThan', 0);
    cy.window().its('commonService.session.network.isFullyLoaded').should('eq', true);

    cy.window().then((win: any) => {
      const nodeCount = win.commonService.session.data.nodes.length;
      const linkCount = win.commonService.session.data.links.length;

      cy.get('[data-testid="app-file-menu-button"]').click();
      cy.contains('button[mat-menu-item]', 'Save').click();
      cy.get('#session-stash-modal #stash-name').type('Lightning talk');
      cy.get('#session-stash-modal p-select').click();
      cy.contains('li[role="option"]', 'Local link').click();
      cy.get('#session-stash-modal #stash-data').click();

      cy.get('#local-session-link-url').should('be.visible').invoke('val').then((value) => {
        const link = new URL(String(value));
        expect(link.origin).to.eq(win.location.origin);
        expect(link.searchParams.get('localSession')).to.match(/^[0-9a-f]{32}$/);
        expect([...link.searchParams.keys()]).to.deep.eq(['localSession']);
        expect(link.href).not.to.include('Lightning talk');

        cy.visit(link.href);
        cy.window().its('commonService.session.data.nodes').should('have.length', nodeCount);
        cy.window().its('commonService.session.data.links').should('have.length', linkCount);
        cy.window().its('commonService.session.network.isFullyLoaded').should('eq', true);
        cy.contains('Local session unavailable').should('not.exist');
      });
    });
  });

  it('explains when a local link is missing without loading the sample session', () => {
    cy.visit('/?skipEula=1&localSession=00000000000000000000000000000000');
    cy.contains('[role="dialog"]', 'Local session unavailable').should('be.visible');
    cy.window().its('commonService.session.data.nodes').should('have.length', 0);
    cy.contains('[role="dialog"]', 'Local session unavailable').contains('button', 'OK').click();
    cy.contains('[role="dialog"]', 'Local session unavailable').should('not.exist');
  });
});
