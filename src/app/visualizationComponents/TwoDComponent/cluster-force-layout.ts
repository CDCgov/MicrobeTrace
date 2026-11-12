import * as d3 from 'd3';
import { buildClusterMergeBackbone, positionClusterMergeHierarchy, type ClusterGeneticEdge } from './cluster-merge-layout';

interface ClusterForceLayoutOptions {
  linkLength: number;
  nodeRadius: (node: any) => number;
  groupBy?: (node: any) => string | null;
  preserveCenters: boolean;
  geneticEdges?: readonly ClusterGeneticEdge[];
  anchoredNodeIds?: ReadonlySet<string>;
  ticks: number;
  runTicks: (simulation: { tick: (ticks: number) => unknown }, ticks: number) => Promise<unknown>;
}

const nodeId = (node: any): string => String(node._id ?? node.id);
const endpointId = (endpoint: any): string => typeof endpoint === 'object' && endpoint !== null
  ? nodeId(endpoint) : String(endpoint);
const hasPosition = (node: any): boolean => node.x != null && node.y != null
  && Number.isFinite(Number(node.x)) && Number.isFinite(Number(node.y));

/** Lay out whole components first, then settle their members around those centers.
 * Full visible links determine membership; a reduced layout backbone must not
 * split a real component. All simulations work on copies of the analytical data.
 */
export async function layoutClusterForces(
  nodes: any[],
  links: any[],
  layoutLinks: any[],
  options: ClusterForceLayoutOptions,
): Promise<{ applied: boolean; clusters: number; mergeLinks: number }> {
  if (!nodes.length) return { applied: false, clusters: 0, mergeLinks: 0 };
  const parent = new Map(nodes.map(node => [nodeId(node), nodeId(node)]));
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    while (id !== root) {
      const next = parent.get(id)!;
      parent.set(id, root);
      id = next;
    }
    return root;
  };
  for (const link of links) {
    const source = endpointId(link.source);
    const target = endpointId(link.target);
    if (parent.has(source) && parent.has(target)) parent.set(find(target), find(source));
  }
  const buckets = new Map<string, any[]>();
  for (const node of nodes) {
    const id = nodeId(node);
    const group = options.groupBy?.(node);
    const key = group == null ? `component:${find(id)}` : `group:${group}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(node);
  }
  // Keep the dense, single-component overview and its distance cohorts available.
  if (buckets.size < 2) return { applied: false, clusters: buckets.size, mergeLinks: 0 };

  const linkLength = Math.max(1, Number(options.linkLength) || 50);
  const gap = Math.max(16, linkLength * 0.4);
  const clusters = Array.from(buckets, ([id, members]) => {
    const positioned = members.filter(hasPosition);
    const originX = positioned.reduce((sum, node) => sum + Number(node.x), 0) / (positioned.length || 1);
    const originY = positioned.reduce((sum, node) => sum + Number(node.y), 0) / (positioned.length || 1);
    const count = members.reduce((sum, node) => sum + (node.isCollapsedAggregate
      ? Math.max(1, Number(node.totalCount) || 1) : 1), 0);
    const largestNode = members.reduce((radius, node) => Math.max(radius, options.nodeRadius(node)), 1);
    return {
      id, members, originX, originY, count,
      x: positioned.length ? originX : undefined,
      y: positioned.length ? originY : undefined,
      radius: largestNode + (members.length > 1 ? linkLength * 0.45 * Math.sqrt(count) : 0),
      localNodes: [] as any[],
      links: [] as any[],
      fx: undefined as number | undefined,
      fy: undefined as number | undefined,
    };
  });
  const clusterByNode = new Map<string, typeof clusters[number]>();
  clusters.forEach(cluster => cluster.members.forEach(node => clusterByNode.set(nodeId(node), cluster)));
  layoutLinks.forEach(link => {
    const source = endpointId(link.source);
    const target = endpointId(link.target);
    const cluster = clusterByNode.get(source);
    if (cluster && cluster === clusterByNode.get(target)) cluster.links.push({ ...link, source, target });
  });

  const mergeLinks = buildClusterMergeBackbone(clusters.map(cluster => ({
    id: cluster.id,
    nodeIds: cluster.members.flatMap(node => [nodeId(node), ...(node.collapsedMemberIds || []).map(String)]),
  })), options.geneticEdges || []);
  const mergeAware = mergeLinks.length > 0;
  const mergeTargets = () => positionClusterMergeHierarchy(clusters.map(cluster => ({
    id: cluster.id, radius: cluster.radius, x: cluster.originX, y: cluster.originY,
  })), mergeLinks, gap, linkLength);
  if (mergeAware) {
    clusters.forEach(cluster => {
      if (cluster.members.some(node => options.anchoredNodeIds?.has(nodeId(node))
        || node.collapsedMemberIds?.some((id: string) => options.anchoredNodeIds?.has(String(id))))) {
        cluster.fx = cluster.originX;
        cluster.fy = cluster.originY;
      }
    });
  }

  const centers = d3.forceSimulation(clusters)
    .force('charge', options.preserveCenters || mergeAware ? null : d3.forceManyBody().strength((cluster: any) => -30 * Math.sqrt(cluster.count)))
    .force('collide', d3.forceCollide((cluster: any) => cluster.radius + gap / 2).iterations(4))
    .stop();
  if (mergeAware) {
    const targets = mergeTargets();
    centers.force('x', d3.forceX((cluster: any) => targets.get(cluster.id)!.x).strength(0.4))
      .force('y', d3.forceY((cluster: any) => targets.get(cluster.id)!.y).strength(0.4));
  } else if (options.preserveCenters) {
    centers.force('x', d3.forceX((cluster: any) => cluster.originX).strength(0.08))
      .force('y', d3.forceY((cluster: any) => cluster.originY).strength(0.08));
  }
  await options.runTicks(centers, 120);

  const memberSimulations = clusters.filter(cluster => cluster.members.length > 1).map(cluster => {
    cluster.localNodes = cluster.members.map(node => ({
      id: nodeId(node),
      x: hasPosition(node) ? Number(node.x) - cluster.originX : undefined,
      y: hasPosition(node) ? Number(node.y) - cluster.originY : undefined,
      radius: options.nodeRadius(node),
    }));
    return d3.forceSimulation(cluster.localNodes)
      .force('charge', d3.forceManyBody().strength(-30 * (linkLength / 50) ** 2))
      .force('link', d3.forceLink(cluster.links).id((node: any) => node.id).distance(linkLength))
      .force('center', d3.forceCenter(0, 0))
      .force('collide', d3.forceCollide((node: any) => node.radius).iterations(2))
      .force('x', d3.forceX(0).strength(0.05))
      .force('y', d3.forceY(0).strength(0.05))
      .stop();
  });
  // Yield by tick batches, rather than once per cluster, even with thousands of clusters.
  await options.runTicks({ tick: ticks => memberSimulations.forEach(simulation => simulation.tick(ticks)) }, options.ticks);

  for (const cluster of clusters) {
    if (!cluster.localNodes.length) {
      cluster.localNodes = [{ id: nodeId(cluster.members[0]), x: 0, y: 0, radius: options.nodeRadius(cluster.members[0]) }];
    }
    const meanX = cluster.localNodes.reduce((sum, node) => sum + node.x, 0) / cluster.localNodes.length;
    const meanY = cluster.localNodes.reduce((sum, node) => sum + node.y, 0) / cluster.localNodes.length;
    cluster.localNodes.forEach(node => { node.x -= meanX; node.y -= meanY; });
    // Long chains can extend beyond the estimate. Separate their actual bounds too.
    cluster.radius = cluster.localNodes.reduce((radius, node) => Math.max(radius, Math.hypot(node.x, node.y) + node.radius), 0);
  }
  const settledCenters = new Map(clusters.map(cluster => [cluster.id, { x: cluster.x, y: cluster.y }]));
  centers.force('charge', null)
    .force('x', d3.forceX((cluster: any) => settledCenters.get(cluster.id)!.x!).strength(0.08))
    .force('y', d3.forceY((cluster: any) => settledCenters.get(cluster.id)!.y!).strength(0.08))
    .force('collide', d3.forceCollide((cluster: any) => cluster.radius + gap / 2).iterations(4))
    .alpha(1);
  if (mergeAware) {
    // Conflicting manual anchors must not force overlapping cluster footprints.
    const anchoredClusters = clusters.filter(cluster => cluster.fx !== undefined);
    anchoredClusters.forEach((left, index) => anchoredClusters.slice(index + 1).forEach(right => {
      if (left.fx !== undefined && right.fx !== undefined
        && Math.hypot(left.x! - right.x!, left.y! - right.y!) < left.radius + right.radius + gap) {
        right.fx = undefined;
        right.fy = undefined;
      }
    }));
    const targets = mergeTargets();
    centers.force('x', d3.forceX((cluster: any) => targets.get(cluster.id)!.x).strength(0.4))
      .force('y', d3.forceY((cluster: any) => targets.get(cluster.id)!.y).strength(0.4));
  }
  await options.runTicks(centers, 120);
  if (mergeAware) {
    // Readability wins over hierarchy targets: remove residual footprint overlaps.
    centers.force('x', null).force('y', null).alpha(1);
    await options.runTicks(centers, 80);
  }

  for (const cluster of clusters) {
    const localById = new Map(cluster.localNodes.map(node => [node.id, node]));
    cluster.members.forEach(node => {
      const local = localById.get(nodeId(node))!;
      Object.assign(node, { x: cluster.x! + local.x, y: cluster.y! + local.y, vx: 0, vy: 0 });
    });
  }
  return { applied: true, clusters: clusters.length, mergeLinks: mergeLinks.length };
}
