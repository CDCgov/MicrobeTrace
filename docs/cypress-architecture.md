# Cypress Architecture

Current on `cypressTesting` as of 2026-04-04.

This is the maintained Cypress structure for MicrobeTrace. It exists to keep uploaded-data end-to-end coverage, pure view-mechanics coverage, contract-mode intended-behavior checks, and retired legacy specs clearly separated.

## Terminology

- Ingestion flow:
  - A spec that stops at file loading, datatype assignment, and prelaunch file-settings behavior.
  - It represents the Files view and launch preparation, not the full rendered 2D feature matrix.
- Journey flow:
  - A spec that loads real data through the app and exercises a user-visible end-to-end behavior.
  - It represents a realistic uploaded-data workflow, usually ending in assertions against the rendered 2D network.
- View-state flow:
  - A spec that checks interaction mechanics of a specific rendered view without needing lots of fixture combinations.
  - It is typically run with the default/sample dataset or intentionally seeded state because the targeted behavior is expected to be dataset-independent.
  - It represents UI mechanics such as dragging, relayout, highlighting, labels, and tooltips, not the broader “did the right network get built from these files?” question.
- Smoke spec:
  - A maintained spec whose main job is to stay green on the currently shipped product and catch regressions in the main user path.
  - Smoke specs may use `observed` expectations when the current product behavior is known to differ from the intended behavior and the suite still needs a stable regression signal.
- Contract spec:
  - A spec that encodes the intended behavior, even if the smoke suite has to tolerate a known deviation somewhere else.
  - In this repo, contract specs usually live in `*.contract.cy.ts` files and run only when `contractMode` is enabled.
  - A contract is effectively the answer to “what behavior are we promising should be true?”
- `contractMode`:
  - A Cypress env flag that turns on the intended-behavior contract specs.
  - When it is off, those specs still show up in the folder layout but intentionally self-skip.
- `observed` expectation:
  - The behavior the current app actually shows today.
  - Use this only when the product still has a known deviation and the maintained smoke suite must reflect reality to stay useful.
- `intended` expectation:
  - The behavior the product is supposed to have.
  - This is the default expectation for contract specs.
- Oracle-backed assertion:
  - An assertion that compares the UI result against an independent Node-side expected result instead of against values computed by the app itself.
  - In this repo, the filtering oracle is the independent expected-result engine for visible node and link membership.
- Dataset profile:
  - The typed fixture definition under `cypress/e2e/journeys/datasets/` that describes which files to load, what prelaunch settings to use, and what expectations are tied to that scenario.

## Maintained Layers

### 1. Ingestion Flows

- Path: `cypress/e2e/ingestion/`
- Purpose: file-upload and file-settings behavior that should stay independent from the full 2D behavior matrix
- Data source: real fixtures loaded through the Files view

Use this layer for:

- file attach and remove behavior
- datatype detection and remapping
- file settings dialog behavior

### 2. Journey Flows

- Path: `cypress/e2e/journeys/flows/`
- Purpose: uploaded-data end-to-end coverage
- Data source: real fixtures loaded through the Files view
- Subtypes:
  - maintained smoke and behavior specs in `*.cy.ts`
  - intended-behavior contract specs in `*.contract.cy.ts`
- Assertion style:
  - visible DOM stats
  - rendered Cytoscape state
  - `observed` vs `intended` expectations where current product behavior is known to differ
  - oracle-backed exact link and node membership when the behavior is supposed to be independent from the UI implementation

Use this layer for:

- file-type load coverage
- filtering behavior
- styling behavior
- grouping behavior
- cross-feature combinations
- dashboard cross-view propagation and isolation once the views are already open
- uploaded-data-specific behavior where file origin, merge semantics, or prelaunch configuration can change outcomes

Avoid redundant duplication:

- Do not add a journey that only repeats already-maintained view-state mechanics with the same expected outcome.
- Add journey counterparts when the uploaded-data path can produce a different outcome or adds distinct value.

Important detail:

- `*.contract.cy.ts` stays under `journeys/flows/` so it can share the same dataset profiles and helpers as the smoke suite.
- These specs self-skip unless `Cypress.env('contractMode')` is truthy, so seeing them as pending during the broad journey run is expected.

### 3. View-State Flows

- Path: `cypress/e2e/view-state/`
- Purpose: fast checks for interaction mechanics across all views that do not need uploaded-data permutations
- Data source: default/sample dataset or intentionally seeded state
- Assertion style:
  - rendered view state (Cytoscape, Leaflet, SVG, or DOM depending on view)
  - visible control behavior
  - backing model checks only when the view behavior depends on them

Use this layer for:

- view open/close and per-view settings mechanics that should be stable regardless of upload path
- layout, drag, tooltip, and toggle behavior for the specific view under test
- Golden Layout dashboard mechanics such as splitter drag, close/reopen, and hide/show/resize lifecycle when sample or seeded session state is enough
- per-view rendering mechanics that do not require uploaded-data permutations

### 4. Legacy-Disabled Specs

- Path: `cypress/e2e/legacy-disabled/`
- Purpose: preserve stale or fixture-broken specs without letting them silently contaminate the maintained suite
- Run behavior: excluded by `cypress.config.ts` through `excludeSpecPattern`

Move a spec here when:

- it depends on fixtures that no longer exist
- it relies on obsolete UI structure
- it duplicates maintained coverage and is no longer authoritative

Do not leave broken legacy specs under active `*.cy.ts` paths.

## Support Layer

- `cypress/e2e/journeys/datasets/`
  - profile registry and typed expectations for uploaded-data journeys
  - remains the single source of truth for fixture names, prelaunch settings, and observed vs intended expectations
- `cypress/support/journey-helpers.ts`
  - shared helpers for launching profiles, opening settings panes, asserting DOM stats, and comparing the rendered 2D graph against oracle snapshots
- `cypress/support/commands.ts`
  - shared Cypress commands for file loading, global settings access, and generic interaction helpers
- `cypress/support/sankey-helpers.ts`, `cypress/support/sankey-ui-helpers.ts`
  - shared helpers for Sankey field selection, expected render counts, and stable Sankey UI interactions
- `cypress/support/table-helpers.ts`
  - shared helpers for Table dataset switching, filter targeting, settings, and export dialogs
- `cypress/support/dashboard-helpers.ts`
  - shared helpers for opening dashboard views, loading saved dashboard fixtures, focusing tabs, dragging Golden Layout splitters, and asserting cross-view pane readiness
- `cypress/support/selectors.ts`
  - shared `data-testid` selectors for stable Cypress targeting
- `cypress/oracle/`
  - Node-side filtering oracle and Cypress task registration
  - `filtering-oracle.ts`: independent graph oracle
  - `task.ts`: registers `oracle:compute` in `cypress.config.ts`
  - `types.ts`: shared manifest, step, snapshot, and debug types
- `cypress/fixtures/OracleSynthetic_*.csv`
  - small synthetic fixtures used only for oracle contract coverage
- `cypress/fixtures/dashboard-*.microbetrace`
  - saved dashboard sessions used by dashboard `view-state` coverage so Golden Layout mechanics stay deterministic
- `docs/app-wide-cypress-bug-log.csv`
  - app-wide bug log for new Cypress-discovered product bugs; keep older surface bug logs as historical references
- `docs/2d-network-cypress-checklist.md`, `docs/2d-network-cypress-qa-tracker.csv`, `docs/2d-network-cypress-bug-log.csv`
  - maintained coverage checklist and QA tracker for the 2D Network surface; the surface bug log is historical
- `docs/map-view-cypress-checklist.md`, `docs/map-view-cypress-qa-tracker.csv`, `docs/map-view-cypress-bug-log.csv`
  - maintained coverage checklist and QA tracker for the Map surface; the surface bug log is historical
- `docs/epi-curve-cypress-checklist.md`, `docs/epi-curve-cypress-qa-tracker.csv`, `docs/epi-curve-cypress-bug-log.csv`
  - maintained coverage checklist and QA tracker for the Epi Curve surface; the surface bug log is historical
- `docs/gantt-chart-cypress-checklist.md`, `docs/gantt-chart-cypress-qa-tracker.csv`, `docs/gantt-chart-cypress-bug-log.csv`
  - maintained coverage checklist and QA tracker for the Gantt surface; the surface bug log is historical
- `docs/sankey-view-cypress-checklist.md`, `docs/sankey-view-cypress-qa-tracker.csv`, `docs/sankey-view-cypress-bug-log.csv`
  - maintained coverage checklist and QA tracker for the Sankey surface; the surface bug log is historical
- `docs/crosstab-view-cypress-checklist.md`, `docs/crosstab-view-cypress-qa-tracker.csv`, `docs/crosstab-view-cypress-bug-log.csv`
  - maintained coverage checklist and QA tracker for the Crosstab surface; the surface bug log is historical
- `docs/aggregate-view-cypress-checklist.md`, `docs/aggregate-view-cypress-qa-tracker.csv`, `docs/aggregate-view-cypress-bug-log.csv`
  - maintained coverage checklist and QA tracker for the Aggregate surface; the surface bug log is historical
- `docs/alignment-view-cypress-checklist.md`, `docs/alignment-view-cypress-qa-tracker.csv`, `docs/alignment-view-cypress-bug-log.csv`
  - maintained coverage checklist and QA tracker for the Alignment surface; the surface bug log is historical
- `docs/bubble-view-cypress-checklist.md`, `docs/bubble-view-cypress-qa-tracker.csv`, `docs/bubble-view-cypress-bug-log.csv`
  - maintained coverage checklist and QA tracker for the Bubble surface; the surface bug log is historical
- `docs/table-view-cypress-checklist.md`, `docs/table-view-cypress-qa-tracker.csv`, `docs/table-view-cypress-bug-log.csv`
  - maintained coverage checklist and QA tracker for the Table surface; the surface bug log is historical
- `docs/waterfall-view-cypress-checklist.md`, `docs/waterfall-view-cypress-qa-tracker.csv`, `docs/waterfall-view-cypress-bug-log.csv`
  - maintained coverage checklist and QA tracker for the Waterfall surface; the surface bug log is historical
- `docs/phylogenetic-view-cypress-checklist.md`, `docs/phylogenetic-view-cypress-qa-tracker.csv`, `docs/phylogenetic-view-cypress-bug-log.csv`
  - maintained coverage checklist and QA tracker for the Phylogenetic Tree surface; the surface bug log is historical
- `docs/dashboard-cypress-checklist.md`, `docs/dashboard-cypress-qa-tracker.csv`, `docs/dashboard-cypress-bug-log.csv`
  - maintained coverage checklist and QA tracker for the Golden Layout dashboard surface; the surface bug log is historical

## Dashboard Surface

Dashboard coverage is a cross-view surface rather than a single visualization.

- Use `cypress/e2e/view-state/dashboard-*.cy.ts` for saved-session Golden Layout mechanics:
  - splitter drag
  - pane resize / hide / show
  - tab close and reopen
  - multi-pane readiness after saved layout load
- Use `cypress/e2e/journeys/flows/dashboard-*.cy.ts` for uploaded-data propagation and isolation:
  - global styling propagation
  - global filtering propagation
  - timeline isolation between target and non-target views

The first dashboard tranche covers `2D Network`, `Map`, `Bubble`, `Table`, `Aggregate`, `Crosstab`, and `Waterfall`.

## Local Run Stability

- `npm run start:local-cypress` intentionally starts Angular with `--watch=false --live-reload=false`.
- Reason:
  - Cypress writes screenshots and other artifacts into the workspace during long local runs.
  - A watching dev server can treat those writes as project changes and rebuild or reload the app mid-run.
  - Those rebuilds create false negatives such as `cy.visit()` socket timeouts or unexpected page reloads unrelated to the feature under test.
- Use the non-watching local Cypress server as the default verification path unless you are explicitly debugging dev-server reload behavior.

## Filtering Oracle

The filtering oracle is the independent source of truth for 2D visible node and link membership in filtering-heavy Cypress flows.

Purpose:

- compute expected 2D visibility without driving the app UI
- validate threshold, nearest-neighbor, epsilon, mixed-origin preservation, and post-launch metric-switch behavior against a non-UI code path
- let Cypress compare exact visible link IDs and counts instead of only checking coarse totals

Independence boundary:

- The oracle must not import `CommonService` or reuse the current UI-triggered graph mutation path.
- It may reuse low-level domain utilities that are not UI logic, such as `tn93`, plus the current SNP distance rule.

Current manifest model:

```ts
type OracleManifest = {
  files: FileLoadSpec[];
  preLaunch: PreLaunchSettings;
  steps: OracleStep[];
};
```

Current supported input file types:

- link CSV
- node CSV
- matrix XLSX
- FASTA

Current supported step kinds:

- `set-threshold`
- `set-nearest-neighbor`
- `set-epsilon`
- `set-distance-metric`
- `set-timeline-field`
- `set-timeline-date`
- `reveal-everything`

Current output model:

- exact visible link IDs
- exact visible node IDs
- visible link count
- visible node count
- disjoint-component count
- singleton count
- per-link debug state:
  - origins
  - distance origins
  - non-distance origins
  - active distance
  - threshold pruning
  - nearest-neighbor pruning
  - non-distance preservation

Current oracle semantics:

- Link IDs are canonical undirected IDs like `A-B`.
- Multi-origin links are merged by endpoint pair.
- Distance-backed origins and non-distance origins are tracked separately.
- If a genetic-distance edge is pruned by threshold or nearest neighbor but a non-distance origin still exists, the link stays visible and is marked as preserved by non-distance origin.
- Nearest neighbor uses the same MST-path epsilon interpretation as the current UI behavior, not the older simpler nearest-neighbor helper.
- Metric switches rebuild sequence-derived genetic links and reset the threshold to the default for the new metric:
  - `tn93 = 0.015`
  - `snps = 16`

Current oracle scope:

- Covered:
  - threshold changes
  - nearest neighbor
  - epsilon progression
  - mixed-origin preservation
  - post-launch metric switching
  - timeline/date filtering
  - reveal behavior on the mixed-origin filtering path
- Intentionally out of scope in v1:
  - styling
  - layout
  - grouping polygons
  - minimum cluster size

Important detail:

- In the current mixed-origin contract, `Reveal Everything` does not reset threshold or nearest-neighbor filtering, so the oracle models `reveal-everything` as preserving the active filtering state on that path.
- The Cytoscape renderer may emit duplicate rendered edge IDs like `A-B-2`; `assertVisibleLinkIds()` normalizes those back to the canonical logical ID when comparing against oracle snapshots.

## Oracle-backed Helpers and Specs

Shared helper pattern:

- `buildOracleManifest(profile, steps)`
- `computeOracleForProfile(profile, steps, alias?)`
- `getOracleSnapshot(alias?, snapshotId?)`
- `assertNetworkMatchesOracleSnapshot(snapshot, options?)`

Usage rule:

- Compute the oracle once per scenario.
- Reuse snapshot IDs across UI steps in the same test instead of recomputing after every click.

Current oracle-backed filtering and timeline coverage:

- `cypress/e2e/journeys/flows/change-link-threshold.cy.ts`
- `cypress/e2e/journeys/flows/nearest-neighbor.cy.ts`
- `cypress/e2e/journeys/flows/nearest-neighbor-epsilon.cy.ts`
- `cypress/e2e/journeys/flows/mixed-origin-threshold-nn-reveal.cy.ts`
- `cypress/e2e/journeys/flows/post-launch-distance-metric-switch.cy.ts`
- `cypress/e2e/journeys/flows/timeline-oracle.cy.ts`
- `cypress/e2e/journeys/flows/bubble-timeline-oracle-uploaded.cy.ts`
- `cypress/e2e/journeys/flows/map-timeline-oracle.cy.ts`
- `cypress/e2e/journeys/flows/behavior-contracts.cy.ts`
- `cypress/e2e/journeys/flows/filtering-newick.contract.cy.ts`
- `cypress/e2e/journeys/flows/nearest-neighbor-angulartesting.contract.cy.ts`
- `cypress/e2e/journeys/flows/filtering-oracle.contract.cy.ts`

Exact timeline playback mechanics such as play/pause behavior, slider-click behavior, and style persistence after timeline teardown remain covered in view-specific uploaded-data control specs layered on top of the oracle-backed exact-checkpoint baseline.

Timeline-driven dataset mutation is intentionally limited to `2D Network`, `Bubble`, and `Map`.

Non-target data views such as `Aggregate`, `Crosstab`, and `Waterfall` should stay on the non-timeline filtered dataset even while timeline changes dashboard counts and the timeline-visible graph. Maintained coverage for that contract lives in:

- `cypress/e2e/journeys/flows/timeline-non-target-view-isolation-uploaded.cy.ts`
- `cypress/e2e/journeys/flows/waterfall-refresh-uploaded.cy.ts`

The dedicated oracle contract spec covers:

- stable undirected ID generation
- MST-path epsilon inclusion
- mixed-origin preservation through threshold and nearest-neighbor pruning
- metric-switch default thresholds
- fixture-backed AngularTesting edge-list, matrix, FASTA, and mixed-origin scenarios

## Selector Rules

- Prefer `data-testid` selectors for:
  - dialog open buttons
  - top-level navigation actions
  - high-risk filtering controls
  - 2D toolbar controls
- Keep raw text selectors only for dynamic option labels where the app does not yet expose a stable hook.

## Reliability Rules

- No new `cy.wait(<number>)` in maintained specs.
- Prefer retryable assertions over one-shot reads when UI state is expected to change.
- Use rendered DOM and Cytoscape state as the primary source of truth for user-visible 2D behavior.
- Use `commonService` as a cross-check, not the primary source of truth, for user-visible 2D behavior.
- Prelaunch session mutation is allowed only as a narrow fallback inside shared helpers when the UI does not fully persist launch settings yet.
- For filtering behavior that changes visible node or link membership, prefer oracle-backed assertions over hand-maintained expected counts.
- Avoid redundant duplicate coverage across `view-state` and `journeys/flows` when expected outcomes are the same. Duplicate only when the uploaded-data path is expected to produce a different or higher-risk outcome.
- In smoke specs, keep `observed` expectations only where a known product deviation still exists and the smoke suite must remain green.
- In contract specs, prefer `intended` behavior and exact membership assertions.
- When a maintained journey exposes a product bug, record it in `docs/app-wide-cypress-bug-log.csv`. Include the affected view or views in `view_scope`, the observed behavior, intended behavior if known, the spec that caught it, the regression specs that must stay green after a fix, and explicit `cause_summary` / `fix_summary` fields once the bug is understood.
- New app-wide bug-log rows pushed to GitHub automatically open GitHub issues through `.github/workflows/bug-tracker-issues.yml`. When a row moves to `Closed`, `Fixed`, or `Resolved`, the workflow comments on the matching issue with the recorded root cause and fix summary, then closes it. Set the repository variable `BUG_TRACKER_ASSIGNEE` to force assignment to a specific GitHub login; otherwise the workflow assigns the issue to the push actor. Use `MTBG###` IDs for new app-wide rows. Older surface-specific bug-log IDs remain in place only for historical references.

## Maintained Commands

Use direct Cypress commands for the maintained buckets:

- Preferred wrapper scripts:
  - `npm run e2e:journeys:flows`
  - `npm run e2e:journeys:view-state`
  - `npm run e2e:journeys:contracts`
  - `npm run e2e:journeys:all`
  - Local host equivalents:
    - `npm run start:local-cypress`
    - `npm run e2e`
    - `npm run e2e:journeys:flows:local`
    - `npm run e2e:journeys:flows:local:chrome`
    - `npm run e2e:journeys:view-state:local`
    - `npm run e2e:journeys:view-state:local:chrome`
    - `npm run e2e:journeys:contracts:local`
    - `npm run e2e:journeys:contracts:local:chrome`
    - `npm run e2e:journeys:all:local:chrome`
    - `npm run e2e:journeys:all:local`
    - single-spec debug: `npm run e2e:journeys:spec:local -- --spec cypress/e2e/ingestion/files-ui.cy.ts`
  - If your environment already runs a local app, pass your own base URL:
    - `npm run e2e:journeys:flows:local -- --config baseUrl=http://127.0.0.1:4211`

Raw command equivalents:

- Maintained ingestion:
  - `npx cypress run --headless --browser electron --spec cypress/e2e/ingestion/files-ui.cy.ts`
- Maintained journeys:
  - `npx cypress run --headless --browser electron --spec cypress/e2e/ingestion/files-ui.cy.ts,cypress/e2e/journeys/flows/*.cy.ts`
- Maintained 2D + Crosstab view-state:
  - `npx cypress run --headless --browser electron --spec "cypress/e2e/view-state/twod-view.cy.ts,cypress/e2e/view-state/crosstab-view.cy.ts,cypress/e2e/view-state/crosstab-export.cy.ts,cypress/e2e/view-state/aggregate-view.cy.ts"`
- Contracts:
  - `npx cypress run --headless --browser electron --env contractMode=1 --spec "cypress/e2e/journeys/flows/behavior-contracts.cy.ts,cypress/e2e/journeys/flows/filtering-newick.contract.cy.ts,cypress/e2e/journeys/flows/filtering-oracle.contract.cy.ts,cypress/e2e/journeys/flows/nearest-neighbor-angulartesting.contract.cy.ts,cypress/e2e/journeys/flows/post-launch-distance-metric-switch.cy.ts"`

Local default equivalents:

- `npx cypress run --headless --browser electron --config baseUrl=http://127.0.0.1:4210 --spec cypress/e2e/ingestion/files-ui.cy.ts,cypress/e2e/journeys/flows/*.cy.ts`
- `npx cypress run --headless --browser electron --config baseUrl=http://127.0.0.1:4210 --spec "cypress/e2e/view-state/twod-view.cy.ts,cypress/e2e/view-state/crosstab-view.cy.ts,cypress/e2e/view-state/crosstab-export.cy.ts,cypress/e2e/view-state/aggregate-view.cy.ts"`
- `npx cypress run --headless --browser electron --config baseUrl=http://127.0.0.1:4210 --env contractMode=1 --spec "cypress/e2e/journeys/flows/behavior-contracts.cy.ts,cypress/e2e/journeys/flows/filtering-newick.contract.cy.ts,cypress/e2e/journeys/flows/filtering-oracle.contract.cy.ts,cypress/e2e/journeys/flows/nearest-neighbor-angulartesting.contract.cy.ts,cypress/e2e/journeys/flows/post-launch-distance-metric-switch.cy.ts"`

## Migration Rules

When adding new coverage:

1. Put uploaded-data behavior in `journeys/flows`.
2. Put pure view mechanics that are dataset-independent in `view-state` (default/sample dataset or intentionally seeded state).
3. Do not duplicate existing maintained `view-state` coverage in `journeys/flows` unless the uploaded-data path is expected to produce a different outcome.
4. For filtering behavior that changes visible node or link membership, add an oracle manifest and assert exact IDs plus counts unless the behavior is explicitly outside the oracle scope.
5. Keep `cypress/e2e/journeys/datasets/` as the only fixture registry; do not create a separate oracle fixture registry.
6. Add or update `data-testid` hooks before leaning on brittle text selectors.
7. Update the docs for the surface you changed:
   - Any product bug surfaced or fixed by the change:
     - `docs/app-wide-cypress-bug-log.csv`
   - 2D Network:
     - `docs/2d-network-cypress-checklist.md`
     - `docs/2d-network-cypress-qa-tracker.csv`
   - Map:
     - `docs/map-view-cypress-checklist.md`
     - `docs/map-view-cypress-qa-tracker.csv`
   - Epi Curve:
     - `docs/epi-curve-cypress-checklist.md`
     - `docs/epi-curve-cypress-qa-tracker.csv`
   - Gantt:
     - `docs/gantt-chart-cypress-checklist.md`
     - `docs/gantt-chart-cypress-qa-tracker.csv`
   - Sankey:
     - `docs/sankey-view-cypress-checklist.md`
     - `docs/sankey-view-cypress-qa-tracker.csv`
   - Crosstab:
     - `docs/crosstab-view-cypress-checklist.md`
     - `docs/crosstab-view-cypress-qa-tracker.csv`
   - Aggregate:
     - `docs/aggregate-view-cypress-checklist.md`
     - `docs/aggregate-view-cypress-qa-tracker.csv`
   - Alignment:
     - `docs/alignment-view-cypress-checklist.md`
     - `docs/alignment-view-cypress-qa-tracker.csv`
   - Bubble:
     - `docs/bubble-view-cypress-checklist.md`
     - `docs/bubble-view-cypress-qa-tracker.csv`
   - Table:
     - `docs/table-view-cypress-checklist.md`
     - `docs/table-view-cypress-qa-tracker.csv`
   - Waterfall:
     - `docs/waterfall-view-cypress-checklist.md`
     - `docs/waterfall-view-cypress-qa-tracker.csv`
   - Phylogenetic Tree:
     - `docs/phylogenetic-view-cypress-checklist.md`
     - `docs/phylogenetic-view-cypress-qa-tracker.csv`
8. If the new behavior belongs in the oracle, keep the oracle implementation UI-independent. Do not import `CommonService`, dialog state, or current rendering helpers into `cypress/oracle/`.
9. If a legacy spec is being replaced, move it to `legacy-disabled` or delete it if git history is enough and no quarantine value remains.
