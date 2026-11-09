import type * as Three from 'three';
import type { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import type { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import type { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { color as parseColor } from 'd3-color';
import type { ThreeDNode, ThreeDNodeShape, ThreeDSettings } from './three-d-network.model';
import { labelWorldHeight, ThreeDLabelView, ThreeDTextSprites } from './three-d-text-sprites';

export interface ThreeDNodeFrameClasses {
  LineSegments2: typeof LineSegments2;
  LineSegmentsGeometry: typeof LineSegmentsGeometry;
  LineMaterial: typeof LineMaterial;
}

/** Renderer-owned meshes share unit geometries; sizing is applied through mesh scale. */
export class ThreeDNodeObjects {
  private geometries = new Map<ThreeDNodeShape, Three.BufferGeometry>();
  private materials = new Map<string, Three.MeshLambertMaterial>();
  private meshes = new Map<string, Three.Mesh>();
  private frameGeometries = new Map<ThreeDNodeShape, LineSegmentsGeometry>();
  private frameMaterials = new Map<string, LineMaterial>();
  private size = 4;
  private settings?: ThreeDSettings;
  private dimmed = new Set<string>();
  private labels: ThreeDTextSprites;
  private labelView?: ThreeDLabelView;
  private nodes: ThreeDNode[] = [];

  constructor(private three: typeof Three, private frameClasses: ThreeDNodeFrameClasses) {
    this.labels = new ThreeDTextSprites(three);
  }

  create(node: ThreeDNode): Three.Mesh {
    const mesh = new this.three.Mesh(this.geometry(node.shape), this.material(node));
    this.update(mesh, node);
    this.meshes.set(node.id, mesh);
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
    this.labels.retain(nodes.map(node => node.label || ''));
  }

  private update(mesh: Three.Mesh, node: ThreeDNode): void {
    mesh.geometry = this.geometry(node.shape);
    mesh.material = this.material(node);
    const radius = node.radius ?? this.size * Math.cbrt(node.value);
    mesh.scale.setScalar(radius);
    this.updateLabel(mesh, node, radius);
    let frame = mesh.getObjectByName('node-frame') as LineSegments2;
    if (this.settings?.nodeBorderWidth) {
      if (!frame) {
        frame = new this.frameClasses.LineSegments2(this.frameGeometry(node.shape), this.frameMaterial(node));
        frame.name = 'node-frame';
        frame.renderOrder = 1;
        mesh.add(frame);
      }
      frame.geometry = this.frameGeometry(node.shape);
      frame.material = this.frameMaterial(node);
    } else if (frame) mesh.remove(frame);
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
      // Sprite centers are in camera-facing coordinates, so orientation survives orbit and roll.
      label.center.set(orientation === 'Right' ? -1.2 / label.scale.x : orientation === 'Left' ? 1 + 1.2 / label.scale.x : 0.5,
        orientation === 'Top' ? -1.2 / label.scale.y : orientation === 'Bottom' ? 1 + 1.2 / label.scale.y : 0.5);
      label.position.set(0, 0, 0);
    }
  }

  private materialKey(node: ThreeDNode): string {
    return JSON.stringify([node.color, ['cube', 'diamond', 'pyramid'].includes(node.shape), this.dimmed.has(node.id), Boolean(this.settings?.nodeBorderWidth)]);
  }

  private material(node: ThreeDNode): Three.MeshLambertMaterial {
    const key = this.materialKey(node);
    let material = this.materials.get(key);
    if (!material) {
      const parsed = parseColor(node.color);
      material = new this.three.MeshLambertMaterial({
        color: parsed?.formatHex() ?? node.color,
        opacity: (parsed?.opacity ?? 1) * (this.dimmed.has(node.id) ? 0.12 : 1), transparent: true,
        flatShading: ['cube', 'diamond', 'pyramid'].includes(node.shape),
        polygonOffset: Boolean(this.settings?.nodeBorderWidth), polygonOffsetFactor: 1, polygonOffsetUnits: 1,
      });
      this.materials.set(key, material);
    }
    return material;
  }

  private frameGeometry(shape: ThreeDNodeShape): LineSegmentsGeometry {
    let geometry = this.frameGeometries.get(shape);
    if (!geometry) {
      // Crease edges preserve the shape's faces without drawing coplanar triangulation diagonals.
      const edges = new this.three.EdgesGeometry(this.geometry(shape));
      geometry = new this.frameClasses.LineSegmentsGeometry().fromEdgesGeometry(edges);
      edges.dispose();
      this.frameGeometries.set(shape, geometry);
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
    }
    return material;
  }

  private geometry(shape: ThreeDNodeShape): Three.BufferGeometry {
    let geometry = this.geometries.get(shape);
    if (geometry) return geometry;
    switch (shape) {
      case 'cube': geometry = new this.three.BoxGeometry(2, 2, 2); break;
      case 'cone': geometry = new this.three.ConeGeometry(1, 2, 12); break;
      case 'cylinder': geometry = new this.three.CylinderGeometry(1, 1, 2, 12); break;
      case 'diamond': geometry = new this.three.OctahedronGeometry(1); break;
      case 'pyramid': geometry = new this.three.ConeGeometry(1, 2, 4).rotateY(Math.PI / 4); break;
      default: geometry = new this.three.SphereGeometry(1, 8, 8);
    }
    geometry.center();
    geometry.computeBoundingSphere();
    const radius = geometry.boundingSphere!.radius;
    geometry.scale(1 / radius, 1 / radius, 1 / radius);
    this.geometries.set(shape, geometry);
    return geometry;
  }

  destroy(): void {
    this.geometries.forEach(geometry => geometry.dispose());
    this.materials.forEach(material => material.dispose());
    this.frameGeometries.forEach(geometry => geometry.dispose());
    this.frameMaterials.forEach(material => material.dispose());
    this.geometries.clear();
    this.materials.clear();
    this.meshes.clear();
    this.frameGeometries.clear();
    this.frameMaterials.clear();
    this.nodes = [];
    this.labels.destroy();
  }
}
