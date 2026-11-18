import type * as Three from 'three';
import type { ThreeDNodeShape } from './three-d-network.model';

export const facetedThreeDShape = (shape: ThreeDNodeShape): boolean => ['cube', 'diamond', 'pyramid', 'star'].includes(shape);
export const smoothThreeDShape = (shape: ThreeDNodeShape): boolean => ['sphere', 'torus', 'pill'].includes(shape);
const referenceAreas = new WeakMap<object, number>();
export type ThreeDMeshDetail = 'coarse' | 'balanced' | 'fine';
export interface ThreeDGeometryOptions { version?: 1 | 2; detail?: ThreeDMeshDetail; }
// Generated with the deterministic projected-silhouette sampler in Shape Lab.
// No sampling is performed while loading or navigating the application.
export const THREE_D_CONCAVE_SCALES = {
  1: { coarse: { torus: 1.3300252341405527, star: 1.529107764536797 }, balanced: { torus: 1.3196386013009136, star: 1.529107764536797 }, fine: { torus: 1.3105956247980344, star: 1.529107764536797 } },
  2: { coarse: { torus: 1.4030964843620641, star: 1.434861166055959 }, balanced: { torus: 1.3915890147513863, star: 1.434861166055959 }, fine: { torus: 1.3824857520196698, star: 1.434861166055959 } },
};

function unitRadius(geometry: Three.BufferGeometry): Three.BufferGeometry {
  geometry.center();
  geometry.computeBoundingSphere();
  const radius = geometry.boundingSphere!.radius;
  geometry.scale(1 / radius, 1 / radius, 1 / radius);
  return geometry;
}

function surfaceArea(three: typeof Three, geometry: Three.BufferGeometry): number {
  const positions = geometry.getAttribute('position'), index = geometry.getIndex();
  const count = index ? index.count : positions.count;
  const a = new three.Vector3(), b = new three.Vector3(), c = new three.Vector3();
  let area = 0;
  for (let i = 0; i < count; i += 3) {
    a.fromBufferAttribute(positions, index ? index.getX(i) : i);
    b.fromBufferAttribute(positions, index ? index.getX(i + 1) : i + 1);
    c.fromBufferAttribute(positions, index ? index.getX(i + 2) : i + 2);
    area += b.sub(a).cross(c.sub(a)).length() / 2;
  }
  return area;
}

function starGeometry(three: typeof Three, version: 1 | 2): Three.BufferGeometry {
  const shape = new three.Shape();
  for (let i = 0; i < 10; i++) {
    const angle = Math.PI / 2 + i * Math.PI / 5, radius = i % 2 ? 0.45 : 1;
    const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius;
    if (i) shape.lineTo(x, y); else shape.moveTo(x, y);
  }
  shape.closePath();
  return new three.ExtrudeGeometry(shape, { depth: version === 1 ? 0.65 : 0.9, bevelEnabled: false, steps: 1 });
}

/** Raw meshes shared by app rendering, icon generation, and offline size calibration. */
export function rawThreeDNodeGeometry(three: typeof Three, shape: ThreeDNodeShape, options: ThreeDGeometryOptions = {}): Three.BufferGeometry {
  const version = options.version ?? 2, detail = options.detail ?? 'balanced';
  const radial = detail === 'fine' ? 32 : detail === 'coarse' ? 12 : 24;
  let geometry: Three.BufferGeometry;
  switch (shape) {
    case 'cube': geometry = new three.BoxGeometry(2, 2, 2); break;
    case 'cone': geometry = new three.ConeGeometry(1, 2, radial); break;
    case 'cylinder': geometry = new three.CylinderGeometry(1, 1, 2, radial); break;
    case 'diamond': geometry = new three.OctahedronGeometry(1).scale(1, version === 1 ? 1 : 1.28, 1); break;
    case 'pyramid': geometry = new three.ConeGeometry(1, 2, 4).rotateY(Math.PI / 4); break;
    case 'torus': geometry = new three.TorusGeometry(version === 1 ? 0.72 : 0.76, version === 1 ? 0.26 : 0.22, detail === 'fine' ? 16 : detail === 'coarse' ? 8 : 10, detail === 'fine' ? 40 : detail === 'coarse' ? 20 : 28); break;
    case 'pill': geometry = new three.CapsuleGeometry(0.45, version === 1 ? 1.1 : 1.35, detail === 'fine' ? 8 : detail === 'coarse' ? 4 : 6, detail === 'fine' ? 32 : detail === 'coarse' ? 12 : 20, 1); break;
    case 'star': geometry = starGeometry(three, version); break;
    default: geometry = new three.SphereGeometry(1, detail === 'fine' ? 32 : detail === 'coarse' ? 12 : 20, detail === 'fine' ? 20 : detail === 'coarse' ? 8 : 12);
  }
  return unitRadius(geometry);
}

/** Cached by the node renderer; no per-node tessellation or size sampling. */
export function createThreeDNodeGeometry(three: typeof Three, shape: ThreeDNodeShape, options: ThreeDGeometryOptions = {}): Three.BufferGeometry {
  const version = options.version ?? 2, detail = options.detail ?? 'balanced';
  let geometry = rawThreeDNodeGeometry(three, shape, options);
  let reference = referenceAreas.get(three);
  if (reference === undefined) {
    const sphere = unitRadius(new three.SphereGeometry(1, 20, 12));
    reference = surfaceArea(three, sphere);
    referenceAreas.set(three, reference);
    sphere.dispose();
  }
  // Nonconvex multipliers were measured by projected-triangle union in Shape Lab
  // (128 directions, 128² grid; checked at 192/192²). They include holes/gaps.
  // Keep these in sync with the fixed torus/star factories above.
  const scale = shape === 'torus' || shape === 'star' ? THREE_D_CONCAVE_SCALES[version][detail][shape]
    : Math.sqrt(reference / surfaceArea(three, geometry));
  geometry.scale(scale, scale, scale);
  if (facetedThreeDShape(shape)) {
    const source = geometry;
    if (geometry.index) { geometry = source.toNonIndexed(); source.dispose(); }
    const positions = geometry.getAttribute('position'), colors = new Float32Array(positions.count * 3);
    const a = new three.Vector3(), b = new three.Vector3(), c = new three.Vector3();
    for (let i = 0; i < positions.count; i += 3) {
      a.fromBufferAttribute(positions, i); b.fromBufferAttribute(positions, i + 1); c.fromBufferAttribute(positions, i + 2);
      const normal = b.sub(a).cross(c.sub(a)).normalize();
      const tone = 0.91 + 0.07 * Math.sin(normal.x * 2.1 + normal.y * 3.7 + normal.z * 5.2);
      colors.fill(tone, i * 3, (i + 3) * 3);
    }
    geometry.setAttribute('color', new three.BufferAttribute(colors, 3));
  }
  geometry.computeBoundingSphere();
  return geometry;
}

/** Weld normals by position for a continuous silhouette, preserving surface facets. */
export function createThreeDOutlineGeometry(three: typeof Three, geometry: Three.BufferGeometry): Three.BufferGeometry {
  const hull = geometry.clone(), position = hull.getAttribute('position'), index = hull.getIndex();
  for (const name of Object.keys(hull.attributes)) if (name !== 'position') hull.deleteAttribute(name);
  const sums = new Map<string, Three.Vector3>();
  const keys = Array.from({ length: position.count }, (_, i) => [position.getX(i), position.getY(i), position.getZ(i)].map(value => Math.round(value * 1e5)).join(','));
  const a = new three.Vector3(), b = new three.Vector3(), c = new three.Vector3();
  const count = index ? index.count : position.count;
  for (let i = 0; i < count; i += 3) {
    const ids = [0, 1, 2].map(offset => index ? index.getX(i + offset) : i + offset);
    a.fromBufferAttribute(position, ids[0]); b.fromBufferAttribute(position, ids[1]); c.fromBufferAttribute(position, ids[2]);
    const normal = b.sub(a).cross(c.sub(a));
    ids.forEach(id => { if (!sums.has(keys[id])) sums.set(keys[id], new three.Vector3()); sums.get(keys[id])!.add(normal); });
  }
  const normals = new Float32Array(position.count * 3);
  keys.forEach((key, i) => sums.get(key)!.clone().normalize().toArray(normals, i * 3));
  hull.setAttribute('normal', new three.BufferAttribute(normals, 3));
  return hull;
}

export const threeDOutlineVertex = `
  uniform vec2 resolution;
  uniform float width;
  void main() {
    vec4 local = vec4(position, 1.0);
    vec3 localNormal = normal;
    #ifdef USE_INSTANCING
      local = instanceMatrix * local;
      localNormal = mat3(instanceMatrix) * localNormal;
    #endif
    vec4 clip = projectionMatrix * modelViewMatrix * local;
    vec4 stepClip = projectionMatrix * vec4(normalMatrix * localNormal, 0.0);
    vec2 direction = (stepClip.xy * clip.w - clip.xy * stepClip.w) * resolution;
    float lengthSquared = dot(direction, direction);
    if (lengthSquared > 0.000001) clip.xy += direction * inversesqrt(lengthSquared) * (2.0 * width / resolution) * clip.w;
    gl_Position = clip;
  }`;
export const threeDOutlineFragment = `uniform vec3 color; uniform float opacity; void main() {
  gl_FragColor = vec4(color, opacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
