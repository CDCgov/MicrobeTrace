import { layoutSparseDisconnectedComponents, SparseComponentLayoutNode } from './sparse-component-layout';

describe('layoutSparseDisconnectedComponents', () => {
  const createIssue1807Graph = () => {
    const nodes: SparseComponentLayoutNode[] = Array.from({ length: 314 }, (_value, index) => {
      const x = (index % 18) * 7;
      const y = Math.floor(index / 18) * 7;
      return {
        id: `node-${String(index + 1).padStart(3, '0')}`,
        x,
        y,
        minX: x - 5,
        minY: y - 5,
        maxX: x + 5,
        maxY: y + 5,
      };
    });
    const links = [
      ['node-001', 'node-002'],
      ['node-003', 'node-004'],
      ['node-005', 'node-006'],
      ['node-007', 'node-008'],
      ['node-009', 'node-010'],
      ['node-010', 'node-011'],
      ['node-011', 'node-009'],
    ].map(([source, target]) => ({ source, target }));
    return { nodes, links };
  };

  it('tiles a singleton-heavy graph without changing the shape inside linked components', () => {
    const { nodes, links } = createIssue1807Graph();
    const originalDelta = {
      x: nodes[1].x - nodes[0].x,
      y: nodes[1].y - nodes[0].y,
    };

    const result = layoutSparseDisconnectedComponents(nodes, links, 48, 1280, 720);

    expect(result.applied).toBeTrue();
    expect(result.components).toBe(308);
    expect(result.connectedComponents).toBe(5);
    expect(result.singletons).toBe(303);
    expect(result.rows).toBeGreaterThan(1);
    expect(result.positions.size).toBe(314);
    expect(result.positions.get('node-002')!.x - result.positions.get('node-001')!.x)
      .toBeCloseTo(originalDelta.x, 8);
    expect(result.positions.get('node-002')!.y - result.positions.get('node-001')!.y)
      .toBeCloseTo(originalDelta.y, 8);

    const linkedNodeIds = new Set(links.flatMap(link => [link.source, link.target]));
    const linkedPositions = Array.from(linkedNodeIds, id => result.positions.get(id)!);
    const singletonPositions = nodes
      .filter(node => !linkedNodeIds.has(node.id))
      .map(node => result.positions.get(node.id)!);
    const closestSingletonToCluster = Math.min(...linkedPositions.flatMap(linked => (
      singletonPositions.map(singleton => Math.hypot(linked.x - singleton.x, linked.y - singleton.y))
    )));
    expect(closestSingletonToCluster).toBeGreaterThan(20);
  });

  it('leaves ordinary multi-cluster networks on the force-directed layout path', () => {
    const nodes: SparseComponentLayoutNode[] = Array.from({ length: 12 }, (_value, index) => ({
      id: `node-${index}`,
      x: index * 10,
      y: 0,
      minX: index * 10 - 4,
      minY: -4,
      maxX: index * 10 + 4,
      maxY: 4,
    }));
    const links = [
      { source: 'node-0', target: 'node-1' },
      { source: 'node-2', target: 'node-3' },
      { source: 'node-4', target: 'node-5' },
    ];

    const result = layoutSparseDisconnectedComponents(nodes, links, 48, 1280, 720);

    expect(result.applied).toBeFalse();
    expect(result.positions.size).toBe(0);
  });
});
