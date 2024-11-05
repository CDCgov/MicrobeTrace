import { ChangeDetectionStrategy, Component, OnInit, Injector, ViewChild, ViewChildren, AfterViewInit, ComponentRef, ViewContainerRef, QueryList, ElementRef, Output, EventEmitter, ChangeDetectorRef, OnDestroy, ViewEncapsulation, Renderer2 } from '@angular/core';
import { CommonService } from './contactTraceCommonServices/common.service';
import { TwoDComponent } from './visualizationComponents/TwoDComponent/twoD-plugin.component';
import { TableComponent } from './visualizationComponents/TableComponent/table-plugin-component';
import { MapComponent } from './visualizationComponents/MapComponent/map-plugin.component';
import { PhylogeneticComponent } from './visualizationComponents/PhylogeneticComponent/phylogenetic-plugin.component';
import * as d3 from 'd3';
import { window, TabsetComponent } from 'ngx-bootstrap';
import { Button } from 'primeng/button';
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
import { GoldenLayoutComponentService } from './golden-layout-component.service';
import { Tabulator } from 'tabulator-tables';
import { Subscription } from 'rxjs';
import { GoldenLayoutHostComponent } from './golden-layout-host.component';
import * as Papa from 'papaparse';
import JSZip from 'jszip';


@Component({
    changeDetection: ChangeDetectionStrategy.Default,
    selector: 'contact-trace',
    encapsulation: ViewEncapsulation.None,
    templateUrl: './microbe-trace-next-plugin.component.html',
    styleUrls: ['./microbe-trace-next-plugin.component.less']
})

export class MicrobeTraceNextHomeComponent extends AppComponentBase implements AfterViewInit, OnInit, OnDestroy {


    // recommit original code
    @ViewChild('stashes') stashes: ElementRef;

    @ViewChild('goldenLayoutHost') _goldenLayoutHostComponent: GoldenLayoutHostComponent;

    @ViewChild('linkThresholdSparkline') linkThresholdSparkline: ElementRef;


    public metric: string = "tn93";
    public ambiguity: string = "Average";
    public launchView: string = "2D Network";
    public threshold: string = "0.015";

    widgets: object; 
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
    displayMTDialog: boolean = false;
    displayRecallStashDialog: boolean = false;
    displayLedgerLoaderDialog: boolean = false;
    version: string = '2.0';
    auspiceUrlVal: string|null = '';

    saveFileName: string = '';
    saveByCluster: boolean = false;
    saveFileTypeOptions = [
        { label: 'session', value: 'session'},
        { label: 'style', value: 'style'}
    ];
    selectedSaveFileType: string = 'session';

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
    SelectedEpsilonValue: string;


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
    @ViewChild('dataSet') dataSet: Selection;
    @ViewChildren('placeholder', { read: ViewContainerRef }) targets: QueryList<ViewContainerRef>
    @ViewChild('ledgerloader') spinnerElement: ElementRef;
    @ViewChild('ledgerloadDiv') spinnerDivElement: ElementRef;
    @ViewChild('globalSettingsTab') globalSettingsTab: TabsetComponent;


    // @ViewChild('pinbutton') pinBtn: ElementRef<HTMLElement>;
    @ViewChild('pinbutton') pinBtn: ElementRef<HTMLElement>;



    public HideThisForNow: boolean = false;

    files: any[] = [];

    homepageTabs: HomePageTabItem[] = [];
    currentUrl: string;
    // homepageTabs: HomePageTabItem[] = [
    //     {
    //         label: 'Files',
    //         templateRef: null,
    //         tabTitle: 'Files',
    //         isActive: true,
    //         componentRef: null
    //     }
    // ];

    constructor(
        injector: Injector,
        public commonService: CommonService,
        private goldenLayoutComponentService: GoldenLayoutComponentService,
        public domSanitizer: DomSanitizer,
        private cdref: ChangeDetectorRef,
        private el: ElementRef, 
        private renderer: Renderer2,
        private eventEmitterService: EventEmitterService,
    ) {


        super(injector);

        this.visuals = commonService.visuals;
        this.visuals.microbeTrace = this;
        this.widgets = this.commonService.session.style.widgets

        this.appSession = injector.get(AppSessionService);

        this.activeTabIndex = 0;

        this.dataSetView = [];
        this.dataSetView.push({ label: 'Nodes', value: 'Node' });
        this.dataSetView.push({ label: 'Links', value: 'Link' });
        this.dataSetView.push({ label: 'Clusters', value: 'Cluster' });

        this.dataSetViewSelected = "Node";

        this.currentUrl = window.location.href;

        // setTimeout(() => {
        //     srv.createNewComponent(srv.getRegisteredComponents()[0]);
        //   }, 1000);

        //   setTimeout(() => {
        //     srv.createNewComponent(srv.getRegisteredComponents()[0]);
        //   }, 10000);
    }

    getElementById(id: string): HTMLElement | null {
        const element = this.el.nativeElement.querySelector(`#${id}`);
        return element;
    }

    ngOnInit() {

        const params = new URLSearchParams(window.location.search);
        this.auspiceUrlVal = params.get('url');
        if(this.commonService.debugMode) {
            console.log(this.auspiceUrlVal);
        }
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
        this.SelectedColorLinksByVariable = this.commonService.GlobalSettingsModel.SelectedColorLinksByVariable;

        this.SelectedTimelineVariable = this.commonService.session.style.widgets['node-timeline-variable'];
        this.SelectedColorVariable = this.commonService.session.style.widgets['selected-color'];

        this.SelectedLinkColorTableTypesVariable = this.commonService.GlobalSettingsModel.SelectedLinkColorTableTypesVariable;
        this.SelectedApplyStyleVariable = this.commonService.GlobalSettingsModel.SelectedApplyStyleVariable;

        this.commonService.updateThresholdHistogram();

        if(this.commonService.debugMode) {
            console.log("global settings: ", this.commonService.GlobalSettingsModel.SelectedLinkThresholdVariable);
            console.log("SelectedLinkThresholdVariable: ", this.SelectedLinkThresholdVariable);
        }
        

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

        let that = this;

        $( document ).on( "link-visibility", function( ) {
            that.generateNodeLinkTable("#link-color-table");
        });

        setTimeout(() => {
            $('#top-toolbar').fadeTo("slow", 1);
            // TODO:: uncommentback when done Subscribe for files subscription
            // this.homepageTabs[0].componentRef = this.goldenLayout.componentInstances[0];
        }, 1000);
        setTimeout(() => {
            if (cachedLSV) {
                if (cachedLSV === 'snps') {
                   this.metric = 'snps';
                   this.threshold = '7';
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

        }, 5000);
           
    }

    addComponent( component: string ) {

        // const componentType = this._selectedRegisteredComponentTypeName;
        const goldenLayoutComponent = this._goldenLayoutHostComponent.goldenLayout.newComponent(component);

        const componentRef = this._goldenLayoutHostComponent.getComponentRef(goldenLayoutComponent.container);
        
        this.addTab(component, component + this.activeTabIndex, this.activeTabIndex, componentRef);
        
        
        setTimeout(() => {
          
            // this.goldenLayout.componentInstances[this.goldenLayout.componentInstances.length - 1].DisplayGlobalSettingsDialogEvent.subscribe((v) => { this.DisplayGlobalSettingsDialog(v) });

            this.setActiveTabProperties();
            this.loadSettings();
        });

    }

    /**
     * Removes a component from this.homepageTabs
     * @param component name of the component to be removed
     */
    public removeComponent( component: string ) {
        this.homepageTabs = this.homepageTabs.filter((tab) => {
            return tab.label !== component;
        });
    }


    /**
     * Delete file from files list
     * @param index (File index)
     */
    deleteFile(index: number) {
        this.files.splice(index, 1);
    }

    /**
     * Uses search-field, search-whole-word, search-case-sensitive widgets, and searchText variable to search each node and select all nodes that meet current criteria.
     * Also populates search-results list, and sets function that selects the node for when an option in the list is selected.
     */
    public onSearch() {
        let nodes = this.commonService.session.data.nodes;
        const n = nodes.length;

        let v = this.searchText;
        const val = v;

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
  
                let fieldData = node[field].toString(); // Convert the data to string
                // matches anything that is not a digit, letter, whitespace or one of following char < > & and replaces with corresponding HTML entity number
                const encodedField = fieldData.replace(/[\u00A0-\u9999<>\&]/g, function(i) {
                  return '&#'+i.charCodeAt(0)+';';
                });
                dataSet.add(`${encodedField}`);
            }
          }
          let dataArray = Array.from(dataSet).sort() as string[];
          //#298
          if (this.commonService.session.style.widgets["search-whole-word"])  v = '\\b' + v + '\\b';
          let vre: RegExp;
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
          
        // on click of an option from the search list, the node is selected
          $('.autocomplete-wrapper li').on('click', function() {
            let ac_v = $(this).attr('data-value');
            const ac_val = ac_v;
            let ac_vre: RegExp;
            $('#search').val(ac_v);
            $('#search-results').html("").hide();
          
            if (that.commonService.session.style.widgets["search-whole-word"])  ac_v = '\\b' + ac_v + '\\b';
            if (that.commonService.session.style.widgets["search-case-sensitive"])  ac_vre = new RegExp(ac_v);
            else ac_vre = new RegExp(ac_v, 'i');
  
            for(let i = 0; i < n; i++){

              let node = nodes[i];

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

            $(document).trigger("node-selected");

          });
  
          let firstSelected = false;

          // selects that meets current search criteria
          for(let i = 0; i < n; i++){
  
            if(!firstSelected){
                let node = nodes[i];

                if (!node[field]) {
                  node.selected = false;
                }
                if (typeof node[field] == "string") {
                  node.selected = vre.test(node[field]);
                  firstSelected = true;
                }
                if (typeof node[field] == "number") {
                  node.selected = (node[field] + "" == val);
                  firstSelected = true;
                }
            } else {
                break;
            }
            
          }
  
          if (!nodes.some(node => node.selected)) console.log('no matches');
        }

        $(document).trigger("node-selected");
    }

    /**
     * Updates search-field widget (with variable to search in) can updates search
     */
    public onSearchFieldChange(ev) {
        this.commonService.session.style.widgets["search-field"] = ev;
        this.onSearch();
    }

    /**
     * Updates search-whole-word widget can updates search
     */
    public onWholeWordChange() {
        this.commonService.session.style.widgets["search-whole-word"] = !this.commonService.session.style.widgets["search-whole-word"];
        this.onSearch();
    }

    /**
     * Updates search-case-sensitive widget can updates search
     */
    public onCaseSensitiveChange() {
        this.commonService.session.style.widgets["search-case-sensitive"] = !this.commonService.session.style.widgets["search-case-sensitive"];
        this.onSearch();
    }


    /**
     * Convert Files list to normal array list
     * @param files (Files List)
     */
    prepareFilesLists($event) {

        if(this.commonService.debugMode) {
            console.log("Trying to prepare files");
        }
        // this.commonService.resetData();
        this.commonService.session.files = [];
        if (!this.commonService.session.style.widgets) {
            this.commonService.session.style.widgets = this.commonService.defaultWidgets();
        }

        if(this.commonService.debugMode) {
          console.log('threshold: ', this.commonService.session.style.widgets['link-threshold']);
        }
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
        this._removeGlView('2D Network');

        if(this.commonService.debugMode) {
            console.log('homepage tabs1: ', this.homepageTabs);
        }

        this.getfileContent($event);
    }

    /**
     * Updates metric based on selection
     * @param value - metric selected
     */
     public updateMetric( value: string ) : void {
        this.metric = value;
        if(this.commonService.debugMode) {
            console.log('updating metric: ', this.metric);
        }

        if (this.metric.toLowerCase() === "snps") {
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
        if(this.commonService.debugMode) {
            console.log('threshold: ', this.threshold);
        }
        this.SelectedLinkThresholdVariable = this.threshold;
        this.commonService.GlobalSettingsModel.SelectedLinkThresholdVariable = this.SelectedLinkThresholdVariable;
        if(this.commonService.debugMode) {
            console.log('loading settingss1: ', this.visuals.microbeTrace.commonService.session.style.widgets["link-threshold"]);
        }
        this.visuals.microbeTrace.commonService.session.style.widgets["link-threshold"] = Number(this.threshold);
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
        // this._removeGlView('Files');
        $('#overlay').fadeOut("slow");
        $('.ui-tabview-nav').fadeTo("slow", 1);
        $('.m-portlet').fadeTo("slow", 1);
    }

    /**
     * Updates background-color widget and then updates background color on twoD network (or any element with #network)
     */
    onBackgroundChanged() {
        this.visuals.microbeTrace.commonService.session.style.widgets['background-color'] = this.visuals.microbeTrace.SelectedBackgroundColorVariable;

        if ($('div.unovis-single-container > svg:first-of-type') != undefined) {
            $('div.unovis-single-container > svg:first-of-type').css('background-color', this.SelectedBackgroundColorVariable);
        }
    }


    /**
     * Updates GlobalSetingModel variable and cluster-minimum-size widget. Removes and adds clusters when needed
     * 
     * XXXXX bug: when minimum cluster size is set to 9 in test dataset, the smallest cluster disappears as expected. When set to 8 it doesn't reappear. Have to 
     * value to 1 to get the small cluster to appear. Then even though the small clusters has links, the nodes within it are treated as different cluster (node color by cluster)
     * and network statistics table; however link color by cluster treats them as one cluster. When you set cluster size to 2, the problem resolves. XXXXX
     */
    onMinimumClusterSizeChanged() {

        this.visuals.microbeTrace.commonService.GlobalSettingsModel.SelectedClusterMinimumSizeVariable = this.visuals.microbeTrace.SelectedClusterMinimumSizeVariable;

        let val = parseInt(this.visuals.microbeTrace.SelectedClusterMinimumSizeVariable);

        this.visuals.microbeTrace.commonService.session.style.widgets["cluster-minimum-size"] = val;

        // this.visuals.microbeTrace.commonService.setClusterVisibility(true);
        // this.visuals.microbeTrace.commonService.setLinkVisibility(true);
        // this.visuals.microbeTrace.commonService.setNodeVisibility(true);

        // this.visuals.microbeTrace.updatedVisualization();

        // this.visuals.microbeTrace.commonService.updateStatistics();

        this.visuals.microbeTrace.commonService.setLinkVisibility(true);
        this.visuals.microbeTrace.commonService.tagClusters().then(() => {
            this.visuals.microbeTrace.commonService.setClusterVisibility(true);
            this.visuals.microbeTrace.commonService.setNodeVisibility(true);
            this.visuals.microbeTrace.commonService.setLinkVisibility(true);
          ["cluster", "link", "node"].forEach(thing => {
            $(document).trigger(thing + "-visibility");
          });
          this.visuals.microbeTrace.commonService.updateStatistics();
          this.visuals.microbeTrace.updatedVisualization();

        });

    }

    /**
     * Updates GlobalSettingsModel variable and link-sort-variable widget. Updates link threshold histogram and then updates network
     */
    onLinkSortChanged() {
        this.visuals.microbeTrace.commonService.GlobalSettingsModel.SelectedLinkSortVariable = this.visuals.microbeTrace.SelectedLinkSortVariable;

        this.visuals.microbeTrace.commonService.session.style.widgets["link-sort-variable"] = this.visuals.microbeTrace.SelectedLinkSortVariable;
        this.visuals.microbeTrace.commonService.updateThresholdHistogram();
        this.visuals.microbeTrace.commonService.updateNetwork();
    }

    /**
     * Reads the file and applies the style to MicrobeTrace session.style
     * 
     */
    public onApplyStyle( file: any ){
        $('.custom-file-label').text(this.SelectedApplyStyleVariable.substring(12))
        let reader = new FileReader();
        reader.onload = e => {
            this.commonService.applyStyle(JSON.parse((e as any).target.result)); 
        }
        reader.readAsText(file.target.files[0]);
    }

    applyStyleFileSettings() {
        this.widgets = window.context.commonService.session.style.widgets;

        if (this.SelectedClusterMinimumSizeVariable != this.widgets['cluster-minimum-size']){
            this.SelectedClusterMinimumSizeVariable = this.widgets['cluster-minimum-size'];
            this.onMinimumClusterSizeChanged();
            // not triggering render clus-vis correctly, may be relate to bug with onMinimumClusterSizeChanged()
        }

        if (this.SelectedColorNodesByVariable != this.widgets['node-color-variable']){
            this.SelectedColorNodesByVariable = this.widgets['node-color-variable'];
            this.getGlobalSettingsData();
            this.onColorNodesByChanged();
        }
        
        if (this.SelectedColorLinksByVariable != this.widgets['link-color-variable']){
            this.SelectedColorLinksByVariable = this.widgets['link-color-variable'];
            this.onColorLinksByChanged();
        }

        if (this.SelectedBackgroundColorVariable != this.widgets['background-color']){
            this.SelectedBackgroundColorVariable = this.widgets['background-color'];
            this.onBackgroundChanged();
        }
    }

    onEpsilonValueChange() {
        this.visuals.microbeTrace.commonService.session.style.widgets["mst-computed"] =false;
        this.onPruneWithTypesChanged(); 
    }

    onPruneWithTypesChanged() {

        this.visuals.microbeTrace.commonService.GlobalSettingsModel.SelectedPruneWityTypesVariable = this.visuals.microbeTrace.SelectedPruneWityTypesVariable;

        //debugger;

        if (this.visuals.microbeTrace.SelectedPruneWityTypesVariable == "None") {
            $('#filtering-epsilon-row').slideUp();
            this.visuals.microbeTrace.commonService.session.style.widgets["link-show-nn"] = false;
            this.visuals.microbeTrace.commonService.updateNetwork();

            this.visuals.microbeTrace.updatedVisualization();
        }
        else {
            this.SelectedEpsilonValue = Math.pow(10, this.widgets['filtering-epsilon']).toPrecision(3);
            window.context.commonService.session.style.widgets["filtering-epsilon"] = this.widgets['filtering-epsilon'];
            this.visuals.microbeTrace.commonService.session.style.widgets["link-show-nn"] = true;
            $('#filtering-epsilon-row').slideDown();
            // TODO:: Removed to fix NN issue
            // if(!this.visuals.microbeTrace.commonService.session.style.widgets["mst-computed"]) {
            //     this.visuals.microbeTrace.commonService.computeMST().then(() => {
            //         this.visuals.microbeTrace.commonService.updateNetwork();
            //         this.visuals.microbeTrace.updatedVisualization();

            //         if ('tableComp' in this.commonService.visuals) {
            //             if (this.commonService.visuals.tableComp.dataSetViewSelected == 'Link') {
            //                 this.commonService.visuals.tableComp.openSelectDataSetScreen({value: 'Link'});
            //             }
            //         }
            //     });
            //      this.visuals.microbeTrace.commonService.session.style.widgets["mst-computed"] = true;
            //      console.log('updated compute:' , this.visuals.microbeTrace.commonService.session.style.widgets["mst-computed"]);
            //      return;
            //    } else {


                this.visuals.microbeTrace.commonService.updateNetwork();

            //    }

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

    /**
     * Updates this.commonService.GlobalSettingsModel.SelectedNodeColorTableTypesVariable and 
     * then hides the node color table or calls onColorNodesByChanged
     */
    onNodeColorTableChanged() {

        if(this.commonService.debugMode) {
            console.log('node color changed: ', this.SelectedNodeColorTableTypesVariable);
        }
        this.commonService.GlobalSettingsModel.SelectedNodeColorTableTypesVariable = this.SelectedNodeColorTableTypesVariable;

        if (this.SelectedNodeColorTableTypesVariable == "Hide") {
            this.GlobalSettingsNodeColorDialogSettings.setVisibility(false);
        }
        else {
            this.onColorNodesByChanged();         
        }
    }

    /**
     * @param table 'node' | 'link'
     * @returns boolean of whether the table should be visible based on the table and which view is active
     * This is just one factor to determine whether to show or hide table, also color by variable and show/hide state
     */
    checkActiveView(table: string) {
        if (table == 'node') {
            for (let view in this.commonService.visuals) {
                if (['twoD', 'gisMap', 'phylogenetic'].includes(view) && this.commonService.visuals[view].viewActive) {
                    return true;
                }
            }
            return false;
        } else if (table == 'link') {
            for (let view in this.commonService.visuals) {
                if (['twoD', 'gisMap'].includes(view) && this.commonService.visuals[view].viewActive) {
                    return true;
                }
            }
            return false;
        } else {
            return false;
        }
    }

    onShowStatisticsChanged() {


        if (this.SelectedStatisticsTypesVariable === "Show"){
            this.visuals.microbeTrace.commonService.updateStatistics();
            $("#network-statistics-wrapper").fadeIn();
        } else {
            this.visuals.microbeTrace.commonService.updateStatistics();
            $("#network-statistics-wrapper").fadeOut();
        }
  

        this.commonService.GlobalSettingsModel.SelectedStatisticsTypesVariable = this.SelectedStatisticsTypesVariable;


        // if (this.homepageTabs[this.activeTabNdx].label == "2D Network") {
        //     this.homepageTabs[this.visuals.microbeTrace.activeTabNdx].componentRef.enableSettings();
        // }

    }

    /**
     * Updates node-color widget and published node color to each view to update them. Only relevant when color nodes by = None
     */
    onNodeColorChanged() {
        let variable = this.SelectedNodeColorVariable;
        this.commonService.session.style.widgets["node-color"] = variable;

        this.publishUpdateNodeColors();
    }

    /**
     * calls updateNodeColors() for each view
     */
    publishUpdateNodeColors() {
        this.homepageTabs.forEach(tab => {
            if (tab.componentRef &&
                tab.componentRef.instance.updateNodeColors) {
                tab.componentRef.instance.updateNodeColors();
            }
        })
    }

    /**
     * Updates visualization for each view that is available
     */
    publishUpdateVisualization() {
        this.homepageTabs.forEach(tab => {
            if (tab.componentRef &&
                tab.componentRef.instance.updateVisualization) {
                tab.componentRef.instance.updateVisualization();
            }
        })
    }

    publishUpdateLinkColor() {
        this.homepageTabs.forEach(tab => {
            if (tab.componentRef &&
                tab.componentRef.instance.updateLinkColor) {
                tab.componentRef.instance.updateLinkColor();
            }
        })
    }

    public onLinkColorChanged() : void {


        this.commonService.session.style.widgets["link-color"] = this.SelectedLinkColorVariable;

        this.publishUpdateLinkColor();

    }

    onColorLinksByChanged() {

        this.visuals.microbeTrace.SelectedColorLinksByVariable = this.visuals.microbeTrace.SelectedColorLinksByVariable;

        this.visuals.microbeTrace.commonService.GlobalSettingsModel.SelectedColorLinksByVariable = this.visuals.microbeTrace.SelectedColorLinksByVariable;

        if (!this.GlobalSettingsLinkColorDialogSettings.isVisible) {

            if (this.SelectedColorLinksByVariable != "None" && this.checkActiveView('link')) {
                this.SelectedLinkColorTableTypesVariable = "Show";
                this.GlobalSettingsLinkColorDialogSettings.setVisibility(true);
                this.cachedGlobalSettingsLinkColorVisibility = this.GlobalSettingsLinkColorDialogSettings.isVisible;
                
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
                const element = this.el.nativeElement.querySelector('#link-color-table');
                this.commonService.setLinkTableElement(element);
                this.ShowGlobalSettingsLinkColorTable = true;
            } else {
                $('#link-color-table-row').slideDown();
            }

            this.publishUpdateLinkColor();
        }
        else {
            $('#link-color-table').empty();
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
            ("<th class='p-1 table-header-row'><div class='header-content'><span contenteditable>Link " + this.commonService.titleize(this.SelectedColorLinksByVariable) + "</span><a class='sort-button' style='cursor: pointer'>⇅</a></div></th>") +
            "<th class='table-header-row tableCount'><div class='header-content'><span contenteditable>Count</span><a class='sort-button' style='cursor: pointer'>⇅</a></div></th>" +
            "<th class='table-header-row tableFrequency'><div class='header-content'><span contenteditable>Frequency</span><a class='sort-button' style='cursor: pointer'>⇅</a></div></th>" +
            "<th>Color</th>" +
            "</tr>"
        );

        if (!this.visuals.microbeTrace.commonService.session.style.linkValueNames)
            this.visuals.microbeTrace.commonService.session.style.linkValueNames = {};
            
        const aggregates = this.visuals.microbeTrace.commonService.createLinkColorMap();
        if (this.commonService.debugMode) {
            console.log('link aggregates: ', aggregates);
        }
        const vlinks = this.visuals.microbeTrace.commonService.getVisibleLinks();
        const aggregateValues = Object.keys(aggregates);

        const disabled: string = isEditable ? '' : 'disabled';

        aggregateValues.forEach((value, i) => {

            if (aggregates[value] == 0) {
                return;
            }
            if (this.commonService.debugMode) {
                console.log('link color aggregates value: ', aggregates[value]);
                console.log('link color value: ', value);
                console.log('link color map: ', this.visuals.microbeTrace.commonService.temp.style.linkColorMap);
                console.log('link color map value: ', this.visuals.microbeTrace.commonService.temp.style.linkColorMap(value));
            }

            // Grab color of link from session
            const color = this.visuals.microbeTrace.commonService.temp.style.linkColorMap(value);

            // Create color input element with color value and assign id to retrieve new value on change
            let colorinput = $(`<input type="color" value="${color}" ${disabled}>`)
                .on("change", e => {

                    // Need to get value from id since "this" keyword is used by angular
                    // Update that value at the index in the color table
                    (this.visuals.microbeTrace.commonService.session.style.linkColors as any).splice(i, 1,e.target['value']);

                    // Generate new color map with updated table
                    this.visuals.microbeTrace.commonService.temp.style.linkColorMap = d3
                        .scaleOrdinal(this.visuals.microbeTrace.commonService.session.style.linkColors)
                        .domain(aggregateValues);


                    // Call the updateLinkColor method in the active tab
                    this.visuals.microbeTrace.homepageTabs[this.activeTabIndex].componentRef.instance.updateLinkColor();

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

                            this.visuals.microbeTrace.homepageTabs[this.activeTabIndex].componentRef.instance.updateLinkColor();
                            // this.goldenLayout.componentInstances[1].updateLinkColor();

                        });
                });

            let row = $(
                "<tr>" +
                "<td data-value='" + value + "'>" +
                (this.visuals.microbeTrace.commonService.session.style.linkValueNames[value] ? this.visuals.microbeTrace.commonService.session.style.linkValueNames[value] : this.commonService.titleize("" + value)) +
                "</td>" +
                "<td class='tableCount'>" + aggregates[value] + "</td>" +
                "<td class='tableFrequency'>" + (aggregates[value] / vlinks.length).toLocaleString() + "</td>" +
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

        let isAscending = true;  // add this line before the click event handler
        this.updateCountFreqTable('link-color')
        $('#linkColorTableSettings').on('mouseleave', () => $('#linkColorTableSettings').delay(500).css('display', 'none'));

        $(tableId).on('click', '.sort-button', function() {
            let table = $(this).parents('table').eq(0);
            let rows = table.find('tr:gt(0)').toArray().sort(comparer($(this).parent().parent().index()));
            isAscending = !isAscending;  // replace 'this.asc' with 'isAscending'
            if (!isAscending){rows = rows.reverse();}
            for (let i = 0; i < rows.length; i++){
                table.append(rows[i]);
            }
        });
        
        
        function comparer(index) {
            return function(a, b) {
                let valA = getCellValue(a, index), valB = getCellValue(b, index);
                if(this.commonService.debugMode) {
                    console.log(`Comparing: ${valA} and ${valB}`);  // New line
                }
                return !isNaN(Number(valA)) && !isNaN(Number(valB)) ? Number(valA) - Number(valB) : valA.toString().localeCompare(valB);
            }
        }
        
        function getCellValue(row, index){ 
            let value = $(row).children('td').eq(index).text();
            if(this.commonService.debugMode) {
                console.log(`Cell value: ${value}`);  // New line
            }
            return value;
        }        
     }

    public onTimelineChanged(e) : void {
        this.SelectedTimelineVariable = e;
        if(this.commonService.debugMode) {
            console.log('timeline changed: ', e);
        }
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

        console.log('timeline variable: ', variable);
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
            console.log('time moment: ', time);
            if (time.isValid()) {
                console.log('time moment value: ', d[field]);
            d[field] = time.toDate();
            times.push(d[field]);
            } else {
                console.log('time moment not value: ', d[field]);

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
            width = ($('#visualwrapper').width() * 4 / 5) - margin.left - margin.right,
            height = 200 - margin.top - margin.bottom;
        console.log('time network width: ', $('#visualwrapper').width());
        console.log('time width: ', width);
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
        
            console.log('attribute: ', this.xAttribute.range());
            console.log('attributex: ', this.xAttribute.range()[0]);

        slider.append("line")
            .attr("class", "track")
            .attr("x1", this.xAttribute.range()[0])
            .attr("x2", this.xAttribute.range()[1])
            .attr("stroke", "#ddd")  // Ensure this is a visible color
            .attr("stroke-width", "10px")  // Ensure this is a sufficient width
            // Pre D3
            // .select(function() { return this.parentNode.appendChild(this.cloneNode(true)); })
            //.each(function() { this.parentNode.appendChild(this.cloneNode(true)); })
        slider.append('line')
            .attr("class", "track-inset")
            .attr("x1", this.xAttribute.range()[0])
            .attr("x2", this.xAttribute.range()[1])
            .attr("stroke", "#ddd")  // Ensure this is a visible color
            .attr("stroke-width", "10px")  // Ensure this is a sufficient width
            //.each(function() { this.parentNode.appendChild(this.cloneNode(true)); })
        slider.append('line')
            // Pre D3
            // .select(function() { return this.parentNode.appendChild(this.cloneNode(true)); })
            .attr("class", "track-overlay")
            .attr("x1", this.xAttribute.range()[0])
            .attr("x2", this.xAttribute.range()[1])
            .attr("stroke", "#ddd")  // Ensure this is a visible color
            .attr("stroke-width", "10px")  // Ensure this is a sufficient width
            .call(d3.drag()
                .on("start.interrupt", function() { slider.interrupt(); })
                .on("start drag", function() {
                    that.currentTimelineValue = (d3 as any).event.x;
                    that.update(that.xAttribute.invert(that.currentTimelineValue));
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

            this.handle = slider.insert("circle", ".track-overlay")
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

    showNodeColorTable() {
        if (this.SelectedNodeColorTableTypesVariable !=' Show') {
            this.SelectedNodeColorTableTypesVariable='Show';
            this.onNodeColorTableChanged();
        };
    }

    hideNodeColorTable() {
        if (this.SelectedNodeColorTableTypesVariable != 'Hide') {
           this.SelectedNodeColorTableTypesVariable='Hide';
           this.onNodeColorTableChanged()
        }
    }

    showLinkColorTable() {
        if (this.SelectedLinkColorTableTypesVariable !=' Show') {
            this.SelectedLinkColorTableTypesVariable='Show';
            this.onLinkColorTableChanged();
        }
    }

    hideLinkColorTable() {
        if (this.SelectedLinkColorTableTypesVariable != 'Hide') {
           this.SelectedLinkColorTableTypesVariable='Hide';
           this.onLinkColorTableChanged()
        }
    }

    /**
     * Called when SelectedColorNodesByVariable (keeps track of what variable to use to color nodes by) is changed.
     */
    onColorNodesByChanged() {

        this.commonService.GlobalSettingsModel.SelectedColorNodesByVariable = this.SelectedColorNodesByVariable;


        if (!this.GlobalSettingsNodeColorDialogSettings.isVisible) {

            if (this.SelectedColorNodesByVariable != "None" && this.checkActiveView('node')) {
                this.SelectedNodeColorTableTypesVariable = 'Show';
                this.GlobalSettingsNodeColorDialogSettings.setVisibility(true);
                this.cachedGlobalSettingsNodeColorVisibility = this.GlobalSettingsNodeColorDialogSettings.isVisible;
                let prevColorNodesByVariable = this.SelectedColorNodesByVariable;

                // this detect changes leads to SelectedColorNodesByVariable being set to default value when loading MT files that have both 2D and map view
                this.cdref.detectChanges();
                if (prevColorNodesByVariable != this.SelectedColorNodesByVariable) this.SelectedColorNodesByVariable = prevColorNodesByVariable;
            }
        }

        this.commonService.session.style.widgets["node-color-variable"] = this.SelectedColorNodesByVariable;


        if (this.SelectedColorNodesByVariable !== "None") {

            this.generateNodeColorTable("#node-color-table");
            
            $('#node-color-value-row').slideUp();

            //If hidden by default, unhide to perform slide up and down
            if(!this.ShowGlobalSettingsNodeColorTable){
                const element = this.el.nativeElement.querySelector('#node-color-table');
                this.commonService.setNodeTableElement(element);
                this.ShowGlobalSettingsNodeColorTable = true;
            } else {
                $('#node-color-table-row').slideDown();
            }

            this.visuals.microbeTrace.publishUpdateNodeColors();

        // if color nodes by equals None, then hide node color table
        } else {
            $('#node-color-table').empty();
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
            "<th class='p-1 table-header-row'><div class='header-content'><span contenteditable>Node " + this.commonService.titleize(this.SelectedColorNodesByVariable) + "</span><a class='sort-button' style='cursor: pointer'>⇅</a></div></th>" +
            "<th class='table-header-row tableCount'><div class='header-content'><span contenteditable>Count</span><a class='sort-button' style='cursor: pointer'>⇅</a></div></th>" +
            "<th class='table-header-row tableFrequency'><div class='header-content'><span contenteditable>Frequency</span><a class='sort-button' style='cursor: pointer'>⇅</a></div></th>" +
            "<th>Color</th>" +
            "</tr>"
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


                    if(this.commonService.debugMode) {
                        console.log('color: ', this.SelectedColorNodesByVariable);
                        console.log('color2: ',  this.visuals.microbeTrace.commonService.session.style.nodeColorsTableKeys);                    
                    }
 
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
                "<td class='tableCount'>" + aggregates[value] + "</td>" +
                "<td class='tableFrequency'>" + (aggregates[value] / vnodes.length).toLocaleString() + "</td>" +
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

        this.updateCountFreqTable('node-color');
        $('#nodeColorTableSettings').on('mouseleave', () => $('#nodeColorTableSettings').delay(500).css('display', 'none'));
        
        $(tableId).on('click', '.sort-button', function() {
            let table = $(this).parents('table').eq(0);
            let rows = table.find('tr:gt(0)').toArray().sort(comparer($(this).parent().parent().index()));
            this.asc = !this.asc; // using property 'asc' on DOM object instead of jQuery data function
            if (!this.asc){rows = rows.reverse();}
            for (let i = 0; i < rows.length; i++){table.append(rows[i]);}
        });
        
        function comparer(index) {
            return function(a, b) {
                let valA = getCellValue(a, index), valB = getCellValue(b, index);
                return !isNaN(Number(valA)) && !isNaN(Number(valB)) ? Number(valA) - Number(valB) : valA.toString().localeCompare(valB);
            }
        }
        
        function getCellValue(row, index){ return $(row).children('td').eq(index).text() }

    }

    /**
     * Toggles the setting menu for node-color or link-color table. This menu allow users to show/hide counts and/or frequencies
     * @param tableName 'node-color' or 'link-color'
     */
    toggleColorTableSettings(tableName: string) {
        let settingsPane;
        if (tableName == 'node-color') {
            settingsPane = $('#nodeColorTableSettings')
        } else if (tableName == 'link-color') {
            settingsPane = $('#linkColorTableSettings')
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
     * Updates the appropriate widget value and then updates the node-color or link-color table
     * @param table 'node-color' or 'link-color'
     * @param column 'tableCouts' or 'tableFreq' 
     */
    toggleColorTableColumns(table: string, column: string) {
        if (table == 'node-color' && column == 'tableCounts') {
            this.widgets['node-color-table-counts'] = !this.widgets['node-color-table-counts'];
        } else if (table == 'node-color' && column == 'tableFreq') {
            this.widgets['node-color-table-frequencies'] = !this.widgets['node-color-table-frequencies'];
        } else if (table == 'link-color' && column == 'tableCounts') {
            this.widgets['link-color-table-counts'] = !this.widgets['link-color-table-counts']
        } else if (table == 'link-color' && column == 'tableFreq') {
            this.widgets['link-color-table-frequencies'] = !this.widgets['link-color-table-frequencies']
        } else {
            return;
        }

        this.updateCountFreqTable(table);
    }

    /**
     * Updates the node-color-table or link-color-table based on value of widgets; it doesn't recalculate anything; just shows/hide columns
     * @param tableName 'node-color' or 'link-color'
     */
    updateCountFreqTable(tableName) {
        let tableReferenceName, showCount, showFreq;
        if (tableName == 'node-color') {
            tableReferenceName = '#global-settings-node-color-table';
            showCount = this.widgets['node-color-table-counts'];
            showFreq = this.widgets['node-color-table-frequencies'];
        } else if (tableName == 'link-color') {
            tableReferenceName = '#global-settings-link-color-table';
            showCount = this.widgets['link-color-table-counts'];
            showFreq = this.widgets['link-color-table-frequencies'];
        }
        let countColumn = $(tableReferenceName + ' .tableCount');
        let freqColumn = $(tableReferenceName + ' .tableFrequency');
        (showCount) ? countColumn.slideDown() : countColumn.slideUp();
        (showFreq) ? freqColumn.slideDown() : freqColumn.slideUp();
    }

    /**
     * Updated link-threshold widget and this.threshold variable. Sets mst-computed widget to false.
     * Updates clusters and cluster visibility, link visibility, and node visibility. Finallys updates
     * visualizations and stastistics
     */
    onLinkThresholdChanged() {
        //debugger;

        this.commonService.GlobalSettingsModel.SelectedLinkThresholdVariable = this.SelectedLinkThresholdVariable;
        this.commonService.session.style.widgets["link-threshold"] = parseFloat(this.SelectedLinkThresholdVariable);
        this.threshold = this.SelectedLinkThresholdVariable;

        let minClust = $("#cluster-minimum-size").val();
        

        // Unset MST construction since links might have been changed
        this.commonService.session.style.widgets["mst-computed"] = false;

        if (minClust !== "1" ){
            if(this.commonService.debugMode) {
                console.log('reseting min clust'); 
            }
            $("#cluster-minimum-size").val("1");
            $("#cluster-minimum-size").trigger("change");
            $("#cluster-minimum-size").val(minClust);
            $("#cluster-minimum-size").trigger("change");
        } 

        this.commonService.setLinkVisibility(false, false);
        this.commonService.tagClusters().then(() => {
            this.visuals.microbeTrace.commonService.setClusterVisibility(true);
            // $(document).trigger("cluster-visibility");

            //To catch links that should be filtered out based on cluster size:
            this.visuals.microbeTrace.commonService.setLinkVisibility(true);
            this.visuals.microbeTrace.commonService.setNodeVisibility(true);

            //Because the network isn't robust to the order in which these operations
            //take place, we just do them all silently and then react as though we did
            //them each after all of them are already done.

            ["cluster", "link", "node"].forEach(thing => $(document).trigger(thing + "-visibility"));


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



        this.SelectedDistanceMetricVariable = this.commonService.session.style.widgets['default-distance-metric'];
        this.commonService.GlobalSettingsModel.SelectedNodeColorVariable = this.SelectedNodeColorVariable;
        this.commonService.session.style.widgets['node-color'] = this.SelectedNodeColorVariable;
        this.commonService.session.style.widgets['link-color'] = this.SelectedLinkColorVariable;
        this.commonService.session.style.widgets['link-threshold'] = this.SelectedLinkThresholdVariable;
        this.commonService.session.style.widgets['node-color-variable'] = this.SelectedColorNodesByVariable;
        //this.commonService.session.style.widgets['node-color-variable'] = this.SelectedNodeColorVariable;

        // TODO: Removed, see if this is still necessary
        // this.commonService.session.style.widgets['link-tooltip-variable'] = this.SelectedColorLinksByVariable;


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

    /**
     * this.visuals.microbeTrace.publishUpdateVisualization()
     * 
     * XXXXX may need to be updated or trimmed (switch statement has no functionality) XXXXX
     */
    updatedVisualization() {

        this.visuals.microbeTrace.publishUpdateVisualization();

        // console.log('active tab ind: ', this.homepageTabs,this.homepageTabs[this.activeTabIndex]);

        if (!this.homepageTabs[this.activeTabIndex]) return;

        switch (this.homepageTabs[this.activeTabIndex].label) {
            case "2D Network":

                // this.goldenLayout.componentInstances[this.activeTabIndex].render(false);
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



    /**
     * XXXXX no current use or functionality XXXXX 
     */
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


    /**
     * XXXXX move XXXXX
     */
    ngAfterViewInit() {

        // let factory = this.cfr.resolveComponentFactory(FilesComponent);
        // this.cmpRef = this.targets.first.createComponent(factory);
        setTimeout(() => {
            this._goldenLayoutHostComponent.initialise();
            
            // headerHeight (tab) is updated so that goldenLayout knows what the css is set to. 
            window.context.commonService.visuals.microbeTrace._goldenLayoutHostComponent._goldenLayout.layoutConfig.dimensions.headerHeight = 36;
            this.addComponent('Files');

          if (this.auspiceUrlVal) {
            if(this.commonService.debugMode) {
                console.log("Trying to open URL");
            }
            this.DisplayUrlDialog("Open");
            this.continueClicked();
            this.displayUrlDialog = false;
            //this.displayMTDialog = true;
            // this.DisplayMTDialog("Open");
            /**
            this.commonService.openAuspiceUrl(this.auspiceUrlVal)
            .then( (out) => {
            if (out['meta'] && out['tree']) {
              const auspiceFile = { contents: out, name: this.getAuspiceName(this.auspiceUrlVal), extension: 'json'};
              this.commonService.session.files.push(auspiceFile);
              this.prepareFilesLists(auspiceFile);
              console.log(out);
            //   console.log(this.homepageTabs[0].componentRef);
                // this.goldenLayout.componentInstances[0].addToTable(auspiceFile);
              this.homepageTabs[0].componentRef.addToTable(auspiceFile);
              this.homepageTabs[0].isActive = true;
            } else {
              console.log("This isn't a valid Auspice JSON file");
            }
            });
            */
          }
          if(this.commonService.debugMode) {
            console.log('golden comp ref: ', this.homepageTabs[0].componentRef.instance);
        }
        this.subscription = this.homepageTabs[0].componentRef.instance.LoadDefaultVisualizationEvent.subscribe((v) => {
            if(this.commonService.debugMode) {
                console.log('loading default1: ', v);
            }
            this.loadDefaultVisualization(v);
            this.publishLoadNewData();
            this.getGlobalSettingsData();
        });

        this._goldenLayoutHostComponent.TabRemovedEvent.subscribe((v) => {
            // this.loadSettings();
            this.removeComponent(v);
        });

        this._goldenLayoutHostComponent.TabChangedEvent.subscribe((v) => {
            if (v === "Files" || v === "Epi Curve" || v === "Alignment View" || v === "Table" || v === "Crosstab" || v === "Aggregate" || v === "Heatmap" || v === "Gantt Chart") {
                this.GlobalSettingsLinkColorDialogSettings.setVisibility(false);
                this.GlobalSettingsNodeColorDialogSettings.setVisibility(false);
            } else {
                if (this.SelectedColorNodesByVariable == 'None') {
                    this.GlobalSettingsNodeColorDialogSettings.setVisibility(false);
                } else {
                    this.GlobalSettingsNodeColorDialogSettings.setVisibility(false);
                    this.GlobalSettingsNodeColorDialogSettings.setVisibility(true);  
                }
                if (this.SelectedColorLinksByVariable == 'None' || v === "Phylogenetic Tree" || v == 'Bubble') {
                    this.GlobalSettingsLinkColorDialogSettings.setVisibility(false);
                } else {
                    this.GlobalSettingsLinkColorDialogSettings.setVisibility(true);
                }
            }
            if (this.GlobalSettingsNodeColorDialogSettings.isVisible && this.SelectedNodeColorTableTypesVariable == 'Hide') {
                this.SelectedNodeColorTableTypesVariable = 'Show';
            } else if (!this.GlobalSettingsNodeColorDialogSettings.isVisible && this.SelectedNodeColorTableTypesVariable == 'Show') {
                this.SelectedNodeColorTableTypesVariable = 'Hide';
            }
            if (this.GlobalSettingsLinkColorDialogSettings.isVisible && this.SelectedLinkColorTableTypesVariable == 'Hide') {
                this.SelectedLinkColorTableTypesVariable = 'Show';
            } else if (!this.GlobalSettingsLinkColorDialogSettings.isVisible && this.SelectedLinkColorTableTypesVariable == 'Show') {
                this.SelectedLinkColorTableTypesVariable = 'Hide';
            }
        });
        }, 0);
        

        // this.setActiveTabProperties();

        // this.cdref.detectChanges();
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

    private _removeGlView(view : string) {
        console.log(`Removing ${view}`);
        this._goldenLayoutHostComponent.removeComponent(view);
        this.removeComponent(view);
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

    officialInstance () {
        const prodVal = RegExp(/https:\/\/microbetrace.cdc.gov\/MicrobeTrace/);
        const devVal = RegExp(/https:\/\/cdcgov.github.io\/MicrobeTrace/);
        const localVal = RegExp(/localhost/);
        if (prodVal.test(this.currentUrl) || devVal.test(this.currentUrl) || localVal.test(this.currentUrl)) {
            return true;
        } else {
            const el: HTMLElement | null = this.getElementById("overlay");
            if (el) el.style.top = "84px";
            return false;
        }
    }

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
            // abp.notify.warn("Your role(s) do not allow access to a ledger.  See your administrator to grant you roles to access a ledger.");
        }

        const endLoadNoData = () => {
            this.hideSpinner();
            // abp.notify.warn("No data was loaded");
        }
    }

    public loadDefaultVisualization(e: string) {

        e = e.replace("_", " ");

        if (e === "2d network"){
            e = "2D Network";
        }

        this.resetLayout();

        setTimeout(() => {
            if (this.homepageTabs.findIndex(x => x.label == e) === -1) {
                this.Viewclick(e);
            }
        }, 500);
        
    }

    public resetLayout() {
    
        this.homepageTabs.forEach( tab => {
            if (tab.label !== "Files") {
                console.group('removing: ', tab.label);
                this._removeGlView(tab.label);
            }
        });

        this.activeTabIndex = 0;
    }

    public getfileContent(fileList: FileList) {

        this.GlobalSettingsDialogSettings.setVisibility(false);
        this.GlobalSettingsLinkColorDialogSettings.setVisibility(false);
        this.GlobalSettingsNodeColorDialogSettings.setVisibility(false);

        if(this.commonService.debugMode) {
            console.log('process files::');
        }
        // TODO: unccomment back when updated
        // this.srv.removeTab(0,1);
        //remove last homepage tab
        // this.homepageTabs.splice(this.homepageTabs.length - 1, 1);
        // console.log('homepagetabs: ', this.homepageTabs);
        // this.goldenLayout.componentInstances[0].processFiles(fileList)

        this.homepageTabs.map(x => {
            if (x.label === "Files") {
                if (x.componentRef != null) {
                    this.subscription.unsubscribe();
                    this.subscription = this.homepageTabs[0].componentRef.instance.LoadDefaultVisualizationEvent.subscribe((v) => {
                        if(this.commonService.debugMode) {
                            console.log('loading default2: ', v);
                        }
                        // this.loadSettings();
                        this.loadDefaultVisualization(v);
                        this.publishLoadNewData();
                    });
                    x.componentRef.instance.processFiles(fileList);

                    // ensure files table is populated after processing
                    setTimeout(() => {
                        x.componentRef.instance.populateTable();
                    }, 1000);
                }
            }
        });
    }

    public getSinglefileContent(file: File) {

        // this.goldenLayout.componentInstances[0].processFile(file);

        this.homepageTabs.map(x => {
            if (x.label === "Files") {
                if (x.componentRef != null) {
                    x.componentRef.processFile(file);
                    //TODO does this need instance?
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

    clusterSaveClick() {

    }

    DisplayStashDialog(saveStash: string) {
        switch (saveStash) {
            case "Save": {

                if (this.selectedSaveFileType == 'style') {
                    let data = JSON.stringify(this.commonService.session.style);
                    let blob = new Blob([data], { type: "application/json;charset=utf-8" });
                    saveAs(blob, this.saveFileName+'.style')
                    return;
                }

                let zip = new JSZip();

                const lightTabs: HomePageTabItem[] = this.homepageTabs.map(x => {
                    return {
                        label: x.label,
                        tabTitle: x.tabTitle,
                        isActive: x.isActive,
                        componentRef: undefined,
                        templateRef: undefined
                    }
                });

                if(this.saveByCluster){
                    let clusterNodeList = [];
                    let clusterLinkList = [];
                    let singletonNodeList = [];
                    let dyadNodeList = [];
                    let dyadEdgeList = [];
                    let nodes = this.commonService.session.data.nodes;
                    let links = this.commonService.session.data.links;

                    this.commonService.session.data.clusters.forEach(cluster => {

                    let clusterNodes = nodes.filter(node => node.cluster === cluster.id);

                    let clusterLinks = links.filter(link => link.cluster === cluster.id);

                    // We have a singleton - all singletons go into one file
                    if(clusterNodes.length == 1){
                        singletonNodeList.push(clusterNodes[0]);
                    // We have a dyad - all dyads go into one file
                    } else if (clusterNodes.length == 2) {
                        // Add both nodes
                        dyadNodeList.push(clusterNodes[0]);
                        dyadNodeList.push(clusterNodes[1]);
                        // Add the single link
                        dyadEdgeList.push(clusterLinks[0]);
                    // We have a cluster
                    } else {
                        // Add array object of nodes with matching cluster
                        clusterNodeList.push(clusterNodes);

                        // Add array object of links with matching cluster
                        clusterLinkList.push(clusterLinks);
                    }

                    });

                    let singletonFolder = null;
                    let dyadFolder = null;

                    for (var i = 0; i < this.commonService.session.data.clusters.length; i++) {

                    let currentCluster = this.commonService.session.data.clusters[i];

                    let cluster = clusterNodeList.filter(nodeList => nodeList[0].cluster == currentCluster.id);

                    // Check if cluster is in clusterNodesList
                    if(cluster.length > 0){

                        // Create cluster folder
                        var clusterFolder = zip.folder("cluster-" + cluster[0][0].cluster);
                    
                        // If node and edge lists exists, add them to the current folder
                        let clusterNode = clusterNodeList.filter(NodeList => NodeList[0].cluster == currentCluster.id);

                        if(clusterNode) {

                        let blob = new Blob([Papa.unparse(cluster[0])], {type: 'text/csv;charset=utf-8'});
                        clusterFolder.file( "nodeList_cluster_" + cluster[0][0].cluster + ".csv", blob);

                        // Now get link list of cluster
                        let clusterLink = clusterLinkList.filter(LinkList => LinkList[0].cluster == currentCluster.id);

                        if(clusterLink) {
                            let blob = new Blob([Papa.unparse(clusterLink[0])], {type: 'text/csv;charset=utf-8'});
                            clusterFolder.file("edgeList_cluster_" + cluster[0][0].cluster + ".csv", blob);
                        }
                        }
                    }
                    }

                    if(dyadNodeList.length > 0){
                        dyadFolder = zip.folder("dyads");
                        // Add all dyads in one shot
                        let nodesBlob = new Blob([Papa.unparse(dyadNodeList)], {type: 'text/csv;charset=utf-8'});
                        dyadFolder.file("nodeList_cluster.csv", nodesBlob);
                        let edgesBlob = new Blob([Papa.unparse(dyadEdgeList)], {type: 'text/csv;charset=utf-8'});
                        dyadFolder.file("edgeList_cluster.csv", edgesBlob);
                      }
                
                      if (singletonNodeList.length > 0) {
                        singletonFolder = zip.folder("singletons");
                        // Add all singletons in one shot
                        let blob = new Blob([Papa.unparse(singletonNodeList)], {type: 'text/csv;charset=utf-8'});
                        singletonFolder.file("nodeList_cluster.csv", blob);
                      }
                        
                      let that = this;
                      // generate zip repsetnation in memory
                      zip.generateAsync({type:"blob"}).then(function(content) {
                          // see FileSaver.js
                          saveAs(content, `${that.saveFileName}.zip`);
                      });
                } else {
                    const stash: StashObjects = {
                        session: this.visuals.microbeTrace.commonService.session,
                        tabs: lightTabs
                    };

                    let that = this;

                    if ($("#save-file-compress").is(":checked")) {
                        let zip = new JSZip();
                        zip.file(`${that.saveFileName}.microbetrace`, new Blob([JSON.stringify(stash)], { type: "application/json;charset=utf-8" }));
                        zip.generateAsync({
                            type: "blob",
                            compression: "DEFLATE",
                            compressionOptions: {
                                level: 9
                            }
                        })
                        .then(content => saveAs(content, `${that.saveFileName}.zip`));
                    } else {
                        const blob = new Blob([JSON.stringify(stash)], { type: "application/json;charset=utf-8" });
                        saveAs(blob, `${this.saveFileName}.microbetrace`);
                    }
    
                   
                }


                
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
      console.log(split);
      const nameParts = split.length>1 ? split[1].split('/') : split[0].split('/');
      return nameParts.join('_');
      return 'auspice_import_via_url';
    }

    DisplayUrlDialog(saveUrl: string) {
      switch (saveUrl) {
        case 'Open': {
          const auspiceUrl = this.auspiceUrlVal;
          this.commonService.openAuspiceUrl(auspiceUrl)
          .then( (out) => {
            if (out['meta'] && out['tree']) {
              console.log(this);
              this.homepageTabs[0].componentRef.instance.removeAllFiles();
              this.visuals.microbeTrace.commonService.clearData();
              const auspiceFile = { contents: out, name: this.getAuspiceName(auspiceUrl), extension: 'json'};
              this.visuals.microbeTrace.commonService.session.files.push(auspiceFile);
              this.homepageTabs[0].componentRef.instance.addToTable(auspiceFile);
            //   console.log(this.homepageTabs[0].componentRef);
                // this.goldenLayout.componentInstances[0].addToTable(auspiceFile);
              //this.homepageTabs[0].componentRef.addToTable(auspiceFile);
              this.homepageTabs[0].isActive = true;
              console.log("Trying to launch");
              this.homepageTabs[0].componentRef.instance.launchClick();
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
      if (this.displayUrlDialog){
        console.log(this.displayUrlDialog);
        this.continueClicked();
      }
    }

    DisplayMTDialog(saveUrl: string) {
      switch (saveUrl) {
        case 'Open': {
          const auspiceUrl = this.auspiceUrlVal;
          break;
        }
        case 'Cancel': {
            break;
        }
      }
      this.displayMTDialog = !this.displayMTDialog;
    }

    ResetTabs() {
        const home = this.homepageTabs.find(x => x.label === "Files");
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
                
                // If files tab exists, go to it
                if(this.homepageTabs.length > 1 && this.homepageTabs.findIndex(x => x.label === "Files") !== -1) {
                    this._goldenLayoutHostComponent.focusComponent("Files");
                } else {
                    this.addComponent('Files');
                }

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

    Viewclick(viewName: string) {

        if(this.commonService.debugMode) {
             console.log('viewClick: ', viewName);
            console.log(this.commonService.session.style.widgets['link-threshold']);
            console.log('homepage tabs1: ' , this.homepageTabs);
        }
       

        if (viewName == "2d network") {
            viewName = "2D Network";
        }

        let tabNdx = this.homepageTabs.findIndex(x => x.label == viewName);

        /*/
         * Don't allow duplicate tabs to get added.
        /*/
        if (tabNdx == -1) {

            this.activeTabIndex = this.activeTabIndex + 1;
            this.addComponent(viewName);

        }
        else {
            
            const container = this._goldenLayoutHostComponent.focusComponent(viewName);

            const instance = this._goldenLayoutHostComponent.getComponentRef(container).instance as any;

             //Load global settings changes if changed in another view
            if (instance.loadSettings) {        
                instance.loadSettings();
                if (this.metric === 'snps'){
                    this.commonService.session.style.widgets['default-distance-metric'] = 'snps';
                    this.commonService.session.style.widgets['link-threshold'] = parseInt(this.threshold);
                    this.onLinkThresholdChanged();
                }
            }

        }

    }

    DisplayGlobalSettingsDialog(activeTab = "Styling") {

        console.log(this.visuals.microbeTrace.commonService.session.style.widgets['default-distance-metric']);
        this.visuals.microbeTrace.getGlobalSettingsData();

        this.visuals.microbeTrace.GlobalSettingsDialogSettings.setVisibility(true);
        this.cachedGlobalSettingsVisibility = this.GlobalSettingsDialogSettings.isVisible;

        this.visuals.microbeTrace.commonService.updateThresholdHistogram(this.linkThresholdSparkline.nativeElement);

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

        // this.activeTabIndex = tabNdx;
        if(this.commonService.debugMode) {
            console.log('tab switched is: ', tabNdx);
            console.log('global l: ', this.GlobalSettingsLinkColorDialogSettings);
            console.log('global n: ', this.GlobalSettingsNodeColorDialogSettings);
       }
       

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
                // this.GlobalSettingsDialogSettings.setVisibility(false);
                // this.GlobalSettingsLinkColorDialogSettings.setVisibility(false);
                // this.GlobalSettingsNodeColorDialogSettings.setVisibility(false);

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
            case "Table": {

                this.showSettings = false;
                this.showExport = true;
                this.showCenter = false;
                this.showPinAllNodes = false;
                this.showRefresh = false;
                this.showButtonGroup = true;
                this.showSorting = true;

                // this.GlobalSettingsDialogSettings.setVisibility(false);
                this.GlobalSettingsLinkColorDialogSettings.setVisibility(false);
                this.GlobalSettingsNodeColorDialogSettings.setVisibility(false);

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

                // this.GlobalSettingsDialogSettings.setVisibility(false);
                //this.GlobalSettingsLinkColorDialogSettings.setVisibility(false);
                this.GlobalSettingsNodeColorDialogSettings.setVisibility(false);

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

                // this.GlobalSettingsDialogSettings.setVisibility(false);
                this.GlobalSettingsLinkColorDialogSettings.setVisibility(false);
                this.GlobalSettingsNodeColorDialogSettings.setVisibility(false);

                break;
            }
        }


        if (!this.homepageTabs[tabNdx].componentRef) {
            setTimeout(() => {

                tabNdx = this.homepageTabs.findIndex(x => x.label == activeComponentName);
                if (this.homepageTabs[tabNdx].componentRef.instance.DisplayGlobalSettingsDialogEvent) {
                    this.homepageTabs[tabNdx].componentRef.instance.DisplayGlobalSettingsDialogEvent.subscribe((v) => { this.DisplayGlobalSettingsDialog(v) });
                }

            });
        } else {
          
            if (this.homepageTabs[tabNdx].componentRef.instance.DisplayGlobalSettingsDialogEvent) {
                this.homepageTabs[tabNdx].componentRef.instance.DisplayGlobalSettingsDialogEvent.subscribe((v) => { this.DisplayGlobalSettingsDialog(v) });
            }
        }


        this.previousTab = activeComponentName;
    }

    openPinAllNodes(tabNdx: any): void {
        this.homepageTabs[tabNdx].componentRef.instance.openPinAllNodes();
    }


    addTab(tabLabel: any, tabTitle: any, tabPosition: any, componentRef: any, activate: boolean = true): void {

        /*/
         * Ensure that all tabs are not selected before we set the next new tab.
         * This will ensure that the newly created component appears on the currently selected tab, 
         * which will be the newly added tab array element.
        /*/
        this.homepageTabs.map(x => {

            x.isActive = false;
        });

        console.log

        // this.tabView.tabs.map(x => {

        //     x.selected = false;
        // });

        this.activeTabIndex = tabPosition;
        this.homepageTabs.splice(tabPosition, 0, {
            label: tabLabel,
            templateRef: null,
            tabTitle: tabTitle,
            isActive: activate,
            componentRef: componentRef
            // componentRef: this.goldenLayout.componentInstances[this.goldenLayout.componentInstances.length - 1]
        });

    }

    clearTable(tableId) {
        let linkColorTable = $(tableId).empty();
    }

    onReloadScreen() {
        this.commonService.session.style.widgets = this.commonService.defaultWidgets();
        this.loadSettings();
    }

    loadSettings() {
        this.getGlobalSettingsData();

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
            // componentRef.instance.onLoadNewData ?
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
                tab.componentRef.instance.onFilterDataChange) {
                tab.componentRef.instance.onFilterDataChange();
            }
        })
    }

    ngOnDestroy(): void {
        this.NewSession();
    }

    /**
     * Updates default-distance-metric widget and this.SelectedLinkThresholdVariable (7 for snps, 0.015 for TN93).
     * Calls onLinkThresholdChanged to updated links
     */
  onDistanceMetricChanged = () => {
    if (this.SelectedDistanceMetricVariable.toLowerCase() === 'snps') {
      $('#default-distance-threshold, #link-threshold')
        .attr('step', 1)
        .val(7)
        .trigger('change');
      this.visuals.microbeTrace.commonService.session.style.widgets['default-distance-metric'] = 'snps';
      this.SelectedLinkThresholdVariable = '7';
      this.onLinkThresholdChanged();
    } else {
      $('#default-distance-threshold, #link-threshold')
        .attr('step', 0.001)
        .val(0.015)
        .trigger('change');
      this.visuals.microbeTrace.commonService.session.style.widgets['default-distance-metric'] = 'tn93';
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
