describe('Table View', () => {
    const selectors = {
      container: '.table-wrapper',
      settingsBtn: 'a[title="Settings"]',
      settingsPane: '#table-settings-pane',
    };
  
    beforeEach(() => {
      cy.visit('/');
      cy.wait(6000);
  
      cy.contains('button', 'Continue with Sample Dataset', { timeout: 10000 }).click({ force: true });
      cy.get('#overlay').should('not.be.visible', { timeout: 10000 });
  
      cy.contains('button', 'View').click();
      cy.contains('button[mat-menu-item]', 'Table').click();
  
      cy.get(selectors.container, { timeout: 15000 }).should('be.visible');
    });
  
    it('shows table view content for the sample dataset', () => {
      cy.get(selectors.container).find('p-table').should('exist');
    });
  
    it('opens and closes the table settings pane', () => {
      cy.get(selectors.settingsBtn).first().click();
      cy.get(selectors.settingsPane, { timeout: 10000 }).should('be.visible');
  
      cy.get(selectors.settingsPane).find('.p-dialog-header-icon').click({ force: true });
      cy.get(selectors.settingsPane).should('not.be.visible');
    });
  });