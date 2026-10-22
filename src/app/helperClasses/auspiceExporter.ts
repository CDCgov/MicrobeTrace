import {
  canonicalSplitKey,
  formatBootstrapSupportLabel,
  parseBootstrapSupportPercent,
} from '@app/workers/phylogenetic-bootstrap-utils';
import { AUSPICE_NUM_DATE_STORAGE_KEY } from './datedNewick';

export { AUSPICE_NUM_DATE_STORAGE_KEY } from './datedNewick';

export type AuspiceScalar = string | number | boolean;
export type AuspiceColoringType = 'boolean' | 'continuous' | 'temporal' | 'ordinal' | 'categorical';
export type AuspiceScaleValue = string | number;
export type AuspiceTreeScope = 'full' | 'visible';

export interface AuspiceNodeAttribute {
  value: AuspiceScalar;
}

export interface AuspiceNumDateAttribute extends AuspiceNodeAttribute {
  value: number;
  confidence?: [number, number];
  inferred?: boolean;
  raw_value?: string;
}

export interface AuspiceColoring {
  key: string;
  title: string;
  type: AuspiceColoringType;
  scale?: Array<[AuspiceScaleValue, string]>;
  legend?: AuspiceLegendEntry[];
}

export interface AuspiceLegendEntry {
  value: AuspiceScaleValue;
  display?: AuspiceScaleValue;
}

export interface AuspiceColoringStyle {
  type?: AuspiceColoringType;
  scale?: Array<[AuspiceScaleValue, string]>;
  legend?: AuspiceLegendEntry[];
}

export interface AuspiceExportFieldOption extends AuspiceColoring {
  synthetic?: boolean;
}

export interface AuspiceGeoCoordinates {
  latitude: number;
  longitude: number;
}

export interface AuspiceGeoResolution {
  key: string;
  title?: string;
  demes: Record<string, AuspiceGeoCoordinates>;
}

export interface AuspiceGeographyField {
  key: string;
  title: string;
  field: string;
}

export interface AuspiceMapLookupData {
  countries?: { features?: any[] };
  states?: { features?: any[] };
  counties?: { features?: any[] };
  zipcodes?: any[];
  tracts?: any[];
}

export interface AuspiceTreeNode {
  name: string;
  node_attrs: Record<string, number | AuspiceNodeAttribute | AuspiceNumDateAttribute>;
  branch_attrs?: {
    labels?: Record<string, string>;
  };
  children?: AuspiceTreeNode[];
}

export interface AuspiceMeta {
  title: string;
  updated: string;
  panels: Array<'tree' | 'map'>;
  colorings?: AuspiceColoring[];
  filters?: string[];
  geo_resolutions?: AuspiceGeoResolution[];
  display_defaults: {
    distance_measure: 'div' | 'num_date';
    color_by?: string;
    geo_resolution?: string;
    branch_label?: string;
  };
}

export interface AuspiceV2Dataset {
  version: 'v2';
  meta: AuspiceMeta;
  tree: AuspiceTreeNode;
}

export interface AuspiceSourceTreeNode {
  id?: unknown;
  length?: unknown;
  children?: AuspiceSourceTreeNode[];
  [key: string]: any;
}

export interface AuspiceBootstrapMetadata {
  supportBySplitKey?: Record<string, number>;
  labels?: string[];
  decimalLength?: number;
}

export interface AuspiceExportOptions {
  tree: AuspiceSourceTreeNode;
  fullTree?: AuspiceSourceTreeNode;
  attributeTree?: AuspiceSourceTreeNode;
  nodes?: any[];
  nodeFields?: string[];
  metadataFieldKeys?: string[];
  coloringFieldKeys?: string[];
  filterFieldKeys?: string[];
  treeScope?: AuspiceTreeScope;
  title?: string;
  updated?: Date | string;
  colorBy?: string;
  temporalFields?: string[];
  coloringStyles?: Record<string, AuspiceColoringStyle>;
  latitudeField?: string;
  longitudeField?: string;
  geographyFields?: AuspiceGeographyField[];
  bootstrap?: AuspiceBootstrapMetadata | null;
}

export type AuspiceCoordinateResolutionOptions = Pick<
  AuspiceExportOptions,
  'nodes' | 'latitudeField' | 'longitudeField' | 'geographyFields'
>;

interface ExportField {
  sourceKey: string;
  auspiceKey: string;
  coloring: AuspiceColoring;
}

interface BuiltGeography {
  resolutions: AuspiceGeoResolution[];
  traitsByLeaf: Map<string, Map<string, string>>;
  defaultResolutionKey?: string;
}

interface NormalizedGeographyField extends AuspiceGeographyField {
  requestedKey: string;
}

interface TreeAttributeIndex {
  byDescendantLeaves: Map<string, Record<string, any>>;
  bySplit: Map<string, Record<string, any>>;
  leafUniverse: string[];
}

const SYNTHETIC_LOCATION_KEY = 'microbetrace_location';
const DEFAULT_TITLE = 'MicrobeTrace Auspice export';
const INTERNAL_NODE_PREFIX = 'NODE_';
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2}|XX)-(\d{2}|XX)$/i;
const COORDINATE_PATTERN = /^([+-]?(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))(?:[eE][+-]?\d+)?)(?:\s*([NSEW]))?$/i;
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const COLORING_TYPES = new Set<AuspiceColoringType>([
  'boolean',
  'continuous',
  'temporal',
  'ordinal',
  'categorical',
]);

const EXCLUDED_FIELD_KEYS = new Set([
  'seq',
  'sequence',
  '_seq',
  '_seqint',
  '_cigar',
  '_diff',
  '_ambiguity',
  'mutations',
  'data',
  'length',
  'depth',
  'height',
  'parent',
  'children',
  '_guid',
  'representing',
  'respresenting',
  'x',
  'y',
  'vx',
  'vy',
  'fx',
  'fy',
  'foci',
  'index',
  'hasdistance',
  'nodesize',
  '_j',
  '_theta',
  '_jlat',
  '_jlon',
  AUSPICE_NUM_DATE_STORAGE_KEY,
]);

const RESERVED_AUSPICE_KEYS = new Set([
  'div',
  'num_date',
  'vaccine',
  'hidden',
  'url',
  'author',
  'accession',
  'none',
  SYNTHETIC_LOCATION_KEY,
]);

const PROTOTYPE_SENSITIVE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

export class AuspiceExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuspiceExportError';
  }
}

export function normalizeAuspiceNumDateAttribute(
  value: unknown,
): AuspiceNumDateAttribute | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.value !== 'number' || !Number.isFinite(candidate.value)) return null;

  const normalized: AuspiceNumDateAttribute = { value: candidate.value };
  if (Object.prototype.hasOwnProperty.call(candidate, 'confidence')) {
    const confidence = candidate.confidence;
    if (!Array.isArray(confidence)
        || confidence.length !== 2
        || confidence.some(entry => (
          typeof entry !== 'number' || !Number.isFinite(entry)
        ))) {
      return null;
    }
    normalized.confidence = [confidence[0] as number, confidence[1] as number];
  }
  if (Object.prototype.hasOwnProperty.call(candidate, 'inferred')) {
    if (typeof candidate.inferred !== 'boolean') return null;
    normalized.inferred = candidate.inferred;
  }
  if (Object.prototype.hasOwnProperty.call(candidate, 'raw_value')) {
    if (typeof candidate.raw_value !== 'string') return null;
    normalized.raw_value = candidate.raw_value;
  }
  return normalized;
}

export function ensureAuspiceJsonFilename(value: unknown, fallback = 'microbetrace-auspice.json'): string {
  const trimmed = String(value ?? '').trim();
  const resolved = trimmed || fallback;
  return resolved.toLowerCase().endsWith('.json') ? resolved : `${resolved}.json`;
}

export function buildAuspiceV2Dataset(options: AuspiceExportOptions): AuspiceV2Dataset {
  if (!options?.tree) {
    throw new AuspiceExportError('A phylogenetic tree is required for Auspice export.');
  }

  const nodes = Array.isArray(options.nodes) ? options.nodes : [];
  const nodeByName = indexNodesByName(nodes);
  const exportTree = resolveExportTree(options);
  const leafNames = collectLeafNamesAndValidate(exportTree);
  validateLeafNameCompatibility(leafNames, nodeByName, nodes.length > 0);
  const attributeTree = options.attributeTree ?? options.fullTree;
  const attributeNodes = [
    ...nodes,
    ...collectTreeAttributeNodes(exportTree),
    ...collectTreeAttributeNodes(attributeTree),
  ];
  const attributeData = indexTreeAttributeData(attributeTree);
  const exportLeavesByNode = indexDescendantLeaves(exportTree);
  const numDatesByNode = indexPreservedNumDates(
    exportTree,
    nodeByName,
    exportLeavesByNode,
    attributeData,
  );
  const availableExportFields = buildExportFields(
    options,
    attributeNodes,
    numDatesByNode !== null,
  );
  const exportFields = selectExportFields(availableExportFields, options.metadataFieldKeys);
  const geography = buildGeography(options, leafNames, nodeByName, availableExportFields);
  const geographyKeys = new Set(geography.resolutions.map(resolution => resolution.key));
  const usedNames = new Set(leafNames);
  const bootstrapUniverse = options.bootstrap?.labels?.length
    ? options.bootstrap.labels.map(value => String(value))
    : leafNames;
  let nextInternalNodeId = 0;
  let exportedBootstrapLabel = false;

  const nextInternalName = (): string => {
    let candidate: string;
    do {
      candidate = `${INTERNAL_NODE_PREFIX}${String(nextInternalNodeId++).padStart(7, '0')}`;
    } while (usedNames.has(candidate));
    usedNames.add(candidate);
    return candidate;
  };

  const convertTree = (
    source: AuspiceSourceTreeNode,
    parentDivergence: number,
    isRoot: boolean,
  ): AuspiceTreeNode => {
    const children = Array.isArray(source.children) ? source.children : [];
    const branchLength = readBranchLength(source.length, isRoot);
    const divergence = isRoot ? 0 : parentDivergence + branchLength;
    const isLeaf = children.length === 0;
    const name = isLeaf ? String(source.id ?? '') : nextInternalName();
    const nodeAttrs: Record<
      string,
      number | AuspiceNodeAttribute | AuspiceNumDateAttribute
    > = Object.create(null);
    nodeAttrs.div = divergence;
    const numDate = numDatesByNode?.get(source);
    if (numDate) nodeAttrs.num_date = { ...numDate };
    const sourceName = String(source.id ?? '');
    const sessionNode = sourceName.trim() ? nodeByName.get(sourceName) : undefined;
    const matchingAttributeData = getMatchingTreeAttributeData(
      source,
      isRoot,
      exportLeavesByNode,
      attributeData,
    );

    exportFields.forEach(field => {
      // A trait used as a geographic resolution must only be present when its
      // value has a matching deme. Geography is added below for mapped tips;
      // skipping it here prevents unmapped tips and internal nodes from
      // retaining ordinary metadata values which Auspice cannot place.
      if (geographyKeys.has(field.auspiceKey)) return;
      const rawValue = getNodeAttributeValue(
        source,
        sessionNode,
        matchingAttributeData,
        field.sourceKey,
      );
      if (isExportableScalar(rawValue)) {
        nodeAttrs[field.auspiceKey] = { value: rawValue };
      }
    });

    if (isLeaf) {
      geography.traitsByLeaf.get(name)?.forEach((value, key) => {
        nodeAttrs[key] = { value };
      });
    }

    const labels: Record<string, string> = Object.create(null);
    if (!isLeaf) {
      const sourceLabel = String(source.id ?? '').trim();
      const attributeLabel = String(
        matchingAttributeData?._id ?? matchingAttributeData?.id ?? '',
      ).trim();
      const originalLabel = sourceLabel || attributeLabel;
      const support = getBootstrapSupport(source, options.bootstrap, bootstrapUniverse, isRoot);
      if (support !== null) {
        labels.bootstrap = formatBootstrapSupportLabel(
          support,
          options.bootstrap?.decimalLength ?? 1,
        );
        exportedBootstrapLabel = true;
      }
      if (originalLabel && !(support !== null && parseBootstrapSupportPercent(originalLabel) !== null)) {
        labels.microbetrace = originalLabel;
      }
    }

    const output: AuspiceTreeNode = {
      name,
      node_attrs: nodeAttrs,
    };

    if (Object.keys(labels).length) {
      output.branch_attrs = { labels };
    }
    if (children.length) {
      // Auspice lays out sibling branches by traversing its serialized child
      // arrays in reverse. Serialize the current MicrobeTrace order in reverse
      // so rotations and flips retain their visible orientation in Auspice.
      output.children = children
        .map(child => convertTree(child, divergence, false))
        .reverse();
    }

    return output;
  };

  const tree = convertTree(exportTree, 0, true);
  const selectedColoringKeys = normalizeSelectedKeys(options.coloringFieldKeys);
  const colorings = exportFields
    .filter(field => selectedColoringKeys === null || selectedColoringKeys.has(field.auspiceKey))
    .map(field => field.coloring);
  const hasNumDate = numDatesByNode !== null;
  if (hasNumDate
      && (selectedColoringKeys === null || selectedColoringKeys.has('num_date'))) {
    colorings.unshift({
      key: 'num_date',
      title: 'Sampling date',
      type: 'temporal',
    });
  }
  const geoResolutions = geography.resolutions;
  geoResolutions.forEach(resolution => {
    if ((selectedColoringKeys === null || selectedColoringKeys.has(resolution.key))
        && !colorings.some(coloring => coloring.key === resolution.key)) {
      colorings.push({
        key: resolution.key,
        title: resolution.title || resolution.key,
        type: 'categorical',
      });
    }
  });

  const fieldBySource = new Map(exportFields.map(field => [field.sourceKey, field]));
  const selectedColoring = fieldBySource.get(String(options.colorBy ?? ''));
  const displayDefaults: AuspiceMeta['display_defaults'] = {
    distance_measure: hasNumDate ? 'num_date' : 'div',
  };
  if (String(options.colorBy ?? '').toLowerCase() === 'num_date'
      && colorings.some(coloring => coloring.key === 'num_date')) {
    displayDefaults.color_by = 'num_date';
  } else if (selectedColoring
      && colorings.some(coloring => coloring.key === selectedColoring.auspiceKey)) {
    displayDefaults.color_by = selectedColoring.auspiceKey;
  }
  if (exportedBootstrapLabel) {
    displayDefaults.branch_label = 'bootstrap';
  }
  if (geography.defaultResolutionKey) {
    displayDefaults.geo_resolution = geography.defaultResolutionKey;
  }
  if (!displayDefaults.color_by && colorings.length) {
    displayDefaults.color_by = colorings.some(coloring => (
      coloring.key === geography.defaultResolutionKey
    ))
      ? geography.defaultResolutionKey
      : colorings[0].key;
  }

  const meta: AuspiceMeta = {
    title: String(options.title ?? '').trim() || DEFAULT_TITLE,
    updated: formatUpdatedDate(options.updated),
    panels: geoResolutions.length ? ['tree', 'map'] : ['tree'],
    display_defaults: displayDefaults,
  };
  if (colorings.length) {
    meta.colorings = colorings;
  }
  const selectedFilterKeys = normalizeSelectedKeys(options.filterFieldKeys)
    ?? new Set(colorings.map(coloring => coloring.key));
  const filters = exportFields
    .map(field => field.auspiceKey)
    .filter(key => selectedFilterKeys.has(key));
  geoResolutions.forEach(resolution => {
    if (selectedFilterKeys.has(resolution.key) && !filters.includes(resolution.key)) {
      filters.push(resolution.key);
    }
  });
  if (hasNumDate && selectedFilterKeys.has('num_date') && !filters.includes('num_date')) {
    filters.unshift('num_date');
  }
  if (filters.length) {
    meta.filters = filters;
  }
  if (geoResolutions.length) {
    meta.geo_resolutions = geoResolutions;
  }

  return {
    version: 'v2',
    meta,
    tree,
  };
}

export function getAuspiceExportFieldOptions(
  options: AuspiceExportOptions,
): AuspiceExportFieldOption[] {
  const nodes = Array.isArray(options.nodes) ? options.nodes : [];
  const exportTree = resolveExportTree(options);
  const nodeByName = indexNodesByName(nodes);
  const leafNames = collectLeafNamesAndValidate(exportTree);
  validateLeafNameCompatibility(leafNames, nodeByName, nodes.length > 0);
  const attributeTree = options.attributeTree ?? options.fullTree;
  const attributeNodes = [
    ...nodes,
    ...collectTreeAttributeNodes(exportTree),
    ...collectTreeAttributeNodes(attributeTree),
  ];
  const numDatesByNode = indexPreservedNumDates(
    exportTree,
    nodeByName,
    indexDescendantLeaves(exportTree),
    indexTreeAttributeData(attributeTree),
  );
  const exportFields = buildExportFields(
    options,
    attributeNodes,
    numDatesByNode !== null,
  );
  const fields: AuspiceExportFieldOption[] = exportFields
    .map(field => ({ ...field.coloring }));

  const existingKeys = new Set(fields.map(field => field.key));
  if (numDatesByNode) {
    fields.unshift({
      key: 'num_date',
      title: 'Sampling date',
      type: 'temporal',
      synthetic: true,
    });
    existingKeys.add('num_date');
  }
  buildGeography(options, leafNames, nodeByName, exportFields).resolutions.forEach(resolution => {
    if (existingKeys.has(resolution.key)) return;
    existingKeys.add(resolution.key);
    fields.push({
      key: resolution.key,
      title: resolution.title || resolution.key,
      type: 'categorical',
      synthetic: true,
    });
  });

  return fields;
}

function resolveExportTree(options: AuspiceExportOptions): AuspiceSourceTreeNode {
  if (options.treeScope === 'full' && options.fullTree) return options.fullTree;
  return options.tree;
}

function getTreeNodeData(source: AuspiceSourceTreeNode): Record<string, any> | null {
  const data = source?.data;
  return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
}

function collectTreeAttributeNodes(tree: AuspiceSourceTreeNode | undefined): any[] {
  if (!tree) return [];
  const attributeNodes: any[] = [];
  const visit = (node: AuspiceSourceTreeNode): void => {
    const data = getTreeNodeData(node);
    if (data) attributeNodes.push(data);
    (Array.isArray(node.children) ? node.children : []).forEach(visit);
  };
  visit(tree);
  return attributeNodes;
}

function getNodeAttributeValue(
  source: AuspiceSourceTreeNode,
  sessionNode: any,
  attributeData: Record<string, any> | undefined,
  field: string,
): unknown {
  if (sessionNode && Object.prototype.hasOwnProperty.call(sessionNode, field)) {
    return sessionNode[field];
  }
  const sourceData = getTreeNodeData(source);
  if (sourceData && Object.prototype.hasOwnProperty.call(sourceData, field)) {
    return sourceData[field];
  }
  return attributeData && Object.prototype.hasOwnProperty.call(attributeData, field)
    ? attributeData[field]
    : undefined;
}

function indexDescendantLeaves(
  tree: AuspiceSourceTreeNode | undefined,
): Map<AuspiceSourceTreeNode, string[]> {
  const leavesByNode = new Map<AuspiceSourceTreeNode, string[]>();
  if (!tree) return leavesByNode;

  const visit = (node: AuspiceSourceTreeNode): string[] => {
    const children = Array.isArray(node.children) ? node.children : [];
    const leaves = children.length
      ? children.flatMap(visit)
      : [String(node.id ?? '')];
    leavesByNode.set(node, leaves);
    return leaves;
  };
  visit(tree);
  return leavesByNode;
}

function indexTreeAttributeData(
  tree: AuspiceSourceTreeNode | undefined,
): TreeAttributeIndex {
  const byDescendantLeaves = new Map<string, Record<string, any>>();
  const bySplit = new Map<string, Record<string, any>>();
  const ambiguousDescendantKeys = new Set<string>();
  const ambiguousSplitKeys = new Set<string>();
  if (!tree) return { byDescendantLeaves, bySplit, leafUniverse: [] };

  const leavesByNode = indexDescendantLeaves(tree);
  const leafUniverse = leavesByNode.get(tree) ?? [];
  const visit = (node: AuspiceSourceTreeNode, isRoot: boolean): void => {
    const leaves = leavesByNode.get(node) ?? [];
    const descendantKey = createLeafSetKey(leaves);
    const data = getTreeNodeData(node);
    if (descendantKey && data) {
      addUniqueTreeAttributeData(
        byDescendantLeaves,
        ambiguousDescendantKeys,
        descendantKey,
        data,
      );
      if (!isRoot) {
        const splitKey = canonicalSplitKey(leaves, leafUniverse);
        if (splitKey) {
          addUniqueTreeAttributeData(bySplit, ambiguousSplitKeys, splitKey, data);
        }
      }
    }
    (Array.isArray(node.children) ? node.children : []).forEach(child => visit(child, false));
  };
  visit(tree, true);
  return { byDescendantLeaves, bySplit, leafUniverse };
}

function addUniqueTreeAttributeData(
  index: Map<string, Record<string, any>>,
  ambiguousKeys: Set<string>,
  key: string,
  data: Record<string, any>,
): void {
  if (ambiguousKeys.has(key)) return;
  if (index.has(key)) {
    index.delete(key);
    ambiguousKeys.add(key);
    return;
  }
  index.set(key, data);
}

function getMatchingTreeAttributeData(
  node: AuspiceSourceTreeNode,
  isRoot: boolean,
  leavesByNode: Map<AuspiceSourceTreeNode, string[]>,
  attributeIndex: TreeAttributeIndex,
): Record<string, any> | undefined {
  const leaves = leavesByNode.get(node) ?? [];
  const exactMatch = attributeIndex.byDescendantLeaves.get(createLeafSetKey(leaves));
  if (exactMatch || isRoot) return exactMatch;

  const splitKey = canonicalSplitKey(leaves, attributeIndex.leafUniverse);
  return splitKey ? attributeIndex.bySplit.get(splitKey) : undefined;
}

function indexPreservedNumDates(
  tree: AuspiceSourceTreeNode,
  nodeByName: Map<string, any>,
  leavesByNode: Map<AuspiceSourceTreeNode, string[]>,
  attributeIndex: TreeAttributeIndex,
): Map<AuspiceSourceTreeNode, AuspiceNumDateAttribute> | null {
  const numDates = new Map<AuspiceSourceTreeNode, AuspiceNumDateAttribute>();

  const visit = (
    node: AuspiceSourceTreeNode,
    isRoot: boolean,
  ): boolean => {
    const sourceName = String(node.id ?? '');
    const sessionNode = sourceName.trim() ? nodeByName.get(sourceName) : undefined;
    const attributeData = getMatchingTreeAttributeData(
      node,
      isRoot,
      leavesByNode,
      attributeIndex,
    );
    const sourceData = getTreeNodeData(node);
    const candidates = [
      sessionNode?.[AUSPICE_NUM_DATE_STORAGE_KEY],
      sourceData?.[AUSPICE_NUM_DATE_STORAGE_KEY],
      attributeData?.[AUSPICE_NUM_DATE_STORAGE_KEY],
      sessionNode?.num_date,
      sourceData?.num_date,
      attributeData?.num_date,
    ];
    let numDate: AuspiceNumDateAttribute | null = null;
    for (const candidate of candidates) {
      numDate = normalizeAuspiceNumDateAttribute(candidate);
      if (numDate) break;
    }
    if (!numDate) return false;

    numDates.set(node, numDate);
    return (Array.isArray(node.children) ? node.children : [])
      .every(child => visit(child, false));
  };

  return visit(tree, true) ? numDates : null;
}

function createLeafSetKey(leafNames: string[]): string {
  return [...leafNames]
    .sort()
    .map(name => `${name.length}:${name}`)
    .join('|');
}

function collectLeafNamesAndValidate(root: AuspiceSourceTreeNode): string[] {
  const leafNames: string[] = [];
  const seen = new Set<string>();

  const visit = (node: AuspiceSourceTreeNode): void => {
    const children = Array.isArray(node.children) ? node.children : [];
    if (children.length) {
      children.forEach(visit);
      return;
    }

    const name = String(node.id ?? '');
    if (!name.trim()) {
      throw new AuspiceExportError('Every exported tree tip must have a non-empty sample ID.');
    }
    if (seen.has(name)) {
      throw new AuspiceExportError(`The tree contains the duplicate sample ID "${name}".`);
    }
    seen.add(name);
    leafNames.push(name);
  };

  visit(root);
  if (!leafNames.length) {
    throw new AuspiceExportError('The current phylogenetic tree has no tips to export.');
  }
  return leafNames;
}

function indexNodesByName(nodes: any[]): Map<string, any> {
  const index = new Map<string, any>();
  const ambiguousNames = new Set<string>();
  nodes.forEach(node => {
    const nodeNames = new Set([node?._id, node?.id]);
    nodeNames.forEach(value => {
      if (value === undefined || value === null) return;
      const key = String(value);
      if (!key.trim() || ambiguousNames.has(key)) return;
      const existingNode = index.get(key);
      if (existingNode && existingNode !== node) {
        index.delete(key);
        ambiguousNames.add(key);
        return;
      }
      index.set(key, node);
    });
  });
  if (ambiguousNames.size) {
    const identifiers = formatIdentifierList(Array.from(ambiguousNames));
    throw new AuspiceExportError(
      `Session data contains duplicate node IDs that identify more than one node: ${identifiers}. `
      + 'Make these node IDs unique before exporting to Auspice.',
    );
  }
  return index;
}

function validateLeafNameCompatibility(
  leafNames: string[],
  nodeByName: Map<string, any>,
  hasSessionNodes: boolean,
): void {
  if (!hasSessionNodes) return;
  const unmatchedLeaves = leafNames.filter(name => !nodeByName.has(name));
  if (!unmatchedLeaves.length) return;
  const identifiers = formatIdentifierList(unmatchedLeaves);
  throw new AuspiceExportError(
    `The exported tree contains tip IDs with no matching session node: ${identifiers}. `
    + 'Ensure tree leaf names exactly match the session node ID or _id values.',
  );
}

function formatIdentifierList(values: string[]): string {
  const sorted = [...values].sort((left, right) => left.localeCompare(right));
  const displayed = sorted.slice(0, 5).map(value => `"${value}"`).join(', ');
  const remaining = sorted.length - 5;
  return remaining > 0 ? `${displayed}, and ${remaining} more` : displayed;
}

function buildExportFields(
  options: AuspiceExportOptions,
  nodes: any[],
  preservedNumDateAvailable = false,
): ExportField[] {
  const sourceFields: string[] = [];
  const seenSourceFields = new Set<string>();
  const addSourceField = (value: unknown): void => {
    if (typeof value !== 'string' || !value.trim() || seenSourceFields.has(value)) return;
    seenSourceFields.add(value);
    sourceFields.push(value);
  };

  (options.nodeFields || []).forEach(addSourceField);
  nodes.forEach(node => Object.keys(node || {}).forEach(addSourceField));

  const temporalFields = new Set((options.temporalFields || []).map(field => String(field).toLowerCase()));
  const usedAuspiceKeys = new Set(['div', SYNTHETIC_LOCATION_KEY]);

  return sourceFields.flatMap(sourceKey => {
    if (EXCLUDED_FIELD_KEYS.has(sourceKey.toLowerCase())) return [];
    if (preservedNumDateAvailable && sourceKey.toLowerCase() === 'num_date') return [];
    const values = nodes
      .map(node => node?.[sourceKey])
      .filter(isExportableScalar);
    if (!values.length) return [];

    const auspiceKey = allocateAuspiceKey(sourceKey, usedAuspiceKeys);
    const inferredType = inferColoringType(values, temporalFields.has(sourceKey.toLowerCase()));
    return [{
      sourceKey,
      auspiceKey,
      coloring: buildColoring(
        auspiceKey,
        sourceKey,
        inferredType,
        values,
        getColoringStyle(options.coloringStyles, sourceKey),
      ),
    }];
  });
}

function getColoringStyle(
  styles: Record<string, AuspiceColoringStyle> | undefined,
  sourceKey: string,
): AuspiceColoringStyle | undefined {
  if (!styles || typeof styles !== 'object' || Array.isArray(styles)) return undefined;
  return Object.prototype.hasOwnProperty.call(styles, sourceKey) ? styles[sourceKey] : undefined;
}

function buildColoring(
  key: string,
  title: string,
  inferredType: AuspiceColoringType,
  values: AuspiceScalar[],
  style?: AuspiceColoringStyle,
): AuspiceColoring {
  const configuredType = style?.type && COLORING_TYPES.has(style.type) ? style.type : undefined;
  const normalizedScale = normalizeColorScale(style?.scale, values);
  let type = configuredType || inferredType;
  if (!configuredType && inferredType === 'continuous' && normalizedScale.length) {
    type = 'ordinal';
  }

  const coloring: AuspiceColoring = { key, title, type };
  if ((type === 'categorical' || type === 'ordinal') && normalizedScale.length) {
    coloring.scale = normalizedScale;
  }
  if (type === 'categorical' || type === 'ordinal') {
    const legend = normalizeColorLegend(style?.legend, values);
    if (legend.length) coloring.legend = legend;
  }
  return coloring;
}

function normalizeColorScale(
  scale: Array<[AuspiceScaleValue, string]> | undefined,
  values: AuspiceScalar[],
): Array<[AuspiceScaleValue, string]> {
  if (!Array.isArray(scale)) return [];
  const availableValues = getAvailableScaleValues(values);
  const usedValues = new Set<string>();
  const normalized: Array<[AuspiceScaleValue, string]> = [];
  scale.forEach(entry => {
    if (!Array.isArray(entry) || entry.length < 2) return;
    const value = resolveScaleValue(entry[0], availableValues);
    const color = typeof entry[1] === 'string' ? entry[1].trim() : '';
    if (value === null || !HEX_COLOR_PATTERN.test(color)) return;
    const valueKey = `${typeof value}:${String(value)}`;
    if (usedValues.has(valueKey)) return;
    usedValues.add(valueKey);
    normalized.push([value, color]);
  });
  return normalized;
}

function normalizeColorLegend(
  legend: AuspiceLegendEntry[] | undefined,
  values: AuspiceScalar[],
): AuspiceLegendEntry[] {
  if (!Array.isArray(legend)) return [];
  const availableValues = getAvailableScaleValues(values);
  const usedValues = new Set<string>();
  const normalized: AuspiceLegendEntry[] = [];
  legend.forEach(entry => {
    if (!entry || typeof entry !== 'object') return;
    const value = resolveScaleValue(entry.value, availableValues);
    if (value === null) return;
    const valueKey = `${typeof value}:${String(value)}`;
    if (usedValues.has(valueKey)) return;
    const display = entry.display;
    if (display !== undefined && typeof display !== 'string' && typeof display !== 'number') return;
    usedValues.add(valueKey);
    normalized.push(display === undefined ? { value } : { value, display });
  });
  return normalized;
}

function getAvailableScaleValues(values: AuspiceScalar[]): AuspiceScaleValue[] {
  const seen = new Set<string>();
  return values.flatMap(value => {
    if (typeof value !== 'string' && typeof value !== 'number') return [];
    const key = `${typeof value}:${String(value)}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [value];
  });
}

function resolveScaleValue(
  candidate: unknown,
  availableValues: AuspiceScaleValue[],
): AuspiceScaleValue | null {
  if (typeof candidate !== 'string' && typeof candidate !== 'number') return null;
  const exact = availableValues.find(value => typeof value === typeof candidate && value === candidate);
  if (exact !== undefined) return exact;
  return availableValues.find(value => String(value) === String(candidate)) ?? null;
}

function selectExportFields(fields: ExportField[], selectedKeys?: string[]): ExportField[] {
  const selected = normalizeSelectedKeys(selectedKeys);
  return selected === null
    ? fields
    : fields.filter(field => selected.has(field.auspiceKey));
}

function normalizeSelectedKeys(keys?: string[]): Set<string> | null {
  if (!Array.isArray(keys)) return null;
  return new Set(keys.map(key => String(key)));
}

function allocateAuspiceKey(sourceKey: string, usedKeys: Set<string>): string {
  const trimmed = sourceKey.trim();
  const lower = trimmed.toLowerCase();
  const safeAsIs = /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(trimmed)
    && !RESERVED_AUSPICE_KEYS.has(lower)
    && !PROTOTYPE_SENSITIVE_KEYS.has(lower)
    && !usedKeys.has(trimmed);

  if (safeAsIs) {
    usedKeys.add(trimmed);
    return trimmed;
  }

  const slug = lower
    .replace(/[^a-z0-9_.-]+/g, '_')
    .replace(/^[_\-.]+|[_\-.]+$/g, '') || 'field';
  const base = `microbetrace_${slug}`;
  let candidate = base;
  let suffix = 2;
  while (usedKeys.has(candidate) || RESERVED_AUSPICE_KEYS.has(candidate.toLowerCase())) {
    candidate = `${base}_${suffix++}`;
  }
  usedKeys.add(candidate);
  return candidate;
}

function isExportableScalar(value: unknown): value is AuspiceScalar {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  return typeof value === 'string' && value.trim().length > 0;
}

function inferColoringType(values: AuspiceScalar[], configuredTemporal: boolean): AuspiceColoringType {
  const temporalValues = values.every(value => (
    typeof value === 'number' || (typeof value === 'string' && isSupportedCalendarDate(value))
  ));
  if ((configuredTemporal || values.every(value => typeof value === 'string' && isSupportedCalendarDate(value)))
      && temporalValues) {
    return 'temporal';
  }
  if (values.every(value => typeof value === 'boolean')) return 'boolean';
  if (values.every(value => typeof value === 'number')) return 'continuous';
  return 'categorical';
}

function isSupportedCalendarDate(value: string): boolean {
  const match = ISO_DATE_PATTERN.exec(value.trim());
  if (!match) return false;
  const year = Number(match[1]);
  const monthToken = match[2].toUpperCase();
  const dayToken = match[3].toUpperCase();
  if (monthToken === 'XX') return dayToken === 'XX';

  const month = Number(monthToken);
  if (!Number.isInteger(month) || month < 1 || month > 12) return false;
  if (dayToken === 'XX') return true;

  const day = Number(dayToken);
  const daysInMonth = [
    31,
    isGregorianLeapYear(year) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ][month - 1];
  return Number.isInteger(day) && day >= 1 && day <= daysInMonth;
}

function isGregorianLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function buildGeography(
  options: AuspiceExportOptions,
  leafNames: string[],
  nodeByName: Map<string, any>,
  exportFields: ExportField[],
): BuiltGeography {
  const coordinateByLeaf = buildCoordinateIndex(options, leafNames, nodeByName);
  const traitsByLeaf = new Map<string, Map<string, string>>();
  if (!coordinateByLeaf.size) return { resolutions: [], traitsByLeaf };

  const geographyFields = normalizeGeographyFields(options.geographyFields, exportFields);
  const siteField = geographyFields.find(definition => definition.requestedKey === 'site');
  const namedFields = geographyFields.filter(definition => definition.requestedKey !== 'site');
  const resolutions: AuspiceGeoResolution[] = [];

  namedFields.forEach(definition => {
    const groups = new Map<string, { coordinates: AuspiceGeoCoordinates[]; leaves: string[] }>();
    coordinateByLeaf.forEach((coordinates, leafName) => {
      const deme = readDemeName(nodeByName.get(leafName)?.[definition.field]);
      if (!deme) return;
      const group = groups.get(deme) || { coordinates: [], leaves: [] };
      group.coordinates.push(coordinates);
      group.leaves.push(leafName);
      groups.set(deme, group);
    });
    if (!groups.size) return;

    const demes: Record<string, AuspiceGeoCoordinates> = Object.create(null);
    Array.from(groups.keys()).sort((left, right) => left.localeCompare(right)).forEach(deme => {
      const group = groups.get(deme)!;
      demes[deme] = geographicCentroid(group.coordinates);
      group.leaves.forEach(leafName => setGeographyTrait(
        traitsByLeaf,
        leafName,
        definition.key,
        deme,
      ));
    });
    resolutions.push({ key: definition.key, title: definition.title, demes });
  });

  const coordinateGroups = new Map<string, {
    coordinates: AuspiceGeoCoordinates;
    leaves: string[];
    namesByPriority: Array<Set<string>>;
  }>();
  const pointNameFields = [
    ...(siteField ? [siteField] : []),
    ...[...namedFields].reverse(),
  ];
  coordinateByLeaf.forEach((coordinates, leafName) => {
    const coordinateKey = createCoordinateKey(coordinates);
    const group = coordinateGroups.get(coordinateKey) || {
      coordinates,
      leaves: [],
      namesByPriority: pointNameFields.map(() => new Set<string>()),
    };
    group.leaves.push(leafName);
    const node = nodeByName.get(leafName);
    pointNameFields.some((definition, priority) => {
      const candidate = readDemeName(node?.[definition.field]);
      if (!candidate) return false;
      group.namesByPriority[priority].add(candidate);
      return true;
    });
    coordinateGroups.set(coordinateKey, group);
  });

  const pointKey = siteField?.key || SYNTHETIC_LOCATION_KEY;
  const pointTitle = siteField?.title || 'MicrobeTrace location';
  const pointDemes: Record<string, AuspiceGeoCoordinates> = Object.create(null);
  const usedDemeNames = new Set<string>();
  Array.from(coordinateGroups.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .forEach(([, group], index) => {
      const preferredNames = group.namesByPriority.find(names => names.size > 0);
      const preferredName = Array.from(preferredNames || [])
        .sort((left, right) => left.localeCompare(right))[0];
      const fallbackName = `${siteField ? 'Site' : 'Location'} ${index + 1}`;
      const deme = allocateDemeName(preferredName || fallbackName, usedDemeNames);
      pointDemes[deme] = group.coordinates;
      group.leaves.forEach(leafName => setGeographyTrait(
        traitsByLeaf,
        leafName,
        pointKey,
        deme,
      ));
    });
  resolutions.push({ key: pointKey, title: pointTitle, demes: pointDemes });

  return {
    resolutions,
    traitsByLeaf,
    defaultResolutionKey: pointKey,
  };
}

function normalizeGeographyFields(
  fields: AuspiceGeographyField[] | undefined,
  exportFields: ExportField[],
): NormalizedGeographyField[] {
  const normalized: NormalizedGeographyField[] = [];
  const usedAuspiceKeys = new Set([
    'div',
    SYNTHETIC_LOCATION_KEY,
    ...exportFields.map(field => field.auspiceKey),
  ]);
  const exportFieldBySource = new Map(exportFields.map(field => [field.sourceKey, field]));
  const usedRequestedKeys = new Set<string>();
  const usedFields = new Set<string>();
  (Array.isArray(fields) ? fields : []).forEach(definition => {
    const field = String(definition?.field ?? '').trim();
    const requestedKey = normalizeGeographyKey(definition?.key);
    if (!field || field.toLowerCase() === 'none' || !requestedKey
        || usedRequestedKeys.has(requestedKey) || usedFields.has(field.toLowerCase())) {
      return;
    }
    const matchingExportField = exportFieldBySource.get(field);
    const canShareMetadataKey = matchingExportField?.auspiceKey === requestedKey
      && matchingExportField.coloring.type === 'categorical';
    const key = canShareMetadataKey
      ? requestedKey
      : allocateAuspiceKey(requestedKey, usedAuspiceKeys);
    usedRequestedKeys.add(requestedKey);
    usedAuspiceKeys.add(key);
    usedFields.add(field.toLowerCase());
    normalized.push({
      key,
      requestedKey,
      title: String(definition?.title ?? '').trim() || requestedKey,
      field,
    });
  });
  return normalized;
}

function normalizeGeographyKey(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function readDemeName(value: unknown): string | null {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null;
  if (typeof value !== 'string') return null;
  const name = value.trim();
  return name && name.toLowerCase() !== 'none' ? name : null;
}

function setGeographyTrait(
  traitsByLeaf: Map<string, Map<string, string>>,
  leafName: string,
  key: string,
  value: string,
): void {
  const traits = traitsByLeaf.get(leafName) || new Map<string, string>();
  traits.set(key, value);
  traitsByLeaf.set(leafName, traits);
}

function createCoordinateKey(coordinates: AuspiceGeoCoordinates): string {
  const latitude = Object.is(coordinates.latitude, -0) ? 0 : coordinates.latitude;
  const longitude = Object.is(coordinates.longitude, -0) ? 0 : coordinates.longitude;
  return `${latitude}|${longitude}`;
}

function allocateDemeName(preferredName: string, usedNames: Set<string>): string {
  let candidate = preferredName;
  let suffix = 2;
  while (usedNames.has(candidate)) candidate = `${preferredName} (${suffix++})`;
  usedNames.add(candidate);
  return candidate;
}

function geographicCentroid(coordinates: AuspiceGeoCoordinates[]): AuspiceGeoCoordinates {
  if (coordinates.length === 1) return { ...coordinates[0] };
  let x = 0;
  let y = 0;
  let z = 0;
  coordinates.forEach(coordinate => {
    const latitude = coordinate.latitude * Math.PI / 180;
    const longitude = coordinate.longitude * Math.PI / 180;
    const latitudeCosine = Math.cos(latitude);
    x += latitudeCosine * Math.cos(longitude);
    y += latitudeCosine * Math.sin(longitude);
    z += Math.sin(latitude);
  });
  const horizontal = Math.sqrt(x * x + y * y);
  if (horizontal < 1e-12 && Math.abs(z) < 1e-12) {
    return {
      latitude: roundCoordinate(coordinates.reduce((sum, value) => sum + value.latitude, 0) / coordinates.length),
      longitude: roundCoordinate(coordinates.reduce((sum, value) => sum + value.longitude, 0) / coordinates.length),
    };
  }
  return {
    latitude: roundCoordinate(Math.atan2(z, horizontal) * 180 / Math.PI),
    longitude: roundCoordinate(Math.atan2(y, x) * 180 / Math.PI),
  };
}

function roundCoordinate(value: number): number {
  return Number(value.toFixed(8));
}

/**
 * Resolves export-only coordinate copies from MicrobeTrace's bundled map
 * lookup data. Existing node coordinates and configured latitude/longitude
 * fields take precedence; administrative lookups are only fallbacks.
 */
export function resolveAuspiceExportNodeCoordinates(
  options: AuspiceCoordinateResolutionOptions,
  mapData: AuspiceMapLookupData,
): any[] {
  const nodes = Array.isArray(options.nodes) ? options.nodes : [];
  const geographyFields = (Array.isArray(options.geographyFields) ? options.geographyFields : [])
    .map(definition => ({
      ...definition,
      key: normalizeGeographyKey(definition?.key),
      field: String(definition?.field ?? '').trim(),
    }))
    .filter(definition => definition.key && definition.field)
    .sort((left, right) => geographyLookupPriority(left.key) - geographyLookupPriority(right.key));
  const stateField = geographyFields.find(definition => (
    definition.key === 'state' || definition.key === 'division'
  ))?.field;

  return nodes.map(node => {
    const resolvedNode = { ...node };
    const directCoordinates = resolveCoordinates(
      node,
      options.latitudeField,
      options.longitudeField,
    );
    if (directCoordinates) {
      resolvedNode._lat = directCoordinates.latitude;
      resolvedNode._lon = directCoordinates.longitude;
      return resolvedNode;
    }

    let lookupCoordinates: AuspiceGeoCoordinates | null = null;
    geographyFields.forEach(definition => {
      const candidate = resolveMapLookupCoordinates(
        node,
        definition,
        stateField,
        mapData,
      );
      if (candidate) lookupCoordinates = candidate;
    });
    if (lookupCoordinates) {
      resolvedNode._lat = lookupCoordinates.latitude;
      resolvedNode._lon = lookupCoordinates.longitude;
    }
    return resolvedNode;
  });
}

function geographyLookupPriority(key: string): number {
  return {
    country: 1,
    state: 2,
    division: 2,
    county: 3,
    zipcode: 4,
    tract: 5,
  }[key] ?? 0;
}

function resolveMapLookupCoordinates(
  node: any,
  definition: Pick<AuspiceGeographyField, 'key' | 'field'>,
  stateField: string | undefined,
  mapData: AuspiceMapLookupData,
): AuspiceGeoCoordinates | null {
  const value = node?.[definition.field];
  if (value === undefined || value === null || String(value).trim() === '') return null;

  if (definition.key === 'country') {
    return coordinatesFromMapFeature(findMapFeature(
      mapData.countries?.features,
      expandCountryLookupValues(value),
      ['id', 'name'],
    ));
  }
  if (definition.key === 'state' || definition.key === 'division') {
    return coordinatesFromMapFeature(findMapFeature(
      mapData.states?.features,
      [value],
      ['id', 'name', 'usps'],
    ));
  }
  if (definition.key === 'county') {
    return coordinatesFromMapFeature(findCountyFeature(
      mapData.counties?.features,
      value,
      stateField ? node?.[stateField] : undefined,
      mapData.states?.features,
    ));
  }
  if (definition.key === 'zipcode') {
    return coordinatesFromLookupRow(findIdentifierRow(mapData.zipcodes, 'zipcode', value));
  }
  if (definition.key === 'tract') {
    return coordinatesFromLookupRow(findIdentifierRow(mapData.tracts, 'tract', value));
  }
  return null;
}

function normalizeMapLookupValue(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function normalizeNumericMapIdentifier(value: unknown): string {
  const normalized = normalizeMapLookupValue(value);
  return /^\d+$/.test(normalized) ? normalized.replace(/^0+(?=\d)/, '') : normalized;
}

function expandCountryLookupValues(value: unknown): unknown[] {
  const values: unknown[] = [value];
  if (['us', 'usa', 'united states'].includes(normalizeMapLookupValue(value))) {
    values.push('United States of America', 'USA', 'United States', 'US');
  }
  return values;
}

function findMapFeature(
  features: any[] | undefined,
  values: unknown[],
  propertyNames: string[],
): any | null {
  const normalizedValues = values
    .map(normalizeMapLookupValue)
    .filter(value => value !== '');
  if (!Array.isArray(features) || !normalizedValues.length) return null;

  return features.find(feature => {
    const properties = feature?.properties || {};
    return propertyNames.some(propertyName => {
      const featureValue = propertyName === 'id' ? feature?.id : properties[propertyName];
      return normalizedValues.includes(normalizeMapLookupValue(featureValue));
    });
  }) ?? null;
}

function findCountyFeature(
  features: any[] | undefined,
  countyValue: unknown,
  stateValue: unknown,
  stateFeatures: any[] | undefined,
): any | null {
  if (!Array.isArray(features)) return null;
  const identifier = normalizeNumericMapIdentifier(countyValue);
  const fipsMatch = features.find(feature => (
    normalizeNumericMapIdentifier(feature?.properties?.fips) === identifier
  ));
  if (fipsMatch) return fipsMatch;

  const countyName = normalizeMapLookupValue(countyValue).replace(/\s+county$/, '');
  let candidates = features.filter(feature => (
    normalizeMapLookupValue(feature?.properties?.name).replace(/\s+county$/, '') === countyName
  ));
  if (stateValue !== undefined && stateValue !== null && String(stateValue).trim()) {
    const stateFeature = findMapFeature(stateFeatures, [stateValue], ['id', 'name', 'usps']);
    const stateCode = normalizeMapLookupValue(stateFeature?.properties?.usps || stateValue);
    candidates = candidates.filter(feature => (
      normalizeMapLookupValue(feature?.properties?.state) === stateCode
    ));
  }
  return candidates.length === 1 ? candidates[0] : null;
}

function findIdentifierRow(rows: any[] | undefined, field: string, value: unknown): any | null {
  if (!Array.isArray(rows)) return null;
  const identifier = normalizeNumericMapIdentifier(value);
  return rows.find(row => normalizeNumericMapIdentifier(row?.[field]) === identifier) ?? null;
}

function coordinatesFromMapFeature(feature: any): AuspiceGeoCoordinates | null {
  return coordinatesFromLookupRow(feature?.properties);
}

function coordinatesFromLookupRow(row: any): AuspiceGeoCoordinates | null {
  return resolveCoordinates(row, undefined, undefined);
}

function buildCoordinateIndex(
  options: AuspiceExportOptions,
  leafNames: string[],
  nodeByName: Map<string, any>,
): Map<string, AuspiceGeoCoordinates> {
  const coordinates = new Map<string, AuspiceGeoCoordinates>();
  leafNames.forEach(leafName => {
    const node = nodeByName.get(leafName);
    const resolved = resolveCoordinates(node, options.latitudeField, options.longitudeField);
    if (resolved) coordinates.set(leafName, resolved);
  });
  return coordinates;
}

function resolveCoordinates(
  node: any,
  latitudeField?: string,
  longitudeField?: string,
): AuspiceGeoCoordinates | null {
  if (!node) return null;
  const candidates: Array<[unknown, unknown]> = [
    [node._lat, node._lon],
    [node.latitude, node.longitude],
  ];
  if (latitudeField && longitudeField && latitudeField !== 'None' && longitudeField !== 'None') {
    candidates.push([node[latitudeField], node[longitudeField]]);
  }

  for (const [latitudeValue, longitudeValue] of candidates) {
    const latitude = parseCoordinate(latitudeValue, 'S');
    const longitude = parseCoordinate(longitudeValue, 'W');
    if (latitude !== null && longitude !== null
        && latitude >= -90 && latitude <= 90
        && longitude >= -180 && longitude <= 180) {
      return { latitude, longitude };
    }
  }
  return null;
}

function parseCoordinate(value: unknown, negativeHemisphere: 'S' | 'W'): number | null {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  const text = String(value).trim().toUpperCase();
  const match = COORDINATE_PATTERN.exec(text);
  if (!match) return null;
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed)) return null;
  const hemisphere = match[2]?.toUpperCase();
  if (!hemisphere) return parsed;

  const positiveHemisphere = negativeHemisphere === 'S' ? 'N' : 'E';
  if (hemisphere !== negativeHemisphere && hemisphere !== positiveHemisphere) return null;
  if ((match[1].startsWith('-') && hemisphere === positiveHemisphere)
      || (match[1].startsWith('+') && hemisphere === negativeHemisphere)) {
    return null;
  }
  if (hemisphere === negativeHemisphere) return -Math.abs(parsed);
  if (hemisphere === positiveHemisphere) return Math.abs(parsed);
  return parsed;
}

function getBootstrapSupport(
  node: AuspiceSourceTreeNode,
  bootstrap: AuspiceBootstrapMetadata | null | undefined,
  allLeafIds: string[],
  isRoot: boolean,
): number | null {
  if (isRoot || !bootstrap?.supportBySplitKey) return null;
  const splitKey = canonicalSplitKey(collectLeafNames(node), allLeafIds);
  if (!splitKey || !Object.prototype.hasOwnProperty.call(bootstrap.supportBySplitKey, splitKey)) {
    return null;
  }
  const support = Number(bootstrap.supportBySplitKey[splitKey]);
  return Number.isFinite(support) && support >= 0 && support <= 100 ? support : null;
}

function collectLeafNames(node: AuspiceSourceTreeNode): string[] {
  const children = Array.isArray(node.children) ? node.children : [];
  if (!children.length) return [String(node.id ?? '')];
  return children.flatMap(collectLeafNames);
}

function readBranchLength(value: unknown, isRoot: boolean): number {
  if (value === undefined || value === null || value === '') return 0;
  const branchLength = Number(value);
  if (!Number.isFinite(branchLength)) {
    throw new AuspiceExportError('The current tree contains a non-finite branch length.');
  }
  if (branchLength < 0) {
    throw new AuspiceExportError('The current tree contains a negative branch length.');
  }
  return isRoot ? 0 : branchLength;
}

function formatUpdatedDate(value?: Date | string): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = value instanceof Date ? value : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}
