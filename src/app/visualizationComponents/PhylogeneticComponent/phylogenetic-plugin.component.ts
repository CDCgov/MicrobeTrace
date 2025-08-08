import {
  Injector, Component, Output, EventEmitter, OnInit,
  ElementRef, ChangeDetectorRef, Inject, OnDestroy
} from '@angular/core';
import { EventManager } from '@angular/platform-browser';
import { CommonService } from '@app/contactTraceCommonServices/common.service';
import * as saveAs from 'file-saver';
import * as domToImage from 'html-to-image';
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
import { runInThisContext } from 'vm';
import { MatHint } from '@angular/material/form-field';
import { ExportService } from '@app/contactTraceCommonServices/export.service';
import { throws } from 'assert';
import { Subject, takeUntil } from 'rxjs';
import { CommonStoreService } from '@app/contactTraceCommonServices/common-store.services';


/**
 * @title PhylogeneticComponent
 */
@Component({
  selector: 'PhylogeneticComponent',
  templateUrl: './phylogenetic-plugin.component.html',
  styleUrls: ['./phylogenetic-plugin.component.scss']
})
export class PhylogeneticComponent extends BaseComponentDirective implements OnInit, OnDestroy {

  @Output() DisplayGlobalSettingsDialogEvent = new EventEmitter();
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
  nodeMid: number = 1;
  debugMode = false;



  // Tree Tab
  TreeLayouts: object = [
    { label: 'Horizontal', value: 'horizontal' },
    { label: 'Vertical', value: 'vertical' },
    { label: 'Circular', value: 'circular' },
  ];
  SelectedTreeLayoutVariable = 'horizontal';
  TreeModes: object = [
    { label: 'Smooth', value: 'smooth' },
    { label: 'Square', value: 'square' },
    { label: 'Straight', value: 'straight' },
  ];
  SelectedTreeModeVariable = 'square';
  TreeTypes: object = [
    { label: 'Weighted', value: 'weighted' },
    { label: 'Unweighted (Tree)', value: 'tree' },
    { label: 'Dendrogram', value: 'dendrogram' },
  ];
  SelectedTreeTypeVariable = 'weighted';  // 'weighted';
  SelectedVerticalStretchVariable = 1;
  SelectedHorizontalStretchVariable = 1;


  // Leaves Tab
  SelectedLeafLabelShowVariable = true;
  SelectedLeafLabelVariable = '_id';
  LeafLabelFieldList: object[] = [];
  SelectedLeafLabelSizeVariable = 12;
  SelectedLeafTooltipShowVariable = true;
  SelectedLeafTooltipVariable = 'id';
  LeafTooltipFieldList: object[] = [];
  SelectedLeafNodeShowVariable = true;
  SelectedLeafNodeSizeVariable: string = 'None';
  SelectedLeafNodeSize: number = 5;
  SelectedLeafNodeColorVariable = this.settings['node-color'];
  SelectedSelectedLeafNodeColorVariable = this.settings['selected-color'];

  // Branch Tab
  SelectedBranchNodeShowVariable = false;
  SelectedBranchNodeSizeVariable = 5;
  SelectedBranchNodeColorVariable = this.settings['node-color'];
  SelectedBranchSizeVariable = 3;
  SelectedBranchLabelSizeVariable = 12;
  SelectedLinkColorVariable = this.settings['link-color'];
  SelectedBranchLabelShowVariable = false;
  SelectedBranchDistanceShowVariable = false;
  SelectedBranchDistanceSizeVariable = 12;
  SelectedBranchTooltipShowVariable = false;

  hideShowOptions: object = [
    { label: 'Hide', value: false },
    { label: 'Show', value: true }
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

  PhylogeneticTreeExportDialogSettings: DialogSettings = new DialogSettings('#phylotree-settings-pane', false);

  ContextSelectedNodeAttributes: { attribute: string, value: string }[] = [];
  tree: any = null;

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
      this.mergeNodeData();
      this.hideTooltip();
      this.styleTree();
    } else {
      const newickString = await this.commonService.computeTree();
      console.log(newickString);
      //newickString.then((x) => {
        const tree = this.buildTree(newickString);
        this.tree = tree;
        this.commonService.visuals.phylogenetic.tree = tree;
        this.mergeNodeData();
        this.hideTooltip();
        this.styleTree();
      //});
    }
    // d3.select('svg#network').exit().remove();
    // this.visuals.phylogenetic.svg = d3.select('svg#network').append('g');

    this.LeafLabelFieldList.push({ label: 'None', value: 'None' });
    console.log("getting node fields")
    this.commonService.session.data['nodeFields'].map((d, i) => {

      this.visuals.phylogenetic.LeafLabelFieldList.push(
        {
          label: this.visuals.phylogenetic.commonService.capitalize(d.replace('_', '')),
          value: d
        });
    });
    console.log(this.visuals.phylogenetic.LeafLabelFieldList);

    // }
  }

  mergeNodeData(): void {
    let data = this.commonService.session.data.nodes;
    console.log(this.tree.data);
    let leafNodes = this.tree.data.getLeaves();
  }

  styleTree = () => {
    this.svg = d3.select('#tidytree');
    let nodes = this.visuals.phylogenetic.commonService.session.data;
    nodes = this.svg.select('g.nodes').selectAll('g').data(nodes, d => d.id)
      .join(
        enter => {
          const g = enter.append('g')
            .attr('tabindex', '0')
            .on('mouseenter focusin', (x) => this.showTooltip(x))
            .on('mouseout focusout', (x) => this.hideTooltip())
            .on('contextmenu', (x) => this.showContextMenu(x))
            .on('click', (x) => this.clickHandler(x))
            .on('keydown', n => {
              if ((d3 as any).event.code === 'Space') this.clickHandler(n);
              if ((d3 as any).event.shiftKey && (d3 as any).event.key === 'F10') this.showContextMenu(n);
            });
          g.append('path')
            .style('stroke', 'black')
            .style('stroke-width', '2px');
          g.append('text')
            .attr('dy', 5)
            .attr('dx', 8);
          return g;
        }
      );
    this.tree.setBranchLabels(this.SelectedBranchLabelShowVariable);
    this.tree.eachBranchLabel(this.styleBranchLabel);
    this.tree.setBranchNodes(this.SelectedBranchNodeShowVariable);
    this.tree.eachBranchNode(this.styleBranchNode);
    this.tree.setBranchDistances(this.SelectedBranchDistanceShowVariable);
    this.tree.eachBranchDistance(this.styleBranchDistance);
    this.tree.setLeafNodes(this.SelectedLeafNodeSizeVariable);
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
    let maxWidth = 20;
    let minWidth = this.SelectedLeafNodeSize;


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
        .range([minWidth, maxWidth]);
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
    let nodes = this.visuals.phylogenetic.commonService.session.data.nodes;
    let leafSize: number;
    const variable = this.visuals.phylogenetic.commonService.session.style.widgets['node-color-variable'];
    leafSize = this.getLeafSize(data.data.id, this.SelectedLeafNodeSizeVariable);
    const selectedColor = this.SelectedSelectedLeafNodeColorVariable;
    const nodeData = nodes.find(n => n._id === data.data.id);
    const isSelected = !!(nodeData && nodeData.selected);
    d3.select(node)
      .attr('r', leafSize)
      .style('stroke', isSelected ? selectedColor : '#000000')
      .style('stroke-width', isSelected ? '2px' : '1px');

    if (variable === 'None') {
      d3.select(node).style('fill', this.SelectedLeafNodeColorVariable);
    } else {
      d3.select(node).style('fill', d => {
        const node_values = nodes.filter(m => m._id === (d as any).data.id);
        const node_color = this.visuals.phylogenetic.commonService.temp.style.nodeColorMap(node_values[0][variable]);
        return node_color;
      });
      // d3.select(node).style('opacity', d => this.visuals.phylogenetic.commonService.temp.style.nodeAlphaMap(d[variable]));

      //  this.context.microbeTrace.generateNodeColorTable("#node-color-table-bottom", false);
    }


  }

  buildTree = (newick) => {
    const tree = new TidyTree(
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
      margin: [10, 10, 70, 30]
    };
    return treeOpts;
  }

  getTreeHandlers = () => {
    const handlers = {
      contextmenu: this.showContextMenu,
      showtooltip: this.showTooltip,
      hidetooltip: this.hideTooltip
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

    $(document).on("node-selected", function () {
      that.updateNodeColors();
    });


    this.goldenLayoutComponentResize()
    this.openTree();

    this.container.on('resize', () => { this.goldenLayoutComponentResize() })
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
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  goldenLayoutComponentResize() {
    $('#phylocanvas').height($('phylogeneticcomponent').height() - 19);
    $('#phylocanvas').width($('phylogeneticcomponent').width() - 1)
  }

  InitView() {
    this.visuals.phylogenetic.IsDataAvailable = (
      this.visuals.phylogenetic.commonService.session.data.nodes.length === 0 ? false : true
    );

    if (this.visuals.phylogenetic.IsDataAvailable === true && this.visuals.phylogenetic.zoom == null) {
      // d3.select('svg#network').exit().remove();
      // this.visuals.phylogenetic.svg = d3.select('svg#network').append('g');

      this.LeafLabelFieldList.push({ label: 'None', value: 'None' });
      console.log("getting node fields")
      this.commonService.session.data['nodeFields'].map((d, i) => {

        this.visuals.phylogenetic.LeafLabelFieldList.push(
          {
            label: this.visuals.phylogenetic.commonService.capitalize(d.replace('_', '')),
            value: d
          });
      });
      console.log(this.visuals.phylogenetic.LeafLabelFieldList);
    }
  }

  openSettings() {
    this.visuals.phylogenetic.PhylogeneticTreeExportDialogSettings.setVisibility(true);
    // this.context.twoD.ShowStatistics = !this.context.twoD.Show2DSettingsPane;
  }


  openExport() {
    this.ShowPhylogeneticExportPane = true;

    this.visuals.microbeTrace.GlobalSettingsDialogSettings.setStateBeforeExport();
    this.visuals.microbeTrace.GlobalSettingsLinkColorDialogSettings.setStateBeforeExport();
    this.visuals.microbeTrace.GlobalSettingsNodeColorDialogSettings.setStateBeforeExport();
    this.isExportClosed = false;

  }

  openCenter() {
    const thisTree = this.commonService.visuals.phylogenetic.tree;
    thisTree.recenter()
      .redraw();
    this.styleTree();
  }

  //openPinAllNodes() {


  //}

  openRefreshScreen() {

  }

  openSelectDataSetScreen() {

  }

  onTreeLayoutChange(event) {
    if (this.tree) {
      this.SelectedTreeLayoutVariable = event;
      this.tree.setLayout(event);
      this.openCenter();
      this.styleTree();
    }
  }

  onTreeModeChange(event) {
    if (this.tree){
      this.SelectedTreeModeVariable = event;
      this.tree.setMode(event);
      this.openCenter();
      this.styleTree();
    }
  }

  onTreeTypeChange(event) {
    this.SelectedTreeTypeVariable = event;
    this.tree.setType(event);
    this.openCenter();
    this.styleTree();
  }

  onLeafLabelVariableChange(event) {
    this.SelectedLeafLabelVariable = event;
    let labelVar = event;
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
  }

  onVerticalStretchChange(event) {
    let cached = this.tree.animation;
    this.tree.setAnimation(0);
    this.tree.setVStretch(this.SelectedVerticalStretchVariable);
    this.tree.setAnimation(cached);
    this.styleTree();
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
  }

  onBranchDistanceSizeChange(event) {
    this.SelectedBranchDistanceSizeVariable = event;
    this.styleTree();
  }

  onBranchNodeShowChange(event) {
    this.SelectedBranchNodeShowVariable = event;
    this.tree.setBranchNodes(event);
    this.styleTree();
  }

  onBranchNodeSizeChange(event) {
    this.SelectedBranchNodeSizeVariable = event;
    this.styleTree();
  }

  onBranchTooltipShowChange(event) {
    this.SelectedBranchTooltipShowVariable = event;
    this.styleTree();
  }

  onLeafLabelTooltipShowChange(event) {
    this.SelectedLeafTooltipShowVariable = event;
    this.styleTree();
  }

  onLeafLabelShowChange(event) {
    this.SelectedLeafLabelShowVariable = event;
    this.tree.setLeafLabels(event);
    this.styleTree();
  }

  showGlobalSettings() {
    this.DisplayGlobalSettingsDialogEvent.emit('Styling');
  }

  onLeafNodeSizeChange(event) {
    this.SelectedLeafNodeSize = event;
    this.styleTree();
  }

  onLeafNodeSizeVariableChange(event) {
    this.SelectedLeafNodeSizeVariable = event;
    this.styleTree();
  }

  onLeafLabelSizeChange(event) {
    this.SelectedLeafLabelSizeVariable = event;
    this.styleTree();
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
    this.styleTree();
    const selectedColor = this.visuals.phylogenetic.commonService.GlobalSettingsModel.SelectedColorVariable;
  }

  updateLinkColor() {
    const linkColor = this.visuals.phylogenetic.commonService.session.style.widgets['link-color'];
    this.SelectedLinkColorVariable = linkColor;
    this.styleTree();
  }

  saveImage(event) {
    const thisTree = this.commonService.visuals.phylogenetic.tree;
    const fileName = this.SelectedTreeImageFilenameVariable;
    const treeId = 'tidytree';
    const exportImageType = this.SelectedNetworkExportFileTypeListVariable;
    const content = document.getElementById(treeId);
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
      const svgContent = this.exportService.unparseSVG(content);
      const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
      saveAs(blob, fileName);
    }

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
    if (yPos > (this.svg.clientHeight - 125)) {
      return yPos - 125;
    } else {
      return yPos + 25;
    }
  }

  showContextMenu = (d) => {
    // d3.event.preventDefault();
    this.hideTooltip();
    const tree = this.tree;
    const leftVal = this.getContextLeftVal((d3 as any).event.pageX);
    const topVal = this.getContextTopVal((d3 as any).event.pageY);

    d3.select('#phylo-context-menu')
      .style('z-index', 1000)
      .style('display', 'block')
      .style('opacity', 1)
      .style('left', `${leftVal}px`)
      .style('top', `${topVal}px`);
    d3.select('#reroot').on('click', c => {
      tree.setData(d[0].data.reroot());
      this.styleTree();
      this.hideContextMenu();
    });
    d3.select('#rotate').on('click', c => {
      tree.setData(d[0].data.rotate().getRoot());
      this.styleTree();
      this.hideContextMenu();
    });
    d3.select('#flip').on('click', c => {
      tree.setData(d[0].data.flip().getRoot());
      this.styleTree();
      this.hideContextMenu();
    });
    d3.select('#tidytree').on('click', c => {
      this.hideContextMenu();
    });
  }

  hideContextMenu = () => {
    $('#phylo-context-menu').animate({ opacity: 0 }, 80, () => {
      $(this).css('z-index', -1);
    });
  }

  clickHandler = (n) => {
    if ((d3 as any).event.ctrlKey) {
      this.visuals.phylogenetic.commonService.session.data.nodes.find(node => node._id === n._id).selected = !n.selected;
    } else {
      this.visuals.phylogenetic.commonService.session.data.nodes.forEach(node => {
        if (node._id === n._id) {
          node.selected = !n.selected;
        } else {
          node.selected = false;
        }
      });
    }
  }

  showTooltip = (d) => {
    if (this.SelectedLeafTooltipShowVariable) {
      let htmlValue: any = this.SelectedLeafTooltipVariable;

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
      console.log(node);
      // Pre D3
      const leftVal = (d3 as any).event.pageX - 18;
      const topVal = (d3 as any).event.pageY - 8;
      console.log(topVal + " " +  leftVal);
      d3.select('#phyloTooltip')
        .html(node[htmlValue])
        .style('position', 'absolute')
        .style('display', 'block')
        .style('left', `${leftVal}px`)
        .style('top', `${topVal}px`)
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
    // let rect = d3.select('phylogeneticcomponent').node().getBoundingClientRect();
    // let X = d3.event.pageX - rect.left;
    // let Y = d3.event.pageY - rect.top; 
    return [0, 0];
  }

}

export namespace PhylogeneticComponent {
  export const componentTypeName = 'Phylogenetic Tree';
}
