# Sigma Renderer Migration Record

## Outcome

Sigma is the production renderer for the 2D Network view. The migration is integrated with the Angular 22 application and preserves Cytoscape Canvas as a lazy compatibility fallback. The normal Sigma path does not instantiate Cytoscape or retain a second copy of the graph.

The implementation branch is `codex/sigma-migration`, based on `origin/dev` at `26fae4c0`. The older proof of concept was not merged wholesale; its renderer work was reapplied to current `dev` so the Angular 22 upgrade and subsequent application changes remain intact.

## Production architecture

- `TwoDComponent` owns renderer-neutral MicrobeTrace behavior and chooses the active renderer.
- `SigmaNetworkRendererAdapter` owns Graphology, Sigma, WebGL layers, camera interaction, selection, dragging, group hulls, edge level of detail, and resource teardown.
- Renderer-neutral modules provide scientific node features, grouping, geographic projection, composite export, and saved view-state normalization.
- Sigma is selected when no renderer query parameter is supplied.
- `?renderer=cytoscape-canvas` remains available for an explicit compatibility override.
- Cytoscape and `cytoscape-svg` are dynamic imports. The optimized production build emits them as separate lazy chunks (approximately 419 kB and 21 kB raw, or 113 kB and 7 kB estimated transfer respectively), so they are not loaded on a successful Sigma startup.

The renderer maintains the complete graph in Graphology while using deterministic edge level of detail for the Sigma-facing display graph. This preserves complete statistics and interaction data without drawing every edge at distant zoom levels.

## Compatibility and failure behavior

WebGL 2 capability is checked before Sigma starts. When WebGL 2 is unavailable, the view uses Cytoscape Canvas for datasets at or below 5,000 nodes and 20,000 links.

Above either Canvas safety limit, the application uses table-only network safety mode. The loaded dataset remains available without allocating a large Canvas renderer that could exhaust browser memory.

If a live Sigma WebGL context is lost, the adapter first recreates the WebGL renderer and restores the saved camera state. If recreation is unsuccessful, the view transitions to the Canvas compatibility path while preserving the loaded session.

## Feature coverage

The integrated Sigma renderer supports:

- complete resident node/link counts with edge level of detail;
- node labels and tooltips, size ranges, opacity, borders, built-in shapes, custom SVG-backed icons, selected color, and background color;
- directed and bidirectional edge arrows, labels and tooltips, label decimals and size, length, width ranges, per-category opacity, global opacity override, color, and two-origin solid/dashed styling;
- click, keyboard, shift-box, cross-view programmatic selection, context menus, neighbor highlighting, grid display, and node pinning synchronized with session data;
- individual-node and group dragging;
- grouping hulls for singleton, pair, and larger groups, group labels and orientations, shared or per-group colors, per-group transparency, editable/sortable group key tables, and grouped layouts;
- node collapsing and aggregate metadata used by renderer-neutral exports;
- mixed-value donut glyphs, QC status/severity/reason overlays, and uncertainty overlays;
- geographic longitude/latitude projection with an exported geographic overlay;
- camera position, zoom, edge-detail mode, styling, and selection round-tripped through saved sessions;
- PNG/JPEG/WebP/SVG composite export metadata and layered canvas capture;
- keyboard navigation, focus status, and accessible feature summaries.

## Lifecycle and memory behavior

Closing the 2D view destroys the active Sigma instance, releases its WebGL context, removes document and container listeners, clears Graphology and display graphs, cancels timers and animation frames, and severs adapter callbacks and DOM references. The Angular component also removes Golden Layout listeners and clears its position, grouping, accessibility, and aggregate caches.

Lifecycle coverage performs five close/reopen cycles and twelve Table-to-2D switches with style rerenders. Every reopen creates a fresh adapter, retired adapters have zero resident/display nodes and links, retired WebGL contexts are inactive, and the active renderer keeps a stable six-layer canvas count.

The large-graph memory probe runs three in-page close/reopen cycles with explicit Chromium garbage collection. The verified run grew by approximately 19.9 MiB from the initial active renderer to the final active renderer, within the enforced 64 MiB regression budget. The probe runs inside one application-frame callback so Cypress command snapshots are excluded from the lifecycle measurement.

## Scalability results

Local validation used headless Edge 153 against the Angular development server on September 22–23, 2026. Times are observed end-to-end harness measurements, not production service-level budgets.

| Dataset tier | Resident graph | Drawn links after LOD | Observed total |
| --- | ---: | ---: | ---: |
| Average | 1,600 nodes / 3,200 links | 1,703 | 10.6 s |
| Large | 5,000 nodes / 10,000 links | 5,285 | 13.6 s |
| Stress | 10,000 nodes / 25,000 links | 10,712 | 63.1 s |

All three tiers retained the complete expected graph, used Sigma as the active renderer, and showed no Cytoscape allocation. The stress run completed with 120 recorded long tasks and a 5.169-second maximum long task; the performance artifact records these responsiveness characteristics alongside heap, load, and render timing data.

## Dependency review

The migration adds the following direct runtime dependencies:

- `sigma` `4.0.0-beta.5`;
- `graphology` `0.26.0`;
- `graphology-types` `0.24.8`.

Sigma is pinned to an exact beta release, and Sigma-specific calls are isolated behind the adapter to contain future API changes. Cytoscape remains installed because it is the compatibility renderer, but its code and renderer state are lazy on the normal path. `less` is a development dependency used by the Angular 22 build for the repository's existing Less stylesheet.

## Verification record

- Angular 22 development and optimized production builds: passed.
- Focused renderer, view-state, grouping, geography, and node-feature unit tests: 25 passed.
- Integrated Sigma startup, fallback, recovery, settings, session, lifecycle, grouping, geography, selection, interaction, and export contracts: 15 passed.
- Average, large, and stress Sigma scalability contracts: 3 passed.
- Existing Cytoscape compatibility coverage for core 2D behavior, settings, context menus, selection, dragging, collapsing, threshold synchronization, and uploaded grouping: 48 passed.
- Default-browser exploratory check: Sigma rendered the sample graph with 33 nodes and 74 links and no Cytoscape resources loaded.

The resulting branch contains the production default, compatibility path, lifecycle hardening, performance instrumentation, and regression coverage as discrete migration commits.
