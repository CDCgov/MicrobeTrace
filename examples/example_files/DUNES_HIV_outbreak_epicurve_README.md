# DUNES-derived HIV cluster Epi Curve example

`DUNES_HIV_outbreak_epicurve.csv` is a fully synthetic node list for exercising the Epi Curve view. It mimics a six-month HIV transmission-cluster investigation with staggered introductions, overlapping waves, reporting delays, linkage-to-care delays, and a small number of incomplete records. It is not surveillance data and must not be used for epidemiologic inference.

The `seq` values are a 160-record subset of the repository's reviewed DUNES fixture. They were generated with the `dacowan404/dunes` fork, HIV mutation distribution, mutation rate `0.0041`, and `0.25` years of evolution. The outbreak dates and clinical fields were added deterministically by `scripts/generate-dunes-hiv-outbreak-epicurve-example.js`; DUNES does not model those fields.

## Load the data

1. Import `DUNES_HIV_outbreak_epicurve.csv` as a node list.
2. Use `_id` as the node identifier.
3. Open the **Epi Curve** view and its settings.

The file contains 160 records across four DUNES source lineages and investigation zones. There are 155 populated diagnosis dates, 160 report dates, and 143 linkage-to-care dates. Every sequence is 9,750 nucleotides long.

## Scenario 1: single-series curve and stacked colors

- **Graph Type:** `Single Date Field`
- **Date Field:** `Diagnosis date`
- **Bin Size:** `Week`
- **Epi Curve:** `Noncumulative`
- In **Appearance**, set **Color By** to `Exposure category`, `Investigation zone`, or `DUNES source lineage`.

This exercises weekly binning, stacked bars, automatic and custom stack ordering, category colors, legends, tooltips, and the inclusion summary. The summary should report 155 plotted records and 5 records excluded because the diagnosis date is blank. Switch the curve to **Cumulative** to test running totals by stack segment.

## Scenario 2: layered bars and cumulative lines

Choose **Multi: Overlay**, add three series, and configure all four cards:

| Series | Date field | Value field | Aggregation | Cumulative | Type | Style |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `Diagnosis date` | `Case weight` | `Sum` | Off | Bar | — |
| 2 | `Diagnosis date` | `Cumulative diagnoses` | `Last` | Off | Line | Solid |
| 3 | `Health department report date` | `Cumulative reports` | `Last` | Off | Line | Dashed |
| 4 | `Linkage to care date` | `Cumulative care linkages` | `Last` | Off | Line | Solid |

Use daily or weekly bins. This exercises four series, Overlay rendering, `Sum` and `Last`, line styles, series labels, per-series inclusion summaries, and mixed axes. The bar series uses the right axis; the lines use the left axis. In **Appearance**, the bar can also be stacked by `Investigation zone` because it uses `Sum` with a single bar series.

As an alternate running-total test, use `Case weight` with **Sum** and turn **Cumulative** on for a line series. Its final value should match the corresponding populated date count.

## Scenario 3: side-by-side operational delays

Choose **Multi: Side by Side** and use Count aggregation with these date fields:

1. `Specimen collection date`
2. `Diagnosis date`
3. `Health department report date`
4. `Linkage to care date`

Display all four series as bars with weekly bins. This exposes the expected movement between specimen collection, diagnosis, reporting, and care linkage while exercising grouped bars, independent colors, series removal, and the four-series limit.

## Scenario 4: numeric aggregations

Use `Diagnosis date` with one of these combinations:

- `CD4 count at diagnosis` + **Average** for average clinical values by bin.
- `Contacts named` + **Sum** for public-health workload by bin.
- `Cumulative diagnoses` + **Last** for a precomputed cumulative line.
- `Case weight` + **Sum** for an explicit count-equivalent series.

These fields cover every aggregation option when combined with ordinary Count.

## Appearance, titles, and annotations

Useful appearance checks include:

- Switch **Bin Size** among Day, Week, and Month.
- Set **Tick Unit** to Day, Week, or Month and change the interval.
- Move the legend to Left, Top, Right, Bottom, and Hide.
- Change label and legend sizes.
- Reorder stack categories and assign custom colors and transparency.
- Add custom chart, axis, and footnote text, then export PNG and SVG.

Suggested annotations:

| Date | Label |
| --- | --- |
| `2025-01-06` | `first cluster signal detected` |
| `2025-02-14` | `enhanced testing launched` |
| `2025-03-24` | `mobile linkage-to-care team deployed` |
| `2025-06-16` | `investigation transitioned to routine monitoring` |

## Regenerate the dataset

The generator reads the committed DUNES FASTA fixture, so no DUNES installation is needed to reproduce this particular example:

```powershell
node .\scripts\generate-dunes-hiv-outbreak-epicurve-example.js
```

To regenerate the underlying sequences with DUNES itself, follow `docs/performance/dunes-performance-fixture-generation.md` first, then rerun the example generator. DUNES does not expose a random seed, so a regenerated FASTA may differ from the committed fixture.
