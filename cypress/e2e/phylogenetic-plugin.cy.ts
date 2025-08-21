/// <reference types="cypress" />

/**
 * Tests for the Phylogenetic Tree visualization component.
 */
describe('Phylogenetic Tree View', () => {

  // Selectors for key elements in the Phylogenetic Tree component
  const selectors = {
    treeContainer: '#phylocanvas',
    treeSvg: '#phylocanvas svg', // Target the SVG element directly
    settingsBtn: '#tool-btn-container-phylo a[title="Settings"]',
    settingsPane: '#phylotree-settings-pane', // Used only to check for non-visibility
    layoutDropdown: '#tree-layout',
    leafLabelsToggle: '#leaf-label-visibility'
  };

  /**
   * This block runs before each test. It loads the application,
   * continues with the sample dataset, and navigates to the view.
   */
  beforeEach(() => {
    cy.visit('/');
    cy.wait(6000); // Allow for initial application bootstrap

    cy.get('button:contains("Continue with Sample Dataset")', { timeout: 10000 })
     .click({ force: true });
    
    cy.get('#overlay').should('not.be.visible', { timeout: 10000 });
    
    // Open the "View" menu and click on "Phylogenetic Tree"
    cy.contains('button', 'View').click();
    cy.contains('button[mat-menu-item]', 'Phylogenetic Tree').click();
    
    // Wait for the tree container to be visible, indicating the view has loaded
    cy.get(selectors.treeContainer, { timeout: 15000 }).should('be.visible');
  });

  // probably should move these test at some point
  context('Global Settings', () => {
    it('should open global settings', () => cy.openGlobalSettings())

    it('should open and close global settings', () => {
      cy.openGlobalSettings();
      cy.closeGlobalSettings();
    })
  })

  /**
   * Test suite for toolbar and settings pane interactions.
   */
  context('Settings and Interactions', () => {
    beforeEach(() => {
      // Open the settings pane
      cy.get(selectors.settingsBtn).click();
      
      // Verify it's open by finding the title anywhere on the page. This is robust.
      cy.contains('.p-dialog-title', 'Phylogenetic Tree Settings').should('be.visible');
    });

    it('should open and close the settings pane', () => {
      
      // ✅ FINAL FIX: Find the title, traverse up to the '.p-dialog' container,
      // then find and click the close button inside it.
      cy.closeSettingsPane('Phylogenetic Tree Settings');
    });

    it('should change the tree layout to vertical', () => {
      cy.window().its('commonService.visuals.phylogenetic.SelectedTreeLayoutVariable').should('equal', 'horizontal');
      
      // Use the robust method to find the dialog container
      cy.contains('.p-dialog-title', 'Phylogenetic Tree Settings')
        .parents('.p-dialog').as('dialogContainer');

      // Perform actions within the found container
      cy.get('@dialogContainer').contains('p-accordionTab', 'Layout').click();
      cy.get('@dialogContainer').find(selectors.layoutDropdown).click();
      cy.contains('li[role="option"]', 'Vertical').click();
      cy.closeSettingsPane('Phylogenetic Tree Settings');
      cy.window().its('commonService.visuals.phylogenetic.SelectedTreeLayoutVariable').should('equal', 'vertical');
    });

    it('should change the tree layout to circular', () => {
      cy.window().its('commonService.visuals.phylogenetic.SelectedTreeLayoutVariable').should('equal', 'horizontal');
      cy.contains('.p-dialog-title', 'Phylogenetic Tree Settings')
        .parents('.p-dialog').as('dialogContainer');
      cy.get('@dialogContainer').contains('p-accordionTab', 'Layout').click();
      cy.get('@dialogContainer').find(selectors.layoutDropdown).click();
      cy.contains('li[role="option"]', 'Circular').click();
      cy.closeSettingsPane('Phylogenetic Tree Settings');
      cy.window().its('commonService.visuals.phylogenetic.SelectedTreeLayoutVariable').should('equal', 'circular');
    });
  
    it('should toggle leaf labels on and off', () => {
      // Use the robust method to find the dialog container
      cy.contains('.p-dialog-title', 'Phylogenetic Tree Settings')
        .parents('.p-dialog').as('dialogContainer');

      // Navigate to the correct settings tab
      cy.get('@dialogContainer').contains('Leaves').click();
      cy.get('@dialogContainer').contains('Labels and Tooltips').click();
    
      // Assert initial state and interact with elements
      cy.window().its('commonService.visuals.phylogenetic.SelectedLeafLabelShowVariable').should('be.true');
      cy.get(selectors.treeSvg).find('g.tidytree-node-leaf text').first().should('be.visible');
      
      cy.get('@dialogContainer').find(selectors.leafLabelsToggle).contains('Hide').click();
      
      cy.window().its('commonService.visuals.phylogenetic.SelectedLeafLabelShowVariable').should('be.false');
      cy.get(selectors.treeSvg).find('g.tidytree-node-leaf text').first().should('not.be.visible');
    
      cy.get('@dialogContainer').find(selectors.leafLabelsToggle).contains('Show').click();
    
      cy.window().its('commonService.visuals.phylogenetic.SelectedLeafLabelShowVariable').should('be.true');
      cy.get(selectors.treeSvg).find('g.tidytree-node-leaf text').first().should('be.visible');
    });
  });
});