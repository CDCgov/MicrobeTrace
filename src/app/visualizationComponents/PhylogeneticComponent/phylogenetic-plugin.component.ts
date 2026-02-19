import {
  Injector, Component, Output, EventEmitter, OnInit,
  ElementRef, ChangeDetectorRef, Inject, OnDestroy
} from '@angular/core';
import { EventManager } from '@angular/platform-browser';
import { CommonService } from '@app/contactTraceCommonServices/common.service';
import { saveAs } from 'file-saver';
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
//import { runInThisContext } from 'vm';
//import { MatHint } from '@angular/material/form-field';
import { ExportService } from '@app/contactTraceCommonServices/export.service';
import { MicobeTraceNextPluginEvents } from '../../helperClasses/interfaces';

import { throws } from 'assert';
import { Subject, takeUntil } from 'rxjs';
import { CommonStoreService } from '@app/contactTraceCommonServices/common-store.services';

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
  minNodeWidth: number = 5;
  maxNodeWidth: number = 15;
  nodeMid: number = 1;
  debugMode = false;



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
  SelectedBranchLabelShowVariable: false = false;
  SelectedBranchDistanceShowVariable = !(this.settings['tree-branch-distances-hide'] ?? true); // inverse of its widget; defaults to false
  SelectedBranchDistanceSizeVariable = this.settings['tree-branch-distance-size'] ?? 12;
  //SelectedBranchTooltipShowVariable = false;

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

  //ContextSelectedNodeAttributes: { attribute: string, value: string }[] = [];
  tree: TidyTree = null;

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
        //this.mergeNodeData();
        this.hideTooltip();
        this.styleTree();
      //});
    }
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
      .style('stroke-width', isSelected ? '3px' : '1px');

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

  // onBranchLabelShowChange(event) {
  //   this.SelectedBranchLabelShowVariable = event;
  //   this.tree.setBranchLabels(event);
  //   this.styleTree();
  // }

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

  showGlobalSettings() {
    this.DisplayGlobalSettingsDialogEvent.emit('Styling');
  }

  onLeafNodeShowChange(event) {
    this.SelectedLeafNodeShowVariable = event;
    this.tree.setLeafNodes(this.SelectedLeafNodeShowVariable);
    this.settings['tree-leaf-node-show'] = this.SelectedLeafNodeShowVariable
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

  updateLinkColor() {
    const linkColor = this.visuals.phylogenetic.commonService.session.style.widgets['link-color'];
    this.SelectedLinkColorVariable = linkColor;
    this.styleTree();
  }

  saveImage(event) {
    const thisTree = this.commonService.visuals.phylogenetic.tree;
    const fileName = this.SelectedTreeImageFilenameVariable;
    const treeId = 'phylocanvas';
    const exportImageType = this.SelectedNetworkExportFileTypeListVariable;
    const content = document.getElementById(treeId);
    if (exportImageType === 'png') {
      domToImage.toPng(content, {backgroundColor: '#ffffff'}).then(
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
    d3.select('#phylocanvas svg').on('click', c => {
      this.hideContextMenu();
    });
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
