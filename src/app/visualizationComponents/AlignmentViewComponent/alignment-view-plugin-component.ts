import { Component, OnInit, Injector, Inject, ElementRef, ChangeDetectorRef, AfterViewInit } from '@angular/core';
import { EventManager } from '@angular/platform-browser';
import { BaseComponentDirective } from '@app/base-component.directive';
import { MicrobeTraceNextVisuals } from '@app/microbe-trace-next-plugin-visuals';
import { CommonService } from '@app/contactTraceCommonServices/common.service';
import { DialogSettings } from '../../helperClasses/dialogSettings';
import { MicobeTraceNextPluginEvents } from '../../helperClasses/interfaces';
import { ComponentContainer } from 'golden-layout';
import { generateCanvas } from './generateAlignmentViewCanvas';
import { SelectItem } from 'primeng/api';
import { saveAs } from 'file-saver';
import { svgAsPngUri } from 'save-svg-as-png';
import { GoogleTagManagerService } from 'angular-google-tag-manager';

@Component({
  selector: 'AlignmentViewComponent',
  templateUrl: './alignment-view-plugin-component.html',
  styleUrls: ['./alignment-view-plugin-component.scss']
})
export class AlignmentViewComponent extends BaseComponentDirective implements OnInit, AfterViewInit, MicobeTraceNextPluginEvents {

  // General Settings
  alignmentDialogSettings: DialogSettings = new DialogSettings('#alignment-settings-pane', false)
  ShowAlignExportPane: boolean = false;
  viewActive: boolean = true;

  showHideOptions: any = [
    { label: 'Show', value: true },
    { label: 'Hide', value: false }
  ];
  labelFieldList: SelectItem[] = [];
  //labelField = "_id" // replaced with this.widgets['alignView-labelField']
  labelArray: any[];
  //sortField = "index" // replaced with this.widgets['alignView-sortField']

  private visuals: MicrobeTraceNextVisuals;
  widgets;
  
  // Data
  nodesWithSeq: any[];
  seqArray: string[];
  seqArrayShortened: any[];
  longestSeqLength: number = 0;

  /**
   * count matrix: [ [#A, #C, #G, #T, #other/ambig]-for each location, ... ]
   */
  countMatrix;
  /**
   * proportion matrix: [ [A, C, G, T, #other/ambig]-for each location, ... ]
   */
  proportionMatrix;
  /**
   * position matrix: [ [A, C, G, T, #other/ambig]-for each location, ... ]
   * y position (top) for each base at each postion in sequence
   */
  positionMatrix;
  proportionMatrixAA;
  positionMatrixAA;

  // Layout
  //showMiniMap: boolean; // replaced with this.widgets['alignView-showMiniMap']
  //alignmentTopDisplay: string; // replaced with this.widgets['alignView-topDisplay']
  alignmentTopDisplayOptions = [
    { label: 'Logo', value: 'logo' },
    { label: 'Bar Plot', value: 'barplot'}
  ]
  //charSetting: string; // 'show', 'min', 'hide' // replaced with this.widgets['alignView-charSetting']
  charSettingOptions: any = [
    { label: 'Show', value: 'show' },
    { label: 'Minimum', value: 'min'},
    { label: 'Hide', value: 'hide' }
  ];
  seqTypeOptions = [
    { label: 'Nucleotides', value: 'nt'},
    { label: 'Codons', value: 'codon'},
    { label: 'Amino Acids', value: 'aa'}
  ];
  selectedSeqType = 'nt';
  startPos = 1;
  //rulerMinorInterval: number = 20; replaced with this.widgets['alignView-rulerMinorInterval']
  rulerIntervalOptions = [0, 10, 20, 25, 50]
  translationSetting = 'Maintain Codons'

  // Sizing
  // spanWidth and spanHeight values are duplicated in the widgets; I didn't replace because these are used through the template in loops and I was concerned that
  // looking up there values 1000's of times from this.commonService.session.style.widgets would hurt performance
  spanWidth: number; 
  spanHeight: number;
  fontSize: number;

  sizes = [
    { label: 'Small', value: 's'},
    { label: 'Medium', value: 'm'},
    { label: 'Large', value: 'l'},
    { label: 'Custom', value: 'c'}
  ]
  //selectedSize: string; // replaced with this.widgets['alignView-selectedSize']

  alignmentViewHeight: number;
  rightViewHeight: number;
  canvasViewHeight: number;

  leftWidth: number;
  rightWidth: number;

  // Colors
  //selectedColorSchemeName: string; // replaced with this.widgets['alignView-colorSchemeName']
  colorScheme; // current color scheme;
  // customColorScheme; // replaced with this.widgets['alignView-customColorScheme']
  useCustomColorScheme: boolean;
  colorSchemeOptions = [
    { label: 'Normal', 
      value: 'n',
    },
    { label: 'Alternative', 
    value: 'a',
    },
    {
      label: 'Custom',
      value: 'c'
    }
  ]

  // Export
  AlignmentExportFileName: string = ""
  AlignmentExportFileTypeVis: string = "svg";
  AlignmentExportFileTypeData: string = "fasta";

  constructor(injector: Injector,
    private eventManager: EventManager,
    public commonService: CommonService,
    @Inject(BaseComponentDirective.GoldenLayoutContainerInjectionToken) private container: ComponentContainer, 
    elRef: ElementRef,
    private cdref: ChangeDetectorRef,
    private gtmService: GoogleTagManagerService) {

    super(elRef.nativeElement);

    this.visuals = commonService.visuals;
    this.commonService.visuals.alignment = this;
    this.widgets = this.commonService.session.style.widgets;
  }

  ngOnInit(): void {

    this.gtmService.pushTag({
            event: "page_view",
            page_location: "/alignment",
            page_title: "Alignment View"
        });
    // set events such as node-selected
    this.setEvents();

    this.setDefaultWidgets();

    this.labelFieldList = [];
    this.commonService.session.data['nodeFields'].map((d, i) => {
      if (d != 'seq' && d != 'sequence') {
        this.labelFieldList.push({
          label: this.commonService.capitalize(d.replace("_", "")),
          value: d
        });
      }
    });

    // sets nodesWithSeq, seqArr, and longestSeqLength
    this.nodesWithSeq = [];
    this.seqArray = [];
    this.commonService.session.data.nodes.forEach((node, index) => {
      if (node.seq != null && node.seq != "" && node.seq != "null"){
        this.nodesWithSeq.push(index);
        this.seqArray.push(node.seq.toUpperCase());
        if (node.seq.length > this.longestSeqLength) {
          this.longestSeqLength = node.seq.length;
        }
      }
    })

    this.labelArray = this.getData(this.nodesWithSeq, ['index', this.widgets['alignView-labelField']]);

    // calculations countMatrix, proportionMatrix, and positionMatrix
    this.calculateProportionAtEachLocation();

    // sets different variables relating to size and display
    this.onAlignmentTopChange()

    if (this.widgets['alignView-colorSchemeName'] == 'n' || this.widgets['alignView-colorSchemeName'] == 'a') {
      this.useCustomColorScheme = false;
    } else {
      this.useCustomColorScheme = true;
    }
    this.onSelectedColorChanged(true)

    // updates spanWidth, spanHeight, rightWidth, leftWidth, fontSize, and then updates alignment
    this.onSelectedSizeChanged()
    // updates the valus of nodeWidthSeqShortened based on size of rigthWitdth, longestSeqLength, and nodesWithSeq
    this.shortenNodesWithSeq();

    // updates shows or hides minimap and then updates view heights
    this.updateMiniMapVisibility();    

    this.container.on('resize', () => { this.goldenLayoutComponentResize()})
    this.container.on('hide', () => { 
      this.viewActive = false; 
      this.cdref.detectChanges();
    })
    this.container.on('show', () => { 
      this.viewActive = true; 
      this.cdref.detectChanges();
    })
  }

  ngAfterViewInit(): void {
    this.highlightRows();
  }

  // General

  /**
   * Defines new widgets and set default values
   */
  setDefaultWidgets() {
    //size
    if (this.widgets['alignView-selectedSize'] == undefined) {
      this.widgets['alignView-selectedSize'] = 'l';
    }
    // height and width are declare/checked in this.onSelectedSizeChanged()

    // color
    if (this.widgets['alignView-colorSchemeName'] == undefined) {
      this.widgets['alignView-colorSchemeName'] = 'n';
    }

    if (this.widgets['alignView-customColorScheme'] == undefined) {
      this.widgets['alignView-customColorScheme'] = {
        'A': '#ccff00',
        'C': '#f0e442',
        'G': '#ff9900',
        'T': '#ff6600',
        'ambig': '#ffffff',
      }
    }

    // labels/sorting
    if (this.widgets['alignView-labelField'] == undefined) {
      this.widgets['alignView-labelField'] = '_id';
    }

    if (this.widgets['alignView-sortField'] == undefined) {
      this.widgets['alignView-sortField'] = 'index';
    }

    // top settings
    if (this.widgets['alignView-showMiniMap'] == undefined) {
      this.widgets['alignView-showMiniMap'] = true;
    }

    if (this.widgets['alignView-topDisplay'] == undefined) {
      this.widgets['alignView-topDisplay'] = 'barplot';
    }

    if (this.widgets['alignView-rulerMinorInterval'] == undefined) {
      this.widgets['alignView-rulerMinorInterval'] = 20;
    }

    // main canvas
    if (this.widgets['alignView-charSetting'] == undefined) {
      this.widgets['alignView-charSetting'] = 'show';
    }
    this.widgets['alignView-charSetting'] = 'show';
  }

  /**
   * 
   * @param indexList an array of indexes for the nodes to get data from
   * @param field string | array of which field to get data from
   * @returns an array of objects
   */
  getData(indexList, field) {
    if (Array.isArray(field)) {
      return indexList.map(index => {
        let currentObj = {}
        field.forEach(f => currentObj[f] = (f == "seq") ? this.commonService.session.data.nodes[index][f].toUpperCase() : this.commonService.session.data.nodes[index][f]);
        return currentObj;
      })
    } else if (field == "seq") {
      return indexList.map(index => this.commonService.session.data.nodes[index]["seq"].toUpperCase());
    } else {
      return indexList.map(index => this.commonService.session.data.nodes[index][field])
    }
  }

  /**
   * Updates the value of this.longestSeqLength
   */
  updateLongestSeqLength() {
    let longestSeq = 0;
    this.seqArray.forEach((seq) => {
      if (seq.length > longestSeq) {
        longestSeq = seq.length
      }
    })
    this.longestSeqLength = longestSeq;
  }

  /**
  * Updates the alignment by generating a new canvas, and recalcuating various heights
  */
  updateAlignment() {
    generateCanvas(this.seqArray, {width: this.spanWidth, height: this.spanHeight, charSetting: this.widgets['alignView-charSetting'], fontSize: this.fontSize, colors: this.colorScheme}).then(function(canvas: HTMLCanvasElement) {
      $('#msa-viewer .canvasHolder').empty().append(canvas)
    })
    
    this.updateViewHeights();
  }

  // Mini Map

  /**
  * Creates a minimap. 
  * The sequences (seqArrayShortened) are previously downsample by picking 1 nt / every n nucleotides;
  */
  updateMiniMap() {
    $('#miniMap canvas').remove();
    generateCanvas(this.seqArrayShortened, {width: 1, height: 1, charSetting: 'hide', fontSize: 1, colors: this.colorScheme}).then(function(canvas: HTMLCanvasElement) {
      $('#miniMap').append(canvas);
    })
  }

  /**
   * Adds/Removed miniMap and miniMap title
   */
  updateMiniMapVisibility() {
    if (this.widgets['alignView-showMiniMap']){
      this.updateMiniMap();
      $('#miniMapHolder').css({'display': 'block'});
      $('#miniMapTitle').css({'display': 'block'});
    } else {
      $('#miniMapHolder').css({'display': 'none'});
      $('#miniMapTitle').css({'display': 'none'});
    }

    this.updateViewHeights();
  }

  /**
   * Add miniMapHighlight to correct position
   * @param e mouse event
   * @param miniMap HTMLElement
   */
  showMiniMapHighlight(e: MouseEvent, miniMap: HTMLElement) {
    let mmDimensions = miniMap.getBoundingClientRect();
    
    // need to reduce number of sequences on minimap if there are too many
    let scaleFactorNumber = (this.nodesWithSeq.length <= 100)? 1: Math.ceil(this.nodesWithSeq.length/100);
    let viewHeight = $('.canvasLabels').height();
    let highlightHeight = viewHeight/(this.spanHeight*scaleFactorNumber);

    // want the minimap to be around this.rightWidth pixels wide; caculate how much to downscale by and then downscale
    let scaleFactorLength = (this.longestSeqLength < this.rightWidth)? 1 : Math.ceil(this.longestSeqLength/this.rightWidth);
    let highlightWidth = $('.canvasHolder').width()/(this.spanWidth*scaleFactorLength)

    let canvasWidth = $('#miniMap canvas').width()
    let left = e.clientX - mmDimensions.left - highlightWidth/2;
    if (left < 0) {
      left = 0;
    } else if (left > canvasWidth - highlightWidth) {
      left = canvasWidth - highlightWidth;
    }

    $('#miniMapHighlight').css({'display': 'block', 'top': top +'px', 'left': left +'px', 'height': highlightHeight+'px', 'width': highlightWidth+'px'})
  }

  /**
   * Moves the position of miniMapHighlight
   * @param e mouse event
   * @param miniMap HTMLElement
   */
  updateMiniMapHighlight(e: MouseEvent, miniMap: HTMLElement) {
    let mmDimensions = miniMap.getBoundingClientRect();

    let highlightHeight = $('#miniMapHighlight').height()
    let top = e.clientY - mmDimensions.top - (highlightHeight/2)
    if (top < 0) {
      top = 0
    } else if (top > mmDimensions.height-highlightHeight) {
      top = mmDimensions.height-highlightHeight
    }

    let canvasWidth = $('#miniMap canvas').width()
    let highlightWidth = $('#miniMapHighlight').width()
    let left = e.clientX - mmDimensions.left - highlightWidth/2;
    if (left < 0) {
      left = 0;
    } else if (left > canvasWidth - highlightWidth) {
      left = canvasWidth - highlightWidth;
    }

    $('#miniMapHighlight').css({'top': top +'px', 'left': left +'px'});
  }

  /**
   * Removes highling from minimap
   */
  hideMiniMapHighlight() {
    $('#miniMapHighlight').css({'display': 'none'})
  }

  /**
   * Moves scroll position of main canvas, canvasLabels, and alignmentTop(Bar Plot, Rule) based on position of miniMapHighlight
   */
  miniMapClick(e: MouseEvent, miniMap: HTMLElement, canvasHolder: HTMLElement, canvasLabels: HTMLElement, alignmentTop: HTMLElement) {
    let mmDimensions = miniMap.getBoundingClientRect();
    let highlightDimensions =  document.getElementById('miniMapHighlight').getBoundingClientRect();

    // want the minimap to be around this.rightWidth pixels wide; caculate how much to downscale by and then downscale
    let scaleFactorLength = (this.longestSeqLength < this.rightWidth)? 1 : Math.ceil(this.longestSeqLength/this.rightWidth);
    // need to reduce number of sequences on minimap if there are too many
    let scaleFactorNumber = (this.nodesWithSeq.length <= 100)? 1: Math.ceil(this.nodesWithSeq.length/100);
    //let scaleFactor = Math.ceil(this.longestSeqLength/this.rightWidth)
    let horizontalScroll = (highlightDimensions.left - mmDimensions.left)*this.spanWidth*scaleFactorLength;    
    alignmentTop.scrollLeft = horizontalScroll < 10 ? horizontalScroll : horizontalScroll + 7;
    canvasHolder.scrollLeft = horizontalScroll < 10 ? horizontalScroll : horizontalScroll + 7;

    let verticalScroll = (highlightDimensions.top - mmDimensions.top)*this.spanHeight*scaleFactorNumber;
    canvasLabels.scrollTop = verticalScroll < 4 ? verticalScroll : verticalScroll+4;
    canvasHolder.scrollTop = verticalScroll < 4 ? verticalScroll : verticalScroll+4;  
  }

  // Tooltip

  /**
   * 
   * @param e $event
   * @param index index of the nt for the tooltip
   */
  showTooltip(e: MouseEvent ,index:number) {
    // offsetX = mouse X position + adjustment to center of the bar -50 to center toolbar
    let [x, ] = this.getRelativeMousePosition(e);
    let adjX = this.spanWidth/2 - (e.offsetX % this.spanWidth)
    let offsetX = x + adjX -50;
    
    // offsetY = 151 (51 offset + 100 height) + height of minimap (number of seq/scaleFactor + 26 for padding, border, margin)
    let offsetY;
    if (this.widgets['alignView-showMiniMap']) {
      let scaleFactorNumber = (this.nodesWithSeq.length <= 100)? 1: Math.ceil(this.nodesWithSeq.length/100)
      offsetY = 151 + Math.ceil(this.nodesWithSeq.length/scaleFactorNumber+26)
    } else {
      offsetY = 151;
    }

    let htmlString = this.tabulate(index);
    $('#tooltipAlign').html(htmlString)
    $('#tooltipHolder').css({'display': 'block', 'position': 'absolute', 'left': offsetX + 'px', 'top': offsetY + 'px'})
  }

  /**
   * Hides the tooltip
   */
  hideTooltip() {
    //$('#tooltipAlign').html("")
    $('#tooltipHolder').css({'display': 'none'})
  }


  // Data

  /**
   * Updates seqArrayShortened by downsampling (selecting 1 out of every n NTs and selected 1 out of every m sequences, as needed) nodesWithSeq
   * 
   */
  shortenNodesWithSeq() {
    if (this.longestSeqLength < this.rightWidth && this.nodesWithSeq.length <= 100) {
      this.seqArrayShortened = this.seqArray
      $('#miniMap').css({'width': this.longestSeqLength+'px', 'height': this.nodesWithSeq.length+'px'})
      $('#miniMapTitle').css({'height': (this.nodesWithSeq.length+16)+'px', 'line-height': (this.nodesWithSeq.length+16)+'px'})
      return; 
    }

    // want the minimap to be around this.rightWidth pixels wide; caculate how much to downscale by and then downscale
    let scaleFactorLength = (this.longestSeqLength < this.rightWidth)? 1 : Math.ceil(this.longestSeqLength/this.rightWidth);
    // need to reduce number of sequences on minimap if there are too many
    let scaleFactorNumber = (this.nodesWithSeq.length <= 100)? 1: Math.ceil(this.nodesWithSeq.length/100);
    this.seqArrayShortened = [];
    this.seqArray.forEach((seq, index) => {
      if (index % scaleFactorNumber != 0) return;
      let downSizedSeq = "";
      for (let i=0; i < this.longestSeqLength; i+= scaleFactorLength) {
        downSizedSeq += seq.charAt(i);
      }
      this.seqArrayShortened.push(downSizedSeq)
    })

    $('#miniMap').css({'width': Math.ceil(this.longestSeqLength/scaleFactorLength)+'px', 'height': Math.ceil(this.nodesWithSeq.length/scaleFactorNumber)+'px'})
    $('#miniMapTitle').css({'height': Math.ceil(this.nodesWithSeq.length/scaleFactorNumber+16)+'px', 'line-height': Math.ceil(this.nodesWithSeq.length/scaleFactorNumber+16)+'px'})
  }

  /**
   * Calculates the count, proportion, and y position (for logo/bar plot) of each base at each position
   */
  calculateProportionAtEachLocation() {
    // count matrix: [ [#A, #C, #G, #T, #other/ambiguos]-for each location, ... ]
    this.countMatrix = [];
    this.proportionMatrix = [];
    this.positionMatrix = [];

    for (let i =0; i<this.longestSeqLength; i++) {
      this.countMatrix.push([0,0,0,0,0]);
    }

    for (let seq of this.seqArray) {
      for (let i=0; i< seq.length; i++) {
        let nt = seq[i];
        switch (nt) {
          case 'A':
            this.countMatrix[i][0] += 1;
            break;
          case 'C':
            this.countMatrix[i][1] += 1;
            break;
          case 'G':
            this.countMatrix[i][2] += 1;
            break;
          case 'T':
            this.countMatrix[i][3] += 1;
            break; 
          default:
            this.countMatrix[i][4] += 1
        }
      } 
    }
    
    function calcProportion(value) {
      let sum = value[0] + value[1] + value[2] + value[3] + value[4];
      return [value[0]/sum, value[1]/sum, value[2]/sum, value[3]/sum, value[4]/sum]
    }

    function calculatePosition(value) {
      // custom merge sort; i want  first four items in value sorted but i want array of indexes returned not array of values
      let mergeA = value[0] > value[1] ? [0,1] : [1,0]
      let mergeB = value[2] > value[3] ? [2,3] : [3,2]
      let sortedIndexes = [];
      let locA = 0, locB=0;
      for (let i =0; i<4; i++) {
        if (locA == 2) {
          sortedIndexes.push(mergeB[locB])
          locB += 1;
        } else if (locB == 2) {
          sortedIndexes.push(mergeA[locA])
          locA += 1;
        } else if (value[mergeA[locA]] > value[mergeB[locB]]) {
          sortedIndexes.push(mergeA[locA])
          locA += 1;
        } else {
          sortedIndexes.push(mergeB[locB])
          locB += 1;
        }
      }

      // use sorted index to create temp/row of positionMatrix such at the ambig (value[4]) is at the very top and then largest to smallest
      let temp = [0,0,0,0,0];
      let y = value[4]*100;
      for (let index of sortedIndexes) {
        temp[index] = y;
        y += value[index]*100
      }
      return temp;
    }

    this.proportionMatrix = this.countMatrix.map(calcProportion)
    this.positionMatrix = this.proportionMatrix.map(calculatePosition)
  }

  /**
   * Generates and returns the proportion matrix from Amino Acid sequence
   */
    calculateProportionAminoAcids() {
      // count matrix: [ [#A, #R, #N, #D, #C, #E, #Q, #G, #H, #I, #L, #K, #M, #F, #P, #S, #T, #W, #Y, #V, #*, #-, #X]-for each location, ... ]
      let countMatrix = [];
  
      for (let i =0; i<this.longestSeqLength; i++) {
        countMatrix.push(Array(23).fill(0));
      }
  
      for (let seq of this.seqArray) {
        for (let i=0; i< seq.length; i++) {
          let nt = seq[i];
          switch (nt) {
            case 'A':
              countMatrix[i][0] += 1;
              break;
            case 'R':
              countMatrix[i][1] += 1;
              break;
            case 'N':
              countMatrix[i][2] += 1;
              break;
            case 'D':
              countMatrix[i][3] += 1;
              break; 
            case 'C':
              countMatrix[i][4] += 1;
              break;
            case 'E':
              countMatrix[i][5] += 1;
              break;
            case 'Q':
              countMatrix[i][6] += 1;
              break;
            case 'G':
              countMatrix[i][7] += 1;
              break;
            case 'H':
              countMatrix[i][8] += 1;
              break;
            case 'I':
              countMatrix[i][9] += 1;
              break;
            case 'L':
              countMatrix[i][10] += 1;
              break; 
            case 'K':
              countMatrix[i][11] += 1;
              break;
            case 'M':
              countMatrix[i][12] += 1;
              break;
            case 'F':
              countMatrix[i][13] += 1;
              break; 
            case 'P':
              countMatrix[i][14] += 1;
              break;
            case 'S':
              countMatrix[i][15] += 1;
              break; 
            case 'T':
              countMatrix[i][16] += 1;
              break; 
            case 'W':
              countMatrix[i][17] += 1;
              break; 
            case 'Y':
              countMatrix[i][18] += 1;
              break; 
            case 'V':
              countMatrix[i][19] += 1;
              break; 
            case '*':
              countMatrix[i][20] += 1;
              break; 
            case '-':
              countMatrix[i][21] += 1;
              break; 
            case 'X':
              countMatrix[i][22] += 1;
              break; 
            default:
              countMatrix[i][22] += 1;
          }
        } 
      }

      function calcProportion(value) {
        let sum = value.reduce((acc, cur) => acc + cur, 0)
        return value.map(current => current/sum);
      }
      return countMatrix.map(calcProportion)
}

  /**
   * Generates and returns the position Matrix from Amino Acid proportion matrix
   */
  calculatePositionMatrixAminoAcids() {
    let count = 0;
    let output = [];
      //let index2NT = ['A', 'R', 'N', 'D', 'C', 'E', 'Q', 'G', 'H', 'I', 'L', 'K', 'M', 'F', 'P', 'S', 'T', 'W', 'Y', 'V', '*', '-', 'X'];
      this.proportionMatrixAA.forEach((row) => {
        let nonZeroIndexes = [];
        row.forEach((value, index) => {
          if (value > 0 && index < 20) nonZeroIndexes.push(index);
        })
        nonZeroIndexes.sort(compareIndices);
        function compareIndices(a,b) {
          return row[b] - row[a]
        }
        count += 1;
        let temp = new Array(23).fill(0);
        let y = (row[22]+row[21]+row[20])*100;        
        for (let index of nonZeroIndexes) {
          temp[index] = y;
          y += row[index]*100
        }
        output.push(temp);
      })

    return output;
  }

  /**
   * Similar to caclulating the proportion, but gaps and ambiguous nucleotides are separated
   */
  calculateAdvancedProportion() {
        // count matrix: [ [#A, #C, #G, #T, gaps, #N, #R, #Y, #K, #M, #S, #W, #B, #D, #H, #V #other]-for each location, ... ]
        let countMatrix = [];
    
        for (let i =0; i<this.longestSeqLength; i++) {
          countMatrix.push(Array(17).fill(0)); // update this
        }
    
        for (let seq of this.seqArray) {
          for (let i=0; i< seq.length; i++) {
            let nt = seq[i];
            switch (nt) {
              case 'A':
                countMatrix[i][0] += 1;
                break;
              case 'C':
                countMatrix[i][1] += 1;
                break;
              case 'G':
                countMatrix[i][2] += 1;
                break;
              case 'T':
                countMatrix[i][3] += 1;
                break; 
              case '-':
                countMatrix[i][4] += 1;
                break;
              case 'N':
                countMatrix[i][5] += 1;
                break;
              case 'R':
                countMatrix[i][6] += 1;
                break;
              case 'Y':
                countMatrix[i][7] += 1;
                break;
              case 'K':
                countMatrix[i][8] += 1;
                break;
              case 'M':
                countMatrix[i][9] += 1;
                break;
              case 'S':
                countMatrix[i][10] += 1;
                break; 
              case 'W':
                countMatrix[i][11] += 1;
                break;
              case 'B':
                countMatrix[i][12] += 1;
                break;
              case 'D':
                countMatrix[i][13] += 1;
                break; 
              case 'H':
                countMatrix[i][14] += 1;
                break;
              case 'V':
                countMatrix[i][15] += 1;
                break; 
              default:
                countMatrix[i][16] += 1;
            }
          } 
        }

        function calcProportion(value) {
          let sum = value.reduce((acc, cur) => acc + cur, 0)
          return value.map(current => current/sum);
        }
        return countMatrix.map(calcProportion)
  }

  /** returns Math.floor(i); allows for it to be called from within the template */
  floor(i) {
    return Math.floor(i)
  }

  /**
   * @param i position
   * @returns the x pos for the elements in the barplot/logo/ruler based on the startPos and selectedSeqType
   */
  xPos(i) {
    if (this.selectedSeqType == 'codon' && i < this.startPos) {
      return 0
    } else if (this.selectedSeqType=='codon') {
      return this.spanWidth*(i-this.startPos+1+Math.floor((i-this.startPos+1)/3))
    } else {
      return this.spanWidth*i;
    }
  }

  /** Calculates the need with of SVG image based on selectedSeqType and the length of the sequences */
  getSVGWidth() {
    if (this.selectedSeqType == 'nt') {
      return this.spanWidth*this.proportionMatrix.length+17
    } else if (this.selectedSeqType == 'codon') {
      let length = this.proportionMatrix.length
      return this.spanWidth*(length+Math.floor(length/3))+17
    } else {
      return this.spanWidth*this.proportionMatrixAA.length+17
    }
  }

  /** Updates Alignment View when type of sequence is changed */
  onSeqTypeChange() {
    if (this.selectedSeqType=='nt') {
      this.startPos = 1;
      this.revert2NT();
    } else if (this.selectedSeqType == 'codon') {
      this.NT2Codon(this.startPos-1);
    } else {
      this.convertToAASequence(this.startPos-1);
    }
  }

  /** Returns a lookup table for converting NTs to Amino Acids. Doesn't account for ambiguity. USe checkAmbiguousCodons() to convert a codon
   * with ambiguous nucleotides into an Amino Acid
   */
  getNT2AATable() {
    return {
      'TTT': 'F', 'TTC': 'F', 'TTA': 'L', 'TTG': 'L', 'TCT': 'S', 'TCC': 'S', 'TCA': 'S', 'TCG': 'S', 
      'TAT': 'Y', 'TAC': 'Y', 'TAA': '*', 'TAG': '*', 'TGT': 'C', 'TGC': 'C', 'TGA': '*', 'TGG': 'W',
      'CTT': 'L', 'CTC': 'L', 'CTA': 'L', 'CTG': 'L', 'CCT': 'P', 'CCC': 'P', 'CCA': 'P', 'CCG': 'P',
      'CAT': 'H', 'CAC': 'H', 'CAA': 'Q', 'CAG': 'Q', 'CGT': 'R', 'CGC': 'R', 'CGA': 'R', 'CGG': 'R', 
      'ATT': 'I', 'ATC': 'I', 'ATA': 'I', 'ATG': 'M', 'ACT': 'T', 'ACC': 'T', 'ACA': 'T', 'ACG': 'T',
      'AAT': 'N', 'AAC': 'N', 'AAA': 'K', 'AAG': 'K', 'AGT': 'S', 'AGC': 'S', 'AGA': 'R', 'AGG': 'R', 
      'GTT': 'V', 'GTC': 'V', 'GTA': 'V', 'GTG': 'V', 'GCT': 'A', 'GCC': 'A', 'GCA': 'A', 'GCG': 'A',
      'GAT': 'D', 'GAC': 'D', 'GAA': 'E', 'GAG': 'E', 'GGT': 'G', 'GGC': 'G', 'GGA': 'G', 'GGG': 'G'
    }
  }

  /** Converts the nucleotide sequence for each node into an amino acid sequence, based on startPos and , then updates the view */
  convertToAASequence(startPos=0) {
    let NT2AA_table = this.getNT2AATable();

    this.seqArray = this.getData(this.nodesWithSeq, 'seq');

    this.updateLongestSeqLength();
    let AAarray = [];
    let NT_check = /^[ACGT]+$/;
    
    this.seqArray.forEach(seq => {
      if (this.translationSetting=='Maintain Codons') {
        let aaString = ''
        for (let i=startPos; i< seq.length; i += 3) {
          let codon = seq.substring(i, i+3);
          if (NT_check.test(codon)) {
            aaString += NT2AA_table[codon];
          } else if (codon == '---') {
            aaString += '-'
          } else {
            aaString += this.checkAmbiguousCodons(codon, NT2AA_table);
          }
        }
        AAarray.push(aaString);
      } else {
        let aaString = '';
        let gapCount = 0;
        let codon = '';
        for (let i=startPos; i < seq.length; i++) {
          let nt = seq.charAt(i);
          if (nt == '-') {
            gapCount += 1;
          } else {
            codon += nt;
          }

          if (gapCount == 3) {
            aaString += '-';
            gapCount = 0;
          } else if (codon.length == 3) {
            if (NT_check.test(codon)) {
              aaString += NT2AA_table[codon]
            } else {
              let aa = this.checkAmbiguousCodons(codon, NT2AA_table);
              aaString += aa;
            } 
            codon = '';
          }
        }
        AAarray.push(aaString);
      }     
    })
    this.seqArray = AAarray;
    this.colorScheme =   {
      A: '#33cc00',
      R: '#cc0000',
      N: '#6600cc',
      D: '#0033ff',
      C: '#ffff00',
      Q: '#6600cc',
      E: '#0033ff',
      G: '#33cc00',
      H: '#009900',
      I: '#33cc00',
      L: '#33cc00',
      K: '#cc0000',
      M: '#33cc00',
      F: '#009900',
      P: '#33cc00',
      S: '#0099ff',
      T: '#0099ff',
      W: '#009900',
      Y: '#009900',
      V: '#33cc00',
      X: '#ffffff'
    }

    this.updateAlignment();
    this.updateLongestSeqLength();
    this.shortenNodesWithSeq();
    this.proportionMatrixAA = this.calculateProportionAminoAcids();
    this.positionMatrixAA = this.calculatePositionMatrixAminoAcids();
    this.updateMiniMap();
  }

  /** Converts a codon into an amino acid, tries to resolve ambiguous nucleotides; Return amino acid, X for ambiguous amino acid, or - if codon.length != 3 */
  checkAmbiguousCodons(codon: string, NT2AA_table=this.getNT2AATable()) {
    let ambiguousCheck = /^[ACGTNRYKMSWBDHV]+$/
    if (codon.length != 3) {
      return '-'
    } else if (!ambiguousCheck.test(codon)) {
      return 'X'
    }

    let positionPossibilities = [];
    for (let i=0; i<3; i++) {
      let currentNT = codon.charAt(i);
      if (currentNT == 'A' || currentNT == 'C' || currentNT == 'G' || currentNT == 'T') {
        positionPossibilities.push([currentNT])
      } else if (currentNT == 'W') {
        positionPossibilities.push(['A', 'T'])
      } else if (currentNT == 'S') {
        positionPossibilities.push(['C', 'G'])
      } else if (currentNT == 'M') {
        positionPossibilities.push(['A', 'C'])
      } else if (currentNT == 'K') {
        positionPossibilities.push(['G', 'T'])
      } else if (currentNT == 'R') {
        positionPossibilities.push(['A', 'G'])
      } else if (currentNT == 'Y') {
        positionPossibilities.push(['C', 'T'])
      } else if (currentNT == 'B') {
        positionPossibilities.push(['C', 'G', 'T'])
      } else if (currentNT == 'D') {
        positionPossibilities.push(['A', 'G', 'T'])
      } else if (currentNT == 'H') {
        positionPossibilities.push(['A', 'C', 'T'])
      } else if (currentNT == 'V') {
        positionPossibilities.push(['A','C', 'G'])
      } else if (currentNT == 'N') {
        positionPossibilities.push(['A', 'C', 'G', 'T'])
      }
    }
    let possibleCodons = [];
    positionPossibilities[0].forEach(nt0 => {
      positionPossibilities[1].forEach(nt1 => {
        positionPossibilities[2].forEach(nt2 => {
          possibleCodons.push(nt0+nt1+nt2);
        })
      })
    })

    let possibleAA = NT2AA_table[possibleCodons[0]];
    for (let i=1; i<possibleCodons.length; i++) {
      let AA = NT2AA_table[possibleCodons[i]]
      if (possibleAA != AA) {
        return 'X'
      }
    }

    return possibleAA;
  }

  /** Reverts the view back to the original sequence view */
  revert2NT() {
    this.seqArray = this.getData(this.nodesWithSeq, 'seq');
    this.updateLongestSeqLength();
    this.shortenNodesWithSeq();
    this.onSelectedColorChanged();
  }

  /** Converts the sequence into a codons by introducing spaces every 3NTs and then updates the view */
  NT2Codon(start) {
    let newSeqs = []
    this.seqArray = this.getData(this.nodesWithSeq, 'seq');
    this.seqArray.forEach(seq => {
      let codons = []
      for (let i=start; i<seq.length; i+= 3) {
        codons.push(seq.slice(i, i+3));
      }
      newSeqs.push(codons.join(' '));
    })

    this.seqArray = newSeqs;
    this.updateLongestSeqLength();
    this.shortenNodesWithSeq();
    this.onSelectedColorChanged();
  }

  // Layout Positioning

  /**
  * Set rightViewHeigh, alignmentViewHeight, and canvasViewHeigh
  */
  updateViewHeights() {
    // order is important as subsequent calculations rely on previous updated values; These values are used to ensure the view heights are correct and scrolling occurs as expectd
    this.rightViewHeight = this.calculateRightHeight();
    this.alignmentViewHeight = this.calculateViewHeight();
    this.canvasViewHeight = this.calculateCanvasViewHeight();
  }

  /**
   * @returns the height needed to for all the elements on the right half of msa-viewer. If this height > available space, then scrolling will be used
   */
  calculateRightHeight(): number {
    let miniMapHeight = (this.widgets['alignView-showMiniMap']) ? $('#miniMapHolder').height()+16 : 0;
    // 170 alignmentTop, 17 bottomScrollBar, height of canvas
    return 170+25+this.nodesWithSeq.length*this.spanHeight+ miniMapHeight;
  }

  /**
   * @returns the height for msa-viewer element based on the minimum of the available space for the view and the height needed for the elements
   */
  calculateViewHeight(): number {
    return Math.min($(".msa-viewer-container").parent().height()-50, this.rightViewHeight)
  }

  /**
   * @returns the height for the canvasHolder element and then subsequently the canvasLabels element. Not the height of the canvas itself
   */
  calculateCanvasViewHeight(): number {
    let miniMapHeight = (this.widgets['alignView-showMiniMap']) ? $('#miniMapHolder').outerHeight() : 0;
    return Math.min(this.alignmentViewHeight - 170 - miniMapHeight, this.nodesWithSeq.length*this.spanHeight+25)
  }

  /**
   * @returns the width for the right half of the viewer
   */
  calculateRightWidth(): number {
    // 7: gap between left and right (5) + 2
    return $("#msa-viewer").width() - this.leftWidth - 7;
  }


  // Sizing
  
  /**
  * Updates font size as needed and then updates the alignment view based on new height
  */
  onSpanHeightChange(e) {
    if (e >= 16) {
      this.fontSize = 16;
      this.leftWidth=250;
    } else if (e >= 12) {
      this.fontSize = 12;
      this.leftWidth = 200;
    } else if (e >= 10) {
      this.fontSize = 10;
      this.leftWidth = 150;
    }

    this.rightWidth = this.calculateRightWidth();

    this.widgets['alignView-selectedSize']='c';
    this.widgets['alignView-spanHeight'] = e;
    this.updateAlignment();
  }

  /**
   * Updates the alignment view with the new width
   */
  onSpanWidthChange(e){
    this.widgets['alignView-selectedSize']='c';
    this.widgets['alignView-spanWidth'] = e
    this.updateAlignment();
  }

  /**
   * Updates spanHeight, spanWidth, fontSize, and sometimes charSetting and then updates alignment view with new settings
   */
  onSelectedSizeChanged() {
    if (this.widgets['alignView-selectedSize'] == 's') {
      this.spanHeight = 10;
      this.spanWidth = 2;
      this.widgets['alignView-charSetting'] = 'hide';
    } else if (this.widgets['alignView-selectedSize'] == 'm') {
      this.spanHeight = 12;
      this.spanWidth = 6;
      //this.charSetting = 'hide';
    } else if (this.widgets['alignView-selectedSize'] == 'l') {
      this.spanHeight = 16;
      this.spanWidth = 10;
      //this.charSetting = 'show';
    } else if (this.widgets['alignView-selectedSize'] == 'c') {
      
      if (!this.widgets['alignView-spanWidth']) {
        this.spanWidth = 10;
      } else {
        this.spanWidth = this.widgets['alignView-spanWidth']
      }

      if (!this.widgets['alignView-spanHeight']) {
        this.spanHeight = 16;
      } else {
        this.spanHeight = this.widgets['alignView-spanHeight']
      }
    }

    if (this.spanHeight >= 16) {
      this.fontSize = 16;
      this.leftWidth=250;
    } else if (this.spanHeight >= 12) {
      this.fontSize = 12;
      this.leftWidth = 200;
    } else if (this.spanHeight >= 10) {
      this.fontSize = 10;
      this.leftWidth = 150;
    }

    this.widgets['alignView-spanWidth'] = this.spanWidth;
    this.widgets['alignView-spanHeight'] = this.spanHeight;

    this.rightWidth = this.calculateRightWidth();
    this.updateAlignment();
  }


  // Colors

  /**
   * Updates the color scheme for the view based on what is selected
   * @param skipUpdateAlignment set to true during ngOnInit to skip this.updateAlignment() and if statement for this.updateMiniMap()
   */
  onSelectedColorChanged(skipUpdateAlignment=false) {
    if (this.selectedSeqType != 'aa') {
      if (this.widgets['alignView-colorSchemeName'] == 'n') {
        this.colorScheme = {
          'A': '#ccff00',
          'C': '#f0e442',
          'G': '#ff9900',
          'T': '#ff6600',
          'ambig': '#ffffff',
        }
        this.useCustomColorScheme = false;
      } else if (this.widgets['alignView-colorSchemeName'] == 'a') {
        this.colorScheme = {
          'A': '#009E73',
          'C': '#F0E442',
          'G': '#E69F00',
          'T': '#D55E00',
          'ambig': '#ffffff',
          }
          this.useCustomColorScheme = false;
      } else {
        this.colorScheme = {
          'A': this.widgets['alignView-customColorScheme']['A'],
          'C': this.widgets['alignView-customColorScheme']['C'],
          'G': this.widgets['alignView-customColorScheme']['G'],
          'T': this.widgets['alignView-customColorScheme']['T'],
          'ambig': this.widgets['alignView-customColorScheme']['ambig'],
          }
        this.useCustomColorScheme = true;
      }
    } else {
      this.useCustomColorScheme = false;
      this.colorScheme =   {
        A: '#33cc00',
        R: '#cc0000',
        N: '#6600cc',
        D: '#0033ff',
        C: '#ffff00',
        Q: '#6600cc',
        E: '#0033ff',
        G: '#33cc00',
        H: '#009900',
        I: '#33cc00',
        L: '#33cc00',
        K: '#cc0000',
        M: '#33cc00',
        F: '#009900',
        P: '#33cc00',
        S: '#0099ff',
        T: '#0099ff',
        W: '#009900',
        Y: '#009900',
        V: '#33cc00',
        X: '#ffffff'
      }
      
    }

    if (skipUpdateAlignment == false) {
      this.updateAlignment();
      if (this.widgets['alignView-showMiniMap']) {
        this.updateMiniMap();
      }
    }
  }

  /**
   * Updates the colorScheme for nt given with the e.target.value color
   * @param nt 'A' | 'C' | 'G' | 'T' | 'ambig'
   */
  updateColorScheme(nt, e) {
    this.colorScheme[nt] = e.target.value;
    this.widgets['alignView-customColorScheme'][nt] = e.target.value;
    this.updateAlignment();
    if (this.widgets['alignView-showMiniMap']) {
      this.updateMiniMap();
    }
  }

  /**
   * @param index 0=A, 1=C, 2=G, 3=T, anythingElse=ambig
   * @returns the value (hexvalue) from colorScheme based on the index given
   */
  fillColor(index:number) {
    if (this.selectedSeqType == 'aa') {
      switch (index) {
        //['A', 'R', 'N', 'D', 'C', 'E', 'Q', 'G', 'H', 'I', 'L', 'K', 'M', 'F', 'P', 'S', 'T', 'W', 'Y', 'V', '*', '-', 'X']
        case 0:
          return this.colorScheme['A']
        case 1:
          return this.colorScheme['R']
        case 2:
          return this.colorScheme['N']
        case 3:
          return this.colorScheme['D']
        case 4:
          return this.colorScheme['C']
        case 5:
          return this.colorScheme['E']
        case 6:
          return this.colorScheme['Q']
        case 7:
          return this.colorScheme['G']
        case 8:
          return this.colorScheme['H']
        case 9:
          return this.colorScheme['I']
        case 10:
          return this.colorScheme['L']
        case 11:
          return this.colorScheme['K']
        case 12:
          return this.colorScheme['M']
        case 13:
          return this.colorScheme['F']
        case 14:
          return this.colorScheme['P']
        case 15:
          return this.colorScheme['S']
        case 16:
          return this.colorScheme['T']
        case 17:
          return this.colorScheme['W']
        case 18:
          return this.colorScheme['Y']
        case 19:
          return this.colorScheme['V']
        case 22:
          return this.colorScheme['X']
        default:
          return this.colorScheme['X']
      }
    }
    if (index == 0) {
      return this.colorScheme['A'];
    } else if (index == 1) {
      return this.colorScheme['C'];
    } else if (index == 2) {
      return this.colorScheme['G'];
    } else if (index == 3) {
      return this.colorScheme['T'];
    } else {
      return this.colorScheme['ambig'];
    }
  }

  // Helper

  /**
   * Searches nodesWithSequences for name given; changes background color for all nodes that are found
   * @param name name/id of node to search for
   * @param field which field from node to search in
   */
  search(name: string, field: string) {
    $('.canvasLabels div').removeClass('searchHighlight2')
    if (name == "") {
      return;
    }

    let isFieldNumerical = typeof this.getData([this.nodesWithSeq[0]], field)[0] === 'number'

    let data = this.getData(this.nodesWithSeq, (field == 'index' ? ['index'] : ['index', field]))
    let indexes;
    if (isFieldNumerical) {
      indexes = data.filter((obj) => obj[field] == parseFloat(name)).map((obj) => obj['index'])
    } else {
      indexes = data.filter((obj) => obj[field].includes(name)).map((obj) => obj['index'])
    }
    //let indexes = this.nodesWithSeq.filter((obj) => obj.name.includes(name)).map((obj) => this.nodesWithSeq.indexOf(obj));
    if (indexes.length == 0) {
      console.log('not found');
      return;
    }

    for (let index of indexes) {
      //let element = $('.canvasLabels div').get(index);
      let element = $(`.canvasLabels div[data-index="${index}"]`)
      $(element).addClass('searchHighlight2')
    }

    // need to scroll if necessary
    let scroll = $('.canvasLabels').scrollTop();
    let topIndex = scroll/this.spanHeight;
    topIndex = (topIndex%1 > .2) ? Math.ceil(topIndex) : Math.floor(topIndex)
    let bottomIndex = Math.floor((this.canvasViewHeight-20) / this.spanHeight + topIndex -1);
    if (indexes[0] < topIndex || indexes[0] > bottomIndex) {
        let scrollPos = (indexes[0])*this.spanHeight -5
        $('.canvasLabels').scrollTop(scrollPos)
    }
    
  }

  /**
   * Replaces search function and better incorporates with all node-selected events and not node-selected from search
   */
  highlightRows() {
    $('.canvasLabels div').removeClass('searchHighlight2')
    let nodes = this.getData(this.nodesWithSeq, ['index', 'selected']);
    let selectedNodes = nodes.filter(node => node.selected);

    if (selectedNodes.length == 0) {
      return;
    }

    for (let node of selectedNodes) {
      //let element = $('.canvasLabels div').get(index);
      let element = $(`.canvasLabels div[data-index="${node.index}"]`)
      $(element).addClass('searchHighlight2')
    }
    let firstPositionSelected = nodes.indexOf(selectedNodes[0])

    // need to scroll if necessary
    let scroll = $('.canvasLabels').scrollTop();
    let topIndex = scroll/this.spanHeight;
    topIndex = (topIndex%1 > .2) ? Math.ceil(topIndex) : Math.floor(topIndex)
    let bottomIndex = Math.floor((this.canvasViewHeight-20) / this.spanHeight + topIndex -1);
    if (firstPositionSelected < topIndex || firstPositionSelected > bottomIndex) {
        let scrollPos = (firstPositionSelected)*this.spanHeight -5
        $('.canvasLabels').scrollTop(scrollPos)
    }
  }

  /**
   * Opens settings pane
   */
  openSettings() {
    //this.alignmentDialogSettings.isVisible ? this.alignmentDialogSettings.setVisibility(false) : this.alignmentDialogSettings.setVisibility(true);
    this.alignmentDialogSettings.isVisible = !this.alignmentDialogSettings.isVisible
  }

  /**
   * Updates text in Alignment Top
   */
  onAlignmentTopChange() {
    if (this.widgets['alignView-topDisplay'] == 'barplot') {
      $('#alignmnetTopTitle').text('Bar Plot').prop('title', 'Barplot representation of the sequences that shows the proportion of each nucleotide at each position.');
    } else {
      $('#alignmnetTopTitle').text('Logo').prop('title', 'Logo representation of the sequences that shows the proportion of each nucleotide at each position.');
    }
  }

  /** XXXX May need to remove; currently use position matrix instead of calculating each XXXX
   * @param i current index of the base/nt in proportion matrix
   * @param j A=0, C=1, G=2, T=3, other/ambiguos=4
   * @returns location for the y value of rectangle in the logo
   */
  calculateY(i:number, j:number) {
    if (j == 4) { return 0}
    let nt = this.proportionMatrix[i];
    let y = nt[4]*100;
    if (j==0) { return y }
    for (let k=0; k<j; k++) {
      y += nt[k]*100
    }
    return y;
  }

  /**
   * Sychronises horizonal scrolls on canvasHolder with alignmentTop and vertical scrolls on canvasHolder with canvasLabels
   * @param canvasHolder div class="canvasHolder"
   * @param canvasLabels div class="canvasLabels"
   * @param alignmentTop div class="alignmentTop"
   */
  canvasScroll(canvasHolder: HTMLElement, canvasLabels: HTMLElement, alignmentTop: HTMLElement) {
    if (canvasHolder.scrollLeft != alignmentTop.scrollLeft) {
      alignmentTop.scrollLeft = canvasHolder.scrollLeft
    }
    if (canvasHolder.scrollTop != canvasLabels.scrollTop) {
      canvasLabels.scrollTop = canvasHolder.scrollTop;
    }   
  }


  /**
  * Generate a tabular HTML string from the index of proportionMatrix
  * @param data index of the position to use to make the HTML string of the table
  * @returns an HTML string with a table representation of the data
  */
  tabulate(index) {
    let dataType = this.selectedSeqType == 'aa' ? 'AA': 'NT'

    let tableHtml = `
        <style>
        #tooltip-table {
            border-spacing: 0;
            width: 100%;
            border: 1px solid #ddd;
            z-index: 1000;
        }
        
        #tooltip-table td, #tooltip-table th {
            text-align: left;
            padding: 2px;
            border: 1px solid #ddd;
        }
        
        #tooltip-table tr:nth-child(even) {
            background-color: #f2f2f2;
        }
        
        #tooltip-table tr:nth-child(odd) {
            background-color: #fff;
        }
        </style>
        <div>Position: ${index+1}</div>
        <table id="tooltip-table"><thead><th>${dataType}</th><th> % </th></thead><tbody>`;

        
        if (this.selectedSeqType == 'aa') {
          let data = this.proportionMatrixAA[index];
          let nonZeroIndexes = [];
          let index2NT = ['A', 'R', 'N', 'D', 'C', 'E', 'Q', 'G', 'H', 'I', 'L', 'K', 'M', 'F', 'P', 'S', 'T', 'W', 'Y', 'V', 'STOP', 'GAP', 'UNK'];
          data.forEach((value, index) => {
            if (value > 0) nonZeroIndexes.push(index);
          })
          nonZeroIndexes.sort(compareIndices);
          function compareIndices(a,b) {
            return data[b] - data[a]
          }
          let numberOfRows = Math.min(4, nonZeroIndexes.length)
          let sum = 0;
          for (let i = 0; i< numberOfRows; i++) {
            let AAindex = nonZeroIndexes[i];
            tableHtml += `<tr><td>${index2NT[AAindex]}</td><td>`+(data[AAindex]*100).toFixed(1) +'%</td>';
            sum += data[AAindex];
          }
          if (sum <= 0.99) {
            tableHtml += `<tr><td>Other</td><td>`+((1-sum)*100).toFixed(1) +'%</td>';
          }
          
        } else {
          for (let i = 0; i<5; i++) {
            let data = this.proportionMatrix[index]
            tableHtml += '<tr>';
            if (i == 0) {
              tableHtml += '<td>A</td><td>' + (data[i]*100).toFixed(1) + '%</td>';
            } else if (i == 1) {
              tableHtml += '<td>C</td><td>' + (data[i]*100).toFixed(1) + '%</td>';
            } else if (i == 2) {
              tableHtml += '<td>G</td><td>' + (data[i]*100).toFixed(1) + '%</td>';
            } else if (i == 3) {
              tableHtml += '<td>T</td><td>' + (data[i]*100).toFixed(1) + '%</td>';
            } else {
              tableHtml += '<td>other</td><td>' + (data[i]*100).toFixed(1) + '%</td>'
            }
            tableHtml += '</tr>';
          } 
        }
        
    tableHtml += '</tbody></table>';

    return tableHtml;
  }

  /**
  * @returns an array [X, Y] of the position of mouse relative to alignment view. Global position (i.e. d3.event.pageX) doesn't work for a dashboard
  */  
  getRelativeMousePosition(e) {
    let rect = document.querySelector('alignmentviewcomponent').getBoundingClientRect();
    let X = e.pageX - rect.left;
    let Y = e.pageY - rect.top; 
    return [X, Y];
  }

  /**
   * Set events such as node-selected so that they can be triggered; such as with search
   */
  setEvents() {
    let that = this;

    $(document).on( "node-selected", function( ) {  
      //that.search($('#search').val() as string, $('#search-field').val() as string)
      that.highlightRows();
    });

  }

  /**
   * updates labelArray and then searches again if needed
   */
  onLabelFieldChange() {
    this.labelArray = this.getData(this.nodesWithSeq, ['index', this.widgets['alignView-labelField']])
    
    setTimeout(()=>this.highlightRows(), 1);
  }

  /**
   * Sorts the indexes in nodesWithSeq based on the field selected. 
   * After updating nodesWithSeq, it updates labelArray, seqArray, seqArrayShortened, main canvas, and minimap
   */
  onSortFieldChange() {
    let newSort;
    let sortField = this.widgets['alignView-sortField']
    if (sortField == "None") {
      return;
    } else if ( sortField == "index") {
      //return
      newSort = this.getData(this.nodesWithSeq, [sortField]).sort((a,b) => a[sortField] -b[sortField]);
      //this.nodesWithSeq.sort((a,b) => )
    } else if (typeof this.getData([this.nodesWithSeq[0]], sortField)[0] == 'number') {
      newSort = this.getData(this.nodesWithSeq, ['index', sortField]).sort((a,b) => a[sortField] - b[sortField]);
    } else {
      newSort = this.getData(this.nodesWithSeq, ['index', sortField]).sort((a,b) => a[sortField].localeCompare(b[sortField]));
    }

    // updates nodesWithSeq
    this.nodesWithSeq = newSort.map((obj) => obj['index'])
    // updates labelArray with new sort
    this.onLabelFieldChange();

    // updates seqArray with new order
    this.seqArray = this.getData(this.nodesWithSeq, 'seq');

    // updates seqArrayShortened with new order
    this.shortenNodesWithSeq();

    // updates main canvas and minimap canvas
    this.updateAlignment();
  }

  
  updateNodeColors() { }
  updateLinkColor() { }

  updateVisualization() {
  }

  // function is called when style file is applied
  applyStyleFileSettings() {
    this.widgets = (window as any).context.commonService.session.style.widgets;

    this.labelArray = this.getData(this.nodesWithSeq, ['index', this.widgets['alignView-labelField']]);

    // sets different variables relating to size and display
    this.onAlignmentTopChange()

    if (this.widgets['alignView-colorSchemeName'] == 'n' || this.widgets['alignView-colorSchemeName'] == 'a') {
      this.useCustomColorScheme = false;
    } else {
      this.useCustomColorScheme = true;
    }
    this.onSelectedColorChanged(true)

    // updates spanWidth, spanHeight, rightWidth, leftWidth, fontSize, and then updates alignment
    this.onSelectedSizeChanged()

    // updates shows or hides minimap and then updates view heights
    this.updateMiniMapVisibility()
  }

  goldenLayoutComponentResize() {
    this.updateViewHeights()
    this.rightWidth = this.calculateRightWidth()
  }

  openRefreshScreen() {
    
  }
  onRecallSession() {
    
  }
  onLoadNewData() {   
  }
  onFilterDataChange() {
    
  }

  /**
   * Opens the Alignment View Export Pain
  */
  openExport() {
    this.ShowAlignExportPane = true;
  }

  /**
   * Exports the alignmentTop and main canvas as png image
   */
  exportPNG() {
    let that = this;
    let alignmentTop = document.querySelector('#alignmentTop svg');
    let mainCanvas = $('.canvasHolder canvas').get(0) as HTMLCanvasElement
    let exportWidth = mainCanvas.width
    let exportHeight = mainCanvas.height + 140;
    svgAsPngUri(alignmentTop, {
      scale: 1,
      backgroundColor: '#ffffff',
      encoderType: 'image/png',
      encoderOptions: 0.8
    }).then((topB64string) => {
      let imageDataUrl;

      let exportCanvas = document.createElement("canvas");
      exportCanvas.height = exportHeight;
      exportCanvas.width = exportWidth;
      let ctx = exportCanvas.getContext("2d");

      let iTop = new Image();
      let iMain = new Image();
      iTop.src = topB64string;
      iTop.onload = function() {
        iMain.src = mainCanvas.toDataURL()
        iMain.onload = function() {

          ctx.drawImage(iTop, 0, 0)
          ctx.drawImage(iMain, 0, 140)

          imageDataUrl = exportCanvas.toDataURL("image/png")
          saveAs(imageDataUrl, that.AlignmentExportFileName + '.png')
        }
      }
  }); 
  }

  /**
   * Exports the alignment top and main canvas as svg or png image
   */
  exportVisualization() {
    $("body").css("cursor", "progress");
    if (this.AlignmentExportFileTypeVis == 'png') {
      this.exportPNG();
    } else {
      
    let canvas = $('.canvasHolder canvas').get(0) as HTMLCanvasElement
    let canvasDataURL = canvas.toDataURL();
  
    let foreignObj = document.createElementNS('http://www.w3.org/2000/svg', 'image')
    foreignObj.setAttribute('x', '0'); // Set the x-coordinate
    foreignObj.setAttribute('y', '140'); // Set the y-coordinate
    foreignObj.setAttribute('width', canvas.width.toString()); // Set the width
    foreignObj.setAttribute('height', canvas.height.toString()); // Set the height
    foreignObj.setAttribute('xlink:href', canvasDataURL);

    let top = $('#alignmentTop svg').get(0)
    top.style.height = 150+canvas.height+'px'
    top.appendChild(foreignObj);

    let content = this.commonService.unparseSVG(top);
    let blob = new Blob([content], { type: 'image/svg+xml;charset=utf-8' });
    saveAs(blob, this.AlignmentExportFileName + '.svg');

    top.style.height = 150+canvas.height+'px';
    top.removeChild(foreignObj)
    }
    $("body").css("cursor", "default");
  }

  /**
   * Exports sequencing data (id + seq string) as fasta or mega file
   */
  exportData(includeConsensus=false) {
    let data, consensus, megaFormat;
    if (this.selectedSeqType == 'aa') {
      let labels = this.getData(this.nodesWithSeq, '_id')
      data = labels.map((id, index) => ({ '_id': id, seq: this.seqArray[index] }));
      consensus = includeConsensus? this.getConsensus(this.proportionMatrixAA, 'plurality', 'aa') : '';
      megaFormat = 'DataType=Protein Missing=X Indel=-;\r\n\r\n'
    } else {
      data = this.getData(this.nodesWithSeq, ['_id', 'seq']);
      consensus = includeConsensus? this.getConsensus(this.proportionMatrix) : '';
      megaFormat = 'DataType=DNA CodeTable=Standard\r\n\tIdentical=. Missing=? Indel=-;\r\n\r\n'
    }
    if (this.AlignmentExportFileTypeData == 'fasta') {
      let consensusString = includeConsensus? '>consensus\r\n' + consensus + "\r\n":'';
      let blob = new Blob([consensusString, data.map(node => ">" + node._id + "\r\n" + node.seq).join("\r\n")])
      saveAs(blob, this.AlignmentExportFileName+'.fasta')
    } else if (this.AlignmentExportFileTypeData == 'mega') {
      let headers = "#mega\r\n!Title " + this.AlignmentExportFileName + ";\r\n!Format\r\n\t" + megaFormat;
      let consensusString = includeConsensus? '#consensus\r\n' + consensus + "\r\n" : '';
      let blob = new Blob([headers, consensusString, data.map(node => "#" + node._id + "\r\n" + node.seq).join("\r\n")])
      saveAs(blob, this.AlignmentExportFileName+'.meg')
    }
  }

  exportDataTable(option='basic', includeConsensus) {
    // basic 5 number for each position     // may not use basic option but keeping it for now
    // advances includes proportion for gaps and each ambiguous nucleotide option
    // [A, C, G, T, #other/ambig]
    let csvString;
    if (option == 'basic') {
      let csvHeader = 'A,C,G,T,other (including gap and abiguous)\n';
      csvString = csvHeader + this.proportionMatrix.map(innerArray => innerArray.join(',')).join('\n');
    } else if (includeConsensus) {
      let csvHeader;
      let proportionMatrix;
      let consensus;
      if (this.selectedSeqType =='aa') {
        csvHeader = 'position,consensus,"consensus ambiguities (most prevalent AA outside of brackets, other AAs found at this position inside brackets)",A,R,N,D,C,E,Q,G,H,I,L,K,M,F,P,S,T,W,Y,V,stop,gap,ambiguous\n';
        proportionMatrix = this.proportionMatrixAA;
        consensus = this.getConsensus(proportionMatrix, 'meme', 'aa')
      } else {
        csvHeader = 'position,consensus,"consensus ambiguities (most prevalent NT outside of brackets, other NTs found at this position inside brackets)",A,C,G,T,gap,N,R,Y,K,M,S,W,B,D,H,V,other\n';
        proportionMatrix= this.calculateAdvancedProportion();
        consensus = this.getConsensus(proportionMatrix, 'meme')
      }
       
      let consensusInterator = getNextPosition(consensus);
      csvString = csvHeader + proportionMatrix.map((innerArray,pos) => {
        let chars = consensusInterator.next().value;
        return (pos+1) + ',' + chars.charAt(0)+',' + chars + ',' + innerArray.join(',')
      }).join('\n');
    } else {
      let proportionMatrix;
      let csvHeader;
      if (this.selectedSeqType == 'aa') {
        csvHeader = 'position,A,R,N,D,C,E,Q,G,H,I,L,K,M,F,P,S,T,W,Y,V,stop,gap,ambiguous\n';
        proportionMatrix = this.proportionMatrixAA;
      } else {
        csvHeader = 'position,A,C,G,T,gap,N,R,Y,K,M,S,W,B,D,H,V,other\n';
        proportionMatrix = this.calculateAdvancedProportion();
      }

      csvString = csvHeader + proportionMatrix.map((innerArray,pos) => (pos+1)+ ',' + innerArray.join(',')).join('\n');
    }
    function* getNextPosition(input) {
      for (let i = 0; i < input.length; i++) {
        const char = input[i];
        if (input[i+1] === '[') {
            // Yield the character and everything in the brackets
            let bracketContent = '';
            while (input[i] !== ']') {
                bracketContent += input[i];
                i++;
            }
            bracketContent += ']';
            yield bracketContent;
        } else {
            // Yield individual characters
            yield char;
        }
      }
    }

    let blob = new Blob([csvString], { type: 'text/csv' })
    saveAs(blob, this.AlignmentExportFileName + '.csv')
  }

  /** Gets the consensus sequence of a NT or AA sequence, defined by most common char at a position (not based on meeting a threshold);
   * 
   * Option: 
   ** 'pluratily' returns just the sequence of most common bases
   ** 'meme' return the most common base, then adds other bases found at that position in brackets.
   * 
   * Given all A at first 1, and 70% C and 30% A at 2nd pos, plurality returns 'AC', 'meme' returns 'AC[A]'
   */
  getConsensus(proportionMatrix, option='plurality', seq='nt') {
    let consensusSeq = '';
    if (option == 'plurality') {
      let index2NT = seq == 'nt' ? ['A', 'C', 'G', 'T', '-'] : ['A', 'R', 'N', 'D', 'C', 'E', 'Q', 'G', 'H', 'I', 'L', 'K', 'M', 'F', 'P', 'S', 'T', 'W', 'Y', 'V', '*', '-', 'X']
      proportionMatrix.forEach((row) => {
        let maxPos = row.indexOf(Math.max(...row));
        if (maxPos > 4 && seq=='nt') {consensusSeq += 'N'}
        else {consensusSeq += index2NT[maxPos];}
      })
      return consensusSeq;
    } else if (option == 'meme') {
      let index2NT = seq == 'nt' ?  ['A','C','G','T','-','N','R','Y','K','M','S','W','B','D','H','V', 'invalid'] : ['A', 'R', 'N', 'D', 'C', 'E', 'Q', 'G', 'H', 'I', 'L', 'K', 'M', 'F', 'P', 'S', 'T', 'W', 'Y', 'V', '*', '-', 'X'];
      proportionMatrix.forEach((row) => {
        let nonZeroIndexes = [];
        row.forEach((value, index) => {
          if (value > 0) nonZeroIndexes.push(index);
        })
        nonZeroIndexes.sort(compareIndices);
        function compareIndices(a,b) {
          return row[b] - row[a]
        }
        nonZeroIndexes.forEach((index, pos) => {
          if (pos == 1) {
            consensusSeq += '['
          }
          consensusSeq += index2NT[index]
        })
        if (nonZeroIndexes.length > 1) consensusSeq+=']'
      })

      return consensusSeq;
    }
  }
}

export namespace AlignmentViewComponent {
  export const componentTypeName = 'Alignment View';
}

