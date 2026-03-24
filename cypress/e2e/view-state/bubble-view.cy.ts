let takeScreenshots = false;
const getCy = () => cy.window().then(win => win.commonService.visuals.bubble.cy)

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

  context('Bubble Settings and Interactions', () => {
    it('renders bubble view canvas and then closes the bubble settings dialog', () => {
      cy.get(selectors.container).should('exist');
      cy.closeSettingsPane('Bubble Settings')
    });

    it('updates X to Lineage and Y to Cluster and refreshes the bubble layout', () => {
      updateVariable('X', 'Lineage')
      updateVariable('Y', 'Cluster')
      cy.closeSettingsPane('Bubble Settings');

      cy.window().then((win: any) => {
        const bubble = win.commonService.visuals.bubble;
        let nodes = bubble.cy.nodes();
        expect(nodes.filter(n => n.hasClass('X_axis')).length).to.be.eq(8)
        expect(nodes.filter(n => n.hasClass('Y_axis')).length).to.be.eq(4)
        const dataNodes = bubble.cy.nodes().filter((n) => !n.hasClass('X_axis') && !n.hasClass('Y_axis'));
        expect(dataNodes.length).to.be.eq(33);
        const cl1_b621 = dataNodes.filter((n) => n.position().x > 300 && n.position().x < 500 && n.position().y > 100 && n.position().y < 300)
        expect(cl1_b621.length).to.be.eq(4)
      });
    });

    it('toggles collapse on and off and tests the tooltip', () => {
      updateVariable('X', 'Cluster')

      updateCollapsed(true, false)
      cy.window().then((win: any) => {
        const bubble = win.commonService.visuals.bubble;
        expect(bubble.SelectedNodeCollapsingTypeVariable).to.be.true;
        const dataNodes = bubble.cy.nodes().filter((n) => !n.hasClass('X_axis') && !n.hasClass('Y_axis'));
        const maxTotal = Math.max(...dataNodes.map((n) => n.data('totalCount') || 1));
        expect(maxTotal).to.be.greaterThan(1);

        const node = dataNodes[0]
        const pos = node.renderedPosition();

        node.emit('mouseover', pos)
        cy.get('#bubbleTooltip', { timeout: 1000 }).should('be.visible').then(() => {
          node.emit('mouseout');
          cy.get('#bubbleTooltip', { timeout: 1000 }).should('not.be.visible');
        });
      });

      updateCollapsed(false, false)
      cy.window().then((win: any) => {
        const bubble = win.commonService.visuals.bubble;
        expect(bubble.SelectedNodeCollapsingTypeVariable).to.be.false;
        const dataNodes = bubble.cy.nodes().filter((n) => !n.hasClass('X_axis') && !n.hasClass('Y_axis'));
        expect(dataNodes.length).to.eq(bubble.allData.length);
        dataNodes.forEach((n) => expect(n.data('totalCount') || 1).to.eq(1));

        const node = dataNodes[0]
        const pos = node.renderedPosition();

        node.emit('mouseover', pos)
        cy.get('#bubbleTooltip', { timeout: 1000 }).should('be.visible', {timeout: 500}).and('have.text', 'MZ375596').then(() => {
          node.emit('mouseout');
          cy.get('#bubbleTooltip', { timeout: 1000 }).should('not.be.visible');
        });
      });
    });

    it('updates node size and spacing with individual nodes (collapse == false)', () => {
      updateVariable('X', 'Cluster')

      cy.window().its('commonService.visuals.bubble.nodeSize').should('equal', 15);
      cy.get('div[title="How big should the nodes be?"').find('input.custom-range').invoke('val', 25).trigger('input').trigger('change');

      cy.window().then((win: any) => {
        const bubble = win.commonService.visuals.bubble;
        expect(bubble.nodeSize).to.be.eq(25)

        let nodes = bubble.cy.nodes();
        nodes.filter((n) => !n.hasClass('X_axis') && !n.hasClass('Y_axis')).forEach(node => { 
          expect(node.data('nodeSize')).to.eq(25)
        });
      });
    })

    it('updates node size and spacing with nodes collaped', () => {
      updateVariable('X', 'Cluster')

      cy.contains('.p-selectbutton .p-togglebutton-label', 'On').click();
      cy.window().then((win: any) => {
        const bubble = win.commonService.visuals.bubble;
        expect(bubble.SelectedNodeCollapsingTypeVariable).to.be.true;
      })
      let newSize = 25;

      cy.window().its('commonService.visuals.bubble.nodeSize').should('equal', 15);
      cy.get('div[title="How big should the nodes be?"').find('input.custom-range').invoke('val', newSize).trigger('input').trigger('change');

      cy.window().then((win: any) => {
        const bubble = win.commonService.visuals.bubble;
        expect(bubble.nodeSize).to.be.eq(newSize)

        let nodes = bubble.cy.nodes();
        nodes.filter((n) => !n.hasClass('X_axis') && !n.hasClass('Y_axis')).forEach(node => { 
          let expectedSize = newSize * Math.sqrt(node.data('totalCount'))
          expect(node.data('nodeSize')).to.eq(expectedSize)
        });
      });

    })

    it('updates label size', () => {
      updateVariable('X', 'Cluster')
      updateVariable('Y', 'Lineage')
      updateLabelSize(32, false)
      cy.closeSettingsPane('Bubble Settings')
    })

    it('updates X variable to CollectionDate and set it as a date variable', () => {
      updateVariable('X', 'CollectionDate', true)
      getCy().then(cytoscapeInstance => {
        const testNode1 = cytoscapeInstance.nodes('[id = "MZ787305"]')[0]
        let { x: x1, y: y1 } = testNode1.position()
        expect(x1).to.be.closeTo(0, 0.001);
        expect(y1).to.be.closeTo(0, 0.001)

        const testNode2 = cytoscapeInstance.nodes('[id = "MZ591568"]')[0]
        let { x: x2, y: y2 } = testNode2.position()
        expect(x2).to.be.closeTo(14, 0.001);
        expect(y2).to.be.closeTo(0, 0.001)

        const axisNode1 = cytoscapeInstance.nodes('.X_axis')[0]
        let { x: x3, y: y3 } = axisNode1.position()
        expect(x3).to.be.closeTo(0, 0.001);
        expect(y3).to.be.closeTo(150, 0.001)
        expect(axisNode1.data().label).to.be.eq('07/01/2021')
      })
    })
  })

  context('Global Settings updating Bubble', () => {
    it('should update node color to red', () => {
      cy.closeSettingsPane('Bubble Settings')
      cy.openGlobalSettings();
      cy.get('#node-color-variable').click()
      cy.get('li[role="option"]').contains('None').click()

      cy.wait(250);
      cy.get('#node-color').invoke('val', '#ff0000').trigger('input');

      cy.window().its('commonService.session.style.widgets.node-color', { timeout: 5000 }).should('equal', '#ff0000');
      cy.closeGlobalSettings();

      getCy().then(cytoscapeInstance => {
        const realNodes = cytoscapeInstance.nodes()
          .filter(n => !n.hasClass('X_axis') && !n.hasClass('Y_axis'));
        realNodes.forEach(node => {
          const color = node.style('background-color');
          expect(color).to.match(/rgb\(255,\s*0,\s*0\)/);
        })
      })

      if (takeScreenshots) cy.screenshot('bubble/node-color-red', { overwrite: true}); 
    })

    it('should update node color by to lineage and then change one of the colors', () => {
      cy.closeSettingsPane('Bubble Settings')
      cy.openGlobalSettings();
      cy.get('#node-color-variable').click()
      cy.get('li[role="option"]').contains('Lineage').click()
      cy.wait(250);
      cy.closeGlobalSettings();

      cy.get('#node-color-table td input').first().invoke('val', '#777777').trigger('input').trigger('change');
      getCy().then(cytoscapeInstance => {
        const testNode = cytoscapeInstance.nodes('[id = "MZ375596"]')
        const color = testNode.style('background-color');
        expect(color).to.match(/rgb\(119,\s*119,\s*119\)/);
      })

      if (takeScreenshots) cy.screenshot('map/node-colorado-gray', { overwrite: true});
    })

    it('should update link threhold to split/merge clusters, node positions and color should be updated', () => {
      updateVariable('X', 'Cluster')
      updateVariable('Y', 'Cluster')
      cy.closeSettingsPane('Bubble Settings')
      
      cy.openGlobalSettings();
      cy.get('#node-color-variable').click()
      cy.get('li[role="option"]').contains('Cluster').click()
      cy.contains('#global-settings-modal .nav-link', 'Filtering').click();
      for (let i = 0; i < 6; i++) {
        cy.get('#link-threshold').type('{uparrow}');
      }
      cy.wait(2000);
      cy.window().then((win: any) => {
        expect(win.commonService.session.style.widgets["link-threshold"]).to.eq(22)         
      })
      getCy().then(cytoscapeInstance => {
        const testNode1 = cytoscapeInstance.nodes('[id = "MZ740979"]')[0]
        let { x: x1, y: y1 } = testNode1.position()
        expect(x1).to.be.closeTo(228, 0.001)
        expect(y1).to.be.closeTo(200, 0.001)
        const color1 = testNode1.style('background-color');
        expect(color1).to.match(/rgb\(242,\s*32,\s*32\)/);

        const testNode2 = cytoscapeInstance.nodes('[id = "MZ787305"]')[0]
        let { x: x2, y: y2 } = testNode2.position()
        expect(x2).to.be.closeTo(224.248, 0.001);
        expect(y2).to.be.closeTo(214, 0.001)
        const color2 = testNode2.style('background-color');
        expect(color2).to.match(/rgb\(242,\s*32,\s*32\)/);
      })

      for (let i = 0; i < 8; i++) {
        cy.get('#link-threshold').type('{downarrow}');
      }
      cy.wait(2000)
      cy.window().then((win: any) => {
        expect(win.commonService.session.style.widgets["link-threshold"]).to.eq(14)
      })

      getCy().then(cytoscapeInstance => {
        const testNode1 = cytoscapeInstance.nodes('[id = "MZ740979"]')[0]
        let { x: x1, y: y1 } = testNode1.position()
        expect(x1).to.be.closeTo(600, 0.001)
        expect(y1).to.be.closeTo(600, 0.001)
        const color1 = testNode1.style('background-color');
        expect(color1).to.match(/rgb\(244,\s*122,\s*34\)/);

        const testNode2 = cytoscapeInstance.nodes('[id = "MZ787305"]')[0]
        let { x: x2, y: y2 } = testNode2.position()
        expect(x2).to.be.closeTo(614, 0.001)
        expect(y2).to.be.closeTo(600, 0.001)
        const color2 = testNode2.style('background-color');
        expect(color2).to.match(/rgb\(244,\s*122,\s*34\)/);
      })
    })

    it('should update link threhold to split/merge clusters (collapsed nodes), node fill def and size should be updated', () => {
      cy.contains('.p-selectbutton .p-togglebutton-label', 'On').click();
      cy.closeSettingsPane('Bubble Settings')
      
      cy.openGlobalSettings();
      cy.get('#node-color-variable').click()
      cy.get('li[role="option"]').contains('Cluster').click()
      cy.wait(500)
      let initialDef;
      let initialBGImage;
      cy.window().then((win: any) => {
        initialDef = win.commonService.visuals.bubble.svgDefs['node0']
        initialBGImage = win.commonService.visuals.bubble.cy.nodes()[0].style()['background-image']
      })

      cy.contains('#global-settings-modal .nav-link', 'Filtering').click();
      for (let i = 0; i < 6; i++) {
        cy.get('#link-threshold').type('{uparrow}');
      }
      cy.wait(2000);
      cy.closeGlobalSettings()
      cy.window().then((win: any) => {
        expect(win.commonService.session.style.widgets["link-threshold"]).to.eq(22)  
        const updatedDef = win.commonService.visuals.bubble.svgDefs['node0']
        expect(updatedDef).to.not.eq(initialDef)
      })
      let size1: number = -2;
      getCy().then(cytoscapeInstance => {
        const updatedBGImage = cytoscapeInstance.nodes()[0].style()['background-image']
        expect(updatedBGImage).to.not.eq(initialBGImage)

        cy.get(selectors.settingsBtn).click();
        updateVariable('X', 'Cluster')
        cy.wait(500).then(() => size1 = parseFloat(cytoscapeInstance.nodes()[1].style().height))
      })

      cy.closeSettingsPane('Bubble Settings')
      cy.openGlobalSettings()
      cy.contains('#global-settings-modal .nav-link', 'Filtering').click();
      cy.get('#link-threshold').type('{downarrow}');
      cy.closeGlobalSettings()
      let size2: number = -1;
      cy.wait(2000).then(getCy).then(cyInstance => size2 = parseFloat( cyInstance.nodes()[1].style().height))
      
      cy.wait(100).then(() => expect(size1).to.be.greaterThan(size2))
    })

    it('should ensure that bubble view responds to node-selected events', () => {
      cy.closeSettingsPane('Bubble Settings')
      // single select
      const nodeId = 'MZ415508';
      cy.window().then((win: any) => {
        const sessionNode = win.commonService.session.data.nodes.find((n: any) => n._id === nodeId)
        expect(sessionNode, 'session node exists').to.exist;
        sessionNode.selected = true
      })
      cy.document().trigger('node-selected');
      
      cy.window().then((win: any) => {
        const bubble = win.commonService.visuals.bubble;
        const dataNode = bubble.cy.nodes(`[id = '${nodeId}']`)[0];       
        
        const borderColor = dataNode.style('border-color');
        expect(borderColor).to.match(/rgb\(255,\s*131,\s*0\)/);
        expect(dataNode.selected()).to.be.true;
      })

      // single unselect
      cy.window().then((win: any) => {
        const sessionNode = win.commonService.session.data.nodes.find((n: any) => n._id === nodeId)
        sessionNode.selected = false;
      })
      cy.document().trigger('node-selected');

      cy.window().then((win: any) => {
        const bubble = win.commonService.visuals.bubble;
        const dataNode = bubble.cy.nodes(`[id = '${nodeId}']`)[0];       
        
        const borderColor = dataNode.style('border-color');
        expect(borderColor).to.match(/rgb\(0,\s*0,\s*0\)/);
        expect(dataNode.selected()).to.be.false;
      })

      //multi select
      let selector;
      cy.window().then((win: any) => {
        const sessionNodes = win.commonService.session.data.nodes.filter(n => n.cluster === 1)
        selector = sessionNodes.map(node => `[id = "${node.id}"]`).join(', ')
        sessionNodes.forEach(node => node.selected = true)
      })
      cy.document().trigger('node-selected');
      cy.window().then((win: any) => {
        const bubble = win.commonService.visuals.bubble;
        const dataNodes = bubble.cy.nodes(selector);   
        dataNodes.forEach(dataNode => {
          const borderColor = dataNode.style('border-color');
          expect(borderColor).to.match(/rgb\(255,\s*131,\s*0\)/);
          expect(dataNode.selected()).to.be.true;
        })    
      })

      // multi unselect
      cy.window().then((win: any) => {
        const sessionNodes = win.commonService.session.data.nodes.filter(n => n.cluster === 1)
        sessionNodes.forEach(node => node.selected = false)
      })
      cy.document().trigger('node-selected');
      cy.window().then((win: any) => {
        const bubble = win.commonService.visuals.bubble;
        const dataNodes = bubble.cy.nodes(selector);   
        dataNodes.forEach(dataNode => {
          const borderColor = dataNode.style('border-color');
          expect(borderColor).to.match(/rgb\(0,\s*0,\s*0\)/);
          expect(dataNode.selected()).to.be.false;
        })    
      })

    })

    it('should select a node in bubble and be reflected in 2D View', () => {
      cy.closeSettingsPane('Bubble Settings')

      cy.window().then((win: any) => {
        cy.spy(win.$.fn, 'trigger').as('jqTrigger')
      });

      const nodeId = 'MZ415508';
      cy.window().then((win: any) => {
        const bubble = win.commonService.visuals.bubble;
        const dataNode = bubble.cy.nodes(`[id = '${nodeId}']`)[0];

        dataNode.emit('select');
        cy.get('@jqTrigger').should((spy: any) => {
          // Ensure at least one call matches 'node-selected'
          const calledForNodeSelected = spy.getCalls().some(call => call.args[0] === 'node-selected');
          expect(calledForNodeSelected, 'trigger called with node-selected').to.be.true;
        });
        
        const borderColor = dataNode.style('border-color');
        expect(borderColor).to.match(/rgb\(255,\s*131,\s*0\)/);

        const sessionNode = win.commonService.session.data.nodes.find((n: any) => n._id === nodeId);
        expect(dataNode.selected()).to.be.true;
        expect(sessionNode.selected).to.be.true;
      })

      // check that 2D instance of cytoscape is updated
      cy.window().then((win: any) => {
        const cytoscapeInstance = win.cytoscapeInstance;
        const dataNode = cytoscapeInstance.nodes(`[id = '${nodeId}']`)[0];
        expect(dataNode.selected()).to.be.true;

        const borderColor = dataNode.style('border-color');
        expect(borderColor).to.match(/rgb\(255,\s*131,\s*0\)/);
      })
    })

    it('should select multiple nodes in bubble and be reflected in 2D View', () => {
      cy.closeSettingsPane('Bubble Settings')

      cy.window().then((win: any) => {
        cy.spy(win.$.fn, 'trigger').as('jqTrigger')
      });

      const nodeIds = ['MZ415508', 'P3', 'MZ591568'];
      let selector = nodeIds.map(id => `[id = "${id}"]`).join(', ')
      cy.window().then((win: any) => {
        const bubble = win.commonService.visuals.bubble;
        const dataNodes = bubble.cy.nodes(selector);

        for (let i = 0; i<3; i++) {
          dataNodes[i].emit('select')
        }
        cy.get('@jqTrigger').should((spy: any) => {
          // Ensure at least 3 'node-selected' events were triggered
          const calledForNodeSelected = spy.getCalls().filter(call => call.args[0] === 'node-selected');
          expect(calledForNodeSelected).to.have.length(3);
          calledForNodeSelected.forEach(call => expect(call.args[0], 'trigger called with node-selected').to.be.eq('node-selected'))
        });
        for (let i = 0; i<3; i++) {
          const borderColor = dataNodes[i].style('border-color');
          expect(borderColor).to.match(/rgb\(255,\s*131,\s*0\)/);

          const sessionNode = win.commonService.session.data.nodes.find((n: any) => n._id === nodeIds[i]);
          expect(dataNodes[i].selected()).to.be.true;
          expect(sessionNode.selected).to.be.true;
        }
      })

      // check that 2D instance of cytoscape is updated
      cy.window().then((win: any) => {
        const cytoscapeInstance = win.cytoscapeInstance;
        const dataNodes = cytoscapeInstance.nodes(selector);

        dataNodes.forEach(dataNode => {
          expect(dataNode.selected()).to.be.true;

          const borderColor = dataNode.style('border-color');
          expect(borderColor).to.match(/rgb\(255,\s*131,\s*0\)/);
        })

      })
    })
  })

  context('Timeline Mode Testing', () => {
    beforeEach(() => {
      updateVariable('X', 'Lineage')
      cy.closeSettingsPane('Bubble Settings')
      cy.enableTimelineMode('Date symptoms resolved');
      cy.closeGlobalSettings();
    })
      
    it('ensures timeline mode is active', () => {
      cy.window().then((win) => {
        expect(win.commonService.session.style.widgets['node-timeline-variable']).to.eq('Date symptoms resolved');
      });
      cy.get('#global-timeline-field').should('have.text', 'Date symptoms resolved')
    });

    it('starts and stops the timeline and also checks that play button is updated', () => {
      cy.get('svg g.slider text.label').should('have.text', 'Jul  4')
      cy.get('svg g.slider circle.handle').should('not.have.attr', 'cx')
      cy.get('#timeline-play-button').should('contain', 'Play').click();
      cy.wait(7500)
      cy.get('#timeline-play-button').should('contain', 'Pause').click();
      cy.get('svg g.slider text.label').should('not.contain', 'Jul 4')
      cy.get('svg g.slider circle.handle').invoke('attr', 'cx').then(Number).should('be.gt', 0)
      cy.window().then((win: any) => {
        let visNodeCount = win.commonService.getVisibleNodes().length;

        const bubble = win.commonService.visuals.bubble;
        const bubbleNodeCount = bubble.cy.nodes().filter(n => !n.hasClass('X_axis') && !n.hasClass('Y_axis')).length
        expect(visNodeCount).to.eq(bubbleNodeCount);
      })
    })

    it('starts and stops the timeline when nodes are collapsed', () => {
      updateCollapsed(true, true)
      cy.closeSettingsPane('Bubble Settings')

      cy.get('#timeline-play-button').should('contain', 'Play').click();
      cy.wait(7500)
      cy.get('#timeline-play-button').should('contain', 'Pause').click();
      cy.get('svg g.slider text.label').should('not.contain', 'Jul 4')
      cy.get('svg g.slider circle.handle').invoke('attr', 'cx').then(Number).should('be.gt', 0)
      cy.window().then((win: any) => {
        let visNodeCount = win.commonService.getVisibleNodes().length;

        const bubble = win.commonService.visuals.bubble;
        let bubbleNodeCount = 0;
        const bubbleNodes = bubble.cy.nodes().filter(n => !n.hasClass('X_axis') && !n.hasClass('Y_axis'))
        bubbleNodes.forEach(node => {
          bubbleNodeCount += node.data('totalCount')
          let expectedSize = bubble.nodeSize * Math.sqrt(node.data('totalCount'))
          expect(node.data('nodeSize')).to.eq(expectedSize)
        });
        expect(visNodeCount).to.eq(bubbleNodeCount)
      })
    })
    
    it('changes color of node and link during timeline and then ensures color is kept after timeline ends', () => {
      cy.get('#timeline-play-button').should('contain', 'Play').click();
      cy.wait(7500)
      cy.get('#timeline-play-button').should('contain', 'Pause').click();

      cy.get('#node-color-table').contains('td', 'Pennsylvania').parent('tr').find('input[type="color"]').first().invoke('val', '#777777').trigger('input').trigger('change');

      cy.window().its('commonService.visuals.bubble').then(bubble => {
        let penNode = bubble.cy.nodes('[id = "MZ415508"]')[0]
        //: any = Object.values(layers.markerClusterGroup._featureGroup._layers).find((layer: any) => layer.data && layer.data.ID === 'MZ415508')
        const color = penNode.style('background-color');
        expect(color).to.match(/rgb\(119,\s*119,\s*119\)/);
      }) 

      cy.enableTimelineMode('None').closeGlobalSettings().wait(1000)
      cy.window().its('commonService.visuals.bubble').then(bubble => {
        let penNode = bubble.cy.nodes('[id = "MZ415508"]')[0] //let penNode: any = Object.values(layers.markerClusterGroup._featureGroup._layers).find((layer: any) => layer.data && layer.data.ID === 'MZ415508')
        const color = penNode.style('background-color');
        expect(color).to.match(/rgb\(119,\s*119,\s*119\)/);
      }) 
    })

    it('clicks slider midway and then back to start', () => {
      cy.get('#global-timeline svg line.track-overlay').first().click(300, 0, {force: true});
      cy.wait(1500)
      cy.get('svg g.slider text.label').should('have.text', 'Jul 22') 
      cy.window().then((win: any) => {
        let visNodeCount = win.commonService.getVisibleNodes().length;

        const bubble = win.commonService.visuals.bubble;
        const bubbleNodeCount = bubble.cy.nodes().filter(n => !n.hasClass('X_axis') && !n.hasClass('Y_axis')).length
        expect(visNodeCount).to.eq(bubbleNodeCount).to.eq(20);
      })

      cy.get('#global-timeline svg line.track-overlay').first().click(0, 0, {force: true});
      cy.wait(1500)
      cy.get('svg g.slider text.label').should('have.text', 'Jul  4') 
      cy.window().then((win: any) => {
        let visNodeCount = win.commonService.getVisibleNodes().length;

        const bubble = win.commonService.visuals.bubble;
        const bubbleNodeCount = bubble.cy.nodes().filter(n => !n.hasClass('X_axis') && !n.hasClass('Y_axis')).length
        expect(visNodeCount).to.eq(bubbleNodeCount).to.eq(5);
      })
    })
  })
    
  let updateLabelSize = (size: number, openSettings: boolean) => {
    cy.window().then((win: any) => {
      const bubble = win.commonService.visuals.bubble;
      if (bubble.labelSize == size) return;
    })
    if (openSettings) {
      cy.get(selectors.settingsBtn).click();
      cy.contains('div.p-dialog', 'Bubble Settings', { timeout: 10000 }).should('be.visible');
    }

    cy.get('div[title="Select a font Size for axis labels."').find('input.custom-range').invoke('val', size).trigger('input').trigger('change');
    cy.window().then((win: any) => {
      const bubble = win.commonService.visuals.bubble;
      expect(bubble.labelSize).to.be.eq(size);
      const axisNodes = bubble.cy.nodes('.X_axis, .Y_axis');
      axisNodes.forEach((node: any) => {
        const fontSize = parseFloat(node.style('font-size'));
        const expectedSize = node.hasClass('axisLabel') ? size + 4 : size;
        expect(fontSize).to.be.eq(expectedSize);
      });
    })
  }

  let updateCollapsed = (collapse: boolean, openSettings: boolean) => {
    if (openSettings) {
      cy.get(selectors.settingsBtn).click();
      cy.contains('div.p-dialog', 'Bubble Settings', { timeout: 10000 }).should('be.visible');
    }

    if (collapse) {
      cy.contains('.p-selectbutton .p-togglebutton-label', 'On').click();
      cy.window().then((win: any) => {
        const bubble = win.commonService.visuals.bubble;
        expect(bubble.SelectedNodeCollapsingTypeVariable).to.be.true;
      })
    } else {
      cy.contains('.p-selectbutton .p-togglebutton-label', 'Off').click();
      cy.window().then((win: any) => {
        const bubble = win.commonService.visuals.bubble;
        expect(bubble.SelectedNodeCollapsingTypeVariable).to.be.false;
      })
    }
  }

  let updateVariable = (axis, value, date: boolean = false) => {
    let axisPosition = axis == 'X' ? 0 : 1
    cy.contains('div.p-dialog', 'Bubble Settings').within(() => {
      cy.get('p-select').eq(axisPosition).click();
    });
    cy.get('p-selectitem').contains('li', value).click();
    if (date && axis == 'X') {
      cy.get('#xVarDate').click()
    } else if (date && axis == 'Y') {
      cy.get('#yVarDate').click()
    }

    cy.window().then((win: any) => {
      const bubble = win.commonService.visuals.bubble;
      const expectedValue = bubble.selectedFieldList.find(item => item.label == value)?.value
      let v = expectedValue.toLowerCase();
      if (axis == 'X') {
        expect(bubble.widgets['bubble-x'].toLowerCase()).to.eq(v);
        expect(bubble.cy.getElementById('x_axis_Label').data('label').toLowerCase()).to.eq(v);
        if (date) expect(bubble.xVarDate).to.be.true;
      } else {
        expect(bubble.widgets['bubble-y'].toLowerCase()).to.eq(v);
        expect(bubble.cy.getElementById('y_axis_Label').data('label').toLowerCase()).to.eq(v);
        if (date) expect(bubble.yVarDate).to.be.true;
      }
    })
  }
});