import { ChangeDetectorRef, Component, ElementRef, Inject, OnInit, Output, EventEmitter, ViewChild } from '@angular/core';
import { SelectItem } from 'primeng/api';
import * as saveAs from 'file-saver';
import { GoogleTagManagerService } from 'angular-google-tag-manager';

import { BaseComponentDirective } from '@app/base-component.directive';
import { CommonService } from '@app/contactTraceCommonServices/common.service';
import { MicobeTraceNextPluginEvents } from '@app/helperClasses/interfaces';
import { MicrobeTraceNextVisuals } from '@app/microbe-trace-next-plugin-visuals';
import { ComponentContainer } from 'golden-layout';
import cytoscape, { Core } from 'cytoscape';
import svg from 'cytoscape-svg';
import { ExportService, ExportOptions } from '@app/contactTraceCommonServices/export.service';

type DataRecord = { index: number, id: string, x: number; y: number, color: string, Xgroup: number, Ygroup: number, strokeColor: string, totalCount?: number, counts ?: any }//selected: boolean }

@Component({
  selector: 'bubble-component',
  templateUrl: './bubble.component.html',
  styleUrls: ['./bubble.component.scss']
})
export class BubbleComponent extends BaseComponentDirective implements OnInit, MicobeTraceNextPluginEvents {

  @Output() DisplayGlobalSettingsDialogEvent = new EventEmitter();

  @ViewChild('cyBubble', { static: false }) cyContainer: ElementRef;
  @ViewChild('bubbleTooltip') toolTip: ElementRef;
  
  cy: Core;
  
  visuals: MicrobeTraceNextVisuals;
  widgets: any;

  viewActive: boolean = true;
  settingsOpen: boolean = false;
  exportOpen: boolean = false;

  BubbleExportFileType: string = 'png'
  BubbleExportFileName: string = ''
  SelectedBubbleExportScaleVariable: number = 1;
  CalculatedResolution: string;

  viewHeight: number;
  viewWidth: number;

  selectedFieldList: SelectItem[] = [];
  xVariable: string;
  yVariable: string;
  nodeSize: number;
  nodeSpacing = 0.05;

  allData: DataRecord[] = [];
  visibleData: DataRecord[] = [];

  X_categories = []
  X_tickValues = []

  Y_categories = []
  Y_tickValues = []

  scaleFactor: number = 200;
  svgDefs: {} = {};

  NodeCollapsingTypes: any = [
    { label: 'On', value: true },
    { label: 'Off', value: false }
  ];
  SelectedNodeCollapsingTypeVariable: boolean;

  constructor(
    public commonService: CommonService,
    @Inject(BaseComponentDirective.GoldenLayoutContainerInjectionToken) private container: ComponentContainer,
    elRef: ElementRef,
    private cdref: ChangeDetectorRef,
    private gtmService: GoogleTagManagerService,
    private exportService: ExportService
  ) {
    super(elRef.nativeElement);

    this.visuals = commonService.visuals;
    this.visuals.bubble = this;
    this.widgets = this.commonService.session.style.widgets;

    cytoscape.use(svg);
  }

  ngOnInit(): void {
    this.gtmService.pushTag({
      event: "page_view",
      page_location: "/bubble",
      page_title: "Bubble View"
    });

    try {
      this.viewHeight = this.container.height - 73;
      this.viewWidth = this.container.width - 42;
    } catch (error) {
      console.log('unable to set proper view sizes for bubble view, setting to default values');
      this.viewWidth = 800;
      this.viewHeight = 600;
    } 
    
    this.selectedFieldList.push({ label: "None", value: "None"})
    this.commonService.session.data['nodeFields'].map((d) => {
      if (['seq', 'origin', '_diff', '_ambiguity', 'index', '_id'].includes(d)) return;
      this.selectedFieldList.push({
        label: this.commonService.capitalize(d.replace("_", "")),
        value: d
      });
    })

    this.setWidgets();
    this.updateAxisValues('X');
    this.updateAxisValues('Y');

    this.getData();
    this.onNodeSizeChange();

    this.container.on('resize', () => { this.goldenLayoutComponentResize()})
    this.container.on('hide', () => { 
      this.viewActive = false; 
      this.cdref.detectChanges();
    })
    this.container.on('show', () => { 
        this.viewActive = true; 
        this.setSelectedNodes(this);
        setTimeout(() => {
          this.goldenLayoutComponentResize();
          this.cdref.detectChanges();
        }, 5)

    })
    
    let that = this;
    $( document ).on("node-selected", function( ) {
      if (that.viewActive) {
          that.visuals.bubble.setSelectedNodes(that);
      }
    });

    $( document ).on( "node-visibility", function( ) {
      //console.log('node visi event')
      that.updateVisibleNodes()
      that.updateNodes();
    });
  }

  ngAfterViewInit(): void {
    this.generateCytoscape();
  }

  setWidgets() {
    if (this.widgets['bubble-x'] == undefined || !(this.selectedFieldList.map(x=> x.value).includes(this.widgets['bubble-x']))) {
      this.xVariable = 'cluster';
      this.widgets['bubble-x'] = this.xVariable;
    } else {
      this.xVariable = this.widgets['bubble-x'];
    }

    if (this.widgets['bubble-y'] == undefined || !(this.selectedFieldList.map(x=> x.value).includes(this.widgets['bubble-y']))) {
      this.xVariable = 'None';
      this.widgets['bubble-y'] = this.xVariable;
    } else {
      this.yVariable = this.widgets['bubble-y']
    }

    if (this.widgets['bubble-x'] == 'None' && this.widgets['bubble-y'] == 'None') {
      this.openSettings();
    }

    if (this.widgets['bubble-size'] < 10 || this.widgets['bubble-size'] > 40 || this.widgets['bubble-size'] == undefined || this.widgets['bubble-size'] == null || typeof this.widgets['bubble-size'] != 'number') {
      this.widgets['bubble-size'] = 15;
    }
    this.nodeSize = this.widgets['bubble-size']

    if (this.widgets['bubble-charge'] < .01 || this.widgets['bubble-charge'] > .15 || this.widgets['bubble-charge'] == undefined || this.widgets['bubble-charge'] == null || typeof this.widgets['bubble-charge'] != 'number') {
      this.widgets['bubble-charge'] = 0.05;
    }
    this.nodeSpacing = this.widgets['bubble-charge']

    if (this.widgets['bubble-collapsed'] == undefined || this.widgets['bubble-collapsed'] == null) {
      this.widgets['bubble-collapsed'] = false;
    }
    this.SelectedNodeCollapsingTypeVariable = this.widgets['bubble-collapsed']
  }

  mapDataToCytoscapElements(data: DataRecord[]): cytoscape.ElementsDefinition {
    const nodes = data.map((node) => {
      let size = this.SelectedNodeCollapsingTypeVariable ? this.nodeSize * Math.sqrt(node.totalCount): this.nodeSize;
      // probably do something here for node size
      return {
        data: {
          id: node.id,
          nodeSize: size,
          nodeColor: node.color,
          label: node.id,
          counts: node.counts,
          totalCount: node.totalCount,
        },
        position: {
          x: node.x*this.scaleFactor,
          y: node.y*this.scaleFactor
        }
      }
    })

    return { nodes: nodes, edges: null }
  }

  AddAxes() {
    let Axes = [];
    if ( this.xVariable != 'None') {
      this.X_categories.forEach((value, i) => {
        let label = value== null || value == undefined ? 'Unknown': value;
        Axes.push(
          {group: 'nodes', data: {id: `x_axis${i}`, label: label}, position: {x: i*this.scaleFactor, y: this.Y_categories.length*this.scaleFactor-50}, classes: ['X_axis'],
        })
      })

      Axes.push({ group: 'nodes', data: {id: 'x_axis_Label', label: this.commonService.capitalize(this.xVariable)}, position: {x: (this.X_categories.length-1)*this.scaleFactor/2, y: this.Y_categories.length*this.scaleFactor}, classes: ['X_axis', 'axisLabel']})
    }

    if ( this.yVariable != 'None') {
      this.Y_categories.forEach((value, i) => {
        let label = value== null || value == undefined ? 'Unknown': value;
        Axes.push(
          {group: 'nodes', data: {id: `y_axis${i}`, label: label}, position: {x: -100, y: i*this.scaleFactor}, classes: ['Y_axis'],
        })
      })

      Axes.push({ group: 'nodes', data: {id: 'y_axis_Label', label: this.commonService.capitalize(this.yVariable)}, position: {x: -150, y: (this.Y_categories.length-1)*this.scaleFactor/2}, classes: ['Y_axis', 'axisLabel']})

    }

    this.cy.add(Axes);
    this.cy.fit(this.cy.nodes(), 30);
    this.cy.nodes().lock()
  }

  getCytoscapeStyle(): cytoscape.StylesheetCSS[] {
    return [
      {
        selector: 'node',
        css: {
            //'background-color': 'data(nodeColor)', // Use dynamic node color
            //'label': 'data(label)',
            'width': 'data(nodeSize)',
            'height': 'data(nodeSize)',
            'border-width': 3, // Use dynamic border width
            'border-color': '#000000',
        }
      },
      // Apply styles only to nodes with nodeColor defined
      {
        selector: 'node[nodeColor]',
        css: {
            'background-color': 'data(nodeColor)'
        }
      },
      {
        selector: '.X_axis',
        css: {
          'label': 'data(label)',
          'shape': 'rectangle',
          'border-width': 0,
          'background-color': 'white',
          'width': 1,
          'height': 1
        }
      },
      {
        selector: '.Y_axis',
        css: {
          'label': 'data(label)',
          'shape': 'rectangle',
          //'border-color': 'none',
          'border-width': 0,
          'background-color': 'white',
          'width': 1,
          'height': 1,
          'text-valign': 'center'
        }
      },
      {
        selector: '#y_axis_Label',
        css: {
          'text-rotation': 4.71239
        }
      },
      {
        selector: '.axisLabel',
        css: {
          'font-size': 24
        }
      },
      {
        selector: 'node:selected',
        css: {
            'border-color': '#ff8300',
        }
      },
    ]
  }

  generateCytoscape() {
    this.cy = cytoscape({
      container: this.cyContainer.nativeElement,
      elements: this.mapDataToCytoscapElements(this.visibleData),
      style: this.getCytoscapeStyle(),
      layout: {
        name: 'preset',
        fit: true,
        padding: 30
      },

      zoomingEnabled: true,
      userZoomingEnabled: false,
      panningEnabled: true,
      userPanningEnabled: false,
  
    })

    this.AddAxes();
    this.cy.nodes().lock()

    // Example: Hover events
    this.cy.on('mouseover', 'node', (evt) => {
      const node = evt.target;
      if (node.classes().length > 0) return;
      this.showTooltip(node.data(), evt.originalEvent);
    });

    this.cy.on('mouseout', 'node', () => {
        this.hideTooltip();
    });
  }

  showTooltip(d, e) {
    let tooltipHTML: string = '';
    if (this.SelectedNodeCollapsingTypeVariable) {
      tooltipHTML = `
      <style>
        #bubbleToolTip {
          border-spacing: 0;
          width: 100%;
          //border: 1px solid #ddd;
          z-index: 1000;
        }

        #bubbleToolTip td, #bubbleToolTip th {
          text-align: center;
          padding: 2px;
          font-weight: 400;
          border: 1px solid #ddd;
        }

        #bubbleToolTip tr:nth-child(even) {
          background-color: #f2f2f2;
        }

        #bubbleToolTip tr:nth-child(odd) {
          background-color: #fff;
        } 
      </style>
      <table id="bubbleToolTip"><thead><th>${this.commonService.capitalize(this.commonService.session.style.widgets['node-color-variable'])}</th><th> Count </th><th> % </th></thead><tbody>`;
      d.counts.forEach((x) => tooltipHTML += `<tr><td>${x.label}</td><td> ${x.count}</td><td>${(x.count/d.totalCount*100).toFixed(1)}%</td></tr>`)
      tooltipHTML += '</tbody></table>';
    } else {
      tooltipHTML = `${d.id}`
    }
    let [X, Y] = this.getRelativeMousePosition(event);
    
    this.toolTip.nativeElement.innerHTML = tooltipHTML;
    Object.assign(this.toolTip.nativeElement.style, {
      position: 'absolute',
      left: (X+20)+'px',
      top: (Y+10)+'px',
      zIndex: '1000',
      transition: 'opacity 100ms',
      opacity: '1'
    })
    this.toolTip.nativeElement.addEventListener('transitionend', () => {
      this.toolTip.nativeElement.style.zIndex = '1000'
    }, { once: true })
  }

  getRelativeMousePosition(event) {
    let rect = this.cyContainer.nativeElement.getBoundingClientRect();
    const X = event['clientX'] - rect.left;
    const Y = event['clientY'] - rect.top;
    return [X, Y]
  }

  hideTooltip() {
    Object.assign(this.toolTip.nativeElement.style, {
      transition: 'opacity 100ms',
      opacity: 0
    })
    this.toolTip.nativeElement.addEventListener('transitionend', () => {
      this.toolTip.nativeElement.style.zIndex = '-1'
    }, { once: true })
  }

  /**
   * Gets the data from commonService.getVisibleNodes and then creates node with this. Creates the axis labels and 
   * (updates axes and places nodes with this.updateAxes and updates color of nodes with this.updateColors)
   */
  getData() {
    this.allData = [];
  
    let nodes = this.commonService.session.data.nodeFilteredValues;
    nodes.forEach(node => {
      let nodeDR: DataRecord = {
        index: node.index,
        id: node._id,
        x: 0,
        y: 0,
        color: '#ff00ff',
        Xgroup: 0,
        Ygroup: 0,
        strokeColor: node.selected ? this.commonService.session.style.widgets['selected-color']: '#000000',
        totalCount: 1
      }
      if (this.xVariable != undefined || this.xVariable != 'None') {
        let nodeX = node[this.xVariable];
        let locX = this.X_categories.indexOf(nodeX);
        nodeDR.Xgroup = locX;
      }
      if (this.yVariable != undefined || this.yVariable != 'None') {
        let nodeY = node[this.yVariable];
        let locY = this.Y_categories.indexOf(nodeY);
        nodeDR.Ygroup = locY;
      }

      this.allData.push(nodeDR)
    })
    this.updateAxes();
    this.updateColors();
    if (this.widgets["node-timeline-variable"] != 'None') {
      this.sortData(this.widgets["node-timeline-variable"])
      let currentLength = this.allData.length;
      this.visibleData = this.allData.slice(0, currentLength);
    }
    this.updateVisibleNodes();

  }

  /**
   * updates values of visibleNodes based on SelectedNodeCollapsingTypeVariable and if timeline mode is active
   */
  updateVisibleNodes() {
    // if no timeline and not collapsed
    if (this.widgets["node-timeline-variable"] == 'None' && this.SelectedNodeCollapsingTypeVariable == false) {
      this.visibleData = this.allData;
    // if timeline and not collapse
    } else if (this.widgets["node-timeline-variable"] != 'None' && this.SelectedNodeCollapsingTypeVariable == false) {
      let visibleNodes = this.commonService.getVisibleNodes();
      if (visibleNodes.length == this.visibleData.length) { return }
      this.visibleData = [];
      this.allData.forEach(node => {
        if (visibleNodes.find(vNode => vNode._id == node.id)) {
          this.visibleData.push(node);
        }
      })
    // if no timeline and collapse
    } else if (this.widgets["node-timeline-variable"] == 'None'){
      // console.log(this.commonService.getVisibleNodes().length, this.visibleData.reduce((sum, obj) => sum + obj.totalCount, 0))
      this.getCollapsedData(false, false)
    // if timeline and collapse
    } else {
      if (this.commonService.getVisibleNodes().length == this.visibleData.reduce((sum, obj) => sum + obj.totalCount, 0)) { return }
      this.getCollapsedData(false, false);
    } 
    

  }

  /**
  * Updates the value of X_categories X_tickValues based on xVariables (or those variables for Y axis)
  * @param axis 'X' or anything else defaults to 'Y' axis
  */
  updateAxisValues(axis: string) {
    let nodes = this.commonService.session.data.nodeFilteredValues;

    if (axis == 'X') {
      this.widgets['bubble-x'] = this.xVariable;
      if ( this.xVariable == 'None' || this.xVariable == undefined) {
        this.X_categories = [ undefined ];
        this.X_tickValues = [ 0 ];
      }

      this.X_categories = [];
      this.X_tickValues = [];

      nodes.forEach(node => {
        let nodeX = node[this.xVariable];
        if (this.X_categories.indexOf(nodeX) == -1) {
          this.X_tickValues.push(this.X_categories.length);
          this.X_categories.push(nodeX);
        }
    })

    } else {
      this.widgets['bubble-y'] = this.yVariable;
      if ( this.yVariable == 'None' || this.yVariable == undefined) {
        this.Y_categories = [ undefined ];
        this.Y_tickValues = [ 0 ];
      }

      this.Y_categories = [];
      this.Y_tickValues = [];

      nodes.forEach(node => {
        let nodeY = node[this.yVariable];
        if (this.Y_categories.indexOf(nodeY) == -1) {
          this.Y_tickValues.push(this.Y_categories.length);
          this.Y_categories.push(nodeY);
        }
      })
    }
  }

  /**
   * Updates axis tickValues (X_tickValues & Y_tickValues) and positions for each node
   */
  updateAxes() {
    this.X_tickValues.forEach(xLoc => {
      this.Y_tickValues.forEach(yLoc => {
        let filteredNodes = this.allData.filter(node => node.Xgroup == xLoc && node.Ygroup == yLoc)
        if (filteredNodes.length == 0) {
          return;
        } else if (filteredNodes.length == 1) {
          filteredNodes[0].x = xLoc;
          filteredNodes[0].y = yLoc;
        } else {
          this.calculateHexagonalGridPositions(filteredNodes)
        }
      })
    })
  }

  /**
   * Updates this.visibleData so that each node represents a multiple datapoints instead of a single data point;
   * Also updates color/pattern of nodes so that they are pie charts based on proportion of each datapoint's color
   */
  getCollapsedData( sortData = false, initial  = true) {
    if (this.widgets["node-timeline-variable"] != 'None' && sortData) {
      this.sortData(this.widgets["node-timeline-variable"])
    }
    
    if (initial) {
      this.visibleData = [];
      let fullNodes = this.commonService.session.data.nodeFilteredValues;
      this.allData.forEach(node => {
        let X_group = 0, Y_group = 0;
        let currentFullNode = fullNodes.find(fNode => fNode.index == node.index)
        if (this.xVariable != undefined || this.xVariable != 'None') {
          let nodeX = currentFullNode[this.xVariable];
          X_group = this.X_categories.indexOf(nodeX);
        }
        if (this.yVariable != undefined || this.yVariable != 'None') {
          let nodeY = currentFullNode[this.yVariable];
          Y_group = this.Y_categories.indexOf(nodeY);
        }

        let index = this.visibleData.findIndex((node) => node.Xgroup==X_group && node.Ygroup==Y_group);
        if (index == -1) {
          //console.log(X_group, Y_group)
          let length = this.visibleData.length;
          this.visibleData.push({
            index: length,
            id: `cNode${length}`,
            x: X_group,
            y: Y_group,
            color: node.color,
            Xgroup: X_group,
            Ygroup: Y_group,
            strokeColor: '#000000',
            totalCount: 0,
            counts: []
          })
        }
      })

    }

    let changedVisibleNodes = this.generateCollapsedCounts();
    this.generatePieChartsSVGDefs(changedVisibleNodes);

    this.cy.remove('node');
    this.updateNodes();

    this.cy.style().resetToDefault();
    this.cy.style(this.getCytoscapeStyle())
    this.visibleData.forEach((node, i) => {
      if ( node.totalCount == 1 || node.counts.length == 1) {
        return;
      } else {
        let size = this.nodeSize * Math.sqrt(node.totalCount);
        let svgPattern = `<svg width='${size}' height='${size}' xmlns='http://www.w3.org/2000/svg'><defs>${this.svgDefs[`node${i}`]}</defs><circle fill="url(#node${i})" cx='${size/2}' cy='${size/2}' r='${size/2}'/></svg>`;
        let b64 = 'data:image/svg+xml;base64,' + btoa(svgPattern);
        this.cy.style().selector(`#cNode${i}`).style({ 'background-color': 'transparent', 'background-fit': 'cover', 'background-image': b64})
      }
    })
    this.cy.style().update();

    this.updateAxes();
  }

  /**
   * Update the values for counts for each node in this.visibleData (relevant when nodes are collapsed). These values are used when creating a pie
   * chart of each collapsed node.
   * @returns an array of indexes of visibleData that was changed
   */
  generateCollapsedCounts() {
    let fullNodes = this.commonService.getVisibleNodes();
    let colorCategory = this.commonService.session.style.widgets['node-color-variable']
    let changedVisibleNodes = [];

    this.visibleData.forEach(node => {
      if (node.id == '' && node.index == 1000) {
        node.counts = { label: '', count: 0}
        return;
      }
      let X = this.X_categories[node.Xgroup]
      let Y = this.Y_categories[node.Ygroup]
      
      let currentNodes = fullNodes.filter(fNode => fNode[this.xVariable] == X && fNode[this.yVariable]==Y) 
      node.counts = [];
      let previousTotal = node.totalCount;
      node.totalCount = 0;
      currentNodes.forEach(cNode => {
        let currentCategory = cNode[colorCategory];
        let index = node.counts.findIndex((countItem) => countItem.label == currentCategory)
        if (index == -1) {
          node.counts.push({
            label: currentCategory,
            count: 1
          })
        } else {
          node.counts[index].count += 1
        }
        node.totalCount += 1;
      })
      if (previousTotal != node.totalCount) {
        //console.log('node updated: ', node.totalCount, node.index)
        changedVisibleNodes.push(node.index)
      }
    })
    return changedVisibleNodes;
  }

  /**
   * @returns a string representing the SVG def of the patterns needed to generate the pie chart
   */
  generatePieChartsSVGDefs(changedVisibleNodes) : void {
    changedVisibleNodes.forEach((indexNumber) => {
      let patternString = '';
      let node = this.visibleData.find(vNode => vNode.index == indexNumber);

      if (node.totalCount < 2 || node.counts.length == 1 || node == undefined) {
        return;
      }
      let proportions = []
      let coordinates = []
      let colors = [];
      node.counts.forEach(x => {
        let proportion = proportions.reduce((acc, cv) => acc+cv, 0) + x.count/node.totalCount
        let xPos = Math.cos(2 * Math.PI * proportion)
        let yPos = Math.sin(2 * Math.PI * proportion)
        
        proportions.push(x.count/node.totalCount)
        coordinates.push([xPos, yPos])
        colors.push(this.commonService.temp.style.nodeColorMap(x.label))
      })

      patternString += `<pattern id='node${indexNumber}' viewBox='-1 -1 2 2' style='transform: rotate(-.25turn)' width='100%' height='100%'>` ;
      for (let i = 0; i<coordinates.length; i++) {
        let arcStart = i == 0 ? '1 0': coordinates[i-1][0] + ' ' + coordinates[i-1][1];
        let largeArcFlag = proportions[i] > .5 ? 1: 0 
        let arcEnd = i == coordinates.length-1 ? '1 0' : coordinates[i][0] + ' ' + coordinates[i][1]
        patternString += `<path d='M 0 0 L ${arcStart} A 1 1 0 ${largeArcFlag} 1 ${arcEnd} L 0 0' fill='${colors[i]}' />`
      }
      patternString += '</pattern>'
      this.svgDefs[`node${indexNumber}`] = (patternString);
    })
  }

  /**
   * Updates the color of the nodes in allData
   */
  updateColors() {
    let fillcolor = this.commonService.session.style.widgets['node-color']
    let colorVariable = this.commonService.session.style.widgets['node-color-variable']

    let fullNodes = this.commonService.session.data.nodeFilteredValues;

    this.allData.forEach(node => {
      let currentFullNode = fullNodes.find(Fnode => node.index == Fnode.index);
      node.color = colorVariable == 'None' ? fillcolor : this.commonService.temp.style.nodeColorMap(currentFullNode[colorVariable]);
    })

    if (this.cy && this.cy.nodes().length > 0) {
      this.cy.nodes().forEach(node => {
        if (node.classes().length > 0) return;
        let currentNode = this.allData.find(dataNode => dataNode.id == node.id());
        node.data('nodeColor', currentNode.color);
      });
      this.cy.style().update(); // Refresh Cytoscape styles to apply changes
    }

  }

  /**
   * Calculates the position (x, y) for the array of nodes; nodes are positioned in a layers spiral/hexagonal pattern 
   */
  calculateHexagonalGridPositions(nodes: DataRecord[]) {
    // alternative method could use d3 forces and/or phyllotaxis arrangement
    // https://2019.wattenberger.com/blog/spirals
    const layerDistance = this.nodeSpacing + .02;
    let layer = 0;
    let nodesInLayer = 1;

    let count = 0;
    nodes.forEach(node => {
      const angle = (2 * Math.PI / nodesInLayer) * count;
      node.x = node.Xgroup + layer * layerDistance * Math.cos(angle);
      node.y = node.Ygroup + layer * layerDistance * Math.sin(angle);

      count++;
      if (count >= nodesInLayer) {
        count = 0;
        layer++;
        nodesInLayer = 6*layer;
      }
    })
  }

  onNodeCollapsingChange() {
    this.widgets['bubble-collapsed'] = this.SelectedNodeCollapsingTypeVariable;
    if (this.SelectedNodeCollapsingTypeVariable) {
      this.getCollapsedData(true);
    } else {
      this.cy.remove('node');
      this.getData();
      this.updateNodes();
    }
  }

  goldenLayoutComponentResize() {    
    this.viewHeight = this.container.height - 73;
    this.viewWidth = this.container.width - 42;
    setTimeout(() => this.cy.fit(this.cy.nodes(), 30), 300);
  }

  setSelectedNodes(that) {
    if (that.commonService.visuals.bubble.SelectedNodeCollapsingTypeVariable) {
      return;
    }
    let nodes = that.commonService.getVisibleNodes()
    nodes.forEach(node => {
      let datum = that.visibleData.find(datum => datum.index == node.index)
      let datum_all = that.allData.find(datum => datum.index == node.index)
      if (node.selected) console.log('found: ', datum)

      datum.strokeColor = node.selected ? this.commonService.session.style.widgets['selected-color']: '#000000';
      datum_all.strokeColor = node.selected ? this.commonService.session.style.widgets['selected-color']: '#000000';
    })
    that.strokeColor = (d: DataRecord) => d.strokeColor;
  }

  updateNodes() {
    if (this.cy) {
      this.cy.remove('node');
      this.cy.add(this.mapDataToCytoscapElements(this.visibleData))
      this.AddAxes();
    }
  }

  onDataChange(axis: string) {
    this.updateAxisValues(axis)
    this.svgDefs = {};
    if (this.SelectedNodeCollapsingTypeVariable) {
      this.getCollapsedData(true);
    } else {
      this.getData();
    }
    this.updateNodes();
  }

  /**
   * Sorts this.allData chronologically based on the given sortVariable
   * @param sortVariable name of a property of commonService.session.data.nodeFilteredValues
   */
  sortData(sortVariable) {
    let allNodes = JSON.parse(JSON.stringify(this.commonService.session.data.nodeFilteredValues));
    allNodes.sort((a, b) => new Date(a[sortVariable]).getTime() - new Date(b[sortVariable]).getTime())
    
    let allData = []
    allNodes.forEach(node => {
      allData.push(this.allData.find(dataNode => node._id == dataNode.id))      
    })

    this.allData = allData;
    this.recalculatePositions();
    this.updateVisibleNodes();
    this.updateNodes();
  }

  /**
   * Recalculates the position of the nodes in allData
   */
  recalculatePositions() {
    this.X_tickValues.forEach(xLoc => {
      this.Y_tickValues.forEach(yLoc => {
        let filteredNodes = this.allData.filter(node => node.Xgroup == xLoc && node.Ygroup == yLoc)
        if (filteredNodes.length == 0) {
          return;
        } else if (filteredNodes.length == 1) {
          filteredNodes[0].x = xLoc;
          filteredNodes[0].y = yLoc;
        } else {
          this.calculateHexagonalGridPositions(filteredNodes)
        }
      })
    })
  }

  onNodeSpacingChange() {
    this.widgets['bubble-charge'] = this.nodeSpacing;
    this.recalculatePositions();
    if (this.cy) {
      this.cy.nodes().unlock();
      this.cy.nodes().positions((node, i) => {
        if (node.classes().length > 0) return;
        let current = this.visibleData[i];
        return {
          x: current.x*this.scaleFactor,
          y: current.y*this.scaleFactor
        }
      })  

      this.cy.fit(this.cy.nodes(), 30);
      this.cy.nodes().lock();
    }
  }

  onNodeSizeChange() {
    this.widgets['bubble-size'] = this.nodeSize;
    if (this.SelectedNodeCollapsingTypeVariable) {
      if (this.cy) {
        this.cy.nodes().forEach(node => {
          node.data('nodeSize', this.nodeSize * Math.sqrt(node.data().totalCount));
        });
        this.cy.style().update();
        this.cy.fit(this.cy.nodes(), 30);
      }
    } else {
      this.recalculatePositions();
      if (this.cy) {
        this.cy.nodes().forEach(node => {
          node.data('nodeSize', this.nodeSize);
        }); 
        this.cy.style().update(); 
        this.cy.fit(this.cy.nodes(), 30);
      }
    }
}

  /**
  * Opens Global Setting Dialog
  */
  showGlobalSettings() {
    this.DisplayGlobalSettingsDialogEvent.emit("Styling");
  }

  updateNodeColors() {
    if (this.SelectedNodeCollapsingTypeVariable) {
      let _ = this.generateCollapsedCounts();
      this.generatePieChartsSVGDefs(this.visibleData.map(obj => obj.index));
      this.cy.remove('node');
      this.getData();
      this.updateNodes();

      this.visibleData.forEach((node, i) => {
        if ( node.totalCount == 1 || node.counts.length == 1) {
          let currrentVar = node.counts[0].label
          //console.log(node, currrentVar)
          this.cy.style().selector(`#${node.id}`).style({ 'background-color': this.commonService.temp.style.nodeColorMap(currrentVar)})
          return;
        } else {
          let size = this.nodeSize * Math.sqrt(node.totalCount);
          let svgPattern = `<svg width='${size}' height='${size}' xmlns='http://www.w3.org/2000/svg'><defs>${this.svgDefs[`node${i}`]}</defs><circle fill="url(#node${i})" cx='${size/2}' cy='${size/2}' r='${size/2}'/></svg>`;
          let b64 = 'data:image/svg+xml;base64,' + btoa(svgPattern);
          this.cy.style().selector(`#cNode${i}`).style({ 'background-color': 'transparent', 'background-fit': 'cover', 'background-image': b64})
        }
      })
      this.cy.style().update();

      let fillcolor = this.commonService.session.style.widgets['node-color']
      let colorVariable = this.commonService.session.style.widgets['node-color-variable']
  
      let fullNodes = this.commonService.session.data.nodeFilteredValues;
  
      this.allData.forEach(node => {
        let currentFullNode = fullNodes.find(Fnode => node.index == Fnode.index);
        node.color = colorVariable == 'None' ? fillcolor : this.commonService.temp.style.nodeColorMap(currentFullNode[colorVariable]);
      })
    } else {
      this.updateColors();
    }
  }

  getAxisLabel(axis: string) {
    if (axis == 'X') {
      if (this.xVariable == 'None') return;
      return this.commonService.capitalize(this.xVariable)
    }
    else {
      if (this.yVariable == 'None') return;
      return this.commonService.capitalize(this.yVariable)
    }
  }

  updateLinkColor() {}
  updateVisualization() {}
  applyStyleFileSettings() {
    this.widgets = (window as any).context.commonService.session.style.widgets;

    if (this.widgets['bubble-x'] != undefined && this.selectedFieldList.map(x => x.value).includes(this.widgets['bubble-x'])) {
      this.xVariable = this.widgets['bubble-x'];
      this.onDataChange('X');
    } else {
      this.widgets['bubble-x'] = this.xVariable;
    }

    if (this.widgets['bubble-y'] != undefined && this.selectedFieldList.map(x => x.value).includes(this.widgets['bubble-y'])) {
      this.yVariable = this.widgets['bubble-y'];
      this.onDataChange('Y');
    } else {
      this.widgets['bubble-y'] = this.yVariable;
    }

    if (this.widgets['bubble-size'] >= 10 && this.widgets['bubble-size'] <= 40) {
      this.nodeSize = this.widgets['bubble-size'];
      this.onNodeSizeChange()
    } else {
      this.widgets['bubble-size'] = this.nodeSize;
    }
    
    if (this.widgets['bubble-charge'] >= .01 && this.widgets['bubble-charge'] <= .15) {
      this.nodeSpacing = this.widgets['bubble-charge'];
      this.onNodeSpacingChange();
    } else {
      this.widgets['bubble-charge'] = this.nodeSpacing;
    }
    
    if (this.widgets['bubble-collapsed'] == undefined || this.widgets['bubble-collapsed'] == null) {
      this.widgets['bubble-collapsed'] = this.SelectedNodeCollapsingTypeVariable;
    } else if (this.widgets['bubble-collapsed'] != this.SelectedNodeCollapsingTypeVariable) {
      this.SelectedNodeCollapsingTypeVariable = this.widgets['bubble-collapsed'];
      this.onNodeCollapsingChange();
    }
  }

  openRefreshScreen() {}
  onRecallSession() {}
  onLoadNewData() {}
  onFilterDataChange() {}
    
  openExport() { 
    this.setCalculatedResolution();
    this.exportOpen = true;
  }

  /**
  * Sets CalculatedResolution variable to string such as '1250 x 855px'. Only called when export is first opened
  */
  setCalculatedResolution() {
    this.CalculatedResolution = (Math.round((this.viewWidth-42) * this.SelectedBubbleExportScaleVariable) + " x " + Math.round((this.viewHeight-73) * this.SelectedBubbleExportScaleVariable) + "px");
  }

  /**
   * Updates CalculatedResolution variable to string such as '1250 x 855px' based on ImageDimensions and SelectedNetworkExportScaleVariable. 
   * This is called anytime SelectedNetworkExportScaleVariable is updated.
   */
  updateCalculatedResolution() {
    this.CalculatedResolution = (Math.round((this.viewWidth-42) * this.SelectedBubbleExportScaleVariable) + " x " + Math.round((this.viewHeight-73) * this.SelectedBubbleExportScaleVariable) + "px");
    this.cdref.detectChanges();
  }

  exportVisualization() {
    const exportOptions: ExportOptions = {
      filename: this.BubbleExportFileName,
      filetype: this.BubbleExportFileType,
      scale: this.SelectedBubbleExportScaleVariable,
      quality: 1,
    };

    // Set export options in the service
    this.exportService.setExportOptions(exportOptions);

    if (this.BubbleExportFileType == 'svg') {
      let options = { scale: 1, full: true, bg: '#ffffff'};
      let content = (this.cy as any).svg(options);

      this.exportService.requestSVGExport([], content, true, false); 
    } else {
      this.exportService.requestExport([this.cyContainer.nativeElement], true, false);
    }
    this.exportOpen = false;
  }

  openSettings() {
  this.settingsOpen = true;
  }
}

export namespace BubbleComponent {
  export const componentTypeName = 'Bubble';
}
