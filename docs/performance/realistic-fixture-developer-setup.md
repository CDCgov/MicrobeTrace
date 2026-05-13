# Realistic Fixture Developer Setup

This runbook is for developers who pull the repo and need to generate or validate the bio-realistic performance fixtures locally.

The realistic fixture workflow uses:

- Node/npm for the MicrobeTrace wrapper and Cypress specs
- R for MuSSE tree simulation
- R packages `diversitree`, `ape`, and `jsonlite`
- IQ-TREE AliSim for sequence alignment simulation

## 1. Install App Dependencies

From the repo root:

```bash
npm install
```

Then verify the YAML parser dependency is available:

```bash
node -e 'console.log(require.resolve("js-yaml"))'
```

## 2. Install Host Bioinformatics Tools on macOS

Install Homebrew first if needed: https://brew.sh/

Install R, IQ-TREE 3, and the native GSL dependency used by `diversitree`:

```bash
brew install r iqtree3 gsl
```

Install the required R packages:

```bash
Rscript -e 'install.packages(c("diversitree", "ape", "jsonlite"), repos = "https://cloud.r-project.org")'
```

Verify R and the packages:

```bash
Rscript --version
Rscript -e 'library(diversitree); library(ape); library(jsonlite); cat("R packages OK\n")'
```

## 3. Verify or Install a Working IQ-TREE AliSim Binary

The generator searches for IQ-TREE in this order:

1. `iqtree3`
2. `iqtree2`
3. `iqtree`

For real generation it runs a small AliSim smoke test and uses the first binary that passes.

Verify the installed IQ-TREE:

```bash
iqtree3 --version
```

Run a minimal AliSim smoke test:

```bash
iqtree3 --alisim /private/tmp/mt-alisim-smoke -m JC -t 'RANDOM{yh,4}' --length 12 --out-format fasta -seed 1 -redo
```

If that command segfaults or fails, install the official IQ-TREE 2.4.0 macOS ARM binary as `iqtree2`. This is the workaround used on the first local setup because Homebrew `iqtree3` 3.1.2 installed successfully but its AliSim path crashed.

```bash
curl -L -o /private/tmp/iqtree-2.4.0-macOS-arm.zip https://github.com/iqtree/iqtree2/releases/download/v2.4.0/iqtree-2.4.0-macOS-arm.zip
unzip -q /private/tmp/iqtree-2.4.0-macOS-arm.zip -d /private/tmp/iqtree-2.4.0-macOS-arm
install -m 0755 /private/tmp/iqtree-2.4.0-macOS-arm/iqtree-2.4.0-macOS-arm/bin/iqtree2 /opt/homebrew/bin/iqtree2
```

Verify the fallback binary:

```bash
iqtree2 --version
iqtree2 --alisim /private/tmp/mt-alisim-iqtree2-smoke -m JC -t 'RANDOM{yh,4}' --length 12 --out-format fasta -seed 1 -redo
```

## 4. Validate the Fixture Recipe Without Generating Files

Dry-run validates the YAML preset and prints the planned R/IQ-TREE commands. It does not require the generated fixture files to exist.

```bash
npm run fixtures:performance:realistic:dry-run
```

The default preset is:

```text
scripts/performance-fixtures/realistic/presets/pathogen-musse-500.yaml
```

Use a different preset with:

```bash
node scripts/generate-realistic-performance-fixtures.js --preset path/to/preset.yaml --dry-run
```

## 5. Generate the Realistic Fixture Set

Run:

```bash
npm run fixtures:performance:realistic
```

Expected outputs:

```text
cypress/fixtures/performance/realistic/pathogen-musse-500.fasta
cypress/fixtures/performance/realistic/pathogen-musse-500.nwk
cypress/fixtures/performance/realistic/pathogen-musse-500-nodes.csv
cypress/fixtures/performance/realistic/pathogen-musse-500-summary.json
```

The generator may also leave an IQ-TREE screen log next to the Newick file:

```text
cypress/fixtures/performance/realistic/pathogen-musse-500.nwk.log
```

The summary JSON records the preset, tool versions, commands, seeds, output paths, state distribution, and expected MicrobeTrace link counts at the configured SNP and patristic thresholds.

Quick summary check:

```bash
node -e 'const s=require("./cypress/fixtures/performance/realistic/pathogen-musse-500-summary.json"); console.log({nodes:s.counts.nodes,sequences:s.counts.sequences,snp:s.counts.snp.visibleLinksByThreshold,patristic:s.counts.patristic.visibleLinksByThreshold})'
```

## 6. Run the Cypress Realistic Fixture Spec

If no local server is already running:

```bash
npm run e2e:perf:realistic
```

If an app server is already running on `127.0.0.1:4210`:

```bash
npm run e2e:perf:realistic:local
```

This opt-in spec runs two scenarios:

- FASTA + node metadata load, 2D readiness, and Alignment readiness
- Newick load, 2D readiness, and Phylogenetic Tree readiness

## Troubleshooting

`diversitree` fails with `gsl-config not found`:

```bash
brew install gsl
Rscript -e 'install.packages("diversitree", repos = "https://cloud.r-project.org")'
```

`iqtree3` segfaults during AliSim:

- Install the official IQ-TREE 2.4.0 binary as `iqtree2`.
- Rerun `npm run fixtures:performance:realistic`.
- The generator should skip the failing AliSim binary and use the working one.

Generated counts changed unexpectedly:

- Confirm the YAML preset seed, MuSSE rates, alignment model, and `alignment.treeScale` did not change.
- Check `pathogen-musse-500-summary.json` for the exact command, tool version, and seed used.
- Regenerate from a clean worktree if comparing committed fixture outputs.

Cypress cannot find generated files:

- Run `npm run fixtures:performance:realistic`.
- Confirm the output files exist under `cypress/fixtures/performance/realistic/`.
- Confirm the summary JSON paths are fixture-relative, for example `performance/realistic/pathogen-musse-500.fasta`.

## Related Docs

- `realistic-performance-fixture-generation.md`
- `synthetic-performance-dataset-generation.md`
- `performance-dataset-strategy-for-bioinformaticians.md`
