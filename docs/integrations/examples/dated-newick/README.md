# Explicitly dated Newick export fixture

This synthetic bundle tests Auspice export from a Newick tree that already contains dates for every terminal and internal node. It contains no real or sensitive data.

## Load the bundle

1. Load `dated-tree.nwk` as **Newick**.
2. Load `dated-tree-nodes.csv` as **Node**, using `_id` as the node identifier.
3. Load `dated-tree.style` from **Settings > Global Settings > Load existing MicrobeTrace style file**.
4. Open **Phylogenetic Tree** and select **Save > Auspice JSON**.

## Dated-Newick convention under test

Each node has a bracket annotation immediately after its branch length:

```text
A:2.0[&num_date=2024.0]
```

`num_date` is an absolute decimal year. The branch length is elapsed time in years from the annotated parent to that node. The root is anchored at `2020.0`. Thus every branch satisfies:

```text
child num_date - parent num_date = child branch length
```

`expected-node-dates.csv` lists all 15 expected nodes, parents, dates, and branch lengths. The dates are supplied by the input and must be preserved; no ancestral-date inference is needed.

## Expected date export

A compatible export should:

- contain `node_attrs.num_date.value` on all 15 nodes;
- preserve the exact values in `expected-node-dates.csv`;
- include the `num_date` temporal coloring;
- allow `display_defaults.distance_measure` to be `num_date`;
- expose Auspice's **TIME** scale and date-range controls;
- retain `valid_date` independently as tip-level temporal metadata.

MicrobeTrace recognizes these explicit bracket annotations, removes them before sending the topology to its legacy Newick renderer, and retains their values on a parallel attribute tree for Auspice export. It does not estimate or replace any dates.

## Other export coverage

The companion node and style files also cover:

- categorical, ordinal, continuous, boolean, temporal, and invalid-date metadata;
- saved palettes and labels, with `valid_date` selected as the initial coloring;
- country, state/division, county, ZIP code, tract, and exact-site geography;
- shared coordinates, compass coordinates, partial map coverage, and invalid coordinates;
- reserved and unsafe metadata key remapping;
- selected/visible state, full versus visible tree scope, sequence omission, and filename behavior.

After support is implemented, open the result in Auspice and verify that both **TIME** and **DIVERGENCE** are available, the map renders, and all eight tips remain present exactly once.

The focused Cypress contract is `cypress/e2e/journeys/flows/phylogenetic-dated-newick-export.cy.ts`.
