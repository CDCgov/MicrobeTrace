# Patristic Engine Integration Guide

## Files Created (Phase 1)

1. **`src/app/workers/patristic-engine.types.ts`** — Shared types for worker messages
2. **`src/app/workers/patristic-engine.worker.ts`** — Web Worker with flat tree, LCA, thresholded edge generation

## Files Modified (Phase 1)

3. **`src/app/workers/workModule.ts`** — Added `getPatristicWorker()` and `terminatePatristicWorker()`
4. **`src/app/contactTraceCommonServices/worker-compute.service.ts`** — Added `computePatristicEdges()`, `initPatristicTree()`, `buildPatristicEdges()`, `cancelPatristicJob()`
5. **`src/app/filesComponent/files-plugin.component.ts`** — Newick and Auspice now use the patristic worker for thresholded edges
6. **`src/app/helperClasses/auspiceHandler.ts`** — Removed matrix-based link generation; returns `newickWithLabels` for worker-based edge generation

## Current Integration Status

- **Newick ingest** in `files-plugin.component.ts` now calls:
  - `WorkerComputeService.computePatristicEdges(file.contents, threshold, ...)`
  - Adds leaf nodes from the worker leaf index
  - Streams thresholded edges directly into `addLink`
- **Auspice ingest** now uses `AuspiceHandler` output `newickWithLabels` and the same worker path to generate links.
- **`PatristicTreeReadyResponse`** now includes `maxRootDepth`, used by Newick ingest for SNP heuristic:
  - if `maxRootDepth * 2 > 1`, metric is switched to `snps`.
- **`computePatristicEdges` options** now include:
  - `origin`
  - `distanceOrigin`
  - `check`
  - `session` (for debug logging)
- **Session file content persistence path** now hydrates offloaded file contents before launch and table-read paths:
  - files loaded into `commonService.session.files` can keep only `contentStorageKey` metadata in memory.
  - table preview, launch parsing, and sequence reads call `commonService.loadSessionFileContents(...)` during processing.

### Known follow-up work

- Completed:
- Added targeted unit test coverage for `WorkerComputeService.computePatristicEdges()` happy/error/cancel paths (`src/app/contactTraceCommonServices/worker-compute.service.spec.ts`).
- Added subtree-pruned threshold traversal with cached descendant-depth metadata and final build stats in `src/app/workers/patristic-engine.worker.ts`.
- Added export-only full-matrix streaming through `WorkerComputeService.exportPatristicDistanceMatrix()`, with `CommonService.getDM(true)` routing Heatmap CSV export through the worker instead of materializing all patristic links in session state.
- Added dense-edge guardrails that warn during patristic launch and cap displayed patristic edges at 10,000 when the threshold spans the tree diameter bound, with Cypress coverage for capped dense-star launches.
- Preserved launch-time threshold/metric settings across the Newick ingest `resetData()` path so dense guardrail launches honor the chosen threshold instead of falling back to the default TN93 `0.015`.
- Added Cypress integration coverage for malformed Newick load and cancellation behavior (`cypress/e2e/journeys/flows/patristic-computation.cy.ts`).
- Added dedicated Cypress coverage for subtree-pruning stats on the browser worker/service path (`cypress/e2e/journeys/flows/patristic-subtree-pruning.cy.ts`).
- Added progress-report callback coverage on the patristic compute path through `WorkerComputeService` and unit coverage for parsed/build-progress propagation (`src/app/contactTraceCommonServices/worker-compute.service.ts`, `src/app/contactTraceCommonServices/worker-compute.service.spec.ts`).
- Added synthetic Newick benchmark coverage for 500, 1000, and 2000 taxa in
  `cypress/e2e/journeys/flows/patristic-computation.cy.ts` (runtime measured with a 2s/5s/15s soft target log strategy and a hard budget check).
- Added Cytoscape materialization coverage for patristic paths to ensure invisible links are not rendered in `mapDataToCytoscapeElements` (`cypress/e2e/journeys/flows/patristic-computation.cy.ts`).

## Testing Checklist

### Unit tests for patristic-engine.worker.ts:

- [x] **Simple 3-leaf tree**: `((A:1,B:2):1,C:3);` — verify distances A-B=3, A-C=5, B-C=6
- [x] **Star topology**: `(A:1,B:1,C:1);` — all pairwise = 2
- [x] **Zero-length branches**: `((A:0,B:1):0,C:1);` — A-B=1, A-C=1, B-C=2
- [x] **Single leaf**: `(A:1);` — no edges, no crash
- [x] **Reroot invariance**: Same topology rendered with different root ordering produces identical pairwise distances
- [x] **Threshold filtering**: Tree with distances [1, 2, 5, 10], threshold=3 → only edges with d<=3
- [x] **Subtree pruning**: Balanced tree with distant sibling subtrees prunes the cross-subtree search while preserving the exact qualifying edge set
- [x] **Batch streaming**: 100-leaf tree, batchSize=10 → multiple batches, last has `done=true`
- [x] **Cancellation**: Start BUILD_EDGES, send CANCEL, verify no more batches
- [x] **Duplicate leaf names**: Should return ERROR
- [x] **Empty newick string**: Should return ERROR
- [x] **Negative branch lengths**: Should return ERROR

### Integration tests:

- [x] Load a newick file → correct number of nodes and links appear
- [x] Invalid Newick inputs show an error and keep the app in a launched-complete state
  - covered by `cypress/e2e/journeys/flows/patristic-computation.cy.ts` with malformed, duplicate-tip, negative-branch, and empty-tree fixtures
- [x] Threshold slider change → re-queries worker, doesn't reparse tree
  - covered by `cypress/e2e/journeys/flows/patristic-computation.cy.ts` asserting `BUILD_EDGES` posts on threshold updates and `INIT_TREE` does not.
- [x] Load auspice file → correct patristic edges
  - covered by `cypress/e2e/journeys/flows/patristic-computation.cy.ts` using `load-twod-auspice-patristic` fixture.
- [x] Load newick then load different newick → old tree replaced
  - covered by `cypress/e2e/journeys/flows/patristic-computation.cy.ts` using two deterministic tiny Newick fixtures.
- [x] .microbetrace export/import round-trip preserves edges
  - covered by `cypress/e2e/journeys/flows/session-roundtrip-uploaded.cy.ts` after adding Newick-derived session round-trip assertions.

### Benchmark targets:

| Taxa | Current | Target (Phase 1) | Target (Phase 2+) |
|------|---------|-------------------|--------------------|
| 500  | ~5-10s  | < 2s              | < 1s               |
| 1000 | fails   | < 5s              | < 2s               |
| 2000 | fails   | < 15s             | < 5s               |
| 5000 | fails   | may be slow       | < 15s              |
