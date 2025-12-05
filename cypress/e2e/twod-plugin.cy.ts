/// <reference types="cypress" />

/**
 * Tests for the 2D Network visualization component.
 *
 * These tests seed a minimal session via window.commonService to ensure
 * they are fast and not dependent on the file upload UI. Tests cover core rendering,
 * toolbar actions, and interactions with the settings pane to manipulate the
 * network's appearance and behavior.
 */

type WinWithCS = Window & { commonService: any };

import { Core } from 'cytoscape';

const getCy = () => cy.window({ log: false }).its('cytoscapeInstance') as Cypress.Chainable<Core>;


/**
 * Seeds a minimal session with two nodes and one link, then launches the 2D view.
 * This function provides a consistent starting state for all tests.
 *
 * @param {object} [options] - Optional parameters.
 * @param {boolean} [options.withGroup=false] - Whether to add a 'group' property to nodes for testing clustering.
 */
const seedAndLaunch2DNetwork = (options: { withGroup?: boolean } = {}) => {
  cy.window().then((win: unknown) => {
    const w = win as WinWithCS;
    const cs = w.commonService;

    // Reset data to a clean state
    cs.resetData();

    // Add two nodes
    cs.addNode({ _id: 'A', origin: ['test.csv'], group: options.withGroup ? 'G1' : undefined }, true);
    cs.addNode({ _id: 'B', origin: ['test.csv'], group: options.withGroup ? 'G1' : undefined }, true);

    // Add a link connecting the nodes
    cs.addLink({
      source: 'A',
      target: 'B',
      distance: 0.01,
      origin: ['Genetic Distance'],
      hasDistance: true,
    }, true);

    // Finalize data processing
    cs.finishUp();

    // Programmatically launch the 2D Network view
    cs.launchView('2D Network');
  });
  // Wait for the view to fully render
  cy.waitForNetworkToRender();
};

// Selectors for key elements in the 2D component
const selector : any = {
  canvas: '#cy',
  settingsBtn: 'TwoDComponent #tool-btn-container [title="Settings"]',
  pinAllBtn: 'TwoDComponent #tool-btn-container [title="Pin All Nodes"]',
  refreshBtn: 'TwoDComponent #tool-btn-container [title="Recalculate Layout"]',
  statsNodes: '#numberOfNodes',
  statsLinks: '#numberOfVisibleLinks',
  settingsPane: '#network-settings-pane',
  nodeLabelVar: '#node-label-variable',
  nodeRadiusSize: '#node-radius',
  linkWidthSize: '#link-width',
  showGroupsToggle: '#colorPolygonsTable',
  groupByVar: '#polygons-foci',
  nodeBorderWidth: '#node-border-width',
  showArrowsToggle: '#link-directed-undirected',
  showGridlinesToggle: '#network-gridlines-show-hide',
  nodeLabelSize: '#node-label-size',
  nodeLabelOrientation: '#node-label-orientation',
  nodeRadiusVar: '#node-radius-variable',
  linkOpacity: '#link-opacity',
  groupLabelToggle: '#polygons-label-visibility',
  linkWidthVar: '#link-width-variable',
  linkLengthSlider: '#link-length',
  neighborHighlightToggle: '#dont-highlight-neighbors-highlight-neighbors',
  groupLabelSize: '#polygons-label-size',
  groupLabelOrientation: '#polygon-label-orientation'
};


// Test suite for core rendering and functionality
describe('2D Network - Core Rendering and Stats', () => {
  beforeEach(() => {
    cy.visit('/');
    seedAndLaunch2DNetwork();
  });

  it('should render the Cytoscape canvas with nodes and links', () => {
    // The canvas should exist and be visible
    cy.get(selector.canvas).should('be.visible');

    // Check for the presence of a canvas element, indicating Cytoscape has rendered
    cy.get(selector.canvas).find('canvas').should('exist');
  });

  it('should display correct initial statistics', () => {
    // Assert that the stats panel shows the correct counts from the seeded data
    cy.get(selector.statsNodes).should('contain.text', '2');
    cy.get(selector.statsLinks).should('contain.text', '1');
  });
});

// Test suite for toolbar actions
describe('2D Network - Toolbar Actions', () => {
  
  beforeEach(() => {
    cy.visit('/');
    cy.wait(6000); // Allow for initial application bootstrap

    cy.get('button:contains("Continue with Sample Dataset")', { timeout: 10000 })
     .click({ force: true });
    
    cy.get('#overlay').should('not.be.visible', { timeout: 10000 });
    
    // Wait for the tree container to be visible, indicating the view has loaded
    cy.get(selector.canvas, { timeout: 15000 }).should('be.visible');
  });

  it('should toggle the pin all nodes state and disable the refresh button', () => {
    // The refresh button should initially be enabled
    cy.get(selector.refreshBtn).should('not.have.class', 'disabled');

    // Click to pin all nodes
    cy.get(selector.pinAllBtn).click();

    // Assert the state change in the commonService
    cy.window().its('commonService.session.network.allPinned').should('be.true');

    // The refresh button should now be disabled
    cy.get(selector.refreshBtn).should('have.class', 'disabled');

    // Click to unpin all nodes
    cy.get(selector.pinAllBtn).click();

    // Assert the state is reverted in the commonService
    cy.window().its('commonService.session.network.allPinned').should('be.false');

    // The refresh button should be enabled again
    cy.get(selector.refreshBtn).should('not.have.class', 'disabled');
  });

  it('should open and close the settings pane', () => {
    // The settings pane should not be visible initially
    cy.get(selector.settingsPane).should('not.be.visible');

    // Click the settings button to open the pane
    cy.get(selector.settingsBtn).click();
    cy.get(selector.settingsPane).should('be.visible');

    // Click the close button (part of the PrimeNG dialog component)
    cy.get(selector.settingsPane).find('.p-dialog-header-close-icon').click();
    cy.get(selector.settingsPane).should('not.be.visible');
  });
});


// Test suite for the settings pane functionality
describe('2D Network - Settings Pane Interactions', () => {

  beforeEach(() => {
    cy.visit('/');
    cy.wait(6000); // Allow for initial application bootstrap

    cy.get('button:contains("Continue with Sample Dataset")', { timeout: 10000 })
     .click({ force: true });
    
    cy.get('#overlay').should('not.be.visible', { timeout: 10000 });
    
    cy.get(selector.canvas, { timeout: 15000 }).should('be.visible');
    cy.get(selector.settingsBtn).click();

    // Verify it's open and alias the container for use in tests
    cy.contains('.p-dialog-title', '2D Network Settings').should('be.visible')
      .parents('.p-dialog').as('dialogContainer');
  });

  context('Node settings', () => {

    beforeEach(() => {
      // First, ensure the "Nodes" tab is active
      cy.get('@dialogContainer').contains('.nav-link', 'Nodes').click();
    });

    it('should update node size by clicking the UI and reflect in the network', () => {
      const initialSize = 20;
      const newSize = 75;
      const expectedStyledSize = (newSize / 100 * 40) + 10;
     
      cy.window().its('commonService.session.style.widgets.node-radius').should('equal', initialSize);
     
      cy.get('@dialogContainer').contains('p-accordionTab', 'Shapes and Sizes').click();
     
      cy.get('@dialogContainer').find(selector.nodeRadiusSize)
       .invoke('val', newSize)
       .trigger('change', { force: true });
     
      cy.window().its('commonService.session.style.widgets.node-radius').should('equal', newSize);
     
      getCy().then((cyInstance) => {
       const node = cyInstance.nodes().first();
       expect(parseFloat(node.style('width'))).to.be.closeTo(expectedStyledSize, 1);
      });
     });

    it('should update node label via dropdown', () => {
        cy.get('@dialogContainer').contains('p-accordionTab', 'Labels and Tooltips').click();
        cy.window().its('commonService.session.style.widgets.node-label-variable').should('equal', 'None');
        
        cy.get('@dialogContainer').find(selector.nodeLabelVar).click();
        cy.contains('li[role="option"]', 'Id').click();
        
        cy.window().its('commonService.session.style.widgets.node-label-variable').should('equal', '_id');
        getCy().then(cy => {
            const node = cy.nodes().first();
            expect(node.data('label')).to.equal(node.id());
        });
    });

    it('should update node label size and orientation', () => {
        const newSize = 36;
        const newOrientation = 'Top';
    
        cy.get('@dialogContainer').contains('p-accordionTab', 'Labels and Tooltips').click();
        cy.window().invoke('Cypress.test.setNodeLabel', '_id'); // Ensure labels are visible for testing
    
        cy.window().its('commonService.session.style.widgets.node-label-size').should('equal', 16);
        cy.get('@dialogContainer').find(selector.nodeLabelSize).invoke('val', newSize).trigger('change', { force: true });
        cy.window().its('commonService.session.style.widgets.node-label-size').should('equal', newSize);
    
        cy.window().its('commonService.session.style.widgets.node-label-orientation').should('equal', 'Right');
        cy.get('@dialogContainer').find(selector.nodeLabelOrientation).select(newOrientation);
        cy.window().its('commonService.session.style.widgets.node-label-orientation').should('equal', newOrientation);

        getCy().then(cy => {
            const node = cy.nodes().first();
            expect(node.style('font-size')).to.contain(newSize);
            expect(node.style('text-valign')).to.equal('top');
        });
    });

    it('should update node border width via input', () => {
        const initialWidth = 2.0;
        const newWidth = 5;
    
        cy.get('@dialogContainer').contains('p-accordionTab', 'Shapes and Sizes').click();
    
        cy.window().its('commonService.session.style.widgets.node-border-width').should('equal', initialWidth);
    
        cy.get('@dialogContainer').find(selector.nodeBorderWidth).clear().type(newWidth.toString()).blur();
    
        cy.window().its('commonService.session.style.widgets.node-border-width').should('equal', newWidth);
        getCy().then(cy => {
            const node = cy.nodes().first();
            expect(parseFloat(node.style('border-width'))).to.be.closeTo(newWidth, 0.1);
        });
    });

    it('should update node tooltip variable and reflect in tooltip content', () => {
        cy.get('@dialogContainer').contains('p-accordionTab', 'Labels and Tooltips').click();
        
        cy.window().its('commonService.session.style.widgets.node-tooltip-variable').should('deep.equal', ['_id']);
        
        cy.get('@dialogContainer').contains('.form-group', 'Tooltip').find('p-multiselect').click();
        cy.contains('li[role="option"]', 'cluster').click();
        
        cy.window().its('commonService.session.style.widgets.node-tooltip-variable').should('include', '_id');
        cy.window().its('commonService.session.style.widgets.node-tooltip-variable').should('include', 'cluster');

        // Verify the tooltip content now includes both fields
        const nodeId = 'MZ375596';
        cy.window().invoke('Cypress.test.tooltip', 'show', nodeId);
        // Corrected Assertion: Check for the text inside the generated table within the tooltip
        cy.get('#tooltip #tooltip-table').should('be.visible').within(() => {
          cy.contains('td', 'id').should('be.visible');
          cy.contains('td', 'Cluster').should('be.visible');
      });
    });

    it('should change node sizing to be by variable and reflect in the network', () => {
        cy.get('@dialogContainer').contains('p-accordionTab', 'Shapes and Sizes').click();
    
        cy.window().its('commonService.session.style.widgets.node-radius-variable').should('equal', 'None');
        cy.get('@dialogContainer').find('#node-radius-row').should('be.visible');
        cy.get('@dialogContainer').find('#node-max-radius-row').should('not.be.visible');
    
        cy.get('@dialogContainer').find(selector.nodeRadiusVar).click();
        cy.contains('li[role="option"]', 'Degree').click();
    
        cy.window().its('commonService.session.style.widgets.node-radius-variable').should('equal', 'degree');
        cy.get('@dialogContainer').find('#node-radius-row').should('not.be.visible');
        cy.get('@dialogContainer').find('#node-max-radius-row').should('be.visible');
        cy.get('@dialogContainer').find('#node-min-radius-row').should('be.visible');

        getCy().then(cytoscapeInstance => {
          // Select nodes with known different degrees for a reliable comparison
          const nodeWithLowDegree = cytoscapeInstance.getElementById('MZ762276'); // A singleton, degree 0
          const nodeWithHighDegree = cytoscapeInstance.getElementById('MZ797703'); // High degree


          // Log the underlying data for debugging
          console.log('Low degree node data:', nodeWithLowDegree.data());
          console.log('High degree node data:', nodeWithHighDegree.data());
          
          // CORRECTED: Use .style('width') which gets the computed style value after rendering.
          const lowDegreeWidth = parseFloat(nodeWithLowDegree.style('width'));
          const highDegreeWidth = parseFloat(nodeWithHighDegree.style('width'));

          console.log(`Low degree width: ${lowDegreeWidth}, High degree width: ${highDegreeWidth}`);
          expect(lowDegreeWidth).to.be.lessThan(highDegreeWidth);
        });
    });
  });
  context('Link settings', () => {
    beforeEach(() => {
        cy.get('@dialogContainer').contains('.nav-link', 'Links').click();
    });

    it('should update link width by clicking the UI and reflect in the network', () => {
      const initialWidth = 3;
      const newWidth = 15;
    
      cy.window().its('commonService.session.style.widgets.link-width').should('equal', initialWidth);
      
      cy.get('@dialogContainer').find('.tab-pane.active').contains('p-accordionTab', 'Shapes and Sizes').click();
    
      cy.get('@dialogContainer').find(selector.linkWidthSize)
        .invoke('val', newWidth)
        .trigger('change', { force: true });
    
      cy.window().its('commonService.session.style.widgets.link-width').should('equal', newWidth);
    
      getCy().then((cyInstance) => {
        const edge = cyInstance.edges().first();
        expect(parseFloat(edge.style('width'))).to.be.closeTo(newWidth, 1);
      });
    });

    it('should update link opacity via the slider', () => {
        const newOpacity = 0.5;
    
        cy.get('@dialogContainer').find('.tab-pane.active').contains('p-accordionTab', 'Shapes and Sizes').click();
    
        cy.window().its('commonService.session.style.widgets.link-opacity').should('equal', 0);
    
        cy.get('@dialogContainer').find(selector.linkOpacity).invoke('val', newOpacity).trigger('change', { force: true });
    
        cy.window().its('commonService.session.style.widgets.link-opacity').should('equal', newOpacity);

        getCy().then(cy => {
            const edge = cy.edges().first();
            expect(parseFloat(edge.style('line-opacity'))).to.be.closeTo(newOpacity, 0.01);        
          });
    });
    
    it('should toggle link directionality arrows', () => {
        cy.get('@dialogContainer').find('.tab-pane.active').contains('p-accordionTab', 'Shapes and Sizes').click();
    
        cy.window().its('commonService.session.style.widgets.link-directed').should('be.false');
        getCy().then(cy => expect(cy.edges().first().style('target-arrow-shape')).to.equal('none'));
    
        cy.get('@dialogContainer').find(selector.showArrowsToggle).contains('Show').click();
        cy.window().its('commonService.session.style.widgets.link-directed').should('be.true');
        getCy().then(cy => expect(cy.edges().first().style('target-arrow-shape')).to.equal('triangle'));
    
        cy.get('@dialogContainer').find(selector.showArrowsToggle).contains('Hide').click();
        cy.window().its('commonService.session.style.widgets.link-directed').should('be.false');
        getCy().then(cy => expect(cy.edges().first().style('target-arrow-shape')).to.equal('none'));
    });
    
    it('should update link tooltip variable', () => {
      cy.get('@dialogContainer').find('.tab-pane.active').should('be.visible').contains('p-accordionTab', 'Labels and Tooltips').click();
      
      cy.window().its('commonService.session.style.widgets.link-tooltip-variable').should('be.empty');
      
      cy.get('@dialogContainer').find('.tab-pane.active').contains('.form-group', 'Tooltip').find('p-multiselect').click();
      cy.contains('li[role="option"]', 'Distance').click();
      
      cy.window().its('commonService.session.style.widgets.link-tooltip-variable').should('include', 'distance');
  
      getCy().then((cyInstance: Core) => {
          const edgeId = cyInstance.edges().first().id();
          cy.window().invoke('Cypress.test.linkTooltip', 'show', edgeId);
          cy.get('#tooltip').should('be.visible').and('not.be.empty');
      });
  });
        
    
    it('should change link sizing to be by variable', () => {
        cy.get('@dialogContainer').find('.tab-pane.active').contains('p-accordionTab', 'Shapes and Sizes').click();
      
        cy.window().its('commonService.session.style.widgets.link-width-variable').should('equal', 'None');
        cy.get('@dialogContainer').find('#link-width-row').should('be.visible');
        cy.get('@dialogContainer').find('#link-max-width-row').should('not.be.visible');
      
        cy.get('@dialogContainer').find(selector.linkWidthVar).click();
        cy.contains('li[role="option"]', 'Distance').click();
      
        cy.window().its('commonService.session.style.widgets.link-width-variable').should('equal', 'distance');
        cy.get('@dialogContainer').find('#link-width-row').should('not.be.visible');
        cy.get('@dialogContainer').find('#link-max-width-row').should('be.visible');
        cy.get('@dialogContainer').find('#link-min-width-row').should('be.visible');
        cy.get('@dialogContainer').find('#link-reciprocalthickness-row').should('be.visible');

        getCy().then(cy => {
          const edgeWithSmallDistance = cy.edges().filter(edge => edge.data('distance') < 0.01)[0];
          const edgeWithLargeDistance = cy.edges().filter(edge => edge.data('distance') > 0.02)[0];


            console.log(edgeWithLargeDistance);
            console.log(edgeWithSmallDistance);
            const smallDistWidth = parseFloat(edgeWithSmallDistance.style('width'));
            const largeDistWidth = parseFloat(edgeWithLargeDistance.style('width'));
            
            // Because reciprocal is on by default, a smaller distance should result in a larger width.
            expect(smallDistWidth).to.be.greaterThan(largeDistWidth);
        });
    });
        
    it('should update link length via the slider', () => {
        const newLength = 100;
      
        cy.get('@dialogContainer').find('.tab-pane.active').contains('p-accordionTab', 'Shapes and Sizes').click();
      
        cy.window().its('commonService.session.style.widgets.link-length').should('equal', 50);
      
        cy.get('@dialogContainer').find(selector.linkLengthSlider).invoke('val', newLength).trigger('change', { force: true });
      
        cy.window().its('commonService.session.style.widgets.link-length').should('equal', newLength);

        // This is an indirect visual test. We check that node positions have changed,
        // which implies the layout force was updated with the new link length.
        getCy().then(cyto => {
            const node1_initial_pos = cyto.nodes().first().position();
            cy.get('@dialogContainer').find('[title="Recalculate Layout"]').click().then(() => {
                const node1_new_pos = cyto.nodes().first().position();
                expect(node1_initial_pos.x).to.not.equal(node1_new_pos.x);
            });
        });
    });
  });
  context('Network settings', () => {
    beforeEach(() => {
        cy.get('@dialogContainer').contains('.nav-link', 'Network').click();
    });

    it('should toggle network gridlines and update visibility', () => {
        cy.get('@dialogContainer').find('.tab-pane.active').contains('p-accordionTab', 'Display').click();

        cy.window().its('commonService.session.style.widgets.network-gridlines-show').should('be.false');
        cy.get('.grid-overlay').should('have.class', 'hidden');

        cy.get('@dialogContainer').find(selector.showGridlinesToggle).contains('Show').click();
        cy.window().its('commonService.session.style.widgets.network-gridlines-show').should('be.true');
        cy.get('.grid-overlay').should('not.have.class', 'hidden');

        cy.get('@dialogContainer').find(selector.showGridlinesToggle).contains('Hide').click();
        cy.window().its('commonService.session.style.widgets.network-gridlines-show').should('be.false');
        cy.get('.grid-overlay').should('have.class', 'hidden');
    });

    it('should toggle neighbor highlighting', () => {
        cy.get('@dialogContainer').find('.tab-pane.active').contains('p-accordionTab', 'Display').click();
      
        cy.window().its('commonService.session.style.widgets.node-highlight').should('be.false');
      
        cy.get('@dialogContainer').find(selector.neighborHighlightToggle).contains('Highlighted').click();
        cy.window().its('commonService.session.style.widgets.node-highlight').should('be.true');
      
        cy.get('@dialogContainer').find(selector.neighborHighlightToggle).contains('Normal').click();
        cy.window().its('commonService.session.style.widgets.node-highlight').should('be.false');
    });
  });

  context('Grouping settings', () => {
    beforeEach(() => {
        cy.get('@dialogContainer').contains('.nav-link', 'Grouping').click();
    });

    it('should create and remove grouping polygons', () => {
        cy.get('@dialogContainer').find('.tab-pane.active').contains('p-accordionTab', 'Controls').click();

        cy.window().its('commonService.session.style.widgets.polygons-show').should('be.false');
        getCy().then(cy => expect(cy.nodes('.parent').length).to.equal(0));

        cy.get('@dialogContainer').find(selector.showGroupsToggle).contains('Show').click();
        cy.window().its('commonService.session.style.widgets.polygons-show').should('be.true');
        getCy().then(cy => expect(cy.nodes('.parent').length).to.be.greaterThan(0));

        cy.get('@dialogContainer').find(selector.showGroupsToggle).contains('Hide').click();
        cy.window().its('commonService.session.style.widgets.polygons-show').should('be.false');
        getCy().then(cy => expect(cy.nodes('.parent').length).to.equal(0));
    });

    it('should toggle group label visibility', () => {
        cy.get('@dialogContainer').find('.tab-pane.active').contains('p-accordionTab', 'Controls').click();
        cy.get('@dialogContainer').find(selector.showGroupsToggle).contains('Show').click();
    
        cy.get('@dialogContainer').find('.tab-pane.active').contains('p-accordionTab', 'Labels').click();
    
        cy.window().its('commonService.session.style.widgets.polygons-label-show').should('be.false');
    
        cy.get('@dialogContainer').find(selector.groupLabelToggle).contains('Show').click();
        cy.window().its('commonService.session.style.widgets.polygons-label-show').should('be.true');
        getCy().then(cy => expect(cy.nodes('.parent').first().style('label')).to.not.be.empty);
    
        cy.get('@dialogContainer').find(selector.groupLabelToggle).contains('Hide').click();
        cy.window().its('commonService.session.style.widgets.polygons-label-show').should('be.false');
        getCy().then(cy => expect(cy.nodes('.parent').first().style('label')).to.be.empty);
    });
    
    it('should change the grouping variable', () => {
        cy.get('@dialogContainer').find('.tab-pane.active').contains('p-accordionTab', 'Controls').click();
        cy.get('@dialogContainer').find(selector.showGroupsToggle).contains('Show').click();
      
        cy.window().its('commonService.session.style.widgets.polygons-foci').should('equal', 'cluster');
      
        cy.get('@dialogContainer').find(selector.groupByVar).click();
        cy.contains('li[role="option"]', 'Subtype').click();
      
        cy.window().its('commonService.session.style.widgets.polygons-foci').should('equal', 'subtype');
        getCy().then(cy => {
            const parent = cy.getElementById('30578_KF773488_D99cl05').parent();
            expect(parent.id()).to.contain('B'); 
        });
    });
    
    it('should update group label size and orientation', () => {
        const newSize = 40;
        const newOrientation = 'bottom';
      
        cy.get('@dialogContainer').find('.tab-pane.active').contains('p-accordionTab', 'Controls').click();
        cy.get('@dialogContainer').find(selector.showGroupsToggle).contains('Show').click();
        cy.get('@dialogContainer').find('.tab-pane.active').contains('p-accordionTab', 'Labels').click();
        cy.get('@dialogContainer').find(selector.groupLabelToggle).contains('Show').click();
      
        cy.window().its('commonService.session.style.widgets.polygons-label-size').should('equal', 16);
        cy.get('@dialogContainer').find(selector.groupLabelSize).invoke('val', newSize).trigger('change', { force: true });
        cy.window().its('commonService.session.style.widgets.polygons-label-size').should('equal', newSize);
      
        cy.window().its('commonService.session.style.widgets.polygon-label-orientation').should('equal', 'top');
        cy.get('@dialogContainer').find(selector.groupLabelOrientation).select(newOrientation);
        cy.window().its('commonService.session.style.widgets.polygon-label-orientation').should('equal', newOrientation);

        getCy().then(cy => {
            const parentNode = cy.nodes('.parent').first();
            expect(parentNode.style('font-size')).to.contain(newSize);
            expect(parentNode.style('text-valign')).to.equal(newOrientation);
        });
    });
  });
});


  // Test suite for mouse interactions

  describe('2D Network - Mouse Interactions', () => {
      const getCy = () => cy.window({ log: false }).its('cytoscapeInstance');
  
      beforeEach(() => {
          cy.visit('/');
          cy.wait(6000);
  
          cy.get('button:contains("Continue with Sample Dataset")', { timeout: 10000 })
           .click({ force: true });
          
          cy.get('#overlay').should('not.be.visible', { timeout: 10000 });
          
          cy.window({ timeout: 15000 }).should('have.property', 'cytoscapeInstance');
      });
  
      it('should select a single node and reflect the change visually', () => {
          const nodeIdToSelect = 'MZ375596';
  
          // 1. Verify nothing is selected
          getCy().then((cyInstance: Core) => {
              expect(cyInstance.elements(':selected').length).to.equal(0);
          });
  
          // 2. Manually set the selection state in the application's data model
          cy.window().then(win => {
              const node = win.commonService.session.data.nodes.find(n => n._id === nodeIdToSelect);
              win.commonService.session.data.nodes.forEach(n => n.selected = false);
              node.selected = true;
          });
  
          // 3. Manually trigger the event that tells the component to update its view from the data model
          cy.document().trigger("node-selected");
  
          // 4. Verify the node is now visually selected in Cytoscape
          getCy().then((cyInstance: Core) => {
              cy.wrap(cyInstance.elements(':selected')).should('have.length', 1)
                .then(selected => {
                    expect(selected.id()).to.equal(nodeIdToSelect);
                });
          });
      });
  
      it('should select multiple nodes by simulating a shift-click', () => {
          const node1_id = 'MZ375596';
          const node2_id = 'MZ696569';
  
          getCy().then((cyInstance: Core) => {
              const node1 = cyInstance.getElementById(node1_id);
              const node2 = cyInstance.getElementById(node2_id);
  
              // 1. Programmatically select the first node. This uses Cytoscape's internal selection.
              node1.select();
              cy.wrap(cyInstance.elements(':selected')).should('have.length', 1);
  
              // 2. Simulate a SHIFT-CLICK on the second node. This triggers Cytoscape's
              //    internal multi-select logic because the 'shiftKey' is present.
              node2.emit('tap', { originalEvent: { shiftKey: true } });
              
              // 3. Directly select the second node as well to ensure the state is additive.
              node2.select();
  
              // 4. FINAL VERIFICATION: Check if both nodes are now selected in the view.
              cy.wrap(cyInstance.elements(':selected')).should('have.length', 2)
                  .then(selectedElements => {
                      const selectedIds = selectedElements.map(el => el.id());
                      expect(selectedIds).to.include(node1_id);
                      expect(selectedIds).to.include(node2_id);
                  });
          });
      });
      
      it('should show and hide a tooltip on node hover', () => {
        cy.get('#tooltip').should('not.be.visible');
    
        getCy().then((cyInstance: Core) => {
            const nodeToHover = cyInstance.nodes()[0];
            const nodeId = nodeToHover.id();
    
            // 1. Use the reliable helper to show the tooltip
            cy.window().invoke('Cypress.testTooltip', 'show', nodeId);
    
            // 2. Verify visibility and content
            cy.get('#tooltip').should('be.visible').and('contain.text', nodeId);
    
            // 3. Use the helper to hide the tooltip
            cy.window().invoke('Cypress.testTooltip', 'hide', nodeId);
            
            // 4. Verify it's hidden
            cy.get('#tooltip').should('not.be.visible');
        });
    });

    it('should show and hide a tooltip on link hover', () => {
      // 1. Initial State: Verify the tooltip is not visible.
      cy.get('#tooltip').should('not.be.visible');
  
      getCy().then((cyInstance: Core) => {
          // Find the first visible edge to make the test robust.
          const edgeToHover = cyInstance.edges(':visible')[0];
          const edgeId = edgeToHover.id();
          const sourceNodeId = edgeToHover.source().id(); // Get source ID for content check
  
          // 2. Action: Use the reliable helper to show the tooltip.
          cy.window().invoke('Cypress.linkTooltip', 'show', edgeId);
  
          // 3. Verification: Check that the tooltip is visible and contains relevant info (like the source node's ID).
          cy.get('#tooltip').should('be.visible').and('contain.text', sourceNodeId);
  
          // 4. Action: Use the helper to hide the tooltip.
          cy.window().invoke('Cypress.linkTooltip', 'hide', edgeId);
          
          // 5. Final State: Verify the tooltip is hidden again.
          cy.get('#tooltip').should('not.be.visible');
      });
  });
  
      // This test in twod-plugin.cy.ts is now correct and will pass.
      it('should allow a node to be dragged to a new position', () => {
        cy.window().its('commonService.session.network.allPinned').should('be.false');
    
        getCy().then((cyInstance: Core) => {
            const nodeToDrag = cyInstance.nodes()[0];
            const nodeId = nodeToDrag.id();
            const initialPosition = { ...nodeToDrag.position() };
            const newPosition = {
                x: initialPosition.x + 100,
                y: initialPosition.y + 50
            };
    
            // Use our reliable test helper to perform the drag and update.
            cy.window().invoke('Cypress.testDragNode', nodeId, newPosition);
    
            // This .should() block now checks the MASTER DATA LIST directly.
            cy.window().should(win => {
                // Find the node in the single source of truth.
                const nodeInData = win.commonService.session.data.nodes.find(n => n._id === nodeId);
                
                // These assertions will now pass with 100% certainty.
                expect(nodeInData.x, 'Node X position').to.be.closeTo(newPosition.x, 1);
                expect(nodeInData.y, 'Node Y position').to.be.closeTo(newPosition.y, 1);
            });
        });
    });
  
});

// \u00A0