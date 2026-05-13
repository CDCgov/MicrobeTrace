# MicrobeTrace Testing Plan

This file is the current entry point for active testing docs in this repo.

The older generic plan was retired because it no longer matched the codebase or the Cypress-first workflow now used on `cypressTesting`.

## Active Testing Docs

- `docs/testing/test-runner-quick-reference.md`
  - Quick commands for targeted unit and Cypress runs, plus guidance on when to run a narrow slice versus the broader suites.
- `docs/testing/cypress-architecture.md`
  - Current maintained Cypress structure, selector rules, and migration rules.
- `docs/testing/README.md`
  - Testing-doc index for core Cypress docs and view-specific folders.
- `docs/testing/views/`
  - View-specific checklist, QA tracker, and bug-log folders.
- `docs/performance/performance-baseline-plan.md`
  - Plan for discovering performance baselines, dataset tiers, responsiveness probes, and future timing budgets.
- `docs/performance/genetic-distance-refactor-performance-comparison.md`
  - Before/after performance comparison for the genetic-distance and Newick/patristic refactor.
- `docs/performance/performance-dataset-strategy-for-bioinformaticians.md`
  - Bioinformatics-facing guidance on synthetic fixtures, real datasets, and representative performance shapes.
- `docs/performance/problem-10k-node-only-performance.md`
  - Case study for the `problem_10k.csv` node-only fixture, including the launch/OOM root cause, 2D grouping optimizations, and before/after measurements.

## Current Test Layers

- Unit and integration tests
  - Angular component and service tests run through the existing test setup.
  - Targeted unit runs are supported with Angular's `--include` flag.
- End-to-end tests
  - Cypress is the active E2E framework.
  - File-ingestion coverage lives under `cypress/e2e/ingestion/`.
  - Uploaded-data journeys live under `cypress/e2e/journeys/flows/`.
  - Pure 2D view-state checks live under `cypress/e2e/view-state/`.
  - Targeted Cypress runs are supported through the local pass-through script plus `--spec`.
  - `npm run start:local-cypress` is the stable local app server for Cypress work and disables Angular file watching and live reload so Cypress artifact writes do not trigger rebuilds mid-run.
- Legacy-disabled specs
  - Retired or fixture-broken Cypress specs live under `cypress/e2e/legacy-disabled/` and are excluded from the maintained suite.
- Contract tests
  - Known observed-vs-intended behavior differences should be tracked in Cypress contract coverage rather than normalized into smoke baselines.

## 2D Network Testing Scope

- Load to 2D from supported file types.
- General Settings filtering behavior.
- General Settings styling behavior.
- 2D settings for nodes, links, layout, and grouping.
- Cross-feature combinations such as filtering plus grouping and filtering plus style.
- Fixture gaps that block high-value automation.

## Map Testing Scope

- Uploaded launch and switch-to-Map smoke coverage.
- Geospatial field mapping by zipcode and explicit latitude/longitude.
- Map-specific filtering, styling, and timeline behavior on uploaded data.
- Leaflet control mechanics, layers, tooltips, selection, export, and persistence.
- Migration of high-value sample-data-only Map coverage into maintained uploaded-data journeys.

## Gantt Testing Scope

- Uploaded launch and switch-to-Gantt smoke coverage on node-bearing fixtures.
- Uploaded date-range and single-date entry creation on supported date-bearing fields.
- Rendered SVG row-count and bar-width assertions on uploaded data.
- Uploaded Gantt export coverage and known export-flow deviations.
- Migration of remaining Gantt settings and multi-entry behaviors into maintained uploaded-data journeys.

## Sankey Testing Scope

- Uploaded launch and switch-to-Sankey smoke coverage across supported input file types.
- Sankey-specific variable selection, minimum-variable gating, and SVG render-state checks.
- Sankey visual settings such as link coloring, label sizing, tooltip behavior, and export on uploaded data.
- Migration of any high-value sample-data-only Sankey mechanics into maintained uploaded-data journeys.

## Aggregate Testing Scope

- Uploaded launch and switch-to-Aggregate smoke coverage across supported input file types.
- Aggregate settings coverage for per-table field selection, add/delete table mechanics, and visible-data synchronization.
- Aggregate export behavior for JSON, XLSX, CSV zip, and PDF outputs.
- Normalization and display-label behavior for sparse uploaded categorical fields.

## Alignment Testing Scope

- Uploaded launch and switch-to-Alignment smoke coverage across supported sequence-bearing file types.
- Alignment-specific rendering checks for canvas rows, excluded nodes, and top SVG state.
- Alignment settings coverage for high-value layout controls on uploaded data.
- Alignment export behavior for image, FASTA, and CSV outputs.
- Migration of direct-launch and sequence-type gaps into maintained uploaded-data journeys.

## Bubble Testing Scope

- Uploaded launch and switch-to-Bubble smoke coverage across the main file-type matrix.
- Bubble-specific controls such as axis assignment, node sizing, collapse, and aggregate tooltip behavior.
- Bubble color-mapping, selection sync, and export behavior on uploaded data.
- Migration of high-value sample-data-only Bubble mechanics into maintained uploaded-data journeys.

## Table Testing Scope

- Uploaded launch and switch-to-Table smoke coverage across supported input file types.
- Table dataset switching for Nodes, Links, and Clusters.
- Table filtering, selection sync, and selected-row ordering on uploaded data.
- Table settings and export behavior for CSV and XLSX outputs.
- Migration of direct-launch and column-picker gaps into maintained uploaded-data journeys.

## Waterfall Testing Scope

- Uploaded launch and switch-to-Waterfall smoke coverage across representative file types.
- Waterfall cluster summary rendering from uploaded network state.
- Cluster -> node -> link drilldown behavior on uploaded data.
- Migration of high-value Waterfall table behavior into maintained uploaded-data journeys.

## Phylogenetic Tree Testing Scope

- Uploaded direct-launch smoke coverage from supported tree-capable file types.
- D3 + SVG tree rendering checks tied to uploaded leaf counts and stored Newick state.
- Uploaded tree export and high-value tree settings on maintained journeys.
- Migration of high-value sample-data-only tree mechanics into maintained uploaded-data journeys.

## Update Rules

- Keep `docs/testing/cypress-architecture.md` aligned with the actual folder structure and npm scripts.
- Update the checklist and QA tracker together for the surface you changed:
  - `docs/testing/views/2d-network/2d-network-cypress-checklist.md` and `docs/testing/views/2d-network/2d-network-cypress-qa-tracker.csv`
  - `docs/testing/views/map/map-view-cypress-checklist.md` and `docs/testing/views/map/map-view-cypress-qa-tracker.csv`
  - `docs/testing/views/epi-curve/epi-curve-cypress-checklist.md` and `docs/testing/views/epi-curve/epi-curve-cypress-qa-tracker.csv`
  - `docs/testing/views/gantt-chart/gantt-chart-cypress-checklist.md` and `docs/testing/views/gantt-chart/gantt-chart-cypress-qa-tracker.csv`
  - `docs/testing/views/aggregate/aggregate-view-cypress-checklist.md` and `docs/testing/views/aggregate/aggregate-view-cypress-qa-tracker.csv`
  - `docs/testing/views/sankey/sankey-view-cypress-checklist.md` and `docs/testing/views/sankey/sankey-view-cypress-qa-tracker.csv`
  - `docs/testing/views/crosstab/crosstab-view-cypress-checklist.md` and `docs/testing/views/crosstab/crosstab-view-cypress-qa-tracker.csv`
  - `docs/testing/views/alignment/alignment-view-cypress-checklist.md` and `docs/testing/views/alignment/alignment-view-cypress-qa-tracker.csv`
  - `docs/testing/views/bubble/bubble-view-cypress-checklist.md` and `docs/testing/views/bubble/bubble-view-cypress-qa-tracker.csv`
  - `docs/testing/views/dashboard/dashboard-cypress-checklist.md` and `docs/testing/views/dashboard/dashboard-cypress-qa-tracker.csv`
  - `docs/testing/views/heatmap/heatmap-view-cypress-checklist.md` and `docs/testing/views/heatmap/heatmap-view-cypress-qa-tracker.csv`
  - `docs/testing/views/table/table-view-cypress-checklist.md` and `docs/testing/views/table/table-view-cypress-qa-tracker.csv`
  - `docs/testing/views/waterfall/waterfall-view-cypress-checklist.md` and `docs/testing/views/waterfall/waterfall-view-cypress-qa-tracker.csv`
  - `docs/testing/views/phylogenetic-tree/phylogenetic-view-cypress-checklist.md` and `docs/testing/views/phylogenetic-tree/phylogenetic-view-cypress-qa-tracker.csv`
- Update the matching bug log whenever maintained Cypress coverage exposes or resolves a product bug:
  - `docs/testing/views/2d-network/2d-network-cypress-bug-log.csv` for 2D Network
  - `docs/testing/views/map/map-view-cypress-bug-log.csv` for Map
  - `docs/testing/views/epi-curve/epi-curve-cypress-bug-log.csv` for Epi Curve
  - `docs/testing/views/gantt-chart/gantt-chart-cypress-bug-log.csv` for Gantt
  - `docs/testing/views/aggregate/aggregate-view-cypress-bug-log.csv` for Aggregate
  - `docs/testing/views/sankey/sankey-view-cypress-bug-log.csv` for Sankey
  - `docs/testing/views/crosstab/crosstab-view-cypress-bug-log.csv` for Crosstab
  - `docs/testing/views/alignment/alignment-view-cypress-bug-log.csv` for Alignment View
  - `docs/testing/views/bubble/bubble-view-cypress-bug-log.csv` for Bubble
  - `docs/testing/views/dashboard/dashboard-cypress-bug-log.csv` for Dashboard
  - `docs/testing/views/heatmap/heatmap-view-cypress-bug-log.csv` for Heatmap
  - `docs/testing/views/table/table-view-cypress-bug-log.csv` for Table
  - `docs/testing/views/waterfall/waterfall-view-cypress-bug-log.csv` for Waterfall
  - `docs/testing/views/phylogenetic-tree/phylogenetic-view-cypress-bug-log.csv` for Phylogenetic Tree
- When a journey is added, move its tracker row from `Missing` or `Partial` to `Covered`.
- Add the exact current Cypress spec path in the CSV once coverage exists.
- When current product behavior differs from intended behavior, keep both expectations instead of changing the intended value to make the test pass.
- Document the divergence in the matching bug log and list the spec that caught it plus the specs that must remain green after the fix.
- Track missing fixtures explicitly in the CSV instead of burying them in notes.

## Immediate Priority

- Port the highest-risk sample-data-only 2D setting tests into profile-driven uploaded-data journeys.
- Port the highest-value sample-data-only Map control tests into profile-driven uploaded-data journeys.
- Port the highest-value remaining Gantt settings and multi-entry behaviors into maintained uploaded-data journeys.
- Promote the new Alignment direct-launch and sequence-type gaps from blocked tracker rows into maintained uploaded-data journeys once the product path is stable.
- Port the highest-value sample-data-only Bubble controls into profile-driven uploaded-data journeys.
- Promote the remaining high-value Table gaps such as direct-launch and column-picker coverage into maintained uploaded-data journeys.
- Port the highest-value sample-data-only Phylogenetic Tree controls into uploaded-data journeys.
- Add uploaded-data 2D link label and link width journeys next.
- Keep new Cypress work inside the maintained `journeys` and `view-state` buckets instead of adding more root-level mixed specs.
