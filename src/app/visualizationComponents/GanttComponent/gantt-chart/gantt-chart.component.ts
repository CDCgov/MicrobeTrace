import { Component, OnInit, OnChanges, Input, ElementRef, ChangeDetectorRef } from '@angular/core';
import { colorSchemes } from '../constants/color-schemes';
import { GanttChartService } from './gantt-chart.service';

@Component({
    selector: 'ngx-gantt-chart',
    templateUrl: './gantt-chart.component.html',
    styleUrls: ['./gantt-chart.component.scss'],
    providers: [GanttChartService],
    standalone: false
})
export class GanttChartComponent implements OnInit, OnChanges {

  @Input() data;
  @Input() width: number;
  @Input() colorScheme = 'colorful';
  @Input() customColorScheme: string[] = [];

  componentID;
  xPadding = 60;
  yPadding = this.xPadding / 2;
  phaseTimelines;
  height: number;

  gridWidthX: number;
  gridWidthY: number;

  gridPrecisionX: number;

  gridID: string;
  gridPath: string;

  xAxis: any;
  yAxis: any;

  monthNames = [
    'January', 'February', 'March',
    'April', 'May', 'June', 'July',
    'August', 'September', 'October',
    'November', 'December'
  ];


  addDays(date, days: number) {
    const newdate = new Date(date);
    newdate.setDate((new Date(date)).getDate() + days);
    const day = newdate.getDate();
    const monthIndex = newdate.getMonth();
    const year = newdate.getFullYear();


    return this.monthNames[monthIndex] + ' ' + day + ', ' + year;
  }

  shortenDate(date) {
    if (typeof date === "string"){
      date = date.replace('January', 'Jan');
      date = date.replace('February', 'Feb');
      date = date.replace('March', 'Mar');
      date = date.replace('April', 'Apr');
      date = date.replace('May', 'May');
      date = date.replace('June', 'Jun');
      date = date.replace('July', 'Jul');
      date = date.replace('August', 'Aug');
      date = date.replace('September', 'Sep');
      date = date.replace('October', 'Oct');
      date = date.replace('November', 'Nov');
      date = date.replace('December', 'Dec');
    }
    return date;
  }

  computeGrid() {
    this.cdref.detectChanges();
    // compute the min date and max date
    // const oneDay = 24 * 60 * 60 * 1000;
    // const dateRange = Math.round(Math.abs(
    //     (this.ganttChartService.ganttMaxDate.getTime()
    //      - this.ganttChartService.ganttMinDate.getTime()
    //      ) / (oneDay)));
    let flag = 0;
    let qts = 1;

    // 3m --> 1 week  --> 12
    // 6m --> 2 weeks --> 12
    // 9m --> 3 weeks --> 12

    while (flag === 0) {
      if (this.ganttChartService.ganttDateRange <= 90 * qts) {
        this.gridPrecisionX = 7 * qts;
        flag = 1;
      } else qts = qts + 1;
    }

    // console.log(this.gridPrecisionX);

    this.gridWidthX = this.ganttChartService.transformX(this.gridPrecisionX);
    this.gridWidthY = this.ganttChartService.rectHeight / this.ganttChartService.ganttPhases.length;
    this.gridPath = 'M ' + this.gridWidthX + ' 0 L 0 0 0 ' + this.gridWidthY;

    this.xAxis = [];
    this.yAxis = [];

    let date = this.ganttChartService.ganttMinDate;
    // let xPos = this.ganttChartService.transformGanttDate(date) + this.ganttChartService.xPadding + 150;
    const yTrans = this.ganttChartService.rectHeight + this.ganttChartService.yPadding + 10;
    // let transform = 'translate(' + xPos + 'px, ' + yTrans + 'px)';
    // this.xAxis.push({xPos: xPos, value: date, transform: transform});
    while (new Date(date) <= new Date(this.ganttChartService.ganttMaxDate)) {
      // console.log(date);
      const xPos = this.ganttChartService.transformGanttDate(date) + this.ganttChartService.xPadding + 150;
      const transform = 'translate(' + xPos + 'px, ' + yTrans + 'px)';
      this.xAxis.push({xPos, value: this.shortenDate(date), transform});
      date = this.addDays(date, this.gridPrecisionX);
    }

    // console.log(this.xAxis);
    let cnt = 0;
    for (const phase of this.ganttChartService.ganttPhases) {
      const yPos = this.gridWidthY * cnt + this.gridWidthY * 0.5 + this.ganttChartService.yPadding;
      this.yAxis.push({yPos, value: phase });
      cnt++;
    }
    // console.log(this.yAxis);
    // console.log(this.xAxis);
  }

  getWidth(gEntry): number {
    if (gEntry.to === gEntry.from) {
      return 15;
    } else {
      return this.ganttChartService.transformGanttDate(gEntry.to) - this.ganttChartService.transformGanttDate(gEntry.from); 
    }
  }



  setDimensions() {
    if (this.width) this.height = this.width - this.xPadding;
    else {
      const host = this.currentElement.nativeElement;
      if (host.parentNode != null) {
        const dims = host.parentNode.getBoundingClientRect();
        this.width = dims.width;
        this.height = this.width - this.xPadding;
      }
    }
    
     /*
     console.log('---set dimensions---');
     console.log('width: ' + this.width);
     console.log('height: ' + this.height);
     console.log('--------------------');
     */
     
  }

  setColors() {
    let cnt = 0;
    for (const team of this.data) {
      if (!team.color) {
        if (this.customColorScheme.length > 0) {
          team.color = this.customColorScheme[cnt % this.customColorScheme.length];
        } else {
          team.color = colorSchemes[this.colorScheme][cnt % 10];
        }
        cnt++;
      }
    }
  }

  definePhaseTimelines() {
    this.phaseTimelines = {};
    for (const phase of this.ganttChartService.ganttPhases) {
      this.phaseTimelines[phase] = [];
    }

    for (const team of this.ganttChartService.data) {
      for (const phase of Object.keys(team.timelines)) {
        for (const timeline of team.timelines[phase]) {
          this.phaseTimelines[phase].push({from: timeline.from,
            to: timeline.to,
            color: team.color,
            info: timeline.info,
            toolTip: (timeline.info ? 'block' : 'none')});
        }
      }
    }
    // console.log('phase timelines: ');
    // console.log(this.phaseTimelines);
  }

  // setColors() {
  //   let cnt = 0;
  //   for (const team of this.ganttChartService.data) {
  //     if (!team.color) team.color = colorSchemes[this.ganttChartService.colorScheme][cnt % 10];
  //     cnt++;
  //   }
  // }

  constructor(public ganttChartService: GanttChartService,              
              private currentElement: ElementRef,
              private cdref: ChangeDetectorRef) { //super(ganttChartService, cdref);
                }

  ngOnInit() {
    this.cdref.detectChanges();
    this.componentID = 1;
    this.setDimensions();
    this.setColors();
    this.ganttChartService.setValues({
      componentID: this.componentID,
      width: this.width,
      xPadding: this.xPadding,
      yPadding: this.yPadding,
      data: this.data
    });
    this.gridID = 'grid' + this.ganttChartService.componentID;
    this.height = this.ganttChartService.height;
    this.definePhaseTimelines();
    this.computeGrid();
  }

  ngOnChanges() {
    this.setDimensions();
    this.setColors();
    this.ganttChartService.setValues({
      componentID: this.componentID,
      width: this.width,
      xPadding: this.xPadding,
      yPadding: this.yPadding,
      data: this.data
    });
    this.height = this.ganttChartService.height;
    this.definePhaseTimelines();
    this.computeGrid();
  }

}
