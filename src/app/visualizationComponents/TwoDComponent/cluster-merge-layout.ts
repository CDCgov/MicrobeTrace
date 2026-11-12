import { hierarchy } from 'd3';

export interface ClusterGeneticEdge {
  source: string;
  target: string;
  distance: number;
}

export interface ClusterMergeLink extends ClusterGeneticEdge {
  sourceNodeId: string;
  targetNodeId: string;
}

/** Contract samples into their displayed clusters, retain the closest observed
 * member pair for each pair of clusters, and build a single-linkage merge forest.
 * A genetic MST supplies the same threshold merge hierarchy as the full matrix.
 * These are layout constraints only; they never become analytical/display links.
 */
export function buildClusterMergeBackbone(
  clusters: Array<{ id: string; nodeIds: string[] }>,
  geneticEdges: readonly ClusterGeneticEdge[],
): ClusterMergeLink[] {
  const clusterByNode = new Map<string, number>();
  clusters.forEach((cluster, index) => cluster.nodeIds.forEach(id => clusterByNode.set(id, index)));
  const closest = new Map<string, ClusterMergeLink>();
  for (const edge of geneticEdges) {
    if (typeof edge.distance !== 'number' || !Number.isFinite(edge.distance) || edge.distance < 0) continue;
    let left = clusterByNode.get(edge.source);
    let right = clusterByNode.get(edge.target);
    if (left === undefined || right === undefined || left === right) continue;
    let sourceNodeId = edge.source;
    let targetNodeId = edge.target;
    if (left > right) {
      [left, right] = [right, left];
      [sourceNodeId, targetNodeId] = [targetNodeId, sourceNodeId];
    }
    const key = `${left}:${right}`;
    const previous = closest.get(key);
    if (!previous || edge.distance < previous.distance || (edge.distance === previous.distance
      && JSON.stringify([sourceNodeId, targetNodeId]) < JSON.stringify([previous.sourceNodeId, previous.targetNodeId]))) {
      closest.set(key, { source: clusters[left].id, target: clusters[right].id, distance: edge.distance, sourceNodeId, targetNodeId });
    }
  }
  const ranked = [...closest.values()].sort((a, b) => a.distance - b.distance
    || a.source.localeCompare(b.source) || a.target.localeCompare(b.target));
  const parent = new Map(clusters.map(cluster => [cluster.id, cluster.id]));
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
  return ranked.filter(edge => {
    const left = find(edge.source);
    const right = find(edge.target);
    if (left === right) return false;
    parent.set(right, left);
    return true;
  });
}
interface MergeTreeNode {
  id: string;
  radius?: number;
  distance?: number;
  children?: MergeTreeNode[];
  joins?: ClusterMergeLink[];
}

interface PackedCluster {
  id: string;
  x: number;
  y: number;
  radius: number;
}

interface PackedFamily {
  points: PackedCluster[];
  byId: Map<string, PackedCluster>;
  bounds: { left: number; right: number; top: number; bottom: number };
}

/** Join occupied cluster footprints, rather than reserving an enclosing circle
 * at every merge level. The latter compounds empty space in deep hierarchies.
 * Each candidate moves one intact family in from outside until its first contact
 * with another footprint, keeping the required gap between every cluster pair.
 */
function packMergeFamilies(children: PackedFamily[], joins: ClusterMergeLink[], gap: number): PackedFamily {
  const [placed, ...remaining] = children;
  while (remaining.length) {
    const crosses = (edge: ClusterMergeLink, family: PackedFamily) => (
      placed.byId.has(edge.source) && family.byId.has(edge.target)
    ) || (placed.byId.has(edge.target) && family.byId.has(edge.source));
    const connected = remaining.findIndex(family => joins.some(edge => crosses(edge, family)));
    const next = remaining.splice(Math.max(0, connected), 1)[0];
    const edge = joins.find(edge => crosses(edge, next));
    const leftAnchor = edge
      ? placed.byId.get(placed.byId.has(edge.source) ? edge.source : edge.target)!
      : { x: (placed.bounds.left + placed.bounds.right) / 2, y: (placed.bounds.top + placed.bounds.bottom) / 2, radius: 0 };
    const rightAnchor = edge
      ? next.byId.get(next.byId.has(edge.source) ? edge.source : edge.target)!
      : { x: (next.bounds.left + next.bounds.right) / 2, y: (next.bounds.top + next.bounds.bottom) / 2, radius: 0 };
    const baseX = leftAnchor.x - rightAnchor.x;
    const baseY = leftAnchor.y - rightAnchor.y;
    // A shared direction grid stacks successive additions into radial spokes.
    // Stagger it by family identity, keeping placement deterministic on reload.
    let angleHash = 2166136261;
    for (const char of next.points[0].id) angleHash = Math.imul(angleHash ^ char.charCodeAt(0), 16777619);
    angleHash = Math.imul(angleHash ^ (angleHash >>> 16), 0x7feb352d);
    angleHash = Math.imul(angleHash ^ (angleHash >>> 15), 0x846ca68b);
    angleHash ^= angleHash >>> 16;
    const angleOffset = (angleHash >>> 0) / 4294967296 * Math.PI * 2;
    let best: { x: number; y: number; score: number; bounds: PackedFamily['bounds'] } | undefined;
    for (let direction = 0; direction < 16; direction++) {
      const angle = angleOffset + direction * Math.PI / 8;
      const ux = Math.cos(angle), uy = Math.sin(angle);
      let separation = 0;
      for (const left of placed.points) {
        for (const right of next.points) {
          const dx = right.x + baseX - left.x;
          const dy = right.y + baseY - left.y;
          const perpendicular = dx * uy - dy * ux;
          const radius = left.radius + right.radius + gap;
          if (Math.abs(perpendicular) >= radius) continue;
          separation = Math.max(separation, -(dx * ux + dy * uy)
            + Math.sqrt(Math.max(0, radius * radius - perpendicular * perpendicular)));
        }
      }
      const x = baseX + ux * separation, y = baseY + uy * separation;
      const bounds = {
        left: Math.min(placed.bounds.left, next.bounds.left + x),
        right: Math.max(placed.bounds.right, next.bounds.right + x),
        top: Math.min(placed.bounds.top, next.bounds.top + y),
        bottom: Math.max(placed.bounds.bottom, next.bounds.bottom + y),
      };
      const width = bounds.right - bounds.left, height = bounds.bottom - bounds.top;
      const mergeGap = edge ? Math.max(0, separation - leftAnchor.radius - rightAnchor.radius) : 0;
      const score = Math.sqrt(width * height) + Math.max(width, height) * 0.8 + mergeGap * 0.5;
      if (!best || score < best.score) best = { x, y, score, bounds };
    }
    for (const point of next.points) {
      const translated = { ...point, x: point.x + best!.x, y: point.y + best!.y };
      placed.points.push(translated);
      placed.byId.set(point.id, translated);
    }
    placed.bounds = best!.bounds;
  }
  return placed;
}

/** Pack a closest-pair merge hierarchy. Equal-distance events are combined in
 * one level, so ties do not create an arbitrary chain of nested binary merges.
 * Cluster radii reserve space; genetic distances control gaps between families.
 */
export function positionClusterMergeHierarchy(
  clusters: Array<{ id: string; radius: number; x: number; y: number }>,
  mergeLinks: readonly ClusterMergeLink[],
  gap: number,
  linkLength: number,
): Map<string, { x: number; y: number }> {
  if (!clusters.length || !mergeLinks.length) return new Map();
  const parent = new Map(clusters.map(cluster => [cluster.id, cluster.id]));
  const trees = new Map<string, MergeTreeNode>(clusters.map(cluster => [cluster.id, {
    id: cluster.id, radius: Math.max(1, cluster.radius),
  }]));
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    while (id !== root) { const next = parent.get(id)!; parent.set(id, root); id = next; }
    return root;
  };
  const ranked = [...mergeLinks].sort((a, b) => a.distance - b.distance || a.source.localeCompare(b.source) || a.target.localeCompare(b.target));
  let index = 0;
  let sequence = 0;
  while (index < ranked.length) {
    const distance = ranked[index].distance;
    const adjacency = new Map<string, Set<string>>();
    const levelJoins: Array<{ left: string; right: string; edge: ClusterMergeLink }> = [];
    while (index < ranked.length && ranked[index].distance === distance) {
      const edge = ranked[index++];
      const left = find(edge.source);
      const right = find(edge.target);
      if (left === right) continue;
      levelJoins.push({ left, right, edge });
      if (!adjacency.has(left)) adjacency.set(left, new Set());
      if (!adjacency.has(right)) adjacency.set(right, new Set());
      adjacency.get(left)!.add(right);
      adjacency.get(right)!.add(left);
    }
    const visited = new Set<string>();
    for (const start of [...adjacency.keys()].sort()) {
      if (visited.has(start)) continue;
      const members: string[] = [];
      const pending = [start];
      visited.add(start);
      while (pending.length) {
        const member = pending.pop()!;
        members.push(member);
        adjacency.get(member)!.forEach(neighbor => {
          if (!visited.has(neighbor)) { visited.add(neighbor); pending.push(neighbor); }
        });
      }
      members.sort();
      const memberIds = new Set(members);
      const merged = { id: `merge:${sequence++}`, distance, children: members.map(id => trees.get(id)!),
        joins: levelJoins.filter(join => memberIds.has(join.left) && memberIds.has(join.right)).map(join => join.edge) };
      members.forEach(id => { parent.set(id, members[0]); trees.delete(id); });
      trees.set(members[0], merged);
    }
  }
  const firstDistance = ranked[0].distance;
  const span = ranked[Math.floor((ranked.length - 1) * 0.9)].distance - firstDistance || firstDistance || 1;
  const root = hierarchy<MergeTreeNode>({ id: 'root', children: [...trees.values()] })
    .sum(node => node.radius ? node.radius ** 2 : 0)
    .sort((a, b) => (b.value || 0) - (a.value || 0) || a.data.id.localeCompare(b.data.id));
  const families = new Map<string, PackedFamily>();
  root.eachAfter(node => {
    if (!node.children?.length) {
      const radius = node.data.radius!;
      const point = { id: node.data.id, x: 0, y: 0, radius };
      families.set(node.data.id, { points: [point], byId: new Map([[point.id, point]]),
        bounds: { left: -radius, right: radius, top: -radius, bottom: radius } });
      return;
    }
    const clearance = node.data.distance === undefined ? gap * 2
      : gap + linkLength * 0.5 * Math.min(2, Math.log1p(Math.max(0, node.data.distance - firstDistance) / span));
    const family = packMergeFamilies(node.children.map(child => families.get(child.data.id)!), node.data.joins || [], clearance);
    node.children.forEach(child => families.delete(child.data.id));
    families.set(node.data.id, family);
  });
  const packed = families.get('root')!.byId;
  const targetX = clusters.reduce((sum, cluster) => sum + packed.get(cluster.id)!.x, 0) / clusters.length;
  const targetY = clusters.reduce((sum, cluster) => sum + packed.get(cluster.id)!.y, 0) / clusters.length;
  const currentX = clusters.reduce((sum, cluster) => sum + cluster.x, 0) / clusters.length;
  const currentY = clusters.reduce((sum, cluster) => sum + cluster.y, 0) / clusters.length;
  // Align rotation/reflection to the current view without shrinking footprints.
  const candidates = [1, -1].map(reflection => {
    let dot = 0;
    let cross = 0;
    for (const cluster of clusters) {
      const point = packed.get(cluster.id)!;
      const px = (point.x - targetX) * reflection;
      const py = point.y - targetY;
      const qx = cluster.x - currentX;
      const qy = cluster.y - currentY;
      dot += px * qx + py * qy;
      cross += px * qy - py * qx;
    }
    return { reflection, angle: Math.atan2(cross, dot), fit: Math.hypot(dot, cross) };
  });
  const orientation = candidates.sort((a, b) => b.fit - a.fit)[0];
  const cos = Math.cos(orientation.angle);
  const sin = Math.sin(orientation.angle);
  return new Map(clusters.map(cluster => {
    const point = packed.get(cluster.id)!;
    const x = (point.x - targetX) * orientation.reflection;
    const y = point.y - targetY;
    return [cluster.id, { x: currentX + x * cos - y * sin, y: currentY + x * sin + y * cos }];
  }));
}
