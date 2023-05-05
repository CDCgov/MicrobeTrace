import { Injector, Component, Output, OnChanges, SimpleChange, EventEmitter, OnInit, ViewChild, OnDestroy } from '@angular/core';
import { AppComponentBase } from '@shared/common/app-component-base';
import { EventManager } from '@angular/platform-browser';
import { CommonService } from '../../contactTraceCommonServices/common.service';
import { window } from 'ngx-bootstrap';
import { Table } from 'primeng/table';
import { MicobeTraceNextPluginEvents } from '../../helperClasses/interfaces';
import { MicrobeTraceNextVisuals } from '../../microbe-trace-next-plugin-visuals';
import { SelectItem } from 'primeng/api';



/**
 * @title Complex Example
 */
@Component({
    selector: 'TableComponent',
    templateUrl: './table-plugin-component.html',
    styleUrls: ['./table-plugin-component.less']
})

export class TableComponent extends AppComponentBase implements OnInit, OnDestroy, MicobeTraceNextPluginEvents {

    @Output() DisplayGlobalSettingsDialogEvent = new EventEmitter();

    SelectedNetworkExportFilenameVariable: string = "";

    NetworkExportFileTypeList: any = [
        { label: 'xlsx', value: 'xlsx' },
    ];

    dataSetView: SelectItem[];
    dataSetViewSelected: string;
    
    SelectedNetworkExportFileTypeListVariable: string = "png";

    SelectedTextSizeVariable: any = 14;

    ShowTableExportPane: boolean = false;
    ShowTableSettingsPane: boolean = false;
    IsDataAvailable: boolean = false;
    table: any;
    meta: any = ['selected', 'visible', 'nn'];
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

    private visuals: MicrobeTraceNextVisuals;

    // @ViewChild('dt') dataTable: Table;
    @ViewChild('dt', { static: false }) dataTable: Table;


    constructor(injector: Injector,
        private eventManager: EventManager,
        private commonService: CommonService) {

        super(injector);

        this.visuals = commonService.visuals;
        this.commonService.visuals.tableComp = this;
    }

    ngOnInit() {
        // this.InitView();

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

            if (that.visuals.microbeTrace.homepageTabs.find(x => x.isActive && x.label === 'Table')) {
                that.visuals.tableComp.setSelectedNodes();
            }

        });

        this.visuals.tableComp.eventManager.addGlobalEventListener('window', 'node-selected', () => {
            if (!this.visuals.microbeTrace.homepageTabs.find(x => x.isActive && x.label === 'Table')) {
                this.visuals.tableComp.setSelectedNodes();
            }
        });
    }

    exportVisualization(event) {
        import("xlsx").then(xlsx => {
            const worksheet = xlsx.utils.json_to_sheet(this.dataTable.filteredValue);
            const workbook = { Sheets: { 'data': worksheet }, SheetNames: ['data'] };
            const excelBuffer: any = xlsx.write(workbook, { bookType: 'xlsx', type: 'array' });
            this.saveAsExcelFile(excelBuffer, this.SelectedNetworkExportFilenameVariable);
        });

        this.ShowTableExportPane = !this.ShowTableExportPane;
    }

    saveAsExcelFile(buffer: any, fileName: string): void {
        import("file-saver").then(FileSaver => {
            const EXCEL_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8';
            const EXCEL_EXTENSION = '.xlsx';
            const data: Blob = new Blob([buffer], {
                type: EXCEL_TYPE
            });
            FileSaver.saveAs(data, fileName + EXCEL_EXTENSION);
        });
    }

    onTableFilter(col){
        this.dataTable.filter(col.filterValue, col.field, col.filterType);
    }

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

        this.visuals.tableComp.commonService.session.data[this.visuals.tableComp.TableType + 'Filter'] = event.filters;
        this.visuals.tableComp.commonService.session.data[this.visuals.tableComp.TableType + 'FilteredValues'] = filteredValues;

        this.visuals.microbeTrace.publishFilterDataChange();
    }

    onDataChange(event) {

    }

    onFilterDataChange() {
        //Nothing to do here
    }

    onRowSelect(event) {
        this.nodeSelect(event, true);
    }

    onRowUnselect(event) {
        this.nodeSelect(event, false);
    }

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

        window.dispatchEvent(new Event('node-selected'));
    }

    createTable(type: any = "node") {
        type = type.toLowerCase();
        this.visuals.tableComp.TableType = type;

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
                header: this.visuals.tableComp.capitalize(d.replace("_", "")),
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

    setSelectedNodes() {
        if (this.visuals.tableComp.TableType === 'node') {
            const foundTableData = this.TableDatas.find(x => x.tableType === 'node');
            if (foundTableData) {
                const selectedNodes = this.visuals.tableComp.commonService.session.data.nodes.filter(x => x.selected);
                foundTableData.dataSelection = this.SelectedTableData.data.filter(x => selectedNodes.find(y => y.index == x.index));
            }
        }
    }

    capitalize(s) {
        if (typeof s !== 'string') return ''
        return s.charAt(0).toUpperCase() + s.slice(1)
    }

    resetTextsize() {
        let s: any = $('#table-font-size').val();
        $('#table').css({
            'font-size': s + 'px',
            'line-height': s / 10
        });
    }

    openSettings() {
        this.visuals.tableComp.ShowTableSettingsPane = !this.visuals.tableComp.ShowTableSettingsPane;
    }

    openExport() {
        this.visuals.tableComp.ShowTableExportPane = !this.visuals.tableComp.ShowTableExportPane;
    }

    openCenter() {

    }

    openPinAllNodes() {


    }

    openRefreshScreen() {

    }

    openSelectDataSetScreen(e: any) {

        this.visuals.tableComp.createTable(e);
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
    updateLinkColor() {
        //Not Relevant
    }

    onRecallSession() {
    }

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