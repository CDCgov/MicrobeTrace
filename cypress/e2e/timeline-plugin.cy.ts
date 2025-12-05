describe('Epi Curve / Timeline View', () => {
    const selectors = {
      container: '#epiCurve',
      settingsBtn: 'a[title="Settings"]',
      settingsPane: '#epiCurve-settings-pane',
    };
  
    beforeEach(() => {
      cy.visit('/');
      cy.wait(6000);
  
      cy.contains('button', 'Continue with Sample Dataset', { timeout: 10000 }).click({ force: true });
      cy.get('#overlay').should('not.be.visible', { timeout: 10000 });
  
      cy.contains('button', 'View').click();
      cy.contains('button[mat-menu-item]', 'Epi Curve').click();
  
      cy.get(selectors.container, { timeout: 15000 }).should('be.visible');
    });
  
    it('renders the epi curve canvas for the sample dataset', () => {
      cy.get('#epiCurveSVG').should('exist');
    });
  
    it('opens the epi curve settings dialog', () => {
      cy.get(selectors.settingsBtn).click();
      cy.get(selectors.settingsPane, { timeout: 10000 }).should('be.visible');
      cy.get(selectors.settingsPane).contains('Epi Curve Settings').should('be.visible');
  
      cy.get(selectors.settingsPane).find('.p-dialog-header-icon').click({ force: true });
      cy.get(selectors.settingsPane).should('not.be.visible');
    });
  });