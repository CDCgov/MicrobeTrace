import * as Three from 'three';
import { THREE_D_NODE_SHAPES, ThreeDNode } from './three-d-network.model';
import { ThreeDNodeObjects } from './three-d-node-objects';

describe('3D node shape resources', () => {
  const node = (id = 'A'): ThreeDNode => ({ id, shape: 'sphere', color: '#123456', value: 8, tooltip: '' });

  it('shares geometry between nodes and keeps all six shapes within the same size bound', () => {
    const objects = new ThreeDNodeObjects(Three);
    const meshes = THREE_D_NODE_SHAPES.map(option => objects.create({ ...node(option.value), shape: option.value }));
    meshes.forEach(mesh => expect(mesh.geometry.boundingSphere!.radius).toBeCloseTo(1, 5));
    const extra = objects.create(node('another sphere'));
    expect(extra.geometry).toBe(meshes[0].geometry);
    objects.destroy();
  });

  it('updates shape, color, opacity, and volume-based sizing without moving a mesh', () => {
    const objects = new ThreeDNodeObjects(Three);
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
    const objects = new ThreeDNodeObjects(Three);
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
});
