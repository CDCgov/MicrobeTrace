import { ChangeDetectionStrategy, Component, OnInit, Injector, ViewChild, ViewChildren, AfterViewInit, ComponentRef, ViewContainerRef, QueryList, ElementRef, Output, EventEmitter, ChangeDetectorRef, OnDestroy, ViewEncapsulation, Renderer2 } from '@angular/core';
import { CommonService } from './contactTraceCommonServices/common.service';
import * as d3 from 'd3';
import { AppComponentBase } from '@shared/common/app-component-base';
import { SelectItem, TreeNode, ConfirmationService } from 'primeng/api';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { AppSessionService } from '@shared/common/session/app-session.service';
import { DialogSettings } from './helperClasses/dialogSettings';
import { saveAs } from 'file-saver';
import { DashboardRestoreState, StashObjects, HomePageTabItem } from './helperClasses/interfaces';
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
import { GraphMLService } from './contactTraceCommonServices/graphml.service';
import { sanitizeExportRows } from './contactTraceCommonServices/export-sanitization';
import * as XLSX from 'xlsx';
import { buildDate, commitHash } from "src/environments/version";
import { EmbedHandoffService } from './embed/embed-handoff.service';
import { KeyTablesComponent } from './visualizationComponents/KeyTablesComponent/key-tables.component';
import { KEY_TABLE_NAMES, KeyTableName, KeyTablesController } from './visualizationComponents/KeyTablesComponent/key-tables.controller';
import { NetworkStatisticsComponent } from './visualizationComponents/NetworkStatisticsComponent/network-statistics-plugin.component';
import {
    StyleKeyTableAlphaRequest,
    StyleKeyTableColorChange,
    StyleKeyTableColumnNameChange,
    StyleKeyTableRow,
    StyleKeyTableRowNameChange,
    StyleKeyTableShapeChange,
    StyleKeyTableShapePanelRequest,
    StyleKeyTableSortColumn
} from './visualizationComponents/KeyTablesComponent/style-key-table.component';
import type { ThresholdSweepSummary } from './contactTraceCommonServices/threshold-analysis';
import {
    NODE_SHAPE_GROUPS,
    NODE_SYMBOL_OPTIONS,
    NodeShapeGroupKey,
    NodeShapeOption,
    resolveNodeShapeKey
} from '@app/contactTraceCommonServices/node-shapes';
import {
    DialogRectSnapshot,
    GlobalSettingsDialogRequest,
    NormalizedGlobalSettingsDialogRequest
} from './helperClasses/globalSettingsDialogRequest';

type ThresholdSweepSnapshot = {
    threshold: number;
    componentCount: number;
    clusterCount: number;
    singletonCount: number;
    largestClusterSize: number;
    sourceThreshold: number | null;
};

type ThresholdStabilityRegion = {
    startThreshold: number;
    endThreshold: number;
    suggestedThreshold: number;
    width: number;
    samples: number;
    clusterCount: number;
    singletonCount: number;
    largestClusterSize: number;
    componentCount: number;
    isCurrent: boolean;
};

type DashboardOpenEntry = {
    label: string;
    tabTitle: string;
    componentRef: any;
};

type KeyTableDisplayMode = 'Show' | 'Dock' | 'Hide';
type TimelineRangeBoundary = 'start' | 'end' | 'both';

type DialogPlacementCandidate = {
    top: number;
    left: number;
    overlapArea: number;
};

interface NodeShapeOptionGroup {
    key: NodeShapeGroupKey;
    label: string;
    items: NodeShapeOption[];
}

interface NodeShapeAggregate {
    key: string;
    rawValue: any;
    count: number;
    frequency: number;
    [key: string]: any;
}

function groupNodeShapeOptions(options: NodeShapeOption[]): NodeShapeOptionGroup[] {
    return NODE_SHAPE_GROUPS
        .map(({ label, key }) => ({
            key,
            label,
            items: options.filter(option => option.groupKey === key)
        }))
        .filter(group => group.items.length > 0);
}

function buildNodeShapeTreeOptions(groups: NodeShapeOptionGroup[], defaultExpandedGroup: NodeShapeGroupKey): TreeNode<NodeShapeOption>[] {
    return groups.map(group => ({
        key: group.key,
        label: group.label,
        selectable: false,
        expanded: group.key === defaultExpandedGroup,
        children: group.items.map(option => ({
            key: option.key,
            label: option.name,
            type: 'shape',
            data: option,
            leaf: true,
            selectable: true
        }))
    }));
}


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
    @ViewChild('nodeShapeTable') nodeShapeTable!: ElementRef;

    public metric: string = "snps";
    public ambiguity: string = "Average";
    public launchView: string = "2D Network";
    public threshold: string = "16";

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
    public readonly keyTablesController = new KeyTablesController();
    public readonly GlobalSettingsDialogBaseZIndex = 5000;
    public GlobalSettingsDialogStyle: Record<string, string> = { 'z-index': String(this.GlobalSettingsDialogBaseZIndex) };
    private preserveNextKeyTablesRemoval: boolean = false;
    private readonly linkedSettingsDialogGap = 16;
    private readonly linkedSettingsDialogViewportMargin = 8;

    private thresholdDebouncer: Subject<number> = new Subject<number>();
    nodeColorRows: StyleKeyTableRow[] = [];
    linkColorRows: StyleKeyTableRow[] = [];
    nodeColorTableHeaders = { value: '', count: 'Count', frequency: 'Frequency' };
    linkColorTableHeaders = { value: '', count: 'Count', frequency: 'Frequency' };
    nodeColorTableEditable = true;
    linkColorTableEditable = true;
    private nodeColorDomain: string[] = [];
    private linkColorDomain: string[] = [];
    private colorTableSortState: Record<string, { column: StyleKeyTableSortColumn; ascending: boolean }> = {};

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

    version: string = '2.2.1';
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
    private applyingPendingDashboardRestore = false;
    private duoLinkOrigins: string[] = [];
    private timelineTablesRefreshHandle: ReturnType<typeof setTimeout> | null = null;


    // posts: BlockchainProofHashDto[] = new Array<BlockchainProofHashDto>();

    private dismissWelcomeOverlay(duration: JQuery.Duration = 'slow'): void {
        const overlay = $('#overlay');
        overlay.addClass('overlay-hidden').css('pointer-events', 'none');
        overlay.find('.dnd-input').css('pointer-events', 'none');
        overlay.stop(true, true).fadeOut(duration);
        $('.ui-tabview-nav').stop(true, true).fadeTo(duration, 1);
        $('.m-portlet').stop(true, true).fadeTo(duration, 1);
    }
    // Blockchaindata: BlockchainProofHashDto = new BlockchainProofHashDto();
    date: Date;
    // Inputdownloadblock: DownloadFilteredBlockDto = new DownloadFilteredBlockDto();
    Filepath: SafeResourceUrl;

    //BlockChainLedgerNodeList: any[] = [];
    //BlockChainLedgerEdgeList: any[] = [];



    FieldList: SelectItem[] = [];
    ToolTipFieldList: SelectItem[] = [];
    NetworkSubsetOperatorTypes: SelectItem[] = [
        { label: 'Contains', value: 'contains' },
        { label: 'Equals', value: 'equals' },
        { label: 'Does Not Equal', value: 'notEquals' },
        { label: 'Starts With', value: 'startsWith' },
        { label: 'Ends With', value: 'endsWith' },
        { label: 'In List', value: 'in' },
        { label: '<', value: 'lt' },
        { label: '<=', value: 'lte' },
        { label: '>', value: 'gt' },
        { label: '>=', value: 'gte' }
    ];
    SelectedNetworkSubsetNodeField: string = 'None';
    SelectedNetworkSubsetNodeOperator: string = 'equals';
    SelectedNetworkSubsetNodeValue: string = '';
    SelectedNetworkSubsetLinkField: string = 'None';
    SelectedNetworkSubsetLinkOperator: string = 'contains';
    SelectedNetworkSubsetLinkValue: string = '';
    NetworkSubsetNodeValueOptions: string[] = [];
    NetworkSubsetLinkValueOptions: string[] = [];
    private NetworkSubsetNodeAllValueOptions: string[] = [];
    private NetworkSubsetLinkAllValueOptions: string[] = [];
    private readonly NetworkSubsetValueSuggestionLimit = 50;

    PruneWityTypes: any = [
        { label: 'None', value: 'None' },
        { label: 'Nearest Neighbor', value: 'Nearest Neighbor' }
    ];
    SelectedPruneWithTypesVariable: string = 'None';
    SelectedEpsilonValue: string;


    SelectedClusterMinimumSizeVariable: any = 0;
    SelectedLinkSortVariable: string = 'Distance';
    SelectedLinkThresholdVariable: any = parseFloat(this.threshold);
    SelectedLinkThresholdDisplayVariable: any = parseFloat(this.threshold);
    SelectedDistanceMetricVariable = this.metric;
    SelectedTN93DistanceDisplayFormatVariable: string = 'decimal';
    TN93DistanceDisplayFormatOptions = [
        { label: 'Decimal', value: 'decimal' },
        { label: 'Percentage', value: 'percentage' }
    ];
    thresholdSweepMetricLabel: string = '';
    thresholdSweepSampleCount: number = 0;
    thresholdStabilityExpanded: boolean = false;
    thresholdStabilityCurrent: ThresholdSweepSnapshot | null = null;
    thresholdStabilityRegions: ThresholdStabilityRegion[] = [];
    thresholdStabilityMessage: string = '';

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
    SelectedNodeSymbolVariable: string = 'None';
    SelectedNodeColorVariable: string = '#1f77b4';
    SelectedLinkColorVariable: string = '#1f77b4';
    SelectedColorLinksByVariable: string = 'origin';

    SelectedTimelineVariable: string = 'None';
    timelineSpeedOptions: number[] = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
    timelineSpeed: number = 200;
    timelineSpeedIndex: number = this.timelineSpeedOptions.indexOf(this.timelineSpeed);


    readonly TableVisualizationOptions = [
        { label: 'Show', value: 'Show' },
        { label: 'Dock', value: 'Dock' },
        { label: 'Hide', value: 'Hide' }
    ] as const;
    SelectedLinkColorTableTypesVariable: KeyTableDisplayMode = 'Dock';
    SelectedNodeColorTableTypesVariable: KeyTableDisplayMode = 'Dock';
    SelectedNodeShapeTableTypesVariable: KeyTableDisplayMode = 'Dock';

    private readonly defaultShapePickerExpandedGroup: NodeShapeGroupKey = 'basic';
    symbolMapping: NodeShapeOption[] = NODE_SYMBOL_OPTIONS;
    symbolMappingGroupLookup: Map<string, NodeShapeGroupKey> = new Map(this.symbolMapping.map(option => [option.key, option.groupKey] as const));
    symbolMappingGroups: NodeShapeOptionGroup[] = groupNodeShapeOptions(NODE_SYMBOL_OPTIONS);
    symbolMappingTree: TreeNode<NodeShapeOption>[] = buildNodeShapeTreeOptions(this.symbolMappingGroups, this.defaultShapePickerExpandedGroup);
    symbolMappingTreeLookup: Map<string, TreeNode<NodeShapeOption>> = new Map(
        this.symbolMappingTree.flatMap(group => (group.children ?? []).map(shapeNode => [shapeNode.key ?? '', shapeNode] as const))
    );
    shapeAggregates: NodeShapeAggregate[] = [];
    shapeSort: { key: string, assending: boolean } = { key: 'count', assending: true };


    SelectedColorVariable: string = '#ff8300';
    SelectedBackgroundColorVariable: string = '#ffffff';
    SelectedApplyStyleVariable: string = '';


    activeTabNdx = null;
    roles: Array<string> = new Array<string>();

    ShowGlobalSettingsSettingsPane: boolean = false;
    GlobalSettingsDialogSettings: DialogSettings;
    GlobalSettingsLinkColorDialogSettings: DialogSettings;
    GlobalSettingsNodeColorDialogSettings: DialogSettings;
    GlobalSettingsNodeShapeDialogSettings: DialogSettings;

    cachedGlobalSettingsVisibility: boolean = false;
    cachedGlobalSettingsLinkColorVisibility: boolean = false;
    cachedGlobalSettingsNodeColorVisibility: boolean = false;
    cachedGlobalSettingsNodeShapeVisibility: boolean = false;

    cmpRef: ComponentRef<any>;

    public playBtnText: string = "Play";

    public handle: any;

    public rangeStartHandle: any;

    public rangeEndHandle: any;
    
    public label: any;

    public rangeStartLabel: any;

    public rangeEndLabel: any;

    public xAttribute: any;

    public handleDateFormat: any;

    public currentTimelineValue: any;

    public currentTimelineStartValue: any;

    public currentTimelineTargetValue: any;

    public timelineRangeStartInput: string = '';

    public timelineRangeEndInput: string = '';

    private rangeSelection: any;

    private timelineDomainStart: Date | null = null;

    private timelineDomainEnd: Date | null = null;

    private timelinePlaybackPaused: boolean = false;

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
        private exportService: ExportService,
        private graphMLService: GraphMLService,
        private embedHandoffService: EmbedHandoffService
    ) {


        super(injector);

        this.widgets = this.commonService.session.style.widgets

        this.appSession = injector.get(AppSessionService);

        // Add this line to expose the service for Cypress tests
        (window as any).commonService = this.commonService;
        this.commonService.visuals.microbeTrace = this;

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

    private hasTestQueryFlag(flag: string): boolean {
        return new URL(window.location.href).searchParams.get(flag) === '1';
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
            this.performExport(info.element, info.exportNodeTable, info.exportLinkTable, info.exportNodeShapeTable);
        });

        this.exportService.exportSVG$.subscribe((info) => {
            this.performExportSVG(info.element, info.mainSVGString, info.exportNodeTable, info.exportLinkTable, info.exportNodeShapeTable);
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
                    console.log('--- Regenerating visible color tables after initial UI load ---');
                    this.refreshVisibleColorTables();
                }
                // Case 2: Subsequent network updates (e.g., from threshold change)
                // Regenerate table only if UI settings are already loaded AND table should be visible/relevant
                else if (this.store.settingsLoadedValue) {
                    console.log('--- Regenerating visible color tables due to network update ---');
                    this.refreshVisibleColorTables();
                }

                if (this.GlobalSettingsDialogSettings?.isVisible) {
                    this.refreshThresholdStabilityPanel(false);
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
        if (rendered) {
          this.clearLoadingInformationModal();

          this.networkRendered = true;
          this.cdref.detectChanges();

          if (this.commonService.pendingDashboardRestore?.dashboardLayout?.root) {
              setTimeout(() => this.schedulePendingDashboardRestore(), 0);
          }

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
            if(this.commonService.session.network.isFullyLoaded) {
                this.clearLoadingInformationModal();
                this.cdref.detectChanges();
                return;
            }

            if(message) {
                this.displayloadingInformationModal = true;
                this.showMessage(message);
            } 
        });

        // Subscribe to threshold changes from the service
        this.thresholdSubscription = this.store.linkThreshold$.subscribe(
            (newThreshold: number) => {
                // Only update local state if changed
                if (Number(this.SelectedLinkThresholdVariable) !== Number(newThreshold)) {
                    this.onLinkThresholdChanged(newThreshold);
                } else {
                    this.syncThresholdDisplayFromStoredValue();
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
        if (!this.GlobalSettingsNodeShapeDialogSettings) {
            this.GlobalSettingsNodeShapeDialogSettings = new DialogSettings('#global-settings-node-shape-table', false);
        }

        this.store.styleFileApplied$
            .pipe(takeUntil(this.destroy$))
            .subscribe(() => {
                this.applySavedNodeShapeSettingsFromSession();
            });

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
        this.commonService.session.style.widgets['link-threshold'] = Number(this.SelectedLinkThresholdVariable);
        this.syncThresholdDisplayFromStoredValue();
        this.SelectedRevealTypesVariable = this.commonService.GlobalSettingsModel.SelectedRevealTypesVariable;
        this.SelectedStatisticsTypesVariable = this.commonService.GlobalSettingsModel.SelectedStatisticsTypesVariable;

        this.SelectedColorNodesByVariable = this.commonService.GlobalSettingsModel.SelectedColorNodesByVariable;
        this.SelectedNodeSymbolVariable = this.commonService.GlobalSettingsModel.SelectedNodeSymbolVariable ?? this.commonService.session.style.widgets['node-symbol-variable'];
        this.SelectedNodeColorVariable = this.commonService.session.style.widgets['node-color'];
        this.SelectedColorLinksByVariable = this.commonService.GlobalSettingsModel.SelectedColorLinksByVariable;

        this.SelectedTimelineVariable = this.commonService.session.style.widgets['node-timeline-variable'];
        this.SelectedColorVariable = this.commonService.session.style.widgets['selected-color'];

        this.setKeyTableDisplayMode('node-color', this.normalizeKeyTableDisplayMode(this.commonService.GlobalSettingsModel.SelectedNodeColorTableTypesVariable ?? this.SelectedNodeColorTableTypesVariable));
        this.setKeyTableDisplayMode('link-color', this.normalizeKeyTableDisplayMode(this.commonService.GlobalSettingsModel.SelectedLinkColorTableTypesVariable));
        this.setKeyTableDisplayMode('node-shape', this.normalizeKeyTableDisplayMode(this.commonService.GlobalSettingsModel.SelectedNodeShapeTableTypesVariable ?? this.commonService.session.style.widgets['node-symbol-table-visible']));
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
    if (this.hasTestQueryFlag('skipEula')) {
      this.commonService.localStorageService.setItem('microbetrace_eula_accepted', 'true');
      this.display_eula_modal = false;
      return;
    }

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

    getLatestSessionWarningMessage(): string {
        const warnings = this.commonService.session?.warnings;
        if (!Array.isArray(warnings) || warnings.length === 0) {
            return '';
        }

        const latestWarning = warnings[warnings.length - 1];
        if (typeof latestWarning === 'string') {
            return latestWarning;
        }

        return String(latestWarning?.message || '');
    }

    clearSessionWarnings(): void {
        if (Array.isArray(this.commonService.session?.warnings)) {
            this.commonService.session.warnings = [];
        }
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

        const openingFromKeyTables =
            this.commonService.activeTab === KeyTablesComponent.componentTypeName;

        const goldenLayoutComponent = openingFromKeyTables
            ? (this._goldenLayoutHostComponent.goldenLayout as any).newComponentAtLocation(
                component,
                undefined,
                undefined,
                [
                    { typeId: 2 }, // FirstStack
                    { typeId: 7 }  // Root fallback
                ]
            )
            : this._goldenLayoutHostComponent.goldenLayout.newComponent(component);

        const componentRef = this._goldenLayoutHostComponent.getComponentRef(goldenLayoutComponent.container);
        
        this.addTab(component, component + this.activeTabIndex, this.activeTabIndex, componentRef);
        
        console.log('--- addComponent Tab added');

        // TODO:: GOLDEN LAYOUT USES ASYNCHONOUS Loading of Components, settimout waits for it
        setTimeout(() => {
            console.log('--- GOLDEN LAYOUT COMPONENT LOADED');
            this.commonService.session.tabLoaded = true;
            this.commonService.session.network.isFullyLoaded = true;
            this.clearLoadingInformationModal();
            this.cdref.detectChanges();
            this.setActiveTabProperties();

            // logpolygon color sh
            if(!this.store.settingsLoadedValue) {
                console.log('--- GOLDEN LAYOUT COMPONENT filter settings');

                this.loadFilterSettings();

                console.log('--- polygon color show33: ', this.commonService.session.style.widgets['polygons-color-show']);

            }
        });

    }

    private clearLoadingInformationModal(): void {
        this.displayloadingInformationModal = false;
        this.messages = [];
    }

    private normalizeDashboardLabel(value: string): string {
        return this.commonService.normalizeViewName(value) ?? String(value).trim();
    }

    private getDashboardLayoutComponentCount(item: any): number {
        if (!item) return 0;
        if (item.type === 'component') return 1;

        const content = Array.isArray(item.content) ? item.content : [];
        return content.reduce((sum, child) => sum + this.getDashboardLayoutComponentCount(child), 0);
    }

    private dashboardLayoutContainsComponent(item: any, componentType: string): boolean {
        if (!item) return false;
        if (item.type === 'component') {
            return this.normalizeDashboardLabel(String(item.componentType ?? item.title ?? '')) === componentType;
        }

        const content = Array.isArray(item.content) ? item.content : [];
        return content.some((child) => this.dashboardLayoutContainsComponent(child, componentType));
    }

    private restoreDashboardKeyTablesState(pendingRestore: DashboardRestoreState, layoutToLoad: any): void {
        const dockedTables = pendingRestore.dashboardState?.keyTables?.dockedTables;

        if (dockedTables) {
            KEY_TABLE_NAMES.forEach((table) => {
                const isDocked = !!dockedTables[table];
                this.keyTablesController.setDocked(table, isDocked);
                this.setKeyTableDisplayMode(table, isDocked ? 'Dock' : 'Hide');
            });
            return;
        }

        if (this.dashboardLayoutContainsComponent(layoutToLoad?.root, KeyTablesComponent.componentTypeName)) {
            this.keyTablesController.dockAll();
            KEY_TABLE_NAMES.forEach((table) => {
                if (this.keyTableHasSelectedVariable(table)) {
                    this.setKeyTableDisplayMode(table, 'Dock');
                }
            });
            return;
        }

        KEY_TABLE_NAMES.forEach((table) => {
            this.keyTablesController.setDocked(
                table,
                this.getKeyTableDisplayMode(table) === 'Dock' && this.keyTableHasSelectedVariable(table)
            );
        });
    }

    private getOpenDashboardEntries(): DashboardOpenEntry[] {
        const componentMap = (this._goldenLayoutHostComponent as any)?._componentRefMap as Map<any, any> | undefined;

        if (!componentMap) {
            return [];
        }

        return Array.from(componentMap.entries()).map(([container, componentRef]) => ({
            label: this.normalizeDashboardLabel(String(container?.componentType ?? container?.title ?? '')),
            tabTitle: String(container?.title ?? container?.componentType ?? ''),
            componentRef,
        }));
    }

    private syncHomepageTabsFromDashboardLayout(orderedLabels: string[] = [], activeLabel?: string): void {
        const normalizedOrder = orderedLabels.map((label) => this.normalizeDashboardLabel(label));
        const orderIndex = new Map(normalizedOrder.map((label, index) => [label, index]));
        const entries = [...this.getOpenDashboardEntries()].sort((a, b) => {
            const aIndex = orderIndex.get(a.label);
            const bIndex = orderIndex.get(b.label);

            if (aIndex === undefined && bIndex === undefined) {
                return a.label.localeCompare(b.label);
            }

            if (aIndex === undefined) return 1;
            if (bIndex === undefined) return -1;

            return aIndex - bIndex;
        });

        const nextActiveLabel = this.normalizeDashboardLabel(activeLabel ?? normalizedOrder[0] ?? entries[0]?.label ?? '');
        const activeIndex = entries.findIndex((entry) => entry.label === nextActiveLabel);
        const resolvedActiveIndex = activeIndex >= 0 ? activeIndex : 0;

        this.homepageTabs = entries.map((entry, index) => ({
            label: entry.label,
            tabTitle: entry.tabTitle || entry.label,
            isActive: index === resolvedActiveIndex,
            componentRef: entry.componentRef,
            templateRef: null,
        }));

        if (!this.homepageTabs.length) {
            this.activeTabIndex = 0;
            return;
        }

        this.activeTabIndex = resolvedActiveIndex;
        this.commonService.activeTab = this.homepageTabs[resolvedActiveIndex].label;
        this._goldenLayoutHostComponent.focusComponent(this.homepageTabs[resolvedActiveIndex].label);
        this.setActiveTabProperties(resolvedActiveIndex);
    }

    private buildDashboardTabStackLayout(tabLabels: string[]): any {
        return {
            root: {
                type: 'stack',
                activeItemIndex: 0,
                content: tabLabels.map((label) => ({
                    type: 'component',
                    componentType: this.normalizeDashboardLabel(label),
                    title: this.normalizeDashboardLabel(label),
                })),
            },
        };
    }

    private waitForDashboardRestoreSync(expectedComponentCount: number, orderedLabels: string[], activeLabel?: string, attempt: number = 0): void {
        const openEntries = this.getOpenDashboardEntries();

        if (expectedComponentCount === 0 || openEntries.length >= expectedComponentCount || attempt >= 20) {
            this.syncHomepageTabsFromDashboardLayout(orderedLabels, activeLabel);
            this.publishLoadNewData();
            this.cdref.detectChanges();
            this.applyingPendingDashboardRestore = false;
            this.ensureDockedKeyTablesViewOpenIfNeeded();
            return;
        }

        setTimeout(() => {
            this.waitForDashboardRestoreSync(expectedComponentCount, orderedLabels, activeLabel, attempt + 1);
        }, 50);
    }

    private schedulePendingDashboardRestore(attempt: number = 0): void {
        if (!this.commonService.pendingDashboardRestore?.dashboardLayout?.root) {
            return;
        }

        const twoDInstance = this.commonService.visuals.twoD?.cy || (window as any).cytoscapeInstance;
        const twoDReady = !!twoDInstance && !(
            typeof twoDInstance.destroyed === 'function' &&
            twoDInstance.destroyed()
        );
        if (twoDReady || attempt >= 40) {
            this.restorePendingDashboardSession();
            return;
        }

        setTimeout(() => this.schedulePendingDashboardRestore(attempt + 1), 100);
    }

    private restorePendingDashboardSession(): void {
        const pendingRestore = this.commonService.pendingDashboardRestore;

        if (this.applyingPendingDashboardRestore || !pendingRestore?.dashboardLayout?.root) {
            return;
        }

        this.commonService.pendingDashboardRestore = null;
        this.applyingPendingDashboardRestore = true;

        const orderedLabels = (pendingRestore.tabs || [])
            .map((tab) => this.normalizeDashboardLabel(tab.label))
            .filter((label) => label !== 'Files');
        const activeLabel = pendingRestore.tabs?.find((tab) => tab.isActive)?.label;
        const layoutToLoad = pendingRestore.dashboardLayout?.root
            ? pendingRestore.dashboardLayout
            : this.buildDashboardTabStackLayout(orderedLabels);
        const expectedComponentCount = this.getDashboardLayoutComponentCount(layoutToLoad?.root);

        try {
            this.restoreDashboardKeyTablesState(pendingRestore, layoutToLoad);
            this._goldenLayoutHostComponent.goldenLayout.loadLayout(layoutToLoad);
        } catch (error) {
            console.error('Unable to restore the saved dashboard layout.', error);
            this.applyingPendingDashboardRestore = false;
            return;
        }

        setTimeout(() => {
            this.waitForDashboardRestoreSync(expectedComponentCount, orderedLabels, activeLabel);
        }, 0);
    }

    private getSerializableDashboardLayout(): any | undefined {
        const savedLayout = this._goldenLayoutHostComponent?.goldenLayout?.saveLayout?.();
        const componentCount = this.getOpenDashboardEntries()
            .filter((entry) => entry.label !== 'Files')
            .length;

        if (!savedLayout?.root || componentCount <= 1) {
            return undefined;
        }

        return this.commonService.normalizeDashboardLayout(savedLayout) ?? undefined;
    }

    private getSerializableDashboardState(): any | undefined {
        const dockedTables = KEY_TABLE_NAMES.reduce((state, table) => {
            state[table] = this.keyTablesController.isDocked(table);
            return state;
        }, {} as Record<string, boolean>);

        if (!KEY_TABLE_NAMES.some((table) => dockedTables[table])) {
            return undefined;
        }

        return {
            keyTables: {
                dockedTables
            }
        };
    }

    /**
     * Performs the export of the visualization, including tables.
     */
    private getGlobalTableElement(table: 'node-color' | 'link-color' | 'node-shape'): HTMLTableElement | undefined {
        if (this.isKeyTableDocked(table)) {
            const dockedTableSelector = table === 'node-color'
                ? '#key-tables-node-table'
                : table === 'link-color'
                    ? '#key-tables-link-table'
                    : '#key-tables-node-shape-table';
            const dockedTable = $(dockedTableSelector)[0] as HTMLTableElement | undefined;
            if (dockedTable) {
                return dockedTable;
            }
        }

        const floatingTable = table === 'node-color'
            ? document.querySelector('#node-color-table')
            : table === 'link-color'
                ? document.querySelector('#link-color-table')
                : document.querySelector('#node-shape-table');

        return floatingTable as HTMLTableElement | undefined;
    }

    private getGlobalTablesForExport(
        exportNodeTable: boolean = false,
        exportLinkTable: boolean = false,
        exportNodeShapeTable: boolean = false
    ): HTMLTableElement[] {
        const tablesToExport: HTMLTableElement[] = [];

        if (exportNodeTable
            && this.commonService.session.style.widgets['node-color-variable'] !== 'None'
            && this.getKeyTableDisplayMode('node-color') !== 'Hide') {
            const nodeColorTable = this.getGlobalTableElement('node-color');
            if (nodeColorTable) {
                tablesToExport.push(nodeColorTable);
            }
        }

        if (exportLinkTable
            && this.commonService.session.style.widgets['link-color-variable'] !== 'None'
            && this.getKeyTableDisplayMode('link-color') !== 'Hide') {
            const linkColorTable = this.getGlobalTableElement('link-color');
            if (linkColorTable) {
                tablesToExport.push(linkColorTable);
            }
        }

        if (exportNodeShapeTable
            && this.commonService.session.style.widgets['node-symbol-variable'] !== 'None'
            && this.getKeyTableDisplayMode('node-shape') !== 'Hide') {
            const nodeShapeTable = this.getGlobalTableElement('node-shape');
            if (nodeShapeTable) {
                tablesToExport.push(nodeShapeTable);
            }
        }

        return tablesToExport;
    }

    private getPolygonColorTableElementForExport(): HTMLTableElement | undefined {
        return this.commonService.visuals.twoD?.getPolygonColorTableElementForExport?.()
            ?? (document.querySelector('#polygon-color-table') as HTMLTableElement | undefined);
    }

    private async performExport(
        elementsForExport: HTMLElement[] = [this.visualWrapperRef.nativeElement],
        exportNodeTable: boolean = false,
        exportLinkTable: boolean = false,
        exportNodeShapeTable: boolean = false
    ): Promise<void> {
        if (!elementsForExport[0] && !exportNodeTable && !exportLinkTable && !exportNodeShapeTable) {
            console.error('Visual wrapper container not found');
            return;
        }
    
        try {
            // Retrieve export options from the service
            const options: ExportOptions = this.exportService.getExportOptions();
            let settings = {
                scale: Number(options.scale) || 1,
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
            const globalTablesForExport = this.getGlobalTablesForExport(exportNodeTable, exportLinkTable, exportNodeShapeTable);
            elementsForExport.splice(pos, 0, ...globalTablesForExport);
            if (elementsForExport.length === 0) {
                console.error('No export elements found');
                return;
            }

            const canvasArray = await Promise.all(
                elementsForExport.map((input) => { 
                    // As of July 2025, a change in Chrome (and other browsers) slowed down this export dramatically (2+ mins for single image), a temp change is to
                    // update html2canvas.js (line 5626) file in node_modules as described here: https://github.com/niklasvh/html2canvas/pull/3252/commits/37b75f50d2550acf7d90630acdc29d346282d0a4;
                    // this is a temp fix, if unresolved (by html2canvas) consider switching to snapdom
                    return html2canvas(input, settings);
                })
            );

            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            if (!context) {
                console.error('Unable to create export canvas context.');
                return;
            }

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

            const filetype = options.filetype.toLowerCase();
            const filename = options.filename || 'network_export';
            let mimeType = '';
            let quality: number | undefined;
    
            if (filetype === 'png') {
                mimeType = 'image/png';
            } else if (filetype === 'jpeg' || filetype === 'jpg') {
                mimeType = 'image/jpeg';
                quality = options.quality || 0.92;
            } else if (filetype === 'webp') {
                mimeType = 'image/webp';
                quality = options.quality || 0.92;
            } else {
                console.error('Unsupported file type:', filetype);
                return;
            }

            const blob = await new Promise<Blob | null>((resolve) => {
                canvas.toBlob((createdBlob) => resolve(createdBlob), mimeType, quality);
            });
            if (!blob) {
                console.error('Unable to create export blob.');
                return;
            }

            this.saveGeneratedFile(blob, `${filename}.${filetype}`);
    
            console.log('Export completed successfully.');
        } catch (error) {
            console.error('Error during export:', error);
        }
    }

    private async performExportSVG(
        elementsForExport: HTMLTableElement[],
        mainSVGString: string,
        exportNodeTable: boolean = false,
        exportLinkTable: boolean = false,
        exportNodeShapeTable: boolean = false
    ): Promise<void> {
        console.log('Exporting SVG');
        const hasMainVisual = mainSVGString !== '';
        if (mainSVGString == '') {
            mainSVGString = '<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"></svg>'
        }

        const globalTablesForExport = this.getGlobalTablesForExport(exportNodeTable, exportLinkTable, exportNodeShapeTable);
        elementsForExport.unshift(...globalTablesForExport);
        if (elementsForExport.length === 0 && !hasMainVisual) {
            console.error('No table elements found for SVG export');
            return;
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
            const closingSvgIndex = mainSVG.lastIndexOf('</svg>');
            if (closingSvgIndex >= 0) {
                combinedSvgString =
                    mainSVG.slice(0, closingSvgIndex)
                    + tableSVGStrings
                    + mainSVG.slice(closingSvgIndex);
            } else {
                combinedSvgString = mainSVG + tableSVGStrings;
            }
        }

        let blob = new Blob([combinedSvgString], { type: 'image/svg+xml;charset=utf-8' });
        
        this.saveGeneratedFile(blob, `${options.filename}.svg`);
    }

    /**
     * Removes a component from this.homepageTabs
     * @param component name of the component to be removed
     */
    public removeComponent( component: string, preserveKeyTableDisplayMode: boolean = false ) {
        if (component === KeyTablesComponent.componentTypeName) {
            if (!preserveKeyTableDisplayMode && !this.applyingPendingDashboardRestore) {
                KEY_TABLE_NAMES.forEach(table => {
                    if (this.getKeyTableDisplayMode(table) === 'Dock') {
                        this.setKeyTableDisplayMode(table, 'Hide');
                    }
                });
                this.keyTablesController.clearDocking();
                this.commonService.visuals.twoD?.handleKeyTablesViewClosed();
                setTimeout(() => this.syncFloatingKeyTableDialogs());
            }
        }

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
    private getSearchNodeId(node: any): string | undefined {
        if (node?._id === undefined || node?._id === null) {
            return undefined;
        }

        return String(node._id);
    }

    private syncFilteredNodeSelectionFromSearch(): void {
        const selectedById = new Map<string, boolean>();
        (this.commonService.session.data.nodes || []).forEach((node: any) => {
            const nodeId = this.getSearchNodeId(node);
            if (nodeId !== undefined) {
                selectedById.set(nodeId, node.selected === true);
            }
        });

        (this.commonService.session.data.nodeFilteredValues || []).forEach((node: any) => {
            const nodeId = this.getSearchNodeId(node);
            if (nodeId !== undefined && selectedById.has(nodeId)) {
                node.selected = selectedById.get(nodeId);
            }
        });
    }

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

            that.syncFilteredNodeSelectionFromSearch();
            $(document).trigger("node-selected");

          });
  
          // selects that meets current search criteria
          for(let i = 0; i < n; i++){
            const node = nodes[i];
            let nodeSelected = false;
  
            if (typeof node[field] == "string") {
              nodeSelected = vre.test(node[field]);
            }
            if (typeof node[field] == "number") {
              nodeSelected = (node[field] + "" == val);
            }

            node.selected = nodeSelected;
            
          }
  
          if (!nodes.some(node => node.selected)) console.log('no matches');
        }

        this.syncFilteredNodeSelectionFromSearch();
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
        this.commonService.session.network.launched = false;
        if(this.commonService.debugMode) {
            console.log("Trying to prepare files");
        }
        // this.commonService.resetData();

        this.commonService.beginDataLoad();
        this.commonService.session.network.initialLoad = true;
        this.store.setFP_removeFiles(true);
        this.commonService.session.files = [];
        if (!this.commonService.session.style.widgets) {
            this.commonService.session.style.widgets = this.commonService.defaultWidgets();
        }
        this.resetKeyTablesForNewDataset();

        if(this.commonService.debugMode) {
          console.log('threshold: ', this.commonService.session.style.widgets['link-threshold']);
        }
        // this.loadSettings();
 
        // this.homepageTabs[1].isActive = false;
        this.homepageTabs[0].isActive = true;
        this.dismissWelcomeOverlay();
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
            this.threshold = "16";
            this.commonService.session.style.widgets["link-threshold"] = 16;
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
        const newThreshold = ev?.target?.value ?? ev;

        // Clearing the numeric input emits null through ngModelChange before the
        // next keystroke arrives. Ignore that transient state instead of
        // throwing or forcing the threshold to an invalid value mid-edit.
        if (newThreshold === null || newThreshold === undefined || newThreshold === '') {
            return;
        }

        const parsedThreshold = Number(newThreshold);
        if (Number.isNaN(parsedThreshold)) {
            return;
        }

        const thresholdField =
            this.SelectedLinkSortVariable ||
            this.commonService.session.style.widgets['link-sort-variable'] ||
            'distance';

        const rawThreshold = this.commonService.fromDisplayedDistanceValue(
            parsedThreshold,
            thresholdField
        );

        const formattedThreshold = String(rawThreshold);

        this.threshold = formattedThreshold;

        if(this.commonService.debugMode) {
            console.log('threshold: ', this.threshold);
        }
        
        // Update UI immediately
        this.SelectedLinkThresholdVariable = formattedThreshold;
        this.commonService.GlobalSettingsModel.SelectedLinkThresholdVariable = this.SelectedLinkThresholdVariable;
        
        // Emit the new threshold value to the debouncer for actual threshold change
        this.thresholdDebouncer.next(rawThreshold);
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
        this.dismissWelcomeOverlay();
    }

    /**
     * Updates background widgets, applies the 2D canvas color immediately,
     * and republishes visualization updates so active views restyle in place.
     */
    onBackgroundChanged() {
        const contrast = this.commonService.contrastColor(this.SelectedBackgroundColorVariable);

        this.commonService.session.style.widgets['background-color'] = this.SelectedBackgroundColorVariable;
        this.commonService.session.style.widgets['background-color-contrast'] = contrast;

        if ($('#cy') != undefined) {
            $('#cy').css('background-color', this.SelectedBackgroundColorVariable);
        }

        this.publishUpdateVisualization();
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
        this.refreshThresholdStabilityPanel();
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
        } else {
            this.refreshThresholdStabilityPanel();
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
            this.onColorLinksByChanged();
        }

        if (this.SelectedBackgroundColorVariable != this.widgets['background-color']){
            this.SelectedBackgroundColorVariable = this.widgets['background-color'];
            this.onBackgroundChanged();
        }

        if (this.widgets['node-color-variable'] && this.widgets['node-color-variable'] !== 'None') {
            this.setKeyTableDisplayMode('node-color', this.getKeyTableDisplayMode('node-color'));
            this.applyKeyTableDisplayMode('node-color', true);
        }
        // Show Link Color Table if link-color-variable != 'None'
        if (this.widgets['link-color-variable'] && this.widgets['link-color-variable'] !== 'None') {
            this.setKeyTableDisplayMode('link-color', this.getKeyTableDisplayMode('link-color'));
            this.applyKeyTableDisplayMode('link-color', true);
        }

        this.applySavedNodeShapeSettingsFromSession();
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

    public openNodeCollapseShapeConfirmation(accept: () => void, reject?: () => void): void {
        this.confirmationService.confirm({
            message: `All collapsed nodes will be displayed as circles. Custom node shapes are not preserved while nodes are collapsed.
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
            accept,
            reject,
        });
    }

    openNetworkImportWarnings(warnings: string[]) {
        if (!warnings.length) {
            return;
        }

        this.confirmationService.confirm({
            header: 'Network Import Warnings',
            message: `Some Network file features are not supported by MicrobeTrace and were ignored or imported as data fields.

${warnings.join('\n')}`,
            closable: false,
            closeOnEscape: false,
            icon: 'pi pi-exclamation-triangle',
            rejectVisible: false,
            acceptButtonProps: {
                label: 'Confirm',
            },
        });
    }

    openGraphMLImportWarnings(warnings: string[]) {
        this.openNetworkImportWarnings(warnings);
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
    this.setKeyTableDisplayMode('link-color', this.normalizeKeyTableDisplayMode(this.SelectedLinkColorTableTypesVariable));
    this.applyKeyTableDisplayMode('link-color', silent);
  }

    /**
     * Updates this.commonService.GlobalSettingsModel.SelectedNodeColorTableTypesVariable and 
     * applies the selected node color table display mode.
     */
    onNodeColorTableChanged(silent: boolean = false) {
        if(this.commonService.debugMode) {
            console.log('node color changed: ', this.SelectedNodeColorTableTypesVariable);
        }
        this.setKeyTableDisplayMode('node-color', this.normalizeKeyTableDisplayMode(this.SelectedNodeColorTableTypesVariable));
        this.applyKeyTableDisplayMode('node-color', silent);
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

    publishUpdateNodeShapes() {
        console.log('publishUpdateNodeShapes called')
        this.homepageTabs.forEach(tab => {
            const componentInstance = tab.componentRef?.instance;
            if (!componentInstance) {
                return;
            }

            if (componentInstance.updateNodeShapes) {
                componentInstance.updateNodeShapes();
            } else if (componentInstance.updateVisualization) {
                componentInstance.updateVisualization();
            }
        });
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

    private publishDistanceDisplayFormatChanged(): void {
        const componentRefs = new Set<ComponentRef<any>>();

        this.homepageTabs.forEach(tab => {
            if (tab.componentRef) {
                componentRefs.add(tab.componentRef);
            }
        });

        const componentMap = (this._goldenLayoutHostComponent as any)?._componentRefMap as Map<any, ComponentRef<any>> | undefined;
        componentMap?.forEach(componentRef => componentRefs.add(componentRef));

        componentRefs.forEach(componentRef => {
            const refreshDistanceDisplayFormat = componentRef.instance?.refreshDistanceDisplayFormat;
            if (refreshDistanceDisplayFormat) {
                refreshDistanceDisplayFormat.call(componentRef.instance);
            }
        });
    }

    publishUpdateLinkColor() {
        this.homepageTabs.forEach(tab => {
            if (tab.componentRef &&
                tab.componentRef.instance.updateLinkColor) {
                    tab.componentRef.instance.updateLinkColor();
            }
        })
    }

    private refreshVisibleColorTables(): void {
        if (this.GlobalSettingsNodeColorDialogSettings?.isVisible && this.SelectedColorNodesByVariable !== 'None') {
            this.generateNodeColorTable('#node-color-table');
        }

        if (this.GlobalSettingsLinkColorDialogSettings?.isVisible && this.SelectedColorLinksByVariable !== 'None') {
            this.generateNodeLinkTable('#link-color-table');
        }

        if (this.GlobalSettingsNodeShapeDialogSettings?.isVisible && this.SelectedNodeSymbolVariable !== 'None') {
            this.generateNodeShapeSelectionTable(this.SelectedNodeSymbolVariable);
        }

        this.refreshKeyTablesView();
    }

    private refreshTimelineSensitiveTables(): void {
        this.refreshVisibleColorTables();

        const tableComp = this.commonService.visuals.tableComp;
        if (tableComp?.viewActive && tableComp.dataSetViewSelected == 'Link') {
            tableComp.onFilterDataChange();
        }
    }

    private scheduleTimelineTablesRefresh(): void {
        if (this.timelineTablesRefreshHandle !== null) {
            return;
        }

        this.timelineTablesRefreshHandle = setTimeout(() => {
            this.timelineTablesRefreshHandle = null;
            this.refreshTimelineSensitiveTables();
        }, 0);
    }

    mapPreviousShapeNameToCurrent(name: string): string {
        return resolveNodeShapeKey(name);
    }

    private sortNodeShapeAggregates(): void {
        if (this.shapeSort.key === 'key') {
            this.shapeAggregates.sort((a, b) => {
                const aKey = a.key === 'null' ? '(Empty)' : a.key.toString();
                const bKey = b.key === 'null' ? '(Empty)' : b.key.toString();
                return this.shapeSort.assending ? bKey.localeCompare(aKey) : aKey.localeCompare(bKey);
            });
            return;
        }

        this.shapeAggregates.sort((a, b) => {
            const delta = Number(a[this.shapeSort.key]) - Number(b[this.shapeSort.key]);
            return this.shapeSort.assending ? -delta : delta;
        });
    }

    get nodeShapeRows(): StyleKeyTableRow[] {
        return this.shapeAggregates.map(group => ({
            rawValue: group.rawValue,
            trackKey: `node-shape-${String(group.rawValue)}`,
            displayName: this.getNodeValueDisplayName(group.rawValue),
            count: group.count,
            frequency: group.frequency,
            shapeSelection: this.getNodeShapeTableValue(group.rawValue),
            shapeKey: this.commonService.temp.style.nodeSymbolMap?.(group.rawValue) ?? null
        }));
    }

    private getNodeValueNameMap(): Record<string, string> {
        const style = this.commonService.session.style;
        if (!style.nodeValueNames || typeof style.nodeValueNames !== 'object') {
            style.nodeValueNames = {};
        }

        return style.nodeValueNames;
    }

    public getNodeValueDisplayName(rawValue: any): string {
        const key = String(rawValue);
        const nodeValueNames = this.getNodeValueNameMap();
        return Object.prototype.hasOwnProperty.call(nodeValueNames, key)
            ? nodeValueNames[key]
            : this.commonService.titleize(key);
    }

    public setNodeValueDisplayName(rawValue: any, displayName: any): void {
        if (rawValue === undefined) {
            return;
        }

        const key = String(rawValue);
        const nextDisplayName = String(displayName ?? '');
        this.getNodeValueNameMap()[key] = nextDisplayName;
        this.syncNodeValueDisplayNameCell(key, nextDisplayName);
        this.cdref.markForCheck();
    }

    private syncNodeValueDisplayNameCell(rawValue: string, displayName: string, root?: ParentNode): void {
        const tableIds = new Set([
            'node-color-table',
            'key-tables-node-table',
            'node-shape-table',
            'key-tables-node-shape-table'
        ]);
        const scope = root ?? document;

        scope.querySelectorAll<HTMLElement>('td[data-value]').forEach(cell => {
            if (String(cell.getAttribute('data-value')) !== rawValue) {
                return;
            }

            const table = cell.closest('table');
            if (!tableIds.has(String(table?.id))) {
                return;
            }

            cell.textContent = displayName;
        });
    }

    public syncNodeValueDisplayNameCells(root?: ParentNode): void {
        Object.entries(this.getNodeValueNameMap()).forEach(([rawValue, displayName]) => {
            this.syncNodeValueDisplayNameCell(rawValue, displayName, root);
        });
    }

    public onNodeShapeNameBlur(event: FocusEvent, rawValue: any): void {
        const cell = event.currentTarget as HTMLElement | null;
        if (!cell) {
            return;
        }

        this.setNodeValueDisplayName(rawValue, cell.textContent ?? '');
    }

    private getKeyTableColumnNameMap(): Record<string, string> {
        const style = this.commonService.session.style as typeof this.commonService.session.style & {
            keyTableColumnNames?: Record<string, string>;
        };
        if (!style.keyTableColumnNames || typeof style.keyTableColumnNames !== 'object') {
            style.keyTableColumnNames = {};
        }

        return style.keyTableColumnNames;
    }

    private getKeyTableColumnNameKey(table: string, column: string): string {
        return `${table}.${column}`;
    }

    public getKeyTableColumnDisplayName(table: string, column: string, fallback: string): string {
        const keyTableColumnNames = this.getKeyTableColumnNameMap();
        const key = this.getKeyTableColumnNameKey(table, column);
        return Object.prototype.hasOwnProperty.call(keyTableColumnNames, key)
            ? keyTableColumnNames[key]
            : fallback;
    }

    public setKeyTableColumnDisplayName(table: string, column: string, displayName: any): void {
        const nextDisplayName = String(displayName ?? '');
        this.getKeyTableColumnNameMap()[this.getKeyTableColumnNameKey(table, column)] = nextDisplayName;
        this.syncKeyTableColumnNameCell(table, column, nextDisplayName);
        this.cdref.markForCheck();
    }

    private syncKeyTableColumnNameCell(table: string, column: string, displayName: string, root?: ParentNode): void {
        const scope = root ?? document;

        scope.querySelectorAll<HTMLElement>('[data-table-key][data-column-key]').forEach(cell => {
            if (cell.getAttribute('data-table-key') !== table || cell.getAttribute('data-column-key') !== column) {
                return;
            }

            cell.textContent = displayName;
        });
    }

    public syncKeyTableColumnNameCells(root?: ParentNode): void {
        Object.entries(this.getKeyTableColumnNameMap()).forEach(([key, displayName]) => {
            const separatorIndex = key.lastIndexOf('.');
            if (separatorIndex <= 0) {
                return;
            }

            this.syncKeyTableColumnNameCell(
                key.slice(0, separatorIndex),
                key.slice(separatorIndex + 1),
                displayName,
                root
            );
        });
    }

    public onKeyTableColumnNameBlur(event: FocusEvent, table: string, column: string): void {
        const cell = event.currentTarget as HTMLElement | null;
        if (!cell) {
            return;
        }

        this.setKeyTableColumnDisplayName(table, column, cell.textContent ?? '');
    }

    private getDefaultNodeShape(): string {
        return this.mapPreviousShapeNameToCurrent(this.commonService.session.style.widgets['node-symbol'] ?? 'ellipse');
    }

    private getBaseNodeShapes(): string[] {
        const style = this.commonService.session.style;
        const fallbackShape = this.getDefaultNodeShape();
        const baseNodeShapes = Array.isArray(style.nodeSymbols) && style.nodeSymbols.length > 0
            ? style.nodeSymbols.map(shape => this.mapPreviousShapeNameToCurrent(shape))
            : [fallbackShape];
        style.nodeSymbols = baseNodeShapes;
        return baseNodeShapes;
    }

    private normalizeNodeShapeState(variable: string): string[] {
        const style = this.commonService.session.style;
        const baseNodeShapes = this.getBaseNodeShapes();
        if (!variable || variable === 'None') {
            return baseNodeShapes;
        }

        const rawSymbols = Array.isArray(style.nodeSymbolsTable[variable]) ? style.nodeSymbolsTable[variable] : [];
        const normalizedSymbols = rawSymbols.map(shape => this.mapPreviousShapeNameToCurrent(shape));
        style.nodeSymbolsTable[variable] = normalizedSymbols;
        return normalizedSymbols;
    }

    private findNodeShapeValueIndex(values: any[], targetValue: any): number {
        return values.findIndex(value => value === targetValue || `${value}` === `${targetValue}`);
    }

    private resolveNodeShapeAssignment(previousKeys: any[], previousSymbols: string[], targetValue: any): string | undefined {
        const valueIndex = this.findNodeShapeValueIndex(previousKeys, targetValue);
        if (valueIndex === -1) {
            return undefined;
        }

        return previousSymbols[valueIndex];
    }

    public generateNodeShapeSelectionTable(variable: string): void {
        const widgets = this.commonService.session.style.widgets;
        this.SelectedNodeSymbolVariable = variable ?? 'None';
        this.commonService.GlobalSettingsModel.SelectedNodeSymbolVariable = this.SelectedNodeSymbolVariable;
        widgets['node-symbol-variable'] = this.SelectedNodeSymbolVariable;
        variable = this.SelectedNodeSymbolVariable;

        if (variable === 'None') {
            this.shapeAggregates = [];
            this.cdref.markForCheck();
            return;
        }

        const style = this.commonService.session.style;
        const values = [...(style.nodeSymbolsTableKeys[variable] ?? [])];
        const previousKeys = [...values];
        const aggregateMap = new Map<any, number>();
        let visibleNodeCount = 0;

        for (const node of this.commonService.session.data.nodes) {
            if (!node || typeof node !== 'object' || !node.visible) {
                continue;
            }

            visibleNodeCount++;

            const groupValue = node[variable];
            if (groupValue === undefined) {
                continue;
            }

            if (this.findNodeShapeValueIndex(values, groupValue) === -1) {
                values.push(groupValue);
            }

            aggregateMap.set(groupValue, (aggregateMap.get(groupValue) ?? 0) + 1);
        }

        const baseNodeShapes = this.getBaseNodeShapes();
        const previousSymbols = this.normalizeNodeShapeState(variable);

        values.sort((a, b) => (aggregateMap.get(b) ?? 0) - (aggregateMap.get(a) ?? 0));

        const symbols = values.map((value, index) => (
            this.resolveNodeShapeAssignment(previousKeys, previousSymbols, value)
            ?? baseNodeShapes[index % baseNodeShapes.length]
            ?? this.getDefaultNodeShape()
        ));

        style.nodeSymbolsTable[variable] = symbols;
        style.nodeSymbolsTableKeys[variable] = values;
        this.commonService.temp.style.nodeSymbolMap = d3.scaleOrdinal(symbols).domain(values);

        this.shapeAggregates = Array.from(aggregateMap.entries()).map(([key, count]) => ({
            key: `${key}`,
            rawValue: key,
            count,
            frequency: visibleNodeCount > 0 ? parseFloat((count / visibleNodeCount).toFixed(3)) : 0
        }));
        this.sortNodeShapeAggregates();
        this.cdref.markForCheck();
    }

    onNodeShapeSort(sortBy: string) {
        if (sortBy === this.shapeSort.key) {
            this.shapeSort.assending = !this.shapeSort.assending;
        } else {
            this.shapeSort.key = sortBy;
            this.shapeSort.assending = true;
        }

        this.sortNodeShapeAggregates();
        this.cdref.markForCheck();
    }

    onNodeShapeTableChange(newShape: string, group: any, silent: boolean = false) {
        const variable = this.commonService.session.style.widgets['node-symbol-variable'] ?? this.SelectedNodeSymbolVariable;
        if (!variable || variable === 'None') {
            return;
        }

        this.SelectedNodeSymbolVariable = variable;

        const normalizedShape = this.mapPreviousShapeNameToCurrent(newShape);
        let symbols = this.normalizeNodeShapeState(variable);
        const values = this.commonService.session.style.nodeSymbolsTableKeys[variable] ?? [];
        const groupIndex = values.findIndex(value => value === group || `${value}` === `${group}`);
        if (groupIndex === -1) {
            return;
        }

        if (groupIndex >= symbols.length) {
            const padding = Array.from({ length: groupIndex - symbols.length + 1 }, () => normalizedShape);
            symbols = symbols.concat(padding);
        }

        symbols[groupIndex] = normalizedShape;
        this.commonService.session.style.nodeSymbolsTable[variable] = symbols;
        this.commonService.temp.style.nodeSymbolMap = d3.scaleOrdinal(symbols).domain(values);

        if (!silent) {
            this.publishUpdateNodeShapes();
        }

        this.refreshKeyTablesView();
        this.cdref.markForCheck();
    }

    onShapeTreeShow(shapeKey: string | null | undefined) {
        this.resetShapeTreeExpansion(shapeKey);
    }

    getNodeShapeTreeSelection(shapeKey: string | null | undefined): TreeNode<NodeShapeOption> | null {
        if (!shapeKey) {
            return null;
        }

        return this.symbolMappingTreeLookup.get(this.mapPreviousShapeNameToCurrent(shapeKey)) ?? null;
    }

    getNodeShapeTableValue(group: any): TreeNode<NodeShapeOption> | null {
        const shapeKey = this.commonService.temp.style.nodeSymbolMap?.(group);
        return this.getNodeShapeTreeSelection(shapeKey);
    }

    getSelectedNodeShapeTreeSelection(): TreeNode<NodeShapeOption> | null {
        return this.getNodeShapeTreeSelection(this.getDefaultNodeShape());
    }

    getSelectedNodeShapeValue(): string {
        return this.getDefaultNodeShape();
    }

    onNodeShapeTreeChange(selectedNode: TreeNode<NodeShapeOption> | null, silent: boolean = false) {
        if (!selectedNode?.data?.key) {
            return;
        }

        const normalizedShape = this.mapPreviousShapeNameToCurrent(selectedNode.data.key);
        this.commonService.session.style.widgets['node-symbol'] = normalizedShape;
        if (this.SelectedNodeSymbolVariable === 'None') {
            this.commonService.temp.style.nodeSymbolMap = () => normalizedShape;
        }

        if (!silent) {
            this.publishUpdateNodeShapes();
        }

        this.refreshKeyTablesView();
        this.cdref.markForCheck();
    }

    onNodeShapeTableTreeChange(selectedNode: TreeNode<NodeShapeOption> | null, group: any) {
        if (!selectedNode?.data?.key) {
            return;
        }

        this.onNodeShapeTableChange(selectedNode.data.key, group);
    }

    private resetShapeTreeExpansion(shapeKey: string | null | undefined) {
        const expandedGroupKey = this.resolveExpandedShapeTreeGroup(shapeKey);
        for (const groupNode of this.symbolMappingTree) {
            groupNode.expanded = groupNode.key === expandedGroupKey;
        }
    }

    private resolveExpandedShapeTreeGroup(shapeKey: string | null | undefined): NodeShapeGroupKey {
        if (!shapeKey) {
            return this.defaultShapePickerExpandedGroup;
        }

        return this.symbolMappingGroupLookup.get(this.mapPreviousShapeNameToCurrent(shapeKey)) ?? this.defaultShapePickerExpandedGroup;
    }

    private normalizeNodeSymbolVariable(value: any): string {
        if (value === null || value === undefined) {
            return 'None';
        }

        const normalizedValue = String(value).trim();
        if (!normalizedValue || normalizedValue.toLowerCase() === 'none') {
            return 'None';
        }

        return normalizedValue;
    }

    private syncNodeShapeTableStateWithSelection(source: 'component' | 'session' = 'component'): void {
        const widgets = this.commonService.session.style.widgets;
        const selectedNodeSymbol = source === 'session'
            ? widgets['node-symbol-variable'] ?? this.SelectedNodeSymbolVariable
            : this.SelectedNodeSymbolVariable ?? widgets['node-symbol-variable'];

        this.SelectedNodeSymbolVariable = this.normalizeNodeSymbolVariable(
            selectedNodeSymbol
        );
        this.commonService.GlobalSettingsModel.SelectedNodeSymbolVariable = this.SelectedNodeSymbolVariable;
        widgets['node-symbol-variable'] = this.SelectedNodeSymbolVariable;
        if (source === 'session') {
            this.setKeyTableDisplayMode(
                'node-shape',
                this.normalizeKeyTableDisplayMode(widgets['node-symbol-table-visible'] ?? this.SelectedNodeShapeTableTypesVariable ?? 'Dock')
            );
        }

        if (this.SelectedNodeSymbolVariable === 'None') {
            this.applyKeyTableDisplayMode('node-shape', true);
            this.GlobalSettingsNodeShapeDialogSettings?.setVisibility(false);
            this.exportTables['node-symbol'] = false;
        }
    }

    private applySavedNodeShapeSettingsFromSession(): void {
        const widgets = this.commonService.session.style.widgets;
        this.SelectedNodeSymbolVariable = widgets['node-symbol-variable'] ?? 'None';
        this.setKeyTableDisplayMode('node-shape', this.normalizeKeyTableDisplayMode(widgets['node-symbol-table-visible'] ?? 'Dock'));
        this.onNodeShapeByChanged(true, false, undefined, 'session');
    }

    onNodeShapeByChanged(silent: boolean = false, setVisibility: boolean = true, selectedVariable?: string, source: 'component' | 'session' = 'component') {
        const widgets = this.commonService.session.style.widgets;
        if (selectedVariable !== undefined) {
            this.SelectedNodeSymbolVariable = selectedVariable;
            source = 'component';
        }

        this.SelectedNodeSymbolVariable = this.normalizeNodeSymbolVariable(
            this.SelectedNodeSymbolVariable ?? widgets['node-symbol-variable']
        );
        this.syncNodeShapeTableStateWithSelection(source);

        if (this.SelectedNodeSymbolVariable === 'None') {
            this.shapeAggregates = [];
            this.commonService.temp.style.nodeSymbolMap = () => this.getDefaultNodeShape();
            this.onNodeShapeTableVisibilityChanged(true);

            if (!silent) {
                this.publishUpdateNodeShapes();
            }

            this.refreshKeyTablesView();
            this.cdref.markForCheck();
            return;
        }

        this.generateNodeShapeSelectionTable(this.SelectedNodeSymbolVariable);

        if (setVisibility) {
            this.applyKeyTableDisplayMode('node-shape', true);
        } else {
            this.setKeyTableDisplayMode(
                'node-shape',
                this.normalizeKeyTableDisplayMode(widgets['node-symbol-table-visible'] ?? this.SelectedNodeShapeTableTypesVariable ?? 'Dock')
            );
            this.applyKeyTableDisplayMode('node-shape', true);
        }

        this.onNodeShapeTableVisibilityChanged(true);

        if (!silent) {
            this.publishUpdateNodeShapes();
        }

        this.refreshKeyTablesView();
        this.cdref.markForCheck();
    }

    public resetNodeShapeSelectionForNewDataset(): void {
        this.commonService.session.style.nodeSymbolsTable = {};
        this.commonService.session.style.nodeSymbolsTableKeys = {};
        this.onNodeShapeByChanged(true, false, 'None');
    }

    public resetKeyTablesForNewDataset(): void {
        if (!this.commonService.session.style.widgets) {
            this.commonService.session.style.widgets = this.commonService.defaultWidgets();
        }

        const widgets = this.commonService.session.style.widgets;

        this.SelectedColorNodesByVariable = 'None';
        this.SelectedColorLinksByVariable = 'origin';
        this.SelectedNodeSymbolVariable = 'None';

        this.commonService.GlobalSettingsModel.SelectedColorNodesByVariable = 'None';
        this.commonService.GlobalSettingsModel.SelectedColorLinksByVariable = 'origin';
        this.commonService.GlobalSettingsModel.SelectedNodeSymbolVariable = 'None';

        widgets['node-color-variable'] = 'None';
        widgets['link-color-variable'] = 'origin';
        widgets['node-symbol-variable'] = 'None';

        this.commonService.session.style.nodeColorsTable = {};
        this.commonService.session.style.nodeColorsTableKeys = {};
        this.commonService.session.style.linkColorsTable = {};
        this.commonService.session.style.linkColorsTableKeys = {};
        this.commonService.session.style.nodeSymbolsTable = {};
        this.commonService.session.style.nodeSymbolsTableKeys = {};

        KEY_TABLE_NAMES.forEach(table => {
            this.setKeyTableDisplayMode(table, 'Dock');
            this.getFloatingKeyTableDialog(table)?.setVisibility(false);
            this.clearFloatingKeyTable(table);
        });

        this.closeKeyTablesView();
        this.keyTablesController.clearDocking();
        this.refreshKeyTablesView();
        this.cdref.markForCheck();
    }

    onNodeShapeTableVisibilityChanged(silent: boolean = false) {
        this.syncNodeShapeTableStateWithSelection();
        this.setKeyTableDisplayMode('node-shape', this.normalizeKeyTableDisplayMode(this.SelectedNodeShapeTableTypesVariable));
        this.applyKeyTableDisplayMode('node-shape', silent);
    }

    showNodeShapeTable() {
        this.syncNodeShapeTableStateWithSelection();
        if (this.SelectedNodeSymbolVariable === 'None') {
            return;
        }

        if (this.isKeyTableDocked('node-shape')) {
            this.GlobalSettingsNodeShapeDialogSettings.setVisibility(false);
            return;
        }
        if (this.SelectedNodeShapeTableTypesVariable !== 'Show') {
            this.setKeyTableDisplayMode('node-shape', 'Show');
            this.onNodeShapeTableVisibilityChanged();
            return;
        }

        if (this.SelectedNodeSymbolVariable !== 'None') {
            this.generateNodeShapeSelectionTable(this.SelectedNodeSymbolVariable);
        }
    }

    hideNodeShapeTable() {
        this.syncNodeShapeTableStateWithSelection();
        if (this.SelectedNodeSymbolVariable === 'None') {
            return;
        }

        if (this.isKeyTableDocked('node-shape')) {
            return;
        }

        if (this.SelectedNodeShapeTableTypesVariable !== 'Hide') {
            this.setKeyTableDisplayMode('node-shape', 'Hide');
            this.onNodeShapeTableVisibilityChanged();
        }
    }

    public onLinkColorChanged(valueOrSilent: string | boolean | Event = false, silent: boolean = false) : void {
        if (typeof valueOrSilent === 'string') {
            this.SelectedLinkColorVariable = valueOrSilent;
        } else if (valueOrSilent instanceof Event) {
            this.SelectedLinkColorVariable = (valueOrSilent.target as HTMLInputElement | null)?.value ?? this.SelectedLinkColorVariable;
        } else {
            silent = valueOrSilent;
        }

        this.commonService.session.style.widgets["link-color"] = this.SelectedLinkColorVariable;
        this.commonService.GlobalSettingsModel.SelectedLinkColorVariable = this.SelectedLinkColorVariable;

        if(!silent) this.publishUpdateLinkColor();

    }


    onColorLinksByChanged(silent: boolean = false) {
        this.commonService.GlobalSettingsModel.SelectedColorLinksByVariable = this.SelectedColorLinksByVariable;
        this.commonService.session.style.widgets['link-color-variable'] = this.SelectedColorLinksByVariable;

        if (this.SelectedColorLinksByVariable === 'None') {
          this.SelectedLinkColorVariable = this.commonService.session.style.widgets["link-color"] || this.SelectedLinkColorVariable;
          this.commonService.GlobalSettingsModel.SelectedLinkColorVariable = this.SelectedLinkColorVariable;
          this.cdref.detectChanges();
        }
    
        this.onLinkColorTableChanged(silent);
        if (this.isKeyTableDocked('link-color')) {
          this.GlobalSettingsLinkColorDialogSettings.setVisibility(false);
          this.linkColorRows = [];
          this.linkColorDomain = [];
          this.refreshKeyTablesView();
        }
        if (!silent) {
          this.publishUpdateLinkColor();
        }
    
      }


    private getDuoLinkSwatchSegments(fallbackOrigins: string[] = []): Array<{ color: string; opacity: number }> {
        const visibleDuoLink = this.commonService.getVisibleLinksForCurrentTimeline().find((link: any) =>
            Array.isArray(link?.origin) && link.origin.length > 1,
        );

        const candidateOrigins = Array.isArray(visibleDuoLink?.origin) && visibleDuoLink.origin.length > 1
            ? visibleDuoLink.origin
            : (
                Array.isArray(this.commonService.session?.style?.widgets?.['link-origin-array-order']) &&
                this.commonService.session.style.widgets['link-origin-array-order'].length > 1
            )
                ? this.commonService.session.style.widgets['link-origin-array-order']
                : fallbackOrigins.filter(origin => origin !== 'Duo-Link');

        this.duoLinkOrigins = candidateOrigins
            .filter((origin: any) => typeof origin === 'string' && origin.length > 0 && origin !== 'Duo-Link')
            .slice(0, 2)
            .map((origin: any) => String(origin));

        while (this.duoLinkOrigins.length < 2) {
            this.duoLinkOrigins.push('');
        }

        return this.duoLinkOrigins.map(origin => ({
            color: origin ? this.commonService.temp.style.linkColorMap(origin) : '#f0f0f0',
            opacity: origin ? this.commonService.temp.style.linkAlphaMap(origin) : 1,
        }));
    }

    generateNodeLinkTable(tableId: string, isEditable: boolean = true) {
        this.linkColorTableEditable = isEditable;
        this.linkColorTableHeaders = {
            value: this.getKeyTableColumnDisplayName('link-color', 'value', 'Link ' + this.commonService.titleize(this.SelectedColorLinksByVariable)),
            count: this.getKeyTableColumnDisplayName('link-color', 'count', 'Count'),
            frequency: this.getKeyTableColumnDisplayName('link-color', 'frequency', 'Frequency')
        };

        if (!this.commonService.session.style.linkValueNames) {
            this.commonService.session.style.linkValueNames = {};
        }

        const aggregates = this.commonService.createLinkColorMap();
        const vlinks = this.commonService.getVisibleLinks();
        const aggregateValues = Object.keys(aggregates);
        this.linkColorDomain = aggregateValues;
        const duoLinkSegments = this.SelectedColorLinksByVariable === 'origin'
            ? this.getDuoLinkSwatchSegments(aggregateValues)
            : [];

        this.linkColorRows = aggregateValues.map((value, i) => {
            const duoLinkRow = value === 'Duo-Link' && this.SelectedColorLinksByVariable === 'origin';
            const hasBlankAggregate = aggregates[value] === 0;
            const aggregateCountText = hasBlankAggregate ? '' : aggregates[value];
            const aggregateFrequencyText = hasBlankAggregate || vlinks.length === 0
                ? ''
                : (aggregates[value] / vlinks.length).toLocaleString();
            const linkValueNames = this.commonService.session.style.linkValueNames;
            const displayName = Object.prototype.hasOwnProperty.call(linkValueNames, value)
                ? linkValueNames[value]
                : this.commonService.titleize(String(value));

            return {
                rawValue: value,
                trackKey: `link-color-${String(value)}`,
                displayName,
                count: aggregateCountText,
                frequency: aggregateFrequencyText,
                color: this.commonService.temp.style.linkColorMap(value),
                alpha: this.commonService.temp.style.linkAlphaMap(value),
                index: i,
                duoSegments: duoLinkRow ? duoLinkSegments : undefined
            };
        });

        this.applyStyleKeyTableSort('link-color');
        $('#linkColorTableSettings').on('mouseleave', () => $('#linkColorTableSettings').delay(500).css('display', 'none'));
        this.cdref.markForCheck();
    }

    private stopTimelinePlayback(paused = false): void {
        clearInterval(this.commonService.session.timeline);
        this.playBtnText = "Play";
        this.timelinePlaybackPaused = paused;
        d3.select("#timeline-play-button").text("Play");
    }

    private parseTimelineDate(value: any): Date | null {
        if (value instanceof Date) {
            return Number.isFinite(value.getTime()) ? value : null;
        }

        if (value == null || value === '') {
            return null;
        }

        const strictDate = moment(String(value), 'YYYY-MM-DD', true);
        if (strictDate.isValid()) {
            return strictDate.toDate();
        }

        const parsed = moment(value);
        return parsed.isValid() ? parsed.toDate() : null;
    }

    private formatTimelineDateInput(date: Date | null): string {
        return date ? moment(date).format('YYYY-MM-DD') : '';
    }

    private clampTimelineDate(date: Date): Date {
        if (!this.timelineDomainStart || !this.timelineDomainEnd) {
            return date;
        }

        const time = date.getTime();
        const min = this.timelineDomainStart.getTime();
        const max = this.timelineDomainEnd.getTime();
        return new Date(Math.min(Math.max(time, min), max));
    }

    private getSelectedTimelineStart(): Date {
        const parsed = this.parseTimelineDate(this.commonService.session.state.timeStart);
        return this.clampTimelineDate(parsed ?? this.timelineDomainStart ?? new Date(0));
    }

    private getSelectedTimelineEnd(): Date {
        const parsedTarget = this.parseTimelineDate(this.commonService.session.state.timeTarget);
        const parsedEnd = this.parseTimelineDate(this.commonService.session.state.timeEnd);
        return this.clampTimelineDate(parsedTarget ?? parsedEnd ?? this.timelineDomainEnd ?? new Date());
    }

    private getActiveTimelineEnd(): Date {
        const parsed = this.parseTimelineDate(this.commonService.session.state.timeEnd);
        const rangeStart = this.getSelectedTimelineStart();
        const rangeEnd = this.getSelectedTimelineEnd();
        const active = this.clampTimelineDate(parsed ?? rangeStart);
        return new Date(Math.min(Math.max(active.getTime(), rangeStart.getTime()), rangeEnd.getTime()));
    }

    private syncTimelineRangeInputs(startDate = this.getSelectedTimelineStart(), endDate = this.getSelectedTimelineEnd()): void {
        this.timelineRangeStartInput = this.formatTimelineDateInput(startDate);
        this.timelineRangeEndInput = this.formatTimelineDateInput(endDate);
        $("#timeline-range-start").val(this.timelineRangeStartInput);
        $("#timeline-range-end").val(this.timelineRangeEndInput);
    }

    private syncTimelineRangeGraphics(): void {
        if (!this.xAttribute) {
            return;
        }

        const startDate = this.getSelectedTimelineStart();
        const endDate = this.getSelectedTimelineEnd();
        const startX = this.xAttribute(startDate);
        const endX = this.xAttribute(endDate);

        this.currentTimelineStartValue = startX;
        this.currentTimelineTargetValue = endX;

        if (this.rangeSelection) {
            this.rangeSelection
                .attr("x1", startX)
                .attr("x2", endX);
        }

        if (this.rangeStartHandle) {
            this.rangeStartHandle
                .attr("data-x", startX)
                .attr("transform", `translate(${startX},0)`);
        }

        if (this.rangeEndHandle) {
            this.rangeEndHandle
                .attr("data-x", endX)
                .attr("transform", `translate(${endX},0)`);
        }

        if (this.rangeStartLabel) {
            this.rangeStartLabel
                .attr("x", startX)
                .text(this.handleDateFormat ? this.handleDateFormat(startDate) : '');
        }

        if (this.rangeEndLabel) {
            this.rangeEndLabel
                .attr("x", endX)
                .text(this.handleDateFormat ? this.handleDateFormat(endDate) : '');
        }
    }

    private applyTimelineVisibility(): void {
        this.commonService.setNodeVisibility(false);
        this.commonService.setLinkVisibility(false);
        this.commonService.updateStatistics();
        this.scheduleTimelineTablesRefresh();
    }

    private setTimelineRange(
        startValue: any,
        endValue: any,
        changedBoundary: TimelineRangeBoundary = 'both',
        stopPlayback = true,
    ): void {
        if (!this.timelineDomainStart || !this.timelineDomainEnd) {
            return;
        }

        if (stopPlayback) {
            this.stopTimelinePlayback(false);
        }

        let startDate = this.clampTimelineDate(
            this.parseTimelineDate(startValue) ?? this.getSelectedTimelineStart()
        );
        let endDate = this.clampTimelineDate(
            this.parseTimelineDate(endValue) ?? this.getSelectedTimelineEnd()
        );

        if (startDate.getTime() > endDate.getTime()) {
            if (changedBoundary === 'start') {
                endDate = startDate;
            } else if (changedBoundary === 'end') {
                startDate = endDate;
            } else {
                const previousStart = startDate;
                startDate = endDate;
                endDate = previousStart;
            }
        }

        this.commonService.session.state.timeStart = startDate;
        this.commonService.session.state.timeTarget = endDate;
        this.commonService.session.state.timeEnd = endDate;
        this.syncTimelineRangeInputs(startDate, endDate);
        this.syncTimelineRangeGraphics();
        this.update(endDate);
    }

    public onTimelineRangeStartInputChanged(value: string): void {
        this.setTimelineRange(value, this.commonService.session.state.timeTarget, 'start');
    }

    public onTimelineRangeEndInputChanged(value: string): void {
        this.setTimelineRange(this.commonService.session.state.timeStart, value, 'end');
    }

    public resetTimelineRange(): void {
        if (!this.timelineDomainStart || !this.timelineDomainEnd) {
            return;
        }

        this.setTimelineRange(this.timelineDomainStart, this.timelineDomainEnd, 'both');
    }

    public onTimelineChanged(e) : void {
        this.SelectedTimelineVariable = e;
        if(this.commonService.debugMode) {
            console.log('timeline changed: ', e);
        }
        d3.select('#global-timeline svg').remove();
        this.stopTimelinePlayback();
        this.timelineDomainStart = null;
        this.timelineDomainEnd = null;
        let variable = e;  
        let loadingJsonFile = this.commonService.session.style.widgets["node-timeline-variable"] == variable;
        if (this.commonService.session.style.widgets["node-timeline-variable"] != 'None' && !loadingJsonFile) {
            // change timeline variable when end time not reaching target time - redraw netwrok to start fresh
            if (moment(this.commonService.session.state.timeEnd).toDate() < moment(this.commonService.session.state.timeTarget).toDate()) {
                this.commonService.session.state.timeEnd = this.commonService.session.state.timeTarget;
                this.applyTimelineVisibility();
                this.store.setNetworkUpdated(true);
            }
        }
        this.commonService.session.style.widgets["node-timeline-variable"] = variable;
        if (variable == "None") {
            $("#global-timeline-field").empty();
            this.commonService.session.style.widgets["timeline-date-field"] = 'None'  
            this.timelineRangeStartInput = '';
            this.timelineRangeEndInput = '';
            this.timelinePlaybackPaused = false;
            $("#global-timeline-wrapper").fadeOut();
            // $('#pinbutton').prop("disabled", false);
            // if(!this.commonService.session.network.timelinePinned) {
            // $('#pinbutton').trigger('click');
            // this.commonService.updatePinNodes(false);
            // }
            this.commonService.session.network.timelineNodes = [];
            this.applyTimelineVisibility();
            this.store.setNetworkUpdated(true);
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
        const timeDomainStart = new Date(Math.min(...times));
        const timeDomainEnd = new Date(Math.max(...times));
        this.timelineDomainStart = timeDomainStart;
        this.timelineDomainEnd = timeDomainEnd;

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
        const margin = {top:50, right:0, bottom:0, left:0},
            width = Math.max(0, (($('#visualwrapper').width() || 0) * 4 / 5) - margin.left - margin.right),
            height = 200 - margin.top - margin.bottom;

        var svgTimeline = d3.select("#global-timeline")
            .append("svg")
            .attr("width", width + margin.left + margin.right)
            .attr("height", 120)
            .style("overflow", "visible");

            ////////// slider //////////
        this.currentTimelineStartValue = 0;
        this.currentTimelineValue = width;
        this.currentTimelineTargetValue = width;
        this.commonService.session.state.timeStart = startDate;
        const timelineHorizontalPadding = Math.min(9, width / 2);

        const that = this;
        const playButton = d3.select("#timeline-play-button");
        if (playButton.text() == "Pause") playButton.text("Play");
        this.xAttribute = d3.scaleTime()
            .domain([startDate, endDate])
            .range([timelineHorizontalPadding, this.currentTimelineTargetValue - timelineHorizontalPadding])
            .clamp(true);
        const estimateTimelineTickWidth = (date: Date) => Math.max(28, String(tickDateFormat(date)).length * 7);
        const tickValues = [startDate, ...this.xAttribute.ticks(12), endDate]
            .sort((a, b) => a.getTime() - b.getTime())
            .filter((date, index, dates) => index === 0 || date.getTime() !== dates[index - 1].getTime())
            .filter((date, index, dates) => {
                const isEndpoint = date.getTime() === startDate.getTime() || date.getTime() === endDate.getTime();
                if (isEndpoint) {
                    return true;
                }

                const previousDate = dates[index - 1];
                const nextDate = dates[index + 1];
                const x = this.xAttribute(date);
                const previousX = previousDate ? this.xAttribute(previousDate) : Number.NEGATIVE_INFINITY;
                const nextX = nextDate ? this.xAttribute(nextDate) : Number.POSITIVE_INFINITY;
                const minimumPreviousGap = (estimateTimelineTickWidth(date) + (previousDate ? estimateTimelineTickWidth(previousDate) : 0)) / 2 + 6;
                const minimumNextGap = (estimateTimelineTickWidth(date) + (nextDate ? estimateTimelineTickWidth(nextDate) : 0)) / 2 + 6;
                return x - previousX >= minimumPreviousGap && nextX - x >= minimumNextGap;
            });
        const slider = svgTimeline.append("g")
            .attr("class", "slider")
            .attr("transform", "translate(0," + height/2 + ")");
        const moveActiveTimelineMarker = () => {
            const date = that.xAttribute.invert((d3 as any).event.x);
            that.stopTimelinePlayback(true);
            that.update(date);
        };

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
        this.rangeSelection = slider.append('line')
            .attr("class", "timeline-selected-range")
            .attr("x1", this.xAttribute.range()[0])
            .attr("x2", this.xAttribute.range()[1]);
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
                .on("start drag", moveActiveTimelineMarker)
            );
        slider.insert("g", ".track-overlay")
            .attr("class", "ticks")
            .attr("transform", "translate(0," + 18 + ")")
            .selectAll("text")
            .data(tickValues)
            .enter()
            .append("text")
            .attr("x", this.xAttribute)
            .attr("y", 10)
            .attr("text-anchor", "middle")
            .text(function(d) { return tickDateFormat(d); });


        this.rangeStartLabel = slider.append("text")
            .attr("class", "timeline-range-label timeline-range-start-label")
            .attr("text-anchor", "middle")
            .attr("y", -46);

        this.rangeEndLabel = slider.append("text")
            .attr("class", "timeline-range-label timeline-range-end-label")
            .attr("text-anchor", "middle")
            .attr("y", -46);

        this.label = slider.append("text")  
            .attr("class", "label")
            .attr("text-anchor", "middle")
            .text(this.handleDateFormat(endDate))
            .attr("y", -25);

        this.handle = slider.append("circle")
            .attr("class", "handle")
            .attr("data-testid", "timeline-current-handle")
            .attr("r", 9)
            .call(d3.drag()
                .on("start.interrupt", function() { slider.interrupt(); })
                .on("start drag", moveActiveTimelineMarker)
            );

        this.rangeStartHandle = slider.append("path")
            .attr("class", "timeline-range-handle timeline-range-start-handle")
            .attr("data-testid", "timeline-range-start-handle")
            .attr("d", "M -8,-19 L 8,-19 L 0,-5 Z")
            .call(d3.drag()
                .on("start.interrupt", function() { slider.interrupt(); })
                .on("start drag", function() {
                    const date = that.xAttribute.invert((d3 as any).event.x);
                    that.setTimelineRange(date, that.commonService.session.state.timeTarget, 'start');
                })
            );

        this.rangeEndHandle = slider.append("path")
            .attr("class", "timeline-range-handle timeline-range-end-handle")
            .attr("data-testid", "timeline-range-end-handle")
            .attr("d", "M -8,-19 L 8,-19 L 0,-5 Z")
            .call(d3.drag()
                .on("start.interrupt", function() { slider.interrupt(); })
                .on("start drag", function() {
                    const date = that.xAttribute.invert((d3 as any).event.x);
                    that.setTimelineRange(that.commonService.session.state.timeStart, date, 'end');
                })
            );

        this.commonService.session.style.widgets["timeline-date-field"] = field;
        let selectedStartDate = startDate;
        let selectedEndDate = endDate;
        let activeEndDate = selectedStartDate;

        if (loadingJsonFile) {
            selectedStartDate = this.clampTimelineDate(
                this.parseTimelineDate(this.commonService.session.state.timeStart) ?? startDate
            );
            selectedEndDate = this.clampTimelineDate(
                this.parseTimelineDate(this.commonService.session.state.timeTarget) ?? endDate
            );

            if (selectedStartDate.getTime() > selectedEndDate.getTime()) {
                selectedStartDate = startDate;
                selectedEndDate = endDate;
            }

            activeEndDate = this.clampTimelineDate(
                this.parseTimelineDate(this.commonService.session.state.timeEnd) ?? selectedStartDate
            );
            activeEndDate = new Date(Math.min(
                Math.max(activeEndDate.getTime(), selectedStartDate.getTime()),
                selectedEndDate.getTime()
            ));
        }

        this.commonService.session.state.timeStart = selectedStartDate;
        this.commonService.session.state.timeTarget = selectedEndDate;
        this.commonService.session.state.timeEnd = activeEndDate;
        this.syncTimelineRangeInputs(selectedStartDate, selectedEndDate);
        this.syncTimelineRangeGraphics();
        this.update(activeEndDate);
        $("#global-timeline-wrapper").fadeIn();
       
    }

    public playTimeline() : void {

            if (this.playBtnText == "Pause") {
                this.stopTimelinePlayback(true);
            } else {
                if (!this.xAttribute) {
                    return;
                }

                const startDate = this.getSelectedTimelineStart();
                const endDate = this.getSelectedTimelineEnd();
                const activeDate = this.timelinePlaybackPaused ? this.getActiveTimelineEnd() : startDate;
                const playbackStartDate = activeDate.getTime() >= endDate.getTime() ? startDate : activeDate;
                this.timelinePlaybackPaused = false;
                this.currentTimelineStartValue = this.xAttribute(playbackStartDate);
                this.currentTimelineTargetValue = this.xAttribute(endDate);
                this.currentTimelineValue = this.currentTimelineStartValue;
                this.update(playbackStartDate);

                if (this.currentTimelineStartValue >= this.currentTimelineTargetValue) {
                    this.stopTimelinePlayback();
                    return;
                }

                this.playBtnText = "Pause";
                d3.select("#timeline-play-button").text("Pause");
                this.commonService.session.timeline = setInterval(this.step, this.timelineSpeed, this);
            }

    }

    public onTimelineSpeedIndexChanged(index: number): void {
        const parsedIndex = Number(index);
        const safeIndex = Number.isFinite(parsedIndex)
            ? Math.max(0, Math.min(this.timelineSpeedOptions.length - 1, parsedIndex))
            : this.timelineSpeedIndex;
        this.timelineSpeedIndex = safeIndex;
        this.timelineSpeed = this.timelineSpeedOptions[safeIndex];
    }

    update(h) {

        // Timeline-aware views update from node-visibility; other views should
        // not treat playback ticks as generic network updates.
        if (!this.xAttribute) {
            return;
        }

        const selectedStart = this.getSelectedTimelineStart();
        const selectedEnd = this.getSelectedTimelineEnd();
        const parsedDate = this.parseTimelineDate(h) ?? selectedEnd;
        const nextDate = new Date(Math.min(
            Math.max(this.clampTimelineDate(parsedDate).getTime(), selectedStart.getTime()),
            selectedEnd.getTime()
        ));
        const nextX = this.xAttribute(nextDate);

        this.currentTimelineValue = nextX;
        this.commonService.session.state.timeStart = selectedStart;
        this.commonService.session.state.timeTarget = selectedEnd;
        this.commonService.session.state.timeEnd = nextDate;
        this.syncTimelineRangeInputs(selectedStart, selectedEnd);
        this.syncTimelineRangeGraphics();

        if (this.handle) {
            this.handle.attr("cx", nextX);
        }

        if (this.label) {
            this.label
                .attr("x", nextX)
                .text(this.handleDateFormat(nextDate));
        }

        this.applyTimelineVisibility();
  }

    step(that : any) { 
        const startValue = Number(that.currentTimelineStartValue ?? 0);
        const targetValue = Number(that.currentTimelineTargetValue ?? 0);
        const currentValue = Number(that.currentTimelineValue ?? startValue);

        if (targetValue <= startValue || currentValue >= targetValue) {
            that.update(that.xAttribute.invert(targetValue));
            that.stopTimelinePlayback();
            return;
        }

        const stepSize = Math.max((targetValue - startValue) / 151, 1);
        const nextValue = Math.min(currentValue + stepSize, targetValue);
        that.currentTimelineValue = nextValue;
        that.update(that.xAttribute.invert(nextValue));

        if (nextValue >= targetValue) {
            that.stopTimelinePlayback();
        }
    }

    showNodeColorTable() {
        if (this.isKeyTableDocked('node-color')) {
            this.GlobalSettingsNodeColorDialogSettings.setVisibility(false);
            return;
        }
        if (this.SelectedNodeColorTableTypesVariable != 'Show') {
            this.setKeyTableDisplayMode('node-color', 'Show');
            this.onNodeColorTableChanged();
        };

        if (this.SelectedColorNodesByVariable !== 'None') {
            this.generateNodeColorTable('#node-color-table');
        }
    }

    hideNodeColorTable() {
        if (this.SelectedColorNodesByVariable === 'None') {
            return;
        }

        if (this.isKeyTableDocked('node-color')) {
            return;
        }

        if (this.SelectedNodeColorTableTypesVariable != 'Hide') {
           this.setKeyTableDisplayMode('node-color', 'Hide');
           this.onNodeColorTableChanged()
        }
    }

    showLinkColorTable() {
        console.log('onLinkColorTableChanged - show');
        if (this.isKeyTableDocked('link-color')) {
            this.GlobalSettingsLinkColorDialogSettings.setVisibility(false);
            return;
        }

        if (this.SelectedLinkColorTableTypesVariable != 'Show') {
            this.setKeyTableDisplayMode('link-color', 'Show');
            this.onLinkColorTableChanged();
            return;
        }

        if (this.SelectedColorLinksByVariable !== 'None') {
            this.generateNodeLinkTable('#link-color-table');
        }
    }

    hideLinkColorTable() {
        if (this.SelectedColorLinksByVariable === 'None') {
            return;
        }

        if (this.isKeyTableDocked('link-color')) {
            return;
        }

        if (this.SelectedLinkColorTableTypesVariable != 'Hide') {
           this.setKeyTableDisplayMode('link-color', 'Hide');
           this.onLinkColorTableChanged()
        }
    }

    /**
     * Called when SelectedColorNodesByVariable (keeps track of what variable to use to color nodes by) is changed.
     */
    onColorNodesByChanged(silent: boolean = false) {

        this.commonService.GlobalSettingsModel.SelectedColorNodesByVariable = this.SelectedColorNodesByVariable;
        if (this.SelectedColorNodesByVariable !== 'None' && this.getKeyTableDisplayMode('node-color') === 'Dock') {
            this.keyTablesController.setDocked('node-color', true);
            this.ensureKeyTablesViewOpen(false);
        }
        const shouldFloatNodeColorTable = this.shouldDisplayFloatingKeyTable('node-color');


        if (shouldFloatNodeColorTable && !this.GlobalSettingsNodeColorDialogSettings.isVisible) {

            if (this.SelectedColorNodesByVariable != "None") {

                this.GlobalSettingsNodeColorDialogSettings.setVisibility(true);
                this.cachedGlobalSettingsNodeColorVisibility = this.GlobalSettingsNodeColorDialogSettings.isVisible;
                const prevColorNodesByVariable = this.SelectedColorNodesByVariable;
                // this detect changes leads to SelectedColorNodesByVariable being set to default value when loading MT files that have both 2D and map view
                this.cdref.detectChanges();
                if (prevColorNodesByVariable != this.SelectedColorNodesByVariable) this.SelectedColorNodesByVariable = prevColorNodesByVariable;
            }
        }

        this.commonService.session.style.widgets["node-color-variable"] = this.SelectedColorNodesByVariable;

        if(this.commonService.session.data.nodes.length === 0) {
            return;
        }

        if (this.SelectedColorNodesByVariable !== "None") {
            if (!shouldFloatNodeColorTable) {
                this.GlobalSettingsNodeColorDialogSettings.setVisibility(false);
                this.nodeColorRows = [];
                this.nodeColorDomain = [];
                this.commonService.createNodeColorMap();
                this.refreshKeyTablesView();

                if(!silent) {
                    this.publishUpdateNodeColors();
                }

                return;
            }

            this.generateNodeColorTable("#node-color-table");

            console.log('--- onColorNodesByChanged called');
            // if not loading all settings at once, update node colors
            if(!silent) {
                this.publishUpdateNodeColors();
            }

        // if color nodes by equals None, then hide node color table
        } else {

            this.nodeColorRows = [];
            this.nodeColorDomain = [];
            this.applyKeyTableDisplayMode('node-color', silent);
            this.refreshKeyTablesView();

            if(!silent) {
                this.publishUpdateNodeColors();
            }
            this.exportTables['node-color'] = false;
        }
    }

    generateNodeColorTable(tableId: string, isEditable: boolean = true) {
        this.nodeColorTableEditable = isEditable;
        this.nodeColorTableHeaders = {
            value: this.getKeyTableColumnDisplayName('node-color', 'value', 'Node ' + this.commonService.titleize(this.SelectedColorNodesByVariable)),
            count: this.getKeyTableColumnDisplayName('node-color', 'count', 'Count'),
            frequency: this.getKeyTableColumnDisplayName('node-color', 'frequency', 'Frequency')
        };

        this.getNodeValueNameMap();

        const aggregates = this.commonService.createNodeColorMap();
        const vnodes = this.commonService.getVisibleNodes();
        const aggregateValues = Object.keys(aggregates);
        this.nodeColorDomain = aggregateValues;

        this.nodeColorRows = aggregateValues
            .map((value, i) => ({ value, i }))
            .filter(({ value }) => aggregates[value] >= 1)
            .map(({ value, i }) => ({
                rawValue: value,
                trackKey: `node-color-${String(value)}`,
                displayName: this.getNodeValueDisplayName(value),
                count: aggregates[value],
                frequency: vnodes.length === 0 ? '' : (aggregates[value] / vnodes.length).toLocaleString(),
                color: this.commonService.temp.style.nodeColorMap(value),
                alpha: this.commonService.temp.style.nodeAlphaMap(value),
                index: i
            }));

        this.applyStyleKeyTableSort('node-color');
        $('#nodeColorTableSettings').on('mouseleave', () => $('#nodeColorTableSettings').delay(500).css('display', 'none'));
        this.cdref.markForCheck();
    }

    onStyleKeyTableColumnNameChange(change: StyleKeyTableColumnNameChange): void {
        this.setKeyTableColumnDisplayName(change.table, change.column, change.displayName);
    }

    onNodeColorRowNameChange(change: StyleKeyTableRowNameChange): void {
        this.setNodeValueDisplayName(change.value, change.displayName);
    }

    onLinkColorRowNameChange(change: StyleKeyTableRowNameChange): void {
        if (!this.commonService.session.style.linkValueNames) {
            this.commonService.session.style.linkValueNames = {};
        }

        this.commonService.session.style.linkValueNames[String(change.value)] = change.displayName;
        this.cdref.markForCheck();
    }

    onNodeShapeRowNameChange(change: StyleKeyTableRowNameChange): void {
        this.setNodeValueDisplayName(change.value, change.displayName);
    }

    onNodeColorTableColorChange(change: StyleKeyTableColorChange): void {
        const value = change.value;
        const aggregateValues = this.nodeColorDomain.length ? this.nodeColorDomain : this.nodeColorRows.map(row => row.rawValue);
        const tableKeys = this.commonService.session.style.nodeColorsTableKeys?.[this.SelectedColorNodesByVariable] ?? aggregateValues;
        const key = tableKeys.findIndex(k => k === value);
        const resolvedKey = key >= 0 ? key : change.row.index ?? 0;
        const nextColor = change.color;

        this.commonService.session.style.nodeColorsTable[this.SelectedColorNodesByVariable].splice(resolvedKey, 1, nextColor);
        const nodeColorsTableHistory = this.commonService.session.style.nodeColorsTableHistory;
        const storedVariableHistory = nodeColorsTableHistory[this.SelectedColorNodesByVariable];
        const variableHistory = storedVariableHistory
            && typeof storedVariableHistory === 'object'
            && !Array.isArray(storedVariableHistory)
            ? storedVariableHistory
            : {};
        nodeColorsTableHistory[this.SelectedColorNodesByVariable] = variableHistory;
        variableHistory[tableKeys[resolvedKey]] = nextColor;
        this.commonService.session.style.nodeColors.splice(change.row.index ?? resolvedKey, 1, nextColor);
        this.commonService.temp.style.nodeColorMap = d3
            .scaleOrdinal(this.commonService.session.style.nodeColors)
            .domain(aggregateValues);

        this.generateNodeColorTable('', true);
        this.publishUpdateNodeColors();
    }

    onLinkColorTableColorChange(change: StyleKeyTableColorChange): void {
        if (change.row.duoSegments?.length) {
            return;
        }

        const value = change.value;
        const selectedVariable = this.SelectedColorLinksByVariable;
        const aggregateValues = this.linkColorDomain.length ? this.linkColorDomain : this.linkColorRows.map(row => row.rawValue);
        const linkColorKeys = this.commonService.session.style.linkColorsTableKeys?.[selectedVariable] || aggregateValues;
        const key = linkColorKeys.findIndex(k => k === value);
        const resolvedKey = key >= 0 ? key : change.row.index ?? 0;
        const nextColor = change.color;
        const variableColors = this.commonService.session.style.linkColorsTable?.[selectedVariable] || [];

        variableColors.splice(resolvedKey, 1, nextColor);
        this.commonService.session.style.linkColorsTable[selectedVariable] = variableColors;
        this.commonService.session.style.linkColorsTableHistory[value] = nextColor;
        (this.commonService.session.style.linkColors as any).splice(resolvedKey, 1, nextColor);
        this.commonService.temp.style.linkColorMap = d3
            .scaleOrdinal(this.commonService.session.style.linkColorsTable[selectedVariable])
            .domain(linkColorKeys);

        this.generateNodeLinkTable('', true);
        this.publishUpdateLinkColor();
    }

    onNodeColorAlphaRequested(request: StyleKeyTableAlphaRequest): void {
        this.showColorAlphaPicker(
            request,
            this.commonService.session.style.nodeAlphas[request.row.index ?? 0],
            alphaValue => {
                const aggregateValues = this.nodeColorDomain.length ? this.nodeColorDomain : this.nodeColorRows.map(row => row.rawValue);
                const index = request.row.index ?? 0;
                const alpha = this.commonService.clampStyleAlpha(alphaValue);
                this.commonService.session.style.nodeAlphas.splice(index, 1, alpha);
                this.commonService.temp.style.nodeAlphaMap = d3
                    .scaleOrdinal(this.commonService.session.style.nodeAlphas)
                    .domain(aggregateValues);
                this.generateNodeColorTable('', true);
                this.publishUpdateNodeColors();
            }
        );
    }

    onLinkColorAlphaRequested(request: StyleKeyTableAlphaRequest): void {
        this.showColorAlphaPicker(
            request,
            this.commonService.session.style.linkAlphas[request.row.index ?? 0],
            alphaValue => {
                const aggregateValues = this.linkColorDomain.length ? this.linkColorDomain : this.linkColorRows.map(row => row.rawValue);
                const index = request.row.index ?? 0;
                this.commonService.session.style.linkAlphas.splice(index, 1, parseFloat(String(alphaValue)));
                this.commonService.temp.style.linkAlphaMap = d3
                    .scaleOrdinal(this.commonService.session.style.linkAlphas)
                    .domain(aggregateValues);
                this.generateNodeLinkTable('', true);
                this.publishUpdateLinkColor();
            }
        );
    }

    onNodeShapeTableShapeChange(change: StyleKeyTableShapeChange): void {
        this.onNodeShapeTableTreeChange(change.selectedNode, change.value);
    }

    onNodeShapeTablePanelRequest(request: StyleKeyTableShapePanelRequest): void {
        this.onShapeTreeShow(request.shapeKey);
    }

    onStyleKeyTableSort(table: 'node-color' | 'link-color' | 'node-shape', column: StyleKeyTableSortColumn): void {
        if (table === 'node-shape') {
            this.onNodeShapeSort(column === 'value' ? 'key' : column);
            return;
        }

        const previous = this.colorTableSortState[table];
        const ascending = previous?.column === column ? !previous.ascending : true;
        this.colorTableSortState[table] = { column, ascending };
        this.applyStyleKeyTableSort(table);
        this.cdref.markForCheck();
    }

    private applyStyleKeyTableSort(table: 'node-color' | 'link-color'): void {
        const sortState = this.colorTableSortState[table];
        if (!sortState) {
            return;
        }

        const rows = table === 'node-color' ? [...this.nodeColorRows] : [...this.linkColorRows];
        rows.sort((a, b) => this.compareStyleKeyTableRows(a, b, sortState.column, sortState.ascending));

        if (table === 'node-color') {
            this.nodeColorRows = rows;
        } else {
            this.linkColorRows = rows;
        }
    }

    private compareStyleKeyTableRows(a: StyleKeyTableRow, b: StyleKeyTableRow, column: StyleKeyTableSortColumn, ascending: boolean): number {
        const aValue = column === 'count' ? a.count : column === 'frequency' ? a.frequency : a.displayName;
        const bValue = column === 'count' ? b.count : column === 'frequency' ? b.frequency : b.displayName;
        const aNumber = Number(aValue);
        const bNumber = Number(bValue);
        const comparison = !isNaN(aNumber) && !isNaN(bNumber)
            ? aNumber - bNumber
            : String(aValue).localeCompare(String(bValue));

        return ascending ? comparison : -comparison;
    }

    private showColorAlphaPicker(request: StyleKeyTableAlphaRequest, currentAlpha: number, onChange: (alphaValue: number) => void): void {
        $("#color-transparency-wrapper").css({
            top: request.event.clientY + 129,
            left: request.event.clientX,
            display: "block"
        });

        $("#color-transparency")
            .off("change")
            .val(currentAlpha)
            .one("change", event => {
                onChange(parseFloat((event.target['value'] as string)));
                $("#color-transparency-wrapper").fadeOut();
                this.cdref.markForCheck();
            });
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
        } else if (tableName == 'node-shape') {
            settingsPane = $('#globalNodeShapeTableSettings')
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
        } else if (table == 'node-shape' && column == 'tableCounts') {
            this.widgets['node-symbol-table-counts'] = !this.widgets['node-symbol-table-counts'];
        } else if (table == 'node-shape' && column == 'tableFreq') {
            this.widgets['node-symbol-table-frequencies'] = !this.widgets['node-symbol-table-frequencies'];
        } else {
            return;
        }

        this.updateCountFreqTable(table);
        this.refreshKeyTablesView();
    }

    /**
     * Updates the node-color-table or link-color-table based on value of widgets; it doesn't recalculate anything; just shows/hide columns
     * @param tableName 'node-color' or 'link-color'
     */
    updateCountFreqTable(tableName) {
        let showCount, showFreq;
        if (tableName == 'node-color') {
            showCount = this.widgets['node-color-table-counts'];
            showFreq = this.widgets['node-color-table-frequencies'];
        } else if (tableName == 'link-color') {
            showCount = this.widgets['link-color-table-counts'];
            showFreq = this.widgets['link-color-table-frequencies'];
        } else if (tableName == 'node-shape') {
            showCount = this.widgets['node-symbol-table-counts'];
            showFreq = this.widgets['node-symbol-table-frequencies'];
            this.cdref.markForCheck();
        } else {
            return;
        }
        this.cdref.markForCheck();
        const countSelector = tableName == 'node-color'
            ? '#global-settings-node-color-table .tableCount, #key-tables-node-table .tableCount'
            : tableName == 'link-color'
                ? '#global-settings-link-color-table .tableCount, #key-tables-link-table .tableCount'
                : '#global-settings-node-shape-table .tableCount, #key-tables-node-shape-table .tableCount, #node-symbol-table-wrapper .tableCount';
        const freqSelector = tableName == 'node-color'
            ? '#global-settings-node-color-table .tableFrequency, #key-tables-node-table .tableFrequency'
            : tableName == 'link-color'
                ? '#global-settings-link-color-table .tableFrequency, #key-tables-link-table .tableFrequency'
                : '#global-settings-node-shape-table .tableFrequency, #key-tables-node-shape-table .tableFrequency, #node-symbol-table-wrapper .tableFrequency';
        const countColumn = $(countSelector);
        const freqColumn = $(freqSelector);
        (showCount) ? countColumn.slideDown() : countColumn.slideUp();
        (showFreq) ? freqColumn.slideDown() : freqColumn.slideUp();
    }

    /**
     * Updated link-threshold widget and this.threshold variable. Sets mst-computed widget to false.
     * Updates clusters and cluster visibility, link visibility, and node visibility. Finallys updates
     * visualizations and stastistics
     */
    onLinkThresholdChanged( newThreshold?: number, silent: boolean = false) {

        if(newThreshold !== undefined) {
            this.commonService.session.style.widgets["link-threshold"] = Number(newThreshold);
        }

        const parsedThreshold = Number(this.commonService.session.style.widgets["link-threshold"]);

        if (!Number.isFinite(parsedThreshold)) {
            return;
        }

        this.syncThresholdDisplayFromStoredValue();
        this.store.setLinkThreshold(parsedThreshold);

        if(this.commonService.session.data.nodes.length === 0) {
            return;
        }

        // Only update if the threshold is different
        // if (parsedThreshold === this._lastLinkThreshold && this.commonService.session.network.isFullyLoaded) {
        // console.log("Threshold unchanged; skipping full network update.");
        // return;
        // }
        //debugger;

        this._lastLinkThreshold = parsedThreshold;
        this.commonService.session.style.widgets["link-threshold"] = parsedThreshold;
        this.syncThresholdDisplayFromStoredValue();

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
            const applyThresholdVisibility = () => {
                this.commonService.setLinkVisibility(false, false);

                console.log('tagClusters called link threshold change');

                // Now schedule the heavy update (tag clusters, update visibilities, stats) using debouncing
                this.commonService.updateNetworkVisuals(false, true);
            };

            this.commonService.ensurePatristicEdgesForThreshold(parsedThreshold)
                .catch(error => {
                    console.error('Patristic threshold re-query failed:', error);
                })
                .finally(applyThresholdVisibility);
        }

    }

    private getThresholdFieldName(): string {
        return this.SelectedLinkSortVariable || this.commonService.session.style.widgets['link-sort-variable'] || 'distance';
    }

    usesPercentageThresholdDisplay() {
        return this.commonService.tn93PercentageDisplayEnabled(this.getThresholdFieldName());
    }

    getDisplayedThresholdStepSize() {
        const step = Number(this.getCurrentThresholdStepSize());

        if (!Number.isFinite(step)) {
            return 1;
        }

        return this.commonService.toDisplayedDistanceValue(step, this.getThresholdFieldName());
    }

    public syncThresholdDisplayFromStoredValue(): void {
        const storedThreshold = Number(this.commonService.session.style.widgets["link-threshold"]);

        if (!Number.isFinite(storedThreshold)) {
            return;
        }

        this.SelectedLinkThresholdVariable = storedThreshold;
        this.threshold = String(storedThreshold);
        this.commonService.GlobalSettingsModel.SelectedLinkThresholdVariable = storedThreshold;
        const displayedThreshold = this.commonService.toDisplayedDistanceValue(
            storedThreshold,
            this.getThresholdFieldName()
        );
        this.SelectedLinkThresholdDisplayVariable = displayedThreshold;
        $("#link-threshold").val(displayedThreshold);
        this.cdref.markForCheck();
    }

    onTN93DistanceDisplayFormatChanged() {
        this.commonService.session.style.widgets['tn93-distance-display-format'] = this.SelectedTN93DistanceDisplayFormatVariable || 'decimal';
        this.syncThresholdDisplayFromStoredValue();
        this.commonService.updateStatistics();

        if (this.linkThresholdSparkline?.nativeElement) {
            this.commonService.updateThresholdHistogram(this.linkThresholdSparkline.nativeElement);
        }

        this.refreshThresholdStabilityPanel(false);
        this.publishDistanceDisplayFormatChanged();
    }
        

    revealClicked() : void {

        $("#cluster-minimum-size").val(1);
        this.commonService.session.style.widgets["cluster-minimum-size"] = 1;
        this.commonService.clearNetworkSubsetFilter(false);
        this.loadNetworkSubsetFilterSettings();
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
        this.refreshThresholdStabilityPanel();

    };


    updateGlobalSettingsModel() {

        this.commonService.GlobalSettingsModel.SelectedRevealTypesVariable = this.SelectedRevealTypesVariable;
        this.syncNodeShapeTableStateWithSelection('session');

        // TODO: See if we need to flip these now since the service should override these local settings
        this.SelectedDistanceMetricVariable = this.commonService.session.style.widgets['default-distance-metric'];
        this.SelectedLinkThresholdVariable = this.commonService.session.style.widgets['link-threshold'];
        this.syncThresholdDisplayFromStoredValue();
        this.commonService.GlobalSettingsModel.SelectedNodeColorVariable = this.SelectedNodeColorVariable;
        this.commonService.session.style.widgets['node-color'] = this.SelectedNodeColorVariable;
        this.commonService.session.style.widgets['link-color'] = this.SelectedLinkColorVariable;

        this.commonService.session.style.widgets['node-color-variable'] = this.SelectedColorNodesByVariable;
        this.commonService.session.style.widgets['node-symbol-variable'] = this.SelectedNodeSymbolVariable;
        this.commonService.session.style.widgets['node-symbol-table-visible'] = this.SelectedNodeShapeTableTypesVariable;
        this.commonService.session.style.widgets['link-threshold-variable'] = this.SelectedDistanceMetricVariable;
        //this.commonService.session.style.widgets['node-color-variable'] = this.SelectedNodeColorVariable;

        // TODO: Removed, see if this is still necessary
        // this.commonService.session.style.widgets['link-tooltip-variable'] = this.SelectedColorLinksByVariable;


        this.commonService.GlobalSettingsModel.SelectedColorVariable = this.SelectedColorVariable;
        this.commonService.GlobalSettingsModel.SelectedLinkThresholdVariable = this.SelectedLinkThresholdVariable;
        this.commonService.GlobalSettingsModel.SelectedDistanceMetricVariable = this.SelectedDistanceMetricVariable;
        this.commonService.GlobalSettingsModel.SelectedNodeSymbolVariable = this.SelectedNodeSymbolVariable;
        this.commonService.GlobalSettingsModel.SelectedNodeShapeTableTypesVariable = this.SelectedNodeShapeTableTypesVariable;
        this.commonService.session.style.widgets['selected-color'] = this.SelectedColorVariable;
        this.commonService.session.style.widgets['selected-node-stroke-color'] = this.SelectedColorVariable;
        // TODO: 
        // if (this.commonService.visuals.phylogenetic) {
        //   this.commonService.visuals.phylogenetic.updateNodeColors();
        // }


        this.commonService.GlobalSettingsModel.SelectedBackgroundColorVariable = this.SelectedBackgroundColorVariable;
        this.commonService.session.style.widgets['background-color'] = this.SelectedBackgroundColorVariable;


        this.commonService.GlobalSettingsModel.SelectedApplyStyleVariable = this.SelectedApplyStyleVariable;

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
        this.commonService.getStyleableNodeFields().forEach(d => {
            
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
        this.loadNetworkSubsetFilterSettings();
        //this.commonService.updateThresholdHistogram();
        this.refreshThresholdStabilityPanel(false);

        console.log('--- getGlobalSettingsData end - last of loadDefaultVisualization in MT');

    }

    private loadNetworkSubsetFilterSettings(): void {
        const filter = this.commonService.ensureNetworkSubsetFilterState();
        this.SelectedNetworkSubsetNodeField = filter.node?.field || 'None';
        this.SelectedNetworkSubsetNodeOperator = filter.node?.operator || 'equals';
        this.SelectedNetworkSubsetNodeValue = filter.node?.value ?? '';
        this.SelectedNetworkSubsetLinkField = filter.link?.field || 'None';
        this.SelectedNetworkSubsetLinkOperator = filter.link?.operator || 'contains';
        this.SelectedNetworkSubsetLinkValue = filter.link?.value ?? '';
        this.refreshNetworkSubsetValueOptions();
    }

    private hasNetworkSubsetRule(field: string, value: any): boolean {
        return field !== 'None' && value !== undefined && value !== null && `${value}`.trim() !== '';
    }

    onNetworkSubsetNodeFieldChanged(field: string): void {
        this.SelectedNetworkSubsetNodeField = field;
        this.refreshNetworkSubsetNodeValueOptions();
    }

    onNetworkSubsetLinkFieldChanged(field: string): void {
        this.SelectedNetworkSubsetLinkField = field;
        this.refreshNetworkSubsetLinkValueOptions();
    }

    onNetworkSubsetNodeValueChanged(value: string): void {
        this.SelectedNetworkSubsetNodeValue = value;
        this.filterNetworkSubsetNodeValueOptions();
    }

    onNetworkSubsetLinkValueChanged(value: string): void {
        this.SelectedNetworkSubsetLinkValue = value;
        this.filterNetworkSubsetLinkValueOptions();
    }

    private refreshNetworkSubsetValueOptions(): void {
        this.refreshNetworkSubsetNodeValueOptions();
        this.refreshNetworkSubsetLinkValueOptions();
    }

    private refreshNetworkSubsetNodeValueOptions(): void {
        this.NetworkSubsetNodeAllValueOptions = this.getNetworkSubsetValueOptions(
            this.commonService.session.data.nodes || [],
            this.SelectedNetworkSubsetNodeField
        );
        this.filterNetworkSubsetNodeValueOptions();
    }

    private refreshNetworkSubsetLinkValueOptions(): void {
        this.NetworkSubsetLinkAllValueOptions = this.getNetworkSubsetValueOptions(
            this.commonService.session.data.links || [],
            this.SelectedNetworkSubsetLinkField
        );
        this.filterNetworkSubsetLinkValueOptions();
    }

    private filterNetworkSubsetNodeValueOptions(): void {
        this.NetworkSubsetNodeValueOptions = this.filterNetworkSubsetValueOptions(
            this.NetworkSubsetNodeAllValueOptions,
            this.SelectedNetworkSubsetNodeValue
        );
    }

    private filterNetworkSubsetLinkValueOptions(): void {
        this.NetworkSubsetLinkValueOptions = this.filterNetworkSubsetValueOptions(
            this.NetworkSubsetLinkAllValueOptions,
            this.SelectedNetworkSubsetLinkValue
        );
    }

    private getNetworkSubsetValueOptions(records: any[], field: string): string[] {
        if (!field || field === 'None') {
            return [];
        }

        const options = new Set<string>();
        records.forEach(record => {
            const rawValue = record?.[field];
            const values = Array.isArray(rawValue) ? rawValue : [rawValue];

            values.forEach(value => {
                const normalizedValue = this.normalizeNetworkSubsetOptionValue(value);
                if (normalizedValue.length > 0) {
                    options.add(normalizedValue);
                }
            });
        });

        return Array.from(options).sort((a, b) => a.localeCompare(b, undefined, {
            numeric: true,
            sensitivity: 'base'
        }));
    }

    private filterNetworkSubsetValueOptions(options: string[], query: string): string[] {
        const normalizedQuery = `${query ?? ''}`.trim().toLowerCase();
        const filteredOptions = normalizedQuery.length
            ? options.filter(option => option.toLowerCase().includes(normalizedQuery))
            : options;

        return filteredOptions.slice(0, this.NetworkSubsetValueSuggestionLimit);
    }

    private normalizeNetworkSubsetOptionValue(value: any): string {
        if (value === undefined || value === null) {
            return '';
        }

        if (value instanceof Date) {
            return value.toISOString();
        }

        if (typeof value === 'object') {
            return JSON.stringify(value);
        }

        return `${value}`.trim();
    }

    applyNetworkSubsetFilter(): void {
        this.commonService.setNetworkSubsetFilterState({
            node: {
                enabled: this.hasNetworkSubsetRule(this.SelectedNetworkSubsetNodeField, this.SelectedNetworkSubsetNodeValue),
                field: this.SelectedNetworkSubsetNodeField,
                operator: this.SelectedNetworkSubsetNodeOperator,
                value: this.SelectedNetworkSubsetNodeValue
            },
            link: {
                enabled: this.hasNetworkSubsetRule(this.SelectedNetworkSubsetLinkField, this.SelectedNetworkSubsetLinkValue),
                field: this.SelectedNetworkSubsetLinkField,
                operator: this.SelectedNetworkSubsetLinkOperator,
                value: this.SelectedNetworkSubsetLinkValue
            }
        });
    }

    clearNetworkSubsetFilter(): void {
        this.commonService.clearNetworkSubsetFilter(false);
        this.loadNetworkSubsetFilterSettings();
        this.commonService.setLinkVisibility(true, false);
        this.commonService.updateNetworkVisuals(false, true);
    }

    isNetworkSubsetFilterActive(): boolean {
        return this.commonService.isNetworkSubsetFilterActive();
    }

    getNetworkSubsetFilterLabel(): string {
        return this.commonService.getNetworkSubsetFilterLabel();
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

          if (this.auspiceUrlVal && !this.embedHandoffService.hasPendingHandoffInUrl()) {
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
            const preserveKeyTableDisplayMode = v === KeyTablesComponent.componentTypeName
                && (this.preserveNextKeyTablesRemoval || this.applyingPendingDashboardRestore);
            this.preserveNextKeyTablesRemoval = false;
            this.removeComponent(v, preserveKeyTableDisplayMode);
        });

        this._goldenLayoutHostComponent.TabChangedEvent.subscribe((v) => {

            this.commonService.activeTab = v;
            this.keyTablesController.noteActiveTab(v);

            console.log('tab changed settigns viz: ', v);

            // If network is not even renered yet, no need ot update these values
            if (!this.networkRendered) {
                return;
            }
            
            this.syncFloatingKeyTableDialogs();
            if (this.shouldUseKeyTablesView()) {
                this.refreshKeyTablesView();
            }
            console.log('linktable vis - false tab changed: ', this.GlobalSettingsLinkColorDialogSettings.isVisible);

        });
        
        this.store.updatecurrentThresholdStepSize(this.SelectedDistanceMetricVariable);
        console.log('tab changed end: ');
    }


    private _removeGlView(view : string, preserveKeyTableDisplayMode: boolean = false) {
        if (this.homepageTabs.findIndex(tab => tab.label === view) === -1) {
            console.log(`Skipping removal for ${view}; tab is not active`);
            return;
        }

        console.log(`Removing ${view}`);
        if (view === KeyTablesComponent.componentTypeName && preserveKeyTableDisplayMode) {
            this.preserveNextKeyTablesRemoval = true;
        }
        try {
            this._goldenLayoutHostComponent.removeComponent(view);
            this.removeComponent(view, preserveKeyTableDisplayMode);
        } finally {
            this.preserveNextKeyTablesRemoval = false;
        }
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

    officialInstance(): boolean {
        let url: URL;
        try {
            url = new URL(this.currentUrl, window.location.origin);
        } catch {
            return false;
        }

        const hostname = url.hostname.toLowerCase();
        const pathname = url.pathname.replace(/\/+$/, '');
        if (hostname === 'localhost') {
            return true;
        }
        if (url.protocol !== 'https:') {
            return false;
        }

        const isMicrobeTracePath = pathname === '/MicrobeTrace' || pathname.startsWith('/MicrobeTrace/');
        return (isMicrobeTracePath && (hostname === 'microbetrace.cdc.gov' || hostname === 'cdcgov.github.io'));
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

        e = this.normalizeDashboardLabel(e);

        // Keep the saved/default launch-view state aligned with the view we are
        // actually opening during file or session load.
        this.updateLaunchView(e);

        if (!this.auspiceUrlVal) this.resetLayout();

        // TODO:: see if timeout needed
        // setTimeout(() => {
        if (this.homepageTabs.findIndex(x => x.label == e) === -1) {
            console.log('--- Load Default Visualization end - view click');
            this.Viewclick(e);
        }

        if (this.commonService.pendingDashboardRestore?.dashboardLayout?.root) {
            setTimeout(() => this.schedulePendingDashboardRestore(), 0);
        }
        // }, 500);
        
    }

    public resetLayout() {
    
        this.homepageTabs.forEach( tab => {
            if (tab.label !== "Files") {
                console.group('removing: ', tab.label);
                this._removeGlView(tab.label, tab.label === KeyTablesComponent.componentTypeName);
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

        if (this.exportTables['polygon-color']) {
            const polygonTable = this.getPolygonColorTableElementForExport();
            if (polygonTable) {
                elementsToExport.push(polygonTable);
            }
        }
        if (elementsToExport.length == 0
            && this.exportTables['node-color'] == false
            && this.exportTables['link-color'] == false
            && this.exportTables['node-symbol'] == false) {
            console.log('nothing to export');
             return; 
        }

        if (this.ExportTablesFileType == 'svg') {
            this.performExportSVG(elementsToExport, '', this.exportTables['node-color'], this.exportTables['link-color'], this.exportTables['node-symbol']);
        } else {
            this.performExport(elementsToExport, this.exportTables['node-color'], this.exportTables['link-color'], this.exportTables['node-symbol']);
        }
    }

    ExportGraphML() {
        const graphMLExport = this.graphMLService.exportSession(this.commonService.session);
        const blob = new Blob([graphMLExport.contents], { type: 'application/graphml+xml;charset=utf-8' });
        this.saveGeneratedFile(blob, 'microbetrace.graphml');
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

    private saveGeneratedFile(content: Blob | string, filename: string) {
        const browserWindow = window as Window & {
            __mtTestSaveAs?: (content: Blob | string, filename: string) => void;
        };

        if (typeof browserWindow.__mtTestSaveAs === 'function') {
            browserWindow.__mtTestSaveAs(content, filename);
            return;
        }

        saveAs(content as any, filename);
    }

    DisplayStashDialog(saveStash: string) {
        switch (saveStash) {
            case "Save": {

                if (this.selectedSaveFileType == 'style') {
                    const data = JSON.stringify(this.commonService.session.style);
                    const blob = new Blob([data], { type: "application/json;charset=utf-8" });
                    this.saveGeneratedFile(blob, this.saveFileName+'.style')
                    this.displayStashDialog = false;
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

                        const blob = new Blob([Papa.unparse(sanitizeExportRows(cluster[0]))], {type: 'text/csv;charset=utf-8'});
                        clusterFolder.file( "nodeList_cluster_" + cluster[0][0].cluster + ".csv", blob);

                        // Now get link list of cluster
                        const clusterLink = clusterLinkList.filter(LinkList => LinkList[0].cluster == currentCluster.id);

                        if(clusterLink) {
                            const blob = new Blob([Papa.unparse(sanitizeExportRows(clusterLink[0]))], {type: 'text/csv;charset=utf-8'});
                            clusterFolder.file("edgeList_cluster_" + cluster[0][0].cluster + ".csv", blob);
                        }
                        }
                    }
                    }

                    if(dyadNodeList.length > 0){
                        dyadFolder = zip.folder("dyads");
                        // Add all dyads in one shot
                        const nodesBlob = new Blob([Papa.unparse(sanitizeExportRows(dyadNodeList))], {type: 'text/csv;charset=utf-8'});
                        dyadFolder.file("nodeList_cluster.csv", nodesBlob);
                        const edgesBlob = new Blob([Papa.unparse(sanitizeExportRows(dyadEdgeList))], {type: 'text/csv;charset=utf-8'});
                        dyadFolder.file("edgeList_cluster.csv", edgesBlob);
                      }
                
                      if (singletonNodeList.length > 0) {
                        singletonFolder = zip.folder("singletons");
                        // Add all singletons in one shot
                        const blob = new Blob([Papa.unparse(sanitizeExportRows(singletonNodeList))], {type: 'text/csv;charset=utf-8'});
                        singletonFolder.file("nodeList_cluster.csv", blob);
                      }
                        
                      const that = this;
                      // generate zip repsetnation in memory
                      zip.generateAsync({type:"blob"}).then(function(content) {
                          // see FileSaver.js
                          that.saveGeneratedFile(content, `${that.saveFileName}.zip`);
                      });
                } else {
                    this.commonService.session.files.forEach(file => {
                        if (file.extension == 'xlsx' || file.extension == 'xls') {
                            this.convertFileToCSV(file);
                        }
                    });

                    const dashboardLayout = this.getSerializableDashboardLayout();
                    const dashboardState = this.getSerializableDashboardState();
                    const stash: StashObjects = {
                        session: this.commonService.session,
                        tabs: lightTabs
                    };

                    if (dashboardLayout) {
                        stash.dashboardLayout = dashboardLayout;
                    }

                    if (dashboardState) {
                        stash.dashboardState = dashboardState;
                    }

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
                        .then(content => that.saveGeneratedFile(content, `${that.saveFileName}.zip`));
                    } else {
                        const blob = new Blob([JSON.stringify(stash)], { type: "application/json;charset=utf-8" });
                        this.saveGeneratedFile(blob, `${this.saveFileName}.microbetrace`);
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
              this.resetKeyTablesForNewDataset();
              const auspiceFile = { contents: out, name: this.getAuspiceName(auspiceUrl), extension: 'json', format: 'auspice', datatype: 'auspice'};
              this.commonService.session.files.push(auspiceFile);
              this.homepageTabs[0].componentRef.instance.addToTable(auspiceFile);
            //   console.log(this.homepageTabs[0].componentRef);
                // this.goldenLayout.componentInstances[0].addToTable(auspiceFile);
              //this.homepageTabs[0].componentRef.addToTable(auspiceFile);
              this.homepageTabs[0].isActive = true;
              console.log("Trying to launch");
              this.homepageTabs[0].componentRef.instance.launchClick();
              this.dismissWelcomeOverlay();
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
        this.keyTablesController.reset('Files');
        this.activeTabIndex = 0;
    }

    // Commonet back when implementing stash

    NewSession() {

        // Emit new session event for other components to reset/destroy
        this.commonService.onNewSession();
        this.resetKeyTablesForNewDataset();

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
                this.saveFileName = '';
                this.saveByCluster = false;
                this.selectedSaveFileType = 'session';
                this.displayStashDialog = true;
                break;
            }
            case "Open URL": {
              this.DisplayUrlDialog("Cancel");
              break;
            }
            case "Add Data": {

                // If files tab exists, go to it
                if(this.homepageTabs.findIndex(x => x.label === "Files") !== -1) {
                    this.focusHomepageTab("Files");
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
        viewName = this.normalizeDashboardLabel(viewName);

        if(this.commonService.debugMode) {
            console.log('--- viewClick: ', viewName);
            console.log(this.commonService.session.style.widgets['link-threshold']);
            console.log('homepage tabs: ' , this.homepageTabs);
            console.log('--- polygon color show11: ', this.commonService.session.style.widgets['polygons-color-show']);

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

            if (viewName === '2D Network' && !instance.cy) {
                if (instance.onLoadNewData) {
                    instance.onLoadNewData();
                }

                if (!instance.cy && instance._rerender) {
                    void instance._rerender();
                }
            } else if (
                ['Table', NetworkStatisticsComponent.componentTypeName, 'Crosstab', 'Aggregate'].includes(viewName) &&
                instance.onLoadNewData
            ) {
                instance.onLoadNewData();
            } else if (
                viewName === 'Waterfall' &&
                instance.onFilterDataChange
            ) {
                instance.onFilterDataChange();
            }

             //Load global settings changes if changed in another view
            if (instance.loadSettings) {        
                instance.loadSettings();
                if (this.metric === 'snps'){
                    this.commonService.session.style.widgets['default-distance-metric'] = 'snps';
                    this.commonService.session.style.widgets['link-threshold'] = Number(this.threshold);
                    this.onLinkThresholdChanged();
                }
            }

            if (instance.goldenLayoutComponentResize) {
                setTimeout(() => instance.goldenLayoutComponentResize(), 0);
            }

        }

    }

    DisplayGlobalSettingsDialog(request: GlobalSettingsDialogRequest = "Styling") {
        const dialogRequest = this.normalizeGlobalSettingsDialogRequest(request);
        this.GlobalSettingsDialogStyle = this.getGlobalSettingsDialogBaseStyle();

        this.getGlobalSettingsData();
        // TODO: May need to refacor this
        this.updateGlobalSettingsModel();


        this.GlobalSettingsDialogSettings.setVisibility(true);
        this.cachedGlobalSettingsVisibility = this.GlobalSettingsDialogSettings.isVisible;
        this.syncThresholdDisplayFromStoredValue();
        setTimeout(() => this.syncThresholdDisplayFromStoredValue(), 0);
        this.thresholdStabilityExpanded = false;

        this.commonService.updateThresholdHistogram(this.linkThresholdSparkline.nativeElement);
        this.refreshThresholdStabilityPanel(false);

        this.globalSettingsTab.tabs[dialogRequest.activeTab === "Styling" ? 1 : 0].active = true;

        if (dialogRequest.sourceDialogRect) {
            this.scheduleGlobalSettingsDialogPlacement(dialogRequest.sourceDialogRect);
        }
    }

    private normalizeGlobalSettingsDialogRequest(request: GlobalSettingsDialogRequest): NormalizedGlobalSettingsDialogRequest {
        if (typeof request === 'string') {
            return { activeTab: request };
        }

        return {
            activeTab: request?.activeTab ?? 'Styling',
            sourceDialogRect: request?.sourceDialogRect
        };
    }

    private getGlobalSettingsDialogBaseStyle(): Record<string, string> {
        return { 'z-index': String(this.GlobalSettingsDialogBaseZIndex) };
    }

    private getGlobalSettingsDialogPlacementStyle(top: number, left: number): Record<string, string> {
        const margin = this.linkedSettingsDialogViewportMargin;
        return {
            ...this.getGlobalSettingsDialogBaseStyle(),
            position: 'fixed',
            top: `${Math.round(top)}px`,
            left: `${Math.round(left)}px`,
            margin: '0',
            transform: 'none',
            overflow: 'auto',
            'max-height': `calc(100vh - ${margin * 2}px)`,
            'max-width': `calc(100vw - ${margin * 2}px)`
        };
    }

    private scheduleGlobalSettingsDialogPlacement(sourceDialogRect: DialogRectSnapshot): void {
        const runNextFrame = window.requestAnimationFrame?.bind(window) ?? ((callback: FrameRequestCallback) => window.setTimeout(() => callback(Date.now()), 0));

        setTimeout(() => {
            runNextFrame(() => {
                runNextFrame(() => this.positionGlobalSettingsDialogNearSource(sourceDialogRect));
            });
        }, 0);
    }

    private positionGlobalSettingsDialogNearSource(sourceDialogRect: DialogRectSnapshot): void {
        const dialog = this.getVisibleDialogByTitle('Global Settings');
        if (!dialog) {
            return;
        }

        const dialogRect = dialog.getBoundingClientRect();
        const dialogWidth = dialog.offsetWidth || dialogRect.width;
        const dialogHeight = dialog.offsetHeight || dialogRect.height;
        const placement = this.findBestGlobalSettingsDialogPlacement(sourceDialogRect, dialogWidth, dialogHeight);
        const style = this.getGlobalSettingsDialogPlacementStyle(placement.top, placement.left);

        this.GlobalSettingsDialogStyle = style;
        this.applyDialogStyle(dialog, style);
        this.cdref.detectChanges();
    }

    private getVisibleDialogByTitle(title: string): HTMLElement | undefined {
        return Array
            .from(document.querySelectorAll<HTMLElement>('.p-dialog'))
            .find(dialog => {
                const titleElement = dialog.querySelector<HTMLElement>('.p-dialog-title');
                const computedStyle = window.getComputedStyle(dialog);
                return titleElement?.textContent?.trim() === title
                    && computedStyle.display !== 'none'
                    && computedStyle.visibility !== 'hidden';
            });
    }

    private findBestGlobalSettingsDialogPlacement(
        sourceRect: DialogRectSnapshot,
        dialogWidth: number,
        dialogHeight: number
    ): DialogPlacementCandidate {
        const gap = this.linkedSettingsDialogGap;
        const margin = this.linkedSettingsDialogViewportMargin;
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
        const placementWidth = Math.min(dialogWidth, Math.max(0, viewportWidth - margin * 2));
        const placementHeight = Math.min(dialogHeight, Math.max(0, viewportHeight - margin * 2));
        const rawCandidates = [
            { left: sourceRect.right + gap, top: sourceRect.top },
            { left: sourceRect.left - placementWidth - gap, top: sourceRect.top },
            { left: sourceRect.left, top: sourceRect.bottom + gap },
            { left: sourceRect.left, top: sourceRect.top - placementHeight - gap }
        ];

        const candidates = rawCandidates.map(candidate => {
            const placement = this.clampDialogPlacement(candidate.left, candidate.top, placementWidth, placementHeight);
            return {
                ...placement,
                overlapArea: this.getDialogOverlapArea(
                    {
                        ...placement,
                        right: placement.left + placementWidth,
                        bottom: placement.top + placementHeight,
                        width: placementWidth,
                        height: placementHeight
                    },
                    sourceRect
                )
            };
        });

        return candidates.find(candidate => candidate.overlapArea === 0)
            ?? candidates.reduce((best, candidate) => candidate.overlapArea < best.overlapArea ? candidate : best);
    }

    private clampDialogPlacement(
        left: number,
        top: number,
        dialogWidth: number,
        dialogHeight: number
    ): { top: number; left: number } {
        const margin = this.linkedSettingsDialogViewportMargin;
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
        const maxLeft = Math.max(margin, viewportWidth - dialogWidth - margin);
        const maxTop = Math.max(margin, viewportHeight - dialogHeight - margin);

        return {
            left: this.clamp(left, margin, maxLeft),
            top: this.clamp(top, margin, maxTop)
        };
    }

    private getDialogOverlapArea(first: DialogRectSnapshot, second: DialogRectSnapshot): number {
        const width = Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left));
        const height = Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));

        return width * height;
    }

    private clamp(value: number, minimum: number, maximum: number): number {
        return Math.min(Math.max(value, minimum), maximum);
    }

    private applyDialogStyle(dialog: HTMLElement, style: Record<string, string>): void {
        Object.entries(style).forEach(([property, value]) => dialog.style.setProperty(property, value));
    }

    toggleThresholdStabilityPanel(): void {
        this.thresholdStabilityExpanded = !this.thresholdStabilityExpanded;
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
        this.commonService.activeTab = activeComponentName;
        this.keyTablesController.noteActiveTab(activeComponentName);


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
                this.cachedGlobalSettingsNodeShapeVisibility = this.GlobalSettingsNodeShapeDialogSettings.isVisible;
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

                break;
            }
            case NetworkStatisticsComponent.componentTypeName: {

                this.showSettings = false;
                this.showExport = true;
                this.showCenter = false;
                this.showPinAllNodes = false;
                this.showRefresh = false;
                this.showButtonGroup = true;
                this.showSorting = true;

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

                break;
            }
            case KeyTablesComponent.componentTypeName: {

                this.showSettings = false;
                this.showExport = false;
                this.showCenter = false;
                this.showPinAllNodes = false;
                this.showRefresh = false;
                this.showButtonGroup = false;
                this.showSorting = false;
                this.refreshKeyTablesView();

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


        this.syncFloatingKeyTableDialogs();
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
        if (tableId === '#node-color-table' || tableId === 'node-color-table'
            || tableId === '#key-tables-node-table' || tableId === 'key-tables-node-table') {
            this.nodeColorRows = [];
            this.nodeColorDomain = [];
            this.cdref.markForCheck();
            return;
        }

        if (tableId === '#link-color-table' || tableId === 'link-color-table'
            || tableId === '#key-tables-link-table' || tableId === 'key-tables-link-table') {
            this.linkColorRows = [];
            this.linkColorDomain = [];
            this.cdref.markForCheck();
            return;
        }

        if (tableId === '#node-shape-table' || tableId === 'node-shape-table'
            || tableId === '#key-tables-node-shape-table' || tableId === 'key-tables-node-shape-table') {
            this.shapeAggregates = [];
            this.cdref.markForCheck();
            return;
        }

        $(tableId).empty();
    }

    private normalizeKeyTableDisplayMode(value: any): KeyTableDisplayMode {
        return value === 'Show' || value === 'Dock' ? value : 'Hide';
    }

    private getKeyTableDisplayMode(table: KeyTableName): KeyTableDisplayMode {
        if (table === 'node-color') {
            return this.normalizeKeyTableDisplayMode(this.SelectedNodeColorTableTypesVariable);
        }

        if (table === 'link-color') {
            return this.normalizeKeyTableDisplayMode(this.SelectedLinkColorTableTypesVariable);
        }

        return this.normalizeKeyTableDisplayMode(this.SelectedNodeShapeTableTypesVariable);
    }

    private setKeyTableDisplayMode(table: KeyTableName, mode: KeyTableDisplayMode): void {
        const normalizedMode = this.normalizeKeyTableDisplayMode(mode);

        if (table === 'node-color') {
            this.SelectedNodeColorTableTypesVariable = normalizedMode;
            this.commonService.GlobalSettingsModel.SelectedNodeColorTableTypesVariable = normalizedMode;
            return;
        }

        if (table === 'link-color') {
            this.SelectedLinkColorTableTypesVariable = normalizedMode;
            this.commonService.GlobalSettingsModel.SelectedLinkColorTableTypesVariable = normalizedMode;
            return;
        }

        this.SelectedNodeShapeTableTypesVariable = normalizedMode;
        this.commonService.GlobalSettingsModel.SelectedNodeShapeTableTypesVariable = normalizedMode;
        this.commonService.session.style.widgets['node-symbol-table-visible'] = normalizedMode;
    }

    private keyTableHasSelectedValue(value?: string): boolean {
        return !!value && value !== 'None';
    }

    private keyTableHasSelectedVariable(table: KeyTableName): boolean {
        if (table === 'node-color') {
            return this.keyTableHasSelectedValue(this.SelectedColorNodesByVariable);
        }

        if (table === 'link-color') {
            return this.keyTableHasSelectedValue(this.SelectedColorLinksByVariable);
        }

        return this.keyTableHasSelectedValue(this.SelectedNodeSymbolVariable);
    }

    private getFloatingKeyTableDialog(table: KeyTableName): DialogSettings | undefined {
        if (table === 'node-color') {
            return this.GlobalSettingsNodeColorDialogSettings;
        }

        if (table === 'link-color') {
            return this.GlobalSettingsLinkColorDialogSettings;
        }

        return this.GlobalSettingsNodeShapeDialogSettings;
    }

    private clearFloatingKeyTable(table: KeyTableName): void {
        if (table === 'node-color') {
            this.nodeColorRows = [];
            this.nodeColorDomain = [];
            this.cdref.markForCheck();
            return;
        }

        if (table === 'link-color') {
            this.linkColorRows = [];
            this.linkColorDomain = [];
            this.cdref.markForCheck();
            return;
        }

        this.shapeAggregates = [];
        this.cdref.markForCheck();
    }

    private buildFloatingKeyTable(table: KeyTableName): void {
        if (!this.keyTableHasSelectedVariable(table)) {
            return;
        }

        if (table === 'node-color') {
            this.generateNodeColorTable('#node-color-table');
            return;
        }

        if (table === 'link-color') {
            this.generateNodeLinkTable('#link-color-table');
            return;
        }

        this.generateNodeShapeSelectionTable(this.SelectedNodeSymbolVariable);
    }

    private applyKeyTableDisplayMode(table: KeyTableName, silent: boolean = false): void {
        const mode = this.getKeyTableDisplayMode(table);

        if (!this.keyTableHasSelectedVariable(table)) {
            this.getFloatingKeyTableDialog(table)?.setVisibility(false);
            this.clearFloatingKeyTable(table);

            if (mode !== 'Dock' && this.isKeyTableDocked(table)) {
                this.keyTablesController.setDocked(table, false);

                if (!this.hasAnyDockedKeyTablesContent()) {
                    this.closeKeyTablesView();
                }
            }

            this.refreshKeyTablesView();
            if (!silent) {
                this.cdref.markForCheck();
            }
            return;
        }

        const dialog = this.getFloatingKeyTableDialog(table);

        if (mode === 'Dock') {
            this.keyTablesController.setDocked(table, true);
            dialog?.setVisibility(false);
            this.clearFloatingKeyTable(table);
            this.ensureKeyTablesViewOpen(false);
            this.refreshKeyTablesView();
            this.syncNodeValueDisplayNameCells();
            this.syncKeyTableColumnNameCells();
            this.cdref.markForCheck();
            return;
        }

        if (this.isKeyTableDocked(table)) {
            this.keyTablesController.setDocked(table, false);
        }

        if (!this.hasAnyDockedKeyTablesContent()) {
            this.closeKeyTablesView();
        }

        if (mode === 'Hide') {
            dialog?.setVisibility(false);
            this.clearFloatingKeyTable(table);
            this.refreshKeyTablesView();
            if (!silent) {
                this.cdref.markForCheck();
            }
            return;
        }

        dialog?.setVisibility(true);
        this.buildFloatingKeyTable(table);

        this.refreshKeyTablesView();
        this.syncNodeValueDisplayNameCells();
        this.syncKeyTableColumnNameCells();
        if (!silent) {
            this.cdref.markForCheck();
        }
    }

    public isKeyTableDocked(table: KeyTableName): boolean {
        return this.keyTablesController.isDocked(table);
    }

    public getKeyTableDockButtonTitle(table: KeyTableName): string {
        return this.keyTablesController.getDockButtonTitle(table);
    }

    public toggleKeyTableDocking(table: KeyTableName): void {
        this.setKeyTableDisplayMode(table, this.isKeyTableDocked(table) ? 'Show' : 'Dock');
        this.applyKeyTableDisplayMode(table);
    }

    public ensureDockedKeyTablesViewVisible(focusView: boolean = false): void {
        this.ensureKeyTablesViewOpen(focusView);
    }

    public refreshDockedKeyTablesView(): void {
        this.refreshKeyTablesView();
    }

    public closeDockedKeyTablesViewIfUnused(): void {
        if (!this.hasAnyDockedKeyTablesContent()) {
            this.closeKeyTablesView();
        }
    }

    // Hidden for now 5/19/26; to be removed if not needed
    // openKeyTablesView() {
    //     KEY_TABLE_NAMES.forEach(table => {
    //         this.markKeyTableVisible(table);
    //     });
    //     this.keyTablesController.dockAll();

    //     this.ensureKeyTablesViewOpen(false);
    //     this.commonService.visuals.twoD?.dockPolygonColorTableIfVisible();
    //     this.syncFloatingKeyTableDialogs();
    //     this.refreshKeyTablesView();
    // }

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

        //Styling|Color Nodes By
         this.SelectedColorNodesByVariable = this.commonService.session.style.widgets["node-color-variable"];
         this.onColorNodesByChanged(false);

         //Styling|Nodes
         this.SelectedNodeColorVariable = this.commonService.session.style.widgets["node-color"];
         this.onNodeColorChanged(true);
 
 
         //Styling|Color Links By
         this.SelectedColorLinksByVariable = this.commonService.session.style.widgets['link-color-variable'];

         this.onColorLinksByChanged(true);

          //Styling|Links
         this.SelectedLinkColorVariable = this.commonService.session.style.widgets["link-color"];
         this.onLinkColorChanged(true);

         this.applySavedNodeShapeSettingsFromSession();

         //Styling|Selected
         this.SelectedColorVariable = this.commonService.session.style.widgets['selected-color'];
 
         //Styling|Background
         this.SelectedBackgroundColorVariable = this.commonService.session.style.widgets['background-color'];
         this.onBackgroundChanged();

         this.store.setSettingsLoaded(true);

 
         this.updateGlobalSettingsModel();

    }

    publishLoadNewData() {

        console.log('--- publishLoadNewData called');
        const componentRefs = new Set<ComponentRef<any>>();

        this.homepageTabs.forEach(tab => {
            if (tab.componentRef) {
                componentRefs.add(tab.componentRef);
            }
        });

        const componentMap = (this._goldenLayoutHostComponent as any)?._componentRefMap as Map<any, ComponentRef<any>> | undefined;
        componentMap?.forEach(componentRef => componentRefs.add(componentRef));

        componentRefs.forEach(componentRef => {
            if (componentRef.instance?.onLoadNewData) {
                try {
                    componentRef.instance.onLoadNewData();
                } catch (error) {
                    const componentName = componentRef.instance?.constructor?.componentTypeName
                        ?? componentRef.instance?.constructor?.name
                        ?? 'dashboard component';
                    console.error(`Unable to load new data for ${componentName}.`, error);
                }
            }
        });
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

    private markKeyTableVisible(table: KeyTableName): void {
        switch (table) {
            case 'node-color':
                if (this.SelectedColorNodesByVariable !== 'None') {
                    this.setKeyTableDisplayMode('node-color', 'Dock');
                }
                break;
            case 'link-color':
                if (this.SelectedColorLinksByVariable !== 'None') {
                    this.setKeyTableDisplayMode('link-color', 'Dock');
                }
                break;
            case 'node-shape':
                if (this.SelectedNodeSymbolVariable !== 'None') {
                    this.setKeyTableDisplayMode('node-shape', 'Dock');
                }
                break;
        }
    }

    private focusHomepageTab(viewName: string): boolean {
        const tabIndex = this.homepageTabs.findIndex(tab => tab.label === viewName);
        if (tabIndex === -1) {
            return false;
        }

        this._goldenLayoutHostComponent.focusComponent(viewName);
        this.setActiveTabProperties(tabIndex);
        return true;
    }

    private shouldDisplayFloatingKeyTable(table: KeyTableName): boolean {
        return this.keyTablesController.shouldDisplayFloatingTable(table, {
            selectedColorNodesBy: this.SelectedColorNodesByVariable,
            selectedColorLinksBy: this.SelectedColorLinksByVariable,
            selectedNodeSymbol: this.SelectedNodeSymbolVariable,
            selectedNodeColorTableTypesVariable: this.SelectedNodeColorTableTypesVariable,
            selectedLinkColorTableTypesVariable: this.SelectedLinkColorTableTypesVariable,
            selectedNodeShapeTableTypesVariable: this.SelectedNodeShapeTableTypesVariable
        });
    }

    private syncFloatingKeyTableDialogs(): void {
        if (!this.GlobalSettingsNodeColorDialogSettings
            || !this.GlobalSettingsLinkColorDialogSettings
            || !this.GlobalSettingsNodeShapeDialogSettings) {
            return;
        }

        if (this.shouldDisplayFloatingKeyTable('node-color')) {
            this.GlobalSettingsNodeColorDialogSettings.setVisibility(true);
            this.generateNodeColorTable('#node-color-table');
        } else {
            this.GlobalSettingsNodeColorDialogSettings.setVisibility(false);
        }

        if (this.shouldDisplayFloatingKeyTable('link-color')) {
            this.GlobalSettingsLinkColorDialogSettings.setVisibility(true);
            this.generateNodeLinkTable('#link-color-table');
        } else {
            this.GlobalSettingsLinkColorDialogSettings.setVisibility(false);
        }

        if (this.shouldDisplayFloatingKeyTable('node-shape')) {
            this.GlobalSettingsNodeShapeDialogSettings.setVisibility(true);
            this.generateNodeShapeSelectionTable(this.SelectedNodeSymbolVariable);
        } else {
            this.GlobalSettingsNodeShapeDialogSettings.setVisibility(false);
        }
    }

    private hasAnyDockedKeyTablesContent(): boolean {
        return this.keyTablesController.hasDockedTables()
            || !!this.commonService.visuals.twoD?.isPolygonColorTableDocked;
    }

    private ensureDockedKeyTablesViewOpenIfNeeded(): void {
        if (this.hasAnyDockedKeyTablesContent() && !this.shouldUseKeyTablesView()) {
            this.ensureKeyTablesViewOpen(false);
        }
    }

    private getKeyTablesContextTab(): string | undefined {
        const contextTab = this.keyTablesController.getContextTab(this.commonService.activeTab);

        if (contextTab && contextTab !== 'Files') {
            return contextTab;
        }

        const launchView = this.normalizeDashboardLabel(
            this.commonService.session.style.widgets['default-view'] ?? ''
        );

        if (launchView && launchView !== 'Files') {
            return launchView;
        }

        return contextTab;
    }

    private ensureKeyTablesViewOpen(focusView: boolean = true): void {
        const viewName = KeyTablesComponent.componentTypeName;
        const contextTab = this.getKeyTablesContextTab();
        const tabToKeepActive = focusView
            ? undefined
            : contextTab;
        const existingTabIndex = this.homepageTabs.findIndex(tab => tab.label === viewName);
        const container = this._goldenLayoutHostComponent.dockComponentRight(viewName, viewName);
        const componentRef = this._goldenLayoutHostComponent.getComponentRef(container);

        if (existingTabIndex === -1 && componentRef) {
            this.addTab(viewName, viewName, this.homepageTabs.length, componentRef);

            if ((componentRef.instance as any).DisplayGlobalSettingsDialogEvent) {
                (componentRef.instance as any).DisplayGlobalSettingsDialogEvent.subscribe((v) => { this.DisplayGlobalSettingsDialog(v) });
            }
        }

        if (focusView) {
            this.focusHomepageTab(viewName);
        }

        setTimeout(() => {
            this._goldenLayoutHostComponent.resizeComponentWidth(viewName, 0.3);
            this.refreshKeyTablesView();

            if (focusView) {
                this.focusHomepageTab(viewName);
            } else if (tabToKeepActive) {
                this.focusHomepageTab(tabToKeepActive);
            }

            this.scheduleDockContextViewCenter(contextTab);
        });
    }

    private scheduleDockContextViewCenter(viewName?: string): void {
        if (!viewName || viewName === KeyTablesComponent.componentTypeName) {
            return;
        }

        setTimeout(() => {
            const componentRef = this._goldenLayoutHostComponent.getComponentRefByType(viewName);
            const instance = componentRef?.instance as any;

            if (!instance) {
                return;
            }

            if (instance.goldenLayoutComponentResize) {
                instance.goldenLayoutComponentResize();
            }

            if (instance.lmap?.invalidateSize) {
                instance.lmap.invalidateSize();
            }

            if (instance.openCenter) {
                instance.openCenter();
            } else if (instance.fit) {
                instance.fit();
            } else if (instance.centerMap) {
                instance.centerMap();
            }
        }, 250);
    }

    private closeKeyTablesView(): void {
        if (this.shouldUseKeyTablesView()) {
            this._removeGlView(KeyTablesComponent.componentTypeName, true);
        }
    }

    private shouldUseKeyTablesView(): boolean {
        return this.homepageTabs.some(tab => tab.label === KeyTablesComponent.componentTypeName);
    }

    private refreshKeyTablesView(): void {
        const keyTablesTab = this.homepageTabs.find(tab => tab.label === KeyTablesComponent.componentTypeName);
        if (keyTablesTab?.componentRef?.instance?.refreshTables) {
            keyTablesTab.componentRef.instance.refreshTables();
        }
    }

    ngOnDestroy(): void {
        if (this.timelineTablesRefreshHandle !== null) {
            clearTimeout(this.timelineTablesRefreshHandle);
            this.timelineTablesRefreshHandle = null;
        }

        this.NewSession();
    }

    getCurrentThresholdStepSize() {
        return this.store.currentThresholdStepSizeValue;
    }

    isTN93Selected() {
        return String(this.SelectedDistanceMetricVariable || this.commonService.session.style.widgets['default-distance-metric'] || '').toLowerCase() === 'tn93';
    }

    /**
     * Updates default-distance-metric widget and this.SelectedLinkThresholdVariable (7 for snps, 0.015 for TN93).
     * Calls onLinkThresholdChanged to updated links
     */
  onDistanceMetricChanged = async () => {
    if(!this.SelectedDistanceMetricVariable) this.SelectedDistanceMetricVariable = this.commonService.session.style.widgets['default-distance-metric'];
    const selectedMetric = String(this.SelectedDistanceMetricVariable).toLowerCase();
    this.SelectedDistanceMetricVariable = selectedMetric;
    this.metric = selectedMetric;
    this.store.updatecurrentThresholdStepSize(selectedMetric);
    let didRecomputeSequenceLinks = false;
    if (selectedMetric === 'snps') {
      $('#default-distance-threshold')
        .attr('step', 1)
        .val(16)
        .trigger('change');
      this.commonService.session.style.widgets['default-distance-metric'] = 'snps';
      this.commonService.GlobalSettingsModel.SelectedDistanceMetricVariable = 'snps';
      this.commonService.session.style.widgets["link-threshold"] = 16;
    } else {
      $('#default-distance-threshold')
        .attr('step', 0.001)
        .val(0.015)
        .trigger('change');
      this.commonService.session.style.widgets['default-distance-metric'] = 'tn93';
      this.commonService.GlobalSettingsModel.SelectedDistanceMetricVariable = 'tn93';
      this.commonService.session.style.widgets["link-threshold"] = 0.015;
    }
    this.syncThresholdDisplayFromStoredValue();

    didRecomputeSequenceLinks = await this.commonService.recomputeSequenceDerivedLinksForCurrentMetric();
    if (didRecomputeSequenceLinks && this.commonService.session.style.widgets["link-show-nn"]) {
      await this.commonService.computeMST();
      this.commonService.session.style.widgets["mst-computed"] = true;
    }

    this.onLinkThresholdChanged();

    if (didRecomputeSequenceLinks && this.commonService.session.style.widgets["link-show-nn"]) {
      this.commonService.session.style.widgets["mst-computed"] = true;
    }

    if (this.linkThresholdSparkline?.nativeElement) {
      this.commonService.updateThresholdHistogram(this.linkThresholdSparkline.nativeElement);
    }

    this.commonService.visuals.twoD?.refreshDistanceMetricSettings?.();
    this.refreshThresholdStabilityPanel();
  }

    private getThresholdSweepSnapshotAtThreshold(summary: ThresholdSweepSummary, threshold: number): ThresholdSweepSnapshot {
        const nodeCount = this.commonService.session.data.nodes.length;

        if (summary.thresholds.length === 0 || threshold < summary.thresholds[0]) {
            return {
                threshold,
                componentCount: nodeCount,
                clusterCount: 0,
                singletonCount: nodeCount,
                largestClusterSize: nodeCount > 0 ? 1 : 0,
                sourceThreshold: null
            };
        }

        let low = 0;
        let high = summary.thresholds.length - 1;
        let matchIndex = 0;

        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            if (summary.thresholds[mid] <= threshold) {
                matchIndex = mid;
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }

        return {
            threshold,
            componentCount: summary.componentCounts[matchIndex],
            clusterCount: summary.clusterCounts[matchIndex],
            singletonCount: summary.singletonCounts[matchIndex],
            largestClusterSize: summary.largestClusterSizes[matchIndex],
            sourceThreshold: summary.thresholds[matchIndex]
        };
    }

    private buildThresholdStabilityRegions(
        summary: ThresholdSweepSummary,
        currentThreshold: number
    ): ThresholdStabilityRegion[] {
        if (summary.thresholds.length < 2) {
            return [];
        }

        const regions: ThresholdStabilityRegion[] = [];
        let runStart = 0;

        const pushRegion = (startIndex: number, endIndex: number) => {
            const startThreshold = summary.thresholds[startIndex];
            const endThreshold = summary.thresholds[endIndex];
            const width = endThreshold - startThreshold;
            const samples = endIndex - startIndex + 1;

            if (width <= 0 && samples < 2) {
                return;
            }

            regions.push({
                startThreshold,
                endThreshold,
                suggestedThreshold: startThreshold + width / 2,
                width,
                samples,
                clusterCount: summary.clusterCounts[startIndex],
                singletonCount: summary.singletonCounts[startIndex],
                largestClusterSize: summary.largestClusterSizes[startIndex],
                componentCount: summary.componentCounts[startIndex],
                isCurrent: currentThreshold >= startThreshold && currentThreshold <= endThreshold
            });
        };

        for (let index = 1; index < summary.thresholds.length; index++) {
            if (summary.clusterCounts[index] !== summary.clusterCounts[runStart]) {
                pushRegion(runStart, index - 1);
                runStart = index;
            }
        }

        pushRegion(runStart, summary.thresholds.length - 1);

        return regions
            .sort((a, b) => {
                if (a.isCurrent !== b.isCurrent) {
                    return a.isCurrent ? -1 : 1;
                }

                const distanceFromCurrentA = Math.abs(a.suggestedThreshold - currentThreshold);
                const distanceFromCurrentB = Math.abs(b.suggestedThreshold - currentThreshold);
                if (distanceFromCurrentA !== distanceFromCurrentB) {
                    return distanceFromCurrentA - distanceFromCurrentB;
                }

                if (b.samples !== a.samples) {
                    return b.samples - a.samples;
                }

                if (b.width !== a.width) {
                    return b.width - a.width;
                }

                return a.startThreshold - b.startThreshold;
            })
            .slice(0, 3);
    }

    private getVisibleThresholdSnapshot(threshold: number): ThresholdSweepSnapshot {
        const visibleNodes = this.commonService.getVisibleNodes();
        const visibleClusters = this.commonService.getVisibleClusters();
        const clusterCount = visibleClusters.filter(cluster => cluster.nodes > 1).length;
        const singletonCount = visibleNodes.filter(node => Number(node.degree ?? 0) === 0).length;
        const largestClusterSize = visibleClusters.reduce((largest, cluster) => {
            return cluster.nodes > largest ? cluster.nodes : largest;
        }, 0);

        return {
            threshold,
            componentCount: visibleClusters.length,
            clusterCount,
            singletonCount,
            largestClusterSize,
            sourceThreshold: null
        };
    }

    refreshThresholdStabilityPanel(markForCheck = true): void {
        const nodes = this.commonService.session.data.nodes;

        if (!nodes || nodes.length === 0) {
            this.thresholdSweepMetricLabel = '';
            this.thresholdSweepSampleCount = 0;
            this.thresholdStabilityCurrent = null;
            this.thresholdStabilityRegions = [];
            this.thresholdStabilityMessage = '';
            if (markForCheck) {
                this.cdref.markForCheck();
            }
            return;
        }

        const metric = this.SelectedLinkSortVariable || this.commonService.session.style.widgets["link-sort-variable"];
        const threshold = Number(this.commonService.session.style.widgets["link-threshold"]);
        const summary = this.commonService.getThresholdSweepSummary(metric);

        this.thresholdSweepMetricLabel = metric;
        this.thresholdSweepSampleCount = summary.thresholds.length;
        this.thresholdStabilityCurrent = this.getVisibleThresholdSnapshot(threshold);
        this.thresholdStabilityRegions = this.buildThresholdStabilityRegions(summary, threshold);

        if (summary.thresholds.length === 0) {
            this.thresholdStabilityMessage = `No numeric ${this.commonService.titleize(metric)} values are available for this view.`;
        } else if (this.thresholdStabilityRegions.length === 0) {
            this.thresholdStabilityMessage = 'No broad flat range was found for the current metric.';
        } else {
            this.thresholdStabilityMessage = '';
        }

        if (markForCheck) {
            this.cdref.markForCheck();
        }
    }

    applyThresholdStabilitySuggestion(region: ThresholdStabilityRegion): void {
        this.threshold = String(region.suggestedThreshold);
        this.SelectedLinkThresholdVariable = region.suggestedThreshold;
        this.commonService.GlobalSettingsModel.SelectedLinkThresholdVariable = this.SelectedLinkThresholdVariable;
        this.executeThresholdChange(region.suggestedThreshold);
    }

    formatThresholdStabilityClusterLabel(clusterCount: number): string {
        return `${clusterCount.toLocaleString()} ${clusterCount === 1 ? 'cluster' : 'clusters'}`;
    }

    formatThresholdStabilitySampleLabel(sampleCount: number): string {
        return `${sampleCount.toLocaleString()} ${sampleCount === 1 ? 'distinct threshold' : 'distinct thresholds'}`;
    }

    describeThresholdStabilityRegion(region: ThresholdStabilityRegion): string {
        const currentThreshold = Number(this.commonService.session.style.widgets["link-threshold"]);

        if (region.isCurrent) {
            return 'Current threshold sits in this flat range.';
        }

        if (region.suggestedThreshold < currentThreshold) {
            return 'Lower-threshold option.';
        }

        if (region.suggestedThreshold > currentThreshold) {
            return 'Higher-threshold option.';
        }

        return 'Alternative flat range.';
    }

    formatThresholdStabilityValue(value: number | null | undefined): string {
        return this.commonService.formatDisplayedDistanceValue(value, this.getThresholdFieldName());
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
