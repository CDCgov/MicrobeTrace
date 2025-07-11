import { Injector, Component, Output, EventEmitter, OnInit, ElementRef, ChangeDetectorRef, Inject, ViewChild } from '@angular/core';
import { EventManager } from '@angular/platform-browser';
import { CommonService } from '@app/contactTraceCommonServices/common.service';
import * as saveAs from 'file-saver';
//import * as domToImage from 'html-to-image';
import { saveSvgAsPng } from 'save-svg-as-png';
import { SelectItem } from 'primeng/api';
import { DialogSettings } from '@app/helperClasses/dialogSettings';
import * as _ from 'lodash';
//import * as d3 from 'd3';
import * as d3sankey from 'd3-sankey';
import { BaseComponentDirective } from '@app/base-component.directive';
import { ComponentContainer } from 'golden-layout';
import { GoogleTagManagerService } from 'angular-google-tag-manager';
//import { MultiSelectModule } from 'primeng/multiselect';
import type { SankeyNode, SankeyLink } from './sankey-types';
import { ExportService } from '@app/contactTraceCommonServices/export.service';

@Component({
  selector: 'SankeyComponent',
  templateUrl: './sankey.component.html',
  styleUrls: ['./sankey.component.scss']
})
export class SankeyComponent extends BaseComponentDirective implements OnInit {

  @Output() DisplayGlobalSettingsDialogEvent = new EventEmitter();
  @ViewChild('sankeySVG') sankeySVG: ElementRef;
  
  viewActive: boolean = true;

  draggingNode = null;
  sankey = d3sankey.sankey();
  ShowSankeyExportPane = false;
  ShowSankeySettingsPane = false;
  IsDataAvailable = false;

  FieldList: SelectItem[] = [];
  layerPositions: number[] = [];
  layerColors: string[] = [];

  tooltipData: {'key': string, 'value': string}[];
  tooltipX: number;
  tooltipY: number;
  tooltipVisible: boolean = false;

  NetworkExportFileTypeList: object = [
    { label: 'png', value: 'png' },
    //{ label: 'jpeg', value: 'jpeg' },
    { label: 'svg', value: 'svg' }
  ];

  SelectedSankeyImageFilename = 'sankey_export'
  SelectedNetworkExportFileTypeListVariable = 'png';
  SankeyExportScaleVariable: number = 1;

  svgWidth: number = 1000;
  svgHeight: number = 800;
  CalculatedResolution: string = ((this.svgWidth * this.SankeyExportScaleVariable) + ' x ' + (
    this.svgHeight * this.SankeyExportScaleVariable) + 'px');

  ShowAdvancedExport = true;
  SankeyFieldNames: string[] = [];
  SelectedFieldName: string = "";

  SankeyExportDialogSettings: DialogSettings = new DialogSettings('#sankey-settings-pane', false);

  data: {nodes: SankeyNode[], links: SankeyLink[]} = {nodes: [], links: []}
  LinkColorOptions = ['Source', 'Target', 'Uniform']
  SelectedColorOption: "Source" | "Target" | "Uniform" = "Source"
  SelectedColorForUniform: string = "#aa002d"

  constructor(injector: Injector,
    private eventManager: EventManager,
    public commonService: CommonService,
    private exportService: ExportService,
    @Inject(BaseComponentDirective.GoldenLayoutContainerInjectionToken) private container: ComponentContainer, 
    elRef: ElementRef,
    private cdref: ChangeDetectorRef,
    private gtmService: GoogleTagManagerService) {

    super(elRef.nativeElement);

    this.layerColors = _.clone(this.commonService.session.style.nodeColors)
  }

  ngOnInit(): void {
    this.commonService.session.data['nodeFields'].map((d, i) => {
      this.FieldList.push(
        {
          label: this.commonService.capitalize(d.replace('_', '')),
          value: d
        });
    });

   // @ts-ignore
   this.goldenLayoutComponentResize()

    // Set the sankey diagram properties
    this.sankey
      .nodeWidth(25)
      .nodePadding(10)
      .size([this.svgWidth-100, this.svgHeight-100])

    this.container.on('resize', () => { this.goldenLayoutComponentResize() })
    this.container.on('hide', () => { 
      this.viewActive = false; 
      this.cdref.detectChanges();
    })
    this.container.on('show', () => { 
      this.viewActive = true; 
      this.cdref.detectChanges();
    })

    // remove this after initial
    this.SankeyFieldNames = ['WHO_class', 'cluster', 'Lineage']
    this.updateGraph();
  }

  /**
   * Updates the size of the svg
   */
  goldenLayoutComponentResize() {
    $('#sankey-container').height($('sankeycomponent').height() - 70);
    $('#sankey-container').width($('sankeycomponent').width() - 30);

    this.svgWidth = $('#sankey-container').width() - 40;
    this.svgHeight = $('#sankey-container').height() - 40;
    this.sankey.size([this.svgWidth-100, this.svgHeight-100])

    if (this.data.nodes.length > 0) this.sankeyGO();
  }

  /**
   * 
   * @param d link
   * @returns Link color for the link based on this.SelectedColorOption
   */
  getLinkColor(d) {
    if (this.SelectedColorOption == "Source") return d.source.color
    else if (this.SelectedColorOption == "Target") return d.target.color
    else return this.SelectedColorForUniform;
  }

  /**
   * @returns a string representing the svg path d variable for the link
   */
  getLinkPathDefinition(link): string {
    return d3sankey.sankeyLinkHorizontal()(link);
  }

  /**
   * @returns text for how much to translates the rect for each node in the svg
   */
  getNodeTransform(node:SankeyNode): string {
    return `translate(${node.x0}, ${node.y0})`
  }

  /**
   * Updates the order of rows when they are reordered in the setting menu
   */
  reorderRows(event) {
    let [temp] = this.layerColors.splice(event.dragIndex, 1)
    this.layerColors.splice(event.dropIndex, 0, temp);

    this.updateGraph();
  }

  /**
   * Updates the color of the nodes within a column (and links if appropriate)
   */
  updateColors(index: number) { 
    this.data.nodes.filter(node => node.layer == index).forEach(node => node.color = this.layerColors[index]);
  }

  /**
   * Updates the position of the links coming out from the node when the node is dragged.
   * Adapted from d3-sankey and d3noob's sankey implementation
   */
  updateLinkPosition() {
    this.data.nodes.forEach(function(node) {
      node.sourceLinks.sort(ascendingTargetDepth);
      node.targetLinks.sort(ascendingSourceDepth);
    });
    this.data.nodes.forEach(function(node) {
      let offsetY = 0
      node.sourceLinks.forEach(function(link) {
        link.y0 = node.y0 + offsetY + link.width/2 
        offsetY += link.width
      });
      offsetY = 0;
      node.targetLinks.forEach(function(link) {
        link.y1 = node.y0 + offsetY + link.width/2
        offsetY += link.width
      });
    });

    function ascendingSourceDepth(a, b) {
      return a.source.y0 - b.source.y0;
    }

    function ascendingTargetDepth(a, b) {
      return a.target.y1 - b.target.y1;
    }
  }

  /**
   * @param nodes nodes to be repositions, usually in the same layer
   * Repositions nodes in a layer so that they aren't on top of each other; based on resolveCollisions in d3-sankey package, but that function isn't publicly accessible
   */
  resolveColisions(nodes: SankeyNode[]) {
    let py = this.sankey.nodePadding() || 10;

    // first sort the nodes based on midpoints
    nodes.sort((a, b) => (a.y0 + a.y1)/2 - (b.y0 + b.y1)/2);

    // for each node, ensure it within the bounds of the svg then call resolveCollision helper functions
    nodes.forEach((subject, i) => {
      if (subject.y0 < 0) {
        let h = subject.y1 - subject.y0;
        subject.y0 = 0
        subject.y1 = h;
      }
      if (subject.y1 > this.svgHeight - 70) {
        let h = subject.y1 - subject.y0;
        subject.y1 = this.svgHeight - 70
        subject.y0 = subject.y1 - h;
      }
      this.resolveCollisionsBottomToTop(nodes, subject.y0 - py, i - 1, py);
      this.resolveCollisionsTopToBottom(nodes, subject.y1 + py, i + 1, py);
    })
  }

  // Push any overlapping nodes down.
  resolveCollisionsTopToBottom(nodes, y, i, py) {
    for (; i < nodes.length; i++) {
      const node = nodes[i];
      const dy = (y - node.y0);
      if (dy > 1e-6) node.y0 += dy, node.y1 += dy;
      y = node.y1 + py;
    }
  }

  // Push any overlapping nodes up.
  resolveCollisionsBottomToTop(nodes, y, i, py) {
    for (; i >= 0; i--) {
      const node = nodes[i];
      const dy = (node.y1 - y);
      if (dy > 1e-6) node.y0 -= dy, node.y1 -= dy;
      y = node.y0 - py;
    }
  }

  /**
   * Updates the value of this.draggingNode for the node the currently being dragged
   */
  startDrag(node:SankeyNode) {
    this.draggingNode = node;
    //event.preventDefault();
  }

  /**
   * Updates the position of the node (this.draggingNode) when a node is being dragged around the csv
   */
  move(event) {
    if (this.draggingNode != null) {
      let height = this.draggingNode.y1 - this.draggingNode.y0;
      this.draggingNode.y0 = event.offsetY - height/2;
      this.draggingNode.y1 = this.draggingNode.y0 + height;
      this.updateLinkPosition();
    }
  }

  /**
   * Called when dragging is complete. Resolves any collision with the nodes, updates Link positions, and resets this.draggingNode
   */
  endDrag() {
    if (this.draggingNode) {
      this.resolveColisions(this.data.nodes.filter(node => node.layer == this.draggingNode.layer))
      this.updateLinkPosition();
      this.draggingNode = null;
    }
  }

  /**
   * Updates CalculatedResolution variable to string such as '1250 x 855px' based on ImageDimensions and SankeyExportScaleVariable. 
   * This is called anytime SankeyExportScaleVariable is updated.
   */
  updateCalculatedResolution() {
    this.CalculatedResolution = (Math.round((this.svgWidth) * this.SankeyExportScaleVariable) + " x " + Math.round((this.svgHeight) * this.SankeyExportScaleVariable) + "px");
    this.cdref.detectChanges();
  }
 
  /**
   * Updates the tooltipData and shows the tooltip. Also updates the opacity of the appropriate links
   */
  showTooltip(event, element, elementType: 'Link' | 'Node') {
    //console.log(event);
    this.tooltipX = event.offsetX + 30;
    this.tooltipY = event.offsetY + 40;
    this.tooltipVisible = true;

    if (elementType == 'Link') {
      element.opacity = 0.8;
      this.tooltipData = [
        {'key': 'Source', 'value': element.source.name},
        {'key': 'Target', 'value': element.target.name},
        {'key': 'Count', 'value': element.value}
      ]

    } else {
      element.sourceLinks.forEach(link => link.opacity = 0.8)
      element.targetLinks.forEach(link => link.opacity = 0.8)
      this.tooltipData = [
        {'key': this.SankeyFieldNames[element.layer], 'value': element.name},
        {'key': 'Count', 'value': element.value}
      ]
    }
  }

  /**
   * Hides the tooltip and resets the link.opactity
   */
  hideTooltip() {
    this.data.links.forEach(link => link.opacity = 0.5);
    this.tooltipVisible = false;    
  }

  /**
   * Updates sankey graph by update the data and then the sankey
   */
  updateGraph() {
    if(this.SankeyFieldNames.length === 0) {
      this.openSettings();
    } else if (this.SankeyFieldNames.length < 2) {
      this.data = {nodes: [], links: []}
    } else {
      this.createSankeyData(this.SankeyFieldNames);
      this.sankeyGO();
    }
  }

  /**
   * Feed this.data into sankey in order to generates full sankey objects that can be used to genereate the svg. Also updates the position of the labels for each layer of the sankey
   */
  sankeyGO() {
    this.sankey(this.data);
    this.data.links.forEach(link => link.opacity = 0.5);

    this.layerPositions = []
    for (let i = 0; i < this.SankeyFieldNames.length; i++) {
      this.layerPositions.push(this.data.nodes.find(node => node.layer == i).x0)
    }
  }

  /**
   * Generates this.data based on data and sankeyFields that are selected
   */
  createSankeyData(sankeyFields: string[]): void {
    const nodes: SankeyNode[] = [];
    let nodeIndex = 0;
    const edges: SankeyLink[] = [];
    //const order: string[][][] = [[[]]];
    const variables: string[][] = [];
    for(let i=0; i<sankeyFields.length; i++){
      const fieldValues = this.makeVariableArray(sankeyFields[i]);
      const variableCounts = this.getVariableCounts(fieldValues);
      const variableValues = Object.keys(variableCounts);
      variables.push(variableValues);
      for(let j=0; j<variableValues.length; j++){
        nodes.push({"index": nodeIndex, "name": variableValues[j], layer: i, color: this.layerColors[i]})
        nodeIndex += 1;
      }
    }
    for(let i=1; i<sankeyFields.length; i++){
      const firstField = sankeyFields[i-1];
      const secondField = sankeyFields[i];
      for(let q=0; q<variables[i-1].length; q++){
        let sourceIndex = nodes.find(node => node.layer==i-1 && node.name ==variables[i-1][q]).index
        for(let r=0; r<variables[i].length; r++){
          let targetIndex = nodes.find(node => node.layer==i && node.name ==variables[i][r]).index
          const queryObj = {
            firstField: firstField,
            firstValue: variables[i-1][q],
            secondField: secondField,
            secondValue: variables[i][r],
          }
          const edgeVal: number = this.getEdgeValue(queryObj);
          edges.push({source: sourceIndex, target: targetIndex, value: edgeVal});
        }
      }
    }
    // console.log(nodes);
    // console.log(edges);
    // @ts-ignore
    this.data = {nodes: nodes, links: edges}
  }

  getEdgeValue(queryObj: object): number {
    // console.log(`${queryObj["firstField"]} ${queryObj["firstValue"]} ${queryObj["secondField"]} ${queryObj["secondValue"]}`);
    const nodeCopy: object[] = _.cloneDeep(this.commonService.session.data.nodes);
    const filteredNodes = nodeCopy.filter(node => String(node[queryObj["firstField"]]) === String(queryObj["firstValue"]) && String(node[queryObj["secondField"]]) === String(queryObj["secondValue"]));
    return filteredNodes.length;
  }

  getVariableCounts(dataColumn: string[] | number[]): object {
    // @ts-ignore
    const counts = dataColumn.reduce((acc, value) => {
      acc[value] = (acc[value] || 0) + 1;
      return acc;
    }, {});
    // @ts-ignore
    //delete counts.null;
    return counts;
  }

  makeVariableArray(fieldName: string): string[] | number[] {
    const nodeCopy: object[] = _.cloneDeep(this.commonService.session.data.nodes);
    let fieldValues: string[] | number[] = [];
    for(let i=0; i<nodeCopy.length; i++) {
      const item: object = nodeCopy[i];
      // @ts-ignore
      fieldValues.push(item[fieldName]);
    }
    return fieldValues;
  }

  addSelectedField(): void {
    if (this.SelectedFieldName == null || this.SelectedFieldName == undefined || this.SelectedFieldName == '') {
      return;
    }
    if (this.SankeyFieldNames.length < 5){
      this.SankeyFieldNames.push(this.SelectedFieldName);
    }
    this.updateGraph();
  }

  fieldListFull(): boolean {
    if(this.SankeyFieldNames.length < 5) {
      return false;
    }
    return true;
  }

  removeField(value): void {
    const index = this.SankeyFieldNames.indexOf(value);
    this.SankeyFieldNames.splice(index, 1);
    this.updateGraph();
  }


  /**
   * Opens the export dialog box
   */
  openExport(): void {
    this.ShowSankeyExportPane = true;
    this.updateCalculatedResolution();
    //this.visuals.microbeTrace.GlobalSettingsLinkColorDialogSettings.setStateBeforeExport();
    //this.visuals.microbeTrace.GlobalSettingsNodeColorDialogSettings.setStateBeforeExport();
  }

  /**
   * Sets this.isExportClosed to true
   */
  onCloseExport() {
      this.ShowSankeyExportPane = true;
  }

  openSettings(): void {
    this.SankeyExportDialogSettings.setVisibility(true);
  }
  openCenter(): void {}

  exportVisualization(): void {
    //const domId = 'sankey-container';
    const exportImageType = this.SelectedNetworkExportFileTypeListVariable ;
    //const content = document.getElementById(domId);
    if (exportImageType === 'png') {
      window.devicePixelRatio = 1;
      saveSvgAsPng(this.sankeySVG.nativeElement, this.SelectedSankeyImageFilename + '.' + this.SelectedNetworkExportFileTypeListVariable, {
          scale: this.SankeyExportScaleVariable,
          backgroundColor: "#ffffff",
          encoderType: 'image/' + this.SelectedNetworkExportFileTypeListVariable,
      });
    //   domToImage.toPng(content).then(
    //     dataUrl => {
    //       saveAs(dataUrl, this.SelectedSankeyImageFilename);
    //   });
    // } else if (exportImageType === 'jpeg') {
    //     domToImage.toJpeg(content, { quality: 0.85 }).then(
    //       dataUrl => {
    //         saveAs(dataUrl, this.SelectedSankeyImageFilename);
    //       });
    } else if (exportImageType === 'svg') {
        let svgContent = this.exportService.unparseSVG(this.sankeySVG.nativeElement);
        const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
        saveAs(blob, this.SelectedSankeyImageFilename);
    }

  }

}

export namespace SankeyComponent {
  export const componentTypeName = 'Sankey';
}