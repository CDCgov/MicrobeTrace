import {
  buildThresholdSensitivityModel,
  buildThresholdStabilityReport,
  compareThresholds,
} from './threshold-sensitivity';

describe('threshold sensitivity', () => {
  const nodes = ['a', 'b', 'c', 'd', 'e'].map(id => ({ _id: id }));
  const links = [
    { id: 'ab', source: 'a', target: 'b', distance: 1, hasDistance: true },
    { id: 'cd', source: 'c', target: 'd', distance: 1, hasDistance: true },
    { id: 'bc', source: 'b', target: 'c', distance: 2, hasDistance: true },
    { id: 'ad', source: 'a', target: 'd', distance: 2, hasDistance: true },
    { id: 'de', source: 'd', target: 'e', distance: 3, hasDistance: true },
  ];

  it('treats equal-distance component joins as one deterministic merge', () => {
    const model = buildThresholdSensitivityModel(nodes, links, 'distance');
    const comparison = compareThresholds(model, 1, 2);

    expect(comparison.transitions.length).toBe(1);
    expect(comparison.transitions[0].kind).toBe('merge');
    expect(comparison.transitions[0].beforeComponentNodeIds.length).toBe(2);
    expect(comparison.transitions[0].afterComponentNodeIds[0]).toEqual(['a', 'b', 'c', 'd']);
    expect(comparison.structuralEdgeIds.sort()).toEqual(['ad', 'bc']);
  });

  it('reports the inverse transition as a split', () => {
    const model = buildThresholdSensitivityModel(nodes, links, 'distance');
    const comparison = compareThresholds(model, 2, 1);

    expect(comparison.transitions.length).toBe(1);
    expect(comparison.transitions[0].kind).toBe('split');
    expect(comparison.transitions[0].afterComponentNodeIds.length).toBe(2);
  });

  it('detects a singleton attachment even when multi-node cluster count is unchanged', () => {
    const model = buildThresholdSensitivityModel(nodes, links, 'distance');
    const comparison = compareThresholds(model, 2, 3);

    expect(comparison.baseline.clusterCount).toBe(1);
    expect(comparison.preview.clusterCount).toBe(1);
    expect(comparison.changedNodeIds.sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('separates within-component edge changes from structural changes', () => {
    const model = buildThresholdSensitivityModel(nodes.slice(0, 4), links.slice(0, 4), 'distance');
    const comparison = compareThresholds(model, 1, 2);

    expect(comparison.structuralEdgeIds.sort()).toEqual(['ad', 'bc']);
    expect(comparison.nonStructuralEdgeIds).toEqual([]);
  });

  it('reports exact cluster stability across a selected range', () => {
    const model = buildThresholdSensitivityModel(nodes, links, 'distance');
    const stable = buildThresholdStabilityReport(model, 2, 2, 2);
    const changing = buildThresholdStabilityReport(model, 2, 1, 3);

    expect(stable.stableClusterCount).toBe(1);
    expect(stable.stableNodeShare).toBe(1);
    expect(stable.series.find(point => point.threshold === 2)?.partitionAgreement).toBe(1);
    expect(changing.changingClusterCount).toBe(1);
    expect(changing.stableNodeShare).toBe(0);
  });
});
