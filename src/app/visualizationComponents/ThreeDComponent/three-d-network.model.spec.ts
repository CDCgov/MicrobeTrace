import {
  buildThreeDGraph, ensureThreeDShapeMapping, normalizeThreeDViewState, readThreeDSettings, threeDNodeId, writeThreeDSettings,
} from './three-d-network.model';

describe('3D network data and saved state', () => {
  const settings = readThreeDSettings({});
  const color = () => '#123456';
  const camera = { position: { x: 10, y: 20, z: 30 }, target: { x: 0, y: 0, z: 0 } };

  it('keeps force-engine mutations out of the shared session, including 2D coordinates', () => {
    const nodes = [{ _id: 'A', x: 100, y: 200 }, { _id: 'B', x: 300, y: 400 }];
    const links = [{ source: 'A', target: 'B' }];
    const data = buildThreeDGraph(nodes, links, settings, color, color);
    data.nodes[0].x = -50;
    data.links[0].source = data.nodes[0];
    expect(nodes[0].x).toBe(100);
    expect(nodes[0].y).toBe(200);
    expect(links[0].source).toBe('A');
    expect(data.nodes[1].x).toBeUndefined();
  });

  it('drops dangling links, supports object endpoints, and preserves parallel links', () => {
    const data = buildThreeDGraph([{ _id: 'A' }, { _id: 'B' }], [
      { source: { _id: 'A' }, target: 'B' }, { source: 'A', target: { id: 'B' } },
      { source: 'A', target: 'hidden' },
    ], settings, color, color);
    expect(data.links.length).toBe(2);
    expect(data.links[0].source).toBe('A');
    expect(data.links[0].key).not.toBe(data.links[1].key);
  });

  it('carries both origin colors into renderer-owned links without changing canonical records', () => {
    const original = { source: 'A', target: 'B', origin: ['first', 'second'] };
    const data = buildThreeDGraph([{ _id: 'A' }, { _id: 'B' }], [original], settings, color,
      () => ({ color: 'rgba(255, 0, 0, 0.3)', overlayColor: 'rgba(0, 0, 255, 0.7)' }));
    expect(data.links[0].color).toBe('rgba(255, 0, 0, 0.3)');
    expect(data.links[0].overlayColor).toBe('rgba(0, 0, 255, 0.7)');
    data.links[0].source = data.nodes[0];
    expect(original).toEqual({ source: 'A', target: 'B', origin: ['first', 'second'] });
  });

  it('preserves renderer node identity, coordinates, and velocity through filtering and restyling', () => {
    const initial = buildThreeDGraph([{ _id: 'A' }, { _id: 'B' }], [], settings, color, color);
    Object.assign(initial.nodes[0], { x: 12, y: 13, z: 14, vx: 2 });
    const filtered = buildThreeDGraph([{ _id: 'A' }], [], settings, () => '#ffffff', color,
      new Map(initial.nodes.map(node => [node.id, node])));
    expect(filtered.nodes[0]).toBe(initial.nodes[0]);
    expect(filtered.nodes[0].x).toBe(12);
    expect(filtered.nodes[0].vx).toBe(2);
    expect(filtered.nodes[0].color).toBe('#ffffff');
  });

  it('restores cached 3D positions when previously hidden nodes return', () => {
    const data = buildThreeDGraph([{ _id: 'A', x: 999 }], [], settings, color, color, new Map(),
      new Map([['A', { x: 1, y: 2, z: 3 }]]));
    expect(data.nodes[0].x).toBe(1);
    expect(data.nodes[0].z).toBe(3);
  });

  it('normalizes IDs without discarding zero and skips missing or duplicate IDs', () => {
    expect(threeDNodeId({ _id: 0 })).toBe('0');
    const data = buildThreeDGraph([{ _id: 0 }, { id: '0' }, {}], [], settings, color, color);
    expect(data.nodes.map(node => node.id)).toEqual(['0']);
  });

  it('uses safe node volumes for missing, zero, negative, or invalid sizes', () => {
    const data = buildThreeDGraph([0, -2, 'bad', null, 8].map((size, id) => ({ _id: id, size })), [],
      { ...settings, nodeSizeField: 'size' }, color, color);
    expect(data.nodes.map(node => node.value)).toEqual([1, 1, 1, 1, 8]);
  });

  it('keeps tooltip text as data, including markup and missing fields', () => {
    const data = buildThreeDGraph([{ _id: 'A', label: '<img src=x onerror=alert(1)>' }, { _id: 'B' }], [],
      { ...settings, nodeTooltipField: 'label', nodeTooltipFields: ['label'] }, color, color);
    expect(data.nodes[0].tooltip).toBe('<img src=x onerror=alert(1)>');
    expect(data.nodes[1].tooltip).toBe('');
  });

  it('round-trips Classic widget names and clamps invalid controls', () => {
    const widgets = { '3DNet-node-radius': 100, '3DNet-link-transparency': -1, '3DNet-link-width': 'bad' };
    const parsed = readThreeDSettings(widgets);
    expect(parsed.nodeSize).toBe(20);
    expect(parsed.linkTransparency).toBe(0);
    expect(parsed.linkWidth).toBe(1.6);
    const output = {};
    writeThreeDSettings(output, parsed);
    expect(readThreeDSettings(output)).toEqual(parsed);
  });

  it('reads older single-field tooltips and safely formats multiple fields and object endpoints', () => {
    const parsed = readThreeDSettings({ '3DNet-node-tooltip-variable': 'label', '3DNet-link-tooltip-variable': 'distance' });
    expect(parsed.nodeTooltipFields).toEqual(['label']);
    expect(parsed.linkTooltipFields).toEqual(['distance']);
    const data = buildThreeDGraph([{ _id: 'A', note: '<b>raw</b>' }, { _id: 'B' }],
      [{ source: { _id: 'A' }, target: { id: 'B' } }],
      { ...parsed, nodeTooltipFields: ['_id', 'note'], linkTooltipFields: ['source_id', 'target_id'] }, color, color);
    expect(data.nodes[0].tooltip).toBe('ID: A\nnote: <b>raw</b>');
    expect(data.links[0].tooltip).toBe('source id: A\ntarget id: B');
  });

  it('bounds mapped node radii and link widths, including invalid and reciprocal values', () => {
    const nodes = [{ _id: 'A', size: 1 }, { _id: 'B', size: 1000 }, { _id: 'C', size: null }];
    const links = [1, 100, 0].map(distance => ({ source: 'A', target: 'B', distance }));
    const data = buildThreeDGraph(nodes, links, { ...settings, nodeSizeField: 'size', nodeSizeMin: 2, nodeSizeMax: 8,
      linkWidthField: 'distance', linkWidthMin: 0.5, linkWidthMax: 4, linkWidthReciprocal: true }, color, color);
    expect(data.nodes.map(node => node.radius)).toEqual([2, 8, 2]);
    expect(data.links.map(link => link.width)).toEqual([4, 0.5, 0.5]);
    expect(nodes[0].size).toBe(1);
  });

  it('uses shared metric formatting for link labels and tooltips without changing distances', () => {
    const nodes = [{ _id: 'A' }, { _id: 'B' }];
    const links = [{ source: 'A', target: 'B', distance: 0.015, hasDistance: true, distanceOrigin: 'sequence', origin: ['sequence'] }];
    const percentage = readThreeDSettings({ 'default-distance-metric': 'tn93', 'tn93-distance-display-format': 'percentage',
      '3DNet-link-label-variable': 'distance', '3DNet-link-tooltip-fields': ['source_id', 'distance'] });
    const graph = buildThreeDGraph(nodes, links, percentage, color, color);
    expect(graph.links[0].label).toBe('1.500%');
    expect(graph.links[0].tooltip).toBe('source id: A\ndistance: 1.5%');
    expect(links[0].distance).toBe(0.015);
    expect(buildThreeDGraph(nodes, [{ ...links[0], distance: 5 }], { ...percentage, distanceMetric: 'snps' }, color, color).links[0].label).toBe('5');
    expect(buildThreeDGraph(nodes, links, { ...percentage, distanceDisplayFormat: 'decimal' }, color, color).links[0].label).toBe('0.015');
  });

  it('omits unavailable distance labels and reports unavailable tooltips', () => {
    const parsed = { ...settings, linkLabelField: 'distance', linkTooltipFields: ['distance'] };
    const links = [
      { source: 'A', target: 'B', distance: 0.015, hasDistance: false },
      { source: 'A', target: 'B', distance: 0.015, hasDistance: true, distanceOrigin: 'sequence', origin: ['contact'] },
    ];
    const graph = buildThreeDGraph([{ _id: 'A' }, { _id: 'B' }], links, parsed, color, color);
    expect(graph.links.map(link => link.label)).toEqual(['', '']);
    expect(graph.links.map(link => link.tooltip)).toEqual(['N/A', 'N/A']);
  });

  it('keeps non-distance labels free of percentage conversion', () => {
    const parsed = { ...settings, distanceMetric: 'tn93', distanceDisplayFormat: 'percentage', linkLabelField: 'weight' };
    const graph = buildThreeDGraph([{ _id: 'A' }, { _id: 'B' }], [{ source: 'A', target: 'B', weight: 0.015 }], parsed, color, color);
    expect(graph.links[0].label).toBe('0.015');
  });

  it('renders direction flags without adding links or mutating canonical records', () => {
    const links = [
      { source: 'A', target: 'B', directed: false, bidirectional: true },
      { source: 'A', target: 'B', directed: true, bidirectional: false },
      { source: 'A', target: 'B', directed: 'yes', bidirectional: 'true' },
    ];
    const original = JSON.parse(JSON.stringify(links));
    const nodes = [{ _id: 'A' }, { _id: 'B' }];
    const arrows = { ...settings, linkArrows: true, linkBidirectional: true };
    expect(buildThreeDGraph(nodes, links, arrows, color, color).links.map(link => [link.targetArrow, link.sourceArrow]))
      .toEqual([[false, false], [true, false], [true, true]]);
    expect(buildThreeDGraph(nodes, links, { ...arrows, linkBidirectional: false }, color, color).links.map(link => link.sourceArrow)).toEqual([false, false, false]);
    expect(buildThreeDGraph(nodes, links, { ...arrows, linkArrows: false }, color, color).links.map(link => [link.targetArrow, link.sourceArrow]))
      .toEqual([[false, false], [false, false], [false, false]]);
    expect(links).toEqual(original);
  });

  it('keeps 3D arrow switches independent and never overwrites shared distance preferences', () => {
    const widgets: Record<string, any> = { 'link-directed': true, 'link-bidirectional': true,
      'default-distance-metric': 'tn93', 'tn93-distance-display-format': 'percentage' };
    const parsed = readThreeDSettings(widgets);
    expect(parsed.linkArrows).toBe(false);
    expect(parsed.linkBidirectional).toBe(false);
    writeThreeDSettings(widgets, { ...parsed, linkArrows: true, linkBidirectional: true, distanceMetric: 'snps', distanceDisplayFormat: 'decimal' });
    expect(widgets['link-directed']).toBe(true);
    expect(widgets['link-bidirectional']).toBe(true);
    expect(widgets['default-distance-metric']).toBe('tn93');
    expect(widgets['tn93-distance-display-format']).toBe('percentage');
    expect(readThreeDSettings(widgets)).toEqual({ ...parsed, linkArrows: true, linkBidirectional: true });
  });

  it('preserves old transparency appearance while defaulting new sessions to legend alpha', () => {
    expect(readThreeDSettings({}).linkOpacityOverride).toBe(false);
    const old = readThreeDSettings({ '3DNet-link-transparency': 0.75 });
    expect(old.linkOpacityOverride).toBe(true);
    expect(1 - old.linkTransparency).toBe(0.25);
    const widgets = {};
    writeThreeDSettings(widgets, old);
    expect(readThreeDSettings(widgets)).toEqual(old);
  });

  it('does not use 2D appearance settings as 3D settings or defaults', () => {
    const twoDWidgets = {
      'node-label-variable': 'State', 'node-label-size': 28,
      'node-tooltip-variable': ['Profession'], 'node-radius': 75, 'node-radius-variable': 'degree',
      'link-tooltip-variable': ['distance'], 'link-width': 12, 'link-opacity': 0.25,
    };
    expect(readThreeDSettings(twoDWidgets)).toEqual(readThreeDSettings({}));

    const widgets = { ...twoDWidgets, '3DNet-node-radius': 7, '3DNet-node-tooltip-variable': 'ID' };
    const before = readThreeDSettings(widgets);
    widgets['node-label-variable'] = 'Profession';
    widgets['node-radius'] = 90;
    widgets['link-width'] = 2;
    expect(readThreeDSettings(widgets)).toEqual(before);
  });

  it('changes 3D appearance without overwriting 2D settings or intentionally shared settings', () => {
    const independentWidgets = {
      'node-label-variable': 'State', 'node-label-size': 24, 'node-label-orientation': 'Left',
      'node-tooltip-variable': ['Profession'], 'node-radius': 35, 'node-radius-variable': 'degree',
      'link-tooltip-variable': ['distance'], 'link-width': 3, 'link-opacity': 0.8,
      'node-color': '#abcdef', 'link-color': '#123456', 'background-color': '#ffffff',
      'selected-color': '#ff6600', 'link-threshold': 16,
    };
    const widgets: Record<string, any> = JSON.parse(JSON.stringify(independentWidgets));
    writeThreeDSettings(widgets, {
      ...settings,
      nodeSize: 9, nodeSizeField: 'degree', nodeTooltipField: 'ID',
      linkWidth: 2.7, linkTransparency: 0.65, linkTooltipField: 'source',
    });
    const remainingSettings = Object.fromEntries(Object.entries(widgets).filter(([key]) => !key.startsWith('3DNet-')));
    expect(remainingSettings).toEqual(independentWidgets);
    expect(readThreeDSettings(widgets).nodeSize).toBe(9);
  });

  it('round-trips a saved camera, frozen layout, and position dictionary', () => {
    const state = normalizeThreeDViewState({ version: 1, camera, layoutFrozen: true, positions: { A: { x: 1, y: 2, z: 3 } } });
    expect(normalizeThreeDViewState(JSON.parse(JSON.stringify(state)))).toEqual(state);
    expect(state.layoutFrozen).toBe(true);
    expect(state.positions.A.z).toBe(3);
  });

  it('round-trips independent shape defaults and per-field category assignments', () => {
    const parsed = readThreeDSettings({
      '3DNet-node-shape': 'cone', '3DNet-node-shape-variable': 'group',
      '3DNet-node-shape-mappings': { group: { A: 'cube', B: 'diamond' }, status: { active: 'cylinder' } },
      'node-symbol': 'triangle', 'node-symbol-variable': 'State',
    });
    const widgets = { 'node-symbol': 'triangle', 'node-symbol-variable': 'State' };
    writeThreeDSettings(widgets, parsed);
    expect(readThreeDSettings(JSON.parse(JSON.stringify(widgets)))).toEqual(parsed);
    expect(widgets['node-symbol']).toBe('triangle');
    expect(widgets['node-symbol-variable']).toBe('State');
  });

  it('preserves category shapes through filtering, input reordering, and added categories', () => {
    const shaped = { ...readThreeDSettings({}), nodeShapeField: 'group' };
    const nodes = [{ _id: 'A', group: 'z' }, { _id: 'B', group: 'a' }];
    ensureThreeDShapeMapping(nodes, shaped);
    const first = buildThreeDGraph(nodes, [], shaped, color, color);
    const filtered = buildThreeDGraph([nodes[0]], [], shaped, color, color);
    expect(filtered.nodes[0].shape).toBe(first.nodes[0].shape);
    ensureThreeDShapeMapping([...nodes].reverse(), shaped);
    const original = { ...shaped.nodeShapeMappings.group };
    ensureThreeDShapeMapping([...nodes, { _id: 'C', group: '0' }], shaped);
    expect(shaped.nodeShapeMappings.group.z).toBe(original.z);
    expect(shaped.nodeShapeMappings.group.a).toBe(original.a);
    shaped.nodeShapeMappings.group.z = 'pyramid';
    expect(buildThreeDGraph(nodes, [], shaped, color, color).nodes[0].shape).toBe('pyramid');
  });

  it('applies uniform shapes and uses category mappings without replacing physics nodes', () => {
    const shaped = { ...readThreeDSettings({}), nodeShape: 'cube' as const };
    const nodes = [{ _id: 'A', group: 'one' }, { _id: 'B', group: 'two' }];
    const first = buildThreeDGraph(nodes, [], shaped, color, color);
    expect(first.nodes.map(node => node.shape)).toEqual(['cube', 'cube']);
    first.nodes[0].x = 123;
    const categorized = { ...shaped, nodeShapeField: 'group' };
    ensureThreeDShapeMapping(nodes, categorized);
    const updated = buildThreeDGraph(nodes, [], categorized, color, color, new Map(first.nodes.map(node => [node.id, node])));
    expect(updated.nodes[0]).toBe(first.nodes[0]);
    expect(updated.nodes[0].x).toBe(123);
    expect(updated.nodes[0].shape).not.toBe(updated.nodes[1].shape);
  });

  it('rejects invalid saved shapes and safely maps empty and prototype-like category keys', () => {
    const mappings = JSON.parse('{"__proto__":{"__proto__":"cube","bad":"unknown"}}');
    const shaped = readThreeDSettings({ '3DNet-node-shape': 'bad', '3DNet-node-shape-variable': '__proto__', '3DNet-node-shape-mappings': mappings });
    expect(shaped.nodeShape).toBe('sphere');
    expect(Object.getPrototypeOf(shaped.nodeShapeMappings)).toBeNull();
    expect(Object.getPrototypeOf(shaped.nodeShapeMappings['__proto__'])).toBeNull();
    expect(shaped.nodeShapeMappings['__proto__']['__proto__']).toBe('cube');
    expect(shaped.nodeShapeMappings['__proto__'].bad).toBeUndefined();
    const groups = { ...readThreeDSettings({}), nodeShapeField: 'group' };
    ensureThreeDShapeMapping([{ group: 0 }, { group: false }, { group: null }, { group: '  ' }], groups);
    expect(Object.keys(groups.nodeShapeMappings.group).sort()).toEqual(['0', 'false', 'null']);
  });

  it('loads an older camera without roll using the upright orientation', () => {
    const state = normalizeThreeDViewState({ version: 1, camera });
    expect(state.camera).toEqual({ ...camera, up: { x: 0, y: 1, z: 0 } });
  });

  it('preserves trackball roll through a session round trip', () => {
    const up = { x: 0.6, y: 0.8, z: 0 };
    const state = normalizeThreeDViewState({ version: 1, camera: { ...camera, up } });
    expect(state.camera.up).toEqual(up);
    expect(normalizeThreeDViewState(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });

  it('falls back to an upright camera for invalid up directions', () => {
    [null, { x: 0, y: 0, z: 0 }, { x: Infinity, y: 1, z: 0 }].forEach(up => {
      const state = normalizeThreeDViewState({ version: 1, camera: { ...camera, up } });
      expect(state.camera.up).toEqual({ x: 0, y: 1, z: 0 });
    });
  });

  it('rejects corrupt or future camera states, and coincident camera/target coordinates', () => {
    expect(normalizeThreeDViewState(null)).toBeNull();
    expect(normalizeThreeDViewState({ version: 2, camera })).toBeNull();
    expect(normalizeThreeDViewState({ version: 1, camera: { ...camera, position: { x: Infinity, y: 0, z: 1 } } })).toBeNull();
    expect(normalizeThreeDViewState({ version: 1, camera: { position: camera.target, target: camera.target } })).toBeNull();
  });

  it('discards invalid positions and handles node IDs such as __proto__ without prototype mutation', () => {
    const positions = JSON.parse('{"__proto__":{"x":1,"y":2,"z":3},"bad":{"x":null,"y":2,"z":3}}');
    const state = normalizeThreeDViewState({ version: 1, camera, positions });
    expect(Object.keys(state.positions)).toEqual(['__proto__']);
    expect(Object.getPrototypeOf(state.positions)).toBeNull();
    expect(state.positions['__proto__'].x).toBe(1);
  });
});
