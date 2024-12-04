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
 
// import { XYContainer, Scatter, Axis } from '@unovis/ts'

type DataRecord = { index: number, id: string, x: number; y: number, color: string, Xgroup: number, Ygroup: number, strokeColor: string, totalCount?: number, counts ?: any }//selected: boolean }

@Component({
  selector: 'bubble-component',
  templateUrl: './bubble.component.html',
  styleUrls: ['./bubble.component.scss']
})
export class BubbleComponent extends BaseComponentDirective implements OnInit, MicobeTraceNextPluginEvents {

  @Output() DisplayGlobalSettingsDialogEvent = new EventEmitter();
  // @ViewChild('scatter') scatterPlot: Scatter<Object>;
  // @ViewChild('x_axis') x_axis: Axis<DataRecord>;
  // @ViewChild('y_axis') y_axis: Axis<DataRecord>;
  
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

  data: DataRecord[] = [];
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

  // tooltipTriggers = {
  //   [Scatter.selectors.point]: (d: DataRecord): string => {
  //     if (this.SelectedNodeCollapsingTypeVariable) {
  //       let output = `
  //       <style>
  //         #bubbleToolTip {
  //           border-spacing: 0;
  //           width: 100%;
  //           //border: 1px solid #ddd;
  //           z-index: 1000;
  //         }

  //         #bubbleToolTip td, #bubbleToolTip th {
  //           text-align: center;
  //           padding: 2px;
  //           font-weight: 400;
  //           border: 1px solid #ddd;
  //         }

  //         #bubbleToolTip tr:nth-child(even) {
  //           background-color: #f2f2f2;
  //         }

  //         #bubbleToolTip tr:nth-child(odd) {
  //           background-color: #fff;
  //         } 
  //       </style>
  //       <table id="bubbleToolTip"><thead><th>${this.commonService.capitalize(this.visuals.microbeTrace.SelectedColorNodesByVariable)}</th><th> Count </th><th> % </th></thead><tbody>`
  //       d.counts.forEach((x) => output += `<tr><td>${x.label}</td><td> ${x.count}</td><td>${(x.count/d.totalCount*100).toFixed(1)}%</td></tr>`)
  //       return output + '</tbody></table>';
  //     } else {
  //       return d.id
  //     }
  //   }
  // }

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
    this.data = [];
    this.X_categories = [];
    this.Y_categories = [];
  
    let nodes = this.commonService.getVisibleNodes()
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
        if (locX == -1) {
          this.X_categories.push(nodeX);
          locX = this.X_categories.length - 1;
        }
        nodeDR.Xgroup = locX;
      }
      if (this.yVariable != undefined || this.yVariable != 'None') {
        let nodeY = node[this.yVariable];
        let locY = this.Y_categories.indexOf(nodeY);
        if (locY == -1) {
          this.Y_categories.push(nodeY);
          locY = this.Y_categories.length - 1;
        }
        nodeDR.Ygroup = locY;
      }

      this.data.push(nodeDR)
    })
    this.updateAxes();
    this.updateColors();
  }

  /**
   * Updates axis tickValues (X_tickValues & Y_tickValues) and positions for each node
   */
  updateAxes() {
    
    this.X_tickValues = [];
    this.Y_tickValues = []
    if (this.xVariable == undefined || this.xVariable == 'None' || this.X_categories.length == 1) {
      this.X_tickValues.push(0);
    } else {
      for (let i=0; i< this.X_categories.length; i++) {
        this.X_tickValues.push(i)
      }
    }
    if (this.yVariable == undefined || this.yVariable == 'None' || this.Y_categories.length == 1) {
      this.Y_tickValues.push(0);
    } else {
      for (let i=0; i< this.Y_categories.length; i++) {
        this.Y_tickValues.push(i)
      }
    }

    this.X_tickValues.forEach(xLoc => {
      this.Y_tickValues.forEach(yLoc => {
        let filteredNodes = this.data.filter(node => node.Xgroup == xLoc && node.Ygroup == yLoc)
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
   * Updates this.data so that each node represents a multiple datapoints instead of a single data point;
   * Also updates color/pattern of nodes so that they are pie charts based on proportion of each datapoint's color
   */
  getCollapsedData() {
    this.data = [];
    this.X_categories = [];
    this.Y_categories = [];
  
    let nodes = this.commonService.getVisibleNodes()
    nodes.forEach(node => {
      let X_group = 0, Y_group = 0;

      if (this.xVariable != undefined || this.xVariable != 'None') {
        let nodeX = node[this.xVariable];
        let locX = this.X_categories.indexOf(nodeX);
        if (locX == -1) {
          this.X_categories.push(nodeX);
          locX = this.X_categories.length - 1;
        }
        X_group = locX;
      }
      if (this.yVariable != undefined || this.yVariable != 'None') {
        let nodeY = node[this.yVariable];
        let locY = this.Y_categories.indexOf(nodeY);
        if (locY == -1) {
          this.Y_categories.push(nodeY);
          locY = this.Y_categories.length - 1;
        }
        Y_group = locY;
      }

      let index = this.data.findIndex((node) => node.Xgroup==X_group && node.Ygroup==Y_group)
      if (index == -1) {
        let length = this.data.length;
        this.data.push({
          index: length,
          id: `${length}`,
          x: X_group,
          y: Y_group,
          color: this.commonService.session.style.widgets['node-color'],
          Xgroup: X_group,
          Ygroup: Y_group,
          strokeColor: '#000000',
          totalCount: 1
        })
      } else {
        this.data[index].totalCount += 1
      }

    })

    this.generateCollapsedCounts();
    let gradient = this.generatePieChartsSVGDefs();
    let svgDef = this.elem.nativeElement.querySelector('#bubbleDefs');
    this.renderer.setProperty(svgDef, 'innerHTML', gradient);

    this.color = (d: DataRecord) => {
      if ( d.totalCount == 1 || d.counts.length == 1) {
        return this.commonService.temp.style.nodeColorMap(d.counts[0].label)
      } else {
        return `url(#node${d.index})`
      }
    };

    this.updateAxes();
  }

  /**
   * Update the values for counts for each node in this.data (relevant when nodes are collapsed). These values are used when creating a pie
   * chart of each collapsed node.
   */
  generateCollapsedCounts() {
    let fullNodes = this.commonService.getVisibleNodes();
    let colorCategory = this.commonService.session.style.widgets['node-color-variable']

    this.data.forEach(node => {
      let X = this.X_categories[node.Xgroup]
      let Y = this.Y_categories[node.Ygroup]
      
      let currentNodes = fullNodes.filter(fNode => fNode[this.xVariable] == X && fNode[this.yVariable]==Y) 
      node.counts = [];
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
      })
    })
  }

  /**
   * @returns a string representing the SVG def of the pattern needed to generate the pie chart
   */
  generatePieChartsSVGDefs() : string {
    let patternString = '';
    this.data.forEach((node, ind) => {

    if (node.totalCount == 1 || node.counts.length == 1) {
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

    patternString += `<pattern id='node${ind}' viewBox='-1 -1 2 2' style='transform: rotate(-.25turn)' width='100%' height='100%'>` ;
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

  updateColors() {
    let fillcolor = this.commonService.session.style.widgets['node-color']
    let colorVariable = this.commonService.session.style.widgets['node-color-variable']

    let fullNodes = this.commonService.getVisibleNodes();

    this.data.forEach(node => {
      let currentFullNode = fullNodes[node.index];
      node.color = colorVariable == 'None' ? fillcolor : this.commonService.temp.style.nodeColorMap(currentFullNode[colorVariable]);
    })

    this.color = (d: DataRecord) => d.color
  }

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
      this.getCollapsedData();
      this.sizing = (d: DataRecord) => {
        return this.nodeSize * Math.sqrt(d.totalCount);
      };
    } else {
      this.getData();
      this.sizing = (d: DataRecord) => {
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
    this.scatterPlot.ngOnChanges(this.data);
  }

  setSelectedNodes(that) {
    if (that.commonService.visuals.bubble.SelectedNodeCollapsingTypeVariable) {
      return;
    }
    let nodes = that.commonService.getVisibleNodes()
    nodes.forEach(node => {
      let datum = that.data.find(datum => datum.index == node.index)
      if (node.selected) console.log('found: ', datum)

      datum.strokeColor = node.selected ? this.commonService.session.style.widgets['selected-color']: '#000000';
    })
    that.strokeColor = (d: DataRecord) => d.strokeColor;
  }

  onDataChange() {
    if (this.SelectedNodeCollapsingTypeVariable) {
      this.getCollapsedData();
    } else {
      this.getData();
    }
    this.updateViewRatio();
  }

  recalculatePositions() {
    this.X_tickValues.forEach(xLoc => {
      this.Y_tickValues.forEach(yLoc => {
        let filteredNodes = this.data.filter(node => node.Xgroup == xLoc && node.Ygroup == yLoc)
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
    this.scatterPlot.ngOnChanges(this.data);
  }

  onNodeSizeChange() {
    if (this.SelectedNodeCollapsingTypeVariable) {
      this.sizing = (d: DataRecord) => {
        return this.nodeSize * Math.sqrt(d.totalCount);
      };
    } else {
      this.recalculatePositions();
      this.sizing = (d: DataRecord) => {
        return this.nodeSize;
      };
    }
  }

  /**
  * Opens Global Setting Dialog
  */
  showGlobalSettings() {
    //console.log("threshold: ",  this.commonService.GlobalSettingsModel.SelectedLinkThresholdVariable);
    this.DisplayGlobalSettingsDialogEvent.emit("Styling");
  }

  updateNodeColors() {
    if (this.SelectedNodeCollapsingTypeVariable) {
      this.generateCollapsedCounts();
      let gradient2 = this.generatePieChartsSVGDefs();
      let svgDef = this.elem.nativeElement.querySelector('#bubbleDefs');
      this.renderer.setProperty(svgDef, 'innerHTML', gradient2);
      this.color = (d: DataRecord) => {
        if ( d.totalCount == 1 || d.counts.length == 1) {
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
  updateVisualization() {
  }
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
