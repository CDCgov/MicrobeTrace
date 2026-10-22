# Export a MicrobeTrace tree to Auspice

MicrobeTrace can save the current Phylogenetic Tree as one Auspice v2 JSON file. The export is generated and downloaded in the browser. MicrobeTrace does not upload the file to Nextstrain or any other service.

## Export and open the file

1. Open the **Phylogenetic Tree** view.
2. Reroot, rotate, flip, or show a subtree if needed.
3. Select **Export Screen**, then **Auspice JSON**.
4. To export only the tree or subtree currently shown, open **Advanced options** and select **Visible tree**. Leave **Full tree** selected to export the complete saved tree.
5. Review the filename and select **Save Auspice JSON**. MicrobeTrace adds `.json` when it is missing.
6. Open the file in one of these ways:
   - Visit [auspice.us](https://auspice.us), choose **Drag & drop files**, and drop the JSON file.
   - Install Auspice and run `auspice view --datasetDir <directory>`, following the [Auspice local-view instructions](https://docs.nextstrain.org/projects/auspice/en/stable/introduction/how-to-run.html).

The collapsed **Advanced options** section includes a tree-scope choice and separate checkbox menus for exported node metadata, Auspice color-by choices, and Auspice filters. **Full tree** is selected by default. It exports the complete topology saved immediately before entering a subtree view. Choose **Visible tree** to export the topology currently shown, including a selected subtree and its normalized root. Ordinary filters do not prune either choice; the `visible` value remains available as node metadata. Every eligible field is selected in all three field menus by default. Each menu has a **Select all** or **Deselect all** control. Removing a field from node metadata also removes it from the color-by and filter menus because those controls require the corresponding node attribute.

Do not upload identifiable, restricted, or otherwise sensitive records to a public service unless your data-use rules allow it. The downloaded file can include every safe scalar metadata field on exported tips and identifiable internal nodes, even fields that are not currently displayed. Use a local `auspice view` server when public upload is not appropriate.

## What is exported

The single JSON file follows the Auspice v2 `version`, `meta`, and `tree` structure. It includes:

- the complete tree by default, or the currently displayed tree/subtree when **Visible tree** is selected, while preserving the saved branch orientation and cumulative branch-length divergence;
- exact tip IDs and deterministic internal node names;
- safe scalar node metadata, including retained metadata on uniquely identifiable internal nodes, plus tip identity, cluster, degree, selected/visible state, and valid latitude/longitude values when present;
- the current node color-by field when that field is exportable;
- current resolved tip coordinates without external geocoding; when exact coordinates are absent, export also resolves configured country, state, county, ZIP code, and census-tract values against MicrobeTrace's bundled map data, then groups tips at identical coordinates into one location and uses meaningful site/location values as deme names when available;
- separate country, state, county, ZIP code, census tract, and site resolutions when the corresponding configured or conventionally named fields are available; named administrative demes use the spherical centroid of their mapped tips;
- saved MicrobeTrace categorical value colors as Auspice coloring scales, plus custom key-table legend labels when available;
- stored bootstrap support when its split still matches a current branch;
- structured `num_date` values when an imported Auspice tree or explicitly dated Newick tree provides a complete, valid value for every exported node, including confidence and ambiguity metadata retained from Auspice; and
- categorical, ordinal, continuous, boolean, and supported date colorings and filters. Numeric fields with a saved discrete MicrobeTrace palette are exported as ordinal rather than as an interpolated continuous scale.

The title uses a partner-provided dataset name when one is available. Otherwise it uses the source filename without its extension. Auspice chooses the palette and visual presentation.

## Divergence and temporal behavior

MicrobeTrace always exports branch distance as cumulative `div` values with root divergence set to zero. It does not infer dates for internal ancestors. When an imported Auspice dataset has complete `num_date` values, or a Newick tree explicitly annotates every node with `[&num_date=<decimal-year>]`, those supplied values are preserved and the Auspice time-tree view is selected by default. Divergence remains available. Small date reversals already present in the source are retained rather than silently changing source data. Incomplete or malformed temporal trees fall back to divergence-only export. Date-like tip fields can still appear as temporal colorings when every value is a real calendar date or a supported partial date such as `2026-02-XX` or `2026-XX-XX`; impossible dates remain categorical metadata.

The export deliberately omits:

- raw sequences and sequence-processing fields;
- tree-structure bookkeeping fields such as branch length, depth, height, parents, and children (branch lengths are represented by `div` instead);
- arrays, objects, nulls, and non-finite numbers;
- force-layout coordinates, jitter values, and graphical objects;
- branch mutations, root sequences, genome annotations, entropy, and frequency data; and
- original Auspice metadata that MicrobeTrace no longer retains with the same meaning.

Export stops with an inline error instead of changing invalid data when a tip ID is missing or duplicated, a session-node ID identifies multiple nodes, a tree tip has no exact session-node match, or a branch length is negative or non-finite. Coordinate strings must be entirely numeric with an optional compatible compass suffix; partially numeric values such as `34abc`, invalid compass axes, and out-of-range coordinates are left unmapped.

## Round-trip limitations

An exported file can be imported into MicrobeTrace again, including its tree orientation, scalar tip fields, retained scalar fields on identifiable internal nodes, complete valid `num_date` trees from Auspice or explicitly dated Newick, and tip coordinates from the default geographic resolution. It is a new representation of MicrobeTrace's normalized current state, not a byte-for-byte copy of an originally imported dataset. Pixel-level styling, inferred ancestral geography or dates, original internal node identifiers, original palettes, mutations, and unsupported Auspice sidecar data are not reconstructed.

Auspice displays sibling arrays in reverse traversal order compared with MicrobeTrace. The JSON therefore stores sibling arrays in the opposite order so that the visible tree orientation—including branch rotations—matches when the file is opened in Auspice. MicrobeTrace applies the same convention when an Auspice file is imported.

The implementation is checked against the official [Auspice v2 schema](https://github.com/nextstrain/augur/blob/master/augur/data/schema-export-v2.json). Release candidates should also pass `augur validate export-v2 <file.json>` and be opened in the release-target versions of auspice.us and `auspice view`.
