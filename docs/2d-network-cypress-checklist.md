# 2D Network Cypress E2E Checklist

Current on `cypressTesting` as of 2026-03-13.

Companion QA tracker: `docs/2d-network-cypress-qa-tracker.csv`

Companion bug log: `docs/2d-network-cypress-bug-log.csv`

Architecture reference: `docs/cypress-architecture.md`

Update this checklist, the QA tracker, and the bug log together when coverage or known product behavior changes.

## Purpose

This checklist is the target end-to-end coverage for the 2D Network using Cypress journeys.

Use it to track three things:

- `[x]` Covered by a current Cypress flow on uploaded data.
- `[ ]` Missing or only partially covered and still needs a dedicated journey.
- `Fixture gap` means the product path exists, but the repo does not yet have the right small fixture to test it well.

The preferred pattern for every item below is:

- load real fixture files through the Files view
- launch into 2D Network
- drive General Settings or 2D Settings through the UI
- assert visible DOM stats and rendered Cytoscape state
- use `observed` vs `intended` expectations when current behavior is known to differ from product intent

Maintained suite structure:

- `cypress/e2e/ingestion/`
  - maintained file upload and file settings coverage
- `cypress/e2e/journeys/flows/`
  - uploaded-data 2D end-to-end behavior
- `cypress/e2e/view-state/`
  - sample-data or seeded 2D control mechanics
- `cypress/e2e/legacy-disabled/`
  - retired or fixture-broken specs excluded from the maintained run

## 1. Load To 2D Baseline Matrix

- [x] Distance edgelist -> launch -> 2D smoke.
- [x] Distance matrix -> launch -> 2D smoke.
- [x] FASTA -> launch -> 2D smoke.
- [x] Node list + link list -> launch -> 2D smoke.
- [x] Style node list + link list -> launch -> 2D smoke.
- [x] Sequence node list -> launch -> 2D smoke.
- [x] Newick -> launch -> 2D smoke.
- [x] Sequence node list + epi link list mixed-origin smoke.
- [ ] Large dataset load smoke for 2D stability and counts sanity.

## 2. General Settings: Filtering

- [x] Threshold change updates visible links on a grouped TN93 network.
- [x] Nearest Neighbor reduces visible links on SNP and TN93 inputs.
- [x] Minimum Cluster Size hides smaller clusters and updates nodes, links, cluster count, and singleton count.
- [x] Reveal Everything restores nodes and links after cluster filtering.
- [x] Nearest Neighbor shows the epsilon control.
- [x] Changing epsilon adds links back in a controlled way after Nearest Neighbor.
- [x] Mixed-origin Nearest Neighbor shows the confirmation modal.
- [x] Mixed-origin Nearest Neighbor cancel path leaves counts unchanged.
- [x] Mixed-origin Nearest Neighbor confirm path preserves non-distance links correctly.
- [ ] Post-launch Distance Metric switch on sequence-capable inputs updates counts coherently.
- [x] Threshold change while cluster minimum is greater than `1` does not unexpectedly reset cluster filtering.
- [x] Threshold sparkline drag path is exercised, not only direct input typing.
- [ ] Filtering still works correctly after loading multiple file origins that merge onto the same links.
- [ ] Contract coverage exists for any known observed-vs-intended filtering deviations.

## 3. General Settings: Styling

- [x] Apply style file from General Settings.
- [x] Node color variable from style renders correctly in Cytoscape.
- [x] Node symbol variable from style renders correctly in Cytoscape.
- [x] Node size variable from style renders correctly in Cytoscape.
- [x] Link color variable from style renders correctly in Cytoscape.
- [x] Expected style tables open after applying style.
- [x] Background color change updates the 2D canvas.
- [x] Selected color change updates rendered selected-node styling.
- [x] Style remains correct after threshold filtering changes.
- [x] Style remains correct after Minimum Cluster Size filtering.
- [x] Style remains correct after grouping is turned on.

## 4. 2D Settings: Nodes

- [ ] Node label variable on uploaded profile data.
- [ ] Node label size on uploaded profile data.
- [ ] Node label orientation on uploaded profile data.
- [ ] Node tooltip contents on uploaded profile data.
- [ ] Node shape by variable without a style file.
- [ ] Node symbol table show/hide from the 2D settings pane.
- [ ] Node size by variable without a style file.
- [ ] Node min and max size controls when sizing by variable.
- [ ] Node fixed size control when not sizing by variable.
- [ ] Node border width control on uploaded profile data.

## 5. 2D Settings: Links

- [x] Link label variable can be set to distance in the journey helpers.
- [x] Link label variable flow has its own dedicated uploaded-data journey.
- [x] Link label decimal length on TN93 data.
- [x] Link label decimal length on SNP data.
- [ ] Link tooltip contents on uploaded profile data.
- [ ] Link width fixed control on uploaded profile data.
- [x] Link width by variable on uploaded profile data.
- [x] Link width reciprocal toggle on uploaded profile data.
- [ ] Link min and max width controls when sizing by variable.
- [ ] Link transparency control on uploaded profile data.
- [x] Link length changes layout when nodes are not pinned.
- [ ] Link arrows show correctly for directed edges.
- [ ] Bidirectional arrows show correctly for bidirectional directed edges.

## 6. 2D Settings: Network And Layout

- [ ] Gridlines toggle on uploaded profile data.
- [ ] Neighbor highlight toggle on uploaded profile data.
- [x] Pin All disables Recalculate Layout.
- [x] Pin All prevents link-length relayout.
- [x] Recalculate Layout changes positions when nodes are not pinned.
- [ ] Dragging a node updates both rendered position and backing model on uploaded profile data.

## 7. 2D Settings: Grouping

- [x] Group by Cluster basic flow.
- [x] Group by Subtype flow.
- [x] Show group colors.
- [x] Show group labels.
- [x] Change subtype polygon colors and confirm rendered polygons change.
- [x] Threshold drop can be checked while polygons remain intact.
- [ ] Group label size on uploaded grouped data.
- [ ] Group label orientation on uploaded grouped data.
- [ ] Grouping combined with Minimum Cluster Size filtering.
- [ ] Grouping combined with Reveal Everything.
- [x] Grouping combined with style application.

## 8. Cross-Feature Combination Journeys

- [ ] Sequence-derived TN93 network -> group by subtype -> change threshold -> change group colors -> verify polygons and counts.
- [x] Style dataset -> apply style -> change Minimum Cluster Size -> verify styling and tables still match visible nodes and links.
- [ ] Style dataset -> apply style -> open 2D settings -> change node label and tooltip -> verify style and labels coexist.
- [ ] Mixed-origin dataset -> threshold change -> Nearest Neighbor -> reveal -> verify counts and origins remain correct.
- [ ] Newick dataset -> launch 2D -> adjust one 2D link setting -> verify parsed distance links behave correctly.

## 9. Contract Coverage

- [x] Known grouped threshold mismatch is split into observed vs intended expectations.
- [x] Post-launch metric switch intended behavior has contract coverage.
- [ ] Minimum Cluster Size expected behavior has contract coverage.
- [ ] Epsilon expected behavior has contract coverage.
- [ ] Mixed-origin Nearest Neighbor expected behavior has contract coverage.
- [ ] Newick expected launch counts have contract coverage.

## 10. Fixture Gaps To Fill

- Fixture gap: a small directed-link dataset with `directed` and `bidirectional` fields for arrow coverage.
- Fixture gap: a small link dataset with a second numeric link field so `Filter Links on` can be tested beyond `distance`.
## 11. Recommended Build Order

- [x] Add `Minimum Cluster Size -> Reveal Everything` first.
- [x] Add `Nearest Neighbor + epsilon` second.
- [x] Add mixed-origin Nearest Neighbor confirmation third.
- [x] Add link label decimal length and link width-by-variable next.
- [x] Add `Pin All + link length + recalculate layout` after that.
