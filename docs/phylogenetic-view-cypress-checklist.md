# Phylogenetic Tree Cypress E2E Checklist

Current on `cypressTesting` as of 2026-04-04.

Companion QA tracker: `docs/phylogenetic-view-cypress-qa-tracker.csv`

Companion bug log: `docs/phylogenetic-view-cypress-bug-log.csv`

Architecture reference: `docs/cypress-architecture.md`

Update this checklist, the QA tracker, and the bug log together when maintained phylogenetic coverage or known tree behavior changes.

## Purpose

This checklist is the target Cypress coverage for the Phylogenetic Tree view.

Use it to distinguish three states clearly:

- `[x]` Covered by a maintained uploaded-data journey in `cypress/e2e/journeys/flows/`.
- `[~]` Covered only by the broader sample-data tree spec in `cypress/e2e/view-state/phylogenetic-view.cy.ts`.
- `[ ]` Missing and still needs a maintained journey.

For maintained tree journeys, prefer this pattern:

- upload real fixture files through Files
- launch cleanly, then switch into `Phylogenetic Tree` unless a direct-launch path is explicitly under test
- assert global stats plus rendered SVG state under `#phylocanvas svg`
- use `window.commonService.visuals.phylogenetic.tree` only as a cross-check for leaf counts or exported Newick text

## Maintained Coverage Now

- [x] Uploaded SNP distance edgelists can launch cleanly, switch into Phylogenetic Tree, and render a non-empty SVG tree.
- [x] Uploaded distance matrices can launch cleanly, switch into Phylogenetic Tree, and render a non-empty SVG tree.
- [x] Uploaded FASTA files can launch cleanly, switch into Phylogenetic Tree, and render a non-empty SVG tree.
- [x] Uploaded sequence node lists can launch cleanly, switch into Phylogenetic Tree, and render a non-empty SVG tree.
- [x] Uploaded Newick files can launch or switch into Phylogenetic Tree and render a non-empty SVG tree.
- [x] Computed-tree uploads can also launch directly into `Phylogenetic Tree` when File Settings default view is set to the tree.
- [x] Maintained uploaded-data tree smoke asserts rendered leaf counts against loaded node counts where deterministic expectations exist.
- [x] Uploaded tree export writes a non-empty PNG file to downloads.
- [x] Uploaded tree export writes a non-empty JPEG file to downloads.
- [x] Uploaded tree export writes an SVG file to downloads.
- [x] Uploaded tree export writes a Newick text file that matches the currently rendered tree state.
- [x] Uploaded tree settings can change layout, mode, type, and leaf-label visibility on the maintained Newick journey.
- [x] Uploaded Newick tree settings can change horizontal and vertical stretch and update rendered geometry.
- [x] Uploaded Newick tree settings can show branch-node labels and change branch-node-label font size.
- [x] Uploaded Newick tree can recenter through the Center Screen toolbar action after viewport movement.
- [x] Uploaded Newick tree reflects external `node-selected` events and ctrl-click multi-selection in rendered leaf styling.
- [x] Computed trees derived from matrix, FASTA, and sequence-node-list uploads can export PNG, SVG, and Newick artifacts.
- [x] Uploaded Newick tree settings persist after closing and reopening the Phylogenetic Tree tab.
- [x] Uploaded Newick tree settings persist through save-and-reload session round-trip.
- [x] Uploaded metadata-backed trees cover fixed node color, uploaded field color-by, and threshold-driven cluster recoloring on the rendered tree.
- [x] Uploaded metadata-backed trees cover fixed branch color and configured selected-color styling on the rendered tree.
- [x] Uploaded metadata-backed trees cover leaf label field and size, leaf tooltip visibility and field, and leaf-node visibility and sizing.
- [x] Uploaded metadata-backed trees cover branch distance labels, branch nodes, branch size, and single-click leaf selection.
- [x] Uploaded style files are reflected on the active tree for layout, mode, type, colors, and branch-distance styling.
- [x] Uploaded Newick trees cover context-menu actions for reroot, rotate, flip, subtree view, and Restore Full Tree.

## Legacy-Only Coverage

- [~] No tree-specific behavior remains legacy-only for the current maintained phylogenetic scope.

## Highest-Value Next Gaps

- No open maintained uploaded-data gaps remain for the current Phylogenetic Tree scope.

## Notes

- Phylogenetic Tree is D3 + SVG, not Cytoscape or Leaflet.
- The maintained uploaded-data tree smoke lives in `cypress/e2e/journeys/flows/upload-launch-phylo.cy.ts` and currently uses the stable launch-then-switch path.
- The maintained direct-launch regression smoke is `cypress/e2e/journeys/flows/upload-launch-phylo-direct.cy.ts`.
- The maintained uploaded-data tree export/settings journey is `cypress/e2e/journeys/flows/phylogenetic-view-export.cy.ts`.
- The maintained uploaded-data tree controls and persistence journey is `cypress/e2e/journeys/flows/phylogenetic-controls-uploaded.cy.ts`.
- The maintained computed-tree export journey is `cypress/e2e/journeys/flows/phylogenetic-computed-export.cy.ts`.
- The maintained tree session round-trip journey is `cypress/e2e/journeys/flows/phylogenetic-session-roundtrip.cy.ts`.
- The maintained metadata-backed tree controls and style-file journey is `cypress/e2e/journeys/flows/phylogenetic-metadata-uploaded.cy.ts`.
- The maintained uploaded Newick context-menu journey is `cypress/e2e/journeys/flows/phylogenetic-context-menu-uploaded.cy.ts`.
- The broader sample-data mechanics spec remains `cypress/e2e/view-state/phylogenetic-view.cy.ts`.
- Phylogenetic bug rows use `PBG###` IDs so bug-tracker issue titles do not collide with 2D `BG###` or Map `MBG###` rows.
- `PBG001` was fixed on 2026-04-04; direct file launch with File Settings default view = `Phylogenetic Tree` is now covered for non-Newick computed-tree inputs.
