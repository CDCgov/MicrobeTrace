import { ChangeDetectorRef, Component, ElementRef, Inject, OnInit, Output, EventEmitter, ViewChild, OnDestroy } from '@angular/core';
import { SelectItem } from 'primeng/api';
import { saveAs } from 'file-saver';
import { GoogleTagManagerService } from 'angular-google-tag-manager';

import { BaseComponentDirective } from '@app/base-component.directive';
import { CommonService } from '@app/contactTraceCommonServices/common.service';
import { MicobeTraceNextPluginEvents } from '@app/helperClasses/interfaces';
import { MicrobeTraceNextVisuals } from '@app/microbe-trace-next-plugin-visuals';
import { ComponentContainer } from 'golden-layout';
import cytoscape, { Core } from 'cytoscape';
import svg from 'cytoscape-svg';
import { ExportService, ExportOptions } from '@app/contactTraceCommonServices/export.service';
import { Subject, Subscription, takeUntil } from 'rxjs';
import { CommonStoreService } from '@app/contactTraceCommonServices/common-store.services';
import { getMixedNodeShapeDataUri, MIXED_NODE_STRIPE_BAND_WIDTH_PX } from '@app/contactTraceCommonServices/node-shapes';
import { buildPieChartPatternDef, buildPieChartSlicesWithSegmentedFills, buildPieChartSvgDataUri, hasCompositePieChartFill, PieChartSlice } from '@app/contactTraceCommonServices/pie-chart-utils';
import { NodeFillStyle } from '@app/contactTraceCommonServices/color-mapping.service';
import { createGlobalSettingsDialogRequest, GlobalSettingsDialogRequest } from '@app/helperClasses/globalSettingsDialogRequest';
import {
  getBubbleCollapseGroupKey,
  groupVisibleNodesByBubbleAxes
} from './bubble-collapse-utils';

type DataRecord = { index: number, id: string, x: number; y: number, color: string, opacity: number, Xgroup: number, Ygroup: number, strokeColor: string, totalCount?: number, counts ?: any, mixedColorImage?: string }//selected: boolean }

type BubblePieExportSlice = {
  label: string;
  count: number;
  color: string;
  opacity: number;
  fraction: number;
  segments?: Array<{ color: string; alpha?: number; weight?: number }>;
};

interface BubblePieSvgExportReplacement {
  borderWidth: number;
  nodeId: string;
  totalCount: number;
  exportHeight: number;
  exportWidth: number;
  exportX: number;
  exportY: number;
  slices: BubblePieExportSlice[];
}

interface BubbleMixedSvgExportReplacement {
  exportHeight: number;
  exportWidth: number;
  exportX: number;
  exportY: number;
  segments: Array<{ color: string; alpha?: number; weight?: number }>;
}

@Component({
    selector: 'bubble-component',
    templateUrl: './bubble.component.html',
    styleUrls: ['./bubble.component.scss'],
    standalone: false
})
export class BubbleComponent extends BaseComponentDirective implements OnInit, MicobeTraceNextPluginEvents, OnDestroy {

  @Output() DisplayGlobalSettingsDialogEvent = new EventEmitter<GlobalSettingsDialogRequest>();

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
  xVarDate: boolean = false;
  yVarDate: boolean = false;
  nodeSize: number;
  nodeSpacing = 0.05;
  labelSize: number = 12;

  allData: DataRecord[] = [];
  visibleData: DataRecord[] = [];

  X_categories: string[] = []
  X_tickValues = []

  Y_categories: string[] = []
  Y_tickValues = []

  scaleFactor: number = 200;
  svgDefs: {} = {};

  OnOffTypes: any = [
    { label: 'On', value: true },
    { label: 'Off', value: false }
  ];
  SelectedNodeCollapsingTypeVariable: boolean;

  private suppressCySelectionEvents: boolean = false;

  private destroy$ = new Subject<void>();

  constructor(
    public commonService: CommonService,
    @Inject(BaseComponentDirective.GoldenLayoutContainerInjectionToken) private container: ComponentContainer,
    elRef: ElementRef,
    private cdref: ChangeDetectorRef,
    private gtmService: GoogleTagManagerService,
    private store: CommonStoreService,
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
    
    this.rebuildSelectedFieldList();

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
        this.syncFromSessionState();
        setTimeout(() => {
          this.goldenLayoutComponentResize();
        }, 5)

    })
    
    let that = this;
    $(document).on("node-selected", function() {
      if (that.viewActive && that.cy) {
        that.visuals.bubble.setSelectedNodes(that);
      }
    });

    this.store.clusterUpdate$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      if (this.widgets['node-color-variable'] == 'cluster') {
        this.updateNodeColors();
      }
      if (this.xVariable == "cluster") {
        this.onDataChange('X');
      }
      if (this.yVariable == "cluster") {
        this.onDataChange('Y');
      }
    })

    this.store.styleFileApplied$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.syncFromSessionState();
    });

    this.store.networkUpdated$.pipe(takeUntil(this.destroy$)).subscribe((networkUpdated) => {
      if (this.viewActive && networkUpdated) {
        this.syncFromSessionState();
        this.store.setNetworkUpdated(false);
      }
    });

    $( document ).on( "node-visibility", function( ) {
      //console.log('node visi event')
      that.updateVisibleNodes()
      if (!that.SelectedNodeCollapsingTypeVariable) {
        that.updateNodes();
      }
    });
  }

  ngAfterViewInit(): void {
    this.generateCytoscape();
    if (this.SelectedNodeCollapsingTypeVariable) {
      this.refreshCollapsedData();
    }
    this.markBubbleRendered();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();

    if (this.cy){
        this.cy.removeAllListeners();
        this.cy.destroy();
    }
    this.cyContainer = null;
  }

  private rebuildSelectedFieldList() {
    this.selectedFieldList = [{ label: "None", value: "None"}];

    this.commonService.session.data['nodeFields'].forEach((field) => {
      if (['seq', 'origin', '_diff', '_ambiguity', 'index', '_id'].includes(field)) return;
      this.selectedFieldList.push({
        label: this.commonService.capitalize(field.replace("_", "")),
        value: field
      });
    });
  }

  private refreshCollapsedData(sortData = false) {
    this.hideTooltip();
    // Cluster membership and other computed axis values can change while the
    // view is open. Refresh both category lists before rebuilding aggregates.
    this.updateAxisValues('X');
    this.updateAxisValues('Y');
    this.visibleData = [];
    this.svgDefs = {};
    this.getCollapsedData(sortData, true);
  }

  private markBubbleRendered(): void {
    if (!this.viewActive) {
      return;
    }

    // Bubble can be the first launched view, so it must explicitly release
    // the shared processing modal after its first Cytoscape draw completes.
    window.setTimeout(() => {
      this.store.setNetworkRendered(true);
    }, 0);
  }

  private compareDateCategories(left: unknown, right: unknown): number {
    const leftTime = Date.parse(left as string);
    const rightTime = Date.parse(right as string);
    const leftValid = !Number.isNaN(leftTime);
    const rightValid = !Number.isNaN(rightTime);

    if (leftValid && rightValid) {
      return leftTime - rightTime;
    }

    if (leftValid) {
      return -1;
    }

    if (rightValid) {
      return 1;
    }

    // Preserve insertion order between invalid/missing buckets.
    return 0;
  }

  private syncFromSessionState() {
    this.visuals.bubble = this;
    this.widgets = this.commonService.session.style.widgets;
    this.rebuildSelectedFieldList();
    this.setWidgets();
    this.updateAxisValues('X');
    this.updateAxisValues('Y');
    this.svgDefs = {};
    this.getData();

    if (!this.cy) {
      return;
    }

    if (!this.SelectedNodeCollapsingTypeVariable) {
      this.updateNodes();
    }

    this.onNodeSizeChange();
    this.setSelectedNodes(this);
  }

  setWidgets() {
    if (this.widgets['bubble-x'] == undefined || !(this.selectedFieldList.map(x=> x.value).includes(this.widgets['bubble-x']))) {
      this.xVariable = 'cluster';
      this.widgets['bubble-x'] = this.xVariable;
    } else {
      this.xVariable = this.widgets['bubble-x'];
    }

    if (this.widgets['bubble-y'] == undefined || !(this.selectedFieldList.map(x=> x.value).includes(this.widgets['bubble-y']))) {
      this.yVariable = 'None';
      this.widgets['bubble-y'] = this.yVariable;
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
      const nodeData: any = {
        id: node.id,
        nodeSize: size,
        nodeColor: node.color,
        nodeOpacity: node.opacity,
        label: node.id,
        counts: node.counts,
        totalCount: node.totalCount,
      };
      if (node.mixedColorImage) {
        nodeData.mixedColorImage = node.mixedColorImage;
      }
      // probably do something here for node size
      return {
        data: nodeData,
        position: {
          x: node.x*this.scaleFactor,
          y: node.y*this.scaleFactor
        }
      }
    })

    return { nodes: nodes, edges: null }
  }

  estimateSize(text: string) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = `${this.labelSize}px Helvetica Neue`;
    const metrics = ctx.measureText(text);

    return metrics.width;
  }

  AddAxes() {
    let Axes = [];
    if ( this.xVariable != 'None') {
      this.X_categories.forEach((value, i) => {
        let label;
        if (this.xVarDate) {
          label = new Date(Date.parse(value)).toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: '2-digit', 
            day: '2-digit' 
          });
          if (label == 'Invalid Date') {
            label = 'Unknown'
          }
        } else {
          label = value== null || value == undefined ? 'Unknown': value;
        }
        Axes.push(
          {group: 'nodes', data: {id: `x_axis${i}`, label: label}, position: {x: i*this.scaleFactor, y: this.Y_categories.length*this.scaleFactor-50}, classes: ['X_axis'],
        })
      })

      Axes.push({ group: 'nodes', data: {id: 'x_axis_Label', label: this.commonService.capitalize(this.xVariable)}, position: {x: (this.X_categories.length-1)*this.scaleFactor/2, y: this.Y_categories.length*this.scaleFactor}, classes: ['X_axis', 'axisLabel']})
    }

    let longestYLabel: string = '';
    if ( this.yVariable != 'None') {
      this.Y_categories.forEach((value, i) => {
        let label;
        if (this.yVarDate) {
          label = new Date(Date.parse(value)).toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: '2-digit', 
            day: '2-digit' 
          });
          if (label == 'Invalid Date') {
            label = 'Unknown'
          }
        } else {
          label = value== null || value == undefined ? 'Unknown': value;
        }
        if (label.length > longestYLabel.length) longestYLabel = label
        Axes.push(
          {group: 'nodes', data: {id: `y_axis${i}`, label: label}, position: {x: -80, y: i*this.scaleFactor}, classes: ['Y_axis'],
        })
      });
      let yAxisLabelOffset = this.estimateSize(longestYLabel) + 20

      Axes.push({ group: 'nodes', data: {id: 'y_axis_Label', label: this.commonService.capitalize(this.yVariable)}, position: {x: -(80+yAxisLabelOffset), y: (this.Y_categories.length-1)*this.scaleFactor/2}, classes: ['Y_axis', 'axisLabel']})

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
            'background-color': 'data(nodeColor)',
            // @ts-ignore
            'background-opacity': 'data(nodeOpacity)'
        }
      },
      {
        selector: 'node[mixedColorImage]',
        css: {
          'background-color': 'transparent',
          'background-opacity': 0,
          'background-image': 'data(mixedColorImage)',
          'background-fit': 'cover',
          'background-clip': 'node',
          'background-repeat': 'no-repeat',
          'background-image-opacity': 1,
        }
      },
      {
        selector: '.X_axis',
        css: {
          'label': 'data(label)',
          'shape': 'rectangle',
          'font-size' : this.labelSize,
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
          'font-size' : this.labelSize,
          'border-width': 0,
          'background-color': 'white',
          'width': 1,
          'height': 1,
          'text-valign': 'center',
          'text-halign': 'left'
        }
      },
      {
        selector: '#y_axis_Label',
        css: {
          'text-rotation': 4.71239,
          'text-halign': 'center',
          'text-valign': 'top'
        }
      },
      {
        selector: '.axisLabel',
        css: {
          'font-size': this.labelSize + 4
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
      userZoomingEnabled: true,
      panningEnabled: true,
      userPanningEnabled: true,
    });
  
    this.AddAxes();
    this.cy.nodes().lock();
  
    // --- NEW: Bubble <-> global selection sync (Bubble -> session -> other views) ---
    this.cy.on('select', 'node', (evt) => {
      if (this.suppressCySelectionEvents) return;
  
      const ele = evt.target;
      if (ele.classes().length > 0) return; // ignore axis/label nodes
      if (this.SelectedNodeCollapsingTypeVariable) return;
  
      const id = ele.id();
  
      // Update shared session selection
      this.commonService.session.data.nodes
        .filter((n) => n._id === id)
        .forEach((n) => (n.selected = true));
  
      this.commonService.session.data.nodeFilteredValues
        .filter((n) => n._id === id)
        .forEach((n) => (n.selected = true));
  
      // Broadcast to other views (Table/2D/etc)
      $(document).trigger('node-selected');
    });
  
    this.cy.on('unselect', 'node', (evt) => {
      if (this.suppressCySelectionEvents) return;
  
      const ele = evt.target;
      if (ele.classes().length > 0) return; // ignore axis/label nodes
      if (this.SelectedNodeCollapsingTypeVariable) return;
  
      const id = ele.id();
  
      // Update shared session selection
      this.commonService.session.data.nodes
        .filter((n) => n._id === id)
        .forEach((n) => (n.selected = false));
  
      this.commonService.session.data.nodeFilteredValues
        .filter((n) => n._id === id)
        .forEach((n) => (n.selected = false));
  
      // Broadcast to other views (Table/2D/etc)
      $(document).trigger('node-selected');
    });
  
    // --- NEW: initial sync (session -> bubble) ---
    this.syncCySelectionFromSession();
  
    // Existing hover events
    this.cy.on('mouseover', 'node', (evt: any, pos?) => {
      const rp = evt.renderedPosition || pos;
      const node = evt.target;
      if (node.classes().length > 0) return;
      this.showTooltip(node.data(), rp);
    });
  
    this.cy.on('mouseout', 'node', () => {
      this.hideTooltip();
    });
  }
  

  showTooltip(d, pos) {
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
      d.counts.forEach((x) => tooltipHTML += `<tr><td>${this.commonService.titleize(x.label)}</td><td> ${x.count}</td><td>${(x.count/d.totalCount*100).toFixed(1)}%</td></tr>`)
      tooltipHTML += `<tr><td>Total</td><td> ${d.totalCount}</td><td></td></tr></tbody></table>`;
    } else {
      tooltipHTML = `${d.id}`
    }
    let [X, Y] = [pos.x, pos.y];
    
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
    const tooltipElement = this.toolTip?.nativeElement;
    if (!tooltipElement) {
      return;
    }

    Object.assign(tooltipElement.style, {
      transition: 'opacity 100ms',
      opacity: 0
    })
    tooltipElement.addEventListener('transitionend', () => {
      tooltipElement.style.zIndex = '-1'
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
        opacity: 1,
        Xgroup: 0,
        Ygroup: 0,
        strokeColor: node.selected ? this.commonService.session.style.widgets['selected-color']: '#000000',
        totalCount: 1
      }
      if (this.xVariable != undefined && this.xVariable != 'None') {
        let nodeX = node[this.xVariable];
        let locX = this.X_categories.indexOf(nodeX);
        nodeDR.Xgroup = locX;
      }
      if (this.yVariable != undefined && this.yVariable != 'None') {
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
    if (this.SelectedNodeCollapsingTypeVariable == false) {
      const visibleNodeIds = new Set(
        this.commonService.getVisibleNodes().map(node => String(node._id ?? node.id))
      );

      this.visibleData = this.allData.filter(node => visibleNodeIds.has(String(node.id)));
    // if no timeline and collapse
    } else if (this.widgets["node-timeline-variable"] == 'None'){
      // console.log(this.commonService.getVisibleNodes().length, this.visibleData.reduce((sum, obj) => sum + obj.totalCount, 0))
      this.refreshCollapsedData(false)
    // if timeline and collapse
    } else {
      this.refreshCollapsedData(false);
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
      } else {
        this.X_categories = [];
        this.X_tickValues = [];
  
        nodes.forEach(node => {
          let nodeX = node[this.xVariable];
          if (this.X_categories.indexOf(nodeX) == -1) {
            this.X_tickValues.push(this.X_categories.length);
            this.X_categories.push(nodeX);
          }
        })

        if (this.xVarDate) {
          this.X_categories.sort((a, b) => this.compareDateCategories(a, b))
        }
      }
    } else { // axis == 'Y'
      this.widgets['bubble-y'] = this.yVariable;
      if ( this.yVariable == 'None' || this.yVariable == undefined) {
        this.Y_categories = [ undefined ];
        this.Y_tickValues = [ 0 ];
      } else {
        this.Y_categories = [];
        this.Y_tickValues = [];

        nodes.forEach(node => {
          let nodeY = node[this.yVariable];
          if (this.Y_categories.indexOf(nodeY) == -1) {
            this.Y_tickValues.push(this.Y_categories.length);
            this.Y_categories.push(nodeY);
          }
        })

        if (this.yVarDate) {
          this.Y_categories.sort((a, b) => this.compareDateCategories(a, b))
        }
      }
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
      const groups = groupVisibleNodesByBubbleAxes(
        this.commonService.getVisibleNodes(),
        this.xVariable,
        this.yVariable,
        this.X_categories,
        this.Y_categories
      );

      this.visibleData = groups.map((group, index) => {
        const nodeStyle = this.commonService.getNodeFillStyle(group.nodes[0]);
        return {
          index,
          id: `cNode${index}`,
          x: group.Xgroup,
          y: group.Ygroup,
          color: nodeStyle.color,
          opacity: nodeStyle.alpha,
          Xgroup: group.Xgroup,
          Ygroup: group.Ygroup,
          strokeColor: '#000000',
          totalCount: 0,
          counts: []
        };
      });

    }

    let changedVisibleNodes = this.generateCollapsedCounts();
    this.generatePieChartsSVGDefs(changedVisibleNodes);

    // Bubble can load in collapsed mode before Cytoscape is initialized.
    // Build the aggregate state now and apply the pie styling once `cy` exists.
    if (!this.cy) {
      return;
    }

    this.cy.remove('node');
    this.updateNodes();

    this.cy.style().resetToDefault();
    this.cy.style(this.getCytoscapeStyle())
    this.visibleData.forEach((node) => {
      if (this.hasCollapsedBubblePie(node)) {
        this.applyCollapsedBubblePieStyle(node);
      }
    })
    this.cy.style().update();

    this.updateAxes();
  }

  onLabelSizeChange() {
    let longestYLabel: string = '';
    this.cy.$('.X_axis').forEach((ele) => {
      ele.style({ 'font-size' : this.labelSize})
    })
    this.cy.$('.axisLabel').forEach((ele) => {
      ele.style({ 'font-size' : this.labelSize+4})
    })
    this.cy.$('.Y_axis').forEach((ele) => {
      if (ele.data().id == 'y_axis_Label') return;
      let label = ele.data().label

      if (label.length > longestYLabel.length) longestYLabel = label
      ele.style({ 'font-size' : this.labelSize})
    })
    let yAxisLabelOffset = this.estimateSize(longestYLabel) +20;

    let node = this.cy.getElementById('y_axis_Label')
    node.unlock();
    let y = node.position('y')
    let newXPos = -80 - yAxisLabelOffset;
    node.position({'x': newXPos, 'y': y});
    node.lock();
  }

  /**
   * Update the values for counts for each node in this.visibleData (relevant when nodes are collapsed). These values are used when creating a pie
   * chart of each collapsed node.
   * @returns an array of indexes of visibleData that was changed
   */
  generateCollapsedCounts() {
    const groupedNodes = groupVisibleNodesByBubbleAxes(
      this.commonService.getVisibleNodes(),
      this.xVariable,
      this.yVariable,
      this.X_categories,
      this.Y_categories
    );
    const nodesByGroup = new Map(
      groupedNodes.map(group => [
        getBubbleCollapseGroupKey(group.Xgroup, group.Ygroup),
        group.nodes
      ])
    );
    const colorCategory = this.commonService.session.style.widgets['node-color-variable'];
    const changedVisibleNodes = [];

    this.visibleData.forEach(node => {
      if (node.id == '' && node.index == 1000) {
        node.counts = { label: '', count: 0}
        return;
      }
      const currentNodes = nodesByGroup.get(
        getBubbleCollapseGroupKey(node.Xgroup, node.Ygroup)
      ) || [];
      const previousCounts = JSON.stringify(node.counts || []);
      node.counts = [];
      const previousTotal = node.totalCount;
      node.totalCount = 0;
      currentNodes.forEach(cNode => {
        const currentCategory = colorCategory === 'None'
          ? 'All Nodes'
          : this.commonService.normalizeNodeStyleCategoryValue(cNode[colorCategory]);
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
      if (previousTotal != node.totalCount || previousCounts !== JSON.stringify(node.counts)) {
        //console.log('node updated: ', node.totalCount, node.index)
        changedVisibleNodes.push(node.index)
      }
    })
    return changedVisibleNodes;
  }

  private getNodeFillStyleForColorValue(value: any): NodeFillStyle {
    const colorVariable = this.commonService.session.style.widgets['node-color-variable'];
    const syntheticNode = colorVariable === 'None' ? undefined : { [colorVariable]: value };
    return this.commonService.getNodeFillStyle(syntheticNode);
  }

  private getMixedColorNodeImage(nodeData: any, fillColor: string, fillOpacity: number): string | undefined {
    const segments = this.commonService.getNodeFillStyle(nodeData).segments;
    if (!Array.isArray(segments) || segments.length < 2) {
      return undefined;
    }

    return getMixedNodeShapeDataUri(
      'ellipse',
      fillColor,
      '#000000',
      1,
      fillOpacity,
      segments,
      null,
      { fillCanvas: true, includeStroke: false, renderedSize: this.nodeSize }
    );
  }

  private getSourceNodeForDataRecord(
    dataNode: Pick<DataRecord, 'id'>,
    sourceNodes: any[] = this.commonService.session.data.nodeFilteredValues
  ): any | undefined {
    const dataNodeId = String(dataNode?.id ?? '');
    return sourceNodes.find(node => String(node?._id ?? node?.id ?? '') === dataNodeId);
  }

  private getPieSlicesForCollapsedBubbleNode(node: DataRecord): PieChartSlice[] {
    const counts = Array.isArray(node.counts) ? node.counts : [];
    return buildPieChartSlicesWithSegmentedFills(
      counts,
      label => this.getNodeFillStyleForColorValue(label)
    );
  }

  private hasCollapsedBubblePie(node: DataRecord): boolean {
    return hasCompositePieChartFill(this.getPieSlicesForCollapsedBubbleNode(node));
  }

  private getCollapsedBubblePieDataUri(node: DataRecord, patternId: string): string {
    const size = this.nodeSize * Math.sqrt(Math.max(1, Number(node.totalCount) || 1));
    return buildPieChartSvgDataUri(patternId, size, this.getPieSlicesForCollapsedBubbleNode(node));
  }

  private getCollapsedBubblePatternId(node: DataRecord): string {
    return `bubble-${String(node.id || node.index).replace(/[^A-Za-z0-9_-]/g, '-')}`;
  }

  private applyCollapsedBubblePieStyle(node: DataRecord): void {
    const renderedNode = this.cy?.getElementById(String(node.id));
    if (!renderedNode || renderedNode.empty()) {
      return;
    }

    const b64 = this.getCollapsedBubblePieDataUri(node, this.getCollapsedBubblePatternId(node));
    renderedNode.style({
      'background-color': 'transparent',
      'background-opacity': 0,
      'background-fit': 'cover',
      'background-image': b64
    });
  }

  /**
   * @returns a string representing the SVG def of the patterns needed to generate the pie chart
   */
  generatePieChartsSVGDefs(changedVisibleNodes) : void {
    changedVisibleNodes.forEach((indexNumber) => {
      let node = this.visibleData.find(vNode => vNode.index == indexNumber);

      if (node == undefined) {
        return;
      }

      const slices = this.getPieSlicesForCollapsedBubbleNode(node);
      if (!hasCompositePieChartFill(slices)) {
        return;
      }
      const stablePatternId = this.getCollapsedBubblePatternId(node);
      const size = this.nodeSize * Math.sqrt(Math.max(1, Number(node.totalCount) || 1));
      this.svgDefs[stablePatternId] = buildPieChartPatternDef(stablePatternId, slices, size);
      this.svgDefs[`node${indexNumber}`] = buildPieChartPatternDef(`node${indexNumber}`, slices, size);
    })
  }

  /**
   * Updates the color of the nodes in allData
   */
  updateColors() {
    let fullNodes = this.commonService.session.data.nodeFilteredValues;

    this.allData.forEach(node => {
      let currentFullNode = this.getSourceNodeForDataRecord(node, fullNodes);
      if (!currentFullNode) {
        return;
      }
      const nodeStyle = this.commonService.getNodeFillStyle(currentFullNode);
      node.color = nodeStyle.color;
      node.opacity = nodeStyle.alpha;
      node.mixedColorImage = this.getMixedColorNodeImage(currentFullNode, nodeStyle.color, nodeStyle.alpha);
    })

    if (this.cy && this.cy.nodes().length > 0) {
      this.cy.nodes().forEach(node => {
        if (node.classes().length > 0) return;
        let currentNode = this.allData.find(dataNode => dataNode.id == node.id());
        if (!currentNode) return;
        node.data('nodeColor', currentNode.color);
        node.data('nodeOpacity', currentNode.opacity);
        if (currentNode.mixedColorImage) {
          node.data('mixedColorImage', currentNode.mixedColorImage);
        } else {
          node.removeData('mixedColorImage');
        }
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
      this.refreshCollapsedData(true);
    } else {
      this.hideTooltip();
      // Cluster membership and category order can change in another view while
      // Bubble is collapsed. Rebuild both axes before restoring individual
      // nodes so their group indexes and positions use the current categories.
      this.updateAxisValues('X');
      this.updateAxisValues('Y');
      this.cy.remove('node');
      this.getData();
      this.updateNodes();
    }
  }

  goldenLayoutComponentResize() {    
    this.viewHeight = this.container.height - 73;
    this.viewWidth = this.container.width - 42;
    this.cdref.detectChanges()
    setTimeout(() => {
      this.cy.fit(this.cy.nodes(), 30);
      this.onLabelSizeChange()
    }, 200);
  }

  setSelectedNodes(that) {
    if (!that.cy) return;
  
    // If collapsed, bubble nodes are aggregates, so node-level selection doesn't map cleanly.
    if (that.commonService.visuals.bubble.SelectedNodeCollapsingTypeVariable) {
      return;
    }
  
    // Sync Cytoscape selection state from shared session state.
    that.syncCySelectionFromSession();
  }
  

  private syncCySelectionFromSession() {
    if (!this.cy) return;
  
    // If collapsed, selection doesn't map 1:1 to nodes.
    if (this.SelectedNodeCollapsingTypeVariable) return;
  
    const selectedIds = new Set(
      this.commonService.session.data.nodes
        .filter((n) => n.selected)
        .map((n) => n._id)
    );
  
    this.suppressCySelectionEvents = true;
  
    // Clear selection first
    this.cy.nodes().unselect();
  
    // Re-apply selection only for real nodes (skip axes/labels)
    this.cy.nodes().forEach((ele) => {
      if (ele.classes().length > 0) return; // axis nodes have classes
      const id = ele.id();
      if (selectedIds.has(id)) {
        ele.select();
      }
    });
  
    this.suppressCySelectionEvents = false;
  
    // Force style refresh (border-color for node:selected)
    this.cy.style().update();
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
      this.refreshCollapsedData(true);
    } else {
      this.getData();
      this.updateNodes();
    }
  }

  /**
   * Sorts this.allData chronologically based on the given sortVariable
   * @param sortVariable name of a property of commonService.session.data.nodeFilteredValues
   */
  sortData(sortVariable) {
    let allNodes = JSON.parse(JSON.stringify(this.commonService.session.data.nodeFilteredValues));
    const getSortTime = (value: any): number => {
      if (value === null || value === undefined) {
        return Number.NEGATIVE_INFINITY;
      }

      if (typeof value === 'string' && value.trim().toLowerCase() === 'null') {
        return Number.NEGATIVE_INFINITY;
      }

      const time = new Date(value).getTime();
      return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
    };

    allNodes.sort((a, b) => getSortTime(a[sortVariable]) - getSortTime(b[sortVariable]))
    
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
        this.visibleData.forEach(node => {
          if (this.hasCollapsedBubblePie(node)) {
            this.applyCollapsedBubblePieStyle(node);
          }
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
        this.updateColors();
        this.cy.style().update(); 
        this.cy.fit(this.cy.nodes(), 30);
      }
    }
}

  /**
  * Opens Global Setting Dialog
  */
  showGlobalSettings(event?: MouseEvent) {
    this.DisplayGlobalSettingsDialogEvent.emit(createGlobalSettingsDialogRequest('Styling', event));
  }

  updateNodeColors() {
    if (this.SelectedNodeCollapsingTypeVariable) {
      let _ = this.generateCollapsedCounts();
      this.generatePieChartsSVGDefs(this.visibleData.map(obj => obj.index));
      this.cy.remove('node');
      this.getData();
      this.updateNodes();

      this.visibleData.forEach((node) => {
        if (!this.hasCollapsedBubblePie(node)) {
          const currrentVar = Array.isArray(node.counts) ? node.counts[0]?.label : undefined;
          const nodeStyle = this.getNodeFillStyleForColorValue(currrentVar);
          this.cy.style().selector(`#${node.id}`).style({
            'background-color': nodeStyle.color,
            'background-opacity': nodeStyle.alpha
          })
          return;
        } else {
          this.applyCollapsedBubblePieStyle(node);
        }
      })
      this.cy.style().update();

      let fullNodes = this.commonService.session.data.nodeFilteredValues;
  
      this.allData.forEach(node => {
        let currentFullNode = this.getSourceNodeForDataRecord(node, fullNodes);
        if (!currentFullNode) {
          return;
        }
        const nodeStyle = this.commonService.getNodeFillStyle(currentFullNode);
        node.color = nodeStyle.color;
        node.opacity = nodeStyle.alpha;
        node.mixedColorImage = this.getMixedColorNodeImage(currentFullNode, nodeStyle.color, nodeStyle.alpha);
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
  onRecallSession() {
    this.syncFromSessionState();
  }
  onLoadNewData() {
    this.syncFromSessionState();
  }
  onFilterDataChange() {
    this.widgets = this.commonService.session.style.widgets;
    this.updateAxisValues('X');
    this.updateAxisValues('Y');
    this.svgDefs = {};
    this.getData();

    if (!this.SelectedNodeCollapsingTypeVariable) {
      this.updateNodes();
    }

    this.setSelectedNodes(this);

    if (this.viewActive) {
      setTimeout(() => {
        this.goldenLayoutComponentResize();
      }, 5);
    }
  }

  /**
 * On click of center button, show centers the view
 */
  openCenter() {
    if (this.cy) {
        this.cy.fit(this.cy.nodes(), 30);
    } else {
        console.error('Cytoscape instance is not initialized.');
    }
  }
    
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

  private formatSvgNumber(value: number): string {
    if (!Number.isFinite(value)) {
      return '0';
    }

    return Number(value.toFixed(4)).toString();
  }

  private getSvgLengthAttribute(element: Element, attributeName: string): number | null {
    const attributeValue = element.getAttribute(attributeName);
    if (!attributeValue) {
      return null;
    }

    const numericValue = parseFloat(attributeValue);
    return Number.isFinite(numericValue) ? numericValue : null;
  }

  private getSvgImageHref(image: Element): string | null {
    const xlinkNamespace = 'http://www.w3.org/1999/xlink';
    return image.getAttribute('href')
      || image.getAttributeNS(xlinkNamespace, 'href')
      || image.getAttribute('xlink:href');
  }

  private getSvgTranslateTransform(element: Element): { x: number; y: number } | null {
    const transformValue = element.getAttribute('transform');
    if (!transformValue) {
      return null;
    }

    const translateMatch = transformValue.match(/translate\(\s*([-+]?\d*\.?\d+(?:e[-+]?\d+)?)\s*,?\s*([-+]?\d*\.?\d+(?:e[-+]?\d+)?)\s*\)/i);
    if (!translateMatch) {
      return null;
    }

    const x = parseFloat(translateMatch[1]);
    const y = parseFloat(translateMatch[2]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }

    return { x, y };
  }

  private getBubbleSvgExportScale(svgElement: Element): number {
    if (!this.cy) {
      return 1;
    }

    const graphBounds = this.cy.elements().boundingBox();
    const svgWidth = this.getSvgLengthAttribute(svgElement, 'width');
    const graphWidth = Math.ceil(graphBounds.w);
    if (!svgWidth || !Number.isFinite(svgWidth) || graphWidth <= 0) {
      return 1;
    }

    return svgWidth / graphWidth;
  }

  private getMixedNodeSvgExportReplacementList(): BubbleMixedSvgExportReplacement[] {
    const replacements: BubbleMixedSvgExportReplacement[] = [];
    if (!this.cy || this.SelectedNodeCollapsingTypeVariable) {
      return replacements;
    }

    const graphBounds = this.cy.elements().boundingBox();
    const fullNodes = this.commonService.session.data.nodeFilteredValues;
    this.visibleData.forEach((dataNode) => {
      if (!dataNode.mixedColorImage) {
        return;
      }

      const fullNode = this.getSourceNodeForDataRecord(dataNode, fullNodes);
      if (!fullNode) {
        return;
      }

      const segments = this.commonService.getNodeFillStyle(fullNode).segments;
      if (!Array.isArray(segments) || segments.length < 2) {
        return;
      }

      const cyNode = this.cy.getElementById(String(dataNode.id));
      if (cyNode.empty()) {
        return;
      }

      const position = cyNode.position();
      const nodeWidth = Number(cyNode.width()) || Number(cyNode.data('nodeSize')) || 0;
      const nodeHeight = Number(cyNode.height()) || Number(cyNode.data('nodeSize')) || nodeWidth;
      if (
        !Number.isFinite(position.x)
        || !Number.isFinite(position.y)
        || !Number.isFinite(nodeWidth)
        || !Number.isFinite(nodeHeight)
        || nodeWidth <= 0
        || nodeHeight <= 0
      ) {
        return;
      }

      replacements.push({
        exportHeight: nodeHeight,
        exportWidth: nodeWidth,
        exportX: position.x - graphBounds.x1 - (nodeWidth / 2),
        exportY: position.y - graphBounds.y1 - (nodeHeight / 2),
        segments
      });
    });

    return replacements;
  }

  private findMatchingMixedNodeSvgExportReplacement(
    image: Element,
    replacements: BubbleMixedSvgExportReplacement[],
    usedReplacements: Set<BubbleMixedSvgExportReplacement>
  ): BubbleMixedSvgExportReplacement | null {
    const imageWidth = this.getSvgLengthAttribute(image, 'width');
    const imageHeight = this.getSvgLengthAttribute(image, 'height');
    const imageTranslate = this.getSvgTranslateTransform(image) || { x: 0, y: 0 };
    const imageX = this.getSvgLengthAttribute(image, 'x') || 0;
    const imageY = this.getSvgLengthAttribute(image, 'y') || 0;
    if (imageWidth === null || imageHeight === null) {
      return null;
    }

    let bestMatch: BubbleMixedSvgExportReplacement | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const replacement of replacements) {
      if (usedReplacements.has(replacement)) {
        continue;
      }

      const score =
        Math.abs(replacement.exportX - (imageTranslate.x + imageX))
        + Math.abs(replacement.exportY - (imageTranslate.y + imageY))
        + Math.abs(replacement.exportWidth - imageWidth)
        + Math.abs(replacement.exportHeight - imageHeight);
      if (score < bestScore) {
        bestScore = score;
        bestMatch = replacement;
      }
    }

    return bestMatch;
  }

  private getWeightedMixedExportSegments(
    segments: Array<{ color: string; alpha?: number; weight?: number }>
  ): Array<{ color: string; alpha: number; startFraction: number; endFraction: number }> {
    const validSegments = segments.filter(segment => Number(segment.weight ?? 1) > 0);
    const totalWeight = validSegments.reduce((sum, segment) => sum + Number(segment.weight ?? 1), 0);
    if (validSegments.length < 2 || totalWeight <= 0) {
      return [];
    }

    let startFraction = 0;
    return validSegments.map((segment, index) => {
      const endFraction = index === validSegments.length - 1
        ? 1
        : startFraction + (Number(segment.weight ?? 1) / totalWeight);
      const weightedSegment = {
        color: segment.color,
        alpha: this.commonService.clampStyleAlpha(segment.alpha ?? 1, 1),
        startFraction,
        endFraction
      };
      startFraction = endFraction;

      return weightedSegment;
    });
  }

  private appendMixedStripePattern(
    doc: XMLDocument,
    parent: SVGElement,
    patternId: string,
    segments: Array<{ color: string; alpha?: number; weight?: number }>
  ): void {
    const svgNamespace = 'http://www.w3.org/2000/svg';
    const defs = doc.createElementNS(svgNamespace, 'defs');
    const pattern = doc.createElementNS(svgNamespace, 'pattern');
    const weightedSegments = this.getWeightedMixedExportSegments(segments);
    const safeStripePeriod = MIXED_NODE_STRIPE_BAND_WIDTH_PX
      * Math.max(2, weightedSegments.length);
    pattern.setAttribute('id', patternId);
    pattern.setAttribute('patternUnits', 'userSpaceOnUse');
    pattern.setAttribute('width', this.formatSvgNumber(safeStripePeriod));
    pattern.setAttribute('height', this.formatSvgNumber(safeStripePeriod));
    pattern.setAttribute('patternTransform', 'rotate(45)');

    weightedSegments.forEach(segment => {
      const stripe = doc.createElementNS(svgNamespace, 'rect');
      stripe.setAttribute('x', this.formatSvgNumber(segment.startFraction * safeStripePeriod));
      stripe.setAttribute('y', '0');
      stripe.setAttribute('width', this.formatSvgNumber((segment.endFraction - segment.startFraction) * safeStripePeriod));
      stripe.setAttribute('height', this.formatSvgNumber(safeStripePeriod));
      stripe.setAttribute('fill', segment.color);
      stripe.setAttribute('fill-opacity', this.formatSvgNumber(segment.alpha));
      pattern.appendChild(stripe);
    });

    defs.appendChild(pattern);
    parent.appendChild(defs);
  }

  private createMixedNodeVectorExportElement(
    doc: XMLDocument,
    sourceImage: SVGImageElement,
    replacement: BubbleMixedSvgExportReplacement,
    replacementIndex: number
  ): SVGGElement {
    const svgNamespace = 'http://www.w3.org/2000/svg';
    const vectorGroup = doc.createElementNS(svgNamespace, 'g');
    vectorGroup.setAttribute('class', 'bubble-export-mixed-node-fill');
    vectorGroup.setAttribute('data-mt-export', 'bubble-mixed-node-fill');
    vectorGroup.setAttribute('aria-hidden', 'true');

    ['clip-path', 'opacity', 'style'].forEach((attributeName) => {
      const attributeValue = sourceImage.getAttribute(attributeName);
      if (attributeValue) {
        vectorGroup.setAttribute(attributeName, attributeValue);
      }
    });

    const imageTransform = sourceImage.getAttribute('transform');
    if (imageTransform) {
      vectorGroup.setAttribute('transform', imageTransform);
    }

    const imageWidth = this.getSvgLengthAttribute(sourceImage, 'width') ?? replacement.exportWidth;
    const imageHeight = this.getSvgLengthAttribute(sourceImage, 'height') ?? replacement.exportHeight;
    const imageX = this.getSvgLengthAttribute(sourceImage, 'x') ?? 0;
    const imageY = this.getSvgLengthAttribute(sourceImage, 'y') ?? 0;
    const patternId = `mt-bubble-mixed-export-${replacementIndex}`;
    this.appendMixedStripePattern(doc, vectorGroup, patternId, replacement.segments);

    const fillRect = doc.createElementNS(svgNamespace, 'rect');
    fillRect.setAttribute('x', this.formatSvgNumber(imageX));
    fillRect.setAttribute('y', this.formatSvgNumber(imageY));
    fillRect.setAttribute('width', this.formatSvgNumber(imageWidth));
    fillRect.setAttribute('height', this.formatSvgNumber(imageHeight));
    fillRect.setAttribute('fill', `url(#${patternId})`);
    fillRect.setAttribute('stroke', 'none');
    vectorGroup.appendChild(fillRect);

    return vectorGroup;
  }

  private replaceExportedMixedNodeImagesWithVectorFills(doc: XMLDocument): void {
    const replacementList = this.getMixedNodeSvgExportReplacementList();
    if (replacementList.length === 0) {
      return;
    }

    const images = Array.from(doc.getElementsByTagName('image'))
      .filter((image) => {
        const href = this.getSvgImageHref(image);
        return !!href && (href.startsWith('data:image/png;base64,') || href.startsWith('data:image/svg+xml'));
      });
    const usedReplacements = new Set<BubbleMixedSvgExportReplacement>();

    images.forEach((image) => {
      const replacement = this.findMatchingMixedNodeSvgExportReplacement(image, replacementList, usedReplacements);
      if (!replacement || !image.parentNode) {
        return;
      }

      usedReplacements.add(replacement);
      const vectorElement = this.createMixedNodeVectorExportElement(
        doc,
        image as SVGImageElement,
        replacement,
        usedReplacements.size
      );
      image.parentNode.replaceChild(vectorElement, image);
    });
  }

  private getCollapsedPieSvgExportReplacementList(exportScale: number): BubblePieSvgExportReplacement[] {
    const replacements: BubblePieSvgExportReplacement[] = [];
    if (!this.cy || !this.SelectedNodeCollapsingTypeVariable) {
      return replacements;
    }

    const graphBounds = this.cy.elements().boundingBox();
    if (!Number.isFinite(graphBounds.x1) || !Number.isFinite(graphBounds.y1)) {
      return replacements;
    }

    this.visibleData.forEach((dataNode) => {
      const totalCount = Number(dataNode.totalCount || 0);
      const counts = Array.isArray(dataNode.counts)
        ? dataNode.counts.filter((count) => Number(count?.count || 0) > 0)
        : [];
      const pieSlices = this.getPieSlicesForCollapsedBubbleNode(dataNode);

      if (totalCount <= 0 || counts.length === 0 || !hasCompositePieChartFill(pieSlices)) {
        return;
      }

      const cyNode = this.cy.getElementById(String(dataNode.id));
      if (cyNode.empty()) {
        return;
      }

      const position = cyNode.position();
      const nodeWidth = Number(cyNode.width()) || Number(cyNode.data('nodeSize')) || 0;
      const nodeHeight = Number(cyNode.height()) || Number(cyNode.data('nodeSize')) || nodeWidth;
      const borderWidth = Number(cyNode.numericStyle('border-width')) || 3;
      if (
        !Number.isFinite(position.x)
        || !Number.isFinite(position.y)
        || !Number.isFinite(nodeWidth)
        || !Number.isFinite(nodeHeight)
        || nodeWidth <= 0
        || nodeHeight <= 0
      ) {
        return;
      }

      const sliceTotal = pieSlices.reduce((sum, slice) => sum + Number(slice.count || 0), 0);
      if (sliceTotal <= 0) {
        return;
      }

      replacements.push({
        borderWidth: borderWidth * exportScale,
        nodeId: String(dataNode.id),
        totalCount,
        exportHeight: nodeHeight * exportScale,
        exportWidth: nodeWidth * exportScale,
        exportX: (position.x - graphBounds.x1 - nodeWidth / 2) * exportScale,
        exportY: (position.y - graphBounds.y1 - nodeHeight / 2) * exportScale,
        slices: pieSlices.map((slice) => {
          const countValue = Number(slice.count || 0);
          return {
            label: slice.label,
            count: countValue,
            color: slice.color,
            opacity: Number.isFinite(Number(slice.alpha)) ? Number(slice.alpha) : 1,
            fraction: countValue / sliceTotal,
            segments: slice.segments?.map(segment => ({
              color: segment.color,
              alpha: segment.alpha,
              weight: segment.weight
            })),
          };
        }),
      });
    });

    return replacements;
  }

  private findMatchingCollapsedPieSvgExportReplacement(
    image: Element,
    replacements: BubblePieSvgExportReplacement[],
    usedReplacements: Set<BubblePieSvgExportReplacement>
  ): BubblePieSvgExportReplacement | null {
    const imageWidth = this.getSvgLengthAttribute(image, 'width');
    const imageHeight = this.getSvgLengthAttribute(image, 'height');
    const imageTranslate = this.getSvgTranslateTransform(image) || { x: 0, y: 0 };
    const imageX = this.getSvgLengthAttribute(image, 'x') || 0;
    const imageY = this.getSvgLengthAttribute(image, 'y') || 0;
    if (imageWidth === null || imageHeight === null) {
      return null;
    }

    let bestMatch: BubblePieSvgExportReplacement | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const replacement of replacements) {
      if (usedReplacements.has(replacement)) {
        continue;
      }

      const score =
        Math.abs(replacement.exportX - (imageTranslate.x + imageX))
        + Math.abs(replacement.exportY - (imageTranslate.y + imageY))
        + Math.abs(replacement.exportWidth - imageWidth)
        + Math.abs(replacement.exportHeight - imageHeight);
      if (score < bestScore) {
        bestScore = score;
        bestMatch = replacement;
      }
    }

    return bestMatch;
  }

  private getBubblePieSlicePath(
    centerX: number,
    centerY: number,
    radius: number,
    startFraction: number,
    endFraction: number
  ): string {
    if (endFraction - startFraction >= 1 - Number.EPSILON) {
      const topY = centerY - radius;
      const bottomY = centerY + radius;
      return [
        'M', this.formatSvgNumber(centerX), this.formatSvgNumber(topY),
        'A', this.formatSvgNumber(radius), this.formatSvgNumber(radius), '0', '1', '1', this.formatSvgNumber(centerX), this.formatSvgNumber(bottomY),
        'A', this.formatSvgNumber(radius), this.formatSvgNumber(radius), '0', '1', '1', this.formatSvgNumber(centerX), this.formatSvgNumber(topY),
        'Z',
      ].join(' ');
    }

    const startAngle = -Math.PI / 2 + startFraction * 2 * Math.PI;
    const endAngle = -Math.PI / 2 + endFraction * 2 * Math.PI;
    const startX = centerX + radius * Math.cos(startAngle);
    const startY = centerY + radius * Math.sin(startAngle);
    const endX = centerX + radius * Math.cos(endAngle);
    const endY = centerY + radius * Math.sin(endAngle);
    const largeArcFlag = endFraction - startFraction > 0.5 ? 1 : 0;

    return [
      'M', this.formatSvgNumber(centerX), this.formatSvgNumber(centerY),
      'L', this.formatSvgNumber(startX), this.formatSvgNumber(startY),
      'A', this.formatSvgNumber(radius), this.formatSvgNumber(radius), '0', `${largeArcFlag}`, '1', this.formatSvgNumber(endX), this.formatSvgNumber(endY),
      'Z',
    ].join(' ');
  }

  private createBubblePieVectorExportElement(
    doc: XMLDocument,
    sourceImage: SVGImageElement,
    replacement: BubblePieSvgExportReplacement
  ): SVGGElement {
    const svgNamespace = 'http://www.w3.org/2000/svg';
    const vectorGroup = doc.createElementNS(svgNamespace, 'g');
    vectorGroup.setAttribute('class', 'bubble-export-pie');
    vectorGroup.setAttribute('data-mt-export', 'bubble-pie');
    vectorGroup.setAttribute('data-mt-node-id', replacement.nodeId);
    vectorGroup.setAttribute('data-mt-total-count', `${replacement.totalCount}`);
    vectorGroup.setAttribute('aria-hidden', 'true');

    const attributesToCopy = ['clip-path', 'opacity', 'style'];
    attributesToCopy.forEach((attributeName) => {
      const attributeValue = sourceImage.getAttribute(attributeName);
      if (attributeValue) {
        vectorGroup.setAttribute(attributeName, attributeValue);
      }
    });

    const imageTransform = sourceImage.getAttribute('transform');
    if (imageTransform) {
      vectorGroup.setAttribute('transform', imageTransform);
    }

    const imageWidth = this.getSvgLengthAttribute(sourceImage, 'width') ?? replacement.exportWidth;
    const imageHeight = this.getSvgLengthAttribute(sourceImage, 'height') ?? replacement.exportHeight;
    const imageX = this.getSvgLengthAttribute(sourceImage, 'x') ?? 0;
    const imageY = this.getSvgLengthAttribute(sourceImage, 'y') ?? 0;
    const centerX = imageX + imageWidth / 2;
    const centerY = imageY + imageHeight / 2;
    const radius = Math.min(imageWidth, imageHeight) / 2;
    let sliceStart = 0;

    replacement.slices.forEach((slice, index) => {
      const sliceEnd = index === replacement.slices.length - 1 ? 1 : sliceStart + slice.fraction;
      const path = doc.createElementNS(svgNamespace, 'path');
      const weightedSegments = this.getWeightedMixedExportSegments(slice.segments || []);
      path.setAttribute('class', 'bubble-export-pie-slice');
      path.setAttribute('data-mt-export', 'bubble-pie-slice');
      path.setAttribute('data-mt-node-id', replacement.nodeId);
      path.setAttribute('data-mt-slice-label', slice.label);
      path.setAttribute('data-mt-slice-count', `${slice.count}`);
      path.setAttribute('data-mt-slice-fraction', this.formatSvgNumber(slice.fraction));
      if (weightedSegments.length > 1) {
        const safeNodeId = replacement.nodeId.replace(/[^A-Za-z0-9_-]/g, '-');
        const stripedPatternId = `mt-bubble-pie-${safeNodeId}-stripes-${index}`;
        this.appendMixedStripePattern(doc, vectorGroup, stripedPatternId, slice.segments || []);
        path.setAttribute('data-mt-segmented-fill', 'true');
        path.setAttribute('fill', `url(#${stripedPatternId})`);
        path.setAttribute('fill-opacity', '1');
      } else {
        path.setAttribute('fill', slice.color);
        path.setAttribute('fill-opacity', this.formatSvgNumber(slice.opacity));
      }
      path.setAttribute('stroke', 'none');
      path.setAttribute('d', this.getBubblePieSlicePath(centerX, centerY, radius, sliceStart, sliceEnd));
      vectorGroup.appendChild(path);
      sliceStart = sliceEnd;
    });

    const outline = doc.createElementNS(svgNamespace, 'circle');
    const outlineStrokeWidth = Math.min(replacement.borderWidth, radius);
    outline.setAttribute('class', 'bubble-export-pie-outline');
    outline.setAttribute('data-mt-export', 'bubble-pie-outline');
    outline.setAttribute('data-mt-node-id', replacement.nodeId);
    outline.setAttribute('cx', this.formatSvgNumber(centerX));
    outline.setAttribute('cy', this.formatSvgNumber(centerY));
    outline.setAttribute('r', this.formatSvgNumber(Math.max(0, radius - outlineStrokeWidth / 2)));
    outline.setAttribute('fill', 'none');
    outline.setAttribute('stroke', '#000000');
    outline.setAttribute('stroke-width', this.formatSvgNumber(outlineStrokeWidth));
    vectorGroup.appendChild(outline);

    return vectorGroup;
  }

  private replaceExportedCollapsedPieImagesWithVectorPies(doc: XMLDocument): void {
    const svgElement = doc.documentElement;
    const exportScale = this.getBubbleSvgExportScale(svgElement);
    const replacementList = this.getCollapsedPieSvgExportReplacementList(exportScale);
    if (replacementList.length === 0) {
      return;
    }

    const images = Array.from(doc.getElementsByTagName('image'))
      .filter((image) => {
        const href = this.getSvgImageHref(image);
        return !!href && href.startsWith('data:image/png;base64,');
      });
    const usedReplacements = new Set<BubblePieSvgExportReplacement>();

    images.forEach((image) => {
      const replacement = this.findMatchingCollapsedPieSvgExportReplacement(image, replacementList, usedReplacements);
      if (!replacement || !image.parentNode) {
        return;
      }

      usedReplacements.add(replacement);
      const vectorElement = this.createBubblePieVectorExportElement(doc, image as SVGImageElement, replacement);
      image.parentNode.replaceChild(vectorElement, image);
    });
  }

  private vectorizeCollapsedPieSvgExport(content: string): string {
    if (!this.SelectedNodeCollapsingTypeVariable) {
      return content;
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'image/svg+xml');
    if (doc.getElementsByTagName('parsererror').length > 0) {
      return content;
    }

    this.replaceExportedCollapsedPieImagesWithVectorPies(doc);
    return new XMLSerializer().serializeToString(doc.documentElement);
  }

  private vectorizeMixedNodeSvgExport(content: string): string {
    if (this.SelectedNodeCollapsingTypeVariable) {
      return content;
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'image/svg+xml');
    if (doc.getElementsByTagName('parsererror').length > 0) {
      return content;
    }

    this.replaceExportedMixedNodeImagesWithVectorFills(doc);
    return new XMLSerializer().serializeToString(doc.documentElement);
  }

  private saveGeneratedFile(content: Blob | string, filename: string): void {
    const browserWindow = window as Window & {
      __mtTestSaveAs?: (content: Blob | string, filename: string) => void;
    };

    if (typeof browserWindow.__mtTestSaveAs === 'function') {
      browserWindow.__mtTestSaveAs(content, filename);
      return;
    }

    saveAs(content as any, filename);
  }

  private dataUrlToBlob(dataUrl: string): Blob {
    const [metadata, payload = ''] = dataUrl.split(',');
    const mimeType = metadata.match(/^data:([^;]+);base64$/)?.[1] || 'application/octet-stream';
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index++) {
      bytes[index] = binary.charCodeAt(index);
    }

    return new Blob([bytes], { type: mimeType });
  }

  private exportRasterVisualization(): void {
    const scale = Number(this.SelectedBubbleExportScaleVariable) || 1;
    const dataUrl = this.cy.png({
      full: true,
      scale,
      bg: '#ffffff',
      output: 'base64uri',
    });

    this.saveGeneratedFile(this.dataUrlToBlob(dataUrl), `${this.BubbleExportFileName}.png`);
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
      content = this.vectorizeMixedNodeSvgExport(content);
      content = this.vectorizeCollapsedPieSvgExport(content);

      this.exportService.requestSVGExport([], content, true, false); 
    } else {
      this.exportRasterVisualization();
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
