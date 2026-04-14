# Sankey View Cypress E2E Checklist

Current on `cypressTesting` as of 2026-04-03.

Companion QA tracker: `docs/sankey-view-cypress-qa-tracker.csv`

Companion bug log: `docs/sankey-view-cypress-bug-log.csv`

Architecture reference: `docs/cypress-architecture.md`

Update this checklist, the QA tracker, and the bug log together when maintained Sankey coverage or known Sankey behavior changes.

## Purpose

This checklist is the target Cypress coverage for the Sankey view.

Use it to distinguish three states clearly:

- `[x]` Covered by a maintained uploaded-data journey in `cypress/e2e/journeys/flows/`.
- `[~]` Covered only by the older sample-data Sankey smoke in `cypress/e2e/legacy-disabled/sankey-plugin.legacy.cy.ts`.
- `[ ]` Missing and still needs a maintained journey.

For maintained Sankey journeys, prefer this pattern:

- upload real fixture files through Files
- launch the network cleanly in 2D, then switch into Sankey unless a direct-to-Sankey launch path is explicitly under test
- add Sankey variables through the real settings dialog
- assert Sankey SVG state plus backing Sankey component data
- keep large-fixture coverage tied to realistic categorical fields instead of forcing high-cardinality date or id combinations

## Maintained Coverage Now

- [x] Uploaded Sankey smoke coverage exists for distance edgelist, matrix, FASTA, node + link, sequence node-list, Newick, and mixed-origin inputs.
- [x] Sankey requires at least two variables before the graph renders.
- [x] Uploaded categorical variables can be added through Sankey settings and produce deterministic node/link counts.
- [x] Sankey visual settings can switch link coloring to a uniform color on uploaded data.
- [x] Sankey visual settings can switch link coloring across Source, Target, and Uniform modes.
- [x] Sankey per-layer color inputs update the targeted column plus derived link colors.
- [x] Sankey label-font and axis-font controls update the rendered SVG text on uploaded data.
- [x] Sankey node tooltip content can be asserted on uploaded data.
- [x] Sankey link tooltip content plus hover-opacity reset can be asserted on uploaded data.
- [x] Sankey export writes a non-empty PNG file to downloads.
- [x] Sankey export writes a non-empty SVG file to downloads.
- [x] Sankey variable removal returns the view to the warning state when fewer than two fields remain.
- [x] Sankey variable-table reorder updates the rendered axis order and graph counts.
- [x] Sankey enforces the five-variable maximum on uploaded data.
- [x] Sankey node drag updates node geometry, connected link geometry, and same-layer collision resolution.
- [x] Sankey PNG export advanced scale and resolution controls can be asserted.
- [x] Sankey export-dialog filetype toggle and cancel behavior can be asserted.
- [x] Sankey recomputes when `cluster` is selected and threshold filtering changes cluster membership.
- [x] Files settings can direct-launch uploaded datasets straight into Sankey.
- [x] Large uploaded Sankey smoke exists with a maintained derived month-bucket fixture.

## Legacy-Only Coverage

- [~] Minimal sample-data container and settings smoke exists in `cypress/e2e/legacy-disabled/sankey-plugin.legacy.cy.ts`.

## Highest-Value Next Gaps

- [ ] No currently identified P0-P2 gaps remain in the maintained Sankey tracker.

## Notes

- Sankey is SVG-based and derives its links from node-field transitions, so assertions should focus on rendered SVG nodes/links plus `commonService.visuals.sankey.data`.
- The maintained uploaded-data Sankey smoke entry point is `cypress/e2e/journeys/flows/upload-launch-sankey.cy.ts`.
- The maintained direct-launch Sankey entry point is `cypress/e2e/journeys/flows/sankey-direct-launch-uploaded.cy.ts`.
- The maintained large-network Sankey entry point is `cypress/e2e/journeys/flows/sankey-large-uploaded.cy.ts`.
- The maintained uploaded-data Sankey controls entry point is `cypress/e2e/journeys/flows/sankey-controls-uploaded.cy.ts`.
- The maintained Sankey filtering-combo entry point is `cypress/e2e/journeys/flows/sankey-cluster-filtering-uploaded.cy.ts`.
- The older minimal sample-data Sankey smoke is still preserved in `cypress/e2e/legacy-disabled/sankey-plugin.legacy.cy.ts`.
- Sankey bug rows use `SBG###` IDs so they do not collide with 2D `BG###`, Map `MBG###`, or Bubble `BBG###` rows.
