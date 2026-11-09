import type * as Three from 'three';
import { color as parseColor } from 'd3-color';
import type { ThreeDLink, ThreeDPoint } from './three-d-network.model';

/** Outlined arrowheads extend beyond opaque link cylinders without duplicating links or forces. */
export class ThreeDLinkArrows {
  private geometry?: Three.ConeGeometry;
  private materials = new Map<string, Three.MeshLambertMaterial>();
  private meshes = new Map<string, Three.Mesh[]>();
  private dimmed = new Set<string>();
  private direction: Three.Vector3;
  private axis: Three.Vector3;

  constructor(private three: typeof Three) {
    this.direction = new three.Vector3();
    this.axis = new three.Vector3(0, 0, 1);
  }

  create(parent: Three.Object3D, link: ThreeDLink): void {
    if (!link.sourceArrow && !link.targetArrow) return;
    this.geometry ??= new this.three.ConeGeometry(1, 1, 8).translate(0, 0.5, 0).rotateX(Math.PI / 2);
    this.meshes.get(link.key)?.forEach(mesh => mesh.removeFromParent());
    const meshes: Three.Mesh[] = [];
    for (const name of ['source-arrow', 'target-arrow']) {
      if (name === 'source-arrow' ? !link.sourceArrow : !link.targetArrow) continue;
      const mesh = new this.three.Mesh(this.geometry, this.material(link));
      mesh.name = name;
      mesh.visible = false;
      const outline = new this.three.Mesh(this.geometry, this.material(link, true));
      outline.name = 'arrow-outline';
      outline.scale.set(1.13, 1.13, 1.04);
      mesh.add(outline);
      parent.add(mesh);
      meshes.push(mesh);
    }
    this.meshes.set(link.key, meshes);
  }

  sync(links: ThreeDLink[], dimmed = new Set<string>()): void {
    this.dimmed = dimmed;
    const active = links.filter(link => link.sourceArrow || link.targetArrow);
    const keys = new Set(active.map(link => link.key));
    this.meshes.forEach((meshes, key) => {
      if (!keys.has(key)) { meshes.forEach(mesh => mesh.removeFromParent()); this.meshes.delete(key); }
    });
    active.forEach(link => {
      this.meshes.get(link.key)?.forEach(mesh => {
        mesh.visible &&= mesh.name === 'source-arrow' ? Boolean(link.sourceArrow) : Boolean(link.targetArrow);
        mesh.material = this.material(link);
        (mesh.getObjectByName('arrow-outline') as Three.Mesh).material = this.material(link, true);
      });
    });
    const materials = new Set(active.flatMap(link => [this.materialKey(link), this.materialKey(link, true)]));
    this.materials.forEach((material, key) => {
      if (!materials.has(key)) { material.dispose(); this.materials.delete(key); }
    });
  }

  position(link: ThreeDLink, start: ThreeDPoint, end: ThreeDPoint): void {
    const meshes = this.meshes.get(link.key);
    if (!meshes) return;
    this.direction.set(end.x - start.x, end.y - start.y, end.z - start.z);
    const length = this.direction.length();
    const sourceRadius = typeof link.source === 'object' ? link.source.radius ?? 0 : 0;
    const targetRadius = typeof link.target === 'object' ? link.target.radius ?? 0 : 0;
    const available = length - sourceRadius - targetRadius;
    const visible = Number.isFinite(length) && available >= 4;
    meshes.forEach(mesh => mesh.visible = visible && (mesh.name === 'source-arrow' ? Boolean(link.sourceArrow) : Boolean(link.targetArrow)));
    if (!visible) return;
    this.direction.normalize();
    const strokeRadius = Math.max(0.05, Math.ceil((link.width ?? 1.6) * 10) / 20);
    const radius = Math.max(1, strokeRadius * 1.8);
    const arrowLength = Math.min(Math.max(4, radius * 2.5), available / (link.sourceArrow && link.targetArrow ? 2 : 1));
    for (const mesh of meshes) {
      const reverse = mesh.name === 'source-arrow';
      const base = sourceRadius + (reverse ? arrowLength + (available - arrowLength) * 0.15 : (available - arrowLength) * 0.85);
      mesh.position.copy(this.direction).multiplyScalar(base - length / 2);
      mesh.quaternion.setFromUnitVectors(this.axis, this.direction);
      if (reverse) mesh.rotateY(Math.PI);
      mesh.scale.set(radius, radius, arrowLength);
    }
  }

  private materialKey(link: ThreeDLink, outline = false): string { return JSON.stringify([link.color, this.dimmed.has(link.key), outline]); }

  private material(link: ThreeDLink, outline = false): Three.MeshLambertMaterial {
    const key = this.materialKey(link, outline);
    let material = this.materials.get(key);
    if (!material) {
      const color = parseColor(link.color);
      material = new this.three.MeshLambertMaterial({
        color: outline ? '#222222' : color?.formatHex() ?? link.color,
        opacity: Math.min(1, (color?.opacity ?? 1) * 3 * (this.dimmed.has(link.key) ? 0.12 : 1)), transparent: true,
        side: outline ? this.three.BackSide : this.three.FrontSide,
      });
      this.materials.set(key, material);
    }
    return material;
  }

  destroy(): void {
    this.meshes.forEach(meshes => meshes.forEach(mesh => mesh.removeFromParent()));
    this.materials.forEach(material => material.dispose());
    this.geometry?.dispose();
    this.meshes.clear(); this.materials.clear();
    this.geometry = undefined;
  }
}
