import type * as Three from 'three';
import { color as parseColor } from 'd3-color';
import type { ThreeDNode, ThreeDNodeShape } from './three-d-network.model';

/** Renderer-owned meshes share unit geometries; sizing is applied through mesh scale. */
export class ThreeDNodeObjects {
  private geometries = new Map<ThreeDNodeShape, Three.BufferGeometry>();
  private materials = new Map<string, Three.MeshLambertMaterial>();
  private meshes = new Map<string, Three.Mesh>();
  private size = 4;

  constructor(private three: typeof Three) {}

  create(node: ThreeDNode): Three.Mesh {
    const mesh = new this.three.Mesh(this.geometry(node.shape), this.material(node));
    this.update(mesh, node);
    this.meshes.set(node.id, mesh);
    return mesh;
  }

  sync(nodes: ThreeDNode[], size: number): void {
    this.size = size;
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
  }

  private update(mesh: Three.Mesh, node: ThreeDNode): void {
    mesh.geometry = this.geometry(node.shape);
    mesh.material = this.material(node);
    mesh.scale.setScalar(this.size * Math.cbrt(node.value));
  }

  private materialKey(node: ThreeDNode): string {
    return JSON.stringify([node.color, ['cube', 'diamond', 'pyramid'].includes(node.shape)]);
  }

  private material(node: ThreeDNode): Three.MeshLambertMaterial {
    const key = this.materialKey(node);
    let material = this.materials.get(key);
    if (!material) {
      const parsed = parseColor(node.color);
      material = new this.three.MeshLambertMaterial({
        color: parsed?.formatHex() ?? node.color, opacity: parsed?.opacity ?? 1, transparent: true,
        flatShading: ['cube', 'diamond', 'pyramid'].includes(node.shape),
      });
      this.materials.set(key, material);
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
    this.geometries.clear();
    this.materials.clear();
    this.meshes.clear();
  }
}
