import { PerspectiveCamera, Vector3 } from 'three';
import { THREE_D_CAMERA_PRESETS, threeDCameraPresetPose } from './three-d-camera-presets';

describe('3D camera presets', () => {
  const target = { x: 12, y: -23, z: 34 };
  for (const preset of THREE_D_CAMERA_PRESETS) {
    it(`preserves the pan target and distance for ${preset.label}`, () => {
      const pose = threeDCameraPresetPose(preset.value, target, 321);
      expect(pose.target).toEqual(target);
      expect(pose.target).not.toBe(target);
      const offset = new Vector3(pose.position.x - target.x, pose.position.y - target.y, pose.position.z - target.z);
      expect(offset.length()).toBeCloseTo(321, 10);
      expect(offset.normalize().distanceTo(new Vector3(preset.direction.x, preset.direction.y, preset.direction.z).normalize())).toBeLessThan(1e-12);
    });
  }

  it('projects the named axes right and up without mirroring the planar views', () => {
    for (const [preset, horizontal, vertical] of [['xy', 'x', 'y'], ['xz', 'x', 'z'], ['yz', 'y', 'z']] as const) {
      const pose = threeDCameraPresetPose(preset, target, 100);
      const camera = new PerspectiveCamera(50, 1, 0.1, 10000);
      camera.position.set(pose.position.x, pose.position.y, pose.position.z);
      camera.up.set(pose.up.x, pose.up.y, pose.up.z);
      camera.lookAt(target.x, target.y, target.z);
      camera.updateMatrixWorld();
      const right = new Vector3(target.x, target.y, target.z);
      right[horizontal] += 1;
      const up = new Vector3(target.x, target.y, target.z);
      up[vertical] += 1;
      expect(right.project(camera).x).withContext(`${preset}: horizontal axis`).toBeGreaterThan(0);
      expect(up.project(camera).y).withContext(`${preset}: vertical axis`).toBeGreaterThan(0);
    }
  });

  it('produces finite camera positions when the previous camera has no valid distance', () => {
    for (const distance of [0, -1, NaN, Infinity]) {
      const pose = threeDCameraPresetPose('isometric', target, distance);
      expect(Object.values(pose.position).every(Number.isFinite)).toBeTrue();
      expect(Math.hypot(pose.position.x - target.x, pose.position.y - target.y, pose.position.z - target.z)).toBeCloseTo(1000, 10);
    }
  });
});
