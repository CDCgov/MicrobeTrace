import { Injector, Component, Output, EventEmitter, OnInit,
  ElementRef, ChangeDetectorRef, Inject } from '@angular/core';
import { EventManager } from '@angular/platform-browser';
import { CommonService } from '@app/contactTraceCommonServices/common.service';
import * as saveAs from 'file-saver';
import * as domToImage from 'html-to-image';
import { SelectItem } from 'primeng/api';
import { DialogSettings } from '@app/helperClasses/dialogSettings';
import * as _ from 'lodash';
import { MicrobeTraceNextVisuals } from '@app/microbe-trace-next-plugin-visuals';
import { CustomShapes } from '@app/helperClasses/customShapes';
import * as d3 from 'd3';
import { BaseComponentDirective } from '@app/base-component.directive';
import { ComponentContainer } from 'golden-layout';
import { GoogleTagManagerService } from 'angular-google-tag-manager';
import ApexSankey from 'apexsankey';
import { SankeyOptions } from 'apexsankey/lib/models/Options';
import { MultiSelectModule } from 'primeng/multiselect';
import { SSL_OP_SSLEAY_080_CLIENT_DH_BUG } from 'constants';
import { Edge, Node } from 'apexsankey/lib/models/Graph';

@Component({
  selector: 'SankeyComponent',
  templateUrl: './sankey.component.html',
  styleUrls: ['./sankey.component.scss']
})
export class SankeyComponent extends BaseComponentDirective implements OnInit {

  @Output() DisplayGlobalSettingsDialogEvent = new EventEmitter();
  viewActive: boolean = true;
  svgStyle: object = {
    height: '0px',
    width: '1000px'
  };

  private customShapes: CustomShapes = new CustomShapes();

  sankey: ApexSankey;
  ShowNetworkAttributes = false;
  ShowStatistics = false;
  ShowSankeyExportPane = false;
  ShowSankeySettingsPane = false;
  IsDataAvailable = false;
  isExportClosed = true;
  svg: any = {};
  settings: object = this.commonService.session.style.widgets;
  radToDeg: number = (180 / Math.PI);
  selected: boolean = false;
  multidrag = false;
  zoom: number = 1;
  FieldList: SelectItem[] = [];
  ToolTipFieldList: SelectItem[] = [];
  NetworkExportFileTypeList: object = [
    { label: 'png', value: 'png' },
    { label: 'jpeg', value: 'jpeg' },
    { label: 'svg', value: 'svg' }
  ];

  SelectedSankeyImageFilename = 'sankey_export'
  SelectedNetworkExportFileTypeListVariable = 'png';
  SelectedNetworkExportScaleVariable: number = 1;
  SelectedNetworkExportQualityVariable: number = 0.92;
  CalculatedResolutionWidth: number = 1900;
  CalculatedResolutionHeight: number = 800;
  CalculatedResolution: string = ((this.CalculatedResolutionWidth * this.SelectedNetworkExportScaleVariable) + ' x ' + (
    this.CalculatedResolutionHeight * this.SelectedNetworkExportScaleVariable) + 'px');


  ShowAdvancedExport = true;
  SankeyFieldNames: string[] = [];
  SelectedFieldName: string = "";

  SankeyExportDialogSettings: DialogSettings = new DialogSettings('#sankey-settings-pane', false);
  private visuals: MicrobeTraceNextVisuals;
  
  data = {
    nodes: [
        {
            "id": "a",
            "title": "AAA",
        },
        {
            "id": "b",
            "title": "BBB",
        },
        {
            "id": "c",
            "title": "CCC",
        },
        {
            "id": "d",
            "title": "DDD",
        },
    ],
    edges: [
        {
            "source": "a",
            "target": "c",
            "value": 1,
            "type": "A",
        },
        {
            "source": "b",
            "target": "c",
            "value": 2,
            "type": "A",
        },
        {
            "source": "c",
            "target": "d",
            "value": 3,
            "type": "A",
        }
    ],
  };

  constructor(injector: Injector,
    private eventManager: EventManager,
    public commonService: CommonService,
    @Inject(BaseComponentDirective.GoldenLayoutContainerInjectionToken) private container: ComponentContainer, 
    elRef: ElementRef,
    private cdref: ChangeDetectorRef,
    private gtmService: GoogleTagManagerService) {

    super(elRef.nativeElement);

    this.visuals = commonService.visuals;
    this.commonService.visuals.sankey = this;
  }

  ngOnInit(): void {
    const options = {
      width: this.CalculatedResolutionWidth,
      height: this.CalculatedResolutionHeight,
      canvasStyle: 'border: 1px solid #caced0; background: #f6f6f6;',
      spacing: 100,
      nodeWidth: 20,
      nodeBorderWidth: 1,
      nodeBorderColor: '#000',
      enableTooltip: true,
      tooltipId: 'sankey-tooltip-container',
      tooltipBorderColor: "#caced0",
      tooltipBGColor: "#f6f6f6",
      edgeOpacity: 0.3,
      edgeGradientFill: true,
      fontSize: '1rem',
      fontColor: "#101010",
      fontWeight: 400,
   };

   this.visuals.sankey.FieldList.push(
      {
        label: "None",
        value: "",
      }
    )

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    this.commonService.session.data['nodeFields'].map((d, i) => {

      this.visuals.sankey.FieldList.push(
        {
          label: this.visuals.sankey.commonService.capitalize(d.replace('_', '')),
          value: d
        });
    });

   // @ts-ignore
   this.sankey = new ApexSankey(document.getElementById('sankey-container'), options);
   // @ts-ignore
   this.goldenLayoutComponentResize()
   this.updateGraph() 

    this.container.on('resize', () => { this.goldenLayoutComponentResize() })
    this.container.on('hide', () => { 
      this.viewActive = false; 
      this.cdref.detectChanges();
    })
    this.container.on('show', () => { 
      this.viewActive = true; 
      this.cdref.detectChanges();
    })

    this.visuals.microbeTrace.GlobalSettingsNodeColorDialogSettings.setVisibility(false);
    this.visuals.microbeTrace.GlobalSettingsLinkColorDialogSettings.setVisibility(false);
  }

  goldenLayoutComponentResize() {
    $('#sankey-container').height($('sankeycomponent').height()-19);
    $('#sankey-container').width($('sankeycomponent').width()-1)
  }
  

  updateGraph() {
    if(this.SankeyFieldNames.length === 0) {
      // this.SankeyFieldNames = ["gender","transmission risk","subtype"];
      this.openSettings();
    } else {
      this.createSankeyData(this.SankeyFieldNames);
      // @ts-ignore
      const graph = this.sankey.render(this.data);
    }
  }

  createSankeyData(sankeyFields: string[]): void {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    //const order: string[][][] = [[[]]];
    const variables: string[][] = [];
    for(let i=0; i<sankeyFields.length; i++){
      const fieldValues = this.makeVariableArray(sankeyFields[i]);
      const variableCounts = this.getVariableCounts(fieldValues);
      const variableValues = Object.keys(variableCounts);
      variables.push(variableValues);
      for(let j=0; j<variableValues.length; j++){
        nodes.push({"id": variableValues[j], "title": variableValues[j]})
      }
    }
    for(let i=1; i<sankeyFields.length; i++){
      const firstField = sankeyFields[i-1];
      const secondField = sankeyFields[i];
      for(let q=0; q<variables[i-1].length; q++){
        for(let r=0; r<variables[i].length; r++){
          const queryObj = {
            firstField: firstField,
            firstValue: variables[i-1][q],
            secondField: secondField,
            secondValue: variables[i][r],
          }
          const edgeVal: number = this.getEdgeValue(queryObj);
          edges.push({source: queryObj["firstValue"], target: queryObj["secondValue"], value: edgeVal, type: null});
        }
      }
    }
    console.log(nodes);
    console.log(edges);
    // @ts-ignore
    this.data = {nodes: nodes, edges: edges}
  }

  getEdgeValue(queryObj: object): number {
    // console.log(`${queryObj["firstField"]} ${queryObj["firstValue"]} ${queryObj["secondField"]} ${queryObj["secondValue"]}`);
    const nodeCopy: object[] = _.cloneDeep(this.visuals.sankey.commonService.session.data.nodes);
    const filteredNodes = nodeCopy.filter(node => node[queryObj["firstField"]] === queryObj["firstValue"] && node[queryObj["secondField"]] === queryObj["secondValue"]);
    return filteredNodes.length;
  }

  getVariableCounts(dataColumn: string[] | number[]): object {
    // @ts-ignore
    const counts = dataColumn.reduce((acc, value) => {
      acc[value] = (acc[value] || 0) + 1;
      return acc;
    }, {});
    // @ts-ignore
    delete counts.null;
    return counts;
  }

  makeVariableArray(fieldName: string): string[] | number[] {
    console.log("Making array for " + fieldName);
    const nodeCopy: object[] = _.cloneDeep(this.visuals.sankey.commonService.session.data.nodes);
    let fieldValues: string[] | number[] = [];
    for(let i=0; i<nodeCopy.length; i++) {
      const item: object = nodeCopy[i];
      // @ts-ignore
      fieldValues.push(item[fieldName]);
    }
    return fieldValues;
  }

  addSelectedField(): void {
    if (this.SankeyFieldNames.length < 3){
      this.SankeyFieldNames.push(this.SelectedFieldName);
    }
    this.updateGraph();
  }


  openExport(): void {
    this.ShowSankeyExportPane = true;

    this.visuals.microbeTrace.GlobalSettingsDialogSettings.setStateBeforeExport();
    //this.visuals.microbeTrace.GlobalSettingsLinkColorDialogSettings.setStateBeforeExport();
    //this.visuals.microbeTrace.GlobalSettingsNodeColorDialogSettings.setStateBeforeExport();
    this.isExportClosed = false;
  }
  openSettings(): void {
    this.visuals.sankey.SankeyExportDialogSettings.setVisibility(true);
  }
  openCenter(): void {}


  saveImage(event): void {
    const fileName = this.SelectedSankeyImageFilename;
    const domId = 'sankey-container';
    const exportImageType = this.SelectedNetworkExportFileTypeListVariable ;
    const content = document.getElementById(domId);
    if (exportImageType === 'png') {
      domToImage.toPng(content).then(
        dataUrl => {
          saveAs(dataUrl, fileName);
      });
    } else if (exportImageType === 'jpeg') {
        domToImage.toJpeg(content, { quality: 0.85 }).then(
          dataUrl => {
            saveAs(dataUrl, fileName);
          });
    } else if (exportImageType === 'svg') {
        // The tooltips were being displayed as black bars, so I add a rule to hide them.
        // Have to parse the string into a document, get the right element, add the rule, and reserialize it
        let svgContent = this.visuals.gantt.commonService.unparseSVG(content);
        const parser = new DOMParser();
        const deserialized = parser.parseFromString(svgContent, 'text/xml')
        console.log(deserialized);
        const style = deserialized.getElementsByTagName('style');
        console.log(style);
        // style[0].innerHTML = ".tooltip { display: none !important; } .small { font-size: 80%; font-family: Roboto, 'Helvetica Neue', sans-serif; }";
        const serializer = new XMLSerializer();
        svgContent = serializer.serializeToString(deserialized);
        const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
        saveAs(blob, fileName);
    }

  }

  fieldListFull(): boolean {
    if(this.SankeyFieldNames.length < 3) {
      return false;
    }
    return true;
  }
}
export namespace SankeyComponent {
  export const componentTypeName = 'Sankey';
}