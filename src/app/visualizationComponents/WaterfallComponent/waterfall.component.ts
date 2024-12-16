import { Component, OnInit, ViewChild, ElementRef, Inject, AfterViewInit } from '@angular/core';
import { Table } from 'primeng/table';
import { ComponentContainer } from 'golden-layout';
import { GoogleTagManagerService } from 'angular-google-tag-manager';

import { CommonService } from '../../contactTraceCommonServices/common.service';
import { MicobeTraceNextPluginEvents } from '../../helperClasses/interfaces';
import { BaseComponentDirective } from '@app/base-component.directive';


@Component({
  selector: 'app-waterfall-component',
  templateUrl: './waterfall.component.html',
  styleUrls: ['./waterfall.component.scss']
})
export class WaterfallComponent extends BaseComponentDirective implements OnInit, AfterViewInit, MicobeTraceNextPluginEvents {

  @ViewChild('clusterTable') clusterTable: Table;
  @ViewChild('nodeTable') nodeTable: Table;
  @ViewChild('linkTable') linkTable: Table;

  clusterTableData: any;
  nodeTableData: any;
  linkTableData: any;

  clusterTableWidth: any;
  nodeTableWidth: number;
  linkTableWidth: any;

  scrollHeight= '800px';
  IsDataAvailable =  true;

  metaDataToSkip = ['index', 'id', 'visible', 'degree', 'seq', 'cluster', 'directed', 'source', 'target']

  selectedNodeRow: any;
  selectedLinkRow: any;

  expandedClusterRowData: any = [];
  expandedNodeRowData: any = [];
  expandedLinkRowData: any = [];

  constructor(
    @Inject(BaseComponentDirective.GoldenLayoutContainerInjectionToken) private container: ComponentContainer, 
    elRef: ElementRef,
    private commonService: CommonService,
    private gtmService: GoogleTagManagerService
    ) {

    super(elRef.nativeElement);
    this.commonService.visuals.waterfall = this;
  }

  ngOnInit() {
    this.gtmService.pushTag({
      event: "page_view",
      page_location: "/waterfall",
      page_title: "Waterfall View"
    });

    this.clusterTableData = [];
    this.nodeTableData = [];
    this.linkTableData = [];

    this.commonService.session.data.clusters.forEach((cl) => {
      this.clusterTableData.push({'id': cl.id, 'nodeCount': cl.nodes})
    })

    // TODO: XXX revisit; doesn't always do as expected when view is resized; also make sure height is correct (currently set to 800px static)
    this.container.on('resize', () => { 
      this.updateTableWidths()
    })

  }

  ngAfterViewInit() {
    this.updateTableWidths();
  }

  updateTableWidths() {
    this.clusterTableWidth = (this.clusterTable as any)._totalTableWidth().reduce((total, current ) => total += current, 0) - 28;
    this.nodeTableWidth = (this.nodeTable as any)._totalTableWidth().reduce((total, current ) => total += current, 0) - 28;
    this.linkTableWidth = (this.linkTable as any)._totalTableWidth().reduce((total, current ) => total += current, 0) - 28;
  }

  onClusterRowSelect(e) {
    let clusterID = e.data.id;
    this.nodeTableData = [];
    // why are these different and why is session.data.nodes and nodeFilteredValues wrong for degree? session.network.nodes might be correct for a different distance and isn't updated?
    // TODO: XXX need to update how degree is calculated so it's correct centrally instead of calculating here
    this.commonService.session.data.nodeFilteredValues.forEach(node => {
    //this.commonService.session.network.nodes.forEach(node => {
      if (node.cluster == clusterID) {
        let degreeCount =  this.commonService.session.data.links.filter(link => { return link.visible && (link.source == node._id|| link.target == node._id)}).length;
        if (node.index == 0) { console.log('here: ', node, degreeCount)}
        this.nodeTableData.push({'id': node._id, 'degree': degreeCount})
      }
    })

    let cluster = this.commonService.session.data.clusters.find(cl => cl.id == clusterID)
    this.expandedClusterRowData = [];
    Object.keys(cluster).filter(k => !(this.metaDataToSkip.includes(k) || k.charAt(0) == '_' || typeof cluster[k] == 'object')).forEach(k => {
      let prop = this.commonService.titleize(k)
      this.expandedClusterRowData.push({'key': prop, 'value': cluster[k]});
    })

    this.selectedNodeRow = null;
    this.selectedLinkRow = null;
    this.linkTableData = [];
    this.expandedNodeRowData = [];
    this.expandedLinkRowData = [];
  }

  onClusterRowUnselect() {
    this.selectedNodeRow = null;
    this.selectedLinkRow = null;
    this.nodeTableData = [];
    this.linkTableData = [];

    this.expandedClusterRowData = [];
    this.expandedNodeRowData = [];
    this.expandedLinkRowData = [];
  }

  onNodeRowSelect(e) {
    let node = e.data.id;
    this.linkTableData = []
    this.commonService.session.data.links.forEach(link => {
      if (link.visible) {
        if (node)
        if (link.source == node) {
          this.linkTableData.push({'id': link.target, 'distance': link.distance, 'index': link.index})
        } else if (link.target == node) {
          this.linkTableData.push({'id': link.source, 'distance': link.distance, 'index': link.index})
        }
      }
    })

    let nodeData = this.commonService.getVisibleNodes().find(n => n._id == node); 
    this.expandedNodeRowData = []
    Object.keys(nodeData).filter(k => !(this.metaDataToSkip.includes(k) || k.charAt(0) == '_' || typeof nodeData[k] == 'object')).forEach(k => {
      let prop = this.commonService.titleize(k)
      this.expandedNodeRowData.push({'key': prop, 'value':nodeData[k]});
    })

    this.selectedLinkRow = null;
    this.expandedLinkRowData = [];
  }

  onNodeRowUnselect() {
    this.linkTableData = [];
    this.selectedLinkRow = null;
    this.expandedNodeRowData = [];
    this.expandedLinkRowData = [];
  }

  onLinkRowSelect(e) {
    let linkIndex = e.data.index;
    let linkData = this.commonService.session.data.links.find(l => l.index == linkIndex)
    this.expandedLinkRowData = [];
    Object.keys(linkData).filter(k => !(this.metaDataToSkip.includes(k) || k.charAt(0) == '_' || typeof linkData[k] == 'object')).forEach(k => {
      let prop = this.commonService.titleize(k)
      this.expandedLinkRowData.push({'key': prop, 'value': linkData[k]});
    })

  }

  onLinkRowUnselect() {
    this.expandedLinkRowData = [];
  }

  updateNodeColors() {}
  updateVisualization() {}
  applyStyleFileSettings() {}
  updateLinkColor() {}
  openRefreshScreen() {}
  openExport() {}
  onFilterDataChange() {}
  onRecallSession() {}
  onLoadNewData() {}
}

export namespace WaterfallComponent {
  export const componentTypeName = 'Waterfall';
}