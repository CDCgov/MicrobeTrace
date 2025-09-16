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
    it('should update node color to all green nodes', () => {
      cy.openGlobalSettings();

      cy.get('#node-color-variable').click()
      cy.get('li[role="option"').contains('None').click()

      cy.wait(100);
      cy.get('#node-color').invoke('val', '#00ff00').trigger('input');

      cy.wait(100);
      cy.get(selectors.treeSvg).find('g.tidytree-node-leaf circle').first().should('have.css', 'fill', 'rgb(0, 255, 0)');
      cy.closeGlobalSettings();
    })

    it('should update color by to lineage and then change one of the colors', () => {
      cy.openGlobalSettings();

      cy.get('#node-color-variable').click()
      cy.get('li[role="option"').contains('Lineage').click()

      cy.wait(100);
      cy.closeGlobalSettings();

      cy.get('#node-color-table td input').first().invoke('val', '#777777').trigger('input').trigger('change');  // invoke('val', 24).trigger('input').trigger('change');
      cy.get(selectors.treeSvg).find('g.tidytree-node-leaf circle').first().should('have.css', 'fill', 'rgb(119, 119, 119)'); // make sure it works and we are good

      cy.wait(100);
    })
  })

  context('Export', () => {
    beforeEach(() => {
      // Open the settings pane
      cy.get('#tool-btn-container-phylo a[title="Export Screen"]').click();
      
      // Verify it's open by finding the title anywhere on the page. This is robust.
      cy.contains('.p-dialog-title', 'Export Phylogenetic Tree').should('be.visible');
    });

    it('should change name and export the image (as png)', () => {
      cy.get('#tree-image-filename').invoke('val', 'cypress_tree_test').trigger('input').trigger('change');
      cy.window().its('commonService.visuals.phylogenetic.SelectedTreeImageFilenameVariable').should('equal', 'cypress_tree_test');

      cy.get('#export-tree').click();
      cy.wait(1000);
      cy.readFile('cypress/downloads/cypress_tree_test.png').should('exist')
    })

    it('should change name and export the image (as svg)', () => {
      cy.get('#tree-image-filename').invoke('val', 'cypress_tree_test').trigger('input').trigger('change');
      cy.window().its('commonService.visuals.phylogenetic.SelectedTreeImageFilenameVariable').should('equal', 'cypress_tree_test');

      cy.window().its('commonService.visuals.phylogenetic.SelectedNetworkExportFileTypeListVariable').should('equal', 'png');
      cy.get('#network-export-filetype').click();
      cy.contains('li[role="option"]', 'svg').click();
      cy.window().its('commonService.visuals.phylogenetic.SelectedNetworkExportFileTypeListVariable').should('equal', 'svg');
      cy.get('#export-tree').click();
      cy.wait(1000);
      cy.readFile('cypress/downloads/cypress_tree_test.svg').should('exist')
    })

    it('should change name and export newick string', () => {
      cy.contains('.p-dialog-title', 'Export Phylogenetic Tree').parents('.p-dialog').contains('Newick').click()
      cy.get('#newick-string-filename').invoke('val', 'cypress_tree_test_nwk').trigger('input').trigger('change');
      cy.window().its('commonService.visuals.phylogenetic.SelectedNewickStringFilenameVariable').should('equal', 'cypress_tree_test_nwk');

      cy.get('#export-newick').click();
      cy.wait(1000);
      cy.window().its('commonService.session.data.newickString').then(expectedString => {
        cy.readFile('cypress/downloads/cypress_tree_test_nwk.txt').should('equal', expectedString);
      });
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

    it('should change the tree mode to smooth', () => {
      cy.window().its('commonService.visuals.phylogenetic.SelectedTreeModeVariable').should('equal', 'square');
      cy.contains('.p-dialog-title', 'Phylogenetic Tree Settings')
        .parents('.p-dialog').as('dialogContainer');
      cy.get('@dialogContainer').contains('p-accordionTab', 'Mode').click();
      cy.get('@dialogContainer').find('#tree-mode').click();
      cy.contains('li[role="option"]', 'Smooth').click();
      cy.closeSettingsPane('Phylogenetic Tree Settings');
      cy.window().its('commonService.visuals.phylogenetic.SelectedTreeModeVariable').should('equal', 'smooth');
    });

    it('should change the tree mode to straight', () => {
      cy.window().its('commonService.visuals.phylogenetic.SelectedTreeModeVariable').should('equal', 'square');
      cy.contains('.p-dialog-title', 'Phylogenetic Tree Settings')
        .parents('.p-dialog').as('dialogContainer');
      cy.get('@dialogContainer').contains('p-accordionTab', 'Mode').click();
      cy.get('@dialogContainer').find('#tree-mode').click();
      cy.contains('li[role="option"]', 'Straight').click();
      cy.closeSettingsPane('Phylogenetic Tree Settings');
      cy.window().its('commonService.visuals.phylogenetic.SelectedTreeModeVariable').should('equal', 'straight');
    });

    it('should change the tree type to Unweighted (Tree)', () => {
      cy.window().its('commonService.visuals.phylogenetic.SelectedTreeTypeVariable').should('equal', 'weighted');
      cy.contains('.p-dialog-title', 'Phylogenetic Tree Settings')
        .parents('.p-dialog').as('dialogContainer');
      cy.get('@dialogContainer').contains('p-accordionTab', 'Type').click();
      cy.get('@dialogContainer').find('#tree-type').click();
      cy.contains('li[role="option"]', 'Unweighted (Tree)').click();
      cy.closeSettingsPane('Phylogenetic Tree Settings');
      cy.window().its('commonService.visuals.phylogenetic.SelectedTreeTypeVariable').should('equal', 'tree');
    });

    it('should change the tree type to Dendrogram', () => {
      cy.window().its('commonService.visuals.phylogenetic.SelectedTreeTypeVariable').should('equal', 'weighted');
      cy.contains('.p-dialog-title', 'Phylogenetic Tree Settings')
        .parents('.p-dialog').as('dialogContainer');
      cy.get('@dialogContainer').contains('p-accordionTab', 'Type').click();
      cy.get('@dialogContainer').find('#tree-type').click();
      cy.contains('li[role="option"]', 'Dendrogram').click();
      cy.closeSettingsPane('Phylogenetic Tree Settings');
      cy.window().its('commonService.visuals.phylogenetic.SelectedTreeTypeVariable').should('equal', 'dendrogram');
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

    it('should change leaf label to Lineage and increase size', () => {
      // Use the robust method to find the dialog container
      cy.contains('.p-dialog-title', 'Phylogenetic Tree Settings')
        .parents('.p-dialog').as('dialogContainer');

      // Navigate to the correct settings tab
      cy.get('@dialogContainer').contains('Leaves').click();
      cy.get('@dialogContainer').contains('Labels and Tooltips').click();
    
      // Assert initial state and interact with elements
      cy.window().its('commonService.visuals.phylogenetic.SelectedLeafLabelVariable').should('equal', '_id');
      cy.get(selectors.treeSvg).find('g.tidytree-node-leaf text').first().should('have.text', 'MZ798055');
      
      cy.get('@dialogContainer').find('#leaf-label-variable').click();
      cy.contains('li[role="option"]', 'Lineage').click();
      
      cy.window().its('commonService.visuals.phylogenetic.SelectedLeafLabelVariable').should('equal', 'Lineage');
      cy.get(selectors.treeSvg).find('g.tidytree-node-leaf text').first().should('have.text', 'B.1.617.2');
    
      cy.window().its('commonService.visuals.phylogenetic.SelectedLeafLabelSizeVariable').should('equal', 12);
      cy.get('@dialogContainer').find('#leaf-label-size').invoke('val', 24).trigger('input').trigger('change');
      cy.window().its('commonService.visuals.phylogenetic.SelectedLeafLabelSizeVariable').should('equal', 24);
    
      cy.closeSettingsPane('Phylogenetic Tree Settings');

      cy.openGlobalSettings();

      cy.get('#node-color-variable').click()
      cy.get('li[role="option"').contains('Lineage').click()

      cy.closeGlobalSettings();
    });

    it('should toggle on/off leaf tooltip', () => {
      // Use the robust method to find the dialog container
      cy.contains('.p-dialog-title', 'Phylogenetic Tree Settings')
        .parents('.p-dialog').as('dialogContainer');

      // Navigate to the correct settings tab
      cy.get('@dialogContainer').contains('Leaves').click();
      cy.get('@dialogContainer').contains('Labels and Tooltips').click();

      cy.window().its('commonService.visuals.phylogenetic.SelectedLeafTooltipShowVariable').should('be.true');

      cy.get('@dialogContainer').find('#leaf-tooltip-visibility').contains('Hide').click();

      cy.window().its('commonService.visuals.phylogenetic.SelectedLeafTooltipShowVariable').should('be.false');
      cy.get(selectors.treeSvg).find('g.tidytree-node-leaf circle').first().trigger('mouseenter', {force: true});
      cy.get('#phyloTooltip').should('not.be.visible');
      cy.get(selectors.treeSvg).find('g.tidytree-node-leaf circle').first().trigger('mouseout', {force: true});
      cy.wait(200);
      cy.get('#phyloTooltip').should('not.be.visible');

      cy.get('@dialogContainer').find('#leaf-tooltip-visibility').contains('Show').click();

      cy.window().its('commonService.visuals.phylogenetic.SelectedLeafTooltipShowVariable').should('be.true');
      cy.get(selectors.treeSvg).find('g.tidytree-node-leaf circle').first().trigger('mouseenter', {force: true});
      cy.get('#phyloTooltip').should('be.visible');
      cy.get(selectors.treeSvg).find('g.tidytree-node-leaf circle').first().trigger('mouseout', {force: true}); //mousemove?
      cy.wait(200);
      cy.get('#phyloTooltip').should('not.be.visible');
    });

    it('should change leaf tooltip variable', () => {
      // Use the robust method to find the dialog container
      cy.contains('.p-dialog-title', 'Phylogenetic Tree Settings')
        .parents('.p-dialog').as('dialogContainer');

      // Navigate to the correct settings tab
      cy.get('@dialogContainer').contains('Leaves').click();
      cy.get('@dialogContainer').contains('Labels and Tooltips').click();
    
      // // Assert initial state and interact with elements
      cy.window().its('commonService.visuals.phylogenetic.SelectedLeafTooltipVariable').should('equal', '_id');
      
      cy.get('@dialogContainer').find('#leaf-tooltip-variable').click();
      cy.contains('li[role="option"]', 'Lineage').click();
      
      cy.window().its('commonService.visuals.phylogenetic.SelectedLeafTooltipVariable').should('equal', 'Lineage');
      cy.window().its('commonService.visuals.phylogenetic.SelectedLeafTooltipShowVariable').should('be.true');

      cy.get(selectors.treeSvg).find('g.tidytree-node-leaf circle').first().trigger('mouseenter', {force: true});
      cy.get('#phyloTooltip').should('be.visible').should('have.text', 'B.1.617.2');

      cy.closeSettingsPane('Phylogenetic Tree Settings');
    });

    it('should change leaf size variable and update min and max size', () => {
      // Use the robust method to find the dialog container
      cy.contains('.p-dialog-title', 'Phylogenetic Tree Settings')
        .parents('.p-dialog').as('dialogContainer');

      // Navigate to the correct settings tab
      cy.get('@dialogContainer').contains('Leaves').click();
      cy.get('@dialogContainer').contains('Leaf Size').click();

      cy.get(selectors.treeSvg).find('g.tidytree-node-leaf circle').first().should('have.attr', 'r', 5);
      cy.window().its('commonService.visuals.phylogenetic.SelectedLeafNodeSizeVariable').should('equal', 'None');
      cy.get('@dialogContainer').find('#leaf-size-var').click();
      cy.contains('li[role="option"]', 'Degree').click();

      cy.get(selectors.treeSvg).find('g.tidytree-node-leaf circle').first().invoke('attr', 'r').then(r => {expect(Number(r)).to.be.closeTo(8.33334, 0.001)});

      cy.window().its('commonService.visuals.phylogenetic.minNodeWidth').should('equal', 5);
      cy.get('@dialogContainer').find('#leaf-size-min').invoke('val', 10).trigger('input').trigger('change');
      cy.window().its('commonService.visuals.phylogenetic.minNodeWidth').should('equal', 10);
      cy.get(selectors.treeSvg).find('g.tidytree-node-leaf circle').first().invoke('attr', 'r').then(r => {expect(Number(r)).to.be.closeTo(11.66666, 0.001)});

      cy.window().its('commonService.visuals.phylogenetic.maxNodeWidth').should('equal', 15);
      cy.get('@dialogContainer').find('#leaf-size-max').invoke('val', 30).trigger('input').trigger('change');
      cy.window().its('commonService.visuals.phylogenetic.maxNodeWidth').should('equal', 30);
      cy.get(selectors.treeSvg).find('g.tidytree-node-leaf circle').first().invoke('attr', 'r').then(r => {expect(Number(r)).to.be.closeTo(16.66666, 0.001)});
    })

    it('should change leaf size', () => {
      // Use the robust method to find the dialog container
      cy.contains('.p-dialog-title', 'Phylogenetic Tree Settings')
        .parents('.p-dialog').as('dialogContainer');

      // Navigate to the correct settings tab
      cy.get('@dialogContainer').contains('Leaves').click();
      cy.get('@dialogContainer').contains('Leaf Size').click();

      cy.window().its('commonService.visuals.phylogenetic.SelectedLeafNodeSize').should('equal', 5);
      cy.get('@dialogContainer').find('#leaf-size').invoke('val', 20).trigger('input').trigger('change');
      cy.window().its('commonService.visuals.phylogenetic.SelectedLeafNodeSize').should('equal', 20);
    })

    it('should show branch labels and change branch label size', () => {
      // Use the robust method to find the dialog container
      cy.contains('.p-dialog-title', 'Phylogenetic Tree Settings')
        .parents('.p-dialog').as('dialogContainer');

      // Navigate to the correct settings tab
      cy.get('@dialogContainer').contains('Branches').click();
      cy.get('@dialogContainer').contains('Branch Labels').click();

      cy.window().its('commonService.visuals.phylogenetic.SelectedBranchDistanceShowVariable').should('be.false');
      cy.get('@dialogContainer').find('#branch-distance-visibility').contains('Show').click();
      cy.window().its('commonService.visuals.phylogenetic.SelectedBranchDistanceShowVariable').should('be.true');

      cy.window().its('commonService.visuals.phylogenetic.SelectedBranchDistanceSizeVariable').should('equal', 12);
      cy.get('@dialogContainer').find('#link-size').invoke('val', 16).trigger('input').trigger('change');
      cy.window().its('commonService.visuals.phylogenetic.SelectedBranchDistanceSizeVariable').should('equal', 16);
    })

    it('should show branch nodes, update branch node size, and update branch size', () => {
      // Use the robust method to find the dialog container
      cy.contains('.p-dialog-title', 'Phylogenetic Tree Settings')
        .parents('.p-dialog').as('dialogContainer');

      // Navigate to the correct settings tab
      cy.get('@dialogContainer').contains('Branches').click();
      cy.get('@dialogContainer').contains('Branch Size').click();

      cy.window().its('commonService.visuals.phylogenetic.SelectedBranchNodeShowVariable').should('be.false');
      cy.get('@dialogContainer').find('#branch-node-visibility').contains('Show').click();
      cy.window().its('commonService.visuals.phylogenetic.SelectedBranchNodeShowVariable').should('be.true');

      cy.window().its('commonService.visuals.phylogenetic.SelectedBranchNodeSizeVariable').should('equal', 5);
      cy.get('@dialogContainer').find('#branch-node-size').invoke('val', 8).trigger('input').trigger('change');
      cy.window().its('commonService.visuals.phylogenetic.SelectedBranchNodeSizeVariable').should('equal', 8);

      cy.window().its('commonService.visuals.phylogenetic.SelectedBranchSizeVariable').should('equal', 3);
      cy.get('@dialogContainer').find('#branch-size').invoke('val', 7).trigger('input').trigger('change');
      cy.window().its('commonService.visuals.phylogenetic.SelectedBranchSizeVariable').should('equal', 7);
    })    
  });
});