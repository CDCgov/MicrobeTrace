export interface FullGraphSummary {
  revision: number;
  source: 'materialized' | 'patristic-worker';
  threshold?: number;
  distanceMetric?: string;
  filteredNodeCount: number;
  filteredLinkCount: number;
  selectedNodeCount: number;
  selectedLinkCount: number;
  singletonCount: number;
  componentCount: number;
  componentSizes?: Uint32Array;
  degreeHistogram?: Uint32Array;
  distanceSummary?: { min: number; max: number; mean: number };
  exact: true;
  pairScanComplete?: boolean;
  computedAt: number;
}

export interface AdaptiveViewBudget {
  maxNodes: number;
  maxEdges: number;
  maxLabels: number;
  maxFocusExactNodes: number;
}

export const DEFAULT_ADAPTIVE_VIEW_BUDGET: AdaptiveViewBudget = {
  maxNodes: 5000,
  maxEdges: 20000,
  maxLabels: 500,
  maxFocusExactNodes: 2000,
};

export interface AdaptiveViewMetadata {
  revision: number;
  source: 'materialized' | 'patristic-worker';
  active: boolean;
  exact: boolean;
  filteredNodeCount: number;
  filteredLinkCount: number;
  representedNodeCount: number;
  representedLinkCount: number;
  drawnNodeCount: number;
  drawnEdgeCount: number;
  aggregateNodeCount: number;
  aggregateEdgeCount: number;
  labelBudget: number;
  visibleLabelCount: number;
  lodLevel: number;
  baseAggregateCount?: number;
  expandedAggregateCount?: number;
  focusExactNodeCount?: number;
  representationComplete: boolean;
}

export interface AdaptiveViewGraph {
  nodes: any[];
  links: any[];
  metadata: AdaptiveViewMetadata;
}

export interface PatristicAdaptiveViewRecord {
  revision: number;
  threshold: number;
  distanceOrigin: string;
  leafNames: string[];
  includedLeafNames: string[];
  degreeByLeaf: Uint32Array;
  includedLeafIndices: Uint32Array;
  aggregateByLeaf: Uint32Array;
  exactLeafByAggregate: Int32Array;
  memberCounts: Uint32Array;
  internalEdgeCounts: Float64Array;
  edgeSources: Uint32Array;
  edgeTargets: Uint32Array;
  edgeCounts: Float64Array;
  edgeDistanceMin: Float32Array;
  edgeDistanceMax: Float32Array;
  edgeDistanceMean: Float32Array;
  representedNodeCount: number;
  representedLinkCount: number;
}

export interface AdaptiveNetworkSessionState {
  revision: number;
  fullGraphSummary?: FullGraphSummary;
  patristicView?: PatristicAdaptiveViewRecord;
  lastView?: AdaptiveViewMetadata;
  analyticsStatus?: 'computing' | 'ready' | 'cancelled' | 'error';
  analyticsProgress?: number;
}

export interface PatristicViewOptions {
  targetAggregateCount?: number;
  expandedAggregateKeys?: ReadonlySet<string>;
  budget?: Partial<AdaptiveViewBudget>;
}
