describe('Sankey View', () => {
    const selectors = {
      container: '#sankey-container',
      settingsBtn: 'a[title="Settings"]',
      settingsPane: '#sankey-settings-pane',
    };
  
    beforeEach(() => {
      cy.visit('/');
      cy.wait(6000);
  
      cy.contains('button', 'Continue with Sample Dataset', { timeout: 10000 }).click({ force: true });
      cy.get('#overlay').should('not.be.visible', { timeout: 10000 });
  
      cy.contains('button', 'View').click();
      cy.contains('button[mat-menu-item]', 'Sankey').click();
  
      cy.get(selectors.container, { timeout: 15000 }).should('be.visible');
    });
  
    it('shows the sankey container when the view loads', () => {
      cy.get(selectors.container).should('exist');
    });
  
    it('opens the sankey settings and shows guidance text', () => {
      cy.get(selectors.settingsBtn).click();
      cy.get(selectors.settingsPane, { timeout: 10000 }).should('be.visible');
      cy.get(selectors.settingsPane).contains('Sankey Chart Settings').should('be.visible');
  
      cy.get(selectors.settingsPane).find('.p-dialog-header-icon').click({ force: true });
      cy.get(selectors.settingsPane).should('not.be.visible');
    });
  });