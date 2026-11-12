# Threshold-Sensitivity View Plan

## Repository Baseline

This plan is implemented in the dedicated worktree at `C:\Users\qwu3\.codex\worktrees\threshold-sensitivity\MicrobeTrace` on branch `codex/threshold-sensitivity`, rebased onto the latest `origin/dev` (`3992f76b` at the time of implementation). The integrated Sigma migration commit (`0e82d08e`) is in that branch's ancestry.

The design therefore treats Sigma 4 + Graphology as the production 2D renderer. Cytoscape Canvas remains the explicitly selected compatibility fallback and must implement the same user-visible sensitivity contract.

## Decision

Build threshold sensitivity as a dedicated analysis mode inside the existing 2D Network view, not as a new top-level Golden Layout view.

The mode should have its own panel, chart, controls, and analysis state, but it should reuse the active 2D renderer, its resident node positions, and its camera. It must not create a second renderer or run the normal threshold refresh path while the analyst scrubs. This is the cleanest way to keep node positions, pan, zoom, selection, and styling fixed while previewing different genetic-distance thresholds.

Keep the ordinary threshold input in Global Settings for direct filtering. Add a **Threshold sensitivity** action to the 2D toolbar for comparative analysis. A standalone report view can be added later if users need saved multi-baseline comparisons or publication-oriented reports, but it should consume the same analysis engine rather than duplicate the 2D network.

## Why This Should Be Integrated

- Position preservation is most reliable when the same 2D renderer, resident node coordinates, and camera remain active. A separate view would need to clone and continually synchronize coordinates, viewport state, dragging, selection, styling, grouping, collapse state, Sigma display-graph projection, and compatibility-renderer state.
- The analyst needs to see changed edges and cluster transitions in the spatial context they already arranged. A context switch to another view weakens that comparison.
- The 2D component already persists renderer-neutral camera state and tracks node positions. The needed change is a renderer-neutral sensitivity overlay path that leaves the resident graph, display graph, layout, and camera untouched.
- Adding another Golden Layout component would expand registration, menus, session layouts, exports, lifecycle handling, and active-tab behavior without improving the core analysis.
- The existing Global Settings threshold area is appropriate for a scalar filter but too constrained for a baseline, range, stability report, and interactive network legend.

The implementation should still be modular: the analysis engine and report panel should not be embedded directly into the already-large `TwoDComponent` class.

## Existing Building Blocks

The repository already contains useful groundwork:

- `threshold-analysis.ts` builds a sorted genetic-edge cache and incrementally sweeps connected-component metrics with union-find.
- `CommonService.getThresholdSweepSummary()` caches threshold sweeps by metric and nearest-neighbor mode.
- The filtering sparkline already plots cluster count across distinct edge distances.
- The Smart Launch threshold recommendation and component-structure recommendation are currently enabled in Global Settings.
- `TwoDComponent` already owns renderer-neutral camera persistence while `SigmaNetworkRendererAdapter` owns the resident Graphology graph, display graph, edge LOD, custom overlay canvases, and WebGL lifecycle.
- The Sigma adapter already draws Canvas overlays for mixed-origin dashed links and node features, providing a proven extension point for sensitivity overlays.
- Large Newick inputs can use patristic MST edges to preserve threshold-connected components without materializing every pairwise edge.

These pieces should be reused, but they do not yet meet this feature's contract:

- The existing "stable range" detects only a flat count of multi-node clusters. Cluster membership can change without changing that count, such as when a singleton joins an existing cluster.
- A normal Sigma threshold refresh rebuilds the resident and display Graphology graphs and can run cluster layout; the Cytoscape fallback partial update runs 30 force-layout ticks and calls `fit()`. Neither path is suitable for slider preview.
- Sigma's display graph intentionally applies viewport-aware edge LOD. A changed edge can therefore be absent from the display graph unless sensitivity rendering bypasses or explicitly pins it.
- The current sweep cache does not fully encode the active node cohort, timeline gate, or subset filter in its key.
- The sweep reports aggregate counts but not the edge changes or component lineage needed to explain merges and splits.
- On large Newick datasets, MST analysis is sufficient for component structure but not for claiming that every threshold-qualified edge is available for display.

## User Experience

### Entering the mode

Add a **Threshold sensitivity** button to the 2D toolbar. On entry:

1. Fix the analysis cohort to the nodes that pass the current subset and timeline gates.
2. Capture the current genetic threshold as the baseline.
3. Snapshot node positions, pan, zoom, selection, and lock state.
4. Show all cohort nodes, including singletons, so cluster changes are not hidden by minimum-cluster-size filtering.
5. Open a responsive right-side panel; use a bottom sheet on narrow panes.

The panel header should state the metric, baseline threshold, node cohort size, and analysis policy. For example: "Genetic links only; 842 nodes in the current subset; contact-only links are context."

Other controls that would change the analysis cohort or distance policy should either be disabled while the mode is active or explicitly rebuild the baseline. Silent recomputation would make comparisons difficult to interpret.

### Moving the threshold

Use three related controls:

- A dual-handle range selector for the interval being assessed.
- A single preview handle that snaps to distinct structural event thresholds.
- A visible baseline marker with a **Set current as baseline** action.

The slider should snap to edge-distance events because the graph does not change between them. SNP values should retain integer display behavior; TN93 should use the existing decimal/percentage formatting.

Scrubbing is a local preview. It should update the 2D overlay and sensitivity report without mutating the global session threshold or forcing every other open view to refresh. Provide explicit **Apply threshold** and **Exit without applying** actions. Applying uses the shared global threshold path; canceling restores the original state.

### Network encoding

Compare the preview threshold to the fixed baseline, not merely to the previous animation frame. A stable baseline gives every color a consistent meaning while the analyst scrubs back and forth.

- Unchanged genetic edges: normal styling, slightly muted when change emphasis is enabled.
- Added genetic edges: teal or green emphasis.
- Removed baseline edges: retained as dashed magenta/red ghost edges.
- Contact/epidemiologic-only edges: muted context and excluded from cluster calculations.
- Mixed-origin links: preserve their context appearance while applying a genetic-layer change outline.
- Structural bridge edges: stronger emphasis than edges added within an already-connected component.
- Unchanged clusters: subtle stable outline.
- Merge: outline the resulting component and show a compact `2 -> 1` or `3 -> 1` badge.
- Split: outline the daughter components and show a `1 -> n` badge.

Do not replace the user's node fill colors, shapes, or labels; those already encode dataset variables. Use halos, outlines, edge classes, badges, and selection-based dimming for sensitivity information.

A transition list in the panel should be selectable. Selecting a merge, split, or changed edge should dim unrelated elements and focus the corresponding nodes without changing their coordinates.

### Reporting

At the preview threshold, show:

- active threshold-controlled genetic edges;
- added and removed edges relative to baseline;
- structural bridge changes versus within-component edge changes;
- genetic clusters and singletons;
- merges or splits relative to baseline;
- nodes whose exact component membership changed;
- largest cluster size and clustered-node percentage.

Across the selected range, show:

- exact partition-stability intervals;
- number of structural event thresholds;
- stable baseline clusters versus clusters that change;
- percentage of baseline-clustered nodes whose full cluster membership remains unchanged throughout the range;
- each baseline cluster's exact persistence interval and first change threshold;
- the widest exact-stability interval containing the baseline.

The chart should share one threshold x-axis and combine:

- a step line for cluster count;
- an edge-count line or area;
- structural event markers;
- a baseline marker and preview marker;
- optional partition agreement with the baseline.

Avoid presenting a single "best threshold" in the first release. Sensitivity is descriptive decision support. The existing enabled composite recommendation may appear as a labeled reference marker, but it must remain visually and semantically distinct from observed stability intervals.

## Stability Semantics

Do not define stability as an unchanged cluster count.

Define a partition as the exact connected-component membership of the fixed node cohort at a threshold. The partition is unchanged only when every node remains in the same component membership set. This catches singleton attachments even when the number of multi-node clusters stays flat.

For a baseline cluster, report:

- **Exact persistence interval:** the contiguous threshold interval containing the baseline over which the member set is identical.
- **Stable across selected range:** true only if the member set is identical everywhere in that range.
- **First change:** the nearest lower split threshold and higher merge/growth threshold.
- **Current overlap:** Jaccard overlap between the baseline member set and its best-matching preview component.

For the whole network, report a size-weighted stable-node share and optionally an Adjusted Rand Index curve labeled as "partition agreement." Exact persistence should be the primary, easily explained measure; the statistical agreement curve is supplementary.

Because thresholded undirected connectivity is monotonic:

- increasing the threshold can add edges, grow clusters, and merge components;
- decreasing the threshold is the inverse and can remove edges and split components;
- an equal-distance batch can cause a multiway event and must be treated atomically.

Edges that appear inside an already-connected component change density but not cluster membership. Report them as edge changes, not merge events.

## Analysis Scope

Freeze the cohort when sensitivity mode starts:

- include nodes passing the active network subset and timeline node gates;
- apply the selected distance metric and nearest-neighbor policy;
- exclude contact/epidemiologic-only links from threshold structure;
- include distance-backed mixed-origin links in the genetic analysis;
- treat minimum cluster size as a display/report preference, not as an input that removes nodes from analysis.

If the user changes the metric, nearest-neighbor mode, subset, timeline range, or underlying data, mark the analysis stale and offer **Rebuild sensitivity analysis**. Cache keys must include a data version and a deterministic cohort/policy signature.

## Technical Design

### 1. Add a pure sensitivity engine

Create `threshold-sensitivity.ts` beside `threshold-analysis.ts`. Reuse the sorted edge cache and component metrics, but add event and lineage information.

Recommended outputs:

```text
ThresholdSensitivityModel
  metric and scope signature
  distinct threshold events
  edge batches by threshold
  component transition events
  aggregate metric snapshots
  merge forest / component lineage

ThresholdComparison
  baseline and preview thresholds
  added and removed edge IDs
  structural and non-structural edge IDs
  merge/split transitions
  changed node IDs
  baseline-to-preview component overlaps

ThresholdStabilityReport
  exact partition intervals
  per-baseline-cluster persistence
  stable-node share
  optional partition-agreement series
```

Process all edges with the same distance as one batch. First identify pre-batch components, then build a component-level graph for that batch. This avoids order-dependent artificial pairwise merges and yields deterministic multiway transitions.

Do not store a full `node x threshold` assignment matrix. Build a merge forest or equivalent lineage structure in `O(nodes + edges)` storage, and derive the requested cut/comparison on demand. Use binary search over sorted edge values for edge diffs.

### 2. Add a local analysis controller

Create a threshold-sensitivity controller/service with local state for:

- baseline threshold;
- preview threshold;
- selected range;
- scope signature;
- current comparison and report;
- loading, stale, guardrail, and error states.

The preview threshold should not write directly to `session.style.widgets['link-threshold']`. Only the Apply action should call a single shared threshold-application API.

### 3. Extract the panel

Add a small `ThresholdSensitivityPanelComponent` under the 2D component folder. It owns controls and report presentation but not Graphology, Sigma, or Cytoscape mutations. This avoids adding more state and template volume to `TwoDComponent` or the global settings component.

The existing hidden threshold panel and sparkline can provide wording, formatting, and metric logic, but count-only "stable ranges" should not be reused as membership stability.

### 4. Add a renderer-neutral sensitivity overlay contract

Do not implement preview by calling `TwoDComponent._partialUpdate()` or `renderSigma()`. The current Sigma render method rebuilds a Graphology graph, recalculates its display projection, and may call `layoutSigmaClusters()` even when the camera is preserved. Preview must instead send a compact, renderer-neutral overlay model to the active adapter.

Recommended contract:

```text
NetworkThresholdSensitivityOverlay
  baseline and preview thresholds
  added and removed edge endpoint pairs
  structural edge IDs
  unchanged, changed, merge, and split node/component IDs
  focus selection and display guardrail metadata

setThresholdSensitivityOverlay(overlay | null)
```

The overlay model should contain presentation-ready IDs and endpoint pairs, not analysis logic. `TwoDComponent` translates the pure engine result once; each renderer decides how to draw it. Clearing the overlay must be idempotent and restore normal rendering without a graph rebuild.

For Sigma:

- retain the existing resident Graphology graph, display graph, custom bounding box, and camera;
- on entry only, materialize a fixed baseline graph containing every frozen-cohort node and the baseline-active context edges, using saved/model coordinates and an explicit no-layout policy; this guarantees endpoints exist for singleton and newly connected-node overlays;
- let the existing edge reducer mute or suppress baseline edges classified as removed while the dedicated layer redraws them as ghosts; otherwise a dashed removal mark would sit on top of an apparently active solid edge;
- add a dedicated Canvas layer beside the existing edge and feature overlay layers;
- resolve endpoints from resident node coordinates and transform them through `graphToViewport()` on draw;
- draw added and removed ghost edges from endpoint pairs even when those edges are absent from the baseline resident graph;
- redraw on camera movement, resize, node drag, display-graph rebuild, and WebGL recovery;
- render changed edges independently of ordinary display-graph LOD so semantically important changes cannot disappear; cap or aggregate only with an explicit guardrail message;
- use node halos, component hulls, and badges without overwriting normal node reducers, fill colors, shapes, labels, or selection;
- never write preview positions back to Graphology, `nodePositions`, or session data.

For the Cytoscape Canvas fallback:

- implement the same contract with temporary classes/elements inside `cy.batch()`;
- add ghost edges only to the temporary overlay state;
- do not run `precomputePositionsWithD3()`, any Cytoscape layout, or `fit()`;
- remove all temporary elements and classes when the overlay is cleared.

On entry, capture the existing renderer-neutral `NetworkRendererViewState`, node coordinates, selection, pin/lock state, and ordinary visibility state as invariants. Then perform at most one no-layout materialization of the frozen all-cohort baseline graph. These snapshots are assertions and recovery data, not values to reapply on every slider event. On Apply or Cancel, clear the overlay first and restore the ordinary visibility projection without changing the saved coordinates or camera.

Use request-animation-frame coalescing and generation tokens so fast scrubbing applies only the newest result. Expensive range analysis should be worker-ready; overlay drawing itself should remain synchronous and bounded.

### 5. Centralize committed threshold updates

Threshold changes are currently written through several component, store, DOM, and service paths. Introduce one shared `applyLinkThreshold()` API that owns raw/display conversion, patristic edge availability, visibility and cluster recomputation, statistics, and store notification.

The API should accept a source and 2D render policy so a committed threshold can update the application while the sensitivity mode retains its layout and viewport. For Sigma, the committed update may rebuild the resident graph, but it must reuse the current node coordinates and restore the existing `NetworkRendererViewState`; it must explicitly suppress `layoutSigmaClusters()`. The compatibility renderer must use the equivalent no-layout/no-fit policy.

### 6. Keep analysis state separate from renderer state

The sensitivity engine needs the full analytical edge universe for the frozen cohort. It must not use Sigma's display graph, because that graph is a camera- and LOD-dependent projection. Conversely, the adapter must not own component lineage or range calculations.

The separation should be:

```text
threshold-sensitivity engine -> comparisons and stability report
controller                    -> baseline, preview, range, cancellation
TwoD integration              -> IDs/endpoints and renderer-neutral overlay model
renderer adapter              -> draw/clear overlay only
```

This also prevents a normal edge-LOD change, camera movement, or WebGL recovery from changing the scientific result.

### 7. Handle Newick data honestly

For large Newick trees, the existing MST analysis edges preserve threshold-connected components and are suitable for stability, split, and merge calculations. They do not enumerate every threshold-qualified pairwise edge.

Therefore:

- label the range as component-complete but edge-partial when only MST analysis edges are available;
- show structural MST bridge changes rather than claiming a complete changed-edge count;
- do not materialize all patristic pairs on every slider movement;
- request full threshold-qualified edges only on Apply, using the existing browser guardrails;
- show the renderable limit in the range chart and prevent a preview from implying that an over-limit graph can be committed unchanged.

For imported edge lists, edge-change counts and overlays can be exact across the available range.

## Delivery Phases

### Phase 1: Correct engine and frozen preview

- Exact event batches and component lineage.
- Baseline versus preview comparison.
- Renderer-neutral overlay contract with Sigma and Cytoscape Canvas implementations.
- Position, camera, selection, and pin/lock preservation.
- Added/removed edge overlay that remains visible independently of Sigma edge LOD.
- Merge/split list.
- Local preview with Apply/Cancel.
- Core current-threshold and range stability metrics.

### Phase 2: Analyst report

- Per-cluster persistence table.
- Shared-axis range chart.
- Transition focus/highlighting.
- CSV export of range metrics, cluster persistence, and transition events.
- Accessibility pass for keyboard slider use, color-independent patterns, and announcements.

### Phase 3: Scale and advanced comparison

- Worker-backed sensitivity engine for very large edge lists.
- Optional side-by-side baseline/preview panes using the same fixed coordinates.
- Saved named baselines and multi-baseline report comparison.
- Optional standalone report view if real workflows require it.

## Tests

### Unit tests

- A singleton joins a cluster while cluster count stays unchanged; membership stability must still change.
- Two or more components merge through equal-distance edges as one deterministic event.
- An edge is added inside an existing component; edge counts change but partition stability does not.
- Increasing and decreasing comparisons produce symmetric merge/split results.
- Genetic-only, contact-only, and mixed-origin link policies are correct.
- Nearest-neighbor, subset, and timeline cohort signatures invalidate the cache correctly.
- Empty graphs, all singletons, duplicate edges, self-links, missing values, and thresholds outside the observed range.
- MST-backed Newick analysis reports component completeness and edge partiality correctly.

### Component and end-to-end tests

- Extend the shared 2D renderer harness and contract matrix so the same sensitivity behavior runs against Sigma and `cytoscape-canvas`.
- Enter sensitivity mode, record node positions and renderer-neutral view state, scrub across several events, and assert exact equality throughout.
- Spy on or instrument the Sigma adapter to prove preview does not call `render()`, rebuild the Graphology graphs, run `layoutSigmaClusters()`, or change the custom bounding box.
- Enter from a minimum-cluster-size-filtered network and verify the one-time frozen baseline materializes singleton cohort nodes at saved/model coordinates without running a layout.
- Verify added, removed, structural, and non-structural edges receive the correct visual treatment in both renderers.
- Force Sigma summary/detail LOD and verify changed edges remain visible even when absent from the ordinary display graph.
- Pan, zoom, resize, and drag a node while sensitivity mode is active; verify overlays track the camera and current node coordinates without writing preview layout state.
- Simulate Sigma WebGL recovery and verify the overlay and camera are restored.
- A known fixture shows both a merge above baseline and split below baseline.
- The report flags a membership change that the existing cluster-count-only logic would miss.
- Apply updates the shared threshold and statistics without moving nodes.
- Cancel restores the baseline threshold, visibility state, selection, and viewport.
- Metric display remains synchronized for SNP and TN93 percentage/decimal formats.
- Newick guardrail and component-only messaging are visible and accurate.

Follow the repository UI workflow: inspect the interaction with browser automation first, then run a targeted Cypress spec such as a new `cypress/e2e/view-state/twod-threshold-sensitivity.cy.ts`, followed by the existing 2D threshold-sync and view-state suites.

## Acceptance Criteria

- An analyst can enter sensitivity mode from the 2D Network view and choose a threshold range.
- Moving the preview threshold never changes node coordinates, pan, or zoom.
- Preview never rebuilds the resident Graphology graph or invokes the normal Sigma/Cytoscape threshold refresh path.
- The network distinguishes unchanged, added, and removed genetic edges relative to a fixed baseline.
- Changed edges remain visible under Sigma edge LOD, with explicit guardrail messaging if their overlay must be capped or aggregated.
- The UI identifies cluster growth, merges, and splits, including same-count membership changes.
- Stability is based on exact component membership, not cluster count alone.
- The panel reports current changes and cluster stability across the selected range.
- Preview is reversible and does not update other views until Apply is chosen.
- Applying a threshold uses the shared filtering semantics and keeps the 2D layout fixed.
- Contact-only and mixed-origin link behavior is clearly explained and tested.
- Large Newick analyses clearly distinguish component-complete results from partial edge enumeration.
- Existing threshold synchronization, 2D interaction, and session behavior continue to pass regression tests.
- The same renderer-neutral sensitivity contract passes for Sigma and the Cytoscape Canvas compatibility fallback.

## Non-Goals For The First Release

- Automatically selecting a scientifically "best" threshold.
- Recomputing a force layout for every threshold.
- Comparing different node cohorts, metrics, or timeline ranges in one sensitivity run.
- Materializing all pairwise Newick edges during interactive scrubbing.
- Creating a second full network renderer solely for threshold sensitivity.
