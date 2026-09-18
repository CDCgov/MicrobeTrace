import { Component, ElementRef, EventEmitter, ChangeDetectorRef, Inject, OnInit, Output, ViewChild, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { CommonService } from '../../contactTraceCommonServices/common.service';
import { BaseComponentDirective } from '@app/base-component.directive';
import { MicobeTraceNextPluginEvents } from '@app/helperClasses/interfaces';
import { ComponentContainer } from 'golden-layout';
import * as d3 from 'd3';
import moment from 'moment';
import { MicrobeTraceNextVisuals } from '@app/microbe-trace-next-plugin-visuals';

import { saveAs } from 'file-saver';
import { saveSvgAsPng } from 'save-svg-as-png';
import { SelectItem } from 'primeng/api';
import { ExportService } from '@app/contactTraceCommonServices/export.service';
import { Subject, takeUntil } from 'rxjs';
import { CommonStoreService } from '@app/contactTraceCommonServices/common-store.services';

type EpiCurveSeriesType = 'Bar' | 'Line';
type EpiCurveAggregation = 'Count' | 'Sum' | 'Last' | 'Average';
type EpiCurveAxis = 'Left' | 'Right';

type EpiCurveStackSegment = {
  value: number;
  y0: number;
  y1: number;
};

type EpiCurveDataInclusionSummary = {
  totalRecords: number;
  plottedRecords: number;
  invalidDateRecords: number;
  invalidValueRecords: number;
  text: string;
};

@Component({
    selector: 'app-timeline-component',
    templateUrl: './timeline-component.component.html',
    styleUrls: ['./timeline-component.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class TimelineComponent extends BaseComponentDirective implements OnInit, MicobeTraceNextPluginEvents, OnDestroy {

  @Output() DisplayGlobalSettingsDialogEvent = new EventEmitter();
  private destroy$ = new Subject<void>();
  private isDestroyed = false;
  @ViewChild('epiCurve') epiCurveElement: ElementRef;
  @ViewChild('epiCurveSVG') epiCurveSVGElement: ElementRef;
  viewActive: boolean = true;

  widgets: object;
  private visuals: MicrobeTraceNextVisuals;

  FieldList: SelectItem[] = [];
  FieldListStack: SelectItem[] = [];
  ValueFieldList: SelectItem[] = [];
  SelectedDateFieldVariable;
  SelectedDateFieldVariable2;
  SelectedDateFieldVariable3;
  SelectedDateFieldVariable4;
  binSizes = ['Day', 'Week', 'Month', 'Quarter', 'Year']
  tickInterval;
  labelSize = 12;
  legendLabelSize = 15;

  graphTypes = ['Single Date Field', 'Multi: Side by Side', 'Multi: Overlay']
  seriesTypeOptions: EpiCurveSeriesType[] = ['Bar', 'Line'];
  aggregationOptions: EpiCurveAggregation[] = ['Count', 'Sum', 'Last', 'Average'];
  seriesCumulativeOptions = [
    { label: 'Off (per bin)', value: false },
    { label: 'On (running total)', value: true },
  ];
  lineStyleOptions = ['Solid', 'Dashed'];
  readonly maxSeriesCount = 4;
  seriesCount = 1;
  seriesDataInclusionSummaries: Array<EpiCurveDataInclusionSummary | null> = [];
  private readonly defaultSeriesColors = ['#C6D8EB', '#B79ECC', '#F3BF79', '#80B1D3'];
  private readonly internalEpiCurveFields = new Set([
    'seq',
    'sequence',
    '_seq',
    '_seqint',
    '_cigar',
    'data',
    'index',
    '_id',
    'id',
    'selected',
    'cluster',
    'visible',
    'degree',
    'origin',
    'hasdistance',
    'x',
    'y',
    'vx',
    'vy',
    'foci',
  ]);
  selectedGraphType = 'Single Date Field';
  legendPositionOptions = ['Hide', 'Left', 'Top', 'Right', 'Bottom']
  tickUnitOptions = ['Automatic', 'Day', 'Week', 'Month', 'Year'];
  stackOrderOptions = ['Largest at Bottom', 'Smallest at Bottom', 'Custom']
  customStackOrderItems = [];

  ShowEpiSettingsPane: boolean = false;
  ShowEpiExportPane: boolean = false;
  EpiExportFileName: string = "";
  EpiExportFileType: string = "png";
  SelectedNetworkExportScaleVariable: any = 1;
  SelectedNetworkExportQualityVariable: any = 0.92;
  CalculatedResolution: string;

  private localColorMap: any = (x) => undefined;

  private svg;
  private margin = { top: 5, left: 45, right: 20, bottom: 50 };
  private width; // Default width, adjust as necessary
  private height; // Default height, adjust as necessary
  private middle;
  private x;
  private y;
  private yRight;
  private histogram;
  private brush;
  private brushG;
  private selection;
  private timer;
  private tick = 0;
  private isPlaying = false;

  private vnodes = []; // Replace with your actual data
  private timeDomainStart;
  private timeDomainEnd;

  private markEpiCurveRendered(): void {
    if (!this.viewActive) return;

    // Epi Curve can be the first rendered view on launch, so it must release
    // the shared processing modal without depending on the 2D render path.
    setTimeout(() => {
      this.store.setNetworkRendered(true);
    });
  }

  constructor(
    private commonService: CommonService,
    @Inject(BaseComponentDirective.GoldenLayoutContainerInjectionToken) private container: ComponentContainer,
    elRef: ElementRef,
    private cdref: ChangeDetectorRef,
    private store: CommonStoreService,
    private exportService: ExportService) {

      super(elRef.nativeElement);
      this.visuals = commonService.visuals;
      this.commonService.visuals.epiCurve = this;
      this.widgets = this.commonService.session.style.widgets;

      this.setDefaultsWidgets();

  }

  private updateFieldLists(): void {
    this.FieldList = [{ label: "None", value: "None" }];
    this.FieldListStack = [
      { label: "None", value: 'None'},
      { label: "Node Color", value: "Node Color"},
    ];
    this.ValueFieldList = [{ label: "None", value: "None" }];

    const nodeFields = this.commonService.session.data['nodeFields'] || [];
    const nodes = this.commonService.session.data.nodes || [];
    nodeFields.forEach((d) => {
        const label = this.getFieldLabel(d);
        if (!this.isInternalEpiCurveField(d)) {
          const populatedValues = nodes
            .map(node => node?.[d])
            .filter(value => !this.isMissingFieldValue(value));

          if (populatedValues.length > 0 && populatedValues.every(value => this.parseEpiCurveDate(value) != null)) {
            this.FieldList.push({ label, value: d });
          }

          if (populatedValues.length > 0 && populatedValues.every(value => this.isEpiCurveNumericValue(value))) {
            this.ValueFieldList.push({ label, value: d });
          }
        }

        if (`${d}`.toLowerCase() != 'seq' && `${d}`.toLowerCase() != 'sequence') {
          this.FieldListStack.push({ label, value: d });
        }
    });
  }

  private getFieldLabel(field): string {
    return this.commonService.capitalize(String(field || '').replace("_", ""));
  }

  private isInternalEpiCurveField(field): boolean {
    const normalizedField = String(field || '').trim().toLowerCase();
    return normalizedField == '' || normalizedField.startsWith('_') || this.internalEpiCurveFields.has(normalizedField);
  }

  private isMissingFieldValue(value): boolean {
    if (value == null) {
      return true;
    }

    const normalizedValue = String(value).trim().toLowerCase();
    return ['', 'null', 'undefined', 'na', 'n/a', 'nan', 'unknown'].includes(normalizedValue);
  }

  private parseEpiCurveDate(value): any | null {
    if (value instanceof Date) {
      const parsedDate = moment(value);
      return parsedDate.isValid() ? parsedDate : null;
    }

    if (typeof value != 'string') {
      return null;
    }

    const normalizedValue = value.trim();
    if (this.isMissingFieldValue(normalizedValue) || /^[-+]?\d+(\.\d+)?$/.test(normalizedValue)) {
      return null;
    }

    const parsedDate = moment(normalizedValue, [
      moment.ISO_8601,
      'M/D/YYYY',
      'M/D/YY',
      'M-D-YYYY',
      'M-D-YY',
      'YYYY/M/D',
      'MMM D, YYYY',
      'MMMM D, YYYY',
      'MMM D YYYY',
      'MMMM D YYYY',
      'D MMM YYYY',
      'D MMMM YYYY',
      'D-MMM-YYYY',
    ], true);
    return parsedDate.isValid() ? parsedDate : null;
  }

  private isEpiCurveNumericValue(value): boolean {
    if (typeof value == 'boolean' || value instanceof Date || this.parseEpiCurveDate(value) != null) {
      return false;
    }

    return Number.isFinite(Number(value));
  }

  private hasSelectOption(options: SelectItem[], value): boolean {
    return options.some(option => option.value == value);
  }

  private isDateFieldCompatible(field): boolean {
    return field != 'None' && this.hasSelectOption(this.FieldList, field);
  }

  private isValueFieldCompatible(field): boolean {
    return field == 'None' || this.hasSelectOption(this.ValueFieldList, field);
  }

  private isSeriesConfigurationValid(index: number): boolean {
    const dateField = this.widgets['epiCurve-date-fields']?.[index];
    const valueField = this.widgets['epiCurve-value-fields']?.[index] || 'None';
    return this.isDateFieldCompatible(dateField) && this.isValueFieldCompatible(valueField);
  }

  getDateFieldValidationMessage(index: number): string {
    const field = this.widgets['epiCurve-date-fields']?.[index];
    if (!field || field == 'None' || this.isDateFieldCompatible(field)) {
      return '';
    }

    return `${this.getFieldLabel(field)} is not a compatible date field. Choose a field containing calendar dates.`;
  }

  getValueFieldValidationMessage(index: number): string {
    const field = this.widgets['epiCurve-value-fields']?.[index];
    if (!field || field == 'None' || this.isValueFieldCompatible(field)) {
      return '';
    }

    return `${this.getFieldLabel(field)} is not a compatible numeric value field. Choose another field or None.`;
  }

  private updateSeriesDataInclusionSummaries(): void {
    const nodes = Array.isArray(this.commonService.session.data.nodes)
      ? this.commonService.session.data.nodes
      : [];

    this.seriesDataInclusionSummaries = Array.from(
      { length: this.maxSeriesCount },
      (_, index) => this.buildSeriesDataInclusionSummary(index, nodes),
    );
  }

  private buildSeriesDataInclusionSummary(
    index: number,
    nodes: any[],
  ): EpiCurveDataInclusionSummary | null {
    const dateField = this.widgets['epiCurve-date-fields']?.[index];
    if (!this.isDateFieldCompatible(dateField)) {
      return null;
    }

    const valueField = this.widgets['epiCurve-value-fields']?.[index] || 'None';
    const usesNumericValue = this.selectedGraphType != 'Single Date Field'
      && valueField != 'None'
      && this.getSeriesAggregation(index) != 'Count';
    let plottedRecords = 0;
    let invalidDateRecords = 0;
    let invalidValueRecords = 0;

    nodes.forEach(node => {
      if (this.parseEpiCurveDate(node?.[dateField]) == null) {
        invalidDateRecords += 1;
        return;
      }

      if (usesNumericValue && !this.isSeriesNumericValueUsable(node?.[valueField])) {
        invalidValueRecords += 1;
        return;
      }

      plottedRecords += 1;
    });

    const totalRecords = nodes.length;
    const recordLabel = totalRecords == 1 ? 'record' : 'records';
    const details = [];
    if (invalidDateRecords > 0) {
      details.push(`${invalidDateRecords} missing or invalid ${invalidDateRecords == 1 ? 'date' : 'dates'}`);
    }
    if (invalidValueRecords > 0) {
      details.push(`${invalidValueRecords} missing or nonnumeric ${invalidValueRecords == 1 ? 'value' : 'values'}`);
    }

    return {
      totalRecords,
      plottedRecords,
      invalidDateRecords,
      invalidValueRecords,
      text: `${plottedRecords} of ${totalRecords} ${recordLabel} plotted${details.length > 0 ? ` · ${details.join(' · ')}` : ''}`,
    };
  }

  private isSeriesNumericValueUsable(value): boolean {
    const normalizedValue = value == null ? '' : String(value).trim();
    return normalizedValue != ''
      && normalizedValue.toLowerCase() != 'null'
      && Number.isFinite(Number(value));
  }

  ngOnInit() {

    // populate this.twoD.FieldList with [None, ...nodeFields]
    this.updateFieldLists();

    this.updateSettingsRows();    

    this.store.clusterUpdate$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      const stackColoringIsVisible = this.selectedGraphType == 'Single Date Field'
        || (this.selectedGraphType == 'Multi: Overlay' && this.isOverlayStackEligible());
      if (stackColoringIsVisible && (this.widgets['epiCurve-stackColorBy'] == 'cluster' || (this.widgets['epiCurve-stackColorBy'] == 'Node Color' && this.widgets['node-color-variable'] == 'cluster'))) {
        this.refresh();
      }
    })
 }
  
  ngOnDestroy(): void {
    this.isDestroyed = true;
    this.destroy$.next();
    this.destroy$.complete();
  }

  setDefaultsWidgets() {
    // graphType
    if (this.widgets['epiCurve-graphType'] == undefined) {
      this.widgets['epiCurve-graphType'] = 'Single Date Field';
    }
    this.selectedGraphType = this.widgets['epiCurve-graphType'];

    // date fields
    if (!Array.isArray(this.widgets['epiCurve-date-fields'])) {
      if (this.widgets['epi-timeline-date-field'] != undefined) {
        this.widgets['epiCurve-date-fields'] = [this.widgets['epi-timeline-date-field']]
      } else {
        this.widgets['epiCurve-date-fields'] = ['None']
      }
    }
    this.widgets['epiCurve-date-fields'] = this.normalizeSeriesSetting(
      this.widgets['epiCurve-date-fields'],
      'None');

    const savedSeriesCount = Number(this.widgets['epiCurve-series-count']);
    const lastConfiguredSeries = this.widgets['epiCurve-date-fields']
      .reduce((lastIndex, dateField, index) => dateField != 'None' ? index : lastIndex, -1) + 1;
    this.seriesCount = this.clampSeriesCount(Math.max(
      Number.isFinite(savedSeriesCount) ? savedSeriesCount : 1,
      lastConfiguredSeries,
      1,
    ));
    this.widgets['epiCurve-series-count'] = this.seriesCount;
    this.syncSelectedDateFieldVariables();

    const savedValueFields = Array.isArray(this.widgets['epiCurve-value-fields'])
      ? this.widgets['epiCurve-value-fields']
      : [];
    this.widgets['epiCurve-value-fields'] = this.normalizeSeriesSetting(savedValueFields, 'None');

    const savedAggregations = Array.isArray(this.widgets['epiCurve-series-aggregations'])
      ? this.widgets['epiCurve-series-aggregations']
      : [];
    this.widgets['epiCurve-series-aggregations'] = this.widgets['epiCurve-value-fields']
      .map((valueField, index) => {
        const savedAggregation = savedAggregations[index];
        if (this.isAggregation(savedAggregation)) {
          return valueField == 'None' ? 'Count' : savedAggregation;
        }
        return valueField == 'None' ? 'Count' : 'Sum';
      });

    const savedSeriesCumulative = Array.isArray(this.widgets['epiCurve-series-cumulative'])
      ? this.widgets['epiCurve-series-cumulative']
      : [];
    const legacyCumulative = Boolean(this.widgets['epiCurve-cumulative']);
    this.widgets['epiCurve-series-cumulative'] = this.normalizeSeriesSetting(
      savedSeriesCumulative,
      legacyCumulative,
    ).map(value => Boolean(value));

    const savedSeriesLabels = Array.isArray(this.widgets['epiCurve-series-labels'])
      ? this.widgets['epiCurve-series-labels']
      : [];
    this.widgets['epiCurve-series-labels'] = this.normalizeSeriesSetting(savedSeriesLabels, '')
      .map(label => typeof label == 'string' ? label : '');

    // colors
    const savedColors = Array.isArray(this.widgets['epiCurve-colors'])
      ? this.widgets['epiCurve-colors']
      : [];
    this.widgets['epiCurve-colors'] = this.defaultSeriesColors.map((defaultColor, index) =>
      savedColors[index] || defaultColor);

    const defaultLineStyles = ['Solid', 'Solid', 'Dashed', 'Solid'];
    const savedLineStyles = Array.isArray(this.widgets['epiCurve-lineStyles'])
      ? this.widgets['epiCurve-lineStyles']
      : [];
    this.widgets['epiCurve-lineStyles'] = defaultLineStyles.map((defaultStyle, index) =>
      savedLineStyles[index] == 'Solid' || savedLineStyles[index] == 'Dashed'
        ? savedLineStyles[index]
        : defaultStyle);

    const savedSeriesTypes = Array.isArray(this.widgets['epiCurve-series-types'])
      ? this.widgets['epiCurve-series-types']
      : [];
    const legacySeriesTypes: EpiCurveSeriesType[] = this.selectedGraphType == 'Multi: Overlay'
      ? ['Bar', 'Line', 'Line', 'Bar']
      : ['Bar', 'Bar', 'Bar', 'Bar'];
    this.widgets['epiCurve-series-types'] = legacySeriesTypes.map((defaultType, index) =>
      savedSeriesTypes[index] == 'Line' || savedSeriesTypes[index] == 'Bar'
        ? savedSeriesTypes[index]
        : defaultType);

    // stackColorBy field
    if (this.widgets['epiCurve-stackColorBy'] == undefined) {
      this.widgets['epiCurve-stackColorBy'] = 'None';
    }

    // stack order
    if (this.widgets['epiCurve-stackOrder'] == undefined) {
      this.widgets['epiCurve-stackOrder'] = 'Largest at Bottom';
    }
    if (this.widgets['epiCurve-customStackOrder'] == undefined) {
      this.widgets['epiCurve-customStackOrder'] = [];
    }
    if (this.widgets['epiCurve-stackGroupColors'] == undefined) {
      this.widgets['epiCurve-stackGroupColors'] = {};
    }
    if (this.widgets['epiCurve-stackGroupTransparencies'] == undefined) {
      this.widgets['epiCurve-stackGroupTransparencies'] = {};
    }

    // binSize
    if (this.widgets['epiCurve-binSize'] == undefined) {
      this.widgets['epiCurve-binSize'] = 'Month'
    }

    //
    if (this.widgets['epiCurve-cumulative'] == undefined) {
      this.widgets['epiCurve-cumulative'] = false;
    }

    // legendPosition
    if (this.widgets['epiCurve-legendPosition'] == undefined) {
      this.widgets['epiCurve-legendPosition'] = 'Left';
    }
    if (this.widgets['epiCurve-tickUnit'] == undefined) {
      this.widgets['epiCurve-tickUnit'] = 'Automatic';
    }
    if (this.widgets['epiCurve-tickInterval'] == undefined) {
      this.widgets['epiCurve-tickInterval'] = 1;
    }
    this.tickInterval = Math.max(1, Number(this.widgets['epiCurve-tickInterval']) || 1);

  }

  get visibleSeriesIndexes(): number[] {
    const count = this.selectedGraphType == 'Single Date Field' ? 1 : this.seriesCount;
    return Array.from({ length: count }, (_, index) => index);
  }

  getSeriesDateLabel(index: number): string {
    return index == 0 ? 'Date Field' : `Date Field ${index + 1}`;
  }

  getSeriesColorInputId(index: number): string {
    return index == 0 ? 'epi-color-select' : `epi-color-select-${index + 1}`;
  }

  getSeriesType(index: number): EpiCurveSeriesType {
    return this.widgets['epiCurve-series-types']?.[index] == 'Line' ? 'Line' : 'Bar';
  }

  getSeriesAxis(index: number): EpiCurveAxis {
    return this.isDualAxisMulti() && this.getSeriesType(index) == 'Bar' ? 'Right' : 'Left';
  }

  getOverlayStackBarIndex(): number | null {
    if (this.selectedGraphType != 'Multi: Overlay') {
      return null;
    }

    const barIndexes = this.visibleSeriesIndexes
      .filter(index => this.isSeriesConfigurationValid(index) && this.getSeriesType(index) == 'Bar');
    return barIndexes.length == 1 ? barIndexes[0] : null;
  }

  isOverlayStackEligible(): boolean {
    const barIndex = this.getOverlayStackBarIndex();
    if (barIndex == null) {
      return false;
    }

    const aggregation = this.getSeriesAggregation(barIndex);
    return aggregation == 'Count' || aggregation == 'Sum';
  }

  getOverlayStackAvailabilityMessage(): string {
    if (this.selectedGraphType != 'Multi: Overlay') {
      return '';
    }

    const barIndexes = this.visibleSeriesIndexes
      .filter(index => this.isSeriesConfigurationValid(index) && this.getSeriesType(index) == 'Bar');
    if (barIndexes.length != 1) {
      return 'Stack colors are available when Overlay contains exactly one configured bar series.';
    }

    if (!this.isOverlayStackEligible()) {
      return 'Stack colors require the bar series to use Count or Sum. Last and Average remain unstacked.';
    }

    return 'The bar is stacked by category. Any line series remain overlaid on the left axis.';
  }

  getSeriesAggregation(index: number): EpiCurveAggregation {
    const aggregation = this.widgets['epiCurve-series-aggregations']?.[index];
    if (this.widgets['epiCurve-value-fields']?.[index] == 'None') {
      return 'Count';
    }
    return this.isAggregation(aggregation) ? aggregation : 'Sum';
  }

  getSeriesCumulative(index: number): boolean {
    return Boolean(this.widgets['epiCurve-series-cumulative']?.[index]);
  }

  getDefaultSeriesLabel(index: number): string {
    const valueField = this.widgets['epiCurve-value-fields']?.[index];
    if (this.getSeriesAggregation(index) != 'Count' && valueField && valueField != 'None') {
      return this.getTooltipLabel(valueField);
    }

    const dateField = this.widgets['epiCurve-date-fields']?.[index];
    if (dateField && dateField != 'None') {
      return this.getTooltipLabel(dateField);
    }

    return `Series ${index + 1}`;
  }

  getSeriesLabel(index: number): string {
    const customLabel = String(this.widgets['epiCurve-series-labels']?.[index] || '').trim();
    return customLabel || this.getDefaultSeriesLabel(index);
  }

  getDefaultYAxisLabel(axis: EpiCurveAxis): string {
    if (this.selectedGraphType == 'Single Date Field') {
      return this.getSeriesAxisValueLabel(0);
    }

    const labels = this.visibleSeriesIndexes
      .filter(index => this.isSeriesConfigurationValid(index) && this.getSeriesAxis(index) == axis)
      .map(index => this.getSeriesAxisValueLabel(index))
      .filter((label, index, allLabels) => allLabels.indexOf(label) == index);

    return labels.join(' / ') || 'Number of Records';
  }

  private getSeriesAxisValueLabel(index: number): string {
    const valueField = this.widgets['epiCurve-value-fields']?.[index];
    if (this.getSeriesAggregation(index) != 'Count' && valueField && valueField != 'None') {
      return this.getTooltipLabel(valueField);
    }

    const dateField = this.widgets['epiCurve-date-fields']?.[index];
    return dateField && dateField != 'None'
      ? `Count of ${this.getTooltipLabel(dateField)}`
      : 'Number of Records';
  }

  addSeries(): void {
    if (this.seriesCount >= this.maxSeriesCount) {
      return;
    }

    const index = this.seriesCount;
    this.widgets['epiCurve-date-fields'][index] = 'None';
    this.widgets['epiCurve-value-fields'][index] = 'None';
    this.widgets['epiCurve-series-labels'][index] = '';
    this.widgets['epiCurve-series-aggregations'][index] = 'Count';
    this.widgets['epiCurve-series-cumulative'][index] = false;
    this.widgets['epiCurve-series-types'][index] = 'Bar';
    this.widgets['epiCurve-lineStyles'][index] = 'Solid';
    this.widgets['epiCurve-colors'][index] = this.defaultSeriesColors[index];
    this.seriesCount += 1;
    this.widgets['epiCurve-series-count'] = this.seriesCount;
    this.syncSelectedDateFieldVariables();
    this.refresh();
  }

  removeSeries(index: number): void {
    if (index <= 0 || index >= this.seriesCount) {
      return;
    }

    const defaults = {
      'epiCurve-date-fields': 'None',
      'epiCurve-value-fields': 'None',
      'epiCurve-series-labels': '',
      'epiCurve-series-aggregations': 'Count',
      'epiCurve-series-cumulative': false,
      'epiCurve-series-types': 'Bar',
      'epiCurve-lineStyles': 'Solid',
    };
    Object.entries(defaults).forEach(([widgetName, defaultValue]) => {
      this.widgets[widgetName].splice(index, 1);
      this.widgets[widgetName].push(defaultValue);
    });
    this.widgets['epiCurve-colors'].splice(index, 1);
    this.widgets['epiCurve-colors'].push(this.defaultSeriesColors[this.maxSeriesCount - 1]);

    this.seriesCount -= 1;
    this.widgets['epiCurve-series-count'] = this.seriesCount;
    this.syncSelectedDateFieldVariables();
    this.refresh();
  }

  private normalizeSeriesSetting(values, defaultValue) {
    return Array.from({ length: this.maxSeriesCount }, (_, index) =>
      values?.[index] ?? defaultValue);
  }

  private isAggregation(value): value is EpiCurveAggregation {
    return this.aggregationOptions.includes(value);
  }

  private clampSeriesCount(value: number): number {
    return Math.min(this.maxSeriesCount, Math.max(1, Math.round(value)));
  }

  private syncSelectedDateFieldVariables(): void {
    const dateFields = this.widgets['epiCurve-date-fields'];
    this.SelectedDateFieldVariable = dateFields[0];
    this.SelectedDateFieldVariable2 = dateFields[1];
    this.SelectedDateFieldVariable3 = dateFields[2];
    this.SelectedDateFieldVariable4 = dateFields[3];
  }

 ngAfterViewInit() {

  // this.initializeD3Chart();
  this.setupEventListeners();
  this.refresh();
  this.markEpiCurveRendered();
 }
  
/**
 * Clears previous histogram/epi curve and creates a new one; calls refreshMulti if needed
 */
public refresh(): void {
  this.updateSeriesDataInclusionSummaries();

  if (this.selectedGraphType=='Multi: Overlay' || this.selectedGraphType=='Multi: Side by Side') {
    this.refreshMulti();
    return;
  }

  $('#epiCurveSVG').empty()

  if (!this.isDateFieldCompatible(this.SelectedDateFieldVariable)) {
    return;
  }

  this.updateSizes();
  if (this.height < 0) {
    return;
  }

  const field = this.SelectedDateFieldVariable;
  let times = this.getTimes([field]);

  // updates this.timeDomainStart and this.timeDomainInterval and returns the bin interval
  let binInterval = this.calculateBinInterval(times);
  if (binInterval == 0) {
    return;
  }

  this.x = d3.scaleTime().domain([this.timeDomainStart, this.timeDomainEnd]).rangeRound([0, this.width]);
  this.y = d3.scaleLinear().range([this.height, 0]);

  //@ts-ignore
  this.histogram = d3.histogram().value(d => d[field as string]).domain(this.x.domain()).thresholds(binInterval);

  this.svg = d3.select(this.epiCurveSVGElement.nativeElement)
    .attr("width", this.width + this.margin.left + this.margin.right)
    .attr("height", this.height + this.margin.top + this.margin.bottom)
    //.attr("transform", `translate(0, ${this.margin.top})`);
    

  const epiCurve = this.svg.append("g")
    .classed("epiCurve-epi-curve", true)
    .attr("transform", `translate(${this.margin.left}, ${this.margin.top})`);

  let bins = this.histogram(this.vnodes);
  
  let colorVariable = this.commonService.session.style.widgets['node-color-variable'];
  let nodeColorKeys;
  if (colorVariable != 'None' && this.widgets['epiCurve-stackColorBy'] == 'Node Color') {
    nodeColorKeys = this.commonService.session.style.nodeColorsTableKeys[colorVariable].map(value => value=='null' ? null: value);
    this.localColorMap = this.commonService.temp.style.nodeColorMap;
  } else if (this.widgets['epiCurve-stackColorBy'] != 'None') {
    nodeColorKeys = this.updateLocalColorMap();
  }
  if (nodeColorKeys) {
    nodeColorKeys = this.getOrderedStackKeys(nodeColorKeys, this.widgets['epiCurve-stackColorBy'] == 'Node Color' ? colorVariable : this.widgets['epiCurve-stackColorBy']);
  }

  let maxCount = 0;
  [maxCount, bins] = this.updateBins(bins, this.widgets['epiCurve-stackColorBy'] == 'Node Color' ? colorVariable : this.widgets['epiCurve-stackColorBy'], nodeColorKeys);
  

  this.y.domain([0, maxCount]).nice()//d3.max(bins, d => d.length)]);

  if ((colorVariable != 'None' && this.widgets['epiCurve-stackColorBy'] == 'Node Color') || (this.widgets['epiCurve-stackColorBy'] != 'None' && this.widgets['epiCurve-stackColorBy'] != 'Node Color')) {
    let nodeColors = [];
    let nodeOpacities = [];

    nodeColorKeys.forEach((value, ind) =>{
      const fill = this.getStackFill(value);
      const opacity = this.getStackOpacity(value);
      const rects = epiCurve.selectAll(`rect${ind}`)
      .data(bins)
      .enter()
      .append("rect")
      .attr("transform", d => `translate(${this.x(d.x0)}, ${this.y(d.height[ind])})`)
      .attr("width", d => this.x(d.x1) - this.x(d.x0))
      .attr("height", d => this.height - this.y(d.length2[ind]))
      .attr("fill", fill)
      .attr("opacity", opacity)
      .attr("stroke", "black" );

      rects.append("title")
        .text(d => this.getSingleBinTooltip(d, field, value, this.getSegmentCount(d, ind)))

      nodeColors.push(fill);
      nodeOpacities.push(opacity);
    })
    this.generateLegend(epiCurve, nodeColors, nodeColorKeys, nodeOpacities)
  } else {
    let color = this.widgets['epiCurve-stackColorBy'] == 'None' ? this.widgets['epiCurve-colors'][0] : this.widgets["node-color"];
    const rects = epiCurve.selectAll("rect")
      .data(bins)
      .enter()
      .append("rect")
      .attr("transform", d => `translate(${this.x(d.x0)}, ${this.y(d.length)})`)
      .attr("width", d => this.x(d.x1) - this.x(d.x0))
      .attr("height", d => this.height - this.y(d.length))
      .attr("fill", color)
      .attr("stroke", "black");

    rects.append("title")
      .text(d => this.getSingleBinTooltip(d, field));

    this.generateLegend(epiCurve, [color] ,[this.SelectedDateFieldVariable])
  }

  this.updateAxes();
} 

/**
 * Updated version of refresh that works for multiple date fields to generate the epi curve graph
 * Calls refresh() instead if needed
 */
private refreshMulti(): void {
  if (this.selectedGraphType=='Single Date Field') {
    this.refresh();
    return;
  }

  $('#epiCurveSVG').empty()

  const configuredSeries = this.visibleSeriesIndexes
    .map(fieldIndex => ({
      fieldIndex,
      field: this.widgets['epiCurve-date-fields'][fieldIndex],
      color: this.widgets['epiCurve-colors'][fieldIndex],
      type: this.getSeriesType(fieldIndex),
    }))
    .filter(series => this.isSeriesConfigurationValid(series.fieldIndex));

  if (configuredSeries.length == 0) {
    return;
  }

  const fields = configuredSeries.map(series => series.field);
  const colors = configuredSeries.map(series => series.color);
  const fieldIndexes = configuredSeries.map(series => series.fieldIndex);
  const seriesTypes = configuredSeries.map(series => series.type);
  const seriesLabels = fieldIndexes.map(fieldIndex => this.getSeriesLabel(fieldIndex));
  const useDualAxis = this.isDualAxisMulti();
  this.updateSizes();
  if (this.height < 0) {
    return;
  }

  // current implementation of times is only used to calculate min and max time of all data given when setting up x axis and bins; there isn't a current need to link times by datapoint with times
  let times = this.getTimes(fields);

  // updates this.timeDomainStart and this.timeDomainInterval and returns the bin interval
  let binInterval = this.calculateBinInterval(times);
  if (binInterval == 0) {
    return;
  }

  this.x = d3.scaleTime().domain([this.timeDomainStart, this.timeDomainEnd]).rangeRound([0, this.width]);
  this.y = d3.scaleLinear().range([this.height, 0]);
  this.yRight = useDualAxis ? d3.scaleLinear().range([this.height, 0]) : undefined;

  this.svg = d3.select(this.epiCurveSVGElement.nativeElement)
    .attr("width", this.width + this.margin.left + this.margin.right)
    .attr("height", this.height + this.margin.top + this.margin.bottom);
    

  const epiCurve = this.svg.append("g")
    .classed("epiCurve-epi-curve", true)
    .attr("transform", `translate(${this.margin.left}, ${this.margin.top})`);

  let maxCount = 0;
  let bins = [];
  let barMax = 0;
  let lineMax = 0;
  fields.forEach((field, ind) => {
    if (field != 'None') {
      //@ts-ignore
      const seriesHistogram = d3.histogram()
        .value(d => d[field])
        .domain(this.x.domain())
        .thresholds(binInterval);
      let currentbin = seriesHistogram(this.vnodes);
      const [currentCount, updatedBins] = this.updateMultiSeriesBins(currentbin, fieldIndexes[ind]);
      currentbin = updatedBins;
      bins.push(currentbin)
      if (currentCount > maxCount) maxCount = currentCount;
      if (seriesTypes[ind] == 'Bar') {
        barMax = Math.max(barMax, currentCount);
      } else {
        lineMax = Math.max(lineMax, currentCount);
      }
    }
  })

  const overlayStackBarFieldIndex = this.isOverlayStackEligible()
    ? this.getOverlayStackBarIndex()
    : null;
  const overlayStackSeriesIndex = overlayStackBarFieldIndex == null
    ? -1
    : fieldIndexes.indexOf(overlayStackBarFieldIndex);
  const overlayStackConfiguration = overlayStackSeriesIndex >= 0
    ? this.getMultiStackColorConfiguration(overlayStackBarFieldIndex)
    : null;
  if (overlayStackConfiguration) {
    const stackMax = this.updateMultiStackBins(
      bins[overlayStackSeriesIndex],
      overlayStackBarFieldIndex,
      overlayStackConfiguration.colorVariable,
      overlayStackConfiguration.keys);
    barMax = Math.max(barMax, stackMax);
    maxCount = Math.max(maxCount, stackMax);
  }

  if (useDualAxis) {
    this.y.domain([0, Math.max(1, lineMax * 1.08)]).nice();
    this.yRight.domain([0, Math.max(1, barMax * 1.1)]).nice();
  } else {
    this.y.domain([0, Math.max(1, maxCount)]).nice();
  }

  const barSeriesIndexes = fields
    .map((_, index) => index)
    .filter(index => seriesTypes[index] == 'Bar');
  const lineSeriesIndexes = fields
    .map((_, index) => index)
    .filter(index => seriesTypes[index] == 'Line');
  const barScale = useDualAxis ? this.yRight : this.y;
  const layerBars = this.selectedGraphType == 'Multi: Overlay';

  barSeriesIndexes.forEach((seriesIndex, barPosition) => {
    const fieldIndex = fieldIndexes[seriesIndex];
    const barCount = Math.max(1, barSeriesIndexes.length);
    const getBarWidth = d => {
      const fullWidth = this.x(d.x1) - this.x(d.x0);
      return layerBars ? fullWidth : fullWidth / barCount;
    };
    const getBarX = d => {
      const fullWidth = this.x(d.x1) - this.x(d.x0);
      return this.x(d.x0) + (layerBars ? 0 : barPosition * fullWidth / barCount);
    };

    if (overlayStackConfiguration && seriesIndex == overlayStackSeriesIndex) {
      overlayStackConfiguration.keys.forEach((stackKey, stackIndex) => {
        const fill = this.getStackFill(stackKey);
        const opacity = this.getStackOpacity(stackKey);
        const rects = epiCurve.selectAll(`rect${seriesIndex}-${stackIndex}`)
          .data(bins[seriesIndex])
          .enter()
          .append("rect")
          .attr("class", "epiCurve-bar-series epiCurve-overlay-bar epiCurve-stacked-bar-segment")
          .attr("data-field-index", fieldIndex)
          .attr("data-series-type", "bar")
          .attr("data-series-axis", this.getSeriesAxis(fieldIndex).toLowerCase())
          .attr("data-aggregation", this.getSeriesAggregation(fieldIndex).toLowerCase())
          .attr("data-cumulative", this.getSeriesCumulative(fieldIndex).toString())
          .attr("data-stack-index", stackIndex)
          .attr("data-stack-key", stackKey == null ? '' : String(stackKey))
          .attr("data-segment-value", d => this.getMultiStackSegment(d, stackIndex).value)
          .attr("data-stack-total", d => this.getBinCount(d))
          .attr("transform", d => {
            const segment = this.getMultiStackSegment(d, stackIndex);
            return `translate(${getBarX(d)}, ${barScale(segment.y1)})`;
          })
          .attr("width", getBarWidth)
          .attr("height", d => {
            const segment = this.getMultiStackSegment(d, stackIndex);
            return Math.max(0, barScale(segment.y0) - barScale(segment.y1));
          })
          .attr("fill", fill)
          .attr("opacity", opacity)
          .attr("stroke", "black");

        rects.append("title")
          .text((d, binIndex) => this.getMultiStackBinTooltip(
            d,
            stackKey,
            this.getMultiStackSegment(d, stackIndex).value,
            overlayStackConfiguration.colorVariable,
            seriesLabels[seriesIndex],
            seriesLabels,
            bins,
            lineSeriesIndexes,
            binIndex));
      });
      return;
    }

    const rects = epiCurve.selectAll(`rect${seriesIndex}`)
      .data(bins[seriesIndex])
      .enter()
      .append("rect")
      .attr("class", `epiCurve-bar-series${layerBars ? ' epiCurve-overlay-bar' : ''}`)
      .attr("data-field-index", fieldIndex)
      .attr("data-series-type", "bar")
      .attr("data-series-axis", this.getSeriesAxis(fieldIndex).toLowerCase())
      .attr("data-aggregation", this.getSeriesAggregation(fieldIndex).toLowerCase())
      .attr("data-cumulative", this.getSeriesCumulative(fieldIndex).toString())
      .attr("transform", d => `translate(${getBarX(d)}, ${barScale(this.getBinCount(d))})`)
      .attr("width", getBarWidth)
      .attr("height", d => this.height - barScale(this.getBinCount(d)))
      .attr("fill", colors[seriesIndex])
      .attr("opacity", layerBars && barSeriesIndexes.length > 1 ? 0.6 : 1)
      .attr("stroke", "black");

    rects.append("title")
      .text((_, binIndex) => this.getMultiBinTooltip(seriesLabels, bins, binIndex));
  });

  lineSeriesIndexes.forEach(seriesIndex => {
    const fieldIndex = fieldIndexes[seriesIndex];
    const lineStyle = this.getLineStyle(fieldIndex);
    const lineGenerator = d3.line<any>()
      .x((d: any) => this.x(new Date((d.x0.getTime() + d.x1.getTime()) / 2)))
      .y((d: any) => this.y(this.getBinCount(d)));
    const linePath = epiCurve.append("path")
      .datum(bins[seriesIndex])
      .attr("class", "epiCurve-line-overlay")
      .attr("data-field-index", fieldIndex)
      .attr("data-series-type", "line")
      .attr("data-series-axis", this.getSeriesAxis(fieldIndex).toLowerCase())
      .attr("data-aggregation", this.getSeriesAggregation(fieldIndex).toLowerCase())
      .attr("data-cumulative", this.getSeriesCumulative(fieldIndex).toString())
      .attr("data-line-style", lineStyle.toLowerCase())
      .attr("fill", "none")
      .attr("stroke", colors[seriesIndex])
      .attr("stroke-width", 3)
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round")
      .attr("stroke-dasharray", this.getLineDashArray(lineStyle))
      .attr("vector-effect", "non-scaling-stroke")
      .attr("d", lineGenerator as any);

    linePath.append("title")
      .text(`${seriesLabels[seriesIndex]} (${lineStyle.toLowerCase()} line)`);
  });

  this.updateAxes(useDualAxis);
  const lineStyles = fieldIndexes.map(fieldIndex => this.getLineStyle(fieldIndex));
  if (overlayStackConfiguration) {
    const stackFieldLabel = this.getTooltipLabel(overlayStackConfiguration.colorVariable);
    const stackColors = overlayStackConfiguration.keys.map(key => this.getStackFill(key));
    const stackOpacities = overlayStackConfiguration.keys.map(key => this.getStackOpacity(key));
    const stackLabels = overlayStackConfiguration.keys
      .map(key => `${stackFieldLabel}: ${this.getTooltipLabel(key)}`);
    const overlayLineColors = lineSeriesIndexes.map(index => colors[index]);
    const overlayLineLabels = lineSeriesIndexes.map(index => `Line: ${seriesLabels[index]}`);
    const overlayLineStyles = lineSeriesIndexes.map(index => lineStyles[index]);
    this.generateLegend(
      epiCurve,
      [...stackColors, ...overlayLineColors],
      [...stackLabels, ...overlayLineLabels],
      [...stackOpacities, ...overlayLineColors.map(() => 1)],
      [...stackLabels.map(() => 'bar'), ...overlayLineLabels.map(() => 'line')],
      [...stackLabels.map(() => 'Solid'), ...overlayLineStyles],
      false);
  } else {
    this.generateLegend(
      epiCurve,
      colors,
      seriesLabels,
      [],
      seriesTypes.map(seriesType => seriesType.toLowerCase()),
      lineStyles,
      false);
  }
} 

isDualAxisMulti(): boolean {
  if (this.selectedGraphType == 'Single Date Field') {
    return false;
  }

  const activeTypes = this.visibleSeriesIndexes
    .filter(index => this.isSeriesConfigurationValid(index))
    .map(index => this.getSeriesType(index));
  return activeTypes.includes('Bar') && activeTypes.includes('Line');
}

private getMultiStackColorConfiguration(fieldIndex: number): { colorVariable: string; keys: any[] } | null {
  if (!this.isOverlayStackEligible() || this.getOverlayStackBarIndex() != fieldIndex) {
    return null;
  }

  const colorVariable = this.getCurrentStackColorVariable();
  if (!colorVariable || colorVariable == 'None') {
    return null;
  }

  let keys;
  if (this.widgets['epiCurve-stackColorBy'] == 'Node Color') {
    const savedKeys = this.commonService.session.style.nodeColorsTableKeys[colorVariable] || [];
    keys = savedKeys.map(value => value == 'null' ? null : value);
    this.localColorMap = this.commonService.temp.style.nodeColorMap;
  } else {
    keys = this.updateLocalColorMap();
  }

  keys = this.getOrderedStackKeys(keys, colorVariable, fieldIndex);
  return keys.length > 0 ? { colorVariable, keys } : null;
}

private updateMultiStackBins(bins, fieldIndex: number, colorVariable: string, keys: any[]): number {
  const aggregation = this.getSeriesAggregation(fieldIndex);
  const valueField = this.widgets['epiCurve-value-fields']?.[fieldIndex] || 'None';
  const cumulative = this.getSeriesCumulative(fieldIndex);
  const runningSegmentValues = keys.map(() => 0);
  let maxStackHeight = 0;

  bins.forEach(bin => {
    const segmentValues = keys.map((key, stackIndex) => {
      const matchingNodes = bin.filter(node => this.isStackGroupMatch(node?.[colorVariable], key));
      const binValue = this.aggregateSeriesBin(matchingNodes, fieldIndex, valueField, aggregation);
      if (cumulative) {
        runningSegmentValues[stackIndex] += binValue;
        return runningSegmentValues[stackIndex];
      }

      return binValue;
    });

    let offset = 0;
    bin.stackSegments = segmentValues.map(value => {
      const segment: EpiCurveStackSegment = {
        value,
        y0: offset,
        y1: offset + value,
      };
      offset = segment.y1;
      return segment;
    });
    bin.displayCount = offset;
    maxStackHeight = Math.max(maxStackHeight, offset);
  });

  return maxStackHeight;
}

private isStackGroupMatch(nodeValue, stackKey): boolean {
  if (nodeValue == null && stackKey == null) {
    return true;
  }

  return nodeValue == stackKey;
}

private getMultiStackSegment(bin, stackIndex: number): EpiCurveStackSegment {
  return bin?.stackSegments?.[stackIndex] || { value: 0, y0: 0, y1: 0 };
}

private updateMultiSeriesBins(bins, fieldIndex: number): [number, any[]] {
  const valueField = this.widgets['epiCurve-value-fields']?.[fieldIndex] || 'None';
  const aggregation = this.getSeriesAggregation(fieldIndex);
  const cumulative = this.getSeriesCumulative(fieldIndex);
  let cumulativeCount = 0;
  let maxCount = 0;

  bins.forEach(bin => {
    const binCount = this.aggregateSeriesBin(bin, fieldIndex, valueField, aggregation);
    cumulativeCount += binCount;
    bin.binCount = binCount;
    bin.cumulativeCount = cumulativeCount;
    bin.displayCount = cumulative ? cumulativeCount : binCount;
    maxCount = Math.max(maxCount, bin.displayCount);
  });

  return [maxCount, bins];
}

private aggregateSeriesBin(
  bin,
  fieldIndex: number,
  valueField: string,
  aggregation: EpiCurveAggregation,
): number {
  if (aggregation == 'Count' || valueField == 'None') {
    return bin.length;
  }

  const dateField = this.widgets['epiCurve-date-fields']?.[fieldIndex];
  const numericEntries = bin.reduce((entries, node, inputIndex) => {
    const rawValue = node?.[valueField];
    const normalizedValue = rawValue == null ? '' : String(rawValue).trim();
    if (normalizedValue == '' || normalizedValue.toLowerCase() == 'null') {
      return entries;
    }

    const value = Number(rawValue);
    if (!Number.isFinite(value)) {
      return entries;
    }

    const timestamp = new Date(node?.[dateField]).getTime();
    entries.push({
      value,
      timestamp: Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY,
      inputIndex,
    });
    return entries;
  }, []);

  if (numericEntries.length == 0) {
    return 0;
  }

  if (aggregation == 'Sum') {
    return d3.sum(numericEntries, entry => entry.value);
  }

  if (aggregation == 'Average') {
    return d3.mean(numericEntries, entry => entry.value) ?? 0;
  }

  const lastEntry = numericEntries.reduce((latest, entry) =>
    entry.timestamp > latest.timestamp
      || (entry.timestamp == latest.timestamp && entry.inputIndex > latest.inputIndex)
      ? entry
      : latest);
  return lastEntry.value;
}

private getLineStyle(fieldIndex): string {
  return this.widgets['epiCurve-lineStyles']?.[fieldIndex] == 'Dashed' ? 'Dashed' : 'Solid';
}

private getLineDashArray(lineStyle): string | null {
  return lineStyle == 'Dashed' ? '10 7' : null;
}

/**
 * Return an array of unique options for nodes[this.widgets['epiCurve-stackColorBy']] and then also used that information to update localColorMap function
 */
updateLocalColorMap() {
  let nodeColorTableKeys = [];
  this.commonService.session.data.nodes.forEach((node) => {
    if (!node.visible) return;
    if (!nodeColorTableKeys.some(value => value == node[this.widgets['epiCurve-stackColorBy']])) {
      nodeColorTableKeys.push(node[this.widgets['epiCurve-stackColorBy']])
    }
  })
  this.localColorMap = d3.scaleOrdinal(this.commonService.thirtyColorPalette).domain(nodeColorTableKeys);

  return nodeColorTableKeys;
}

private getOrderedStackKeys(keys, colorVariable, fieldIndex: number | null = null) {
  const order = this.widgets['epiCurve-stackOrder'];
  let orderedKeys;
  if (order == 'Custom') {
    orderedKeys = this.getCustomOrderedStackKeys(keys, colorVariable, false, fieldIndex);
  } else {
    orderedKeys = this.getDefaultOrderedStackKeys(keys, colorVariable, order == 'Smallest at Bottom', fieldIndex);
  }

  this.setStackOrderItemsFromInternalOrder(orderedKeys);
  return orderedKeys;
}

private getDefaultOrderedStackKeys(keys, colorVariable, smallestAtBottom = false, fieldIndex: number | null = null) {
  const counts = new Map();

  keys.forEach((key) => counts.set(key, 0));
  this.vnodes.forEach((node) => {
    if (!this.hasValidStackDate(node, fieldIndex)) return;

    const key = keys.find((value) => value == node[colorVariable]);
    if (key === undefined) return;

    counts.set(key, (counts.get(key) || 0) + this.getStackOrderWeight(node, fieldIndex));
  });

  return [...keys]
    .map((key, index) => ({ key, index, count: counts.get(key) || 0 }))
    .sort((a, b) => {
      const countDiff = smallestAtBottom
        ? a.count - b.count
        : b.count - a.count;

      return countDiff || a.index - b.index;
    })
    .map((entry) => entry.key);
}

private getCustomOrderedStackKeys(keys, colorVariable, reset = false, fieldIndex: number | null = null) {
  this.ensureCustomStackOrder(keys, colorVariable, reset, fieldIndex);

  const customOrder = this.widgets['epiCurve-customStackOrder'];
  const orderedKeys = customOrder
    .map((savedKey) => keys.find((key) => key == savedKey))
    .filter((key, index, values) => key !== undefined && values.findIndex((value) => value == key) == index);
  const missingKeys = keys.filter((key) => !orderedKeys.some((orderedKey) => orderedKey == key));

  return [...orderedKeys, ...missingKeys];
}

private ensureCustomStackOrder(keys, colorVariable, reset = false, fieldIndex: number | null = null) {
  const defaultOrder = this.getDefaultOrderedStackKeys(keys, colorVariable, false, fieldIndex);
  const currentOrder = Array.isArray(this.widgets['epiCurve-customStackOrder'])
    ? this.widgets['epiCurve-customStackOrder']
    : [];
  const orderedKeys = reset
    ? []
    : currentOrder
      .map((savedKey) => defaultOrder.find((key) => key == savedKey))
      .filter((key, index, values) => key !== undefined && values.findIndex((value) => value == key) == index);
  const missingKeys = defaultOrder.filter((key) => !orderedKeys.some((orderedKey) => orderedKey == key));
  const nextOrder = reset || orderedKeys.length == 0
    ? defaultOrder
    : [...orderedKeys, ...missingKeys];

  this.widgets['epiCurve-customStackOrder'] = nextOrder;
}

private setStackOrderItemsFromInternalOrder(internalOrder) {
  this.customStackOrderItems = [...internalOrder].reverse().map((key) => ({
    label: this.getTooltipLabel(key),
    value: key,
    color: this.widgets['epiCurve-stackColorBy'] == 'Node Color' ? this.localColorMap(key) : this.getStackGroupColor(key),
    transparency: this.getStackGroupTransparency(key),
  }));
}

private initializeCustomStackOrder(reset = false) {
  const colorVariable = this.getCurrentStackColorVariable();
  if (colorVariable == 'None') {
    this.customStackOrderItems = [];
    this.widgets['epiCurve-customStackOrder'] = [];
    return;
  }

  const keys = this.getCurrentStackKeys(colorVariable);
  this.vnodes = JSON.parse(JSON.stringify(this.commonService.session.data.nodes));
  const fieldIndex = this.selectedGraphType == 'Multi: Overlay'
    ? this.getOverlayStackBarIndex()
    : null;
  const orderedKeys = this.getCustomOrderedStackKeys(keys, colorVariable, reset, fieldIndex);
  this.setStackOrderItemsFromInternalOrder(orderedKeys);
}

private getStackStyleKey(value): string {
  return value == null ? 'null' : `${typeof value}:${String(value)}`;
}

private getStackGroupColor(value): string {
  const colors = this.widgets['epiCurve-stackGroupColors'] || {};
  const key = this.getStackStyleKey(value);
  if (!colors[key]) {
    colors[key] = this.localColorMap(value) || this.commonService.thirtyColorPalette[0] || '#999999';
    this.widgets['epiCurve-stackGroupColors'] = colors;
  }

  return colors[key];
}

private getStackGroupTransparency(value): number {
  const transparencies = this.widgets['epiCurve-stackGroupTransparencies'] || {};
  const transparency = Number(transparencies[this.getStackStyleKey(value)]);
  if (!Number.isFinite(transparency)) {
    return 0;
  }

  return this.clampStackAlpha(transparency);
}

private setStackGroupColor(value, color): void {
  const colors = this.widgets['epiCurve-stackGroupColors'] || {};
  colors[this.getStackStyleKey(value)] = color;
  this.widgets['epiCurve-stackGroupColors'] = colors;
}

private setStackGroupTransparency(value, transparency): void {
  const transparencies = this.widgets['epiCurve-stackGroupTransparencies'] || {};
  const numericTransparency = Number(transparency);
  transparencies[this.getStackStyleKey(value)] = Number.isFinite(numericTransparency)
    ? this.clampStackAlpha(numericTransparency)
    : 0;
  this.widgets['epiCurve-stackGroupTransparencies'] = transparencies;
}

private getStackFill(value): string {
  if (this.widgets['epiCurve-stackColorBy'] == 'Node Color') {
    return this.localColorMap(value);
  }

  return this.getStackGroupColor(value);
}

private getStackOpacity(value): number {
  if (this.widgets['epiCurve-stackColorBy'] == 'Node Color') {
    return 1;
  }

  return this.clampStackAlpha(1 - this.getStackGroupTransparency(value));
}

private clampStackAlpha(value): number {
  return Number(Math.min(1, Math.max(0, Number(value))).toFixed(4));
}

private getCurrentStackColorVariable() {
  const colorVariable = this.commonService.session.style.widgets['node-color-variable'];
  if (this.widgets['epiCurve-stackColorBy'] == 'Node Color') {
    return colorVariable != 'None' ? colorVariable : 'None';
  }

  return this.widgets['epiCurve-stackColorBy'];
}

private getCurrentStackKeys(colorVariable) {
  if (colorVariable == 'None') {
    return [];
  }

  if (this.widgets['epiCurve-stackColorBy'] == 'Node Color') {
    const nodeColorKeys = this.commonService.session.style.nodeColorsTableKeys[colorVariable] || [];
    return nodeColorKeys.map(value => value=='null' ? null: value);
  }

  let keys = [];
  this.commonService.session.data.nodes.forEach((node) => {
    if (!node.visible) return;
    if (!keys.some(value => value == node[colorVariable])) {
      keys.push(node[colorVariable])
    }
  })

  return keys;
}

private hasValidStackDate(node, fieldIndex: number | null = null) {
  const dateField = fieldIndex == null
    ? this.SelectedDateFieldVariable
    : this.widgets['epiCurve-date-fields']?.[fieldIndex];
  const value = node?.[dateField];
  return this.parseEpiCurveDate(value) != null;
}

private getStackOrderWeight(node, fieldIndex: number | null): number {
  if (fieldIndex == null || this.getSeriesAggregation(fieldIndex) != 'Sum') {
    return 1;
  }

  const valueField = this.widgets['epiCurve-value-fields']?.[fieldIndex];
  const numericValue = Number(node?.[valueField]);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

updateSizes() {
  const wrapper = $(this.epiCurveElement.nativeElement).parent();
  this.updateBottomMargin();
  $('#epiCurve').height(wrapper.height() - 50);
  this.width = wrapper.width() - this.margin.left - this.margin.right;
  // height represents the height of y axis
  this.height = wrapper.height() - this.margin.top - this.margin.bottom - 50;
  this.middle = this.height / 2;
}

private updateBottomMargin() {
  const baseBottomMargin = this.widgets['epiCurve-legendPosition'] == 'Bottom' ? 100 : 50;
  const labelSizePadding = Math.max(0, this.labelSize - 12) * 2;
  const legendSizePadding = this.widgets['epiCurve-legendPosition'] == 'Bottom' ? Math.max(0, this.legendLabelSize - 15) * 2 : 0;
  const dualAxisPadding = this.isDualAxisMulti() ? Math.round(this.labelSize * 5) : 0;
  this.margin.left = Math.max(64, Math.round(this.labelSize * 4.8));
  this.margin.right = Math.max(30, Math.round(this.labelSize * 2) + 10, dualAxisPadding);
  this.margin.top = Math.max(8, Math.round(this.labelSize * 0.75));
  this.margin.bottom = baseBottomMargin + labelSizePadding + legendSizePadding;
}

getTimes(fields) {
  let times = [];
  this.vnodes = JSON.parse(JSON.stringify(this.commonService.session.data.nodes));
  this.vnodes.forEach(d => {
    fields.forEach(field => {
      const time = this.parseEpiCurveDate(d[field as string]); // Cast 'field' as string
      if (time) {
        d[field as string] = time.toDate();
        times.push(d[field as string]); // Cast 'field' as string
      } else {
        d[field as string] = null; // Cast 'field' as string
      }
    })
  });

  return times;
}

private getBinDateRange(bin): string {
  if (!bin || !bin.x0 || !bin.x1) {
    return "Date range: Unknown";
  }

  const start = moment(bin.x0);
  let end = moment(bin.x1).subtract(1, "day");

  if (!start.isValid() || !end.isValid()) {
    return "Date range: Unknown";
  }

  if (end.isBefore(start)) {
    end = moment(bin.x1);
  }
  if (this.widgets['epiCurve-binSize'] == 'Day') { 
    return `Date: ${start.format("MMM D, YYYY")}`
  } else {
    return `Date range: ${start.format("MMM D, YYYY")} - ${end.format("MMM D, YYYY")}`;
  }
}

private getCount(count): number {
  return Number.isFinite(count) ? count : 0;
}

private getBinCount(bin): number {
  if (!bin) {
    return 0;
  }

  if (bin.displayCount != null) {
    return this.getCount(bin.displayCount);
  }

  if (this.widgets['epiCurve-cumulative']) {
    return this.getCount(bin.cumulativeCount != null ? bin.cumulativeCount : bin.length);
  }

  return this.getCount(bin.binCount != null ? bin.binCount : bin.length);
}

private getSegmentCount(bin, segmentIndex): number {
  if (!bin) {
    return 0;
  }

  if (this.widgets['epiCurve-cumulative']) {
    return this.getCount(bin.cumulativeSegmentCounts?.[segmentIndex]);
  }

  return this.getCount(bin.segmentCounts?.[segmentIndex]);
}

private getTooltipLabel(value): string {
  if (value == null) {
    return "(Empty)";
  }

  return this.commonService.capitalize(value.toString().replace(/_/g, " "));
}

private getSingleBinTooltip(bin, field, segmentLabel = undefined, segmentCount = undefined): string {
  const fieldLabel = this.getTooltipLabel(field);
  const lines = [
    this.getBinDateRange(bin)
  ];

  if (segmentLabel !== undefined) {
    lines.push(`${this.getTooltipLabel(segmentLabel)}: ${this.getCount(segmentCount)}`);
    lines.push(`${fieldLabel} total: ${this.getBinCount(bin)}`);
  } else {
    lines.push(`${fieldLabel}: ${this.getBinCount(bin)}`);
  }

  return lines.join("\n");
}

private getMultiBinTooltip(seriesLabels, bins, binIndex): string {
  const firstAvailableBin = bins.find(fieldBins => fieldBins?.[binIndex])?.[binIndex];
  const lines = [
    this.getBinDateRange(firstAvailableBin)
  ];

  seriesLabels.forEach((seriesLabel, seriesIndex) => {
    lines.push(`${seriesLabel}: ${this.formatNumericValue(this.getBinCount(bins[seriesIndex]?.[binIndex]))}`);
  });

  return lines.join("\n");
}

private getMultiStackBinTooltip(
  bin,
  stackKey,
  segmentValue: number,
  colorVariable: string,
  barSeriesLabel: string,
  seriesLabels: string[],
  bins,
  lineSeriesIndexes: number[],
  binIndex: number,
): string {
  const lines = [
    this.getBinDateRange(bin),
    `${this.getTooltipLabel(colorVariable)} — ${this.getTooltipLabel(stackKey)}: ${this.formatNumericValue(segmentValue)}`,
    `${barSeriesLabel} total: ${this.formatNumericValue(this.getBinCount(bin))}`,
  ];

  lineSeriesIndexes.forEach(seriesIndex => {
    lines.push(`${seriesLabels[seriesIndex]}: ${this.formatNumericValue(this.getBinCount(bins[seriesIndex]?.[binIndex]))}`);
  });

  return lines.join("\n");
}

private formatNumericValue(value: number): string {
  const numericValue = this.getCount(value);
  return numericValue.toLocaleString(undefined, {
    maximumFractionDigits: Number.isInteger(numericValue) ? 0 : 2,
  });
}
onLabelSizeChange() {
  this.refresh();
}

updateAxes(showRightAxis = false) {
  const xAxis = this.configureXAxisSettings();
  const createTickValues = scale => {
    const domainMax = Math.max(0, Math.ceil(scale.domain()[1] as number));
    const tickStep = Math.max(1, Math.ceil(domainMax / 10));
    const tickValues = d3.range(0, domainMax + 1, tickStep);
    if (tickValues[tickValues.length - 1] !== domainMax) {
      tickValues.push(domainMax);
    }
    return tickValues;
  };
  const yAxis = d3.axisLeft(this.y)
    .tickValues(createTickValues(this.y))
    .tickFormat((d: number) => this.formatNumericValue(Number(d)));

  const xLabelY = this.height + this.margin.top + Math.max(40, Math.round(this.labelSize * 2.3));
  const yTickOffset = -Math.max(9, Math.round(this.labelSize * 0.9));

  const xAxisGroup = this.svg.append("g")
    .attr("class", "axis axis--x")
    .attr("transform", `translate(${this.margin.left}, ${this.height + this.margin.top})`)
    .call(xAxis)
    .attr("text-anchor", "middle")
    .attr("font-size", this.labelSize);
  xAxisGroup.selectAll("text").attr("text-anchor", "middle");

  this.svg.append("g")
    .attr("class", "axis axis--y")
    .attr("transform", `translate(${this.margin.left}, ${this.margin.top})`)
    .call(yAxis)
    .attr("font-size", this.labelSize)
    .selectAll("text")
    .attr("text-anchor", "end")
    .attr("x", yTickOffset);

  this.svg.append("text")
    .attr("class", "x label")
    .attr("text-anchor", "middle")
    .attr("font-size", this.labelSize)
    .attr("x", this.margin.left + this.width / 2)
    .attr("y", xLabelY)
    .text(`Date (${this.widgets['epiCurve-binSize']=='Day'? 'Dai': this.widgets['epiCurve-binSize']}ly Bins)`);

  this.svg.append("text")
    .attr("class", "y label label--left")
    .attr("text-anchor", "middle")
    .attr("font-size", this.labelSize)
    .attr("transform", `translate(${Math.max(14, Math.round(this.labelSize * 0.95))}, ${this.margin.top + this.height / 2}) rotate(-90)`)
    .text(this.getDefaultYAxisLabel('Left'));

  if (showRightAxis && this.yRight) {
    const yRightAxis = d3.axisRight(this.yRight)
      .tickValues(createTickValues(this.yRight))
      .tickFormat((d: number) => this.formatNumericValue(Number(d)));
    this.svg.append("g")
      .attr("class", "axis axis--y-right")
      .attr("transform", `translate(${this.margin.left + this.width}, ${this.margin.top})`)
      .call(yRightAxis)
      .attr("font-size", this.labelSize);

    this.svg.append("text")
      .attr("class", "y label label--right")
      .attr("text-anchor", "middle")
      .attr("font-size", this.labelSize)
      .attr("transform", `translate(${this.margin.left + this.width + this.margin.right - Math.max(10, Math.round(this.labelSize * 0.7))}, ${this.margin.top + this.height / 2}) rotate(90)`)
      .text(this.getDefaultYAxisLabel('Right'));
  }
}

private fitLegendTextToWidth(textSelection, fullLabel: string, maxWidth: number, legendFontSize: number): number {
  const textNode = textSelection.node() as SVGTextElement;
  const safeMaxWidth = Math.max(0, maxWidth);
  const measureText = () => {
    if (textNode && typeof textNode.getComputedTextLength == 'function') {
      return textNode.getComputedTextLength();
    }

    return String(textSelection.text() || '').length * legendFontSize * 0.55;
  };

  textSelection
    .text(fullLabel)
    .attr('data-full-label', fullLabel);

  if (measureText() <= safeMaxWidth) {
    return measureText();
  }

  const ellipsis = '…';
  let longestFit = '';
  let low = 0;
  let high = fullLabel.length;

  while (low <= high) {
    const midpoint = Math.floor((low + high) / 2);
    const candidate = `${fullLabel.slice(0, midpoint).trimEnd()}${ellipsis}`;
    textSelection.text(candidate);

    if (measureText() <= safeMaxWidth) {
      longestFit = candidate;
      low = midpoint + 1;
    } else {
      high = midpoint - 1;
    }
  }

  textSelection
    .text(longestFit)
    .attr('aria-label', fullLabel);
  return measureText();
}

generateLegend(epiCurve, colors, fieldNames, opacities = [], seriesTypes = [], lineStyles = [], formatLabels = true) {
  const legendFontSize = Math.max(6, Number(this.legendLabelSize || 15));
  const legendFontSizePx = `${legendFontSize}px`;
  const markerRadius = Math.max(4, Math.round(legendFontSize * 0.35));
  const markerTextGap = Math.max(8, Math.round(legendFontSize * 0.65));
  const legendRowHeight = Math.max(22, Math.round(legendFontSize * 1.9));
  const legendCharWidth = Math.max(5.5, legendFontSize * 0.55);
  const legendItemGap = Math.max(24, Math.round(legendFontSize * 1.8));

  let xOffset = 50; // default for left position
  if (this.widgets['epiCurve-legendPosition'] == 'Hide') {
    return;
  } else if (this.widgets['epiCurve-legendPosition'] == 'Bottom') {
    let prevLength = 0;
    let rowCount = 0;
    let y = this.height + this.margin.bottom - (Math.max(legendRowHeight, Math.round(this.labelSize * 1.5)) + 14);
    if (this.selectedGraphType=='Single Date Field' && this.widgets['epiCurve-stackColorBy'] == 'Node Color' && this.commonService.session.style.widgets['node-color-variable'] != 'None') {
      let field = this.commonService.capitalize(this.commonService.session.style.widgets['node-color-variable']);
      epiCurve.append("text").attr("x", 70).attr("y", y).text(field + ': ').style("font-size", legendFontSizePx).attr("alignment-baseline","middle")
      prevLength += field.length + 3;
    } else if (this.selectedGraphType=='Single Date Field' && this.widgets['epiCurve-stackColorBy'] != 'Node Color' && this.widgets['epiCurve-stackColorBy'] != 'None') {
      epiCurve.append("text").attr("x", 70).attr("y", y).text(this.widgets['epiCurve-stackColorBy'] + ': ').style("font-size", legendFontSizePx).attr("alignment-baseline","middle")
      prevLength += this.widgets['epiCurve-stackColorBy'].length + 3;
    }
    fieldNames.forEach((name, i) => {
      // this first section calculates the location for each item/name in the legend
      let nLength = name==null ? 7: name.toString().length
      let baseX = 70 + legendItemGap * rowCount + prevLength * legendCharWidth;
      const markerHalfWidth = seriesTypes[i] == 'line' ? markerRadius * 2 : markerRadius;
      if (baseX + markerHalfWidth + markerTextGap + nLength * legendCharWidth > this.width - 70) {
        rowCount = 0;
        y -= legendRowHeight;
        prevLength = 0;
        baseX = 70;
      }

      this.appendLegendMarker(epiCurve, baseX, y, markerRadius, colors[i], opacities[i] ?? 1, seriesTypes[i], lineStyles[i]);
      const legendLabel = name == null
        ? '(Empty)'
        : formatLabels ? this.commonService.capitalize(name.toString()) : name.toString();
      epiCurve.append("text")
        .attr("class", "epiCurve-legend-label")
        .attr("data-series-index", i)
        .attr("x", baseX + markerHalfWidth + markerTextGap)
        .attr("y", y)
        .text(legendLabel)
        .style("font-size", legendFontSizePx)
        .attr("alignment-baseline","middle")

      prevLength += nLength;
      rowCount += 1;
    })
    return;
  } else if (this.widgets['epiCurve-legendPosition'] == 'Top') {
    const longestLabelLength = fieldNames.reduce(
      (longest, name) => Math.max(longest, String(name ?? '(Empty)').length),
      0);
    const estimatedLegendWidth = longestLabelLength * legendCharWidth + markerRadius * 4 + markerTextGap;
    const centeredX = Math.round((this.width - estimatedLegendWidth) / 2);
    const referenceStyleX = Math.round(this.width * 0.42);
    const rightSafeX = Math.max(markerRadius * 2 + 6, this.width - estimatedLegendWidth - 8);
    xOffset = Math.max(markerRadius * 2 + 6, Math.min(Math.max(centeredX, referenceStyleX), rightSafeX));
  } else if (this.widgets['epiCurve-legendPosition'] == 'Right') {
    const legendRightX = this.width - Math.max(12, Math.round(this.labelSize * 0.75));
    let count = 0;

    if (this.selectedGraphType=='Single Date Field' && this.widgets['epiCurve-stackColorBy'] == 'Node Color' && this.commonService.session.style.widgets['node-color-variable'] != 'None') {
      const field = `${this.commonService.capitalize(this.commonService.session.style.widgets['node-color-variable'])}:`;
      const heading = epiCurve.append('text')
        .attr('class', 'epiCurve-legend-heading')
        .attr('x', legendRightX)
        .attr('y', legendRowHeight)
        .attr('text-anchor', 'end')
        .style('font-size', legendFontSizePx)
        .attr('alignment-baseline', 'middle');
      this.fitLegendTextToWidth(heading, field, Math.max(0, legendRightX - 8), legendFontSize);
      count += 1;
    } else if (this.selectedGraphType=='Single Date Field' && this.widgets['epiCurve-stackColorBy'] != 'Node Color' && this.widgets['epiCurve-stackColorBy'] != 'None') {
      const field = `${this.widgets['epiCurve-stackColorBy']}:`;
      const heading = epiCurve.append('text')
        .attr('class', 'epiCurve-legend-heading')
        .attr('x', legendRightX)
        .attr('y', legendRowHeight)
        .attr('text-anchor', 'end')
        .style('font-size', legendFontSizePx)
        .attr('alignment-baseline', 'middle');
      this.fitLegendTextToWidth(heading, field, Math.max(0, legendRightX - 8), legendFontSize);
      count += 1;
    }

    fieldNames.forEach((name, i) => {
      const markerHalfWidth = seriesTypes[i] == 'line' ? markerRadius * 2 : markerRadius;
      const legendLabel = name == null
        ? '(Empty)'
        : formatLabels ? this.commonService.capitalize(name.toString()) : name.toString();
      const y = legendRowHeight * (count + 1);
      const maxTextWidth = Math.max(0, legendRightX - markerTextGap - markerHalfWidth * 2 - 8);
      const text = epiCurve.append('text')
        .attr('class', 'epiCurve-legend-label')
        .attr('data-series-index', i)
        .attr('x', legendRightX)
        .attr('y', y)
        .attr('text-anchor', 'end')
        .style('font-size', legendFontSizePx)
        .attr('alignment-baseline', 'middle');
      const renderedTextWidth = this.fitLegendTextToWidth(text, legendLabel, maxTextWidth, legendFontSize);
      const markerX = legendRightX - renderedTextWidth - markerTextGap - markerHalfWidth;

      this.appendLegendMarker(epiCurve, markerX, y, markerRadius, colors[i], opacities[i] ?? 1, seriesTypes[i], lineStyles[i]);
      count += 1;
    });
    return;
  }
  let count = 0;
  if (this.selectedGraphType=='Single Date Field' && this.widgets['epiCurve-stackColorBy'] == 'Node Color' && this.commonService.session.style.widgets['node-color-variable'] != 'None') {
    let field = this.commonService.capitalize(this.commonService.session.style.widgets['node-color-variable']);
    epiCurve.append("text").attr("x", xOffset).attr("y", legendRowHeight).text(field + ': ').style("font-size", legendFontSizePx).attr("alignment-baseline","middle")
    count += 1;
  } else if (this.selectedGraphType=='Single Date Field' && this.widgets['epiCurve-stackColorBy'] != 'Node Color' && this.widgets['epiCurve-stackColorBy'] != 'None') {
    epiCurve.append("text").attr("x", xOffset).attr("y", legendRowHeight).text(this.widgets['epiCurve-stackColorBy'] + ': ').style("font-size", legendFontSizePx).attr("alignment-baseline","middle")
    count += 1;
  }
  fieldNames.forEach((name, i) => {
    const markerHalfWidth = seriesTypes[i] == 'line' ? markerRadius * 2 : markerRadius;
    this.appendLegendMarker(epiCurve, xOffset, legendRowHeight * (count + 1), markerRadius, colors[i], opacities[i] ?? 1, seriesTypes[i], lineStyles[i]);
    const legendLabel = name == null
      ? '(Empty)'
      : formatLabels ? this.commonService.capitalize(name.toString()) : name.toString();
    epiCurve.append("text")
      .attr("class", "epiCurve-legend-label")
      .attr("data-series-index", i)
      .attr("x", xOffset + markerHalfWidth + markerTextGap)
      .attr("y", legendRowHeight * (count + 1))
      .text(legendLabel)
      .style("font-size", legendFontSizePx)
      .attr("alignment-baseline","middle")
    count += 1;
  })
}

private appendLegendMarker(epiCurve, x, y, markerRadius, color, opacity, seriesType = 'bar', lineStyle = 'Solid'): void {
  if (seriesType == 'line') {
    epiCurve.append("line")
      .attr("class", "epiCurve-legend-line")
      .attr("data-line-style", lineStyle.toLowerCase())
      .attr("x1", x - markerRadius * 2)
      .attr("x2", x + markerRadius * 2)
      .attr("y1", y)
      .attr("y2", y)
      .attr("stroke", color)
      .attr("stroke-width", 3)
      .attr("stroke-linecap", "round")
      .attr("stroke-dasharray", this.getLineDashArray(lineStyle))
      .style("opacity", opacity);
    return;
  }

  if (this.selectedGraphType == 'Multi: Overlay') {
    epiCurve.append("path")
      .attr("class", "epiCurve-legend-marker")
      .attr("data-x", x)
      .attr("data-y", y)
      .attr("d", `M ${x - markerRadius} ${y - markerRadius} h ${markerRadius * 2} v ${markerRadius * 2} h ${-markerRadius * 2} Z`)
      .style("fill", color)
      .style("stroke", "black")
      .style("opacity", opacity);
    return;
  }

  epiCurve.append("circle")
    .attr("class", "epiCurve-legend-marker")
    .attr("cx", x)
    .attr("cy", y)
    .attr("r", markerRadius)
    .style("fill", color)
    .style("opacity", opacity);
}

private setupEventListeners(): void {

  $('#timeline-play').click(() => {
    if (this.isPlaying) {
      $('#timeline-play').html('<span class="oi oi-media-play"></span>');
      this.stopTimeline();
    } else {
      $('#timeline-play').html('<span class="oi oi-media-pause"></span>');
      this.startTimeline();
    }
  });

  $('#timeline-speed').on('change', () => {
    this.setTimer();
  });

  this.container.on('resize', () => { this.goldenLayoutComponentResize() })
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
 * Updates this.timeDomainStart and this.timeDomainEnd based on dates and this.widgets['epiCurve-binSize'];
 * 
 * @param times array of date objects
 * @returns return a d3 time range such as d3.timeMonth.range()
 */
calculateBinInterval(times) {
  const validTimes = (times || []).filter(time => Number.isFinite(new Date(time).getTime()));
  if (validTimes.length == 0) {
    this.timeDomainStart = undefined;
    this.timeDomainEnd = undefined;
    return 0;
  }

  let minTime = Math.min(...validTimes);
  let maxTime = Math.max(...validTimes);

  if (this.widgets['epiCurve-binSize'] == 'Day') {
    //@ts-ignore
    this.timeDomainStart = d3.timeMonth(minTime);
    //@ts-ignore
    this.timeDomainEnd = d3.timeMonth.ceil(maxTime);
    if (this.timeDomainEnd.getTime() <= this.timeDomainStart.getTime()) {
      this.timeDomainEnd = d3.timeMonth.offset(this.timeDomainStart, 1);
    }
    return d3.timeDay.range(this.timeDomainStart, this.timeDomainEnd);
  } else if (this.widgets['epiCurve-binSize'] == 'Week') {
    this.timeDomainStart = d3.timeMonday.floor(new Date(minTime));
    this.timeDomainEnd = d3.timeMonday.ceil(new Date(maxTime));
    if (this.timeDomainEnd.getTime() <= maxTime) {
      this.timeDomainEnd = d3.timeMonday.offset(this.timeDomainEnd, 1);
    }
    return d3.timeMonday.range(this.timeDomainStart, this.timeDomainEnd);
  } else if (this.widgets['epiCurve-binSize'] == 'Month') {
    //@ts-ignore
    this.timeDomainStart = d3.timeMonth(minTime);
    //@ts-ignore
    this.timeDomainEnd = d3.timeMonth.ceil(maxTime);
    if (this.timeDomainEnd.getTime() <= this.timeDomainStart.getTime()) {
      this.timeDomainEnd = d3.timeMonth.offset(this.timeDomainStart, 1);
    }
    return d3.timeMonth.range(this.timeDomainStart, this.timeDomainEnd);
  } else if (this.widgets['epiCurve-binSize'] == 'Quarter') {
    //@ts-ignore
    this.timeDomainStart = d3.timeMonth(minTime, 3);
    //@ts-ignore
    this.timeDomainEnd = d3.timeMonth.ceil(maxTime, 3);
    // for quarter we may need to update earliest month so that quarters are consistant (always start on Jan, April, July, or October)
    if ([1, 2].includes(this.timeDomainStart.getMonth())){
      this.timeDomainStart.setMonth(0);
    } else if ([4,5].includes(this.timeDomainStart.getMonth())) {
      this.timeDomainStart.setMonth(3);
    } else if ([7,8].includes(this.timeDomainStart.getMonth())) {
      this.timeDomainStart.setMonth(6);
    } else if ([10,11].includes(this.timeDomainStart.getMonth())) {
      this.timeDomainStart.setMonth(9);
    }
    if (this.timeDomainEnd.getTime() <= this.timeDomainStart.getTime()) {
      this.timeDomainEnd = d3.timeMonth.offset(this.timeDomainStart, 3);
    }
    return d3.timeMonth.range(this.timeDomainStart, this.timeDomainEnd, 3);
  } else if (this.widgets['epiCurve-binSize'] == 'Year') {
    //@ts-ignore
    this.timeDomainStart = d3.timeYear(minTime);
    //@ts-ignore
    this.timeDomainEnd = d3.timeYear.ceil(maxTime);
    if (this.timeDomainEnd.getTime() <= this.timeDomainStart.getTime()) {
      this.timeDomainEnd = d3.timeYear.offset(this.timeDomainStart, 1);
    }
    return d3.timeYear.range(this.timeDomainStart, this.timeDomainEnd);
  } else {
    alert("Invalid bin size selected");
    return 0;
  }

}

/**
 * @returns updated bins with new attributes. bin.length2 is array of height of each group (ie. 'M', 'F') needed for that bin interval, bin.height represents the offset of that group.
 * 
 * Also returns maxCount which is used for setting y axis max value
 */
updateBins(bins, colorVariable='None', nodeColorKeys=undefined) {
  let maxCount = 0;
  bins.forEach(bin => {
    bin.binCount = bin.length;
  });
  // cumulative with multiple colors per column
  if (this.widgets['epiCurve-stackColorBy'] != 'None' && this.widgets['epiCurve-cumulative'] && colorVariable != 'None') { //useNodeColors
    //heights represents the size of each rect, offset represent the offset of each rect
    let heights = new Array(nodeColorKeys.length).fill(0);
    let offsets = new Array(nodeColorKeys.length).fill(0);
    bins.forEach(bin => {
      bin.length2 = [];
      bin.height = [];
      bin.segmentCounts = [];
      bin.cumulativeSegmentCounts = [];
      nodeColorKeys.forEach((value, ind) => {
        let currentCount = bin.filter((obj)=> obj[colorVariable]==value).length
        bin.segmentCounts.push(currentCount);
        heights[ind] += currentCount;
        bin.cumulativeSegmentCounts.push(heights[ind]);
        bin.length2.push(heights[ind]);
        offsets[ind] = bin.length2.reduce((paritalSum, a)=> paritalSum+a,0);
        bin.height.push(offsets[ind]);
        
      })
      maxCount += bin.length;
      bin.cumulativeCount = maxCount;
    })
    // noncumulative with multiple colors per column
  } else if (this.widgets['epiCurve-stackColorBy'] != 'None' && colorVariable != 'None') {
    bins.forEach(bin => {
      bin.length2 = [];
      bin.height = [];
      bin.segmentCounts = [];
      nodeColorKeys.forEach(value => {
        let currentCount = bin.filter((obj)=> obj[colorVariable]==value).length
        bin.segmentCounts.push(currentCount);
        bin.length2.push(currentCount);
        bin.height.push(bin.length2.reduce((paritalSum, a)=> paritalSum+a,0));
      })
      if (bin.length > maxCount) maxCount = bin.length
    })
  // else if (useNodeColor == False || (useNodeColor && colorVariable=='None')) and using cumulative
  // cumulative with one color 
  } else if (this.widgets['epiCurve-cumulative']) {
    bins.forEach(bin => {
      maxCount += bin.length;
      bin.cumulativeCount = maxCount;
      bin.length = maxCount;
    });
    // noncumulative with one color
  } else {
    bins.forEach(bin => {
      if (bin.length > maxCount) maxCount = bin.length
    })
  }

  return [maxCount, bins]
}

/**
 * 
 * @return xAxis which is used to determine the interval and label for xAxis ticks
 */
configureXAxisSettings() {
  let xAxis;
  let numberOfDays = d3.timeDay.count(this.timeDomainStart, this.timeDomainEnd);
  const tickUnit = this.widgets['epiCurve-tickUnit'] || 'Automatic';
  const tickInterval = Math.max(1, Number(this.tickInterval) || 1);
  if (tickUnit != 'Automatic') {
    const intervals = {
      Day: d3.timeDay,
      Week: d3.timeWeek,
      Month: d3.timeMonth,
      Year: d3.timeYear,
    };
    const interval = intervals[tickUnit] || d3.timeMonth;
    const tickValues = interval.range(this.timeDomainStart, new Date(this.timeDomainEnd.getTime() + 1), tickInterval);
    const tickFormat = tickUnit == 'Year'
      ? d3.timeFormat('%Y')
      : tickUnit == 'Month'
        ? d3.timeFormat('%b %Y')
        : numberOfDays < 366
          ? d3.timeFormat('%b %-d')
          : d3.timeFormat('%b %-d, %Y');
    return d3.axisBottom(this.x).tickValues(tickValues).tickFormat(tickFormat as any);
  }
  if (this.widgets['epiCurve-binSize'] == 'Year') {
    xAxis = d3.axisBottom(this.x).ticks(d3.timeYear).tickFormat(d3.timeFormat("%Y"));
  } else if (numberOfDays<366) {
    xAxis = d3.axisBottom(this.x).ticks(d3.timeMonth.every(this.tickInterval)).tickFormat(d3.timeFormat("%b %Y"))
  } else if (this.widgets['epiCurve-binSize'] == 'Quarter') {
    xAxis = d3.axisBottom(this.x)
      .ticks(d3.timeMonth.every(this.tickInterval < 3 ? this.tickInterval * 3 : 12))
      .tickFormat((d: Date) => d <= d3.timeYear(d) ? d.getFullYear().toString() : null);
  } else {
    xAxis = d3.axisBottom(this.x)
      .ticks(d3.timeMonth.every(this.tickInterval))
      .tickFormat((d: Date) => d <= d3.timeYear(d) ? d.getFullYear().toString() : null);
  }
  return xAxis;
}

goldenLayoutComponentResize() {
  this.refresh();
  if (this.ShowEpiExportPane && this.EpiExportFileType!='svg') {
    this.setCalculatedResolution();
  }
}

// Handle the change event of the date field
onDateFieldChange(_index: number) {
  this.syncSelectedDateFieldVariables();
  this.refresh();
}

onSeriesTypeChange(index: number) {
  this.widgets['epiCurve-series-types'][index] = this.getSeriesType(index);
  this.refresh();
}

onBinSizeChange() {
  if (this.widgets['epiCurve-binSize'] == 'Year') {
    $('#epi-tick-size').slideUp();
  } else {
    if (this.widgets['epiCurve-binSize'] == 'Quarter') {
      this.tickInterval = 1;
      this.widgets['epiCurve-tickInterval'] = this.tickInterval;
    }
    $('#epi-tick-size').slideDown();
  }
  this.refresh();
}

updateSettingsRows() {
  this.ShowEpiSettingsPane = true;
  setTimeout(() => {
    if (this.selectedGraphType == 'Multi: Side by Side') {
      $('#useNodeColorRow').slideUp();
      $('.additionalDateField').slideDown();
      //$('#epi-color-select').slideUp();
    } else {
      if (this.selectedGraphType == 'Single Date Field') {
        $('.additionalDateField').slideUp();
      } else {
        $('.additionalDateField').slideDown();
      }
      $('#useNodeColorRow').slideDown();
      if (this.selectedGraphType == 'Single Date Field' && this.widgets['epiCurve-stackColorBy'] == 'None') {
        $('#epi-color-select').slideDown();
      }
    }
    //this.ShowEpiSettingsPane = false;
  }, 0)
}

onGraphTypeChange(refresh=true) {
  this.updateSettingsRows();

  this.widgets['epiCurve-graphType'] = this.selectedGraphType;
  if (refresh) this.refresh();
}

onUseNodeColorChange() {
  if (this.widgets['epiCurve-stackColorBy'] == 'None') {
    this.customStackOrderItems = [];
    if (this.selectedGraphType == 'Single Date Field') {
      $('#epi-color-select').slideDown();
    }
  } else if (this.selectedGraphType == 'Single Date Field') {
    $('#epi-color-select').slideUp();
  }
  if (this.widgets['epiCurve-stackOrder'] == 'Custom') {
    this.initializeCustomStackOrder(true);
  }
  this.refresh();
}

onStackOrderChange() {
  if (this.widgets['epiCurve-stackOrder'] == 'Custom') {
    this.initializeCustomStackOrder(true);
  }
  this.refresh();
}

onCustomStackOrderReorder() {
  if (this.widgets['epiCurve-stackOrder'] != 'Custom') {
    this.widgets['epiCurve-stackOrder'] = 'Custom';
  }
  this.widgets['epiCurve-customStackOrder'] = [...this.customStackOrderItems].reverse().map((item) => item.value);
  this.refresh();
}

onStackGroupColorChange(item, color) {
  item.color = color;
  this.setStackGroupColor(item.value, color);
  this.refresh();
}

onStackGroupTransparencyChange(item, transparency) {
  const numericTransparency = Number(transparency);
  item.transparency = Number.isFinite(numericTransparency)
    ? this.clampStackAlpha(numericTransparency)
    : 0;
  this.setStackGroupTransparency(item.value, item.transparency);
  this.refresh();
}

openStackGroupTransparencyPicker(event, item) {
  event.preventDefault();
  event.stopPropagation();

  $("#color-transparency-wrapper").css({
    top: event.clientY + 129,
    left: event.clientX,
    display: "block",
    zIndex: 99999
  });

  $("#color-transparency")
    .off("change")
    .val(this.getStackOpacity(item.value))
    .one("change", sliderEvent => {
      const opacity = Number(sliderEvent.target['value']);
      const transparency = Number.isFinite(opacity) ? this.clampStackAlpha(1 - opacity) : 0;
      this.onStackGroupTransparencyChange(item, transparency);
      $("#color-transparency-wrapper").fadeOut();
      this.cdref.markForCheck();
    });
}

onTickIntevalChange() {
  this.tickInterval = Math.max(1, Number(this.tickInterval) || 1);
  this.widgets['epiCurve-tickInterval'] = this.tickInterval;
  this.refresh()
}

onTickUnitChange() {
  this.refresh();
}

onValueFieldChange(index: number) {
  const valueField = this.widgets['epiCurve-value-fields']?.[index];
  const aggregation = this.widgets['epiCurve-series-aggregations']?.[index];
  if (valueField == 'None') {
    this.widgets['epiCurve-series-aggregations'][index] = 'Count';
  } else if (aggregation == 'Count' || !this.isAggregation(aggregation)) {
    this.widgets['epiCurve-series-aggregations'][index] = 'Sum';
  }
  this.refresh();
}

onSeriesAggregationChange(index: number) {
  this.widgets['epiCurve-series-aggregations'][index] = this.getSeriesAggregation(index);
  this.refresh();
}

onSeriesCumulativeChange() {
  this.refresh();
}

onSeriesLabelChange() {
  this.refresh();
}

onNodeColorChanged() {
  this.refresh();
}

onLineStyleChange() {
  this.refresh();
}

onLegendPositionChange() {
  this.refresh();
}

onLegendLabelSizeChange() {
  this.legendLabelSize = Number(this.legendLabelSize);
  this.refresh();
}

openSettings() {
  this.visuals.epiCurve.ShowEpiSettingsPane = !this.visuals.epiCurve.ShowEpiSettingsPane;
}

setCumulative(value: boolean): void {
  this.refresh();
}


/**
 * Sets CalculatedResolution variable to string such as '1250 x 855px'. Only called when export is first opened
 */
setCalculatedResolution() {
  let [width, height] = this.getImageDimensions();
  this.CalculatedResolution = (Math.round(width * this.SelectedNetworkExportScaleVariable) + " x " + Math.round(height * this.SelectedNetworkExportScaleVariable) + "px");
}

  /**
   * Updates CalculatedResolution variable to string such as '1250 x 855px' based on ImageDimensions and SelectedNetworkExportScaleVariable. 
   * This is called anytime SelectedNetworkExportScaleVariable is updated.
   */
  updateCalculatedResolution() {
    let [width, height] = this.getImageDimensions();
    this.CalculatedResolution = (Math.round(width * this.SelectedNetworkExportScaleVariable) + " x " + Math.round(height * this.SelectedNetworkExportScaleVariable) + "px");
    this.cdref.detectChanges();
}

/**
 * @returns an array [width, height] of the svg image
 */
  getImageDimensions() {
    let parent = this.svg.node();
    return [parent.clientWidth, parent.clientHeight] 
  }

private startTimeline(): void {
  this.isPlaying = true;
  this.setTimer();
}

private stopTimeline(): void {
  this.isPlaying = false;
  if (this.timer) {
    this.timer.stop();
  }
}

private setTimer(): void {
  if (this.timer) {
    this.timer.stop();
    d3.timerFlush();
  }
  this.timer = d3.interval(() => {
    const selection = d3.brushSelection(this.brushG.node());
    if (!selection) return this.timer.stop(); // Ignore empty selections
    if (selection[1] >= this.width) {
      this.startTimeline();
      return;
    }
    this.brushG.call(this.brush.move, selection.map(s => s + 1));
    if (++this.tick % 5 == 0) this.propagate();
  }, 110 - parseInt($("#timeline-speed").val() as string));
  if (!this.isPlaying) this.timer.stop();
}

private propagate(): void {
  this.commonService.session.state.timeStart = this.x.invert(this.selection[0]);
  this.commonService.session.state.timeEnd = this.x.invert(this.selection[1]);
  this.commonService.setNodeVisibility(true);
  this.commonService.setLinkVisibility(true);
  this.commonService.tagClusters().then(() => {
    ["node", "link"].forEach((thing: string) => {
      (window as any).trigger(thing + "-visibility");
    });
  });
}

// private initializeD3Chart(): void {
//   this.clearSvg();
//   this.setupDimensions();
//   this.setupScales();
//   this.createSvg();
//   this.populateData();
//   this.drawHistogram();
//   this.setupBrush();
// }

// private clearSvg(): void {
//   d3.select(this.timelineElement.nativeElement).selectAll("*").remove();
// }

// private setupDimensions(): void {
//   const wrapper = this.timelineElement.nativeElement;
//   this.width = wrapper.clientWidth - this.margin.left - this.margin.right;
//   this.height = wrapper.clientHeight - this.margin.top - this.margin.bottom;
// }

// private setupScales(): void {
//   this.x = d3.scaleTime().range([0, this.width]);
//   this.y = d3.scaleLinear().range([this.height, 0]);
// }

// private createSvg(): void {
//   this.svg = d3.select(this.timelineElement.nativeElement)
//     .append("svg")
//     .attr("width", this.width + this.margin.left + this.margin.right)
//     .attr("height", this.height + this.margin.top + this.margin.bottom)
//     .append("g")
//     .attr("transform", `translate(${this.margin.left},${this.margin.top})`);
// }

// private populateData(): void {
//   // Transform your data here
//   this.vnodes.forEach(d => {
//     const time = moment(d.date); // Replace 'date' with your actual date field
//     if (time.isValid()) {
//       d.date = time.toDate();
//     } else {
//       d.date = null;
//     }
//   });

//   this.timeDomainStart = d3.min(this.vnodes, d => d.date);
//   this.timeDomainEnd = d3.max(this.vnodes, d => d.date);
//   this.x.domain([this.timeDomainStart, this.timeDomainEnd]);
// }

// private drawHistogram(): void {
//   // Draw your histogram here
//   this.histogram = d3.histogram()
//     .value(d => d.date) // Replace 'date' with your actual date field
//     .domain(this.x.domain())
//     .thresholds(d3.thresholdScott);

//   const bins = this.histogram(this.vnodes);

//   if (this.cumulative) {
//     let sum = 0;
//     bins.forEach(bin => {
//       sum += bin.length;
//       bin.length = sum;
//     });
//   }

//   this.y.domain([0, d3.max(bins, d => d.length)]);

//   this.svg.selectAll("rect")
//     .data(bins)
//     .enter()
//     .append("rect")
//     .attr("x", d => this.x(d.x0))
//     .attr("y", d => this.y(d.length))
//     .attr("width", d => this.x(d.x1) - this.x(d.x0))
//     .attr("height", d => this.height - this.y(d.length))
//     .attr("fill", "steelblue"); // Change fill as necessary
// }

// private setupBrush(): void {
//   this.brush = d3.brushX()
//     .extent([[0, 0], [this.width, this.height]])
//     .on("end", () => this.onBrushEnd());

//   this.brushG = this.svg.append("g")
//     .attr("class", "brush")
//     .call(this.brush);
// }

// private onBrushEnd(): void {
//   this.selection = d3.brushSelection(this.brushG.node());
//   if (this.selection) {
//     // Handle brush selection change
//   }
// }

// playPauseTimeline(): void {
//   if (this.isPlaying) {
//     this.stopTimeline();
//   } else {
//     this.startTimeline();
//   }
// }

// startTimeline(): void {
//   this.isPlaying = true;
//   this.setTimer();
// }

// stopTimeline(): void {
//   this.isPlaying = false;
//   if (this.timer) {
//     this.timer.stop();
//   }
// }

// setTimer(): void {
//   if (this.timer) {
//     this.timer.stop();
//   }
//   this.timer = d3.interval(() => {
//     // Timer logic for updating the timeline
//     // this.updateTimeline();
//   }, 100); // Adjust interval as needed
// }

updateNodeColors() {
  if(this.selectedGraphType == "Single Date Field" && this.widgets['epiCurve-stackColorBy'] == 'Node Color') {
    this.refresh();
  }
}
updateVisualization() {
  //Not Relevant
}

applyStyleFileSettings() {
  this.widgets = (window as any).context.commonService.session.style.widgets;
  this.setDefaultsWidgets();
  
  this.updateSettingsRows()
  this.onLegendPositionChange()
}

updateLinkColor() {
  //Not Relevant
}

onRecallSession() {
}

openExport() {
  this.setCalculatedResolution();
  this.ShowEpiExportPane = !this.ShowEpiExportPane;
}

exportVisualization() {
  if (this.EpiExportFileType == 'svg') {
      let content = this.exportService.unparseSVG(this.epiCurveSVGElement.nativeElement);
      let blob = new Blob([content], { type: 'image/svg+xml;charset=utf-8' });
      saveAs(blob, this.EpiExportFileName + '.' + this.EpiExportFileType);
  } else {
      saveSvgAsPng(this.epiCurveSVGElement.nativeElement, this.EpiExportFileName + '.' + this.EpiExportFileType, {
          scale: this.SelectedNetworkExportScaleVariable,
          backgroundColor: "#ffffff",
          encoderType: 'image/' + this.EpiExportFileType,
          //encoderOptions: this.SelectedNetworkExportQualityVariable
      });
  }
  this.ShowEpiExportPane = false;
}

openRefreshScreen() {

}

onLoadNewData() {
  this.widgets = this.commonService.session.style.widgets;
  this.setDefaultsWidgets();
  this.updateFieldLists();
  this.updateSettingsRows();

  if (!this.epiCurveElement?.nativeElement || !this.epiCurveSVGElement?.nativeElement) {
    setTimeout(() => {
      if (!this.isDestroyed) {
        this.onLoadNewData();
      }
    }, 0);
    return;
  }

  this.refresh();
  this.markEpiCurveRendered();
  this.cdref.detectChanges();
}
onFilterDataChange() {
  if (!this.epiCurveElement?.nativeElement || !this.epiCurveSVGElement?.nativeElement) {
    return;
  }

  this.refresh();
}


}



export namespace TimelineComponent {
  export const componentTypeName = 'Epi Curve';
}
