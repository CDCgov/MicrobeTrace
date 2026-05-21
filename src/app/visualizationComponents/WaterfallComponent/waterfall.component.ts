import { Component, OnInit, ViewChild, ElementRef, ChangeDetectorRef, Inject, AfterViewInit, OnDestroy } from '@angular/core';
import { Table } from 'primeng/table';
import { ComponentContainer } from 'golden-layout';
import { GoogleTagManagerService } from 'angular-google-tag-manager';

import { CommonService } from '../../contactTraceCommonServices/common.service';
import { MicobeTraceNextPluginEvents } from '../../helperClasses/interfaces';
import { BaseComponentDirective } from '@app/base-component.directive';
import { Subject, takeUntil } from 'rxjs';
import { CommonStoreService } from '@app/contactTraceCommonServices/common-store.services';
import { buildVisibleClusterSummary, type VisibleClusterSummary } from '@app/contactTraceCommonServices/threshold-analysis';

@Component({
    selector: 'app-waterfall-component',
    templateUrl: './waterfall.component.html',
    styleUrls: ['./waterfall.component.scss'],
    standalone: false
})
export class WaterfallComponent extends BaseComponentDirective implements OnInit, AfterViewInit, MicobeTraceNextPluginEvents, OnDestroy {

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

  metaDataToSkip = ['index', 'id', 'visible', 'degree', 'seq', 'cluster', 'directed', 'source', 'target', 'x', 'y', 'vx', 'vy', 'nodeSize']

  selectedClusterRow: any;
  selectedNodeRow: any;
  selectedLinkRow: any;

  clusterExpandedRowKeys: Record<string, boolean> = {};
  nodeExpandedRowKeys: Record<string, boolean> = {};
  linkExpandedRowKeys: Record<string, boolean> = {};

  expandedClusterRowData: any = [];
  expandedNodeRowData: any = [];
  expandedLinkRowData: any = [];

  private viewActive = true;
  private visibleNodes: any[] = [];
  private visibleLinks: any[] = [];
  private visibleClusterSummary: VisibleClusterSummary = {
    clusters: [],
    nodeClusterByIndex: [],
    linkClusterByIndex: [],
    degrees: [],
    largestClusterSize: 0,
    singletonCount: 0,
    clusterCount: 0
  };
  private destroy$ = new Subject<void>();

  constructor(
    @Inject(BaseComponentDirective.GoldenLayoutContainerInjectionToken) private container: ComponentContainer, 
    elRef: ElementRef,
    private commonService: CommonService,
    private cdref: ChangeDetectorRef,
    private store: CommonStoreService,
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
    this.refreshFromSession(false);

    this.container.on('resize', () => { 
      this.goldenLayoutComponentResize()
    })
    this.container.on('hide', () => {
      this.viewActive = false;
      this.cdref.detectChanges();
    })
    this.container.on('show', () => {
      this.viewActive = true;
      this.refreshFromSession();
      this.goldenLayoutComponentResize();
      this.cdref.detectChanges();
    })

    this.store.clusterUpdate$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.refreshFromSession();
    })

    this.store.networkUpdated$.pipe(takeUntil(this.destroy$)).subscribe((networkUpdated) => {
      if (this.viewActive && networkUpdated) {
        this.refreshFromSession();
        this.store.setNetworkUpdated(false);
      }
    })

  }

  ngAfterViewInit() {
    this.goldenLayoutComponentResize();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  goldenLayoutComponentResize() {
    this.clusterTableWidth = this.nodeTableWidth = this.linkTableWidth = 0;
    this.cdref.detectChanges();
    if (!this.clusterTable || !this.nodeTable || !this.linkTable) {
      let emptyHeight = this.container.height - 50;
      this.scrollHeight = `${emptyHeight}px`
      this.cdref.detectChanges();
      return;
    }
    this.clusterTableWidth = (this.clusterTable as any)._totalTableWidth().reduce((total, current ) => total += current, 0) - 28;
    this.nodeTableWidth = (this.nodeTable as any)._totalTableWidth().reduce((total, current ) => total += current, 0) - 28;
    this.linkTableWidth = (this.linkTable as any)._totalTableWidth().reduce((total, current ) => total += current, 0) - 28;

    let height = this.container.height - 50;
    this.scrollHeight = `${height}px`
    this.cdref.detectChanges();
  }

  private markWaterfallRendered() {
    if (!this.viewActive || !this.IsDataAvailable) return;

    // Waterfall can be the first rendered view on launch, so it must release
    // the shared processing modal without waiting for a 2D network callback.
    setTimeout(() => {
      this.store.setNetworkRendered(true);
    });
  }

  private refreshVisibleState() {
    this.visibleNodes = this.commonService.getVisibleNodesIgnoringTimeline();

    const visibleNodeIds = new Set(this.visibleNodes.map(node => String(node._id ?? node.id)));
    this.visibleLinks = this.commonService.getVisibleLinksIgnoringTimeline().filter(link => (
      link.visible &&
      visibleNodeIds.has(String(link.source)) &&
      visibleNodeIds.has(String(link.target))
    ));

    this.visibleClusterSummary = buildVisibleClusterSummary(
      this.visibleNodes,
      this.visibleLinks,
      this.commonService.session.style.widgets["link-sort-variable"]
    );
  }

  private getVisibleClusters() {
    return this.visibleClusterSummary.clusters;
  }

  private getVisibleLinksForWaterfall() {
    return this.visibleLinks;
  }

  private getVisibleNodesForWaterfall() {
    return this.visibleNodes;
  }

  private getVisibleClusterById(clusterID: any) {
    return this.getVisibleClusters().find(cluster => String(cluster.id) === String(clusterID));
  }

  private updateIsDataAvailable() {
    this.IsDataAvailable = (
      this.getVisibleClusters().length > 0 ||
      this.getVisibleNodesForWaterfall().length > 0 ||
      this.getVisibleLinksForWaterfall().length > 0
    );
  }

  private buildClusterTableData() {
    return this.getVisibleClusters().map(cluster => ({ 'id': cluster.id, 'nodeCount': cluster.nodes }));
  }

  private buildNodeTableData(clusterID: any) {
    return this.getVisibleNodesForWaterfall()
      .map((node, index) => ({ node, index }))
      .filter(({ index }) => String(this.visibleClusterSummary.nodeClusterByIndex[index]) === String(clusterID))
      .map(({ node, index }) => {
        const nodeId = String(node._id ?? node.id);
        const degreeCount = this.visibleClusterSummary.degrees[index] ?? 0;
        return { 'id': nodeId, 'degree': degreeCount };
      });
  }

  private getClusterMemberIds(clusterID: any) {
    return this.getVisibleNodesForWaterfall()
      .map((node, index) => ({ node, index }))
      .filter(({ index }) => String(this.visibleClusterSummary.nodeClusterByIndex[index]) === String(clusterID))
      .map(({ node }) => String(node._id ?? node.id))
      .sort();
  }

  private getVisibleNodeById(nodeId: any) {
    return this.getVisibleNodesForWaterfall()
      .find(node => String(node._id ?? node.id) === String(nodeId));
  }

  private buildClusterExpandedRowData(clusterID: any) {
    const cluster = this.getVisibleClusterById(clusterID);
    return this.buildExpandedRowData(cluster, true);
  }

  private buildNodeExpandedRowData(nodeId: any) {
    return this.buildExpandedRowData(this.getVisibleNodeById(nodeId));
  }

  private buildLinkExpandedRowData(linkIndex: any) {
    const link = this.getVisibleLinksForWaterfall().find(candidate => Number(candidate.index) === Number(linkIndex));
    return this.buildExpandedRowData(link);
  }

  private getEndpointId(endpoint: any): string {
    if (endpoint && typeof endpoint === 'object') {
      return String(endpoint._id ?? endpoint.id ?? '');
    }

    return String(endpoint ?? '');
  }

  private setClusterExpandedRow(clusterId: any) {
    this.clusterExpandedRowKeys = clusterId == null ? {} : { [String(clusterId)]: true };
    if (this.clusterTable) {
      this.clusterTable.expandedRowKeys = this.clusterExpandedRowKeys;
    }
  }

  private setNodeExpandedRow(nodeId: any) {
    this.nodeExpandedRowKeys = nodeId == null ? {} : { [String(nodeId)]: true };
    if (this.nodeTable) {
      this.nodeTable.expandedRowKeys = this.nodeExpandedRowKeys;
    }
  }

  private setLinkExpandedRow(linkIndex: any) {
    this.linkExpandedRowKeys = linkIndex == null ? {} : { [String(linkIndex)]: true };
    if (this.linkTable) {
      this.linkTable.expandedRowKeys = this.linkExpandedRowKeys;
    }
  }

  private clearNodeTableSelection() {
    if (!this.nodeTable) return;
    this.nodeTable.selection = null;
    this.nodeTable.selectionChange.emit(null);
    this.setNodeExpandedRow(null);
    this.nodeTable.onRowCollapse.emit(null);
  }

  private clearLinkTableSelection() {
    if (!this.linkTable) return;
    this.linkTable.selection = null;
    this.linkTable.selectionChange.emit(null);
    this.setLinkExpandedRow(null);
    this.linkTable.onRowCollapse.emit(null);
  }

  private clearNodeAndLinkState() {
    this.clearNodeTableSelection();
    this.clearLinkTableSelection();
    this.selectedNodeRow = null;
    this.selectedLinkRow = null;
    this.nodeTableData = [];
    this.linkTableData = [];
    this.expandedNodeRowData = [];
    this.expandedLinkRowData = [];
    this.setNodeExpandedRow(null);
    this.setLinkExpandedRow(null);
  }

  private clearLinkState() {
    this.clearLinkTableSelection();
    this.selectedLinkRow = null;
    this.linkTableData = [];
    this.expandedLinkRowData = [];
    this.setLinkExpandedRow(null);
  }

  private refreshFromSession(preserveSelection = true) {
    const previousClusterId = preserveSelection ? this.selectedClusterRow?.id : null;
    const previousNodeId = preserveSelection ? this.selectedNodeRow?.id : null;
    const previousLinkIndex = preserveSelection ? this.selectedLinkRow?.index : null;
    const previousClusterMemberIds = preserveSelection && previousClusterId != null
      ? [...(this.nodeTableData || []).map(row => String(row.id))].sort()
      : [];

    this.refreshVisibleState();
    this.updateIsDataAvailable();
    this.clusterTableData = this.buildClusterTableData();

    if (previousClusterId == null) {
      this.selectedClusterRow = null;
      this.expandedClusterRowData = [];
      this.setClusterExpandedRow(null);
      this.clearNodeAndLinkState();
      this.cdref.detectChanges();
      this.markWaterfallRendered();
      return;
    }

    const nextClusterRow = previousClusterMemberIds.length > 0
      ? this.clusterTableData.find(row => {
        const currentMemberIds = this.getClusterMemberIds(row.id);
        return currentMemberIds.length === previousClusterMemberIds.length &&
          currentMemberIds.every((memberId, index) => memberId === previousClusterMemberIds[index]);
      })
      : this.clusterTableData.find(row => String(row.id) === String(previousClusterId));
    if (!nextClusterRow) {
      this.selectedClusterRow = null;
      this.expandedClusterRowData = [];
      this.setClusterExpandedRow(null);
      this.clearNodeAndLinkState();
      this.clearClusterTableSelection();
      this.cdref.detectChanges();
      this.markWaterfallRendered();
      return;
    }

    this.selectedClusterRow = nextClusterRow;
    this.expandedClusterRowData = this.buildClusterExpandedRowData(nextClusterRow.id);
    this.setClusterExpandedRow(nextClusterRow.id);
    this.nodeTableData = this.buildNodeTableData(nextClusterRow.id);

    if (previousNodeId == null) {
      this.selectedNodeRow = null;
      this.clearLinkState();
      this.expandedNodeRowData = [];
      this.setNodeExpandedRow(null);
      this.cdref.detectChanges();
      this.markWaterfallRendered();
      return;
    }

    const nextNodeRow = this.nodeTableData.find(row => String(row.id) === String(previousNodeId));
    if (!nextNodeRow) {
      this.selectedNodeRow = null;
      this.expandedNodeRowData = [];
      this.setNodeExpandedRow(null);
      this.clearLinkState();
      this.cdref.detectChanges();
      this.markWaterfallRendered();
      return;
    }

    this.selectedNodeRow = nextNodeRow;
    this.expandedNodeRowData = this.buildNodeExpandedRowData(previousNodeId);
    this.setNodeExpandedRow(previousNodeId);
    this.linkTableData = this.buildLinkTableData(previousNodeId);

    if (previousLinkIndex == null) {
      this.selectedLinkRow = null;
      this.expandedLinkRowData = [];
      this.setLinkExpandedRow(null);
      this.cdref.detectChanges();
      this.markWaterfallRendered();
      return;
    }

    const nextLinkRow = this.linkTableData.find(row => Number(row.index) === Number(previousLinkIndex));
    if (!nextLinkRow) {
      this.selectedLinkRow = null;
      this.expandedLinkRowData = [];
      this.setLinkExpandedRow(null);
      this.cdref.detectChanges();
      this.markWaterfallRendered();
      return;
    }

    this.selectedLinkRow = nextLinkRow;
    this.expandedLinkRowData = this.buildLinkExpandedRowData(previousLinkIndex);
    this.setLinkExpandedRow(previousLinkIndex);
    this.cdref.detectChanges();
    this.markWaterfallRendered();
  }

  private buildExpandedRowData(source: any, formatClusterSummary = false) {
    if (!source) return [];

    return Object.keys(source)
      .filter(k => !(this.metaDataToSkip.includes(k) || k.charAt(0) == '_' || typeof source[k] == 'object'))
      .map(k => {
        const prop = this.commonService.titleize(k);
        const isNumericValue = typeof source[k] == 'number';
        const shouldFormatClusterDistance = formatClusterSummary && k == 'mean_genetic_distance' && isNumericValue;
        const shouldFormatLinksPerNode = formatClusterSummary && k == 'links_per_node' && isNumericValue;
        const shouldFormatLinkDistance = k == 'distance' && isNumericValue;

        let value = source[k];

        if (shouldFormatClusterDistance) {
          value = this.commonService.tn93PercentageDisplayEnabled('mean_genetic_distance')
            ? this.commonService.formatDisplayedDistanceValue(source[k], 'mean_genetic_distance')
            : Number(source[k]).toFixed(3);
        } else if (shouldFormatLinksPerNode) {
          value = Number(source[k]).toFixed(3);
        } else if (shouldFormatLinkDistance) {
          value = this.commonService.formatDisplayedDistanceValue(source[k], 'distance');
        }

        return { 'key': prop, 'value': value };
      });
  }

  private buildLinkTableData(nodeId: any) {
    const links = [];
    const selectedNodeId = String(nodeId);

    this.getVisibleLinksForWaterfall().forEach(link => {
      const sourceId = this.getEndpointId(link.source);
      const targetId = this.getEndpointId(link.target);

      if (sourceId === selectedNodeId) {
        links.push({ 'id': targetId, 'distance': link.distance, 'index': link.index })
      } else if (targetId === selectedNodeId) {
        links.push({ 'id': sourceId, 'distance': link.distance, 'index': link.index })
      }
    });

    return links;
  }

  formatLinkTableDistance(value: any): string {
    return this.commonService.formatDisplayedDistanceValue(value, 'distance');
  }

  onClusterRowSelect(e) {
    let clusterID = e.data.id;
    this.nodeTableData = this.buildNodeTableData(clusterID);

    this.expandedClusterRowData = this.buildClusterExpandedRowData(clusterID);
    this.setClusterExpandedRow(clusterID);

    this.selectedNodeRow = null;
    this.selectedLinkRow = null;
    this.linkTableData = [];
    this.expandedNodeRowData = [];
    this.expandedLinkRowData = [];
    this.setNodeExpandedRow(null);
    this.setLinkExpandedRow(null);
    this.cdref.detectChanges();
  }

  onClusterRowUnselect() {
    this.selectedNodeRow = null;
    this.selectedLinkRow = null;
    this.nodeTableData = [];
    this.linkTableData = [];

    this.expandedClusterRowData = [];
    this.expandedNodeRowData = [];
    this.expandedLinkRowData = [];
    this.setClusterExpandedRow(null);
    this.setNodeExpandedRow(null);
    this.setLinkExpandedRow(null);
    this.cdref.detectChanges();
  }

  clearClusterTableSelection() {
    if (!this.clusterTable) return;
    this.clusterTable.selection = null;
    this.clusterTable.selectionChange.emit(null);
    this.setClusterExpandedRow(null);
    this.clusterTable.onRowCollapse.emit(null);
  }

  onNodeRowSelect(e) {
    let node = e.data.id;
    this.linkTableData = this.buildLinkTableData(node)

    this.expandedNodeRowData = this.buildNodeExpandedRowData(node)
    this.setNodeExpandedRow(node);

    this.selectedLinkRow = null;
    this.expandedLinkRowData = [];
    this.setLinkExpandedRow(null);
    this.cdref.detectChanges();
  }

  onNodeRowUnselect() {
    this.linkTableData = [];
    this.selectedLinkRow = null;
    this.expandedNodeRowData = [];
    this.expandedLinkRowData = [];
    this.setNodeExpandedRow(null);
    this.setLinkExpandedRow(null);
    this.cdref.detectChanges();
  }

  onLinkRowSelect(e) {
    let linkIndex = e.data.index;
    this.expandedLinkRowData = this.buildLinkExpandedRowData(linkIndex);
    this.setLinkExpandedRow(linkIndex);
    this.cdref.detectChanges();

  }

  onLinkRowUnselect() {
    this.expandedLinkRowData = [];
    this.setLinkExpandedRow(null);
    this.cdref.detectChanges();
  }

  updateNodeColors() {}
  updateVisualization() {}
  refreshDistanceDisplayFormat() {
    this.refreshFromSession();
  }
  applyStyleFileSettings() {}
  updateLinkColor() {}
  openRefreshScreen() {}
  openExport() {}
  onFilterDataChange() {
    this.refreshFromSession();
    this.goldenLayoutComponentResize();
    this.cdref.detectChanges();
  }
  onRecallSession() {}
  onLoadNewData() {
    this.refreshFromSession(false);
    this.goldenLayoutComponentResize();
    this.cdref.detectChanges();
  }
}

export namespace WaterfallComponent {
  export const componentTypeName = 'Waterfall';
}
