# Bubble View Cypress E2E Checklist

Current on `cypressTesting` as of 2026-04-10.

Companion QA tracker: `docs/bubble-view-cypress-qa-tracker.csv`

Companion bug log: `docs/bubble-view-cypress-bug-log.csv`

Architecture reference: `docs/cypress-architecture.md`

Update this checklist, the QA tracker, and the bug log together when maintained Bubble coverage or known Bubble behavior changes.

## Purpose

This checklist is the target Cypress coverage for the Bubble view.

Use it to distinguish three states clearly:

- `[x]` Covered by a maintained uploaded-data journey in `cypress/e2e/journeys/flows/`.
- `[~]` Covered only by the older sample-data Bubble spec in `cypress/e2e/view-state/bubble-view.cy.ts`.
- `[ ]` Missing and still needs a maintained journey.

For maintained Bubble journeys, prefer this pattern:

- upload real fixture files through Files
- launch the network cleanly in 2D, then switch into Bubble unless a direct-to-Bubble launch path is explicitly under test
- assert Bubble Cytoscape state plus backing session/widgets
- keep direct coordinate clicks to a minimum; use Bubble Cytoscape events where canvas targeting would otherwise be brittle

## Maintained Coverage Now

- [x] Uploaded Bubble smoke coverage exists for distance edgelist, matrix, FASTA, node + link, sequence node-list, Newick, mixed-origin, and large node + epi-link inputs.
- [x] Uploaded node + link data can launch directly into Bubble from File Settings without a manual view switch.
- [x] Uploaded Bubble axes can be reassigned through Bubble Settings.
- [x] Uploaded Bubble node size and axis-label size controls update rendered Bubble state.
- [x] Uploaded Bubble node spacing changes rendered intra-cell separation and becomes disabled when collapse is on.
- [x] Uploaded Bubble collapsed node sizes scale by aggregate totalCount when node size changes.
- [x] Uploaded Bubble date axes format labels and keep nonblank dates in chronological order.
- [x] Uploaded Bubble Y-axis date mode is covered separately from the X-axis date path.
- [x] Uploaded Bubble invalid dates collapse into an `Unknown` bucket without breaking valid chronological labels.
- [x] Uploaded node color mappings from Global Settings affect Bubble node rendering.
- [x] Collapsed uploaded Bubble nodes preserve aggregate counts and render tooltip tables.
- [x] Bubble selection sync propagates from Bubble to the shared session model and back into 2D.
- [x] Bubble unselect sync propagates from Bubble back into the shared session model and 2D.
- [x] Uploaded Bubble responds to external `node-selected` events driven from shared session state.
- [x] Uploaded Bubble multi-select propagates into the shared session model and back into 2D.
- [x] Collapsed Bubble aggregate selection stays local and does not leak into shared node selection state.
- [x] Uploaded Bubble threshold changes recompute Cluster rebucketing and Cluster-based Bubble colors.
- [x] Uploaded Bubble threshold changes recompute collapsed aggregate compositions, pie backgrounds, and aggregate sizes.
- [x] Uploaded Bubble fixed node colors stay coherent in expanded and collapsed Bubble.
- [x] Uploaded Bubble node color-table edits update only the targeted category.
- [x] Uploaded style files are reflected on Bubble without manual restyling.
- [x] Uploaded Bubble export writes a non-empty SVG file to downloads.
- [x] Uploaded Bubble export writes a non-empty PNG file after the advanced scale changes.
- [x] Saved sessions preserve Bubble axes, collapse, node size, and style-backed widget state after reload.
- [x] Saved styled collapsed Bubble sessions preserve mixed aggregate pie backgrounds after reload.
- [x] Uploaded Bubble timeline checkpoints are covered with oracle-backed membership assertions.
- [x] Uploaded Bubble timeline play/pause and deterministic slider jumps keep rendered membership aligned.
- [x] Uploaded Bubble collapsed timeline playback keeps aggregate totals and sizes aligned.
- [x] Uploaded Bubble color edits persist after timeline mode is turned off.
- [x] Dashboard Bubble panes resync after root filtering and styling changes while sibling views remain open.
- [x] Bubble Center Screen restores the fitted viewport after zoom drift.

## Legacy-Only Coverage

No target Bubble coverage currently depends on the old sample-data spec; `cypress/e2e/view-state/bubble-view.cy.ts` remains only as supplemental breadth.

## Highest-Value Next Gaps

No open maintained Bubble gaps are currently tracked.

## Notes

- Bubble is Cytoscape-based like 2D, but it renders only data nodes plus synthetic axis nodes, so link-level Cytoscape assertions do not apply here.
- The maintained uploaded-data Bubble smoke entry point is `cypress/e2e/journeys/flows/upload-launch-bubble.cy.ts`.
- Dashboard-specific Bubble cross-view coverage lives in `cypress/e2e/journeys/flows/dashboard-global-styling-uploaded.cy.ts` and `cypress/e2e/journeys/flows/dashboard-filtering-propagation-uploaded.cy.ts`.
- The older broad Bubble mechanics spec is still `cypress/e2e/view-state/bubble-view.cy.ts`.
- Bubble bug rows use `BBG###` IDs so issue automation does not collide with 2D `BG###` or Map `MBG###` rows.
