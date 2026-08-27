import { Injectable } from '@angular/core';
import {
  AdaptiveViewBudget,
  AdaptiveViewGraph,
  DEFAULT_ADAPTIVE_VIEW_BUDGET,
  PatristicAdaptiveViewRecord,
  PatristicViewOptions,
} from './network-graph.types';

interface AggregateAccumulator {
  source: string;
  target: string;
  count: number;
  distanceMin: number;
  distanceMax: number;
  distanceSum: number;
  origins: Set<string>;
}

@Injectable({ providedIn: 'root' })
export class AdaptiveNetworkViewService {
  private revision = 0;

  buildMaterializedView(
    nodes: any[],
    links: any[],
    budget: Partial<AdaptiveViewBudget> = {},
  ): AdaptiveViewGraph {
    const resolvedBudget = { ...DEFAULT_ADAPTIVE_VIEW_BUDGET, ...budget };
    const filteredNodeCount = nodes.length;
    const filteredLinkCount = links.length;

    if (nodes.length <= resolvedBudget.maxNodes && links.length <= resolvedBudget.maxEdges) {
      return {
        nodes,
        links,
        metadata: {
          revision: ++this.revision,
          source: 'materialized',
          active: false,
          exact: true,
          filteredNodeCount,
          filteredLinkCount,
          representedNodeCount: filteredNodeCount,
          representedLinkCount: filteredLinkCount,
          drawnNodeCount: filteredNodeCount,
          drawnEdgeCount: filteredLinkCount,
          aggregateNodeCount: 0,
          aggregateEdgeCount: 0,
          labelBudget: resolvedBudget.maxLabels,
          visibleLabelCount: Math.min(filteredNodeCount, resolvedBudget.maxLabels),
          lodLevel: 0,
          representationComplete: true,
        },
      };
    }

    const validNodeIds = new Set(nodes.map(node => this.nodeId(node)));
    const eligibleLinks = links.filter(link =>
      validNodeIds.has(this.endpointId(link.source)) && validNodeIds.has(this.endpointId(link.target))
    );
    let targetAggregateCount = Math.max(1, Math.min(resolvedBudget.maxNodes, nodes.length));
    let result = this.aggregateMaterialized(
      nodes,
      eligibleLinks,
      targetAggregateCount,
      resolvedBudget.maxFocusExactNodes,
    );

    while (result.links.length > resolvedBudget.maxEdges && targetAggregateCount > 1) {
      targetAggregateCount = Math.max(1, Math.floor(targetAggregateCount / 2));
      result = this.aggregateMaterialized(
        nodes,
        eligibleLinks,
        targetAggregateCount,
        resolvedBudget.maxFocusExactNodes,
      );
    }

    const representedLinkCount = result.nodes.reduce(
      (sum, node) => sum + Number(node.internalEdgeCount || 0),
      result.links.reduce((sum, link) => sum + Number(link.underlyingEdgeCount || 1), 0),
    );

    const visibleLabelCount = this.applyLabelBudget(result.nodes, resolvedBudget.maxLabels);
    return {
      nodes: result.nodes,
      links: result.links,
      metadata: {
        revision: ++this.revision,
        source: 'materialized',
        active: true,
        exact: false,
        filteredNodeCount,
        filteredLinkCount,
        representedNodeCount: result.nodes.reduce((sum, node) => sum + Number(node.memberNodeCount || 1), 0),
        representedLinkCount,
        drawnNodeCount: result.nodes.length,
        drawnEdgeCount: result.links.length,
        aggregateNodeCount: result.nodes.filter(node => node.adaptiveAggregate).length,
        aggregateEdgeCount: result.links.filter(link => link.adaptiveAggregate).length,
        labelBudget: resolvedBudget.maxLabels,
        visibleLabelCount,
        lodLevel: Math.max(1, Math.ceil(Math.log2(Math.max(1, nodes.length / result.nodes.length)))),
        representationComplete:
          result.nodes.reduce((sum, node) => sum + Number(node.memberNodeCount || 1), 0) === filteredNodeCount &&
          representedLinkCount === eligibleLinks.length,
      },
    };
  }

  buildPatristicView(
    record: PatristicAdaptiveViewRecord,
    canonicalNodes: any[],
    options: PatristicViewOptions = {},
  ): AdaptiveViewGraph {
    const budget = { ...DEFAULT_ADAPTIVE_VIEW_BUDGET, ...(options.budget || {}) };
    const canonicalById = new Map(canonicalNodes.map(node => [this.nodeId(node), node]));
    const includedLeafIndices = record.includedLeafIndices ||
      Uint32Array.from(record.leafNames.map((_name, leafIndex) => leafIndex));
    const aggregateByLeaf = record.aggregateByLeaf || this.buildLegacyAggregateByLeaf(record);
    const exactLeafByAggregate = record.exactLeafByAggregate ||
      new Int32Array(record.memberCounts.length).fill(-1);
    const membersByBaseAggregate: number[][] = Array.from(
      { length: record.memberCounts.length },
      () => [],
    );
    for (const leafIndex of includedLeafIndices) {
      const aggregateIndex = aggregateByLeaf[leafIndex];
      if (aggregateIndex < membersByBaseAggregate.length) {
        membersByBaseAggregate[aggregateIndex].push(leafIndex);
      }
    }

    const nonEmptyBaseIndices = membersByBaseAggregate
      .map((members, aggregateIndex) => ({ members, aggregateIndex }))
      .filter(entry => entry.members.length > 0)
      .map(entry => entry.aggregateIndex);
    const exactBaseIndices = nonEmptyBaseIndices.filter(
      aggregateIndex => exactLeafByAggregate[aggregateIndex] >= 0,
    );
    const aggregateBaseIndices = nonEmptyBaseIndices.filter(
      aggregateIndex => exactLeafByAggregate[aggregateIndex] < 0,
    );
    const targetAggregateCount = Math.max(
      exactBaseIndices.length,
      Math.min(
        nonEmptyBaseIndices.length,
        Math.floor(options.targetAggregateCount || nonEmptyBaseIndices.length),
      ),
    );
    const aggregateSlots = Math.max(1, targetAggregateCount - exactBaseIndices.length);
    const chunkSize = Math.max(1, Math.ceil(aggregateBaseIndices.length / aggregateSlots));
    const expandedKeys = options.expandedAggregateKeys || new Set<string>();
    const groups: Array<{ baseIndices: number[]; key: string; parentKey?: string }> = [];

    exactBaseIndices.forEach(baseIndex => {
      groups.push({ baseIndices: [baseIndex], key: this.patristicGroupKey(baseIndex, baseIndex) });
    });
    for (let start = 0; start < aggregateBaseIndices.length; start += chunkSize) {
      const baseIndices = aggregateBaseIndices.slice(start, start + chunkSize);
      if (!baseIndices.length) continue;
      const parentKey = this.patristicGroupKey(baseIndices[0], baseIndices[baseIndices.length - 1]);
      if (baseIndices.length > 1 && expandedKeys.has(parentKey)) {
        baseIndices.forEach(baseIndex => groups.push({
          baseIndices: [baseIndex],
          key: this.patristicGroupKey(baseIndex, baseIndex),
          parentKey,
        }));
      } else {
        groups.push({ baseIndices, key: parentKey });
      }
    }
    groups.sort((left, right) => left.baseIndices[0] - right.baseIndices[0]);

    const groupByBaseAggregate = new Int32Array(record.memberCounts.length).fill(-1);
    groups.forEach((group, groupIndex) => {
      group.baseIndices.forEach(baseIndex => groupByBaseAggregate[baseIndex] = groupIndex);
    });

    const nodes = groups.map((group, groupIndex) => {
      const memberLeafIndices = group.baseIndices.flatMap(baseIndex => membersByBaseAggregate[baseIndex]);
      const memberIds = memberLeafIndices.map(leafIndex => record.leafNames[leafIndex]);
      const isExact = memberLeafIndices.length === 1 &&
        exactLeafByAggregate[group.baseIndices[0]] === memberLeafIndices[0];
      const representative = canonicalById.get(memberIds[0]) || canonicalNodes[0] || {};
      const id = isExact
        ? memberIds[0]
        : `__mt_patristic_aggregate_${group.baseIndices[0]}_${group.baseIndices[group.baseIndices.length - 1]}`;
      const angle = groups.length > 1 ? (groupIndex / groups.length) * Math.PI * 2 : 0;
      const radius = Math.max(120, Math.sqrt(groups.length) * 45);
      const finiteMemberPositions = memberIds
        .map(memberId => canonicalById.get(memberId))
        .filter(member => Number.isFinite(Number(member?.x)) && Number.isFinite(Number(member?.y)));
      const x = finiteMemberPositions.length
        ? finiteMemberPositions.reduce((sum, member) => sum + Number(member.x), 0) / finiteMemberPositions.length
        : Math.cos(angle) * radius;
      const y = finiteMemberPositions.length
        ? finiteMemberPositions.reduce((sum, member) => sum + Number(member.y), 0) / finiteMemberPositions.length
        : Math.sin(angle) * radius;
      return {
        ...representative,
        _id: id,
        id,
        x,
        y,
        adaptiveAggregate: !isExact,
        adaptiveGroupKey: group.key,
        adaptiveParentKey: group.parentKey,
        baseAggregateIndices: group.baseIndices,
        memberNodeCount: memberIds.length,
        memberNodeIds: memberIds,
        internalEdgeCount: group.baseIndices.reduce(
          (sum, baseIndex) => sum + Number(record.internalEdgeCounts[baseIndex] || 0),
          0,
        ),
        selectedMemberCount: memberIds.reduce(
          (sum, memberId) => sum + (canonicalById.get(memberId)?.selected ? 1 : 0),
          0,
        ),
        selected: isExact && Boolean(canonicalById.get(memberIds[0])?.selected),
        visible: true,
        label: isExact ? String(memberIds[0]) : `${memberIds.length.toLocaleString()} nodes`,
        nodeSize: isExact
          ? Number(representative.nodeSize || 20)
          : Math.min(100, 20 + Math.log2(Math.max(1, memberIds.length)) * 8),
      };
    });

    const edgeAccumulators = new Map<string, AggregateAccumulator>();
    for (let edgeIndex = 0; edgeIndex < record.edgeSources.length; edgeIndex++) {
      const sourceGroup = groupByBaseAggregate[record.edgeSources[edgeIndex]];
      const targetGroup = groupByBaseAggregate[record.edgeTargets[edgeIndex]];
      if (sourceGroup < 0 || targetGroup < 0) continue;
      const count = Number(record.edgeCounts[edgeIndex]);
      if (sourceGroup === targetGroup) {
        nodes[sourceGroup].internalEdgeCount += count;
        continue;
      }
      const source = nodes[Math.min(sourceGroup, targetGroup)]._id;
      const target = nodes[Math.max(sourceGroup, targetGroup)]._id;
      const key = `${source}\u0000${target}`;
      const existing = edgeAccumulators.get(key);
      if (existing) {
        existing.count += count;
        existing.distanceMin = Math.min(existing.distanceMin, record.edgeDistanceMin[edgeIndex]);
        existing.distanceMax = Math.max(existing.distanceMax, record.edgeDistanceMax[edgeIndex]);
        existing.distanceSum += Number(record.edgeDistanceMean[edgeIndex]) * count;
      } else {
        edgeAccumulators.set(key, {
          source,
          target,
          count,
          distanceMin: record.edgeDistanceMin[edgeIndex],
          distanceMax: record.edgeDistanceMax[edgeIndex],
          distanceSum: Number(record.edgeDistanceMean[edgeIndex]) * count,
          origins: new Set([record.distanceOrigin]),
        });
      }
    }
    const links = Array.from(edgeAccumulators.values()).map(edge => ({
      id: `__mt_patristic_aggregate_edge_${this.stableToken(edge.source + '\u0000' + edge.target)}`,
      source: edge.source,
      target: edge.target,
      adaptiveAggregate: true,
      underlyingEdgeCount: edge.count,
      origin: [record.distanceOrigin],
      distanceOrigin: record.distanceOrigin,
      hasDistance: true,
      distance: edge.distanceSum / edge.count,
      distanceMin: edge.distanceMin,
      distanceMax: edge.distanceMax,
      visible: true,
      label: `${edge.count.toLocaleString()} links`,
    }));

    const representedNodeCount = nodes.reduce((sum, node) => sum + node.memberNodeCount, 0);
    const representedLinkCount = nodes.reduce(
      (sum, node) => sum + Number(node.internalEdgeCount || 0),
      links.reduce((sum, link) => sum + Number(link.underlyingEdgeCount || 0), 0),
    );
    const visibleLabelCount = this.applyLabelBudget(nodes, budget.maxLabels);
    return {
      nodes,
      links,
      metadata: {
        revision: record.revision,
        source: 'patristic-worker',
        active: true,
        exact: nodes.every(node => !node.adaptiveAggregate) && links.every(link => !link.adaptiveAggregate),
        filteredNodeCount: record.representedNodeCount,
        filteredLinkCount: record.representedLinkCount,
        representedNodeCount,
        representedLinkCount,
        drawnNodeCount: nodes.length,
        drawnEdgeCount: links.length,
        aggregateNodeCount: nodes.filter(node => node.adaptiveAggregate).length,
        aggregateEdgeCount: links.filter(link => link.adaptiveAggregate).length,
        labelBudget: budget.maxLabels,
        visibleLabelCount,
        lodLevel: Math.max(0, Math.ceil(Math.log2(Math.max(1, nonEmptyBaseIndices.length / nodes.length)))),
        baseAggregateCount: nonEmptyBaseIndices.length,
        expandedAggregateCount: expandedKeys.size,
        focusExactNodeCount: exactBaseIndices.length,
        representationComplete:
          representedNodeCount === record.representedNodeCount &&
          representedLinkCount === record.representedLinkCount &&
          nodes.length <= budget.maxNodes &&
          links.length <= budget.maxEdges,
      },
    };
  }

  private aggregateMaterialized(
    nodes: any[],
    links: any[],
    targetViewNodeCount: number,
    maxFocusExactNodes: number,
  ) {
    const focusedNodes = nodes
      .filter(node => node.selected || node.adaptivePinned || node.adaptiveFocus)
      .sort((a, b) => this.nodeId(a).localeCompare(this.nodeId(b)))
      .slice(0, Math.max(0, maxFocusExactNodes));
    const focusedIds = new Set(focusedNodes.map(node => this.nodeId(node)));
    const sortedNodes = nodes
      .filter(node => !focusedIds.has(this.nodeId(node)))
      .sort((a, b) => this.nodeId(a).localeCompare(this.nodeId(b)));
    const memberToAggregate = new Map<string, string>();
    const aggregateNodes: any[] = focusedNodes.map(node => {
      const id = this.nodeId(node);
      memberToAggregate.set(id, id);
      return {
        ...node,
        _id: id,
        id,
        adaptiveAggregate: false,
        memberNodeCount: 1,
        memberNodeIds: [id],
        selectedMemberCount: node.selected ? 1 : 0,
        internalEdgeCount: 0,
      };
    });
    const aggregateSlots = Math.max(1, targetViewNodeCount - focusedNodes.length);
    const materializedGroups = this.partitionMaterializedNodes(sortedNodes, aggregateSlots);

    materializedGroups.forEach((members, aggregateIndex) => {
      const representative = members[0];
      const componentKeys = new Set(members.map(member => this.materializedComponentKey(member)));
      const id = `__mt_aggregate_${aggregateIndex}_${this.stableToken(
        members.map(member => this.nodeId(member)).join('\u0001'),
      )}`;
      members.forEach(member => memberToAggregate.set(this.nodeId(member), id));
      aggregateNodes.push({
        ...representative,
        _id: id,
        id,
        adaptiveAggregate: true,
        memberNodeCount: members.length,
        memberNodeIds: members.map(member => this.nodeId(member)),
        selectedMemberCount: members.filter(member => member.selected).length,
        internalEdgeCount: 0,
        representedComponentCount: componentKeys.size,
        selected: false,
        visible: true,
        label: `${members.length.toLocaleString()} nodes`,
        nodeSize: Math.min(100, 20 + Math.log2(Math.max(1, members.length)) * 8),
      });
    });

    const aggregateNodeById = new Map(aggregateNodes.map(node => [node._id, node]));
    const edges = new Map<string, AggregateAccumulator>();
    for (const link of links) {
      const source = memberToAggregate.get(this.endpointId(link.source));
      const target = memberToAggregate.get(this.endpointId(link.target));
      if (!source || !target) continue;
      if (source === target) {
        aggregateNodeById.get(source).internalEdgeCount++;
        continue;
      }
      const orderedSource = source < target ? source : target;
      const orderedTarget = source < target ? target : source;
      const key = `${orderedSource}\u0000${orderedTarget}`;
      const distance = Number(link.distance);
      const origins = Array.isArray(link.origin) ? link.origin : [];
      const existing = edges.get(key);
      if (existing) {
        existing.count++;
        if (Number.isFinite(distance)) {
          existing.distanceMin = Math.min(existing.distanceMin, distance);
          existing.distanceMax = Math.max(existing.distanceMax, distance);
          existing.distanceSum += distance;
        }
        origins.forEach(origin => existing.origins.add(String(origin)));
      } else {
        edges.set(key, {
          source: orderedSource,
          target: orderedTarget,
          count: 1,
          distanceMin: Number.isFinite(distance) ? distance : Number.POSITIVE_INFINITY,
          distanceMax: Number.isFinite(distance) ? distance : Number.NEGATIVE_INFINITY,
          distanceSum: Number.isFinite(distance) ? distance : 0,
          origins: new Set(origins.map(origin => String(origin))),
        });
      }
    }

    const aggregateLinks = Array.from(edges.values()).map((edge, index) => ({
      id: `__mt_aggregate_edge_${index}_${this.stableToken(edge.source + edge.target)}`,
      source: edge.source,
      target: edge.target,
      adaptiveAggregate: true,
      underlyingEdgeCount: edge.count,
      origin: Array.from(edge.origins),
      hasDistance: Number.isFinite(edge.distanceMin),
      distance: Number.isFinite(edge.distanceMin) ? edge.distanceSum / edge.count : undefined,
      distanceMin: Number.isFinite(edge.distanceMin) ? edge.distanceMin : undefined,
      distanceMax: Number.isFinite(edge.distanceMax) ? edge.distanceMax : undefined,
      visible: true,
      label: `${edge.count.toLocaleString()} links`,
    }));

    return { nodes: aggregateNodes, links: aggregateLinks };
  }

  private nodeId(node: any): string {
    return String(node?._id ?? node?.id ?? '');
  }

  private applyLabelBudget(nodes: any[], maxLabels: number): number {
    const labelIds = new Set(
      [...nodes]
        .sort((left, right) => {
          const leftPriority = left.selected || !left.adaptiveAggregate ? 1 : 0;
          const rightPriority = right.selected || !right.adaptiveAggregate ? 1 : 0;
          return rightPriority - leftPriority ||
            Number(right.memberNodeCount || 1) - Number(left.memberNodeCount || 1) ||
            this.nodeId(left).localeCompare(this.nodeId(right));
        })
        .slice(0, Math.max(0, maxLabels))
        .map(node => this.nodeId(node)),
    );
    nodes.forEach(node => node.adaptiveLabelVisible = labelIds.has(this.nodeId(node)));
    return labelIds.size;
  }

  private partitionMaterializedNodes(nodes: any[], slotCount: number): any[][] {
    if (!nodes.length) return [];
    const componentBuckets = new Map<string, any[]>();
    nodes.forEach(node => {
      const key = this.materializedComponentKey(node);
      if (!componentBuckets.has(key)) componentBuckets.set(key, []);
      componentBuckets.get(key)!.push(node);
    });
    const buckets = Array.from(componentBuckets.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([_key, members]) => members.sort((left, right) =>
        this.nodeId(left).localeCompare(this.nodeId(right)),
      ));

    if (buckets.length > slotCount) {
      const merged: any[][] = Array.from({ length: Math.max(1, slotCount) }, () => []);
      buckets.forEach((bucket, index) => {
        const target = Math.min(
          merged.length - 1,
          Math.floor((index * merged.length) / buckets.length),
        );
        merged[target].push(...bucket);
      });
      return merged.filter(group => group.length > 0);
    }

    const groups: any[][] = [];
    let remainingSlots = Math.max(buckets.length, slotCount);
    let remainingNodes = nodes.length;
    buckets.forEach((bucket, bucketIndex) => {
      const remainingBuckets = buckets.length - bucketIndex;
      const proportionalSlots = Math.round((bucket.length / Math.max(1, remainingNodes)) * remainingSlots);
      const bucketSlots = Math.max(
        1,
        Math.min(bucket.length, remainingSlots - (remainingBuckets - 1), proportionalSlots),
      );
      const chunkSize = Math.max(1, Math.ceil(bucket.length / bucketSlots));
      for (let start = 0; start < bucket.length; start += chunkSize) {
        groups.push(bucket.slice(start, start + chunkSize));
      }
      remainingSlots -= bucketSlots;
      remainingNodes -= bucket.length;
    });
    return groups;
  }

  private materializedComponentKey(node: any): string {
    const value = node?.cluster ?? node?.component ?? node?.community;
    return value === undefined || value === null ? '__unassigned__' : String(value);
  }

  private buildLegacyAggregateByLeaf(record: PatristicAdaptiveViewRecord): Uint32Array {
    const aggregateByLeaf = new Uint32Array(record.leafNames.length);
    let leafOffset = 0;
    record.memberCounts.forEach((memberCount, aggregateIndex) => {
      const end = Math.min(record.leafNames.length, leafOffset + memberCount);
      for (; leafOffset < end; leafOffset++) aggregateByLeaf[leafOffset] = aggregateIndex;
    });
    return aggregateByLeaf;
  }

  private patristicGroupKey(firstBaseIndex: number, lastBaseIndex: number): string {
    return `patristic-base-${firstBaseIndex}-${lastBaseIndex}`;
  }

  private endpointId(endpoint: any): string {
    return typeof endpoint === 'object' ? this.nodeId(endpoint) : String(endpoint ?? '');
  }

  private stableToken(value: string): string {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }
}
