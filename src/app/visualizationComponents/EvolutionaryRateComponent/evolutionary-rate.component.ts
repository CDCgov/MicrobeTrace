import {
  AfterViewInit,
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
import { CommonService } from '@app/contactTraceCommonServices/common.service';
import { CommonStoreService } from '@app/contactTraceCommonServices/common-store.services';
import { buildSafeCsvRow } from '@app/contactTraceCommonServices/export-sanitization';
import { ExportOptions, ExportService } from '@app/contactTraceCommonServices/export.service';
import {
  getMapNodeShapeDataUri,
  resolveNodeShapeForNode,
} from '@app/contactTraceCommonServices/node-shapes';
import {
  applyNodeClickSelection,
  syncSelectedNodeIds,
} from '@app/contactTraceCommonServices/node-selection';
import { BaseComponentDirective } from '@app/base-component.directive';
import { DialogSettings } from '@app/helperClasses/dialogSettings';
import { MicobeTraceNextPluginEvents } from '@app/helperClasses/interfaces';
import { MicrobeTraceNextVisuals } from '@app/microbe-trace-next-plugin-visuals';
import { ComponentContainer } from 'golden-layout';
import { SelectItem } from 'primeng/api';
import { Subject, takeUntil } from 'rxjs';
import * as d3 from 'd3';
import { saveAs } from 'file-saver';
import {
  EVOLUTIONARY_RATE_OUTLIER_RMSE_MULTIPLIER,
  EvolutionaryRateAnalysis,
  EvolutionaryRatePoint,
  EvolutionaryRateResidual,
  calculateEvolutionaryRate,
  calendarDateToDecimalYear,
  coerceFiniteDistance,
  formatCalendarDate,
  parseCalendarDate,
  scaleEvolutionaryRateForDisplay,
} from './evolutionary-rate-analysis';
import {
  EvolutionaryRateOutlierReport,
  buildEvolutionaryRateOutlierReport,
  buildEvolutionaryRateOutlierReportMarkdown,
  buildEvolutionaryRateOutlierReportPdfDefinition,
} from './evolutionary-rate-outlier-report';

type LabelOrientation = 'Right' | 'Left' | 'Top' | 'Bottom' | 'Middle';
type PlotExportFileType = 'png' | 'jpeg' | 'webp' | 'svg';
type OutlierReportFileType = 'markdown' | 'pdf';
type TreeRootMethod = 'as-provided' | 'best-fit';

interface EvolutionaryRateExcludedDataPoint {
  index: number | string;
  id: string;
  dateValue: string;
  reason: string;
}

@Component({
  selector: 'app-evolutionary-rate-component',
  templateUrl: './evolutionary-rate.component.html',
  styleUrls: ['./evolutionary-rate.component.scss'],
  standalone: false,
})
export class EvolutionaryRateComponent extends BaseComponentDirective implements OnInit, AfterViewInit, OnDestroy, MicobeTraceNextPluginEvents {
  @ViewChild('plotExportHost') plotExportHost?: ElementRef<HTMLDivElement>;
  @ViewChild('plotHost') plotHost?: ElementRef<HTMLDivElement>;
  @ViewChild('plotTooltip') plotTooltip?: ElementRef<HTMLDivElement>;
  @Output() DisplayGlobalSettingsDialogEvent = new EventEmitter<string>();

  readonly settingsDialog = new DialogSettings('#evolutionary-rate-settings-pane', false);
  showExportDialog = false;
  statisticsExportFilename = 'evolutionary-rate-statistics.csv';
  plotExportFilename = 'evolutionary-rate-regression';
  outlierReportFilename = 'evolutionary-rate-outlier-report';
  readonly plotExportFileTypeOptions: SelectItem[] = [
    { label: 'png', value: 'png' },
    { label: 'jpeg', value: 'jpeg' },
    { label: 'webp', value: 'webp' },
    { label: 'svg', value: 'svg' },
  ];
  plotExportFileType: PlotExportFileType = 'png';
  readonly outlierReportFileTypeOptions: SelectItem[] = [
    { label: 'PDF (.pdf)', value: 'pdf' },
    { label: 'Markdown (.md)', value: 'markdown' },
  ];
  outlierReportFileType: OutlierReportFileType = 'pdf';
  plotExportScale = 1;
  plotExportQuality = 0.92;
  calculatedPlotExportResolution = '0 x 0';
  readonly orientationOptions: SelectItem[] = [
    { label: 'Middle', value: 'Middle' },
    { label: 'Top', value: 'Top' },
    { label: 'Bottom', value: 'Bottom' },
    { label: 'Left', value: 'Left' },
    { label: 'Right', value: 'Right' },
  ];
  readonly tableVisibilityOptions: SelectItem[] = [
    { label: 'Show', value: 'Show' },
    { label: 'Hide', value: 'Hide' },
  ];
  readonly treeRootMethodOptions: SelectItem[] = [
    { label: 'As provided', value: 'as-provided' },
    { label: 'Best fit', value: 'best-fit' },
  ];

  fieldOptions: SelectItem[] = [];
  tooltipFieldOptions: SelectItem[] = [];
  selectedDateField = 'None';
  selectedTableVisibility: 'Show' | 'Hide' = 'Show';
  selectedTreeRootMethod: TreeRootMethod = 'as-provided';
  selectedNodeLabelVariable = 'None';
  selectedNodeLabelSize = 16;
  selectedNodeLabelOrientation: LabelOrientation = 'Right';
  selectedNodeTooltipVariables: string[] = ['_id'];
  selectedNodeRadiusVariable = 'None';
  selectedNodeRadius = 20;
  selectedNodeRadiusMin = 15;
  selectedNodeRadiusMax = 85;
  selectedNodeBorderWidth = 2;

  activeMetric = 'snps';
  distanceSourceLabel = '';
  distanceSourceKind: 'metric' | 'patristic' = 'metric';
  referenceNodeId: string | null = null;
  viewActive = true;
  isLoading = false;
  includedCount = 0;
  excludedCount = 0;
  excludedDataPoints: EvolutionaryRateExcludedDataPoint[] = [];
  showExcludedDataPointsDialog = false;
  emptyStateMessage = '';
  regressionMessage = '';
  selectionActive = false;
  selectedNodeCount = 0;
  selectedClusterLabel = '';
  analysis: EvolutionaryRateAnalysis = calculateEvolutionaryRate([], 0);

  private readonly destroy$ = new Subject<void>();
  private readonly nodeSelectionEvent = 'node-selected.evolutionary-rate';
  private readonly nodeSelectionHandler = () => {
    if (this.viewActive) {
      void this.refreshPlot();
    }
  };
  private resizeTimer: ReturnType<typeof setTimeout> | null = null;
  private widgets: any;
  private viewInitialized = false;
  private refreshGeneration = 0;
  private distanceSourceError = '';
  private plotAnalysis: EvolutionaryRateAnalysis = calculateEvolutionaryRate([], 0);
  private readonly outlierHighlightColor = '#d32f2f';
  private readonly outlierReportLabelFontSize = 20;
  private readonly outlierReportAxisTitleFontSize = 24;
  private readonly outlierReportLegendFontSize = 20;

  constructor(
    @Inject(BaseComponentDirective.GoldenLayoutContainerInjectionToken) private container: ComponentContainer,
    elementRef: ElementRef,
    public commonService: CommonService,
    private store: CommonStoreService,
    private changeDetector: ChangeDetectorRef,
    private visuals: MicrobeTraceNextVisuals,
    private exportService: ExportService,
  ) {
    super(elementRef.nativeElement);
    this.visuals.evolutionaryRate = this;
  }

  ngOnInit(): void {
    this.widgets = this.commonService.session.style.widgets;
    this.buildFieldOptions();
    this.loadSettings();
    $(document).on(this.nodeSelectionEvent, this.nodeSelectionHandler);

    this.container.on('resize', () => this.scheduleRender());
    this.container.on('hide', () => {
      this.viewActive = false;
      this.hideTooltip();
      this.changeDetector.detectChanges();
    });
    this.container.on('show', () => {
      this.viewActive = true;
      this.refreshPlot();
      this.changeDetector.detectChanges();
    });

    this.store.clusterUpdate$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.refreshPlot());
    this.store.networkUpdated$
      .pipe(takeUntil(this.destroy$))
      .subscribe(networkUpdated => {
        if (networkUpdated) {
          this.refreshPlot();
        }
      });
    this.store.metricChanged$
      .pipe(takeUntil(this.destroy$))
      .subscribe(metric => {
        if (metric) {
          this.refreshPlot();
        }
      });
    this.store.styleFileApplied$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.applyStyleFileSettings());
  }

  ngAfterViewInit(): void {
    this.viewInitialized = true;
    this.refreshPlot();
    setTimeout(() => {
      this.settingsDialog.setVisibility(true);
      this.changeDetector.detectChanges();
    });
  }

  ngOnDestroy(): void {
    if (this.resizeTimer) {
      clearTimeout(this.resizeTimer);
    }
    $(document).off(this.nodeSelectionEvent, this.nodeSelectionHandler);
    this.destroy$.next();
    this.destroy$.complete();
  }

  openSettings(): void {
    this.settingsDialog.setVisibility(true);
  }

  openExcludedDataPoints(): void {
    this.showExcludedDataPointsDialog = true;
  }

  showGlobalSettings(): void {
    this.DisplayGlobalSettingsDialogEvent.emit('Styling');
  }

  onDateFieldChange(value: string): void {
    this.selectedDateField = value || 'None';
    this.widgets['evolutionary-rate-date-field'] = this.selectedDateField;
    this.refreshPlot();
  }

  onTableVisibilityChange(value: 'Show' | 'Hide'): void {
    this.selectedTableVisibility = value === 'Hide' ? 'Hide' : 'Show';
    this.widgets['evolutionary-rate-table-visible'] = this.selectedTableVisibility;
  }

  onTreeRootMethodChange(value: TreeRootMethod): void {
    this.selectedTreeRootMethod = value === 'best-fit' ? 'best-fit' : 'as-provided';
    this.widgets['evolutionary-rate-root-method'] = this.selectedTreeRootMethod;
    this.refreshPlot();
  }

  onNodeLabelVariableChange(value: string): void {
    this.selectedNodeLabelVariable = value || 'None';
    this.widgets['evolutionary-rate-node-label-variable'] = this.selectedNodeLabelVariable;
    this.refreshPlot();
  }

  onNodeLabelSizeChange(value: any): void {
    this.selectedNodeLabelSize = this.toFiniteNumber(value?.target?.value ?? value, 16);
    this.widgets['evolutionary-rate-node-label-size'] = this.selectedNodeLabelSize;
    this.refreshPlot();
  }

  onNodeLabelOrientationChange(value: LabelOrientation): void {
    this.selectedNodeLabelOrientation = value || 'Right';
    this.widgets['evolutionary-rate-node-label-orientation'] = this.selectedNodeLabelOrientation;
    this.refreshPlot();
  }

  onNodeTooltipVariableChange(value: any): void {
    this.selectedNodeTooltipVariables = Array.isArray(value) ? value : [value].filter(Boolean);
    this.widgets['evolutionary-rate-node-tooltip-variable'] = [...this.selectedNodeTooltipVariables];
  }

  onNodeRadiusVariableChange(value: string): void {
    this.selectedNodeRadiusVariable = value || 'None';
    this.widgets['evolutionary-rate-node-radius-variable'] = this.selectedNodeRadiusVariable;
    this.refreshPlot();
  }

  onNodeRadiusChange(value: any): void {
    this.selectedNodeRadius = this.toFiniteNumber(value, 20);
    this.widgets['evolutionary-rate-node-radius'] = this.selectedNodeRadius;
    this.refreshPlot();
  }

  onNodeRadiusMinChange(value: any): void {
    this.selectedNodeRadiusMin = this.toFiniteNumber(value, 15);
    this.widgets['evolutionary-rate-node-radius-min'] = this.selectedNodeRadiusMin;
    this.refreshPlot();
  }

  onNodeRadiusMaxChange(value: any): void {
    this.selectedNodeRadiusMax = this.toFiniteNumber(value, 85);
    this.widgets['evolutionary-rate-node-radius-max'] = this.selectedNodeRadiusMax;
    this.refreshPlot();
  }

  onNodeBorderWidthChange(value: any): void {
    this.selectedNodeBorderWidth = Math.max(0, this.toFiniteNumber(value, 2));
    this.widgets['evolutionary-rate-node-border-width'] = this.selectedNodeBorderWidth;
    this.refreshPlot();
  }

  loadSettings(): void {
    this.widgets = this.commonService.session.style.widgets;
    this.selectedDateField = this.widgets['evolutionary-rate-date-field'] || 'None';
    this.selectedTableVisibility = this.widgets['evolutionary-rate-table-visible'] === 'Hide' ? 'Hide' : 'Show';
    this.selectedTreeRootMethod = this.widgets['evolutionary-rate-root-method'] === 'best-fit'
      ? 'best-fit'
      : 'as-provided';
    this.selectedNodeLabelVariable = this.widgets['evolutionary-rate-node-label-variable'] || 'None';
    this.selectedNodeLabelSize = this.toFiniteNumber(this.widgets['evolutionary-rate-node-label-size'], 16);
    this.selectedNodeLabelOrientation = this.normalizeOrientation(this.widgets['evolutionary-rate-node-label-orientation']);
    const tooltipVariables = this.widgets['evolutionary-rate-node-tooltip-variable'];
    this.selectedNodeTooltipVariables = Array.isArray(tooltipVariables) ? [...tooltipVariables] : ['_id'];
    this.selectedNodeRadiusVariable = this.widgets['evolutionary-rate-node-radius-variable'] || 'None';
    this.selectedNodeRadius = this.toFiniteNumber(this.widgets['evolutionary-rate-node-radius'], 20);
    this.selectedNodeRadiusMin = this.toFiniteNumber(this.widgets['evolutionary-rate-node-radius-min'], 15);
    this.selectedNodeRadiusMax = this.toFiniteNumber(this.widgets['evolutionary-rate-node-radius-max'], 85);
    this.selectedNodeBorderWidth = Math.max(0, this.toFiniteNumber(this.widgets['evolutionary-rate-node-border-width'], 2));
  }

  updateNodeColors(): void {
    this.refreshPlot();
  }

  updateNodeShapes(): void {
    this.refreshPlot();
  }

  updateVisualization(): void {
    this.refreshPlot();
  }

  refreshDistanceDisplayFormat(): void {
    this.refreshPlot();
  }

  applyStyleFileSettings(): void {
    this.buildFieldOptions();
    this.loadSettings();
    this.refreshPlot();
  }

  updateLinkColor(): void {}
  openRefreshScreen(): void {}
  openExport(): void {
    this.updateCalculatedPlotExportResolution();
    this.showExportDialog = true;
  }

  onPlotExportFileTypeChange(value: PlotExportFileType): void {
    this.plotExportFileType = this.normalizePlotExportFileType(value);
    this.updateCalculatedPlotExportResolution();
  }

  updateCalculatedPlotExportResolution(): void {
    const dimensions = this.getPlotExportDimensions();
    const scale = this.getPlotExportScale();
    this.calculatedPlotExportResolution = `${Math.round(dimensions.width * scale)} x ${Math.round(dimensions.height * scale)}`;
  }

  buildStatisticsCsv(): string {
    return [
      ['Statistic', 'Value'],
      ...this.getStatisticsRows().map(row => [row.csvLabel || row.label, row.value]),
    ].map(row => buildSafeCsvRow(row)).join('\r\n');
  }

  downloadStatisticsTable(): void {
    if (this.analysis.points.length === 0) return;
    const blob = new Blob(['\uFEFF', this.buildStatisticsCsv()], { type: 'text/csv;charset=utf-8' });
    this.saveGeneratedFile(blob, this.ensureFilenameExtension(this.statisticsExportFilename, '.csv'));
  }

  async downloadOutlierReport(): Promise<void> {
    if (!this.canExportOutlierReport) return;

    const report = this.buildOutlierReport();
    const baseFilename = this.getOutlierReportBaseFilename();
    if (this.outlierReportFileType === 'pdf') {
      await this.downloadOutlierReportPdf(report, `${baseFilename}.pdf`);
      return;
    }

    const markdown = buildEvolutionaryRateOutlierReportMarkdown(report);
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    this.saveGeneratedFile(blob, `${baseFilename}.md`);
  }

  downloadRegressionPlot(): void {
    const svg = this.plotHost?.nativeElement.querySelector('svg');
    if (!svg) return;

    const filetype = this.normalizePlotExportFileType(this.plotExportFileType);
    const exportOptions: ExportOptions = {
      filename: this.getPlotExportBaseFilename(),
      filetype,
      scale: this.getPlotExportScale(),
      quality: this.getPlotExportQuality(),
    };
    this.exportService.setExportOptions(exportOptions);

    if (filetype !== 'svg') {
      const exportHost = this.plotExportHost?.nativeElement || this.plotHost!.nativeElement;
      this.exportService.requestExport([exportHost], true, false, true);
      return;
    }

    const exportedSvg = svg.cloneNode(true) as SVGSVGElement;
    exportedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    exportedSvg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    this.appendStatisticsTableToSvg(exportedSvg);
    const serialized = `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(exportedSvg)}`;
    this.exportService.requestSVGExport([], serialized, true, false, true);
  }

  onRecallSession(): void {
    this.buildFieldOptions();
    this.loadSettings();
    this.refreshPlot();
  }

  onLoadNewData(): void {
    this.buildFieldOptions();
    this.loadSettings();
    if (!this.fieldOptions.some(option => option.value === this.selectedDateField)) {
      this.selectedDateField = 'None';
      this.widgets['evolutionary-rate-date-field'] = 'None';
      this.settingsDialog.setVisibility(true);
    }
    this.refreshPlot();
  }

  onFilterDataChange(): void {
    this.refreshPlot();
  }

  goldenLayoutComponentResize(): void {
    this.scheduleRender();
  }

  get metricLabel(): string {
    return this.formatMetricLabel(this.activeMetric);
  }

  get distanceAxisLabel(): string {
    return this.distanceSourceKind === 'patristic'
      ? 'Patristic Distance'
      : `Genetic Distance (${this.metricLabel})`;
  }

  get tableVisible(): boolean {
    return this.selectedTableVisibility === 'Show';
  }

  get canExportOutlierReport(): boolean {
    return this.analysis.slope !== null
      && this.analysis.intercept !== null
      && Boolean(this.plotHost?.nativeElement.querySelector('svg'));
  }

  get outlierCandidateCount(): number {
    return this.analysis.outliers.length;
  }

  formatDateRange(): string {
    if (!this.analysis.minDate || !this.analysis.maxDate || this.analysis.dateSpanYears === null) {
      return 'N/A';
    }
    return `${formatCalendarDate(this.analysis.minDate)} – ${formatCalendarDate(this.analysis.maxDate)} (${this.analysis.dateSpanYears.toFixed(2)} years)`;
  }

  formatSlope(): string {
    if (this.analysis.slope === null) {
      return 'N/A';
    }
    const displayAnalysis = scaleEvolutionaryRateForDisplay(this.analysis, this.usesPercentageDistanceDisplay());
    return this.formatNumber(displayAnalysis.slope as number);
  }

  formatTmrca(): string {
    return formatCalendarDate(this.analysis.tmrcaDate);
  }

  formatCorrelation(): string {
    return this.analysis.correlation === null ? 'N/A' : this.analysis.correlation.toFixed(4);
  }

  formatRSquared(): string {
    return this.analysis.rSquared === null ? 'N/A' : this.analysis.rSquared.toFixed(4);
  }

  formatResidualMeanSquared(): string {
    if (this.analysis.residualMeanSquared === null) {
      return 'N/A';
    }
    const displayAnalysis = scaleEvolutionaryRateForDisplay(this.analysis, this.usesPercentageDistanceDisplay());
    return this.formatNumber(displayAnalysis.residualMeanSquared as number);
  }

  private buildFieldOptions(): void {
    const fields = (this.commonService.session.data.nodeFields || []).filter((field: any) => typeof field === 'string');
    this.fieldOptions = [
      { label: 'None', value: 'None' },
      ...fields.map((field: string) => ({ label: this.commonService.titleize(field), value: field })),
    ];
    this.tooltipFieldOptions = fields.map((field: string) => ({
      label: this.commonService.titleize(field),
      value: field,
    }));
  }

  private async refreshPlot(): Promise<void> {
    if (!this.viewInitialized || !this.plotHost || !this.viewActive) {
      return;
    }

    const refreshGeneration = ++this.refreshGeneration;
    this.widgets = this.commonService.session.style.widgets;
    this.activeMetric = String(this.widgets['default-distance-metric'] || 'snps').toLowerCase();
    this.distanceSourceKind = this.commonService.hasPhylogeneticDistanceSource() ? 'patristic' : 'metric';
    this.referenceNodeId = null;
    this.distanceSourceError = '';
    this.excludedDataPoints = [];
    this.isLoading = Boolean(
      this.commonService.session.network?.rendering &&
      !this.commonService.session.network?.isFullyLoaded
    );
    const visibleNodes = this.isLoading ? [] : this.commonService.getVisibleNodes();
    const selectedVisibleNodes = visibleNodes.filter((node: any) => Boolean(node?.selected));
    this.selectionActive = selectedVisibleNodes.length > 0;
    this.selectedNodeCount = selectedVisibleNodes.length;
    this.selectedClusterLabel = this.getSelectedClusterLabel(selectedVisibleNodes, visibleNodes);
    const analysisNodes = this.selectionActive ? selectedVisibleNodes : visibleNodes;
    const analysisNodeSet = new Set<any>(analysisNodes);
    const analysisNodeIds = new Set<string>();
    visibleNodes.forEach((node: any, visibleIndex: number) => {
      if (analysisNodeSet.has(node)) {
        analysisNodeIds.add(String(node?._id ?? node?.id ?? node?.index ?? visibleIndex));
      }
    });
    const points: EvolutionaryRatePoint[] = [];
    const excludedDataPoints: EvolutionaryRateExcludedDataPoint[] = [];
    const datedNodes: Array<{ node: any; id: string; date: Date; visibleIndex: number }> = [];

    visibleNodes.forEach((node: any, visibleIndex: number) => {
      const id = String(node?._id ?? node?.id ?? node?.index ?? visibleIndex);
      const excludedIndex = node?.index ?? visibleIndex;
      if (this.selectedDateField === 'None') {
        excludedDataPoints.push({
          index: excludedIndex,
          id,
          dateValue: 'N/A',
          reason: 'No sample collection date field is selected.',
        });
        return;
      }

      const rawDate = node[this.selectedDateField];
      const date = this.commonService.hasValidTimelineDateValue(rawDate)
        ? parseCalendarDate(rawDate)
        : null;
      if (!date) {
        excludedDataPoints.push({
          index: excludedIndex,
          id,
          dateValue: this.formatNodeValue(rawDate),
          reason: `Missing or invalid ${this.selectedDateField} value.`,
        });
        return;
      }

      datedNodes.push({ node, id, date, visibleIndex });
    });

    let distances = new Map<string, number>();

    if (!this.isLoading && datedNodes.length > 0) {
      if (this.distanceSourceKind === 'patristic') {
        const useBestFitRoot = this.selectedTreeRootMethod === 'best-fit';
        this.distanceSourceLabel = useBestFitRoot
          ? 'Best-fit patristic root-to-tip distance'
          : 'Patristic root-to-tip distance';
        this.isLoading = true;
        this.emptyStateMessage = useBestFitRoot
          ? 'Locating the best-fit tree root…'
          : 'Calculating patristic root-to-tip distances…';
        this.renderPlot();
        this.changeDetector.detectChanges();
        try {
          if (useBestFitRoot) {
            const regressionDatedNodes = this.selectionActive
              ? datedNodes.filter(item => analysisNodeSet.has(item.node))
              : datedNodes;
            distances = await this.commonService.getPatristicBestFitRootDistanceMap(
              regressionDatedNodes.map(item => ({
                id: item.id,
                decimalYear: calendarDateToDecimalYear(item.date),
              }))
            );
          } else {
            distances = await this.commonService.getPatristicRootDistanceMap();
          }
        } catch (error: any) {
          this.distanceSourceError = `Patristic distances could not be calculated: ${error?.message || error}`;
        }
        if (refreshGeneration !== this.refreshGeneration) return;
        this.isLoading = false;
      } else {
        const reference = [...datedNodes].sort((a, b) => (
          a.date.getTime() - b.date.getTime() || a.id.localeCompare(b.id)
        ))[0];
        this.referenceNodeId = reference.id;
        this.distanceSourceLabel = `${this.metricLabel} distance from earliest dated sample (${reference.id})`;
        datedNodes.forEach(item => {
          const distance = this.commonService.getActiveNodePairDistance(reference.id, item.id);
          if (distance !== null) {
            distances.set(item.id, distance);
          }
        });
      }
    } else {
      this.distanceSourceLabel = this.distanceSourceKind === 'patristic'
        ? this.selectedTreeRootMethod === 'best-fit'
          ? 'Best-fit patristic root-to-tip distance'
          : 'Patristic root-to-tip distance'
        : `${this.metricLabel} distance`;
    }

    if (this.selectedDateField !== 'None') {
      datedNodes.forEach(({ node, id, date, visibleIndex }) => {
        const distance = coerceFiniteDistance(distances.get(id));
        if (distance === null) {
          excludedDataPoints.push({
            index: node?.index ?? visibleIndex,
            id,
            dateValue: this.formatNodeValue(node[this.selectedDateField]),
            reason: this.distanceSourceKind === 'patristic'
              ? 'No patristic root-to-tip distance is available.'
              : `No stored ${this.metricLabel} distance from ${this.referenceNodeId || 'the reference sample'} is available.`,
          });
          return;
        }
        points.push({
          id,
          node,
          date,
          decimalYear: calendarDateToDecimalYear(date),
          distance,
        });
      });
    }

    const analysisPoints = this.selectionActive
      ? points.filter(point => analysisNodeSet.has(point.node))
      : points;
    this.excludedDataPoints = this.selectionActive
      ? excludedDataPoints.filter(point => analysisNodeIds.has(point.id))
      : excludedDataPoints;
    this.plotAnalysis = calculateEvolutionaryRate(points, visibleNodes.length);
    this.analysis = calculateEvolutionaryRate(analysisPoints, analysisNodes.length);
    this.includedCount = this.analysis.includedCount;
    this.excludedCount = this.analysis.excludedCount;
    this.updateMessages(visibleNodes.length);
    this.renderPlot();
    this.changeDetector.detectChanges();
    if (!this.isLoading) {
      setTimeout(() => this.store.setNetworkRendered(true));
    }
  }

  private updateMessages(visibleNodeCount: number): void {
    this.emptyStateMessage = '';
    this.regressionMessage = '';

    if (this.isLoading) {
      this.emptyStateMessage = 'Loading node data…';
      return;
    }
    if (this.selectedDateField === 'None') {
      this.emptyStateMessage = 'Choose a Sample Collection Date field in Settings to generate the plot.';
      return;
    }
    if (this.distanceSourceError) {
      this.emptyStateMessage = this.distanceSourceError;
      return;
    }
    if (visibleNodeCount === 0) {
      this.emptyStateMessage = 'No nodes are currently visible.';
      return;
    }
    if (this.plotAnalysis.points.length === 0) {
      this.emptyStateMessage = this.distanceSourceKind === 'patristic'
        ? 'No visible tree tips contain both a valid collection date and a patristic root-to-tip distance.'
        : 'No visible nodes contain both a valid collection date and the active genetic distance.';
      return;
    }
    if (this.analysis.points.length === 0) {
      this.emptyStateMessage = 'No selected nodes contain both a valid collection date and the active distance.';
      return;
    }
    if (this.analysis.slope === null) {
      this.regressionMessage = this.distanceSourceKind === 'metric' && this.analysis.points.length < 2
        ? `At least two dated nodes with a stored ${this.metricLabel} distance from ${this.referenceNodeId || 'the reference sample'} are required for regression.`
        : 'At least two valid nodes with distinct collection dates are required for regression.';
    }
  }

  private scheduleRender(): void {
    if (this.resizeTimer) {
      clearTimeout(this.resizeTimer);
    }
    this.resizeTimer = setTimeout(() => this.refreshPlot(), 80);
  }

  private renderPlot(): void {
    const hostElement = this.plotHost?.nativeElement;
    if (!hostElement) {
      return;
    }

    const host = d3.select(hostElement);
    host.selectAll('svg').remove();
    this.hideTooltip();

    if (this.plotAnalysis.points.length === 0) {
      return;
    }

    const width = Math.max(360, hostElement.clientWidth || this.container.width || 800);
    const height = Math.max(300, hostElement.clientHeight || (this.container.height - 44) || 500);
    const displayPlotAnalysis = scaleEvolutionaryRateForDisplay(
      this.plotAnalysis,
      this.usesPercentageDistanceDisplay()
    );
    const displayAnalysis = scaleEvolutionaryRateForDisplay(
      this.analysis,
      this.usesPercentageDistanceDisplay()
    );
    const showSelectionRegressionLegend = this.selectionActive
      && displayAnalysis.slope !== null
      && displayAnalysis.intercept !== null;
    const legendRowCount = Number(showSelectionRegressionLegend)
      + Number(displayAnalysis.outliers.length > 0);
    const margin = { top: legendRowCount > 1 ? 56 : 32, right: 40, bottom: 72, left: 88 };
    const innerWidth = Math.max(1, width - margin.left - margin.right);
    const innerHeight = Math.max(1, height - margin.top - margin.bottom);
    const points = displayPlotAnalysis.points;
    const dateExtent = d3.extent(points, point => point.date.getTime()) as [number, number];
    const distanceExtent = d3.extent(points, point => point.distance) as [number, number];
    const day = 24 * 60 * 60 * 1000;
    const datePadding = dateExtent[0] === dateExtent[1]
      ? day
      : Math.max(day, (dateExtent[1] - dateExtent[0]) * 0.04);
    const distanceSpan = distanceExtent[1] - distanceExtent[0];
    const minimumDistancePadding = this.usesPercentageDistanceDisplay()
      ? 0.1
      : this.activeMetric === 'tn93' ? 0.001 : 1;
    const distancePadding = distanceSpan === 0
      ? Math.max(minimumDistancePadding, Math.abs(distanceExtent[0]) * 0.1)
      : distanceSpan * 0.08;
    const xScale = d3.scaleTime()
      .domain([new Date(dateExtent[0] - datePadding), new Date(dateExtent[1] + datePadding)])
      .range([0, innerWidth]);
    const yScale = d3.scaleLinear()
      .domain([distanceExtent[0] - distancePadding, distanceExtent[1] + distancePadding])
      .nice()
      .range([innerHeight, 0]);

    const backgroundColor = this.widgets['background-color'] || '#ffffff';
    const contrastColor = this.widgets['background-color-contrast'] || '#303030';
    const svg = host.append('svg')
      .attr('data-testid', 'evolutionary-rate-plot')
      .attr('role', 'img')
      .attr('aria-label', `${this.selectedDateField} by ${this.distanceAxisLabel} regression plot`)
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .style('background-color', backgroundColor);
    const clipId = `evolutionary-rate-clip-${Math.random().toString(36).slice(2)}`;
    svg.append('defs')
      .append('clipPath')
      .attr('id', clipId)
      .append('rect')
      .attr('width', innerWidth)
      .attr('height', innerHeight);
    const chart = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const xAxis = d3.axisBottom(xScale)
      .ticks(Math.max(3, Math.min(8, Math.floor(innerWidth / 120))))
      .tickFormat(d3.timeFormat('%Y-%m-%d') as any);
    const yAxis = d3.axisLeft(yScale)
      .ticks(Math.max(4, Math.min(10, Math.floor(innerHeight / 55))))
      .tickFormat((value: any) => this.formatAxisDistance(Number(value)) as any);
    const xAxisGroup = chart.append('g')
      .attr('class', 'evolutionary-rate-x-axis')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis as any);
    const yAxisGroup = chart.append('g')
      .attr('class', 'evolutionary-rate-y-axis')
      .call(yAxis as any);
    xAxisGroup.selectAll('text').attr('fill', contrastColor);
    yAxisGroup.selectAll('text').attr('fill', contrastColor);
    xAxisGroup.selectAll('path,line').attr('stroke', contrastColor);
    yAxisGroup.selectAll('path,line').attr('stroke', contrastColor);

    chart.append('text')
      .attr('class', 'axis-title')
      .attr('data-testid', 'evolutionary-rate-x-axis-title')
      .attr('x', innerWidth / 2)
      .attr('y', innerHeight + 56)
      .attr('text-anchor', 'middle')
      .attr('fill', contrastColor)
      .text(this.selectedDateField);
    chart.append('text')
      .attr('class', 'axis-title')
      .attr('data-testid', 'evolutionary-rate-y-axis-title')
      .attr('transform', 'rotate(-90)')
      .attr('x', -innerHeight / 2)
      .attr('y', -62)
      .attr('text-anchor', 'middle')
      .attr('fill', contrastColor)
      .text(this.distanceAxisLabel);

    const plotLayer = chart.append('g').attr('clip-path', `url(#${clipId})`);
    const markerSizes = this.buildMarkerSizes(points);
    const residualsByPointId = new Map<string, EvolutionaryRateResidual>(
      displayAnalysis.residuals.map(residual => [residual.point.id, residual])
    );
    const outlierPointIds = new Set(displayAnalysis.outliers.map(residual => residual.point.id));
    const outlierPoints = points.filter(point => outlierPointIds.has(point.id));
    let nextLegendRow = 0;

    if (showSelectionRegressionLegend) {
      const regressionNodeCount = displayAnalysis.includedCount;
      const regressionText = `Regression based on ${regressionNodeCount} highlighted node${regressionNodeCount === 1 ? '' : 's'}`;
      const legendText = this.selectedClusterLabel
        ? `${this.selectedClusterLabel}: ${regressionText}`
        : regressionText;
      const legendWidth = Math.max(272, Math.ceil(22 + (legendText.length * 6.4)));
      const legend = svg.append('g')
        .attr('data-testid', 'evolutionary-rate-selection-legend')
        .attr('role', 'img')
        .attr('aria-label', legendText)
        .attr(
          'transform',
          `translate(${Math.max(margin.left, width - margin.right - legendWidth)},${16 + (nextLegendRow * 24)})`
        )
        .style('pointer-events', 'none');
      legend.append('circle')
        .attr('cx', 8)
        .attr('cy', 0)
        .attr('r', 6)
        .attr('fill', backgroundColor)
        .attr('stroke', this.getSelectedNodeStrokeColor())
        .attr('stroke-width', 3);
      legend.append('text')
        .attr('x', 22)
        .attr('y', 0)
        .attr('dominant-baseline', 'middle')
        .attr('fill', contrastColor)
        .attr('font-family', 'Roboto, Helvetica Neue, sans-serif')
        .attr('font-size', 12)
        .attr('font-weight', 600)
        .text(legendText);
      nextLegendRow++;
    }

    if (outlierPoints.length > 0) {
      const legendWidth = 235;
      const legend = svg.append('g')
        .attr('data-testid', 'evolutionary-rate-outlier-legend')
        .attr('role', 'img')
        .attr('aria-label', `Potential outlier: absolute residual at least ${EVOLUTIONARY_RATE_OUTLIER_RMSE_MULTIPLIER} times RMSE`)
        .attr(
          'transform',
          `translate(${Math.max(margin.left, width - margin.right - legendWidth)},${16 + (nextLegendRow * 24)})`
        )
        .style('pointer-events', 'none');
      legend.append('rect')
        .attr('x', 1)
        .attr('y', -7)
        .attr('width', 14)
        .attr('height', 14)
        .attr('rx', 4)
        .attr('fill', 'none')
        .attr('stroke', this.outlierHighlightColor)
        .attr('stroke-width', 2.5)
        .attr('stroke-dasharray', '5 3');
      legend.append('text')
        .attr('x', 22)
        .attr('y', 0)
        .attr('dominant-baseline', 'middle')
        .attr('fill', contrastColor)
        .attr('font-family', 'Roboto, Helvetica Neue, sans-serif')
        .attr('font-size', 12)
        .attr('font-weight', 600)
        .text(`Potential outlier (≥ ${EVOLUTIONARY_RATE_OUTLIER_RMSE_MULTIPLIER} × RMSE)`);

      const highlights = plotLayer.selectAll('g.evolutionary-rate-outlier-highlight')
        .data(outlierPoints)
        .enter()
        .append('g')
        .attr('class', 'evolutionary-rate-outlier-highlight')
        .attr('data-testid', 'evolutionary-rate-outlier-highlight')
        .attr('data-node-id', point => point.id)
        .attr('aria-hidden', 'true')
        .attr('transform', point => `translate(${xScale(point.date)},${yScale(point.distance)})`)
        .style('pointer-events', 'none');

      highlights.each((point: EvolutionaryRatePoint, index: number, nodes: any[]) => {
        const markerSize = markerSizes.get(point.id) || this.selectedNodeRadius;
        const x = -(markerSize / 2) - 4;
        const y = -(markerSize / 2) - 4;
        const size = markerSize + 8;
        const highlight = d3.select(nodes[index]);
        highlight.append('rect')
          .attr('x', x)
          .attr('y', y)
          .attr('width', size)
          .attr('height', size)
          .attr('rx', 6)
          .attr('fill', 'none')
          .attr('stroke', backgroundColor)
          .attr('stroke-width', 7);
        highlight.append('rect')
          .attr('x', x)
          .attr('y', y)
          .attr('width', size)
          .attr('height', size)
          .attr('rx', 6)
          .attr('fill', 'none')
          .attr('stroke', this.outlierHighlightColor)
          .attr('stroke-width', 3)
          .attr('stroke-dasharray', '6 3');
      });
    }

    const markerSelection = plotLayer.selectAll('image.evolutionary-rate-point')
      .data(points)
      .enter()
      .append('image')
      .attr('class', point => outlierPointIds.has(point.id)
        ? 'evolutionary-rate-point evolutionary-rate-outlier-point'
        : 'evolutionary-rate-point')
      .attr('data-testid', 'evolutionary-rate-point')
      .attr('data-node-id', point => point.id)
      .attr('data-selected', point => point.node?.selected ? 'true' : 'false')
      .attr('data-outlier', point => outlierPointIds.has(point.id) ? 'true' : 'false')
      .attr('aria-label', point => [
        point.id,
        point.node?.selected ? 'selected' : '',
        outlierPointIds.has(point.id)
          ? `potential outlier, absolute residual at least ${EVOLUTIONARY_RATE_OUTLIER_RMSE_MULTIPLIER} times RMSE`
          : '',
      ].filter(Boolean).join(', '))
      .attr('role', 'button')
      .attr('tabindex', 0)
      .attr('href', point => this.getNodeMarkerDataUri(
        point.node,
        markerSizes.get(point.id) || this.selectedNodeRadius,
      ))
      .attr('width', point => markerSizes.get(point.id) || this.selectedNodeRadius)
      .attr('height', point => markerSizes.get(point.id) || this.selectedNodeRadius)
      .attr('x', point => xScale(point.date) - ((markerSizes.get(point.id) || this.selectedNodeRadius) / 2))
      .attr('y', point => yScale(point.distance) - ((markerSizes.get(point.id) || this.selectedNodeRadius) / 2))
      .style('cursor', 'pointer');
    markerSelection
      .on('click', (point: EvolutionaryRatePoint) => {
        const event = (d3 as any).event as MouseEvent | undefined;
        event?.stopPropagation();
        this.selectNode(point.node, Boolean(event?.ctrlKey || event?.metaKey));
      })
      .on('keydown', (point: EvolutionaryRatePoint) => {
        const event = (d3 as any).event as KeyboardEvent | undefined;
        if (event?.key !== 'Enter' && event?.key !== ' ') {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        this.selectNode(point.node, Boolean(event.ctrlKey || event.metaKey));
      })
      .on('mouseenter', (point: EvolutionaryRatePoint) => this.showTooltip(
        point,
        residualsByPointId.get(point.id)
      ))
      .on('mousemove', () => this.positionTooltip())
      .on('mouseleave', () => this.hideTooltip());
    svg.on('click', () => this.clearNodeSelection());

    // Append the regression after the markers so it remains visible across dense point clouds.
    // Pointer events stay disabled so the overlaid line does not interfere with node tooltips.
    if (displayAnalysis.slope !== null && displayAnalysis.intercept !== null && displayAnalysis.minDate && displayAnalysis.maxDate) {
      const regressionPoints = xScale.domain().map(date => {
        const decimalYear = calendarDateToDecimalYear(date);
        return {
          date,
          distance: displayAnalysis.intercept + (displayAnalysis.slope * decimalYear),
        };
      });
      plotLayer.append('line')
        .attr('data-testid', 'evolutionary-rate-regression-line')
        .attr('x1', xScale(regressionPoints[0].date))
        .attr('x2', xScale(regressionPoints[1].date))
        .attr('y1', yScale(regressionPoints[0].distance))
        .attr('y2', yScale(regressionPoints[1].distance))
        .attr('stroke', contrastColor)
        .attr('stroke-width', 2.5)
        .attr('stroke-dasharray', '7 4')
        .style('pointer-events', 'none');
    }

    if (this.selectedNodeLabelVariable !== 'None') {
      const labels = plotLayer.selectAll('text.evolutionary-rate-node-label')
        .data(points)
        .enter()
        .append('text')
        .attr('class', 'evolutionary-rate-node-label')
        .attr('font-size', `${this.selectedNodeLabelSize}px`)
        .attr('fill', contrastColor)
        .text(point => this.formatNodeValue(point.node[this.selectedNodeLabelVariable]));
      labels.each((point: EvolutionaryRatePoint, index: number, nodes: any[]) => {
        const size = markerSizes.get(point.id) || this.selectedNodeRadius;
        const position = this.getLabelPosition(point, size, xScale, yScale);
        d3.select(nodes[index])
          .attr('x', position.x)
          .attr('y', position.y)
          .attr('text-anchor', position.anchor)
          .attr('dominant-baseline', position.baseline);
      });
    }
  }

  private buildMarkerSizes(points: EvolutionaryRatePoint[]): Map<string, number> {
    const sizes = new Map<string, number>();
    if (this.selectedNodeRadiusVariable === 'None') {
      points.forEach(point => sizes.set(point.id, Math.max(5, this.selectedNodeRadius)));
      return sizes;
    }

    const values = points
      .map(point => coerceFiniteDistance(point.node[this.selectedNodeRadiusVariable]))
      .filter((value): value is number => value !== null);
    const extent = d3.extent(values) as [number | undefined, number | undefined];
    const minSize = Math.max(5, Math.min(this.selectedNodeRadiusMin, this.selectedNodeRadiusMax));
    const maxSize = Math.max(minSize, Math.max(this.selectedNodeRadiusMin, this.selectedNodeRadiusMax));
    const midpoint = (minSize + maxSize) / 2;
    const scale = extent[0] !== undefined && extent[1] !== undefined && extent[0] !== extent[1]
      ? d3.scaleLinear().domain([extent[0], extent[1]]).range([minSize, maxSize])
      : null;

    points.forEach(point => {
      const value = coerceFiniteDistance(point.node[this.selectedNodeRadiusVariable]);
      sizes.set(point.id, value !== null && scale ? scale(value) : midpoint);
    });
    return sizes;
  }

  private getSelectedNodeStrokeColor(): string {
    return this.widgets['selected-node-stroke-color']
      || this.widgets['selected-color']
      || '#ff8300';
  }

  private getSelectedClusterLabel(selectedNodes: any[], visibleNodes: any[]): string {
    if (selectedNodes.length === 0) return '';

    const clusterField = (this.commonService.session.data.nodeFields || [])
      .find((field: any) => typeof field === 'string' && field.toLowerCase() === 'cluster');
    if (!clusterField) return '';

    const clusterValues = new Set<string>();
    selectedNodes.forEach(node => {
      const value = node?.[clusterField];
      if (value !== null && value !== undefined && String(value).trim() !== '') {
        clusterValues.add(String(value));
      }
    });
    if (clusterValues.size !== 1) return '';

    const clusterValue = Array.from(clusterValues)[0];
    const selectedNodeSet = new Set(selectedNodes);
    const visibleClusterNodes = visibleNodes.filter(node => String(node?.[clusterField]) === clusterValue);
    if (
      visibleClusterNodes.length !== selectedNodes.length
      || visibleClusterNodes.some(node => !selectedNodeSet.has(node))
    ) {
      return '';
    }

    return `Cluster ${clusterValue}`;
  }

  private getNodeMarkerDataUri(node: any, markerSize: number): string {
    const fillStyle = this.commonService.getNodeFillStyle(node);
    const shapeKey = resolveNodeShapeForNode(
      node,
      this.commonService.session.style.widgets,
      this.commonService.session.style,
      this.commonService.temp.style.nodeSymbolMap,
    );
    const strokeColor = node?.selected
      ? this.getSelectedNodeStrokeColor()
      : this.widgets['background-color-contrast'] || '#000000';
    const displayStrokeWidth = node?.selected
      ? this.toFiniteNumber(
        String(this.widgets['selected-node-stroke-width'] || '3').replace('px', ''),
        3,
      )
      : this.selectedNodeBorderWidth;
    return getMapNodeShapeDataUri(
      shapeKey,
      fillStyle.color,
      strokeColor,
      this.toMarkerSvgStrokeWidth(markerSize, displayStrokeWidth),
      fillStyle.alpha,
    );
  }

  private selectNode(node: any, additive: boolean): void {
    const id = String(node?._id ?? node?.id ?? '');
    if (!id) {
      return;
    }
    const data = this.commonService.session.data;
    const changed = applyNodeClickSelection(
      data.nodes,
      data.nodeFilteredValues || [],
      id,
      additive,
    );
    if (changed) {
      $(document).trigger('node-selected');
    }
  }

  private clearNodeSelection(): void {
    const data = this.commonService.session.data;
    const changed = syncSelectedNodeIds(
      data.nodes,
      data.nodeFilteredValues || [],
      new Set<string>(),
    );
    if (changed) {
      $(document).trigger('node-selected');
    }
  }

  private toMarkerSvgStrokeWidth(markerSize: number, displayStrokeWidth: number): number {
    const safeMarkerSize = Math.max(5, markerSize);
    const safeDisplayWidth = Math.max(0, Math.min(displayStrokeWidth, (safeMarkerSize / 2) - 0.1));
    const fixedPaddingWidth = safeDisplayWidth * 340 / safeMarkerSize;
    if (fixedPaddingWidth <= 20) {
      return fixedPaddingWidth;
    }
    return safeDisplayWidth * 300 / (safeMarkerSize - (2 * safeDisplayWidth));
  }

  private getLabelPosition(
    point: EvolutionaryRatePoint,
    size: number,
    xScale: d3.ScaleTime<number, number>,
    yScale: d3.ScaleLinear<number, number>,
  ): { x: number; y: number; anchor: string; baseline: string } {
    const x = xScale(point.date);
    const y = yScale(point.distance);
    const offset = (size / 2) + 4;
    switch (this.selectedNodeLabelOrientation) {
      case 'Left':
        return { x: x - offset, y, anchor: 'end', baseline: 'middle' };
      case 'Top':
        return { x, y: y - offset, anchor: 'middle', baseline: 'auto' };
      case 'Bottom':
        return { x, y: y + offset, anchor: 'middle', baseline: 'hanging' };
      case 'Middle':
        return { x, y, anchor: 'middle', baseline: 'middle' };
      case 'Right':
      default:
        return { x: x + offset, y, anchor: 'start', baseline: 'middle' };
    }
  }

  private showTooltip(
    point: EvolutionaryRatePoint,
    residual?: EvolutionaryRateResidual
  ): void {
    const tooltip = this.plotTooltip?.nativeElement;
    if (!tooltip) {
      return;
    }
    tooltip.replaceChildren();
    const fields = this.selectedNodeTooltipVariables.length > 0 ? this.selectedNodeTooltipVariables : ['_id'];
    fields.forEach(field => {
      const row = document.createElement('div');
      const label = document.createElement('strong');
      label.textContent = `${this.commonService.titleize(field)}: `;
      row.append(label, document.createTextNode(this.formatNodeValue(point.node[field])));
      tooltip.appendChild(row);
    });
    if (residual?.isOutlier) {
      const details = document.createElement('div');
      details.className = 'evolutionary-rate-tooltip-outlier';
      details.setAttribute('data-testid', 'evolutionary-rate-tooltip-outlier');
      const heading = document.createElement('strong');
      heading.textContent = 'Potential outlier';
      const explanation = document.createElement('div');
      explanation.textContent = `Flagged because its absolute residual (${this.formatAxisDistance(residual.absoluteResidual)}) is ${this.formatNumber(residual.residualScore as number)} × RMSE, meeting the ≥ ${EVOLUTIONARY_RATE_OUTLIER_RMSE_MULTIPLIER} × RMSE threshold.`;
      const values = document.createElement('div');
      values.textContent = `Observed: ${this.formatAxisDistance(residual.point.distance)}; fitted: ${this.formatAxisDistance(residual.fittedDistance)}; residual: ${this.formatAxisDistance(residual.residual)}.`;
      details.append(heading, explanation, values);
      tooltip.appendChild(details);
    }
    tooltip.hidden = false;
    this.positionTooltip();
  }

  private positionTooltip(): void {
    const tooltip = this.plotTooltip?.nativeElement;
    const host = this.plotHost?.nativeElement;
    const event = (d3 as any).event as MouseEvent | undefined;
    if (!tooltip || !host || !event) {
      return;
    }
    const bounds = host.getBoundingClientRect();
    tooltip.style.left = `${event.clientX - bounds.left + 12}px`;
    tooltip.style.top = `${event.clientY - bounds.top + 12}px`;
  }

  private hideTooltip(): void {
    if (this.plotTooltip?.nativeElement) {
      this.plotTooltip.nativeElement.hidden = true;
    }
  }

  private usesPercentageDistanceDisplay(): boolean {
    return this.distanceSourceKind !== 'patristic'
      && this.commonService.tn93PercentageDisplayEnabled('distance');
  }

  private formatAxisDistance(value: number): string {
    const formatted = this.formatNumber(value);
    return this.usesPercentageDistanceDisplay() ? `${formatted}%` : formatted;
  }

  private formatNumber(value: number): string {
    if (!Number.isFinite(value)) {
      return 'N/A';
    }
    const absoluteValue = Math.abs(value);
    if ((absoluteValue > 0 && absoluteValue < 0.001) || absoluteValue >= 10000) {
      return value.toExponential(4);
    }
    const fixed = value.toFixed(4);
    return fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed;
  }

  private formatMetricLabel(metric: string): string {
    if (metric.toLowerCase() === 'tn93') {
      return 'TN93';
    }
    if (metric.toLowerCase() === 'snps') {
      return 'SNPs';
    }
    return metric.toUpperCase();
  }

  private formatNodeValue(value: any): string {
    if (value === null || value === undefined || value === '') {
      return 'N/A';
    }
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    }
    return String(value);
  }

  private toFiniteNumber(value: any, fallback: number): number {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : fallback;
  }

  private normalizeOrientation(value: any): LabelOrientation {
    return ['Right', 'Left', 'Top', 'Bottom', 'Middle'].includes(value) ? value : 'Right';
  }

  private normalizePlotExportFileType(value: any): PlotExportFileType {
    return ['png', 'jpeg', 'webp', 'svg'].includes(value) ? value : 'png';
  }

  private getStatisticsRows(): Array<{
    label: string;
    value: string;
    testId: string;
    csvLabel?: string;
  }> {
    return [
      {
        label: 'Date range',
        value: this.formatDateRange(),
        testId: 'evolutionary-rate-date-range',
      },
      {
        label: 'Slope (rate)',
        value: this.formatSlope(),
        testId: 'evolutionary-rate-slope',
      },
      {
        label: 'X-intercept (TMRCA)',
        value: this.formatTmrca(),
        testId: 'evolutionary-rate-tmrca',
      },
      {
        label: 'Correlation Coefficient',
        value: this.formatCorrelation(),
        testId: 'evolutionary-rate-correlation',
      },
      {
        label: 'R²',
        csvLabel: 'R^2',
        value: this.formatRSquared(),
        testId: 'evolutionary-rate-r-squared',
      },
      {
        label: 'Residual Mean Squared',
        value: this.formatResidualMeanSquared(),
        testId: 'evolutionary-rate-residual-mean-squared',
      },
    ];
  }

  private appendStatisticsTableToSvg(svg: SVGSVGElement): void {
    if (!this.tableVisible || this.analysis.points.length === 0) {
      return;
    }

    const viewBox = svg.viewBox?.baseVal;
    const width = viewBox?.width || Number(svg.getAttribute('width')) || 800;
    const height = viewBox?.height || Number(svg.getAttribute('height')) || 500;
    const rows = this.getStatisticsRows();
    const rowHeight = 28;
    const tableWidth = Math.min(390, Math.max(280, width - 40));
    const tableHeight = rows.length * rowHeight;
    const x = Math.max(20, width - tableWidth - 20);
    const y = Math.max(20, height - tableHeight - 88);
    const statisticsElement = this.plotExportHost?.nativeElement.querySelector(
      '.evolutionary-rate-statistics',
    ) as HTMLElement | null;
    const computedStyle = statisticsElement ? window.getComputedStyle(statisticsElement) : null;
    const backgroundColor = computedStyle?.backgroundColor || '#ffffff';
    const textColor = computedStyle?.color || this.widgets['background-color-contrast'] || '#303030';
    const borderColor = computedStyle?.borderTopColor || '#d8dadd';
    const group = d3.select(svg)
      .append('g')
      .attr('data-testid', 'evolutionary-rate-export-statistics')
      .attr('role', 'table')
      .attr('aria-label', 'Evolutionary rate statistics')
      .attr('transform', `translate(${x},${y})`)
      .style('pointer-events', 'none');

    group.append('title').text('Evolutionary rate statistics');
    group.append('rect')
      .attr('width', tableWidth)
      .attr('height', tableHeight)
      .attr('rx', 6)
      .attr('ry', 6)
      .attr('fill', backgroundColor)
      .attr('stroke', borderColor);

    rows.forEach((row, index) => {
      const baseline = (index * rowHeight) + (rowHeight / 2);
      if (index > 0) {
        group.append('line')
          .attr('x1', 0)
          .attr('x2', tableWidth)
          .attr('y1', index * rowHeight)
          .attr('y2', index * rowHeight)
          .attr('stroke', borderColor);
      }

      group.append('text')
        .attr('x', 10)
        .attr('y', baseline)
        .attr('dominant-baseline', 'middle')
        .attr('fill', textColor)
        .attr('font-family', 'Roboto, Helvetica Neue, sans-serif')
        .attr('font-size', 13)
        .attr('font-weight', 600)
        .text(row.label);
      group.append('text')
        .attr('data-testid', row.testId)
        .attr('x', tableWidth - 10)
        .attr('y', baseline)
        .attr('dominant-baseline', 'middle')
        .attr('text-anchor', 'end')
        .attr('fill', textColor)
        .attr('font-family', 'Roboto, Helvetica Neue, sans-serif')
        .attr('font-size', 13)
        .text(row.value);
    });
  }

  private buildOutlierReport(): EvolutionaryRateOutlierReport {
    const totalAnalysisNodes = this.analysis.includedCount + this.analysis.excludedCount;
    const scopeLabel = this.selectionActive
      ? `${totalAnalysisNodes} selected visible node${totalAnalysisNodes === 1 ? '' : 's'}`
      : `${totalAnalysisNodes} visible node${totalAnalysisNodes === 1 ? '' : 's'}`;
    return buildEvolutionaryRateOutlierReport({
      analysis: this.analysis,
      scopeLabel: this.selectedClusterLabel
        ? `${this.selectedClusterLabel}; ${scopeLabel}`
        : scopeLabel,
      dateField: this.selectedDateField,
      distanceSourceLabel: this.distanceSourceLabel,
      distanceSourceKind: this.distanceSourceKind,
      treeRootMethod: this.selectedTreeRootMethod,
      usePercentageDistanceDisplay: this.usesPercentageDistanceDisplay(),
      regressionPlotSvg: this.serializeRegressionPlotSvg(),
      excludedDataPoints: this.excludedDataPoints.map(point => ({
        id: point.id,
        dateValue: point.dateValue,
        reason: point.reason,
      })),
    });
  }

  private serializeRegressionPlotSvg(): string {
    const sourceSvg = this.plotHost?.nativeElement.querySelector('svg');
    if (!sourceSvg) return '';

    const reportSvg = sourceSvg.cloneNode(true) as SVGSVGElement;
    reportSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    reportSvg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    reportSvg.setAttribute('role', 'img');
    reportSvg.querySelectorAll('[tabindex]').forEach(element => element.removeAttribute('tabindex'));
    reportSvg.querySelectorAll('[role="button"]').forEach(element => element.removeAttribute('role'));
    this.replaceEmbeddedSvgMarkersWithVectors(reportSvg);
    this.appendNodeKeyTablesToReportSvg(reportSvg);
    this.applyOutlierReportTypography(reportSvg);

    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent = [
      'text { font-family: Roboto, Helvetica Neue, Arial, sans-serif; }',
      '.evolutionary-rate-point { cursor: default; }',
    ].join(' ');
    reportSvg.insertBefore(style, reportSvg.firstChild);

    return new XMLSerializer().serializeToString(reportSvg);
  }

  private applyOutlierReportTypography(reportSvg: SVGSVGElement): void {
    reportSvg.querySelectorAll<SVGTextElement>('.tick text').forEach(label => {
      label.setAttribute('font-size', String(this.outlierReportLabelFontSize));
    });
    reportSvg.querySelectorAll<SVGTextElement>('.axis-title').forEach(title => {
      title.setAttribute('font-size', String(this.outlierReportAxisTitleFontSize));
      title.setAttribute('font-weight', '500');
    });
    reportSvg.querySelectorAll<SVGTextElement>([
      '[data-testid="evolutionary-rate-selection-legend"] text',
      '[data-testid="evolutionary-rate-outlier-legend"] text',
    ].join(', ')).forEach(legend => {
      legend.setAttribute('font-size', String(this.outlierReportLegendFontSize));
    });

    const reportWidth = reportSvg.viewBox?.baseVal?.width
      || Number(reportSvg.getAttribute('width'))
      || 800;
    const legendLayouts = [
      { selector: '[data-testid="evolutionary-rate-selection-legend"]', minimumWidth: 360 },
      { selector: '[data-testid="evolutionary-rate-outlier-legend"]', minimumWidth: 300 },
    ];
    legendLayouts.forEach(layout => {
      const legend = reportSvg.querySelector<SVGGElement>(layout.selector);
      if (!legend) return;

      const currentTransform = legend.getAttribute('transform') || '';
      const translate = currentTransform.match(/translate\([^,]+,\s*([^\)]+)\)/);
      if (!translate) return;

      const legendTextLength = legend.querySelector('text')?.textContent?.length || 0;
      const legendWidth = Math.max(
        layout.minimumWidth,
        Math.ceil(22 + (legendTextLength * this.outlierReportLegendFontSize * 0.56))
      );
      const x = Math.max(88, reportWidth - 40 - legendWidth);
      legend.setAttribute('transform', `translate(${x},${translate[1]})`);
    });
  }

  private replaceEmbeddedSvgMarkersWithVectors(reportSvg: SVGSVGElement): void {
    const svgNamespace = 'http://www.w3.org/2000/svg';
    reportSvg.querySelectorAll('image.evolutionary-rate-point').forEach(image => {
      const href = image.getAttribute('href') || image.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || '';
      if (!href.startsWith('data:image/svg+xml')) return;

      const markerSvg = this.parseSvgDataUri(href);
      const viewBox = String(markerSvg?.documentElement.getAttribute('viewBox') || '')
        .trim()
        .split(/\s+/)
        .map(Number);
      const x = Number(image.getAttribute('x'));
      const y = Number(image.getAttribute('y'));
      const width = Number(image.getAttribute('width'));
      const height = Number(image.getAttribute('height'));
      if (
        !markerSvg
        || viewBox.length !== 4
        || !viewBox.every(Number.isFinite)
        || ![x, y, width, height].every(Number.isFinite)
        || viewBox[2] <= 0
        || viewBox[3] <= 0
        || width <= 0
        || height <= 0
      ) {
        return;
      }

      const scale = Math.min(width / viewBox[2], height / viewBox[3]);
      const translateX = x + ((width - (viewBox[2] * scale)) / 2) - (viewBox[0] * scale);
      const translateY = y + ((height - (viewBox[3] * scale)) / 2) - (viewBox[1] * scale);
      const group = document.createElementNS(svgNamespace, 'g');
      group.setAttribute(
        'class',
        `${image.getAttribute('class') || 'evolutionary-rate-point'} evolutionary-rate-report-vector-point`
      );
      group.setAttribute('transform', `translate(${translateX},${translateY}) scale(${scale})`);
      ['data-testid', 'data-node-id', 'data-selected', 'data-outlier', 'aria-label'].forEach(attribute => {
        const value = image.getAttribute(attribute);
        if (value !== null) group.setAttribute(attribute, value);
      });
      Array.from(markerSvg.documentElement.childNodes).forEach(child => {
        group.appendChild(document.importNode(child, true));
      });
      image.parentNode?.replaceChild(group, image);
    });
  }

  private appendNodeKeyTablesToReportSvg(reportSvg: SVGSVGElement): void {
    const keyTables = this.visuals.microbeTrace?.getNodeKeyTablesForExport?.() || [];
    const exportedKeys = keyTables
      .map(table => this.exportService.exportTableAsSVG(
        table,
        true,
        Boolean(table.querySelector('[data-shape-key]')),
        this.outlierReportLegendFontSize
      ))
      .filter(key => key.svg && key.width > 0 && key.height > 0)
      .map(key => {
        const parsed = new DOMParser().parseFromString(
          `<svg xmlns="http://www.w3.org/2000/svg">${key.svg}</svg>`,
          'image/svg+xml'
        );
        return parsed.getElementsByTagName('parsererror').length === 0
          ? { ...key, element: parsed.documentElement.firstElementChild }
          : null;
      })
      .filter((key): key is { svg: string; width: number; height: number; element: Element } => Boolean(key?.element));

    if (exportedKeys.length === 0) return;

    const svgNamespace = 'http://www.w3.org/2000/svg';
    const viewBoxValues = String(reportSvg.getAttribute('viewBox') || '')
      .trim()
      .split(/\s+/)
      .map(Number);
    const hasValidViewBox = viewBoxValues.length === 4 && viewBoxValues.every(Number.isFinite);
    const viewBoxX = hasValidViewBox ? viewBoxValues[0] : 0;
    const viewBoxY = hasValidViewBox ? viewBoxValues[1] : 0;
    const originalWidth = hasValidViewBox
      ? viewBoxValues[2]
      : Number(reportSvg.getAttribute('width')) || 800;
    const originalHeight = hasValidViewBox
      ? viewBoxValues[3]
      : Number(reportSvg.getAttribute('height')) || 500;
    const padding = 12;
    const gap = 12;
    const maximumRowWidth = Math.max(1, originalWidth - (padding * 2));
    const container = document.createElementNS(svgNamespace, 'g');
    container.setAttribute('data-testid', 'evolutionary-rate-report-keys');
    container.setAttribute('role', 'group');
    container.setAttribute('aria-label', 'Node color and shape keys');

    let currentX = padding;
    let currentY = originalHeight + padding;
    let rowHeight = 0;
    let maximumRight = originalWidth;

    exportedKeys.forEach(key => {
      if (currentX > padding && currentX + key.width > maximumRowWidth + padding) {
        currentX = padding;
        currentY += rowHeight + gap;
        rowHeight = 0;
      }

      const wrapper = document.createElementNS(svgNamespace, 'g');
      wrapper.setAttribute('class', 'evolutionary-rate-report-key');
      wrapper.setAttribute('transform', `translate(${viewBoxX + currentX},${viewBoxY + currentY})`);
      wrapper.appendChild(document.importNode(key.element, true));
      container.appendChild(wrapper);
      maximumRight = Math.max(maximumRight, currentX + key.width + padding);
      rowHeight = Math.max(rowHeight, key.height);
      currentX += key.width + gap;
    });

    const combinedWidth = Math.max(originalWidth, maximumRight);
    const combinedHeight = currentY + rowHeight + padding;
    reportSvg.appendChild(container);
    reportSvg.setAttribute('viewBox', `${viewBoxX} ${viewBoxY} ${combinedWidth} ${combinedHeight}`);
    reportSvg.setAttribute('width', String(combinedWidth));
    reportSvg.setAttribute('height', String(combinedHeight));
  }

  private parseSvgDataUri(dataUri: string): XMLDocument | null {
    const commaIndex = dataUri.indexOf(',');
    if (commaIndex < 0) return null;

    try {
      const metadata = dataUri.slice(0, commaIndex);
      const payload = dataUri.slice(commaIndex + 1);
      let svgText: string;
      if (/;base64/i.test(metadata)) {
        const binary = atob(payload);
        const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
        svgText = new TextDecoder('utf-8').decode(bytes);
      } else {
        svgText = decodeURIComponent(payload);
      }
      const parsed = new DOMParser().parseFromString(svgText, 'image/svg+xml');
      return parsed.getElementsByTagName('parsererror').length === 0 ? parsed : null;
    } catch {
      return null;
    }
  }

  private async downloadOutlierReportPdf(
    report: EvolutionaryRateOutlierReport,
    filename: string
  ): Promise<void> {
    try {
      const { default: pdfMake } = await import('pdfmake/build/pdfmake.js');
      const { default: pdfFonts } = await import('pdfmake/build/vfs_fonts.js');
      pdfMake.vfs = pdfFonts;
      pdfMake.createPdf(buildEvolutionaryRateOutlierReportPdfDefinition(report)).download(filename);
    } catch (error) {
      console.error('Failed to generate the evolutionary-rate outlier report PDF', error);
    }
  }

  private getOutlierReportBaseFilename(): string {
    const trimmed = String(this.outlierReportFilename || '').trim();
    const withoutExtension = trimmed.replace(/\.(?:md|markdown|pdf)$/i, '');
    return withoutExtension || 'evolutionary-rate-outlier-report';
  }

  private getPlotExportDimensions(): { width: number; height: number } {
    const host = this.plotHost?.nativeElement;
    const svg = host?.querySelector('svg');
    const viewBox = svg?.viewBox?.baseVal;
    const width = host?.offsetWidth || viewBox?.width || Number(svg?.getAttribute('width')) || this.container.width || 800;
    const height = host?.offsetHeight || viewBox?.height || Number(svg?.getAttribute('height')) || this.container.height || 500;
    return {
      width: Math.max(1, width),
      height: Math.max(1, height),
    };
  }

  private getPlotExportScale(): number {
    const scale = Number(this.plotExportScale);
    return Number.isFinite(scale) && scale > 0 ? Math.min(scale, 2) : 1;
  }

  private getPlotExportQuality(): number {
    const quality = Number(this.plotExportQuality);
    return Number.isFinite(quality) ? Math.max(0, Math.min(1, quality)) : 0.92;
  }

  private getPlotExportBaseFilename(): string {
    const trimmed = String(this.plotExportFilename || '').trim();
    const withoutExtension = trimmed.replace(/\.(?:png|jpe?g|webp|svg)$/i, '');
    return withoutExtension || 'evolutionary-rate-regression';
  }

  private ensureFilenameExtension(filename: string, extension: string): string {
    const trimmed = String(filename || '').trim();
    const fallback = extension === '.csv'
      ? 'evolutionary-rate-statistics'
      : 'evolutionary-rate-regression';
    const base = trimmed || fallback;
    return base.toLowerCase().endsWith(extension) ? base : `${base}${extension}`;
  }

  private saveGeneratedFile(content: Blob | string, filename: string): void {
    const browserWindow = window as Window & {
      __mtTestSaveAs?: (value: Blob | string, name: string) => void;
    };
    if (typeof browserWindow.__mtTestSaveAs === 'function') {
      browserWindow.__mtTestSaveAs(content, filename);
      return;
    }
    saveAs(content as any, filename);
  }
}

export namespace EvolutionaryRateComponent {
  export const componentTypeName = 'Evolutionary Rate';
}
