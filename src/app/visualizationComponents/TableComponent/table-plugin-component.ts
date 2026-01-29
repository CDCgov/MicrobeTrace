import {
    Injector,
    Component,
    Output,
    OnChanges,
    SimpleChange,
    EventEmitter,
    OnInit,
    ViewChild,
    ChangeDetectorRef,
    OnDestroy,
    ElementRef,
    Inject
  } from '@angular/core';
  import { AppComponentBase } from '@shared/common/app-component-base';
  import { EventManager } from '@angular/platform-browser';
  import { CommonService } from '../../contactTraceCommonServices/common.service';
  import { Table } from 'primeng/table';
  import { MicobeTraceNextPluginEvents } from '../../helperClasses/interfaces';
  import { MicrobeTraceNextVisuals } from '../../microbe-trace-next-plugin-visuals';
  import { SelectItem } from 'primeng/api';
  import { BaseComponentDirective } from '@app/base-component.directive';
  import { ComponentContainer } from 'golden-layout';
  import * as saveAs from 'file-saver';
  import { GoogleTagManagerService } from 'angular-google-tag-manager';
  import { Subject, takeUntil } from 'rxjs';
import { CommonStoreService } from '@app/contactTraceCommonServices/common-store.services';
  
  /**
   * @title Complex Example
   */
  @Component({
    selector: 'TableComponent',
    templateUrl: './table-plugin-component.html',
    styleUrls: ['./table-plugin-component.less'],
    standalone: false
})
  export class TableComponent
    extends BaseComponentDirective
    implements OnInit, OnDestroy, MicobeTraceNextPluginEvents {
    @Output() DisplayGlobalSettingsDialogEvent = new EventEmitter();
    private destroy$ = new Subject<void>();
  
    viewActive = true;
    SelectedTableExportFilenameVariable = '';
  
    TableExportFileTypeList: any = [
      { label: 'xlsx', value: 'xlsx' },
      { label: 'csv', value: 'csv' }
    ];
    exportColumnOptions: any = [
      { label: 'All', value: true },
      { label: 'Current', value: false }
    ];
    exportAllColumns = false;
  
    dataSetView: SelectItem[];
    dataSetViewSelected: string;
  
    SelectedTableExportFileTypeListVariable = 'csv';
  
    SelectedTextSizeVariable: any = 14;
  
    ShowTableExportPane = false;
    ShowTableSettingsPane = false;
    IsDataAvailable = false;
    table: any;
    meta: any = ['selected', 'visible'];
    TableColumns: any[] = [];
    SelectableTableColumns: any[] = [];
    AvailableColumns: any[] = [];
    TableDatas: TableData[] = [];
    SelectedTableData: TableData;
    TableDataSelection: any[] = [];
    TableType: 'node' | 'link' | 'cluster' = 'node';
    filterTypes: FilterType[] = [
      { label: 'Contains', value: 'contains' },
      { label: '=', value: 'equals' },
      { label: '!=', value: 'notEquals' },
      { label: 'Starts With', value: 'startsWith' },
      { label: 'Ends With', value: 'endsWith' },
      { label: 'In', value: 'in' },
      { label: '<', value: 'lt' },
      { label: '<=', value: 'lte' },
      { label: '>', value: 'gt' },
      { label: '>=', value: 'gte' }
    ];
  
    selectedSize = '';
    sizes = [
      { name: 'Small', class: 'p-datatable-sm' },
      { name: 'Normal', class: '' },
      { name: 'Large', class: 'p-datatable-lg' }
    ];
  
    scrollHeight: string;
    tableStyle;
    selectedRows = 10;
  
    private visuals: MicrobeTraceNextVisuals;
  
    /**
     * Unique key written to every row once, capturing its first‑seen position.
     * This is never exposed in the column list.
     */
    private readonly _original_index_key = '_original_index';
  
    @ViewChild('dt') dataTable: Table;
  
    constructor(
      injector: Injector,
      @Inject(BaseComponentDirective.GoldenLayoutContainerInjectionToken)
      private container: ComponentContainer,
      elRef: ElementRef,
      private cdref: ChangeDetectorRef,
      private eventManager: EventManager,
      private commonService: CommonService,
      private store: CommonStoreService,
      private gtmService: GoogleTagManagerService
    ) {
      super(elRef.nativeElement);
  
      this.visuals = commonService.visuals;
      this.commonService.visuals.tableComp = this;
    }
  
    ngOnInit() {
      this.gtmService.pushTag({
        event: 'page_view',
        page_location: '/table',
        page_title: 'Table View'
      });
      this.dataSetView = [];
      this.dataSetView.push({ label: 'Nodes', value: 'Node' });
      this.dataSetView.push({ label: 'Links', value: 'Link' });
      this.dataSetView.push({ label: 'Clusters', value: 'Cluster' });
  
      this.dataSetViewSelected = 'Node';
  
      this.IsDataAvailable =
        this.commonService.session.data.nodes.length == 0 ? false : true;
  
      if (this.IsDataAvailable) {
        if (!this.SelectedTableData || this.SelectedTableData.tableColumns.length == 0) {
          this.createTable(this.dataSetViewSelected);
        }
      }
  
      let that = this;
  
      $(document).on('node-selected', function () {
        if (that.viewActive) {
          that.visuals.tableComp.setSelectedNodes();
        }
      });
  
      window.addEventListener('node-selected', () => {
        if (
          !this.visuals.microbeTrace.homepageTabs.find(
            (x) => x.isActive && x.label === 'Table'
          )
        ) {
          this.visuals.tableComp.setSelectedNodes();
        }
      });
  
      // offsets: 70 table-wrapper padding-top, 60 p-paginator, 10 table-wrapper padding-bottom
      this.scrollHeight =
        ($('tableComponent').height() - 70 - 60 - 10) + 'px';
      let width = $('tableComponent').width() - 23 + 'px';
      this.tableStyle = {
        'max-width': width,
        display: 'block'
      };
  
      this.container.on('resize', () => {
        this.goldenLayoutComponentResize();
      });
      this.container.on('hide', () => {
        this.viewActive = false;
        this.cdref.detectChanges();
      });
      this.container.on('show', () => {
        this.viewActive = true;
        this.setSelectedNodes();
        this.cdref.detectChanges();
      });

    this.store.clusterUpdate$.pipe(takeUntil(this.destroy$)).subscribe(() => {
        this.createTable(this.dataSetViewSelected);
    })
    }
  
    /**
     * Exports table
     *
     * For exporting as excel file it calls this.saveAsExcelFile();
     *
     * For exporting as a csv it uses exportCSV() which is built into primeNG table object
     */
    exportVisualization() {
      if (this.SelectedTableExportFileTypeListVariable == 'xlsx') {
        this.saveAsExcelFile();
      } else {
        this.dataTable.exportFilename = this.SelectedTableExportFilenameVariable;
  
        if (this.exportAllColumns) {
          let temp = this.SelectedTableData.tableColumns;
          let temp2 = [];
          this.SelectedTableData.availableColumns.forEach((column) =>
            temp2.push(column.value)
          );
          this.dataTable.columns = temp2;
          this.dataTable.exportCSV();
          this.dataTable.columns = temp;
        } else {
          this.dataTable.exportCSV();
        }
      }
  
      this.ShowTableExportPane = !this.ShowTableExportPane;
    }
  
    /**
     * Allows users to export the table as an excel file
     * @param fileName optional if not given will use this.SelectedtableExportFilenameVariable
     */
    saveAsExcelFile(fileName?: string): void {
      if (fileName == undefined) {
        fileName = this.SelectedTableExportFilenameVariable;
      }
      import('xlsx').then((xlsx) => {
        // if a filtered is applied use filteredValue else use all values
        let rowData = this.dataTable.filteredValue || this.dataTable.value;
        if (this.exportAllColumns) {
          // change name of data fields to header to be consistent with the other exports on this component
          rowData = rowData.map((row) => {
            let output = {};
            this.SelectedTableData.availableColumns.forEach(
              (key) => (output[key.value.header] = row[key.value.field])
            );
            return output;
          });
        } else {
          // gets only the current/visible columns for export and also changes data field name to the header name
          rowData = rowData.map((row) => {
            let output = {};
            this.SelectedTableData.tableColumns.forEach(
              (key) => (output[key.header] = row[key.field])
            );
            return output;
          });
        }
  
        let worksheet = xlsx.utils.json_to_sheet(rowData);
        const workbook = { Sheets: { data: worksheet }, SheetNames: ['data'] };
        const excelBuffer: any = xlsx.write(workbook, {
          bookType: 'xlsx',
          type: 'array'
        });
        const EXCEL_TYPE =
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8';
        const EXCEL_EXTENSION = '.xlsx';
        const data: Blob = new Blob([excelBuffer], { type: EXCEL_TYPE });
        saveAs(data, fileName + EXCEL_EXTENSION);
      });
    }
  
    /**
     * Called first when filter is applied it applys filter to this.dataTable to update this.dataTable.filterValue
     * @param col
     */
    onTableFilter(col) {
      this.dataTable.filter(col.filterValue, col.field, col.filterType);
    }
  
    /**
     * Called second when a filter is applied, it updates values sotred in commonService.session.data and this.selectedRows if needed
     * @param event
     */
    onFilter(event) {
      let filteredValues = [];
      switch (this.visuals.tableComp.TableType) {
        case 'node':
          filteredValues =
            this.visuals.tableComp.commonService.session.data.nodes.filter((x) =>
              event.filteredValue.find((y) => y.index === x.index)
            );
          break;
        case 'link':
          filteredValues =
            this.visuals.tableComp.commonService.session.data.links.filter((x) =>
              event.filteredValue.find((y) => y.index === x.index)
            );
          break;
        case 'cluster':
          filteredValues =
            this.visuals.tableComp.commonService.session.data.clusters.filter(
              (x) => event.filteredValue.find((y) => y.id === x.id)
            );
          break;
      }
  
      this.visuals.tableComp.SelectedTableData.filter = event.filters;
  
      // updates number of rows when filter is changed (without there is a visual bug when removing a filter)
      if ($('.p-paginator-rpp-options span').text() == 'All') {
        this.selectedRows = event.filteredValue.length;
      }
    }
  
    // XXXXX changing font size in settings pane currently calls this function
    onDataChange(event) {}
  
    onFilterDataChange() {
      //Nothing to do here
    }
  
    /**
     * Function is called when a user selects a row by clicking on it.
     * It calls nodeSelect(event, true), which updates commonService.session.data.nodes/nodeFilteredValues
     * to be selected for the row/node and also emits a 'node-selected' event
     */
    onRowSelect(event) {
      this.nodeSelect(event, true);
    }
  
    /**
     * Function is called when a user unselects a row.
     * It calls nodeSelect(event, false), which updates commonService.session.data.nodes/nodeFilteredValues
     * to be selected for the row/node and also emits a 'node-selected' event
     */
    onRowUnselect(event) {
      this.nodeSelect(event, false);
    }
  
    /**
     * Called when a node is selected/unselected by clicking on a row. This function updates
     * commonService.session.data.nodes/nodeFilteredValues to be selected for the row/node and also emits a 'node-selected' event
     */
    nodeSelect(event: any, isSelect: boolean) {
      if (event.data === undefined) return;
  
      if (this.visuals.tableComp.TableType === 'node') {
        this.visuals.tableComp.commonService.session.data.nodes
          .filter((x) => x.index === event.data.index)
          .forEach((x) => (x.selected = isSelect));
        this.visuals.tableComp.commonService.session.data.nodeFilteredValues
          .filter((x) => x.index === event.data.index)
          .forEach((x) => (x.selected = isSelect));
      }
  
      $(document).trigger('node-selected');
    }
  
    /**
     * Update variables (such as TableType, selectedTableData) needed to update the contents of the table
     * @param type The type of data (node, link, cluster) to create table with
     */
    createTable(type: any = 'node') {
      type = type.toLowerCase();
      this.visuals.tableComp.TableType = type;
  
      // checks if data for tableData exists in TableDatas, if not, creates a new TableData object and adds it to TableDatas
      let tableData: TableData | undefined = this.TableDatas.find(
        (x) => x.tableType === type
      );
      const isNewTableData: boolean = tableData == undefined;
      if (isNewTableData) {
        tableData = {
          tableType: type,
          data: [],
          dataSelection: [],
          tableColumns: this.visuals.tableComp.commonService.session.data[
            type + 'TableColumns'
          ],
          availableColumns: [],
          selectedTableColumns: [],
          filter: this.visuals.tableComp.commonService.session.data[type + 'Filter']
        };
  
        this.TableDatas.push(tableData);
      }
  
      this.visuals.tableComp.TableColumns = [];
  
      if (this.dataTable) {
        this.dataTable.reset();
        this.dataTable.filters = tableData.filter;
      }
  
      this.visuals.tableComp.commonService.session.data[type + 'Fields'].map(
        (d, i) => {
          if (this.visuals.tableComp.meta.includes(d)) return;
  
          let filterValue: string = '';
          if (tableData.filter) {
            const foundFilterItem = tableData.filter[d];
            if (foundFilterItem) {
              filterValue = foundFilterItem.value;
            }
          }
  
          const column = {
            field: d,
            header:
              d == 'nn'
                ? 'Nearest Neighbor'
                : this.visuals.tableComp.capitalize(d.replace('_', '')),
            filterValue: filterValue,
            filterType: 'contains'
          };
  
          const foundAvailableColumn = tableData.availableColumns.find(
            (x) => x.label === column.header
          );
  
          if (foundAvailableColumn) {
            foundAvailableColumn.filterValue = column.filterValue;
          } else {
            tableData.availableColumns.push({
              label: column.header,
              value: column,
              disabled: column.field === 'index'
            });
          }
        }
      );
  
      if (!tableData.tableColumns.length) {
        tableData.tableColumns = tableData.availableColumns
          .filter((curVal, index) => index <= 5)
          .map((x) => x.value);
      }
  
      tableData.tableColumns.forEach((x) => {
        const c = tableData.availableColumns.find(
          (y) => y.value.header === x.header
        ).value.filterValue;
        x.filterValue = c;
      });
  
      tableData.data = [];
      let typeData = type + 's';
      this.visuals.tableComp.commonService.session.data[typeData].map((d, i) => {
        if (this.visuals.tableComp.meta.includes(d)) return;
  
        let nrow: any = {};
        tableData.availableColumns.map((e, n) => {
          const field = e.value.field;
  
          let stringVal: String = d[field];
  
          if (stringVal === undefined || stringVal === null) {
            nrow[field] = '';
          } else {
            nrow[field] =
              stringVal.toString().indexOf(',') > -1
                ? stringVal.toString().split(',', 100).length > 1
                  ? stringVal.toString().split(',', 100).join('\n')
                  : d[field]
                : d[field];
          }
        });
  
        /* -----------------------------------------------------------------
         * Preserve the row's first‑seen position so we can restore it later.
         * This key is **never** shown as a column.
         * -----------------------------------------------------------------*/
        nrow[this._original_index_key] = tableData.data.length;
        tableData.data.push(nrow);
      });
  
      const foundTableData = this.TableDatas.find((x) => x.tableType === type);
  
      if (foundTableData) {
        this.SelectedTableData = foundTableData;
      }
  
      //set selected nodes
      this.visuals.tableComp.setSelectedNodes();
    }
  
    /**
     * If this.TableType == 'node' update the node TableData.dataSelection to the nodes that are selected
     * in commonService.session.data.nodes AND reorder rows so that selected nodes rise to the top.
     *
     * The original visual order is always preserved via a hidden `_original_index` key added
     * once when the table is first built. As nodes are deselected, their rows drop back into
     * their exact original positions without disturbing user‑applied column sorting.
     */
    setSelectedNodes() {
      if (this.visuals.tableComp.TableType !== 'node') return;
  
      const foundTableData = this.TableDatas.find((x) => x.tableType === 'node');
      if (!foundTableData) return;
  
      /* current selection based on shared session state */
      const selected_nodes =
        this.visuals.tableComp.commonService.session.data.nodes.filter(
          (x) => x.selected
        );
  
      /* update highlighted selection in PrimeNG table */
      foundTableData.dataSelection = this.SelectedTableData.data.filter((row) =>
        selected_nodes.find((y) => y.index == row.index)
      );
  
      /* ---------------------------------------------------------------
       *  Reorder:  selected rows first (keep their mutual order),
       *            then un‑selected rows in their stored original order.
       * -------------------------------------------------------------- */
      const selected_rows = [];
      const unselected_rows = [];
  
      this.SelectedTableData.data.forEach((row) => {
        if (selected_nodes.find((y) => y.index == row.index)) {
          selected_rows.push(row);
        } else {
          unselected_rows.push(row);
        }
      });
  
      const order_by_original = (a, b) =>
        a[this._original_index_key] - b[this._original_index_key];
  
      selected_rows.sort(order_by_original);
      unselected_rows.sort(order_by_original);
  
      const new_data = [...selected_rows, ...unselected_rows];
  
      /* only mutate and trigger change detection if order actually changed */
      const order_changed =
        new_data.some(
          (row, idx) => row !== this.SelectedTableData.data[idx]
        );
  
      if (order_changed) {
        this.SelectedTableData.data = new_data;
  
        /* PrimeNG v14+: assign to dataTable.value to refresh viewport */
        if (this.dataTable) {
          this.dataTable.value = new_data;
        }
  
        this.cdref.detectChanges();
      }
  
      /* auto‑scroll to the first selected row for convenience */
      if (selected_rows.length && this.dataTable) {
        const first_index = 0; // by construction, first row is selected
        try {
          this.dataTable.scrollToVirtualIndex(first_index);
        } catch {
          this.dataTable.scrollTo({ top: first_index * 25 });
        }
      }
    }
  
    /**
     * @param s string
     * @returns s but with first letter capitatlized, if s is not string type returns empty string
     */
    capitalize(s): string {
      if (typeof s !== 'string') return '';
      return s.charAt(0).toUpperCase() + s.slice(1);
    }
  
    // XXXXX need to revisit for changing text size in table; currently unable to change size of text and changing the setting calls onDataChange()
    resetTextsize() {
      let s: any = $('#table-font-size').val();
      $('#table').css({
        'font-size': s + 'px',
        'line-height': s / 10
      });
    }
  
    reorderColumns() {
      let temp = this.SelectedTableData.tableColumns[2];
      this.SelectedTableData.tableColumns[2] =
        this.SelectedTableData.tableColumns[3];
      this.SelectedTableData.tableColumns[3] = temp;
    }
  
    /**
     * Opens settings pane for table component
     */
    openSettings() {
      this.visuals.tableComp.ShowTableSettingsPane =
        !this.visuals.tableComp.ShowTableSettingsPane;
    }
  
    /**
     * Opens export pane for table component
     */
    openExport() {
      this.visuals.tableComp.ShowTableExportPane =
        !this.visuals.tableComp.ShowTableExportPane;
    }
  
    openCenter() {}
  
    openRefreshScreen() {}
  
    /**
     * This function is called when the type of data to display in the table is changed (Nodes, Links, Cluster)
     * @param e event
     */
    openSelectDataSetScreen(e: any) {
      this.visuals.tableComp.createTable(e.value);
      // after changing table type sometimes there is a visual bug that the following code fixes
      if ($('.p-paginator-rpp-options span').text() == 'All') {
        this.selectedRows = this.SelectedTableData.data.length;
      }
    }
  
    onLoadNewData() {
      this.createTable(this.visuals.microbeTrace.dataSetViewSelected);
    }
  
    updateNodeColors() {
      //Not Relevant
    }
    updateVisualization() {
      //Not Relevant
    }
  
    applyStyleFileSettings() {
      //this.widgets = (window as any).context.commonService.session.style.widgets;
      //this.loadSettings();
    }
  
    updateLinkColor() {
      //Not Relevant
    }
  
    onRecallSession() {}
  
    goldenLayoutComponentResize() {
      this.scrollHeight =
        ($('tableComponent').height() - 70 - 60 - 10) + 'px';
      let width = $('tableComponent').width() - 23 + 'px';
      this.tableStyle = {
        width: width,
        display: 'block'
      };
    }
  
    /**
     * Called before the component is destroyed; it saves tableColumns for each node, link, and cluster in commonService.session.data
     */
    ngOnDestroy(): void {
      let foundTableData = this.TableDatas.find((x) => x.tableType === 'node');
      if (foundTableData) {
        this.visuals.tableComp.commonService.session.data.nodeTableColumns =
          foundTableData.tableColumns;
      }
  
      foundTableData = this.TableDatas.find((x) => x.tableType === 'link');
      if (foundTableData) {
        this.visuals.tableComp.commonService.session.data.linkTableColumns =
          foundTableData.tableColumns;
      }
  
      foundTableData = this.TableDatas.find((x) => x.tableType === 'cluster');
      if (foundTableData) {
        this.visuals.tableComp.commonService.session.data.clusterTableColumns =
          foundTableData.tableColumns;
      }

    this.destroy$.next();
    this.destroy$.complete();
    }
  }
  
  interface TableData {
    tableType: 'node' | 'link' | 'cluster';
    data: any[];
    dataSelection: any[];
    tableColumns: any[];
    availableColumns: any[];
    selectedTableColumns: any[];
    filter: any;
  }
  
  interface FilterType {
    label: string;
    value: string;
  }
  
  export namespace TableComponent {
    export const componentTypeName = 'Table';
  }
  