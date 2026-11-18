import type * as Three from 'three';
import type { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import type { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import type { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { color as parseColor } from 'd3-color';
import type { ThreeDNode, ThreeDNodeShape, ThreeDSettings } from './three-d-network.model';
import { labelWorldHeight, ThreeDLabelView, ThreeDTextSprites } from './three-d-text-sprites';
import { createThreeDNodeGeometry, createThreeDOutlineGeometry, facetedThreeDShape, smoothThreeDShape,
  threeDOutlineVertex, threeDOutlineFragment, ThreeDMeshDetail } from './three-d-node-geometry';
import { ThreeDNodeBatches, ThreeDNodeBatchEntry } from './three-d-node-batches';

export interface ThreeDNodeFrameClasses {
  LineSegments2: typeof LineSegments2;
  LineSegmentsGeometry: typeof LineSegmentsGeometry;
  LineMaterial: typeof LineMaterial;
}

/** Renderer-owned meshes share unit geometries; sizing is applied through mesh scale. */
export class ThreeDNodeObjects {
  private geometries = new Map<string, Three.BufferGeometry>();
  private materials = new Map<string, Three.MeshLambertMaterial>();
  private meshes = new Map<string, Three.Mesh>();
  private frameGeometries = new Map<string, LineSegmentsGeometry>();
  private frameMaterials = new Map<string, LineMaterial>();
  private outlineGeometries = new Map<string, Three.BufferGeometry>();
  private outlineMaterials = new Map<string, Three.ShaderMaterial>();
  private resolution: Three.Vector2;
  private size = 4;
  private settings?: ThreeDSettings;
  private dimmed = new Set<string>();
  private labels: ThreeDTextSprites;
  private labelView?: ThreeDLabelView;
  private nodes: ThreeDNode[] = [];
  private batches?: ThreeDNodeBatches;
  private batchDirty = true;
  private pickMaterial: Three.MeshLambertMaterial;

  constructor(private three: typeof Three, private frameClasses: ThreeDNodeFrameClasses) {
    this.labels = new ThreeDTextSprites(three);
    this.resolution = new three.Vector2(1, 1);
    this.pickMaterial = new three.MeshLambertMaterial({ visible: false });
  }

  enableBatching(scene: Three.Scene): void {
    if (!this.batches) this.batches = new ThreeDNodeBatches(this.three, this.frameClasses, scene, this.resolution);
    this.sync(this.nodes, this.size, this.settings, this.dimmed, this.labelView);
  }

  create(node: ThreeDNode): Three.Mesh {
    const mesh = new this.three.Mesh(this.geometry(node.shape), this.material(node));
    this.update(mesh, node);
    this.meshes.set(node.id, mesh);
    this.batchDirty = true;
    return mesh;
  }

  sync(nodes: ThreeDNode[], size: number, settings?: ThreeDSettings, dimmed = new Set<string>(), labelView?: ThreeDLabelView): void {
    this.nodes = nodes;
    if (labelView) this.labelView = labelView;
    this.size = size;
    this.settings = settings;
    this.dimmed = dimmed;
    const ids = new Set(nodes.map(node => node.id));
    this.meshes.forEach((_, id) => { if (!ids.has(id)) this.meshes.delete(id); });
    this.batchDirty = true;
    nodes.forEach(node => {
      const mesh = this.meshes.get(node.id);
      if (mesh) this.update(mesh, node);
    });
    const colors = new Set(nodes.map(node => this.materialKey(node)));
    this.materials.forEach((material, key) => {
      if (!colors.has(key)) { material.dispose(); this.materials.delete(key); }
    });
    const frameKeys = new Set(settings?.nodeBorderWidth ? nodes.map(node => this.frameMaterialKey(node)) : []);
    this.frameMaterials.forEach((material, key) => {
      if (!frameKeys.has(key)) { material.dispose(); this.frameMaterials.delete(key); }
    });
    this.outlineMaterials.forEach((material, key) => {
      if (!frameKeys.has(key)) { material.dispose(); this.outlineMaterials.delete(key); }
    });
    this.labels.retain(nodes.map(node => node.label || ''));
  }

  private update(mesh: Three.Mesh, node: ThreeDNode): void {
    const detail = (mesh.userData.threeDDetail as ThreeDMeshDetail) ?? (this.settings?.nodeDetail === 'fine' ? 'fine' : 'balanced');
    mesh.geometry = this.geometry(node.shape, detail);
    const material = this.material(node);
    const batched = Boolean(this.batches && material.opacity === 1);
    mesh.material = batched ? this.pickMaterial : material;
    mesh.userData.threeDBatched = batched;
    mesh.userData.threeDDetail = detail;
    const radius = node.radius ?? this.size * Math.cbrt(node.value);
    node.renderRadius = radius * mesh.geometry.boundingSphere!.radius;
    mesh.scale.setScalar(radius);
    this.updateLabel(mesh, node, radius);
    let frame = mesh.getObjectByName('node-frame') as LineSegments2;
    let outline = mesh.getObjectByName('node-outline') as Three.Mesh;
    if (batched) {
      if (frame) mesh.remove(frame);
      if (outline) mesh.remove(outline);
      this.batchDirty = true;
      return;
    }
    if (this.settings?.nodeBorderWidth) {
      if (!frame) {
        frame = new this.frameClasses.LineSegments2(this.frameGeometry(node.shape, detail), this.frameMaterial(node));
        frame.name = 'node-frame';
        frame.renderOrder = 2;
        mesh.add(frame);
      }
      frame.geometry = this.frameGeometry(node.shape, detail);
      frame.material = this.frameMaterial(node);
      frame.visible = (frame.geometry.getAttribute('instanceStart')?.count ?? 0) > 0;
    } else if (frame) mesh.remove(frame);
    if (this.settings?.nodeBorderWidth && this.needsOutline(node.shape)) {
      const geometry = this.outlineGeometry(node.shape, detail);
      if (!outline) {
        outline = new this.three.Mesh(geometry, this.outlineMaterial(node));
        outline.name = 'node-outline'; outline.renderOrder = 1; mesh.add(outline);
      }
      outline.geometry = geometry; outline.material = this.outlineMaterial(node);
    } else if (outline) mesh.remove(outline);
  }

  private needsOutline(shape: ThreeDNodeShape): boolean { return this.settings?.shapeVersion === 1 || !facetedThreeDShape(shape); }

  private outlineGeometry(shape: ThreeDNodeShape, detail: ThreeDMeshDetail): Three.BufferGeometry {
    const key = this.geometryKey(shape, detail);
    if (!this.outlineGeometries.has(key)) this.outlineGeometries.set(key, createThreeDOutlineGeometry(this.three, this.geometry(shape, detail)));
    return this.outlineGeometries.get(key)!;
  }

  /** Called by the owning renderer immediately before drawing. */
  prepareFrame(view: ThreeDLabelView, forExport = false): void {
    this.labelView = view;
    const matrix = view.camera.matrixWorldInverse.elements;
    this.nodes.forEach(node => {
      const mesh = this.meshes.get(node.id);
      if (!mesh) return;
      let detail: ThreeDMeshDetail = this.settings?.nodeDetail === 'fine' ? 'fine' : 'balanced';
      if (this.settings?.nodeDetail === 'auto' && !forExport) {
        const depth = Math.max(0.001, Math.abs(matrix[2] * (node.x ?? 0) + matrix[6] * (node.y ?? 0) + matrix[10] * (node.z ?? 0) + matrix[14]));
        const radius = (node.radius ?? this.size * Math.cbrt(node.value)) * this.geometry(node.shape, 'balanced').boundingSphere!.radius;
        const pixels = radius * Math.abs(view.camera.projectionMatrix.elements[5]) * view.height / depth;
        const previous = mesh.userData.threeDDetail as ThreeDMeshDetail;
        detail = pixels < (previous === 'coarse' ? 21 : 17) ? 'coarse' : pixels > (previous === 'fine' ? 70 : 85) ? 'fine' : 'balanced';
      }
      if (mesh.userData.threeDDetail !== detail) { mesh.userData.threeDDetail = detail; this.update(mesh, node); this.batchDirty = true; }
    });
    if (this.batches) {
      if (this.batchDirty) {
        const entries: ThreeDNodeBatchEntry[] = [];
        this.nodes.forEach(node => {
          const mesh = this.meshes.get(node.id);
          if (!mesh?.userData.threeDBatched) return;
          const detail = mesh.userData.threeDDetail as ThreeDMeshDetail;
          entries.push({ mesh, geometry: mesh.geometry, color: this.material(node).color,
            frame: this.settings?.nodeBorderWidth ? this.frameGeometry(node.shape, detail) : undefined,
            outline: this.settings?.nodeBorderWidth && this.needsOutline(node.shape) ? this.outlineGeometry(node.shape, detail) : undefined,
            width: this.settings?.nodeBorderWidth ?? 0 });
        });
        this.batches.sync(entries); this.batchDirty = false;
      }
      this.batches.update();
    }
  }

  resize(width: number, height: number): void {
    this.resolution.set(Math.max(1, width), Math.max(1, height));
    this.frameMaterials.forEach(material => material.resolution.copy(this.resolution));
  }

  updateLabels(view: ThreeDLabelView): void {
    this.labelView = view;
    this.nodes.forEach(node => {
      const mesh = this.meshes.get(node.id);
      if (mesh && node.label) this.updateLabel(mesh, node, mesh.scale.x);
    });
  }

  private updateLabel(mesh: Three.Mesh, node: ThreeDNode, radius: number): void {
    const fontSize = this.settings?.nodeLabelSize ?? 16;
    const height = this.labelView ? labelWorldHeight(this.labelView, node, fontSize) : fontSize / 4;
    const label = this.labels.update(mesh, 'node-label', node.label || '', height / radius);
    if (label) {
      const orientation = this.settings?.nodeLabelOrientation ?? 'Right';
      const edge = mesh.geometry.boundingSphere!.radius + 0.2;
      // Sprite centers are in camera-facing coordinates, so orientation survives orbit and roll.
      label.center.set(orientation === 'Right' ? -edge / label.scale.x : orientation === 'Left' ? 1 + edge / label.scale.x : 0.5,
        orientation === 'Top' ? -edge / label.scale.y : orientation === 'Bottom' ? 1 + edge / label.scale.y : 0.5);
      label.position.set(0, 0, 0);
    }
  }

  private materialKey(node: ThreeDNode): string {
    return JSON.stringify([node.color, facetedThreeDShape(node.shape), this.dimmed.has(node.id), Boolean(this.settings?.nodeBorderWidth)]);
  }

  private material(node: ThreeDNode): Three.MeshLambertMaterial {
    const key = this.materialKey(node);
    let material = this.materials.get(key);
    if (!material) {
      const parsed = parseColor(node.color);
      material = new this.three.MeshLambertMaterial({
        color: parsed?.formatHex() ?? node.color,
        opacity: (parsed?.opacity ?? 1) * (this.dimmed.has(node.id) ? 0.12 : 1), transparent: (parsed?.opacity ?? 1) < 1 || this.dimmed.has(node.id),
        flatShading: facetedThreeDShape(node.shape), vertexColors: facetedThreeDShape(node.shape),
        polygonOffset: Boolean(this.settings?.nodeBorderWidth), polygonOffsetFactor: 1, polygonOffsetUnits: 1,
      });
      this.materials.set(key, material);
    }
    return material;
  }

  private frameGeometry(shape: ThreeDNodeShape, detail: ThreeDMeshDetail = 'balanced'): LineSegmentsGeometry {
    const key = this.geometryKey(shape, detail);
    let geometry = this.frameGeometries.get(key);
    if (!geometry) {
      // Crease edges preserve the shape's faces without drawing coplanar triangulation diagonals.
      const angle = smoothThreeDShape(shape) ? 180 : shape === 'cone' || shape === 'cylinder' ? 50 : 30;
      const edges = new this.three.EdgesGeometry(this.geometry(shape, detail), angle);
      geometry = new this.frameClasses.LineSegmentsGeometry().fromEdgesGeometry(edges);
      edges.dispose();
      this.frameGeometries.set(key, geometry);
    }
    return geometry;
  }

  private frameMaterialKey(node: ThreeDNode): string {
    return JSON.stringify([(parseColor(node.color)?.opacity ?? 1) * (this.dimmed.has(node.id) ? 0.12 : 1), this.settings.nodeBorderWidth]);
  }

  private frameMaterial(node: ThreeDNode): LineMaterial {
    const key = this.frameMaterialKey(node);
    let material = this.frameMaterials.get(key);
    if (!material) {
      material = new this.frameClasses.LineMaterial({
        color: '#222222', linewidth: this.settings.nodeBorderWidth, worldUnits: false,
        opacity: (parseColor(node.color)?.opacity ?? 1) * (this.dimmed.has(node.id) ? 0.12 : 1),
        transparent: true, depthTest: true, depthWrite: false,
      });
      this.frameMaterials.set(key, material);
      material.resolution.copy(this.resolution);
    }
    return material;
  }

  private outlineMaterial(node: ThreeDNode): Three.ShaderMaterial {
    const key = this.frameMaterialKey(node);
    let material = this.outlineMaterials.get(key);
    if (!material) {
      material = new this.three.ShaderMaterial({
        uniforms: { resolution: { value: this.resolution }, width: { value: this.settings.nodeBorderWidth },
          color: { value: new this.three.Color('#243c42') },
          opacity: { value: (parseColor(node.color)?.opacity ?? 1) * (this.dimmed.has(node.id) ? 0.12 : 1) } },
        vertexShader: threeDOutlineVertex, fragmentShader: threeDOutlineFragment,
        side: this.three.BackSide, transparent: true, depthTest: true, depthWrite: false,
      });
      this.outlineMaterials.set(key, material);
    }
    return material;
  }

  private geometryKey(shape: ThreeDNodeShape, detail: ThreeDMeshDetail): string { return `${this.settings?.shapeVersion ?? 2}:${detail}:${shape}`; }

  private geometry(shape: ThreeDNodeShape, detail: ThreeDMeshDetail = 'balanced'): Three.BufferGeometry {
    const key = this.geometryKey(shape, detail);
    let geometry = this.geometries.get(key);
    if (geometry) return geometry;
    geometry = createThreeDNodeGeometry(this.three, shape, { version: this.settings?.shapeVersion ?? 2, detail });
    this.geometries.set(key, geometry);
    return geometry;
  }

  destroy(): void {
    this.batches?.destroy(); this.batches = undefined;
    this.pickMaterial.dispose();
    this.geometries.forEach(geometry => geometry.dispose());
    this.materials.forEach(material => material.dispose());
    this.frameGeometries.forEach(geometry => geometry.dispose());
    this.frameMaterials.forEach(material => material.dispose());
    this.outlineGeometries.forEach(geometry => geometry.dispose());
    this.outlineMaterials.forEach(material => material.dispose());
    this.geometries.clear();
    this.materials.clear();
    this.meshes.clear();
    this.frameGeometries.clear();
    this.frameMaterials.clear();
    this.outlineGeometries.clear(); this.outlineMaterials.clear();
    this.nodes = [];
    this.labels.destroy();
  }
}
