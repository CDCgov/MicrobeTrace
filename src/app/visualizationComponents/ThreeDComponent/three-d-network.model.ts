import { normalizeNodeStyleCategoryValue } from '@app/contactTraceCommonServices/color-mapping.service';
import { formatNetworkLinkDistance, formatNetworkLinkDistanceLabel, getNetworkLinkExtremities, hasVisibleNetworkLinkDistance, isNetworkFlagEnabled } from '@app/contactTraceCommonServices/network-link-presentation';

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
  nodeTooltipFields: string[];
  nodeSizeMin: number;
  nodeSizeMax: number;
  nodeLabelField: string;
  nodeLabelSize: number;
  nodeLabelOrientation: string;
  nodeBorderWidth: number;
  linkWidth: number;
  linkWidthField: string;
  linkWidthMin: number;
  linkWidthMax: number;
  linkWidthReciprocal: boolean;
  linkTransparency: number;
  linkOpacityOverride: boolean;
  linkTooltipField: string;
  linkTooltipFields: string[];
  linkLabelField: string;
  linkLabelSize: number;
  linkLabelDecimals: number;
  linkLength: number;
  linkArrows: boolean;
  linkBidirectional: boolean;
  // Shared display preferences are read here but never written by writeThreeDSettings.
  distanceMetric: string;
  distanceDisplayFormat: string;
  highlightNeighbors: boolean;
}

export interface ThreeDNode {
  id: string;
  shape: ThreeDNodeShape;
  color: string;
  value: number;
  tooltip: string;
  radius?: number;
  label?: string;
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
  return normalizeNodeStyleCategoryValue(value);
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

export interface ThreeDLinkColors {
  color: string;
  overlayColor?: string;
}

export interface ThreeDLink extends ThreeDLinkColors {
  key: string;
  source: string | ThreeDNode;
  target: string | ThreeDNode;
  tooltip: string;
  width?: number;
  label?: string;
  targetArrow?: boolean;
  sourceArrow?: boolean;
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

function tooltipFields(value: unknown, fallback: string): string[] {
  return [...new Set((Array.isArray(value) ? value : [value ?? fallback])
    .filter(field => typeof field === 'string' && field && field !== 'None'))] as string[];
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
    nodeTooltipFields: tooltipFields(widgets['3DNet-node-tooltip-fields'] ?? widgets['3DNet-node-tooltip-variable'], '_id'),
    nodeSizeMin: bounded(widgets['3DNet-node-radius-min'], 2, 0.1, 20),
    nodeSizeMax: bounded(widgets['3DNet-node-radius-max'], 10, 0.1, 20),
    nodeLabelField: String(widgets['3DNet-node-label-variable'] ?? 'None'),
    nodeLabelSize: bounded(widgets['3DNet-node-label-size'], 16, 6, 72),
    nodeLabelOrientation: ['Middle', 'Top', 'Bottom', 'Left', 'Right'].includes(widgets['3DNet-node-label-orientation'])
      ? widgets['3DNet-node-label-orientation'] : 'Right',
    nodeBorderWidth: bounded(widgets['3DNet-node-border-width'], 0, 0, 10),
    linkWidth: bounded(widgets['3DNet-link-width'], 1.6, 0, 30),
    linkWidthField: String(widgets['3DNet-link-width-variable'] ?? 'None'),
    linkWidthMin: bounded(widgets['3DNet-link-width-min'], 0.3, 0, 30),
    linkWidthMax: bounded(widgets['3DNet-link-width-max'], 3, 0, 30),
    linkWidthReciprocal: widgets['3DNet-link-width-reciprocal'] === true,
    linkTransparency: bounded(widgets['3DNet-link-transparency'], 0, 0, 1),
    linkOpacityOverride: widgets['3DNet-link-opacity-override-enabled'] === true
      || Number(widgets['3DNet-link-transparency']) > 0,
    linkTooltipField: String(widgets['3DNet-link-tooltip-variable'] ?? 'None'),
    linkTooltipFields: tooltipFields(widgets['3DNet-link-tooltip-fields'] ?? widgets['3DNet-link-tooltip-variable'], 'None'),
    linkLabelField: String(widgets['3DNet-link-label-variable'] ?? 'None'),
    linkLabelSize: bounded(widgets['3DNet-link-label-size'], 12, 6, 72),
    linkLabelDecimals: Math.round(bounded(widgets['3DNet-link-label-decimal-length'], 3, 0, 6)),
    linkLength: bounded(widgets['3DNet-link-length'], 50, 20, 170),
    linkArrows: isNetworkFlagEnabled(widgets['3DNet-link-directed']),
    linkBidirectional: isNetworkFlagEnabled(widgets['3DNet-link-bidirectional']),
    distanceMetric: String(widgets['default-distance-metric'] || ''),
    distanceDisplayFormat: String(widgets['tn93-distance-display-format'] || 'decimal'),
    highlightNeighbors: widgets['3DNet-node-highlight'] === true,
  };
}

export function writeThreeDSettings(widgets: Record<string, any>, settings: ThreeDSettings): void {
  widgets['3DNet-node-shape'] = settings.nodeShape;
  widgets['3DNet-node-shape-variable'] = settings.nodeShapeField;
  widgets['3DNet-node-shape-mappings'] = readShapeMappings(settings.nodeShapeMappings);
  widgets['3DNet-node-radius'] = settings.nodeSize;
  widgets['3DNet-node-radius-variable'] = settings.nodeSizeField;
  widgets['3DNet-node-tooltip-variable'] = settings.nodeTooltipField;
  widgets['3DNet-node-tooltip-fields'] = [...settings.nodeTooltipFields];
  widgets['3DNet-node-radius-min'] = settings.nodeSizeMin;
  widgets['3DNet-node-radius-max'] = settings.nodeSizeMax;
  widgets['3DNet-node-label-variable'] = settings.nodeLabelField;
  widgets['3DNet-node-label-size'] = settings.nodeLabelSize;
  widgets['3DNet-node-label-orientation'] = settings.nodeLabelOrientation;
  widgets['3DNet-node-border-width'] = settings.nodeBorderWidth;
  widgets['3DNet-link-width'] = settings.linkWidth;
  widgets['3DNet-link-width-variable'] = settings.linkWidthField;
  widgets['3DNet-link-width-min'] = settings.linkWidthMin;
  widgets['3DNet-link-width-max'] = settings.linkWidthMax;
  widgets['3DNet-link-width-reciprocal'] = settings.linkWidthReciprocal;
  widgets['3DNet-link-transparency'] = settings.linkTransparency;
  widgets['3DNet-link-opacity-override-enabled'] = settings.linkOpacityOverride;
  widgets['3DNet-link-tooltip-variable'] = settings.linkTooltipField;
  widgets['3DNet-link-tooltip-fields'] = [...settings.linkTooltipFields];
  widgets['3DNet-link-label-variable'] = settings.linkLabelField;
  widgets['3DNet-link-label-size'] = settings.linkLabelSize;
  widgets['3DNet-link-label-decimal-length'] = settings.linkLabelDecimals;
  widgets['3DNet-link-length'] = settings.linkLength;
  widgets['3DNet-link-directed'] = settings.linkArrows;
  widgets['3DNet-link-bidirectional'] = settings.linkBidirectional;
  widgets['3DNet-node-highlight'] = settings.highlightNeighbors;
}

function fieldText(record: any, field: string): string {
  if (field === 'None') return '';
  if (field === 'source_id') return threeDNodeId(record.source);
  if (field === 'target_id') return threeDNodeId(record.target);
  const value = record[field];
  return value == null ? '' : Array.isArray(value) ? value.join(', ') : String(value);
}

function tooltip(record: any, fields: string[], text = fieldText): string {
  return fields.map(field => fields.length > 1
    ? `${field === '_id' ? 'ID' : field.replace(/_/g, ' ')}: ${text(record, field)}`
    : text(record, field)).join('\n');
}

function scaledValues(records: any[], field: string, min: number, max: number, reciprocal = false): (record: any) => number {
  const numeric = (record: any) => {
    const value = record[field];
    const number = value == null || value === '' || typeof value === 'boolean' ? NaN : Number(value);
    return Number.isFinite(number) ? reciprocal ? number > 0 ? 1 / number : NaN : number : NaN;
  };
  let low = Infinity, high = -Infinity;
  records.forEach(record => { const n = numeric(record); if (Number.isFinite(n)) { low = Math.min(low, n); high = Math.max(high, n); } });
  const floor = Math.min(min, max), ceiling = Math.max(min, max);
  return record => {
    const n = numeric(record);
    if (!Number.isFinite(n)) return floor;
    return high > low ? floor + (ceiling - floor) * (n - low) / (high - low) : (floor + ceiling) / 2;
  };
}

/** Only renderer-owned records reach the physics engine: it mutates endpoints and coordinates. */
export function buildThreeDGraph(
  nodes: any[],
  links: any[],
  settings: ThreeDSettings,
  nodeColor: (node: any) => string,
  linkColor: (link: any) => string | ThreeDLinkColors,
  previousNodes: ReadonlyMap<string, ThreeDNode> = new Map(),
  positions: ReadonlyMap<string, ThreeDPoint> = new Map(),
): ThreeDGraphData {
  const ids = new Set<string>();
  const renderedNodes: ThreeDNode[] = [];
  const nodeRadius = settings.nodeSizeField === 'None' ? () => settings.nodeSize
    : scaledValues(nodes, settings.nodeSizeField, settings.nodeSizeMin, settings.nodeSizeMax);
  const linkWidth = settings.linkWidthField === 'None' ? () => settings.linkWidth
    : scaledValues(links, settings.linkWidthField, settings.linkWidthMin, settings.linkWidthMax, settings.linkWidthReciprocal);
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
    node.radius = settings.nodeSizeField === 'None' ? settings.nodeSize : nodeRadius(source);
    node.label = fieldText(source, settings.nodeLabelField);
    node.tooltip = tooltip(source, settings.nodeTooltipFields);
    renderedNodes.push(node);
  });
  const renderedLinks: ThreeDLink[] = [];
  links.forEach((source, index) => {
    const from = threeDNodeId(source.source);
    const to = threeDNodeId(source.target);
    if (!ids.has(from) || !ids.has(to)) return;
    const colors = linkColor(source);
    const arrows = getNetworkLinkExtremities(source, settings.linkArrows, settings.linkBidirectional);
    renderedLinks.push({
      key: JSON.stringify([from, to, index]), source: from, target: to,
      color: typeof colors === 'string' ? colors : colors.color,
      overlayColor: typeof colors === 'string' ? undefined : colors.overlayColor,
      tooltip: tooltip(source, settings.linkTooltipFields, (record, field) => field === 'distance'
        ? hasVisibleNetworkLinkDistance(record) ? formatNetworkLinkDistance(record.distance, settings) : 'N/A'
        : fieldText(record, field)),
      width: settings.linkWidthField === 'None' ? settings.linkWidth : linkWidth(source),
      targetArrow: arrows.head === 'arrow', sourceArrow: arrows.tail === 'arrow',
      label: settings.linkLabelField === 'distance' ? formatNetworkLinkDistanceLabel(source, settings, settings.linkLabelDecimals)
        : settings.linkLabelField === 'None' ? '' : typeof source[settings.linkLabelField] === 'number'
        ? source[settings.linkLabelField].toFixed(settings.linkLabelDecimals) : fieldText(source, settings.linkLabelField),
    });
  });
  return { nodes: renderedNodes, links: renderedLinks };
}
