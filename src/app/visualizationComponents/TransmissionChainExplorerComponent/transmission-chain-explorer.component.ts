import { Component, Output, EventEmitter, OnInit, ViewChild, ElementRef, ChangeDetectorRef, OnDestroy, Inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonService } from '../../contactTraceCommonServices/common.service';
import * as d3 from 'd3';
import { Clipboard } from '@angular/cdk/clipboard';
import { SelectItem } from 'primeng/api';
import { DialogSettings } from '../../helperClasses/dialogSettings';
import { MicobeTraceNextPluginEvents } from '../../helperClasses/interfaces';
import * as _ from 'lodash';
import { BaseComponentDirective } from '@app/base-component.directive';
import { ComponentContainer } from 'golden-layout';
import { getCustomNodeShapeData, resolveNodeShapeCytoscapeShape as resolveCustomNodeIconCytoscapeShape, resolveNodeShapeForNode, resolveNodeShapeKey } from '@app/contactTraceCommonServices/node-shapes';
import { applyNetworkNodeCompositionSegments, EMPTY_NETWORK_NODE_VISUAL_FEATURES } from '@app/contactTraceCommonServices/network-node-features';
import type cytoscape from 'cytoscape';
import type { Core } from 'cytoscape';
import { Subject, takeUntil } from 'rxjs';
import moment from 'moment';
import { CommonStoreService } from '@app/contactTraceCommonServices/common-store.services';
import { ExportService } from '@app/contactTraceCommonServices/export.service';
import { NgZone } from '@angular/core';
import { createGlobalSettingsDialogRequest, GlobalSettingsDialogRequest } from '@app/helperClasses/globalSettingsDialogRequest';
import { createNetworkCytoscapeStyles } from '../shared/network-cytoscape-styles';
import { getNetworkNodeImage } from '@app/contactTraceCommonServices/network-node-appearance';
import { setNetworkNeighborHover } from '../shared/network-neighbor-hover';
import { getTransmissionChainSettings, normalizeTransmissionChainCamera, TransmissionChainCamera, TransmissionChainLineStyle, TransmissionChainSettings } from './transmission-chain-settings';
const TRANSMISSION_CHAIN_DEFAULT_LINK_WIDTH = 12;
const TRANSMISSION_CHAIN_DEFAULT_NODE_SIZE = 50;
const TRANSMISSION_CHAIN_MIN_INITIAL_RENDERED_NODE_SIZE = 14;
const TRANSMISSION_CHAIN_MAX_AXIS_LABEL_SIZE = 32;
const TRANSMISSION_CHAIN_TARGET_WIDTH_FRACTION = 0.9;
const TIMELINE_AXIS_BOTTOM_OFFSET = 48;
const TIMELINE_AXIS_GRID_GAP = 8;
const TIMELINE_NODE_AXIS_GAP = 8;
const TIMELINE_TOOLBAR_GAP = 8;
const TIMELINE_VIEWPORT_PADDING = {
    top: 30,
    right: 30,
    left: 30
};
interface TimelineLayoutTick {
    x: number;
    label: string;
}
interface TimelineYAxisGroup {
    key: string;
    label: string;
    minY: number;
    maxY: number;
    centerY: number;
    boundaryMinY: number;
    boundaryMaxY: number;
}
interface TimelineLayoutMetadata {
    active: boolean;
    field: string;
    ticks: TimelineLayoutTick[];
    domainStart: number | null;
    domainEnd: number | null;
    rangeStart: number;
    rangeEnd: number;
    singleDateDomain: boolean;
    yAxisField: string;
    yAxisGroups: TimelineYAxisGroup[];
}
interface ExplorerViewportBounds {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}
interface TimelineViewportArea {
    left: number;
    top: number;
    width: number;
    height: number;
}
@Component({ selector: 'app-transmission-chain-explorer', templateUrl: './transmission-chain-explorer.component.html', styleUrls: ['./transmission-chain-explorer.component.scss'], changeDetection: ChangeDetectionStrategy.OnPush, standalone: false })
export class TransmissionChainExplorerComponent extends BaseComponentDirective implements OnInit, MicobeTraceNextPluginEvents, OnDestroy {
    @Output()
    DisplayGlobalSettingsDialogEvent = new EventEmitter<GlobalSettingsDialogRequest>();
    // Reference to the Cytoscape container
    @ViewChild('cy', { static: false })
    cyContainer: ElementRef;
    @ViewChild('exportContainer')
    exportContainer: ElementRef;
    @ViewChild('tooltipElement', { static: false })
    tooltipElement: ElementRef<HTMLElement>;
    @ViewChild('timelineAxisOverlay', { static: false })
    timelineAxisOverlay: ElementRef<SVGSVGElement>;
    @ViewChild('timelineGridOverlay', { static: false })
    timelineGridOverlay: ElementRef<SVGSVGElement>;
    @ViewChild('toolBtnContainer', { static: false })
    toolBtnContainer: ElementRef<HTMLElement>;
    // Cytoscape core instance
    cy: Core;
    rendererAccessibleFeatureSummary = '0 network nodes; 0 mixed-value nodes';
    rendererAccessibleFeatureItems: Array<{
        id: string;
        description: string;
        selected: boolean;
    }> = [];
    rendererKeyboardFocusedNodeId: string | null = null;
    rendererKeyboardLiveStatus = 'Use the arrow keys to move through network nodes. Press Enter to select a node and Escape to clear selection.';
    private cytoscapeFactoryPromise: Promise<typeof cytoscape> | null = null;
    private rendererViewStateTimer: ReturnType<typeof setTimeout> | null = null;
    private containerResizeTimer: ReturnType<typeof setTimeout> | null = null;
    private containerShowTimer: ReturnType<typeof setTimeout> | null = null;
    nodePositions: Map<string, {
        x: number;
        y: number;
    }> = new Map();
    private nodeDataById: Map<string, any> = new Map();
    private renderedGraphKey: string | null = null;
    data;
    private isDestroyed = false;
    private applyingTimelinePositionLock = false;
    debugMode = false;
    overideTransparency = false;
    selectedNodeId = undefined;
    private transmissionChainInitialAutoFitPending = true;
    private transmissionChainDateFieldToCenter: string | null = null;
    private transmissionChainBaseTimelineRange: { start: number; end: number } | null = null;
    private lastTimelineViewportArea: TimelineViewportArea | null = null;
    private timelineViewportFitPending = false;
    private readonly handleContainerResize = (): void => {
        if (this.containerResizeTimer)
            clearTimeout(this.containerResizeTimer);
        this.containerResizeTimer = setTimeout(() => {
            if (!this.isDestroyed)
                this.redrawTimelineAxisForResize();
        }, 100);
    };
    private readonly handleContainerHide = (): void => {
        if (this.isDestroyed)
            return;
        this.viewActive = false;
        this.cdref.detectChanges();
    };
    private readonly handleContainerShow = (): void => {
        if (this.isDestroyed)
            return;
        this.viewActive = true;
        this.cdref.markForCheck();
        if (this.containerShowTimer)
            clearTimeout(this.containerShowTimer);
        this.containerShowTimer = setTimeout(() => {
            if (this.isDestroyed)
                return;
            if (this.rerenderOnActive) {
                this.rerenderOnActive = false;
                void this._rerender();
            }
            this.resizeActiveRenderer();
        }, 50);
    };
    private getPerformanceNow(): number {
        return typeof performance !== 'undefined' && performance.now
            ? performance.now()
            : Date.now();
    }
    private recordRenderTiming(name: string, startedAt: number, extra: Record<string, any> = {}) {
        this.commonService.recordPerformanceDuration('render', name, this.getPerformanceNow() - startedAt, {
            view: this.viewName,
            ...extra
        });
    }
    private cacheNodeDataById(nodes: any[]): void {
        this.nodeDataById = new Map();
        (nodes || []).forEach(node => {
            const id = `${node.id || node._id}`;
            if (id)
                this.nodeDataById.set(id, node);
        });
    }
    private getFullNodeDataForCyNode(node: cytoscape.NodeSingular): any {
        const cachedNode = this.nodeDataById.get(node.id());
        if (!cachedNode)
            return node.data();
        return {
            ...cachedNode,
            ...node.data()
        };
    }
    private isCytoscapeNodeMetadataValue(value: any): boolean {
        if (value === undefined)
            return false;
        if (value === null)
            return true;
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
        const mixedColorImageCoversShape = !!node.mixedColorImage
            && this.mixedColorImageShouldCoverShape(shapeKey);
        return {
            ...this.getCytoscapeNodeMetadata(node),
            id: node.id,
            _id: node._id,
            index: node.index,
            cluster: node.cluster,
            display_cluster: node.display_cluster,
            group: node.group,
            parent,
            x: node.x,
            y: node.y,
            timelineX: node.timelineX,
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
            mixedColorImage: node.mixedColorImage,
            mixedColorImageCoversShape,
            pieBackgroundImage: node.pieBackgroundImage,
            borderWidth: node.borderWidth, borderColor: node.borderColor || '#000000',
            selectedBorderColor: this.widgets['selected-color'],
            fontSize: this.getNodeFontSize(node),
            shape: resolveCustomNodeIconCytoscapeShape(shapeKey),
            shapeKey,
            ...getCustomNodeShapeData(shapeKey, node.nodeColor)
        };
    }
    private mixedColorImageShouldCoverShape(shapeKey: string): boolean {
        const normalizedShapeKey = resolveNodeShapeKey(shapeKey);
        return normalizedShapeKey === 'star' || normalizedShapeKey === 'vee';
    }
    private getMixedColorNodeImage(node: any, shapeKey: string, fillColor: string, fillOpacity: number, renderedSize?: number, strokeColor = '#000000', strokeWidth = Number(this.widgets['node-border-width'])): string | undefined { return getNetworkNodeImage(shapeKey, fillColor, fillOpacity, strokeColor, strokeWidth, renderedSize ?? this.mapNodeSize(Number(node?.nodeSize ?? this.getConfiguredNodeSize())), this.commonService.getNodeFillStyle(node).segments); }
    private setMixedColorNodeImageData(node: cytoscape.NodeSingular, fullNode: any, shapeKey: string, fillColor: string, fillOpacity: number, renderedSize?: number): void {
        const mixedColorImage = this.getMixedColorNodeImage(fullNode, shapeKey, fillColor, fillOpacity, renderedSize);
        if (mixedColorImage) {
            node.data('mixedColorImage', mixedColorImage);
            node.data('mixedColorImageCoversShape', this.mixedColorImageShouldCoverShape(shapeKey));
        }
        else {
            node.removeData('mixedColorImage');
            node.removeData('mixedColorImageCoversShape');
        }
    }
    nodeScale: d3.ScaleLinear<number, number> = d3.scaleLinear().domain([0, 1]).range([0, 1]);
    ShowNetworkAttributes: boolean = false;
    showExportDialog: boolean = false;
    IsDataAvailable: boolean = false;
    widgets: TransmissionChainSettings;
    selected: any = null;
    FieldList: SelectItem[] = [];
    ToolTipFieldList: SelectItem[] = [];
    LinkToolTipList: SelectItem[] = [];
    viewActive: boolean = true;
    OrientationOptions: object = [
        { label: 'Middle', value: 'Middle' },
        { label: 'Top', value: 'Top' },
        { label: 'Bottom', value: 'Bottom' },
        { label: 'Left', value: 'Left' },
        { label: 'Right', value: 'Right' },
    ];
    // Node Tab
    SelectedNodeLabelOrientationVariable: 'Right' | 'Left' | 'Top' | 'Bottom' | 'Middle' = 'Middle';
    SelectedNodeLabelVariable: string = "None";
    SelectedNodeTooltipVariable: any = "None";
    SelectedNodeRadiusVariable: string = "None";
    SelectedNodeRadiusSizeVariable: number = 50;
    // Link Tab
    SelectedLinkTooltipVariable: any = "None";
    SelectedLinkLabelVariable: string = "None";
    SelectedLinkDecimalVariable: number = 3;
    SelectedLinkTransparencyVariable: any = 1;
    SelectedLinkWidthByVariable: string = "None";
    SelectedLinkWidthMax: number = 27;
    SelectedLinkWidthMin: number = 3;
    ReciprocalTypes: any = [
        { label: 'Reciprocal', value: 'Reciprocal' },
        { label: 'Non-Reciprocal', value: 'Non-Reciprocal' }
    ];
    SelectedLinkReciprocalTypeVariable: string = "Reciprocal";
    SelectedLinkWidthVariable: any = 0;
    ArrowTypes: any = [
        { label: 'Hide', value: 'Hide' },
        { label: 'Show', value: 'Show' }
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
    SelectedNetworkTimelineDateFieldVariable: string = 'None';
    SelectedTransmissionChainYAxisFieldVariable: string = 'None';
    TransmissionChainLinkOriginOptions: SelectItem[] = [];
    TransmissionChainLineStyleOptions: SelectItem[] = [
        { label: 'Stepped', value: 'Stepped' },
        { label: 'Straight', value: 'Straight' },
        { label: 'Curved', value: 'Curved' },
        { label: 'Fan-out Curves', value: 'Fanout' }
    ];
    SelectedTransmissionChainLinkOriginVariables: string[] = [];
    SelectedTransmissionChainLineStyleVariable: TransmissionChainLineStyle = 'Stepped';
    nodesWithoutTimelineDate: {
        index: number | string;
        ID: string;
    }[] = [];
    showExcludedTimelineNodesDialog: boolean = false;
    private transmissionChainInitialSettingsOpened = false;
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
    settingsDialog = new DialogSettings('#transmission-chain-settings-pane', false);
    ContextSelectedNodeAttributes: {
        attribute: string;
        value: string;
    }[] = [];
    private contextMenuNodeId: string | null = null;
    networkUpdatedSubscription: any;
    settingsLoadedSubscription: any;
    private styleFileSub: any;
    private timelineLayoutMetadata: TimelineLayoutMetadata = {
        active: false,
        field: 'None',
        ticks: [],
        domainStart: null,
        domainEnd: null,
        rangeStart: 0,
        rangeEnd: 0,
        singleDateDomain: false,
        yAxisField: 'None',
        yAxisGroups: []
    };
    private timelineAxisUpdateTimeout: any;
    private timelineAxisResizeObserver: ResizeObserver | null = null;
    private timelineAxisResizeObservedElements = new Set<Element>();
    private goldenLayoutSize: {
        width: number;
        height: number;
    } | null = null;
    private readonly windowResizeHandler = () => this.handleContainerResize();
    public readonly viewName = 'Transmission Chain Explorer';
    public readonly settingsDialogHeader = 'Transmission Chain Explorer Settings';
    public readonly settingsDialogStyle = { width: '420px', 'max-width': 'calc(100vw - 2rem)' };
    public readonly settingsDialogContentStyle = { 'max-height': '70vh', overflow: 'auto' };
    public readonly cyElementId = 'transmission-chain-cy';
    constructor(public commonService: CommonService,
    @Inject(BaseComponentDirective.GoldenLayoutContainerInjectionToken)
    private container: ComponentContainer, elRef: ElementRef, private cdref: ChangeDetectorRef, private clipboard: Clipboard, private store: CommonStoreService, private exportService: ExportService, private zone: NgZone) {
        super(elRef.nativeElement);
        this.widgets = getTransmissionChainSettings(this.commonService.session.style);
        this.container.on('resize', this.handleContainerResize);
        this.container.on('hide', this.handleContainerHide);
        this.container.on('show', this.handleContainerShow);
        window.addEventListener('resize', this.windowResizeHandler);
    }
    private destroy$ = new Subject<void>();
    override setPositionAndSize(left: number, top: number, width: number, height: number): void {
        super.setPositionAndSize(left, top, width, height);
        this.goldenLayoutSize = { width, height };
        this.handleContainerResize();
    }
    private ensureTimelineLayoutWidgetDefaults(): void {
        if (!this.widgets)
            return;
        if (!this.widgets['transmission-chain-date-field']) {
            this.widgets['transmission-chain-date-field'] = 'None';
        }
        if (!this.widgets['transmission-chain-y-axis-field']) {
            this.widgets['transmission-chain-y-axis-field'] = 'None';
        }
        if (this.widgets['transmission-chain-link-origins'] === undefined) {
            this.widgets['transmission-chain-link-origins'] = null;
        }
        if (!this.isTransmissionChainLineStyle(this.widgets['transmission-chain-line-style'])) {
            this.widgets['transmission-chain-line-style'] = 'Stepped';
        }
        if (!Number.isFinite(Number(this.widgets['transmission-chain-link-width']))) {
            this.widgets['transmission-chain-link-width'] = TRANSMISSION_CHAIN_DEFAULT_LINK_WIDTH;
        }
        if (!Number.isFinite(Number(this.widgets['transmission-chain-node-radius']))) {
            this.widgets['transmission-chain-node-radius'] = TRANSMISSION_CHAIN_DEFAULT_NODE_SIZE;
        }
    }
    private getConfiguredLinkWidth(): number {
        const key = 'transmission-chain-link-width';
        const value = Number(this.widgets?.[key]);
        const fallback = TRANSMISSION_CHAIN_DEFAULT_LINK_WIDTH;
        return Number.isFinite(value) ? value : fallback;
    }
    private getConfiguredNodeSize(): number {
        const key = 'transmission-chain-node-radius';
        const value = Number(this.widgets?.[key]);
        const fallback = TRANSMISSION_CHAIN_DEFAULT_NODE_SIZE;
        return Number.isFinite(value) ? value : fallback;
    }
    private isTransmissionChainLineStyle(value: any): value is TransmissionChainLineStyle {
        return value === 'Stepped' || value === 'Straight' || value === 'Curved' || value === 'Fanout';
    }
    private getTransmissionChainLineStyle(): TransmissionChainLineStyle {
        this.ensureTimelineLayoutWidgetDefaults();
        const style = this.widgets['transmission-chain-line-style'];
        return this.isTransmissionChainLineStyle(style) ? style : 'Stepped';
    }
    private getNetworkTimelineDateField(): string {
        this.ensureTimelineLayoutWidgetDefaults();
        return String(this.widgets['transmission-chain-date-field'] || 'None');
    }
    private getTransmissionChainYAxisField(): string {
        this.ensureTimelineLayoutWidgetDefaults();
        return String(this.widgets['transmission-chain-y-axis-field'] || 'None');
    }
    public isTimelineLayoutActive(): boolean {
        return this.getNetworkTimelineDateField() !== 'None';
    }
    private shouldShowBlankTransmissionChainView(): boolean {
        return this.getNetworkTimelineDateField() === 'None';
    }
    private getTransmissionChainLinkOrigins(): string[] {
        const origins: string[] = [];
        (this.commonService.session.data.links || []).forEach(link => {
            const linkOrigins = Array.isArray(link?.origin)
                ? link.origin
                : link?.origin
                    ? [link.origin]
                    : [];
            linkOrigins.forEach(origin => {
                const normalizedOrigin = String(origin || '').trim();
                if (normalizedOrigin && !origins.includes(normalizedOrigin)) {
                    origins.push(normalizedOrigin);
                }
            });
        });
        return origins;
    }
    private syncTransmissionChainLinkOriginOptions(): void {
        const origins = this.getTransmissionChainLinkOrigins();
        this.TransmissionChainLinkOriginOptions = origins.map(origin => ({
            label: origin,
            value: origin
        }));
        const selected = this.widgets['transmission-chain-link-origins'];
        if (!Array.isArray(selected)) {
            this.widgets['transmission-chain-link-origins'] = [...origins];
        }
        else {
            this.widgets['transmission-chain-link-origins'] = selected
                .map(origin => String(origin || '').trim())
                .filter(origin => origins.includes(origin));
        }
        this.SelectedTransmissionChainLinkOriginVariables = [
            ...(this.widgets['transmission-chain-link-origins'] || [])
        ];
    }
    private filterTransmissionChainLinks(links: any[]): any[] {
        this.syncTransmissionChainLinkOriginOptions();
        const selectedOrigins = new Set(this.SelectedTransmissionChainLinkOriginVariables);
        if (selectedOrigins.size === 0) {
            return [];
        }
        return links.flatMap(link => {
            const linkOrigins = Array.isArray(link?.origin)
                ? link.origin
                : link?.origin
                    ? [link.origin]
                    : [];
            const selectedLinkOrigins = linkOrigins.filter(origin => selectedOrigins.has(String(origin || '').trim()));
            if (selectedLinkOrigins.length === 0) {
                return [];
            }
            if (selectedLinkOrigins.length === linkOrigins.length) {
                return [link];
            }
            return [{
                    ...link,
                    origin: selectedLinkOrigins
                }];
        });
    }
    private getTimelineAwareEdgeRoutingStyle(): any {
        if (!this.isTimelineLayoutActive()) return { 'curve-style': 'straight' };
        const lineStyle = this.getTransmissionChainLineStyle();
        if (lineStyle === 'Stepped') {
            return {
                'curve-style': 'taxi',
                'taxi-direction': 'vertical',
                'taxi-turn': (edge: any) => edge.data('transmissionChainTaxiTurn') || '0px',
                'taxi-turn-min-distance': 10,
                'taxi-radius': 0
            };
        }
        if (lineStyle === 'Straight') return { 'curve-style': 'straight' };
        return {
            'curve-style': 'unbundled-bezier',
            'control-point-distances': (edge: any) => Number(edge.data('transmissionChainCurveDistance')) || 0,
            'control-point-weights': (edge: any) => Number(edge.data('transmissionChainCurveWeight')) || 0.5,
            'edge-distances': 'intersection'
        };
    }
    private updateEdgeRoutingStyles(): void {
        if (!this.cy)
            return;
        this.cy.style()
            .selector('edge')
            .style(this.getTimelineAwareEdgeRoutingStyle())
            .update();
    }
    private refreshRenderedSizeStyles(): void {
        if (!this.cy)
            return;
        this.updateNodeSizes();
        this.scaleLinkWidth();
    }
    private shouldLockTimelineNodeX(node: cytoscape.NodeSingular): boolean {
        return (this.isTimelineLayoutActive() &&
            !!node &&
            !node.empty() &&
            !node.hasClass('hidden') &&
            !node.hasClass('parent') &&
            node.children().length === 0);
    }
    private getTimelineNodeYAxisRange(node: cytoscape.NodeSingular): {
        minY: number;
        maxY: number;
    } | null {
        const groups = this.timelineLayoutMetadata.yAxisGroups;
        if (this.getTransmissionChainYAxisField() === 'None'
            || groups.length === 0) {
            return null;
        }
        const fullNode = this.getFullNodeDataForCyNode(node);
        const groupKey = `y-axis:${this.getTransmissionChainYAxisValue(fullNode)}`;
        const groupIndex = groups.findIndex(group => group.key === groupKey);
        if (groupIndex < 0) {
            return null;
        }
        const group = groups[groupIndex];
        const nodeHalfHeight = Math.max(0, Number(node.outerHeight()) / 2 || 0);
        const minY = group.boundaryMinY + nodeHalfHeight;
        const maxY = group.boundaryMaxY - nodeHalfHeight;
        if (minY > maxY) {
            return { minY: group.centerY, maxY: group.centerY };
        }
        return { minY, maxY };
    }
    private enforceTimelineNodePosition(node: cytoscape.NodeSingular): boolean {
        if (!this.shouldLockTimelineNodeX(node))
            return false;
        const timelineX = Number(node.data('timelineX'));
        const currentPosition = node.position();
        const yAxisRange = this.getTimelineNodeYAxisRange(node);
        const constrainedPosition = {
            x: Number.isFinite(timelineX) ? timelineX : currentPosition.x,
            y: yAxisRange
                ? Math.min(yAxisRange.maxY, Math.max(yAxisRange.minY, currentPosition.y))
                : currentPosition.y
        };
        if (Math.abs(currentPosition.x - constrainedPosition.x) < 0.5
            && Math.abs(currentPosition.y - constrainedPosition.y) < 0.5) {
            return false;
        }
        this.applyingTimelinePositionLock = true;
        node.position(constrainedPosition);
        this.applyingTimelinePositionLock = false;
        this.nodePositions.set(node.id(), constrainedPosition);
        return true;
    }
    private applyTimelineNodePositionConstraints(): void {
        if (!this.cy || !this.isTimelineLayoutActive())
            return;
        this.cy.nodes(':visible').forEach(node => this.enforceTimelineNodePosition(node));
    }
    private loadCytoscapeRenderer(): Promise<typeof cytoscape> {
        if (!this.cytoscapeFactoryPromise) {
            this.cytoscapeFactoryPromise = Promise.all([
                import('cytoscape'),
                import('cytoscape-svg')
            ]).then(([cytoscapeModule, svgModule]) => {
                const cytoscapeFactory = (cytoscapeModule as any).default || cytoscapeModule;
                const svgExtension = (svgModule as any).default || svgModule;
                cytoscapeFactory.use(svgExtension);
                return cytoscapeFactory;
            });
        }
        return this.cytoscapeFactoryPromise;
    }
    public getRendererViewState(): TransmissionChainCamera | null {
        if (!this.cy || !this.cyContainer?.nativeElement)
            return null;
        const bounds = this.cyContainer.nativeElement.getBoundingClientRect();
        const zoom = this.cy.zoom();
        const pan = this.cy.pan();
        if (!Number.isFinite(zoom) || zoom <= 0 || bounds.width <= 0 || bounds.height <= 0) {
            return null;
        }
        return {
            centerX: (bounds.width / 2 - pan.x) / zoom,
            centerY: (bounds.height / 2 - pan.y) / zoom,
            graphUnitsPerPixel: 1 / zoom
        };
    }
    public isRendererReady(): boolean {
        return Boolean(this.cy && !(typeof this.cy.destroyed === 'function' && this.cy.destroyed()));
    }
    public setRendererViewState(stateValue: TransmissionChainCamera, persist = true): void {
        const state = normalizeTransmissionChainCamera(stateValue);
        if (!state)
            return;
        if (this.cy && this.cyContainer?.nativeElement) {
            const bounds = this.cyContainer.nativeElement.getBoundingClientRect();
            const zoom = 1 / state.graphUnitsPerPixel;
            this.cy.zoom(zoom);
            this.cy.pan({
                x: bounds.width / 2 - state.centerX * zoom,
                y: bounds.height / 2 - state.centerY * zoom
            });
        }
        if (persist)
            this.persistRendererViewState(state);
    }
    private restoreRendererViewState(): boolean {
        const state = normalizeTransmissionChainCamera(this.widgets.camera);
        if (!state || !this.cy)
            return false;
        this.setRendererViewState(state, false);
        return true;
    }
    private persistRendererViewState(state?: TransmissionChainCamera | null): void {
        if (!this.cy?.nodes().length)
            return;
        const camera = normalizeTransmissionChainCamera(state || this.getRendererViewState());
        if (camera)
            this.widgets.camera = camera;
    }
    private scheduleRendererViewStatePersistence(): void {
        if (this.rendererViewStateTimer)
            clearTimeout(this.rendererViewStateTimer);
        this.rendererViewStateTimer = setTimeout(() => this.persistRendererViewState(), 100);
    }
    private getRendererKeyboardNodeIds(): string[] {
        const ids = this.cy?.nodes(':visible')
            .filter(node => !node.isParent())
            .map(node => node.id()) || [];
        return ids.map(String).sort((left, right) => left.localeCompare(right));
    }
    private isRendererNodeSelected(nodeId: string): boolean {
        return Boolean(this.cy?.getElementById(nodeId).selected());
    }
    private describeRendererKeyboardNode(nodeId: string): string {
        const node = this.cy?.getElementById(nodeId);
        return node && !node.empty() ? String(node.data('label') || nodeId) : nodeId;
    }
    private focusRendererKeyboardNode(nodeId: string, announce = true): void {
        const nodeIds = this.getRendererKeyboardNodeIds();
        if (!nodeIds.includes(nodeId))
            return;
        this.rendererKeyboardFocusedNodeId = nodeId;
        if (this.cy) {
            this.cy.elements().removeClass('renderer-keyboard-focus');
            this.cy.getElementById(nodeId).addClass('renderer-keyboard-focus');
        }
        if (announce) {
            const position = nodeIds.indexOf(nodeId) + 1;
            const selected = this.isRendererNodeSelected(nodeId) ? '; selected' : '';
            this.rendererKeyboardLiveStatus = `Node ${position} of ${nodeIds.length}: ${nodeId}; ${this.describeRendererKeyboardNode(nodeId)}${selected}.`;
        }
        this.cdref.markForCheck();
    }
    private clearRendererKeyboardFocus(): void {
        this.rendererKeyboardFocusedNodeId = null;
        this.rendererKeyboardLiveStatus = '';
        if (this.cy) {
            this.cy.elements().removeClass('renderer-keyboard-focus');
        }
        this.cdref.markForCheck();
    }
    onRendererPointerInteraction(): void {
        // A pointer click can focus the tabindex-enabled network container.
        // Clear on both pointerdown and the resulting click so a renderer that
        // focuses its container during either phase cannot leave node 1 active.
        this.clearRendererKeyboardFocus();
    }
    onRendererKeyboardFocus(event?: FocusEvent): void {
        const target = event?.currentTarget;
        if (target instanceof HTMLElement && !target.matches(':focus-visible')) {
            this.clearRendererKeyboardFocus();
            return;
        }
        const nodeIds = this.getRendererKeyboardNodeIds();
        if (!nodeIds.length)
            return;
        this.focusRendererKeyboardNode(this.rendererKeyboardFocusedNodeId && nodeIds.includes(this.rendererKeyboardFocusedNodeId)
            ? this.rendererKeyboardFocusedNodeId
            : nodeIds[0]);
    }
    onRendererKeydown(event: KeyboardEvent): void {
        const nodeIds = this.getRendererKeyboardNodeIds();
        if (!nodeIds.length)
            return;
        const currentIndex = this.rendererKeyboardFocusedNodeId
            ? nodeIds.indexOf(this.rendererKeyboardFocusedNodeId)
            : -1;
        let targetIndex: number | null = null;
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
            targetIndex = (Math.max(0, currentIndex) + 1) % nodeIds.length;
        }
        else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
            targetIndex = (currentIndex <= 0 ? nodeIds.length : currentIndex) - 1;
        }
        else if (event.key === 'Home') {
            targetIndex = 0;
        }
        else if (event.key === 'End') {
            targetIndex = nodeIds.length - 1;
        }
        if (targetIndex !== null) {
            event.preventDefault();
            this.focusRendererKeyboardNode(nodeIds[targetIndex]);
            return;
        }
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            const nodeId = this.rendererKeyboardFocusedNodeId || nodeIds[0];
            const shouldSelect = !this.isRendererNodeSelected(nodeId);
            {
                const node = this.cy?.getElementById(nodeId);
                if (shouldSelect)
                    node?.select();
                else
                    node?.unselect();
            }
            this.rendererKeyboardLiveStatus = `${nodeId} ${shouldSelect ? 'selected' : 'deselected'}.`;
            this.cdref.markForCheck();
            return;
        }
        if (event.key === 'Escape') {
            event.preventDefault();
            this.cy?.elements().unselect();
            this.rendererKeyboardLiveStatus = 'Network selection cleared.';
            this.cdref.markForCheck();
        }
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
    private getNodeRenderPosition(node: any): {
        x: number;
        y: number;
    } {
        const cachedPosition = this.nodePositions.get(this.getNodeId(node));
        const resolveCoordinate = (value: any, cachedValue: any): number => {
            const numericValue = Number(value);
            if (value !== null && value !== undefined && value !== '' && Number.isFinite(numericValue)) {
                return numericValue;
            }
            const numericCachedValue = Number(cachedValue);
            return Number.isFinite(numericCachedValue)
                ? numericCachedValue
                : Math.random() * 500;
        };
        return {
            x: resolveCoordinate(node?.x, cachedPosition?.x),
            y: resolveCoordinate(node?.y, cachedPosition?.y)
        };
    }
    private updateNodesWithoutTimelineDate(nodes: {
        index: number | string;
        ID: string;
    }[]): void {
        const unchanged = nodes.length === this.nodesWithoutTimelineDate.length
            && nodes.every((node, index) => (node.index === this.nodesWithoutTimelineDate[index]?.index
                && node.ID === this.nodesWithoutTimelineDate[index]?.ID));
        if (!unchanged) {
            this.nodesWithoutTimelineDate = nodes;
            this.cdref.markForCheck();
        }
    }
    private excludeTransmissionChainNodesWithoutDates(nodes: any[]): any[] {
        const field = this.getNetworkTimelineDateField();
        if (field === 'None') {
            this.updateNodesWithoutTimelineDate([]);
            return nodes;
        }
        const includedNodes: any[] = [];
        const excludedNodes: {
            index: number | string;
            ID: string;
        }[] = [];
        nodes.forEach(node => {
            if (this.getTimelineLayoutTimestamp(node, field) !== null) {
                includedNodes.push(node);
                return;
            }
            excludedNodes.push({
                index: node?.index ?? '',
                ID: this.getNodeId(node)
            });
        });
        this.updateNodesWithoutTimelineDate(excludedNodes);
        return includedNodes;
    }
    private getVisibleNetworkDataForRender(): {
        nodes: any[];
        links: any[];
    } {
        // Explorer uses the complete graph allowed by ordinary filters. The
        // global timeline player controls other views' node visibility only.
        const nodes = this.excludeTransmissionChainNodesWithoutDates(this.commonService.getVisibleNodesIgnoringTimeline(true)).map(node => {
            const position = this.nodePositions.get(this.getNodeId(node));
            // Canonical node coordinates belong to other views. Only reuse this Explorer's coordinates.
            const copy = { ...node, x: position?.x, y: position?.y };
            delete copy.fx;
            delete copy.fy;
            delete copy.vx;
            delete copy.vy;
            return copy;
        });
        if (this.shouldShowBlankTransmissionChainView())
            return { nodes: [], links: [] };
        const ids = new Set(nodes.map(node => this.getNodeId(node)));
        const links = this.filterTransmissionChainLinks(this.commonService.getVisibleLinksIgnoringTimeline(true)).filter(link => ids.has(this.getLinkEndpointId(link.source)) && ids.has(this.getLinkEndpointId(link.target)));
        return { nodes, links };
    }
    private normalizeNetworkDataForCytoscape(networkData: {
        nodes: any[];
        links: any[];
    }, warnInvalidLinks = true): Set<string> {
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
    ngOnInit(): void {
        this.commonService.visuals.transmissionChain = this;
        this.networkUpdatedSubscription = this.store.networkUpdated$.pipe(takeUntil(this.destroy$)).subscribe(updated => {
            if (updated) {
                // Acknowledge each notification so the next filter change can
                // emit even while Explorer is the only active network view.
                this.store.setNetworkUpdated(false);
                this.onFilterDataChange();
            }
        });
        this.settingsLoadedSubscription = this.store.settingsLoaded$.pipe(takeUntil(this.destroy$)).subscribe(loaded => {
            if (loaded)
                this.onLoadNewData();
        });
        this.styleFileSub = this.store.styleFileApplied$.pipe(takeUntil(this.destroy$)).subscribe(() => this.applyStyleFileSettings());
        $(document).on('node-selected.transmissionChainExplorer', () => this.syncSelectionFromSession());
        this.loadSettings();
    }
    ngAfterViewInit(): void { this.syncNetworkContainerBounds(); this.ensureTimelineAxisResizeObserver(); this.onLoadNewData(); }
    private getRawTimelineLayoutDateValue(node: any, field: string): any {
        const rawDateValues = node?._rawDateValues;
        if (rawDateValues && Object.prototype.hasOwnProperty.call(rawDateValues, field)) {
            return rawDateValues[field];
        }
        return node?.[field];
    }
    private getTimelineLayoutTimestamp(node: any, field: string): number | null {
        const rawValue = this.getRawTimelineLayoutDateValue(node, field);
        if (!this.commonService.hasValidTimelineDateValue(rawValue)) {
            return null;
        }
        const timestamp = moment(rawValue).valueOf();
        return Number.isFinite(timestamp) ? timestamp : null;
    }
    private getTimelineLayoutReferenceNodes(): any[] {
        return this.commonService.getVisibleNodesIgnoringTimeline(true);
    }
    private formatTimelineTickLabel(timestamp: number, domainStart: number, domainEnd: number): string {
        const spanDays = Math.abs(domainEnd - domainStart) / 86400000;
        const value = moment(timestamp);
        if (spanDays > 730) {
            return value.format('YYYY');
        }
        if (spanDays > 90) {
            return value.format('MMM YYYY');
        }
        return value.format('MMM D');
    }
    private getTimelineNodeVerticalRadius(node: any): number {
        return this.getD3CollisionRadius(node);
    }
    private getD3CollisionRadius(node: any): number {
        const aggregateRenderedSize = Number(node?.aggregateRenderedSize);
        if (Number.isFinite(aggregateRenderedSize) && aggregateRenderedSize > 0) {
            return aggregateRenderedSize;
        }
        const rawSize = Number(node?.nodeSize ?? this.getConfiguredNodeSize());
        const size = Number.isFinite(rawSize) ? rawSize : this.getConfiguredNodeSize();
        return this.mapNodeSize(size);
    }
    private getTransmissionChainDisplayClusterValue(node: any): string {
        const rawCluster = node?.display_cluster
            ?? node?.displayCluster
            ?? node?.DisplayCluster
            ?? node?.['Display Cluster']
            ?? node?.cluster
            ?? node?.Cluster
            ?? node?.foci;
        return rawCluster === undefined || rawCluster === null
            ? ''
            : String(rawCluster).trim();
    }
    private getTransmissionChainYAxisValue(node: any): string {
        const field = this.getTransmissionChainYAxisField();
        if (field === 'None') {
            return '';
        }
        const rawValue = node?.[field];
        const values = Array.isArray(rawValue) ? rawValue : [rawValue];
        const normalizedValues = values
            .map(value => value === undefined || value === null ? '' : String(value).trim())
            .filter(Boolean);
        return normalizedValues.length > 0
            ? normalizedValues.join(', ')
            : `(No ${field.replace(/_/g, ' ')})`;
    }
    private getTransmissionChainClusterKey(node: any, connectedComponentKey: string): string {
        const yAxisField = this.getTransmissionChainYAxisField();
        if (yAxisField !== 'None') {
            return `y-axis:${this.getTransmissionChainYAxisValue(node)}`;
        }
        const cluster = this.getTransmissionChainDisplayClusterValue(node);
        return cluster ? `cluster:${cluster}` : connectedComponentKey;
    }
    private getTransmissionChainYAxisGroups(nodes: any[]): TimelineYAxisGroup[] {
        const yAxisField = this.getTransmissionChainYAxisField();
        if (yAxisField === 'None') {
            return [];
        }
        const groups = new Map<string, {
            label: string;
            yValues: number[];
        }>();
        nodes.forEach(node => {
            const label = this.getTransmissionChainYAxisValue(node);
            const key = `y-axis:${label}`;
            const y = Number(node?.y);
            if (!Number.isFinite(y)) {
                return;
            }
            if (!groups.has(key)) {
                groups.set(key, { label, yValues: [] });
            }
            groups.get(key)?.yValues.push(y);
        });
        const orderedGroups = Array.from(groups.entries())
            .map(([key, group]) => ({
            key,
            label: group.label,
            minY: Math.min(...group.yValues),
            maxY: Math.max(...group.yValues),
            centerY: d3.mean(group.yValues) || 0,
            boundaryMinY: 0,
            boundaryMaxY: 0
        }))
            .sort((a, b) => a.centerY - b.centerY);
        orderedGroups.forEach((group, index) => {
            const previousGroup = orderedGroups[index - 1];
            const nextGroup = orderedGroups[index + 1];
            const outerPadding = 48;
            group.boundaryMinY = previousGroup
                ? (previousGroup.maxY + group.minY) / 2
                : group.minY - Math.max(nextGroup ? (nextGroup.minY - group.maxY) / 2 : 0, outerPadding);
            group.boundaryMaxY = nextGroup
                ? (group.maxY + nextGroup.minY) / 2
                : group.maxY + Math.max(previousGroup ? (group.minY - previousGroup.maxY) / 2 : 0, outerPadding);
        });
        return orderedGroups;
    }
    private getTransmissionChainConnectedComponentKeys(nodes: any[], links: Array<{
        source: string;
        target: string;
    }>): Map<string, string> {
        const parent = new Map<string, string>();
        nodes.forEach(node => {
            const nodeId = this.getNodeId(node);
            parent.set(nodeId, nodeId);
        });
        const find = (id: string): string => {
            const currentParent = parent.get(id);
            if (!currentParent || currentParent === id) {
                parent.set(id, id);
                return id;
            }
            const root = find(currentParent);
            parent.set(id, root);
            return root;
        };
        const union = (a: string, b: string): void => {
            const rootA = find(a);
            const rootB = find(b);
            if (rootA !== rootB) {
                parent.set(rootB, rootA);
            }
        };
        links.forEach(link => union(link.source, link.target));
        const keyById = new Map<string, string>();
        nodes.forEach(node => {
            const nodeId = this.getNodeId(node);
            keyById.set(nodeId, `component:${find(nodeId)}`);
        });
        return keyById;
    }
    private assignTransmissionChainGroupLanes(groupNodes: any[], groupLinks: Array<{
        source: string;
        target: string;
    }>): Map<string, number> {
        const nodeById = new Map<string, any>();
        groupNodes.forEach(node => nodeById.set(this.getNodeId(node), node));
        const outgoing = new Map<string, string[]>();
        const incomingCount = new Map<string, number>();
        groupNodes.forEach(node => {
            const nodeId = this.getNodeId(node);
            outgoing.set(nodeId, []);
            incomingCount.set(nodeId, 0);
        });
        groupLinks.forEach(link => {
            if (link.source === link.target) {
                return;
            }
            outgoing.set(link.source, [...(outgoing.get(link.source) || []), link.target]);
            incomingCount.set(link.target, (incomingCount.get(link.target) || 0) + 1);
        });
        outgoing.forEach((children, nodeId) => {
            const sourceX = Number(nodeById.get(nodeId)?.timelineX) || 0;
            outgoing.set(nodeId, [...new Set(children)].sort((a, b) => {
                const nodeA = nodeById.get(a);
                const nodeB = nodeById.get(b);
                const aForward = Number(nodeA?.timelineX) >= sourceX ? 0 : 1;
                const bForward = Number(nodeB?.timelineX) >= sourceX ? 0 : 1;
                if (aForward !== bForward)
                    return aForward - bForward;
                const xDiff = (Number(nodeA?.timelineX) || 0) - (Number(nodeB?.timelineX) || 0);
                if (Math.abs(xDiff) > 0.001)
                    return xDiff;
                return a.localeCompare(b);
            }));
        });
        const sortedIds = groupNodes
            .map(node => this.getNodeId(node))
            .sort((a, b) => {
            const nodeA = nodeById.get(a);
            const nodeB = nodeById.get(b);
            const xDiff = (Number(nodeA?.timelineX) || 0) - (Number(nodeB?.timelineX) || 0);
            if (Math.abs(xDiff) > 0.001)
                return xDiff;
            return a.localeCompare(b);
        });
        const laneById = new Map<string, number>();
        const visiting = new Set<string>();
        let nextLane = 0;
        const assignLane = (nodeId: string): number => {
            if (!laneById.has(nodeId)) {
                laneById.set(nodeId, nextLane++);
            }
            return laneById.get(nodeId) ?? 0;
        };
        const visit = (nodeId: string): number => {
            const existingLane = laneById.get(nodeId);
            if (existingLane !== undefined) {
                return existingLane;
            }
            assignLane(nodeId);
            if (visiting.has(nodeId)) {
                return laneById.get(nodeId) ?? 0;
            }
            visiting.add(nodeId);
            (outgoing.get(nodeId) || [])
                .filter(childId => nodeById.has(childId))
                .forEach(childId => visit(childId));
            visiting.delete(nodeId);
            return laneById.get(nodeId) ?? 0;
        };
        // Finish every disconnected component before starting the next one.
        // Visiting all roots first can otherwise interleave separate chains
        // when a component also contains a cycle or multiple incoming paths.
        const componentKeyById = this.getTransmissionChainConnectedComponentKeys(groupNodes, groupLinks);
        const componentNodeIds = new Map<string, string[]>();
        sortedIds.forEach(nodeId => {
            const componentKey = componentKeyById.get(nodeId);
            if (!componentNodeIds.has(componentKey)) componentNodeIds.set(componentKey, []);
            componentNodeIds.get(componentKey).push(nodeId);
        });
        let firstComponent = true;
        componentNodeIds.forEach(nodeIds => {
            if (!firstComponent) nextLane++;
            firstComponent = false;
            nodeIds.filter(nodeId => (incomingCount.get(nodeId) || 0) === 0).forEach(nodeId => visit(nodeId));
            nodeIds.forEach(nodeId => visit(nodeId));
        });
        return laneById;
    }
    private layoutTransmissionChainTimelineNodes(nodes: any[], links: any[], nodeIdSet: Set<string>): void {
        if (nodes.length < 2) {
            return;
        }
        const validLinks = links
            .map(link => ({
            source: this.getLinkEndpointId(link.source),
            target: this.getLinkEndpointId(link.target)
        }))
            .filter(link => nodeIdSet.has(link.source) && nodeIdSet.has(link.target));
        const connectedComponentKeyById = this.getTransmissionChainConnectedComponentKeys(nodes, validLinks);
        const groupKeyById = new Map<string, string>();
        const groups = new Map<string, {
            key: string;
            nodes: any[];
            links: Array<{
                source: string;
                target: string;
            }>;
        }>();
        nodes.forEach(node => {
            const nodeId = this.getNodeId(node);
            const groupKey = this.getTransmissionChainClusterKey(node, connectedComponentKeyById.get(nodeId) || `component:${nodeId}`);
            groupKeyById.set(nodeId, groupKey);
            if (!groups.has(groupKey)) {
                groups.set(groupKey, { key: groupKey, nodes: [], links: [] });
            }
            groups.get(groupKey).nodes.push(node);
        });
        validLinks.forEach(link => {
            const sourceGroup = groupKeyById.get(link.source);
            if (sourceGroup && sourceGroup === groupKeyById.get(link.target)) {
                groups.get(sourceGroup)?.links.push(link);
            }
        });
        const maxNodeSize = Math.max(...nodes.map(node => this.getTimelineNodeVerticalRadius(node)), 20);
        const baseLaneGap = Math.max(44, (maxNodeSize * 1.8) + 14);
        const nodeSizedGroupGap = (maxNodeSize * 2.7) + 36;
        const minimumLaneGap = Math.max(44, (maxNodeSize * 1.45) + 8);
        const minimumGroupGap = Math.max(minimumLaneGap * 1.35, (maxNodeSize * 2.2) + 24);
        const laneGap = Math.max(minimumLaneGap, baseLaneGap);
        const groupGap = Math.max(minimumGroupGap, laneGap * 1.65, nodeSizedGroupGap);
        let nextGroupTop = 0;
        const yAxisField = this.getTransmissionChainYAxisField();
        const orderedGroups = Array.from(groups.values()).sort((a, b) => {
            if (yAxisField !== 'None') {
                const aLabel = this.getTransmissionChainYAxisValue(a.nodes[0]);
                const bLabel = this.getTransmissionChainYAxisValue(b.nodes[0]);
                return aLabel.localeCompare(bLabel, undefined, { numeric: true, sensitivity: 'base' });
            }
            const aMinX = Math.min(...a.nodes.map(node => Number(node.timelineX) || 0));
            const bMinX = Math.min(...b.nodes.map(node => Number(node.timelineX) || 0));
            if (Math.abs(aMinX - bMinX) > 0.001)
                return aMinX - bMinX;
            const aMeanX = d3.mean(a.nodes, node => Number(node.timelineX) || 0) || 0;
            const bMeanX = d3.mean(b.nodes, node => Number(node.timelineX) || 0) || 0;
            if (Math.abs(aMeanX - bMeanX) > 0.001)
                return aMeanX - bMeanX;
            return a.key.localeCompare(b.key);
        });
        orderedGroups.forEach(group => {
            const laneById = this.assignTransmissionChainGroupLanes(group.nodes, group.links);
            const lanes = group.nodes.map(node => laneById.get(this.getNodeId(node)) ?? 0);
            const minLane = Math.min(...lanes);
            const maxLane = Math.max(...lanes);
            const groupHeight = Math.max(laneGap, ((maxLane - minLane) * laneGap) + (maxNodeSize * 2));
            group.nodes.forEach(node => {
                const lane = laneById.get(this.getNodeId(node)) ?? 0;
                node.y = nextGroupTop + ((lane - minLane) * laneGap) + (maxNodeSize / 2);
            });
            nextGroupTop += groupHeight + groupGap;
        });
        const minY = Math.min(...nodes.map(node => Number(node.y)));
        const maxY = Math.max(...nodes.map(node => Number(node.y)));
        const centerY = Number.isFinite(minY) && Number.isFinite(maxY) ? (minY + maxY) / 2 : 0;
        nodes.forEach(node => {
            node.y = Number(node.y) - centerY;
        });
    }
    private clearTimelineLayoutMetadata(): void {
        this.transmissionChainBaseTimelineRange = null;
        this.timelineLayoutMetadata = {
            active: false,
            field: 'None',
            ticks: [],
            domainStart: null,
            domainEnd: null,
            rangeStart: 0,
            rangeEnd: 0,
            singleDateDomain: false,
            yAxisField: 'None',
            yAxisGroups: []
        };
        this.updateTimelineAxisOverlay();
    }
    private async precomputeTimelinePositionsWithD3(nodes: any[], links: any[]): Promise<{
        nodes: any[];
        links: any[];
    }> {
        const field = this.getNetworkTimelineDateField();
        if (!this.isTimelineLayoutActive()) {
            this.clearTimelineLayoutMetadata();
            return { nodes, links };
        }
        const referenceNodes = this.getTimelineLayoutReferenceNodes();
        const referenceTimestamps = referenceNodes
            .map(node => this.getTimelineLayoutTimestamp(node, field))
            .filter((timestamp): timestamp is number => timestamp !== null);
        const validReferenceCount = referenceTimestamps.length;
        const domainStart = validReferenceCount ? Math.min(...referenceTimestamps) : null;
        const domainEnd = validReferenceCount ? Math.max(...referenceTimestamps) : null;
        const visibleNodeCount = Math.max(nodes.length, 1);
        const distinctDateCount = new Set(referenceTimestamps).size;
        const containerWidth = this.cyContainer?.nativeElement?.getBoundingClientRect().width || 800;
        const baseTimelineWidth = Math.max(containerWidth * 1.25, distinctDateCount * 70, visibleNodeCount * 24, 600);
        this.transmissionChainBaseTimelineRange = { start: -baseTimelineWidth / 2, end: baseTimelineWidth / 2 };
        const savedWidth = Number(this.widgets['transmission-chain-timeline-width']);
        const timelineWidth = this.transmissionChainInitialAutoFitPending
            && this.transmissionChainDateFieldToCenter === null
            && Number.isFinite(savedWidth) && savedWidth > 0
            ? savedWidth
            : baseTimelineWidth;
        const rangeStart = -timelineWidth / 2;
        const rangeEnd = timelineWidth / 2;
        const hasDateDomain = domainStart !== null && domainEnd !== null;
        const singleDateDomain = hasDateDomain && domainStart === domainEnd;
        const dateScale = hasDateDomain && !singleDateDomain
            ? d3.scaleTime().domain([new Date(domainStart), new Date(domainEnd)]).range([rangeStart, rangeEnd])
            : null;
        const nodeIdSet = new Set(nodes.map(node => {
            const nodeId = this.getNodeId(node);
            node.id = nodeId;
            return nodeId;
        }));
        nodes.forEach((node, index) => {
            const nodeId = this.getNodeId(node);
            const timestamp = this.getTimelineLayoutTimestamp(node, field);
            // Undated nodes are excluded before layout.
            const timelineX = singleDateDomain ? 0 : Number(dateScale(new Date(timestamp)));
            const cachedY = this.nodePositions.get(nodeId)?.y;
            const existingY = Number(node.y);
            node.x = timelineX;
            node.y = Number.isFinite(existingY)
                ? existingY
                : Number.isFinite(cachedY)
                    ? cachedY
                    : (index - ((nodes.length - 1) / 2)) * 42;
            node.timelineX = timelineX;
            node.fx = timelineX;
        });
        const restoringPositions = this.transmissionChainInitialAutoFitPending
            && this.transmissionChainDateFieldToCenter === null
            && !!normalizeTransmissionChainCamera(this.widgets.camera)
            && nodes.every(node => {
                const position = this.nodePositions.get(this.getNodeId(node));
                return position && Number.isFinite(position.x) && Number.isFinite(position.y);
            });
        if (!this.widgets.pinned && !restoringPositions) {
            this.layoutTransmissionChainTimelineNodes(nodes, links, nodeIdSet);
        }
        nodes.forEach((node, index) => {
            const fallbackY = (index - ((nodes.length - 1) / 2)) * 42;
            node.x = node.timelineX;
            node.y = Number.isFinite(Number(node.y)) ? Number(node.y) : fallbackY;
            delete node.fx;
            delete node.vx;
            delete node.vy;
        });
        const tickTarget = Math.max(2, Math.min(8, Math.floor(containerWidth / 130)));
        const ticksForAxis = hasDateDomain
            ? singleDateDomain
                ? [{ x: 0, label: this.formatTimelineTickLabel(domainStart, domainStart, domainEnd) }]
                : dateScale.ticks(tickTarget).map((date: Date) => ({
                    x: Number(dateScale(date)),
                    label: this.formatTimelineTickLabel(date.getTime(), domainStart, domainEnd)
                }))
            : [];
        this.timelineLayoutMetadata = {
            active: true,
            field,
            ticks: ticksForAxis,
            domainStart,
            domainEnd,
            rangeStart,
            rangeEnd,
            singleDateDomain: !!singleDateDomain,
            yAxisField: this.getTransmissionChainYAxisField(),
            yAxisGroups: this.getTransmissionChainYAxisGroups(nodes)
        };
        return { nodes, links };
    }
    private ensureTimelineAxisResizeObserver(): void {
        if (typeof ResizeObserver === 'undefined') {
            return;
        }
        if (!this.timelineAxisResizeObserver) {
            this.timelineAxisResizeObserver = new ResizeObserver(() => this.handleContainerResize());
        }
        [
            this.exportContainer?.nativeElement,
            this.cyContainer?.nativeElement,
            this.cy?.container(),
            this.container?.element,
            this.rootHtmlElement
        ]
            .filter((element): element is Element => !!element)
            .forEach(element => {
            if (!this.timelineAxisResizeObservedElements.has(element)) {
                this.timelineAxisResizeObserver.observe(element);
                this.timelineAxisResizeObservedElements.add(element);
            }
        });
    }
    private redrawTimelineAxisForResize(): void {
        if (this.isDestroyed) return;
        this.syncNetworkContainerBounds();
        if (this.cy) {
            this.cy.resize();
        }
        this.recordTimelineViewportArea();
        this.fitTimelineAfterViewportResize();
        if (this.timelineAxisUpdateTimeout) {
            clearTimeout(this.timelineAxisUpdateTimeout);
            this.timelineAxisUpdateTimeout = null;
        }
        this.updateTimelineAxisOverlay();
    }
    private recordTimelineViewportArea(): void {
        const area = this.getTimelineViewportArea();
        this.updateTimelinePlotClip(area);
        if (!area || !this.viewActive) return;
        const previous = this.lastTimelineViewportArea;
        if (previous && (['left', 'top', 'width', 'height'] as const)
            .some(key => Math.abs(area[key] - previous[key]) > 1)) {
            this.timelineViewportFitPending = true;
        }
        this.lastTimelineViewportArea = area;
    }
    private fitTimelineAfterViewportResize(): void {
        if (this.isDestroyed || !this.timelineViewportFitPending || this.rendering || !this.viewActive
            || !this.cy || !this.isTimelineLayoutActive() || !this.timelineLayoutMetadata.active
            || this.cy.nodes().empty() || !this.getTimelineViewportArea()) return;
        this.openCenter();
    }
    private updateTimelinePlotClip(area: TimelineViewportArea | null): void {
        const axisOverlay = this.timelineAxisOverlay?.nativeElement;
        const layers = [this.cyContainer?.nativeElement, this.timelineGridOverlay?.nativeElement]
            .filter((element): element is HTMLElement | SVGSVGElement => !!element);
        if (!this.isTimelineLayoutActive() || !this.timelineLayoutMetadata.active) {
            layers.forEach(layer => layer.style.removeProperty('clip-path'));
            axisOverlay?.style.removeProperty('clip-path');
            return;
        }
        const { width, height } = this.getTimelineAxisOverlayFrame();
        const clip = area
            ? `inset(${area.top}px ${Math.max(0, width - area.left - area.width)}px ${Math.max(0, height - area.top - area.height)}px ${area.left}px)`
            : 'inset(50%)';
        layers.forEach(layer => {
            if (layer.style.getPropertyValue('clip-path') !== clip) layer.style.setProperty('clip-path', clip);
        });
        const axisClip = area ? `inset(${area.top}px 0px 0px)` : 'inset(50%)';
        if (axisOverlay && axisOverlay.style.getPropertyValue('clip-path') !== axisClip) {
            axisOverlay.style.setProperty('clip-path', axisClip);
        }
    }
    private setElementStyle(element: HTMLElement, property: string, value: string): void {
        if (element.style.getPropertyValue(property) !== value) {
            element.style.setProperty(property, value);
        }
    }
    private getRect(element?: Element | null): DOMRect | null {
        if (!element || typeof element.getBoundingClientRect !== 'function') {
            return null;
        }
        return element.getBoundingClientRect();
    }
    private syncNetworkContainerBounds(): void {
        const exportElement = this.exportContainer?.nativeElement as HTMLElement | undefined;
        const cyElement = (this.cy?.container() as HTMLElement | undefined)
            || (this.cyContainer?.nativeElement as HTMLElement | undefined);
        if (!exportElement) {
            return;
        }
        const exportRect = this.getRect(exportElement);
        const hostRect = this.getRect(this.rootHtmlElement);
        const containerRect = this.getRect(this.container?.element);
        const toolbarRect = this.getRect(this.toolBtnContainer?.nativeElement);
        const warningRect = this.getRect(document.getElementById('url-warning-div'));
        const exportTop = exportRect?.top
            || ((hostRect?.top || containerRect?.top || 0) + (toolbarRect?.height || 0));
        const hostTop = hostRect?.top || containerRect?.top || exportTop;
        const bottomCandidates = [
            hostRect?.bottom,
            containerRect?.bottom,
            Number.isFinite(this.goldenLayoutSize?.height)
                ? hostTop + this.goldenLayoutSize.height
                : undefined,
            warningRect && warningRect.height > 0 && warningRect.top > exportTop
                ? warningRect.top
                : undefined
        ].filter((value): value is number => Number.isFinite(value) && value > exportTop + 40);
        let availableHeight = bottomCandidates.length
            ? Math.floor(Math.min(...bottomCandidates) - exportTop)
            : 0;
        if (!availableHeight) {
            const paneHeight = this.goldenLayoutSize?.height
                || hostRect?.height
                || containerRect?.height
                || 0;
            availableHeight = Math.floor(paneHeight - (toolbarRect?.height || 0) - 2);
        }
        if (availableHeight > 0) {
            this.setElementStyle(exportElement, 'height', `${Math.max(80, availableHeight)}px`);
        }
        if (cyElement) {
            this.setElementStyle(cyElement, 'height', '100%');
            this.setElementStyle(cyElement, 'width', '100%');
        }
    }
    private scheduleTimelineAxisOverlayUpdate(): void {
        if (this.timelineAxisUpdateTimeout) {
            clearTimeout(this.timelineAxisUpdateTimeout);
        }
        this.timelineAxisUpdateTimeout = setTimeout(() => {
            this.timelineAxisUpdateTimeout = null;
            this.updateTimelineAxisOverlay();
        }, 0);
    }
    private getTimelineAxisTicks(screenWidth: number, zoom: number): TimelineLayoutTick[] {
        const metadata = this.timelineLayoutMetadata;
        if (metadata.domainStart === null || metadata.domainEnd === null) {
            return metadata.ticks;
        }
        if (metadata.singleDateDomain) {
            return [{
                    x: (metadata.rangeStart + metadata.rangeEnd) / 2,
                    label: this.formatTimelineTickLabel(metadata.domainStart, metadata.domainStart, metadata.domainEnd)
                }];
        }
        const renderedTimelineWidth = Math.abs(metadata.rangeEnd - metadata.rangeStart) * Math.max(zoom, 0.01);
        const tickTarget = Math.max(2, Math.min(20, Math.floor(Math.max(screenWidth, renderedTimelineWidth) / 120)));
        const dateScale = d3.scaleTime()
            .domain([new Date(metadata.domainStart), new Date(metadata.domainEnd)])
            .range([metadata.rangeStart, metadata.rangeEnd]);
        return dateScale.ticks(tickTarget).map((date: Date) => ({
            x: Number(dateScale(date)),
            label: this.formatTimelineTickLabel(date.getTime(), metadata.domainStart, metadata.domainEnd)
        }));
    }
    private estimateTimelineAxisLabelWidth(label: string, fontSize: number): number {
        return Math.max(34, (label.length * fontSize * 0.62) + 12);
    }
    private getTimelineAxisLabelSize(): number {
        const size = Number(this.widgets['transmission-chain-axis-label-size']);
        return Number.isFinite(size) ? Math.min(TRANSMISSION_CHAIN_MAX_AXIS_LABEL_SIZE, Math.max(10, size)) : 14;
    }
    private getTimelineAxisBottomOffset(): number {
        return Math.max(TIMELINE_AXIS_BOTTOM_OFFSET, (this.getTimelineAxisLabelSize() * 2) + 28);
    }
    private getTimelineAxisTitleSize(): number {
        return Math.min(TRANSMISSION_CHAIN_MAX_AXIS_LABEL_SIZE, this.getTimelineAxisLabelSize() + 4);
    }
    private getTimelineYAxisLabelX(): number {
        return this.getTimelineAxisTitleSize() + 14;
    }
    private getTimelineYAxisLabelWidth(width: number): number {
        const maximumWidth = Math.max(0, (width * 0.3) - this.getTimelineYAxisLabelX() - 12);
        const labelWidth = Math.max(0, ...this.timelineLayoutMetadata.yAxisGroups
            .map(group => this.estimateTimelineAxisLabelWidth(group.label, this.getTimelineAxisLabelSize())));
        return Math.min(maximumWidth, labelWidth);
    }
    private formatTimelineYAxisLabel(label: string, width: number): string {
        const maxCharacters = Math.max(1, Math.floor((width - 12) / (this.getTimelineAxisLabelSize() * 0.62)));
        if (label.length <= maxCharacters) return label;
        return maxCharacters === 1 ? '…' : `${label.slice(0, maxCharacters - 1)}…`;
    }
    private filterTimelineAxisLabelCollisions<T extends { renderedX: number; label: string }>(ticks: T[]): T[] {
        const fontSize = this.getTimelineAxisLabelSize();
        const accepted: T[] = [];
        [...ticks].sort((a, b) => a.renderedX - b.renderedX).forEach(tick => {
            const previous = accepted[accepted.length - 1];
            if (previous) {
                const halfWidth = (this.estimateTimelineAxisLabelWidth(previous.label, fontSize)
                    + this.estimateTimelineAxisLabelWidth(tick.label, fontSize)) / 2;
                if (tick.renderedX - previous.renderedX < halfWidth + 14) return;
            }
            accepted.push(tick);
        });
        return accepted;
    }
    private getTimelineAxisOverlayFrame(): {
        width: number;
        height: number;
        left: number;
        top: number;
        screenTop: number;
    } {
        this.syncNetworkContainerBounds();
        const hostElement = this.exportContainer?.nativeElement as HTMLElement | undefined;
        const cyElement = (this.cy?.container() as HTMLElement | undefined)
            || (this.cyContainer?.nativeElement as HTMLElement | undefined);
        const hostRect = this.getRect(hostElement);
        const cyRect = this.getRect(cyElement);
        const width = cyRect?.width
            || hostRect?.width
            || cyElement?.clientWidth
            || hostElement?.clientWidth
            || 0;
        const height = cyRect?.height
            || hostRect?.height
            || cyElement?.clientHeight
            || hostElement?.clientHeight
            || 0;
        const left = cyRect && hostRect ? Math.max(0, Math.round(cyRect.left - hostRect.left)) : 0;
        const top = cyRect && hostRect ? Math.max(0, Math.round(cyRect.top - hostRect.top)) : 0;
        const screenTop = cyRect?.top || hostRect?.top || 0;
        return { width, height, left, top, screenTop };
    }
    private updateTimelineAxisOverlay(): void {
        const overlay = this.timelineAxisOverlay?.nativeElement;
        const gridOverlay = this.timelineGridOverlay?.nativeElement;
        if (!overlay || !gridOverlay) {
            return;
        }
        this.ensureTimelineAxisResizeObserver();
        const overlaySelection = d3.select(overlay);
        const gridSelection = d3.select(gridOverlay);
        overlaySelection.selectAll('*').remove();
        gridSelection.selectAll('*').remove();
        if (!this.isTimelineLayoutActive() || !this.timelineLayoutMetadata.active || !this.cy) {
            overlaySelection.classed('hidden', true);
            gridSelection.classed('hidden', true);
            return;
        }
        const { width, height, left, top } = this.getTimelineAxisOverlayFrame();
        if (!width || !height) {
            overlaySelection.classed('hidden', true);
            gridSelection.classed('hidden', true);
            return;
        }
        for (const layer of [gridSelection, overlaySelection]) {
            layer
                .classed('hidden', false)
                .attr('width', width)
                .attr('height', height)
                .attr('viewBox', `0 0 ${width} ${height}`)
                .style('width', `${width}px`)
                .style('height', `${height}px`)
                .style('left', `${left}px`)
                .style('top', `${top}px`);
        }
        const pan = this.cy.pan();
        const zoom = this.cy.zoom();
        const renderedX = (modelX: number): number => (modelX * zoom) + pan.x;
        const renderedY = (modelY: number): number => (modelY * zoom) + pan.y;
        const axisLabelSize = this.getTimelineAxisLabelSize();
        const axisTitleSize = this.getTimelineAxisTitleSize();
        const yAxisLabelX = this.getTimelineYAxisLabelX();
        const yAxisLabelWidth = this.getTimelineYAxisLabelWidth(width);
        const axisY = Math.max(24, height - this.getTimelineAxisBottomOffset());
        const axisLabelY = axisY + axisLabelSize + 8;
        const gridBottom = Math.max(0, axisY - TIMELINE_AXIS_GRID_GAP);
        const viewportArea = this.getTimelineViewportArea();
        const titleCenterY = viewportArea ? viewportArea.top + (viewportArea.height / 2) : axisY / 2;
        const yAxisTitleX = (axisTitleSize / 2) + 6;
        const yAxisField = this.timelineLayoutMetadata.yAxisField;
        overlaySelection.append('text')
            .attr('class', 'timeline-y-axis-title')
            .attr('x', yAxisTitleX)
            .attr('y', titleCenterY)
            .attr('transform', `rotate(-90 ${yAxisTitleX} ${titleCenterY})`)
            .attr('dominant-baseline', 'middle')
            .attr('fill', '#333333')
            .attr('font-size', axisTitleSize)
            .attr('font-weight', 700)
            .attr('text-anchor', 'middle')
            .attr('paint-order', 'stroke')
            .attr('stroke', '#ffffff')
            .attr('stroke-width', 4)
            .attr('stroke-linejoin', 'round')
            .text(yAxisField === 'None' ? 'Chains' : this.commonService.capitalize(yAxisField.replace(/_/g, ' ')));
        overlaySelection.append('text')
            .attr('class', 'timeline-x-axis-title')
            .attr('x', viewportArea ? viewportArea.left + (viewportArea.width / 2) : width / 2)
            .attr('y', height - 10)
            .attr('fill', '#333333')
            .attr('font-size', axisTitleSize)
            .attr('font-weight', 700)
            .attr('text-anchor', 'middle')
            .attr('paint-order', 'stroke')
            .attr('stroke', '#ffffff')
            .attr('stroke-width', 4)
            .attr('stroke-linejoin', 'round')
            .text(this.commonService.capitalize(this.timelineLayoutMetadata.field.replace(/_/g, ' ')));
        const visibleTickCandidates = this.getTimelineAxisTicks(width, zoom)
            .map(tick => ({ ...tick, renderedX: renderedX(tick.x) }))
            .filter(tick => tick.renderedX >= -80 && tick.renderedX <= width + 80);
        const visibleTicks = this.filterTimelineAxisLabelCollisions(visibleTickCandidates);
        if (this.timelineLayoutMetadata.yAxisField !== 'None' &&
            this.timelineLayoutMetadata.yAxisGroups.length > 0) {
            const visibleGroups = this.timelineLayoutMetadata.yAxisGroups
                .map((group, index, groups) => {
                const renderedBoundaryMinY = renderedY(group.boundaryMinY);
                const renderedBoundaryMaxY = renderedY(group.boundaryMaxY);
                return {
                    ...group,
                    renderedBoundaryMinY,
                    renderedBoundaryMaxY,
                    isLastGroup: index === groups.length - 1,
                    labelY: renderedBoundaryMinY + axisLabelSize + 5
                };
            })
                .filter(group => group.renderedBoundaryMaxY >= -40 && group.renderedBoundaryMinY <= axisY + 40);
            const yAxisLayer = overlaySelection.append('g')
                .attr('class', 'timeline-y-axis');
            const yLabelClipId = `${this.cyElementId}-y-label-clip`;
            overlaySelection.append('defs').append('clipPath')
                .attr('id', yLabelClipId)
                .append('rect')
                .attr('x', yAxisLabelX)
                .attr('y', viewportArea?.top ?? axisY)
                .attr('width', yAxisLabelWidth)
                .attr('height', viewportArea?.height ?? 0);
            yAxisLayer.attr('clip-path', `url(#${yLabelClipId})`);
            const yAxisGroups = yAxisLayer.selectAll('g.timeline-y-axis-group')
                .data(visibleGroups)
                .enter()
                .append('g')
                .attr('class', 'timeline-y-axis-group')
                .attr('data-y-axis-value', group => group.label);
            gridSelection.selectAll('line.timeline-y-axis-boundary-start')
                .data(visibleGroups)
                .enter()
                .append('line')
                .attr('class', 'timeline-y-axis-gridline timeline-y-axis-boundary-start')
                .attr('data-y-axis-value', group => group.label)
                .attr('x1', yAxisLabelX - 2)
                .attr('x2', width)
                .attr('y1', group => group.renderedBoundaryMinY)
                .attr('y2', group => group.renderedBoundaryMinY)
                .attr('stroke', '#464646')
                .attr('stroke-opacity', 0.16)
                .attr('stroke-width', 1)
                .attr('stroke-dasharray', '3 5')
                .attr('fill', 'none');
            gridSelection.selectAll('line.timeline-y-axis-boundary-end')
                .data(visibleGroups.filter(group => group.isLastGroup))
                .enter()
                .append('line')
                .attr('class', 'timeline-y-axis-gridline timeline-y-axis-boundary-end')
                .attr('data-y-axis-value', group => group.label)
                .attr('x1', yAxisLabelX - 2)
                .attr('x2', width)
                .attr('y1', group => group.renderedBoundaryMaxY)
                .attr('y2', group => group.renderedBoundaryMaxY)
                .attr('stroke', '#464646')
                .attr('stroke-opacity', 0.16)
                .attr('stroke-width', 1)
                .attr('stroke-dasharray', '3 5')
                .attr('fill', 'none');
            const yAxisLabels = yAxisGroups.append('text')
                .attr('class', 'timeline-y-axis-label')
                .attr('x', yAxisLabelX)
                .attr('y', group => group.labelY)
                .attr('fill', '#333333')
                .attr('font-size', axisLabelSize)
                .attr('font-weight', 600)
                .attr('text-anchor', 'start')
                .attr('paint-order', 'stroke')
                .attr('stroke', '#ffffff')
                .attr('stroke-width', 4)
                .attr('stroke-linejoin', 'round')
                .attr('aria-label', group => group.label)
                .text(group => this.formatTimelineYAxisLabel(group.label, yAxisLabelWidth));
        }
        overlaySelection.append('line')
            .attr('class', 'timeline-axis-baseline')
            .attr('x1', 0)
            .attr('x2', width)
            .attr('y1', axisY)
            .attr('y2', axisY)
            .attr('stroke', '#464646')
            .attr('stroke-opacity', 0.6)
            .attr('stroke-width', 1)
            .attr('fill', 'none');
        const tickGroups = overlaySelection.selectAll('g.timeline-axis-tick')
            .data(visibleTicks)
            .enter()
            .append('g')
            .attr('class', 'timeline-axis-tick');
        gridSelection.selectAll('line.timeline-axis-gridline')
            .data(visibleTicks)
            .enter()
            .append('line')
            .attr('class', 'timeline-axis-gridline')
            .attr('x1', d => d.renderedX)
            .attr('x2', d => d.renderedX)
            .attr('y1', 0)
            .attr('y2', gridBottom)
            .attr('stroke', '#464646')
            .attr('stroke-opacity', 0.18)
            .attr('stroke-width', 1)
            .attr('fill', 'none');
        tickGroups.append('line')
            .attr('class', 'timeline-axis-tickmark')
            .attr('x1', d => d.renderedX)
            .attr('x2', d => d.renderedX)
            .attr('y1', axisY - 4)
            .attr('y2', axisY + 4)
            .attr('stroke', '#464646')
            .attr('stroke-opacity', 0.7)
            .attr('stroke-width', 1)
            .attr('fill', 'none');
        tickGroups.append('text')
            .attr('class', 'timeline-axis-label')
            .attr('x', d => d.renderedX)
            .attr('y', axisLabelY)
            .attr('fill', '#333333')
            .attr('font-size', axisLabelSize)
            .attr('text-anchor', 'middle')
            .attr('paint-order', 'stroke')
            .attr('stroke', '#ffffff')
            .attr('stroke-width', 3)
            .attr('stroke-linejoin', 'round')
            .text(d => d.label);
    }
    private mapLinksToCytoscapeElements(data: { nodes: any[]; links: any[] }): cytoscape.EdgeDefinition[] {
        const transmissionChainCurveData = this.getTransmissionChainEdgeCurveData(data.links, data.nodes);
        return data.links.flatMap((link: any, linkIndex: number) => {
            const source = this.getLinkEndpointId(link.source);
            const target = this.getLinkEndpointId(link.target);
            const edgeId = String(link.id ?? `${source}-${target}-${linkIndex}`);
            const curveData = transmissionChainCurveData.get(edgeId);
            const linkOrigins = Array.isArray(link.origin)
                ? link.origin
                : link.origin
                    ? [link.origin]
                    : [];
            if ((this.widgets['link-color-variable'] == 'Origin' || this.widgets['link-color-variable'] == 'origin') && linkOrigins.length > 1) {
                return linkOrigins.map((originItem: any, index) => ({
                    data: {
                        // Include any additional edge-specific data properties
                        ...link,
                        id: index > 0 ? `${edgeId}-${index + 1}` : edgeId,
                        source: link.source,
                        target: link.target,
                        lineSelectedColor: this.widgets['selected-color'],
                        mtRawLinkLabel: this.getRawLinkLabel(link),
                        label: this.getLinkLabel(link).text,
                        fontSize: this.getLinkFontSize(link),
                        lineColor: this.getLinkColor({ origin: originItem }).color, // Default to black if not specified
                        lineOpacity: this.getLinkColor({ origin: originItem }).opacity, // Default to fully opaque if not specified
                        width: this.getConfiguredLinkWidth(),
                        origin: [originItem],
                        secondLink: index > 0 ? true : false,
                        transmissionChainCurveDistance: curveData?.distance ?? 0,
                        transmissionChainCurveWeight: curveData?.weight ?? 0.5,
                        transmissionChainFanoutGroupSize: curveData?.fanoutGroupSize ?? 1,
                        transmissionChainTaxiTurn: curveData?.taxiTurn ?? '0px'
                    }
                }));
            }
            return [{ data: {
                        // Include any additional edge-specific data properties
                        ...link,
                        id: edgeId,
                        source: link.source,
                        target: link.target,
                        lineSelectedColor: this.widgets['selected-color'],
                        mtRawLinkLabel: this.getRawLinkLabel(link),
                        label: this.getLinkLabel(link).text,
                        fontSize: this.getLinkFontSize(link),
                        lineColor: this.getLinkColor(link).color, // Default to black if not specified
                        lineOpacity: this.getLinkColor(link).opacity, // Default to fully opaque if not specified
                        width: this.getConfiguredLinkWidth(),
                        secondLink: false,
                        transmissionChainCurveDistance: curveData?.distance ?? 0,
                        transmissionChainCurveWeight: curveData?.weight ?? 0.5,
                        transmissionChainFanoutGroupSize: curveData?.fanoutGroupSize ?? 1,
                        transmissionChainTaxiTurn: curveData?.taxiTurn ?? '0px'
                    } }];
        });
    }
    mapDataToCytoscapeElements(data: any): cytoscape.ElementsDefinition {
        const mapStart = this.getPerformanceNow();
        const edges = this.mapLinksToCytoscapeElements(data);
        const nodes = data.nodes.map((node: any) => {
            node.label = this.getNodeLabel(node);
            node.nodeSize = Number(this.getNodeSize(node));
            [node.nodeColor, node.bgOpacity] = this.getNodeColor(node);
            node.borderWidth = this.getNodeBorderWidth(node);
            const shapeKey = this.getNodeShape(node);
            node.mixedColorImage = this.getMixedColorNodeImage(node, shapeKey, node.nodeColor, node.bgOpacity);
            const parent = undefined;
            return {
                data: this.buildCytoscapeNodeData(node, shapeKey, parent),
                position: this.getNodeRenderPosition(node)
            };
        });
        this.recordRenderTiming('transmissionChainMapElements', mapStart, {
            nodes: nodes.length,
            edges: edges.length
        });
        return {
            edges: edges,
            nodes: nodes
        };
    }
    private getRenderedLinkWidth(edge: cytoscape.EdgeSingular): number {
        const width = Number(edge.data('width'));
        const normalWidth = Number.isFinite(width) && width >= 0 ? width : this.getConfiguredLinkWidth();
        const highlighted = edge.selected() || edge.hasClass('highlighted');
        return highlighted
            ? Math.max(normalWidth * 1.75, normalWidth + 3)
            : normalWidth;
    }
    getCytoscapeStyles(): cytoscape.StylesheetCSS[] { return createNetworkCytoscapeStyles(this.widgets, { explorer: true, linkWidth: edge => this.getRenderedLinkWidth(edge), edgeRouting: this.getTimelineAwareEdgeRoutingStyle() }); }
    private setCytoscapeNodeHover(node: cytoscape.NodeSingular | null): void {
        setNetworkNeighborHover(this.cy, node, Boolean(this.widgets['node-highlight']), true);
    }
    attachCytoscapeEvents() {
        this.ensureTimelineAxisResizeObserver();
        if (this.cyContainer?.nativeElement) {
            $(this.cyContainer.nativeElement).off('contextmenu.transmissionChainExplorer').on('contextmenu.transmissionChainExplorer', (e) => e.preventDefault());
        }
        // Debounced function to sync Cytoscape selections with the common service.
        const syncCySelectionToService = _.debounce(() => {
            if (this.isDestroyed || !this.cy) return;
            const selectedNodes = this.cy.nodes(':selected').filter((node: any) => !node.data('isCollapsedAggregate'));
            const selectedIds = new Set(selectedNodes.map(node => node.id()));
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
                this.commonService.updateStatistics();
                $(document).trigger('node-selected');
            }
        }, 100); // Debounce for 100ms to handle rapid events efficiently.
        // Listen for all selection events to trigger the sync.
        this.cy.on('select unselect', 'node', syncCySelectionToService);
        this.cy.on('pan zoom resize', () => this.scheduleTimelineAxisOverlayUpdate());
        this.cy.on('position', 'node', (evt) => {
            if (!this.applyingTimelinePositionLock) {
                this.enforceTimelineNodePosition(evt.target);
            }
            this.scheduleTimelineAxisOverlayUpdate();
        });
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
                let { x, y } = node.renderedPosition();
                originalEvent = new MouseEvent('cxttap', { clientX: x, clientY: y });
            }
            else {
                originalEvent = evt.originalEvent as MouseEvent;
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
                this.cyContainer.nativeElement.style.cursor = 'pointer';
                this.setCytoscapeNodeHover(node);
            });
        });
        this.cy.on('mouseout', 'node', () => {
            // Run UI updates inside Angular's zone
            this.zone.run(() => {
                this.hideTooltip();
                this.cyContainer.nativeElement.style.cursor = 'default';
                this.setCytoscapeNodeHover(null);
            });
        });
        // Edge events
        this.cy.on('mouseover', 'edge', (evt) => {
            this.zone.run(() => {
                const edge = evt.target;
                this.showLinkTooltip(edge.data(), evt.originalEvent);
            });
        });
        this.cy.on('mouseout', 'edge', (evt) => {
            this.zone.run(() => {
                this.hideTooltip();
            });
        });
        this.cy.on('dragfree', 'node', (evt) => {
            const node = evt.target;
            let skip = (node.children().length > 0 || node.classes().includes('hidden')); // no need to update position of parent or hidden nodes
            if (!skip) {
                this.updateNodePos(node);
            }
            // Handle node drag logic
        });
    }
    /**
     * Replicates the mapData function from cytoscape so that I can use it outside of cytoscape to know the size of the node
     */
    mapNodeSize(size: number): number {
        // mapData(nodeSize, 0, 100, 10, 50)
        let out = size / 100 * 40 + 10;
        return out;
    }
    updateNodePos(node: cytoscape.NodeSingular): void { this.enforceTimelineNodePosition(node); this.nodePositions.set(node.id(), { ...node.position() }); this.widgets.positions = Object.fromEntries(this.nodePositions); this.scheduleTimelineAxisOverlayUpdate(); }
    /**
     * @returns an array [X, Y] of the position of mouse relative to twodcomponent. Global position (i.e. d3.event.pageX) doesn't work for a dashboard
     */
    getRelativeMousePosition(event) {
        // Tooltips use coordinates relative to this Explorer's drawing area.
        const rendererContainer = (this.cyContainer?.nativeElement) as HTMLElement | undefined;
        const rect = rendererContainer?.getBoundingClientRect();
        if (!rect)
            return [0, 0];
        const X = event['clientX'] - rect.left;
        const Y = event['clientY'] - rect.top;
        return [X, Y];
    }
    /**
     * Updates calculated resolution based on scale
     * @param event Event from scale input
     */
    updateCalculatedResolution(): void {
        const rendererContainer = this.cyContainer;
        if (!rendererContainer?.nativeElement)
            return;
        let height = Math.floor(rendererContainer.nativeElement.offsetHeight * this.SelectedNetworkExportScaleVariable);
        let width = Math.floor(rendererContainer.nativeElement.offsetWidth * this.SelectedNetworkExportScaleVariable);
        this.CalculatedResolution = `${width} x ${height}`;
    }
    /**
     * Opens Global Setting Dialog
     */
    showGlobalSettings(event?: MouseEvent) {
        //console.log("threshold: ",  this.commonService.GlobalSettingsModel.SelectedLinkThresholdVariable);
        this.DisplayGlobalSettingsDialogEvent.emit(createGlobalSettingsDialogRequest('Styling', event));
    }
    async exportVisualization(_event?: Event): Promise<void> {
        if (!this.cy)
            return;
        this.exportService.setExportOptions({ filename: this.SelectedNetworkExportFilenameVariable, filetype: this.SelectedNetworkExportFileTypeListVariable, scale: this.SelectedNetworkExportScaleVariable, quality: this.SelectedNetworkExportQualityVariable });
        this.showExportDialog = false;
        this.exportService.beginExport('Preparing transmission chain image', 5);
        await this.exportService.waitForUiPaint();
        try {
            if (this.SelectedNetworkExportFileTypeListVariable === 'svg') {
                const content = (this.cy as any).svg({ scale: 1, full: false });
                const doc = new DOMParser().parseFromString(content, 'image/svg+xml');
                const root = doc.documentElement;
                const pixelScale = Number(root.getAttribute('width')) / this.cy.width() || 1;
                const background = doc.createElementNS('http://www.w3.org/2000/svg', 'rect');
                background.setAttribute('width', '100%');
                background.setAttribute('height', '100%');
                background.setAttribute('fill', this.widgets['background-color'] || '#ffffff');
                root.insertBefore(background, root.firstChild);
                const grid = this.timelineGridOverlay?.nativeElement;
                const axis = this.timelineAxisOverlay?.nativeElement;
                if (grid && !grid.classList.contains('hidden')) {
                    const layer = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
                    layer.innerHTML = grid.innerHTML;
                    layer.setAttribute('transform', 'scale(' + pixelScale + ')');
                    root.insertBefore(layer, background.nextSibling);
                }
                if (axis && !axis.classList.contains('hidden')) {
                    const layer = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
                    layer.innerHTML = axis.innerHTML;
                    layer.setAttribute('transform', 'scale(' + pixelScale + ')');
                    root.appendChild(layer);
                }
                this.exportService.requestSVGExport([], new XMLSerializer().serializeToString(doc), true, true, true);
            }
            else
                this.exportService.requestExport([this.exportContainer.nativeElement], true, true, true);
        }
        catch (error) {
            this.exportService.failExport('Export could not be completed');
            console.error(error);
        }
    }
    /**
     * Handles file type change
     * @param event New file type value
     */
    onNetworkExportFiletypeChange(event: string): void {
        this.SelectedNetworkExportFileTypeListVariable = event;
        this.widgets['network-export-filetype'] = event;
    }
    /**
     * Handles filename change
     * @param event New filename value
     */
    onDataChange(event: any): void {
        this.SelectedNetworkExportFilenameVariable = event; this.widgets['network-export-filename'] = event;
    }
    copyID() {
        const id = ($('#transmission-chain-copyID').attr('data-clipboard-text') || '').toString();
        if (id) {
            this.clipboard.copy(id);
        }
        this.hideContextMenu();
    }
    /**
     * Used from Context Menu and copy node's sequence to the user's clipboard
     */
    copySeq() {
        const seq = ($('#transmission-chain-copySeq').attr('data-clipboard-text') || '').toString();
        if (seq) {
            this.clipboard.copy(seq);
        }
        this.hideContextMenu();
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

        const idText = (d?._id ?? d?.id ?? '').toString();
        const seqText = (d?.sequence ?? d?.seq ?? '').toString();
        const hasSequence = seqText.trim().length > 0;
        $('#transmission-chain-copyID').attr('data-clipboard-text', idText);
        $('#transmission-chain-copySeq')
            .attr('data-clipboard-text', seqText)
            .prop('disabled', !hasSequence);
        const x = event.clientX ?? 0;
        const y = event.clientY ?? 0;
        const menu = $('#transmission-chain-context-menu');
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
    }
    /**
     * Hides the Context Menu
     */
    hideContextMenu() {
        $('#transmission-chain-context-menu').stop(true, true).animate({ 'opacity': 0 }, 80, function () {
            $(this).css({ 'z-index': -1, display: 'none' });
        });
    }
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
            if (aIsId && !bIsId)
                return -1;
            if (!aIsId && bIsId)
                return 1;
            return a.localeCompare(b);
        })
            .map(key => {
            const rawValue = node[key];
            let value = '';
            if (rawValue === null || rawValue === undefined) {
                value = '';
            }
            else if (Array.isArray(rawValue)) {
                value = rawValue.join(', ');
            }
            else if (typeof rawValue === 'object') {
                value = JSON.stringify(rawValue);
            }
            else {
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
    showNodeTooltip(node: any, event: MouseEvent | {
        clientX: number;
        clientY: number;
    }): void {
        const element = this.tooltipElement?.nativeElement;
        if (!element || node.isParent)
            return;
        if (this.widgets['node-highlight'])
            this.selectedNodeId = node.id;
        const fields = this.widgets['node-tooltip-variable'] || [];
        if (!fields.length)
            return;
        const content = fields.length === 1 ? String(node[fields[0]] ?? '') : this.tabulate(fields.map(field => [this.titleize(field), node[field]]));
        const [x, y] = this.getRelativeMousePosition(event);
        d3.select(element).html(content).style('position', 'absolute').style('left', (x + 10) + 'px').style('top', (y - 10) + 'px').style('z-index', 1000).transition().duration(100).style('opacity', 1);
    }
    /**
     * Gets data from current link needed for tooltip and displays it in the tooltip
     * @param d link
     */
    showLinkTooltip(d, event) {
        const tooltipElement = this.tooltipElement?.nativeElement;
        if (!tooltipElement) {
            return;
        }
        let v: any = this.SelectedLinkTooltipVariable;
        if (v == 'None')
            return;
        // Tooltip variables can be a single string or an array
        let tooltipVariables = this.SelectedLinkTooltipVariable;
        if (!Array.isArray(tooltipVariables)) {
            tooltipVariables = [tooltipVariables];
            this.SelectedLinkTooltipVariable = tooltipVariables; // Update SelectedLinkTooltipVariable to be an array
        }
        // If no tooltip variable is selected, we shouldn't show a tooltip
        if (tooltipVariables.length === 0 || tooltipVariables[0] == 'None')
            return;
        /**
         * @param data link
         * @param varName name of variable
         * @returns the value of the link for the variable
         */
        let getData = (data, varName) => {
            if (varName == 'source_id') {
                return data['source']; //._id
                // } else if (varName == 'source_index') {
                //     return data['source'].index
            }
            else if (varName == 'target_id') {
                return data['target']; //._id
                // } else if (varName == 'target_index') {
                //     return data['target'].index
            }
            else if (varName == 'distance') {
                if (data.hasDistance && data.distanceOrigin.includes(data.origin)) {
                    return this.formatLinkDistanceForDisplay(data['distance']);
                }
                else {
                    return 'N/A';
                }
            }
            else {
                return data[varName];
            }
        };
        // Generate the HTML for the tooltip
        let tooltipHtml = '';
        if (tooltipVariables.length > 1) {
            tooltipHtml = this.tabulate(tooltipVariables.map(variable => [this.titleize(variable), getData(d, variable)]));
        }
        else {
            tooltipHtml = getData(d, tooltipVariables[0]);
        }
        let [X, Y] = this.getRelativeMousePosition(event);
        d3.select(tooltipElement)
            .html(tooltipHtml)
            .style('position', 'absolute')
            .style('left', (X + 10) + 'px')
            .style('top', (Y - 10) + 'px')
            .style('z-index', 1000)
            .transition().duration(100)
            .style('opacity', 1);
    }
    /**
     * Hides the Tooltip
     */
    hideTooltip() {
        if (this.widgets['node-highlight']) {
            this.selectedNodeId = undefined;
        }
        const tooltipElement = this.tooltipElement?.nativeElement;
        if (!tooltipElement) {
            return;
        }
        let tooltip = d3.select(tooltipElement);
        tooltip
            .transition().duration(100)
            .style('opacity', 0)
            .on('end', () => tooltip.style('z-index', -1));
    }
    /**
     * @returns {boolean} if a is a number
     */
    isNumber(a): boolean {
        return typeof a == "number";
    }
    pinNodes() {
        this.widgets.pinned = !this.widgets.pinned;
    }
    async updateLayout(): Promise<void> {
        const initialViewPending = this.transmissionChainInitialAutoFitPending;
        const centerAfterLayoutPending = this.transmissionChainDateFieldToCenter !== null;
        await this._rerender(true);
        // The first render already restores the Explorer camera or selects a
        // readable initial zoom. A second fit would immediately replace it.
        if (!this.widgets.pinned && !initialViewPending && !centerAfterLayoutPending)
            this.fit();
    }
    /*/
        Node Events
    /*/
    /**
     * updates the value of the appropriate widget, add/removes rows from dialog menu, and calls redrawLabels to update labels on svg/view
     * @param e the name of variable to change labels to
     */
    onNodeLabelVaribleChange(value: string): void { this.widgets['node-label-variable'] = value; this.SelectedNodeLabelVariable = value; this.updateNodeLabels(); }
    getNodeSize(node: any): number {
        const field = this.widgets['node-radius-variable'];
        if (field === 'None')
            return this.getConfiguredNodeSize();
        const value = Number(node[field]);
        return Number.isFinite(value) ? this.nodeScale(value) : (Number(this.widgets['node-radius-min']) + Number(this.widgets['node-radius-max'])) / 2;
    }
    getNodeColor(node: any): [
        string,
        number
    ] { const fill = this.commonService.getNodeFillStyle(node); return [fill.color, fill.alpha]; }
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
        alphaValue = this.commonService.temp.style.linkAlphaMap(linkColorValue);

        if (this.overideTransparency || this.widgets['link-opacity-override-enabled'] === true) {
            // Keep the established Cytoscape contract: despite the historical
            // "Transparency" label, this slider value is the rendered alpha.
            alphaValue = Number(this.widgets['link-opacity']);
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
    getNodeLabel(node: any): string { const field = this.widgets['node-label-variable']; return field === 'None' ? '' : String(node[field] ?? ''); }
    private formatLinkDistanceForDisplay(value: any, decimalLength?: number): string {
        const numericValue = Number(value);
        if (!Number.isFinite(numericValue)) {
            return `${value ?? ''}`;
        }
        if (String(this.widgets['default-distance-metric'] || '').toLowerCase() === 'snps') {
            return `${Math.round(numericValue)}`;
        }
        const usePercentageDisplay = String(this.widgets['default-distance-metric'] || '').toLowerCase() === 'tn93'
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
        }
        else {
            // console.log('link variable2: ',this.commonService.session.data.links[index]);
            if (labelVariable == 'source_id') {
                return { text: link['source'] };
            }
            else if (labelVariable == 'source_index') {
                return { text: link['source'] }; // currently doesn't work; previous link.source and link.target were object now they are just a string of the id
                //return link['source']['index']
            }
            else if (labelVariable == 'target_id') {
                return { text: link['target'] };
            }
            else if (labelVariable == 'target_index') { // currently doesn't work; previous link.source and link.target were object now they are just a string of the id
                return { text: link['target'] };
                //return link['target']['index']
            }
            else if (labelVariable == 'label') {
                const labelValue = this.getRawLinkLabel(link);
                return { text: labelValue === undefined || labelValue === null ? '' : `${labelValue}` };
            }
            else if (labelVariable != 'distance') {
                return { text: `${link[labelVariable]}` || '' };
            }
            if (this.debugMode) {
                console.log('cluster link: ', link);
            }
            const labelValue = link[labelVariable];
            // check if link has a distance origin and if the distance origin is included in the link.origin array, if not then the label should be 0
            if (link.distanceOrigin && !link.origin.includes(link.distanceOrigin)) {
                return { text: '' };
            }
            else if (!link.hasDistance) {
                return { text: '' };
            }
            if (typeof labelValue === 'number' || !isNaN(parseFloat(labelValue))) {
                if (String(this.widgets['default-distance-metric'] || '').toLowerCase() === 'snps') {
                    return { text: this.formatLinkDistanceForDisplay(labelValue) };
                }
                else {
                    return (labelValue != 0)
                        ? { text: this.formatLinkDistanceForDisplay(labelValue, this.widgets['link-label-decimal-length']) }
                        : { text: '' };
                }
            }
            else {
                return { text: labelValue };
            }
        }
    }
    private getRawLinkLabel(link: any): any {
        return link?.mtRawLinkLabel ?? link?.label;
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
    public onNodeRadiusVariableChange(value: string): void { this.widgets['node-radius-variable'] = value; this.SelectedNodeRadiusVariable = value; this.updateMinMaxNode(); this.updateNodeSizes(); }
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
        this.updateMinMaxNode();
        this.updateNodeBorders(); // Update border widths without rerendering the entire network
    }
    /**
     * Updates node-radius widget and redraws nodes
     */
    public onNodeRadiusChange(e) {
        const key = 'transmission-chain-node-radius';
        this.widgets[key] = this.SelectedNodeRadiusSizeVariable;
        this.updateNodeSizes(); // Update node sizes without rerendering the entire network
    }
    private getGraphLayoutKey(graph: { nodes: any[]; links: any[] }): string {
        const dateField = this.getNetworkTimelineDateField();
        const nodes = graph.nodes.map(node => [
            this.getNodeId(node),
            this.getTimelineLayoutTimestamp(node, dateField),
            this.getTransmissionChainYAxisValue(node),
            this.getTransmissionChainDisplayClusterValue(node)
        ]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
        const links = graph.links.map(link => [
            String(link.id ?? link.index ?? ''),
            this.getLinkEndpointId(link.source),
            this.getLinkEndpointId(link.target)
        ]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
        return JSON.stringify({ dateField, yAxisField: this.getTransmissionChainYAxisField(), nodes, links });
    }
    private async _rerender(recalculateLayout = false): Promise<void> {
        if (this.isDestroyed || !this.cyContainer?.nativeElement)
            return;
        if (!this.viewActive) {
            this.rerenderOnActive = true;
            return;
        }
        if (this.rendering) {
            this.renderQueued = true;
            this.recalculateQueuedLayout = this.recalculateQueuedLayout || recalculateLayout;
            return;
        }
        this.rendering = true;
        try {
            this.loadSettings();
            this.syncNetworkContainerBounds();
            let graph = this.getVisibleNetworkDataForRender();
            this.normalizeNetworkDataForCytoscape(graph, false);
            graph.nodes.forEach(node => node.nodeSize = Number(this.getNodeSize(node)));
            const layoutDateField = this.getNetworkTimelineDateField();
            const graphKey = this.getGraphLayoutKey(graph);
            const layoutChanged = recalculateLayout || !this.cy || graphKey !== this.renderedGraphKey;
            if (layoutChanged) {
                graph = await this.precomputeTimelinePositionsWithD3(graph.nodes, graph.links);
            }
            else {
                // Tab activation and duplicate notifications can refresh an
                // unchanged graph. Keep its own layout and restored camera.
                graph.nodes.forEach(node => {
                    const rendered = this.cy.getElementById(this.getNodeId(node));
                    const position = rendered.position();
                    Object.assign(node, {
                        x: position.x,
                        y: position.y,
                        timelineX: rendered.data('timelineX')
                    });
                });
            }
            if (this.isDestroyed)
                return;
            this.data = graph;
            this.cacheNodeDataById(graph.nodes);
            const elements = this.mapDataToCytoscapeElements(graph);
            if (!this.cy) {
                const factory = await this.loadCytoscapeRenderer();
                if (this.isDestroyed)
                    return;
                this.cy = factory({ container: this.cyContainer.nativeElement, elements: [...elements.nodes, ...elements.edges], style: this.getCytoscapeStyles(), layout: { name: 'preset', fit: false }, minZoom: 0.01, maxZoom: 10, wheelSensitivity: 0.2, boxSelectionEnabled: true });
                this.attachCytoscapeEvents();
                this.cy.on('pan zoom', () => this.scheduleRendererViewStatePersistence());
            }
            else {
                this.cy.batch(() => { this.cy.elements().remove(); this.cy.add([...elements.nodes, ...elements.edges]); });
                this.cy.style(this.getCytoscapeStyles()).update();
            }
            this.scaleLinkWidth();
            this.updateArrowStyles();
            this.syncSelectionFromSession();
            this.applyTimelineNodePositionConstraints();
            this.cy.resize();
            this.cy.nodes().forEach(node => { this.nodePositions.set(node.id(), { ...node.position() }); });
            this.widgets.positions = Object.fromEntries(this.nodePositions);
            this.renderedGraphKey = graphKey;
            this.recordTimelineViewportArea();
            if (this.transmissionChainDateFieldToCenter === layoutDateField
                && layoutDateField === this.getNetworkTimelineDateField()
                && this.cy.nodes().length) {
                // Apply the same arrangement as Center Screen after the new
                // date layout is installed, including when a render was queued.
                this.transmissionChainDateFieldToCenter = null;
                this.openCenter();
                this.transmissionChainInitialAutoFitPending = false;
            }
            else if (this.transmissionChainInitialAutoFitPending) {
                if (!this.restoreRendererViewState())
                    this.fit();
                if (this.cy.nodes().length)
                    this.transmissionChainInitialAutoFitPending = false;
            }
            else if (layoutChanged) {
                // Rebuilding the graph changes its model bounds. Fit only
                // after the new nodes, chains and category bands are installed.
                this.openCenter();
            }
            this.scheduleTimelineAxisOverlayUpdate();
            this.openTransmissionChainInitialSettingsIfNeeded();
            this.cdref.markForCheck();
        }
        finally {
            this.rendering = false;
            if (this.renderQueued && !this.isDestroyed) {
                this.renderQueued = false;
                const recalculate = this.recalculateQueuedLayout;
                this.recalculateQueuedLayout = false;
                void this._rerender(recalculate);
            }
            else {
                this.fitTimelineAfterViewportResize();
            }
        }
    }
    public getNodeShape(node: any): string { return resolveNodeShapeForNode(node, this.commonService.session.style.widgets, this.commonService.session.style, this.commonService.temp.style.nodeSymbolMap); }
    /**
     * Updates link-tooltip-variable and SelectedLinkTooltipVariable to update what tooltip displays for links
     */
    onLinkTooltipVariableChange(e) {
        if (!Array.isArray(e)) {
            e = [e];
        }
        e = e.filter(item => item !== 'None');
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
        if (!this.cy)
            return;
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
        this.updateLinkLabels();
    }
    /**
     * Updates link-opacity widget and the opacity for all links
     */
    onLinkOpacityChange(e, enableOverride: boolean = true) {
        this.widgets['link-opacity'] = e;
        if (enableOverride) {
            this.widgets['link-opacity-override-enabled'] = true;
        }
        this.overideTransparency = enableOverride;
        this.updateLinkColor();
        this.overideTransparency = false;
    }
    private updateLinkWidthRows(_value: string): void { this.SelectedLinkWidthMax = this.widgets['link-width-max']; this.SelectedLinkWidthMin = this.widgets['link-width-min']; }
    /**
     * Updates link-width-variable widget and updates link width; Also cause min, max and reciprocal link width row to appear/disappear
     */
    onLinkWidthVariableChange(e) {
        this.updateLinkWidthRows(e);
        this.widgets['link-width-variable'] = e;
        if (e === 'None') {
            this.scaleLinkWidth();
            return;
        }
        this.onLinkWidthReciprocalNonReciprocalChange(this.getSelectedLinkReciprocalType());
    }
    private getSelectedLinkReciprocalType(): string { return this.widgets['link-width-reciprocal'] ? 'Reciprocal' : 'Non-Reciprocal'; }
    /**
     * Recalculates the size scale from the nodes allowed by ordinary filters.
     */
    updateMinMaxNode(): void {
        const field = this.widgets['node-radius-variable'];
        const values = this.commonService.getVisibleNodesIgnoringTimeline()
            .map(node => Number(node[field])).filter(Number.isFinite);
        const [minimum = 0, maximum = 1] = d3.extent(values);
        this.nodeScale = d3.scaleLinear().domain([minimum, maximum])
            .range([Number(this.widgets['node-radius-min']), Number(this.widgets['node-radius-max'])]).clamp(true);
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
        const key = 'transmission-chain-link-width';
        this.widgets[key] = e;
        this.scaleLinkWidth();
    }
    /**
     * Updates link-width-max widget and link width
     */
    onLinkWidthMaxChange(e) {
        this.widgets['link-width-max'] = e;
        this.scaleLinkWidth();
    }
    /**
     * Updates link-width-min widget and link width
     */
    onLinkWidthMinChange(e) {
        this.widgets['link-width-min'] = e;
        this.scaleLinkWidth();
    }
    /**
    * Applies arrow styling to edges based on:
    * - Global arrow toggle (widgets['link-directed'])
    * - Per-edge directionality (edge.data().directed)
    * - Optional bidirectional toggle + per-edge flag (widgets['link-bidirectional'] + edge.data().bidirectional)
    */
    private updateArrowStyles(): void {
        if (!this.cy)
            return;
        const isTruthy = (v: any): boolean => {
            if (v === true)
                return true;
            if (v === false || v === null || v === undefined)
                return false;
            if (typeof v === 'number')
                return v !== 0;
            if (typeof v === 'string') {
                const s = v.trim().toLowerCase();
                return s === 'true' || s === '1' || s === 'yes' || s === 'y';
            }
            return false;
        };
        const shouldShowDirected = (data: any): boolean => {
            if (!this.widgets['link-directed'])
                return false;
            return isTruthy(data?.directed);
        };
        const shouldShowSource = (data: any): boolean => {
            if (!shouldShowDirected(data))
                return false;
            if (!this.widgets['link-bidirectional'])
                return false;
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
            ...this.getTimelineAwareEdgeRoutingStyle()
        })
            .update();
    }
    /**
     * Updates link-directed widget. When directed, links have an arrow added; when undirected, links have no arrow
     */
    onLinkDirectedUndirectedChange(e: string) {
        this.SelectedLinkArrowTypeVariable = e;
        this.widgets['link-directed'] = e === "Show";
        this.updateArrowStyles();
    }
    onLinkBidirectionalChange(e: string) {
        this.SelectedLinkBidirectionalTypeVariable = e;
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
        if (!this.widgets['node-highlight']) {
            this.setCytoscapeNodeHover(null);
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
        const vlinks = this.commonService.getVisibleLinksIgnoringTimeline(true).filter(link => {
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
    onNetworkTimelineDateFieldChange(e: string): void {
        this.widgets['transmission-chain-date-field'] = e || 'None';
        this.SelectedNetworkTimelineDateFieldVariable = this.widgets['transmission-chain-date-field'];
        this.transmissionChainDateFieldToCenter = this.isTimelineLayoutActive()
            ? this.getNetworkTimelineDateField()
            : null;
        if (!this.isTimelineLayoutActive()) {
            this.clearTimelineLayoutMetadata();
        }
        this.updateEdgeRoutingStyles();
        this.updateLayout();
    }
    onTransmissionChainAxisLabelSizeChange(value: number): void {
        const size = Number(value);
        this.widgets['transmission-chain-axis-label-size'] = Number.isFinite(size)
            ? Math.min(TRANSMISSION_CHAIN_MAX_AXIS_LABEL_SIZE, Math.max(10, size))
            : 14;
        this.redrawTimelineAxisForResize();
    }
    onTransmissionChainYAxisFieldChange(field: string): void {
        const nextField = String(field || 'None');
        this.widgets['transmission-chain-y-axis-field'] = nextField;
        this.SelectedTransmissionChainYAxisFieldVariable = nextField;
        if (this.isTimelineLayoutActive()) {
            void this.updateLayout().then(() => {
                if (!this.isDestroyed
                    && this.isTimelineLayoutActive()
                    && this.getTransmissionChainYAxisField() === nextField) {
                    this.fit();
                }
            });
        }
    }
    private getStableFanoutSign(id: string): number {
        let hash = 0;
        for (let index = 0; index < id.length; index++) {
            hash = ((hash << 5) - hash) + id.charCodeAt(index);
            hash |= 0;
        }
        return hash % 2 === 0 ? 1 : -1;
    }
    private getTransmissionChainCurveDistance(index: number, total: number, id: string): number {
        const baseDistance = total <= 1 ? 12 : 16;
        const stepDistance = total <= 3 ? 18 : 14;
        const centeredIndex = index - ((total - 1) / 2);
        if (Math.abs(centeredIndex) < 0.001) {
            return this.getStableFanoutSign(id) * baseDistance;
        }
        const distance = Math.sign(centeredIndex) * (baseDistance + (Math.abs(centeredIndex) * stepDistance));
        return Math.max(-96, Math.min(96, distance));
    }
    private getTransmissionChainTaxiTurn(_index: number, _total: number): string {
        return '0px';
    }
    private getTransmissionChainEdgeCurveData(links: any[], nodes: any[]): Map<string, {
        distance: number;
        weight: number;
        fanoutGroupSize: number;
        taxiTurn: string;
    }> {
        const edgeCurveData = new Map<string, {
            distance: number;
            weight: number;
            fanoutGroupSize: number;
            taxiTurn: string;
        }>();
        if (!this.isTimelineLayoutActive()) {
            return edgeCurveData;
        }
        const lineStyle = this.getTransmissionChainLineStyle();
        const nodePositionById = new Map<string, {
            x: number;
            y: number;
        }>();
        nodes.forEach(node => {
            nodePositionById.set(this.getNodeId(node), {
                x: Number(node.x) || 0,
                y: Number(node.y) || 0
            });
        });
        const entries = links.map((link, index) => {
            const source = this.getLinkEndpointId(link.source);
            const target = this.getLinkEndpointId(link.target);
            const id = String(link.id ?? `${source}-${target}-${index}`);
            const pairKey = [source, target].sort().join('|');
            return { link, id, source, target, pairKey };
        });
        const endpointGroups = new Map<string, typeof entries>();
        const pairGroups = new Map<string, typeof entries>();
        entries.forEach(entry => {
            endpointGroups.set(entry.source, [...(endpointGroups.get(entry.source) || []), entry]);
            endpointGroups.set(entry.target, [...(endpointGroups.get(entry.target) || []), entry]);
            pairGroups.set(entry.pairKey, [...(pairGroups.get(entry.pairKey) || []), entry]);
        });
        const setRoutingData = (entry: typeof entries[number], updates: Partial<{
            distance: number;
            weight: number;
            fanoutGroupSize: number;
            taxiTurn: string;
        }>): void => {
            const existing = edgeCurveData.get(entry.id) || {
                distance: 0,
                weight: 0.5,
                fanoutGroupSize: 1,
                taxiTurn: '0px'
            };
            edgeCurveData.set(entry.id, { ...existing, ...updates });
        };
        const taxiGroups = new Map<string, typeof entries>();
        entries.forEach(entry => {
            const sourceGroup = endpointGroups.get(entry.source) || [];
            const targetGroup = endpointGroups.get(entry.target) || [];
            const groupKey = sourceGroup.length >= targetGroup.length
                ? `source:${entry.source}`
                : `target:${entry.target}`;
            taxiGroups.set(groupKey, [...(taxiGroups.get(groupKey) || []), entry]);
        });
        taxiGroups.forEach(groupEntries => {
            const sortedEntries = [...groupEntries].sort((a, b) => {
                const aSource = nodePositionById.get(a.source) || { x: 0, y: 0 };
                const aTarget = nodePositionById.get(a.target) || { x: 0, y: 0 };
                const bSource = nodePositionById.get(b.source) || { x: 0, y: 0 };
                const bTarget = nodePositionById.get(b.target) || { x: 0, y: 0 };
                const yDiff = ((aSource.y + aTarget.y) / 2) - ((bSource.y + bTarget.y) / 2);
                if (Math.abs(yDiff) > 0.001)
                    return yDiff;
                const aSpan = Math.abs(aTarget.x - aSource.x);
                const bSpan = Math.abs(bTarget.x - bSource.x);
                if (Math.abs(aSpan - bSpan) > 0.001)
                    return bSpan - aSpan;
                return a.id.localeCompare(b.id);
            });
            sortedEntries.forEach((entry, index) => {
                setRoutingData(entry, {
                    taxiTurn: this.getTransmissionChainTaxiTurn(index, sortedEntries.length)
                });
            });
        });
        if (lineStyle === 'Curved') {
            entries.forEach(entry => {
                setRoutingData(entry, {
                    distance: 24,
                    weight: 0.5,
                    fanoutGroupSize: 1
                });
            });
            return edgeCurveData;
        }
        if (lineStyle !== 'Fanout') {
            return edgeCurveData;
        }
        const fanoutGroups = new Map<string, {
            entries: typeof entries;
            weight: number;
            endpointId?: string;
        }>();
        entries.forEach(entry => {
            const pairGroup = pairGroups.get(entry.pairKey) || [];
            const sourceGroup = endpointGroups.get(entry.source) || [];
            const targetGroup = endpointGroups.get(entry.target) || [];
            if (pairGroup.length > 1) {
                fanoutGroups.set(`pair:${entry.pairKey}`, {
                    entries: pairGroup,
                    weight: 0.5
                });
                return;
            }
            if (sourceGroup.length >= targetGroup.length) {
                fanoutGroups.set(`source:${entry.source}`, {
                    entries: sourceGroup,
                    weight: 0.35,
                    endpointId: entry.source
                });
                return;
            }
            fanoutGroups.set(`target:${entry.target}`, {
                entries: targetGroup,
                weight: 0.65,
                endpointId: entry.target
            });
        });
        fanoutGroups.forEach(group => {
            const sortedEntries = [...group.entries].sort((a, b) => {
                if (group.endpointId) {
                    const aOtherId = a.source === group.endpointId ? a.target : a.source;
                    const bOtherId = b.source === group.endpointId ? b.target : b.source;
                    const aOther = nodePositionById.get(aOtherId) || { x: 0, y: 0 };
                    const bOther = nodePositionById.get(bOtherId) || { x: 0, y: 0 };
                    const xDiff = aOther.x - bOther.x;
                    if (Math.abs(xDiff) > 0.001)
                        return xDiff;
                    const yDiff = aOther.y - bOther.y;
                    if (Math.abs(yDiff) > 0.001)
                        return yDiff;
                }
                return a.id.localeCompare(b.id);
            });
            sortedEntries.forEach((entry, index) => {
                const existing = edgeCurveData.get(entry.id);
                if (existing?.fanoutGroupSize && existing.fanoutGroupSize > 1) {
                    return;
                }
                setRoutingData(entry, {
                    distance: this.getTransmissionChainCurveDistance(index, sortedEntries.length, entry.id),
                    weight: group.weight,
                    fanoutGroupSize: sortedEntries.length
                });
            });
        });
        return edgeCurveData;
    }
    onTransmissionChainLineStyleChange(style: TransmissionChainLineStyle): void {
        const nextStyle = this.isTransmissionChainLineStyle(style) ? style : 'Stepped';
        this.widgets['transmission-chain-line-style'] = nextStyle;
        this.SelectedTransmissionChainLineStyleVariable = nextStyle;
        this.updateEdgeRoutingStyles();
        if (this.isTimelineLayoutActive()) {
            void this.updateLayout().then(() => this.refreshRenderedSizeStyles());
        }
    }
    onTransmissionChainLinkOriginsChange(origins: string[]): void {
        this.widgets['transmission-chain-link-origins'] = Array.isArray(origins)
            ? origins.map(origin => String(origin || '').trim()).filter(origin => origin.length > 0)
            : [];
        this.SelectedTransmissionChainLinkOriginVariables = [
            ...(this.widgets['transmission-chain-link-origins'] || [])
        ];
        this.updateLayout();
    }
    isTransmissionChainLinkOriginSelected(origin: string): boolean {
        return this.SelectedTransmissionChainLinkOriginVariables.includes(String(origin || '').trim());
    }
    onTransmissionChainLinkOriginCheckboxChange(origin: string, event: Event): void {
        const normalizedOrigin = String(origin || '').trim();
        const checked = Boolean((event.target as HTMLInputElement)?.checked);
        const selectedOrigins = new Set(this.SelectedTransmissionChainLinkOriginVariables);
        if (checked && normalizedOrigin) {
            selectedOrigins.add(normalizedOrigin);
        }
        else {
            selectedOrigins.delete(normalizedOrigin);
        }
        this.onTransmissionChainLinkOriginsChange([...selectedOrigins]);
    }
    selectAllTransmissionChainLinkOrigins(): void {
        this.onTransmissionChainLinkOriginsChange(this.TransmissionChainLinkOriginOptions.map(option => String(option.value || '').trim()).filter(Boolean));
    }
    clearTransmissionChainLinkOrigins(): void {
        this.onTransmissionChainLinkOriginsChange([]);
    }
    getTransmissionChainLinkOriginSelectionSummary(): string {
        const selectedCount = this.SelectedTransmissionChainLinkOriginVariables.length;
        const totalCount = this.TransmissionChainLinkOriginOptions.length;
        if (totalCount === 0) {
            return 'No link lists';
        }
        return `${selectedCount} of ${totalCount} selected`;
    }
    updateNodeColors(): void {
        if (this.isDestroyed) return;
        if (!this.cy || this.rendering) {
            this.onLoadNewData();
            return;
        }
        const global = this.commonService.session.style.widgets;
        for (const key of ['node-color', 'node-color-variable', 'node-mixed-colors-enabled']) {
            this.widgets[key] = global[key];
        }
        // A color change must preserve the current layout, camera and dragging.
        this.cy.batch(() => this.cy.nodes(':childless').forEach(node => {
            const fullNode = this.getFullNodeDataForCyNode(node);
            const [color, opacity] = this.getNodeColor(fullNode);
            const shapeKey = node.data('shapeKey') || this.getNodeShape(fullNode);
            node.data('nodeColor', color);
            node.data('bgOpacity', opacity);
            this.setMixedColorNodeImageData(node, fullNode, shapeKey, color, opacity, this.mapNodeSize(Number(node.data('nodeSize'))));
            const customShape = getCustomNodeShapeData(shapeKey, color);
            if (customShape.iconBackgroundImage) node.data('iconBackgroundImage', customShape.iconBackgroundImage);
        }));
        this.cy.style().update();
        this.updateRendererAccessibleFeatures();
        this.cdref.markForCheck();
    }
    /**
     * Updates the width of the links using link-width, link-width-variable, link-width-max, link-width-min, and link-width-reciprocal
     */
    /**
    * Scales link widths based on the selected variable and updates Cytoscape styles.
    */
    scaleLinkWidth() {
        const variable = this.widgets['link-width-variable'];
        if (!this.cy)
            return;
        if (variable === 'None') {
            const width = this.getConfiguredLinkWidth();
            this.cy.edges().forEach(edge => {
                edge.data('width', width);
            });
            // Apply a default width to all links
            this.cy.style().selector('edge').style({
                'width': (edge: cytoscape.EdgeSingular) => this.getRenderedLinkWidth(edge)
            }).update();
            return;
        }
        const scaleValues = this.calculateLinkWidthScale();
        if (!scaleValues) {
            const width = this.getConfiguredLinkWidth();
            this.cy.edges().forEach(edge => {
                edge.data('width', width);
            });
            // If scaling isn't applicable, set a default width
            this.cy.style().selector('edge').style({
                'width': (edge: cytoscape.EdgeSingular) => this.getRenderedLinkWidth(edge)
            }).update();
            return;
        }
        const { min, max } = scaleValues;

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
            }
            else {
                // Handle non-numeric values if necessary
                edge.data('width', minWidth);
            }
        });
        // Update Cytoscape stylesheet to use the scaledWidth data
        this.cy.style().selector('edge').style({
            'width': (edge: cytoscape.EdgeSingular) => this.getRenderedLinkWidth(edge)
        }).update();
    }
    private resizeActiveRenderer(): void { this.redrawTimelineAxisForResize(); }
    private getVisibleTimelineLeafNodes(): any {
        return this.cy.nodes(':visible').filter(node => (!node.hasClass('hidden')
            && !node.hasClass('parent')
            && node.children().length === 0));
    }
    private getTimelineViewportArea(): TimelineViewportArea | null {
        const { width, height, screenTop } = this.getTimelineAxisOverlayFrame();
        if (!width || !height) {
            return null;
        }
        const hasCategoricalYAxis = this.timelineLayoutMetadata.yAxisField !== 'None'
            && this.timelineLayoutMetadata.yAxisGroups.length > 0;
        const toolbar = this.toolBtnContainer?.nativeElement as HTMLElement | undefined;
        const toolbarElements = toolbar ? [toolbar, ...Array.from(toolbar.querySelectorAll<HTMLElement>('.btn-icon'))] : [];
        const toolbarBottom = Math.max(0, ...toolbarElements.map(element => {
            const rect = this.getRect(element);
            return rect ? Math.ceil(rect.bottom - screenTop + TIMELINE_TOOLBAR_GAP) : 0;
        }));
        const top = Math.max(TIMELINE_VIEWPORT_PADDING.top, toolbarBottom);
        const left = hasCategoricalYAxis
            ? this.getTimelineYAxisLabelX() + this.getTimelineYAxisLabelWidth(width) + 12
            : Math.max(TIMELINE_VIEWPORT_PADDING.left, this.getTimelineAxisLabelSize() + 20);
        const bottom = this.getTimelineAxisBottomOffset() + TIMELINE_AXIS_GRID_GAP + TIMELINE_NODE_AXIS_GAP;
        const availableWidth = width - left - TIMELINE_VIEWPORT_PADDING.right;
        const availableHeight = height - top - bottom;
        if (availableWidth <= 0 || availableHeight <= 0) {
            return null;
        }
        return {
            left,
            top,
            width: availableWidth,
            height: availableHeight
        };
    }
    private getTimelineViewportTransform(nodeBounds: ExplorerViewportBounds, minimumZoom: number = this.cy.minZoom(), maximumZoom: number = this.cy.maxZoom()): {
        zoom: number;
        pan: {
            x: number;
            y: number;
        };
    } | null {
        const viewportArea = this.getTimelineViewportArea();
        if (!viewportArea) {
            return null;
        }
        const boundsWidth = nodeBounds.x2 - nodeBounds.x1;
        const boundsHeight = nodeBounds.y2 - nodeBounds.y1;
        if (![nodeBounds.x1, nodeBounds.y1, nodeBounds.x2, nodeBounds.y2, boundsWidth, boundsHeight]
            .every(value => Number.isFinite(value))
            || boundsWidth <= 0
            || boundsHeight <= 0) {
            return null;
        }
        const fitWidth = viewportArea.width * TRANSMISSION_CHAIN_TARGET_WIDTH_FRACTION;
        const zoom = Math.min(maximumZoom, Math.max(minimumZoom, Math.min(fitWidth / boundsWidth, viewportArea.height / boundsHeight)));
        const renderedWidth = boundsWidth * zoom;
        const renderedHeight = boundsHeight * zoom;
        return {
            zoom,
            pan: {
                x: viewportArea.left
                    + ((viewportArea.width - renderedWidth) / 2)
                    - (nodeBounds.x1 * zoom),
                y: viewportArea.top
                    + ((viewportArea.height - renderedHeight) / 2)
                    - (nodeBounds.y1 * zoom)
            }
        };
    }
    private getTimelineNodeBounds(visibleLeafNodes: any): ExplorerViewportBounds {
        const visibleNodeBounds = visibleLeafNodes.boundingBox({ includeLabels: false, includeOverlays: false });
        return this.expandTimelineBoundsForCategoricalYAxis(visibleNodeBounds);
    }
    private expandTimelineBoundsForCategoricalYAxis(bounds: ExplorerViewportBounds): ExplorerViewportBounds {
        const hasCategoricalYAxis = this.timelineLayoutMetadata.yAxisField !== 'None'
            && this.timelineLayoutMetadata.yAxisGroups.length > 0;
        const yAxisGroups = this.timelineLayoutMetadata.yAxisGroups;
        return {
            x1: bounds.x1,
            y1: hasCategoricalYAxis
                ? Math.min(bounds.y1, yAxisGroups[0].boundaryMinY)
                : bounds.y1,
            x2: bounds.x2,
            y2: hasCategoricalYAxis
                ? Math.max(bounds.y2, yAxisGroups[yAxisGroups.length - 1].boundaryMaxY)
                : bounds.y2
        };
    }
    private getVisibleTimelinePlotElements(): any {
        return this.cy.elements(':visible').filter(element => !element.hasClass('hidden'));
    }
    private getCompleteTimelinePlotBounds(): ExplorerViewportBounds | null {
        const visiblePlotElements = this.getVisibleTimelinePlotElements();
        if (visiblePlotElements.empty()) {
            return null;
        }
        return this.expandTimelineBoundsForCategoricalYAxis(visiblePlotElements.boundingBox({ includeLabels: true, includeOverlays: false }));
    }
    private scaleTimelineYAxisGroups(centerY: number, scale: number): void {
        if (this.timelineLayoutMetadata.yAxisGroups.length === 0) {
            return;
        }
        const scaleY = (value: number): number => centerY + ((value - centerY) * scale);
        this.timelineLayoutMetadata = {
            ...this.timelineLayoutMetadata,
            yAxisGroups: this.timelineLayoutMetadata.yAxisGroups.map(group => ({
                ...group,
                minY: scaleY(group.minY),
                maxY: scaleY(group.maxY),
                centerY: scaleY(group.centerY),
                boundaryMinY: scaleY(group.boundaryMinY),
                boundaryMaxY: scaleY(group.boundaryMaxY)
            }))
        };
    }
    private getMinimumTransmissionChainCompactionScale(nodes: cytoscape.NodeCollection): number {
        const nodeIds = new Set(nodes.map(node => node.id()));
        const links = this.cy.edges(':visible')
            .map(edge => ({ source: edge.source().id(), target: edge.target().id() }))
            .filter(link => nodeIds.has(link.source) && nodeIds.has(link.target));
        const componentKeys = this.getTransmissionChainConnectedComponentKeys(nodes.map(node => node.data()), links);
        const bands = new Map<string, { minY: number; maxY: number; halfHeight: number }>();
        nodes.forEach(node => {
            const componentKey = componentKeys.get(node.id());
            const key = JSON.stringify([this.getTransmissionChainClusterKey(node.data(), componentKey), componentKey]);
            const y = node.position('y');
            const halfHeight = node.outerHeight() / 2;
            const band = bands.get(key) || { minY: y, maxY: y, halfHeight };
            band.minY = Math.min(band.minY, y);
            band.maxY = Math.max(band.maxY, y);
            band.halfHeight = Math.max(band.halfHeight, halfHeight);
            bands.set(key, band);
        });
        const orderedBands = Array.from(bands.values()).sort((a, b) => a.minY - b.minY);
        const minimumGroupGap = 8;
        let minimumScale = 0;
        for (let index = 1; index < orderedBands.length; index++) {
            const previous = orderedBands[index - 1];
            const current = orderedBands[index];
            const centerGap = current.minY - previous.maxY;
            if (centerGap <= 0) return 1;
            // Only centers move during compaction; node bodies keep their size.
            minimumScale = Math.max(minimumScale, (previous.halfHeight + current.halfHeight + minimumGroupGap) / centerGap);
        }
        // Nodes within a chain can share the same date. Preserve their body
        // clearance as well as the separation between disconnected chains.
        const nodeBounds = nodes.map(node => ({
            x1: node.position('x') - (node.outerWidth() / 2),
            x2: node.position('x') + (node.outerWidth() / 2),
            y: node.position('y'),
            halfHeight: node.outerHeight() / 2
        })).sort((a, b) => a.x1 - b.x1);
        let activeBounds: typeof nodeBounds = [];
        for (const current of nodeBounds) {
            activeBounds = activeBounds.filter(previous => previous.x2 + minimumGroupGap >= current.x1);
            for (const previous of activeBounds) {
                const centerGap = Math.abs(current.y - previous.y);
                if (centerGap <= 0) return 1;
                minimumScale = Math.max(minimumScale, (previous.halfHeight + current.halfHeight + minimumGroupGap) / centerGap);
            }
            activeBounds.push(current);
        }
        return Math.min(1, minimumScale);
    }
    private adjustTransmissionChainVerticalSpacingToViewport(): boolean {
        if (!this.cy || !this.isTimelineLayoutActive() || this.widgets.pinned) {
            return false;
        }
        const viewportArea = this.getTimelineViewportArea();
        const visibleLeafNodes = this.getVisibleTimelineLeafNodes();
        if (!viewportArea || visibleLeafNodes.length < 2) {
            return false;
        }
        const yValues = visibleLeafNodes.map(node => node.position('y')) as number[];
        if (Math.max(...yValues) - Math.min(...yValues) <= 1e-6) return false;
        let adjusted = false;
        for (let attempt = 0; attempt < 4; attempt++) {
            const plotBounds = this.getCompleteTimelinePlotBounds();
            if (!plotBounds) {
                break;
            }
            const plotWidth = plotBounds.x2 - plotBounds.x1;
            const plotHeight = plotBounds.y2 - plotBounds.y1;
            const targetHeight = plotWidth * (viewportArea.height / (viewportArea.width * TRANSMISSION_CHAIN_TARGET_WIDTH_FRACTION));
            if (![plotWidth, plotHeight, targetHeight].every(value => Number.isFinite(value))
                || plotWidth <= 0
                || plotHeight <= 0
                || targetHeight <= 0
                || Math.abs(plotHeight - targetHeight) <= targetHeight * 0.01) {
                break;
            }
            const requestedScale = Math.min(20, targetHeight / plotHeight);
            const scale = Math.max(0.05, requestedScale < 1 ? this.getMinimumTransmissionChainCompactionScale(visibleLeafNodes) : 1, requestedScale);
            if (Math.abs(scale - 1) <= 1e-6) break;
            const centerY = (plotBounds.y1 + plotBounds.y2) / 2;
            this.applyingTimelinePositionLock = true;
            try {
                this.cy.batch(() => {
                    visibleLeafNodes.forEach(node => {
                        const position = node.position();
                        const adjustedPosition = {
                            x: position.x,
                            y: centerY + ((position.y - centerY) * scale)
                        };
                        node.position(adjustedPosition);
                        this.nodePositions.set(node.id(), adjustedPosition);
                    });
                });
            }
            finally {
                this.applyingTimelinePositionLock = false;
            }
            this.scaleTimelineYAxisGroups(centerY, scale);
            adjusted = true;
        }
        if (adjusted) {
            this.widgets.positions = Object.fromEntries(this.nodePositions);
            this.updateEdgeRoutingStyles();
        }
        return adjusted;
    }
    private setTransmissionChainTimelineRange(start: number, end: number): void {
        const metadata = this.timelineLayoutMetadata;
        const oldSpan = metadata.rangeEnd - metadata.rangeStart;
        const span = end - start;
        if (!this.cy || !Number.isFinite(span) || span <= 0 || oldSpan <= 0) return;
        const scaleX = (x: number): number => start + ((x - metadata.rangeStart) * span / oldSpan);
        this.applyingTimelinePositionLock = true;
        try {
            this.cy.batch(() => {
                this.getVisibleTimelineLeafNodes().forEach(node => {
                    const position = { x: scaleX(node.position('x')), y: node.position('y') };
                    node.data('timelineX', position.x);
                    node.position(position);
                    this.nodePositions.set(node.id(), position);
                });
            });
        }
        finally {
            this.applyingTimelinePositionLock = false;
        }
        this.timelineLayoutMetadata = {
            ...metadata,
            rangeStart: start,
            rangeEnd: end,
            ticks: metadata.ticks.map(tick => ({ ...tick, x: scaleX(tick.x) }))
        };
        this.widgets['transmission-chain-timeline-width'] = span;
        this.widgets.positions = Object.fromEntries(this.nodePositions);
    }
    private expandTransmissionChainTimelineToViewport(): void {
        if (!this.cy || !this.isTimelineLayoutActive() || this.widgets.pinned
            || this.timelineLayoutMetadata.singleDateDomain) return;
        const area = this.getTimelineViewportArea();
        const nodes = this.getVisibleTimelineLeafNodes();
        if (!area || nodes.length < 2) return;
        const xValues = nodes.map(node => node.position('x')) as number[];
        if (Math.max(...xValues) - Math.min(...xValues) <= 1e-6) return;
        // Stretch date positions while retaining the node sizes and the Y gaps
        // needed for separate chains. Dates, ticks and guides use the same scale.
        for (let attempt = 0; attempt < 6; attempt++) {
            const bounds = this.getCompleteTimelinePlotBounds();
            if (!bounds) return;
            const width = bounds.x2 - bounds.x1;
            const targetWidth = (bounds.y2 - bounds.y1) * area.width
                * TRANSMISSION_CHAIN_TARGET_WIDTH_FRACTION / area.height;
            if (!Number.isFinite(targetWidth) || width <= 0 || targetWidth <= width * 1.001) break;
            const scale = targetWidth / width;
            const metadata = this.timelineLayoutMetadata;
            const centerX = (metadata.rangeStart + metadata.rangeEnd) / 2;
            const halfSpan = (metadata.rangeEnd - metadata.rangeStart) * scale / 2;
            this.setTransmissionChainTimelineRange(centerX - halfSpan, centerX + halfSpan);
        }
    }
    private fitCompleteTimelinePlotWithinAxes(): boolean {
        if (!this.cy || !this.isTimelineLayoutActive() || !this.timelineLayoutMetadata.active) {
            return false;
        }
        this.expandTransmissionChainTimelineToViewport();
        const plotBounds = this.getCompleteTimelinePlotBounds();
        if (!plotBounds)
            return false;
        const transform = this.getTimelineViewportTransform(plotBounds);
        if (!transform) {
            return false;
        }
        this.cy.viewport(transform);
        return true;
    }
    private getLargestVisibleTransmissionChainComponent(visibleLeafNodes: any): any {
        const nodeIds = new Set<string>(visibleLeafNodes.map(node => node.id()));
        const visibleEdges = this.cy.edges(':visible').filter(edge => (!edge.hasClass('hidden')
            && nodeIds.has(edge.source().id())
            && nodeIds.has(edge.target().id())));
        const components = visibleLeafNodes
            .union(visibleEdges)
            .components()
            .sort((componentA, componentB) => {
            const sizeDifference = componentB.nodes().length - componentA.nodes().length;
            if (sizeDifference !== 0)
                return sizeDifference;
            const componentAKey = componentA.nodes().map(node => node.id()).sort().join('\u0000');
            const componentBKey = componentB.nodes().map(node => node.id()).sort().join('\u0000');
            return componentAKey.localeCompare(componentBKey);
        });
        return components[0]?.nodes() ?? this.cy.collection();
    }
    private fitTransmissionChainInitialAutoView(): boolean {
        if (!this.transmissionChainInitialAutoFitPending
            || !this.isTimelineLayoutActive()
            || !this.timelineLayoutMetadata.active) {
            return false;
        }
        const visibleLeafNodes = this.getVisibleTimelineLeafNodes();
        if (visibleLeafNodes.empty()) {
            return false;
        }
        const fullTransform = this.getTimelineViewportTransform(this.getTimelineNodeBounds(visibleLeafNodes));
        if (!fullTransform) {
            return false;
        }
        const configuredNodeDiameter = this.mapNodeSize(this.getConfiguredNodeSize());
        const minimumReadableZoom = Math.min(this.cy.maxZoom(), Math.max(this.cy.minZoom(), TRANSMISSION_CHAIN_MIN_INITIAL_RENDERED_NODE_SIZE / configuredNodeDiameter));
        if (fullTransform.zoom >= minimumReadableZoom) {
            this.cy.viewport(fullTransform);
            this.transmissionChainInitialAutoFitPending = false;
            return true;
        }
        const largestComponent = this.getLargestVisibleTransmissionChainComponent(visibleLeafNodes);
        if (largestComponent.empty()) {
            return false;
        }
        const componentBounds = largestComponent.boundingBox({ includeLabels: false, includeOverlays: false });
        const focusedTransform = this.getTimelineViewportTransform(componentBounds, minimumReadableZoom, Math.max(minimumReadableZoom, Math.min(1, this.cy.maxZoom())));
        if (!focusedTransform) {
            return false;
        }
        this.cy.viewport(focusedTransform);
        this.transmissionChainInitialAutoFitPending = false;
        return true;
    }
    fit(allowTransmissionChainInitialAutoFit: boolean = true) {
        if (this.cy) {
            this.syncNetworkContainerBounds();
            this.cy.resize();
            const usedInitialAutoFit = allowTransmissionChainInitialAutoFit
                && this.fitTransmissionChainInitialAutoView();
            if (!usedInitialAutoFit && !this.fitCompleteTimelinePlotWithinAxes()) {
                this.cy.fit(this.cy.nodes(), 30);
            }
            this.scheduleTimelineAxisOverlayUpdate();
        }
    }
    openSettings(): void { this.loadSettings(); this.settingsDialog.setVisibility(!this.settingsDialog.isVisible); this.updateLinkWidthRows(this.SelectedLinkWidthByVariable); }
    private openTransmissionChainInitialSettingsIfNeeded(): void {
        if (!this.transmissionChainInitialSettingsOpened &&
            this.getNetworkTimelineDateField() === 'None') {
            this.transmissionChainInitialSettingsOpened = true;
            this.settingsDialog.setVisibility(true);
        }
    }
    /**
     * On click of export button, show export dialog
     */
    openExport() {
        this.showExportDialog = true;
        this.updateCalculatedResolution();
    }
    /**
     * On click of center button, show centers the view
     */
    openCenter() {
        if (this.cy) {
            this.syncNetworkContainerBounds();
            this.cy.resize();
            this.lastTimelineViewportArea = this.getTimelineViewportArea();
            this.updateTimelinePlotClip(this.lastTimelineViewportArea);
            this.timelineViewportFitPending = false;
            // Start from the same date scale on each fit. Otherwise a previous
            // wide pane could make the next resize expand the Y spacing again.
            if (!this.widgets.pinned && this.transmissionChainBaseTimelineRange) {
                const { start, end } = this.transmissionChainBaseTimelineRange;
                this.setTransmissionChainTimelineRange(start, end);
            }
            this.adjustTransmissionChainVerticalSpacingToViewport();
            if (this.fitCompleteTimelinePlotWithinAxes()) {
                this.scheduleTimelineAxisOverlayUpdate();
                return;
            }
        }
        this.fit(false);
    }
    showExcludedTimelineNodes(): void {
        this.showExcludedTimelineNodesDialog = true;
    }
    onRecallSession(): void {
        this.nodePositions.clear();
        this.renderedGraphKey = null;
        this.transmissionChainInitialAutoFitPending = true;
        this.transmissionChainDateFieldToCenter = null;
        this.lastTimelineViewportArea = null;
        this.timelineViewportFitPending = false;
        this.onLoadNewData();
    }
    openRefreshScreen(): void { void this._rerender(true); }
    updateVisualization(): void { this.onFilterDataChange(); }
    applyStyleFileSettings(): void { this.onLoadNewData(); }
    ngOnDestroy(): void {
        this.isDestroyed = true;
        this.container.off('resize', this.handleContainerResize);
        this.container.off('hide', this.handleContainerHide);
        this.container.off('show', this.handleContainerShow);
        window.removeEventListener('resize', this.windowResizeHandler);
        this.destroy$.next();
        this.destroy$.complete();
        $(document).off('.transmissionChainExplorer');
        for (const timer of [this.containerResizeTimer, this.containerShowTimer, this.timelineAxisUpdateTimeout, this.rendererViewStateTimer])
            if (timer)
                clearTimeout(timer);
        this.timelineAxisResizeObserver?.disconnect();
        this.cy?.destroy();
        if (this.cyContainer?.nativeElement) $(this.cyContainer.nativeElement).off('.transmissionChainExplorer');
        this.cy = null;
        if (this.commonService.visuals.transmissionChain === this)
            this.commonService.visuals.transmissionChain = null;
        this.nodePositions.clear();
        this.nodeDataById.clear();
    }
    onLoadNewData(): void {
        if (this.isDestroyed)
            return;
        this.loadSettings();
        if (!this.viewActive) {
            this.rerenderOnActive = true;
            return;
        }
        void this._rerender();
    }
    onFilterDataChange(): void {
        if (this.viewActive)
            void this._rerender();
        else
            this.rerenderOnActive = true;
    }
    loadSettings(): void {
        const settings = getTransmissionChainSettings(this.commonService.session.style);
        if (this.widgets !== settings || this.nodePositions.size === 0) {
            this.nodePositions = new Map(Object.entries(settings.positions || {}));
        }
        this.widgets = settings;
        this.widgets['transmission-chain-axis-label-size'] = this.getTimelineAxisLabelSize();
        const global = this.commonService.session.style.widgets;
        // Data interpretation and explicitly global color/shape controls remain coordinated.
        for (const key of ['default-distance-metric', 'tn93-distance-display-format', 'link-sort-variable', 'link-threshold', 'selected-color', 'background-color', 'node-color', 'node-color-variable', 'node-mixed-colors-enabled', 'node-symbol', 'node-symbol-variable', 'link-color', 'link-color-variable'])
            this.widgets[key] = global[key];
        this.IsDataAvailable = this.commonService.session.data.nodes.length > 0;
        this.FieldList = [{ label: 'None', value: 'None' }, ...this.commonService.getStyleableNodeFields().map(value => ({ label: this.commonService.capitalize(value), value }))];
        this.ToolTipFieldList = [{ label: 'None', value: 'None' }, ...this.commonService.session.data.linkFields.map(value => ({ label: value, value: value === 'source' ? 'source_id' : value === 'target' ? 'target_id' : value }))];
        this.LinkToolTipList = this.ToolTipFieldList;
        this.SelectedNodeLabelVariable = this.widgets['node-label-variable'];
        this.SelectedNodeLabelSizeVariable = this.widgets['node-label-size'];
        this.SelectedNodeLabelOrientationVariable = this.widgets['node-label-orientation'];
        this.SelectedNodeTooltipVariable = this.widgets['node-tooltip-variable'];
        this.SelectedNodeRadiusVariable = this.widgets['node-radius-variable'];
        this.SelectedNodeRadiusSizeVariable = this.getConfiguredNodeSize();
        this.nodeBorderWidth = this.widgets['node-border-width'];
        this.SelectedLinkLabelVariable = this.widgets['link-label-variable'];
        this.SelectedLinkTooltipVariable = this.widgets['link-tooltip-variable'];
        this.SelectedLinkDecimalVariable = this.widgets['link-label-decimal-length'];
        this.SelectedLinkWidthByVariable = this.widgets['link-width-variable'];
        this.SelectedLinkWidthVariable = this.getConfiguredLinkWidth();
        this.SelectedNetworkExportFilenameVariable = this.widgets['network-export-filename'];
        this.SelectedNetworkExportFileTypeListVariable = this.widgets['network-export-filetype'];
        this.SelectedNetworkExportScaleVariable = this.widgets['network-export-scale'];
        this.SelectedNetworkExportQualityVariable = this.widgets['network-export-quality'];
        this.SelectedLinkReciprocalTypeVariable = this.widgets['link-width-reciprocal'] ? 'Reciprocal' : 'Non-Reciprocal';
        this.SelectedLinkTransparencyVariable = this.widgets['link-opacity'];
        this.SelectedLinkArrowTypeVariable = this.widgets['link-directed'] ? 'Show' : 'Hide';
        this.SelectedLinkBidirectionalTypeVariable = this.widgets['link-bidirectional'] ? 'Show' : 'Hide';
        this.SelectedNetworkNeighborTypeVariable = this.widgets['node-highlight'] ? 'Highlighted' : 'Normal';
        this.SelectedNetworkTimelineDateFieldVariable = this.widgets['transmission-chain-date-field'];
        this.SelectedTransmissionChainYAxisFieldVariable = this.widgets['transmission-chain-y-axis-field'];
        this.SelectedTransmissionChainLineStyleVariable = this.widgets['transmission-chain-line-style'];
        this.syncTransmissionChainLinkOriginOptions();
        this.updateMinMaxNode();
    }
    private isGroupNode(node: cytoscape.NodeSingular): boolean {
        return node.hasClass('parent') || node.data('isParent') === true || node.children().length > 0;
    }
    updateLinkColor(): void {
        if (this.isDestroyed) return;
        if (!this.cy || this.rendering) {
            this.onLoadNewData();
            return;
        }
        const global = this.commonService.session.style.widgets;
        for (const key of ['link-color', 'link-color-variable', 'selected-color']) this.widgets[key] = global[key];
        const edgeElements = this.mapLinksToCytoscapeElements({
            nodes: this.cy.nodes(':childless').map(node => ({ ...this.getFullNodeDataForCyNode(node), ...node.position() })),
            links: this.data?.links || []
        });
        // Origin coloring changes the number of colored edge segments. Replace
        // those segments without rebuilding node positions or the camera.
        this.cy.batch(() => {
            this.cy.edges().remove();
            this.cy.add(edgeElements);
        });
        this.scaleLinkWidth();
        this.updateArrowStyles();
        this.setCytoscapeNodeHover(this.selectedNodeId ? this.cy.getElementById(this.selectedNodeId) : null);
        this.cy.style().update();
        this.cdref.markForCheck();
    }
    /**
     * Updates the sizes of all nodes based on the current widget settings.
     */
    updateNodeSizes() {
        if (!this.cy)
            return;
        this.cy.nodes().forEach(node => {
            if (this.isGroupNode(node))
                return;
            const fullNode = this.getFullNodeDataForCyNode(node);
            const newSize = Number(this.getNodeSize(fullNode));
            node.data('nodeSize', newSize);
            const shapeKey = node.data('shapeKey') || this.getNodeShape(fullNode);
            this.setMixedColorNodeImageData(node, fullNode, shapeKey, node.data('nodeColor'), Number(node.data('bgOpacity')), this.mapNodeSize(newSize));
        });
        this.cy.style().update(); // Refresh Cytoscape styles to apply changes
    }
    /**
    * Updates the border widths of all nodes based on the current widget settings.
    */
    updateNodeBorders() {
        if (!this.cy)
            return;
        this.cy.nodes().forEach(node => {
            if (this.isGroupNode(node))
                return;
            const fullNode = this.getFullNodeDataForCyNode(node);
            const newBorderWidth = this.getNodeBorderWidth(fullNode);
            node.data('borderWidth', newBorderWidth);
            const shapeKey = node.data('shapeKey') || this.getNodeShape(fullNode);
            this.setMixedColorNodeImageData(node, fullNode, shapeKey, node.data('nodeColor'), Number(node.data('bgOpacity')), this.mapNodeSize(Number(node.data('nodeSize'))));
        });
        this.cy.style().update(); // Refresh Cytoscape styles to apply changes
    }
    /**
     * Updates the labels of all nodes based on the current widget settings.
     */
    updateNodeLabels() {
        if (!this.cy)
            return;
        this.cy.nodes().forEach(node => {
            if (this.isGroupNode(node))
                return;
            const newLabel = this.getNodeLabel(this.getFullNodeDataForCyNode(node));
            node.data('label', newLabel);
        });
        this.cy.style().update(); // Refresh Cytoscape styles to apply changes
    }
    /**
     * Updates the font sizes of all node labels based on the current widget settings.
     */
    updateNodeLabelSizes() {
        if (!this.cy)
            return;
        this.cy.nodes().forEach(node => {
            if (this.isGroupNode(node))
                return;
            const newFontSize = this.getNodeFontSize(this.getFullNodeDataForCyNode(node));
            node.data('fontSize', newFontSize);
        });
        this.cy.style().update(); // Refresh Cytoscape styles to apply changes
    }
    /**
     * Updates the font sizes of all edge labels based on the current widget settings.
     */
    updateLinkLabelSizes() {
        if (!this.cy)
            return;
        this.cy.edges().forEach(edge => {
            const newFontSize = this.getLinkFontSize(edge.data());
            edge.data('fontSize', newFontSize);
        });
        this.cy.style().update(); // Refresh Cytoscape styles to apply changes
    }
    /**
     * Retrieves the border width for a node based on current widget settings.
     * @param node The node data object.
     * @returns The border width.
     */
    getNodeBorderWidth(_node?: any): number { return Math.max(0, Number(this.widgets['node-border-width']) || 0); }
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
    override setVisibility(visible: boolean): void {
        super.setVisibility(visible);
        if (visible)
            this.handleContainerShow();
        else
            this.handleContainerHide();
    }
    private updateRendererAccessibleFeatures(): void {
        const nodes = this.cy?.nodes(':visible:childless');
        const field = this.commonService.session.style.widgets['node-color-variable'];
        const mixedNodes = (nodes?.map((node: cytoscape.NodeSingular) => {
            const fill = this.commonService.getNodeFillStyle(this.getFullNodeDataForCyNode(node));
            const features = applyNetworkNodeCompositionSegments(EMPTY_NETWORK_NODE_VISUAL_FEATURES, field, fill.segments);
            return { id: node.id(), description: features.accessibleLabel, selected: node.selected() };
        }) || []).filter(item => item.description);
        this.rendererAccessibleFeatureSummary = `${nodes?.length || 0} network nodes; ${mixedNodes.length} mixed-value nodes`;
        this.rendererAccessibleFeatureItems = mixedNodes.slice(0, 200);
    }
    private syncSelectionFromSession(): void {
        if (!this.cy)
            return;
        const selected = new Set(this.commonService.getVisibleNodesIgnoringTimeline().filter(node => node.selected).map(node => String(node._id ?? node.id)));
        this.cy.batch(() => this.cy.nodes().forEach(node => {
            if (selected.has(node.id()))
                node.select();
            else
                node.unselect();
        }));
        this.updateRendererAccessibleFeatures();
        this.cdref.markForCheck();
    }
    private rendering = false;
    private renderQueued = false;
    private recalculateQueuedLayout = false;
}
export namespace TransmissionChainExplorerComponent {
    export const componentTypeName = 'Transmission Chain Explorer';
}
