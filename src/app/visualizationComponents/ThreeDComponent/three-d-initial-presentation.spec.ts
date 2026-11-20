import * as Three from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { ThreeDNetworkRenderer } from './three-d-network-renderer.adapter';
import { readThreeDSettings, ThreeDViewState } from './three-d-network.model';

describe('3D first presentation', () => {
  let renderer: ThreeDNetworkRenderer;
  let graph: any;
  let stopped: () => void;
  let changed: jasmine.Spy;
  let fit: jasmine.Spy;
  let events: string[];

  beforeEach(() => {
    const camera = new Three.PerspectiveCamera(50, 1, 0.1, 10000);
    camera.position.z = 1000;
    const controls = { target: new Three.Vector3(), mouseButtons: {}, addEventListener: () => {}, removeEventListener: () => {}, update: () => {}, reset: () => {} };
    const canvas = document.createElement('canvas');
    const graphics = { domElement: canvas, setPixelRatio: () => {}, forceContextLoss: () => {} };
    const forces = { link: { distance: () => {}, initialize: () => {} }, charge: { initialize: () => {} } };
    events = [];
    changed = jasmine.createSpy('preparation changed').and.callFake(preparing => events.push(preparing ? 'preparing' : 'ready'));
    fit = jasmine.createSpy('fit').and.callFake(() => { events.push('fit'); return graph; });
    graph = new Proxy({
      camera: () => camera, controls: () => controls, renderer: () => graphics, zoomToFit: fit,
      cameraPosition: (position?: any, target?: any) => {
        if (!position) return camera.position;
        camera.position.set(position.x, position.y, position.z);
        if (target) controls.target.set(target.x, target.y, target.z);
        return graph;
      },
      d3Force: (name: string) => forces[name],
      onEngineStop: (callback: () => void) => { stopped = callback; return graph; },
    }, { get: (target, key) => key in target ? target[key] : () => graph });
    renderer = new (ThreeDNetworkRenderer as any)(graph, () => {}, () => {}, () => {}, () => {}, Three,
      { LineSegments2, LineSegmentsGeometry, LineMaterial }, changed);
  });
  afterEach(() => renderer.destroy());
  const data = () => ({ nodes: [{ id: 'A', shape: 'sphere' as const, color: '#123456', value: 1, tooltip: '' }], links: [] });

  it('keeps the first graph preparing until the final camera fit has completed', () => {
    renderer.restore(null);
    renderer.setData(data(), readThreeDSettings({}), '#ffffff');
    expect(events).toEqual(['preparing']);
    expect(fit).not.toHaveBeenCalled();
    stopped();
    expect(events).toEqual(['preparing', 'fit', 'ready']);
    stopped();
    expect(fit).toHaveBeenCalledTimes(1);
  });

  it('does not let an empty advisory update consume the first camera fit', () => {
    renderer.restore(null); stopped();
    expect(events).toEqual([]);
    renderer.setData(data(), readThreeDSettings({}), '#ffffff'); stopped();
    expect(events).toEqual(['preparing', 'fit', 'ready']);
  });

  it('shows an empty network normally and prepares its first subsequent nodes', () => {
    renderer.restore(null);
    renderer.setData({ nodes: [], links: [] }, readThreeDSettings({}), '#ffffff'); stopped();
    expect(changed).not.toHaveBeenCalled();
    renderer.setData(data(), readThreeDSettings({}), '#ffffff');
    expect(events).toEqual(['preparing']); stopped();
    expect(events).toEqual(['preparing', 'fit', 'ready']);
  });

  it('restores the saved camera and positions without fitting or hiding the graph', () => {
    const state: ThreeDViewState = { version: 1, layoutFrozen: false, positions: { A: { x: 2, y: 3, z: 4 } },
      camera: { position: { x: 70, y: 80, z: 900 }, target: { x: 5, y: 6, z: 7 }, up: { x: 0, y: 1, z: 0 } } };
    renderer.restore(state); renderer.setData(data(), readThreeDSettings({}), '#ffffff'); stopped();
    expect(events).toEqual([]);
    expect(renderer.getState().camera.position).toEqual(state.camera.position);
    expect(renderer.getState().positions.A).toEqual(state.positions.A);
    expect(fit).not.toHaveBeenCalled();
  });

  it('allows freezing preparation and keeps explicit recalculation visible afterward', () => {
    renderer.restore(null); renderer.setData(data(), readThreeDSettings({}), '#ffffff');
    renderer.setFrozen(true); stopped();
    expect(renderer.getState().layoutFrozen).toBeTrue();
    expect(events).toEqual(['preparing', 'fit', 'ready']);
    events.length = 0; renderer.recalculate();
    expect(events).toEqual([]); stopped();
    expect(events).toEqual(['fit']);
  });
});
