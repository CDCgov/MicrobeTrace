import { Injector, Component, Output, EventEmitter, OnInit,
  ViewChild, ViewContainerRef, ElementRef, ChangeDetectorRef, Inject } from '@angular/core';
import { EventManager } from '@angular/platform-browser';
import { CommonService } from '@app/contactTraceCommonServices/common.service';
import { SelectItem } from 'primeng/api';
import { DialogSettings } from '@app/helperClasses/dialogSettings';
import * as _ from 'lodash';
import * as saveAs from 'file-saver';
import * as domToImage from 'html-to-image';
import { CustomShapes } from '@app/helperClasses/customShapes';
import { BaseComponentDirective } from '@app/base-component.directive';
import { ComponentContainer } from 'golden-layout';
import { GanttChartService } from './gantt-chart/gantt-chart.service';
import { GoogleTagManagerService } from 'angular-google-tag-manager';
import { MicrobeTraceNextVisuals } from '../../microbe-trace-next-plugin-visuals';
import { cloneDeep } from 'lodash';
import { ExportService } from '@app/contactTraceCommonServices/export.service';


@Component({
    selector: 'GanttComponent',
    templateUrl: './gantt-plugin.component.html',
    styleUrls: ['./gantt-plugin.component.scss'],
    standalone: false
})
export class GanttComponent extends BaseComponentDirective implements OnInit {
  @ViewChild('ganttContainer', {read: ViewContainerRef}) ganttContainer: ViewContainerRef;
  @Output() DisplayGlobalSettingsDialogEvent = new EventEmitter();
  viewActive: boolean = true;
  svgStyle: object = {
    height: '0px',
    width: '1000px'
  };

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
  SelectedGanttChartImageFilenameVariable = "default_gantt_chart";

  // ganttChartData: Object[] = [];

  NetworkExportFileTypeList: any = [
    { label: 'png', value: 'png' },
    { label: 'jpeg', value: 'jpeg' },
    { label: 'svg', value: 'svg' }
  ];

  SelectedNetworkExportFileTypeListVariable = 'png';
  GanttSettingsDialogSettings: DialogSettings = new DialogSettings('#gantt-settings-pane', false);
  isExportClosed: boolean;

  constructor(injector: Injector,
              private eventManager: EventManager,
              public commonService: CommonService,
              @Inject(BaseComponentDirective.GoldenLayoutContainerInjectionToken) private container: ComponentContainer,
              @Inject(ViewContainerRef) ViewContainerRef, 
              elRef: ElementRef,
              ganttChartService: GanttChartService,
              private cdref: ChangeDetectorRef,
              private gtmService: GoogleTagManagerService,
              private exportService: ExportService) {

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

    this.visuals.microbeTrace.GlobalSettingsNodeColorDialogSettings.setVisibility(false);
    this.visuals.microbeTrace.GlobalSettingsLinkColorDialogSettings.setVisibility(false);
    

    // this.createGanttEntry();
    this.ganttChartData = [this.makeBlankEntry()];
    this.openSettings();
    
    // this.ganttChartData = [this.makeGanttEntry("_blank", "Ipstart", "Ipend", "#2ca02c")];
    this.goldenLayoutComponentResize();

    this.container.on('resize', () => { this.goldenLayoutComponentResize() })
    this.container.on('hide', () => { 
      this.viewActive = false; 
      this.cdref.detectChanges();
    })
    this.container.on('show', () => { 
      this.viewActive = true; 
      this.cdref.detectChanges();
      this.visuals.microbeTrace.GlobalSettingsNodeColorDialogSettings.setVisibility(false);
      this.visuals.microbeTrace.GlobalSettingsLinkColorDialogSettings.setVisibility(false);
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
    $('#gantt-plugin').height($('ganttcomponent').height()-19);
    $('#gantt-plugin').width($('ganttcomponent').width()-1)
  }

  makeGanttEntry(dateName: string, startVariable: string, endVariable: string, entryColor: string): object {
    const timeline = {};

    this.nodeIds.forEach( (element: string) => {
      const nodeData = this.visuals.gantt.commonService.session.data.nodes.filter(x => x._id == element)
      const hasTimeZone: RegExp = /GMT.\d{4}/;
      const startDate = hasTimeZone.exec(nodeData[0][startVariable])? nodeData[0][startVariable].substring(4,15) : nodeData[0][startVariable];
      const endDate = hasTimeZone.exec(nodeData[0][endVariable])? nodeData[0][endVariable].substring(4,15) : nodeData[0][endVariable];
      const regExp: RegExp = /^.*$/;
      if (startDate && endDate && regExp.exec(startDate) && regExp.exec(endDate)) {
        const entry = [{ from: startDate, to: endDate, info: dateName }]
        timeline[element] = entry;
      }
    })

    const ganttEntry = {name: dateName, color: entryColor, opacity: this.ganttChartService.ganttOpacity, timelines: timeline};
    return ganttEntry;
  }

  createGanttEntry(): void {
    if (!this.GanttEndVariable) {
      this.GanttEndVariable = this.GanttStartVariable;
    }
    if (this.ganttEntries.length === 0) { //} || this.ganttChartData.length === 1 && this.ganttChartData[0]["name"] === "_blank"){
      const newEntry = this.makeGanttEntry(this.GanttEntryName, this.GanttStartVariable, this.GanttEndVariable, this.GanttEntryColor);
      this.ganttEntries = [{entryName: this.GanttEntryName, startDate: this.GanttStartVariable, endDate: this.GanttEndVariable, color: this.GanttEntryColor}]
      this.ganttChartData = [newEntry];

    }
    else {
      const newEntry = this.makeGanttEntry(this.GanttEntryName, this.GanttStartVariable, this.GanttEndVariable, this.GanttEntryColor);
      this.ganttEntries.push({entryName: this.GanttEntryName, startDate: this.GanttStartVariable, endDate: this.GanttEndVariable, color: this.GanttEntryColor});
      const existingData = cloneDeep(this.ganttChartData);
      existingData.push(newEntry);
      this.ganttChartData = existingData;
    }
    this.cdref.markForCheck();
    this.resetEntryForm();
    this.visuals.gantt.GanttSettingsDialogSettings.setVisibility(false);

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
  }

  updateEntryColor(entryName: string, event: Event): void {
    const color = (event.target as HTMLInputElement).value;
    const startingData = cloneDeep(this.ganttChartData);
    for (let i=0; i<startingData.length; i++){
      if (startingData[i]["name"] === entryName){
        startingData[i]["color"] = color;
      }
    }
    this.ganttChartData = startingData;

  }

  getNodeIds(): string[] {
    const idSet: string[] = this.visuals.gantt.commonService.session.data.nodes.map(x=>x._id);
    return idSet;
  }

  listGanttEntries(): object[] {
    return this.ganttEntries;
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
      });
    } else if (exportImageType === 'jpeg') {
        domToImage.toJpeg(content, { quality: 0.85 }).then(
          dataUrl => {
            saveAs(dataUrl, fileName);
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
    }

  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace GanttComponent {
    export const componentTypeName = 'Gantt Chart';
}
