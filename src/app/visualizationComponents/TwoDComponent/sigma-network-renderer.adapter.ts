import Graph from 'graphology';
import Sigma from 'sigma';

export type SigmaEdgeDetailMode = 'overview' | 'detail' | 'all';

export interface SigmaPocNode {
  id: string;
  x: number;
  y: number;
  label: string;
  color: string;
  opacity: number;
  size: number;
  selected: boolean;
  group?: string | null;
  groupColor?: string;
  raw: any;
}

export interface SigmaPocLink {
  id: string;
  source: string;
  target: string;
  color: string;
  opacity: number;
  size: number;
  distance?: number;
  raw: any;
}

export interface SigmaPocGraphData {
  nodes: SigmaPocNode[];
  links: SigmaPocLink[];
  showGroupHulls: boolean;
}

export interface SigmaPocRenderSummary {
  residentNodeCount: number;
  residentLinkCount: number;
  drawnLinkCount: number;
  edgeDetailMode: SigmaEdgeDetailMode;
  edgeStride: number;
}

export interface SigmaPocCallbacks {
  onNodeSelectionChange?: (selectedNodeIds: Set<string>) => void;
  onNodeHover?: (node: SigmaPocNode | null, event?: MouseEvent | TouchEvent) => void;
  onNodeContextMenu?: (node: SigmaPocNode, event: MouseEvent) => void;
  onNodePositionChange?: (nodeId: string, position: { x: number; y: number }) => void;
  onSummaryChange?: (summary: SigmaPocRenderSummary) => void;
}

interface SigmaNodeAttributes extends Record<string, unknown> {
  x: number;
  y: number;
  label: string;
  color: string;
  opacity: number;
  size: number;
  selected: boolean;
  group: string | null;
  groupColor: string;
  raw: SigmaPocNode;
}

interface SigmaEdgeAttributes extends Record<string, unknown> {
  color: string;
  opacity: number;
  size: number;
  sourceId: string;
  targetId: string;
  stableBucket: number;
  isBackbone: boolean;
  raw: SigmaPocLink;
}

interface SigmaGroupHull {
  label: string;
  color: string;
  nodeIds: string[];
  points: Array<{ x: number; y: number }>;
  center: { x: number; y: number };
}

interface SigmaHullDragState {
  nodeIds: string[];
  startPointer: { x: number; y: number };
  startPositions: Map<string, { x: number; y: number }>;
}

interface SigmaViewportPoint {
  x: number;
  y: number;
}

interface SigmaGraphBounds {
  x: [number, number];
  y: [number, number];
}

interface SigmaRankedEdge {
  id: string;
  sourceId: string;
  targetId: string;
  distance: number;
  isBackbone: boolean;
}

const GROUP_PALETTE = [
  '#2563eb', '#7c3aed', '#db2777', '#ea580c', '#16a34a',
  '#0891b2', '#ca8a04', '#4f46e5', '#be123c', '#0f766e',
];

const normalizeEndpoint = (endpoint: any): string => String(
  endpoint && typeof endpoint === 'object'
    ? endpoint._id ?? endpoint.id ?? ''
    : endpoint ?? '',
);

const finiteDistance = (link: any): number => {
  const distance = Number(link?.distance);
  return Number.isFinite(distance) ? distance : Number.POSITIVE_INFINITY;
};

const stableHash = (value: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

/**
 * Picks a small, distance-ranked layout backbone without removing anything
 * from the analytical graph. The returned links are copies because d3-force
 * replaces source/target IDs with node objects while it runs.
 */
export function selectSigmaLayoutBackbone<T extends Record<string, any>>(
  links: T[],
  neighborsPerNode = 3,
): T[] {
  if (links.length <= 2500) return links.map(link => ({ ...link }));

  const ranked = [...links].sort((left, right) => {
    const distanceDelta = finiteDistance(left) - finiteDistance(right);
    if (distanceDelta !== 0) return distanceDelta;
    const leftKey = `${normalizeEndpoint(left.source)}\u0000${normalizeEndpoint(left.target)}\u0000${left.id ?? ''}`;
    const rightKey = `${normalizeEndpoint(right.source)}\u0000${normalizeEndpoint(right.target)}\u0000${right.id ?? ''}`;
    return stableHash(leftKey) - stableHash(rightKey) || leftKey.localeCompare(rightKey);
  });
  const degree = new Map<string, number>();
  const selected: T[] = [];
  const selectedKeys = new Set<string>();

  for (const link of ranked) {
    const source = normalizeEndpoint(link.source);
    const target = normalizeEndpoint(link.target);
    if (!source || !target || source === target) continue;

    const sourceDegree = degree.get(source) || 0;
    const targetDegree = degree.get(target) || 0;
    if (sourceDegree >= neighborsPerNode || targetDegree >= neighborsPerNode) continue;

    selected.push({ ...link, source, target });
    selectedKeys.add(String(link.id ?? `${source}\u0000${target}`));
    degree.set(source, sourceDegree + 1);
    degree.set(target, targetDegree + 1);
  }

  // A balanced greedy pass can strand a node in irregular graphs. Add only the
  // best missing ties needed for coverage, with a hard cap that prevents hubs.
  const hardDegreeCap = Math.max(2, neighborsPerNode * 2);
  for (const link of ranked) {
    const source = normalizeEndpoint(link.source);
    const target = normalizeEndpoint(link.target);
    const key = String(link.id ?? `${source}\u0000${target}`);
    if (selectedKeys.has(key)) continue;
    const sourceDegree = degree.get(source) || 0;
    const targetDegree = degree.get(target) || 0;
    if (sourceDegree > 0 && targetDegree > 0) continue;
    if (sourceDegree >= hardDegreeCap || targetDegree >= hardDegreeCap) continue;
    selected.push({ ...link, source, target });
    selectedKeys.add(key);
    degree.set(source, sourceDegree + 1);
    degree.set(target, targetDegree + 1);
  }

  return selected;
}

export interface SigmaOverviewLayoutResult {
  applied: boolean;
  cohortCount: number;
  method: 'group-by' | 'distance-cohorts' | 'unchanged';
}

/**
 * Places dense networks into readable cohort islands. An explicit Group By
 * field wins when it yields meaningful groups; otherwise the layout derives
 * only its geometry from the strongest (lowest-distance) decile of links.
 * No derived cohort is written back to session data or used by analytics.
 */
export function assignSigmaOverviewPositions<TNode extends Record<string, any>, TLink extends Record<string, any>>(
  nodes: TNode[],
  links: TLink[],
  groupField?: string | null,
): SigmaOverviewLayoutResult {
  if (nodes.length < 40 || links.length < 2500) {
    return { applied: false, cohortCount: 0, method: 'unchanged' };
  }

  const nodeById = new Map(nodes.map(node => [String(node._id ?? node.id ?? ''), node]));
  let method: SigmaOverviewLayoutResult['method'] = 'unchanged';
  let buckets = new Map<string, TNode[]>();

  if (groupField && groupField !== 'None') {
    for (const node of nodes) {
      const rawGroup = Array.isArray(node[groupField]) ? node[groupField][0] : node[groupField];
      const group = rawGroup == null ? '' : String(rawGroup).trim();
      if (!group || group.toLowerCase() === 'null') continue;
      const values = buckets.get(group) || [];
      values.push(node);
      buckets.set(group, values);
    }
    const groupedCount = Array.from(buckets.values()).reduce((sum, values) => sum + values.length, 0);
    if (buckets.size >= 2 && buckets.size <= 80 && groupedCount >= nodes.length * 0.6) {
      method = 'group-by';
      const ungrouped = nodes.filter(node => {
        const rawGroup = Array.isArray(node[groupField]) ? node[groupField][0] : node[groupField];
        const group = rawGroup == null ? '' : String(rawGroup).trim();
        return !group || group.toLowerCase() === 'null';
      });
      if (ungrouped.length) buckets.set('__ungrouped__', ungrouped);
    } else {
      buckets = new Map();
    }
  }

  if (method === 'unchanged') {
    const finiteDistances = links
      .map(link => finiteDistance(link))
      .filter(Number.isFinite)
      .sort((left, right) => left - right);
    if (finiteDistances.length === 0) {
      return { applied: false, cohortCount: 0, method: 'unchanged' };
    }
    const strongTieDistance = finiteDistances[Math.floor((finiteDistances.length - 1) * 0.1)];
    const parent = new Map<string, string>();
    const find = (nodeId: string): string => {
      const current = parent.get(nodeId) || nodeId;
      if (current === nodeId) return current;
      const root = find(current);
      parent.set(nodeId, root);
      return root;
    };
    const union = (left: string, right: string) => {
      const leftRoot = find(left);
      const rightRoot = find(right);
      if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot);
    };
    nodeById.forEach((_node, nodeId) => parent.set(nodeId, nodeId));
    for (const link of links) {
      if (finiteDistance(link) > strongTieDistance) continue;
      const source = normalizeEndpoint(link.source);
      const target = normalizeEndpoint(link.target);
      if (nodeById.has(source) && nodeById.has(target)) union(source, target);
    }

    const components = new Map<string, TNode[]>();
    nodeById.forEach((node, nodeId) => {
      const root = find(nodeId);
      const values = components.get(root) || [];
      values.push(node);
      components.set(root, values);
    });
    const minimumCohortSize = Math.max(3, Math.ceil(nodes.length * 0.01));
    const unclustered: TNode[] = [];
    components.forEach((values, key) => {
      if (values.length >= minimumCohortSize) buckets.set(key, values);
      else unclustered.push(...values);
    });
    if (unclustered.length) buckets.set('__other_samples__', unclustered);
    if (buckets.size < 2 || buckets.size > 80) {
      return { applied: false, cohortCount: buckets.size, method: 'unchanged' };
    }
    method = 'distance-cohorts';
  }

  const spacing = Math.max(12, Math.min(22, 360 / Math.sqrt(nodes.length)));
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const layouts = Array.from(buckets.entries())
    .map(([key, values]) => {
      const radius = Math.max(spacing * 3, spacing * Math.sqrt(values.length) * 0.72);
      const keyHash = stableHash(key);
      return {
        key,
        values: [...values].sort((left, right) =>
          String(left._id ?? left.id).localeCompare(String(right._id ?? right.id))),
        radius,
        rotation: (keyHash % 6283) / 1000,
        stretchX: 0.82 + ((keyHash >>> 8) % 31) / 100,
        stretchY: 0.82 + ((keyHash >>> 16) % 31) / 100,
      };
    })
    .sort((left, right) => right.values.length - left.values.length || left.key.localeCompare(right.key));
  const placedCohorts: Array<{ x: number; y: number; radius: number }> = [];
  const searchStep = spacing * 2.2;

  for (let layoutIndex = 0; layoutIndex < layouts.length; layoutIndex++) {
    const layout = layouts[layoutIndex];
    let centerX = 0;
    let centerY = 0;
    if (layoutIndex > 0) {
      const phase = layout.rotation + layoutIndex * 0.73;
      for (let attempt = 1; attempt <= 10000; attempt++) {
        const orbit = searchStep * Math.sqrt(attempt);
        const angle = phase + attempt * goldenAngle;
        const candidateX = Math.cos(angle) * orbit * 1.08;
        const candidateY = Math.sin(angle) * orbit * 0.9;
        const overlaps = placedCohorts.some(placed =>
          Math.hypot(candidateX - placed.x, candidateY - placed.y) <
            layout.radius + placed.radius + spacing * 2.2,
        );
        if (!overlaps) {
          centerX = candidateX;
          centerY = candidateY;
          break;
        }
      }
    }
    placedCohorts.push({ x: centerX, y: centerY, radius: layout.radius });

    layout.values.forEach((node, index) => {
      const positionedNode = node as Record<string, any>;
      const nodeHash = stableHash(String(node._id ?? node.id));
      const hashNoise = (nodeHash % 1000) / 1000;
      const angle = layout.rotation + index * goldenAngle + (hashNoise - 0.5) * 0.34;
      const normalizedRadius = Math.sqrt((index + 0.65) / Math.max(1, layout.values.length));
      const ripple = 0.86 + hashNoise * 0.27 + Math.sin(angle * 3 + layout.rotation) * 0.06;
      const radialDistance = layout.radius * normalizedRadius * ripple;
      const organicWarp = Math.sin(angle * 2.3 + hashNoise * Math.PI) * spacing * 0.22;
      positionedNode.x = centerX +
        Math.cos(angle) * radialDistance * layout.stretchX +
        Math.sin(angle * 1.7) * organicWarp;
      positionedNode.y = centerY +
        Math.sin(angle) * radialDistance * layout.stretchY +
        Math.cos(angle * 1.4) * organicWarp;
      positionedNode.vx = 0;
      positionedNode.vy = 0;
      positionedNode._sigmaLayoutAnchorX = centerX;
      positionedNode._sigmaLayoutAnchorY = centerY;
      positionedNode._sigmaLayoutGroup = method === 'group-by'
        ? (layout.key === '__ungrouped__' ? 'Ungrouped' : layout.key)
        : (layout.key === '__other_samples__' ? 'Other samples' : `Distance cohort ${layoutIndex + 1}`);
    });
  }

  const offsetX = nodes.reduce((sum, node) => sum + Number(node.x), 0) / nodes.length;
  const offsetY = nodes.reduce((sum, node) => sum + Number(node.y), 0) / nodes.length;
  nodes.forEach(node => {
    const positionedNode = node as Record<string, any>;
    positionedNode.x -= offsetX;
    positionedNode.y -= offsetY;
    positionedNode._sigmaLayoutAnchorX -= offsetX;
    positionedNode._sigmaLayoutAnchorY -= offsetY;
  });
  return { applied: true, cohortCount: layouts.length, method };
}

function markBackboneEdges(links: SigmaPocLink[], neighborsPerNode = 1): Set<string> {
  const ranked = [...links].sort((left, right) => {
    const distanceDelta = finiteDistance(left) - finiteDistance(right);
    return distanceDelta || stableHash(left.id) - stableHash(right.id) || left.id.localeCompare(right.id);
  });
  const degree = new Map<string, number>();
  const selected = new Set<string>();

  for (const link of ranked) {
    if (link.source === link.target) continue;
    const sourceDegree = degree.get(link.source) || 0;
    const targetDegree = degree.get(link.target) || 0;
    if (sourceDegree >= neighborsPerNode || targetDegree >= neighborsPerNode) continue;
    selected.add(link.id);
    degree.set(link.source, sourceDegree + 1);
    degree.set(link.target, targetDegree + 1);
  }
  return selected;
}

function convexHull(points: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  if (points.length <= 2) return points;
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (origin: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) =>
    (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);
  const lower: Array<{ x: number; y: number }> = [];
  const upper: Array<{ x: number; y: number }> = [];

  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
      lower.pop();
    }
    lower.push(point);
  }
  for (let index = sorted.length - 1; index >= 0; index--) {
    const point = sorted[index];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
      upper.pop();
    }
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function pointInPolygon(
  point: SigmaViewportPoint,
  polygon: SigmaViewportPoint[],
): boolean {
  let inside = false;
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current++) {
    const a = polygon[current];
    const b = polygon[previous];
    const crossesRay = (a.y > point.y) !== (b.y > point.y) &&
      point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x;
    if (crossesRay) inside = !inside;
  }
  return inside;
}

function polygonArea(points: SigmaViewportPoint[]): number {
  let twiceArea = 0;
  for (let index = 0; index < points.length; index++) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    twiceArea += current.x * next.y - next.x * current.y;
  }
  return Math.abs(twiceArea) / 2;
}

export class SigmaNetworkRendererAdapter {
  /** Complete client-side graph used by statistics and interactions. */
  private graph: Graph<SigmaNodeAttributes, SigmaEdgeAttributes> = new Graph({
    multi: true,
    type: 'mixed',
    allowSelfLoops: true,
  });
  /** Sigma-facing projection containing every node and only the edges currently drawn. */
  private displayGraph: Graph<SigmaNodeAttributes, SigmaEdgeAttributes> = new Graph({
    multi: true,
    type: 'mixed',
    allowSelfLoops: true,
  });
  private renderer: Sigma<SigmaNodeAttributes, SigmaEdgeAttributes> | null = null;
  private groupLayer: HTMLCanvasElement | null = null;
  private selectionLayer: HTMLCanvasElement | null = null;
  private groupHulls: SigmaGroupHull[] = [];
  private selectedNodeIds = new Set<string>();
  private hoveredNodeId: string | null = null;
  private hoveredNeighborhood = new Set<string>();
  private edgeDetailMode: SigmaEdgeDetailMode = 'overview';
  private baseEdgeStride = 1;
  private effectiveEdgeStride = 1;
  private showGroupHulls = false;
  private rankedEdges: SigmaRankedEdge[] = [];
  private incidentEdgeIdsByNode = new Map<string, string[]>();
  private projectionTimer: ReturnType<typeof setTimeout> | null = null;
  private hullRefreshFrame: number | null = null;
  private selectionStart: SigmaViewportPoint | null = null;
  private selectionEnd: SigmaViewportPoint | null = null;
  private selectionPointerId: number | null = null;
  private selectionMouseLayer: HTMLElement | null = null;
  private nodeDragStartPointer: { x: number; y: number } | null = null;
  private nodeDragStartPositions = new Map<string, { x: number; y: number }>();
  private hullDragState: SigmaHullDragState | null = null;
  private suppressStageClick = false;
  private suppressStageClickTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly handleSelectionPointerDown = (event: PointerEvent): void => {
    if (!event.shiftKey || event.button !== 0 || !this.renderer) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.selectionPointerId = event.pointerId;
    this.selectionStart = this.viewportPointFromPointer(event);
    this.selectionEnd = this.selectionStart;
    this.selectionMouseLayer?.setPointerCapture?.(event.pointerId);
    document.addEventListener('pointermove', this.handleSelectionPointerMove, true);
    document.addEventListener('pointerup', this.handleSelectionPointerUp, true);
    document.addEventListener('pointercancel', this.handleSelectionPointerUp, true);
    this.drawSelectionBox();
  };

  private readonly handleSelectionPointerMove = (event: PointerEvent): void => {
    if (this.selectionPointerId !== event.pointerId || !this.selectionStart) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.selectionEnd = this.viewportPointFromPointer(event);
    this.drawSelectionBox();
  };

  private readonly handleSelectionPointerUp = (event: PointerEvent): void => {
    if (this.selectionPointerId !== event.pointerId || !this.selectionStart) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.selectionEnd = this.viewportPointFromPointer(event);
    this.selectionMouseLayer?.releasePointerCapture?.(event.pointerId);
    document.removeEventListener('pointermove', this.handleSelectionPointerMove, true);
    document.removeEventListener('pointerup', this.handleSelectionPointerUp, true);
    document.removeEventListener('pointercancel', this.handleSelectionPointerUp, true);
    this.finishBoxSelection();
  };

  constructor(
    private readonly container: HTMLElement,
    private readonly selectedColor: string,
    private readonly callbacks: SigmaPocCallbacks = {},
  ) {}

  render(data: SigmaPocGraphData, preserveCamera = false): void {
    const priorCamera = preserveCamera ? this.renderer?.getCamera().getState() : null;
    const graph = new Graph<SigmaNodeAttributes, SigmaEdgeAttributes>({
      multi: true,
      type: 'mixed',
      allowSelfLoops: true,
    });
    const backboneEdges = markBackboneEdges(data.links);
    this.selectedNodeIds.clear();

    for (const node of data.nodes) {
      if (node.selected) this.selectedNodeIds.add(node.id);
      graph.addNode(node.id, {
        x: Number.isFinite(node.x) ? node.x : 0,
        y: Number.isFinite(node.y) ? node.y : 0,
        label: node.label || node.id,
        color: node.color || '#2563eb',
        opacity: Number.isFinite(node.opacity) ? node.opacity : 1,
        size: Math.max(2, Number(node.size) || 6),
        selected: node.selected,
        group: node.group || null,
        groupColor: node.groupColor || GROUP_PALETTE[stableHash(node.group || node.id) % GROUP_PALETTE.length],
        raw: node,
      });
    }

    for (const link of data.links) {
      if (!graph.hasNode(link.source) || !graph.hasNode(link.target)) continue;
      let edgeId = link.id;
      let duplicate = 1;
      while (graph.hasEdge(edgeId)) edgeId = `${link.id}--${duplicate++}`;
      graph.addEdgeWithKey(edgeId, link.source, link.target, {
        color: link.color || '#94a3b8',
        opacity: Number.isFinite(link.opacity) ? link.opacity : 0.35,
        size: Math.max(0.25, Number(link.size) || 0.75),
        sourceId: link.source,
        targetId: link.target,
        stableBucket: stableHash(edgeId),
        isBackbone: backboneEdges.has(link.id),
        raw: link,
      });
    }

    this.graph = graph;
    this.showGroupHulls = data.showGroupHulls;
    this.baseEdgeStride = this.resolveBaseEdgeStride(graph.size);
    this.updateEffectiveEdgeStride(this.renderer?.getCamera().getState().ratio || 1);
    this.rebuildEdgeIndexes();
    this.displayGraph = this.createDisplayGraph();
    this.rebuildGroupHulls();
    const stableGraphBounds = this.resolveGraphBounds();

    const existingRenderer = Boolean(this.renderer);
    if (!this.renderer) {
      this.createRenderer();
    }
    if (existingRenderer) {
      this.renderer.setGraph(this.displayGraph);
    }

    this.renderer.setCustomBBox(stableGraphBounds);

    if (priorCamera) this.renderer.getCamera().setState(priorCamera);
    else void this.renderer.getCamera().reset({ duration: 0 });
    this.renderer.refresh();
    this.drawGroupHulls();
    this.emitSummary();
  }

  setEdgeDetailMode(mode: SigmaEdgeDetailMode): void {
    if (this.edgeDetailMode === mode) return;
    this.edgeDetailMode = mode;
    this.updateEffectiveEdgeStride(this.renderer?.getCamera().getState().ratio || 1);
    this.rebuildDisplayGraph();
    this.emitSummary();
  }

  fit(): void {
    if (!this.renderer) return;
    this.renderer.resize();
    void this.renderer.getCamera().reset({ duration: 250 });
  }

  resize(): void {
    this.renderer?.resize();
    this.drawGroupHulls();
    this.drawSelectionBox();
    this.scheduleProjectionRefresh();
  }

  getGraph(): Graph<SigmaNodeAttributes, SigmaEdgeAttributes> {
    return this.graph;
  }

  getRenderer(): Sigma<SigmaNodeAttributes, SigmaEdgeAttributes> | null {
    return this.renderer;
  }

  getDisplayGraph(): Graph<SigmaNodeAttributes, SigmaEdgeAttributes> {
    return this.displayGraph;
  }

  getSummary(): SigmaPocRenderSummary {
    return {
      residentNodeCount: this.graph.order,
      residentLinkCount: this.graph.size,
      drawnLinkCount: this.displayGraph.size,
      edgeDetailMode: this.edgeDetailMode,
      edgeStride: this.effectiveEdgeStride,
    };
  }

  destroy(): void {
    if (this.projectionTimer) clearTimeout(this.projectionTimer);
    this.projectionTimer = null;
    if (this.hullRefreshFrame !== null) cancelAnimationFrame(this.hullRefreshFrame);
    this.hullRefreshFrame = null;
    this.selectionMouseLayer?.removeEventListener('pointerdown', this.handleSelectionPointerDown, true);
    document.removeEventListener('pointermove', this.handleSelectionPointerMove, true);
    document.removeEventListener('pointerup', this.handleSelectionPointerUp, true);
    document.removeEventListener('pointercancel', this.handleSelectionPointerUp, true);
    this.renderer?.kill();
    this.renderer = null;
    this.groupLayer = null;
    this.selectionLayer = null;
    this.selectionMouseLayer = null;
    this.selectionStart = null;
    this.selectionEnd = null;
    this.selectionPointerId = null;
    this.nodeDragStartPointer = null;
    this.nodeDragStartPositions.clear();
    this.hullDragState = null;
    if (this.suppressStageClickTimer) clearTimeout(this.suppressStageClickTimer);
    this.suppressStageClickTimer = null;
    this.suppressStageClick = false;
    this.groupHulls = [];
    this.rankedEdges = [];
    this.incidentEdgeIdsByNode.clear();
    this.graph.clear();
    this.displayGraph.clear();
  }

  private createRenderer(): void {
    this.renderer = new Sigma(this.displayGraph, this.container, {
      settings: {
        autoRescaleContent: 'nodes',
        enableNodeDrag: true,
        getDraggedNodes: draggedNode => [draggedNode],
        // Sigma v4's drag manager retains the graph supplied at construction.
        // Edge LOD swaps the display graph, so the adapter applies pointer
        // deltas to the current graph instead of letting that stale reference
        // write node positions.
        dragPositionToAttributes: () => ({}),
        enableEdgeEvents: false,
        hideEdgesOnMove: false,
        hideLabelsOnMove: true,
        labelDensity: 0.55,
        labelGridCellSize: 140,
        labelRenderedSizeThreshold: 6,
        minEdgeThickness: 0.35,
        nodePickingPadding: 6,
        stagePadding: 48,
      },
      nodeReducer: (_key, displayData, attributes, state) => {
        const inActiveNeighborhood = !this.hoveredNodeId || this.hoveredNeighborhood.has(String(attributes.raw.id));
        const selected = this.selectedNodeIds.has(String(attributes.raw.id));
        return {
          ...displayData,
          color: selected ? this.selectedColor : String(attributes.color),
          opacity: inActiveNeighborhood ? Number(attributes.opacity) : 0.12,
          size: Number(attributes.size) * (selected || state.isHovered ? 1.35 : 1),
          label: inActiveNeighborhood ? String(attributes.label) : null,
          labelVisibility: selected || state.isHovered ? 'visible' : 'auto',
          highlighted: selected || state.isHovered,
          zIndex: selected || state.isHovered ? 20 : 1,
        };
      },
      edgeReducer: (_key, displayData, attributes, state) => {
        const incidentToHover = Boolean(
          this.hoveredNodeId &&
          (attributes.sourceId === this.hoveredNodeId || attributes.targetId === this.hoveredNodeId),
        );
        const incidentToSelection = this.selectedNodeIds.size === 1 && (
          this.selectedNodeIds.has(String(attributes.sourceId)) ||
          this.selectedNodeIds.has(String(attributes.targetId))
        );
        return {
          ...displayData,
          visibility: 'visible',
          color: incidentToHover || incidentToSelection ? this.selectedColor : String(attributes.color),
          opacity: incidentToHover || incidentToSelection ? 0.9 : Number(attributes.opacity),
          size: Number(attributes.size) * (incidentToHover || incidentToSelection || state.isHovered ? 1.75 : 1),
          zIndex: incidentToHover || incidentToSelection ? 10 : 0,
        };
      },
    });

    this.groupLayer = this.renderer.createCanvas('microbetrace-groups', {
      beforeLayer: 'stage',
      style: { pointerEvents: 'none' },
    });
    this.selectionLayer = this.renderer.createCanvas('microbetrace-selection', {
      afterLayer: 'stage',
      style: { pointerEvents: 'none' },
    });
    this.selectionMouseLayer = this.renderer.getMouseLayer();
    this.selectionMouseLayer.addEventListener('pointerdown', this.handleSelectionPointerDown, true);
    this.renderer.on('afterRender', () => this.drawGroupHulls());
    this.renderer.on('enterNode', payload => this.handleNodeHover(payload.node, payload.event.original));
    this.renderer.on('leaveNode', payload => this.handleNodeHover(null, payload.event.original));
    this.renderer.on('clickNode', payload => this.handleNodeClick(payload.node, payload.event.original));
    this.renderer.on('clickStage', () => {
      if (this.suppressStageClick) {
        this.suppressStageClick = false;
        return;
      }
      this.clearSelection();
    });
    this.renderer.on('downStage', payload => this.startHullDrag(payload));
    this.renderer.on('moveBody', payload => this.moveHullDrag(payload));
    this.renderer.on('upStage', payload => this.finishHullDrag(payload));
    this.renderer.on('upNode', payload => this.finishHullDrag(payload));
    this.renderer.on('rightClickNode', payload => {
      const event = payload.event.original;
      if (!(event instanceof MouseEvent)) return;
      payload.preventSigmaDefault();
      const node = this.graph.getNodeAttribute(payload.node, 'raw');
      this.callbacks.onNodeContextMenu?.(node, event);
    });
    this.renderer.on('nodeDragStart', payload => {
      this.startNodeDrag(payload.allDraggedNodes, payload.event);
    });
    this.renderer.on('nodeDrag', payload => {
      this.applyNodeDrag(payload.allDraggedNodes, payload.event);
      this.syncDraggedNodePositions(payload.allDraggedNodes, false);
    });
    this.renderer.on('nodeDragEnd', payload => {
      this.applyNodeDrag(payload.allDraggedNodes, payload.event);
      this.syncDraggedNodePositions(payload.allDraggedNodes, true);
      this.nodeDragStartPointer = null;
      this.nodeDragStartPositions.clear();
      this.rebuildGroupHulls();
      this.drawGroupHulls();
      this.scheduleProjectionRefresh();
    });
    this.renderer.getCamera().on('updated', camera => {
      this.updateEffectiveEdgeStride(camera.ratio);
      this.scheduleProjectionRefresh();
    });
  }

  private resolveGraphBounds(): SigmaGraphBounds {
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    this.graph.forEachNode((_nodeId, attributes) => {
      const x = Number(attributes.x);
      const y = Number(attributes.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    });
    if (!Number.isFinite(minX) || !Number.isFinite(minY)) return { x: [0, 1], y: [0, 1] };
    if (minX === maxX) {
      minX -= 0.5;
      maxX += 0.5;
    }
    if (minY === maxY) {
      minY -= 0.5;
      maxY += 0.5;
    }
    return { x: [minX, maxX], y: [minY, maxY] };
  }

  private viewportPointFromPointer(event: PointerEvent): SigmaViewportPoint {
    const bounds = this.container.getBoundingClientRect();
    const width = this.renderer?.getDimensions().width || bounds.width;
    const height = this.renderer?.getDimensions().height || bounds.height;
    return {
      x: Math.max(0, Math.min(width, event.clientX - bounds.left)),
      y: Math.max(0, Math.min(height, event.clientY - bounds.top)),
    };
  }

  private prepareOverlayCanvas(layer: HTMLCanvasElement): {
    context: CanvasRenderingContext2D;
    width: number;
    height: number;
  } | null {
    if (!this.renderer) return null;
    const { width, height } = this.renderer.getDimensions();
    const pixelRatio = window.devicePixelRatio || 1;
    const renderWidth = Math.max(1, Math.round(width * pixelRatio));
    const renderHeight = Math.max(1, Math.round(height * pixelRatio));
    if (layer.width !== renderWidth || layer.height !== renderHeight) {
      layer.width = renderWidth;
      layer.height = renderHeight;
    }
    layer.style.width = `${width}px`;
    layer.style.height = `${height}px`;
    const context = layer.getContext('2d');
    if (!context) return null;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);
    return { context, width, height };
  }

  private drawSelectionBox(): void {
    if (!this.selectionLayer) return;
    const prepared = this.prepareOverlayCanvas(this.selectionLayer);
    if (!prepared || !this.selectionStart || !this.selectionEnd) return;
    const { context } = prepared;
    const x = Math.min(this.selectionStart.x, this.selectionEnd.x);
    const y = Math.min(this.selectionStart.y, this.selectionEnd.y);
    const width = Math.abs(this.selectionEnd.x - this.selectionStart.x);
    const height = Math.abs(this.selectionEnd.y - this.selectionStart.y);
    context.save();
    context.fillStyle = 'rgba(37, 99, 235, 0.12)';
    context.strokeStyle = '#2563eb';
    context.lineWidth = 1.5;
    context.setLineDash([6, 4]);
    context.fillRect(x, y, width, height);
    context.strokeRect(x, y, width, height);
    context.restore();
  }

  private finishBoxSelection(): void {
    const start = this.selectionStart;
    const end = this.selectionEnd;
    this.selectionStart = null;
    this.selectionEnd = null;
    this.selectionPointerId = null;
    this.drawSelectionBox();
    if (!this.renderer || !start || !end) return;
    if (Math.abs(end.x - start.x) < 4 || Math.abs(end.y - start.y) < 4) return;
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);
    this.graph.forEachNode((nodeId, attributes) => {
      const displayedAttributes = this.displayGraph.hasNode(nodeId)
        ? this.displayGraph.getNodeAttributes(nodeId)
        : attributes;
      const point = this.renderer!.graphToViewport({
        x: Number(displayedAttributes.x),
        y: Number(displayedAttributes.y),
      });
      if (point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY) {
        this.selectedNodeIds.add(nodeId);
      }
    });
    this.syncSelectionAttributes();
  }

  private syncDraggedNodePositions(nodeIds: string[], notify: boolean): void {
    for (const nodeId of nodeIds) {
      if (!this.displayGraph.hasNode(nodeId)) continue;
      const x = Number(this.displayGraph.getNodeAttribute(nodeId, 'x'));
      const y = Number(this.displayGraph.getNodeAttribute(nodeId, 'y'));
      if (this.graph.hasNode(nodeId)) {
        this.graph.setNodeAttribute(nodeId, 'x', x);
        this.graph.setNodeAttribute(nodeId, 'y', y);
      }
      if (notify) this.callbacks.onNodePositionChange?.(nodeId, { x, y });
    }
    if (notify && this.hullRefreshFrame !== null) {
      cancelAnimationFrame(this.hullRefreshFrame);
      this.hullRefreshFrame = null;
    }
    if (!this.showGroupHulls || notify || this.hullRefreshFrame !== null) return;
    this.hullRefreshFrame = requestAnimationFrame(() => {
      this.hullRefreshFrame = null;
      this.rebuildGroupHulls();
      this.drawGroupHulls();
    });
  }

  private startNodeDrag(nodeIds: string[], pointer: { x: number; y: number }): void {
    if (!this.renderer) return;
    this.nodeDragStartPointer = this.renderer.viewportToGraph(pointer);
    this.nodeDragStartPositions.clear();
    for (const nodeId of nodeIds) {
      if (!this.displayGraph.hasNode(nodeId)) continue;
      this.nodeDragStartPositions.set(nodeId, {
        x: Number(this.displayGraph.getNodeAttribute(nodeId, 'x')),
        y: Number(this.displayGraph.getNodeAttribute(nodeId, 'y')),
      });
    }
  }

  private applyNodeDrag(nodeIds: string[], pointer: { x: number; y: number }): void {
    if (!this.renderer || !this.nodeDragStartPointer) return;
    const currentPointer = this.renderer.viewportToGraph(pointer);
    const deltaX = currentPointer.x - this.nodeDragStartPointer.x;
    const deltaY = currentPointer.y - this.nodeDragStartPointer.y;
    for (const nodeId of nodeIds) {
      const start = this.nodeDragStartPositions.get(nodeId);
      if (!start || !this.displayGraph.hasNode(nodeId)) continue;
      this.displayGraph.mergeNodeAttributes(nodeId, {
        x: start.x + deltaX,
        y: start.y + deltaY,
      });
    }
  }

  private viewportHullPolygon(group: SigmaGroupHull): SigmaViewportPoint[] {
    if (!this.renderer) return [];
    const center = this.renderer.graphToViewport(group.center);
    return group.points.map(graphPoint => {
      const point = this.renderer!.graphToViewport(graphPoint);
      const dx = point.x - center.x;
      const dy = point.y - center.y;
      const length = Math.max(1, Math.hypot(dx, dy));
      return { x: point.x + dx / length * 14, y: point.y + dy / length * 14 };
    });
  }

  private hullAtViewportPoint(point: SigmaViewportPoint): SigmaGroupHull | null {
    const matches = this.groupHulls
      .map(group => ({ group, polygon: this.viewportHullPolygon(group) }))
      .filter(candidate => pointInPolygon(point, candidate.polygon))
      .sort((left, right) => polygonArea(left.polygon) - polygonArea(right.polygon));
    return matches[0]?.group || null;
  }

  private startHullDrag(payload: {
    event: { x: number; y: number; original: MouseEvent | TouchEvent };
    preventSigmaDefault(): void;
  }): void {
    if (!this.renderer || !(payload.event.original instanceof MouseEvent)) return;
    if (payload.event.original.button !== 0 || payload.event.original.shiftKey) return;
    const group = this.hullAtViewportPoint(payload.event);
    if (!group) return;

    // This only runs for downStage. A pointer over a node produces downNode,
    // allowing Sigma's node selection and drag behavior to take precedence.
    payload.preventSigmaDefault();
    this.selectedNodeIds.clear();
    group.nodeIds.forEach(nodeId => this.selectedNodeIds.add(nodeId));
    this.syncSelectionAttributes();

    const startPositions = new Map<string, { x: number; y: number }>();
    group.nodeIds.forEach(nodeId => {
      if (!this.displayGraph.hasNode(nodeId)) return;
      startPositions.set(nodeId, {
        x: Number(this.displayGraph.getNodeAttribute(nodeId, 'x')),
        y: Number(this.displayGraph.getNodeAttribute(nodeId, 'y')),
      });
    });
    this.hullDragState = {
      nodeIds: [...startPositions.keys()],
      startPointer: this.renderer.viewportToGraph(payload.event),
      startPositions,
    };
  }

  private moveHullDrag(payload: {
    event: { x: number; y: number };
    preventSigmaDefault(): void;
  }): void {
    if (!this.renderer || !this.hullDragState) return;
    payload.preventSigmaDefault();
    const currentPointer = this.renderer.viewportToGraph(payload.event);
    const deltaX = currentPointer.x - this.hullDragState.startPointer.x;
    const deltaY = currentPointer.y - this.hullDragState.startPointer.y;
    for (const nodeId of this.hullDragState.nodeIds) {
      const start = this.hullDragState.startPositions.get(nodeId);
      if (!start || !this.displayGraph.hasNode(nodeId)) continue;
      this.displayGraph.mergeNodeAttributes(nodeId, {
        x: start.x + deltaX,
        y: start.y + deltaY,
      });
    }
    this.syncDraggedNodePositions(this.hullDragState.nodeIds, false);
  }

  private finishHullDrag(payload: {
    event: { x: number; y: number };
    preventSigmaDefault(): void;
  }): void {
    if (!this.hullDragState) return;
    payload.preventSigmaDefault();
    this.moveHullDrag(payload);
    const nodeIds = this.hullDragState.nodeIds;
    this.hullDragState = null;
    this.syncDraggedNodePositions(nodeIds, true);
    this.rebuildGroupHulls();
    this.drawGroupHulls();
    this.scheduleProjectionRefresh();

    // A no-movement hull click emits clickStage after upStage. Preserve the
    // group selection for that click, while allowing later stage clicks to
    // clear selection normally.
    this.suppressStageClick = true;
    if (this.suppressStageClickTimer) clearTimeout(this.suppressStageClickTimer);
    this.suppressStageClickTimer = setTimeout(() => {
      this.suppressStageClick = false;
      this.suppressStageClickTimer = null;
    }, 0);
  }

  private handleNodeHover(nodeId: string | null, event?: MouseEvent | TouchEvent): void {
    this.hoveredNodeId = nodeId;
    this.hoveredNeighborhood.clear();
    if (nodeId && this.graph.hasNode(nodeId)) {
      this.hoveredNeighborhood.add(nodeId);
      this.graph.forEachNeighbor(nodeId, neighbor => this.hoveredNeighborhood.add(neighbor));
      this.callbacks.onNodeHover?.(this.graph.getNodeAttribute(nodeId, 'raw'), event);
    } else {
      this.callbacks.onNodeHover?.(null, event);
    }
    this.rebuildDisplayGraph(true);
    this.emitSummary();
  }

  private handleNodeClick(nodeId: string, event: MouseEvent | TouchEvent): void {
    const mouseEvent = event instanceof MouseEvent ? event : null;
    const additive = Boolean(mouseEvent?.ctrlKey || mouseEvent?.metaKey || mouseEvent?.shiftKey);
    const wasSelected = this.selectedNodeIds.has(nodeId);
    if (!additive) this.selectedNodeIds.clear();
    if (!wasSelected || !additive) this.selectedNodeIds.add(nodeId);
    else this.selectedNodeIds.delete(nodeId);
    this.syncSelectionAttributes();
  }

  private clearSelection(): void {
    if (this.selectedNodeIds.size === 0) return;
    this.selectedNodeIds.clear();
    this.syncSelectionAttributes();
  }

  private syncSelectionAttributes(): void {
    this.graph.forEachNode(nodeId => {
      this.graph.setNodeAttribute(nodeId, 'selected', this.selectedNodeIds.has(nodeId));
    });
    this.callbacks.onNodeSelectionChange?.(new Set(this.selectedNodeIds));
    this.rebuildDisplayGraph(true);
    this.emitSummary();
  }

  private rebuildEdgeIndexes(): void {
    this.rankedEdges = [];
    this.incidentEdgeIdsByNode.clear();
    this.graph.forEachEdge((edgeId, attributes, source, target) => {
      this.rankedEdges.push({
        id: edgeId,
        sourceId: source,
        targetId: target,
        distance: finiteDistance(attributes.raw),
        isBackbone: Boolean(attributes.isBackbone),
      });
      const sourceEdges = this.incidentEdgeIdsByNode.get(source) || [];
      sourceEdges.push(edgeId);
      this.incidentEdgeIdsByNode.set(source, sourceEdges);
      if (source !== target) {
        const targetEdges = this.incidentEdgeIdsByNode.get(target) || [];
        targetEdges.push(edgeId);
        this.incidentEdgeIdsByNode.set(target, targetEdges);
      }
    });
    this.rankedEdges.sort((left, right) =>
      left.distance - right.distance ||
      stableHash(left.id) - stableHash(right.id) ||
      left.id.localeCompare(right.id));
  }

  private resolveViewportNodes(): { core: Set<string>; overscan: Set<string> } {
    const allNodes = new Set(this.graph.nodes());
    if (!this.renderer) return { core: allNodes, overscan: allNodes };
    const { width, height } = this.renderer.getDimensions();
    if (width <= 0 || height <= 0) return { core: allNodes, overscan: allNodes };
    const core = new Set<string>();
    const overscan = new Set<string>();
    const marginX = width * 0.3;
    const marginY = height * 0.3;
    this.graph.forEachNode((nodeId, attributes) => {
      const point = this.renderer!.graphToViewport({ x: Number(attributes.x), y: Number(attributes.y) });
      if (point.x >= 0 && point.x <= width && point.y >= 0 && point.y <= height) core.add(nodeId);
      if (
        point.x >= -marginX && point.x <= width + marginX &&
        point.y >= -marginY && point.y <= height + marginY
      ) {
        overscan.add(nodeId);
      }
    });
    if (core.size === 0) {
      const fallback = overscan.size ? overscan : allNodes;
      return { core: fallback, overscan: fallback };
    }
    return { core, overscan: overscan.size ? overscan : core };
  }

  private resolveDisplayEdgeBudget(): number {
    if (this.edgeDetailMode === 'all') return this.graph.size;
    const sampledBudget = Math.ceil(this.graph.size / Math.max(1, this.effectiveEdgeStride));
    return Math.min(this.graph.size, sampledBudget + Math.min(this.graph.order, 1000));
  }

  private resolveNearestNeighborQuota(): number {
    const ratio = this.renderer?.getCamera().getState().ratio || 1;
    const zoomQuota = ratio <= 0.25 ? 12 : ratio <= 0.45 ? 8 : ratio <= 0.75 ? 5 : 2;
    return this.edgeDetailMode === 'detail' ? Math.max(5, zoomQuota) : zoomQuota;
  }

  private selectDisplayEdgeIds(): Set<string> {
    if (this.edgeDetailMode === 'all') return new Set(this.rankedEdges.map(edge => edge.id));
    if (this.hoveredNodeId) return new Set(this.incidentEdgeIdsByNode.get(this.hoveredNodeId) || []);
    // A single selected node benefits from seeing every incident link. Multi-
    // selection is a node-only state: retain the normal viewport projection so
    // a dense network does not materialize or emphasize thousands of links.
    if (this.selectedNodeIds.size === 1) {
      const selectedIncidentEdges = new Set<string>();
      this.selectedNodeIds.forEach(nodeId => {
        for (const edgeId of this.incidentEdgeIdsByNode.get(nodeId) || []) selectedIncidentEdges.add(edgeId);
      });
      return selectedIncidentEdges;
    }

    const { core, overscan } = this.resolveViewportNodes();
    const focus = core.size > 1 ? core : overscan;
    const budget = this.resolveDisplayEdgeBudget();
    const selected = new Set<string>();

    // Stable global context skeleton retained while the camera is moving.
    for (const edge of this.rankedEdges) {
      if (edge.isBackbone) selected.add(edge.id);
    }

    // Shortest-distance spanning forest keeps the visible samples connected without redundant ties.
    const parent = new Map<string, string>();
    focus.forEach(nodeId => parent.set(nodeId, nodeId));
    const find = (nodeId: string): string => {
      const current = parent.get(nodeId) || nodeId;
      if (current === nodeId) return current;
      const root = find(current);
      parent.set(nodeId, root);
      return root;
    };
    for (const edge of this.rankedEdges) {
      if (!focus.has(edge.sourceId) || !focus.has(edge.targetId)) continue;
      const sourceRoot = find(edge.sourceId);
      const targetRoot = find(edge.targetId);
      if (sourceRoot === targetRoot) continue;
      parent.set(targetRoot, sourceRoot);
      selected.add(edge.id);
    }

    // Strongest bridge for each cohort pair preserves important between-cohort context.
    const bridgedGroupPairs = new Set<string>();
    for (const edge of this.rankedEdges) {
      if (!focus.has(edge.sourceId) || !focus.has(edge.targetId)) continue;
      const sourceGroup = String(this.graph.getNodeAttribute(edge.sourceId, 'group') || '');
      const targetGroup = String(this.graph.getNodeAttribute(edge.targetId, 'group') || '');
      if (!sourceGroup || !targetGroup || sourceGroup === targetGroup) continue;
      const groupPair = [sourceGroup, targetGroup].sort().join('\u0000');
      if (bridgedGroupPairs.has(groupPair)) continue;
      bridgedGroupPairs.add(groupPair);
      selected.add(edge.id);
    }

    // Nearest-neighbor coverage prevents high-degree areas from consuming the whole budget.
    const neighborQuota = this.resolveNearestNeighborQuota();
    const degree = new Map<string, number>();
    for (const edge of this.rankedEdges) {
      if (selected.size >= budget) break;
      if (!focus.has(edge.sourceId) || !focus.has(edge.targetId)) continue;
      const sourceDegree = degree.get(edge.sourceId) || 0;
      const targetDegree = degree.get(edge.targetId) || 0;
      if (sourceDegree >= neighborQuota && targetDegree >= neighborQuota) continue;
      selected.add(edge.id);
      degree.set(edge.sourceId, sourceDegree + 1);
      degree.set(edge.targetId, targetDegree + 1);
    }

    // Fill remaining capacity with shortest links in the viewport and its overscan margin.
    for (const nodeSet of [core, overscan]) {
      for (const edge of this.rankedEdges) {
        if (selected.size >= budget) break;
        if (nodeSet.has(edge.sourceId) && nodeSet.has(edge.targetId)) selected.add(edge.id);
      }
      if (selected.size >= budget) break;
    }

    // One strong outbound link per visible node supplies boundary context without a hairball.
    const outboundCovered = new Set<string>();
    for (const edge of this.rankedEdges) {
      if (selected.size >= budget) break;
      const sourceInCore = core.has(edge.sourceId);
      const targetInCore = core.has(edge.targetId);
      if (sourceInCore === targetInCore) continue;
      const coreNode = sourceInCore ? edge.sourceId : edge.targetId;
      if (outboundCovered.has(coreNode)) continue;
      outboundCovered.add(coreNode);
      selected.add(edge.id);
    }

    return selected;
  }

  private createDisplayGraph(
    edgeIds: Set<string> = this.selectDisplayEdgeIds(),
  ): Graph<SigmaNodeAttributes, SigmaEdgeAttributes> {
    const displayGraph = new Graph<SigmaNodeAttributes, SigmaEdgeAttributes>({
      multi: true,
      type: 'mixed',
      allowSelfLoops: true,
    });
    this.graph.forEachNode((nodeId, attributes) => {
      displayGraph.addNode(nodeId, { ...attributes });
    });
    edgeIds.forEach(edgeId => {
      if (!this.graph.hasEdge(edgeId)) return;
      const [source, target] = this.graph.extremities(edgeId);
      displayGraph.addEdgeWithKey(edgeId, source, target, { ...this.graph.getEdgeAttributes(edgeId) });
    });
    return displayGraph;
  }

  private rebuildDisplayGraph(force = false): boolean {
    const edgeIds = this.selectDisplayEdgeIds();
    const projectionChanged = edgeIds.size !== this.displayGraph.size ||
      Array.from(edgeIds).some(edgeId => !this.displayGraph.hasEdge(edgeId));
    if (!force && !projectionChanged) return false;
    this.displayGraph = this.createDisplayGraph(edgeIds);
    if (!this.renderer) return true;
    const settledCameraState = this.renderer.getCamera().getState();
    this.renderer.setGraph(this.displayGraph);
    this.renderer.setCustomBBox(this.resolveGraphBounds());
    this.renderer.getCamera().setState(settledCameraState);
    this.renderer.refresh();
    return true;
  }

  private resolveBaseEdgeStride(edgeCount: number): number {
    if (edgeCount > 100000) return 256;
    if (edgeCount > 50000) return 128;
    if (edgeCount > 20000) return 64;
    if (edgeCount > 8000) return 32;
    if (edgeCount > 3000) return 8;
    return 1;
  }

  private updateEffectiveEdgeStride(cameraRatio: number): boolean {
    const prior = this.effectiveEdgeStride;
    if (this.edgeDetailMode === 'all') {
      this.effectiveEdgeStride = 1;
    } else {
      const detailFactor = this.edgeDetailMode === 'detail' ? 0.25 : 1;
      const zoomFactor = cameraRatio <= 0.25 ? 0.125
        : cameraRatio <= 0.45 ? 0.25
        : cameraRatio <= 0.75 ? 0.5
        : cameraRatio >= 1.75 ? 2
        : 1;
      this.effectiveEdgeStride = Math.max(1, Math.round(this.baseEdgeStride * detailFactor * zoomFactor));
    }
    return prior !== this.effectiveEdgeStride;
  }

  private scheduleProjectionRefresh(): void {
    if (this.projectionTimer) clearTimeout(this.projectionTimer);
    this.projectionTimer = setTimeout(() => {
      this.projectionTimer = null;
      const graphState = this.renderer?.getGraphState();
      const cameraIsAnimating = this.renderer?.getCamera().isAnimating() || false;
      if (cameraIsAnimating || graphState?.isPanning || graphState?.isZooming || graphState?.isDragging) {
        this.scheduleProjectionRefresh();
        return;
      }
      if (this.rebuildDisplayGraph()) this.emitSummary();
    }, 140);
  }

  private emitSummary(): void {
    this.callbacks.onSummaryChange?.(this.getSummary());
  }

  private rebuildGroupHulls(): void {
    if (!this.showGroupHulls) {
      this.groupHulls = [];
      return;
    }
    const groups = new Map<string, {
      color: string;
      nodeIds: string[];
      points: Array<{ x: number; y: number }>;
    }>();
    this.graph.forEachNode((nodeId, attributes) => {
      if (!attributes.group) return;
      const group = groups.get(attributes.group) || {
        color: attributes.groupColor,
        nodeIds: [],
        points: [],
      };
      group.nodeIds.push(nodeId);
      group.points.push({ x: Number(attributes.x), y: Number(attributes.y) });
      groups.set(attributes.group, group);
    });
    if (groups.size < 2 || groups.size > 80) {
      this.groupHulls = [];
      return;
    }
    this.groupHulls = [];
    groups.forEach((group, label) => {
      if (group.points.length < 3) return;
      const points = convexHull(group.points);
      if (points.length < 3) return;
      const center = points.reduce(
        (acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }),
        { x: 0, y: 0 },
      );
      center.x /= points.length;
      center.y /= points.length;
      this.groupHulls.push({ label, color: group.color, nodeIds: group.nodeIds, points, center });
    });
  }

  private drawGroupHulls(): void {
    if (!this.renderer || !this.groupLayer) return;
    const prepared = this.prepareOverlayCanvas(this.groupLayer);
    if (!prepared) return;
    const { context } = prepared;
    if (!this.showGroupHulls) return;

    for (const group of this.groupHulls) {
      const center = this.renderer.graphToViewport(group.center);
      const expanded = this.viewportHullPolygon(group);

      context.beginPath();
      context.moveTo(expanded[0].x, expanded[0].y);
      for (let index = 1; index < expanded.length; index++) context.lineTo(expanded[index].x, expanded[index].y);
      context.closePath();
      context.globalAlpha = 0.09;
      context.fillStyle = group.color;
      context.fill();
      context.globalAlpha = 0.45;
      context.strokeStyle = group.color;
      context.lineWidth = 1.5;
      context.stroke();

      if (this.groupHulls.length <= 20) {
        context.globalAlpha = 0.8;
        context.fillStyle = group.color;
        context.font = '600 12px sans-serif';
        context.fillText(group.label, center.x + 6, center.y - 6);
      }
    }
    context.globalAlpha = 1;
  }
}
