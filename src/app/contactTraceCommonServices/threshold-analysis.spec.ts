import {
  buildStoredDistanceEdgeCache,
  buildVisibleClusterSummary,
} from './threshold-analysis';

describe('threshold analysis endpoint normalization', () => {
  const nodes = [
    { _id: 'A' },
    { _id: 'B' },
    { _id: 'C' },
  ];

  it('builds visible clusters when link endpoints are node objects', () => {
    const summary = buildVisibleClusterSummary(
      nodes,
      [
        { source: nodes[0], target: nodes[1], visible: true, distance: 1 },
        { source: { data: { id: 'B' } }, target: { id: 'C' }, visible: true, distance: 2 },
      ],
      'distance',
    );

    expect(summary.clusters).toHaveSize(1);
    expect(summary.clusters[0].nodes).toBe(3);
    expect(summary.clusters[0].links).toBe(2);
    expect(summary.degrees).toEqual([1, 2, 1]);
  });

  it('stores distance edges when link endpoints are node objects', () => {
    const cache = buildStoredDistanceEdgeCache(
      nodes,
      [
        { source: nodes[0], target: { id: 'B' }, distance: 2 },
        { source: { data: { id: 'B' } }, target: nodes[2], distance: 1 },
      ],
      'distance',
      7,
    );

    expect(cache.sortedEdges.map((edge) => [edge.sourceId, edge.targetId, edge.value])).toEqual([
      ['B', 'C', 1],
      ['A', 'B', 2],
    ]);
  });
});
