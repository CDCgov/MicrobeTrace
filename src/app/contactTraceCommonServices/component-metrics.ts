export interface ComponentStructureMetrics {
  nodeCount: number;
  componentCount: number;
  clusterCount: number;
  singletonCount: number;
  clusteredNodeCount: number;
  largestClusterSize: number;
  secondLargestClusterSize: number;
  largestClusterFraction: number;
  secondLargestClusterFraction: number;
  clusteredFraction: number;
  singletonFraction: number;
  giniCoefficient: number;
  meanClusterSize: number;
  medianClusterSize: number;
  largestToMeanClusterRatio: number;
  largestToMedianClusterRatio: number;
  l2ToL1Ratio: number;
}

export interface ComponentStructureScoreWeights {
  fragmentation: number;
  dominance: number;
  balance: number;
  participation: number;
  equality: number;
}

export interface ComponentStructureScoreBreakdown {
  fragmentation: number;
  dominance: number;
  balance: number;
  participation: number;
  equality: number;
}

export interface ComponentStructureScoreResult {
  score: number;
  breakdown: ComponentStructureScoreBreakdown;
}

export const DEFAULT_COMPONENT_STRUCTURE_SCORE_WEIGHTS: ComponentStructureScoreWeights = {
  fragmentation: 1,
  dominance: 1,
  balance: 1,
  participation: 1,
  equality: 1,
};

function safeRatio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

class FenwickTree {
  private readonly counts: Float64Array;
  private readonly sums: Float64Array;
  readonly maxValue: number;
  totalCount = 0;
  totalSum = 0;

  constructor(maxValue: number) {
    this.maxValue = Math.max(1, Math.floor(maxValue));
    this.counts = new Float64Array(this.maxValue + 1);
    this.sums = new Float64Array(this.maxValue + 1);
  }

  add(value: number, delta: number): void {
    const normalizedValue = Math.max(1, Math.min(this.maxValue, Math.floor(value)));
    this.totalCount += delta;
    this.totalSum += normalizedValue * delta;

    for (let index = normalizedValue; index <= this.maxValue; index += index & -index) {
      this.counts[index] += delta;
      this.sums[index] += normalizedValue * delta;
    }
  }

  prefixCount(value: number): number {
    let total = 0;
    for (let index = Math.max(0, Math.min(this.maxValue, Math.floor(value))); index > 0; index -= index & -index) {
      total += this.counts[index];
    }
    return total;
  }

  prefixSum(value: number): number {
    let total = 0;
    for (let index = Math.max(0, Math.min(this.maxValue, Math.floor(value))); index > 0; index -= index & -index) {
      total += this.sums[index];
    }
    return total;
  }

  countBetween(minValue: number, maxValue: number): number {
    if (maxValue < minValue) {
      return 0;
    }
    return this.prefixCount(maxValue) - this.prefixCount(minValue - 1);
  }

  sumBetween(minValue: number, maxValue: number): number {
    if (maxValue < minValue) {
      return 0;
    }
    return this.prefixSum(maxValue) - this.prefixSum(minValue - 1);
  }

  valueAtRank(rank: number): number {
    if (rank < 1 || rank > this.totalCount) {
      return 0;
    }

    let index = 0;
    let accumulated = 0;
    let bit = 1;
    while ((bit << 1) <= this.maxValue) {
      bit <<= 1;
    }

    for (; bit > 0; bit >>= 1) {
      const next = index + bit;
      if (next <= this.maxValue && accumulated + this.counts[next] < rank) {
        index = next;
        accumulated += this.counts[next];
      }
    }

    return index + 1;
  }
}

/**
 * Maintains a component-size multiset while union-find merges components.
 * Gini is updated from pairwise size differences in O(log n) per merge.
 */
export class IncrementalComponentMetrics {
  private readonly sizes: FenwickTree;
  private pairwiseDifferenceSum = 0;
  readonly nodeCount: number;

  constructor(nodeCount: number, componentSizes?: number[]) {
    this.nodeCount = Math.max(0, Math.floor(nodeCount));
    this.sizes = new FenwickTree(this.nodeCount);

    const initialSizes = componentSizes ?? Array.from({ length: this.nodeCount }, () => 1);
    initialSizes.forEach((size) => this.addComponent(size));
  }

  merge(componentSizeA: number, componentSizeB: number): void {
    if (componentSizeA <= 0 || componentSizeB <= 0) {
      return;
    }

    this.removeComponent(componentSizeA);
    this.removeComponent(componentSizeB);
    this.addComponent(componentSizeA + componentSizeB);
  }

  snapshot(minimumClusterSize = 2): ComponentStructureMetrics {
    const minimum = Math.max(2, Math.floor(minimumClusterSize));
    const componentCount = this.sizes.totalCount;
    const singletonCount = this.sizes.countBetween(1, 1);
    const clusterCount = this.sizes.countBetween(minimum, this.nodeCount);
    const clusteredNodeCount = this.sizes.sumBetween(minimum, this.nodeCount);
    const largestClusterSize = clusterCount > 0
      ? this.sizes.valueAtRank(componentCount)
      : 0;
    const secondLargestClusterSize = clusterCount > 1
      ? this.sizes.valueAtRank(componentCount - 1)
      : 0;
    const meanClusterSize = safeRatio(clusteredNodeCount, clusterCount);

    let medianClusterSize = 0;
    if (clusterCount > 0) {
      const componentsBelowMinimum = this.sizes.prefixCount(minimum - 1);
      const lowerRank = componentsBelowMinimum + Math.floor((clusterCount + 1) / 2);
      const upperRank = componentsBelowMinimum + Math.ceil((clusterCount + 1) / 2);
      medianClusterSize = (
        this.sizes.valueAtRank(lowerRank) + this.sizes.valueAtRank(upperRank)
      ) / 2;
    }

    return {
      nodeCount: this.nodeCount,
      componentCount,
      clusterCount,
      singletonCount,
      clusteredNodeCount,
      largestClusterSize,
      secondLargestClusterSize,
      largestClusterFraction: safeRatio(largestClusterSize, this.nodeCount),
      secondLargestClusterFraction: safeRatio(secondLargestClusterSize, this.nodeCount),
      clusteredFraction: safeRatio(clusteredNodeCount, this.nodeCount),
      singletonFraction: safeRatio(singletonCount, this.nodeCount),
      giniCoefficient: componentCount > 0 && this.nodeCount > 0
        ? clampUnit(this.pairwiseDifferenceSum / (componentCount * this.nodeCount))
        : 0,
      meanClusterSize,
      medianClusterSize,
      largestToMeanClusterRatio: safeRatio(largestClusterSize, meanClusterSize),
      largestToMedianClusterRatio: safeRatio(largestClusterSize, medianClusterSize),
      l2ToL1Ratio: safeRatio(secondLargestClusterSize, largestClusterSize),
    };
  }

  private absoluteDifferenceSum(value: number): number {
    const countBelow = this.sizes.prefixCount(value - 1);
    const sumBelow = this.sizes.prefixSum(value - 1);
    const countAtOrBelow = this.sizes.prefixCount(value);
    const sumAtOrBelow = this.sizes.prefixSum(value);
    const countAbove = this.sizes.totalCount - countAtOrBelow;
    const sumAbove = this.sizes.totalSum - sumAtOrBelow;

    return value * countBelow - sumBelow + sumAbove - value * countAbove;
  }

  private addComponent(size: number): void {
    const normalizedSize = Math.max(1, Math.min(this.nodeCount || 1, Math.floor(size)));
    this.pairwiseDifferenceSum += this.absoluteDifferenceSum(normalizedSize);
    this.sizes.add(normalizedSize, 1);
  }

  private removeComponent(size: number): void {
    const normalizedSize = Math.max(1, Math.min(this.nodeCount || 1, Math.floor(size)));
    this.pairwiseDifferenceSum -= this.absoluteDifferenceSum(normalizedSize);
    this.sizes.add(normalizedSize, -1);
  }
}

export function computeComponentStructureMetrics(
  componentSizes: number[],
  nodeCount = componentSizes.reduce((sum, size) => sum + Math.max(0, Math.floor(size)), 0),
  minimumClusterSize = 2,
): ComponentStructureMetrics {
  const normalizedSizes = componentSizes
    .map((size) => Math.floor(Number(size)))
    .filter((size) => Number.isFinite(size) && size > 0);
  return new IncrementalComponentMetrics(nodeCount, normalizedSizes).snapshot(minimumClusterSize);
}

/**
 * Produces a 0-100 decision-support score. Cluster count is normalized across
 * the threshold sweep; the remaining inputs are naturally bounded fractions.
 * Dominance and equality are participation-weighted so all-singleton networks
 * do not receive a high score merely because every component has equal size.
 */
export function scoreComponentStructureMetrics(
  metrics: ComponentStructureMetrics,
  maximumClusterCount: number,
  weights: ComponentStructureScoreWeights = DEFAULT_COMPONENT_STRUCTURE_SCORE_WEIGHTS,
): ComponentStructureScoreResult {
  const breakdown: ComponentStructureScoreBreakdown = {
    fragmentation: clampUnit(safeRatio(metrics.clusterCount, maximumClusterCount)),
    dominance: clampUnit(metrics.clusteredFraction * (1 - metrics.largestClusterFraction)),
    balance: metrics.clusterCount >= 2
      ? clampUnit(safeRatio(metrics.medianClusterSize, metrics.largestClusterSize))
      : 0,
    participation: clampUnit(metrics.clusteredFraction),
    equality: metrics.componentCount >= 2
      ? clampUnit(metrics.clusteredFraction * (1 - metrics.giniCoefficient))
      : 0,
  };

  const normalizedWeights: ComponentStructureScoreWeights = {
    fragmentation: Math.max(0, weights.fragmentation),
    dominance: Math.max(0, weights.dominance),
    balance: Math.max(0, weights.balance),
    participation: Math.max(0, weights.participation),
    equality: Math.max(0, weights.equality),
  };
  const weightTotal = Object.values(normalizedWeights).reduce((sum, weight) => sum + weight, 0);
  const weightedTotal = (
    breakdown.fragmentation * normalizedWeights.fragmentation
    + breakdown.dominance * normalizedWeights.dominance
    + breakdown.balance * normalizedWeights.balance
    + breakdown.participation * normalizedWeights.participation
    + breakdown.equality * normalizedWeights.equality
  );

  return {
    score: weightTotal > 0 ? 100 * weightedTotal / weightTotal : 0,
    breakdown,
  };
}
