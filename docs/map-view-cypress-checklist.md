# Map View Cypress E2E Checklist

Current on `cypressTesting` as of 2026-04-08.

Companion QA tracker: `docs/map-view-cypress-qa-tracker.csv`

Companion bug log: `docs/map-view-cypress-bug-log.csv`

Architecture reference: `docs/cypress-architecture.md`

Update this checklist, the QA tracker, and the bug log together when maintained Map coverage or known Map behavior changes.

## Purpose

This checklist is the target Cypress coverage for the Map view.

Use it to distinguish three states clearly:

- `[x]` Covered by a maintained uploaded-data journey in `cypress/e2e/journeys/flows/`.
- `[~]` Covered only by the older sample-data Map spec in `cypress/e2e/view-state/map-view.cy.ts`.
- `[ ]` Missing and still needs a maintained journey.

For maintained Map journeys, prefer this pattern:

- upload real fixture files through Files
- launch the network cleanly, then switch into Map unless a direct-to-Map launch path is explicitly under test
- configure Map data fields through Geospatial Settings
- assert global stats plus Leaflet layer state
- avoid online tile correctness assertions

## Maintained Coverage Now

- [x] Uploaded node + distance-link data can launch, switch to Map, and render deterministically there.
- [x] Uploaded node + distance-link data can launch directly into Map from File Settings default view.
- [x] Zipcode mapping can be configured on uploaded data.
- [x] Uploaded latitude and longitude mapping can be configured on uploaded data.
- [x] Nodes without location data are counted and listed in the Excluded Nodes dialog.
- [x] Rendered Map node and link layer counts can be asserted deterministically on uploaded data.
- [x] Rendered Leaflet node coordinates can be checked against uploaded lat/long values.
- [x] Threshold changes while Map is active update rendered Map link counts.
- [x] Threshold round-trip back to the original value restores the original rendered Map link count.
- [x] Deterministic timeline checkpoints can be asserted on Map with oracle-backed expected membership.
- [x] Node collapsing can be toggled on uploaded Map data.
- [x] Node jitter and reroll can be asserted on uploaded Map data.
- [x] Node and link transparency can be asserted on uploaded Map data.
- [x] Node and link hide/show controls can be asserted on uploaded Map data.
- [x] The online basemap layer state can be asserted on uploaded Map data.
- [x] Offline countries, states, and counties layer toggles can be asserted on uploaded Map data.
- [x] Pan, center, and basic zoom controls can be asserted on uploaded Map data.
- [x] Node and link tooltip contents can be asserted on uploaded Map data.
- [x] Node selection can be asserted on uploaded Map data.
- [x] A fixed uploaded Map node color can be asserted in both collapsed and uncollapsed node modes.
- [x] A fixed uploaded Map link color can be asserted on uploaded data.
- [x] Uploaded node and link color mappings can be asserted on Map.
- [x] Targeted node and link color table edits can be checked against rendered Map layers.
- [x] Threshold-driven node and link cluster recoloring can be asserted on Map.
- [x] Uploaded style-file application can be asserted for Map node styling, tooltip configuration, and layer widget state.
- [x] Uploaded style-file application can be asserted for rendered Map link colors as well.
- [x] Uploaded Map timeline play/pause progression can be asserted.
- [x] Uploaded Map manual timeline slider checkpoints can be asserted.
- [x] Uploaded Map node and link color edits both persist after timeline mode is turned off.
- [x] Uploaded Map node color edits persist after timeline mode is turned off.
- [x] Uploaded Map export writes a non-empty PNG file to downloads.
- [x] A selected uploaded Map layer such as satellite survives closing and reopening the Map tab.

## Legacy-Only Coverage

- [~] No high-value Map behaviors remain legacy-only today.

These remain useful for exploratory coverage, but they are not currently part of the maintained `journeys` run and should not be treated as the main regression safety net.

## Blocked By Bugs

- [x] No maintained Map coverage items are currently blocked by an open Map bug.

## Highest-Value Next Gaps

- [x] No high-value maintained Map gaps remain blocked today.

If we later need exact style-file coverage on uploaded Map data, that is a narrower follow-up than the broader uploaded-data color-mapping gap that is now covered.

## Notes

- Map is Leaflet-based, not Cytoscape-based, so assertions should target Leaflet layers and backing Map state.
- Avoid relying on internet-backed basemap tiles for correctness.
- The first maintained uploaded-data Map journey is `cypress/e2e/journeys/flows/map-zipcode-threshold.cy.ts`.
- The maintained uploaded direct-launch Map smoke is `cypress/e2e/journeys/flows/map-direct-launch-uploaded.cy.ts`.
- The older broad Map control spec is still `cypress/e2e/view-state/map-view.cy.ts`.
- Map bug rows use `MBG###` IDs so the shared GitHub issue automation does not collide with 2D `BG###` rows.
- Direct file launch with File Settings default view = `Map` was tracked as `MBG001` in `docs/map-view-cypress-bug-log.csv` and is now covered by the maintained direct-launch smoke.
