import { ChangeDetectionStrategy, Component, OnInit, Injector, ViewChild, ViewChildren, AfterViewInit, ComponentRef, ViewContainerRef, QueryList, ElementRef, Output, EventEmitter, ChangeDetectorRef, OnDestroy, ViewEncapsulation, Renderer2 } from '@angular/core';
import { CommonService } from './contactTraceCommonServices/common.service';
import * as d3 from 'd3';
import { AppComponentBase } from '@shared/common/app-component-base';
import { SelectItem, TreeNode, ConfirmationService } from 'primeng/api';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { AppSessionService } from '@shared/common/session/app-session.service';
import { DialogSettings } from './helperClasses/dialogSettings';
import { saveAs } from 'file-saver';
import { StashObjects, HomePageTabItem } from './helperClasses/interfaces';
import { debounceTime, distinctUntilChanged, Subject, takeUntil } from 'rxjs';
import moment from 'moment';
import { Tabulator } from 'tabulator-tables';
import { Subscription } from 'rxjs';
import { GoldenLayoutHostComponent } from './golden-layout-host.component';
import * as Papa from 'papaparse';
import JSZip from 'jszip';
import html2canvas from 'html2canvas';
import { CommonStoreService } from './contactTraceCommonServices/common-store.services';
import { ExportService, ExportOptions } from './contactTraceCommonServices/export.service';
import * as XLSX from 'xlsx';
import { buildDate, commitHash } from "src/environments/version";


@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'contact-trace',
    encapsulation: ViewEncapsulation.None,
    templateUrl: './microbe-trace-next-plugin.component.html',
    styleUrls: ['./microbe-trace-next-plugin.component.less'],
    providers: [ConfirmationService],
    standalone: false
})

export class MicrobeTraceNextHomeComponent extends AppComponentBase implements AfterViewInit, OnInit, OnDestroy {


    // recommit original code
    @ViewChild('stashes') stashes: ElementRef;

    @ViewChild('goldenLayoutHost') _goldenLayoutHostComponent: GoldenLayoutHostComponent;

    @ViewChild('linkThresholdSparkline') linkThresholdSparkline: ElementRef;

    @ViewChild('visualwrapper', { static: false }) visualWrapperRef!: ElementRef<HTMLDivElement>;
    @ViewChild('nodeColorTable') nodeColorTable!: ElementRef;
    @ViewChild('linkColorTable') linkColorTable!: ElementRef;

    public metric: string = "tn93";
    public ambiguity: string = "Average";
    public launchView: string = "2D Network";
    public threshold: string = "0.015";

    commitHash: string = commitHash;
    widgets: object; 
    elem: any;
    showSettings: boolean = false;
    showExport: boolean = false;
    showCenter: boolean = false;
    showPinAllNodes: boolean = false;
    showRefresh: boolean = false;
    showButtonGroup: boolean = false;
    showSorting: boolean = false;

    display_eula_modal: boolean = false;
    userConfirmedNN: boolean = false;

    showExportDashboardMenu: boolean = false;
    ExportDashboardFilename: string = '';
    ExportDashboardScale: number = 1;
    ExportDashboardResolution: { width: number, height:number, summary:string} = {width: 0, height: 0, summary: ''};

    private thresholdDebouncer: Subject<number> = new Subject<number>();

    showExportTablesMenu: boolean = false;
    ExportTablesFilename: string = '';
    ExportTablesFileType: string = 'png';
    ExportTablesScale: number = 1;
    exportTables = { 'node-color': false, 'link-color': false, 'node-symbol': false, 'polygon-color': false };
    
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
    displayloadingInformationModal: boolean = false;

    // messages to display in loading modal
    messages: string[] = [];

    version: string = '2.1';
    auspiceUrlVal: string|null = '';

    private thresholdSubscription: Subscription;


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
    private networkRenderedSubscription: Subscription;
    private loadingMessageUpdatedSubscription: Subscription;
    private destroy$ = new Subject<void>();


    // posts: BlockchainProofHashDto[] = new Array<BlockchainProofHashDto>();
    // Blockchaindata: BlockchainProofHashDto = new BlockchainProofHashDto();
    date: Date;
    // Inputdownloadblock: DownloadFilteredBlockDto = new DownloadFilteredBlockDto();
    Filepath: SafeResourceUrl;

    //BlockChainLedgerNodeList: any[] = [];
    //BlockChainLedgerEdgeList: any[] = [];



    FieldList: SelectItem[] = [];
    ToolTipFieldList: SelectItem[] = [];

    PruneWityTypes: any = [
        { label: 'None', value: 'None' },
        { label: 'Nearest Neighbor', value: 'Nearest Neighbor' }
    ];
    SelectedPruneWithTypesVariable: string = 'None';
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
    timelineSpeed: number = 200;


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

    private bpaaSPayloadWrappers: BpaaSPayloadWrapper[] = [];

    private networkRendered: boolean = false;

    @Output() DisplayGlobalSettingsDialogEvent = new EventEmitter();

    // @ViewChild(TabView) tabView: TabView;
    @ViewChild('dataSet') dataSet: Selection;
    @ViewChildren('placeholder', { read: ViewContainerRef }) targets: QueryList<ViewContainerRef>
    @ViewChild('ledgerloader') spinnerElement: ElementRef;
    @ViewChild('ledgerloadDiv') spinnerDivElement: ElementRef;
    @ViewChild('globalSettingsTab') globalSettingsTab: any;


    // @ViewChild('pinbutton') pinBtn: ElementRef<HTMLElement>;
    @ViewChild('pinbutton') pinBtn: ElementRef<HTMLElement>;

    public HideThisForNow: boolean = false;

    files: any[] = [];

    homepageTabs: HomePageTabItem[] = [];
    currentUrl: string;

    constructor(
        injector: Injector,
        public commonService: CommonService,
        private confirmationService: ConfirmationService,
        public domSanitizer: DomSanitizer,
        private cdref: ChangeDetectorRef,
        private el: ElementRef, 
        private store: CommonStoreService,
        private exportService: ExportService
    ) {


        super(injector);

        this.widgets = this.commonService.session.style.widgets

        this.appSession = injector.get(AppSessionService);

        // Add this line to expose the service for Cypress tests
        (window as any).commonService = this.commonService;

        this.activeTabIndex = 0;

        this.dataSetView = [];
        this.dataSetView.push({ label: 'Nodes', value: 'Node' });
        this.dataSetView.push({ label: 'Links', value: 'Link' });
        this.dataSetView.push({ label: 'Clusters', value: 'Cluster' });

        this.dataSetViewSelected = "Node";

        this.currentUrl = window.location.href;
        
    }

    getElementById(id: string): HTMLElement | null {
        const element = this.el.nativeElement.querySelector(`#${id}`);
        return element;
    }

    ngOnInit() {

        // Check if user has accepted the license:
        this.check_eula_acceptance();

        this.auspiceUrlVal = this.commonService.getURL();
        if(this.commonService.debugMode) {
            console.log(this.auspiceUrlVal);
        }
        this.getGlobalSettingsData();

        console.log('common serivceeeee: ', (window as any).commonService );
         // Subscribe to export requests
        this.exportService.exportRequested$.subscribe((info) => {
            this.performExport(info.element, info.exportNodeTable, info.exportLinkTable);
        });

        this.exportService.exportSVG$.subscribe((info) => {
            this.performExportSVG(info.element, info.mainSVGString, info.exportNodeTable, info.exportLinkTable);
        });

         // Add debounce subscription
        this.thresholdDebouncer.pipe(
            debounceTime(1000), // Wait 300ms after last change
            distinctUntilChanged()
        ).subscribe(threshold => {
            this.executeThresholdChange(threshold);
        });

        this.store.networkUpdated$
        .pipe(takeUntil(this.destroy$)) // Add takeUntil for proper cleanup
        .subscribe((isUpdated) => {
            console.log('--- networkUpdated$ subscription triggered:', isUpdated);
            if (isUpdated) {
                // Case 1: Initial UI settings load after first network update
                if (!this.store.settingsLoadedValue) {
                    console.log('--- Loading UI settings as settingsLoadedValue is false ---');
                    this.loadUISettings();
                    // After loading UI settings, check if table needs immediate regeneration
                    if (this.GlobalSettingsLinkColorDialogSettings.isVisible && this.SelectedColorLinksByVariable !== 'None') {
                        console.log('--- Regenerating Link Color Table after initial UI load ---');
                        this.generateNodeLinkTable('#link-color-table');
                    }
                }
                // Case 2: Subsequent network updates (e.g., from threshold change)
                // Regenerate table only if UI settings are already loaded AND table should be visible/relevant
                else if (this.store.settingsLoadedValue && this.GlobalSettingsLinkColorDialogSettings.isVisible && this.SelectedColorLinksByVariable !== 'None') {
                    console.log('--- Regenerating Link Color Table due to network update (settings already loaded) ---');
                    this.generateNodeLinkTable('#link-color-table');
                }
            }
        });

        this.store.clusterUpdate$.subscribe(() => {
            if (this.SelectedColorNodesByVariable == "cluster") {
                this.generateNodeColorTable("#node-color-table")
            }
        })

         // Subscribe to network rendered
         this.networkRenderedSubscription = this.store.networkRendered$
      .pipe(takeUntil(this.destroy$))
      .subscribe(rendered => {
        console.log('DEBUG: networkRenderedSubscription fired. rendered =', rendered);
        console.log('DEBUG: session.network.isFullyLoaded?', this.commonService.session.network.isFullyLoaded);

        if (rendered) {
          this.displayloadingInformationModal = false;
          this.messages = [];
          console.log('DEBUG: Calling onLinkColorTableChanged from networkRenderedSubscription...');
          console.log('DEBUG: #link-color-table rowcount BEFORE = ', $('#link-color-table').find('tr').length);

          // Optionally call or not call your method:
          // this.onLinkColorTableChanged();

          this.networkRendered = true;
          // Also see if forcing a detect changes right here changes the outcome:
          console.log('DEBUG: inrender sub => about to detect changes manually...');

          this.cdref.detectChanges();

          console.log('DEBUG: #link-color-table rowcount AFTER  = ', $('#link-color-table').find('tr').length);

        } else if (!rendered && this.commonService.demoNetworkRendered &&
                   this.commonService.session.network.isFullyLoaded) {
          this.displayloadingInformationModal = true;
          this.showMessage('Rendering Network...');
          this.networkRendered = false;
        }
      });

        // Subscribe to network rendered
        this.loadingMessageUpdatedSubscription = this.store.loadingMessageUpdated$
        .pipe(takeUntil(this.destroy$))
        .subscribe(message => {
            console.log('--- message updated: ', message);
            if(message) {
                this.displayloadingInformationModal = true;
                this.showMessage(message);
            } 
        });

        // Subscribe to threshold changes from the service
        this.thresholdSubscription = this.store.linkThreshold$.subscribe(
            (newThreshold: number) => {
                // Only update local state if changed
                if (this.SelectedLinkThresholdVariable !== newThreshold) {
                    this.onLinkThresholdChanged(newThreshold);
                }
            }
        );

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

        // Subscribe to metric changes
        this.store.metricChanged$.subscribe((metric: string) => {
            this.metric = metric;
            this.SelectedDistanceMetricVariable = metric;
            this.onDistanceMetricChanged();
        });

        // Subscribe to table cleared event
        this.store.tableCleared$.subscribe((tableId: string) => {
            this.clearTable(tableId); // Existing method to handle updates
        });

        // Subscribe to statistics changed event
        this.store.statisticsChanged$.subscribe((statisticsType?: string) => {
            this.SelectedStatisticsTypesVariable = statisticsType;
            this.onShowStatisticsChanged();
        });

        this.SelectedPruneWithTypesVariable = this.commonService.GlobalSettingsModel.SelectedPruneWithTypesVariable;

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

        //this.commonService.updateThresholdHistogram();

        if(this.commonService.debugMode) {
            console.log("global settings: ", this.commonService.GlobalSettingsModel.SelectedLinkThresholdVariable);
            console.log("SelectedLinkThresholdVariable: ", this.SelectedLinkThresholdVariable);
        }
        

         // Update distance metric in cashe
         let cachedView = "";


        this.commonService.localStorageService.getItem('default-view', (err, result) => {
            cachedView = result;
        });

        setTimeout(() => {
            $('#top-toolbar').fadeTo("slow", 1);
            // TODO:: uncommentback when done Subscribe for files subscription
            // this.homepageTabs[0].componentRef = this.goldenLayout.componentInstances[0];
        }, 1000);
        setTimeout(() => {
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

            console.log('thresholldddddd', this.commonService.session.style.widgets['link-threshold']);

        }, 3000);
        setTimeout(() => {
            $('#visualwrapper').fadeTo("slow", 1);
            $('#add-data-container').fadeTo("slow", 1);
            $('#onload-container').fadeTo("slow", 1);
            $('#tool-btn-container').fadeTo("slow", 1);

        }, 5000);
           
    }

     /**
   * Check local storage for EULA acceptance.
   * If no acceptance found, display the license modal.
   */
  private check_eula_acceptance(): void {
    // Example of using the localStorageService if needed:
    this.commonService.localStorageService.getItem('microbetrace_eula_accepted', (err, result) => {
      if (!result) {
        this.display_eula_modal = true;
      }
    });
  }

  /**
   * User accepted the EULA, store acceptance and close the modal.
   */
  public on_eula_accept(): void {
    this.commonService.localStorageService.setItem('microbetrace_eula_accepted', 'true');

    this.display_eula_modal = false;
  }

  /**
   * User rejected the EULA, immediately route to https://www.cdc.gov/
   */
  public on_eula_reject(): void {
    window.location.href = 'https://www.cdc.gov/';
  }

    showMessage(msg: string) {

        this.messages = [...this.messages, msg];        
        setTimeout(() => {
            console.log('DEBUG: inshowmessage => about to detect changes manually...');

            this.cdref.detectChanges();
          }, 0);
      }

    
    // New method to handle the actual threshold change logic
    private executeThresholdChange(newThreshold: number): void {
        if(this.commonService.debugMode) {
            console.log('loading settingss1: ', this.commonService.session.style.widgets["link-threshold"]);
        }
        
        // Execute the actual threshold change
        this.onLinkThresholdChanged(newThreshold);
    }

    addComponent( component: string ) {

        console.log('--- addComponent called');

        this.commonService.session.tabLoaded = false;

        // const componentType = this._selectedRegisteredComponentTypeName;
        const goldenLayoutComponent = this._goldenLayoutHostComponent.goldenLayout.newComponent(component);

        const componentRef = this._goldenLayoutHostComponent.getComponentRef(goldenLayoutComponent.container);
        
        this.addTab(component, component + this.activeTabIndex, this.activeTabIndex, componentRef);
        
        console.log('--- addComponent Tab added');

        // TODO:: GOLDEN LAYOUT USES ASYNCHONOUS Loading of Components, settimout waits for it
        setTimeout(() => {
            console.log('--- GOLDEN LAYOUT COMPONENT LOADED');
            this.commonService.session.tabLoaded = true;
            this.commonService.session.network.isFullyLoaded = true;
            this.setActiveTabProperties();

            // logpolygon color sh
            if(!this.store.settingsLoadedValue) {
                console.log('--- GOLDEN LAYOUT COMPONENT filter settings');

                this.loadFilterSettings();

                console.log('--- polygon color show33: ', this.commonService.session.style.widgets['polygons-color-show']);

            }
        });

    }

    /**
     * Performs the export of the visualization, including tables.
     */
    private async performExport(elementsForExport: HTMLDivElement[] | HTMLTableElement[] = [this.visualWrapperRef.nativeElement], exportNodeTable: boolean = false, exportLinkTable: boolean = false): Promise<void> {
        if (!elementsForExport[0] && !exportNodeTable && !exportLinkTable) {
            console.error('Visual wrapper container not found');
            return;
        }
    
        try {
            // Retrieve export options from the service
            const options: ExportOptions = this.exportService.getExportOptions();
            let canvas: HTMLCanvasElement;
            let settings = {
                scale: options.scale || 1,
                useCORS: true, // Enable CORS if images are loaded from external sources,
                allowTaint: true,
                onclone: (clonedDoc) => {
                    // Remove all transparency symbols
                    const clonedTransparencySymbols = clonedDoc.querySelectorAll('a.transparency-symbol');
                    clonedTransparencySymbols.forEach(symbol => {
                        symbol.parentNode?.removeChild(symbol);
                    })
                    // Replace color input elements with colored spans
                    const clonedInputs = clonedDoc.querySelectorAll('input[type="color"]');
                    clonedInputs.forEach(input => {
                        const color = input.getAttribute('value') || '#ffffff';
                        const opacity = input.style.opacity || '1'
                        const span = clonedDoc.createElement('span');
                        span.style.display = 'inline-block';
                        span.style.width = '42px';
                        span.style.height = '17px';
                        span.style.opacity = opacity;
                        span.style.backgroundColor = color;
                        span.style.margin = '4px';
                        span.style.border = '1px solid #777777'; // Optional: Add border for visibility
                        input.parentNode?.replaceChild(span, input);
                    });
    
                    // Optionally, handle other elements that display hex codes
                    // For example, if you have spans or divs showing hex values:
                    /*
                    const colorTextElements = clonedDoc.querySelectorAll('.color-text');
                    colorTextElements.forEach(elem => {
                        const color = elem.textContent;
                        elem.style.backgroundColor = color;
                        elem.textContent = '';
                    });
                    */
                }
            }
            // if pos == 0, exporting just tables and not a view
            let pos = elementsForExport[0] instanceof HTMLDivElement ? 1 : 0;
            if (exportLinkTable && this.commonService.session.style.widgets['link-color-variable'] !== 'None' && this.SelectedLinkColorTableTypesVariable == 'Show') {  
                elementsForExport.splice(pos, 0, this.linkColorTable.nativeElement);
            }
            if (exportNodeTable && this.commonService.session.style.widgets['node-color-variable'] !== 'None' && this.SelectedNodeColorTableTypesVariable == 'Show') {
                elementsForExport.splice(pos, 0,this.nodeColorTable.nativeElement);
            }

            Promise.all(
                elementsForExport.map((input) => { 
                    // As of July 2025, a change in Chrome (and other browsers) slowed down this export dramatically (2+ mins for single image), a temp change is to
                    // update html2canvas.js (line 5626) file in node_modules as described here: https://github.com/niklasvh/html2canvas/pull/3252/commits/37b75f50d2550acf7d90630acdc29d346282d0a4;
                    // this is a temp fix, if unresolved (by html2canvas) consider switching to snapdom
                    return html2canvas(input, settings);
                })
            ).then((canvasArray) => {
                canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');

                // Set the width and height of the combined canvas
                let width = canvasArray[0].width;
                let height = canvasArray[0].height;
                let offsets = pos == 0 ? [[5,5]] : [[0,0]];
                let previousColWidth, currentColWidth = 0;
                for (let i = 1; i < canvasArray.length; i++) {
                    if (i == 1) {
                        width += canvasArray[i].width+5;
                        height = Math.max(height, canvasArray[i].height+5);
                        offsets.push([canvasArray[0].width+offsets[0][0], 5]);
                        previousColWidth = canvasArray[0].width+offsets[0][0];
                        currentColWidth = canvasArray[1].width;
                    } else {
                        //if need to add a new column
                        if (canvasArray[i].height+5 > height) {
                            width += canvasArray[i].width+5;
                            height = canvasArray[i].height +5;
                            offsets.push([offsets[i-1][0] + currentColWidth, 5]);
                            
                            previousColWidth = currentColWidth;
                            currentColWidth = canvasArray[i].width+5;
                        }
                        // need to add a new column
                        else if (offsets[i-1][1]+canvasArray[i-1].height + canvasArray[i].height + 5 > height) {
                            width += canvasArray[i].width+5;
                            offsets.push([offsets[i-1][0] + canvasArray[i-1].width, 5]);
                            
                            previousColWidth = currentColWidth;
                            currentColWidth = canvasArray[i].width+5;
                        } else { // don't need to add a new column
                            offsets.push([offsets[i-1][0], offsets[i-1][1]+canvasArray[i-1].height+5]);
                            if (canvasArray[i].width+5 > currentColWidth) {
                                width += (canvasArray[i].width - currentColWidth +5);
                                currentColWidth = canvasArray[i].width+5;
                            }
                        }
                    }
                }
                canvas.width = width+10;
                canvas.height = height+10;

                context.fillStyle = '#ffffff';
                context.fillRect(0, 0, canvas.width, canvas.height);

                context.strokeStyle = '#000000'

                // Draw the canvases onto the combined canvas
                for (let i = 0; i < canvasArray.length; i++) {
                    context.drawImage(canvasArray[i], offsets[i][0], offsets[i][1]);
                    if (i > 0 || pos==0) {
                        // draw a rect around each additional drawImage element
                        context.strokeRect(offsets[i][0], offsets[i][1], canvasArray[i].width, canvasArray[i].height);
                    }
                }
    
            // Convert canvas to desired image format
            let imgData: string;
            const filetype = options.filetype.toLowerCase();
            const filename = options.filename || 'network_export';
    
            if (filetype === 'png') {
                imgData = canvas.toDataURL('image/png');
            } else if (filetype === 'jpeg' || filetype === 'jpg') {
                imgData = canvas.toDataURL('image/jpeg', options.quality || 0.92);
            } else if (filetype === 'webp') {
                imgData = canvas.toDataURL('image/webp', options.quality || 0.92);
            } else {
                console.error('Unsupported file type:', filetype);
                return;
            }
    
            // Trigger the download
            const link = document.createElement('a');
            link.href = imgData;
            link.download = `${filename}.${filetype}`;
            document.body.appendChild(link); // Append to body to make it clickable in Firefox
            link.click();
            document.body.removeChild(link); // Remove from body after clicking
    
            console.log('Export completed successfully.');
        })
        } catch (error) {
            console.error('Error during export:', error);
        }
    }

    private async performExportSVG(elementsForExport: HTMLTableElement[], mainSVGString: string, exportNodeTable: boolean = false, exportLinkTable: boolean = false): Promise<void> {
        console.log('Exporting SVG');
        if (mainSVGString == '') {
            mainSVGString = '<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"></svg>'
        }

        if (exportLinkTable && this.SelectedLinkColorTableTypesVariable == 'Show') {
            elementsForExport.unshift(this.linkColorTable.nativeElement);
        }
        if (exportNodeTable && this.SelectedNodeColorTableTypesVariable == 'Show') {
            elementsForExport.unshift(this.nodeColorTable.nativeElement);
        }

        const options: ExportOptions = this.exportService.getExportOptions();
        
        const parser = new DOMParser();
        const doc = parser.parseFromString(mainSVGString, 'image/svg+xml');
        const svg1 = doc.documentElement;
        
        // i'll need some way to check when to add new col to export; but for now do this;            
        let width = parseFloat(svg1.getAttribute('width'))+5 || 5;
        let height = parseFloat(svg1.getAttribute('height'))+5 || 5; 
        let tableSVGStrings = '';
        let currentOffsetX = width;
        let currentOffsetY = 5;
        let currentColWidth = 0;

        elementsForExport.forEach((element, index) => {
            let output = this.exportService.exportTableAsSVG(element, true);
            
            // exact logic from exporting a png
            if (index == 0) {
                width += output.width;
                height = Math.max(height, output.height);
                currentColWidth = output.width;
            } else {
                // if need to add a new column
                if (output.height > height) {
                    width += output.width+5;
                    height = output.height +5;
                    currentOffsetX += currentColWidth;
                    currentOffsetY = 5;
                    currentColWidth = output.width;
                } else if (currentOffsetY+output.height + 5 > height) { // need to add a new column
                    width += output.width+5;
                    currentOffsetX += currentColWidth;
                    currentOffsetY = 5;
                    currentColWidth = output.width;
                } else { // don't need to add a new column
                    if (output.width+5 > currentColWidth) {
                        width += (output.width - currentColWidth +5);
                        currentColWidth = output.width+5;
                    }
                }
            }
            let updatedSVGString = output.svg.replace('<g>', `<g transform="translate(${currentOffsetX}, ${currentOffsetY})" fill="none">`);
            tableSVGStrings += updatedSVGString;

            currentOffsetY += output.height+5;
        });

        svg1.style.width = `${width + 5}px`
        svg1.style.height = `${height + 5 }px`
        svg1.setAttribute('width', `${width+5}`);
        svg1.setAttribute('height', `${height+5}`);

        const rect = doc.createElementNS('http://www.w3.org/2000/svg', 'rect')
        rect.setAttribute('x', '0')
        rect.setAttribute('y', '0')
        rect.setAttribute('width', `${width+5}`);
        rect.setAttribute('height', `${height+5}`);
        rect.setAttribute('fill', 'white');
        svg1.insertBefore(rect, svg1.firstChild);

        let mainSVG = String(svg1.outerHTML);
        let combinedSvgString: string;
        if (mainSVG.endsWith('/>')) {
            combinedSvgString = mainSVG.replace('/>', '>' + tableSVGStrings + '</svg>')
        } else {
            combinedSvgString = mainSVG.replace('</svg>', tableSVGStrings + '</svg>')
        }

        let blob = new Blob([combinedSvgString], { type: 'image/svg+xml;charset=utf-8' });
        
        saveAs(blob, `${options.filename}.svg`);
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
        const nodes = this.commonService.session.data.nodes;
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
          
          const dataSet = new Set();
          for(let i = 0; i < n; i++){
            const node = nodes[i];
            if (node[field]) {
  
                const fieldData = node[field].toString(); // Convert the data to string
                // matches anything that is not a digit, letter, whitespace or one of following char < > & and replaces with corresponding HTML entity number
                const encodedField = fieldData.replace(/[\u00A0-\u9999<>&]/g, function(i) {
                  return '&#'+i.charCodeAt(0)+';';
                });
                dataSet.add(`${encodedField}`);
            }
          }
          const dataArray = Array.from(dataSet).sort() as string[];
          //#298
          if (this.commonService.session.style.widgets["search-whole-word"])  v = '\\b' + v + '\\b';
          let vre: RegExp;
          if (this.commonService.session.style.widgets["search-case-sensitive"])  vre = new RegExp(v);
          else  vre = new RegExp(v, 'i');
  
          dataArray.forEach(element => {
            if ((element as any).match(vre)) {
                const $li = $('<li/>')
                    .html(element as string)
                    .attr('data-value', element as string);
                $('#search-results').append($li).show();
              }
          });

        const that = this;
          
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

              const node = nodes[i];

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
                const node = nodes[i];

                if (!node[field]) {
                  node.selected = false;
                }
                if (typeof node[field] == "string") {
                  node.selected = vre.test(node[field]);
                  firstSelected = node.selected;
                }
                if (typeof node[field] == "number") {
                  node.selected = (node[field] + "" == val);
                  firstSelected = node.selected;
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

        this.store.setFP_removeFiles(true);
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

    private _lastLinkThreshold: number = this.commonService.session.style.widgets["link-threshold"];


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
     public updateThreshold(ev: any): void {
        const newThreshold = ev.target?.value ?? ev;
        this.threshold = newThreshold;
        
        if(this.commonService.debugMode) {
            console.log('threshold: ', this.threshold);
        }
        
        // Update UI immediately
        this.SelectedLinkThresholdVariable = newThreshold;
        this.commonService.GlobalSettingsModel.SelectedLinkThresholdVariable = this.SelectedLinkThresholdVariable;
        
        // Emit the new threshold value to the debouncer for actual threshold change
        this.thresholdDebouncer.next(Number(newThreshold));
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
        this.commonService.session.style.widgets['background-color'] = this.SelectedBackgroundColorVariable;

        if ($('#cy') != undefined) {
            $('#cy').css('background-color', this.SelectedBackgroundColorVariable);
        }
    }


    private _lastClusterMinimum: number = this.commonService.session.style.widgets["cluster-minimum-size"];


    /**
     * Updates GlobalSetingModel variable and cluster-minimum-size widget. Removes and adds clusters when needed
     */
    onMinimumClusterSizeChanged(silent: boolean = false) {

        console.log('--- onMinimumClusterSizeChanged called: silent: ', silent);
        this.commonService.GlobalSettingsModel.SelectedClusterMinimumSizeVariable = this.SelectedClusterMinimumSizeVariable;

        let val = parseInt(this.SelectedClusterMinimumSizeVariable);
        this.commonService.session.style.widgets["cluster-minimum-size"] = val;

        if(this.commonService.session.data.nodes.length === 0) {
            return;
        }

         // Check if the cluster minimum value really changed
        if (val === this._lastClusterMinimum && this.store.settingsLoadedValue) {
            console.log("Cluster minimum unchanged; no update needed.");
            return;
        }

        if(!silent) {
            let previousNumberOfVisibleClusters = this.commonService.session.data.clusters.filter(cluster => cluster.visible).length;
            this.commonService.setClusterVisibility(true);
            // if number of visible clusters changed, then update network
            if (previousNumberOfVisibleClusters != this.commonService.session.data.clusters.filter(cluster => cluster.visible).length) {
                this.commonService.setNodeVisibility(true);
                this.commonService.setLinkVisibility(true);
                this.commonService.updateStatistics();
                this.store.setNetworkUpdated(true);
            }
        }

        this._lastClusterMinimum = val;
    }

    private _lastLinkSortValue: string = this.commonService.session.style.widgets["link-sort-variable"];


    /**
     * Updates GlobalSettingsModel variable and link-sort-variable widget. Updates link threshold histogram and then updates network
     */
    onLinkSortChanged(silent: boolean = false) {

        if(this.commonService.session.data.nodes.length === 0) {
            return;
        }

        // Only update if the sort variable is different
        if (this.SelectedLinkSortVariable === this._lastLinkSortValue && this.store.settingsLoadedValue) {
            console.log("Link sort variable unchanged; skipping update.");
            return;
        }

        
        // Otherwise, update the stored value and proceed
        this._lastLinkSortValue = this.SelectedLinkSortVariable;


        console.log('onLinkSortChanged called');
        this.commonService.GlobalSettingsModel.SelectedLinkSortVariable = this.SelectedLinkSortVariable;

        this.commonService.session.style.widgets["link-sort-variable"] = this.SelectedLinkSortVariable;
        // this.commonService.updateThresholdHistogram();

       // 1) Parse the threshold value to a number
       const linkThresholdValue = parseFloat(String(this.commonService.session.style.widgets["link-threshold"]));

    // 2) Now you can safely call toFixed on a numeric value
    const decimals = (this.commonService.session.style.widgets['default-distance-metric'].toLowerCase() === "tn93") ? 3 : 0;
    const fixedThresholdValue = linkThresholdValue.toFixed(decimals);

    // 3) If you want to store it back as a number (not a string), parseFloat again:
    this.SelectedLinkThresholdVariable = parseFloat(fixedThresholdValue);

        // If not loading all settings at once, update link threshold
        if(!silent) {
            this.onLinkThresholdChanged();
        }
        // this.commonService._debouncedUpdateNetworkVisuals();
    
    }

    /**
     * Reads the file and applies the style to MicrobeTrace session.style
     * 
     */
    public onApplyStyle( file: any ){
        $('.custom-file-label').text(this.SelectedApplyStyleVariable.substring(12))
        const reader = new FileReader();
        reader.onload = e => {
            this.commonService.applyStyle(JSON.parse((e as any).target.result)); 
            this.applyStyleFileSettings();
        }
        reader.readAsText(file.target.files[0]);

    }

    applyStyleFileSettings() {
        this.widgets = this.commonService.session.style.widgets;

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
            console.log('link colorTable - applystylefile: ', $('#link-color-table'));

            this.onColorLinksByChanged();
        }

        if (this.SelectedBackgroundColorVariable != this.widgets['background-color']){
            this.SelectedBackgroundColorVariable = this.widgets['background-color'];
            this.onBackgroundChanged();
        }

        if (this.widgets['node-color-variable'] && this.widgets['node-color-variable'] !== 'None') {
            // Show table dialog
            this.SelectedNodeColorTableTypesVariable = 'Show';
            this.GlobalSettingsNodeColorDialogSettings.setVisibility(true);
        }
        // Show Link Color Table if link-color-variable != 'None'
        if (this.widgets['link-color-variable'] && this.widgets['link-color-variable'] !== 'None') {
            this.SelectedLinkColorTableTypesVariable = 'Show';
            this.GlobalSettingsLinkColorDialogSettings.setVisibility(true);
        }
    }

    onEpsilonValueChange() {
        this.commonService.session.style.widgets["mst-computed"] =false;
        this.onPruneWithTypesChanged(this.SelectedPruneWithTypesVariable); 
    }

    openNNConfirmation() {
        this.confirmationService.confirm({
            message: `It appears that you have links from two different sources. The Nearest Neighbor algorithm is only recommended when working with genetic links.
             Are you sure that you want to proceed?`,
            closable: false,
            closeOnEscape: false,
            icon: 'pi pi-exclamation-triangle',
            rejectButtonProps: {
                label: 'Cancel',
                severity: 'secondary',
                outlined: true,
            },
            acceptButtonProps: {
                label: 'Confirm',
            },
            accept: () => {
                this.userConfirmedNN = true;
                this.onPruneWithTypesChanged(this.SelectedPruneWithTypesVariable);
            },
            reject: () => {
                this.SelectedPruneWithTypesVariable = 'None';
            },
        }, );
    }

    onPruneWithTypesChanged(newValue: string) {
        if (this.userConfirmedNN == false && this.SelectedPruneWithTypesVariable == "Nearest Neighbor") {
            if (this.commonService.session.data.links.filter(l => l.origin.length > 1 && Array.isArray(l.origin)).length>0) {
                this.openNNConfirmation();
                return;
            }
        }

        console.log('onPruneWithTypesChanged: ', newValue);

        this.SelectedPruneWithTypesVariable = newValue;
        this.commonService.GlobalSettingsModel.SelectedPruneWithTypesVariable = this.SelectedPruneWithTypesVariable;

        if (this.SelectedPruneWithTypesVariable == "None") {
            $('#filtering-epsilon-row').slideUp();
            this.commonService.session.style.widgets["link-show-nn"] = false;
            this.commonService.setLinkVisibility(true);
            this.commonService.updateNetworkVisuals(true);
            this.store.setLinkThreshold(this.SelectedLinkThresholdVariable-0.000001);
            this.commonService.onStatisticsChanged("Show");
        }
        else {
            this.SelectedEpsilonValue = Math.pow(10, this.widgets['filtering-epsilon']).toPrecision(3);
            this.commonService.session.style.widgets["filtering-epsilon"] = this.widgets['filtering-epsilon'];
            this.commonService.session.style.widgets["link-show-nn"] = true;
            $('#filtering-epsilon-row').slideDown();
            
            

            this.commonService.computeMST().then(() => {
                console.log('computeMST for nearest neighbor');

                console.log('Link (MZ745515-MZ712879) after MST:', 
                this.commonService.session.data.links.filter(link => 
                    (link.source === "MZ745515" && link.target === "MZ712879") ||
                    (link.source === "MZ712879" && link.target === "MZ745515")
                ));
                //console log link that source is MZ798055 and target is MZ375596
                console.log('link after computeMST: ', this.commonService.session.data.links.filter(link => link.source === "MZ798055" && link.target === "MZ375596"));
                this.commonService.setLinkVisibility(true);
                this.commonService.updateNetworkVisuals(true);
                this.store.setLinkThreshold(this.SelectedLinkThresholdVariable + 0.000001);

                console.log('onlink compute mst')
                this.onLinkColorTableChanged();
                    // TODO:: David is this needed?
                if ('tableComp' in this.commonService.visuals) {
                    if (this.commonService.visuals.tableComp.dataSetViewSelected == 'Link') {
                        this.commonService.visuals.tableComp.openSelectDataSetScreen({value: 'Link'});
                    }
                }

                this.commonService.onStatisticsChanged("Show");
            });
                  
                    return;
            // TODO:: David Removed to fix NN issue
            // if(!this.commonService.session.style.widgets["mst-computed"]) {
            //     this.commonService.computeMST().then(() => {
            //         this.commonService.updateNetwork();
            //         this.updatedVisualization();

            //         if ('tableComp' in this.commonService.visuals) {
            //             if (this.commonService.visuals.tableComp.dataSetViewSelected == 'Link') {
            //                 this.commonService.visuals.tableComp.openSelectDataSetScreen({value: 'Link'});
            //             }
            //         }
            //     });
            //      this.commonService.session.style.widgets["mst-computed"] = true;
            //      console.log('updated compute:' , this.commonService.session.style.widgets["mst-computed"]);
            //      return;
            //    } else {

        }
    }

      // This is the method that actually toggles the link-color dialog & table
  onLinkColorTableChanged(silent: boolean = false) {
    console.log('DEBUG: onLinkColorTableChanged fired. value=', this.SelectedLinkColorTableTypesVariable, 'silent=', silent);

    // Keep your GlobalSettingsModel in sync
    this.commonService.GlobalSettingsModel.SelectedLinkColorTableTypesVariable = this.SelectedLinkColorTableTypesVariable;

    if (this.SelectedLinkColorTableTypesVariable === 'Hide') {
      console.log('DEBUG: Hiding link color dialog and clearing table');
      this.GlobalSettingsLinkColorDialogSettings.setVisibility(false);
      $('#link-color-table').empty();
    } else {
      console.log('DEBUG: Showing link color dialog & building table');
      this.GlobalSettingsLinkColorDialogSettings.setVisibility(true);

      if (this.SelectedColorLinksByVariable === 'None') {
        console.log('DEBUG: Link color variable=NONE => empty table');
        $('#link-color-table').empty();
      } else {
        console.log('DEBUG: Generating link table. Table element =', this.linkColorTable?.nativeElement);
        this.generateNodeLinkTable('#link-color-table');
      }
      $('#link-color-table-row').slideDown();
    }

    // If OnPush, sometimes you might also need:
    if (!silent) {
      console.log('DEBUG: onLinkColorTableChanged => Marking for check');
      this.cdref.markForCheck();
      // or .detectChanges() if you want an immediate synchronous check
      // this.cdref.detectChanges();
    }
  }

    /**
     * Updates this.commonService.GlobalSettingsModel.SelectedNodeColorTableTypesVariable and 
     * then hides the node color table or calls onColorNodesByChanged
     */
    onNodeColorTableChanged(silent: boolean = false) {

        if(this.commonService.debugMode) {
            console.log('node color changed: ', this.SelectedNodeColorTableTypesVariable);
        }
        this.commonService.GlobalSettingsModel.SelectedNodeColorTableTypesVariable = this.SelectedNodeColorTableTypesVariable;

        if (this.SelectedNodeColorTableTypesVariable == "Hide") {
            this.GlobalSettingsNodeColorDialogSettings.setVisibility(false);
        }
        else {

            this.onColorNodesByChanged(silent);         
        }
    }

    onShowStatisticsChanged() {


        if (this.SelectedStatisticsTypesVariable === "Show"){
            this.commonService.updateStatistics();
            $("#network-statistics-wrapper").fadeIn();
        } else {
            this.commonService.updateStatistics();
            $("#network-statistics-wrapper").fadeOut();
        }
  

        this.commonService.GlobalSettingsModel.SelectedStatisticsTypesVariable = this.SelectedStatisticsTypesVariable;


        // if (this.homepageTabs[this.activeTabNdx].label == "2D Network") {
        //     this.homepageTabs[this.activeTabNdx].componentRef.enableSettings();
        // }

    }

    /**
     * Updates node-color widget and published node color to each view to update them. Only relevant when color nodes by = None
     */
    onNodeColorChanged(silent: boolean = false) {
        const variable = this.SelectedNodeColorVariable;
        this.commonService.session.style.widgets["node-color"] = variable;

        if(!silent) this.publishUpdateNodeColors();
        
    }

    /**
     * calls updateNodeColors() for each view
     */
    publishUpdateNodeColors() {
        this.homepageTabs.forEach(tab => {
            if (tab.componentRef &&
                tab.componentRef.instance.updateNodeColors) {
                console.log('publishUpdateNodeColors - updateNodeColors called');
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

    public onLinkColorChanged(silent: boolean = false) : void {
        if (this.SelectedLinkColorVariable != 'None') {
            this.ShowGlobalSettingsLinkColorTable = true;
        } else {
            this.ShowGlobalSettingsLinkColorTable = false;
        }

        this.commonService.session.style.widgets["link-color"] = this.SelectedLinkColorVariable;

        if(!silent) this.publishUpdateLinkColor();

    }


    onColorLinksByChanged(silent: boolean = false) {
        console.log('DEBUG: onColorLinksByChanged fired. variable =', this.SelectedColorLinksByVariable, 'silent=', silent);
        this.commonService.GlobalSettingsModel.SelectedColorLinksByVariable = this.SelectedColorLinksByVariable;
        this.commonService.session.style.widgets['link-color-variable'] = this.SelectedColorLinksByVariable;
    
        if (this.SelectedColorLinksByVariable !== 'None') {
          console.log('DEBUG: onColorLinksByChanged => user picked something, setting table to Show');
          this.SelectedLinkColorTableTypesVariable = 'Show';
        } else {
          console.log('DEBUG: onColorLinksByChanged => user picked None, setting table to Hide');
          this.SelectedLinkColorTableTypesVariable = 'Hide';
        }
    
        this.onLinkColorTableChanged(silent);
        if (!silent) {
          console.log('DEBUG: onColorLinksByChanged => publishing link-color updates to views');
          this.publishUpdateLinkColor();
        }
    
      }


    // The actual function that builds your color table
  generateNodeLinkTable(tableId: string, isEditable: boolean = true) {
    console.log('DEBUG: generateNodeLinkTable called. tableId=', tableId);
    console.log('DEBUG: table before .empty(): child rowcount=', $(tableId).find('tr').length);

    const linkColorTable = $(tableId).empty().append(
      '<tr>' +
      "<th class='p-1 table-header-row'><div class='header-content'><span contenteditable>Link " + 
        this.commonService.titleize(this.SelectedColorLinksByVariable) + 
      "</span><a class='sort-button' style='cursor: pointer'>⇅</a></div></th>" +
      `<th class='table-header-row tableCount' ${this.widgets['link-color-table-counts'] ? '' : 'style="display: none"'}><div class='header-content'><span contenteditable>Count</span><a class='sort-button' style='cursor: pointer'>⇅</a></div></th>` +
      `<th class='table-header-row tableFrequency' ${this.widgets['link-color-table-frequencies'] ? '' : 'style="display: none"'}><div class='header-content'><span contenteditable>Frequency</span><a class='sort-button' style='cursor: pointer'>⇅</a></div></th>` +
      '<th>Color</th>' +
      '</tr>'
    );

    // Debug checks
    console.log('DEBUG: after appending header, table rowcount=', $(tableId).find('tr').length);

    // If you suspect linkColorMap may be empty or never updated, log it:
    const aggregates = this.commonService.createLinkColorMap();
    console.log('DEBUG: createLinkColorMap =>', aggregates);

    const vlinks = this.commonService.getVisibleLinks();
    console.log('DEBUG: getVisibleLinks =>', vlinks?.length);

    const aggregateValues = Object.keys(aggregates);
    console.log('DEBUG: aggregateValues =>', aggregateValues);
        const disabled: string = isEditable ? '' : 'disabled';

        let duoColors = [];
        aggregateValues.forEach((value, i) => {
            let duoLinkRow = value == 'Duo-Link' && this.SelectedColorLinksByVariable == 'origin' ? true : false;
            if (aggregates[value] == 0) {
                return;
            }
                // console.log('link color aggregates value: ', aggregates[value]);
                // console.log('link color value: ', value);
                // console.log('link color map: ', this.commonService.temp.style.linkColorMap);
                // console.log('link color map value: ', this.commonService.temp.style.linkColorMap(value));
            

            // Grab color of link from session
            const color = this.commonService.temp.style.linkColorMap(value);
            if (this.SelectedColorLinksByVariable == 'origin') duoColors.push(color);

            // Create color input element with color value and assign id to retrieve new value on change
            const colorinput = duoLinkRow ? $(``) : $(`<input type="color" value="${color}" style="opacity:${this.commonService.temp.style.linkAlphaMap(value)}; border:none" ${disabled}>`)
                .on("change", e => {
                    // need to update the value in the dom which is used when exportings
                    e.currentTarget.attributes[1].value = e.target['value'];
                    e.currentTarget.style['opacity'] = this.commonService.temp.style.linkAlphaMap(value);

                    // Need to get value from id since "this" keyword is used by angular
                    // Update that value at the index in the color table
                    (this.commonService.session.style.linkColors as any).splice(i, 1,e.target['value']);

                    // Generate new color map with updated table
                    this.commonService.temp.style.linkColorMap = d3
                        .scaleOrdinal(this.commonService.session.style.linkColors)
                        .domain(aggregateValues);


                    // Call the updateLinkColor method in all tabs
                    this.publishUpdateLinkColor()

                    if (this.SelectedColorLinksByVariable == 'origin') {
                        this.updateDuoLinkCell(i, e.target['value'], e.currentTarget.style['opacity'])
                    }

                });

            const alphainput = duoLinkRow ? $(``) : $(`<a class="transparency-symbol">⇳</a>`)
                .on("click", e => {

                    $("#color-transparency-wrapper").css({
                        top: e.clientY + 129,
                        left: e.clientX,
                        display: "block"
                    });

                    $("#color-transparency")
                        .off("change")
                        .val(this.commonService.session.style.linkAlphas[i])
                        .one("change", (f) => {

                            // Update table with new alpha value
                            // Need to get value from id since "this" keyword is used by angular
                            this.commonService.session.style.linkAlphas.splice(i, 1, parseFloat((f.target['value'] as string)));
                            this.commonService.temp.style.linkAlphaMap = d3
                                .scaleOrdinal(this.commonService.session.style.linkAlphas)
                                .domain(aggregateValues);
                            $("#color-transparency-wrapper").fadeOut();

                            colorinput.trigger('change', this.commonService.temp.style.linkColorMap(value))
                            // this.goldenLayout.componentInstances[1].updateLinkColor();

                            if (this.SelectedColorLinksByVariable == 'origin') {
                                this.updateDuoLinkCell(i, this.commonService.temp.style.linkColorMap(value), f.target['value'] as string)
                            }
                        });
                });

            const row = $(
                "<tr>" +
                "<td data-value='" + value + "'>" +
                (this.commonService.session.style.linkValueNames[value] ? this.commonService.session.style.linkValueNames[value] : this.commonService.titleize("" + value)) +
                "</td>" +
                `<td class='tableCount' ${ this.widgets['link-color-table-counts'] ? "" : "style='display: none'"}>` + aggregates[value] + "</td>" +
                `<td class='tableFrequency' ${ this.widgets['link-color-table-frequencies'] ? "" : "style='display: none'"}>` + (aggregates[value] / vlinks.length).toLocaleString() + "</td>" +
                "</tr>"
            );


            let duoCell;
            if (duoLinkRow) {
                duoCell = $("<td></td>").append(
                $("<div></div>")
                    .css({  height: "25px", width: "50px", display: "flex", background: "#F0F0F0", padding: "4px"})
                    .append($("<div></div>").css({ border: "1px solid #777777", height: "17px", width: "42px", display: "inline-block" })
                        .append($("<span id='duoColor0'></span>").css({ height: "100%", width: "50%", background: duoColors[0], 'vertical-align': "top", display: "inline-block" }))
                        .append($("<span id='duoColor1'></span>").css({ height: "100%", width: "50%", background: duoColors[1], 'vertical-align': "top", display: "inline-block" })))
                );
            }
            const nonEditCell = `<td style="background-color:${color}"></td>`;

            if (duoLinkRow) {
                row.append(duoCell)
            } else if (isEditable) {
                row.append($("<td></td>").append(colorinput).append(alphainput));
            } else {
                row.append(nonEditCell);
            }

            console.log('---- link colorTable: ', i, linkColorTable);
            linkColorTable.append(row);

        });

        console.log('DEBUG: after building rows, rowcount=', $(tableId).find('tr').length);
    // At the end, we do a final check of the DOM:
    const finalCount = $(tableId).find('tr').length;
    console.log('DEBUG: final rowcount in table:', finalCount);

        if (isEditable) {
            linkColorTable
                .find("td")
                .on("dblclick", function () {
                    $(this).attr("contenteditable", "true").focus();
                })
                .on("focusout", () => {
                    const $this = $(this);
                    $this.attr("contenteditable", "false");

                    this.commonService.session.style.linkValueNames[$this.data("value")] = $this.text();

                });
        }

        let isAscending = true;  // add this line before the click event handler
        this.updateCountFreqTable('link-color')
        $('#linkColorTableSettings').on('mouseleave', () => $('#linkColorTableSettings').delay(500).css('display', 'none'));

        // console lof the rows in the table
        $(tableId).on('click', '.sort-button', function() {
            const table = $(this).parents('table').eq(0);
            let rows = table.find('tr:gt(0)').toArray().sort(comparer($(this).parent().parent().index()));
            isAscending = !isAscending;  // replace 'this.asc' with 'isAscending'
            if (!isAscending){rows = rows.reverse();}
            for (let i = 0; i < rows.length; i++){
                table.append(rows[i]);
            }
        });
        
        
        function comparer(index) {
            return function(a, b) {
                const valA = getCellValue(a, index), valB = getCellValue(b, index);
                return !isNaN(Number(valA)) && !isNaN(Number(valB)) ? Number(valA) - Number(valB) : valA.toString().localeCompare(valB);
            }
        }
        
        function getCellValue(row, index){ 
            const value = $(row).children('td').eq(index).text();
            return value;
        }        
     }

    updateDuoLinkCell(index:number, color:string, opacity: string) {
        if (index != 0 && index != 1) return;
        $(`#duoColor${index}`).css({background: color, opacity: opacity})
    }

    public onTimelineChanged(e) : void {
        this.SelectedTimelineVariable = e;
        if(this.commonService.debugMode) {
            console.log('timeline changed: ', e);
        }
        d3.select('#global-timeline svg').remove();
        clearInterval(this.commonService.session.timeline);
        let variable = e;  
        let loadingJsonFile = this.commonService.session.style.widgets["node-timeline-variable"] == variable;
        if (this.commonService.session.style.widgets["node-timeline-variable"] != 'None' && !loadingJsonFile) {
            // change timeline variable when end time not reaching target time - redraw netwrok to start fresh
            if (moment(this.commonService.session.state.timeEnd).toDate() < moment(this.commonService.session.state.timeTarget).toDate()) {
                this.commonService.session.state.timeEnd = this.commonService.session.state.timeTarget;
            this.commonService.setNodeVisibility(false);
            this.commonService.setLinkVisibility(false);
            this.commonService.updateStatistics();
            }
        }
        this.commonService.session.style.widgets["node-timeline-variable"] = variable;
        if (variable == "None") {
            $("#global-timeline-field").empty();
            this.commonService.session.style.widgets["timeline-date-field"] = 'None'  
            $("#global-timeline-wrapper").fadeOut();
            // $('#pinbutton').prop("disabled", false);
            // if(!this.commonService.session.network.timelinePinned) {
            // $('#pinbutton').trigger('click');
            // this.commonService.updatePinNodes(false);
            // }
            this.commonService.session.network.timelineNodes = [];
            this.commonService.setNodeVisibility(false);
            this.commonService.setLinkVisibility(false);
            this.commonService.updateStatistics();
            return;
        }

        // need to check and ensure bubble nodes are sorted by this variable, then rerender/recalculate bubbles position
        if ('bubble' in this.commonService.visuals) {
             this.commonService.visuals.bubble.sortData(variable);
        }

        console.log('timeline variable: ', variable);
        if(!this.commonService.temp.style.nodeColor) $("#node-color-variable").trigger("change");

        // let el: HTMLElement = this.pinBtn.nativeElement;
        // console.log('pin : ', el);
        // if (!$('#pinbutton').prop('disabled')){
        //     if (!loadingJsonFile) {
        //         this.commonService.session.network.timelinePinned = this.commonService.session.network.allPinned;
        //     if(!this.commonService.session.network.allPinned) {
        //         this.commonService.updatePinNodes(true);
        //         this.openPinAllNodes(1);
        //     }
        //     this.commonService.session.network.timelineNodes = this.commonService.getNetworkNodes();
        //     }
        //     $('#pinbutton').prop("disabled", true);
        // }

        if (!loadingJsonFile) {
            this.commonService.session.network.timelinePinned = this.commonService.session.network.allPinned;
        // if(!this.commonService.session.network.allPinned) {
        //     this.commonService.updatePinNodes(true);
        // }

        }
        let globalTimelineField =  (this.commonService.session.style.overwrite && variable == this.commonService.session.style.overwrite['globalTimelineFieldVariable'] ? this.commonService.session.style.overwrite['globalTimelineField'] : this.commonService.titleize(variable));
        const encodedGlobalTimelineField = globalTimelineField.replace(/[\u00A0-\u9999<>\&]/g, function(i) {
            return '&#'+i.charCodeAt(0)+';';
        });
        $("#global-timeline-field").html(encodedGlobalTimelineField);   
        const formatDateIntoYear = d3.timeFormat("%Y");
        const formatDateIntoMonthYear = d3.timeFormat("%b %y");
        const formatDateIntoMonth = d3.timeFormat("%b");
        const formatDateMonthYear = d3.timeFormat("%b %Y");
        const formatDateDateMonth = d3.timeFormat("%b %_d");

        // let timeDomainStart, timeDomainEnd;
        let field = variable;
        let times = [],
        vnodes = JSON.parse(JSON.stringify(this.commonService.session.data.nodes));
        vnodes.forEach(d => {
            let time = moment(d[field]); 
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
        const timeDomainStart = Math.min(...times);
        const timeDomainEnd = Math.max(...times);

        const days = moment(timeDomainEnd).diff(moment(timeDomainStart), 'days');
        const tickDateFormat = d => {
            if (days<184) return formatDateDateMonth(d);
            else if (days<367) return formatDateIntoMonth(d);
            else if (days<367*5) return formatDateIntoMonthYear(d);
            else return formatDateIntoYear(d);		
        }
        this.handleDateFormat = d => {
            if (days<367) return formatDateDateMonth(d);
            else return formatDateMonthYear(d);		
        }
        const startDate = timeDomainStart;
        const endDate = timeDomainEnd;
        const margin = {top:50, right:50, bottom:0, left:50},
            width = ($('#visualwrapper').width() * 4 / 5) - margin.left - margin.right,
            height = 200 - margin.top - margin.bottom;

        var svgTimeline = d3.select("#global-timeline")
            .append("svg")
            .attr("width", width + margin.left + margin.right)
            .attr("height", 120);  

            ////////// slider //////////
        this.currentTimelineValue = 0;
        this.currentTimelineTargetValue = width;
        this.commonService.session.state.timeStart = startDate;

        const that = this;
        const playButton = d3.select("#timeline-play-button");
        if (playButton.text() == "Pause") playButton.text("Play");
        this.xAttribute = d3.scaleTime()
            .domain([startDate, endDate])
            .range([0, this.currentTimelineTargetValue])
            .clamp(true)
            .nice();
        const slider = svgTimeline.append("g")
            .attr("class", "slider")
            .attr("transform", "translate(30," + height/2 + ")");

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
                    clearInterval(that.commonService.session.timeline);
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

        this.commonService.session.style.widgets["timeline-date-field"] = field;
        this.commonService.session.state.timeStart = startDate;
        this.commonService.session.state.timeTarget = this.xAttribute.invert(this.currentTimelineTargetValue);
        if (loadingJsonFile && moment(this.commonService.session.state.timeEnd).toDate() < moment(this.commonService.session.state.timeTarget).toDate()) {
            let t = moment(this.commonService.session.state.timeEnd).toDate();
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
                clearInterval(this.commonService.session.timeline);
            } else {
                this.playBtnText = "Pause";
                this.commonService.session.timeline = setInterval(this.step, this.timelineSpeed, this);
            }

    }

    update(h) {

        this.handle.attr("cx", this.xAttribute(h));
        this.label
        .attr("x", this.xAttribute(h))
        .text(this.handleDateFormat(h));
        this.commonService.session.state.timeEnd = h;
        this.commonService.setNodeVisibility(false);
        this.commonService.setLinkVisibility(false);
        this.commonService.updateStatistics();
  }

    step(that : any) { 
        that.update(that.xAttribute.invert(that.currentTimelineValue));
        if (that.currentTimelineValue > that.currentTimelineTargetValue) { 
            that.currentTimelineValue = 0;
        clearInterval(that.commonService.session.timeline);
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
        console.log('onLinkColorTableChanged - show');

        if (this.SelectedLinkColorTableTypesVariable !=' Show') {
            this.SelectedLinkColorTableTypesVariable='Show';
            this.onLinkColorTableChanged();
        }
    }

    hideLinkColorTable() {

        if (this.ShowGlobalSettingsLinkColorTable) {
            // This was just the initial load (or a code-based hide).
            return;
          }

        if (this.SelectedLinkColorTableTypesVariable != 'Hide') {
           this.SelectedLinkColorTableTypesVariable='Hide';
           this.onLinkColorTableChanged()
        }
    }

    /**
     * Called when SelectedColorNodesByVariable (keeps track of what variable to use to color nodes by) is changed.
     */
    onColorNodesByChanged(silent: boolean = false) {

        console.log('on color nodes by changed - visible: ', this.GlobalSettingsNodeColorDialogSettings.isVisible);

        this.commonService.GlobalSettingsModel.SelectedColorNodesByVariable = this.SelectedColorNodesByVariable;


        if (!this.GlobalSettingsNodeColorDialogSettings.isVisible) {

            console.log('on color nodes by changed - visible: ', this.SelectedColorNodesByVariable);
            // TODO::David you added  "&& this.checkActiveView('node')" below which makes it not dispaly in twoD network
            if (this.SelectedColorNodesByVariable != "None") {

                this.SelectedNodeColorTableTypesVariable = 'Show';
                this.GlobalSettingsNodeColorDialogSettings.setVisibility(true);
                this.cachedGlobalSettingsNodeColorVisibility = this.GlobalSettingsNodeColorDialogSettings.isVisible;
                const prevColorNodesByVariable = this.SelectedColorNodesByVariable;
                // this reset to false to trigger showing the node color table
                this.ShowGlobalSettingsNodeColorTable = false;
                // this detect changes leads to SelectedColorNodesByVariable being set to default value when loading MT files that have both 2D and map view
                this.cdref.detectChanges();
                if (prevColorNodesByVariable != this.SelectedColorNodesByVariable) this.SelectedColorNodesByVariable = prevColorNodesByVariable;
            }
        }

        this.commonService.session.style.widgets["node-color-variable"] = this.SelectedColorNodesByVariable;

        console.log('on color nodes by changed5 - visible: ', this.SelectedColorNodesByVariable);

        if(this.commonService.session.data.nodes.length === 0) {
            return;
        }

        console.log('on color nodes by changed6 - visible: ', this.ShowGlobalSettingsNodeColorTable);

        if (this.SelectedColorNodesByVariable !== "None") {

            this.ShowGlobalSettingsNodeColorTable = true;
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

            console.log('--- onColorNodesByChanged called');
            // if not loading all settings at once, update node colors
            if(!silent) {
                this.publishUpdateNodeColors();
            }

        // if color nodes by equals None, then hide node color table
        } else {

            $('#node-color-table').empty();
            $('#node-color-value-row').slideDown();
            $('#node-color-table-row').slideUp();
            this.SelectedNodeColorTableTypesVariable='Hide';
            this.onNodeColorTableChanged(silent);

            if(!silent) {
                this.publishUpdateNodeColors();
            }
            this.exportTables['node-color'] = false;
        }
    }

    generateNodeColorTable(tableId: string, isEditable: boolean = true) {
        const nodeColorTable = $(tableId)
        .empty()
        .append(
            "<tr>" +
            "<th class='p-1 table-header-row'><div class='header-content'><span contenteditable>Node " + this.commonService.titleize(this.SelectedColorNodesByVariable) + "</span><a class='sort-button' style='cursor: pointer'>⇅</a></div></th>" +
            `<th class='table-header-row tableCount' ${ this.widgets['node-color-table-counts'] ? "" : "style='display: none'"}><div class='header-content'><span contenteditable>Count</span><a class='sort-button' style='cursor: pointer'>⇅</a></div></th>` +
            `<th class='table-header-row tableFrequency' ${ this.widgets['node-color-table-frequencies'] ? "": "style='display: none'"}><div class='header-content'><span contenteditable>Frequency</span><a class='sort-button' style='cursor: pointer'>⇅</a></div></th>` +
            "<th>Color</th>" +
            "</tr>"
        );


        if (!this.commonService.session.style.nodeValueNames)
            this.commonService.session.style.nodeValueNames = {};


        const aggregates = this.commonService.createNodeColorMap();

        const vnodes = this.commonService.getVisibleNodes();

        const aggregateValues = Object.keys(aggregates);

        const disabled = isEditable ? '' : 'disabled';

        aggregateValues.forEach((value, i) => {
            if (aggregates[value] < 1) return;

            const color = this.commonService.temp.style.nodeColorMap(value);

            const colorinput = $(`<input type="color" value="${color}" style="opacity:${this.commonService.temp.style.nodeAlphaMap(value)}; border:none" ${disabled}>`)
                .on("change", e => {
                    // need to update the value in the dom which is used when exportings
                    e.currentTarget.attributes[1].value = e.target['value'];
                    e.currentTarget.style['opacity'] = this.commonService.temp.style.nodeAlphaMap(value);

                    if(this.commonService.debugMode) {
                        console.log('color: ', this.SelectedColorNodesByVariable);
                        console.log('color2: ',  this.commonService.session.style.nodeColorsTableKeys);                    
                    }
 
                    let key = this.commonService.session.style.nodeColorsTableKeys[this.SelectedColorNodesByVariable].findIndex( k => k === value);
                    this.commonService.session.style.nodeColorsTable[this.SelectedColorNodesByVariable].splice(key, 1, e);

                    // Update history with new color
                    this.commonService.session.style.nodeColorsTableHistory[this.commonService.session.style.nodeColorsTableKeys[this.SelectedColorNodesByVariable][key]] = e.target['value'];

                  

                    //if (this.commonService.session.style.widgets["node-timeline-variable"] == 'None') {
                          // Update table with new alpha value
                        // Need to get value from id since "this" keyword is used by angular
                        this.commonService.session.style.nodeColors.splice(i, 1, e.target['value']);
                        this.commonService.temp.style.nodeColorMap = d3
                            .scaleOrdinal(this.commonService.session.style.nodeColors)
                            .domain(aggregateValues);
                        // temp.style.nodeColorMap = d3
                            // .scaleOrdinal(session.style.nodeColorsTable[variable])
                            // .domain(session.style.nodeColorsTableKeys[variable]);
                        // } else {
                        //     let temKey = this.commonService.temp.style.nodeColorKeys.findIndex( k => k === value);
                        //     this.commonService.temp.style.nodeColor.splice(temKey, 1, e);
                        //     this.commonService.temp.style.nodeColorMap = d3
                        //         .scaleOrdinal(this.commonService.temp.style.nodeColor)
                        //         .domain(this.commonService.temp.style.nodeColorKeys);
                        // }

                    this.publishUpdateNodeColors();

                });

            const alphainput = $(`<a class="transparency-symbol">⇳</a>`).on("click", e => {

                $("#color-transparency-wrapper").css({
                    top: e.clientY + 129,
                    left: e.clientX,
                    display: "block"
                });

                $("#color-transparency")
                    .off("change")
                    .val(this.commonService.session.style.nodeAlphas[i])
                    .one("change", f => {

                        // Update table with new alpha value
                        // Need to get value from id since "this" keyword is used by angular
                        this.commonService.session.style.nodeAlphas.splice(i, 1, parseFloat(f.target['value'] as string));

                        this.commonService.temp.style.nodeAlphaMap = d3
                            .scaleOrdinal(this.commonService.session.style.nodeAlphas)
                            .domain(aggregateValues);

                        colorinput.trigger('change', this.commonService.temp.style.nodeColorMap(value))
                        $("#color-transparency-wrapper").fadeOut();

                    });
            });

            const nonEditCell = `<td style="background-color:${color}"></td>`;

            const cell = $("<td></td>")
                .append(colorinput)
                .append(alphainput);

            const row = $(
                "<tr>" +
                "<td data-value='" + value + "'>" +
                (this.commonService.session.style.nodeValueNames[value] ? this.commonService.session.style.nodeValueNames[value] : this.commonService.titleize("" + value)) +
                "</td>" +
                `<td class='tableCount' ${ this.widgets['node-color-table-counts'] ? "" : "style='display: none'"}>` + aggregates[value] + "</td>" +
                `<td class='tableFrequency' ${ this.widgets['node-color-table-frequencies'] ? "": "style='display: none'"}>` + (aggregates[value] / vnodes.length).toLocaleString() + "</td>" +
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

                    const $this = $(this);
                    $this.attr("contenteditable", "false");

                    //this.commonService.session.style.nodeValueNames[$this.data("value")] = $this.find("input").value;

                });
        }

        this.updateCountFreqTable('node-color');
        $('#nodeColorTableSettings').on('mouseleave', () => $('#nodeColorTableSettings').delay(500).css('display', 'none'));
        
        $(tableId).on('click', '.sort-button', function() {
            const table = $(this).parents('table').eq(0);
            let rows = table.find('tr:gt(0)').toArray().sort(comparer($(this).parent().parent().index()));
            this.asc = !this.asc; // using property 'asc' on DOM object instead of jQuery data function
            if (!this.asc){rows = rows.reverse();}
            for (let i = 0; i < rows.length; i++){table.append(rows[i]);}
        });
        
        function comparer(index) {
            return function(a, b) {
                const valA = getCellValue(a, index), valB = getCellValue(b, index);
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
        const countColumn = $(tableReferenceName + ' .tableCount');
        const freqColumn = $(tableReferenceName + ' .tableFrequency');
        (showCount) ? countColumn.slideDown() : countColumn.slideUp();
        (showFreq) ? freqColumn.slideDown() : freqColumn.slideUp();
    }

    /**
     * Updated link-threshold widget and this.threshold variable. Sets mst-computed widget to false.
     * Updates clusters and cluster visibility, link visibility, and node visibility. Finallys updates
     * visualizations and stastistics
     */
    onLinkThresholdChanged( newThreshold?: number, silent: boolean = false) {

        if(this.commonService.session.data.nodes.length === 0) {
            return;
        }

        if(newThreshold !== undefined) {
            // Update the style widget
            this.commonService.session.style.widgets["link-threshold"] = newThreshold;
        }

        // Determine the new threshold
        const parsedThreshold = newThreshold !== undefined 
        ? parseFloat(newThreshold.toString()) 
        : parseFloat(this.SelectedLinkThresholdVariable);

        // Only update if the threshold is different
        // if (parsedThreshold === this._lastLinkThreshold && this.commonService.session.network.isFullyLoaded) {
        // console.log("Threshold unchanged; skipping full network update.");
        // return;
        // }
        //debugger;

        // If a new threshold is provided, update the SelectedLinkThresholdVariable
        if (newThreshold) {
            this.SelectedLinkThresholdVariable = newThreshold;
        }

        this._lastLinkThreshold = this.SelectedLinkThresholdVariable;
        this.commonService.GlobalSettingsModel.SelectedLinkThresholdVariable = this.SelectedLinkThresholdVariable;
        this.commonService.session.style.widgets["link-threshold"] = parseFloat(this.SelectedLinkThresholdVariable);
        this.threshold = this.SelectedLinkThresholdVariable;

        // const minClust = $("#cluster-minimum-size").val();
        

        // Unset MST construction since links might have been changed
        this.commonService.session.style.widgets["mst-computed"] = false;

        console.log('min clust is: ', this.commonService.session.style.widgets["cluster-minimum-size"]);
        if (this.commonService.session.style.widgets["cluster-minimum-size"] !== 1 ){
            if(this.commonService.debugMode) {
                console.log('reseting min clust'); 
            }
            $("#cluster-minimum-size").val("1");
            $("#cluster-minimum-size").trigger("change");
            $("#cluster-minimum-size").val(this.commonService.session.style.widgets["cluster-minimum-size"]);
            $("#cluster-minimum-size").trigger("change");
        } 

        console.log('onLinkThresholdChanged called 2');

        if(!silent) {
            // Immediately hide links
            this.commonService.setLinkVisibility(false, false);

            console.log('tagClusters called link threshold change');

            // Now schedule the heavy update (tag clusters, update visibilities, stats) using debouncing
            this.commonService.updateNetworkVisuals();
        }

    }
        

    revealClicked() : void {

        $("#cluster-minimum-size").val(1);
        this.commonService.session.style.widgets["cluster-minimum-size"] = 1;
        $("#filtering-wrapper").slideDown();
        this.commonService.setClusterVisibility(true);
       
        this.commonService.setNodeVisibility(true);
         //To catch links that should be filtered out based on cluster size:
         this.commonService.setLinkVisibility(true);
        //Because the network isn't robust to the order in which these operations
        //take place, we just do them all silently and then react as though we did
        //them each after all of them are already done.

        this.GlobalSettingsLinkColorDialogSettings.isVisible = true;
        this.GlobalSettingsNodeColorDialogSettings.isVisible = true;

        this.store.setNetworkUpdated(true);
        // this.updatedVisualization();

        this.commonService.updateStatistics();

    };


    updateGlobalSettingsModel() {

        this.commonService.GlobalSettingsModel.SelectedRevealTypesVariable = this.SelectedRevealTypesVariable;

        // TODO: See if we need to flip these now since the service should override these local settings
        this.SelectedDistanceMetricVariable = this.commonService.session.style.widgets['default-distance-metric'];
        this.SelectedLinkThresholdVariable = this.commonService.session.style.widgets['link-threshold'];
        this.commonService.GlobalSettingsModel.SelectedNodeColorVariable = this.SelectedNodeColorVariable;
        this.commonService.session.style.widgets['node-color'] = this.SelectedNodeColorVariable;
        this.commonService.session.style.widgets['link-color'] = this.SelectedLinkColorVariable;

        this.commonService.session.style.widgets['node-color-variable'] = this.SelectedColorNodesByVariable;
        this.commonService.session.style.widgets['link-threshold-variable'] = this.SelectedDistanceMetricVariable;
        //this.commonService.session.style.widgets['node-color-variable'] = this.SelectedNodeColorVariable;

        // TODO: Removed, see if this is still necessary
        // this.commonService.session.style.widgets['link-tooltip-variable'] = this.SelectedColorLinksByVariable;


        this.commonService.GlobalSettingsModel.SelectedColorVariable = this.SelectedColorVariable;
        this.commonService.GlobalSettingsModel.SelectedLinkThresholdVariable = this.SelectedLinkThresholdVariable;
        this.commonService.GlobalSettingsModel.SelectedDistanceMetricVariable = this.SelectedDistanceMetricVariable;
        this.commonService.session.style.widgets['selected-color'] = this.SelectedColorVariable;
        this.commonService.session.style.widgets['selected-node-stroke-color'] = this.SelectedColorVariable;
        // TODO: 
        // if (this.commonService.visuals.phylogenetic) {
        //   this.commonService.visuals.phylogenetic.updateNodeColors();
        // }


        this.commonService.GlobalSettingsModel.SelectedBackgroundColorVariable = this.SelectedBackgroundColorVariable;
        this.commonService.session.style.widgets['background-color'] = this.SelectedBackgroundColorVariable;


        this.commonService.GlobalSettingsModel.SelectedApplyStyleVariable = this.SelectedApplyStyleVariable;


        //this.ShowGlobalSettingsLinkColorTable = this.GlobalSettingsLinkColorDialogSettings.isVisible;
        //console.log('3 this.ShowGlobalSettingsLinkColorTable: ', this.ShowGlobalSettingsLinkColorTable); 
        console.log('4 this.ShowGlobalSettingsLinkColorTable: ', this.GlobalSettingsLinkColorDialogSettings.isVisible); 
        // print out #global-settings-link-color-table element
        console.log('xy link color table 3: ', $('#link-color-table'));

    }

    /**
     * this.publishUpdateVisualization()
     * 
     * XXXXX may need to be updated or trimmed (switch statement has no functionality) XXXXX
     */
    updatedVisualization() {

        console.log('updatedVisualization called');

        this.publishUpdateVisualization();


    }



    getGlobalSettingsData() {
        console.log('--- getGlobalSettingsData called');
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
        //this.commonService.updateThresholdHistogram();

        console.log('--- getGlobalSettingsData end - last of loadDefaultVisualization in MT');

    }

    /**
     * XXXXX move XXXXX
     */
    ngAfterViewInit() {

        // let factory = this.cfr.resolveComponentFactory(FilesComponent);
        // this.cmpRef = this.targets.first.createComponent(factory);
        // setTimeout(() => {
            this._goldenLayoutHostComponent.initialise();
            
            // headerHeight (tab) is updated so that goldenLayout knows what the css is set to. 
            this._goldenLayoutHostComponent['_goldenLayout.layoutConfig.dimensions.headerHeight'] = 36;
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

        // Subscribe to the files view to see when its time to load the visualization
        this.subscription = this.homepageTabs[0].componentRef.instance.LoadDefaultVisualizationEvent.subscribe((v) => {
            // if(this.commonService.debugMode) {
            //     console.log('--- INIT Homepage [0] LoadDefaultloading default: ', this.homepageTabs[0].componentRef.instance, v);
            // }

            if(this.commonService.debugMode) {
                console.log('init Files Load Default subscription-: ', this.homepageTabs[0].componentRef.instance);
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

            this.commonService.activeTab = v;

            console.log('tab changed settigns viz: ', v);

            // If network is not even renered yet, no need ot update these values
            if (!this.networkRendered) {
                return;
            }
            
            if (v === "Files" || v === "Epi Curve" || v === "Alignment View" || v === "Table" || v === "Crosstab" || v === "Aggregate" || v === "Heatmap" || v === "Gantt Chart" || v === "Waterfall" || v == "Sankey") {
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
            console.log('linktable vis - false tab changed: ', this.GlobalSettingsLinkColorDialogSettings.isVisible);

        });
        
        this.store.updatecurrentThresholdStepSize(this.SelectedDistanceMetricVariable);
        console.log('tab changed end: ');
    }


    private _removeGlView(view : string) {
        console.log(`Removing ${view}`);
        this._goldenLayoutHostComponent.removeComponent(view);
        this.removeComponent(view);
    }


    convertToCSV(objArray) {

        const tmpArray = typeof objArray != 'object' ? JSON.parse(objArray) : objArray;
        let str = '';
        let headerLoaded = false;
        let line = '';


        for (let i = 0; i < tmpArray.length; i++) {
            line = '';

            if (headerLoaded == false) {
                for (const index1 in tmpArray[i]) {
                    if (line != '') line = line.toString() + ','

                    line = line.toString() + index1.toString().replace(/\r/g, '').replace(/\n/g, '').trim();
                }

                str = str.toString() + line.toString() + '\r\n';

                headerLoaded = true;
            }
            line = '';

            for (const index2 in tmpArray[i]) {
                if (line != '') line = line.toString() + ','

                line = line.toString() + tmpArray[i][index2].toString();
            }

            if (line != "") {
                str = str.toString() + line.toString().replace(/\r/g, '').replace(/\r/g, '').trim() + (i == tmpArray.length - 1 ? '' : '\r\n');
            }
        }

        return str;
    }


    officialInstance () {
        const prodVal = RegExp(/https:\/\/microbetrace.cdc.gov\/MicrobeTrace/);
        const devVal = RegExp(/https:\/\/cdcgov.github.io\/MicrobeTrace/);
        const localVal = RegExp(/localhost/);
        if (prodVal.test(this.currentUrl) || devVal.test(this.currentUrl) || localVal.test(this.currentUrl)) {
            return true;
        } 
    }

    getHeight() {
        const timelineHeight = this.commonService.session.style.widgets["timeline-date-field"] == 'None' ? 0 : 150
        if (this.officialInstance()) {
            return window.innerHeight - 80 - timelineHeight;
        } else {
            const warningHeight = $('#url-warning-div').height()
            return window.innerHeight - 80 - warningHeight - timelineHeight;
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


    public loadDefaultVisualization(e: string) {

        console.log('--- Load Default Visualization called - reset layout ', e);

        e = e.replace("_", " ");

        if (e === "2d network"){
            e = "2D Network";
        }

        this.resetLayout();

        // TODO:: see if timeout needed
        // setTimeout(() => {
        if (this.homepageTabs.findIndex(x => x.label == e) === -1) {
            console.log('--- Load Default Visualization end - view click');
            this.Viewclick(e);
        }
        // }, 500);
        
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

        // Loading new data so setting network rendered to false
        this.networkRendered = false;

        this.GlobalSettingsDialogSettings.setVisibility(false);
        this.GlobalSettingsLinkColorDialogSettings.setVisibility(false);
        console.log('link table vis - false get file content');

        this.GlobalSettingsNodeColorDialogSettings.setVisibility(false);

        if(this.commonService.debugMode) {
            console.log('GetFile Ontent Called');
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
                    // Unsubscribe from previous files view subscription in get file contents
                    this.subscription.unsubscribe();
                    this.subscription = this.homepageTabs[0].componentRef.instance.LoadDefaultVisualizationEvent.subscribe((v) => {
                        console.log('--- Files loading default from subscription: ');

                        // this.loadSettings();
                        this.loadDefaultVisualization(v);
                        this.publishLoadNewData();
                    });

                    // Process files in the files view
                    x.componentRef.instance.processFiles(fileList);

                    // Populate table
                    x.componentRef.instance.populateTable();

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

    DisplayHelp() {
        window.open("https://github.com/CDCgov/MicrobeTrace/wiki");
    }

    DisplayAbout() {
        this.displayAbout = !this.displayAbout;
    }

    OpenExportDashboard() {
        this.showExportDashboardMenu = true;
        this.updateExportResolution();
    }

    OpenExportTables() {
        this.showExportTablesMenu = true;
    }

    ExportDashboard() {
        // Prepare export options
        const exportOptions: ExportOptions = {
            filename: this.ExportDashboardFilename,
            filetype: 'png',
            scale: this.ExportDashboardScale,
            quality: 1,
        };
    
        // Set export options in the service
        this.exportService.setExportOptions(exportOptions);
    
        // Request export
        this.performExport();

        this.showExportDashboardMenu = false;
        
    }

    ExportTables() {
        const exportOptions: ExportOptions = {
            filename: this.ExportTablesFilename,
            filetype: this.ExportTablesFileType,
            scale: this.ExportTablesScale,
            quality: 1,
        };
        this.exportService.setExportOptions(exportOptions);

        let elementsToExport: HTMLTableElement[] = [];

        if (this.exportTables['node-symbol']) {
            let nodeSymbolTable = $('#nodeSymbolTable')[0]
            elementsToExport.push(nodeSymbolTable as HTMLTableElement) 
            console.log(nodeSymbolTable, elementsToExport)
        }
        if (this.exportTables['polygon-color']) {
            let polygonTable = $('#polygon-color-table')[0]
            elementsToExport.push(polygonTable as HTMLTableElement)
        }
        if (elementsToExport.length == 0 && this.exportTables['node-color'] == false && this.exportTables['link-color'] == false) {
            console.log('nothing to export');
             return; 
        }

        if (this.ExportTablesFileType == 'svg') {
            this.performExportSVG(elementsToExport, '', this.exportTables['node-color'], this.exportTables['link-color']);
        } else {
            this.performExport(elementsToExport, this.exportTables['node-color'], this.exportTables['link-color']);
        }
    }

    updateExportResolution() {
        const visualWrapper = this.visualWrapperRef.nativeElement;
        console.log(visualWrapper)
        let height = visualWrapper.offsetHeight;
        let width = visualWrapper.offsetWidth;

        this.ExportDashboardResolution.width = Math.floor(width * this.ExportDashboardScale);
        this.ExportDashboardResolution.height = Math.floor(height * this.ExportDashboardScale);
        this.ExportDashboardResolution.summary = `${this.ExportDashboardResolution.width} x ${this.ExportDashboardResolution.height}`;

    }


    clusterSaveClick() {

    }

    DisplayStashDialog(saveStash: string) {
        switch (saveStash) {
            case "Save": {

                if (this.selectedSaveFileType == 'style') {
                    const data = JSON.stringify(this.commonService.session.style);
                    const blob = new Blob([data], { type: "application/json;charset=utf-8" });
                    saveAs(blob, this.saveFileName+'.style')
                    return;
                }

                const zip = new JSZip();

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
                    const clusterNodeList = [];
                    const clusterLinkList = [];
                    const singletonNodeList = [];
                    const dyadNodeList = [];
                    const dyadEdgeList = [];
                    const nodes = this.commonService.session.data.nodes;
                    const links = this.commonService.session.data.links;

                    this.commonService.session.data.clusters.forEach(cluster => {

                    const clusterNodes = nodes.filter(node => node.cluster === cluster.id);

                    const clusterLinks = links.filter(link => link.cluster === cluster.id);

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

                    for (let i = 0; i < this.commonService.session.data.clusters.length; i++) {

                    const currentCluster = this.commonService.session.data.clusters[i];

                    const cluster = clusterNodeList.filter(nodeList => nodeList[0].cluster == currentCluster.id);

                    // Check if cluster is in clusterNodesList
                    if(cluster.length > 0){

                        // Create cluster folder
                        const clusterFolder = zip.folder("cluster-" + cluster[0][0].cluster);
                    
                        // If node and edge lists exists, add them to the current folder
                        const clusterNode = clusterNodeList.filter(NodeList => NodeList[0].cluster == currentCluster.id);

                        if(clusterNode) {

                        const blob = new Blob([Papa.unparse(cluster[0])], {type: 'text/csv;charset=utf-8'});
                        clusterFolder.file( "nodeList_cluster_" + cluster[0][0].cluster + ".csv", blob);

                        // Now get link list of cluster
                        const clusterLink = clusterLinkList.filter(LinkList => LinkList[0].cluster == currentCluster.id);

                        if(clusterLink) {
                            const blob = new Blob([Papa.unparse(clusterLink[0])], {type: 'text/csv;charset=utf-8'});
                            clusterFolder.file("edgeList_cluster_" + cluster[0][0].cluster + ".csv", blob);
                        }
                        }
                    }
                    }

                    if(dyadNodeList.length > 0){
                        dyadFolder = zip.folder("dyads");
                        // Add all dyads in one shot
                        const nodesBlob = new Blob([Papa.unparse(dyadNodeList)], {type: 'text/csv;charset=utf-8'});
                        dyadFolder.file("nodeList_cluster.csv", nodesBlob);
                        const edgesBlob = new Blob([Papa.unparse(dyadEdgeList)], {type: 'text/csv;charset=utf-8'});
                        dyadFolder.file("edgeList_cluster.csv", edgesBlob);
                      }
                
                      if (singletonNodeList.length > 0) {
                        singletonFolder = zip.folder("singletons");
                        // Add all singletons in one shot
                        const blob = new Blob([Papa.unparse(singletonNodeList)], {type: 'text/csv;charset=utf-8'});
                        singletonFolder.file("nodeList_cluster.csv", blob);
                      }
                        
                      const that = this;
                      // generate zip repsetnation in memory
                      zip.generateAsync({type:"blob"}).then(function(content) {
                          // see FileSaver.js
                          saveAs(content, `${that.saveFileName}.zip`);
                      });
                } else {
                    this.commonService.session.files.forEach(file => {
                        if (file.extension == 'xlsx' || file.extension == 'xls') {
                            this.convertFileToCSV(file);
                        }
                    });

                    const stash: StashObjects = {
                        session: this.commonService.session,
                        tabs: lightTabs
                    };

                    const that = this;

                    if ($("#save-file-compress").is(":checked")) {
                        const zip = new JSZip();
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

    /**
     * Converts an excel file array buffer to a CSV string use when exporting
     * @param file excel file in commonService.session.files
     */
    convertFileToCSV(file) { 
        if (file.extension == 'xlsx' || file.extension == 'xls') {

            let x = new Uint8Array(file.contents)
            let workbook = XLSX.read(x, { type: 'array' });
            let csvString = XLSX.utils.sheet_to_csv(workbook.Sheets[workbook.SheetNames[0]]);

            file.extension = 'csv';
            file.name = file.name.replace('.xlsx', '.csv').replace('.xls', '.csv');
            file.contents = csvString;
            file.type = "text/csv";
        }
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
              this.commonService.clearData();
              const auspiceFile = { contents: out, name: this.getAuspiceName(auspiceUrl), extension: 'json'};
              this.commonService.session.files.push(auspiceFile);
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
          //const auspiceUrl = this.auspiceUrlVal;
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

        this.commonService.activeTab = 'Files';
        this.activeTabIndex = 0;
    }

    // Commonet back when implementing stash

    NewSession() {

        // Emit new session event for other components to reset/destroy
        this.commonService.onNewSession();

        this.ResetTabs();
        this.onReloadScreen();
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

                break;
            }

        }
    }

    SettingsClick(actionName: any) {
        switch (actionName) {
            case "Global Settings": {
                console.log('snps settings: ', this.SelectedDistanceMetricVariable);
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
        const rows = [];
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
            console.log('--- viewClick: ', viewName);
            console.log(this.commonService.session.style.widgets['link-threshold']);
            console.log('homepage tabs: ' , this.homepageTabs);
            console.log('--- polygon color show11: ', this.commonService.session.style.widgets['polygons-color-show']);

        }
       

        if (viewName == "2d network") {
            viewName = "2D Network";
        }

        const tabNdx = this.homepageTabs.findIndex(x => x.label == viewName);

        /*/
         * Don't allow duplicate tabs to get added.
        /*/
        if (tabNdx == -1) {

            console.log('--- viewClick new view - add component');

            this.activeTabIndex = this.activeTabIndex + 1;
            this.addComponent(viewName);

        }
        else {
            
            const container = this._goldenLayoutHostComponent.focusComponent(viewName);

            const instance = this._goldenLayoutHostComponent.getComponentRef(container).instance as any;

            console.log('--- viewClick exisitng view - load settings');

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

        this.getGlobalSettingsData();
        // TODO: May need to refacor this
        this.updateGlobalSettingsModel();


        this.GlobalSettingsDialogSettings.setVisibility(true);
        this.cachedGlobalSettingsVisibility = this.GlobalSettingsDialogSettings.isVisible;

        this.commonService.updateThresholdHistogram(this.linkThresholdSparkline.nativeElement);

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

    /**
     * Opens MicroTrace Classic in a new tab and retains the Auspice URL if it exists
     */
    openMT_Classic() {
        if (this.auspiceUrlVal) {
            let mt_url = "https://microbetrace.cdc.gov/MicrobeTraceClassic/?url=" + this.auspiceUrlVal.replace(/\//g, "%2F");
            window.open(mt_url, "_blank")
        } else {
            window.open("https://microbetrace.cdc.gov/MicrobeTraceClassic/", "_blank")
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

        const activeComponentName: string = this.homepageTabs[tabNdx].label;


        this.homepageTabs.forEach((item: HomePageTabItem) => {
            item.isActive = item.label === activeComponentName;
        });

        // this.activeTabIndex = tabNdx;
        if(this.commonService.debugMode) {
            console.log('-- set active tab tab switched is: ', tabNdx);
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

    addTab(tabLabel: any, tabTitle: any, tabPosition: any, componentRef: any, activate: boolean = true): void {

        console.log('--- addTab called');
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
            componentRef: componentRef
            // componentRef: this.goldenLayout.componentInstances[this.goldenLayout.componentInstances.length - 1]
        });

        
        console.log('--- addTab end: ', this.homepageTabs, componentRef);

    }

    clearTable(tableId) {
        const linkColorTable = $(tableId).empty();
    }

    onReloadScreen() {
        this.commonService.session.style.widgets = this.commonService.defaultWidgets();
        this.loadFilterSettings();
    }

    loadFilterSettings() {

        this.store.setSettingsLoaded(false);

        this.commonService.session.network.settingsLoaded = false;
        this.getGlobalSettingsData();

        //Filtering|Prune With
        this.SelectedPruneWithTypesVariable = this.commonService.session.style.widgets["link-show-nn"] ? "Nearest Neighbor" : "None";
        // this.onPruneWithTypesChanged();

        //Filtering|Minimum Cluster Size
        this.SelectedClusterMinimumSizeVariable = this.commonService.session.style.widgets["cluster-minimum-size"];
        this.onMinimumClusterSizeChanged(true);
        
        //Filtering|Filter Links on
        this.SelectedLinkSortVariable = this.commonService.session.style.widgets["link-sort-variable"];
        this.onLinkSortChanged(true);


        //Filtering|Filtering Threshold
        console.log('--- loadSettings link-threshold changed: ', this.commonService.session.style.widgets["link-threshold"]);
        this.SelectedLinkThresholdVariable = this.commonService.session.style.widgets["link-threshold"];
        this.onLinkThresholdChanged();

    }

    loadUISettings() {

        this.ShowGlobalSettingsLinkColorTable = false;
        this.ShowGlobalSettingsNodeColorTable = false;

        // console.log('xy link color table: ', linkColorTable);
        console.log('xy link color table 1.5: ', $('#link-color-table'));
        //Styling|Color Nodes By
         this.SelectedColorNodesByVariable = this.commonService.session.style.widgets["node-color-variable"];
         this.onColorNodesByChanged(false);
 
         console.log('oncolorNodesByChanged 2 - selected color nodes by variable: ', this.SelectedColorNodesByVariable);

         //Styling|Nodes
         this.SelectedNodeColorVariable = this.commonService.session.style.widgets["node-color"];
         this.onNodeColorChanged(true);
         
         console.log('xy link color table 2: ', $('#link-color-table'));
 
 
         //Styling|Color Links By
         if (this.commonService.session.style.widgets['link-color-variable'] === "None") {
             this.commonService.session.style.widgets['link-color-variable'] = "origin";
         }

        //  console.log('1this.ShowGlobalSettingsLinkColorTable: ', this.ShowGlobalSettingsLinkColorTable); 

 
         this.SelectedColorLinksByVariable = this.commonService.session.style.widgets['link-color-variable'];
         console.log('oncolorLinksByChanged - loadUISettings - selected color links by variable: ', this.SelectedColorLinksByVariable);
         console.log('link colorTable - loadui1: ', $('#link-color-table'));

         this.onColorLinksByChanged(true);
 
         console.log('xy link colorTable 3 - loadui2: ', $('#link-color-table'));

          //Styling|Links
          this.SelectedLinkColorVariable = this.commonService.session.style.widgets["link-color"];
          this.onLinkColorChanged(true);

         //Styling|Selected
         this.SelectedColorVariable = this.commonService.session.style.widgets['selected-color'];
 
         //Styling|Background
         this.SelectedBackgroundColorVariable = this.commonService.session.style.widgets['background-color'];
         this.onBackgroundChanged();
  
        //  console.log('xy link color table 3: ', linkColorTable);

        //  console.log('this.ShowGlobalSettingsLinkColorTable: ', this.ShowGlobalSettingsLinkColorTable); 
        //  console.log('2 this.ShowGlobalSettingsLinkColorTable: ', this.GlobalSettingsLinkColorDialogSettings.isVisible); 

         this.store.setSettingsLoaded(true);

         console.log('link colorTable - loadui3: ', $('#link-color-table'));

 
         this.updateGlobalSettingsModel();

    }

    publishLoadNewData() {

        console.log('--- publishLoadNewData called');
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

    getCurrentThresholdStepSize() {
        return this.store.currentThresholdStepSizeValue;
    }

    /**
     * Updates default-distance-metric widget and this.SelectedLinkThresholdVariable (7 for snps, 0.015 for TN93).
     * Calls onLinkThresholdChanged to updated links
     */
  onDistanceMetricChanged = () => {
    if(!this.SelectedDistanceMetricVariable) this.SelectedDistanceMetricVariable = this.commonService.session.style.widgets['default-distance-metric'];
    this.store.updatecurrentThresholdStepSize(this.SelectedDistanceMetricVariable);
    if (this.SelectedDistanceMetricVariable.toLowerCase() === 'snps') {
      $('#default-distance-threshold')
        .attr('step', 1)
        .val(7)
        .trigger('change');
      this.commonService.session.style.widgets['default-distance-metric'] = 'snps';
      this.SelectedLinkThresholdVariable = '7';
      this.onLinkThresholdChanged();
    } else {
      $('#default-distance-threshold')
        .attr('step', 0.001)
        .val(0.015)
        .trigger('change');
      this.commonService.session.style.widgets['default-distance-metric'] = 'tn93';
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
