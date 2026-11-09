import * as Three from 'three';
import { ThreeDLink } from './three-d-network.model';
import { ThreeDLinkArrows } from './three-d-link-arrows';

describe('3D link arrowheads', () => {
  const link = (key = 'AB'): ThreeDLink => ({ key, source: 'A', target: 'B', color: 'rgba(255,0,0,0.2)', tooltip: '', sourceArrow: true });
  const mesh = (parent: Three.Group) => parent.getObjectByName('source-arrow') as Three.Mesh<Three.ConeGeometry, Three.MeshLambertMaterial>;

  it('points toward the source in three dimensions and leaves space for the nodes', () => {
    const arrows = new ThreeDLinkArrows(Three), parent = new Three.Group(), data = link();
    const start = { x: 1, y: 2, z: 3 }, end = { x: 31, y: 42, z: 3 };
    data.source = { ...start, radius: 2 } as any; data.target = { ...end, radius: 3 } as any;
    parent.position.set(16, 22, 3);
    arrows.create(parent, data); arrows.position(data, start, end);
    parent.updateMatrixWorld(true);
    const base = mesh(parent).localToWorld(new Three.Vector3());
    const tip = mesh(parent).localToWorld(new Three.Vector3(0, 0, 1));
    expect(base.distanceTo(new Three.Vector3(1, 2, 3))).toBeCloseTo(12.15);
    expect(tip.distanceTo(new Three.Vector3(1, 2, 3))).toBeCloseTo(8.15);
    expect(mesh(parent).visible).toBe(true);
    expect(start).toEqual({ x: 1, y: 2, z: 3 }); expect(end).toEqual({ x: 31, y: 42, z: 3 });
    arrows.destroy();
  });

  it('renders both directions with outlined heads wider than fully opaque links', () => {
    const arrows = new ThreeDLinkArrows(Three), parent = new Three.Group();
    const data = { ...link(), targetArrow: true, width: 12, color: '#123456' };
    arrows.create(parent, data);
    arrows.position(data, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 100 });
    for (const name of ['source-arrow', 'target-arrow']) {
      const arrow = parent.getObjectByName(name) as Three.Mesh<Three.ConeGeometry, Three.MeshLambertMaterial>;
      expect(arrow.visible).toBe(true);
      expect(arrow.scale.x).toBeGreaterThan(data.width / 2);
      expect(arrow.material.opacity).toBe(1);
      const outline = arrow.getObjectByName('arrow-outline') as Three.Mesh<Three.ConeGeometry, Three.MeshLambertMaterial>;
      expect(outline.material.color.getHexString()).toBe('222222');
      expect(outline.material.side).toBe(Three.BackSide);
    }
    arrows.destroy();
  });

  it('shares graphics resources and updates color and dimming without replacing the arrow', () => {
    const arrows = new ThreeDLinkArrows(Three), a = new Three.Group(), b = new Three.Group();
    const first = link(), second = link('other');
    arrows.create(a, first); arrows.create(b, second);
    expect(mesh(a).geometry).toBe(mesh(b).geometry); expect(mesh(a).material).toBe(mesh(b).material);
    const original = mesh(a);
    arrows.sync([first, second], new Set([first.key]));
    expect(mesh(a)).toBe(original); expect(original.material.opacity).toBeCloseTo(0.072);
    first.color = '#00ff00'; arrows.sync([first, second]);
    expect(original.material.color.getHexString()).toBe('00ff00'); expect(original.material.opacity).toBe(1);
    arrows.destroy();
  });

  it('hides arrows on coincident or overlapping endpoints and removes disabled arrows', () => {
    const arrows = new ThreeDLinkArrows(Three), parent = new Three.Group(), data = link();
    arrows.create(parent, { ...data, sourceArrow: false }); expect(mesh(parent)).toBeUndefined();
    arrows.create(parent, data);
    const start = { x: 0, y: 0, z: 0 };
    arrows.position(data, start, start); expect(mesh(parent).visible).toBe(false);
    arrows.position(data, start, { x: 0, y: 0, z: 3 }); expect(mesh(parent).visible).toBe(false);
    arrows.position(data, start, { x: 0, y: 0, z: 100 }); expect(mesh(parent).visible).toBe(true);
    arrows.sync([{ ...data, sourceArrow: false }]); expect(mesh(parent)).toBeUndefined();
    arrows.destroy();
  });

  it('releases materials after filtering and shared geometry when the view closes', () => {
    const arrows = new ThreeDLinkArrows(Three), parent = new Three.Group(), data = link();
    arrows.create(parent, data);
    const materialDispose = spyOn(mesh(parent).material, 'dispose').and.callThrough();
    const geometryDispose = spyOn(mesh(parent).geometry, 'dispose').and.callThrough();
    arrows.sync([]); expect(mesh(parent)).toBeUndefined(); expect(materialDispose).toHaveBeenCalledTimes(1);
    arrows.destroy(); expect(geometryDispose).toHaveBeenCalledTimes(1);
  });
});
