import {
  computeComponentStructureMetrics,
  IncrementalComponentMetrics,
  scoreComponentStructureMetrics,
} from './component-metrics';

describe('component structure metrics', () => {
  it('returns zero-safe metrics for an empty network', () => {
    const metrics = computeComponentStructureMetrics([], 0);

    expect(metrics.nodeCount).toBe(0);
    expect(metrics.componentCount).toBe(0);
    expect(metrics.clusterCount).toBe(0);
    expect(metrics.giniCoefficient).toBe(0);
    expect(metrics.largestToMedianClusterRatio).toBe(0);
  });

  it('handles an all-singleton network without inflating participation', () => {
    const metrics = computeComponentStructureMetrics([1, 1, 1, 1], 4);
    const score = scoreComponentStructureMetrics(metrics, 2);

    expect(metrics.componentCount).toBe(4);
    expect(metrics.clusterCount).toBe(0);
    expect(metrics.singletonCount).toBe(4);
    expect(metrics.clusteredFraction).toBe(0);
    expect(metrics.singletonFraction).toBe(1);
    expect(metrics.giniCoefficient).toBe(0);
    expect(score.score).toBe(0);
  });

  it('calculates balanced multi-cluster metrics', () => {
    const metrics = computeComponentStructureMetrics([3, 3, 1, 1], 8);

    expect(metrics.clusterCount).toBe(2);
    expect(metrics.singletonCount).toBe(2);
    expect(metrics.clusteredFraction).toBe(0.75);
    expect(metrics.singletonFraction).toBe(0.25);
    expect(metrics.largestClusterFraction).toBe(0.375);
    expect(metrics.secondLargestClusterFraction).toBe(0.375);
    expect(metrics.giniCoefficient).toBeCloseTo(0.25, 10);
    expect(metrics.meanClusterSize).toBe(3);
    expect(metrics.medianClusterSize).toBe(3);
    expect(metrics.largestToMedianClusterRatio).toBe(1);
    expect(metrics.l2ToL1Ratio).toBe(1);
  });

  it('captures dominance and inequality', () => {
    const metrics = computeComponentStructureMetrics([6, 2, 1, 1], 10);

    expect(metrics.largestClusterFraction).toBe(0.6);
    expect(metrics.secondLargestClusterFraction).toBe(0.2);
    expect(metrics.giniCoefficient).toBeCloseTo(0.4, 10);
    expect(metrics.meanClusterSize).toBe(4);
    expect(metrics.medianClusterSize).toBe(4);
    expect(metrics.largestToMeanClusterRatio).toBe(1.5);
    expect(metrics.largestToMedianClusterRatio).toBe(1.5);
    expect(metrics.l2ToL1Ratio).toBeCloseTo(1 / 3, 10);
  });

  it('keeps incremental merge metrics aligned with one-shot calculation', () => {
    const tracker = new IncrementalComponentMetrics(8);
    tracker.merge(1, 1);
    tracker.merge(1, 1);
    tracker.merge(2, 1);
    tracker.merge(2, 1);

    expect(tracker.snapshot()).toEqual(computeComponentStructureMetrics([3, 3, 1, 1], 8));
  });

  it('produces deterministic bounded scores with explicit weights', () => {
    const metrics = computeComponentStructureMetrics([3, 3, 1, 1], 8);
    const first = scoreComponentStructureMetrics(metrics, 2);
    const second = scoreComponentStructureMetrics(metrics, 2);

    expect(first).toEqual(second);
    expect(first.score).toBeGreaterThan(0);
    expect(first.score).toBeLessThanOrEqual(100);
    expect(first.breakdown.fragmentation).toBe(1);
    expect(first.breakdown.balance).toBe(1);
  });
});
