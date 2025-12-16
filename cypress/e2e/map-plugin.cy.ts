/// <reference types="cypress" />

import * as L from 'leaflet';
const takeScreenshots: boolean = false;

/**
 * Tests for the Map visualization component.
 */
describe('Map View', () => {
    // Selectors for key elements in the Phylogenetic Tree component
  const selectors = {
    mapContainer: '.mapStyle',
    settingsBtn: '#tool-btn-container-map a[title="Settings"]',
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

      // wait for the session model to update
      cy.window().its('commonService.session.style.widgets.node-color', { timeout: 5000 })
        .should('equal', '#ff0000');

      // check collapsed markers (markerClusterGroup -> internal featureGroup layers)
      cy.window().its('commonService.visuals.gisMap.layers.markerClusterGroup._featureGroup._layers', { timeout: 5000 })
        .should(layers => {
          Object.values(layers).forEach((layer: any) => {
            if (layer._childCount > 0) {
              return;
            } else {
              expect(layer.options.fillColor).to.equal('#ff0000');
            }
          });
        });

      cy.contains('#link-color-table-row p-selectButton span', 'Hide').parent().click();
      cy.closeGlobalSettings();
      cy.wait(250);
      if (takeScreenshots) cy.screenshot('map/node-color-red', { overwrite: true});

      cy.get(selectors.settingsBtn).click();

      cy.contains('.p-dialog-title', 'Geospatial Settings').should('be.visible');
      cy.contains('.p-dialog-title', 'Geospatial Settings').parents('.p-dialog').contains('Nodes').click()
      cy.get('#map-node-collapsing').contains('Off').click()
      cy.wait(100);

      cy.window().its('commonService.visuals.gisMap.layers.featureGroup._layers', { timeout: 5000 })
        .should(layers => { Object.values(layers).forEach((layer: any) => {
          expect(layer.options.fillColor).to.equal('#ff0000');
        });
      });
    })

    it('should update node color by to lineage and then change one of the colors', () => {
      cy.closeSettingsPane('Geospatial Settings');
      cy.openGlobalSettings();

      cy.get('#node-color-variable').click()
      cy.get('li[role="option"]').contains('Lineage').click()
      cy.wait(250);
      cy.closeGlobalSettings();

      cy.get('#node-color-table td input').first().invoke('val', '#777777').trigger('input').trigger('change');
      cy.window().its('commonService.visuals.gisMap.layers.markerClusterGroup._featureGroup._layers').should(layers => {
        Object.values(layers).forEach((layer: any) => {
          if (layer.data && layer.data.ID === 'MZ375596') {
            expect(layer.options.fillColor).to.equal('#777777');
          }
        });
      });

      cy.get('.leaflet-control-zoom-out').click({force: true});
      cy.wait(1000);
      if (takeScreenshots) cy.screenshot('map/node-colorado-gray', { overwrite: true});
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
      if (takeScreenshots) cy.screenshot('map/links-color-red', { overwrite: true})

      cy.window().its('commonService.visuals.gisMap.layers.links._layers', { timeout: 5000 })
        .should(layers => { Object.values(layers).forEach((layer: any) => {
          expect(layer.options.color).to.equal('#ff0000');
        });
      });
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
      if (takeScreenshots) cy.screenshot('map/link-color-var-change-gray', { overwrite: true})

      cy.window().its('commonService.visuals.gisMap.layers.links._layers', { timeout: 5000 })
        .should(layers => { Object.values(layers).forEach((layer: any) => {
          if ( layer.data.cluster == 0) {
            expect(layer.options.color).to.equal('#777777');
          }          
        });
      });
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
      if (takeScreenshots) cy.screenshot('map/node-not-collapsed', { overwrite: true});
      cy.wait(100)
      
      // Open the settings pane
      cy.get(selectors.settingsBtn).click();

      // Verify it's open by finding the title anywhere on the page. This is robust.
      cy.contains('.p-dialog-title', 'Geospatial Settings').should('be.visible');

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
      if (takeScreenshots) cy.screenshot('map/node-collapsed', { overwrite: true});
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
      if (takeScreenshots) cy.screenshot('map/node-transparency', { overwrite: true});
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
      if (takeScreenshots) cy.screenshot('map/link-transparency', { overwrite: true});
    })

    // hide all nodes
    it('should hide all nodes', () => {
      cy.contains('.p-dialog-title', 'Geospatial Settings').parents('.p-dialog').contains('Components').click()
      cy.contains('.p-dialog-title', 'Geospatial Settings').parents('.p-dialog').contains('.p-accordionheader', 'Network').click();
      cy.get('#map-node-show-hide').contains('Hide').click();
      cy.closeSettingsPane('Geospatial Settings');
      cy.wait(10);
      if (takeScreenshots) cy.screenshot('map/no-nodes', { overwrite: true});

      cy.window().its('commonService.visuals.gisMap.layers.markerClusterGroup._featureGroup._layers').should(layers => {
        expect(layers).to.be.empty;
      })
    })

    // hide all links
    it('should hide all links', () => {
      cy.contains('.p-dialog-title', 'Geospatial Settings').parents('.p-dialog').contains('Components').click()
      cy.contains('.p-dialog-title', 'Geospatial Settings').parents('.p-dialog').contains('.p-accordionheader', 'Network').click();
      cy.get('#map-link-show-hide').contains('Hide').click();

      cy.closeSettingsPane('Geospatial Settings');
      cy.wait(10);
      if (takeScreenshots) cy.screenshot('map/no-links', { overwrite: true});

      cy.window().its('commonService.visuals.gisMap.lmap._layers').should(layers => {
        expect(Object.values(layers).length).to.equal(248);
      })
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
      if (takeScreenshots) cy.screenshot('map/jitter', { overwrite: true});
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
      if (takeScreenshots) cy.screenshot('map/jitter-2', { overwrite: true});
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
      if (takeScreenshots) cy.screenshot('map/map-counties', { overwrite: true});
      cy.wait(100)
      cy.window().its('commonService.visuals.gisMap').then(mapView => {
        expect(mapView.lmap.hasLayer(mapView.layers.counties)).to.equal(true)
      });

      cy.get(selectors.settingsBtn).click();
      cy.contains('.p-dialog-title', 'Geospatial Settings').should('be.visible');
      cy.get('#map-counties-show-hide').contains('Hide').click();
      cy.window().its('commonService.session.style.widgets.map-counties-show').should('equal', false);
      cy.closeSettingsPane('Geospatial Settings');
      cy.wait(200)
      if (takeScreenshots) cy.screenshot('map/map-states', { overwrite: true});
      cy.wait(100)
      cy.window().its('commonService.visuals.gisMap').then(mapView => {
        expect(mapView.lmap.hasLayer(mapView.layers.counties)).to.equal(false)
        expect(mapView.lmap.hasLayer(mapView.layers.states)).to.equal(true)
      });

      cy.get(selectors.settingsBtn).click();
      cy.contains('.p-dialog-title', 'Geospatial Settings').should('be.visible');
      cy.get('#map-states-show-hide').contains('Show').click();
      cy.window().its('commonService.session.style.widgets.map-states-show').should('equal', false);
      cy.closeSettingsPane('Geospatial Settings');
      cy.wait(200)
      if (takeScreenshots) cy.screenshot('map/map-countries', { overwrite: true});
      cy.wait(100)
      cy.window().its('commonService.visuals.gisMap').then(mapView => {
        expect(mapView.lmap.hasLayer(mapView.layers.states)).to.equal(false)
        expect(mapView.lmap.hasLayer(mapView.layers.countries)).to.equal(true)
      });
    })

    // showing basemap layer, after time to download time
    it('should test base map', () => {
      cy.window().its('commonService.session.style.widgets.map-basemap-show').should('equal', false);
      cy.contains('.p-dialog-title', 'Geospatial Settings').parents('.p-dialog').contains('Components').click()
      cy.contains('.p-dialog-title', 'Geospatial Settings').parents('.p-dialog').contains('.p-accordionheader', 'Online').click(); //map-satellite-show-hide
      cy.get('#map-basemap-show-hide').contains('Show').click();
      cy.window().its('commonService.session.style.widgets.map-basemap-show').should('equal', true);
      cy.closeSettingsPane('Geospatial Settings');
      cy.wait(2000)
      if (takeScreenshots) cy.screenshot('map/map-basemap', { overwrite: true});
      cy.wait(100)
      cy.window().its('commonService.visuals.gisMap').then(mapView => {
        expect(mapView.lmap.hasLayer(mapView.layers.basemap)).to.equal(true)
      });
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
      if (takeScreenshots) cy.screenshot('map/map-sattellite', { overwrite: true});
      cy.wait(100)
      cy.window().its('commonService.visuals.gisMap').then(mapView => {
       expect(mapView.lmap.hasLayer(mapView.layers.satellite)).to.equal(true)
     });
    })
    
    // make a test for dragging around the map and tests coordinates (lmap._lastCenter is current coordinates)
    it('tests panning and centering the map', () => {
      cy.closeSettingsPane('Geospatial Settings');
      cy.get('#centerMapButton').click({ force: true });

      let initialCenter : {lat: number, lng: number};
      let newCenter : {lat: number, lng: number};

      cy.window().then((win: any) => {
        const lmap = win.commonService.visuals.gisMap.lmap;
        const c = lmap.getCenter();
        initialCenter = { lat: c.lat, lng: c.lng };
        const container = lmap.getContainer() as HTMLElement;
        const start = { clientX: 100, clientY: 400 };
        const end = { clientX: -100, clientY: 600 };

        const md1 = new MouseEvent('mousedown', Object.assign({
          bubbles: true, cancelable: true, composed: true,
          pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0
        }, start))
        container.dispatchEvent(md1);

        const mm1 = new MouseEvent('mousemove', Object.assign({
          bubbles: true, cancelable: true, composed: true,
          pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0
        }, end))
        container.dispatchEvent(mm1);

        const me1 = new MouseEvent('mouseend', Object.assign({
          bubbles: true, cancelable: true, composed: true,
          pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0
        }, end))
        container.dispatchEvent(me1);

        newCenter = lmap.getCenter();
        const latDiff = Math.abs(newCenter.lat - initialCenter.lat);
        const lngDiff = Math.abs(newCenter.lng - initialCenter.lng);
        expect(latDiff > 1 && lngDiff > 1).to.equal(true);
      });

      cy.wait(500);
      
      cy.get('#centerMapButton').click({ force: true });
      cy.wait(500);

      cy.window().then((win: any) => {
        const lmap = win.commonService.visuals.gisMap.lmap;
        const c = lmap.getCenter();
        newCenter = { lat: c.lat, lng: c.lng };
        const latDiff = Math.abs(newCenter.lat - initialCenter.lat);
        const lngDiff = Math.abs(newCenter.lng - initialCenter.lng);
        expect(latDiff < 0.05 && lngDiff < 0.05).to.equal(true);
      })
    });

    it('tests zoom changes from zoom in, zoom out, and center map buttons', () => {
      cy.closeSettingsPane('Geospatial Settings');
      cy.get('#centerMapButton').click({ force: true });
      cy.wait(1000)
      cy.window().then((win: any) => {
        const lmap = win.commonService.visuals.gisMap.lmap;
        let zoomLevel = lmap.getZoom();
        expect(zoomLevel).to.equal(5);
      })

      let zoomInButton = cy.get('.leaflet-control-zoom-in span');
      zoomInButton.click()
      cy.wait(250)
      zoomInButton.click()
      cy.wait(250);
      zoomInButton.click()
      cy.wait(500)

      cy.window().then((win: any) => {
        const lmap = win.commonService.visuals.gisMap.lmap;
        let zoomLevel = lmap.getZoom();
        expect(zoomLevel).to.equal(8);
      })

      let zoomOutButton = cy.get('.leaflet-control-zoom-out span');
      zoomOutButton.click()
      cy.wait(250)
      zoomOutButton.click()
      cy.wait(250);
      zoomOutButton.click()
      cy.wait(250);
      zoomOutButton.click()
      cy.wait(250);
      zoomOutButton.click()
      cy.wait(500)

      cy.window().then((win: any) => {
        const lmap = win.commonService.visuals.gisMap.lmap;
        let zoomLevel = lmap.getZoom();
        expect(zoomLevel).to.equal(3);
      })

      cy.get('#centerMapButton').click({ force: true });
      cy.wait(1000)
      cy.window().then((win: any) => {
        const lmap = win.commonService.visuals.gisMap.lmap;
        let zoomLevel = lmap.getZoom();
        expect(zoomLevel).to.equal(5);
      })
    });

    it('test node tooltip', ()=> {
      cy.contains('.p-dialog-title', 'Geospatial Settings').parents('.p-dialog').contains('Nodes').click()
      cy.get('#map-node-tooltip-variable').click()
      cy.contains('li[role="option"]', 'Id').click();
      cy.wait(200)

      cy.closeSettingsPane('Geospatial Settings');
      cy.contains('.p-dialog-header', 'Link Color Table')
        .parents('.p-dialog')
        .find('button.p-dialog-close-button')
        .click();

      let NC_node: any;
      cy.window().then((win: any) => {
        const layers = win.commonService.visuals.gisMap.layers.markerClusterGroup._featureGroup._layers;
        NC_node = Object.values(layers).find((node: any) => node.data && node.data._id == "MZ591568")
        expect(NC_node).to.not.be.null;
        
        const lmap = win.commonService.visuals.gisMap.lmap;
        const container = lmap.getContainer() as HTMLElement;
        const rect = container.getBoundingClientRect();

        const point = NC_node._point;
        const clientX = Math.round(rect.left + point.x)
        const clientY = Math.round(rect.top + point.y)
        const eventInit: any = { bubbles: true, cancelable: true, composed: true,
          button: 0, x: clientX, y: clientY,  pageX: clientX, pageY: clientY
        };
        const fakeOriginalEvent = new MouseEvent('mouseover', eventInit);

        const containerPoint =  L.point(point.x, point.y);
        const latlng = lmap.containerPointToLatLng(containerPoint);
          
        NC_node.fire('mouseover', {latlng, layer: NC_node, containerPoint, originalEvent: fakeOriginalEvent});
        cy.wait(200);
        cy.get('#mapTooltip', { timeout: 2000 }).should('be.visible').and('contain', 'MZ591568');

        cy.wait(2000).then(() => {
          NC_node.fire('mouseout');
          cy.get('#mapTooltip', { timeout: 2000 }).should('not.be.visible');
        });
      })
    })

    it('test link tooltip', ()=> {
      cy.contains('.p-dialog-title', 'Geospatial Settings').parents('.p-dialog').contains('Links').click()
      cy.get('#map-link-tooltip-variable').click()
      cy.contains('li[role="option"]', 'Contact type').click();
      cy.wait(200)

      cy.closeSettingsPane('Geospatial Settings');
      cy.contains('.p-dialog-header', 'Link Color Table')
        .parents('.p-dialog')
        .find('button.p-dialog-close-button')
        .click();

      let test_link: any;
      cy.window().then((win: any) => {
        const layers = win.commonService.visuals.gisMap.layers.links._layers;
        test_link = Object.values(layers).find((node: any) => node.data && node.data.target == "MZ591568")
        expect(test_link).to.not.be.null;
        
        const lmap = win.commonService.visuals.gisMap.lmap;
        const container = lmap.getContainer() as HTMLElement;
        const rect = container.getBoundingClientRect();

        const midpoint = {x: (test_link._rawPxBounds.min.x + test_link._rawPxBounds.max.x)/2, y: (test_link._rawPxBounds.min.y + test_link._rawPxBounds.max.y)/2 }
        const clientX = rect.left + midpoint.x
        const clientY = rect.top + midpoint.y
        const eventInit: any = { bubbles: true, cancelable: true, composed: true,
          button: 0, x: clientX, y: clientY,  pageX: clientX, pageY: clientY
        };
        const fakeOriginalEvent = new MouseEvent('mouseover', eventInit);

        const containerPoint =  L.point(midpoint.x, midpoint.y);
        const latlng = lmap.containerPointToLatLng(containerPoint);
          
        test_link.fire('mouseover', {latlng, layer: test_link, containerPoint, originalEvent: fakeOriginalEvent});
        cy.wait(200);
        cy.get('#mapTooltip', { timeout: 2000 }).should('be.visible').and('contain', 'sports team');

        cy.wait(2000).then(() => {
          test_link.fire('mouseout');
          cy.get('#mapTooltip', { timeout: 2000 }).should('not.be.visible');
        });
      })
    })

    it('should download map view as a png', () => {
      cy.closeSettingsPane('Geospatial Settings');
      cy.get('#tool-btn-container-map a[title="Export Screen"]').click(); // #tool-btn-container-map a[title="Export Screen"]'
      cy.contains('.p-dialog-title', 'Export Geospatial Data').should('be.visible');

      cy.get('#map-export-filename').invoke('val', 'cypress_map').trigger('input').trigger('change');
      cy.get('#map-export').click();

      cy.wait(7000);
      cy.readFile('cypress/downloads/cypress_map.png').should('exist')
    })
    
    // open map, select detailed or satellite basemap. Then close map and re-open. Confirm that map layer settings are maintained and that map renders accurately.
    it('Should maintain selected map type (satellite) after opening and closing map view', () => {
      cy.window().its('commonService.session.style.widgets.map-satellite-show').should('equal', false);
      cy.contains('.p-dialog-title', 'Geospatial Settings').parents('.p-dialog').contains('Components').click()
      cy.contains('.p-dialog-title', 'Geospatial Settings').parents('.p-dialog').contains('.p-accordionheader', 'Online').click();
      cy.get('#map-satellite-show-hide').contains('Show').click();
      cy.window().its('commonService.session.style.widgets.map-satellite-show').should('equal', true);
      cy.closeSettingsPane('Geospatial Settings');
      cy.wait(2000)
      cy.window().its('commonService.visuals.gisMap').then(mapView => {
        expect(mapView.lmap.hasLayer(mapView.layers.satellite)).to.equal(true)
      });

      cy.get('.lm_tab[title="Map"]>.lm_close_tab').click();
      cy.wait(500)
      cy.get(selectors.mapContainer, { timeout: 15000 }).should('not.exist');

      // Open the "View" menu and click on "Map"
      cy.contains('button', 'View').click();
      cy.contains('button[mat-menu-item]', 'Map').click();

      // Wait for the map container to be visible, indicating the view has loaded
      cy.get(selectors.mapContainer, { timeout: 15000 }).should('be.visible');
      cy.wait(2000);
      cy.window().its('commonService.visuals.gisMap').then(mapView => {
        expect(mapView.lmap.hasLayer(mapView.layers.satellite)).to.equal(true)
      });
    })
  })
})

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
  })
})