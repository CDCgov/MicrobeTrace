import { Component, Output, EventEmitter, OnInit, Inject, ElementRef, ChangeDetectionStrategy, ChangeDetectorRef, NgZone, HostListener } from '@angular/core';
import { CommonService } from '../contactTraceCommonServices/common.service';
import * as XLSX from 'xlsx';
import * as Papa from 'papaparse';
import { saveAs } from 'file-saver';
import * as fileto from 'fileto';
import { generateCanvas } from '../visualizationComponents/AlignmentViewComponent/generateAlignmentViewCanvas';
import * as tn93 from 'tn93';
import * as _ from 'lodash';
import JSZip from 'jszip';
import { MicrobeTraceNextVisuals } from '../microbe-trace-next-plugin-visuals';
import { EventEmitterService } from '@shared/utils/event-emitter.service';
import { BaseComponentDirective } from '@app/base-component.directive';
import { ComponentContainer } from 'golden-layout';
import { cloneDeep } from 'lodash';
import { Subject, Subscription, takeUntil } from 'rxjs';
import { CommonStoreService } from '@app/contactTraceCommonServices/common-store.services';
import { relativeTimeThreshold } from 'moment';
import { EmbedHandoffService } from '@app/embed/embed-handoff.service';
import { ImportedEmbedFile } from '@app/embed/embed-handoff.types';
import { WorkerComputeService } from '@app/contactTraceCommonServices/worker-compute.service';
import { GraphMLService } from '@app/contactTraceCommonServices/graphml.service';
// import { ComponentContainer } from 'golden-layout';
// import { ConsoleReporter } from 'jasmine';


@Component({
    selector: 'FilesComponent',
    templateUrl: './files-plugin.component.html',
    styleUrls: ['./files-plugin.component.less'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})

export class FilesComponent extends BaseComponentDirective implements OnInit {

  @Output() LoadDefaultVisualizationEvent = new EventEmitter();

  auspiceUrlVal: any;

  SelectedDefaultDistanceMetricVariable: string = "snps";
  SelectedAmbiguityResolutionStrategyVariable: string = "AVERAGE";
  SelectedAmbiguityThresholdVariable: any = 0.015;
  SelectedDefaultDistanceThresholdVariable: any = 16;
  SelectedDefaultViewVariable: string = "2D Network";
  readonly DefaultViewOptions: string[] = [
    '2D Network',
    'Epi Curve',
    'Sankey',
    'Table',
    'Crosstab',
    'Map',
    'Bubble',
    'Gantt Chart',
    'Phylogenetic Tree',
    'Alignment View',
    'Heatmap',
    'Waterfall'
  ];

  AlignTypes: any = [
    { label: 'None', value: 'None' },
    { label: 'Smith-Waterman', value: 'Smith-Waterman' }
  ];
  SelectedAlignTypeVariable: string = "None";

  isLoadingFiles: boolean = false;

  ReferenceTypes: any = [
    { label: 'LoadFrom FASTA', value: 'LoadFrom FASTA' },
    { label: 'First Sequence', value: 'First Sequence' },
    { label: 'Consensus', value: 'Consensus' }
  ];
  SelectedReferenceTypeVariable: string = "LoadFrom FASTA";

  SelectedRefSeqFileLoadVariable: string = "";


  RefSeqIDTypes: any = [

  ];
  SelectedRefSeqIDVariable: string = "";

  SelectedAlignerMatchVariable: any = "1";
  SelectedAlignerMismatchVariable: any = 1;
  SelectedAlignerGapOVariable: any = 5;
  SelectedAlignerGapEVariable: any = 2;

  IsReferenceSourceSelected: boolean = false;
  IsReferenceOptionsSelected: boolean = true;
  SelectedAuditEmptyVariable: boolean = true;
  SelectedAuditGapsVariable: boolean = true;
  SelectedAuditRNAVariable: boolean = true;
  SelectedAuditAminoAcidsVariable: boolean = true;
  SelectedAuditCIGARVariable: boolean = true;
  SelectedAuditMalformedVariable: boolean = true;

  IsDataAvailable: boolean = false;
  messages: any[];
  displayFileSettings: boolean = false;
  displaySequenceSettings: boolean = false;
  displayloadingInformationModal: boolean = false;
  handoffError: string | null = null;

  get hasLaunchableFiles(): boolean {
    return !this.isLoadingFiles && (this.commonService.session?.files?.length ?? 0) > 0;
  }

  nodeIds: { fileName: string; ids: string[] }[] = [];
  edgeIds: { fileName: string; ids: { source: string; target: string }[] }[] = [];

  uniqueNodes: string[] = [];
  uniqueEdgeNodes: string[] = [];

  public title: string;
  public id: string;

  private pendingNetworkImportWarnings: string[] = [];
  private destroy$ = new Subject<void>();
  private loadViewSubscription?: Subscription;

  

  constructor(
    @Inject(BaseComponentDirective.GoldenLayoutContainerInjectionToken) private container: ComponentContainer, elRef: ElementRef,
    private eventEmitterService: EventEmitterService,
    public commonService: CommonService,
    private cdr: ChangeDetectorRef,
    private store: CommonStoreService,
    private embedHandoffService: EmbedHandoffService,
    private ngZone: NgZone,
    private workerComputeService: WorkerComputeService,
    private graphMLService: GraphMLService
    ) {

    super(elRef.nativeElement);

    // this.title = this.container.title;
    this.id = this.container.parent.id;

  }

  private refreshTemplateState(): void {
    this.ngZone.run(() => {
      this.cdr.markForCheck();
    });
  }

  private addSessionDataField(fields: string[], field: string): void {
    if (field && !this.commonService.includes(fields, field)) {
      fields.push(field);
    }
  }

  private addImportedTableField(
    record: Record<string, any>,
    fields: string[],
    domain: 'node' | 'link',
    key: any,
    value: any,
    prefix: string
  ): void {
    const safeKey = this.commonService.filterXSS(key);
    if (!safeKey) return;

    const safeValue = this.commonService.filterXSS(value);
    this.graphMLService
      .addImportedSourceField(record, domain, safeKey, safeValue, prefix)
      .forEach(field => this.addSessionDataField(fields, field));
  }

  private addLinkEndpointNode(nodeId: any, origin: string[], check: any): number {
    const id = this.commonService.filterXSS(`${nodeId ?? ''}`).trim();
    if (!id) {
      return 0;
    }

    if (check) {
      const existingNode = this.commonService.session.data.nodes.find((node: any) => node._id === id);
      if (existingNode) {
        const existingOrigin = Array.isArray(existingNode.origin)
          ? existingNode.origin
          : (existingNode.origin === undefined || existingNode.origin === null ? [] : [existingNode.origin]);
        existingNode.origin = this.commonService.uniq(existingOrigin.concat(origin));
        return 0;
      }
    }

    return this.commonService.addNode({
      _id: id,
      origin
    }, true);
  }

  private buildNodeTableRecord(node: any, file: any, origin: string[]): Record<string, any> {
    const safeNode: Record<string, any> = {
      _id: this.commonService.filterXSS('' + node[file.field1]),
      seq: (!file.field2 || file.field2 === 'None') ? '' : this.commonService.filterXSS(node[file.field2]),
      origin
    };

    Object.keys(node).forEach(key => {
      this.addImportedTableField(
        safeNode,
        this.commonService.session.data.nodeFields,
        'node',
        key,
        node[key],
        'node_table'
      );
    });

    return safeNode;
  }

  private isFileDragEvent(evt: DragEvent): boolean {
    const transfer = evt.dataTransfer;
    if (!transfer) {
      return false;
    }

    return Array.from(transfer.types || []).includes('Files') || transfer.files.length > 0;
  }

  private isFilesViewVisible(): boolean {
    const style = window.getComputedStyle(this.rootHtmlElement);

    return style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      this.rootHtmlElement.getClientRects().length > 0;
  }

  private isFilesPageDropEnabled(): boolean {
    return this.commonService.activeTab === FilesComponent.componentTypeName || this.isFilesViewVisible();
  }

  @HostListener('document:dragover', ['$event'])
  onDocumentDragOver(evt: DragEvent): void {
    if (!this.isFilesPageDropEnabled()) {
      return;
    }

    evt.preventDefault();
    if (evt.dataTransfer) {
      evt.dataTransfer.dropEffect = 'copy';
    }
  }

  @HostListener('document:drop', ['$event'])
  onDocumentDrop(evt: DragEvent): void {
    if (!this.isFilesPageDropEnabled() || !this.isFileDragEvent(evt)) {
      return;
    }

    evt.preventDefault();
    evt.stopPropagation();
    void this.processFiles(evt.dataTransfer?.files);
  }

  private normalizeDefaultView(value: any): string {
    const normalizedView = this.commonService.normalizeViewName(value);
    return normalizedView && this.DefaultViewOptions.includes(normalizedView)
      ? normalizedView
      : '2D Network';
  }

  private setDefaultView(value: any, persist: boolean = true): string {
    const normalizedView = this.normalizeDefaultView(value);
    this.SelectedDefaultViewVariable = normalizedView;
    this.commonService.session.style.widgets['default-view'] = normalizedView;

    if (this.commonService.session.layout?.content?.[0]) {
      this.commonService.session.layout.content[0].type = normalizedView;
    }

    if (persist) {
      this.commonService.localStorageService.setItem('default-view', normalizedView);
    }

    return normalizedView;
  }

  private setLaunchButtonsDisabled(disabled: boolean, focusPrimary: boolean = false): void {
    $(this.rootHtmlElement).find('.files-launch-action').prop('disabled', disabled);
    if (!disabled && focusPrimary) {
      $(this.rootHtmlElement).find('#launch').focus();
    }
    this.refreshTemplateState();
  }

  private syncGlobalSettingsModelFromWidgets(): void {
    const widgets = this.commonService.session.style.widgets;
    Object.assign(this.commonService.GlobalSettingsModel, {
      SelectedColorNodesByVariable: widgets['node-color-variable'] ?? 'None',
      SelectedColorLinksByVariable: widgets['link-color-variable'] ?? 'origin',
      SelectedNodeSymbolVariable: widgets['node-symbol-variable'] ?? 'None',
      SelectedNodeColorVariable: widgets['node-color'] ?? '#1f77b4',
      SelectedLinkColorVariable: widgets['link-color'] ?? '#a6cee3',
      SelectedPruneWithTypesVariable: 'None',
      SelectedStatisticsTypesVariable: 'Hide',
      SelectedClusterMinimumSizeVariable: widgets['cluster-minimum-size'] ?? 1,
      SelectedLinkSortVariable: widgets['link-sort-variable'] ?? 'distance',
      SelectedLinkThresholdVariable: widgets['link-threshold'] ?? 16,
      SelectedDistanceMetricVariable: widgets['default-distance-metric'] ?? 'snps',
      SelectedLinkColorTableTypesVariable: 'Dock',
      SelectedNodeColorTableTypesVariable: 'Dock',
      SelectedNodeShapeTableTypesVariable: widgets['node-symbol-table-visible'] ?? 'Dock',
      SelectedColorVariable: widgets['selected-color'] ?? '#ff8300',
      SelectedBackgroundColorVariable: widgets['background-color'] ?? '#ffffff',
      SelectedApplyStyleVariable: '',
      SelectedRevealTypesVariable: 'Everything'
    });
  }

  private syncFileSettingsControlsFromWidgets(): void {
    const widgets = this.commonService.session.style.widgets;
    const metric = String(widgets['default-distance-metric'] ?? 'snps').toLowerCase();
    const threshold = widgets['link-threshold'] ?? 16;
    const ambiguityStrategy = widgets['ambiguity-resolution-strategy'] ?? 'AVERAGE';
    const ambiguityThreshold = widgets['ambiguity-threshold'] ?? 0.015;
    const defaultView = this.normalizeDefaultView(widgets['default-view']);

    this.SelectedDefaultDistanceMetricVariable = metric;
    this.SelectedDefaultDistanceThresholdVariable = threshold;
    this.SelectedAmbiguityResolutionStrategyVariable = ambiguityStrategy;
    this.SelectedAmbiguityThresholdVariable = ambiguityThreshold;
    this.SelectedDefaultViewVariable = defaultView;
    widgets['default-view'] = defaultView;

    $('#default-distance-metric').val(metric);
    $('#default-distance-threshold').attr('step', metric === 'snps' ? 1 : 0.001).val(threshold);
    $('#ambiguity-resolution-strategy').val(ambiguityStrategy);
    $('#ambiguity-threshold').val(ambiguityThreshold);
    $('#default-view').val(defaultView);

    if (metric === 'snps') {
      $('#ambiguities-row').slideUp();
    } else {
      $('#ambiguities-row').slideDown();
    }

    if (ambiguityStrategy === 'HIVTRACE-G') {
      $('#ambiguity-threshold-row').slideDown();
    } else {
      $('#ambiguity-threshold-row').slideUp();
    }

    this.store.setMetricChanged(metric);
    this.store.updatecurrentThresholdStepSize(metric);
    this.store.setLinkThreshold(threshold);
  }

  private resetSettingsForLaunch(): void {
    this.commonService.visuals?.microbeTrace?.resetKeyTablesForNewDataset?.();
    this.commonService.session.style = cloneDeep(this.commonService.sessionSkeleton().style);
    this.syncFileSettingsControlsFromWidgets();
    this.syncGlobalSettingsModelFromWidgets();

    const widgets = this.commonService.session.style.widgets;
    const microbeTrace = this.commonService.visuals?.microbeTrace as any;
    if (microbeTrace) {
      microbeTrace.SelectedColorNodesByVariable = widgets['node-color-variable'] ?? 'None';
      microbeTrace.SelectedColorLinksByVariable = widgets['link-color-variable'] ?? 'origin';
      microbeTrace.SelectedNodeSymbolVariable = widgets['node-symbol-variable'] ?? 'None';
      microbeTrace.SelectedNodeColorVariable = widgets['node-color'] ?? '#1f77b4';
      microbeTrace.SelectedLinkColorVariable = widgets['link-color'] ?? '#a6cee3';
      microbeTrace.SelectedBackgroundColorVariable = widgets['background-color'] ?? '#ffffff';
      microbeTrace.SelectedDistanceMetricVariable = widgets['default-distance-metric'] ?? 'snps';
      microbeTrace.metric = microbeTrace.SelectedDistanceMetricVariable;
      microbeTrace.SelectedLinkThresholdVariable = widgets['link-threshold'] ?? 16;
      microbeTrace.threshold = String(microbeTrace.SelectedLinkThresholdVariable);
      microbeTrace.SelectedLinkSortVariable = widgets['link-sort-variable'] ?? 'distance';
      microbeTrace.syncThresholdDisplayFromStoredValue?.();
      microbeTrace.getGlobalSettingsData?.();
      microbeTrace.refreshKeyTablesView?.();
      microbeTrace.cdref?.markForCheck?.();
    }

    this.commonService.createNodeColorMap();
    this.commonService.createLinkColorMap();
    this.commonService.createPolygonColorMap();
    this.refreshTemplateState();
  }

  ngOnInit() {

    this.RefSeqIDTypes.push(
      { label: 'Pol', value: this.commonService.HXB2.substr(2000, 2100) });

    this.RefSeqIDTypes.push(
      { label: 'Complete', value: this.commonService.HXB2 });


    this.SelectedDefaultDistanceThresholdVariable = this.commonService.GlobalSettingsModel.SelectedLinkThresholdVariable;
    this.SelectedDefaultDistanceMetricVariable = this.commonService.GlobalSettingsModel.SelectedDistanceMetricVariable;
    this.loadViewSubscription = this.commonService.LoadViewEvent.subscribe((v) => { this.loadDefaultVisualization(v); });
    this.commonService.session.data.reference = this.commonService.HXB2.substr(2000, 2100);

    if (this.eventEmitterService.subsVar==undefined) {    
      this.eventEmitterService.subsVar = this.eventEmitterService.    
        invokeFirstComponentFunction.subscribe((name:string) => {    
          this.processFile();    
        });    
    }  

     // Subscribe to new session event
     this.store.newSession$
      .pipe(takeUntil(this.destroy$))
      .subscribe((isNewSession) => {
        if (isNewSession) {
          this.removeAllFiles();
          this.store.setNewSession(false);
        }
      });

    // Subscribe to style file applied event
    this.store.styleFileApplied$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.applyStyleFileSettings();
      });

    this.store.FP_removeFiles$
      .pipe(takeUntil(this.destroy$))
      .subscribe((shouldRemoveFiles) => {
        if (!shouldRemoveFiles) {
          return;
        }

        this.commonService.session.files.forEach(file => {
          this.removeFile(file.name, false);
        });
        this.store.setFP_removeFiles(false);
      });

    // TODO: the rest of ngOnInit can be revised to take advantage of angular features
    $('.alignConfigRow').hide();

    $('#align-sw').parent().on('click', () => {

      this.commonService.session.style.widgets['align-sw'] = true;
      this.commonService.session.style.widgets['align-none'] = false;
      $('.alignConfigRow, #reference-file-row').slideDown();
      $('#alignment-preview').slideUp(function () {

        //debugger;

        $(this).empty().show();
      });
    });

    $('#align-none').parent().on('click', () => {

      this.commonService.session.style.widgets['align-sw'] = false;
      this.commonService.session.style.widgets['align-none'] = true;
      $('.alignConfigRow, #reference-file-row').slideUp();
      $('#alignment-preview').slideUp(function () {

        //debugger;

        $(this).empty().show();
      });
    });

    $('#reference-source-file').parent().on('click', () => {

      //debugger;

      this.commonService.session.style.widgets['reference-source-file'] = true;
      this.commonService.session.style.widgets['reference-source-first'] = false;
      this.commonService.session.style.widgets['reference-source-consensus'] = false;
      this.commonService.session.data.reference = $('#refSeqID').val().toString();

      //debugger;

      if (!this.commonService.session.style.widgets['align-none']) $('#reference-file-row').slideDown();
    });

    $('#reference-source-first').parent().on('click', () => {
      this.commonService.session.style.widgets['reference-source-file'] = false;
      this.commonService.session.style.widgets['reference-source-first'] = true;
      this.commonService.session.style.widgets['reference-source-consensus'] = false;
      $('#reference-file-row').slideUp();
    });

    $('#reference-source-consensus').parent().on('click', () => {
      this.commonService.session.style.widgets['reference-source-file'] = false;
      this.commonService.session.style.widgets['reference-source-first'] = false;
      this.commonService.session.style.widgets['reference-source-consensus'] = true;
      $('#reference-file-row').slideUp();
    });

    $('#reference-file-row').hide();

    $('#refSeqFileLoad').on('change', () => {

      //debugger;

      const file = this.commonService.session.files[0];   //this.files[0];
      let reader = new FileReader();
      reader.onloadend = (e: any) => {
        if (e.target.readyState === FileReader.DONE) {
          this.commonService.parseFASTA(e.target.result).then(nodes => {
            $('#refSeqID')
              .html(nodes.map((d, i) => `
                                <option value="${this.commonService.filterXSS(d.seq)}" ${i === 0 ? "selected" : ""}>${this.commonService.filterXSS(d.id)}</option>
                              `))
              .trigger('change');
          });
          $('label[for="refSeqFileLoad"]').text(this.commonService.filterXSS(file.name));
        }
      };
      reader.readAsText(file);
    });

    $('#refSeqID').html(`
          <option value="${this.commonService.HXB2.substr(2000, 2100)}" selected>Pol</option>
          <option value="${this.commonService.HXB2}">Complete</option>
        `).on('change', (e) => {

          //debugger;
          const target = e.target as HTMLInputElement | HTMLSelectElement | null;
          this.commonService.session.data.reference = target?.value ?? e.data;

        });

    $('#alignment-preview').on('click', () => {
      this.readFastas().then(data => {
        if (this.commonService.session.style.widgets['reference-source-first']) {

          //debugger;

          this.commonService.session.data.reference = ""; //nodes[0].seq;
        }
        if (this.commonService.session.style.widgets['reference-source-consensus']) {
          this.commonService.computeConsensus().then(consensus => this.commonService.session.data.reference = consensus);
        }
        this.updatePreview(data);
      });
    });

    const auditBlock = $('#audited-sequences');

    const logAudit = (parentContext, id, type) => {
      const match = auditBlock.find(`[data-id="${id}"]`);
      const button = $(`<button class="btn btn-warning btn-sm audit-exclude" data-id="${id}">Exclude</button>`).on('click', function () {
        const thi$ = $(this);
        const id = thi$.data('id');
        if (thi$.text() === 'Exclude') {
          parentContext.commonService.session.data.nodeExclusions.push(id);
          thi$.removeClass('btn-warning').addClass('btn-success').text('Include');
        } else {
          parentContext.commonService.session.data.nodeExclusions.splice(parentContext.commonService.session.data.nodeExclusions.indexOf(id), 1);
          thi$.removeClass('btn-success').addClass('btn-warning').text('Exclude');
        }
      });
      const row = $(`<div class="alert alert-warning w-100 d-flex justify-content-between" role="alert"><span>${id} appears to be ${type}.</span></div>`);
      row.append(button);
      auditBlock.append(row);
    };

    $('#audit-launcher').on('click', () => {
      this.readFastas().then(data => {
        const start = Date.now();
        const isGaps = /^-+$/;
        const isRNA = /^[ACGURYMKWSBDHVN-]+$/;
        const isAA = /^[ARNDCQEGHILKMFPSTWYVBZN]+$/;
        const isDNA = /^[ACGTRYMKWSBDHVN-]+$/;
        const isCIGAR = /^[0-9MIDNSHP=X]+$/;
        const isMalformed = /[^ACGTURYMKWSBDHVNQEILFPZX0-9-]+/;
        const checkEmpty = $('#audit-empty').is(':checked');
        const checkGaps = $('#audit-gaps').is(':checked');
        const checkRNA = $('#audit-RNA').is(':checked');
        const checkAA = $('#audit-amino-acids').is(':checked');
        const checkCIGAR = $('#audit-CIGAR').is(':checked');
        const checkMalformed = $('#audit-malformed').is(':checked');
        // const any = false;
        data.forEach(d => {
          const seq = d.seq, id = d.id;
          if (checkEmpty && seq === '') logAudit(this, id, 'empty');
          if (checkGaps && isGaps.test(seq)) logAudit(this, id, 'all gaps')
          if (checkRNA && isRNA.test(seq) && !isGaps.test(seq)) logAudit(this, id, 'RNA');
          if (checkAA && isAA.test(seq) && !isDNA.test(seq)) logAudit(this, id, 'amino acids');
          if (checkCIGAR && isCIGAR.test(seq)) logAudit(this, id, 'a CIGAR');
          if (checkMalformed && isMalformed.test(seq)) logAudit(this, id, 'malformed');
        });
        console.log('Sequence Auditing time:', (Date.now() - start).toLocaleString(), 'ms');
      });
    });

    $('#audit-toggle-all').on('click', () => {
      $('.audit-exclude').trigger('click');
    });

    $('#default-distance-metric').change((e) => {

      //debugger;

      const target = e.target as HTMLInputElement | HTMLSelectElement | null;
      const lsv = target?.value ?? e.data ?? 'tn93';
      this.commonService.localStorageService.setItem('default-distance-metric', lsv);
      $('#default-distance-metric').val(lsv);
      console.log(lsv);
      if (lsv.toLowerCase() === 'snps') {
        $('#ambiguities-row').slideUp();
        $('#default-distance-threshold') //, #link-threshold')
          .attr('step', 1)
          .val(16);
        this.SelectedDefaultDistanceThresholdVariable = 16;
        this.commonService.session.style.widgets['link-threshold'] = 16;
        this.commonService.GlobalSettingsModel.SelectedLinkThresholdVariable = 16;
        console.log('default-distance-metric change file-plugin.component.ts snps');
        this.store.setLinkThreshold(16);
      } else {
        $('#ambiguities-row').slideDown();
        $('#default-distance-threshold') //, #link-threshold')
          .attr('step', 0.001)
          .val(0.015);
        this.SelectedDefaultDistanceThresholdVariable = 0.015;
        this.commonService.session.style.widgets['link-threshold'] = 0.015;
        this.commonService.GlobalSettingsModel.SelectedLinkThresholdVariable = 0.015;
        console.log('default-distance-metric change file-plugin.component.ts tn93');
        this.store.setLinkThreshold(0.015);
      }
      this.commonService.session.style.widgets['default-distance-metric'] = lsv;
      this.commonService.GlobalSettingsModel.SelectedDefaultDistanceMetricVariable = lsv;
    });

    let cachedLSV = "";
    this.commonService.localStorageService.getItem('default-distance-metric', (result) => {
      cachedLSV = result;

      if (cachedLSV) {
        $('#default-distance-metric').val(cachedLSV).trigger('change');
      }
    });



    $('#ambiguity-resolution-strategy').on('change', (e) => {

      //debugger;

      const target = e.target as HTMLInputElement | HTMLSelectElement | null;
      const v = target?.value ?? e.data;
      this.commonService.session.style.widgets['ambiguity-resolution-strategy'] = v;
      if (v === 'HIVTRACE-G') {
        $('#ambiguity-threshold-row').slideDown();
      } else {
        $('#ambiguity-threshold-row').slideUp();
      }
    }).change();

    $('#ambiguity-threshold').on('change', (e) => {

      //debugger;

      const target = e.target as HTMLInputElement | HTMLSelectElement | null;
      const v = parseFloat(String(target?.value ?? e.data));
      this.commonService.session.style.widgets['ambiguity-threshold'] = v;
    });

    $('#default-view')
      .on('change', (e) => {

        //debugger;

        const target = e.target as HTMLInputElement | HTMLSelectElement | null;
        const v = this.setDefaultView(target?.value ?? e.data);
        $(target).val(v);
        this.refreshTemplateState();
      })
      .val(this.setDefaultView(this.commonService.session.style.widgets['default-view'], false));

    this.commonService.localStorageService.getItem('default-view', (_err, result) => {
      const v = this.setDefaultView(result ?? this.commonService.session.style.widgets['default-view'], Boolean(result));
      $('#default-view').val(v);
      this.refreshTemplateState();
    });

    // $.getJSON("../assets/outbreak.microbetrace", (window as any).context.commonService.applySession);
    // Use this when building production (.ie gh-pages branch)
    if (!this.auspiceUrlVal) {
      this.auspiceUrlVal = this.commonService.getURL();
    }

    const skipDemoSession = new URL(window.location.href).searchParams.get('skipDemoSession') === '1';
    const hasPendingHandoff = this.embedHandoffService.hasPendingHandoffInUrl();

    if (skipDemoSession || hasPendingHandoff) {
      this.commonService.session.network.initialLoad = true;
    }

    if (hasPendingHandoff) {
      this.loadPendingEmbedHandoff();
    }

    if(!this.commonService.session.network.initialLoad && !this.auspiceUrlVal && this.commonService.session.data.nodes.length === 0) {
      console.log('launching outbreak');
      const defaultLoadGeneration = this.commonService.getDataLoadGeneration();

      $.getJSON("COVID_DummySession.microbetrace").then((defaultSession) => {
        if (
          !this.commonService.isCurrentDataLoad(defaultLoadGeneration) ||
          this.commonService.session.network.initialLoad ||
          this.commonService.session.data.nodes.length > 0
        ) {
          return;
        }

        this.commonService.applySession(defaultSession).then(() => {
          this.populateTable();
        });
        this.commonService.session.network.launched = true;
        this.commonService.session.network.initialLoad = true;
      });

    }

    setTimeout(() => {
      if (this.commonService.session.files?.length) {
        this.populateTable();
      } else {
        this.refreshTemplateState();
      }
    });

    // console.log('session: ', this.commonService?.session?.files, this.commonService.session.files.length);
  }

  private setDefaultDistanceControls(metric: 'snps' | 'tn93', threshold: number, step: number): void {
    this.commonService.session.style.widgets['default-distance-metric'] = metric;
    this.commonService.session.style.widgets['link-threshold'] = threshold;
    this.SelectedDefaultDistanceMetricVariable = metric;
    this.SelectedDefaultDistanceThresholdVariable = String(threshold);
    this.store.updatecurrentThresholdStepSize(metric);
    this.commonService.GlobalSettingsModel.SelectedDistanceMetricVariable = metric;
    this.commonService.GlobalSettingsModel.SelectedLinkThresholdVariable = threshold;
    $('#default-distance-metric').val(metric);
    $('#default-distance-threshold').attr('step', step).val(threshold);

    const microbeTrace = this.commonService.visuals?.microbeTrace;
    if (microbeTrace) {
      microbeTrace.SelectedDistanceMetricVariable = metric;
      microbeTrace.metric = metric;
      microbeTrace.SelectedLinkThresholdVariable = threshold;
      microbeTrace.threshold = String(threshold);
      microbeTrace.syncThresholdDisplayFromStoredValue?.();
    }
  }

  private applyPatristicDistanceDefaults(maxDistance: number): number {
    const configuredThreshold = parseFloat(
      `${this.commonService.session.style.widgets['link-threshold'] ?? this.SelectedDefaultDistanceThresholdVariable}`
    );
    const configuredMetric = String(
      this.commonService.session.style.widgets['default-distance-metric'] ?? this.SelectedDefaultDistanceMetricVariable
    ).toLowerCase();
    const finiteConfiguredThreshold = Number.isFinite(configuredThreshold) ? configuredThreshold : undefined;

    if (Number.isFinite(maxDistance) && maxDistance > 0 && maxDistance <= 1) {
      const threshold = finiteConfiguredThreshold !== undefined && finiteConfiguredThreshold < 1
        ? finiteConfiguredThreshold
        : 0.015;
      this.setDefaultDistanceControls('tn93', threshold, 0.001);
      return threshold;
    }

    if (maxDistance > 1 || configuredMetric === 'snps') {
      const threshold = finiteConfiguredThreshold !== undefined && finiteConfiguredThreshold >= 1
        ? finiteConfiguredThreshold
        : 16;
      this.setDefaultDistanceControls('snps', threshold, 1);
      return threshold;
    }

    const threshold = finiteConfiguredThreshold !== undefined ? finiteConfiguredThreshold : 0.015;
    this.setDefaultDistanceControls('tn93', threshold, 0.001);
    return threshold;
  }

  private async loadPendingEmbedHandoff() {
    this.isLoadingFiles = true;
    this.handoffError = null;
    this.dismissWelcomeOverlay();
    this.cdr.markForCheck();

    const result = await this.embedHandoffService.consumePendingHandoffFromUrl();
    this.embedHandoffService.clearHandoffQueryParams();

    if (result.status === 'none') {
      this.isLoadingFiles = false;
      this.cdr.markForCheck();
      return;
    }

    if (result.status === 'error') {
      this.isLoadingFiles = false;
      this.handoffError = result.message;
      this.cdr.markForCheck();
      return;
    }

    this.removeAllFiles();
    this.commonService.visuals.microbeTrace?.resetKeyTablesForNewDataset();
    result.files.forEach((file: ImportedEmbedFile) => {
      this.commonService.session.files.push(file);
      this.addToTable(file);
    });

    this.isLoadingFiles = false;
    this.commonService.session.network.initialLoad = true;
    this.cdr.markForCheck();

    setTimeout(() => {
      this.launchClick();
    }, 100);
  }

  private dismissWelcomeOverlay() {
    $('#overlay').stop(true, true).fadeOut('fast');
    $('.ui-tabview-nav').stop(true, true).fadeTo('fast', 1);
    $('.m-portlet').stop(true, true).fadeTo('fast', 1);
  }

  ngOnDestroy() {
    console.log('---files-plugin.component.ts ngOnDestroy');

    this.destroy$.next();
    this.destroy$.complete();
    //unsubscribe on destroy of files tab
    // this.eventEmitterService.subsVar = this.eventEmitterService.    
    // invokeFirstComponentFunction.subscribe((name:string) => {    
    //   this.processFile();    
    // });   
    this.eventEmitterService.invokeFirstComponentFunction.unsubscribe();
    this.store.setNewSession(false);
    this.store.setStyleFileApplied();  
    this.store.setFP_removeFiles(false);
    this.loadViewSubscription?.unsubscribe();

  }

  /**
   * For each file in commonService.session.files, addToTable(file)
   */
  public populateTable() {  
    const fileTableRows = $(this.rootHtmlElement).find(".file-table-row");
    fileTableRows.stop(true, true).remove();

    let files = cloneDeep(this.commonService.session.files);
    if (this.commonService.debugMode) {
      console.log('---  Populate TABLE Row Files 2: ', files);
      console.log('--- files table 2 : ', $(".file-table-row"));
    }

    if(files && files.length > 0) {
      if (this.commonService.debugMode) {
        console.log('--- Populate for: ', files);
      }
      for(let i = 0; i < files.length; i++) {
        this.addToTable(files[i]);
      }

      if (this.commonService.debugMode) {
        console.log('--- GetFile Content Populate TABLE End: ', $(".file-table-row"));
      }

    } 

    this.refreshTemplateState();

  }
  
  /**
   * Toggles the value of multiple variables associated with sequence setting audit including:
   * SelectedAuditEmptyVariable, SelectedAuditGapsVariable, SelectedAuditRNAVariable, 
   * SelectedAuditAminoAcidsVariable, SelectedAuditCIGARVariable, SelectedAuditMalformedVariable
   */
  toglleAll() {

    this.SelectedAuditEmptyVariable = !this.SelectedAuditEmptyVariable;
    this.SelectedAuditGapsVariable = !this.SelectedAuditGapsVariable;
    this.SelectedAuditRNAVariable = !this.SelectedAuditRNAVariable;
    this.SelectedAuditAminoAcidsVariable = !this.SelectedAuditAminoAcidsVariable;
    this.SelectedAuditCIGARVariable = !this.SelectedAuditCIGARVariable;
    this.SelectedAuditMalformedVariable = !this.SelectedAuditMalformedVariable;
  }

  /**
   * XXXXX
   */
  run() {

  }

  /**
   * Updates isDataAvaible variable based on if any nodes under commonService.session.data
   * 
   * XXXXX not used XXXXX
   */
  InitView() {
    this.IsDataAvailable = (this.commonService.session.data.nodes.length === 0 ? false : true);
  }

  /**
   * @returns {string} "state is here"
   */
  handleContainerStateRequestEvent(): string | undefined {
    return "state is here";
  }

  /**
   * Updated default-view widget and localStorageService
   */
  changeDefaultView(e) {
    this.setDefaultView(e.target.value);
  }

  /**
   * Opens/Closes the settings window
   */
  openSettings() {
    this.displayFileSettings = !this.displayFileSettings;
  }


  /**
   * Opens/Closes Sequence Controls modal/dialog box
   */
  showSequenceSettings() {
    this.displaySequenceSettings = !this.displaySequenceSettings;
  }

  /**
   * Sets commonService.session.messages and this.messages to empty arrays []. Clears and closes loading-information modal.
   * Emits a LoadDefaultVisualizationEvent.
   * @param e 
   */
  loadDefaultVisualization(e: string) {

    console.log('---loadDefaultVisualization Called - stop loading modal');

      this.setLaunchButtonsDisabled(false, true);

      this.displayloadingInformationModal = false;

    console.log('---loadDefaultVisualization End - Lodi');

    this.LoadDefaultVisualizationEvent.emit(e);
  }

  /**
   * Adds msg to this.messages and commonService.session.messages. 
   * Updates messages on loading-information modal based on commonService.session.message
   * @param {string} msg message to add to messages arrays 
   */
  showMessage(msg: string) {

    this.store.setLoadingMessageUpdated(msg);
  }

  showNetworkImportWarnings(fileName: string, warnings: string[]) {
    if (!warnings.length) {
      return;
    }

    this.pendingNetworkImportWarnings.push(...warnings.map(warning => `${fileName}: ${warning}`));
  }

  showGraphMLWarnings(fileName: string, warnings: string[]) {
    this.showNetworkImportWarnings(fileName, warnings);
  }

  flushNetworkImportWarnings() {
    if (!this.pendingNetworkImportWarnings.length) {
      return;
    }

    const warnings = [...this.pendingNetworkImportWarnings];
    this.pendingNetworkImportWarnings = [];

    const microbeTrace = this.commonService.visuals.microbeTrace;
    if (microbeTrace?.openNetworkImportWarnings) {
      microbeTrace.openNetworkImportWarnings(warnings);
      return;
    }
    if (microbeTrace?.openGraphMLImportWarnings) {
      microbeTrace.openGraphMLImportWarnings(warnings);
      return;
    }

    warnings.forEach(warning => this.showMessage(warning));
  }

  flushGraphMLWarnings() {
    this.flushNetworkImportWarnings();
  }
  

  /**
   * Resets the value of session.data and temp.trees. Retains current settings by default,
   * or resets all settings when requested by the Files tab reset update action.
   * Calls creatLaunchSequences to process the data files loaded.
   */
  launchClick(options: { resetSettings?: boolean } = {}) {

     // Set to false to indicate that the network is not fully loaded  as new network is launching
     const loadGeneration = this.commonService.beginDataLoad();
     const wasAlreadyLaunched = this.commonService.session.network.launched;
     this.commonService.session.network.isFullyLoaded = false;
     
    // launching new network, so set network rendered to false to start loading modal
    this.store.setNetworkRendered(false);
    this.store.setNetworkUpdated(false);
    this.store.setSettingsLoaded(false);

    if (!wasAlreadyLaunched) {
      this.commonService.updateLegacyNodeSymbols();
    }

    const thresholdOnLaunch = parseFloat(String(
      $('#default-distance-threshold').val() ??
      this.SelectedDefaultDistanceThresholdVariable ??
      this.commonService.session.style.widgets["link-threshold"]
    ));
    const metricOnLaunch = String(
      $('#default-distance-metric').val() ??
      this.SelectedDefaultDistanceMetricVariable ??
      this.commonService.session.style.widgets["default-distance-metric"]
    ).toLowerCase();
    const ambiguityOnLaunch = String(
      $('#ambiguity-resolution-strategy').val() ??
      this.SelectedAmbiguityResolutionStrategyVariable ??
      this.commonService.session.style.widgets["ambiguity-resolution-strategy"]
    );
    const viewOnLaunch = this.normalizeDefaultView(
      $('#default-view').val() ??
      this.SelectedDefaultViewVariable ??
      this.commonService.session.style.widgets["default-view"]
    );

    if (options.resetSettings) {
      this.resetSettingsForLaunch();
    }


    console.log('launch click');
    this.commonService.resetData();
    this.commonService.session.network.launched = true;
    this.refreshTemplateState();
    if (wasAlreadyLaunched) {
      console.log('launch click launched ', wasAlreadyLaunched);
    } else {
      console.log('launch click not launched ', wasAlreadyLaunched);
    }

    this.commonService.session.style.widgets["default-distance-metric"] = metricOnLaunch;
    this.commonService.session.style.widgets["ambiguity-resolution-strategy"] = ambiguityOnLaunch;
    this.commonService.session.style.widgets["default-view"] = viewOnLaunch;
    this.commonService.GlobalSettingsModel.SelectedDistanceMetricVariable = metricOnLaunch;
    this.store.setMetricChanged(metricOnLaunch);

    this.SelectedDefaultDistanceThresholdVariable = thresholdOnLaunch;
    this.commonService.session.style.widgets["link-threshold"] = thresholdOnLaunch;
    this.commonService.GlobalSettingsModel.SelectedLinkThresholdVariable = thresholdOnLaunch;
    this.store.setLinkThreshold(thresholdOnLaunch);

    this.commonService.session.messages = [];
    this.messages = [];
    this.pendingNetworkImportWarnings = [];

    if (this.commonService.debugMode) {
      console.log('session files', this.commonService.session.files);
    }

    // this.displayloadingInformationModal = true;

    this.showMessage("Starting...");

    setTimeout(() => {
      if (!this.commonService.isCurrentDataLoad(loadGeneration)) {
        return;
      }

      // Process the data files loaded.
      this.creatLaunchSequences(loadGeneration);
    }, 1000);
  }

  /**
   * Processes all files in following order (auspice, newick, matrix, link, node, fasta).
   * Adds/Updates nodes and links. After processing all files, calls processData.
   */
  creatLaunchSequences(loadGeneration: number = this.commonService.getDataLoadGeneration()) {
    const isCurrentLoad = () => this.commonService.isCurrentDataLoad(loadGeneration);
    if (!isCurrentLoad()) {
      return;
    }

    this.commonService.session.meta.startTime = Date.now();
    this.setLaunchButtonsDisabled(true);

    // $('#loading-information').html('');
    this.commonService.temp.messageTimeout = setTimeout(() => {
      $('#loadCancelButton').slideDown();
      // abp.notify.warn('If you stare long enough, you can reverse the DNA Molecule\'s spin direction');
    }, 20000);
    const nFiles = this.commonService.session.files.length - 1;
    const check = nFiles > 0;

    // sorts files based on hierarchy
    const hierarchy = ['auspice', 'newick', 'matrix', 'network', 'graphml', 'link', 'node', 'fasta'];
    this.commonService.session.files.sort((a, b) => hierarchy.indexOf(a.format) - hierarchy.indexOf(b.format));


    this.commonService.session.meta.anySequences = this.commonService.session.files.some(file => (
      file.format === "fasta" ||
      (file.format === "node" && !!file.field2 && file.field2 !== "None")
    ));

    this.commonService.session.files.forEach((file, fileNum) => {
      if (!isCurrentLoad()) return;

      const start = Date.now();
      const origin = [file.name];
      if (file.format === 'auspice') {
        this.showMessage(`Parsing ${file.name} as Auspice...`);
        // this.commonService.localStorageService.setItem('default-view', 'phylogenetic-tree');
        // this.commonService.localStorageService.setItem('default-distance-metric', 'SNPs');
        this.commonService.applyAuspice(file.contents).then(async auspiceData => {
          if (!isCurrentLoad()) return 0;

          this.commonService.clearData();
          this.commonService.session = this.commonService.sessionSkeleton();

          console.log(auspiceData["tree"]["children"][0]);
          // This is a bizarre line, but I need to check if the div values are more or less than one. The first one is always zero, so we need to go to the second one
          if(auspiceData["tree"]["children"][0]["data"]["div"] > 0 && auspiceData["tree"]["children"][0]["data"]["div"] < 1){
            this.commonService.session.style.widgets['default-distance-metric'] = 'tn93';
            this.SelectedDefaultDistanceMetricVariable = 'tn93';
            this.onDistanceMetricChange('tn93');
            this.store.setMetricChanged('tn93');
            this.commonService.GlobalSettingsModel.SelectedDistanceMetricVariable = 'tn93';
            $('#default-distance-metric').val('tn93').trigger('change');
            $('#default-distance-threshold').attr('step', 1).val(0.015).trigger('change');
            this.commonService.session.style.widgets['link-threshold'] = 0.015;
            this.SelectedDefaultDistanceThresholdVariable = '0.015';
            this.onLinkThresholdChange('0.015');
            this.commonService.GlobalSettingsModel.SelectedLinkThresholdVariable = 0.015;
          } else {
            this.commonService.session.style.widgets['default-distance-metric'] = 'snps';
            this.store.setMetricChanged('snps');
            this.SelectedDefaultDistanceMetricVariable = 'snps';
            this.onDistanceMetricChange('snps');
            this.commonService.GlobalSettingsModel.SelectedDistanceMetricVariable = 'snps';
            $('#default-distance-metric').val('SNPs').trigger('change');
            $('#default-distance-threshold').attr('step', 1).val(16).trigger('change');
            this.commonService.session.style.widgets['link-threshold'] = 16;
            this.SelectedDefaultDistanceThresholdVariable = '16';
            this.onLinkThresholdChange('16');
            this.commonService.GlobalSettingsModel.SelectedLinkThresholdVariable = 16;
          }
          this.commonService.session.meta.startTime = Date.now();
          this.commonService.session.data.tree = auspiceData['tree'];
          this.commonService.session.data.newickString = auspiceData['newick'];
          let nodeCount = 0;
          const nodeRegex = /^NODE_[0-9]{7}$/i;
          auspiceData['nodes'].forEach(node => {
            if (!nodeRegex.test(node.id) && node.id !== 'wrapper') {
              const nodeKeys = Object.keys(node);
              nodeKeys.forEach( key => {
                if (this.commonService.session.data.nodeFields.indexOf(key) === -1) {
                  this.commonService.session.data.nodeFields.push(key);
                }
                if (! Object.prototype.hasOwnProperty.call(node, 'origin') ) {
                  node.origin = [];
                }
                nodeCount += this.commonService.addNode(node, true);
              });
            }
          });
          let linkCount = 0;
          try {
            const patristicResult = await this.workerComputeService.computePatristicEdges(
              auspiceData['newickWithLabels'] || auspiceData['newick'],
              parseFloat(`${this.commonService.session.style.widgets['link-threshold']}`),
              this.commonService.addLink.bind(this.commonService),
              this.commonService.filterXSS,
              this.commonService.session,
              {
                origin,
                distanceOrigin: file.name,
                check: true,
              }
            );
            linkCount = patristicResult.newLinks;
          } catch (error: any) {
            console.error('Auspice patristic worker error:', error);
            this.showMessage(` - Error processing Auspice tree: ${error?.message || error}`);
            this.commonService.session.network.isFullyLoaded = false;
            return nodeCount;
          }

          this.commonService.runHamsters();
          this.showMessage(` - Parsed ${nodeCount} New Nodes and ${linkCount} new Links from Auspice file.`);
          if (fileNum === nFiles) this.processData(loadGeneration);
          return nodeCount;
        });
        this.commonService._debouncedUpdateNetworkVisuals();
        this.commonService.updateStatistics();
        if(this.commonService.debugMode) {
          console.log(this.commonService.session);
        }
      } else if (file.format === 'fasta') {

        this.showMessage(`Parsing ${file.name} as FASTA...`);
        let newNodes = 0;
        const parseStart = Date.now();
        this.commonService.parseFASTA(file.contents).then(seqs => {
          if (!isCurrentLoad()) return;

          this.commonService.recordPerformanceTiming('ingestion', 'parseFasta', parseStart, {
            file: file.name,
            sequences: seqs.length,
            bytes: typeof file.contents === 'string' ? file.contents.length : null
          });
          const mergeStart = Date.now();
          const n = seqs.length;
          for (let i = 0; i < n; i++) {
            const node = seqs[i];
            if (!node) continue;
            newNodes += this.commonService.addNode({
              _id: this.commonService.filterXSS(node.id),
              seq: this.commonService.filterXSS(node.seq),
              origin: origin
            }, check);
          }
          this.commonService.recordPerformanceTiming('ingestion', 'mergeFastaNodes', mergeStart, {
            file: file.name,
            newNodes,
            totalSequences: seqs.length
          });

          console.log('FASTA Merge time:', (Date.now() - start).toLocaleString(), 'ms');
          this.showMessage(` - Parsed ${newNodes} New, ${seqs.length} Total Nodes from FASTA.`);
          if (fileNum === nFiles) this.processData(loadGeneration);
        });

      } else if (file.format === 'network' || file.format === 'graphml') {

        this.showMessage(`Parsing ${file.name} as Network...`);
        try {
          const networkDocument = this.graphMLService.importNetworkDocument(file.contents, { sourceName: file.name });
          let newNodes = 0;
          let newLinks = 0;

          networkDocument.nodeFields.forEach(field => {
            if (!this.commonService.includes(this.commonService.session.data.nodeFields, field)) {
              this.commonService.session.data.nodeFields.push(field);
            }
          });
          networkDocument.linkFields.forEach(field => {
            if (!this.commonService.includes(this.commonService.session.data.linkFields, field)) {
              this.commonService.session.data.linkFields.push(field);
            }
          });

          networkDocument.nodes.forEach(node => {
            newNodes += this.commonService.addNode(node, check);
          });
          networkDocument.links.forEach(link => {
            newLinks += this.commonService.addLink(link, check);
          });

          this.showNetworkImportWarnings(file.name, networkDocument.warnings);

          console.log('Network Parse time:', (Date.now() - start).toLocaleString(), 'ms');
          this.commonService.recordPerformanceTiming('ingestion', networkDocument.format === 'graphml' ? 'parseAndMergeGraphML' : 'parseAndMergeNetworkDocument', start, {
            file: file.name,
            format: networkDocument.format,
            graphs: networkDocument.graphIds.length,
            newNodes,
            totalNodes: networkDocument.nodes.length,
            newLinks,
            totalLinks: networkDocument.links.length,
            warnings: networkDocument.warnings.length
          });
          this.showMessage(` - Parsed ${newNodes} New, ${networkDocument.nodes.length} Total Nodes from ${networkDocument.formatLabel}.`);
          this.showMessage(` - Parsed ${newLinks} New, ${networkDocument.links.length} Total Links from ${networkDocument.graphIds.length} ${networkDocument.formatLabel} Graph${networkDocument.graphIds.length === 1 ? '' : 's'}.`);
          if (fileNum === nFiles) this.processData(loadGeneration);
        } catch (error: any) {
          console.error('Network parse error:', error);
          this.showMessage(` - Error processing Network file: ${error?.message || error}`);
          this.commonService.session.network.isFullyLoaded = false;
        }

      } else if (file.format === 'link') {

        this.showMessage(`Parsing ${file.name} as Link List...`);
        let l = 0;

        const seenTargetsBySource = new Map<string, Set<string>>();

        /**
         * Processes and then adds link. updates value of l
         * @param {object} link 
         */
        const forEachLink = link => {
          const keys = Object.keys(link);
          const n = keys.length;
          const safeLink = {};
          // for each key in link object
          for (let i = 0; i < n; i++) {
            const rawKey = keys[i];
            const key = this.commonService.filterXSS(rawKey);
            let value = link[rawKey];
            // console.log('key is: ',key);

            if(key === "distance") {
              // console.log('key is distance');
              value = parseFloat(value);
            } else if (key === 'origin') {
              // related to zenhub#810: link list csv was exported from table view and unable to be loaded correctly; this code create a new linkField when it runs into field called origin 
              link['originColumnFromFile'] = String(value ?? '').split('\n')
              safeLink['originColumnFromFile'] = link['originColumnFromFile'];

              this.addSessionDataField(this.commonService.session.data.linkFields, 'originColumnFromFile');
            }

            this.addImportedTableField(
              safeLink,
              this.commonService.session.data.linkFields,
              'link',
              key,
              value,
              'link_table'
            );
          }

          const src = '' + link[file.field1];
          const tgt = '' + link[file.field2];
          const hasReverseEdge = seenTargetsBySource.get(tgt)?.has(src) ?? false;

          if (!seenTargetsBySource.has(src)) {
            seenTargetsBySource.set(src, new Set<string>());
          }
          seenTargetsBySource.get(src)?.add(tgt);

          const isDistanceFieldMissing = file.field3 == 'None';
          const linkBase = {
            source: src,
            target: tgt,
            origin: origin,
            visible: true,
            directed: isDistanceFieldMissing ? true : false,
            distance: isDistanceFieldMissing ? 0 : parseFloat(link[file.field3]),
            hasDistance: isDistanceFieldMissing ? false : true,
            distanceOrigin: isDistanceFieldMissing ? '' : file.name
          } as any;

          if (hasReverseEdge && isDistanceFieldMissing) {
            linkBase.bidirectional = true;
          }

          l += this.commonService.addLink(Object.assign(linkBase, safeLink), check);

        //  console.log('matrixx1: ',  JSON.stringify((window as any).context.commonService.temp.matrix));


        };

        if (file.extension === 'xls' || file.extension === 'xlsx') {

          const workbook = XLSX.read(file.contents, { type: 'array' , cellDates: true, dateNF: 'mm/dd/yyyy'});
          const data = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {dateNF: 'mm/dd/yyyy', raw: false});
          data.map(forEachLink);
          this.showMessage(` - Parsed ${l} New, ${data.length} Total Links from Link Excel Table.`);
          let n = 0, t = 0;
          const nodeIDs = [];
          const k = data.length;
          // for each line or excel file, check if node exist, if not add it
          for (let i = 0; i < k; i++) {
            const l = data[i];
            const f1 = l[file.field1];
            if (nodeIDs.indexOf(f1) === -1) {
              t++;
              nodeIDs.push(f1);
              n += this.addLinkEndpointNode(f1, origin, true);
            }
            const f2 = l[file.field2];
            if (nodeIDs.indexOf(f2) === -1) {
              t++;
              nodeIDs.push(f2);
              n += this.addLinkEndpointNode(f2, origin, true);
            }
          }

          console.log('Link Excel Parse time:', (Date.now() - start).toLocaleString(), 'ms');
          this.commonService.recordPerformanceTiming('ingestion', 'parseAndMergeLinkExcel', start, {
            file: file.name,
            newLinks: l,
            totalLinks: data.length,
            newNodes: n,
            totalNodes: t
          });
          this.showMessage(` - Parsed ${n} New, ${t} Total Nodes from Link Excel Table.`);
          if (fileNum === nFiles) this.processData(loadGeneration);

        } else if (file.extension === 'json') {
            const results = JSON.parse(file.contents);
            if (!results || results.length === 0) return;

            const data = results;
            data.map(forEachLink);
            this.showMessage(` - Parsed ${l} New, ${data.length} Total Links from Link JSON.`);
            let newNodes = 0, totalNodes = 0;
            const n = data.length;
            const nodeIDs = [];
            // for each object in json, check if node exist, if not add it
            for (let i = 0; i < n; i++) {

              const l = data[i];
              const f1 = l[file.field1];
              if (nodeIDs.indexOf(f1) === -1) {
                totalNodes++;
                newNodes += this.addLinkEndpointNode(f1, origin, true);
              }
              const f2 = l[file.field2];
              if (nodeIDs.indexOf(f2) === -1) {
                totalNodes++;
                newNodes += this.addLinkEndpointNode(f2, origin, true);
              }
            }

            console.log('Link JSON Parse time:', (Date.now() - start).toLocaleString(), 'ms');
            this.commonService.recordPerformanceTiming('ingestion', 'parseAndMergeLinkJson', start, {
              file: file.name,
              newLinks: l,
              totalLinks: data.length,
              newNodes,
              totalNodes
            });
            this.showMessage(` - Parsed ${newNodes} New, ${totalNodes} Total Nodes from Link JSON.`);
            if (fileNum === nFiles) this.processData(loadGeneration);
          } else {

            Papa.parse(file.contents, {
              header: true,
              dynamicTyping: true,
              skipEmptyLines: true,
              complete: results => {
                if (!isCurrentLoad()) return;

                const data = results.data;
                data.map(forEachLink);
                this.showMessage(` - Parsed ${l} New, ${data.length} Total Links from Link CSV.`);
                let newNodes = 0, totalNodes = 0;
                const n = data.length;
                const nodeIDs = [];
                for (let i = 0; i < n; i++) {
                  const l = data[i];
                  const f1 = l[file.field1];
                  if (nodeIDs.indexOf(f1) === -1) {
                    totalNodes++;
                    newNodes += this.addLinkEndpointNode(f1, origin, true);
                  }
                  const f2 = l[file.field2];
                  if (nodeIDs.indexOf(f2) === -1) {
                    totalNodes++;
                    newNodes += this.addLinkEndpointNode(f2, origin, true);
                  }
                }

                console.log('Link CSV Parse time:', (Date.now() - start).toLocaleString(), 'ms');
                this.commonService.recordPerformanceTiming('ingestion', 'parseAndMergeLinkCsv', start, {
                  file: file.name,
                  newLinks: l,
                  totalLinks: data.length,
                  newNodes,
                  totalNodes
                });
                this.showMessage(` - Parsed ${newNodes} New, ${totalNodes} Total Nodes from Link CSV.`);
                if (fileNum === nFiles) this.processData(loadGeneration);
              }
            });
          }
      } else if (file.format === 'node') {

        this.showMessage(`Parsing ${file.name} as Node List...`);
        if(this.commonService.debugMode) {
          console.log(file.field1);
        }

        let m = 0;
        const n = 0;

        if (file.extension === 'xls' || file.extension === 'xlsx') {

          const workbook = XLSX.read(file.contents, { type: 'array', cellDates: true, dateNF: 'mm/dd/yyyy' });
          const data = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { raw: false, dateNF: 'mm/dd/yyyy'});
          data.forEach(node => {
            const safeNode = this.buildNodeTableRecord(node, file, origin);
            m += this.commonService.addNode(safeNode, check);
          });

          console.log('Node Excel Parse time:', (Date.now() - start).toLocaleString(), 'ms');
          this.commonService.recordPerformanceTiming('ingestion', 'parseAndMergeNodeExcel', start, {
            file: file.name,
            newNodes: m,
            totalNodes: data.length
          });
          this.showMessage(` - Parsed ${m} New, ${n} Total Nodes from Node Excel Table.`);
          if (fileNum === nFiles) this.processData(loadGeneration);

        } else
          if (file.extension === 'json') {
            const results = JSON.parse(file.contents);
            if (!results || results.length === 0) return;
            results.forEach(data => {

              const node = data;//data[0]             

              if (node[file.field1] && node[file.field1].toString().trim()) {

                const safeNode = this.buildNodeTableRecord(node, file, origin);
                m += this.commonService.addNode(safeNode, check);
              }
            })

            console.log('Node JSON Parse time:', (Date.now() - start).toLocaleString(), 'ms');
            this.commonService.recordPerformanceTiming('ingestion', 'parseAndMergeNodeJson', start, {
              file: file.name,
              newNodes: m,
              totalNodes: results.length
            });
            this.showMessage(` - Parsed ${m} New, ${n} Total Nodes from Node JSON.`);

            if (fileNum === nFiles) this.processData(loadGeneration);

          } else {

            let nodeCsvRows = 0;
            Papa.parse(file.contents, {
              header: true,
              dynamicTyping: true,
              skipEmptyLines: true,
              step: data => {
                if (!isCurrentLoad()) return;

                nodeCsvRows++;
                const node = data.data;

                if (node[file.field1] && node[file.field1].toString().trim()) {

                  const safeNode = this.buildNodeTableRecord(node, file, origin);
                  m += this.commonService.addNode(safeNode, check);
                }
              },
              complete: () => {
                if (!isCurrentLoad()) return;

                console.log('Node CSV Parse time:', (Date.now() - start).toLocaleString(), 'ms');
                this.commonService.recordPerformanceTiming('ingestion', 'parseAndMergeNodeCsv', start, {
                  file: file.name,
                  newNodes: m,
                  totalRows: nodeCsvRows
                });
                this.showMessage(` - Parsed ${m} New, ${n} Total Nodes from Node CSV.`);

                if (fileNum === nFiles) this.processData(loadGeneration);
              }
            });
          }

      } else if (file.format === 'matrix') {

        this.showMessage(`Parsing ${file.name} as Distance Matrix...`);

        if (file.extension === 'xls' || file.extension === 'xlsx') {

          const workbook = XLSX.read(file.contents, { type: 'array', cellDates: true, dateNF: 'mm/dd/yyyy' });
          // Preserve full matrix precision so TN93 thresholding matches the source workbook values.
          const data = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {dateNF: 'mm/dd/yyyy', header: 1, raw: true});
          let nodeIDs = [], nn = 0, nl = 0;
          data.forEach((row: any, i) => {
            if (i === 0) {
              nodeIDs = row;
              nodeIDs.forEach((cell, k) => {
                if (k > 0) {
                  nn += this.commonService.addNode({
                    _id: this.commonService.filterXSS('' + cell),
                    origin: origin
                  }, check);
                }
              });
            } else {
              const source = this.commonService.filterXSS('' + row[0]);
              row.forEach((cell, j) => {
                if (j === 0) return;
                const target = this.commonService.filterXSS('' + nodeIDs[j]);
                if (source === target) return;
                nl += this.commonService.addLink({
                  source: source,
                  target: target,
                  origin: origin,
                  distance: parseFloat(cell),
                  directed: false,
                  hasDistance: true,
                  distanceOrigin: file.name
                }, check);
              });
            }
          });

          console.log('Distance Matrix Excel Parse time:', (Date.now() - start).toLocaleString(), 'ms');
          this.commonService.recordPerformanceTiming('ingestion', 'parseAndMergeMatrixExcel', start, {
            file: file.name,
            newNodes: nn,
            totalNodes: data.length - 1,
            newLinks: nl,
            totalLinks: ((data.length - 1) ** 2 - (data.length - 1)) / 2
          });
          this.showMessage(` - Parsed ${nn} New, ${data.length - 1} Total Nodes from Excel Distance Matrix.`);
          this.showMessage(` - Parsed ${nl} New, ${((data.length - 1) ** 2 - (data.length - 1)) / 2} Total Links from Excel Distance Matrix.`);
          if (fileNum === nFiles) this.processData(loadGeneration);

        } else { // file.format === "matrix" && file.extension === "csv"
 
          let start = Date.now();
          let nodeIDs, n;
          let links = [];
          let output;
          Papa.parse(file.contents, {
            skipEmptyLines: "greedy",
            chunk: result => {
              const rowsInChunk = result.data.length;
              for (let rowInChunk = 0; rowInChunk < rowsInChunk; rowInChunk++) {
                const row = result.data[rowInChunk];
                if (nodeIDs) {
                  const source = "" + row[0];
                  for (let j = 1; j < rowsInChunk+1; j++) {
                    const target = "" + nodeIDs[j];
                    if (source == target) continue;
                    links.push({
                      source: source,
                      target: target,
                      distance: parseFloat(row[j])
                    });
                  }
                } else {
                  nodeIDs = row;
                  n = nodeIDs.length;
                }
              }
            },
            complete: function() {
              console.log("CSV Matrix Parse time: ", (Date.now() - start).toLocaleString(), "ms");
              start = Date.now();
              output = {
                  links: links,
                  nodes: nodeIDs.slice(1)
                }
              console.log(output);
              close();
            }
          });
          let nn = 0, nl = 0;
          const results = { data: output, start: start }
          const f_nodes = output.nodes;
          const tn = f_nodes.length;
          for (let i = 0; i < tn; i++) {
            console.log(f_nodes[i])
            if (f_nodes[i]){
              nn += this.commonService.addNode(
                {
                  _id: this.commonService.filterXSS(f_nodes[i]),
                  origin: origin,
                },
                check
              );
            }
          }
          const f_links = output.links;
          const tl = f_links.length;
          let skip = 0;
          console.log(tl +" links");
          for (let j = 0; j < tl; j++) {
              console.log(this.commonService.session.data.links.length)
              console.log(f_links[j]);
              const reversed = this.commonService.session.data.links.filter(x => x["source"] === f_links[j]["target"] && x["target"] === f_links[j]["source"]);
              const existing = this.commonService.session.data.links.filter(x => x["source"] === f_links[j]["source"] && x["target"] === f_links[j]["target"]);
            if (existing.length > 0 || reversed.length > 0){
                skip++;
                console.log(`${skip}th skip - ${f_links[j]["source"]} and ${f_links[j]["target"]}`);
                continue;
              } 
            if (f_links[j]["source"] == "undefined" || f_links[j]["target"] == "undefined"){
              console.log("skipping undefined source or target");
              continue;
            }
              nl += this.commonService.addLink(
                  {
                    source: f_links[j]["source"],
                    target: f_links[j]["target"],
                    distance: f_links[j]["distance"],
                    origin: origin,
                     hasDistance: true,
                    distanceOrigin: file.name,
                  },
                  check
              );
          }

          console.log(
              'CSV Matrix Merge time:',
              (Date.now() - start).toLocaleString(),
              'ms'
          );
          this.commonService.recordPerformanceTiming('ingestion', 'parseAndMergeMatrixCsv', results.start, {
            file: file.name,
            newNodes: nn,
            totalNodes: tn,
            newLinks: nl,
            totalLinks: tl,
            skippedLinks: skip
          });

          this.showMessage(` - Parsed ${nn} New, ${tn} Total Nodes from Distance Matrix.`);
          this.showMessage(` - Parsed ${nl} New, ${tl} Total Links from Distance Matrix.`);
          if (fileNum === nFiles) this.processData(loadGeneration);
          //this.commonService.parseCSVMatrix(file).then((o: any) => {
          //});
        }

      } else { // if(file.format === 'newick'){

        this.commonService.session.data.newickString = file.contents;
        const patristicStart = Date.now();
        this.workerComputeService.initPatristicTree(file.contents).then(async treeReady => {
          if (!isCurrentLoad()) return;

          this.commonService.recordPerformanceTiming('ingestion', 'preprocessNewickPatristicTree', patristicStart, {
            file: file.name,
            leaves: treeReady.leafCount,
            maxDistance: treeReady.maxDistance,
            timings: treeReady.timings
          });

          const activeThreshold = this.applyPatristicDistanceDefaults(treeReady.maxDistance);
          const requeryStart = Date.now();
          const patristicResult = await this.workerComputeService.ensurePatristicEdgesForThreshold(
            activeThreshold,
            this.commonService.addLink.bind(this.commonService),
            this.commonService.filterXSS,
            this.commonService.session,
            {
              origin,
              distanceOrigin: file.name,
              check,
              newickString: file.contents,
            }
          );

          if (!isCurrentLoad()) return;

          const leafNames = patristicResult?.leafNames?.length
            ? patristicResult.leafNames
            : this.workerComputeService.getPatristicLeafNames().map(this.commonService.filterXSS);

          this.commonService.recordPerformanceTiming('ingestion', 'computeNewickPatristicEdges', requeryStart, {
            file: file.name,
            leaves: leafNames.length,
            threshold: activeThreshold,
            totalLinks: patristicResult?.totalLinks ?? 0,
            newLinks: patristicResult?.newLinks ?? 0
          });
          let newNodes = 0;
          const mergeStart = Date.now();
          for (const source of leafNames) {
            newNodes += this.commonService.addNode({
              _id: source,
              origin: origin
            }, check);
          }
          this.commonService.recordPerformanceTiming('ingestion', 'mergeNewickNodes', mergeStart, {
            file: file.name,
            newNodes,
            totalLeaves: leafNames.length
          });

          const analysisStart = Date.now();
          const analysisResult = await this.workerComputeService.collectPatristicDistanceAnalysisEdges(
            this.commonService.session
          );
          if (!isCurrentLoad()) return;

          if (!analysisResult.skipped && analysisResult.edges.length > 0) {
            this.commonService.setPatristicThresholdAnalysisEdges('distance', leafNames, analysisResult.edges);
          }
          this.commonService.recordPerformanceTiming('ingestion', 'buildNewickThresholdAnalysis', analysisStart, {
            file: file.name,
            totalPairs: analysisResult.totalPairs,
            sampledPairs: analysisResult.edges.length,
            skipped: analysisResult.skipped,
            skipReason: analysisResult.skipReason
          });

          let newLinks = patristicResult?.newLinks ?? 0;
          let links = patristicResult?.totalLinks ?? 0;
          let guardrail = patristicResult?.guardrail;

          if (!isCurrentLoad()) return;

          console.log('Newick Tree Parse time:', (Date.now() - start).toLocaleString(), 'ms');
          this.commonService.recordPerformanceTiming('ingestion', 'parseAndMergeNewick', start, {
            file: file.name,
            newNodes,
            totalLeaves: leafNames.length,
            newLinks,
            totalLinks: links,
            activeThreshold
          });
          this.showMessage(` - Parsed ${newNodes} New, ${leafNames.length} Total Nodes from Newick Tree.`);
          if (guardrail?.message) {
            this.showMessage(` - ${guardrail.message}`);
          }
          this.showMessage(` - Parsed ${newLinks} New, ${links} Total Links from Newick Tree.`);
          if (fileNum === nFiles) this.processData(loadGeneration);
        }).catch((error: any) => {
          if (!isCurrentLoad()) return;

          console.error('Newick patristic worker error:', error);
          this.showMessage(` - Error processing Newick tree: ${error?.message || error}`);
          this.commonService.session.network.isFullyLoaded = false;
        });
      }
    });

  }

  /**
   * Adds links for nodes with no edge?
   * Then calls processSequence
   */
  processData(loadGeneration: number = this.commonService.getDataLoadGeneration()) {
    if (!this.commonService.isCurrentDataLoad(loadGeneration)) {
      return;
    }

    this.flushNetworkImportWarnings();

    let nodes = this.commonService.session.data.nodes;
    if(this.commonService.debugMode) {
      console.log(nodes);
    }
    this.commonService.session.data.nodeFilteredValues = nodes;
    //Add links for nodes with no edges
    // TODO: This was here before but not sure why we needed this
    // this.uniqueNodes.forEach(x => {
    //   console.log('link same 4: ', x);
    //   this.commonService.addLink(Object.assign({
    //     source: '' + x,
    //     target: '' + x,
    //     origin: origin,
    //     visible: true,
    //     distance: 0,
    //   }, 'generated'));
    // });

    this.processSequence(loadGeneration)
  }

  /**
   * If sequences are present, processes them by aligning if needed, computing consensus, consensus distances, ambiguity counts, and then links
   */
  async processSequence(loadGeneration: number = this.commonService.getDataLoadGeneration()) {
    const processSequenceStart = Date.now();
    const isCurrentLoad = () => this.commonService.isCurrentDataLoad(loadGeneration);
    if (!isCurrentLoad()) {
      return;
    }

    if (!this.commonService.session.meta.anySequences) {
      this.commonService.recordPerformanceTiming('sequence', 'processSequenceTotal', processSequenceStart, {
        skipped: true,
        reason: 'no-sequences'
      });
      return this.commonService.runHamsters();
    }
    this.commonService.session.data.nodeFields.push('seq');
    let subset = [];
    if (this.commonService.debugMode) {
      console.log('link same nodes22: ', this.commonService.session.data.nodes.length, this.commonService.session.data.nodes);
    }
    let nodes = this.commonService.session.data.nodes;
    const n = nodes.length;
    const gapString = '-'.repeat(this.commonService.session.data.reference.length);
    for (let i = 0; i < n; i++) {
      const d = nodes[i];
      if (!d.seq || d.seq.toLowerCase() == 'null' || d.seq.toLowerCase() == 'none' || d.seq.toLowerCase().replace('/', '') == 'na') {
        d.seq = gapString;
      } else {
        subset.push(d);
      }
    }

    if (this.commonService.debugMode) {
      console.log('link same nodes33: ', subset);
    }
    const sequenceLength = subset[0]?.seq?.length ?? 0;

    if (this.commonService.session.style.widgets['align-sw']) {
      this.showMessage('Aligning Sequences...');
      let output = await (this.commonService.session as any).align({
        reference: this.commonService.session.data.reference,
        isLocal: $('#localAlign').is(':checked'),
        match: [$('#alignerMatch').val(), $('#alignerMismatch').val()].map(parseFloat),
        gap: [$('#alignerGapO').val(), $('#alignerGapE').val()].map(parseFloat),
        nodes: subset
      });
      if (!isCurrentLoad()) {
        return;
      }

      const start = Date.now();
      const m = subset.length;
      for (let j = 0; j < m; j++) {
        Object.assign(subset[j], output[j]);
      }
      console.log("Alignment Merge time: ", (Date.now() - start).toLocaleString(), "ms");
    }
    const start = Date.now();
    for (let k = 0; k < n; k++) {
      const node = nodes[k];
      node['_seqInt'] = tn93.toInts(node['seq']);
    }
    console.log("Integer Sequence Translation time: ", (Date.now() - start).toLocaleString(), "ms");
    this.commonService.recordPerformanceTiming('sequence', 'translateToInts', start, {
      nodes: n,
      sequences: subset.length,
      sequenceLength
    });

    const consensus = await this.commonService.computeConsensus();
    if (!isCurrentLoad()) {
      return;
    }
    (this.commonService.session.data as any).consensus = consensus;
    await this.commonService.computeConsensusDistances();
    if (!isCurrentLoad()) {
      return;
    }
    subset.sort((a, b) => a['_diff'] - b['_diff']);
    if (this.commonService.session.style.widgets['ambiguity-resolution-strategy']) {
      await this.commonService.computeAmbiguityCounts();
      if (!isCurrentLoad()) {
        return;
      }
    }
    this.showMessage('Computing Links based on Genomic Proximity...');
    const k = await this.commonService.computeLinks(subset);
    if (!isCurrentLoad()) {
      return;
    }

    this.commonService.recordPerformanceTiming('sequence', 'processSequenceTotal', processSequenceStart, {
      nodes: n,
      sequences: subset.length,
      sequenceLength,
      generatedLinks: k
    });
    this.showMessage(` - Found ${k} New Links from Genomic Proximity`);
    this.commonService.runHamsters();


    this.showMessage("Finishing...");
    // this.displayloadingInformationModal = false;
    setTimeout(() => {
      this.cdr.detectChanges(); 
    }, 1000);

  };

  /**
   * XXXXX not currently used; if implemented in future switch open parameter to boolean XXXXX
   * @param open 0 or 1
   */
  accordianToggle( open : number) {

    if(open){
      $(".m-content").css("overflow-y", "auto");
    } else {
      $(".m-content").css("overflow-y", "hidden");
    }

  }

  /**
   * When a new file/files are add, each one if processed by processFile
   * @param files 
   */
  async processFiles(files?: FileList): Promise<void> {
    const fileArray = files ? Array.from(files) : [];
    this.isLoadingFiles = fileArray.length > 0;
    this.refreshTemplateState();

    if (!fileArray.length) {
      this.isLoadingFiles = false;
      this.refreshTemplateState();
      return;
    }

    try {
      await Promise.all(fileArray.map(file => this.processFile(file)));
    } finally {
      this.isLoadingFiles = false;
      this.refreshTemplateState();
    }

  };

  private applySerializedSession(payload: any, extension: string) {
    Promise.resolve(this.commonService.processJSON(payload, extension))
      .then(() => this.populateTable())
      .catch(error => console.error('Unable to load MicrobeTrace session file.', error));
  }

  private loadCompressedSession(rawfile: File) {
    JSZip.loadAsync(rawfile)
      .then(zip => {
        const sessionEntries = Object.values(zip.files).filter(entry => {
          if (entry.dir) return false;
          const entryExtension = entry.name.split('.').pop()?.toLowerCase();
          return entryExtension === 'microbetrace' || entryExtension === 'hivtrace';
        });
        const sessionEntry = sessionEntries.find(entry => entry.name.toLowerCase().endsWith('.microbetrace')) || sessionEntries[0];

        if (!sessionEntry) {
          throw new Error('No MicrobeTrace session file found in zip archive.');
        }

        const entryExtension = sessionEntry.name.split('.').pop()?.toLowerCase();
        if (!entryExtension) {
          throw new Error('Compressed session file is missing an extension.');
        }

        return sessionEntry.async('text').then(contents => ({
          contents,
          entryExtension
        }));
      })
      .then(({ contents, entryExtension }) => this.applySerializedSession(contents, entryExtension))
      .catch(error => console.error('Unable to load compressed MicrobeTrace session file.', error));
  }

  /**
   * Gets file extension and calls appropriate function to load info into MicrobeTrace.
   * For example, for json files commonService.processJSON is used.
   * Adds file to commonService.session.files and adds file to table with this.addToTable
   *
   * @returns
   */
  async processFile(rawfile?): Promise<void> {
    if(!rawfile) {
      rawfile = this.commonService.session.files[0];
    }

    if (!rawfile) {
      this.refreshTemplateState();
      return;
    }

    if(this.commonService.debugMode) {
      console.log('raw file: ', rawfile);
    }


    // Loading informaiton null
    // $('#loading-information').html('');

    const extension = rawfile.name.split('.').pop().toLowerCase();

    console.log('process file end');
    if (extension === 'zip') {
      this.loadCompressedSession(rawfile);
      this.refreshTemplateState();
      return;
    }

    if (extension === 'microbetrace' || extension === 'hivtrace') {
      await new Promise<void>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error);
        reader.onloadend = out => {
          Promise.resolve(this.commonService.processJSON(out.target, extension))
            .then(() => {
              this.populateTable();
              this.refreshTemplateState();
              resolve();
            })
            .catch(reject);
        };
        reader.readAsText(rawfile, 'UTF-8');
      });
      return;
    }
    if (extension === 'svg') {
      await new Promise<void>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error);
        reader.onloadend = out => {
          this.commonService.processSVG(out.target);
          this.refreshTemplateState();
          resolve();
        };
        reader.readAsText(rawfile, 'UTF-8');
      });
      return;
    }
    if (extension === 'json') {
      const fileName = this.commonService.filterXSS(rawfile.name);
      await new Promise<void>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error);
        reader.onloadend = (out) => {
          try {
            const rawContents = out.target['result'] as string;
            const output = JSON.parse(rawContents);
            console.log(output);
            if (this.graphMLService.looksLikeCX2(output)) {
              const cxFile = {
                contents: rawContents,
                name: fileName,
                extension: extension,
                type: rawfile.type || 'application/json',
                format: 'network'
              };
              this.commonService.session.files.push(cxFile);
              this.addToTable(cxFile);
            } else if (output.meta && output.tree) {
              const auspiceFile = { contents: output, name: fileName, extension: extension};
              this.commonService.session.files.push(auspiceFile);
              this.addToTable(auspiceFile);
            } else {
              this.commonService.processJSON(out.target, extension);
            }
            this.refreshTemplateState();
            resolve();
          } catch (error) {
            reject(error);
          }
        };
        reader.readAsText(rawfile, 'UTF-8');
      });
      return;
    }

    await fileto.promise(rawfile, (extension === 'xlsx' || extension === 'xls') ? 'ArrayBuffer' : 'Text').then(file => {
      //debugger;
      file.name = this.commonService.filterXSS(file.name);
      file.extension = file.name.split('.').pop().toLowerCase();
      this.commonService.session.files.push(file);
      this.addToTable(file);
      this.refreshTemplateState();
    });
  }

  /**
   * Removes all files from commonService.session.files, sets this.nodeIds and this.edgeIds to empty arrays [].
   * Calls nodeEdgeCheck
   */
  removeAllFiles() {
    const fileTableRows = $(this.rootHtmlElement).find(".file-table-row");
    fileTableRows.stop(true, true).remove();

    this.commonService.session.files = [];
    this.nodeIds = [];
    this.edgeIds = [];

    this.nodeEdgeCheck();
    this.refreshTemplateState();
  }

  private normalizeFileTypeSignal(value: any): string {
    return String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  private inferTabularFileFormat(
    file: any,
    headers: any[] = [],
    hints: { isFasta?: boolean; isNewick?: boolean; isAuspice?: boolean; isNetworkDocument?: boolean; isNetworkXml?: boolean } = {}
  ): string {
    const explicitFormat = String(file?.format ?? '').toLowerCase();
    if (explicitFormat === 'network' || explicitFormat === 'graphml') {
      return 'network';
    }
    const knownFormats = ['link', 'node', 'matrix', 'fasta', 'newick', 'auspice'];
    if (knownFormats.includes(explicitFormat)) {
      return explicitFormat;
    }

    if (hints.isAuspice) {
      return 'auspice';
    }
    if (hints.isNetworkDocument || hints.isNetworkXml) {
      return 'network';
    }
    if (hints.isFasta) {
      return 'fasta';
    }
    if (hints.isNewick) {
      return 'newick';
    }

    const normalizedHeaders = (headers || []).map(header => this.normalizeFileTypeSignal(header));
    const hasHeader = (aliases: string[]) => aliases.some(alias => normalizedHeaders.includes(this.normalizeFileTypeSignal(alias)));
    const hasHeaderPair = (sourceAliases: string[], targetAliases: string[]) => hasHeader(sourceAliases) && hasHeader(targetAliases);
    const normalizedFileName = this.normalizeFileTypeSignal(file?.name);
    const fileNameIncludes = (signals: string[]) => signals.some(signal => normalizedFileName.includes(this.normalizeFileTypeSignal(signal)));

    const hasLinkHeaders = hasHeaderPair(
      ['source', 'src', 'from', 'id1', 'node1', 'nodea', 'sample1', 'case1'],
      ['target', 'dst', 'to', 'id2', 'node2', 'nodeb', 'sample2', 'case2']
    );

    if (hasLinkHeaders) {
      return 'link';
    }

    if (fileNameIncludes(['link', 'links', 'linklist', 'edge', 'edges', 'edgelist', 'contacttracing', 'contacttrace'])) {
      return 'link';
    }

    if (fileNameIncludes(['node', 'nodes', 'nodelist', 'metadata', 'meta', 'sample', 'samples', 'isolate', 'isolates'])) {
      return 'node';
    }

    const hasNodeHeaders = hasHeader([
      'id',
      '_id',
      'nodeid',
      'sampleid',
      'caseid',
      'isolateid',
      'accession',
      'strain',
      'virusname',
      'seq',
      'sequence'
    ]);

    if (hasNodeHeaders) {
      return 'node';
    }

    return normalizedHeaders.length > 2 ? 'node' : 'link';
  }

  /**
   * Gets information from file about extension, file type, and header and uses that information to addTableTile for file-table
   */
  addToTable(file) {
    if(this.commonService.debugMode) {
      console.log('addToTable: ', file);
    }

    //debugger;
    const extension = file.extension ? file.extension : this.commonService.filterXSS(file.name).split('.').pop().toLowerCase();
    const isFasta = extension.indexOf('fas') > -1;
    const isNewick = extension.indexOf('nwk') > -1 || extension.indexOf('newick') > -1;
    // Some network formats are uploaded as generic XML/JSON/text, so detect by
    // extension first and then by document shape.
    const isNetworkDocument = ['graphml', 'gexf', 'xgmml', 'cx', 'cx2', 'dot', 'gv', 'gml'].includes(extension)
      || this.graphMLService.looksLikeNetworkDocument(file.contents);
    const isXL = (extension === 'xlsx' || extension === 'xls');
    const isJSON = (extension === 'json');
    const isAuspice = (extension === 'json' && file.contents.meta && file.contents.tree);
    const tableFormatHints = { isFasta, isNewick, isAuspice, isNetworkDocument };
    if (isXL) {
      try {
        const workbook = XLSX.read(file.contents, { type: 'array', cellDates: true, dateNF: 'mm/dd/yyyy' });
        const data = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {dateNF: 'mm/dd/yyyy', raw: false});
        const headers = [];
        data.forEach(row => {
          Object.keys(row).forEach(key => {
            const safeKey = this.commonService.filterXSS(key);
            if (!this.commonService.includes(headers, safeKey)) headers.push(safeKey);
          });
        });
        addTableTile(headers, this);
      } catch {
        console.log('Unable to read excel file: ', file.name);
        addTableTile([file.field1, file.field2, file.field3], this);
        return;
      }
    } else if (isNetworkDocument) {
      try {
        const networkDocument = this.graphMLService.importNetworkDocument(file.contents, { sourceName: file.name });
        file.format = 'network';
        const detectedFormat = addTableTile(['network_format', '_id', 'source', 'target', 'distance', 'origin'], this);
        this.nodeIds = this.nodeIds.filter(x => x.fileName !== file.name);
        this.edgeIds = this.edgeIds.filter(x => x.fileName !== file.name);
        this.nodeIds.push({
          fileName: file.name,
          ids: networkDocument.nodes.map(node => '' + node._id)
        });
        this.edgeIds.push({
          fileName: file.name,
          ids: networkDocument.links.map(link => ({
            source: '' + link.source,
            target: '' + link.target
          }))
        });
        networkDocument.warnings.forEach(warning => console.warn(`Network ${file.name}: ${warning}`));
        this.nodeEdgeCheck();
        if(this.commonService.debugMode) {
          console.log('addToTable Network detected format: ', detectedFormat, networkDocument);
        }
      } catch (error) {
        console.error('Unable to read Network file: ', file.name, error);
        addTableTile(['network_format', '_id', 'source', 'target'], this);
      }
    } else if (isJSON) {
        let data = [];
        console.log('This is a JSON file');
        if ( (typeof file.contents) === 'string') {
          data = JSON.parse(file.contents);
        } else {
          console.log(file);
          data = [file.contents];
        }

        const detectedFormat = addTableTile(Object.keys(data[0]).map(this.commonService.filterXSS), this);

        if (detectedFormat === 'node') {
          this.loadNodes(file.name, data, true);
        }
        if (detectedFormat === 'link') {
          this.loadEdges(file.name, data, true);
        }

        this.nodeEdgeCheck();

    } else if (isFasta) {
      //let that = this;
      this.commonService.parseFASTA(file.contents).then((output) => {
        addTableTile(["id", "seq"], this);

        this.nodeEdgeCheck();
        })
    } else {
      Papa.parse(file.contents, {
        header: true,
        skipEmptyLines: true,
        complete: output => {
          const detectedFormat = addTableTile(output.meta.fields.map(this.commonService.filterXSS), this);

          if (detectedFormat === 'node') {
            this.loadNodes(file.name, output, false);
          }
          if (detectedFormat === 'link') {
            this.loadEdges(file.name, output, false);
          }

          this.nodeEdgeCheck();

          if(this.commonService.debugMode) {
            console.log('addToTable parse end: ', file);
          }
        }

        
      });

      if(this.commonService.debugMode) {
        console.log('addToTabl End: ', file);
      }
    }

    //For the love of all that's good...
    //TODO: Rewrite this as a [Web Component](https://developer.mozilla.org/en-US/docs/Web/Web_Components/Using_custom_elements) or [something](https://reactjs.org/docs/react-component.html) or something.
    /**
     * Adds a file-table-row for the file.
     */
    function addTableTile(headers, context) {


      console.log('addTableTile: ', headers);
      const parentContext = context;
      const detectedFormat = parentContext.inferTabularFileFormat(file, headers, tableFormatHints);
      const isNode = detectedFormat === 'node';
      const showsColumnMapping = detectedFormat === 'node' || detectedFormat === 'link';
      const root = $('<div class="file-table-row" style="position: relative; z-index: 1;margin-bottom: 24px;"></div>').data('filename', file.name);
      const fnamerow = $('<div class="row w-100"></div>');
      const fileNameCell = $('<div></div>').addClass('file-name col');
      const deleteLink = $('<a></a>')
        .attr('href', 'javascript:void(0);')
        .addClass('far flaticon-delete-1 align-middle p-1')
        .attr('title', 'Remove this file')
        .on('click', () => {
          const fileIndex = parentContext.commonService.session.files.findIndex(f => f.name === file.name);
          if (fileIndex >= 0) {
            parentContext.commonService.session.files.splice(fileIndex, 1);
          }
          parentContext.removeFile(file.name);
          if (parentContext.commonService.session.files.length === 0) {
            parentContext.setLaunchButtonsDisabled(true);
          } else {
            parentContext.setLaunchButtonsDisabled(false, true);
          }
          root.slideUp(() => root.remove());
          parentContext.refreshTemplateState();
        });
      const downloadLink = $('<a></a>')
        .attr('href', 'javascript:void(0);')
        .addClass('far flaticon-download-1 align-middle p-1')
        .attr('title', parentContext.isFileContentsEmpty(file) ? 'Unable to resave this file' : 'Resave this file')
        .on('click', () => {
          if (parentContext.isFileContentsEmpty(file)) {
            alert('Unable to resave this file.');
          } else {
            saveAs(new Blob([file.contents], { type: file.type || 'text' }), file.name);
          }
        });
      if (parentContext.isFileContentsEmpty(file)) {
        downloadLink.css('color', 'gray');
      }
      const fileNameText = $('<span></span>')
        .addClass('p-1')
        .text(file.name);
      const formatButtons = $('<div></div>')
        .addClass('btn-group btn-group-toggle btn-group-sm float-right')
        .attr('data-toggle', 'buttons');
      const formatOptions = [
        { type: 'link', label: 'Link' },
        { type: 'node', label: 'Node' },
        { type: 'matrix', label: 'Matrix' },
        { type: 'fasta', label: 'FASTA' },
        { type: 'newick', label: 'Newick' },
        { type: 'auspice', label: 'Auspice' },
        { type: 'network', label: 'Network' },
      ];
      formatOptions.forEach(({ type, label }) => {
        const formatLabel = $('<label></label>')
          .addClass(`btn btn-light${detectedFormat === type ? ' active' : ''}`);
        const formatInput = $('<input>')
          .attr('type', 'radio')
          .attr('name', `options-${file.name}`)
          .attr('autocomplete', 'off')
          .data('type', type)
          .attr('data-type', type)
          .prop('checked', detectedFormat === type);
        formatLabel
          .append(formatInput)
          .append($('<span></span>').text(label));
        formatButtons.append(formatLabel);
      });
      fileNameCell
        .append(deleteLink)
        .append(downloadLink)
        .append(fileNameText)
        .append(formatButtons)
        .appendTo(fnamerow);

      fnamerow.appendTo(root);
      const optionsrow = $('<div class="row w-100"></div>');
      const buildFieldSelect = (fieldNumber: number) => {
        const select = $('<select></select>')
          .attr('id', `file-${file.name}-field-${fieldNumber}`)
          .addClass('form-control form-control-sm');
        select.append($('<option></option>').val('None').text('None'));
        headers.forEach(h => {
          select.append($('<option></option>').val(h).text(parentContext.commonService.titleize(h)));
        });
        return select;
      };
      const addMappingControl = (fieldNumber: number, labelText: string) => {
        const container = $('<div></div>')
          .addClass('col-4')
          .data('file', file.name)
          .attr('data-file', file.name);
        if (!showsColumnMapping) {
          container.css('display', 'none');
        }
        const selectId = `file-${file.name}-field-${fieldNumber}`;
        container
          .append($('<label></label>').attr('for', selectId).text(labelText))
          .append(buildFieldSelect(fieldNumber));
        optionsrow.append(container);
      };
      addMappingControl(1, isNode ? 'ID' : 'Source');
      addMappingControl(2, isNode ? 'Sequence' : 'Target');
      addMappingControl(3, 'Distance');

      optionsrow.appendTo(root);

      function matchHeaders(type) {

        const these = root.find('select');
        const a = type === 'node' ? ['ID', 'Id', 'id'] : ['SOURCE', 'Source', 'source'],
          b = type === 'node' ? ['SEQUENCE', 'SEQ', 'Sequence', 'sequence', 'seq'] : ['TARGET', 'Target', 'target'],
          c = ['length', 'Length', 'distance', 'Distance', 'snps', 'SNPs', 'tn93', 'TN93'];
        const explicitSelections = [file.field1, file.field2, file.field3];
        [a, b, c].forEach((list, i) => {
          const existingSelection = explicitSelections[i];

          if (existingSelection && (existingSelection === 'None' || parentContext.commonService.includes(headers, existingSelection))) {
            $(these.get(i)).val(existingSelection);
            return;
          }

          $(these.get(i)).val("None");
          list.forEach(title => {
            if (parentContext.commonService.includes(headers, title)) $(these.get(i)).val(title);
          });
          if ($(these.get(i)).val() === 'None' &&
            !(i === 1 && type === 'node') && //If Node Sequence...
            !(i === 2 && type === 'link')) { //...or Link distance...
            //...don't match to a variable in the dataset, leave them as "None".
            $(these.get(i)).val(headers[i] || 'None');
            //Everything else, just guess the next ordinal column.
          }
        });
      }

      const fileTable = parentContext.rootHtmlElement.querySelector('#file-table');
      if (!fileTable) {
        console.log('Skipping file table row render because the Files view is no longer mounted.', file.name);
        return detectedFormat;
      }

      root.appendTo(fileTable);
      matchHeaders(root.find('input[type="radio"]:checked').data('type'));

      function refit(e: any = null) {
        const type = $(e ? e.target : root.find('input[type="radio"]:checked')).data('type'),
          these = root.find('[data-file]'),
          first = $(these.get(0)),
          second = $(these.get(1)),
          third = $(these.get(2));
        if (type === 'node') {
          first.slideDown().find('label').text('ID');
          second.slideDown().find('label').text('Sequence');
          third.slideUp();
          matchHeaders(type);
        } else if (type === 'link') {
          first.slideDown().find('label').text('Source');
          second.slideDown().find('label').text('Target');
          third.slideDown();
          matchHeaders(type);
        } else {
          these.slideUp();
        }
        parentContext.updateMetadata(file);

        parentContext.setLaunchButtonsDisabled(false, true);
      };

      const selectElements = root[0].querySelectorAll('select');

      for (let i = 0; i < selectElements.length; i++) {
        selectElements[i].addEventListener('change', (event) => {
          // Handle change event here
          parentContext.updateMetadata(file);
        });
      }

      console.log('addTableTile end: ', headers);


      root.find('input[type="radio"]').on("change", refit);
      refit();
      return detectedFormat;
    }
  };

  isFileContentsEmpty(file): boolean {
    try { // large link list csv (230K rows) throws error, with try-catch, able to load file
      if (file.contents === null || file.contents === undefined) {
        return true;
      } else if (file.contents instanceof ArrayBuffer && file.contents.byteLength > 0) {
        return false;
      } else if (Object.keys(file.contents).length === 0 || file.contents == '') {
        return true;
      } else {
        return false;
      }
    } catch {
      return false;
    }
  }

  /**
   * Updates commonService.session.files info, such as field1, field2 ...etc, based on value user selects
   */
  updateMetadata(file) {
    $(this.rootHtmlElement).find('.file-table-row').each((i, el) => {
      const $el = $(el);
      const fname = $el.data('filename');
      const selects = $el.find('select');
      const checkedFormat = $el.find('input[type="radio"]:checked');
      const f = this.commonService.session.files.find(file => file.name === fname);
      if (this.commonService.debugMode) {
        console.log(f);
      }
      if (f && selects.length >= 3 && checkedFormat.length > 0) {
        f.format = checkedFormat.data('type');
        f.field1 = selects.get(0).value;
        f.field2 = selects.get(1).value;
        f.field3 = selects.get(2).value;
      }
    });

  }

  /**
   * Populates this.nodeIds
   */
  loadNodes(fileName: any, output: any, isJson: boolean) {
    if (isJson) {
      const data: any[] = output;
      const firstField = Object.keys(data[0])[0];
      if (this.nodeIds.find(x => x.fileName === fileName)) {
        const currentNodeId = this.nodeIds.find(x => x.fileName === fileName)
        currentNodeId.ids = output.map((x: any) => x[firstField])
      } else {
        this.nodeIds.push(
          {
            fileName: fileName, ids: output.map((x: any) => ('' + x[firstField]))
          });
      }

    }
    else {
      if (this.nodeIds.find(x => x.fileName === fileName)) {
        const currentNodeId = this.nodeIds.find(x => x.fileName === fileName)
        currentNodeId.ids = output.data.map((x: any) => x[output.meta.fields[0]])
      } else {
        this.nodeIds.push(
          {
            fileName: fileName, ids: output.data.map((x: any) => ('' + x[output.meta.fields[0]]))
          });
      }
    }
  }

  /**
   * Populated this.edgeIds
   */
  loadEdges(fileName: any, output: any, isJson: boolean) {
    if (isJson) {
      const data: any[] = output;
      const fields = Object.keys(data[0]);
      if (this.edgeIds.find(x => x.fileName === fileName)) {
        const currentEdgeId = this.edgeIds.find(x => x.fileName === fileName)
        currentEdgeId.ids = output.map((x: any) => ({
          source: '' + x[fields[0]],
          target: '' + x[fields[1]]
        }))
      } else {
        console.log(`Adding edges ${output}`);
        this.edgeIds.push({
          fileName: fileName,
          ids: output.map((x: any) => ({
            source: '' + x[fields[0]],
            target: '' + x[fields[1]]
          }))
        })

      }

    }
    else {
      if (this.edgeIds.find(x => x.fileName === fileName)) {
        const currentEdgeId = this.edgeIds.find(x => x.fileName === fileName)
        currentEdgeId.ids = output.data.map((x: any) => ({
          source: '' + x[output.meta.fields[0]],
          target: '' + x[output.meta.fields[1]]
        }))
      } else {
        this.edgeIds.push({
          fileName: fileName,
          ids: output.data.map((x: any) => ({
            source: '' + x[output.meta.fields[0]],
            target: '' + x[output.meta.fields[1]]
          }))
        })

      }
    }

  }

  /**
   * Updates this.uniqueEdgeNodes and this.uniqueNodes
   */
  nodeEdgeCheck() {
    // populated with a string[] of unique node ids
    let allNodesListNodes: string[] = [];
    this.nodeIds.forEach(x => {
      x.ids.forEach(y => allNodesListNodes.push(y));
    });
    allNodesListNodes = _.uniq(allNodesListNodes);

    // populated with a string[] of unique node ids that have a link/edge
    let allEdgeListNodes: string[] = [];
    this.edgeIds.forEach(x => x.ids.forEach(y => {
      allEdgeListNodes.push(y.source);
      allEdgeListNodes.push(y.target);
    }));
    allEdgeListNodes = _.uniq(allEdgeListNodes);

    this.uniqueEdgeNodes = allEdgeListNodes.filter(x => x && !allNodesListNodes.some(y=>y==x));
    this.uniqueNodes = allNodesListNodes.filter(x => x && !this.uniqueEdgeNodes.some(y=>y==x));
  }

  /**
   * Removes elements of this.nodeIds and this.edgeIds where the fileName == fileName and then calls nodeEdgeCheck to update uniqueEdgeNodes and uniqueNodes
   * @param fileName 
   */
  removeFile(fileName, runNodeEdgeCheck=true) {
    this.nodeIds = this.nodeIds.filter(x => x.fileName != fileName);
    this.edgeIds = this.edgeIds.filter(x => x.fileName != fileName);
    if (runNodeEdgeCheck) this.nodeEdgeCheck();
  }

  /**
   * Async function that reads sequencing data from fasta files or from csv/excel files with sequence data
   * 
   * @returns An array of sequencing objects [{id, seq},]
   */
  async readFastas() {
    const fastas = this.commonService.session.files.filter(f => this.commonService.includes(f.extension, 'fas'));
    const nodeFilesWithSeqs = this.commonService.session.files.filter(f => f.format === "node" && !!f.field2 && f.field2 != "None" && f.field2 != "");
    if (fastas.length === 0 && nodeFilesWithSeqs.length === 0) return [];
    let data = [];
    for (let i = 0; i < fastas.length; i++) {
      let fasta = fastas[i];
      let nodes = await this.commonService.parseFASTA(fasta.contents);
      data = data.concat(nodes);
    }
    
    for(let j = 0; j < nodeFilesWithSeqs.length; j++){
      if (nodeFilesWithSeqs[j].extension == "csv") {
        const csv = nodeFilesWithSeqs[j];
        const seqLabel = csv['field2']
          await Papa.parse(csv.contents, {
            header: true,
            skipEmptyLines: true,
            complete: output => {
              output.data.forEach((node) => {
                if (node[seqLabel] != '' || node[seqLabel] != undefined || node[seqLabel] != null ) {
                  data = data.concat({
                    'id': node.id,
                    'seq': node[seqLabel]
                  })
                }
              })
            }})
      // TODO: Cannot presently preview sequences in Node XLSX tables.
      } else {
        const file = nodeFilesWithSeqs[j]
        const seqLabel = file['field2']
        const workbook = XLSX.read(file.contents, { type: 'array', cellDates: true, dateNF: 'mm/dd/yyyy' });
        const dataJSON = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {dateNF: 'mm/dd/yyyy', raw: false});
        const headers = [];
        dataJSON.forEach(row => {
          Object.keys(row).forEach(key => {
            const safeKey = this.commonService.filterXSS(key);
            if (!this.commonService.includes(headers, safeKey)) headers.push(safeKey);
          });
          if ( row[seqLabel] != '' || row[seqLabel] != undefined || row[seqLabel] != null ) {
            data = data.concat({
              'id': row['id'],
              'seq': row[seqLabel]
            })  
          }
        });
          //addTableTile(headers, this);
      }
    }
    return data;
  }

  async updatePreview(data?) {
    if (!data) {
      data = await this.readFastas();
    }
    $('#alignment-preview').empty().append('<div class="spinner-border" role="status"><span class="sr-only">Loading...</span></div>');
    if ($('#align-sw').is(':checked')) {
      data = await this.commonService.align({
        nodes: data,
        reference: this.commonService.session.data.reference,
        match: [parseFloat($('#alignerMatch').val().toString()), -parseFloat($('#alignerMismatch').val().toString())],
        gap: [-parseFloat($('#alignerGapO').val().toString()), -parseFloat($('#alignerGapE').val().toString())]
      })
    }
    generateCanvas(data.map(obj => obj.seq.toUpperCase()), {}).then(function(canvas: HTMLCanvasElement) { 
      $('#alignment-preview').empty().append(canvas); })
  }


  /**
   * Updates SelectedDefaultDistanceThresholdVariable, microbeTrace.SelectedLinkThresholdVariable, and link-threshold widget values.
   * Then calls microbeTrace.onLinkThresholdChanged clusters, nodes, and links as well as visualizations and statistics
   * @param {string} e string representation of link threshold such as '7'
   */
  onLinkThresholdChange = (e) => {
    if(this.commonService.debugMode) {
      console.log('changing link threshold');
    }
    const newValue = e.target?.value ?? e;
    const parsedValue = parseFloat(newValue);

    this.SelectedDefaultDistanceThresholdVariable = parsedValue;
    this.commonService.session.style.widgets['link-threshold'] = parsedValue;
    this.commonService.GlobalSettingsModel.SelectedLinkThresholdVariable = parsedValue;
    this.store.setLinkThreshold(parsedValue);
  }

  /**
   * Updates this.SelectedDefaultDistanceMetricVariable, microbeTrace.SelectedDistanceMetricVariable, and default-distance-metric widget.
   * Updates link-threshold variable to default values and updates clusters, nodes, links as well as visualizations and statitistics
   * @param {string} e such as 'snps' 
   */
  onDistanceMetricChange = (metric: string) => {
    if(this.commonService.debugMode) {
      console.log('distance ch:', metric);
    }
    
    // 1. Update the component's state property for the dropdown
    this.SelectedDefaultDistanceMetricVariable = metric;

    // 2. Update the session state and notify the store (maintains original functionality)
    this.commonService.session.style.widgets['default-distance-metric'] = metric.toLowerCase();
    this.store.setMetricChanged(metric);
    this.store.updatecurrentThresholdStepSize(metric.toLowerCase());

    if (metric.toLowerCase() === 'snps') {
      // 3. Update the step attribute and UI visibility
      $('#default-distance-threshold').attr('step', 1);
      $("#ambiguities-row").slideUp();
      
      // 4. Update the threshold value and notify the store
      this.SelectedDefaultDistanceThresholdVariable = 16;
      this.onLinkThresholdChange('16'); 
    } else { // tn93
      $('#default-distance-threshold').attr('step', 0.001);
      $("#ambiguities-row").slideDown();

      this.SelectedDefaultDistanceThresholdVariable = 0.015;
      this.onLinkThresholdChange('0.015');
    }
  }

  onAmbiguityStrategyChanged() {
    this.commonService.session.style.widgets['ambiguity-resolution-strategy'] = this.SelectedAmbiguityResolutionStrategyVariable;
  }

  onAmbiguityThresholdChanged() {
    this.commonService.session.style.widgets['ambiguity-threshold'] = this.SelectedAmbiguityThresholdVariable;
  }

  applyStyleFileSettings() {
    if (this.SelectedDefaultDistanceMetricVariable != this.commonService.session.style.widgets['default-distance-metric']){
      this.SelectedDefaultDistanceMetricVariable = this.commonService.session.style.widgets['default-distance-metric'].toLowerCase();
    }

    if (this.SelectedAmbiguityResolutionStrategyVariable != this.commonService.session.style.widgets['ambiguity-resolution-strategy']){
        this.SelectedAmbiguityResolutionStrategyVariable = this.commonService.session.style.widgets['ambiguity-resolution-strategy'];
    }

    if (this.SelectedAmbiguityThresholdVariable != this.commonService.session.style.widgets['ambiguity-threshold']) {
      this.SelectedAmbiguityThresholdVariable = this.commonService.session.style.widgets['ambiguity-threshold'];
    }

    if (this.SelectedDefaultDistanceThresholdVariable != this.commonService.session.style.widgets['link-threshold']){
        this.SelectedDefaultDistanceThresholdVariable = this.commonService.session.style.widgets['link-threshold'];
    }

    if (this.SelectedDefaultViewVariable != this.commonService.session.style.widgets['default-view']){
      this.setDefaultView(this.commonService.session.style.widgets['default-view'], false);
    }
  }
}

export namespace FilesComponent {
  export const componentTypeName = 'Files';
}
