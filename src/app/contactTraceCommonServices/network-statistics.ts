export interface NetworkStatisticsNodeLike {
  _id?: string;
  id?: string;
  selected?: boolean;
}

export interface NetworkStatisticsLinkLike {
  source: any;
  target: any;
  visible?: boolean;
}

export interface NetworkStatisticsApproximationOptions {
  exactNodeLimit?: number;
  exactLinkLimit?: number;
  sampleSize?: number;
  forceApproximate?: boolean;
}

export interface NetworkStatisticsRequest {
  nodes: NetworkStatisticsNodeLike[];
  links: NetworkStatisticsLinkLike[];
  selectedNodeIds?: string[];
  metricLabel?: string;
  threshold?: number | string;
  approximation?: NetworkStatisticsApproximationOptions;
}

export interface NetworkStatisticsSummary {
  nodeCount: number;
  linkCount: number;
  selectedNodeCount: number;
  componentCount: number;
  clusterCount: number;
  singletonCount: number;
  largestComponentSize: number;
  density: number;
  averageDegree: number;
  maxDegree: number;
  averageLocalClusteringCoefficient: number;
  transitivity: number;
  averagePathLength: number;
  diameter: number;
  approximateBetweenness: boolean;
  approximatePathMetrics: boolean;
  sampledSourceCount: number;
  metricLabel: string;
  threshold: number | string | null;
}

export interface NetworkStatisticsDegreeBucketRow {
  degree: number;
  nodeCount: number;
  fraction: number;
}

export interface NetworkStatisticsCentralityRow {
  nodeId: string;
  degree: number;
  normalizedDegree: number;
  betweenness: number;
  normalizedBetweenness: number;
  componentId: number;
}

export interface NetworkStatisticsComponentRow {
  componentId: number;
  nodeCount: number;
  linkCount: number;
  density: number;
  averageDegree: number;
  maxDegree: number;
  diameter: number | null;
  diameterApproximate: boolean;
  memberIds: string[];
}

export interface NetworkStatisticsResult {
  summary: NetworkStatisticsSummary;
  degreeDistribution: NetworkStatisticsDegreeBucketRow[];
  centrality: NetworkStatisticsCentralityRow[];
  components: NetworkStatisticsComponentRow[];
  generatedAtIso: string;
  exactNodeLimit: number;
  exactLinkLimit: number;
}

interface GraphBuildResult {
  nodeIds: string[];
  selectedNodeIds: Set<string>;
  adjacency: Array<Set<number>>;
  edges: Array<{ sourceIndex: number; targetIndex: number }>;
}

interface ComponentBuildResult {
  componentByNode: number[];
  components: NetworkStatisticsComponentRow[];
}

interface ShortestPathResult {
  stack: number[];
  predecessors: number[][];
  sigma: number[];
  distances: number[];
}

const DEFAULT_EXACT_NODE_LIMIT = 2000;
const DEFAULT_EXACT_LINK_LIMIT = 10000;
const DEFAULT_SAMPLE_SIZE = 256;

function getNodeId(node: NetworkStatisticsNodeLike): string {
  const id = node?._id ?? node?.id ?? '';
  return typeof id === 'string' ? id : String(id);
}

function getEndpointId(endpoint: any): string {
  if (endpoint && typeof endpoint === 'object') {
    const id = endpoint._id ?? endpoint.id ?? '';
    return typeof id === 'string' ? id : String(id);
  }

  return endpoint === undefined || endpoint === null ? '' : String(endpoint);
}

function safeRatio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function buildGraph(request: NetworkStatisticsRequest): GraphBuildResult {
  const nodeIds: string[] = [];
  const nodeIndexById = new Map<string, number>();
  const selectedNodeIds = new Set((request.selectedNodeIds || []).map(String));

  (request.nodes || []).forEach((node) => {
    const nodeId = getNodeId(node);
    if (!nodeId || nodeIndexById.has(nodeId)) {
      return;
    }

    nodeIndexById.set(nodeId, nodeIds.length);
    nodeIds.push(nodeId);
    if (node.selected) {
      selectedNodeIds.add(nodeId);
    }
  });

  const adjacency = Array.from({ length: nodeIds.length }, () => new Set<number>());
  const edgeKeys = new Set<string>();
  const edges: Array<{ sourceIndex: number; targetIndex: number }> = [];

  (request.links || []).forEach((link) => {
    if (!link || link.visible === false) {
      return;
    }

    const sourceIndex = nodeIndexById.get(getEndpointId(link.source));
    const targetIndex = nodeIndexById.get(getEndpointId(link.target));

    if (
      sourceIndex === undefined ||
      targetIndex === undefined ||
      sourceIndex === targetIndex
    ) {
      return;
    }

    const a = Math.min(sourceIndex, targetIndex);
    const b = Math.max(sourceIndex, targetIndex);
    const key = `${a}|${b}`;
    if (edgeKeys.has(key)) {
      return;
    }

    edgeKeys.add(key);
    adjacency[a].add(b);
    adjacency[b].add(a);
    edges.push({ sourceIndex: a, targetIndex: b });
  });

  return {
    nodeIds,
    selectedNodeIds,
    adjacency,
    edges
  };
}

function buildComponents(
  nodeIds: string[],
  adjacency: Array<Set<number>>,
  edges: Array<{ sourceIndex: number; targetIndex: number }>
): ComponentBuildResult {
  const componentByNode = Array.from({ length: nodeIds.length }, () => -1);
  const components: NetworkStatisticsComponentRow[] = [];

  for (let start = 0; start < nodeIds.length; start++) {
    if (componentByNode[start] !== -1) {
      continue;
    }

    const componentId = components.length;
    const queue = [start];
    const memberIndexes: number[] = [];
    componentByNode[start] = componentId;

    for (let i = 0; i < queue.length; i++) {
      const nodeIndex = queue[i];
      memberIndexes.push(nodeIndex);
      adjacency[nodeIndex].forEach((neighbor) => {
        if (componentByNode[neighbor] !== -1) {
          return;
        }
        componentByNode[neighbor] = componentId;
        queue.push(neighbor);
      });
    }

    const degrees = memberIndexes.map((nodeIndex) => adjacency[nodeIndex].size);
    const degreeSum = degrees.reduce((sum, degree) => sum + degree, 0);
    const nodeCount = memberIndexes.length;
    const maxDegree = degrees.reduce((max, degree) => Math.max(max, degree), 0);

    components.push({
      componentId,
      nodeCount,
      linkCount: 0,
      density: 0,
      averageDegree: safeRatio(degreeSum, nodeCount),
      maxDegree,
      diameter: nodeCount <= 1 ? 0 : null,
      diameterApproximate: false,
      memberIds: memberIndexes.map((nodeIndex) => nodeIds[nodeIndex]).sort()
    });
  }

  edges.forEach((edge) => {
    const componentId = componentByNode[edge.sourceIndex];
    if (componentId >= 0) {
      components[componentId].linkCount++;
    }
  });

  components.forEach((component) => {
    component.density = safeRatio(
      component.linkCount,
      component.nodeCount * (component.nodeCount - 1) / 2
    );
  });

  return {
    componentByNode,
    components
  };
}

function computeClustering(adjacency: Array<Set<number>>): {
  averageLocalClusteringCoefficient: number;
  transitivity: number;
} {
  let localClusteringSum = 0;
  let localClusteringNodeCount = 0;
  let closedTriplets = 0;
  let connectedTriplets = 0;

  adjacency.forEach((neighbors) => {
    const neighborList = Array.from(neighbors);
    const degree = neighborList.length;
    if (degree < 2) {
      return;
    }

    let neighborEdges = 0;
    for (let i = 0; i < neighborList.length; i++) {
      const a = neighborList[i];
      for (let j = i + 1; j < neighborList.length; j++) {
        if (adjacency[a].has(neighborList[j])) {
          neighborEdges++;
        }
      }
    }

    const possibleNeighborEdges = degree * (degree - 1) / 2;
    localClusteringSum += safeRatio(neighborEdges, possibleNeighborEdges);
    localClusteringNodeCount++;
    closedTriplets += neighborEdges;
    connectedTriplets += possibleNeighborEdges;
  });

  return {
    averageLocalClusteringCoefficient: safeRatio(localClusteringSum, localClusteringNodeCount),
    transitivity: safeRatio(closedTriplets, connectedTriplets)
  };
}

function selectBetweennessSources(
  nodeIds: string[],
  adjacency: Array<Set<number>>,
  sampleSize: number
): number[] {
  const nodeCount = nodeIds.length;
  const targetCount = Math.min(Math.max(1, sampleSize), nodeCount);
  if (targetCount >= nodeCount) {
    return nodeIds.map((_, index) => index);
  }

  const selected = new Set<number>();
  const highDegreeCount = Math.ceil(targetCount / 2);
  const highDegreeNodes = nodeIds
    .map((nodeId, index) => ({ nodeId, index, degree: adjacency[index].size }))
    .sort((a, b) => {
      if (b.degree !== a.degree) {
        return b.degree - a.degree;
      }
      return a.nodeId.localeCompare(b.nodeId);
    });

  highDegreeNodes.slice(0, highDegreeCount).forEach((entry) => selected.add(entry.index));

  const remainingIndexes = nodeIds
    .map((_, index) => index)
    .filter((index) => !selected.has(index));
  const remainingNeeded = targetCount - selected.size;

  if (remainingNeeded > 0 && remainingIndexes.length > 0) {
    const step = remainingIndexes.length / remainingNeeded;
    for (let i = 0; i < remainingNeeded; i++) {
      const index = remainingIndexes[Math.min(remainingIndexes.length - 1, Math.floor(i * step))];
      selected.add(index);
    }
  }

  for (let index = 0; selected.size < targetCount && index < nodeCount; index++) {
    selected.add(index);
  }

  return Array.from(selected).sort((a, b) => a - b);
}

function shortestPathsFrom(adjacency: number[][], source: number): ShortestPathResult {
  const nodeCount = adjacency.length;
  const stack: number[] = [];
  const predecessors = Array.from({ length: nodeCount }, () => [] as number[]);
  const sigma = Array.from({ length: nodeCount }, () => 0);
  const distances = Array.from({ length: nodeCount }, () => -1);
  const queue = [source];

  sigma[source] = 1;
  distances[source] = 0;

  for (let queueIndex = 0; queueIndex < queue.length; queueIndex++) {
    const v = queue[queueIndex];
    stack.push(v);

    adjacency[v].forEach((w) => {
      if (distances[w] < 0) {
        distances[w] = distances[v] + 1;
        queue.push(w);
      }

      if (distances[w] === distances[v] + 1) {
        sigma[w] += sigma[v];
        predecessors[w].push(v);
      }
    });
  }

  return {
    stack,
    predecessors,
    sigma,
    distances
  };
}

function computePathAndBetweenness(
  nodeIds: string[],
  adjacencySets: Array<Set<number>>,
  componentByNode: number[],
  components: NetworkStatisticsComponentRow[],
  approximate: boolean,
  sampleSize: number
): {
  betweenness: number[];
  averagePathLength: number;
  diameter: number;
  sampledSourceCount: number;
} {
  const nodeCount = nodeIds.length;
  const adjacency = adjacencySets.map((neighbors) => Array.from(neighbors).sort((a, b) => a - b));
  const sources = approximate
    ? selectBetweennessSources(nodeIds, adjacencySets, sampleSize)
    : nodeIds.map((_, index) => index);
  const betweenness = Array.from({ length: nodeCount }, () => 0);
  const componentDiameters = components.map((component) => component.nodeCount <= 1 ? 0 : null as number | null);
  let pathLengthSum = 0;
  let reachablePairCount = 0;
  let graphDiameter = 0;

  sources.forEach((source) => {
    const result = shortestPathsFrom(adjacency, source);
    const sourceComponentId = componentByNode[source];

    result.distances.forEach((distance, target) => {
      if (distance <= 0) {
        return;
      }

      const shouldCountPath = approximate || target > source;
      if (shouldCountPath) {
        pathLengthSum += distance;
        reachablePairCount++;
      }

      if (distance > graphDiameter) {
        graphDiameter = distance;
      }

      if (sourceComponentId >= 0 && distance > (componentDiameters[sourceComponentId] ?? 0)) {
        componentDiameters[sourceComponentId] = distance;
      }
    });

    const delta = Array.from({ length: nodeCount }, () => 0);
    while (result.stack.length > 0) {
      const w = result.stack.pop() as number;
      result.predecessors[w].forEach((v) => {
        if (result.sigma[w] !== 0) {
          delta[v] += (result.sigma[v] / result.sigma[w]) * (1 + delta[w]);
        }
      });
      if (w !== source) {
        betweenness[w] += delta[w];
      }
    }
  });

  const betweennessScale = approximate && sources.length > 0
    ? nodeCount / sources.length / 2
    : 1 / 2;

  for (let i = 0; i < betweenness.length; i++) {
    betweenness[i] *= betweennessScale;
  }

  components.forEach((component, index) => {
    component.diameter = componentDiameters[index];
    component.diameterApproximate = approximate && component.nodeCount > 1;
  });

  return {
    betweenness,
    averagePathLength: safeRatio(pathLengthSum, reachablePairCount),
    diameter: graphDiameter,
    sampledSourceCount: sources.length
  };
}

export function computeNetworkStatistics(request: NetworkStatisticsRequest): NetworkStatisticsResult {
  const exactNodeLimit = request.approximation?.exactNodeLimit ?? DEFAULT_EXACT_NODE_LIMIT;
  const exactLinkLimit = request.approximation?.exactLinkLimit ?? DEFAULT_EXACT_LINK_LIMIT;
  const sampleSize = request.approximation?.sampleSize ?? DEFAULT_SAMPLE_SIZE;
  const graph = buildGraph(request);
  const nodeCount = graph.nodeIds.length;
  const linkCount = graph.edges.length;
  const degrees = graph.adjacency.map((neighbors) => neighbors.size);
  const degreeSum = degrees.reduce((sum, degree) => sum + degree, 0);
  const maxDegree = degrees.reduce((max, degree) => Math.max(max, degree), 0);
  const componentsResult = buildComponents(graph.nodeIds, graph.adjacency, graph.edges);
  const clustering = computeClustering(graph.adjacency);
  const approximate = Boolean(request.approximation?.forceApproximate)
    || nodeCount > exactNodeLimit
    || linkCount > exactLinkLimit;
  const pathAndBetweenness = computePathAndBetweenness(
    graph.nodeIds,
    graph.adjacency,
    componentsResult.componentByNode,
    componentsResult.components,
    approximate,
    sampleSize
  );

  const degreeBuckets = new Map<number, number>();
  degrees.forEach((degree) => {
    degreeBuckets.set(degree, (degreeBuckets.get(degree) || 0) + 1);
  });

  const normalBetweennessDenominator = nodeCount > 2
    ? (nodeCount - 1) * (nodeCount - 2) / 2
    : 0;

  const centrality = graph.nodeIds.map((nodeId, index) => ({
    nodeId,
    degree: degrees[index],
    normalizedDegree: safeRatio(degrees[index], nodeCount - 1),
    betweenness: pathAndBetweenness.betweenness[index],
    normalizedBetweenness: safeRatio(pathAndBetweenness.betweenness[index], normalBetweennessDenominator),
    componentId: componentsResult.componentByNode[index]
  })).sort((a, b) => {
    if (b.betweenness !== a.betweenness) {
      return b.betweenness - a.betweenness;
    }
    if (b.degree !== a.degree) {
      return b.degree - a.degree;
    }
    return a.nodeId.localeCompare(b.nodeId);
  });

  const clusterCount = componentsResult.components.filter((component) => component.nodeCount > 1).length;
  const singletonCount = componentsResult.components.filter((component) => component.nodeCount === 1).length;
  const largestComponentSize = componentsResult.components.reduce(
    (largest, component) => Math.max(largest, component.nodeCount),
    0
  );

  return {
    summary: {
      nodeCount,
      linkCount,
      selectedNodeCount: graph.nodeIds.filter((nodeId) => graph.selectedNodeIds.has(nodeId)).length,
      componentCount: componentsResult.components.length,
      clusterCount,
      singletonCount,
      largestComponentSize,
      density: safeRatio(linkCount, nodeCount * (nodeCount - 1) / 2),
      averageDegree: safeRatio(degreeSum, nodeCount),
      maxDegree,
      averageLocalClusteringCoefficient: clustering.averageLocalClusteringCoefficient,
      transitivity: clustering.transitivity,
      averagePathLength: pathAndBetweenness.averagePathLength,
      diameter: pathAndBetweenness.diameter,
      approximateBetweenness: approximate,
      approximatePathMetrics: approximate,
      sampledSourceCount: pathAndBetweenness.sampledSourceCount,
      metricLabel: request.metricLabel || '',
      threshold: request.threshold ?? null
    },
    degreeDistribution: Array.from(degreeBuckets.entries())
      .map(([degree, count]) => ({
        degree,
        nodeCount: count,
        fraction: safeRatio(count, nodeCount)
      }))
      .sort((a, b) => a.degree - b.degree),
    centrality,
    components: componentsResult.components.sort((a, b) => {
      if (b.nodeCount !== a.nodeCount) {
        return b.nodeCount - a.nodeCount;
      }
      return a.componentId - b.componentId;
    }),
    generatedAtIso: new Date().toISOString(),
    exactNodeLimit,
    exactLinkLimit
  };
}

function csvEscape(value: any): string {
  if (value === null || value === undefined) {
    return '';
  }

  const text = Array.isArray(value) ? value.join('|') : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function serializeNetworkStatisticsCsv(result: NetworkStatisticsResult): string {
  const headers = [
    'record_type',
    'key',
    'value',
    'node_id',
    'component_id',
    'degree',
    'node_count',
    'link_count',
    'fraction',
    'density',
    'average_degree',
    'max_degree',
    'betweenness',
    'normalized_degree',
    'normalized_betweenness',
    'clustering',
    'transitivity',
    'average_path_length',
    'diameter',
    'approximate',
    'metric',
    'threshold',
    'member_ids',
    'generated_at'
  ];

  const rows: Record<string, any>[] = [];
  const summary = result.summary;
  const summaryEntries: Array<[keyof NetworkStatisticsSummary, any]> = [
    ['nodeCount', summary.nodeCount],
    ['linkCount', summary.linkCount],
    ['selectedNodeCount', summary.selectedNodeCount],
    ['componentCount', summary.componentCount],
    ['clusterCount', summary.clusterCount],
    ['singletonCount', summary.singletonCount],
    ['largestComponentSize', summary.largestComponentSize],
    ['density', summary.density],
    ['averageDegree', summary.averageDegree],
    ['maxDegree', summary.maxDegree],
    ['averageLocalClusteringCoefficient', summary.averageLocalClusteringCoefficient],
    ['transitivity', summary.transitivity],
    ['averagePathLength', summary.averagePathLength],
    ['diameter', summary.diameter],
    ['sampledSourceCount', summary.sampledSourceCount]
  ];

  summaryEntries.forEach(([key, value]) => {
    rows.push({
      record_type: 'summary',
      key,
      value,
      approximate: summary.approximateBetweenness || summary.approximatePathMetrics,
      metric: summary.metricLabel,
      threshold: summary.threshold,
      generated_at: result.generatedAtIso
    });
  });

  result.degreeDistribution.forEach((row) => {
    rows.push({
      record_type: 'degree_bucket',
      degree: row.degree,
      node_count: row.nodeCount,
      fraction: row.fraction,
      generated_at: result.generatedAtIso
    });
  });

  result.centrality.forEach((row) => {
    rows.push({
      record_type: 'node_centrality',
      node_id: row.nodeId,
      component_id: row.componentId,
      degree: row.degree,
      betweenness: row.betweenness,
      normalized_degree: row.normalizedDegree,
      normalized_betweenness: row.normalizedBetweenness,
      approximate: summary.approximateBetweenness,
      generated_at: result.generatedAtIso
    });
  });

  result.components.forEach((row) => {
    rows.push({
      record_type: 'component',
      component_id: row.componentId,
      node_count: row.nodeCount,
      link_count: row.linkCount,
      density: row.density,
      average_degree: row.averageDegree,
      max_degree: row.maxDegree,
      diameter: row.diameter,
      approximate: row.diameterApproximate,
      member_ids: row.memberIds,
      generated_at: result.generatedAtIso
    });
  });

  return [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(','))
  ].join('\r\n');
}
