# Riverbend Continuous Color Ramp Test Dataset

This is a fully synthetic respiratory-outbreak investigation. It contains no real people, facilities, or protected health information. The shape is intentionally realistic enough for manual demonstrations while retaining deliberate edge cases for every continuous-color feature.

## Files

- `riverbend-outbreak-nodes.csv`: 24 case records with aligned 120-base sequences, dates, coordinates, clinical metadata, categorical fields, and several numeric field shapes.
- `riverbend-outbreak-links.csv`: 36 investigated contacts with categorical context and numeric duration, proximity, genetic-distance, probability, and confidence fields. Its conventional `distance` column duplicates `GeneticDistanceSNP` so network threshold controls work immediately.
- `riverbend-lineage-colors.csv`: optional categorical node color-assignment file. Applying it selects `Lineage` and verifies that imported categorical colors remain independent of continuous ramps.
- `riverbend-risk-ramp.csv`: continuous node color-assignment file for `RiskScore`. Its `mode` column switches the selected field to a custom continuous ramp using the listed numeric stops.
- `riverbend-contact-ramp.csv`: continuous link color-assignment file for `ContactMinutes`, including endpoints outside the suggested custom walkthrough domain to demonstrate clamping.
- `embed-launch.example.json`: a valid `launch` object for an embed v1 payload. It demonstrates custom node and link domains, arbitrary ordered stops, missing-value colors, and endpoint clamping.

## Load the dataset

1. In MicrobeTrace, choose **File > Add Data**.
2. Select both `riverbend-outbreak-nodes.csv` and `riverbend-outbreak-links.csv`.
3. Launch the data as a node list plus link list. The IDs in `source` and `target` match the node `ID` field.
4. For Map, set the latitude and longitude fields to `Latitude` and `Longitude`.
5. For Epi Curve, use `Date of symptom onset Date` as the date field.

The `seq` values are aligned and form three related synthetic lineages, so the same node data can be opened in Phylogenetic Tree as well as 2D Network, Map, Bubble, Table, and Epi Curve.

## Feature coverage

| Scenario | Node field | Link field | Expected behavior |
| --- | --- | --- | --- |
| Auto numeric detection | `RiskScore`, `ViralLoadCt`, `AgeYears` | `ContactMinutes`, `distance`, `GeneticDistanceSNP`, `EstimatedTransmissionProbability` | Auto resolves to Continuous because CSV numeric strings and missing values are valid numeric-or-missing data. |
| Full-data automatic domain | `RiskScore` | `ContactMinutes` | The domain remains based on all loaded rows through filtering, timeline playback, and visibility changes. |
| Missing values | `ViralLoadCt` on case 016; `IncubationEstimateDays` on cases 008 and 024 | `ContactMinutes` on one contact | Missing values use the configured missing/invalid color. |
| NaN-like missing value | `IncubationEstimateDays` on case 008 | — | `NaN` is treated as missing rather than as mixed text. |
| Mixed numeric/text override | `OxygenSaturationPct` (`not measured`, `pending`) | `ProximityMeters` (`unknown`) | Auto remains Categorical. Forcing Continuous colors finite values and sends the text values to the fallback color. |
| Constant domain | `AssayBatchTemperatureC` | `InvestigationConfidence` | Auto resolves to Continuous; the ramp uses its midpoint color and the legend shows one value. Missing rows still use the fallback color. |
| Custom bounds and clamping | `RiskScore`, custom domain 10–90 | `ContactMinutes`, custom domain 15–180 | Risk scores 5 and 96 clamp to the node endpoints. Contact durations 5 and 480 clamp to the link endpoints. |
| Arbitrary stops and reverse | `RiskScore` | `ContactMinutes` | Use the values in `embed-launch.example.json`, or recreate them in Global Styling. Add Stop, Remove, and Reverse should update both the visualization and legend. |
| Categorical override/history | `Lineage`, `Facility`, `Outcome` | `ContactType`, `Setting` | Force numeric fields to Categorical, edit categories, switch modes, and confirm category color history is restored. |
| Categorical assignment import | `Lineage` | — | Apply `riverbend-lineage-colors.csv`; Lineage becomes categorical and receives the supplied colors. |
| Continuous assignment import | `RiskScore` | `ContactMinutes` | Apply `riverbend-risk-ramp.csv` and `riverbend-contact-ramp.csv`; the declared fields switch to Continuous with custom domains spanning the first and last numeric stops. |
| Epi Curve continuous bins | `RiskScore` or `ViralLoadCt` | — | Set **Color By: Node Color**, then test 2–12 equal-width bins, missing segments, cumulative mode, and stable boundaries during filtering. |
| Shared node consumers | `RiskScore` | — | The same resolved colors should appear in 2D Network, Map, Phylogenetic Tree, and Epi Curve. |
| Shared link consumers | — | `ContactMinutes` | The same resolved link ramp should appear in 2D Network and Map. |
| Legend shortcuts | Any continuous field | Any continuous field | In Dock and Show modes, the palette button should open Global Styling at the matching ramp editor while leaving a floating legend open. |
| Legend and export behavior | Any continuous field | Any continuous field | Continuous mode shows a read-only gradient legend with stop labels and a missing swatch; export choices should say Color Legend. |

## Suggested walkthrough

1. Set **Color Nodes By** to `RiskScore`. Confirm Auto reports Continuous and the automatic domain is 5–96.
2. Change to a custom 10–90 domain. Confirm cases 024 and 003 clamp to the low and high endpoint colors.
3. Edit stops, add an interior stop, reverse colors, and change the missing color. Try both docked and floating legends and use their palette shortcuts.
4. Filter to one county and play the symptom-onset timeline. The ramp domain and colors should not change.
5. Open Map and Phylogenetic Tree to compare node colors with 2D Network.
6. Open Epi Curve, select the onset date, choose **Node Color**, and test bin counts plus cumulative mode.
7. Set **Color Links By** to `ContactMinutes`, use a 15–180 custom domain, and compare 2D Network with Map.
8. Force `OxygenSaturationPct` and `ProximityMeters` to Continuous to verify fallback coloring for their text values.
9. Select the constant node and link fields to verify single-value legends.
10. Switch a numeric field to Categorical, edit category colors, switch back and forth, and confirm the categorical appearance is restored.
11. Apply `riverbend-lineage-colors.csv` to confirm assignment import selects categorical Lineage coloring.
12. Apply `riverbend-risk-ramp.csv` and `riverbend-contact-ramp.csv` to confirm assignment import selects the declared node/link fields and reconstructs their continuous ramps.
13. Save and reload a style and session, then load a fresh copy of the node/link files to check persistence and new-dataset reset behavior.

## Color-assignment table format

Simple CSV and TSV assignment files use the field name as the first column header and `color` as the color column. Add an optional `mode` column with `continuous` in at least one row to declare a continuous ramp. Every first-column value must then be a finite number, and the file must contain at least two distinct stops. Empty mode cells inherit the declared mode; conflicting mode values are rejected atomically.

## Embed example

`embed-launch.example.json` is the value for the embed payload's `launch` property, not a standalone handoff. Merge it into a normal version-1 partner handoff whose file entries contain the two CSV files. Its custom stop values are finite, strictly increasing, span their domains, and use six-digit hexadecimal colors.
