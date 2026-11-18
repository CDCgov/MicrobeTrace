import * as Three from 'three';
import { createThreeDLighting } from './three-d-lighting';

describe('3D shape lighting', () => {
  it('retains earlier lighting and gives the optimized style a stronger key and restrained neutral fill', () => {
    const earlier = createThreeDLighting(Three, 1), current = createThreeDLighting(Three, 2);
    expect(earlier.lights.map(light => light.intensity)).toEqual([0.55, 2.3, 0.75]);
    expect(current.lights[2].color.getHexString()).toBe('ffffff');
    expect(current.lights[0].intensity).toBeLessThan(earlier.lights[0].intensity);
    expect(current.lights[1].intensity).toBeGreaterThan(earlier.lights[1].intensity);
    expect(current.lights[2].intensity).toBeLessThan(earlier.lights[2].intensity);
    expect(current.lights.length).toBe(earlier.lights.length);
  });
  it('moves camera fill around the target without changing the camera or fixed lighting', () => {
    const camera = new Three.PerspectiveCamera(); camera.position.set(0, 0, 100); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    const following = createThreeDLighting(Three, 2, true), fixed = createThreeDLighting(Three, 2);
    const target = new Three.Vector3(10, 20, 30), position = camera.position.clone();
    following.update(camera, target); fixed.update(camera, target);
    const first = following.lights[2].position.clone();
    camera.rotateY(Math.PI / 2); camera.updateMatrixWorld(); following.update(camera, target); fixed.update(camera, target);
    expect(following.lights[2].position.distanceTo(first)).toBeGreaterThan(1);
    expect((following.lights[2] as Three.DirectionalLight).target.position.toArray()).toEqual(target.toArray());
    expect(fixed.lights[2].position.toArray()).toEqual([6, 1, -4]);
    expect(camera.position.toArray()).toEqual(position.toArray());
  });
});
