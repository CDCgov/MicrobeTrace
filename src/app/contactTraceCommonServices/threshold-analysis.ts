import {
  type ComponentStructureMetrics,
  type ComponentStructureScoreBreakdown,
  type ComponentStructureScoreWeights,
  DEFAULT_COMPONENT_STRUCTURE_SCORE_WEIGHTS,
  IncrementalComponentMetrics,
  scoreComponentStructureMetrics,
} from './component-metrics';

export interface ThresholdAnalysisNodeLike {
  _id?: string;
  id?: string;
}

export interface ThresholdAnalysisLinkLike {
  source: any;
  target: any;
  visible?: boolean;
  [key: string]: any;
}

export interface ThresholdAnalysisEdge {
  linkIndex: number;
  sourceId: string;
  targetId: string;
  sourceIndex: number;
  targetIndex: number;
  value: number;
}

export interface ThresholdAnalysisBaseEdge {
  sourceIndex: number;
  targetIndex: number;
}

export interface ThresholdAnalysisPairEdge {
  sourceIndex: number;
  targetIndex: number;
  value: number;
}

export interface StoredDistanceEdgeCache {
  metric: string;
  version: number;
  nodeIds: string[];
  nodeIndexById: Record<string, number>;
  sortedEdges: ThresholdAnalysisEdge[];
  sortedValues: number[];
}

export interface ThresholdSweepSummary {
  metric: string;
  version: number;
  thresholds: number[];
  componentCounts: number[];
  clusterCounts: number[];
  singletonCounts: number[];
  largestClusterSizes: number[];
  componentMetrics: ComponentStructureMetrics[];
  componentStructureScores: number[];
  componentStructureScoreBreakdowns: ComponentStructureScoreBreakdown[];
  maximumClusterCount: number;
  recommendedIndex: number;
  scoreWeights: ComponentStructureScoreWeights;
}

export interface VisibleClusterSummary {
  clusters: Array<{
    id: number;
    nodes: number;
    links: number;
    sum_distances: number;
    links_per_node: number;
    mean_genetic_distance: number | undefined;
    visible: boolean;
  }>;
  nodeClusterByIndex: number[];
  linkClusterByIndex: Array<number | null>;
  degrees: number[];
  largestClusterSize: number;
  singletonCount: number;
  clusterCount: number;
}

class UnionFind {
  private readonly parent: number[];
  private readonly sizes: number[];
  public components: number;

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, index) => index);
    this.sizes = Array.from({ length: size }, () => 1);
    this.components = size;
  }

  find(index: number): number {
    let root = index;
    while (this.parent[root] !== root) {
      root = this.parent[root];
    }

    let current = index;
    while (this.parent[current] !== current) {
      const next = this.parent[current];
      this.parent[current] = root;
      current = next;
    }

    return root;
  }

  sizeOf(index: number): number {
    return this.sizes[this.find(index)];
  }

  union(a: number, b: number): number {
    let rootA = this.find(a);
    let rootB = this.find(b);

    if (rootA === rootB) {
      return rootA;
    }

    if (this.sizes[rootA] < this.sizes[rootB]) {
      [rootA, rootB] = [rootB, rootA];
    }

    this.parent[rootB] = rootA;
    this.sizes[rootA] += this.sizes[rootB];
    this.components--;

    return rootA;
  }
}

function getNodeId(node: ThresholdAnalysisNodeLike): string {
  const id = node?._id ?? node?.id ?? '';
  return typeof id === 'string' ? id : String(id);
}

function getEndpointId(endpoint: any): string {
  if (endpoint && typeof endpoint === 'object') {
    return getEndpointId(endpoint._id ?? endpoint.id ?? endpoint.data?.id);
  }

  return endpoint === undefined || endpoint === null ? '' : String(endpoint);
}

function getNumericMetricValue(link: ThresholdAnalysisLinkLike, metric: string): number | null {
  const raw = link?.[metric];
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null;
  }

  if (typeof raw === 'string' && raw.trim().length > 0) {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function buildStoredDistanceEdgeCache(
  nodes: ThresholdAnalysisNodeLike[],
  links: ThresholdAnalysisLinkLike[],
  metric: string,
  version: number,
  includeLink: (link: ThresholdAnalysisLinkLike, linkIndex: number) => boolean = () => true,
): StoredDistanceEdgeCache {
  const nodeIds = nodes.map((node) => getNodeId(node));
  const nodeIndexById: Record<string, number> = Object.create(null);

  nodeIds.forEach((nodeId, index) => {
    nodeIndexById[nodeId] = index;
  });

  const sortedEdges: ThresholdAnalysisEdge[] = [];

  links.forEach((link, linkIndex) => {
    if (!includeLink(link, linkIndex)) {
      return;
    }

    const value = getNumericMetricValue(link, metric);
    if (value === null) {
      return;
    }

    const sourceId = getEndpointId(link.source);
    const targetId = getEndpointId(link.target);
    const sourceIndex = nodeIndexById[sourceId];
    const targetIndex = nodeIndexById[targetId];

    if (
      sourceIndex === undefined ||
      targetIndex === undefined ||
      sourceIndex === targetIndex
    ) {
      return;
    }

    sortedEdges.push({
      linkIndex,
      sourceId,
      targetId,
      sourceIndex,
      targetIndex,
      value
    });
  });

  sortedEdges.sort((a, b) => {
    if (a.value !== b.value) {
      return a.value - b.value;
    }

    if (a.sourceId !== b.sourceId) {
      return a.sourceId.localeCompare(b.sourceId);
    }

    return a.targetId.localeCompare(b.targetId);
  });

  return {
    metric,
    version,
    nodeIds,
    nodeIndexById,
    sortedEdges,
    sortedValues: sortedEdges.map((edge) => edge.value)
  };
}

export function buildThresholdSweepSummary(
  cache: StoredDistanceEdgeCache,
  baseEdges: ThresholdAnalysisBaseEdge[] = [],
  excludedLinkIndexes: Set<number> = new Set(),
  scoreWeights: ComponentStructureScoreWeights = DEFAULT_COMPONENT_STRUCTURE_SCORE_WEIGHTS,
): ThresholdSweepSummary {
  const thresholds: number[] = [];
  const componentCounts: number[] = [];
  const clusterCounts: number[] = [];
  const singletonCounts: number[] = [];
  const largestClusterSizes: number[] = [];
  const componentMetrics: ComponentStructureMetrics[] = [];

  const uf = new UnionFind(cache.nodeIds.length);
  const metricTracker = new IncrementalComponentMetrics(cache.nodeIds.length);

  const mergeComponents = (sourceIndex: number, targetIndex: number) => {
    const rootA = uf.find(sourceIndex);
    const rootB = uf.find(targetIndex);

    if (rootA === rootB) {
      return;
    }

    const sizeA = uf.sizeOf(rootA);
    const sizeB = uf.sizeOf(rootB);

    metricTracker.merge(sizeA, sizeB);
    uf.union(rootA, rootB);
  };

  baseEdges.forEach((edge) => {
    mergeComponents(edge.sourceIndex, edge.targetIndex);
  });

  let edgeIndex = 0;
  while (edgeIndex < cache.sortedEdges.length) {
    const threshold = cache.sortedEdges[edgeIndex].value;

    while (
      edgeIndex < cache.sortedEdges.length &&
      cache.sortedEdges[edgeIndex].value === threshold
    ) {
      const edge = cache.sortedEdges[edgeIndex];
      edgeIndex++;

      if (excludedLinkIndexes.has(edge.linkIndex)) {
        continue;
      }

      mergeComponents(edge.sourceIndex, edge.targetIndex);
    }

    thresholds.push(threshold);
    const metrics = metricTracker.snapshot();
    componentMetrics.push(metrics);
    componentCounts.push(metrics.componentCount);
    clusterCounts.push(metrics.clusterCount);
    singletonCounts.push(metrics.singletonCount);
    largestClusterSizes.push(metrics.largestClusterSize);
  }

  const maximumClusterCount = componentMetrics.reduce(
    (maximum, metrics) => Math.max(maximum, metrics.clusterCount),
    0,
  );
  const scoreResults = componentMetrics.map((metrics) => (
    scoreComponentStructureMetrics(metrics, maximumClusterCount, scoreWeights)
  ));
  const componentStructureScores = scoreResults.map((result) => result.score);
  const componentStructureScoreBreakdowns = scoreResults.map((result) => result.breakdown);
  let recommendedIndex = -1;

  componentMetrics.forEach((metrics, index) => {
    if (metrics.clusterCount === 0) {
      return;
    }

    if (recommendedIndex === -1) {
      recommendedIndex = index;
      return;
    }

    const scoreDifference = componentStructureScores[index] - componentStructureScores[recommendedIndex];
    if (scoreDifference > 1e-9) {
      recommendedIndex = index;
      return;
    }

    if (Math.abs(scoreDifference) <= 1e-9) {
      const recommendedMetrics = componentMetrics[recommendedIndex];
      if (
        metrics.clusteredFraction > recommendedMetrics.clusteredFraction
        || (
          metrics.clusteredFraction === recommendedMetrics.clusteredFraction
          && metrics.largestClusterFraction < recommendedMetrics.largestClusterFraction
        )
      ) {
        recommendedIndex = index;
      }
    }
  });

  return {
    metric: cache.metric,
    version: cache.version,
    thresholds,
    componentCounts,
    clusterCounts,
    singletonCounts,
    largestClusterSizes,
    componentMetrics,
    componentStructureScores,
    componentStructureScoreBreakdowns,
    maximumClusterCount,
    recommendedIndex,
    scoreWeights: { ...scoreWeights },
  };
}

export function isThresholdControlledGeneticLink(
  link: ThresholdAnalysisLinkLike,
  metric: string,
): boolean {
  return link?.hasDistance === true && getNumericMetricValue(link, metric) !== null;
}

export function buildVisibleClusterSummary(
  nodes: ThresholdAnalysisNodeLike[],
  links: ThresholdAnalysisLinkLike[],
  metric: string
): VisibleClusterSummary {
  const nodeIds = nodes.map((node) => getNodeId(node));
  const nodeIndexById: Record<string, number> = Object.create(null);
  const uf = new UnionFind(nodeIds.length);
  const degrees = Array.from({ length: nodeIds.length }, () => 0);

  nodeIds.forEach((nodeId, index) => {
    nodeIndexById[nodeId] = index;
  });

  links.forEach((link) => {
    if (!link.visible) {
      return;
    }

    const sourceIndex = nodeIndexById[getEndpointId(link.source)];
    const targetIndex = nodeIndexById[getEndpointId(link.target)];

    if (
      sourceIndex === undefined ||
      targetIndex === undefined ||
      sourceIndex === targetIndex
    ) {
      return;
    }

    degrees[sourceIndex]++;
    degrees[targetIndex]++;
    uf.union(sourceIndex, targetIndex);
  });

  const rootToClusterId = new Map<number, number>();
  const clusters: VisibleClusterSummary['clusters'] = [];
  const nodeClusterByIndex = Array.from({ length: nodeIds.length }, () => 0);

  nodeIds.forEach((_, index) => {
    const root = uf.find(index);
    let clusterId = rootToClusterId.get(root);

    if (clusterId === undefined) {
      clusterId = clusters.length;
      rootToClusterId.set(root, clusterId);
      clusters.push({
        id: clusterId,
        nodes: 0,
        links: 0,
        sum_distances: 0,
        links_per_node: 0,
        mean_genetic_distance: undefined,
        visible: true
      });
    }

    nodeClusterByIndex[index] = clusterId;
    clusters[clusterId].nodes++;
  });

  const linkClusterByIndex = Array.from({ length: links.length }, () => null as number | null);

  links.forEach((link, linkIndex) => {
    const sourceIndex = nodeIndexById[getEndpointId(link.source)];
    const targetIndex = nodeIndexById[getEndpointId(link.target)];

    if (sourceIndex === undefined || targetIndex === undefined) {
      return;
    }

    const sourceClusterId = nodeClusterByIndex[sourceIndex];
    const targetClusterId = nodeClusterByIndex[targetIndex];

    if (sourceClusterId !== targetClusterId) {
      return;
    }

    linkClusterByIndex[linkIndex] = sourceClusterId;

    if (!link.visible) {
      return;
    }

    const cluster = clusters[sourceClusterId];
    cluster.links++;

    const value = getNumericMetricValue(link, metric);
    if (value !== null) {
      cluster.sum_distances += value;
    }
  });

  let largestClusterSize = 0;
  let singletonCount = 0;
  let clusterCount = 0;

  clusters.forEach((cluster) => {
    if (cluster.nodes > largestClusterSize) {
      largestClusterSize = cluster.nodes;
    }

    if (cluster.nodes === 1) {
      singletonCount++;
    } else {
      clusterCount++;
    }

    cluster.links_per_node = cluster.nodes > 0 ? cluster.links / cluster.nodes : 0;
    cluster.mean_genetic_distance = cluster.links > 0
      ? cluster.sum_distances / cluster.links
      : undefined;
  });

  return {
    clusters,
    nodeClusterByIndex,
    linkClusterByIndex,
    degrees,
    largestClusterSize,
    singletonCount,
    clusterCount
  };
}
