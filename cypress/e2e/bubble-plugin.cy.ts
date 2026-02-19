describe('Bubble View', () => {
    const selectors = {
      container: '#cyBubble',
      settingsBtn: 'a[title="Open Settings"]',
      settingsPane: '.p-dialog-header:contains("Bubble Settings")',
    };
  
    beforeEach(() => {
      cy.visit('/');
      cy.wait(6000);
  
      cy.contains('button', 'Continue with Sample Dataset', { timeout: 10000 }).click({ force: true });
      cy.get('#overlay').should('not.be.visible', { timeout: 10000 });
  
      cy.contains('button', 'View').click();
      cy.contains('button[mat-menu-item]', 'Bubble').click();
  
      cy.get(selectors.container, { timeout: 15000 }).should('be.visible');
    });
  
    it('renders bubble view canvas', () => {
      cy.get(selectors.container).should('exist');
    });
  
    it('opens and closes the bubble settings dialog', () => {
      cy.get(selectors.settingsBtn).click();
      cy.contains('div.p-dialog', 'Bubble Settings', { timeout: 10000 }).should('be.visible');
  
      cy.contains('div.p-dialog', 'Bubble Settings').find('.p-dialog-header-icon').click({ force: true });
      cy.contains('div.p-dialog', 'Bubble Settings').should('not.be.visible');
    });
  });