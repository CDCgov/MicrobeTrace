import type * as Three from 'three';
import type { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import type { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import type { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import type { ThreeDNodeFrameClasses } from './three-d-node-objects';
import { threeDOutlineFragment, threeDOutlineVertex } from './three-d-node-geometry';

export interface ThreeDNodeBatchEntry {
  mesh: Three.Mesh;
  geometry: Three.BufferGeometry;
  color: Three.Color;
  frame?: LineSegmentsGeometry;
  outline?: Three.BufferGeometry;
  width: number;
}
interface Batch {
  members: ThreeDNodeBatchEntry[];
  surface: Three.InstancedMesh;
  outline?: Three.InstancedMesh;
  frame?: LineSegments2;
  positions?: Float32Array;
  unitSegments?: number[];
}

/** Opaque nodes share draw operations; invisible per-node meshes retain picking. */
export class ThreeDNodeBatches {
  readonly root: Three.Group;
  private batches = new Map<string, Batch>();
  constructor(private three: typeof Three, private lines: ThreeDNodeFrameClasses, scene: Three.Scene, private resolution: Three.Vector2) {
    this.root = new three.Group();
    this.root.name = '3d-node-batches';
    scene.add(this.root);
  }

  sync(entries: ThreeDNodeBatchEntry[]): void {
    const groups = new Map<string, ThreeDNodeBatchEntry[]>();
    entries.forEach(entry => {
      const key = `${entry.geometry.uuid}:${entry.frame?.uuid ?? ''}:${entry.outline?.uuid ?? ''}:${entry.width}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(entry);
    });
    this.batches.forEach((batch, key) => { if (!groups.has(key)) { this.disposeBatch(batch); this.batches.delete(key); } });
    groups.forEach((members, key) => {
      let batch = this.batches.get(key);
      if (batch && batch.surface.instanceMatrix.count < members.length) { this.disposeBatch(batch); this.batches.delete(key); batch = undefined; }
      if (!batch) { batch = this.create(members); this.batches.set(key, batch); }
      batch.members = members;
      batch.surface.count = members.length;
      if (batch.outline) batch.outline.count = members.length;
      if (batch.frame) batch.frame.geometry.instanceCount = members.length * (batch.unitSegments!.length / 6);
      members.forEach((entry, index) => batch.surface.setColorAt(index, entry.color));
      batch.surface.instanceColor!.needsUpdate = true;
    });
  }

  private create(members: ThreeDNodeBatchEntry[]): Batch {
    const first = members[0], facets = Boolean(first.geometry.getAttribute('color'));
    const material = new this.three.MeshLambertMaterial({ color: 0xffffff, flatShading: facets, vertexColors: facets,
      polygonOffset: Boolean(first.width), polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    const surface = new this.three.InstancedMesh(first.geometry, material, members.length);
    surface.name = 'node-surfaces';
    surface.instanceMatrix.setUsage(this.three.DynamicDrawUsage);
    surface.frustumCulled = false;
    surface.raycast = () => {};
    this.root.add(surface);
    const batch: Batch = { members, surface };
    if (first.outline) {
      const outlineMaterial = new this.three.ShaderMaterial({
        uniforms: { resolution: { value: this.resolution }, width: { value: first.width }, color: { value: new this.three.Color('#243c42') }, opacity: { value: 1 } },
        vertexShader: threeDOutlineVertex, fragmentShader: threeDOutlineFragment,
        side: this.three.BackSide, transparent: true, depthTest: true, depthWrite: false,
      });
      batch.outline = new this.three.InstancedMesh(first.outline, outlineMaterial, members.length);
      batch.outline.name = 'node-outline'; batch.outline.renderOrder = 1;
      batch.outline.instanceMatrix.setUsage(this.three.DynamicDrawUsage);
      batch.outline.frustumCulled = false; batch.outline.raycast = () => {};
      this.root.add(batch.outline);
    }
    if (first.frame) {
      const starts = first.frame.getAttribute('instanceStart'), ends = first.frame.getAttribute('instanceEnd');
      if (starts?.count) {
        const unit: number[] = [];
        for (let i = 0; i < starts.count; i++) unit.push(starts.getX(i), starts.getY(i), starts.getZ(i), ends.getX(i), ends.getY(i), ends.getZ(i));
        batch.unitSegments = unit;
        batch.positions = new Float32Array(unit.length * members.length);
        const geometry = new this.lines.LineSegmentsGeometry().setPositions(batch.positions);
        const lineMaterial = new this.lines.LineMaterial({ color: '#222222', linewidth: first.width, worldUnits: false, transparent: true, opacity: 1, depthTest: true, depthWrite: false });
        lineMaterial.resolution.copy(this.resolution);
        batch.frame = new this.lines.LineSegments2(geometry, lineMaterial);
        batch.frame.name = 'node-frame'; batch.frame.renderOrder = 2;
        batch.frame.frustumCulled = false; batch.frame.raycast = () => {};
        this.root.add(batch.frame);
      }
    }
    return batch;
  }

  update(): void {
    this.batches.forEach(batch => {
      batch.members.forEach((entry, index) => {
        entry.mesh.updateWorldMatrix(true, false);
        const matrix = entry.mesh.matrixWorld;
        batch.surface.setMatrixAt(index, matrix);
        batch.outline?.setMatrixAt(index, matrix);
        if (batch.positions) {
          const elements = matrix.elements, unit = batch.unitSegments!, target = batch.positions;
          for (let i = 0; i < unit.length; i += 3) {
            const x = unit[i], y = unit[i + 1], z = unit[i + 2], offset = index * unit.length + i;
            target[offset] = elements[0] * x + elements[4] * y + elements[8] * z + elements[12];
            target[offset + 1] = elements[1] * x + elements[5] * y + elements[9] * z + elements[13];
            target[offset + 2] = elements[2] * x + elements[6] * y + elements[10] * z + elements[14];
          }
        }
      });
      batch.surface.instanceMatrix.needsUpdate = true;
      if (batch.outline) batch.outline.instanceMatrix.needsUpdate = true;
      if (batch.frame) {
        (batch.frame.geometry.getAttribute('instanceStart') as Three.InterleavedBufferAttribute).data.needsUpdate = true;
        (batch.frame.material as LineMaterial).resolution.copy(this.resolution);
      }
    });
  }

  private disposeBatch(batch: Batch): void {
    [batch.surface, batch.outline].forEach(mesh => { if (mesh) { mesh.removeFromParent(); mesh.dispose(); (mesh.material as Three.Material).dispose(); } });
    if (batch.frame) { batch.frame.removeFromParent(); batch.frame.geometry.dispose(); (batch.frame.material as Three.Material).dispose(); }
  }

  destroy(): void { this.batches.forEach(batch => this.disposeBatch(batch)); this.batches.clear(); this.root.removeFromParent(); }
}
