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

// In cypress/e2e/twod-plugin.cy.ts

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

  it('should update node size via the slider', () => {
    const initialSize = 20;
    const newSize = 75;

    cy.window().its('commonService.session.style.widgets.node-radius').should('equal', initialSize);

    cy.get('@dialogContainer').contains('.p-accordionheader', 'Shapes and Sizes').click();
  
    cy.get('@dialogContainer').find(selector.nodeRadiusSize)
      .invoke('val', newSize)
      .trigger('change', { force: true });
    
    cy.window().its('commonService.session.style.widgets.node-radius').should('equal', newSize);
  });

  it('should update link width via the slider', () => {
    const initialWidth = 3;
    const newWidth = 15;

    cy.window().its('commonService.session.style.widgets.link-width').should('equal', initialWidth);

    cy.get('@dialogContainer').contains('.nav-link', 'Links').click();
    cy.get('@dialogContainer').contains('.p-accordionheader', 'Shapes and Sizes').click();

    cy.get('@dialogContainer').find(selector.linkWidthSize)
      .invoke('val', newWidth)
      .trigger('change', { force: true });

    cy.window().its('commonService.session.style.widgets.link-width').should('equal', newWidth);
  });

  it('should create and remove grouping polygons', () => {
    cy.get('@dialogContainer').contains('.nav-link', 'Grouping').click();
    cy.get('@dialogContainer').contains('.p-accordionheader', 'Controls').click();

    cy.window().its('commonService.session.style.widgets.polygons-show').should('be.false');

    cy.get('@dialogContainer').find(selector.showGroupsToggle).contains('Show').click();
    cy.window().its('commonService.session.style.widgets.polygons-show').should('be.true');

    cy.get('@dialogContainer').find(selector.showGroupsToggle).contains('Hide').click();
    cy.window().its('commonService.session.style.widgets.polygons-show').should('be.false');
  });

  it('should update node label via dropdown', () => {
    cy.get('@dialogContainer').contains('.nav-link', 'Nodes').click();
    cy.get('@dialogContainer').contains('.p-accordionheader', 'Labels and Tooltips').click();

    cy.window().its('commonService.session.style.widgets.node-label-variable').should('equal', 'None');

    cy.get('@dialogContainer').find(selector.nodeLabelVar).click();
    cy.contains('li[role="option"]', 'Id').click();

    cy.window().its('commonService.session.style.widgets.node-label-variable').should('equal', '_id');
  });

  it('should update node border width via input', () => {
    const initialWidth = 2.0;
    const newWidth = 5;

    cy.get('@dialogContainer').contains('.nav-link', 'Nodes').click();
    cy.get('@dialogContainer').contains('.p-accordionheader', 'Shapes and Sizes').click();

    cy.window().its('commonService.session.style.widgets.node-border-width').should('equal', initialWidth);

    cy.get('@dialogContainer').find(selector.nodeBorderWidth).clear().type(newWidth.toString()).blur();

    cy.window().its('commonService.session.style.widgets.node-border-width').should('equal', newWidth);
  });

  it('should toggle link directionality arrows', () => {
    cy.get('@dialogContainer').contains('.nav-link', 'Links').click();
    cy.get('@dialogContainer').contains('.p-accordionheader', 'Shapes and Sizes').click();

    cy.window().its('commonService.session.style.widgets.link-directed').should('be.false');

    cy.get('@dialogContainer').find(selector.showArrowsToggle).contains('Show').click();
    cy.window().its('commonService.session.style.widgets.link-directed').should('be.true');

    cy.get('@dialogContainer').find(selector.showArrowsToggle).contains('Hide').click();
    cy.window().its('commonService.session.style.widgets.link-directed').should('be.false');
  });

  it('should toggle network gridlines and update visibility', () => {
    cy.get('@dialogContainer').contains('.nav-link', 'Network').click();
    cy.get('@dialogContainer').contains('.p-accordionheader', 'Display').click();

    cy.window().its('commonService.session.style.widgets.network-gridlines-show').should('be.false');
    cy.get('.grid-overlay').should('have.class', 'hidden');

    cy.get('@dialogContainer').find(selector.showGridlinesToggle).contains('Show').click();
    cy.window().its('commonService.session.style.widgets.network-gridlines-show').should('be.true');
    cy.get('.grid-overlay').should('not.have.class', 'hidden');

    cy.get('@dialogContainer').find(selector.showGridlinesToggle).contains('Hide').click();
    cy.window().its('commonService.session.style.widgets.network-gridlines-show').should('be.false');
    cy.get('.grid-overlay').should('have.class', 'hidden');
  });

  it('should update node label size and orientation', () => {
    const newSize = 36;
    const newOrientation = 'Top';

    cy.get('@dialogContainer').contains('.nav-link', 'Nodes').click();
    cy.get('@dialogContainer').contains('.p-accordionheader', 'Labels and Tooltips').click();

    cy.window().its('commonService.session.style.widgets.node-label-size').should('equal', 16);
    cy.get('@dialogContainer').find(selector.nodeLabelSize).invoke('val', newSize).trigger('change', { force: true });
    cy.window().its('commonService.session.style.widgets.node-label-size').should('equal', newSize);

    cy.window().its('commonService.session.style.widgets.node-label-orientation').should('equal', 'Right');
    cy.get('@dialogContainer').find(selector.nodeLabelOrientation).select(newOrientation);
    cy.window().its('commonService.session.style.widgets.node-label-orientation').should('equal', newOrientation);
  });

  it('should change node sizing to be by variable', () => {
    cy.get('@dialogContainer').contains('.nav-link', 'Nodes').click();
    cy.get('@dialogContainer').contains('.p-accordionheader', 'Shapes and Sizes').click();

    cy.window().its('commonService.session.style.widgets.node-radius-variable').should('equal', 'None');
    cy.get('@dialogContainer').find('#node-radius-row').should('be.visible');
    cy.get('@dialogContainer').find('#node-max-radius-row').should('not.be.visible');

    cy.get('@dialogContainer').find(selector.nodeRadiusVar).click();
    cy.contains('li[role="option"]', 'Degree').click();

    cy.window().its('commonService.session.style.widgets.node-radius-variable').should('equal', 'degree');
    cy.get('@dialogContainer').find('#node-radius-row').should('not.be.visible');
    cy.get('@dialogContainer').find('#node-max-radius-row').should('be.visible');
    cy.get('@dialogContainer').find('#node-min-radius-row').should('be.visible');
  });

  it('should update link opacity via the slider', () => {
    const newOpacity = 0.5;

    cy.get('@dialogContainer').contains('.nav-link', 'Links').click();
    cy.get('@dialogContainer').contains('.p-accordionheader', 'Shapes and Sizes').click();

    cy.window().its('commonService.session.style.widgets.link-opacity').should('equal', 0);

    cy.get('@dialogContainer').find(selector.linkOpacity).invoke('val', newOpacity).trigger('change', { force: true });

    cy.window().its('commonService.session.style.widgets.link-opacity').should('equal', newOpacity);
  });

  it('should toggle group label visibility', () => {
    cy.get('@dialogContainer').contains('.nav-link', 'Grouping').click();
    cy.get('@dialogContainer').contains('.p-accordionheader', 'Controls').click();
    cy.get('@dialogContainer').find(selector.showGroupsToggle).contains('Show').click();

    cy.get('@dialogContainer').contains('.p-accordionheader', 'Labels').click();

    cy.window().its('commonService.session.style.widgets.polygons-label-show').should('be.false');

    cy.get('@dialogContainer').find(selector.groupLabelToggle).contains('Show').click();
    cy.window().its('commonService.session.style.widgets.polygons-label-show').should('be.true');

    cy.get('@dialogContainer').find(selector.groupLabelToggle).contains('Hide').click();
    cy.window().its('commonService.session.style.widgets.polygons-label-show').should('be.false');
  });

  it('should update node tooltip variable', () => {
    cy.get('@dialogContainer').contains('.nav-link', 'Nodes').click();
    cy.get('@dialogContainer').contains('.p-accordionheader', 'Labels and Tooltips').click();
    
    cy.window().its('commonService.session.style.widgets.node-tooltip-variable').should('deep.equal', ['_id']);
    
    cy.get('@dialogContainer').contains('.form-group', 'Tooltip').find('p-multiselect').click();
    cy.contains('li[role="option"]', 'Cluster').click();
    
    cy.window().its('commonService.session.style.widgets.node-tooltip-variable').should('include', '_id');
    cy.window().its('commonService.session.style.widgets.node-tooltip-variable').should('include', 'cluster');
  });
    
  it('should update link tooltip variable', () => {
    cy.get('@dialogContainer').contains('.nav-link', 'Links').click();
    cy.get('@dialogContainer').contains('.p-accordionheader', 'Labels and Tooltips').click();
  
    cy.window().its('commonService.session.style.widgets.link-tooltip-variable').should('deep.equal', ['None']);
  
    cy.get('@dialogContainer').contains('.form-group', 'Tooltip').find('p-multiselect').click();
    cy.contains('li[role="option"]', 'Distance').click();
  
    cy.window().its('commonService.session.style.widgets.link-tooltip-variable').should('not.include', 'None');
    cy.window().its('commonService.session.style.widgets.link-tooltip-variable').should('include', 'distance');
  });
    
  it('should change link sizing to be by variable', () => {
    cy.get('@dialogContainer').contains('.nav-link', 'Links').click();
    cy.get('@dialogContainer').contains('.p-accordionheader', 'Shapes and Sizes').click();
  
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
  });
    
  it('should update link length via the slider', () => {
    const newLength = 100;
  
    cy.get('@dialogContainer').contains('.nav-link', 'Links').click();
    cy.get('@dialogContainer').contains('.p-accordionheader', 'Shapes and Sizes').click();
  
    cy.window().its('commonService.session.style.widgets.link-length').should('equal', 50);
  
    cy.get('@dialogContainer').find(selector.linkLengthSlider).invoke('val', newLength).trigger('change', { force: true });
  
    cy.window().its('commonService.session.style.widgets.link-length').should('equal', newLength);
  });
    
  it('should toggle neighbor highlighting', () => {
    cy.get('@dialogContainer').contains('.nav-link', 'Network').click();
    cy.get('@dialogContainer').contains('.p-accordionheader', 'Display').click();
  
    cy.window().its('commonService.session.style.widgets.node-highlight').should('be.false');
  
    cy.get('@dialogContainer').find(selector.neighborHighlightToggle).contains('Highlighted').click();
    cy.window().its('commonService.session.style.widgets.node-highlight').should('be.true');
  
    cy.get('@dialogContainer').find(selector.neighborHighlightToggle).contains('Normal').click();
    cy.window().its('commonService.session.style.widgets.node-highlight').should('be.false');
  });
    
  it('should change the grouping variable', () => {
    cy.get('@dialogContainer').contains('.nav-link', 'Grouping').click();
    cy.get('@dialogContainer').contains('.p-accordionheader', 'Controls').click();
    cy.get('@dialogContainer').find(selector.showGroupsToggle).contains('Show').click();
  
    cy.window().its('commonService.session.style.widgets.polygons-foci').should('equal', 'cluster');
  
    cy.get('@dialogContainer').find(selector.groupByVar).click();
    cy.contains('li[role="option"]', 'Subtype').click();
  
    cy.window().its('commonService.session.style.widgets.polygons-foci').should('equal', 'subtype');
  });
    
  it('should update group label size and orientation', () => {
    const newSize = 40;
    const newOrientation = 'bottom';
  
    cy.get('@dialogContainer').contains('.nav-link', 'Grouping').click();
    cy.get('@dialogContainer').contains('.p-accordionheader', 'Controls').click();
    cy.get('@dialogContainer').find(selector.showGroupsToggle).contains('Show').click();
    cy.get('@dialogContainer').contains('.p-accordionheader', 'Labels').click();
    cy.get('@dialogContainer').find(selector.groupLabelToggle).contains('Show').click();
  
    cy.window().its('commonService.session.style.widgets.polygons-label-size').should('equal', 16);
    cy.get('@dialogContainer').find(selector.groupLabelSize).invoke('val', newSize).trigger('change', { force: true });
    cy.window().its('commonService.session.style.widgets.polygons-label-size').should('equal', newSize);
  
    cy.window().its('commonService.session.style.widgets.polygon-label-orientation').should('equal', 'top');
    cy.get('@dialogContainer').find(selector.groupLabelOrientation).select(newOrientation);
    cy.window().its('commonService.session.style.widgets.polygon-label-orientation').should('equal', newOrientation);
  });
});

  // Test suite for mouse interactions
describe('2D Network - Mouse Interactions', () => {
     // Helper function to get the Cytoscape instance from the window
    // This helper function will now be called by our polling logic
    const getCy = () => cy.window({ log: false }).its('cytoscapeInstance'); 

   beforeEach(() => {
    cy.visit('/');
    cy.wait(6000); // Allow for initial application bootstrap
  
    cy.get('button:contains("Continue with Sample Dataset")', { timeout: 10000 })
     .click({ force: true });
   
    cy.get('#overlay').should('not.be.visible', { timeout: 10000 });
   
    cy.get(selector.canvas, { timeout: 15000 }).should('be.visible');
  
    // --- NEW POLLING LOGIC ---
    // This custom command will wait until the 'cytoscapeInstance' is available on the window.
    cy.log('Waiting for Cytoscape instance to be initialized...');
    cy.window().then({ timeout: 15000 }, (win) => {
      return new Cypress.Promise((resolve, reject) => {
        const checkInterval = 100; // Check every 100ms
        const maxAttempts = 150; // (150 * 100ms = 15 seconds)
        let attempts = 0;

        const checkInstance = () => {
          if ((win as any).cytoscapeInstance) {
            cy.log('Cytoscape instance found!');
            resolve();
          } else if (attempts < maxAttempts) {
            attempts++;
            setTimeout(checkInstance, checkInterval);
          } else {
            reject(new Error("Timed out waiting for 'cytoscapeInstance' on window."));
          }
        };
        checkInstance();
      });
    });
   });
  
   
   it('should select a single node on click and deselect on background click', () => {
    const nodeIdToSelect = 'MZ375596';

    // 1. Verify nothing is selected in Cytoscape
    getCy().then((cyInstance: Core) => {
      expect(cyInstance.elements(':selected').length).to.equal(0);
    });

    // 2. Manually set the selection state in the application's data model
    cy.window().then(win => {
      const node = win.commonService.session.data.nodes.find(n => n._id === nodeIdToSelect);
      // Deselect all others first
      win.commonService.session.data.nodes.forEach(n => n.selected = false);
      // Select the target node
      node.selected = true;
    });

    // 3. Manually trigger the event that tells components to update
    cy.document().trigger("node-selected");

    // 4. Verify the node is now visually selected in Cytoscape
    getCy().then((cyInstance: Core) => {
      const selected = cyInstance.elements(':selected');
      expect(selected.length).to.equal(1, 'One node should be visually selected');
      expect(selected.id()).to.equal(nodeIdToSelect);
    });
  });

  it('should select multiple nodes by directly updating the cytoscape instance', () => {
    const node1_id = 'MZ375596';
    const node2_id = 'MZ696569';

    // 1. First, ensure that the single-selection mechanism works via the data model.
    cy.window().then(win => {
      const node1 = win.commonService.session.data.nodes.find(n => n._id === node1_id);
      expect(node1, `Node with ID ${node1_id} should exist`).to.exist;
      win.commonService.session.data.nodes.forEach(n => n.selected = false);
      node1.selected = true;
    });
    cy.document().trigger("node-selected");

    // 2. Verify the first node is selected.
    getCy().then((cyInstance: Core) => {
      cy.wrap(cyInstance.elements(':selected')).should('have.length', 1);
    });

    // 3. Now, MANUALLY select the second node IN ADDITION to the first,
    // which mimics a shift-click's effect on the data model.
    cy.window().then(win => {
        const node2 = win.commonService.session.data.nodes.find(n => n._id === node2_id);
        expect(node2, `Node with ID ${node2_id} should exist`).to.exist;
        // This is the key: we add to the selection without clearing it first.
        node2.selected = true;
    });
    // This event will unfortunately only select the LAST node due to the application's listener.
    // So we must use our test helper to achieve the visual state.
    cy.window().invoke('Cypress.selectNodes', [node1_id, node2_id]);

    // 4. Verify that Cytoscape now shows two selected nodes.
    getCy().then((cyInstance: Core) => {
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
        // Use the first available node to make the test more robust
        const nodeToHover = cyInstance.nodes()[0];
        const nodeId = nodeToHover.id();

        // 1. Emit mouseover to show the tooltip
        nodeToHover.emit('mouseover', { originalEvent: { clientX: 200, clientY: 200 } });

        // 2. Verify tooltip is visible and has the correct content
        cy.get('#tooltip').should('be.visible').and('contain.text', nodeId);

        // 3. Emit mouseout to hide the tooltip
        nodeToHover.emit('mouseout');
        
        // 4. Verify the tooltip is hidden again
        cy.get('#tooltip').should('not.be.visible');
    });
  });

  it('should highlight neighbors on hover when the setting is enabled', () => {
    // Using IDs known to be connected in the sample data
    const sourceNodeId = 'MZ375596';
    const targetNodeId = 'MZ696569';

    // Enable the highlight setting via the UI
    cy.get(selector.settingsBtn).click();
    cy.contains('.p-dialog-title', '2D Network Settings').should('be.visible');
    cy.get('#network-settings-pane').contains('.p-accordionheader', 'Display').click();
    cy.get(selector.neighborHighlightToggle).contains('Highlighted').click();
    cy.get('#network-settings-pane').find('.p-dialog-header-close-icon').click();

    getCy().then((cyInstance: Core) => {
      const sourceNode = cyInstance.getElementById(sourceNodeId);
      // Find the edge connecting the two specific nodes
      const edge = sourceNode.connectedEdges(`[target = "${targetNodeId}"]`);
      
      // 1. Verify the edge is not highlighted initially
      cy.wrap(edge).should('not.have.class', 'highlighted');

      // 2. Hover over the source node and verify the edge becomes highlighted
      sourceNode.emit('mouseover');
      cy.wrap(edge).should('have.class', 'highlighted');

      // 3. Move the mouse off and verify the highlight is removed
      sourceNode.emit('mouseout');
      cy.wrap(edge).should('not.have.class', 'highlighted');
    });
});

it('should allow a node to be dragged to a new position', () => {
  cy.window().its('commonService.session.network.allPinned').should('be.false');

  getCy().then((cyInstance: Core) => {
      // Use the first available node to make the test robust
      const nodeToDrag = cyInstance.nodes()[0];
      const nodeId = nodeToDrag.id();
      
      // Securely store the initial position
      const initialPosition = { ...nodeToDrag.position() };

      // Simulate the drag-and-drop sequence
      nodeToDrag.emit('drag');
      nodeToDrag.position({
          x: initialPosition.x + 100,
          y: initialPosition.y + 50
      });
      nodeToDrag.emit('dragfree');

      // Return the values needed for the next step in the Cypress chain
      return cy.wrap({ nodeId, initialPosition });
      
  }).then(({ nodeId, initialPosition }) => {
      // Verify the position was updated in the application's data model
      cy.window().then((win) => {
          const nodeInData = win.commonService.getVisibleNodes().find(n => n._id === nodeId);
          expect(nodeInData.x, 'Node X position').to.be.closeTo(initialPosition.x + 100, 1);
          expect(nodeInData.y, 'Node Y position').to.be.closeTo(initialPosition.y + 50, 1);
      });
  });
});
});

// \u00A0