import type { ForceGraph3DInstance } from '3d-force-graph';
import { ThreeDOrientationIndicator } from './three-d-orientation-indicator';
import { ThreeDNodeObjects, type ThreeDNodeFrameClasses } from './three-d-node-objects';
import { ThreeDLinkOverlays } from './three-d-link-overlays';
import { ThreeDLinkArrows } from './three-d-link-arrows';
import { labelWorldHeight, ThreeDTextSprites } from './three-d-text-sprites';
import type * as Three from 'three';
import { color as parseColor } from 'd3-color';
import {
  finiteThreeDPoint, ThreeDGraphData, ThreeDLink, ThreeDNode, ThreeDPoint,
  ThreeDSettings, ThreeDViewState,
} from './three-d-network.model';

interface CameraControls {
  target: ThreeDPoint;
  dynamicDampingFactor: number;
  update(): void;
  reset(): void;
  handleResize(): void;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

export class ThreeDNetworkRenderer {
  private graph: ForceGraph3DInstance<ThreeDNode, ThreeDLink>;
  private data: ThreeDGraphData = { nodes: [], links: [] };
  private frozen = false;
  private destroyed = false;
  private fitOnSettle = false;
  private restoringPositions = false;
  private positions = new Map<string, ThreeDPoint>();
  private cameraChanged: () => void;
  private cameraInteractionStarted: () => void;
  private resizeFrame: number | null = null;
  private rotationFrame: number | null = null;
  private rotationTime: number | null = null;
  private rotating = false;
  private visible = true;
  private orientation: ThreeDOrientationIndicator | null = null;
  private nodeObjects: ThreeDNodeObjects;
  private contextLost: (event: Event) => void;
  private settings?: ThreeDSettings;
  private linkLabels: ThreeDTextSprites;
  private linkOverlays: ThreeDLinkOverlays;
  private linkArrows: ThreeDLinkArrows;
  private hovered: string | null = null;
  private neighborhood: Set<string> | null = null;
  private customLinkSignature = '';
  private linkObjects = new Map<string, Three.Group>();
  private linkWidthAccessor = (link: ThreeDLink) => link.width ?? this.settings?.linkWidth ?? 1.6;

  static async create(
    host: HTMLElement,
    onSelect: (id: string | null, event: MouseEvent) => void,
    onStateChange: () => void,
    onContextLost: () => void,
    onRotationChange: (playing: boolean) => void = () => {},
  ): Promise<ThreeDNetworkRenderer> {
    const [{ default: ForceGraph3D }, three, { LineSegments2 }, { LineSegmentsGeometry }, { LineMaterial }] = await Promise.all([
      import('3d-force-graph'), import('three'), import('three/addons/lines/LineSegments2.js'),
      import('three/addons/lines/LineSegmentsGeometry.js'), import('three/addons/lines/LineMaterial.js'),
    ]);
    return new ThreeDNetworkRenderer(new ForceGraph3D(host, {
      controlType: 'trackball', rendererConfig: { antialias: true, preserveDrawingBuffer: true },
    }) as ForceGraph3DInstance<ThreeDNode, ThreeDLink>, onSelect, onStateChange, onContextLost, onRotationChange, three,
    { LineSegments2, LineSegmentsGeometry, LineMaterial });
  }

  private constructor(
    graph: ForceGraph3DInstance<ThreeDNode, ThreeDLink>,
    onSelect: (id: string | null, event: MouseEvent) => void,
    onStateChange: () => void,
    onContextLost: () => void,
    private onRotationChange: (playing: boolean) => void,
    private three: typeof import('three'),
    frameClasses: ThreeDNodeFrameClasses,
  ) {
    this.graph = graph;
    this.nodeObjects = new ThreeDNodeObjects(three, frameClasses);
    this.linkLabels = new ThreeDTextSprites(three);
    this.linkOverlays = new ThreeDLinkOverlays(three);
    this.linkArrows = new ThreeDLinkArrows(three);
    this.graph.enableNodeDrag(false).showNavInfo(false)
      .nodeId('id').nodeOpacity(1).nodeResolution(8)
      .nodeThreeObject(node => this.nodeObjects.create(node))
      .nodeLabel(node => this.label(node.tooltip)).linkLabel(link => this.label(link.tooltip))
      .onNodeClick((node, event) => onSelect(node.id, event))
      .onNodeHover(node => { this.hovered = node?.id ?? null; if (this.settings?.highlightNeighbors) this.updateHighlight(); })
      .onBackgroundClick(event => onSelect(null, event))
      .warmupTicks(0).cooldownTicks(150).cooldownTime(6000)
      .onEngineStop(() => {
        if (this.destroyed) return;
        if (this.fitOnSettle) {
          this.fitOnSettle = false;
          this.fit();
        }
        this.updateLabelScales();
        onStateChange();
      });
    this.cameraChanged = () => { this.orientation?.update(this.graph.camera()); this.updateLabelScales(); onStateChange(); };
    this.cameraInteractionStarted = () => { this.fitOnSettle = false; this.setCameraRotating(false); };
    this.controls.addEventListener('change', this.cameraChanged);
    this.controls.addEventListener('start', this.cameraInteractionStarted);
    this.contextLost = event => { event.preventDefault(); this.setVisible(false); onContextLost(); };
    this.canvas.addEventListener('webglcontextlost', this.contextLost);
    // Cap the backing-buffer cost on high-density displays.
    this.graph.renderer().setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  }

  private get controls(): CameraControls { return this.graph.controls() as CameraControls; }
  get canvas(): HTMLCanvasElement { return this.graph.renderer().domElement; }
  get nodes(): ReadonlyMap<string, ThreeDNode> { return new Map(this.data.nodes.map(node => [node.id, node])); }
  get savedPositions(): ReadonlyMap<string, ThreeDPoint> { return this.positions; }

  setOrientationIndicator(element: SVGSVGElement): void {
    this.orientation = new ThreeDOrientationIndicator(element, this.graph.camera());
    this.orientation.update(this.graph.camera());
  }

  private label(text: string): HTMLElement | string {
    if (!text) return '';
    const element = document.createElement('span');
    element.textContent = text;
    element.style.cssText = 'color:#222;background:#fff;border:1px solid #aaa;border-radius:4px;padding:4px;white-space:pre-wrap;';
    return element;
  }

  setData(data: ThreeDGraphData, settings: ThreeDSettings, background: string): void {
    this.capturePositions();
    const lengthChanged = this.settings && this.settings.linkLength !== settings.linkLength;
    this.settings = { ...settings };
    this.graph.camera().updateMatrixWorld();
    const topologyChanged = data.nodes.length !== this.data.nodes.length || data.links.length !== this.data.links.length
      || data.nodes.some((node, i) => node.id !== this.data.nodes[i]?.id)
      || data.links.some((link, i) => link.key !== this.data.links[i]?.key);
    if (topologyChanged) {
      const preserveRestoredPositions = this.restoringPositions && data.nodes.every(node => this.positions.has(node.id));
      data.nodes.forEach((node, index) => {
        if (!finiteThreeDPoint(node)) Object.assign(node, this.positions.get(node.id));
        if (this.frozen || preserveRestoredPositions) this.fixNode(node, index);
        else { delete node.fx; delete node.fy; delete node.fz; }
      });
      this.restoringPositions = false;
      this.data = data;
      this.graph.graphData(data);
      if (!data.nodes.length) this.setCameraRotating(false);
    } else {
      // Keep the force engine's resolved link objects; only their display properties change.
      data.links.forEach((link, i) => Object.assign(this.data.links[i], { color: link.color, overlayColor: link.overlayColor, tooltip: link.tooltip, width: link.width, label: link.label,
        targetArrow: link.targetArrow, sourceArrow: link.sourceArrow }));
    }
    const customLinkSignature = JSON.stringify([settings.linkLabelSize, data.links.map(link => [link.label, Boolean(link.overlayColor), Boolean(link.sourceArrow), Boolean(link.targetArrow)])]);
    const linkIds = new Set(data.links.filter(link => link.label || link.overlayColor || link.sourceArrow || link.targetArrow).map(link => link.key));
    this.linkObjects.forEach((_, key) => { if (!linkIds.has(key)) this.linkObjects.delete(key); });
    if (customLinkSignature !== this.customLinkSignature) {
      this.customLinkSignature = customLinkSignature;
      this.graph.linkThreeObjectExtend(true).linkThreeObject(link => {
        if (!link.label && !link.overlayColor && !link.sourceArrow && !link.targetArrow) return null;
        const group = new this.three.Group();
        this.linkObjects.set(link.key, group);
        this.scaleLinkLabel(group, link.label);
        this.linkOverlays.create(group, link);
        this.linkArrows.create(group, link);
        return group;
      }).linkPositionUpdate((object, { start, end }, link) => {
        if (object) {
          object.position.set((start.x + end.x) / 2, (start.y + end.y) / 2, (start.z + end.z) / 2);
          this.scaleLinkLabel(object, link.label || '');
          this.linkOverlays.position(link, start, end);
          this.linkArrows.position(link, start, end);
        }
      });
      this.linkLabels.retain(data.links.map(link => link.label || ''));
    }
    this.graph.nodeColor(node => node.color).nodeVal(node => node.radius == null ? node.value : Math.pow(node.radius / settings.nodeSize, 3))
      .nodeRelSize(settings.nodeSize).linkColor(link => link.color)
      .linkWidth(this.linkWidthAccessor).linkOpacity(1)
      .linkDirectionalArrowLength(0)
      .backgroundColor(background);
    this.graph.d3Force('link')?.distance(settings.linkLength);
    if (lengthChanged && !this.frozen) this.graph.d3ReheatSimulation();
    this.updateHighlight();
  }

  private scaleLinkLabel(object: Three.Object3D, text: string): void {
    if (!this.settings || !text) return;
    this.linkLabels.update(object, 'link-label', text, labelWorldHeight({ camera: this.graph.camera(), height: this.graph.height() }, object.position, this.settings.linkLabelSize));
  }

  private updateLabelScales(): void {
    if (!this.settings || this.settings.nodeLabelField === 'None' && this.settings.linkLabelField === 'None') return;
    this.graph.camera().updateMatrixWorld();
    this.nodeObjects.updateLabels({ camera: this.graph.camera(), height: this.graph.height() });
    this.data.links.forEach(link => {
      const object = this.linkObjects.get(link.key);
      if (object) this.scaleLinkLabel(object, link.label || '');
    });
  }

  private updateHighlight(): void {
    if (!this.settings) return;
    this.neighborhood = this.settings.highlightNeighbors && this.hovered && this.data.nodes.some(node => node.id === this.hovered)
      ? new Set([this.hovered]) : null;
    if (this.neighborhood) this.data.links.forEach(link => {
      const source = typeof link.source === 'string' ? link.source : link.source.id;
      const target = typeof link.target === 'string' ? link.target : link.target.id;
      if (source === this.hovered) this.neighborhood.add(target);
      if (target === this.hovered) this.neighborhood.add(source);
    });
    const dimmed = new Set(this.data.nodes.filter(node => this.neighborhood && !this.neighborhood.has(node.id)).map(node => node.id));
    this.nodeObjects.sync(this.data.nodes, this.settings.nodeSize, this.settings, dimmed, { camera: this.graph.camera(), height: this.graph.height() });
    const dimmedLinks = new Set(this.neighborhood ? this.data.links.filter(link => {
      const source = typeof link.source === 'string' ? link.source : link.source.id;
      const target = typeof link.target === 'string' ? link.target : link.target.id;
      return source !== this.hovered && target !== this.hovered;
    }).map(link => link.key) : []);
    this.linkOverlays.sync(this.data.links, dimmedLinks);
    this.linkArrows.sync(this.data.links, dimmedLinks);
    this.graph.linkColor(link => {
      const source = typeof link.source === 'string' ? link.source : link.source.id;
      const target = typeof link.target === 'string' ? link.target : link.target.id;
      if (!this.neighborhood || source === this.hovered || target === this.hovered) return link.color;
      const color = parseColor(link.color);
      if (!color) return link.color;
      color.opacity *= 0.12;
      return color.formatRgb();
    });
  }

  restore(state: ThreeDViewState | null): void {
    this.setCameraRotating(false);
    this.stopCameraMotion();
    this.positions = new Map(Object.entries(state?.positions ?? {}));
    this.data = { nodes: [], links: [] };
    this.graph.graphData(this.data);
    this.frozen = state?.layoutFrozen === true;
    this.restoringPositions = Boolean(state);
    this.fitOnSettle = !state;
    if (state) {
      const { up } = state.camera;
      this.graph.camera().up.set(up.x, up.y, up.z);
      this.graph.cameraPosition(state.camera.position, state.camera.target, 0);
      this.controls.update();
    }
    this.orientation?.update(this.graph.camera());
  }

  private capturePositions(): void {
    this.data.nodes.forEach(node => {
      const point = finiteThreeDPoint(node);
      if (point) this.positions.set(node.id, point);
    });
  }

  getState(validIds?: ReadonlySet<string>): ThreeDViewState {
    this.capturePositions();
    if (validIds) this.positions.forEach((_, id) => { if (!validIds.has(id)) this.positions.delete(id); });
    return {
      version: 1,
      camera: {
        position: finiteThreeDPoint(this.graph.cameraPosition())!,
        target: finiteThreeDPoint(this.controls.target)!,
        up: finiteThreeDPoint(this.graph.camera().up)!,
      },
      positions: Object.fromEntries(this.positions), layoutFrozen: this.frozen,
    };
  }

  resize(width: number, height: number): void {
    if (width <= 0 || height <= 0) return;
    this.graph.width(Math.round(width)).height(Math.round(height));
    this.updateLabelScales();
    if (this.resizeFrame !== null) cancelAnimationFrame(this.resizeFrame);
    // Trackball maps pointer positions using the canvas bounds, which change when docked.
    this.resizeFrame = requestAnimationFrame(() => {
      this.resizeFrame = null;
      if (!this.destroyed) this.controls.handleResize();
    });
  }

  fit(): void {
    this.setCameraRotating(false);
    if (this.data.nodes.length) this.graph.zoomToFit(0, 35);
  }

  setCameraRotating(playing: boolean): void {
    const next = playing && !this.destroyed && this.visible && this.data.nodes.length > 0;
    if (next === this.rotating) return;
    this.rotating = next;
    if (this.rotationFrame !== null) cancelAnimationFrame(this.rotationFrame);
    this.rotationFrame = null;
    this.rotationTime = null;
    this.stopCameraMotion();
    if (next) {
      this.fitOnSettle = false;
      this.rotationFrame = requestAnimationFrame(this.rotateCamera);
    }
    this.onRotationChange(next);
    this.cameraChanged();
  }

  private rotateCamera = (now: number): void => {
    if (!this.rotating || this.destroyed) return;
    // A full turn takes 30 seconds, independently of display refresh rate.
    const elapsed = this.rotationTime === null ? 0 : now - this.rotationTime;
    this.rotationTime = now;
    const camera = this.graph.camera();
    const target = this.controls.target;
    const offset = camera.position.clone().set(
      camera.position.x - target.x, camera.position.y - target.y, camera.position.z - target.z,
    ).applyAxisAngle(camera.up.clone().normalize(), elapsed * Math.PI / 15000);
    this.graph.cameraPosition({ x: target.x + offset.x, y: target.y + offset.y, z: target.z + offset.z }, target, 0);
    this.controls.update();
    this.rotationFrame = requestAnimationFrame(this.rotateCamera);
  };
  private stopCameraMotion(): void {
    // Trackball retains inertia after pointer-up, including across reset().
    const controls = this.controls;
    const damping = controls.dynamicDampingFactor;
    controls.dynamicDampingFactor = 1;
    controls.update();
    controls.update();
    controls.dynamicDampingFactor = damping;
  }

  resetCamera(): void {
    this.setCameraRotating(false);
    this.stopCameraMotion();
    this.controls.reset();
    this.graph.cameraPosition({ x: 0, y: 0, z: 1000 }, { x: 0, y: 0, z: 0 });
    this.fit();
  }

  zoom(factor: number): void {
    const position = this.graph.cameraPosition();
    const target = this.controls.target;
    this.graph.cameraPosition({
      x: target.x + (position.x - target.x) * factor,
      y: target.y + (position.y - target.y) * factor,
      z: target.z + (position.z - target.z) * factor,
    }, target);
  }

  private fixNode(node: ThreeDNode, index: number): void {
    // New nodes in a frozen view still need a finite initial position.
    const radius = 20 * Math.cbrt(index + 1);
    const angle = index * Math.PI * (3 - Math.sqrt(5));
    const point = finiteThreeDPoint(node) ?? { x: radius * Math.cos(angle), y: radius * Math.sin(angle), z: index % 2 ? radius / 2 : -radius / 2 };
    Object.assign(node, point, { fx: point.x, fy: point.y, fz: point.z, vx: 0, vy: 0, vz: 0 });
  }

  setFrozen(frozen: boolean): void {
    this.frozen = frozen;
    this.data.nodes.forEach((node, index) => {
      if (frozen) this.fixNode(node, index);
      else { delete node.fx; delete node.fy; delete node.fz; }
    });
    if (!frozen) this.graph.d3ReheatSimulation();
  }

  recalculate(): void {
    this.setCameraRotating(false);
    this.positions.clear();
    this.frozen = false;
    this.data.nodes.forEach(node => {
      for (const key of ['x', 'y', 'z', 'fx', 'fy', 'fz', 'vx', 'vy', 'vz']) delete node[key];
    });
    this.fitOnSettle = true;
    this.graph.graphData(this.data).d3ReheatSimulation();
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    if (!visible) this.setCameraRotating(false);
    if (visible) this.graph.resumeAnimation();
    else this.graph.pauseAnimation();
  }

  snapshot(): HTMLCanvasElement {
    this.graph.renderer().render(this.graph.scene(), this.graph.camera());
    const canvas = document.createElement('canvas');
    canvas.width = this.canvas.width;
    canvas.height = this.canvas.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Unable to prepare the 3D image.');
    context.drawImage(this.canvas, 0, 0);
    return canvas;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.setCameraRotating(false);
    this.destroyed = true;
    if (this.resizeFrame !== null) cancelAnimationFrame(this.resizeFrame);
    const renderer = this.graph.renderer();
    this.controls.removeEventListener('change', this.cameraChanged);
    this.controls.removeEventListener('start', this.cameraInteractionStarted);
    this.canvas.removeEventListener('webglcontextlost', this.contextLost);
    this.graph.onNodeClick(() => {}).onNodeHover(() => {}).onBackgroundClick(() => {}).onEngineStop(() => {});
    this.graph._destructor();
    this.nodeObjects.destroy();
    this.linkLabels.destroy();
    this.linkOverlays.destroy();
    this.linkArrows.destroy();
    this.linkObjects.clear();
    renderer.forceContextLoss();
    this.graph = null;
    this.cameraChanged = null;
    this.cameraInteractionStarted = null;
    this.onRotationChange = null;
    this.orientation = null;
    this.contextLost = null;
    this.data = { nodes: [], links: [] };
    this.positions.clear();
  }
}
