import {
  buildStoredDistanceEdgeCache,
  buildThresholdSweepSummary,
  buildVisibleClusterSummary,
  isThresholdControlledGeneticLink,
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

  it('supports an explicit genetic-link inclusion policy', () => {
    const cache = buildStoredDistanceEdgeCache(
      nodes,
      [
        { source: 'A', target: 'B', distance: 1, hasDistance: true },
        { source: 'B', target: 'C', distance: 2, hasDistance: false },
      ],
      'distance',
      1,
      (link) => link.hasDistance === true,
    );

    expect(cache.sortedEdges.map((edge) => edge.value)).toEqual([1]);
  });

  it('classifies genetic-only, epi-only, and mixed-origin links explicitly', () => {
    expect(isThresholdControlledGeneticLink({
      source: 'A', target: 'B', distance: 1, hasDistance: true, origin: ['genetic'],
    }, 'distance')).toBeTrue();
    expect(isThresholdControlledGeneticLink({
      source: 'A', target: 'B', distance: 1, hasDistance: false, origin: ['contact'],
    }, 'distance')).toBeFalse();
    expect(isThresholdControlledGeneticLink({
      source: 'A', target: 'B', distance: 1, hasDistance: true, origin: ['genetic', 'contact'],
    }, 'distance')).toBeTrue();
  });

  it('calculates and ranks component structure scores during the incremental sweep', () => {
    const sweepNodes = Array.from({ length: 6 }, (_, index) => ({ _id: `N${index}` }));
    const cache = buildStoredDistanceEdgeCache(
      sweepNodes,
      [
        { source: 'N0', target: 'N1', distance: 1 },
        { source: 'N2', target: 'N3', distance: 1 },
        { source: 'N4', target: 'N5', distance: 2 },
        { source: 'N1', target: 'N2', distance: 3 },
        { source: 'N3', target: 'N4', distance: 4 },
      ],
      'distance',
      2,
    );

    const summary = buildThresholdSweepSummary(cache);

    expect(summary.componentMetrics).toHaveSize(4);
    expect(summary.componentMetrics[0].clusterCount).toBe(2);
    expect(summary.componentMetrics[1].clusterCount).toBe(3);
    expect(summary.componentMetrics[1].clusteredFraction).toBe(1);
    expect(summary.componentStructureScores.every((score) => score >= 0 && score <= 100)).toBeTrue();
    expect(summary.recommendedIndex).toBe(1);
    expect(summary.thresholds[summary.recommendedIndex]).toBe(2);
  });
});
