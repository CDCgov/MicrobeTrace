# Map View Cypress E2E Checklist

Current on `cypressTesting` as of 2026-03-24.

Companion QA tracker: `docs/map-view-cypress-qa-tracker.csv`

Companion bug log: `docs/map-view-cypress-bug-log.csv`

Architecture reference: `docs/cypress-architecture.md`

Update this checklist and the tracker together when maintained Map coverage changes.

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
- [x] Zipcode mapping can be configured on uploaded data.
- [x] Uploaded latitude and longitude mapping can be configured on uploaded data.
- [x] Nodes without location data are counted and listed in the Excluded Nodes dialog.
- [x] Rendered Map node and link layer counts can be asserted deterministically on uploaded data.
- [x] Rendered Leaflet node coordinates can be checked against uploaded lat/long values.
- [x] Threshold changes while Map is active update rendered Map link counts.
- [x] Threshold round-trip back to the original value restores the original rendered Map link count.
- [x] Deterministic timeline checkpoints can be asserted on Map with oracle-backed expected membership.
- [x] Uploaded node and link color mappings can be asserted on Map.
- [x] Targeted node and link color table edits can be checked against rendered Map layers.

## Legacy-Only Coverage

- [x] Node collapsing on and off.
- [x] Node transparency.
- [x] Link transparency.
- [x] Hide and show nodes.
- [x] Hide and show links.
- [~] Offline layers: countries, states, counties.
- [~] Online layers: basemap, satellite.
- [~] Center, pan, and zoom controls.
- [~] Node and link tooltips.
- [~] Node selection.
- [~] Export.
- [~] Map-tab persistence for selected layers.
- [~] Sample-data color remapping on Map.
- [~] Sample-data timeline behavior on Map.

These remain useful for exploratory coverage, but they are not currently part of the maintained `journeys` run and should not be treated as the main regression safety net.

## Highest-Value Next Gaps

- [ ] Migration of the remaining lower-priority Map controls out of the old sample-data spec and into maintained journeys.

If we later need exact style-file coverage on uploaded Map data, that is a narrower follow-up than the broader uploaded-data color-mapping gap that is now covered.

## Notes

- Map is Leaflet-based, not Cytoscape-based, so assertions should target Leaflet layers and backing Map state.
- Avoid relying on internet-backed basemap tiles for correctness.
- The first maintained uploaded-data Map journey is `cypress/e2e/journeys/flows/map-zipcode-threshold.cy.ts`.
- The older broad Map control spec is still `cypress/e2e/view-state/map-view.cy.ts`.
- Direct file launch with File Settings default view = `Map` is currently tracked as a bug in `docs/map-view-cypress-bug-log.csv`.
