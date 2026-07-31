import { Injector, Component, Output, EventEmitter, 
  ElementRef, Renderer2, ChangeDetectorRef, Inject, OnInit, OnDestroy, ViewContainerRef,
  ViewChild} from '@angular/core';
import { EventManager } from '@angular/platform-browser';
import { CommonService } from '@app/contactTraceCommonServices/common.service';
import * as _ from 'lodash';
import { saveAs } from 'file-saver';
import * as domToImage from 'html-to-image';
import { BaseComponentDirective } from '@app/base-component.directive';
import { ComponentContainer } from 'golden-layout';
import { GoogleTagManagerService } from 'angular-google-tag-manager';
import { DialogSettings } from '../../helperClasses/dialogSettings';
import { PlotlyComponent, PlotlyModule } from 'angular-plotly.js';
import { SelectItem } from 'primeng/api';
import { MicrobeTraceNextVisuals } from '../../microbe-trace-next-plugin-visuals';
import { cloneDeep } from 'lodash';
import { ExportService } from '@app/contactTraceCommonServices/export.service';
import { buildSafeCsvRow } from '@app/contactTraceCommonServices/export-sanitization';
import { CommonStoreService } from '@app/contactTraceCommonServices/common-store.services';
import { Subject, takeUntil } from 'rxjs';
import * as d3 from 'd3';
//import * as plotlyjs from 'plotly.js-dist-min';


@Component({
    selector: 'HeatmapComponent',
    templateUrl: './heatmap.component.html',
    styleUrls: ['./heatmap.component.scss'],
    standalone: false
})
export class HeatmapComponent extends BaseComponentDirective implements OnInit, OnDestroy {

  @ViewChild('heatmapContainer', { read: ElementRef }) heatmapContainerRef: ElementRef;  
  @Output() DisplayGlobalSettingsDialogEvent = new EventEmitter();

  private Plotly: any;

  
  labels: string[];
  //xLabels: string[];
  //yLabels: string[];
  matrix: object;
  plot: PlotlyComponent;
  visuals: MicrobeTraceNextVisuals;
  nodeIds: string[];
  viewActive: boolean;
  heatmapData: object;
  FieldList: SelectItem[] = [];
  heatmapLayout: object;
  heatmapConfig: object;
  invertX: boolean;
  invertY: boolean;
  heatmapShowLabels: boolean;
  loColor: string;
  medColor: string;
  hiColor: string;
  HeatmapSettingsDialogSettings: DialogSettings = new DialogSettings('#heatmap-settings-pane', false);
  ShowHeatmapExportPane: boolean = false;
  invertOptions: object = [
    { label: "Yes", value: true },
    { label: "No", value: false }
  ];
  SelectedImageFilenameVariable = "default_heatmap";
  SelectedNetworkExportFileTypeVariable: string = "png";
  NetworkExportFileTypeList: object = [
    { label: 'png', value: 'png' },
    { label: 'jpeg', value: 'jpeg' },
    { label: 'svg', value: 'svg' }
  ];
  SelectedDistanceMatrixFilenameVariable: string = "distance_matrix.csv";
  heatmapLabels: string[];
  heatmapMetric: string;
  private destroy$ = new Subject<void>();
  private heatmapDrawInFlight: Promise<void> | null = null;
  private heatmapDrawIdentity = '';
  private heatmapRedrawPending = false;
    
  constructor(injector: Injector,
        private eventManager: EventManager,
        public commonService: CommonService,
        @Inject(BaseComponentDirective.GoldenLayoutContainerInjectionToken) private container: ComponentContainer, 
        elRef: ElementRef,
        private cdref: ChangeDetectorRef,
        private gtmService: GoogleTagManagerService,
        private renderer: Renderer2,
        private exportService: ExportService,
        private plotlyModule: PlotlyModule,
        private store: CommonStoreService,
      ) {
          super(elRef.nativeElement);
          this.visuals = commonService.visuals;
          this.visuals.heatmap = this;
          this.invertX = this.commonService.session.style.widgets['heatmap-invertX'];
          this.invertY = this.commonService.session.style.widgets['heatmap-invertY'];
          this.heatmapShowLabels = this.commonService.session.style.widgets['heatmap-axislabels-show'];
          this.loColor = this.commonService.session.style.widgets['heatmap-color-low'];
          this.medColor = this.commonService.session.style.widgets['heatmap-color-medium'];
          this.hiColor = this.commonService.session.style.widgets['heatmap-color-high']
          this.heatmapMetric = this.commonService.session.style.widgets['default-distance-metric'].toUpperCase();
        }

  openSettings(): void {
    this.visuals.heatmap.HeatmapSettingsDialogSettings.setVisibility(true);
  }
  
  openExport(): void {
    this.ShowHeatmapExportPane = true;
  }
  
  openCenter(): void {
    const reCenter = {
      'xaxis.autorange': true,
      'yaxis.autorange': true
    }
    PlotlyModule.plotlyjs.relayout("heatmap", reCenter);
    this.plot = PlotlyModule.plotlyjs.newPlot('heatmap', cloneDeep(this.heatmapData), this.heatmapLayout, this.heatmapConfig);
  }
  
  ngOnInit(): void {


    this.viewActive = true;
    this.gtmService.pushTag({
            event: "page_view",
            page_location: "/heatmap",
            page_title: "Heatmap View"
        });

    //this.nodeIds = this.getNodeIds();
    this.visuals.heatmap.FieldList.push(
      {
        label: "None",
        value: "",
      }
    )

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    this.commonService.session.data['nodeFields'].map((d, i) => {

      this.visuals.heatmap.FieldList.push(
        {
          label: this.visuals.heatmap.commonService.capitalize(d.replace('_', '')),
          value: d
        });
    });

    //this.visuals.microbeTrace.GlobalSettingsNodeColorDialogSettings.setVisibility(false);
    //this.visuals.microbeTrace.GlobalSettingsLinkColorDialogSettings.setVisibility(false);
    

    this.goldenLayoutComponentResize(true);

    this.container.on('resize', () => { setTimeout(() => this.goldenLayoutComponentResize(), 200) })
    this.container.on('hide', () => { 
      this.viewActive = false; 
      this.cdref.detectChanges();
    })
    this.container.on('show', () => { 
      this.viewActive = true; 
      this.cdref.detectChanges();
      this.redrawHeatmap();
    })

    this.store.networkUpdated$
      .pipe(takeUntil(this.destroy$))
      .subscribe((networkUpdated) => {
        if (this.viewActive && networkUpdated) {
          this.redrawHeatmap(true);
          this.store.setNetworkUpdated(false);
        }
      });

    this.redrawHeatmap();
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

  private buildFormattedHeatmapMatrix(matrix: any[]): string[][] {
    return (matrix || []).map((row) => (
      Array.isArray(row)
        ? row.map((value) => this.formatHeatmapDistanceValue(Number(value)))
        : []
    ));
  }

  private buildHeatmapColorbar(matrix: any[]): any {
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
      ticktext: colorbarTickValues.map((value) => this.formatHeatmapDistanceValue(value)),
    };
  }

  private getHeatmapDataIdentity(): string {
    const status = this.store.tn93DistanceStatusValue;
    return [
      this.commonService.getDataLoadGeneration(),
      status?.runId ?? 'none',
      status?.inputSignature ?? 'none'
    ].join('|');
  }

  drawHeatmap(config: object, identity = this.getHeatmapDataIdentity()): Promise<void> {
    return this.commonService.getDM().then(({dm, labels}) => {
      if (identity !== this.getHeatmapDataIdentity()) {
        return;
      }
      this.nodeIds = labels;
      const xLabels = labels.map(d => d);
      const yLabels = xLabels.slice();

      if (this.invertX) {
        dm.forEach(l => l.reverse());
        xLabels.reverse();
      }
      this.heatmapLabels = xLabels;
      if (this.invertY) {
        dm.reverse();
        yLabels.reverse();
      }

      const heatmapTrace: any = {
        x: xLabels,
        y: yLabels,
        z: dm,
        type: 'heatmap',
        colorscale: [
          [0, this.loColor],
          [0.5, this.medColor],
          [1, this.hiColor]
        ]
      };

      heatmapTrace.colorbar = this.buildHeatmapColorbar(dm);

      if (this.usesPercentageDistanceDisplay()) {
        heatmapTrace.customdata = this.buildFormattedHeatmapMatrix(dm);
        heatmapTrace.hovertemplate = 'X: %{x}<br>Y: %{y}<br>Distance: %{customdata}<extra></extra>';
      }

      this.heatmapData = [heatmapTrace]

/*      const parentElement = this.heatmapContainerRef.nativeElement.parentElement;
    const width = parentElement.clientWidth;
    const height = parentElement.clientHeight;
*/
      let marginLeft = this.heatmapShowLabels ? 90 : 10
      let marginBottom = this.heatmapShowLabels ? 75 : 10
      this.heatmapLayout = {
          xaxis: config,
          yaxis: config,
          width: $('#heatmap').parent().width() - 35,
          height: $('#heatmap').parent().height() - 90,
          margin: { t: 0, l: marginLeft, b: marginBottom, r: 0 }
        }
      this.heatmapConfig = {
          displaylogo: false,
          displayModeBar: false
        }

      //  this.Plotly.newPlot('heatmap', this.heatmapData, this.heatmapLayout, this.heatmapConfig);

      const plot = PlotlyModule.plotlyjs.newPlot('heatmap', cloneDeep(this.heatmapData), this.heatmapLayout, this.heatmapConfig);
      this.plot = plot;

      return Promise.resolve(plot).then(() => {
        if (identity !== this.getHeatmapDataIdentity()) {
          return;
        }
        this.setBackground();
        this.store.setNetworkRendered(true);
      });
    });
  }

  goldenLayoutComponentResize(initial=false): void {
    const height = $('heatmapcomponent').height() - 72;
    const width = $('heatmapcomponent').width() - 32;
    if (height)
      $('#heatmap').height(height);
    if (width)
      $('#heatmap').width(width)

    if ( !initial) {
      const config = {
        autotick: false,
        showticklabels: this.heatmapShowLabels
      };
      if (!config.showticklabels) {
      config["ticks"] = '';
      }

      let marginLeft = this.heatmapShowLabels ? 90 : 10
      let marginBottom = this.heatmapShowLabels ? 75 : 10
      this.heatmapLayout = {
        xaxis: config,
        yaxis: config,
        width: $('#heatmap').parent().width() - 35,
        height: $('#heatmap').parent().height() - 90,
        margin: { t: 0, l: marginLeft, b: marginBottom, r: 0 }
      }
      this.openCenter()
    }

/*    const heatmapElement = this.heatmapContainerRef.nativeElement;
    const parentElement = heatmapElement.parentElement;
  
    const height = parentElement.clientHeight;
    const width = parentElement.clientWidth;
    if (height) {
      this.renderer.setStyle(heatmapElement, 'height', `${height - 19}px`);
    }
    if (width) {
      this.renderer.setStyle(heatmapElement, 'width', `${width - 1}px`);
    }
*/
  }

  // getNodeIds(): string[] {
  //   const idSet: string[] = this.visuals.heatmap.commonService.session.data.nodes.map(x=>x._id);
  //   return idSet;
  // }
  
  redrawHeatmap(coalesceExactWakeup: boolean = false): void {
    //if (!this.heatmapContainerRef.nativeElement.length) return;
    if (!$('#heatmap').length) return;
    const identity = this.getHeatmapDataIdentity();
    if (this.heatmapDrawInFlight) {
      if (coalesceExactWakeup && identity === this.heatmapDrawIdentity) {
        return;
      }
      this.heatmapRedrawPending = true;
      return;
    }
    if (this.plot) PlotlyModule.plotlyjs.purge('heatmap');
    // const labels = this.nodeIds;
    // const xLabels = labels.map(d => 'N' + d);
    // const yLabels = xLabels.slice();
    // console.log(this.heatmapShowLabels, xLabels.length, xLabels);
    this.heatmapMetric = this.commonService.session.style.widgets['default-distance-metric'].toUpperCase();


    const config = {
      autotick: false,
      showticklabels: this.heatmapShowLabels
    };

    if (!config.showticklabels) {
      config["ticks"] = '';
    }

    this.heatmapDrawIdentity = identity;
    let tracked: Promise<void>;
    tracked = this.drawHeatmap(config, identity)
      .catch(error => {
        console.error('Unable to redraw the heatmap:', error);
      })
      .finally(() => {
        if (this.heatmapDrawInFlight !== tracked) {
          return;
        }
        this.heatmapDrawInFlight = null;
        this.heatmapDrawIdentity = '';
        if (this.heatmapRedrawPending) {
          this.heatmapRedrawPending = false;
          this.redrawHeatmap();
        }
      });
    this.heatmapDrawInFlight = tracked;
  }

  setBackground(): void {
    const col = this.commonService.session.style.widgets['background-color'];
    $('#heatmap svg.main-svg').first().css('background', col);
    $('#heatmap rect.bg').css('fill', col);

    const contrast = this.commonService.session.style.widgets['background-color-contrast'];
    $('#heatmap .xtitle, .ytitle').css('fill', contrast);
    $('#heatmap .xaxislayer-above text').css('fill', contrast);
    $('#heatmap .yaxislayer-above text').css('fill', contrast);
    /*const heatmapElement: HTMLElement = this.heatmapContainerRef.nativeElement;
    const col = this.commonService.session.style.widgets['background-color'];
    const contrast = this.commonService.session.style.widgets['background-color-contrast'];
      
    // Set background color of the main SVG
    const mainSvg = heatmapElement.querySelector('svg.main-svg');
    if (mainSvg) {
      this.renderer.setStyle(mainSvg, 'background', col);
    }

    // Set fill for rect.bg
    const rectBg = heatmapElement.querySelector('rect.bg');
    if (rectBg) {
      this.renderer.setStyle(rectBg, 'fill', col);
    }

    // Set fill for titles
    const titles = heatmapElement.querySelectorAll('.xtitle, .ytitle');
    titles.forEach(title => {
      this.renderer.setStyle(title, 'fill', contrast);
    });

    // Set fill for axis layer texts
    const axisTexts = heatmapElement.querySelectorAll('.xaxislayer-above text, .yaxislayer-above text');
    axisTexts.forEach(text => {
      this.renderer.setStyle(text, 'fill', contrast);
    });*/
  }

  updateLoColor(color: string): void {
    this.commonService.session.style.widgets["heatmap-color-low"] = color;
    this.loColor = color;
    this.redrawHeatmap();
  }

  updateMedColor(color: string): void {
    this.commonService.session.style.widgets["heatmap-color-medium"] = color;
    this.medColor = color;
    this.redrawHeatmap();
  }

  updateHiColor(color: string): void {
    this.commonService.session.style.widgets["heatmap-color-high"] = color;
    this.hiColor = color;
    this.redrawHeatmap();
  }

  updateInvertX(direction: boolean): void {
    this.invertX = direction;
    this.commonService.session.style.widgets["heatmap-invertX"] = this.invertX;
    this.redrawHeatmap();
  }

  updateInvertY(direction: boolean): void {
    this.invertY = direction;
    this.commonService.session.style.widgets["heatmap-invertY"] = this.invertY;
    this.redrawHeatmap();
  }

  updateShowLabels(showLabels: boolean): void {
    this.heatmapShowLabels = showLabels;
    this.commonService.session.style.widgets["heatmap-axislabels-show"] = this.heatmapShowLabels;
    this.redrawHeatmap();
  }

  updateVisualization(): void {
    this.redrawHeatmap();
  }

  refreshDistanceDisplayFormat(): void {
    this.redrawHeatmap();
  }

  saveImage(): void {
    const fileName = this.SelectedImageFilenameVariable;
    const domId = 'heatmap';
    const exportImageType = this.SelectedNetworkExportFileTypeVariable;
    const content = document.getElementById(domId);
    if (content) {
      const fixedContent = this.fixGradient(content);
      if (exportImageType === 'png') {
        domToImage.toPng(content).then(
          dataUrl => {
            saveAs(dataUrl, fileName+"."+exportImageType);
        });
      } else if (exportImageType === 'jpeg') {
          domToImage.toJpeg(content, { quality: 0.85 }).then(
            dataUrl => {
              saveAs(dataUrl, fileName+"."+exportImageType);
            });
      } else if (exportImageType === 'svg') {
          const svgContent = this.exportService.unparseSVG(fixedContent);
          const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
          saveAs(blob, fileName+"."+exportImageType);
      }
    }
  }

  fixGradient(el: HTMLElement): HTMLElement {
    const insertionPoint = el.getElementsByClassName("gradient_filled");
    if (!insertionPoint.length) {
      return el;
    }

    const startingUrl = insertionPoint[0]["style"]["fill"];
    if (!startingUrl || !startingUrl.includes("#")) {
      return el;
    }

    const idVal = startingUrl.substring(startingUrl.indexOf("#"));
    insertionPoint[0]["style"]["fill"] = 'url("'+idVal;
    return el;
  }

  saveDistanceMatrix(): void {
    const fileName = this.SelectedDistanceMatrixFilenameVariable;
    this.commonService.getDM().then(({dm, labels}) => {
      const xLabels = (labels || []).map((label) => String(label));
      const yLabels = cloneDeep(xLabels);
      let matrix = cloneDeep(dm);

      if (this.invertX) {
        matrix = matrix.map((row) => Array.isArray(row) ? [...row].reverse() : row);
        xLabels.reverse();
      }

      if (this.invertY) {
        matrix = [...matrix].reverse();
        yLabels.reverse();
      }

      const exportedMatrix = this.usesPercentageDistanceDisplay()
        ? matrix.map((row) => Array.isArray(row)
          ? row.map((value) => this.formatHeatmapDistanceValue(Number(value)))
          : row)
        : matrix;

      let csvContent = "";
      if (this.heatmapShowLabels) {
        csvContent += buildSafeCsvRow(["", ...xLabels]) + "\n";
        for (let i = 0; i < exportedMatrix.length; i++) {
          csvContent += buildSafeCsvRow([yLabels[i], ...exportedMatrix[i]]) + "\n";
        }
      } else {
        csvContent += exportedMatrix.map((row) => buildSafeCsvRow(row)).join("\n");
      }
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
      saveAs(blob, fileName);
    });
    
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
