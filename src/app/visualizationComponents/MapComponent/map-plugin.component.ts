import { Injector, Component, Output, OnChanges, SimpleChange, EventEmitter, OnInit, NgZone, InjectionToken, ElementRef, ViewChild, ViewContainerRef, ViewChildren, QueryList, ChangeDetectorRef, Renderer2, Inject, OnDestroy } from '@angular/core';
import { EventManager } from '@angular/platform-browser';
import { AppComponentBase } from '@shared/common/app-component-base';
import { CommonService } from '../../contactTraceCommonServices/common.service';
import * as saveAs from 'file-saver';
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
        { label: 'Show', value: 'Show' },
        { label: 'Hide', value: 'Hide' }
    ];
    SelectedCountriesTypeVariable: string = "Show";


    StatesTypes: any = [
        { label: 'Show', value: 'Show' },
        { label: 'Hide', value: 'Hide' }
    ];
    SelectedStatesTypeVariable: string = "Show";


    CountiesTypes: any = [
        { label: 'Show', value: 'Show' },
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

    // clusterImages: any =
    //     {
    //         m1: "data:image/png;base64,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",
    //         m2: "data:image/png;base64,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",
    //         m3: "data:image/png;base64,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",
    //         m4: "data:image/png;base64,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",
    //         m5: 'data:image/png;base64,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'
    //     };

    // getImageValues() {
    //     return(Object.values(this.clusterImages))
    // }

    //locationsFound: any[] = [];

    private lmap: Map;
    private mapTooltip: string = '#mapTooltip'

    nodesWithoutLoc: {index: number, ID: string}[];
    showPopupMessage: boolean = false;

    public leafletMarkers: Layer[] = [];
    public leafletInitialOptions: MapOptions;
    public leafletMarkerClusterOptions: MarkerClusterGroupOptions;

    public isExporting: boolean = false;
    public isExportClosed: boolean = false;
    private exportTryCount: number = 0;

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

        this.container.on('resize', () => { this.lmap.invalidateSize() })
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
        //TODO: put this in a config?
        const mapTokenKey: string = 'sk.eyJ1IjoicndhdHR5IiwiYSI6ImNrY2RuMWlzcDAwMmUyc3A5ejl3ODEzMXoifQ.qpXOouVsI6P8-HOHUWofuQ'

        this.layers.basemap = tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 20,
            attribution: '© <a href="https://openstreetmap.org/about" target="_blank">OpenStreetMap</a> contributors'
        }); 
        this.layers.satellite = tileLayer(`https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v9/tiles/256/{z}/{x}/{y}?access_token=${mapTokenKey}`);

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


        setTimeout(() => {
            this.loadSettings();
            //this.setDefaultAddressFields();
            //this.setDateRangeFilterValues();
            //this.onDataChange(undefined);
        }, 600);
    }

    onMarkerClusterReady(markerCluster: MarkerClusterGroup) {
        this.layers.markerClusterGroup = markerCluster;
    }

    getMarker(latitude: number, longitude: number): Layer {
        return circleMarker([latitude, longitude], {
            color: '#3c4b8d',
            fillColor: '#3c4b8d',
            radius: 5
        });
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
            this.lmap.flyToBounds(this.layers.nodes().getBounds());
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
        this.layers.removeNodes();
        this.nodes.forEach(node => {
            node._jlat = undefined;
            node._jlon = undefined;
        });
    }

    onDataChange(event) {
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
            // that.visuals.gisMap.lmap.flyToBounds(that.layers.nodes().getBounds());
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

        if (e == "Show") {

            this.commonService.session.style.widgets['map-countries-show'] = true;
            this.onSatelliteChange('Hide', true);
            this.onBasemapChange('Hide', true);
            if (this.layers.countries.getLayers().length > 0) {
                this.layers.countries.addTo(this.lmap);
                this.resetStack();
            } else {
                //this.commonService.getMapData('countries.json', () => $(this).trigger('click'));
                this.getMapData('countries.json', () => {
                    this.layers.countries.addTo(this.lmap);
                    this.resetStack();
                });

            }
        }
        else {

            this.commonService.session.style.widgets['map-countries-show'] = false;
            this.layers.countries.remove();

        }
    }


    onStatesShowHideChange(e) {
        this.SelectedStatesTypeVariable = e;

        if (e == "Show") {
            this.commonService.session.style.widgets['map-states-show'] = true;
            if (this.layers.states.getLayers().length > 0) {
                this.layers.states.addTo(this.lmap);
                this.resetStack();
            } else {
                this.getMapData('states.json', () => {
                    this.layers.states.addTo(this.lmap);
                    this.resetStack();
                });
            }
        }
        else {
            this.commonService.session.style.widgets['map-states-show'] = false;
            this.layers.states.remove();
        }
    }


    onCountiesShowHideChange(e) {
        this.SelectedCountiesTypeVariable = e;

        if (e == "Show") {
            this.commonService.session.style.widgets['map-counties-show'] = true;

            if (this.layers.counties.getLayers().length > 0) {
                this.layers.counties.addTo(this.lmap);
                this.resetStack();
            } else {
                this.getMapData('counties.json', () => {
                    this.layers.counties.addTo(this.lmap);
                    this.resetStack();
                });
            }
        }
        else {
            this.commonService.session.style.widgets['map-counties-show'] = false;
            this.layers.counties.remove();
        }
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
                    this.onCountriesShowHidChange('Show');
                    this.onStatesShowHideChange('Show');
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
                    this.onCountriesShowHidChange('Show');
                    this.onStatesShowHideChange('Show');
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
        }
        else {
            this.commonService.session.style.widgets['map-collapsing-on'] = false;
            this.drawNodes(false);
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
            let elementsToExport: HTMLDivElement[] = [this.exportContainer.nativeElement]
            this.exportService.requestExport(elementsToExport, true, true)
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
            }
            if (callback) callback();
        })
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
        if (this.nodesWithoutLoc.length > 0 && nodeLocSet) this.showPopupMessage = true;

        if (callback) callback();
    }

    // getResidenceMarker(nodeColor: string, iconCode: string, location: LocationDetail, data: any): MarkerWithData {
    //     const iconSettings = {
    //         mapIconUrl: iconCode,
    //         mapIconColor: nodeColor,
    //     };

    //     const divIcon = L.divIcon({
    //         className: "leaflet-data-marker",
    //         html: L.Util.template(iconSettings.mapIconUrl, iconSettings),
    //         iconSize: [15, 15]
    //     });

    //     const locationDetail: LocationDetail = {
    //         Name: location.Name,
    //         FullAddress: location.FullAddress,
    //         Date: location.Date ? new Date(location.Date) : undefined,
    //         Latitude: location.Latitude,
    //         Longitude: location.Longitude
    //     }
    //     data._jlat = location.Latitude;
    //     data._jlon = location.Longitude;

    //     let marker: MarkerWithData = L.marker([location.Latitude, location.Longitude], { icon: divIcon });
    //     marker.data = data;
    //     marker.locationDetail = locationDetail;

    //     return marker;
    // }

    // getVenueMarker(nodeColor: string, iconCode: string, location: VenueLocationDetail, data: any): MarkerWithData | undefined {
    //     const iconSettings = {
    //         mapIconUrl: iconCode,
    //         mapIconColor: nodeColor,
    //     };

    //     const divIcon = L.divIcon({
    //         className: "leaflet-data-marker",
    //         html: L.Util.template(iconSettings.mapIconUrl, iconSettings),
    //         iconSize: [15, 15]
    //     });

    //     const locationDetail: LocationDetail = {
    //         Name: location.Name,
    //         FullAddress: location.FullAddress,
    //         Date: location.DateOfContact ? new Date(location.DateOfContact) : undefined,
    //         Latitude: location.Latitude,
    //         Longitude: location.Longitude
    //     }

    //     if (locationDetail.Latitude != undefined && locationDetail.Longitude != undefined) {
    //         let marker: MarkerWithData = L.marker([location.Latitude, location.Longitude], { icon: divIcon });
    //         marker.data = data;
    //         marker.locationDetail = locationDetail;

    //         return marker;
    //     }

    //     return undefined
    // }

    // getExposureMarkers(nodeColor: string, iconCode: string, exposureProp: any, data: any): MarkerWithData[] {
    //     const iconSettings = {
    //         mapIconUrl: iconCode,
    //         mapIconColor: nodeColor,
    //     };

    //     const divIcon = L.divIcon({
    //         className: "leaflet-data-marker",
    //         html: L.Util.template(iconSettings.mapIconUrl, iconSettings),
    //         iconSize: [15, 15]
    //     });

    //     let markers: MarkerWithData[] = [];

    //     let locationDetails: LocationDetail[] = [];

    //     Object.keys(exposureProp).forEach(prop => {
    //         const locationDetail: LocationDetail = {
    //             Name: exposureProp[prop].Name,
    //             FullAddress: exposureProp[prop].FullAddress,
    //             Date: exposureProp[prop].ExposedDate ? new Date(exposureProp[prop].ExposedDate) : undefined,
    //             Latitude: exposureProp[prop].Latitude,
    //             Longitude: exposureProp[prop].Longitude
    //         };

    //         locationDetails.push(locationDetail);

    //         if (locationDetail.Latitude != undefined && locationDetail.Longitude != undefined) {
    //             let marker: MarkerWithData = L.marker([locationDetail.Latitude, locationDetail.Longitude], { icon: divIcon });
    //             marker.data = data;
    //             marker.locationDetail = locationDetail;

    //             markers.push(marker);
    //         }
    //     })

    //     return markers;
    // }

    /*getGeospatialNodes(): MarkerWithData[] {
        let returnMarkerWithData: MarkerWithData[] = [];

        let n = this.nodes.length;

        for (let i = 0; i < n; i++) {
            const venueValue = this.nodes[i][this.SelectedVenueAddress];
            const exposureValue = this.nodes[i][this.SelectedExposureAddress];

            const d = this.nodes[i];
            const nodeColor = this.colorIterator.next();
            let venueMarkers: MarkerWithData[] = [];
            let exposureMarkers: MarkerWithData[] = [];

            if (venueValue) {
                const venues: VenueLocationDetail[] = JSON.parse(venueValue);
                if (venues && Array.isArray(venues))
                    venueMarkers = venues.map(v => this.getVenueMarker(nodeColor, this.marker.triangle, v, d));
                venueMarkers = venueMarkers.filter(x => x != undefined);
            }

            if (exposureValue) {
                const exposures: any = JSON.parse(exposureValue);
                if (exposures)
                    exposureMarkers = this.getExposureMarkers(nodeColor, this.marker.square, exposures, d);
            }

            const residence = this.getResidenceNode(d);
            if (residence && residence.Latitude != 0 && residence.Longitude != 0) {
                returnMarkerWithData.push(this.getResidenceMarker(nodeColor, this.marker.circle, residence, d));
            }

            returnMarkerWithData = returnMarkerWithData.concat(venueMarkers.concat(exposureMarkers));
        }

        return returnMarkerWithData;
    }

    getResidenceNode(data: any): LocationDetail | undefined {
        if (!data ||
            isNaN(data.CasedemographicsLatitude) ||
            isNaN(data.CasedemographicsLongitude) ||
            data.CasedemographicsLatitude == '' ||
            data.CasedemographicsLongitude == '') return undefined;

        return {
            Date: new Date(),
            FullAddress: data.CasedemographicsFullAddress,
            Latitude: data.CasedemographicsLatitude,
            Longitude: data.CasedemographicsLongitude,
            Name: 'Residence'
        };
    } */

    /**
     * Calls drawLeafletMapNodes() which removes all previous nodes from map, updates _j, _theta, _jlat, _jlon for each node
     */
    drawNodes(rerollNodes=true) {
        this.drawLeafletMapNodes(rerollNodes);
    }

    /**
     * Updates map by redrawing nodes
     * @param rerollNodes if true rerolls node positioning
     */
    drawLeafletMapNodes(rerollNodes) {
        if (rerollNodes) {
            this.clearAllMarkers();
            this.rerollNodes();
        } else {
            this.layers.removeNodes();
        }

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
        var fillcolor = this.commonService.session.style.widgets['node-color'],
            colorVariable = this.commonService.session.style.widgets['node-color-variable'],
            selectedColor = this.commonService.session.style.widgets['selected-color'],
            opacity = 1 - this.commonService.session.style.widgets['map-node-transparency'];

        var features: Layer[] = [];

        var n = this.nodes.length;
        for (var i = 0; i < n; i++) {
            var d = this.nodes[i];
            if (!d._jlat || !d._jlon || d.visible === false) continue;

            let circleMarker: CircleWithData = L.circleMarker(L.latLng(d._jlat, d._jlon), {
                weight: d.selected ? 3 : 1,
                color: d.selected ? selectedColor : '#000000',
                opacity: opacity,
                fillColor: colorVariable == 'None' ? fillcolor : this.commonService.temp.style.nodeColorMap(d[colorVariable]),
                fillOpacity: opacity,
                radius: 10
            });

            circleMarker.data = d;

            circleMarker
                .on('mouseover', (e) => this.showNodeTooltip(e))
                .on('mouseout', (e) => this.hideTooltip())
                .on('click', (e) => this.clickHandler(e));


            features.push(circleMarker);
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
                            this.commonService.temp.style.linkColorMap(d[lcv]),
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
            d3.select(this.mapTooltip)
                .html(d[v])
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

        //User Layers:
        Object.keys(this.layers)
            .filter(l => !this.commonService.includes(['countries', 'states', 'counties', 'satellite', 'basemap', 'links', 'nodes'], l))
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

    updateVisualization() {
        this.drawNodes(false);
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
        //Components|Online|Basemap
        console.log('SelectedBasemapTypeVariable: ', this.SelectedBasemapTypeVariable);

        this.SelectedBasemapTypeVariable = this.commonService.session.style.widgets['map-basemap-show'] ? 'Show' : 'Hide';

        //Component for basemap
        if (this.commonService.session.style.widgets['map-basemap-show']) {
            this.onBasemapChange('Show');
        } else if (this.commonService.session.style.widgets['map-satellite-show']) {
            this.onSatelliteChange('Show');
        } else {
            this.onCountriesShowHidChange('Show');
        }

        //Components|Network|Nodes
        this.SelectedNodesTypeVariable = this.commonService.session.style.widgets['map-node-show'] ? 'Show' : 'Hide';
        this.onMapNodeShowHideChange(this.SelectedNodesTypeVariable);

        //Components|Network|Links
        this.SelectedLinksTypeVariable = this.commonService.session.style.widgets['map-link-show'] ? 'Show' : 'Hide';
        this.onMapLinksShowHideChange(this.SelectedLinksTypeVariable);

        //Components|Offline|States
        this.SelectedStatesTypeVariable = this.commonService.session.style.widgets['map-states-show'] ? 'Show' : 'Hide';
        this.onStatesShowHideChange(this.SelectedStatesTypeVariable);

        //Components|Offline|Counties
        this.SelectedCountiesTypeVariable = this.commonService.session.style.widgets['map-counties-show'] ? 'Show' : 'Hide';
        this.onCountiesShowHideChange(this.SelectedCountiesTypeVariable);

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

        //Nodes|Transparency
        this.SelectedNodeTransparencyVariable = this.commonService.session.style.widgets['map-node-transparency'];
        this.onNodeTransparencyChange(this.SelectedNodeTransparencyVariable);

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

    public nodes(): FeatureGroup | MarkerClusterGroup {
        if (this.markerClusterGroup.getLayers().length) return this.markerClusterGroup;
        return this.featureGroup;
    }

    public removeNodes() {
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