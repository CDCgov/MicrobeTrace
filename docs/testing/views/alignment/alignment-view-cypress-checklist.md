# Alignment View Cypress E2E Checklist

Current on `cypressTesting` as of 2026-04-04.

Companion QA tracker: `docs/testing/views/alignment/alignment-view-cypress-qa-tracker.csv`

Companion bug log: `docs/testing/views/alignment/alignment-view-cypress-bug-log.csv`

Architecture reference: `docs/testing/cypress-architecture.md`

Update this checklist, the QA tracker, and the bug log together when maintained Alignment coverage or known Alignment behavior changes.

## Purpose

This checklist is the target Cypress coverage for the Alignment View.

Use it to distinguish three states clearly:

- `[x]` Covered by a maintained uploaded-data journey in `cypress/e2e/journeys/flows/`.
- `[~]` Covered only by the older sample-data Alignment spec in `cypress/e2e/legacy-disabled/alignment-plugin.legacy.cy.ts`.
- `[ ]` Missing or currently blocked by a known product bug.

For maintained Alignment journeys, prefer this pattern:

- upload real fixture files through Files
- launch the network cleanly, then switch into Alignment unless direct-to-Alignment is the path under test
- assert global counts plus rendered alignment canvas, label rows, and excluded-node state
- prefer small deterministic sequence fixtures for control and export coverage

## Maintained Coverage Now

- [x] Uploaded FASTA can launch, switch to Alignment, and render the sequence canvas deterministically.
- [x] Uploaded sequence node lists can launch, switch to Alignment, and render deterministic label rows.
- [x] Uploaded node plus distance-link data can switch to Alignment and surface excluded nodes without sequence data.
- [x] Uploaded sequence-bearing fixtures can launch directly into Alignment from File Settings default view.
- [x] Alignment layout controls can toggle mini-map visibility on uploaded data.
- [x] Alignment top display can switch from Bar Plot to Logo on uploaded data.
- [x] Alignment amino-acid mode also covers the AA-specific top-display logo branch.
- [x] Alignment data controls cover start/end windowing plus sequence-type switches to Codons and Amino Acids.
- [x] Alignment amino-acid translation settings are covered on uploaded gapped sequences.
- [x] Alignment ruler minor interval control covers both positive values and the `0` branch that removes minor ticks.
- [x] Alignment show-characters modes are covered on uploaded data.
- [x] Alignment label-field and sort-field controls are covered on uploaded data.
- [x] Alignment preset and custom sizing controls are covered on uploaded data.
- [x] Alignment alternative/custom nucleotide color schemes and amino-acid canvas palette behavior are covered on uploaded data.
- [x] Alignment interaction coverage includes global search highlight/autoscroll, mini-map navigation, per-position tooltip rendering, canvas/label scroll sync, and external selection row highlight on uploaded data.
- [x] Alignment interaction coverage also includes amino-acid tooltip content after translation.
- [x] Alignment handles uploaded non-sequence distance-edgelist, matrix, and Newick inputs with an explicit empty state instead of a runtime error.
- [x] Alignment export writes non-empty SVG, PNG, FASTA, MEGA, and CSV files on uploaded data.
- [x] Alignment export covers consensus FASTA, consensus MEGA, consensus CSV, and amino-acid FASTA content.
- [x] Alignment export also covers amino-acid MEGA syntax and amino-acid consensus DataTable CSV syntax.

## Legacy-Only Coverage

- [~] Sample-data Alignment open from the View menu.
- [~] Sample-data Alignment settings open and close mechanics.

These older checks remain useful for ad hoc debugging, but they are not part of the maintained uploaded-data regression suite.

## Remaining Coverage Needed For Full Coverage

- [x] No additional Alignment gaps are currently tracked in the QA matrix.

## Notes

- Alignment is canvas + SVG based, not Cytoscape- or Leaflet-based, so assertions should target the rendered canvas, label rows, export artifacts, and backing Alignment state.
- Maintained uploaded-data Alignment coverage now includes both the stable launch-then-switch path and a dedicated direct-launch Alignment smoke.
- The tracker was expanded on 2026-04-04 to include previously implicit amino-acid-only branches for top-display rendering, tooltip content, and MEGA/DataTable exports.
- Direct default-view launch to Alignment was fixed under `ABG001` in `docs/testing/views/alignment/alignment-view-cypress-bug-log.csv`.
- The zero-value `Ruler Minor Interval` dropdown path was fixed under `ABG002` in `docs/testing/views/alignment/alignment-view-cypress-bug-log.csv`.
- Unsupported non-sequence file types now render an explicit empty state in Alignment rather than surfacing the runtime error fixed under `ABG003`.
- Alignment bug rows use `ABG###` IDs so they do not collide with other surface bug trackers.
