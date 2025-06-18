import { Injector, Component, Output, OnChanges, SimpleChange, EventEmitter, OnInit, ViewChild, ElementRef, ChangeDetectorRef, OnDestroy, Inject, ChangeDetectionStrategy } from '@angular/core';
import { AppComponentBase } from '@shared/common/app-component-base';
import { EventManager } from '@angular/platform-browser';
import { CommonService } from '../../contactTraceCommonServices/common.service';
import * as d3 from 'd3';
import { Clipboard } from '@angular/cdk/clipboard';
import { SelectItem } from 'primeng/api';
import { DialogSettings } from '../../helperClasses/dialogSettings';
import { MicobeTraceNextPluginEvents } from '../../helperClasses/interfaces';
import * as _ from 'lodash';
import { CustomShapes } from '@app/helperClasses/customShapes';
import { BaseComponentDirective } from '@app/base-component.directive';
import { saveSvgAsPng } from 'save-svg-as-png';
import { ComponentContainer } from 'golden-layout';
import { GoogleTagManagerService } from 'angular-google-tag-manager';
import { GraphData } from './data';
import cytoscape, { Core, Style } from 'cytoscape';
import svg from 'cytoscape-svg';
import { Subject, Subscription, takeUntil } from 'rxjs';
//import fcose from 'cytoscape-fcose';
import * as d3f from 'd3-force';
import { CommonStoreService } from '@app/contactTraceCommonServices/common-store.services';
import { ExportService, ExportOptions } from '@app/contactTraceCommonServices/export.service';


@Component({
    selector: 'TwoDComponent',
    templateUrl: './twoD-plugin.component.html',
    styleUrls: ['./twoD-plugin.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TwoDComponent extends BaseComponentDirective implements OnInit, MicobeTraceNextPluginEvents, OnDestroy {

    @Output() DisplayGlobalSettingsDialogEvent = new EventEmitter();

    // Reference to the Cytoscape container
    @ViewChild('cy', { static: false }) cyContainer: ElementRef;
    @ViewChild('exportContainer') exportContainer: ElementRef;
    @ViewChild('nodeSymbolTable') nodeSymbolTable!: ElementRef;
    @ViewChild('polygonColorTable') polygonColorTable!: ElementRef;
    @ViewChild('networkStats') networkStatisticsTable!: ElementRef;

    // Cytoscape core instance
    cy: Core;
    vizLoaded = true;
    nodePositions: Map<string, { x: number; y: number }> = new Map();
    data;
    rerenderTimeout: any;
    layoutParallelNodesPerColumn = 4;
    debugMode = false;
    overideTransparency = false;
    containerHeight = 800; // or any other number you want
    graphData: GraphData = {
        nodes: [],
        links: []
    };
    selectedNodeId = undefined;
    selectedNodeShape: string = 'ellipse'; // Default shapeDF
    symbolMapping: { key: string, value: string, name:string }[] = [
        { key: 'ellipse', value: '\u2b24', name:' (Circle) ' }, 
        { key: "triangle", value: '\u25b2', name: ' (Triangle)' },
        { key: "rectangle", value: '\u25fc', name: ' (Square)' },
        { key: "rhomboid", value: '\u25b0', name: ' (Rhombus)' },
        { key: "diamond", value: '\u25c6', name: ' (Diamond)' },
        { key: "heptagon", value: '\u2b23', name: ' (Heptagon)' },
        { key: "pentagon", value: '\u2b1f', name: ' (Pentagon)' },
        { key: "hexagon", value: '\u2b22', name: ' (Hexagon)' },
        { key: "barrel", value: '', name: ' (Barrel)' },
        { key: "octagon", value: '\u2bc3', name: ' (Octagon)' },
        { key: "star", value: '\u2605', name: ' (Star)' },
        { key: "tag", value: '\u2617', name: ' (Tag)' },
        { key: "vee", value: 'V', name: ' (Vee)' },
    ];
    shapeAggregates: { key: string, count: Number, frequency: Number }[] = [];
    shapeSort: { key: string, assending: boolean} = { key: 'count', assending: true};

    linkMin: number = 3;
    linkMax: number = 27;
    linkScale: any;
    visLinks: any;
    linkMid: number = 1

    nodeMin: number = 3;
    nodeMax: number = 27;
    nodeScale: d3.ScaleLinear<number, number> = d3.scaleLinear().domain([0, 1]).range([0, 1]);    
    visNodes: any;
    nodeMid: number = 1;

    // TODO determine if this is needed anymore after transition to cytoscape
    autoFit: boolean = true;

    ShowNetworkAttributes: boolean = false;
    ShowStatistics: boolean = true;
    Show2DExportPane: boolean = false;
    Show2DSettingsPane: boolean = false;
    IsDataAvailable: boolean = false;

    widgets: object;
    halfWidth: any = null;
    halfHeight: any = null;
    transform: any = null;
    force: any = null;
    radToDeg: any = (180 / Math.PI);
    selected: any = null;
    zoom: any = null;
    FieldList: SelectItem[] = [];
    ToolTipFieldList: SelectItem[] = [];
    LinkToolTipList: SelectItem[] = [];

    ctrlPressed: boolean = false;
    dragging: boolean = false;

    isLoading: boolean = true;
    viewActive: boolean = true;

    //Polygon Tab
    SelectedPolygonLabelVariable: string = "None";
    SelectedPolygonColorVariable: string = "None";
    SelectedPolygonLabelOrientationVariable: 'top' | 'bottom' | 'center' = "top";
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

    TableTypes: any = [
        { label: 'Show', value: 'Show' },
        { label: 'Hide', value: 'Hide' }
    ];
    SelectedNetworkTableTypeVariable: string = "Hide";

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

    ContextSelectedNodeAttributes: { attribute: string, value: string }[] = [];

    // TODO see if needed after transition to cytoscape
    // zoomScaleExtent: [number, number] = [0.005, 5]; // Minimum zoom of 0.1 and maximum zoom of 2

    private customShapes: CustomShapes = new CustomShapes();
    private symbolTableWrapper: HTMLElement | null = null;
    private linkColorTableWrapper: HTMLElement | null = null;
    private nodeColorTableWrapper: HTMLElement | null = null;

    private isExportClosed: boolean = false;
    /* XXXXXnot sure if this boolean is necessary; Related to exportWork, and bottom-table s (ie. node-symbol-table-bottom)
     currently exportWork2 is used which don't make use of isExporting and bottom-table s XXXXX */
    public isExporting: boolean = false;

    isMac: boolean = navigator.userAgent.toUpperCase().indexOf('MAC') >= 0;
    thresholdSubscription: any;
    threshold: number;
    networkUpdatedSubscription: any;
    settingsLoadedSubscription: any;
    private styleFileSub: any;
    constructor(injector: Injector,
        private eventManager: EventManager,
        public commonService: CommonService,
        @Inject(BaseComponentDirective.GoldenLayoutContainerInjectionToken) private container: ComponentContainer,
        elRef: ElementRef,
        private cdref: ChangeDetectorRef,
        private clipboard: Clipboard,
        private gtmService: GoogleTagManagerService,
        private store: CommonStoreService,
        private exportService: ExportService
    ) {

        super(elRef.nativeElement);

        // this.setExpanded(this.mainSite);

        this.widgets = this.commonService.session.style.widgets;


        this.container.on('resize', () => { this.fit()})
        this.container.on('hide', () => { 
            this.viewActive = false; 
            this.cdref.detectChanges();
        })
        this.container.on('show', () => { 
            this.viewActive = true; 
            this.cdref.detectChanges();
            setTimeout(() => {
                this.fit()
                this.commonService.onStatisticsChanged("Show");
            }, 50)
        })

            // Initialize the selectedNodeShape from the settings
        this.widgets['node-symbol'] = this.mapPreviousShapeNameToCurrent(this.widgets['node-symbol']);
        this.selectedNodeShape = this.widgets['node-symbol'];

        cytoscape.use(svg);

    }

    private destroy$ = new Subject<void>();


    ngOnInit() {
        
        // Console log this out to see what the window objetc has like temp
        // const windowKeys = Reflect.ownKeys(window);

        // this.commonService.updateNetwork();

        console.log('--- TwoD ngOnInit called');

        console.log(this.cyContainer);
        this.networkUpdatedSubscription = this.store.networkUpdated$
        .pipe(takeUntil(this.destroy$))
        .subscribe(newPruned => {
            console.log('--- TwoD DATA network updated', newPruned);
            if(this.data && this.store.settingsLoadedValue && newPruned && this.commonService.activeTab === '2D Network'){
                console.log('--- TwoD DATA network updated pruned', newPruned);
                this._rerender();
                //this.loadSettings();
            }
        });

        this.settingsLoadedSubscription = this.store.settingsLoaded$
        .pipe(takeUntil(this.destroy$))
        .subscribe(loaded => {
            if(loaded && this.commonService.activeTab === '2D Network') {

                 this._rerender();

            }
        });

    this.thresholdSubscription = this.store.linkThreshold$
        .pipe(takeUntil(this.destroy$))
        .subscribe(newThreshold => {
            if (!this.commonService.session.network.isFullyLoaded) return;

            if(this.commonService.activeTab === '2D Network') {
                if (this.threshold !== newThreshold) {
                    console.log('--- TwoD partial threshold changed', newThreshold);
                    this._partialUpdate();
                }
            }
        });
        this.InitView();

    }

    ngAfterViewInit(): void {

        console.log('--- TwoD ngAfterViewInit called');
    }

  mapDataToCytoscapeElements(data: any, timelineTick=false): cytoscape.ElementsDefinition {

    console.log('--- TwoD mapDataToCytoscapeElements called');
        // Create a set to track unique parent nodes
    const parentNodes = new Set();

    const edges = data.links.map((link: any) => ({
        data: {
            id: link.id,
            source: link.source,
            target: link.target,
            lineSelectedColor: this.widgets['selected-color'],
            label: this.getLinkLabel(link).text, // Existing link label
            lineColor: this.getLinkColor(link).color, // Default to black if not specified
            lineOpacity: this.getLinkColor(link).opacity, // Default to fully opaque if not specified
            width: this.getLinkWidth(link),
            // Include any additional edge-specific data properties
            ...link
        }
    }));

    console.log('--- TwoD mapDataToCytoscapeElements Links Done');


    const nodes = data.nodes.map((node: any) => {
         // If the node has a parentId, add it to the parentNodes set
        if (node.group && this.widgets['polygons-show']) {
            parentNodes.add(node.group);
        }

        if (timelineTick) {
            // otherwise data: label gets overridden to be undefined
            node.label = this.getNodeLabel(node);
            node.nodeSize = Number(this.getNodeSize(node));
            [node.nodeColor, node.bgOpacity] = this.getNodeColor(node);
            return {
                data: {
                    id: node.id,
                    parent: (node.group && this.widgets['polygons-show']) || undefined, // Assign parent if exists
                    //nodeColor: this.getNodeColor(node), // <-- Added for dynamic node color
                    selectedBorderColor: this.widgets['selected-color'],
                    fontSize: this.getNodeFontSize(node), // <-- Added for dynamic label size
                    shape: this.getNodeShape(node),
                    // Include any additional node-specific data properties
                    ...node
                },
                position: { 
                    x:node.x || this.nodePositions.get(node.id)?.x || Math.random() * 500,
                    y:node.y || this.nodePositions.get(node.id)?.y || Math.random() * 500
                }
            }
        } else {
            node.label = this.getNodeLabel(node);
            [node.nodeColor, node.bgOpacity] = this.getNodeColor(node); // <-- Added for dynamic node color
            return {
                data: {
                    id: node.id,
                    //label: (this.widgets['node-label-variable'] === 'None' || !node.label) ? '' : node.label,
                    parent: (node.group && this.widgets['polygons-show']) || undefined, // Assign parent if exists
                    nodeSize: Number(this.getNodeSize(node)), // Existing node size
                    //nodeColor: this.getNodeColor(node), // <-- Added for dynamic node color
                    borderWidth: this.getNodeBorderWidth(node), // <-- Added for dynamic border width
                    selectedBorderColor: this.widgets['selected-color'],
                    fontSize: this.getNodeFontSize(node), // <-- Added for dynamic label size
                    shape: this.getNodeShape(node),
                    // Include any additional node-specific data properties
                    ...node
                },
                position: {
                    x: node.x || this.nodePositions.get(node.id)?.x || Math.random() * 500,
                    y: node.y || this.nodePositions.get(node.id)?.y || Math.random() * 500
                  }
                  
            };
        }
    });

    console.log('--- TwoD mapDataToCytoscapeElements nodes done');


    return {
        edges: edges,
        nodes: nodes
        };
    }

    getCytoscapeStyles(): cytoscape.StylesheetCSS[] {
        return [
            {
                selector: 'node',
                css: {
                    'background-color': 'data(nodeColor)', // Use dynamic node color
                    // 'width': 'mapData(nodeSize, 0, 100, 10, 50)', // Existing dynamic sizing
                    // 'height': 'mapData(nodeSize, 0, 100, 10, 50)',
                    'border-width': 'data(borderWidth)', // Use dynamic border width
                    // 'border-color': '#000',
                    'text-valign': 'center',
                    'color': 'black',
                    // @ts-ignore
                    'shape': 'data(shape)',
                    'z-index': 10, // Not a standard Cytoscape property, but kept for clarity
                    // 'font-size': 'data(fontSize)' // Ensure this line is included
                }
            },
            {
                selector: 'node[label]',
                css: {
                  'label': 'data(label)' 
                }
              },
              {
                selector: 'node[!label]',
                css: {
                  'label': '' // or omit entirely
                }
              },
              // Apply styles only to nodes with nodeSize defined
            {
                selector: 'node[nodeSize]',
                css: {
                    'width': 'mapData(nodeSize, 0, 100, 10, 50)',
                    'height': 'mapData(nodeSize, 0, 100, 10, 50)'
                }
            },
            {
                selector: 'node[bgOpacity]',
                css: {
                    // @ts-ignore
                    'background-opacity': 'data(bgOpacity)',
                }
            },
                {
                    selector: '.hidden',
                    css: {
                        display: 'none'
                    }
                },
            // Apply styles only to nodes with nodeColor defined
            {
                selector: 'node[nodeColor]',
                css: {
                    'background-color': 'data(nodeColor)'
                }
            },
            // Apply styles only to nodes with fontSize defined
            {
                selector: 'node[fontSize]',
                css: {
                    'font-size': 'data(fontSize)'
                }
            },
            {
                selector: 'node[shape]',
                css: {
                    // @ts-ignore
                    'shape': 'data(shape)'
                }
            },
            {
                selector: 'node.parent',
                css: {
                    'z-index': 20, // Not a standard Cytoscape property, but kept for clarity
                    // We also need to ensure that it uses data(...) for color & alpha:
                    'background-color': 'data(nodeColor)', 
                    'border-width': 'data(borderWidth)'   
                    // The critical addition (can also be 'opacity' but that will fade the label, border, etc.):
                    // 'z-compound-depth': 'back',  // ensures parent is behind children
                }
            },
            {
                selector: 'node.parent[bgOpacity]',
                css: {
                    // @ts-ignore
                    'background-opacity': 'data(bgOpacity)',
                }
            },
            {
                selector: 'edge',
                css: {
                    'width': 'data(width)', // Existing dynamic edge width
                    'line-color': 'data(lineColor)', // Maps 'lineColor' data attribute to 'line-color' style
                    // @ts-ignore
                    'line-opacity': 'data(lineOpacity)', // Explicitly control link transparency

                    'label' : 'data(label)',                   
                    // 'target-arrow-color': '#ccc',
                    // 'target-arrow-shape': 'triangle',
                    'curve-style': 'bezier'
                    // 'opacity': 'data(opacity)' // Existing opacity
                }
            },
            {
                selector: 'node:selected',
                css: {
                    'background-color': 'data(nodeColor)',
                    'border-color': 'data(selectedBorderColor)',
                    'border-width': 3
                }
            },
            {
                selector: 'edge:selected',
                css: {
                    // 'line-color': '#f00',
                    // 'target-arrow-color': '#f00',
                    'width': 3
                }
            },
            {
                selector: 'edge.highlighted',
                css: {
                    'line-color': 'data(lineSelectedColor)', // Highlight color
                    'width': '3px',
                    'opacity': 1,
                }
            }
        ];
    }

    attachCytoscapeEvents() {
        console.log('--- TwoD attachCytoscapeEvents called');
        this.cy.on('tap', 'node', (evt) => {
            const node = evt.target;
            console.log('Selected node:', node.data());
    
            // Update selectedNodeId and trigger change detection or re-render if necessary
            this.selectedNodeId = node.id();

            // Update with selected color set in global settings
            node.data('selectedBorderColor', this.widgets['selected-color']);

            this.cy.style().update();
    
        });
    
        this.cy.on('mouseover', 'node', (evt) => {
            const node = evt.target;
            this.showNodeTooltip(node.data(), evt.originalEvent);

            // Set cursor to grab
            $('html,body').css('cursor', 'grab');

            if (this.widgets['node-highlight']) {
                // Highlight connected edges
                node.connectedEdges().addClass('highlighted');
            }

        });
    
        this.cy.on('mouseout', 'node', (evt) => {

            const node = evt.target;

            this.hideTooltip();

            $('html,body').css('cursor', 'default');

            if (this.widgets['node-highlight']) {
                // Remove highlight from connected edges
                node.connectedEdges().removeClass('highlighted');
            }

        });
    
        // Edge events
        this.cy.on('mouseover', 'edge', (evt) => {
            const edge = evt.target;
            this.showLinkTooltip(edge.data(), evt.originalEvent);
        });
    
        this.cy.on('mouseout', 'edge', () => {
            this.hideTooltip();
        });
    
        // Selection and Dragging
        this.cy.on('select', 'node', (evt) => {
            const node = evt.target;
            // Handle selection logic
        });
    
        this.cy.on('dragfree', 'node', (evt) => {
            const node = evt.target;
            let skip = (node.children().length > 0 || node.classes().includes('hidden')) // no need to update position of parent or hidden nodes

            if (!skip) {
                this.updateNodePos(node);
            }

            // Handle node drag logic
        });
    }

    /**
     * Used to gather nodes within a group and separate them from other groups
     * @param initial - if true runs iterations of gather force first, then run second simulation that both gathers nodes within a group and separates them from other groups
     * @returns 
     */
    async gatherGroups(initial: boolean = true): Promise<{ nodes: any[]; links: any[] }> { 
        let visNodes = this.commonService.getVisibleNodes();
        if (initial) {
            const { nodes: laidOutNodes, links: laidOutLinks} = await this.applyGatherForce(10);
            
            this.cy.nodes().forEach(node => {
                if (laidOutNodes.map(n => n.id).includes(node.id())) {
                    let cNode = laidOutNodes.find(n => n.id === node.id());
                    node.position({ x: cNode.x, y: cNode.y });
                }
            });

            // second iteration leads to better layout, skip if number of nodes > 500
            if (this.commonService.session.data.nodeFilteredValues.length < 500) {
                const { nodes: laidOutNodes3, links: laidOutLinks3} = await this.applyGatherForce(10);
                
                this.cy.nodes().forEach(node => {
                    if (laidOutNodes3.map(n => n.id).includes(node.id())) {
                        let cNode = laidOutNodes3.find(n => n.id === node.id());
                        node.position({ x: cNode.x, y: cNode.y });
                    }
                });
            }
        }
        
        const { nodes: laidOutNodes2, links: laidOutLinks2, parentNodes: pNodes2 } = await this.applySeparationForce();

        // moves individual (child and independent) nodes
        laidOutNodes2.forEach(node => {
            let cyNode = this.cy.nodes().toArray().find(n => n.id() === node.id);
            if (cyNode) {
                cyNode.position({ x: node.x, y: node.y });
            }
        })

        // moves parent (parent and indepent) nodes
        if (this.widgets['polygons-foci'] != 'None') {
            pNodes2.forEach(node => {
                let cyNode = this.cy.nodes().toArray().find(n => n.id() === node.id);
                if (cyNode) {
                    cyNode.position({ x: node.x, y: node.y });
                }
            })
        }

        // updates node position values (x, y) stored in commonService 
        visNodes.forEach(node => {
            let currentNode = this.cy.nodes().toArray().find(n => n.id() == node.id)
            if (currentNode) {
                node.x = currentNode.position('x');
                node.y = currentNode.position('y');
            }
        })

        this.fit();

        return { nodes: [], links: [] };

    }

    /**
     * Applies force to gather nodes within a group
     * @param ticks - number of ticks to run the simulation for
     */
    async applyGatherForce(ticks: number = 10): Promise<{ nodes: any[]; links: any[] }> {
                //let nodes = this.commonService.getVisibleNodes()
        let links = this.commonService.getVisibleLinks().map(link =>{ return {'source': link.source, 'target': link.target} });
        
        let tickCount = 0;
        
        let childNodes: {id: string, parentX: any, parentY: any,  x: number, y: number, vx?:number, vy?:number}[] = [];

        this.cy.nodes().forEach(node => {
            if (node.children().length > 0) {
                return;
            } else if (node.parent().length > 0) {
                childNodes.push({ 
                    id: node.id(),
                    parentX: node.parent()[0].position('x'),
                    parentY: node.parent()[0].position('y'),
                    x: node.position('x'),
                    y: node.position('y'),

                })
            } else {
                childNodes.push({
                    id: node.id(),
                    parentX: 0,
                    parentY: 0,
                    x: node.position('x'),
                    y: node.position('y'),
                })

            }
        })

        let gatherSimulation = d3.forceSimulation(childNodes)
            .force('charge', d3.forceManyBody().strength(-10))
            .force('link', d3.forceLink(links).id((d: any) => d.id).distance(30))
            .force('center', d3.forceCenter(0, 0))
            .force('collide', d3.forceCollide().radius(20))
            .force('x', d3.forceX(d => d.parentX).strength(d => d.parentX == 0 ? .005 : .35))
            .force('y', d3.forceY(d => d.parentY).strength(d => d.parentY == 0 ? .005 : .35))
            .stop();
      
        return new Promise((resolve) => {
          function tick() {
            
            gatherSimulation.tick();
  
            tickCount++;

            if (tickCount < ticks) {
              // Use setTimeout to yield control to the browser between ticks
              setTimeout(tick, 0);
            } else {
              // After all ticks, resolve the promise with the updated nodes and links.
              resolve({ nodes: childNodes, links});
            }
          }
          tick();
        });
    }


    /**
     * Applies force to gather nodes within a group and separate them from other groups
     */
    async applySeparationForce(): Promise<{ nodes: any[]; links: any[], parentNodes: any[] }> {
        let links = this.commonService.getVisibleLinks().map(link =>{ return {'source': link.source, 'target': link.target} });
        let ticks = 20;
        let tickCount = 0;

        let parentNodes: {id: string, max_dim: number, x: number, y: number, vx?:number, vy?:number, group: boolean}[] = [];
        let childNodes: {id: string, parent: any, x: number, y: number, vx?:number, vy?:number}[] = [];

        this.cy.nodes().forEach(node => {
            if (node.children().length > 0) {
                //console.log(node);
                parentNodes.push({
                    id: node.id(),
                    max_dim: Math.max(node.boundingBox().w, node.boundingBox().h),
                    x: node.position('x'),
                    y: node.position('y'),
                    group: true,
                })
            } else if (node.parent().length > 0) {
                childNodes.push({ 
                    id: node.id(),
                    parent: node.parent()[0].data('id'),
                    x: node.position('x'),
                    y: node.position('y'),
                })
            } else {
                parentNodes.push({
                    id: node.id(),
                    max_dim: 35,
                    x: node.position('x'),
                    y: node.position('y'),
                    group: false,
                })
                childNodes.push({
                    id: node.id(),
                    parent: null,
                    x: node.position('x'),
                    y: node.position('y'),
                })

            }

        })
        let separationSimulation = await d3.forceSimulation(parentNodes)
            .force('charge', d3.forceManyBody().strength(-30))
            .force('collide', d3.forceCollide().radius(d => d.max_dim/1.5))
            .force('x', d3.forceX().strength(.005))
            .force('y', d3.forceY().strength(.005))
            .stop();
                
        let gatherSimulation = d3.forceSimulation(childNodes)
            .force('charge', d3.forceManyBody().strength(-30))
            .force('link', d3.forceLink(links).id((d: any) => d.id).distance(50))
            .force('center', d3.forceCenter(0, 0))
            .force('collide', d3.forceCollide().radius(20))
            .force('x', d3.forceX(d => d.parent == null ? 0 : parentNodes.find(p => p.id == d.parent).x).strength(d => d.parent == null ? .005 : .1))
            .force('y', d3.forceY(d => d.parent == null ? 0 : parentNodes.find(p => p.id == d.parent).y).strength(d => d.parent == null ? .005 : .1))
            .stop(); 
      
        return new Promise((resolve) => {
          function tick() {
            gatherSimulation.tick();
            separationSimulation.tick();
                        
            tickCount++;
            if (tickCount == ticks) {
                separationSimulation.tick();
            }

            if (tickCount < ticks) {
              // Use setTimeout to yield control to the browser between ticks
              setTimeout(tick, 0);
            } else {
              // After all ticks, resolve the promise with the updated nodes and links.
              resolve({ nodes: childNodes, links, parentNodes});
            }
          }
          tick();
        });
    }

    async precomputePositionsWithD3(nodes: any[], links: any[], ticks:number = 300, initial: boolean = true): Promise<{ nodes: any[]; links: any[] }> {

        let simulation;
        if (initial) {
            simulation = d3.forceSimulation(nodes)
                .force('charge', d3.forceManyBody().strength(-30))
                .force('link', d3.forceLink(links).id((d: any) => d.id).distance(50))
                .force('center', d3.forceCenter(0, 0))
                .stop(); // Stop auto-stepping so we can control the ticks manually
        } else {
            simulation = d3.forceSimulation(nodes)
                .force('charge', d3.forceManyBody().strength(-30))
                .force('link', d3.forceLink(links).id((d: any) => d.id).distance(50))
                .force('center', d3.forceCenter(0, 0))
                .force('collide', d3.forceCollide().radius(20))
                .force('x', d3.forceX().strength(.005))
                .force('y', d3.forceY().strength(.005))
                .stop(); 
        } 
        let tickCount = 0;
      
        return new Promise((resolve) => {
          function tick() {
            simulation.tick();
            tickCount++;
            if (tickCount < ticks) {
              // Use setTimeout to yield control to the browser between ticks
              setTimeout(tick, 0);
            } else {
              // After all ticks, resolve the promise with the updated nodes and links.
              resolve({ nodes, links });
            }
          }
          tick();
        });
      }

    /**
     * Updates the saved postion of a node when it is dragged by the user
     * @param node
     */
    updateNodePos(node) {
      let globalNode = this.commonService.getVisibleNodes().find(x => x._id == node.data('id')) // need to update so it works with grouped nodes/polygons
      globalNode['x'] = node.position().x;
      globalNode['y'] = node.position().y;

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

        console.log('--- TwoD InitView called');

        this.gtmService.pushTag({
            event: "page_view",
            page_location: "/2d_network",
            page_title: "2D Network View"
        });
        this.IsDataAvailable = (this.commonService.session.data.nodes.length === 0 ? false : true);
        if (!this.widgets['default-distance-metric']) {
            this.widgets['default-distance-metric'] =
                this.commonService.GlobalSettingsModel.SelectedDistanceMetricVariable;
            this.widgets['link-threshold'] =
                this.commonService.GlobalSettingsModel.SelectedLinkThresholdVariable;
        }

        // Subscribe to style file applied event
        this.styleFileSub = this.store.styleFileApplied$.subscribe(() => {
            console.log('--- TwoD InitView stylefile sub');

            this.applyStyleFileSettings();
        });


        // Use this method to prepare your variables before they're used in the template
        this.commonService.session.style.widgets['node-tooltip-variable'] = this.ensureArray(this.commonService.session.style.widgets['node-tooltip-variable']);
        this.commonService.session.style.widgets['link-tooltip-variable'] = this.ensureArray(this.commonService.session.style.widgets['link-tooltip-variable']);
        let that = this;

        if (this.IsDataAvailable === true && this.zoom === null) {

            console.log('--- TwoD InitView IsDataAvailable true');
            // populate this.twoD.FieldList with [None, ...nodeFields]
            this.FieldList = [];
            this.FieldList.push({ label: "None", value: "None" });
            this.commonService.session.data['nodeFields'].map((d, i) => {
                if (d != 'seq' && d != 'sequence') {
                    this.FieldList.push(
                        {
                            label: this.commonService.capitalize(d.replace("_", "")),
                            value: d
                        });
                }

            });

            // populate this.ToolTipFieldList and this.LinkToolTipList
            this.ToolTipFieldList = [];
            this.LinkToolTipList = [];
            this.ToolTipFieldList.push({ label: "None", value: "None" });
            this.commonService.session.data['linkFields'].map((d, i) => {
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
                    this.ToolTipFieldList = this.ToolTipFieldList.concat(data);
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
                    this.ToolTipFieldList = this.ToolTipFieldList.concat(data);
                    this.LinkToolTipList = this.LinkToolTipList.concat(data)
                } else {
                    this.LinkToolTipList.push(
                        {
                            label: this.commonService.capitalize(d.replace("_", "")),
                            value: d
                        });
                    this.ToolTipFieldList.push(
                        {
                            label: this.commonService.capitalize(d.replace("_", "")),
                            value: d
                        });
                }
            });


            this.halfWidth = $('#network').parent().width() / 2;
            this.halfHeight = $('#network').parent().parent().parent().height() / 2;

            // let networkData = {
            //     nodes: this.commonService.getVisibleNodes(),
            //     links: this.commonService.getVisibleLinks()
            // }

            // this.data = this.commonService.convertToGraphDataArray(networkData);

            // if (this.debugMode) {
            //     console.log('data: ', this.data);
            // }

            // this._rerender();

            $(document).on("node-visibility", function () {
                console.log('node-visibility called');
                that._rerender(true);
            });

            // $(document).on("link-visibility", async function () {

            // });

            // $(document).on("cluster-visibility", function () {

            // });

            // TODO move this to a subscribed event than use document jquery
            $(document).on("node-selected", function () {

                let mtSelectedNode = that.commonService.getSelectedNode(that.commonService.getVisibleNodes());
                if (mtSelectedNode && mtSelectedNode.id) {
                    that.selectedNodeId = mtSelectedNode.id;
                } else if (mtSelectedNode && !mtSelectedNode.id) {
                    that.selectedNodeId = mtSelectedNode._id;
                }

                    // Deselect all nodes first
                    that.cy.elements().unselect();

                    // Select the newly selected node
                    if (that.selectedNodeId) {
                        const node = that.cy.getElementById(that.selectedNodeId);
                        if (node) {
                            node.select();
                        }
                    }

                    // that.debouncedRerender();
                    if (that.debugMode) {
                        console.log('node-selected in 2d: ', that.selectedNodeId);
                        console.log('node-selected in data: ', that.data.nodes.find(node => node.id == that.selectedNodeId));
                    }
            });


            if (this.commonService.session.files.length > 1) $('#link-color-variable').val('origin').change();
            if (this.widgets['background-color']) $('#cy').css('background-color', this.widgets['background-color']);
            
            console.log('--- TwoD InitView onStatisticsChanged');
            this.commonService.onStatisticsChanged();

            console.log('--- TwoD InitView loadSettings');
            this.loadSettings();

            if (this.widgets['node-symbol-variable'] !== 'None') {
                $('#node-symbol-variable').change(); //.trigger('change');
            }

            console.log('--- TwoD InitView End');
        } else {
            console.log('--- TwoD InitView DATA NOTE AVAILABLE');
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
     * @returns an array [X, Y] of the position of mouse relative to twodcomponent. Global position (i.e. d3.event.pageX) doesn't work for a dashboard
     */
    getRelativeMousePosition(event) {
        // Get position based on container
        let rect =  document.getElementById('cy').getBoundingClientRect();
        const X = event['clientX'] - rect.left;
        const Y = event['clientY'] - rect.top;
        return [X, Y];
    }


    /**
     * Updates calculated resolution based on scale
     * @param event Event from scale input
     */
    updateCalculatedResolution(): void {
        let height = Math.floor(this.cyContainer.nativeElement.offsetHeight * this.SelectedNetworkExportScaleVariable);
        let width  = Math.floor(this.cyContainer.nativeElement.offsetWidth  * this.SelectedNetworkExportScaleVariable);

        this.CalculatedResolution = `${width} x ${height}`;
    }

    /**
     * Opens Global Setting Dialog
     */
    showGlobalSettings() {
        //console.log("threshold: ",  this.commonService.GlobalSettingsModel.SelectedLinkThresholdVariable);
        this.DisplayGlobalSettingsDialogEvent.emit("Styling");
    }


    /**
     * Debounced version of the _rerender function.
     * Delays the execution until after 1000ms have elapsed since the last call.
     */
    debouncedRerender() {
        const debounceDelay = 1000; // 1 second
    
        if (this.rerenderTimeout) {
            clearTimeout(this.rerenderTimeout);
        }
    
        this.rerenderTimeout = setTimeout(() => {
            this._rerender(); // Call the actual rerender method
            this.rerenderTimeout = null; // Clear the timeout reference
        }, debounceDelay);
    }

    /**
     * Hides export pane, sets isExporting variable to true and calls exportWork2 to export the twoD network image
     */
    exportVisualization(event) {

        // Prepare export options
        const exportOptions: ExportOptions = {
            filename: this.SelectedNetworkExportFilenameVariable,
            filetype: this.SelectedNetworkExportFileTypeListVariable,
            scale: this.SelectedNetworkExportScaleVariable,
            quality: this.SelectedNetworkExportQualityVariable,
        };
    
        // Set export options in the service
        this.exportService.setExportOptions(exportOptions);

        if (this.SelectedNetworkExportFileTypeListVariable == 'svg') {

            let options = { scale: 1, full: true, bg: '#ffffff'};
            let content = (this.cy as any).svg(options);

            // gets width and height which is needed to position the network statistics table
            const parser = new DOMParser();
            const doc = parser.parseFromString(content, 'image/svg+xml');
            const svg1 = doc.documentElement;          
            let width = parseFloat(svg1.getAttribute('width'));
            let height = parseFloat(svg1.getAttribute('height')); 

            // Add the network statistics table to the svg
            let statTable = this.exportService.exportTableAsSVG(this.networkStatisticsTable.nativeElement)
            statTable.svg = statTable.svg.replace('<g>', `<g transform="translate(${width-statTable.width-2}, ${height-statTable.height-2})" fill="#f8f9fa">`);
            content = content.replace('</svg>', statTable.svg + '</svg>');

            let elementsToExport: HTMLTableElement[] = [];
            if (this.widgets['node-symbol-table-visible'] != 'Hide') {
                elementsToExport.push(this.nodeSymbolTable.nativeElement)
            }
            if (this.widgets["polygon-color-table-visible"]) {
                elementsToExport.push(this.polygonColorTable.nativeElement);
            }
            this.exportService.requestSVGExport(elementsToExport, content, true, true); 

        } else {
            // Request export
            let elementsToExport: HTMLDivElement[] = [this.exportContainer.nativeElement];
            if (this.widgets['node-symbol-table-visible'] != 'Hide') {
                elementsToExport.push(this.nodeSymbolTable.nativeElement)
            }
            if (this.widgets["polygon-color-table-visible"]) {
                elementsToExport.push(this.polygonColorTable.nativeElement);
            }
            this.exportService.requestExport(elementsToExport, true, true);
        }
    
        // Optionally, close the export modal after initiating the export
        this.Show2DExportPane = false;
    }

    /**
     * Sets this.isExportClosed to true
     */
    onCloseExport() {
        this.isExportClosed = true;
    }

    /**
     * Handles file type change
     * @param event New file type value
     */
    onNetworkExportFiletypeChange(event: any): void {
        this.SelectedNetworkExportFileTypeListVariable = event;

        if (event == "svg") {
                this.ShowAdvancedExport = false;
            }
            else {
                this.ShowAdvancedExport = true;
        }
    }

    /**
     * Toggles advanced export options visibility
     */
    toggleAdvancedExport(): void {
        this.ShowAdvancedExport = !this.ShowAdvancedExport;
    }

    /**
     * Handles filename change
     * @param event New filename value
     */
    onDataChange(event: any): void {
        this.SelectedNetworkExportFilenameVariable = event;
    }

    /**
     * When the svg is clicked, this function is called and it removes color transparency slider that appears when updating color transparency in node/link color tables
     */
    networkWhitespaceClicked(): void {

        // The color transparency slider should dissapear if clicked out
        $("#color-transparency-wrapper").css({
            display: "none"
        });

        this.commonService.session.network.nodes.forEach(node => {
            node.selected = false;
        });
    }

  
    /**
     * Generates Polygon Color Selection Table, updates polygonColorMap and polygonAlphaMap functions, and then calls render to show/update network
     * 
     */
    updatePolygonColors() {

        let polygonColorTable = $("#polygon-color-table")
            .empty()
            .append(            
                "<tr>" +
                "<th class='p-1 table-header-row'><div class='header-content'><span contenteditable>Group " + this.commonService.titleize(this.widgets['polygons-foci']) + "</span><a class='sort-button sortName' style='cursor: pointer'>⇅</a></div></th>" +
                `<th class='table-header-row tableCount' ${ this.widgets['polygon-color-table-counts'] ? "" : "style='display: none'"}><div class='header-content'><span contenteditable>Count</span><a class='sort-button sortCount' style='cursor: pointer'>⇅</a></div></th>` +
                `<th class='table-header-row tableFrequency' ${ this.widgets['polygon-color-table-frequencies'] ? "": "style='display: none'"}><div class='header-content'><span contenteditable>Frequency</span><a class='sort-button sortCount' style='cursor: pointer'>⇅</a></div></th>` +
                "<th>Color</th>" +
                "</tr>");
            //.append(polygonHeader)
            // .append(countHeader)
            // .append((this.widgets["polygon-color-table-frequencies"] ? "<th>Frequency</th>" : ""))
            // .append("<th>Color</th>");
        
        if (!this.commonService.session.style['polygonValueNames']) this.commonService.session.style['polygonValueNames'] = {};
        let aggregates = this.commonService.createPolygonColorMap();
        let values = Object.keys(aggregates);

        // By default both are set to "DESC", if one changed the other is set to ""; Default sort is by counts DESC
        if (this.widgets["polygon-color-table-counts-sort"] == "ASC") {
            values.sort(function (a, b) { return aggregates[a] - aggregates[b] });
        } else if (this.widgets["polygon-color-table-name-sort"] == "ASC") {
            values.sort(function (a, b) { return a as any - (b as any) });
        } else if (this.widgets["polygon-color-table-counts-sort"] == "DESC") {
            values.sort(function (a, b) { return aggregates[b] - aggregates[a] });
        } else { // if (this.widgets["polygon-color-table-name-sort"] == "DESC")
            values.sort(function (a, b) { return b as any - (a as any) });
        }

        let total = 0;
        values.forEach(d => total += aggregates[d]);

        let that = this;

        values.forEach((value, i) => {
            let colorinput = $('<input type="color" value="' + that.commonService.temp.style.polygonColorMap(value) + '">')
                .on("change", function (e) {
                    let locInPolygonColors = that.commonService.session.style['polygonColors'].indexOf(that.commonService.temp.style.polygonColorMap(value));
                    // need to update the value in the dom which is used when exportings
                    e.currentTarget.attributes[1].value = e.target['value'];

                    that.commonService.session.style['polygonColors'].splice(locInPolygonColors, 1, $(this).val() as string);
                    that.commonService.createPolygonColorMap()
                    that.updateGroupNodeColors();
                });
            let alphainput = $("<a class='transparency-symbol'>⇳</a>").on("click", e => {
                $("#color-transparency-wrapper").css({
                    top: e.clientY + 129,
                    left: e.clientX,
                    display: "block"
                });
                $("#color-transparency")
                    .val(that.commonService.session.style['polygonAlphas'][i])
                    .one("change", function () {
                        // changing transparency of 1 works, changing transparency of a 2nd group causes both to change, the 3rd causes all 3 to change...    
                        that.commonService.session.style['polygonAlphas'].splice(i, 1, parseFloat($(this).val() as string));
                        that.commonService.temp.style.polygonAlphaMap = d3
                            .scaleOrdinal(that.commonService.session.style['polygonAlphas'])
                            .domain(values);
                        $("#color-transparency-wrapper").fadeOut();
                        that.updateGroupNodeColors();
                    });
            });
            let cell = $("<td></td>")
                .append(colorinput)
                .append(alphainput);

            let row = $(
                "<tr>" +
                "<td data-value='" + value + "'>" +
                (that.commonService.session.style['polygonValueNames'][value] ? that.commonService.session.style['polygonValueNames'][value] : that.commonService.titleize("" + value)) +
                "</td>" +
                `<td class='tableCount' ${that.widgets["polygon-color-table-counts"] ? "" : "style='display: none'"}>${aggregates[value]}</td>` + 
                `<td class='tableFrequency' ${that.widgets["polygon-color-table-frequencies"] ? "" : "style='display: none'"}>${(aggregates[value] / total).toLocaleString()}</td>` +
                "</tr>"
            ).append(cell);

            polygonColorTable.append(row);
        });

        // PRE D3
        // this.commonService.temp.style.polygonColorMap = d3
        //   .scaleOrdinal(this.commonService.session.style['polygonColors'])
        //   .domain(values);
        //   this.commonService.temp.style.polygonAlphaMap = d3
        //   .scaleOrdinal(this.commonService.session.style['polygonAlphas'])
        //   .domain(values);

        polygonColorTable
            .find("td")
            .on("dblclick", function () {
                // $(this).attr("contenteditable", true).focus();
            })
            .on("focusout", function () {
                let $this = $(this);
                // $this.attr("contenteditable", false);
                that.commonService.session.style['polygonValueNames'][$this.data("value")] = $this.text();
            });

        polygonColorTable
            .find(".p-1")
            .on("focusout", function () {
                that.commonService.session.style['overwrite']['polygonColorHeaderVariable'] = that.widgets["polygons-foci"];
                that.commonService.session.style['overwrite']['polygonColorHeaderTitle'] = $($(this).contents()[0]).text();
            });


        // The sorting functionality is added here
        $('#polygon-color-table').off('click', 'th .sort-button').on('click', 'th .sort-button', function (e) {
            let isAscending: boolean;
            let index: number;
            if (e.currentTarget.classList.value.includes('sortName')) {
                index = 0;
                isAscending = that.widgets["polygon-color-table-name-sort"] == "DESC" ? true : false;
                that.widgets["polygon-color-table-name-sort"] = isAscending ? "ASC" : "DESC";
                that.widgets["polygon-color-table-counts-sort"] = "";
            } else {
                index = 1;
                isAscending = that.widgets["polygon-color-table-counts-sort"] == "DESC" ? true : false;
                that.widgets["polygon-color-table-counts-sort"] = isAscending ? "ASC" : "DESC";
                that.widgets["polygon-color-table-name-sort"] = "";
            }
            let table = $(this).parents('table').eq(0);
            let rows = table.find('tr:gt(0)').toArray().sort(comparer(index));
            if (!isAscending) { rows = rows.reverse(); }
            for (let i = 0; i < rows.length; i++) { table.append(rows[i]); }
        });

        function comparer(index) {
            return function (a, b) {
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
    polygonsToggle(flag: boolean) {

        this.widgets['polygons-show'] = flag;

        this.updateNodeGrouping(flag);

        if (flag) {
            // Ensure the label orientation is updated when polygons are turned on
            this.onPolygonLabelOrientationChange(this.widgets['polygon-label-orientation']);
        } else {
            $(".polygons-settings-row").slideUp();
            //$('.polygons-label-row').slideUp();
            $("#polygon-color-table-row").slideUp();
            $("#polygon-color-value-row").slideUp();
            $("#polygon-color-table").empty();

            this.PolygonColorTableWrapperDialogSettings.setVisibility(false);
        }

    }

    /**
     * Updates node grouping based on the polygons-show flag.
     * @param flag boolean indicating whether to show polygons/groups
     */
    private updateNodeGrouping(flag: boolean): void {
        if (!this.cy) {
            return;
        }

        const cy = this.cy; // Reference to Cytoscape instance

        cy.batch(() => {
            if (flag) {
                this.addParentNodesAndGroupChildren(cy);
            } else {
                this.removeParentNodesAndUngroupChildren(cy);
            }
        });

        // Trigger layout after grouping
        // this.applyLayout();
    }

    /**
     * Adds parent nodes for each group and assigns child nodes to these parents.
     * @param cy Cytoscape instance
     */
    private addParentNodesAndGroupChildren(cy: cytoscape.Core): void {
        const groupMap: Map<string, cytoscape.NodeSingular[]> = new Map();
        let foci = this.commonService.session.style.widgets['polygons-foci'];
        cy.nodes().forEach(node => {
            const group = node.data(foci);
            if (group || group==0) {
                if (!groupMap.has(group)) {
                    groupMap.set(group, []);
                }
                groupMap.get(group)?.push(node);
            }
        });

        const polygonGroups = Array.from(groupMap.entries()).map(([key, values]) => ({
            key,
            values: values.map(node => node.data('id'))
        }));

        this.commonService.temp.polygonGroups = polygonGroups;

        groupMap.forEach((nodesInGroup, group) => {
            const parentId = `${group}`;
            if (cy.getElementById(parentId).length === 0) {
                let color = this.commonService.session.style.widgets['polygons-color-show'] ? this.commonService.temp.style.polygonColorMap(group) : this.commonService.session.style.widgets['polygon-color'];
                const alphaVal = this.commonService.temp.style.polygonAlphaMap(group) ?? 1;
                cy.add({
                    group: 'nodes',
                    data: { 
                        id: parentId, 
                        label: parentId,
                        isParent: true, 
                        nodeColor: color,
                        borderWidth: 1,
                        shape: 'rectangle', 
                        bgOpacity: alphaVal,
                    },
                    classes: 'parent' // Assigning the 'parent' class
                });
            }
        });

        cy.nodes().forEach(node => {
            const group = node.data(foci);
            if (group || group==0) {
                const parentId = `${group}`;
                node.move({ parent: parentId });
            }
        });

          // **Step 6:** Create and Assign the `groups` Object for polygonGroups
          const groups = Array.from(groupMap.entries()).map(([key, values]) => ({
            key,
            values: values.map(node => node.data('id'))
        }));


        // Assign the groups to polygonGroups in commonService.temp
        this.commonService.temp.polygonGroups = groups;
    }
    /**
     * Removes all parent (group) nodes and unassigns child nodes from any parents.
     * @param cy Cytoscape instance
     */
    private removeParentNodesAndUngroupChildren(cy: cytoscape.Core): void {
        // Identify all parent nodes by class
        const parentNodes = cy.nodes('.parent');

        // Unassign child nodes from parents
        parentNodes.forEach(parent => {
            cy.nodes(`[parent = "${parent.id()}"]`).forEach(child => {
                child.move({ parent: null });
            });
        });

        // Remove parent nodes
        cy.remove(parentNodes);
    }

    private updateGroupNodeColors(): void {
        const cy = this.cy;
        if (!cy) {
            console.error('Cytoscape instance is not initialized.');
            return;
        }

        cy.nodes('.parent').forEach(parentNode => {
            const groupName = parentNode.data('label'); // Assuming 'label' holds the group name
            let color = this.commonService.session.style.widgets['polygons-color-show'] ? this.commonService.temp.style.polygonColorMap(groupName) : this.commonService.session.style.widgets['polygon-color'];
            // Determine the new color based on the groupColorMap
            const newColor = color || '#000'; // Default to black
            const alphaVal = this.commonService.temp.style.polygonAlphaMap(groupName) ?? 1;  // fallback = 1

            // Update the nodeColor data attribute
            parentNode.data('nodeColor', newColor);
            parentNode.data('bgOpacity', alphaVal);  // <--- The crucial piece!

            // Optionally, update the node's color style if not data-driven
            // parentNode.style('background-color', newColor);
        });

        // Refresh Cytoscape styles to apply changes
        cy.style().update();

        console.log('Group node colors updated.');
    }
    /**
     * This function is called when polygon-color-show widget is updated from the template.
     * This widget controls whether polygon should be colored the same or different.
     */
    polygonColorsToggle(e) {

        console.log('polygonColorsToggle: ', e);

        if (e) {
            this.widgets['polygons-color-show'] = true;
            $("#polygon-color-value-row").slideUp();
            $("#polygon-color-table-row").slideDown();
            this.PolygonColorTableWrapperDialogSettings.setVisibility(true);

            //setTimeout(() => {
                //this.updatePolygonColors();
                //this.updateGroupNodeColors();
            //}, 200);

        }
        else {
            this.widgets['polygons-color-show'] = false;
            $("#polygon-color-value-row").slideDown();
            $("#polygon-color-table-row").slideUp();
            $("#polygon-color-table").empty();
            this.PolygonColorTableWrapperDialogSettings.setVisibility(false);
            setTimeout(() => {
                // first removes polygons, if needed second call add them back
                this.updateNodeGrouping(false);
                if (this.commonService.session.style.widgets['polygons-show']) this.updateNodeGrouping(true);
            }, 200);
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
        this.updateGroupNodeColors();
    }

    /**
     * This function is called when polygon-color-table-visible widget is updated from the template. 
     * It is only available when polygon-color-show is true/show
     * This widget controls whether the polygon color table is visible.
     * 
     */
    polygonColorsTableToggle(e) {

        console.log('polygonColorsTableToggle: ', e);

        this.SelectedNetworkTableTypeVariable = e == true ? 'Show' : 'Hide';
        this.PolygonColorTableWrapperDialogSettings.setVisibility(e);        
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
        let vlinks = this.commonService.getVisibleLinks(true);
        let output = [];
        let n = vlinks.length;
        let nodes = this.commonService.session.network.nodes;
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

        output = output.filter(x => x.source != undefined && x.target != undefined);
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
        let vlinks = this.commonService.getVisibleLinks(true);
        let n = vlinks.length;
        for (let i = 0; i < n; i++) {
            vlinks[i].source = this.commonService.session.network.nodes.find(d => d._id == vlinks[i].source);
            vlinks[i].target = this.commonService.session.network.nodes.find(d => d._id == vlinks[i].target);
        }
        return vlinks;
    };

    /**
     * Used to calculate the angle between two nodes. It is used when setting link label
     * @param source source node
     * @param target target node
     */
    calcAngle(source, target) {
        return Math.atan((source.y - target.y) / (source.x - target.x)) * this.radToDeg;
    };


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

    };

    /**
     * Hides the Context Menu
     */
    hideContextMenu() {
        $('#context-menu').animate({ 'opacity': 0 }, 80, function () {
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
            div:has(> table#tooltip-table) {
              padding: 0px;
            }

            #tooltip-table {
                border-spacing: 0;
                width: 100%;
                border: 1px solid #ddd;
                z-index: 1000;
            }
            
            #tooltip-table td, #tooltip-table th {
                text-align: left;
                padding: 10px;
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
     * Gets data from current node needed for tooltip and displays it in the tooltip also hightlights neighbors if that option is selected
     * @param d a node
     */
    showNodeTooltip(d, event) {

        // Only show tooltip for nodes, not parent/group nodes
        if(d.isParent) {
            return;
        }

        if (this.widgets['node-highlight']) {
          this.selectedNodeId = d.id;
        }

        let tt_var_len = this.widgets['node-tooltip-variable'].length
        let tooltipHtml: string;

        if (tt_var_len == 0) {
          return null;
        } else if (tt_var_len == 1) {
         tooltipHtml =  `${d[this.widgets['node-tooltip-variable'][0]]}`
        } else {
          tooltipHtml =  this.tabulate(this.widgets['node-tooltip-variable'].map(variable => [this.titleize(variable), d[variable]]))
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
    }

    /**
     * Gets data from current link needed for tooltip and displays it in the tooltip
     * @param d link
     */
    showLinkTooltip(d, event) {
        let v: any = this.SelectedLinkTooltipVariable;

        if (v == 'None') return;


        // Tooltip variables can be a single string or an array
        let tooltipVariables = this.SelectedLinkTooltipVariable;
        if (!Array.isArray(tooltipVariables)) {
            tooltipVariables = [tooltipVariables];
            this.SelectedLinkTooltipVariable = tooltipVariables;  // Update SelectedLinkTooltipVariable to be an array
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
            tooltipHtml = this.tabulate(tooltipVariables.map(variable => [this.titleize(variable), getData(d, variable)]));
        } else {
            tooltipHtml = getData(d, tooltipVariables[0])
        }

        let [X, Y] = this.getRelativeMousePosition(event);
        d3.select('#tooltip')
            .html(tooltipHtml)
            .style('position', 'absolute')
            .style('left', (X + 10) + 'px')
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
     * This is called when the variable used to grouped by/created polygons is changed
     * 
     */
    async centerPolygons(e, updateLayout: boolean = true) {

        this.widgets['polygons-foci'] = e;
        if (this.widgets['polygons-color-show'] == true) {
            console.log('centerPolygons: show ');
            $("#polygon-color-table").empty();
            this.updateGroupAssignments(e);
            this.updatePolygonColors();
            this.updateGroupNodeColors();
        // Just update group assignments since not showing different colors
        } else {
            this.updateGroupAssignments(e);
        }
        if (updateLayout) await this.updateLayout();
    }

    updateLayout() {
        if (this.commonService.session.style.widgets['polygons-show'] == false || this.commonService.session.style.widgets['polygons-foci'] == 'None') {
            this._partialUpdate();
        } else {
            this.gatherGroups();
        }
    }

    updateGroupAssignments(foci: string): void {
        const cy = this.cy; // Reference to Cytoscape instance
        if (!cy) {
            console.error('Cytoscape instance is not initialized.');
            return;
        }
    
        cy.batch(() => {
            // Identify existing parent nodes and remove them if necessary
            const existingParents = cy.nodes('.parent');
            console.log('Removing existing parent nodes:', existingParents.map(p => p.id()));
            existingParents.forEach(parent => {
                // **Step 1:** Ungroup child nodes by setting their parent to null
                parent.children().forEach(child => {
                    child.move({ parent: null });
                });
    
                // **Step 2:** Remove the parent node without affecting child nodes
                cy.remove(parent);
            });
    
            // Determine new groups based on foci
            const groupMap: Map<string, cytoscape.NodeSingular[]> = new Map();
    
            cy.nodes().forEach(node => {
                // if(node.data('id') === '30578_KF773488_D99cl05') {
                //     console.log('nodeee1: ', node.data());
                //     console.log('nodeee2: ', node.data(foci));
                // }
                
                const rawGroup = node.data(foci); // Assuming foci corresponds to a data attribute
                const group = Array.isArray(rawGroup) ? rawGroup[0] : rawGroup; // Use first element if array
                
                if (group !== undefined && group !== null && group !== 'None') {
                    if (!groupMap.has(group)) {
                        groupMap.set(group, []);
                    }
                    groupMap.get(group)?.push(node);
                }
            });

            // Create new parent nodes and assign child nodes
            groupMap.forEach((nodesInGroup, groupName) => {
                const parentId = `group-${groupName}`;
                let color = this.commonService.session.style.widgets['polygons-color-show'] ? this.commonService.temp.style.polygonColorMap(groupName) : this.commonService.session.style.widgets['polygon-color'];
                const alphaVal = this.commonService.temp.style.polygonAlphaMap(groupName) ?? 1;  // fallback = 1
                // Add a new parent node
                const parentNode = cy.add({
                    group: 'nodes',
                    data: {
                        id: parentId,
                        label: `${groupName}`, // Use group name as label
                        isParent: true,
                        nodeColor: color|| '#000', // Default to black if not found
                        borderWidth: 1,
                        shape: 'rectangle',
                        bgOpacity: alphaVal, // Use the alpha value for background opacity
                    },
                    classes: 'parent' // Assigning the 'parent' class
                });
        
                // Assign child nodes to the new parent
                nodesInGroup.forEach(childNode => {
                    childNode.move({ parent: parentId });
                });
            });
    
            // Handle nodes without a group (optional)
            cy.nodes().forEach(node => {
                if (!node.parent().length && node.data(foci) !== 'None') {
                    node.move({ parent: null });
                }
            });

            if (  this.commonService.session.style.widgets['polygons-label-show'] == false) {
                cy.style()
                .selector('node.parent')
                .style({
                    'label': '',
                })
                .update();
            } else {
                // Refresh Cytoscape styles to apply changes
                cy.style().update();
            }

             // **Step 6:** Create and Assign the `groups` Object for polygonGroups
            const groups = Array.from(groupMap.entries()).map(([key, values]) => ({
                key,
                values: values.map(node => node.data('id'))
            }));

            // Assign the groups to polygonGroups in commonService.temp
            // TODO: Decide on one
            this.commonService.temp.polygonGroups = groups;
        });
    
    }

    /**
     * Calls setPolygonLabelSize to update polygon-label-size widget and then redraws polygon labels
     */
    onPolygonLabelSizeChange(e) {
        this.widgets['polygons-label-size'] = parseFloat(e);
        // Update the font size of parent/group node labels in Cytoscape
        if (this.cy) {
            this.cy.style()
                .selector('node.parent')
                .style({
                    'font-size': `${this.widgets['polygons-label-size']}px`
                })
                .update();
        }
    }

    /**
     * Updates polygon-label-orientation widget and then redraws polygon labels
     */
    onPolygonLabelOrientationChange(e) {
        this.widgets['polygon-label-orientation'] = e;
        // Adjust the orientation of the parent/group node labels in Cytoscape
        if (this.cy) {
          
            // Define specific types for text alignment to satisfy TypeScript
            type TextAlignment = 'left' | 'center' | 'right';
            type VerticalAlignment = 'top' | 'bottom' | 'center';

            let textValign: VerticalAlignment;
            let textHalign: TextAlignment = 'center'; // Default horizontal alignment

            // Determine vertical alignment based on the selected orientation
            switch (e.toLowerCase()) {
                case 'top':
                    textValign = 'top';
                    break;
                case 'bottom':
                    textValign = 'bottom';
                    break;
                case 'middle':
                default:
                    textValign = 'center';
                    break;
            }

            this.cy.style()
                .selector('node.parent')
                .style({
                    'text-valign': textValign,
                    'text-halign': textHalign
                })
                .update();
        }
    }

    /**
     * Updates polygons-label-show widget and the renders the network again
     */
    onPolygonLabelShowChange(e) {
        if (e) {
            this.widgets['polygons-label-show'] = true;
        }
        else {
            this.widgets['polygons-label-show'] = false;
        }

         // Update the parent/group nodes' labels in Cytoscape
    if (this.cy) {
        if (e) {
            // Show labels: Set the label to the group name
            this.cy.style()
                .selector('node.parent')
                .style({
                    'label': 'data(label)', // Assumes parent nodes have a 'label' data field
                    'text-valign': this.SelectedPolygonLabelOrientationVariable,
                    'text-halign': 'center',
                    'font-size': `${this.commonService.session.style.widgets['polygons-label-size']}px`, // Adjust as needed
                    //'text-background-color': '#ffffff',
                    //'text-background-opacity': 1,
                    //'text-background-padding': '2px',
                    // We also need to ensure that it uses data(...) for color & alpha:
                    'background-color': 'data(nodeColor)',    
                    // The critical addition (can also be 'opacity' but that will fade the label, border, etc.):
                    // @ts-ignore
                    'background-opacity': 'data(bgOpacity)',
                })
                .update();
        } else {
            // Hide labels: Remove the label by setting it to an empty string
            this.cy.style()
                .selector('node.parent')
                .style({
                    'label': '',
                    'text-background-opacity': 0
                })
                .update();
            }
        }
        
    }


    /**
     * XXXXX reevaluate if need to be combined with polygonColorsTableToggle; when called from polygonColorsTableToggle e is 'Show'/'Hide' when called
     * from template e is true/false XXXXX
     */
    onPolygonColorTableChange(e) {
        console.log('onPolygonColorTableChange: ', e);

        this.widgets["polygon-color-table-visible"] = e;

        if (e) {
            this.SelectedNetworkTableTypeVariable = 'Show';
            setTimeout(() => {
                this.updatePolygonColors();
                this.updateGroupNodeColors()
            }, 0);
         } else {
            this.SelectedNetworkTableTypeVariable = 'Hide';
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

        this.updateNodeLabels();
        
    }

    mapPreviousShapeNameToCurrent(name: string): string {
        if (this.symbolMapping.some(x => x.key === name)) {
            return name;
        }
        switch (name) {
            case 'symbolCircle':
                return 'ellipse';
            case "symbolTriangle":
            case "symbolTriangleDown":
                return 'triangle';
            case "symbolSquare":
                return 'rectangle';
            case "symbolDiamond":
            case "symbolDiamondAlt":
                return 'rhomboid';
            case "symbolDiamondSquare":
                return 'diamond';
            case "symbolOctagonAlt":
            case "symbolHexagonAlt":
                return 'heptagon';
            case "symbolPentagon":
                return 'pentagon';
            case "symbolHexagon":
                return 'hexagon';
            case "symbolCross":
                return 'barrel';
            case "symbolOctagon":
                return 'octagon';
            case "symbolStar":
                return 'star';
            case "symbolTriangleLeft":
            case "symbolTriangleRight":
                return 'tag';
            case "symbolX":
            case "symbolWye":
                return 'vee';
            default:
                return 'ellipse';
        }
    }

    onNodeShapeSort(sortBy: string) {
        if (sortBy == this.shapeSort.key) {
            this.shapeSort.assending = !this.shapeSort.assending;
        } else {
            this.shapeSort.key = sortBy;
            this.shapeSort.assending = true;
        }

        if (sortBy == 'key' && this.shapeSort.assending) {
            this.shapeAggregates.sort((a, b) => {
                let aKey : string = a.key == 'null' ? '(Empty)' : a.key.toString()
                let bKey : string = b.key == 'null' ? '(Empty)' : b.key.toString()
                return bKey.localeCompare(aKey)
            });
        } else if (sortBy == 'key') {
            this.shapeAggregates.sort((a, b) => {
                let aKey : string = a.key == 'null' ? '(Empty)' : a.key.toString()
                let bKey : string = b.key == 'null' ? '(Empty)' : b.key.toString()
                return aKey.localeCompare(bKey)
            });
        } else if (this.shapeSort.assending) {
            this.shapeAggregates.sort((a, b) => Number(b[this.shapeSort.key]) - Number(a[this.shapeSort.key]));
        } else {
            this.shapeAggregates.sort((a, b) => Number(a[this.shapeSort.key]) - Number(b[this.shapeSort.key]));
        }
    }

    /**
     * updates the value of the nodeSymbolMap and updates the nodes on the 2D network. Called from node shape table dropdown
     * @param newShape a string of node shape (see this.symbolMapping.key)
     * @param group a string of the group to change
     */
    onNodeShapeTableChange(newShape: string, group: string) {
        let i = this.shapeAggregates.findIndex(x => x.key === group);
        
        this.commonService.session.style.nodeSymbols.splice(i, 1, newShape);
        let values = this.shapeAggregates.map(x => x.key);
        this.commonService.temp.style.nodeSymbolMap = d3.scaleOrdinal(this.commonService.session.style.nodeSymbols).domain(values);
        this.updateNodeShapes();
    }

    // Method to handle shape change from the dropdown
    onNodeShapeChange(newShape: string) {
        this.selectedNodeShape = newShape;
        this.updateNodeShapes();
    }

    getNodeSize(node: any) {

        let defaultSize = this.widgets['node-radius'];
        let size = defaultSize, med = defaultSize, oldrng, min, max;
        let sizeVariable = this.widgets['node-radius-variable'];

        if (this.widgets['node-radius-variable'] == 'None') {
            return this.widgets['node-radius'];
        } else {

            let v = node[sizeVariable];

            if (!this.isNumber(v)) v = this.nodeMid;

            // Check the type of v before calling linkScale

            // Ensure v is a number before using linkScale
            if (typeof v === 'number') {
                let scaleValue = this.nodeScale(v);
                if (this.debugMode) {
                    console.log('link scale', scaleValue);
                }
                return scaleValue;
            } else {
                if (this.debugMode) {
                    console.error('v is not a number:', v);
                }
                return this.nodeScale; // Default to scalar if v is not a number
            }
        }

    }

    getNodeColor(node: any): [string, number] {
        // If this node is a parent (polygon group), keep using polygonColorMap
        if (node.isParent) {
          return this.commonService.temp.style.polygonColorMap(node.label);
        }
      
        // Otherwise, use nodeColorMap or a single color from the widget
        const variable = this.widgets['node-color-variable'];
        if (variable === 'None') {
          return [this.widgets['node-color'], 1-this.widgets['node-opacity']];
        }
        return [this.commonService.temp.style.nodeColorMap(node[variable]), this.commonService.temp.style.nodeAlphaMap(node[variable])];
      }

    getLinkWidth(link: any) {
        let scalar = this.widgets['link-width'];
        let variable = this.widgets['link-width-variable'];

        // console.log('--- TwoD getLinkWidth link1: ', scalar, variable);
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


    getLinkColor(link: any) {
        let variable = this.widgets['link-color-variable'];
        let color = this.widgets['link-color'];
        let finalColor;
        let alphaValue;

        if ((variable == 'Origin' || variable == 'origin') && link.origin.length > 1) {
            finalColor = this.commonService.temp.style.linkColorMap("Duo-Link");
            alphaValue = this.commonService.temp.style.linkAlphaMap("Duo-Link");
        } else {
            finalColor = (variable == 'None') ? color : this.commonService.temp.style.linkColorMap(link[variable]);
            alphaValue = this.commonService.temp.style.linkAlphaMap(link[variable])
        }

        if (this.overideTransparency) {
            alphaValue = this.widgets['link-opacity'];
        }

        return {
            color: finalColor,
            opacity: alphaValue
        };

    }

    /**
     * Gets the label for a node based on node label variable
     * @param node the node retrieve to get the value of the variable
     */
    getNodeLabel(node: any) {

        // If no label variable then should be none
        return (this.widgets['node-label-variable'] == 'None') ? '' : (String(node[this.widgets['node-label-variable']]) || '');

    }

    /**
     * Gets the label for a link based on link label variable
     * @param link the link we retrieve to get the value of the variable
     */
    getLinkLabel(link: any) {

        // console.log('link variable: ',this.widgets['link-label-variable'] );
        let labelVariable = this.widgets['link-label-variable'];
        // If no label variable then should be none
        if (labelVariable == 'None') {
            return { text: '' };
        } else {
            // console.log('link variable2: ',this.commonService.session.data.links[index]);

            if (labelVariable == 'source_id') {
                return link['source']['id']
            } else if (labelVariable == 'source_index') {
                return link['source']['index']
            } else if (labelVariable == 'target_id') {
                return link['target']['id']
            } else if (labelVariable == 'target_index') {
                return link['target']['index']
            } else if (labelVariable != 'distance') {
                return { text: link[labelVariable] };
            }
            if (this.debugMode) {
                console.log('cluster link: ', link);
            }
            const labelValue = link[labelVariable];
            // check if link has a distance origin and if the distance origin is included in the link.origin array, if not then the label should be 0
            if (link.distanceOrigin && !link.origin.includes(link.distanceOrigin)) {
                return { text: 0 };
            }

            if (typeof labelValue === 'number' || !isNaN(parseFloat(labelValue))) {
                // console.log('is number');
                if (this.widgets['default-distance-metric'] == 'snps') {
                    return { text: Math.round(parseFloat(labelValue)) };
                } else {
                    return (labelValue != 0) ? { text: parseFloat(labelValue).toFixed(this.widgets['link-label-decimal-length']) } : { text: '' };
                }
            } else {

                return { text: labelValue };
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
        this.updateNodeLabelSizes(); // Update label sizes without rerendering the entire network
        // document.documentElement.style.setProperty('--vis-graph-node-label-font-size', `${this.SelectedNodeLabelSizeVariable}pt`);
    }


    /**
     * Updates node-label-orientation and then redraws labels
     * @param e orientation such as Right, Left, Top, Bottom, Middle
     */
    onNodeLabelOrientationChange(e) {
        this.widgets['node-label-orientation'] = e;
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

        console.log('sumbol variable: ', this.widgets['node-symbol-variable']);
        console.log('selected node symbol variable: ', this.SelectedNodeSymbolVariable);
        this.widgets['node-symbol-variable'] = this.SelectedNodeSymbolVariable;


        if (setVisibility) {
            this.NodeSymbolTableWrapperDialogSettings.setVisibility(true);
            this.SelectedNetworkTableTypeVariable = "Show";

            if (this.SelectedNodeSymbolVariable !== 'None') {

                $('#node-symbol-row').slideUp();

                //If hidden by default, unhide to perform slide up and down
                if (!this.ShowNodeSymbolTable) {
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

        this.generateNodeSymbolSelectionTable("#node-symbol-table", e);
    }

    svgDefs = `
    <path id="blob" d="M 19.415 1.0564 C 20.585 2.47 20.225 5.89 21.665 8.2612 C 23.06 10.678 26.345 12.046 28.325 14.554 C 30.305 17.1076 31.025 20.8012 28.865 21.9412 C 26.75 23.1268 21.755 21.7588 18.605 23.3092 C 15.455 24.8596 14.105 29.3284 12.485 29.8756 C 10.865 30.3772 8.93 27.0028 6.41 25.042 C 3.89 23.1268 0.83 22.6708 0.38 20.9836 C -0.07 19.2964 2.135 16.378 2.54 13.642 C 2.945 10.9516 1.55 8.4892 2.135 7.03 C 2.72 5.5708 5.285 5.1148 7.355 4.294 C 9.47 3.4276 11.135 2.1964 13.34 1.2388 C 15.545 0.3268 18.245 -0.3116 19.415 1.0564 Z"/>
    <path id="cloud" d="M 14 -1 A 9 9 90 0 0 5 8 A 9 9 90 0 0 5.1055 9.3125 A 6 6 90 0 0 1 15 A 6 6 90 0 0 7 21 L 22 21 A 7 7 90 0 0 29 14 A 7 7 90 0 0 22.9414 7.0703 A 9 9 90 0 0 14 -1 z"/>
    <polygon id="diamond" points="0,15 15,0 30,15 15,30"/>
    <polygon id="house" points="4,18 4,30 13,30 13,24 17,24 17,30 26,30 26,18 30,18 15,0 0,18"/>
    `;

    public generateNodeSymbolSelectionTable(tableId: string, variable: string, isEditable: boolean = true) {
        this.commonService.onTableCleared(tableId);

        this.commonService.session.style.nodeSymbols =  [
            'ellipse',
            'triangle',
            'rectangle',
            'pentagon',
            'rhomboid',
            'diamond',
            'hexagon',
            'tag',
            'star',
            'vee',
            'heptagon',
            'barrel',
            'octagon',
        ];



            this.widgets['node-symbol-variable'] = variable;

            if (variable === 'None' && !isEditable) return;
            if (variable == 'None') return;

            let values = [];
            let aggregates = {};
            let nodes = this.commonService.session.data.nodes;
            let n = nodes.length;
            let vnodes = 0;

            // So aggrate to get since just one symbol
            if(variable !== 'None'){
                for (let i = 0; i < n; i++) {
                    let d = nodes[i];
                    if (!d || typeof d !== 'object') continue; // guard against null/undefined
                    if (!d.visible) continue;
                    vnodes++;
                    let dv = d[variable];
                    // Optionally, if you expect the value to be defined:
                    if (dv === undefined) {
                      console.warn(`Node at index ${i} does not have property "${variable}"`);
                      continue;
                    }
                    if (values.indexOf(dv) === -1) values.push(dv);
                    if (dv in aggregates) {
                      aggregates[dv]++;
                    } else {
                      aggregates[dv] = 1;
                    }
                  }
            }


            this.shapeAggregates = [];
            this.shapeAggregates = Object.keys(aggregates).map((key) => ({ 'key': key, 'count': aggregates[key], 'frequency': parseFloat((aggregates[key] / vnodes).toFixed(3)) }));
            this.shapeAggregates.sort((a, b) => Number(b.count) - Number(a.count));

            if (values.length > this.commonService.session.style.nodeSymbols.length) {
                let symbols = [];
                let m = Math.ceil(values.length / this.commonService.session.style.nodeSymbols.length);
                while (m-- > 0) {
                    symbols = symbols.concat(this.commonService.session.style.nodeSymbols);
                }
                this.commonService.session.style.nodeSymbols = symbols;
                console.log('node symbols: ', symbols);

            }


            values.sort((a, b) => {
                return aggregates[b] - aggregates[a];
            });


            this.commonService.temp.style.nodeSymbolMap = d3.scaleOrdinal(this.commonService.session.style.nodeSymbols).domain(values);

            this.updateNodeShapes();
        //}, 100);

    }

    public onNodeRadiusVariableChange(e) {

        this.widgets['node-radius-variable'] = e;

        if (e == 'None') {
            $('#node-max-radius-row').slideUp();
            $('#node-min-radius-row').slideUp();
            $('#node-radius-row').slideDown();
        } else {
            this.updateMinMaxNode()
            $('#node-max-radius-row').css('display', 'flex');
            $('#node-min-radius-row').css('display', 'flex');
            $('#node-radius-row').slideUp();
        }

        this.updateNodeSizes();
        

    }

    closeSettingsPane(id: string) {
        //$('#nodeShapeTableSettings').on('mouseleave', () => { console.log('abc'); 
        $(`#${id}`).delay(500).css('display', 'none')
    }

    /**
     * Updates node-radius-max widget and redraws nodes
     */
    public onNodeRadiusMaxChange(e) {
        console.log('onNodeRadiusMaxChange: ', e);
        this.widgets['node-radius-max'] = e;
        this.updateMinMaxNode();
        this.updateNodeSizes();
        
    }

    /**
     * Updates node-radius-min widget and redraws nodes
     */
    public onNodeRadiusMinChange(e) {
        this.widgets['node-radius-min'] = e;
        this.updateMinMaxNode();
        this.updateNodeSizes();
        
    }

    /**
     * Updates node-border-width widget and redraws nodes
     */
    public onNodeBorderWidthChange(e) {
        this.widgets['node-border-width'] = e;
        this.updateMinMaxNode()
        this.updateNodeBorders(); // Update border widths without rerendering the entire network
    }

    /**
     * Updates node-radius widget and redraws nodes
     */
    public onNodeRadiusChange(e) {

        this.widgets['node-radius'] = e;
        this.updateNodeSizes(); // Update node sizes without rerendering the entire network

    }

    /**
     * Rerenders whole data set by resetting data object
     */
    private async _rerender(timelineTick=false) {

        console.log('--- TwoD DATA network rerender');

        if (!timelineTick) {
            // If the network is in the middle of rendering, don't rerender
            if(this.commonService.session.network.rendering) return;

            // Set rendering to true to prevent actions during rerendering
            this.commonService.session.network.rendering = true;

            // Set rendered to false so to prevent other changes.  Needed to check to differentiate network has rendered for the first time vs checking if rendering is false
            this.store.setNetworkRendered(false);
        }

        let networkData;
        if (timelineTick) {

            if (this.data === undefined) {
                return;
            }
            let nodes = this.commonService.getVisibleNodes();
            if (nodes.length == this.data.nodes.length) { 
                return;
            }
            let links = this.commonService.getVisibleLinks();
            let visLinks = [];
            links.forEach((d) => {
                if (!d.visible) return;
                var source = nodes.find(node => node._id == d.source && node.visible);
                var target = nodes.find(node => node._id == d.target && node.visible);
        
                if (source && target) {
                    visLinks.push(d);
                }
            })
            networkData = { 
                nodes : nodes, 
                links : visLinks
            }
        } else {
            networkData = {
                nodes: this.commonService.getVisibleNodes(),
                links: this.commonService.getVisibleLinks()
            };

        }

       
        // Need to convert source and target to string ids for cytoscape
        networkData.links.forEach((link) => {
            // If link.source is an object, grab its _id and convert to string
            if (typeof link.source === 'object') {
            link.source = link.source._id.toString();
            }

            // Same for link.target
            if (typeof link.target === 'object') {
            link.target = link.target._id.toString();
            }
        });

        const nodeIds = new Set(networkData.nodes.map(n => n.id));


       // Instead of calling synchronously, await the precomputation:
       if (!this.cy) {
        const { nodes: laidOutNodes, links: laidOutLinks } =
        await this.precomputePositionsWithD3(networkData.nodes, networkData.links, 300).then(({nodes: n, links: l}) => {
            return this.precomputePositionsWithD3(n, l, 5, false);
        });

        console.log('--- TwoD networkData after precompute0: ', _.cloneDeep(networkData.links));
        
        // Update networkData with the precomputed positions
        networkData.nodes = laidOutNodes;
        networkData.links = laidOutLinks;


        networkData.links.forEach((link, i) => {
            // If link.source is an object, grab its _id and convert to string
            if (typeof link.source === 'object') {
            link.source = link.source._id.toString();
            }
        
            // Same for link.target
            if (typeof link.target === 'object') {
            link.target = link.target._id.toString();
            }
        });


        networkData.links.forEach(link => {
            if (!nodeIds.has(link.source)) {
                console.warn('Link source not found in nodes:', link.source, link);
            }
            if (!nodeIds.has(link.target)) {
                console.warn('Link target not found in nodes:', link.target, link);
            }
        });
       }


        // Update Cytoscape visualization if it exists
        if (this.cy && !timelineTick) {
        
            this._partialUpdate().then(() => this.ensurePolygon());

        } else if (this.cy && timelineTick) {
            this.data = this.commonService.convertToGraphDataArray(networkData);

            // Add new nodes and edges
            this.cy.elements().remove();
            const newElements = this.mapDataToCytoscapeElements(this.data, true);
            this.cy.add(newElements);

            // Apply the Cose layout to arrange the nodes
            // const layout = this.cy.layout({
            //     name: 'preset',
            //     fit: true, // Fit the graph within the viewport
            //     padding: 30, // Padding around the graph
                
            // });

            // layout.run();
            this.ensurePolygon(false);


        } else{
            this.data = this.commonService.convertToGraphDataArray(networkData);

            // 1) Log raw incoming data
            console.log("🚀 Debug: raw networkData links:", networkData.links);
            console.log("🚀 Debug: raw networkData nodes:", networkData.nodes);
            
            // 2) Log the “converted” data
            console.log("🚀 Debug: data from convertToGraphDataArray:", this.data);
            
            // Destroy old instance if any
            if (this.cy) {
              this.cy.destroy();
            }
            
            // 3) Build Cytoscape “elements”
            const el = this.mapDataToCytoscapeElements(this.data);
            console.log("🚀 Debug: mapDataToCytoscapeElements output:", _.cloneDeep(el));
            
            // Optional: check for duplicates & invalid references
            const seenIds = new Set();
            el.edges.forEach(edge => {
              const { id, source, target } = edge.data;
            
              // 3A) Check for duplicate edge IDs
              if (seenIds.has(id)) {
                console.warn("❌ Duplicate edge ID:", id, edge);
              } else {
                seenIds.add(id);
              }
            
              // 3B) Check for missing node references
              const hasSource = el.nodes.some(n => n.data.id === source);
              const hasTarget = el.nodes.some(n => n.data.id === target);
              if (!hasSource || !hasTarget) {
                console.warn("❌ Edge references invalid node:", edge.data);
              }
            });
            
            // 4) Actually create Cytoscape
            let startTime: number;
            console.log(this.cyContainer);
            this.cy = cytoscape({
              container: this.cyContainer.nativeElement,
              elements: el,
              style: this.getCytoscapeStyles(),
              layout: {
                name: 'preset',
                fit: true,
                padding: 100
              },
              zoomingEnabled: true,
              userZoomingEnabled: true,
              panningEnabled: true,
              userPanningEnabled: true
            });
            
            // Attach events
            this.attachCytoscapeEvents();
            
            // 5) Debug layout start & stop
            this.cy.one('layoutstart', () => {
              startTime = performance.now();
              console.log(`🟢 Cytoscape layout started at: ${startTime.toFixed(2)}ms`);
            });
            
            this.cy.one('layoutstop', () => {
              const endTime = performance.now();
              console.log(`✅ Cytoscape layout done in ${(endTime - startTime).toFixed(2)}ms`);
            
              console.log('twod 1 polygons show: ', this.widgets['polygons-show']);
              // Update polygons to show if they should be
              if (this.commonService.session.style.widgets['polygons-show']) {
                console.log('twod 2323 polygons color show: ', this.commonService.session.style.widgets['polygons-color-show']);

                this.polygonsToggle(true)
                this.centerPolygons(this.commonService.session.style.widgets['polygons-foci']);
                console.log('twod 11 polygons color show: ', this.commonService.session.style.widgets['polygons-color-show']);

                if (this.commonService.session.style.widgets['polygons-color-show']) {
                    this.commonService.session.style.widgets['polygon-color-table-visible'] = true;
                    this.onPolygonColorTableChange(true);
                    // this.polygonColorsToggle(this.widgets['polygon-color-table-visible'])
                    // this.updateGroupNodeColors();
                    console.log('twod 2polygons show: ', this.commonService.session.style.widgets['polygon-color-table-visible']);
                }
               }

              // Mark as rendered
              this.store.setNetworkRendered(true);
              this.store.setNetworkUpdated(false);
              this.commonService.session.network.rendering = false;
              this.commonService.demoNetworkRendered = true;
            });
            
            // Run the layout
            // @ts-ignore
            this.cy.layout({ name: 'preset', animate: 'end' }).run();
            

         }
            console.log('--- TwoD DATA network rerender complete');
    }

    ensurePolygon(updateLayout: boolean = true) {          
            
        if (this.commonService.session.style.widgets['polygons-show']) {

            this.polygonsToggle(true)
            this.centerPolygons(this.commonService.session.style.widgets['polygons-foci'], updateLayout);
            this.cy.nodes().forEach(node => {
                if (node.classes().includes('parent')) {
                    let numVisibleChildren = node.children().filter(child => child.visible()).length;
                    if (numVisibleChildren === 0) {
                        node.addClass('hidden'); // Hide parent nodes if needed
                    } 
                }
            });

            this.openCenter();
        }
    }

    public getNodeShape(node: any) {

        //* Shapes:
        let symbolVariable = this.widgets['node-symbol-variable'];

        if (symbolVariable == "None") {
            // console.log('node symbol: ', this.selectedNodeShape);
            return this.selectedNodeShape;
            // return this.widgets['node-symbol-variable'];
        } else {

            let type = this.commonService.temp.style.nodeSymbolMap(node[symbolVariable]);

            return type;

        }
    }

    /**
     * Updates the appropriate widget value and then updates the 'polygon-color' or 'node-shape' table
     * @param table 'polygon-color' or 'node-shape'
     * @param column 'tableCouts' or 'tableFreq' 
    */
    toggleTableColumns(table: string, column: string) {
        if (table == 'node-shape' && column == 'tableCounts') {
            this.widgets['node-symbol-table-counts'] = !this.widgets['node-symbol-table-counts'];
        } else if (table == 'node-shape' && column == 'tableFreq') {
            this.widgets['node-symbol-table-frequencies'] = !this.widgets['node-symbol-table-frequencies'];
        } else if (table == 'polygon-color' && column == 'tableCounts') {
            this.widgets['polygon-color-table-counts'] = !this.widgets['polygon-color-table-counts']
        } else if (table == 'polygon-color' && column == 'tableFreq') {
            this.widgets['polygon-color-table-frequencies'] = !this.widgets['polygon-color-table-frequencies']
        } else {
            return;
        }
        if (table == 'polygon-color') {
            this.updateCountFreqTable(table);
        }
    }

    /**
     * Toggles the setting menu for polygon-color or node-shape table. This menu allow users to show/hide counts and/or frequencies
     * @param tableName 'polygon-color' or 'node-shape'
     */
    toggleColorTableSettings(tableName: string) {
        let settingsPane;
        if (tableName == 'node-shape') {
            settingsPane = $('#nodeShapeTableSettings')
        } else if (tableName == 'polygon-color') {
            settingsPane = $('#polygonColorTableSettings')
        } else {
            return;
        }
        
        if (settingsPane.css('display') == 'none') {
            settingsPane.css('display', 'block')
        } else {
            settingsPane.css('display', 'none')
        }
    }

        /**
     * Updates the polygon-color-table based on value of widgets; it doesn't recalculate anything; just shows/hide columns (No longer need for node shape table)
     * @param tableName 'polygon-color'
     */
    updateCountFreqTable(tableName) {
        let tableReferenceName, showCount, showFreq;
        if (tableName == 'polygon-color') {
            tableReferenceName = '#polygon-color-table-wrapper';
            showCount = this.widgets['polygon-color-table-counts'];
            showFreq = this.widgets['polygon-color-table-frequencies'];
        }
        const countColumn = $(tableReferenceName + ' .tableCount');
        const freqColumn = $(tableReferenceName + ' .tableFrequency');
        console.log(showCount, showFreq, countColumn, freqColumn);
        (showCount) ? countColumn.slideDown() : countColumn.slideUp();
        (showFreq) ? freqColumn.slideDown() : freqColumn.slideUp();
    }

    /**
     * Updates node-symbol widget and redraws nodes
     */
    onNodeSymbolChange(e) {
        this.widgets['node-symbol'] = e;
        
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
        this.SelectedLinkTooltipVariable = this.widgets['link-tooltip-variable'];
    }

    /**
     * Updates link-label-variable widget and link labels
     */
    onLinkLabelVariableChange(e) {
        let label: any = e;
        this.widgets['link-label-variable'] = label;
        if (!this.cy) return;
        this.cy.edges().forEach(edge => {
            const newLabel = this.getLinkLabel(edge.data()).text;
            edge.data('label', newLabel);
        });
    }

    /**
     * Updates link-label-decimal-length widget and updates label with updated number of decimal points
     */
    onLinkDecimalVariableChange(e) {
        this.widgets['link-label-decimal-length'] = e;
        if (!this.cy) return;
        this.cy.edges().forEach(edge => {
            const newLabel = this.getLinkLabel(edge.data()).text;
            edge.data('label', newLabel);
        });
        
    }

    /**
     * Updates link-opacity widget and the opacity for all links
     */
    onLinkOpacityChange(e) {
        this.widgets['link-opacity'] = e;
        this.overideTransparency = true;
        this.updateLinkColor();
        this.overideTransparency = false;
        
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
        this.scaleLinkWidth();
        
    }

    updateMinMaxNode() {
        this.visNodes = this.commonService.getVisibleNodes();
        let n = this.visNodes.length;
        let sizeVariable = this.widgets['node-radius-variable'];
    
        this.nodeMin = Number.MAX_VALUE;
        this.nodeMax = Number.MIN_VALUE;
        for (let i = 0; i < n; i++) {
            let size = this.visNodes[i][sizeVariable];
            if (typeof size == 'undefined') continue;
            if (size < this.nodeMin) this.nodeMin = size;
            if (size > this.nodeMax) this.nodeMax = size;
        }
    
        // Normalize legacy values to fit within 0-100 range
        if (this.widgets['node-radius-max'] > 100 || this.widgets['node-radius-min'] > 100) {
            // Calculate the ratio between the current range and desired range
            const currentRange = this.widgets['node-radius-max'] - this.widgets['node-radius-min'];
            const targetRange = 100;
            const scaleFactor = targetRange / currentRange;

            // Scale the values proportionally
            this.widgets['node-radius-max'] = Math.round(this.widgets['node-radius-max'] * scaleFactor);
            this.widgets['node-radius-min'] = Math.round(this.widgets['node-radius-min'] * scaleFactor);

            // Ensure values stay within bounds
            this.widgets['node-radius-max'] = Math.min(100, this.widgets['node-radius-max']);
            this.widgets['node-radius-min'] = Math.max(0, this.widgets['node-radius-min']);
        }

        // console.log('nodeMin: ', this.nodeMin);
        // console.log('nodeMax: ', this.nodeMax);
        // console.log('noderad Max: ', this.widgets['node-radius-max']);
        // console.log('noderad Min ', this.widgets['node-radius-min']);

        let maxWidth = this.widgets['node-radius-max'];
        let minWidth = this.widgets['node-radius-min'];
    
        this.nodeMid = (this.nodeMax - this.nodeMin) / 2;
    
        this.nodeScale = d3.scaleLinear()
            .domain([this.nodeMin, this.nodeMax])
            .range([minWidth, maxWidth]);
    }

    updateMinMaxLink() {
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
            const link = this.visLinks[i];
          
            // Check if the link has a distanceOrigin and if it's not included in origin array
            let value = 0;
            if (link.distanceOrigin && link.origin.includes(link.distanceOrigin)) {
              value = link[variable];
            }
          
            // Skip if value is not a number
            if (!this.isNumber(value)) continue;
          
            // Update min and max
            if (value > this.linkMax) this.linkMax = value;
            if (value < this.linkMin) this.linkMin = value;
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
            this.scaleLinkWidth();
        }
        else {
            this.widgets['link-width-reciprocal'] = false;
            this.scaleLinkWidth();
        }
    }

    /**
     * Updates link-width widget and link width
     */
    onLinkWidthChange(e) {
        this.widgets['link-width'] = e;
        this.scaleLinkWidth();        
    }

    /**
     * Updates link-width-max widget and link width
     */
    onLinkWidthMaxChange(e) {
        this.widgets['link-width-max'] = e;
        this.updateMinMaxLink();
        this.scaleLinkWidth();

        
    }

    /**
     * Updates link-width-min widget and link width
     */
    onLinkWidthMinChange(e) {
        this.widgets['link-width-min'] = e;
        this.updateMinMaxLink();
        this.scaleLinkWidth();
        
    }

    /**
     * Updates link-length widget and link force distance
     */
    onLinkLengthChange(e) {
        // this.force.force('link').distance(e);
        // this.force.alpha(0.3).alphaTarget(0).restart();
        this.widgets['link-length'] = e;
    }

    /**
     * Updates link-directed widget. When directed, links have an arrow added; when undirected, links have no arrow
     */
    onLinkDirectedUndirectedChange(e) {
        if (e === "Show") {
            $('#link-bidirectional-row').slideDown().css('display', 'flex');
            this.widgets['link-directed'] = true;
        } else {
            this.widgets['link-directed'] = false;
            $("#link-bidirectional-row").slideUp();
        }
    
        // Update Cytoscape edge styles
        if (this.cy) {
            const isDirected = this.widgets['link-directed'];
            this.cy.style()
                .selector('edge')
                .style({
                    'target-arrow-shape': this.widgets['link-directed'] ? 'triangle' : 'none',
                    'source-arrow-shape': 'none', // Ensure source arrow is hidden when undirected
                    'curve-style': isDirected ? 'unbundled-bezier' : 'straight',
                    // Add more style properties here if needed
                })
                .update();
        }
    }


    onLinkBidirectionalChange(e) {
        // Determine the arrow shapes based on the selected option
        const sourceArrowShape = e === "Show" ? 'triangle' : 'none';
        const targetArrowShape = 'triangle'; // Assuming target arrows are always shown
    
        // Update the widget state
        this.widgets['link-bidirectional'] = (e === "Show");
    
        // Update Cytoscape edge styles
        if (this.cy) {
            const isDirected = this.widgets['link-directed'];

            this.cy.style()
                .selector('edge')
                .style({
                    'source-arrow-shape': sourceArrowShape,
                    'target-arrow-shape': targetArrowShape,
                    'curve-style': isDirected ? 'unbundled-bezier' : 'straight',
                    // Add more style properties here if needed
                })
                .update();
        }
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
     * Calculates the minimum and maximum values for the selected link-width variable.
     */
    calculateLinkWidthScale() {
        const variable = this.widgets['link-width-variable'];
        if (variable === 'None') {
            // No scaling needed
            return null;
        }

        const vlinks = this.commonService.getVisibleLinks(true).filter(link => {
            console.log("link", link);
            console.log("variable", variable);
            console.log("value", link[variable]);
            const value = link[variable];
            if (variable == 'distance' && link.distanceOrigin && !link.origin.includes(link.distanceOrigin)) {
                return false;
            }
            return this.isNumber(value) || (!this.isNumber(value) && !isNaN(Number(value)));
        });        
        
        if (vlinks.length === 0) {
            console.warn('No valid link-width data available for scaling.');
            return null;
        }

        const values = vlinks.map(link => link[variable]);
        const min = Math.min(...values);
        const max = Math.max(...values);

        return { min, max };
    }

    /**
     * Creates a linear scale based on the widget settings and data range.
     * @param value The value to scale.
     * @param dataMin Minimum value of the data.
     * @param dataMax Maximum value of the data.
     * @param minWidth Minimum width for links.
     * @param maxWidth Maximum width for links.
     * @param reciprocal Whether to invert the scale.
     * @returns The scaled width.
     */
    linearScale(value: number, dataMin: number, dataMax: number, minWidth: number, maxWidth: number, reciprocal: boolean): number {
        if (dataMax === dataMin) {
            // Avoid division by zero; return average width
            return (minWidth + maxWidth) / 2;
        }
        let scaledValue = (value - dataMin) / (dataMax - dataMin);
        if (reciprocal) {
            scaledValue = 1 - scaledValue;
        }
        return scaledValue * (maxWidth - minWidth) + minWidth;
    }

    /**
     * Take input from 2D Networks settings dialog box from template and update the widget and show/hides gridlines
     * @param e string either 'Show' or 'Hide'
     */
    onNetworkGridlinesShowHideChange(e: string): void {
        if (e === "Show") {
            this.widgets['network-gridlines-show'] = true;
        } else {
            this.widgets['network-gridlines-show'] = false;
        }
    }

    /**
     * Changes value of charge force (d3.many-body-force). Sets charge to -e meaning each node will repell every other node
     * @param {number} e value from 0-400
     */
    onNodeChargeChange(e: number) {

        // this.force.force('charge').strength(-e);
        // this.force.alpha(0.3).alphaTarget(0).restart();
        this.widgets['node-charge'] = e;
    }

    /**
     * Changes value of gravity force (d3-force-attract) which pulls nodes to the center. Sets strength e
     * @param {number} e value from 0.025-1
     */
    onNetworkGravityChange(e: number) {

        // this.force.force('gravity').strength(e);
        // this.force.alpha(0.3).alphaTarget(0).restart();
        this.widgets['network-gravity'] = e;
    }

    /**
     * Changes value of velocityDecay (d3 velocityDecay). Sets too low causing network to oscillate
     * @param {number} e value from 0-1 (default 0.4)
     */
    onNetworkFrictionChange(e) {

        // this.force.velocityDecay(e);
        // this.force.alpha(0.3).alphaTarget(0).restart();
        this.widgets['network-friction'] = e;
    }

    /**
     * Changes value of network-link-strength (d3.forceLink) which pulls the pair of nodes together
     * @param {number} e value from 0-1 (default 0.4)
     */
    onNetworkLinkStrengthVariableChange(e) {

        //console.log('st change: ', e);
        let v = parseFloat(e);
        // this.force.force('link').strength(v);
        // this.force.alpha(0.3).alphaTarget(0).restart();
        this.widgets['network-link-strength'] = e;
    }

    /**
     * Updates the color of nodes and transparency based on node-color-variable, the value from nodeColorMap and nodeAlphaMap, and whether the node is selected
     */
    updateNodeColors() {

        if(!this.cy) return;


        let variable = this.widgets['node-color-variable'];
        let color = this.widgets['node-color']

        let stroke = this.widgets['selected-node-stroke-color'];
        let stroke_width = parseInt(this.widgets['selected-node-stroke-width']);

        if (variable == 'None') {

            this.data.nodes.forEach(x => {

                x.color = color;

            })

        } else {

            this.data.nodes.forEach((x, index) => {

                x.color = this.commonService.temp.style.nodeColorMap(this.commonService.session.data.nodes[index][variable]);

            })
        }

        this.cy.nodes().forEach(node => {
            const [newColor, opacity] = this.getNodeColor(node.data());
            node.data('nodeColor', newColor);
            node.data('bgOpacity', opacity);
            node.data('borderColor', newColor);
        });
        this.cy.style().update(); // Refresh Cytoscape styles to apply changes


    };


    /**
     * Updates the width of the links using link-width, link-width-variable, link-width-max, link-width-min, and link-width-reciprocal
     */
    /**
 * Scales link widths based on the selected variable and updates Cytoscape styles.
 */
scaleLinkWidth() {
    const variable = this.widgets['link-width-variable'];
    if (!this.cy) return;
    if (variable === 'None') {
        // Apply a default width to all links
        this.cy.style().selector('edge').style({
            'width': this.widgets['link-width']
        }).update();
        return;
    }

    const scaleValues = this.calculateLinkWidthScale();
    if (!scaleValues) {
        // If scaling isn't applicable, set a default width
        this.cy.style().selector('edge').style({
            'width': this.widgets['link-width']
        }).update();
        return;
    }

    const { min, max } = scaleValues;

    //     let vlinks = this.getVLinks();
    //     if (variable == 'None') return  scalar;
    //     let n = vlinks.length;
    const maxWidth = this.widgets['link-width-max'];
    const minWidth = this.widgets['link-width-min'];
    const reciprocal = this.widgets['link-width-reciprocal'];

    // Iterate over each edge and set the scaled width
    this.cy.edges().forEach(edge => {
        let dataValue = edge.data(variable) as unknown as number;
        if (variable == 'distance' && edge.data('distanceOrigin') && !edge.data('origin').includes(edge.data('distanceOrigin'))) {
            dataValue = 0;
        }
        if (this.isNumber(dataValue)) {
            const scaledWidth = this.linearScale(dataValue, min, max, minWidth, maxWidth, reciprocal);
            edge.data('scaledWidth', scaledWidth);
        } else {
            // Handle non-numeric values if necessary
            edge.data('scaledWidth', minWidth);
        }
    });

    // Update Cytoscape stylesheet to use the scaledWidth data
    this.cy.style().selector('edge').style({
        'width': 'data(scaledWidth)'
    }).update();
}
    /**
     * centers the view
     */
    fit() {
        if (this.cy) this.cy.fit(this.cy.nodes(), 30);
    };

    /**
     * XXXXX Function is never called; Review if necessary XXXXX
     * @param nodeData 
     * @returns 
     */
    isFiltered(nodeData: any): boolean {
        if (nodeData) {
            return this.commonService.session.data.nodeFilteredValues.find(x => x.index === nodeData.index) !== undefined;
        }
        return true
    }

    /**
     * On click of settings button, show/hide settings dialog
     */
    openSettings() {
        (this.Node2DNetworkExportDialogSettings.isVisible) ? this.Node2DNetworkExportDialogSettings.setVisibility(false) : this.Node2DNetworkExportDialogSettings.setVisibility(true);
        this.ShowStatistics = !this.Show2DSettingsPane;
        this.updateLinkWidthRows(this.SelectedLinkWidthByVariable);
    }

    /**
     * Updates ShowStatistics variables to opposite of current value
     * 
     * XXXXX Not currently executed; reevaluate if this function is needed XXXXX
     */
    enableSettings() {
        this.ShowStatistics = !this.ShowStatistics;
        this.cdref.detectChanges();
    }

    /**
     * On click of export button, show export dialog
     */
    openExport() {
        this.isExportClosed = false;
        this.Show2DExportPane = true;
        this.updateCalculatedResolution();
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

    /**
     * XXXXX empty function; may be added later XXXXX
     */
    onRecallSession() {
        //this.loadSettings();
    }

    openRefreshScreen() {
        this.loadSettings();
        setTimeout(this.fit, 2000);
    }

    /**
     * renders the network
     */
    updateVisualization() {
        console.log('updateVisualization');
        this._rerender();
        
        if (this.SelectedNodeLabelVariable != 'None') { this.updateNodeLabels(); }
    }

    /**
 * Synchronizes current Cytoscape instance with new data (adds/removes/updates
 * nodes and links) instead of completely rerendering.
 */
private async _partialUpdate() {
    console.log('--- TwoD _partialUpdate called');
    if (!this.cy) {
      console.error('Cytoscape instance not initialized; cannot update partially.');
      return;
    }

    // Cache positions BEFORE making changes to the graph
    if (!this.nodePositions) {
        this.nodePositions = new Map<string, { x: number; y: number }>();
    }
    this.cy.nodes().forEach(node => {
        const currentPosition = node.position();
        if (!this.nodePositions.has(node.id())) {
            this.nodePositions.set(node.id(), currentPosition); // Cache position
        }
    });

    // Retrieve fresh node/link data
    const networkData = {
        nodes: this.commonService.getVisibleNodes(),
        links: this.commonService.getVisibleLinks()
    };

    const { nodes: laidOutNodes, links: laidOutLinks } = await this.precomputePositionsWithD3(networkData.nodes, networkData.links, 30, false);
    networkData.nodes = laidOutNodes;
    networkData.links = laidOutLinks;

    // Use batch mode to disable auto-panning during updates
    this.cy.batch(() => {

        networkData.nodes.forEach(node => {
            node.id = node._id.toString();
        });
        networkData.links.forEach((link, i) => {
            // Set a unique link id if desired
            //link.id =  i.toString();  // or link.index.toString()
            // If link.source is an object, grab its _id and convert to string
            if (typeof link.source === 'object') {
                link.source = link.source._id.toString();
            }

            // Same for link.target
            if (typeof link.target === 'object') {
            link.target = link.target._id.toString();
            }
        });

        const nodeIds = new Set(networkData.nodes.map(n => n.id));

        networkData.links.forEach(link => {
        if (!nodeIds.has(link.source)) {
            console.warn('Link source not found in nodes:', link.source, link);
        }
        if (!nodeIds.has(link.target)) {
            console.warn('Link target not found in nodes:', link.target, link);
        }
        });

        console.log('--- TwoDComponent _partialUpdate called:  ', networkData.links);

        this.data = this.commonService.convertToGraphDataArray(networkData);
        const newElements = this.mapDataToCytoscapeElements(this.data);

        // Collect new IDs for membership checks
        const newNodeIds = new Set(newElements.nodes.map(n => n.data.id));
        // @ts-ignore
        const newLinkIds = new Set(newElements.edges.map(l => l.data.id));

        // Update node visibility and restore positions
        this.cy.nodes().forEach(node => {
            if (!newNodeIds.has(node.id()) && !node.hasClass('parent')) {
                // Hide node but keep its cached position
                node.addClass('hidden');
            } else {
                // Ensure node is visible
                node.removeClass('hidden');

                // Restore position from cache
                const newNode = newElements.nodes.find(n => n.data.id === node.id());
                if (newNode) {
                    node.data({ ...node.data(), ...newNode.data, });
                    node.position({x: newNode.data.x, y: newNode.data.y}); // Restore position
                }
            }
        });

        // Remove old edges
        this.cy.edges().forEach(edge => {
            if (!newLinkIds.has(edge.id())) {
                this.cy.remove(edge);
            }
        });

        const linkMap = new Map(networkData.links.map(l => [l.id, l]));


        // Add/Update new edges
        newElements.edges.forEach(e => {
            const cyEdge = this.cy.getElementById(e.data.id);
            if (!cyEdge || !cyEdge.length) {
                this.cy.add(e); // Add edge
            } else {
                cyEdge.data({ ...cyEdge.data(), ...e.data }); // Update edge data
            }

            // Ensure label is updated based on filtered link data
            const data = linkMap.get(cyEdge.id());
            const labelVal = this.getLinkLabel(data).text;
            cyEdge.data('label', labelVal ?? "");

        });

        console.log('----DUo Edge2: ', newElements.edges.filter(edge => (edge.data.source === 'MZ745515' && edge.data.target === 'MZ712879') || (edge.data.source === 'MZ712879' && edge.data.target === 'MZ745515')));

        // console.log('----newedges: ', _.cloneDeep(newElements.edges));

    });


        // Restore positions for all visible nodes explicitly
        // this.cy.nodes(':visible').forEach(node => {
        //     const position = this.nodePositions.get(node.id());
        //     if (position) {
        //         node.position({x: position.x, y: position.y });
        //     }
        // });

        this.fit();

           // Set rendered to true now that network has rendered
           this.store.setNetworkRendered(true); 
           // Now we can set network update to false after its been updated fully
           this.store.setNetworkUpdated(false); 
           this.commonService.session.network.rendering = false;

}

    applyStyleFileSettings() {
        this.widgets = this.commonService.session.style.widgets;
        this.loadSettings();
        this._partialUpdate(); 
    }

    ngOnDestroy(): void {

        console.log("calling destroy");
        this.destroy$.next();
        this.destroy$.complete();

        this.styleFileSub.unsubscribe();

        this.settingsLoadedSubscription.unsubscribe();

        if (this.cy){
            this.cy.removeAllListeners();
            this.cy.destroy();
        }
        this.cyContainer = null;


    }

    /**
     * renders the network
     */
    onLoadNewData() {
        if (this.debugMode) {
            console.log('render new data');
        }

        console.log('onLoadNewData');
        // this.debouncedRerender();
    }

    /**
     * renders the network; sets this.showStatistics to false
     */
    onFilterDataChange() {
        if (this.debugMode) {
            console.log('render filter change');
        }

        console.log('onFilterDataChange');
        // render doesn't do anything unless this.isLoading == true; so need to ensure that before call render
        this.debouncedRerender();
    }

    /**
     * Sets twoD component variable based on the value in the appropriate widget and then calls appropriate function to update the view
     * 
     * XXXXX this function should probably be reevaluated/refacted as well because sections of code are being evaluated multiple times 
     * (ie. onPolygonLabelVariableChange, onPolygonLabelVariableChange, onPolygonLabelOrientationChange all call redrawPolygonLabels) XXXXX
     */
    loadSettings() {

        //Polygons|Label Size
        this.SelectedPolygonLabelSizeVariable = this.widgets['polygons-label-size'];
        this.onPolygonLabelSizeChange(this.SelectedPolygonLabelSizeVariable);

        //Node|Orientation
        this.SelectedPolygonLabelOrientationVariable = this.widgets['polygon-label-orientation'];
        this.onPolygonLabelOrientationChange(this.SelectedPolygonLabelOrientationVariable);

        this.polygonsToggle(this.widgets['polygons-show']);
        if (this.commonService.session.style.widgets['polygons-show']) {
            this.updatePolygonColors();
            this.polygonColorsToggle(this.commonService.session.style.widgets['polygon-color-table-visible'])
            this.updateGroupNodeColors();
        }

        //Nodes|Label
        this.SelectedNodeLabelVariable = this.widgets['node-label-variable'];
        console.log('----TWOD SelectedNodeLabelVariable: ', this.SelectedNodeLabelVariable);
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
        this.widgets['node-symbol'] = this.mapPreviousShapeNameToCurrent(this.widgets['node-symbol']);
        this.SelectedNodeShapeVariable = this.widgets['node-symbol'];
        this.onNodeSymbolChange(this.SelectedNodeShapeVariable);

        //Nodes|Size By
        this.SelectedNodeRadiusVariable = this.widgets['node-radius-variable'];
        this.onNodeRadiusVariableChange(this.SelectedNodeRadiusVariable);

        //Nodes|Size
        if (Number(this.widgets['node-radius']) > 100 || Number(this.widgets['node-radius']) < 0) {
            this.widgets['node-radius'] = 20;
        }
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

        //Network|Link Strength
        this.SelecetedNetworkLinkStrengthVariable = this.widgets['network-link-strength'];
        this.onNetworkFrictionChange(this.SelecetedNetworkLinkStrengthVariable);

        // Ensure proper orientation is set
        if (this.widgets['polygon-label-orientation'] !== 'top' || this.widgets['polygon-label-orientation'] !== 'bottom' || this.widgets['polygon-label-orientation'] !== 'middle') {
            this.widgets['polygon-label-orientation'] = 'top';
        }

        //Network|Polygon Orientation
        this.SelectedPolygonLabelOrientationVariable = this.widgets['polygon-label-orientation'];
        this.onPolygonLabelOrientationChange(this.SelectedPolygonLabelOrientationVariable);
    }

    /**
     * Updates the sizes of all nodes based on the current widget settings.
     */
    updateLinkColor() {
        console.log('----TWOD updateLinkColor called');
        if (!this.cy) return;
        this.cy.edges().forEach(link => {
            const { color, opacity } = this.getLinkColor(link.data());
            link.data('lineColor', color);
            link.data('lineOpacity', opacity); // Ensure transparency is explicitly set
          });
        // this.cy.style().update(); // Refresh Cytoscape styles to apply changes
    }

    /**
     * Updates the sizes of all nodes based on the current widget settings.
     */
    updateNodeSizes() {
        if (!this.cy) return;
        this.cy.nodes().forEach(node => {
            const newSize = Number(this.getNodeSize(node.data()));
            node.data('nodeSize', newSize);
        });
        this.cy.style().update(); // Refresh Cytoscape styles to apply changes
    }

     /**
     * Updates the border widths of all nodes based on the current widget settings.
     */
     updateNodeBorders() {
        if (!this.cy) return;
        this.cy.nodes().forEach(node => {
            const newBorderWidth = this.getNodeBorderWidth(node.data());
            node.data('borderWidth', newBorderWidth);
        });
        this.cy.style().update(); // Refresh Cytoscape styles to apply changes
    }

    /**
     * Updates the labels of all nodes based on the current widget settings.
     */
    updateNodeLabels() {
        console.log('----TWOD updateNodeLabels called');
        if (!this.cy) return;
        this.cy.nodes().forEach(node => {
            if (node.children().length > 0) return; // Skip parent nodes
                const newLabel = this.getNodeLabel(node.data());
                node.data('label', newLabel);
        });

        console.log('--- TwoDComponent updateNodeLabels ended ');

        this.cy.style().update(); // Refresh Cytoscape styles to apply changes
    }


    /**
     * Updates the labels of all nodes based on the current widget settings.
     */
    updateLinkWidths() {
        this.cy.edges().forEach(edge => {
            const newWidth = this.getLinkWidth(edge.data());
            edge.data('width', newWidth);
        });
        // this.cy.style().update(); // Refresh Cytoscape styles to apply changes
    }


    /**
     * Updates the font sizes of all node labels based on the current widget settings.
     */
    updateNodeLabelSizes() {
        if (!this.cy) return;
        this.cy.nodes().forEach(node => {
            const newFontSize = this.getNodeFontSize(node.data());
            node.data('fontSize', newFontSize);
        });
        this.cy.style().update(); // Refresh Cytoscape styles to apply changes
    }

    updateNodeShapes() {
        if (!this.cy) return;
        this.cy.nodes().forEach(node => {
            const newShape = this.getNodeShape(node.data());
            node.data('shape', newShape);
        });
        this.cy.style().update(); // Refresh Cytoscape styles to apply changes
    }



    /**
     * Handles changes to the node label widget.
     * @param e New label value from the widget.
     */
    onNodeLabelChange(e: string) {
        this.widgets['node-label'] = e;
        this.updateNodeLabels(); // Update labels without rerendering the entire network
    }

    /**
     * Handles changes to the node color widget.
     * @param e New color value from the widget.
     */
    onNodeColorChange(e: string) {
        console.log('node color changeddd');
        this.widgets['node-color'] = e;
        this.updateNodeColors(); // Update node colors without rerendering the entire network
    }

    /**
     * Retrieves the border width for a node based on current widget settings.
     * @param node The node data object.
     * @returns The border width.
     */
    getNodeBorderWidth(node: any): number {
        return this.widgets['node-border-width'] || 2; // Default to 2 if not set
    }


    /**
     * Retrieves the font size for a node label based on current widget settings.
     * @param node The node data object.
     * @returns The font size in pixels.
     */
    getNodeFontSize(node: any): number {
        return this.widgets['node-label-size'] || 12; // Default to 12px if not set
    }

}

export namespace TwoDComponent {
    export const componentTypeName = '2D Network';
}