# Transmission Chain View demo dataset

This wholly synthetic outbreak dataset demonstrates how Transmission Chain View combines epidemiologic and genetic evidence. It contains 30 nodes, two epidemiologic link files, and an 80-base simulated sequence for every node. At a SNP distance threshold of `1`, the sequences produce 14 genetic links: 8 overlap shared-household links, 4 overlap known shared-location links, and 2 have neither epidemiologic link.

The simulated sequences are intentionally simple and deterministic. They are for product demonstration only and are not intended to represent a real organism or support biological inference.

## Load the data

1. Add `Transmission_Chain_Demo_Nodes.csv` as a node list.
2. Use `_id` as the node ID field and `Sequence` as the sequence field.
3. Add `Transmission_Chain_Demo_Shared_Household_Links.csv` and `Transmission_Chain_Demo_Known_Shared_Location_Links.csv` as link lists.
4. For each link list, use `source` as Field 1 and `target` as Field 2. Leave the distance field set to `None`.
5. In **File Settings**, select **SNPs** as the Distance Metric and use a Link Threshold of `1`.
6. Process the files and open **Transmission Chain View**.

## Recommended demonstration

In **Layout**:

- Set **Date Field** to `Date of symptom onset Date`.
- Set **Y-Axis Field** to `Facility`.
- Increase **Y Spacing** if you want more separation between facility bands.
- Toggle **Shared Household**, **Known Shared Location**, and **Genetic Distance** under **Link Lists** to compare evidence sources.

In **Network > Display**:

- Start with **Stepped** to emphasize source-to-target timing.
- Switch to **Curved** or **Fan-out Curves** to highlight branches and multi-source relationships.

Useful comparisons:

- Shared household has the strongest genetic overlap: 8 of 10 household links also have a one-SNP genetic link.
- Known shared location has the next-highest overlap: 4 of 13 location links also have a one-SNP genetic link.
- Only 2 genetic links occur without either epidemiologic link: `C05`-`C06` and `B09`-`U01`.
- Clear each epidemiologic source independently to see that a multi-source relationship remains visible while **Genetic Distance** is selected.
- Set the SNP threshold to `0` to remove all genetic links, then restore it to `1` to display the intended 14-link genetic network.
- Set **Y-Axis Field** back to `None` to compare automatic connected-component grouping with facility grouping.
- Color nodes by `Case Classification` or `Outbreak` in Global Settings.
- Look for the `(No Facility)` band, then use the red excluded-node count in the view toolbar to inspect nodes omitted because they have no onset date.

## Expected shape at SNP threshold 1

- 30 nodes with valid 80-base simulated sequences
- 10 shared-household links
- 13 known shared-location links
- 14 sequence-derived genetic links
- 8 genetic links overlapping shared household
- 4 genetic links overlapping known shared location
- 2 genetic links with neither epidemiologic source
- 3 connected outbreak components (`Alpha`, `Bravo`, and `Charlie`)
- 2 unlinked nodes
- 4 named facility bands plus a missing-facility band
- 28 timeline nodes when `Date of symptom onset Date` is selected; the 2 missing-date nodes are listed under **Excluded Nodes**

All names, dates, facilities, sequences, and relationships are fictional and intended only for product demonstration and testing.
