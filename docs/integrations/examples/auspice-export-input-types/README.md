# Full-feature Auspice export input examples

Each example below is a **dataset bundle**, not just one file. The bundles share eight synthetic sample IDs (`A` through `H`), rich node metadata, and one style file so every source path exercises all exporter features that the source type can represent. No file contains real or sensitive data.

## Dataset bundles

| Source type | Files to load together | File type selections |
| --- | --- | --- |
| Newick | `synthetic-tree.nwk` + `synthetic-nodes.csv` | Newick + Node |
| Explicitly dated Newick | [`../dated-newick/dated-tree.nwk`](../dated-newick/dated-tree.nwk) + [`../dated-newick/dated-tree-nodes.csv`](../dated-newick/dated-tree-nodes.csv) | Newick + Node; see the [dated fixture instructions](../dated-newick/README.md) |
| FASTA | `synthetic-sequences.fasta` + `synthetic-nodes.csv` | FASTA + Node |
| Node list | `synthetic-nodes.csv` | Node; choose `_id` for IDs and `seq` for sequences |
| Distance matrix | `synthetic-distance-matrix.csv` + `synthetic-nodes.csv` | Matrix + Node |
| Distance links | `synthetic-distance-links.csv` + `synthetic-nodes.csv` | Link + Node; choose `source`, `target`, and `distance` |

After launching any bundle, load `synthetic-full-feature.style` from **Settings > Global Settings > Load existing MicrobeTrace style file**. Open **Phylogenetic Tree**, select **Save > Auspice JSON**, and initially keep the default full-tree scope and all metadata, coloring, and filter fields selected.

## Features covered by every bundle

- eight exact sample IDs and a complete tree, either supplied or computed;
- categorical (`risk_group`), ordinal (`severity_rank`), continuous (`score`), boolean (`selected` and `visible`), temporal (`valid_date`), and intentionally non-temporal (`invalid_date`) metadata;
- saved categorical and ordinal palettes plus friendly legend labels;
- country, state/division, county, ZIP code, tract, and site map resolutions;
- shared-coordinate grouping: `A` and `B` must share the single `Atlanta Clinic` site deme;
- direct numeric and compass-suffixed coordinates;
- partial map coverage: malformed `F`, out-of-range `G`, and incomplete `H` coordinates remain unmapped without blocking the other tips;
- deterministic remapping of reserved or unsafe fields (`div`, `none`, `constructor`, and `field with spaces`);
- current `selected` and `visible` state, including an initially hidden `H`;
- full-tree and visible-tree scope, metadata/coloring/filter selection, deterministic names, cumulative divergence, filename handling, and raw-sequence omission;
- tree-only fallback by repeating the source load without `synthetic-nodes.csv`.

The matrix and distance-link files contain the complete pairwise SNP distances calculated from the sequences in the node and FASTA files. This makes topology and distance behavior directly comparable across all five bundles.

## Source-specific features

Some exporter features require information that cannot exist in every raw input format. These are tested with the matching source rather than fabricated:

| Feature | Dataset |
| --- | --- |
| Original topology, branch orientation, and meaningful internal branch labels | Newick bundle |
| Explicit dates on every Newick node without ancestral inference | [`../dated-newick/`](../dated-newick/) |
| Bootstrap calculation from aligned sequences | FASTA and node-list bundles |
| Matrix-derived tree | Distance-matrix bundle |
| Complete pairwise-link-derived tree | Distance-link bundle |
| Preserved internal-node scalar attributes | [`../../manual-test-data/auspice-export/internal-node-attributes.json`](../../manual-test-data/auspice-export/internal-node-attributes.json) |
| Complete structured ancestral `num_date` values and temporal round trip | [`../microbetrace-auspice-temporal-map.json`](../microbetrace-auspice-temporal-map.json) or [`../dated-newick/`](../dated-newick/) |

MicrobeTrace does not infer ancestral dates. Ordinary Newick, FASTA, node, matrix, and link inputs therefore produce divergence trees even when `valid_date` is available as tip metadata. Structured `num_date` is preserved when an imported Auspice tree or an explicitly dated Newick tree already contains a valid value on every node.

## Expected default export

With the node and style companions loaded, every bundle should export:

- `meta.panels` equal to `["tree", "map"]`;
- `risk_group` as the default coloring with its red/yellow/green scale and legend labels;
- all six geographic resolutions, with `site` as the default map resolution;
- mapped attributes only on `A` through `E` and no geographic attributes on `F` through `H`;
- all eight tips exactly once, non-negative cumulative `div`, and no `seq` field;
- temporal `valid_date`, categorical `invalid_date`, ordinal `severity_rank`, and continuous `score` colorings;
- collision-safe output keys for the deliberately reserved metadata names.

Open the downloaded JSON in Auspice and verify the tree and map render without processing errors. Re-import it into a fresh MicrobeTrace session to check topology, tip order, metadata, and coordinates.
