# Waterfall View Cypress E2E Checklist

Current on `cypressTesting` as of 2026-04-10.

Companion QA tracker: `docs/waterfall-view-cypress-qa-tracker.csv`

Companion bug log: `docs/waterfall-view-cypress-bug-log.csv`

Architecture reference: `docs/cypress-architecture.md`

Update this checklist, the QA tracker, and the bug log together when maintained Waterfall coverage or known Waterfall behavior changes.

## Purpose

This checklist is the target Cypress coverage for the Waterfall view.

Use it to distinguish two states clearly:

- `[x]` Covered by a maintained uploaded-data journey in `cypress/e2e/journeys/flows/`.
- `[ ]` Missing and still needs a maintained journey.

For maintained Waterfall journeys, prefer this pattern:

- upload real fixture files through Files
- launch the network cleanly, then switch into Waterfall
- assert global stats plus rendered PrimeNG table rows
- drive the cluster -> node -> link drilldown through real row selection
- treat `commonService` as a cross-check, not the only source of truth

## Maintained Coverage Now

- [x] Uploaded distance edgelist data renders Waterfall cluster rows.
- [x] Uploaded distance matrix data renders Waterfall cluster rows.
- [x] Uploaded FASTA data renders Waterfall cluster rows.
- [x] Uploaded node list + link list data renders Waterfall cluster rows.
- [x] Uploaded sequence node list data renders Waterfall cluster rows.
- [x] Uploaded Newick data renders Waterfall cluster rows.
- [x] Uploaded mixed-origin sequence node list + epi link list data renders Waterfall cluster rows.
- [x] Selecting a cluster row populates the Waterfall node table with the matching cluster members.
- [x] Selecting a node row populates the Waterfall link table with the matching visible peer ids and distances.
- [x] Selecting a link row updates the Waterfall selection state for that visible link.
- [x] Selecting a cluster row populates the Waterfall cluster-detail expansion state with formatted summary metadata.
- [x] Selecting a node row populates the Waterfall node-detail expansion state with uploaded metadata.
- [x] Selecting a link row populates the Waterfall link-detail expansion state with uploaded metadata.
- [x] Waterfall cluster, node, and link detail rows render visible expansion text for the selected row.
- [x] Selecting a different cluster clears stale node/link drilldown state before repopulating the new cluster.
- [x] Selecting a different node clears stale link selection before repopulating the new node's incident links.
- [x] Threshold-only visible-link changes refresh an open Waterfall node/link drilldown.
- [x] Minimum Cluster Size and Reveal Everything refresh open Waterfall cluster rows.
- [x] Deterministic uploaded timeline checkpoints change global stats without changing the Waterfall cluster summary.
- [x] Timeline checkpoint changes do not clear active Waterfall cluster/node/link drilldown, even when the selected graph membership disappears from the timeline-visible graph.
- [x] File Settings can launch uploaded data directly into Waterfall across the maintained upload matrix.
- [x] Opening Waterfall with no uploaded data shows the empty-state prompt instead of empty tables.
- [x] Filtering an open Waterfall down to no visible clusters switches into the empty state, and Reveal Everything restores the view.
- [x] Large uploaded Waterfall data still renders cluster rows and supports representative drilldown without hanging.
- [x] Switching away from Waterfall and back preserves the selected drilldown and visible expansion rows.
- [x] Dashboard Waterfall panes refresh under root filtering and preserve drilldown while dashboard timeline changes only the target views.
- [x] Saved uploaded sessions can be reopened and Waterfall can rebuild the same drilldown from restored session data.
- [x] Reloaded `.microbetrace` sessions preserve Waterfall as the saved `default-view` and reopen directly into Waterfall.

## Notes

- Waterfall is table-driven, not Cytoscape- or Leaflet-driven, so assertions should target rendered PrimeNG tables plus the relevant selection state.
- The maintained uploaded-data Waterfall specs are `cypress/e2e/journeys/flows/waterfall-load-uploaded.cy.ts`, `cypress/e2e/journeys/flows/waterfall-drilldown-uploaded.cy.ts`, `cypress/e2e/journeys/flows/waterfall-details-uploaded.cy.ts`, `cypress/e2e/journeys/flows/waterfall-refresh-uploaded.cy.ts`, `cypress/e2e/journeys/flows/waterfall-direct-launch-uploaded.cy.ts`, `cypress/e2e/journeys/flows/waterfall-empty-state.cy.ts`, `cypress/e2e/journeys/flows/waterfall-large-uploaded.cy.ts`, `cypress/e2e/journeys/flows/waterfall-tab-persistence-uploaded.cy.ts`, and `cypress/e2e/journeys/flows/waterfall-session-roundtrip.cy.ts`.
- Dashboard-specific Waterfall cross-view coverage lives in `cypress/e2e/journeys/flows/dashboard-filtering-propagation-uploaded.cy.ts` and `cypress/e2e/journeys/flows/dashboard-timeline-propagation-uploaded.cy.ts`.
- `waterfall-refresh-uploaded.cy.ts` now covers threshold-only link refresh, Minimum Cluster Size / Reveal Everything refresh, Waterfall timeline-isolation checkpoints, and Waterfall drilldown persistence while timeline changes the graph in Bubble, Map, and 2D.
- Waterfall now uses PrimeNG 21's `expandedrow` template contract, component-owned expanded-row keys, and selection-driven expansion, so visible row-expansion rendering is part of the maintained details suite.
- Direct Waterfall launches now release the shared processing modal through Waterfall's own rendered-view signal, matching the other non-2D launchable views.
- `waterfall-empty-state.cy.ts` covers both the clean no-data prompt and the active filter-to-empty transition/recovery path.
- `waterfall-tab-persistence-uploaded.cy.ts` keeps Waterfall honest when users switch away to another view and return mid-drilldown.
- `waterfall-session-roundtrip.cy.ts` now waits on restored session state, then proves both Waterfall drilldown rebuild and saved Waterfall default-view restore on reload.
- Waterfall bug rows use `WBG###` IDs so the shared GitHub issue automation does not collide with 2D `BG###`, Map `MBG###`, or Table `TBG###`.
