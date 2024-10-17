import { ChangeDetectorRef, Component, ElementRef, Inject, Injector, OnInit, Output, Renderer2, EventEmitter, ViewChild } from '@angular/core';
import { EventManager } from '@angular/platform-browser';
import { SelectItem } from 'primeng/api';
import * as saveAs from 'file-saver';
import { saveSvgAsPng } from 'save-svg-as-png';

import { BaseComponentDirective } from '@app/base-component.directive';
import { CommonService } from '@app/contactTraceCommonServices/common.service';
import { MicobeTraceNextPluginEvents } from '@app/helperClasses/interfaces';
import { MicrobeTraceNextVisuals } from '@app/microbe-trace-next-plugin-visuals';
import { ComponentContainer } from 'golden-layout';
 
import { XYContainer, Scatter, Axis } from '@unovis/ts'

type DataRecord = { index: number, id: string, x: number; y: number, color: string, Xgroup: number, Ygroup: number, strokeColor: string, totalCount?: number, counts ?: any }//selected: boolean }

@Component({
  selector: 'bubble-component',
  templateUrl: './bubble.component.html',
  styleUrls: ['./bubble.component.scss']
})
export class BubbleComponent extends BaseComponentDirective implements OnInit, MicobeTraceNextPluginEvents {

  @Output() DisplayGlobalSettingsDialogEvent = new EventEmitter();
  @ViewChild('scatter') scatterPlot: Scatter<Object>;
  @ViewChild('x_axis') x_axis: Axis<DataRecord>;
  @ViewChild('y_axis') y_axis: Axis<DataRecord>;
  
  visuals: MicrobeTraceNextVisuals;
  widgets: any;

  viewActive: boolean = true;
  settingsOpen: boolean = false;
  exportOpen: boolean = false;

  BubbleExportFileType: string = 'png'
  BubbleExportFileName: string = ''
  SelectedBubbleExportScaleVariable: number = 1;
  CalculatedResolution: string;

  viewHeight: number
  viewWidth: number
  padding = { left: 20, right: 20, top: 20, bottom: 20 }

  selectedFieldList: SelectItem[] = [];
  xVariable;
  yVariable;
  nodeSize = 16;
  nodeSpacing = 0.05;

  allData: DataRecord[] = [];
  visibleData: DataRecord[] = [];

  X_categories = []
  X_axisFormat = (tick: number) => this.X_categories[tick]
  X_tickValues = []

  Y_categories = []
  Y_axisFormat = (tick: number) => this.Y_categories[tick]
  Y_tickValues = []
  
  /* on-click effect, if we want functionality when a node is clicked (also add [events]="events" to vis-scatter in template)
  events = {
    [Scatter.selectors.point]: {
      click: (d: DataRecord) => { 
        //d.selected = true;
        console.log(d);
      }
    }
  }
  */

  tooltipTriggers = {
    [Scatter.selectors.point]: (d: DataRecord): string => {
      if (this.SelectedNodeCollapsingTypeVariable) {
        let output = `
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
        <table id="bubbleToolTip"><thead><th>${this.commonService.capitalize(this.visuals.microbeTrace.SelectedColorNodesByVariable)}</th><th> Count </th><th> % </th></thead><tbody>`
        d.counts.forEach((x) => output += `<tr><td>${x.label}</td><td> ${x.count}</td><td>${(x.count/d.totalCount*100).toFixed(1)}%</td></tr>`)
        return output + '</tbody></table>';
      } else {
        return d.id
      }
    }
  }

  x = (d: DataRecord) => d.x
  y = (d: DataRecord) => d.y
  color = (d: DataRecord) => d.color
  strokeColor = (d: DataRecord) => d.strokeColor
  sizing: (d: DataRecord) => number

  NodeCollapsingTypes: any = [
    { label: 'On', value: true },
    { label: 'Off', value: false }
  ];
  SelectedNodeCollapsingTypeVariable: boolean = false;

  constructor(injector: Injector,
    private renderer: Renderer2,
    private elem: ElementRef,
    private eventManager: EventManager,
    public commonService: CommonService,
    @Inject(BaseComponentDirective.GoldenLayoutContainerInjectionToken) private container: ComponentContainer,
    elRef: ElementRef,
    private cdref: ChangeDetectorRef
  ) {
    super(elRef.nativeElement);

    this.visuals = commonService.visuals;
    this.visuals.bubble = this;
    this.widgets = this.commonService.session.style.widgets;
  }

  ngOnInit(): void {
    
    this.selectedFieldList.push({ label: "None", value: "None"})
    this.commonService.session.data['nodeFields'].map((d) => {
      if (['seq', 'origin', '_diff', '_ambiguity', 'index', '_id'].includes(d)) return;
      this.selectedFieldList.push({
        label: this.commonService.capitalize(d.replace("_", "")),
        value: d
      });
    })

    this.xVariable = 'cluster';
    this.yVariable = 'cluster';
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
        this.goldenLayoutComponentResize();
        this.cdref.detectChanges();
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
    });
  }

  ngAfterViewInit(): void {
    try {
      setTimeout(() => this.updateViewRatio(), 10)
    } catch (error) {
      try {
        setTimeout(() => this.updateViewRatio(), 1000)
      } catch (error) {
        console.log('unable to set proper view ratio for bubble view, setting to default values');
        this.viewWidth = 800;
        this.viewHeight = 600;
      }
    }    
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
        strokeColor: node.selected ? this.commonService.session.style.widgets['selected-color']: '#000000'
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
    }
    this.updateVisibleNodes();

  }

  /**
   * updates values of visibleNodes based on SelectedNodeCollapsingTypeVariable and if timeline mode is active
   */
  updateVisibleNodes() {
    if (this.widgets["node-timeline-variable"] == 'None' && this.SelectedNodeCollapsingTypeVariable == false) {
      this.visibleData = this.allData;
    } else if (this.SelectedNodeCollapsingTypeVariable){
      if (this.commonService.getVisibleNodes().length == this.visibleData.reduce((sum, obj) => sum + obj.totalCount, 0)) { return }
      this.getCollapsedData(false, false)
    } else { 
      let visibleNodes = this.commonService.getVisibleNodes();
      if (visibleNodes.length == this.visibleData.length +2) { return }
      this.visibleData = [];
      this.visibleData.push({
        id: '',
        index: 10000,
        x: -.4,
        y: -.4,
        color: '#ffffff',
        Xgroup: -.4,
        Ygroup: -.4,
        strokeColor: '#ffffff'
      })
      this.visibleData.push({
        id: '',
        index: 10000,
        x: this.X_categories.length - .6,
        y: this.Y_categories.length - .6,
        color: '#ffffff',
        Xgroup: this.X_categories.length - .6,
        Ygroup: this.Y_categories.length -.6,
        strokeColor: '#ffffff'
      })
      this.allData.forEach(node => {
        if (visibleNodes.find(vNode => vNode._id == node.id)) {
          this.visibleData.push(node);
        }
      })
    } 
    

  }

  /**
  * Updates the value of X_categories X_tickValues based on xVariables (or those variables for Y axis)
  * @param axis 'X' or anything else defaults to 'Y' axis
  */
  updateAxisValues(axis: string) {
    let nodes = this.commonService.session.data.nodeFilteredValues;

    if (axis == 'X') {
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

    this.X_axisFormat = (tick: number) => {
      if (this.X_categories[tick] == null || this.X_categories[tick] == undefined) {
        return 'Unknown'
      } else {
        return this.X_categories[tick]
      }
    }
    this.Y_axisFormat = (tick: number) => {
      if (this.Y_categories[tick] == null || this.Y_categories[tick] == undefined) {
        return 'Unknown'
      } else {
        return this.Y_categories[tick]
      }
    }
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
          console.log(X_group, Y_group)
          let length = this.visibleData.length;
          this.visibleData.push({
            index: length,
            id: `${length}`,
            x: X_group,
            y: Y_group,
            color: this.commonService.session.style.widgets['node-color'],
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
    let gradient = this.generatePieChartsSVGDefs(changedVisibleNodes);
    let svgDef = this.elem.nativeElement.querySelector('#bubbleDefs');
    changedVisibleNodes.forEach(nodeIndex => { 
      let currentNode = svgDef.querySelector(`pattern[id='node${nodeIndex}']`)
      if (currentNode != null) currentNode.remove()
    })
    let XMLS = new XMLSerializer();
    svgDef.childNodes.forEach(cNode => gradient += XMLS.serializeToString(cNode))
    this.renderer.setProperty(svgDef, 'innerHTML', gradient)

    if (this.widgets['node-timeline-variable'] && initial) {
      // these 2 invisible nodes are to try to keep the graph frame consistent
      this.visibleData.push({
        id: '',
        index: 10000,
        x: -.4,
        y: -.4,
        color: '#ffffff',
        Xgroup: -.4,
        Ygroup: -.4,
        strokeColor: '#000000',
        counts: [],
        totalCount: 0
      })
      this.visibleData.push({
        id: '',
        index: 10000,
        x: this.X_categories.length - .6,
        y: this.Y_categories.length - .6,
        color: '#ffffff',
        Xgroup: this.X_categories.length - .6,
        Ygroup: this.Y_categories.length -.6,
        strokeColor: '#000000',
        counts: [],
        totalCount: 0
      })
    }

    this.color = (d: DataRecord) => {
      if (d.id == '' && d.index == 10000) {
        return '#ffffff'
      } else if ( d.totalCount == 1 || d.counts.length == 1) {
        return this.commonService.temp.style.nodeColorMap(d.counts[0].label)
      } else {
        return `url(#node${d.index})`
      }
    };

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
        console.log('node updated: ', node.totalCount, node.index)
        changedVisibleNodes.push(node.index)
      }
    })
    return changedVisibleNodes;
  }

  /**
   * @returns a string representing the SVG def of the patterns needed to generate the pie chart
   */
  generatePieChartsSVGDefs(changedVisibleNodes) : string {
    let patternString = '';
    changedVisibleNodes.forEach((indexNumber) => { //})
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
        patternString += `<path d='M 0 0 L ${arcStart} A 1 1 0 ${largeArcFlag} 1 ${arcEnd} L 0 0' fill=${colors[i]} />`
      }
      patternString += '</pattern>'
    })
    return patternString;
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

    this.color = (d: DataRecord) => d.color
  }

  /**
   * Calculates the position (x, y) for the array of nodes; nodes are positioned in a layers spiral/hexagonal pattern 
   */
  calculateHexagonalGridPositions(nodes: DataRecord[]) {
    const layerDistance = this.nodeSpacing * Math.sqrt(3); // Distance between layers
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
    if (this.SelectedNodeCollapsingTypeVariable) {
      this.getCollapsedData(true);
      this.sizing = (d: DataRecord) => {
        if (d.id == '') return 0;
        return this.nodeSize * Math.sqrt(d.totalCount);
      };
    } else {
      this.getData();
      this.sizing = (d: DataRecord) => {
        if (d.id == '') return 1;
        
        return this.nodeSize
      }
    }
  }

  goldenLayoutComponentResize() {    
    this.updateViewRatio()
  }

  /**
   * Updates size of the scatter plot based on number of X and Y categories and the ratio between them and the available space
   */
  updateViewRatio() {
    let count_x = this.X_categories.length;
    let count_y = this.Y_categories.length;

    let height = $('bubble-component').height() - 55 - 10
    let width = $('bubble-component').width() - 40

    // @ts-ignore
    let x_axis_height = this.x_axis.component._axisSizeBBox.height;
    // @ts-ignore
    let y_axis_width = this.y_axis.component._axisSizeBBox.width

    let ratio = Math.min((height-x_axis_height)/count_y, (width-y_axis_width)/count_x);

    this.viewHeight = Math.floor(ratio*count_y) + x_axis_height;
    this.viewWidth = Math.floor(ratio*count_x) + y_axis_width;

    this.cdref.detectChanges();
    // @ts-ignore
    this.scatterPlot.ngOnChanges(this.visibleData);
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

  onDataChange(axis: string) {
    this.updateAxisValues(axis);
    if (this.SelectedNodeCollapsingTypeVariable) {
      this.getCollapsedData(true);
    } else {
      this.getData();
    }
    this.updateViewRatio();
  }

  /**
   * Sorts this.allData chronologically based on the given sortVariable
   * @param sortVariable name of a property of commonService.session.data.nodeFilteredValues
   */
  sortData(sortVariable) {
    console.log(`sorting data by _${sortVariable}_ in bubble view`);
    let allNodes = JSON.parse(JSON.stringify(this.commonService.session.data.nodeFilteredValues));
    allNodes.sort((a, b) => new Date(a[sortVariable]).getTime() - new Date(b[sortVariable]).getTime())
    
    let allData = []
    allNodes.forEach(node => {
      allData.push(this.allData.find(dataNode => node._id == dataNode.id))      
    })

    this.allData = allData;
    this.recalculatePositions();
    this.updateVisibleNodes();
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
    this.recalculatePositions();
    // @ts-ignore
    this.scatterPlot.ngOnChanges(this.visibleData);
  }

  onNodeSizeChange() {
    if (this.SelectedNodeCollapsingTypeVariable) {
      this.sizing = (d: DataRecord) => {
        if (d.id == '') return 0;
        return this.nodeSize * Math.sqrt(d.totalCount);
      };
    } else {
      this.recalculatePositions();
      this.sizing = (d: DataRecord) => {
        if (d.id == '') return 0;
        return this.nodeSize;
      };
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
      let gradient2 = this.generatePieChartsSVGDefs(this.visibleData.map(obj => obj.index));
      let svgDef = this.elem.nativeElement.querySelector('#bubbleDefs');
      this.renderer.setProperty(svgDef, 'innerHTML', gradient2);
      this.color = (d: DataRecord) => {
        if ( d.totalCount == 0) {
          return '#ffffff'
        } else if ( d.totalCount == 1 || d.counts.length == 1) {
          return this.commonService.temp.style.nodeColorMap(d.counts[0].label)
        } else {
          return `url(#node${d.index})`
        }
      };
    } else {
      this.updateColors();
    }
  }

  updateLinkColor() {}
  updateVisualization() {}
  applyStyleFileSettings() {}
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
    this.CalculatedResolution = (Math.round(this.viewWidth * this.SelectedBubbleExportScaleVariable) + " x " + Math.round(this.viewHeight * this.SelectedBubbleExportScaleVariable) + "px");
  }

  /**
   * Updates CalculatedResolution variable to string such as '1250 x 855px' based on ImageDimensions and SelectedNetworkExportScaleVariable. 
   * This is called anytime SelectedNetworkExportScaleVariable is updated.
   */
  updateCalculatedResolution() {
    this.CalculatedResolution = (Math.round(this.viewWidth * this.SelectedBubbleExportScaleVariable) + " x " + Math.round(this.viewHeight * this.SelectedBubbleExportScaleVariable) + "px");
    this.cdref.detectChanges();
  }

  exportVisualization() {
    let svg = $('#bubbleViewContainer svg')[0]
    if (this.BubbleExportFileType == 'svg') {
      let textElements = svg.querySelectorAll('text');
      textElements.forEach(text => { text.setAttribute('fill', 'black');});

      let svgString = this.commonService.unparseSVG(svg);
      let content;
      if (this.SelectedNodeCollapsingTypeVariable) {
        let svgDef = this.commonService.unparseSVG($('#bubbleDefs')[0])
        content = svgString.slice(0, -6) + svgDef + svgString.slice(-6);
      } else {
        content = svgString;
      }
      let blob = new Blob([content], { type: 'image/svg+xml;charset=utf-8' });
      saveAs(blob, this.BubbleExportFileName + '.' + this.BubbleExportFileType);
    } else {
      saveSvgAsPng(svg, this.BubbleExportFileName + '.' + this.BubbleExportFileType, {
          scale: this.SelectedBubbleExportScaleVariable,
          backgroundColor: "#ffffff",
          encoderType: 'image/' + this.BubbleExportFileType,
          //encoderOptions: this.SelectedNetworkExportQualityVariable
      });
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
