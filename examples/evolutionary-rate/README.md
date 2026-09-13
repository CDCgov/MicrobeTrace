# Evolutionary Rate example datasets

These small synthetic datasets exercise both distance paths in the Evolutionary Rate view. They are deterministic test data only and have no epidemiological interpretation.

## FASTA and selected genetic metric

Load these two files together:

- `fasta-rate-example.fasta` as a FASTA file
- `fasta-rate-metadata.csv` as a Node List, using `_id` as the ID field and no sequence field

Launch MicrobeTrace, open **Evolutionary Rate**, and select `sample_date` as the Sample Collection Date. With SNPs selected as the global distance metric, the expected result is:

- Y-axis: `Genetic Distance (SNPs)`
- 8 included samples
- Date range: 2018-01-01 through 2025-01-01
- Slope: 1 SNP/year
- Correlation coefficient: 1
- R-squared: 1
- TMRCA: 2018-01-01

Each successive sequence contains one additional SNP relative to `ERF_2018`. Switching the global metric to TN93 should change the Y-axis and recompute the plotted values from TN93 distances.

## TN93 outlier report

Load `tn93-outlier-example.csv` as a Node List, using `_id` as the ID field and `seq` as the sequence field. Select **TN93** as the global genetic metric, open **Evolutionary Rate**, and select `sample_date` as the Sample Collection Date.

The 12 synthetic 800-base sequences form a nested molecular-clock series from 2014 through 2025. `TN93_2020_DATE_MISMATCH` deliberately uses the mutation pattern expected for the 2024 sample, simulating a sample-date or sequence-label mismatch. All TN93 distances from the 2014 reference are at or below 0.014143, within the default 0.015 TN93 threshold.

Expected results with TN93 shown as decimals:

- Y-axis: `Genetic Distance (TN93)`
- 12 included samples and 0 excluded samples
- 1 potential outlier: `TN93_2020_DATE_MISMATCH`
- Slope: approximately 0.0013 TN93 units/year
- Correlation coefficient: 0.9532
- R-squared: 0.9087
- TMRCA: 2013-10-16
- Outlier absolute residual: approximately 0.0047, or 3.3126 times RMSE

With TN93 percentage display enabled, the slope should be approximately 0.1304%/year and the outlier absolute residual approximately 0.4727%. Open the Evolutionary Rate download menu and use the **Outlier Report** tab to verify that both the default PDF and Markdown report contain the regression plot, the highlighted outlier, and the single-row potential-outliers table.

For an additional report-key check, color nodes by `location` and assign shapes by `lineage` before downloading the report.

Regenerate and validate this fixture with:

```bash
node scripts/generate-evolutionary-rate-examples.js
```

## Uploaded phylogenetic tree

Start a new session and load these two files together:

- `phylogeny-rate-example.nwk` as a Newick tree
- `phylogeny-rate-metadata.csv` as a Node List, using `_id` as the ID field and no sequence field

Open **Evolutionary Rate** and select `sample_date`. The expected result is:

- Y-axis: `Patristic Distance`
- Distance source: `Patristic root-to-tip distance`
- 8 included tips
- Date range: 2018-01-01 through 2025-01-01
- Slope: 0.01 patristic units/year
- Correlation coefficient: 1
- R-squared: 1
- TMRCA: 2017-01-01

The rooted ladder tree has root-to-tip distances from 0.01 through 0.08. Changing the global SNP/TN93 selection should not replace or rescale the phylogenetic Y-axis.

## Large deterministic dataset (500 samples)

The repository also includes a generated 500-sample dataset under `cypress/fixtures/performance/evolutionary-rate/`:

- `evolutionary-rate-500.fasta`
- `evolutionary-rate-500.nwk`
- `evolutionary-rate-500-nodes.csv`
- `evolutionary-rate-500-summary.json`

For sequence-distance testing, load the FASTA and node CSV together. For phylogenetic testing, start a new session and load the Newick and the same node CSV together. In both cases, select `sample_date` in Evolutionary Rate settings. Do not load the FASTA and Newick in the same session when comparing the two distance paths.

The samples are collected weekly from 2015-01-01 through 2024-07-25. The FASTA contains deterministic nested mutations targeting approximately 12 SNPs per year from `ER500_0001`; the tree contains deterministic root-to-tip distances targeting approximately 0.0012 patristic units per year. Small seeded deviations keep the regression residual mean squared value nonzero. Exact expected regression values are recorded in the summary JSON.

Regenerate this fixture with:

```bash
npm run fixtures:performance:deterministic
```
