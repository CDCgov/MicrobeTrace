import fs from 'fs';
import path from 'path';

import moment from 'moment';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

const tn93: typeof import('tn93') = require('tn93');

moment.suppressDeprecationWarnings = true;

import type { DistanceMetric, FileLoadSpec } from '../e2e/journeys/datasets/types';
import type {
  OracleComputationResult,
  OracleLinkDebugState,
  OracleManifest,
  OracleNodeDebugState,
  OracleSnapshot,
  OracleStep,
} from './types';

const DEFAULT_EPSILON_EXPONENT = -8;
const GENETIC_DISTANCE_ORIGIN = 'Genetic Distance';

type MutableNode = {
  id: string;
  order: number;
  seq?: string;
  data: Record<string, unknown>;
};

type MutableLink = {
  id: string;
  source: string;
  target: string;
  originOrder: string[];
  distanceOriginOrder: string[];
  distanceValuesByOrigin: Record<string, number>;
  primaryDistanceOrigin: string | null;
};

type MutableGraph = {
  nodesById: Map<string, MutableNode>;
  nodeOrder: string[];
  linksById: Map<string, MutableLink>;
};

type OracleState = {
  graph: MutableGraph;
  metric: DistanceMetric;
  threshold: number;
  nearestNeighborEnabled: boolean;
  epsilonExponent: number;
  timelineField: string | null;
  timelineStart: number | null;
  timelineEnd: number | null;
};

type CsvRow = Record<string, unknown>;

function normalizeNodeId(value: unknown): string {
  return String(value ?? '').trim();
}

function buildLinkId(source: string, target: string): string {
  return [normalizeNodeId(source), normalizeNodeId(target)].sort().join('-');
}

function toFiniteNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : parseFloat(String(value ?? '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function isTimelineDisabled(field: string | null): boolean {
  return field === null || field === 'None';
}

function stringifyTimelineValue(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value);
  return text.length > 0 ? text : '';
}

function isMissingDateLikeValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }

  const text = String(value).trim();
  return text === '' || text.toLowerCase() === 'null';
}

function parseMomentTimestamp(value: unknown): number | null {
  const parsed = moment(value as moment.MomentInput);
  if (!parsed.isValid()) {
    return null;
  }
  return parsed.toDate().getTime();
}

function defaultThresholdForMetric(metric: DistanceMetric): number {
  return metric === 'snps' ? 16 : 0.015;
}

function createGraph(): MutableGraph {
  return {
    nodesById: new Map<string, MutableNode>(),
    nodeOrder: [],
    linksById: new Map<string, MutableLink>(),
  };
}

function ensureNode(graph: MutableGraph, nodeId: string, patch: Partial<MutableNode> = {}): MutableNode {
  const id = normalizeNodeId(nodeId);
  if (!id) {
    throw new Error('Encountered an empty node identifier while building oracle graph.');
  }

  const existing = graph.nodesById.get(id);
  if (existing) {
    if (patch.seq) {
      existing.seq = patch.seq;
    }
    if (patch.data) {
      existing.data = { ...existing.data, ...patch.data };
    }
    return existing;
  }

  const created: MutableNode = {
    id,
    order: graph.nodeOrder.length,
    seq: patch.seq,
    data: patch.data ?? {},
  };
  graph.nodesById.set(id, created);
  graph.nodeOrder.push(id);
  return created;
}

function refreshPrimaryDistanceOrigin(link: MutableLink): void {
  if (
    link.primaryDistanceOrigin &&
    link.distanceOriginOrder.includes(link.primaryDistanceOrigin) &&
    Number.isFinite(link.distanceValuesByOrigin[link.primaryDistanceOrigin])
  ) {
    return;
  }

  link.primaryDistanceOrigin = link.distanceOriginOrder.find((origin) =>
    Number.isFinite(link.distanceValuesByOrigin[origin]),
  ) ?? null;
}

function addOrigin(link: MutableLink, origin: string): void {
  if (!link.originOrder.includes(origin)) {
    link.originOrder.push(origin);
  }
}

function addDistanceOrigin(link: MutableLink, origin: string, distance: number): void {
  addOrigin(link, origin);
  if (!link.distanceOriginOrder.includes(origin)) {
    link.distanceOriginOrder.push(origin);
  }
  if (!Number.isFinite(link.distanceValuesByOrigin[origin])) {
    link.distanceValuesByOrigin[origin] = distance;
  }
  if (!link.primaryDistanceOrigin) {
    link.primaryDistanceOrigin = origin;
  }
  refreshPrimaryDistanceOrigin(link);
}

function upsertLink(
  graph: MutableGraph,
  sourceValue: unknown,
  targetValue: unknown,
  origin: string,
  distance?: number | null,
): MutableLink {
  const source = normalizeNodeId(sourceValue);
  const target = normalizeNodeId(targetValue);

  if (!source || !target || source === target) {
    throw new Error(`Invalid oracle link endpoints: "${source}" -> "${target}"`);
  }

  ensureNode(graph, source);
  ensureNode(graph, target);

  const [canonicalSource, canonicalTarget] = [source, target].sort();
  const id = buildLinkId(canonicalSource, canonicalTarget);
  const existing = graph.linksById.get(id);

  if (existing) {
    addOrigin(existing, origin);
    if (distance !== undefined && distance !== null) {
      addDistanceOrigin(existing, origin, distance);
    }
    return existing;
  }

  const created: MutableLink = {
    id,
    source: canonicalSource,
    target: canonicalTarget,
    originOrder: [origin],
    distanceOriginOrder: [],
    distanceValuesByOrigin: {},
    primaryDistanceOrigin: null,
  };
  if (distance !== undefined && distance !== null) {
    addDistanceOrigin(created, origin, distance);
  }
  graph.linksById.set(id, created);
  return created;
}

function parseCsv(filePath: string): CsvRow[] {
  const text = fs.readFileSync(filePath, 'utf8');
  const result = Papa.parse<CsvRow>(text, {
    header: true,
    skipEmptyLines: true,
  });
  if (result.errors.length > 0) {
    throw new Error(
      `Oracle CSV parse failed for ${path.basename(filePath)}: ${result.errors[0].message}`,
    );
  }
  return result.data;
}

function parseFasta(filePath: string): Array<{ id: string; seq: string }> {
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split(/[\r\n]+/g);
  const records: Array<{ id: string; seq: string }> = [];
  let current: { id: string; seq: string } | null = null;

  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line || line.startsWith(';')) {
      return;
    }

    if (line.startsWith('>')) {
      if (current) {
        records.push(current);
      }
      current = {
        id: normalizeNodeId(line.slice(1)),
        seq: '',
      };
      return;
    }

    if (!current) {
      throw new Error(`Encountered FASTA sequence data before a header in ${path.basename(filePath)}.`);
    }

    current.seq += line.toUpperCase();
  });

  if (current) {
    records.push(current);
  }

  return records;
}

function parseMatrix(filePath: string): Array<{ source: string; target: string; distance: number }> {
  const workbook = XLSX.readFile(filePath);
  const preferredSheet =
    workbook.SheetNames.find((sheetName) => /matrix/i.test(sheetName)) ?? workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(
    workbook.Sheets[preferredSheet],
    { header: 1, raw: true, defval: null },
  );

  if (rows.length === 0) {
    return [];
  }

  const headerIds = rows[0]
    .slice(1)
    .map((value) => normalizeNodeId(value))
    .filter(Boolean);

  const links: Array<{ source: string; target: string; distance: number }> = [];

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    const source = normalizeNodeId(row[0]);
    if (!source) {
      continue;
    }

    for (let columnIndex = 1; columnIndex < row.length; columnIndex++) {
      const target = headerIds[columnIndex - 1];
      const distance = toFiniteNumber(row[columnIndex]);
      if (!target || target === source || distance === null) {
        continue;
      }

      links.push({ source, target, distance });
    }
  }

  return links;
}

function loadGraph(manifest: OracleManifest): MutableGraph {
  const graph = createGraph();
  const fixtureRoot = path.resolve(process.cwd(), 'cypress', 'fixtures');

  manifest.files.forEach((file) => {
    const filePath = path.resolve(fixtureRoot, file.name);

    switch (file.datatype) {
      case 'node': {
        const rows = parseCsv(filePath);
        rows.forEach((row) => {
          const keys = Object.keys(row);
          const nodeIdField = file.field1 ?? (row._id !== undefined ? '_id' : (row.id !== undefined ? 'id' : keys[0]));
          const seqField = file.field2 ?? (row.seq !== undefined ? 'seq' : '');
          const nodeId = normalizeNodeId(row[nodeIdField]);
          if (!nodeId) {
            return;
          }

          const seq = seqField ? normalizeNodeId(row[seqField]).toUpperCase() : '';
          ensureNode(graph, nodeId, {
            seq: seq || undefined,
            data: row,
          });
        });
        break;
      }

      case 'link': {
        const rows = parseCsv(filePath);
        rows.forEach((row) => {
          const source = normalizeNodeId(row[file.field1 ?? 'source']);
          const target = normalizeNodeId(row[file.field2 ?? 'target']);
          if (!source || !target) {
            return;
          }

          const distance = file.field3 ? toFiniteNumber(row[file.field3]) : null;
          upsertLink(graph, source, target, file.name, distance);
        });
        break;
      }

      case 'matrix': {
        const matrixLinks = parseMatrix(filePath);
        matrixLinks.forEach(({ source, target, distance }) => {
          upsertLink(graph, source, target, file.name, distance);
        });
        break;
      }

      case 'fasta': {
        const records = parseFasta(filePath);
        records.forEach((record) => {
          ensureNode(graph, record.id, {
            seq: record.seq,
            data: { _id: record.id, seq: record.seq },
          });
        });
        break;
      }

      default:
        throw new Error(`Oracle does not yet support datatype "${file.datatype}" for ${file.name}.`);
    }
  });

  return graph;
}

function computeEarliestDateForField(graph: MutableGraph, field: string): number | null {
  if (!field.toLowerCase().includes('date')) {
    return null;
  }

  let earliest: number | null = null;

  graph.nodeOrder.forEach((nodeId) => {
    const node = graph.nodesById.get(nodeId);
    const rawValue = node?.data[field];
    if (rawValue === null || rawValue === undefined) {
      return;
    }

    const parsed = moment(rawValue as moment.MomentInput);
    if (!parsed.isValid() || !Number.isNaN(Number(rawValue))) {
      return;
    }

    const timestamp = parsed.toDate().getTime();
    earliest = earliest === null ? timestamp : Math.min(earliest, timestamp);
  });

  return earliest;
}

function resolveNodeTimelineState(
  node: MutableNode,
  timelineField: string | null,
  timelineStart: number | null,
  timelineEnd: number | null,
  earliestDateForField: number | null,
): OracleNodeDebugState {
  if (isTimelineDisabled(timelineField)) {
    return {
      id: node.id,
      visible: true,
      timelineField: null,
      rawTimelineValue: null,
      effectiveTimelineValue: null,
      parsedTimelineValue: null,
      backfilledMissingDate: false,
      hiddenByTimeline: false,
    };
  }

  const rawValue = node.data[timelineField];
  const rawTimelineValue = stringifyTimelineValue(rawValue);
  const shouldBackfillMissingDate =
    timelineStart === null &&
    earliestDateForField !== null &&
    isMissingDateLikeValue(rawValue);
  const effectiveTimestamp = shouldBackfillMissingDate
    ? earliestDateForField
    : parseMomentTimestamp(rawValue);
  const effectiveTimelineValue = shouldBackfillMissingDate
    ? new Date(earliestDateForField).toString()
    : rawTimelineValue;
  const visibleBecauseDateDoesNotFilter = !shouldBackfillMissingDate && effectiveTimestamp === null;
  const visible =
    timelineEnd === null ||
    (effectiveTimestamp !== null &&
      (timelineStart === null || timelineStart <= effectiveTimestamp) &&
      timelineEnd >= effectiveTimestamp) ||
    visibleBecauseDateDoesNotFilter;
  const hiddenByTimeline = !visible;

  return {
    id: node.id,
    visible,
    timelineField,
    rawTimelineValue,
    effectiveTimelineValue,
    parsedTimelineValue: effectiveTimestamp === null ? null : new Date(effectiveTimestamp).toISOString(),
    backfilledMissingDate: shouldBackfillMissingDate,
    hiddenByTimeline,
  };
}

function snps(source: Uint8Array, target: Uint8Array): number {
  const n = Math.min(source.length, target.length);
  let sum = 0;
  for (let index = 0; index < n; index++) {
    const sourceChar = source[index];
    const targetChar = target[index];
    sum += sourceChar !== targetChar && sourceChar !== 17 && targetChar !== 17 ? 1 : 0;
  }
  return sum;
}

function removeOrigin(link: MutableLink, origin: string): void {
  link.originOrder = link.originOrder.filter((value) => value !== origin);
  link.distanceOriginOrder = link.distanceOriginOrder.filter((value) => value !== origin);
  delete link.distanceValuesByOrigin[origin];
  if (link.primaryDistanceOrigin === origin) {
    link.primaryDistanceOrigin = null;
  }
  refreshPrimaryDistanceOrigin(link);
}

function replaceGeneticDistanceLinks(graph: MutableGraph, metric: DistanceMetric): void {
  Array.from(graph.linksById.entries()).forEach(([id, link]) => {
    if (!link.originOrder.includes(GENETIC_DISTANCE_ORIGIN)) {
      return;
    }

    removeOrigin(link, GENETIC_DISTANCE_ORIGIN);
    if (link.originOrder.length === 0) {
      graph.linksById.delete(id);
    }
  });

  const sequenceNodes = graph.nodeOrder
    .map((nodeId) => graph.nodesById.get(nodeId))
    .filter((node): node is MutableNode => Boolean(node?.seq));

  if (sequenceNodes.length === 0) {
    return;
  }

  const encodedSequences = new Map<string, Uint8Array>();
  sequenceNodes.forEach((node) => {
    encodedSequences.set(node.id, tn93.toInts(node.seq as string));
  });

  for (let sourceIndex = 0; sourceIndex < sequenceNodes.length; sourceIndex++) {
    const sourceNode = sequenceNodes[sourceIndex];
    const sourceSequence = encodedSequences.get(sourceNode.id) as Uint8Array;

    for (let targetIndex = 0; targetIndex < sourceIndex; targetIndex++) {
      const targetNode = sequenceNodes[targetIndex];
      const targetSequence = encodedSequences.get(targetNode.id) as Uint8Array;
      const distance = metric === 'snps'
        ? snps(sourceSequence, targetSequence)
        : tn93.onInts(sourceSequence, targetSequence, 'AVERAGE');

      upsertLink(graph, sourceNode.id, targetNode.id, GENETIC_DISTANCE_ORIGIN, distance);
    }
  }
}

function currentDistance(link: MutableLink): number | null {
  refreshPrimaryDistanceOrigin(link);
  if (!link.primaryDistanceOrigin) {
    return null;
  }
  const distance = link.distanceValuesByOrigin[link.primaryDistanceOrigin];
  return Number.isFinite(distance) ? distance : null;
}

function computeNearestNeighborIncludedLinkIds(
  graph: MutableGraph,
  epsilonExponent: number,
): Set<string> {
  const labels = [...graph.nodeOrder];
  const size = labels.length;
  if (size <= 1) {
    return new Set<string>();
  }

  const weights: Array<Array<number | null>> = Array.from({ length: size }, (_, rowIndex) =>
    Array.from({ length: size }, (_, columnIndex) => {
      if (rowIndex === columnIndex) {
        return 0;
      }

      const link = graph.linksById.get(buildLinkId(labels[rowIndex], labels[columnIndex]));
      const distance = link ? currentDistance(link) : null;
      return distance === null ? null : distance;
    }),
  );

  const parent = new Array<number>(size).fill(-1);
  const key = new Array<number>(size).fill(Number.MAX_VALUE);
  const inMst = new Array<boolean>(size).fill(false);
  key[0] = 0;

  const minKey = (): number => {
    let minValue = Number.MAX_VALUE;
    let minIndex = -1;

    for (let index = 0; index < size; index++) {
      if (!inMst[index] && key[index] < minValue) {
        minValue = key[index];
        minIndex = index;
      }
    }

    return minIndex;
  };

  for (let count = 0; count < size - 1; count++) {
    const sourceIndex = minKey();
    if (sourceIndex < 0) {
      continue;
    }

    inMst[sourceIndex] = true;
    const rowWeightSum = weights[sourceIndex].reduce((sum, value) => {
      return sum + (Number.isFinite(value) ? (value as number) : 0);
    }, 0);
    if (rowWeightSum === 0 && sourceIndex !== 0) {
      continue;
    }

    for (let targetIndex = 0; targetIndex < size; targetIndex++) {
      const weight = weights[sourceIndex][targetIndex];
      if (Number.isFinite(weight) && !inMst[targetIndex] && (weight as number) < key[targetIndex]) {
        parent[targetIndex] = sourceIndex;
        key[targetIndex] = weight as number;
      }
    }
  }

  const mstAdjacency = Array.from({ length: size }, () => [] as number[]);
  for (let index = 1; index < size; index++) {
    const parentIndex = parent[index];
    if (parentIndex < 0) {
      continue;
    }
    mstAdjacency[index].push(parentIndex);
    mstAdjacency[parentIndex].push(index);
  }

  const longestEdge = Array.from({ length: size }, () => Array.from({ length: size }, () => 0));
  const updateLongestEdgeFromRoot = (root: number): void => {
    const visited = new Array<boolean>(size).fill(false);
    const queue: number[] = [root];

    while (queue.length > 0) {
      const vertex = queue.shift();
      if (vertex === undefined) {
        continue;
      }
      visited[vertex] = true;

      mstAdjacency[vertex].forEach((neighbor) => {
        if (visited[neighbor]) {
          return;
        }

        queue.push(neighbor);
        const weight = weights[vertex][neighbor] ?? 0;
        const value = Math.max(
          weight as number,
          Math.max(longestEdge[root][neighbor], longestEdge[root][vertex]),
        );
        longestEdge[root][neighbor] = value;
        longestEdge[neighbor][root] = value;
      });
    }
  };

  for (let root = 0; root < size; root++) {
    updateLongestEdgeFromRoot(root);
  }

  const epsilon = Math.pow(10, epsilonExponent);
  const included = new Set<string>();

  for (let sourceIndex = 0; sourceIndex < size; sourceIndex++) {
    const nearestNeighbors = new Set<number>();

    for (let targetIndex = 0; targetIndex < size; targetIndex++) {
      const weight = weights[sourceIndex][targetIndex];
      if (
        Number.isFinite(weight) &&
        (weight as number) > 0 &&
        (weight as number) <= longestEdge[sourceIndex][targetIndex] * (1 + epsilon)
      ) {
        nearestNeighbors.add(targetIndex);
      }
    }

    const parentIndex = parent[sourceIndex];
    if (parentIndex >= 0) {
      nearestNeighbors.add(parentIndex);
    }

    nearestNeighbors.forEach((targetIndex) => {
      const linkId = buildLinkId(labels[sourceIndex], labels[targetIndex]);
      if (graph.linksById.has(linkId)) {
        included.add(linkId);
      }
    });
  }

  return included;
}

function computeConnectivity(
  nodeIds: string[],
  visibleLinkIds: string[],
  graph: MutableGraph,
): { components: number; singletons: number } {
  const adjacency = new Map<string, Set<string>>();
  nodeIds.forEach((nodeId) => adjacency.set(nodeId, new Set<string>()));

  visibleLinkIds.forEach((linkId) => {
    const link = graph.linksById.get(linkId);
    if (!link) {
      return;
    }
    adjacency.get(link.source)?.add(link.target);
    adjacency.get(link.target)?.add(link.source);
  });

  const visited = new Set<string>();
  let components = 0;
  let singletons = 0;

  nodeIds.forEach((nodeId) => {
    if (visited.has(nodeId)) {
      return;
    }

    const stack = [nodeId];
    const members: string[] = [];
    visited.add(nodeId);

    while (stack.length > 0) {
      const current = stack.pop() as string;
      members.push(current);
      adjacency.get(current)?.forEach((neighbor) => {
        if (visited.has(neighbor)) {
          return;
        }
        visited.add(neighbor);
        stack.push(neighbor);
      });
    }

    if (members.length === 1 && (adjacency.get(nodeId)?.size ?? 0) === 0) {
      singletons++;
      return;
    }

    if (members.length > 1) {
      components++;
    }
  });

  return { components, singletons };
}

function snapshotState(state: OracleState, snapshotId: string): OracleSnapshot {
  const earliestDateForField = isTimelineDisabled(state.timelineField)
    ? null
    : computeEarliestDateForField(state.graph, state.timelineField);
  const nodeDebug: Record<string, OracleNodeDebugState> = {};
  const visibleNodeIds = state.graph.nodeOrder
    .filter((nodeId) => {
      const node = state.graph.nodesById.get(nodeId) as MutableNode;
      const debugState = resolveNodeTimelineState(
        node,
        state.timelineField,
        state.timelineStart,
        state.timelineEnd,
        earliestDateForField,
      );
      nodeDebug[nodeId] = debugState;
      return debugState.visible;
    })
    .sort();
  const visibleNodeIdSet = new Set(visibleNodeIds);
  const nnIncludedLinkIds = state.nearestNeighborEnabled
    ? computeNearestNeighborIncludedLinkIds(state.graph, state.epsilonExponent)
    : new Set<string>();

  const linkDebug: Record<string, OracleLinkDebugState> = {};
  const visibleLinkIds: string[] = [];

  Array.from(state.graph.linksById.values())
    .sort((left, right) => left.id.localeCompare(right.id))
    .forEach((link) => {
      const distance = currentDistance(link);
      const distanceOrigins = [...link.distanceOriginOrder];
      const nonDistanceOrigins = link.originOrder.filter((origin) => !distanceOrigins.includes(origin));
      let passesFiltering = true;
      let overrideNN = false;
      let prunedByThreshold = false;
      let prunedByNN = false;
      let preservedByNonDistanceOrigin = false;

      if (distance === null) {
        passesFiltering = nonDistanceOrigins.length > 0;
        overrideNN = passesFiltering;
      } else {
        passesFiltering = distance <= state.threshold;
        if (!passesFiltering) {
          prunedByThreshold = true;
          if (nonDistanceOrigins.length > 0) {
            passesFiltering = true;
            overrideNN = true;
            preservedByNonDistanceOrigin = true;
          }
        }
      }

      const nnIncluded = state.nearestNeighborEnabled ? nnIncludedLinkIds.has(link.id) : false;

      if (passesFiltering && state.nearestNeighborEnabled && !overrideNN && !nnIncluded) {
        prunedByNN = true;
        if (nonDistanceOrigins.length > 0) {
          passesFiltering = true;
          preservedByNonDistanceOrigin = true;
        } else {
          passesFiltering = false;
        }
      }

      const hiddenTimelineNodeIds = passesFiltering
        ? [link.source, link.target].filter((nodeId) => !visibleNodeIdSet.has(nodeId))
        : [];
      const hiddenByTimeline = hiddenTimelineNodeIds.length > 0;
      const visible = passesFiltering && !hiddenByTimeline;

      if (visible) {
        visibleLinkIds.push(link.id);
      }

      linkDebug[link.id] = {
        id: link.id,
        source: link.source,
        target: link.target,
        origins: [...link.originOrder],
        distanceOrigins,
        nonDistanceOrigins,
        distance,
        distanceBacked: distance !== null,
        nnIncluded,
        visible,
        prunedByThreshold,
        prunedByNN,
        preservedByNonDistanceOrigin,
        hiddenByTimeline,
        hiddenTimelineNodeIds,
      };
    });

  visibleLinkIds.sort();
  const connectivity = computeConnectivity(visibleNodeIds, visibleLinkIds, state.graph);

  return {
    snapshotId,
    metric: state.metric,
    threshold: state.threshold,
    nearestNeighborEnabled: state.nearestNeighborEnabled,
    epsilonExponent: state.epsilonExponent,
    timelineField: state.timelineField,
    timelineStart: state.timelineStart === null ? null : new Date(state.timelineStart).toISOString(),
    timelineEnd: state.timelineEnd === null ? null : new Date(state.timelineEnd).toISOString(),
    visibleLinkIds,
    visibleNodeIds,
    visibleLinks: visibleLinkIds.length,
    visibleNodes: visibleNodeIds.length,
    components: connectivity.components,
    singletons: connectivity.singletons,
    nodeDebug,
    linkDebug,
  };
}

function applyStep(state: OracleState, step: OracleStep): void {
  switch (step.kind) {
    case 'set-threshold':
      state.threshold = step.threshold;
      return;

    case 'set-nearest-neighbor':
      state.nearestNeighborEnabled = step.enabled;
      return;

    case 'set-epsilon':
      state.epsilonExponent = step.exponent;
      return;

    case 'set-distance-metric':
      state.metric = step.metric;
      state.threshold = defaultThresholdForMetric(step.metric);
      replaceGeneticDistanceLinks(state.graph, step.metric);
      return;

    case 'set-timeline-field':
      state.timelineField = step.field === 'None' ? null : step.field;
      if (step.field === 'None') {
        state.timelineStart = null;
        state.timelineEnd = null;
      }
      return;

    case 'set-timeline-date': {
      const timestamp = parseMomentTimestamp(step.date);
      if (timestamp === null) {
        throw new Error(`Oracle timeline checkpoint "${step.date}" is not a valid date.`);
      }
      state.timelineEnd = timestamp;
      return;
    }

    case 'set-timeline-range': {
      const startTimestamp = parseMomentTimestamp(step.start);
      const endTimestamp = parseMomentTimestamp(step.end);
      if (startTimestamp === null || endTimestamp === null) {
        throw new Error(`Oracle timeline range "${step.start}" - "${step.end}" contains an invalid date.`);
      }

      state.timelineStart = Math.min(startTimestamp, endTimestamp);
      state.timelineEnd = Math.max(startTimestamp, endTimestamp);
      return;
    }

    case 'reveal-everything':
      return;
  }
}

export async function computeFilteringOracle(manifest: OracleManifest): Promise<OracleComputationResult> {
  const graph = loadGraph(manifest);
  replaceGeneticDistanceLinks(graph, manifest.preLaunch.metric);

  const state: OracleState = {
    graph,
    metric: manifest.preLaunch.metric,
    threshold: manifest.preLaunch.threshold,
    nearestNeighborEnabled: false,
    epsilonExponent: DEFAULT_EPSILON_EXPONENT,
    timelineField: null,
    timelineStart: null,
    timelineEnd: null,
  };

  const order = ['initial'];
  const snapshots: Record<string, OracleSnapshot> = {
    initial: snapshotState(state, 'initial'),
  };

  manifest.steps.forEach((step) => {
    if (snapshots[step.id]) {
      throw new Error(`Oracle snapshot id "${step.id}" is duplicated in the manifest.`);
    }

    applyStep(state, step);
    order.push(step.id);
    snapshots[step.id] = snapshotState(state, step.id);
  });

  return { order, snapshots };
}
