# Epi Curve Cypress E2E Checklist

Current on `cypressTesting` as of 2026-04-04.

Companion QA tracker: `docs/testing/views/epi-curve/epi-curve-cypress-qa-tracker.csv`

Companion bug log: `docs/testing/views/epi-curve/epi-curve-cypress-bug-log.csv`

Architecture reference: `docs/testing/cypress-architecture.md`

Update this checklist, the QA tracker, and the bug log together when maintained Epi Curve coverage or known Epi behavior changes.

## Purpose

This checklist is the target Cypress coverage for the Epi Curve view.

Use it to distinguish three states clearly:

- `[x]` Covered by a maintained uploaded-data journey in `cypress/e2e/journeys/flows/`.
- `[~]` Covered only by the older sample-data Epi spec in `cypress/e2e/view-state/timeline-epicurve-view.cy.ts`.
- `[ ]` Missing and still needs a maintained journey.

For maintained Epi journeys, prefer this pattern:

- upload real fixture files through Files
- launch the dataset cleanly, then switch into Epi Curve unless direct-to-Epi launch is explicitly under test
- configure Date Field or export through the Epi Curve UI
- assert rendered SVG bars, axis labels, and exported files
- avoid duplicating sample-data-only settings mechanics unless uploaded data changes the risk profile

## Maintained Coverage Now

- [x] Uploaded node + distance-link data can switch into Epi Curve and render symptom-onset bars.
- [x] Uploaded sequence node-list data can switch into Epi Curve and render diagnosis-date bars.
- [x] Uploaded distance-matrix data merged with node metadata can switch into Epi Curve and render diagnosis-date bars.
- [x] Uploaded FASTA data merged with node metadata can switch into Epi Curve and render diagnosis-date bars.
- [x] Uploaded mixed-origin node + epi-link data can switch into Epi Curve and render diagnosis-date bars.
- [x] Uploaded single-date Epi settings cover bin size, legend placement, label sizing, legend sizing, and cumulative toggling.
- [x] Uploaded single-date Epi settings cover the fixed-color path and Color By visibility rules.
- [x] Uploaded `X-axis Interval` coverage verifies tick changes plus the Year and Quarter control rules.
- [x] Resetting uploaded single-date or multi-date selections to `None` clears stale Epi bars and axes.
- [x] Uploaded styling coverage verifies Cluster-color recompute after threshold changes and the Node Color path through category edits and fixed-color fallback.
- [x] Uploaded styling coverage verifies Lineage-colored Epi bars stay isolated from global State node color table edits before and after the table is floated.
- [x] Uploaded multi-date Epi controls cover side-by-side, overlay, legend placement, cumulative toggling, and per-field colors.
- [x] Uploaded File Settings can launch directly into Epi Curve.
- [x] Uploaded Epi Curve export writes a non-empty PNG file to downloads.
- [x] Uploaded Epi Curve export writes a non-empty SVG file to downloads.
- [x] Uploaded PNG export advanced settings update the calculated resolution text when scale changes.
- [x] Uploaded PNG export advanced settings no longer expose an inert quality slider.

## Legacy-Only Coverage

- [~] The older sample-data Epi spec still exercises broad settings mechanics, but its highest-value styling behaviors are now covered on uploaded data too.

These remain useful for exploratory and sample-data regression coverage, but the maintained uploaded-data journeys now cover the core single-date and multi-date mechanics directly.

## Highest-Value Next Gaps

- [ ] No open maintained-coverage product gaps remain on the Epi surface; remaining work is optional expansion beyond the current tracker.

## Notes

- Epi Curve is D3/SVG-based, not Cytoscape-based and not Leaflet-based.
- The maintained uploaded-data smoke baseline is `cypress/e2e/journeys/flows/epi-curve-load-uploaded.cy.ts`.
- The maintained uploaded-data controls baseline is `cypress/e2e/journeys/flows/epi-curve-controls-uploaded.cy.ts`.
- The maintained uploaded-data styling baseline is `cypress/e2e/journeys/flows/epi-curve-styling-uploaded.cy.ts`.
- The maintained uploaded-data export baseline is `cypress/e2e/journeys/flows/epi-curve-export-uploaded.cy.ts`.
- The maintained direct-launch baseline is `cypress/e2e/journeys/flows/epi-curve-direct-launch-uploaded.cy.ts`.
- Direct launch now relies on an Epi-specific render completion signal so the shared Processing Files dialog closes even when 2D Network is never opened.
- The maintained controls journey now also guards the single-date fixed-color path and the `Date Field = None` clearing behavior.
- The unsupported PNG quality slider was removed from the Epi export dialog, and the export suite now guards that regression explicitly.
- The older broad Epi settings spec remains `cypress/e2e/view-state/timeline-epicurve-view.cy.ts`.
- Epi Curve bug rows use `EBG###` IDs so the GitHub bug-tracker workflow does not collide with 2D `BG###` or other view-specific bug IDs.
