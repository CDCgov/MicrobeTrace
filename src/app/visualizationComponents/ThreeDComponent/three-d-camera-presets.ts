import type { ThreeDPoint } from './three-d-network.model';

export const THREE_D_CAMERA_PRESETS = [
  { value: 'xy', label: 'XY', description: 'View the XY plane: X right, Y up', direction: { x: 0, y: 0, z: 1 }, up: { x: 0, y: 1, z: 0 } },
  { value: 'xz', label: 'XZ', description: 'View the XZ plane: X right, Z up', direction: { x: 0, y: -1, z: 0 }, up: { x: 0, y: 0, z: 1 } },
  { value: 'yz', label: 'YZ', description: 'View the YZ plane: Y right, Z up', direction: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 } },
  { value: 'isometric', label: 'Isometric', description: 'View from positive X, Y, and Z with Y upright', direction: { x: 1, y: 1, z: 1 }, up: { x: 0, y: 1, z: 0 } },
] as const;

export type ThreeDCameraPreset = typeof THREE_D_CAMERA_PRESETS[number]['value'];

/** Set a reproducible direction without changing the user's pan target or zoom distance. */
export function threeDCameraPresetPose(preset: ThreeDCameraPreset, target: ThreeDPoint, distance: number): {
  position: ThreeDPoint; target: ThreeDPoint; up: ThreeDPoint;
} {
  const { direction, up } = THREE_D_CAMERA_PRESETS.find(option => option.value === preset)!;
  const scale = (Number.isFinite(distance) && distance > 0 ? distance : 1000) / Math.hypot(direction.x, direction.y, direction.z);
  return {
    position: { x: target.x + direction.x * scale, y: target.y + direction.y * scale, z: target.z + direction.z * scale },
    target: { ...target }, up: { ...up },
  };
}
