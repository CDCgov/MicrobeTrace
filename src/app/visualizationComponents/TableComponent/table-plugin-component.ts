import { Injector, Component, Output, OnChanges, SimpleChange, EventEmitter, OnInit, ViewChild, ChangeDetectorRef, OnDestroy, ElementRef, Inject } from '@angular/core';
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


/**
 * @title Complex Example
 */
@Component({
    selector: 'TableComponent',
    templateUrl: './table-plugin-component.html',
    styleUrls: ['./table-plugin-component.less']
})

export class TableComponent extends BaseComponentDirective implements OnInit, OnDestroy, MicobeTraceNextPluginEvents {

    @Output() DisplayGlobalSettingsDialogEvent = new EventEmitter();

    viewActive: boolean = true;
    SelectedTableExportFilenameVariable: string = "";

    TableExportFileTypeList: any = [
        { label: 'xlsx', value: 'xlsx' },
        { label: 'csv', value: 'csv' }
    ];
    exportColumnOptions: any = [
        { label: 'All', value: true },
        { label: 'Current', value: false }
    ];
    exportAllColumns: boolean = false;

    dataSetView: SelectItem[];
    dataSetViewSelected: string;
    
    SelectedTableExportFileTypeListVariable: string = "csv";

    SelectedTextSizeVariable: any = 14;

    ShowTableExportPane: boolean = false;
    ShowTableSettingsPane: boolean = false;
    IsDataAvailable: boolean = false;
    table: any;
    meta: any = ['selected', 'visible']
    TableColumns: any[] = [];
    SelectableTableColumns: any[] = [];
    AvailableColumns: any[] = [];
    TableDatas: TableData[] = [];
    SelectedTableData: TableData;
    TableDataSelection: any[] = [];
    TableType: 'node' | 'link' | 'cluster' = 'node';
    filterTypes: FilterType[] = [
        {label:'Contains', value: 'contains'},
        {label:'=', value: 'equals'},
        {label:'!=', value: 'notEquals'},
        {label:'Starts With', value: 'startsWith'},
        {label:'Ends With', value: 'endsWith'},
        {label:'In', value: 'in'},
        {label:'<', value: 'lt'},
        {label:'<=', value: 'lte'},
        {label:'>', value: 'gt'},
        {label:'>=', value: 'gte'},
    ];

    selectedSize = '';
    sizes = [
        { name: 'Small', class: 'p-datatable-sm' },
        { name: 'Normal', class: '' },
        { name: 'Large',  class: 'p-datatable-lg' }
    ];

    scrollHeight: string;
    tableStyle;
    selectedRows = 10;

    private visuals: MicrobeTraceNextVisuals;

    // @ViewChild('dt') dataTable: Table;

    @ViewChild('dt') dataTable: Table;


    constructor(injector: Injector,
        @Inject(BaseComponentDirective.GoldenLayoutContainerInjectionToken) private container: ComponentContainer, 
        elRef: ElementRef,
        private cdref: ChangeDetectorRef,
        private eventManager: EventManager,
        private commonService: CommonService,
        private gtmService: GoogleTagManagerService) {

        super(elRef.nativeElement);

        this.visuals = commonService.visuals;
        this.commonService.visuals.tableComp = this;

    }

    ngOnInit() {
        // this.InitView();

        this.gtmService.pushTag({
            event: "page_view",
            page_location: "/table",
            page_title: "Table View"
        });
        this.dataSetView = [];
        this.dataSetView.push({ label: 'Nodes', value: 'Node' });
        this.dataSetView.push({ label: 'Links', value: 'Link' });
        this.dataSetView.push({ label: 'Clusters', value: 'Cluster' });

        this.dataSetViewSelected = "Node";

        this.visuals.tableComp.IsDataAvailable = (this.visuals.tableComp.commonService.session.data.nodes.length == 0 ? false : true);

        if (this.visuals.tableComp.IsDataAvailable == true) {
            if (!this.SelectedTableData || this.SelectedTableData.tableColumns.length == 0) {
                this.visuals.tableComp.createTable(this.visuals.microbeTrace.dataSetViewSelected);
            }
        }

        let that = this;

        $( document ).on( "node-selected", function( ) {

            if (that.viewActive) {
                that.visuals.tableComp.setSelectedNodes();
            }

        });


        window.addEventListener("node-selected", () => {
            if (!this.visuals.microbeTrace.homepageTabs.find(x => x.isActive && x.label === 'Table')) {
                this.visuals.tableComp.setSelectedNodes();
            }
        });

        // offsets: 70 table-wrapper padding-top, 60 p-paginator, 10 table-wrapper padding-bottom
        this.scrollHeight = ($('tableComponent').height() - 70 - 60 - 10) + 'px';
        let width = ($('tableComponent').width() - 23) + 'px';
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
            this.setSelectedNodes();
            this.cdref.detectChanges();
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
                this.SelectedTableData.availableColumns.forEach(column => temp2.push(column.value))
                this.dataTable.columns = temp2;
                this.dataTable.exportCSV()
                this.dataTable.columns = temp;
            } else {
                this.dataTable.exportCSV()
            }
        }

        this.ShowTableExportPane = !this.ShowTableExportPane;
    }

    /**
     * Allows users to export the table as an excel file
     * @param fileName optional if not given will use this.SelectedtableExportFilenameVariable
     */
    saveAsExcelFile( fileName?: string): void {
        if (fileName == undefined) {
            fileName = this.SelectedTableExportFilenameVariable
        }
        import("xlsx").then(xlsx => {
            // if a filtered is applied use filteredValue else use all values
            let rowData = this.dataTable.filteredValue || this.dataTable.value;
            if (this.exportAllColumns) {
                // change name of data fields to header to be consistent with the other exports on this component
                rowData = rowData.map((row) => {
                    let output = {}
                    this.SelectedTableData.availableColumns.forEach((key) => output[key.value.header] = row[key.value.field])
                    return output;
                })
            } else {
                // gets only the current/visible columns for export and also changes data field name to the header name
                rowData = rowData.map((row) => {
                    let output = {}
                    this.SelectedTableData.tableColumns.forEach((key) => output[key.header] = row[key.field])
                    return output;
                })
            }

            let worksheet = xlsx.utils.json_to_sheet(rowData) ; 
            const workbook = { Sheets: { 'data': worksheet }, SheetNames: ['data'] }
            const excelBuffer: any = xlsx.write(workbook, { bookType: 'xlsx', type: 'array' });
            const EXCEL_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8';
            const EXCEL_EXTENSION = '.xlsx';
            const data: Blob = new Blob([excelBuffer], { type: EXCEL_TYPE });
            saveAs(data, fileName + EXCEL_EXTENSION);
        });
    }

    /**
     * Called first when filter is applied it applys filter to this.dataTable to update this.dataTable.filterValue
     * @param col 
     */
    onTableFilter(col){
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
                filteredValues = this.visuals.tableComp.commonService.session.data.nodes.filter(x => event.filteredValue.find(y => y.index === x.index));
                break;
            case 'link':
                filteredValues = this.visuals.tableComp.commonService.session.data.links.filter(x => event.filteredValue.find(y => y.index === x.index));
                break;
            case 'cluster':
                filteredValues = this.visuals.tableComp.commonService.session.data.clusters.filter(x => event.filteredValue.find(y => y.id === x.id));
                break;
        }

        this.visuals.tableComp.SelectedTableData.filter = event.filters;

        // these lines can used to update nodes/data used for other views; publishFilterDataChange() calls onFilterDataChange for each view 
        // onFilterDataChange will need to be updated for implimenting this; also a bug in labeling by index sometimes changes the numbering of nodes
        /*this.visuals.tableComp.commonService.session.data[this.visuals.tableComp.TableType + 'Filter'] = event.filters;
        this.visuals.tableComp.commonService.session.data[this.visuals.tableComp.TableType + 'FilteredValues'] = filteredValues;
        this.visuals.microbeTrace.publishFilterDataChange(); */

        // updates number of rows when filter is changed (without there is a visual bug when removing a filter)
        if ($('.p-paginator-rpp-options span').text() == 'All') {
            this.selectedRows = event.filteredValue.length;
        }
    }

    // XXXXX changing font size in settings pane currently calls this function
    onDataChange(event) {

    }

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
        if(event.data === undefined) return;

        if (this.visuals.tableComp.TableType === 'node') {
            this.visuals.tableComp.commonService.session.data.nodes
                .filter(x => x.index === event.data.index)
                .forEach(x => x.selected = isSelect);
            this.visuals.tableComp.commonService.session.data.nodeFilteredValues
                .filter(x => x.index === event.data.index)
                .forEach(x => x.selected = isSelect);
        }

        $(document).trigger('node-selected')
        //window.dispatchEvent(new Event('node-selected'));
    }

    /**
     * Update variables (such as TableType, selectedTableData) needed to update the contents of the table
     * @param type The type of data (node, link, cluster) to create table with
     */
    createTable(type: any = "node") {
        type = type.toLowerCase();
        this.visuals.tableComp.TableType = type;

        // checks if data for tableData exists in TableDatas, if not, creates a new TableData object and adds it to TableDatas
        let tableData: TableData | undefined = this.TableDatas.find(x => x.tableType === type);
        const isNewTableData: boolean = tableData == undefined;
        if (isNewTableData) {
            tableData = {
                tableType: type,
                data: [],
                dataSelection: [],
                tableColumns: this.visuals.tableComp.commonService.session.data[type + 'TableColumns'],
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

        this.visuals.tableComp.commonService.session.data[type + 'Fields'].map((d, i) => {
            if (this.visuals.tableComp.meta.includes(d)) return;

            let filterValue: string = "";
            if (tableData.filter) {
                const foundFilterItem = tableData.filter[d];
                if (foundFilterItem) {
                    filterValue = foundFilterItem.value;
                }
            }

            const column = {
                field: d,
                header: d== 'nn' ? 'Nearest Neighbor' : this.visuals.tableComp.capitalize(d.replace("_", "")),
                filterValue: filterValue,
                filterType: 'contains'
            };

            const foundAvailableColumn = tableData.availableColumns.find(x => x.label === column.header);

            if (foundAvailableColumn) {
                foundAvailableColumn.filterValue = column.filterValue;
            } else {
                tableData.availableColumns.push({
                    label: column.header,
                    value: column,
                    disabled: column.field === 'index'
                })
            }
        });

        if (!tableData.tableColumns.length) {
            tableData.tableColumns = tableData.availableColumns.filter((curVal, index) => index <= 5).map(x => x.value);
        }

        tableData.tableColumns.forEach(x=>{
            const c = tableData.availableColumns.find(y=>y.value.header === x.header).value.filterValue;
            x.filterValue = c;
        })


        tableData.data = [];
        let typeData = type + "s";
        this.visuals.tableComp.commonService.session.data[typeData].map((d, i) => {
            if (this.visuals.tableComp.meta.includes(d)) return;

            let nrow: any = {};
            tableData.availableColumns.map((e, n) => {
                const field = e.value.field;

                let stringVal: String = d[field];

                if (stringVal === undefined || stringVal === null) {
                    nrow[field] = "";
                } else {
                    nrow[field] = (stringVal.toString().indexOf(",") > -1 ? (stringVal.toString().split(",", 100).length > 1 ? stringVal.toString().split(",", 100).join('\n') : d[field]) : d[field]);
                }

            });

            tableData.data.push(nrow);
        });

        const foundTableData = this.TableDatas.find(x => x.tableType === type);

        if (foundTableData) {
            this.SelectedTableData = foundTableData;
        }

        //set selected nodes
        this.visuals.tableComp.setSelectedNodes();
    }

    /**
     * If this.TableType == 'node' update the node TableData.dataSelection to the nodes that are selected in commonService.session.data.nodes
     */
    setSelectedNodes() {
        if (this.visuals.tableComp.TableType === 'node') {
            const foundTableData = this.TableDatas.find(x => x.tableType === 'node');
            if (foundTableData) {
                const selectedNodes = this.visuals.tableComp.commonService.session.data.nodes.filter(x => x.selected);
                foundTableData.dataSelection = this.SelectedTableData.data.filter(x => selectedNodes.find(y => y.index == x.index));
            }
        }
    }

    /**
     * @param s string
     * @returns s but with first letter capitatlized, if s is not string type returns empty string
     */
    capitalize(s): string {
        if (typeof s !== 'string') return ''
        return s.charAt(0).toUpperCase() + s.slice(1)
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
        let temp = this.SelectedTableData.tableColumns[2]
        this.SelectedTableData.tableColumns[2] = this.SelectedTableData.tableColumns[3];
        this.SelectedTableData.tableColumns[3] = temp;
    }

    /**
     * Opens settings pane for table component
     */
    openSettings() {
        this.visuals.tableComp.ShowTableSettingsPane = !this.visuals.tableComp.ShowTableSettingsPane;
    }

    /**
     * Opens export pane for table component
     */
    openExport() {
        this.visuals.tableComp.ShowTableExportPane = !this.visuals.tableComp.ShowTableExportPane;
    }

    openCenter() {

    }

    //openPinAllNodes() {


    //}

    openRefreshScreen() {

    }

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

    onRecallSession() {
    }

    goldenLayoutComponentResize() {
        this.scrollHeight = ($('tableComponent').height() - 70 - 60 - 10) + 'px';
        let width = ($('tableComponent').width() - 23) + 'px';
        this.tableStyle = {
            'width' : width,
            'display': 'block'
        }
    }

    /**
     * Called before the comonent is destroyed; it save tableColumns for each node, link, and cluster in commonService.session.data
     */
    ngOnDestroy(): void {

        let foundTableData = this.TableDatas.find(x => x.tableType === 'node');
        if (foundTableData) {
            this.visuals.tableComp.commonService.session.data.nodeTableColumns = foundTableData.tableColumns;
        }

        foundTableData = this.TableDatas.find(x => x.tableType === 'link');
        if (foundTableData) {
            this.visuals.tableComp.commonService.session.data.linkTableColumns = foundTableData.tableColumns;
        }

        foundTableData = this.TableDatas.find(x => x.tableType === 'cluster');
        if (foundTableData) {
            this.visuals.tableComp.commonService.session.data.clusterTableColumns = foundTableData.tableColumns;
        }
    }
}

interface TableData {
    tableType: 'node' | 'link' | 'cluster',
    data: any[],
    dataSelection: any[],
    tableColumns: any[],
    availableColumns: any[],
    selectedTableColumns: any[],
    filter: any
}

interface FilterType{
    label: string,
    value: string
}

export namespace TableComponent {
    export const componentTypeName = 'Table';
}