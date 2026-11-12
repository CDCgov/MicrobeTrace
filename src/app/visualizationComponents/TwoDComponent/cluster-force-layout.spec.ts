import { layoutClusterForces } from './cluster-force-layout';

const options = {
  linkLength: 50,
  nodeRadius: () => 12,
  preserveCenters: false,
  ticks: 180,
  runTicks: async (simulation: { tick: (ticks: number) => unknown }, ticks: number) => { simulation.tick(ticks); },
};

const makeGraph = (count: number) => {
  const groups = Array.from({ length: count }, (_, group) => Array.from({ length: 2 + group % 6 }, (_, index) => ({
    id: `${group}-${index}`, x: 0, y: 0,
  })));
  const links = groups.flatMap(members => members.slice(1).map((node, index) => ({
    source: members[index].id, target: node.id,
  })));
  return { nodes: groups.flat(), links, groups };
};

const bounds = (nodes: Array<{ x: number; y: number }>) => {
  const x = nodes.reduce((sum, node) => sum + node.x, 0) / nodes.length;
  const y = nodes.reduce((sum, node) => sum + node.y, 0) / nodes.length;
  return { x, y, radius: Math.max(...nodes.map(node => Math.hypot(node.x - x, node.y - y))) + 12 };
};

describe('Cluster-first force layout', () => {
  it('separates 325 unequal components without changing their nodes or links', async () => {
    const graph = makeGraph(325);
    const originalLinks = JSON.parse(JSON.stringify(graph.links));
    const result = await layoutClusterForces(graph.nodes, graph.links, graph.links, options);

    expect(result).toEqual({ applied: true, clusters: 325, mergeLinks: 0 });
    expect(graph.nodes.length).toBe(1460);
    expect(graph.links).toEqual(originalLinks);
    expect(graph.nodes.every(node => Number.isFinite(node.x) && Number.isFinite(node.y))).toBeTrue();
    const circles = graph.groups.map(bounds);
    circles.forEach((left, index) => circles.slice(index + 1).forEach(right => {
      expect(Math.hypot(left.x - right.x, left.y - right.y) - left.radius - right.radius)
        .withContext('clusters have clear space between their member nodes').toBeGreaterThan(0);
    }));
  });

  it('settles nodes around the latest dragged center instead of a previous layout', async () => {
    const graph = makeGraph(3);
    await layoutClusterForces(graph.nodes, graph.links, graph.links, options);
    graph.groups[0].forEach(node => { node.x += 5000; node.y -= 3000; });
    // Stretch the cluster as well: recalculation should compact its members.
    graph.groups[0][0].x -= 100;
    graph.groups[0][1].x += 100;
    const dragged = bounds(graph.groups[0]);

    await layoutClusterForces(graph.nodes, graph.links, graph.links, { ...options, preserveCenters: true });

    const recalculated = bounds(graph.groups[0]);
    expect(recalculated.x).toBeCloseTo(dragged.x, 6);
    expect(recalculated.y).toBeCloseTo(dragged.y, 6);
    expect(recalculated.radius).toBeLessThan(dragged.radius);
  });

  it('uses complete visible links for membership even when layout links omit a bridge', async () => {
    const graph = makeGraph(3);
    const bridge = { source: graph.groups[0][0].id, target: graph.groups[1][0].id };
    const result = await layoutClusterForces(graph.nodes, [...graph.links, bridge], graph.links, options);
    expect(result.clusters).toBe(2);
  });

  it('compacts long chains when previously distant clusters are joined', async () => {
    const nodes = Array.from({ length: 33 }, (_, index) => ({
      id: String(index), x: (index < 14 ? index : index - 14) * 100, y: index < 14 ? 0 : 1500,
    }));
    const links = nodes.filter((_, index) => index > 0 && index !== 14)
      .map(node => ({ source: String(Number(node.id) - 1), target: node.id }));
    await layoutClusterForces(nodes, links, links, { ...options, nodeRadius: () => 19, preserveCenters: true });
    const merged = nodes.slice(0, 14);
    expect(Math.max(...merged.map(node => node.x)) - Math.min(...merged.map(node => node.x))).toBeLessThan(275);
    expect(Math.max(...merged.map(node => node.y)) - Math.min(...merged.map(node => node.y))).toBeLessThan(275);
  });

  it('keeps overlapping singleton components separate during recalculation', async () => {
    const nodes = Array.from({ length: 50 }, (_, index) => ({ id: String(index), x: 0, y: 0 }));
    await layoutClusterForces(nodes, [], [], { ...options, preserveCenters: true });
    nodes.forEach((left, index) => nodes.slice(index + 1).forEach(right => {
      expect(Math.hypot(left.x - right.x, left.y - right.y)).toBeGreaterThan(24);
    }));
  });

  it('places closest genetic merge pairs nearer than distant pairs while keeping footprints clear', async () => {
    const nodes = ['A', 'B', 'C', 'D', 'Unknown'].map((id, index) => ({ id, x: index * 100, y: index % 2 * 250 }));
    const geneticEdges = [
      { source: 'A', target: 'B', distance: 6 },
      { source: 'C', target: 'D', distance: 6 },
      { source: 'B', target: 'C', distance: 60 },
    ];
    const result = await layoutClusterForces(nodes, [], [], { ...options, geneticEdges, nodeRadius: () => 40 });
    const gap = (a: number, b: number) => Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y) - 80;
    expect(result.mergeLinks).toBe(3);
    expect(gap(0, 1)).toBeLessThan(gap(1, 2));
    expect(gap(2, 3)).toBeLessThan(gap(1, 2));
    nodes.forEach((_, i) => nodes.slice(i + 1).forEach((__, offset) => expect(gap(i, i + offset + 1)).toBeGreaterThan(0)));
  });

  it('keeps within-cluster geometry independent of genetic merge attraction', async () => {
    const create = () => ['A', 'B', 'C'].flatMap((group, i) => [
      { id: group + '1', x: i * 400, y: 0 }, { id: group + '2', x: i * 400 + 40, y: 12 },
      { id: group + '3', x: i * 400 + 12, y: 50 },
    ]);
    const links = ['A', 'B', 'C'].flatMap(group => [
      { source: group + '1', target: group + '2' }, { source: group + '2', target: group + '3' },
    ]);
    const ordinary = create();
    const mergeAware = create();
    await layoutClusterForces(ordinary, links, links, options);
    await layoutClusterForces(mergeAware, links, links, { ...options, geneticEdges: [
      { source: 'A1', target: 'B2', distance: 6 }, { source: 'B1', target: 'C3', distance: 30 },
    ] });
    for (let group = 0; group < 3; group++) {
      for (let member = 1; member < 3; member++) {
        const first = group * 3;
        expect(mergeAware[first + member].x - mergeAware[first].x)
          .toBeCloseTo(ordinary[first + member].x - ordinary[first].x, 6);
        expect(mergeAware[first + member].y - mergeAware[first].y)
          .toBeCloseTo(ordinary[first + member].y - ordinary[first].y, 6);
      }
    }
  });

  it('honors a manually dragged cluster center while arranging genetic neighbors', async () => {
    const graph = makeGraph(3);
    await layoutClusterForces(graph.nodes, graph.links, graph.links, options);
    graph.groups[0].forEach(node => { node.x += 5000; node.y -= 3000; });
    const dragged = bounds(graph.groups[0]);
    await layoutClusterForces(graph.nodes, graph.links, graph.links, { ...options, preserveCenters: true,
      anchoredNodeIds: new Set(graph.groups[0].map(node => node.id)),
      geneticEdges: [{ source: '0-0', target: '1-0', distance: 6 }, { source: '1-0', target: '2-0', distance: 20 }],
    });
    const current = bounds(graph.groups[0]);
    expect(current.x).toBeCloseTo(dragged.x, 6);
    expect(current.y).toBeCloseTo(dragged.y, 6);
  });
});
