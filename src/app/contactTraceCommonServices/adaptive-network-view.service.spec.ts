import { AdaptiveNetworkViewService } from './adaptive-network-view.service';
import type { PatristicAdaptiveViewRecord } from './network-graph.types';

describe('AdaptiveNetworkViewService', () => {
  let service: AdaptiveNetworkViewService;

  beforeEach(() => {
    service = new AdaptiveNetworkViewService();
  });

  function nodes(count: number) {
    return Array.from({ length: count }, (_, index) => ({
      _id: `n${String(index).padStart(3, '0')}`,
      id: `n${String(index).padStart(3, '0')}`,
      index,
      visible: true,
      selected: false,
      origin: ['fixture'],
    }));
  }

  function completeGraph(nodeRecords: any[]) {
    const links = [];
    for (let i = 0; i < nodeRecords.length; i++) {
      for (let j = 0; j < i; j++) {
        links.push({
          id: `e-${i}-${j}`,
          source: nodeRecords[i]._id,
          target: nodeRecords[j]._id,
          distance: i + j,
          origin: ['fixture'],
          visible: true,
        });
      }
    }
    return links;
  }

  it('preserves exact behavior below the primitive budgets', () => {
    const nodeRecords = nodes(4);
    const links = completeGraph(nodeRecords);
    const view = service.buildMaterializedView(nodeRecords, links, { maxNodes: 10, maxEdges: 10 });

    expect(view.nodes).toBe(nodeRecords);
    expect(view.links).toBe(links);
    expect(view.metadata.active).toBeFalse();
    expect(view.metadata.exact).toBeTrue();
    expect(view.metadata.representationComplete).toBeTrue();
  });

  it('keeps a dense graph within budgets while accounting for every node and link', () => {
    const nodeRecords = nodes(60);
    const links = completeGraph(nodeRecords);
    const view = service.buildMaterializedView(nodeRecords, links, {
      maxNodes: 10,
      maxEdges: 20,
      maxFocusExactNodes: 2,
    });

    expect(view.metadata.active).toBeTrue();
    expect(view.nodes.length).toBeLessThanOrEqual(10);
    expect(view.links.length).toBeLessThanOrEqual(20);
    expect(view.metadata.representedNodeCount).toBe(nodeRecords.length);
    expect(view.metadata.representedLinkCount).toBe(links.length);
    expect(view.metadata.representationComplete).toBeTrue();
  });

  it('keeps selected nodes exact while aggregating their context', () => {
    const nodeRecords = nodes(30);
    nodeRecords[7].selected = true;
    const view = service.buildMaterializedView(nodeRecords, completeGraph(nodeRecords), {
      maxNodes: 8,
      maxEdges: 30,
      maxFocusExactNodes: 2,
    });

    const selected = view.nodes.find(node => node._id === nodeRecords[7]._id);
    expect(selected).toBeDefined();
    expect(selected.adaptiveAggregate).toBeFalse();
    expect(selected.memberNodeCount).toBe(1);
    expect(view.metadata.representationComplete).toBeTrue();
  });

  it('builds a complete semantic view from a patristic worker summary', () => {
    const canonicalNodes = nodes(4);
    const record: PatristicAdaptiveViewRecord = {
      revision: 3,
      threshold: 1,
      distanceOrigin: 'fixture.nwk',
      leafNames: canonicalNodes.map(node => node._id),
      includedLeafNames: canonicalNodes.map(node => node._id),
      degreeByLeaf: new Uint32Array([3, 3, 3, 3]),
      includedLeafIndices: new Uint32Array([0, 1, 2, 3]),
      aggregateByLeaf: new Uint32Array([0, 0, 1, 1]),
      exactLeafByAggregate: new Int32Array([-1, -1]),
      memberCounts: new Uint32Array([2, 2]),
      internalEdgeCounts: new Float64Array([1, 1]),
      edgeSources: new Uint32Array([0]),
      edgeTargets: new Uint32Array([1]),
      edgeCounts: new Float64Array([4]),
      edgeDistanceMin: new Float32Array([0.1]),
      edgeDistanceMax: new Float32Array([0.4]),
      edgeDistanceMean: new Float32Array([0.25]),
      representedNodeCount: 4,
      representedLinkCount: 6,
    };

    const view = service.buildPatristicView(record, canonicalNodes);

    expect(view.nodes.length).toBe(2);
    expect(view.links.length).toBe(1);
    expect(view.metadata.representedNodeCount).toBe(4);
    expect(view.metadata.representedLinkCount).toBe(6);
    expect(view.metadata.representationComplete).toBeTrue();
  });

  it('coarsens and expands patristic base aggregates without losing representation', () => {
    const canonicalNodes = nodes(8);
    const record: PatristicAdaptiveViewRecord = {
      revision: 4,
      threshold: 1,
      distanceOrigin: 'fixture.nwk',
      leafNames: canonicalNodes.map(node => node._id),
      includedLeafNames: canonicalNodes.map(node => node._id),
      degreeByLeaf: new Uint32Array(8).fill(7),
      includedLeafIndices: new Uint32Array([0, 1, 2, 3, 4, 5, 6, 7]),
      aggregateByLeaf: new Uint32Array([0, 0, 1, 1, 2, 2, 3, 3]),
      exactLeafByAggregate: new Int32Array([-1, -1, -1, -1]),
      memberCounts: new Uint32Array([2, 2, 2, 2]),
      internalEdgeCounts: new Float64Array([1, 1, 1, 1]),
      edgeSources: new Uint32Array([0, 0, 0, 1, 1, 2]),
      edgeTargets: new Uint32Array([1, 2, 3, 2, 3, 3]),
      edgeCounts: new Float64Array([4, 4, 4, 4, 4, 4]),
      edgeDistanceMin: new Float32Array(6).fill(0.1),
      edgeDistanceMax: new Float32Array(6).fill(0.2),
      edgeDistanceMean: new Float32Array(6).fill(0.15),
      representedNodeCount: 8,
      representedLinkCount: 28,
    };

    const overview = service.buildPatristicView(record, canonicalNodes, { targetAggregateCount: 2 });
    const expandedKey = overview.nodes[0].adaptiveGroupKey;
    const expanded = service.buildPatristicView(record, canonicalNodes, {
      targetAggregateCount: 2,
      expandedAggregateKeys: new Set([expandedKey]),
    });

    expect(overview.nodes.length).toBe(2);
    expect(expanded.nodes.length).toBe(3);
    expect(expanded.metadata.representedNodeCount).toBe(8);
    expect(expanded.metadata.representedLinkCount).toBe(28);
    expect(expanded.metadata.representationComplete).toBeTrue();
  });

  it('keeps worker-designated focus leaves exact across LOD levels', () => {
    const canonicalNodes = nodes(4);
    canonicalNodes[2].selected = true;
    const record: PatristicAdaptiveViewRecord = {
      revision: 5,
      threshold: 1,
      distanceOrigin: 'fixture.nwk',
      leafNames: canonicalNodes.map(node => node._id),
      includedLeafNames: canonicalNodes.map(node => node._id),
      degreeByLeaf: new Uint32Array([3, 3, 3, 3]),
      includedLeafIndices: new Uint32Array([0, 1, 2, 3]),
      aggregateByLeaf: new Uint32Array([1, 1, 0, 2]),
      exactLeafByAggregate: new Int32Array([2, -1, -1]),
      memberCounts: new Uint32Array([1, 2, 1]),
      internalEdgeCounts: new Float64Array([0, 1, 0]),
      edgeSources: new Uint32Array([0, 0, 1]),
      edgeTargets: new Uint32Array([1, 2, 2]),
      edgeCounts: new Float64Array([2, 1, 2]),
      edgeDistanceMin: new Float32Array([0.1, 0.1, 0.1]),
      edgeDistanceMax: new Float32Array([0.2, 0.1, 0.2]),
      edgeDistanceMean: new Float32Array([0.15, 0.1, 0.15]),
      representedNodeCount: 4,
      representedLinkCount: 6,
    };

    const view = service.buildPatristicView(record, canonicalNodes, { targetAggregateCount: 2 });
    const focused = view.nodes.find(node => node._id === canonicalNodes[2]._id);
    expect(focused).toBeDefined();
    expect(focused.adaptiveAggregate).toBeFalse();
    expect(focused.selected).toBeTrue();
    expect(view.metadata.focusExactNodeCount).toBe(1);
    expect(view.metadata.representationComplete).toBeTrue();
  });

  it('uses stable aggregate IDs across equivalent rebuilds', () => {
    const nodeRecords = nodes(25);
    const links = completeGraph(nodeRecords);
    const first = service.buildMaterializedView(nodeRecords, links, { maxNodes: 5, maxEdges: 10 });
    const second = service.buildMaterializedView(nodeRecords, links, { maxNodes: 5, maxEdges: 10 });

    expect(second.nodes.map(node => node._id)).toEqual(first.nodes.map(node => node._id));
    expect(second.links.map(link => link.id)).toEqual(first.links.map(link => link.id));
  });
});
