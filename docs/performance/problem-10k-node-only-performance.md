# Problem 10k Node-Only Performance Case Study

This note documents the performance work for `cypress/fixtures/performance/problem_10k.csv`, a node-only uploaded CSV with 10,253 nodes and no links.

## Configuration

For the normal manual upload flow, the file must be configured as:

- file type: `Node`
- id field: `Sample Identifier`
- sequence field: `None`

The app may initially infer the file as a link file. In that case, switch the type from `Link` to `Node`, then set the sequence value to `None`.

## User-Visible Problem

The dataset felt much slower than it should for an edgeless graph after it was correctly configured as a node file with no sequence column. Grouping in the 2D Network view was slow enough to block interaction, especially when using Group By on a metadata field such as `HHS region and Site`.

## Bottleneck Assessment

The first issue found during automated repro work was a configuration-safety bug. A node CSV without an explicit sequence selection could still be treated as sequence-bearing because several checks only tested `field2 !== "None"`. When `field2` was undefined or blank, that condition was true, so the app could send metadata-only nodes into sequence/link processing. For this fixture, that turned an edgeless 10k-node load into unnecessary heavy processing and memory pressure.

Milestone instrumentation in that unsafe automated repro showed the app reached `launch-clicked` and then crashed during launch/processing. Chrome crashed its renderer after roughly 30 seconds. Electron reproduced the same failure as a V8 out-of-memory crash around 3.8-4.0 GB. This was not the expected manual baseline when the user explicitly sets Sequence to `None`; it was a guardrail bug for missing/undefined `field2`.

The main performance bottleneck for the correctly configured manual flow was 2D no-link rendering and grouping. With no links, a force layout and per-node compound group mutation do not add useful information, but they still cost time. The original group-by path also did repeated scans and individual Cytoscape moves, which becomes noticeable at 10k nodes.

## Code Changes

### Node CSV Sequence Detection

Updated `src/app/filesComponent/files-plugin.component.ts` so node files are considered sequence-bearing only when `field2` is explicitly present and not `None`.

Why:

- A missing or blank `field2` means "no sequence column" for node CSVs.
- Treating `undefined !== "None"` as sequence data accidentally enabled expensive sequence/link work.
- The fixture should remain a 10,253-node, 0-link scenario throughout launch.

Specific behavior changes:

- `anySequences` now requires a node file with a truthy `field2` that is not `None`.
- Node parsing assigns an empty `seq` when `field2` is missing or `None`.
- `nodeFilesWithSeqs` ignores missing, blank, and `None` `field2` values.

### 2D No-Link Layout

Updated `src/app/visualizationComponents/TwoDComponent/twoD-plugin.component.ts` to detect no-link graphs and skip force-layout work.

Why:

- With zero edges, force simulation does not improve topology; there is no topology to preserve.
- A deterministic grid position assignment is enough and avoids unnecessary D3 force ticks.

Specific behavior changes:

- Added no-link graph detection.
- Added deterministic grid position assignment for edgeless graphs.
- `precomputePositionsWithD3` now records zero tick batches for the no-link shortcut.

### Lean Cytoscape Node Data

Updated 2D Cytoscape element creation so each Cytoscape node receives only the fields needed for rendering and identity, while full metadata is cached by node id.

Why:

- The fixture has many metadata columns.
- Spreading every metadata field into every Cytoscape node duplicates a large object graph.
- Tooltips, context menus, styling, and grouping still need metadata, but Cytoscape does not need every raw column on every render element.

Specific behavior changes:

- Added a `nodeDataById` cache for full node metadata.
- Added helpers to read full node data only when metadata is required.
- `mapDataToCytoscapeElements` now builds lean Cytoscape node objects.

### Large No-Link Group-By Path

Added a fast grouping path for large no-link 2D graphs.

Why:

- Grouping by a metadata field should be mostly a data bucketing and positioning operation for an edgeless graph.
- The previous path mixed group assignment, layout, repeated lookups, and many individual Cytoscape mutations.

Specific behavior changes:

- `centerPolygons()` uses `updateGroupAssignmentsNoLinkFast()` for large no-link graphs.
- The fast path builds group buckets from cached full node data.
- Parent compound nodes are added in batches.
- Child nodes are moved to parents using Cytoscape collections instead of 10k individual moves.
- Grouped grid positions are applied without a second expensive layout pass.

### Repeated Lookup and Logging Cleanup

Reduced several avoidable costs in the 2D path and common services.

Why:

- O(n) searches inside loops become expensive at 10k nodes.
- Console logging large node/link/session arrays can materially slow Chrome and increase memory pressure during perf runs.

Specific behavior changes:

- Replaced repeated `.find()` and `.includes()` scans with maps/sets in grouping and partial-update paths.
- Guarded large diagnostic logs behind `debugMode`.
- Guarded large `convertToGraphDataArray`, cluster, sequence, and Cytoscape debug logs.

### Cypress Repro and Measurement

Added `cypress/e2e/performance/problem-10k-node-only.perf.cy.ts`.

Why:

- This captures the exact problem fixture as an opt-in performance scenario.
- It verifies the intended graph shape: 10,253 nodes, 0 total links, 0 visible links.
- It records load timing plus interaction responsiveness before and after Group By.

Run command:

```sh
npx cypress run --headless --browser chrome --config baseUrl=http://127.0.0.1:4210,trashAssetsBeforeRuns=false --env perfMode=1,perfProblem10k=1 --spec cypress/e2e/performance/problem-10k-node-only.perf.cy.ts
```

## Before and After

These numbers are from local Chrome/Electron repro work on May 6, 2026. They are useful for this fix comparison, but should not be promoted to stable budgets until repeated baseline samples are collected on stable hardware.

| Area | Before | After | Improvement |
| --- | --- | --- | --- |
| Unsafe automated launch with node-only CSV and missing/undefined `field2` | Chrome renderer crash after roughly 30s; Electron V8 OOM around 3.8-4.0 GB; no completed artifact | Scenario completes in Chrome | Missing sequence selection now behaves like no sequence data instead of entering sequence/link processing |
| Correct manual launch with file type `Node` and sequence `None` | Completed before the changes, but still paid unnecessary no-link layout/render/grouping costs | Scenario completes in Chrome | This is the relevant baseline for the interaction improvements below |
| Upload to file-ready | Not the observed bottleneck; launch milestone proved upload/settings completed | 865 ms | Confirms upload was not the issue |
| Launch to fully loaded | No stable timing in the original failure mode because launch crashed | 3,474 ms | From crash to completed load |
| Total measured scenario | No artifact in original failure mode | 8,216 ms | From crash to completed load plus interactions |
| 2D no-link position precompute | Force-layout path was unnecessary for zero links | 9 ms, 0 tick batches | No-link shortcut avoids D3 force ticks |
| Cytoscape creation | Large node metadata objects inflated render data | 277 ms | Lean node data keeps Cytoscape element creation bounded |
| Group By `HHS region and Site` action | 1,665 ms in the first passing pre-fast-path comparison | 466 ms | About 72% faster |
| Group By max frame gap | 2,116 ms in the first passing pre-fast-path comparison | 908 ms | About 57% smaller worst stall |
| Group By p95 frame gap | Not captured in the original crash path | 9 ms | Most frames stayed responsive during the observed window |
| Default cluster group toggle | Not captured in the original crash path | 13 ms action, 200 ms max frame gap | Acceptable for this dataset size |
| Post-group pan | Not captured in the original crash path | 426 ms max frame gap | Residual Cytoscape compound-node cost remains visible |
| Post-group box select | Not captured in the original crash path | 467 ms max frame gap | Residual selection/compound-node cost remains visible |

## Current Residual Bottleneck

The main remaining responsiveness risk is not initial ingestion for this no-link fixture. It is Cytoscape interaction after compound parent groups are created. The fast path reduced group-by time substantially, but worst-frame gaps around 400-900 ms still show that compound-node rendering and selection can block the main thread on 10k visible nodes.

Further improvement would likely require a different large-graph grouping representation, such as drawing group hulls or labels without moving every node into Cytoscape compound parents, or deferring/virtualizing expensive selection work after grouping.

## Validation

Validated after the performance changes:

- `npx tsc -p src/tsconfig.app.json --noEmit`
- Chrome Cypress run for `problem-10k-node-only`

The final Chrome run passed with 10,253 nodes, 10,253 visible nodes, 0 total links, 0 visible links, 10,253 clusters, 10,253 singleton nodes, and 0 sequences with data.
