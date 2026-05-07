import { Injector, Component, Output, EventEmitter, OnInit, AfterViewInit,
  ViewChild, ViewContainerRef, ElementRef, ChangeDetectorRef, Inject } from '@angular/core';
import { EventManager } from '@angular/platform-browser';
import { CommonService } from '@app/contactTraceCommonServices/common.service';
import { SelectItem } from 'primeng/api';
import { DialogSettings } from '@app/helperClasses/dialogSettings';
import * as _ from 'lodash';
import { saveAs } from 'file-saver';
import * as domToImage from 'html-to-image';
import { CustomShapes } from '@app/helperClasses/customShapes';
import { BaseComponentDirective } from '@app/base-component.directive';
import { ComponentContainer } from 'golden-layout';
import { GanttChartService } from './gantt-chart/gantt-chart.service';
import { GanttChartComponent } from './gantt-chart/gantt-chart.component';
import { GoogleTagManagerService } from 'angular-google-tag-manager';
import { MicrobeTraceNextVisuals } from '../../microbe-trace-next-plugin-visuals';
import { cloneDeep } from 'lodash';
import { ExportService } from '@app/contactTraceCommonServices/export.service';
import { CommonStoreService } from '@app/contactTraceCommonServices/common-store.services';


@Component({
    selector: 'GanttComponent',
    templateUrl: './gantt-plugin.component.html',
    styleUrls: ['./gantt-plugin.component.scss'],
    standalone: false
})
export class GanttComponent extends BaseComponentDirective implements OnInit, AfterViewInit {
  @ViewChild('ganttContainer', {read: ViewContainerRef}) ganttContainer: ViewContainerRef;
  @Output() DisplayGlobalSettingsDialogEvent = new EventEmitter();
  viewActive: boolean = true;
  svgStyle: object = {
    height: '0px',
    width: '1000px'
  };

  @ViewChild('ganttChart') ganttChartElement: GanttChartComponent
  ganttChartData: object[];

  private customShapes: CustomShapes = new CustomShapes();

  ShowNetworkAttributes = false;
  ShowStatistics = false;
  ShowGanttExportPane = false;
  ShowGanttSettingsPane = false;
  IsDataAvailable = true;
  svg: any = null;
  settings: object = this.commonService.session.style.widgets;
  visuals: MicrobeTraceNextVisuals;
  nodeIds: string[] = [];
  FieldList: SelectItem[] = [];
  ganttChartService: GanttChartService;
  GanttEntryName: string = "";
  GanttStartVariable: string = "";
  GanttEndVariable: string = "";
  GanttEntryColor: string = "#000000";
  ganttEntries: object[] = [];
  ganttEntryCount = 0;
  SelectedGanttChartImageFilenameVariable = "default_gantt_chart";

  // ganttChartData: Object[] = [];

  NetworkExportFileTypeList: any = [
    { label: 'png', value: 'png' },
    { label: 'jpeg', value: 'jpeg' },
    { label: 'svg', value: 'svg' }
  ];

  ShowHideOptions: any = [
    { label: 'Show', value: true },
    { label: 'Hide', value: false }
  ];
  showGrid: boolean = true;
  gridWidthY = 20;
  gridWidthX = 120;
  ganttViewWidth = 0;
  currentOpacity = 0.9
  fontSize = 14;
  private readonly ganttChartStartX = 150;
  private readonly autoGridColumnCount = 8;
  private readonly minGridWidthX = 20;
  private readonly maxGridWidthX = 200;
  private readonly gridWidthXStep = 10;
  private gridWidthXManuallyChanged = false;

  SelectedNetworkExportFileTypeListVariable = 'png';
  GanttSettingsDialogSettings: DialogSettings = new DialogSettings('#gantt-settings-pane', false);
  isExportClosed: boolean;

  private markGanttRendered(): void {
    if (this.nodeIds.length === 0) return;

    // Gantt can be the first rendered view on launch, so it must release the
    // shared processing modal without waiting for the 2D network render path.
    setTimeout(() => {
      this.store.setNetworkRendered(true);
    });
  }

  constructor(injector: Injector,
              private eventManager: EventManager,
              public commonService: CommonService,
              @Inject(BaseComponentDirective.GoldenLayoutContainerInjectionToken) private container: ComponentContainer,
              @Inject(ViewContainerRef) ViewContainerRef, 
              elRef: ElementRef,
              ganttChartService: GanttChartService,
              private cdref: ChangeDetectorRef,
              private gtmService: GoogleTagManagerService,
              private exportService: ExportService,
              private store: CommonStoreService) {

    super(elRef.nativeElement);

    this.visuals = commonService.visuals;
    this.commonService.visuals.gantt = this;
    this.ganttChartService = ganttChartService;
  }

  dataAvail(): boolean {
    if (!this.ganttChartData || this.ganttChartData.length === 1 && this.ganttChartData[0]["name"] === "_blank"){
      return false;
    }
    return true;
  }

  openSettings(): void {
    this.visuals.gantt.GanttSettingsDialogSettings.setVisibility(true);
  }
  openExport(): void {
    this.ShowGanttExportPane = true;

    this.visuals.microbeTrace.GlobalSettingsDialogSettings.setStateBeforeExport();
    //this.visuals.microbeTrace.GlobalSettingsLinkColorDialogSettings.setStateBeforeExport();
    //this.visuals.microbeTrace.GlobalSettingsNodeColorDialogSettings.setStateBeforeExport();
    this.isExportClosed = false;
  }

  ngOnInit(): void {

    this.gtmService.pushTag({
            event: "page_view",
            page_location: "/gantt",
            page_title: "Gantt Chart View"
        });

    this.nodeIds = this.getNodeIds();
    this.visuals.gantt.FieldList.push(
      {
        label: "None",
        value: "",
      }
    )

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    this.commonService.session.data['nodeFields'].map((d, i) => {

      this.visuals.gantt.FieldList.push(
        {
          label: this.visuals.gantt.commonService.capitalize(d.replace('_', '')),
          value: d
        });
    });

    // this.createGanttEntry();
    this.ganttChartData = [];
    this.openSettings();
    this.markGanttRendered();
    
    // this.ganttChartData = [this.makeGanttEntry("_blank", "Ipstart", "Ipend", "#2ca02c")];
    this.goldenLayoutComponentResize();

    this.container.on('resize', () => {
      this.goldenLayoutComponentResize();
      this.cdref.detectChanges();
    })
    this.container.on('hide', () => { 
      this.viewActive = false; 
      this.cdref.detectChanges();
    })
    this.container.on('show', () => { 
      this.viewActive = true; 
      this.cdref.detectChanges();
    })
  }

  makeBlankEntry(): object {
    const timelineEntry = [{from:"2000/01/01", to: "2024/12/31"}];
    const timelines = {};
    this.nodeIds.forEach( (element: string) => {
      timelines[element] = timelineEntry;
    });
    const blankEntry = {name: "_blank", color: "#ffffff", timelines: timelines};
    return blankEntry;

    // return this.makeGanttEntry("_blank", "ipstart", "ipend", "#2ca02c");
  }
  goldenLayoutComponentResize() {
    $('.gantt-plugin').height($('ganttcomponent').height()-19);
    $('.gantt-plugin').width($('ganttcomponent').width()-1)
    this.ganttViewWidth = this.getGanttViewWidth();
    this.applyAutoGridWidthX();
  }

  private getGanttViewWidth(): number {
    const ganttElement = this.rootHtmlElement.querySelector('.gantt-plugin') as HTMLElement | null;
    const widthCandidates = [
      ganttElement?.getBoundingClientRect().width,
      this.rootHtmlElement.getBoundingClientRect().width,
      $('ganttcomponent').width() as number | undefined
    ];

    return widthCandidates.find(
      (width): width is number => typeof width === 'number' && Number.isFinite(width) && width > 0
    ) || 0;
  }

  private calculateAutoGridWidthX(): number | null {
    const viewWidth = this.getGanttViewWidth();
    if (!viewWidth) {
      return null;
    }

    const steppedWidth =
      (Math.floor((viewWidth - this.ganttChartStartX) / this.autoGridColumnCount / this.gridWidthXStep) - 1)
      * this.gridWidthXStep;
    return Math.min(this.maxGridWidthX, Math.max(this.minGridWidthX, steppedWidth));
  }

  private applyAutoGridWidthX(): void {
    if (this.gridWidthXManuallyChanged) {
      return;
    }

    const autoGridWidthX = this.calculateAutoGridWidthX();
    if (autoGridWidthX == null || autoGridWidthX === this.gridWidthX) {
      return;
    }

    this.gridWidthX = autoGridWidthX;
    this.ganttChartElement?.updateGridWidthX(this.gridWidthX);
  }

  private getRawGanttFieldValue(nodeData: any, field: string): string | null {
    const rawDateValues = nodeData?._rawDateValues;
    const rawValue = rawDateValues && Object.prototype.hasOwnProperty.call(rawDateValues, field)
      ? rawDateValues[field]
      : nodeData?.[field];

    if (rawValue == null) {
      return null;
    }

    const normalizedValue = String(rawValue).trim();
    return normalizedValue.length > 0 && normalizedValue !== 'null' ? normalizedValue : null;
  }

  private normalizeGanttDateValue(dateValue: string | null): string | null {
    if (!dateValue) {
      return null;
    }

    const hasTimeZone: RegExp = /GMT.\d{4}/;
    return hasTimeZone.test(dateValue) ? dateValue.substring(4, 15) : dateValue;
  }

  makeGanttEntry(dateName: string, startVariable: string, endVariable: string, entryColor: string): object {
    const timeline = {};

    this.nodeIds.forEach( (element: string) => {
      timeline[element] = [];
      const nodeData = this.visuals.gantt.commonService.session.data.nodes.filter(x => x._id == element)
      if (!nodeData.length) {
        return;
      }

      const hasTimeZone: RegExp = /GMT.\d{4}/;
      const startDate = hasTimeZone.exec(nodeData[0][startVariable])? nodeData[0][startVariable].substring(4,15) : nodeData[0][startVariable];
      const endDate = hasTimeZone.exec(nodeData[0][endVariable])? nodeData[0][endVariable].substring(4,15) : nodeData[0][endVariable];
      if (
        this.commonService.hasValidTimelineDateValue(startDate) &&
        this.commonService.hasValidTimelineDateValue(endDate)
      ) {
        timeline[element].push({ from: startDate, to: endDate, info: dateName });
      }
    })

    const ganttEntry = {name: dateName, color: entryColor, opacity: this.currentOpacity, timelines: timeline};
    return ganttEntry;
  }

  canCreateGanttEntry(): boolean {
    return Boolean(this.GanttStartVariable);
  }

  createGanttEntry(): void {
    if (!this.canCreateGanttEntry()) {
      return;
    }

    if (!this.GanttEntryName) this.GanttEntryName = `Entry ${this.ganttEntryCount + 1}`
    this.ganttEntryCount += 1;
    if (!this.GanttEndVariable) {
      this.GanttEndVariable = this.GanttStartVariable;
    }
    if (this.ganttEntries.length === 0) { //} || this.ganttChartData.length === 1 && this.ganttChartData[0]["name"] === "_blank"){
      const newEntry = this.makeGanttEntry(this.GanttEntryName, this.GanttStartVariable, this.GanttEndVariable, this.GanttEntryColor);
      this.ganttEntries = [{entryName: this.GanttEntryName, startDate: this.GanttStartVariable, endDate: this.GanttEndVariable, color: this.GanttEntryColor, opacity: this.currentOpacity}]
      this.ganttChartData = [newEntry];

    }
    else {
      const newEntry = this.makeGanttEntry(this.GanttEntryName, this.GanttStartVariable, this.GanttEndVariable, this.GanttEntryColor);
      this.ganttEntries.push({entryName: this.GanttEntryName, startDate: this.GanttStartVariable, endDate: this.GanttEndVariable, color: this.GanttEntryColor, opacity: this.currentOpacity});
      const existingData = cloneDeep(this.ganttChartData);
      existingData.push(newEntry);
      this.ganttChartData = existingData;
    }
    this.cdref.markForCheck();
    this.resetEntryForm();
    this.visuals.gantt.GanttSettingsDialogSettings.setVisibility(false);

  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.goldenLayoutComponentResize();
      this.cdref.detectChanges();
    });
  }

  removeGanttEntry(entryName): void {
    const startingEntries = cloneDeep(this.ganttChartData);
    const endingEntries = startingEntries.filter(x => x["name"] !== entryName)
    this.ganttEntries = this.ganttEntries.filter(x => x["entryName"] !== entryName);
    this.ganttChartData = endingEntries;
  }

  resetEntryForm(): void {
    this.GanttEntryName = "";
    this.GanttEntryColor = "#000000";
    this.GanttEndVariable = "";
    this.GanttStartVariable = "";
    this.currentOpacity = 0.9;
  }

  updateEntryColor(entryName: string, event: Event): void {
    const color = (event.target as HTMLInputElement).value;
    const startingData = cloneDeep(this.ganttChartData);
    const updatedEntries = cloneDeep(this.ganttEntries);
    for (let i=0; i<startingData.length; i++){
      if (startingData[i]["name"] === entryName){
        startingData[i]["color"] = color;
      }
    }
    for (let i=0; i<updatedEntries.length; i++){
      if (updatedEntries[i]["entryName"] === entryName){
        updatedEntries[i]["color"] = color;
      }
    }
    this.ganttEntries = updatedEntries;
    this.ganttChartData = startingData;
    this.cdref.detectChanges();
  }

  openOpacityBar(e, entryName = '') {
    let startingOpacity;
    if (entryName) {
      startingOpacity = this.ganttChartData.find(entry => entry["name"] === entryName)["opacity"]
    } else {
      startingOpacity = this.currentOpacity;
    }

    let removeTransparencyWrapper = setTimeout(() => {
      $("#color-transparency-wrapper").fadeOut();
    }, 7000)

    $("#color-transparency-wrapper").css({
      top: e.clientY + 129,
      left: e.clientX,
      display: "block",
      zIndex: 99999
    });

    $("#color-transparency")
      .off("change")
      .val(startingOpacity)
      .one("change", (f) => {
        this.currentOpacity = Number(f.target['value'])
        
        if (entryName) {
          const startingData = cloneDeep(this.ganttChartData);
          for (let i=0; i<startingData.length; i++){
            if (startingData[i]["name"] === entryName){
              startingData[i]["opacity"] = this.currentOpacity;
            }
          }
          this.ganttChartData = startingData;
          let entry = this.ganttEntries.find(entry => entry['entryName'] == entryName)
          entry["opacity"] = this.currentOpacity;
          this.currentOpacity = 0.9;
          this.ganttChartElement.ngOnChanges();
        }

        this.cdref.detectChanges();
        clearTimeout(removeTransparencyWrapper)
        $("#color-transparency-wrapper").fadeOut();
    });
  }

  updateEntryOpacity(entryName: string, event: Event): void {
    const opacity = (event.target as HTMLInputElement).value;
    const startingData = cloneDeep(this.ganttChartData);
    for (let i=0; i<startingData.length; i++){
      if (startingData[i]["name"] === entryName){
        startingData[i]["opacity"] = opacity;
      }
    }
    this.ganttChartData = startingData;
  }

  changeShowGrid() {
    this.ganttChartElement.showGrid(this.showGrid);
  }

  changeGridWidthY() {
    this.ganttChartElement.updateGridWidthY(this.gridWidthY)
  }

  changeGridWidthX() {
    this.gridWidthXManuallyChanged = true;
    this.ganttChartElement.updateGridWidthX(this.gridWidthX)
  }

  reduceHeight() {
    this.ganttChartService.height = this.ganttChartService.height - 50;
  }

  changeFontSize() {
    this.ganttChartElement.updateFontSize(this.fontSize);
  }

  getNodeIds(): string[] {
    const idSet: string[] = this.visuals.gantt.commonService.session.data.nodes.map(x=>x._id);
    return idSet;
  }

  listGanttEntries(): object[] {
    return this.ganttEntries;
  }

  private closeExportPane(): void {
    this.ShowGanttExportPane = false;
    this.isExportClosed = true;
    this.cdref.detectChanges();
  }

  onCloseExport() {
    this.isExportClosed = true;
  }

  saveImage(event): void {
    const fileName = this.SelectedGanttChartImageFilenameVariable;
    const domId = 'gantt';
    const exportImageType = this.SelectedNetworkExportFileTypeListVariable ;
    const content = document.getElementById(domId);
    if (exportImageType === 'png') {
      domToImage.toPng(content).then(
        dataUrl => {
          saveAs(dataUrl, fileName);
          this.closeExportPane();
      });
    } else if (exportImageType === 'jpeg') {
        domToImage.toJpeg(content, { quality: 0.85 }).then(
          dataUrl => {
            saveAs(dataUrl, fileName);
            this.closeExportPane();
          });
    } else if (exportImageType === 'svg') {
        // The tooltips were being displayed as black bars, so I add a rule to hide them.
        // Have to parse the string into a document, get the right element, add the rule, and reserialize it
        let svgContent = this.exportService.unparseSVG(content);
        const parser = new DOMParser();
        const deserialized = parser.parseFromString(svgContent, 'text/xml')
        console.log(deserialized);
        const style = deserialized.getElementsByTagName('style');
        console.log(style);
        style[0].innerHTML = ".tooltip { display: none !important; } .small { font-size: 80%; font-family: Roboto, 'Helvetica Neue', sans-serif; }";
        const serializer = new XMLSerializer();
        svgContent = serializer.serializeToString(deserialized);
        const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
        saveAs(blob, fileName);
        this.closeExportPane();
    }

  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace GanttComponent {
    export const componentTypeName = 'Gantt Chart';
}
