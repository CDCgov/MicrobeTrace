export interface NetworkEntityInput {
  id: string;
  kind?: string;
  parentEntityId?: string | null;
  selected?: boolean;
  visible?: boolean;
  values: Record<string, unknown>;
}

export interface NetworkGroupStatistics {
  memberCount: number;
  visibleMemberCount: number;
  selectedMemberCount: number;
  kindCounts: Record<string, number>;
}

export interface NetworkEntityGroup {
  id: string;
  label: string;
  field: string;
  depth: number;
  parentId: string | null;
  path: string[];
  directMemberIds: string[];
  memberIds: string[];
  statistics: NetworkGroupStatistics;
}

export interface NetworkGroupingModel {
  entities: NetworkEntityInput[];
  entityById: Map<string, NetworkEntityInput>;
  rootEntityIds: string[];
  childEntityIdsByParentId: Map<string, string[]>;
  ancestorEntityIdsByEntityId: Map<string, string[]>;
  groups: NetworkEntityGroup[];
  groupById: Map<string, NetworkEntityGroup>;
  groupPathByEntityId: Map<string, string[]>;
  leafGroupByEntityId: Map<string, NetworkEntityGroup>;
}

export interface NetworkGroupingProjection {
  entityIds: string[];
  aggregateGroupIds: string[];
}

export interface NetworkRelationshipInput {
  id: string;
  source: string;
  target: string;
  directed?: boolean;
  values?: Record<string, unknown>;
}

export interface NetworkGroupingProjectionNode {
  id: string;
  kind: 'entity' | 'aggregate-group';
  memberEntityIds: string[];
  entity?: NetworkEntityInput;
  group?: NetworkEntityGroup;
}

export interface NetworkGroupingProjectionLink {
  id: string;
  source: string;
  target: string;
  directed: boolean;
  memberRelationshipIds: string[];
  relationshipCount: number;
}

export interface NetworkGroupingGraphProjection {
  nodes: NetworkGroupingProjectionNode[];
  links: NetworkGroupingProjectionLink[];
  entityProjectionIdByEntityId: Map<string, string>;
  internalRelationshipIdsByAggregateGroupId: Map<string, string[]>;
}

export interface CategoricalCompositionSegment {
  value: string;
  count: number;
  fraction: number;
}

export interface NetworkGroupingOptions {
  missingValueLabel?: string;
  normalizeValue?: (value: unknown) => string | null;
}

function defaultNormalizeValue(value: unknown): string | null {
  const values = (Array.isArray(value) ? value : [value])
    .filter(candidate => candidate !== undefined && candidate !== null)
    .map(candidate => String(candidate).trim())
    .filter(Boolean);
  if (values.length === 0) return null;
  return Array.from(new Set(values)).sort().join(' + ');
}

function groupId(path: string[]): string {
  return `mt-group:${path.map(segment => encodeURIComponent(segment)).join('/')}`;
}

function emptyStatistics(): NetworkGroupStatistics {
  return {
    memberCount: 0,
    visibleMemberCount: 0,
    selectedMemberCount: 0,
    kindCounts: {},
  };
}

/**
 * Builds MT-owned hierarchy and statistics independently of a graph renderer.
 * Renderers may project these groups as compound nodes, hulls, or aggregate
 * glyphs without becoming the source of truth for scientific entity grouping.
 */
export function buildNetworkGroupingModel(
  entities: NetworkEntityInput[],
  groupFields: string[],
  options: NetworkGroupingOptions = {},
): NetworkGroupingModel {
  const normalizeValue = options.normalizeValue || defaultNormalizeValue;
  const missingValueLabel = options.missingValueLabel || '(Missing)';
  const groupById = new Map<string, NetworkEntityGroup>();
  const groupPathByEntityId = new Map<string, string[]>();
  const leafGroupByEntityId = new Map<string, NetworkEntityGroup>();
  const entityById = new Map(entities.map(entity => [entity.id, entity]));
  const rootEntityIds: string[] = [];
  const childEntityIdsByParentId = new Map<string, string[]>();
  const resolvedParentByEntityId = new Map<string, string | null>();

  entities.forEach(entity => {
    const requestedParentId = entity.parentEntityId == null
      ? null
      : String(entity.parentEntityId);
    const parentId = requestedParentId && requestedParentId !== entity.id && entityById.has(requestedParentId)
      ? requestedParentId
      : null;
    resolvedParentByEntityId.set(entity.id, parentId);
    if (!parentId) {
      rootEntityIds.push(entity.id);
      return;
    }
    const childIds = childEntityIdsByParentId.get(parentId) || [];
    childIds.push(entity.id);
    childEntityIdsByParentId.set(parentId, childIds);
  });

  const ancestorEntityIdsByEntityId = new Map<string, string[]>();
  entities.forEach(entity => {
    const ancestors: string[] = [];
    const visited = new Set([entity.id]);
    let parentId = resolvedParentByEntityId.get(entity.id) || null;
    while (parentId && !visited.has(parentId)) {
      ancestors.push(parentId);
      visited.add(parentId);
      parentId = resolvedParentByEntityId.get(parentId) || null;
    }
    ancestorEntityIdsByEntityId.set(entity.id, ancestors);
  });

  entities.forEach(entity => {
    const labels = groupFields.map(field => normalizeValue(entity.values[field]) || missingValueLabel);
    const ids: string[] = [];

    labels.forEach((label, depth) => {
      const path = labels.slice(0, depth + 1);
      const id = groupId(path);
      const parentId = depth > 0 ? groupId(path.slice(0, -1)) : null;
      let group = groupById.get(id);
      if (!group) {
        group = {
          id,
          label,
          field: groupFields[depth],
          depth,
          parentId,
          path,
          directMemberIds: [],
          memberIds: [],
          statistics: emptyStatistics(),
        };
        groupById.set(id, group);
      }

      group.memberIds.push(entity.id);
      group.statistics.memberCount += 1;
      if (entity.visible !== false) group.statistics.visibleMemberCount += 1;
      if (entity.selected === true) group.statistics.selectedMemberCount += 1;
      const kind = String(entity.kind || 'unknown');
      group.statistics.kindCounts[kind] = (group.statistics.kindCounts[kind] || 0) + 1;
      ids.push(id);

      if (depth === labels.length - 1) {
        group.directMemberIds.push(entity.id);
        leafGroupByEntityId.set(entity.id, group);
      }
    });

    groupPathByEntityId.set(entity.id, ids);
  });

  const groups = Array.from(groupById.values()).sort((left, right) => (
    left.depth - right.depth || left.id.localeCompare(right.id)
  ));
  return {
    entities: entities.slice(),
    entityById,
    rootEntityIds,
    childEntityIdsByParentId,
    ancestorEntityIdsByEntityId,
    groups,
    groupById,
    groupPathByEntityId,
    leafGroupByEntityId,
  };
}

/** Projects collapsed groups without changing the underlying entity hierarchy. */
export function projectNetworkGrouping(
  model: NetworkGroupingModel,
  collapsedGroupIds: Iterable<string>,
): NetworkGroupingProjection {
  const collapsed = new Set(Array.from(collapsedGroupIds));
  const entityIds: string[] = [];
  const aggregateGroupIds = new Set<string>();

  model.entities.forEach(entity => {
    const collapsedAncestor = (model.groupPathByEntityId.get(entity.id) || [])
      .find(id => collapsed.has(id));
    if (collapsedAncestor) aggregateGroupIds.add(collapsedAncestor);
    else entityIds.push(entity.id);
  });

  return {
    entityIds,
    aggregateGroupIds: Array.from(aggregateGroupIds).sort(),
  };
}

/**
 * Builds the renderer-neutral graph shown after groups are collapsed. The
 * source entities and relationships remain unchanged; aggregate links retain
 * every contributing relationship ID for statistics, filtering, and export.
 */
export function projectNetworkGroupingGraph(
  model: NetworkGroupingModel,
  relationships: NetworkRelationshipInput[],
  collapsedGroupIds: Iterable<string>,
): NetworkGroupingGraphProjection {
  const collapsed = new Set(Array.from(collapsedGroupIds).filter(id => model.groupById.has(id)));
  const entityProjectionIdByEntityId = new Map<string, string>();
  const aggregateMemberIds = new Map<string, string[]>();
  const nodes: NetworkGroupingProjectionNode[] = [];

  model.entities.forEach(entity => {
    const aggregateGroupId = (model.groupPathByEntityId.get(entity.id) || [])
      .find(groupId => collapsed.has(groupId));
    const projectionId = aggregateGroupId || entity.id;
    entityProjectionIdByEntityId.set(entity.id, projectionId);
    if (aggregateGroupId) {
      const memberIds = aggregateMemberIds.get(aggregateGroupId) || [];
      memberIds.push(entity.id);
      aggregateMemberIds.set(aggregateGroupId, memberIds);
      return;
    }
    nodes.push({
      id: entity.id,
      kind: 'entity',
      memberEntityIds: [entity.id],
      entity,
    });
  });

  Array.from(aggregateMemberIds.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .forEach(([groupId, memberEntityIds]) => {
      nodes.push({
        id: groupId,
        kind: 'aggregate-group',
        memberEntityIds,
        group: model.groupById.get(groupId),
      });
    });

  const internalRelationshipIdsByAggregateGroupId = new Map<string, string[]>();
  const linkByProjectionKey = new Map<string, NetworkGroupingProjectionLink>();
  relationships.forEach(relationship => {
    const source = entityProjectionIdByEntityId.get(String(relationship.source));
    const target = entityProjectionIdByEntityId.get(String(relationship.target));
    if (!source || !target) return;
    if (source === target) {
      if (collapsed.has(source)) {
        const ids = internalRelationshipIdsByAggregateGroupId.get(source) || [];
        ids.push(relationship.id);
        internalRelationshipIdsByAggregateGroupId.set(source, ids);
      }
      return;
    }

    const directed = relationship.directed === true;
    const endpoints = directed || source.localeCompare(target) <= 0
      ? [source, target]
      : [target, source];
    const key = `${directed ? 'directed' : 'undirected'}:${endpoints[0]}\u0000${endpoints[1]}`;
    let projected = linkByProjectionKey.get(key);
    if (!projected) {
      projected = {
        id: `mt-projected-link:${encodeURIComponent(key)}`,
        source: endpoints[0],
        target: endpoints[1],
        directed,
        memberRelationshipIds: [],
        relationshipCount: 0,
      };
      linkByProjectionKey.set(key, projected);
    }
    projected.memberRelationshipIds.push(relationship.id);
    projected.relationshipCount += 1;
  });

  return {
    nodes,
    links: Array.from(linkByProjectionKey.values()).sort((left, right) => left.id.localeCompare(right.id)),
    entityProjectionIdByEntityId,
    internalRelationshipIdsByAggregateGroupId,
  };
}

/** Converts mixed categorical values into renderer-neutral donut segments. */
export function buildCategoricalComposition(values: unknown): CategoricalCompositionSegment[] {
  const flattened = Array.isArray(values) ? values : [values];
  const counts = new Map<string, number>();
  flattened
    .filter(value => value !== undefined && value !== null && String(value).trim() !== '')
    .forEach(value => {
      const key = String(value).trim();
      counts.set(key, (counts.get(key) || 0) + 1);
    });
  const total = Array.from(counts.values()).reduce((sum, count) => sum + count, 0);
  if (total === 0) return [];
  return Array.from(counts.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([value, count]) => ({ value, count, fraction: count / total }));
}
