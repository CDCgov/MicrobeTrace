# Table View Cypress E2E Checklist

Current on `cypressTesting` as of 2026-04-10.

Companion QA tracker: `docs/table-view-cypress-qa-tracker.csv`

Companion bug log: `docs/table-view-cypress-bug-log.csv`

Architecture reference: `docs/cypress-architecture.md`

Update this checklist, the QA tracker, and the bug log together when maintained Table coverage or known Table behavior changes.

## Purpose

This checklist is the target Cypress coverage for the Table view.

Use it to distinguish three states clearly:

- `[x]` Covered by a maintained uploaded-data journey in `cypress/e2e/journeys/flows/`.
- `[~]` Covered only by the retired sample-data Table spec in `cypress/e2e/legacy-disabled/table-plugin.legacy.cy.ts`.
- `[ ]` Missing and still needs a maintained journey.

For maintained Table journeys, prefer this pattern:

- upload real fixture files through Files
- launch the network cleanly, then switch into Table
- assert global stats plus Table DOM state
- cross-check Table row totals against `commonService.session.data`
- avoid fixed sleeps and use retryable row assertions instead

## Maintained Coverage Now

- [x] Uploaded distance-edgelist data can launch, switch to Table, and populate Nodes, Links, and Clusters coherently.
- [x] Uploaded distance-matrix data can launch, switch to Table, and populate Nodes, Links, and Clusters coherently.
- [x] Uploaded FASTA data can launch, switch to Table, and populate Nodes, Links, and Clusters coherently.
- [x] Uploaded node plus link files can launch, switch to Table, and populate Nodes, Links, and Clusters coherently.
- [x] Uploaded sequence node-list data can launch, switch to Table, and populate Nodes, Links, and Clusters coherently.
- [x] Uploaded Newick data can launch, switch to Table, and populate Nodes, Links, and Clusters coherently.
- [x] Larger uploaded node plus link data can still populate Table coherently.
- [x] Uploaded distance-edgelist data can launch directly into Table from File Settings.
- [x] Uploaded distance-matrix data can launch directly into Table from File Settings.
- [x] Uploaded FASTA data can launch directly into Table from File Settings.
- [x] Uploaded node plus link data can launch directly into Table from File Settings.
- [x] Uploaded sequence node-list data can launch directly into Table from File Settings.
- [x] Nodes, Links, and Clusters dataset switching is covered on uploaded data.
- [x] Node-table filtering is covered on uploaded data.
- [x] Link-table filtering is covered on uploaded data.
- [x] String filter operators on node data are covered beyond the default Contains path.
- [x] Numeric filter operators on link and cluster data are covered.
- [x] Cluster-table filtering is covered on uploaded data.
- [x] Clicking a node row updates backing selection state and keeps the selected row at the top after filters clear.
- [x] Link and cluster row clicks are covered as non-selectable contracts.
- [x] Node deselection is covered and restores the original row order.
- [x] Table settings can change the rendered size class on uploaded data.
- [x] Table sorting is covered on uploaded data.
- [x] Table column multiselect show and hide is covered on uploaded data.
- [x] Table column selections persist independently across dataset switches.
- [x] Selecting a node outside Table and then entering Table is covered.
- [x] Rows-per-page `All` is covered through filtering and dataset-switch round-trips.
- [x] Table stays in sync while threshold filtering changes outside the view.
- [x] Dashboard Table panes rehydrate after saved-layout restore and stay synchronized while root filtering changes outside Table.
- [x] Table export writes a current-column CSV file to `cypress/downloads/`.
- [x] Table export writes an all-column XLSX file to `cypress/downloads/`.
- [x] Table export writes filtered rows only when a Table filter is active.
- [x] The remaining CSV All-columns and XLSX Current-columns export combinations are covered.
- [x] Table can open without uploaded data and render the empty-state prompt cleanly.

## Highest-Value Next Gaps

- [x] The previously blocked uploaded Newick direct-launch path now runs in the maintained Table direct-launch smoke matrix.
- [x] The previously blocked per-dataset filter reapplication path now runs in the maintained Table controls journey.
- [ ] No additional high-value Table gaps remain in the current maintained QA tracker.

## Notes

- Maintained Table coverage now includes both the stable `upload -> launch -> 2D -> switch to Table` path and a six-file-type direct-launch smoke matrix, plus dedicated selection, filter/operator, column, paginator, cross-view selection, and open-view refresh journeys.
- Dashboard-specific Table cross-view coverage lives in `cypress/e2e/view-state/dashboard-layout-core.cy.ts` and `cypress/e2e/journeys/flows/dashboard-filtering-propagation-uploaded.cy.ts`.
- Table row totals should be compared against `commonService.session.data.nodes`, `links`, and `clusters`, not only against the currently visible page length.
- Cluster table rows include singleton components, so compare Cluster rows against `session.data.clusters.length`, not `#numberOfDisjointComponents`.
- Table bug rows use `TBG###` IDs so the shared GitHub issue automation does not collide with 2D `BG###` or Map `MBG###` rows.
- The previously blocked launch and filter-persistence paths are now covered in the maintained suite, so the current Table tracker has no remaining open gaps.
