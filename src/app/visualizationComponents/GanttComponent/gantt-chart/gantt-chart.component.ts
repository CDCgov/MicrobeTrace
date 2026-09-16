import { Component, OnInit, OnChanges, Input, ElementRef, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
//import { colorSchemes } from '../constants/color-schemes';
import { GanttChartService } from './gantt-chart.service';

@Component({
  selector: 'ngx-gantt-chart',
  templateUrl: './gantt-chart.component.html',
  styleUrls: ['./gantt-chart.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class GanttChartComponent implements OnInit, OnChanges {

  @Input() data;
  @Input() width: number;
  @Input() colorScheme = 'colorful';
  @Input() customColorScheme: string[] = [];
  @Input() gridWidthX: number = 120;
  @Input() gridWidthY: number = 20;
  @Input() fontSize = 14;

  componentID;
  chartStartX = 150;
  xPadding = 60;
  yPadding = this.xPadding / 2;
  phaseTimelines;
  height: number;
  min(n1: number, n2: number): number { return Math.min(n1, n2)  }
  gridPrecisionX: number;

  gridID: string;
  gridPath: string;
  gridFill: string;

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

  formatAxisDate(date: any): string {
    const parsedDate = new Date(date);
    if (Number.isNaN(parsedDate.getTime())) {
      return String(date);
    }

    return parsedDate.toLocaleDateString('en-US');
  }

  private getGridColumnCount(): number {
    return Math.max(1, this.ganttChartService.gridColumnCount || 8);
  }

  private getParentWidth(): number {
    const host = this.currentElement.nativeElement as HTMLElement;
    const parent = host.parentElement;
    if (!parent) {
      return 0;
    }

    const parentWidth = parent.getBoundingClientRect().width;
    return Number.isFinite(parentWidth) && parentWidth > 0 ? parentWidth : 0;
  }

  private syncChartWidth(): void {
    const requiredWidth =
      this.chartStartX +
      this.ganttChartService.rectWidth +
      10 +
      this.fontSize * 2.5;
    const baseWidth = this.getParentWidth() || this.width || 0;

    this.width = Math.max(baseWidth, requiredWidth);
  }

  computeGrid() {
    this.cdref.detectChanges();
    this.gridPrecisionX = this.ganttChartService.gridPrecisionX || 7;

    this.gridPath = 'M 0 0 H' + this.gridWidthX + ' V' + this.gridWidthY + ' H 0 Z'

    this.xAxis = [];
    this.yAxis = [];
    if (!this.ganttChartService.hasRenderableDateRange) {
      this.calculateLabelYPos();
      return;
    }

    const yTrans = this.ganttChartService.rectHeight + this.ganttChartService.yPadding + 10;
    const gridColumnCount = this.getGridColumnCount();

    for (let xCount = 0; xCount <= gridColumnCount; xCount++) {
      const date = this.addDays(this.ganttChartService.ganttMinDate, xCount * this.gridPrecisionX);
      const xPos = this.chartStartX + xCount * this.gridWidthX;
      const transform = 'translate(' + xPos + 'px, ' + yTrans + 'px)';

      this.xAxis.push({id: xCount, xPos, value: this.formatAxisDate(date), transform});
    }

    this.calculateLabelYPos();
  }

  getWidth(gEntry): number {
    if (gEntry.to === gEntry.from) {
      return 15;
    } else {
      return this.ganttChartService.transformGanttDate(gEntry.to) - this.ganttChartService.transformGanttDate(gEntry.from); 
    }
  }



  setDimensions() {
    const parentWidth = this.getParentWidth();
    if (parentWidth) {
      this.width = parentWidth;
      this.height = this.width - this.xPadding;
    } else if (this.width) {
      this.height = this.width - this.xPadding;
    }

     /*
     console.log('---set dimensions---');
     console.log('width: ' + this.width);
     console.log('height: ' + this.height);
     console.log('--------------------');
     */
     
  }

  // setColors() {
  //   let cnt = 0;
  //   for (const team of this.data) {
  //     if (!team.color) {
  //       if (this.customColorScheme.length > 0) {
  //         team.color = this.customColorScheme[cnt % this.customColorScheme.length];
  //       } else {
  //         team.color = colorSchemes[this.colorScheme][cnt % 10];
  //       }
  //       cnt++;
  //     }
  //   }
  // }

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
            opacity: team.opacity,
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
    this.gridID = 'grid' + this.componentID;
    this.gridFill = `url(#${this.gridID})`
    this.normalizeGridWidthX();
    this.ganttChartService.setValues({
      componentID: this.componentID,
      width: this.width,
      xPadding: this.xPadding,
      yPadding: this.yPadding,
      data: this.data,
      gridWidthX: this.gridWidthX,
      gridWidthY: this.gridWidthY
    });
    this.syncChartWidth();
    this.height = this.ganttChartService.height;
    this.definePhaseTimelines();
    this.computeGrid();
  }

  ngOnChanges() {
    this.setDimensions();
    this.normalizeGridWidthX();
    this.ganttChartService.setValues({
      componentID: this.componentID,
      width: this.width,
      xPadding: this.xPadding,
      yPadding: this.yPadding,
      data: this.data,
      gridWidthX: this.gridWidthX,
      gridWidthY: this.gridWidthY
    });
    this.syncChartWidth();
    this.height = this.ganttChartService.height;
    this.definePhaseTimelines();
    this.computeGrid();
  }

  private calculateDefaultGridWidthX(): number {
    const predictedWidth = this.width
      ? (Math.floor((this.width - this.chartStartX) / 8 / 10) - 1) * 10
      : 120;

    return Math.min(200, Math.max(20, predictedWidth));
  }

  private normalizeGridWidthX() {
    const parsedWidth = Number(this.gridWidthX);
    this.gridWidthX = Number.isFinite(parsedWidth) && parsedWidth > 0
      ? parsedWidth
      : this.calculateDefaultGridWidthX();
  }
  calculateLabelYPos() {
    this.yAxis = [];
    let cnt = 0;

    for (const phase of this.ganttChartService.ganttPhases) {
      const yPos = this.gridWidthY * (cnt+.5) + this.ganttChartService.yPadding + 5
      this.yAxis.push({id: cnt, yPos, value: phase });
      cnt++;
    }
  }

  updateGridWidthY(gridWidthY) {
    this.gridWidthY = gridWidthY;
    this.calculateLabelYPos();
    this.ngOnChanges();
  }

  updateGridWidthX(gridWidthX) {
    this.gridWidthX = gridWidthX;
    this.ngOnChanges();
  }

  showGrid(show: boolean) {
    if (show) this.gridFill = `url(#${this.gridID})`
    else this.gridFill = 'none';
  }

  updateFontSize(fontSize: number) {
    this.fontSize = fontSize;
    this.syncChartWidth();
  }
}
