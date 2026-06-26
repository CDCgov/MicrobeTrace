/// <reference types="cypress" />

import * as L from 'leaflet';
const takeScreenshots: boolean = false;

// implement a journey for this; the rest of the tests have been moved to view-state
context('Settings and Interactions (Alternative [Lat/Long] Dataset)', () => {
  const nodeFile = 'AngularTesting_nodes_Map.csv';
  beforeEach(() => {
    cy.visit('/');
    cy.wait(2000); 

    // Upload the file from the overlay
    cy.loadFiles([{name: nodeFile, datatype: 'node', field1: '_id', field2: 'seq'}])

    cy.get('#launch').click()
    cy.get('#loading-information', { timeout: 20000 }).should('not.exist');

    // Open the "View" menu and click on "Map"
    cy.contains('button', 'View').click();
    cy.contains('button[mat-menu-item]', 'Map').click();

    // Wait for the map container to be visible, indicating the view has loaded
    cy.get('.mapStyle', { timeout: 15000 }).should('be.visible');

    // Open the settings pane
    cy.get('#tool-btn-container-map a[title="Settings"]').click();

    // Verify it's open by finding the title anywhere on the page. This is robust.
    cy.contains('.p-dialog-title', 'Geospatial Settings').should('be.visible');

    cy.get('#map-field-lat').click();
    cy.contains('li[role="option"]', 'Lat').click();

    cy.get('#map-field-lon').click();
    cy.contains('li[role="option"]', 'Long').click();

    cy.contains('.p-dialog-title', 'Geospatial Settings').parents('.p-dialog').contains('Nodes').click()
    cy.get('#map-node-collapsing').contains('Off').click()

    cy.closeSettingsPane('Geospatial Settings');
    cy.get('#tool-btn-container-map a[title="Center Screen"]').click();
  })

  // Lat-Lon selection renders nodes on map
  it('should load data and center view on London', () => {
    cy.window().its('commonService.visuals.gisMap.SelectedNodeCollapsingTypeVariable').should('equal', 'Off')
    cy.wait(2000)
    
    if (takeScreenshots) cy.screenshot('map/map-latlong', { overwrite: true});
    
    cy.window().its('commonService.visuals.gisMap.layers.featureGroup._layers').then(layers => {
      Object.values(layers).forEach((layer: any) => {
        if (layer.data) {
          expect(String(layer._latlng.lat)).to.equal(String(layer.data.lat))
          expect(String(layer._latlng.lng)).to.equal(String(layer.data.long));
        }
      });
    })

    cy.get('#tool-btn-container-map a[title="Nodes without Location Data"]')
      .should('have.text', '0')
      .should('have.css', 'color', 'rgb(0, 93, 170)')
      .click();

    cy.contains('.p-dialog-title', 'Excluded Nodes')
      .should('be.visible')
      .closest('p-dialog').within(() => {cy.get('span').eq(2).should('have.text', 'All nodes contain location data.')})
  })
})