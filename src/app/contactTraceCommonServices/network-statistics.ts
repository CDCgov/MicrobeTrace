import {
  computeComponentStructureMetrics,
  type ComponentStructureMetrics,
} from './component-metrics';

export interface NetworkStatisticsNodeLike {
  _id?: string;
  id?: string;
  selected?: boolean;
}

export interface NetworkStatisticsLinkLike {
  source: any;
  target: any;
  visible?: boolean;
  hasMolecularEvidence?: boolean;
  hasEpidemiologicEvidence?: boolean;
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
  componentMetrics: ComponentStructureMetrics;
  density: number;
  averageDegree: number;
  medianDegree: number;
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
  linkEvidence: NetworkStatisticsLinkEvidenceSummary;
}

export interface NetworkStatisticsLinkEvidenceSummary {
  molecularOnlyLinkCount: number;
  epidemiologicOnlyLinkCount: number;
  duoLinkCount: number;
  unclassifiedLinkCount: number;
}

export interface NetworkStatisticsNarrativeSection {
  heading: string;
  text: string;
}

export interface NetworkStatisticsNarrative {
  headline: string;
  calculationMode: string;
  sections: NetworkStatisticsNarrativeSection[];
  caveat: string;
  methodology: string[];
}

export interface NetworkStatisticsNarrativeOptions {
  layerLabel?: string;
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

export interface NetworkStatisticsExportSection {
  sheetName: string;
  csvTitle: string;
  rows: any[][];
}

interface GraphBuildResult {
  nodeIds: string[];
  selectedNodeIds: Set<string>;
  adjacency: Array<Set<number>>;
  edges: NetworkStatisticsGraphEdge[];
}

interface NetworkStatisticsGraphEdge {
  sourceIndex: number;
  targetIndex: number;
  hasMolecularEvidence: boolean;
  hasEpidemiologicEvidence: boolean;
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

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function summarizeLinkEvidence(edges: NetworkStatisticsGraphEdge[]): NetworkStatisticsLinkEvidenceSummary {
  return edges.reduce<NetworkStatisticsLinkEvidenceSummary>((summary, edge) => {
    if (edge.hasMolecularEvidence && edge.hasEpidemiologicEvidence) {
      summary.duoLinkCount++;
    } else if (edge.hasMolecularEvidence) {
      summary.molecularOnlyLinkCount++;
    } else if (edge.hasEpidemiologicEvidence) {
      summary.epidemiologicOnlyLinkCount++;
    } else {
      summary.unclassifiedLinkCount++;
    }
    return summary;
  }, {
    molecularOnlyLinkCount: 0,
    epidemiologicOnlyLinkCount: 0,
    duoLinkCount: 0,
    unclassifiedLinkCount: 0,
  });
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
  const edgeIndexByKey = new Map<string, number>();
  const edges: NetworkStatisticsGraphEdge[] = [];

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
    const existingEdgeIndex = edgeIndexByKey.get(key);
    if (existingEdgeIndex !== undefined) {
      const existingEdge = edges[existingEdgeIndex];
      existingEdge.hasMolecularEvidence ||= link.hasMolecularEvidence === true;
      existingEdge.hasEpidemiologicEvidence ||= link.hasEpidemiologicEvidence === true;
      return;
    }

    edgeIndexByKey.set(key, edges.length);
    adjacency[a].add(b);
    adjacency[b].add(a);
    edges.push({
      sourceIndex: a,
      targetIndex: b,
      hasMolecularEvidence: link.hasMolecularEvidence === true,
      hasEpidemiologicEvidence: link.hasEpidemiologicEvidence === true,
    });
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
  edges: NetworkStatisticsGraphEdge[]
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
  const linkEvidence = summarizeLinkEvidence(graph.edges);
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

  const componentMetrics = computeComponentStructureMetrics(
    componentsResult.components.map((component) => component.nodeCount),
    nodeCount,
  );
  const clusterCount = componentMetrics.clusterCount;
  const singletonCount = componentMetrics.singletonCount;
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
      componentMetrics,
      density: safeRatio(linkCount, nodeCount * (nodeCount - 1) / 2),
      averageDegree: safeRatio(degreeSum, nodeCount),
      medianDegree: median(degrees),
      maxDegree,
      averageLocalClusteringCoefficient: clustering.averageLocalClusteringCoefficient,
      transitivity: clustering.transitivity,
      averagePathLength: pathAndBetweenness.averagePathLength,
      diameter: pathAndBetweenness.diameter,
      approximateBetweenness: approximate,
      approximatePathMetrics: approximate,
      sampledSourceCount: pathAndBetweenness.sampledSourceCount,
      metricLabel: request.metricLabel || '',
      threshold: request.threshold ?? null,
      linkEvidence,
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

function narrativePlural(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

function formatNarrativeNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return '0';
  }
  if (Number.isInteger(value)) {
    return String(value);
  }
  return String(Number(value.toFixed(3)));
}

function formatNarrativePercent(value: number): string {
  const percentage = Number.isFinite(value) ? value * 100 : 0;
  return `${Number(percentage.toFixed(1))}%`;
}

function formatNarrativeNodeIds(nodeIds: string[]): string {
  if (nodeIds.length === 1) {
    return `Node ${nodeIds[0]}`;
  }
  if (nodeIds.length === 2) {
    return `Nodes ${nodeIds[0]} and ${nodeIds[1]}`;
  }
  if (nodeIds.length === 3) {
    return `Nodes ${nodeIds[0]}, ${nodeIds[1]}, and ${nodeIds[2]}`;
  }
  return `${nodeIds.length} nodes`;
}

function describeCentralityLeaders(
  rows: NetworkStatisticsCentralityRow[],
  field: 'degree' | 'betweenness',
  label: string,
): string {
  const maximum = rows.reduce((value, row) => Math.max(value, row[field]), 0);
  if (maximum <= 0) {
    return '';
  }

  const leaderIds = rows
    .filter((row) => row[field] === maximum)
    .map((row) => row.nodeId)
    .sort((a, b) => a.localeCompare(b));
  const subject = formatNarrativeNodeIds(leaderIds);
  const value = formatNarrativeNumber(maximum);

  return leaderIds.length === 1
    ? `${subject} has the highest ${label} (${value}).`
    : `${subject} tie for the highest ${label} (${value}).`;
}

function buildNetworkHeadline(summary: NetworkStatisticsSummary, layerLabel: string): string {
  const networkLabel = layerLabel ? `visible ${layerLabel.toLowerCase()} network` : 'visible network';
  if (summary.nodeCount === 0) {
    return `No ${networkLabel} is available to interpret.`;
  }
  if (summary.linkCount === 0) {
    return summary.nodeCount === 1
      ? `The ${networkLabel} contains one isolated node.`
      : `The ${networkLabel} contains ${summary.nodeCount} isolated nodes and no links.`;
  }
  if (summary.componentCount === 1) {
    return `All ${summary.nodeCount} nodes in the ${networkLabel} are connected in one component.`;
  }

  const largestClusterFraction = summary.componentMetrics.largestClusterFraction;
  const largestClusterPercent = formatNarrativePercent(largestClusterFraction);
  if (largestClusterFraction >= 0.75) {
    return `Most nodes in the ${networkLabel} are concentrated in one component (${largestClusterPercent}), with the remainder split across ${summary.componentCount - 1} other ${narrativePlural(summary.componentCount - 1, 'component')}.`;
  }
  if (largestClusterFraction >= 0.5) {
    return `The ${networkLabel} is split across ${summary.componentCount} components; the largest component contains ${largestClusterPercent} of visible nodes.`;
  }
  return `The ${networkLabel} is highly fragmented across ${summary.componentCount} components; the largest component contains ${largestClusterPercent} of visible nodes.`;
}

function describeEvidenceComposition(summary: NetworkStatisticsSummary): string {
  const evidence = summary.linkEvidence;
  const evidenceParts = [
    `${evidence.molecularOnlyLinkCount} molecular-only (${formatNarrativePercent(safeRatio(evidence.molecularOnlyLinkCount, summary.linkCount))})`,
    `${evidence.epidemiologicOnlyLinkCount} epidemiologic-only (${formatNarrativePercent(safeRatio(evidence.epidemiologicOnlyLinkCount, summary.linkCount))})`,
    `${evidence.duoLinkCount} ${narrativePlural(evidence.duoLinkCount, 'duo-link')} (${formatNarrativePercent(safeRatio(evidence.duoLinkCount, summary.linkCount))})`,
  ];
  if (evidence.unclassifiedLinkCount > 0) {
    evidenceParts.push(`${evidence.unclassifiedLinkCount} unclassified (${formatNarrativePercent(safeRatio(evidence.unclassifiedLinkCount, summary.linkCount))})`);
  }

  const classifiedCategories = [
    { label: 'Molecular-only links', count: evidence.molecularOnlyLinkCount },
    { label: 'Epidemiologic-only links', count: evidence.epidemiologicOnlyLinkCount },
    { label: 'Duo-links', count: evidence.duoLinkCount },
  ];
  const largestCount = classifiedCategories.reduce((maximum, category) => Math.max(maximum, category.count), 0);
  const leaders = classifiedCategories.filter((category) => category.count === largestCount && category.count > 0);
  const compositionText = leaders.length === 1
    ? `${leaders[0].label} are the largest evidence category.`
    : 'No single classified evidence category is largest.';
  const overlapText = evidence.duoLinkCount > 0
    ? `Molecular and epidemiologic evidence overlap on ${evidence.duoLinkCount} visible ${narrativePlural(evidence.duoLinkCount, 'pair')}.`
    : 'No visible node pair is supported by both molecular and epidemiologic evidence.';

  return `The visible links include ${evidenceParts.join(', ')}. ${compositionText} ${overlapText} Each visible node pair counts as one link, including a duo-link.`;
}

export function buildNetworkStatisticsNarrative(
  result: NetworkStatisticsResult,
  options: NetworkStatisticsNarrativeOptions = {},
): NetworkStatisticsNarrative {
  const summary = result.summary;
  const layerLabel = options.layerLabel || '';
  const sections: NetworkStatisticsNarrativeSection[] = [];
  const nodeLabel = narrativePlural(summary.nodeCount, 'node');
  const linkLabel = narrativePlural(summary.linkCount, 'link');

  let connectivityText: string;
  if (summary.nodeCount === 0) {
    connectivityText = 'There are no visible nodes to summarize.';
  } else if (summary.linkCount === 0) {
    const verb = summary.nodeCount === 1 ? 'has' : 'have';
    connectivityText = `${summary.nodeCount} visible ${nodeLabel} ${verb} no visible links. All visible nodes are singletons.`;
  } else {
    const componentLabel = narrativePlural(summary.componentCount, 'connected component');
    const singletonText = summary.singletonCount === 0
      ? 'No visible nodes are singletons.'
      : `${summary.singletonCount} visible ${narrativePlural(summary.singletonCount, 'node')} (${formatNarrativePercent(summary.componentMetrics.singletonFraction)}) ${summary.singletonCount === 1 ? 'is' : 'are'} ${narrativePlural(summary.singletonCount, 'a singleton', 'singletons')}.`;
    const largestClusterText = summary.componentMetrics.largestClusterSize > 0
      ? `The largest non-singleton component contains ${summary.componentMetrics.largestClusterSize} ${narrativePlural(summary.componentMetrics.largestClusterSize, 'node')} (${formatNarrativePercent(summary.componentMetrics.largestClusterFraction)} of visible nodes).`
      : 'There are no non-singleton components.';
    connectivityText = `${summary.nodeCount} visible ${nodeLabel} and ${summary.linkCount} visible ${linkLabel} form ${summary.componentCount} ${componentLabel}. ${singletonText} ${largestClusterText}`;
  }
  sections.push({ heading: 'Connectivity', text: connectivityText });

  if (summary.linkCount > 0) {
    const pathPrefix = summary.approximatePathMetrics ? 'Sampled calculations estimate' : 'The network has';
    const dyadCount = result.components.filter((component) => component.nodeCount === 2).length;
    const tightlyConnectedComponentCount = result.components.filter((component) => (
      component.nodeCount >= 3 && component.density >= 0.75
    )).length;
    const shapeParts = [
      dyadCount > 0
        ? `${dyadCount} ${narrativePlural(dyadCount, 'component is a two-node dyad', 'components are two-node dyads')}.`
        : '',
      tightlyConnectedComponentCount > 0
        ? `${tightlyConnectedComponentCount} ${narrativePlural(tightlyConnectedComponentCount, 'component has', 'components have')} density of at least 75%.`
        : '',
    ].filter(Boolean).join(' ');
    const degreeLeaderText = describeCentralityLeaders(result.centrality, 'degree', 'degree');
    const betweennessLeaderText = describeCentralityLeaders(result.centrality, 'betweenness', 'betweenness');
    sections.push({
      heading: 'Network structure',
      text: `Visible links connect ${formatNarrativePercent(summary.density)} of all possible node pairs, with a mean degree of ${formatNarrativeNumber(summary.averageDegree)}, median degree of ${formatNarrativeNumber(summary.medianDegree)}, and transitivity of ${formatNarrativeNumber(summary.transitivity)}. ${pathPrefix} an average reachable path length of ${formatNarrativeNumber(summary.averagePathLength)} links and a diameter of ${formatNarrativeNumber(summary.diameter)} links. ${shapeParts} ${degreeLeaderText} ${betweennessLeaderText}`.replace(/\s+/g, ' ').trim(),
    });

    sections.push({
      heading: 'Link evidence',
      text: describeEvidenceComposition(summary),
    });
  }

  const calculationMode = summary.approximateBetweenness || summary.approximatePathMetrics
    ? `Sampled path and betweenness metrics from ${summary.sampledSourceCount} source ${narrativePlural(summary.sampledSourceCount, 'node')}`
    : 'Exact calculation';

  return {
    headline: buildNetworkHeadline(summary, layerLabel),
    calculationMode,
    sections,
    caveat: `Only currently visible nodes and links${layerLabel ? ` in the ${layerLabel.toLowerCase()} layer` : ''} are included, so filters, thresholds, hidden link layers, and incomplete data can change the result. Relationships are analyzed as an unweighted, undirected network. Structural prominence and evidence overlap identify patterns for review; they do not establish transmission direction or causality.`,
    methodology: [
      `Scope: ${summary.nodeCount} visible ${nodeLabel} and ${summary.linkCount} unique, unordered node ${narrativePlural(summary.linkCount, 'pair')} are included. Parallel records for the same pair are combined, and a pair with both evidence types counts once as a duo-link.`,
      'Headline: one component is described as connected. Otherwise, the network is described as concentrated when at least 75% of visible nodes are in the largest component, split when 50% to less than 75% are in it, and highly fragmented when less than 50% are in it.',
      'Structure: density is the fraction of all possible node pairs with a visible link. A dyad is a two-node component. A tightly connected component has at least three nodes and density of 75% or more.',
      'Prominence: degree counts a node\'s visible neighbors. Betweenness measures how often a node lies on shortest paths between other visible nodes. These are structural measures, not measures of transmission risk.',
      summary.approximatePathMetrics || summary.approximateBetweenness
        ? `Sampling: path length, diameter, and betweenness are estimated from ${summary.sampledSourceCount} source ${narrativePlural(summary.sampledSourceCount, 'node')}; all other displayed metrics are exact for the visible network.`
        : 'Calculation mode: all displayed metrics are calculated exactly for the visible network.',
    ],
  };
}

function csvEscape(value: any): string {
  if (value === null || value === undefined) {
    return '';
  }

  const text = Array.isArray(value) ? value.join('|') : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvRow(values: any[]): string {
  return values.map((value) => csvEscape(value)).join(',');
}

function yesNo(value: boolean): string {
  return value ? 'Yes' : 'No';
}

export function buildNetworkStatisticsExportSections(result: NetworkStatisticsResult): NetworkStatisticsExportSection[] {
  const summary = result.summary;
  const narrative = buildNetworkStatisticsNarrative(result);
  const clusterRows = result.components.filter((component) => component.nodeCount > 1);
  const largestClusterSize = result.components
    .filter((component) => component.nodeCount > 1)
    .reduce((largest, component) => Math.max(largest, component.nodeCount), 0);
  const calculationMode = summary.approximateBetweenness || summary.approximatePathMetrics
    ? `Approximate sampled metrics from ${summary.sampledSourceCount} source nodes`
    : 'Exact';

  return [
    {
      sheetName: 'Summary',
      csvTitle: 'Network Statistics Summary',
      rows: [
        ['Metric', 'Value'],
        ['Nodes', summary.nodeCount],
        ['Links', summary.linkCount],
        ['Molecular-only Links', summary.linkEvidence.molecularOnlyLinkCount],
        ['Epidemiologic-only Links', summary.linkEvidence.epidemiologicOnlyLinkCount],
        ['Duo-links', summary.linkEvidence.duoLinkCount],
        ['Unclassified Links', summary.linkEvidence.unclassifiedLinkCount],
        ['Selected Nodes', summary.selectedNodeCount],
        ['Non-singleton Components', summary.clusterCount],
        ['Singletons', summary.singletonCount],
        ['Largest Component', largestClusterSize],
        ['Largest Component Fraction (L1)', summary.componentMetrics.largestClusterFraction],
        ['Second-largest Component', summary.componentMetrics.secondLargestClusterSize],
        ['Second-largest Component Fraction (L2)', summary.componentMetrics.secondLargestClusterFraction],
        ['Connected-node Fraction', summary.componentMetrics.clusteredFraction],
        ['Singleton Fraction', summary.componentMetrics.singletonFraction],
        ['Component-size Gini', summary.componentMetrics.giniCoefficient],
        ['Mean Non-singleton Component Size', summary.componentMetrics.meanClusterSize],
        ['Median Non-singleton Component Size', summary.componentMetrics.medianClusterSize],
        ['Largest / Mean Component Size', summary.componentMetrics.largestToMeanClusterRatio],
        ['Largest / Median Component Size', summary.componentMetrics.largestToMedianClusterRatio],
        ['L2 / L1', summary.componentMetrics.l2ToL1Ratio],
        ['Density', summary.density],
        ['Average Degree', summary.averageDegree],
        ['Median Degree', summary.medianDegree],
        ['Max Degree', summary.maxDegree],
        ['Average Local Clustering', summary.averageLocalClusteringCoefficient],
        ['Transitivity', summary.transitivity],
        ['Average Reachable Path Length', summary.averagePathLength],
        ['Diameter', summary.diameter],
        ['Distance Metric', summary.metricLabel],
        ['Threshold', summary.threshold],
        ['Calculation Mode', calculationMode],
        ['Generated At', result.generatedAtIso],
      ],
    },
    {
      sheetName: 'Degree Distribution',
      csvTitle: 'Degree Distribution',
      rows: [
        ['Degree', 'Node Count', 'Fraction'],
        ...result.degreeDistribution.map((row) => [
          row.degree,
          row.nodeCount,
          row.fraction,
        ]),
      ],
    },
    {
      sheetName: 'Node Centrality',
      csvTitle: 'Node Centrality',
      rows: [
        [
          'Node ID',
          'Component ID',
          'Degree',
          'Normalized Degree',
          'Betweenness',
          'Normalized Betweenness',
        ],
        ...result.centrality.map((row) => [
          row.nodeId,
          row.componentId,
          row.degree,
          row.normalizedDegree,
          row.betweenness,
          row.normalizedBetweenness,
        ]),
      ],
    },
    {
      sheetName: 'Components',
      csvTitle: 'Components',
      rows: [
        [
          'Component ID',
          'Node Count',
          'Link Count',
          'Density',
          'Average Degree',
          'Max Degree',
          'Diameter',
          'Diameter Approximate',
          'Member IDs',
        ],
        ...clusterRows.map((row) => [
          row.componentId,
          row.nodeCount,
          row.linkCount,
          row.density,
          row.averageDegree,
          row.maxDegree,
          row.diameter,
          yesNo(row.diameterApproximate),
          row.memberIds.join('|'),
        ]),
      ],
    },
    {
      sheetName: 'Interpretation',
      csvTitle: 'Network Interpretation',
      rows: [
        ['Section', 'Interpretation'],
        ['Headline', narrative.headline],
        ['Calculation mode', narrative.calculationMode],
        ...narrative.sections.map((section) => [section.heading, section.text]),
        ['Interpretation limits', narrative.caveat],
        ...narrative.methodology.map((method, index) => [`Calculation detail ${index + 1}`, method]),
      ],
    },
  ];
}

export function serializeNetworkStatisticsCsv(result: NetworkStatisticsResult): string {
  const lines = buildNetworkStatisticsExportSections(result).flatMap((section, index) => [
    ...(index === 0 ? [] : ['']),
    section.csvTitle,
    ...section.rows.map((row) => csvRow(row)),
  ]);

  return lines.join('\r\n');
}
