import type * as Three from 'three';
import { color as parseColor } from 'd3-color';
import type { ThreeDLink, ThreeDPoint } from './three-d-network.model';

/** A shared dashed cylinder overlays the solid first-origin stroke, in world coordinates. */
export class ThreeDLinkOverlays {
  private geometry?: Three.BufferGeometry;
  private materials = new Map<string, Three.MeshLambertMaterial>();
  private meshes = new Map<string, Three.Mesh>();
  private dimmed = new Set<string>();
  private direction: Three.Vector3;
  private axis: Three.Vector3;

  constructor(private three: typeof Three) {
    this.direction = new three.Vector3();
    this.axis = new three.Vector3(0, 0, 1);
  }

  create(parent: Three.Object3D, link: ThreeDLink): void {
    if (!link.overlayColor) return;
    const mesh = new this.three.Mesh(this.getGeometry(), this.material(link));
    mesh.name = 'origin-overlay';
    mesh.renderOrder = 11;
    mesh.visible = false;
    parent.add(mesh);
    this.meshes.set(link.key, mesh);
  }

  sync(links: ThreeDLink[], dimmed = new Set<string>()): void {
    this.dimmed = dimmed;
    const active = links.filter(link => link.overlayColor);
    const keys = new Set(active.map(link => link.key));
    this.meshes.forEach((mesh, key) => {
      if (!keys.has(key)) { mesh.removeFromParent(); this.meshes.delete(key); }
    });
    active.forEach(link => {
      const mesh = this.meshes.get(link.key);
      if (mesh) mesh.material = this.material(link);
    });
    const materials = new Set(active.map(link => this.materialKey(link)));
    this.materials.forEach((material, key) => {
      if (!materials.has(key)) { material.dispose(); this.materials.delete(key); }
    });
  }

  position(link: ThreeDLink, start: ThreeDPoint, end: ThreeDPoint): void {
    const mesh = this.meshes.get(link.key);
    if (!mesh) return;
    this.direction.set(end.x - start.x, end.y - start.y, end.z - start.z);
    const length = this.direction.length();
    mesh.visible = Number.isFinite(length) && length > 0.000001;
    if (!mesh.visible) return;
    // The custom link group is centered between the endpoints by the renderer.
    mesh.position.copy(this.direction).multiplyScalar(-0.5);
    mesh.quaternion.setFromUnitVectors(this.axis, this.direction.normalize());
    const radius = Math.max(0.05, Math.ceil((link.width ?? 1.6) * 10) / 20) * 1.02;
    mesh.scale.set(radius, radius, length);
  }

  private materialKey(link: ThreeDLink): string {
    return JSON.stringify([link.overlayColor, this.dimmed.has(link.key)]);
  }

  private material(link: ThreeDLink): Three.MeshLambertMaterial {
    const key = this.materialKey(link);
    let material = this.materials.get(key);
    if (!material) {
      const color = parseColor(link.overlayColor);
      material = new this.three.MeshLambertMaterial({
        color: color?.formatHex() ?? link.overlayColor,
        opacity: (color?.opacity ?? 1) * (this.dimmed.has(link.key) ? 0.12 : 1),
        transparent: true, depthWrite: false,
      });
      this.materials.set(key, material);
    }
    return material;
  }

  private getGeometry(): Three.BufferGeometry {
    if (this.geometry) return this.geometry;
    // Six disconnected bands form one shared mesh: one extra draw per dual-origin link.
    const band = new this.three.CylinderGeometry(1, 1, 1 / 12, 6, 1, true)
      .rotateX(Math.PI / 2).translate(0, 0, 1 / 24).toNonIndexed();
    const position = band.getAttribute('position');
    const normal = band.getAttribute('normal');
    const positions = new Float32Array(position.count * 3 * 6);
    const normals = new Float32Array(normal.count * 3 * 6);
    for (let dash = 0; dash < 6; dash++) for (let vertex = 0; vertex < position.count; vertex++) {
      const offset = (dash * position.count + vertex) * 3;
      positions.set([position.getX(vertex), position.getY(vertex), position.getZ(vertex) + dash / 6], offset);
      normals.set([normal.getX(vertex), normal.getY(vertex), normal.getZ(vertex)], offset);
    }
    band.dispose();
    this.geometry = new this.three.BufferGeometry()
      .setAttribute('position', new this.three.BufferAttribute(positions, 3))
      .setAttribute('normal', new this.three.BufferAttribute(normals, 3));
    this.geometry.computeBoundingSphere();
    return this.geometry;
  }

  destroy(): void {
    this.meshes.forEach(mesh => mesh.removeFromParent());
    this.materials.forEach(material => material.dispose());
    this.geometry?.dispose();
    this.materials.clear();
    this.meshes.clear();
    this.geometry = undefined;
  }
}
