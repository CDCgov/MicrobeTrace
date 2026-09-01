import {
  Injector, Component, Output, EventEmitter, OnInit,
  ElementRef, ChangeDetectorRef, Inject, OnDestroy
} from '@angular/core';
import { EventManager } from '@angular/platform-browser';
import { CommonService } from '@app/contactTraceCommonServices/common.service';
import { saveAs } from 'file-saver';
import { SelectItem } from 'primeng/api';
import { DialogSettings } from '@app/helperClasses/dialogSettings';
import * as _ from 'lodash';
import { MicrobeTraceNextVisuals } from '@app/microbe-trace-next-plugin-visuals';
import { CustomShapes } from '@app/helperClasses/customShapes';
import TidyTree from './tidytree';
import * as d3 from 'd3';
import { BaseComponentDirective } from '@app/base-component.directive';
import { ComponentContainer } from 'golden-layout';
import { GoogleTagManagerService } from 'angular-google-tag-manager';
//import { runInThisContext } from 'vm';
//import { MatHint } from '@angular/material/form-field';
import { ExportService, ExportOptions } from '@app/contactTraceCommonServices/export.service';
import { MicobeTraceNextPluginEvents } from '../../helperClasses/interfaces';

import { throws } from 'assert';
import { Subject, takeUntil } from 'rxjs';
import { CommonStoreService } from '@app/contactTraceCommonServices/common-store.services';
import { getEvenMixedNodeShapeSegments, getMixedNodeRingWidth, getMixedNodeShapeDataUri, getTreeNodeShapeDataUri, getTreeNodeShapeScale, isCustomNodeShape as isCustomNodeIconShape, MIXED_NODE_CENTER_COLOR, resolveNodeShapeForNode } from '@app/contactTraceCommonServices/node-shapes';
import { createGlobalSettingsDialogRequest, GlobalSettingsDialogRequest } from '@app/helperClasses/globalSettingsDialogRequest';

/**
 * @title PhylogeneticComponent
 */
@Component({
    selector: 'PhylogeneticComponent',
    templateUrl: './phylogenetic-plugin.component.html',
    styleUrls: ['./phylogenetic-plugin.component.scss'],
    standalone: false
})
export class PhylogeneticComponent extends BaseComponentDirective implements OnInit, OnDestroy, MicobeTraceNextPluginEvents {

  @Output() DisplayGlobalSettingsDialogEvent = new EventEmitter<GlobalSettingsDialogRequest>();
  viewActive: boolean = true;
  svgStyle: object = {
    height: '0px',
    width: '1000px'
  };

  private customShapes: CustomShapes = new CustomShapes();

  ShowNetworkAttributes = false;
  ShowStatistics = false;
  ShowPhylogeneticExportPane = false;
  ShowPhylogeneticSettingsPane = false;
  IsDataAvailable = false;
  svg: any = {};
  settings: object = this.commonService.session.style.widgets;
  radToDeg: number = (180 / Math.PI);
  selected: boolean = false;
  multidrag = false;
  zoom: number = 1;
  FieldList: SelectItem[] = [];
  ToolTipFieldList: SelectItem[] = [];
  nodeMin: number = 3;
  nodeMax: number = 27;
  nodeScale: d3.ScaleLinear<number, number> = d3.scaleLinear().domain([0, 1]).range([0, 1]);
  minNodeWidth: number = 5;
  maxNodeWidth: number = 15;
  nodeMid: number = 1;
  debugMode = false;
  hasNewickFile: boolean;



  // Tree Tab
  TreeLayouts: object = [
    { label: 'Horizontal', value: 'horizontal' },
    { label: 'Vertical', value: 'vertical' },
    { label: 'Circular', value: 'circular' },
  ];
  SelectedTreeLayoutVariable: 'horizontal'|'vertical'|'circular' = this.settings['tree-layout-horizontal'] ? 'horizontal' :  this.settings['tree-layout-vertical'] ? 'vertical' :this.settings['tree-layout-circular'] ? 'circular' : 'horizontal';
  TreeModes: object = [
    { label: 'Smooth', value: 'smooth' },
    { label: 'Square', value: 'square' },
    { label: 'Straight', value: 'straight' },
  ];
  SelectedTreeModeVariable: 'smooth'|'square'|'straight' = this.settings['tree-mode-square'] ? 'square': this.settings['tree-mode-smooth'] ? 'smooth': this.settings['tree-mode-straight'] ? 'straight': 'square';
  TreeTypes: object = [
    { label: 'Weighted', value: 'weighted' },
    { label: 'Unweighted (Tree)', value: 'tree' },
    { label: 'Dendrogram', value: 'dendrogram' },
  ];
  SelectedTreeTypeVariable = this.settings['tree-type'] ?? 'weighted';  // 'weighted';
  SelectedVerticalStretchVariable = this.settings['tree-vertical-stretch'] ?? 1;
  SelectedHorizontalStretchVariable = this.settings['tree-horizontal-stretch'] ?? 1;

  // Leaves Tab
  SelectedLeafLabelShowVariable = this.settings['tree-leaf-label-show'] ?? true;
  SelectedLeafLabelVariable: string = '_id';
  LeafLabelFieldList: SelectItem[] = [];
  SelectedLeafLabelSizeVariable = this.settings['tree-leaf-label-size'] ?? 12;
  SelectedLeafTooltipShowVariable = this.settings['tree-tooltip-show'] ?? true;
  SelectedLeafTooltipVariable = '_id';
  //LeafTooltipFieldList: object[] = [];
  SelectedLeafNodeShowVariable = this.settings['tree-leaf-node-show'] ?? true;
  SelectedLeafNodeUseGlobalShapesVariable = this.settings['tree-leaf-node-use-global-shapes'] ?? false;
  SelectedLeafNodeSizeVariable: string = this.settings['tree-leaf-node-radius-variable'] ?? 'None';
  SelectedLeafNodeSize: number = this.settings['tree-leaf-node-size'] ?? 5;
  SelectedLeafNodeColorVariable = this.settings['node-color'];
  SelectedSelectedLeafNodeColorVariable = this.settings['selected-color'];

  // Branch Tab
  SelectedBranchNodeShowVariable = this.settings['tree-branch-nodes-show'] ?? false;
  SelectedBranchNodeSizeVariable = 5;
  SelectedBranchNodeColorVariable = this.settings['node-color'];
  SelectedBranchSizeVariable = 3;
  SelectedBranchLabelSizeVariable: 12 = 12;
  SelectedLinkColorVariable = this.settings['link-color'];
  SelectedBranchLabelShowVariable: boolean = false;
  SelectedBranchDistanceShowVariable = !(this.settings['tree-branch-distances-hide'] ?? true); // inverse of its widget; defaults to false
  SelectedBranchDistanceSizeVariable = this.settings['tree-branch-distance-size'] ?? 12;
  //SelectedBranchTooltipShowVariable = false;

  hideShowOptions: object = [
    { label: 'Hide', value: false },
    { label: 'Show', value: true }
  ];
  enableDisableOptions: object = [
    { label: 'Disable', value: false },
    { label: 'Enable', value: true }
  ];

  // Export Settings
  private isExportClosed = false;
  public isExporting = false;

  SelectedTreeImageFilenameVariable = 'default_tree';
  SelectedNewickStringFilenameVariable = 'default_tree.nwk';

  NetworkExportFileTypeList: object = [
    { label: 'png', value: 'png' },
    { label: 'jpeg', value: 'jpeg' },
    { label: 'svg', value: 'svg' }
  ];

  SelectedNetworkExportFileTypeListVariable = 'png';
  SelectedNetworkExportScaleVariable: number = 1;
  SelectedNetworkExportQualityVariable: number = 0.92;
  CalculatedResolutionWidth: number = 1918;
  CalculatedResolutionHeight: number = 909;
  CalculatedResolution: string = ((this.CalculatedResolutionWidth * this.SelectedNetworkExportScaleVariable) + ' x ' + (
    this.CalculatedResolutionHeight * this.SelectedNetworkExportScaleVariable) + 'px');


  ShowAdvancedExport = true;

  PhylogeneticTreeDialogSettings: DialogSettings = new DialogSettings('#phylotree-settings-pane', false);

  //ContextSelectedNodeAttributes: { attribute: string, value: string }[] = [];
  tree: TidyTree = null;
  originalTreeData: any = null;
  hasTreeBeenModifiedFromOriginal = false;
  private treeLeafShapeUriCache = new Map<string, string>();

  private visuals: MicrobeTraceNextVisuals;
  private destroy$ = new Subject<void>();

  constructor(injector: Injector,
    private eventManager: EventManager,
    public commonService: CommonService,
    @Inject(BaseComponentDirective.GoldenLayoutContainerInjectionToken) private container: ComponentContainer,
    elRef: ElementRef,
    private cdref: ChangeDetectorRef,
    private gtmService: GoogleTagManagerService,
    private store: CommonStoreService,
    private exportService: ExportService) {

    super(elRef.nativeElement);

    this.visuals = commonService.visuals;
    this.commonService.visuals.phylogenetic = this;
  }

  private markTreeRendered(): void {
    window.requestAnimationFrame(() => {
      this.store.setNetworkRendered(true);
      this.store.setNetworkUpdated(false);
      this.commonService.session.network.rendering = false;
      this.commonService.demoNetworkRendered = true;
    });
  }

  openTree = async () => {
    /*
    if (this.visuals.phylogenetic.commonService.session.data.newickString) {
      this.tree = new TidyTree(this.visuals.phylogenetic.commonService.session.data.tree,
                               this.getTreeOptions(),
                               this.getTreeHandlers());
      console.log(this.visuals.phylogenetic.commonService.session.data.tree);
      console.log(this.tree);
      this.hideTooltip();
      this.styleTree();
    } else {
    */
    //@ts-ignore
    if (this.visuals.phylogenetic.commonService.session.data.hasOwnProperty("newickString") && this.visuals.phylogenetic.commonService.session.data.newickString) {
      //@ts-ignore
      const newickString = this.visuals.phylogenetic.commonService.session.data.newickString;
      const tree = this.buildTree(newickString);
      this.tree = tree;
      this.commonService.visuals.phylogenetic.tree = tree;
      this.originalTreeData = tree.data?.clone ? tree.data.clone() : tree.data;
      this.hasTreeBeenModifiedFromOriginal = false;
      //this.mergeNodeData();
      this.hideTooltip();
      this.styleTree();
    } else {
      const newickString = await this.commonService.computeTree();
      this.commonService.session.data.newickString = newickString;
      console.log(newickString);
      //newickString.then((x) => {
        const tree = this.buildTree(newickString);
        this.tree = tree;
        this.commonService.visuals.phylogenetic.tree = tree;
        this.originalTreeData = tree.data?.clone ? tree.data.clone() : tree.data;
        this.hasTreeBeenModifiedFromOriginal = false;
        //this.mergeNodeData();
        this.hideTooltip();
        this.styleTree();
      //});
    }
    this.hasNewickFile = this.commonService.session.files.some(file => file.format == 'newick');
    this.markTreeRendered();
    // d3.select('svg#network').exit().remove();
    // this.visuals.phylogenetic.svg = d3.select('svg#network').append('g');

    // }
  }

  // mergeNodeData(): void {
  //   let data = this.commonService.session.data.nodes;
  //   console.log(this.tree.data);
  //   let leafNodes = this.tree.data.getLeaves();
  // }

  styleTree = () => {
    if (!this.tree) return;
    this.svg = d3.select('#phylocanvas svg');
    this.svg.style('overflow', 'visible');
    // let nodes = this.commonService.session.data; // This section seems redundant (replaced with getTreeHandlers)
    // nodes = this.svg.select('g.nodes').selectAll('g').data(nodes, d => d.id)
    //   .join(
    //     enter => {
    //       const g = enter.append('g')
    //         .attr('tabindex', '0')
    //         .on('mouseenter focusin', (x) => this.showTooltip(x))
    //         .on('mouseout focusout', (x) => this.hideTooltip())
    //         .on('contextmenu', (x) => this.showContextMenu(x))
    //         .on('click', (x) => this.clickHandler(x))
    //         .on('keydown', n => {
    //           if ((d3 as any).event.code === 'Space') this.clickHandler(n);
    //           if ((d3 as any).event.shiftKey && (d3 as any).event.key === 'F10') this.showContextMenu(n);
    //         });
    //       g.append('path')
    //         .style('stroke', 'black')
    //         .style('stroke-width', '2px');
    //       g.append('text')
    //         .attr('dy', 5)
    //         .attr('dx', 8);
    //       return g;
    //     }
    //   );
    this.tree.setBranchLabels(this.SelectedBranchLabelShowVariable);
    this.tree.eachBranchLabel(this.styleBranchLabel);
    this.tree.setBranchNodes(this.SelectedBranchNodeShowVariable);
    this.tree.eachBranchNode(this.styleBranchNode);
    this.tree.setBranchDistances(this.SelectedBranchDistanceShowVariable);
    this.tree.eachBranchDistance(this.styleBranchDistance);
    this.tree.setLeafNodes(this.SelectedLeafNodeShowVariable);
    if (typeof this.SelectedLeafNodeSizeVariable === "string"){
      this.updateMinMaxNode();
    }
    this.tree.eachLeafNode(this.styleLeafNode);
    this.onLeafLabelVariableChange(this.SelectedLeafLabelVariable);
    this.tree.setLeafLabels(this.SelectedLeafLabelShowVariable);
    this.tree.eachLeafLabel(this.styleLeafLabel);
    const branchEls = document.querySelectorAll('g.tidytree-link > path');
    this.svg.style('height', '88vh;');
    branchEls.forEach(this.styleBranch);
    this.svg.style('background-color', '#ffffff');
  }

  styleBranch = (el) => {
    d3.select(el).style('stroke', this.SelectedLinkColorVariable);
    d3.select(el).style('stroke-width', `${this.SelectedBranchSizeVariable}px`);
  }

  styleBranchLabel = (label, data) => {
    d3.select(label).style('font-size', `${this.SelectedBranchLabelSizeVariable}px`);
  }

  styleBranchNode = (node, data) => {
    d3.select(node).attr('r', this.SelectedBranchNodeSizeVariable);
    d3.select(node).style('fill', this.SelectedBranchNodeColorVariable);
  }

  styleBranchDistance = (label, data) => {
    d3.select(label).style('font-size', `${this.SelectedBranchDistanceSizeVariable}px`);
  }


  styleLeafLabel = (label, data) => {
    d3.select(label).style('font-size', `${this.SelectedLeafLabelSizeVariable}px`);
  }

  isNumber(a): boolean {
    return typeof a == "number";
  };

  updateMinMaxNode() {
    const visNodes = this.commonService.getVisibleNodes();
    let n = visNodes.length;


    this.nodeMin = Number.MAX_VALUE;
    this.nodeMax = Number.MIN_VALUE;
    for (let i = 0; i < n; i++) {
        let size = visNodes[i][this.SelectedLeafNodeSizeVariable];
        if (typeof size == 'undefined') continue;
        if (size < this.nodeMin) this.nodeMin = size;
        if (size > this.nodeMax) this.nodeMax = size;
    }

    this.nodeMid = (this.nodeMax - this.nodeMin) / 2;

    this.nodeScale = d3.scaleLinear()
        .domain([this.nodeMin, this.nodeMax])
        .range([this.minNodeWidth, this.maxNodeWidth]);
  }

  getLeafSize = (node_id, variable): number => {
    let defaultSize = this.SelectedLeafNodeSize;
    let size = defaultSize, med = defaultSize, oldrng, min, max;
    let nodes = this.visuals.phylogenetic.commonService.session.data.nodes;
    const node = nodes.filter(x => {
      if (x._id === node_id) {
        return true;
      }
    });

    if (variable === 'None') {
      return defaultSize;
    } else {

      let v = node[0][variable];
      if (variable === "Cluster" || variable === "Cluster size") {
        return parseInt(v);
      }

      if (!this.isNumber(v)) v = this.nodeMid;

      // Check the type of v before calling linkScale

      // Ensure v is a number before using linkScale
      if (typeof v === 'number') {
        let scaleValue = this.nodeScale(v);
        if (this.debugMode) {
          console.log('link scale', scaleValue);
        }
        return scaleValue;
      } else {
        if (this.debugMode) {
          console.error('v is not a number:', v);
        }
        return this.nodeScale; // Default to scalar if v is not a number
      }
    }

  }

  styleLeafNode = (node, data) => {
    let leafSize: number;
    leafSize = this.getLeafSize(data.data.id, this.SelectedLeafNodeSizeVariable);
    const selectedColor = this.SelectedSelectedLeafNodeColorVariable;
    const nodeData = this.getLeafNodeData(data.data.id);
    const isSelected = !!(nodeData && nodeData.selected);
    const fillStyle = this.getLeafNodeFillStyle(nodeData);
    const fillColor = fillStyle.color;
    const fillOpacity = fillStyle.alpha;
    const mixedSegments = Array.isArray(fillStyle.segments) ? fillStyle.segments : [];
    const hasMixedRing = mixedSegments.length > 1;
    const nodeSelection = d3.select(node);

    nodeSelection
      .attr('r', leafSize)
      .style('pointer-events', 'all');

    if (!this.SelectedLeafNodeShowVariable) {
      this.removeLeafNodeShapeOverlay(node);
      this.removeLeafNodeMixedRing(node);
      nodeSelection
        .style('fill-opacity', 0)
        .style('stroke', 'transparent')
        .style('stroke-width', '0px');
      return;
    }

    if (this.SelectedLeafNodeUseGlobalShapesVariable) {
      const shapeKey = resolveNodeShapeForNode(
        nodeData,
        this.commonService.session.style.widgets,
        this.commonService.session.style,
        this.commonService.temp.style.nodeSymbolMap
      );
      const strokeColor = isSelected ? selectedColor : shapeKey == 'lettuce'? '#ffffff' : '#000000';

      if (shapeKey === 'ellipse') {
        let strokeWidth = isSelected? (leafSize > 9 ? '5px': '3px') : (leafSize > 9 ? '2px' : '1px')
        this.removeLeafNodeShapeOverlay(node);
        nodeSelection
          .style('fill', hasMixedRing ? MIXED_NODE_CENTER_COLOR : fillColor)
          .style('fill-opacity', hasMixedRing ? 1 : fillOpacity)
          .style('stroke', strokeColor)
          .style('stroke-width', strokeWidth);
        this.renderLeafCircleMixedRing(node, mixedSegments, fillOpacity, leafSize, parseFloat(strokeWidth));
        return;
      }

      this.removeLeafNodeMixedRing(node);
      this.renderLeafNodeShapeOverlay(node, shapeKey, leafSize, fillColor, strokeColor, isSelected, fillOpacity, mixedSegments);
      nodeSelection
        .style('fill', fillColor)
        .style('fill-opacity', 0)
        .style('stroke', 'transparent')
        .style('stroke-width', '0px');
      return;
    }

    this.removeLeafNodeShapeOverlay(node);
    let strokeWidth = isSelected? (leafSize > 9 ? '5px': '3px') : (leafSize > 9 ? '2px' : '1px')
    nodeSelection
      .style('fill', hasMixedRing ? MIXED_NODE_CENTER_COLOR : fillColor)
      .style('fill-opacity', hasMixedRing ? 1 : fillOpacity)
      .style('stroke', isSelected ? selectedColor : '#000000')
      .style('stroke-width', strokeWidth);
    this.renderLeafCircleMixedRing(node, mixedSegments, fillOpacity, leafSize, parseFloat(strokeWidth));
  }

  private getLeafNodeData(nodeId: string): any {
    return this.visuals.phylogenetic.commonService.session.data.nodes.find(
      node => node._id === nodeId || node.id === nodeId
    );
  }

  private getLeafNodeFillStyle(nodeData: any): { color: string; alpha: number; segments?: any[] } {
    return this.visuals.phylogenetic.commonService.getNodeFillStyle(nodeData);
  }

  private renderLeafCircleMixedRing(
    node: SVGElement,
    segments: any[],
    fallbackOpacity: number,
    leafSize: number,
    outlineStrokeWidth: number
  ): void {
    const parentNode = node.parentNode as SVGGElement | null;
    const evenSegments = getEvenMixedNodeShapeSegments(segments);
    if (!parentNode || evenSegments.length < 2) {
      this.removeLeafNodeMixedRing(node);
      return;
    }

    const ringWidth = getMixedNodeRingWidth(leafSize * 2);
    const ringRadius = leafSize - (outlineStrokeWidth / 2) - (ringWidth / 2);
    if (ringRadius <= 0) {
      this.removeLeafNodeMixedRing(node);
      return;
    }

    const ringSegments = evenSegments.map(({ segment, startFraction, endFraction }, index) => ({
      color: String(segment.color || '#000000'),
      dashOffset: -startFraction,
      index,
      length: endFraction - startFraction,
      opacity: Number.isFinite(Number(segment.alpha))
        ? Math.min(1, Math.max(0, Number(segment.alpha)))
        : Math.min(1, Math.max(0, Number(fallbackOpacity)))
    }));

    d3.select(parentNode)
      .selectAll<SVGCircleElement, any>('circle.tidytree-node-mixed-ring')
      .data(ringSegments, segment => segment.index)
      .join(
        enter => enter
          .insert('circle', 'text')
          .attr('class', 'tidytree-node-mixed-ring')
          .attr('data-mt-mixed-ring', 'true')
          .style('pointer-events', 'none'),
        update => update,
        exit => exit.remove()
      )
      .attr('cx', 0)
      .attr('cy', 0)
      .attr('r', ringRadius)
      .attr('pathLength', 1)
      .attr('fill', 'none')
      .attr('stroke', segment => segment.color)
      .attr('stroke-opacity', segment => segment.opacity)
      .attr('stroke-width', ringWidth)
      .attr('stroke-dasharray', segment => `${segment.length} ${1 - segment.length}`)
      .attr('stroke-dashoffset', segment => segment.dashOffset)
      .attr('stroke-linecap', 'butt')
      .attr('transform', 'rotate(-90)');
  }

  private removeLeafNodeMixedRing(node: SVGElement): void {
    const parentNode = node.parentNode as SVGGElement | null;
    if (parentNode) {
      d3.select(parentNode).selectAll('circle.tidytree-node-mixed-ring').remove();
    }
  }

  private removeLeafNodeShapeOverlay(node: SVGElement): void {
    const parentNode = node.parentNode as SVGGElement | null;
    if (!parentNode) {
      return;
    }

    d3.select(parentNode).selectAll('image.tidytree-node-shape-overlay, svg.tidytree-node-shape-overlay').remove();
  }

  private getLeafShapeStrokeWidth(shapeKey: string, isSelected: boolean, hasMixedSegments: boolean = false): number {
    if (hasMixedSegments && isCustomNodeIconShape(shapeKey)) {
        return isSelected ? 48 : 32;
    }

    if (shapeKey == 'lettuce') {
      return isSelected ? 10 : 3;
    } else if (shapeKey == 'ship' || shapeKey == 'tick' || shapeKey == 'swab') {
        return isSelected ? 12 : 5;
    } else if (isCustomNodeIconShape(shapeKey)) {
        return isSelected ? 20 : 10;
    } else {
        return isSelected ? 48 : 16;
    }
  }

  private getLeafShapeDataUri(
    shapeKey: string,
    fillColor: string,
    strokeColor: string,
    strokeWidth: number,
    fillOpacity: number,
    segments: any[] = [],
    renderedSize?: number
  ): string {
    const segmentKey = segments.length > 1
      ? segments.map(segment => `${segment.value ?? ''}:${segment.color}:${segment.alpha ?? fillOpacity}:${segment.weight ?? 1}`).join(',')
      : '';
    const cacheKey = `${shapeKey}|${fillColor}|${strokeColor}|${strokeWidth}|${fillOpacity}|${segmentKey}|${renderedSize ?? ''}`;
    const cachedUri = this.treeLeafShapeUriCache.get(cacheKey);
    if (cachedUri) {
      return cachedUri;
    }

    const dataUri = segments.length > 1
      ? getMixedNodeShapeDataUri(shapeKey, fillColor, strokeColor, strokeWidth, fillOpacity, segments, null, { customShapePadding: 0, customShapeViewBoxPadding: 0, renderedSize })
      : getTreeNodeShapeDataUri(shapeKey, fillColor, strokeColor, strokeWidth, fillOpacity);
    this.treeLeafShapeUriCache.set(cacheKey, dataUri);
    return dataUri;
  }

  private renderLeafNodeShapeOverlay(
    node: SVGElement,
    shapeKey: string,
    leafSize: number,
    fillColor: string,
    strokeColor: string,
    isSelected: boolean,
    fillOpacity: number,
    segments: any[] = []
  ): void {
    const parentNode = node.parentNode as SVGGElement | null;
    if (!parentNode) {
      return;
    }

    d3.select(parentNode).selectAll('svg.tidytree-node-shape-overlay').remove();

    const diameter = leafSize * 2;
    const strokeWidth = this.getLeafShapeStrokeWidth(shapeKey, isSelected);
    const overlayDiameter = diameter * getTreeNodeShapeScale(shapeKey);
    const overlayImageDiameter = overlayDiameter + 4;
    const shapeUri = this.getLeafShapeDataUri(shapeKey, fillColor, strokeColor, strokeWidth, fillOpacity, segments, overlayImageDiameter);
    const overlayOffset = overlayImageDiameter / 2;
    const overlaySelection = d3.select(parentNode)
      .selectAll<SVGImageElement, number>('image.tidytree-node-shape-overlay')
      .data([0]);

    overlaySelection
      .join(
        enter => enter
          .insert('image', 'text')
          .attr('class', 'tidytree-node-shape-overlay')
          .style('pointer-events', 'none'),
        update => update
      )
      .attr('x', -overlayOffset)
      .attr('y', -overlayOffset)
      .attr('width', overlayImageDiameter)
      .attr('height', overlayImageDiameter)
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .attr('href', shapeUri)
      .attr('xlink:href', shapeUri);
  }

  buildTree(newick): TidyTree {
    const tree: TidyTree = new TidyTree(
      newick ? newick : this.tree.data.clone(),
      this.getTreeOptions(),
      this.getTreeHandlers(),
    );
    return tree;
  }

  getTreeOptions = () => {
    const treeOpts = {
      parent: '#phylocanvas',
      layout: this.SelectedTreeLayoutVariable,
      mode: this.SelectedTreeModeVariable,
      type: this.SelectedTreeTypeVariable,
      leafNodes: this.SelectedLeafNodeShowVariable,
      branchNodes: this.SelectedBranchNodeSizeVariable,
      leafLabels: this.SelectedLeafLabelSizeVariable,
      branchLabels: this.SelectedBranchLabelSizeVariable,
      branchDistances: this.SelectedBranchDistanceSizeVariable,
      ruler: true,
      animation: parseFloat('0'),  // range 0-2000 in steps of 10
      margin: [10, 80, 50, 30] //CSS order: top, right, bottom, left
    };
    return treeOpts;
  }

  getTreeHandlers = () => {
    const handlers = {
      contextmenu: this.showContextMenu,
      showtooltip: this.showTooltip,
      hidetooltip: this.hideTooltip,
      select: this.clickHandler
    };
    return handlers;
  }

  ngOnInit() {
    let that = this;

    this.gtmService.pushTag({
      event: "page_view",
      page_location: "/phylogenetic",
      page_title: "Phylogenetic Tree View"
    });

    this.LeafLabelFieldList.push({ label: 'None', value: 'None' });
    this.commonService.session.data['nodeFields'].map((d, i) => {
      if (['seq', 'origin', '_diff', '_ambiguity', 'index'].includes(d)) return;
      this.visuals.phylogenetic.LeafLabelFieldList.push({
        label: this.visuals.phylogenetic.commonService.capitalize(d.replace('_', '')),
        value: d
        });
    });

    $(document).on("node-selected", function () {
      that.updateNodeColors();
    });


    this.goldenLayoutComponentResize()
    this.openTree();

    this.container.on('resize', () => {
      this.goldenLayoutComponentResize();
      this.openCenter()
    })
    this.container.on('hide', () => {
      this.viewActive = false;
      this.cdref.detectChanges();
    })
    this.container.on('show', () => {
      this.viewActive = true;
      this.cdref.detectChanges();
    })

    this.store.clusterUpdate$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      if (this.commonService.session.style.widgets['node-color-variable'] == 'cluster' || this.SelectedLeafLabelVariable == 'cluster' ) {
        this.styleTree();
      }
    })

    // Subscribe to style file applied event
    this.store.styleFileApplied$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.applyStyleFileSettings();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  goldenLayoutComponentResize() {
    $('#phylocanvas').height($('phylogeneticcomponent').height() - 19);
    $('#phylocanvas').width($('phylogeneticcomponent').width() - 1)
  }

  InitView() { // this function isn't called
    this.visuals.phylogenetic.IsDataAvailable = (
      this.visuals.phylogenetic.commonService.session.data.nodes.length === 0 ? false : true
    );

    //if (this.visuals.phylogenetic.IsDataAvailable === true && this.visuals.phylogenetic.zoom == null) {
      // d3.select('svg#network').exit().remove();
      // this.visuals.phylogenetic.svg = d3.select('svg#network').append('g');
    //}
  }

  openSettings() {
    this.visuals.phylogenetic.PhylogeneticTreeDialogSettings.setVisibility(true);
    // this.context.twoD.ShowStatistics = !this.context.twoD.Show2DSettingsPane;
  }


  openExport() {
    this.ShowPhylogeneticExportPane = true;

    this.isExportClosed = false;

  }

  openCenter() {
    const thisTree = this.commonService.visuals.phylogenetic.tree;
    thisTree.recenter()
      .redraw();
    this.styleTree();
  }

  openRefreshScreen() {

  }

  openSelectDataSetScreen() {

  }

  onTreeLayoutChange(event) {
    if (this.tree) {
      this.SelectedTreeLayoutVariable = event;
      if (event == 'horizontal') {
        this.commonService.session.style.widgets['tree-layout-horizontal'] = true;
        this.commonService.session.style.widgets['tree-layout-vertical'] = this.commonService.session.style.widgets['tree-layout-circular'] = false
      } else if (event == 'vertical') {
        this.commonService.session.style.widgets['tree-layout-vertical'] = true;
        this.commonService.session.style.widgets['tree-layout-horizontal'] = this.commonService.session.style.widgets['tree-layout-circular'] = false 
      } else if (event == 'circular') {
        this.commonService.session.style.widgets['tree-layout-circular'] = true;
        this.commonService.session.style.widgets['tree-layout-horizontal'] = this.commonService.session.style.widgets['tree-layout-vertical'] = false 
      }
      this.tree.setLayout(event);
      this.openCenter();
      this.styleTree();
    }
  }

  onTreeModeChange(event) {
    if (this.tree){
      this.SelectedTreeModeVariable = event;
      if (event == 'smooth') {
        this.commonService.session.style.widgets['tree-mode-smooth'] = true;
        this.commonService.session.style.widgets['tree-mode-square'] = this.commonService.session.style.widgets['tree-mode-straight'] = false
      } else if (event == 'square') {
        this.commonService.session.style.widgets['tree-mode-square'] = true;
        this.commonService.session.style.widgets['tree-mode-smooth'] = this.commonService.session.style.widgets['tree-mode-straight'] = false
      } else if (event == 'straight') {
        this.commonService.session.style.widgets['tree-mode-straight'] = true;
        this.commonService.session.style.widgets['tree-mode-smooth'] = this.commonService.session.style.widgets['tree-mode-square'] = false
      }
      this.tree.setMode(event);
      this.openCenter();
      this.styleTree();
    }
  }

  onTreeTypeChange(event) {
    this.SelectedTreeTypeVariable = event;
    this.commonService.session.style.widgets['tree-type'] = this.SelectedTreeTypeVariable;
    if (this.tree) {
      this.tree.setType(event);
      this.openCenter();
      this.styleTree();
    }
  }

  onLeafLabelVariableChange(event) {
    this.SelectedLeafLabelVariable = event;
    let labelVar = event;
    if (!this.tree || !labelVar) return;
    this.tree.eachLeafLabel(label => {
      d3.select(label).text(data => {
        let id = data.data.id;
        let node = this.commonService.session.data.nodes.find(node => node.id == id);
        if (node === undefined)
          node = this.commonService.session.data.nodes.find(d => d._id === data.data.id);
        return node[labelVar];
      }).attr('dx', 8)
    });
  }

  onLeafTooltipVariableChange(event) {
    this.SelectedLeafTooltipVariable = event;
    let labelVar = event;
    if (!this.tree || !labelVar || labelVar == 'None') return;
    this.tree.eachLeafNode((circle, data) => {
      let node = this.commonService.session.data.nodes.find(d => d.id === data.data.id);
      if (node === undefined)
        node = this.commonService.session.data.nodes.find(d => d._id === data.data.id);
      d3.select(circle)
        .attr('title', node[labelVar]);
    });
    this.styleTree();
  }

  onHorizontalStretchChange(event) {
    let cached = this.tree.animation;
    this.tree.setAnimation(0);
    this.tree.setHStretch(this.SelectedHorizontalStretchVariable);
    this.tree.setAnimation(cached);
    this.styleTree();
    this.settings['tree-horizontal-stretch'] = this.SelectedHorizontalStretchVariable 
  }

  onVerticalStretchChange(event) {
    let cached = this.tree.animation;
    this.tree.setAnimation(0);
    this.tree.setVStretch(this.SelectedVerticalStretchVariable);
    this.tree.setAnimation(cached);
    this.styleTree();
    this.settings['tree-vertical-stretch'] = this.SelectedVerticalStretchVariable
  }

  onBranchLabelShowChange(event) {
    this.SelectedBranchLabelShowVariable = event;
    this.tree.setBranchLabels(event);
    this.styleTree();
  }

  onBranchLabelSizeChange(event) {
    this.SelectedBranchLabelSizeVariable = event;
    this.styleTree();
  }

  onBranchDistanceShowChange(event) {
    this.SelectedBranchDistanceShowVariable = event;
    this.tree.setBranchDistances(event);
    this.styleTree();
    this.settings['tree-branch-distances-hide'] = !this.SelectedBranchDistanceShowVariable
  }

  onBranchDistanceSizeChange(event) {
    this.SelectedBranchDistanceSizeVariable = event;
    this.styleTree();
    this.settings['tree-branch-distance-size'] = this.SelectedBranchDistanceSizeVariable
  }

  onBranchNodeShowChange(event) {
    this.SelectedBranchNodeShowVariable = event;
    this.tree.setBranchNodes(event);
    this.styleTree();
    this.settings['tree-branch-nodes-show'] = this.SelectedBranchNodeShowVariable
  }

  onBranchNodeSizeChange(event) {
    this.SelectedBranchNodeSizeVariable = event;
    this.styleTree();
  }

  onBranchNodeLabelChange(event) {
    this.SelectedBranchLabelShowVariable
  }

  // onBranchTooltipShowChange(event) {
  //   this.SelectedBranchTooltipShowVariable = event;
  //   this.styleTree();
  // }

  onLeafLabelTooltipShowChange(event) {
    this.SelectedLeafTooltipShowVariable = event;
    this.styleTree();
    this.settings['tree-tooltip-show'] = this.SelectedLeafTooltipShowVariable
  }

  onLeafLabelShowChange(event) {
    this.SelectedLeafLabelShowVariable = event;
    this.tree.setLeafLabels(event);
    this.styleTree();
    this.settings['tree-leaf-label-show'] = this.SelectedLeafLabelShowVariable
  }

  showGlobalSettings(event?: MouseEvent) {
    this.DisplayGlobalSettingsDialogEvent.emit(createGlobalSettingsDialogRequest('Styling', event));
  }

  private ensureGlobalNodeShapeTableVisible(): void {
    const microbeTrace = this.visuals?.microbeTrace;
    const selectedNodeSymbolVariable = this.commonService.session.style.widgets['node-symbol-variable']
      ?? microbeTrace?.SelectedNodeSymbolVariable
      ?? 'None';
    const isDocked = microbeTrace?.isKeyTableDocked?.('node-shape') ?? false;
    const isTreeActive = this.commonService.activeTab === PhylogeneticComponent.componentTypeName;

    if (!microbeTrace
      || !this.SelectedLeafNodeUseGlobalShapesVariable
      || selectedNodeSymbolVariable === 'None'
      || (!isDocked && !isTreeActive)) {
      return;
    }

    microbeTrace.onNodeShapeByChanged(true, true, selectedNodeSymbolVariable);
  }

  onLeafNodeShowChange(event) {
    this.SelectedLeafNodeShowVariable = event;
    if (this.tree) {
      this.tree.setLeafNodes(this.SelectedLeafNodeShowVariable);
    }
    this.styleTree();
    this.settings['tree-leaf-node-show'] = this.SelectedLeafNodeShowVariable
  }

  onLeafNodeUseGlobalShapesChange(event) {
    this.SelectedLeafNodeUseGlobalShapesVariable = event;
    this.styleTree();
    this.settings['tree-leaf-node-use-global-shapes'] = this.SelectedLeafNodeUseGlobalShapesVariable
    if (this.SelectedLeafNodeUseGlobalShapesVariable) {
      this.ensureGlobalNodeShapeTableVisible();
    }
  }

  onLeafNodeSizeChange(event) {
    this.SelectedLeafNodeSize = event;
    this.styleTree();
    this.settings['tree-leaf-node-size'] = this.SelectedLeafNodeSize
  }

  onLeafNodeSizeVariableChange(event) {
    this.SelectedLeafNodeSizeVariable = event;
    this.styleTree();
    this.settings['tree-leaf-node-radius-variable'] = this.SelectedLeafNodeSizeVariable
  }

  onLeafLabelSizeChange(event) {
    this.SelectedLeafLabelSizeVariable = event;
    this.styleTree();
    this.settings['tree-leaf-label-size'] = this.SelectedLeafLabelSizeVariable
  }

  onBranchSizeChange(event) {
    this.SelectedBranchSizeVariable = event;
    this.styleTree();
  }

  onCloseExport() {
    this.isExportClosed = true;
  }

  updateNodeColors() {
    let variable = this.visuals.phylogenetic.commonService.session.style.widgets['node-color-variable'];
    const nodeColor = this.visuals.phylogenetic.commonService.session.style.widgets['node-color'];
    this.SelectedLeafNodeColorVariable = nodeColor;
    this.SelectedBranchNodeColorVariable = nodeColor;
    this.SelectedSelectedLeafNodeColorVariable = this.settings['selected-color'];
    this.styleTree();
    const selectedColor = this.visuals.phylogenetic.commonService.GlobalSettingsModel.SelectedColorVariable;
  }

  updateNodeShapes() {
    this.styleTree();
  }

  updateLinkColor() {
    const linkColor = this.visuals.phylogenetic.commonService.session.style.widgets['link-color'];
    this.SelectedLinkColorVariable = linkColor;
    this.styleTree();
  }

  private shouldExportNodeColorTable(): boolean {
    return this.commonService.session.style.widgets['node-color-variable'] !== 'None';
  }

  private shouldExportNodeShapeTable(): boolean {
    const useGlobalShapes = this.commonService.session.style.widgets['tree-leaf-node-use-global-shapes']
      ?? this.SelectedLeafNodeUseGlobalShapesVariable;
    return !!useGlobalShapes && this.commonService.session.style.widgets['node-symbol-variable'] !== 'None';
  }

  private getExportSvgContent(): string {
    const svgElement = document.querySelector('#phylocanvas svg') as HTMLElement | null;
    if (!svgElement) {
      return '';
    }

    const svgContent = this.exportService.unparseSVG(svgElement);
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgContent, 'image/svg+xml');
    const svgNode = doc.documentElement;
    const rect = svgElement.getBoundingClientRect();
    const width = Math.ceil(rect.width || parseFloat(svgNode.getAttribute('width')) || 0);
    const height = Math.ceil(rect.height || parseFloat(svgNode.getAttribute('height')) || 0);

    if (width > 0) {
      svgNode.setAttribute('width', `${width}`);
      svgNode.style.width = `${width}px`;
    }
    if (height > 0) {
      svgNode.setAttribute('height', `${height}`);
      svgNode.style.height = `${height}px`;
    }

    return new XMLSerializer().serializeToString(svgNode);
  }

  saveImage(event) {
    const exportOptions: ExportOptions = {
      filename: this.SelectedTreeImageFilenameVariable,
      filetype: this.SelectedNetworkExportFileTypeListVariable,
      scale: this.SelectedNetworkExportScaleVariable,
      quality: this.SelectedNetworkExportQualityVariable,
    };

    this.exportService.setExportOptions(exportOptions);

    const exportNodeTable = this.shouldExportNodeColorTable();
    const exportNodeShapeTable = this.shouldExportNodeShapeTable();
    const content = document.getElementById('phylocanvas') as HTMLElement | null;

    if (!content) {
      console.error('Phylogenetic export container not found');
      return;
    }

    if (exportNodeShapeTable) {
      this.ensureGlobalNodeShapeTableVisible();
    }

    if (this.SelectedNetworkExportFileTypeListVariable === 'svg') {
      const svgContent = this.getExportSvgContent();
      if (!svgContent) {
        console.error('Phylogenetic SVG element not found');
        return;
      }

      this.exportService.requestSVGExport([], svgContent, exportNodeTable, false, exportNodeShapeTable);
    } else {
      this.exportService.requestExport([content], exportNodeTable, false, exportNodeShapeTable);
    }

    this.ShowPhylogeneticExportPane = false;
    console.log('Export Success!')

  }

  saveNewickString(event) {
    const thisTree = this.commonService.visuals.phylogenetic.tree;
    const newickBlob = new Blob([thisTree.data.toNewick(false)], { type: 'text/plain;charset=utf-8' });
    saveAs(newickBlob, this.SelectedNewickStringFilenameVariable);
  }


  getContextLeftVal = (xPos) => {
    if (xPos - 175 < 0) {
      return xPos + 25;
    } else {
      return xPos - 175;
    }
  }

  getContextTopVal = (yPos) => {
    if (yPos > (this.svg.node().clientHeight - 125)) {
      return yPos - 125;
    } else {
      return yPos + 25;
    }
  }

  showContextMenu = (d) => {
    d3.event.preventDefault();
    this.hideTooltip();
    const tree = this.tree;
    const clickedNode = d?.[0];
    const isBranchNode = !!(clickedNode && clickedNode.children && clickedNode.children.length > 0);
    let [x, y] = this.getRelativeMousePosition();
    const leftVal = this.getContextLeftVal(x);
    const topVal = this.getContextTopVal(y);

    d3.select('#phylo-context-menu')
      .style('z-index', 1000)
      .style('display', 'block')
      .style('opacity', 1)
      .style('left', `${leftVal}px`)
      .style('top', `${topVal}px`);
    d3.select('#reroot').on('click', c => {
      tree.setData(d[0].data.reroot());
      this.hasTreeBeenModifiedFromOriginal = true;
      this.styleTree();
      this.hideContextMenu();
      this.cdref.detectChanges();
    });
    d3.select('#rotate').on('click', c => {
      tree.setData(d[0].data.rotate().getRoot());
      this.hasTreeBeenModifiedFromOriginal = true;
      this.styleTree();
      this.hideContextMenu();
      this.cdref.detectChanges();
    });
    d3.select('#flip').on('click', c => {
      tree.setData(d[0].data.flip().getRoot());
      this.hasTreeBeenModifiedFromOriginal = true;
      this.styleTree();
      this.hideContextMenu();
      this.cdref.detectChanges();
    });
    d3.select('#view-subtree')
      .style('display', isBranchNode ? 'block' : 'none')
      .on('click', c => {
        if (!isBranchNode) return;
        this.viewSubtree(d);
        this.hideContextMenu();
      });
    d3.select('#phylocanvas svg').on('click', c => {
      this.hideContextMenu();
    });
  }

  viewSubtree = (d) => {
    if (!this.tree) return;

    const clickedNode = d?.[0];
    const isBranchNode = !!(clickedNode && clickedNode.children && clickedNode.children.length > 0);
    if (!isBranchNode) return;

    const subtreeData = clickedNode.data?.clone ? clickedNode.data.clone() : clickedNode.data;
    // Normalize subtree root so weighted ruler starts at 0 for subtree view.
    if (subtreeData) {
      subtreeData.length = 0;
    }
    this.tree.setData(subtreeData);
    this.hasTreeBeenModifiedFromOriginal = true;
    this.styleTree();
    this.openCenter();
    this.cdref.detectChanges();
  }

  restoreFullTree = () => {
    if (!this.tree || !this.originalTreeData) return;

    const fullTreeData = this.originalTreeData.clone ? this.originalTreeData.clone() : this.originalTreeData;
    this.tree.setData(fullTreeData);
    this.hasTreeBeenModifiedFromOriginal = false;
    this.styleTree();
    this.openCenter();
    this.cdref.detectChanges();
  }

  hideContextMenu = () => {
    $('#phylo-context-menu').animate({ opacity: 0 }, 80, () => {
      $(this).css('z-index', -1);
    });
  }

  clickHandler = (d) => {
    // d is treated elsewhere as an array with [0].data.id
    const leafId = d?.[0]?.data?.id ?? d?.data?.id ?? d?.id;
    if (!leafId) return;
  
    const ctrl = (d3 as any).event?.ctrlKey === true;
  
    const nodes = this.commonService.session.data.nodes;
    const filtered = this.commonService.session.data.nodeFilteredValues;
  
    const setSelected = (id: string, selected: boolean) => {
      nodes.filter(n => n._id === id).forEach(n => (n.selected = selected));
      filtered.filter(n => n._id === id).forEach(n => (n.selected = selected));
    };
  
    if (ctrl) {
      const current = nodes.find(n => n._id === leafId)?.selected === true;
      setSelected(leafId, !current);
    } else {
      // single select
      nodes.forEach(n => setSelected(n._id, n._id === leafId));
    }
  
    // Broadcast to all views (Table/2D/Bubble/etc)
    $(document).trigger('node-selected');
  
    // If you want immediate visual feedback even before the event cycles:
    this.updateNodeColors();
  };
  

  showTooltip = (d) => {
    if (this.SelectedLeafTooltipShowVariable) {
      let htmlValue: any = this.SelectedLeafTooltipVariable;
      if (d[0].children && d[0].children.length > 0) {return}
      let [X, Y] = this.getRelativeMousePosition();

      // $('#tooltip').css({ top: d3.event.pageY - 28, left: d3.event.pageX + 8, position: 'absolute' });

      // const leftVal = X + 8;
      // const topVal = Y - 28;
      let node = this.commonService.session.data.nodes.find(n => n.id === d[0].data.id);
      if (node === undefined) {
        node = this.commonService.session.data.nodes.find(n => n._id === d[0].data.id);
        if (htmlValue === "id")
          htmlValue = "_id";
      }
      // Pre D3
      //const leftVal = (d3 as any).event.pageX - 18;
      //const topVal = (d3 as any).event.pageY - 8;
      d3.select('#phyloTooltip')
        .html(node[htmlValue])
        .style('position', 'absolute')
        .style('display', 'block')
        .style('left', `${X+10}px`)
        .style('top', `${Y+10}px`)
        .style('z-index', 1000)
        .transition().duration(100)
        .style('opacity', 1)
        .style('color', '#333333')
        .style('background', '#f5f5f5')
        .style('border', '1px solid #cccccc')
        .style('border-radius', '.25rem')
        .style('padding', '.25rem')
        ;
    }
  }

  hideTooltip = () => {
    const tooltip = d3.select('#phyloTooltip');
    tooltip
      .transition().duration(100)
      .style('opacity', 0)
      .on('end', () => tooltip.style('z-index', -1));
  }

  /**
   * @returns an array [X, Y] of the position of mouse relative to twodcomponent. Global position (i.e. d3.event.pageX) doesn't work for a dashboard
   */
  getRelativeMousePosition() {
    let rect = d3.select('phylogeneticcomponent').node().getBoundingClientRect();
    let X = d3.event.pageX - rect.left;
    let Y = d3.event.pageY - rect.top; 
    return [X, Y];
  }

  applyStyleFileSettings() {
  this.settings = this.commonService.session.style.widgets;

  // Layout & geometry
  const layout = this.settings['tree-layout-horizontal'] ? 'horizontal'
               : this.settings['tree-layout-vertical'] ? 'vertical'
               : this.settings['tree-layout-circular'] ? 'circular' : null;
  if (layout && layout != this.SelectedTreeLayoutVariable) {
      this.SelectedTreeLayoutVariable = layout;
      this.tree.setLayout(layout);
  }
  const mode   = this.settings['tree-mode-square'] ? 'square'
               : this.settings['tree-mode-smooth'] ? 'smooth'
               : this.settings['tree-mode-straight'] ? 'straight' : null;
  if (mode && mode != this.SelectedTreeModeVariable) {
      this.SelectedTreeModeVariable = mode;
      this.tree.setMode(mode);
  }

  if (this.settings['tree-type'] && this.settings['tree-type'] != this.SelectedTreeTypeVariable) {
    this.SelectedTreeTypeVariable = this.settings['tree-type'];
    this.tree.setType(this.settings['tree-type']);
  }

  if (this.settings['tree-horizontal-stretch'] != this.SelectedHorizontalStretchVariable) {
    this.SelectedHorizontalStretchVariable = this.settings['tree-horizontal-stretch']
    this.tree.setHStretch(this.settings['tree-horizontal-stretch']);
  }
  if (this.settings['tree-vertical-stretch'] != this.SelectedVerticalStretchVariable) {
    this.SelectedVerticalStretchVariable = this.settings['tree-vertical-stretch']
    this.tree.setVStretch(this.settings['tree-vertical-stretch']);
  }

  // Branches
  if (this.settings['tree-branch-distances-hide'] == this.SelectedBranchDistanceShowVariable) this.SelectedBranchDistanceShowVariable = !this.settings['tree-branch-distances-hide']
  if (this.settings['tree-branch-distance-size'] != this.SelectedBranchDistanceSizeVariable) this.SelectedBranchDistanceSizeVariable = this.settings['tree-branch-distance-size']
  if (this.settings['tree-branch-nodes-show'] != this.SelectedBranchNodeShowVariable) this.SelectedBranchNodeShowVariable = this.settings['tree-branch-nodes-show']

  // Leaf Labels
  if (this.settings['tree-leaf-label-show'] != this.SelectedLeafLabelShowVariable) this.SelectedLeafLabelShowVariable = this.settings['tree-leaf-label-show']
  if (this.settings['tree-leaf-label-size'] != this.SelectedLeafLabelSizeVariable) this.SelectedLeafLabelSizeVariable = this.settings['tree-leaf-label-size']

  // Leaf Nodes
  if (this.settings['tree-leaf-node-show'] != this.SelectedLeafNodeShowVariable) this.SelectedLeafNodeShowVariable = this.settings['tree-leaf-node-show']
  if ((this.settings['tree-leaf-node-use-global-shapes'] ?? false) != this.SelectedLeafNodeUseGlobalShapesVariable) this.SelectedLeafNodeUseGlobalShapesVariable = this.settings['tree-leaf-node-use-global-shapes'] ?? false
  if (this.settings['tree-leaf-node-size'] != this.SelectedLeafNodeSize) this.SelectedLeafNodeSize = this.settings['tree-leaf-node-size']
  if (this.settings['tree-leaf-node-radius-variable'] != this.SelectedLeafNodeSizeVariable) this.SelectedLeafNodeSizeVariable = this.settings['tree-leaf-node-radius-variable']

  if(this.settings['tree-tooltip-show'] != this.SelectedLeafTooltipShowVariable) this.SelectedLeafTooltipShowVariable = this.settings['tree-tooltip-show']

  // Colors
  if (this.settings['node-color']) {
    this.SelectedLeafNodeColorVariable = this.settings['node-color'];
    this.SelectedBranchNodeColorVariable = this.settings['node-color'];
  }
  if (this.settings['selected-color']) {
    this.SelectedSelectedLeafNodeColorVariable = this.settings['selected-color'];
  }
  if (this.settings['link-color']) {
    this.SelectedLinkColorVariable = this.settings['link-color'];
  }

  // Final redraw
  this.styleTree();
  if (this.SelectedLeafNodeUseGlobalShapesVariable) {
    this.ensureGlobalNodeShapeTableVisible();
  }
  this.openCenter()
}

  updateVisualization() { console.warn('updatevisualization')}
  onRecallSession() { console.warn('recallsession')}
  onLoadNewData() { console.warn('loadnewdata')}
  onFilterDataChange() { console.warn('filterdatachange')} 

}

export namespace PhylogeneticComponent {
  export const componentTypeName = 'Phylogenetic Tree';
}
