import { ChangeDetectionStrategy, Component, OnInit, Injector, ViewChild, ViewChildren, AfterViewInit, Compiler, TemplateRef, ComponentRef, ViewContainerRef, QueryList, ElementRef, Output, EventEmitter, ChangeDetectorRef, OnDestroy, ViewEncapsulation, Renderer2 } from '@angular/core';
import { ComponentFactoryResolver } from '@angular/core';
import { CommonService } from './contactTraceCommonServices/common.service';
import { FilesComponent } from './filesComponent/files-plugin.component';
import { TwoDComponent } from './visualizationComponents/TwoDComponent/twoD-plugin.component';
import { ThreeDComponent } from './visualizationComponents/ThreeDComponent/threeD-plugin-component';
import { TableComponent } from './visualizationComponents/TableComponent/table-plugin-component';
import { AggregationComponent } from './visualizationComponents/AggregationComponent/aggregation-plugin.component';
import { HistogramComponent } from './visualizationComponents/HistogramComponent/histogram-plugin.component';
import { BubblesComponent } from './visualizationComponents/BubblesComponent/bubbles-plugin.component';
import { FlowDiagramComponent } from './visualizationComponents/FlowDiagrmComponent/flowDiagram-plugin.component';
import { ScatterPlotComponent } from './visualizationComponents/ScatterPlotComponent/scatterPlot-plugin.component';
import { WaterfallComponent } from './visualizationComponents/WaterfallComponent/waterfall-plugin.component';
import { MapComponent } from './visualizationComponents/MapComponent/map-plugin.component';
import { GanttComponent } from './visualizationComponents/GanttCompnent/gantt-plugin.component';
import { TimelineComponent } from './visualizationComponents/TimelineComponent/timeline-plugin.component';
import { HeatMapComponent } from './visualizationComponents/HeatMapComponent/heatMap-plugin.component';
import { PhylogeneticComponent } from './visualizationComponents/PhylogeneticComponent/phylogenetic-plugin.component';
import * as d3 from 'd3';
import { window, TabsetComponent } from 'ngx-bootstrap';
import { TabView, TabPanel, Button } from 'primeng/primeng';
import { AppComponentBase } from '@shared/common/app-component-base';
import { SelectItem, TreeNode } from 'primeng/api';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { AppSessionService } from '@shared/common/session/app-session.service';
import { DialogSettings } from './helperClasses/dialogSettings';
import * as saveAs from 'file-saver';
import { StashObjects, HomePageTabItem } from './helperClasses/interfaces';
import { Observable, forkJoin } from 'rxjs';
import { MicrobeTraceNextVisuals } from './microbe-trace-next-plugin-visuals';
import * as _ from 'lodash';
import { ActivatedRoute } from '@angular/router';
import { first } from 'rxjs/operators';
import { EventEmitterService } from '@shared/utils/event-emitter.service';
// import * as moment from 'moment';
import moment from 'moment';

// import {
//     GoldenLayoutModule,
//     GoldenLayoutService,
//     GoldenLayoutConfiguration,
//     MultiWindowService,
//     GoldenLayoutComponent,
//   } from '@embedded-enterprises/ng6-golden-layout';

import { Tabulator } from 'tabulator-tables';

import { Subscription } from 'rxjs';


@Component({
    changeDetection: ChangeDetectionStrategy.Default,
    selector: 'contact-trace',
    encapsulation: ViewEncapsulation.None,
    templateUrl: './microbe-trace-next-plugin.component.html',
    styleUrls: ['./microbe-trace-next-plugin.component.less']
})

export class MicrobeTraceNextHomeComponent extends AppComponentBase implements AfterViewInit, OnInit, OnDestroy {


    // recommit original code
    @ViewChild('stashes', { static: false }) stashes: ElementRef;

    // @ViewChild('goldenLayout', { static: false }) goldenLayout: GoldenLayoutComponent;
    @ViewChild('goldenLayout', { static: false }) goldenLayout : any;


    public metric: string = "tn93";
    public ambiguity: string = "Average";
    public launchView: string = "2D Network";
    public threshold: string = "0.015";

    elem: any;
    showSettings: boolean = false;
    showExport: boolean = false;
    showCenter: boolean = false;
    showPinAllNodes: boolean = false;
    showRefresh: boolean = false;
    showButtonGroup: boolean = false;
    showSorting: boolean = false;


    downloadedBlocks: string[] = [];
    ledgerOptions: TreeNode[] = [];
    ledgerOptionSelected: any[] = [];
    ledgerOptionSelectedFlag: boolean = true;
    selectedItemsLabel = 'Choose';

    dataSetView: SelectItem[];
    dataSetViewSelected: string;
    tabSet: any;
    filedata: any;
    fileExtension: string;
    activeTabIndex: any;
    displayHelp: boolean = false;
    displayAbout: boolean = false;
    displayStashDialog: boolean = false;
    displayUrlDialog: boolean = false;
    displayRecallStashDialog: boolean = false;
    displayLedgerLoaderDialog: boolean = false;
    version: string = '0.6.1';
    auspiceUrlVal: string = '';

    saveFileName: string = '';

    searchField: string = '';
    searchText: string = '';

    private subscription: Subscription;


    // posts: BlockchainProofHashDto[] = new Array<BlockchainProofHashDto>();
    // Blockchaindata: BlockchainProofHashDto = new BlockchainProofHashDto();
    date: Date;
    // Inputdownloadblock: DownloadFilteredBlockDto = new DownloadFilteredBlockDto();
    Filepath: SafeResourceUrl;

    BlockChainLedgerNodeList: any[] = [];
    BlockChainLedgerEdgeList: any[] = [];



    FieldList: SelectItem[] = [];
    ToolTipFieldList: SelectItem[] = [];

    PruneWityTypes: any = [
        { label: 'None', value: 'None' },
        { label: 'Nearest Neighbor', value: 'Nearest Neighbor' }
    ];
    SelectedPruneWityTypesVariable: string = 'None';


    SelectedClusterMinimumSizeVariable: any = 0;
    SelectedLinkSortVariable: string = 'Distance';
    SelectedLinkThresholdVariable: any = parseFloat(this.threshold);
    SelectedDistanceMetricVariable = this.metric;

    RevealTypes: any = [
        { label: 'Everything', value: 'Everything' }
    ];
    SelectedRevealTypesVariable: string = 'Everything';


    StatisticsTypes: any = [
        { label: 'Show', value: 'Show' }, 
      { label: 'Hide', value: 'Hide' }
    ];
    SelectedStatisticsTypesVariable: string = 'Show';

    SelectedColorNodesByVariable: string = 'None';
    SelectedNodeColorVariable: string = '#1f77b4';
    SelectedLinkColorVariable: string = '#1f77b4';
    SelectedColorLinksByVariable: string = 'origin';

    SelectedTimelineVariable: string = 'None';


    LinkColorTableTypes: any = [
        { label: 'Show', value: 'Show' },
        { label: 'Hide', value: 'Hide' }
    ];
    SelectedLinkColorTableTypesVariable: string = 'Hide';

    NodeColorTableTypes: any = [
        { label: 'Show', value: 'Show' },
        { label: 'Hide', value: 'Hide' }
    ];
    SelectedNodeColorTableTypesVariable: string = 'Hide';


    SelectedColorVariable: string = '#ff8300';
    SelectedBackgroundColorVariable: string = '#ffffff';
    SelectedApplyStyleVariable: string = '';


    activeTabNdx = null;
    ShowGlobalSettingsLinkColorTable: boolean = false;
    ShowGlobalSettingsNodeColorTable: boolean = false;
    // user: UserEditDto = new UserEditDto();
    roles: Array<string> = new Array<string>();

    ShowGlobalSettingsSettingsPane: boolean = false;
    GlobalSettingsDialogSettings: DialogSettings;
    GlobalSettingsLinkColorDialogSettings: DialogSettings;
    GlobalSettingsNodeColorDialogSettings: DialogSettings;

    cachedGlobalSettingsVisibility: boolean = false;
    cachedGlobalSettingsLinkColorVisibility: boolean = false;
    cachedGlobalSettingsNodeColorVisibility: boolean = false;

    cmpRef: ComponentRef<any>;

    public playBtnText: string = "Play";

    public handle: any;
    
    public label: any;

    public xAttribute: any;

    public handleDateFormat: any;

    public currentTimelineValue: any;

    public currentTimelineTargetValue: any;

    private previousTab: string = '';

    private visuals: MicrobeTraceNextVisuals;

    private bpaaSPayloadWrappers: BpaaSPayloadWrapper[] = [];

    @Output() DisplayGlobalSettingsDialogEvent = new EventEmitter();

    // @ViewChild(TabView) tabView: TabView;
    @ViewChild('dataSet', { static: false }) dataSet: Selection;
    // @ViewChildren('placeholder', { read: ViewContainerRef, static: false }) targets: QueryList<ViewContainerRef>
    @ViewChildren('placeholder', { read: ViewContainerRef }) targets: QueryList<ViewContainerRef>

    @ViewChild('ledgerloader', { static: false }) spinnerElement: ElementRef;
    @ViewChild('ledgerloadDiv', { static: false }) spinnerDivElement: ElementRef;
    @ViewChild('globalSettingsTab', { static: false }) globalSettingsTab: TabsetComponent;

    @ViewChild('pinbutton', { static: false }) pinBtn: ElementRef<HTMLElement>;


    public HideThisForNow: boolean = false;

    files: any[] = [];

    homepageTabs: HomePageTabItem[] = [
        {
            label: 'Files',
            templateRef: null,
            tabTitle: 'Files',
            isActive: true,
            componentRef: null
        }
    ];

    constructor(
        injector: Injector,
        private cfr: ComponentFactoryResolver,
        private compiler: Compiler,
        public commonService: CommonService,
        // private keenService: BpaasLedgerPluginServiceProxy,
        // private _userService: UserServiceProxy,
        public domSanitizer: DomSanitizer,
        private cdref: ChangeDetectorRef,
        private eventEmitterService: EventEmitterService,
        // private bpaasLedgerPluginServiceProxy: BpaasLedgerPluginServiceProxy,
        private route: ActivatedRoute,
        // private srv: GoldenLayoutService
    ) {


        super(injector);

        this.visuals = commonService.visuals;
        this.visuals.microbeTrace = this;

        this.appSession = injector.get(AppSessionService);

        this.activeTabIndex = 0;

        this.dataSetView = [];
        this.dataSetView.push({ label: 'Nodes', value: 'Node' });
        this.dataSetView.push({ label: 'Links', value: 'Link' });
        this.dataSetView.push({ label: 'Clusters', value: 'Cluster' });

        this.dataSetViewSelected = "Node";

        // setTimeout(() => {
        //     srv.createNewComponent(srv.getRegisteredComponents()[0]);
        //   }, 1000);

        //   setTimeout(() => {
        //     srv.createNewComponent(srv.getRegisteredComponents()[0]);
        //   }, 10000);
    }

    ngOnInit() {

        this.getGlobalSettingsData();

        this.elem = document.documentElement;

        if (!this.GlobalSettingsDialogSettings) {
            this.GlobalSettingsDialogSettings = new DialogSettings('#global-settings-modal', false);
        }
        if (!this.GlobalSettingsLinkColorDialogSettings) {
            this.GlobalSettingsLinkColorDialogSettings = new DialogSettings('#global-settings-link-color-table', false);
        }
        if (!this.GlobalSettingsNodeColorDialogSettings) {
            this.GlobalSettingsNodeColorDialogSettings = new DialogSettings('#global-settings-node-color-table', false);
        }

        // console.log(this.commonService.GlobalSettingsModel.SelectedLinkThresholdVariable);
        this.SelectedPruneWityTypesVariable = this.commonService.GlobalSettingsModel.SelectedPruneWityTypesVariable;

        //debugger;
        this.SelectedClusterMinimumSizeVariable = this.commonService.GlobalSettingsModel.SelectedClusterMinimumSizeVariable;
        this.SelectedLinkSortVariable = this.commonService.GlobalSettingsModel.SelectedLinkSortVariable;
        this.SelectedLinkThresholdVariable = this.commonService.GlobalSettingsModel.SelectedLinkThresholdVariable;
        this.threshold = this.SelectedLinkThresholdVariable;
        this.commonService.session.style.widgets['link-threshold'] = this.SelectedLinkThresholdVariable;
        this.SelectedRevealTypesVariable = this.commonService.GlobalSettingsModel.SelectedRevealTypesVariable;
        this.SelectedStatisticsTypesVariable = this.commonService.GlobalSettingsModel.SelectedStatisticsTypesVariable;

        this.SelectedColorNodesByVariable = this.commonService.GlobalSettingsModel.SelectedColorNodesByVariable;
        this.SelectedNodeColorVariable = this.commonService.session.style.widgets['node-color'];
        this.SelectedColorLinksByVariable = this.commonService.session.style.widgets['link-tooltip-variable'];

        this.SelectedTimelineVariable = this.commonService.session.style.widgets['node-timeline-variable'];
        this.SelectedColorVariable = this.commonService.session.style.widgets['selected-color'];

        this.SelectedLinkColorTableTypesVariable = this.commonService.GlobalSettingsModel.SelectedLinkColorTableTypesVariable;
        this.SelectedApplyStyleVariable = this.commonService.GlobalSettingsModel.SelectedApplyStyleVariable;

        this.commonService.updateThresholdHistogram();

        console.log("global settings: ", this.commonService.GlobalSettingsModel.SelectedLinkThresholdVariable);
        console.log("SelectedLinkThresholdVariable: ", this.SelectedLinkThresholdVariable);

         // Update distance metric in cashe
         let cachedLSV = "";
         let cachedView = "";

        this.commonService.localStorageService.getItem('default-distance-metric', (err, result) => {
            // Run this code once the value has been
            // loaded from the offline store.
            cachedLSV = result;
        });

        this.commonService.localStorageService.getItem('default-view', (err, result) => {
            cachedView = result;
        });



        // console.log('instanceeee: ', this.goldenLayout.componentInstances);

        setTimeout(() => {
            $('#top-toolbar').fadeTo("slow", 1);
            // this.homepageTabs[0].componentRef = this.goldenLayout.componentInstances[0];


            this.subscription = this.homepageTabs[0].componentRef.LoadDefaultVisualizationEvent.subscribe((v) => {
                console.log('loading default: ', v);
                this.loadDefaultVisualization(v);
                this.publishLoadNewData();
            });
            
        }, 1000);
        setTimeout(() => {
            if (cachedLSV) {
                console.log('cacheL 2: ', cachedLSV);
                if (cachedLSV === 'snps') {
                   this.metric = 'snps';
                   this.threshold = '16';
                   $('#ambiguities-menu').hide();
                } else {
                   this.metric = 'tn93';
                   this.threshold = '0.015';
                }

               this.SelectedLinkThresholdVariable = parseFloat(this.threshold);
               this.SelectedDistanceMetricVariable = this.metric;
               this.commonService.session.style.widgets['default-distance-metric'] = this.metric;
               this.commonService.session.style.widgets['link-threshold'] = parseFloat(this.threshold);
               this.onLinkThresholdChanged();
            }

            if (cachedView) {
                // this.updateLaunchView(cachedView);
            }

            $("#welcome-title").animate({
                marginTop: '-30px',
                opacity: '1'
            }, 1000);

        }, 2000);
        setTimeout(() => {
            $("#welcome-description").animate({
                marginTop: '0px',
                opacity: '1'
            }, 1000);


        }, 3000);
        setTimeout(() => {
            $('#visualwrapper').fadeTo("slow", 1);
            $('#add-data-container').fadeTo("slow", 1);
            $('#onload-container').fadeTo("slow", 1);
            $('#tool-btn-container').fadeTo("slow", 1);
            // console.log('instances: ',this.goldenLayout.componentInstances);
        }, 5000);
        
       
        // reader.onloadend = out => this.commonService.processJSON(out.target, extension);
    }


    /**
     * Delete file from files list
     * @param index (File index)
     */
    deleteFile(index: number) {
        this.files.splice(index, 1);
    }

    public onSearch() {
        
        let nodes = this.visuals.twoD.commonService.session.data.nodes;
        const n = nodes.length;

        let v = this.searchText;
        const val = v;

        console.log('text ', v);

        if (v == "") {
          $('#search-results').html("").hide();
          for(let i = 0; i < n; i++){
            nodes[i].selected = false;
          }
        } else {
          $('#search-results').html("").hide();
          const field = this.commonService.session.style.widgets["search-field"];
          
          let dataSet = new Set();
          for(let i = 0; i < n; i++){
            let node = nodes[i];
            if (node[field]) {
  
              const encodedField = (node[field]).replace(/[\u00A0-\u9999<>\&]/g, function(i) {
                return '&#'+i.charCodeAt(0)+';';
             });
              dataSet.add(`${encodedField}`);
            }
          }
          let dataArray = Array.from(dataSet).sort();
          //#298
          if (this.commonService.session.style.widgets["search-whole-word"])  v = '\\b' + v + '\\b';
          let vre;
          if (this.commonService.session.style.widgets["search-case-sensitive"])  vre = new RegExp(v);
          else  vre = new RegExp(v, 'i');
  
          dataArray.forEach(element => {
            if ((element as any).match(vre)) {
                let $li = $('<li/>')
                    .html(element as string)
                    .attr('data-value', element as string);
                $('#search-results').append($li).show();
              }
          });

        let that = this;
          
          $('.autocomplete-wrapper li').on('click', function() {
            let ac_v = $(this).attr('data-value');
            const ac_val = ac_v;
            let ac_vre;
            $('#search').val(ac_v);
            $('#search-results').html("").hide();
          
            if (that.commonService.session.style.widgets["search-whole-word"])  ac_v = '\\b' + ac_v + '\\b';
            if (that.commonService.session.style.widgets["search-case-sensitive"])  ac_vre = new RegExp(ac_v);
            else ac_vre = new RegExp(ac_v, 'i');
  
            for(let i = 0; i < n; i++){

              let node = nodes[i];

              if (node._id == "30576_KF773420_B90cl28") {
                console.log('in node: ', _.cloneDeep(node));
              }
              if (!node[field]) {
                node.selected = false;
              }
              if (typeof node[field] == "string") {
                node.selected = ac_vre.test(node[field]);
              }
              if (typeof node[field] == "number") {
                node.selected = (node[field] + "" == ac_val);
              }

            }

            console.log('node select 1');

            $(document).trigger("node-selected");

          });
  
          for(let i = 0; i < n; i++){
  
            let node = nodes[i];

            if (!node[field]) {
              node.selected = false;
            }
            if (typeof node[field] == "string") {
              node.selected = vre.test(node[field]);
            }
            if (typeof node[field] == "number") {
              node.selected = (node[field] + "" == val);
            }
          }
  
          if (!nodes.some(node => node.selected)) console.log('no matches');
        }

        console.log('node select 2');
        $(document).trigger("node-selected");
    }


    public onSearchFieldChange(ev) {
        this.commonService.session.style.widgets["search-field"] = ev;
        this.onSearch();
    }

    public onWholeWordChange() {
        this.commonService.session.style.widgets["search-whole-word"] = !this.commonService.session.style.widgets["search-whole-word"];
        this.onSearch();
    }

    public onCaseSensitiveChange() {
        this.commonService.session.style.widgets["search-case-sensitive"] = !this.commonService.session.style.widgets["search-case-sensitive"];
        this.onSearch();
    }


    /**
     * Convert Files list to normal array list
     * @param files (Files List)
     */
    prepareFilesLists($event) {

        this.commonService.session.files = [];
      if (!this.commonService.session.style.widgets) {
        console.log('Greating default style widget');
          this.commonService.session.style.widgets = this.commonService.defaultWidgets();
      }

        console.log('threshold: ', this.commonService.session.style.widgets['link-threshold']);
        // this.loadSettings();
 
        // this.homepageTabs[1].isActive = false;
        this.homepageTabs[0].isActive = true;
        $('#overlay').fadeOut();
        $('.ui-tabview-nav').fadeTo("slow", 1);
        $('.m-portlet').fadeTo("slow", 1);
        this.showExport = false;
        this.showCenter = false;
        this.showPinAllNodes = false;
        this.showRefresh = false;
        this.showButtonGroup = false;
        this.showSorting = false;

        // Remove the default tab
        this.removeTab({index : 1})

        console.log('homepage tabs1: ', this.homepageTabs);
        // console.log('instances1: ', this.goldenLayout.componentInstances);

        this.getfileContent($event);
    }

    /**
     * Updates metric based on selection
     * @param value - metric selected
     */
     public updateMetric( value: string ) : void {
        this.metric = value;
        console.log('metric updating');
        console.log('updating metric: ', this.metric);

        if (this.metric === "SNPs") {
            //Hide Ambiguities
            $('#ambiguities-menu').hide();
            this.threshold = "7";
            this.commonService.session.style.widgets["link-threshold"] = 7;
        } else {

            $('#ambiguities-menu').show();
            this.threshold = "0.015";
            this.commonService.session.style.widgets["link-threshold"] = 0.015;
        }

        // Update distance metric in style
        this.commonService.session.style.widgets['default-distance-metric'] = this.metric.toLocaleLowerCase();
        this.commonService.localStorageService.setItem('default-distance-metric', this.metric.toLocaleLowerCase());

    }

    /**
     * Updates ambiguity based on selection and store in style widgets
     * @param value - ambiguity selected
     */
     public updateAmbiguity( value: string ) : void {
        this.ambiguity = value;
        this.commonService.session.style.widgets['ambiguity-resolution-strategy'] = this.ambiguity.toLocaleUpperCase();

    }

    /**
     * Updates launch view based on selection
     * @param value - view selected
     */
     public updateLaunchView( value: string ) : void {
        this.launchView = value;

        this.commonService.localStorageService.setItem('default-view', this.launchView);
        this.commonService.session.style.widgets['default-view'] = this.launchView;
        this.commonService.session.layout.content[0].type = this.launchView;

    }

    /**
     * Updates threshold based on selection and stores in style widget
     */
     public updateThreshold(ev : any) : void {
        this.threshold = ev.target.value;
        console.log('threshold: ', this.threshold);
        this.SelectedLinkThresholdVariable = this.threshold;
        this.commonService.GlobalSettingsModel.SelectedLinkThresholdVariable = this.SelectedLinkThresholdVariable;
        console.log('loading settingss1: ', this.visuals.microbeTrace.commonService.session.style.widgets["link-threshold"]);
        this.visuals.microbeTrace.commonService.session.style.widgets["link-threshold"] = Number(this.threshold);
        console.log('loading settingss2: ', this.visuals.microbeTrace.commonService.session.style.widgets["link-threshold"]);
    }

    /**
     * Handler for recall btn
     * Opens recall window
     * @param {void}
     */
     public recallClicked() : void {
    }

    /**
     * Handler for continue btn
     * Opens recall window
     * @param {void}
     */
     public continueClicked() : void {
        $('#overlay').fadeOut("slow");
        $('.ui-tabview-nav').fadeTo("slow", 1);
        $('.m-portlet').fadeTo("slow", 1);
    }



    onBackgroundChanged() {

        this.visuals.microbeTrace.commonService.session.style.widgets['background-color'] = this.visuals.microbeTrace.SelectedBackgroundColorVariable;

        if ($('#network') != undefined) {
            $('#network').css('background-color', this.SelectedBackgroundColorVariable);
        }

    }


    onMinimumClusterSizeChanged() {

        this.visuals.microbeTrace.commonService.GlobalSettingsModel.SelectedClusterMinimumSizeVariable = this.visuals.microbeTrace.SelectedClusterMinimumSizeVariable;

        let val = parseInt(this.visuals.microbeTrace.SelectedClusterMinimumSizeVariable);

        this.visuals.microbeTrace.commonService.session.style.widgets["cluster-minimum-size"] = val;

        this.visuals.microbeTrace.commonService.setClusterVisibility(true);
        this.visuals.microbeTrace.commonService.setLinkVisibility(true);
        this.visuals.microbeTrace.commonService.setNodeVisibility(true);

        this.visuals.microbeTrace.updatedVisualization();

        this.visuals.microbeTrace.commonService.updateStatistics();

    }


    onLinkSortChanged() {

        this.visuals.microbeTrace.commonService.GlobalSettingsModel.SelectedLinkSortVariable = this.visuals.microbeTrace.SelectedLinkSortVariable;

        this.visuals.microbeTrace.commonService.session.style.widgets["link-sort-variable"] = this.visuals.microbeTrace.SelectedLinkSortVariable;
        this.visuals.microbeTrace.commonService.updateThresholdHistogram();
        this.visuals.microbeTrace.commonService.updateNetwork();

    }

    public onApplyStyle( file: any ){

        console.log('aplystin stay')
        if (this.files.length > 0) {
            let reader = new FileReader();
            reader.onload = e => this.commonService.applyStyle(JSON.parse((e as any).target.result));
            reader.readAsText(this.files[0]);
          }

    }



    onPruneWithTypesChanged() {

        this.visuals.microbeTrace.commonService.GlobalSettingsModel.SelectedPruneWityTypesVariable = this.visuals.microbeTrace.SelectedPruneWityTypesVariable;

        //debugger;

        if (this.visuals.microbeTrace.SelectedPruneWityTypesVariable == "None") {
            this.visuals.microbeTrace.commonService.session.style.widgets["link-show-nn"] = false;
            this.visuals.microbeTrace.commonService.updateNetwork();

            this.visuals.microbeTrace.updatedVisualization();
        }
        else {
            this.visuals.microbeTrace.commonService.session.style.widgets["link-show-nn"] = true;

            if(!this.visuals.microbeTrace.commonService.session.style.widgets["mst-computed"]) {
                this.visuals.microbeTrace.commonService.computeMST().then(this.visuals.microbeTrace.commonService.updateNetwork);
                this.visuals.microbeTrace.commonService.session.style.widgets["mst-computed"] = true;
              } else {
                this.visuals.microbeTrace.commonService.updateNetwork();

              }

            this.visuals.microbeTrace.updatedVisualization();
        }

    }



    onLinkColorTableChanged() {

        this.commonService.GlobalSettingsModel.SelectedLinkColorTableTypesVariable = this.SelectedLinkColorTableTypesVariable;

        if (this.SelectedLinkColorTableTypesVariable == "Hide") {
            this.GlobalSettingsLinkColorDialogSettings.setVisibility(false);
        }
        else {
            this.onColorLinksByChanged();
        }
    }


    onNodeColorTableChanged() {

        this.commonService.GlobalSettingsModel.SelectedNodeColorTableTypesVariable = this.SelectedNodeColorTableTypesVariable;

        if (this.SelectedNodeColorTableTypesVariable == "Hide") {
            this.GlobalSettingsNodeColorDialogSettings.setVisibility(false);
        }
        else {
            this.onColorNodesByChanged();
        }
    }



    onShowStatisticsChanged() {


        if (this.SelectedStatisticsTypesVariable === "Show"){
            console.log('updateing 1: ' );
            this.visuals.microbeTrace.commonService.updateStatistics();
            $("#network-statistics-wrapper").fadeIn();
        } else {
            console.log('updateing 12 ' );
            this.visuals.microbeTrace.commonService.updateStatistics();
            $("#network-statistics-wrapper").fadeOut();
        }
  

        this.commonService.GlobalSettingsModel.SelectedStatisticsTypesVariable = this.SelectedStatisticsTypesVariable;


        // if (this.homepageTabs[this.activeTabNdx].label == "2D Network") {
        //     this.homepageTabs[this.visuals.microbeTrace.activeTabNdx].componentRef.enableSettings();
        // }

    }

    onNodeColorChanged() {

        let variable = this.SelectedNodeColorVariable;
        this.commonService.session.style.widgets["node-color"] = variable;

        this.publishUpdateNodeColors();
    }

    publishUpdateNodeColors() {
        // if(this.goldenLayout.componentInstances[1]) {
        //     this.goldenLayout.componentInstances[1].updateNodeColors();
        // }
        this.homepageTabs.forEach(tab => {
            if (tab.componentRef &&
                tab.componentRef.updateNodeColors) {
                tab.componentRef.updateNodeColors();
            }
        })
    }

    publishUpdateVisualization() {
        // if(this.goldenLayout.componentInstances[1]) {
        //     this.goldenLayout.componentInstances[1].updateVisualization();
        // }
        this.homepageTabs.forEach(tab => {
            if (tab.componentRef &&
                tab.componentRef.updateVisualization) {
                tab.componentRef.updateVisualization();
            }
        })
    }

    publishUpdateLinkColor() {

        // this.goldenLayout.componentInstances[1].updateLinkColor();

        // this.homepageTabs.forEach(tab => {
        //     if (tab.componentRef &&
        //         tab.componentRef.instance.updateLinkColor) {
        //         tab.componentRef.instance.updateLinkColor();
        //     }
        // })
    }

    public onLinkColorChanged() : void {

        console.log('color change');

        this.commonService.session.style.widgets["link-color"] = this.SelectedLinkColorVariable;

        this.publishUpdateLinkColor();

    }

    onColorLinksByChanged() {

        console.log('links changed by');
        this.visuals.microbeTrace.SelectedColorLinksByVariable = this.visuals.microbeTrace.SelectedColorLinksByVariable;

        this.visuals.microbeTrace.commonService.GlobalSettingsModel.SelectedColorLinksByVariable = this.visuals.microbeTrace.SelectedColorLinksByVariable;

        if (!this.GlobalSettingsLinkColorDialogSettings.isVisible) {

            if (this.SelectedColorLinksByVariable != "None") {
                this.GlobalSettingsLinkColorDialogSettings.setVisibility(true);
                this.cachedGlobalSettingsLinkColorVisibility = this.GlobalSettingsLinkColorDialogSettings.isVisible;
                this.SelectedLinkColorTableTypesVariable = "Show";
                this.cdref.detectChanges();
            }
        }

        this.visuals.microbeTrace.commonService.GlobalSettingsModel.SelectedColorLinksByVariable = this.visuals.microbeTrace.SelectedColorLinksByVariable;
        this.visuals.microbeTrace.commonService.session.style.widgets['link-color-variable'] = this.visuals.microbeTrace.SelectedColorLinksByVariable;


        if (this.SelectedColorLinksByVariable != "None") {

            this.generateNodeLinkTable("#link-color-table");

            $('#link-color-value-row').slideUp();

            //If hidden by default, unhide to perform slide up and down
            if(!this.ShowGlobalSettingsLinkColorTable){
                this.ShowGlobalSettingsLinkColorTable = true;
            } else {
                $('#link-color-table-row').slideDown();
            }

            this.publishUpdateLinkColor();
        }
        else {

            $('#link-color-value-row').slideDown();
            $('#link-color-table-row').slideUp();
            this.SelectedLinkColorTableTypesVariable='Hide';
            this.onLinkColorTableChanged();

            this.publishUpdateLinkColor();

        }
    }

    generateNodeLinkTable(tableId: string, isEditable: boolean = true) {
        let linkColorTable = $(tableId)
            .empty()
            .append(
                "<tr>" +
                ("<th class='p-1' >Link " + this.visuals.microbeTrace.commonService.titleize(this.visuals.microbeTrace.SelectedColorLinksByVariable) + "</th>") +
                (this.visuals.microbeTrace.commonService.session.style.widgets["link-color-table-counts"] ? "<th>Count</th>" : "") +
                (this.visuals.microbeTrace.commonService.session.style.widgets["link-color-table-frequencies"] ? "<th>Frequency</th>" : "") +
                "<th>Color</th>" +
                "</tr>"
            );

        if (!this.visuals.microbeTrace.commonService.session.style.linkValueNames)
            this.visuals.microbeTrace.commonService.session.style.linkValueNames = {};
            
        let aggregates = this.visuals.microbeTrace.commonService.createLinkColorMap();
        let vlinks = this.visuals.microbeTrace.commonService.getVisibleLinks();
        let aggregateValues = Object.keys(aggregates);

        const disabled: string = isEditable ? '' : 'disabled';

        aggregateValues.forEach((value, i) => {

            // Grab color of link from session
            const color = this.visuals.microbeTrace.commonService.temp.style.linkColorMap(value);

            // Create color input element with color value and assign id to retrieve new value on change
            let colorinput = $(`<input type="color" value="${color}" ${disabled}>`)
                .on("change", e => {

                    // Need to get value from id since "this" keyword is used by angular
                    // Update that value at the index in the color table
                    this.visuals.microbeTrace.commonService.session.style.linkColors.splice(i, 1,e.target['value']);

                    // Generate new color map with updated table
                    this.visuals.microbeTrace.commonService.temp.style.linkColorMap = d3
                        .scaleOrdinal(this.visuals.microbeTrace.commonService.session.style.linkColors)
                        .domain(aggregateValues);


                    // Call the updateLinkColor method in the active tab
                    // this.goldenLayout.componentInstances[1].updateLinkColor();
                    this.visuals.microbeTrace.homepageTabs[this.visuals.microbeTrace.activeTabNdx].componentRef.updateLinkColor();

                });

            let alphainput = $(`<a class="transparency-symbol">⇳</a>`)
                .on("click", e => {

                    $("#color-transparency-wrapper").css({
                        top: e.clientY + 129,
                        left: e.clientX,
                        display: "block"
                    });

                    $("#color-transparency")
                        .val(this.visuals.microbeTrace.commonService.session.style.linkAlphas[i])
                        .on("change", (f) => {

                            // Update table with new alpha value
                            // Need to get value from id since "this" keyword is used by angular
                            this.visuals.microbeTrace.commonService.session.style.linkAlphas.splice(i, 1, parseFloat((f.target['value'] as string)));
                            this.visuals.microbeTrace.commonService.temp.style.linkAlphaMap = d3
                                .scaleOrdinal(this.visuals.microbeTrace.commonService.session.style.linkAlphas)
                                .domain(aggregateValues);
                            $("#color-transparency-wrapper").fadeOut();

                            this.visuals.microbeTrace.homepageTabs[this.visuals.microbeTrace.activeTabNdx].componentRef.updateLinkColor();
                            // this.goldenLayout.componentInstances[1].updateLinkColor();

                        });
                });

            let row = $(
                "<tr>" +
                "<td data-value='" + value + "'>" +
                (this.visuals.microbeTrace.commonService.session.style.linkValueNames[value] ? this.visuals.microbeTrace.commonService.session.style.linkValueNames[value] : this.commonService.titleize("" + value)) +
                "</td>" +
                (this.commonService.session.style.widgets["link-color-table-counts"] ? "<td>" + aggregates[value] + "</td>" : "") +
                (this.commonService.session.style.widgets["link-color-table-frequencies"] ? "<td>" + (aggregates[value] / vlinks.length).toLocaleString() + "</td>" : "") +
                "</tr>"
            );

            const nonEditCell = `<td style="background-color:${color}"></td>`;

            if (isEditable) {
                row.append($("<td></td>").append(colorinput).append(alphainput));
            } else {
                row.append(nonEditCell);
            }

            linkColorTable.append(row);
        });

        if (isEditable) {
            linkColorTable
                .find("td")
                .on("dblclick", function () {
                    $(this).attr("contenteditable", "true").focus();
                })
                .on("focusout", () => {
                    let $this = $(this);
                    $this.attr("contenteditable", "false");

                    this.visuals.microbeTrace.commonService.session.style.linkValueNames[$this.data("value")] = $this.text();

                });
        }
    }

    public onTimelineChanged(e) : void {
        this.SelectedTimelineVariable = e;
        console.log('timeline changed: ', e);
        d3.select('#global-timeline svg').remove();
        clearInterval(this.visuals.microbeTrace.commonService.session.timeline);
        let variable = e;  
        let loadingJsonFile = this.visuals.microbeTrace.commonService.session.style.widgets["node-timeline-variable"] == variable;
        if (this.visuals.microbeTrace.commonService.session.style.widgets["node-timeline-variable"] != 'None' && !loadingJsonFile) {
            // change timeline variable when end time not reaching target time - redraw netwrok to start fresh
            if (moment(this.visuals.microbeTrace.commonService.session.state.timeEnd).toDate() < moment(this.visuals.microbeTrace.commonService.session.state.timeTarget).toDate()) {
                this.visuals.microbeTrace.commonService.session.state.timeEnd = this.visuals.microbeTrace.commonService.session.state.timeTarget;
            this.visuals.microbeTrace.commonService.setNodeVisibility(false);
            this.visuals.microbeTrace.commonService.setLinkVisibility(false);
            this.visuals.microbeTrace.commonService.updateStatistics();
            }
        }
        this.visuals.microbeTrace.commonService.session.style.widgets["node-timeline-variable"] = variable;
        if (variable == "None") {
            $("#global-timeline-field").empty();
            this.visuals.microbeTrace.commonService.session.style.widgets["timeline-date-field"] = 'None'  
            $("#global-timeline-wrapper").fadeOut();
            $('#pinbutton').prop("disabled", false);
            if(!this.visuals.microbeTrace.commonService.session.network.timelinePinned) {
            $('#pinbutton').trigger('click');
            this.visuals.microbeTrace.commonService.updatePinNodes(false);
            }
            this.visuals.microbeTrace.commonService.session.network.timelineNodes = [];
            this.visuals.microbeTrace.commonService.setNodeVisibility(false);
            this.visuals.microbeTrace.commonService.setLinkVisibility(false);
            this.visuals.microbeTrace.commonService.updateStatistics();
            return;
        }
        if(!this.visuals.microbeTrace.commonService.temp.style.nodeColor) $("#node-color-variable").trigger("change");

        // let el: HTMLElement = this.pinBtn.nativeElement;
        // console.log('pin : ', el);
        // if (!$('#pinbutton').prop('disabled')){
        //     if (!loadingJsonFile) {
        //         this.visuals.microbeTrace.commonService.session.network.timelinePinned = this.visuals.microbeTrace.commonService.session.network.allPinned;
        //     if(!this.visuals.microbeTrace.commonService.session.network.allPinned) {
        //         this.visuals.microbeTrace.commonService.updatePinNodes(true);
        //         this.openPinAllNodes(1);
        //     }
        //     this.visuals.microbeTrace.commonService.session.network.timelineNodes = this.visuals.microbeTrace.commonService.getNetworkNodes();
        //     }
        //     $('#pinbutton').prop("disabled", true);
        // }

        if (!loadingJsonFile) {
            this.visuals.microbeTrace.commonService.session.network.timelinePinned = this.visuals.microbeTrace.commonService.session.network.allPinned;
        if(!this.visuals.microbeTrace.commonService.session.network.allPinned) {
            this.visuals.microbeTrace.commonService.updatePinNodes(true);
            this.openPinAllNodes(1);
        }
        this.visuals.microbeTrace.commonService.session.network.timelineNodes = this.visuals.microbeTrace.commonService.getNetworkNodes();
        }
        let globalTimelineField =  (this.visuals.microbeTrace.commonService.session.style.overwrite && variable == this.visuals.microbeTrace.commonService.session.style.overwrite['globalTimelineFieldVariable'] ? this.visuals.microbeTrace.commonService.session.style.overwrite['globalTimelineField'] : this.visuals.microbeTrace.commonService.titleize(variable));
        const encodedGlobalTimelineField = globalTimelineField.replace(/[\u00A0-\u9999<>\&]/g, function(i) {
            return '&#'+i.charCodeAt(0)+';';
        });
        $("#global-timeline-field").html(encodedGlobalTimelineField);   
        var formatDateIntoYear = d3.timeFormat("%Y");
        var formatDateIntoMonthYear = d3.timeFormat("%b %y");
        var formatDateIntoMonth = d3.timeFormat("%b");
        var formatDateMonthYear = d3.timeFormat("%b %Y");
        var formatDateDateMonth = d3.timeFormat("%b %_d");

        let timeDomainStart, timeDomainEnd;
        let field = variable;
        let times = [],
        vnodes = JSON.parse(JSON.stringify(this.visuals.microbeTrace.commonService.session.data.nodes));
        vnodes.forEach(d => {
            let time = moment(d[field]); 
            if (time.isValid()) {
            d[field] = time.toDate();
            times.push(d[field]);
            } else {
            d[field] = null;
            }
        });
        if (times.length < 2) {
            times = [new Date(2000, 1, 1), new Date()];
        }
        timeDomainStart = Math.min(...times);
        timeDomainEnd = Math.max(...times);

        var days = moment(timeDomainEnd).diff(moment(timeDomainStart), 'days');
        var tickDateFormat = d => {
            if (days<184) return formatDateDateMonth(d);
            else if (days<367) return formatDateIntoMonth(d);
            else if (days<367*5) return formatDateIntoMonthYear(d);
            else return formatDateIntoYear(d);		
        }
        this.handleDateFormat = d => {
            if (days<367) return formatDateDateMonth(d);
            else return formatDateMonthYear(d);		
        }
        let startDate = timeDomainStart;
        let endDate = timeDomainEnd;
        var margin = {top:50, right:50, bottom:0, left:50},
            width = ($('#network').parent().width() * 4 / 5) - margin.left - margin.right,
            height = 200 - margin.top - margin.bottom;
        var svgTimeline = d3.select("#global-timeline")
            .append("svg")
            .attr("width", width + margin.left + margin.right)
            .attr("height", 120);  

            ////////// slider //////////
        this.currentTimelineValue = 0;
        this.currentTimelineTargetValue = width;
        this.visuals.microbeTrace.commonService.session.state.timeStart = startDate;

        let that = this;
        var playButton = d3.select("#timeline-play-button");
        if (playButton.text() == "Pause") playButton.text("Play");
        this.xAttribute = d3.scaleTime()
            .domain([startDate, endDate])
            .range([0, this.currentTimelineTargetValue])
            .clamp(true)
            .nice();
        var slider = svgTimeline.append("g")
            .attr("class", "slider")
            .attr("transform", "translate(30," + height/2 + ")");
        slider.append("line")
            .attr("class", "track")
            .attr("x1", this.xAttribute.range()[0])
            .attr("x2", this.xAttribute.range()[1])
            .select(function() { return this.parentNode.appendChild(this.cloneNode(true)); })
            .attr("class", "track-inset")
            .select(function() { return this.parentNode.appendChild(this.cloneNode(true)); })
            .attr("class", "track-overlay")
            .call(d3.drag()
                .on("start.interrupt", function() { slider.interrupt(); })
                .on("start drag", function() {
                    that.currentTimelineTargetValue = d3.event.x;
                    that.update(that.xAttribute.invert(that.currentTimelineTargetValue));
                    if (that.playBtnText == "Pause") {
                        that.playBtnText = "Play";
                    clearInterval(that.visuals.microbeTrace.commonService.session.timeline);
                    }
                })
            );
        slider.insert("g", ".track-overlay")
            .attr("class", "ticks")
            .attr("transform", "translate(0," + 18 + ")")
            .selectAll("text")
            .data(this.xAttribute.ticks(12))
            .enter()
            .append("text")
            .attr("x", this.xAttribute)
            .attr("y", 10)
            .attr("text-anchor", "middle")
            .text(function(d) { return tickDateFormat(d); });


        this.label = slider.append("text")  
            .attr("class", "label")
            .attr("text-anchor", "middle")
            .text(this.handleDateFormat(startDate))
            .attr("transform", "translate(25," + (-20) + ")")

            this.handle = slider.insert("circle", ".label")
            .attr("class", "handle")
            .attr("r", 9);

        this.visuals.microbeTrace.commonService.session.style.widgets["timeline-date-field"] = field;
        this.visuals.microbeTrace.commonService.session.state.timeStart = startDate;
        this.visuals.microbeTrace.commonService.session.state.timeTarget = this.xAttribute.invert(this.currentTimelineTargetValue);
        if (loadingJsonFile && moment(this.visuals.microbeTrace.commonService.session.state.timeEnd).toDate() < moment(this.visuals.microbeTrace.commonService.session.state.timeTarget).toDate()) {
            let t = moment(this.visuals.microbeTrace.commonService.session.state.timeEnd).toDate();
            this.currentTimelineTargetValue = this.xAttribute(t);
            this.handle.attr("cx", this.xAttribute(t));
            this.label
            .attr("x", this.xAttribute(t))
            .text(this.handleDateFormat(t));
        }
        $("#global-timeline-wrapper").fadeIn();

        console.log('attribute2: ', this.xAttribute);

       
    }

    public playTimeline() : void {

            if (this.playBtnText == "Pause") {
                this.playBtnText = "Play";
                clearInterval(this.visuals.microbeTrace.commonService.session.timeline);
            } else {
                this.playBtnText = "Pause";
                this.visuals.microbeTrace.commonService.session.timeline = setInterval(this.step, 200, this);
            }

    }

    update(h) {

        this.handle.attr("cx", this.xAttribute(h));
        this.label
        .attr("x", this.xAttribute(h))
        .text(this.handleDateFormat(h));
        this.visuals.microbeTrace.commonService.session.state.timeEnd = h;
        this.visuals.microbeTrace.commonService.setNodeVisibility(false);
        this.visuals.microbeTrace.commonService.setLinkVisibility(false);
        this.visuals.microbeTrace.commonService.updateStatistics();
  }

    step(that : any) { 
        that.update(that.xAttribute.invert(that.currentTimelineValue));
        if (that.currentTimelineValue > that.currentTimelineTargetValue) { 
            that.currentTimelineValue = 0;
        clearInterval(that.visuals.microbeTrace.commonService.session.timeline);
        that.playBtnText = "Play";
        return;
        }
        that.currentTimelineValue = that.currentTimelineValue + (that.currentTimelineTargetValue/151);

    }

    onColorNodesByChanged() {

        this.commonService.GlobalSettingsModel.SelectedColorNodesByVariable = this.SelectedColorNodesByVariable;


        if (!this.GlobalSettingsNodeColorDialogSettings.isVisible) {

            if (this.SelectedColorNodesByVariable != "None") {
                this.GlobalSettingsNodeColorDialogSettings.setVisibility(true);
                this.cachedGlobalSettingsNodeColorVisibility = this.GlobalSettingsNodeColorDialogSettings.isVisible;

                this.cdref.detectChanges();
            }
        }

        this.commonService.session.style.widgets["node-color-variable"] = this.SelectedColorNodesByVariable;


        if (this.SelectedColorNodesByVariable !== "None") {

            this.generateNodeColorTable("#node-color-table");
            
            $('#node-color-value-row').slideUp();

            //If hidden by default, unhide to perform slide up and down
            if(!this.ShowGlobalSettingsNodeColorTable){
                this.ShowGlobalSettingsNodeColorTable = true;
            } else {
                $('#node-color-table-row').slideDown();
            }

            this.visuals.microbeTrace.publishUpdateNodeColors();

        } else {

            $('#node-color-value-row').slideDown();
            $('#node-color-table-row').slideUp();
            this.SelectedNodeColorTableTypesVariable='Hide';
            this.onNodeColorTableChanged();
            
            this.visuals.microbeTrace.publishUpdateNodeColors();

        }

    }

    generateNodeColorTable(tableId: string, isEditable: boolean = true) {
        let nodeColorTable = $(tableId)
            .empty()
            .append(
                "<tr>" +
                "<th class='p-1' contenteditable>Node " + this.commonService.titleize(this.SelectedColorNodesByVariable) + "</th>" +
                (this.commonService.session.style.widgets["node-color-table-counts"] ? "<th>Count</th>" : "") +
                (this.commonService.session.style.widgets["node-color-table-frequencies"] ? "<th>Frequency</th>" : "") +
                "<th>Color</th>" +
                "<tr>"
            );


        if (!this.commonService.session.style.nodeValueNames)
            this.commonService.session.style.nodeValueNames = {};


        let aggregates = this.commonService.createNodeColorMap();

        let vnodes = this.commonService.getVisibleNodes();

        let aggregateValues = Object.keys(aggregates);

        const disabled = isEditable ? '' : 'disabled';

        aggregateValues.forEach((value, i) => {

            const color = this.visuals.microbeTrace.commonService.temp.style.nodeColorMap(value);

            let colorinput = $(`<input type="color" value="${color}" ${disabled}>`)
                .on("change", e => {

                    let key = this.visuals.microbeTrace.commonService.session.style.nodeColorsTableKeys[this.SelectedColorNodesByVariable].findIndex( k => k === value);
                    this.visuals.microbeTrace.commonService.session.style.nodeColorsTable[this.SelectedColorNodesByVariable].splice(key, 1, e);

                    // Update history with new color
                    this.visuals.microbeTrace.commonService.session.style.nodeColorsTableHistory[this.visuals.microbeTrace.commonService.session.style.nodeColorsTableKeys[this.SelectedColorNodesByVariable][key]] = e;

                  

                    if (this.visuals.microbeTrace.commonService.session.style.widgets["node-timeline-variable"] == 'None') {
                          // Update table with new alpha value
                        // Need to get value from id since "this" keyword is used by angular
                        this.visuals.microbeTrace.commonService.session.style.nodeColors.splice(i, 1, e.target['value']);
                        this.visuals.microbeTrace.commonService.temp.style.nodeColorMap = d3
                            .scaleOrdinal(this.visuals.microbeTrace.commonService.session.style.nodeColors)
                            .domain(aggregateValues);
                        // temp.style.nodeColorMap = d3
                            // .scaleOrdinal(session.style.nodeColorsTable[variable])
                            // .domain(session.style.nodeColorsTableKeys[variable]);
                        } else {
                            let temKey = this.visuals.microbeTrace.commonService.temp.style.nodeColorKeys.findIndex( k => k === value);
                            this.visuals.microbeTrace.commonService.temp.style.nodeColor.splice(temKey, 1, e);
                            this.visuals.microbeTrace.commonService.temp.style.nodeColorMap = d3
                                .scaleOrdinal(this.visuals.microbeTrace.commonService.temp.style.nodeColor)
                                .domain(this.visuals.microbeTrace.commonService.temp.style.nodeColorKeys);
                        }

                    this.visuals.microbeTrace.publishUpdateNodeColors();

                });

            let alphainput = $(`<a class="transparency-symbol">⇳</a>`).on("click", e => {

                $("#color-transparency-wrapper").css({
                    top: e.clientY + 129,
                    left: e.clientX,
                    display: "block"
                });

                $("#color-transparency")
                    .val(this.visuals.microbeTrace.commonService.session.style.nodeAlphas[i])
                    .one("change", f => {

                        // Update table with new alpha value
                        // Need to get value from id since "this" keyword is used by angular
                        this.visuals.microbeTrace.commonService.session.style.nodeAlphas.splice(i, 1, parseFloat(f.target['value'] as string));

                        this.visuals.microbeTrace.commonService.temp.style.nodeAlphaMap = d3
                            .scaleOrdinal(this.visuals.microbeTrace.commonService.session.style.nodeAlphas)
                            .domain(aggregateValues);

                        this.visuals.microbeTrace.publishUpdateNodeColors();

                        $("#color-transparency-wrapper").fadeOut();

                    });
            });

            const nonEditCell = `<td style="background-color:${color}"></td>`;

            let cell = $("<td></td>")
                .append(colorinput)
                .append(alphainput);

            let row = $(
                "<tr>" +
                "<td data-value='" + value + "'>" +
                (this.visuals.microbeTrace.commonService.session.style.nodeValueNames[value] ? this.visuals.microbeTrace.commonService.session.style.nodeValueNames[value] : this.visuals.microbeTrace.commonService.titleize("" + value)) +
                "</td>" +
                (this.visuals.microbeTrace.commonService.session.style.widgets["node-color-table-counts"] ? "<td>" + aggregates[value] + "</td>" : "") +
                (this.visuals.microbeTrace.commonService.session.style.widgets["node-color-table-frequencies"] ? "<td>" + (aggregates[value] / vnodes.length).toLocaleString() + "</td>" : "") +
                "</tr>"
            ).append(isEditable ? cell : nonEditCell);

            nodeColorTable.append(row);
        });

        if (isEditable) {
            nodeColorTable
                .find("td")
                .on("dblclick", function () {
                    $(this).attr("contenteditable", "true").focus();
                })
                .on("focusout", () => {

                    let $this = $(this);
                    $this.attr("contenteditable", "false");

                    //this.visuals.microbeTrace.commonService.session.style.nodeValueNames[$this.data("value")] = $this.find("input").value;

                });
        }
    }

    onLinkThresholdChanged() {
        //debugger;

        this.commonService.GlobalSettingsModel.SelectedLinkThresholdVariable = this.SelectedLinkThresholdVariable;
        this.commonService.session.style.widgets["link-threshold"] = parseFloat(this.SelectedLinkThresholdVariable);
        this.threshold = this.SelectedLinkThresholdVariable;

        let minClust = $("#cluster-minimum-size").val();
        

        // Unset MST construction since links might have been changed
        this.commonService.session.style.widgets["mst-computed"] = false;

        if (minClust !== "1" ){
            $("#cluster-minimum-size").val("1");
            $("#cluster-minimum-size").trigger("change");
            $("#cluster-minimum-size").val(minClust);
            $("#cluster-minimum-size").trigger("change");
        } 

        this.commonService.setLinkVisibility(true);
        this.commonService.tagClusters().then(() => {
            this.visuals.microbeTrace.commonService.setClusterVisibility(true);
            //To catch links that should be filtered out based on cluster size:
            this.visuals.microbeTrace.commonService.setLinkVisibility(true);
            this.visuals.microbeTrace.commonService.setNodeVisibility(true);
            //Because the network isn't robust to the order in which these operations
            //take place, we just do them all silently and then react as though we did
            //them each after all of them are already done.

            this.updatedVisualization();

            this.commonService.updateStatistics();

        });

    }

    revealClicked() : void {

        $("#cluster-minimum-size").val(1);
        this.visuals.microbeTrace.commonService.session.style.widgets["cluster-minimum-size"] = 1;
        $("#filtering-wrapper").slideDown();
        this.visuals.microbeTrace.commonService.setClusterVisibility(true);
       
        this.visuals.microbeTrace.commonService.setNodeVisibility(true);
         //To catch links that should be filtered out based on cluster size:
         this.visuals.microbeTrace.commonService.setLinkVisibility(true);
        //Because the network isn't robust to the order in which these operations
        //take place, we just do them all silently and then react as though we did
        //them each after all of them are already done.

        this.visuals.microbeTrace.GlobalSettingsLinkColorDialogSettings.isVisible = true;
        this.visuals.microbeTrace.GlobalSettingsNodeColorDialogSettings.isVisible = true;

        this.visuals.microbeTrace.updatedVisualization();

        this.visuals.microbeTrace.commonService.updateStatistics();

    };


    updateGlobalSettingsModel() {

        this.commonService.GlobalSettingsModel.SelectedRevealTypesVariable = this.SelectedRevealTypesVariable;




        this.commonService.GlobalSettingsModel.SelectedNodeColorVariable = this.SelectedNodeColorVariable;
        this.commonService.session.style.widgets['node-color'] = this.SelectedNodeColorVariable;
        this.commonService.session.style.widgets['link-color'] = this.SelectedLinkColorVariable;
        this.commonService.session.style.widgets['link-threshold'] = this.SelectedLinkThresholdVariable;
        this.commonService.session.style.widgets['default-distance-metric'] = this.SelectedDistanceMetricVariable;
        this.commonService.session.style.widgets['node-color-variable'] = this.SelectedColorNodesByVariable;
        //this.commonService.session.style.widgets['node-color-variable'] = this.SelectedNodeColorVariable;

        this.commonService.session.style.widgets['link-tooltip-variable'] = this.SelectedColorLinksByVariable;


        this.commonService.GlobalSettingsModel.SelectedColorVariable = this.SelectedColorVariable;
        this.commonService.GlobalSettingsModel.SelectedLinkThresholdVariable = this.SelectedLinkThresholdVariable;
        this.commonService.GlobalSettingsModel.SelectedDistanceMetricVariable = this.SelectedDistanceMetricVariable;
        this.commonService.session.style.widgets['selected-color'] = this.SelectedColorVariable;
        this.commonService.session.style.widgets['selected-node-stroke-color'] = this.SelectedColorVariable;
        if (this.commonService.visuals.phylogenetic) {
          this.commonService.visuals.phylogenetic.updateNodeColors();
        }


        this.commonService.GlobalSettingsModel.SelectedBackgroundColorVariable = this.SelectedBackgroundColorVariable;
        this.commonService.session.style.widgets['background-color'] = this.SelectedBackgroundColorVariable;


        this.commonService.GlobalSettingsModel.SelectedApplyStyleVariable = this.SelectedApplyStyleVariable;


    }


    updatedVisualization() {

        this.visuals.microbeTrace.publishUpdateVisualization();

        console.log('active tab ind: ', this.homepageTabs,this.homepageTabs[this.activeTabIndex]);

        if (!this.homepageTabs[this.activeTabIndex]) return;

        // console.log('active tab ind2: ', this.homepageTabs[this.activeTabIndex]);


        switch (this.homepageTabs[this.activeTabIndex].label) {
            case "2D Network":

                // this.goldenLayout.componentInstances[this.activeTabIndex].render(false);
                console.log('---rendering');
                break;


            case "PhylogeneticTree":


                break;

            case "Table":


                break;

            case "Map":


                break;
        }

    }



    getGlobalSettingsData() {
        this.FieldList = [];

        this.FieldList.push({ label: "None", value: "None" });
        this.commonService.session.data['nodeFields'].map((d, i) => {
            
            this.FieldList.push(
                {
                    label: this.commonService.capitalize(d.replace("_", "")),
                    value: d
                });

        });


        this.ToolTipFieldList = [];

        this.ToolTipFieldList.push({ label: "None", value: "None" });
        this.commonService.session.data['linkFields'].map((d, i) => {

            this.ToolTipFieldList.push(
                {
                    label: this.commonService.capitalize(d.replace("_", "")),
                    value: d
                });

        });


        this.SelectedLinkSortVariable = this.commonService.GlobalSettingsModel.SelectedLinkSortVariable;
        this.commonService.updateThresholdHistogram();

    }



    getUserRoles() {

        // this._userService.getUserForEdit(this.appSession.userId).subscribe(userResult => {

        //     this.user = userResult.user;

        //     userResult.roles.map(x => {

        //         if (x.isAssigned === true) {
        //             this.roles.push(x.roleName);
        //         }
        //     });

        // });
    }


    ngAfterViewInit() {

        // let factory = this.cfr.resolveComponentFactory(FilesComponent);
        // this.cmpRef = this.targets.first.createComponent(factory);

        

        // this.setActiveTabProperties();

        this.cdref.detectChanges();
    }


    getLedgerData() {

        // this.ledgerOptions = [];
        // this.ledgerOptionSelected = [];
        // this.ledgerOptionSelectedFlag = true;

        // this.showSpinner();

        // this.posts = new Array<BlockchainProofHashDto>();
        // this.Blockchaindata = new BlockchainProofHashDto();


        // this.keenService.getAllBlockchainsByTenantID().subscribe((resA: BlockchainProofHashDto[]) => {
        //     this.posts = resA.filter(x => x.ledgerName.toLowerCase() === 'ContactTrace'.toLowerCase());

        //     let ok2Exit = false;

        //     let getBlockByLedgerIdObservable: Observable<GetAllBlockByBlockchainLedgerIDDto[]>[] = [];

        //     for (let i = 0; i < this.posts.length; i++) {
        //         this.posts[i].blockdata = [];
        //         this.date = new Date(parseInt(this.posts[i].lastUpdated.substring(6, 26)));
        //         this.posts[i].lastUpdated = this.date.toString();
        //         this.Blockchaindata = this.posts[i];

        //         getBlockByLedgerIdObservable.push(this.keenService.getAllBlockByBlockchainLedgerID(
        //             this.Blockchaindata.ledgerName,
        //             this.Blockchaindata.blockChainProofHashCode,
        //             this.Blockchaindata.tenantID,
        //             this.Blockchaindata.userID));

        //     }

        //     forkJoin(getBlockByLedgerIdObservable).subscribe(results => {
        //         results.forEach((data: GetAllBlockByBlockchainLedgerIDDto[], index: number) => {
        //             this.posts[index].blockdata = data;

        //             for (let j = 0; j < this.posts[index].blockdata.length; j++) {

        //                 this.date = new Date(parseInt(this.posts[index].blockdata[j].blockUpdatedDate.substring(6, 26)));
        //                 this.posts[index].blockdata[j].blockUpdatedDate = this.date.toString();
        //             }

        //             if (index == this.posts.length - 1) {
        //                 ok2Exit = true;

        //                 this.loadLedgerOptions();
        //             }
        //         })
        //     },
        //         error => {
        //             console.log("error retrieving posts.");
        //         },
        //         () => {

        //         });

        // })

    }

    downloadSelectedBlocks() {

        if (this.ledgerOptionSelected == undefined)
            return;

        /*/
         * Clear all data previously loaded so that we can re-create new outputs.
        /*/
        const homepageTabs = this.homepageTabs;
        this.commonService.resetData();
        this.homepageTabs = homepageTabs;

        this.downloadedBlocks = [];

        this.ledgerOptionSelected.forEach((block, i) => {

            if (block.data) {
                if (this.downloadedBlocks.findIndex(x => x == block.data.blockName) == -1) {
                    this.downloadedBlocks.push(block.data.blockName);
                    const isNodeList: boolean = block.label.includes('nodelist');
                    // this.downloadLedgerBlock(block.data, block.data.ledgerName, isNodeList)
                }
            }

        });
    }


    convertToCSV(objArray) {

        let tmpArray = typeof objArray != 'object' ? JSON.parse(objArray) : objArray;
        let str = '';
        let headerLoaded = false;
        let line = '';


        for (var i = 0; i < tmpArray.length; i++) {
            line = '';

            if (headerLoaded == false) {
                for (let index1 in tmpArray[i]) {
                    if (line != '') line = line.toString() + ','

                    line = line.toString() + index1.toString().replace(/\r/g, '').replace(/\n/g, '').trim();
                }

                str = str.toString() + line.toString() + '\r\n';

                headerLoaded = true;
            }
            line = '';

            for (let index2 in tmpArray[i]) {
                if (line != '') line = line.toString() + ','

                line = line.toString() + tmpArray[i][index2].toString();
            }

            if (line != "") {
                str = str.toString() + line.toString().replace(/\r/g, '').replace(/\r/g, '').trim() + (i == tmpArray.length - 1 ? '' : '\r\n');
            }
        }

        return str;
    }

    // downloadLedgerBlock(item: DownloadFilteredBlockDto, ledgerId, isNodeList: boolean): void {
    //     const filteredWrappers = this.bpaaSPayloadWrappers.filter(x => x.BlockName &&  x.BlockName.toLowerCase() === item.blockName.toLowerCase());

    //     const detailRows = _.flatten(filteredWrappers.map(x => x.BpaaSPayload.Data))

    //     let blob: any = new Blob([JSON.stringify(detailRows)], { type: 'text/plain' });
    //     blob.lastModifiedDate = new Date();
    //     blob.name = (item.blockName + ".json");


    //     var file: File = <File>blob;

    //     this.getSinglefileContent(file);

    //     abp.notify.success("Ledger block successfully downloaded.");
    //     this.hideSpinner();

    // }

    showSpinner() {
        this.spinnerDivElement.nativeElement.style.display = "block";
        this.spinnerElement.nativeElement.style.display = "block";
    }

    hideSpinner() {
        this.spinnerDivElement.nativeElement.style.display = "none";
        this.spinnerElement.nativeElement.style.display = "none";
    }


    public loadLedgerOptions() {

        this.BlockChainLedgerNodeList = [];
        this.BlockChainLedgerEdgeList = [];
        this.ledgerOptions = [];

        // let postCount = this.posts.length;
        let loadedAny: boolean = false;
        // let observableFilterBlocks: { post: BlockchainProofHashDto, ob: Observable<OutputDownloadFilteredBlock> }[] = [];

        const endLoadBadly = () => {
            this.hideSpinner();
            abp.notify.warn("Your role(s) do not allow access to a ledger.  See your administrator to grant you roles to access a ledger.");
        }

        const endLoadNoData = () => {
            this.hideSpinner();
            abp.notify.warn("No data was loaded");
        }
    }

    public loadDefaultVisualization(e: string) {

        e = e.replace("_", " ");

        // TODO: do something like this when adding new data
        // if(this.homepageTabs.length > 1) {
        //     // Remove all golden layout component instances except for the files component by calling srv removeTab
        //     if(this.goldenLayout.componentInstances.length > 1) {
        //         for(let i = 1; i < this.goldenLayout.componentInstances.length; i++) {
        //             this.srv.removeTab(0,1);
        //             this.homepageTabs.splice(this.homepageTabs.length - 1, 1);
        //         }
        //     }
        // }
        console.log('homepage launch: ', this.homepageTabs)
        this.Viewclick(e);
        // this.Viewclick("Map");
    }

    public getfileContent(fileList: FileList) {

        this.GlobalSettingsDialogSettings.setVisibility(false);
        this.GlobalSettingsLinkColorDialogSettings.setVisibility(false);
        this.GlobalSettingsNodeColorDialogSettings.setVisibility(false);

        console.log('process files::');
        // this.srv.removeTab(0,1);
        //remove last homepage tab
        this.homepageTabs.splice(this.homepageTabs.length - 1, 1);
        // console.log('homepagetabs: ', this.homepageTabs);
        // this.goldenLayout.componentInstances[0].processFiles(fileList)

        this.homepageTabs.map(x => {
            if (x.tabTitle === "Files") {
                if (x.componentRef != null) {
                    console.log('in iles: ', this.subscription);
                    this.subscription.unsubscribe();
                    // console.log('unsubscribed');
                    this.subscription = this.homepageTabs[0].componentRef.LoadDefaultVisualizationEvent.subscribe((v) => {
                        console.log('loading default: ', v);
                        // this.loadSettings();
                        this.loadDefaultVisualization(v);
                        this.publishLoadNewData();
                    });
                    x.componentRef.processFiles(fileList);
                }
            }
        });
    }

    public getSinglefileContent(file: File) {

        // this.goldenLayout.componentInstances[0].processFile(file);

        this.homepageTabs.map(x => {
            if (x.tabTitle === "Files") {
                if (x.componentRef != null) {
                    x.componentRef.processFile(file);
                }
            }
        });
    }

    public onPanelHide($event) {
        console.log($event);
    }

    public onClickChildOptionContainer($event) {

    }

    public onClickChildOptionChecbox($event) {

    }

    public onChangeChildOptionCheckbox($event) {

    }

    DisplayHelp() {
        window.open("https://github.com/CDCgov/MicrobeTrace/wiki");
    }

    DisplayAbout() {
        this.displayAbout = !this.displayAbout;
    }


    DisplayLedgerLoaderDialog(ledgerLoaderAction: string = "") {
        switch (ledgerLoaderAction) {
            case "Load": {
                this.downloadSelectedBlocks();
                break;
            }
            default: {
                this.getLedgerData();
            }
        }

        this.ToggleDisplayLedgerLoaderDialog();

    }

    ToggleDisplayLedgerLoaderDialog() {
        this.displayLedgerLoaderDialog = !this.displayLedgerLoaderDialog;
    }

    DisplayStashDialog(saveStash: string) {
        switch (saveStash) {
            case "Save": {

                const lightTabs: HomePageTabItem[] = this.homepageTabs.map(x => {
                    return {
                        label: x.label,
                        tabTitle: x.tabTitle,
                        isActive: x.isActive,
                        componentRef: undefined,
                        templateRef: undefined
                    }
                });

                const stash: StashObjects = {
                    session: this.visuals.microbeTrace.commonService.session,
                    tabs: lightTabs
                };

                const blob = new Blob([JSON.stringify(stash)], { type: "application/json;charset=utf-8" });
                saveAs(blob, `${this.saveFileName}.microbetrace`);
                break;
            }
            case "Cancel": {

                break;
            }
        }
        this.displayStashDialog = !this.displayStashDialog;
    }

    getAuspiceName(url: string) {
      const split = url.split('=');
      const nameParts = split[1].split('/');
      return nameParts.join('_');
      return 'auspice_import_via_url';
    }

    DisplayUrlDialog(saveUrl: string) {
      switch (saveUrl) {
        case 'Open': {
          const auspiceUrl = this.auspiceUrlVal;
          this.commonService.openAuspiceUrl(auspiceUrl)
          .then( (out) => {
            console.log(out);
            if (out['meta'] && out['tree']) {
              const auspiceFile = { contents: out, name: this.getAuspiceName(auspiceUrl), extension: 'json'};
              this.visuals.microbeTrace.commonService.session.files.push(auspiceFile);
            //   console.log(this.homepageTabs[0].componentRef);
                // this.goldenLayout.componentInstances[0].addToTable(auspiceFile);
              this.homepageTabs[0].componentRef.addToTable(auspiceFile);
              this.homepageTabs[0].isActive = true;
              $('#overlay').fadeOut();
              $('.ui-tabview-nav').fadeTo("slow", 1);
              $('.m-portlet').fadeTo("slow", 1);
            }
          });
          break;
        }
        case 'Cancel': {
            break;
        }
      }
      this.displayUrlDialog = !this.displayUrlDialog;
    }


    ResetTabs() {
        const home = this.homepageTabs.find(x => x.tabTitle === "Files");
        home.isActive = true;
        this.homepageTabs = this.homepageTabs.filter(x => home === x);
        this.homepageTabs = [home];

        this.activeTabIndex = 0;
    }

    NewSession() {
        this.visuals.filesPlugin.removeAllFiles();

        this.ResetTabs();

        this.commonService.reset();

        this.onReloadScreen();
    }

    OpenStashFiles(stashFile: FileList) {
        // console.log(stashFile);

        const files: File[] = Array.from(stashFile);

        if (files.length > 0) {

            const extension = files[0].name.split('.').pop().toLowerCase();

            let reader = new FileReader();
            reader.onloadend = out => {
                if (out && out.target) {
                    this.OpenStash((<any>out.target).result);
                }
            }
            reader.readAsText(files[0], 'UTF-8');
        }
    }

    OpenStash(sessionData: string) {
        if (sessionData) {
            const sessionObject: StashObjects = JSON.parse(sessionData);
            if (sessionObject) {

                //ResetFiles
                this.visuals.filesPlugin.removeAllFiles();

                this.visuals.microbeTrace.commonService.session = sessionObject.session;

                //Reset Tabs
                this.ResetTabs();

                //Load Tabs
                for (let index = 1; index < sessionObject.tabs.length; ++index) {
                    if (this.homepageTabs.find(x => x.label === sessionObject.tabs[index].label) === undefined) {
                        this.addTab(sessionObject.tabs[index].label, sessionObject.tabs[index].label + index, index, false);
                    }
                }

                if (sessionObject.session.files) {
                    sessionObject.session.files.forEach(file => {
                        this.visuals.filesPlugin.addToTable(file);
                    })
                }

                this.homepageTabs[0].isActive = true;

              console.log('openStas microbetrace.component.ts');
                this.loadSettings();
            }
        }
    }

    DisplayRecallStashDialog(recallStash: string) {
        switch (recallStash) {
            case "Recall": {
                // this._userService.getUserForEdit(this.appSession.userId).subscribe(userResult => {
                //     const email: string = userResult.user.emailAddress;
                //     this.visuals.microbeTrace.commonService.localStorageService.getItem("stash-" + email, (err, sessionData) => {
                //         if (sessionData) {
                //             const sessionObject: StashObjects = JSON.parse(sessionData);
                //             if (sessionObject) {
                //                 this.visuals.microbeTrace.commonService.session = sessionObject.session;

                //                 //Load Tabs
                //                 sessionObject.tabs.forEach(loadedTab => {
                //                     if (this.homepageTabs.find(x => x.label === loadedTab.label) === undefined) {
                //                         this.Viewclick(loadedTab.label);
                //                     }
                //                 })

                //                 this.loadSettings();

                //                 this.homepageTabs.forEach(tab => {
                //                     if (tab.componentRef &&
                //                         tab.componentRef.instance.onRecallSession) {
                //                         tab.componentRef.instance.onRecallSession();
                //                     }
                //                 })

                //             }
                //         }
                //     });

                // });

                break;
            }
            case "Cancel": {

                break;
            }
            case "Delete": {

                break;
            }
        }
        this.displayRecallStashDialog = !this.displayRecallStashDialog;
    }

    FileClick(actionName: any) {
        switch (actionName) {
            case "New Session": {
                this.NewSession();
                break;
            }
            case "Stash Session": {
                this.stashSession();
                break;
            }
            case "Recall Session": {
                // this.DisplayRecallStashDialog("Cancel");
                this.displayRecallStashDialog = true;
                this.updateTable();
                break;
            }
            case "Save Session": {
                this.DisplayStashDialog("Cancel");
                break;
            }
            case "Open URL": {
              this.DisplayUrlDialog("Cancel");
              break;
            }
            case "Add Data": {
                // this.commonService.launchView("files");
                // this.activeTabIndex = 0;

                // this.homepageTabs.map(x => {

                //     x.isActive = (x.tabTitle == "Files") ? true :false;
                // });
        
                // this.tabView.tabs.map(x => {
        
                //     x.selected = false;
                // });

                // this.tabView.tabs[0].selected = true;

                // this.setActiveTabProperties();

                // this.setActiveTabProperties();
                // this.DisplayLedgerLoaderDialog();
                break;
            }

        }
    }

    SettingsClick(actionName: any) {
        switch (actionName) {
            case "Global Settings": {
                this.DisplayGlobalSettingsDialog();
                break;
            }

        }
    }

    stashSession() {
        console.log('sesssion: ', this.commonService.session);
        this.commonService.localStorageService.setItem(
            "stash-" + Date.now() + "-" + $("#stash-name").val(),
            JSON.stringify(this.commonService.session)
          )
    }

    public table;
    
    updateTable() {
        
        this.table = new Tabulator(this.stashes.nativeElement, {
            height: "100%",
            layout: "fitData",
            selectable: 1,
            columns: [
              { title: "Name", field: "name" },
              { title: "Date", field: "date", align: "right", sorter: "date" }
            ]
          });
        let rows = [];
        this.commonService.localStorageService.keys().then(keys => {
          keys.forEach(k => {
            if (k.substring(0, 5) !== "stash") return;
            rows.push({
              fullname: k,
              name: k.substring(20),
              date: new Date(parseFloat(k.substring(6, 19))).toISOString()
            });
          });
          this.table.setData(rows);
        });
      }

    // $("#recall-load-stash").on("click", () => {
    //     let key = table.getSelectedData()[0].fullname;
    //     localforage.getItem(key).then(json => {
    //       MT.applySession(JSON.parse(json));
    //       $("#session-recall-modal").modal("hide");
    //     });
    //   });

    GetComponentTypeByName(viewName: string) {
        let _type: any = null;

        switch (viewName) {

            case "2D Network": {
                _type = TwoDComponent;
                break;
            }
            case "3D Network": {
                _type = ThreeDComponent;
                break;
            }
            case "Histogram": {
                _type = HistogramComponent;
                break;
            }
            case "Table": {
                _type = TableComponent;
                break;
            }
            case "Aggregation": {
                _type = AggregationComponent;
                break;
            }
            case "Bubbles": {
                _type = BubblesComponent;
                break;
            }
            case "Flow Diagram": {
                _type = FlowDiagramComponent;
                break;
            }
            case "Scatterplot": {
                _type = ScatterPlotComponent;
                break;
            }
            case "Waterfall": {
                _type = WaterfallComponent;
                break;
            }
            case "Map": {
                _type = MapComponent;
                break;
            }
            case "Gantt": {
                _type = GanttComponent;
                break;
            }
            case "Timeline": {
                _type = TimelineComponent;
                break;
            }
            case "Heatmap": {
                _type = HeatMapComponent;
                break;
            }
            case "Phylogenetic Tree": {
                _type = PhylogeneticComponent;
                break;
            }
        }

        return _type;
    }

    Viewclick(viewName: string) {

        console.log('viewClick: ', viewName);
        console.log(this.commonService.session.style.widgets['link-threshold']);
        console.log('homepage tabs1: ' , this.homepageTabs);

        let tabNdx = this.homepageTabs.findIndex(x => x.label == viewName);
        if (viewName == "2d network") {
            viewName = "2D Network";
        }
        /*/
         * Don't allow duplicate tabs to get added.
        /*/
        if (tabNdx == -1) {

            this.activeTabIndex = this.activeTabIndex + 1;

            switch(viewName) {
                case "2D Network": 
                    // this.srv.createNewComponent(this.srv.getRegisteredComponents()[1]);
                    // console.log('2d network: ', this.goldenLayout.componentInstances);
                break;
                case "Table":
                    // this.srv.createNewComponent(this.srv.getRegisteredComponents()[2]);
                    // console.log('table: ', this.goldenLayout.componentInstances[this.goldenLayout.componentInstances.length - 1]);

                break;
                case "Map":
                    // this.srv.createNewComponent(this.srv.getRegisteredComponents()[3]);
                break;
                case "Phylogenetic Tree":
                    // this.srv.createNewComponent(this.srv.getRegisteredComponents()[4]);
                break;
                default:
                    // this.srv.createNewComponent(this.srv.getRegisteredComponents()[1]);

            }
            
            // console.log('tabview: ', this.tabView);
            this.addTab(viewName, viewName + this.activeTabIndex, this.activeTabIndex);
            console.log('homepage tabs: ' , this.homepageTabs);
            // console.log('get state: ', JSON.stringify(this.srv.getState()['__zone_symbol__value']));

            setTimeout(() => {
          
                console.log('view name: ', viewName);

                // this.goldenLayout.componentInstances[this.goldenLayout.componentInstances.length - 1].DisplayGlobalSettingsDialogEvent.subscribe((v) => { this.DisplayGlobalSettingsDialog(v) });

                this.setActiveTabProperties();
                this.loadSettings();
            });
        }
        else {
            const tabWithoutComponentRef: HomePageTabItem | undefined = this.homepageTabs.find(x => x.label == viewName && x.componentRef != undefined);

            if (!tabWithoutComponentRef) {
               /* 
                setTimeout(() => {

                    let _type: any = this.GetComponentTypeByName(viewName);

                    let factory = this.cfr.resolveComponentFactory(_type);
                    this.cmpRef = this.targets.last.createComponent(factory)

                    tabNdx = this.homepageTabs.findIndex(x => x.label == viewName);
                    this.homepageTabs[tabNdx].componentRef = this.cmpRef;
                    this.tabView.tabs[tabNdx].selected = true;

                    this.cmpRef.instance.DisplayGlobalSettingsDialogEvent.subscribe((v) => { this.DisplayGlobalSettingsDialog(v) });

                    this.setActiveTabProperties();
                });
                */
            }
            else {

                this.homepageTabs.map(x => {
                    x.isActive = false;
                    if (x.label.toLocaleLowerCase().includes(viewName.toLocaleLowerCase(), 0) == true) {
                        x.isActive = true;
                    }
                });

                // this.tabView.tabs.map(x => {

                //     x.selected = false;
                //     if (x.header.includes(viewName, 0) == true) {
                //         x.selected = true;
                //     }

                // });

                console.log('activeee');

               this.setActiveTabProperties();
               this.loadSettings();

            }
        }

        const foundTab = this.homepageTabs.find(x => x.label == viewName);

        //TODO: CHange Component Ref
        console.log('found tab: ', foundTab);
        if (foundTab && foundTab.componentRef &&
            foundTab.componentRef.loadSettings) {                
              foundTab.componentRef.loadSettings();
              if (this.metric === 'snps'){
                this.commonService.session.style.widgets['default-distance-metric'] = 'snps';
                this.commonService.session.style.widgets['link-threshold'] = parseInt(this.threshold);
                this.onLinkThresholdChanged();
              }
        }


    }

    DisplayGlobalSettingsDialog(activeTab = "Styling") {

        this.visuals.microbeTrace.getGlobalSettingsData();

        this.visuals.microbeTrace.GlobalSettingsDialogSettings.setVisibility(true);
        this.cachedGlobalSettingsVisibility = this.GlobalSettingsDialogSettings.isVisible;


        this.visuals.microbeTrace.commonService.updateThresholdHistogram();

        this.globalSettingsTab.tabs[activeTab === "Styling" ? 1 : 0].active = true;
    }


    WindowClick(actionName: any) {
        switch (actionName) {
            case "Fullscreen": 

                if (this.elem.requestFullscreen) {
                    this.elem.requestFullscreen();
                    } else if (this.elem.mozRequestFullScreen) {
                    /* Firefox */
                    this.elem.mozRequestFullScreen();
                    } else if (this.elem.webkitRequestFullscreen) {
                    /* Chrome, Safari and Opera */
                    this.elem.webkitRequestFullscreen();
                    } else if (this.elem.msRequestFullscreen) {
                    /* IE/Edge */
                    this.elem.msRequestFullscreen();
                    }
                
                break;

            case "Reload Screen": {

                this.onReloadScreen();

                window.location.reload()

                
                // this.homepageTabs.forEach(tab => {
                //     if (tab.componentRef &&
                //         tab.componentRef.instance.openRefreshScreen) {
                //         tab.componentRef.instance.openRefreshScreen();
                //     }
                // })
                break;
            }
          case "Settings": {
            this.DisplayGlobalSettingsDialog("Filtering");
          }
        }
    }

    HelpClick(actionName: any) {
        switch (actionName) {
            case "Help": {
                this.DisplayHelp();
                break;
            }
            case "Report": {
                this.DisplayHelp();
                break;
            }
            case "About": {
                this.DisplayAbout();
                break;
            }
        }
    }

    setActiveTabProperties(tabNdx: number = -1) {


        if (tabNdx === -1) tabNdx = this.homepageTabs.findIndex(x => x.isActive == true);

        let activeComponentName: string = this.homepageTabs[tabNdx].label;

        this.homepageTabs.forEach((item: HomePageTabItem) => {
            item.isActive = item.label === activeComponentName;
        });



        switch (activeComponentName) {

            case "Files": {

                this.showSettings = true;
                this.showExport = false;
                this.showCenter = false;
                this.showPinAllNodes = false;
                this.showRefresh = false;
                this.showButtonGroup = false;
                this.showSorting = false;

                this.cachedGlobalSettingsVisibility = this.GlobalSettingsDialogSettings.isVisible;
                this.cachedGlobalSettingsLinkColorVisibility = this.GlobalSettingsLinkColorDialogSettings.isVisible;
                this.cachedGlobalSettingsNodeColorVisibility = this.GlobalSettingsNodeColorDialogSettings.isVisible;
                this.GlobalSettingsDialogSettings.setVisibility(false);
                this.GlobalSettingsLinkColorDialogSettings.setVisibility(false);
                this.GlobalSettingsNodeColorDialogSettings.setVisibility(false);

                break;
            }
            case "2D Network": {

                this.showSettings = true;
                this.showExport = true;
                this.showCenter = true;
                this.showPinAllNodes = true;
                this.showRefresh = false;
                this.showButtonGroup = false;
                this.showSorting = false;

                break;
            }
            case "3D Network": {
                this.showSettings = true;
                this.showExport = true;
                this.showCenter = false;
                this.showPinAllNodes = false;
                this.showRefresh = true;
                this.showButtonGroup = false;
                this.showSorting = false;


                break;
            }
            case "Histogram": {

                this.showSettings = true;
                this.showExport = true;
                this.showCenter = false;
                this.showPinAllNodes = false;
                this.showRefresh = false;
                this.showButtonGroup = false;
                this.showSorting = false;

                break;
            }
            case "Table": {

                this.showSettings = false;
                this.showExport = true;
                this.showCenter = false;
                this.showPinAllNodes = false;
                this.showRefresh = false;
                this.showButtonGroup = true;
                this.showSorting = true;

                break;
            }
            case "Aggregation": {

                this.showSettings = true;
                this.showExport = true;
                this.showCenter = false;
                this.showPinAllNodes = false;
                this.showRefresh = false;
                this.showButtonGroup = false;
                this.showSorting = false;

                break;
            }
            case "Bubbles": {

                this.showSettings = true;
                this.showExport = true;
                this.showCenter = false;
                this.showPinAllNodes = false;
                this.showRefresh = false;
                this.showButtonGroup = false;
                this.showSorting = false;


                break;
            }
            case "Flow Diagram": {

                this.showSettings = true;
                this.showExport = true;
                this.showCenter = false;
                this.showPinAllNodes = false;
                this.showRefresh = false;
                this.showButtonGroup = false;
                this.showSorting = false;

                break;
            }
            case "Scatterplot": {

                this.showSettings = true;
                this.showExport = true;
                this.showCenter = false;
                this.showPinAllNodes = false;
                this.showRefresh = false;
                this.showButtonGroup = false;
                this.showSorting = false;

                break;
            }
            case "Waterfall": {

                this.showSettings = false;
                this.showExport = false;
                this.showCenter = false;
                this.showPinAllNodes = false;
                this.showRefresh = false;
                this.showButtonGroup = false;
                this.showSorting = false;

                break;
            }
            case "Map": {

                this.showSettings = true;
                this.showExport = true;
                this.showCenter = true;
                this.showPinAllNodes = false;
                this.showRefresh = false;
                this.showButtonGroup = false;
                this.showSorting = false;

                break;
            }
            case "Gantt": {

                this.showSettings = true;
                this.showExport = true;
                this.showCenter = false;
                this.showPinAllNodes = false;
                this.showRefresh = false;
                this.showButtonGroup = false;
                this.showSorting = false;

                break;
            }
            case "Heatmap": {

                this.showSettings = true;
                this.showExport = true;
                this.showCenter = false;
                this.showPinAllNodes = false;
                this.showRefresh = false;
                this.showButtonGroup = false;
                this.showSorting = false;

                break;
            }
            case "Phylogenetic Tree": {

                this.showSettings = true;
                this.showExport = true;
                this.showCenter = true;
                this.showPinAllNodes = false;
                this.showRefresh = false;
                this.showButtonGroup = false;
                this.showSorting = false;

                break;
            }
        }

        if (activeComponentName !== "Files" && this.previousTab === "Files") {
            this.GlobalSettingsDialogSettings.setVisibility(this.cachedGlobalSettingsVisibility);
            this.GlobalSettingsLinkColorDialogSettings.setVisibility(this.cachedGlobalSettingsLinkColorVisibility);
            this.GlobalSettingsNodeColorDialogSettings.setVisibility(this.cachedGlobalSettingsNodeColorVisibility);
        }

        if (!this.homepageTabs[tabNdx].componentRef) {
            setTimeout(() => {

                // let _type: any = this.GetComponentTypeByName(activeComponentName);

                // let factory = this.cfr.resolveComponentFactory(_type);

                // const viewContainerRef = this.targets.filter((element, index) => index === tabNdx);

                // if (viewContainerRef.length > 0) {

                //     this.cmpRef = viewContainerRef[0].createComponent(factory);
                // }

                tabNdx = this.homepageTabs.findIndex(x => x.label == activeComponentName);
                // this.homepageTabs[tabNdx].componentRef = this.cmpRef;
                // this.tabView.tabs[tabNdx].selected = true;

                console.log('this cmpRef: ', this.homepageTabs[tabNdx]);
                // this.cmpRef.instance.DisplayGlobalSettingsDialogEvent.subscribe((v) => { this.DisplayGlobalSettingsDialog(v) });

                // this.homepageTabs[tabNdx].componentRef.instance.InitView();
                // this.homepageTabs[tabNdx].componentRef.instance.DisplayGlobalSettingsDialogEvent.subscribe((v) => { this.DisplayGlobalSettingsDialog(v) });
                // this.homepageTabs[tabNdx].componentRef.instance.onRecallSession();

            });
        } else {
            // this.homepageTabs[tabNdx].componentRef.InitView();
        }

        this.previousTab = activeComponentName;
    }

    // openSettings(tabNdx: any): void {

    //     this.activeTabNdx = tabNdx;
    //     this.homepageTabs[tabNdx].componentRef.instance.openSettings();

    // }

    // openExport(tabNdx: any): void {
    //     this.homepageTabs[tabNdx].componentRef.instance.openExport();
    // }

    // openCenter(tabNdx: any): void {

    //     this.homepageTabs[tabNdx].componentRef.instance.openCenter();

    // }

    openPinAllNodes(tabNdx: any): void {
        console.log('open : ', tabNdx);
        this.homepageTabs[tabNdx].componentRef.openPinAllNodes();
    }

    // openRefreshScreen(tabNdx: any): void {
    //     this.homepageTabs[tabNdx].componentRef.instance.openRefreshScreen();
    // }

    // openSelectDataSetScreen(tabNdx: any, e: any): void {
    //     this.homepageTabs[tabNdx].componentRef.instance.openSelectDataSetScreen(e.option.value.toString().toLowerCase());
    // }



    removeTab(e: any) {
        console.log('remove tabs: ');
        // if (e.index > 0) {

        //     this.homepageTabs.splice(e.index, 1);

        //     if (e.index == this.homepageTabs.length - 1) {
        //         this.tabView.activeIndex = this.homepageTabs.length;
        //     } else {
        //         this.tabView.activeIndex = this.homepageTabs.length - 1;
        //     }

        //     this.setActiveTabProperties();
        // }
    }

    addTab(tabLabel: any, tabTitle: any, tabPosition: any, activate: boolean = true): void {

        /*/
         * Ensure that all tabs are not selected before we set the next new tab.
         * This will ensure that the newly created component appears on the currently selected tab, 
         * which will be the newly added tab array element.
        /*/
        this.homepageTabs.map(x => {

            x.isActive = false;
        });

        // this.tabView.tabs.map(x => {

        //     x.selected = false;
        // });

        this.activeTabIndex = tabPosition;
        this.homepageTabs.splice(tabPosition, 0, {
            label: tabLabel,
            templateRef: null,
            tabTitle: tabTitle,
            isActive: activate,
            componentRef: null

            // componentRef: this.goldenLayout.componentInstances[this.goldenLayout.componentInstances.length - 1]
        });

    }

    clearTable(tableId) {
        let linkColorTable = $(tableId).empty();
    }

    onReloadScreen() {
        this.commonService.session.style.widgets = this.commonService.defaultWidgets();

      console.log('onReloadScreen microbetrace.component.ts')
        this.loadSettings();
    }

    loadSettings() {
        //Filtering|Prune With
        this.SelectedPruneWityTypesVariable = this.visuals.microbeTrace.commonService.session.style.widgets["link-show-nn"] ? "Nearest Neighbor" : "None";
        this.onPruneWithTypesChanged();

        //Filtering|Minimum Cluster Size
        this.SelectedClusterMinimumSizeVariable = this.visuals.microbeTrace.commonService.session.style.widgets["cluster-minimum-size"];
        this.onMinimumClusterSizeChanged();
        
        //Filtering|Filter Links on
        this.SelectedLinkSortVariable = this.visuals.microbeTrace.commonService.session.style.widgets["link-sort-variable"];
        this.onLinkSortChanged();

        //Filtering|Filtering Threshold
        this.SelectedLinkThresholdVariable = this.visuals.microbeTrace.commonService.session.style.widgets["link-threshold"];
        this.onLinkThresholdChanged();

        //Styling|Color Nodes By
        this.SelectedColorNodesByVariable = this.visuals.microbeTrace.commonService.session.style.widgets["node-color-variable"];
        this.onColorNodesByChanged();

        //Styling|Nodes
        this.SelectedNodeColorVariable = this.visuals.microbeTrace.commonService.session.style.widgets["node-color"];
        this.onNodeColorChanged();

        //Styling|Color Links By
        if (this.visuals.microbeTrace.commonService.session.style.widgets['link-color-variable'] === "None") {
            this.visuals.microbeTrace.commonService.session.style.widgets['link-color-variable'] = "origin";
        }

        this.SelectedColorLinksByVariable = this.visuals.microbeTrace.commonService.session.style.widgets['link-color-variable'];
        this.onColorLinksByChanged();

         //Styling|Links
         this.SelectedLinkColorVariable = this.visuals.microbeTrace.commonService.session.style.widgets["link-color"];
         this.onLinkColorChanged();

        //Styling|Link Color Table

        //Styling|Selected
        this.SelectedColorVariable = this.visuals.microbeTrace.commonService.session.style.widgets['selected-color'];

        //Styling|Background
        this.SelectedBackgroundColorVariable = this.visuals.microbeTrace.commonService.session.style.widgets['background-color'];
        this.onBackgroundChanged();

        this.updateGlobalSettingsModel();
    }

    publishLoadNewData() {

        // this.goldenLayout.componentInstances[1].onLoadNewData();
        this.homepageTabs.forEach(tab => {
            if (tab.componentRef &&
                tab.componentRef.onLoadNewData) {
                tab.componentRef.onLoadNewData();
            }
        })
    }

    publishFilterDataChange() {

        // this.goldenLayout.componentInstances[1].onFilterDataChange();
        this.homepageTabs.forEach(tab => {
            if (tab.componentRef &&
                tab.componentRef.onFilterDataChange) {
                tab.componentRef.onFilterDataChange();
            }
        })
    }

    ngOnDestroy(): void {
        this.NewSession();
    }

  onDistanceMetricChanged = () => {
    if (this.SelectedDistanceMetricVariable.toLowerCase() === 'snps') {
      $('#default-distance-threshold, #link-threshold')
        .attr('step', 1)
        .val(16)
        .trigger('change');
      this.visuals.microbeTrace.commonService.session.style.widgets['default-distance-metric'] = 'snps';
      this.SelectedLinkThresholdVariable = '16';
      this.onLinkThresholdChanged();
    } else {
      $('#default-distance-threshold, #link-threshold')
        .attr('step', 0.001)
        .val(0.015)
        .trigger('change');
      this.visuals.microbeTrace.commonService.session.style.widgets['default-distance-metric'] = 'TN93';
      this.SelectedLinkThresholdVariable = '0.015';
      this.onLinkThresholdChanged();
    }
  }
}

class BpaaSPayloadWrapper {
    public BlockHashCode: string | undefined = undefined;
    public BlockName: string | undefined = undefined;
    public BpaaSPayload: BpaaSPayloadWrapperData | undefined = undefined;
    public FuzzyMatchRatios: string | undefined = undefined;

}

class BpaaSPayloadWrapperData {
    public Type: string | undefined = undefined;
    public SubType: 'Edgelist' | 'Nodelist' | undefined = undefined;
    public JurisdictionKey: number | undefined = undefined;
    public JurisdictionName: string | undefined = undefined;
    public Jurisdiction: string | undefined = undefined;
    public FileName: string | undefined = undefined;
    public Data: any[] = [];
}
