# Crosstab View Cypress E2E Checklist

Current on `cypressTesting` as of 2026-04-10.

Companion QA tracker: `docs/testing/views/crosstab/crosstab-view-cypress-qa-tracker.csv`

Companion bug log: `docs/testing/views/crosstab/crosstab-view-cypress-bug-log.csv`

Architecture reference: `docs/testing/cypress-architecture.md`

Update this checklist, the QA tracker, and the bug log together when maintained Crosstab coverage or known Crosstab behavior changes.

## Purpose

This checklist is the target Cypress coverage for the Crosstab view.

Use it to distinguish these states clearly:

- `[x]` Covered by a maintained view-state spec or uploaded-data journey.
- `[~]` Covered with an observed-behavior assertion because the product still has a tracked bug.
- `[ ]` Missing and still needs maintained coverage.

For maintained Crosstab coverage, prefer this split:

- sample-data `view-state` specs for Crosstab mechanics and export behavior
- uploaded-data `journeys/flows` coverage for file-type launch compatibility

## Maintained Coverage Now

- [x] Uploaded distance edgelist data can launch, switch to Crosstab, and render deterministic totals.
- [x] Uploaded matrix data can launch, switch to Crosstab, and render deterministic totals.
- [x] Uploaded FASTA data can launch, switch to Crosstab, and render deterministic totals.
- [x] Uploaded node + link data can launch, switch to Crosstab, and render deterministic totals.
- [x] Uploaded sequence-node data can launch, switch to Crosstab, and render deterministic totals.
- [x] Uploaded Newick data can launch, switch to Crosstab, and render deterministic totals.
- [x] Uploaded direct launch with File Settings default view set to `Crosstab` is covered across the maintained upload matrix.
- [x] Crosstab X and Y field changes recompute the rendered header, body, and footer deterministically.
- [x] Pivot swaps axes and preserves totals.
- [x] Counts vs Proportion recomputes cells against the visible-node total and normalizes the footer total to `1.000`.
- [x] Table size changes update stored size state and recompute scroll height.
- [x] Filtering-driven Crosstab updates on uploaded data after threshold or minimum-cluster changes.
- [x] Timeline checkpoints change global stats without changing the open Crosstab dataset.
- [x] CSV export writes a non-empty file to downloads.
- [x] JSON export writes a non-empty file to downloads.
- [x] XLSX export writes a non-empty file to downloads.
- [x] PDF export writes a file and dismisses the export dialog after completion.
- [x] Saved style or session state can restore Crosstab widget selections safely.

## Highest-Value Next Gaps

- No currently open high-value Crosstab gaps remain in the maintained Cypress suite.

## Notes

- Maintained sample-data mechanics live in `cypress/e2e/view-state/crosstab-view.cy.ts`.
- Maintained Crosstab export coverage lives in `cypress/e2e/view-state/crosstab-export.cy.ts`.
- Maintained uploaded file-type coverage lives in `cypress/e2e/journeys/flows/crosstab-file-types.cy.ts`.
- Timeline isolation coverage for non-target views lives in `cypress/e2e/journeys/flows/timeline-non-target-view-isolation-uploaded.cy.ts`.
- Crosstab bug rows use `CTBG###` IDs so the shared GitHub issue workflow does not collide with other surface trackers.
