import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import * as d3 from 'd3';

export interface ExportOptions {
  filename: string;
  filetype: string;
  scale: number;
  quality: number;
}

@Injectable({
  providedIn: 'root',
})
export class SessionService {


  // Observables for external watchers
  private exportRequestedSource = new Subject<void>();
  exportRequested$ = this.exportRequestedSource.asObservable();

  // Example: Could store linkThreshold or networkUpdated as BehaviorSubjects here
  // if you prefer them at the "session" level
  private _linkThreshold$ = new BehaviorSubject<number>(0.015);
  linkThreshold$ = this._linkThreshold$.asObservable();

  watermark: any = 'data:image/png;base64,iVBORw0KGgoAAAAN';
  HXB2: any = 'T';

  constructor() {}

  // ---------------------------
  // 1) Data skeleton
  // ---------------------------
  dataSkeleton() {
    return {
      nodes: [],
      links: [],
      unoNodes: [],
      unoLinks: [],
      clusters: [],
      nodeFields: ['index', '_id', 'selected', 'cluster', 'visible', 'degree', 'origin'],
      nodeExclusions: [],
      linkFields: ['index', 'source', 'target', 'distance', 'visible', 'cluster', 'origin', 'nn', 'directed'],
      clusterFields: [
        'id', 'nodes', 'links', 'sum_distances', 'links_per_node', 'mean_genetic_distance', 'visible'
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
      // truncated for brevity
      reference: 'CCTCAGGTCACTCTTTGGCAACGACCCCTCGTCACAATAAAGATAGG...'  
    };
  }

  // ---------------------------
  // 2) Default widget values
  // ---------------------------
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
        'alignView-rulerMinorInterval': 20,
        'alignView-selectedSize': 'l',
        'alignView-showMiniMap': true,
        'alignView-sortField': 'index',
        'alignView-spanWidth': 10,
        'alignView-spanHeight': 16,
        'alignView-topDisplay': 'logo',
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
        'link-width-reciprocal': true,
        'link-origin-array-order': [],
        'map-basemap-show': false,
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
        "node-radius-max": 100,
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

  // ---------------------------
  // 3) Session skeleton
  // ---------------------------
  sessionSkeleton() {
    return {
      data: this.dataSkeleton(),
      files: [],
      layout: {
        content: [{ type: 'files' }],
        type: 'stack'
      },
      messages: [],
      meta: {
        loadTime: 0,
        readyTime: Date.now(),
        startTime: 0,
        anySequences: false
      },
      network: {
        allPinned: false,
        timelinePinned: false,
        nodes: [],
        timelineNodes: [],
        initialLoad: false,
        launched: false
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
        nodeColorsTableHistory: { 'null': '#EAE553' },
        nodeColorsTableKeys: {},
        linkColorsTable: {},
        linkColorsTableKeys: {},
        nodeSymbols: [
          'ellipse', 'triangle', 'rectangle', 'barrel', 'rhomboid',
          'diamond', 'pentagon', 'hexagon', 'heptagon', 'octagon', 'star', 'tag', 'vee'
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
      timeline: 0,
      warnings: []
    };
  }

  // ---------------------------
  // 4) Temp skeleton
  // ---------------------------
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

  // The "active" session, if you want a single authoritative object
  // Or you might store it as a BehaviorSubject, etc.
  public session = this.sessionSkeleton();
  public temp = this.tempSkeleton();

  // ---------------------------
  // 5) Export Options + Observables
  // ---------------------------
  private exportOptions: ExportOptions = {
    filename: 'network_export',
    filetype: 'png',
    scale: 1,
    quality: 0.92
  };

  setExportOptions(options: ExportOptions): void {
    this.exportOptions = { ...options };
  }

  getExportOptions(): ExportOptions {
    return this.exportOptions;
  }

  requestExport(): void {
    this.exportRequestedSource.next();
  }

  // Example of controlling the link threshold from here
  setLinkThreshold(newVal: number) {
    this.session.style.widgets['link-threshold'] = newVal;
    this._linkThreshold$.next(newVal);
  }
  get linkThreshold() {
    return this._linkThreshold$.value;
  }
}
