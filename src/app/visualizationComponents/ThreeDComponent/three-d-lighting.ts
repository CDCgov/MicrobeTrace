import type * as Three from 'three';

/** Shared by the network and cached legend captures. */
export function createThreeDLighting(three: typeof Three, version: 1 | 2, followCamera = false): {
  lights: Three.Light[]; update: (camera: Three.Camera, target?: Three.Vector3) => void;
} {
  // A stronger oblique key and restrained ambient/fill separate adjacent faces
  // while keeping the shaded side readable in the node's category color.
  const ambient = new three.AmbientLight(0xffffff, version === 1 ? 0.55 : 0.28);
  const key = new three.DirectionalLight(0xffffff, version === 1 ? 2.3 : 3.4);
  key.position.set(...(version === 1 ? [4, 6, 7] : [-3, 6, 10]) as [number, number, number]);
  const fill = new three.DirectionalLight(version === 1 ? '#fff1df' : '#ffffff', version === 1 ? 0.75 : 0.38);
  fill.position.set(...(version === 1 ? [-5, 2, -4] : [6, 1, -4]) as [number, number, number]);
  const offset = new three.Vector3(version === 1 ? -5 : 5, 2, 4).normalize().multiplyScalar(10);
  return { lights: [ambient, key, fill], update(camera, target) {
    if (!followCamera) return;
    fill.position.copy(offset).applyQuaternion(camera.quaternion);
    if (target) fill.position.add(target);
    fill.target.position.copy(target ?? new three.Vector3());
    fill.target.updateMatrixWorld();
  } };
}
