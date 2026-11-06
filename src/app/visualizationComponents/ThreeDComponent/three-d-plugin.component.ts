import {
  AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef,
  EventEmitter, Inject, NgZone, OnDestroy, OnInit, Output, ViewChild,
} from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { ComponentContainer } from 'golden-layout';
import { BaseComponentDirective } from '@app/base-component.directive';
import { CommonService } from '@app/contactTraceCommonServices/common.service';
import { CommonStoreService } from '@app/contactTraceCommonServices/common-store.services';
import { ExportService } from '@app/contactTraceCommonServices/export.service';
import { MicobeTraceNextPluginEvents } from '@app/helperClasses/interfaces';
import { ThreeDNetworkRenderer } from './three-d-network-renderer.adapter';
import {
  buildThreeDGraph, ensureThreeDShapeMapping, normalizeThreeDViewState, readThreeDSettings, ThreeDSettings,
  THREE_D_NODE_SHAPES, ThreeDNodeShape, threeDShapeCategory,
  ThreeDViewState, threeDNodeId, writeThreeDSettings,
} from './three-d-network.model';

@Component({
  selector: 'three-d-component',
  templateUrl: './three-d-plugin.component.html',
  styleUrls: ['./three-d-plugin.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class ThreeDComponent extends BaseComponentDirective implements OnInit, AfterViewInit, OnDestroy, MicobeTraceNextPluginEvents {
  @Output() DisplayGlobalSettingsDialogEvent = new EventEmitter();
  @ViewChild('graphHost', { static: true }) graphHost: ElementRef<HTMLDivElement>;
  @ViewChild('orientationIndicator', { static: true }) orientationIndicator: ElementRef<SVGSVGElement>;

  settings: ThreeDSettings = readThreeDSettings({});
  settingsOpen = false;
  exportOpen = false;
  exportFilename = '3d_network';
  exportScale = 1;
  exportNodeTable = false;
  exportLinkTable = false;
  viewActive = true;
  loading = true;
  error = '';
  exportError = '';
  layoutFrozen = false;
  cameraRotating = false;
  nodeCount = 0;
  linkCount = 0;
  nodeFields: Array<{ label: string; value: string }> = [];
  linkFields: Array<{ label: string; value: string }> = [];
  sizeFields: Array<{ label: string; value: string }> = [];
  shapeOptions = THREE_D_NODE_SHAPES;
  shapeCategories: Array<{ key: string; label: string; count: number }> = [];
  shapeCategoryFirst = 0;

  private renderer: ThreeDNetworkRenderer | null = null;
  private destroy$ = new Subject<void>();
  private destroyed = false;
  private initializing = false;
  private updateFrame: number | null = null;
  private persistenceTimer: ReturnType<typeof setTimeout> | null = null;
  private resizeObserver: ResizeObserver;
  private sourceNodes: any[] | null = null;
  private persistedState: ThreeDViewState | null = null;
  private needsRestore = true;
  private resizeHandler = () => this.goldenLayoutComponentResize();
  private hideHandler = () => this.setViewVisible(false);
  private showHandler = () => this.setViewVisible(true);
  private documentVisibilityHandler = () => this.renderer?.setVisible(this.viewActive && !document.hidden && !this.error);

  constructor(
    @Inject(BaseComponentDirective.GoldenLayoutContainerInjectionToken) private container: ComponentContainer,
    element: ElementRef,
    public commonService: CommonService,
    private store: CommonStoreService,
    private cdref: ChangeDetectorRef,
    private zone: NgZone,
    private exportService: ExportService,
  ) {
    super(element.nativeElement);
    this.commonService.visuals.threeD = this;
  }

  ngOnInit(): void {
    this.container.on('resize', this.resizeHandler);
    this.container.on('hide', this.hideHandler);
    this.container.on('show', this.showHandler);
    $(document).on('node-selected.threeD node-visibility.threeD', () => this.requestUpdate());
    document.addEventListener('visibilitychange', this.documentVisibilityHandler);
    this.store.networkUpdated$.pipe(takeUntil(this.destroy$)).subscribe(updated => { if (updated) this.requestUpdate(); });
    this.store.clusterUpdate$.pipe(takeUntil(this.destroy$)).subscribe(() => this.requestUpdate());
    this.store.styleFileApplied$.pipe(takeUntil(this.destroy$)).subscribe(() => this.requestUpdate());
    this.store.settingsLoaded$.pipe(takeUntil(this.destroy$)).subscribe(loaded => { if (loaded) this.requestUpdate(); });
    this.store.sessionDestroyed$.pipe(takeUntil(this.destroy$)).subscribe(destroyed => {
      if (destroyed) { this.needsRestore = true; this.requestUpdate(); }
    });
  }

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => {
      this.resizeObserver = new ResizeObserver(() => this.goldenLayoutComponentResize());
      this.resizeObserver.observe(this.graphHost.nativeElement);
      void this.initializeRenderer();
    });
  }

  private async initializeRenderer(): Promise<void> {
    if (this.initializing || this.renderer || this.destroyed) return;
    this.initializing = true;
    this.loading = true;
    this.error = '';
    try {
      const renderer = await ThreeDNetworkRenderer.create(
        this.graphHost.nativeElement,
        (id, event) => this.zone.run(() => this.selectNode(id, event)),
        () => this.schedulePersistence(),
        () => this.zone.run(() => {
          this.error = 'The graphics connection was lost. Retry the 3D view or continue in 2D Network.';
          this.cdref.markForCheck();
        }),
        playing => this.zone.run(() => {
          if (this.destroyed) return;
          this.cameraRotating = playing;
          this.cdref.markForCheck();
        }),
      );
      if (this.destroyed) { renderer.destroy(); return; }
      this.renderer = renderer;
      renderer.setOrientationIndicator(this.orientationIndicator.nativeElement);
      renderer.canvas.dataset.testid = 'threed-webgl-canvas';
      this.goldenLayoutComponentResize();
      renderer.setVisible(this.viewActive && !document.hidden);
      this.flushUpdate();
    } catch (error) {
      console.error('Unable to initialize the 3D network.', error);
      if (!this.destroyed) this.error = '3D Network needs hardware-accelerated graphics (WebGL). Retry or continue in 2D Network.';
    } finally {
      this.initializing = false;
      this.loading = false;
      if (!this.destroyed) this.zone.run(() => {
        if (this.error && this.viewActive) this.store.setNetworkRendered(true);
        this.cdref.markForCheck();
      });
    }
  }

  retry(): void {
    this.persistViewState();
    this.renderer?.destroy();
    this.renderer = null;
    this.graphHost.nativeElement.replaceChildren();
    this.needsRestore = true;
    this.zone.runOutsideAngular(() => void this.initializeRenderer());
  }

  openTwoD(): void { this.commonService.visuals.microbeTrace.Viewclick('2D Network'); }

  private setViewVisible(visible: boolean): void {
    if (!visible) this.persistViewState();
    this.viewActive = visible;
    this.renderer?.setVisible(visible && !document.hidden && !this.error);
    if (visible) { this.goldenLayoutComponentResize(); this.requestUpdate(); }
    this.cdref.markForCheck();
  }

  // Golden Layout uses virtual visibility as well as its hide/show events.
  override setVisibility(visible: boolean): void {
    super.setVisibility(visible);
    this.setViewVisible(visible);
  }

  requestUpdate(): void {
    if (this.destroyed || !this.viewActive || this.error || this.updateFrame !== null) return;
    this.zone.runOutsideAngular(() => {
      this.updateFrame = requestAnimationFrame(() => {
        this.updateFrame = null;
        if (!this.destroyed && this.viewActive && this.renderer) this.flushUpdate();
      });
    });
  }

  private flushUpdate(): void {
    if (!this.renderer || this.destroyed) return;
    const start = performance.now();
    const session = this.commonService.session;
    this.settings = readThreeDSettings(session.style.widgets);
    ensureThreeDShapeMapping(session.data.nodes, this.settings);
    writeThreeDSettings(session.style.widgets, this.settings);
    if (this.settingsOpen) this.rebuildShapeCategories();
    if (this.needsRestore || this.sourceNodes !== session.data.nodes
      || this.persistedState !== ((session.meta as any).threeDViewState ?? null)) {
      const state = normalizeThreeDViewState((session.meta as any).threeDViewState);
      this.renderer.restore(state);
      this.layoutFrozen = state?.layoutFrozen === true;
      this.sourceNodes = session.data.nodes;
      this.persistedState = (session.meta as any).threeDViewState ?? null;
      this.needsRestore = false;
    }
    const data = buildThreeDGraph(
      this.commonService.getVisibleNodes(), this.commonService.getVisibleLinksForCurrentTimeline(),
      this.settings,
      node => node.selected ? session.style.widgets['selected-color'] || '#ff6600'
        : this.commonService.getNodeFillStyle(node).color,
      link => this.getLinkColor(link),
      this.renderer.nodes, this.renderer.savedPositions,
    );
    this.renderer.setData(data, this.settings, session.style.widgets['background-color'] || '#ffffff');
    this.nodeCount = data.nodes.length;
    this.linkCount = data.links.length;
    this.graphHost.nativeElement.dataset.rendered = 'true';
    this.graphHost.nativeElement.dataset.updateMs = (performance.now() - start).toFixed(1);
    this.zone.run(() => {
      if (this.viewActive && session.data.nodes.length) this.store.setNetworkRendered(true);
      this.cdref.markForCheck();
    });
  }

  private getLinkColor(link: any): string {
    const widgets = this.commonService.session.style.widgets;
    const field = widgets['link-color-variable'];
    if (!field || field === 'None') return widgets['link-color'] || '#999999';
    const value = String(field).toLowerCase() === 'origin' && Array.isArray(link[field])
      ? link[field].length > 1 ? 'Duo-Link' : this.commonService.normalizeStyleCategoryValue(link[field][0])
      : this.commonService.normalizeStyleCategoryValue(link[field]);
    return this.commonService.temp.style.linkColorMap(value) || widgets['link-color'] || '#999999';
  }

  private rebuildFields(): void {
    const data = this.commonService.session.data;
    const option = (field: string) => ({ label: field === '_id' ? 'ID' : this.commonService.titleize(field), value: field });
    this.nodeFields = [{ label: 'None', value: 'None' }, ...Array.from(new Set(['_id', ...(data.nodeFields || [])]))
      .filter((field: string) => !['seq', 'index', 'x', 'y', 'z', 'vx', 'vy', 'vz'].includes(field)).map(option)];
    this.linkFields = [{ label: 'None', value: 'None' }, ...(data.linkFields || []).map(option)];
    const numericFields = new Set<string>();
    data.nodes.forEach(node => Object.entries(node).forEach(([field, value]) => {
      if (value != null && value !== '' && typeof value !== 'boolean' && !Array.isArray(value)
        && Number.isFinite(Number(value))) numericFields.add(field);
    }));
    this.sizeFields = this.nodeFields.filter(field => field.value === 'None' || numericFields.has(field.value));
    this.rebuildShapeCategories();
  }

  private rebuildShapeCategories(): void {
    const counts = new Map<string, number>();
    if (this.settings.nodeShapeField !== 'None') this.commonService.session.data.nodes.forEach(node => {
      const key = threeDShapeCategory(node[this.settings.nodeShapeField]);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    this.shapeCategories = [...counts].sort(([a], [b]) => a.localeCompare(b))
      .map(([key, count]) => ({ key, label: key === 'null' ? '(Empty)' : key, count }));
  }

  setCategoryShape(category: string, shape: ThreeDNodeShape): void {
    this.settings.nodeShapeMappings[this.settings.nodeShapeField][category] = shape;
    this.changeSettings();
  }

  changeShapeField(): void {
    this.shapeCategoryFirst = 0;
    this.changeSettings();
  }

  selectNode(id: string | null, event: Pick<MouseEvent, 'shiftKey' | 'ctrlKey' | 'metaKey'>): void {
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    if (id === null && additive) return;
    const data = this.commonService.session.data;
    const selected = new Set<string>(additive ? data.nodes.filter(node => node.selected).map(threeDNodeId) : []);
    if (id !== null) {
      if (additive && selected.has(id)) selected.delete(id);
      else selected.add(id);
    }
    let changed = false;
    [data.nodes, data.nodeFilteredValues].forEach(nodes => nodes.forEach(node => {
      const next = selected.has(threeDNodeId(node));
      if (Boolean(node.selected) !== next) { node.selected = next; changed = true; }
    }));
    if (changed) $(document).trigger('node-selected');
    this.requestUpdate();
  }

  private schedulePersistence(): void {
    if (this.destroyed) return;
    if (this.persistenceTimer) clearTimeout(this.persistenceTimer);
    this.persistenceTimer = setTimeout(() => { this.persistenceTimer = null; this.persistViewState(); }, 100);
  }

  public persistViewState(): void {
    if (!this.renderer || this.needsRestore || this.sourceNodes !== this.commonService.session.data.nodes
      || this.persistedState !== ((this.commonService.session.meta as any).threeDViewState ?? null)) return;
    const state = normalizeThreeDViewState(this.renderer.getState(new Set(this.sourceNodes.map(threeDNodeId))));
    if (!state) return;
    this.persistedState = state;
    (this.commonService.session.meta as any).threeDViewState = state;
  }

  goldenLayoutComponentResize(): void {
    if (!this.graphHost || !this.renderer) return;
    const { width, height } = this.graphHost.nativeElement.getBoundingClientRect();
    this.zone.runOutsideAngular(() => this.renderer?.resize(width, height));
  }

  changeSettings(): void {
    ensureThreeDShapeMapping(this.commonService.session.data.nodes, this.settings);
    this.rebuildShapeCategories();
    writeThreeDSettings(this.commonService.session.style.widgets, this.settings);
    this.requestUpdate();
  }

  toggleFrozen(): void {
    this.layoutFrozen = !this.layoutFrozen;
    this.zone.runOutsideAngular(() => this.renderer?.setFrozen(this.layoutFrozen));
    this.persistViewState();
  }

  toggleCameraRotation(): void {
    if (this.loading || this.error || !this.nodeCount) return;
    this.zone.runOutsideAngular(() => this.renderer?.setCameraRotating(!this.cameraRotating));
  }

  resetCamera(): void { this.renderer?.resetCamera(); this.persistViewState(); }
  openCenter(): void { this.renderer?.fit(); this.persistViewState(); }
  zoom(factor: number): void { this.renderer?.zoom(factor); this.persistViewState(); }
  openRefreshScreen(): void { this.layoutFrozen = false; this.zone.runOutsideAngular(() => this.renderer?.recalculate()); }
  openSettings(): void { this.rebuildFields(); this.settingsOpen = !this.settingsOpen; }
  openGlobalColors(): void { this.settingsOpen = false; this.DisplayGlobalSettingsDialogEvent.emit(); }
  openExport(): void { this.exportError = ''; this.exportOpen = true; }

  exportImage(): void {
    try {
      if (!this.renderer || this.error) throw new Error('The 3D view is not ready to export.');
      const scale = Number(this.exportScale);
      if (!Number.isFinite(scale) || scale < 1 || scale > 5) throw new Error('Choose an image scale between 1 and 5.');
      const canvas = this.renderer.snapshot();
      const bounds = this.graphHost.nativeElement.getBoundingClientRect();
      this.exportService.setExportOptions({ filename: this.exportFilename || '3d_network', filetype: 'png', scale, quality: 1 });
      this.exportService.requestRendererRasterExport(canvas, bounds.width, bounds.height, [], this.exportNodeTable, this.exportLinkTable);
      this.exportOpen = false;
    } catch (error) {
      this.exportError = error instanceof Error ? error.message : 'The image could not be exported.';
    }
  }

  onCanvasKeydown(event: KeyboardEvent): void {
    if (event.key === '+' || event.key === '=') this.zoom(0.8);
    else if (event.key === '-') this.zoom(1.25);
    else if (event.key.toLowerCase() === 'f') this.openCenter();
    else if (event.key === 'Escape') this.selectNode(null, { shiftKey: false, ctrlKey: false, metaKey: false });
    else return;
    event.preventDefault();
  }

  updateNodeColors(): void { this.requestUpdate(); }
  updateLinkColor(): void { this.requestUpdate(); }
  updateVisualization(): void { this.requestUpdate(); }
  applyStyleFileSettings(): void { this.requestUpdate(); }
  onLoadNewData(): void { this.requestUpdate(); }
  onFilterDataChange(): void { this.requestUpdate(); }
  onRecallSession(): void { this.needsRestore = true; this.requestUpdate(); }
  loadSettings(): void { this.requestUpdate(); }

  ngOnDestroy(): void {
    this.persistViewState();
    this.destroyed = true;
    if (this.updateFrame !== null) cancelAnimationFrame(this.updateFrame);
    if (this.persistenceTimer) clearTimeout(this.persistenceTimer);
    this.destroy$.next();
    this.destroy$.complete();
    $(document).off('.threeD');
    document.removeEventListener('visibilitychange', this.documentVisibilityHandler);
    this.container.off('resize', this.resizeHandler);
    this.container.off('hide', this.hideHandler);
    this.container.off('show', this.showHandler);
    this.resizeObserver?.disconnect();
    this.renderer?.destroy();
    this.renderer = null;
    if (this.commonService.visuals.threeD === this) this.commonService.visuals.threeD = null;
  }
}

export namespace ThreeDComponent {
  export const componentTypeName = '3D Network';
}
