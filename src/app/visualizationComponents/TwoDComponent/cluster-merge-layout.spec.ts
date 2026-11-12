import { buildClusterMergeBackbone, positionClusterMergeHierarchy } from './cluster-merge-layout';

describe('Closest-pair cluster merge backbone', () => {
  const clusters = [
    { id: 'A', nodeIds: ['a1', 'a2'] }, { id: 'B', nodeIds: ['b1', 'b2'] },
    { id: 'C', nodeIds: ['c'] }, { id: 'Unknown', nodeIds: ['unknown'] },
  ];

  it('uses the closest member pair rather than an average or representative sample', () => {
    const edges = [
      { source: 'a1', target: 'b1', distance: 100 }, { source: 'b2', target: 'a2', distance: 6 },
      { source: 'a1', target: 'c', distance: 40 }, { source: 'b1', target: 'c', distance: 20 },
    ];
    const original = JSON.stringify(edges);
    expect(buildClusterMergeBackbone(clusters, edges)).toEqual([
      { source: 'A', target: 'B', distance: 6, sourceNodeId: 'a2', targetNodeId: 'b2' },
      { source: 'B', target: 'C', distance: 20, sourceNodeId: 'b1', targetNodeId: 'c' },
    ]);
    expect(JSON.stringify(edges)).toBe(original);
  });

  it('retains zero genetic distances but ignores unmeasured relationships and internal links', () => {
    const result = buildClusterMergeBackbone(clusters, [
      { source: 'a1', target: 'b1', distance: 0 }, { source: 'a1', target: 'a2', distance: 1 },
      { source: 'b1', target: 'unknown', distance: null as any },
      { source: 'b1', target: 'c', distance: Number.NaN }, { source: 'b1', target: 'c', distance: -1 },
      { source: 'missing', target: 'c', distance: 2 },
    ]);
    expect(result).toHaveSize(1);
    expect(result[0].distance).toBe(0);
    expect(result.some(edge => edge.source === 'Unknown' || edge.target === 'Unknown')).toBeFalse();
  });

  it('resolves tied merge distances deterministically regardless of input order', () => {
    const edges = [
      { source: 'a1', target: 'b1', distance: 6 }, { source: 'a2', target: 'b2', distance: 6 },
      { source: 'a1', target: 'c', distance: 6 }, { source: 'b1', target: 'c', distance: 6 },
    ];
    expect(buildClusterMergeBackbone(clusters, edges)).toEqual(buildClusterMergeBackbone(clusters, [...edges].reverse()));
  });

  it('packs tied early-merge families together and reserves room for large unrelated clusters', () => {
    const footprints = [
      { id: 'A', radius: 30, x: 0, y: 0 }, { id: 'B', radius: 40, x: 0, y: 0 },
      { id: 'C', radius: 300, x: 0, y: 0 }, { id: 'Unknown', radius: 150, x: 0, y: 0 },
    ];
    const links = buildClusterMergeBackbone(clusters, [
      { source: 'a1', target: 'b1', distance: 6 }, { source: 'b1', target: 'c', distance: 60 },
    ]);
    const positions = positionClusterMergeHierarchy(footprints, links, 20, 50);
    const gap = (a: typeof footprints[number], b: typeof footprints[number]) => {
      const left = positions.get(a.id)!;
      const right = positions.get(b.id)!;
      return Math.hypot(left.x - right.x, left.y - right.y) - a.radius - b.radius;
    };
    footprints.forEach((a, index) => footprints.slice(index + 1).forEach(b => expect(gap(a, b)).toBeGreaterThan(0)));
    expect(gap(footprints[0], footprints[1])).toBeLessThan(gap(footprints[1], footprints[2]));
    expect(positionClusterMergeHierarchy(footprints, [...links].reverse(), 20, 50)).toEqual(positions);
  });

  it('uses both dimensions for a sequence of binary merges', () => {
    const footprints = ['A', 'B', 'C', 'Unknown'].map(id => ({ id, radius: 20, x: 0, y: 0 }));
    const links = [
      { source: 'A', target: 'B', distance: 6, sourceNodeId: 'a', targetNodeId: 'b' },
      { source: 'B', target: 'C', distance: 12, sourceNodeId: 'b', targetNodeId: 'c' },
      { source: 'C', target: 'Unknown', distance: 40, sourceNodeId: 'c', targetNodeId: 'unknown' },
    ];
    const positions = [...positionClusterMergeHierarchy(footprints, links, 20, 50).values()];
    expect(Math.max(...positions.map(p => p.x)) - Math.min(...positions.map(p => p.x))).toBeGreaterThan(40);
    expect(Math.max(...positions.map(p => p.y)) - Math.min(...positions.map(p => p.y))).toBeGreaterThan(40);
  });

  it('keeps a deep merge hierarchy compact without overlapping its cluster footprints', () => {
    const footprints = Array.from({ length: 80 }, (_, i) => ({ id: String(i), radius: 10, x: 0, y: 0 }));
    const links = footprints.slice(1).map((cluster, i) => ({
      source: String(i), target: cluster.id, distance: i + 1, sourceNodeId: String(i), targetNodeId: cluster.id,
    }));
    const positions = [...positionClusterMergeHierarchy(footprints, links, 20, 50).values()];
    const span = Math.max(
      Math.max(...positions.map(p => p.x)) - Math.min(...positions.map(p => p.x)),
      Math.max(...positions.map(p => p.y)) - Math.min(...positions.map(p => p.y)),
    ) + 20;
    expect(span).toBeLessThan(6 * Math.sqrt(footprints.length) * 20);
    positions.forEach((left, index) => positions.slice(index + 1).forEach(right => {
      expect(Math.hypot(left.x - right.x, left.y - right.y)).toBeGreaterThan(20);
    }));
  });

  it('fills many directions around a growing family instead of stacking clusters into spokes', () => {
    const footprints = [{ id: 'hub', radius: 80, x: 0, y: 0 },
      ...Array.from({ length: 64 }, (_, index) => ({ id: `leaf:${index}`, radius: 10, x: 0, y: 0 }))];
    const links = footprints.slice(1).map((cluster, index) => ({
      source: 'hub', target: cluster.id, distance: index + 1, sourceNodeId: 'hub', targetNodeId: cluster.id,
    }));
    const positions = positionClusterMergeHierarchy(footprints, links, 20, 50);
    const hub = positions.get('hub')!;
    const directions = new Set(footprints.slice(1).map(cluster => {
      const point = positions.get(cluster.id)!;
      return Math.round(Math.atan2(point.y - hub.y, point.x - hub.x) * 90 / Math.PI);
    }));
    expect(directions.size).toBeGreaterThan(40);
    expect(positionClusterMergeHierarchy(footprints, [...links].reverse(), 20, 50)).toEqual(positions);
  });
});
