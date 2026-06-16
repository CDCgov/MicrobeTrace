/// <reference types="cypress" />

describe('Runtime warning banner behavior', () => {
  beforeEach(() => {
    cy.visit('/?skipEula=1&skipDemoSession=1');
    cy.get('#fileDropRef', { timeout: 15000 }).should('exist');
  });

  it('does not show warning banners for recoverable runtime events', () => {
    let sawExpectedSyntheticError = false;

    Cypress.once('uncaught:exception', (error) => {
      sawExpectedSyntheticError = error.name === 'RangeError'
        && error.message.includes('Maximum call stack size exceeded');

      return sawExpectedSyntheticError ? false : undefined;
    });

    cy.window().then((win) => {
      const runtimeError = new win.RangeError('Maximum call stack size exceeded');
      win.dispatchEvent(new win.ErrorEvent('error', {
        error: runtimeError,
        message: runtimeError.message,
      }));
    });

    cy.wrap(null).should(() => {
      expect(sawExpectedSyntheticError, 'synthetic recoverable runtime event').to.equal(true);
    });
    cy.get('.runtime-error-banner').should('not.exist');
    cy.contains('Runtime issue detected').should('not.exist');
    cy.contains('MicrobeTrace caught an error').should('not.exist');
  });
});
