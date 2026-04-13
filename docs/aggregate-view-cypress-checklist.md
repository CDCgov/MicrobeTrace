# Aggregate View Cypress E2E Checklist

Current on `cypressTesting` as of 2026-04-10.

Companion QA tracker: `docs/aggregate-view-cypress-qa-tracker.csv`

Companion bug log: `docs/aggregate-view-cypress-bug-log.csv`

Architecture reference: `docs/cypress-architecture.md`

Update this checklist, the QA tracker, and the bug log together when maintained Aggregate coverage or known Aggregate behavior changes.

## Purpose

This checklist is the target Cypress coverage for the Aggregate view.

Use it to distinguish three states clearly:

- `[x]` Covered by a maintained Cypress spec in `cypress/e2e/journeys/flows/` or `cypress/e2e/view-state/`.
- `[ ]` Missing and still needs maintained coverage.
- `Blocked by bug` means the product path is valuable but should not be normalized into the smoke suite until the linked bug is fixed.

For maintained Aggregate coverage, prefer this pattern:

- upload real fixture files through Files when the behavior depends on file origin or uploaded fields
- launch into 2D first, then switch into Aggregate
- drive Aggregate Settings or Aggregate Export through the real UI
- assert rendered PrimeNG table rows against the visible node, link, or cluster model state
- validate exported artifacts directly from `cypress/downloads/`

## Maintained Coverage Now

- [x] Uploaded distance edgelists can launch, switch to Aggregate, and summarize visible data there.
- [x] Uploaded distance matrices can launch, switch to Aggregate, and summarize visible data there.
- [x] Uploaded FASTA inputs can launch, switch to Aggregate, and summarize visible data there.
- [x] Uploaded node + link data can aggregate by a clean uploaded node categorical field.
- [x] Uploaded sequence node lists can aggregate by Subtype.
- [x] Uploaded Newick inputs can launch, switch to Aggregate, and summarize visible data there.
- [x] Sample-data Aggregate settings can switch the first table field, add a second table, and delete it again.
- [x] Sample-data Aggregate settings cover the default `Add Table` path to `Node-selected`.
- [x] Sample-data Aggregate tables sort correctly by group, count, and percent.
- [x] Sample-data Aggregate settings can reorder tables through the real OrderList controls and keep rendered order aligned.
- [x] Sample-data Aggregate survives GoldenLayout hide, show, and resize events without losing table layout.
- [x] Uploaded clustered data can add `Cluster-*` Aggregate tables and render cluster headers and rows correctly across more than one cluster field.
- [x] Uploaded Aggregate normalizes sparse categorical node fields such as `Profession` into stable visible buckets.
- [x] Uploaded Aggregate settings keep internal node/link fields out of the user-facing field picker.
- [x] Open Aggregate tables refresh after reclustering and after non-cluster node/link filtering changes.
- [x] Timeline checkpoints change global stats without changing open Aggregate node or link tables.
- [x] Uploaded Aggregate export writes JSON, XLSX, CSV zip, and PDF artifacts.
- [x] Reordered Aggregate tables, including `Cluster-*` tables, export in the same order shown in the UI.
- [x] Large uploaded networks can open Aggregate and keep Aggregate Export reachable.

## Highest-Value Next Gaps

- No currently open high-value Aggregate gaps remain in the maintained Cypress suite.

## Notes

- Aggregate currently opens with its settings dialog visible on first view load; the maintained view-state spec covers that real behavior rather than forcing a different startup path.
- Aggregate smoke still keeps the clean uploaded categorical field (`Node type`) path, and the separate `Profession` regression now runs as maintained coverage as well.
- The File Settings default-view control does not currently expose Aggregate as a launch target, so direct-launch Aggregate coverage is not tracked as a maintained test case right now.
- The maintained reorder case uses PrimeNG OrderList move controls because they are stable in Cypress; pointer drag-drop can be added later as a lower-value library-behavior case if needed.
- Timeline isolation coverage for non-target views lives in `cypress/e2e/journeys/flows/timeline-non-target-view-isolation-uploaded.cy.ts`.
- Aggregate bug rows use `ABG###` IDs so the shared GitHub issue automation does not collide with the existing surface-specific bug trackers.
