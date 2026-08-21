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
import { tileLayer, latLng, marker, icon, polyline, circle, polygon, Map, MapOptions, Layer, Marker, markerClusterGroup, MarkerClusterGroupOptions, MarkerClusterGroup, circleMarker, PathOptions, featureGroup, FeatureGroup, TileLayer, geoJSON, imageOverlay, ImageOverlay } from 'leaflet';
import { DialogSettings } from '../../helperClasses/dialogSettings';
import { MicobeTraceNextPluginEvents } from '../../helperClasses/interfaces';
import { MicrobeTraceNextVisuals } from '../../microbe-trace-next-plugin-visuals';
//import { ColorIterator } from '../../helperClasses/colorIterator';
import * as _ from 'lodash';
import { BaseComponentDirective } from '@app/base-component.directive';
import { ComponentContainer } from 'golden-layout';
import { CommonStoreService } from '@app/contactTraceCommonServices/common-store.services';
import { ExportService, ExportOptions } from '@app/contactTraceCommonServices/export.service';
import { getMapNodeShapeDataUri, isCustomNodeShape as isCustomNodeIconShape, resolveNodeShapeForNode, resolveNodeShapeKey } from '@app/contactTraceCommonServices/node-shapes';
import { createGlobalSettingsDialogRequest, GlobalSettingsDialogRequest } from '@app/helperClasses/globalSettingsDialogRequest';
import {
    FloorplanBoundary,
    FloorplanBoundaryPoint,
    cleanFloorplanPolygonVertices,
    floorplanAppendedSegmentHasIntersection,
    floorplanClosingSegmentHasIntersection,
    normalizeFloorplanBoundaryLabel,
    randomPointInFloorplanPolygon,
    validateFloorplanPolygon
} from './floorplan-boundaries';

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
type FloorplanBackgroundKind = 'geojson' | 'image' | 'none';
type FloorplanBackgroundMode = 'Show' | 'Overlay' | 'Hide';
type ManualPositionMode = 'floorplan' | 'map';
type FloorplanBoundaryEditorMode = 'idle' | 'polygon' | 'freehand' | 'labeling' | 'editing' | 'renaming';

interface FloorplanBaseLayerState {
    basemap: boolean;
    satellite: boolean;
    countries: string;
    states: string;
    counties: string;
}

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

    @Output() DisplayGlobalSettingsDialogEvent = new EventEmitter<GlobalSettingsDialogRequest>();
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

    UserGeoJSONTypes: any = [
        { label: 'Show', value: 'Show' },
        { label: 'Hide', value: 'Hide' }
    ];
    SelectedUserGeoJSONTypeVariable: string = "Hide";
    userGeoJSONFileName: string = "";
    userGeoJSONFeatureCount: number = 0;
    userGeoJSONError: string = "";
    FloorplanBackgroundTypes: any = [
        { label: 'Show', value: 'Show' },
        { label: 'Overlay', value: 'Overlay' },
        { label: 'Hide', value: 'Hide' }
    ];
    SelectedFloorplanBackgroundTypeVariable: FloorplanBackgroundMode = "Hide";
    floorplanBackgroundFileName: string = "";
    floorplanBackgroundSummary: string = "";
    floorplanBackgroundError: string = "";
    SelectedUserGeoJSONColorVariable: string = "#3388ff";
    SelectedUserGeoJSONTransparencyVariable: number = 0.25;
    UserGeoJSONLabelFields: SelectItem[] = [{ label: "None", value: "None" }];
    SelectedUserGeoJSONLabelField: string = "None";
    FloorplanImageTypes: any = [
        { label: 'Show', value: 'Show' },
        { label: 'Hide', value: 'Hide' }
    ];
    SelectedFloorplanImageTypeVariable: string = "Hide";
    floorplanImageFileName: string = "";
    floorplanImageInfo: string = "";
    floorplanImageError: string = "";
    ManualPositionTypes: any = [
        { label: 'On', value: 'On' },
        { label: 'Off', value: 'Off' }
    ];
    SelectedManualPositionTypeVariable: string = "Off";
    manualPositionNodeList: SelectItem[] = [{ label: "None", value: "None" }];
    SelectedManualPositionNodeId: string = "None";
    manualPositionPlacedCount: number = 0;
    manualPositionUnplacedCount: number = 0;
    manualPositionClearableCount: number = 0;
    manualPositionSelectedCanClear: boolean = false;
    manualPositionMessage: string = "";
    FloorplanBoundaryVisibilityTypes: any = [
        { label: 'Show', value: 'Show' },
        { label: 'Hide', value: 'Hide' }
    ];
    SelectedFloorplanBoundaryVisibility: string = "Show";
    SelectedFloorplanBoundaryField: string = "None";
    floorplanBoundaries: FloorplanBoundary[] = [];
    floorplanBoundaryEditorMode: FloorplanBoundaryEditorMode = 'idle';
    floorplanBoundaryDraftLabel: string = "";
    floorplanBoundaryMessage: string = "";
    floorplanBoundaryError: string = "";
    floorplanBoundaryWarning: string = "";
    floorplanBoundaryMatchedNodeCount: number = 0;
    floorplanBoundaryUnmatchedNodeCount: number = 0;
    floorplanBoundarySelectedVertexIndex: number = -1;

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
    private readonly customMapBackgroundPaneName: string = 'map-custom-background';
    private readonly customMapLabelPaneName: string = 'map-custom-labels';
    private readonly mapNetworkLinkPaneName: string = 'map-network-links';
    private readonly userGeoJSONLayerNameFallback: string = 'Custom GeoJSON';
    private readonly userGeoJSONDefaultColor: string = '#3388ff';
    private readonly userGeoJSONDefaultTransparency: number = 0.25;
    private readonly floorplanImageLayerNameFallback: string = 'Floorplan Image';
    private readonly floorplanImageMaxCoordinate: number = 80;
    private readonly webMercatorMaxLatitude: number = 85.0511287798066;
    private readonly degreesToRadians: number = Math.PI / 180;
    private readonly radiansToDegrees: number = 180 / Math.PI;
    private readonly manualFloorplanXField: string = 'map_floorplan_x';
    private readonly manualFloorplanYField: string = 'map_floorplan_y';
    private readonly manualMapLatitudeField: string = 'map_manual_latitude';
    private readonly manualMapLongitudeField: string = 'map_manual_longitude';
    private readonly floorplanBoundaryIdField: string = 'map_floorplan_boundary_id';
    private readonly floorplanBoundaryXField: string = 'map_floorplan_boundary_x';
    private readonly floorplanBoundaryYField: string = 'map_floorplan_boundary_y';
    private readonly floorplanBoundaryPaneName: string = 'map-floorplan-boundaries';
    private readonly floorplanBoundaryFreehandMinimumPixelDistance: number = 4;
    private readonly noManualPositionNodeValue: string = 'None';
    private readonly manualMapClickHandler = (event: L.LeafletMouseEvent) => this.onManualPositionMapClick(event);
    private readonly floorplanBoundaryMapClickHandler = (event: L.LeafletMouseEvent) => this.onFloorplanBoundaryMapClick(event);
    private readonly floorplanBoundaryMapDoubleClickHandler = (event: L.LeafletMouseEvent) => this.onFloorplanBoundaryMapDoubleClick(event);
    private readonly floorplanBoundaryFreehandPointerDownHandler = (event: PointerEvent) => this.onFloorplanBoundaryFreehandPointerDown(event);
    private readonly floorplanBoundaryFreehandPointerMoveHandler = (event: PointerEvent) => this.onFloorplanBoundaryFreehandPointerMove(event);
    private readonly floorplanBoundaryFreehandPointerUpHandler = (event: PointerEvent) => this.onFloorplanBoundaryFreehandPointerUp(event);
    private readonly floorplanBoundaryFreehandPointerCancelHandler = () => {
        this.cancelFloorplanBoundaryDrawing();
        this.cdref.detectChanges();
    };

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
    private floorplanBoundaryDraftVertices: FloorplanBoundaryPoint[] = [];
    private floorplanBoundaryEditingId: string | null = null;
    private floorplanBoundaryPreviewLayer: L.Polyline<any> | null = null;
    private floorplanBoundaryClosingGuideLayer: L.Polyline<any> | null = null;
    private floorplanBoundaryRejectedEdgeLayer: L.Polyline<any> | null = null;
    private floorplanBoundaryDrawingVertexHandles: FeatureGroup = featureGroup();
    private floorplanBoundaryVertexHandles: FeatureGroup = featureGroup();
    private floorplanBoundaryLayersById: Record<string, L.Polygon> = Object.create(null);
    private floorplanBoundaryFreehandPointerId: number | null = null;
    private floorplanBoundaryFreehandLastPoint: L.Point | null = null;
    private floorplanBoundaryMapDraggingWasEnabled: boolean = false;
    private floorplanBoundaryDoubleClickZoomWasEnabled: boolean = false;

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
        private exportService: ExportService) {

            super(elRef.nativeElement);

        this.visuals = commonService.visuals;
        this.visuals.gisMap = this;
    }


    ngOnInit() {

        if (!this.NodeMapSettingsExportDialogSettings) {
            this.NodeMapSettingsExportDialogSettings = new DialogSettings('#map-settings-pane', false);
        }

        this.IsDataAvailable = (this.commonService.session.data.nodes.length == 0 ? false : true);

        this.FieldList = [];

        this.FieldList.push({ label: "None", value: "None" });
        this.commonService.session.data['nodeFields'].map((d, i) => {
            if (this.isManualPositionField(d)) return;

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
            that.syncManualPositionSelectionFromNodeSelection();
            that.refreshManualPositionControls();
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
                if (!that.hasValidMapCoordinates(node)) {
                    that.rerollNodeAndJitter(node);
                }
            })

            that.drawNodes(false);
            that.drawLinks();
            that.refreshManualPositionControls();
            //that.centerMap();
        });
        
        this.networkUpdatedSubscription = this.store.networkUpdated$
            .pipe(takeUntil(this.destroy$))
            .subscribe(newPruned => {
                console.log('--- Map updated', newPruned, this.viewActive);
                if (this.viewActive && newPruned) {
                    this.refreshManualPositionControls();
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
        this.ensureMapLayerPanes();
        this.ensureAdminLabelPane();
        this.lmap.off('click', this.manualMapClickHandler);
        this.lmap.on('click', this.manualMapClickHandler);
        this.ensureFloorplanBoundaryPane();
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
        if (!this.lmap) {
            return;
        }

        const bounds = this.getVisibleMapBounds();
        if (!bounds || !bounds.isValid()) {
            return;
        }

        const padding = this.commonService.session.style.widgets['map-collapsing-on'] ? 28 : 18;
        this.lmap.fitBounds(bounds, {
            animate: false,
            padding: [padding, padding]
        });
    }

    private getVisibleMapBounds(): L.LatLngBounds | null {
        let bounds: L.LatLngBounds | null = null;
        const extendBounds = (candidate?: L.LatLngBounds) => {
            if (!candidate || !candidate.isValid()) {
                return;
            }
            bounds = bounds ? bounds.extend(candidate) : candidate;
        };

        if (this.layers.nodes().getLayers().length > 0) {
            extendBounds(this.layers.nodes().getBounds());
        }

        if (this.isUserGeoJSONLayerVisible() && this.layers.userGeoJSON.getLayers().length > 0) {
            extendBounds(this.layers.userGeoJSON.getBounds());
        }

        if (this.isFloorplanImageLayerVisible() && this.layers.floorplanImage) {
            extendBounds(this.layers.floorplanImage.getBounds());
        }

        return bounds;
    }

    private isFiniteMapCoordinate(value: any): boolean {
        if (value === null || value === undefined) {
            return false;
        }
        if (typeof value === 'string' && value.trim() === '') {
            return false;
        }

        const numericValue = Number(value);
        return Number.isFinite(numericValue);
    }

    private shouldProjectFloorplanImageCoordinates(): boolean {
        return this.getShownFloorplanBackgroundKind() === 'image';
    }

    private clampWebMercatorLatitude(latitude: number): number {
        return Math.max(-this.webMercatorMaxLatitude, Math.min(this.webMercatorMaxLatitude, latitude));
    }

    private floorplanImageYToDisplayLatitude(y: number): number {
        const yCoordinate = Number(y);
        if (!Number.isFinite(yCoordinate)) {
            return yCoordinate;
        }

        const mercator = yCoordinate * this.degreesToRadians;
        const geographicLatitude = (2 * Math.atan(Math.exp(mercator)) - (Math.PI / 2)) * this.radiansToDegrees;
        return this.clampWebMercatorLatitude(geographicLatitude);
    }

    private displayLatitudeToFloorplanImageY(latitude: number): number {
        const displayLatitude = Number(latitude);
        if (!Number.isFinite(displayLatitude)) {
            return displayLatitude;
        }

        const clampedLatitude = this.clampWebMercatorLatitude(displayLatitude);
        const mercator = Math.log(Math.tan((Math.PI / 4) + (clampedLatitude * this.degreesToRadians / 2)));
        return mercator * this.radiansToDegrees;
    }

    private getRenderedMapLatLng(latitude: any, longitude: any): L.LatLng {
        const numericLatitude = Number(latitude);
        const numericLongitude = Number(longitude);
        const displayLatitude = this.shouldProjectFloorplanImageCoordinates()
            ? this.floorplanImageYToDisplayLatitude(numericLatitude)
            : numericLatitude;

        return L.latLng(displayLatitude, numericLongitude);
    }

    private shouldUseManualFloorplanPosition(): boolean {
        const session = this.commonService.session;
        return (!!session.data.geoJSON && session.style.widgets['map-user-geojson-show'] === true)
            || (!!session.data.floorplanImage && session.style.widgets['map-floorplan-image-show'] === true);
    }

    hasFloorplanBackgroundForManualPositioning(): boolean {
        return !!this.commonService.session.data.geoJSON || !!this.commonService.session.data.floorplanImage;
    }

    isFloorplanBackgroundShownForManualPositioning(): boolean {
        return this.shouldUseManualFloorplanPosition();
    }

    private getShownFloorplanBackgroundKind(): FloorplanBackgroundKind {
        const session = this.commonService.session;
        if (session.data.floorplanImage && session.style.widgets['map-floorplan-image-show'] === true) {
            return 'image';
        }
        if (session.data.geoJSON && session.style.widgets['map-user-geojson-show'] === true) {
            return 'geojson';
        }
        return 'none';
    }

    private getLoadedFloorplanBackgroundKind(): FloorplanBackgroundKind {
        const shownKind = this.getShownFloorplanBackgroundKind();
        if (shownKind !== 'none') {
            return shownKind;
        }

        const session = this.commonService.session;
        if (session.data.floorplanImage && !session.data.geoJSON) {
            return 'image';
        }
        if (session.data.geoJSON && !session.data.floorplanImage) {
            return 'geojson';
        }
        if (session.data.floorplanImage && session.data.geoJSON) {
            return 'image';
        }
        return 'none';
    }

    private syncFloorplanBackgroundControls(): void {
        const shownKind = this.getShownFloorplanBackgroundKind();
        const loadedKind = this.getLoadedFloorplanBackgroundKind();
        const activeKind = shownKind !== 'none' ? shownKind : loadedKind;
        const selectedMode = shownKind === 'none' ? "Hide" : this.getFloorplanBackgroundMode();

        this.SelectedFloorplanBackgroundTypeVariable = selectedMode;
        this.SelectedUserGeoJSONTypeVariable = this.commonService.session.style.widgets['map-user-geojson-show'] ? selectedMode : "Hide";
        this.SelectedFloorplanImageTypeVariable = this.commonService.session.style.widgets['map-floorplan-image-show'] ? selectedMode : "Hide";

        if (activeKind === 'geojson') {
            this.floorplanBackgroundFileName = this.userGeoJSONFileName
                || this.commonService.session.data.geoJSONLayerName
                || (this.commonService.session.data.geoJSON ? this.userGeoJSONLayerNameFallback : "");
            this.floorplanBackgroundSummary = this.userGeoJSONFeatureCount ? `${this.userGeoJSONFeatureCount} features` : "";
            return;
        }

        if (activeKind === 'image') {
            this.floorplanBackgroundFileName = this.floorplanImageFileName
                || this.commonService.session.data.floorplanImageLayerName
                || (this.commonService.session.data.floorplanImage ? this.floorplanImageLayerNameFallback : "");
            this.floorplanBackgroundSummary = this.floorplanImageInfo || "";
            return;
        }

        this.floorplanBackgroundFileName = "";
        this.floorplanBackgroundSummary = "";
    }

    private getFloorplanBackgroundMode(): FloorplanBackgroundMode {
        const widgets = this.commonService.session.style.widgets;
        const mode = widgets['map-floorplan-background-mode'];
        if (mode === 'Show' || mode === 'Overlay' || mode === 'Hide') {
            return mode;
        }

        return widgets['map-user-geojson-show'] || widgets['map-floorplan-image-show'] ? 'Show' : 'Hide';
    }

    private setFloorplanBackgroundMode(mode: FloorplanBackgroundMode): void {
        this.commonService.session.style.widgets['map-floorplan-background-mode'] = mode;
        this.SelectedFloorplanBackgroundTypeVariable = mode;
    }

    private setFloorplanBackgroundError(message: string): void {
        this.floorplanBackgroundError = message;
        this.userGeoJSONError = "";
        this.floorplanImageError = "";
    }

    private clearFloorplanBackgroundError(): void {
        this.floorplanBackgroundError = "";
        this.userGeoJSONError = "";
        this.floorplanImageError = "";
    }

    private isManualPositionField(field: string): boolean {
        return [
            this.manualFloorplanXField,
            this.manualFloorplanYField,
            this.manualMapLatitudeField,
            this.manualMapLongitudeField,
            this.floorplanBoundaryIdField,
            this.floorplanBoundaryXField,
            this.floorplanBoundaryYField
        ].includes(field);
    }

    private getFloorplanBoundaries(): FloorplanBoundary[] {
        return Array.isArray(this.commonService.session.data.floorplanBoundaries)
            ? this.commonService.session.data.floorplanBoundaries
            : [];
    }

    private getFloorplanBoundaryById(id: any): FloorplanBoundary | undefined {
        return this.getFloorplanBoundaries().find(boundary => String(boundary.id) === String(id));
    }

    private getFloorplanBoundaryForNode(node: any): FloorplanBoundary | undefined {
        const field = this.commonService.session.data.floorplanBoundaryField;
        if (!node || !field || field === 'None') {
            return undefined;
        }
        const normalizedValue = normalizeFloorplanBoundaryLabel(node[field]);
        if (!normalizedValue) {
            return undefined;
        }
        return this.getFloorplanBoundaries().find(boundary => normalizeFloorplanBoundaryLabel(boundary.label) === normalizedValue);
    }

    private hasStoredFloorplanBoundaryPosition(node: any): boolean {
        return !!node
            && this.isFiniteMapCoordinate(node[this.floorplanBoundaryXField])
            && this.isFiniteMapCoordinate(node[this.floorplanBoundaryYField])
            && !!node[this.floorplanBoundaryIdField];
    }

    private hasActiveFloorplanBoundaryPosition(node: any): boolean {
        if (!this.isFloorplanImageLayerVisible() || !this.hasStoredFloorplanBoundaryPosition(node)) {
            return false;
        }
        const matchingBoundary = this.getFloorplanBoundaryForNode(node);
        return !!matchingBoundary && String(matchingBoundary.id) === String(node[this.floorplanBoundaryIdField]);
    }

    private applyFloorplanBoundaryPositions(): void {
        if (!this.isFloorplanImageLayerVisible()) {
            return;
        }
        this.nodes.forEach(node => {
            if (!this.hasActiveFloorplanBoundaryPosition(node)) {
                return;
            }
            node._lon = Number(node[this.floorplanBoundaryXField]);
            node._lat = Number(node[this.floorplanBoundaryYField]);
        });
    }

    private getManualPositionMode(): ManualPositionMode {
        return this.shouldUseManualFloorplanPosition() ? 'floorplan' : 'map';
    }

    private getManualPositionTargetLabel(): string {
        return this.getManualPositionMode() === 'floorplan' ? 'floorplan' : 'map';
    }

    private getManualPositionCoordinateLabel(): string {
        return this.getManualPositionMode() === 'floorplan' ? 'x/y' : 'map location';
    }

    private isManualPositioningActive(): boolean {
        return this.SelectedManualPositionTypeVariable === "On"
            && this.canUseManualPositioning();
    }

    private hasManualFloorplanPosition(node: any): boolean {
        return !!node
            && this.isFiniteMapCoordinate(node[this.manualFloorplanXField])
            && this.isFiniteMapCoordinate(node[this.manualFloorplanYField]);
    }

    private hasManualMapPosition(node: any): boolean {
        return !!node
            && this.isFiniteMapCoordinate(node[this.manualMapLatitudeField])
            && this.isFiniteMapCoordinate(node[this.manualMapLongitudeField]);
    }

    private hasManualPosition(node: any): boolean {
        return this.getManualPositionMode() === 'floorplan'
            ? this.hasManualFloorplanPosition(node)
            : this.hasManualMapPosition(node);
    }

    private applyManualFloorplanPositions(): void {
        this.nodes.forEach(node => {
            if (!this.hasManualFloorplanPosition(node)) {
                return;
            }

            node._lon = Number(node[this.manualFloorplanXField]);
            node._lat = Number(node[this.manualFloorplanYField]);
        });
    }

    private applyManualMapPositions(): void {
        this.nodes.forEach(node => {
            if (!this.hasManualMapPosition(node)) {
                return;
            }

            node._lat = Number(node[this.manualMapLatitudeField]);
            node._lon = Number(node[this.manualMapLongitudeField]);
        });
    }

    private applyManualPositions(): void {
        this.applyFloorplanBoundaryPositions();
        if (this.getManualPositionMode() === 'floorplan') {
            this.applyManualFloorplanPositions();
            return;
        }

        this.applyManualMapPositions();
    }

    private shouldDisableJitterForNode(node: any): boolean {
        return this.hasManualPosition(node) || this.hasActiveFloorplanBoundaryPosition(node);
    }

    private useExactRenderedNodePosition(node: any): void {
        node._jlon = parseFloat(node._lon);
        node._jlat = parseFloat(node._lat);
    }

    private ensureManualFloorplanFields(): void {
        if (!Array.isArray(this.commonService.session.data.nodeFields)) {
            this.commonService.session.data.nodeFields = [];
        }

        [this.manualFloorplanXField, this.manualFloorplanYField].forEach(field => {
            if (!this.commonService.session.data.nodeFields.includes(field)) {
                this.commonService.session.data.nodeFields.push(field);
            }
        });
    }

    private ensureManualMapFields(): void {
        if (!Array.isArray(this.commonService.session.data.nodeFields)) {
            this.commonService.session.data.nodeFields = [];
        }

        [this.manualMapLatitudeField, this.manualMapLongitudeField].forEach(field => {
            if (!this.commonService.session.data.nodeFields.includes(field)) {
                this.commonService.session.data.nodeFields.push(field);
            }
        });
    }

    private ensureManualPositionFields(): void {
        if (this.getManualPositionMode() === 'floorplan') {
            this.ensureManualFloorplanFields();
            return;
        }

        this.ensureManualMapFields();
    }

    private ensureFloorplanBoundaryPositionFields(): void {
        if (!Array.isArray(this.commonService.session.data.nodeFields)) {
            this.commonService.session.data.nodeFields = [];
        }
        [this.floorplanBoundaryIdField, this.floorplanBoundaryXField, this.floorplanBoundaryYField].forEach(field => {
            if (!this.commonService.session.data.nodeFields.includes(field)) {
                this.commonService.session.data.nodeFields.push(field);
            }
        });
    }

    private clearFloorplanBoundaryPosition(node: any): void {
        this.updateMatchingNodeRecords(node, candidate => {
            candidate[this.floorplanBoundaryIdField] = null;
            candidate[this.floorplanBoundaryXField] = null;
            candidate[this.floorplanBoundaryYField] = null;
        });
    }

    private setFloorplanBoundaryPosition(node: any, boundary: FloorplanBoundary): void {
        const point = randomPointInFloorplanPolygon(boundary.vertices, () => this.commonService.r01());
        this.ensureFloorplanBoundaryPositionFields();
        this.updateMatchingNodeRecords(node, candidate => {
            candidate[this.floorplanBoundaryIdField] = boundary.id;
            candidate[this.floorplanBoundaryXField] = point.x;
            candidate[this.floorplanBoundaryYField] = point.y;
        });
    }

    private reconcileFloorplanBoundaryPlacements(
        rerollBoundaryIds: Set<string> = new Set<string>(),
        rerollAll: boolean = false,
        refresh: boolean = true
    ): void {
        const nodes = Array.isArray(this.commonService.session.data.nodes)
            ? this.commonService.session.data.nodes.slice()
            : [];
        const field = this.commonService.session.data.floorplanBoundaryField;
        const boundariesAvailable = !!this.commonService.session.data.floorplanImage
            && !!field
            && field !== 'None'
            && this.getFloorplanBoundaries().length > 0;

        nodes.forEach(node => {
            const boundary = boundariesAvailable ? this.getFloorplanBoundaryForNode(node) : undefined;
            if (!boundary) {
                if (this.hasStoredFloorplanBoundaryPosition(node)) {
                    this.clearFloorplanBoundaryPosition(node);
                }
                return;
            }

            const storedBoundaryId = String(node[this.floorplanBoundaryIdField] ?? '');
            const needsPosition = !this.hasStoredFloorplanBoundaryPosition(node)
                || storedBoundaryId !== String(boundary.id)
                || rerollAll
                || rerollBoundaryIds.has(String(boundary.id));
            if (needsPosition) {
                this.setFloorplanBoundaryPosition(node, boundary);
            }
        });

        this.refreshFloorplanBoundaryCounts();
        if (refresh) {
            this.refreshRenderedCoordinates(false);
        }
    }

    private clearAllFloorplanBoundaryPositions(): void {
        const nodes = Array.isArray(this.commonService.session.data.nodes)
            ? this.commonService.session.data.nodes.slice()
            : [];
        nodes.forEach(node => {
            if (this.hasStoredFloorplanBoundaryPosition(node)) {
                this.clearFloorplanBoundaryPosition(node);
            }
        });
        this.refreshFloorplanBoundaryCounts();
    }

    private refreshFloorplanBoundaryCounts(): void {
        const nodes = Array.isArray(this.commonService.session.data.nodes)
            ? this.commonService.session.data.nodes
            : [];
        const field = this.commonService.session.data.floorplanBoundaryField;
        if (!field || field === 'None') {
            this.floorplanBoundaryMatchedNodeCount = 0;
            this.floorplanBoundaryUnmatchedNodeCount = 0;
            return;
        }

        this.floorplanBoundaryMatchedNodeCount = nodes.filter(node => !!this.getFloorplanBoundaryForNode(node)).length;
        this.floorplanBoundaryUnmatchedNodeCount = nodes.length - this.floorplanBoundaryMatchedNodeCount;
    }

    private getManualPositionNodes(): any[] {
        return this.commonService.getVisibleNodes()
            .filter(node => node && node.visible !== false && node._id !== undefined);
    }

    canUseManualPositioning(): boolean {
        return this.floorplanBoundaryEditorMode === 'idle' && this.getManualPositionNodes().length > 0;
    }

    private getManualPositionNodeLabel(node: any): string {
        const positionState = this.hasPlacedMapPosition(node) ? "placed" : "unplaced";
        return `${node._id} (${positionState})`;
    }

    private findRenderedManualPositionNode(node: any): any {
        if (!node || node._id === undefined || !Array.isArray(this.nodes)) {
            return node;
        }

        return this.nodes.find(candidate => String(candidate?._id) === String(node._id)) || node;
    }

    private hasPlacedMapPosition(node: any): boolean {
        const renderedNode = this.findRenderedManualPositionNode(node);
        return !!renderedNode
            && this.isFiniteMapCoordinate(renderedNode._lat)
            && this.isFiniteMapCoordinate(renderedNode._lon);
    }

    private refreshNodesWithoutLocationData(): void {
        this.nodesWithoutLoc = [];
        this.nodes.forEach(node => {
            if (!this.isFiniteMapCoordinate(node._lat) || !this.isFiniteMapCoordinate(node._lon)) {
                this.nodesWithoutLoc.push({index: node.index, ID: node._id});
            }
        });
    }

    private findManualPositionNodeById(nodeId: string): any {
        if (!nodeId || nodeId === this.noManualPositionNodeValue) {
            return undefined;
        }

        return this.getManualPositionNodes().find(node => String(node._id) === String(nodeId));
    }

    private updateMatchingNodeRecords(node: any, update: (candidate: any) => void): void {
        if (!node || node._id === undefined) {
            return;
        }

        const id = String(node._id);
        [
            this.commonService.session.data.nodes,
            this.commonService.session.data.nodeFilteredValues,
            this.nodes
        ].forEach(collection => {
            if (!Array.isArray(collection)) {
                return;
            }

            collection
                .filter(candidate => String(candidate?._id) === id)
                .forEach(update);
        });
    }

    private persistManualPosition(node: any, latlng: L.LatLng): void {
        if (!node || !latlng) {
            return;
        }

        const latitude = Number(latlng.lat);
        const longitude = Number(latlng.lng);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            return;
        }

        this.ensureManualPositionFields();
        this.updateMatchingNodeRecords(node, candidate => {
            let storedLatitude = latitude;
            if (this.getManualPositionMode() === 'floorplan') {
                storedLatitude = this.shouldProjectFloorplanImageCoordinates()
                    ? this.displayLatitudeToFloorplanImageY(latitude)
                    : latitude;
                candidate[this.manualFloorplanXField] = longitude;
                candidate[this.manualFloorplanYField] = storedLatitude;
            } else {
                candidate[this.manualMapLatitudeField] = latitude;
                candidate[this.manualMapLongitudeField] = longitude;
            }

            candidate._lon = longitude;
            candidate._lat = storedLatitude;
            candidate._jlon = longitude;
            candidate._jlat = storedLatitude;
        });
        this.refreshNodesWithoutLocationData();
    }

    private clearManualPosition(node: any): void {
        this.updateMatchingNodeRecords(node, candidate => {
            if (this.getManualPositionMode() === 'floorplan') {
                candidate[this.manualFloorplanXField] = null;
                candidate[this.manualFloorplanYField] = null;
            } else {
                candidate[this.manualMapLatitudeField] = null;
                candidate[this.manualMapLongitudeField] = null;
            }
        });
    }

    private refreshRenderedCoordinates(centerMap: boolean = false): void {
        if (!this.lmap) {
            this.refreshManualPositionControls();
            return;
        }

        this.clearAllMarkers();
        this.layers.removeLinks();
        this.nodes = this.commonService.getVisibleNodes();

        this.matchCoordinates(() => {
            if (this.rerollCheck()) {
                this.drawNodes();
            } else {
                this.jitter();
                this.drawNodes(false);
            }
            this.drawLinks();
            this.resetStack();
            this.refreshManualPositionControls();
            if (centerMap) {
                this.centerMap();
            }
            this.autoExpandSelectedNode();
        }, false);
    }

    refreshManualPositionControls(): void {
        const manualNodes = this.getManualPositionNodes();
        const placedNodes = manualNodes.filter(node => this.hasPlacedMapPosition(node));
        const notPlacedNodes = manualNodes.filter(node => !this.hasPlacedMapPosition(node));
        const clearableNodes = manualNodes.filter(node => this.hasManualPosition(node));

        this.manualPositionPlacedCount = placedNodes.length;
        this.manualPositionUnplacedCount = notPlacedNodes.length;
        this.manualPositionClearableCount = clearableNodes.length;
        this.manualPositionNodeList = [
            { label: "None", value: this.noManualPositionNodeValue },
            ...manualNodes.map(node => ({
                label: this.getManualPositionNodeLabel(node),
                value: String(node._id)
            }))
        ];

        const selectedNode = this.findManualPositionNodeById(this.SelectedManualPositionNodeId);
        const selectedNone = this.SelectedManualPositionNodeId === this.noManualPositionNodeValue;
        if (!selectedNode && !selectedNone) {
            this.SelectedManualPositionNodeId = this.noManualPositionNodeValue;
        }
        this.manualPositionSelectedCanClear = !!selectedNode && this.hasManualPosition(selectedNode);

        if (!this.canUseManualPositioning() && this.SelectedManualPositionTypeVariable === "On") {
            this.SelectedManualPositionTypeVariable = "Off";
        }
    }

    private refreshManualPositionControlsFromExternalCallback(): void {
        this.cdref.detectChanges();
        window.setTimeout(() => {
            this.refreshManualPositionControls();
            this.cdref.detectChanges();
        }, 0);
    }

    private syncManualPositionSelectionFromNodeSelection(): void {
        if (!this.isManualPositioningActive()) {
            return;
        }

        const selectedNodes = this.commonService.session.data.nodes
            .filter(node => node?.selected === true && node?._id !== undefined);
        if (selectedNodes.length !== 1) {
            return;
        }

        this.SelectedManualPositionNodeId = String(selectedNodes[0]._id);
    }

    onManualPositioningChange(e): void {
        if (e === 'On' && this.floorplanBoundaryEditorMode !== 'idle') {
            this.SelectedManualPositionTypeVariable = 'Off';
            this.manualPositionMessage = 'Finish or cancel boundary editing before positioning nodes manually.';
            return;
        }
        this.SelectedManualPositionTypeVariable = e;

        if (e === "On") {
            this.ensureManualPositionFields();
            this.refreshManualPositionControls();
            const selectedNode = this.findManualPositionNodeById(this.SelectedManualPositionNodeId);
            if (!selectedNode) {
                this.manualPositionMessage = `Select a node, then click the ${this.getManualPositionTargetLabel()} or drag its marker to set ${this.getManualPositionCoordinateLabel()}.`;
            }
        } else {
            this.manualPositionMessage = "";
            this.SelectedManualPositionNodeId = this.noManualPositionNodeValue;
        }

        this.refreshManualPositionControls();
        if (this.lmap) {
            this.drawNodes(false);
            this.drawLinks();
            this.resetStack();
        }
    }

    onManualPositionNodeChange(nodeId: string): void {
        this.SelectedManualPositionNodeId = nodeId || this.noManualPositionNodeValue;
        const node = this.findManualPositionNodeById(this.SelectedManualPositionNodeId);

        if (!node) {
            this.manualPositionMessage = `No node selected. Choose a node before clicking the ${this.getManualPositionTargetLabel()}.`;
            this.redrawManualPositionMarkers();
            return;
        }

        this.refreshManualPositionControls();
        this.manualPositionMessage = this.hasPlacedMapPosition(node)
            ? `${node._id} has ${this.getManualPositionCoordinateLabel()}. Click the ${this.getManualPositionTargetLabel()} or drag its marker to move it.`
            : `${node._id} is unplaced. Click the ${this.getManualPositionTargetLabel()} to set ${this.getManualPositionCoordinateLabel()}.`;
        this.redrawManualPositionMarkers();
    }

    private selectManualPositionNode(node: any, redraw: boolean = true): void {
        if (!node || node._id === undefined) {
            this.SelectedManualPositionNodeId = this.noManualPositionNodeValue;
            this.manualPositionMessage = `No node selected. Choose a node before clicking the ${this.getManualPositionTargetLabel()}.`;
        } else {
            this.SelectedManualPositionNodeId = String(node._id);
            this.manualPositionMessage = this.hasPlacedMapPosition(node)
                ? `${node._id} has ${this.getManualPositionCoordinateLabel()}. Click the ${this.getManualPositionTargetLabel()} or drag its marker to move it.`
                : `${node._id} is unplaced. Click the ${this.getManualPositionTargetLabel()} to set ${this.getManualPositionCoordinateLabel()}.`;
        }

        this.refreshManualPositionControls();
        if (redraw) {
            this.redrawManualPositionMarkers();
        }
    }

    selectNextUnplacedManualPositionNode(): void {
        const node = this.getManualPositionNodes().find(candidate => !this.hasPlacedMapPosition(candidate));
        if (!node) {
            this.manualPositionMessage = `All visible nodes have ${this.getManualPositionCoordinateLabel()}.`;
            return;
        }

        this.selectManualPositionNode(node);
    }

    clearSelectedManualPosition(): void {
        const node = this.findManualPositionNodeById(this.SelectedManualPositionNodeId);
        if (!node) {
            this.manualPositionMessage = `No node selected.`;
            return;
        }

        this.clearManualPosition(node);
        this.manualPositionMessage = `Cleared ${this.getManualPositionCoordinateLabel()} for ${node._id}.`;
        this.refreshRenderedCoordinates(false);
    }

    clearAllManualPositions(): void {
        this.getManualPositionNodes().forEach(node => this.clearManualPosition(node));
        this.manualPositionMessage = `Cleared ${this.getManualPositionCoordinateLabel()} for all visible nodes.`;
        this.refreshRenderedCoordinates(false);
    }

    private redrawManualPositionMarkers(): void {
        if (!this.lmap || !this.isManualPositioningActive()) {
            return;
        }

        this.drawNodes(false);
        this.drawLinks();
        this.resetStack();
    }

    private onManualPositionMarkerClick(e): void {
        if (!this.isManualPositioningActive()) {
            return;
        }

        const node = e.sourceTarget && e.sourceTarget.data
            ? e.sourceTarget.data
            : e.target && e.target.data;
        if (!node || node._id === undefined) {
            return;
        }

        if (e.originalEvent) {
            e.originalEvent.preventDefault();
            e.originalEvent.stopPropagation();
        }

        if (String(this.SelectedManualPositionNodeId) === String(node._id)) {
            this.SelectedManualPositionNodeId = this.noManualPositionNodeValue;
            this.manualPositionMessage = `No node selected. Choose a node before clicking the ${this.getManualPositionTargetLabel()}.`;
        } else {
            this.selectManualPositionNode(node, false);
        }

        this.refreshManualPositionControls();
        this.redrawManualPositionMarkers();
    }

    private onManualPositionMarkerDragEnd(e): void {
        if (!this.isManualPositioningActive()) {
            return;
        }

        const marker = e.target as MarkerWithData;
        if (!marker || !marker.data) {
            return;
        }

        this.selectManualPositionNode(marker.data, false);
        this.persistManualPosition(marker.data, marker.getLatLng());
        this.manualPositionMessage = `Updated ${this.getManualPositionCoordinateLabel()} for ${marker.data._id}.`;
        this.drawNodes(false);
        this.drawLinks();
        this.refreshManualPositionControlsFromExternalCallback();
    }

    private onManualPositionMapClick(e: L.LeafletMouseEvent): void {
        if (!this.isManualPositioningActive()) {
            return;
        }

        const originalTarget = e.originalEvent ? e.originalEvent.target as HTMLElement : null;
        if (originalTarget && originalTarget.closest && originalTarget.closest('.leaflet-marker-icon')) {
            return;
        }

        const node = this.findManualPositionNodeById(this.SelectedManualPositionNodeId);
        if (!node) {
            this.manualPositionMessage = `Select a node before clicking the ${this.getManualPositionTargetLabel()}.`;
            return;
        }

        this.persistManualPosition(node, e.latlng);
        this.manualPositionMessage = `Set ${this.getManualPositionCoordinateLabel()} for ${node._id}.`;
        this.drawNodes(false);
        this.drawLinks();
        this.resetStack();
        this.refreshManualPositionControlsFromExternalCallback();
    }

    onFloorplanBackgroundFileSelected(event: Event): void {
        const input = event.target as HTMLInputElement;
        const file = input?.files?.[0];
        if (!file) {
            return;
        }

        this.clearFloorplanBackgroundError();
        const lowerName = file.name.toLowerCase();
        const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(lowerName);

        if (isImage) {
            this.readFloorplanImageFile(file);
        } else {
            this.readGeoJSONBackgroundFile(file);
        }

        input.value = "";
    }

    private readGeoJSONBackgroundFile(file: File): void {
        const reader = new FileReader();
        reader.onerror = () => {
            this.setFloorplanBackgroundError(`Unable to read ${file.name}.`);
            this.syncFloorplanBackgroundControls();
            this.cdref.detectChanges();
        };
        reader.onload = () => {
            try {
                const data = JSON.parse(String(reader.result || ""));
                this.validateUserGeoJSON(data);
                this.setUserGeoJSON(data, file.name);
                this.syncFloorplanBackgroundControls();
                this.refreshRenderedCoordinates(true);
                this.cdref.detectChanges();
            } catch (error) {
                const message = error instanceof Error ? error.message : `Unable to parse ${file.name}.`;
                this.setFloorplanBackgroundError(message);
                this.syncFloorplanBackgroundControls();
                this.cdref.detectChanges();
            }
        };
        reader.readAsText(file);
    }

    private readFloorplanImageFile(file: File): void {
        const reader = new FileReader();
        reader.onerror = () => {
            this.setFloorplanBackgroundError(`Unable to read ${file.name}.`);
            this.syncFloorplanBackgroundControls();
            this.cdref.detectChanges();
        };
        reader.onload = () => {
            const dataUrl = String(reader.result || "");
            const image = new Image();
            image.onload = () => {
                const width = image.naturalWidth || image.width || 1;
                const height = image.naturalHeight || image.height || 1;
                const bounds = this.createFloorplanImageBounds(width, height);
                this.setFloorplanImage(dataUrl, file.name, bounds, width, height);
                this.syncFloorplanBackgroundControls();
                this.refreshRenderedCoordinates(true);
                this.cdref.detectChanges();
            };
            image.onerror = () => {
                this.setFloorplanBackgroundError(`Unable to load ${file.name} as an image.`);
                this.syncFloorplanBackgroundControls();
                this.cdref.detectChanges();
            };
            image.src = dataUrl;
        };
        reader.readAsDataURL(file);
    }

    onFloorplanBackgroundLayerChange(e: FloorplanBackgroundMode): void {
        const nextMode: FloorplanBackgroundMode = e === 'Show' || e === 'Overlay' ? e : 'Hide';
        const previousMode = this.getFloorplanBackgroundMode();
        const loadedKind = this.getLoadedFloorplanBackgroundKind();

        if (nextMode !== 'Hide' && loadedKind === 'none') {
            this.setFloorplanBackgroundError("Upload a GeoJSON or image background before showing this layer.");
            this.setFloorplanBackgroundMode('Hide');
            this.syncFloorplanBackgroundControls();
            return;
        }

        if (nextMode === 'Show' && previousMode !== 'Show') {
            this.captureFloorplanBaseLayerState();
        } else if (previousMode === 'Show' && nextMode !== 'Show') {
            this.restoreFloorplanBaseLayerState();
        }

        this.setFloorplanBackgroundMode(nextMode);
        if (nextMode === 'Overlay') {
            this.ensureUnderlyingMapForOverlay();
        }

        if (loadedKind === 'image' && nextMode !== 'Hide') {
            this.onFloorplanImageChange(nextMode);
        } else if (loadedKind === 'geojson' && nextMode !== 'Hide') {
            this.onUserGeoJSONChange(nextMode);
        } else {
            this.onUserGeoJSONChange("Hide");
            this.onFloorplanImageChange("Hide");
        }

        this.syncFloorplanBackgroundControls();
        this.refreshRenderedCoordinates(false);
    }

    onUserGeoJSONChange(e) {
        this.ensureUserGeoJSONWidgetDefaults();
        this.ensureFloorplanImageWidgetDefaults();
        this.SelectedUserGeoJSONTypeVariable = e;

        if (e === "Show" || e === "Overlay") {
            if (!this.commonService.session.data.geoJSON) {
                this.commonService.session.style.widgets['map-user-geojson-show'] = false;
                this.SelectedUserGeoJSONTypeVariable = "Hide";
                this.setFloorplanBackgroundError("Upload a GeoJSON or image background before showing this layer.");
                this.removeUserGeoJSONLayer();
                this.refreshManualPositionControls();
                this.syncFloorplanBackgroundControls();
                return;
            }

            this.commonService.session.style.widgets['map-user-geojson-show'] = true;
            this.clearFloorplanBackgroundError();
            this.hideFloorplanImageForSiblingBackground();
            if (e === "Show") {
                this.hideOtherBackgroundLayersForUserFloorplan();
            }
            this.addUserGeoJSONLayerToMap();
            this.syncFloorplanBackgroundControls();
            this.resetStack();
            this.refreshManualPositionControls();
        } else {
            this.commonService.session.style.widgets['map-user-geojson-show'] = false;
            this.SelectedUserGeoJSONTypeVariable = "Hide";
            this.removeUserGeoJSONLayer();
            this.syncFloorplanBackgroundControls();
            this.refreshManualPositionControls();
        }
    }

    onFloorplanImageChange(e) {
        this.ensureFloorplanImageWidgetDefaults();
        this.ensureUserGeoJSONWidgetDefaults();
        this.SelectedFloorplanImageTypeVariable = e;

        if (e === "Show" || e === "Overlay") {
            if (!this.commonService.session.data.floorplanImage) {
                this.commonService.session.style.widgets['map-floorplan-image-show'] = false;
                this.SelectedFloorplanImageTypeVariable = "Hide";
                this.setFloorplanBackgroundError("Upload a GeoJSON or image background before showing this layer.");
                this.removeFloorplanImageLayer();
                this.refreshManualPositionControls();
                this.syncFloorplanBackgroundControls();
                return;
            }

            this.commonService.session.style.widgets['map-floorplan-image-show'] = true;
            this.clearFloorplanBackgroundError();
            this.hideUserGeoJSONForSiblingBackground();
            if (e === "Show") {
                this.hideOtherBackgroundLayersForUserFloorplan();
            }
            this.addFloorplanImageLayerToMap();
            this.rebuildFloorplanBoundaryLayers();
            this.addFloorplanBoundaryLayersToMap();
            this.syncFloorplanBackgroundControls();
            this.resetStack();
            this.refreshManualPositionControls();
        } else {
            this.cancelFloorplanBoundaryDrawing(false, false);
            this.commonService.session.style.widgets['map-floorplan-image-show'] = false;
            this.SelectedFloorplanImageTypeVariable = "Hide";
            this.removeFloorplanBoundaryLayersFromMap();
            this.removeFloorplanImageLayer();
            this.syncFloorplanBackgroundControls();
            this.refreshManualPositionControls();
        }
    }

    centerFloorplanBackground() {
        this.centerMap();
    }

    clearFloorplanBackground() {
        if (this.getFloorplanBackgroundMode() === 'Show') {
            this.restoreFloorplanBaseLayerState();
        }
        this.setFloorplanBackgroundMode('Hide');
        this.cancelFloorplanBoundaryDrawing(false, false);
        this.clearUserGeoJSONBackgroundData();
        this.clearFloorplanImageBackgroundData();
        this.clearFloorplanBackgroundError();
        this.SelectedManualPositionTypeVariable = "Off";
        this.refreshRenderedCoordinates(false);
        this.syncFloorplanBackgroundControls();
    }

    private setUserGeoJSON(data: any, fileName: string) {
        this.clearFloorplanImageBackgroundData();
        this.clearFloorplanBackgroundError();
        this.commonService.session.data.geoJSON = data;
        this.commonService.session.data.geoJSONLayerName = fileName || this.userGeoJSONLayerNameFallback;
        this.commonService.session.style.widgets['map-user-geojson-label-field'] = 'None';
        this.SelectedUserGeoJSONLabelField = 'None';
        this.userGeoJSONFileName = this.commonService.session.data.geoJSONLayerName;
        this.userGeoJSONFeatureCount = this.countGeoJSONFeatures(data);
        this.userGeoJSONError = "";
        this.rebuildUserGeoJSONLayer();
        this.onFloorplanBackgroundLayerChange("Show");
    }

    private setFloorplanImage(dataUrl: string, fileName: string, bounds: [[number, number], [number, number]], width: number, height: number) {
        this.clearFloorplanBoundaryData(false);
        this.clearUserGeoJSONBackgroundData();
        this.clearFloorplanBackgroundError();
        this.commonService.session.data.floorplanImage = dataUrl;
        this.commonService.session.data.floorplanImageLayerName = fileName || this.floorplanImageLayerNameFallback;
        this.commonService.session.data.floorplanImageBounds = bounds;
        this.commonService.session.data.floorplanImageWidth = width;
        this.commonService.session.data.floorplanImageHeight = height;
        this.floorplanImageFileName = this.commonService.session.data.floorplanImageLayerName;
        this.floorplanImageInfo = this.formatFloorplanImageInfo(width, height, bounds);
        this.floorplanImageError = "";
        this.rebuildFloorplanImageLayer();
        this.onFloorplanBackgroundLayerChange("Show");
    }

    private restoreUserGeoJSONLayer() {
        const data = this.commonService.session.data.geoJSON;
        this.userGeoJSONFileName = this.commonService.session.data.geoJSONLayerName || "";
        this.userGeoJSONFeatureCount = data ? this.countGeoJSONFeatures(data) : 0;
        this.userGeoJSONError = "";

        if (!data) {
            this.removeUserGeoJSONLayer();
            return;
        }

        try {
            this.validateUserGeoJSON(data);
        } catch (error) {
            const message = error instanceof Error ? error.message : "Unable to restore GeoJSON background.";
            this.commonService.session.data.geoJSON = null;
            this.commonService.session.data.geoJSONLayerName = "";
            this.commonService.session.style.widgets['map-user-geojson-show'] = false;
            this.SelectedUserGeoJSONTypeVariable = "Hide";
            this.userGeoJSONFileName = "";
            this.userGeoJSONFeatureCount = 0;
            this.userGeoJSONError = message;
            this.removeUserGeoJSONLayer();
            return;
        }

        this.rebuildUserGeoJSONLayer();
    }

    private restoreFloorplanImageLayer() {
        const data = this.commonService.session.data.floorplanImage;
        this.floorplanImageFileName = this.commonService.session.data.floorplanImageLayerName || "";
        this.floorplanImageInfo = this.formatFloorplanImageInfo(
            this.commonService.session.data.floorplanImageWidth,
            this.commonService.session.data.floorplanImageHeight,
            this.getFloorplanImageBounds()
        );
        this.floorplanImageError = "";

        if (!data) {
            this.removeFloorplanImageLayer();
            return;
        }

        this.rebuildFloorplanImageLayer();
    }

    private rebuildUserGeoJSONLayer() {
        this.removeUserGeoJSONLayer();
        this.ensureMapLayerPanes();
        const data = this.commonService.session.data.geoJSON;
        this.refreshUserGeoJSONLabelFields(data);
        let canRenderGeoJSON = false;
        if (data) {
            try {
                this.validateUserGeoJSON(data);
                canRenderGeoJSON = true;
            } catch {
                canRenderGeoJSON = false;
            }
        }

        this.layers.userGeoJSON = canRenderGeoJSON
            ? geoJSON(data, {
                pane: this.customMapBackgroundPaneName,
                style: () => this.getUserGeoJSONPathStyle(),
                onEachFeature: (feature, layer) => this.bindUserGeoJSONLabel(feature, layer),
                pointToLayer: (_feature, latlng) => circleMarker(latlng, {
                    radius: 4,
                    ...this.getUserGeoJSONPathStyle()
                })
            })
            : geoJSON();
    }

    private getUserGeoJSONPathStyle(): any {
        const color = this.getUserGeoJSONColor();
        const fillOpacity = 1 - this.getUserGeoJSONTransparency();
        return {
            pane: this.customMapBackgroundPaneName,
            color,
            weight: 1,
            fillColor: color,
            fillOpacity,
            opacity: 1
        };
    }

    private getUserGeoJSONColor(): string {
        const color = String(this.commonService.session.style.widgets['map-user-geojson-color'] || '');
        return /^#[0-9a-f]{6}$/i.test(color) ? color : this.userGeoJSONDefaultColor;
    }

    private getUserGeoJSONTransparency(): number {
        const transparency = Number(this.commonService.session.style.widgets['map-user-geojson-transparency']);
        return Number.isFinite(transparency)
            ? Math.max(0, Math.min(1, transparency))
            : this.userGeoJSONDefaultTransparency;
    }

    onUserGeoJSONColorChange(color: string): void {
        const normalizedColor = /^#[0-9a-f]{6}$/i.test(String(color))
            ? String(color).toLowerCase()
            : this.userGeoJSONDefaultColor;
        this.SelectedUserGeoJSONColorVariable = normalizedColor;
        this.commonService.session.style.widgets['map-user-geojson-color'] = normalizedColor;
        this.applyUserGeoJSONStyle();
    }

    onUserGeoJSONTransparencyChange(transparency: number): void {
        const normalizedTransparency = Number.isFinite(Number(transparency))
            ? Math.max(0, Math.min(1, Number(transparency)))
            : this.userGeoJSONDefaultTransparency;
        this.SelectedUserGeoJSONTransparencyVariable = normalizedTransparency;
        this.commonService.session.style.widgets['map-user-geojson-transparency'] = normalizedTransparency;
        this.applyUserGeoJSONStyle();
    }

    getUserGeoJSONTransparencyPercent(): number {
        return Math.round(this.SelectedUserGeoJSONTransparencyVariable * 100);
    }

    private applyUserGeoJSONStyle(): void {
        if (this.layers.userGeoJSON) {
            this.layers.userGeoJSON.setStyle(() => this.getUserGeoJSONPathStyle());
        }
        this.resetStack();
    }

    private getUserGeoJSONFeatures(data: any): any[] {
        if (data?.type === 'FeatureCollection') {
            return Array.isArray(data.features) ? data.features : [];
        }
        return data?.type === 'Feature' ? [data] : [];
    }

    private refreshUserGeoJSONLabelFields(data: any): void {
        const propertyNames = new Set<string>();
        this.getUserGeoJSONFeatures(data).forEach(feature => {
            const properties = feature?.properties;
            if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
                return;
            }
            Object.keys(properties).forEach(property => propertyNames.add(property));
        });

        const sortedProperties = Array.from(propertyNames).sort((left, right) => left.localeCompare(right));
        this.UserGeoJSONLabelFields = [
            { label: 'None', value: 'None' },
            ...sortedProperties.map(property => ({ label: property, value: property }))
        ];

        const storedField = String(this.commonService.session.style.widgets['map-user-geojson-label-field'] || 'None');
        this.SelectedUserGeoJSONLabelField = propertyNames.has(storedField) ? storedField : 'None';
        this.commonService.session.style.widgets['map-user-geojson-label-field'] = this.SelectedUserGeoJSONLabelField;
    }

    onUserGeoJSONLabelFieldChange(field: string): void {
        const availableFields = new Set(this.UserGeoJSONLabelFields.map(option => String(option.value)));
        this.SelectedUserGeoJSONLabelField = availableFields.has(String(field)) ? String(field) : 'None';
        this.commonService.session.style.widgets['map-user-geojson-label-field'] = this.SelectedUserGeoJSONLabelField;
        this.applyUserGeoJSONLabels();
    }

    private applyUserGeoJSONLabels(): void {
        if (!this.layers.userGeoJSON) {
            return;
        }

        this.layers.userGeoJSON.eachLayer((layer: any) => {
            if (typeof layer.unbindTooltip === 'function') {
                layer.unbindTooltip();
            }
            this.bindUserGeoJSONLabel(layer.feature, layer);
        });
        this.resetStack();
    }

    private bindUserGeoJSONLabel(feature: any, layer: any): void {
        const field = this.SelectedUserGeoJSONLabelField;
        if (!layer || typeof layer.bindTooltip !== 'function' || !field || field === 'None') {
            return;
        }

        const label = this.formatUserGeoJSONLabel(feature?.properties?.[field]);
        if (!label) {
            return;
        }

        layer.bindTooltip(this.escapeMapLabelHtml(label), {
            pane: this.customMapLabelPaneName,
            permanent: true,
            direction: 'center',
            className: 'map-user-geojson-label map-admin-label map-admin-label-states',
            interactive: false,
            opacity: 1
        });
    }

    private formatUserGeoJSONLabel(value: any): string {
        if (value === null || value === undefined) {
            return '';
        }
        if (typeof value === 'object') {
            try {
                return JSON.stringify(value);
            } catch {
                return String(value);
            }
        }
        return String(value).trim();
    }

    private addUserGeoJSONLayerToMap() {
        if (!this.lmap || !this.commonService.session.data.geoJSON) {
            return;
        }

        if (!this.layers.userGeoJSON || this.layers.userGeoJSON.getLayers().length === 0) {
            this.rebuildUserGeoJSONLayer();
        }

        if (!this.lmap.hasLayer(this.layers.userGeoJSON)) {
            this.layers.userGeoJSON.addTo(this.lmap);
        }
        this.layers.userGeoJSON.bringToFront();
    }

    private rebuildFloorplanImageLayer() {
        this.removeFloorplanImageLayer();
        this.ensureMapLayerPanes();
        const data = this.commonService.session.data.floorplanImage;
        this.layers.floorplanImage = data
            ? imageOverlay(data, this.getFloorplanImageOverlayBounds(), {
                pane: this.customMapBackgroundPaneName,
                opacity: 1,
                interactive: false
            })
            : null;
    }

    private addFloorplanImageLayerToMap() {
        if (!this.lmap || !this.commonService.session.data.floorplanImage) {
            return;
        }

        if (!this.layers.floorplanImage) {
            this.rebuildFloorplanImageLayer();
        }

        if (this.layers.floorplanImage && !this.lmap.hasLayer(this.layers.floorplanImage)) {
            this.layers.floorplanImage.addTo(this.lmap);
        }
        if (this.layers.floorplanImage) {
            this.layers.floorplanImage.bringToFront();
        }
    }

    private removeUserGeoJSONLayer() {
        if (this.layers.userGeoJSON) {
            this.layers.userGeoJSON.remove();
        }
    }

    private removeFloorplanImageLayer() {
        this.removeFloorplanBoundaryLayersFromMap();
        if (this.layers.floorplanImage) {
            this.layers.floorplanImage.remove();
        }
    }

    private isUserGeoJSONLayerVisible(): boolean {
        return !!this.lmap && !!this.layers.userGeoJSON && this.lmap.hasLayer(this.layers.userGeoJSON);
    }

    private isFloorplanImageLayerVisible(): boolean {
        return !!this.lmap && !!this.layers.floorplanImage && this.lmap.hasLayer(this.layers.floorplanImage);
    }

    private captureFloorplanBaseLayerState(): void {
        this.commonService.session.data.floorplanBackgroundBaseLayerState = {
            basemap: this.commonService.session.style.widgets['map-basemap-show'] === true,
            satellite: this.commonService.session.style.widgets['map-satellite-show'] === true,
            countries: this.getAdminLayerSelection('countries'),
            states: this.getAdminLayerSelection('states'),
            counties: this.getAdminLayerSelection('counties')
        } as FloorplanBaseLayerState;
    }

    private getFloorplanBaseLayerState(): FloorplanBaseLayerState | null {
        const state = this.commonService.session.data.floorplanBackgroundBaseLayerState;
        if (!state || typeof state !== 'object') {
            return null;
        }

        const normalizeAdminSelection = (selection: any): string =>
            selection === 'Show' || selection === 'BordersOnly' ? selection : 'Hide';

        return {
            basemap: state.basemap === true,
            satellite: state.satellite === true,
            countries: normalizeAdminSelection(state.countries),
            states: normalizeAdminSelection(state.states),
            counties: normalizeAdminSelection(state.counties)
        };
    }

    private hasUnderlyingMapLayerSelected(): boolean {
        const widgets = this.commonService.session.style.widgets;
        return widgets['map-basemap-show'] === true
            || widgets['map-satellite-show'] === true
            || widgets['map-countries-show'] === true
            || widgets['map-states-show'] === true
            || widgets['map-counties-show'] === true;
    }

    private restoreFloorplanBaseLayerState(): void {
        const state = this.getFloorplanBaseLayerState();
        if (state?.basemap) {
            this.onBasemapChange('Show');
            return;
        }
        if (state?.satellite) {
            this.onSatelliteChange('Show');
            return;
        }

        if (state) {
            this.onBasemapChange('Hide', true);
            this.onSatelliteChange('Hide', true);
            this.onCountriesShowHidChange(state.countries);
            this.onStatesShowHideChange(state.states);
            this.onCountiesShowHideChange(state.counties);
        }

        if (!this.hasUnderlyingMapLayerSelected()) {
            this.onBasemapChange('Show');
        }
    }

    private ensureUnderlyingMapForOverlay(): void {
        if (!this.hasUnderlyingMapLayerSelected()) {
            this.restoreFloorplanBaseLayerState();
        }
    }

    private hideOtherBackgroundLayersForUserFloorplan() {
        this.SelectedBasemapTypeVariable = "Hide";
        this.SelectedSatelliteTypeVariable = "Hide";
        this.SelectedCountriesTypeVariable = "Hide";
        this.SelectedStatesTypeVariable = "Hide";
        this.SelectedCountiesTypeVariable = "Hide";

        this.onBasemapChange("Hide", true);
        this.onSatelliteChange("Hide", true);
        this.onCountriesShowHidChange("Hide");
        this.onStatesShowHideChange("Hide");
        this.onCountiesShowHideChange("Hide");
    }

    private hideFloorplanImageForSiblingBackground() {
        this.commonService.session.style.widgets['map-floorplan-image-show'] = false;
        this.SelectedFloorplanImageTypeVariable = "Hide";
        this.removeFloorplanImageLayer();
    }

    private hideUserGeoJSONForSiblingBackground() {
        this.commonService.session.style.widgets['map-user-geojson-show'] = false;
        this.SelectedUserGeoJSONTypeVariable = "Hide";
        this.removeUserGeoJSONLayer();
    }

    private clearUserGeoJSONBackgroundData() {
        this.commonService.session.data.geoJSON = null;
        this.commonService.session.data.geoJSONLayerName = "";
        this.cancelFloorplanBoundaryDrawing(false, false);
        this.commonService.session.style.widgets['map-user-geojson-show'] = false;
        this.SelectedUserGeoJSONTypeVariable = "Hide";
        this.userGeoJSONFileName = "";
        this.userGeoJSONFeatureCount = 0;
        this.userGeoJSONError = "";
        this.UserGeoJSONLabelFields = [{ label: "None", value: "None" }];
        this.SelectedUserGeoJSONLabelField = "None";
        this.commonService.session.style.widgets['map-user-geojson-label-field'] = 'None';
        this.removeUserGeoJSONLayer();
    }

    private clearFloorplanImageBackgroundData() {
        this.clearFloorplanBoundaryData(false);
        this.commonService.session.data.floorplanImage = null;
        this.commonService.session.data.floorplanImageLayerName = "";
        this.commonService.session.data.floorplanImageBounds = null;
        this.commonService.session.data.floorplanImageWidth = null;
        this.commonService.session.data.floorplanImageHeight = null;
        this.commonService.session.style.widgets['map-floorplan-image-show'] = false;
        this.SelectedFloorplanImageTypeVariable = "Hide";
        this.floorplanImageFileName = "";
        this.floorplanImageInfo = "";
        this.floorplanImageError = "";
        this.removeFloorplanImageLayer();
    }

    private ensureUserGeoJSONWidgetDefaults(): void {
        const widgets = this.commonService.session.style.widgets;
        if (widgets['map-user-geojson-show'] === undefined || widgets['map-user-geojson-show'] === null) {
            widgets['map-user-geojson-show'] = false;
        }
        if (widgets['map-floorplan-background-mode'] !== 'Show'
            && widgets['map-floorplan-background-mode'] !== 'Overlay'
            && widgets['map-floorplan-background-mode'] !== 'Hide') {
            widgets['map-floorplan-background-mode'] = widgets['map-user-geojson-show']
                || widgets['map-floorplan-image-show'] ? 'Show' : 'Hide';
        }
        widgets['map-user-geojson-color'] = this.getUserGeoJSONColor();
        widgets['map-user-geojson-transparency'] = this.getUserGeoJSONTransparency();
        if (typeof widgets['map-user-geojson-label-field'] !== 'string') {
            widgets['map-user-geojson-label-field'] = 'None';
        }
        this.SelectedUserGeoJSONColorVariable = widgets['map-user-geojson-color'];
        this.SelectedUserGeoJSONTransparencyVariable = widgets['map-user-geojson-transparency'];
        this.SelectedUserGeoJSONLabelField = widgets['map-user-geojson-label-field'];
        if (this.commonService.session.data.geoJSON === undefined) {
            this.commonService.session.data.geoJSON = null;
        }
        if (this.commonService.session.data.geoJSONLayerName === undefined) {
            this.commonService.session.data.geoJSONLayerName = "";
        }
    }

    private ensureFloorplanImageWidgetDefaults(): void {
        const widgets = this.commonService.session.style.widgets;
        if (widgets['map-floorplan-image-show'] === undefined || widgets['map-floorplan-image-show'] === null) {
            widgets['map-floorplan-image-show'] = false;
        }
        if (this.commonService.session.data.floorplanImage === undefined) {
            this.commonService.session.data.floorplanImage = null;
        }
        if (this.commonService.session.data.floorplanImageLayerName === undefined) {
            this.commonService.session.data.floorplanImageLayerName = "";
        }
        if (this.commonService.session.data.floorplanImageBounds === undefined) {
            this.commonService.session.data.floorplanImageBounds = null;
        }
        if (this.commonService.session.data.floorplanImageWidth === undefined) {
            this.commonService.session.data.floorplanImageWidth = null;
        }
        if (this.commonService.session.data.floorplanImageHeight === undefined) {
            this.commonService.session.data.floorplanImageHeight = null;
        }
    }

    private ensureFloorplanBoundaryDefaults(): void {
        const session = this.commonService.session;
        if (session.style.widgets['map-floorplan-boundaries-show'] === undefined
            || session.style.widgets['map-floorplan-boundaries-show'] === null) {
            session.style.widgets['map-floorplan-boundaries-show'] = true;
        }
        if (typeof session.data.floorplanBoundaryField !== 'string') {
            session.data.floorplanBoundaryField = 'None';
        }
        if (!Array.isArray(session.data.floorplanBoundaries)) {
            session.data.floorplanBoundaries = [];
        }

        const seenLabels = new Set<string>();
        const seenIds = new Set<string>();
        const imageBounds = session.data.floorplanImage
            ? this.getFloorplanImageCoordinateBounds()
            : null;
        session.data.floorplanBoundaries = session.data.floorplanBoundaries
            .map((boundary: any, index: number) => ({
                id: String(boundary?.id || `floorplan-boundary-restored-${index}`),
                label: String(boundary?.label || '').trim(),
                vertices: cleanFloorplanPolygonVertices(Array.isArray(boundary?.vertices) ? boundary.vertices : [])
            }))
            .filter((boundary: FloorplanBoundary) => {
                const normalizedLabel = normalizeFloorplanBoundaryLabel(boundary.label);
                if (!imageBounds
                    || !normalizedLabel
                    || seenLabels.has(normalizedLabel)
                    || seenIds.has(boundary.id)
                    || boundary.vertices.length < 3) {
                    return false;
                }
                try {
                    boundary.vertices = validateFloorplanPolygon(boundary.vertices, imageBounds);
                } catch {
                    return false;
                }
                seenLabels.add(normalizedLabel);
                seenIds.add(boundary.id);
                return true;
            });

        const nodeFields = Array.isArray(session.data.nodeFields) ? session.data.nodeFields : [];
        if (session.data.floorplanBoundaryField !== 'None'
            && !nodeFields.includes(session.data.floorplanBoundaryField)) {
            session.data.floorplanBoundaryField = 'None';
        }

        this.SelectedFloorplanBoundaryField = session.data.floorplanBoundaryField;
        this.SelectedFloorplanBoundaryVisibility = session.style.widgets['map-floorplan-boundaries-show'] ? 'Show' : 'Hide';
        this.floorplanBoundaries = session.data.floorplanBoundaries;
        this.refreshFloorplanBoundaryCounts();
    }

    private getFloorplanImageCoordinateBounds() {
        const bounds = L.latLngBounds(this.getFloorplanImageBounds() as any);
        return {
            minX: bounds.getWest(),
            minY: bounds.getSouth(),
            maxX: bounds.getEast(),
            maxY: bounds.getNorth()
        };
    }

    private floorplanPointToLatLng(point: FloorplanBoundaryPoint): L.LatLng {
        return L.latLng(this.floorplanImageYToDisplayLatitude(point.y), point.x);
    }

    private latLngToFloorplanPoint(latlng: L.LatLng): FloorplanBoundaryPoint {
        return {
            x: Number(latlng.lng),
            y: this.displayLatitudeToFloorplanImageY(Number(latlng.lat))
        };
    }

    private ensureFloorplanBoundaryPane(): void {
        if (!this.lmap) {
            return;
        }
        let pane = this.lmap.getPane(this.floorplanBoundaryPaneName);
        if (!pane) {
            pane = this.lmap.createPane(this.floorplanBoundaryPaneName);
        }
        pane.style.zIndex = '450';
    }

    private ensureMapLayerPanes(): void {
        if (!this.lmap) {
            return;
        }

        const customBackgroundPane = this.lmap.getPane(this.customMapBackgroundPaneName)
            || this.lmap.createPane(this.customMapBackgroundPaneName);
        customBackgroundPane.style.zIndex = '425';

        const customLabelPane = this.lmap.getPane(this.customMapLabelPaneName)
            || this.lmap.createPane(this.customMapLabelPaneName);
        customLabelPane.style.zIndex = '480';
        customLabelPane.style.pointerEvents = 'none';

        const networkLinkPane = this.lmap.getPane(this.mapNetworkLinkPaneName)
            || this.lmap.createPane(this.mapNetworkLinkPaneName);
        networkLinkPane.style.zIndex = '500';
    }

    private rebuildFloorplanBoundaryLayers(): void {
        this.layers.floorplanBoundaries.clearLayers();
        this.floorplanBoundaryLayersById = Object.create(null);
        this.floorplanBoundaries = this.getFloorplanBoundaries();
        if (!this.lmap || !this.commonService.session.data.floorplanImage) {
            return;
        }

        this.ensureFloorplanBoundaryPane();
        this.floorplanBoundaries.forEach(boundary => {
            const layer = polygon(boundary.vertices.map(vertex => this.floorplanPointToLatLng(vertex)), {
                pane: this.floorplanBoundaryPaneName,
                color: '#1f6f8b',
                weight: 2,
                opacity: 0.95,
                fillColor: '#7fc8a9',
                fillOpacity: 0.2,
                interactive: false
            });
            layer.bindTooltip(this.escapeMapLabelHtml(boundary.label), {
                pane: this.floorplanBoundaryPaneName,
                permanent: true,
                direction: 'center',
                className: 'map-floorplan-boundary-label'
            });
            this.floorplanBoundaryLayersById[String(boundary.id)] = layer;
            this.layers.floorplanBoundaries.addLayer(layer);
        });
    }

    private addFloorplanBoundaryLayersToMap(): void {
        if (!this.lmap
            || !this.isFloorplanImageLayerVisible()
            || !this.commonService.session.style.widgets['map-floorplan-boundaries-show']) {
            this.removeFloorplanBoundaryLayersFromMap();
            return;
        }
        if (!this.lmap.hasLayer(this.layers.floorplanBoundaries)) {
            this.layers.floorplanBoundaries.addTo(this.lmap);
        }
        this.layers.floorplanBoundaries.bringToFront();
    }

    private removeFloorplanBoundaryLayersFromMap(): void {
        if (this.layers.floorplanBoundaries) {
            this.layers.floorplanBoundaries.remove();
        }
    }

    onFloorplanBoundaryVisibilityChange(selection: string): void {
        this.SelectedFloorplanBoundaryVisibility = selection === 'Hide' ? 'Hide' : 'Show';
        this.commonService.session.style.widgets['map-floorplan-boundaries-show'] = this.SelectedFloorplanBoundaryVisibility === 'Show';
        if (this.SelectedFloorplanBoundaryVisibility === 'Show') {
            this.rebuildFloorplanBoundaryLayers();
            this.addFloorplanBoundaryLayersToMap();
        } else {
            this.removeFloorplanBoundaryLayersFromMap();
        }
    }

    onFloorplanBoundaryFieldChange(field: string): void {
        const nextField = field || 'None';
        if (this.commonService.session.data.floorplanBoundaryField === nextField) {
            return;
        }
        this.commonService.session.data.floorplanBoundaryField = nextField;
        this.SelectedFloorplanBoundaryField = nextField;
        this.reconcileFloorplanBoundaryPlacements(new Set<string>(), true, true);
        this.floorplanBoundaryMessage = nextField === 'None'
            ? 'Boundary placement is off until a node field is selected.'
            : `Boundary labels now match values in ${nextField}.`;
    }

    repositionAllFloorplanBoundaryNodes(): void {
        if (this.SelectedFloorplanBoundaryField === 'None' || this.getFloorplanBoundaries().length === 0) {
            return;
        }
        this.reconcileFloorplanBoundaryPlacements(new Set<string>(), true, true);
        this.floorplanBoundaryMessage = `Repositioned ${this.floorplanBoundaryMatchedNodeCount} matching node${this.floorplanBoundaryMatchedNodeCount === 1 ? '' : 's'}.`;
    }

    private clearFloorplanBoundaryData(refresh: boolean = true): void {
        this.cancelFloorplanBoundaryDrawing(false, false);
        this.commonService.session.data.floorplanBoundaryField = 'None';
        this.commonService.session.data.floorplanBoundaries = [];
        this.SelectedFloorplanBoundaryField = 'None';
        this.floorplanBoundaries = [];
        this.clearAllFloorplanBoundaryPositions();
        this.layers.floorplanBoundaries.clearLayers();
        this.removeFloorplanBoundaryLayersFromMap();
        this.floorplanBoundaryLayersById = Object.create(null);
        this.floorplanBoundaryMessage = '';
        this.floorplanBoundaryError = '';
        if (refresh && this.lmap) {
            this.refreshRenderedCoordinates(false);
        }
    }

    canDrawFloorplanBoundary(): boolean {
        return this.floorplanBoundaryEditorMode === 'idle'
            && !!this.commonService.session.data.floorplanImage
            && this.isFloorplanImageLayerVisible();
    }

    isFloorplanBoundaryDrawing(): boolean {
        return this.floorplanBoundaryEditorMode === 'polygon' || this.floorplanBoundaryEditorMode === 'freehand';
    }

    canFinishFloorplanBoundary(): boolean {
        return this.floorplanBoundaryEditorMode === 'polygon'
            && this.floorplanBoundaryDraftVertices.length >= 3
            && !floorplanClosingSegmentHasIntersection(this.floorplanBoundaryDraftVertices);
    }

    getFloorplanBoundaryPointSummary(): string {
        const count = this.floorplanBoundaryDraftVertices.length;
        if (count === 0) {
            return 'No corners placed yet.';
        }
        if (count === 1) {
            return 'Corner 1 is the green starting point.';
        }
        return `${count} corners placed. Corner ${count} is highlighted as the newest point.`;
    }

    canUndoFloorplanBoundaryPoint(): boolean {
        return this.floorplanBoundaryEditorMode === 'polygon' && this.floorplanBoundaryDraftVertices.length > 0;
    }

    canSaveFloorplanBoundary(): boolean {
        return ['labeling', 'editing', 'renaming'].includes(this.floorplanBoundaryEditorMode)
            && this.floorplanBoundaryDraftLabel.trim().length > 0
            && this.floorplanBoundaryDraftVertices.length >= 3;
    }

    canRemoveFloorplanBoundaryVertex(): boolean {
        return this.floorplanBoundaryEditorMode === 'editing'
            && this.floorplanBoundarySelectedVertexIndex >= 0
            && this.floorplanBoundaryDraftVertices.length > 3;
    }

    private beginFloorplanBoundaryInteraction(mode: FloorplanBoundaryEditorMode): boolean {
        this.cancelFloorplanBoundaryDrawing(false, false);
        if (!this.lmap || !this.commonService.session.data.floorplanImage || !this.isFloorplanImageLayerVisible()) {
            this.floorplanBoundaryError = 'Show an uploaded image before drawing or editing boundaries.';
            return false;
        }

        this.onManualPositioningChange('Off');
        this.floorplanBoundaryEditorMode = mode;
        this.floorplanBoundaryError = '';
        this.floorplanBoundaryWarning = '';
        this.floorplanBoundaryDraftLabel = '';
        this.floorplanBoundaryDraftVertices = [];
        this.floorplanBoundaryEditingId = null;
        this.floorplanBoundarySelectedVertexIndex = -1;
        this.floorplanBoundaryMapDraggingWasEnabled = this.lmap.dragging.enabled();
        this.floorplanBoundaryDoubleClickZoomWasEnabled = this.lmap.doubleClickZoom.enabled();
        this.lmap.dragging.disable();
        this.lmap.doubleClickZoom.disable();
        this.NodeMapSettingsExportDialogSettings.setVisibility(false);
        return true;
    }

    startFloorplanBoundaryPolygon(): void {
        if (!this.beginFloorplanBoundaryInteraction('polygon')) {
            return;
        }
        this.lmap.on('click', this.floorplanBoundaryMapClickHandler);
        this.lmap.on('dblclick', this.floorplanBoundaryMapDoubleClickHandler);
        this.floorplanBoundaryMessage = 'Click to add numbered corners. The dashed line previews the closing edge; click near point 1 or use Finish when complete.';
    }

    startFloorplanBoundaryFreehand(): void {
        if (!this.beginFloorplanBoundaryInteraction('freehand')) {
            return;
        }
        const container = this.lmap.getContainer();
        container.classList.add('map-boundary-freehand-active');
        container.addEventListener('pointerdown', this.floorplanBoundaryFreehandPointerDownHandler);
        container.addEventListener('pointermove', this.floorplanBoundaryFreehandPointerMoveHandler);
        container.addEventListener('pointerup', this.floorplanBoundaryFreehandPointerUpHandler);
        container.addEventListener('pointercancel', this.floorplanBoundaryFreehandPointerCancelHandler);
        this.floorplanBoundaryMessage = 'Press and drag on the image to sketch a boundary.';
    }

    private isFloorplanPointInsideImage(point: FloorplanBoundaryPoint): boolean {
        const bounds = this.getFloorplanImageCoordinateBounds();
        return point.x >= bounds.minX
            && point.x <= bounds.maxX
            && point.y >= bounds.minY
            && point.y <= bounds.maxY;
    }

    private onFloorplanBoundaryMapClick(event: L.LeafletMouseEvent): void {
        if (this.floorplanBoundaryEditorMode !== 'polygon') {
            return;
        }
        if (this.floorplanBoundaryDraftVertices.length >= 3 && this.isNearFirstFloorplanBoundaryVertex(event.latlng)) {
            this.finishFloorplanBoundaryDrawing();
            return;
        }
        const point = this.latLngToFloorplanPoint(event.latlng);
        if (!this.isFloorplanPointInsideImage(point)) {
            this.floorplanBoundaryError = 'Keep every boundary point inside the uploaded image.';
            this.cdref.detectChanges();
            return;
        }
        this.clearFloorplanBoundaryRejectedEdge();
        if (floorplanAppendedSegmentHasIntersection(this.floorplanBoundaryDraftVertices, point)) {
            this.floorplanBoundaryError = 'That corner would make the new red edge cross the boundary. Choose another location or use Undo.';
            this.showFloorplanBoundaryRejectedEdge(point);
            this.cdref.detectChanges();
            return;
        }
        this.floorplanBoundaryError = '';
        this.floorplanBoundaryDraftVertices.push(point);
        this.updateFloorplanBoundaryPreview(false);
        this.cdref.detectChanges();
    }

    private isNearFirstFloorplanBoundaryVertex(latlng: L.LatLng): boolean {
        const first = this.floorplanBoundaryDraftVertices[0];
        if (!first || !this.lmap) {
            return false;
        }
        const firstPoint = this.lmap.latLngToContainerPoint(this.floorplanPointToLatLng(first));
        const clickPoint = this.lmap.latLngToContainerPoint(latlng);
        return firstPoint.distanceTo(clickPoint) <= 12;
    }

    private onFloorplanBoundaryMapDoubleClick(event: L.LeafletMouseEvent): void {
        if (event.originalEvent) {
            event.originalEvent.preventDefault();
        }
        this.finishFloorplanBoundaryDrawing();
    }

    undoFloorplanBoundaryPoint(): void {
        if (!this.canUndoFloorplanBoundaryPoint()) {
            return;
        }
        this.clearFloorplanBoundaryRejectedEdge();
        this.floorplanBoundaryError = '';
        this.floorplanBoundaryDraftVertices.pop();
        this.updateFloorplanBoundaryPreview(false);
    }

    finishFloorplanBoundaryDrawing(): void {
        if (!this.isFloorplanBoundaryDrawing()) {
            return;
        }
        if (this.floorplanBoundaryEditorMode === 'polygon'
            && floorplanClosingSegmentHasIntersection(this.floorplanBoundaryDraftVertices)) {
            this.floorplanBoundaryError = 'The red dashed closing edge crosses the boundary. Add another corner or use Undo before finishing.';
            this.cdref.detectChanges();
            return;
        }
        try {
            this.clearFloorplanBoundaryRejectedEdge();
            this.floorplanBoundaryDraftVertices = validateFloorplanPolygon(
                this.floorplanBoundaryDraftVertices,
                this.getFloorplanImageCoordinateBounds()
            );
            this.floorplanBoundaryEditorMode = 'labeling';
            this.floorplanBoundaryError = '';
            this.floorplanBoundaryWarning = '';
            this.floorplanBoundaryMessage = 'Enter a unique label, then save the boundary.';
            this.detachFloorplanBoundaryDrawingListeners();
            this.updateFloorplanBoundaryPreview(true);
            this.cdref.detectChanges();
        } catch (error) {
            this.floorplanBoundaryError = error instanceof Error ? error.message : 'Unable to finish this boundary.';
            this.cdref.detectChanges();
        }
    }

    private eventToFloorplanPoint(event: PointerEvent): { point: FloorplanBoundaryPoint; containerPoint: L.Point } {
        const containerPoint = this.lmap.mouseEventToContainerPoint(event as MouseEvent);
        return {
            point: this.latLngToFloorplanPoint(this.lmap.containerPointToLatLng(containerPoint)),
            containerPoint
        };
    }

    private onFloorplanBoundaryFreehandPointerDown(event: PointerEvent): void {
        if (this.floorplanBoundaryEditorMode !== 'freehand'
            || this.floorplanBoundaryFreehandPointerId !== null
            || (event.pointerType === 'mouse' && event.button !== 0)) {
            return;
        }
        const start = this.eventToFloorplanPoint(event);
        if (!this.isFloorplanPointInsideImage(start.point)) {
            this.floorplanBoundaryError = 'Start the freehand boundary inside the uploaded image.';
            this.cdref.detectChanges();
            return;
        }
        event.preventDefault();
        try {
            this.lmap.getContainer().setPointerCapture?.(event.pointerId);
        } catch {
            // Some synthetic pointer events do not establish an active pointer capture.
        }
        this.floorplanBoundaryFreehandPointerId = event.pointerId;
        this.floorplanBoundaryFreehandLastPoint = start.containerPoint;
        this.floorplanBoundaryDraftVertices = [start.point];
        this.floorplanBoundaryError = '';
        this.updateFloorplanBoundaryPreview(false);
    }

    private onFloorplanBoundaryFreehandPointerMove(event: PointerEvent): void {
        if (this.floorplanBoundaryEditorMode !== 'freehand'
            || this.floorplanBoundaryFreehandPointerId !== event.pointerId) {
            return;
        }
        event.preventDefault();
        const next = this.eventToFloorplanPoint(event);
        if (!this.isFloorplanPointInsideImage(next.point)
            || (this.floorplanBoundaryFreehandLastPoint
                && this.floorplanBoundaryFreehandLastPoint.distanceTo(next.containerPoint) < this.floorplanBoundaryFreehandMinimumPixelDistance)) {
            return;
        }
        this.floorplanBoundaryFreehandLastPoint = next.containerPoint;
        this.floorplanBoundaryDraftVertices.push(next.point);
        this.updateFloorplanBoundaryPreview(false);
    }

    private onFloorplanBoundaryFreehandPointerUp(event: PointerEvent): void {
        if (this.floorplanBoundaryEditorMode !== 'freehand'
            || this.floorplanBoundaryFreehandPointerId !== event.pointerId) {
            return;
        }
        event.preventDefault();
        try {
            this.lmap.getContainer().releasePointerCapture?.(event.pointerId);
        } catch {
            // The pointer may already have been released by the browser.
        }
        this.floorplanBoundaryFreehandPointerId = null;
        this.floorplanBoundaryFreehandLastPoint = null;

        const simplifiedPoints = L.LineUtil.simplify(
            this.floorplanBoundaryDraftVertices.map(vertex => this.lmap.latLngToContainerPoint(this.floorplanPointToLatLng(vertex))),
            2
        );
        this.floorplanBoundaryDraftVertices = simplifiedPoints.map(point =>
            this.latLngToFloorplanPoint(this.lmap.containerPointToLatLng(point))
        );
        this.finishFloorplanBoundaryDrawing();
    }

    private updateFloorplanBoundaryPreview(closed: boolean): void {
        if (!this.lmap) {
            return;
        }
        if (this.floorplanBoundaryPreviewLayer) {
            this.floorplanBoundaryPreviewLayer.remove();
            this.floorplanBoundaryPreviewLayer = null;
        }
        if (this.floorplanBoundaryClosingGuideLayer) {
            this.floorplanBoundaryClosingGuideLayer.remove();
            this.floorplanBoundaryClosingGuideLayer = null;
        }
        this.floorplanBoundaryWarning = '';
        if (this.floorplanBoundaryDraftVertices.length === 0) {
            this.renderFloorplanBoundaryDrawingVertexHandles();
            return;
        }

        const latlngs = this.floorplanBoundaryDraftVertices.map(vertex => this.floorplanPointToLatLng(vertex));
        const style: PathOptions = {
            pane: this.floorplanBoundaryPaneName,
            color: '#f05a28',
            weight: 3,
            opacity: 1,
            fillColor: '#ffd166',
            fillOpacity: closed ? 0.25 : 0,
            interactive: false
        } as any;
        this.floorplanBoundaryPreviewLayer = closed && latlngs.length >= 3
            ? polygon(latlngs, style)
            : polyline(latlngs, style);
        this.floorplanBoundaryPreviewLayer.addTo(this.lmap);

        if (!closed && this.floorplanBoundaryEditorMode === 'polygon') {
            this.renderFloorplanBoundaryDrawingVertexHandles();
            if (latlngs.length >= 3) {
                const closingEdgeCrosses = floorplanClosingSegmentHasIntersection(this.floorplanBoundaryDraftVertices);
                this.floorplanBoundaryClosingGuideLayer = polyline([latlngs[latlngs.length - 1], latlngs[0]], {
                    pane: this.floorplanBoundaryPaneName,
                    color: closingEdgeCrosses ? '#c62828' : '#167d63',
                    weight: closingEdgeCrosses ? 4 : 3,
                    opacity: 1,
                    dashArray: '8 6',
                    interactive: false
                } as any);
                this.floorplanBoundaryClosingGuideLayer.addTo(this.lmap);
                if (closingEdgeCrosses) {
                    this.floorplanBoundaryWarning = 'The red dashed closing edge crosses the outline. Add another corner or use Undo before finishing.';
                }
            }
        } else {
            this.renderFloorplanBoundaryDrawingVertexHandles();
        }
    }

    private getFloorplanBoundaryDrawingVertexIcon(index: number): L.DivIcon {
        const lastIndex = this.floorplanBoundaryDraftVertices.length - 1;
        const classes = ['map-boundary-drawing-vertex'];
        if (index === 0) {
            classes.push('map-boundary-drawing-vertex-first');
        }
        if (index === lastIndex) {
            classes.push('map-boundary-drawing-vertex-latest');
        }
        return L.divIcon({
            className: classes.join(' '),
            html: `<span>${index + 1}</span>`,
            iconSize: [22, 22],
            iconAnchor: [11, 11]
        });
    }

    private renderFloorplanBoundaryDrawingVertexHandles(): void {
        this.floorplanBoundaryDrawingVertexHandles.clearLayers();
        if (!this.lmap || this.floorplanBoundaryEditorMode !== 'polygon') {
            this.floorplanBoundaryDrawingVertexHandles.remove();
            return;
        }
        if (!this.lmap.hasLayer(this.floorplanBoundaryDrawingVertexHandles)) {
            this.floorplanBoundaryDrawingVertexHandles.addTo(this.lmap);
        }
        this.floorplanBoundaryDraftVertices.forEach((vertex, index) => {
            this.floorplanBoundaryDrawingVertexHandles.addLayer(marker(this.floorplanPointToLatLng(vertex), {
                interactive: false,
                keyboard: false,
                title: index === 0 ? 'Boundary starting corner 1' : `Boundary corner ${index + 1}`,
                icon: this.getFloorplanBoundaryDrawingVertexIcon(index)
            }));
        });
    }

    private clearFloorplanBoundaryRejectedEdge(): void {
        if (this.floorplanBoundaryRejectedEdgeLayer) {
            this.floorplanBoundaryRejectedEdgeLayer.remove();
            this.floorplanBoundaryRejectedEdgeLayer = null;
        }
    }

    private showFloorplanBoundaryRejectedEdge(candidate: FloorplanBoundaryPoint): void {
        const previous = this.floorplanBoundaryDraftVertices[this.floorplanBoundaryDraftVertices.length - 1];
        if (!previous || !this.lmap) {
            return;
        }
        this.floorplanBoundaryRejectedEdgeLayer = polyline([
            this.floorplanPointToLatLng(previous),
            this.floorplanPointToLatLng(candidate)
        ], {
            pane: this.floorplanBoundaryPaneName,
            color: '#c62828',
            weight: 5,
            opacity: 1,
            dashArray: '6 5',
            interactive: false
        } as any);
        this.floorplanBoundaryRejectedEdgeLayer.addTo(this.lmap);
    }

    beginEditFloorplanBoundary(boundary: FloorplanBoundary): void {
        if (!boundary || !this.beginFloorplanBoundaryInteraction('editing')) {
            return;
        }
        if (!this.lmap.hasLayer(this.layers.floorplanBoundaries)) {
            this.layers.floorplanBoundaries.addTo(this.lmap);
        }
        this.layers.floorplanBoundaries.bringToFront();
        this.floorplanBoundaryEditingId = String(boundary.id);
        this.floorplanBoundaryDraftLabel = boundary.label;
        this.floorplanBoundaryDraftVertices = boundary.vertices.map(vertex => ({ ...vertex }));
        this.floorplanBoundaryMessage = 'Drag vertex handles or click a midpoint to reshape the boundary, then save.';
        this.renderFloorplanBoundaryEditHandles();
    }

    beginRenameFloorplanBoundary(boundary: FloorplanBoundary): void {
        if (!boundary) {
            return;
        }
        this.cancelFloorplanBoundaryDrawing(false, false);
        this.floorplanBoundaryEditorMode = 'renaming';
        this.floorplanBoundaryEditingId = String(boundary.id);
        this.floorplanBoundaryDraftLabel = boundary.label;
        this.floorplanBoundaryDraftVertices = boundary.vertices.map(vertex => ({ ...vertex }));
        this.floorplanBoundaryError = '';
        this.floorplanBoundaryMessage = 'Update the label and save.';
    }

    private getFloorplanBoundaryHandleIcon(className: string): L.DivIcon {
        return L.divIcon({
            className,
            html: '',
            iconSize: [14, 14],
            iconAnchor: [7, 7]
        });
    }

    private renderFloorplanBoundaryEditHandles(): void {
        this.floorplanBoundaryVertexHandles.clearLayers();
        if (!this.lmap || this.floorplanBoundaryEditorMode !== 'editing') {
            return;
        }
        if (!this.lmap.hasLayer(this.floorplanBoundaryVertexHandles)) {
            this.floorplanBoundaryVertexHandles.addTo(this.lmap);
        }

        this.floorplanBoundaryDraftVertices.forEach((vertex, index) => {
            const handle = marker(this.floorplanPointToLatLng(vertex), {
                draggable: true,
                keyboard: true,
                title: `Boundary vertex ${index + 1}`,
                icon: this.getFloorplanBoundaryHandleIcon(
                    index === this.floorplanBoundarySelectedVertexIndex
                        ? 'map-boundary-vertex-handle map-boundary-vertex-selected'
                        : 'map-boundary-vertex-handle'
                )
            });
            handle.on('click', () => {
                this.floorplanBoundarySelectedVertexIndex = index;
                this.renderFloorplanBoundaryEditHandles();
                this.cdref.detectChanges();
            });
            handle.on('drag', () => {
                this.floorplanBoundaryDraftVertices[index] = this.latLngToFloorplanPoint(handle.getLatLng());
                this.updateEditingFloorplanBoundaryLayer();
            });
            handle.on('dragend', () => {
                this.floorplanBoundarySelectedVertexIndex = index;
                this.renderFloorplanBoundaryEditHandles();
                this.cdref.detectChanges();
            });
            this.floorplanBoundaryVertexHandles.addLayer(handle);

            const next = this.floorplanBoundaryDraftVertices[(index + 1) % this.floorplanBoundaryDraftVertices.length];
            const midpoint: FloorplanBoundaryPoint = {
                x: (vertex.x + next.x) / 2,
                y: (vertex.y + next.y) / 2
            };
            const midpointHandle = marker(this.floorplanPointToLatLng(midpoint), {
                keyboard: true,
                title: `Add a vertex after point ${index + 1}`,
                icon: this.getFloorplanBoundaryHandleIcon('map-boundary-midpoint-handle')
            });
            midpointHandle.on('click', () => {
                this.floorplanBoundaryDraftVertices.splice(index + 1, 0, midpoint);
                this.floorplanBoundarySelectedVertexIndex = index + 1;
                this.updateEditingFloorplanBoundaryLayer();
                this.renderFloorplanBoundaryEditHandles();
                this.cdref.detectChanges();
            });
            this.floorplanBoundaryVertexHandles.addLayer(midpointHandle);
        });

        this.updateEditingFloorplanBoundaryLayer();
    }

    private updateEditingFloorplanBoundaryLayer(): void {
        if (!this.floorplanBoundaryEditingId) {
            return;
        }
        const layer = this.floorplanBoundaryLayersById[this.floorplanBoundaryEditingId];
        if (layer) {
            layer.setLatLngs(this.floorplanBoundaryDraftVertices.map(vertex => this.floorplanPointToLatLng(vertex)));
            layer.setStyle({ color: '#f05a28', weight: 3, fillOpacity: 0.3 });
        }
    }

    removeSelectedFloorplanBoundaryVertex(): void {
        if (!this.canRemoveFloorplanBoundaryVertex()) {
            return;
        }
        this.floorplanBoundaryDraftVertices.splice(this.floorplanBoundarySelectedVertexIndex, 1);
        this.floorplanBoundarySelectedVertexIndex = -1;
        this.updateEditingFloorplanBoundaryLayer();
        this.renderFloorplanBoundaryEditHandles();
    }

    saveFloorplanBoundary(): void {
        if (!this.canSaveFloorplanBoundary()) {
            return;
        }
        const sanitizedLabel = String(this.commonService.filterXSS(this.floorplanBoundaryDraftLabel)).trim();
        const normalizedLabel = normalizeFloorplanBoundaryLabel(sanitizedLabel);
        const duplicate = this.getFloorplanBoundaries().find(boundary =>
            String(boundary.id) !== String(this.floorplanBoundaryEditingId)
            && normalizeFloorplanBoundaryLabel(boundary.label) === normalizedLabel
        );
        if (!normalizedLabel) {
            this.floorplanBoundaryError = 'Enter a boundary label.';
            return;
        }
        if (duplicate) {
            this.floorplanBoundaryError = 'Boundary labels must be unique, ignoring case and surrounding spaces.';
            return;
        }

        let vertices: FloorplanBoundaryPoint[];
        try {
            vertices = validateFloorplanPolygon(this.floorplanBoundaryDraftVertices, this.getFloorplanImageCoordinateBounds());
        } catch (error) {
            this.floorplanBoundaryError = error instanceof Error ? error.message : 'Unable to save this boundary.';
            return;
        }

        const boundaries = this.getFloorplanBoundaries().slice();
        const existingIndex = boundaries.findIndex(boundary => String(boundary.id) === String(this.floorplanBoundaryEditingId));
        const id = existingIndex >= 0
            ? boundaries[existingIndex].id
            : `floorplan-boundary-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        const savedBoundary: FloorplanBoundary = { id, label: sanitizedLabel, vertices };
        if (existingIndex >= 0) {
            boundaries[existingIndex] = savedBoundary;
        } else {
            boundaries.push(savedBoundary);
        }

        this.commonService.session.data.floorplanBoundaries = boundaries;
        this.floorplanBoundaries = boundaries;
        this.cancelFloorplanBoundaryDrawing(false, false);
        this.rebuildFloorplanBoundaryLayers();
        this.addFloorplanBoundaryLayersToMap();
        this.reconcileFloorplanBoundaryPlacements(new Set<string>([String(id)]), false, true);
        this.floorplanBoundaryMessage = `Saved boundary “${sanitizedLabel}” and placed matching nodes.`;
        this.floorplanBoundaryError = '';
        this.NodeMapSettingsExportDialogSettings.setVisibility(true);
    }

    deleteFloorplanBoundary(boundary: FloorplanBoundary): void {
        if (!boundary || !window.confirm(`Delete the boundary “${boundary.label}”?`)) {
            return;
        }
        this.cancelFloorplanBoundaryDrawing(false, false);
        this.commonService.session.data.floorplanBoundaries = this.getFloorplanBoundaries()
            .filter(candidate => String(candidate.id) !== String(boundary.id));
        this.floorplanBoundaries = this.commonService.session.data.floorplanBoundaries;
        this.rebuildFloorplanBoundaryLayers();
        this.addFloorplanBoundaryLayersToMap();
        this.reconcileFloorplanBoundaryPlacements(new Set<string>(), false, true);
        this.floorplanBoundaryMessage = `Deleted boundary “${boundary.label}”.`;
    }

    cancelFloorplanBoundaryDrawing(showMessage: boolean = true, returnToSettings: boolean = true): void {
        const wasActive = this.floorplanBoundaryEditorMode !== 'idle';
        this.detachFloorplanBoundaryDrawingListeners();
        if (this.floorplanBoundaryPreviewLayer) {
            this.floorplanBoundaryPreviewLayer.remove();
            this.floorplanBoundaryPreviewLayer = null;
        }
        if (this.floorplanBoundaryClosingGuideLayer) {
            this.floorplanBoundaryClosingGuideLayer.remove();
            this.floorplanBoundaryClosingGuideLayer = null;
        }
        this.clearFloorplanBoundaryRejectedEdge();
        this.floorplanBoundaryDrawingVertexHandles.remove();
        this.floorplanBoundaryDrawingVertexHandles.clearLayers();
        this.floorplanBoundaryVertexHandles.remove();
        this.floorplanBoundaryVertexHandles.clearLayers();
        this.floorplanBoundaryEditorMode = 'idle';
        this.floorplanBoundaryDraftLabel = '';
        this.floorplanBoundaryDraftVertices = [];
        this.floorplanBoundaryEditingId = null;
        this.floorplanBoundarySelectedVertexIndex = -1;
        this.floorplanBoundaryFreehandPointerId = null;
        this.floorplanBoundaryFreehandLastPoint = null;
        this.floorplanBoundaryWarning = '';
        if (wasActive && showMessage) {
            this.floorplanBoundaryMessage = 'Boundary changes canceled.';
        }
        if (this.lmap) {
            if (this.floorplanBoundaryMapDraggingWasEnabled) {
                this.lmap.dragging.enable();
            }
            if (this.floorplanBoundaryDoubleClickZoomWasEnabled) {
                this.lmap.doubleClickZoom.enable();
            }
            this.rebuildFloorplanBoundaryLayers();
            this.addFloorplanBoundaryLayersToMap();
        }
        if (wasActive && returnToSettings) {
            this.NodeMapSettingsExportDialogSettings.setVisibility(true);
        }
    }

    private detachFloorplanBoundaryDrawingListeners(): void {
        if (!this.lmap) {
            return;
        }
        this.lmap.off('click', this.floorplanBoundaryMapClickHandler);
        this.lmap.off('dblclick', this.floorplanBoundaryMapDoubleClickHandler);
        const container = this.lmap.getContainer();
        container.classList.remove('map-boundary-freehand-active');
        container.removeEventListener('pointerdown', this.floorplanBoundaryFreehandPointerDownHandler);
        container.removeEventListener('pointermove', this.floorplanBoundaryFreehandPointerMoveHandler);
        container.removeEventListener('pointerup', this.floorplanBoundaryFreehandPointerUpHandler);
        container.removeEventListener('pointercancel', this.floorplanBoundaryFreehandPointerCancelHandler);
    }

    private createFloorplanImageBounds(width: number, height: number): [[number, number], [number, number]] {
        const safeWidth = Number(width) > 0 ? Number(width) : 1;
        const safeHeight = Number(height) > 0 ? Number(height) : 1;
        const scale = this.floorplanImageMaxCoordinate / Math.max(safeWidth, safeHeight);
        const xMax = safeWidth * scale;
        const yMax = safeHeight * scale;

        return [[0, 0], [yMax, xMax]];
    }

    private getFloorplanImageBounds(): L.LatLngBoundsExpression {
        const storedBounds = this.commonService.session.data.floorplanImageBounds;
        if (Array.isArray(storedBounds)
            && storedBounds.length === 2
            && Array.isArray(storedBounds[0])
            && Array.isArray(storedBounds[1])) {
            return storedBounds as L.LatLngBoundsExpression;
        }

        return this.createFloorplanImageBounds(
            this.commonService.session.data.floorplanImageWidth,
            this.commonService.session.data.floorplanImageHeight
        );
    }

    private getFloorplanImageOverlayBounds(): L.LatLngBoundsExpression {
        const normalizedBounds = L.latLngBounds(this.getFloorplanImageBounds() as any);
        return [
            [
                this.floorplanImageYToDisplayLatitude(normalizedBounds.getSouth()),
                normalizedBounds.getWest()
            ],
            [
                this.floorplanImageYToDisplayLatitude(normalizedBounds.getNorth()),
                normalizedBounds.getEast()
            ]
        ];
    }

    private formatFloorplanImageInfo(width: any, height: any, bounds: L.LatLngBoundsExpression): string {
        if (!width || !height) {
            return "";
        }

        const latLngBounds = L.latLngBounds(bounds as any);
        return `${width} x ${height}px, x ${latLngBounds.getWest().toFixed(2)}-${latLngBounds.getEast().toFixed(2)}, y ${latLngBounds.getSouth().toFixed(2)}-${latLngBounds.getNorth().toFixed(2)}`;
    }

    private validateUserGeoJSON(data: any) {
        if (!data || typeof data !== 'object') {
            throw new Error("GeoJSON file must contain a JSON object.");
        }

        const isRenderableGeoJSON = data.type === "FeatureCollection"
            || data.type === "Feature"
            || !!data.coordinates
            || data.type === "GeometryCollection";
        if (!isRenderableGeoJSON) {
            throw new Error("GeoJSON file must be a FeatureCollection, Feature, or geometry object.");
        }

        if (data.type === "FeatureCollection" && (!Array.isArray(data.features) || data.features.length === 0)) {
            throw new Error("GeoJSON FeatureCollection does not contain any features.");
        }

        if (this.countGeoJSONFeatures(data) === 0) {
            throw new Error("GeoJSON file does not contain any renderable features.");
        }
    }

    private countGeoJSONFeatures(data: any): number {
        if (!data) {
            return 0;
        }

        if (data.type === "FeatureCollection") {
            return Array.isArray(data.features) ? data.features.length : 0;
        }

        if (data.type === "Feature" || data.type === "GeometryCollection" || data.coordinates) {
            return 1;
        }

        return 0;
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

        this.reconcileFloorplanBoundaryPlacements(new Set<string>(), false, false);

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
            that.refreshManualPositionControls();
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

    displayColorOptions(event?: MouseEvent) {
        this.DisplayGlobalSettingsDialogEvent.emit(createGlobalSettingsDialogRequest('Styling', event));
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
                const layerData = {
                    ...data,
                    features: (Array.isArray(data?.features) ? data.features : []).filter(feature => feature?.geometry)
                };

                this.layers[name] = geoJSON(layerData,
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

    private normalizeMapLookupValue(value: any): string {
        return String(value ?? '').trim().toLowerCase();
    }

    private isMapFieldSelected(field: string): boolean {
        const value = this.commonService.session.style.widgets[field];
        return value !== undefined && value !== null && value !== 'None';
    }

    private hasSelectedLookupMapField(): boolean {
        return [
            'map-field-country',
            'map-field-state',
            'map-field-county',
            'map-field-zipcode',
            'map-field-tract'
        ].some(field => this.isMapFieldSelected(field));
    }

    private hasSelectedLatLongMapFields(): boolean {
        return this.isMapFieldSelected('map-field-lat') && this.isMapFieldSelected('map-field-lon');
    }

    private parseMapCoordinateValue(value: any, negativeHemisphere: string): number | null {
        if (value === undefined || value === null || String(value).trim() === '') {
            return null;
        }

        const coordinate = typeof value === 'string'
            ? (value.includes(negativeHemisphere) ? -1 : 1) * parseFloat(value)
            : Number(value);

        return Number.isFinite(coordinate) ? coordinate : null;
    }

    private applyLatLongFieldCoordinates(node: any, latField: string, lonField: string): boolean {
        const latitude = this.parseMapCoordinateValue(node[latField], 'S');
        const longitude = this.parseMapCoordinateValue(node[lonField], 'W');

        if (latitude === null || longitude === null) {
            return false;
        }

        node._lat = latitude;
        node._lon = longitude;
        return true;
    }

    private expandCountryLookupValues(value: any): string[] {
        const values = [value];
        const normalizedValue = this.normalizeMapLookupValue(value);

        if (['us', 'usa', 'united states'].includes(normalizedValue)) {
            values.push('United States of America', 'USA', 'United States', 'US');
        }

        return values;
    }

    private findMapFeature(features: any[], values: any[], propertyNames: string[]): any {
        const normalizedValues = values
            .map(value => this.normalizeMapLookupValue(value))
            .filter(value => value !== '');

        if (normalizedValues.length === 0) {
            return null;
        }

        return features.find(feature => {
            const properties = feature?.properties || {};
            return propertyNames.some(propertyName => {
                const featureValue = propertyName === 'id' ? feature?.id : properties[propertyName];
                return normalizedValues.includes(this.normalizeMapLookupValue(featureValue));
            });
        });
    }

    private applyMapFeatureCoordinates(node: any, feature: any): boolean {
        const properties = feature?.properties || {};
        const latitude = Number(properties._lat);
        const longitude = Number(properties._lon);

        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            return false;
        }

        node._lat = latitude;
        node._lon = longitude;
        return true;
    }

    matchCoordinates(callback, norefresh) {
        if (!norefresh) this.nodes = this.commonService.getVisibleNodes();
        this.nodes.forEach(n => {
            n._lat = undefined;
            n._lon = undefined;
        });
        if (this.commonService.session.style.widgets['map-field-country'] !== 'None') {
            if (!this.commonService.temp.mapData.countries) {
                this.getMapData('countries.json', () => this.matchCoordinates(callback, true));
                return;
            }
            var val = this.commonService.session.style.widgets['map-field-country'];
            this.nodes.forEach(n => {
                const country = this.findMapFeature(
                    this.commonService.temp.mapData.countries.features,
                    this.expandCountryLookupValues(n[val]),
                    ['id', 'name']
                );

                this.applyMapFeatureCoordinates(n, country);
            });
        }
        if (this.commonService.session.style.widgets['map-field-state'] !== 'None') {
            if (!this.commonService.temp.mapData.states) {
                this.getMapData('states.json', () => this.matchCoordinates(callback, true));
                return;
            }
            var sval = this.commonService.session.style.widgets['map-field-state'];
            this.nodes.forEach(n => {
                const state = this.findMapFeature(
                    this.commonService.temp.mapData.states.features,
                    [n[sval]],
                    ['id', 'name', 'usps']
                );

                this.applyMapFeatureCoordinates(n, state);
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

        if (this.hasSelectedLatLongMapFields() && !this.hasSelectedLookupMapField()) {
            var lat = this.commonService.session.style.widgets['map-field-lat'],
                lon = this.commonService.session.style.widgets['map-field-lon'];

            this.nodes.forEach(n => {
                this.applyLatLongFieldCoordinates(n, lat, lon);
            });
        }

        this.applyManualPositions();

        this.refreshNodesWithoutLocationData();

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

    private createMapNodeMarker(
        d: any,
        latlng: L.LatLng,
        isSelectedMarker: boolean,
        draggable: boolean,
        manualPositioningActive: boolean
    ): MarkerWithData {
        const selectedColor = this.commonService.session.style.widgets['selected-color'];
        const mapOpacity = this.commonService.clampStyleAlpha(1 - this.commonService.session.style.widgets['map-node-transparency']);
        const nodeStyle = this.commonService.getNodeFillStyle(d);
        const nodeFillOpacity = this.commonService.clampStyleAlpha(nodeStyle.alpha * mapOpacity);
        const strokeColor = isSelectedMarker ? selectedColor : '#000000';
        const strokeWidth = this.getStrokeWidth(this.getNodeShapeKey(d), isSelectedMarker);
        const shapeKey = this.getNodeShapeKey(d);

        const nodeMarker: MarkerWithData = L.marker(latlng, {
            icon: this.getMapNodeIcon(shapeKey, nodeStyle.color, strokeColor, isSelectedMarker, nodeFillOpacity),
            opacity: 1,
            fillOpacity: nodeFillOpacity,
            fillColor: nodeStyle.color,
            color: strokeColor,
            weight: strokeWidth,
            draggable
        } as L.MarkerOptions & { fillOpacity: number; fillColor: string; color: string; weight: number; draggable: boolean });

        nodeMarker.data = d;

        if (draggable) {
            nodeMarker.on('dragend', (e) => this.onManualPositionMarkerDragEnd(e));
        }

        nodeMarker
            .on('mouseover', (e) => this.showNodeTooltip(e))
            .on('mouseout', (e) => this.hideTooltip())
            .on('click', (e) => {
                if (manualPositioningActive) {
                    this.onManualPositionMarkerClick(e);
                    return;
                }

                this.clickHandler(e);
            });

        return nodeMarker;
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
        var features: Layer[] = [];
        const manualPositioningActive = this.isManualPositioningActive();

        var n = this.nodes.length;
        for (var i = 0; i < n; i++) {
            var d = this.nodes[i];
            if (!this.hasValidMapCoordinates(d) || d.visible === false) continue;

            const isManualPositionTarget = manualPositioningActive
                && String(this.SelectedManualPositionNodeId) === String(d._id);
            const isSelectedMarker = isManualPositionTarget || d.selected === true;
            const nodeMarker = this.createMapNodeMarker(
                d,
                this.getRenderedMapLatLng(d._jlat, d._jlon),
                isSelectedMarker,
                manualPositioningActive,
                manualPositioningActive
            );

            if (d._id !== undefined) {
                this.mapNodeMarkersById[String(d._id)] = nodeMarker;
            }

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
        this.ensureMapLayerPanes();
    
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
    
            if (source && target
                && this.isFiniteMapCoordinate(source._jlat)
                && this.isFiniteMapCoordinate(source._jlon)
                && this.isFiniteMapCoordinate(target._jlat)
                && this.isFiniteMapCoordinate(target._jlon)) {
                const sourceLatLng = this.getRenderedMapLatLng(source._jlat, source._jlon);
                const targetLatLng = this.getRenderedMapLatLng(target._jlat, target._jlon);
                // Handle multiple origins
                if (lcv == 'origin' && d.origin && d.origin.length > 1) {
                    let color1 = this.commonService.temp.style.linkColorMap(d.origin[0]);
                    let color2 = this.commonService.temp.style.linkColorMap(d.origin[1]);
    
                    let dashPattern1 = '10, 10';
                    let dashPattern2 = '0, 10, 10, 0';
    
                    let polyline1 = L.polyline([sourceLatLng, targetLatLng], {
                        pane: this.mapNetworkLinkPaneName,
                        color: color1,
                        dashArray: dashPattern1,
                        opacity: opacity
                    });
    
                    let polyline2: PolyLineWithData = L.polyline([sourceLatLng, targetLatLng], {
                        pane: this.mapNetworkLinkPaneName,
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
                    const connectorLine: PolyLineWithData = L.polyline([sourceLatLng, targetLatLng], {
                        pane: this.mapNetworkLinkPaneName,
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
                this.autoExpandSelectedNode();
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

        //Custom maps render above tile and offline-map backgrounds, but below boundaries, links, and nodes.
        if (this.layers.userGeoJSON && this.commonService.session.style.widgets['map-user-geojson-show']) this.layers.userGeoJSON.bringToFront();
        if (this.layers.floorplanImage && this.commonService.session.style.widgets['map-floorplan-image-show']) this.layers.floorplanImage.bringToFront();

        //User Layers:
        Object.keys(this.layers)
            .filter(l => !this.commonService.includes(['countries', 'states', 'counties', 'countriesLabels', 'statesLabels', 'countiesLabels', 'satellite', 'basemap', 'userGeoJSON', 'floorplanImage', 'floorplanBoundaries', 'links', 'nodes'], l))
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

        if (this.shouldDisableJitterForNode(node)) {
            this.useExactRenderedNodePosition(node);
            return;
        }

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
            if (this.shouldDisableJitterForNode(node)) {
                this.useExactRenderedNodePosition(node);
                continue;
            }
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
        this.reconcileFloorplanBoundaryPlacements(new Set<string>(), false, false);
        this.onDataChange(undefined);
    }

    onFilterDataChange() {
        this.reconcileFloorplanBoundaryPlacements(new Set<string>(), false, false);
        this.onDataChange(undefined);
    }

    loadSettings() {
        this.ensureMapAutoExpandSelectedSetting();
        this.ensureAdminLabelWidgetDefaults();
        this.ensureUserGeoJSONWidgetDefaults();
        this.ensureFloorplanImageWidgetDefaults();
        this.ensureFloorplanBoundaryDefaults();
        this.SelectedManualPositionTypeVariable = "Off";
        this.manualPositionMessage = "";

        // Components | Layers
        this.SelectedBasemapTypeVariable = this.commonService.session.style.widgets['map-basemap-show'] ? 'Show' : 'Hide';
        this.SelectedSatelliteTypeVariable = this.commonService.session.style.widgets['map-satellite-show'] ? 'Show' : 'Hide';
        this.SelectedCountriesTypeVariable = this.getAdminLayerSelection('countries');
        this.SelectedStatesTypeVariable = this.getAdminLayerSelection('states');
        this.SelectedCountiesTypeVariable = this.getAdminLayerSelection('counties');
        const savedFloorplanBackgroundMode = this.getFloorplanBackgroundMode();
        this.SelectedUserGeoJSONTypeVariable = this.commonService.session.style.widgets['map-user-geojson-show']
            ? savedFloorplanBackgroundMode : 'Hide';
        this.SelectedFloorplanImageTypeVariable = this.commonService.session.style.widgets['map-floorplan-image-show']
            ? savedFloorplanBackgroundMode : 'Hide';

        // Apply the saved widget state without rewriting sibling layer preferences during reload.
        this.onBasemapChange(this.SelectedBasemapTypeVariable, true);
        this.onSatelliteChange(this.SelectedSatelliteTypeVariable, true);
        this.onCountriesShowHidChange(this.SelectedCountriesTypeVariable);
        this.onStatesShowHideChange(this.SelectedStatesTypeVariable);
        this.onCountiesShowHideChange(this.SelectedCountiesTypeVariable);
        const savedUserGeoJSONSelection = this.SelectedUserGeoJSONTypeVariable;
        const savedFloorplanImageSelection = this.SelectedFloorplanImageTypeVariable;
        this.restoreUserGeoJSONLayer();
        this.restoreFloorplanImageLayer();
        this.rebuildFloorplanBoundaryLayers();
        if (savedFloorplanImageSelection !== 'Hide' && this.commonService.session.data.floorplanImage) {
            this.onFloorplanImageChange(savedFloorplanBackgroundMode);
        }
        else if (savedUserGeoJSONSelection !== 'Hide' && this.commonService.session.data.geoJSON) {
            this.onUserGeoJSONChange(savedFloorplanBackgroundMode);
        }
        else {
            this.setFloorplanBackgroundMode('Hide');
            this.commonService.session.style.widgets['map-user-geojson-show'] = false;
            this.commonService.session.style.widgets['map-floorplan-image-show'] = false;
            this.SelectedUserGeoJSONTypeVariable = 'Hide';
            this.SelectedFloorplanImageTypeVariable = 'Hide';
            this.removeUserGeoJSONLayer();
            this.removeFloorplanImageLayer();
            this.removeFloorplanBoundaryLayersFromMap();
            this.syncFloorplanBackgroundControls();
        }

        this.SelectedFloorplanBoundaryVisibility = this.commonService.session.style.widgets['map-floorplan-boundaries-show'] ? 'Show' : 'Hide';
        this.SelectedFloorplanBoundaryField = this.commonService.session.data.floorplanBoundaryField || 'None';
        this.reconcileFloorplanBoundaryPlacements(new Set<string>(), false, false);

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
        this.refreshManualPositionControls();
    }

    ngOnDestroy(): void {
        this.autoExpandRequestId++;
        this.cancelFloorplanBoundaryDrawing(false, false);
        if (this.lmap) {
            this.lmap.off('click', this.manualMapClickHandler);
        }
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
    userGeoJSON: L.GeoJSON<any> = geoJSON();
    floorplanImage: ImageOverlay | null = null;
    floorplanBoundaries: FeatureGroup = featureGroup();
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
