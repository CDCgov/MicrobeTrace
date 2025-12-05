describe('Alignment View', () => {
    const selectors = {
      container: '.msa-viewer-container',
      settingsBtn: 'a[title="Open Settings"]',
      settingsPane: '#alignment-settings-pane',
    };
  
    beforeEach(() => {
      cy.visit('/');
      cy.wait(6000);
  
      cy.contains('button', 'Continue with Sample Dataset', { timeout: 10000 }).click({ force: true });
      cy.get('#overlay').should('not.be.visible', { timeout: 10000 });
  
      cy.contains('button', 'View').click();
      cy.contains('button[mat-menu-item]', 'Alignment View').click();
  
      cy.get(selectors.container, { timeout: 15000 }).should('be.visible');
    });
  
    it('renders the alignment viewer with sample data', () => {
      cy.get(selectors.container).find('#msa-viewer').should('exist');
    });
  
    it('opens and closes the alignment settings', () => {
      cy.get(selectors.settingsBtn).click();
      cy.get(selectors.settingsPane, { timeout: 10000 }).should('be.visible');
  
      cy.get(selectors.settingsPane).find('.p-dialog-header-icon').click({ force: true });
      cy.get(selectors.settingsPane).should('not.be.visible');
    });
  });