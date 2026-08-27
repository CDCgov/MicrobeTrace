/**
 * Types for the patristic distance engine worker.
 *
 * The worker preprocesses a Newick tree into flat typed arrays,
 * builds an LCA index, and streams only threshold-qualifying edges
 * back to the main thread as transferable typed-array batches.
 */

// ─── Flat tree representation ────────────────────────────────────────────────

export interface FlatTree {
  /** Total number of nodes (internal + leaves). */
  nodeCount: number;
  /** Number of leaf nodes. */
  leafCount: number;
  /** parent[i] = index of parent of node i. Root has parent = -1. */
  parent: Int32Array;
  /** branchLength[i] = length of the branch from node i to its parent. */
  branchLength: Float64Array;
  /** rootDepth[i] = cumulative branch length from root to node i. */
  rootDepth: Float64Array;
  /** 1 if node i is a leaf, 0 otherwise. */
  isLeaf: Uint8Array;
  /** For each leaf (0..leafCount-1), the node index in the full tree. */
  leafNodeIndex: Int32Array;
  /** Leaf names in order matching leafNodeIndex. */
  leafNames: string[];
  /** Node labels in flattened node-index order. Empty when a branch is unlabeled. */
  nodeNames: string[];
}

// ─── LCA index via Euler tour + sparse table RMQ ────────────────────────────

export interface LcaIndex {
  /** Euler tour sequence of node indices. Length = 2*nodeCount - 1. */
  euler: Int32Array;
  /** Depth (in tree hops, not branch length) at each Euler tour position. */
  eulerDepth: Int32Array;
  /** firstOccurrence[nodeIndex] = first position in euler where node appears. */
  firstOccurrence: Int32Array;
  /** Sparse table for range minimum queries on eulerDepth. */
  sparseTable: Int32Array[];
  /** log2 lookup table for RMQ. */
  log2: Int32Array;
}

// ─── Worker telemetry ───────────────────────────────────────────────────────

export interface PatristicTreeTimings {
  parseMs: number;
  flattenMs: number;
  validationMs: number;
  metricsMs: number;
  lcaMs: number;
  totalPreprocessingMs: number;
}

export interface PatristicEdgeTimings {
  threshold: number;
  pairScanMs: number;
  emittedEdgeCount: number;
  /** Exact number of pairs that qualified, including pairs not emitted. */
  matchedEdgeCount: number;
  /** Number of candidate pairs evaluated before completion/cancellation. */
  pairsProcessed: number;
  totalPairs: number;
  maxEdgesHit: boolean;
  /** True when all candidate pairs were evaluated. */
  pairScanComplete: boolean;
}

/**
 * Exact analytical summary plus a bounded semantic view of a thresholded
 * patristic graph. Typed arrays keep the result compact and transferable.
 */
export interface PatristicFilteredGraphSummary {
  nodeCount: number;
  matchedEdgeCount: number;
  singletonCount: number;
  componentCount: number;
  degreeByLeaf: Uint32Array;
  degreeHistogram: Uint32Array;
  componentSizes: Uint32Array;
  distanceMin: number;
  distanceMax: number;
  distanceMean: number;
  /** Included leaf indices for the current filtered query. */
  includedLeafIndices: Uint32Array;
  /** Base aggregate index for every tree leaf; UINT32_MAX means excluded. */
  aggregateByLeaf: Uint32Array;
  /** Exact leaf index for focused base aggregates; -1 means aggregate. */
  aggregateExactLeafIndices: Int32Array;
  aggregateMemberCounts: Uint32Array;
  aggregateInternalEdgeCounts: Float64Array;
  aggregateEdgeSources: Uint32Array;
  aggregateEdgeTargets: Uint32Array;
  aggregateEdgeCounts: Float64Array;
  aggregateEdgeDistanceMin: Float32Array;
  aggregateEdgeDistanceMax: Float32Array;
  aggregateEdgeDistanceMean: Float32Array;
}

export interface PatristicNearestNeighborTimings {
  epsilon: number;
  mstMs: number;
  pairScanMs: number;
  emittedEdgeCount: number;
  pairsProcessed: number;
  totalPairs: number;
  maxEdgesHit: boolean;
}

// ─── Worker request messages ─────────────────────────────────────────────────

export interface PatristicInitTreeRequest {
  type: 'INIT_TREE';
  jobId: number;
  newickString: string;
}

export interface PatristicBuildEdgesRequest {
  type: 'BUILD_EDGES';
  jobId: number;
  threshold: number;
  /** Maximum number of edges to emit before stopping. Default: unlimited. */
  maxEdges?: number;
  /** Number of edges per batch message. Default: 10000. */
  batchSize?: number;
  /** Continue scanning after maxEdges so analytical counts remain exact. */
  scanAllPairs?: boolean;
  /** Maximum number of aggregate nodes in the semantic overview. */
  viewNodeBudget?: number;
  /** Optional leaf-index subset defining the filtered analytical graph. */
  includedLeafIndices?: Uint32Array;
  /** Optional included leaves that must remain exact in the base view. */
  focusLeafIndices?: Uint32Array;
}

export interface PatristicBuildNearestNeighborRequest {
  type: 'BUILD_NEAREST_NEIGHBOR_EDGES';
  jobId: number;
  /** Already-expanded epsilon value. For example, filtering-epsilon -8 becomes 1e-8. */
  epsilon: number;
  /** Number of edges per batch message. Default: 10000. */
  batchSize?: number;
  /** Maximum legacy backbone edges to emit. Default: unlimited. */
  maxEdges?: number;
}

export interface PatristicExportMatrixRequest {
  type: 'EXPORT_MATRIX';
  jobId: number;
}

export interface PatristicCancelRequest {
  type: 'CANCEL';
  jobId: number;
}

export type PatristicWorkerRequest =
  | PatristicInitTreeRequest
  | PatristicBuildEdgesRequest
  | PatristicBuildNearestNeighborRequest
  | PatristicExportMatrixRequest
  | PatristicCancelRequest;

// ─── Worker response messages ────────────────────────────────────────────────

export interface PatristicTreeReadyResponse {
  type: 'TREE_READY';
  jobId: number;
  leafCount: number;
  nodeCount: number;
  leafNames: string[];
  maxDistance: number;
  maxRootDepth: number;
  timings: PatristicTreeTimings;
}

export interface PatristicProgressResponse {
  type: 'PROGRESS';
  jobId: number;
  phase: 'parse' | 'flatten' | 'lca' | 'pairs';
  percent: number;
}

export interface PatristicEdgeBatchResponse {
  type: 'EDGE_BATCH';
  jobId: number;
  /** Leaf indices (into leafNames) for source of each edge. */
  sources: Uint32Array;
  /** Leaf indices (into leafNames) for target of each edge. */
  targets: Uint32Array;
  /** Patristic distances for each edge. */
  distances: Float32Array;
  /** Total edges emitted so far (including this batch). */
  totalEmitted: number;
  /** True when this is the final batch. */
  done: boolean;
  /** Present only on the final batch. */
  timings?: PatristicEdgeTimings;
  /** Present only on a final, fully scanned batch. */
  summary?: PatristicFilteredGraphSummary;
}

export interface PatristicMatrixChunkResponse {
  type: 'MATRIX_CHUNK';
  jobId: number;
  /** Row index in the leaf x leaf matrix. */
  row: number;
  /** Distances for this row (Float64 for export precision). */
  values: Float64Array;
  done: boolean;
}

export interface PatristicNearestNeighborBatchResponse {
  type: 'NN_EDGE_BATCH';
  jobId: number;
  /** Leaf indices (into leafNames) for source of each selected edge. */
  sources: Uint32Array;
  /** Leaf indices (into leafNames) for target of each selected edge. */
  targets: Uint32Array;
  /** Patristic distances for each selected edge. */
  distances: Float32Array;
  /** Total edges emitted so far (including this batch). */
  totalEmitted: number;
  /** True when this is the final batch. */
  done: boolean;
  /** Present only on the final batch. */
  timings?: PatristicNearestNeighborTimings;
}

export interface PatristicErrorResponse {
  type: 'ERROR';
  jobId: number;
  message: string;
}

export type PatristicWorkerResponse =
  | PatristicTreeReadyResponse
  | PatristicProgressResponse
  | PatristicEdgeBatchResponse
  | PatristicMatrixChunkResponse
  | PatristicNearestNeighborBatchResponse
  | PatristicErrorResponse;
