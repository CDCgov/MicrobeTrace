import * as Three from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { THREE_D_NODE_SHAPES, ThreeDNode, readThreeDSettings } from './three-d-network.model';
import { ThreeDNodeObjects } from './three-d-node-objects';

describe('3D node shape resources', () => {
  const frameClasses = { LineSegments2, LineSegmentsGeometry, LineMaterial };
  const node = (id = 'A'): ThreeDNode => ({ id, shape: 'sphere', color: '#123456', value: 8, tooltip: '' });

  it('shares geometry and matches average projected area across the six convex families', () => {
    const objects = new ThreeDNodeObjects(Three, frameClasses);
    const meshes = THREE_D_NODE_SHAPES.map(option => objects.create({ ...node(option.value), shape: option.value }));
    const areas = meshes.slice(0, 6).map(mesh => {
      const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry, p = geometry.getAttribute('position');
      let area = 0;
      for (let i = 0; i < p.count; i += 3) {
        const a = new Three.Vector3().fromBufferAttribute(p, i), b = new Three.Vector3().fromBufferAttribute(p, i + 1), c = new Three.Vector3().fromBufferAttribute(p, i + 2);
        area += b.sub(a).cross(c.sub(a)).length() / 2;
      }
      if (geometry !== mesh.geometry) geometry.dispose();
      return area;
    });
    areas.forEach(area => expect(area).toBeCloseTo(areas[0], 4));
    meshes.forEach(mesh => expect(mesh.geometry.boundingSphere!.radius).toBeGreaterThanOrEqual(0.99999));
    const extra = objects.create(node('another sphere'));
    expect(extra.geometry).toBe(meshes[0].geometry);
    objects.destroy();
  });

  it('updates shape, color, opacity, and volume-based sizing without moving a mesh', () => {
    const objects = new ThreeDNodeObjects(Three, frameClasses);
    const data = node();
    objects.sync([data], 5);
    const mesh = objects.create(data);
    mesh.position.set(10, 20, 30);
    expect(mesh.scale.x).toBe(10);
    const sphereGeometry = mesh.geometry;
    data.shape = 'cube'; data.color = 'rgba(255, 0, 0, 0.5)'; data.value = 27;
    objects.sync([data], 2);
    expect(mesh.geometry).not.toBe(sphereGeometry);
    expect(mesh.geometry.getAttribute('color')).toBeDefined();
    expect(mesh.scale.x).toBe(6);
    expect(mesh.position.toArray()).toEqual([10, 20, 30]);
    const material = mesh.material as Three.MeshLambertMaterial;
    expect(material.color.getHexString()).toBe('ff0000');
    expect(material.opacity).toBe(0.5);
    objects.destroy();
  });

  it('disposes unused materials and releases cached resources on close', () => {
    const objects = new ThreeDNodeObjects(Three, frameClasses);
    const data = node();
    objects.sync([data], 4);
    const mesh = objects.create(data);
    const material = mesh.material as Three.MeshLambertMaterial;
    const materialDispose = spyOn(material, 'dispose').and.callThrough();
    const geometryDispose = spyOn(mesh.geometry, 'dispose').and.callThrough();
    data.color = '#ff6600';
    objects.sync([data], 4);
    expect(materialDispose).toHaveBeenCalledTimes(1);
    objects.destroy();
    expect(geometryDispose).toHaveBeenCalled();
  });

  it('updates billboard labels, bounded radii, and transparent frame edges without moving the node', () => {
    const objects = new ThreeDNodeObjects(Three, frameClasses);
    const data = { ...node(), radius: 3, label: 'Example' };
    const settings = { ...readThreeDSettings({}), nodeBorderWidth: 2, nodeLabelOrientation: 'Top' };
    objects.sync([data], 4, settings);
    const mesh = objects.create(data);
    mesh.position.set(10, 20, 30);
    const label = mesh.getObjectByName('node-label') as Three.Sprite;
    expect(label).toBeDefined();
    expect(mesh.scale.x).toBe(3);
    data.radius = 7; data.color = 'rgba(10,20,30,0.25)';
    objects.sync([data], 4, settings);
    expect(mesh.scale.x).toBe(7);
    expect(mesh.getObjectByName('node-label')).toBe(label);
    const frame = mesh.getObjectByName('node-frame') as LineSegments2;
    expect(frame.material.opacity).toBe(0.25);
    expect(frame.material.linewidth).toBe(2);
    const outline = mesh.getObjectByName('node-outline') as Three.Mesh<Three.BufferGeometry, Three.ShaderMaterial>;
    expect(outline.material.uniforms.opacity.value).toBe(0.25);
    expect(outline.material.depthTest).toBe(true);
    expect(outline.material.depthWrite).toBe(false);
    expect(mesh.position.toArray()).toEqual([10, 20, 30]);
    const texture = (label.material as Three.SpriteMaterial).map;
    const dispose = spyOn(texture, 'dispose').and.callThrough();
    data.label = '';
    objects.sync([data], 4, settings);
    expect(mesh.getObjectByName('node-label')).toBeUndefined();
    expect(dispose).toHaveBeenCalledTimes(1);
    objects.destroy();
  });

  it('keeps label text the same screen size when the camera zooms without replacing its texture', () => {
    const objects = new ThreeDNodeObjects(Three, frameClasses);
    const camera = new Three.PerspectiveCamera(50, 1, 0.1, 10000);
    camera.position.z = 1000; camera.updateMatrixWorld();
    const data = { ...node(), radius: 4, label: 'Readable label', x: 0, y: 0, z: 0 };
    objects.sync([data], 4, readThreeDSettings({}), new Set(), { camera, height: 800 });
    const mesh = objects.create(data);
    const label = mesh.getObjectByName('node-label') as Three.Sprite;
    const texture = label.material.map;
    const initialHeight = label.scale.y;
    const screenFontHeight = label.scale.y * 4 * camera.projectionMatrix.elements[5] * 800 / (2 * 1000) * 48 / 64;
    expect(screenFontHeight).toBeCloseTo(16);
    camera.position.z = 250; camera.updateMatrixWorld();
    objects.updateLabels({ camera, height: 800 });
    expect(label.scale.y).toBeCloseTo(initialHeight / 4);
    expect(label.material.map).toBe(texture);
    objects.destroy();
  });

  it('draws the twelve cube edges in screen pixels without a duplicate silhouette pass', () => {
    const objects = new ThreeDNodeObjects(Three, frameClasses);
    const data = { ...node(), shape: 'cube' as const, radius: 4 };
    objects.sync([data], 4, { ...readThreeDSettings({}), nodeBorderWidth: 3 });
    const mesh = objects.create(data);
    const frame = mesh.getObjectByName('node-frame') as LineSegments2;
    const starts = frame.geometry.getAttribute('instanceStart'), ends = frame.geometry.getAttribute('instanceEnd');
    expect(starts.count).toBe(12);
    for (let i = 0; i < starts.count; i++) {
      const start = new Three.Vector3().fromBufferAttribute(starts, i);
      const end = new Three.Vector3().fromBufferAttribute(ends, i);
      const delta = start.sub(end).toArray().filter(value => Math.abs(value) > 0.000001);
      expect(delta.length).toBe(1);
    }
    expect(frame.scale.toArray()).toEqual([1, 1, 1]);
    expect(frame.material.worldUnits).toBe(false);
    expect(frame.material.depthTest).toBe(true);
    expect(mesh.getObjectByName('node-outline')).toBeUndefined();
    expect(frame.material.linewidth).toBe(3);
    objects.resize(900, 600);
    expect(frame.material.resolution.toArray()).toEqual([900, 600]);
    objects.destroy();
  });

  it('keeps frame widths in screen pixels through node sizing, restyling, and neighbor dimming', () => {
    const objects = new ThreeDNodeObjects(Three, frameClasses);
    const data = { ...node(), radius: 3, color: 'rgba(20,30,40,0.5)' };
    const settings = { ...readThreeDSettings({}), nodeBorderWidth: 1 };
    objects.sync([data], 4, settings);
    const mesh = objects.create(data), frame = mesh.getObjectByName('node-frame') as LineSegments2;
    const geometry = frame.geometry;
    expect(frame.material.linewidth).toBe(1);
    data.radius = 9; settings.nodeBorderWidth = 5;
    objects.sync([data], 4, settings, new Set([data.id]));
    expect(mesh.getObjectByName('node-frame')).toBe(frame);
    expect(frame.geometry).toBe(geometry);
    expect(mesh.scale.x).toBe(9);
    expect(frame.scale.x).toBe(1);
    expect(frame.material.linewidth).toBe(5);
    expect(frame.material.worldUnits).toBe(false);
    expect(frame.material.opacity).toBeCloseTo(0.06);
    objects.destroy();
  });

  it('shares frame resources, updates shape edges, removes zero-width frames, and disposes resources', () => {
    const objects = new ThreeDNodeObjects(Three, frameClasses);
    const a = { ...node('A'), shape: 'cone' as any }, b = { ...node('B'), shape: 'cone' as any };
    const settings = { ...readThreeDSettings({}), nodeBorderWidth: 2 };
    objects.sync([a, b], 4, settings);
    const first = objects.create(a), second = objects.create(b);
    const firstFrame = first.getObjectByName('node-frame') as LineSegments2;
    const secondFrame = second.getObjectByName('node-frame') as LineSegments2;
    expect(firstFrame.geometry).toBe(secondFrame.geometry);
    expect(firstFrame.material).toBe(secondFrame.material);
    const geometryDispose = spyOn(firstFrame.geometry, 'dispose').and.callThrough();
    const materialDispose = spyOn(firstFrame.material, 'dispose').and.callThrough();
    const firstOutline = first.getObjectByName('node-outline') as Three.Mesh;
    const secondOutline = second.getObjectByName('node-outline') as Three.Mesh;
    expect(firstOutline.geometry).toBe(secondOutline.geometry);
    expect(firstOutline.material).toBe(secondOutline.material);
    const outlineGeometryDispose = spyOn(firstOutline.geometry, 'dispose').and.callThrough();
    const outlineMaterialDispose = spyOn(firstOutline.material as Three.ShaderMaterial, 'dispose').and.callThrough();
    a.shape = 'diamond'; objects.sync([a, b], 4, settings);
    expect(firstFrame.geometry).not.toBe(secondFrame.geometry);
    objects.sync([a, b], 4, { ...settings, nodeBorderWidth: 0 });
    expect(first.getObjectByName('node-frame')).toBeUndefined();
    expect(second.getObjectByName('node-frame')).toBeUndefined();
    expect(first.getObjectByName('node-outline')).toBeUndefined();
    expect(outlineMaterialDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
    expect(geometryDispose).not.toHaveBeenCalled();
    objects.destroy();
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(outlineGeometryDispose).toHaveBeenCalledTimes(1);
  });

  it('renders new families with distinct meshes, no grid on smooth shapes, and bounded arrow clearance', () => {
    const objects = new ThreeDNodeObjects(Three, frameClasses);
    const nodes: ThreeDNode[] = THREE_D_NODE_SHAPES.map(option => ({ ...node(option.value), shape: option.value, radius: 5 }));
    objects.sync(nodes, 4, { ...readThreeDSettings({}), nodeBorderWidth: 1 });
    const meshes = nodes.map(data => objects.create(data));
    expect(meshes[6].geometry.type).toBe('TorusGeometry');
    expect(meshes[7].geometry.type).toBe('CapsuleGeometry');
    expect(meshes[8].geometry.type).toBe('ExtrudeGeometry');
    for (const index of [0, 6, 7]) expect(meshes[index].getObjectByName('node-frame').visible).toBe(false);
    for (const index of [1, 4, 5, 8]) expect((meshes[index].material as Three.MeshLambertMaterial).vertexColors).toBe(true);
    nodes.forEach((data, index) => {
      expect(data.radius).toBe(5);
      expect(data.renderRadius).toBeCloseTo(5 * meshes[index].geometry.boundingSphere!.radius);
    });
    objects.destroy();
  });

  it('batches opaque surfaces and edges while preserving per-node picking, colors, and positions', () => {
    const scene = new Three.Scene(), camera = new Three.PerspectiveCamera(50, 1, 0.1, 10000);
    camera.position.z = 100; camera.updateMatrixWorld();
    const objects = new ThreeDNodeObjects(Three, frameClasses);
    objects.enableBatching(scene);
    const nodes = [{ ...node('A'), radius: 2, x: 0, y: 0, z: 0 }, { ...node('B'), radius: 3, x: 10, y: 0, z: 0 },
      { ...node('C'), shape: 'cube' as const, radius: 2, x: 20, y: 0, z: 0 }];
    objects.sync(nodes, 4, { ...readThreeDSettings({}), nodeBorderWidth: 1 });
    const meshes = nodes.map(n => { const mesh = objects.create(n); mesh.position.set(n.x, n.y, n.z); scene.add(mesh); return mesh; });
    objects.prepareFrame({ camera, height: 800 });
    const batchRoot = scene.getObjectByName('3d-node-batches');
    const surfaces = batchRoot.children.filter(o => o.name === 'node-surfaces') as Three.InstancedMesh[];
    expect(surfaces.length).toBe(2);
    expect(surfaces.map(o => o.count).sort()).toEqual([1, 2]);
    const sphereBatch = surfaces.find(o => o.count === 2)!;
    const matrix = new Three.Matrix4(); sphereBatch.getMatrixAt(1, matrix);
    expect(matrix.elements[12]).toBe(10); expect(matrix.elements[0]).toBe(3);
    const color = new Three.Color(); sphereBatch.getColorAt(0, color);
    expect(color.getHexString()).toBe('123456');
    expect((meshes[0].material as Three.Material).visible).toBe(false);
    const ray = new Three.Raycaster(); ray.setFromCamera(new Three.Vector2(0, 0), camera);
    expect(ray.intersectObject(meshes[0], false).length).toBeGreaterThan(0);
    const frame = batchRoot.getObjectByName('node-frame') as LineSegments2;
    expect(frame.geometry.getAttribute('instanceStart').count).toBe(12);
    const first = frame.geometry.getAttribute('instanceStart');
    expect(first.getX(0)).toBeGreaterThan(15);
    objects.destroy();
    expect(scene.getObjectByName('3d-node-batches')).toBeUndefined();
  });

  it('uses individual transparent nodes for category opacity and neighbor dimming', () => {
    const scene = new Three.Scene(), camera = new Three.PerspectiveCamera(); camera.position.z = 100; camera.updateMatrixWorld();
    const objects = new ThreeDNodeObjects(Three, frameClasses); objects.enableBatching(scene);
    const a = { ...node('A'), radius: 2 }, b = { ...node('B'), radius: 2, color: 'rgba(20,30,40,0.5)' };
    const settings = { ...readThreeDSettings({}), nodeBorderWidth: 1 };
    objects.sync([a, b], 4, settings);
    const first = objects.create(a), second = objects.create(b); scene.add(first, second);
    objects.prepareFrame({ camera, height: 800 });
    expect((first.material as Three.Material).visible).toBe(false);
    expect((second.material as Three.Material).opacity).toBe(0.5);
    expect(second.getObjectByName('node-outline')).toBeDefined();
    objects.sync([a, b], 4, settings, new Set(['A']));
    objects.prepareFrame({ camera, height: 800 });
    expect((first.material as Three.Material).opacity).toBeCloseTo(0.12);
    expect(scene.getObjectByName('3d-node-batches').children.length).toBe(0);
    objects.destroy();
  });

  it('adapts curved detail to zoom and fixes adaptive exports to Balanced without changing node values', () => {
    const objects = new ThreeDNodeObjects(Three, frameClasses), camera = new Three.PerspectiveCamera(50, 1, 0.1, 10000);
    const data = { ...node(), radius: 4, x: 0, y: 0, z: 0 };
    objects.sync([data], 4, { ...readThreeDSettings({}), nodeDetail: 'auto' });
    const mesh = objects.create(data);
    camera.position.z = 1000; camera.updateMatrixWorld(); objects.prepareFrame({ camera, height: 800 });
    expect(mesh.geometry.getIndex().count / 3).toBe(168);
    const coarse = mesh.geometry;
    camera.position.z = 10; camera.updateMatrixWorld(); objects.prepareFrame({ camera, height: 800 });
    expect(mesh.geometry.getIndex().count / 3).toBeGreaterThan(440);
    objects.prepareFrame({ camera, height: 800 }, true);
    expect(mesh.geometry.getIndex().count / 3).toBe(440);
    camera.position.z = 1000; camera.updateMatrixWorld(); objects.prepareFrame({ camera, height: 800 });
    expect(mesh.geometry).toBe(coarse); expect(data.radius).toBe(4);
    objects.destroy();
  });

  it('retains the earlier shape proportions and outlines when that saved style is selected', () => {
    const objects = new ThreeDNodeObjects(Three, frameClasses), data = { ...node(), shape: 'cube' as const };
    objects.sync([data], 4, { ...readThreeDSettings({}), shapeVersion: 1, nodeBorderWidth: 1 });
    const mesh = objects.create(data);
    expect(mesh.getObjectByName('node-outline')).toBeDefined();
    objects.sync([data], 4, { ...readThreeDSettings({}), shapeVersion: 2, nodeBorderWidth: 1 });
    expect(mesh.getObjectByName('node-outline')).toBeUndefined();
    objects.destroy();
  });

  it('keeps coarse cylinder detail free of side-generator lines', () => {
    const objects = new ThreeDNodeObjects(Three, frameClasses), camera = new Three.PerspectiveCamera(50, 1, 0.1, 10000);
    const data = { ...node(), shape: 'cylinder' as const, radius: 4, x: 0, y: 0, z: 0 };
    objects.sync([data], 4, { ...readThreeDSettings({}), nodeDetail: 'auto', nodeBorderWidth: 1 });
    const mesh = objects.create(data); camera.position.z = 1000; camera.updateMatrixWorld();
    objects.prepareFrame({ camera, height: 800 });
    const edges = (mesh.getObjectByName('node-frame') as LineSegments2).geometry;
    const starts = edges.getAttribute('instanceStart'), ends = edges.getAttribute('instanceEnd');
    expect(starts.count).toBe(24);
    for (let i = 0; i < starts.count; i++) expect(starts.getY(i)).toBeCloseTo(ends.getY(i));
    objects.destroy();
  });
});
