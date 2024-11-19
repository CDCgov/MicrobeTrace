import { Injector, Component, Output, OnChanges, SimpleChange, EventEmitter, OnInit, ViewChild, ElementRef, ChangeDetectorRef, OnDestroy, Inject, ChangeDetectionStrategy } from '@angular/core';
import { AppComponentBase } from '@shared/common/app-component-base';
import { EventManager } from '@angular/platform-browser';
import { CommonService } from '../../contactTraceCommonServices/common.service';
import * as d3 from 'd3';
import { forceAttract } from 'd3-force-attract';
import { Clipboard } from '@angular/cdk/clipboard';
//import * as ClipboardJS from 'clipboard';
import * as saveAs from 'file-saver';
import * as domToImage from 'dom-to-image-more';
import { SelectItem } from 'primeng/api';
import { DialogSettings } from '../../helperClasses/dialogSettings';
import { MicobeTraceNextPluginEvents } from '../../helperClasses/interfaces';
import * as _ from 'lodash';
import { MicrobeTraceNextVisuals } from '../../microbe-trace-next-plugin-visuals';
import { CustomShapes } from '@app/helperClasses/customShapes';
//import { FormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { DialogService, DynamicDialogRef } from 'primeng/dynamicdialog';
import { BaseComponentDirective } from '@app/base-component.directive';
import { saveSvgAsPng } from 'save-svg-as-png';
import { ComponentContainer } from 'golden-layout';
import { MicrobeTraceNextHomeComponent } from '../../microbe-trace-next-plugin.component';
import { GoogleTagManagerService } from 'angular-google-tag-manager';

import { data, NodeDatum, LinkDatum, GraphData } from './data';
import { GraphCircleLabel, Graph, GraphForceLayoutSettings, GraphLayoutType, GraphNode, GraphLink, GraphPanelConfig, GraphLinkStyle } from '@unovis/ts';

import { nodes, links, NodeDatum2, LinkDatum2, panels } from './data2';

@Component({
    selector: 'TwoDComponent',
    templateUrl: './twoD-plugin.component.html',
    styleUrls: ['./twoD-plugin.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TwoDComponent extends BaseComponentDirective implements OnInit, MicobeTraceNextPluginEvents, OnDestroy {

    @Output() DisplayGlobalSettingsDialogEvent = new EventEmitter();
    @ViewChild('twoDGraph') twoDGraph: Graph<GraphNode, GraphLink>;

    svgStyle: {} = {
        'height': '0px',
        'width': '1000px'
    };

    vizLoaded = true;

    data;

    data2: { nodes: NodeDatum2[]; links: LinkDatum2[] } = { nodes, links };

    layoutParallelNodesPerColumn = 4;

    layoutType2 = GraphLayoutType.Parallel;
    layoutNodeGroup = (d: NodeDatum2): string => d.group;
    layoutParallelNodeSubGroup = (d: NodeDatum2): string => d.id;
    panels: GraphPanelConfig[] = panels;

    layoutType = GraphLayoutType.Force;

    containerHeight = 800; // or any other number you want
  
    graphData : GraphData = {
        nodes :[],
        links :[]
    };

    showParallel: boolean = false;

    selectedNodeId = undefined;

    forceLayoutSettings: any = {
      fixNodePositionAfterSimulation: true,
      linkDistance: this.getLinkDistance()
    }
    selectedNodeShape: string = 'circle'; // Default shape

    linkLabel = (l: LinkDatum): GraphCircleLabel => this.getLinkLabel(l)
    nodeLabel = (n: NodeDatum) => this.getNodeLabel(n)
    nodeShape = (n: NodeDatum) => this.getNodeShape(n)
    linkStroke = (l: LinkDatum) => this.getLinkColor(l)
    linkStyle = (l: LinkDatum) => this.getLinkStyle(l)
    linkWidth = (l: LinkDatum) => this.getLinkWidth(l)
    linkArrow = (l: LinkDatum) => this.getLinkArrow(l)
    nodeFill = (n: NodeDatum) => this.getNodeColor(n)
    nodeStroke = (n: NodeDatum) => this.getNodeStroke(n)
    nodeSize =  (n: NodeDatum) => this.getNodeSize(n)
    // onNodeSelectionBrush = (selectedNodes: GraphNode[], event: any)  => this.onSelectionBrush(selectedNodes)
    // onNodeSelectionDrag = (selectedNodes: GraphNode[], event: any) => this.onSelectionDrag(selectedNodes)

    onSelectionBrush(nodes: GraphNode[]) {
        console.log('onSelectionNode: ', nodes);
    }

    getLinkStyle(l: LinkDatum) {

        if((l.source['_id'] === "KF773429" && l.target['_id'] === "KF773430") || (l.source['_id'] === "KF773430" && l.target['_id'] === "KF773429")) {
            console.log('setting link dashed: ', _.cloneDeep(l));
        }
        
        return l['origin'].length > 1 ? GraphLinkStyle.Dashed : GraphLinkStyle.Solid;
    }

    onSelectionDrag(nodes: GraphNode[]) {
        console.log('onSelectionDrag: ', nodes);
    }

    getLinkDistance() {
        let dist = Math.random() * 100;
        console.log('getLinkDistance: ',dist);
        return dist;
    }

    events = {
        [Graph.selectors.node]: {
            click: (d: GraphNode) => {
                console.log('selected node is: ', d);
                this.selectedNodeId = d.id as string;
                this._rerender();
                // config.selectedNodeId = d.id
                // Set the selected node id here, e.g.: config.selectedNodeId = d.id
                // and trigger the component update if required by your UI framework
             },
             mouseover: (d: GraphNode, event: MouseEvent) => {
                this.showNodeTooltip(d, event);
                // Perform actions on hover, such as highlighting or displaying additional information
              },
              mouseout: (d: GraphNode) => {
                this.hideTooltip();
              },
              brush: (selectedNodes: GraphNode[], event: any) => {
                this.onSelectionBrush(selectedNodes);
              },
              drag: (selectedNodes: GraphNode[], event: any) => {
                this.onSelectionDrag(selectedNodes);
              }
            
        },
        [Graph.selectors.link]: {
             mouseover: (d: GraphLink, event: MouseEvent) => {
                this.showLinkTooltip(d, event);
                // Perform actions on hover, such as highlighting or displaying additional information
              },
              mouseout: () => {
                this.hideTooltip();
              }
            
        },
      }


    getNodeSize( node : any ) {

        let defaultSize = this.widgets['node-radius']; 
        let size = defaultSize, med = defaultSize, oldrng, min, max;
        let sizeVariable = this.widgets['node-radius-variable'];
    

        // console.log('in size: ', this.widgets['node-radius-variable'])
        // console.log('in size 2: ', this.widgets['node-radius']);

        // if (this.widgets['node-radius'] > 90) this.widgets['node-radius'] = 10;
        // console.log('node index by size: ',this.widgets['node-radius-variable'] );
        // console.log('node Radius Var: ', this.widgets['node-radius']);
        if (this.widgets['node-radius-variable'] == 'None') {
            return this.widgets['node-radius'];
        } else {
        
            let v = node[sizeVariable];
            
            if (!this.isNumber(v)) v = this.nodeMid;
    
            // Check the type of v before calling linkScale
    
            // Ensure v is a number before using linkScale
            if (typeof v === 'number') {
                let scaleValue = this.nodeScale(v);
                console.log('link scale', scaleValue);
                return scaleValue;
            } else {
                console.error('v is not a number:', v);
                return this.nodeScale; // Default to scalar if v is not a number
            }

        
            // return this.visuals.twoD.commonService.temp.style.nodeColorMap(this.visuals.twoD.commonService.session.data.nodes[index][variable]);
        }


    }


    getNodeStroke = (n: NodeDatum)  => {
       
        if(n.id == this.selectedNodeId) {
            return this.widgets['selected-node-stroke-color'];
        } else {
            return '#000';
        }
        
    }

    nodeStrokeWidth = (n: NodeDatum)  => {
        return this.nodeBorderWidth;
    }

    getLinkArrow = (link: any ) => {
        if(this.widgets['link-directed'] && this.widgets['link-bidirectional']) {
            return "double";
        }
        return this.widgets['link-directed'];
    }


    getNodeColor( node : any ) {

        let variable = this.widgets['node-color-variable'];
        let color = this.widgets['node-color'];

        // Set cluster to group if showing paralell grouping
        if(variable == "cluster" && this.showParallel) {
            variable = "group";
        }

        return (variable == 'None') ? color : this.visuals.twoD.commonService.temp.style.nodeColorMap(node[variable]);

    }

    getLinkWidth( link: any ) {
        let scalar = this.widgets['link-width'];
        let variable = this.widgets['link-width-variable'];
    
        if (variable == 'None') return scalar;
    
        else {
            let mid = (this.linkMax - this.linkMin) / 2 + this.linkMin;
            let v = link[variable];
            
    
            if (!this.isNumber(v)) v = mid;
    
            // Ensure v is a number before using linkScale
            if (typeof v === 'number') {
                let scaleValue = this.linkScale(v);
                return scaleValue;
            } else {
                return scalar; // Default to scalar if v is not a number
            }
        }
    }

      // Method to handle shape change from the dropdown
      onNodeShapeChange(newShape: string) {
        this.selectedNodeShape = newShape;
        this._rerender();
    }


    getLinkColor( link: any ) {
        let variable = this.widgets['link-color-variable'];
        let color = this.widgets['link-color'];

        if((link.source.id === "KF773429" && link.target.id === "KF773430") || (link.source.id === "KF773430" && link.target.id === "KF773429")) {
            console.log('link variable: ', link[variable]);
        }


         // Convert hex color to RGBA
        const hexToRgba = (hex: string, alpha: number) => {
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        };

        let finalColor;
        let alphaValue;

        if ((variable == 'Origin' || variable == 'origin') && link.origin.length > 1) {
            finalColor = this.visuals.twoD.commonService.temp.style.linkColorMap("Duo-Link");
            alphaValue =this.visuals.twoD.commonService.temp.style.linkAlphaMap("Duo-Link")
            // this.visuals.twoD.commonService.temp.style.linkColorMap("Multi-Link"), alphaValue;
        } else {
            finalColor = (variable == 'None') ? color : this.visuals.twoD.commonService.temp.style.linkColorMap(link[variable]);
            alphaValue =this.visuals.twoD.commonService.temp.style.linkAlphaMap(link[variable])
        }

        return hexToRgba(finalColor, alphaValue);

    }

    private customShapes : CustomShapes = new CustomShapes();

    private symbolTableWrapper: HTMLElement | null = null;
    private linkColorTableWrapper: HTMLElement | null = null;
    private nodeColorTableWrapper: HTMLElement | null = null;


    linkMin: number = 3;
    linkMax: number = 27;
    linkScale : any;
    visLinks : any;
    linkMid : number = 1

    nodeMin: number = 3;
    nodeMax: number = 27;
    nodeScale : any;
    visNodes : any;
    nodeMid : number = 1;

    autoFit: boolean = true;

    ShowNetworkAttributes: boolean = false;
    ShowStatistics: boolean = true;
    Show2DExportPane: boolean = false;
    Show2DSettingsPane: boolean = false;
    IsDataAvailable: boolean = false;
    // svg: any = null;
    widgets: object;
    halfWidth: any = null;
    halfHeight: any = null;
    transform: any = null;
    force: any = null;
    radToDeg: any = (180 / Math.PI);
    selected: any = null;
    multidrag: boolean = false;
    // clipboard = new ClipboardJS('#copyID, #copySeq');
    zoom: any = null;
    brush: any = null;
    FieldList: SelectItem[] = [];
    ToolTipFieldList: SelectItem[] = [];
    LinkToolTipList: SelectItem[] = [];

    ctrlPressed : boolean = false;
    dragging : boolean = false;

    isLoading : boolean = true;
    viewActive: boolean = true;
    
    //Polygon Tab
    SelectedPolygonLabelVariable: string = "None";
    SelectedPolygonColorVariable: string = "None";
    SelectedPolygonLabelOrientationVariable: string = "top";
    SelectedPolygonLabelSizeVariable: number = 0.0;
    SelectedPolygonGatherValue: number = 0.0;
    CenterPolygonVariable: string = "None";
    SelectedPolygonLabelShowVariable: string = "Hide";
    SelectedPolygonColorShowVariable: string = "Hide";
    SelectedPolygonColorTableShowVariable: string = "Hide";


    // Node Tab    
    SelectedNodeLabelVariable: string = "None";
    SelectedNodeTooltipVariable: any = "None";
    SelectedNodeSymbolVariable: string = "None";
    SelectedNodeShapeVariable: string = "symbolCircle";
    SelectedNodeRadiusVariable: string = "None";
    SelectedNodeRadiusSizeVariable: string = "None";
    SelectedNodeRadiusSizeMaxVariable: string = "None";
    SelectedNodeRadiusSizeMinVariable: string = "None";
    TableTypes: any = [
        { label: 'Show', value: 'Show' },
        { label: 'Hide', value: 'Hide' }
    ];
    SelectedNetworkTableTypeVariable: string = "Hide";

    private isExportClosed: boolean = false;
    /* XXXXXnot sure if this boolean is necessary; Related to exportWork, and bottom-table s (ie. node-symbol-table-bottom)
     currently exportWork2 is used which don't make use of isExporting and bottom-table s XXXXX */
    public isExporting: boolean = false;

    isMac: boolean = navigator.userAgent.toUpperCase().indexOf('MAC') >= 0;


    // Link Tab
    SelectedLinkTooltipVariable: any = "None";
    SelectedLinkLabelVariable: string = "None";
    SelectedLinkDecimalVariable: number = 3;
    SelectedLinkTransparencyVariable: any = 0;
    SelectedLinkWidthByVariable: string = "None";
    SelectedLinkWidthMax: number = 27;
    SelectedLinkWidthMin: number = 3;

    ReciprocalTypes: any = [
        { label: 'Reciprocal', value: 'Reciprocal' },
        { label: 'Non-Reciprocal', value: 'Non-Reciprocal' }
    ];
    SelectedLinkReciprocalTypeVariable: string = "Reciprocal";

    SelectedLinkWidthVariable: any = 0;
    SelectedLinkLengthVariable: any = 0;
    ArrowTypes: any = [
        { label: 'Hide', value: 'Hide' },
        { label: 'Show', value: 'Show' }
    ];

    hideShowOptions: any = [
        { label: 'Hide', value: false },
        { label: 'Show', value: true }
    ];

    bidirectionalOptions: any = [
        { label: 'Hide', value: 'Hide' },
        { label: 'Show', value: 'Show' }
    ];
    SelectedLinkArrowTypeVariable: string = "Hide";

    SelectedLinkBidirectionalTypeVariable: string = "Hide";


    // Network 
    NeighborTypes: any = [
        { label: 'Normal', value: 'Normal' },
        { label: 'Highlighted', value: 'Highlighted' }
    ];
    SelectedNetworkNeighborTypeVariable: string = "Normal";

    GridLineTypes: any = [
        { label: 'Hide', value: 'Hide' },
        { label: 'Show', value: 'Show' }
    ];
    SelectedNetworkGridLineTypeVariable: string = "Hide";

    SelectedNetworkChargeVariable: any = 200;
    SelectedNetworkGravityVariable: any = .05;
    SelectedNetworkFrictionVariable: any = .4;
    SelecetedNetworkLinkStrengthVariable: any = 0.123;
    SelectedNetworkExportFilenameVariable: string = "";

    NetworkExportFileTypeList: any = [
        { label: 'png', value: 'png' },
        { label: 'jpeg', value: 'jpeg' },
        { label: 'webp', value: 'webp' },
        { label: 'svg', value: 'svg' }
    ];

    SelectedNetworkExportFileTypeListVariable: string = "png";
    SelectedNetworkExportScaleVariable: any = 1;
    SelectedNetworkExportQualityVariable: any = 0.92;
    CalculatedResolution: string;

    SelectedNodeLabelSizeVariable: any = 16;

    public nodeBorderWidth = 2.0;

    ShowNodeSymbolWrapper: boolean = false;
    ShowNodeSymbolTable: boolean = false;
    ShowPolygonColorTable: boolean = false;
    ShowAdvancedExport: boolean = true;

    NodeSymbolTableWrapperDialogSettings: DialogSettings = new DialogSettings('#node-symbol-table-wrapper', false);
    PolygonColorTableWrapperDialogSettings: DialogSettings = new DialogSettings('#polygon-color-table-wrapper', false);

    Node2DNetworkExportDialogSettings: DialogSettings = new DialogSettings('#network-settings-pane', false);

    ContextSelectedNodeAttributes: {attribute: string, value: string}[] = [];

    private visuals: MicrobeTraceNextVisuals;

    // Set the zoom scale extent
    zoomScaleExtent: [number, number] = [0.005, 5]; // Minimum zoom of 0.1 and maximum zoom of 2

    constructor(injector: Injector,
        private eventManager: EventManager,
        public commonService: CommonService,
        @Inject(BaseComponentDirective.GoldenLayoutContainerInjectionToken) private container: ComponentContainer, 
        elRef: ElementRef,
        private cdref: ChangeDetectorRef,
        private clipboard: Clipboard,
        private gtmService: GoogleTagManagerService) {

            super(elRef.nativeElement);

            // this.setExpanded(this.mainSite);


            this.visuals = commonService.visuals;
            this.commonService.visuals.twoD = this;
            this.widgets = this.commonService.session.style.widgets;
            window.addEventListener('resize', () => {
                // Replace this with the logic to determine the current show/hide state
                const showState: boolean = this.widgets['network-gridlines-show'];
                this.drawGridlines(showState);
            });

            this.container.on('hide', () => { 
                this.viewActive = false; 
                this.cdref.detectChanges();
            })
            this.container.on('show', () => { 
                this.viewActive = true; 
                this.cdref.detectChanges();
                setTimeout(() => {
                    (this.twoDGraph as any).component.fitView(500);
                }, 50)
            })

             // Initialize the selectedNodeShape from the settings
            this.selectedNodeShape = this.widgets['node-symbol'] || 'circle';
    }

    ngOnInit() {
        this.visuals.twoD.commonService.updateNetwork();
        this.InitView();
    }

    ngAfterViewInit(): void {
        // Apply CSS variables programmatically
        const root = document.documentElement;
        root.style.setProperty('--vis-graph-brush-selection-opacity', '1');
        root.style.setProperty('--vis-graph-brushed-node-stroke-color', '#ff0000');
        root.style.setProperty('--vis-graph-brushed-node-label-text-color', '#00ff00');
        root.style.setProperty('--vis-graph-brushed-node-icon-fill-color', '#0000ff');
        setTimeout(() => {this.updateNodeFx()}, 1000);
      }

    updateNodeFx() {
        (this.twoDGraph as any).component.datamodel._nodes.forEach(node => {
            let globalNode = (window as any).context.commonService.session.data.nodeFilteredValues.find(x => x._id == node.id)
            globalNode['fx'] = node.x;
            globalNode['fy'] = node.y;
        })
    }

    applyNodeFx() {
        // idk, this forEach loop produces an error (_nodes.forEach  is not a function) but it still executes just fine. Without the forEach loop not are 
        // placed differently each time the timeline is run.
        try {
            (this.twoDGraph as any).component.datamodel._nodes.forEach(node => {
                let globalNode = (window as any).context.commonService.session.data.nodeFilteredValues.find(x => x._id == node.id)
                if (node.index == 1) {
                    //console.log('prev ', node._state, node.x, node.y)
                    //console.log('load ', globalNode['fx'], globalNode['fy'])
                }
                node.x = globalNode['fx'];
                node.y = globalNode['fy'];
                node._state = {fx: globalNode['fx'], fy: globalNode['fy']};
                if (node.index == 1) {
                    //console.log('post ', node._state, node.x, node.y)
                }
            })
        } catch (error) {
            console.log('error setting node positions back to previous location')
        }
        (this.twoDGraph as any).component?.render();  
    }

    /** Initializes the view.
     * 
     * Defines the structure of the svg of twoD network and adds functionalities such as click, zoom, forces, etc...
     * 
     * Populates various lists for Fieldlist (options for node-label-variable, node-symbol-variable, node-radius-variable, polygon-foci), 
     * ToolTipFieldList (options for link-width-variable, link-label-variable), and LinkToolTipList (link-toolitp-variable)
     * 
     */
    InitView() {

        this.gtmService.pushTag({
            event: "page_view",
            page_location: "/2d_network",
            page_title: "2D Network View"
        });
        this.visuals.twoD.IsDataAvailable = (this.visuals.twoD.commonService.session.data.nodes.length === 0 ? false : true);
        if (!this.widgets['default-distance-metric']) {
          this.widgets['default-distance-metric'] = 
            this.visuals.twoD.commonService.GlobalSettingsModel.SelectedDistanceMetricVariable;
          this.widgets['link-threshold'] = 
            this.visuals.twoD.commonService.GlobalSettingsModel.SelectedLinkThresholdVariable;
        }
  
        // Use this method to prepare your variables before they're used in the template
        this.commonService.session.style.widgets['node-tooltip-variable'] = this.ensureArray(this.commonService.session.style.widgets['node-tooltip-variable']);
        this.commonService.session.style.widgets['link-tooltip-variable'] = this.ensureArray(this.commonService.session.style.widgets['link-tooltip-variable']);
        let that = this;

        if (this.visuals.twoD.IsDataAvailable === true && this.visuals.twoD.zoom === null) {

            // PRE D3
            d3.select('svg#viz-force')
                .append('g')
                .attr('class', 'horizontal-gridlines');

            d3.select('svg#viz-force')
                .append('g')
                .attr('class', 'vertical-gridlines');
            // d3.select('svg#network').exit().remove();
            // this.visuals.twoD.svg = d3.select('svg#network').append('g');

            // populate this.twoD.FieldList with [None, ...nodeFields]
            this.visuals.twoD.FieldList = [];
            this.visuals.twoD.FieldList.push({ label: "None", value: "None" });
            this.visuals.twoD.commonService.session.data['nodeFields'].map((d, i) => {
                if (d != 'seq' && d != 'sequence') {
                    this.visuals.twoD.FieldList.push(
                        {
                            label: this.visuals.twoD.commonService.capitalize(d.replace("_", "")),
                            value: d
                        });
                }

            });


            // populate this.visuals.twoD.ToolTipFieldList and this.LinkToolTipList
            this.visuals.twoD.ToolTipFieldList = [];
            this.LinkToolTipList = [];
            this.visuals.twoD.ToolTipFieldList.push({ label: "None", value: "None" });
            this.visuals.twoD.commonService.session.data['linkFields'].map((d, i) => {
                if (d == 'source') {
                    let data = [
                        {
                            label: 'Source ID',
                            value: 'source_id'
                        },
                        {
                            label: 'Source Index',
                            value: 'source_index'
                        }
                    ]
                    this.visuals.twoD.ToolTipFieldList = this.visuals.twoD.ToolTipFieldList.concat(data);
                    this.LinkToolTipList = this.LinkToolTipList.concat(data)
                } else if (d == 'target') {
                    let data = [
                        {
                            label: 'Target ID',
                            value: 'target_id'
                        },
                        {
                            label: 'Target Index',
                            value: 'target_index'
                        }
                    ]
                    this.visuals.twoD.ToolTipFieldList = this.visuals.twoD.ToolTipFieldList.concat(data);
                    this.LinkToolTipList = this.LinkToolTipList.concat(data)
                } else {
                    this.LinkToolTipList.push(
                        {
                            label: this.visuals.twoD.commonService.capitalize(d.replace("_", "")),
                            value: d
                        });
                    this.visuals.twoD.ToolTipFieldList.push(
                        {
                            label: this.visuals.twoD.commonService.capitalize(d.replace("_", "")),
                            value: d
                        });
                }
            });


            this.visuals.twoD.svgStyle = {
                'height': '100%',
                'min-width.%': 100,
            };

            this.visuals.twoD.halfWidth = $('#network').parent().width() / 2;
            this.visuals.twoD.halfHeight = $('#network').parent().parent().parent().height() / 2;
            this.containerHeight = this.visuals.twoD.halfHeight * 2 - 40;

            let networkData = { 
                nodes : this.visuals.twoD.commonService.getVisibleNodes(), 
                links : this.visuals.twoD.commonService.getVisibleLinks()
            }
            
            this.data = this.visuals.twoD.commonService.convertToGraphDataArray(networkData);
            // Now update panels
            this.updatePanels();

            console.log('data: ', this.data);

            $( document ).on( "node-visibility", function( ) {
                
                // if (!that.isLoading) {
                //     console.log('render node-vis');
                //     that.isLoading = true;
                //     that.visuals.twoD.render(false);
                //     setTimeout(() => {
                //         that.isLoading = false;
                //       }, 1000);
                // }
                // let networkData = { 
                //     nodes : that.visuals.twoD.commonService.getVisibleNodes(), 
                //     links : that.visuals.twoD.commonService.getVisibleLinks()
                // }
                
                // that.data = that.visuals.twoD.commonService.convertToGraphDataArray(networkData);
            });

            $( document ).on( "link-visibility", async function( ) {
                if (!that.isLoading && that.viewActive) {
                    that.isLoading = true;
            
                    await that._rerender(true);
                    that.isLoading = false;


                }  
            });

            $( document ).on( "cluster-visibility", function( ) {
                // if (!that.isLoading) {
                //     // console.log('render clus-vis');
                //     that.isLoading = true;
                //     that.visuals.twoD.render(true);
                //     setTimeout(() => {
                //         that.isLoading = false;
                //       }, 1000);
                // }     
                
                // let networkData = { 
                //     nodes : that.visuals.twoD.commonService.getVisibleNodes(), 
                //     links : that.visuals.twoD.commonService.getVisibleLinks()
                // }
                
                // that.data = that.visuals.twoD.commonService.convertToGraphDataArray(networkData);
            });

            $( document ).on( "node-selected", function( ) {
                if (!that.isLoading) {
                    let mtSelectedNode = that.commonService.getSelectedNode(that.commonService.getVisibleNodes());
                    if (mtSelectedNode && mtSelectedNode.id) {
                        that.selectedNodeId = mtSelectedNode.id;
                    } else if (mtSelectedNode && !mtSelectedNode.id) {
                        that.selectedNodeId = mtSelectedNode._id;
                    }

                    that._rerender();
                    console.log('node-selected in 2d: ', that.selectedNodeId);

                    console.log('node-selected in data: ', that.data.nodes.find(node => node.id == that.selectedNodeId));
                }            
            });


            window.addEventListener("node-selected", () => {
                this.visuals.twoD.render(false);
            });

            if (this.visuals.twoD.commonService.session.files.length > 1) $('#link-color-variable').val('origin').change();
            if (this.widgets['background-color']) $('#network').css('background-color', this.widgets['background-color']);
            this.visuals.microbeTrace.SelectedStatisticsTypesVariable = 'Show';
            this.visuals.microbeTrace.onShowStatisticsChanged();
            this.loadSettings();

            //For some mysterious reason, this really needed a delay...
            setTimeout(async () => {

                if (this.widgets['node-symbol-variable'] !== 'None') {
                    $('#node-symbol-variable').change(); //.trigger('change');
                }

                console.log('data: ', this.data);

                // Call render and then set isLoading to false to allo triggering of other renders
                await this.visuals.twoD.render();
                this.isLoading = false;

            }, 1);

        }


    }

        // Method to ensure the value is an array
        ensureArray(value: any): any[] {
            if (Array.isArray(value)) {
            return value; // It's already an array, return as is
            } else if (value !== null && value !== undefined) {
            return [value]; // Not an array, but has a value, wrap it in an array
            } else {
            return []; // No value, return an empty array
            }
        }

        
    /**
     * Toggle the pointer events of the brush and overlay element
     * 
     * @param {boolean} enable - If true, pointer events are enabled; otherwise, they are disabled
     */
    private toggleBrush(enable: boolean): void {
        // PRE D3
        // d3.select('svg#network g.brush')
        //   .attr('pointer-events', enable ? 'all' : 'none')
        //   .select('rect.overlay')
        //   .attr('pointer-events', enable ? 'all' : 'none');
      }

    /**
     * XXXXX empty function XXXXX
     */
    onDataChange(event) {

    }

    // loadDefaultVisualization(e: String) {

    //     setTimeout(() => {

    //         this.commonService.session.messages = [];
    //         // this.messages = [];
    //         $('#loading-information').html('');
    //         $('#launch').prop('disabled', false).focus();

    //         // this.displayloadingInformationModal = false;

    //     }, 1000);

    //     this.LoadDefaultVisualizationEvent.emit(e);
    // }

   

    /**
     * @returns an array [X, Y] of the position of mouse relative to twodcomponent. Global position (i.e. d3.event.pageX) doesn't work for a dashboard
     */  
    getRelativeMousePosition(event) {
        // Get position based on container, which may be paralell viz or not
        let rect = (!this.showParallel) ? document.getElementById('viz-force').getBoundingClientRect() : document.getElementById('viz-paralell').getBoundingClientRect()
        const X = event['clientX'] - rect.left;
        const Y = event['clientY'] - rect.top;
        return [X, Y];
    }

    /**
     * @returns an array [width, height] of the svg image
     */
    getImageDimensions() {
        // let parent = this.svg.node().parentElement;
        // return [parent.clientWidth, parent.clientHeight] 
    }

    /**
     * Sets CalculatedResolution variable to string such as '1250 x 855px'. Only called when export is first opened
     */
    setCalculatedResolution() {
        // let [width, height] = this.getImageDimensions();
        // this.CalculatedResolution = (Math.round(width * this.SelectedNetworkExportScaleVariable) + " x " + Math.round(height * this.SelectedNetworkExportScaleVariable) + "px");
    }

    /**
     * Updates CalculatedResolution variable to string such as '1250 x 855px' based on ImageDimensions and SelectedNetworkExportScaleVariable. 
     * This is called anytime SelectedNetworkExportScaleVariable is updated.
     */
    updateCalculatedResolution(event) {
        // let [width, height] = this.getImageDimensions();
        // this.CalculatedResolution = (Math.round(width * this.SelectedNetworkExportScaleVariable) + " x " + Math.round(height * this.SelectedNetworkExportScaleVariable) + "px");
        // this.cdref.detectChanges();
    }

    /**
     * Opens Global Setting Dialog
     */
    showGlobalSettings() {
        //console.log("threshold: ",  this.commonService.GlobalSettingsModel.SelectedLinkThresholdVariable);
        this.DisplayGlobalSettingsDialogEvent.emit("Styling");
    }

    /**
     * Hides export pane, sets isExporting variable to true and calls exportWork2 to export the twoD network image
     */
    exportVisualization(event) {

        this.visuals.twoD.Show2DExportPane = false;
        this.isExporting = true;

        // if (this.widgets['node-symbol-variable'] != 'None') {
        //     this.generateNodeSymbolSelectionTable("#node-symbol-table-bottom", this.widgets['node-symbol-variable'], false);
        // }

        // if (this.widgets['node-color-variable'] != 'None') {
        //     this.visuals.microbeTrace.generateNodeColorTable("#node-color-table-bottom", false);
        // }

        // if (this.widgets['link-color-variable'] != 'None') {
        //     this.visuals.microbeTrace.generateNodeLinkTable("#link-color-table-bottom", false);
        // }

        if (!this.isExportClosed) {
            setTimeout(() => this.exportVisualization(undefined), 300);
        }
        else {
            this.exportWork2();
        }
    }

    /**
     * Sets this.isExportClosed to true
     */
    onCloseExport() {
        this.isExportClosed = true;
    }

    /**
     * When the svg is clicked, this function is called and it removes color transparency slider that appears when updating color transparency in node/link color tables
     */
    networkWhitespaceClicked() : void {

        // The color transparency slider should dissapear if clicked out
        $("#color-transparency-wrapper").css({
            display: "none"
        });

        this.commonService.session.network.nodes.forEach(node => {
            node.selected = false;
        });
    }

    /**
     * XXXXX Not currently used in codebase; exportWork2 is used instead XXXXX
     */
    exportWork() {
        let network = document.getElementById('network');
        let $network = $(network);
        // PRE D3

        // let watermark = d3.select(network).append('text')
        // .attr('xlink:href', this.visuals.twoD.commonService.watermark)
        // .attr('height', 128)
        // .attr('width', 128)
        // .attr('x', 10)
        // .style('opacity', $('#network-export-opacity').val());
        // let filetype = this.SelectedNetworkExportFileTypeListVariable, 
        //     filename = this.SelectedNetworkExportFilenameVariable;
        // if (filetype == 'svg') {
           
        //     network.style.height = '100%';
        //     network.style.width = '100%';
        //     let content = this.visuals.twoD.commonService.unparseSVG(network);
        //     let blob = new Blob([content], { type: 'image/svg+xml;charset=utf-8' });
        //     saveAs(blob, filename + '.' + filetype);
        //     watermark.remove();
        //     const style: any = this.svgStyle;
        //     network.style.height = style.height;
        //     network.style.width = style.width;
            
        // } else {
        //     setTimeout(() => {
        //         const scale: number = this.visuals.twoD.SelectedNetworkExportScaleVariable;
        //         const element = document.querySelector('TwoDComponent').parentElement;
        //         domToImage.toBlob(element, {
        //             width: element.clientWidth * scale,
        //             height: element.clientHeight * scale,
        //             style: {
        //                 transform: 'scale(' + scale + ')',
        //                 transformOrigin: 'top left'
        //             },
        //             quality: this.visuals.twoD.SelectedNetworkExportQualityVariable
        //         })
        //             .then((blob) => {
        //                 saveAs(blob, filename + '.' + filetype);

        //                 watermark.remove();
        //                 this.visuals.twoD.isExporting = false;
        //                 // this.visuals.microbeTrace.clearTable("#node-symbol-table-bottom");
        //                 // this.visuals.microbeTrace.clearTable("#node-color-table-bottom");
        //                 // this.visuals.microbeTrace.clearTable("#link-color-table-bottom");

        //                 // this.visuals.microbeTrace.GlobalSettingsDialogSettings.restoreStateAfterExport();
        //                 // this.visuals.microbeTrace.GlobalSettingsLinkColorDialogSettings.restoreStateAfterExport();
        //                 // this.visuals.microbeTrace.GlobalSettingsNodeColorDialogSettings.restoreStateAfterExport();
        //                 // this.visuals.twoD.NodeSymbolTableWrapperDialogSettings.restoreStateAfterExport();
        //                 // this.visuals.twoD.PolygonColorTableWrapperDialogSettings.restoreStateAfterExport();
        //                 // this.visuals.twoD.Node2DNetworkExportDialogSettings.restoreStateAfterExport();
        //             });
        //     }, 1000);
           
        // }
    }

    /**
     * Exports twoD network svg as an svg, png, jpeg, or webp image
     */
    exportWork2() {
        let network = document.getElementById('viz-force');
        let $network = $(network);
        // PRE D3
        // add microbeTrace logo as a watermark
        // let watermark = d3.select(network).append('image')
        //     .attr('xlink:href', this.visuals.twoD.commonService.watermark)
        //     .attr('height', 128)
        //     .attr('width', 128)
        //     .attr('x', 35)
        //     .attr('y', 35)
        //     .style('opacity', $('#network-export-opacity').val());

        let filetype = this.SelectedNetworkExportFileTypeListVariable; 
        let filename = this.SelectedNetworkExportFilenameVariable;

        // add node color table
        let vnodes : any = this.visuals.twoD.commonService.getVisibleNodes();
        let aggregates = this.visuals.twoD.commonService.createNodeColorMap();
        let values = Object.keys(aggregates);
        var columns = [];
        columns.push('Node ' + this.visuals.twoD.commonService.titleize(this.widgets["node-color-variable"]));
        if (this.widgets["node-color-table-counts"]) columns.push('Count');
        if (this.widgets["node-color-table-frequencies"]) columns.push('Frequency');
        columns.push('Color');
        var data = [];
        values.forEach((value, i) => {
            let nodeValue =  (this.visuals.twoD.commonService.session.style.nodeValueNames[value] ? this.visuals.twoD.commonService.session.style.nodeValueNames[value] : this.visuals.twoD.commonService.titleize("" + value));
            let tableCounts = (this.widgets["node-color-table-counts"] ?  aggregates[value] : undefined);
            let tableFreq = (this.widgets["node-color-table-frequencies"] ? (aggregates[value] / vnodes.length).toLocaleString() : undefined);
            let line = {
                Node: nodeValue,
                Count: tableCounts, 
                Frequency: tableFreq,
                Color: '<div  style="margin-left:5px; width:40px;height:12px;background:' + this.visuals.twoD.commonService.temp.style.nodeColorMap(value)  +'"> </div>'
            }
            data.push(line);
        })

        let nodeWrapper = null;

        this.visuals.twoD.commonService.currentNodeTableElement.subscribe((element) => {
            if(element){
                nodeWrapper = element;
                } else {
                console.error('currentNodeTableElement is null');
                }                // You can now interact with this.myElement
        });
            // private symbolTableWrapper: HTMLElement | null = null;
            // private linkColorTableWrapper: HTMLElement | null = null;
            // private nodeColorTableWrapper: HTMLElement | null = null;
            // let nodeWrapper = this.parent.getElementById('node-color-table');

        //console.log('node wrapper: ', nodeWrapper);
        let nodeLegend = this.tabulate2(data, columns, nodeWrapper, network, 200,false);
    
        // add link origin table
        let vlinks = this.visuals.twoD.commonService.getVisibleLinks();
        aggregates = this.visuals.twoD.commonService.createLinkColorMap();
        values = Object.keys(aggregates);
        columns = [];
        columns.push('Link ' + this.visuals.twoD.commonService.titleize(this.widgets["link-color-variable"]));
        if (this.widgets["link-color-table-counts"]) columns.push('Count');
        if (this.widgets["link-color-table-frequencies"]) columns.push('Frequency');
        columns.push('Color');
        data = [];
        values.forEach((value, i) => {
            let nodeValue =  (this.visuals.twoD.commonService.session.style.linkValueNames[value] ? this.visuals.twoD.commonService.session.style.linkValueNames[value] : this.visuals.twoD.commonService.titleize("" + value));
            let tableCounts = (this.widgets["link-color-table-counts"] ?  aggregates[value] : undefined);
            let tableFreq = (this.widgets["link-color-table-frequencies"] ? (aggregates[value] / vlinks.length).toLocaleString() : undefined);
            let line = {
                Link: nodeValue,
                Count: tableCounts, 
                Frequency: tableFreq,
                Color: '<div  style="margin-left:5px; width:40px;height:12px;background:' + this.visuals.twoD.commonService.temp.style.linkColorMap(value)  +'"> </div>'
              }
              data.push(line);
        })

        let linkWrapper = null;

        this.visuals.twoD.commonService.currentLinkTableElement.subscribe((element) => {
            linkWrapper = element;
            // You can now interact with this.myElement
            });
        // let linkWrapper = document.getElementById('link-color-table-wrapper');
        let linkLegend = this.tabulate2(data, columns, linkWrapper, network, 600, false);
    
        // add node symbol table
        let variable = this.widgets['node-symbol-variable'];
            values = [];
        aggregates = {};
        let nodes = this.visuals.twoD.commonService.session.data.nodes;
        let n = nodes.length;
        vnodes = 0;
        for (let i = 0; i < n; i++) {
            let d = nodes[i];
            if (!d.visible) continue;
            vnodes++;
            let dv = d[variable];
            if (values.indexOf(dv) == -1) values.push(dv);
            if (dv in aggregates) {
                aggregates[dv]++;
            } else {
                aggregates[dv] = 1;
            }
        }
        columns = [];
        columns.push('Node ' + this.visuals.twoD.commonService.titleize(variable));
        if (this.widgets["node-symbol-table-counts"]) columns.push('Count');
        if (this.widgets["node-symbol-table-frequencies"]) columns.push('Frequency');
        columns.push('Shape');
        data = [];
        values.forEach((value, i) => {
            let nodeValue =  this.visuals.twoD.commonService.titleize("" + value);
            let tableCounts = (this.widgets["node-symbol-table-counts"] ?  aggregates[value] : undefined);
            let tableFreq = (this.widgets["node-symbol-table-frequencies"] ? (aggregates[value] / vnodes.length).toLocaleString() : undefined);        
            let line = {
                Node: nodeValue,
                Count: tableCounts, 
                Frequency: tableFreq,
                Shape: $("#node-symbol-table option[value='" + this.commonService.temp.style.nodeSymbolMap(value) + "']").eq(parseInt(value)).text()
            }
            data.push(line);
        })
        let symbolWrapper = document.getElementById('node-symbol-table');
        let symbolLegend;
        if (symbolWrapper) {
            symbolLegend = this.tabulate2(data, columns, symbolWrapper, network, 200, true);
        }
            
        // add network statistics table
        let statsDiv = document.getElementById('network-statistics-wrapper');
        // PRE D3
        // let foreignObjStats = d3.select(network).append("svg:foreignObject")
        //     .attr("x", statsDiv.offsetLeft)
        //     .attr("y", statsDiv.offsetTop-10)
        //     .attr("width", statsDiv.offsetWidth)
        //     .attr("height", statsDiv.offsetHeight);
        // foreignObjStats.append("xhtml:body").html(statsDiv.innerHTML);

        if (filetype == 'svg') {
            let content = this.visuals.twoD.commonService.unparseSVG(network);
            let blob = new Blob([content], { type: 'image/svg+xml;charset=utf-8' });
            saveAs(blob, filename + '.' + filetype);
            // PRE D3
            // if (watermark){
            //     watermark.remove();
            // }
            if (nodeLegend){
                nodeLegend.remove();
            }
            if (linkLegend){
                linkLegend.remove();
            }
            if (symbolLegend){
                symbolLegend.remove();
            }
            // if (foreignObjStats){
            //     foreignObjStats.remove();
            // }
        } else {
            console.log('network: ', network);
            console.log('network: ', network.getBoundingClientRect());
            saveSvgAsPng(network, filename + '.' + filetype, {
                scale: this.SelectedNetworkExportScaleVariable,
                backgroundColor: this.widgets['background-color'],
                encoderType: 'image/' + filetype,
                encoderOptions: this.SelectedNetworkExportQualityVariable
            }).then(() => {
                // PRE D3
                // if (watermark){
                //     watermark.remove();
                // }
                if (nodeLegend){
                    nodeLegend.remove();
                }
                if (linkLegend){
                    linkLegend.remove();
                }
                if (symbolLegend){
                    symbolLegend.remove();
                }
                // if (foreignObjStats){
                //     foreignObjStats.remove();
                // }
            });
        }
    }

    /**
     * Converts table such as node color table, link color table or node symbol table from dialog window into element on twoD network svg when
     * getting ready to export.
     * @param data Object[] containing information in the table, such as color, count, node/groupLabel
     * @param columns string array of table column names
     * @param wrapper HTMLElement of table
     * @param container HTMLElement of entive svg/network
     * @param topOffset number
     * @param leftOffset boolean
     * @returns foreignObject that can be removed later by foreignObjectName.remove()
     */
    tabulate2 = (data, columns, wrapper, container, topOffset: number, leftOffset: boolean) => {

        // console.log('wrapper: ', wrapper);
        // console.log('left: ', wrapper.offsetLeft);
        // console.log('container: ', container);
        // let containerWidth = container.getBBox().width;
        // let rightPosition = containerWidth - wrapper.offsetWidth;        
        // console.log('right: ', rightPosition);

        // PRE D3

        return null;
        // let foreignObj = d3.select(container).append("svg:foreignObject")
        //   .attr("x", (leftOffset) ? rightPosition : wrapper.offsetLeft)
        //   .attr("y", wrapper.offsetTop + topOffset)
        //   .attr("width", wrapper.offsetWidth)
        //   .attr("height", wrapper.offsetHeight);

        
        // let body = foreignObj 
        //   .append("xhtml:body")
        //   .append("table")
        //   .style('position', 'absolute')
        //   .style('top', '0')
        //   .style('width', '100%')
        //   .style('height', '100%')
        //   .attr('cellpadding', '1px')
        //   .attr("class", "table-bordered");
        //   // .html(nodeColorTable.innerHTML); SVG doesn't translate
        // let thead = body.append("thead"),
        //     tbody = body.append("tbody");
        // thead.append("tr")
        //   .selectAll("th")
        //   .data(columns)
        //   .enter()
        //   .append("th")
        //   .text(function(column) { return column; });
        // let rows = tbody.selectAll("tr")
        //   .data(data)
        //   .enter()
        //   .append("tr");
        // let cells = rows.selectAll("td")
        //   .data(function(row) {
        //     return columns.map(function(column) {
        //         return {column: column, value: row[column.split(" ")[0]]};
        //     });
        //   })
        //   .enter()
        //   .append("td")
        //   .html(function(d) { return d.value; });
        // return foreignObj;
      }

    /**
     * Renders the twoD network.
     * 
     * Set node functionalities and properties; set link functionalities, properties, and labels; sets polygon functionalities and properties if needed
     * @param showStatistics updates this.showStatistics variable
     */
    render(showStatistics: boolean = true) {

        if(this.isLoading) {

        
        console.log('rendering');

        if (!$('#network').length) return;

        $("#numberOfSelectedNodes").text(this.visuals.twoD.commonService.session.data.nodes.filter(d => d.selected).length.toLocaleString());

        // const start = Date.now();
        // let newNodes = this.visuals.twoD.commonService.getVisibleNodes(true);
        // let oldNodes;

        // if(this.widgets["timeline-date-field"] != 'None')
        //     oldNodes = this.visuals.twoD.commonService.session.network.timelineNodes;
        // else
        //     oldNodes = this.visuals.twoD.commonService.session.network.nodes;
        
        // if (newNodes.length === 0 && this.widgets["timeline-date-field"] == 'None') return;

        // match newNodes to oldNodes so that position variables can be updated in newNodes
        // newNodes.forEach((d, i) => {
        //     let match = oldNodes.find(d2 =>  {
        //         if(!d2.id) {
        //             d2.id = d2._id;
        //         }
        //         if(!d.id){
        //             d.id = d._id;
        //         }
        //         return d2.id == d.id
        //     });            
        //     if (match) {
        //         ['x', 'y', 'fx', 'fy', 'vx', 'vy', 'fixed'].forEach(v => {
                    
        //             if (typeof match[v] != "undefined") {
        //                 d[v] = match[v];
        //             } 

        //         });
        //     }
        // });

        // this.visuals.twoD.commonService.session.network.nodes = newNodes;

        // PRE D3
        // sets functionality for nodes, as well as node border and node text/label position
        // let nodes = this.visuals.twoD.svg.select('g.nodes').selectAll('g').data(newNodes, d => d._id)
        //     .join(
        //         enter => {
        //             let g = enter.append('g')
        //                 .attr('tabindex', '0')
        //                 .call(d3.drag() //A bunch of mouse handlers.
        //                     .on('start', (x) => this.visuals.twoD.dragstarted(x))
        //                     .on('drag', (x) => this.visuals.twoD.dragged(x))
        //                     .on('end', (x) => this.visuals.twoD.dragended(x)))
        //                 .on('mouseenter focusin', (x) => this.visuals.twoD.showNodeTooltip(x))
        //                 .on('mouseout focusout', (x) => this.visuals.twoD.hideTooltip())
        //                 .on('contextmenu', (x) => this.visuals.twoD.showContextMenu(x))
        //                 .on('click', (x) => this.visuals.twoD.clickHandler(x))
        //                 .on('keydown', n => {
        //                     if (d3.event.code == 'Space') this.visuals.twoD.clickHandler(n);
        //                     if (d3.event.shiftKey && d3.event.key == 'F10') this.visuals.twoD.showContextMenu(n);
        //                 });
        //                g.append('path')
        //                 .style('stroke', 'black')
        //                 .style('stroke-width', '2px');
        //             g.append('text')
        //                 .attr('dy', 5)
        //                 .attr('dx', 8);
        //             return g;
        //         }
        //     );

        // updates node properties (color, shape, label, size, etc...)
        // this.visuals.twoD.redrawNodes();
        // this.visuals.twoD.redrawLabels();
        // this.visuals.twoD.redrawNodeBorder();
        // this.visuals.twoD.updateNodeColors();

        // sets link functionality
        // let vlinks = this.visuals.twoD.getVLinks();
        // let links = this.visuals.twoD.svg.select('g.links').selectAll('line').data(vlinks)
        //     .join('line')
        //     .attr('stroke-width', this.widgets['link-width'])
        //     .attr('opacity', 1 - this.widgets['link-opacity'])
        //     .on('mouseenter', (x) => this.visuals.twoD.showLinkTooltip(x))
        //     .on('mouseout', (x) => this.visuals.twoD.hideTooltip());

        // updates link color and width
        // this.visuals.twoD.updateLinkColor();
        // this.visuals.twoD.scaleLinkWidth();

        // defines link labels
        // let linklabels = this.visuals.twoD.svg.select('g.links').selectAll('text').data(vlinks)
        //     .join('text')
        //     .attr('text-anchor', 'middle')
        //     .attr('dy', this.widgets['link-width'] + 2)
        //     .text((l) => {

        //         const labelValue = l[this.widgets['link-label-variable']];
              
        //         if (typeof labelValue === 'number' || !isNaN(parseFloat(labelValue))) {

        //             if(this.widgets['default-distance-metric'] == 'snps') {
        //                 return Math.round(parseFloat(labelValue));
        //             } else {
        //                 return parseFloat(labelValue).toFixed(this.widgets['link-label-decimal-length']);
        //             }

        //         } else {
        //             return labelValue;
        //         }
        //       });

        /**
         * Updates node and link position, and position and angle of link label
         */
        // let layoutTick = () => {
        //      nodes
        //         .attr('transform', d => {
        //             var ew =
        //                 d.fixed ?
        //                     `translate(${d.fx}, ${d.fy})` :
        //                     `translate(${d.x}, ${d.y})`;

        //             return ew;
        //         }
        //         );
        //     links
        //         .attr('x1', l => l.source.x)
        //         .attr('y1', l => l.source.y)
        //         .attr('x2', l => l.target.x)
        //         .attr('y2', l => l.target.y);


        //     if (this.widgets['link-label-variable'] !== 'None') {
        //         linklabels
        //             .attr('x', l => (l.source.x + l.target.x) / 2)
        //             .attr('y', l => (l.source.y + l.target.y) / 2)
        //             .attr('transform', l => 'rotate(' +
        //                 this.visuals.twoD.calcAngle(l.source, l.target) + ' ' +
        //                 (l.source.x + l.target.x) / 2 + ' ' +
        //                 (l.source.y + l.target.y) / 2 + ')'
        //             );
        //     }
        // };
        // this.visuals.twoD.force.nodes(this.visuals.twoD.commonService.session.network.nodes).on('tick', handleTick(this.widgets['polygons-show']));
        // this.visuals.twoD.force.force('link').links(vlinks);
        // this.visuals.twoD.force.alpha(0.3).alphaTarget(0).restart();
        // $('#node-symbol-variable').trigger('change');

        // this.visuals.twoD.ShowStatistics = showStatistics;
        // this.visuals.twoD.cdref.detectChanges();

        // // Get the new SVG dimensions after the network is generated
        // let newSvgWidth = d3.select('svg#network').node().getBoundingClientRect().width;
        // let newSvgHeight = d3.select('svg#network').node().getBoundingClientRect().height;

        // // Update the brush extent
        // this.visuals.twoD.brush.extent([[0, 0], [newSvgWidth, newSvgHeight]]);

        // // Recall the brush to apply the new extent
        // d3.select('g.brush').call(this.visuals.twoD.brush);
    }

    };

    // PRE D3
    /**
     * This function is called when a polygonLabel drag is started; it moves <text> element to last under g.clusterLabels and adds class polygonText to the element
     */
    polygonLabelDragStarted(d) {
        // d3.select(this).raise().attr("class", "polygonText");
    }
    
    /**
     * Moves location of polygon label when it is dragged by updating transform="translate(x,y)"
     */
    polygonLabelDragged(d) {
        // d3.select(this).attr("transform", "translate(" + d3.event.x + "," + d3.event.y + ")");
    }

    /**
     * This function is called when a polygonLabel drag is ended; it removes class polygonText from <text> element
     */
    polygonLabelDragEnded(d) {
        // d3.select(this).attr("class", "");
    }

    /**
     * Generates Polygon Color Selection Table, updates polygonColorMap and polygonAlphaMap functions, and then calls render to show/update network
     * 
     * XXXXX this function needs revisiting. Doesn't always populate table. I had to hide color polygons, then show it, and then show polygon color table setting
     * to get table to appear. Also not sorting correctly with names XXXXX
     */
    updatePolygonColors() {
        let polygonSort = $("<a style='cursor: pointer;'>&#8645;</a>").on("click", e => {
            this.widgets["polygon-color-table-counts-sort"] = "";
          if (this.widgets["polygon-color-table-name-sort"] === "ASC")
          this.widgets["polygon-color-table-name-sort"] = "DESC"
          else
          this.widgets["polygon-color-table-name-sort"] = "ASC"
            this.visuals.twoD.updatePolygonColors();
        });
        let polygonColorHeaderTitle =  (this.visuals.twoD.commonService.session.style['overwrite'] && this.visuals.twoD.commonService.session.style['overwrite']['polygonColorHeaderVariable'] && this.visuals.twoD.commonService.session.style['overwrite']['polygonColorHeaderVariable'] == this.widgets['polygons-foci'] ? this.visuals.twoD.commonService.session.style['overwrite']['polygonColorHeaderTitle'] : "Polygon " + this.visuals.twoD.commonService.titleize(this.widgets['polygons-foci']));
        let polygonHeader = $("<th class='p-1' contenteditable>" + polygonColorHeaderTitle + "</th>").append(polygonSort);
        let countSort = $("<a style='cursor: pointer;'>&#8645;</a>").on("click", e => {
  
            this.widgets["polygon-color-table-name-sort"] = "";
          if (this.widgets["polygon-color-table-counts-sort"] === "ASC")
          this.widgets["polygon-color-table-counts-sort"] = "DESC"
          else
          this.widgets["polygon-color-table-counts-sort"] = "ASC"
            this.visuals.twoD.updatePolygonColors();
        });
        let countHeader = $((this.widgets["polygon-color-table-counts"] ? "<th>Count</th>" : "")).append(countSort);
        let polygonColorTable = $("#polygon-color-table")
          .empty()
          .append($("<tr></tr>"))
          .append(polygonHeader)
          .append(countHeader)
          .append((this.widgets["polygon-color-table-frequencies"] ? "<th>Frequency</th>" : ""))
          .append("<th>Color</th>" );
        if (!this.visuals.twoD.commonService.session.style['polygonValueNames']) this.visuals.twoD.commonService.session.style['polygonValueNames'] = {};
        let aggregates = this.visuals.twoD.commonService.createPolygonColorMap();
        let values = Object.keys(aggregates);
  
        if (this.widgets["polygon-color-table-counts-sort"] == "ASC")
          values.sort(function(a, b) { return aggregates[a] - aggregates[b] });
        else if (this.widgets["polygon-color-table-counts-sort"] == "DESC")
          values.sort(function(a, b) { return aggregates[b] - aggregates[a] });
        if (this.widgets["polygon-color-table-name-sort"] == "ASC")
          values.sort(function(a, b) { return a as any - (b as any) });
        else if (this.widgets["polygon-color-table-name-sort"] == "DESC")
          values.sort(function(a, b) { return b as any - (a as any) });
  
        let total = 0;
        values.forEach(d => total += aggregates[d] );
  
        let that = this;

        values.forEach((value, i) => {
            that.visuals.twoD.commonService.session.style['polygonColors'].splice(i, 1, that.visuals.twoD.commonService.temp.style.polygonColorMap(value));
            that.visuals.twoD.commonService.session.style['polygonAlphas'].splice(i, 1, that.visuals.twoD.commonService.temp.style.polygonAlphaMap(value));
          let colorinput = $('<input type="color" value="' + that.visuals.twoD.commonService.temp.style.polygonColorMap(value) + '">')
            .on("change", function(){
                that.visuals.twoD.commonService.session.style['polygonColors'].splice(i, 1, $(this).val() as string);
                that.visuals.twoD.commonService.temp.style.polygonColorMap = d3
                .scaleOrdinal(that.visuals.twoD.commonService.session.style['polygonColors'])
                .domain(values);
                that._rerender();
            });
          let alphainput = $("<a>⇳</a>").on("click", e => {
            $("#color-transparency-wrapper").css({
              top: e.clientY + 129,
              left: e.clientX,
              display: "block"
            });
            $("#color-transparency")
              .val(that.visuals.twoD.commonService.session.style['polygonAlphas'][i])
              .on("change", function() {
                that.visuals.twoD.commonService.session.style['polygonAlphas'].splice(i, 1, parseFloat($(this).val() as string));
                that.visuals.twoD.commonService.temp.style.polygonAlphaMap = d3
                  .scaleOrdinal(that.visuals.twoD.commonService.session.style['polygonAlphas'])
                  .domain(values);
                $("#color-transparency-wrapper").fadeOut();
                that._rerender();
              });
          });
          let cell = $("<td></td>")
            .append(colorinput)
            .append(alphainput);
  
          let row = $(
            "<tr>" +
              "<td data-value='" + value + "'>" +
                (that.visuals.twoD.commonService.session.style['polygonValueNames'][value] ? that.visuals.twoD.commonService.session.style['polygonValueNames'][value] : that.visuals.twoD.commonService.titleize("" + value)) +
              "</td>" +
              (that.widgets["polygon-color-table-counts"] ? "<td>" + aggregates[value] + "</td>" : "") +
              (that.widgets["polygon-color-table-frequencies"] ? "<td>" + (aggregates[value] / total).toLocaleString() + "</td>" : "") +
            "</tr>"
          ).append(cell);
          polygonColorTable.append(row);
          
        });
        
        // PRE D3
        // this.visuals.twoD.commonService.temp.style.polygonColorMap = d3
        //   .scaleOrdinal(this.visuals.twoD.commonService.session.style['polygonColors'])
        //   .domain(values);
        //   this.visuals.twoD.commonService.temp.style.polygonAlphaMap = d3
        //   .scaleOrdinal(this.visuals.twoD.commonService.session.style['polygonAlphas'])
        //   .domain(values);
  
        polygonColorTable
          .find("td")
          .on("dblclick", function() {
            // $(this).attr("contenteditable", true).focus();
          })
          .on("focusout", function() {
            let $this = $(this);
            // $this.attr("contenteditable", false);
            that.visuals.twoD.commonService.session.style['polygonValueNames'][$this.data("value")] = $this.text();
          });
          
        polygonColorTable
          .find(".p-1")
          .on("focusout", function() {
            that.visuals.twoD.commonService.session.style['overwrite']['polygonColorHeaderVariable'] = that.widgets["polygons-foci"];
            that.visuals.twoD.commonService.session.style['overwrite']['polygonColorHeaderTitle'] = $($(this).contents()[0]).text();
          });

          let isAscending = true;  // add this line before the click event handler


        // The sorting functionality is added here
        $('#polygon-color-table').on('click', 'th', function () {
            let table = $(this).parents('table').eq(0);
            let rows = table.find('tr:gt(0)').toArray().sort(comparer($(this).index()));
            isAscending = !isAscending;  // replace 'this.asc' with 'isAscending'
            if (!isAscending){rows = rows.reverse();}
            for (let i = 0; i < rows.length; i++) { table.append(rows[i]); }
        });

        function comparer(index) {
            return function(a, b) {
                let valA = getCellValue(a, index), valB = getCellValue(b, index);
                console.log(`Comparing: ${valA} and ${valB}`);  // New line
                return !isNaN(Number(valA)) && !isNaN(Number(valB)) ? Number(valA) - Number(valB) : valA.toString().localeCompare(valB);
            }
        }

        function getCellValue(row, index) {
            return $(row).children('td').eq(index).text();
        }
  
      }

    /**
     * This function is called when polygon-show widget is updated from the template.
     * That widget controls whether polygons are shown or not
     * 
     */
    polygonsToggle(flag : boolean) {
        
        this.widgets['polygons-show'] = flag;

        this.showParallel = flag;

        if(flag) {
            if(this.widgets['polygons-color-show'] == true){
                $('#polygons-color-show').click();
              } else {
                $('#polygons-color-hide').click();
              }
              if(this.widgets['polygons-label-show'] == true){
                $('#polygons-label-show').click();
              } else {
                $('#polygons-label-hide').click();
              }
        } else {
            $(".polygons-settings-row").slideUp();
            $('.polygons-label-row').slideUp();
            $("#polygon-color-table-row").slideUp();
            $("#polygon-color-value-row").slideUp();
            $("#polygon-color-table").empty();

            this.visuals.twoD.PolygonColorTableWrapperDialogSettings.setVisibility(false);
        }

    }
    /**
     * This function is called when polygon-color-show widget is updated from the template.
     * This widget controls whether polygon should be colored the same or different.
     * 
     * XXXXX I think this function wasn't updated with the move to Angular; most of the code 
     * seems redundant/unnecessary. Evaluate whether function can be reduce/eliminated. XXXXX
     */
    polygonColorsToggle(e) {
        if (e) {
            this.widgets['polygons-color-show'] = true;
            $("#polygon-color-value-row").slideUp();
            $("#polygon-color-table-row").slideDown();
            this.visuals.twoD.PolygonColorTableWrapperDialogSettings.setVisibility(true);
            // this.visuals.twoD.updatePolygonColors();

            setTimeout(() => {
                this.visuals.twoD.updatePolygonColors();
                this._rerender();
            }, 200);

        }
        else {
            this.widgets['polygons-color-show'] = false;
            $("#polygon-color-value-row").slideDown();
            $("#polygon-color-table-row").slideUp();
            $("#polygon-color-table").empty();
            this.visuals.twoD.PolygonColorTableWrapperDialogSettings.setVisibility(false);

        }
    }

    /**
     * This function is called when polygon-color widget is updated from the template. 
     * It is only available when polygon-color-show is false/hide
     * This widget control polygon color when they are all colored the same.
     * 
     * XXXXX I think this function wasn't updated with the move to Angular. 
     * Evaluate whether function can be reduce/eliminated. XXXXX
     */
    onPolygonColorChanged(e) {
        this.widgets["polygon-color"] = e;
        this._rerender();
    }

    /**
     * This function is called when polygon-color-table-visible widget is updated from the template. 
     * It is only available when polygon-color-show is true/show
     * This widget controls whether the polygon color table is visible.
     * 
     * XXXXX I think this function wasn't updated with the move to Angular. 
     * Evaluate whether function can be reduce/eliminated. XXXXX
     */
    polygonColorsTableToggle(e) {

        if (e) {
            this.visuals.twoD.onPolygonColorTableChange('Show')
        }
        else {
            this.visuals.twoD.onPolygonColorTableChange('Hide')
        }

        this.visuals.twoD._rerender();
    }

    private polygonNodeSelected = null;

    /**
     * Executed when a polygon drag is start. All nodes within that polygon have variable selected set to true; other nodes have variable selected
     * set to false. node-selected event is triggered and dragstarted is called
     */
    polygonDragStarted(n) {
        this.visuals.twoD.commonService.session.data.nodes.forEach(sessionNode => {

            let tempAry = n.values.filter(node => {
                return node._id == sessionNode._id;
            });

            if (tempAry.length > 0) {
                if(!this.polygonNodeSelected) {
                    this.polygonNodeSelected = sessionNode;
                }
                sessionNode.selected = true;
            } else {
                sessionNode.selected = false
            }

      });

      $(document).trigger('node-selected');

      if(this.polygonNodeSelected) {
        this.dragstarted(this.polygonNodeSelected);
      }
    }

    /**
     * Executed when a polygon is dragged. The dragged function is called and appropriated nodes previously had selected set to true
     */
    polygonDragged(n) {
      if(this.polygonNodeSelected) {
        this.dragged(this.polygonNodeSelected);
      }

    }

    /**
     * Calls the dragend function for the nodes. also polygonNodeSelected variable is set to null, and all nodes have selected set to false
     */
    polygonDragEnded(n) {
      if(this.polygonNodeSelected) {
        this.dragended(this.polygonNodeSelected);
      }

      this.polygonNodeSelected = null;

      this.visuals.twoD.commonService.session.data.nodes.forEach(sessionNode => {
        sessionNode.selected = false
      });

      $(document).trigger('node-selected');

    }

    /**
     * Gets a list of all visible links objects; Similar to getLlinks(), and commonService.getVisibleLinks()
     * 
     * Each link object has a single origin, so any links that have more than one origin are stored as separed link objects
     * 
     * Each link's source and target are node object
     * @returns a array of link objects; each link's source and target are node object
     */
    getVLinks() {
        let vlinks = this.visuals.twoD.commonService.getVisibleLinks(true);
        let output = [];
        let n = vlinks.length;
        let nodes = this.visuals.twoD.commonService.session.network.nodes;
        for (let i = 0; i < n; i++) {
            if (vlinks[i].origin) {
                if (typeof vlinks[i].origin === 'object') {
                    if (vlinks[i].origin.length > 0) {
                      // 0 = current, j = index, l = array
                      vlinks[i].origin.forEach((o, j, l) => {
                          const holder = Object.assign({}, vlinks[i], {
                              origin: o,
                              oNum: j,
                              origins: l.length,
                              source: nodes.find(d => d._id === vlinks[i].source || d.id === vlinks[i].source),
                              target: nodes.find(d => d._id === vlinks[i].target || d.id === vlinks[i].target)
                          });
                          output.push(holder);
                      });
                  } else {
                    const holder = Object.assign({}, vlinks[i], {
                        oNum: 0,
                        origins: 1,
                        source: nodes.find(d => d._id === vlinks[i].source || d.id === vlinks[i].source),
                        target: nodes.find(d => d._id === vlinks[i].target || d.id === vlinks[i].target)
                    });
                      output.push(holder);
                  }
                } else {
                    const holder = Object.assign({}, vlinks[i], {
                        oNum: 0,
                        origins: 1,
                        source: nodes.find(d => d._id === vlinks[i].source || d.id === vlinks[i].source),
                        target: nodes.find(d => d._id === vlinks[i].target || d.id === vlinks[i].target)
                    });
                      //console.log(holder);
                      output.push(holder);
                }
            } else {
                const holder = Object.assign({}, vlinks[i], {
                    origin: 'Unknown',
                    oNum: 0,
                    origins: 1,
                    source: nodes.find(d => d._id === vlinks[i].source || d.id === vlinks[i].source),
                    target: nodes.find(d => d._id === vlinks[i].target || d.id === vlinks[i].target)
                });
                    output.push(holder);
            }
        }

        output =  output.filter(x=>x.source != undefined && x.target != undefined);
        return output;
    };

    /**
     * Gets a list of all visible links objects; Similar to getVlinks(), and commonService.getVisibleLinks()
     * 
     * A link that has multiple origins is stored as a single object
     * 
     * Each link's source and target are node object
     * @returns a array of link objects; each link's source and target are node object
     */
    getLLinks() {
        let vlinks = this.visuals.twoD.commonService.getVisibleLinks(true);
        let n = vlinks.length;
        for (let i = 0; i < n; i++) {
            vlinks[i].source = this.visuals.twoD.commonService.session.network.nodes.find(d => d._id == vlinks[i].source);
            vlinks[i].target = this.visuals.twoD.commonService.session.network.nodes.find(d => d._id == vlinks[i].target);
        }
        return vlinks;
    };

    /**
     * Used to calculate the angle between two nodes. It is used when setting link label
     * @param source source node
     * @param target target node
     */
    calcAngle(source, target) {
        return Math.atan((source.y - target.y) / (source.x - target.x)) * this.visuals.twoD.radToDeg;
    };

    /**
     * When a node (or multiple nodes) drag is started, update value of this.multidrag and this.selected and set the fx and fy values for each node selected
     * @param n node/nodes
     */
    dragstarted(n) {
        
        // if (!d3.event.active) this.visuals.twoD.force.alphaTarget(0.3).restart();
        function setNode(d) {
            d.fx = d.x;
            d.fy = d.y;
        }
        // this.visuals.twoD.multidrag = n.selected;
        // this.visuals.twoD.selected = this.visuals.twoD.svg.select('g.nodes')
        //     .selectAll('g')
        //     .data(this.visuals.twoD.commonService.session.network.nodes)
        //     .filter(d => d.selected);
        // if (this.visuals.twoD.multidrag) {
        //     this.visuals.twoD.selected.each(setNode);
        // } else {
        //     setNode(n);
        // }
    };

    /**
     * When a node (or multiple nodes) is dragged, update value fx and fy for each node selected
     * @param n node/nodes
     */
    dragged(n) {
        // function updateNode(d) {
        //     d.fx += d3.event.dx;
        //     d.fy += d3.event.dy;
        // }
        // if (this.visuals.twoD.multidrag) {
        //     this.visuals.twoD.selected.each(updateNode);
        // } else {
        //     updateNode(n);
        // }
    };

    /**
     * When a node (or multiple nodes) is ended, update value fx and fy to null (unless node is pinned) for each node selected
     * @param n node/nodes
     */
    dragended(n) {
        // if (!d3.event.active) this.visuals.twoD.force.alphaTarget(0);
        // let that = this;
        // function unsetNode(d) {
        //     if (!d.fixed) {
        //         d.fx = null;
        //         d.fy = null;
        //     } else {
        //         // save node location back to temp network for pinned network
        //         if(that.widgets["timeline-date-field"] != 'None') {
        //           let node = that.visuals.twoD.commonService.session.network.timelineNodes.find(d2 => d2._id == d._id);
        //           if(node) {
        //             node.x = d.x;
        //             node.y = d.y;
        //             node.fx = d.fx;
        //             node.fy = d.fy;
        //           }
        //         }
        //       }
        // }
        // if (this.visuals.twoD.multidrag) {
        //     this.visuals.twoD.selected.each(unsetNode);
        // } else {
        //     unsetNode(n);
        // }
    };

    /**
     * Click event handler, updates the node.selected value
     * @param n 
     */
    clickHandler(n) {
        //console.log('event: ',d3.event)
        // if (d3.event && d3.event.key === "Shift") {
        //     this.visuals.twoD.commonService.session.data.nodes.find(node => node._id == n._id).selected = !n.selected;
        // } else {
        //     this.visuals.twoD.commonService.session.data.nodes.forEach(node => {
        //         if (node._id == n._id) {
        //             node.selected = !node.selected;
        //         } else {
        //             node.selected = false;
        //         }
        //     });
        // }
        // if (d3.event && d3.event.key === "Shift") {
        //     this.visuals.twoD.commonService.session.data.nodes.find(node => node._id == n._id).selected = !n.selected;
        // } else {
        //     this.visuals.twoD.commonService.session.data.nodes.forEach(node => {
        //         if (node._id == n._id) {
        //             node.selected = !n.selected;
        //         } else {
        //             node.selected = false;
        //         }
        //     });
        // }
 
        // this.visuals.twoD.render(false);

        // $(document).trigger('node-selected');
    };

    /**
     * Used from Context Menu and copy node's ID to the user's clipboard
     */
    copyID() {
        let id = $('#copyID').attr('data-clipboard-text')
        this.clipboard.copy(id);
        this.hideContextMenu();
    }

    /**
     * Used from Context Menu and copy node's sequence to the user's clipboard
     */
    copySeq() {
        let seq = $('#copySeq').attr('data-clipboard-text')
        this.clipboard.copy(seq);
        this.hideContextMenu()
    }

    /**
     * Upon right clicking a node, d, the context menu will appear, which allows the user to option to pin node, copy id, copy sequence, or view attributes
     * @param d the node right clicked
     */
    showContextMenu(d) {
        // d3.event.preventDefault();
        // this.visuals.twoD.hideTooltip();
        // $('#copyID').attr('data-clipboard-text', d._id);
        // if (d.seq === null || d.seq === undefined || d.seq === "") {
        //     $('#copySeq').prop('disabled', true);
        // } else {
        //     $('#copySeq').prop('disabled', false).attr('data-clipboard-text', d.seq);
        // }

        // d3.select('#viewAttributes').on('click', () => {

        //     this.visuals.twoD.ContextSelectedNodeAttributes = [];

        //     this.visuals.twoD.hideContextMenu();

        //     this.visuals.twoD.ShowNetworkAttributes = true;
        //     this.visuals.twoD.cdref.detectChanges();

        //     let nd = this.visuals.twoD.commonService.session.data.nodes.find(nd => nd._id == d._id);
        //     for (let attribute in nd) {
        //         if (attribute[0] == '_' && attribute !== '_id' || attribute == 'data') continue; // DC: where is data being added as an attribute to each node should data be removed here
        //         this.visuals.twoD.ContextSelectedNodeAttributes.push({attribute: this.visuals.twoD.commonService.titleize(attribute), value: d[attribute]});
        //     }

        //     this.visuals.twoD.ContextSelectedNodeAttributes = this.visuals.twoD.ContextSelectedNodeAttributes
        //         .filter(x=>x.attribute !== "Seq" && x.value !== undefined && x.value !== null && x.value !== "" )
        //         .concat(this.visuals.twoD.ContextSelectedNodeAttributes.filter(x=>x.attribute !== "Seq" && (x.value === undefined || x.value === null || x.value === "" )))
        //         .concat(this.visuals.twoD.ContextSelectedNodeAttributes.filter(x=>x.attribute === "Seq"));

        // }).node().focus();
        // if (d.fixed) {
        //     $('#pinNode').text('Unpin Node').on('click', () => {

        //         d.fx = null;
        //         d.fy = null;
        //         d.fixed = false;
        //         this.visuals.twoD.force.alpha(0.3).alphaTarget(0).restart();
        //         this.visuals.twoD.hideContextMenu();
        //     });

        // } else {
        //     $('#pinNode').text('Pin Node').on('click', () => {

        //         d.fx = d.x;
        //         d.fy = d.y;
        //         d.fixed = true;
        //         this.visuals.twoD.hideContextMenu();
        //     });
        // }

        // let [X, Y] = this.getRelativeMousePosition();
        // $('#context-menu').css({
        //     'z-index': 1000,
        //     'display': 'block',
        //     'left': (X-200) + 'px',
        //     'top': (Y+30) + 'px',
        // }).animate({ 'opacity': 1 }, 80);
    };

    /**
     * Hides the Context Menu
     */
    hideContextMenu() {
        $('#context-menu').animate({ 'opacity': 0 }, 80, function() {
            $(this).css('z-index', -1);
        });
    };
    
    /**
     * This function capitalizes the first letter of each word in a string.
     * @param str input string
     * @returns input string with first letter capitalized
     */
    titleize(str: string) {
        return str.replace(/\b\w/g, l => l.toUpperCase());
    }
    
    /**
     * Generate a tabular HTML string from the data array
     * @param data [ [Col1, ...], ...] - An Array of arrays where arrays within outer array represent different rows and
     *  values within inner array represent the cells within that row
     * @returns an HTML string with a table representation of the data
     */
    tabulate(data: any[]) {

        let tableHtml = `
            <style>
            #tooltip-table {
                border-spacing: 0;
                width: 100%;
                border: 1px solid #ddd;
                z-index: 1000;
            }
            
            #tooltip-table td, #tooltip-table th {
                text-align: left;
                padding: 16px;
                border: 1px solid #ddd;
            }
            
            #tooltip-table tr:nth-child(even) {
                background-color: #f2f2f2;
            }
            
            #tooltip-table tr:nth-child(odd) {
                background-color: #fff;
            }
            </style>
            <table id="tooltip-table"><tbody>`;

        for (let row of data) {
            tableHtml += '<tr>';
            for (let cell of row) {
                tableHtml += '<td>' + cell + '</td>';
            }
            tableHtml += '</tr>';
        }
        tableHtml += '</tbody></table>';

        return tableHtml;
    }

    /**
     * Highlights the node and all of its neighbor (shares a link with) and the links that the node is 
     * a source or target
     * @param node node that is mouseover by user
     */
    highlightNeighbors(node) {
        let links = this.visuals.twoD.getVLinks();
        let lindices = [], neighbors = [node._id];

        let n = links.length;
        for (let i = 0; i < n; i++) {
            let l = links[i];
            if (l.source._id !== node._id && l.target._id !== node._id) {
                lindices.push(l.index);
            } else {
                if (l.source._id == node._id) {
                    neighbors.push(l.target._id);
                } else {
                    neighbors.push(l.source._id);
                }
            }
        }
        // highlights current node and its neighbors
        // this.visuals.twoD.svg
        //     .select('g.nodes')
        //     .selectAll('g')
        //     .selectAll('path')
        //     .attr('opacity', d => this.visuals.twoD.commonService.includes(neighbors, d._id) ? 1 : .1);
        // hightlights all of current node's links
        // this.visuals.twoD.svg
        //     .select('g.links')
        //     .selectAll('line')
        //     .data(links)
        //     .attr('opacity', l => this.visuals.twoD.commonService.includes(lindices, l.index) ? .1 : 1);
    };

    /**
     * Gets data from current node needed for tooltip and displays it in the tooltip also hightlights neighbors if that option is selected
     * @param d a node
     */
    showNodeTooltip(d, event) {
    
        // If no tooltip variable is selected, we shouldn't show a tooltip
        if (this.widgets['node-tooltip-variable'].length > 0 && this.widgets['node-tooltip-variable'][0] == 'None') {
            if (this.widgets['node-highlight']) {
                this.selectedNodeId = d.id;
                this._rerender();
            }
            return;
        }

        if (this.widgets['node-highlight']) {
            console.log('in flag: ');
            this.selectedNodeId = d.id;
            this._rerender();
        }
    }

    /**
     * Gets data from current link needed for tooltip and displays it in the tooltip
     * @param d link
     */
    showLinkTooltip(d, event) {
        let v: any = this.visuals.twoD.SelectedLinkTooltipVariable;

        if (v == 'None') return;


        // Tooltip variables can be a single string or an array
        let tooltipVariables = this.visuals.twoD.SelectedLinkTooltipVariable;
        if (!Array.isArray(tooltipVariables)) {
            tooltipVariables = [tooltipVariables];
            this.visuals.twoD.SelectedLinkTooltipVariable = tooltipVariables;  // Update SelectedLinkTooltipVariable to be an array
        }

        // If no tooltip variable is selected, we shouldn't show a tooltip
        if (tooltipVariables.length > 0 && tooltipVariables[0] == 'None') 
            return;

        /**
         * @param data link
         * @param varName name of variable
         * @returns the value of the link for the variable
         */
        let getData = (data, varName) => {
            if (varName == 'source_id') {
                return data['source']._id
            } else if (varName == 'source_index') {
                return data['source'].index
            } else if (varName == 'target_id') {
                return data['target']._id
            } else if (varName == 'target_index') {
                return data['target'].index
            } else {
                return data[varName];
            }
        }

        // Generate the HTML for the tooltip
        let tooltipHtml = '';
        if (tooltipVariables.length > 1) {
            tooltipHtml = this.tabulate(tooltipVariables.map(variable => [this.titleize(variable), getData(d,variable)]));
        } else {
            tooltipHtml = getData(d, tooltipVariables[0])
        }

        let [X, Y] = this.getRelativeMousePosition(event);
        d3.select('#tooltip')
            .html(tooltipHtml)
            .style('position', 'absolute')
            .style('left', (X+ 10) + 'px')
            .style('top', (Y - 10) + 'px')
            .style('z-index', 1000)
            .transition().duration(100)
            .style('opacity', 1);
    };

    /**
     * Hides the Tooltip
     */
    hideTooltip() {
        if (this.widgets['node-highlight']) {
            this.selectedNodeId = undefined;
            this._rerender();
        }
        let tooltip = d3.select('#tooltip');
        tooltip
            .transition().duration(100)
            .style('opacity', 0)
            .on('end', () => tooltip.style('z-index', -1));
    };


    /**
     * @returns {boolean} if a is a number
     */
    isNumber(a): boolean {
        return typeof a == "number";
    };

    /**
     * This function updates the nodes based on node-symbol, node-symbol-variable, node-radius, node-radius-variable, node-radius-min, node-radius-max.
     * It does not add new nodes to the DOM.
     */
    redrawNodes() {


        //Things to track in the function:
        //* Shapes:
        // let type = d3[this.widgets['node-symbol']];
        let symbolVariable = this.widgets['node-symbol-variable'];
       
        // // Custom Shape Selected
        // if (type === undefined) {
        //     type = this.customShapes.shapes[this.widgets['node-symbol']];
        // }

        // //* Sizes:
        // let defaultSize = this.widgets['node-radius'];
        // let size = defaultSize, med = defaultSize, oldrng, min, max;
        // let sizeVariable = this.widgets['node-radius-variable'];
        // let scale;
        // let nodes;
        // if (sizeVariable !== 'None') {
        //     if (this.widgets["timeline-date-field"] == 'None') nodes = this.visuals.twoD.commonService.session.network.nodes;
        //     else nodes = this.visuals.twoD.commonService.session.network.timelineNodes;
        //     let n = this.visuals.twoD.commonService.session.network.nodes.length;
        //     min = Number.MAX_VALUE;
        //     max = Number.MIN_VALUE;
        //     for (let i = 0; i < n; i++) {
        //         let size = this.visuals.twoD.commonService.session.network.nodes[i][sizeVariable];
        //         if (typeof size == 'undefined') continue;
        //         if (size < min) min = size;
        //         if (size > max) max = size;
        //     }
        //     oldrng = max - min;
        //     med = oldrng / 2;

        //     let maxWidth = this.widgets['node-radius-max'];
        //     let minWidth = this.widgets['node-radius-min'];
        //     // scale = d3.scaleLinear()
        //     // .domain([min, max])
        //     // .range([minWidth, maxWidth]);
        //     }
        
        // nodes = this.visuals.twoD.svg.select('g.nodes').selectAll('g').data(this.visuals.twoD.commonService.session.network.nodes);

        // // TODO: Hides table row by default if no symbol variable - clean up
        // if(symbolVariable === 'None') {
        //     $('#node-symbol-table-row').slideUp();
        // }

        // // console.log('nodes: ', nodes);

        // let that = this;

        // nodes.selectAll('path').each(function (d) {

        //     if (symbolVariable !== 'None') {

        //         // type = d3[that.visuals.twoD.commonService.temp.style.nodeSymbolMap(d[symbolVariable])];

        //         // if (type === undefined) {
        //         //     type = that.customShapes.shapes[that.visuals.twoD.commonService.temp.style.nodeSymbolMap(d[symbolVariable])];
        //         // }
    
        //     } 
        //     if (sizeVariable !== 'None') {
        //       size = d[sizeVariable];
        //       if (!that.isNumber(size)) size = med;
        //       size = scale(size);
        //     }

        //     // d3.select(this).attr('d', d3.symbol().size(size).type(type));    
            
        //   });
    };

    /**
     * redraws/updates node borders based on node-border-width
     */
    private redrawNodeBorder(){
        // let nodes = this.visuals.twoD.svg.select('g.nodes').selectAll('g').data(this.visuals.twoD.commonService.session.network.nodes);
        // nodes
        //   .selectAll('path')
        //   .style('stroke', 'black')
        //   .style('stroke-width', this.widgets['node-border-width']);
      }

    /**
     * uses values from node-label-variable, node-label-size, and node-label-orietation to add/remove labels from the the nodes
     */
    redrawLabels() {

        // let nodes = this.visuals.twoD.svg.select('g.nodes').selectAll('g').data(this.visuals.twoD.commonService.session.network.nodes).select('text'),
        //     labelVar = this.widgets['node-label-variable'];
        // if (labelVar == 'None') {
        //     nodes.text('');
        // } else {
        //     let size = this.widgets['node-label-size'],
        //         orientation = this.widgets['node-label-orientation'];
        //     nodes
        //         .text(n => n[labelVar])
        //         .style('font-size', size + 'px');
        //     switch (orientation) {
        //         case 'Left':
        //             nodes
        //                 .attr('text-anchor', 'end')
        //                 .attr('dx', -8)
        //                 .attr('dy', (size - 4) / 2);
        //             break;
        //         case 'Top':
        //             nodes
        //                 .attr('text-anchor', 'middle')
        //                 .attr('dx', 0)
        //                 .attr('dy', 4 - size);
        //             break;
        //         case 'Bottom':
        //             nodes
        //                 .attr('text-anchor', 'middle')
        //                 .attr('dx', 0)
        //                 .attr('dy', size + 4);
        //             break;
        //         case 'Middle':
        //             nodes
        //                 .attr('text-anchor', 'middle')
        //                 .attr('dx', 0)
        //                 .attr('dy', (size - 4) / 2);
        //             break;
        //         default: //'right'
        //             nodes
        //                 .attr('text-anchor', 'start')
        //                 .attr('dx', 8)
        //                 .attr('dy', (size - 4) / 2);
        //     }
        // }
    };

    /**
     * This is called when the variable used to grouped by/created polygons is changed
     * 
     * XXXXX May be worth revisiting when other polygon functions are updated. Some lines are probably not necessary XXXXX 
     */
    centerPolygons(e) {

        this.widgets['polygons-foci'] = e;
        this._rerender();
        if(this.widgets['polygons-color-show'] == true) {
          $("#polygon-color-table").empty();
          this.visuals.twoD.updatePolygonColors();
        //   this._rerender();
        }
        
        if (e == 'None') {
            $('#color-polygons').slideDown();
            $('#polygon-color-value-row').slideDown();
          } else {
            $('#color-polygons').css('display', 'flex');
            $('#polygon-color-value-row').slideUp();
          }
    }

    /**
     * Calls setPolygonLabelSize to update polygon-label-size widget and then redraws polygon labels
     */
    onPolygonLabelSizeChange(e) {
        this.widgets['polygons-label-size'] = parseFloat(e);
        document.documentElement.style.setProperty('--vis-graph-panel-label-font-size', e + 'px');
        this.cdref.detectChanges();
    }

    /**
     * Updates polygons-label-orientation widget and then redraws polygon labels
     */
    onPolygonLabelOrientationChange(e) {
        this.widgets['polygons-label-orientation'] = e;
        this._rerender();
    }

    /**
     * Updates polygons-label-show widget and the renders the network again
     */
    onPolygonLabelShowChange(e) {
        if (e) {
            this.widgets['polygons-label-show'] = true;
            $('.polygons-label-row').slideDown();
        }
        else {
            this.widgets['polygons-label-show'] = false;
            $('.polygons-label-row').slideUp();
        }

        this._rerender();
    }


    /**
     * XXXXX reevaluate if need to be combined with polygonColorsTableToggle; when called from polygonColorsTableToggle e is 'Show'/'Hide' when called
     * from template e is true/false XXXXX
     */
    onPolygonColorTableChange(e) {
        this.SelectedNetworkTableTypeVariable = e;
        this.widgets["polygon-color-table-visible"] = e;
        if (this.SelectedNetworkTableTypeVariable == 'Show') {
            this.PolygonColorTableWrapperDialogSettings.setVisibility(true);
        }
        else {
            // this.PolygonColorTableWrapperDialogSettings.setVisibility(false);
        }
    }


    /*/
        Node Events
    /*/

    /**
     * updates the value of the appropriate widget, add/removes rows from dialog menu, and calls redrawLabels to update labels on svg/view
     * @param e the name of variable to change labels to
     */
    onNodeLabelVaribleChange(e) {

        this.widgets['node-label-variable'] = e;
        if (e == 'None') {
            $('.node-label-row').slideUp();
        } else {
            $('.node-label-row').css('display', 'flex');
        }

        this._rerender();
    }

    /**
     * Gets the label for a node based on node label variable
     * @param node the node retrieve to get the value of the variable
     */
    getNodeLabel( node : any) {

        // If no label variable then should be none
        return (this.widgets['node-label-variable'] == 'None') ? '' : node[this.widgets['node-label-variable']];
    
    }

    /**
     * Gets the label for a link based on link label variable
     * @param node the link we retrieve to get the value of the variable
     */
    getLinkLabel( link : any) {

        // console.log('link variable: ',this.widgets['link-label-variable'] );
        let labelVariable = this.widgets['link-label-variable'];
        // If no label variable then should be none
        if (labelVariable == 'None') {
            return { text : ''};
        } else {
            // console.log('link variable2: ',this.visuals.twoD.commonService.session.data.links[index]);

            if (labelVariable == 'source_id') {
                return link['source']['id']
            } else if (labelVariable == 'source_index') {
                return link['source']['index']
            } else if (labelVariable == 'target_id') {
                return link['target']['id']
            } else if(labelVariable == 'target_index') {
                return link['target']['index']
            } else if (labelVariable != 'distance') {
                return { text : link[labelVariable] };
            }
            console.log('cluster link: ', link);
            const labelValue = link[labelVariable];
            if (typeof labelValue === 'number' || !isNaN(parseFloat(labelValue))) {
                // console.log('is number');
                if(this.widgets['default-distance-metric'] == 'snps') {
                    return { text :  Math.round(parseFloat(labelValue))};
                } else {
                    return (labelValue != 0) ?  { text : parseFloat(labelValue).toFixed(this.widgets['link-label-decimal-length']) } : { text : ''};
                }                
            } else {

                    return { text : labelValue};
            }

        }
    }


    /**
     * Calls setNodeLabelSize to update label-size and redraw labels
     */
    onNodeLabelSizeChange(e) {
        this.setNodeLabelSize(e.target.value);
    }

    /**
     * Updates node-label-size and then redraws labels
     */
    setNodeLabelSize(size) {
        this.widgets['node-label-size'] = parseFloat(size);
        document.documentElement.style.setProperty('--vis-graph-node-label-font-size', `${this.SelectedNodeLabelSizeVariable}pt`);
    }
    

    /**
     * Updates node-label-orientation and then redraws labels
     * @param e orientation such as Right, Left, Top, Bottom, Middle
     */
    onNodeLabelOrientationChange(e) {
        this.widgets['node-label-orientation'] = e;
        this.visuals.twoD.redrawLabels();
    }

    /**
     * updates node-tooltip-variable
     */
    onNodeTooltipVariableChange(e) {

        let selectedValue = e;

        if (!Array.isArray(selectedValue)) {
            selectedValue = [selectedValue];
        }

        this.widgets['node-tooltip-variable'] = selectedValue;
        
    }

    onNodeSymbolVariableChange(e, setVisibility = true) {

            this.widgets['node-symbol-variable'] = this.SelectedNodeSymbolVariable;


            if(setVisibility){
                this.visuals.twoD.NodeSymbolTableWrapperDialogSettings.setVisibility(true);
                this.visuals.twoD.SelectedNetworkTableTypeVariable = "Show";

                if (this.SelectedNodeSymbolVariable !== 'None') {

                    $('#node-symbol-row').slideUp();
                    
                    //If hidden by default, unhide to perform slide up and down
                    if(!this.ShowNodeSymbolTable){
                        this.ShowNodeSymbolTable = true;
                    } else {
                        $('#node-symbol-table-row').slideDown();
                    }

                    if (!this.ShowNodeSymbolWrapper) {
                        this.ShowNodeSymbolWrapper = true;
                    }
                // No shape by variable selected
                // show shape, hide table 
                } else {

                    $('#node-symbol-row').slideDown();
                    $('#node-symbol-table-row').slideUp();
                    if (this.ShowNodeSymbolWrapper) {
                        this.ShowNodeSymbolWrapper = false;
                    }
                    this.onNodeSymbolTableChange('Hide');

                }
    
            }
            // if(e !== 'None' && setVisibility){
            //     this.visuals.twoD.NodeSymbolTableWrapperDialogSettings.setVisibility(true);
            //     this.visuals.twoD.SelectedNetworkTableTypeVariable = "Show";

            //     if (this.SelectedNodeSymbolVariable !== 'None') {

            //         $('#node-symbol-row').slideUp();
                    
            //         //If hidden by default, unhide to perform slide up and down
            //         if(!this.ShowNodeSymbolTable){
            //             this.ShowNodeSymbolTable = true;
            //         } else {
            //             $('#node-symbol-table-row').slideDown();
            //         }

            //     // No shape by variable selected
            //     // show shape, hide table 
            //     } else {

            //         $('#node-symbol-row').slideDown();
            //         $('#node-symbol-table-row').slideUp();
            //         this.onNodeSymbolTableChange('Hide');

            //     }
    
            // }


            // this.visuals.twoD.cdref.detectChanges();

            this.generateNodeSymbolSelectionTable("#node-symbol-table", e);
            this._rerender();
    }

    svgDefs = `
    <path id="blob" d="M 19.415 1.0564 C 20.585 2.47 20.225 5.89 21.665 8.2612 C 23.06 10.678 26.345 12.046 28.325 14.554 C 30.305 17.1076 31.025 20.8012 28.865 21.9412 C 26.75 23.1268 21.755 21.7588 18.605 23.3092 C 15.455 24.8596 14.105 29.3284 12.485 29.8756 C 10.865 30.3772 8.93 27.0028 6.41 25.042 C 3.89 23.1268 0.83 22.6708 0.38 20.9836 C -0.07 19.2964 2.135 16.378 2.54 13.642 C 2.945 10.9516 1.55 8.4892 2.135 7.03 C 2.72 5.5708 5.285 5.1148 7.355 4.294 C 9.47 3.4276 11.135 2.1964 13.34 1.2388 C 15.545 0.3268 18.245 -0.3116 19.415 1.0564 Z"/>
    <path id="cloud" d="M 14 -1 A 9 9 90 0 0 5 8 A 9 9 90 0 0 5.1055 9.3125 A 6 6 90 0 0 1 15 A 6 6 90 0 0 7 21 L 22 21 A 7 7 90 0 0 29 14 A 7 7 90 0 0 22.9414 7.0703 A 9 9 90 0 0 14 -1 z"/>
    <polygon id="diamond" points="0,15 15,0 30,15 15,30"/>
    <polygon id="house" points="4,18 4,30 13,30 13,24 17,24 17,30 26,30 26,18 30,18 15,0 0,18"/>
    `;

    public generateNodeSymbolSelectionTable(tableId: string, variable: string, isEditable: boolean = true) {
        this.visuals.microbeTrace.clearTable(tableId);

        let symbolMapping: { key: string, value: string }[] = [
            { key: 'symbolCircle', value: '&#11044; (Circle)' },
            { key: "symbolTriangle", value: '&#9650; (Up Triangle)' },
            // { key: "symbolTriangleDown", value: '&#9660; (Down Triangle)' },
            // { key: "symbolTriangleLeft", value: '&#9664; (Left Triangle)' },
            // { key: "symbolTriangleRight", value: '&#9654; (Right Triangle)' },
            { key: "symbolDiamond", value: '&#10731; (Vertical Diamond)' },
            // { key: "symbolDiamondAlt", value: '&#10731; (Horizontal Diamond)' },
            { key: "symbolSquare", value: '&#9632; (Square)' },
            // { key: "symbolDiamondSquare", value: '&#9670; (Tilted Square)' },
            // { key: "symbolPentagon", value: '&#11039; (Pentagon)' },
            { key: "symbolHexagon", value: '&#11042; (Hexagon)' },
            // { key: "symbolHexagonAlt", value: '&#11043; (Tilted Hexagon)' },
            // { key: "symbolOctagon", value: '&#11042; (Octagon)' },
            // { key: "symbolOctagonAlt", value: '&#11043; (Tilted Octagon)' },
            // { key: "symbolCross", value: '&#10010; (Addition Sign)' },
            // { key: "symbolX", value: '&#10006; (Multiplication Sign)' },
            // { key: "symbolWye", value: '&#120300; (Wye)' },
            // { key: "symbolStar", value: '&#9733; (Star)' },
        ];

        setTimeout(() => {
    
            let table = $(tableId)
            const disabled: string = isEditable ? '' : 'disabled';

            this.widgets['node-symbol-variable'] = variable;

            if (variable === 'None' && !isEditable) return;

            let values = [];
            let aggregates = {};
            let nodes = this.visuals.twoD.commonService.session.data.nodes;
            let n = nodes.length;
            let vnodes = 0;
            for (let i = 0; i < n; i++) {
                let d = nodes[i];
                if (!d.visible) continue;
                vnodes++;
                let dv = d[variable];
                if (values.indexOf(dv) == -1) values.push(dv);
                if (dv in aggregates) {
                    aggregates[dv]++;
                } else {
                    aggregates[dv] = 1;
                }
            }

            if (values.length > this.visuals.twoD.commonService.session.style.nodeSymbols.length) {
                let symbols = [];
                let m = Math.ceil(values.length / this.visuals.twoD.commonService.session.style.nodeSymbols.length);
                while (m-- > 0) {
                    symbols = symbols.concat(this.visuals.twoD.commonService.session.style.nodeSymbols);
                }
                this.visuals.twoD.commonService.session.style.nodeSymbols = symbols;
                // console.log('node symbols: ', symbols);

            }

            table.empty().append(
                "<tr>" +
                `<th class="${isEditable ? 'table-header-row' : ''}" ${isEditable ? 'contenteditable' : ''}><div class="header-content sortable">Node ${this.commonService.titleize(variable)}<a class='sort-button' style='cursor: pointer'>⇅</a></div></th>` +
                (this.widgets['node-symbol-table-counts']
                    ? `<th class="table-header-row"><div class="header-content sortable">Count<a class='sort-button' style='cursor: pointer'>⇅</a></div></th>`
                    : '') +
                (this.widgets['node-symbol-table-frequencies']
                    ? `<th class="table-header-row"><div class="header-content sortable">Frequency<a class='sort-button' style='cursor: pointer'>⇅</a></div></th>`
                    : '') +
                '<th>Shape</th>' +
                '</tr>'
            );

            values.sort( (a, b)  => {
                return aggregates[b] - aggregates[a];
            });

            
            this.visuals.twoD.commonService.temp.style.nodeSymbolMap = d3.scaleOrdinal(this.visuals.twoD.commonService.session.style.nodeSymbols).domain(values);
            
            values.forEach((v, i) => {
                // PRE D3

                // Manually create options instead of using the existing select
                let optionsHtml = `
                    <option value="symbolCircle" ${this.visuals.twoD.commonService.temp.style.nodeSymbolMap(v) === 'circle' ? 'selected' : ''}>&nbsp;&#11044; (Circle)</option>
                    <option value="symbolSquare" ${this.visuals.twoD.commonService.temp.style.nodeSymbolMap(v) === 'square' ? 'selected' : ''}>&nbsp;&#9632; (Square)</option>
                    <option value="symbolHexagon" ${this.visuals.twoD.commonService.temp.style.nodeSymbolMap(v) === 'hexagon' ? 'selected' : ''}>&nbsp;&#11042; (Hexagon)</option>
                    <option value="symbolTriangle" ${this.visuals.twoD.commonService.temp.style.nodeSymbolMap(v) === 'triangle' ? 'selected' : ''}>&nbsp;&#9650; (Triangle)</option>
                    <option value="symbolDiamond" ${this.visuals.twoD.commonService.temp.style.nodeSymbolMap(v) === 'diamond' ? 'selected' : ''}>&nbsp;&#10731; (Diamond)</option>
                `;

                // console.log('symbol each value: ', v, this.visuals.twoD.commonService.temp.style.nodeSymbolMap(v));
                let selector = $(`<select ${disabled}></select>`).append(optionsHtml).val(this.visuals.twoD.commonService.temp.style.nodeSymbolMap(v)).on('change',  (e) => {
                    this.visuals.twoD.commonService.session.style.nodeSymbols.splice(i, 1, (e.target as any).value);
                    this.visuals.twoD.commonService.temp.style.nodeSymbolMap = d3.scaleOrdinal(this.visuals.twoD.commonService.session.style.nodeSymbols).domain(values);
                    this._rerender();
                    // this.visuals.twoD.redrawNodes();
                });        
                let symbolText = symbolMapping.find(x => x.key === this.visuals.twoD.commonService.temp.style.nodeSymbolMap(v));

                let cell = $('<td></td>').append(isEditable ? selector : symbolText ? symbolText.value : '');
                let row = $(
                    '<tr>' +
                    `<td ${isEditable ? 'contenteditable' : ''}> ${this.visuals.twoD.commonService.titleize('' + v)} </td> ` +
                    (this.widgets['node-symbol-table-counts'] ? ('<td>' + aggregates[v] + '</td>') : '') +
                    (this.widgets['node-symbol-table-frequencies'] ? ('<td>' + (aggregates[v] / vnodes).toLocaleString() + '</td>') : '') +
                    '</tr>'
                ).append(cell);
                table.append(row);
            });


            let isAscending = true;  // add this line before the click event handler

            // The sorting functionality is added here
            $(tableId).on('click', 'th', function () {
                let table = $(this).parents('table').eq(0);
                let rows = table.find('tr:gt(0)').toArray().sort(comparer($(this).index()));
                isAscending = !isAscending;  // replace 'this.asc' with 'isAscending'
                if (!isAscending){rows = rows.reverse();}
                for (let i = 0; i < rows.length; i++) { table.append(rows[i]); }
            });

            function comparer(index) {
                return function(a, b) {
                    let valA = getCellValue(a, index), valB = getCellValue(b, index);
                    console.log(`Comparing: ${valA} and ${valB}`);  // New line
                    return !isNaN(Number(valA)) && !isNaN(Number(valB)) ? Number(valA) - Number(valB) : valA.toString().localeCompare(valB);
                }
            }

            function getCellValue(row, index) {
                return $(row).children('td').eq(index).text();
            }

        }, 100);

    }

    public onNodeRadiusVariableChange(e) {

        this.widgets['node-radius-variable'] = e;

        if (e == 'None') {
            $('#node-max-radius-row').slideUp();
            $('#node-min-radius-row').slideUp();
            $('#node-radius-row').slideDown();
          } else {
            $('#node-max-radius-row').css('display', 'flex');
            $('#node-min-radius-row').css('display', 'flex');
            $('#node-radius-row').slideUp();
          }

          this._rerender(); 

    }

    /**
     * Updates node-radius-max widget and redraws nodes
     */
   public onNodeRadiusMaxChange(e) {
    this.widgets['node-radius-max'] = e;
    this.updateMinMaxNode();
    this._rerender();
   }

    /**
     * Updates node-radius-min widget and redraws nodes
     */
   public onNodeRadiusMinChange(e) {
        this.widgets['node-radius-min'] = e;
        this.updateMinMaxNode()
        this._rerender();
   }

    /**
     * Updates node-border-width widget and redraws nodes
     */
    public onNodeBorderWidthChange(e) {
        this.widgets['node-border-width'] = e;
        this.updateMinMaxNode()
        this._rerender();
    }

    /**
     * Updates node-radius widget and redraws nodes
     */
    public onNodeRadiusChange(e) {

        this.widgets['node-radius'] = e;

        this._rerender();
       
    }

    /**
     * Rerenders whole data set by resetting data object
     */
    private _rerender(timelineTick=false) {

        if (this.data === undefined) {
            return;
        } 

        let nodes = this.commonService.getVisibleNodes();
        if (timelineTick && nodes.length == (this.twoDGraph as any).component.datamodel._nodes.length) return;

        let nodeIDs = new Set(nodes.map(node => node._id))
        let links = this.commonService.getVisibleLinks();
        let filteredLinks = links.filter(l => nodeIDs.has(l.source) && nodeIDs.has(l.target));

        let networkData = { 
            nodes: nodes,
            links: filteredLinks
        };


        if(networkData.nodes.length !== 0) {
            if (this.visuals.microbeTrace.commonService.session.style.widgets['node-timeline-variable'] != 'None') {
                this.autoFit = false;
            } else {
                this.autoFit = true;
            }  
        } else {
            this.autoFit = true; 
        }

        //console.log('link vis rerender: ', this.visuals.twoD.commonService.getVisibleLinks());
        
        this.data = this.visuals.twoD.commonService.convertToGraphDataArray(networkData);

        // document.documentElement.style.setProperty('--vis-graph-panel-fill-color', `${this.SelectedNodeLabelSizeVariable}pt`);

        setTimeout(() => {
            this.cdref.detectChanges();
            this.cdref.markForCheck();
            if (timelineTick) {
                this.applyNodeFx();
                (this.twoDGraph as any).component.fitView();
            }
            
          }, 0);
          
        // Update the panels
        this.updatePanels();

    }

      public updatePanels(): void {
        if (this.layoutType2 === GraphLayoutType.Parallel && this.showParallel) {
          // Update nodes and generate new panels
          const { updatedNodes, panels, groups } = this.commonService.updateNodesAndGeneratePanels(this.data);
    
          // Update data with updated nodes
          this.data = {
            ...this.data,
            nodes: updatedNodes
          };
    
          // Ensure panels are deep cloned
          this.panels = JSON.parse(JSON.stringify(panels));

          // Update polygonGroups
          this.visuals.twoD.commonService.temp.polygonGroups = groups;
        
          // Use setTimeout to trigger change detection in the next tick
          setTimeout(() => {
            this.cdref.detectChanges();
            this.cdref.markForCheck();
          }, 0);
        }
      }

    public getNodeShape( node : any ) {

        //* Shapes:
        let symbolVariable = this.widgets['node-symbol-variable'];


        if(symbolVariable == "None") {

            switch(this.selectedNodeShape) {
                case 'symbolCircle':
                    return 'circle';
                case 'symbolSquare':
                    console.log('node returning square');
                    return 'square';
                case 'symbolHexagon':
                    return 'hexagon';
                case 'symbolTriangle':
                    return 'triangle';
                default:
                    return `circle`;
               }
            // return this.widgets['node-symbol-variable'];
        } else {

           let type = this.visuals.twoD.commonService.temp.style.nodeSymbolMap(node[symbolVariable]);

           switch(type) {
            case 'symbolCircle':
                return 'circle';
            case 'symbolSquare':
                return 'square';
            case 'symbolHexagon':
                return 'hexagon';
            case 'symbolTriangle':
                return 'triangle';
            case 'symbolDiamond':
                return `<use href="#diamond" stroke-width="3" />`;
           }
        
            // if (type === undefined) {
            //     type = that.customShapes.shapes[that.visuals.twoD.commonService.temp.style.nodeSymbolMap(d[symbolVariable])];
            // }
        }

        // // Custom Shape Selected
        // if (type === undefined) {
        //     type = this.customShapes.shapes[this.widgets['node-symbol']];
        // }

        // //* Sizes:
        // let defaultSize = this.widgets['node-radius'];
        // let size = defaultSize, med = defaultSize, oldrng, min, max;
        // let sizeVariable = this.widgets['node-radius-variable'];
        // let scale;
        // let nodes;
        // if (sizeVariable !== 'None') {
        //     if (this.widgets["timeline-date-field"] == 'None') nodes = this.visuals.twoD.commonService.session.network.nodes;
        //     else nodes = this.visuals.twoD.commonService.session.network.timelineNodes;
        //     let n = this.visuals.twoD.commonService.session.network.nodes.length;
        //     min = Number.MAX_VALUE;
        //     max = Number.MIN_VALUE;
        //     for (let i = 0; i < n; i++) {
        //         let size = this.visuals.twoD.commonService.session.network.nodes[i][sizeVariable];
        //         if (typeof size == 'undefined') continue;
        //         if (size < min) min = size;
        //         if (size > max) max = size;
        //     }
        //     oldrng = max - min;
        //     med = oldrng / 2;

        //     let maxWidth = this.widgets['node-radius-max'];
        //     let minWidth = this.widgets['node-radius-min'];
        //     // scale = d3.scaleLinear()
        //     // .domain([min, max])
        //     // .range([minWidth, maxWidth]);
        //     }
        
        // nodes = this.visuals.twoD.svg.select('g.nodes').selectAll('g').data(this.visuals.twoD.commonService.session.network.nodes);

        // // TODO: Hides table row by default if no symbol variable - clean up
        // if(symbolVariable === 'None') {
        //     $('#node-symbol-table-row').slideUp();
        // }

        // // console.log('nodes: ', nodes);

        // let that = this;

        // nodes.selectAll('path').each(function (d) {

        //     if (symbolVariable !== 'None') {

        //         // type = d3[that.visuals.twoD.commonService.temp.style.nodeSymbolMap(d[symbolVariable])];

        //         // if (type === undefined) {
        //         //     type = that.customShapes.shapes[that.visuals.twoD.commonService.temp.style.nodeSymbolMap(d[symbolVariable])];
        //         // }
    
        //     } 
        //     if (sizeVariable !== 'None') {
        //       size = d[sizeVariable];
        //       if (!that.isNumber(size)) size = med;
        //       size = scale(size);
        //     }

        //     // d3.select(this).attr('d', d3.symbol().size(size).type(type));    
            
        //   });

    }

    /**
     * Updates node-symbol widget and redraws nodes
     */
    onNodeSymbolChange(e) {
        this.widgets['node-symbol'] = e;
        this._rerender();
    }

    /**
     * Sets whether node symbol table is visible or not
     * @param e 'Show' or 'Hide'
     */
    onNodeSymbolTableChange(e) {
        this.SelectedNetworkTableTypeVariable = e;
        this.widgets["node-symbol-table-visible"] = this.SelectedNetworkTableTypeVariable;
        if (this.SelectedNetworkTableTypeVariable == "Show") {
            this.NodeSymbolTableWrapperDialogSettings.setVisibility(true);
        }
        else {
            this.NodeSymbolTableWrapperDialogSettings.setVisibility(false);
        }
    }

    /**
     * Updates link-tooltip-variable and SelectedLinkTooltipVariable to update what tooltip displays for links
     */
    onLinkTooltipVariableChange(e) {
        if (!Array.isArray(e)) {
            e = [e];
        }
        e = e.filter(item => item !== 'None')
    
        this.widgets['link-tooltip-variable'] = e;
        this.visuals.twoD.SelectedLinkTooltipVariable = this.widgets['link-tooltip-variable'];
    }

    /**
     * Updates link-label-variable widget and link labels
     */
    onLinkLabelVariableChange(e) {
        let label: any = e;
        this.widgets['link-label-variable'] = label;

        this._rerender();
    }

    /**
     * Updates link-label-decimal-length widget and updates label with updated number of decimal points
     */
    onLinkDecimalVariableChange(e) {
        this.widgets['link-label-decimal-length'] = e;
        this._rerender();
    }

    /**
     * Updates link-opacity widget and the opacity for all links
     */
    onLinkOpacityChange(e) {
        this.widgets['link-opacity'] = e;
        this._rerender();
    }

    updateLinkWidthRows(e) {
        if (e == 'None') {
            setTimeout(() => {
                $('#link-reciprocalthickness-row').slideUp();
                $('#link-max-width-row').slideUp();
                $('#link-min-width-row').slideUp();
                $('#link-width-row').slideDown();
            }, 5)
        } else {
            setTimeout(() => {
                $('#link-reciprocalthickness-row').css('display', 'flex');
                $('#link-max-width-row').css('display', 'flex');
                $('#link-min-width-row').css('display', 'flex');
                $('#link-width-row').slideUp();
            }, 5)
        }
    }

    /**
     * Updates link-width-variable widget and updates link width; Also cause min, max and reciprocal link width row to appear/disappear
     */
    onLinkWidthVariableChange(e) {
        this.updateLinkWidthRows(e);
        this.widgets['link-width-variable'] = e;
        this.updateMinMaxLink();
        this._rerender();
    }

    updateMinMaxNode(){

        this.visNodes = this.commonService.getVisibleNodes();
        let n = this.visNodes.length;
        let maxWidth = this.widgets['node-radius-max'];
        let minWidth = this.widgets['node-radius-min'];
        let sizeVariable = this.widgets['node-radius-variable'];


        this.nodeMin = Number.MAX_VALUE;
        this.nodeMax = Number.MIN_VALUE;
        for (let i = 0; i < n; i++) {
          let size = this.visNodes[i][sizeVariable];
          if (typeof size == 'undefined') continue;
          if (size < this.nodeMin) this.nodeMin = size;
          if (size > this.nodeMax) this.nodeMax = size;
        }

        this.nodeMid = (this.nodeMax - this.nodeMin) / 2;

        this.nodeScale = d3.scaleLinear()
          .domain([this.nodeMin, this.nodeMax])
          .range([minWidth, maxWidth]);
    }

    updateMinMaxLink(){
        let maxWidth = this.widgets['link-width-max'];
        if (maxWidth == 'None') {
            this.widgets['link-width-max'] = 15;
            maxWidth = 15;
        } 
        let minWidth = this.widgets['link-width-min'];
        if (minWidth == 'None') {
            this.widgets['link-width-min'] = 0;
            minWidth = 0;
        }
        let variable = this.widgets['link-width-variable'];

        this.visLinks = this.getVLinks();
        let n = this.visLinks.length;
        this.linkMax = -Infinity;
        this.linkMin = Infinity;
        for (let i = 0; i < n; i++) {
          let l = this.visLinks[i][variable];
          if (!this.isNumber(l)) return;
          if (l > this.linkMax) this.linkMax = l;
          if (l < this.linkMin) this.linkMin = l;
        }
        this.linkScale = d3.scaleLinear()
            .domain([this.linkMin, this.linkMax])
            .range([minWidth, maxWidth]);
        
    }

    /**
     * Updates link-width-reciprocal widget and updates link width
     * This widget controls whether to set width smallest -> largest or largest -> smallest
     */
    onLinkWidthReciprocalNonReciprocalChange(e) {
        if (e == "Reciprocal") {
            this.widgets['link-width-reciprocal'] = true;
            this.visuals.twoD.scaleLinkWidth();
        }
        else {
            this.widgets['link-width-reciprocal'] = false;
            this.visuals.twoD.scaleLinkWidth();
        }
    }

    /**
     * Updates link-width widget and link width
     */
    onLinkWidthChange(e) {
        this.widgets['link-width'] = e;
        this.visuals.twoD.scaleLinkWidth();
        this._rerender();
    }

    /**
     * Updates link-width-max widget and link width
     */
    onLinkWidthMaxChange(e) {
        this.widgets['link-width-max'] = e;
        this.updateMinMaxLink(); 
        this._rerender();
    }

    /**
     * Updates link-width-min widget and link width
     */
    onLinkWidthMinChange(e) {
        this.widgets['link-width-min'] = e;
        this.updateMinMaxLink(); 
        this._rerender();
    }

    /**
     * Updates link-length widget and link force distance
     */
    onLinkLengthChange(e) {
        // this.visuals.twoD.force.force('link').distance(e);
        // this.visuals.twoD.force.alpha(0.3).alphaTarget(0).restart();
        this.widgets['link-length'] = e;
    }

    /**
     * Updates link-directed widget. When directed, links have an arrow added; when undirected, links have no arrow
     */
    onLinkDirectedUndirectedChange(e) {
        if (e == "Show") {
            $('#link-bidirectional-row').slideDown();
            $('#link-bidirectional-row').css('display', 'flex');
            this.widgets['link-directed'] = true;
        }
        else {
            this.widgets['link-directed'] = false;
            
            $("#link-bidirectional-row").slideUp();
        }

        this._rerender();
    }

    onLinkBidirectionalChange(e) {
        if (e == "Show") {
            this.widgets['link-bidirectional'] = true;
        }
        else {
 
            this.widgets['link-bidirectional'] = false;
        }
        this._rerender();
    }

    /**
     * Updates node-highlight widget. When true and a node is mouseoved current node, all it of links, and neighbor nodes will be highlighted
     */
    onDontHighlightNeighborsHighlightNeighborsChange(e) {
        if (e == "Normal") {
            this.widgets['node-highlight'] = false;
        }
        else {
            this.widgets['node-highlight'] = true;
        }
    }

    /**
     * Adds or removes vertical and horizontal gridlines from svg image
     * @param show wheither to show or hide gridlines
     */
    drawGridlines(show: boolean): void {
        const container = document.getElementById('viz-force');
    
        // Ensure the container exists
        if (!container) return;
    
        // Reset width and height in case they have changed
        this.visuals.twoD.halfWidth = container.parentElement.offsetWidth / 2;
        this.visuals.twoD.halfHeight = container.parentElement.parentElement.parentElement.offsetHeight / 2;
    
        // Create or select horizontal gridlines group
        let horizontalGridlinesGroup = container.querySelector('g.horizontal-gridlines') as SVGGElement;
        if (!horizontalGridlinesGroup) {
            horizontalGridlinesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            horizontalGridlinesGroup.classList.add('horizontal-gridlines');
            container.querySelector('svg').insertBefore(horizontalGridlinesGroup, container.querySelector('svg').firstChild);
        }
    
        // Create or select vertical gridlines group
        let verticalGridlinesGroup = container.querySelector('g.vertical-gridlines') as SVGGElement;
        if (!verticalGridlinesGroup) {
            verticalGridlinesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            verticalGridlinesGroup.classList.add('vertical-gridlines');
            container.querySelector('svg').insertBefore(verticalGridlinesGroup, container.querySelector('svg').firstChild);
        }
    
        // Clear existing lines
        horizontalGridlinesGroup.innerHTML = '';
        verticalGridlinesGroup.innerHTML = '';
    
        if (show) {
            const range = Math.ceil(Math.max(this.visuals.twoD.halfWidth, this.visuals.twoD.halfHeight) / 50);
            const ords = Array.from({ length: range }, (_, i) => i);
    
            // Horizontal lines
            ords.forEach(d => {
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('x1', '0');
                line.setAttribute('x2', (this.visuals.twoD.halfWidth * 2).toString());
                line.setAttribute('y1', (d * 100).toString());
                line.setAttribute('y2', (d * 100).toString());
                line.setAttribute('stroke', 'lightgray');
                horizontalGridlinesGroup.appendChild(line);
            });
    
            // Vertical lines
            ords.forEach(d => {
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('x1', (d * 100).toString());
                line.setAttribute('x2', (d * 100).toString());
                line.setAttribute('y1', '0');
                line.setAttribute('y2', (this.visuals.twoD.halfHeight * 2).toString());
                line.setAttribute('stroke', 'lightgray');
                verticalGridlinesGroup.appendChild(line);
            });
        }
    }
    
    /**
     * Take input from 2D Networks settings dialog box from template and update the widget and show/hides gridlines
     * @param e string either 'Show' or 'Hide'
     */
    onNetworkGridlinesShowHideChange(e: string): void {
        if (e === "Show") {
            this.widgets['network-gridlines-show'] = true;
            this.drawGridlines(true);
        } else {
            this.widgets['network-gridlines-show'] = false;
            this.drawGridlines(false);
        }
    }
    
    /**
     * Changes value of charge force (d3.many-body-force). Sets charge to -e meaning each node will repell every other node
     * @param {number} e value from 0-400
     */
    onNodeChargeChange(e: number) {

        // this.visuals.twoD.force.force('charge').strength(-e);
        // this.visuals.twoD.force.alpha(0.3).alphaTarget(0).restart();
        this.widgets['node-charge'] = e;
    }

    /**
     * Changes value of gravity force (d3-force-attract) which pulls nodes to the center. Sets strength e
     * @param {number} e value from 0.025-1
     */
    onNetworkGravityChange(e: number) {

        // this.visuals.twoD.force.force('gravity').strength(e);
        // this.visuals.twoD.force.alpha(0.3).alphaTarget(0).restart();
        this.widgets['network-gravity'] = e;
    }

    /**
     * Changes value of velocityDecay (d3 velocityDecay). Sets too low causing network to oscillate
     * @param {number} e value from 0-1 (default 0.4)
     */
    onNetworkFrictionChange(e) {

        // this.visuals.twoD.force.velocityDecay(e);
        // this.visuals.twoD.force.alpha(0.3).alphaTarget(0).restart();
        this.widgets['network-friction'] = e;
    }

    /**
     * Changes value of network-link-strength (d3.forceLink) which pulls the pair of nodes together
     * @param {number} e value from 0-1 (default 0.4)
     */
    onNetworkLinkStrengthVariableChange(e) {

        //console.log('st change: ', e);
        let v = parseFloat(e);
        // this.visuals.twoD.force.force('link').strength(v);
        // this.visuals.twoD.force.alpha(0.3).alphaTarget(0).restart();
        this.widgets['network-link-strength'] = e;
    }

    /**
     * If exportFileType = 'svg' don't show advanced setting; otherwise do show them
     * @param e string of filetype
     */
    onNetworkExportFiletypeChange(e) {
        if (e == "svg") {
            this.visuals.twoD.ShowAdvancedExport = false;
        }
        else
            this.visuals.twoD.ShowAdvancedExport = true;
    }

    /**
     * Updates the color of nodes and transparency based on node-color-variable, the value from nodeColorMap and nodeAlphaMap, and whether the node is selected
     */
    updateNodeColors() {

        //debugger;

        let variable = this.widgets['node-color-variable'];
        let color = this.widgets['node-color']
        // let nodes = this.visuals.twoD.svg.select('g.nodes').selectAll('g').select('path').data(this.visuals.twoD.commonService.session.network.nodes).classed('selected', d => d.selected);
        // let col = this.widgets['node-color'];

        let stroke = this.widgets['selected-node-stroke-color'];
        let stroke_width = parseInt(this.widgets['selected-node-stroke-width']);


        if (variable == 'None') {

            this.data.nodes.forEach( x => {

                x.color = color;

            })


            // nodes
                // .attr('fill', col).attr('opacity', 1);

            // this.context.microbeTrace.clearTable("#node-color-table-bottom");

        } else {

            this.data.nodes.forEach( (x, index) => {

                x.color = this.visuals.twoD.commonService.temp.style.nodeColorMap(this.visuals.twoD.commonService.session.data.nodes[index][variable]);
                
            })


            // nodes
            //     .attr('fill', d => this.visuals.twoD.commonService.temp.style.nodeColorMap(d[variable]))
            //     .attr('opacity', d => this.visuals.twoD.commonService.temp.style.nodeAlphaMap(d[variable]));

            //  this.context.microbeTrace.generateNodeColorTable("#node-color-table-bottom", false);
        }


        // Array.from(nodes._groups).forEach((x: any)=>{
        //     x.forEach(y=>{
        //         if(!this.visuals.twoD.commonService.session.data.nodes.find(z => y.__data__.index === z.index)){
        //             y.style['opacity'] = 0;
        //         }
        //     })
        // })

        // this.data.nodes.forEach( (x, index) => {

        //     x.color = this.visuals.twoD.commonService.temp.style.nodeColorMap(this.visuals.twoD.commonService.session.data.nodes[index][variable]);
            
        // })

        this._rerender();
        this.cdref.markForCheck();
        this.cdref.detectChanges();

        // (data: Datum, event: MouseEvent, i: number, els: (SVGElement | HTMLElement)[])

        // /*/
        //  * Add a color that shows the node is selected.
        // /*/

        // if (_selected.length > 0) {

        //     Array.from(nodes._groups).filter(x => {

        //         (<any>x).filter(y => {

        //             /*/
        //              * Turn on the node(s) selected.
        //             /*/
        //             if (y['__data__'].selected == true) {

        //                 y.style['stroke'] = stroke;
        //                 y.style['strokeWidth'] = stroke_width;

        //             }
        //             else {
        //                 /*/
        //                  * Otherwise, turn on the node(s) selected.
        //                 /*/

        //                 y.style['stroke'] = "#000000";
        //                 y.style['strokeWidth'] = this.widgets['node-border-width'];
        //             }
        //         });
        //     });
        // }
        // else {


        //     Array.from(nodes._groups).filter(x => {

        //         (<any>x).filter(y => {

        //             /*/
        //                 * Otherwise, turn on the node(s) selected.
        //             /*/

        //             y.style['stroke'] = "#000000";
        //             y.style['strokeWidth'] = this.widgets['node-border-width'];

        //         });
        //     });
        // }



    };


    /**
     * Updates the color of links and transparency based on link-color-variable and value from linkColorMap and linkAlphaMap
     */
    updateLinkColor() {

        // let variable = this.widgets['link-color-variable'];
        // // console.log('updating variable: ',variable );
        // let links = this.visuals.twoD.svg.select('g.links').selectAll('line');
        // if (variable == 'None') {
        //     let color = this.widgets['link-color'],
        //         opacity = 1 - this.widgets['link-opacity'];
        //     links
        //         .attr('stroke', color)
        //         .attr('opacity', opacity);

        //     // this.context.microbeTrace.clearTable("#link-color-table-bottom");
        // } else {
        //     // this.context.microbeTrace.generateNodeLinkTable("#link-color-table-bottom", false);
        //     if (variable == 'source' || variable == 'target') {
        //         links
        //         .data(this.getVLinks())
        //         .attr('stroke', l => this.visuals.twoD.commonService.temp.style.linkColorMap(l[variable]['_id']))
        //         .attr('opacity', l => this.visuals.twoD.commonService.temp.style.linkAlphaMap(l[variable]['_id']))
        //         .attr('stroke-dasharray', l => {
        //             //This quirky little algorithm creates the dasharray code necessary to make dash-y links.
        //             let length = 15;
        //             let out = new Array(l.origins * 2);
        //             let ofs = new Array(l.origins).fill(1);
        //             let ons = new Array(l.origins).fill(0);
        //             ons[l.oNum] = 1;
        //             ofs[l.oNum] = 0;
        //             for (let i = 0; i < l.origins; i++) {
        //                 out[2 * i] = ons[i] * length;
        //                 out[2 * i + 1] = ofs[i] * length;
        //             }
        //             return out.join(', ');
        //         });
        //     } else {
        //         links
        //             .data(this.getVLinks())
        //             .attr('stroke', l => this.visuals.twoD.commonService.temp.style.linkColorMap(l[variable]))
        //             .attr('opacity', l => this.visuals.twoD.commonService.temp.style.linkAlphaMap(l[variable]))
        //             .attr('stroke-dasharray', l => {
        //                 //This quirky little algorithm creates the dasharray code necessary to make dash-y links.
        //                 let length = 15;
        //                 let out = new Array(l.origins * 2);
        //                 let ofs = new Array(l.origins).fill(1);
        //                 let ons = new Array(l.origins).fill(0);
        //                 ons[l.oNum] = 1;
        //                 ofs[l.oNum] = 0;
        //                 for (let i = 0; i < l.origins; i++) {
        //                     out[2 * i] = ons[i] * length;
        //                     out[2 * i + 1] = ofs[i] * length;
        //                 }
        //                 return out.join(', ');
        //             });
        //     }
        // }
        
        this._rerender();
    };

    /**
     * Updates the width of the links using link-width, link-width-variable, link-width-max, link-width-min, and link-width-reciprocal
     */
    scaleLinkWidth() {
        // let scalar = this.widgets['link-width'];
        // let variable = this.widgets['link-width-variable'];
        // let vlinks = this.visuals.twoD.getVLinks();
        // if (variable == 'None') return  scalar;
        // let n = vlinks.length;
        // let maxWidth = this.widgets['link-width-max'];
        // let minWidth = this.widgets['link-width-min'];

        // let max = -Infinity;
        // let min = Infinity;
        // for (let i = 0; i < n; i++) {
        //     let l = vlinks[i][variable];
        //     if (!this.visuals.twoD.isNumber(l)) return;
        //     if (l > max) max = l;
        //     if (l < min) min = l;
        // }
        // let mid = (max - min) / 2 + min;
        // let scale = d3.scaleLinear()
        //     .domain(this.widgets['link-width-reciprocal'] ? [max, min] : [min, max])
        //     .range([minWidth, maxWidth]);
        // links.attr('stroke-width', d => {
        //     let v = d[variable];
        //     if (!this.visuals.twoD.isNumber(v)) v = mid;
        //     return scale(v);
        // });
    };

    /**
     * centers the view
     * @param thing undefined
     * @param bounds undefined
     * @returns 
     */
    fit(thing, bounds) {

        // if (!bounds) bounds = this.visuals.twoD.svg.node().getBBox();
        // if (bounds.width == 0 || bounds.height == 0) return; // nothing to fit
        // let parent = this.visuals.twoD.svg.node().parentElement.parentElement,
        //     midX = bounds.x + bounds.width / 2,
        //     midY = bounds.y + bounds.height / 2;
        // let scale = 0.8 / Math.max(bounds.width / parent.clientWidth, bounds.height / parent.clientHeight);
        // const w = parent.clientWidth / 2 - midX*scale ;
        // const h = parent.clientHeight / 2 - midY*scale;
        // PRE D3
        // d3.select('svg#network')
        //     .transition()
        //     .duration(750)
        //     .call(this.visuals.twoD.zoom.transform, d3.zoomIdentity
        //         .translate(w, h)
        //         //.translate(parent.parentNode.clientWidth / 2 - midX, parent.parentNode.clientHeight / 2 - midY)
        //         .scale(scale));
    };

    /**
     * XXXXX Function is never called; Review if necessary XXXXX
     * @param nodeData 
     * @returns 
     */
    isFiltered(nodeData: any): boolean{
        if(nodeData){
            return this.visuals.twoD.commonService.session.data.nodeFilteredValues.find(x=>x.index === nodeData.index) !== undefined;
        }
        return true
    }

    /**
     * On click of settings button, show/hide settings dialog
     */     
    openSettings() {
        (this.visuals.twoD.Node2DNetworkExportDialogSettings.isVisible) ? this.visuals.twoD.Node2DNetworkExportDialogSettings.setVisibility(false) : this.visuals.twoD.Node2DNetworkExportDialogSettings.setVisibility(true);
       this.visuals.twoD.ShowStatistics = !this.visuals.twoD.Show2DSettingsPane;
       this.updateLinkWidthRows(this.SelectedLinkWidthByVariable);
    }

    /**
     * Updates ShowStatistics variables to opposite of current value
     * 
     * XXXXX Not currently executed; reevaluate if this function is needed XXXXX
     */
    enableSettings() {
        this.visuals.twoD.ShowStatistics = !this.visuals.twoD.ShowStatistics;
        this.cdref.detectChanges();
    }

    /**
     * On click of export button, show export dialog
     */ 
    openExport() {

        // this.visuals.microbeTrace.GlobalSettingsDialogSettings.setStateBeforeExport();
        // this.visuals.microbeTrace.GlobalSettingsLinkColorDialogSettings.setStateBeforeExport();
        // this.visuals.microbeTrace.GlobalSettingsNodeColorDialogSettings.setStateBeforeExport();
        // this.visuals.twoD.NodeSymbolTableWrapperDialogSettings.setStateBeforeExport();
        // this.visuals.twoD.Node2DNetworkExportDialogSettings.setStateBeforeExport();
        this.setCalculatedResolution()
        this.isExportClosed = false;
        this.visuals.twoD.Show2DExportPane = true;
    }

    /**
     * On click of center button, show centers the view
     */ 
    openCenter() {
        (this.twoDGraph as any).component.fitView();
    }

    /**
     * On click of Pin All Nodes button, pin/unpins all nodes
     */
    openPinAllNodes() {

        // this.showParallel = !this.showParallel;
        // let nodes = this.visuals.twoD.svg
        //     .select('g.nodes')
        //     .selectAll('g')
        //     .data(this.visuals.twoD.commonService.session.network.nodes)
        //     .select('path');
        // if (this.visuals.twoD.commonService.session.network.allPinned) {
        //     nodes.each(function (d) {
        //         delete d.fx;
        //         delete d.fy;
        //         d.fixed = false;
        //     });
        //     this.visuals.twoD.force.alpha(0.3).alphaTarget(0).restart();
        // } else {
        //     nodes.each(function (d) {
        //         d.fx = d.x;
        //         d.fy = d.y;
        //         d.fixed = true;
        //     });
        // }
        this.visuals.twoD.commonService.session.network.allPinned = !this.visuals.twoD.commonService.session.network.allPinned;
    }

    /**
     * XXXXX empty function; may be added later XXXXX
     */
    onRecallSession(){
        //this.loadSettings();
    }

    openRefreshScreen() {
        this.loadSettings();
        setTimeout(this.visuals.twoD.fit, 2000);
    }

    /**
     * XXXXX empty function; may be added later XXXXX
     */
    openSelectDataSetScreen() {

    }

    /**
     * renders the network
     */
    updateVisualization() {
        if (!this.isLoading) {
            // console.log('render update vis');
            // this.isLoading = true;
            // this.render();
            // setTimeout(() => {
            //     this.isLoading = false;
            //   }, 1000);
        }    
    }

    applyStyleFileSettings() {
        this.widgets = (window as any).context.commonService.session.style.widgets;
        this.loadSettings();
    }

    ngOnDestroy(): void {
        //this.context.twoD.widgets['node-label-variable'] = 'None';
    }

    /**
     * renders the network
     */
    onLoadNewData(){
        console.log('render new data');
        this.render();
    }

    /**
     * renders the network; sets this.showStatistics to false
     */
    onFilterDataChange(){
        console.log('render filter change');
        // render doesn't do anything unless this.isLoading == true; so need to ensure that before call render
       this._rerender();
    }

    /**
     * Sets twoD component variable based on the value in the appropriate widget and then calls appropriate function to update the view
     * 
     * XXXXX this function should probably be reevaluated/refacted as well because sections of code are being evaluated multiple times 
     * (ie. onPolygonLabelVariableChange, onPolygonLabelVariableChange, onPolygonLabelOrientationChange all call redrawPolygonLabels) XXXXX
     */
    loadSettings(){

        //Polygons|Label Size
        this.SelectedPolygonLabelSizeVariable = this.widgets['polygons-label-size'];
        this.onPolygonLabelSizeChange(this.SelectedPolygonLabelSizeVariable);

        //Node|Orientation
        this.SelectedPolygonLabelOrientationVariable = this.widgets['polygons-label-orientation'];
        this.onPolygonLabelOrientationChange(this.SelectedPolygonLabelOrientationVariable);

        this.polygonsToggle(this.widgets['polygons-show']);
        if(this.widgets['polygons-show']){
            this.visuals.twoD.updatePolygonColors();
            this.polygonColorsToggle(this.widgets['polygon-color-table-visible'])
        }

       //Nodes|Label
        this.SelectedNodeLabelVariable = this.widgets['node-label-variable'];
        this.onNodeLabelVaribleChange(this.SelectedNodeLabelVariable);

        //Node|Label Size
        this.SelectedNodeLabelSizeVariable = this.widgets['node-label-size'];
        this.setNodeLabelSize(this.SelectedNodeLabelSizeVariable);

        if (!Array.isArray(this.widgets['node-tooltip-variable'])) {
            this.widgets['node-tooltip-variable'] = [this.widgets['node-tooltip-variable']];
        }
        this.SelectedNodeTooltipVariable = this.widgets['node-tooltip-variable'];
        this.onNodeTooltipVariableChange(this.SelectedNodeTooltipVariable);

        //Nodes|Shape By Table
        if (this.widgets['node-symbol-variable'] != undefined && this.widgets['node-symbol-variable'] != 'None') {
            this.widgets["node-symbol-table-visible"] = 'Show';
        }
        this.SelectedNetworkTableTypeVariable = this.widgets["node-symbol-table-visible"];
        this.onNodeSymbolTableChange(this.SelectedNetworkTableTypeVariable);

        //Nodes|Shape By
        this.SelectedNodeSymbolVariable = this.widgets['node-symbol-variable'];
        this.onNodeSymbolVariableChange(this.widgets['node-symbol-variable'], this.SelectedNetworkTableTypeVariable === "Show");
        

        //Nodes|Shape
        this.SelectedNodeShapeVariable = this.widgets['node-symbol'];
        this.onNodeSymbolChange(this.SelectedNodeShapeVariable);

        //Nodes|Size By
        this.SelectedNodeRadiusVariable = this.widgets['node-radius-variable'];
        this.onNodeRadiusVariableChange(this.SelectedNodeRadiusVariable);

        //Nodes|Size
        this.SelectedNodeRadiusSizeVariable = this.widgets['node-radius'].toString();
        this.onNodeRadiusChange(this.SelectedNodeRadiusSizeVariable);

        this.nodeBorderWidth = this.widgets['node-border-width']

        //Links|Tooltip
        this.SelectedLinkTooltipVariable = this.widgets['link-tooltip-variable'];
        this.onLinkTooltipVariableChange(this.SelectedLinkTooltipVariable);

        //Links|Label
        this.SelectedLinkLabelVariable = this.widgets['link-label-variable'];
        this.onLinkLabelVariableChange(this.SelectedLinkLabelVariable);

        //Links|Decimal Length
        this.SelectedLinkDecimalVariable = this.widgets['link-label-decimal-length'];
        this.onLinkDecimalVariableChange(this.SelectedLinkDecimalVariable);

        //Links|Transparency
        this.SelectedLinkTransparencyVariable = this.widgets['link-opacity'];
        this.onLinkOpacityChange(this.SelectedLinkTransparencyVariable);

        //Links|Width By
        this.SelectedLinkWidthByVariable = this.widgets['link-width-variable'];
        this.onLinkWidthVariableChange(this.SelectedLinkWidthByVariable);

        //Links|Reciprical
        this.SelectedLinkReciprocalTypeVariable = this.widgets['link-width-reciprocal'] ? "Reciprocal" : "Non-Reciprocal"
        this.onLinkWidthReciprocalNonReciprocalChange(this.SelectedLinkReciprocalTypeVariable);

        //Links|Width
        this.SelectedLinkWidthVariable = this.widgets['link-width'];
        this.onLinkWidthChange(this.SelectedLinkWidthVariable);

         //Links|Width Max
         this.SelectedLinkWidthMax = this.widgets['link-width-max'];
         this.onLinkWidthMaxChange(this.SelectedLinkWidthMax);
 
         //Links|Width Min
         this.SelectedLinkWidthMin = this.widgets['link-width-min'];
         this.onLinkWidthMinChange(this.SelectedLinkWidthMin);

        //Links|Length
        this.SelectedLinkLengthVariable = this.widgets['link-length'];
        this.onLinkLengthChange(this.SelectedLinkLengthVariable);

        //Links|Arrows
        this.SelectedLinkArrowTypeVariable = this.widgets['link-directed'] ? "Show" : "Hide";
        this.onLinkDirectedUndirectedChange(this.SelectedLinkArrowTypeVariable); 


        //Network|Neighbors
        this.SelectedNetworkNeighborTypeVariable = this.widgets['node-highlight'] ? "Highlighted" : "Normal";
        this.onDontHighlightNeighborsHighlightNeighborsChange(this.SelectedNetworkNeighborTypeVariable);

        //Network|Gridlines
        this.SelectedNetworkGridLineTypeVariable = this.widgets['network-gridlines-show'] ? "Show" : "Hide";
        this.onNetworkGridlinesShowHideChange(this.SelectedNetworkGridLineTypeVariable);

        //Network|Charge
        this.SelectedNetworkChargeVariable = this.widgets['node-charge'];
        this.onNodeChargeChange(this.SelectedNetworkChargeVariable);

        //Network|Gravity
        this.SelectedNetworkGravityVariable = this.widgets['network-gravity'];
        this.onNetworkGravityChange(this.SelectedNetworkGravityVariable);

        //Network|Friction
        this.SelectedNetworkFrictionVariable = this.widgets['network-friction'];
        this.onNetworkFrictionChange(this.SelectedNetworkFrictionVariable);

        //Network|Link Strength
        this.SelecetedNetworkLinkStrengthVariable = this.widgets['network-link-strength'];
        this.onNetworkFrictionChange(this.SelecetedNetworkLinkStrengthVariable);

        if (this.widgets['polygon-label-orientation'] !== 'top' || this.widgets['polygon-label-orientation'] !== 'bottom') {
            this.widgets['polygon-label-orientation'] = 'top';
        }

         //Network|Polygon Orientation
         this.SelectedPolygonLabelOrientationVariable = this.widgets['polygon-label-orientation'];
         this.onPolygonLabelOrientationChange(this.SelectedPolygonLabelOrientationVariable);
    }
}

export namespace TwoDComponent {
    export const componentTypeName = '2D Network';
}

