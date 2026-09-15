# MMWR-style Epi Curve example

`MMWR_measles_epi_curve.csv` is a synthetic, daily dataset designed to demonstrate the MMWR-style Epi Curve overlay. It spans January 1–September 30, 2025, with case-count bars and two precomputed cumulative vaccination series. The values resemble the visual structure of the supplied reference; they are not surveillance data.

## Load the data

1. Import `MMWR_measles_epi_curve.csv` as a node list.
2. Use `ID` as the node identifier.
3. Open the **Epi Curve** view and its settings.

## Graph settings

- **Graph Type:** `Multi: Overlay`
- Click **Add series** twice so Series 1, Series 2, and Series 3 are available.
- **Date Field:** `No. of measles cases in 2025`
- **Value Field 1:** `Measles case count`
- **Aggregation 1:** `Sum`
- **Cumulative 1:** `Off (per bin)`
- **Series Label 1:** `No. of measles cases in 2025`
- **Series Type 1:** `Bar`
- **Date Field 2:** `No. of MMR doses administered in 2025`
- **Value Field 2:** `Cumulative MMR doses administered in 2025`
- **Aggregation 2:** `Last`
- **Cumulative 2:** `Off (per bin)`
- **Series Label 2:** `No. of MMR doses administered in 2025`
- **Series Type 2:** `Line`
- **Line Style 2:** `Solid`
- **Date Field 3:** `No. of MMR doses administered during the same period in 2024`
- **Value Field 3:** `Cumulative MMR doses administered during the same period in 2024`
- **Aggregation 3:** `Last`
- **Cumulative 3:** `Off (per bin)`
- **Series Label 3:** `No. of MMR doses administered during the same period in 2024`
- **Series Type 3:** `Line`
- **Line Style 3:** `Dashed`
- **Bin Size:** `Day`
- **Series 1 color:** `#9ec5e5`
- **Series 2 color:** `#005bbb`
- **Series 3 color:** `#005bbb`

Each series card shows its assigned axis. In this mixed chart, line series use the left axis and bar series use the right axis. Charts containing only bars or only lines use the left axis.

Use `Last` with cumulative turned off for the two line series because their source columns already contain cumulative totals. This also preserves the correct end-of-period value if you switch to weekly or monthly bins, instead of summing repeated cumulative values.

## Legend and labels

- **Tick Unit:** `Day`
- **X-axis Interval:** `14`
- **Legend Position:** `Top`

## Titles and axes

- **Chart Title:** `FIGURE. Number of laboratory-confirmed measles cases, by onset date, and cumulative number of measles, mumps, and rubella vaccine doses administered — New Mexico, 2024 and 2025`
- **X-axis Label:** `Onset date`
- **Left Y-axis Label:** `Cumulative no. of MMR doses`
- **Right Y-axis Label:** `No. of measles cases in 2025`
- **Footnote:** `Abbreviation: MMR = measles, mumps, and rubella.`

## Annotations

Add these entries in the **Annotations** tab:

| Date | Label |
| --- | --- |
| `2025-02-14` | `measles outbreak declared` |
| `2025-08-14` | `end of last patient's infectious period` |
| `2025-09-26` | `measles outbreak declared over` |

## Regenerate the dataset

From the repository root, run:

```powershell
node .\scripts\generate-mmwr-epi-curve-example.js
```
