import { Injector, Component, Output, EventEmitter,
  ElementRef, Renderer2, ChangeDetectorRef, Inject, OnInit, OnDestroy,
  ViewChild} from '@angular/core';
import { EventManager } from '@angular/platform-browser';
import { CommonService } from '@app/contactTraceCommonServices/common.service';
import { saveAs } from 'file-saver';
import { BaseComponentDirective } from '@app/base-component.directive';
import { ComponentContainer } from 'golden-layout';
import { GoogleTagManagerService } from 'angular-google-tag-manager';
import { DialogSettings } from '../../helperClasses/dialogSettings';
import { PlotlyComponent, PlotlyModule } from 'angular-plotly.js';
import { SelectItem } from 'primeng/api';
import { MicrobeTraceNextVisuals } from '../../microbe-trace-next-plugin-visuals';
import { cloneDeep } from 'lodash';
import { buildSafeCsvRow } from '@app/contactTraceCommonServices/export-sanitization';
import { CommonStoreService } from '@app/contactTraceCommonServices/common-store.services';
import { Subject, takeUntil } from 'rxjs';
import * as d3 from 'd3';

type HeatmapValueSource = 'distance' | 'node' | 'link';
type HeatmapValueKind = 'numeric' | 'categorical';

interface HeatmapAxisItem {
  index: number;
  label: string;
  sortValue?: unknown;
}

interface HeatmapCellInput {
  x: unknown;
  y: unknown;
  value: unknown;
  xSort?: unknown;
  ySort?: unknown;
}

interface HeatmapMatrixResult {
  categories: string[];
  customdata: string[][];
  duplicateCount: number;
  exportValues: unknown[][];
  hasMissing: boolean;
  isDistance: boolean;
  kind: HeatmapValueKind;
  missingZ: (number | null)[][];
  valueLabel: string;
  xLabels: string[];
  yLabels: string[];
  z: (number | null)[][];
}

const HEATMAP_DISTANCE_LABEL = 'Distance';
const HEATMAP_NONE = 'None';
const HEATMAP_VALUE_SEPARATOR = '::';
const HEATMAP_CELL_SEPARATOR = '\u0000';

@Component({
    selector: 'HeatmapComponent',
    templateUrl: './heatmap.component.html',
    styleUrls: ['./heatmap.component.scss'],
    standalone: false
})
export class HeatmapComponent extends BaseComponentDirective implements OnInit, OnDestroy {

  @ViewChild('heatmapContainer', { read: ElementRef }) heatmapContainerRef: ElementRef;
  @Output() DisplayGlobalSettingsDialogEvent = new EventEmitter();

  labels: string[];
  matrix: object;
  plot: PlotlyComponent;
  visuals: MicrobeTraceNextVisuals;
  nodeIds: string[] = [];
  viewActive: boolean;
  heatmapData: any[] = [];
  FieldList: SelectItem[] = [];
  AxisFieldList: SelectItem[] = [];
  SortFieldList: SelectItem[] = [];
  ValueFieldGroups: any[] = [];
  heatmapLayout: any;
  heatmapConfig: object;
  invertX: boolean;
  invertY: boolean;
  heatmapShowLabels: boolean;
  loColor: string;
  medColor: string;
  hiColor: string;
  missingColor: string;
  selectedXVariable: string;
  selectedYVariable: string;
  selectedValueKey: string;
  selectedSortBy: string;
  summaryStatistic: string;
  HeatmapSettingsDialogSettings: DialogSettings = new DialogSettings('#heatmap-settings-pane', false);
  ShowHeatmapExportPane = false;
  invertOptions: object = [
    { label: 'Yes', value: true },
    { label: 'No', value: false }
  ];
  SelectedImageFilenameVariable = 'default_heatmap';
  SelectedNetworkExportFileTypeVariable = 'png';
  NetworkExportFileTypeList: object = [
    { label: 'png', value: 'png' },
    { label: 'jpeg', value: 'jpeg' },
    { label: 'svg', value: 'svg' }
  ];
  SelectedDistanceMatrixFilenameVariable = 'distance_matrix.csv';
  heatmapLabels: string[] = [];
  heatmapValueDisplayLabel = HEATMAP_DISTANCE_LABEL;
  heatmapValueLabel = HEATMAP_DISTANCE_LABEL;

  get heatmapMetric(): string {
    return String(this.widgets['default-distance-metric'] || '').toUpperCase();
  }

  private lastHeatmapMatrix: HeatmapMatrixResult | null = null;
  private destroy$ = new Subject<void>();

  constructor(injector: Injector,
        private eventManager: EventManager,
        public commonService: CommonService,
        @Inject(BaseComponentDirective.GoldenLayoutContainerInjectionToken) private container: ComponentContainer,
        elRef: ElementRef,
        private cdref: ChangeDetectorRef,
        private gtmService: GoogleTagManagerService,
        private renderer: Renderer2,
        private plotlyModule: PlotlyModule,
        private store: CommonStoreService,
      ) {
          super(elRef.nativeElement);
          this.visuals = commonService.visuals;
          this.visuals.heatmap = this;
          this.ensureHeatmapWidgets();
          this.syncLocalSettingsFromWidgets();
        }

  openSettings(): void {
    this.HeatmapSettingsDialogSettings.setVisibility(true);
    this.cdref.detectChanges();
  }

  openExport(): void {
    this.ShowHeatmapExportPane = true;
  }

  openCenter(): void {
    if (!this.heatmapData || this.heatmapData.length === 0) {
      return;
    }

    const reCenter = {
      'xaxis.autorange': true,
      'yaxis.autorange': true
    };
    PlotlyModule.plotlyjs.relayout('heatmap', reCenter);
    this.plot = PlotlyModule.plotlyjs.newPlot('heatmap', cloneDeep(this.heatmapData), this.heatmapLayout, this.heatmapConfig);
  }

  ngOnInit(): void {
    this.viewActive = true;
    this.gtmService.pushTag({
            event: 'page_view',
            page_location: '/heatmap',
            page_title: 'Heatmap View'
        });

    this.refreshFieldLists();
    this.syncLocalSettingsFromWidgets();
    this.goldenLayoutComponentResize(true);

    this.container.on('resize', () => { setTimeout(() => this.goldenLayoutComponentResize(), 200); });
    this.container.on('hide', () => {
      this.viewActive = false;
      this.cdref.detectChanges();
    });
    this.container.on('show', () => {
      this.viewActive = true;
      this.cdref.detectChanges();
      this.redrawHeatmap();
    });

    this.store.networkUpdated$
      .pipe(takeUntil(this.destroy$))
      .subscribe((networkUpdated) => {
        if (this.viewActive && networkUpdated) {
          this.refreshFieldLists();
          this.syncLocalSettingsFromWidgets();
          this.redrawHeatmap();
          this.store.setNetworkUpdated(false);
        }
      });

    this.store.styleFileApplied$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.applyStyleFileSettings());

    this.redrawHeatmap();
  }

  private get widgets(): any {
    return this.commonService.session.style.widgets;
  }

  private ensureHeatmapWidgets(): void {
    if (!this.commonService.session.style.widgets) {
      this.commonService.session.style.widgets = this.commonService.defaultWidgets();
    }

    const defaults = this.commonService.defaultWidgets();
    [
      'heatmap-invertX',
      'heatmap-invertY',
      'heatmap-color-high',
      'heatmap-color-medium',
      'heatmap-color-low',
      'heatmap-color-missing',
      'heatmap-axislabels-show',
      'heatmap-x-variable',
      'heatmap-y-variable',
      'heatmap-value-source',
      'heatmap-value-variable',
      'heatmap-sort-by',
      'heatmap-summary-statistic',
    ].forEach((key) => {
      if (this.widgets[key] === undefined || this.widgets[key] === null) {
        this.widgets[key] = defaults[key];
      }
    });

    if (!['distance', 'node', 'link'].includes(String(this.widgets['heatmap-value-source']))) {
      this.widgets['heatmap-value-source'] = defaults['heatmap-value-source'];
      this.widgets['heatmap-value-variable'] = defaults['heatmap-value-variable'];
    }

    this.widgets['heatmap-summary-statistic'] = HEATMAP_NONE;
  }

  private syncLocalSettingsFromWidgets(): void {
    this.ensureHeatmapWidgets();
    const axisValues = this.AxisFieldList.length
      ? this.AxisFieldList.map((option) => option.value)
      : this.getNodeFields();
    const sortValues = this.SortFieldList.length
      ? this.SortFieldList.map((option) => option.value)
      : [HEATMAP_NONE, ...this.getNodeFields()];

    this.selectedXVariable = axisValues.includes(this.widgets['heatmap-x-variable'])
      ? this.widgets['heatmap-x-variable']
      : '_id';
    this.selectedYVariable = axisValues.includes(this.widgets['heatmap-y-variable'])
      ? this.widgets['heatmap-y-variable']
      : '_id';
    this.selectedSortBy = sortValues.includes(this.widgets['heatmap-sort-by'])
      ? this.widgets['heatmap-sort-by']
      : HEATMAP_NONE;

    const valueSource = String(this.widgets['heatmap-value-source']) as HeatmapValueSource;
    const valueVariable = String(this.widgets['heatmap-value-variable'] || HEATMAP_DISTANCE_LABEL);
    const selectedValueKey = this.encodeValueKey(valueSource, valueVariable);
    const allowedValueKeys = this.flattenValueOptions().map((option) => option.value);

    this.selectedValueKey = allowedValueKeys.length === 0 || allowedValueKeys.includes(selectedValueKey)
      ? selectedValueKey
      : this.encodeValueKey('distance', HEATMAP_DISTANCE_LABEL);

    const selectedValue = this.parseValueKey(this.selectedValueKey);
    this.widgets['heatmap-x-variable'] = this.selectedXVariable;
    this.widgets['heatmap-y-variable'] = this.selectedYVariable;
    this.widgets['heatmap-sort-by'] = this.selectedSortBy;
    this.widgets['heatmap-value-source'] = selectedValue.source;
    this.widgets['heatmap-value-variable'] = selectedValue.variable;
    this.widgets['heatmap-summary-statistic'] = HEATMAP_NONE;

    this.invertX = Boolean(this.widgets['heatmap-invertX']);
    this.invertY = Boolean(this.widgets['heatmap-invertY']);
    this.heatmapShowLabels = Boolean(this.widgets['heatmap-axislabels-show']);
    this.loColor = this.widgets['heatmap-color-low'];
    this.medColor = this.widgets['heatmap-color-medium'];
    this.hiColor = this.widgets['heatmap-color-high'];
    this.missingColor = this.widgets['heatmap-color-missing'];
    this.summaryStatistic = this.widgets['heatmap-summary-statistic'];
    this.heatmapValueDisplayLabel = this.getHeatmapValueDisplayLabel(selectedValue);
    this.heatmapValueLabel = selectedValue.source === 'distance'
      ? HEATMAP_DISTANCE_LABEL
      : this.getFieldLabel(selectedValue.variable);
  }

  private getNodeFields(): string[] {
    return this.uniqueFields(['_id', ...(this.commonService.session.data?.nodeFields || [])]);
  }

  private getLinkFields(): string[] {
    return this.uniqueFields(this.commonService.session.data?.linkFields || []);
  }

  private uniqueFields(fields: string[]): string[] {
    const seen = new Set<string>();
    const output: string[] = [];

    fields.forEach((field) => {
      const normalizedField = String(field || '').trim();
      const key = normalizedField.toLowerCase();
      if (!normalizedField || seen.has(key)) {
        return;
      }
      seen.add(key);
      output.push(normalizedField);
    });

    return output;
  }

  private getFieldLabel(field: string): string {
    if (field === HEATMAP_NONE) {
      return HEATMAP_NONE;
    }
    if (field === '_id') {
      return 'ID';
    }
    if (String(field).toLowerCase() === 'tn93') {
      return 'TN93';
    }
    if (String(field).toLowerCase() === 'snps') {
      return 'SNPs';
    }

    return this.commonService.capitalize(String(field || '').replace(/_/g, ' '));
  }

  private refreshFieldLists(): void {
    const nodeFields = this.getNodeFields();
    const linkFields = this.getLinkFields();

    this.AxisFieldList = nodeFields.map((field) => ({
      label: this.getFieldLabel(field),
      value: field,
    }));

    this.FieldList = [
      {
        label: HEATMAP_NONE,
        value: '',
      },
      ...this.AxisFieldList,
    ];

    this.SortFieldList = [
      {
        label: HEATMAP_NONE,
        value: HEATMAP_NONE,
      },
      ...nodeFields.map((field) => ({
        label: this.getFieldLabel(field),
        value: field,
      })),
    ];

    this.ValueFieldGroups = [
      {
        label: HEATMAP_DISTANCE_LABEL,
        value: 'distance',
        items: [
          {
            label: HEATMAP_DISTANCE_LABEL,
            value: this.encodeValueKey('distance', HEATMAP_DISTANCE_LABEL),
          },
        ],
      },
      {
        label: 'Node',
        value: 'node',
        items: nodeFields.map((field) => ({
          label: this.getFieldLabel(field),
          value: this.encodeValueKey('node', field),
        })),
      },
      {
        label: 'Link',
        value: 'link',
        items: linkFields.map((field) => ({
          label: this.getFieldLabel(field),
          value: this.encodeValueKey('link', field),
        })),
      },
    ];
  }

  private flattenValueOptions(): any[] {
    return this.ValueFieldGroups.flatMap((group) => group.items || []);
  }

  private encodeValueKey(source: HeatmapValueSource, variable: string): string {
    return `${source}${HEATMAP_VALUE_SEPARATOR}${variable}`;
  }

  private parseValueKey(key: string): { source: HeatmapValueSource; variable: string } {
    const [source, ...variableParts] = String(key || '').split(HEATMAP_VALUE_SEPARATOR);
    const parsedSource = ['distance', 'node', 'link'].includes(source)
      ? source as HeatmapValueSource
      : 'distance';
    const variable = variableParts.join(HEATMAP_VALUE_SEPARATOR) || HEATMAP_DISTANCE_LABEL;

    return {
      source: parsedSource,
      variable: parsedSource === 'distance' ? HEATMAP_DISTANCE_LABEL : variable,
    };
  }

  private getHeatmapValueDisplayLabel(selectedValue = this.parseValueKey(this.selectedValueKey)): string {
    if (selectedValue.source === 'distance') {
      return this.getFieldLabel(String(this.commonService.session.style.widgets['default-distance-metric'] || HEATMAP_DISTANCE_LABEL));
    }

    return this.getFieldLabel(selectedValue.variable);
  }

  private usesPercentageDistanceDisplay(): boolean {
    return this.commonService.tn93PercentageDisplayEnabled('heatmap-distance');
  }

  private formatHeatmapDistanceValue(
    value: number | null | undefined,
    options: {
      decimals?: number;
      trimTrailingZeros?: boolean;
      includeSuffix?: boolean;
    } = {}
  ): string {
    return this.commonService.formatDisplayedDistanceValue(value, 'heatmap-distance', options);
  }

  private formatGenericNumericValue(value: number | null | undefined): string {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) {
      return 'No Data';
    }

    const numericValue = Number(value);
    if (Math.abs(numericValue - Math.round(numericValue)) < 1e-9) {
      return Math.round(numericValue).toLocaleString();
    }

    return numericValue.toLocaleString(undefined, {
      maximumFractionDigits: 6,
    });
  }

  private isMissingValue(value: unknown): boolean {
    const missingStringValues = new Set(['', 'null', 'undefined', 'nan']);
    const normalizedStringValue = typeof value === 'string'
      ? value.trim().toLowerCase()
      : undefined;

    return value === null
      || value === undefined
      || (normalizedStringValue !== undefined && missingStringValues.has(normalizedStringValue))
      || (typeof value === 'number' && Number.isNaN(value));
  }

  private normalizeAxisLabel(value: unknown): string | null {
    if (this.isMissingValue(value)) {
      return null;
    }

    return String(value).trim();
  }

  private buildNumericHeatmapColorbar(
    matrix: any[],
    formatter: (value: number) => string,
  ): any {
    let minValue = Infinity;
    let maxValue = -Infinity;

    for (const row of matrix || []) {
      if (!Array.isArray(row)) {
        continue;
      }

      for (const rawValue of row) {
        const value = Number(rawValue);
        if (!Number.isFinite(value)) {
          continue;
        }

        if (value < minValue) {
          minValue = value;
        }
        if (value > maxValue) {
          maxValue = value;
        }
      }
    }

    if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
      return undefined;
    }

    const epsilon = Math.abs(maxValue - minValue) * 1e-12 || 1e-12;
    const tickValues = minValue === maxValue
      ? [minValue]
      : d3.ticks(minValue, maxValue, 8)
        .filter((value) => value >= minValue - epsilon && value <= maxValue + epsilon);
    const colorbarTickValues = tickValues.length > 0 ? tickValues : [minValue, maxValue];

    return {
      tickmode: 'array',
      tickvals: colorbarTickValues,
      ticktext: colorbarTickValues.map((value) => formatter(value)),
    };
  }

  private buildCategoricalColorbar(categories: string[]): any {
    if (categories.length === 0) {
      return undefined;
    }

    return {
      tickmode: 'array',
      tickvals: categories.map((_, index) => index),
      ticktext: categories,
    };
  }

  private buildHeatmapAxisConfig(labels: string[]): any {
    const config: any = {
      type: 'category',
      categoryorder: 'array',
      categoryarray: labels,
      tickmode: 'array',
      tickvals: labels,
      ticktext: labels,
      showticklabels: this.heatmapShowLabels,
      automargin: true,
    };

    if (!config.showticklabels) {
      config.ticks = '';
    }

    return config;
  }

  private buildNodeLookup(): Map<string, any> {
    const lookup = new Map<string, any>();
    (this.commonService.session.data?.nodes || []).forEach((node) => {
      const id = node?._id ?? node?.id;
      if (id !== undefined && id !== null) {
        lookup.set(String(id), node);
      }
    });

    return lookup;
  }

  private resolveNodeAxisValue(nodeId: unknown, field: string, nodeLookup: Map<string, any>): unknown {
    const id = this.normalizeAxisLabel(nodeId);
    if (id === null) {
      return null;
    }

    if (!field || field === '_id') {
      return id;
    }

    const node = nodeLookup.get(id);
    const value = node?.[field];

    return this.isMissingValue(value) ? id : value;
  }

  private compareSortValues(a: unknown, b: unknown): number {
    const aMissing = this.isMissingValue(a);
    const bMissing = this.isMissingValue(b);
    if (aMissing && bMissing) return 0;
    if (aMissing) return 1;
    if (bMissing) return -1;

    const aNumber = Number(a);
    const bNumber = Number(b);
    if (Number.isFinite(aNumber) && Number.isFinite(bNumber)) {
      return aNumber - bNumber;
    }

    return String(a).localeCompare(String(b), undefined, {
      numeric: true,
      sensitivity: 'base',
    });
  }

  private sortAxisItems(items: HeatmapAxisItem[]): HeatmapAxisItem[] {
    if (!this.selectedSortBy || this.selectedSortBy === HEATMAP_NONE) {
      return items;
    }

    return [...items].sort((a, b) => {
      const sortComparison = this.compareSortValues(a.sortValue, b.sortValue);
      return sortComparison !== 0 ? sortComparison : a.index - b.index;
    });
  }

  private sortLabels(labels: string[], sortValuesByLabel: Map<string, unknown>): string[] {
    if (!this.selectedSortBy || this.selectedSortBy === HEATMAP_NONE) {
      return labels;
    }

    return labels
      .map((label, index) => ({
        index,
        label,
        sortValue: sortValuesByLabel.get(label),
      }))
      .sort((a, b) => {
        const sortComparison = this.compareSortValues(a.sortValue, b.sortValue);
        return sortComparison !== 0 ? sortComparison : a.index - b.index;
      })
      .map((item) => item.label);
  }

  private getVisibleNodeRows(): any[] {
    if (typeof this.commonService.getVisibleNodesIgnoringTimeline === 'function') {
      return this.commonService.getVisibleNodesIgnoringTimeline();
    }

    return this.commonService.session.data?.nodeFilteredValues || this.commonService.session.data?.nodes || [];
  }

  private getVisibleLinkRows(): any[] {
    if (typeof this.commonService.getVisibleLinksIgnoringTimeline === 'function') {
      return this.commonService.getVisibleLinksIgnoringTimeline();
    }

    return this.commonService.session.data?.links || [];
  }

  private async buildDistanceMatrix(): Promise<HeatmapMatrixResult> {
    const { dm, labels } = await this.commonService.getDM();
    const nodeLookup = this.buildNodeLookup();
    const baseLabels = (labels || []).map((label) => String(label));
    const matrix = cloneDeep(dm || []);

    const xItems = baseLabels.map((label, index) => {
      const axisValue = this.resolveNodeAxisValue(label, this.selectedXVariable, nodeLookup);
      return {
        index,
        label: this.normalizeAxisLabel(axisValue) || label,
        sortValue: this.selectedSortBy === HEATMAP_NONE
          ? undefined
          : this.resolveNodeAxisValue(label, this.selectedSortBy, nodeLookup),
      };
    });
    const yItems = baseLabels.map((label, index) => {
      const axisValue = this.resolveNodeAxisValue(label, this.selectedYVariable, nodeLookup);
      return {
        index,
        label: this.normalizeAxisLabel(axisValue) || label,
        sortValue: this.selectedSortBy === HEATMAP_NONE
          ? undefined
          : this.resolveNodeAxisValue(label, this.selectedSortBy, nodeLookup),
      };
    });

    const sortedXItems = this.sortAxisItems(xItems);
    const sortedYItems = this.sortAxisItems(yItems);
    const sortedMatrix = sortedYItems.map((yItem) => (
      sortedXItems.map((xItem) => matrix?.[yItem.index]?.[xItem.index] ?? null)
    ));

    this.nodeIds = baseLabels;

    return this.finalizeMatrix({
      rawMatrix: sortedMatrix,
      xLabels: sortedXItems.map((item) => item.label),
      yLabels: sortedYItems.map((item) => item.label),
      isDistance: true,
      valueLabel: HEATMAP_DISTANCE_LABEL,
      duplicateCount: 0,
    });
  }

  private buildNodeBackedMatrix(valueVariable: string): HeatmapMatrixResult {
    const rows = this.getVisibleNodeRows();
    const cells = rows.map((row): HeatmapCellInput => ({
      x: row?.[this.selectedXVariable],
      y: row?.[this.selectedYVariable],
      value: row?.[valueVariable],
      xSort: this.selectedSortBy === HEATMAP_NONE ? undefined : row?.[this.selectedSortBy],
      ySort: this.selectedSortBy === HEATMAP_NONE ? undefined : row?.[this.selectedSortBy],
    }));

    return this.buildCustomMatrixFromCells(cells, this.getFieldLabel(valueVariable));
  }

  private buildLinkBackedMatrix(valueVariable: string): HeatmapMatrixResult {
    const rows = this.getVisibleLinkRows();
    const nodeLookup = this.buildNodeLookup();
    const cells = rows.map((row): HeatmapCellInput => ({
      x: this.resolveNodeAxisValue(row?.source, this.selectedXVariable, nodeLookup),
      y: this.resolveNodeAxisValue(row?.target, this.selectedYVariable, nodeLookup),
      value: row?.[valueVariable],
      xSort: this.selectedSortBy === HEATMAP_NONE
        ? undefined
        : this.resolveNodeAxisValue(row?.source, this.selectedSortBy, nodeLookup),
      ySort: this.selectedSortBy === HEATMAP_NONE
        ? undefined
        : this.resolveNodeAxisValue(row?.target, this.selectedSortBy, nodeLookup),
    }));

    return this.buildCustomMatrixFromCells(cells, this.getFieldLabel(valueVariable));
  }

  private buildCustomMatrixFromCells(cells: HeatmapCellInput[], valueLabel: string): HeatmapMatrixResult {
    const xLabels: string[] = [];
    const yLabels: string[] = [];
    const xSortValues = new Map<string, unknown>();
    const ySortValues = new Map<string, unknown>();
    const valuesByCell = new Map<string, unknown>();
    const cellSeen = new Set<string>();
    let duplicateCount = 0;

    cells.forEach((cell) => {
      const xLabel = this.normalizeAxisLabel(cell.x);
      const yLabel = this.normalizeAxisLabel(cell.y);
      if (xLabel === null || yLabel === null) {
        return;
      }

      if (!xLabels.includes(xLabel)) {
        xLabels.push(xLabel);
      }
      if (!yLabels.includes(yLabel)) {
        yLabels.push(yLabel);
      }
      if (!xSortValues.has(xLabel) && !this.isMissingValue(cell.xSort)) {
        xSortValues.set(xLabel, cell.xSort);
      }
      if (!ySortValues.has(yLabel) && !this.isMissingValue(cell.ySort)) {
        ySortValues.set(yLabel, cell.ySort);
      }

      const cellKey = this.getCellKey(xLabel, yLabel);
      if (cellSeen.has(cellKey)) {
        duplicateCount++;
        if (this.isMissingValue(valuesByCell.get(cellKey)) && !this.isMissingValue(cell.value)) {
          valuesByCell.set(cellKey, cell.value);
        }
        return;
      }

      cellSeen.add(cellKey);
      valuesByCell.set(cellKey, cell.value);
    });

    const sortedXLabels = this.sortLabels(xLabels, xSortValues);
    const sortedYLabels = this.sortLabels(yLabels, ySortValues);
    const rawMatrix = sortedYLabels.map((yLabel) => (
      sortedXLabels.map((xLabel) => valuesByCell.get(this.getCellKey(xLabel, yLabel)) ?? null)
    ));

    return this.finalizeMatrix({
      rawMatrix,
      xLabels: sortedXLabels,
      yLabels: sortedYLabels,
      isDistance: false,
      valueLabel,
      duplicateCount,
    });
  }

  private getCellKey(xLabel: string, yLabel: string): string {
    return `${xLabel}${HEATMAP_CELL_SEPARATOR}${yLabel}`;
  }

  private finalizeMatrix(options: {
    rawMatrix: unknown[][];
    xLabels: string[];
    yLabels: string[];
    isDistance: boolean;
    valueLabel: string;
    duplicateCount: number;
  }): HeatmapMatrixResult {
    const nonMissingValues = options.rawMatrix
      .flatMap((row) => Array.isArray(row) ? row : [])
      .filter((value) => !this.isMissingValue(value));
    const isNumeric = options.isDistance || nonMissingValues.every((value) => Number.isFinite(Number(value)));
    const categoryMap = new Map<string, number>();
    const categories: string[] = [];

    const z = options.rawMatrix.map((row) => (
      row.map((value) => {
        if (this.isMissingValue(value)) {
          return null;
        }

        if (isNumeric) {
          const numericValue = Number(value);
          return Number.isFinite(numericValue) ? numericValue : null;
        }

        const label = String(value);
        if (!categoryMap.has(label)) {
          categoryMap.set(label, categoryMap.size);
          categories.push(label);
        }

        return categoryMap.get(label);
      })
    ));

    const customdata = options.rawMatrix.map((row) => (
      row.map((value) => this.formatCellDisplayValue(value, options.isDistance))
    ));

    const exportValues = options.rawMatrix.map((row) => (
      row.map((value) => this.formatCellExportValue(value, options.isDistance))
    ));
    const missingZ = z.map((row) => row.map((value) => value === null ? 1 : null));
    const result: HeatmapMatrixResult = {
      categories,
      customdata,
      duplicateCount: options.duplicateCount,
      exportValues,
      hasMissing: missingZ.some((row) => row.some((value) => value !== null)),
      isDistance: options.isDistance,
      kind: isNumeric ? 'numeric' : 'categorical',
      missingZ,
      valueLabel: options.valueLabel,
      xLabels: options.xLabels,
      yLabels: options.yLabels,
      z,
    };

    return this.applyConfiguredAxisTransforms(result);
  }

  private applyConfiguredAxisTransforms(matrix: HeatmapMatrixResult): HeatmapMatrixResult {
    const result = cloneDeep(matrix);

    if (this.invertX) {
      result.xLabels.reverse();
      result.z = result.z.map((row) => [...row].reverse());
      result.exportValues = result.exportValues.map((row) => [...row].reverse());
      result.customdata = result.customdata.map((row) => [...row].reverse());
      result.missingZ = result.missingZ.map((row) => [...row].reverse());
    }

    if (this.invertY) {
      result.yLabels.reverse();
      result.z = [...result.z].reverse();
      result.exportValues = [...result.exportValues].reverse();
      result.customdata = [...result.customdata].reverse();
      result.missingZ = [...result.missingZ].reverse();
    }

    return result;
  }

  private formatCellDisplayValue(value: unknown, isDistance: boolean): string {
    if (this.isMissingValue(value)) {
      return 'No Data';
    }

    if (isDistance) {
      return this.formatHeatmapDistanceValue(Number(value));
    }

    const numericValue = Number(value);
    return Number.isFinite(numericValue) && String(value).trim() !== ''
      ? this.formatGenericNumericValue(numericValue)
      : String(value);
  }

  private formatCellExportValue(value: unknown, isDistance: boolean): unknown {
    if (this.isMissingValue(value)) {
      return '';
    }

    if (isDistance && this.usesPercentageDistanceDisplay()) {
      return this.formatHeatmapDistanceValue(Number(value));
    }

    return value;
  }

  private buildHeatmapColorbar(matrix: HeatmapMatrixResult): any {
    const missingColorbarPosition = matrix.hasMissing
      ? {
        len: 0.82,
        y: 0.41,
        yanchor: 'middle',
      }
      : {};

    if (matrix.kind === 'categorical') {
      const colorbar = this.buildCategoricalColorbar(matrix.categories);
      return colorbar ? { ...colorbar, ...missingColorbarPosition } : undefined;
    }

    const colorbar = this.buildNumericHeatmapColorbar(
      matrix.z,
      (value) => matrix.isDistance
        ? this.formatHeatmapDistanceValue(value)
        : this.formatGenericNumericValue(value)
    );
    return colorbar ? { ...colorbar, ...missingColorbarPosition } : undefined;
  }

  private buildMissingLegendLayout(hasMissing: boolean): any {
    return hasMissing
      ? {
        x: 1.02,
        y: 1,
        xanchor: 'left',
        yanchor: 'top',
        traceorder: 'normal',
      }
      : undefined;
  }

  private async buildHeatmapMatrix(): Promise<HeatmapMatrixResult> {
    this.refreshFieldLists();
    this.syncLocalSettingsFromWidgets();

    const selectedValue = this.parseValueKey(this.selectedValueKey);
    if (selectedValue.source === 'node') {
      return this.buildNodeBackedMatrix(selectedValue.variable);
    }
    if (selectedValue.source === 'link') {
      return this.buildLinkBackedMatrix(selectedValue.variable);
    }

    return this.buildDistanceMatrix();
  }

  private recordHeatmapDuplicateWarning(duplicateCount: number): void {
    const warnings = Array.isArray(this.commonService.session.warnings)
      ? this.commonService.session.warnings
      : [];
    const filteredWarnings = warnings.filter((warning: any) => warning?.id !== 'heatmap-duplicate-cells');

    if (duplicateCount > 0) {
      filteredWarnings.push({
        id: 'heatmap-duplicate-cells',
        type: 'heatmap-duplicate-cells',
        severity: 'warning',
        message: `Heatmap found ${duplicateCount} duplicate X/Y cell ${duplicateCount === 1 ? 'entry' : 'entries'} for X=${this.getFieldLabel(this.selectedXVariable)}, Y=${this.getFieldLabel(this.selectedYVariable)}, Value=${this.heatmapValueLabel}. The first non-missing value was rendered.`,
        duplicateCount,
        xVariable: this.selectedXVariable,
        yVariable: this.selectedYVariable,
        value: this.selectedValueKey,
        recordedAt: Date.now(),
      });
    }

    this.commonService.session.warnings = filteredWarnings;
  }

  drawHeatmap(): void {
    this.buildHeatmapMatrix().then((matrix) => {
      this.lastHeatmapMatrix = matrix;
      this.heatmapLabels = matrix.xLabels;
      this.heatmapValueLabel = matrix.valueLabel;
      this.recordHeatmapDuplicateWarning(matrix.duplicateCount);

      const heatmapTrace: any = {
        x: matrix.xLabels,
        y: matrix.yLabels,
        z: matrix.z,
        type: 'heatmap',
        colorscale: [
          [0, this.loColor],
          [0.5, this.medColor],
          [1, this.hiColor]
        ],
        hoverongaps: false,
        customdata: matrix.customdata,
        hovertemplate: `X: %{x}<br>Y: %{y}<br>${matrix.valueLabel}: %{customdata}<extra></extra>`,
      };

      heatmapTrace.colorbar = this.buildHeatmapColorbar(matrix);

      const traces = [heatmapTrace];
      if (matrix.hasMissing) {
        traces.push({
          x: matrix.xLabels,
          y: matrix.yLabels,
          z: matrix.missingZ,
          type: 'heatmap',
          colorscale: [
            [0, this.missingColor],
            [1, this.missingColor],
          ],
          zmin: 0,
          zmax: 1,
          hoverongaps: false,
          showscale: false,
          showlegend: true,
          legendrank: 0,
          name: 'No Data',
          customdata: matrix.customdata,
          hovertemplate: `X: %{x}<br>Y: %{y}<br>${matrix.valueLabel}: No Data<extra></extra>`,
        });
      }

      this.heatmapData = traces;

      const marginLeft = this.heatmapShowLabels ? 90 : 10;
      const marginBottom = this.heatmapShowLabels ? 75 : 10;
      this.heatmapLayout = {
          xaxis: this.buildHeatmapAxisConfig(matrix.xLabels),
          yaxis: this.buildHeatmapAxisConfig(matrix.yLabels),
          width: $('#heatmap').parent().width() - 35,
          height: $('#heatmap').parent().height() - 90,
          margin: { t: 0, l: marginLeft, b: marginBottom, r: 0 },
          legend: this.buildMissingLegendLayout(matrix.hasMissing),
        };
      this.heatmapConfig = {
          displaylogo: false,
          displayModeBar: false
        };

      const plot = PlotlyModule.plotlyjs.newPlot('heatmap', cloneDeep(this.heatmapData), this.heatmapLayout, this.heatmapConfig);
      this.plot = plot;

      Promise.resolve(plot).then(() => {
        this.setBackground();
        this.store.setNetworkRendered(true);
      });
    });
  }

  goldenLayoutComponentResize(initial = false): void {
    const height = $('heatmapcomponent').height() - 72;
    const width = $('heatmapcomponent').width() - 32;
    if (height) {
      $('#heatmap').height(height);
    }
    if (width) {
      $('#heatmap').width(width);
    }

    if (!initial) {
      const marginLeft = this.heatmapShowLabels ? 90 : 10;
      const marginBottom = this.heatmapShowLabels ? 75 : 10;
      const xLabels = this.lastHeatmapMatrix?.xLabels || [];
      const yLabels = this.lastHeatmapMatrix?.yLabels || [];
      this.heatmapLayout = {
        xaxis: this.buildHeatmapAxisConfig(xLabels),
        yaxis: this.buildHeatmapAxisConfig(yLabels),
        width: $('#heatmap').parent().width() - 35,
        height: $('#heatmap').parent().height() - 90,
        margin: { t: 0, l: marginLeft, b: marginBottom, r: 0 },
        legend: this.buildMissingLegendLayout(Boolean(this.lastHeatmapMatrix?.hasMissing)),
      };
      this.openCenter();
    }
  }

  redrawHeatmap(): void {
    if (!$('#heatmap').length) return;
    if (this.plot) PlotlyModule.plotlyjs.purge('heatmap');
    this.heatmapValueDisplayLabel = this.getHeatmapValueDisplayLabel();
    this.drawHeatmap();
  }

  setBackground(): void {
    const col = this.commonService.session.style.widgets['background-color'];
    $('#heatmap svg.main-svg').first().css('background', col);
    $('#heatmap rect.bg').css('fill', col);

    const contrast = this.commonService.session.style.widgets['background-color-contrast'];
    $('#heatmap .xtitle, .ytitle').css('fill', contrast);
    $('#heatmap .xaxislayer-above text').css('fill', contrast);
    $('#heatmap .yaxislayer-above text').css('fill', contrast);
  }

  updateLoColor(color: string): void {
    this.commonService.session.style.widgets['heatmap-color-low'] = color;
    this.loColor = color;
    this.redrawHeatmap();
  }

  updateMedColor(color: string): void {
    this.commonService.session.style.widgets['heatmap-color-medium'] = color;
    this.medColor = color;
    this.redrawHeatmap();
  }

  updateHiColor(color: string): void {
    this.commonService.session.style.widgets['heatmap-color-high'] = color;
    this.hiColor = color;
    this.redrawHeatmap();
  }

  updateMissingColor(color: string): void {
    this.commonService.session.style.widgets['heatmap-color-missing'] = color;
    this.missingColor = color;
    this.redrawHeatmap();
  }

  updateInvertX(direction: boolean): void {
    this.invertX = direction;
    this.commonService.session.style.widgets['heatmap-invertX'] = this.invertX;
    this.redrawHeatmap();
  }

  updateInvertY(direction: boolean): void {
    this.invertY = direction;
    this.commonService.session.style.widgets['heatmap-invertY'] = this.invertY;
    this.redrawHeatmap();
  }

  updateShowLabels(showLabels: boolean): void {
    this.heatmapShowLabels = showLabels;
    this.commonService.session.style.widgets['heatmap-axislabels-show'] = this.heatmapShowLabels;
    this.redrawHeatmap();
  }

  updateXVariable(variable: string): void {
    this.selectedXVariable = variable;
    this.commonService.session.style.widgets['heatmap-x-variable'] = variable;
    this.redrawHeatmap();
  }

  updateYVariable(variable: string): void {
    this.selectedYVariable = variable;
    this.commonService.session.style.widgets['heatmap-y-variable'] = variable;
    this.redrawHeatmap();
  }

  updateValueVariable(valueKey: string): void {
    this.selectedValueKey = valueKey;
    const selectedValue = this.parseValueKey(valueKey);
    this.commonService.session.style.widgets['heatmap-value-source'] = selectedValue.source;
    this.commonService.session.style.widgets['heatmap-value-variable'] = selectedValue.variable;
    this.heatmapValueDisplayLabel = this.getHeatmapValueDisplayLabel(selectedValue);
    this.heatmapValueLabel = selectedValue.source === 'distance'
      ? HEATMAP_DISTANCE_LABEL
      : this.getFieldLabel(selectedValue.variable);
    this.redrawHeatmap();
  }

  updateSortBy(variable: string): void {
    this.selectedSortBy = variable;
    this.commonService.session.style.widgets['heatmap-sort-by'] = variable;
    this.redrawHeatmap();
  }

  updateVisualization(): void {
    this.redrawHeatmap();
  }

  refreshDistanceDisplayFormat(): void {
    this.redrawHeatmap();
  }

  applyStyleFileSettings(): void {
    this.refreshFieldLists();
    this.syncLocalSettingsFromWidgets();
    this.redrawHeatmap();
  }

  onLoadNewData(): void {
    this.refreshFieldLists();
    this.syncLocalSettingsFromWidgets();
    this.redrawHeatmap();
  }

  onFilterDataChange(): void {
    this.redrawHeatmap();
  }

  async saveImage(): Promise<void> {
    const fileName = this.SelectedImageFilenameVariable;
    const domId = 'heatmap';
    const exportImageType = this.SelectedNetworkExportFileTypeVariable as 'png' | 'jpeg' | 'svg';
    const content = document.getElementById(domId);

    if (!content) {
      return;
    }

    try {
      const dataUrl = await PlotlyModule.plotlyjs.toImage(content, {
        format: exportImageType,
        width: null,
        height: null,
      });
      saveAs(dataUrl, fileName + '.' + exportImageType);
    } catch (error) {
      console.error('Error exporting heatmap image:', error);
    }
  }

  saveDistanceMatrix(): void {
    const matrix = this.lastHeatmapMatrix;
    if (!matrix) {
      return;
    }

    const fileName = this.SelectedDistanceMatrixFilenameVariable;
    const xLabels = (matrix.xLabels || []).map((label) => String(label));
    const yLabels = (matrix.yLabels || []).map((label) => String(label));
    const exportedMatrix = matrix.exportValues || [];

    let csvContent = '';
    if (this.heatmapShowLabels) {
      csvContent += buildSafeCsvRow(['', ...xLabels]) + '\n';
      for (let i = 0; i < exportedMatrix.length; i++) {
        csvContent += buildSafeCsvRow([yLabels[i], ...exportedMatrix[i]]) + '\n';
      }
    } else {
      csvContent += exportedMatrix.map((row) => buildSafeCsvRow(row)).join('\n');
    }
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    saveAs(blob, fileName);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace HeatmapComponent {
    export const componentTypeName = 'Heatmap';
}
