# Issue 1728: Node Coverage Test Data

Upload the files for one scenario at a time from the Files view. For CSV files,
confirm the listed file type and field mappings before launching.

## 1. Mismatch in both directions

Files:

- `01-mismatch-nodes.csv` as Node List, ID = `id`
- `01-mismatch-links.csv` as Link List, Source = `source`, Target = `target`

Expected warning:

- Missing node data (1): `D`
- Missing link information (1): `C`

Cancel should leave both files loaded and the current network unchanged. Continue
should launch a network containing the identifiers represented by ingestion.

## 2. Fully matched node and link files

Files:

- `02-matched-nodes.csv` as Node List, ID = `id`
- `02-matched-links.csv` as Link List, Source = `source`, Target = `target`

Expected: no coverage warning.

## 3. Topology-only link file

File:

- `03-topology-only-links.csv` as Link List, Source = `source`, Target = `target`

Expected warning:

- Missing node data (3): `A`, `B`, `C`
- No missing-link-information section

## 4. Node-only file

File:

- `04-node-only-nodes.csv` as Node List, ID = `id`

Expected: no coverage warning because there is no explicit topology source.

## 5. Standalone FASTA

File:

- `05-standalone-sequences.fasta` as FASTA

Expected: no coverage warning because sequence-derived links do not exist yet.

## 6. Custom field mappings

Files:

- `06-remapped-nodes.csv` as Node List, ID = `sample_code`
- `06-remapped-links.csv` as Link List, Source = `from_id`, Target = `to_id`

Expected warning:

- Missing node data (1): `W`
- Missing link information (1): `Z`

## 7. GraphML with an undeclared edge endpoint

File:

- `07-undeclared-endpoint.graphml` as GraphML

Expected warning:

- Missing node data (1): `C`
- Missing link information (1): `A`

This verifies that declared GraphML nodes and edge endpoints are analyzed
separately.

## 8. Newick tree

File:

- `08-matched-tree.newick` as Newick

Expected: no coverage warning. Newick leaves count as both node and topology IDs.

## 9. GeoJSON remains enrichment-only

Files:

- `02-matched-nodes.csv` as Node List, ID = `id`
- `02-matched-links.csv` as Link List, Source = `source`, Target = `target`
- `09-unmatched-enrichment.geojson` as GeoJSON

Expected: no coverage warning. The unmatched identifier `Z` in the GeoJSON file
does not participate in coverage analysis.

## 10. Self-links are ignored

Files:

- `10-self-links-nodes.csv` as Node List, ID = `id`
- `10-self-links-links.csv` as Link List, Source = `source`, Target = `target`

Expected warning:

- No missing-node-data section
- Missing link information (1): `C`

The `A-A`, `B-B`, and `C-C` rows are ignored. Only the valid `A-B` topology
contributes endpoint IDs.

## 11. IDs remain case-sensitive

Files:

- `11-case-sensitive-nodes.csv` as Node List, ID = `id`
- `11-case-sensitive-links.csv` as Link List, Source = `source`, Target = `target`

Expected warning:

- Missing node data (1): `A`
- Missing link information (1): `a`

