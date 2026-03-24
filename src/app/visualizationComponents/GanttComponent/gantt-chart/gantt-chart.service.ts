import { Injectable } from '@angular/core';
//import { colorSchemes } from '../constants/color-schemes';

@Injectable({
   providedIn: 'root'
})
export class GanttChartService {

  width: number;
  height: number;
  ganttTeams: Array<any>;
  ganttPhases: Array<any>;
  phaseTimelines;
  legend;
  ganttMinDate;
  ganttMaxDate;
  ganttDateRange: number;
  xPadding: number;
  yPadding: number;
  componentID: number;
  data: any;

  gridWidthY: number;
  gridWidthX: number;
  rectWidth: number;
  rectHeight: number;
  legendWidth: number;
  legendHeight: number;
  minX: number;
  maxX: number;

  monthNames = [
    'January', 'February', 'March',
    'April', 'May', 'June', 'July',
    'August', 'September', 'October',
    'November', 'December'
  ];

  constructor() { }

  computeRectDimensions() {
    this.rectWidth = this.gridWidthX * 8;
    this.rectHeight = this.ganttPhases.length * this.gridWidthY;
  }

  computeLegendDimensions() {
    const noOfLines = Math.ceil(this.data.length / 3);
    if (noOfLines == 1) {
      this.legendWidth = this.rectWidth * this.data.length / 3
    } else {
      this.legendWidth = this.rectWidth;
    }
    this.legendHeight = 20 + 40 * noOfLines;
  }

  transformX(x: number) {
    return this.rectWidth * x / (this.maxX - this.minX);
  }

  computeLegend() {
    const noOfLines = Math.ceil(this.data.length / 3);
    this.legend = [];
    let cnt = 0;
    for (let line = 0; line < noOfLines; line++) {
      const legendLine = [];
      for (let i = 0; i < 3; i++) {
        if (this.ganttTeams[cnt]) legendLine.push(this.ganttTeams[cnt]);
        cnt++;
      }
      this.legend.push(legendLine);
    }
  }

  transformGanttDate(d) {
    const oneDay = 24 * 60 * 60 * 1000;
    const daysSinceMinDate = Math.round(Math.abs(
        (new Date(d).getTime()
        - (new Date(this.ganttMinDate)).getTime()
        ) / (oneDay)));
    return this.rectWidth * daysSinceMinDate / (this.maxX - this.minX);
  }

  closestMultipleLessThanEqualTo(factor, num) {
    if (num % factor === 0) return num;
    else return this.closestMultipleLessThanEqualTo(factor, num - 1);
  }

  closestMultipleMoreThanEqualTo(factor, num) {
    if (num % factor === 0) return num;
    else return this.closestMultipleMoreThanEqualTo(factor, num + 1);
  }


  setValues({
    componentID: componentID,
    width: width,
    xPadding: xPadding,
    yPadding: yPadding,
    data: data,
    gridWidthX: gridWidthX,
    gridWidthY: gridWidthY
  }) {
    this.componentID = componentID;
    this.width = width;
    this.xPadding = xPadding;
    this.yPadding = yPadding;
    this.data = data;
    this.gridWidthY = gridWidthY
    this.gridWidthX = gridWidthX
    const froms: any = [];
    const tos: any = [];
    const phases = new Set();
    this.ganttTeams = [];
    let teamsCount = 0;
    // this.setColors();
    for (const team of this.data) {
      this.ganttTeams.push({id: teamsCount, name: team.name, color: team.color, opacity: team.opacity});
      teamsCount += 1;
      for (const phase of Object.keys(team.timelines)) {
        phases.add(phase);
        for (const timeline of team.timelines[phase]) {
          froms.push(timeline.from);
          tos.push(timeline.to);
        }
      }
    }
    this.ganttPhases = Array.from(phases);

    const minDate = froms.filter(x => x !== null && x!=="null").reduce((a, b) => new Date(a) < new Date(b) ? a : b );
    const maxDate = tos.filter(x=>x!==null && x!=="null").reduce((a, b) => new Date(a) > new Date(b) ? a : b );

    this.ganttMinDate = minDate;
    this.ganttMaxDate = maxDate;
    const noOfLines = Math.ceil(this.data.length / 3);
    this.height = this.ganttPhases.length * this.gridWidthY + this.yPadding * 3 + 20 + 30 * noOfLines;

    const oneDay = 24 * 60 * 60 * 1000;
    this.ganttDateRange = Math.round(Math.abs(
        (new Date(this.ganttMaxDate).getTime()
        - new Date(this.ganttMinDate).getTime()
        ) / (oneDay)));
    this.minX = 0;
    this.maxX = this.ganttDateRange;
    let flag = 0;
    let qts = 1;
    while (flag === 0) {
      if (this.ganttDateRange <= 90 * qts) {
        flag = 1;
        break;
      } else { qts = qts + 1; }
    }

    this.maxX = this.closestMultipleMoreThanEqualTo(7 * qts, this.ganttDateRange);
    this.ganttMaxDate = this.addDays(this.ganttMinDate, this.maxX);

    this.computeRectDimensions();
    this.computeLegendDimensions();
    this.computeLegend();
  }

  addDays(date, days: number) {
    const newdate = new Date(date);
    newdate.setDate((new Date(date)).getDate() + days);
    const day = newdate.getDate();
    const monthIndex = newdate.getMonth();
    const year = newdate.getFullYear();


    return this.monthNames[monthIndex] + ' ' + day + ', ' + year;
  }

  printAll() {
    console.log('line-graph-service');
    console.log('component ID: ' + this.componentID);
    console.log('width: ' + this.width);
    console.log('height: ' + this.height);
    console.log('xPadding: ' + this.xPadding);
    console.log('yPadding: ' + this.yPadding);
    console.log('rectWidth: ' + this.rectWidth);
    console.log('rectHeight: ' + this.rectHeight);
    console.log('ganttMinDate: ' + this.ganttMinDate);
    console.log('ganttMaxDate: ' + this.ganttMaxDate);
  }
}
