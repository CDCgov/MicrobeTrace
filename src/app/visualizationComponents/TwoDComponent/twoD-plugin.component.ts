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
//import { CustomShapes } from '@app/helperClasses/customShapes';
import { BaseComponentDirective } from '@app/base-component.directive';
import { saveSvgAsPng } from 'save-svg-as-png';
import { ComponentContainer } from 'golden-layout';
import { GoogleTagManagerService } from 'angular-google-tag-manager';
import { GraphData } from './data';
import { getCustomNodeShapeData, getCustomNodeShapeVectorData, isCustomNodeShape as isCustomNodeIconShape, resolveNodeShapeCytoscapeShape as resolveCustomNodeIconCytoscapeShape, resolveNodeShapeForNode, resolveNodeShapeKey } from '@app/contactTraceCommonServices/node-shapes';
import cytoscape, { Core, Style } from 'cytoscape';
import svg from 'cytoscape-svg';
import { Subject, Subscription, takeUntil } from 'rxjs';
//import fcose from 'cytoscape-fcose';
import * as d3f from 'd3-force';
import { CommonStoreService } from '@app/contactTraceCommonServices/common-store.services';
import { ExportService, ExportOptions } from '@app/contactTraceCommonServices/export.service';
import { NgZone } from '@angular/core'; 
import {
    StyleKeyTableAlphaRequest,
    StyleKeyTableColorChange,
    StyleKeyTableColumnNameChange,
    StyleKeyTableRow,
    StyleKeyTableRowNameChange,
    StyleKeyTableSortColumn
} from '../KeyTablesComponent/style-key-table.component';
import { buildThresholdConnectedComponents } from '@app/contactTraceCommonServices/threshold-analysis';
import { buildPieChartSvgDataUri, PieChartSlice } from '@app/contactTraceCommonServices/pie-chart-utils';

interface CustomNodeSvgExportReplacement {
    exportHeight: number;
    exportWidth: number;
    exportX: number;
    exportY: number;
    fillColor: string;
    fillPath: string;
    path: string;
    strokeColor: string;
    strokeWidth: number;
    width: number;
    height: number;
}

type PolygonColorTableDisplayMode = 'Show' | 'Dock' | 'Hide';

@Component({
    selector: 'TwoDComponent',
    templateUrl: './twoD-plugin.component.html',
    styleUrls: ['./twoD-plugin.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class TwoDComponent extends BaseComponentDirective implements OnInit, MicobeTraceNextPluginEvents, OnDestroy {
    @Output() DisplayGlobalSettingsDialogEvent = new EventEmitter();

    // Reference to the Cytoscape container
    @ViewChild('cy', { static: false }) cyContainer: ElementRef;
    @ViewChild('exportContainer') exportContainer: ElementRef;
    @ViewChild('polygonColorTable') polygonColorTable!: ElementRef;
    @ViewChild('networkStats') networkStatisticsTable!: ElementRef;

    // Cytoscape core instance
    cy: Core;
    vizLoaded = true;
    nodePositions: Map<string, { x: number; y: number }> = new Map();
    private nodeDataById: Map<string, any> = new Map();
    data;
    pendingPartialUpdate = false;
    rerenderTimeout: any;
    private isDestroyed = false;
    layoutParallelNodesPerColumn = 4;
    debugMode = false;
    overideTransparency = false;
    containerHeight = 800; // or any other number you want
    graphData: GraphData = {
        nodes: [],
        links: []
    };
    selectedNodeId = undefined;
    private readonly collapsedNodeIdPrefix = 'twod-collapse-';
    private nodeCollapseShapeWarningConfirmed = false;
    private nodeCollapseShapeWarningPending = false;

    private getPerformanceNow(): number {
        return typeof performance !== 'undefined' && performance.now
            ? performance.now()
            : Date.now();
    }

    private recordTwoDRenderTiming(name: string, startedAt: number, extra: Record<string, any> = {}) {
        this.commonService.recordPerformanceDuration(
            'render',
            name,
            this.getPerformanceNow() - startedAt,
            {
                view: '2D Network',
                ...extra
            }
        );
    }

    private hasFinitePosition(node: any): boolean {
        return Number.isFinite(Number(node?.x)) && Number.isFinite(Number(node?.y));
    }

    private getNodeLayoutSpacing(): number {
        return Math.max(48, Number(this.widgets?.['node-radius'] || 20) * 3);
    }

    private assignNoLinkGridPositions(nodes: any[], force: boolean = false): void {
        if (!nodes || nodes.length === 0) return;

        const spacing = this.getNodeLayoutSpacing();
        const columns = Math.max(1, Math.ceil(Math.sqrt(nodes.length)));

        nodes.forEach((node, index) => {
            if (!force && this.hasFinitePosition(node)) return;

            node.x = (index % columns) * spacing;
            node.y = Math.floor(index / columns) * spacing;
            node.vx = 0;
            node.vy = 0;
        });
    }

    private getCytoscapeNodeById(): Map<string, cytoscape.NodeSingular> {
        const nodesById = new Map<string, cytoscape.NodeSingular>();
        if (!this.cy) return nodesById;

        this.cy.nodes().forEach(node => {
            nodesById.set(node.id(), node);
        });

        return nodesById;
    }

    private syncVisibleNodePositionsFromCy(nodes: any[] = this.commonService.getVisibleNodes()): void {
        const nodesById = this.getCytoscapeNodeById();

        nodes.forEach(node => {
            const id = node.id || node._id;
            const currentNode = nodesById.get(id);
            if (currentNode) {
                node.x = currentNode.position('x');
                node.y = currentNode.position('y');
            }
        });
    }

    private cacheNodeDataById(nodes: any[]): void {
        this.nodeDataById = new Map();
        (nodes || []).forEach(node => {
            const id = `${node.id || node._id}`;
            if (id) this.nodeDataById.set(id, node);
        });
    }

    private getFullNodeDataForCyNode(node: cytoscape.NodeSingular): any {
        const cachedNode = this.nodeDataById.get(node.id());
        if (!cachedNode) return node.data();

        return {
            ...cachedNode,
            ...node.data()
        };
    }

    private getCyNodeDataValue(node: cytoscape.NodeSingular, field: string): any {
        const cyValue = node.data(field);
        if (cyValue !== undefined) return cyValue;

        const fullNode = this.getFullNodeDataForCyNode(node);
        return fullNode ? fullNode[field] : undefined;
    }

    private normalizeGroupingValue(value: any): string | null {
        const groupValue = Array.isArray(value) ? value[0] : value;

        if (groupValue === undefined || groupValue === null) {
            return null;
        }

        const normalizedGroup = `${groupValue}`.trim();
        if (!normalizedGroup) {
            return null;
        }

        if (normalizedGroup.toLowerCase() === 'null') {
            return null;
        }

        return normalizedGroup;
    }

    private getCyNodeGroupingKey(node: cytoscape.NodeSingular, field: string): string | null {
        return this.normalizeGroupingValue(this.getCyNodeDataValue(node, field));
    }

    private isCytoscapeNodeMetadataValue(value: any): boolean {
        if (value === undefined) return false;
        if (value === null) return true;

        const valueType = typeof value;
        if (valueType === 'string' || valueType === 'number' || valueType === 'boolean') {
            return true;
        }

        return Array.isArray(value) && value.length <= 25 && value.every(item => {
            const itemType = typeof item;
            return item == null || itemType === 'string' || itemType === 'number' || itemType === 'boolean';
        });
    }

    private getCytoscapeNodeMetadata(node: any): Record<string, any> {
        const metadata: Record<string, any> = {};

        this.commonService.getStyleableNodeFields().forEach(field => {
            const value = node?.[field];
            if (this.isCytoscapeNodeMetadataValue(value)) {
                metadata[field] = value;
            }
        });

        return metadata;
    }

    private buildCytoscapeNodeData(node: any, shapeKey: string, parent: any): any {
        return {
            ...this.getCytoscapeNodeMetadata(node),
            id: node.id,
            _id: node._id,
            index: node.index,
            cluster: node.cluster,
            group: node.group,
            parent,
            x: node.x,
            y: node.y,
            visible: node.visible,
            selected: node.selected,
            degree: node.degree,
            label: node.label,
            isCollapsedAggregate: node.isCollapsedAggregate,
            collapsedMemberIds: node.collapsedMemberIds,
            totalCount: node.totalCount,
            counts: node.counts,
            meanInternalDistance: node.meanInternalDistance,
            internalDistancePairCount: node.internalDistancePairCount,
            nodeSize: node.nodeSize,
            aggregateRenderedSize: node.aggregateRenderedSize,
            nodeColor: node.nodeColor,
            bgOpacity: node.bgOpacity,
            pieBackgroundImage: node.pieBackgroundImage,
            borderWidth: node.borderWidth,
            selectedBorderColor: this.widgets['selected-color'],
            fontSize: this.getNodeFontSize(node),
            shape: resolveCustomNodeIconCytoscapeShape(shapeKey),
            shapeKey,
            ...getCustomNodeShapeData(shapeKey, node.nodeColor)
        };
    }

    private yieldToBrowser(): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, 0));
    }

    private shouldChunkLargeNoLinkLayout(): boolean {
        return this.isNoLinkGraph() && !!this.cy && this.cy.nodes().length > 5000;
    }

    private isNoLinkGraph(): boolean {
        return (this.commonService.session.data.links || []).length === 0;
    }

    private shouldSkipSingletonClusterGroups(foci: string, groupCount: number, childCount: number): boolean {
        return this.isNoLinkGraph()
            && foci === 'cluster'
            && childCount > 1000
            && groupCount === childCount;
    }

    private async applyNoLinkGroupedLayout(foci: string): Promise<void> {
        if (!this.cy) return;

        const layoutStart = this.getPerformanceNow();
        const childNodes = this.cy.nodes().filter((node: any) => (
            !node.hasClass('parent') &&
            node.children().length === 0 &&
            !node.hasClass('hidden')
        )).toArray();

        if (childNodes.length === 0) return;

        const groupMap = new Map<string, cytoscape.NodeSingular[]>();
        childNodes.forEach((node: cytoscape.NodeSingular) => {
            const group = this.getCyNodeGroupingKey(node as cytoscape.NodeSingular, foci) ?? '__ungrouped__';

            if (!groupMap.has(group)) groupMap.set(group, []);
            groupMap.get(group).push(node);
        });

        const groups = Array.from(groupMap.entries()).map(([key, values]) => ({ key, values }));
        const spacing = this.getNodeLayoutSpacing();
        const groupColumns = Math.max(1, Math.ceil(Math.sqrt(groups.length)));
        const groupLayouts = groups.map(group => {
            const columns = Math.max(1, Math.ceil(Math.sqrt(group.values.length)));
            return {
                columns,
                rows: Math.max(1, Math.ceil(group.values.length / columns))
            };
        });
        const cellWidth = (Math.max(...groupLayouts.map(layout => layout.columns), 1) + 3) * spacing;
        const cellHeight = (Math.max(...groupLayouts.map(layout => layout.rows), 1) + 3) * spacing;

        const positionUpdates: Array<{ node: cytoscape.NodeSingular; x: number; y: number }> = [];
        groups.forEach((group, groupIndex) => {
            const layout = groupLayouts[groupIndex];
            const groupColumn = groupIndex % groupColumns;
            const groupRow = Math.floor(groupIndex / groupColumns);
            const originX = groupColumn * cellWidth;
            const originY = groupRow * cellHeight;
            const offsetX = ((cellWidth - (layout.columns - 1) * spacing) / 2);
            const offsetY = ((cellHeight - (layout.rows - 1) * spacing) / 2);

            group.values.forEach((node, nodeIndex) => {
                positionUpdates.push({
                    node,
                    x: originX + offsetX + (nodeIndex % layout.columns) * spacing,
                    y: originY + offsetY + Math.floor(nodeIndex / layout.columns) * spacing
                });
            });
        });

        const chunkSize = positionUpdates.length;
        for (let i = 0; i < positionUpdates.length; i += chunkSize) {
            const chunk = positionUpdates.slice(i, i + chunkSize);
            this.cy.batch(() => {
                chunk.forEach(update => {
                    update.node.position({ x: update.x, y: update.y });
                });
            });
            if (i + chunkSize < positionUpdates.length) {
                await this.yieldToBrowser();
            }
        }

        this.syncVisibleNodePositionsFromCy();
        this.fit();
        this.recordTwoDRenderTiming('twoDNoLinkGroupedLayout', layoutStart, {
            groups: groups.length,
            nodes: childNodes.length,
            foci
        });
    }

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
    SelectedPolygonLabelOrientationVariable: 'Right' | 'Left' | 'Top' | 'Bottom' | 'Middle' = 'Top';
    SelectedPolygonLabelSizeVariable: number = 0.0;
    SelectedPolygonGatherValue: number = 0.0;
    CenterPolygonVariable: string = "None";
    SelectedPolygonLabelShowVariable: string = "Hide";
    SelectedPolygonColorShowVariable: string = "Hide";
    SelectedPolygonColorTableShowVariable: string = "Hide";

    OrientationOptions: object = [
        { label: 'Middle', value: 'Middle'},
        { label: 'Top', value: 'Top'},
        { label: 'Bottom', value: 'Bottom'},
        { label: 'Left', value: 'Left'},
        { label: 'Right', value: 'Right'},
    ]
    // Node Tab    
    SelectedNodeLabelOrientationVariable: 'Right' | 'Left' | 'Top' | 'Bottom' | 'Middle' = 'Middle';
    SelectedNodeLabelVariable: string = "None";
    SelectedNodeTooltipVariable: any = "None";
    SelectedNodeRadiusVariable: string = "None";
    SelectedNodeRadiusSizeVariable: number = 50;
    SelectedNodeCollapseTypeVariable: boolean = false;
    SelectedNodeCollapseThresholdDisplayedVariable: number = 0;
    SelectedNodeCollapseMetricLabel: string = 'TN93';
    NodeCollapseThresholdMinDisplayed: number = 0;
    NodeCollapseThresholdMaxDisplayed: number = 1;
    NodeCollapseThresholdStepDisplayed: number = 0.001;

    SelectedNetworkTableTypeVariable: PolygonColorTableDisplayMode = "Dock";
    polygonColorRows: StyleKeyTableRow[] = [];
    polygonColorTableHeaders = { value: '', count: 'Count', frequency: 'Frequency' };

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
    SelectedLinkLengthVariable: any = 50;
    ArrowTypes: any = [
        { label: 'Hide', value: 'Hide' },
        { label: 'Show', value: 'Show' }
    ];

    hideShowOptions: any = [
        { label: 'Show', value: true },
        { label: 'Hide', value: false }
    ];

    readonly polygonColorTableOptions: { label: string; value: PolygonColorTableDisplayMode }[] = [
        { label: 'Show', value: 'Show' },
        { label: 'Dock', value: 'Dock' },
        { label: 'Hide', value: 'Hide' }
    ];

    hideShowOptionsString: any = [
        { label: 'Show', value: 'Show' },
        { label: 'Hide', value: 'Hide' }
    ];
    SelectedLinkArrowTypeVariable: string = "Hide";

    SelectedLinkBidirectionalTypeVariable: string = "Hide";

    // Network 
    NeighborTypes: any = [
        { label: 'Normal', value: 'Normal' },
        { label: 'Highlighted', value: 'Highlighted' }
    ];
    SelectedNetworkNeighborTypeVariable: string = "Normal";

    SelectedNetworkGridLineTypeVariable: string = "Hide";

    SelecetedNetworkLinkStrengthVariable: any = 0.123;
    SelectedNetworkExportFilenameVariable: string = "";

    NetworkExportFileTypeList: any = [
        { label: 'png', value: 'png' },
        { label: 'jpeg', value: 'jpeg' },
        { label: 'webp', value: 'webp' },
        { label: 'svg', value: 'svg' }
    ];

    rerenderOnActive: boolean = false;

    SelectedNetworkExportFileTypeListVariable: string = "png";
    SelectedNetworkExportScaleVariable: any = 1;
    SelectedNetworkExportQualityVariable: any = 0.92;
    CalculatedResolution: string;

    SelectedNodeLabelSizeVariable: any = 16;

    public nodeBorderWidth = 2.0;

    ShowAdvancedExport: boolean = true;
    isPolygonColorTableDocked: boolean = false;

    PolygonColorTableWrapperDialogSettings: DialogSettings = new DialogSettings('#polygon-color-table-wrapper', false);

    Node2DNetworkExportDialogSettings: DialogSettings = new DialogSettings('#network-settings-pane', false);

    ContextSelectedNodeAttributes: { attribute: string, value: string }[] = [];
    private contextMenuNodeId: string | null = null;

    // TODO see if needed after transition to cytoscape
    // zoomScaleExtent: [number, number] = [0.005, 5]; // Minimum zoom of 0.1 and maximum zoom of 2

    //private customShapes: CustomShapes = new CustomShapes();
    //private symbolTableWrapper: HTMLElement | null = null;
    //private linkColorTableWrapper: HTMLElement | null = null;
    //private nodeColorTableWrapper: HTMLElement | null = null;

    private isExportClosed: boolean = false;
    /* XXXXXnot sure if this boolean is necessary; currently exportWork2 is used and does not use isExporting XXXXX */
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
        private exportService: ExportService,
        private zone: NgZone 
    ) {

        super(elRef.nativeElement);

        // this.setExpanded(this.mainSite);

        this.widgets = this.commonService.session.style.widgets;
        this.ensureNodeCollapseWidgetDefaults();

        this.container.on('resize', () => { setTimeout(() => this.fit(), 200)})
        this.container.on('hide', () => { 
            this.viewActive = false; 
            this.cdref.detectChanges();
        })
        this.container.on('show', () => { 
            this.viewActive = true; 
            this.cdref.detectChanges();
            setTimeout(() => {
                if (this.rerenderOnActive) {
                    this._rerender()
                    this.rerenderOnActive = false;
                }
                this.fit()
                this.commonService.onStatisticsChanged("Show");
                this.syncPolygonColorTableVisibility();
            }, 50)
        })

        this.widgets['node-symbol'] = this.mapPreviousShapeNameToCurrent(this.widgets['node-symbol']);

        cytoscape.use(svg);

    }

    private destroy$ = new Subject<void>();

    private isCytoscapeContainerReady(): boolean {
        const element = this.cyContainer?.nativeElement as HTMLElement | undefined;
        if (!element) return false;

        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }

    private isTimelineFilteringActive(): boolean {
        return this.commonService.session.style.widgets["timeline-date-field"] !== 'None';
    }

    private getLinkEndpointId(endpoint: any): string {
        if (endpoint && typeof endpoint === 'object') {
            return String(endpoint._id ?? endpoint.id ?? '');
        }

        return String(endpoint ?? '');
    }

    private getNodeId(node: any): string {
        const id = node?._id ?? node?.id ?? '';
        return typeof id === 'string' ? id : String(id);
    }

    private getSessionNetworkNodes(): any[] {
        const networkNodes = this.commonService.session?.network?.nodes;
        if (Array.isArray(networkNodes) && networkNodes.length > 0) {
            return networkNodes;
        }

        const filteredNodes = this.commonService.session?.data?.nodeFilteredValues;
        if (Array.isArray(filteredNodes) && filteredNodes.length > 0) {
            return filteredNodes;
        }

        const dataNodes = this.commonService.session?.data?.nodes;
        return Array.isArray(dataNodes) ? dataNodes : [];
    }

    private getSessionNetworkNodeByEndpoint(nodes: any[], endpoint: any): any {
        const endpointId = this.getLinkEndpointId(endpoint);
        return nodes.find(node => this.getNodeId(node) === endpointId);
    }

    private isNetworkRendering(): boolean {
        return this.commonService.session?.network?.rendering === true;
    }

    private setNetworkRendering(rendering: boolean): void {
        const network = this.commonService.session?.network;
        if (network) {
            network.rendering = rendering;
        }
    }

    private normalizeNetworkDataForCytoscape(
        networkData: { nodes: any[]; links: any[] },
        warnInvalidLinks = true
    ): Set<string> {
        networkData.nodes.forEach(node => {
            node.id = this.getNodeId(node);
        });

        const nodeIds = new Set(networkData.nodes.map(node => this.getNodeId(node)));

        networkData.links.forEach(link => {
            link.source = this.getLinkEndpointId(link.source);
            link.target = this.getLinkEndpointId(link.target);
        });

        if (warnInvalidLinks) {
            networkData.links.forEach(link => {
                if (!nodeIds.has(link.source)) {
                    console.warn('Link source not found in nodes:', link.source, link);
                }
                if (!nodeIds.has(link.target)) {
                    console.warn('Link target not found in nodes:', link.target, link);
                }
            });
        }

        return nodeIds;
    }

    private getVisibleNetworkDataForRender(filterLinksByVisibleNodes = this.isTimelineFilteringActive()) {
        const nodes = this.commonService.getVisibleNodes();
        let links = this.commonService.getVisibleLinks(true);

        if (filterLinksByVisibleNodes) {
            const visibleNodeIds = new Set(nodes.map(node => String(node._id ?? node.id ?? '')));
            links = links.filter(link =>
                visibleNodeIds.has(this.getLinkEndpointId(link.source)) &&
                visibleNodeIds.has(this.getLinkEndpointId(link.target))
            );
        }

        return { nodes, links };
    }

    private ensureNodeCollapseWidgetDefaults(): void {
        if (!this.widgets) return;
        if (this.widgets['network-node-collapse-enabled'] === undefined || this.widgets['network-node-collapse-enabled'] === null) {
            this.widgets['network-node-collapse-enabled'] = false;
        }
        if (!Number.isFinite(Number(this.widgets['network-node-collapse-threshold']))) {
            this.widgets['network-node-collapse-threshold'] = 0;
        }
    }

    private getNodeCollapseMetric(): string {
        return String(this.widgets?.['link-sort-variable'] || this.widgets?.['default-distance-metric'] || 'distance');
    }

    private getNodeCollapseMetricLabel(metric: string): string {
        const normalizedMetric = String(metric || 'distance').toLowerCase();
        const effectiveMetric = normalizedMetric === 'distance'
            ? String(this.widgets?.['default-distance-metric'] || 'distance').toLowerCase()
            : normalizedMetric;

        if (
            effectiveMetric === 'tn93'
            && String(this.widgets?.['tn93-distance-display-format'] || 'decimal').toLowerCase() === 'percentage'
        ) {
            return 'TN93 (%)';
        }

        return this.commonService.titleize(effectiveMetric);
    }

    private getNodeCollapseRawStep(metric: string): number {
        return String(metric || '').toLowerCase() === 'snps' ||
            String(this.widgets?.['default-distance-metric'] || '').toLowerCase() === 'snps'
            ? 1
            : 0.001;
    }

    private getNodeCollapseThresholdRaw(): number {
        this.ensureNodeCollapseWidgetDefaults();
        return Number(this.widgets['network-node-collapse-threshold']);
    }

    private isNodeCollapseEnabled(): boolean {
        this.ensureNodeCollapseWidgetDefaults();
        return this.widgets['network-node-collapse-enabled'] === true;
    }

    private getNumericMetricValue(link: any, metric: string): number | null {
        const raw = link?.[metric];
        if (typeof raw === 'number') {
            return Number.isFinite(raw) ? raw : null;
        }

        if (typeof raw === 'string' && raw.trim().length > 0) {
            const parsed = Number(raw);
            return Number.isFinite(parsed) ? parsed : null;
        }

        return null;
    }

    private getNumericNodeCollapseDistanceValue(link: any, metric: string): number | null {
        const primaryValue = this.getNumericMetricValue(link, metric);
        if (primaryValue !== null) {
            return primaryValue;
        }

        const selectedMetric = String(this.widgets?.['default-distance-metric'] || '').toLowerCase();
        return selectedMetric !== metric
            ? this.getNumericMetricValue(link, selectedMetric)
            : null;
    }

    private isNodeCollapseDistanceLink(link: any, metric: string): boolean {
        if (link?.hasDistance !== true || this.getNumericNodeCollapseDistanceValue(link, metric) === null) {
            return false;
        }

        const distanceOrigins = this.commonService.getLinkDistanceOrigins?.(link) || [];
        if (distanceOrigins.length > 0) {
            return true;
        }

        const origins = Array.isArray(link?.origin) ? link.origin : [];
        return origins.some((origin: any) => String(origin || '').toLowerCase().includes('distance'));
    }

    private getNodeCollapseDistanceLinks(nodeIds: Set<string>, metric: string): any[] {
        return (this.commonService.session.data.links || []).reduce((acc, link) => {
            const source = this.getLinkEndpointId(link.source);
            const target = this.getLinkEndpointId(link.target);
            const value = this.getNumericNodeCollapseDistanceValue(link, metric);

            if (
                nodeIds.has(source)
                && nodeIds.has(target)
                && this.isNodeCollapseDistanceLink(link, metric)
                && value !== null
            ) {
                acc.push(link[metric] === value ? link : { ...link, [metric]: value });
            }

            return acc;
        }, [] as any[]);
    }

    private updateNodeCollapseThresholdDisplayBounds(): void {
        this.ensureNodeCollapseWidgetDefaults();
        const metric = this.getNodeCollapseMetric();
        const nodeIds = new Set((this.commonService.session.data.nodes || []).map(node => this.getNodeId(node)));
        const values = this.getNodeCollapseDistanceLinks(nodeIds, metric)
            .map(link => this.getNumericNodeCollapseDistanceValue(link, metric))
            .filter((value): value is number => value !== null)
            .sort((a, b) => a - b);

        const storedThreshold = this.getNodeCollapseThresholdRaw();
        const rawStep = this.getNodeCollapseRawStep(metric);
        const rawMin = values.length ? Math.min(0, values[0]) : 0;
        const linkThreshold = Number(this.widgets?.['link-threshold']);
        const rawMax = Number.isFinite(linkThreshold)
            ? Math.max(rawMin, linkThreshold)
            : Math.max(rawMin, rawStep);
        const clampedStoredThreshold = Math.min(Math.max(storedThreshold, rawMin), rawMax);

        if (clampedStoredThreshold !== storedThreshold) {
            this.widgets['network-node-collapse-threshold'] = clampedStoredThreshold;
        }

        this.SelectedNodeCollapseMetricLabel = this.getNodeCollapseMetricLabel(metric);
        this.NodeCollapseThresholdMinDisplayed = this.commonService.toDisplayedDistanceValue(rawMin, metric);
        this.NodeCollapseThresholdMaxDisplayed = this.commonService.toDisplayedDistanceValue(rawMax, metric);
        this.NodeCollapseThresholdStepDisplayed = this.commonService.toDisplayedDistanceValue(rawStep, metric);
        this.SelectedNodeCollapseThresholdDisplayedVariable = this.commonService.toDisplayedDistanceValue(clampedStoredThreshold, metric);
        this.syncNodeCollapseThresholdDomControls();
    }

    private syncNodeCollapseThresholdDomControls(): void {
        const control = $('#network-node-collapse-threshold-input');
        control
            .attr('min', this.NodeCollapseThresholdMinDisplayed)
            .attr('max', this.NodeCollapseThresholdMaxDisplayed)
            .attr('step', this.NodeCollapseThresholdStepDisplayed)
            .val(this.SelectedNodeCollapseThresholdDisplayedVariable);
    }

    private syncNodeCollapseControlsFromWidgets(): void {
        this.ensureNodeCollapseWidgetDefaults();
        this.SelectedNodeCollapseTypeVariable = this.widgets['network-node-collapse-enabled'] === true;
        this.updateNodeCollapseThresholdDisplayBounds();
    }

    private refreshNodeCollapseRender(): void {
        if (!this.viewActive) {
            this.rerenderOnActive = true;
            return;
        }

        void this._rerender(false)
            .finally(() => {
                if (!this.isDestroyed) {
                    this.setNetworkRendering(false);
                }
            });
    }

    private isNonCircleNodeShape(shapeKey: any): boolean {
        const rawShape = String(shapeKey ?? '').trim();
        if (!rawShape) {
            return false;
        }

        return resolveNodeShapeKey(rawShape, rawShape) !== 'ellipse';
    }

    private hasActiveNonCircleNodeShapes(): boolean {
        if (this.cy) {
            const renderedNodes = this.cy.nodes(':visible')
                .filter((node: any) => !this.isGroupNode(node) && !node.data('isCollapsedAggregate'));

            if (renderedNodes.toArray().some((node: any) => (
                this.isNonCircleNodeShape(node.data('shapeKey') || node.data('shape') || node.style('shape'))
            ))) {
                return true;
            }
        }

        const visibleNodes = this.getVisibleNetworkDataForRender().nodes || [];
        return visibleNodes.some((node: any) => (
            !node?.isCollapsedAggregate && this.isNonCircleNodeShape(this.getNodeShape(node))
        ));
    }

    private setNodeCollapseEnabled(enabled: boolean, refreshRender = true): void {
        this.ensureNodeCollapseWidgetDefaults();
        this.widgets['network-node-collapse-enabled'] = enabled === true;
        this.SelectedNodeCollapseTypeVariable = this.widgets['network-node-collapse-enabled'];
        this.updateNodeCollapseThresholdDisplayBounds();
        this.cdref.markForCheck();
        this.cdref.detectChanges();

        if (refreshRender) {
            this.refreshNodeCollapseRender();
        }
    }

    private syncNodeCollapseDisabledControlState(): void {
        this.ensureNodeCollapseWidgetDefaults();
        this.widgets['network-node-collapse-enabled'] = false;
        this.SelectedNodeCollapseTypeVariable = null as any;
        this.updateNodeCollapseThresholdDisplayBounds();
        this.cdref.markForCheck();
        this.cdref.detectChanges();

        setTimeout(() => {
            if (!this.isDestroyed && this.widgets['network-node-collapse-enabled'] !== true) {
                this.setNodeCollapseEnabled(false, false);
            }
        }, 0);
    }

    public onNodeCollapseEnabledChange(enabled: boolean, warnOnNonCircleShapes = false): void {
        this.ensureNodeCollapseWidgetDefaults();
        const shouldCheckShapeWarning = enabled === true
            && warnOnNonCircleShapes
            && !this.nodeCollapseShapeWarningConfirmed;
        const shouldWarnForNonCircleShapes = shouldCheckShapeWarning
            && (this.nodeCollapseShapeWarningPending || this.hasActiveNonCircleNodeShapes());

        if (shouldWarnForNonCircleShapes) {
            this.nodeCollapseShapeWarningPending = true;
            this.syncNodeCollapseDisabledControlState();

            const confirmationHost = this.commonService.visuals.microbeTrace;
            if (confirmationHost?.openNodeCollapseShapeConfirmation) {
                confirmationHost.openNodeCollapseShapeConfirmation(
                    () => {
                        this.nodeCollapseShapeWarningConfirmed = true;
                        this.nodeCollapseShapeWarningPending = false;
                        this.setNodeCollapseEnabled(true);
                    },
                    () => this.syncNodeCollapseDisabledControlState()
                );
                return;
            }
        }

        if (shouldCheckShapeWarning && !shouldWarnForNonCircleShapes) {
            this.nodeCollapseShapeWarningPending = false;
        }

        this.setNodeCollapseEnabled(enabled);
    }

    public onNodeCollapseThresholdDisplayedChange(value: any, syncControl = true): void {
        this.ensureNodeCollapseWidgetDefaults();
        const metric = this.getNodeCollapseMetric();
        const rawDisplayedValue = value && typeof value === 'object' && 'target' in value
            ? (value.target as HTMLInputElement)?.value
            : value;

        if (rawDisplayedValue === null || rawDisplayedValue === undefined || rawDisplayedValue === '') {
            return;
        }

        const displayedValue = Number(rawDisplayedValue);

        if (!Number.isFinite(displayedValue)) {
            return;
        }

        const clampedDisplayedValue = Math.min(
            Math.max(displayedValue, this.NodeCollapseThresholdMinDisplayed),
            this.NodeCollapseThresholdMaxDisplayed
        );
        const rawThreshold = this.commonService.fromDisplayedDistanceValue(clampedDisplayedValue, metric);

        if (!Number.isFinite(rawThreshold)) {
            return;
        }

        this.widgets['network-node-collapse-threshold'] = rawThreshold;
        this.SelectedNodeCollapseThresholdDisplayedVariable = this.commonService.toDisplayedDistanceValue(rawThreshold, metric);
        if (syncControl) {
            this.syncNodeCollapseThresholdDomControls();
        }

        if (this.isNodeCollapseEnabled()) {
            this.refreshNodeCollapseRender();
        }
    }

    public onNodeCollapseThresholdInputBlur(): void {
        const metric = this.getNodeCollapseMetric();
        this.SelectedNodeCollapseThresholdDisplayedVariable = this.commonService.toDisplayedDistanceValue(
            this.getNodeCollapseThresholdRaw(),
            metric
        );
        this.syncNodeCollapseThresholdDomControls();
    }

    private getCollapsedNodeBaseSize(): number {
        const rawSize = Number(this.widgets?.['node-radius']);
        return Number.isFinite(rawSize) && rawSize > 0 ? rawSize : 20;
    }

    private getCollapsedNodeRenderedSize(totalCount: number): number {
        return this.mapNodeSize(this.getCollapsedNodeBaseSize()) * Math.sqrt(Math.max(1, Number(totalCount) || 1));
    }

    private buildCollapsedNodeCounts(memberNodes: any[]): Array<{ label: string; count: number }> {
        const colorVariable = this.widgets['node-color-variable'];

        if (colorVariable === 'None') {
            return [{ label: 'All Nodes', count: memberNodes.length }];
        }

        const counts = new Map<string, number>();
        memberNodes.forEach(node => {
            const rawLabel = node?.[colorVariable];
            const label = rawLabel === undefined || rawLabel === null ? '' : String(rawLabel);
            counts.set(label, (counts.get(label) || 0) + 1);
        });

        return Array.from(counts.entries()).map(([label, count]) => ({ label, count }));
    }

    private getCollapsedPieSlices(counts: Array<{ label: string; count: number }>): PieChartSlice[] {
        const colorVariable = this.widgets['node-color-variable'];
        const fixedColor = this.widgets['node-color'];

        return counts.map(count => ({
            label: count.label,
            count: count.count,
            color: colorVariable === 'None'
                ? fixedColor
                : this.commonService.temp.style.nodeColorMap(count.label),
            alpha: colorVariable === 'None'
                ? 1 - Number(this.widgets['node-opacity'] || 0)
                : this.commonService.temp.style.nodeAlphaMap(count.label)
        }));
    }

    private getCollapsedSolidNodeColor(counts: Array<{ label: string; count: number }>): [string, number] {
        const colorVariable = this.widgets['node-color-variable'];

        if (colorVariable === 'None') {
            return [this.widgets['node-color'], 1 - Number(this.widgets['node-opacity'] || 0)];
        }

        const label = counts[0]?.label ?? '';
        return [
            this.commonService.temp.style.nodeColorMap(label),
            this.commonService.temp.style.nodeAlphaMap(label)
        ];
    }

    private getCollapsedNodeDistanceSummary(
        memberNodes: any[],
        metric: string
    ): { meanInternalDistance: number | null; internalDistancePairCount: number } {
        const memberIds = new Set(memberNodes.map(node => this.getNodeId(node)));
        // Collapse membership is threshold-driven; this summary uses every available member-pair distance.
        const distanceLinks = this.getNodeCollapseDistanceLinks(memberIds, metric);
        const pairValues = new Map<string, number[]>();

        distanceLinks.forEach(link => {
            const source = this.getLinkEndpointId(link.source);
            const target = this.getLinkEndpointId(link.target);

            if (
                source === target ||
                !memberIds.has(source) ||
                !memberIds.has(target)
            ) {
                return;
            }

            const value = this.getNumericNodeCollapseDistanceValue(link, metric);
            if (value === null) {
                return;
            }

            const pairKey = JSON.stringify(source < target ? [source, target] : [target, source]);
            const values = pairValues.get(pairKey) || [];
            values.push(value);
            pairValues.set(pairKey, values);
        });

        const pairMeans = Array.from(pairValues.values())
            .map(values => values.reduce((sum, value) => sum + value, 0) / values.length);

        if (pairMeans.length === 0) {
            return {
                meanInternalDistance: null,
                internalDistancePairCount: 0
            };
        }

        return {
            meanInternalDistance: pairMeans.reduce((sum, value) => sum + value, 0) / pairMeans.length,
            internalDistancePairCount: pairMeans.length
        };
    }

    private createCollapsedAggregateNode(
        memberNodes: any[],
        componentIndex: number,
        metric: string
    ): any {
        const aggregateId = `${this.collapsedNodeIdPrefix}${componentIndex}`;
        const firstMember = memberNodes[0] || {};
        const finiteX = memberNodes.map(node => Number(node.x)).filter(value => Number.isFinite(value));
        const finiteY = memberNodes.map(node => Number(node.y)).filter(value => Number.isFinite(value));
        const cachedPosition = this.nodePositions.get(aggregateId);
        const cachedX = Number(cachedPosition?.x);
        const cachedY = Number(cachedPosition?.y);
        const x = Number.isFinite(cachedX)
            ? cachedX
            : finiteX.length
                ? finiteX.reduce((sum, value) => sum + value, 0) / finiteX.length
                : 0;
        const y = Number.isFinite(cachedY)
            ? cachedY
            : finiteY.length
                ? finiteY.reduce((sum, value) => sum + value, 0) / finiteY.length
                : 0;
        const totalCount = memberNodes.length;
        const nodeSize = this.getCollapsedNodeBaseSize() * Math.sqrt(totalCount);
        const aggregateRenderedSize = this.getCollapsedNodeRenderedSize(totalCount);
        const counts = this.buildCollapsedNodeCounts(memberNodes);
        const slices = this.getCollapsedPieSlices(counts);
        const hasPie = this.widgets['node-color-variable'] !== 'None' && slices.length > 1;
        const [solidColor, solidOpacity] = this.getCollapsedSolidNodeColor(counts);
        const distanceSummary = this.getCollapsedNodeDistanceSummary(memberNodes, metric);

        return {
            ...firstMember,
            id: aggregateId,
            _id: aggregateId,
            index: firstMember.index,
            cluster: undefined,
            group: undefined,
            x,
            y,
            vx: 0,
            vy: 0,
            visible: true,
            selected: false,
            isCollapsedAggregate: true,
            collapsedMemberIds: memberNodes.map(node => this.getNodeId(node)),
            totalCount,
            counts,
            meanInternalDistance: distanceSummary.meanInternalDistance,
            internalDistancePairCount: distanceSummary.internalDistancePairCount,
            label: `${totalCount} nodes`,
            nodeSize,
            aggregateRenderedSize,
            nodeColor: hasPie ? 'transparent' : solidColor,
            bgOpacity: hasPie ? 0 : solidOpacity,
            borderWidth: this.getNodeBorderWidth(firstMember),
            pieBackgroundImage: hasPie
                ? buildPieChartSvgDataUri(`twod-collapse-pie-${componentIndex}`, aggregateRenderedSize, slices)
                : undefined
        };
    }

    private applyNodeCollapseToNetworkData(networkData: { nodes: any[]; links: any[] }): { nodes: any[]; links: any[] } {
        if (!this.isNodeCollapseEnabled()) {
            return networkData;
        }

        const nodes = networkData.nodes || [];
        if (nodes.length === 0) {
            return networkData;
        }

        const metric = this.getNodeCollapseMetric();
        const threshold = this.getNodeCollapseThresholdRaw();
        if (!Number.isFinite(threshold)) {
            return networkData;
        }

        const nodeById = new Map<string, any>();
        nodes.forEach(node => {
            const nodeId = this.getNodeId(node);
            node.id = nodeId;
            nodeById.set(nodeId, node);
        });

        const nodeIds = new Set(nodeById.keys());
        const distanceLinks = this.getNodeCollapseDistanceLinks(nodeIds, metric);
        const summary = buildThresholdConnectedComponents(nodes, distanceLinks, metric, threshold);
        const collapsedComponentIds = new Set<number>();

        summary.components.forEach((component, componentIndex) => {
            if (component.nodeIds.length > 1) {
                collapsedComponentIds.add(componentIndex);
            }
        });

        if (collapsedComponentIds.size === 0) {
            return networkData;
        }

        const renderedNodeIdByOriginalId = new Map<string, string>();
        const renderedNodes: any[] = [];
        const renderedNodeIds = new Set<string>();

        summary.components.forEach((component, componentIndex) => {
            if (!collapsedComponentIds.has(componentIndex)) {
                const node = nodeById.get(component.nodeIds[0]);
                if (node) {
                    renderedNodes.push(node);
                    renderedNodeIds.add(this.getNodeId(node));
                    renderedNodeIdByOriginalId.set(this.getNodeId(node), this.getNodeId(node));
                }
                return;
            }

            const memberNodes = component.nodeIds
                .map(nodeId => nodeById.get(nodeId))
                .filter(Boolean);
            const aggregateNode = this.createCollapsedAggregateNode(memberNodes, componentIndex, metric);
            renderedNodes.push(aggregateNode);
            renderedNodeIds.add(aggregateNode.id);
            component.nodeIds.forEach(nodeId => renderedNodeIdByOriginalId.set(nodeId, aggregateNode.id));
        });

        const renderedLinks = (networkData.links || []).reduce((acc, link, index) => {
            const source = this.getLinkEndpointId(link.source);
            const target = this.getLinkEndpointId(link.target);
            const collapsedSource = renderedNodeIdByOriginalId.get(source) || source;
            const collapsedTarget = renderedNodeIdByOriginalId.get(target) || target;

            if (
                collapsedSource === collapsedTarget ||
                !renderedNodeIds.has(collapsedSource) ||
                !renderedNodeIds.has(collapsedTarget)
            ) {
                return acc;
            }

            acc.push({
                ...link,
                id: link.id ?? `collapsed-link-${index}`,
                source: collapsedSource,
                target: collapsedTarget
            });
            return acc;
        }, [] as any[]);

        return {
            nodes: renderedNodes,
            links: renderedLinks
        };
    }


    ngOnInit() {
        this.commonService.visuals.twoD = this;
        
        // Console log this out to see what the window objetc has like temp
        // const windowKeys = Reflect.ownKeys(window);

        // this.commonService.updateNetwork();

        console.log('--- TwoD ngOnInit called');

        if (this.debugMode) {
            console.log(this.cyContainer);
        }
        this.networkUpdatedSubscription = this.store.networkUpdated$
        .pipe(takeUntil(this.destroy$))
        .subscribe(newPruned => {
            console.log('--- TwoD DATA network updated', newPruned);
            if (this.data && this.store.settingsLoadedValue && newPruned) {
                console.log(`TwoD view to be rerendered.  ${this.viewActive ? 'Updating Now' : 'Updating when view is active'}`);
                if (this.viewActive){
                    this._rerender(false);
                } else {
                    this.rerenderOnActive = true;
                }
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
            this.syncNodeCollapseControlsFromWidgets();
            this.cdref.markForCheck();

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

        if (this.commonService.session.data.nodes.length > 0 && !this.cy) {
            this.onLoadNewData();
        }
      }

  mapDataToCytoscapeElements(data: any, timelineTick=false): cytoscape.ElementsDefinition {

    const mapStart = this.getPerformanceNow();
    console.log('--- TwoD mapDataToCytoscapeElements called');
        // Create a set to track unique parent nodes
    const parentNodes = new Set();

    const edges = data.links.flatMap((link: any) => {
        if ((this.widgets['link-color-variable'] == 'Origin' || this.widgets['link-color-variable'] == 'origin') && link.origin.length > 1) {
            return link.origin.map((originItem: any, index) => ({
                data: {
                    // Include any additional edge-specific data properties
                    ...link,
                    id: index > 0 ? `${link.id}-2`: link.id,
                    source: link.source,
                    target: link.target,
                    lineSelectedColor: this.widgets['selected-color'],
                    label: this.getLinkLabel(link).text, // Existing link label
                    lineColor: this.getLinkColor({origin: originItem}).color, // Default to black if not specified
                    lineOpacity: this.getLinkColor({origin: originItem}).opacity, // Default to fully opaque if not specified
                    width: this.getLinkWidth(link),
                    origin: [originItem],
                    secondLink: index > 0 ? true: false
                }
            }));
        }
        return [{ data: {
            // Include any additional edge-specific data properties
            ...link,
            id: link.id,
            source: link.source,
            target: link.target,
            lineSelectedColor: this.widgets['selected-color'],
            label: this.getLinkLabel(link).text, // Existing link label
            lineColor: this.getLinkColor(link).color, // Default to black if not specified
            lineOpacity: this.getLinkColor(link).opacity, // Default to fully opaque if not specified
            width: this.getLinkWidth(link),
            secondLink: false,
        }}]
    });

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
	            node.borderWidth = this.getNodeBorderWidth(node);
	            const shapeKey = this.getNodeShape(node);
	            const parent = (node.group && this.widgets['polygons-show']) || undefined;
	            return {
	                data: this.buildCytoscapeNodeData(node, shapeKey, parent),
	                position: { 
	                    x:node.x || this.nodePositions.get(node.id)?.x || Math.random() * 500,
	                    y:node.y || this.nodePositions.get(node.id)?.y || Math.random() * 500
	                }
	            }
        } else {
	            node.label = this.getNodeLabel(node);
	            node.nodeSize = Number(this.getNodeSize(node));
	            [node.nodeColor, node.bgOpacity] = this.getNodeColor(node); // <-- Added for dynamic node color
	            node.borderWidth = this.getNodeBorderWidth(node);
	            const shapeKey = this.getNodeShape(node);
	            const parent = (node.group && this.widgets['polygons-show']) || undefined;
	            return {
	                data: this.buildCytoscapeNodeData(node, shapeKey, parent),
	                position: {
	                    x: node.x || this.nodePositions.get(node.id)?.x || Math.random() * 500,
	                    y: node.y || this.nodePositions.get(node.id)?.y || Math.random() * 500
	                  }
                  
            };
        }
    });

    console.log('--- TwoD mapDataToCytoscapeElements nodes done');


    this.recordTwoDRenderTiming('twoDMapElements', mapStart, {
        timelineTick,
        nodes: nodes.length,
        edges: edges.length,
        parentNodes: parentNodes.size
    });

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
                    'color': 'black',
                    'z-index': 10, // Not a standard Cytoscape property, but kept for clarity
                    // 'font-size': 'data(fontSize)' // Ensure this line is included
                }
            },
            {
                selector: 'node[!isParent]',
                css: {
                    'text-valign': (() => {
                        const o = (this.widgets && this.widgets['node-label-orientation']) ? this.widgets['node-label-orientation'].toLowerCase() : 'right';
                        if (o === 'top') return 'top';
                        if (o === 'bottom') return 'bottom';
                        return 'center';
                    })(),
                    'text-halign': (() => {
                        const o = (this.widgets && this.widgets['node-label-orientation']) ? this.widgets['node-label-orientation'].toLowerCase() : 'right';
                        if (o === 'left') return 'left';
                        if (o === 'right') return 'right';
                        return 'center';
                    })(),
                    // @ts-ignore
                    'shape': 'data(shape)'
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
                selector: 'node[!isParent][isCollapsedAggregate][aggregateRenderedSize]',
                css: {
                    'width': 'data(aggregateRenderedSize)',
                    'height': 'data(aggregateRenderedSize)'
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
                selector: 'node[!isParent][iconBackgroundImage]',
                css: {
                    // @ts-ignore
                    'background-image': 'data(iconBackgroundImage)',
                    'background-image-containment': 'over',
                    'background-fit': 'contain',
                    'background-clip': 'node',
                    'background-position-x': '50%',
                    'background-position-y': '50%',
                    'background-repeat': 'no-repeat',
                    // @ts-ignore
                    'background-image-opacity': 'data(bgOpacity)',
                    'background-opacity': 0,
                    'border-width': 0
                }
            },
            {
                selector: 'node[!isParent][pieBackgroundImage]',
                css: {
                    // @ts-ignore
                    'background-image': 'data(pieBackgroundImage)',
                    'background-fit': 'cover',
                    'background-clip': 'node',
                    'background-position-x': '50%',
                    'background-position-y': '50%',
                    'background-repeat': 'no-repeat',
                    'background-color': 'transparent',
                    'background-opacity': 0
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
            {
                selector: 'node[!isParent][nodeColor][iconBackgroundImage]',
                css: {
                    'background-color': '#ffffff',
                    // @ts-ignore
                    'background-opacity': 'data(bgOpacity)'
                }
            },
            // Apply styles only to nodes with fontSize defined
            {
                selector: 'node[!isParent][fontSize]',
                css: {
                    'font-size': 'data(fontSize)'
                }
            },
            {
                selector: 'node[!isParent][shape]',
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
                    'border-width': 'data(borderWidth)',
                    'shape': 'rectangle'
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
                    'curve-style': 'straight'
                    // 'opacity': 'data(opacity)' // Existing opacity
                }
            },
            {
                selector: 'edge[fontSize]',
                css: {
                    'font-size': 'data(fontSize)'
                } // Apply font size change only to edges with font-size defined
            },
            {
                selector: 'edge[secondLink]',
                css: {
                    'line-style': 'dashed',
                    'line-dash-pattern': [10, 10],
                    'line-dash-offset': 5,
                }
            },
            {
                selector: 'edge[!secondLink]',
                css: {
                    'line-style': 'solid',
                }
            },
            {
                selector: 'node:selected[!isParent][!iconBackgroundImage][!pieBackgroundImage]',
                css: {
                    'background-color': 'data(nodeColor)',
                    'border-color': 'data(selectedBorderColor)',
                    'border-width': 3
                }
            },
            {
                selector: 'node:selected[!isParent][iconBackgroundImage]',
                css: {
                    'background-color': '#ffffff',
                    // @ts-ignore
                    'background-opacity': 'data(bgOpacity)',
                    'border-color': 'data(selectedBorderColor)',
                    'border-width': 3
                }
            },
            {
                selector: 'node:selected[!isParent][pieBackgroundImage]',
                css: {
                    'background-color': 'transparent',
                    'background-opacity': 0,
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
        $('#cy').off('contextmenu.twod').on('contextmenu.twod', (e) => e.preventDefault());

        // Debounced function to sync Cytoscape selections with the common service.
        const syncCySelectionToService = _.debounce(() => {
            const selectedNodes = this.cy.nodes(':selected').filter((node: any) => !node.data('isCollapsedAggregate'));
            const selectedIds = new Set(selectedNodes.map(node => node.id()));

            if (this.isNodeCollapseEnabled() && selectedIds.size === 0) {
                return;
            }

            let selectionChanged = false;
            // Sync with the main nodes array
            this.commonService.session.data.nodes.forEach(n => {
                const shouldBeSelected = selectedIds.has(n._id || n.id);
                if (n.selected !== shouldBeSelected) {
                    n.selected = shouldBeSelected;
                    selectionChanged = true;
                }
            });

            // Sync with the filtered nodes array
            this.commonService.session.data.nodeFilteredValues.forEach(n => {
                const shouldBeSelected = selectedIds.has(n._id || n.id);
                if (n.selected !== shouldBeSelected) {
                    n.selected = shouldBeSelected;
                    selectionChanged = true;
                }
            });

            // If the selection state was changed, notify other components.
            if (selectionChanged) {
                $(document).trigger('node-selected');
            }
        }, 100); // Debounce for 100ms to handle rapid events efficiently.

        // Listen for all selection events to trigger the sync.
        this.cy.on('select unselect', 'node', syncCySelectionToService);
        
	        this.cy.on('tap', 'node', (evt) => {
	            const node = evt.target;
	            if (this.debugMode) {
	                console.log('Selected node:', this.getFullNodeDataForCyNode(node));
	            }
            this.hideContextMenu();
    
            // Update selectedNodeId and trigger change detection or re-render if necessary
            this.selectedNodeId = node.id();

            // Update with selected color set in global settings
            node.data('selectedBorderColor', this.widgets['selected-color']);

            this.cy.style().update();
    
        });

	        this.cy.on('cxttap', 'node', (evt) => {
            const node = evt.target;
            if (node.data('isParent') || node.data('isCollapsedAggregate')) {
                return;
            }

            let originalEvent;
            if (evt.originalEvent == undefined) {
                let {x, y} = node.renderedPosition();
                originalEvent = new MouseEvent('cxttap', {clientX: x, clientY: y})
            } else {
                originalEvent= evt.originalEvent as MouseEvent;
            } 

	            this.zone.run(() => {
	                this.showContextMenu(this.getFullNodeDataForCyNode(node), originalEvent, node);
	            });
	        });

        this.cy.on('tap', (evt) => {
            if (evt.target === this.cy) {
                this.hideContextMenu();
            }
        });
    
        this.cy.on('mouseover', 'node', (evt) => {
            // Run UI updates inside Angular's zone
	            this.zone.run(() => {
	                const node = evt.target;
	                this.showNodeTooltip(this.getFullNodeDataForCyNode(node), evt.originalEvent);
                $('html,body').css('cursor', 'grab');
    
                if (this.widgets['node-highlight']) {
                    node.connectedEdges().addClass('highlighted');
                }
            });
        });
    
        this.cy.on('mouseout', 'node', (evt) => {
            // Run UI updates inside Angular's zone
            this.zone.run(() => {
                const node = evt.target;
                this.hideTooltip();
                $('html,body').css('cursor', 'default');
    
                if (this.widgets['node-highlight']) {
                    node.connectedEdges().removeClass('highlighted');
                }
            });
        });
    
        // Edge events
        this.cy.on('mouseover', 'edge', (evt) => {
            this.zone.run(() => {
                const edge = evt.target;
                this.showLinkTooltip(edge.data(), evt.originalEvent);
            });
        });
    
        this.cy.on('mouseout', 'edge', () => {
            this.zone.run(() => {
                this.hideTooltip();
            });  
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
        if (this.commonService.session.network.allPinned) {
            // If nodes are pinned, skip running the force simulation
            return { nodes: [], links: []};
        }
        let visNodes = this.commonService.getVisibleNodes();
        if (initial) {
            const { nodes: laidOutNodes, links: laidOutLinks} = await this.applyGatherForce(10);
            const laidOutNodeById = new Map(laidOutNodes.map(n => [n.id, n]));
            
            this.cy.nodes().forEach(node => {
                const cNode = laidOutNodeById.get(node.id());
                if (cNode) {
                    node.position({ x: cNode.x, y: cNode.y });
                }
            });

            // second iteration leads to better layout, skip if number of nodes > 500
            if (this.commonService.session.data.nodeFilteredValues.length < 500) {
                const { nodes: laidOutNodes3, links: laidOutLinks3} = await this.applyGatherForce(10);
                const laidOutNodeById3 = new Map(laidOutNodes3.map(n => [n.id, n]));
                
                this.cy.nodes().forEach(node => {
                    const cNode = laidOutNodeById3.get(node.id());
                    if (cNode) {
                        node.position({ x: cNode.x, y: cNode.y });
                    }
                });
            }
        }
        
        const { nodes: laidOutNodes2, links: laidOutLinks2, parentNodes: pNodes2 } = await this.applySeparationForce();
        const cyNodeById = this.getCytoscapeNodeById();

        // moves individual (child and independent) nodes
        laidOutNodes2.forEach(node => {
            let cyNode = cyNodeById.get(node.id);
            if (cyNode) {
                cyNode.position({ x: node.x, y: node.y });
            }
        })

        // moves parent (parent and indepent) nodes
        if (this.widgets['polygons-foci'] != 'None') {
            pNodes2.forEach(node => {
                let cyNode = cyNodeById.get(node.id);
                if (cyNode) {
                    cyNode.position({ x: node.x, y: node.y });
                }
            })
        }

        // updates node position values (x, y) stored in commonService 
        this.syncVisibleNodePositionsFromCy(visNodes);

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
        
        let childNodes: {id: string, parentX: any, parentY: any,  x: number, y: number, vx?:number, vy?:number, size: number}[] = [];

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
                    size: node.width(),
                })
            } else {
                childNodes.push({
                    id: node.id(),
                    parentX: 0,
                    parentY: 0,
                    x: node.position('x'),
                    y: node.position('y'),
                    size: node.width(),
                })

            }
        })

        let gatherSimulation = d3.forceSimulation(childNodes)
            .force('charge', d3.forceManyBody().strength(-10))
            .force('link', d3.forceLink(links).id((d: any) => d.id).distance(30))
            .force('center', d3.forceCenter(0, 0))
            .force('collide', d3.forceCollide().radius(d => d.size)) // don't need to use mapNodeSize here since we are using the size of the node from cytoscape instead of from nodeSize
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
        let childNodes: {id: string, parent: any, x: number, y: number, vx?:number, vy?:number, size: number}[] = [];

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
                    size: node.width(),
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
                    size: node.width(),
                })

            }

        })
        if (this.commonService.session.network.allPinned) {
            // If nodes are pinned, skip running the force simulation
            return { nodes: childNodes, links, parentNodes };
        }
        let separationSimulation = await d3.forceSimulation(parentNodes)
            .force('charge', d3.forceManyBody().strength(-30))
            .force('collide', d3.forceCollide().radius(d => d.max_dim/1.5))
            .force('x', d3.forceX().strength(.005))
            .force('y', d3.forceY().strength(.005))
            .stop();

        const parentNodeById = new Map(parentNodes.map(parentNode => [parentNode.id, parentNode]));
                
        let gatherSimulation = d3.forceSimulation(childNodes)
            .force('charge', d3.forceManyBody().strength(-30))
            .force('link', d3.forceLink(links).id((d: any) => d.id).distance(this.SelectedLinkLengthVariable))
            .force('center', d3.forceCenter(0, 0))
            .force('collide', d3.forceCollide().radius(d => d.size)) // don't need to use mapNodeSize here since we are using the size of the node from cytoscape instead of from nodeSize
            .force('x', d3.forceX(d => d.parent == null ? 0 : (parentNodeById.get(d.parent)?.x ?? 0)).strength(d => d.parent == null ? .005 : .1))
            .force('y', d3.forceY(d => d.parent == null ? 0 : (parentNodeById.get(d.parent)?.y ?? 0)).strength(d => d.parent == null ? .005 : .1))
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

    private runStoppedD3Ticks(simulation: any, ticks: number, ticksPerYield: number): Promise<number> {
        const totalTicks = Math.max(0, Math.floor(ticks));
        const batchSize = Math.max(1, Math.floor(ticksPerYield));
        let remainingTicks = totalTicks;
        let batches = 0;

        return new Promise((resolve) => {
            const tickBatch = () => {
                const batchTicks = Math.min(batchSize, remainingTicks);
                if (batchTicks > 0) {
                    simulation.tick(batchTicks);
                    remainingTicks -= batchTicks;
                    batches++;
                }

                if (remainingTicks > 0) {
                    setTimeout(tickBatch, 0);
                } else {
                    resolve(batches);
                }
            };

            tickBatch();
        });
    }

    private getD3TicksPerYield(nodes: any[], links: any[]): number {
        const workUnits = nodes.length + links.length;
        return workUnits >= 12000 ? 1 : 5;
    }

    async precomputePositionsWithD3(nodes: any[], links: any[], ticks:number = 300, initial: boolean = true): Promise<{ nodes: any[]; links: any[]; tickBatches: number; ticksPerYield: number }> {
        if (this.commonService.session.network.allPinned) {
            // If nodes are pinned, skip running the force simulation
            return { nodes, links, tickBatches: 0, ticksPerYield: 0 };
        }
        if (!links || links.length === 0) {
            this.assignNoLinkGridPositions(nodes, initial || nodes.some(node => !this.hasFinitePosition(node)));
            return { nodes, links, tickBatches: 0, ticksPerYield: 0 };
        }
        let simulation;
        if (initial) {
            simulation = d3.forceSimulation(nodes)
                .force('charge', d3.forceManyBody().strength(-30))
                .force('link', d3.forceLink(links).id((d: any) => d.id).distance(this.SelectedLinkLengthVariable))
                .force('center', d3.forceCenter(0, 0))
                .stop(); // Stop auto-stepping so we can control the ticks manually
        } else {
            simulation = d3.forceSimulation(nodes)
                .force('charge', d3.forceManyBody().strength(-30))
                .force('link', d3.forceLink(links).id((d: any) => d.id).distance(this.SelectedLinkLengthVariable))
                .force('center', d3.forceCenter(0, 0))
                .force('collide', d3.forceCollide().radius(d => this.mapNodeSize(d.nodeSize ? d.nodeSize : this.widgets['node-radius'])))
                .force('x', d3.forceX().strength(.005))
                .force('y', d3.forceY().strength(.005))
                .stop(); 
        } 
        const ticksPerYield = this.getD3TicksPerYield(nodes, links);
        const tickBatches = await this.runStoppedD3Ticks(simulation, ticks, ticksPerYield);
        return { nodes, links, tickBatches, ticksPerYield };
      }

      /**
       * Replicates the mapData function from cytoscape so that I can use it outside of cytoscape to know the size of the node
       */
      mapNodeSize(size: number): number {
        // mapData(nodeSize, 0, 100, 10, 50)
        let out = size / 100 * 40 + 10;
        return out;
    }

    /**
     * Updates the saved postion of a node when it is dragged by the user
     * @param node
     */
    // updateNodePos(node) {
    //   let globalNode = this.commonService.getVisibleNodes().find(x => x._id == node.data('id')) // need to update so it works with grouped nodes/polygons
    //   globalNode['x'] = node.position().x;
    //   globalNode['y'] = node.position().y;

    // }

    updateNodePos(node: cytoscape.NodeSingular): void {
        const nodeId = node.id();
        // This is for REAL user events. It reads the now-updated position from Cytoscape.
        const newPosition = node.position(); 
        if (node.data('isCollapsedAggregate')) {
            this.nodePositions.set(nodeId, newPosition);
            return;
        }
        this.commonService.updateNodePosition(nodeId, newPosition);
    }
    /** Initializes the view.
     * 
     * Defines the structure of the svg of twoD network and adds functionalities such as click, zoom, forces, etc...
     * 
     * Populates various field lists used by labels, sizing, polygons, and shared/global shape controls.
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
        this.ensureNodeCollapseWidgetDefaults();

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
            this.commonService.getStyleableNodeFields().forEach(d => {
                this.FieldList.push(
                    {
                        label: this.commonService.capitalize(d.replace("_", "")),
                        value: d
                    });
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
                        // {
                        //     label: 'Source Index',
                        //     value: 'source_index'
                        // }
                    ]
                    this.ToolTipFieldList = this.ToolTipFieldList.concat(data);
                    this.LinkToolTipList = this.LinkToolTipList.concat(data)
                } else if (d == 'target') {
                    let data = [
                        {
                            label: 'Target ID',
                            value: 'target_id'
                        },
                        // {
                        //     label: 'Target Index',
                        //     value: 'target_index'
                        // }
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

            // Used for timeline mode, TODO: update to use an RxJS Observable
            $(document).on("node-visibility", function () {
                console.log('node-visibility called');
                that._rerender(true);
            });

            // $(document).on("link-visibility", async function () {

            // });

            // $(document).on("cluster-visibility", function () {

            // });

            $(document).on("node-selected", function () {
                if (!that.cy) return;
              
                const mtSelectedNodes = that.commonService.getVisibleNodes().filter(n => n.selected);
                const mtSelectedNodeIds = mtSelectedNodes.map(n => n._id || n.id);
              
                // Clear cytoscape selection
                that.cy.elements().unselect();
              
                // Apply multi-selection
                if (mtSelectedNodeIds.length > 0) {
                  const selector = mtSelectedNodeIds.map(id => `#${id}`).join(', ');
                  that.cy.nodes(selector).select();
                  that.selectedNodeId = mtSelectedNodeIds[mtSelectedNodeIds.length - 1]; // keep last-selected for UI logic only
                } else {
                  that.selectedNodeId = undefined;
                }

                that.commonService.updateStatistics();
              
                if (that.debugMode) {
                  console.log('node-selected in 2d ids: ', mtSelectedNodeIds);
                }
              });
              

            if (this.widgets['background-color']) $('#cy').css('background-color', this.widgets['background-color']);
            
            console.log('--- TwoD InitView onStatisticsChanged');
            this.commonService.onStatisticsChanged();

            console.log('--- TwoD InitView loadSettings');
            this.loadSettings();

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

    private getCustomNodeSvgExportReplacementList(): CustomNodeSvgExportReplacement[] {
        const replacements: CustomNodeSvgExportReplacement[] = [];
        if (!this.cy) {
            return replacements;
        }

        const graphBounds = this.cy.elements().boundingBox();
        this.cy.nodes().forEach(node => {
            const shapeKey = node.data('shapeKey');
            if (!isCustomNodeIconShape(shapeKey)) {
                return;
            }

            const vectorData = getCustomNodeShapeVectorData(shapeKey);
            if (!vectorData) {
                return;
            }

            const position = node.position();
            const padding = Number(node.numericStyle('padding')) || 0;
            const paddingX2 = padding * 2;
            const nodeTotalWidth = node.width() + paddingX2;
            const nodeTotalHeight = node.height() + paddingX2;
            const containScale = Math.min(nodeTotalWidth / vectorData.width, nodeTotalHeight / vectorData.height);
            const exportWidth = vectorData.width * containScale;
            const exportHeight = vectorData.height * containScale;
            const nodeColor = node.data('nodeColor') || this.getNodeColor(node.data())[0];
            replacements.push({
                exportHeight,
                exportWidth,
                exportX: (position.x - graphBounds.x1 - (nodeTotalWidth / 2)) + ((nodeTotalWidth - exportWidth) / 2),
                exportY: (position.y - graphBounds.y1 - (nodeTotalHeight / 2)) + ((nodeTotalHeight - exportHeight) / 2),
                fillColor: nodeColor,
                fillPath: vectorData.fillPath,
                path: vectorData.path,
                strokeColor: nodeColor,
                strokeWidth: 4,
                width: vectorData.width,
                height: vectorData.height
            });
        });

        return replacements;
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

    private hasClipPathAncestor(element: Node | null): boolean {
        let current: Node | null = element?.parentNode ?? null;
        while (current) {
            if (current.nodeType === Node.ELEMENT_NODE) {
                const currentElement = current as Element;
                if (currentElement.tagName.toLowerCase() === 'g' && !!currentElement.getAttribute('clip-path')) {
                    return true;
                }
            }

            current = current.parentNode;
        }

        return false;
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

    private findMatchingCustomNodeSvgExportReplacement(
        image: Element,
        replacements: CustomNodeSvgExportReplacement[],
        usedReplacements: Set<CustomNodeSvgExportReplacement>
    ): CustomNodeSvgExportReplacement | null {
        const imageWidth = this.getSvgLengthAttribute(image, 'width');
        const imageHeight = this.getSvgLengthAttribute(image, 'height');
        const imageTranslate = this.getSvgTranslateTransform(image);
        if (imageWidth === null || imageHeight === null || !imageTranslate) {
            return null;
        }

        let bestMatch: CustomNodeSvgExportReplacement | null = null;
        let bestScore = Number.POSITIVE_INFINITY;
        for (const replacement of replacements) {
            if (usedReplacements.has(replacement)) {
                continue;
            }

            const score =
                Math.abs(replacement.exportX - imageTranslate.x)
                + Math.abs(replacement.exportY - imageTranslate.y)
                + Math.abs(replacement.exportWidth - imageWidth)
                + Math.abs(replacement.exportHeight - imageHeight);
            if (score < bestScore) {
                bestScore = score;
                bestMatch = replacement;
            }
        }

        return bestMatch;
    }

    private createCustomNodeVectorExportElement(
        doc: XMLDocument,
        sourceImage: SVGImageElement,
        replacement: CustomNodeSvgExportReplacement
    ): SVGGElement {
        const svgNamespace = 'http://www.w3.org/2000/svg';
        const vectorGroup = doc.createElementNS(svgNamespace, 'g');
        const attributesToCopy = ['opacity', 'style', 'clip-path'];

        for (const attributeName of attributesToCopy) {
            const attributeValue = sourceImage.getAttribute(attributeName);
            if (attributeValue) {
                vectorGroup.setAttribute(attributeName, attributeValue);
            }
        }

        const imageWidth = this.getSvgLengthAttribute(sourceImage, 'width') ?? replacement.exportWidth;
        const imageHeight = this.getSvgLengthAttribute(sourceImage, 'height') ?? replacement.exportHeight;
        const imageX = this.getSvgLengthAttribute(sourceImage, 'x') ?? 0;
        const imageY = this.getSvgLengthAttribute(sourceImage, 'y') ?? 0;
        const imageTransform = sourceImage.getAttribute('transform') || '';
        const transforms: string[] = [];
        if (imageX !== 0 || imageY !== 0) {
            transforms.push(`translate(${imageX}, ${imageY})`);
        }
        if (imageTransform) {
            transforms.push(imageTransform);
        }
        if (transforms.length) {
            vectorGroup.setAttribute('transform', transforms.join(' '));
        }
        vectorGroup.setAttribute('aria-hidden', 'true');

        const scaleGroup = doc.createElementNS(svgNamespace, 'g');
        scaleGroup.setAttribute('transform', `scale(${imageWidth / replacement.width}, ${imageHeight / replacement.height})`);

        const group = doc.createElementNS(svgNamespace, 'g');
        group.setAttribute('transform', `translate(0, ${replacement.height}) scale(1,-1)`);

        const fillPath = doc.createElementNS(svgNamespace, 'path');
        fillPath.setAttribute('d', replacement.fillPath);
        fillPath.setAttribute('fill', replacement.fillColor);
        fillPath.setAttribute('stroke', 'none');
        group.appendChild(fillPath);

        const outlinePath = doc.createElementNS(svgNamespace, 'path');
        outlinePath.setAttribute('d', replacement.path);
        outlinePath.setAttribute('fill', 'none');
        outlinePath.setAttribute('stroke', replacement.strokeColor);
        outlinePath.setAttribute('stroke-width', `${replacement.strokeWidth}`);
        outlinePath.setAttribute('stroke-linecap', 'round');
        outlinePath.setAttribute('stroke-linejoin', 'round');
        group.appendChild(outlinePath);

        scaleGroup.appendChild(group);
        vectorGroup.appendChild(scaleGroup);
        return vectorGroup;
    }

    private replaceExportedCustomNodeImagesWithVectorShapes(doc: XMLDocument): void {
        const replacementList = this.getCustomNodeSvgExportReplacementList();
        if (replacementList.length === 0) {
            return;
        }

        const images = Array.from(doc.getElementsByTagName('image'))
            .filter(image => {
                const href = this.getSvgImageHref(image);
                return !!href
                    && href.startsWith('data:image/png;base64,')
                    && this.hasClipPathAncestor(image);
            });
        const usedReplacements = new Set<CustomNodeSvgExportReplacement>();

        images.forEach(image => {
            const replacement = this.findMatchingCustomNodeSvgExportReplacement(image, replacementList, usedReplacements);
            if (!replacement || !image.parentNode) {
                return;
            }

            usedReplacements.add(replacement);
            const vectorElement = this.createCustomNodeVectorExportElement(doc, image as SVGImageElement, replacement);
            image.parentNode.replaceChild(vectorElement, image);
        });
    }

    private addCollapsedPieSvgExportOutlines(doc: XMLDocument): void {
        const svgNamespace = 'http://www.w3.org/2000/svg';
        const borderWidth = Math.max(0, Number(this.widgets?.['node-border-width']) || 0);
        if (borderWidth <= 0) {
            return;
        }

        const images = Array.from(doc.getElementsByTagName('image'))
            .filter(image => {
                const href = this.getSvgImageHref(image);
                return !!href
                    && href.startsWith('data:image/')
                    && this.hasClipPathAncestor(image);
            });

        images.forEach(image => {
            if (!image.parentNode) {
                return;
            }

            const imageWidth = this.getSvgLengthAttribute(image, 'width');
            const imageHeight = this.getSvgLengthAttribute(image, 'height');
            if (imageWidth === null || imageHeight === null || imageWidth <= 0 || imageHeight <= 0) {
                return;
            }

            const imageX = this.getSvgLengthAttribute(image, 'x') ?? 0;
            const imageY = this.getSvgLengthAttribute(image, 'y') ?? 0;
            const radius = Math.max(0.1, (Math.min(imageWidth, imageHeight) / 2) - (borderWidth / 2));
            const outline = doc.createElementNS(svgNamespace, 'circle');
            outline.setAttribute('cx', `${imageX + (imageWidth / 2)}`);
            outline.setAttribute('cy', `${imageY + (imageHeight / 2)}`);
            outline.setAttribute('r', `${radius}`);
            outline.setAttribute('fill', 'none');
            outline.setAttribute('stroke', '#000000');
            outline.setAttribute('stroke-width', `${borderWidth}`);
            outline.setAttribute('stroke-opacity', '1');
            outline.setAttribute('data-microbetrace-collapsed-pie-outline', 'true');

            const imageTransform = image.getAttribute('transform');
            if (imageTransform) {
                outline.setAttribute('transform', imageTransform);
            }

            image.parentNode.insertBefore(outline, image.nextSibling);
        });
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
        const polygonColorTableElement = this.getPolygonColorTableElementForExport();
        const shouldExportPolygonColorTable = this.shouldDisplayPolygonColorTable();

        if (this.SelectedNetworkExportFileTypeListVariable == 'svg') {

            let options = { scale: 1, full: true, bg: this.commonService.session.style.widgets['background-color'] || '#ffffff'};
            let content = (this.cy as any).svg(options);

            // Add 10px of padding around network
            const parser = new DOMParser();
            const doc = parser.parseFromString(content, 'image/svg+xml');
            this.replaceExportedCustomNodeImagesWithVectorShapes(doc);
            this.addCollapsedPieSvgExportOutlines(doc);
            const svg1 = doc.documentElement;          
            svg1.setAttribute('height', (parseFloat(svg1.getAttribute('height'))+20).toString());
            svg1.setAttribute('width', (parseFloat(svg1.getAttribute('width'))+20).toString());
            let svgString = new XMLSerializer().serializeToString(svg1);
            content = svgString.replace('<g>', `<g transform="translate(10, 10)">`)

            let elementsToExport: HTMLTableElement[] = [];
            if (shouldExportPolygonColorTable && polygonColorTableElement) {
                elementsToExport.push(polygonColorTableElement);
            }
            if (window.getComputedStyle(this.networkStatisticsTable.nativeElement.parentElement).display == 'block') {
                elementsToExport.push(this.networkStatisticsTable.nativeElement)
            }
            this.exportService.requestSVGExport(elementsToExport, content, true, true, true); 

        } else {
            // Request export
            let elementsToExport: HTMLElement[] = [this.exportContainer.nativeElement];
            if (shouldExportPolygonColorTable && polygonColorTableElement) {
                elementsToExport.push(polygonColorTableElement);
            }
            if (window.getComputedStyle(this.networkStatisticsTable.nativeElement.parentElement).display == 'block') {
                elementsToExport.push(this.networkStatisticsTable.nativeElement);
            }
            this.exportService.requestExport(elementsToExport, true, true, true);
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

        this.getSessionNetworkNodes().forEach(node => {
            node.selected = false;
        });
    }

  
    /**
     * Generates Polygon Color Selection Table, updates polygonColorMap and polygonAlphaMap functions, and then calls render to show/update network
     * 
     */
    updatePolygonColors(tableSelector: string = this.getActivePolygonColorTableSelector()) {
        const microbeTrace = this.commonService.visuals.microbeTrace;
        const legacyPolygonHeader = this.commonService.session.style.overwrite?.['polygonColorHeaderVariable'] === this.widgets['polygons-foci']
            ? this.commonService.session.style.overwrite?.['polygonColorHeaderTitle']
            : undefined;
        const valueColumnName = microbeTrace?.getKeyTableColumnDisplayName(
            'polygon-color',
            'value',
            legacyPolygonHeader ?? 'Group ' + this.commonService.titleize(this.widgets['polygons-foci'])
        ) ?? (legacyPolygonHeader ?? 'Group ' + this.commonService.titleize(this.widgets['polygons-foci']));
        const countColumnName = microbeTrace?.getKeyTableColumnDisplayName('polygon-color', 'count', 'Count') ?? 'Count';
        const frequencyColumnName = microbeTrace?.getKeyTableColumnDisplayName('polygon-color', 'frequency', 'Frequency') ?? 'Frequency';

        this.polygonColorTableHeaders = {
            value: valueColumnName,
            count: countColumnName,
            frequency: frequencyColumnName
        };

        if (!this.commonService.session.style['polygonValueNames']) this.commonService.session.style['polygonValueNames'] = {};
        const aggregates = this.commonService.createPolygonColorMap().reduce((acc, item) => {
            acc[item.key] = item.values.length;
            return acc;
        }, {} as Record<string, number>)
        const values = Object.keys(aggregates);

        if (this.widgets["polygon-color-table-counts-sort"] == "ASC") {
            values.sort((a, b) => aggregates[a] - aggregates[b]);
        } else if (this.widgets["polygon-color-table-name-sort"] == "ASC") {
            values.sort((a, b) => String(a).localeCompare(String(b)));
        } else if (this.widgets["polygon-color-table-counts-sort"] == "DESC") {
            values.sort((a, b) => aggregates[b] - aggregates[a]);
        } else {
            values.sort((a, b) => String(b).localeCompare(String(a)));
        }

        let total = 0;
        values.forEach(d => total += aggregates[d]);

        this.polygonColorRows = values.map(value => {
            const polygonValueNames = this.commonService.session.style['polygonValueNames'];
            const displayName = Object.prototype.hasOwnProperty.call(polygonValueNames, value)
                ? polygonValueNames[value]
                : this.commonService.titleize(String(value));
            const polygonGroup = this.commonService.temp.polygonGroups.find(x => x.key == value);

            return {
                rawValue: value,
                trackKey: `polygon-color-${String(value)}`,
                displayName,
                count: aggregates[value],
                frequency: total === 0 ? '' : (aggregates[value] / total).toLocaleString(),
                color: this.commonService.temp.style.polygonColorMap(value),
                alpha: this.commonService.temp.style.polygonAlphaMap(value),
                index: polygonGroup?.index
            };
        });

        this.cdref.markForCheck();
    }

    onPolygonKeyTableColumnNameChange(change: StyleKeyTableColumnNameChange): void {
        this.commonService.visuals.microbeTrace?.setKeyTableColumnDisplayName(
            change.table,
            change.column,
            change.displayName
        );
        this.cdref.markForCheck();
    }

    onPolygonColorRowNameChange(change: StyleKeyTableRowNameChange): void {
        if (!this.commonService.session.style['polygonValueNames']) {
            this.commonService.session.style['polygonValueNames'] = {};
        }

        this.commonService.session.style['polygonValueNames'][String(change.value)] = change.displayName;
        this.cdref.markForCheck();
    }

    onPolygonColorTableColorChange(change: StyleKeyTableColorChange): void {
        const polygonGroup = this.commonService.temp.polygonGroups.find(x => x.key == change.value);
        const locInPolygonColors = polygonGroup?.index ?? change.row.index;
        if (locInPolygonColors === undefined || locInPolygonColors === null) {
            return;
        }

        this.commonService.session.style['polygonColors'].splice(locInPolygonColors, 1, change.color);
        this.commonService.createPolygonColorMap();
        this.updatePolygonColors();
        this.updateGroupNodeColors();
    }

    onPolygonColorAlphaRequested(request: StyleKeyTableAlphaRequest): void {
        $("#color-transparency-wrapper").css({
            top: request.event.clientY + 129,
            left: request.event.clientX,
            display: "block"
        });

        $("#color-transparency")
            .off("change")
            .val(this.commonService.temp.style.polygonAlphaMap(request.value))
            .one("change", event => {
                const polygonGroup = this.commonService.temp.polygonGroups.find(x => x.key == request.value);
                const locInPolygonAlphas = polygonGroup?.index ?? request.row.index;
                if (locInPolygonAlphas === undefined || locInPolygonAlphas === null) {
                    return;
                }

                this.commonService.session.style['polygonAlphas'].splice(
                    locInPolygonAlphas,
                    1,
                    parseFloat((event.target['value'] as string))
                );
                this.commonService.temp.style.polygonAlphaMap = d3
                    .scaleOrdinal(this.commonService.session.style['polygonAlphas'])
                    .domain(this.commonService.temp.polygonGroups.map(d => d.key));
                $("#color-transparency-wrapper").fadeOut();
                this.updatePolygonColors();
                this.updateGroupNodeColors();
            });
    }

    onPolygonColorSort(column: StyleKeyTableSortColumn): void {
        if (column === 'value') {
            const isAscending = this.widgets["polygon-color-table-name-sort"] === "DESC";
            this.widgets["polygon-color-table-name-sort"] = isAscending ? "ASC" : "DESC";
            this.widgets["polygon-color-table-counts-sort"] = "";
        } else {
            const isAscending = this.widgets["polygon-color-table-counts-sort"] === "DESC";
            this.widgets["polygon-color-table-counts-sort"] = isAscending ? "ASC" : "DESC";
            this.widgets["polygon-color-table-name-sort"] = "";
        }

        this.updatePolygonColors();
    }

    private getDockedPolygonColorTableSelector(): string {
        return '#key-tables-polygon-color-table';
    }

    private getActivePolygonColorTableSelector(): string {
        return this.isPolygonColorTableDocked
            ? this.getDockedPolygonColorTableSelector()
            : '#polygon-color-table';
    }

    private clearPolygonColorTables(): void {
        this.polygonColorRows = [];
        this.cdref.markForCheck();
    }

    public getPolygonColorTableElementForExport(): HTMLTableElement | undefined {
        const selector = this.isPolygonColorTableDocked
            ? this.getDockedPolygonColorTableSelector()
            : '#polygon-color-table';
        return document.querySelector(selector) as HTMLTableElement | undefined;
    }

    private normalizePolygonColorTableDisplayMode(value: any): PolygonColorTableDisplayMode {
        if (value === 'Show' || value === true) {
            return 'Show';
        }

        if (value === 'Hide' || value === false) {
            return 'Hide';
        }

        return 'Dock';
    }

    private setPolygonColorTableDisplayMode(value: any): PolygonColorTableDisplayMode {
        const mode = this.normalizePolygonColorTableDisplayMode(value);
        this.widgets["polygon-color-table-visible"] = mode;
        this.SelectedNetworkTableTypeVariable = mode;
        return mode;
    }

    private getPolygonColorTableDisplayMode(): PolygonColorTableDisplayMode {
        return this.setPolygonColorTableDisplayMode(this.widgets?.["polygon-color-table-visible"]);
    }

    private canDisplayPolygonColorTable(): boolean {
        return !!this.widgets?.['polygons-show']
            && !!this.widgets?.['polygons-color-show'];
    }

    private shouldDisplayPolygonColorTable(): boolean {
        return this.canDisplayPolygonColorTable()
            && this.getPolygonColorTableDisplayMode() !== 'Hide';
    }

    public hasVisibleDockedPolygonColorTable(): boolean {
        return !!this.isPolygonColorTableDocked
            && this.shouldDisplayPolygonColorTable();
    }

    public renderDockedPolygonColorTable(): void {
        this.updatePolygonColors(this.getDockedPolygonColorTableSelector());
        this.updateCountFreqTable('polygon-color');
    }

    public clearDockedPolygonColorTable(): void {
        this.cdref.markForCheck();
    }

    public dockPolygonColorTableIfVisible(): boolean {
        const isVisible = this.shouldDisplayPolygonColorTable();

        if (!isVisible) {
            return false;
        }

        this.setPolygonColorTableDisplayMode('Dock');
        this.closeSettingsPane('polygonColorTableSettings');

        this.syncPolygonColorTableVisibility();
        return true;
    }

    getPolygonColorTableDockButtonTitle(): string {
        return this.isPolygonColorTableDocked ? 'Float table' : 'Dock table';
    }

    private resetPolygonColorTableFloatingPosition(): void {
        const viewportMargin = 16;
        const dialogWidth = Math.min(window.innerWidth * 0.45, 500);
        const dialogHeight = Math.min(window.innerHeight * 0.5, 420);
        const hostElement = this.exportContainer?.nativeElement as HTMLElement | undefined;
        const hostRect = hostElement?.getBoundingClientRect?.();

        let left = hostRect
            ? hostRect.right - dialogWidth - 24
            : window.innerWidth - dialogWidth - viewportMargin;
        let top = hostRect ? hostRect.top + 72 : viewportMargin + 60;

        left = Math.max(viewportMargin, Math.min(left, window.innerWidth - dialogWidth - viewportMargin));
        top = Math.max(viewportMargin, Math.min(top, window.innerHeight - dialogHeight - viewportMargin));

        if (hostRect) {
            const minLeft = Math.max(viewportMargin, hostRect.left + 16);
            const maxLeft = Math.max(minLeft, Math.min(window.innerWidth - dialogWidth - viewportMargin, hostRect.right - dialogWidth - 16));
            const minTop = Math.max(viewportMargin, hostRect.top + 16);
            const maxTop = Math.max(minTop, Math.min(window.innerHeight - dialogHeight - viewportMargin, hostRect.bottom - dialogHeight - 16));

            left = Math.max(minLeft, Math.min(left, maxLeft));
            top = Math.max(minTop, Math.min(top, maxTop));
        }

        this.PolygonColorTableWrapperDialogSettings.setPosition(Math.round(top), Math.round(left));
    }

    private syncPolygonColorTableVisibility(shouldRefresh: boolean = true): void {
        const mode = this.getPolygonColorTableDisplayMode();
        const isVisible = this.shouldDisplayPolygonColorTable();
        const shouldDockTable = isVisible && mode === 'Dock';
        const shouldShowFloatingDialog = isVisible && mode === 'Show';

        this.isPolygonColorTableDocked = shouldDockTable;

        if (this.PolygonColorTableWrapperDialogSettings.isVisible !== shouldShowFloatingDialog) {
            this.PolygonColorTableWrapperDialogSettings.setVisibility(shouldShowFloatingDialog);
        }

        this.cdref.markForCheck();

        if (!isVisible) {
            this.clearPolygonColorTables();
            this.commonService.visuals.microbeTrace?.refreshDockedKeyTablesView();
            this.commonService.visuals.microbeTrace?.closeDockedKeyTablesViewIfUnused();
            return;
        }

        if (shouldDockTable) {
            this.commonService.visuals.microbeTrace?.ensureDockedKeyTablesViewVisible(false);

            if (!shouldRefresh) {
                this.commonService.visuals.microbeTrace?.refreshDockedKeyTablesView();
                return;
            }

            setTimeout(() => {
                this.updateGroupNodeColors();
                this.commonService.visuals.microbeTrace?.refreshDockedKeyTablesView();
            }, 0);
            return;
        }

        this.commonService.visuals.microbeTrace?.refreshDockedKeyTablesView();
        this.commonService.visuals.microbeTrace?.closeDockedKeyTablesViewIfUnused();

        if (!shouldRefresh) {
            return;
        }

        setTimeout(() => {
            this.updatePolygonColors();
            this.updateGroupNodeColors();
            this.updateCountFreqTable('polygon-color');
        }, 0);
    }

    togglePolygonColorTableDocking(event?: Event): void {
        event?.stopPropagation();
        const nextMode: PolygonColorTableDisplayMode = this.isPolygonColorTableDocked ? 'Show' : 'Dock';
        this.setPolygonColorTableDisplayMode(nextMode);

        if (nextMode === 'Show') {
            this.resetPolygonColorTableFloatingPosition();
        }

        this.closeSettingsPane('polygonColorTableSettings');
        this.syncPolygonColorTableVisibility();
    }

    onPolygonColorTableDialogHide(): void {
        if (
            this.isPolygonColorTableDocked
            || this.getPolygonColorTableDisplayMode() !== 'Show'
            || !this.canDisplayPolygonColorTable()
            || !this.viewActive
        ) {
            return;
        }

        this.onPolygonColorTableChange('Hide');
    }

    public handleKeyTablesViewClosed(): void {
        if (!this.isPolygonColorTableDocked) {
            return;
        }

        this.setPolygonColorTableDisplayMode('Hide');
        this.resetPolygonColorTableFloatingPosition();
        this.syncPolygonColorTableVisibility();
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
            this.applyPolygonLabelStyle();
        } else {
            $(".polygons-settings-row").slideUp();
            //$('.polygons-label-row').slideUp();
            $("#polygon-color-table-row").slideUp();
            $("#polygon-color-value-row").slideUp();
            this.polygonColorRows = [];
            this.cdref.markForCheck();
        }

        this.syncPolygonColorTableVisibility();
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
            if (node.hasClass('parent')) {
                return;
            }

            const groupKey = this.getCyNodeGroupingKey(node, foci);
            if (groupKey !== null) {
                if (!groupMap.has(groupKey)) {
                    groupMap.set(groupKey, []);
                }
                groupMap.get(groupKey)?.push(node);
            }
        });

        const groupedChildCount = Array.from(groupMap.values()).reduce((sum, nodesInGroup) => sum + nodesInGroup.length, 0);
        if (this.shouldSkipSingletonClusterGroups(foci, groupMap.size, groupedChildCount)) {
            this.commonService.temp.polygonGroups = [];
            return;
        }

        const polygonGroups = Array.from(groupMap.entries()).map(([key, values], index) => ({
            key,
            index,
            values: values.map(node => node.data('id'))
        }));

        this.commonService.temp.polygonGroups = polygonGroups;

        groupMap.forEach((nodesInGroup, group) => {
            const parentId = `group-${group}`;
            if (cy.getElementById(parentId).length === 0) {
                let color = this.commonService.session.style.widgets['polygons-color-show'] ? this.commonService.temp.style.polygonColorMap(group) : this.commonService.session.style.widgets['polygon-color'];
                const alphaVal = this.commonService.temp.style.polygonAlphaMap(group) ?? 1;
                cy.add({
                    group: 'nodes',
                    data: { 
                        id: parentId, 
                        label: `${group}`,
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
            if (node.hasClass('parent')) {
                return;
            }

            const group = this.getCyNodeGroupingKey(node, foci);
            if (group !== null) {
                const parentId = `group-${group}`;
                node.move({ parent: parentId });
            }
        });

          // **Step 6:** Create and Assign the `groups` Object for polygonGroups
          const groups = Array.from(groupMap.entries()).map(([key, values], index) => ({
            key,
            index,
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
    polygonColorsToggle(e, syncTableVisibility: boolean = true) {

        console.log('polygonColorsToggle: ', e);

        if (e) {
            this.widgets['polygons-color-show'] = true;
            $("#polygon-color-value-row").slideUp();
            $("#polygon-color-table-row").slideDown();
            if (syncTableVisibility) {
                this.onPolygonColorTableChange(this.widgets["polygon-color-table-visible"]);
            } else {
                this.syncPolygonColorTableVisibility(false);
            }

        }
        else {
            this.widgets['polygons-color-show'] = false;
            $("#polygon-color-value-row").slideDown();
            $("#polygon-color-table-row").slideUp();
            this.polygonColorRows = [];
            this.cdref.markForCheck();
            this.syncPolygonColorTableVisibility();
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
     * This widget controls whether the polygon color table is shown floating, docked, or hidden.
     * 
     */
    polygonColorsTableToggle(e: PolygonColorTableDisplayMode) {

        console.log('polygonColorsTableToggle: ', e);

        this.onPolygonColorTableChange(e);
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
        let nodes = this.getSessionNetworkNodes();
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
                                source: this.getSessionNetworkNodeByEndpoint(nodes, vlinks[i].source),
                                target: this.getSessionNetworkNodeByEndpoint(nodes, vlinks[i].target)
                            });
                            output.push(holder);
                        });
                    } else {
                        const holder = Object.assign({}, vlinks[i], {
                            oNum: 0,
                            origins: 1,
                            source: this.getSessionNetworkNodeByEndpoint(nodes, vlinks[i].source),
                            target: this.getSessionNetworkNodeByEndpoint(nodes, vlinks[i].target)
                        });
                        output.push(holder);
                    }
                } else {
                    const holder = Object.assign({}, vlinks[i], {
                        oNum: 0,
                        origins: 1,
                        source: this.getSessionNetworkNodeByEndpoint(nodes, vlinks[i].source),
                        target: this.getSessionNetworkNodeByEndpoint(nodes, vlinks[i].target)
                    });
                    //console.log(holder);
                    output.push(holder);
                }
            } else {
                const holder = Object.assign({}, vlinks[i], {
                    origin: 'Unknown',
                    oNum: 0,
                    origins: 1,
                    source: this.getSessionNetworkNodeByEndpoint(nodes, vlinks[i].source),
                    target: this.getSessionNetworkNodeByEndpoint(nodes, vlinks[i].target)
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
        const nodes = this.getSessionNetworkNodes();
        for (let i = 0; i < n; i++) {
            vlinks[i].source = this.getSessionNetworkNodeByEndpoint(nodes, vlinks[i].source);
            vlinks[i].target = this.getSessionNetworkNodeByEndpoint(nodes, vlinks[i].target);
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
        const id = ($('#copyID').attr('data-clipboard-text') || '').toString();
        if (id) {
            this.clipboard.copy(id);
        }
        this.hideContextMenu();
    }

    /**
     * Used from Context Menu and copy node's sequence to the user's clipboard
     */
    copySeq() {
        const seq = ($('#copySeq').attr('data-clipboard-text') || '').toString();
        if (seq) {
            this.clipboard.copy(seq);
        }
        this.hideContextMenu()
    }

    /**
     * Upon right clicking a node, d, the context menu will appear, which allows the user to option to copy id, copy sequence, or view attributes
     * @param d the node right clicked
     */
    showContextMenu(d, event: MouseEvent, node?) {
        if (!event) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        this.hideTooltip();

        const nodeId = (d?._id ?? d?.id ?? node?.id?.()) as string;
        this.contextMenuNodeId = nodeId || null;
        // if (node && node.select) {
        //     node.select();
        // }

        const idText = (d?._id ?? d?.id ?? '').toString();
        const seqText = (d?.sequence ?? d?.seq ?? '').toString();
        const hasSequence = seqText.trim().length > 0;
        $('#copyID').attr('data-clipboard-text', idText);
        $('#copySeq')
            .attr('data-clipboard-text', seqText)
            .prop('disabled', !hasSequence);

        const x = event.clientX ?? 0;
        const y = event.clientY ?? 0;
        const menu = $('#context-menu');
        const menuWidth = (menu.outerWidth() as number) || 170;
        const menuHeight = (menu.outerHeight() as number) || 140;
        const maxX = Math.max(8, window.innerWidth - menuWidth - 8);
        const maxY = Math.max(8, window.innerHeight - menuHeight - 8);
        const left = Math.max(8, Math.min(x + 8, maxX));
        const top = Math.max(8, Math.min(y + 8, maxY));

        menu
            .stop(true, true)
            .css({
                display: 'block',
                position: 'fixed',
                left: `${left}px`,
                top: `${top}px`,
                opacity: 1,
                'z-index': 1200
            });
    };

    /**
     * Hides the Context Menu
     */
    hideContextMenu() {
        $('#context-menu').stop(true, true).animate({ 'opacity': 0 }, 80, function () {
            $(this).css({ 'z-index': -1, display: 'none' });
        });
    };

    private getContextMenuNodeData() {
        if (!this.contextMenuNodeId) {
            return null;
        }
        const nodeId = this.contextMenuNodeId;
        const allNodes = [
            ...(this.commonService.session.data.nodes || []),
            ...(this.commonService.session.data.nodeFilteredValues || [])
        ];
        return allNodes.find(n => (n?._id ?? n?.id) === nodeId || (n?.id ?? n?._id) === nodeId) || null;
    }

    viewSelectedNodeAttributes() {
        const node = this.getContextMenuNodeData();
        if (!node) {
            this.hideContextMenu();
            return;
        }

        const excludedKeys = new Set(['_id', 'seq', 'data', 'hasDistance', 'x', 'y', 'vx', 'vy', 'selected', 'nodeSize', 'visible', 'index']);
        this.ContextSelectedNodeAttributes = Object.keys(node)
            .filter(key => !excludedKeys.has(key) && !key.startsWith('_'))
            .sort((a, b) => {
                const aIsId = a === 'ID';
                const bIsId = b === 'ID';
                if (aIsId && !bIsId) return -1;
                if (!aIsId && bIsId) return 1;
                return a.localeCompare(b);
            })
            .map(key => {
                const rawValue = node[key];
                let value = '';

                if (rawValue === null || rawValue === undefined) {
                    value = '';
                } else if (Array.isArray(rawValue)) {
                    value = rawValue.join(', ');
                } else if (typeof rawValue === 'object') {
                    value = JSON.stringify(rawValue);
                } else {
                    value = String(rawValue);
                }

                return { attribute: key, value };
            });
        this.ShowNetworkAttributes = true;
        this.hideContextMenu();
        this.cdref.detectChanges();
    }

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
     * @param headers Optional table header cells
     * @returns an HTML string with a table representation of the data
     */
    tabulate(data: any[], headers: any[] = []) {

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
            <table id="tooltip-table">`;

        if (headers.length > 0) {
            tableHtml += '<thead><tr>';
            for (let header of headers) {
                tableHtml += '<th>' + header + '</th>';
            }
            tableHtml += '</tr></thead>';
        }

        tableHtml += '<tbody>';

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

        let tooltipHtml: string;

        if (d.isCollapsedAggregate) {
          const totalCount = Number(d.totalCount || 0);
          const colorVariable = this.commonService.capitalize(this.widgets['node-color-variable']);
          const collapseMetric = this.getNodeCollapseMetric();
          const meanDistanceLabel = `Mean Distance (${this.getNodeCollapseMetricLabel(collapseMetric)})`;
          const meanDistanceValue = this.formatNodeCollapseDistanceForDisplay(d.meanInternalDistance, collapseMetric);
          const countRows = (d.counts || []).map(count => {
            const countValue = Number(count.count || 0);
            const percent = totalCount > 0 ? (countValue / totalCount * 100).toFixed(1) + '%' : '0.0%';
            return [count.label, countValue, percent];
          });

          tooltipHtml = this.tabulate([
            ...countRows,
            ['Total', totalCount, ''],
            [meanDistanceLabel, meanDistanceValue, '']
          ], [colorVariable, 'Count', '%']);
        } else {
          let tt_var_len = this.widgets['node-tooltip-variable'].length

          if (tt_var_len == 0) {
            return null;
          } else if (tt_var_len == 1) {
           tooltipHtml =  `${d[this.widgets['node-tooltip-variable'][0]]}`
          } else {
            tooltipHtml =  this.tabulate(this.widgets['node-tooltip-variable'].map(variable => [this.titleize(variable), d[variable]]))
          }
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
                return data['source']//._id
            // } else if (varName == 'source_index') {
            //     return data['source'].index
            } else if (varName == 'target_id') {
                return data['target']//._id
            // } else if (varName == 'target_index') {
            //     return data['target'].index
            } else if (varName == 'distance') {
                if (data.hasDistance && data.distanceOrigin.includes(data.origin)) {
                    return this.formatLinkDistanceForDisplay(data['distance']);
                } else {
                    return 'N/A';
                }
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
        if (this.shouldChunkLargeNoLinkLayout()) {
            this.updateGroupAssignmentsNoLinkFast(e);
            if (this.widgets['polygons-color-show'] == true) {
                console.log('centerPolygons: show ');
                this.updatePolygonColors();
                this.updateGroupNodeColors();
            }
            return;
        }

        if (this.widgets['polygons-color-show'] == true) {
            console.log('centerPolygons: show ');
            this.updateGroupAssignments(e);
            this.updatePolygonColors();
            this.updateGroupNodeColors();
        // Just update group assignments since not showing different colors
        } else {
            this.updateGroupAssignments(e);
        }
        if (updateLayout) await this.updateLayout();
    }

    pinNodes() {
        this.commonService.session.network.allPinned = !this.commonService.session.network.allPinned;
    }

    async updateLayout(): Promise<void> {
        if (this.commonService.session.style.widgets['polygons-show'] == false || this.commonService.session.style.widgets['polygons-foci'] == 'None') {
            await this._partialUpdate();
        } else if (this.commonService.getVisibleLinks().length === 0) {
            await this.applyNoLinkGroupedLayout(this.commonService.session.style.widgets['polygons-foci']);
        } else {
            await this.gatherGroups();
        }
    }

    /**
     * 
     * @param foci 
     * @param change boolean, representing if foci has change (timeline mode foci doesn't change). If true, updates commonService.temp.polyggonGroups
     * @returns 
     */
    updateGroupAssignments(foci: string, change: boolean=true): void {
        const cy = this.cy; // Reference to Cytoscape instance
        if (!cy) {
            return;
        }
    
        cy.batch(() => {
            // Identify existing parent nodes and remove them if necessary
            const existingParents = cy.nodes('.parent');
            if (this.debugMode) {
                console.log('Removing existing parent nodes:', existingParents.map(p => p.id()));
            }
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
                
                const group = this.getCyNodeGroupingKey(node, foci);
                if (group !== null) {
                    if (!groupMap.has(group)) {
                        groupMap.set(group, []);
                    }
                    groupMap.get(group)?.push(node);
                }
            });

            const groupedChildCount = Array.from(groupMap.values()).reduce((sum, nodesInGroup) => sum + nodesInGroup.length, 0);
            if (this.shouldSkipSingletonClusterGroups(foci, groupMap.size, groupedChildCount)) {
                this.commonService.temp.polygonGroups = [];
                return;
            }

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
                if (!node.parent().length && this.getCyNodeGroupingKey(node, foci) !== null) {
                    node.move({ parent: null });
                }
            });

            this.applyPolygonLabelStyle();

             // **Step 6:** Create and Assign the `groups` Object for polygonGroups
             if (change) {
                const groups = Array.from(groupMap.entries()).map(([key, values], index) => ({
                    key,
                    index,
                    values: values.map(node => node.data('id'))
                }));

                // Assign the groups to polygonGroups in commonService.temp
                this.commonService.temp.polygonGroups = groups;
            }
        });
    
    }

    private updateGroupAssignmentsNoLinkFast(foci: string, change: boolean=true): void {
        const cy = this.cy;
        if (!cy) {
            return;
        }

        const layoutStart = this.getPerformanceNow();
        const groupMap: Map<string, cytoscape.NodeSingular[]> = new Map();

        cy.nodes().forEach(node => {
            if (node.hasClass('parent')) return;

            const group = this.getCyNodeGroupingKey(node, foci);
            if (group !== null) {
                if (!groupMap.has(group)) {
                    groupMap.set(group, []);
                }
                groupMap.get(group)?.push(node);
            }
        });

        const groupedChildCount = Array.from(groupMap.values()).reduce((sum, nodesInGroup) => sum + nodesInGroup.length, 0);
        if (this.shouldSkipSingletonClusterGroups(foci, groupMap.size, groupedChildCount)) {
            this.commonService.temp.polygonGroups = [];
            return;
        }

        const groups = Array.from(groupMap.entries()).map(([key, values]) => ({ key, values }));
        const spacing = this.getNodeLayoutSpacing();
        const groupColumns = Math.max(1, Math.ceil(Math.sqrt(groups.length)));
        const groupLayouts = groups.map(group => {
            const columns = Math.max(1, Math.ceil(Math.sqrt(group.values.length)));
            return {
                columns,
                rows: Math.max(1, Math.ceil(group.values.length / columns))
            };
        });
        const cellWidth = (Math.max(...groupLayouts.map(layout => layout.columns), 1) + 3) * spacing;
        const cellHeight = (Math.max(...groupLayouts.map(layout => layout.rows), 1) + 3) * spacing;

        cy.batch(() => {
            cy.nodes('.parent').forEach(parent => {
                parent.children().move({ parent: null });
                cy.remove(parent);
            });

            groups.forEach((group, groupIndex) => {
                const parentId = `group-${group.key}`;
                let color = this.commonService.session.style.widgets['polygons-color-show'] ? this.commonService.temp.style.polygonColorMap(group.key) : this.commonService.session.style.widgets['polygon-color'];
                const alphaVal = this.commonService.temp.style.polygonAlphaMap(group.key) ?? 1;
                const layout = groupLayouts[groupIndex];
                const groupColumn = groupIndex % groupColumns;
                const groupRow = Math.floor(groupIndex / groupColumns);
                const originX = groupColumn * cellWidth;
                const originY = groupRow * cellHeight;
                const offsetX = ((cellWidth - (layout.columns - 1) * spacing) / 2);
                const offsetY = ((cellHeight - (layout.rows - 1) * spacing) / 2);

                cy.add({
                    group: 'nodes',
                    data: {
                        id: parentId,
                        label: `${group.key}`,
                        isParent: true,
                        nodeColor: color || '#000',
                        borderWidth: 1,
                        shape: 'rectangle',
                        bgOpacity: alphaVal,
                    },
                    classes: 'parent'
                });

                group.values.forEach((node, nodeIndex) => {
                    node.position({
                        x: originX + offsetX + (nodeIndex % layout.columns) * spacing,
                        y: originY + offsetY + Math.floor(nodeIndex / layout.columns) * spacing
                    });
                });

                cy.collection(group.values).move({ parent: parentId });
            });

            this.applyPolygonLabelStyle();
        });

        if (change) {
            this.commonService.temp.polygonGroups = groups.map((group, index) => ({
                key: group.key,
                index,
                values: group.values.map(node => node.data('id'))
            }));
        }

        this.syncVisibleNodePositionsFromCy();
        this.fit();
        this.recordTwoDRenderTiming('twoDNoLinkGroupedLayout', layoutStart, {
            groups: groups.length,
            nodes: groupedChildCount,
            foci
        });
    }

    private async updateGroupAssignmentsChunked(foci: string, change: boolean=true): Promise<void> {
        const cy = this.cy;
        if (!cy) {
            return;
        }

        const existingParents = cy.nodes('.parent').toArray();
        if (existingParents.length > 0) {
            cy.batch(() => {
                existingParents.forEach(parent => {
                    parent.children().forEach(child => {
                        child.move({ parent: null });
                    });
                    cy.remove(parent);
                });
            });
            await this.yieldToBrowser();
        }

        const groupMap: Map<string, cytoscape.NodeSingular[]> = new Map();
        cy.nodes().forEach(node => {
            if (node.hasClass('parent')) return;

            const group = this.getCyNodeGroupingKey(node, foci);
            if (group !== null) {
                if (!groupMap.has(group)) {
                    groupMap.set(group, []);
                }
                groupMap.get(group)?.push(node);
            }
        });

        const groupedChildCount = Array.from(groupMap.values()).reduce((sum, nodesInGroup) => sum + nodesInGroup.length, 0);
        if (this.shouldSkipSingletonClusterGroups(foci, groupMap.size, groupedChildCount)) {
            this.commonService.temp.polygonGroups = [];
            return;
        }

        cy.batch(() => {
            groupMap.forEach((nodesInGroup, groupName) => {
                const parentId = `group-${groupName}`;
                let color = this.commonService.session.style.widgets['polygons-color-show'] ? this.commonService.temp.style.polygonColorMap(groupName) : this.commonService.session.style.widgets['polygon-color'];
                const alphaVal = this.commonService.temp.style.polygonAlphaMap(groupName) ?? 1;

                if (cy.getElementById(parentId).length === 0) {
                    cy.add({
                        group: 'nodes',
                        data: {
                            id: parentId,
                            label: `${groupName}`,
                            isParent: true,
                            nodeColor: color || '#000',
                            borderWidth: 1,
                            shape: 'rectangle',
                            bgOpacity: alphaVal,
                        },
                        classes: 'parent'
                    });
                }
            });
        });

        const moves: Array<{ node: cytoscape.NodeSingular; parentId: string }> = [];
        groupMap.forEach((nodesInGroup, groupName) => {
            const parentId = `group-${groupName}`;
            nodesInGroup.forEach(childNode => {
                moves.push({ node: childNode, parentId });
            });
        });

        const chunkSize = 500;
        for (let i = 0; i < moves.length; i += chunkSize) {
            const chunk = moves.slice(i, i + chunkSize);
            cy.batch(() => {
                chunk.forEach(move => {
                    move.node.move({ parent: move.parentId });
                });
            });

            if (i + chunkSize < moves.length) {
                await this.yieldToBrowser();
            }
        }

        this.applyPolygonLabelStyle();

        if (change) {
            const groups = Array.from(groupMap.entries()).map(([key, values], index) => ({
                key,
                index,
                values: values.map(node => node.data('id'))
            }));

            this.commonService.temp.polygonGroups = groups;
        }
    }

    private getPolygonLabelTextStyle(): Record<string, any> {
        const orientationValue = String(
            this.widgets['polygon-label-orientation'] || this.SelectedPolygonLabelOrientationVariable || 'top'
        ).toLowerCase();
        let textValign: 'top' | 'bottom' | 'center' = 'center';
        let textHalign: 'left' | 'center' | 'right' = 'center';

        switch (orientationValue) {
            case 'top':
                textValign = 'top';
                break;
            case 'bottom':
                textValign = 'bottom';
                break;
            case 'left':
                textHalign = 'left';
                break;
            case 'right':
                textHalign = 'right';
                break;
            case 'middle':
            default:
                textValign = 'center';
                break;
        }

        return {
            'label': 'data(label)',
            'text-valign': textValign,
            'text-halign': textHalign,
            'font-size': `${this.commonService.session.style.widgets['polygons-label-size']}px`,
            'background-color': 'data(nodeColor)',
            'background-opacity': 'data(bgOpacity)',
            'text-background-opacity': 0
        };
    }

    private applyPolygonLabelStyle(): void {
        if (!this.cy) {
            return;
        }

        const labelStyle = this.commonService.session.style.widgets['polygons-label-show']
            ? this.getPolygonLabelTextStyle()
            : {
                'label': '',
                'text-background-opacity': 0
            };

        this.cy.style()
            .selector('node.parent')
            .style(labelStyle)
            .update();
    }

    /**
     * Calls setPolygonLabelSize to update polygon-label-size widget and then redraws polygon labels
     */
    onPolygonLabelSizeChange(e) {
        this.widgets['polygons-label-size'] = parseFloat(e);
        this.applyPolygonLabelStyle();
    }

    /**
     * Updates polygon-label-orientation widget and then redraws polygon labels
     */
    onPolygonLabelOrientationChange(e) {
        if (e=='top') e = 'Top'
        else if (e == 'middle') e = 'Middle'
        else if (e == 'bottom') e = 'Bottom'
        this.widgets['polygon-label-orientation'] = e;
        this.applyPolygonLabelStyle();
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
        this.SelectedPolygonLabelShowVariable = this.widgets['polygons-label-show'] ? 'Show' : 'Hide';

        this.applyPolygonLabelStyle();
        
    }


    /**
     * Handles direct changes to the polygon color table display mode. Also normalizes older
     * boolean values from saved sessions.
     */
    onPolygonColorTableChange(e: any) {
        console.log('onPolygonColorTableChange: ', e);

        this.setPolygonColorTableDisplayMode(e);
        this.syncPolygonColorTableVisibility();
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
        return resolveNodeShapeKey(name);
    }

    getNodeSize(node: any) {

        if (node?.isCollapsedAggregate) {
            return Number(node.nodeSize);
        }

        let sizeVariable = this.widgets['node-radius-variable'];

        if (sizeVariable == 'None') {
            return Number(this.widgets['node-radius']);
        } else {

            let v = Number(node[sizeVariable]);

            if (!this.isNumber(v) || Number.isNaN(v) ) v = this.nodeMid;

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
        if (node?.isCollapsedAggregate) {
            return [
                node.nodeColor || this.widgets['node-color'],
                Number.isFinite(Number(node.bgOpacity)) ? Number(node.bgOpacity) : 1
            ];
        }

        // If this node is a parent (polygon/group), keep using polygonColorMap
        if (node.isParent) {
            if (!this.commonService.session.style.widgets['polygons-color-show']) {
                return [this.commonService.session.style.widgets['polygon-color'], 0.5]
            } else {
                return [this.commonService.temp.style.polygonColorMap(node.label), this.commonService.temp.style.polygonAlphaMap(node.label)];
            }
        }
      
        const nodeStyle = this.commonService.getNodeFillStyle(node);
        return [nodeStyle.color, nodeStyle.alpha];
      }

    getLinkWidth(link: any) {
        let scalar = this.widgets['link-width'];
        let variable = this.widgets['link-width-variable'];

        // console.log('--- TwoD getLinkWidth link1: ', scalar, variable);
        if (variable == 'None') return scalar;

        const rawValue = link[variable];
        const numericValue = this.isNumber(rawValue) ? rawValue : Number(rawValue);

        if (!Number.isFinite(numericValue)) {
            return scalar;
        }

        const minWidth = this.widgets['link-width-min'];
        const maxWidth = this.widgets['link-width-max'];
        const reciprocal = this.widgets['link-width-reciprocal'];

        return this.linearScale(numericValue, this.linkMin, this.linkMax, minWidth, maxWidth, reciprocal);
    }


    getLinkColor(link: any) {
        let variable = this.widgets['link-color-variable'];
        let color = this.widgets['link-color'];
        let finalColor;
        let alphaValue;
        const linkColorValue = (() => {
            const value = link[variable];
            if (String(variable).toLowerCase() === 'origin' && Array.isArray(value)) {
                return value.length > 1 ? 'Duo-Link' : this.commonService.normalizeStyleCategoryValue(value[0]);
            }
            return this.commonService.normalizeStyleCategoryValue(value);
        })();

        //if ((variable == 'Origin' || variable == 'origin') && link.origin.length > 1) {
            //finalColor = this.commonService.temp.style.linkColorMap("Duo-Link");
            //alphaValue = this.commonService.temp.style.linkAlphaMap("Duo-Link");
        //} else {
        finalColor = (variable == 'None') ? color : this.commonService.temp.style.linkColorMap(linkColorValue);
        alphaValue = this.commonService.temp.style.linkAlphaMap(linkColorValue)
        //}

        if (this.overideTransparency) {
            alphaValue = this.widgets['link-opacity'];
        }

        return {
            color: finalColor,
            opacity: alphaValue
        };

    }

    private shouldRenderSplitOriginLinks(): boolean {
        const linkColorVariable = String(this.widgets?.['link-color-variable'] ?? 'None').toLowerCase();
        if (linkColorVariable !== 'origin') {
            return false;
        }

        return this.commonService.getVisibleLinks().some((link: any) =>
            Array.isArray(link?.origin) && link.origin.length > 1,
        );
    }

    private renderedHasSplitOriginLinks(): boolean {
        if (!this.cy) {
            return false;
        }

        return this.cy
            .edges(':visible')
            .toArray()
            .some((edge: any) => Boolean(edge.data('secondLink')));
    }

    /**
     * Gets the label for a node based on node label variable
     * @param node the node retrieve to get the value of the variable
     */
    getNodeLabel(node: any) {

        // If no label variable then should be none
        if (node?.isCollapsedAggregate) {
            return (this.widgets['node-label-variable'] == 'None') ? '' : (node.label || `${node.totalCount || 0} nodes`);
        }
        return (this.widgets['node-label-variable'] == 'None') ? '' : (String(node[this.widgets['node-label-variable']]) || '');

    }

    private formatLinkDistanceForDisplay(value: any, decimalLength?: number): string {
        const numericValue = Number(value);

        if (!Number.isFinite(numericValue)) {
            return `${value ?? ''}`;
        }

        if (String(this.widgets['default-distance-metric'] || '').toLowerCase() === 'snps') {
            return `${Math.round(numericValue)}`;
        }

        const usePercentageDisplay =
            String(this.widgets['default-distance-metric'] || '').toLowerCase() === 'tn93'
            && String(this.widgets['tn93-distance-display-format'] || 'decimal').toLowerCase() === 'percentage';

        const displayedValue = usePercentageDisplay ? numericValue * 100 : numericValue;

        if (decimalLength === undefined || decimalLength === null || Number.isNaN(Number(decimalLength))) {
            const formattedValue = displayedValue.toFixed(3).replace(/\.?0+$/, '');
            return usePercentageDisplay ? `${formattedValue}%` : formattedValue;
        }

        const decimals = Math.max(0, Math.floor(Number(decimalLength)));
        const formattedValue = displayedValue.toFixed(decimals);

        return usePercentageDisplay ? `${formattedValue}%` : formattedValue;
    }

    private formatNodeCollapseDistanceForDisplay(value: any, metric: string): string {
        if (String(metric || '').toLowerCase() === 'snps') {
            return this.commonService.formatDisplayedDistanceValue(value, 'distance', { decimals: 0 });
        }

        return this.commonService.formatDisplayedDistanceValue(value, metric);
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
                return { text: link['source'] }
            } else if (labelVariable == 'source_index') {
                return { text: link['source'] } // currently doesn't work; previous link.source and link.target were object now they are just a string of the id
                //return link['source']['index']
            } else if (labelVariable == 'target_id') {
                return { text: link['target'] }
            } else if (labelVariable == 'target_index') { // currently doesn't work; previous link.source and link.target were object now they are just a string of the id
                return { text: link['target'] }
                //return link['target']['index']
            } else if (labelVariable != 'distance') {
                return { text: `${link[labelVariable]}`  || '' };
            }
            if (this.debugMode) {
                console.log('cluster link: ', link);
            }
            const labelValue = link[labelVariable];
            // check if link has a distance origin and if the distance origin is included in the link.origin array, if not then the label should be 0
            if (link.distanceOrigin && !link.origin.includes(link.distanceOrigin)) {
                return { text: '' };
            } else if (!link.hasDistance) {
                return { text: '' }
            }

            if (typeof labelValue === 'number' || !isNaN(parseFloat(labelValue))) {
                if (String(this.widgets['default-distance-metric'] || '').toLowerCase() === 'snps') {
                    return { text: this.formatLinkDistanceForDisplay(labelValue) };
                } else {
                    return (labelValue != 0)
                        ? { text: this.formatLinkDistanceForDisplay(labelValue, this.widgets['link-label-decimal-length']) }
                        : { text: '' };
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
     * Calls setLinkLabelSize to update label-size and redraw labels
     */
    onLinkLabelSizeChange(e) {
        this.setLinkLabelSize(e.target.value);
    }

    /**
     * Updates link-label-size and then redraws labels
     */
    setLinkLabelSize(size) {
        this.widgets['link-label-size'] = parseFloat(size);
        this.updateLinkLabelSizes(); // Update label sizes without rerendering the entire network
        // document.documentElement.style.setProperty('--vis-graph-node-label-font-size', `${this.SelectedNodeLabelSizeVariable}pt`);
    }


    /**
     * Updates node-label-orientation and then redraws labels
     * @param e orientation such as Right, Left, Top, Bottom, Middle
     */
    onNodeLabelOrientationChange(e) {
        this.widgets['node-label-orientation'] = e;
        if (this.cy) {
            type TextAlignment = 'left' | 'center' | 'right';
            type VerticalAlignment = 'top' | 'bottom' | 'center';

            let textValign: VerticalAlignment = 'center';
            let textHalign: TextAlignment = 'center';

            switch (e.toLowerCase()) {
                case 'top':
                    textValign = 'top';
                    break;
                case 'bottom':
                    textValign = 'bottom';
                    break;
                case 'left':
                    textHalign = 'left';
                    break;
                case 'right':
                    textHalign = 'right';
                    break;
                case 'middle':
                case 'center':
                default:
                    textValign = 'center';
                    textHalign = 'center';
                    break;
            }

            this.cy.style()
                .selector('node[!isParent]')
                .style({
                    'text-valign': textValign,
                    'text-halign': textHalign
                })
                .update();
        }
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

    svgDefs = `
    <path id="blob" d="M 19.415 1.0564 C 20.585 2.47 20.225 5.89 21.665 8.2612 C 23.06 10.678 26.345 12.046 28.325 14.554 C 30.305 17.1076 31.025 20.8012 28.865 21.9412 C 26.75 23.1268 21.755 21.7588 18.605 23.3092 C 15.455 24.8596 14.105 29.3284 12.485 29.8756 C 10.865 30.3772 8.93 27.0028 6.41 25.042 C 3.89 23.1268 0.83 22.6708 0.38 20.9836 C -0.07 19.2964 2.135 16.378 2.54 13.642 C 2.945 10.9516 1.55 8.4892 2.135 7.03 C 2.72 5.5708 5.285 5.1148 7.355 4.294 C 9.47 3.4276 11.135 2.1964 13.34 1.2388 C 15.545 0.3268 18.245 -0.3116 19.415 1.0564 Z"/>
    <path id="cloud" d="M 14 -1 A 9 9 90 0 0 5 8 A 9 9 90 0 0 5.1055 9.3125 A 6 6 90 0 0 1 15 A 6 6 90 0 0 7 21 L 22 21 A 7 7 90 0 0 29 14 A 7 7 90 0 0 22.9414 7.0703 A 9 9 90 0 0 14 -1 z"/>
    <polygon id="diamond" points="0,15 15,0 30,15 15,30"/>
    <polygon id="house" points="4,18 4,30 13,30 13,24 17,24 17,30 26,30 26,18 30,18 15,0 0,18"/>
    `;

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
        $(`#${id}`).delay(500).css('display', 'none')
    }

    /**
     * Updates node-radius-max widget and redraws nodes
     */
    public onNodeRadiusMaxChange(e) {
        //this.widgets['node-radius-max'] = e;
        this.updateMinMaxNode();
        this.updateNodeSizes();
        
    }

    /**
     * Updates node-radius-min widget and redraws nodes
     */
    public onNodeRadiusMinChange(e) {
        //this.widgets['node-radius-min'] = e;
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

        this.widgets['node-radius'] = this.SelectedNodeRadiusSizeVariable;
        if (this.isNodeCollapseEnabled() && this.cy) {
            this.refreshNodeCollapseRender();
            return;
        }
        this.updateNodeSizes(); // Update node sizes without rerendering the entire network

    }

    /**
     * Rerenders whole data set by resetting data object
     */
    private async _rerender(timelineTick=false) {

        if (this.isDestroyed) return;

        console.log('--- TwoD DATA network rerender');
        const rerenderStart = this.getPerformanceNow();
        const hadCytoscapeAtStart = !!this.cy;

        if (!this.isCytoscapeContainerReady()) {
            if (this.viewActive) {
                setTimeout(() => void this._rerender(timelineTick), 50);
            } else {
                this.rerenderOnActive = true;
            }
            return;
        }

        if (!timelineTick) {
            // If the network is in the middle of rendering, don't rerender
            if(this.isNetworkRendering()) {
                this.recordTwoDRenderTiming('twoDRerenderSkipped', rerenderStart, {
                    reason: 'already-rendering',
                    timelineTick
                });
                return;
            }

            // Set rendering to true to prevent actions during rerendering
            this.setNetworkRendering(true);

            // Set rendered to false so to prevent other changes.  Needed to check to differentiate network has rendered for the first time vs checking if rendering is false
            this.store.setNetworkRendered(false);
        }

        const collectDataStart = this.getPerformanceNow();
        let networkData = this.getVisibleNetworkDataForRender(timelineTick || this.isTimelineFilteringActive());
        this.normalizeNetworkDataForCytoscape(networkData, false);
        networkData = this.applyNodeCollapseToNetworkData(networkData);
        this.normalizeNetworkDataForCytoscape(networkData, false);
        this.recordTwoDRenderTiming('twoDCollectVisibleGraphData', collectDataStart, {
            timelineTick,
            nodes: networkData.nodes.length,
            links: networkData.links.length
        });

       // Instead of calling synchronously, await the precomputation:
       if (!this.cy) {
        const precomputeStart = this.getPerformanceNow();
        const initialLayout = await this.precomputePositionsWithD3(networkData.nodes, networkData.links, 300);
        const refinementTicks = this.isNodeCollapseEnabled() ? 60 : 5;
        const refinementLayout = await this.precomputePositionsWithD3(initialLayout.nodes, initialLayout.links, refinementTicks, false);
        const { nodes: laidOutNodes, links: laidOutLinks } = refinementLayout;
        this.recordTwoDRenderTiming('twoDPrecomputePositions', precomputeStart, {
            nodes: laidOutNodes.length,
            links: laidOutLinks.length,
            ticks: 300 + refinementTicks,
            tickBatches: initialLayout.tickBatches + refinementLayout.tickBatches,
            initialTicksPerYield: initialLayout.ticksPerYield,
            refinementTicksPerYield: refinementLayout.ticksPerYield
        });

        if (this.isDestroyed || !this.cyContainer?.nativeElement) {
            this.setNetworkRendering(false);
            return;
        }

        if (this.debugMode) {
            console.log('--- TwoD networkData after precompute0: ', _.cloneDeep(networkData.links));
        }
        
        // Update networkData with the precomputed positions
        networkData.nodes = laidOutNodes;
        networkData.links = laidOutLinks;
       }

        this.normalizeNetworkDataForCytoscape(networkData);


        // Update Cytoscape visualization if it exists
        if (this.cy && !timelineTick) {
        
            await this._partialUpdate();
            if (!this.cy || this.isDestroyed || !this.isCytoscapeUsable(this.cy)) {
                this.setNetworkRendering(false);
                return;
            }
            this.ensurePolygon();
            this.recordTwoDRenderTiming('twoDRerender', rerenderStart, {
                mode: 'partial',
                timelineTick,
                hadCytoscapeAtStart,
                nodes: this.cy.nodes().length,
                edges: this.cy.edges().length
            });

	        } else if (this.cy && timelineTick) {
	            this.data = this.commonService.convertToGraphDataArray(networkData);
	            this.cacheNodeDataById(this.data.nodes);

	            // Add new nodes and edges
            const timelineUpdateStart = this.getPerformanceNow();
            this.cy.elements().remove();
            const newElements = this.mapDataToCytoscapeElements(this.data, true);
            this.cy.add(newElements);
            this.recordTwoDRenderTiming('twoDTimelineUpdate', timelineUpdateStart, {
                nodes: newElements.nodes.length,
                edges: newElements.edges.length
            });

            // Apply the Cose layout to arrange the nodes
            // const layout = this.cy.layout({
            //     name: 'preset',
            //     fit: true, // Fit the graph within the viewport
            //     padding: 30, // Padding around the graph
                
            // });

            // layout.run();
            if (this.commonService.session.style.widgets['polygons-show']) {
                this.updateGroupAssignments(this.widgets['polygons-foci'], false);
            }
            this.recordTwoDRenderTiming('twoDRerender', rerenderStart, {
                mode: 'timeline',
                timelineTick,
                hadCytoscapeAtStart,
                nodes: this.cy.nodes().length,
                edges: this.cy.edges().length
            });


        } else{
	            const convertStart = this.getPerformanceNow();
	            this.data = this.commonService.convertToGraphDataArray(networkData);
	            this.cacheNodeDataById(this.data.nodes);
	            this.recordTwoDRenderTiming('twoDConvertGraphData', convertStart, {
                nodes: this.data.nodes.length,
                links: this.data.links.length
            });

            if (this.debugMode) {
                // 1) Log raw incoming data
                console.log("🚀 Debug: raw networkData links:", networkData.links);
                console.log("🚀 Debug: raw networkData nodes:", networkData.nodes);

                // 2) Log the “converted” data
                console.log("🚀 Debug: data from convertToGraphDataArray:", this.data);
            }
            
            // Destroy old instance if any
            if (this.cy) {
              this.cy.destroy();
            }
            
            // 3) Build Cytoscape “elements”
            const el = this.mapDataToCytoscapeElements(this.data);
            if (this.debugMode) {
                console.log("🚀 Debug: mapDataToCytoscapeElements output:", _.cloneDeep(el));
            }
            
            // Optional: check for duplicates & invalid references
            const validateElementsStart = this.getPerformanceNow();
            const seenIds = new Set();
            const elementNodeIds = new Set(el.nodes.map(node => node.data.id));
            el.edges.forEach(edge => {
              const { id, source, target } = edge.data;
            
              // 3A) Check for duplicate edge IDs
              if (seenIds.has(id)) {
                console.warn("❌ Duplicate edge ID:", id, edge);
              } else {
                seenIds.add(id);
              }
            
              // 3B) Check for missing node references
              const hasSource = elementNodeIds.has(source);
              const hasTarget = elementNodeIds.has(target);
              if (!hasSource || !hasTarget) {
                console.warn("❌ Edge references invalid node:", edge.data);
                }
            });
            this.recordTwoDRenderTiming('twoDValidateElements', validateElementsStart, {
                nodes: el.nodes.length,
                edges: el.edges.length,
                uniqueEdges: seenIds.size
            });
            
            // 4) Actually create Cytoscape
            const cytoscapeCreateStart = this.getPerformanceNow();
            if (this.debugMode) {
                console.log(this.cyContainer);
            }
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
            this.cy.resize();
            this.recordTwoDRenderTiming('twoDCreateCytoscape', cytoscapeCreateStart, {
                nodes: el.nodes.length,
                edges: el.edges.length
            });
            
            if ((window as any).Cypress) {
              (window as any).cytoscapeInstance = this.cy;
              
              // Create a dedicated namespace for all test functions
              (window as any).Cypress.test = {
                // Interaction helpers
                dragNodeDelta: (nodeId: string, dx: number, dy: number) => {
                    return this.zone.run(() => {
                    const node = this.cy.getElementById(nodeId);
                    if (!node || node.empty()) {
                        console.warn('[Cypress.dragNodeDelta] node not found', nodeId);
                        return null;
                    }

                    if (node.locked && node.locked()) {
                        node.unlock();
                    }

                    const current = node.position();
                    const newPos = {
                        x: current.x + dx,
                        y: current.y + dy
                    };

                    node.position(newPos);

                    // ✅ keep app model in sync, like a real dragfree event
                    this.updateNodePos(node);

                    return newPos;  // so the test can assert directly
                    });
                },
                selectNodesInRenderedBox: (x1: number, y1: number, x2: number, y2: number) => {
                    return this.zone.run(() => {
                        const left = Math.min(x1, x2);
                        const right = Math.max(x1, x2);
                        const top = Math.min(y1, y2);
                        const bottom = Math.max(y1, y2);

                        const nodesToSelect = this.cy
                            .nodes(':visible')
                            .filter((node: any) => !node.hasClass('parent') && node.children().length === 0)
                            .filter((node: any) => {
                                const position = node.renderedPosition();
                                return (
                                    position.x >= left &&
                                    position.x <= right &&
                                    position.y >= top &&
                                    position.y <= bottom
                                );
                            });

                        this.cy.elements().unselect();
                        nodesToSelect.select();

                        return nodesToSelect.map((node: any) => node.id());
                    });
                },
                tooltip: (action: 'show' | 'hide', nodeId: string) => {
                  this.zone.run(() => {
                      const node = this.cy.getElementById(nodeId);
	                      if (node) {
	                          if (action === 'show') {
	                              const mockEvent = { clientX: 100, clientY: 100 };
	                              this.showNodeTooltip(this.getFullNodeDataForCyNode(node), mockEvent);
	                          } else {
                              this.hideTooltip();
                          }
                      }
                  });
              },
                hoverNode: (action: 'show' | 'hide', nodeId: string) => {
                    this.zone.run(() => {
                        const node = this.cy.getElementById(nodeId);
                        if (!node || node.empty()) return;

	                        if (action === 'show') {
	                            const mockEvent = { clientX: 120, clientY: 120 };
	                            this.showNodeTooltip(this.getFullNodeDataForCyNode(node), mockEvent);
                            if (this.widgets['node-highlight']) {
                                node.connectedEdges().addClass('highlighted');
                            }
                            return;
                        }

                        this.hideTooltip();
                        if (this.widgets['node-highlight']) {
                            node.connectedEdges().removeClass('highlighted');
                        }
                    });
                },
                linkTooltip: (action: 'show' | 'hide', edgeId: string) => {
                    this.zone.run(() => {
                      const edge = this.cy.getElementById(edgeId);
                      if (edge) {
                          if (action === 'show') {
                                const mockEvent = { clientX: 300, clientY: 300 };
                                this.showLinkTooltip(edge.data(), mockEvent);
                            } else {
                                this.hideTooltip();
                            }
                        }
                    });
                },
    
                // New settings helpers
                setNodeSize: (size: number) => {
                    this.zone.run(() => {
                        this.SelectedNodeRadiusSizeVariable = size;
                        this.onNodeRadiusChange(size);
                    });
                },
                setLinkWidth: (width: number) => {
                    this.zone.run(() => {
                        this.SelectedLinkWidthVariable = width;
                        this.onLinkWidthChange(width);
                    });
                },
                togglePolygons: (show: boolean) => {
                    this.zone.run(() => this.polygonsToggle(show));
                },
                setNodeLabel: (variable: string) => {
                    this.zone.run(() => {
                        this.SelectedNodeLabelVariable = variable;
                        this.onNodeLabelVaribleChange(variable);
                    });
                },
                setNodeBorderWidth: (width: number) => {
                    this.zone.run(() => {
                        this.nodeBorderWidth = width;
                        this.onNodeBorderWidthChange(width);
                    });
                },
                toggleLinkArrows: (show: boolean) => {
                    this.zone.run(() => {
                        const value = show ? 'Show' : 'Hide';
                        this.SelectedLinkArrowTypeVariable = value;
                        this.onLinkDirectedUndirectedChange(value);
                    });
                },
                toggleGridlines: (show: boolean) => {
                     this.zone.run(() => {
                        const value = show ? 'Show' : 'Hide';
                        this.SelectedNetworkGridLineTypeVariable = value;
                        this.onNetworkGridlinesShowHideChange(value);
                    });
                },
                setNodeLabelSizeAndOrientation: (size: number, orientation: string) => {
                    this.zone.run(() => {
                        this.SelectedNodeLabelSizeVariable = size;
                        this.setNodeLabelSize(size);
                        this.SelectedNodeLabelOrientationVariable = orientation as any;
                        this.onNodeLabelOrientationChange(orientation);
                    });
                },
                setNodeSizeByVariable: (variable: string) => {
                    this.zone.run(() => {
                        this.SelectedNodeRadiusVariable = variable;
                        this.onNodeRadiusVariableChange(variable);
                    });
                },
                setLinkOpacity: (opacity: number) => {
                    this.zone.run(() => {
                        this.SelectedLinkTransparencyVariable = opacity;
                        this.onLinkOpacityChange(opacity);
                    });
                },
                toggleGroupLabels: (show: boolean) => {
                    this.zone.run(() => {
                        this.widgets['polygons-label-show'] = show;
                        this.onPolygonLabelShowChange(show);
                    });
                },
                setLinkWidthByVariable: (variable: string) => {
                    this.zone.run(() => {
                        this.SelectedLinkWidthByVariable = variable;
                        this.onLinkWidthVariableChange(variable);
                    });
                },
                setLinkLength: (length: number) => {
                    this.zone.run(() => {
                        this.SelectedLinkLengthVariable = length;
                        this.onLinkLengthChange(length);
                    });
                },
                toggleNeighborHighlighting: (highlight: boolean) => {
                    this.zone.run(() => {
                        const value = highlight ? 'Highlighted' : 'Normal';
                        this.SelectedNetworkNeighborTypeVariable = value;
                        this.onDontHighlightNeighborsHighlightNeighborsChange(value);
                    });
                },
                setGroupByVariable: (variable: string) => {
                    this.zone.run(() => {
                         this.centerPolygons(variable);
                    });
                },
                setGroupLabelSizeAndOrientation: (size: number, orientation: string) => {
                     this.zone.run(() => {
                        this.SelectedPolygonLabelSizeVariable = size;
                        this.onPolygonLabelSizeChange(size);
                        this.SelectedPolygonLabelOrientationVariable = orientation as any;
                        this.onPolygonLabelOrientationChange(orientation);
                    });
                }
              };
            }
            // Attach events
            this.attachCytoscapeEvents();
            
            const initialReadyStart = this.getPerformanceNow();
            let initialRenderFinished = false;
            const finishInitialRender = (source: string) => {
              if (initialRenderFinished || !this.cy) {
                return;
              }
              initialRenderFinished = true;
              const endTime = this.getPerformanceNow();
              const readyDurationMs = endTime - initialReadyStart;
              if (this.debugMode) {
                console.log(`✅ Cytoscape initial ready in ${readyDurationMs.toFixed(2)}ms via ${source}`);
              }
              this.commonService.recordPerformanceDuration('render', 'twoDInitialReady', readyDurationMs, {
                view: '2D Network',
                nodes: this.cy.nodes().length,
                edges: this.cy.edges().length,
                timelineTick,
                source
              });
              this.commonService.recordPerformanceDuration('render', 'twoDLayout', readyDurationMs, {
                view: '2D Network',
                nodes: this.cy.nodes().length,
                edges: this.cy.edges().length,
                timelineTick,
                explicitLayoutRun: false,
                source: 'constructor-preset-ready'
              });
            
              if (this.debugMode) {
                console.log('twod 1 polygons show: ', this.widgets['polygons-show']);
              }
              // Update polygons to show if they should be
              if (this.commonService.session.style.widgets['polygons-show']) {
                const polygonsStart = this.getPerformanceNow();
                if (this.debugMode) {
                    console.log('twod 2323 polygons color show: ', this.commonService.session.style.widgets['polygons-color-show']);
                }

                this.polygonsToggle(true)
                this.centerPolygons(this.commonService.session.style.widgets['polygons-foci']);
                if (this.debugMode) {
                    console.log('twod 11 polygons color show: ', this.commonService.session.style.widgets['polygons-color-show']);
                }

                if (this.commonService.session.style.widgets['polygons-color-show']) {
                    this.onPolygonColorTableChange(this.commonService.session.style.widgets['polygon-color-table-visible']);
                    this.updateGroupNodeColors();
                    // this.polygonColorsToggle(this.widgets['polygon-color-table-visible'])
                    // this.updateGroupNodeColors();
                    if (this.debugMode) {
                        console.log('twod 2polygons show: ', this.commonService.session.style.widgets['polygon-color-table-visible']);
                    }
                }
                this.recordTwoDRenderTiming('twoDPostLayoutPolygons', polygonsStart, {
                    nodes: this.cy.nodes().length,
                    edges: this.cy.edges().length
                });
               }

              // Mark as rendered
              this.store.setNetworkRendered(true);
              this.store.setNetworkUpdated(false);
              this.setNetworkRendering(false);
              this.commonService.demoNetworkRendered = true;

              if (this.pendingPartialUpdate) {
                void this._partialUpdate();
              }

              this.recordTwoDRenderTiming('twoDRerender', rerenderStart, {
                mode: 'initial',
                timelineTick,
                hadCytoscapeAtStart,
                nodes: this.cy.nodes().length,
                edges: this.cy.edges().length
              });
            };

            this.cy.ready(() => {
                if (typeof requestAnimationFrame === 'function') {
                    requestAnimationFrame(() => finishInitialRender('cy-ready-animation-frame'));
                } else {
                    setTimeout(() => finishInitialRender('cy-ready-timeout-frame'), 0);
                }
            });
            setTimeout(() => finishInitialRender('timeout'), 500);
            

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
        if (node?.isCollapsedAggregate) {
            return 'ellipse';
        }

        return resolveNodeShapeForNode(
            node,
            this.commonService.session.style.widgets,
            this.commonService.session.style,
            this.commonService.temp.style.nodeSymbolMap
        );
    }

    /**
     * Updates polygon color table count/frequency column visibility.
     */
    toggleTableColumns(table: string, column: string) {
        if (table == 'polygon-color' && column == 'tableCounts') {
            this.widgets['polygon-color-table-counts'] = !this.widgets['polygon-color-table-counts']
        } else if (table == 'polygon-color' && column == 'tableFreq') {
            this.widgets['polygon-color-table-frequencies'] = !this.widgets['polygon-color-table-frequencies']
        } else {
            return;
        }
        if (table == 'polygon-color') {
            this.updateCountFreqTable(table);
        }
        this.cdref.markForCheck();
    }

    /**
     * Toggles the polygon color table settings menu.
     */
    toggleColorTableSettings(tableName: string) {
        if (tableName != 'polygon-color') {
            return;
        }
        const settingsPane = $('#polygonColorTableSettings');
        
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
        let showCount, showFreq;
        if (tableName == 'polygon-color') {
            showCount = this.widgets['polygon-color-table-counts'];
            showFreq = this.widgets['polygon-color-table-frequencies'];
            this.cdref.markForCheck();
        }
        const tableSelector = tableName == 'polygon-color'
            ? this.getActivePolygonColorTableSelector()
            : '#polygon-color-table';
        const countColumn = $(tableSelector + ' .tableCount');
        const freqColumn = $(tableSelector + ' .tableFrequency');
        console.log(showCount, showFreq, countColumn, freqColumn);
        (showCount) ? countColumn.slideDown() : countColumn.slideUp();
        (showFreq) ? freqColumn.slideDown() : freqColumn.slideUp();
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
        this.updateLinkLabels();
    }

    private updateLinkLabels(): void {
        if (!this.cy) return;
        this.cy.edges().forEach(edge => {
            const newLabel = this.getLinkLabel(edge.data()).text;
            edge.data('label', newLabel);
        });
    }

    public refreshDistanceMetricSettings(): void {
        this.ensureNodeCollapseWidgetDefaults();
        this.updateLinkLabels();
        this.syncNodeCollapseControlsFromWidgets();
        this.cdref.detectChanges();

        if (this.isNodeCollapseEnabled()) {
            this.refreshNodeCollapseRender();
        }
    }

    refreshDistanceDisplayFormat(): void {
        this.updateLinkLabels();
        this.syncNodeCollapseControlsFromWidgets();
        this.cdref.detectChanges();
    }

    /**
     * Updates link-label-decimal-length widget and updates label with updated number of decimal points
     */
    onLinkDecimalVariableChange(e) {
        this.widgets['link-label-decimal-length'] = e;
        this.updateLinkLabels();
        
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

        if (e === 'None') {
            this.scaleLinkWidth();
            return;
        }

        this.onLinkWidthReciprocalNonReciprocalChange(this.getSelectedLinkReciprocalType());
        
    }

    private getSelectedLinkReciprocalType(): string {
        const selectedLabel = $('#link-width-reciprocal-non-reciprocal .p-highlight')
            .text()
            .trim();

        if (selectedLabel.includes('Non-Reciprocal')) {
            return 'Non-Reciprocal';
        }

        if (selectedLabel.includes('Reciprocal')) {
            return 'Reciprocal';
        }

        return this.SelectedLinkReciprocalTypeVariable;
    }

    /**
     * Updates the values for this.nodeMin, this.nodeMax, this.nodeMid and uses that info to update this.nodeScale() to set the size of the nodes
     */
    updateMinMaxNode() {
        this.visNodes = this.commonService.getVisibleNodes();
        let sizeVariable = this.widgets['node-radius-variable'];
    
        this.nodeMin = Infinity;
        this.nodeMax = -Infinity;
        for (const node of this.visNodes) {
            let size = Number(node[sizeVariable]);
            if (!Number.isFinite(size)) continue;
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
        this.SelectedLinkReciprocalTypeVariable = e;
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
        if (this.commonService.session.network.allPinned) {
            // updating link length results in recaculcating node positions, if nodes are pinned prevent this
            this.SelectedLinkLengthVariable = this.widgets['link-length'];
            return;
        }
        this.widgets['link-length'] = this.SelectedLinkLengthVariable;
        this.updateLayout();
    }

   /**
 * Applies arrow styling to edges based on:
 * - Global arrow toggle (widgets['link-directed'])
 * - Per-edge directionality (edge.data().directed)
 * - Optional bidirectional toggle + per-edge flag (widgets['link-bidirectional'] + edge.data().bidirectional)
 */
private updateArrowStyles(): void {
    if (!this.cy) return;
  
    const isTruthy = (v: any): boolean => {
      if (v === true) return true;
      if (v === false || v === null || v === undefined) return false;
      if (typeof v === 'number') return v !== 0;
      if (typeof v === 'string') {
        const s = v.trim().toLowerCase();
        return s === 'true' || s === '1' || s === 'yes' || s === 'y';
      }
      return false;
    };
  
    const shouldShowDirected = (data: any): boolean => {
      if (!this.widgets['link-directed']) return false;
      return isTruthy(data?.directed);
    };
  
    const shouldShowSource = (data: any): boolean => {
      if (!shouldShowDirected(data)) return false;
      if (!this.widgets['link-bidirectional']) return false;
      return isTruthy(data?.bidirectional);
    };
  
    this.cy.style()
      .selector('edge')
      .style({
        'target-arrow-shape': (ele) => {
          const data = ele.data();
          return shouldShowDirected(data) ? 'triangle' : 'none';
        },
        'source-arrow-shape': (ele) => {
          const data = ele.data();
          return shouldShowSource(data) ? 'triangle' : 'none';
        },
        'target-arrow-color': 'data(lineColor)',
        'source-arrow-color': 'data(lineColor)',
        'curve-style': 'straight'
      })
      .update();
  }


    /**
     * Updates link-directed widget. When directed, links have an arrow added; when undirected, links have no arrow
     */
    onLinkDirectedUndirectedChange(e: string) {
        if (e === "Show") {
          $('#link-bidirectional-row').slideDown().css('display', 'flex');
          this.widgets['link-directed'] = true;
        } else {
          this.widgets['link-directed'] = false;
          $("#link-bidirectional-row").slideUp();
        }
      
        this.updateArrowStyles();
      }



      onLinkBidirectionalChange(e: string) {
        this.widgets['link-bidirectional'] = (e === "Show");
        this.updateArrowStyles();
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

        if (this.isNodeCollapseEnabled()) {
            this.refreshNodeCollapseRender();
            return;
        }

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
	            const fullNode = this.getFullNodeDataForCyNode(node);
	            const [newColor, opacity] = this.getNodeColor(fullNode);
	            node.data('nodeColor', newColor);
            node.data('bgOpacity', opacity);
            node.data('borderColor', newColor);

            const shapeKey = node.data('shapeKey');
            if (isCustomNodeIconShape(shapeKey)) {
                const customShapeData = getCustomNodeShapeData(shapeKey, newColor);
                node.data('iconBackgroundImage', customShapeData.iconBackgroundImage);
            }
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
            const width = this.linearScale(dataValue, min, max, minWidth, maxWidth, reciprocal);
            edge.data('width', width);
        } else {
            // Handle non-numeric values if necessary
            edge.data('width', minWidth);
        }
    });

    // Update Cytoscape stylesheet to use the scaledWidth data
    this.cy.style().selector('edge').style({
        'width': 'data(width)'
    }).update();
}
    /**
     * centers the view
     */
    fit() {
        if (this.cy) {
            this.cy.resize();
            this.cy.fit(this.cy.nodes(), 30);
        }
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
        this.syncNodeCollapseControlsFromWidgets();
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
        this.fit();
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
    private isCytoscapeUsable(cy: Core | null | undefined = this.cy): cy is Core {
        if (!cy) return false;

        try {
            if (cy.destroyed()) return false;

            return !!(cy as any).renderer?.();
        } catch {
            return false;
        }
    }

    private async _partialUpdate() {
        const partialUpdateStart = this.getPerformanceNow();
        console.log('--- TwoD _partialUpdate called');
        const cy = this.cy;
        if (!this.isCytoscapeUsable(cy)) {
            // Initial settings sync can request updates before Cytoscape is ready.
            if (!this.isDestroyed) {
                this.pendingPartialUpdate = true;
            }
            this.recordTwoDRenderTiming('twoDPartialUpdateSkipped', partialUpdateStart, {
                reason: 'cytoscape-not-ready'
            });
            return;
        }

    this.pendingPartialUpdate = false;

    // Cache positions BEFORE making changes to the graph
    if (!this.nodePositions) {
        this.nodePositions = new Map<string, { x: number; y: number }>();
    }
    cy.nodes().forEach(node => {
        const currentPosition = node.position();
        if (!this.nodePositions.has(node.id())) {
            this.nodePositions.set(node.id(), currentPosition); // Cache position
        }
    });

    // Retrieve fresh node/link data. Timeline renders only links whose
    // endpoints are currently timeline-visible, matching the statistics panel.
    const collectDataStart = this.getPerformanceNow();
    let networkData = this.getVisibleNetworkDataForRender();
    this.recordTwoDRenderTiming('twoDPartialCollectVisibleGraphData', collectDataStart, {
        nodes: networkData.nodes.length,
        links: networkData.links.length
    });

    // Keep layout collision sizing in sync with current style widgets.
    networkData.nodes.forEach(node => {
        node.nodeSize = Number(this.getNodeSize(node));
    });
    this.normalizeNetworkDataForCytoscape(networkData, false);
    networkData = this.applyNodeCollapseToNetworkData(networkData);
    this.normalizeNetworkDataForCytoscape(networkData);

    const precomputeStart = this.getPerformanceNow();
    const partialLayout = await this.precomputePositionsWithD3(networkData.nodes, networkData.links, 30, false);
    const { nodes: laidOutNodes, links: laidOutLinks } = partialLayout;

    if (this.isDestroyed || this.cy !== cy || !this.isCytoscapeUsable(cy)) {
        return;
    }

    networkData.nodes = laidOutNodes;
    networkData.links = laidOutLinks;
    this.normalizeNetworkDataForCytoscape(networkData);
    this.recordTwoDRenderTiming('twoDPartialPrecomputePositions', precomputeStart, {
        nodes: laidOutNodes.length,
        links: laidOutLinks.length,
        ticks: 30,
        tickBatches: partialLayout.tickBatches,
        ticksPerYield: partialLayout.ticksPerYield
    });

    // Use batch mode to disable auto-panning during updates
    const batchStart = this.getPerformanceNow();
    cy.batch(() => {
        if (this.debugMode) {
            console.log('--- TwoDComponent _partialUpdate called:  ', networkData.links);
        }

	        this.data = this.commonService.convertToGraphDataArray(networkData);
	        this.cacheNodeDataById(this.data.nodes);
	        const newElements = this.mapDataToCytoscapeElements(this.data);

        // Collect new IDs for membership checks
        const newNodeIds = new Set(newElements.nodes.map(n => n.data.id));
        const newNodeById = new Map(newElements.nodes.map(n => [n.data.id, n]));
        // @ts-ignore
        const newLinkIds = new Set(newElements.edges.map(l => l.data.id));

        // Update node visibility and restore positions
        cy.nodes().forEach(node => {
            if (!newNodeIds.has(node.id()) && !node.hasClass('parent')) {
                // Hide node but keep its cached position
                node.addClass('hidden');
            } else {
                // Ensure node is visible
                node.removeClass('hidden');

                // Restore position from cache
                const newNode = newNodeById.get(node.id());
                if (newNode) {
                    node.data({ ...node.data(), ...newNode.data, });
                    node.position({x: newNode.data.x, y: newNode.data.y}); // Restore position
                }
            }
        });

        // Always add missing render IDs. Collapse can reduce total nodes while
        // introducing new aggregate IDs, so count-based checks are insufficient.
        newElements.nodes.forEach(n => {
            const cyNode = cy.getElementById(n.data.id);
            if (!cyNode || !cyNode.length) {
                cy.add(n);
            }
        });

        // Remove old edges
        cy.edges().forEach(edge => {
            if (!newLinkIds.has(edge.id())) {
                cy.remove(edge);
            }
        });

        const linkMap = new Map(networkData.links.map(l => [l.id, l]));


        // Add/Update new edges
        newElements.edges.forEach(e => {
            let cyEdge = cy.getElementById(e.data.id);
            if (!cyEdge || !cyEdge.length) {
                cyEdge = cy.add(e); // Add edge
            } else if (cyEdge.source().id() !== e.data.source || cyEdge.target().id() !== e.data.target) {
                // Cytoscape edge endpoints are not retargeted by mutating data.
                cy.remove(cyEdge);
                cyEdge = cy.add(e);
            } else {
                cyEdge.data({ ...cyEdge.data(), ...e.data }); // Update edge data
            }

            // Ensure label is updated based on filtered link data
            const data = linkMap.get(cyEdge.id());
            if (data == undefined) return;
            const labelVal = this.getLinkLabel(data).text;
            cyEdge.data('label', labelVal ?? "");

        });

        if (this.debugMode) {
            console.log('----DUo Edge2: ', newElements.edges.filter(edge => (edge.data.source === 'MZ745515' && edge.data.target === 'MZ712879') || (edge.data.source === 'MZ712879' && edge.data.target === 'MZ745515')));
        }

        // console.log('----newedges: ', _.cloneDeep(newElements.edges));

    });
    this.recordTwoDRenderTiming('twoDPartialBatchSync', batchStart, {
        nodes: cy.nodes().length,
        edges: cy.edges().length
    });

        if (this.isDestroyed || this.cy !== cy || !this.isCytoscapeUsable(cy)) {
            return;
        }

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
           this.setNetworkRendering(false);
           this.recordTwoDRenderTiming('twoDPartialUpdate', partialUpdateStart, {
            nodes: cy.nodes().length,
            edges: cy.edges().length
           });

    }

    applyStyleFileSettings() {
        this.widgets = this.commonService.session.style.widgets;
        this.ensureNodeCollapseWidgetDefaults();
        this.loadSettings();
        this._partialUpdate(); 
    }

    ngOnDestroy(): void {

        console.log("calling destroy");
        this.isDestroyed = true;
        this.pendingPartialUpdate = false;
        this.destroy$.next();
        this.destroy$.complete();
        this.setNetworkRendering(false);

        this.styleFileSub.unsubscribe();

        this.settingsLoadedSubscription.unsubscribe();

        if (this.cy){
            this.cy.removeAllListeners();
            if ((window as any).cytoscapeInstance === this.cy) {
                delete (window as any).cytoscapeInstance;
            }
            this.cy.destroy();
            this.cy = null;
        }
        if (this.commonService.visuals.twoD === this) {
            (this.commonService.visuals as any).twoD = null;
        }
        $('#cy').off('contextmenu.twod');
        this.cyContainer = null;


    }

    /**
     * renders the network
     */
    onLoadNewData() {
        if (this.isDestroyed) return;

        if (this.debugMode) {
            console.log('render new data');
        }

        console.log('onLoadNewData');
        this.widgets = this.commonService.session.style.widgets;
        this.ensureNodeCollapseWidgetDefaults();
        this.IsDataAvailable = (this.commonService.session.data.nodes.length > 0);

        if (!this.IsDataAvailable) {
            return;
        }

        if (this.isDestroyed) {
            return;
        }

        if (!this.cyContainer?.nativeElement) {
            setTimeout(() => this.onLoadNewData(), 0);
            return;
        }

        if (!this.isCytoscapeContainerReady()) {
            if (this.viewActive) {
                setTimeout(() => this.onLoadNewData(), 50);
            } else {
                this.rerenderOnActive = true;
            }
            return;
        }

        if (this.cy) {
            this.debouncedRerender();
            return;
        }

        void this._rerender();
    }

    /**
     * renders the network;
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
        this.ensureNodeCollapseWidgetDefaults();

        //Polygons|Label Size
        this.SelectedPolygonLabelSizeVariable = this.widgets['polygons-label-size'];
        this.onPolygonLabelSizeChange(this.SelectedPolygonLabelSizeVariable);

        //Polygon Orientation
        let widgetPolygonOrientation = this.widgets['polygon-label-orientation']
        this.SelectedPolygonLabelOrientationVariable = widgetPolygonOrientation == 'top' ? 'Top' : widgetPolygonOrientation == 'bottom' ? 'Bottom': widgetPolygonOrientation == 'middle'? 'Middle': widgetPolygonOrientation;
        this.onPolygonLabelOrientationChange(this.SelectedPolygonLabelOrientationVariable);

        this.polygonsToggle(this.widgets['polygons-show']);
        if (this.commonService.session.style.widgets['polygons-show']) {
            this.polygonColorsToggle(this.commonService.session.style.widgets['polygons-color-show'], false);
            this.onPolygonColorTableChange(this.commonService.session.style.widgets['polygon-color-table-visible']);
            this.updatePolygonColors();
            this.updateGroupNodeColors();
        }

        //Nodes|Label
        this.SelectedNodeLabelVariable = this.widgets['node-label-variable'];
        console.log('----TWOD SelectedNodeLabelVariable: ', this.SelectedNodeLabelVariable);
        this.onNodeLabelVaribleChange(this.SelectedNodeLabelVariable);

        //Node|Orientation
        this.SelectedNodeLabelOrientationVariable = this.widgets['node-label-orientation'];
        this.onNodeLabelOrientationChange(this.SelectedNodeLabelOrientationVariable);

        //Node|Label Size
        this.SelectedNodeLabelSizeVariable = this.widgets['node-label-size'];
        this.setNodeLabelSize(this.SelectedNodeLabelSizeVariable);

        if (!Array.isArray(this.widgets['node-tooltip-variable'])) {
            this.widgets['node-tooltip-variable'] = [this.widgets['node-tooltip-variable']];
        }
        this.SelectedNodeTooltipVariable = this.widgets['node-tooltip-variable'];
        this.onNodeTooltipVariableChange(this.SelectedNodeTooltipVariable);

        //Nodes|Shape
        this.widgets['node-symbol'] = this.mapPreviousShapeNameToCurrent(this.widgets['node-symbol']);
        this.updateNodeShapes();

        //Nodes|Size By
        this.SelectedNodeRadiusVariable = this.widgets['node-radius-variable'];
        this.onNodeRadiusVariableChange(this.SelectedNodeRadiusVariable);

        //Nodes|Size
        if (Number(this.widgets['node-radius']) > 100 || Number(this.widgets['node-radius']) < 0) {
            this.widgets['node-radius'] = 20;
        }
        this.SelectedNodeRadiusSizeVariable = Number(this.widgets['node-radius']);
        this.onNodeRadiusChange(this.SelectedNodeRadiusSizeVariable);

        this.nodeBorderWidth = this.widgets['node-border-width']
        this.syncNodeCollapseControlsFromWidgets();

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
        if (this.widgets['link-length'] < 1) {
            this.widgets['link-length'] = 50;
        }
        this.SelectedLinkLengthVariable = this.widgets['link-length'];
        this.onLinkLengthChange(this.SelectedLinkLengthVariable);

       //Links|Arrows
        this.SelectedLinkArrowTypeVariable = this.widgets['link-directed'] ? "Show" : "Hide";
        this.onLinkDirectedUndirectedChange(this.SelectedLinkArrowTypeVariable);

        //Links|Bidirectional
        this.SelectedLinkBidirectionalTypeVariable = this.widgets['link-bidirectional'] ? "Show" : "Hide";
        this.onLinkBidirectionalChange(this.SelectedLinkBidirectionalTypeVariable);


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
        let polygonOrientations = ['Top', 'Bottom', 'Center', 'Left', 'Right']
        if ( !polygonOrientations.includes(this.widgets['polygon-label-orientation'])) {
            this.widgets['polygon-label-orientation'] = 'Top';
        }

        //Network|Polygon Orientation
        this.SelectedPolygonLabelOrientationVariable = this.widgets['polygon-label-orientation'];
        this.onPolygonLabelOrientationChange(this.SelectedPolygonLabelOrientationVariable);
    }

    private isGroupNode(node: cytoscape.NodeSingular): boolean {
        return node.hasClass('parent') || node.data('isParent') === true || node.children().length > 0;
    }

    private resetGroupNodeShapeData(node: cytoscape.NodeSingular): void {
        node.data('shape', 'rectangle');
        node.removeData('shapeKey');
        node.removeData('iconBackgroundImage');
        node.removeData('customIconKey');
    }

    /**
     * Updates the sizes of all nodes based on the current widget settings.
     */
    updateLinkColor() {
        console.log('----TWOD updateLinkColor called');
        if (!this.cy) return;
        this.widgets = this.commonService.session.style.widgets;

        // Origin coloring in 2D adds or removes duplicate dashed edges for
        // mixed-origin links, so a recolor-only update is unsafe whenever the
        // rendered topology no longer matches the active mode.
        if (this.shouldRenderSplitOriginLinks() !== this.renderedHasSplitOriginLinks()) {
            void this._rerender();
            return;
        }

        this.cy.edges().forEach(link => {
            const { color, opacity } = this.getLinkColor(link.data());
            link.data('lineColor', color);
            link.data('lineOpacity', opacity); // Ensure transparency is explicitly set
          });
        this.cy.style().update();
    }

    /**
     * Updates the sizes of all nodes based on the current widget settings.
     */
	    updateNodeSizes() {
	        if (!this.cy) return;
	        this.cy.nodes().forEach(node => {
            if (this.isGroupNode(node)) return;
	            const newSize = Number(this.getNodeSize(this.getFullNodeDataForCyNode(node)));
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
            if (this.isGroupNode(node)) return;
	            const newBorderWidth = this.getNodeBorderWidth(this.getFullNodeDataForCyNode(node));
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
	            if (this.isGroupNode(node)) return;
	                const newLabel = this.getNodeLabel(this.getFullNodeDataForCyNode(node));
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
        this.cy.style().update();
    }


    /**
     * Updates the font sizes of all node labels based on the current widget settings.
     */
    updateNodeLabelSizes() {
	        if (!this.cy) return;
	        this.cy.nodes().forEach(node => {
            if (this.isGroupNode(node)) return;
	            const newFontSize = this.getNodeFontSize(this.getFullNodeDataForCyNode(node));
	            node.data('fontSize', newFontSize);
	        });
        this.cy.style().update(); // Refresh Cytoscape styles to apply changes
    }

    /**
     * Updates the font sizes of all edge labels based on the current widget settings.
     */
    updateLinkLabelSizes() {
        if (!this.cy) return;
        this.cy.edges().forEach(edge => {
            const newFontSize = this.getLinkFontSize(edge.data());
            edge.data('fontSize', newFontSize);
        });
        this.cy.style().update(); // Refresh Cytoscape styles to apply changes
    }

	    updateNodeShapes() {
	        if (!this.cy) return;
	        this.cy.nodes().forEach(node => {
            if (this.isGroupNode(node)) {
                this.resetGroupNodeShapeData(node);
                return;
            }
	            const fullNode = this.getFullNodeDataForCyNode(node);
            if (fullNode?.isCollapsedAggregate) {
                node.data('shapeKey', 'ellipse');
                node.data('shape', 'ellipse');
                node.removeData('iconBackgroundImage');
                node.removeData('customIconKey');
                return;
            }
	            const shapeKey = this.getNodeShape(fullNode);
	            node.data('shapeKey', shapeKey);
            node.data('shape', resolveCustomNodeIconCytoscapeShape(shapeKey));

	            if (isCustomNodeIconShape(shapeKey)) {
	                const nodeColor = node.data('nodeColor') || this.getNodeColor(fullNode)[0];
                const customShapeData = getCustomNodeShapeData(shapeKey, nodeColor);
                node.data('iconBackgroundImage', customShapeData.iconBackgroundImage);
                node.data('customIconKey', customShapeData.customIconKey);
            } else {
                node.removeData('iconBackgroundImage');
                node.removeData('customIconKey');
            }
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
        const borderWidth = Number(this.widgets['node-border-width']);
        return Number.isFinite(borderWidth) ? borderWidth : 2;
    }


    /**
     * Retrieves the font size for a node label based on current widget settings.
     * @param node The node data object.
     * @returns The font size in pixels.
     */
    getNodeFontSize(node: any): number {
        return this.widgets['node-label-size'] || 12; // Default to 12px if not set
    }

    /**
     * Retrieves the font size for a edge label based on current widget settings.
     * @param link The edge data object.
     * @returns The font size in pixels.
     */
    getLinkFontSize(link: any): number {
        return this.widgets['link-label-size'] || 12; // Default to 12px if not set
    }


}

export namespace TwoDComponent {
    export const componentTypeName = '2D Network';
}
