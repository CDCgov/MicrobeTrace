import { forceCenter, forceLink, forceManyBody, forceSimulation } from 'd3-force-3d';
import { buildThreeDGraph, normalizeThreeDViewState, readThreeDSettings } from './three-d-network.model';
import { buildThreeDLayoutFile, initialThreeDPosition, orderThreeDLayout, readThreeDLayoutFile, seedThreeDForce, THREE_D_LAYOUT } from './three-d-layout';

describe('Reproducible 3D layouts and coordinate files', () => {
  const makeData = (ids = ['A', 'B', 'C'], reverseLinks = false) => {
    const links = [{ source: 'A', target: 'B' }, { source: 'B', target: 'C' }];
    return buildThreeDGraph(ids.map(_id => ({ _id })), reverseLinks ? links.reverse() : links, readThreeDSettings({}), () => '#123456', () => '#654321');
  };
  const solve = (data: ReturnType<typeof makeData>) => {
    orderThreeDLayout(data);
    data.nodes.forEach((node, index) => Object.assign(node, initialThreeDPosition(index)));
    const link = forceLink().id(node => node.id).distance(50);
    const charge = forceManyBody();
    seedThreeDForce(link);
    seedThreeDForce(charge);
    const simulation = forceSimulation().stop().numDimensions(3).force('link', link).force('charge', charge).force('center', forceCenter());
    simulation.nodes(data.nodes);
    link.links(data.links);
    simulation.tick(THREE_D_LAYOUT.iterationLimit);
    return Object.fromEntries(data.nodes.map(({ id, x, y, z }) => [id, { x, y, z }]));
  };
  const makeState = () => normalizeThreeDViewState({
    version: 1, layoutFrozen: false,
    camera: { position: { x: 20, y: 30, z: 400 }, target: { x: 1, y: 2, z: 3 }, up: { x: 0, y: 1, z: 0 },
      projection: { fov: 50, near: 0.1, far: 100000, zoom: 1 } },
    positions: { A: { x: 1, y: 2, z: 3 }, B: { x: 4, y: 5, z: 6 }, C: { x: 7, y: 8, z: 9 }, hidden: { x: 10, y: 11, z: 12 } },
  })!;
  const makeFile = () => buildThreeDLayoutFile(makeData(), makeState(), { width: 800, height: 600 }, { version: 'test', commit: 'abc123' }, 50);

  it('settles to identical coordinates despite different input node and link ordering', () => {
    expect(solve(makeData(['C', 'A', 'B'], true))).toEqual(solve(makeData()));
    expect(solve(makeData())).toEqual(solve(makeData()));
  });

  it('resets force jitter on reinitialization instead of depending on prior simulations', () => {
    const force = forceManyBody();
    seedThreeDForce(force);
    const run = () => {
      const nodes = [0, 1].map(index => ({ index, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }));
      force.initialize(nodes, () => 0.9, 3);
      force(0.5);
      return nodes;
    };
    const first = run();
    run();
    expect(run()).toEqual(first);
    expect(first[0].vx).not.toBe(0);
  });

  it('exports detached visible coordinates, full camera settings, and layout provenance', () => {
    const state = makeState();
    const file = buildThreeDLayoutFile(makeData(), state, { width: 800, height: 600 }, { version: 'test', commit: 'abc123' }, 75);
    expect(Object.keys(file.viewState.positions)).toEqual(['A', 'B', 'C']);
    expect(file.viewState.camera).toEqual(state.camera);
    expect(file.viewport).toEqual({ width: 800, height: 600 });
    expect(file.layout).toEqual({ ...THREE_D_LAYOUT, linkLength: 75, frozenAtCapture: false });
    expect(file.viewState.layoutFrozen).toBeTrue();
    file.viewState.positions.A.x = 999;
    file.viewState.camera.position.x = 888;
    expect(state.positions.A.x).toBe(1);
    expect(state.camera.position.x).toBe(20);
    expect(state.layoutFrozen).toBeFalse();
  });

  it('round-trips a JSON snapshot onto the same visible network regardless of record order', () => {
    const file = JSON.parse(JSON.stringify(makeFile()));
    const restored = readThreeDLayoutFile(file, makeData(['C', 'B', 'A'], true));
    expect(restored).toEqual(file.viewState);
    expect(restored.layoutFrozen).toBeTrue();
  });

  it('rejects a different node set or topology, including changed parallel-link counts', () => {
    const file = makeFile();
    const nodes = makeData();
    nodes.nodes[0].id = 'different';
    expect(() => readThreeDLayoutFile(file, nodes)).toThrowError(/visible node IDs and links must match/);
    const links = makeData();
    links.links[0].target = 'C';
    expect(() => readThreeDLayoutFile(file, links)).toThrowError(/visible node IDs and links must match/);
    const parallel = makeData();
    parallel.links.push({ ...parallel.links[0], key: 'parallel' });
    expect(() => readThreeDLayoutFile(file, parallel)).toThrowError(/visible node IDs and links must match/);
  });

  it('rejects malformed coordinate files and unsupported formats', () => {
    expect(() => readThreeDLayoutFile({}, makeData())).toThrowError(/MicrobeTrace 3D layout JSON/);
    const file = makeFile();
    file.viewState.positions.A.z = NaN;
    expect(() => readThreeDLayoutFile(file, makeData())).toThrowError(/visible node IDs and links must match/);
    const missing = makeState();
    delete missing.positions.A;
    expect(() => buildThreeDLayoutFile(makeData(), missing, { width: 1, height: 1 }, { version: '', commit: '' }, 50)).toThrowError(/finish loading/);
  });

  it('validates perspective settings while continuing to accept older session cameras', () => {
    const state = makeState();
    expect(normalizeThreeDViewState(state)).toEqual(state);
    for (const projection of [{ fov: 180 }, { zoom: 0 }, { near: -1 }, { far: 0.05 }]) {
      expect(normalizeThreeDViewState({ ...state, camera: { ...state.camera, projection: { ...state.camera.projection, ...projection } } })).toBeNull();
    }
    delete state.camera.projection;
    expect(normalizeThreeDViewState(state)).toEqual(state);
  });

  it('exports the saved rendering policy and rejects unsupported policies before restoration', () => {
    const settings = { ...readThreeDSettings({}), shapeVersion: 1 as const, nodeDetail: 'auto' as const, lightingMode: 'camera' as const };
    const file = buildThreeDLayoutFile(makeData(), makeState(), { width: 800, height: 600 }, { version: 'test', commit: 'abc' }, 50, settings);
    expect(file.rendering).toEqual({ shapeVersion: 1, nodeDetail: 'auto', lightingMode: 'camera', sizePolicy: 'mean-projected-area-v1', exportDetail: 'balanced' });
    expect(readThreeDLayoutFile(JSON.parse(JSON.stringify(file)), makeData()).positions).toEqual(file.viewState.positions);
    expect(() => readThreeDLayoutFile({ ...file, rendering: { ...file.rendering, shapeVersion: 99 } }, makeData())).toThrowError(/unsupported 3D shape/);
    expect(() => readThreeDLayoutFile({ ...file, rendering: { ...file.rendering, lightingMode: 'unknown' } }, makeData())).toThrowError(/unsupported 3D shape/);
  });
});
