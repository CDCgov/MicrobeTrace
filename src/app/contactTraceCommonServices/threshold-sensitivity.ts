import type {
  ThresholdAnalysisLinkLike,
  ThresholdAnalysisNodeLike,
} from './threshold-analysis';

export interface ThresholdSensitivityEdge {
  id: string;
  linkIndex: number;
  sourceId: string;
  targetId: string;
  value: number;
  raw: ThresholdAnalysisLinkLike;
}

export interface ThresholdSensitivitySnapshot {
  threshold: number;
  activeEdgeCount: number;
  components: string[][];
  componentByNodeId: ReadonlyMap<string, number>;
  clusterCount: number;
  singletonCount: number;
  largestClusterSize: number;
  clusteredNodeCount: number;
  partitionSignature: string;
}

export interface ThresholdSensitivityTransition {
  kind: 'merge' | 'split';
  beforeComponentNodeIds: string[][];
  afterComponentNodeIds: string[][];
  affectedNodeIds: string[];
}

export interface ThresholdSensitivityModel {
  metric: string;
  nodeIds: string[];
  edges: ThresholdSensitivityEdge[];
  thresholds: number[];
  edgeById: ReadonlyMap<string, ThresholdSensitivityEdge>;
}

export interface ThresholdSensitivityComparison {
  baselineThreshold: number;
  previewThreshold: number;
  baseline: ThresholdSensitivitySnapshot;
  preview: ThresholdSensitivitySnapshot;
  addedEdgeIds: string[];
  removedEdgeIds: string[];
  structuralEdgeIds: string[];
  nonStructuralEdgeIds: string[];
  changedNodeIds: string[];
  transitions: ThresholdSensitivityTransition[];
}

export interface ThresholdPartitionInterval {
  from: number;
  to: number;
  partitionSignature: string;
  clusterCount: number;
}

export interface ThresholdClusterStability {
  baselineNodeIds: string[];
  stableAcrossRange: boolean;
  lowerPersistenceBound: number | null;
  upperPersistenceBound: number | null;
  firstLowerChange: number | null;
  firstHigherChange: number | null;
}

export interface ThresholdStabilityPoint {
  threshold: number;
  activeEdgeCount: number;
  clusterCount: number;
  singletonCount: number;
  largestClusterSize: number;
  partitionAgreement: number;
}

export interface ThresholdStabilityReport {
  rangeMin: number;
  rangeMax: number;
  partitionIntervals: ThresholdPartitionInterval[];
  clusterStability: ThresholdClusterStability[];
  stableClusterCount: number;
  changingClusterCount: number;
  stableNodeShare: number;
  structuralEventThresholdCount: number;
  widestBaselineStabilityInterval: { from: number; to: number };
  series: ThresholdStabilityPoint[];
}

class UnionFind {
  private readonly parent: number[];
  private readonly sizes: number[];

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, index) => index);
    this.sizes = Array.from({ length: size }, () => 1);
  }

  find(index: number): number {
    let root = index;
    while (this.parent[root] !== root) root = this.parent[root];
    while (this.parent[index] !== index) {
      const next = this.parent[index];
      this.parent[index] = root;
      index = next;
    }
    return root;
  }

  sizeOf(index: number): number {
    return this.sizes[this.find(index)];
  }

  union(left: number, right: number): boolean {
    let leftRoot = this.find(left);
    let rightRoot = this.find(right);
    if (leftRoot === rightRoot) return false;
    if (this.sizes[leftRoot] < this.sizes[rightRoot]) {
      [leftRoot, rightRoot] = [rightRoot, leftRoot];
    }
    this.parent[rightRoot] = leftRoot;
    this.sizes[leftRoot] += this.sizes[rightRoot];
    return true;
  }
}

const nodeId = (node: ThresholdAnalysisNodeLike): string => String(node?._id ?? node?.id ?? '');

const endpointId = (endpoint: any): string => String(
  endpoint && typeof endpoint === 'object'
    ? endpoint._id ?? endpoint.id ?? endpoint.data?.id ?? ''
    : endpoint ?? '',
);

const numericMetric = (link: ThresholdAnalysisLinkLike, metric: string): number | null => {
  const value = Number(link?.[metric]);
  return Number.isFinite(value) ? value : null;
};

const canonicalMembers = (members: Iterable<string>): string => [...members].sort().join('\u0001');

const sameMembers = (left: Iterable<string>, right: Iterable<string>): boolean => (
  canonicalMembers(left) === canonicalMembers(right)
);

const uniqueSortedNumbers = (values: number[]): number[] => Array.from(new Set(
  values.filter(Number.isFinite),
)).sort((left, right) => left - right);

export function buildThresholdSensitivityModel(
  nodes: ThresholdAnalysisNodeLike[],
  links: ThresholdAnalysisLinkLike[],
  metric: string,
  includeLink: (link: ThresholdAnalysisLinkLike, index: number) => boolean = () => true,
): ThresholdSensitivityModel {
  const nodeIds = nodes.map(nodeId).filter(Boolean);
  const nodeIdSet = new Set(nodeIds);
  const usedEdgeIds = new Set<string>();
  const edges: ThresholdSensitivityEdge[] = [];

  links.forEach((link, linkIndex) => {
    if (!includeLink(link, linkIndex)) return;
    const value = numericMetric(link, metric);
    const sourceId = endpointId(link.source);
    const targetId = endpointId(link.target);
    if (
      value === null || !sourceId || !targetId || sourceId === targetId ||
      !nodeIdSet.has(sourceId) || !nodeIdSet.has(targetId)
    ) return;

    const baseId = String(link.id ?? link.index ?? `${sourceId}--${targetId}--${value}`);
    let id = baseId;
    let duplicate = 1;
    while (usedEdgeIds.has(id)) id = `${baseId}--sensitivity-${duplicate++}`;
    usedEdgeIds.add(id);
    edges.push({ id, linkIndex, sourceId, targetId, value, raw: link });
  });

  edges.sort((left, right) => (
    left.value - right.value ||
    left.sourceId.localeCompare(right.sourceId) ||
    left.targetId.localeCompare(right.targetId) ||
    left.id.localeCompare(right.id)
  ));

  return {
    metric,
    nodeIds,
    edges,
    thresholds: uniqueSortedNumbers(edges.map(edge => edge.value)),
    edgeById: new Map(edges.map(edge => [edge.id, edge])),
  };
}

export function snapshotThresholdSensitivity(
  model: ThresholdSensitivityModel,
  threshold: number,
): ThresholdSensitivitySnapshot {
  const nodeIndex = new Map(model.nodeIds.map((id, index) => [id, index]));
  const unionFind = new UnionFind(model.nodeIds.length);
  let activeEdgeCount = 0;

  for (const edge of model.edges) {
    if (edge.value > threshold) break;
    unionFind.union(nodeIndex.get(edge.sourceId)!, nodeIndex.get(edge.targetId)!);
    activeEdgeCount++;
  }

  const membersByRoot = new Map<number, string[]>();
  model.nodeIds.forEach((id, index) => {
    const root = unionFind.find(index);
    const members = membersByRoot.get(root) || [];
    members.push(id);
    membersByRoot.set(root, members);
  });

  const components = Array.from(membersByRoot.values())
    .map(members => members.sort())
    .sort((left, right) => left[0].localeCompare(right[0]));
  const componentByNodeId = new Map<string, number>();
  components.forEach((members, componentIndex) => {
    members.forEach(id => componentByNodeId.set(id, componentIndex));
  });
  const clusterComponents = components.filter(members => members.length > 1);

  return {
    threshold,
    activeEdgeCount,
    components,
    componentByNodeId,
    clusterCount: clusterComponents.length,
    singletonCount: components.length - clusterComponents.length,
    largestClusterSize: components.reduce((maximum, members) => Math.max(maximum, members.length), 0),
    clusteredNodeCount: clusterComponents.reduce((total, members) => total + members.length, 0),
    partitionSignature: components.map(canonicalMembers).join('\u0002'),
  };
}

function componentMembersForNode(snapshot: ThresholdSensitivitySnapshot, id: string): string[] {
  const componentIndex = snapshot.componentByNodeId.get(id);
  return componentIndex === undefined ? [] : snapshot.components[componentIndex];
}

function collectTransitions(
  baseline: ThresholdSensitivitySnapshot,
  preview: ThresholdSensitivitySnapshot,
): ThresholdSensitivityTransition[] {
  const transitions: ThresholdSensitivityTransition[] = [];
  if (preview.threshold > baseline.threshold) {
    preview.components.forEach(afterMembers => {
      const beforeIndexes = new Set(afterMembers.map(id => baseline.componentByNodeId.get(id)));
      const beforeComponents = Array.from(beforeIndexes)
        .filter((index): index is number => index !== undefined)
        .map(index => baseline.components[index]);
      if (beforeComponents.length > 1) {
        transitions.push({
          kind: 'merge',
          beforeComponentNodeIds: beforeComponents,
          afterComponentNodeIds: [afterMembers],
          affectedNodeIds: [...afterMembers],
        });
      }
    });
  } else if (preview.threshold < baseline.threshold) {
    baseline.components.forEach(beforeMembers => {
      const afterIndexes = new Set(beforeMembers.map(id => preview.componentByNodeId.get(id)));
      const afterComponents = Array.from(afterIndexes)
        .filter((index): index is number => index !== undefined)
        .map(index => preview.components[index]);
      if (afterComponents.length > 1) {
        transitions.push({
          kind: 'split',
          beforeComponentNodeIds: [beforeMembers],
          afterComponentNodeIds: afterComponents,
          affectedNodeIds: [...beforeMembers],
        });
      }
    });
  }
  return transitions;
}

function structuralEdgesBetween(
  model: ThresholdSensitivityModel,
  lowerThreshold: number,
  upperThreshold: number,
): Set<string> {
  const nodeIndex = new Map(model.nodeIds.map((id, index) => [id, index]));
  const unionFind = new UnionFind(model.nodeIds.length);
  const structural = new Set<string>();
  let edgeIndex = 0;

  while (edgeIndex < model.edges.length && model.edges[edgeIndex].value <= lowerThreshold) {
    const edge = model.edges[edgeIndex++];
    unionFind.union(nodeIndex.get(edge.sourceId)!, nodeIndex.get(edge.targetId)!);
  }

  while (edgeIndex < model.edges.length && model.edges[edgeIndex].value <= upperThreshold) {
    const value = model.edges[edgeIndex].value;
    const batch: ThresholdSensitivityEdge[] = [];
    while (edgeIndex < model.edges.length && model.edges[edgeIndex].value === value) {
      batch.push(model.edges[edgeIndex++]);
    }
    for (const edge of batch) {
      if (
        unionFind.find(nodeIndex.get(edge.sourceId)!) !==
        unionFind.find(nodeIndex.get(edge.targetId)!)
      ) structural.add(edge.id);
    }
    for (const edge of batch) {
      unionFind.union(nodeIndex.get(edge.sourceId)!, nodeIndex.get(edge.targetId)!);
    }
  }
  return structural;
}

export function compareThresholds(
  model: ThresholdSensitivityModel,
  baselineThreshold: number,
  previewThreshold: number,
): ThresholdSensitivityComparison {
  const baseline = snapshotThresholdSensitivity(model, baselineThreshold);
  const preview = snapshotThresholdSensitivity(model, previewThreshold);
  const addedEdgeIds: string[] = [];
  const removedEdgeIds: string[] = [];

  model.edges.forEach(edge => {
    const atBaseline = edge.value <= baselineThreshold;
    const atPreview = edge.value <= previewThreshold;
    if (!atBaseline && atPreview) addedEdgeIds.push(edge.id);
    if (atBaseline && !atPreview) removedEdgeIds.push(edge.id);
  });

  const structural = structuralEdgesBetween(
    model,
    Math.min(baselineThreshold, previewThreshold),
    Math.max(baselineThreshold, previewThreshold),
  );
  const changedEdgeIds = [...addedEdgeIds, ...removedEdgeIds];
  const changedNodeIds = model.nodeIds.filter(id => !sameMembers(
    componentMembersForNode(baseline, id),
    componentMembersForNode(preview, id),
  ));

  return {
    baselineThreshold,
    previewThreshold,
    baseline,
    preview,
    addedEdgeIds,
    removedEdgeIds,
    structuralEdgeIds: changedEdgeIds.filter(id => structural.has(id)),
    nonStructuralEdgeIds: changedEdgeIds.filter(id => !structural.has(id)),
    changedNodeIds,
    transitions: collectTransitions(baseline, preview),
  };
}

function adjustedRandIndex(
  baseline: ThresholdSensitivitySnapshot,
  candidate: ThresholdSensitivitySnapshot,
  nodeIds: string[],
): number {
  if (nodeIds.length < 2) return 1;
  const chooseTwo = (count: number) => count * (count - 1) / 2;
  const baselineCounts = new Map<number, number>();
  const candidateCounts = new Map<number, number>();
  const jointCounts = new Map<string, number>();
  nodeIds.forEach(id => {
    const baselineComponent = baseline.componentByNodeId.get(id) ?? -1;
    const candidateComponent = candidate.componentByNodeId.get(id) ?? -1;
    baselineCounts.set(baselineComponent, (baselineCounts.get(baselineComponent) || 0) + 1);
    candidateCounts.set(candidateComponent, (candidateCounts.get(candidateComponent) || 0) + 1);
    const jointKey = `${baselineComponent}\u0000${candidateComponent}`;
    jointCounts.set(jointKey, (jointCounts.get(jointKey) || 0) + 1);
  });
  const totalPairs = chooseTwo(nodeIds.length);
  const sameBaseline = Array.from(baselineCounts.values()).reduce((sum, count) => sum + chooseTwo(count), 0);
  const sameCandidate = Array.from(candidateCounts.values()).reduce((sum, count) => sum + chooseTwo(count), 0);
  const sameBoth = Array.from(jointCounts.values()).reduce((sum, count) => sum + chooseTwo(count), 0);
  if (!totalPairs) return 1;
  const expectedIndex = sameBaseline * sameCandidate / totalPairs;
  const maximumIndex = (sameBaseline + sameCandidate) / 2;
  const denominator = maximumIndex - expectedIndex;
  return Math.abs(denominator) < Number.EPSILON
    ? (baseline.partitionSignature === candidate.partitionSignature ? 1 : 0)
    : (sameBoth - expectedIndex) / denominator;
}

interface StructuralEventPoint {
  threshold: number;
  activeEdgeCount: number;
  clusterCount: number;
  singletonCount: number;
  largestClusterSize: number;
}

function analyzeStructuralEvents(model: ThresholdSensitivityModel): StructuralEventPoint[] {
  const nodeIndex = new Map(model.nodeIds.map((id, index) => [id, index]));
  const unionFind = new UnionFind(model.nodeIds.length);
  const events: StructuralEventPoint[] = [];
  let clusterCount = 0;
  let singletonCount = model.nodeIds.length;
  let largestClusterSize = model.nodeIds.length ? 1 : 0;
  let activeEdgeCount = 0;
  let edgeIndex = 0;

  while (edgeIndex < model.edges.length) {
    const threshold = model.edges[edgeIndex].value;
    const batch: ThresholdSensitivityEdge[] = [];
    while (edgeIndex < model.edges.length && model.edges[edgeIndex].value === threshold) {
      batch.push(model.edges[edgeIndex++]);
    }
    const structural = batch.some(edge => (
      unionFind.find(nodeIndex.get(edge.sourceId)!) !==
      unionFind.find(nodeIndex.get(edge.targetId)!)
    ));
    for (const edge of batch) {
      const sourceIndex = nodeIndex.get(edge.sourceId)!;
      const targetIndex = nodeIndex.get(edge.targetId)!;
      const sourceRoot = unionFind.find(sourceIndex);
      const targetRoot = unionFind.find(targetIndex);
      if (sourceRoot === targetRoot) continue;
      const sourceSize = unionFind.sizeOf(sourceRoot);
      const targetSize = unionFind.sizeOf(targetRoot);
      if (sourceSize === 1) singletonCount--; else clusterCount--;
      if (targetSize === 1) singletonCount--; else clusterCount--;
      unionFind.union(sourceRoot, targetRoot);
      const mergedSize = sourceSize + targetSize;
      clusterCount++;
      largestClusterSize = Math.max(largestClusterSize, mergedSize);
    }
    activeEdgeCount += batch.length;
    if (structural) {
      events.push({ threshold, activeEdgeCount, clusterCount, singletonCount, largestClusterSize });
    }
  }
  return events;
}

function baselineClusterPersistence(
  model: ThresholdSensitivityModel,
  baselineThreshold: number,
  baselineNodeIds: string[],
): { lower: number; higher: number | null } {
  const members = new Set(baselineNodeIds);
  const memberIndex = new Map(baselineNodeIds.map((id, index) => [id, index]));
  const unionFind = new UnionFind(baselineNodeIds.length);
  let componentCount = baselineNodeIds.length;
  let lower = Number.NEGATIVE_INFINITY;
  let higher: number | null = null;

  for (const edge of model.edges) {
    const sourceInside = members.has(edge.sourceId);
    const targetInside = members.has(edge.targetId);
    if (edge.value <= baselineThreshold && sourceInside && targetInside) {
      if (unionFind.union(memberIndex.get(edge.sourceId)!, memberIndex.get(edge.targetId)!)) {
        componentCount--;
        if (componentCount === 1) lower = edge.value;
      }
      continue;
    }
    if (edge.value > baselineThreshold && sourceInside !== targetInside) {
      higher = edge.value;
      break;
    }
  }
  return { lower, higher };
}

function evenlySample(values: number[], maximum: number): number[] {
  if (values.length <= maximum) return values;
  const sampled: number[] = [];
  for (let index = 0; index < maximum; index++) {
    sampled.push(values[Math.round(index * (values.length - 1) / (maximum - 1))]);
  }
  return uniqueSortedNumbers(sampled);
}

export function buildThresholdStabilityReport(
  model: ThresholdSensitivityModel,
  baselineThreshold: number,
  requestedRangeMin: number,
  requestedRangeMax: number,
): ThresholdStabilityReport {
  const rangeMin = Math.min(requestedRangeMin, requestedRangeMax);
  const rangeMax = Math.max(requestedRangeMin, requestedRangeMax);
  const baseline = snapshotThresholdSensitivity(model, baselineThreshold);
  const structuralEvents = analyzeStructuralEvents(model);
  const structuralEventsInRange = structuralEvents.filter(event => (
    event.threshold >= rangeMin && event.threshold <= rangeMax
  ));
  const chartThresholds = evenlySample(uniqueSortedNumbers([
    rangeMin,
    ...structuralEventsInRange.map(event => event.threshold),
    ...(baselineThreshold >= rangeMin && baselineThreshold <= rangeMax ? [baselineThreshold] : []),
    rangeMax,
  ]), 250);
  const snapshots = chartThresholds.map(value => snapshotThresholdSensitivity(model, value));
  const partitionIntervals: ThresholdPartitionInterval[] = [];
  const initialSnapshot = snapshotThresholdSensitivity(model, rangeMin);
  let intervalStart = rangeMin;
  let intervalClusterCount = initialSnapshot.clusterCount;
  let intervalIndex = 0;
  structuralEventsInRange.filter(event => event.threshold > rangeMin).forEach(event => {
    partitionIntervals.push({
      from: intervalStart,
      to: event.threshold,
      partitionSignature: `partition-${intervalIndex++}`,
      clusterCount: intervalClusterCount,
    });
    intervalStart = event.threshold;
    intervalClusterCount = event.clusterCount;
  });
  partitionIntervals.push({
    from: intervalStart,
    to: rangeMax,
    partitionSignature: `partition-${intervalIndex}`,
    clusterCount: intervalClusterCount,
  });

  const baselineClusters = baseline.components.filter(members => members.length > 1);
  const clusterStability = baselineClusters.map(baselineNodeIds => {
    const persistence = baselineClusterPersistence(model, baselineThreshold, baselineNodeIds);
    const rangeStable = rangeMin >= persistence.lower
      && (persistence.higher === null || rangeMax < persistence.higher);

    return {
      baselineNodeIds,
      stableAcrossRange: rangeStable,
      lowerPersistenceBound: Number.isFinite(persistence.lower) ? persistence.lower : null,
      upperPersistenceBound: persistence.higher,
      firstLowerChange: Number.isFinite(persistence.lower) ? persistence.lower : null,
      firstHigherChange: persistence.higher,
    };
  });

  const clusteredBaselineNodeIds = baselineClusters.flat();
  const stableNodeCount = clusterStability
    .filter(cluster => cluster.stableAcrossRange)
    .reduce((total, cluster) => total + cluster.baselineNodeIds.length, 0);
  const previousStructuralEvent = [...structuralEvents]
    .reverse()
    .find(event => event.threshold <= baselineThreshold);
  const nextStructuralEvent = structuralEvents.find(event => event.threshold > baselineThreshold);

  return {
    rangeMin,
    rangeMax,
    partitionIntervals,
    clusterStability,
    stableClusterCount: clusterStability.filter(cluster => cluster.stableAcrossRange).length,
    changingClusterCount: clusterStability.filter(cluster => !cluster.stableAcrossRange).length,
    stableNodeShare: clusteredBaselineNodeIds.length ? stableNodeCount / clusteredBaselineNodeIds.length : 1,
    structuralEventThresholdCount: structuralEventsInRange.length,
    widestBaselineStabilityInterval: {
      from: previousStructuralEvent?.threshold ?? Math.min(rangeMin, baselineThreshold),
      to: nextStructuralEvent?.threshold ?? Math.max(rangeMax, baselineThreshold),
    },
    series: snapshots.map(snapshot => ({
      threshold: snapshot.threshold,
      activeEdgeCount: snapshot.activeEdgeCount,
      clusterCount: snapshot.clusterCount,
      singletonCount: snapshot.singletonCount,
      largestClusterSize: snapshot.largestClusterSize,
      partitionAgreement: adjustedRandIndex(baseline, snapshot, model.nodeIds),
    })),
  };
}

export function nearestThresholdOptionIndex(options: number[], threshold: number): number {
  if (!options.length) return 0;
  let bestIndex = 0;
  let bestDistance = Math.abs(options[0] - threshold);
  options.forEach((value, index) => {
    const distance = Math.abs(value - threshold);
    if (distance < bestDistance || (distance === bestDistance && value <= threshold)) {
      bestIndex = index;
      bestDistance = distance;
    }
  });
  return bestIndex;
}
