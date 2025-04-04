import { Injectable, OnInit, Output, EventEmitter, Injector, Directive } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import * as d3 from 'd3';
import * as patristic from 'patristic';
import * as Papa from 'papaparse';
import * as _ from 'lodash';
import moment from 'moment';
import { WorkerModule } from '../workers/workModule';
import { LocalStorageService } from '@shared/utils/local-storage.service';
import AuspiceHandler from '@app/helperClasses/auspiceHandler';
import { AppComponentBase } from '@shared/common/app-component-base';
import { StashObjects, StashObject } from '../helperClasses/interfaces';
import { MicrobeTraceNextVisuals } from '../microbe-trace-next-plugin-visuals';
import { HttpClient } from '@angular/common/http';
import { GraphData } from '@app/visualizationComponents/TwoDComponent/data';
import { CommonStoreService } from './common-store.services';
import { REFERENCE, HBX2, WATERMARK } from '@app/constants/longStrings.constants';
import { ColorMappingService } from './color-mapping.service';
import { WorkerComputeService } from './worker-compute.service';

@Directive()
@Injectable({
    providedIn: 'root',
})
export class CommonService extends AppComponentBase implements OnInit {

    @Output() LoadViewEvent = new EventEmitter();

    decoder: any = new TextDecoder('utf-8');
    r01: any = Math.random;

    thresholdHistogram: any;

    computer: WorkerModule;

    activeTab: string = 'Files';

    // Set this to true to enable the debug mode/console logs to appear
    public debugMode: boolean = false;

    private linkElementSource = new BehaviorSubject<HTMLElement | null>(null);
    private nodeElementSource = new BehaviorSubject<HTMLElement | null>(null);

    currentLinkTableElement = this.linkElementSource.asObservable();

    currentNodeTableElement = this.nodeElementSource.asObservable();


    setLinkTableElement(element: HTMLElement | null) {
        this.linkElementSource.next(element);
    }

    setNodeTableElement(element: HTMLElement | null) {
        this.nodeElementSource.next(element);
    }


    // Using lodash's debounce, for example
    public _debouncedUpdateNetworkVisuals = _.debounce(() => {
        this.updateNetworkVisuals();
    }, 300);

    GlobalSettingsModel: any = {
        SelectedColorNodesByVariable: 'None',
        SelectedColorLinksByVariable: 'None',
        SelectedNodeColorVariable: 'None',
        SelectedLinkColorVariable: '#a6cee3',
        SelectedPruneWityTypesVariable: 'None',
        SelectedStatisticsTypesVariable: 'Hide',
        SelectedClusterMinimumSizeVariable: 0,
        SelectedLinkSortVariable: 'Distance',
        SelectedLinkThresholdVariable: 0.015,
        SelectedDistanceMetricVariable: 'tn93',
        SelectedLinkColorTableTypesVariable: 'Hide',
        SelectedNodeColorTableTypesVariable: 'Hide',

        SelectedColorVariable: '#ff8300',
        SelectedBackgroundColorVariable: '#ffffff',
        SelectedApplyStyleVariable: '',
        SelectedRevealTypesVariable: 'Everything'
    };

    // check for not interfering with networks outside of inital demo
    demoNetworkRendered: boolean = false;

    /**
     * Returns an object that will eventually be filled with data. It is accessed throught commonService.session.data
     * It will store a list of nodes, links, and clusters as well as fields that can be used for each
     */
    dataSkeleton = () => {
        return {
            nodes: [],
            links: [],
            unoNodes: [],
            unoLinks: [],
            clusters: [],
            nodeFields: [
                'index',
                '_id',
                'selected',
                'cluster',
                'visible',
                'degree',
                'origin'
            ],
            nodeExclusions: [],
            linkFields: [
                'index',
                'source',
                'target',
                'distance',
                'visible',
                'cluster',
                'origin',
                'nn',
                'directed'
            ],
            clusterFields: [
                'id',
                'nodes',
                'links',
                'sum_distances',
                'links_per_node',
                'mean_genetic_distance',
                'visible'
            ],
            nodeFilter: {},
            linkFilter: {},
            clusterFilter: {},
            nodeFilteredValues: [],
            linkFilteredValues: [],
            clusterFilteredValues: [],
            nodeTableColumns: [],
            linkTableColumns: [],
            clusterTableColumns: [],
            tree: {},
            newickString: '',
            reference: REFERENCE
        };

    };

    watermark: any = WATERMARK;
    HXB2: any = HBX2
    /**
     * @returns an object that stores the common widgets/settings used throughout MicrobeTrace
     */
    defaultWidgets = () => {
        return {
            '3DNet-link-tooltip-variable': 'None',
            '3DNet-link-transparency': 0,
            '3DNet-link-width': 1.6,
            '3DNet-node-tooltip-variable': '_id',
            '3DNet-node-radius': 4,
            '3DNet-node-radius-variable': 'None',
            'align-sw': false,
            'align-none': true,
            'alignView-charSetting': 'hide',
            'alignView-colorSchemeName': 'n',
            'alignView-customColorScheme': {
                'A': '#ccff00',
                'C': '#ffff00',
                'G': '#ff9900',
                'T': '#ff6600',
                'ambig': '#ffffff',
            },
            'alignView-labelField': '_id',
            'alignView-rulerMinorInterval': 50,
            'alignView-selectedSize': 's',
            'alignView-showMiniMap': true,
            'alignView-sortField': 'index',
            'alignView-spanWidth': 10,
            'alignView-spanHeight': 16,
            'alignView-topDisplay': 'barplot',
            'ambiguity-resolution-strategy': 'AVERAGE',
            'ambiguity-threshold': 0.015,
            'background-color': '#ffffff',
            'background-color-contrast': '#000000',
            'bubble-x': 'cluster',
            'bubble-y': 'None',
            'bubble-charge': 0.05,
            'bubble-size': 20,
            'bubble-collapsed': false,
            'choropleth-aggregate-as': 'states',
            'choropleth-aggregate-on': 'None',
            'choropleth-basemap-show': false,
            'choropleth-color-high': '#800026',
            'choropleth-color-low': '#ffffcc',
            'choropleth-color-medium': '#fd8d3c',
            'choropleth-satellite-show': false,
            'choropleth-transparency': 0.3,
            'cluster-minimum-size': 1,
            'default-view': '2D Network', // 'Phylogenetic Tree' 'Alignment View'
            'default-distance-metric': 'tn93',
            'filtering-epsilon': -8,
            'flow-showNodes': 'selected',
            'gantt-date-list': '',
            'globe-countries-show': false,
            'globe-field-lat': 'None',
            'globe-field-lon': 'None',
            'globe-field-tract': 'None',
            'globe-field-zipcode': 'None',
            'globe-field-county': 'None',
            'globe-field-state': 'None',
            'globe-field-country': 'None',
            'globe-link-show': true,
            'globe-link-transparency': 0,
            'globe-node-jitter': -2,
            'globe-node-show': true,
            'globe-node-transparency': 0,
            'globe-stars-show': true,
            'heatmap-invertX': false,
            'heatmap-invertY': false,
            'heatmap-color-high': '#a50026',
            'heatmap-color-medium': '#ffffbf',
            'heatmap-color-low': '#313695',
            'heatmap-axislabels-show': false,
            'histogram-axis-x': true,
            'histogram-scale-log': false,
            'histogram-variable': 'links-distance',
            'infer-directionality-false': true,
            'link-color': '#a6cee3',
            'link-color-table-counts': true,
            'link-color-table-frequencies': false,
            'link-color-variable': 'None',
            'link-directed': false,
            'link-bidirectional': false,
            'link-label-variable': 'None',
            'link-label-decimal-length' : 3,
            'link-length': 0.125,
            'link-opacity': 0,
            'link-show-nn': false,
            'link-sort-variable': 'distance',
            'link-threshold': 0.015,
            'link-tooltip-variable': ['None'],
            'link-width': 3,
            "link-width-max":27,
            "link-width-min":3,
            'link-width-variable': 'None',
            'link-width-reciprocal': false,
            'link-origin-array-order': [],
            'map-basemap-show': true,
            'map-collapsing-on': true,
            'map-counties-show': false,
            'map-countries-show': true,
            'map-field-lat': 'None',
            'map-field-lon': 'None',
            'map-field-tract': 'None',
            'map-field-zipcode': 'None',
            'map-field-county': 'None',
            'map-field-state': 'None',
            'map-field-country': 'None',
            'map-link-show': true,
            'map-link-tooltip-variable': 'None',
            'map-link-transparency': 0,
            'map-node-jitter': -2,
            'map-node-show': true,
            'map-node-tooltip-variable': '_id',
            'map-node-transparency': 0,
            'map-satellite-show': false,
            'map-states-show': true,
            "mst-computed": false,
            'network-friction': 0.4,
            'network-gravity': 0.05,
            'network-link-strength': 0.124,
            'node-charge': 200,
            'node-border-width' : 2.0,
            'node-color': '#1f77b4',
            'node-color-table-counts': true,
            'node-color-table-frequencies': false,
            'node-color-variable': 'None',
            'node-highlight': false,
            'node-label-size': 16,
            'node-label-variable': 'None',
            'node-label-orientation': 'Right',
            'node-opacity' : 0,
            'node-radius': 20,
            'node-radius-variable': 'None',
            "node-radius-min": 20,
            "node-radius-max": 60,
            'node-symbol': 'ellipse',
            'node-symbol-table-counts': true,
            'node-symbol-table-frequencies': false,
            'node-symbol-variable': 'None',
            'node-symbol-table-visible': 'Hide',
            'node-timeline-variable' : 'None',
            'node-tooltip-variable': ['_id'],
            'physics-tree-branch-type': 'Straight',
            'physics-tree-charge': 30,
            'physics-tree-friction': 0.05,
            'physics-tree-gravity': 0.05,
            'physics-tree-lateral-strength': 0.025,
            'physics-tree-layout': 'Horizontal',
            'physics-tree-node-label-variable': 'None',
            'physics-tree-tooltip': 'id',
            'physics-tree-type': 'tree',
            'polygon-color': '#bbccee',
            'polygon-color-table-name-sort': 'DESC',
            'polygon-color-table-counts-sort': 'DESC',
            'polygon-color-table-counts': true,
            'polygon-color-table-frequencies': false,
            'polygons-color-show': false,
            'polygons-foci': 'cluster',
            'polygons-gather-force': 0,
            'polygons-label-show' : false,
            'polygon-label-orientation' : 'top',
            'polygons-label-size' : 16,
            'polygons-show' : false,
            'polygon-color-table-visible': false,
            'reference-source-file': true,
            'reference-source-first': false,
            'reference-source-consensus': false,
            'scatterplot-xVar': 'index',
            'scatterplot-yVar': 'distance',
            'scatterplot-logScale': false,
            'scatterplot-showNodes': false,
            'search-field': '_id',
            'selected-color': '#ff8300',
            'selected-color-contrast': '#000000',
            'selected-node-stroke-color': '#ff8300',
            'selected-node-stroke-width': '4px',
            'timeline-date-field': 'None',
            'timeline-noncumulative': true,
            'tree-animation-on': true,
            'tree-branch-distances-hide': true,
            'tree-branch-distance-size': 12,
            'tree-branch-nodes-show': false,
            'tree-horizontal-stretch': 1,
            'tree-layout-vertical': false,
            'tree-layout-horizontal': true,
            'tree-layout-circular': false,
            'tree-labels-align': false,
            'tree-labels-show': false,
            'tree-leaf-label-show': false,
            'tree-leaf-label-size': 12,
            'tree-leaf-node-radius-variable': 'None',
            'tree-leaf-node-show': true,
            'tree-leaf-node-size': 9,
            'tree-mode-square': true,
            'tree-mode-smooth': false,
            'tree-mode-straight': false,
            'tree-round-true': false,
            'tree-ruler-show': true,
            'tree-tooltip-show': true,
            'tree-type': 'weighted',
            'tree-vertical-stretch': 1,
            'triangulate-false': true,
            'twoD-settings-visible': 'Hide'
        };
    }

    /**
     * @returns a session object. It has the data object, information on goldenLayout layout, widgets, as well as other settings
     */   
    sessionSkeleton = () => {
        return {
            data: this.dataSkeleton(),
            files: [],
            layout: {
                content: [
                    {
                        type: 'files'
                    }
                ],
                type: 'stack'
            },
            messages: [],
            tabLoaded: false,
            meta: {
                loadTime: 0,
                readyTime: Date.now(),
                startTime: 0,
                anySequences: false
            },
            network: {
                allPinned: false,
                timelinePinned : false,
                nodes: [],
                timelineNodes: [],
                initialLoad: false,
                launched : false,
                isFullyLoaded: false,
                rendered: false,
                rendering: false,
                settingsLoaded: false,
            },
            state: {
                timeStart: 0,
                timeEnd: new Date(),
                timeTarget: null
            },
            style: {
                linkAlphas: [1],
                linkColors: d3.schemePaired,
                linkValueNames: {},
                nodeAlphas: [1],
                nodeColors: [d3.schemeCategory10[0]].concat(d3.schemeCategory10.slice(2)),
                nodeColorsTable: {},
                nodeColorsTableHistory: {
                    'null' : '#EAE553'
                },
                nodeColorsTableKeys: {},
                linkColorsTable: {},
                linkColorsTableKeys: {},
                nodeSymbols: [
                    'ellipse',
                    'triangle',
                    'rectangle',
                    'barrel',
                    'rhomboid',
                    'diamond',
                    'pentagon',
                    'hexagon',
                    'heptagon',
                    'octagon',
                    'star',
                    'tag',
                    'vee'
                ],
                nodeSymbolsTable: {},
                nodeSymbolsTableKeys: {},
                nodeValueNames: {},
                polygonAlphas: [0.5],
                polygonColors: ['#bbccee','#cceeff','#ccddaa','#eeeebb','#ffcccc','#dddddd'],
                polygonValueNames: {},
                overwrite: {},
                widgets: this.defaultWidgets()
            },
            timeline: 0 as any,
            warnings: []
        };
    }
    /**
     * 
     * @returns object found at commonService.temp  which include a matrix for links between nodes and color/alpha mapping functions
     */
    tempSkeleton = () => {
        return {
            componentCache: {},
            mapData: {},
            matrix: {},
            messageTimeout: null,
            /* functions in style object get replaced If user decides to color a node, link, or polygon variable.
             * these functions are replaced with one from the d3 package usind d3.scaleOrdinal(...).domain(...)
             */
            style: {
                linkAlphaMap: () => 1 - this.session.style.widgets['link-opacity'],
                linkColorMap: () => this.session.style.widgets['link-color'],
                nodeAlphaMap: () => 1,
                nodeColorMap: () => this.session.style.widgets['node-color'],
                nodeSymbolMap: () => this.session.style.widgets['node-symbol'],
                polygonAlphaMap: () => 0.5,
                polygonColorMap: () => this.session.style.widgets['polygon-color']
            },
            trees: {}
        };
    }
    temp: any = this.tempSkeleton();
    session = this.sessionSkeleton();


    /**
     * @param injector 
     * @param localStorageService 
     * @param visuals - this injection allows users to access all the views from commonService (ie. commonService.visuals.twoD)
     * @param http 
     */
    constructor(injector: Injector,
        public localStorageService: LocalStorageService,
        public visuals: MicrobeTraceNextVisuals,
        private http: HttpClient,
        private store: CommonStoreService,
        private colorMappingService: ColorMappingService,
        private workerComputeService: WorkerComputeService
        // private srv: GoldenLayoutService
    ) {

        super(injector);

        //debugger;

         // (window as any).context = ((window as any).context == undefined ? {} : (window as any).context);
         this.computer = new WorkerModule();
         this.resetData();
                console.log('Constructor: Temp initialized:', this.temp);

        // this.initialize();
    }

    ngOnInit() {
        this.initialize();
    }


    /**
     * Sets (window as any).context.commonSerive = this; and also calls reset() which sets commonService.temp and commonService.session back to default values (except 
     * temp.mapData, session.files, session.meta)
     */
    initialize() {
       
        this.reset();
    }

    /**
     * Capitalizes the first letter of a string
     * @param s - Expects a string
     * @returns - the string with first letter capitalized. If typeof s != string returns empty string
     */
    capitalize(s) {
        if (typeof s !== 'string') return ''
        return s.charAt(0).toUpperCase() + s.slice(1)
    }


    /**
     * Set commonService.session and commonService.temp back to default values
     */
    clearData() {
        this.session = this.sessionSkeleton();

        this.temp = this.tempSkeleton();
    }

    /**
     * Update Legacy Node Symbols if loading new files
     */
    updateLegacyNodeSymbols() {
        this.session.style.nodeSymbols = [
            'ellipse',
            'square',
            'triangle',
            'hexagon',
            'diamond',
            'barrel',
            'pentagon',
            'octagon',
            'star',
            'tag',
            'vee'
        ]
    }


    /**
     * @returns a default node object
     */
    defaultNode(): any {

        return {
            index: this.session.data.nodes.length,
            _id: '',
            selected: false,
            cluster: 1,
            visible: true,
            degree: 0,
            data: {},
            origin: [],
            hasDistance: false
        }
    }

    public cleanupData(): void {
    
        this.session.data = this.sessionSkeleton().data;
        this.temp = this.tempSkeleton();
    
        // Clear node and link storage if they are no longer needed
        this.session.data.nodes = [];
        this.session.data.links = [];
        this.temp.matrix = {}; 
    
        // Reset visualization states
        this.session.network.isFullyLoaded = false;
    }

    // public cleanupWorkers(): void {
    //     console.log("Terminating Web Workers...");
    //     if (this.computer) {
    //         if (this.computer.compute_linksWorker) this.computer.compute_linksWorker.terminate();
    //         if (this.computer.compute_mstWorker) this.computer.compute_mstWorker.terminate();
    //         if (this.computer.compute_nnWorker) this.computer.compute_nnWorker.terminate();
    //         if (this.computer.compute_directionalityWorker) this.computer.compute_directionalityWorker.terminate();
    //         if (this.computer.compute_treeWorker) this.computer.compute_treeWorker.terminate();
    //         if (this.computer.compute_triangulationWorker) this.computer.compute_triangulationWorker.terminate();
    //         if (this.computer.compute_parse_csv_matrixWorker) this.computer.compute_parse_csv_matrixWorker.terminate();
    //         if (this.computer.compute_parse_fastaWorker) this.computer.compute_parse_fastaWorker.terminate();
    //     }
    // }
    

    onNewSession() {
        this.store.setNewSession(true);
        this.reset();
    }

    onSessionDestroyed() {
        this.reset();
        this.store.setSessionDestroyed(true);
    }

    onStyleFileApplied() {
        this.store.setStyleFileApplied(true);
    }

    onTableCleared(tableId: string) {
        this.store.setTableCleared(tableId);
    }

    onStatisticsChanged(statisticsType?: string) {
        this.store.setStatisticsChanged(statisticsType);
    }


    /** 
     * XXXXX Not currently used; not sure of future use XXXXX
     * @returns boolean
     */
    onlyUnique(value, index, self) {
        return self.indexOf(value) === index;
    }

    /**
     * Checks if an array or string contains a specified value.
     * @param container - Where to search such as a []
     * @param {any} value - The value to search for.
     * @returns {boolean} - `true` if the `container` parameter contains the `value` parameter, and `false` otherwise.
     */
    includes(container: any, value: any) {
        let returnValue = false;
        const pos = container.indexOf(value);
        if (pos >= 0) {
            returnValue = true;
        }

        return returnValue;
    };

    /**
     * Sanitizes user input to prevent cross-site scripting (XSS) attacks.
     * @param {string|number|boolean} t - The user input to be sanitized.
     * @param {boolean} [e=0 | false] - An optional parameter that specifies whether to encode the sanitized output as HTML entities.
     * @returns {string} - The sanitized output.
     */
    filterXSS(t, e: any = 0) {
        const argType: any = typeof t;
        if(argType==='object'){
            return JSON.stringify(t);
        }
        else if (argType === 'number' || argType === 'boolean') {
            const tempT = t.toString();
            t = tempT;
        }
        else if (argType != 'string' && argType != 'number')
            t = '';

        const i = t.replace(/javascript/gi, 'j&#97;vascript').replace(/expression/gi, 'expr&#101;ssion').replace(/onload/gi, 'onlo&#97;d').replace(/script/gi, '&#115;cript').replace(/onerror/gi, 'on&#101;rror');
        return e === !0 ? i : i.replace(/>/g, '&gt;').replace(/</g, '&lt;')
    };

    /**
     * @param {any} a an input value
     * @returns {boolean} whether a is a number
     */
    isNumber(a: any): boolean {
        return typeof a == 'number';
    };

    /**
     * Adds a new node to an array of nodes.
     * @param {Node} newNode - The new node to be added to the array.
     * @param {boolean | null} [check=null] - An optional parameter that specifies whether to check for duplicates before adding the new node.
     * @returns {number} - `1` if a new node was added to the array, `0` otherwise.
     */
    addNode(newNode: any, check: any = null): number {

        //  If _id, set id to _id 
        if(newNode._id) {
            if (typeof newNode._id !== 'string') {
                newNode._id = newNode._id.toString();  
            }  
            newNode._id = newNode._id.trim();
            newNode.id = newNode._id;

        } else if (newNode.id) {
            if (typeof newNode.id !== 'string') {
                newNode.id = newNode.id.toString();  
            }  
            newNode.id = newNode.id.trim();
            newNode._id = newNode.id;
        }


        if (this.session.data.nodeExclusions.indexOf(newNode._id) > -1) {
            return 0;
        }

        if (check) {
            let nodes = this.session.data.nodes;

            const n = nodes.length;
            for (let i = 0; i < n; i++) {
                const node = nodes[i];
                if (node._id == newNode._id) {
                    newNode.origin = this.uniq(newNode.origin.concat(node.origin));
                    Object.assign(node, newNode);
                    return 0;
                }
            }
        }



        let newElement = Object.assign(this.defaultNode(), newNode);

        if (Object.prototype.hasOwnProperty.call(newNode, 'data') && Object.prototype.hasOwnProperty.call(newNode.data, 'data')) {
          newElement.data = newNode.data.data;
        }
        this.session.data.nodes.push(newElement);

        return 1;
    };

    /**
     * Adds a new link to an array of links.
     * @param {Object} newLink- The new link to be added to the array.
     * @param {boolean | null} [check=null] - An optional parameter that specifies whether to check for duplicates before adding the new link.
     * @returns {number} - `1` if a new link was added to the array, `0` otherwise.
     */
    addLink(newLink: any, check: any = true): number {


    
        const serv = this;
        const matrix = serv.temp.matrix;

        if((newLink.source === "MZ798055" && newLink.target === "MZ375596") || (newLink.source === "MZ7375596" && newLink.target === "MZ798055")){
            console.log('new link 111: ', JSON.stringify(newLink));
        }
    
        // Trim ids to remove whitespace
        if (typeof newLink.source == 'number') {
            newLink.source = newLink.source.toString().trim();
        } else {
            newLink.source = newLink.source.trim();
        }
        if (typeof newLink.target == 'number') {
            newLink.target = newLink.target.toString().trim();
        } else {
            newLink.target = newLink.target.trim();
        }
    
        if (!matrix[newLink.source]) {
            matrix[newLink.source] = {};
        }
        if (!matrix[newLink.target]) {
            matrix[newLink.target] = {};
        }

        // If source and target are the same, don't add the link
        if (newLink.source == newLink.target) return 0;

        const ids = [newLink.source, newLink.target].sort();
        const id = `${ids[0]}-${ids[1]}`;

        let linkIsNew = 1;

        const sdlinks = serv.session.data.links;

        if (matrix[newLink.source][newLink.target]) {

            const oldLink = matrix[newLink.source][newLink.target];

             // Ensure id is consistent during merge ---
             newLink.id = oldLink.id || id; // Prefer existing ID

            let myorigin = this.uniq(newLink.origin.concat(oldLink.origin));
            // console.log(JSON.stringify(myorigin));

            // Ensure no empty origins
            myorigin = myorigin.filter(origin => origin != '');

             // --- Start: Logic to manage global origin order ---
            if (myorigin.length > 1) {
                let globalOrder = this.session.style.widgets['link-origin-array-order'];

                // If the global order hasn't been established yet OR if the current combination has more origins
                // than the currently stored global order (indicating a new origin was added to this combo),
                // establish/update the global order based on this link's final merged origins.
                // This assumes the first time a multi-origin link is fully formed defines the order.
                if (globalOrder.length === 0 || myorigin.length > globalOrder.length) {
                    // Simple update: just use the current merged order.
                    // If more complex order logic is needed (e.g., specific file types first), implement here.
                    this.session.style.widgets['link-origin-array-order'] = [...myorigin]; // Use spread to create a new array reference
                    console.log('UPDATED Global link-origin-array-order:', this.session.style.widgets['link-origin-array-order']);
                }
                // Ensure this link's origin uses the established global order if it matches the length
                // (setLinkVisibility will handle applying it finally)
                else if (myorigin.length === globalOrder.length) {
                    // If lengths match, we assume it's the same combination.
                    // No action needed here, setLinkVisibility will apply the global order.
                } else {
                    // This case (myorigin.length < globalOrder.length) might indicate an issue
                    // or a different combination. Log it for debugging if needed.
                    console.warn("Mismatched origin lengths during merge, global order might be incorrect.", myorigin, globalOrder);
                }
            }

            // Ensure new link keeps distance if already defined previously
            if (oldLink.hasDistance) {
                newLink.hasDistance = true;
                newLink['distance'] = oldLink['distance'];
                newLink.distanceOrigin = oldLink.distanceOrigin;
            }

            oldLink["origin"] = myorigin;
            newLink["origin"] = myorigin;
            // console.log("old link isL " + `${JSON.stringify(oldLink)} ${JSON.stringify(newLink)}`);

            // Only override if new isn't directed and old may be, and ensure its in the right direction
            if(oldLink.directed) {
                newLink.directed = true;
                newLink.source = oldLink.source;
                newLink.target = oldLink.target;
            }
            

            _.merge(oldLink, newLink);

            oldLink.origin = myorigin;


            if(newLink["bidirectional"]){
                oldLink["bidirectional"] = true;
            }

            linkIsNew = 0;

        } else if (serv.temp.matrix[newLink.target][newLink.source]) {
            console.warn("This scope should be unreachable. If you're using this code, something's wrong.");
            const oldLink = matrix[newLink.target][newLink.source];
             // Ensure id is consistent during merge ---
             newLink.id = oldLink.id || id; // Prefer existing ID

            const origin = this.uniq(newLink.origin.concat(oldLink.origin));
            if(origin.length > 1) {
                newLink.hasDistance = true;
            }
            Object.assign(oldLink, newLink, { origin: origin });
            linkIsNew = 0;

        } else {

             // Assign stableId to the new link object ---
             newLink.id =  id; 

             if (newLink.hasDistance || newLink.origin.length > 1) {
                newLink = Object.assign({
                index: sdlinks.length,
                source: "",
                target: "",
                visible: false,
                cluster: 1,
                origin: [],
                hasDistance: true
                }, newLink);
            } else {
                newLink = Object.assign({
                index: sdlinks.length,
                source: "",
                target: "",
                visible: false,
                cluster: 1,
                origin: [],
                hasDistance: false
                }, newLink);
    
            }
               // Always add the new link without merging
               sdlinks.push(newLink);
               matrix[newLink.source][newLink.target] = newLink;
               matrix[newLink.target][newLink.source] = newLink;

               linkIsNew = 1;

        }


        if(!this.session.style.widgets['link-origin-array-order']){
            this.session.style.widgets['link-origin-array-order'] = [];
        }
        if (newLink.origin.length > 1 && this.session.style.widgets['link-origin-array-order'].length === 0) {
            this.session.style.widgets['link-origin-array-order'] = newLink.origin;
        }
        
        if((newLink.source === "MZ798055" && newLink.target === "MZ375596") || (newLink.source === "MZ375596" && newLink.target === "MZ798055")){
            console.log('new link 222: ', JSON.stringify(newLink));
        }
    
       
        return linkIsNew;

        // TODO Remove when not needed
        // this.session.data.linkFilteredValues = [...this.session.data.links];
        // return linkIsNew;
    };

    /**
     * Removes duplicate elements from an array.
     * @param {Array} a - The array to be processed.
     * @returns {Array} - The array containing only the unique elements of the input array `a`.
     */
    uniq(a: any) {
        const seen = {};
        const out = [];
        const len = a.length;
        let j = 0;
        for (let i = 0; i < len; i++) {
            const item = a[i];
            if (seen[item] !== 1) {
                seen[item] = 1;
                out[j++] = item;
            }
        }
        return out;
    }

    public getSelectedNode(nodes: any[]): any {
        return nodes.find(node => node.selected);
    }
    

    getColorByIndex( index : number ) {

        let variable = this.session.style.widgets['node-color-variable'];
        let color = this.session.style.widgets['node-color'];


        if (variable == 'None') {

            return color;

        } else {

            return this.temp.style.nodeColorMap( this.session.data.nodes[index][variable]);

        }
    }

    public convertToGraphDataArray(microbeData: any): GraphData {

        console.log('--- TWOD convertToGraphDataArray called');
        const nodes = microbeData.nodes.map((node) => ({
          ...node, // Spread existing properties
          id: node._id, // Ensure the id property is set correctly
          group: node.cluster,
          color: this.getColorByIndex(node.index), // Add or override the color property
          label: (this.session.style.widgets['node-label-variable'] === 'None') ? '' : node.label, // Ensure label is defined
            nodeSize: node.nodeSize ?? 20, // Default node size
            borderWidth: node.borderWidth ?? this.session.style.widgets['node-border-width'] ?? 1 // Default border width
        }));
      
        const links = microbeData.links.map((link, i) => ({
          ...link, // Spread existing properties
          id : link.id, //'edge-' + i, // If 
          source: link.source, // Ensure source is correctly set
          target: link.target, // Ensure target is correctly set
          group: link.cluster ?? null, // Ensure group is set, default to null if undefined
          chapter: link.distance ? link.distance.toString() : null, // Convert distance to string for chapter
          linkWidth: 1,
          label: link.label ?? '', // Ensure label is defined
          borderWidth: link.borderWidth ?? 1 // Default border width for links
        }));

        console.log('--- TWOD convertToGraphDataArray end, ',links);

      
        return {
          nodes,
          links
        };
      }
      

    /**
     * I think this function allows users to import an svg image into MT. Not sure if it currently works.
     * @param svg 
     */
    processSVG(svg: any) {
        const nodes = [];

        const $xml: any = document.getElementById(svg);
        if ($xml.find('#edges').length) {
            $xml.find('#nodes circle').each((i, node) => {
                const $node: any = document.getElementById(node);
                const gephid = $node.attr('class');
                nodes.push(gephid);
                this.addNode(
                    {
                        id: gephid + '',
                        color: $node.attr('fill'),
                        size: parseFloat($node.attr('r')),
                        origin: ['Scraped Gephi SVG']
                    },
                    false
                );
            });
            this.session.data.nodeFields.push('color');
            this.session.data.nodeFields.push('size');
            $xml.find('#edges path').each((i, link) => {
                const $link = $(link);
                const coords = $link.attr('class').split(' ');
                const base = {
                    source: coords[0] + '',
                    target: coords[1] + '',
                    color: $link.attr('stroke'),
                    origin: ['Scraped MicrobeTrace SVG']
                };
                base[this.session.style.widgets['default-distance-metric']] = 0;
                this.addLink(base, true);
            });
            this.session.data.linkFields.push('color');
        } else {
            $xml.find('.nodes g').each((i, node) => {
                nodes.push(
                    $(node)
                        .attr('transform')
                        .slice(10, -1)
                        .split(',')
                        .map(parseFloat)
                );
                this.addNode(
                    {
                        id: i + '',
                        origin: ['Scraped SVG']
                    },
                    false
                );
            });
            $xml.find('line').each((i, link) => {
                const $l: any = document.getElementById(link);
                const source = nodes.findIndex(d => {
                    return (
                        Math.abs(d[0] - parseFloat($l.attr('x1'))) < 0.0001 &&
                        Math.abs(d[1] - parseFloat($l.attr('y1'))) < 0.0001
                    );
                });
                const target = nodes.findIndex(d => {
                    return (
                        Math.abs(d[0] - parseFloat($l.attr('x2'))) < 0.0001 &&
                        Math.abs(d[1] - parseFloat($l.attr('y2'))) < 0.0001
                    );
                });
                if (source < 0 || target < 0) return;
                const base = {
                    source: source + '',
                    target: target + '',
                    origin: ['Scraped SVG']
                };
                base[this.session.style.widgets['default-distance-metric']] = 0;
                this.addLink(base, true);
            });
        }
        this.runHamsters();
    };

    /**
     * Loads JSON, MicrobeTrace, or HivTrace files into MicrobeTrace
     * @param json 
     * @param {string} extension file extension such as json, hivtrace, or microbetrace
     */
    processJSON(json: any, extension: string) {
        if(this.debugMode) {
            console.log("Trying to process JSON file");
        }
        let data;
        try {
            if(json.result) {
                data = JSON.parse(json.result);
            } else {
                data = JSON.parse(json);
            }
        } catch (error) {

            // abp.notify.error(
            //     'File Not Recognized! Are you certain this is a MicrobeTrace Session or HIV-TRACE Output File?'
            // );
            console.error(error);
            return;
        }
        if (extension == 'microbetrace') {
            this.session = this.sessionSkeleton();

            return this.applySession(data);
        } else {
            if (data.meta && data.tree) {
              // this.applyAuspice(data);
            } else {
              if (data.version) {
                  this.applyGHOST(data);
              } else {
                console.log("Trying to load HIVTrace file");
                  this.applyHIVTrace(data);
              }
           }
        }

    };

    /**
     * Updates commonService.session with information from stashObject. Variables updated include data, files, state, style, and layout.
     */
    async applySession(stashObject: StashObjects) {
        //If anything here seems eccentric, assume it's to maintain compatibility with
        //session files from older versions of MicrobeTrace.
        $("#launch").prop("disabled", true);

         // Set to false to indicate that the network is not fully loaded  as new network is launching
        this.session.network.isFullyLoaded = false;

        // launching new network, so set network rendered to false to start loading modal
        this.store.setNetworkRendered(false);
        this.store.setSettingsLoaded(false);

        console.log('applySession - temp:', this.temp);

        $(document).trigger("stop-force-simulation"); // stop previous network ticks so previous polygon won't show up
        $(document).off('.2d');

        if(this.debugMode) {
            console.log('applying session:', stashObject);
        }

        if(stashObject.session) {

        } else {
            stashObject = {
                tabs : [{
                    label: 'Files',
                    templateRef: null,
                    tabTitle: 'Files',
                    isActive: true,
                    componentRef: null
                }],
                session: stashObject
            }
        }

        const oldSession = stashObject.session;
        console.log('this.temp: ', this.temp);
        this.temp.matrix = [];
        this.session.files = oldSession.files;
        this.session.state = oldSession.state;
        this.session.style = oldSession.style;

        this.session.meta.startTime = Date.now();


        if(oldSession.layout) {
            this.session.layout = oldSession.layout;
        }

        console.log('applySession called 2');
        // layout.root.removeChild(layout.root.contentItems[0]);

        const nodes = oldSession.data.nodes,
            links = oldSession.data.links,
            n = nodes.length,
            m = links.length;

        for (let i = 0; i < n; i++) this.addNode(nodes[i]);
        for (let j = 0; j < m; j++) {
            // Add distance property for files saved prior to distance visibility fix
            if ((links[j].origin).includes('Genetic Distance')) {
                links[j].hasDistance = true;
                links[j].distanceOrigin = 'Genetic Distance';
            } else if (links[j].distance && links[j].distance > 0) {
                links[j].hasDistance = true;
            }
            this.addLink(links[j]);
        }
        // for (let j = 0; j < m; j++) this.addLink(links[j]);
        ['nodeFields', 'linkFields', 'clusterFields', 'nodeExclusions'].forEach(v => {
            if (oldSession.data[v]) this.session.data[v] = this.uniq(this.session.data[v].concat(oldSession.data[v]));
        });

        // TODO: See about this process data functionality.  DO we need this?
        this.processData();

        if (oldSession.network) this.session.network = oldSession.network;

        // Set to false to indicate that the network is not fully loaded  as new network is launching
        this.session.network.isFullyLoaded = false;

         if (oldSession.data.geoJSONLayerName !== "") {
            this.session.data['geoJSON'] = oldSession.data.geoJSON;
            this.session.data['geoJSONLayerName'] = oldSession.data.geoJSONLayerName;
        }

        this.applyStyle(this.session.style);

        console.log('applySession end');

        // TODO: Review if this is necessary
        // if (!links[0]['distance']) {
        //     if (links[0]['tn93']) {
        //         this.session.style.widgets['link-sort-variable'] = 'tn93';
        //     } else {
        //         this.session.style.widgets['link-sort-variable'] = 'snps';
        //     }
        // }
        this.finishUp();

    };

    /**
     * XXXXX Review if function is necessary XXXXX
     * Sets session.data.nodeFilteredValues = session.data.nodes
     * TODO:: DO WE NEED NODE FILTERED VALUES?
     */
    processData() {
        let nodes = this.session.data.nodes;
        if(this.debugMode) {
            console.log('processing data: ', nodes);
        }

        this.session.data.nodeFilteredValues = nodes;

        // TODO:: DO WE NEED THIS
        //Add links for nodes with no edges
        // this.uniqueNodes.forEach(x => {
        //     this.commonService.addLink(Object.assign({
        //         source: '' + x,
        //         target: '' + x,
        //         origin: origin,
        //         visible: true,
        //         distance: 0,
        //     }, 'generated'));
        // })
    }

    /**
     * Updates session.style with information from style object parameter, also updated Link Color Map, Node Color Map, and Polygon Color Map Functions
     */
    applyStyle(style) {
        if(this.debugMode) {
            console.log('---- applying style: ', style);
        }
        this.session.style = style;
        this.session.style.widgets = Object.assign({},
            this.defaultWidgets(),
            style.widgets
        );

        // if(this.debugMode) {
            console.log('creating link/node/polygon colorMap style: ', style);
        // }
        this.createLinkColorMap();
        this.createNodeColorMap();
        this.createPolygonColorMap();

        // finds id s in template/html where id=widget name, updated the value to the new value in the style file
        let $id = null;
        for (let id in this.session.style.widgets) {
            $id = $("#" + id);
            if ($id.length > 0) {
                if (this.includes(["radio", "checkbox"], ($id[0].type))) {
                    if (this.session.style.widgets[id]) $id.trigger("click");
                } else {
                    if (id == 'default-distance-metric') {
                        $id.val(this.session.style.widgets[id].toLowerCase());
                        $("#" + id+'2').val(this.session.style.widgets[id].toLowerCase());
                    } else {
                        $id.val(this.session.style.widgets[id]);
                    }                    
                }
            }
        }

        this.onStyleFileApplied();

        if(this.debugMode) {
            console.log('---- Apply Style File Done');
        }

        // TODO: See if this is needed
        // this.visuals.microbeTrace.homepageTabs.forEach(tab => {
        //     if (tab.componentRef && tab.componentRef.instance.updateVisualization) {
        //         tab.componentRef.instance.applyStyleFileSettings();
        //     }
        // })
        // Need session applied variable since this will break restoring full microbe trace file vs loading a style file
        // if (!sessionApplied) {
        // // Trigger global style updates
        // $("#node-color-variable").trigger("change");
        // $("#node-color-border").trigger("change");
        // $("#link-color-variable").trigger("change");
        // $("#selected-color").trigger("change");
        // $("#background-color").trigger("change");

        // // 2d Network Specific
        // $('#node-radius-variable').trigger("change");
        // $('#node-symbol-variable').trigger("change");
        // $('#node-label-variable').trigger("change");
        // } else {
        // sessionApplied = false;
        // }
    };

    applyHIVTrace(hivtrace) {
      console.log("Running applyHIVTrace");
        this.resetData();
        this.session.meta.startTime = Date.now();
        hivtrace["trace_results"]["Nodes"].forEach(node => {
          let newNode = {
            _id: node.id,
            origin: "HIVTRACE Import",
          }
          if (Object.prototype.hasOwnProperty.call(node, "patient_attributes")){ 
            console.log("had patient_attributes");
            newNode = JSON.parse(JSON.stringify(node.patient_attributes));
            Object.keys(
                hivtrace["trace_results"]["Nodes"][0]["patient_attributes"]
            ).forEach(key => {
                if (!this.session.data.nodeFields.includes(key))
                    this.session.data.nodeFields.push(key);
            });
          }
          this.addNode(newNode, false);
        });
        this.processData();
        let n = hivtrace["trace_results"]["Edges"].length;
        let metric = this.session.style.widgets['default-distance-metric'];
        for (let i = 0; i < n; i++) {
            const link = hivtrace["trace_results"]["Edges"][i];
            const newLink = {
                source: "" + link.sequences[0],
                target: "" + link.sequences[1],
                origin: ["HIVTRACE Import"],
                visible: true
            };
            newLink[metric] = parseFloat(link.length);
            newLink["distance"] = newLink[metric];
            this.addLink(newLink, false);
        }
        this.session.data.linkFields.push(metric);
        this.runHamsters();
    };

    applyGHOST(ghost) {
        this.session = this.sessionSkeleton();
        this.session.meta.startTime = Date.now();
        ghost["samples"].forEach(node => {
            const newNode = JSON.parse(JSON.stringify(node));
            newNode.origin = ["GHOST Import"];
            newNode.genotypes = JSON.stringify(newNode.genotypes);
            newNode._id = "" + newNode._id;
            this.addNode(newNode, false);
        });
        ["genotypes", "group", "_id", "name"].forEach(key => {
            if (!this.session.data.nodeFields.includes(key)) {
                this.session.data.nodeFields.push(key);
            }
        });
        const links = ghost["links"];
        const n = links.length;
        for (let i = 0; i < n; i++) {
            const link = links[i];
            const newLink = Object.assign({}, link, {
                source: "" + link.source,
                target: "" + link.target,
                distance: parseFloat(link.dist),
                origin: ["GHOST Import"],
                visible: true
            });
            this.addLink(newLink, false);
        }
        [
            "density",
            "dist",
            "shared",
            "src_genotype",
            "src_haps",
            "tgt_genotype",
            "tgt_haps"
        ].forEach(key => {
            if (!this.session.data.linkFields.includes(key))
                this.session.data.linkFields.push(key);
        });
        this.runHamsters();
    };

    applyAuspice(auspice) {
      return new Promise(resolve => {
        const auspiceHandler = new AuspiceHandler(this);
        const auspiceData = auspiceHandler.run(auspice);
        resolve(auspiceData);
      });
    };

    openAuspiceUrl(url) {
      
      return new Promise(resolve => {
        let auspiceDataHolder = {};
        this.http.get(url).subscribe((data: Object) => {
          auspiceDataHolder = {
            tree: data["tree"],
            meta: data["meta"],
            version: data["version"],
          };
          // const auspiceHandler = new AuspiceHandler(this);
          // const auspiceData = auspiceHandler.run(auspiceDataHolder);
          resolve(auspiceDataHolder);
        });
      });
      this._debouncedUpdateNetworkVisuals();
      this.updateStatistics();
    };

    /**
     * Decodes the given `x` using the utf-8 TextDecoder object.
     * @param {ArrayBuffer} x - The data to be decoded.
     * @returns {string} - The decoded string.
     */
    decode(x) {
        return this.decoder.decode(x);
    };

   /**
 * Asynchronously parses fasta text on another thread to generate an array of nodes with id and seq
 * @param {string} text fasta string
 * @returns {Promise<Array>} A Promise that resolves to an array of nodes with id and seq.
 */
parseFASTA(text): Promise<any> {
    return new Promise(resolve => {
      const fastaWorker = this.computer.getParseFastaWorker();
      fastaWorker.postMessage({ data: text });
      
      const sub = fastaWorker.onmessage().subscribe((response) => {
        let nodes = JSON.parse(this.decode(new Uint8Array(response.data.nodes)));
        if (this.debugMode) {
          console.log("FASTA Transit time: ", (Date.now() - response.data.start).toLocaleString(), "ms");
        }
        resolve(nodes);
        fastaWorker.terminate();
        sub.unsubscribe();
      });
    });
  }
  

    private fromWorker(worker: Worker): Observable<MessageEvent<any>> {
        return new Observable(observer => {
          const messageHandler = (event: MessageEvent<any>) => observer.next(event);
          const errorHandler = (error: ErrorEvent) => observer.error(error);
      
          worker.addEventListener('message', messageHandler);
          worker.addEventListener('error', errorHandler);
      
          // Cleanup function
          return () => {
            worker.removeEventListener('message', messageHandler);
            worker.removeEventListener('error', errorHandler);
            worker.terminate();
          };
        });
      }

    /**
     * Asynchronously parses csv matrix file content and adds nodes and links to session.data
     * @param {string} file content from csv matrix file
     * @returns {Promise} A Promise that resolves to an object with {numberOfNodesAdded, numberOfLinksAdded, totalNumberofNodes, totalNumberofLinks}
     */
    parseCSVMatrix(file) {
        return new Promise((resolve, reject) => {
            let check = this.session.files.length > 1;
            const origin = [file.name];
            let nn = 0, nl = 0;        
    
            // ✅ Create a New Worker Before Use
            this.computer.compute_parse_csv_matrixWorker = new Worker(new URL('../workers/parse-csv-matrix.worker.ts', import.meta.url));
    
            this.computer.compute_parse_csv_matrixWorker.postMessage(file.contents);
    
            // Convert worker messages to Observable
            const workerObservable = this.fromWorker(this.computer.compute_parse_csv_matrixWorker);
    
            const sub = workerObservable.subscribe({
                next: (response: MessageEvent<any>) => {
                    const data = JSON.parse(
                        this.decode(new Uint8Array(response.data.data))
                    );
                    console.log(
                        'CSV Matrix Transit time:',
                        (Date.now() - response.data.start).toLocaleString(),
                        'ms'
                    );              
    
                    const start = Date.now();
                    const nodes = data.nodes;
                    const tn = nodes.length;
                    for (let i = 0; i < tn; i++) {
                        nn += this.addNode(
                            {
                                _id: this.filterXSS(nodes[i]),
                                origin: origin,
                            },
                            check
                        );
                    }
                    const links = data.links;
                    const tl = links.length;
                    for (let j = 0; j < tl; j++) {
                        nl += this.addLink(
                            Object.assign(links[j], {
                                origin: origin,
                                hasDistance: true,
                                distanceOrigin: origin,
                            }),
                            check
                        );
                    }
    
                    console.log(
                        'CSV Matrix Merge time:',
                        (Date.now() - start).toLocaleString(),
                        'ms'
                    );             
    
                    resolve({ nn, nl, tn, tl });
    
                    // ✅ Terminate Worker After Processing
                    this.computer.compute_parse_csv_matrixWorker.terminate();
    
                    // ✅ Reinitialize Worker for Next Dataset
                    setTimeout(() => {
                        this.computer.compute_parse_csv_matrixWorker = new Worker(new URL('../workers/parse-csv-matrix.worker.ts', import.meta.url));
                        console.log("Worker reinitialized for next dataset.");
                    }, 100);
    
                    sub.unsubscribe();
                },
                error: (err: ErrorEvent) => {
                    console.error('Worker error:', err);
                    reject(err);
    
                    // ✅ Ensure Worker Terminates on Error
                    this.computer.compute_parse_csv_matrixWorker.terminate();
                    sub.unsubscribe();
    
                    // ✅ Reinitialize Worker on Error
                    setTimeout(() => {
                        this.computer.compute_parse_csv_matrixWorker = new Worker(new URL('../workers/parse-csv-matrix.worker.ts', import.meta.url));
                        console.log("Worker reinitialized after error.");
                    }, 100);
                }
            });
        });
    };
    

    /**
     * XXXXX function not currently called XXXXX
     * @param auspiceData 
     * @returns 
     */
    auspiceCallBack(auspiceData) {
        this.clearData();
        this.session = this.sessionSkeleton();
        this.session.meta.startTime = Date.now();
        this.session.data.tree = auspiceData['tree'];
        this.session.data.newickString = auspiceData['newick'];
        let nodeCount = 0;
        auspiceData['nodes'].forEach(node => {
            if (!/NODE0*/.exec(node.id)) {
            const nodeKeys = Object.keys(node);
            nodeKeys.forEach( key => {
                if (this.session.data.nodeFields.indexOf(key) === -1) {
                this.session.data.nodeFields.push(key);
                }
                if (! Object.prototype.hasOwnProperty.call(node, 'origin') ) {
                node.origin = [];
                }
                nodeCount += this.addNode(node, true);
            });
            }
        });
        let linkCount = 0;
        auspiceData['links'].forEach(link => {
            linkCount += this.addLink(link, true);
        });
        this.runHamsters();
        // this.showMessage(` - Parsed ${nodeCount} New Nodes and ${linkCount} new Links from Auspice file.`);
        this.processData();
        return nodeCount;
    };

    /**
     * Generates new sequences
     * ported from https://github.com/CDCgov/SeqSpawnR/blob/91d5857dbda5998839a002fbecae0f494dca960a/R/SequenceSpawner.R
     * @param {string} idPrefix - prefix to label generated sequences
     * @param {number} count - number of sequences to generate
     * @param {number} snps - number of snps to add to a new sequence is random value from 0 - snps
     * @param {string} seed -reference sequence for generating new sequences 
     * @returns list of objects representings seq, each seq objects has {id: string, seq: string}
     */
    generateSeqs(idPrefix, count?, snps?, seed?) {
        const start = Date.now();
        if (!count) count = 1000;
        if (!snps) snps = 100;
        if (!seed) seed = this.session.data.reference;

        const sampleCodons = [
            "GCA",
            "GCC",
            "GCG",
            "GCT",
            "AAC",
            "AAT",
            "GAC",
            "GAT",
            "TGC",
            "TGT",
            "GAC",
            "GAT",
            "GAA",
            "GAG",
            "TTC",
            "TTT",
            "GGA",
            "GGC",
            "GGG",
            "GGT",
            "CAC",
            "CAT",
            "ATA",
            "ATC",
            "ATT",
            "AAA",
            "AAG",
            "CTA",
            "CTC",
            "CTG",
            "CTT",
            "TTA",
            "TTG",
            "ATG",
            "AAC",
            "AAT",
            "CCA",
            "CCC",
            "CCG",
            "CCT",
            "CAA",
            "CAG",
            "AGA",
            "AGG",
            "CGA",
            "CGC",
            "CGG",
            "CGT",
            "AGC",
            "AGT",
            "TCA",
            "TCC",
            "TCG",
            "TCT",
            "ACA",
            "ACC",
            "ACG",
            "ACT",
            "GTA",
            "GTC",
            "GTG",
            "GTT",
            "TGG",
            "TAC",
            "TAT",
            "CAA",
            "CAG",
            "GAA",
            "GAG"
        ];
        const sampleSNPs = ["A", "C", "G", "T"];

        const sample = (vec, nCodons) => {
            const samples = [];
            for (let x = 0; x < nCodons; x++) {
                let idx = Math.floor(this.r01() * vec.length);
                samples.push(vec[idx]);
            }
            return samples;
        }

        const seqs = [];

        seqs.push({ id: idPrefix + "0", seq: seed });

        while (seqs.length < count) {
            // number codons to vary
            let nCodons = Math.floor(this.r01() * 10) + 1;

            // randomly select this many to check for existence
            const randomCodonSet = sample(sampleCodons, nCodons).join("");

            // try again if not present
            if (seqs[seqs.length - 1].seq.indexOf(randomCodonSet) == -1) continue;

            // sequence to mutate
            let oldseed = seqs[Math.floor(this.r01() * seqs.length)].seq;

            // select codons to replace randomCodonSet
            const replacementCodonSet = sample(sampleCodons, nCodons).join("");

            // replace codon set
            let newseed = oldseed.replace(randomCodonSet, replacementCodonSet);

            // add snp substitutions randomly across entire sequence
            // - randomly sample addedSNP
            // - randomly pick SNPS to replace
            let addedSNPs = Math.floor(this.r01() * snps);
            for (let j = 0; j < addedSNPs; j++) {
                let randomSNP = sample(sampleSNPs, 1)[0];
                let locOfSNP = Math.floor(this.r01() * seed.length);
                newseed =
                    newseed.substr(0, locOfSNP) + randomSNP + newseed.substr(locOfSNP + 1);
            }

            seqs.push({ id: idPrefix + "" + seqs.length, seq: newseed });
        }
        if(this.debugMode) {
            console.log("Sequence spawn time:", (Date.now() - start).toLocaleString(), 'ms');
        }
        return seqs;
    };

    // Align function using a fresh align worker
align(params): Promise<any> {
    return new Promise(resolve => {
      if (params.aligner === "none") {
        return resolve(params.nodes);
      }
      const n = params.nodes.length;
      const referenceLength = params.reference.length;
      
      // Get a fresh align worker.
      const alignWorker = this.computer.getAlignWorker();
      alignWorker.postMessage(params);
      
      const sub = alignWorker.onmessage().subscribe((response) => {
        let subset = JSON.parse(this.decode(new Uint8Array(response.data.nodes)));
        console.log("Alignment transit time: ", (Date.now() - response.data.start).toLocaleString(), "ms");
        const start = Date.now();
        let minPadding = Infinity;
        let d = null;
        for (let i = 0; i < n; i++) {
          d = subset[i];
          if (!d._seq) d._seq = "";
          if (minPadding > d._padding) minPadding = d._padding;
        }
        for (let j = 0; j < n; j++) {
          d = subset[j];
          d._seq = "-".repeat(d._padding - minPadding) + d._seq;
          if (d._seq.length > referenceLength) {
            d._seq = d._seq.substring(0, referenceLength);
          } else {
            d._seq = d._seq.padEnd(referenceLength, "-");
          }
        }
        this.session.data.nodeFields.push('_score', '_padding', '_cigar');
        console.log("Alignment Padding time: ", (Date.now() - start).toLocaleString(), "ms");
        resolve(subset);
        
        // Terminate the worker and unsubscribe.
        alignWorker.terminate();
        sub.unsubscribe();
      });
    });
  }
  
  
  // Compute consensus using a fresh consensus worker
  computeConsensus(nodes = null): Promise<any> {
    if (!nodes) {
      nodes = this.session.data.nodes.filter(d => d.seq);
    }
    return new Promise(resolve => {
      const consensusWorker = this.computer.getConsensusWorker();
      consensusWorker.postMessage({ data: nodes });
      
      const sub = consensusWorker.onmessage().subscribe((response) => {
        if (this.debugMode) {
          console.log("Consensus Transit time: ", (Date.now() - response.data.start).toLocaleString(), "ms");
        }
        resolve(this.decode(new Uint8Array(response.data.consensus)));
        consensusWorker.terminate();
        sub.unsubscribe();
      });
    });
  }
  
  
  // Compute ambiguity counts using a fresh ambiguity counts worker
  computeAmbiguityCounts(): Promise<void> {
    return new Promise(resolve => {
      let nodes = this.session.data.nodes;
      let subset = nodes.filter(d => d.seq);
      const subsetLength = subset.length;
      
      const ambiguityWorker = this.computer.getAmbiguityCountsWorker();
      ambiguityWorker.postMessage(subset);
      
      const sub = ambiguityWorker.onmessage().subscribe((response) => {
        console.log("Ambiguity Count Transit time: ", (Date.now() - response.data.start).toLocaleString(), "ms");
        const start = Date.now();
        const dists = new Float32Array(response.data.counts);
        for (let j = 0; j < subsetLength; j++) {
          nodes[subset[j].index]._ambiguity = dists[j];
        }
        this.session.data.nodeFields.push('_ambiguity');
        console.log("Ambiguity Count Merge time: ", (Date.now() - start).toLocaleString(), "ms");
        resolve();
        ambiguityWorker.terminate();
        sub.unsubscribe();
      });
    });
  }
  
  
  // Compute consensus distances using a fresh consensus worker
  computeConsensusDistances(): Promise<void> {
    return new Promise(resolve => {
      let start = Date.now();
      let nodes = this.session.data.nodes;
      let nodesLength = nodes.length;
      let subset = [];
      for (let i = 0; i < nodesLength; i++) {
        const node = nodes[i];
        if (node.seq) {
          subset.push({ index: i, seq: node.seq });
        } else {
          subset.push({ index: i, seq: "" });
        }
      }
      let subsetLength = subset.length;
      const consensusWorker = this.computer.getConsensusWorker();
      consensusWorker.postMessage({
        data: {
          consensus: this.session.data['consensus'],
          subset: subset,
          start: start
        }
      });
      const sub = consensusWorker.onmessage().subscribe((response) => {
        const dists = new Uint16Array(response.data.dists);
        console.log("Consensus Difference Transit time: ", (Date.now() - response.data.start).toLocaleString(), "ms");
        start = Date.now();
        for (let j = 0; j < subsetLength; j++) {
          nodes[subset[j].index]._diff = dists[j];
        }
        this.session.data.nodeFields.push('_diff');
        console.log("Consensus Difference Merge time: ", (Date.now() - start).toLocaleString(), "ms");
        resolve();
        consensusWorker.terminate();
        sub.unsubscribe();
      });
    });
  }
  
  
  // Compute links using a fresh links worker
  computeLinks(subset): Promise<any> {
    return new Promise(resolve => {
      let k = 0;
      const linksWorker = this.computer.getLinksWorker();
      linksWorker.postMessage({
        nodes: subset,
        metric: this.session.style.widgets['default-distance-metric'],
        strategy: this.session.style.widgets["ambiguity-resolution-strategy"],
        threshold: this.session.style.widgets["ambiguity-threshold"]
      });
      
      const sub = linksWorker.onmessage().subscribe((response) => {
        let dists = this.session.style.widgets['default-distance-metric'].toLowerCase() === 'snps'
          ? new Uint16Array(response.data.links)
          : new Float32Array(response.data.links);
        
        if (this.debugMode) {
          console.log("Links Transit time: ", (Date.now() - response.data.start).toLocaleString(), "ms");
        }
        let start = Date.now();
        let check = this.session.files.length > 1;
        let n = subset.length;
        let l = 0;
        console.log('link same compute---', n);
        for (let i = 0; i < n; i++) {
          const sourceID = subset[i]._id;
          for (let j = 0; j < i; j++) {
            let targetID = subset[j]._id;
            k += this.addLink({
              source: sourceID,
              target: targetID,
              distance: dists[l++],
              origin: ['Genetic Distance'],
              distanceOrigin: 'Genetic Distance',
              hasDistance: true,
              directed: false
            }, check);
          }
        }
        if (this.debugMode) {
          console.log("Links Merge time: ", (Date.now() - start).toLocaleString(), "ms");
        }
        resolve(k);
        linksWorker.terminate();
        sub.unsubscribe();
      });
    });
  }
  


    hasSeq = x => {
        if (x.seq.includes("a") || x.seq.includes("c") || x.seq.includes("g") || x.seq.includes("t")){
            return true;
        }
        return false;
    }

    getDM(): Promise<any> {
        const start = Date.now();
        return new Promise(resolve => {
            let dm : any = '';
            if (this.session.data['newick']){
                let treeObj = patristic.parseNewick(this.session.data['newick']);
                dm = treeObj.toMatrix();
            } else {
                let labels = this.session.data.nodes.filter(this.hasSeq).map(d => d._id);
                labels = labels.sort();
                let metric = this.session.style.widgets['link-sort-variable'];
                const n = labels.length;
                dm = new Array(n);
                const m = new Array(n);
                for (let i = 0; i < n; i++) {
                    dm[i] = new Array(n);
                    dm[i][i] = 0;
                    let source = labels[i];
                    let row = this.temp.matrix[source];
                    if (row) {
                        for (let j = 0; j < i; j++) {
                            const link = row[labels[j]];
                            if (link && link["distanceOrigin"] === "Genetic Distance") {
                                dm[i][j] = dm[j][i] = link[metric];
                            } else {
                                dm[i][j] = dm[j][i] = null;
                            }
                        }
                    }
                }
            }
            // console.log('matrixx: ',  JSON.stringify(this.temp.matrix));

            if(this.debugMode) {
                console.log("DM Compute time: ", (Date.now() - start).toLocaleString(), "ms");
            }
            resolve(dm);
        });
    };

    computeTree(): Promise<any> {
        if (this.debugMode) {
          console.log('computing tree');
        }
        console.log('------------------------------------------------------');
        return new Promise(resolve => {
          if (this.temp.treeObj) {
            return resolve(this.temp.treeObj.toNewick());
          } else if (this.session.data['newick']) {
            return resolve(this.session.data['newick']);
          } else {
            this.getDM().then(dm => {
              // Get a fresh tree worker from the factory.
              const treeWorker = this.computer.getTreeWorker();
              treeWorker.postMessage({
                labels: this.session.data.nodes.filter(this.hasSeq).map(a => a._id),
                matrix: dm,
                round: this.session.style.widgets["tree-round"]
              });
              const sub = treeWorker.onmessage().subscribe((response) => {
                // Decode the result from the worker.
                const treeObj = this.decode(new Uint8Array(response.data.tree));
                const treeString = patristic.parseJSON(treeObj).toNewick();
                if (this.debugMode) {
                  console.log('Tree Transit time: ', (Date.now() - response.data.start).toLocaleString(), 'ms');
                }
                resolve(treeString);
                // Clean up: terminate the worker and unsubscribe.
                treeWorker.terminate();
                sub.unsubscribe();
              });
            });
          }
        });
      }
      

      computeDirectionality(): Promise<void> {
        return new Promise(resolve => {
          const directionalityWorker = this.computer.getDirectionalityWorker();
          directionalityWorker.postMessage({
            links: this.session.data.links,
            tree: this.temp.tree
          });
          const sub = directionalityWorker.onmessage().subscribe((response) => {
            const flips = new Uint8Array(response.data.output);
            if (this.debugMode) {
              console.log("Directionality Transit time: ", (Date.now() - response.data.start).toLocaleString(), "ms");
            }
            const start = Date.now();
            const n = flips.length;
            for (let i = 0; i < n; i++) {
              if (flips[i]) {
                let fliplink = this.session.data.links[i];
                let fliptemp = fliplink.source;
                fliplink.source = fliplink.target;
                fliplink.target = fliptemp;
                fliplink.directed = true;
              }
            }
            if (this.debugMode) {
              console.log("Directionality Integration time: ", (Date.now() - start).toLocaleString(), "ms");
            }
            resolve();
            directionalityWorker.terminate();
            sub.unsubscribe();
          });
        });
      }
      

      computeMST(): Promise<void> {
        return new Promise((resolve, reject) => {
            const links = this.session.data.links;
        const found = links.find(l => 
        (l.source === "MZ712879" && l.target === "MZ745515") ||
        (l.source === "MZ745515" && l.target === "MZ712879")
        );
        console.log(" common service Found link in links array?", found);
          const mstWorker = this.computer.getMSTWorker();
          mstWorker.postMessage({
            links: this.session.data.links,
            matrix: this.temp.matrix,
            epsilon: this.session.style.widgets["filtering-epsilon"],
            metric: this.session.style.widgets['link-sort-variable']
          });
          const sub = mstWorker.onmessage().subscribe((response) => {
            if (response.data === "Error") {
              return reject("MST washed out");
            }
            const output = new Uint8Array(response.data.links);
            if (this.debugMode) {
              console.log("MST Transit time: ", (Date.now() - response.data.start).toLocaleString(), "ms");
            }
            const start = Date.now();
            let links = this.session.data.links;
            const numLinks = links.length;
            console.log('-----setting NN');
            for (let i = 0; i < numLinks; i++) {
              links[i].nn = output[i] ? true : false;
              if(output[i] ? true : false){
                console.log('-- NN true: ', _.cloneDeep(links[i]));
              }
            }
            if (this.debugMode) {
              console.log("MST Merge time: ", (Date.now() - start).toLocaleString(), "ms");
            }
            resolve();
            mstWorker.terminate();
            sub.unsubscribe();
          });
        });
      }
      


      computeNN(): Promise<void> {
        return this.workerComputeService.computeNN(this.session, this.temp);
      }
      

     public computeTriangulation() {
        this.workerComputeService.computeTriangulation(this.session, this.temp, this.addLink.bind(this))
        .then(() => {
          // continue processing after triangulation is complete
        })
        .catch(error => {
          console.error('Error in triangulation:', error);
        });
    }

    async runHamsters() {

        console.log('running hamsters');
        if (!this.session.style.widgets['triangulate-false']) this.computeTriangulation();
        // this.computeNN();
        console.log('run ham computeTree');
        await this.computeTree();
        console.log('compute tree end');
        if (!this.session.style.widgets['infer-directionality-false']) this.computeDirectionality();
        this.finishUp();
    };

    /**
     * Sets node/link values to null when they aren't present. Check each field in nodeField and linkFields, and if the key includes 'date', sets any null or empty string
     * value to the min date value found. Populates options for #search-field, #link-sort-variable, #node-color-variable, #link-color-variable, set value for #default-distance-metric.
     * Next calls updateThresholdHistogram, tagClusters, setClusterVisibility, setLinkVisibilty, setNodeVisibility functions. Updates network statistic table.
     * Launches default view.
     */
    async finishUp() {

        clearTimeout(this.temp.messageTimeout);

        console.log('----- finishUp called');


        console.log('----- finishUp -- node/link fields');

        // cycles through each node and link and if variable in nodeFields/linkFields not a key for the node/link, it is added with value of null
        ["node", "link"].forEach(v => {
            let n = this.session.data[v + "s"].length;
            let fields = this.session.data[v + "Fields"];
            for (let i = 0; i < n; i++) {
                let d = this.session.data[v + "s"][i];
                fields.forEach(field => {
                    if (!(field in d)) d[field] = null;
                });
            }
        });

        console.log('----- finishUp -- patch missing date fields');

         // patch missing date fields to earliest date in the the data
        let fields = this.session.data["nodeFields"];
        let nodeSkeleton = this.dataSkeleton();
        let fieldsToCheck = fields.filter(f => !nodeSkeleton.nodeFields.includes(f) && f != '_ambiguity' && f != '_diff'); 
        let n = this.session.data.nodes.length;
        let k = fieldsToCheck.length;
        // for each field in fieldsToCheck (fieldsToCheck are nodeFields that are not default from dataSkeleton() and also not '_ambiguity' and not '_diff' )
        for (let j = 0; j < k; j++) {
            const field = fieldsToCheck[j];
            const times = [];
            // for each node check if node[field] is valid time and if so push to times []
            for (let i = 0; i < n; i++) {
                let node = this.session.data.nodes[i];
                if (node[field] != null) {
                    const time = moment(node[field]); 
                    if (time.isValid() && isNaN(node[field])) //#315
                        times.push(time.toDate());
                }
            }

            // If column has the word date in it, date expected to be in column 
            if (field.toLowerCase().includes("date")){
        
                const minTime = Math.min(...times);
                const minTimeString = new Date(minTime).toString();
                // for each node d, if d[field] == null or empty string ("", " ", "  " ...) set d[field] to minTimeString
                this.session.data.nodes.forEach(d => {
                    if (d[field] == null || (d[field] && String(d[field]).trim() == "") || d[field] == 'null')  {
                        d[field] = minTimeString;
                    } 
                });
            }
        };

        // TODO:: See if this is needed
        // this.foldMultiSelect();

        console.log('----- finishUp -- search fields, color variable sort varialbe, distance UI');

        $("#search-field")
            .html(this.session.data.nodeFields.map(field => '<option value="' + field + '">' + this.titleize(field) + "</option>").join("\n"))
            .val(this.session.style.widgets["search-field"]);
        $("#search-form").css("display", "flex");
        $("#link-sort-variable")
            .html(this.session.data.linkFields.map(field => '<option value="' + field + '">' + this.titleize(field) + "</option>").join("\n"))
            .val(this.session.style.widgets["link-sort-variable"]);
        $("#node-color-variable")
            .html(
                "<option selected>None</option>" +
                this.session.data.nodeFields.map(field => '<option value="' + field + '">' + this.titleize(field) + "</option>").join("\n"))
            .val(this.session.style.widgets["node-color-variable"]);
        $("#default-distance-metric")
            .val(this.session.style.widgets["default-distance-metric"]);
        $("#link-color-variable")
        .html(
            "<option>None</option>" +
            this.session.data.linkFields.map(field => '<option value="' + field + '">' + this.titleize(field) + "</option>").join("\n"))
        .val(this.session.style.widgets["link-color-variable"]);
        try {
            // TODO:: Refactoring asses need for this
            // this.updateThresholdHistogram();
            console.log('updateThresholdHistogram called');
        } catch (error) {
            console.error(error);
            $("#loading-information-modal").hide();
        }

        console.log('----- finishUp -- setLinkVisibility before updating network');

        this.setLinkVisibility(true);

        // $("#SettingsTab").attr("data-target", "#global-settings-modal");

        console.log('----- finishUp -- updateNetworkVisuals');
       
        this.updateNetworkVisuals(true);

        // TODO is this needed?
        // setTimeout(() => {
            // if(this.debugMode) {
            //     console.log('ilaunching view: ',this.session.style.widgets['default-view']);
            // }
            // console.log('----- finishUp called Launch Emit');

            // this.launchView(this.session.style.widgets['default-view']);

            // TODO:: Do we need this?
            //this.launchView('Aggregate');
            //setTimeout(() => { $('#overlay button').click()}, 100)
            // currently loading all views isn't ready and is leading to bugs where default data is seeping in when new data is loaded
            //delayFunction(10, loadOtherViews) 
            // function convertName(s: string) {
            //     // can't do alignment view yet;
            //     if (s == 'geo_map') {
            //         return 'Map';
            //     } else if (s == 'table') {
            //         return 'Table'
            //     } else if (s == 'timeline') {
            //         return 'Epi Curve' 
            //     } else if (s == '2d_network') {
            //         return '2D Network'
            //     } else if (s == 'sequences') {
            //         //return 'Alignment View';
            //         return false;
            //         // need to add crosstab as well and fix alignment view; they are not being added to cs.session.layout.content;
            //         // on another note it doesn't close all previous view when new data is added from overlay
            //     } else if (s == 'phylogenetic_tree') {
            //         return 'Phylogenetic Tree'
            //     } else {
            //         console.log(`view ${s} is not currently defined`);
            //         return false;
            //     }
            // }
            // async function delayFunction(x, callback) {
            //     await new Promise(resolve => setTimeout(resolve, x)).then(() => {
            //         callback();
            //     })
            // }
            // async function loadOtherViews() {
            //     this.session.layout.content.forEach(async view => {
            //         let viewName = convertName(view.type)
            //         if (view.type == this.session.style.widgets['default-view']) {
            //             return;
            //         } else if (viewName){
            //             this.visuals.microbeTrace.Viewclick(viewName);
            //         }
            //         if (viewName == 'Epi Curve') {
            //             this.visuals.epiCurve.viewActive = false;
            //         }
            //     })
            //     this.visuals.microbeTrace.Viewclick(convertName( this.session.style.widgets['default-view']))
            // }

        // }, 1000);
        $(".hideForHIVTrace").css("display", "flex");
        this.store.updatecurrentThresholdStepSize(this.session.style.widgets["default-distance-metric"]);
    };


    updateNetworkVisuals(silent: boolean = false) {
        this.tagClusters().then(() => {
          this.setClusterVisibility(true);
          this.setNodeVisibility(true);
          this.setLinkVisibility(true);
          this.updateStatistics();
          if (!silent) this.store.setNetworkUpdated(true);
          console.log('---- Update network visuals end');

          console.log('---- Update network visuals end isFullyLoaded: ', this.session.network.isFullyLoaded);
            // If network wasn't loaded already, launch default view
            if (!this.session.network.isFullyLoaded) {
                this.session.meta.loadTime = Date.now() - this.session.meta.startTime;
                console.log("Total load time Update Network:", this.session.meta.loadTime.toLocaleString(), "ms");
                this.launchView(this.session.style.widgets['default-view']);
                console.log('---- Update network visuals end Total ');
            }
        //   $(document).trigger("node-visibility");
        //   $(document).trigger("network-visuals-updated");
        });
      }

    foldMultiSelect() {
        this.foldRaces();
        this.foldExposures();
    }

    foldRaces() {
        if(this.session.data.nodeFields.find(x => x === "Race")){
            return;
        }

        this.session.data.nodeFields.push("Race");
        this.session.data.nodeFields.push("RaceDetails");

        const races: { id: string, displayValue: string }[] = [
            { id: "RaceAsian", displayValue: "Asian" },
            { id: "RaceAmericanIndian", displayValue: "American Indian" },
            { id: "RaceBlack", displayValue: "Black" },
            { id: "RaceWhite", displayValue: "White" },
            { id: "RaceNativeHawaiian", displayValue: "Native Hawaiian" }
        ];

        if (this.session.data.nodes) {

            this.session.data.nodes.forEach(node => {
                if (!node.Race) {

                    let selectedRace: string = "";
                    const raceDetails: string[] = [];

                    races.forEach(race => {
                        if (node[race.id] && node[race.id].toLowerCase() === "true") {
                            
                            raceDetails.push(race.displayValue);

                            if (!selectedRace) {
                                selectedRace = race.displayValue;
                            } else {
                                selectedRace = "Mixed";
                            }
                        }

                        //Remove race properties
                        delete node[race.id];
                    });

                    node.Race = selectedRace;
                    node.RaceDetails = raceDetails.join(" | ");
                }
            })
        }

        //Remove race fields from nodeFields
        races.forEach(race=>{
            this.session.data.nodeFields = this.session.data.nodeFields.filter(x=>x != race.id);
        })

    }

    foldExposures(){
        if(this.session.data.nodeFields.find(x => x === "Exposure")){
            return;
        }

        this.session.data.nodeFields.push("Exposure");
        this.session.data.nodeFields.push("ExposureDetails");

        const exposures: { id: string, displayValue: string }[] = [
            { id: "ExposureInfoDomesticTraveled", displayValue: "Domestic Traveled"},
            { id: "ExposureInfoInternationalTraveled", displayValue: "International Traveled"},
            { id: "ExposureInfoCorrectionalFacility", displayValue: "Correctional Facility"},
            { id: "ExposureInfoCovidAnimal", displayValue: "Covid Animal"},
            { id: "ExposureInfoCruiseShipTraveled", displayValue: "Cruise Ship Traveled"},
            { id: "ExposureInfoWorkplace", displayValue: "Workplace"},
            { id: "ExposureInfoWorkplaceIsCriticalInfra", displayValue: "Workplace Is Critical Infra"},
            { id: "ExposureInfoWorkplaceSetting", displayValue: "Workplace Setting"},
            { id: "ExposureInfoAdultLivingFacility", displayValue: "Adult Living Facility"},
            { id: "ExposureInfoSchool", displayValue: "School"},
            { id: "ExposureInfoKnownCovid19ContactnCoVID", displayValue: "Known Covid19 Contact nCoVID"}            
        ];

        if (this.session.data.nodes) {

            this.session.data.nodes.forEach((node, index) => {
                if (!node.Exposure) {

                    let selectedRace: string = "";
                    const exposureDetails: string[] = [];

                    exposures.forEach(exposure => {
                        if (exposure.id != "ExposureInfoWorkplaceIsCriticalInfra" && 
                            exposure.id != "ExposureInfoWorkplaceSetting" && 
                            node[exposure.id] && node[exposure.id].toLowerCase() === "true") {
                            
                            if(exposure.id === "ExposureInfoWorkplace"){
                                exposureDetails.push(`${exposure.displayValue} {"Is the workplace critical infrastructure" : "${this.session.data.nodes[index].ExposureInfoWorkplaceIsCriticalInfra}", "Workplace Setting" : "${this.session.data.nodes[index].ExposureInfoWorkplaceSetting}"}`);
                            }
                            else{
                                exposureDetails.push(exposure.displayValue);
                            }

                            if (!selectedRace) {
                                selectedRace = exposure.displayValue;
                            } else {
                                selectedRace = "Multiple";
                            }
                        }

                        //Remove exposure properties
                        delete node[exposure.id];
                    });

                    node.Exposure = selectedRace;
                    node.ExposureDetails = exposureDetails.join(" | ");
                }
            })
        }

        //Remove exposure fields from nodeFields
        exposures.forEach(exposure=>{
            this.session.data.nodeFields = this.session.data.nodeFields.filter(x=>x != exposure.id);
        })
    }

    /**
     * Gets a list of all visible node objects
     * @param {boolean} [copy=false] - optional boolean value to set if you want to deepcopy the nodes
     * @returns a list of node objects
     */    
    getVisibleNodes(copy: any = false) {
        let nodes = this.session.data.nodeFilteredValues;
        let n = nodes.length;
        let out = [];
        for (let i = 0; i < n; i++) {
            const node = nodes[i];
            if (node.visible) {
                if (copy) {
                    out.push(JSON.parse(JSON.stringify(node)));
                } else {
                    out.push(node);
                }
            }
        }
        return out;
    };

    /**
     * Gets a list of all visible links objects; Similar to twoD.getVlinks(), and twoD.getLLinks()
     * 
     * A link that has multiple origin is stored as a single object
     * 
     * Each link's source and target are strings of the node _id
     * @param {boolean} [copy=false] - optional boolean value to set if you want to deepcopy the links
     * @returns a array of link objects;
     */    
    getVisibleLinks(copy: any = false) {
        let links = this.session.data.links;
        let n = links.length;
        let out = [],
            link = null;
        if (copy) {
            for (let i = 0; i < n; i++) {
                link = links[i];
                if (link.visible) out.push(JSON.parse(JSON.stringify(link)));
            }
        } else {
            for (let j = 0; j < n; j++) {
                link = links[j];
                if (link.visible) out.push(link);
            }
        }
        if(this.debugMode) {
            console.log('get visible links: ', _.cloneDeep(out));
        }
        return out;
    };

    /**
     * Gets a list of all visible cluster objects
     * @param {boolean} [copy=false] - optional boolean value to set if you want to deepcopy the cluster
     * @returns a list of cluster objects
     */
    getVisibleClusters(copy: any = false) {
        let clusters = this.session.data.clusters;
        if(this.debugMode) {
            console.log('get vis: ', clusters);
        }
        const n = clusters.length;
        const out = [];
        let cluster = null;
        if (copy) {
            for (let i = 0; i < n; i++) {
                cluster = clusters[i];
                if (cluster.visible) out.push(JSON.parse(JSON.stringify(cluster)));
            }
        } else {
            for (let j = 0; j < n; j++) {
                cluster = clusters[j];
                if (cluster.visible) out.push(cluster);
            }
        }
        return out;
    };

    /**
     * updates the network statistics table with number of visible nodes, visible links, clusters, and selected links
     * @returns undefined
     */
    updateStatistics() {

        if ($("#network-statistics-hide").is(":checked")) return;
        let vnodes = this.getVisibleNodes();
        let vlinks = this.getVisibleLinks();
        console.log('vLinksStats', vlinks.length);
        let linkCount = 0;
        let clusterCount = 0;
        if (this.session.style.widgets["timeline-date-field"] == 'None') {
            linkCount = vlinks.length;
            // const minSize = this.session.style.widgets['cluster-minimum-size'];
            clusterCount = this.session.data.clusters.filter(
              cluster => cluster.visible && cluster.nodes > 1).length;
        } else {
            let n = vlinks.length;
            for (let i = 0; i < n; i++) {
                const src = vnodes.find(d => d._id == vlinks[i].source || d.id == vlinks[i].source);
                const tgt = vnodes.find(d => d._id == vlinks[i].target || d.id == vlinks[i].target);
                if (src && tgt) linkCount++;
            }
            
            n = vnodes.length;
            const clusters = {};
            for (let i = 0; i < n; i++) {
                const id = vnodes[i].cluster;
                if (clusters[id]) clusters[id]++;
                else clusters[id] = 1;
            }
            clusterCount = this.session.data.clusters.filter(cluster => clusters[cluster.id] && clusters[cluster.id]>2 && cluster.visible && cluster.nodes > 1).length;

        }
        const singletons = vnodes.filter(d => d.degree == 0).length;
        $("#numberOfSelectedNodes").text(vnodes.filter(d => d.selected).length.toLocaleString());
        $("#numberOfNodes").text(vnodes.length.toLocaleString());
        $("#numberOfVisibleLinks").text(linkCount.toLocaleString());
        $("#numberOfSingletonNodes").text(singletons.toLocaleString());
        $("#numberOfDisjointComponents").text(clusterCount);
    };

   /**
     * Delegates creation of the node color scales to ColorMappingService.
     * The rest of the code that was here (big D3 logic, etc.) is removed.
     */
    public createNodeColorMap() {
        // 1) Gather the parameters from session & temp
        const nodeColorVariable = this.session.style.widgets['node-color-variable'];
        const nodes = this.session.data.nodes;
        
        // The arrays and tables you use to store color config
        const nodeColors = this.session.style.nodeColors;                 // e.g. [ "#1f77b4", ... ]
        const nodeAlphas = this.session.style.nodeAlphas;                 // e.g. [ 1, 1, ... ]
        const nodeColorsTable = this.session.style.nodeColorsTable;       // e.g. { varName: [ ... ] }
        const nodeColorsTableKeys = this.session.style.nodeColorsTableKeys;
        const nodeColorsTableHistory = this.session.style.nodeColorsTableHistory;
    
        // 2) Call your new colorMappingService
        const result = this.colorMappingService.createNodeColorMap(
        nodes,
        nodeColorVariable,
        nodeColors,
        nodeAlphas,
        nodeColorsTable,
        nodeColorsTableKeys,
        nodeColorsTableHistory,
        this.debugMode
        );
    
        // 3) Store the results back into session & temp
        this.temp.style.nodeColorMap = result.colorMap;
        this.temp.style.nodeAlphaMap = result.alphaMap;
        
        // And also store the updated arrays/tables
        this.session.style.nodeColors          = result.updatedNodeColors;
        this.session.style.nodeAlphas          = result.updatedNodeAlphas;
        this.session.style.nodeColorsTable     = result.updatedColorsTable;
        this.session.style.nodeColorsTableKeys = result.updatedColorsTableKeys;
        this.session.style.nodeColorsTableHistory = result.updatedColorsTableHistory;
    
        // 4) Return the aggregates (if needed by your caller)
        return result.aggregates;
    }

    /**
	 * updates the functions that set the color and transparency of the links [commonService.temp.style.linkColorMap() and commonService.temp.style.linkAlphaMap()]
	 * @returns {Object} where keys are the values to group (ie. origin A, origin B) and values are counts of the number of links for each key
	 */
    public createLinkColorMap() {

        // 1) Gather
        const linkColorVariable = this.session.style.widgets['link-color-variable'];

        console.log('create link color map: ', linkColorVariable);

        if (linkColorVariable == "None") {
            this.temp.style.linkColorMap = () => this.session.style.widgets["link-color"];
            this.temp.style.linkAlphaMap = () => 1 - this.session.style.widgets["link-opacity"];
            return [];
        }

        const links = this.getVisibleLinks();
      
        let linkColors;
        if( this.session.style.linkColorsTable && this.session.style.linkColorsTable[linkColorVariable]) {
            linkColors =  this.session.style.linkColorsTable[linkColorVariable];
        } else if (linkColorVariable == 'source' || linkColorVariable == 'target') {
            this.session.style.linkColorsTable = {};
            this.session.style.linkColorsTableKeys = {};
            linkColors =  this.session.style.linkColorsTable[linkColorVariable] = [d3.schemeCategory10[0]].concat(d3.schemeCategory10.slice(2));
            this.session.style.linkColors = [d3.schemeCategory10[0]].concat(d3.schemeCategory10.slice(2));

        } else if (this.session.style.linkColors) {
            this.session.style.linkColorsTable = {};
            this.session.style.linkColorsTableKeys = {};
            linkColors = this.session.style.linkColors;
        }else {
            this.session.style.linkColorsTable = {};
            this.session.style.linkColorsTableKeys = {};
            linkColors =  this.session.style.linkColorsTable[linkColorVariable] = d3.schemePaired;
            this.session.style.linkColors = d3.schemePaired;
        }
        const linkAlphas = this.session.style.linkAlphas;       // e.g. [1, 1, ...]
        const linkColorsTable = this.session.style.linkColorsTable;
        const linkColorsTableKeys = this.session.style.linkColorsTableKeys;
        
        // 2) Delegate to colorMappingService
        const result = this.colorMappingService.createLinkColorMap(
          links,
          linkColorVariable,
          linkColors,
          linkAlphas,
          linkColorsTable,
          linkColorsTableKeys,
          this.debugMode
        );

      
        // 3) Store updated scales back into session & temp
        this.temp.style.linkColorMap = result.colorMap;
        this.temp.style.linkAlphaMap = result.alphaMap;
        
        // store the updated arrays
        this.session.style.linkColors       = result.updatedLinkColors;
        this.session.style.linkAlphas       = result.updatedLinkAlphas;
        this.session.style.linkColorsTable  = result.updatedLinkColorsTable;
        this.session.style.linkColorsTableKeys = result.updatedLinkColorsTableKeys;
      
        console.log('create link color map 1: ', this.session.style.linkColorsTable);
        console.log('create link color map 2: ', this.session.style.linkColorsTableKeys);
        console.log('create link color map 3: ', this.session.style.linkColors);
        console.log('create link color map 4: ', this.session.style.linkAlphas);

        return result.aggregates;
      }
    
    /**
	 * updates the functions that set the color and transparency of the polygons [commonService.temp.style.polygonColorMap() and commonService.temp.style.polygonAlphaMap()]
	 * @returns {Object} where keys are the values to group (ie. subtype B,C,D...) and values are counts of the number of node for each key
	 */
    public createPolygonColorMap() {

        
        // If you store your “polygonGroups” in this.temp, do:
        if (!this.temp.polygonGroups || !this.session.style.widgets['polygons-color-show']) {
            this.temp.style.polygonColorMap = () => this.session.style.widgets['polygon-color'];
            // return [];
        }

        // If this.session.style.widgets['polygons-color-show', we need 
        let polygonGroups = this.temp.polygonGroups || [];
        let polygonColors = this.session.style.polygonColors;

        if (!polygonColors || polygonColors.length === 0) {
            polygonColors = ['#bbccee','#cceeff','#ccddaa','#eeeebb','#ffcccc','#dddddd'];
        }
        const polygonAlphas = this.session.style.polygonAlphas;

        // If polygonGroups length is 0 but polygons-color-show is true, we need to create the groups via going through the visible nodes, and grouping them by cluster id in the format { key: clusterId, values: [nodeId1, nodeId2, ...] }
        if (polygonGroups.length === 0 && this.session.style.widgets['polygons-color-show']) {
            // Create the groups by going through visible nodes, and creating the keys of the group by the unique values of node['polygon-foci']
            const groupMap = new Map();
            this.getVisibleNodes().forEach(node => {
                const polygonFoci = node['polygon-foci'];
                if (!groupMap.has(polygonFoci)) {
                    groupMap.set(polygonFoci, []);
                }
                groupMap.get(polygonFoci).push(node);
            });
            polygonGroups = Array.from(groupMap.entries()).map(([key, values]) => ({
                key,
                values: values.map(node => node.id)
            }));

            this.temp.polygonGroups = polygonGroups;
            this.session.style.widgets['polygon-color-table-visible'] = true;
        }

 

        const result = this.colorMappingService.createPolygonColorMap(
          polygonGroups,
          polygonColors,
          polygonAlphas,
          this.debugMode
        );
      
        this.temp.style.polygonColorMap = result.colorMap;
        this.temp.style.polygonAlphaMap = result.alphaMap;
      
        this.session.style.polygonColors = result.updatedPolygonColors;
        this.session.style.polygonAlphas = result.updatedPolygonAlphas;
          
        return result.aggregates;
      }

    /**
     * Set commonService.session and commonService.temp back to default values; However keeps previous values for commonService.temp.mapData, commonService.session.files,
     * and commonService.session.meta
     */
    reset() {
        //debugger;

        // $("#network-statistics-hide").parent().trigger("click");
        // $("#SettingsTab").attr("data-target", "#sequence-controls-modal");

        const mapData = this.temp.mapData;
        this.temp = this.tempSkeleton();
        this.temp.mapData = mapData;

        const files = this.session.files;
        const meta = this.session.meta;

        this.session = this.sessionSkeleton();


        if(this.debugMode) {
            console.log('reset called: ', this.session.style.linkColors);
        }
                
        this.session.files = files;
        this.session.meta = meta;
        //this.layout.unbind("stateChanged");

        //this.layout.root.replaceChild(this.layout.root.contentItems[0], {
        //    type: "stack",
        //    content: []
        //});
        //this.session.layout.contentItems = [];
        //this.launchView("files");
    };

    /**
     * Sets the following objects back to default values: commonService.temp.matrix, commonService.temp.tree, commonService.session.data, commonService.session.network,
     * commonService.session.style.widgets. Filters 'Demo_outbreak_NodeList.csv' from files
     */
    resetData() {


        const newTempSkeleton = this.tempSkeleton();

        this.temp.matrix = newTempSkeleton.matrix;
        this.temp.trees = newTempSkeleton.trees;

        const files = this.session.files.filter( obj => obj.name !== 'Demo_outbreak_NodeList.csv');
        const meta = this.session.meta;

        if(this.debugMode) {
            console.log('reset data called');
            // console.log('session files1', JSON.stringify(this.visuals.microbeTrace.commonService.session.files));
            console.log('session files2', JSON.stringify(this.session.files));

            console.log('session data files: ', JSON.stringify(files));
            console.log('session data matrix: ', JSON.stringify(this.temp.matrix));
            console.log('session data nodes: ', JSON.stringify(this.session.data.nodes));
            console.log('session data nodes common: ',  JSON.stringify(this.session.data.nodes));
        }


        const newSessionSkeleton = this.sessionSkeleton();
        this.session.data = newSessionSkeleton.data;
        this.session.network = newSessionSkeleton.network;

        this.session.files = files;
        this.session.meta = meta;
        this.session.style.widgets = this.defaultWidgets();
        

        // default values are 'tn93' and 0.015, so not sure if this if statement is every true
        if (this.session.style.widgets['default-distance-metric'] !== 'snps' &&
          this.session.style.widgets['link-threshold'] >= 1) {
          this.visuals.microbeTrace.SelectedLinkThresholdVariable = this.session.style.widgets['link-threshold'];
          this.visuals.microbeTrace.onLinkThresholdChanged();
        }
    };

    getJurisdictions(): Promise<JurisdictionItem[]>{
        const path = `${this.appRootUrl()}assets/common/data/state_county_fips.csv`; // Refactor appRootUrl if necessary
        return this.http.get(path, { responseType: 'text' }).toPromise()
            .then(response => {
                return Papa.parse<JurisdictionItem>(response, { header: true }).data;
            })
            .catch(error => {
                console.error('Error fetching jurisdictions:', error);
                throw error;
            });

        // let options : any = {
        //     observe: "response",
        //     responseType: "blob",
        //     headers: new HttpHeaders({
        //         "Accept": "application/json"
        //     })
        // };

        // return this.http.request("get", path/*, options_*/).pipe(map((fileContents:any)=>{
        //     return Papa.parse(fileContents, {header: true}).data;
        // }));
        // $.get(path, response => {
        //     this.temp.mapData[name] = Papa.parse(response, { header: true }).data;
        //     resolve(this.temp.mapData[name]);
        // });
    }

    getMapData(type): Promise<any> {

        return new Promise(resolve => {

            const parts = type.split(".");
            const name = parts[0],
                format = parts[1];
            if (this.temp.mapData[name]) {
                return resolve(this.temp.mapData[name]);
            }

            let path: string;


            switch (name) {
                case "zipcodes":

                    if (format == "csv") {
                        path = 'assets/common/data/zipcodes.csv';
                        return this.http.get(path, { responseType: 'text' }).toPromise()
                            .then(response => {
                                this.temp.mapData[name] = Papa.parse(response, { header: true }).data;
                                return this.temp.mapData[name];
                            });
                    }
                    break;
                case "countries":
                    if (format == "json") {
                        path = 'assets/common/data/countries.json';
                        return this.http.get(path).toPromise()
                            .then(response => {
                                this.temp.mapData[name] = response;
                                return this.temp.mapData[name];
                            });
                    }
                    break;
                case "counties":
                    if (format == "json") {
                        path = 'assets/common/data/counties.json';
                        return this.http.get(path).toPromise()
                            .then(response => {
                                this.temp.mapData[name] = response;
                                return this.temp.mapData[name];
                            });
                    }
                    break;

                case "states":
                    if (format == "json") {
                        // let path = /*this.appRootUrl() +*/ 'assets/common/data/states.json';

                        path = 'assets/common/data/states.json';
                        return this.http.get(path).toPromise()
                            .then(response => {
                                this.temp.mapData[name] = response;
                                return this.temp.mapData[name];
                            });
                    }
                    break;

                case "land":
                    if (format == "json") {
                        path = 'assets/common/data/land.json';

                        return this.http.get(path).toPromise()
                            .then(response => {
                                this.temp.mapData[name] = response;
                                return this.temp.mapData[name];
                            });

                        // $.get(path, response => {
                        //     resolve(this.temp.mapData[name]);
                        // });
                    }
                    break;

                case "stars":
                    if (format == "json") {
                        let path = /*this.appRootUrl() +*/ 'assets/common/data/stars.json';

                        return this.http.get(path).toPromise()
                            .then(response => {
                                this.temp.mapData[name] = response;
                                return this.temp.mapData[name];
                            });

                        // $.get(path, response => {
                        //     this.temp.mapData[name] = response;
                        //     resolve(this.temp.mapData[name]);
                        // });
                    }
                    break;
            }

            //$.get("data/" + type, response => {
            //    debugger;
            //    if (format == "csv") {
            //        this.temp.mapData[name] = new Papa().parse(response, { header: true }).data;
            //    }
            //    if (format == "json") {
            //        this.temp.mapData[name] = response;
            //    }
            //    resolve(this.temp.mapData[name]);
            //});
        });
    };

    /** 
     * XXXXX Not currently used; not sure future use XXXXX
     * Predicts whether white or black is most contrasting color
     * @param {string} hexcolor - hexcode representation of a color (ie. '#1e9d00')
     * @returns {string} - for hex representation of color (white or black)
     */
    contrastColor(hexcolor) {
        const r = parseInt(hexcolor.substr(1, 2), 16);
        const g = parseInt(hexcolor.substr(3, 2), 16);
        const b = parseInt(hexcolor.substr(5, 2), 16);
        const yiq = r * 299 + g * 587 + b * 114;
        return yiq >= 128000 ? "#000000" : "#ffffff";
    };

    /**
    *  XXXXX Not currently being executed. It's in the codebase but hidden behind comments XXXXX
    *	Returns the last element of an array
    * @param ra - an array (potentially could take other datatypes as well)
    * @returns {any} the last element in an array
    */
    peek(ra) {
        return ra[ra.length - 1];
    };


    launchView(view, callback: any = null) {


        this.LoadViewEvent.emit(view);


    };

    /**
     * Gives the size of a variable in MB
     * @param thing 
     * @returns {string} Size of thing in MB as a string ('4MB')
     */
    size(thing): string {
        if (!thing) thing = this.session;
        return (JSON.stringify(thing).length / 1024 / 1024).toLocaleString() + 'MB';
    };

    /**
     * Converts commonly used titles to a standard output; for less common titles nothing is changed
     * @param {string} title 
     */
    titleize(title: string): string {
        const small = title.toLowerCase().replace(/_/g, " ");
        if (small == "null") return "(Empty)";
        if (small == "id" || small == " id") return "ID";
        if (small == "tn93") return "TN93";
        if (small == "snps") return "SNPs";
        if (small == "2d network") return "2D Network";
        if (small == "3d network") return "3D Network";
        if (small == "geo map") return "Map";
        if (small == "nn") return "Nearest Neighbor";
        return title;
        return small.replace(/(?:^|\s|-)\S/g, c => c.toUpperCase());
    };

    /** 
     * Set up the clusters; new clusters are created as needed; node.cluster is set to cluster id.
     * When a node is found that isn't in tempnodes, a cluster is created and a depth-first search is preformed.
     * During DFS, nodes are added to tempnodes, the node.cluster is assigned and information in cluster is updated
     */
    tagClusters(): Promise<void> {
        return new Promise<void>(resolve => {
            let start = Date.now();
            let clusters = this.session.data.clusters = [];
            let nodes = this.session.data.nodes,
                links = this.session.data.links,
                labels = nodes.map(d => d._id);
            const numNodes = nodes.length,
                numLinks = links.length;
            let tempnodes = this.temp.nodes = [];
            let lsv = this.session.style.widgets["link-sort-variable"];

            /**
             * A function that performs a depth-first search.
             * @param id - The ID of the node to start the search from.
             * @param cluster - The cluster to search in.
             * @returns {void}
             */
            const DFS = (id, cluster) => {
                // if id is found in tempNode exit function
                if (tempnodes.indexOf(id) >= 0) return;
                // else add it, and continue DFS
                tempnodes.push(id);
                let node: any = {};
                for (let i = 0; i < numNodes; i++) {
                    const d = nodes[i];
                    if (!d._id) {
                        d._id = d.id;
                    }
                    if (d._id == id) {
                        node = d;
                        break;
                    }
                }
                const clusterID = cluster.id;
                node.cluster = clusterID;
                cluster.nodes++;
                let row = this.temp.matrix[id];
                if (!row) return;
                for (let j = 0; j < numNodes; j++) {
                    const l = row[labels[j]];
                    if (!l) continue;
                    if (!l.visible) continue;
                    l.cluster = clusterID;
                    cluster.links++;
                    cluster.sum_distances += l[lsv];
                    if (tempnodes.length == numNodes) return;
                    // recursively call DFS on both source and target
                    DFS(l.source, cluster);
                    DFS(l.target, cluster);
                }
            }; // DFS function close

            for (let k = 0; k < numNodes; k++) {
                const d = nodes[k];
                d.degree = 0;
                const id = d._id;

                // if id isn't in temp nodes, add new cluster and do DFS
                if (tempnodes.indexOf(id) == -1) {

                    const cluster = {
                        id: clusters.length > 0 ? clusters.length : 0,
                        nodes: 0,
                        links: 0,
                        sum_distances: 0,
                        links_per_node: 0,
                        mean_genetic_distance: undefined,
                        visible: true
                    };


                    clusters.push(cluster);
                    DFS(id, cluster);
                    if (tempnodes.length == numNodes) break;
                }
            }
            
            if(this.debugMode) {
                console.log("Cluster Tagging time:", (Date.now() - start).toLocaleString(), "ms");
            }

            start = Date.now();
            //This is O(N^3)
            //TODO: Refactor using temp.matrix to get O(N^2)
            for (let m = 0; m < numLinks; m++) {
                const l = links[m];
                if (!l.visible) continue;
                let s = false,
                    t = false;
                for (let n = 0; n < numNodes; n++) {
                    const node = nodes[n];
                    if (l.source == node._id) {
                        s = true;
                        node.degree++;
                    }
                    if (l.target == node._id) {
                        t = true;
                        node.degree++;
                    }
                    if (s && t) break;
                }
            }
            // console.log('clustersssss: ' , clusters);
            clusters.forEach(c => {
                c.links = c.links / 2;
                c.links_per_node = c.links / c.nodes;
                c.mean_genetic_distance = c.sum_distances / 2 / c.links;
            });
            if(this.debugMode) {
                console.log("Degree Computation time:", (Date.now() - start).toLocaleString(), "ms");
            }
            resolve();
        });
    };

    /**
     * Sets node visibility to true when it cluster is visible
     * @param {boolean} silent - whether to trigger node-visibility event (True doesn't trigger, False does)
     */
    setNodeVisibility(silent) {
        console.log('--- Set node viz called');
        let start = Date.now();
        let dateField = this.session.style.widgets["timeline-date-field"];
        let nodes = this.session.data.nodes,
            clusters = this.session.data.clusters;
        let n = nodes.length;
        for (let i = 0; i < n; i++) {
            const node = nodes[i];

            node.visible = true;
            const cluster = clusters[node.cluster];

            if (cluster) {
                // TODO: uncomment if something breaks since this was defaulted to visible
                // cluster.visible = true;
                // console.log('setting cluster vis: ', cluster);
                // console.log('setting node vis: ', node.visible);
                node.visible = node.visible && cluster.visible;
            }
            if (dateField != "None") {
                node.visible = node.visible && moment(this.session.state.timeEnd).toDate() >= moment(node[dateField]).toDate();
            }

            // if (node._id === "NIMR_NG894803") {
            //     console.log('setting node vis 2: ', _.cloneDeep(node));
            // }
        }
        if (!silent) {
            console.log('--- Set node viz NOT SILENT trigger node-visibility');
            $(document).trigger("node-visibility");
        } 

        if(this.debugMode) {
            console.log('--- Set node viz nodes length: ', nodes.filter(n => n.visible).length);
            console.log("Node Visibility Setting time:", (Date.now() - start).toLocaleString(), "ms");        
        }
       
    };

    /**
     * Sets link visibility based on distance, link-threshold, nearestNeighbor setting, etc...
     * @param {boolean} silent - whether to trigger link-visibility event (True doesn't trigger, False does)
     * @param {boolean} [checkCluster=true] - defaults to true; whether to include cluster.visibility when setting link.visibility
     */
    setLinkVisibility(silent: boolean, checkCluster = true) {
        let start = Date.now();
        let metric = this.session.style.widgets["link-sort-variable"],
            threshold = this.session.style.widgets["link-threshold"],
            showNN = this.session.style.widgets["link-show-nn"];
        let links = this.session.data.links;
        let clusters = this.session.data.clusters;
        let n = links.length;
        const globalOriginOrder = this.session.style.widgets['link-origin-array-order']; // Get the global order once
    
    
        if(this.debugMode) {
            console.log(`Setting Link Visibility with ${metric} ${threshold} ${showNN}`);
            console.log('Global Origin Order:', globalOriginOrder); // Log global order
        }
    
          //log all links that are visible and their origin
          console.log('--- visible links1 (Start): ', _.cloneDeep(links.filter(l => l.visible)));
    
    
        for (let i = 0; i < n; i++) {
    
            const link = links[i]; // Reference to the object in session.data.links
    
            // *** Step 1: Use a copy for checks ***
            let finalOrigins = [...link.origin]; // Copy origins for visibility logic
    
            if((link.source === "MZ798055" && link.target === "MZ375596") || (link.source === "MZ375596" && link.target === "MZ798055")){
                console.log('vis link 111 (Start of loop): ', JSON.stringify(link));
                console.log('vis link 111 finalOrigins (Start):', finalOrigins);
            }
    
            let visible = true;
            let overrideNN = false;
            let originWasFiltered = false; // *** Step 2: Add flag ***
    
            // Add back the distance origin to the *copy* if it was removed (Safeguard)
            // Check against original link.origin, add to finalOrigins if needed
            if ( link.distanceOrigin && !link.origin.includes(link.distanceOrigin)) {
                 if (!finalOrigins.includes(link.distanceOrigin)) { // Avoid duplicates in copy
                    finalOrigins.push(link.distanceOrigin);
                 }
            }
            // Also ensure distanceOrigin exists in original if it should
             if ( link.distanceOrigin && !link.origin.includes(link.distanceOrigin)) {
                 link.origin.push(link.distanceOrigin); // Ensure original has it too if missing
             }
    
    
            // Visibility Logic based on metric/threshold/hasDistance
            if (link[metric] == null) { // No distance value for the current metric
                 // Check for non-distance origins using the *copy*
                if (finalOrigins.filter(fileName => !link.distanceOrigin || !fileName.includes(link.distanceOrigin)).length > 0) {
                    // Filter the *copy* for visibility check
                    finalOrigins = finalOrigins.filter(fileName => !link.distanceOrigin || !fileName.includes(link.distanceOrigin));
                    originWasFiltered = true; // *** Mark as filtered ***
                    overrideNN = true;
                    visible = true;
                } else {
                    visible = false;
                }
            } else { // Has a distance value for the current metric
                if (link.hasDistance) {
                    visible = link[metric] <= threshold;
                    if (!visible) {
                         // Distance is above threshold. Check for other origins using the *copy*.
                        if (finalOrigins.filter(fileName => {
                                 const hasAuspice = /[Aa]uspice/.test(fileName); // Preserved Auspice check
                                 const includesDistanceOrigin = link.distanceOrigin && fileName.includes(link.distanceOrigin);
                                 return fileName && !includesDistanceOrigin && !hasAuspice;
                             }).length > 0
                        ) {
                            // Filter the *copy* for visibility check
                             finalOrigins = finalOrigins.filter(fileName => {
                                 const hasAuspice = /[Aa]uspice/.test(fileName);
                                 const includesDistanceOrigin = link.distanceOrigin && fileName.includes(link.distanceOrigin);
                                 return fileName && !includesDistanceOrigin && !hasAuspice;
                             });
                             originWasFiltered = true; // *** Mark as filtered ***
                             overrideNN = true;
                             visible = true;
                         }
                         // If only distance origin existed and it's above threshold, 'visible' remains false.
                    }
                } else {
                    // Has a distance value but hasDistance is false? Treat as always visible.
                    overrideNN = true;
                    visible = true;
                }
            }
    
            // NN Pruning Logic
            if (visible && showNN && !overrideNN) {
                 const wasVisible = visible;
                 visible = visible && link.nn;
                 if (!visible && wasVisible) { // Check if NN made it invisible
                      // Check *copy* for other origins
                     if (finalOrigins.filter(fileName => !link.distanceOrigin || !fileName.includes(link.distanceOrigin)).length > 0) {
                         // Filter the *copy*
                         finalOrigins = finalOrigins.filter(fileName => !link.distanceOrigin || !fileName.includes(link.distanceOrigin));
                         originWasFiltered = true; // *** Mark as filtered ***
                         visible = true; // Keep visible due to non-distance origin
                     }
                 }
            }
    
            // Cluster Visibility Check
            const cluster = clusters[link.cluster];
            if (cluster && checkCluster) {
                visible = visible && cluster.visible;
            }
    
            // --- Step 3: Apply Final Origin Array Conditionally ---
            if (visible) {
                 if (originWasFiltered) {
                     // If filtering occurred *during visibility checks*, assign the filtered result
                     link.origin = finalOrigins;
                 } else if (link.origin.length > 1 && globalOriginOrder.length > 1) {
                      // If NO filtering occurred, it's visible, has multiple origins,
                      // and global order exists, apply the global order.
                     // Check if the link's current origins fundamentally match the global order content
                     // (ignoring order initially) to prevent applying the wrong order set.
                     const linkOriginSet = new Set(link.origin);
                     const globalOrderSet = new Set(globalOriginOrder);
                     if (linkOriginSet.size === globalOrderSet.size && [...linkOriginSet].every(item => globalOrderSet.has(item))) {
                        link.origin = globalOriginOrder;
                     } else {
                        // Log a warning if sets don't match - indicates potential issue in global order management
                         console.warn("Link origin set doesn't match global order set. Not applying global order.", link.id, link.origin, globalOriginOrder);
                         // Keep link.origin as it was after addLink
                     }
                 }
                 // If visible and single origin, or global order not set/relevant,
                 // link.origin correctly retains its value from addLink.
            }
            // If not visible, link.origin is left as is.
    
            link.visible = visible; // Set final visibility
    
            if((link.source === "MZ798055" && link.target === "MZ375596") || (link.source === "MZ375596" && link.target === "MZ798055")){
                console.log('vis link 222 (End of loop): ', JSON.stringify(link));
                 console.log('vis link 222 finalOrigins (End):', finalOrigins);
                 console.log('vis link 222 originWasFiltered:', originWasFiltered);
            }
        } // End of loop
    
        //log all links that are visible and their origin
        console.log('--- visible links (End of setLinkVisibility): ', _.cloneDeep(links.filter(l => l.visible)));
    
        if (!silent) {
            // $(document).trigger("link-visibility");
        }
    
    
        if(this.debugMode) {
            console.log("Link Visibility Setting time:", (Date.now() - start).toLocaleString(), "ms");
        }
    };

    /**
     * Set the visibility of each cluster based on if cluster size is greater than cluster-minimum-size
     * @param {boolean} silent whether to trigger cluster-visibility event (True doesn't trigger, False does)
     */
    setClusterVisibility(silent: boolean) {
        //let start = Date.now();
        let min = this.session.style.widgets["cluster-minimum-size"];
        let clusters = this.session.data.clusters;
        let n = clusters.length;
        console.log('cluster nodes ', clusters);
        for (let i = 0; i < n; i++) {
            const cluster = clusters[i];
           
            cluster.visible = cluster.nodes >= min;
        }
        if (!silent) $(document).trigger("cluster-visibility");//$window.trigger("cluster-visibility");
        // console.log("Cluster Visibility Setting time:", (Date.now() - start).toLocaleString(), "ms");
    };


    // updatePinNodes(copy: boolean) {
    //     let nodes =  this.session.network.nodes;
    //     let n = nodes.length;
    //     for (let i = 0; i < n; i++) {
    //         const node = nodes[i]; 
    //         if (copy && node.fixed) node.preFixed = true;
    //         if (!copy &&  this.session.network.timelineNodes[i].preFixed) {
    //             node.fixed = true;
    //             node.fx = node.x;
    //             node.fy = node.y;
    //         }
    //     }
    // }

    /**
     * @returns {any[]} Returns an array with a copy of each node object // TODO:: Do we need this?
     */
    getNetworkNodes = () => {
        let nodes =  this.session.network.nodes;
        let n = nodes.length;
        let out = [];
          for (let i = 0; i < n; i++) {
            const node = nodes[i];
            out.push(JSON.parse(JSON.stringify(node)));
          }
        return out;
      };

    /**
     * Creates and updates the threshold histogram that is found in global settings.
     * Clicking on the histogram will update the link threshold
     * @param [histogram] - optional parameter
     */
    async updateThresholdHistogram(histogram?: any) {

        let width = 260,
        height = 48,
        svg = null;

        // Update histogram so that it can be altered outside of the main wrapper 
        if(histogram){
            this.thresholdHistogram = histogram;
        }
        
        svg = d3
        .select(this.thresholdHistogram)
        .html(null)
        .attr("width", width)
        .attr("height", height);

        // add all link distances to data, find max and min distances
        let lsv = this.session.style.widgets["link-sort-variable"],
            n = this.session.data.links.length,
            max = Number.MIN_SAFE_INTEGER,
            min = Number.MAX_SAFE_INTEGER,
            data = Array(n),
            dist = null;
        for (let i = 0; i < n; i++) {
            dist = this.session.data.links[i][lsv];
            data[i] = dist;
            if (dist < min) min = dist;
            if (dist > max) max = dist;
        }

        // Add all link distances to data, find max and min distances
        // const links = this.session.data.links;
        // const lsv = this.session.style.widgets["link-sort-variable"];
        // const n = links.length;
        // let max = -Infinity;
        // let min = Infinity;
        // const data: number[] = new Array(n);
        // let dist: number;

        // First pass: Compute min and max distances without storing them in a separate array
        // for (let i = 0; i < n; i++) {
        //     const dist = typeof links[i][lsv] === 'string' ? parseFloat(links[i][lsv]) : links[i][lsv];

        //     // Update min and max
        //     if (dist < min) {
        //         min = dist;
        //     }
        //     if (dist > max) {
        //         max = dist;
        //     }
        // }

        
        let range = max - min;
        let ticks = 40;

        const x = d3
            .scaleLinear()
            .domain([min, max])
            .range([0, width]);

        const bins = d3
            .histogram()
            .domain((x as any).domain())
            .thresholds(x.ticks(ticks))(data);

        const y = d3
            .scaleLinear()
            .domain([0, d3.max(bins, d => (d as any).length)])
            .range([height, 0]);

        const bar = svg
            .selectAll(".bar")
            .data(bins)
            .enter()
            .append("g")
            .attr("class", "bar")
            .attr("transform", d => "translate(" + x(d.x0) + "," + y(d.length) + ")");

        bar
            .append("rect")
            .attr("x", 1)
            .attr("width", 6)
            .attr("height", d => height - y(d.length));

        let that = this;

        /**
         * Uses the position on the histogram to set the link thresehold value
         */
        function updateThreshold() {
            let xc = (d3 as any).mouse(svg.node())[0];
            let decimalPlaces = (that.session.style.widgets['default-distance-metric'].toLowerCase() === "tn93") ? 3 : 0;

            that.session.style.widgets["link-threshold"] = (xc / width) * range * 1.05 + min;
            $("#link-threshold").val(parseFloat(that.session.style.widgets["link-threshold"].toFixed(decimalPlaces)));
        }

        svg.on("click", () => {
            updateThreshold();
            this._debouncedUpdateNetworkVisuals();
        });

        svg.on("mouseover", () => {
            let xc = (d3 as any).mouse(svg.node())[0];
            $('#filtering-threshold').prop('title', "Whats the maximum genetic distance you're willing to call a link? " + ((this.session.style.widgets['default-distance-metric'].toLowerCase() === "tn93") ? ((xc / width) * range * 1.05 + min).toLocaleString() : Math.round(((xc / width) * range * 1.05 + min)).toLocaleString()));
          });

        svg.on("mousedown", () => {
            (d3 as any).event.preventDefault();
            svg.on("mousemove", updateThreshold);
            svg.on("mouseup mouseleave", () => {
                this._debouncedUpdateNetworkVisuals();
                svg
                    .on("mousemove", null)
                    .on("mouseup", null)
                    .on("mouseleave", null);
            });
        });

        data = [];

    };

}

export interface JurisdictionItem{
    jurisdiction_com_code: string | undefined;
    jurisdiction_com_name: string | undefined;
    subjurisdiction_code: string | undefined;
    subjurisdiction_name: string | undefined;
}