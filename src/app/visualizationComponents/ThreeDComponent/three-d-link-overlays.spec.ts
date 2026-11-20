import * as Three from 'three';
import { ThreeDLink } from './three-d-network.model';
import { ThreeDLinkOverlays } from './three-d-link-overlays';

describe('3D dual-origin strokes', () => {
  const link = (key = 'AB'): ThreeDLink => ({ key, source: 'A', target: 'B', color: '#ff0000', overlayColor: 'rgba(0,0,255,0.5)', width: 2, tooltip: '' });
  const mesh = (parent: Three.Group) => parent.getObjectByName('origin-overlay') as Three.Mesh<Three.BufferGeometry, Three.MeshLambertMaterial>;

  it('shares dashed geometry and materials between links and leaves gaps for the primary color', () => {
    const overlays = new ThreeDLinkOverlays(Three);
    const a = new Three.Group(), b = new Three.Group();
    overlays.create(a, link()); overlays.create(b, link('other'));
    expect(mesh(a).geometry).toBe(mesh(b).geometry);
    expect(mesh(a).material).toBe(mesh(b).material);
    a.position.z = 0.5;
    overlays.position(link(), { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
    // Use unit width for the ray test, without changing the band layout.
    mesh(a).scale.x = mesh(a).scale.y = 1;
    a.updateMatrixWorld(true);
    const cast = (z: number) => new Three.Raycaster(new Three.Vector3(2, 0, z), new Three.Vector3(-1, 0, 0)).intersectObject(mesh(a));
    expect(cast(1 / 24).length).toBeGreaterThan(0);
    expect(cast(1 / 8).length).toBe(0);
    overlays.destroy();
  });

  it('tracks arbitrary 3D endpoints and the renderer rounded width, without moving shared endpoints', () => {
    const overlays = new ThreeDLinkOverlays(Three), parent = new Three.Group();
    const data = { ...link(), width: 0.31 };
    overlays.create(parent, data);
    const start = { x: 1, y: 2, z: 3 }, end = { x: 4, y: 6, z: 3 };
    parent.position.set(2.5, 4, 3);
    overlays.position(data, start, end);
    parent.updateMatrixWorld(true);
    expect(mesh(parent).localToWorld(new Three.Vector3(0, 0, 0)).toArray()).toEqual([1, 2, 3]);
    const tip = mesh(parent).localToWorld(new Three.Vector3(0, 0, 1));
    expect(tip.x).toBeCloseTo(4); expect(tip.y).toBeCloseTo(6); expect(tip.z).toBeCloseTo(3);
    expect(mesh(parent).scale.x).toBeCloseTo(0.204);
    expect(start).toEqual({ x: 1, y: 2, z: 3 });
    overlays.position(data, start, start);
    expect(mesh(parent).visible).toBe(false);
    overlays.position(data, start, end);
    expect(mesh(parent).visible).toBe(true);
    overlays.destroy();
  });

  it('updates color, transparency, and neighborhood dimming without replacing the mesh', () => {
    const overlays = new ThreeDLinkOverlays(Three), parent = new Three.Group(), data = link();
    overlays.sync([data]); overlays.create(parent, data);
    const original = mesh(parent);
    overlays.sync([data], new Set([data.key]));
    expect(mesh(parent)).toBe(original);
    expect(original.material.opacity).toBeCloseTo(0.06);
    data.overlayColor = 'rgba(0,255,0,0.25)';
    overlays.sync([data]);
    expect(original.material.color.getHexString()).toBe('00ff00');
    expect(original.material.opacity).toBe(0.25);
    overlays.destroy();
  });

  it('removes filtered or ordinary links and releases materials and shared geometry', () => {
    const overlays = new ThreeDLinkOverlays(Three), parent = new Three.Group(), data = link();
    overlays.sync([data]); overlays.create(parent, data);
    const original = mesh(parent);
    const materialDispose = spyOn(original.material, 'dispose').and.callThrough();
    const geometryDispose = spyOn(original.geometry, 'dispose').and.callThrough();
    data.overlayColor = undefined;
    overlays.sync([data]);
    expect(parent.getObjectByName('origin-overlay')).toBeUndefined();
    expect(materialDispose).toHaveBeenCalledTimes(1);
    overlays.destroy();
    expect(geometryDispose).toHaveBeenCalledTimes(1);
  });
});
