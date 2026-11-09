import * as Three from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { THREE_D_NODE_SHAPES, ThreeDNode, readThreeDSettings } from './three-d-network.model';
import { ThreeDNodeObjects } from './three-d-node-objects';

describe('3D node shape resources', () => {
  const frameClasses = { LineSegments2, LineSegmentsGeometry, LineMaterial };
  const node = (id = 'A'): ThreeDNode => ({ id, shape: 'sphere', color: '#123456', value: 8, tooltip: '' });

  it('shares geometry between nodes and keeps all six shapes within the same size bound', () => {
    const objects = new ThreeDNodeObjects(Three, frameClasses);
    const meshes = THREE_D_NODE_SHAPES.map(option => objects.create({ ...node(option.value), shape: option.value }));
    meshes.forEach(mesh => expect(mesh.geometry.boundingSphere!.radius).toBeCloseTo(1, 5));
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
    data.shape = 'cube'; data.color = 'rgba(255, 0, 0, 0.5)'; data.value = 27;
    objects.sync([data], 2);
    expect(mesh.geometry.type).toBe('BoxGeometry');
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
    expect(mesh.getObjectByName('node-outline')).toBeUndefined();
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

  it('draws the twelve cube edges without face diagonals or an inflated silhouette', () => {
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
    const a = { ...node('A'), shape: 'cube' as any }, b = { ...node('B'), shape: 'cube' as any };
    const settings = { ...readThreeDSettings({}), nodeBorderWidth: 2 };
    objects.sync([a, b], 4, settings);
    const first = objects.create(a), second = objects.create(b);
    const firstFrame = first.getObjectByName('node-frame') as LineSegments2;
    const secondFrame = second.getObjectByName('node-frame') as LineSegments2;
    expect(firstFrame.geometry).toBe(secondFrame.geometry);
    expect(firstFrame.material).toBe(secondFrame.material);
    const geometryDispose = spyOn(firstFrame.geometry, 'dispose').and.callThrough();
    const materialDispose = spyOn(firstFrame.material, 'dispose').and.callThrough();
    a.shape = 'diamond'; objects.sync([a, b], 4, settings);
    expect(firstFrame.geometry).not.toBe(secondFrame.geometry);
    objects.sync([a, b], 4, { ...settings, nodeBorderWidth: 0 });
    expect(first.getObjectByName('node-frame')).toBeUndefined();
    expect(second.getObjectByName('node-frame')).toBeUndefined();
    expect(materialDispose).toHaveBeenCalledTimes(1);
    expect(geometryDispose).not.toHaveBeenCalled();
    objects.destroy();
    expect(geometryDispose).toHaveBeenCalledTimes(1);
  });
});
