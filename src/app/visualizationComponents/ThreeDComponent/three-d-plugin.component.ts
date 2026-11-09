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
import { color as parseColor } from 'd3-color';
import { createGlobalSettingsDialogRequest, DialogRectSnapshot, GlobalSettingsDialogRequest } from '@app/helperClasses/globalSettingsDialogRequest';
import { ThreeDShapeLegendChange, ThreeDShapeLegendModel } from './three-d-shape-legend.component';
import { THREE_D_SHAPE_TREE, threeDShapePreview } from './three-d-shape-previews';
import {
  buildThreeDGraph, ensureThreeDShapeMapping, normalizeThreeDViewState, readThreeDSettings, ThreeDSettings,
  THREE_D_NODE_SHAPES, ThreeDLinkColors, ThreeDNodeShape, threeDShapeCategory,
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
  @Output() DisplayGlobalSettingsDialogEvent = new EventEmitter<GlobalSettingsDialogRequest>();
  @ViewChild('graphHost', { static: true }) graphHost: ElementRef<HTMLDivElement>;
  @ViewChild('orientationIndicator', { static: true }) orientationIndicator: ElementRef<SVGSVGElement>;
  @ViewChild('shapeExportTable', { static: true }) shapeExportTable: ElementRef<HTMLDivElement>;

  settings: ThreeDSettings = readThreeDSettings({});
  settingsOpen = false;
  exportOpen = false;
  exportFilename = '3d_network';
  exportScale = 1;
  exportNodeTable = false;
  exportLinkTable = false;
  exportShapeTable = false;
  exportFiletype = 'png';
  exportQuality = 0.92;
  exportFiletypes = ['png', 'jpeg', 'webp'];
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
  linkSizeFields: Array<{ label: string; value: string }> = [];
  orientationOptions = ['Middle', 'Top', 'Bottom', 'Left', 'Right'];
  hideShowOptions = [{ label: 'Hide', value: false }, { label: 'Show', value: true }];
  tableModes = ['Show', 'Dock', 'Hide'];
  reciprocalOptions = [{ label: 'Reciprocal', value: true }, { label: 'Non-Reciprocal', value: false }];
  neighborOptions = [{ label: 'Normal', value: false }, { label: 'Highlighted', value: true }];
  shapePreview = threeDShapePreview;
  shapeDialogStyle: Record<string, string> = { width: '540px', maxWidth: '95vw' };
  private shapeDialogSource?: DialogRectSnapshot;
  shapeLegend: ThreeDShapeLegendModel = {
    fields: [], field: 'None', uniformShape: THREE_D_SHAPE_TREE[0], rows: [],
    headers: { value: 'Value', count: 'Count', frequency: 'Frequency' },
    mode: 'Dock', collapsed: false, showCounts: true, showFrequencies: false,
  };
  shapeCategories: Array<{ key: string; label: string; count: number }> = [];

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
    if (this.destroyed || this.updateFrame !== null) return;
    if (!this.viewActive || this.error) {
      this.settings = readThreeDSettings(this.commonService.session.style.widgets);
      ensureThreeDShapeMapping(this.commonService.session.data.nodes, this.settings);
      this.rebuildFields();
      this.cdref.markForCheck();
      return;
    }
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
    if (!this.nodeFields.length || this.sourceNodes !== session.data.nodes) this.rebuildFields();
    else this.rebuildShapeCategories();
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
      node => {
        if (node.selected) return session.style.widgets['selected-color'] || '#ff6600';
        const fill = this.commonService.getNodeFillStyle(node);
        return this.colorWithAlpha(fill.color, fill.alpha);
      },
      link => this.getLinkColors(link),
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
    if (this.nodeCount && this.shapeLegend.mode === 'Dock' && !this.commonService.visuals.keyTables) {
      this.commonService.visuals.microbeTrace.ensureDockedKeyTablesViewVisible(false);
    }
  }

  private getLinkColors(link: any): ThreeDLinkColors {
    const field = this.commonService.session.style.widgets['link-color-variable'];
    const origins = link[field] ?? link.origin ?? link.Origin;
    if (String(field).toLowerCase() === 'origin' && Array.isArray(origins) && origins.length) {
      // Match the two origins represented by the shared Duo-Link legend and 2D view.
      return {
        color: this.getLinkColor({ ...link, [field]: [origins[0]] }),
        ...(origins.length > 1 ? { overlayColor: this.getLinkColor({ ...link, [field]: [origins[1]] }) } : {}),
      };
    }
    return { color: this.getLinkColor(link) };
  }

  private getLinkColor(link: any): string {
    const widgets = this.commonService.session.style.widgets;
    const field = widgets['link-color-variable'];
    if (!field || field === 'None') return this.colorWithAlpha(widgets['link-color'] || '#999999', 1 - this.settings.linkTransparency);
    const value = String(field).toLowerCase() === 'origin' && Array.isArray(link[field])
      ? link[field].length > 1 ? 'Duo-Link' : this.commonService.normalizeStyleCategoryValue(link[field][0])
      : this.commonService.normalizeStyleCategoryValue(link[field]);
    const alpha = this.settings.linkOpacityOverride ? 1 - this.settings.linkTransparency
      : this.commonService.temp.style.linkAlphaMap?.(value) ?? 1;
    return this.colorWithAlpha(this.commonService.temp.style.linkColorMap(value) || widgets['link-color'] || '#999999', alpha);
  }

  private colorWithAlpha(value: string, alpha: number): string {
    const color = parseColor(value);
    if (!color) return value;
    color.opacity *= Number.isFinite(Number(alpha)) ? Math.max(0, Math.min(1, Number(alpha))) : 1;
    return color.formatRgb();
  }

  get linkTransparency(): number { return this.settings.linkTransparency; }
  set linkTransparency(value: number) { this.settings.linkTransparency = Number(value); this.settings.linkOpacityOverride = true; }
  useLegendTransparency(): void { this.settings.linkTransparency = 0; this.settings.linkOpacityOverride = false; this.changeSettings(); }

  private rebuildFields(): void {
    const data = this.commonService.session.data;
    const option = (field: string) => ({ label: field === '_id' ? 'ID' : field === 'source_id' ? 'Source ID' : field === 'target_id' ? 'Target ID'
      : this.commonService.capitalize(field.replace('_', '')), value: field });
    this.nodeFields = [{ label: 'None', value: 'None' }, ...this.commonService.getStyleableNodeFields().map(option)];
    this.linkFields = [{ label: 'None', value: 'None' }, ...(data.linkFields || []).map(field => option(field === 'source' ? 'source_id' : field === 'target' ? 'target_id' : field))];
    const numericFields = new Set<string>();
    data.nodes.forEach(node => Object.entries(node).forEach(([field, value]) => {
      if (value != null && value !== '' && typeof value !== 'boolean' && !Array.isArray(value)
        && Number.isFinite(Number(value))) numericFields.add(field);
    }));
    this.sizeFields = this.nodeFields.filter(field => field.value === 'None' || numericFields.has(field.value));
    const numericLinkFields = new Set<string>();
    data.links.forEach(link => Object.entries(link).forEach(([field, value]) => {
      if (value != null && value !== '' && typeof value !== 'boolean' && !Array.isArray(value) && Number.isFinite(Number(value))) numericLinkFields.add(field);
    }));
    this.linkSizeFields = this.linkFields.filter(field => field.value === 'None' || numericLinkFields.has(field.value));
    this.rebuildShapeCategories();
  }

  private rebuildShapeCategories(): void {
    const counts = new Map<string, number>();
    if (this.settings.nodeShapeField !== 'None') this.commonService.getVisibleNodes().forEach(node => {
      const key = threeDShapeCategory(node[this.settings.nodeShapeField]);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    this.shapeCategories = [...counts].sort(([a], [b]) => a.localeCompare(b))
      .map(([key, count]) => ({ key, label: key === 'null' ? '(Empty)' : key, count }));
    const state = this.commonService.session.style.widgets['3DNet-node-shape-table-state'] ?? {};
    const names = state.names?.[this.settings.nodeShapeField] ?? {};
    const total = this.shapeCategories.reduce((sum, category) => sum + category.count, 0);
    const rows = this.shapeCategories.map(category => {
      const shape = this.settings.nodeShapeMappings[this.settings.nodeShapeField]?.[category.key] ?? this.settings.nodeShape;
      return { rawValue: category.key, trackKey: `3d-shape-${category.key}`,
        displayName: Object.prototype.hasOwnProperty.call(names, category.key) ? String(names[category.key]) : category.label,
        count: category.count, frequency: total ? Number((category.count / total).toFixed(3)) : 0,
        shapeKey: shape, shapeSelection: THREE_D_SHAPE_TREE.find(option => option.key === shape) };
    });
    const sort = ['value', 'count', 'frequency'].includes(state.sort) ? state.sort : 'count';
    rows.sort((a, b) => (sort === 'value' ? a.displayName.localeCompare(b.displayName, undefined, { numeric: true })
      : Number(a[sort]) - Number(b[sort])) * (state.descending !== false ? -1 : 1) || a.displayName.localeCompare(b.displayName));
    this.shapeLegend = {
      fields: this.nodeFields, field: this.settings.nodeShapeField,
      uniformShape: THREE_D_SHAPE_TREE.find(option => option.key === this.settings.nodeShape), rows,
      headers: { value: String(state.headers?.value ?? `Node ${this.nodeFields.find(field => field.value === this.settings.nodeShapeField)?.label ?? 'Value'}`),
        count: String(state.headers?.count ?? 'Count'), frequency: String(state.headers?.frequency ?? 'Frequency') },
      mode: ['Show', 'Dock', 'Hide'].includes(state.mode) ? state.mode : this.defaultShapeLegendMode(),
      collapsed: state.collapsed === true, showCounts: state.counts !== false, showFrequencies: state.frequencies === true,
    };
  }

  changeShapeLegend(change: ThreeDShapeLegendChange): void {
    const widgets = this.commonService.session.style.widgets;
    const state = { ...(widgets['3DNet-node-shape-table-state'] ?? {}) };
    if (change.type === 'field') this.settings.nodeShapeField = change.value || 'None';
    if (change.type === 'shape' && THREE_D_NODE_SHAPES.some(shape => shape.value === change.value)) {
      if (change.category !== undefined) this.settings.nodeShapeMappings[this.settings.nodeShapeField][change.category] = change.value as ThreeDNodeShape;
      else this.settings.nodeShape = change.value as ThreeDNodeShape;
    }
    if (change.type === 'mode' && this.tableModes.includes(change.value)) state.mode = change.value;
    if (change.type === 'counts') state.counts = !this.shapeLegend.showCounts;
    if (change.type === 'frequencies') state.frequencies = !this.shapeLegend.showFrequencies;
    if (change.type === 'collapsed') state.collapsed = !this.shapeLegend.collapsed;
    if (change.type === 'sort') { state.descending = state.sort === change.value ? !state.descending : change.value !== 'value'; state.sort = change.value; }
    if (change.type === 'columnName') state.headers = { ...state.headers, [change.column]: change.value };
    if (change.type === 'rowName') state.names = { ...state.names,
      [this.settings.nodeShapeField]: { ...state.names?.[this.settings.nodeShapeField], [change.category]: change.value } };
    widgets['3DNet-node-shape-table-state'] = state;
    this.changeSettings();
    if (change.type === 'mode' && change.value === 'Dock') this.commonService.visuals.microbeTrace.ensureDockedKeyTablesViewVisible(false);
    this.commonService.visuals.microbeTrace.refreshDockedKeyTablesView();
    if (change.type === 'mode' && change.value === 'Dock') requestAnimationFrame(() => {
      document.querySelector('[data-testid="threed-shape-legend"]')?.scrollIntoView({ block: 'nearest' });
    });
    this.cdref.markForCheck();
  }

  openShapes(event: MouseEvent): void {
    this.shapeDialogSource = createGlobalSettingsDialogRequest('Styling', event).sourceDialogRect;
    this.shapeDialogStyle = { width: '540px', maxWidth: '95vw' };
    this.rebuildFields();
    this.changeShapeLegend({ type: 'mode', value: this.shapeLegend.mode === 'Hide' ? this.defaultShapeLegendMode() : this.shapeLegend.mode });
  }

  private defaultShapeLegendMode(): 'Show' | 'Dock' {
    const app = this.commonService.visuals.microbeTrace;
    const modes = [this.commonService.session.style.widgets['node-symbol-table-visible'], app?.SelectedNodeShapeTableTypesVariable,
      app?.SelectedNodeColorTableTypesVariable, app?.SelectedLinkColorTableTypesVariable];
    return modes.find(mode => mode === 'Show' || mode === 'Dock') ?? 'Dock';
  }
  positionShapeDialog(): void {
    if (!this.shapeDialogSource) return;
    requestAnimationFrame(() => {
      if (this.destroyed || this.shapeLegend.mode !== 'Show') return;
      const dialog = document.querySelector<HTMLElement>('.threed-shape-settings-dialog');
      if (!dialog) return;
      const position = this.commonService.visuals.microbeTrace.getLinkedSettingsDialogPlacement(this.shapeDialogSource, dialog.offsetWidth, dialog.offsetHeight);
      this.shapeDialogStyle = { ...this.shapeDialogStyle, position: 'fixed', left: `${position.left}px`, top: `${position.top}px`, margin: '0', transform: 'none' };
      this.cdref.markForCheck();
    });
  }
  shapeLabel(key: string): string { return THREE_D_NODE_SHAPES.find(shape => shape.value === key)?.label ?? key; }

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
    this.settings.nodeTooltipField = this.settings.nodeTooltipFields[0] ?? 'None';
    this.settings.linkTooltipField = this.settings.linkTooltipFields[0] ?? 'None';
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
  openGlobalColors(event: MouseEvent): void { this.DisplayGlobalSettingsDialogEvent.emit(createGlobalSettingsDialogRequest('Styling', event)); }
  openExport(): void { this.exportError = ''; this.exportOpen = true; }

  exportImage(): void {
    try {
      if (!this.renderer || this.error) throw new Error('The 3D view is not ready to export.');
      const scale = Number(this.exportScale);
      if (!Number.isFinite(scale) || scale < 1 || scale > 5) throw new Error('Choose an image scale between 1 and 5.');
      const canvas = this.renderer.snapshot();
      const bounds = this.graphHost.nativeElement.getBoundingClientRect();
      this.exportService.setExportOptions({ filename: this.exportFilename || '3d_network', filetype: this.exportFiletype, scale, quality: this.exportQuality });
      const tables = this.exportShapeTable && this.settings.nodeShapeField !== 'None'
        ? [this.shapeExportTable.nativeElement.querySelector('table')] : [];
      this.exportService.requestRendererRasterExport(canvas, bounds.width, bounds.height, tables, this.exportNodeTable, this.exportLinkTable);
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
  refreshDistanceDisplayFormat(): void { this.requestUpdate(); }
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
