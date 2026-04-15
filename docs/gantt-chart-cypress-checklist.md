# Gantt Chart Cypress E2E Checklist

Current on `cypressTesting` as of 2026-04-08.

Companion QA tracker: `docs/gantt-chart-cypress-qa-tracker.csv`

Companion bug log: `docs/gantt-chart-cypress-bug-log.csv`

Architecture reference: `docs/cypress-architecture.md`

Update this checklist, the QA tracker, and the bug log together when maintained Gantt coverage or known Gantt behavior changes.

## Purpose

This checklist is the target Cypress coverage for the Gantt Chart view.

Use it to distinguish two states clearly:

- `[x]` Covered by a maintained uploaded-data journey in `cypress/e2e/journeys/flows/`.
- `[ ]` Missing and still needs a maintained journey.

For maintained Gantt journeys, prefer this pattern:

- upload real fixture files through Files
- launch the network on the stable uploaded-data path first
- switch into `Gantt Chart` from the View menu
- create Gantt entries through the real settings dialog
- assert rendered SVG rows, bar widths, settings-table state, and export artifacts

## Maintained Coverage Now

- [x] Uploaded node + distance-link data can launch, switch to Gantt, and render one date-range bar per loaded node with complete symptom dates.
- [x] Uploaded sequence-node data can launch, switch to Gantt, and render one date-range bar per loaded node.
- [x] Uploaded sequence-node data can render a single-date entry with the fixed-width fallback marker.
- [x] Rendered Gantt row counts can be asserted deterministically on uploaded data.
- [x] Entry field selections persist into the Gantt settings table on uploaded data.
- [x] Direct launch from File Settings into Gantt is covered on uploaded node+link and sequence-node data.
- [x] Existing-entry color updates stay synchronized between the settings table, rendered bars, and legend swatch.
- [x] Existing-entry opacity updates stay synchronized between the settings table, rendered bars, and legend swatch.
- [x] Multi-entry add/remove behavior is covered in a maintained uploaded-data journey.
- [x] Default entry-name fallback can be exercised in a maintained uploaded-data journey.
- [x] Visual Settings controls for Grid, Spacing (X/Y), and Font Size are covered in a maintained uploaded-data journey.
- [x] Switching away from Gantt and back can preserve created entries and visual settings on uploaded data.
- [x] Uploaded Gantt export writes non-empty SVG, PNG, and JPEG files to downloads.
- [x] Export dialog filetype toggling and close-without-export behavior are covered on uploaded data.
- [x] Sparse-date filtering is covered with a synthetic uploaded node + link edge-case fixture.
- [x] GMT-normalized timeline rendering is covered with a synthetic uploaded node + link edge-case fixture.
- [x] Empty-state Gantt launch and pre-entry `Gantt Settings` reopen stability are covered on uploaded node+link and sequence-node fixtures.
- [x] Removing the final remaining Gantt entry back to a clean empty state is covered.
- [x] New-entry validation for the default `None` start/end date selection is covered.

## Notes

- Maintained Gantt journeys currently use the stable path of launching the uploaded network first and then switching into `Gantt Chart`.
- `GBG###` IDs are reserved for Gantt bug rows in `docs/gantt-chart-cypress-bug-log.csv`.
- Direct launch from File Settings was fixed under `GBG001`.
- Export modal dismissal after save was fixed under `GBG002`.
- Empty-state `Gantt Settings` runtime instability was fixed under `GBG003`.
- Existing-entry color sync was fixed under `GBG004`.
- Sparse-date filtering was fixed under `GBG005`.
- Empty-entry submission from the default dialog state was fixed under `GBG006`.
