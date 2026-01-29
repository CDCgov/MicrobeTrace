import { Injector, Component, Output, EventEmitter, 
  ElementRef, Renderer2, ChangeDetectorRef, Inject, OnInit, ViewContainerRef,
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
//import * as plotlyjs from 'plotly.js-dist-min';


@Component({
    selector: 'HeatmapComponent',
    templateUrl: './heatmap.component.html',
    styleUrls: ['./heatmap.component.scss'],
    standalone: false
})
export class HeatmapComponent extends BaseComponentDirective implements OnInit {

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
    

    this.goldenLayoutComponentResize();

    this.container.on('resize', () => { this.goldenLayoutComponentResize() })
    this.container.on('hide', () => { 
      this.viewActive = false; 
      this.cdref.detectChanges();
    })
    this.container.on('show', () => { 
      this.viewActive = true; 
      this.cdref.detectChanges();
    })

    this.redrawHeatmap();
  }

  drawHeatmap(config: object): void {
    this.commonService.getDM().then(({dm, labels}) => {
      this.nodeIds = labels;
      const xLabels = labels.map(d => 'N' + d);
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

      this.heatmapData = [{
        x: xLabels,
        y: yLabels,
        z: dm,
        type: 'heatmap',
        colorscale: [
          [0, this.loColor],
          [0.5, this.medColor],
          [1, this.hiColor]
        ]
      }]

/*      const parentElement = this.heatmapContainerRef.nativeElement.parentElement;
    const width = parentElement.clientWidth;
    const height = parentElement.clientHeight;
*/
      this.heatmapLayout = {
          xaxis: config,
          yaxis: config,
          width: $('#heatmap').parent().width(),
          height: $('#heatmap').parent().height(),
        }
      this.heatmapConfig = {
          displaylogo: false,
          displayModeBar: false
        }

      //  this.Plotly.newPlot('heatmap', this.heatmapData, this.heatmapLayout, this.heatmapConfig);

      this.plot = PlotlyModule.plotlyjs.newPlot('heatmap', this.heatmapData, this.heatmapLayout, this.heatmapConfig);
    });
  }

  goldenLayoutComponentResize(): void {
    const height = $('heatmapcomponent').height();
    const width = $('heatmapcomponent').width();
    if (height)
      $('#heatmap').height(height-19);
    if (width)
      $('#heatmap').width(width-1)
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
  
  redrawHeatmap(): void {
    //if (!this.heatmapContainerRef.nativeElement.length) return;
    if (!$('#heatmap').length) return;
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

    this.drawHeatmap(config);
    this.setBackground();
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
    const startingUrl = insertionPoint[0]["style"]["fill"];
    const idVal = startingUrl.substring(startingUrl.indexOf("#"));
    insertionPoint[0]["style"]["fill"] = 'url("'+idVal;
    return el;
  }

  saveDistanceMatrix(): void {
    const fileName = this.SelectedDistanceMatrixFilenameVariable;
    const labelArray = cloneDeep(this.heatmapLabels);
    this.commonService.getDM().then(({dm, _}) => {
      let csvContent = "data:text/csv;charset=utf-8,";
      if (this.heatmapShowLabels) {
        labelArray.unshift("");
        csvContent += labelArray.join(",") + "\n";
        for(let i=0; i<dm.length; i++) {
          dm[i].unshift(this.heatmapLabels[i]);
          csvContent += dm[i].join(",") + "\n";
        }
      } else {
        csvContent += dm.map(e => e.join(",")).join("\n");
      }
      saveAs(csvContent, fileName);
    });
    
  } 
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace HeatmapComponent {
    export const componentTypeName = 'Heatmap';
}