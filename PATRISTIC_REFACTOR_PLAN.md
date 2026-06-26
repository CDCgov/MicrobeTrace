# MicrobeTrace Patristic Distance Engine Refactor Plan

## Problem Statement

MicrobeTrace currently tops out at ~500 taxa for patristic distance computation. The bottleneck is **not** the patristic formula itself, but:

1. **Full O(N^2) matrix materialization** via `tree.toMatrix()` before any filtering
2. **Per-link object creation overhead** — `addLink()` runs ~190 lines of logic per pair (125K calls at 500 taxa)
3. **Triple memory duplication** — same data lives in `session.data.links` + bidirectional `temp.matrix` + Cytoscape elements
4. **Main-thread blocking** — all computation runs on UI thread

### Current Hot Path (files-plugin.component.ts:1278-1313)

```typescript
const tree = patristic.parseNewick(file.contents);          // O(N)
let m = tree.toMatrix();                                      // O(N^2) — FULL matrix
for (let i = 0; i < n; i++) {
  for (let j = 0; j < i; j++) {
    this.commonService.addLink({                              // 125K calls at N=500
      source, target,
      distance: parseFloat(matrix[i][j]),                     // each call: ~190 lines
      ...
    }, check);
  }
}
```

Same pattern in `auspiceHandler.ts:173-182`:
```typescript
const distanceMatrix = patristic.parseNewick(newickString).toMatrix();
this.makeLinksFromMatrix(distanceMatrix);  // another full N^2 loop
```

---

## Architecture Decision: Option 1 (Modified)

Services in `contactTraceCommonServices/`, trigger at file load, both 2D and Phylo views consume.

**Rationale:**
- Patristic edges feed the **2D network** (Cytoscape), not the phylogeny view (TidyTree)
- `contactTraceCommonServices/` already houses `worker-compute.service.ts`
- File loading is the correct trigger point, not view activation
- Minimal new files — extend existing patterns instead of creating parallel architecture

---

## Phase 1: Eliminate O(N^2) Materialization (Biggest Win)

### New Files

| File | Purpose |
|------|---------|
| `src/app/workers/patristic-engine.worker.ts` | Web Worker: tree flattening, LCA, thresholded edge generation |
| `src/app/workers/patristic-engine.types.ts` | Shared types for worker messages |

### Modified Files

| File | Change |
|------|--------|
| `src/app/workers/compute-worker.types.ts` | Add `'patristic'` task type |
| `src/app/workers/compute.worker.ts` | Add `handlePatristic()` handler |
| `src/app/workers/workModule.ts` | Add `getPatristicWorker()` |
| `src/app/contactTraceCommonServices/worker-compute.service.ts` | Add `computePatristicEdges()` method |
| `src/app/filesComponent/files-plugin.component.ts` | Replace `toMatrix()` + addLink loop with worker call |
| `src/app/helperClasses/auspiceHandler.ts` | Remove `makeLinksFromMatrix()`, return tree for worker processing |

### Algorithm: Flat Tree + Root Depths + LCA + Thresholded Emission

Instead of `tree.toMatrix()` which computes ALL N^2 distances:

1. **Flatten** the patristic tree into typed arrays (O(N))
2. **Compute root-to-node depths** (O(N))
3. **Build LCA index** via Euler tour + sparse table RMQ (O(N log N))
4. **Iterate leaf pairs**, compute `dist(i,j) = depth[i] + depth[j] - 2*depth[lca(i,j)]` in O(1)
5. **Emit only edges below threshold** in batches of typed arrays

For N=2000, threshold=0.015:
- Old: compute 1,999,000 distances, create 1,999,000 link objects, then filter
- New: compute 1,999,000 distances (fast O(1) each), emit only ~50K-200K qualifying edges

### Worker Message Protocol

```typescript
// Request
{ type: 'INIT_TREE', jobId, newickString }
{ type: 'BUILD_EDGES', jobId, threshold, maxEdges?, batchSize? }
{ type: 'EXPORT_MATRIX', jobId }
{ type: 'CANCEL', jobId }

// Response
{ type: 'TREE_READY', jobId, leafCount, nodeCount }
{ type: 'PROGRESS', jobId, phase, percent }
{ type: 'EDGE_BATCH', jobId, sources: Uint32Array, targets: Uint32Array, distances: Float32Array, labels: string[], done: boolean }
{ type: 'MATRIX_CHUNK', jobId, ... }
{ type: 'ERROR', jobId, message }
```

### Key Design Decisions

1. **Bypass `addLink()` for bulk patristic loads.** The current `addLink()` does origin merging, duplicate detection, bidirectional matrix insertion, etc. For a fresh newick load (which calls `resetData()` first anyway), we can bulk-insert directly into `session.data.links` and `temp.matrix`.

2. **Worker owns the tree, main thread owns the graph.** The worker preprocesses the tree and streams qualifying edges. The main thread converts them to MT link objects only for the qualifying subset.

3. **Cache tree preprocessing.** When threshold changes, don't re-parse the tree. Just re-query the worker for edges at the new threshold. The worker keeps its flattened tree + LCA index in memory.

---

## Phase 2: Memory Reduction

### 2a. Move `session.files[].contents` to localforage

**Current:** Raw file contents stay in JS heap permanently after load.

**Change:** After parsing, write contents to IndexedDB via localforage, keep only metadata + storageKey in session.

**Impact:** 100MB-1GB savings depending on file sizes.

**Affected code:**
- `files-plugin.component.ts:1555` — write to localforage after FileReader
- `files-plugin.component.ts:1696` — file download: rehydrate from localforage
- `microbe-trace-next-plugin.component.ts:3060` — .microbetrace export: rehydrate for serialization

### 2b. Lazy/disposable `temp.matrix`

**Current:** `temp.matrix[source][target]` stores bidirectional link references for ALL links, always.

**Change:** Don't populate `temp.matrix` for patristic-only datasets. Use the sorted edge cache from `threshold-analysis.ts` instead. Build `temp.matrix` on-demand only for algorithms that need random-access pair lookup (MST, NN), then release it.

### 2c. Threshold-filtered Cytoscape elements

**Current:** `mapDataToCytoscapeElements()` creates Cytoscape element objects for ALL links, then Cytoscape filters by visibility.

**Change:** Only create Cytoscape elements for links passing the current threshold. When threshold changes, diff the edge set.

---

## Phase 3: Scale (Push to 2000+ Taxa)

### 3a. Subtree pruning for thresholded search

For each internal node, maintain:
- min/max root depth of descendant leaves
- leaf count

Lower bound for any cross-subtree pair distance:
```
lb(A, B) = depth_min(A) + depth_min(B) - 2 * depth(parent_of_AB)
```
If `lb > threshold`, skip all leaf pairs across those subtrees.

### 3b. Progressive loading

Stream first batch of edges quickly for immediate render, then continue generating remaining edges in background.

### 3c. Edge-density guardrails

Replace the hard 500-taxa cap with:
- Estimate pair count before run
- Warn if threshold likely creates too many edges
- Cap displayed edges, not taxa
- A sparse 2000-tip tree at strict threshold is fine; a dense 600-tip tree at permissive threshold isn't

---

## Benchmark Plan

Profile separately at 500, 1000, 2000, 5000 taxa:

| Metric | How |
|--------|-----|
| Newick parse time | `performance.now()` around `patristic.parseNewick()` |
| Tree preprocessing time | Worker-internal timing for flatten + LCA |
| Distance generation time | Worker-internal timing for pair iteration |
| Edge streaming time | Time from first batch to last batch received |
| Link object creation time | Main-thread timing for converting typed arrays to MT links |
| Cytoscape render time | Time from `cy.add()` to layout complete |
| Peak JS heap | `performance.memory.usedJSHeapSize` snapshots |
| Browser freeze duration | Long task observer or manual profiler |

---

## Regression Tests

| Test | Why |
|------|-----|
| Patristic distance invariant to rerooting | patristic + TidyTree both support rerooting |
| Zero-length internal branches handled | Common in real trees |
| Polytomies handled | Common in real trees |
| Duplicate tip names detected and rejected | Silent data corruption risk |
| Negative/missing branch lengths fail with clear error | Prevent NaN propagation |
| Floating-point stability near threshold | Epsilon rule for threshold boundary |
| Threshold change doesn't reparse tree | Cache validation |
| Worker cancellation on new file load | Prevent stale results |
| .microbetrace export includes all patristic edges | Regression for session portability |
| Auspice input produces identical edges to current | Backward compatibility |

---

## Implementation Order

### Sprint 1 (1-2 weeks): Worker + thresholded edge generation
- [ ] Add `patristic-engine.types.ts`
- [ ] Add `handlePatristic` to `compute.worker.ts` (flat tree + root depths + brute-force thresholded pairs)
- [ ] Add `getPatristicWorker()` to `workModule.ts`
- [ ] Add `computePatristicEdges()` to `worker-compute.service.ts`
- [ ] Replace newick path in `files-plugin.component.ts` with worker call
- [ ] Replace auspice path in `auspiceHandler.ts`
- [ ] Benchmark at 500 and 1000 taxa

### Sprint 2 (1-2 weeks): LCA + caching
- [ ] Add Euler tour + sparse table RMQ for O(1) LCA queries
- [ ] Cache tree preprocessing across threshold changes
- [ ] Add progress reporting from worker
- [ ] Add cancellation support
- [ ] Benchmark at 2000 taxa

### Sprint 3 (1 week): Memory reduction
- [ ] Move `session.files[].contents` to localforage
- [ ] Only create Cytoscape elements for threshold-passing edges
- [ ] Test .microbetrace export round-trip

### Sprint 4 (1 week): Polish
- [ ] Subtree pruning
- [ ] Edge-density guardrails and user messaging
- [ ] Export-only full matrix mode
- [ ] Remove hard taxa cap, replace with edge-density warnings
