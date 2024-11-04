import { ChangeDetectorRef, Component, ElementRef, Inject, Injector, OnInit, Renderer2, ViewChild } from '@angular/core';
import { EventManager } from '@angular/platform-browser';
import { ComponentContainer } from 'golden-layout';
import { SelectItem } from 'primeng/api';
import { Table } from 'primeng/table';
import * as saveAs from 'file-saver';
import pdfMake from 'pdfmake/build/pdfmake.js';
import pdfFonts from 'pdfmake/build/vfs_fonts.js'

import { BaseComponentDirective } from '@app/base-component.directive';
import { MicobeTraceNextPluginEvents } from '../../helperClasses/interfaces';
import { MicrobeTraceNextVisuals } from '../../microbe-trace-next-plugin-visuals';
import { CommonService } from '../../contactTraceCommonServices/common.service';
import { GoogleTagManagerService } from 'angular-google-tag-manager';

@Component({
  selector: 'CrosstabComponent',
  templateUrl: './crosstab-plugin.component.html',
  styleUrls: ['./crosstab-plugin.component.scss']
})
export class CrosstabComponent extends BaseComponentDirective implements OnInit, MicobeTraceNextPluginEvents {

  private visuals: MicrobeTraceNextVisuals;

  @ViewChild('dt') dataTable: Table;

  widgets;
  xVariable;
  yVariable; 
  previousVariables = {
    'nodes': ['None', 'None'],
    'links': ['None', 'None'],
    'clusters': ['None', 'None']
  }
  viewActive: boolean = true;
  datasetOptions: any = [
    { label: 'Nodes', value: 'nodes' },
    { label: 'Links', value: 'links'},
    { label: 'Clusters', value: 'clusters' }
  ];
  
  showOptions: any = [
    { label: 'Counts', value: false },
    { label: 'Proportion', value: true }
  ]

  settingsOpen: boolean = false;
  exportOpen: boolean = false;

  SelectedCrossTabExportFilename: string = "";
  SelectedCrossTabExportFileType = 'csv';
  CrossTabExportFileTypeList: any = [
    { label: 'xlsx', value: 'xlsx' },
    { label: 'csv', value: 'csv' },
    { label: 'json', value: 'json'},
    { label: 'pdf', value: 'pdf'}
];

  fieldListDictionary: {
    'nodes': SelectItem[],
    'links': SelectItem[],
    'clusters': SelectItem[]
  }
  selectedFieldList: SelectItem[];
  SelectedTableData: TableData;
  totalRow;
  selectedSize = '';
  scrollHeight: string;
  tableStyle;
  sizes = [
      { name: 'Small', class: 'p-datatable-sm' },
      { name: 'Normal', class: '' },
      { name: 'Large',  class: 'p-datatable-lg' }
  ];

  constructor(injector: Injector,
    private renderer: Renderer2,
    private elem: ElementRef,
    private eventManager: EventManager,
    public commonService: CommonService,
    @Inject(BaseComponentDirective.GoldenLayoutContainerInjectionToken) private container: ComponentContainer, 
    elRef: ElementRef,
    private cdref: ChangeDetectorRef,
    private gtmService: GoogleTagManagerService) {

      super(elRef.nativeElement);

      this.visuals = commonService.visuals;
      this.visuals.crossTab = this;
      this.widgets = this.commonService.session.style.widgets;
  }

  ngOnInit() {

    this.gtmService.pushTag({
            event: "page_view",
            page_location: "/crosstab",
            page_title: "Crosstab View"
        });

    this.updateFieldLists();
    this.setWidgets();

    this.updateTable();

    // offsets: 70 table-wrapper padding-top, 10 table-wrapper padding-bottom
    let pFooterHeight = this.selectedSize == 'p-datatable-sm' ? 41 : this.selectedSize == 'p-datatable-lg' ? 65 : 57;
    console.log('abc', pFooterHeight);
    this.scrollHeight = ($('crosstabcomponent').height() - 70 - 10 - pFooterHeight) + 'px';
    let width = ($('crosstabcomponent').width() - 23) + 'px';
    this.tableStyle = {
        'max-width' : width,
        'display': 'block'
    }

    this.container.on('resize', () => { this.goldenLayoutComponentResize()})
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
   * Set Default widgets if not previously defined or when a style file is loaded
   */
  setWidgets() {
    // which dataset
    if (this.widgets['crosstab-selectedDataset'] == undefined) {
      this.widgets['crosstab-selectedDataset'] = 'nodes';
    }
    this.selectedFieldList = this.fieldListDictionary[this.widgets['crosstab-selectedDataset']];

    // x and y variable
    if (this.widgets['crosstab-xVariable'] == undefined || !(this.selectedFieldList.map(x => x.value).includes(this.widgets['crosstab-xVariable']))) {
      this.xVariable = 'None';
      this.widgets['crosstab-xVariable'] = 'None'
    } else {
      this.xVariable = this.widgets['crosstab-xVariable'];
    }

    if (this.widgets['crosstab-yVariable'] == undefined || !(this.selectedFieldList.map(x => x.value).includes(this.widgets['crosstab-yVariable']))) {
      this.yVariable = 'None';
      this.widgets['crosstab-yVariable'] = 'None';
    } else {
      this.yVariable = this.widgets['crosstab-yVariable'];
    }

    // use proportion
    if (this.widgets['crosstab-useProportion'] == undefined) {
      this.widgets['crosstab-useProportion'] = false;
    }

    this.previousVariables[this.widgets['crosstab-selectedDataset']] = [this.xVariable, this.yVariable]
  }

  /**
   * Generates the table by counting the data. Converts the counts into proportions if needed
   */
  updateTable() {
    var xValues = [], yValues = [];
    let rawdata;
    if (this.widgets['crosstab-selectedDataset'] == 'nodes') {
      rawdata = this.commonService.getVisibleNodes();
    } else if (this.widgets['crosstab-selectedDataset'] == 'links') {
      rawdata = this.commonService.getVisibleLinks();
    } else {
      rawdata = this.commonService.getVisibleClusters();
    }

    // get values for X and Y axis
    rawdata.forEach(row => {
      var val = row[this.xVariable];
      if (!xValues.includes(val)) xValues.push(val);
      val = row[this.yVariable];
      if (!yValues.includes(val)) yValues.push(val);
    });
    xValues.push('Total');
    yValues.push('Total');
    xValues = xValues.map(String);
    
    // populate count array [{}, {}, ...] where each item/object is a row
    var data = [];
    this.totalRow = { col: 'Total'}
    xValues.forEach(col => this.totalRow[col] = 0)
    rawdata.forEach(row => {
      var match = data.find(arow => arow.col == row[this.widgets['crosstab-yVariable']]);
      if (match) {
        match[row[this.xVariable]]++;
        match['Total']++;
      } else {
        var newRow = { col: row[this.widgets['crosstab-yVariable']] };
        xValues.forEach(col => newRow[col] = 0);
        newRow[row[this.xVariable]]++;
        newRow['Total'] = 1;
        data.push(newRow);
      }
      this.totalRow[row[this.xVariable]]++;
    });
    this.totalRow['Total'] = Object.keys(this.totalRow).filter(key => key!= 'col').reduce((acc, key) => acc + this.totalRow[key], 0);
    data.forEach(row => {
      row.col = String(row.col)
    })

    this.SelectedTableData = {
      tableColumns: [
        {
          field: 'col',
          header: ''
        }
       ],
      data: data
    }
    xValues.forEach(value => {
      this.SelectedTableData.tableColumns.push({
        field: value,
        header: value
      })
    })
    
    if(this.widgets['crosstab-useProportion']) {
      this.convertToProportion();
    }
    
  }

  /**
   * Calculate proportion instead of count for each cell based on total. 
   */
  convertToProportion() {
    // Future updates may give option for proportion based on col and row as well
    // But it's not clear how to work with pivot function (would proportion by row/X become by col/Y or not)

    let total = this.totalRow['Total'];
    this.SelectedTableData.data.forEach(row => {
      Object.keys(row).forEach(key => {
        if (key =='col') return;
        row[key] = (row[key]/total).toFixed(3);
      })
    })
    Object.keys(this.totalRow).forEach(key => {
      if (key == 'col') return;
      this.totalRow[key] = (this.totalRow[key]/total).toFixed(3);
    })
    //this.cdref.detectChanges();
  }

  /**
   * Switch the value of widgets['crosstab-xVariable'] and widgets['crosstab-yVariable'], and then updates the values in the table so that it pivots.
   * This function does not recount the value.
   */
  pivotCrosstab() {
    // switch widgets['crosstab-xVariable'] and yVariable
    let tmp = this.xVariable;
    this.xVariable = this.yVariable;
    this.yVariable = tmp;
    this.previousVariables[this.widgets['crosstab-selectedDataset']] = [this.xVariable, this.yVariable]
    
    // use prevData and prevColumn to generate the newData and newTableColumns
    let prevData = this.SelectedTableData.data;
    let prevColumns = this.SelectedTableData.tableColumns.slice(1).map(obj => obj.header);
    let newData = [];
    let newTotalRow = { col: 'Total'};

    let newTableColumns = [{
      field: 'col',
      header: ''
    }]
    prevData.forEach((row)=> {
      newTableColumns.push({
        field: row.col,
        header: row.col
      })
      newTotalRow[row.col] = row['Total']
    })
    newTableColumns.push({ field: 'Total', header: 'Total'})

    prevColumns.forEach(pcol => {
      if (pcol == 'Total') return;
      let newRow = {col: pcol}

      newTableColumns.forEach(ncol => {
        if (ncol.header == '') return;
        else if (ncol.header == 'Total') {
          newRow['Total'] = this.totalRow[pcol]
          return;
        }
        newRow[ncol.field] = prevData.find(aRow => aRow.col == ncol.field)[pcol];
      })
      newData.push(newRow);
    })

    newTotalRow['Total'] = this.totalRow['Total'];

    // update the table with new values
    this.SelectedTableData = {
      tableColumns: newTableColumns,
      data: newData
    }
    this.totalRow = newTotalRow;

    this.widgets['crosstab-xVariable'] = this.xVariable;
    this.widgets['crosstab-yVariable'] = this.yVariable;
  }

  /**
   * Converts the data into proportion or recounts the data
   */
  useProportionChanged() {
    if (this.widgets['crosstab-useProportion']) {
      this.convertToProportion();
    } else {
      this.updateTable();
    }
  }

  formatTableTitle() {
    if (this.xVariable != 'None' && this.yVariable != 'None') {
      return `${this.commonService.capitalize(this.xVariable.replace("_", ""))} vs ${this.commonService.capitalize(this.yVariable.replace("_",""))}`
    } else if (this.xVariable != 'None') {
      return `${this.commonService.capitalize(this.xVariable.replace("_", ""))}`
    } else if (this.yVariable != 'None') {
      return `${this.commonService.capitalize(this.yVariable.replace("_",""))}`
    } else {
      return ''
    }
  }

  /**
   * Updates the stored values and table when the widgets['crosstab-xVariable'] or widgets['crosstab-yVariable'] is changed
   */
  onDataChange() {
    this.previousVariables[this.widgets['crosstab-selectedDataset']] = [this.xVariable, this.yVariable]

    this.widgets['crosstab-xVariable'] = this.xVariable;
    this.widgets['crosstab-yVariable'] = this.yVariable;

    this.updateTable();
  }

  /**
   * Updates selectedFieldList based on currently selectedDataset
   */
  updateDataSet() {
    // updating dataset requires changing selectedFieldList. doing this leads to xVariable, yVariable getting set to None, this change leads onDataChange being called,
    // which sets the appropriate previousVariables and widgets to None. To get around this, create tempX & tempY and use them to correctly set these variables after they
    // are set to None (which we force by calling detectChanges)
    let tempX = this.previousVariables[this.widgets['crosstab-selectedDataset']][0]
    let tempY = this.previousVariables[this.widgets['crosstab-selectedDataset']][1]

    this.selectedFieldList = this.fieldListDictionary[this.widgets['crosstab-selectedDataset']];
    this.cdref.detectChanges();
      
    this.previousVariables[this.widgets['crosstab-selectedDataset']] = [tempX, tempY];

    this.widgets['crosstab-xVariable'] = this.previousVariables[this.widgets['crosstab-selectedDataset']][0]
    this.widgets['crosstab-yVariable'] = this.previousVariables[this.widgets['crosstab-selectedDataset']][1]
    this.xVariable = this.widgets['crosstab-xVariable'];
    this.yVariable = this.widgets['crosstab-yVariable'];
    
    this.updateTable();
  }

  /**
   * Updates the values for the fieldListDictionary then updates the selectedFieldList
   */
  updateFieldLists() {
    this.fieldListDictionary = {
      'nodes' : [],
      'links' : [],
      'clusters': []
    }

    this.fieldListDictionary['nodes'].push({ label: "None", value: "None"})
    this.commonService.session.data['nodeFields'].map((d) => {
      if (['seq', 'origin', '_diff', '_ambiguity', 'index', '_id'].includes(d)) return;
      this.fieldListDictionary['nodes'].push({
        label: this.commonService.capitalize(d.replace("_", "")),
        value: d
      });
    })

    this.fieldListDictionary['links'].push({ label: "None", value: "None"})
    this.commonService.session.data['linkFields'].map((d) => {
      if (['index', 'origin', 'nearest neighbor', 'nn'].includes(d)) return;
      this.fieldListDictionary['links'].push({
        label: this.commonService.capitalize(d.replace("_", "")),
        value: d
      });
    })

    this.fieldListDictionary['clusters'].push({ label: "None", value: "None"})
    this.commonService.session.data['clusterFields'].map((d) => {
      this.fieldListDictionary['clusters'].push({
        label: this.commonService.capitalize(d.replace("_", "")),
        value: d
      });
    })

    this.selectedFieldList = this.fieldListDictionary[this.widgets['crosstab-selectedDataset']];
  }

  updateNodeColors() {  }
  updateVisualization() {  }

  applyStyleFileSettings() { 
    this.widgets = (window as any).context.commonService.session.style.widgets;
    let tempX, tempY;
    if (this.widgets['crosstab-xVariable'] != undefined) {
      tempX = this.widgets['crosstab-xVariable']
    } 
    if (this.widgets['crosstab-yVariable'] != undefined) {
      tempY = this.widgets['crosstab-yVariable'];
    }

    if (this.widgets['crosstab-selectedDataset'] == undefined) {
      this.widgets['crosstab-selectedDataset'] = 'nodes';
    }
    this.selectedFieldList = this.fieldListDictionary[this.widgets['crosstab-selectedDataset']];
    this.cdref.detectChanges();
    
    // x and y variable
    if (tempX == undefined || !(this.selectedFieldList.map(x => x.value).includes(tempX))) {
      this.xVariable = 'None';
      this.widgets['crosstab-xVariable'] = 'None';
    } else {
      this.xVariable = tempX;
      this.widgets['crosstab-xVariable'] = tempX
    }

    if (tempY == undefined || !(this.selectedFieldList.map(x => x.value).includes(tempY))) {
      this.yVariable = 'None';
      this.widgets['crosstab-yVariable'] = 'None';
    } else {
      this.yVariable = tempY;
      this.widgets['crosstab-yVariable'] = tempY;
    }

    // use proportion
    if (this.widgets['crosstab-useProportion'] == undefined) {
      this.widgets['crosstab-useProportion'] = false;
    }

    this.previousVariables[this.widgets['crosstab-selectedDataset']] = [this.xVariable, this.yVariable]

    this.updateTable();
   }

  updateLinkColor() {  }
  openRefreshScreen() { }
  onRecallSession() {  }
  onLoadNewData() { 
    this.updateTable();
   }
  onFilterDataChange() { 
    this.updateTable();
   }

  /**
   * Opens the settings menu
   */
  openSettings() {
    this.settingsOpen = true;
  }

  /**
   * Opens the export menu
   */
  openExport() {
    this.exportOpen = true;
  }

  /**
   * Exports visualization as csv file or calls saveAsExcelFile to save as Excel
   */
  exportVisualization() {
    if (this.SelectedCrossTabExportFileType == 'xlsx') {
      this.saveAsExcelFile();
  } else if (this.SelectedCrossTabExportFileType == 'csv') {
      this.dataTable.exportFilename = this.SelectedCrossTabExportFilename;
      this.dataTable.value.push(this.totalRow)
      this.dataTable.exportCSV()
      this.dataTable.value.pop()
  } else if (this.SelectedCrossTabExportFileType == 'json') {
    let keys = Object.keys(this.SelectedTableData.data[0])
    let data = this.SelectedTableData.data.map(row => {
      let output = {}
      keys.forEach(key => {
        if (key == 'Total') return;
        else if (row[key] == 'null') {
          output[key] = null;
        } else {
          output[key] = row[key]
        }
      })
      return output;
    })
    let blob = new Blob([JSON.stringify(data)], { type: "application/json;charset=utf-8"});
    saveAs(blob, this.SelectedCrossTabExportFilename +'.json');
  } else {
    let columns = ['col']
    this.SelectedTableData.tableColumns.forEach(col => {
      if (col.header != '') {
        columns.push(col.header)
      }
    })

    let dataBody = [this.SelectedTableData.tableColumns.map(col => {
      if (col.header == '') return this.commonService.capitalize(this.yVariable)      
      return this.commonService.capitalize(col.header);
    })].concat(this.SelectedTableData.data.map(formatData)).concat([formatData(this.totalRow)]);
    
    function formatData(dataRow) {
      return columns.map(header => dataRow[header])
    }

    pdfMake.vfs = pdfFonts.pdfMake.vfs;
      pdfMake.createPdf({
        content: [ 
          { image: this.commonService.watermark },
          { 
            text: "Cluster Crosstab Snapshot:",
            style: "header",
            alignment: "center"
          },
          {
            text: `${this.commonService.capitalize(this.xVariable)} vs ${this.commonService.capitalize(this.yVariable)}`,
            style: "fontSize: 18",
            alignment: "center"
          },
          {
            style: "paddedTable",
            table: {
              headerRows: 1,
              widths: this.SelectedTableData.tableColumns.map(col => "*"),
              body: dataBody,
            }
          }
        ],
        footer: function(currentPage, pageCount) {
          return [
            {
              text: `Page ${currentPage.toString()} of ${pageCount}`,
              alignment: "center"
            }
          ];
        },
        styles: {
          header: {
            fontSize: 22,
            bold: true
          },
          paddedTable: {
            margin: [10, 10, 10, 10]
          }
        }
      }).download(this.SelectedCrossTabExportFilename + '.pdf');
    }

  this.exportOpen = !this.exportOpen;
  }

  /**
   * Exports the data as an excel file
   */
  saveAsExcelFile() {
    import("xlsx").then(xlsx => {
      this.dataTable.value.push(this.totalRow);
      let headers = [];
      this.SelectedTableData.tableColumns.forEach(item => headers.push(item.field))
      let worksheet = xlsx.utils.json_to_sheet(this.dataTable.value, { header: headers}) ; 
      const workbook = { Sheets: { 'data': worksheet }, SheetNames: ['data'] }
      const excelBuffer: any = xlsx.write(workbook, { bookType: 'xlsx', type: 'array' });
      const EXCEL_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8';
      const data: Blob = new Blob([excelBuffer], { type: EXCEL_TYPE });
      saveAs(data, this.SelectedCrossTabExportFilename + '.xlsx');
      this.dataTable.value.pop()
  })
}

  /**
   * Resizes the component as need based on how the goldenlayout dashboard is resized
   */
  goldenLayoutComponentResize() {
    let pFooterHeight = this.selectedSize == 'p-datatable-sm' ? 41 : this.selectedSize == 'p-datatable-lg' ? 65 : 57;
    console.log('abc', pFooterHeight);
    this.scrollHeight = ($('crosstabcomponent').height() - 70 - 10 - pFooterHeight) + 'px';
    let width = ($('crosstabcomponent').width() - 23) + 'px';
    this.tableStyle = {
        'width' : width,
        'display': 'block'
    }
  }

  onTableSizeChange() {
    let pFooterHeight = this.selectedSize == 'p-datatable-sm' ? 41 : this.selectedSize == 'p-datatable-lg' ? 65 : 57;
    console.log('abc', pFooterHeight);
    this.scrollHeight = ($('crosstabcomponent').height() - 70 - 10 - pFooterHeight) + 'px';
  }

}

export namespace CrosstabComponent {
  export const componentTypeName = 'Crosstab';
}

interface TableData {
  data: any[],
  tableColumns: any[],
}