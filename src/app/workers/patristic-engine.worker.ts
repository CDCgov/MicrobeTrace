/// <reference lib="webworker" />

/**
 * Patristic Distance Engine Worker
 *
 * Preprocesses a Newick tree into flat typed arrays, builds an LCA index
 * via Euler tour + sparse table RMQ, and streams only threshold-qualifying
 * edges back to the main thread as transferable typed-array batches.
 *
 * Key performance properties:
 * - Tree preprocessing: O(N) flatten + O(N log N) LCA build
 * - Each pairwise distance: O(1) via depth[i] + depth[j] - 2*depth[lca(i,j)]
 * - Only threshold-passing edges are materialized and transferred
 * - Typed arrays are transferred (zero-copy) to main thread
 * - Tree preprocessing is cached across threshold changes
 */

import * as patristic from 'patristic';
import type {
  FlatTree,
  LcaIndex,
  PatristicWorkerRequest,
  PatristicWorkerResponse,
  PatristicEdgeBatchResponse,
  PatristicEdgeTimings,
  PatristicNearestNeighborBatchResponse,
  PatristicNearestNeighborTimings,
} from './patristic-engine.types';

// ─── Worker state (persists across messages) ─────────────────────────────────

let currentTree: FlatTree | null = null;
let currentLca: LcaIndex | null = null;
let cancelledJobs = new Set<number>();

// ─── Tree flattening ─────────────────────────────────────────────────────────

function getBranchLabel(node: any): string {
  const rawLabel = node?.id ?? node?.name ?? node?.data?.id ?? node?.data?.name;
  if (rawLabel === undefined || rawLabel === null) return '';
  return String(rawLabel).trim();
}

/**
 * Flatten a patristic Branch tree into contiguous typed arrays.
 * This replaces the recursive JS object tree with cache-friendly arrays.
 */
function flattenTree(root: any): FlatTree {
  // First pass: count nodes
  let nodeCount = 0;
  const stack: any[] = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    nodeCount++;
    const children = node.children || [];
    for (let i = children.length - 1; i >= 0; i--) {
      stack.push(children[i]);
    }
  }

  // Allocate arrays
  const parent = new Int32Array(nodeCount);
  const branchLength = new Float64Array(nodeCount);
  const rootDepth = new Float64Array(nodeCount);
  const isLeaf = new Uint8Array(nodeCount);
  const leafIndices: number[] = [];
  const leafNames: string[] = [];
  const nodeNames: string[] = new Array(nodeCount);

  // Second pass: assign indices via iterative DFS
  // Stack entries: [node, parentIndex]
  const assignStack: Array<[any, number]> = [[root, -1]];
  let nextIndex = 0;

  while (assignStack.length > 0) {
    const [node, parentIdx] = assignStack.pop()!;
    const idx = nextIndex++;
    const nodeName = getBranchLabel(node);

    parent[idx] = parentIdx;
    nodeNames[idx] = nodeName;
    const bl = typeof node.length === 'number' ? node.length : 0;
    branchLength[idx] = bl;
    rootDepth[idx] = parentIdx >= 0 ? rootDepth[parentIdx] + bl : 0;

    const children = node.children || [];
    if (children.length === 0) {
      isLeaf[idx] = 1;
      leafIndices.push(idx);
      leafNames.push(nodeName || `leaf_${leafIndices.length - 1}`);
    } else {
      isLeaf[idx] = 0;
      // Push children in reverse so leftmost child is processed first
      for (let i = children.length - 1; i >= 0; i--) {
        assignStack.push([children[i], idx]);
      }
    }
  }

  const leafCount = leafIndices.length;
  const leafNodeIndex = new Int32Array(leafCount);
  for (let i = 0; i < leafCount; i++) {
    leafNodeIndex[i] = leafIndices[i];
  }

  return {
    nodeCount,
    leafCount,
    parent,
    branchLength,
    rootDepth,
    isLeaf,
    leafNodeIndex,
    leafNames,
    nodeNames,
  };
}

// ─── Validation ──────────────────────────────────────────────────────────────

function describeTreeNode(tree: FlatTree, nodeIndex: number): string {
  if (nodeIndex < 0 || nodeIndex >= tree.nodeCount) return 'unknown node';

  const name = tree.nodeNames[nodeIndex];
  const kind = tree.parent[nodeIndex] < 0
    ? 'root'
    : tree.isLeaf[nodeIndex]
      ? 'leaf'
      : 'internal node';

  return name ? `${kind} "${name}"` : `${kind} at worker index ${nodeIndex}`;
}

function firstDescendantLeafName(tree: FlatTree, nodeIndex: number): string | null {
  for (let leafIndex = 0; leafIndex < tree.leafCount; leafIndex++) {
    let current = tree.leafNodeIndex[leafIndex];
    while (current >= 0) {
      if (current === nodeIndex) return tree.leafNames[leafIndex] || null;
      current = tree.parent[current];
    }
  }

  return null;
}

function describeTreeNodeContext(tree: FlatTree, nodeIndex: number): string {
  const details = [`branch: ${describeTreeNode(tree, nodeIndex)}`];
  const parentIndex = tree.parent[nodeIndex];
  if (parentIndex >= 0) {
    details.push(`parent: ${describeTreeNode(tree, parentIndex)}`);
  }

  if (!tree.isLeaf[nodeIndex]) {
    const nearbyLeaf = firstDescendantLeafName(tree, nodeIndex);
    if (nearbyLeaf) details.push(`near leaf "${nearbyLeaf}"`);
  }

  details.push(`worker index ${nodeIndex}`);
  return details.join('; ');
}

function validateTree(tree: FlatTree): string | null {
  // Check for negative branch lengths
  for (let i = 0; i < tree.nodeCount; i++) {
    if (tree.branchLength[i] < 0) {
      return `Negative branch length (${tree.branchLength[i]}) in Newick tree (${describeTreeNodeContext(tree, i)}). Branch lengths must be non-negative; this may indicate a malformed tree.`;
    }
  }

  // Check for NaN depths
  for (let i = 0; i < tree.nodeCount; i++) {
    if (isNaN(tree.rootDepth[i])) {
      return `Invalid root depth in Newick tree (${describeTreeNodeContext(tree, i)}). Check for missing or invalid branch lengths.`;
    }
  }

  // Check for duplicate leaf names
  const seen = new Set<string>();
  for (let i = 0; i < tree.leafCount; i++) {
    const name = tree.leafNames[i];
    if (seen.has(name)) {
      return `Duplicate leaf name: "${name}". Patristic distances require unique taxa.`;
    }
    seen.add(name);
  }

  if (tree.leafCount === 0) {
    return 'Tree has no leaves.';
  }

  return null;
}

function calculateTreeMetrics(tree: FlatTree): { maxDistance: number; maxRootDepth: number } {
  const children: number[][] = new Array(tree.nodeCount);
  for (let i = 0; i < tree.nodeCount; i++) {
    children[i] = [];
  }
  for (let i = 1; i < tree.nodeCount; i++) {
    children[tree.parent[i]].push(i);
  }

  const bestDownToLeaf = new Float64Array(tree.nodeCount);
  let maxDistance = 0;
  let maxRootDepth = 0;

  for (let i = 0; i < tree.leafCount; i++) {
    const nodeIndex = tree.leafNodeIndex[i];
    if (tree.rootDepth[nodeIndex] > maxRootDepth) {
      maxRootDepth = tree.rootDepth[nodeIndex];
    }
  }

  for (let nodeIndex = tree.nodeCount - 1; nodeIndex >= 0; nodeIndex--) {
    if (tree.isLeaf[nodeIndex]) {
      bestDownToLeaf[nodeIndex] = 0;
      continue;
    }

    let best = 0;
    let secondBest = 0;
    for (const childIndex of children[nodeIndex]) {
      const childDistance = tree.branchLength[childIndex] + bestDownToLeaf[childIndex];
      if (childDistance >= best) {
        secondBest = best;
        best = childDistance;
      } else if (childDistance > secondBest) {
        secondBest = childDistance;
      }
    }

    bestDownToLeaf[nodeIndex] = best;
    maxDistance = Math.max(maxDistance, best + secondBest);
  }

  return { maxDistance, maxRootDepth };
}

// ─── LCA via Euler tour + Sparse Table RMQ ───────────────────────────────────

/**
 * Build LCA index for the flattened tree.
 *
 * 1. Euler tour: DFS visiting each node on enter and on return from each child.
 *    Tour length = 2*nodeCount - 1.
 * 2. Sparse table: for range-minimum queries on the Euler tour depths.
 *    Preprocessing O(N log N), each query O(1).
 */
function buildLcaIndex(tree: FlatTree): LcaIndex {
  const tourLength = 2 * tree.nodeCount - 1;
  const euler = new Int32Array(tourLength);
  const eulerDepth = new Int32Array(tourLength);
  const firstOccurrence = new Int32Array(tree.nodeCount).fill(-1);

  // Build children adjacency list from parent array
  const childrenStart: number[][] = new Array(tree.nodeCount);
  for (let i = 0; i < tree.nodeCount; i++) {
    childrenStart[i] = [];
  }
  for (let i = 1; i < tree.nodeCount; i++) {
    childrenStart[tree.parent[i]].push(i);
  }

  // Iterative Euler tour DFS
  // Stack entries: [nodeIndex, childPointer, depth]
  let tourPos = 0;
  const dfsStack: Array<[number, number, number]> = [[0, 0, 0]];

  while (dfsStack.length > 0) {
    const top = dfsStack[dfsStack.length - 1];
    const nodeIdx = top[0];
    const childPtr = top[1];
    const depth = top[2];
    const children = childrenStart[nodeIdx];

    if (childPtr === 0) {
      // First visit to this node
      euler[tourPos] = nodeIdx;
      eulerDepth[tourPos] = depth;
      if (firstOccurrence[nodeIdx] === -1) {
        firstOccurrence[nodeIdx] = tourPos;
      }
      tourPos++;
    }

    if (childPtr < children.length) {
      // Advance to next child
      top[1]++;
      const childIdx = children[childPtr];
      dfsStack.push([childIdx, 0, depth + 1]);
    } else {
      // Done with all children, backtrack
      dfsStack.pop();
      if (dfsStack.length > 0) {
        // Record return visit to parent
        const parentTop = dfsStack[dfsStack.length - 1];
        euler[tourPos] = parentTop[0];
        eulerDepth[tourPos] = parentTop[2];
        tourPos++;
      }
    }
  }

  // Build sparse table for RMQ on eulerDepth[0..tourPos-1]
  const n = tourPos;
  const log2 = new Int32Array(n + 1);
  for (let i = 2; i <= n; i++) {
    log2[i] = log2[i >> 1] + 1;
  }

  const maxLog = log2[n] + 1;
  const sparseTable: Int32Array[] = new Array(maxLog);

  // Base level: each position is itself
  sparseTable[0] = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    sparseTable[0][i] = i;
  }

  // Fill higher levels
  for (let k = 1; k < maxLog; k++) {
    const prevLen = n - (1 << k) + 1;
    sparseTable[k] = new Int32Array(Math.max(prevLen, 0));
    const half = 1 << (k - 1);
    for (let i = 0; i < prevLen; i++) {
      const left = sparseTable[k - 1][i];
      const right = sparseTable[k - 1][i + half];
      sparseTable[k][i] = eulerDepth[left] <= eulerDepth[right] ? left : right;
    }
  }

  return { euler, eulerDepth, firstOccurrence, sparseTable, log2 };
}

/**
 * Query LCA of two nodes. Returns the node index of their LCA.
 * O(1) per query.
 */
function queryLca(nodeA: number, nodeB: number, lca: LcaIndex): number {
  let l = lca.firstOccurrence[nodeA];
  let r = lca.firstOccurrence[nodeB];
  if (l > r) {
    const tmp = l;
    l = r;
    r = tmp;
  }
  const length = r - l + 1;
  const k = lca.log2[length];
  const left = lca.sparseTable[k][l];
  const right = lca.sparseTable[k][r - (1 << k) + 1];
  const minPos = lca.eulerDepth[left] <= lca.eulerDepth[right] ? left : right;
  return lca.euler[minPos];
}

/**
 * Compute patristic distance between two leaves.
 * dist(i, j) = rootDepth[i] + rootDepth[j] - 2 * rootDepth[lca(i, j)]
 */
function patristicDistance(
  leafIndexA: number,
  leafIndexB: number,
  tree: FlatTree,
  lca: LcaIndex
): number {
  const nodeA = tree.leafNodeIndex[leafIndexA];
  const nodeB = tree.leafNodeIndex[leafIndexB];
  const lcaNode = queryLca(nodeA, nodeB, lca);
  return tree.rootDepth[nodeA] + tree.rootDepth[nodeB] - 2 * tree.rootDepth[lcaNode];
}

// ─── Edge generation ─────────────────────────────────────────────────────────

/**
 * Generate all leaf pairs with patristic distance <= threshold.
 * Emits results in batches of typed arrays for efficient transfer.
 */
function generateThresholdedEdges(
  tree: FlatTree,
  lca: LcaIndex,
  threshold: number,
  jobId: number,
  batchSize: number = 10000,
  maxEdges: number = Infinity
): void {
  const pairStart = performance.now();
  const n = tree.leafCount;
  const totalPairs = (n * (n - 1)) / 2;

  // Pre-allocate batch buffers
  let batchSources = new Uint32Array(batchSize);
  let batchTargets = new Uint32Array(batchSize);
  let batchDistances = new Float32Array(batchSize);
  let batchPos = 0;
  let totalEmitted = 0;
  let pairsProcessed = 0;
  let lastProgressPercent = -1;

  for (let i = 0; i < n && totalEmitted < maxEdges; i++) {
    for (let j = 0; j < i && totalEmitted < maxEdges; j++) {
      // Check cancellation periodically (every 100K pairs)
      if (pairsProcessed % 100000 === 0 && cancelledJobs.has(jobId)) {
        cancelledJobs.delete(jobId);
        return;
      }

      const dist = patristicDistance(i, j, tree, lca);
      pairsProcessed++;

      // Report progress periodically
      const percent = Math.floor((pairsProcessed / totalPairs) * 100);
      if (percent > lastProgressPercent && percent % 5 === 0) {
        lastProgressPercent = percent;
        respond({
          type: 'PROGRESS',
          jobId,
          phase: 'pairs',
          percent,
        });
      }

      if (dist <= threshold) {
        batchSources[batchPos] = i;
        batchTargets[batchPos] = j;
        batchDistances[batchPos] = dist;
        batchPos++;
        totalEmitted++;

        // Flush batch when full
        if (batchPos >= batchSize) {
          flushBatch(jobId, batchSources, batchTargets, batchDistances, batchPos, totalEmitted, false);
          // Allocate new buffers (old ones were transferred)
          batchSources = new Uint32Array(batchSize);
          batchTargets = new Uint32Array(batchSize);
          batchDistances = new Float32Array(batchSize);
          batchPos = 0;
        }
      }
    }
  }

  // Flush remaining
  const timings: PatristicEdgeTimings = {
    threshold,
    pairScanMs: performance.now() - pairStart,
    emittedEdgeCount: totalEmitted,
    totalPairs,
    maxEdgesHit: Number.isFinite(maxEdges) && totalEmitted >= maxEdges && pairsProcessed < totalPairs,
  };
  flushBatch(jobId, batchSources, batchTargets, batchDistances, batchPos, totalEmitted, true, timings);
}

function buildPatristicMst(tree: FlatTree, lca: LcaIndex, jobId: number): { parent: Int32Array; edgeWeight: Float64Array } {
  const n = tree.leafCount;
  const parent = new Int32Array(n).fill(-1);
  const edgeWeight = new Float64Array(n);
  const key = new Float64Array(n);
  const inMst = new Uint8Array(n);

  key.fill(Number.POSITIVE_INFINITY);
  edgeWeight.fill(0);
  key[0] = 0;

  for (let count = 0; count < n; count++) {
    if (count % 100 === 0 && cancelledJobs.has(jobId)) {
      cancelledJobs.delete(jobId);
      break;
    }

    let minValue = Number.POSITIVE_INFINITY;
    let minIndex = -1;
    for (let i = 0; i < n; i++) {
      if (!inMst[i] && key[i] < minValue) {
        minValue = key[i];
        minIndex = i;
      }
    }

    if (minIndex < 0) break;

    inMst[minIndex] = 1;

    for (let target = 0; target < n; target++) {
      if (inMst[target] || target === minIndex) continue;

      const dist = patristicDistance(minIndex, target, tree, lca);
      if (dist >= 0 && dist < key[target]) {
        parent[target] = minIndex;
        key[target] = dist;
        edgeWeight[target] = dist;
      }
    }
  }

  return { parent, edgeWeight };
}

function buildMstAdjacency(parent: Int32Array, edgeWeight: Float64Array): Array<Array<[number, number]>> {
  const adjacency: Array<Array<[number, number]>> = Array.from({ length: parent.length }, () => []);

  for (let i = 1; i < parent.length; i++) {
    const p = parent[i];
    if (p < 0) continue;

    const weight = edgeWeight[i];
    adjacency[i].push([p, weight]);
    adjacency[p].push([i, weight]);
  }

  return adjacency;
}

/**
 * Generate the same MST-plus-epsilon nearest-neighbor edge set used by the
 * legacy matrix worker, but compute distances directly from the Newick tree.
 */
function generateNearestNeighborEdges(
  tree: FlatTree,
  lca: LcaIndex,
  epsilon: number,
  jobId: number,
  batchSize: number = 10000
): void {
  const n = tree.leafCount;
  const totalPairs = (n * (n - 1)) / 2;
  const mstStart = performance.now();
  const { parent, edgeWeight } = buildPatristicMst(tree, lca, jobId);
  const mstMs = performance.now() - mstStart;
  const adjacency = buildMstAdjacency(parent, edgeWeight);
  const pairStart = performance.now();
  const epsilonMultiplier = 1 + Math.max(0, epsilon);
  const seenEdges = new Set<string>();
  const longestEdgeToRoot = new Float64Array(n);
  const visited = new Uint8Array(n);
  const queue = new Int32Array(n);

  let batchSources = new Uint32Array(batchSize);
  let batchTargets = new Uint32Array(batchSize);
  let batchDistances = new Float32Array(batchSize);
  let batchPos = 0;
  let totalEmitted = 0;
  let pairsProcessed = 0;
  let lastProgressPercent = -1;

  const emitEdge = (a: number, b: number, distance: number): void => {
    if (a === b || a < 0 || b < 0) return;

    const source = Math.max(a, b);
    const target = Math.min(a, b);
    const key = `${source}-${target}`;
    if (seenEdges.has(key)) return;

    seenEdges.add(key);
    batchSources[batchPos] = source;
    batchTargets[batchPos] = target;
    batchDistances[batchPos] = distance;
    batchPos++;
    totalEmitted++;

    if (batchPos >= batchSize) {
      flushNearestNeighborBatch(jobId, batchSources, batchTargets, batchDistances, batchPos, totalEmitted, false);
      batchSources = new Uint32Array(batchSize);
      batchTargets = new Uint32Array(batchSize);
      batchDistances = new Float32Array(batchSize);
      batchPos = 0;
    }
  };

  for (let leafIndex = 1; leafIndex < n; leafIndex++) {
    const parentIndex = parent[leafIndex];
    if (parentIndex >= 0) {
      emitEdge(leafIndex, parentIndex, edgeWeight[leafIndex]);
    }
  }

  for (let root = 0; root < n; root++) {
    if (cancelledJobs.has(jobId)) {
      cancelledJobs.delete(jobId);
      return;
    }

    visited.fill(0);
    longestEdgeToRoot.fill(0);
    let queueStart = 0;
    let queueEnd = 0;
    queue[queueEnd++] = root;
    visited[root] = 1;

    while (queueStart < queueEnd) {
      const node = queue[queueStart++];
      for (const [neighbor, weight] of adjacency[node]) {
        if (visited[neighbor]) continue;

        visited[neighbor] = 1;
        longestEdgeToRoot[neighbor] = Math.max(longestEdgeToRoot[node], weight);
        queue[queueEnd++] = neighbor;
      }
    }

    for (let target = 0; target < root; target++) {
      pairsProcessed++;

      const percent = Math.floor((pairsProcessed / totalPairs) * 100);
      if (percent > lastProgressPercent && percent % 5 === 0) {
        lastProgressPercent = percent;
        respond({
          type: 'PROGRESS',
          jobId,
          phase: 'pairs',
          percent,
        });
      }

      const longestPathEdge = longestEdgeToRoot[target];
      if (longestPathEdge <= 0) continue;

      const dist = patristicDistance(root, target, tree, lca);
      if (dist > 0 && dist <= longestPathEdge * epsilonMultiplier) {
        emitEdge(root, target, dist);
      }
    }
  }

  const timings: PatristicNearestNeighborTimings = {
    epsilon,
    mstMs,
    pairScanMs: performance.now() - pairStart,
    emittedEdgeCount: totalEmitted,
    totalPairs,
  };
  flushNearestNeighborBatch(
    jobId,
    batchSources,
    batchTargets,
    batchDistances,
    batchPos,
    totalEmitted,
    true,
    timings
  );
}

/**
 * Generate ALL edges (no threshold) for full matrix export.
 * Streams row by row for memory efficiency.
 */
function generateFullMatrix(tree: FlatTree, lca: LcaIndex, jobId: number): void {
  const n = tree.leafCount;

  for (let i = 0; i < n; i++) {
    if (cancelledJobs.has(jobId)) {
      cancelledJobs.delete(jobId);
      return;
    }

    const row = new Float64Array(n);
    for (let j = 0; j < n; j++) {
      if (i === j) {
        row[j] = 0;
      } else {
        const nodeA = tree.leafNodeIndex[i];
        const nodeB = tree.leafNodeIndex[j];
        const lcaNode = queryLca(nodeA, nodeB, lca);
        row[j] = tree.rootDepth[nodeA] + tree.rootDepth[nodeB] - 2 * tree.rootDepth[lcaNode];
      }
    }

    const transferRow = row;
    const response: any = {
      type: 'MATRIX_CHUNK',
      jobId,
      row: i,
      values: transferRow,
      done: i === n - 1,
    };
    postMessage(response, [transferRow.buffer] as any);

    // Progress
    if (i % 50 === 0 || i === n - 1) {
      respond({
        type: 'PROGRESS',
        jobId,
        phase: 'pairs',
        percent: Math.floor(((i + 1) / n) * 100),
      });
    }
  }
}

function flushBatch(
  jobId: number,
  sources: Uint32Array,
  targets: Uint32Array,
  distances: Float32Array,
  count: number,
  totalEmitted: number,
  done: boolean,
  timings?: PatristicEdgeTimings
): void {
  // Slice to actual size if batch is partially filled
  const s = count < sources.length ? sources.slice(0, count) : sources;
  const t = count < targets.length ? targets.slice(0, count) : targets;
  const d = count < distances.length ? distances.slice(0, count) : distances;

  const response: PatristicEdgeBatchResponse = {
    type: 'EDGE_BATCH',
    jobId,
    sources: s,
    targets: t,
    distances: d,
    totalEmitted,
    done,
  };
  if (timings) {
    response.timings = timings;
  }

  // Transfer the typed array buffers (zero-copy)
  postMessage(response, [s.buffer, t.buffer, d.buffer] as any);
}

function flushNearestNeighborBatch(
  jobId: number,
  sources: Uint32Array,
  targets: Uint32Array,
  distances: Float32Array,
  count: number,
  totalEmitted: number,
  done: boolean,
  timings?: PatristicNearestNeighborTimings
): void {
  const s = count < sources.length ? sources.slice(0, count) : sources;
  const t = count < targets.length ? targets.slice(0, count) : targets;
  const d = count < distances.length ? distances.slice(0, count) : distances;

  const response: PatristicNearestNeighborBatchResponse = {
    type: 'NN_EDGE_BATCH',
    jobId,
    sources: s,
    targets: t,
    distances: d,
    totalEmitted,
    done,
  };
  if (timings) {
    response.timings = timings;
  }

  postMessage(response, [s.buffer, t.buffer, d.buffer] as any);
}

function respond(msg: PatristicWorkerResponse): void {
  postMessage(msg);
}

// ─── Message handler ─────────────────────────────────────────────────────────

addEventListener('message', ({ data }: { data: PatristicWorkerRequest }) => {
  try {
    switch (data.type) {
      case 'INIT_TREE': {
        const { jobId, newickString } = data;
        const totalStart = performance.now();

        // Parse
        respond({ type: 'PROGRESS', jobId, phase: 'parse', percent: 0 });
        const parseStart = performance.now();
        let parsedTree: any;
        try {
          parsedTree = patristic.parseNewick(newickString);
        } catch (e: any) {
          respond({ type: 'ERROR', jobId, message: `Failed to parse Newick: ${e.message || e}` });
          return;
        }
        const parseMs = performance.now() - parseStart;

        // Flatten
        respond({ type: 'PROGRESS', jobId, phase: 'flatten', percent: 25 });
        const flattenStart = performance.now();
        currentTree = flattenTree(parsedTree);
        const flattenMs = performance.now() - flattenStart;

        // Validate
        const validationStart = performance.now();
        const validationError = validateTree(currentTree);
        const validationMs = performance.now() - validationStart;
        if (validationError) {
          respond({ type: 'ERROR', jobId, message: validationError });
          currentTree = null;
          return;
        }

        const metricsStart = performance.now();
        const treeMetrics = calculateTreeMetrics(currentTree);
        const metricsMs = performance.now() - metricsStart;

        // Build LCA
        respond({ type: 'PROGRESS', jobId, phase: 'lca', percent: 50 });
        const lcaStart = performance.now();
        currentLca = buildLcaIndex(currentTree);
        const lcaMs = performance.now() - lcaStart;

        respond({
          type: 'TREE_READY',
          jobId,
          leafCount: currentTree.leafCount,
          nodeCount: currentTree.nodeCount,
          leafNames: currentTree.leafNames,
          maxDistance: treeMetrics.maxDistance,
          maxRootDepth: treeMetrics.maxRootDepth,
          timings: {
            parseMs,
            flattenMs,
            validationMs,
            metricsMs,
            lcaMs,
            totalPreprocessingMs: performance.now() - totalStart,
          },
        });
        break;
      }

      case 'BUILD_EDGES': {
        const { jobId, threshold, maxEdges, batchSize } = data;

        if (!currentTree || !currentLca) {
          respond({ type: 'ERROR', jobId, message: 'No tree initialized. Call INIT_TREE first.' });
          return;
        }

        if (typeof threshold !== 'number' || threshold < 0) {
          respond({ type: 'ERROR', jobId, message: `Invalid threshold: ${threshold}` });
          return;
        }

        respond({ type: 'PROGRESS', jobId, phase: 'pairs', percent: 0 });
        generateThresholdedEdges(
          currentTree,
          currentLca,
          threshold,
          jobId,
          batchSize ?? 10000,
          maxEdges ?? Infinity
        );
        break;
      }

      case 'BUILD_NEAREST_NEIGHBOR_EDGES': {
        const { jobId, epsilon, batchSize } = data;

        if (!currentTree || !currentLca) {
          respond({ type: 'ERROR', jobId, message: 'No tree initialized. Call INIT_TREE first.' });
          return;
        }

        if (typeof epsilon !== 'number' || !Number.isFinite(epsilon) || epsilon < 0) {
          respond({ type: 'ERROR', jobId, message: `Invalid nearest-neighbor epsilon: ${epsilon}` });
          return;
        }

        respond({ type: 'PROGRESS', jobId, phase: 'pairs', percent: 0 });
        generateNearestNeighborEdges(
          currentTree,
          currentLca,
          epsilon,
          jobId,
          batchSize ?? 10000
        );
        break;
      }

      case 'EXPORT_MATRIX': {
        const { jobId } = data;

        if (!currentTree || !currentLca) {
          respond({ type: 'ERROR', jobId, message: 'No tree initialized. Call INIT_TREE first.' });
          return;
        }

        generateFullMatrix(currentTree, currentLca, jobId);
        break;
      }

      case 'CANCEL': {
        cancelledJobs.add(data.jobId);
        break;
      }

      default:
        respond({
          type: 'ERROR',
          jobId: (data as any).jobId ?? -1,
          message: `Unknown message type: ${(data as any).type}`,
        });
    }
  } catch (e: any) {
    respond({
      type: 'ERROR',
      jobId: (data as any).jobId ?? -1,
      message: `Unhandled worker error: ${e.message || e}`,
    });
  }
});
