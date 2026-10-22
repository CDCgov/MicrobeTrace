# Auspice export manual test kit

This directory contains small, synthetic datasets for manually checking the Auspice v2 export feature. No file contains real or sensitive data.

## Coverage map

| Requirement | Dataset | Expected result |
| --- | --- | --- |
| Tree topology, branch order, rotation, rerooting, subtree/full/visible scope, cumulative divergence, internal labels | `rich-tree.nwk` + `rich-nodes.csv` | Eight exact leaf IDs (`A`–`H`), deterministic `NODE_0000000`-style internal names, original labels in `branch_attrs.labels.microbetrace`, and root `div` of `0` |
| Metadata selection, filters, color-by, temporal validation, remapped keys, exclusions | Rich pair + `rich-palette.style` | `valid_date` is temporal; `invalid_date` is categorical; reserved/unsafe fields are renamed; `seq` is absent |
| Categorical palettes, legend labels, ordinal palettes | Rich pair + style | `risk_group` has the three requested colors and friendly legend labels; `severity_rank` is `ordinal` with a numeric three-color scale |
| Grouped and multi-resolution geography | Rich pair + style | Country/state/county/ZIP/tract/site resolutions; A and B share one `Atlanta Clinic` deme; malformed F and unmapped H have no location trait |
| Bootstrap support | Rich pair | After calculating bootstrap values, matching branches have `branch_attrs.labels.bootstrap` and the default branch label is `bootstrap` |
| Imported internal-node attributes and Auspice round trip | `internal-node-attributes.json` | Root and clade scalar attributes survive re-export; leaf map positions and the preferred `site` resolution survive |
| Imported temporal map round trip | `../../examples/microbetrace-auspice-temporal-map.json` | All seven structured `num_date` objects, their confidence intervals and ambiguity metadata, plus three map resolutions survive re-export |
| Computed FASTA tree | `computed-sequences.fasta` | A generated tree exports with all eight IDs and no sequence data |
| Computed node-list tree | `rich-nodes.csv` alone | A generated tree exports with all eight IDs and no sequence data |
| Computed matrix tree | `computed-distance-matrix.csv` | When loaded as a Matrix, a generated tree exports with six exact IDs |
| Ambiguous session IDs | `ambiguous-node-ids.csv` + `ambiguous-node-ids.nwk` | Export is blocked with an error naming the ambiguous alias `ALIAS` |
| Duplicate leaf IDs | `duplicate-tree-tips.nwk` | Export is blocked with an error naming duplicate leaf `A` |
| Invalid branch lengths | `negative-branch.nwk` | Export is blocked with a negative branch-length error if the parser retains the negative internal length; see the fallback below |

## 1. Rich export

1. On the Files screen, add `rich-tree.nwk` as Newick and `rich-nodes.csv` as a node list. If field prompts appear, select `_id` as the node ID and `seq` as the sequence.
2. Launch MicrobeTrace and open **Settings → Global Settings → Load existing MicrobeTrace style file**. Choose `rich-palette.style`.
3. Open **Phylogenetic Tree**, then **Save → Auspice JSON**.
4. Before changing Advanced options, save the default export and parse the downloaded JSON in a text editor.

The default file should:

- be readable, two-space-indented JSON with `version`, `meta`, and `tree`;
- use a `.json` suffix even if it was omitted from the filename box;
- have `meta.panels` equal to `["tree", "map"]`, `distance_measure` equal to `div`, and the current UTC date in `meta.updated`;
- retain all eight leaf names exactly and assign collision-free `NODE_0000000`-style names to internal nodes;
- set root divergence to `0` and make every other `node_attrs.div` cumulative from branch lengths;
- retain `ROOT`, `SOUTH`, `NORTH`, and the four clade labels under `branch_attrs.labels.microbetrace`;
- omit `seq` everywhere and avoid exporting layout/rendering objects;
- expose remapped, deterministic keys whose titles remain `div`, `none`, `constructor`, and `field with spaces`;
- set `display_defaults.color_by` to the exported key for `risk_group`.

In `meta.colorings`, confirm:

- `risk_group` is `categorical`, has the red/yellow/green `scale`, and has the `High priority`, `Medium priority`, and `Low priority` legend labels;
- `severity_rank` is `ordinal`, has numeric scale values `1`, `2`, and `3`, and has the three rank legend labels;
- `valid_date` is `temporal`, including valid leap day `2024-02-29` and supported partial dates;
- `invalid_date` is `categorical`, because its complete date-like values are not real calendar dates;
- there is no `num_date`, and the export does not claim a time-scaled tree.

In geography, confirm:

- `meta.geo_resolutions` includes `country`, `state`, `county`, `zipcode`, `tract`, and `site`;
- the default resolution is `site`;
- A and B both use `Atlanta Clinic`, which appears only once in `site.demes`;
- shared administrative names are grouped rather than duplicated;
- F's `34abc` is rejected as a partial numeric parse and F has no exported geographic trait;
- H has no geographic trait because it lacks coordinates, even though it has location names;
- no network geocoding occurs.

Drop this JSON onto [auspice.us](https://auspice.us) or open it with `auspice view --datasetDir <folder>`. Check tree layout, divergence, color-by values and colors, legend text, filters, map points, and the absence of browser-console errors.

## 2. Advanced field menus

1. Reopen the Auspice JSON tab and expand **Advanced options**.
2. Verify every metadata, coloring, and filter checkbox starts selected, matching the default behavior.
3. Use **Deselect all** in each menu. Metadata deselection should also prevent unavailable dependent coloring/filter selections.
4. Select only `risk_group`, `severity_rank`, and `valid_date` as metadata; select only the desired colorings and filters; export.
5. Confirm `node_attrs`, `meta.colorings`, and `meta.filters` contain only those choices plus mandatory/synthetic attributes such as divergence and selected geography.
6. Use **Select all** and confirm the original default result returns.

## 3. Full versus visible tree and orientation

1. With the rich tree visible, rotate `SOUTH`, reroot on `CD_CLADE`, and record the displayed tip order.
2. Select a subtree, then choose **Full tree** in Advanced options and export. All A–H tips must remain; selecting a subtree must not silently switch this choice to visible.
3. Export again with **Visible tree**. Only tips in the currently displayed subtree should remain.
4. Apply an ordinary metadata filter without selecting a subtree. Filtered tips should remain in a full-tree export and carry their current `visible` attribute.
5. Open both exports in Auspice. The serialized child order should reproduce the current MicrobeTrace orientation after Auspice's traversal behavior.

## 4. Bootstrap labels

1. Load the rich pair so the sequences in `rich-nodes.csv` are available.
2. In Phylogenetic Tree settings, run bootstrap calculation (a low replicate count is sufficient for this manual check).
3. Export without changing the tree. Matching splits should carry `branch_attrs.labels.bootstrap`, and `meta.display_defaults.branch_label` should be `bootstrap`.
4. Reroot or rotate and export again. Rotation must not lose support; only genuinely changed/unmatched splits may omit it.

## 5. Imported Auspice and internal-node attributes

1. Load `internal-node-attributes.json` as Auspice and launch Phylogenetic Tree.
2. Export it immediately, then export after rotation and after selecting a subtree.
3. Confirm internal nodes receive deterministic `NODE_...` names while the scalar `clade_score`, `internal_note`, and `root_note` values remain on their corresponding internal splits.
4. Confirm original meaningful labels are retained as branch labels, leaf IDs remain I1–I4, `site` remains the preferred map resolution, and North/South coordinates reappear after re-importing the new file.

## 6. Temporal map round trip

1. Load `../../examples/microbetrace-auspice-temporal-map.json` as Auspice and launch MicrobeTrace.
2. Open **Phylogenetic Tree**, then **Save > Auspice JSON**, and save the default full-tree export.
3. Open the result in Auspice. Confirm both tree and map panels appear, `site` is the default map resolution, and country, division, and site can be selected.
4. Inspect the exported JSON. All seven nodes must have `node_attrs.num_date`; the two inferred tip dates must retain `raw_value`, `inferred`, and `confidence`; `microbetrace_num_date` and `__auspice_num_date` must not appear.
5. Import the result into a fresh MicrobeTrace session and export it again. The seven structured `num_date` objects and three geographic resolutions must remain unchanged.

The fixture is entirely synthetic. `sample_c` and `sample_d` intentionally share one site coordinate so the map demonstrates a grouped deme.

## 7. Computed tree sources

Run each case in a fresh MicrobeTrace session, open Phylogenetic Tree, and export:

1. Load `computed-sequences.fasta` as FASTA.
2. Load `rich-nodes.csv` alone as a node list, choosing `_id` and `seq` when prompted.
3. Load `computed-distance-matrix.csv`, explicitly choosing **Matrix** as its type if auto-detection chooses CSV/node list.

Each export should contain the source IDs exactly once, valid non-negative cumulative divergence, and no raw sequence. Re-import each exported JSON into MicrobeTrace and verify Phylogenetic Tree renders without errors.

## 8. Validation failures

Run each case in a fresh session. A failed export must show an inline actionable error and must not download a partial file.

1. Load `ambiguous-node-ids.csv` with `ambiguous-node-ids.nwk`. Export should identify `ALIAS` as matching more than one session node.
2. Load `duplicate-tree-tips.nwk`. Export should identify duplicate leaf name `A`.
3. Load `negative-branch.nwk`. If the Newick parser preserves the negative internal length, export should reject it. If the loader normalizes it, use the controlled fallback below.
4. For missing/renamed leaf compatibility, load the rich pair, then use the browser console to rename only the session record before export:

   ```javascript
   const node = window.commonService.session.data.nodes.find(candidate => candidate._id === 'H');
   node._id = 'H-renamed';
   node.id = 'H-renamed';
   ```

   Export should report that tree leaf `H` has no exact session-node match.
5. For a guaranteed invalid branch fallback, load the rich pair and use the browser console:

   ```javascript
   window.commonService.visuals.phylogenetic.tree.data.children[0].length = -0.25;
   ```

   Export should reject the negative length. Repeat with `Number.NaN` to confirm non-finite lengths are rejected.

## 9. Privacy and deliberate omissions

Before sharing any export, inspect it as ordinary JSON. Scalar metadata selected in Advanced options is included and can be identifying. Raw sequences, branch mutations, genome annotations, root sequences, entropy/frequency data, render coordinates, and original Auspice metadata that MicrobeTrace no longer represents are deliberately omitted. Round trips preserve normalized MicrobeTrace meaning, not the original bytes or every Auspice extension.
