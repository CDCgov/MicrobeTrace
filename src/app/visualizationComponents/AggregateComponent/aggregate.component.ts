import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, Inject, Injector, OnDestroy, OnInit, Renderer2, ViewChild } from '@angular/core';
import { EventManager } from '@angular/platform-browser';
import { BaseComponentDirective } from '@app/base-component.directive';
import { CommonService } from '@app/contactTraceCommonServices/common.service';
import { MicobeTraceNextPluginEvents } from '@app/helperClasses/interfaces';
import { ComponentContainer } from 'golden-layout';
import { OrderList } from 'primeng/orderlist';
import { MicrobeTraceNextVisuals } from '@app/microbe-trace-next-plugin-visuals';

import * as Papa from 'papaparse';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
//import pdfMake from 'pdfmake/build/pdfmake.js';
//import pdfFonts from 'pdfmake/build/vfs_fonts.js';
import { GoogleTagManagerService } from 'angular-google-tag-manager';
import { CommonStoreService } from '@app/contactTraceCommonServices/common-store.services';
import { sanitizeExportRows } from '@app/contactTraceCommonServices/export-sanitization';
import { Subject, takeUntil } from 'rxjs';

@Component({
    selector: 'AggregateComponent',
    templateUrl: './aggregate.component.html',
    styleUrls: ['./aggregate.component.scss'],
    standalone: false
})
export class AggregateComponent extends BaseComponentDirective implements OnInit, AfterViewInit, MicobeTraceNextPluginEvents, OnDestroy {

  @ViewChild('orderList') orderList: OrderList;
  
  visuals: MicrobeTraceNextVisuals;
  widgets: any;

  SelectedDataTables: TableData[] = [];
  fieldOptions =  [
    {
        label: 'Node',
        value: 'nodes',
        items: []
    },
    {
        label: 'Link',
        value: 'links',
        items: []
    },
    {
        label: 'Cluster',
        value: 'clusters',
        items: []
    }
];

  SelectedDataFields = ['Node-cluster']
  
  viewActive = true;
  settingsOpen = true;
  exportOpen = false;
  SelectedAggregateExportFilename = '';
  AggregateExportFileTypeList = [
    { label: 'xlsx', value: 'xlsx' },
    { label: 'csv.zip', value: 'csv.zip' },
    { label: 'json', value: 'json'},
    { label: 'pdf', value: 'pdf'}
  ]
  SelectedAggregateExportFileType = 'pdf';

  viewHeight: number;
  tableStyle;

  private destroy$ = new Subject<void>();

  constructor(injector: Injector,
    private renderer: Renderer2,
    private elem: ElementRef,
    private eventManager: EventManager,
    public commonService: CommonService,
    @Inject(BaseComponentDirective.GoldenLayoutContainerInjectionToken) private container: ComponentContainer, 
    elRef: ElementRef,
    private cdref: ChangeDetectorRef,
    private store: CommonStoreService,
    private gtmService: GoogleTagManagerService) {

      super(elRef.nativeElement);

      this.visuals = commonService.visuals;
      this.visuals.aggregate = this;
      this.widgets = this.commonService.session.style.widgets;

      this.updateFieldOptions();
  }

  ngOnInit(): void {

    this.gtmService.pushTag({
            event: "page_view",
            page_location: "/aggregate",
            page_title: "Aggregate View"
        });

    this.SelectedDataFields.forEach((field, index) => {
      this.SelectedDataTables.push({label: '', data: [], tableColumns: []})
      this.updateTable(index);
    })

    this.updateViewHeight();
    this.updateTableColWidth();

    this.container.on('resize', () => { 
      this.updateViewHeight();
      this.updateTableColWidth();
      this.cdref.detectChanges();
    })
    this.container.on('hide', () => { 
      this.viewActive = false; 
      this.cdref.detectChanges();
    })
    this.container.on('show', () => { 
      this.viewActive = true; 
      this.refreshTables();
      this.cdref.detectChanges();
    })

    this.store.clusterUpdate$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      if (this.viewActive) {
        this.refreshTables();
      }
    })

    this.store.networkUpdated$.pipe(takeUntil(this.destroy$)).subscribe((networkUpdated) => {
      if (this.viewActive && networkUpdated) {
        this.refreshTables();
        this.store.setNetworkUpdated(false);
      }
    })
  }

  ngAfterViewInit() {
    this.updateTableColWidth()
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private normalizeAggregateGroupValue(value: unknown): string {
    if (value === null || value === undefined) {
      return 'null';
    }

    if (typeof value === 'string') {
      const trimmedValue = value.trim();
      return trimmedValue === '' ? 'null' : trimmedValue;
    }

    return String(value);
  }

  private shouldFormatAggregateGroupValue(dataset: string, field: string): boolean {
    const normalizedDataset = String(dataset || '').toLowerCase();
    const normalizedField = String(field || '').toLowerCase();

    return (normalizedDataset === 'link' && normalizedField === 'distance')
      || (normalizedDataset === 'cluster' && normalizedField === 'mean_genetic_distance');
  }

  private formatAggregateGroupValue(dataset: string, field: string, value: string): string {
    if (!this.shouldFormatAggregateGroupValue(dataset, field)) {
      return value;
    }

    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return value;
    }

    const displayField = String(dataset || '').toLowerCase() === 'cluster'
      ? 'mean_genetic_distance'
      : 'distance';

    return this.commonService.formatDisplayedDistanceValue(numericValue, displayField);
  }

  private refreshTables() {
    if (!Array.isArray(this.SelectedDataFields) || this.SelectedDataFields.length === 0) {
      this.SelectedDataFields = ['Node-cluster'];
    }

    this.SelectedDataFields.forEach((_, index) => this.updateTable(index));
    this.cdref.detectChanges();
    setTimeout(() => this.updateTableColWidth(), 0);
  }

  updateTable(i) {
    if (!this.SelectedDataFields[i]) {
      this.SelectedDataFields[i] = 'Node-cluster';
    }

    let fullField = this.SelectedDataFields[i].split('-')
    let dataset = fullField[0];
    let field = fullField.slice(1).join('-');

    let tableColumns;
    let total = 0;
    let rawdata;

    if (dataset == 'Node') {
      rawdata = this.commonService.getVisibleNodesIgnoringTimeline();
      tableColumns = [{field:'groupName', header: this.commonService.capitalize(field)}, {field:'count', header:'Number of Nodes'}, {field:'percent', header:'Percent of Total Nodes'}];
    } else if (dataset == 'Link') {
      rawdata = this.commonService.getVisibleLinksIgnoringTimeline();
      tableColumns = [{field:'groupName', header: this.commonService.capitalize(field)}, {field:'count', header:'Number of Links'}, {field:'percent', header:'Percent of Total Links'}];
    } else {
      rawdata = this.commonService.getVisibleClustersIgnoringTimeline();
      tableColumns = [{field:'groupName', header: this.commonService.capitalize(field)}, {field:'count', header:'Number of Clusters'}, {field:'percent', header:'Percent of Total Clusters'}];
    }   
    
    const groupedRows = new Map<string, { groupName: string; count: number; percent?: number }>();

    rawdata.forEach(row => {
      const groupName = this.normalizeAggregateGroupValue(row?.[field]);
      const match = groupedRows.get(groupName);

      if (match) {
        match['count']++;
      } else {
        groupedRows.set(groupName, { groupName, count: 1 });
      }
      total++;
    });

    const data = Array.from(groupedRows.values());

    data.forEach(row => {
      row['percent'] = total === 0 ? 0 : (row['count']*100/total)
      row['groupName'] = this.formatAggregateGroupValue(dataset, field, row['groupName']);
    })
    
    this.SelectedDataTables[i] = {
      label: dataset+'-'+field,
      data: data,
      tableColumns: tableColumns,
    };
  }

  updateViewHeight() {
    this.viewHeight = $(".aggregate-wrapper").parent().height()-70
  }

  updateTableColWidth() {
    let width = ($('#tablesContainer').width() - 40);
    width = width > 700 ? width*.7 : width;
    this.tableStyle = {
        'width' : width+'px',
        'display': 'block'
    }
    $('#tablesContainer th').width(width/3);
  }


  addTable() {
    this.SelectedDataFields = [...this.SelectedDataFields, 'Node-selected']
    this.SelectedDataTables.push({label: 'Node-selected', data: [], tableColumns: []})

    this.updateTable(this.SelectedDataTables.length-1)
    setTimeout(() => this.updateTableColWidth(), 0);
  }
  deleteTable(i) {
    console.log(`deleting table ${i}`);
    this.SelectedDataFields = this.SelectedDataFields.filter((_, loc) => loc != i)
    this.SelectedDataTables = this.SelectedDataTables.filter((_, loc) => loc != i)
  }

  updateFieldOptions() {
    this.commonService.session.data['nodeFields'].map((d) => {
      if (['seq', 'origin', '_diff', '_ambiguity', 'index', '_id'].includes(d)) return;
      this.fieldOptions[0]['items'].push({
        short_label: this.commonService.capitalize(d.replace("_", "")),
        label : `Node-${this.commonService.capitalize(d.replace("_", ""))}`,
        value: `Node-${d}`
      });
    })

    this.commonService.session.data['linkFields'].map((d) => {
      if (['index', 'origin', 'nearest neighbor', 'nn'].includes(d)) return;
      this.fieldOptions[1]['items'].push({
        short_label: this.commonService.capitalize(d.replace("_", "")),
        label : `Link-${this.commonService.capitalize(d.replace("_", ""))}`,
        value: `Link-${d}`
      });
    })

    this.commonService.session.data['clusterFields'].map((d) => {
      this.fieldOptions[2]['items'].push({
        short_label: this.commonService.capitalize(d.replace("_", "")),
        label : `Cluster-${this.commonService.capitalize(d.replace("_", ""))}`,
        value: `Cluster-${d}`
      });
    })

  }

  formatTableTitle(inputString) {
    if (typeof inputString !== 'string' || !inputString.length) {
      return '';
    }

    let fullField = inputString.split('-')
    //let datasetName = this.commonService.capitalize(fullField[0]);
    let colGroupName = this.commonService.capitalize(fullField.slice(1).join('-'));
    return colGroupName;
  }

  updateNodeColors() {}
  updateLinkColor() {}
  updateVisualization() {
    this.refreshTables();
  }
  refreshDistanceDisplayFormat() {
    this.refreshTables();
  }
  applyStyleFileSettings() {}
  openRefreshScreen() {}
  onRecallSession() {}
  onLoadNewData() {
    this.refreshTables();
  }
  onFilterDataChange() {
    this.refreshTables();
  }

  openSettings() {
    console.log("open settings pushed");
    this.settingsOpen = true;
  }

  openExport() {
    console.log("open export pushed")
    this.exportOpen = true;
  }

  async exportVisualization() {
    console.log(this.SelectedAggregateExportFilename + '.' + this.SelectedAggregateExportFileType);
    if (this.SelectedAggregateExportFileType == 'csv.zip') {
      let zip = new JSZip();
      this.SelectedDataTables.forEach(table => {
        let tmpData = sanitizeExportRows(table.data.map(item => {
          let colGroupName = table.label.split('-').slice(1).join('-')
          return { [colGroupName]: item.groupName, 'count': item.count, 'percent': item.percent+'%'}
        }))
        
        zip.file(table.label + '.csv', Papa.unparse(tmpData))
        console.log(Papa.unparse(tmpData));
      })
      zip.generateAsync({type: 'blob'}).then(content => saveAs(content, this.SelectedAggregateExportFilename + '.zip'))
    } else if (this.SelectedAggregateExportFileType == 'xlsx') {
      let wb = XLSX.utils.book_new();
      this.SelectedDataTables.forEach(table => {
        let tmpData = sanitizeExportRows(table.data.map(item => {
          let colGroupName = table.label.split('-').slice(1).join('-');
          return { [colGroupName]: item.groupName, 'count': item.count, 'percent': item.percent+'%'}
        }))

        let ws = XLSX.utils.json_to_sheet(tmpData);
        XLSX.utils.book_append_sheet(wb, ws, table.label)
      })
      XLSX.writeFile(wb, this.SelectedAggregateExportFilename+'.xlsx')
    
    } else if (this.SelectedAggregateExportFileType == 'json') {
      let outputData = [];
      this.SelectedDataTables.forEach(table => {
        let fullField = table.label.split('-')
        let datasetName = fullField[0];
        let colGroupName = fullField.slice(1).join('-');

        let tmpData = table.data.map(item => {
          return { [colGroupName]: item.groupName, 'n': item.count, 'percent': item.percent+'%'}
        })
        outputData.push({"dataset": datasetName.toLowerCase(), "column": colGroupName, data: tmpData})
      })
      let blob = new Blob([JSON.stringify(outputData)], { type: "application/json;charset=utf-8"});
      saveAs(blob, this.SelectedAggregateExportFilename+'.json');
    } else if ( this.SelectedAggregateExportFileType == 'pdf') {

      try {
        const { default: pdfMake } = await import('pdfmake/build/pdfmake.js');
        const { default: pdfFonts } = await import('pdfmake/build/vfs_fonts.js');
        pdfMake.vfs = pdfFonts;

        const documentDefinition = {
          content: [
            { image: this.commonService.watermark },
            { 
              text: "Cluster Aggregation Snapshot",
              style: "header",
              alignment: "center"
            },
            ...this.SelectedDataTables.map(table => {
              let fullField = table.label.split('-')
              let datasetName = fullField[0];
              let colGroupName = fullField.slice(1).join('-');

              let tmpData = table.data.map(item => {
                let colGroupName = table.label.split('-').slice(1).join('-');
                return [item.groupName, item.count, `${item.percent.toFixed(2)}%`];
              });

              return {
                style: "paddedTable",
                table: {
                  headerRow: 1,
                  widths: ["*", "*", "*"],
                  body: [
                    [
                      `${this.commonService.capitalize(colGroupName)}`,
                      `Number of ${datasetName}s`,
                      `Percent of Total ${datasetName}s`
                    ],
                    ...tmpData
                  ]
                }
              }
            })
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
        };

        pdfMake.createPdf(documentDefinition).download(`${this.SelectedAggregateExportFilename}.pdf`);
        
      } catch (error) {
        console.error("Failed to load pdfmake modules", error);
        // Optionally, notify the user about the failure using a toast or alert
      }

    }
  }

  reordered(e) {
    console.log('reordered ', this.SelectedDataFields, e)
    let updatedTableOrder = [];
    this.SelectedDataFields.forEach((field) => {
      updatedTableOrder.push(this.SelectedDataTables.find((table) => {
        if (table.label == field) {
          return true;
        }
      }))
    })
    this.SelectedDataTables = updatedTableOrder;
  }

  updateDataField(i,e) {
    console.log(`data field ${i} changed\nBefore: ${this.SelectedDataFields[0]}, ${this.SelectedDataFields[1]}, ${this.SelectedDataFields[2]}`);
    console.debug('Aggregate data field change payload:', e);
    this.SelectedDataFields[i] = e.value;
    console.log(`After: ${this.SelectedDataFields[0]}, ${this.SelectedDataFields[1]}, ${this.SelectedDataFields[2]}`);
    this.updateTable(i); 
    setTimeout(() => this.updateTableColWidth(), 0);
  }
}

export namespace AggregateComponent {
  export const componentTypeName = 'Aggregate';
}

interface TableData {
  label: string,
  data: any[],
  tableColumns: any[],
}
