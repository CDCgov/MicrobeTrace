import { Injector, Component, Output, OnChanges, SimpleChange, EventEmitter, OnInit, NgZone, InjectionToken, ElementRef, ViewChild, ViewContainerRef, ViewChildren, QueryList, ChangeDetectorRef, Renderer2, Inject, OnDestroy } from '@angular/core';
import { EventManager } from '@angular/platform-browser';
import { AppComponentBase } from '@shared/common/app-component-base';
import { CommonService } from '../../contactTraceCommonServices/common.service';
import { saveAs } from 'file-saver';
import * as d3 from 'd3';
import * as domToImage from 'dom-to-image-more';
import * as L from 'leaflet';
// import * as moment from 'moment';
//import moment from 'moment';
import 'leaflet.markercluster';

import * as MarkerCluster from 'leaflet.markercluster';
import { SelectItem } from 'primeng/api';
import { Observable, takeUntil, Subject } from 'rxjs';
import { tileLayer, latLng, marker, icon, polyline, circle, polygon, Map, MapOptions, Layer, Marker, markerClusterGroup, MarkerClusterGroupOptions, MarkerClusterGroup, circleMarker, PathOptions, featureGroup, FeatureGroup, TileLayer, geoJSON } from 'leaflet';
import { DialogSettings } from '../../helperClasses/dialogSettings';
import { MicobeTraceNextPluginEvents } from '../../helperClasses/interfaces';
import { MicrobeTraceNextVisuals } from '../../microbe-trace-next-plugin-visuals';
//import { ColorIterator } from '../../helperClasses/colorIterator';
import * as _ from 'lodash';
import { BaseComponentDirective } from '@app/base-component.directive';
import { ComponentContainer } from 'golden-layout';
import { GoogleTagManagerService } from 'angular-google-tag-manager';
import { CommonStoreService } from '@app/contactTraceCommonServices/common-store.services';
import { ExportService, ExportOptions } from '@app/contactTraceCommonServices/export.service';
import { getMapNodeShapeDataUri, isCustomNodeShape as isCustomNodeIconShape, resolveNodeShapeForNode, resolveNodeShapeKey } from '@app/contactTraceCommonServices/node-shapes';

declare var google: any;


/**
 * @title Complex Example
 */

interface LongLatInterface {
    Longitude: any;
    Latitude: any;
}

class LongLatClass implements LongLatInterface {
    Longitude: any;
    Latitude: any;
}

type AdministrativeMapLayer = 'countries' | 'states' | 'counties';

const CARTO_VOYAGER_TILE_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
const CARTO_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank">CARTO</a>';
const ESRI_WORLD_IMAGERY_TILE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const ESRI_WORLD_IMAGERY_ATTRIBUTION = 'Tiles &copy; Esri - Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community';

// interface gmapMarkerInterface {
//     zip: string;
//     marker: google.maps.Marker;
// }

// class gmapMarkerClass implements gmapMarkerInterface {
//     zip: string;
//     marker: google.maps.Marker;
// }


@Component({
    selector: 'MapComponent',
    templateUrl: './map-plugin.component.html',
    styleUrls: ['./map-plugin.component.css'],
    standalone: false
})




export class MapComponent extends BaseComponentDirective implements OnInit, MicobeTraceNextPluginEvents, OnDestroy {

    @Output() DisplayGlobalSettingsDialogEvent = new EventEmitter();
    @ViewChild('mapContainer') exportContainer: ElementRef;

    viewActive: boolean = true;
    svgStyle: {} = {
        'height': '0px',
        'width': '1000px'
    };

    nodes: any = [];
    map: any = null;
    layers: MapLayers = new MapLayers();

    IsDataAvailable: boolean = false;
    ShowGEOMapExportPane: boolean = false;
    ShowGEOMapSettingsPane: boolean = false;
    FieldList: SelectItem[] = [];
    LinkToolTipList: SelectItem[] = [];
    SelectedLatitude: string = "None";
    SelectedLongitude: string = "None";
    SelectedCensusTract: string = "None";
    SelectedZipCode: string = "None";
    SelectedCounty: string = "None";
    SelectedState: string = "None";
    SelectedCountry: string = "None";
    //SelectedResidenceAddress: string = "None";
    //SelectedVenueAddress: string = "None";
    //SelectedExposureAddress: string = "None";

    geocoder: any = null;
    //address: any = "new york city";

    markers: any[] = [];
    //gmapOptions: any;
    //overlays: any[];


    SelectedNetworkExportFilenameVariable: string = "";

    NetworkExportFileTypeList: any = [
        { label: 'png', value: 'png' },
        { label: 'jpeg', value: 'jpeg' },
        { label: 'webp', value: 'webp' },
        // { label: 'svg', value: 'svg' }
    ];
    SelectedNetworkExportFileTypeListVariable: string = "png";

    networkUpdatedSubscription: any;
    private destroy$ = new Subject<void>()
    private initialSettingsLoaded = false;
    private initialSettingsLoadScheduled = false;
    private applyingSettings = false;

    SelectedNetworkExportScaleVariable: any = 1;
    SelectedNetworkExportQualityVariable: any = 0.92;
    // view implementation of 2D to calculate resolution before export
    CalculatedResolutionWidth: any = 1918;
    CalculatedResolutionHeight: any = 909;
    CalculatedResolution: any = ((this.CalculatedResolutionWidth * this.SelectedNetworkExportScaleVariable) + " x " + (this.CalculatedResolutionHeight * this.SelectedNetworkExportScaleVariable) + "px");


    NodesTypes: any = [
        { label: 'Show', value: 'Show' },
        { label: 'Hide', value: 'Hide' }
    ];
    SelectedNodesTypeVariable: string = "Show";


    LinksTypes: any = [
        { label: 'Show', value: 'Show' },
        { label: 'Hide', value: 'Hide' }
    ];
    SelectedLinksTypeVariable: string = "Show";


    CountriesTypes: any = [
        { label: 'Labels + Borders', value: 'Show' },
        { label: 'Borders Only', value: 'BordersOnly' },
        { label: 'Hide', value: 'Hide' }
    ];
    SelectedCountriesTypeVariable: string = "Show";


    StatesTypes: any = [
        { label: 'Labels + Borders', value: 'Show' },
        { label: 'Borders Only', value: 'BordersOnly' },
        { label: 'Hide', value: 'Hide' }
    ];
    SelectedStatesTypeVariable: string = "Show";


    CountiesTypes: any = [
        { label: 'Labels + Borders', value: 'Show' },
        { label: 'Borders Only', value: 'BordersOnly' },
        { label: 'Hide', value: 'Hide' }
    ];
    SelectedCountiesTypeVariable: string = "Hide";


    BasemapTypes: any = [
        { label: 'Show', value: 'Show' },
        { label: 'Hide', value: 'Hide' }
    ];
    SelectedBasemapTypeVariable: string = "Hide";

    SatelliteTypes: any = [
        { label: 'Show', value: 'Show' },
        { label: 'Hide', value: 'Hide' }
    ];
    SelectedSatelliteTypeVariable: string = "Hide";

    NodeCollapsingTypes: any = [
        { label: 'On', value: 'On' },
        { label: 'Off', value: 'Off' }
    ];
    SelectedNodeCollapsingTypeVariable: string = "On";

    NodeAutoExpandTypes: any = [
        { label: 'On', value: 'On' },
        { label: 'Off', value: 'Off' }
    ];
    SelectedNodeAutoExpandTypeVariable: string = "On";

    // GeospatialTypes: any = [
    //     { label: 'On', value: 'On' },
    //     { label: 'Off', value: 'Off' }
    // ];
    //SelectedGeospatialTypeVariable: string = "Off";


    SelectedNodeTransparencyVariable: any = 0.0;
    SelectedNodeJitterVariable: any = -2;
    SelectedNodeTooltipVariable: string = "None";

    SelectedLinkTransparencyVariable: any = 0.0;
    SelectedLinkTooltipVariable: string = "None";

    //@ViewChild('select.nodeVariables') selectList: ElementRef;
    //@ViewChildren('map-field-lat') targets: ElementRef

    //@ViewChild('gmap') mapElement: any;
    //gmap: google.maps.Map;
    //gmapMarkers: gmapMarkerInterface[];

    // getImageValues() {
    //     return(Object.values(this.clusterImages))
    // }

    //locationsFound: any[] = [];

    private lmap: Map;
    private mapTooltip: string = '#mapTooltip'
    private readonly mapAdminLabelPaneName: string = 'map-admin-labels';

    nodesWithoutLoc: {index: number, ID: string}[] = [];
    showPopupMessage: boolean = false;

    public leafletMarkers: Layer[] = [];
    public leafletInitialOptions: MapOptions;
    public leafletMarkerClusterOptions: MarkerClusterGroupOptions;

    public isExporting: boolean = false;
    public isExportClosed: boolean = false;
    private exportTryCount: number = 0;
    private mapNodeIconSize: number = 24;
    private mapNodeIconCache: Record<string, string> = {};
    private mapNodeMarkersById: Record<string, MarkerWithData> = Object.create(null);
    private autoExpandRequestId = 0;
    private autoExpandedClusterOriginalOpacities = new globalThis.Map<any, number>();

    public NodeMapSettingsExportDialogSettings: DialogSettings;

    private visuals: MicrobeTraceNextVisuals;

    //private colorIterator: ColorIterator = new ColorIterator();

    // private marker: { triangle: string, square: string, circle: string } = {
    //     triangle: '<svg version="1" xmlns="http://www.w3.org/2000/svg" width="15" height="15"><path d="M7.5 0 L0 15 L15 15 Z" fill="{mapIconColor}"/></svg>',
    //     square: '<svg version="1" xmlns="http://www.w3.org/2000/svg" width="15" height="15"><rect width="15" height="15" fill="{mapIconColor}" /></svg>',
    //     circle: '<svg version="1" xmlns="http://www.w3.org/2000/svg" width="15" height="15"><circle cx="7.5" cy="7.5" r="7.5" fill="{mapIconColor}" /></svg>',
    // };

    // public dateFilterRangeValues: number[] = [0, 100];
    // public dateFilterRangeMax: number = 100;
    // public dateFilterRangeDates: Date[] = [new Date(), new Date()];
    // public dateFilterRangeMinDate: Date;
    //public geospatialNodes: MarkerWithData[] = [];

    constructor(injector: Injector,
        private renderer: Renderer2,
        private elem: ElementRef,
        private eventManager: EventManager,
        public commonService: CommonService,
        private store: CommonStoreService,
        @Inject(BaseComponentDirective.GoldenLayoutContainerInjectionToken) private container: ComponentContainer, 
        elRef: ElementRef,
        private cdref: ChangeDetectorRef,
        private exportService: ExportService,
        private gtmService: GoogleTagManagerService) {

            super(elRef.nativeElement);

        this.visuals = commonService.visuals;
        this.visuals.gisMap = this;
    }


    ngOnInit() {

        this.gtmService.pushTag({
            event: "page_view",
            page_location: "/map",
            page_title: "Map View"
        });

        if (!this.NodeMapSettingsExportDialogSettings) {
            this.NodeMapSettingsExportDialogSettings = new DialogSettings('#map-settings-pane', false);
        }

        this.IsDataAvailable = (this.commonService.session.data.nodes.length == 0 ? false : true);

        this.FieldList = [];

        this.FieldList.push({ label: "None", value: "None" });
        this.commonService.session.data['nodeFields'].map((d, i) => {

            this.FieldList.push(
                {
                    label: this.commonService.capitalize(d.replace("_", "")),
                    value: d
                });

        });

        this.LinkToolTipList = [{ label: "None", value: "None" }];
        this.commonService.session.data['linkFields'].map((d, i) => {
            if (d == 'source' || d == 'target' || d == 'nn') return;

            this.LinkToolTipList.push({
                    label: this.commonService.capitalize(d.replace("_", "")),
                    value: d
                });
        });

        //this.geocoder = new google.maps.Geocoder();
        this.initializeMap("US");

        if (this.commonService.temp.mapData.zipcodes == undefined) {
            this.commonService.getMapData('zipcodes.csv').then((x) => {

            });
        }

        this.hideTooltip();

        // TODO: remove when not needed
        // this.eventManager.addGlobalEventListener('window', 'node-selected', () => {
        //     this.drawNodes();
        // });

        let that = this;

        $( document ).on( "node-selected", function( ) {
            //update this?
            that.drawNodes(false);
            that.autoExpandSelectedNode();
        });

         // Used for timeline mode, TODO: update to use an RxJS Observable
        $( document ).on( "node-visibility", function( ) {
            let visNodes = that.commonService.getVisibleNodes();
            if (visNodes.length == that.nodes.length) { return; }
            that.nodes = visNodes;
            that.matchCoordinates(undefined, true);
            that.nodes.forEach(node => {
                if (node._jlat == undefined || node._jlon == undefined) {
                    that.rerollNodeAndJitter(node);
                }
            })

            that.drawNodes(false);
            that.drawLinks();
            //that.centerMap();
        });
        
        this.networkUpdatedSubscription = this.store.networkUpdated$
            .pipe(takeUntil(this.destroy$))
            .subscribe(newPruned => {
                console.log('--- Map updated', newPruned, this.viewActive);
                if (this.viewActive && newPruned) {
                    this.drawNodes(false)
                    this.drawLinks();
                    this.store.setNetworkUpdated(false); 
                }
        });

        this.container.on('resize', () => { 
            this.lmap.invalidateSize();
            this.centerMap();
        })
        this.container.on('hide', () => { 
            this.viewActive = false; 
            this.cdref.detectChanges();
        })
        this.container.on('show', () => { 
            this.viewActive = true; 
            this.cdref.detectChanges();
        })

        // Subscribe to style file applied event
        this.store.styleFileApplied$.pipe(takeUntil(this.destroy$)).subscribe(() => {
            this.applyStyleFileSettings();
        });
    }

    ngAfterViewInit() {
        setTimeout(() => this.centerMap(), 1000)
    }


    initializeMap(address: string) {

        this.codeAddress(["US"]).then((result: any[]) => {

            console.log('map codeAddress result', result);
            if (result.length > 0) {
                let latitude = result[0].Latitude;
                let longitude = result[0].Longitude;

                this.initializeLeafletMap(latitude, longitude);
            }
        });
    }

    initializeLeafletMap(latitude: number, longitude: number) {
        this.layers.basemap = tileLayer(CARTO_VOYAGER_TILE_URL, {
            maxZoom: 20,
            subdomains: 'abcd',
            attribution: CARTO_ATTRIBUTION
        }); 
        this.layers.satellite = tileLayer(ESRI_WORLD_IMAGERY_TILE_URL, {
            maxZoom: 19,
            attribution: ESRI_WORLD_IMAGERY_ATTRIBUTION
        });

        this.leafletInitialOptions = {
            zoom: 4,
            zoomControl: true,
            maxZoom: 15,
            preferCanvas: true,
            center: latLng([latitude, longitude]),
        };

        this.leafletMarkerClusterOptions = {
            showCoverageOnHover: false,
            zoomToBoundsOnClick: true,
            spiderfyOnMaxZoom: true,
            removeOutsideVisibleBounds: false,
            maxClusterRadius: 20,
            spiderLegPolylineOptions: { opacity: 0 }
        };
    }

    onMapReady(map: Map) {

        //get the leaflet map
        this.lmap = map;
        this.lmap.zoomControl.setPosition('bottomleft');
        this.ensureAdminLabelPane();
        this.tryLoadInitialSettings();
    }

    onMarkerClusterReady(markerCluster: MarkerClusterGroup) {
        this.layers.markerClusterGroup = markerCluster;
        this.tryLoadInitialSettings();
        this.autoExpandSelectedNode();
    }

    private tryLoadInitialSettings(): void {
        if (this.initialSettingsLoaded || this.initialSettingsLoadScheduled || !this.lmap || !this.layers.markerClusterGroup) {
            return;
        }

        this.initialSettingsLoadScheduled = true;
        window.setTimeout(() => {
            try {
                this.applyingSettings = true;
                this.loadSettings();
                this.initialSettingsLoaded = true;
            } finally {
                this.applyingSettings = false;
                this.initialSettingsLoadScheduled = false;
                this.cdref.detectChanges();
            }
        }, 0);
    }

    private markMapRendered(): void {
        if (!this.viewActive) {
            return;
        }

        // Map can be the first launched view, so it must explicitly release
        // the shared processing modal after its first draw cycle completes.
        window.setTimeout(() => {
            this.store.setNetworkRendered(true);
        }, 0);
    }

    getMarker(latitude: number, longitude: number): Layer {
        return circleMarker([latitude, longitude], {
            color: '#3c4b8d',
            fillColor: '#3c4b8d',
            radius: 5
        });
    }

    private getNodeShapeKey(node: any): string {
        return resolveNodeShapeForNode(
            node,
            this.commonService.session.style.widgets,
            this.commonService.session.style,
            this.commonService.temp.style.nodeSymbolMap
        );
    }

    onNodeRadiusChange() {
        this.commonService.session.style.widgets['map-node-size'] = this.mapNodeIconSize;
        this.drawNodes(false);
    }

    private getStrokeWidth(shapeKey: string, selected: boolean) {
        if (shapeKey == 'lettuce') {
            return selected ? 10 : 3;
        } else if (shapeKey == 'ship' || shapeKey == 'tick' || shapeKey == 'swab') {
            return selected ? 15 : 5;
        } else if (isCustomNodeIconShape(shapeKey)) {
            return selected ? 20 : 10;
        } else {
            return selected ? 36 : 16;
        }
    }

    private getMapNodeIcon(shapeKey: string, fillColor: string, strokeColor: string, selected: boolean, fillOpacity: number): L.Icon {
        const normalizedShapeKey = resolveNodeShapeKey(shapeKey);
        const safeFill = fillColor || '#000000';
        const safeStroke = strokeColor || '#000000';
        const safeFillOpacity = this.commonService.clampStyleAlpha(fillOpacity, 1);
        const strokeWidth = this.getStrokeWidth(normalizedShapeKey, selected);
        const shapeStrokeColor = isCustomNodeIconShape(normalizedShapeKey) && !selected ? (normalizedShapeKey == 'lettuce' ? '#ffffff' : '#000000') : safeStroke; // default for unselected shapes is black except for lettuce
        const cacheKey = `${normalizedShapeKey}|${safeFill}|${shapeStrokeColor}|${strokeWidth}|${safeFillOpacity}`;

        if (!this.mapNodeIconCache[cacheKey]) {
            this.mapNodeIconCache[cacheKey] = getMapNodeShapeDataUri(normalizedShapeKey, safeFill, shapeStrokeColor, strokeWidth, safeFillOpacity);
        }

        return icon({
            iconUrl: this.mapNodeIconCache[cacheKey],
            iconSize: [this.mapNodeIconSize, this.mapNodeIconSize],
            iconAnchor: [this.mapNodeIconSize / 2, this.mapNodeIconSize / 2],
            tooltipAnchor: [0, -this.mapNodeIconSize / 2]
        });
    }

    private ensureMapAutoExpandSelectedSetting(): void {
        const widgets = this.commonService.session.style.widgets;
        if (widgets['map-auto-expand-selected'] === undefined || widgets['map-auto-expand-selected'] === null) {
            widgets['map-auto-expand-selected'] = true;
        }
    }

    private canAutoExpandSelectedNode(): boolean {
        this.ensureMapAutoExpandSelectedSetting();

        return !!this.lmap
            && !!this.layers.markerClusterGroup
            && this.commonService.session.style.widgets['map-node-show'] === true
            && this.commonService.session.style.widgets['map-collapsing-on'] === true
            && this.commonService.session.style.widgets['map-auto-expand-selected'] === true;
    }

    private hasValidMapCoordinates(node: any): boolean {
        const latitude = node?._jlat;
        const longitude = node?._jlon;

        return latitude !== undefined
            && latitude !== null
            && String(latitude).trim() !== ''
            && longitude !== undefined
            && longitude !== null
            && String(longitude).trim() !== ''
            && Number.isFinite(Number(latitude))
            && Number.isFinite(Number(longitude));
    }

    private autoExpandSelectedNode(): void {
        if (!this.canAutoExpandSelectedNode()) {
            return;
        }

        const selectedNodeIds = this.nodes
            .filter(node =>
            node.selected
            && node.visible !== false
            && this.hasValidMapCoordinates(node)
            && node._id !== undefined
            && this.mapNodeMarkersById[String(node._id)]
            )
            .map(node => String(node._id));

        if (!selectedNodeIds.length) {
            return;
        }

        this.scheduleExpandSelectedMapNodeClusters(selectedNodeIds, ++this.autoExpandRequestId);
    }

    private scheduleExpandSelectedMapNodeClusters(nodeIds: string[], requestId: number, attempt: number = 0): void {
        window.setTimeout(() => {
            if (requestId !== this.autoExpandRequestId) {
                return;
            }

            if (this.expandSelectedMapNodeClusters(nodeIds) || attempt >= 20) {
                return;
            }

            this.scheduleExpandSelectedMapNodeClusters(nodeIds, requestId, attempt + 1);
        }, attempt === 0 ? 0 : 100);
    }

    private expandSelectedMapNodeClusters(nodeIds: string[]): boolean {
        if (!this.canAutoExpandSelectedNode()) {
            return true;
        }

        if (!(this.layers.markerClusterGroup as any)._map) {
            return false;
        }

        this.clearAutoExpandedSelectedClusters();

        let visibleSelectedMarkerFound = false;
        let waitingForClusterLayout = false;
        const selectedClusters = new globalThis.Map<any, MarkerWithData[]>();

        nodeIds.forEach(nodeId => {
            const marker = this.mapNodeMarkersById[nodeId];
            if (!marker || !this.layers.markerClusterGroup.hasLayer(marker)) {
                return;
            }

            const visibleParent = this.layers.markerClusterGroup.getVisibleParent(marker);
            if (!visibleParent) {
                waitingForClusterLayout = true;
                return;
            }

            if (visibleParent === marker) {
                visibleSelectedMarkerFound = true;
                return;
            }

            const parentCluster = visibleParent && (visibleParent as any).spiderfy
                ? visibleParent as any
                : null;
            if (!parentCluster) {
                return;
            }

            const selectedMarkers = selectedClusters.get(parentCluster) || [];
            selectedMarkers.push(marker);
            selectedClusters.set(parentCluster, selectedMarkers);
        });

        if (!selectedClusters.size) {
            return visibleSelectedMarkerFound && !waitingForClusterLayout;
        }

        this.renderAutoExpandedSelectedClusters(Array.from(selectedClusters.keys()));
        return this.layers.autoExpandedSelectedNodes.getLayers().length > 0;
    }

    private renderAutoExpandedSelectedClusters(clusters: any[]): void {
        if (!this.lmap) {
            return;
        }

        clusters.forEach(cluster => {
            const childMarkers = (cluster.getAllChildMarkers?.() || []) as MarkerWithData[];
            if (!childMarkers.length) {
                return;
            }

            const centerPoint = this.lmap.latLngToLayerPoint(cluster.getLatLng());
            const positions = this.generateAutoExpandPositions(childMarkers.length, centerPoint);

            if (!this.autoExpandedClusterOriginalOpacities.has(cluster)) {
                this.autoExpandedClusterOriginalOpacities.set(cluster, cluster.options?.opacity ?? 1);
            }
            if (typeof cluster.setOpacity === 'function') {
                cluster.setOpacity(0.3);
            }

            childMarkers.forEach((marker, index) => {
                const expandedMarker = this.createAutoExpandedNodeMarker(marker, positions[index]);
                this.layers.autoExpandedSelectedNodes.addLayer(expandedMarker);
            });
        });

        if (this.layers.autoExpandedSelectedNodes.getLayers().length > 0 && !this.lmap.hasLayer(this.layers.autoExpandedSelectedNodes)) {
            this.lmap.addLayer(this.layers.autoExpandedSelectedNodes);
        }
    }

    private generateAutoExpandPositions(count: number, centerPoint: L.Point): L.Point[] {
        const spiderfyDistanceMultiplier = (this.leafletMarkerClusterOptions as any).spiderfyDistanceMultiplier || 1;
        const circleSpiralSwitchOver = 9;

        if (count >= circleSpiralSwitchOver) {
            return this.generateAutoExpandSpiralPositions(count, centerPoint, spiderfyDistanceMultiplier);
        }

        return this.generateAutoExpandCirclePositions(count, centerPoint, spiderfyDistanceMultiplier);
    }

    private generateAutoExpandCirclePositions(count: number, centerPoint: L.Point, distanceMultiplier: number): L.Point[] {
        const circleFootSeparation = 25;
        const circleStartAngle = 0;
        const twoPi = Math.PI * 2;
        const legLength = Math.max(distanceMultiplier * circleFootSeparation * (2 + count) / twoPi, 35);
        const angleStep = twoPi / count;
        const positions: L.Point[] = [];

        for (let i = 0; i < count; i++) {
            const angle = circleStartAngle + i * angleStep;
            positions[i] = new L.Point(
                centerPoint.x + legLength * Math.cos(angle),
                centerPoint.y + legLength * Math.sin(angle)
            ).round();
        }

        return positions;
    }

    private generateAutoExpandSpiralPositions(count: number, centerPoint: L.Point, distanceMultiplier: number): L.Point[] {
        const spiralFootSeparation = 28;
        const spiralLengthStart = 11;
        const spiralLengthFactor = 5;
        const twoPi = Math.PI * 2;
        const separation = distanceMultiplier * spiralFootSeparation;
        const lengthFactor = distanceMultiplier * spiralLengthFactor * twoPi;
        let legLength = distanceMultiplier * spiralLengthStart;
        let angle = 0;
        const positions: L.Point[] = [];

        for (let i = count; i >= 0; i--) {
            if (i < count) {
                positions[i] = new L.Point(
                    centerPoint.x + legLength * Math.cos(angle),
                    centerPoint.y + legLength * Math.sin(angle)
                ).round();
            }
            angle += separation / legLength + i * 0.0005;
            legLength += lengthFactor / angle;
        }

        return positions;
    }

    private createAutoExpandedNodeMarker(sourceMarker: MarkerWithData, layerPoint: L.Point): MarkerWithData {
        const expandedMarker = L.marker(this.lmap.layerPointToLatLng(layerPoint), {
            ...sourceMarker.options,
            icon: sourceMarker.options.icon,
            zIndexOffset: 1000000
        } as L.MarkerOptions & { fillOpacity: number; fillColor: string; color: string; weight: number }) as MarkerWithData;

        expandedMarker.data = sourceMarker.data;
        expandedMarker.locationDetail = sourceMarker.locationDetail;
        expandedMarker.nodeType = sourceMarker.nodeType;

        expandedMarker
            .on('mouseover', (e) => this.showNodeTooltip(e))
            .on('mouseout', (e) => this.hideTooltip())
            .on('click', (e) => this.clickHandler(e));

        return expandedMarker;
    }

    private clearAutoExpandedSelectedClusters(): void {
        this.autoExpandedClusterOriginalOpacities.forEach((opacity, cluster) => {
            if (typeof cluster.setOpacity === 'function') {
                cluster.setOpacity(opacity);
            }
        });
        this.autoExpandedClusterOriginalOpacities.clear();

        this.layers.autoExpandedSelectedNodes.clearLayers();
        if (this.lmap?.hasLayer(this.layers.autoExpandedSelectedNodes)) {
            this.lmap.removeLayer(this.layers.autoExpandedSelectedNodes);
        }
    }

    /* Not sure goal of this at the moment
    setDefaultAddressFields() {
        const foundExposureAddressColName = this.commonService.session.data['nodeFields'].find(x => x === 'ExposureLocation');
        if (foundExposureAddressColName) this.SelectedExposureAddress = foundExposureAddressColName;
        const foundVenueAddressColName = this.commonService.session.data['nodeFields'].find(x => x === 'VenueLocation');
        if (foundVenueAddressColName) this.SelectedVenueAddress = foundVenueAddressColName;
    }*/

    // onDateFilterChange(e: any) {
    //     this.dateFilterRangeDates[0] = moment(this.dateFilterRangeMinDate).add(this.dateFilterRangeValues[0], 'days').toDate();
    //     this.dateFilterRangeDates[1] = moment(this.dateFilterRangeMinDate).add(this.dateFilterRangeValues[1], 'days').toDate();

    //     this.onDataChange(undefined);
    // }

    /* Not sure about this function
    setDateRangeFilterValues() {
        let markers = this.getGeospatialNodes().filter(x => x.locationDetail.Name != 'Residence');

        const dates = markers.filter(x => x.locationDetail)
            .map(x => x.locationDetail.Date);
        this.dateFilterRangeDates[0] = _.min(dates);
        this.dateFilterRangeDates[1] = _.max(dates);
        const daysDiff = moment(this.dateFilterRangeDates[1]).diff(moment(this.dateFilterRangeDates[0]), 'days');
        this.dateFilterRangeValues = [0, daysDiff];
        this.dateFilterRangeMax = daysDiff;
        this.dateFilterRangeMinDate = this.dateFilterRangeDates[0];

        this.onDataChange(undefined);
    }
        */

    showAllVisibleMarkers() {
        // var bounds = new google.maps.LatLngBounds();
        // for (var i = 0; i < this.markers.length; i++) {
        //     bounds.extend(this.markers[i].getPosition());
        // }
    }

    centerMap() {
        if (this.lmap && this.layers.nodes().getLayers().length > 0) {
            const nodeBounds = this.layers.nodes().getBounds();
            if (!nodeBounds.isValid()) {
                return;
            }

            const padding = this.commonService.session.style.widgets['map-collapsing-on'] ? 28 : 18;
            this.lmap.fitBounds(nodeBounds, {
                animate: false,
                padding: [padding, padding]
            });
        }
    }

    /**
     * Calls clearAllMarkers_Leftlet() which removes all nodes from map and remove _jlat and _jlon value for each node
     */
    clearAllMarkers() {
        this.clearAllMarkers_Leaflet();
    }

    /*clearAllMarkers_Google() {
        for (var i = 0; i < this.markers.length; i++) {
            this.markers[i].setMap(null);
        }

        this.markers = [];
    }*/

    /**
     * Removes all nodes from map and remove _jlat and _jlon value for each node
     */
    clearAllMarkers_Leaflet() {
        this.clearAutoExpandedSelectedClusters();
        this.layers.removeNodes();
        this.nodes.forEach(node => {
            node._jlat = undefined;
            node._jlon = undefined;
        });
    }

    onDataChange(event) {
        if (!this.initialSettingsLoaded && !this.applyingSettings) {
            return;
        }

        this.commonService.session.style.widgets['map-field-lat'] = this.SelectedLatitude;
        this.commonService.session.style.widgets['map-field-lon'] = this.SelectedLongitude;
        this.commonService.session.style.widgets['map-field-tract'] = this.SelectedCensusTract;
        this.commonService.session.style.widgets['map-field-zipcode'] = this.SelectedZipCode;
        this.commonService.session.style.widgets['map-field-county'] = this.SelectedCounty;
        this.commonService.session.style.widgets['map-field-state'] = this.SelectedState;
        this.commonService.session.style.widgets['map-field-country'] = this.SelectedCountry;
        //this.commonService.session.style.widgets['map-field-residence-address'] = this.SelectedResidenceAddress;
        //this.commonService.session.style.widgets['map-field-venue-address'] = this.SelectedVenueAddress;
        //this.commonService.session.style.widgets['map-field-exposure-address'] = this.SelectedExposureAddress;

        this.clearAllMarkers();
        this.layers.removeLinks();

        this.nodes = this.commonService.getVisibleNodes();
        //let cnt: any = 0;
        //let dataFound: boolean = false;

        let that = this;
        // XXX check if reroll is need for drawNodes()
        this.matchCoordinates(function () {
            let rerollCheck = that.rerollCheck();
            if (rerollCheck) {
                that.drawNodes();
            } else {
                that.jitter();
                that.drawNodes(false);
            }
            that.drawLinks();
            that.resetStack();
            that.centerMap()
            that.autoExpandSelectedNode();
            that.markMapRendered();
            }, false);

    }


    /**
     * Updates where to show or hide nodes on the Map
     * @param e 'Show' | 'Hide'
     */
    onMapNodeShowHideChange(e) {
        this.SelectedNodesTypeVariable = e;

        if (e == "Show") {
            this.commonService.session.style.widgets['map-node-show'] = true;
            this.drawNodes(false);
            //this.drawLinks();
        }
        else {
            this.commonService.session.style.widgets['map-node-show'] = false;
            this.layers.removeNodes();
        }
    }

    /**
     * Updates where to show or hide links on the Map
     * @param e 'Show' | 'Hide'
     */
    onMapLinksShowHideChange(e) {
        this.SelectedLinksTypeVariable = e;

        if (e == "Show") {
            this.commonService.session.style.widgets['map-link-show'] = true;
            this.drawNodes(false);
            this.drawLinks();
        }
        else {
            this.commonService.session.style.widgets['map-link-show'] = false;
            this.layers.links.remove();
        }
    }


    onCountriesShowHidChange(e) {
        this.SelectedCountriesTypeVariable = e;
        const showCountries = this.isAdminLayerVisible(e);
        const showLabels = this.areAdminLabelsVisible(e);
        this.commonService.session.style.widgets['map-countries-show'] = showCountries;
        this.commonService.session.style.widgets['map-countries-labels-show'] = showLabels;

        if (showCountries) {
            this.onSatelliteChange('Hide', true);
            this.onBasemapChange('Hide', true);
            if (this.layers.countries.getLayers().length > 0) {
                this.layers.countries.addTo(this.lmap);
                this.updateAdminLabelLayer('countries', showLabels);
                this.resetStack();
            } else {
                //this.commonService.getMapData('countries.json', () => $(this).trigger('click'));
                this.getMapData('countries.json', () => {
                    this.layers.countries.addTo(this.lmap);
                    this.updateAdminLabelLayer('countries', showLabels);
                    this.resetStack();
                });

            }
        }
        else {
            this.layers.countries.remove();
            this.updateAdminLabelLayer('countries', false);

        }
    }


    onStatesShowHideChange(e) {
        this.SelectedStatesTypeVariable = e;
        const showStates = this.isAdminLayerVisible(e);
        const showLabels = this.areAdminLabelsVisible(e);
        this.commonService.session.style.widgets['map-states-show'] = showStates;
        this.commonService.session.style.widgets['map-states-labels-show'] = showLabels;

        if (showStates) {
            if (this.layers.states.getLayers().length > 0) {
                this.layers.states.addTo(this.lmap);
                this.updateAdminLabelLayer('states', showLabels);
                this.resetStack();
            } else {
                this.getMapData('states.json', () => {
                    this.layers.states.addTo(this.lmap);
                    this.updateAdminLabelLayer('states', showLabels);
                    this.resetStack();
                });
            }
        }
        else {
            this.layers.states.remove();
            this.updateAdminLabelLayer('states', false);
        }
    }


    onCountiesShowHideChange(e) {
        this.SelectedCountiesTypeVariable = e;
        const showCounties = this.isAdminLayerVisible(e);
        const showLabels = this.areAdminLabelsVisible(e);
        this.commonService.session.style.widgets['map-counties-show'] = showCounties;
        this.commonService.session.style.widgets['map-counties-labels-show'] = showLabels;

        if (showCounties) {
            if (this.layers.counties.getLayers().length > 0) {
                this.layers.counties.addTo(this.lmap);
                this.updateAdminLabelLayer('counties', showLabels);
                this.resetStack();
            } else {
                this.getMapData('counties.json', () => {
                    this.layers.counties.addTo(this.lmap);
                    this.updateAdminLabelLayer('counties', showLabels);
                    this.resetStack();
                });
            }
        }
        else {
            this.layers.counties.remove();
            this.updateAdminLabelLayer('counties', false);
        }
    }

    private updateAdminLabelLayer(name: AdministrativeMapLayer, isVisible: boolean): void {
        const widgetKey = this.getAdminLabelWidgetKey(name);
        this.commonService.session.style.widgets[widgetKey] = isVisible;

        if (!isVisible) {
            this.getAdminLabelLayer(name).remove();
            return;
        }

        this.ensureAdminLabelPane();
        if (!this.lmap) return;

        if (this.getAdminLabelLayer(name).getLayers().length > 0) {
            this.getAdminLabelLayer(name).addTo(this.lmap);
            this.resetStack();
            return;
        }

        this.getMapData(`${name}.json`, () => {
            if (this.commonService.session.style.widgets[widgetKey]) {
                this.getAdminLabelLayer(name).addTo(this.lmap);
                this.resetStack();
            }
        });
    }

    private isAdminLayerVisible(selection: string): boolean {
        return selection === 'Show' || selection === 'BordersOnly' || selection === 'ShowLabels';
    }

    private areAdminLabelsVisible(selection: string): boolean {
        return selection === 'Show' || selection === 'ShowLabels';
    }

    private getAdminLayerSelection(name: AdministrativeMapLayer): string {
        if (!this.commonService.session.style.widgets[`map-${name}-show`]) {
            return 'Hide';
        }

        return this.commonService.session.style.widgets[this.getAdminLabelWidgetKey(name)] ? 'Show' : 'BordersOnly';
    }

    private ensureAdminLabelWidgetDefaults(): void {
        (['countries', 'states', 'counties'] as AdministrativeMapLayer[]).forEach(name => {
            const widgetKey = this.getAdminLabelWidgetKey(name);
            if (this.commonService.session.style.widgets[widgetKey] === undefined) {
                this.commonService.session.style.widgets[widgetKey] = false;
            }
        });
    }

    onBasemapChange(e, isReload: boolean = false) {
        this.SelectedBasemapTypeVariable = e;

        if (e == "Show") {
            this.commonService.session.style.widgets['map-basemap-show'] = true;

            this.layers.basemap.addTo(this.lmap);
            this.layers.basemap.bringToFront();

            if (!isReload) {
                this.SelectedSatelliteTypeVariable = 'Hide';
                this.onSatelliteChange('Hide');
                this.onCountiesShowHideChange('Hide');
                this.onStatesShowHideChange('Hide');
                this.onCountriesShowHidChange('Hide');
            }
        }
        else {

            this.commonService.session.style.widgets['map-basemap-show'] = false;

            if (!isReload) {
                if (this.SelectedSatelliteTypeVariable === 'Hide' && this.SelectedBasemapTypeVariable === 'Hide') {
                    this.onCountriesShowHidChange('BordersOnly');
                    this.onStatesShowHideChange('BordersOnly');
                }
            }

            this.layers.basemap.remove();
        }
    }

    onSatelliteChange(e, isReload: boolean = false) {
        this.SelectedSatelliteTypeVariable = e;

        if (e == "Show") {
            this.commonService.session.style.widgets['map-satellite-show'] = true;

            this.layers.satellite.addTo(this.lmap);
            this.layers.satellite.bringToFront();

            if (!isReload) {
                this.SelectedBasemapTypeVariable = 'Hide';
                this.onBasemapChange('Hide');
                this.onCountiesShowHideChange('Hide');
                this.onStatesShowHideChange('Hide');
                this.onCountriesShowHidChange('Hide');
            }
        }
        else {
            this.commonService.session.style.widgets['map-satellite-show'] = false;

            if (!isReload) {
                if (this.SelectedSatelliteTypeVariable === 'Hide' && this.SelectedBasemapTypeVariable === 'Hide') {
                    this.onCountriesShowHidChange('BordersOnly');
                    this.onStatesShowHideChange('BordersOnly');
                }
            }

            this.layers.satellite.remove();
        }
    }

    /**
     * Updates nodes to be collapsing or not and updates the value of the widget['map-collapsing-on']
     */
    onNodeCollapsingChange(e) {
        if (this.SelectedNodeCollapsingTypeVariable == "On") {
            this.commonService.session.style.widgets['map-collapsing-on'] = true;
            this.drawNodes(false);
            this.autoExpandSelectedNode();
        }
        else {
            this.commonService.session.style.widgets['map-collapsing-on'] = false;
            this.clearAutoExpandedSelectedClusters();
            this.drawNodes(false);
        }
    }

    onNodeAutoExpandChange(e) {
        if (e) {
            this.SelectedNodeAutoExpandTypeVariable = e;
        }

        this.commonService.session.style.widgets['map-auto-expand-selected'] = this.SelectedNodeAutoExpandTypeVariable == "On";

        if (this.commonService.session.style.widgets['map-auto-expand-selected']) {
            this.autoExpandSelectedNode();
        } else {
            this.clearAutoExpandedSelectedClusters();
        }
    }

    /**
     * revisit if nodes need to be rerolled or not
     * @param e 
     */
    onGeospatialTypeChange(e) {
        // if (this.SelectedGeospatialTypeVariable == "On") {
        //     this.commonService.session.style.widgets['map-geospatial-type-on'] = true;
        //     this.drawNodes();
        //     this.drawLinks();
        // }
        // else {
            this.commonService.session.style.widgets['map-geospatial-type-on'] = false;
            this.drawNodes();
            this.drawLinks();
        //}
    }

    /**
     * Updates transparency of the nodes and the value of the widget['map-node-transparency']
     */
    onNodeTransparencyChange(e) {
        this.commonService.session.style.widgets['map-node-transparency'] = e;
        this.drawNodes(false);
    }


    /**
     * updates node and link positions after rerolling nodes and also updates the value of the widget['map-node-jitter']
     * @param e 
     */
    onNodeJitterChange(e?) {
        if (e) {
            this.commonService.session.style.widgets['map-node-jitter'] = e;
        }
        
        this.drawNodes();
        this.drawLinks();
    }


    onNodeToolTipChange(e) {
        this.commonService.session.style.widgets['map-node-tooltip-variable'] = e;
    }


    /**
     * Updates transparency of the link and the value of the widget['map-link-transparency']
     */
    onLinkTransparencyChange(e) {
        this.commonService.session.style.widgets['map-link-transparency'] = e;
        this.drawLinks();
    }


    onLinkToolTipChange(e) {
        this.commonService.session.style.widgets['map-link-tooltip-variable'] = e;
    }

    exportVisualization(event) {
        this.visuals.gisMap.ShowGEOMapExportPane = false;
        this.isExporting = true;

        /*
        Currently not able to export map view as an SVG, with a lot of work may be possible with limitations (I was able to use similar idea from 2D)
        1. updated preferCanvas to false initially, so it renders an SVG; 2. selected that element [document.querySelector('.mapStyle svg').outerHTML;]
        3. made modifications and passed it to a modified this.exportService.requestSVGExport; 4. that was able to export but still needed to add xmlns="http://www.w3.org/2000/svg" to svg tag
        The resulting svg was still incomplete; it didn't have collapsed nodes and only allowed the offline map setting (not sure if its possible to use basemap or satellite)
        */

        if (!this.isExportClosed) {
            setTimeout(() => this.exportVisualization(undefined), 300);
        }
        else {
            this.exportWork();
        }
    }

    onCloseExport() {
        this.isExportClosed = true;
    }

    exportWork() {
        this.lmap.removeControl(this.lmap.zoomControl)
        setTimeout(() => {
            const exportOptions: ExportOptions = {
                filename: this.SelectedNetworkExportFilenameVariable,
                filetype: this.SelectedNetworkExportFileTypeListVariable,
                scale: this.SelectedNetworkExportScaleVariable,
                quality: this.SelectedNetworkExportQualityVariable,
            }
            this.exportService.setExportOptions(exportOptions);
            let elementsToExport: HTMLElement[] = [this.exportContainer.nativeElement]
            this.exportService.requestExport(elementsToExport, true, true, true)
        }, 1000);
        new Promise(resolve => setTimeout(resolve, 2000)).then(() => this.lmap.addControl(this.lmap.zoomControl))
    }

    displayColorOptions() {
        this.DisplayGlobalSettingsDialogEvent.emit("Styling");
    }

    codeAddress(addressList: any[]) {

        let positionList: any[] = [];
        let cnt: number = 0;

        return new Promise((resolve, reject) => {

            addressList.map(address => {

                if (this.geocoder) {
                    this.geocoder.geocode({ 'address': address }, (results, status) => {

                        //    debugger;

                        let latLng: LongLatInterface = new LongLatClass();

                        if (results != null) {
                            if (results.length > 0) {

                                console.log(cnt, results);

                                latLng.Latitude = results[0].geometry.location.lat();
                                latLng.Longitude = results[0].geometry.location.lng();

                                if (status == 'OK') {
                                    positionList.push(latLng);

                                } else {
                                    alert('Geocode was not successful for the following reason: ' + status);
                                }
                            }
                        }

                        cnt = cnt + 1;

                        if (cnt >= addressList.length)
                            resolve(positionList);

                    });
                }
                else
                {
                    let latLng: LongLatInterface = new LongLatClass();
                    latLng.Latitude = 39.833332;
                    latLng.Longitude = -98.583336;
                    positionList.push(latLng);
                    resolve(positionList);
                }
            });
        });
    }

    updateCalculatedResolution(event) {
        this.CalculatedResolution = (Math.round(this.CalculatedResolutionWidth * this.SelectedNetworkExportScaleVariable) + " x " + Math.round(this.CalculatedResolutionHeight * this.SelectedNetworkExportScaleVariable) + "px");
        this.cdref.detectChanges();
    }

    getMapData(type, callback) {
        var name = type.split('.')[0];
        this.commonService.getMapData(type).then(data => {
            if (this.commonService.includes(['countries', 'states', 'counties'], name)) {

                this.layers[name] = geoJSON(data,
                    {
                        style: {
                            color: '#dadde0',
                            weight: name == 'countries' ? 1 : 0.5,
                            fillColor: '#fafaf8',
                            fillOpacity: name == 'countries' ? 1 : 0
                        }
                    });

                this.replaceAdminLabelLayer(name as AdministrativeMapLayer, this.createAdminLabelLayer(name as AdministrativeMapLayer, data));
            }
            if (callback) callback();
        })
    }

    private ensureAdminLabelPane(): void {
        if (!this.lmap) return;

        const pane = this.lmap.getPane(this.mapAdminLabelPaneName) || this.lmap.createPane(this.mapAdminLabelPaneName);
        pane.style.zIndex = '475';
        pane.style.pointerEvents = 'none';
    }

    private createAdminLabelLayer(name: AdministrativeMapLayer, data: any): FeatureGroup {
        const labelMarkers: Marker[] = [];
        const features = Array.isArray(data?.features) ? data.features : [];

        features.forEach(feature => {
            const labelMarker = this.createAdminLabelMarker(name, feature);
            if (labelMarker) {
                labelMarkers.push(labelMarker);
            }
        });

        return featureGroup(labelMarkers);
    }

    private createAdminLabelMarker(name: AdministrativeMapLayer, feature: any): Marker | null {
        const properties = feature?.properties || {};
        const latitude = Number(properties._lat);
        const longitude = Number(properties._lon);
        const label = properties.name == null ? '' : String(properties.name);

        if (!label || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            return null;
        }

        return marker([latitude, longitude], {
            interactive: false,
            keyboard: false,
            pane: this.mapAdminLabelPaneName,
            icon: L.divIcon({
                className: `map-admin-label map-admin-label-${name}`,
                html: `<span>${this.escapeMapLabelHtml(label)}</span>`,
                iconSize: [0, 0],
                iconAnchor: [0, 0]
            })
        });
    }

    private replaceAdminLabelLayer(name: AdministrativeMapLayer, labelLayer: FeatureGroup): void {
        const existingLayer = this.getAdminLabelLayer(name);
        if (this.lmap && this.lmap.hasLayer(existingLayer)) {
            existingLayer.remove();
        }

        this.setAdminLabelLayer(name, labelLayer);

        if (this.lmap && this.commonService.session.style.widgets[this.getAdminLabelWidgetKey(name)]) {
            labelLayer.addTo(this.lmap);
        }
    }

    private getAdminLabelLayer(name: AdministrativeMapLayer): FeatureGroup {
        switch (name) {
            case 'countries':
                return this.layers.countriesLabels;
            case 'states':
                return this.layers.statesLabels;
            case 'counties':
                return this.layers.countiesLabels;
        }
    }

    private setAdminLabelLayer(name: AdministrativeMapLayer, layer: FeatureGroup): void {
        switch (name) {
            case 'countries':
                this.layers.countriesLabels = layer;
                break;
            case 'states':
                this.layers.statesLabels = layer;
                break;
            case 'counties':
                this.layers.countiesLabels = layer;
                break;
        }
    }

    private getAdminLabelWidgetKey(name: AdministrativeMapLayer): string {
        return `map-${name}-labels-show`;
    }

    private escapeMapLabelHtml(value: string): string {
        return value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    matchCoordinates(callback, norefresh) {
        if (!norefresh) this.nodes = this.commonService.getVisibleNodes();
        if (this.commonService.session.style.widgets['map-field-country'] !== 'None') {
            if (!this.commonService.temp.mapData.countries) {
                this.getMapData('countries.json', () => this.matchCoordinates(callback, true));
                return;
            }
            var val = this.commonService.session.style.widgets['map-field-country'];
            this.nodes.forEach(n => {
                var country = this.commonService.temp.mapData.countries.features.find(c => c.id == n[val] || c.properties.name == n[val]);
                if (country) {
                    n._lat = country.properties._lat,
                        n._lon = country.properties._lon
                }
            });
        }
        if (this.commonService.session.style.widgets['map-field-state'] !== 'None') {
            if (!this.commonService.temp.mapData.states) {
                this.getMapData('states.json', () => this.matchCoordinates(callback, true));
                return;
            }
            var sval = this.commonService.session.style.widgets['map-field-state'];
            this.nodes.forEach(n => {
                var state = this.commonService.temp.mapData.states.features.find(s => s.properties.usps == n[sval] || s.properties.name == n[sval]);
                if (state) {
                    n._lat = state.properties._lat;
                    n._lon = state.properties._lon;
                }
            });
        }
        if (this.commonService.session.style.widgets['map-field-county'] !== 'None') {
            if (!this.commonService.temp.mapData.counties) {
                this.getMapData('counties.json', () => this.matchCoordinates(callback, true));
                return;
            }
            var sval = this.commonService.session.style.widgets['map-field-state'];
            var cval = this.commonService.session.style.widgets['map-field-county'];
            this.nodes.forEach(n => {
                var county;
                county = this.commonService.temp.mapData.counties.features.find(c => {
                    return (c.properties.fips == n[cval] ||
                        parseFloat(c.properties.fips) == parseFloat(n[cval]));
                });
                if (county) {
                    n._lat = county.properties._lat;
                    n._lon = county.properties._lon;
                    return;
                }
                var state = this.commonService.temp.mapData.states.features.find(s => s.properties.usps == n[sval].toUpperCase() || s.properties.name.toLowerCase().includes(n[sval].toLowerCase()));
                county = this.commonService.temp.mapData.counties.features.find(c => {
                    var small = n[cval].toLowerCase();
                    return c.properties.state == state.properties.usps && (
                        c.properties.name.includes(small) ||
                        small.includes(c.properties.name)
                    );
                });
                if (county) {
                    n._lat = county.properties._lat;
                    n._lon = county.properties._lon;
                }
            });
        }
        if (this.commonService.session.style.widgets['map-field-zipcode'] !== 'None') {
            if (!this.commonService.temp.mapData.zipcodes) {
                this.getMapData('zipcodes.csv', () => this.matchCoordinates(callback, true));
                return;
            }
            var val = this.commonService.session.style.widgets['map-field-zipcode'];
            this.nodes.forEach(n => {
                var zo = this.commonService.temp.mapData.zipcodes.find(z => z.zipcode == n[val]);
                if (zo) {
                    n._lat = zo._lat;
                    n._lon = zo._lon;
                }
            });
        }
        if (this.commonService.session.style.widgets['map-field-tract'] !== 'None') {
            if (!this.commonService.temp.mapData.tracts) {
                this.getMapData('tracts.csv', () => this.matchCoordinates(callback, true));
                return;
            }
            var val = this.commonService.session.style.widgets['map-field-tract'];
            this.nodes.forEach(n => {
                var tract = this.commonService.temp.mapData.tracts.find(t => t.tract == n[val]);
                if (tract) {
                    n._lat = tract._lat;
                    n._lon = tract._lon;
                }
            });
        }

        // debugger;

        if (this.commonService.session.style.widgets['map-field-lat'] !== 'None' && this.commonService.session.style.widgets['map-field-lon'] !== 'None') {
            var lat = this.commonService.session.style.widgets['map-field-lat'],
                lon = this.commonService.session.style.widgets['map-field-lon'];


            this.nodes.forEach(n => {


                if (typeof n[lat] == 'string') {
                    n._lat = (n[lat].includes('S') ? -1 : 1) * parseFloat(n[lat]);
                } else {
                    n._lat = n[lat];
                }
                if (typeof n[lon] == 'string') {
                    n._lon = (n[lon].includes('W') ? -1 : 1) * parseFloat(n[lon]);
                } else {
                    n._lon = n[lon];
                }
            });
        }

        this.nodesWithoutLoc = [];
        let nodeLocSet: boolean = false;
        this.nodes.forEach(n => {
            if (!n._lat || !n._lon){
                this.nodesWithoutLoc.push({index: n.index, ID: n._id})
            }
            if ( !nodeLocSet && n._lat && n._lon) nodeLocSet = true;
        })

        if (callback) callback();
    }

    /**
     * Calls drawLeafletMapNodes() which removes all previous nodes from map, updates _j, _theta, _jlat, _jlon for each node
     */
    drawNodes(rerollNodes=true) {
        if (!this.lmap) {
            return;
        }

        this.drawLeafletMapNodes(rerollNodes);
    }

    /**
     * Updates map by redrawing nodes
     * @param rerollNodes if true rerolls node positioning
     */
    drawLeafletMapNodes(rerollNodes) {
        this.clearAutoExpandedSelectedClusters();

        if (rerollNodes) {
            this.clearAllMarkers();
            this.rerollNodes();
        } else {
            this.layers.removeNodes();
        }

        this.mapNodeMarkersById = Object.create(null);

        if (!this.commonService.session.style.widgets['map-node-show']) return;

        // if (this.SelectedGeospatialTypeVariable == 'On') {
        //     //this.drawLeafletMapNodesGeospatial();
        //     console.error('implement drawLeafletMapNodesGeospatial')
        // }
        // else {
            this.drawLeafletMapNodesList();
        //}
    }

    /*drawLeafletMapNodesGeospatial() {
        const opacity = 1 - this.commonService.session.style.widgets['map-node-transparency'];
        const selectedColor = this.commonService.session.style.widgets['selected-color'];

        this.colorIterator.reset();

        const features: Layer[] = [];

        let markers = this.getGeospatialNodes();
        markers = markers.filter(x => x.locationDetail && (x.locationDetail.Name === 'Residence' || (x.locationDetail.Date >= this.dateFilterRangeDates[0] &&
            x.locationDetail.Date <= this.dateFilterRangeDates[1])));

        markers.forEach(m => {
            m.on('mouseover', (e) => this.showNodeTooltip(e))
                .on('mouseout', (e) => this.hideTooltip())
                .on('click', (e) => this.clickHandler(e));

            features.push(m);
        })

        if (this.commonService.session.style.widgets['map-collapsing-on']) {
            this.layers.markerClusterGroup.addLayers(features);
        } else {
            this.layers.featureGroup = featureGroup(features);
            this.lmap.addLayer(this.layers.featureGroup);
        }
    } */

    /**
     * Draws nodes on the map
     */
    drawLeafletMapNodesList() {
        var selectedColor = this.commonService.session.style.widgets['selected-color'],
            mapOpacity = this.commonService.clampStyleAlpha(1 - this.commonService.session.style.widgets['map-node-transparency']);

        var features: Layer[] = [];

        var n = this.nodes.length;
        for (var i = 0; i < n; i++) {
            var d = this.nodes[i];
            if (!this.hasValidMapCoordinates(d) || d.visible === false) continue;

            const nodeStyle = this.commonService.getNodeFillStyle(d);
            const nodeFillOpacity = this.commonService.clampStyleAlpha(nodeStyle.alpha * mapOpacity);
            const strokeColor = d.selected ? selectedColor : '#000000';
            const strokeWidth = d.selected ? 36 : 16;
            const shapeKey = this.getNodeShapeKey(d);

            let nodeMarker: MarkerWithData = L.marker(L.latLng(d._jlat, d._jlon), {
                icon: this.getMapNodeIcon(shapeKey, nodeStyle.color, strokeColor, d.selected, nodeFillOpacity),
                opacity: 1,
                fillOpacity: nodeFillOpacity,
                fillColor: nodeStyle.color,
                color: strokeColor,
                weight: strokeWidth
            } as L.MarkerOptions & { fillOpacity: number; fillColor: string; color: string; weight: number });

            nodeMarker.data = d;
            if (d._id !== undefined) {
                this.mapNodeMarkersById[String(d._id)] = nodeMarker;
            }

            nodeMarker
                .on('mouseover', (e) => this.showNodeTooltip(e))
                .on('mouseout', (e) => this.hideTooltip())
                .on('click', (e) => this.clickHandler(e));


            features.push(nodeMarker);
        }

        if (this.commonService.session.style.widgets['map-collapsing-on']) {
            this.layers.markerClusterGroup.addLayers(features);
        } else {
            this.layers.featureGroup = featureGroup(features);
            this.lmap.addLayer(this.layers.featureGroup);
        }
    }

    /**
     * Draws links on the map
    */
    drawLinks() {
        this.layers.removeLinks();
    
        if (!this.commonService.session.style.widgets['map-link-show']) return;
    
        var lcv = this.commonService.session.style.widgets['link-color-variable'];
        var opacity = 1 - this.commonService.session.style.widgets['map-link-transparency'];
        var links = this.commonService.getVisibleLinks();
        const getLinkColorValue = (link: any) => {
            const value = link[lcv];
            if (String(lcv).toLowerCase() === 'origin' && Array.isArray(value)) {
                return value.length > 1 ? 'Duo-Link' : this.commonService.normalizeStyleCategoryValue(value[0]);
            }
            return this.commonService.normalizeStyleCategoryValue(value);
        };
    
        var features: Layer[] = [];
    
        links.forEach((d) => {
            if (!d.visible) return;
            var source = this.nodes.find(node => node._id == d.source && node.visible);
            var target = this.nodes.find(node => node._id == d.target && node.visible);
    
            if (source && target && source._jlat && source._jlon && target._jlat && target._jlon) {
                // Handle multiple origins
                if (lcv == 'origin' && d.origin && d.origin.length > 1) {
                    let color1 = this.commonService.temp.style.linkColorMap(d.origin[0]);
                    let color2 = this.commonService.temp.style.linkColorMap(d.origin[1]);
    
                    let dashPattern1 = '10, 10';
                    let dashPattern2 = '0, 10, 10, 0';
    
                    let polyline1 = L.polyline([[source._jlat, source._jlon], [target._jlat, target._jlon]], {
                        color: color1,
                        dashArray: dashPattern1,
                        opacity: opacity
                    });
    
                    let polyline2: PolyLineWithData = L.polyline([[source._jlat, source._jlon], [target._jlat, target._jlon]], {
                        color: color2,
                        dashArray: dashPattern2,
                        opacity: opacity
                    });

                    polyline2.data = d;
                    polyline2
                        .on('mouseover', (e) => this.showLinkTooltip(e))
                        .on('mouseout', (e) => this.hideTooltip())
    
                    features.push(polyline1);
                    features.push(polyline2);
                } else {
                    // Single origin handling
                    const connectorLine: PolyLineWithData = L.polyline([
                        [source._jlat, source._jlon],
                        [target._jlat, target._jlon]
                    ], {
                        color: lcv === "None" ?
                            this.commonService.session.style.widgets['link-color'] :
                            this.commonService.temp.style.linkColorMap(getLinkColorValue(d)),
                        opacity: opacity
                    });
    
                    connectorLine.data = d;

                    connectorLine
                        .on('mouseover', (e) =>this.showLinkTooltip(e))
                        .on('mouseout', (e) => this.hideTooltip())
    
                    features.push(connectorLine);
                }
            }
        });
    
        this.layers.links = featureGroup(features);
        if (this.lmap != undefined) this.lmap.addLayer(this.layers.links);

        if (this.commonService.session.style.widgets['map-node-show']) {
            if (this.commonService.session.style.widgets['map-collapsing-on']) {
                // Not sure how to move collapsed nodes to front with bringToFront(), they use markerClusterGroup (from leaflet.markercluster plugin) instead of featureGroup (from base leaflet)
                this.drawNodes(false)
            } else {
                this.layers.featureGroup.bringToFront();
            }
        }
    }
    

    showNodeTooltip(e) {
        var data = e.target.data;
        var locationData = e.target.locationDetail;
        var variable = this.commonService.session.style.widgets['map-node-tooltip-variable'];
        if (variable !== 'None' && (data[variable] || data[variable] == 0)) {

            let htmlText = data[variable];
            if (locationData) {
                htmlText = `<p><strong>${variable}:</strong> ${data[variable]}</p>`
                htmlText += `<p><strong>Location:</strong> ${locationData.Name}</p>`
                htmlText += `<p><strong>Address:</strong> ${locationData.FullAddress}</p>`
            }
            d3.select(this.mapTooltip)
                .html(htmlText)
                .style('position', 'absolute')
                .style('left', (e.containerPoint.x - 50) + 'px')
                .style('top', (e.containerPoint.y - 50) + 'px')
                .style('visibility', 'visible')
                .style('z-index', 1001)
                .transition().duration(100)
                .style('opacity', 1)
                ;
        }
    }

    showLinkTooltip(e) {
        var d = e.target.data;
        var v = this.commonService.session.style.widgets['map-link-tooltip-variable'];
        if (v !== 'None' && (d[v] || d[v] == 0)) {
            const formattedValue = v === 'distance'
                ? this.commonService.formatDisplayedDistanceValue(d[v], 'distance')
                : d[v];
            d3.select(this.mapTooltip)
                .html(formattedValue)
                .style('position', 'absolute')
                .style('left', (e.containerPoint.x - 50) + 'px')
                .style('top', (e.containerPoint.y - 50) + 'px')
                .style('z-index', 1001)
                .transition().duration(100)
                .style('opacity', 1);
        }
    }

    hideTooltip() {
        var tooltip = d3.select(this.mapTooltip);
        tooltip
            .transition().duration(100)
            .style('opacity', 0)
            .on('end', () => tooltip.style('z-index', -1));
    }

    /**
     * Clicking on a node updates that status of node selected properties. Other nodes will be unselected and then triggers a document node-selected event
     */
    clickHandler(e) {
        const node = e.sourceTarget.data;
        if (!node || !node._id) return;
      
        const nodes = this.commonService.session.data.nodes;
        const filtered = this.commonService.session.data.nodeFilteredValues;
      
        const setSelected = (id: string, selected: boolean) => {
          nodes.filter(n => n._id === id).forEach(n => (n.selected = selected));
          filtered.filter(n => n._id === id).forEach(n => (n.selected = selected));
        };
      
        const ctrl = e.originalEvent && e.originalEvent.ctrlKey;
      
        if (!ctrl) {
          // single select
          nodes.forEach(n => setSelected(n._id, n._id === node._id));
        } else {
          // toggle multi-select
          const cur = nodes.find(n => n._id === node._id)?.selected === true;
          setSelected(node._id, !cur);
        }
      
        $(document).trigger('node-selected');
      }
      

    /**
     * @returns an array [X, Y] of the position of mouse relative to alignment view. Global position (i.e. d3.event.pageX) doesn't work for a dashboard
     */  
    getRelativeMousePosition(e) {
        let rect = document.querySelector('mapcomponent').getBoundingClientRect();
        let X = e.pageX - rect.left;
        let Y = e.pageY - rect.top; 
        return [X, Y];
    }

    resetStack() {
        //Tile Layers, in reverse order:
        if (this.layers.satellite && this.commonService.session.style.widgets['map-satellite-show']) this.layers.satellite.bringToBack();
        if (this.layers.basemap && this.commonService.session.style.widgets['map-basemap-show']) this.layers.basemap.bringToBack();

        //Background Layers, in order:
        if (this.layers.countries && this.commonService.session.style.widgets['map-countries-show']) this.layers.countries.bringToFront();
        if (this.layers.states && this.commonService.session.style.widgets['map-states-show']) this.layers.states.bringToFront();
        if (this.layers.counties && this.commonService.session.style.widgets['map-counties-show']) this.layers.counties.bringToFront();
        if (this.layers.countriesLabels && this.commonService.session.style.widgets['map-countries-labels-show']) this.layers.countriesLabels.bringToFront();
        if (this.layers.statesLabels && this.commonService.session.style.widgets['map-states-labels-show']) this.layers.statesLabels.bringToFront();
        if (this.layers.countiesLabels && this.commonService.session.style.widgets['map-counties-labels-show']) this.layers.countiesLabels.bringToFront();

        //User Layers:
        Object.keys(this.layers)
            .filter(l => !this.commonService.includes(['countries', 'states', 'counties', 'countriesLabels', 'statesLabels', 'countiesLabels', 'satellite', 'basemap', 'links', 'nodes'], l))
            .forEach(l => this.layers[l].bringToFront());


        //Foreground Layers, in order:
        if (this.layers.links && this.commonService.session.style.widgets['map-link-show']) this.layers.links.bringToFront();
        if (this.layers.nodes() && this.commonService.session.style.widgets['map-node-show']) {
            if (this.commonService.session.style.widgets['map-collapsing-on']) {
                this.drawNodes(false); //This did not work with clusters//this.layers.nodes().bringToFront();
            } else {
                this.layers.nodes().bringToFront()
            }
        }
    }

    rerollCheck() {
        return this.nodes.some(node => node._theta == undefined || node._j == undefined);
    }

    /**
     * Reroll and jitter function for an individual node
     */
    rerollNodeAndJitter(node) {
        node._theta = this.commonService.r01() * Math.PI * 2;
        node._j = this.commonService.r01();

        var v = this.commonService.session.style.widgets['map-node-jitter'] == -2 ? 0 : Math.pow(2, this.commonService.session.style.widgets['map-node-jitter']);
        node._jlon = parseFloat(node._lon) + v * node._j * Math.cos(node._theta);
        node._jlat = parseFloat(node._lat) + v * node._j * Math.sin(node._theta);
    }

    /**
     * Updates _jlon and _jLat for each node using _theta & _j values from each node and widget['map-node-jitter']
     */
    jitter() {
        //debugger;
        var v = this.commonService.session.style.widgets['map-node-jitter'] == -2 ? 0 : Math.pow(2, this.commonService.session.style.widgets['map-node-jitter']);
        var n = this.nodes.length;
        for (var i = 0; i < n; i++) {
            var node = this.nodes[i];
            this.nodes[i]._jlon = parseFloat(node._lon) + v * node._j * Math.cos(node._theta);
            this.nodes[i]._jlat = parseFloat(node._lat) + v * node._j * Math.sin(node._theta);
        }
    }

    /**
     * Updates _theta and _j for each node. Then calls jitter() which uses those values to upate _jlon and _jlat
     */
    rerollNodes() {
        //debugger;

        this.nodes.forEach((node) => {
            node._theta = this.commonService.r01() * Math.PI * 2;
            node._j = this.commonService.r01();
        });
        this.jitter();
    }

    /*makeGeoJSON() {
        var features = [];
        var jitter = this.commonService.session.style.widgets['map-node-jitter'] > 0;
        this.nodes.forEach((d) => {
            if (d._lat && d._lon) {
                features.push({
                    type: 'Feature',
                    geometry: {
                        type: 'Point',
                        coordinates: jitter ? [d._lon + d._jlon, d._lat + d._jlat] : [d._lon, d._lat]
                    },
                    properties: d
                });
            }
        });
        this.commonService.getVisibleLinks().forEach((d) => {
            if (!d.visible) return;
            var source = this.nodes.find(node => node.id == d.source);
            var target = this.nodes.find(node => node.id == d.target);
            if (source && target) {
                if (source._lat && source._lon && target._lat && target._lon) {
                    features.push({
                        type: 'Feature',
                        geometry: {
                            type: 'LineString',
                            coordinates: jitter ? [
                                [source._lon + source._jlon, source._lat + source._jlat],
                                [target._lon + target._jlon, target._lat + target._jlat]
                            ] : [
                                [source._lon, source._lat],
                                [target._lon, target._lat]
                            ]
                        },
                        properties: d
                    });
                }
            }
        });
        return {
            type: 'FeatureCollection',
            features: features
        };
    } */

    openSettings() {
        this.NodeMapSettingsExportDialogSettings.setVisibility(true);
    }

    openExport() {
        this.ShowGEOMapExportPane = true;

        this.visuals.gisMap.NodeMapSettingsExportDialogSettings.setStateBeforeExport();
    }

    showPopup() {
        this.showPopupMessage = true;
    }

    openCenter() {
        this.centerMap();
    }

    //openPinAllNodes() {

    //}

    openRefreshScreen() {
        this.centerMap();
    }

    openSelectDataSetScreen() {

    }

    updateNodeColors() {
        this.drawNodes(false);
        this.drawLinks();
    }

    updateNodeShapes() {
        this.mapNodeIconCache = {};
        this.drawNodes(false);
        this.drawLinks();
    }

    updateVisualization() {
        this.drawNodes(false);
        this.drawLinks();
    }

    refreshDistanceDisplayFormat() {
        this.drawLinks();
    }

    applyStyleFileSettings() {
        this.loadSettings();
        //this.widgets = (window as any).context.commonService.session.style.widgets;
    }

    updateLinkColor() {
        this.drawLinks();
    }

    onRecallSession() {
        // nothing to do here. loadSettings is called when the map is ready (onMapReady)
    }

    onLoadNewData() {
        this.onDataChange(undefined);
    }

    onFilterDataChange() {
        this.onDataChange(undefined);
    }

    loadSettings() {
        this.ensureMapAutoExpandSelectedSetting();
        this.ensureAdminLabelWidgetDefaults();

        // Components | Layers
        this.SelectedBasemapTypeVariable = this.commonService.session.style.widgets['map-basemap-show'] ? 'Show' : 'Hide';
        this.SelectedSatelliteTypeVariable = this.commonService.session.style.widgets['map-satellite-show'] ? 'Show' : 'Hide';
        this.SelectedCountriesTypeVariable = this.getAdminLayerSelection('countries');
        this.SelectedStatesTypeVariable = this.getAdminLayerSelection('states');
        this.SelectedCountiesTypeVariable = this.getAdminLayerSelection('counties');

        // Apply the saved widget state without rewriting sibling layer preferences during reload.
        this.onBasemapChange(this.SelectedBasemapTypeVariable, true);
        this.onSatelliteChange(this.SelectedSatelliteTypeVariable, true);
        this.onCountriesShowHidChange(this.SelectedCountriesTypeVariable);
        this.onStatesShowHideChange(this.SelectedStatesTypeVariable);
        this.onCountiesShowHideChange(this.SelectedCountiesTypeVariable);

        //Components|Network|Nodes
        this.SelectedNodesTypeVariable = this.commonService.session.style.widgets['map-node-show'] ? 'Show' : 'Hide';
        this.onMapNodeShowHideChange(this.SelectedNodesTypeVariable);

        //Components|Network|Links
        this.SelectedLinksTypeVariable = this.commonService.session.style.widgets['map-link-show'] ? 'Show' : 'Hide';
        this.onMapLinksShowHideChange(this.SelectedLinksTypeVariable);

        //Data|Geospatial
        //this.SelectedGeospatialTypeVariable = this.commonService.session.style.widgets['map-geospatial-type-on'] ? 'On' : 'Off';
        //this.onGeospatialTypeChange(undefined);

        //Data|Latitude
        this.SelectedLatitude = this.commonService.session.style.widgets['map-field-lat'];

        //Data|Longitude
        this.SelectedLongitude = this.commonService.session.style.widgets['map-field-lon'];

        //Data|Census Tract
        this.SelectedCensusTract = this.commonService.session.style.widgets['map-field-tract'];

        //Data|Zipcode
        this.SelectedZipCode = this.commonService.session.style.widgets['map-field-zipcode'];

        //Data|County
        this.SelectedCounty = this.commonService.session.style.widgets['map-field-county'];

        //Data|State
        this.SelectedState = this.commonService.session.style.widgets['map-field-state'];

        //Data|Country
        this.SelectedCountry = this.commonService.session.style.widgets['map-field-country'];

        //Data|Country
        //this.SelectedResidenceAddress = this.commonService.session.style.widgets['map-field-residence-address'];

        //Data|Country
        //this.SelectedVenueAddress = this.commonService.session.style.widgets['map-field-venue-address'];

        //Data|Country
        //this.SelectedExposureAddress = this.commonService.session.style.widgets['map-field-exposure-address'];

        this.onDataChange(undefined);


        //Nodes|Collapsing
        this.SelectedNodeCollapsingTypeVariable = this.commonService.session.style.widgets['map-collapsing-on'] ? 'On' : 'Off';
        this.onNodeCollapsingChange(undefined);

        //Nodes|Auto-Expand Selected
        this.SelectedNodeAutoExpandTypeVariable = this.commonService.session.style.widgets['map-auto-expand-selected'] ? 'On' : 'Off';
        this.onNodeAutoExpandChange(undefined);

        //Nodes|Transparency
        this.SelectedNodeTransparencyVariable = this.commonService.session.style.widgets['map-node-transparency'];
        this.onNodeTransparencyChange(this.SelectedNodeTransparencyVariable);

        // Node|Size
        this.mapNodeIconSize = this.commonService.session.style.widgets['map-node-size']
        //Nodes|Jitter
        this.SelectedNodeJitterVariable = this.commonService.session.style.widgets['map-node-jitter'];
        this.onNodeJitterChange(this.SelectedNodeJitterVariable);

        //Nodes|Tooltip
        this.SelectedNodeTooltipVariable = this.commonService.session.style.widgets['map-node-tooltip-variable'];
        this.onNodeToolTipChange(this.SelectedNodeTooltipVariable);


        //Links|Transparency
        this.SelectedLinkTransparencyVariable = this.commonService.session.style.widgets['map-link-transparency'];
        this.onLinkTransparencyChange(this.SelectedLinkTransparencyVariable);

        //Links|Tooltip
        this.SelectedLinkTooltipVariable = this.commonService.session.style.widgets['map-link-tooltip-variable'];
        this.onLinkToolTipChange(this.SelectedLinkTooltipVariable);
    }

    ngOnDestroy(): void {
        this.autoExpandRequestId++;
        this.destroy$.next();
        this.destroy$.complete();
    }
}

//MOVE CLASSES TO NEW FILE
class MapLayers {
    basemap!: TileLayer;
    satellite!: TileLayer;
    featureGroup: FeatureGroup = featureGroup();
    markerClusterGroup: MarkerClusterGroup = markerClusterGroup();
    links: FeatureGroup = featureGroup();
    countries: L.GeoJSON<any> = geoJSON();
    states: L.GeoJSON<any> = geoJSON();
    counties: L.GeoJSON<any> = geoJSON();
    countriesLabels: FeatureGroup = featureGroup();
    statesLabels: FeatureGroup = featureGroup();
    countiesLabels: FeatureGroup = featureGroup();
    autoExpandedSelectedNodes: FeatureGroup = featureGroup();

    public nodes(): FeatureGroup | MarkerClusterGroup {
        if (this.markerClusterGroup.getLayers().length) return this.markerClusterGroup;
        return this.featureGroup;
    }

    public removeNodes() {
        this.autoExpandedSelectedNodes.clearLayers();
        this.featureGroup.clearLayers();
        this.markerClusterGroup.clearLayers();
    }

    public removeLinks() {
        this.links.clearLayers();
    }
}

class MarkerWithData extends L.Marker<any>{
    public data?: any;
    public locationDetail?: LocationDetail
    public nodeType?: 'Residence' | 'Exposure' | 'Venue';
}

class CircleWithData extends L.CircleMarker<any>{
    public data?: any;
}

class PolyLineWithData extends L.Polyline {
    public data?: any;
}

interface VenueLocationDetail {
    City: string,
    Country: string,
    County: string,
    DateOfContact: string,
    FullAddress: string,
    Latitude: number,
    Longitude: number,
    Name: string,
    State: string,
    StreetAddress: string,
    Zipcode: string
}

interface LocationDetail {
    FullAddress: string | undefined,
    Name: string | undefined,
    Latitude: number | undefined,
    Longitude: number | undefined,
    Date: Date | undefined
}

export namespace MapComponent {
    export const componentTypeName = 'Map';
}
