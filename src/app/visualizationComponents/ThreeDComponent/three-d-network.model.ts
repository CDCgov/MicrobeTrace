export interface ThreeDPoint {
  x: number;
  y: number;
  z: number;
}

export interface ThreeDViewState {
  version: 1;
  camera: { position: ThreeDPoint; target: ThreeDPoint; up: ThreeDPoint };
  positions: Record<string, ThreeDPoint>;
  layoutFrozen: boolean;
}

export interface ThreeDSettings {
  nodeShape: ThreeDNodeShape;
  nodeShapeField: string;
  nodeShapeMappings: Record<string, Record<string, ThreeDNodeShape>>;
  nodeSize: number;
  nodeSizeField: string;
  nodeTooltipField: string;
  linkWidth: number;
  linkTransparency: number;
  linkTooltipField: string;
}

export interface ThreeDNode {
  id: string;
  shape: ThreeDNodeShape;
  color: string;
  value: number;
  tooltip: string;
  x?: number;
  y?: number;
  z?: number;
  fx?: number;
  fy?: number;
  fz?: number;
  vx?: number;
  vy?: number;
  vz?: number;
}

export type ThreeDNodeShape = 'sphere' | 'cube' | 'cone' | 'cylinder' | 'diamond' | 'pyramid';

export const THREE_D_NODE_SHAPES: Array<{ label: string; value: ThreeDNodeShape }> = [
  { label: 'Sphere', value: 'sphere' }, { label: 'Cube', value: 'cube' },
  { label: 'Cone', value: 'cone' }, { label: 'Cylinder', value: 'cylinder' },
  { label: 'Diamond', value: 'diamond' }, { label: 'Square pyramid', value: 'pyramid' },
];

function validShape(value: unknown): value is ThreeDNodeShape {
  return THREE_D_NODE_SHAPES.some(shape => shape.value === value);
}

export function threeDShapeCategory(value: unknown): string {
  if (value == null || typeof value === 'number' && Number.isNaN(value)) return 'null';
  const text = String(value).trim();
  return text && text.toLowerCase() !== 'nan' ? text : 'null';
}

function readShapeMappings(value: any): ThreeDSettings['nodeShapeMappings'] {
  const mappings: ThreeDSettings['nodeShapeMappings'] = Object.create(null);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return mappings;
  Object.entries(value).forEach(([field, entries]) => {
    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) return;
    const mapping: Record<string, ThreeDNodeShape> = Object.create(null);
    Object.entries(entries).forEach(([key, shape]) => { if (validShape(shape)) mapping[key] = shape; });
    mappings[field] = mapping;
  });
  return mappings;
}

/** Assign from the complete dataset, so filtering cannot reshuffle category shapes. */
export function ensureThreeDShapeMapping(nodes: any[], settings: ThreeDSettings): void {
  const field = settings.nodeShapeField;
  if (field === 'None') return;
  const mapping = settings.nodeShapeMappings[field] ?? (settings.nodeShapeMappings[field] = Object.create(null));
  const categories = [...new Set(nodes.map(node => threeDShapeCategory(node[field])))].sort();
  let index = Object.keys(mapping).length;
  categories.forEach(category => {
    if (!Object.prototype.hasOwnProperty.call(mapping, category)) {
      mapping[category] = THREE_D_NODE_SHAPES[index++ % THREE_D_NODE_SHAPES.length].value;
    }
  });
}

export interface ThreeDLink {
  key: string;
  source: string | ThreeDNode;
  target: string | ThreeDNode;
  color: string;
  tooltip: string;
}

export interface ThreeDGraphData {
  nodes: ThreeDNode[];
  links: ThreeDLink[];
}

export function threeDNodeId(value: any): string {
  return String(value && typeof value === 'object' ? value._id ?? value.id ?? '' : value ?? '');
}

export function finiteThreeDPoint(value: any): ThreeDPoint | null {
  return value && ['x', 'y', 'z'].every(axis => typeof value[axis] === 'number' && Number.isFinite(value[axis]))
    ? { x: value.x, y: value.y, z: value.z }
    : null;
}

export function normalizeThreeDViewState(value: any): ThreeDViewState | null {
  const position = finiteThreeDPoint(value?.camera?.position);
  const target = finiteThreeDPoint(value?.camera?.target);
  if (value?.version !== 1 || !position || !target
    || Math.hypot(position.x - target.x, position.y - target.y, position.z - target.z) < 0.001) return null;
  const savedUp = finiteThreeDPoint(value.camera.up);
  // Sessions saved with orbit controls have no roll and use the upright default.
  const up = savedUp && Math.hypot(savedUp.x, savedUp.y, savedUp.z) > 0
    ? savedUp : { x: 0, y: 1, z: 0 };
  const positions: Record<string, ThreeDPoint> = Object.create(null);
  if (value.positions && typeof value.positions === 'object' && !Array.isArray(value.positions)) {
    Object.entries(value.positions).forEach(([id, point]) => {
      const normalized = finiteThreeDPoint(point);
      if (normalized) positions[id] = normalized;
    });
  }
  return { version: 1, camera: { position, target, up }, positions, layoutFrozen: value.layoutFrozen === true };
}

function bounded(value: any, fallback: number, min: number, max: number): number {
  if (value == null || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

// Retain Classic's widget names so style/session imports keep their 3D settings.
export function readThreeDSettings(widgets: Record<string, any>): ThreeDSettings {
  return {
    nodeShape: validShape(widgets['3DNet-node-shape']) ? widgets['3DNet-node-shape'] : 'sphere',
    nodeShapeField: String(widgets['3DNet-node-shape-variable'] ?? 'None'),
    nodeShapeMappings: readShapeMappings(widgets['3DNet-node-shape-mappings']),
    nodeSize: bounded(widgets['3DNet-node-radius'], 4, 0.1, 20),
    nodeSizeField: String(widgets['3DNet-node-radius-variable'] ?? 'None'),
    nodeTooltipField: String(widgets['3DNet-node-tooltip-variable'] ?? '_id'),
    linkWidth: bounded(widgets['3DNet-link-width'], 1.6, 0, 20),
    linkTransparency: bounded(widgets['3DNet-link-transparency'], 0, 0, 1),
    linkTooltipField: String(widgets['3DNet-link-tooltip-variable'] ?? 'None'),
  };
}

export function writeThreeDSettings(widgets: Record<string, any>, settings: ThreeDSettings): void {
  widgets['3DNet-node-shape'] = settings.nodeShape;
  widgets['3DNet-node-shape-variable'] = settings.nodeShapeField;
  widgets['3DNet-node-shape-mappings'] = readShapeMappings(settings.nodeShapeMappings);
  widgets['3DNet-node-radius'] = settings.nodeSize;
  widgets['3DNet-node-radius-variable'] = settings.nodeSizeField;
  widgets['3DNet-node-tooltip-variable'] = settings.nodeTooltipField;
  widgets['3DNet-link-width'] = settings.linkWidth;
  widgets['3DNet-link-transparency'] = settings.linkTransparency;
  widgets['3DNet-link-tooltip-variable'] = settings.linkTooltipField;
}

function tooltip(record: any, field: string): string {
  if (field === 'None') return '';
  const value = record[field];
  return value == null ? '' : Array.isArray(value) ? value.join(', ') : String(value);
}

/** Only renderer-owned records reach the physics engine: it mutates endpoints and coordinates. */
export function buildThreeDGraph(
  nodes: any[],
  links: any[],
  settings: ThreeDSettings,
  nodeColor: (node: any) => string,
  linkColor: (link: any) => string,
  previousNodes: ReadonlyMap<string, ThreeDNode> = new Map(),
  positions: ReadonlyMap<string, ThreeDPoint> = new Map(),
): ThreeDGraphData {
  const ids = new Set<string>();
  const renderedNodes: ThreeDNode[] = [];
  nodes.forEach(source => {
    const id = threeDNodeId(source);
    if (!id || ids.has(id)) return;
    ids.add(id);
    const node = previousNodes.get(id) ?? { id, ...positions.get(id) } as ThreeDNode;
    const rawValue = settings.nodeSizeField === 'None' ? 1 : Number(source[settings.nodeSizeField]);
    const mapping = settings.nodeShapeMappings[settings.nodeShapeField];
    const category = threeDShapeCategory(source[settings.nodeShapeField]);
    node.shape = settings.nodeShapeField !== 'None' && mapping && Object.prototype.hasOwnProperty.call(mapping, category)
      ? mapping[category] : settings.nodeShape;
    node.color = nodeColor(source);
    node.value = Number.isFinite(rawValue) && rawValue > 0 ? rawValue : 1;
    node.tooltip = tooltip(source, settings.nodeTooltipField);
    renderedNodes.push(node);
  });
  const renderedLinks: ThreeDLink[] = [];
  links.forEach((source, index) => {
    const from = threeDNodeId(source.source);
    const to = threeDNodeId(source.target);
    if (!ids.has(from) || !ids.has(to)) return;
    renderedLinks.push({
      key: JSON.stringify([from, to, index]), source: from, target: to,
      color: linkColor(source), tooltip: tooltip(source, settings.linkTooltipField),
    });
  });
  return { nodes: renderedNodes, links: renderedLinks };
}
