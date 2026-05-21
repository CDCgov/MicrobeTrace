# Heatmap View Cypress E2E Checklist

Current on `cypressTesting` as of 2026-04-03.

Companion QA tracker: `docs/testing/views/heatmap/heatmap-view-cypress-qa-tracker.csv`

Companion bug log: `docs/testing/views/heatmap/heatmap-view-cypress-bug-log.csv`

Architecture reference: `docs/testing/cypress-architecture.md`

Update this checklist, the QA tracker, and the bug log together when maintained Heatmap coverage or known Heatmap behavior changes.

## Purpose

This checklist is the target Cypress coverage for the Heatmap view.

Use it to distinguish three states clearly:

- `[x]` Covered by a maintained uploaded-data journey in `cypress/e2e/journeys/flows/`.
- `[~]` Covered only by ad hoc or exploratory verification and should not be treated as the main regression signal.
- `[ ]` Missing and still needs a maintained journey.

For maintained Heatmap journeys, prefer this pattern:

- upload real fixture files through Files
- launch the network cleanly, then switch into Heatmap
- assert Plotly trace state against `commonService.getDM()`
- assert Heatmap widget state under `commonService.session.style.widgets.*`
- use downloaded artifacts in `cypress/downloads/` for image export verification
- capture exported CSV blobs when you need deterministic content assertions on the saved Heatmap matrix payload

## Maintained Coverage Now

- [x] Uploaded distance edgelists can launch and render a Heatmap whose Plotly trace matches `getDM()`.
- [x] Uploaded distance matrices can launch and render a Heatmap whose Plotly trace matches `getDM()`.
- [x] Uploaded FASTA files can derive distances and render a Heatmap whose Plotly trace matches `getDM()`.
- [x] Uploaded node + link files can render a Heatmap whose Plotly trace matches `getDM()`.
- [x] Uploaded sequence node lists can derive distances and render a Heatmap whose Plotly trace matches `getDM()`.
- [x] Uploaded Newick trees can render a Heatmap whose Plotly trace matches `getDM()`.
- [x] Invert X and Invert Y update both the persisted Heatmap widgets and the rendered Plotly label/value ordering.
- [x] Show Labels updates both the persisted widget state and the rendered Plotly axis label visibility.
- [x] Low, medium, and high Heatmap colors update the rendered Plotly colorscale.
- [x] Center Screen restores the Heatmap viewport to autorange after a manual viewport change.
- [x] Export Heatmap writes a non-empty SVG file to `cypress/downloads/`.
- [x] Export Heatmap writes non-empty PNG and JPEG files to `cypress/downloads/`.
- [x] Export Distance Matrix produces a CSV payload whose labeled and unlabeled forms match the rendered Heatmap state.
- [x] Export Distance Matrix respects active Heatmap axis inversion rather than only the base `getDM()` order.
- [x] Post-launch distance metric switches redraw an already-active Heatmap on sequence-derived data.
- [x] Heatmap-specific settings persist after closing and reopening the Heatmap tab.
- [x] File Settings can launch uploaded data directly into Heatmap without a manual view switch.
- [x] Global background changes restyle an already-active Heatmap, including computed axis-text contrast.
- [x] Heatmap-specific settings persist across save-session and reload-session round trips.
- [x] Larger uploaded Heatmap-capable datasets render and keep settings/export dialogs reachable.
- [x] The built-in sample session has a dedicated Heatmap smoke sentinel.

## Highest-Value Next Gaps

- [x] No open maintained-coverage gaps remain in the current Heatmap QA tracker.

## Notes

- Heatmap is Plotly-based, not Cytoscape-based or Leaflet-based, so assertions should target `commonService.visuals.heatmap`, `heatmapData`, and the rendered Plotly SVG.
- The maintained Heatmap file-type baseline is `cypress/e2e/journeys/flows/upload-launch-heatmap.cy.ts`.
- The maintained Heatmap direct-launch matrix is `cypress/e2e/journeys/flows/heatmap-direct-launch-uploaded.cy.ts`.
- The maintained Heatmap controls and export journey is `cypress/e2e/journeys/flows/heatmap-controls-uploaded.cy.ts`.
- The maintained Heatmap global-background regression is `cypress/e2e/journeys/flows/heatmap-background-uploaded.cy.ts`.
- The maintained Heatmap post-launch metric-switch journey is `cypress/e2e/journeys/flows/heatmap-metric-switch-uploaded.cy.ts`.
- The maintained Heatmap session round-trip journey is `cypress/e2e/journeys/flows/heatmap-session-roundtrip.cy.ts`.
- The maintained large-data Heatmap smoke journey is `cypress/e2e/journeys/flows/heatmap-large-uploaded.cy.ts`.
- The maintained sample-session Heatmap smoke is `cypress/e2e/view-state/heatmap-view.cy.ts`.
- Heatmap bug rows use `HBG###` ids to keep the surface-specific tracker distinct from the 2D (`BG###`) and Map (`MBG###`) logs.
