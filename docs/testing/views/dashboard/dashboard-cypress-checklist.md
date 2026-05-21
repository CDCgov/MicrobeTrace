# Dashboard Cypress E2E Checklist

Current on `cypressTesting` as of 2026-04-14.

Companion QA tracker: `docs/testing/views/dashboard/dashboard-cypress-qa-tracker.csv`

Companion bug log: `docs/testing/views/dashboard/dashboard-cypress-bug-log.csv`

Architecture reference: `docs/testing/cypress-architecture.md`

Update this checklist, the QA tracker, and the bug log together when maintained dashboard coverage or known Golden Layout dashboard behavior changes.

## Purpose

This checklist is the target Cypress coverage for the multi-view Golden Layout dashboard surface.

Use it to distinguish these states clearly:

- `[x]` Covered by a maintained dashboard `view-state` spec or uploaded-data journey.
- `[ ]` Missing and still needs maintained coverage.

For maintained dashboard coverage, prefer this split:

- sample-data or saved-session `view-state` specs for Golden Layout mechanics
- uploaded-data `journeys/flows` for global-setting propagation and isolation across multiple open views

## Maintained Coverage Now

- [x] Saved dashboard fixtures can restore deterministic multi-pane Golden Layout layouts without rebuilding the layout interactively in each spec.
- [x] A 2x2 dashboard with `2D Network`, `Map`, `Bubble`, and `Table` renders all panes at once and survives real vertical and horizontal splitter drags.
- [x] Closing and reopening a dashboard tab does not blank sibling panes or orphan the homepage tab model.
- [x] `Table`, `Aggregate`, `Crosstab`, and `Waterfall` survive Golden Layout `resize`, `hide`, and `show` lifecycle events in a multi-pane dashboard.
- [x] Global fixed node-color changes propagate to `2D Network`, `Map`, and `Bubble` while non-style dashboard views keep their datasets stable.
- [x] Global node color-table edits update only the targeted node category across `2D Network`, `Map`, and `Bubble`.
- [x] Global fixed link-color changes propagate to `2D Network` and `Map` while `Bubble` remains unchanged.
- [x] Global link color-table edits update only the targeted link category across `2D Network` and `Map`.
- [x] Dashboard threshold, Minimum Cluster Size, and Reveal Everything changes keep `2D Network`, `Map`, `Bubble`, `Table`, `Aggregate`, `Crosstab`, and `Waterfall` synchronized to the intended filtered dataset for each view.
- [x] Dashboard timeline checkpoints update `2D Network`, `Map`, and `Bubble` while `Aggregate`, `Crosstab`, and `Waterfall` stay on the non-timeline dataset.
- [x] Waterfall drilldown survives dashboard timeline changes while the timeline-target views change visible membership.
- [x] `File -> Export Dashboard` opens a maintained PNG-only export dialog with stable controls, recomputes resolution after scale changes, and writes a nontrivial PNG artifact from a real uploaded multi-pane dashboard.
- [x] Dashboard export coverage includes a real splitter drag plus a root Global Settings style change before export so the artifact path is exercised from a non-default multi-pane state.
- [x] Saving and re-uploading a `.microbetrace` file can restore a live multi-pane dashboard with the saved tab set, active tab, and simultaneous Golden Layout panes.
- [x] Maintained dashboard coverage asserts no runtime error banner or stuck `Processing Files...` modal during the covered layout and propagation flows.

## Highest-Value Next Gaps

- [ ] Add a second dashboard tranche for per-view settings isolation, since the first dashboard tranche only covers root Global Settings propagation.

## Notes

- The maintained dashboard Golden Layout mechanics live in `cypress/e2e/view-state/dashboard-layout-core.cy.ts` and `cypress/e2e/view-state/dashboard-pane-lifecycle-core.cy.ts`.
- The maintained uploaded-data dashboard propagation and artifact coverage lives in `cypress/e2e/journeys/flows/dashboard-global-styling-uploaded.cy.ts`, `cypress/e2e/journeys/flows/dashboard-filtering-propagation-uploaded.cy.ts`, `cypress/e2e/journeys/flows/dashboard-timeline-propagation-uploaded.cy.ts`, `cypress/e2e/journeys/flows/dashboard-export-uploaded.cy.ts`, and `cypress/e2e/journeys/flows/dashboard-session-roundtrip-uploaded.cy.ts`.
- Saved dashboard fixtures live in `cypress/fixtures/dashboard-layout-core.microbetrace` and `cypress/fixtures/dashboard-pane-lifecycle-core.microbetrace`.
- The first dashboard tranche intentionally excludes Table from dashboard timeline-isolation assertions because the current architecture does not document Table as a non-target timeline-isolation surface.
- Dashboard bug rows use `DBG###` IDs so the shared GitHub issue automation does not collide with the per-view surface trackers.
