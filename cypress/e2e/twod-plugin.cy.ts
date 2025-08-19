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
  settingsBtn: '[title="Settings"]',
  pinAllBtn: '[title="Pin All Nodes"]',
  refreshBtn: '[title="Recalculate Layout"]',
  statsNodes: '#numberOfNodes',
  statsLinks: '#numberOfVisibleLinks',
  settingsPane: '#network-settings-pane',
  nodeLabelVar: '#node-label-variable',
  nodeRadiusSize: '#node-radius',
  linkWidthSize: '#link-width',
  showGroupsToggle: '#colorPolygonsTable',
  groupByVar: '#polygons-foci'
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
    seedAndLaunch2DNetwork();
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
    seedAndLaunch2DNetwork({ withGroup: true });
    // Open the settings pane for all tests in this suite
    cy.get(selector.settingsBtn).click();
  });

  it('should update node size via the slider', () => {
    const initialSize = 20; // Default from common.service.ts
    const newSize = 75;

    // Assert the initial state in commonService
    cy.window().its('commonService.session.style.widgets.node-radius').should('equal', initialSize);

    // Change the slider value
    cy.get(selector.nodeRadiusSize).invoke('val', newSize).trigger('change');

    // Assert that the state has been updated in commonService
    cy.window().its('commonService.session.style.widgets.node-radius').should('equal', newSize);
  });

  it('should update link width via the slider', () => {
    const initialWidth = 3; // Default from common.service.ts
    const newWidth = 15;

    // Click the "Links" tab in the settings pane
    cy.get(selector.settingsPane).contains('Links').click();

    // Assert the initial state
    cy.window().its('commonService.session.style.widgets.link-width').should('equal', initialWidth);

    // Change the slider value
    cy.get(selector.linkWidthSize).invoke('val', newWidth).trigger('change');

    // Assert the state has been updated
    cy.window().its('commonService.session.style.widgets.link-width').should('equal', newWidth);
  });

  it('should create and remove grouping polygons', () => {
    // Click the "Grouping" tab
    cy.get(selector.settingsPane).contains('Grouping').click();

    // Initially, polygons should be off
    cy.window().its('commonService.session.style.widgets.polygons-show').should('be.false');

    // Turn on grouping by clicking the "Show" button
    cy.get(selector.showGroupsToggle).contains('Show').click();

    // Assert the state has been updated
    cy.window().its('commonService.session.style.widgets.polygons-show').should('be.true');

    // Turn off grouping by clicking the "Hide" button
    cy.get(selector.showGroupsToggle).contains('Hide').click();

    // Assert the state is reverted
    cy.window().its('commonService.session.style.widgets.polygons-show').should('be.false');
  });
});