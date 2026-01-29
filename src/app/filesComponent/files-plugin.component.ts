import { Component, Output, EventEmitter, OnInit, Inject, ElementRef, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonService } from '../contactTraceCommonServices/common.service';
import * as XLSX from 'xlsx';
import * as Papa from 'papaparse';
import * as saveAs from 'file-saver';
import * as fileto from 'fileto';
import { generateCanvas } from '../visualizationComponents/AlignmentViewComponent/generateAlignmentViewCanvas';
import * as tn93 from 'tn93';
import * as patristic from 'patristic';
import * as _ from 'lodash';
import { MicrobeTraceNextVisuals } from '../microbe-trace-next-plugin-visuals';
import { EventEmitterService } from '@shared/utils/event-emitter.service';
import { BaseComponentDirective } from '@app/base-component.directive';
import { ComponentContainer } from 'golden-layout';
import { cloneDeep } from 'lodash';
import { Subject, Subscription, takeUntil } from 'rxjs';
import { CommonStoreService } from '@app/contactTraceCommonServices/common-store.services';
import { relativeTimeThreshold } from 'moment';
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

  SelectedDefaultDistanceMetricVariable: string = "tn93";
  SelectedAmbiguityResolutionStrategyVariable: string = "AVERAGE";
  SelectedAmbiguityThresholdVariable: any = 0.015;
  SelectedDefaultDistanceThresholdVariable: any = 0.015;
  SelectedDefaultViewVariable: string = "2D Network";
  SelectedGenerateNumberVariable: any = 100;

  DirectionalityTypes: any = [
    { label: 'Off', value: 'Off' },
    { label: 'Inferred', value: 'Inferred' }
  ];
  SelectedDirectionalityTypeVariable: string = "Off";

  TriangulationTypes: any = [
    { label: 'Off', value: 'Off' },
    { label: 'On', value: 'On' }
  ];
  SelectedTriangulationTypeVariable: string = "Off";

  AutostashingTypes: any = [
    { label: 'Off', value: 'Off' },
    { label: 'On', value: 'On' }
  ];
  SelectedAutostashingTypeVariable: string = "Off";


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

  nodeIds: { fileName: string; ids: string[] }[] = [];
  edgeIds: { fileName: string; ids: { source: string; target: string }[] }[] = [];

  uniqueNodes: string[] = [];
  uniqueEdgeNodes: string[] = [];

  public title: string;
  public id: string;

  private destroy$ = new Subject<void>();

  

  constructor(
    @Inject(BaseComponentDirective.GoldenLayoutContainerInjectionToken) private container: ComponentContainer, elRef: ElementRef,
    private eventEmitterService: EventEmitterService,
    public commonService: CommonService,
    private cdr: ChangeDetectorRef,
    private store: CommonStoreService
    ) {

    super(elRef.nativeElement);

    // this.title = this.container.title;
    this.id = this.container.parent.id;

  }

  ngOnInit() {

    this.RefSeqIDTypes.push(
      { label: 'Pol', value: this.commonService.HXB2.substr(2000, 2100) });

    this.RefSeqIDTypes.push(
      { label: 'Complete', value: this.commonService.HXB2 });


    this.SelectedDefaultDistanceThresholdVariable = this.commonService.GlobalSettingsModel.SelectedLinkThresholdVariable;
    this.SelectedDefaultDistanceMetricVariable = this.commonService.GlobalSettingsModel.SelectedDistanceMetricVariable;
    this.commonService.LoadViewEvent.subscribe((v) => { this.loadDefaultVisualization(v); });
    this.commonService.session.data.reference = this.commonService.HXB2.substr(2000, 2100);

    if (this.eventEmitterService.subsVar==undefined) {    
      this.eventEmitterService.subsVar = this.eventEmitterService.    
        invokeFirstComponentFunction.subscribe((name:string) => {    
          this.processFile();    
        });    
    }  

     // Subscribe to new session event
     this.store.newSession$.subscribe(() => {
      this.removeAllFiles();
    });

    // Subscribe to style file applied event
    this.store.styleFileApplied$.subscribe(() => {
      this.applyStyleFileSettings();
    });

    this.store.FP_removeFiles$.subscribe(() => {
      this.commonService.session.files.forEach(file => {
        this.removeFile(file.name, false);
      })
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
          this.commonService.session.data.reference = e.data;// this.value;

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

      const lsv = e.data ? e.data : 'tn93';
      this.commonService.localStorageService.setItem('default-distance-metric', lsv);
      $('#default-distance-metric').val(lsv);
      console.log(lsv);
      if (lsv.toLowerCase() === 'snps') {
        $('#ambiguities-row').slideUp();
        $('#default-distance-threshold') //, #link-threshold')
          .attr('step', 1)
          .val(16);
        this.commonService.GlobalSettingsModel.SelectedLinkThresholdVariable = 16;
        console.log('default-distance-metric change file-plugin.component.ts snps');
        this.store.setLinkThreshold(16);
      } else {
        $('#ambiguities-row').slideDown();
        $('#default-distance-threshold') //, #link-threshold')
          .attr('step', 0.001)
          .val(0.015);
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

      const v = e.data; //this.value;
      this.commonService.session.style.widgets['ambiguity-resolution-strategy'] = v;
      if (v === 'HIVTRACE-G') {
        $('#ambiguity-threshold-row').slideDown();
      } else {
        $('#ambiguity-threshold-row').slideUp();
      }
    }).change();

    $('#ambiguity-threshold').on('change', (e) => {

      //debugger;

      const v = e.data; //this.value;
      this.commonService.session.style.widgets['ambiguity-threshold'] = v;
    });

    let cachedView = "";
    this.commonService.localStorageService.getItem('default-view', (result) => {
      cachedView = result;
    });

    $('#default-view')
      .on('change', (e) => {

        //debugger;

        const v = e.data;// this.value;
        this.commonService.localStorageService.setItem('default-view', v);
        this.commonService.session.style.widgets['default-view'] = v;
        this.commonService.session.layout.content[0].type = v;
      })
      .val(cachedView ? cachedView : this.commonService.session.style.widgets['default-view'])
      .trigger('change');

    //$('#generate-sequences').on('click', () => {
    //    $('#file-prompt').remove();
    //    $('#launch').prop('disabled', false).focus();
    //    this.processFile(new File([Papa.unparse(this.commonService.generateSeqs('gen-' + this.commonService.session.meta.readyTime + '-', parseFloat($('#generate-number').val().toString()), 20))], 'generatedNodes.csv'));
    //});

    $('#infer-directionality-false').parent().on('click', () => {

      //debugger;

      this.commonService.session.style.widgets['infer-directionality-false'] = true;
    });

    $('#infer-directionality').parent().on('click', () => {

      //debugger;

      this.commonService.session.style.widgets['infer-directionality-false'] = false;
    });

    $('#triangulate-false').parent().on('click', () => {

      //debugger;

      this.commonService.session.style.widgets['triangulate-false'] = true;
    });

    $('#triangulate').parent().on('click', () => {

      //debugger;

      this.commonService.session.style.widgets['triangulate-false'] = false;
    });

    $('#stash-auto-yes').parent().on('click', () => {

      //debugger;

      this.commonService.localStorageService.setItem('stash-auto', 'true');
    });

    if (localStorage.getItem('stash-auto') === 'true') {
      $('#stash-auto-yes').parent().trigger('click');
    }

    $('#stash-auto-no').parent().on('click', () => {

      //debugger;

      if (this.commonService.temp.autostash) clearInterval(this.commonService.temp.autostash.interval);
      this.commonService.localStorageService.setItem('stash-auto', 'false');
    });

    if(this.commonService.session.network.launched){
      $('#launch').text('Update');
    }

    

    // $.getJSON("../assets/outbreak.microbetrace", (window as any).context.commonService.applySession);
    // Use this when building production (.ie gh-pages branch)
    if (!this.auspiceUrlVal) {
      this.auspiceUrlVal = this.commonService.getURL();
    }

    if(!this.commonService.session.network.initialLoad && !this.auspiceUrlVal) {
      console.log('launching outbreak');
      $.getJSON("COVID_DummySession.microbetrace", this.commonService.applySession.bind(this.commonService)).then(() => { this.populateTable()});   
      this.commonService.session.network.launched = true; 
      this.commonService.session.network.initialLoad = true; 

    }

  //   setTimeout(() => {
  //     this.populateTable();
  // }, 2000);

    // console.log('session: ', this.commonService?.session?.files, this.commonService.session.files.length);
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
    this.commonService.LoadViewEvent.unsubscribe();

  }

  /**
   * For each file in commonService.session.files, addToTable(file)
   */
  public populateTable() {  
    const fileTableRows = $(".file-table-row");
    fileTableRows.slideUp(() => fileTableRows.remove());

    let files = cloneDeep(this.commonService.session.files);
    console.log('---  Populate TABLE Row Files 2: ', files);

    console.log('--- files table 2 : ', $(".file-table-row"));

    if(files && files.length > 0) {
      console.log('--- Populate for: ', files);
      for(let i = 0; i < files.length; i++) {
        this.addToTable(files[i]);
      }

      console.log('--- GetFile Content Populate TABLE End: ', $(".file-table-row"));

    } 

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
    const v = e.target.selectedOptions[0].innerText;
    this.commonService.localStorageService.setItem('default-view', v);
    this.commonService.session.style.widgets['default-view'] = v;
    this.commonService.session.layout.content[0].type = v;
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

      $('#launch').prop('disabled', false).focus();

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
  

  /**
   * Resets the value of session.data, temp.trees if previously launched (or more if not previously launched). Retains the values of following 
   * widgets: link-threshold, default-distance-metric, ambiguity-resolution-strategy, and default view.
   * Calls creatLaunchSequences to process the data files loaded.
   */
  launchClick() {

     // Set to false to indicate that the network is not fully loaded  as new network is launching
     this.commonService.session.network.isFullyLoaded = false;
     
    // launching new network, so set network rendered to false to start loading modal
    this.store.setNetworkRendered(false);
    this.store.setNetworkUpdated(false);
    this.store.setSettingsLoaded(false);

    this.commonService.cleanupData();

    this.commonService.updateLegacyNodeSymbols();
    const thresholdOnLaunch = this.commonService.session.style.widgets["link-threshold"];
    const metricOnLaunch = this.commonService.session.style.widgets["default-distance-metric"];
    const ambiguityOnLaunch = this.commonService.session.style.widgets["ambiguity-resolution-strategy"];
    const viewOnLaunch = this.commonService.session.style.widgets["default-view"];


    console.log('launch click');
    if( this.commonService.session.network.launched) {
      console.log('launch click launched ', this.commonService.session.network.launched);

      this.commonService.resetData();

      $('#launch').text('Update');
      // this.visuals.twoD.isLoading = true;
      this.commonService.session.style.nodeColorsTable = {};
      this.commonService.session.style.nodeColorsTableKeys = {};
      this.commonService.session.style.nodeSymbolsTable = {};
      this.commonService.session.style.nodeSymbolsTableKeys = {};
    }
    else if (!this.commonService.session.network.launched) {
      console.log('launch click not launched ', this.commonService.session.network.launched);

      this.commonService.resetData();
      this.commonService.session.network.launched = true;
    }

    this.commonService.session.style.widgets["link-threshold"] = thresholdOnLaunch;
    this.commonService.session.style.widgets["default-distance-metric"] = metricOnLaunch;
    this.commonService.session.style.widgets["ambiguity-resolution-strategy"] = ambiguityOnLaunch;
    this.commonService.session.style.widgets["default-view"] = viewOnLaunch;

    this.commonService.session.messages = [];
    this.messages = [];

    console.log('session files', this.commonService.session.files);

    // this.displayloadingInformationModal = true;

    this.showMessage("Starting...");

    setTimeout(() => {
      // Process the data files loaded.
      this.creatLaunchSequences();
    }, 1000);
  }

  /**
   * Processes all files in following order (auspice, newick, matrix, link, node, fasta).
   * Adds/Updates nodes and links. After processing all files, calls processData.
   */
  creatLaunchSequences() {
    this.commonService.session.meta.startTime = Date.now();
    $('#launch').prop('disabled', true);

    // $('#loading-information').html('');
    this.commonService.temp.messageTimeout = setTimeout(() => {
      $('#loadCancelButton').slideDown();
      // abp.notify.warn('If you stare long enough, you can reverse the DNA Molecule\'s spin direction');
    }, 20000);
    const nFiles = this.commonService.session.files.length - 1;
    const check = nFiles > 0;

    // sorts files based on hierarchy
    const hierarchy = ['auspice', 'newick', 'matrix', 'link', 'node', 'fasta'];
    this.commonService.session.files.sort((a, b) => hierarchy.indexOf(a.format) - hierarchy.indexOf(b.format));


    this.commonService.session.meta.anySequences = this.commonService.session.files.some(file => (file.format === "fasta") || (file.format === "node" && file.field2 !== "None"));

    this.commonService.session.files.forEach((file, fileNum) => {
      const start = Date.now();
      const origin = [file.name];
      if (file.format === 'auspice') {
        this.showMessage(`Parsing ${file.name} as Auspice...`);
        // this.commonService.localStorageService.setItem('default-view', 'phylogenetic-tree');
        // this.commonService.localStorageService.setItem('default-distance-metric', 'SNPs');
        this.commonService.applyAuspice(file.contents).then(auspiceData => {
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
          auspiceData['links'].forEach(link => {
            linkCount += this.commonService.addLink(link, true);
          });

          this.commonService.runHamsters();
          this.showMessage(` - Parsed ${nodeCount} New Nodes and ${linkCount} new Links from Auspice file.`);
          if (fileNum === nFiles) this.processData();
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
        this.commonService.parseFASTA(file.contents).then(seqs => {
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

          console.log('FASTA Merge time:', (Date.now() - start).toLocaleString(), 'ms');
          this.showMessage(` - Parsed ${newNodes} New, ${seqs.length} Total Nodes from FASTA.`);
          if (fileNum === nFiles) this.processData();
        });

      } else if (file.format === 'link') {

        this.showMessage(`Parsing ${file.name} as Link List...`);
        let l = 0;

        const sources = [];
        const targets = [];

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
            let key = this.commonService.filterXSS(keys[i]);
            // console.log('key is: ',key);

            if(key === "distance") {
              // console.log('key is distance');
              link[key] = parseFloat(link[key]);
            } else if (key === 'origin') {
              // related to zenhub#810: link list csv was exported from table view and unable to be loaded correctly; this code create a new linkField when it runs into field called origin 
              link['originColumnFromFile'] = link['origin'].split('\n')
              safeLink['originColumnFromFile'] = link['originColumnFromFile'];
              link['origin'] = origin;

              if (!this.commonService.includes(this.commonService.session.data.linkFields, 'originColumnFromFile')) {
                this.commonService.session.data.linkFields.push('originColumnFromFile');
              }
            }
            
            safeLink[key] = link[key];
            // console.log('safelink key is: ',safeLink[key]);
            // console.log('safelink is: x',safeLink);

            if (!this.commonService.includes(this.commonService.session.data.linkFields, key)) {
              this.commonService.session.data.linkFields.push(key);
            }
          }

          const src = '' + safeLink[file.field1];
          const tgt = '' + safeLink[file.field2];

          sources.push(src);
          targets.push(tgt);

          const srcIndex = targets.findIndex(t => t == src);
          const tgtIndex = sources.findIndex(s => s == tgt);

          // console.log("safe link is: ",safeLink);

          // Link is the same -> bidirectional
          if(srcIndex != -1 && tgtIndex != -1) {
              
            // Set distance if distance set (field 3)
            l += this.commonService.addLink(Object.assign({
               source: '' + safeLink[file.field1],
               target: '' + safeLink[file.field2],
               origin: origin,
               visible: true,
               directed : file.field3 == 'None' ? true : false,
               bidirectional: file.field3 == 'None' ? true : false,
               distance: file.field3 == 'None' ? 0 : parseFloat(safeLink[file.field3]),
               hasDistance : file.field3 == 'None' ? false : true,
               distanceOrigin: file.field3 == 'None' ? '' : file.name
             }, safeLink), check);

         } else {

          // console.log("distance is: ", file.field3 != 'distance' ? 0 : parseFloat(safeLink[file.field3]))
          // TODO uncomment when testing adding new link
          //  console.log('adding 2: ', _.cloneDeep(Object.assign({
          //         source: '' + safeLink[file.field1],
          //         target: '' + safeLink[file.field2],
          //         origin: origin,
          //         visible: true,
          //         directed : file.field3 != 'distance' ? true : false,
          //         bidirectional: file.field3 != 'distance' ? true : false,
          //         distance: file.field3 != 'distance' ? 0 : parseFloat(safeLink[file.field3]),
          //         hasDistance : file.field3 != 'distance' ? false : true,
          //         distanceOrigin: file.field3 != 'distance' ? '' : file.name
          //       }, safeLink)));

           l += this.commonService.addLink(Object.assign({
               source: '' + safeLink[file.field1],
               target: '' + safeLink[file.field2],
               origin: origin,
               visible: true,
               directed : file.field3 == 'None' ? true : false,
               distance: file.field3 == 'None' ? 0 : parseFloat(safeLink[file.field3]),
               hasDistance : file.field3 == 'None' ? false : true,
               distanceOrigin: file.field3 == 'None' ? '' : file.name
             }, safeLink), check);
         }  

        //  console.log('matrixx1: ',  JSON.stringify((window as any).context.commonService.temp.matrix));


        };

        if (file.extension === 'xls' || file.extension === 'xlsx') {

          const workbook = XLSX.read(file.contents, { type: 'array' });
          const data = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
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
              n += this.commonService.addNode({
                _id: '' + f1,
                origin: origin
              }, true);
            }
            const f2 = l[file.field2];
            if (nodeIDs.indexOf(f2) === -1) {
              t++;
              nodeIDs.push(f2);
              n += this.commonService.addNode({
                _id: '' + f2,
                origin: origin
              }, true);
            }
          }

          console.log('Link Excel Parse time:', (Date.now() - start).toLocaleString(), 'ms');
          this.showMessage(` - Parsed ${n} New, ${t} Total Nodes from Link Excel Table.`);
          if (fileNum === nFiles) this.processData();

        } else if (file.extension === 'json') {
            const results = JSON.parse(file.contents);
            if (!results || results.length === 0) return;

            const data = results;
            data.map(forEachLink);
            this.showMessage(` - Parsed ${l} New, ${data.length} Total Links from Link JSON.`);
            if (data.length > 0)
              Object.keys(data[0]).forEach(key => {
                const safeKey = this.commonService.filterXSS(key);

                if (!this.commonService.includes(this.commonService.session.data.linkFields, safeKey)) {
                  this.commonService.session.data.linkFields.push(safeKey);
                }
              });
            let newNodes = 0, totalNodes = 0;
            const n = data.length;
            const nodeIDs = [];
            // for each object in json, check if node exist, if not add it
            for (let i = 0; i < n; i++) {

              const l = data[i];
              const f1 = l[file.field1];
              if (nodeIDs.indexOf(f1) === -1) {
                totalNodes++;
                newNodes += this.commonService.addNode({
                  _id: '' + f1,
                  origin: origin
                }, true);
              }
              const f2 = l[file.field2];
              if (nodeIDs.indexOf(f2) === -1) {
                totalNodes++;
                newNodes += this.commonService.addNode({
                  _id: '' + f2,
                  origin: origin
                }, true);
              }
            }

            console.log('Link JSON Parse time:', (Date.now() - start).toLocaleString(), 'ms');
            this.showMessage(` - Parsed ${newNodes} New, ${totalNodes} Total Nodes from Link JSON.`);
            if (fileNum === nFiles) this.processData();
          } else {

            Papa.parse(file.contents, {
              header: true,
              dynamicTyping: true,
              skipEmptyLines: true,
              complete: results => {
                const data = results.data;
                data.map(forEachLink);
                this.showMessage(` - Parsed ${l} New, ${data.length} Total Links from Link CSV.`);
                results.meta.fields.forEach(key => {
                  const safeKey = this.commonService.filterXSS(key);

                  if (!this.commonService.includes(this.commonService.session.data.linkFields, safeKey)) {
                    this.commonService.session.data.linkFields.push(safeKey);
                  }
                });
                let newNodes = 0, totalNodes = 0;
                const n = data.length;
                const nodeIDs = [];
                for (let i = 0; i < n; i++) {
                  const l = data[i];
                  const f1 = l[file.field1];
                  if (nodeIDs.indexOf(f1) === -1) {
                    totalNodes++;
                    newNodes += this.commonService.addNode({
                      _id: '' + f1,
                      origin: origin
                    }, true);
                  }
                  const f2 = l[file.field2];
                  if (nodeIDs.indexOf(f2) === -1) {
                    totalNodes++;
                    newNodes += this.commonService.addNode({
                      _id: '' + f2,
                      origin: origin
                    }, true);
                  }
                }

                console.log('Link CSV Parse time:', (Date.now() - start).toLocaleString(), 'ms');
                this.showMessage(` - Parsed ${newNodes} New, ${totalNodes} Total Nodes from Link CSV.`);
                if (fileNum === nFiles) this.processData();
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

          const workbook = XLSX.read(file.contents, { type: 'array' });
          const data = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { raw: false, dateNF: 'yyyy-mm-dd'});
          data.forEach(node => {
            let safeNode = {
              _id: this.commonService.filterXSS('' + node[file.field1]),
              seq: (file.field2 === 'None') ? '' : this.commonService.filterXSS(node[file.field2]),
              origin: origin
            };
            Object.keys(node).forEach(key => {
              let safeKey = this.commonService.filterXSS(key);
              if (!this.commonService.includes(this.commonService.session.data.nodeFields, safeKey)) {
                this.commonService.session.data.nodeFields.push(safeKey);
              }
              safeNode[safeKey] = this.commonService.filterXSS(node[key]);
            });
            m += this.commonService.addNode(safeNode, check);
          });

          console.log('Node Excel Parse time:', (Date.now() - start).toLocaleString(), 'ms');
          this.showMessage(` - Parsed ${m} New, ${n} Total Nodes from Node Excel Table.`);
          if (fileNum === nFiles) this.processData();

        } else
          if (file.extension === 'json') {
            const results = JSON.parse(file.contents);
            if (!results || results.length === 0) return;
            results.forEach(data => {

              const node = data;//data[0]             

              if (node[file.field1] && node[file.field1].toString().trim()) {

                let safeNode = {
                  _id: this.commonService.filterXSS('' + node[file.field1]),
                  seq: (file.field2 === 'None') ? '' : this.commonService.filterXSS(node[file.field2]),
                  origin: origin
                };

                Object.keys(node).forEach(key => {
                  let safeKey = this.commonService.filterXSS(key);
                  if (!this.commonService.includes(this.commonService.session.data.nodeFields, safeKey)) {
                    this.commonService.session.data.nodeFields.push(safeKey);
                  }
                  safeNode[safeKey] = this.commonService.filterXSS(node[key]);
                });
                m += this.commonService.addNode(safeNode, check);
              }
            })

            console.log('Node JSON Parse time:', (Date.now() - start).toLocaleString(), 'ms');
            this.showMessage(` - Parsed ${m} New, ${n} Total Nodes from Node JSON.`);

            if (fileNum === nFiles) this.processData();

          } else {

            Papa.parse(file.contents, {
              header: true,
              dynamicTyping: true,
              skipEmptyLines: true,
              step: data => {

                const node = data.data;

                if (node[file.field1] && node[file.field1].toString().trim()) {

                  let safeNode = {
                    _id: this.commonService.filterXSS('' + node[file.field1]),
                    seq: (file.field2 === 'None') ? '' : this.commonService.filterXSS(node[file.field2]),
                    origin: origin
                  };

                  Object.keys(node).forEach(key => {
                    let safeKey = this.commonService.filterXSS(key);
                    if (!this.commonService.includes(this.commonService.session.data.nodeFields, safeKey)) {
                      this.commonService.session.data.nodeFields.push(safeKey);
                    }
                    safeNode[safeKey] = this.commonService.filterXSS(node[key]);
                  });
                  m += this.commonService.addNode(safeNode, check);
                }
              },
              complete: () => {

                console.log('Node CSV Parse time:', (Date.now() - start).toLocaleString(), 'ms');
                this.showMessage(` - Parsed ${m} New, ${n} Total Nodes from Node CSV.`);

                if (fileNum === nFiles) this.processData();
              }
            });
          }

      } else if (file.format === 'matrix') {

        this.showMessage(`Parsing ${file.name} as Distance Matrix...`);

        if (file.extension === 'xls' || file.extension === 'xlsx') {

          const workbook = XLSX.read(file.contents, { type: 'array' });
          const data = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });
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
          this.showMessage(` - Parsed ${nn} New, ${data.length - 1} Total Nodes from Excel Distance Matrix.`);
          this.showMessage(` - Parsed ${nl} New, ${((data.length - 1) ** 2 - (data.length - 1)) / 2} Total Links from Excel Distance Matrix.`);
          if (fileNum === nFiles) this.processData();

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

          this.showMessage(` - Parsed ${nn} New, ${tn} Total Nodes from Distance Matrix.`);
          this.showMessage(` - Parsed ${nl} New, ${tl} Total Links from Distance Matrix.`);
          if (fileNum === nFiles) this.processData();
          //this.commonService.parseCSVMatrix(file).then((o: any) => {
          //});
        }

      } else { // if(file.format === 'newick'){

        this.commonService.resetData();
        let links = 0;
        let newLinks = 0;
        let newNodes = 0;
        this.commonService.session.data.newickString = file.contents;
        const tree = patristic.parseNewick(file.contents);
        let m = tree.toMatrix(), matrix = m.matrix, labels = m.ids.map(this.commonService.filterXSS), n = labels.length;
        const maxRow = matrix.map(function(row){ return Math.max.apply(Math, row); });
        const maxMax = Math.max.apply(null, maxRow);
        if (maxMax > 1) {
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
          // set distance to snps
        } 
        for (let i = 0; i < n; i++) {
          const source = labels[i];
          newNodes += this.commonService.addNode({
            _id: source,
            origin: origin
          }, check);
          for (let j = 0; j < i; j++) {
            newLinks += this.commonService.addLink({
              source: source,
              target: labels[j],
              origin: origin,
              distance: parseFloat(matrix[i][j]),
              distanceOrigin: file.name,
              hasDistance: true
            }, check);
            links++;
          }
        }
        console.log('Newick Tree Parse time:', (Date.now() - start).toLocaleString(), 'ms');
        this.showMessage(` - Parsed ${newNodes} New, ${n} Total Nodes from Newick Tree.`);
        this.showMessage(` - Parsed ${newLinks} New, ${links} Total Links from Newick Tree.`);
        if (fileNum === nFiles) this.processData();
      }
    });

  }

  /**
   * Adds links for nodes with no edge?
   * Then calls processSequence
   */
  processData() {
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

    this.processSequence()
  }

  /**
   * If sequences are present, processes them by aligning if needed, computing consensus, consensus distances, ambiguity counts, and then links
   */
  async processSequence() {

    if (!this.commonService.session.meta.anySequences) return this.commonService.runHamsters();
    this.commonService.session.data.nodeFields.push('seq');
    let subset = [];
    console.log('link same nodes22: ', this.commonService.session.data.nodes.length, this.commonService.session.data.nodes);
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

    console.log('link same nodes33: ', subset);

    if (this.commonService.session.style.widgets['align-sw']) {
      this.showMessage('Aligning Sequences...');
      let output = await (this.commonService.session as any).align({
        reference: this.commonService.session.data.reference,
        isLocal: $('#localAlign').is(':checked'),
        match: [$('#alignerMatch').val(), $('#alignerMismatch').val()].map(parseFloat),
        gap: [$('#alignerGapO').val(), $('#alignerGapE').val()].map(parseFloat),
        nodes: subset
      });
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

    (this.commonService.session.data as any).consensus = await this.commonService.computeConsensus();
    await this.commonService.computeConsensusDistances();
    subset.sort((a, b) => a['_diff'] - b['_diff']);
    if (this.commonService.session.style.widgets['ambiguity-resolution-strategy']) {
      await this.commonService.computeAmbiguityCounts();
    }
    this.showMessage('Computing Links based on Genomic Proximity...');
    const k = await this.commonService.computeLinks(subset);
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
  processFiles(files?: FileList) {
    this.isLoadingFiles = true;

    if (Array.from(files).length > 0) {

      Array.from(files).map(file => {
        this.processFile(file);
      });

    }

    this.isLoadingFiles = false;

  };

  /**
   * Gets file extension and calls appropriate function to load info into MicrobeTrace.
   * For example, for json files commonService.processJSON is used.
   * Adds file to commonService.session.files and adds file to table with this.addToTable
   * 
   * XXXXX Currrently unable to load zip files XXXXX
   * @returns 
   */
  processFile(rawfile?) {
    if(!rawfile) {
      rawfile = this.commonService.session.files[0];
    }

    if(this.commonService.debugMode) {
      console.log('raw file: ', rawfile);
    }


    // Loading informaiton null
    // $('#loading-information').html('');

    const extension = rawfile.name.split('.').pop().toLowerCase();

    console.log('process file end');
    if (extension === 'zip') {
      //debugger;
      // let new_zip = new JSZip();
      // new_zip
      //     .loadAsync(rawfile)
      //     .then(zip => {
      //         zip.forEach((relativePath, zipEntry) => {
      //             zipEntry.async("text").then(c => {
      //                 this.commonService.processJSON(c, zipEntry.name.split('.').pop())
      //             });
      //         });
      //     });
      return;
    }

    if (extension === 'microbetrace' || extension === 'hivtrace') {
      //debugger;
      let reader = new FileReader();
      reader.onloadend = out => {this.commonService.processJSON(out.target, extension).then(() => this.populateTable())};
      reader.readAsText(rawfile, 'UTF-8');
      return;
    }
    if (extension === 'svg') {
      //debugger;
      let reader = new FileReader();
      reader.onloadend = out => this.commonService.processSVG(out.target);
      reader.readAsText(rawfile, 'UTF-8');
      return;
    }
    if (extension === 'json') {
      const fileName = this.commonService.filterXSS(rawfile.name);
      let reader = new FileReader();
      reader.onloadend = (out) => {
        const output = JSON.parse(out.target['result'] as string);
        console.log(output);
        if (output.meta && output.tree) {
          const auspiceFile = { contents: output, name: fileName, extension: extension};
          this.commonService.session.files.push(auspiceFile);
          this.addToTable(auspiceFile);
          // this.commonService.temp.auspiceOutput = output;
        } else {
          this.commonService.processJSON(out.target, extension);
        }
      };
      reader.readAsText(rawfile, 'UTF-8');
      return;
    }

    fileto.promise(rawfile, (extension === 'xlsx' || extension === 'xls') ? 'ArrayBuffer' : 'Text').then(file => {
      //debugger;
      file.name = this.commonService.filterXSS(file.name);
      file.extension = file.name.split('.').pop().toLowerCase();
      this.commonService.session.files.push(file);
      this.addToTable(file);
    });
  }

  /**
   * Removes all files from commonService.session.files, sets this.nodeIds and this.edgeIds to empty arrays [].
   * Calls nodeEdgeCheck
   */
  removeAllFiles() {
    const fileTableRows = $(".file-table-row");
    fileTableRows.slideUp(() => fileTableRows.remove());

    this.commonService.session.files = [];
    this.nodeIds = [];
    this.edgeIds = [];

    this.nodeEdgeCheck();
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
    const isXL = (extension === 'xlsx' || extension === 'xls');
    const isJSON = (extension === 'json');
    const isAuspice = (extension === 'json' && file.contents.meta && file.contents.tree);
    const isNode = this.commonService.includes(file.name.toLowerCase(), 'node') || (file.format && file.format.toLowerCase() === 'node');
    if (isXL) {
      try {
        const workbook = XLSX.read(file.contents, { type: 'array' });
        const data = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
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
    } else if (isJSON) {
        let data = [];
        console.log('This is a JSON file');
        if ( (typeof file.contents) === 'string') {
          data = JSON.parse(file.contents);
        } else {
          console.log(file);
          data = [file.contents];
        }

        addTableTile(Object.keys(data[0]).map(this.commonService.filterXSS), this);

        if (!isFasta && !isNewick && isNode) {
          this.loadNodes(file.name, data, true);
        }
        if (!isFasta && !isNewick && !isNode) {
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
          addTableTile(output.meta.fields.map(this.commonService.filterXSS), this);

          if (!isFasta && !isNewick && isNode) {
            this.loadNodes(file.name, output, false);
          }
          if (!isFasta && !isNewick && !isNode) {
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
      const root = $('<div class="file-table-row" style="position: relative; z-index: 1;margin-bottom: 24px;"></div>').data('filename', file.name);
      const fnamerow = $('<div class="row w-100"></div>');
      $('<div class="file-name col"></div>')
        .append($('<a href="javascript:void(0);" class="far flaticon-delete-1 align-middle p-1" title="Remove this file"></a>').on('click', () => {
          parentContext.commonService.session.files.splice(parentContext.commonService.session.files.findIndex(f => f.name === file.name), 1);
          parentContext.removeFile(file.name);
          $('#launch').prop('disabled', false).focus();
          $('#launch').text('Update');
          root.slideUp(() => root.remove());
        }))
        .append($(`<a href="javascript:void(0);" class="far flaticon-download-1 align-middle p-1" ${parentContext.isFileContentsEmpty(file) ? 'style="color: gray" title="Unable to resave this file"': 'title="Resave this file"' } ></a>`).on('click', () => {
          if (parentContext.isFileContentsEmpty(file)) {
            alert('Unable to resave this file.');
          } else {
            saveAs(new Blob([file.contents], { type: file.type || 'text' }), file.name);
          }
        }))
        .append('<span class="p-1">' + file.name + '</span>')
        .append(`
                    <div class="btn-group btn-group-toggle btn-group-sm float-right" data-toggle="buttons">
                      <label class="btn btn-light${!isFasta && !isNewick && !isNode && !isAuspice ? ' active' : ''}">
                        <input type="radio" name="options-${file.name}" data-type="link" autocomplete="off"${!isFasta && !isNewick && !isNode ? ' checked' : ''}>Link
                      </label>
                      <label class="btn btn-light${!isFasta && !isNewick && isNode ? ' active' : ''}">
                        <input type="radio" name="options-${file.name}" data-type="node" autocomplete="off"${!isFasta && !isNewick && isNode ? ' checked' : ''}>Node
                      </label>
                      <label class="btn btn-light">
                        <input type="radio" name="options-${file.name}" data-type="matrix" autocomplete="off">Matrix
                      </label>
                      <label class="btn btn-light${isFasta ? ' active' : ''}">
                        <input type="radio" name="options-${file.name}" data-type="fasta" autocomplete="off"${isFasta ? ' checked' : ''}>FASTA
                      </label>
                      <label class="btn btn-light${isNewick ? ' active' : ''}">
                        <input type="radio" name="options-${file.name}" data-type="newick" autocomplete="off"${isNewick ? ' checked' : ''}>Newick
                      </label>
                      <label class="btn btn-light${isAuspice ? ' active' : ''}">
                        <input type="radio" name="options-${file.name}" data-type="auspice" autocomplete="off"${isAuspice ? ' checked' : ''}>Auspice
                      </label>
                    </div>`).appendTo(fnamerow);

      fnamerow.appendTo(root);
      const optionsrow = $('<div class="row w-100"></div>');
      const options = '<option>None</option>' + headers.map(h => `<option value="${h}">${parentContext.commonService.titleize(h)}</option>`).join('\n');
      optionsrow.append(`
                  <div class='col-4 '${isFasta || isNewick ? ' style="display: none;"' : ''} data-file='${file.name}'>
                    <label for="file-${file.name}-field-1">${isNode ? 'ID' : 'Source'}</label>
                    <select id="file-${file.name}-field-1" class="form-control form-control-sm">${options}</select>
                  </div>
                  <div class='col-4 '${isFasta || isNewick ? ' style="display: none;"' : ''} data-file='${file.name}'>
                    <label for="file-${file.name}-field-2">${isNode ? 'Sequence' : 'Target'}</label>
                    <select id="file-${file.name}-field-2" class="form-control form-control-sm">${options}</select>
                  </div>
                  <div class='col-4 '${isFasta || isNewick ? ' style="display: none;"' : ''} data-file='${file.name}'>
                    <label for="file-${file.name}-field-3">Distance</label>
                    <select id="file-${file.name}-field-3" class="form-control form-control-sm">${options}</select>
                  </div>`);

      optionsrow.appendTo(root);

      function matchHeaders(type) {

        const these = $(`[data-file='${file.name}'] select`);
        const a = type === 'node' ? ['ID', 'Id', 'id'] : ['SOURCE', 'Source', 'source'],
          b = type === 'node' ? ['SEQUENCE', 'SEQ', 'Sequence', 'sequence', 'seq'] : ['TARGET', 'Target', 'target'],
          c = ['length', 'Length', 'distance', 'Distance', 'snps', 'SNPs', 'tn93', 'TN93'];
        [a, b, c].forEach((list, i) => {
          $(these.get(i)).val("None");
          list.forEach(title => {
            if (parentContext.commonService.includes(headers, title)) $(these.get(i)).val(title);
          });
          if ($(these.get(i)).val() === 'None' &&
            !(i === 1 && type === 'node') && //If Node Sequence...
            !(i === 2 && type === 'link')) { //...or Link distance...
            //...don't match to a variable in the dataset, leave them as "None".
            $(these.get(i)).val(headers[i]);
            //Everything else, just guess the next ordinal column.
          }
        });
      }

      root.appendTo('#file-table');
      matchHeaders($(`[name="options-${file.name}"]:checked`).data('type'));

      function refit(e: any = null) {
        const type = $(e ? e.target : `[name="options-${file.name}"]:checked`).data('type'),
          these = $(`[data-file='${file.name}']`),
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

        $('#launch').prop('disabled', false).focus();
      };

      const fileTable = document.getElementById('file-table');
      const selectElements = fileTable.querySelectorAll('select');

      for (let i = 0; i < selectElements.length; i++) {
        selectElements[i].addEventListener('change', (event) => {
          // Handle change event here
          parentContext.updateMetadata(file);
        });
      }

      console.log('addTableTile end: ', headers);


      $(`[name="options-${file.name}"]`).on("change", refit);
      refit();
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
    $('#file-panel .file-table-row').each((i, el) => {
      const $el = $(el);
      const fname = $el.data('filename');
      const selects = $el.find('select');
      const f = this.commonService.session.files.find(file => file.name === fname);
      console.log(f);
      if (f) {
        f.format = $el.find('input[type="radio"]:checked').data('type');
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
    const nodeFilesWithSeqs = this.commonService.session.files.filter(f => f.format === "node" && f.field2 != "None" && f.field2 != "");
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
        const workbook = XLSX.read(file.contents, { type: 'array' });
        const dataJSON = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
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
    this.SelectedDefaultDistanceThresholdVariable = parseFloat(newValue);
    this.store.setLinkThreshold(parseFloat(newValue));
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

  generateSequences() {
    $('#file-prompt').remove();
    $('#launch').prop('disabled', false).focus();
    this.processFile(new File([Papa.unparse(this.commonService.generateSeqs('gen-' + this.commonService.session.meta.readyTime + '-', this.SelectedGenerateNumberVariable, 20))], 'generatedNodes.csv'));
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
      this.SelectedDefaultViewVariable = this.commonService.session.style.widgets['default-view'];
    }
  }
}

export namespace FilesComponent {
  export const componentTypeName = 'Files';
}
