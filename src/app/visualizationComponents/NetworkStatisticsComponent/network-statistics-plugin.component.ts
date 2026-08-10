import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Inject,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
} from '@angular/core';
import { BaseComponentDirective } from '@app/base-component.directive';
import { CommonService } from '@app/contactTraceCommonServices/common.service';
import { CommonStoreService } from '@app/contactTraceCommonServices/common-store.services';
import {
  buildNetworkStatisticsExportSections,
  NetworkStatisticsProgress,
  NetworkStatisticsRequest,
  NetworkStatisticsResult,
  serializeNetworkStatisticsCsv,
} from '@app/contactTraceCommonServices/network-statistics';
import { WorkerComputeService } from '@app/contactTraceCommonServices/worker-compute.service';
import { MicobeTraceNextPluginEvents } from '@app/helperClasses/interfaces';
import { MicrobeTraceNextVisuals } from '@app/microbe-trace-next-plugin-visuals';
import { GoogleTagManagerService } from 'angular-google-tag-manager';
import { ComponentContainer } from 'golden-layout';
import { SelectItem } from 'primeng/api';
import { Table } from 'primeng/table';
import { Subject, takeUntil } from 'rxjs';
import { saveAs } from 'file-saver';

type NetworkStatisticsSection = 'summary' | 'centrality' | 'components' | 'degree';
type NetworkStatisticsExactState = 'idle' | 'running' | 'cancelled' | 'failed' | 'complete';

interface NetworkStatisticsColumn {
  field: string;
  header: string;
  filterType?: string;
  filterValue?: string;
}

interface NetworkStatisticsTableData {
  tableType: NetworkStatisticsSection;
  data: any[];
  tableColumns: NetworkStatisticsColumn[];
  availableColumns: Array<{ label: string; value: NetworkStatisticsColumn }>;
}

interface FilterType {
  label: string;
  value: string;
}

@Component({
  selector: 'networkStatisticsComponent',
  templateUrl: './network-statistics-plugin.component.html',
  styleUrls: ['./network-statistics-plugin.component.scss'],
  standalone: false,
})
export class NetworkStatisticsComponent
  extends BaseComponentDirective
  implements OnInit, OnDestroy, MicobeTraceNextPluginEvents {
  @Output() DisplayGlobalSettingsDialogEvent = new EventEmitter();
  @ViewChild('dt') dataTable: Table;

  viewActive = true;
  IsDataAvailable = false;
  networkStatisticsResult: NetworkStatisticsResult | null = null;
  networkStatisticsLoading = false;
  networkStatisticsError = '';
  networkStatisticsExactState: NetworkStatisticsExactState = 'idle';
  networkStatisticsExactProgress: NetworkStatisticsProgress | null = null;
  networkStatisticsExactError = '';

  ShowNetworkStatisticsSettingsPane = false;
  ShowNetworkStatisticsExportPane = false;
  SelectedNetworkStatisticsExportFilenameVariable = 'network_statistics';

  dataSetView: SelectItem[] = [
    { label: 'Summary', value: 'summary' },
    { label: 'Node Centrality', value: 'centrality' },
    { label: 'Clusters', value: 'components' },
    { label: 'Degree Distribution', value: 'degree' },
  ];
  dataSetViewSelected: NetworkStatisticsSection = 'summary';

  SelectedTableData: NetworkStatisticsTableData;
  TableDatas: NetworkStatisticsTableData[] = [];
  selectedRows = 25;
  selectedSize = '';
  sizes = [
    { name: 'Small', class: 'p-datatable-sm' },
    { name: 'Normal', class: '' },
    { name: 'Large', class: 'p-datatable-lg' },
  ];
  scrollHeight = '400px';
  tableStyle: Record<string, string> = { width: '100%', 'min-width': '100%' };
  columnMinWidth = 150;
  allRowsPaginatorSelected = false;

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
    { label: '>=', value: 'gte' },
  ];

  private readonly destroy$ = new Subject<void>();
  private readonly visuals: MicrobeTraceNextVisuals;
  private networkStatisticsRequestId = 0;
  private isDestroyed = false;
  private initialCalculationController: AbortController | null = null;
  private exactCalculationController: AbortController | null = null;
  private exactCalculationFrame: number | null = null;
  private currentRequest: NetworkStatisticsRequest | null = null;
  private currentRequestSignature = '';
  private readonly sectionColumns: Record<NetworkStatisticsSection, NetworkStatisticsColumn[]> = {
    summary: [
      { field: 'metric', header: 'Metric' },
      { field: 'value', header: 'Value' },
    ],
    centrality: [
      { field: 'nodeId', header: 'Node ID' },
      { field: 'componentId', header: 'Cluster ID' },
      { field: 'degree', header: 'Degree' },
      { field: 'normalizedDegree', header: 'Norm. Degree' },
      { field: 'betweenness', header: 'Betweenness' },
      { field: 'normalizedBetweenness', header: 'Norm. Betweenness' },
    ],
    components: [
      { field: 'componentId', header: 'Cluster ID' },
      { field: 'nodeCount', header: 'Nodes' },
      { field: 'linkCount', header: 'Links' },
      { field: 'density', header: 'Density' },
      { field: 'averageDegree', header: 'Avg Degree' },
      { field: 'maxDegree', header: 'Max Degree' },
      { field: 'diameter', header: 'Diameter' },
    ],
    degree: [
      { field: 'degree', header: 'Degree' },
      { field: 'nodeCount', header: 'Nodes' },
      { field: 'fraction', header: 'Fraction' },
    ],
  };

  private readonly nodeSelectedWindowHandler = () => {
    void this.refreshNetworkStatistics();
  };

  constructor(
    @Inject(BaseComponentDirective.GoldenLayoutContainerInjectionToken)
    private container: ComponentContainer,
    elRef: ElementRef,
    private cdref: ChangeDetectorRef,
    private commonService: CommonService,
    private store: CommonStoreService,
    private workerComputeService: WorkerComputeService,
    private gtmService: GoogleTagManagerService,
  ) {
    super(elRef.nativeElement);
    this.visuals = commonService.visuals;
    this.commonService.visuals.networkStatistics = this;
  }

  ngOnInit(): void {
    this.gtmService.pushTag({
      event: 'page_view',
      page_location: '/network-statistics',
      page_title: 'Network Statistics View',
    });

    this.SelectedTableData = this.getTableData(this.dataSetViewSelected);
    this.IsDataAvailable = this.commonService.session.data.nodes.length > 0;
    this.goldenLayoutComponentResize();

    this.container.on('resize', () => this.goldenLayoutComponentResize());
    this.container.on('hide', () => {
      this.viewActive = false;
      this.cdref.detectChanges();
    });
    this.container.on('show', () => {
      this.viewActive = true;
      void this.refreshNetworkStatistics();
      this.goldenLayoutComponentResize();
    });

    $(document).on('node-selected.network-statistics', () => {
      void this.refreshNetworkStatistics();
    });
    window.addEventListener('node-selected', this.nodeSelectedWindowHandler);

    this.store.clusterUpdate$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      void this.refreshNetworkStatistics();
    });

    this.store.networkUpdated$.pipe(takeUntil(this.destroy$)).subscribe((networkUpdated) => {
      if (networkUpdated) {
        void this.refreshNetworkStatistics();
        this.store.setNetworkUpdated(false);
      }
    });

    if (this.IsDataAvailable) {
      void this.refreshNetworkStatistics();
    }
  }

  get networkStatisticsApproximationLabel(): string {
    const summary = this.networkStatisticsResult?.summary;
    if (!summary?.approximateBetweenness && !summary?.approximatePathMetrics) {
      return '';
    }

    return `Approx. sampled metrics from ${summary.sampledSourceCount.toLocaleString()} source nodes`;
  }

  get networkStatisticsResultIsApproximate(): boolean {
    const summary = this.networkStatisticsResult?.summary;
    return Boolean(summary?.approximateBetweenness || summary?.approximatePathMetrics);
  }

  get shouldShowNetworkStatisticsExactStatus(): boolean {
    return this.networkStatisticsResultIsApproximate && (
      this.networkStatisticsExactState === 'running'
      || this.networkStatisticsExactState === 'cancelled'
      || this.networkStatisticsExactState === 'failed'
    );
  }

  get networkStatisticsExactProgressPercent(): number {
    const percentage = Number(this.networkStatisticsExactProgress?.percentage || 0);
    return Math.max(0, Math.min(100, percentage));
  }

  get networkStatisticsExactProgressLabel(): string {
    const progress = this.networkStatisticsExactProgress;
    const completed = Number(progress?.completedSourceCount || 0).toLocaleString();
    const total = Number(
      progress?.totalSourceCount || this.networkStatisticsResult?.summary.nodeCount || 0
    ).toLocaleString();
    return `${completed} of ${total} source nodes processed`;
  }

  openSettings(): void {
    this.ShowNetworkStatisticsSettingsPane = !this.ShowNetworkStatisticsSettingsPane;
  }

  openExport(): void {
    this.ShowNetworkStatisticsExportPane = !this.ShowNetworkStatisticsExportPane;
  }

  openCenter(): void {}

  openRefreshScreen(): void {
    void this.refreshNetworkStatistics(true);
  }

  onLoadNewData(): void {
    this.IsDataAvailable = this.commonService.session.data.nodes.length > 0;
    if (!this.IsDataAvailable) {
      this.clearNetworkStatistics();
      return;
    }

    void this.refreshNetworkStatistics();
  }

  onFilterDataChange(): void {
    void this.refreshNetworkStatistics();
  }

  updateNodeColors(): void {}

  updateVisualization(): void {}

  updateLinkColor(): void {}

  applyStyleFileSettings(): void {}

  onRecallSession(): void {}

  openSelectDataSetScreen(event: any): void {
    this.dataSetViewSelected = event?.value ?? this.dataSetViewSelected;
    this.syncSelectedTableData();
    this.resetTableFilters();
    this.updateTableDimensions();
    this.cdref.detectChanges();
  }

  onColumnsChange(): void {
    this.updateTableDimensions();
  }

  onTableFilter(col: NetworkStatisticsColumn): void {
    this.dataTable?.filter(col.filterValue, col.field, col.filterType || 'contains');
  }

  onPage(event: any): void {
    this.selectedRows = event.rows;
    setTimeout(() => {
      this.allRowsPaginatorSelected = this.isAllRowsPaginatorSelected();
      if (this.allRowsPaginatorSelected) {
        const filteredRows = this.dataTable?.filteredValue || this.SelectedTableData?.data || [];
        this.selectedRows = filteredRows.length;
      }
      this.applySelectedRowsToTable();
    });
  }

  async exportVisualization(): Promise<void> {
    await this.exportNetworkStatisticsWorkbook();
    this.ShowNetworkStatisticsExportPane = false;
  }

  async exportNetworkStatisticsWorkbook(): Promise<void> {
    if (!this.networkStatisticsResult) {
      return;
    }

    const xlsx = await import('xlsx');
    const workbook = xlsx.utils.book_new();
    buildNetworkStatisticsExportSections(this.networkStatisticsResult).forEach((section) => {
      const worksheet = xlsx.utils.aoa_to_sheet(section.rows);
      xlsx.utils.book_append_sheet(workbook, worksheet, section.sheetName);
    });

    const excelBuffer = xlsx.write(workbook, {
      bookType: 'xlsx',
      type: 'array',
    });
    const blob = new Blob([excelBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8',
    });
    const fileName = `${this.SelectedNetworkStatisticsExportFilenameVariable || 'network_statistics'}.xlsx`;
    const testSaveAs = (window as any).__mtTestSaveAs;
    if (typeof testSaveAs === 'function') {
      testSaveAs(blob, fileName);
      return;
    }

    saveAs(blob, fileName);
  }

  exportNetworkStatisticsCsv(): void {
    if (!this.networkStatisticsResult) {
      return;
    }

    const csv = serializeNetworkStatisticsCsv(this.networkStatisticsResult);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const fileName = `${this.SelectedNetworkStatisticsExportFilenameVariable || 'network_statistics'}.csv`;
    const testSaveAs = (window as any).__mtTestSaveAs;
    if (typeof testSaveAs === 'function') {
      testSaveAs(blob, fileName);
      return;
    }

    saveAs(blob, fileName);
  }

  formatCellValue(field: string, value: any): string {
    if (value === null || value === undefined || value === '') {
      return 'N/A';
    }

    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No';
    }

    if (typeof value !== 'number') {
      return String(value);
    }

    if (!Number.isFinite(value)) {
      return 'N/A';
    }

    if (Math.abs(value - Math.round(value)) < 1e-9) {
      return Math.round(value).toLocaleString();
    }

    const fractionLikeFields = new Set([
      'density',
      'averageDegree',
      'averageLocalClusteringCoefficient',
      'transitivity',
      'averagePathLength',
      'normalizedDegree',
      'normalizedBetweenness',
      'betweenness',
      'fraction',
      'value',
    ]);

    return value.toLocaleString(undefined, {
      maximumFractionDigits: fractionLikeFields.has(field) ? 3 : 2,
      minimumFractionDigits: 0,
    });
  }

  goldenLayoutComponentResize(): void {
    this.updateTableDimensions();
    this.cdref.detectChanges();
  }

  private updateTableDimensions(): void {
    const host = $('networkStatisticsComponent');
    const hostHeight = host.height() || this.rootHtmlElement.clientHeight || 500;
    const hostWidth = host.width() || this.rootHtmlElement.clientWidth || 800;
    const paneWidth = Math.max(hostWidth - 23, 300);
    const selectedColumnCount = Math.max(this.SelectedTableData?.tableColumns?.length || 1, 1);
    const minimumColumnWidth = selectedColumnCount * this.columnMinWidth;
    const exactStatusHeight = this.shouldShowNetworkStatisticsExactStatus
      ? Number(host.find('.network-statistics-exact-status').outerHeight(true) || 76)
      : 0;
    this.scrollHeight = Math.max(hostHeight - 70 - 60 - 10 - exactStatusHeight, 180) + 'px';
    this.tableStyle = {
      width: paneWidth + 'px',
      'min-width': Math.max(paneWidth, minimumColumnWidth) + 'px',
    };
  }

  async refreshNetworkStatistics(force = false): Promise<void> {
    this.IsDataAvailable = this.commonService.session.data.nodes.length > 0;
    if (!this.IsDataAvailable) {
      this.clearNetworkStatistics();
      return;
    }

    const request = this.buildNetworkStatisticsRequest();
    const requestSignature = this.buildNetworkStatisticsRequestSignature(request);
    if (
      !force
      && requestSignature === this.currentRequestSignature
      && (this.networkStatisticsLoading || this.networkStatisticsResult !== null)
    ) {
      return;
    }

    this.cancelActiveCalculations();
    const requestId = ++this.networkStatisticsRequestId;
    const controller = new AbortController();
    this.initialCalculationController = controller;
    this.currentRequest = request;
    this.currentRequestSignature = requestSignature;
    this.networkStatisticsLoading = true;
    this.networkStatisticsError = '';
    this.networkStatisticsExactState = 'idle';
    this.networkStatisticsExactProgress = null;
    this.networkStatisticsExactError = '';
    this.cdref.detectChanges();

    try {
      const result = await this.workerComputeService.computeNetworkStatistics(request, {
        signal: controller.signal,
      });
      if (this.isDestroyed || requestId !== this.networkStatisticsRequestId) {
        return;
      }

      this.networkStatisticsResult = result;
      this.networkStatisticsLoading = false;
      this.networkStatisticsError = '';
      this.syncSelectedTableData();
      this.markNetworkStatisticsRendered();

      if (result.summary.approximateBetweenness || result.summary.approximatePathMetrics) {
        this.scheduleExactNetworkStatistics(requestId, requestSignature);
      } else {
        this.networkStatisticsExactState = 'complete';
      }
    } catch (error) {
      if (this.isDestroyed || requestId !== this.networkStatisticsRequestId) {
        return;
      }

      if (this.isAbortError(error)) {
        return;
      }

      this.networkStatisticsLoading = false;
      this.networkStatisticsError = 'Network statistics could not be calculated.';
    } finally {
      if (this.initialCalculationController === controller) {
        this.initialCalculationController = null;
      }
      if (!this.isDestroyed && requestId === this.networkStatisticsRequestId) {
        this.cdref.detectChanges();
      }
    }
  }

  cancelExactNetworkStatistics(): void {
    this.cancelScheduledExactCalculation();
    const controller = this.exactCalculationController;
    this.exactCalculationController = null;
    controller?.abort();

    if (this.networkStatisticsResultIsApproximate) {
      this.networkStatisticsExactState = 'cancelled';
      this.networkStatisticsExactError = '';
      this.updateTableDimensions();
      this.cdref.detectChanges();
    }
  }

  async startExactNetworkStatistics(): Promise<void> {
    const request = this.currentRequest;
    const requestSignature = this.currentRequestSignature;
    const requestId = this.networkStatisticsRequestId;
    if (!request || !requestSignature || !this.networkStatisticsResultIsApproximate) {
      return;
    }

    this.cancelScheduledExactCalculation();
    this.exactCalculationController?.abort();
    const controller = new AbortController();
    this.exactCalculationController = controller;
    this.networkStatisticsExactState = 'running';
    this.networkStatisticsExactError = '';
    this.networkStatisticsExactProgress = {
      completedSourceCount: 0,
      totalSourceCount: this.networkStatisticsResult?.summary.nodeCount || request.nodes.length,
      percentage: 0,
    };
    this.cdref.detectChanges();
    this.updateTableDimensions();

    const exactRequest: NetworkStatisticsRequest = {
      ...request,
      approximation: {
        ...(request.approximation || {}),
        forceApproximate: false,
        forceExact: true,
      },
    };

    try {
      const exactResult = await this.workerComputeService.computeNetworkStatistics(exactRequest, {
        signal: controller.signal,
        onProgress: (progress) => {
          if (
            this.isDestroyed
            || controller !== this.exactCalculationController
            || requestId !== this.networkStatisticsRequestId
            || requestSignature !== this.currentRequestSignature
          ) {
            return;
          }

          this.networkStatisticsExactProgress = progress;
          this.cdref.detectChanges();
        },
      });

      if (
        this.isDestroyed
        || controller !== this.exactCalculationController
        || requestId !== this.networkStatisticsRequestId
        || requestSignature !== this.currentRequestSignature
      ) {
        return;
      }

      this.networkStatisticsResult = exactResult;
      this.networkStatisticsExactState = 'complete';
      this.networkStatisticsExactProgress = null;
      this.networkStatisticsExactError = '';
      this.syncSelectedTableData();
    } catch (error) {
      if (
        this.isDestroyed
        || requestId !== this.networkStatisticsRequestId
        || requestSignature !== this.currentRequestSignature
        || this.isAbortError(error)
      ) {
        return;
      }

      this.networkStatisticsExactState = 'failed';
      this.networkStatisticsExactError = 'Exact network statistics could not be calculated.';
    } finally {
      if (this.exactCalculationController === controller) {
        this.exactCalculationController = null;
      }
      if (
        !this.isDestroyed
        && requestId === this.networkStatisticsRequestId
        && requestSignature === this.currentRequestSignature
      ) {
        this.updateTableDimensions();
        this.cdref.detectChanges();
      }
    }
  }

  ngOnDestroy(): void {
    this.isDestroyed = true;
    this.networkStatisticsRequestId++;
    this.cancelActiveCalculations();
    $(document).off('node-selected.network-statistics');
    window.removeEventListener('node-selected', this.nodeSelectedWindowHandler);
    if (this.commonService.visuals.networkStatistics === this) {
      this.commonService.visuals.networkStatistics = undefined;
    }
    this.destroy$.next();
    this.destroy$.complete();
  }

  private buildNetworkStatisticsRequest(): NetworkStatisticsRequest {
    const visibleNodes = this.commonService.getVisibleNodes();
    const visibleNodeIds = new Set(visibleNodes.map((node) => this.getNodeId(node)).filter(Boolean));
    const visibleLinks = (this.commonService.session.data.links || [])
      .filter((link) => link && link.visible !== false)
      .filter((link) => (
        visibleNodeIds.has(this.getEndpointId(link.source)) &&
        visibleNodeIds.has(this.getEndpointId(link.target))
      ));

    const metricLabel = this.commonService.session.style.widgets['link-sort-variable']
      ?? this.commonService.session.style.widgets['default-distance-metric']
      ?? '';
    const rawThreshold = this.commonService.session.style.widgets['link-threshold'];

    return {
      nodes: visibleNodes.map((node) => ({
        _id: this.getNodeId(node),
        selected: !!node.selected,
      })),
      links: visibleLinks.map((link) => ({
        source: this.getEndpointId(link.source),
        target: this.getEndpointId(link.target),
        visible: true,
      })),
      selectedNodeIds: visibleNodes
        .filter((node) => node.selected)
        .map((node) => this.getNodeId(node))
        .filter(Boolean),
      metricLabel,
      threshold: this.formatThreshold(rawThreshold, metricLabel),
    };
  }

  private buildNetworkStatisticsRequestSignature(request: NetworkStatisticsRequest): string {
    return JSON.stringify({
      nodes: request.nodes.map((node) => [this.getNodeId(node), Boolean(node.selected)]),
      links: request.links.map((link) => [
        this.getEndpointId(link.source),
        this.getEndpointId(link.target),
      ]),
      selectedNodeIds: request.selectedNodeIds || [],
      metricLabel: request.metricLabel || '',
      threshold: request.threshold ?? null,
    });
  }

  private scheduleExactNetworkStatistics(requestId: number, requestSignature: string): void {
    this.cancelScheduledExactCalculation();
    this.exactCalculationFrame = window.requestAnimationFrame(() => {
      this.exactCalculationFrame = null;
      if (
        this.isDestroyed
        || requestId !== this.networkStatisticsRequestId
        || requestSignature !== this.currentRequestSignature
      ) {
        return;
      }
      void this.startExactNetworkStatistics();
    });
  }

  private cancelScheduledExactCalculation(): void {
    if (this.exactCalculationFrame === null) {
      return;
    }
    window.cancelAnimationFrame(this.exactCalculationFrame);
    this.exactCalculationFrame = null;
  }

  private cancelActiveCalculations(): void {
    this.cancelScheduledExactCalculation();
    this.initialCalculationController?.abort();
    this.initialCalculationController = null;
    this.exactCalculationController?.abort();
    this.exactCalculationController = null;
  }

  private clearNetworkStatistics(): void {
    this.networkStatisticsRequestId++;
    this.cancelActiveCalculations();
    this.currentRequest = null;
    this.currentRequestSignature = '';
    this.networkStatisticsResult = null;
    this.networkStatisticsLoading = false;
    this.networkStatisticsError = '';
    this.networkStatisticsExactState = 'idle';
    this.networkStatisticsExactProgress = null;
    this.networkStatisticsExactError = '';
    this.syncSelectedTableData();
    this.cdref.detectChanges();
  }

  private isAbortError(error: any): boolean {
    return error?.name === 'AbortError';
  }

  private getNodeId(node: any): string {
    const id = node?._id ?? node?.id ?? '';
    return id === undefined || id === null ? '' : String(id);
  }

  private getEndpointId(endpoint: any): string {
    if (endpoint && typeof endpoint === 'object') {
      return this.getNodeId(endpoint);
    }

    return endpoint === undefined || endpoint === null ? '' : String(endpoint);
  }

  private formatThreshold(value: any, metricLabel: string): string {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return value === undefined || value === null ? '' : String(value);
    }

    return this.commonService.formatDisplayedDistanceValue(numericValue, metricLabel);
  }

  private syncSelectedTableData(): void {
    const tableData = this.getTableData(this.dataSetViewSelected);
    tableData.data = this.buildRowsForSection(this.dataSetViewSelected);
    this.SelectedTableData = tableData;
    this.updateTableDimensions();
    if (this.allRowsPaginatorSelected) {
      this.selectedRows = tableData.data.length;
      this.applySelectedRowsToTable();
    }
  }

  private getTableData(section: NetworkStatisticsSection): NetworkStatisticsTableData {
    let tableData = this.TableDatas.find((candidate) => candidate.tableType === section);
    if (tableData) {
      return tableData;
    }

    const columns = this.sectionColumns[section].map((column) => ({
      ...column,
      filterType: 'contains',
      filterValue: '',
    }));
    tableData = {
      tableType: section,
      data: [],
      tableColumns: [...columns],
      availableColumns: columns.map((column) => ({
        label: column.header,
        value: column,
      })),
    };
    this.TableDatas.push(tableData);
    return tableData;
  }

  private buildRowsForSection(section: NetworkStatisticsSection): any[] {
    if (!this.networkStatisticsResult) {
      return [];
    }

    const result = this.networkStatisticsResult;
    switch (section) {
      case 'summary':
        return this.buildSummaryRows(result);
      case 'centrality':
        return result.centrality;
      case 'components':
        return result.components
          .filter((row) => row.nodeCount > 1)
          .map(({ memberIds, diameterApproximate, ...row }) => ({
            ...row,
            diameter: diameterApproximate && row.diameter !== null ? `${this.formatCellValue('diameter', row.diameter)} approx.` : row.diameter,
          }));
      case 'degree':
        return result.degreeDistribution;
      default:
        return [];
    }
  }

  private buildSummaryRows(result: NetworkStatisticsResult): Array<{ metric: string; value: any }> {
    const summary = result.summary;
    return [
      { metric: 'Nodes', value: summary.nodeCount },
      { metric: 'Links', value: summary.linkCount },
      { metric: 'Selected Nodes', value: summary.selectedNodeCount },
      { metric: 'Clusters', value: summary.clusterCount },
      { metric: 'Singletons', value: summary.singletonCount },
      { metric: 'Largest Cluster', value: this.getLargestClusterSize(result) },
      { metric: 'Density', value: summary.density },
      { metric: 'Average Degree', value: summary.averageDegree },
      { metric: 'Max Degree', value: summary.maxDegree },
      { metric: 'Average Local Clustering', value: summary.averageLocalClusteringCoefficient },
      { metric: 'Transitivity', value: summary.transitivity },
      { metric: 'Average Reachable Path Length', value: summary.averagePathLength },
      { metric: 'Diameter', value: summary.diameter },
      { metric: 'Distance Metric', value: summary.metricLabel || 'N/A' },
      { metric: 'Threshold', value: summary.threshold ?? 'N/A' },
      { metric: 'Generated At', value: result.generatedAtIso },
    ];
  }

  private resetTableFilters(): void {
    if (!this.dataTable) {
      return;
    }

    this.dataTable.reset();
    this.dataTable.filters = {};
    this.dataTable.filteredValue = null;
  }

  private getLargestClusterSize(result: NetworkStatisticsResult): number {
    return result.components
      .filter((component) => component.nodeCount > 1)
      .reduce((largest, component) => Math.max(largest, component.nodeCount), 0);
  }

  private isAllRowsPaginatorSelected(): boolean {
    return $('.p-paginator-rpp-dropdown .p-select-label').text().trim() === 'All';
  }

  private applySelectedRowsToTable(): void {
    if (this.dataTable) {
      this.dataTable.rows = this.selectedRows;
      this.dataTable.first = 0;
    }

    this.cdref.detectChanges();
  }

  private markNetworkStatisticsRendered(): void {
    if (!this.IsDataAvailable) {
      return;
    }

    setTimeout(() => {
      this.store.setNetworkRendered(true);
    });
  }
}

export namespace NetworkStatisticsComponent {
  export const componentTypeName = 'Network Statistics';
}
