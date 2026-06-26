# Bio-Realistic Performance Fixture Generation

This document describes the optional workflow for generating MicrobeTrace performance fixtures with a trait-aware simulated tree and a simulated sequence alignment.

The deterministic fixtures from `scripts/generate-performance-fixtures.js` remain the default baseline. This workflow is for reviewer-facing calibration when we want synthetic datasets that better resemble pathogen evolution and geographic or trait movement.

For the simpler FASTA-only DUNES tier, see `dunes-performance-fixture-generation.md`.

For local install instructions and troubleshooting, see `realistic-fixture-developer-setup.md`.

## What the Workflow Produces

The v1 preset is `scripts/performance-fixtures/realistic/presets/pathogen-musse-500.yaml`.

When host bioinformatics tools are installed, it produces:

- `cypress/fixtures/performance/realistic/pathogen-musse-500.fasta`
- `cypress/fixtures/performance/realistic/pathogen-musse-500.nwk`
- `cypress/fixtures/performance/realistic/pathogen-musse-500-nodes.csv`
- `cypress/fixtures/performance/realistic/pathogen-musse-500-summary.json`

The node metadata CSV contains:

- `_id`
- `seq_id`
- `location`
- `location_state_index`
- `sample_date`
- `simulation_generation`

The metadata intentionally does not store the raw sequence string. Cypress loads `_id` as the node ID and `seq_id` as the sequence identifier; the FASTA file supplies the actual sequence data.

## Prerequisites

The generator uses host tools and fails clearly when they are missing. It is intended to run on macOS, Linux, or Windows as long as the required executables are on `PATH`.

Required local tools:

- `Rscript`
- R packages: `diversitree`, `ape`, `jsonlite`
- IQ-TREE with AliSim, available as one of `iqtree3`, `iqtree2`, or `iqtree`

Useful setup commands:

```bash
Rscript -e 'install.packages(c("diversitree", "ape", "jsonlite"))'
```

Windows PowerShell equivalent:

```powershell
Rscript -e "install.packages(c('diversitree', 'ape', 'jsonlite'), repos = 'https://cloud.r-project.org')"
```

Install IQ-TREE through the method preferred for the workstation or CI image, then verify one of these commands is on `PATH`:

```bash
iqtree3 --version
```

On Windows, the executable may be `iqtree3.exe`, `iqtree2.exe`, or `iqtree.exe`; PowerShell can invoke it without typing `.exe` if its directory is on `PATH`.

The generator searches `iqtree3`, `iqtree2`, then `iqtree`, including Windows executable extensions, but real generation also runs a small AliSim smoke test and uses the first binary whose AliSim path succeeds. This allows a working IQ-TREE 2.4.0 install to be used if a newer host binary is present but cannot run AliSim on the current machine.

## Commands

Validate the YAML and print the planned R/IQ-TREE commands without requiring the external tools:

```bash
npm run fixtures:performance:realistic:dry-run
```

Generate the fixture outputs:

```bash
npm run fixtures:performance:realistic
```

Run the opt-in Cypress performance spec after outputs exist:

```bash
npm run e2e:perf:realistic
```

## Generation Steps

1. The Node wrapper reads the YAML preset and validates the recipe.
2. The wrapper writes a temporary JSON config for R.
3. `scripts/simulate-musse-tree.R` uses `diversitree::tree.musse` to simulate a multi-state trait tree.
4. The R script retries until it reaches the requested taxa count or exhausts `maxAttempts`.
5. The R script scales branch lengths with `alignment.treeScale`, renames tips deterministically, writes Newick, and writes node metadata.
6. The Node wrapper runs IQ-TREE AliSim against the generated Newick tree.
7. The wrapper copies the AliSim FASTA output to the fixture directory.
8. The wrapper computes SNP and patristic link counts for the configured thresholds.
9. The wrapper validates and records the preset's validation policy, including which checks are strict and which tree-comparison metrics are report-only.
10. The wrapper writes a summary JSON containing provenance, commands, tool versions, thresholds, counts, validation policy, and output paths.

## Preset Review Points

Bioinformaticians should review:

- trait states and whether they represent the intended geography or categorical variable
- MuSSE birth, extinction, and transition rates
- whether `alignment.treeScale` gives branch lengths appropriate for AliSim
- sequence model and sequence length
- SNP and patristic thresholds used for MicrobeTrace checks
- validation policy, especially which checks should hard-fail versus remain report-only
- state distribution and link counts in the generated summary

The first preset is intentionally a starting point. The summary JSON is the best file for reviewing what was actually generated because it includes both the input recipe and measured output characteristics.

## References

- IQ-TREE AliSim documentation: https://iqtree.github.io/doc/AliSim
- diversitree MuSSE/tree simulation documentation: https://cran.r-universe.dev/diversitree/doc/manual.html
