/* eslint-disable @typescript-eslint/no-inferrable-types */
import { Injector, Component, Output, OnChanges, SimpleChange, EventEmitter, OnInit,
  ViewChild, ElementRef, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { AppComponentBase } from '@shared/common/app-component-base';
import { EventManager, DOCUMENT } from '@angular/platform-browser';
import { CommonService } from '../../contactTraceCommonServices/common.service';
import Phylocanvas from 'phylocanvas';
import contextMenu from 'phylocanvas-plugin-context-menu';
import scalebar from 'phylocanvas-plugin-scalebar';
import history from 'phylocanvas-plugin-history';
import * as FigTree from '../../../../vendor/figtree.esm.js';
import * as ClipboardJS from 'clipboard';
import * as saveAs from 'file-saver';
import * as domToImage from 'dom-to-image-more';
import * as d3 from 'd3';
import { SelectItem } from 'primeng/api';
import { DialogSettings } from '../../helperClasses/dialogSettings';
import { MicobeTraceNextPluginEvents } from '../../helperClasses/interfaces';
import * as _ from 'lodash';
import { MicrobeTraceNextVisuals } from '../../microbe-trace-next-plugin-visuals';
import { CustomShapes } from '@app/helperClasses/customShapes';


/**
 * @title PhylogeneticComponent
 */
@Component({
  selector: 'PhylogeneticComponent',
  templateUrl: './phylogenetic-plugin.component.html',
})
export class PhylogeneticComponent extends AppComponentBase implements OnInit {

  @Output() DisplayGlobalSettingsDialogEvent = new EventEmitter();
  svgStyle: {} = {
    height: '0px',
    width: '1000px'
  };

  private customShapes: CustomShapes = new CustomShapes();

  ShowNetworkAttributes = false;
  ShowStatistics = false;
  ShowPhylogeneticExportPane = false;
  ShowPhylogeneticSettingsPane = false;
  IsDataAvailable = false;
  svg: any = null;
  settings: any = this.commonService.session.style.widgets;
  halfWidth: any = null;
  halfHeight: any = null;
  transform: any = null;
  force: any = null;
  radToDeg: any = (180 / Math.PI);
  selected: any = null;
  multidrag = false;
  clipboard = new ClipboardJS('#copyID, #copySeq');
  zoom: any = null;
  brush: any = null;
  treeStyle: any = null;
  treeStrings: string[] = [];
  FieldList: SelectItem[] = [];
  ToolTipFieldList: SelectItem[] = [];


  // Tree Tab
  TreeLayouts: any = [
    { label: 'Rectangular', value: 'rectangular' },
    { label: 'Radial', value: 'radial' },
    { label: 'Circular', value: 'circular' },
    { label: 'Diagonal', value: 'diagonal' },
    { label: 'Hierarchical', value: 'hierarchical' },
  ];
  SelectedTreeLayoutVariable = 'rectangular';

  // Leaves Tab
  SelectedLeafLabelShowVariable = 'Show';
  SelectedLeafLabelVariable = 'None';
  SelectedLeafLabelSizeVariable = 20;
  // SelectedLeafLabelSizeVariable: number = 8;
  LeafShapes: any = [
    { label: 'Circle', value: 'circle' },
    { label: 'Triangle', value: 'triangle' },
    { label: 'Square', value: 'square' },
    { label: 'Star', value: 'star' },
  ];
  SelectedLeafShapeVariable = 'circle';
  SelectedLeafSizeVariable = 15;
  // SelectedLeafSizeVariable: number = 5;
  SelectedNodeColorVariable = '#1f77b4';

  // Branch Tab
  SelectedBranchLabelShowVariable = 'Hide';
  SelectedBranchTooltipShowVariable = 'Show';
  SelectedLinkSizeVariable = 1;

  private isExportClosed = false;
  public isExporting = false;

  hideShowOptions: any = [
    { label: 'Hide', value: 'Hide' },
    { label: 'Show', value: 'Show' }
  ];

  // Export Settings
  SelectedTreeImageFilenameVariable = 'default_tree';
  SelectedNewickStringFilenameVariable = 'default_tree.nwk';

  NetworkExportFileTypeList: any = [
    { label: 'png', value: 'png' },
    { label: 'jpeg', value: 'jpeg' },
    { label: 'svg', value: 'svg' }
  ];

  SelectedNetworkExportFileTypeListVariable = 'png';
  SelectedNetworkExportScaleVariable: any = 1;
  SelectedNetworkExportQualityVariable: any = 0.92;
  CalculatedResolutionWidth: any = 1918;
  CalculatedResolutionHeight: any = 909;
  CalculatedResolution: any = ((this.CalculatedResolutionWidth * this.SelectedNetworkExportScaleVariable) + ' x ' + (
    this.CalculatedResolutionHeight * this.SelectedNetworkExportScaleVariable) + 'px');


  ShowAdvancedExport = true;

  PhylogeneticTreeExportDialogSettings: DialogSettings = new DialogSettings('#phylotree-settings-pane', false);

  ContextSelectedNodeAttributes: {attribute: string, value: string}[] = [];
  tree: any = null;

  private visuals: MicrobeTraceNextVisuals;


  constructor(injector: Injector,
    private eventManager: EventManager,
    public commonService: CommonService,
    private cdref: ChangeDetectorRef) {

    super(injector);

    this.visuals = commonService.visuals;
    this.commonService.visuals.phylogenetic = this;
  }

  /**
   * Creates a tree when the view is opened
   * @return {} a Phylocanvas tree object
   */
  openTree() {
    /**
    Phylocanvas.plugin(contextMenu);
    Phylocanvas.plugin(scalebar);
    Phylocanvas.plugin(history);
    */
    // Call the function that makes a Newick string from the nodes and edges
    const newickString = this.commonService.computeTree();
    newickString.then((x) => {
      this.commonService.visuals.phylogenetic.treeStrings.push(x);

      const tree = FigTree.Tree.parseNewick(x);
      tree.annotateNode(tree.root, {root: true});
      const treeSVG = document.getElementById('phylo_svg');
      console.log(tree.annotations);
      const phyCanv = document.querySelector('#phylocanvas');
      const canvHeight = this.CalculatedResolutionHeight; // phyCanv.clientHeight * 1.5;
      const canvWidth = this.CalculatedResolutionHeight; // phyCanv.clientWidth;
      const settings = {height: '750px', width: '1100px'};
      const figTree = this.initializeTree(treeSVG, tree);
      this.commonService.visuals.phylogenetic.tree = figTree;
      this.updateStyles();

      // this.makeTreeFromNewick(x);
    });
  }

  /**
   * Initializes the tree object with default values
   * @return {} FigTree Tree Object
   */
  initializeTree(treeSVG: HTMLElement, tree: {}) {
      const margins = { top: 10, bottom: 60, left: 10, right: 150};
      const branchSettings = FigTree.branch().hilightOnHover().reRootOnClick().curve(d3.curveStepBefore);
      const figTree = new FigTree.FigTree(treeSVG, margins, tree) // , settings)
        .layout(FigTree.rectangularLayout)
        .nodes(
          FigTree.circle()
          .attr('r', 5)
          .hilightOnHover(10)
          .rotateOnClick(),
          FigTree.tipLabel(d => d.name),
          FigTree.internalNodeLabel(d => d.label)

        )
        .nodeBackgrounds(
          FigTree.circle()
          .attr('r', 7)
        )
        .branches(branchSettings);
      return figTree;
  }


  /**
   * Update the styles for the tree object
   */
  updateStyles() {
    const phyloSVG = document.getElementById('phylo_svg');
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    phyloSVG.appendChild(style);
    style.type = 'text/css';
    const linkColor = this.visuals.phylogenetic.commonService.session.style.widgets['link-color'];
    this.commonService.visuals.phylogenetic.tree.branchColour = linkColor;
    const nodeColor = this.visuals.phylogenetic.commonService.session.style.widgets['node-color'];
    this.commonService.visuals.phylogenetic.tree.branchColour = linkColor;
    let styleString = `.branch \{ stroke-width: 2; \}\n .branch.hovered \{ stroke-width: 4; \}\n .branch-path \{ stroke: ${linkColor};\}\n`;
    this.SelectedNodeColorVariable = nodeColor;
    styleString = `${styleString} .node-shape \{ fill: ${nodeColor}; stroke: ${nodeColor}; \}\n`;
    const selectedColor = this.visuals.phylogenetic.commonService.GlobalSettingsModel.SelectedColorVariable;
    this.commonService.visuals.phylogenetic.tree.selectedColour = selectedColor;
    styleString = `${styleString} .node-shape.hovered \{ fill: ${selectedColor}; stroke: ${selectedColor}; \}\n`;
    style.innerHTML = styleString;

  }

  /**
   * Gets an object with the current selections for tree styling
   * @return {} tree styling object
   */
  getTreeStyle() {
    return { labelStyle: {
      textSize: this.SelectedLeafLabelSizeVariable
    }, leafStyle: {
      fillStyle: this.SelectedNodeColorVariable,
      linewidth: 0,
      strokeStyle: this.SelectedNodeColorVariable
    }
    };
  }

  /**
   * Create a new tree using the provided node as the new root
   */
  rerootTree(branch) {
    const styling: object = this.getTreeStyle();
    const originalTree: string = branch.tree.exportNwk();
    const figtreeTree: any = FigTree.Tree.parseNewick(originalTree);
    const newNode: any = figtreeTree.getNode(figtreeTree.nodeList[10].id);
    const newTree: any = figtreeTree.reroot(newNode);
    const newTreeStr: string = figtreeTree.toNewick();
    console.log(newTreeStr);
    branch.tree.load(newTreeStr);
    this.commonService.visuals.phylogenetic.treeStrings.push(newTreeStr);
    branch.tree.leaves.forEach( (y) => y.setDisplay(styling));
  }


  resetTree(branch) {
    console.log(this.commonService.visuals.phylogenetic.tree);
    branch.tree.load(branch.tree.originalTree);
  }

  buildBranchMenu() {
    console.log('Called fn, making menu items');
    const menuItems = [
      [ {
        text: 'Collapse/Expand Subtree',
        handler(branch) {
          branch.toggleCollapsed();
          branch.tree.draw(); // some browsers do not fire mousemove after clicking
        },
      }, {
        text: 'Invert Subtree',
        handler: 'rotate',
      }, {
        text: 'Reroot Tree',
        handler: this.rerootTree,
      } ],
      [ {
        text: 'Redraw Subtree',
        handler: 'redrawTreeFromBranch',
      } ],
      [ {
        text: 'Export Subtree Leaf Labels',
        element: contextMenu.createLeafLabelsLink,
      }, {
        text: 'Export Subtree as Newick File',
        element: contextMenu.createNewickLink,
      } ],
      [ {
        text: 'Reset the tree to the original string',
        handler: this.resetTree,
      } ],
    ];
    return menuItems;
  }



  ngOnInit() {
    this.openTree();

  }

  InitView() {
    this.visuals.phylogenetic.IsDataAvailable = (
      this.visuals.phylogenetic.commonService.session.data.nodes.length === 0 ? false : true
    );

    if (this.visuals.phylogenetic.IsDataAvailable === true && this.visuals.phylogenetic.zoom == null) {

      this.visuals.phylogenetic.FieldList = [];

      this.visuals.phylogenetic.FieldList.push({ label: 'None', value: 'None' });
      this.visuals.phylogenetic.commonService.session.data['nodeFields'].map((d, i) => {

        this.visuals.phylogenetic.FieldList.push(
          {
            label: this.visuals.phylogenetic.commonService.capitalize(d.replace('_', '')),
            value: d
          });
      });
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
    thisTree.fitInPanel(thisTree.leaves);
    thisTree.draw();
  }

  openPinAllNodes() {


  }

  openRefreshScreen() {

  }

  openSelectDataSetScreen() {

  }

  onTreeLayoutChange(event) {
    this.commonService.visuals.phylogenetic.tree.setTreeType(event);
  }

  onLeafLabelShowChange(event) {
    this.SelectedLeafLabelShowVariable = event;
    if (event === 'Hide') {
      this.commonService.visuals.phylogenetic.tree.showLabels = false;
    } else if (event === 'Show') {
      this.commonService.visuals.phylogenetic.tree.showLabels = true;
    }
    this.commonService.visuals.phylogenetic.tree.draw();
  }

  onLeafShapeVariableChange(event) {
    const shapeConfig = { shape: event };
    this.updateLeaves(shapeConfig);
  }

  onBranchLabelShowChange(event) {
    this.SelectedBranchLabelShowVariable = event;
    if (event === 'Hide') {
      this.commonService.visuals.phylogenetic.tree.showBranchLengthLabels = false;
    } else if (event === 'Show') {
      this.commonService.visuals.phylogenetic.tree.showBranchLengthLabels = true;
    }
    this.commonService.visuals.phylogenetic.tree.draw();
  }

  onBranchTooltipShowChange(event) {
    this.SelectedBranchTooltipShowVariable = event;
    if (event === 'Hide') {
      this.commonService.visuals.phylogenetic.tree.showInternalNodeLabels = false;
    } else if (event === 'Show') {
      this.commonService.visuals.phylogenetic.tree.showInternalNodeLabels = true;
    }
    this.commonService.visuals.phylogenetic.tree.draw();
  }

  showGlobalSettings() {
    this.DisplayGlobalSettingsDialogEvent.emit('Styling');
  }

  onLeafSizeChange(event) {
    this.SelectedLeafSizeVariable = event;
    const thisTree = this.commonService.visuals.phylogenetic.tree;
    thisTree.setNodeSize(event);
    thisTree.draw();
  }

  onLeafLabelSizeChange(event) {
    this.SelectedLeafLabelSizeVariable = event;
    const labelConfig = { labelStyle: { textSize: event } };
    this.updateLeaves(labelConfig);
  }

  onLinkSizeChange(event) {
    const thisTree = this.commonService.visuals.phylogenetic.tree;
    this.SelectedLinkSizeVariable = event;
    thisTree.lineWidth = event;
    thisTree.draw();
  }


  updateNodeColors() {
    const nodeColor = this.visuals.phylogenetic.commonService.session.style.widgets['node-color'];
    this.SelectedNodeColorVariable = nodeColor;
    const selectedColor = this.visuals.phylogenetic.commonService.GlobalSettingsModel.SelectedColorVariable;
    this.commonService.visuals.phylogenetic.tree.selectedColour = selectedColor;
    this.updateStyles();
  }

  updateLinkColor() {
    const linkColor = this.visuals.phylogenetic.commonService.session.style.widgets['link-color'];
    this.commonService.visuals.phylogenetic.tree.branchColour = linkColor;
    this.updateStyles();
  }

  updateLeaves(config) {
    const thisTree = this.commonService.visuals.phylogenetic.tree;
    thisTree.leaves.forEach((x) => {
      x.setDisplay(config);
    });
    thisTree.draw();
  }

  saveImage(event) {
    const thisTree = this.commonService.visuals.phylogenetic.tree;
    const fileName = this.SelectedTreeImageFilenameVariable;
    const canvasId = 'phylocanvas__canvas';
    const exportImageType = this.SelectedNetworkExportFileTypeListVariable ;
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (exportImageType === 'png') {
      domToImage.toPng(document.getElementById(canvasId)).then(
        dataUrl => {
          saveAs(dataUrl, fileName);
        });
    } else if (exportImageType === 'jpeg') {
      domToImage.toJpeg(document.getElementById(canvasId), { quality: 0.95}).then(
        dataUrl => {
          saveAs(dataUrl, fileName);
        });
    } else if (exportImageType === 'svg') {
      domToImage.toSvg(document.getElementById(canvasId)).then(
        dataUrl => {
          saveAs(dataUrl, fileName);
        });

    }

  }

  saveNewickString(event) {
    const thisTree = this.commonService.visuals.phylogenetic.tree;
    const newickBlob = new Blob([thisTree.stringRepresentation], {type: 'text/plain;charset=utf-8'});
    saveAs(newickBlob, this.SelectedNewickStringFilenameVariable);

  }
}
