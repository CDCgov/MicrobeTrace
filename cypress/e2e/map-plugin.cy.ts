/// <reference types="cypress" />

/**
 * Tests for the Phylogenetic Tree visualization component.
 */
describe('Map View', () => {
    // Selectors for key elements in the Phylogenetic Tree component
  const selectors = {
    mapContainer: '.mapStyle',
    //treeSvg: '#phylocanvas svg', // Target the SVG element directly
    settingsBtn: '#tool-btn-container-map a[title="Settings"]',
    //settingsPane: '#phylotree-settings-pane', // Used only to check for non-visibility
    //layoutDropdown: '#tree-layout',
    //leafLabelsToggle: '#leaf-label-visibility'
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

    // Open the "View" menu and click on "Map"
    cy.contains('button', 'View').click();
    cy.contains('button[mat-menu-item]', 'Map').click();

    // Wait for the map container to be visible, indicating the view has loaded
    cy.get(selectors.mapContainer, { timeout: 15000 }).should('be.visible');
  });

    /**
   * Test suite for toolbar and settings pane interactions.
   */
  context('Settings and Interactions (Default Dataset)', () => {
    beforeEach(() => {
      // Open the settings pane
      cy.get(selectors.settingsBtn).click();
      // Verify it's open by finding the title anywhere on the page. This is robust.
      cy.contains('.p-dialog-title', 'Geospatial Settings').should('be.visible');
      cy.wait(2000)

    //   cy.contains('.p-dialog-title', 'Geospatial Settings').parents('.p-dialog').contains('Components').click()
    //   cy.contains('.p-dialog-title', 'Geospatial Settings').parents('.p-dialog').contains('.p-accordionheader', 'Online').click();
    //   cy.get('#map-basemap-show-hide').contains('Hide').click();
      //cy.contains('#map-basemap-show-hide p-selectButton span', 'Hide').parent().click();

      // #map-field-zipcode
      //cy.contains('.p-dialog-title', 'Geospatial Settings').parents('.p-dialog').contains('Data').click()
      cy.get('#map-field-zipcode').click();
      cy.contains('li[role="option"]', 'Zipcode').click();
      cy.get('#tool-btn-container-map a[title="Center Screen"]').click();
      cy.wait(250);
    });

    // Zipcode selection renders nodes on map
    it('should confirm zip code variable and close the settings pane', () => {
      cy.window().its('commonService.session.style.widgets.map-field-zipcode').should('equal', 'Zip_code');
      cy.closeSettingsPane('Geospatial Settings');
    });
    
    // Map node colors should be mappable and remappable
    it('should update node color to red', () => {
      cy.closeSettingsPane('Geospatial Settings');
      cy.openGlobalSettings();

      cy.get('#node-color-variable').click()
      cy.get('li[role="option"]').contains('None').click()

      cy.wait(250);
      cy.get('#node-color').invoke('val', '#ff0000').trigger('input');

      cy.wait(300);
      cy.contains('#link-color-table-row p-selectButton span', 'Hide').parent().click();
      //cy.get(selectors.treeSvg).find('g.tidytree-node-leaf circle').first().should('have.css', 'fill', 'rgb(0, 255, 0)');
      cy.closeGlobalSettings();
      cy.wait(250);
      cy.screenshot('map/node-color-red', { overwrite: true});
    })

    it('should update color by to lineage and then change one of the colors', () => {
      cy.closeSettingsPane('Geospatial Settings');
      cy.openGlobalSettings();

      cy.get('#node-color-variable').click()
      cy.get('li[role="option"]').contains('Lineage').click()
      cy.wait(250);
      cy.closeGlobalSettings();

      cy.get('#node-color-table td input').first().invoke('val', '#777777').trigger('input').trigger('change');  // invoke('val', 24).trigger('input').trigger('change');
      cy.window().its('commonService.visuals.gisMap.layers.markerClusterGroup._featureGroup._layers').should(layers => {
        Object.values(layers).forEach((layer: any) => {
          if (layer.data && layer.data.ID === 'MZ375596') {
            expect(layer.options.fillColor).to.equal('#777777');
          }
        });
      });

      cy.get('.leaflet-control-zoom-out').click({force: true});
      cy.wait(1000);
      cy.screenshot('map/node-colorado-gray', { overwrite: true});
    })

    // Map link colors should be mappable and remappable
    it('should update link colors to red', () => {
      cy.closeSettingsPane('Geospatial Settings');
      cy.openGlobalSettings();

      cy.get('#link-tooltip-variable').click()
      cy.get('li[role="option"]').contains('None').click()

      cy.wait(250);
      cy.get('#link-color').invoke('val', '#ff0000').trigger('input');
      cy.wait(100);

      cy.closeGlobalSettings();
      cy.screenshot('map/links-color-red', { overwrite: true})
    })

    it('should update link colors variable to Cluster and then change one of the colors', () => {
      cy.closeSettingsPane('Geospatial Settings');
      cy.openGlobalSettings();

      cy.get('#link-tooltip-variable').click()
      cy.get('li[role="option"]').contains('Cluster').click()

      cy.wait(250);
      cy.get('#link-color-table td input').first().invoke('val', '#777777').trigger('input').trigger('change');
      cy.wait(100);
      
      cy.closeGlobalSettings();
      cy.screenshot('map/link-color-var-change-gray', { overwrite: true})
    })

    // Toggle Collapsing Nodes
    it('should toggle Collapsing Nodes', () => {
      // initial values
      cy.window().its('commonService.visuals.gisMap.SelectedNodeCollapsingTypeVariable').should('equal', 'On')
      cy.window().its('commonService.visuals.gisMap.layers.markerClusterGroup._featureGroup._layers').should(layers => {
        expect(Object.keys(layers)).to.have.length(6);
      });
      cy.window().its('commonService.visuals.gisMap.layers.featureGroup._layers').should(layers => {
        expect(Object.keys(layers)).to.have.length(0);
      });

      // switch tabs and uncollapse
      cy.contains('.p-dialog-title', 'Geospatial Settings').parents('.p-dialog').contains('Nodes').click()
      cy.get('#map-node-collapsing').contains('Off').click()
      cy.wait(100);
      cy.window().its('commonService.visuals.gisMap.SelectedNodeCollapsingTypeVariable').should('equal', 'Off')
      
      // recheck values
      cy.window().its('commonService.visuals.gisMap.layers.markerClusterGroup._featureGroup._layers').should(layers => {
        expect(Object.keys(layers)).to.have.length(0);
      });
      cy.window().its('commonService.visuals.gisMap.layers.featureGroup._layers').should(layers => {
        expect(Object.keys(layers)).to.have.length(29);
      });

      cy.closeSettingsPane('Geospatial Settings');
      // cy.get('#tool-btn-container-map a[title="Center Screen"]').click();
      cy.screenshot('map/node-not-collapsed', { overwrite: true});
      cy.wait(100)
      
      // Open the settings pane
      cy.get(selectors.settingsBtn).click();

      // Verify it's open by finding the title anywhere on the page. This is robust.
      cy.contains('.p-dialog-title', 'Geospatial Settings').should('be.visible');

      // cy.contains('.p-dialog-title', 'Geospatial Settings').parent()
      //   .trigger('mousedown', { button: 0, clientX: 100, clientY: 100})
      //   .trigger('mousemove', { button: 0, clientX: 25, clientY: 25})
      //   .trigger('mouseup', { force: true})

      // Collapse and check values
      cy.get('#map-node-collapsing').contains('On').click()
      cy.wait(100);
      cy.window().its('commonService.visuals.gisMap.SelectedNodeCollapsingTypeVariable').should('equal', 'On')
      cy.window().its('commonService.visuals.gisMap.layers.markerClusterGroup._featureGroup._layers').should(layers => {
        expect(Object.keys(layers)).to.have.length(6);
      });
      cy.window().its('commonService.visuals.gisMap.layers.featureGroup._layers').should(layers => {
        expect(Object.keys(layers)).to.have.length(0);
      });

      cy.closeSettingsPane('Geospatial Settings');
      cy.screenshot('map/node-collapsed', { overwrite: true});
    })
    
    // Map transparency should scale with slider bar
    it('should update transparency of nodes', () => {
      // switch tabs
      cy.contains('.p-dialog-title', 'Geospatial Settings').parents('.p-dialog').contains('Nodes').click()

      cy.get('#map-node-collapsing').contains('Off').click()
      cy.window().its('commonService.visuals.gisMap.SelectedNodeCollapsingTypeVariable').should('equal', 'Off')
      cy.wait(100);

      cy.window().its('commonService.session.style.widgets.map-node-transparency').should('equal', 0);
      cy.window().its('commonService.visuals.gisMap.layers.featureGroup._layers').should(layers => {
        Object.values(layers).forEach((layer: any) => {
          expect(layer.options.fillOpacity).to.equal(1)
        })
      });

      const updatedTransparency = 0.75;
      cy.get('#map-node-transparency').invoke('val', updatedTransparency).trigger('input').trigger('change');
      cy.window().its('commonService.session.style.widgets.map-node-transparency').should('equal', updatedTransparency);
      cy.window().its('commonService.visuals.gisMap.layers.featureGroup._layers').should(layers => {
        Object.values(layers).forEach((layer: any) => {
          expect(layer.options.fillOpacity).to.equal(1-updatedTransparency)
        })
      });
      cy.closeSettingsPane('Geospatial Settings');
      cy.screenshot('map/node-transparency', { overwrite: true});
    })

    it('should update transparency of links', () => {
      cy.contains('.p-dialog-title', 'Geospatial Settings').parents('.p-dialog').contains('Links').click()
      cy.window().its('commonService.session.style.widgets.map-link-transparency').should('equal', 0);

      cy.window().its('commonService.visuals.gisMap.layers.links._layers').should(layers => {
        Object.values(layers).forEach((layer: any) => {
          expect(layer.options.opacity).to.equal(1)
        })
      });

      const updatedTransparency = 0.75;
      cy.get('#map-link-transparency').invoke('val', updatedTransparency).trigger('input').trigger('change');
      cy.window().its('commonService.session.style.widgets.map-link-transparency').should('equal', updatedTransparency);
      cy.window().its('commonService.visuals.gisMap.layers.links._layers').should(layers => {
        Object.values(layers).forEach((layer: any) => {
          expect(layer.options.opacity).to.equal(1-updatedTransparency)
        })
      });

      cy.closeSettingsPane('Geospatial Settings');
      cy.screenshot('map/link-transparency', { overwrite: true});
    })

    // hide all nodes
    it('should hide all nodes', () => {
      // cy.contains('.p-dialog-title', 'Geospatial Settings').parents('.p-dialog').contains('Nodes').click()

      // cy.get('#map-node-collapsing').contains('Off').click()
      // cy.window().its('commonService.visuals.gisMap.SelectedNodeCollapsingTypeVariable').should('equal', 'Off')
      // cy.wait(100);

      cy.contains('.p-dialog-title', 'Geospatial Settings').parents('.p-dialog').contains('Components').click()
      cy.contains('.p-dialog-title', 'Geospatial Settings').parents('.p-dialog').contains('.p-accordionheader', 'Network').click();
      cy.get('#map-node-show-hide').contains('Hide').click();
      //cy.contains('#map-basemap-show-hide p-selectButton span', 'Hide').parent().click();
      cy.closeSettingsPane('Geospatial Settings');
      cy.wait(10);
      cy.screenshot('map/no-nodes', { overwrite: true});
    })

    // hide all links
    it('should hide all links', () => {
      cy.contains('.p-dialog-title', 'Geospatial Settings').parents('.p-dialog').contains('Components').click()
      cy.contains('.p-dialog-title', 'Geospatial Settings').parents('.p-dialog').contains('.p-accordionheader', 'Network').click();
      cy.get('#map-link-show-hide').contains('Hide').click();

      cy.closeSettingsPane('Geospatial Settings');
      cy.wait(10);
            cy.screenshot('map/no-links', { overwrite: true});
    })

    // jitter and re-jitter
    it('should jitter and re-jiter the nodes', () => {
      cy.contains('.p-dialog-title', 'Geospatial Settings').parents('.p-dialog').contains('Nodes').click()

      const updatedJitter = 1.6;
      cy.get('#map-node-jitter').invoke('val', updatedJitter).trigger('input').trigger('change');
      cy.window().its('commonService.session.style.widgets.map-node-jitter').should('equal', updatedJitter);

      let theta: number, j: number;
      cy.window().its('commonService.visuals.gisMap.layers.markerClusterGroup._featureGroup._layers').then(layers => {
        Object.values(layers).forEach((layer: any) => {
          if (layer.data && layer.data.ID === 'MZ375596') {
            theta = layer.data._theta;
            j = layer.data._j
          }
        });
      })

      cy.closeSettingsPane('Geospatial Settings');
      cy.wait(10);
      cy.screenshot('map/jitter', { overwrite: true});
      cy.wait(100);

      cy.get(selectors.settingsBtn).click();
      cy.get('#map-node-jitter-reroll').click();

      cy.window().its('commonService.visuals.gisMap.layers.markerClusterGroup._featureGroup._layers').should(layers => {
        Object.values(layers).forEach((layer: any) => {
          if (layer.data && layer.data.ID === 'MZ375596') {
            expect(layer.data._theta).to.not.equal(theta)
            expect(layer.data._j).to.not.equal(j);
          }
        });
      })

      cy.closeSettingsPane('Geospatial Settings');
      cy.wait(10);
      cy.screenshot('map/jitter-2', { overwrite: true});
    })


    // showing base layer, after time to download tile, should render higher resolution map
    it('should test offline maps', () => {
      cy.contains('.p-dialog-title', 'Geospatial Settings').parents('.p-dialog').contains('Components').click()
      cy.contains('.p-dialog-title', 'Geospatial Settings').parents('.p-dialog').contains('.p-accordionheader', 'Online').click();
      cy.get('#map-basemap-show-hide').contains('Hide').click();

      cy.window().its('commonService.session.style.widgets.map-satellite-show').should('equal', false);
      cy.window().its('commonService.session.style.widgets.map-basemap-show').should('equal', false);
      cy.window().its('commonService.session.style.widgets.map-countries-show').should('equal', true);
      cy.window().its('commonService.session.style.widgets.map-states-show').should('equal', true);      
      cy.window().its('commonService.session.style.widgets.map-counties-show').should('equal', false);

      cy.contains('.p-dialog-title', 'Geospatial Settings').parents('.p-dialog').contains('.p-accordionheader', 'Offline').click();
      cy.get('#map-counties-show-hide').contains('Show').click();
      cy.window().its('commonService.session.style.widgets.map-counties-show').should('equal', true);
      cy.closeSettingsPane('Geospatial Settings');
      cy.wait(1000)
      cy.screenshot('map/map-counties', { overwrite: true});
      cy.wait(100)

      cy.get(selectors.settingsBtn).click();
      cy.contains('.p-dialog-title', 'Geospatial Settings').should('be.visible');
      cy.get('#map-counties-show-hide').contains('Hide').click();
      cy.window().its('commonService.session.style.widgets.map-counties-show').should('equal', false);
      cy.closeSettingsPane('Geospatial Settings');
      cy.wait(200)
      cy.screenshot('map/map-states', { overwrite: true});
      cy.wait(100)

      cy.get(selectors.settingsBtn).click();
      cy.contains('.p-dialog-title', 'Geospatial Settings').should('be.visible');
      cy.get('#map-states-show-hide').contains('Show').click();
      cy.window().its('commonService.session.style.widgets.map-states-show').should('equal', false);
      cy.closeSettingsPane('Geospatial Settings');
      cy.wait(200)
      cy.screenshot('map/map-countries', { overwrite: true});
      cy.wait(100)
     })
    
    // showing satellite layer, after time to download time, should render higher resolution map
    it('should test satellite map', () => {

      cy.window().its('commonService.session.style.widgets.map-satellite-show').should('equal', false);
      cy.contains('.p-dialog-title', 'Geospatial Settings').parents('.p-dialog').contains('Components').click()
      cy.contains('.p-dialog-title', 'Geospatial Settings').parents('.p-dialog').contains('.p-accordionheader', 'Online').click(); //map-satellite-show-hide
      cy.get('#map-satellite-show-hide').contains('Show').click();
      cy.window().its('commonService.session.style.widgets.map-satellite-show').should('equal', true);
      cy.closeSettingsPane('Geospatial Settings');
      cy.wait(2000)
      cy.screenshot('map/map-sattellite', { overwrite: true});
     })
    
    // Clicking show/hide on Components tab of map view should show/hide lines on top of map,
    
    // zooming out or offscreen and pressing 're-center' button works
    
    // open map, select detailed or satellite basemap. Then close map and re-open. Confirm that map layer settings are maintained and that map renders accurately. 
    
    // clicking download button on 2d network view should allow saving of PNG and SVG files. 

    // Map transparency should scale with slider bar
    // it('should ', () => { })
  })

})

context('Settings and Interactions (Alternative [Lat/Long] Dataset)', () => {
  const nodeFile = 'AngularTesting_nodes_Map.csv';
  beforeEach(() => {
    cy.visit('/');
    cy.wait(2000); 

    // Upload the file from the overlay
    cy.attach_file('#fileDropRef', nodeFile);
    cy.get('#overlay').should('not.be.visible', { timeout: 10000 });

    // Assert the file row is visible
    cy.contains('#file-table .file-table-row', nodeFile).should('be.visible');
    cy.get('#launch').should('not.be.disabled');
    
    cy.get(`[id="file-${nodeFile}-field-1"]`).should('have.value', '_id');
    cy.get(`[id="file-${nodeFile}-field-2"]`).should('have.value', 'seq');

    cy.get('#launch').click()
    cy.get('#loading-information', { timeout: 10000 }).should('not.exist');

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
    cy.closeSettingsPane('Geospatial Settings');
    cy.get('#tool-btn-container-map a[title="Center Screen"]').click();
  })

  // Lat-Lon selection renders nodes on map
  it('should load data and center view on London', () => {
    cy.window().its('commonService.visuals.gisMap.SelectedNodeCollapsingTypeVariable').should('equal', 'On')
    cy.wait(500)
    cy.screenshot('map/map-latlong', { overwrite: true});
  })
})