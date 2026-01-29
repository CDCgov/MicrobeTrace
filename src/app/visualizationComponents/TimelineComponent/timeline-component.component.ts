import { Component, ElementRef, EventEmitter, ChangeDetectorRef, Inject, OnInit, Output, ViewChild, OnDestroy } from '@angular/core';
import { CommonService } from '../../contactTraceCommonServices/common.service';
import { BaseComponentDirective } from '@app/base-component.directive';
import { MicobeTraceNextPluginEvents } from '@app/helperClasses/interfaces';
import { ComponentContainer } from 'golden-layout';
import * as d3 from 'd3';
import moment from 'moment';
import { MicrobeTraceNextVisuals } from '@app/microbe-trace-next-plugin-visuals';

import { saveAs } from 'file-saver';
import { saveSvgAsPng } from 'save-svg-as-png';
import { SelectItem } from 'primeng/api';
import { GoogleTagManagerService } from 'angular-google-tag-manager';
import { ExportService } from '@app/contactTraceCommonServices/export.service';
import { Subject, takeUntil } from 'rxjs';
import { CommonStoreService } from '@app/contactTraceCommonServices/common-store.services';

@Component({
    selector: 'app-timeline-component',
    templateUrl: './timeline-component.component.html',
    styleUrls: ['./timeline-component.component.scss'],
    standalone: false
})
export class TimelineComponent extends BaseComponentDirective implements OnInit, MicobeTraceNextPluginEvents, OnDestroy {

  @Output() DisplayGlobalSettingsDialogEvent = new EventEmitter();
  private destroy$ = new Subject<void>();
  @ViewChild('epiCurve') epiCurveElement: ElementRef;
  @ViewChild('epiCurveSVG') epiCurveSVGElement: ElementRef;
  viewActive: boolean = true;

  widgets: object;
  private visuals: MicrobeTraceNextVisuals;

  FieldList: SelectItem[] = [];
  FieldListStack: SelectItem[] = [];
  SelectedDateFieldVariable;
  SelectedDateFieldVariable2;
  SelectedDateFieldVariable3;
  binSizes = ['Day', 'Week', 'Month', 'Quarter', 'Year']
  tickInterval;

  graphTypes = ['Single Date Field', 'Multi: Side by Side', 'Multi: Overlay']
  selectedGraphType = 'Single Date Field';
  legendPositionOptions = ['Hide', 'Left', 'Right', 'Bottom']

  ShowEpiSettingsPane: boolean = false;
  ShowEpiExportPane: boolean = false;
  EpiExportFileName: string = "";
  EpiExportFileType: string = "png";
  SelectedNetworkExportScaleVariable: any = 1;
  SelectedNetworkExportQualityVariable: any = 0.92;
  CalculatedResolution: string;

  private localColorMap = (x) => {}

  private svg;
  private margin = { top: 5, left: 45, right: 20, bottom: 50 };
  private width; // Default width, adjust as necessary
  private height; // Default height, adjust as necessary
  private middle;
  private x;
  private y;
  private histogram;
  private brush;
  private brushG;
  private selection;
  private timer;
  private tick = 0;
  private isPlaying = false;

  private vnodes = []; // Replace with your actual data
  private timeDomainStart;
  private timeDomainEnd;

  constructor(
    private commonService: CommonService,
    @Inject(BaseComponentDirective.GoldenLayoutContainerInjectionToken) private container: ComponentContainer,
    elRef: ElementRef,
    private cdref: ChangeDetectorRef,
    private gtmService: GoogleTagManagerService,
    private store: CommonStoreService,
    private exportService: ExportService) {

      super(elRef.nativeElement);
      this.visuals = commonService.visuals;
      this.commonService.visuals.epiCurve = this;
      this.widgets = this.commonService.session.style.widgets;

      this.setDefaultsWidgets();

  }
  ngOnInit() {

    this.gtmService.pushTag({
            event: "page_view",
            page_location: "/timeline",
            page_title: "Timeline View"
        });
    // populate this.twoD.FieldList with [None, ...nodeFields]
    this.visuals.epiCurve.FieldList = [];
    this.visuals.epiCurve.FieldListStack = [];
    this.visuals.epiCurve.FieldList.push({ label: "None", value: "None" });
    this.visuals.epiCurve.FieldListStack.push({ label: "None", value: 'None'}, { label: "Node Color", value: "Node Color"});
    this.visuals.epiCurve.commonService.session.data['nodeFields'].map((d, i) => {
        if (d != 'seq' && d != 'sequence') {
            this.visuals.epiCurve.FieldList.push(
                {
                    label: this.visuals.epiCurve.commonService.capitalize(d.replace("_", "")),
                    value: d
                });
              this.visuals.epiCurve.FieldListStack.push(
                {
                    label: this.visuals.epiCurve.commonService.capitalize(d.replace("_", "")),
                    value: d
                });
        }

    });

    this.tickInterval = 1;
    this.updateSettingsRows();    

    this.store.clusterUpdate$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      if (this.selectedGraphType == "Single Date Field" && (this.widgets['epiCurve-stackColorBy'] == 'cluster' || (this.widgets['epiCurve-stackColorBy'] == 'Node Color' && this.widgets['node-color-variable'] == 'cluster'))) {
        this.refresh();
      }
    })
 }
  
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  setDefaultsWidgets() {
    // graphType
    if (this.widgets['epiCurve-graphType'] == undefined) {
      this.widgets['epiCurve-graphType'] = 'Single Date Field';
    }
    this.selectedGraphType = this.widgets['epiCurve-graphType'];

    // date fields
    if (this.widgets['epiCurve-date-fields'] == undefined) {
      if (this.widgets['epi-timeline-date-field'] != undefined) {
        this.widgets['epiCurve-date-fields'] = [this.widgets['epi-timeline-date-field'], 'None', 'None']
      } else {
        this.widgets['epiCurve-date-fields'] = ['None', 'None', 'None']
      }
    } else if (this.widgets['epiCurve-date-fields'].length < 3) {
      while (this.widgets['epiCurve-date-fields']< 3) {
        this.widgets['epiCurve-date-fields'].push('None')
      }
    }
    this.SelectedDateFieldVariable = this.widgets['epiCurve-date-fields'][0];
    this.SelectedDateFieldVariable2 = this.widgets['epiCurve-date-fields'][1];
    this.SelectedDateFieldVariable3 = this.widgets['epiCurve-date-fields'][2];

    // colors
    if (this.widgets['epiCurve-colors'] == undefined) {
      this.widgets['epiCurve-colors'] = ['#f5d742', '#f20fff', '#20ff1a'];
    }

    // stackColorBy field
    if (this.widgets['epiCurve-stackColorBy'] == undefined) {
      this.widgets['epiCurve-stackColorBy'] = 'None';
    }

    // binSize
    if (this.widgets['epiCurve-binSize'] == undefined) {
      this.widgets['epiCurve-binSize'] = 'Month'
    }

    //
    if (this.widgets['epiCurve-cumulative'] == undefined) {
      this.widgets['epiCurve-cumulative'] = false;
    }

    // legendPosition
    if (this.widgets['epiCurve-legendPosition'] == undefined) {
      this.widgets['epiCurve-legendPosition'] = 'Left';
    }
 }

 ngAfterViewInit() {

  // this.initializeD3Chart();
  this.setupEventListeners();

  if (this.widgets['epiCurve-legendPosition'] == 'Bottom') {
    this.margin.bottom = 100;
  } else {
    this.margin.bottom = 50;
  }
  
  this.refresh();
 }
  
/**
 * Clears previous histogram/epi curve and creates a new one; calls refreshMulti if needed
 */
public refresh(): void {
  if (this.selectedGraphType=='Multi: Overlay' || this.selectedGraphType=='Multi: Side by Side') {
    this.refreshMulti();
    return;
  } else if (this.SelectedDateFieldVariable == 'None') {
    return;
  }

  $('#epiCurveSVG').empty()

  this.updateSizes();
  if (this.height < 0) {
    return;
  }

  const field = this.SelectedDateFieldVariable;
  let times = this.getTimes([field]);

  // updates this.timeDomainStart and this.timeDomainInterval and returns the bin interval
  let binInterval = this.calculateBinInterval(times);
  if (binInterval == 0) {
    return;
  }

  this.x = d3.scaleTime().domain([this.timeDomainStart, this.timeDomainEnd]).rangeRound([0, this.width]);
  this.y = d3.scaleLinear().range([this.height, 0]);

  //@ts-ignore
  this.histogram = d3.histogram().value(d => d[field as string]).domain(this.x.domain()).thresholds(binInterval);

  this.svg = d3.select(this.epiCurveSVGElement.nativeElement)
    .attr("width", this.width + this.margin.left + this.margin.right)
    .attr("height", this.height + this.margin.top + this.margin.bottom)
    //.attr("transform", `translate(0, ${this.margin.top})`);
    

  const epiCurve = this.svg.append("g")
    .classed("epiCurve-epi-curve", true)
    .attr("transform", `translate(${this.margin.left}, 5)`);

  let bins = this.histogram(this.vnodes);
  
  let colorVariable = this.commonService.session.style.widgets['node-color-variable'];
  let nodeColorKeys;
  if (colorVariable != 'None' && this.widgets['epiCurve-stackColorBy'] == 'Node Color') {
    nodeColorKeys = this.commonService.session.style.nodeColorsTableKeys[colorVariable].map(value => value=='null' ? null: value);
    this.localColorMap = this.commonService.temp.style.nodeColorMap;
  } else if (this.widgets['epiCurve-stackColorBy'] != 'None') {
    nodeColorKeys = this.updateLocalColorMap();
  }

  let maxCount = 0;
  [maxCount, bins] = this.updateBins(bins, this.widgets['epiCurve-stackColorBy'] == 'Node Color' ? colorVariable : this.widgets['epiCurve-stackColorBy'], nodeColorKeys);
  

  this.y.domain([0, maxCount]).nice()//d3.max(bins, d => d.length)]);

  if ((colorVariable != 'None' && this.widgets['epiCurve-stackColorBy'] == 'Node Color') || (this.widgets['epiCurve-stackColorBy'] != 'None' && this.widgets['epiCurve-stackColorBy'] != 'Node Color')) {
    let nodeColors = [];

    nodeColorKeys.forEach((value, ind) =>{
      epiCurve.selectAll(`rect${ind}`)
      .data(bins)
      .enter()
      .append("rect")
      .attr("transform", d => `translate(${this.x(d.x0)}, ${this.y(d.height[ind])})`)
      .attr("width", d => this.x(d.x1) - this.x(d.x0))
      .attr("height", d => this.height - this.y(d.length2[ind]))
      .attr("fill", this.localColorMap(value) )

      nodeColors.push(this.localColorMap(value));
    })
    this.generateLegend(epiCurve, nodeColors,nodeColorKeys)
  } else {
    let color = this.widgets['epiCurve-stackColorBy'] == 'None' ? this.widgets['epiCurve-colors'][0] : this.widgets["node-color"];
    epiCurve.selectAll("rect")
      .data(bins)
      .enter()
      .append("rect")
      .attr("transform", d => `translate(${this.x(d.x0)}, ${this.y(d.length)})`)
      .attr("width", d => this.x(d.x1) - this.x(d.x0))
      .attr("height", d => this.height - this.y(d.length))
      .attr("fill", color);

    this.generateLegend(epiCurve, [color] ,[this.SelectedDateFieldVariable])
  }

  this.updateAxes();
} 

/**
 * Updated version of refresh that works for multiple date fields to generate the epi curve graph
 * Calls refresh() instead if needed
 */
private refreshMulti(): void {
  if (this.selectedGraphType=='Single Date Field') {
    this.refresh();
    return;
  } else if (this.SelectedDateFieldVariable == 'None' && this.SelectedDateFieldVariable2 == 'None' && this.SelectedDateFieldVariable3 == 'None') {
    return;
  }

  $('#epiCurveSVG').empty()

  this.updateSizes();
  if (this.height < 0) {
    return;
  }

  let fields = [];
  let colors = [];
  [this.SelectedDateFieldVariable, this.SelectedDateFieldVariable2, this.SelectedDateFieldVariable3].forEach((dateField, ind) => {
    if (dateField != 'None') {
      fields.push(dateField);
      colors.push(this.widgets["epiCurve-colors"][ind])
    }
  })

  if (fields.length == 0) {
    return;
  }
  // current implementation of times is only used to calculate min and max time of all data given when setting up x axis and bins; there isn't a current need to link times by datapoint with times
  let times = this.getTimes(fields);

  // updates this.timeDomainStart and this.timeDomainInterval and returns the bin interval
  let binInterval = this.calculateBinInterval(times);
  if (binInterval == 0) {
    return;
  }

  this.x = d3.scaleTime().domain([this.timeDomainStart, this.timeDomainEnd]).rangeRound([0, this.width]);
  this.y = d3.scaleLinear().range([this.height, 0]);

  //@ts-ignore
  this.histogram = d3.histogram().domain(this.x.domain()).thresholds(binInterval);

  this.svg = d3.select(this.epiCurveSVGElement.nativeElement)
    .attr("width", this.width + this.margin.left + this.margin.right)
    .attr("height", this.height + this.margin.top + this.margin.bottom)
    .attr("transform", `translate(0, ${this.margin.top})`);
    

  const epiCurve = this.svg.append("g")
    .classed("epiCurve-epi-curve", true)
    .attr("transform", `translate(${this.margin.left}, 5)`);

  let maxCount = 0;
  let bins = [];
  fields.forEach((field) => {
    if (field != 'None') {
      let currentCount = 0;
      let currentbin = this.histogram(this.vnodes.map((d) => d[field]).filter(value => value != null));
      [currentCount, currentbin] = this.updateBins(currentbin);
      bins.push(currentbin)
      if (currentCount > maxCount) maxCount = currentCount;
    }
  })

  this.y.domain([0, maxCount]).nice();

  if (this.selectedGraphType == 'Multi: Overlay') {
    fields.forEach((_, ind) => {
        epiCurve.selectAll(`rect${ind}`)
        .data(bins[ind])
        .enter()
        .append("rect")
        .attr("transform", d => `translate(${this.x(d.x0)}, ${this.y(d.length)})`)
        .attr("width", d => this.x(d.x1) - this.x(d.x0))
        .attr("height", d => this.height - this.y(d.length))
        .attr("fill", colors[ind])
        .attr("opacity", 0.6);
    })

  } else {
    let numberOfBins = fields.length;
    let width;
    let xOffset = [];
    if (numberOfBins == 1) {
      width = (d) => this.x(d.x1)- this.x(d.x0);
      xOffset = [
        function(d, c) {return c.x(d.x0)}
      ]
    } else if (numberOfBins == 2) {
      width = (d) => (this.x(d.x1)- this.x(d.x0))/2
      xOffset = [
        function(d, c) {return c.x(d.x0)},
        function(d, c) {return c.x(d.x0)+(c.x(d.x1) - c.x(d.x0))/2}
      ]
    } else {
      width = (d) => (this.x(d.x1)- this.x(d.x0))/3;
      xOffset = [
        function(d, c) { return c.x(d.x0)},
        function(d, c) { return c.x(d.x0)+(c.x(d.x1) - c.x(d.x0))/3},
        function(d, c) { return c.x(d.x0)+2*(c.x(d.x1) - c.x(d.x0))/3}
      ]
    }
    
    let that = this;

    fields.forEach((_, ind) => {
        epiCurve.selectAll(`rect${ind}`)
        .data(bins[ind])
        .enter()
        .append("rect")
        .attr("transform", d => `translate(${xOffset[ind](d, that)}, ${this.y(d.length)})`)
        .attr("width", width)
        .attr("height", d => this.height - this.y(d.length))
        .attr("fill", colors[ind]);
    });
  }

  this.updateAxes();
  this.generateLegend(epiCurve, colors, fields)
} 

/**
 * Return an array of unique options for nodes[this.widgets['epiCurve-stackColorBy']] and then also used that information to update localColorMap function
 */
updateLocalColorMap() {
  let nodeColorTableKeys = [];
  this.commonService.session.data.nodes.forEach((node) => {
    if (!node.visible) return;
    if (!nodeColorTableKeys.some(value => value == node[this.widgets['epiCurve-stackColorBy']])) {
      nodeColorTableKeys.push(node[this.widgets['epiCurve-stackColorBy']])
    }
  })
  this.localColorMap = d3.scaleOrdinal(this.commonService.session.style.nodeColors).domain(nodeColorTableKeys);

  return nodeColorTableKeys;
}

updateSizes() {
  const wrapper = $(this.epiCurveElement.nativeElement).parent();
  $('#epiCurve').height(wrapper.height() - 50);
  this.width = wrapper.width() - this.margin.left - this.margin.right;
  // height represents the height of y axis
  this.height = wrapper.height() - this.margin.top - this.margin.bottom - 50;
  this.middle = this.height / 2;
}

getTimes(fields) {
  let times = [];
  this.vnodes = JSON.parse(JSON.stringify(this.commonService.session.data.nodes));
  this.vnodes.forEach(d => {
    fields.forEach(field => {
      const time = moment(d[field as string]); // Cast 'field' as string
      if (time.isValid()) {
        d[field as string] = time.toDate();
        times.push(d[field as string]); // Cast 'field' as string
      } else {
        d[field as string] = null; // Cast 'field' as string
      }
    })
  });

  if (times.length < 2) {
    times = [new Date(2000, 1, 1), new Date()];
  }
  return times;
}

updateAxes() {
  let [xAxis, xLabelOffset] = this.configureXAxisSettings();

  this.svg.append("g")
    .attr("class", "axis axis--x")
    .attr("transform", `translate(${this.margin.left}, ${this.height+5})`)
    .call(xAxis)
    .attr("text-anchor", "center")
    .selectAll("text")
    .attr("x", xLabelOffset);

  this.svg.append("g")
    .attr("class", "axis axis--y")
    .attr("transform", `translate(${this.margin.left}, 5)`)
    .call(d3.axisLeft(this.y))
    .attr("text-anchor", null)
    .selectAll("text")
    .attr("x", -20);

  this.svg.append("text")
    .attr("class", "x label")
    .attr("text-anchor", "center")
    .attr("x", this.width/2)
    .attr("y", this.height + 40)
    .text(`Date (${this.widgets['epiCurve-binSize']=='Day'? 'Dai': this.widgets['epiCurve-binSize']}ly Bins)`);

  this.svg.append("text")
    .attr("class", "y label")
    .attr("text-anchor", "center")
    .attr("y", 15)
    .attr("x", -this.middle-this.margin.top-this.margin.bottom)
    .attr("transform", "rotate(-90)")
    .text("Number of Cases");

  /*this.brush = d3.brushX()
    .extent([[0, 0], [this.width, this.height]])
    .on("start brush", () => {
      this.selection = d3.brushSelection(this.brushG.node());
      if (!this.selection) return;
      if (this.selection[0] > 0) {
        this.selection[0] = 0;
        this.brushG.call(this.brush.move, this.selection);
      }
    })
    .on("end", function () {
      this.selection = d3.brushSelection(this.brushG.node());
      if (!this.selection) return;
      if (this.selection[0] > 0) {
        this.selection[0] = 0;
        this.brushG.call(this.brush.move, this.selection);
        this.propagate();
      }
    });

    this.brushG = this.svg
    .append("g")
    .attr("class", "brush")
    .attr("transform", "translate(" + this.margin.left + ",0)")
    .call(this.brush);
    */

}

generateLegend(epiCurve, colors, fieldNames) {
  let xOffset = 50; // default for left position
  if (this.widgets['epiCurve-legendPosition'] == 'Hide') {
    return;
  } else if (this.widgets['epiCurve-legendPosition'] == 'Bottom') {
    let prevLength = 0;
    let rowCount = 0;
    let y = this.height + 50;
    if (this.selectedGraphType=='Single Date Field' && this.widgets['epiCurve-stackColorBy'] == 'Node Color' && this.commonService.session.style.widgets['node-color-variable'] != 'None') {
      let field = this.commonService.capitalize(this.commonService.session.style.widgets['node-color-variable']);
      epiCurve.append("text").attr("x", 70).attr("y", y).text(field + ': ').style("font-size", "15px").attr("alignment-baseline","middle")
      prevLength += field.length + 3;
    } else if (this.selectedGraphType=='Single Date Field' && this.widgets['epiCurve-stackColorBy'] != 'Node Color' && this.widgets['epiCurve-stackColorBy'] != 'None') {
      epiCurve.append("text").attr("x", 70).attr("y", y).text(this.widgets['epiCurve-stackColorBy'] + ': ').style("font-size", "15px").attr("alignment-baseline","middle")
      prevLength += this.widgets['epiCurve-stackColorBy'].length + 3;
    }
    fieldNames.forEach((name, i) => {
      // this first section calculates the location for each item/name in the legend
      let nLength = name==null ? 7: name.toString().length
      let baseX = 70+40*(rowCount) + prevLength*7.5;
      if (baseX+24+nLength*3 > this.width-70) {
        rowCount = 0;
        y += 30;
        prevLength = 0;
        baseX = 70;
      }

      epiCurve.append("circle").attr("cx", baseX).attr("cy", y).attr("r", 6).style("fill", colors[i])
      epiCurve.append("text").attr("x", baseX+10).attr("y", y).text(this.commonService.capitalize(name==null? '(Empty)': name.toString())).style("font-size", "15px").attr("alignment-baseline","middle")

      prevLength += nLength;
      rowCount += 1;
    })
    return;
  } else if (this.widgets['epiCurve-legendPosition'] == 'Right') {
    xOffset = this.width - 120;
  }
  let count = 0;
  if (this.selectedGraphType=='Single Date Field' && this.widgets['epiCurve-stackColorBy'] == 'Node Color' && this.commonService.session.style.widgets['node-color-variable'] != 'None') {
    let field = this.commonService.capitalize(this.commonService.session.style.widgets['node-color-variable']);
    epiCurve.append("text").attr("x", xOffset).attr("y", 30).text(field + ': ').style("font-size", "15px").attr("alignment-baseline","middle")
    count += 1;
  } else if (this.selectedGraphType=='Single Date Field' && this.widgets['epiCurve-stackColorBy'] != 'Node Color' && this.widgets['epiCurve-stackColorBy'] != 'None') {
    epiCurve.append("text").attr("x", xOffset).attr("y", 30).text(this.widgets['epiCurve-stackColorBy'] + ': ').style("font-size", "15px").attr("alignment-baseline","middle")
    count += 1;
  }
  fieldNames.forEach((name, i) => {
    epiCurve.append("circle").attr("cx",xOffset).attr("cy",30*(count+1)).attr("r", 6).style("fill", colors[i])
    epiCurve.append("text").attr("x", xOffset+20).attr("y", 30*(count+1)).text(this.commonService.capitalize(name==null? '(Empty)': name.toString())).style("font-size", "15px").attr("alignment-baseline","middle")
    count += 1;
  })
}

private setupEventListeners(): void {

  $('#timeline-play').click(() => {
    if (this.isPlaying) {
      $('#timeline-play').html('<span class="oi oi-media-play"></span>');
      this.stopTimeline();
    } else {
      $('#timeline-play').html('<span class="oi oi-media-pause"></span>');
      this.startTimeline();
    }
  });

  $(window).on('node-color-change', () => {
    this.svg.selectAll(".epiCurve-epi-curve rect")
      .attr("fill", this.commonService.session.style.widgets["node-color-variable"]);
  });

  $('#timeline-speed').on('change', () => {
    this.setTimer();
  });

  this.container.on('resize', () => { this.goldenLayoutComponentResize() })
  this.container.on('hide', () => { 
    this.viewActive = false; 
    this.cdref.detectChanges();
  })
  this.container.on('show', () => { 
    this.viewActive = true; 
    this.cdref.detectChanges();
  })
}

/**
 * Updates this.timeDomainStart and this.timeDomainEnd based on dates and this.widgets['epiCurve-binSize'];
 * 
 * @param times array of date objects
 * @returns return a d3 time range such as d3.timeMonth.range()
 */
calculateBinInterval(times) {
  let minTime = Math.min(...times);
  let maxTime = Math.max(...times);

  if (this.widgets['epiCurve-binSize'] == 'Day') {
    //@ts-ignore
    this.timeDomainStart = d3.timeMonth(minTime);
    //@ts-ignore
    this.timeDomainEnd = d3.timeMonth.ceil(maxTime);
    return d3.timeDay.range(this.timeDomainStart, this.timeDomainEnd);
  } else if (this.widgets['epiCurve-binSize'] == 'Week') {
    //@ts-ignore
    this.timeDomainStart = d3.timeMonth(minTime);
    //@ts-ignore
    this.timeDomainEnd = d3.timeMonth.ceil(maxTime);
    return d3.timeMonday.range(this.timeDomainStart, this.timeDomainEnd);
  } else if (this.widgets['epiCurve-binSize'] == 'Month') {
    //@ts-ignore
    this.timeDomainStart = d3.timeMonth(minTime);
    //@ts-ignore
    this.timeDomainEnd = d3.timeMonth.ceil(maxTime);
    return d3.timeMonth.range(this.timeDomainStart, this.timeDomainEnd);
  } else if (this.widgets['epiCurve-binSize'] == 'Quarter') {
    //@ts-ignore
    this.timeDomainStart = d3.timeMonth(minTime, 3);
    //@ts-ignore
    this.timeDomainEnd = d3.timeMonth.ceil(maxTime, 3);
    // for quarter we may need to update earliest month so that quarters are consistant (always start on Jan, April, July, or October)
    if ([1, 2].includes(this.timeDomainStart.getMonth())){
      this.timeDomainStart.setMonth(0);
    } else if ([4,5].includes(this.timeDomainStart.getMonth())) {
      this.timeDomainStart.setMonth(3);
    } else if ([7,8].includes(this.timeDomainStart.getMonth())) {
      this.timeDomainStart.setMonth(6);
    } else if ([10,11].includes(this.timeDomainStart.getMonth())) {
      this.timeDomainStart.setMonth(9);
    }
    return d3.timeMonth.range(this.timeDomainStart, this.timeDomainEnd, 3);
  } else if (this.widgets['epiCurve-binSize'] == 'Year') {
    //@ts-ignore
    this.timeDomainStart = d3.timeYear(minTime);
    //@ts-ignore
    this.timeDomainEnd = d3.timeYear.ceil(maxTime);
    return d3.timeYear.range(this.timeDomainStart, this.timeDomainEnd);
  } else {
    alert("Invalid bin size selected");
    return 0;
  }

}

/**
 * @returns updated bins with new attributes. bin.length2 is array of height of each group (ie. 'M', 'F') needed for that bin interval, bin.height represents the offset of that group.
 * 
 * Also returns maxCount which is used for setting y axis max value
 */
updateBins(bins, colorVariable='None', nodeColorKeys=undefined) {
  let maxCount = 0;
  // cumulative with multiple colors per column
  if (this.widgets['epiCurve-stackColorBy'] != 'None' && this.widgets['epiCurve-cumulative'] && colorVariable != 'None') { //useNodeColors
    //heights represents the size of each rect, offset represent the offset of each rect
    let heights = new Array(nodeColorKeys.length).fill(0);
    let offsets = new Array(nodeColorKeys.length).fill(0);
    bins.forEach(bin => {
      bin.length2 = [];
      bin.height = [];
      nodeColorKeys.forEach((value, ind) => {
        let currentCount = bin.filter((obj)=> obj[colorVariable]==value).length
        heights[ind] += currentCount;
        bin.length2.push(heights[ind]);
        offsets[ind] = bin.length2.reduce((paritalSum, a)=> paritalSum+a,0);
        bin.height.push(offsets[ind]);
        
      })
      maxCount += bin.length;
    })
    // noncumulative with multiple colors per column
  } else if (this.widgets['epiCurve-stackColorBy'] != 'None' && colorVariable != 'None') {
    bins.forEach(bin => {
      bin.length2 = [];
      bin.height = [];
      nodeColorKeys.forEach(value => {
        bin.length2.push(bin.filter((obj)=> obj[colorVariable]==value).length);
        bin.height.push(bin.length2.reduce((paritalSum, a)=> paritalSum+a,0));
      })
      if (bin.length > maxCount) maxCount = bin.length
    })
  // else if (useNodeColor == False || (useNodeColor && colorVariable=='None')) and using cumulative
  // cumulative with one color 
  } else if (this.widgets['epiCurve-cumulative']) {
    bins.forEach(bin => {
      maxCount += bin.length;
      bin.length = maxCount;
    });
    // noncumulative with one color
  } else {
    bins.forEach(bin => {
      if (bin.length > maxCount) maxCount = bin.length
    })
  }

  return [maxCount, bins]
}

/**
 * 
 * @return xAxis which is used to determine the interval and label for xAxis ticks and xLabelOffet which determine how much to shift each label
 */
configureXAxisSettings() {
  let xAxis;
  let numberOfDays = d3.timeDay.count(this.timeDomainStart, this.timeDomainEnd);
  let xLabelOffset = -10;
  if (this.widgets['epiCurve-binSize'] == 'Year') {
    xAxis = d3.axisBottom(this.x).ticks(d3.timeYear).tickFormat(d3.timeFormat("%Y"));
  } else if (numberOfDays<366) {
    xAxis = d3.axisBottom(this.x).ticks(d3.timeMonth.every(this.tickInterval)).tickFormat(d3.timeFormat("%b %Y"))
    xLabelOffset = -25;
  } else if (this.widgets['epiCurve-binSize'] == 'Quarter') {
    xAxis = d3.axisBottom(this.x)
      .ticks(d3.timeMonth.every(this.tickInterval < 3 ? this.tickInterval * 3 : 12))
      .tickFormat((d: Date) => d <= d3.timeYear(d) ? d.getFullYear().toString() : null);
  } else {
    xAxis = d3.axisBottom(this.x)
      .ticks(d3.timeMonth.every(this.tickInterval))
      .tickFormat((d: Date) => d <= d3.timeYear(d) ? d.getFullYear().toString() : null);
  }
  return [xAxis, xLabelOffset]
}

goldenLayoutComponentResize() {
  this.refresh();
  if (this.ShowEpiExportPane && this.EpiExportFileType!='svg') {
    this.setCalculatedResolution();
  }
}

// Handle the change event of the date field
onDateFieldChange(index: number) {
  if (index == 0) {
    this.widgets["epiCurve-date-fields"][index] = this.SelectedDateFieldVariable;
  } else if (index == 1) {
    this.widgets["epiCurve-date-fields"][index] = this.SelectedDateFieldVariable2;
  } else if (index == 2) {
    this.widgets["epiCurve-date-fields"][index] = this.SelectedDateFieldVariable3;
  }

  this.refresh();
}

onBinSizeChange() {
  if (this.widgets['epiCurve-binSize'] == 'Year') {
    $('#epi-tick-size').slideUp();
  } else {
    if (this.widgets['epiCurve-binSize'] == 'Quarter') {
      this.tickInterval = 1;
    }
    $('#epi-tick-size').slideDown();
  }
  this.refresh();
}

updateSettingsRows() {
  this.ShowEpiSettingsPane = true;
  setTimeout(() => {
    if (this.selectedGraphType == 'Multi: Overlay' || this.selectedGraphType == 'Multi: Side by Side') {
      $('#useNodeColorRow').slideUp();
      $('.additionalDateField').slideDown();
      //$('#epi-color-select').slideUp();
    } else {
      $('.additionalDateField').slideUp();
      $('#useNodeColorRow').slideDown();
      if (this.widgets['epiCurve-stackColorBy'] == 'None') {
        $('#epi-color-select').slideDown();
      }
    }
    //this.ShowEpiSettingsPane = false;
  }, 0)
}

onGraphTypeChange(refresh=true) {
  this.updateSettingsRows();

  this.widgets['epiCurve-graphType'] = this.selectedGraphType;
  if (refresh) this.refresh();
}

onUseNodeColorChange() {
  if (this.widgets['epiCurve-stackColorBy'] == 'None') {
    $('#epi-color-select').slideDown();
  } else {
    $('#epi-color-select').slideUp();
  }
  this.refresh();
}

onTickIntevalChange() {
  this.refresh()
}

onNodeColorChanged() {
  this.refresh();
}

onLegendPositionChange() {
  if (this.widgets['epiCurve-legendPosition'] == 'Bottom') {
    this.margin.bottom = 100;
  } else {
    this.margin.bottom = 50;
  }
  this.refresh();
}

openSettings() {
  this.visuals.epiCurve.ShowEpiSettingsPane = !this.visuals.epiCurve.ShowEpiSettingsPane;
}

setCumulative(value: boolean): void {
  this.widgets['epiCurve-cumulative'] = value;

  this.refresh();
}


/**
 * Sets CalculatedResolution variable to string such as '1250 x 855px'. Only called when export is first opened
 */
setCalculatedResolution() {
  let [width, height] = this.getImageDimensions();
  this.CalculatedResolution = (Math.round(width * this.SelectedNetworkExportScaleVariable) + " x " + Math.round(height * this.SelectedNetworkExportScaleVariable) + "px");
}

  /**
   * Updates CalculatedResolution variable to string such as '1250 x 855px' based on ImageDimensions and SelectedNetworkExportScaleVariable. 
   * This is called anytime SelectedNetworkExportScaleVariable is updated.
   */
  updateCalculatedResolution() {
    let [width, height] = this.getImageDimensions();
    this.CalculatedResolution = (Math.round(width * this.SelectedNetworkExportScaleVariable) + " x " + Math.round(height * this.SelectedNetworkExportScaleVariable) + "px");
    this.cdref.detectChanges();
}

/**
 * @returns an array [width, height] of the svg image
 */
  getImageDimensions() {
    let parent = this.svg.node();
    return [parent.clientWidth, parent.clientHeight] 
  }

private startTimeline(): void {
  this.isPlaying = true;
  this.setTimer();
}

private stopTimeline(): void {
  this.isPlaying = false;
  if (this.timer) {
    this.timer.stop();
  }
}

private setTimer(): void {
  if (this.timer) {
    this.timer.stop();
    d3.timerFlush();
  }
  this.timer = d3.interval(() => {
    const selection = d3.brushSelection(this.brushG.node());
    if (!selection) return this.timer.stop(); // Ignore empty selections
    if (selection[1] >= this.width) {
      this.startTimeline();
      return;
    }
    this.brushG.call(this.brush.move, selection.map(s => s + 1));
    if (++this.tick % 5 == 0) this.propagate();
  }, 110 - parseInt($("#timeline-speed").val() as string));
  if (!this.isPlaying) this.timer.stop();
}

private propagate(): void {
  this.commonService.session.state.timeStart = this.x.invert(this.selection[0]);
  this.commonService.session.state.timeEnd = this.x.invert(this.selection[1]);
  this.commonService.setNodeVisibility(true);
  this.commonService.setLinkVisibility(true);
  this.commonService.tagClusters().then(() => {
    ["node", "link"].forEach((thing: string) => {
      (window as any).trigger(thing + "-visibility");
    });
  });
}

// private initializeD3Chart(): void {
//   this.clearSvg();
//   this.setupDimensions();
//   this.setupScales();
//   this.createSvg();
//   this.populateData();
//   this.drawHistogram();
//   this.setupBrush();
// }

// private clearSvg(): void {
//   d3.select(this.timelineElement.nativeElement).selectAll("*").remove();
// }

// private setupDimensions(): void {
//   const wrapper = this.timelineElement.nativeElement;
//   this.width = wrapper.clientWidth - this.margin.left - this.margin.right;
//   this.height = wrapper.clientHeight - this.margin.top - this.margin.bottom;
// }

// private setupScales(): void {
//   this.x = d3.scaleTime().range([0, this.width]);
//   this.y = d3.scaleLinear().range([this.height, 0]);
// }

// private createSvg(): void {
//   this.svg = d3.select(this.timelineElement.nativeElement)
//     .append("svg")
//     .attr("width", this.width + this.margin.left + this.margin.right)
//     .attr("height", this.height + this.margin.top + this.margin.bottom)
//     .append("g")
//     .attr("transform", `translate(${this.margin.left},${this.margin.top})`);
// }

// private populateData(): void {
//   // Transform your data here
//   this.vnodes.forEach(d => {
//     const time = moment(d.date); // Replace 'date' with your actual date field
//     if (time.isValid()) {
//       d.date = time.toDate();
//     } else {
//       d.date = null;
//     }
//   });

//   this.timeDomainStart = d3.min(this.vnodes, d => d.date);
//   this.timeDomainEnd = d3.max(this.vnodes, d => d.date);
//   this.x.domain([this.timeDomainStart, this.timeDomainEnd]);
// }

// private drawHistogram(): void {
//   // Draw your histogram here
//   this.histogram = d3.histogram()
//     .value(d => d.date) // Replace 'date' with your actual date field
//     .domain(this.x.domain())
//     .thresholds(d3.thresholdScott);

//   const bins = this.histogram(this.vnodes);

//   if (this.cumulative) {
//     let sum = 0;
//     bins.forEach(bin => {
//       sum += bin.length;
//       bin.length = sum;
//     });
//   }

//   this.y.domain([0, d3.max(bins, d => d.length)]);

//   this.svg.selectAll("rect")
//     .data(bins)
//     .enter()
//     .append("rect")
//     .attr("x", d => this.x(d.x0))
//     .attr("y", d => this.y(d.length))
//     .attr("width", d => this.x(d.x1) - this.x(d.x0))
//     .attr("height", d => this.height - this.y(d.length))
//     .attr("fill", "steelblue"); // Change fill as necessary
// }

// private setupBrush(): void {
//   this.brush = d3.brushX()
//     .extent([[0, 0], [this.width, this.height]])
//     .on("end", () => this.onBrushEnd());

//   this.brushG = this.svg.append("g")
//     .attr("class", "brush")
//     .call(this.brush);
// }

// private onBrushEnd(): void {
//   this.selection = d3.brushSelection(this.brushG.node());
//   if (this.selection) {
//     // Handle brush selection change
//   }
// }

// playPauseTimeline(): void {
//   if (this.isPlaying) {
//     this.stopTimeline();
//   } else {
//     this.startTimeline();
//   }
// }

// startTimeline(): void {
//   this.isPlaying = true;
//   this.setTimer();
// }

// stopTimeline(): void {
//   this.isPlaying = false;
//   if (this.timer) {
//     this.timer.stop();
//   }
// }

// setTimer(): void {
//   if (this.timer) {
//     this.timer.stop();
//   }
//   this.timer = d3.interval(() => {
//     // Timer logic for updating the timeline
//     // this.updateTimeline();
//   }, 100); // Adjust interval as needed
// }

updateNodeColors() {
  this.refresh();
}
updateVisualization() {
  //Not Relevant
}

applyStyleFileSettings() {
  this.widgets = (window as any).context.commonService.session.style.widgets;
  this.setDefaultsWidgets();
  
  this.updateSettingsRows()
  this.onLegendPositionChange()
}

updateLinkColor() {
  //Not Relevant
}

onRecallSession() {
}

openExport() {
  this.setCalculatedResolution();
  this.ShowEpiExportPane = !this.ShowEpiExportPane;
}

exportVisualization() {
  if (this.EpiExportFileType == 'svg') {
      let content = this.exportService.unparseSVG(this.epiCurveSVGElement.nativeElement);
      let blob = new Blob([content], { type: 'image/svg+xml;charset=utf-8' });
      saveAs(blob, this.EpiExportFileName + '.' + this.EpiExportFileType);
  } else {
      saveSvgAsPng(this.epiCurveSVGElement.nativeElement, this.EpiExportFileName + '.' + this.EpiExportFileType, {
          scale: this.SelectedNetworkExportScaleVariable,
          backgroundColor: "#ffffff",
          encoderType: 'image/' + this.EpiExportFileType,
          //encoderOptions: this.SelectedNetworkExportQualityVariable
      });
  }
  this.ShowEpiExportPane = false;
}

openRefreshScreen() {

}

onLoadNewData() {
  throw new Error('Method not implemented.');
}
onFilterDataChange() {
  throw new Error('Method not implemented.');
}


}



export namespace TimelineComponent {
  export const componentTypeName = 'Epi Curve';
}