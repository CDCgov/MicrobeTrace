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

## 2. Install Host Bioinformatics Tools

The generator is cross-platform and searches `PATH` for `Rscript`, then `iqtree3`, `iqtree2`, or `iqtree`. Use the macOS/Linux or Windows setup below, then run the same npm commands from the repo root.

### macOS

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

### Windows

Use PowerShell from the repo root.

Install Node/npm separately as usual for MicrobeTrace, then install R for Windows and make sure the R `bin` directory is on `PATH`. A typical path is similar to:

```text
C:\Program Files\R\R-4.6.0\bin
```

Verify that PowerShell can find `Rscript`:

```powershell
Rscript --version
```

Install the required R packages:

```powershell
Rscript -e "install.packages(c('diversitree', 'ape', 'jsonlite'), repos = 'https://cloud.r-project.org')"
```

Verify R and the packages:

```powershell
Rscript -e "library(diversitree); library(ape); library(jsonlite); cat('R packages OK', '\n')"
```

If R asks to compile packages from source, install Rtools for the installed R version, restart PowerShell, and rerun the package install command. Most Windows setups should use CRAN binary packages when available.

Install IQ-TREE for Windows by downloading a Windows release ZIP from the IQ-TREE releases page, extracting it, and adding the directory that contains `iqtree2.exe`, `iqtree3.exe`, or `iqtree.exe` to `PATH`. Then verify one of these works:

```powershell
iqtree2 --version
```

If the executable is named `iqtree3.exe`, use `iqtree3` in the verification commands. The generator will accept any of `iqtree3`, `iqtree2`, or `iqtree`.

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

Run a minimal AliSim smoke test on macOS/Linux:

```bash
iqtree3 --alisim /private/tmp/mt-alisim-smoke -m JC -t 'RANDOM{yh,4}' --length 12 --out-format fasta -seed 1 -redo
```

Run the equivalent smoke test on Windows PowerShell:

```powershell
$prefix = Join-Path $env:TEMP "mt-alisim-smoke"
iqtree2 --alisim $prefix -m JC -t 'RANDOM{yh,4}' --length 12 --out-format fasta -seed 1 -redo
Test-Path "$prefix.fa"
```

On macOS, if the Homebrew `iqtree3` command segfaults or fails, install the official IQ-TREE 2.4.0 macOS ARM binary as `iqtree2`. This is the workaround used on the first local setup because Homebrew `iqtree3` 3.1.2 installed successfully but its AliSim path crashed.

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

On Windows, use the same fallback idea with the Windows IQ-TREE ZIP: extract a known-working `iqtree2.exe`, put its directory earlier on `PATH` than any failing IQ-TREE binary, open a new PowerShell window, and rerun the PowerShell smoke test. The generator also runs its own AliSim smoke test and skips IQ-TREE binaries whose AliSim path fails.

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

The summary JSON records the preset, validation policy, tool versions, commands, seeds, output paths, state distribution, and expected MicrobeTrace link counts at the configured SNP and patristic thresholds.

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

On macOS:

```bash
brew install gsl
Rscript -e 'install.packages("diversitree", repos = "https://cloud.r-project.org")'
```

On Windows, prefer CRAN binary packages. If R tries to compile from source or reports missing build tools, install Rtools for the installed R version, restart PowerShell, and rerun:

```powershell
Rscript -e "install.packages('diversitree', repos = 'https://cloud.r-project.org')"
```

`iqtree3` segfaults during AliSim:

- Install the official IQ-TREE 2.4.0 binary as `iqtree2` or `iqtree2.exe`.
- Rerun `npm run fixtures:performance:realistic`.
- The generator should skip the failing AliSim binary and use the working one.

`Rscript` or `iqtree2` works in one terminal but not from npm:

- Confirm the tool directory is on the user or system `PATH`.
- Open a new PowerShell, Command Prompt, or Git Bash after changing `PATH`.
- Run `Get-Command Rscript` and `Get-Command iqtree2` in PowerShell, `where.exe Rscript` and `where.exe iqtree2` in Command Prompt, or `which Rscript` and `which iqtree2` on macOS/Linux.

Generated counts changed unexpectedly:

- Confirm the YAML preset seed, MuSSE rates, alignment model, and `alignment.treeScale` did not change.
- Check `pathogen-musse-500-summary.json` for the exact command, tool version, and seed used.
- Check the preset `validation` section to separate strict count/parity failures from report-only tree-comparison metrics.
- Regenerate from a clean worktree if comparing committed fixture outputs.

Cypress cannot find generated files:

- Run `npm run fixtures:performance:realistic`.
- Confirm the output files exist under `cypress/fixtures/performance/realistic/`.
- Confirm the summary JSON paths are fixture-relative, for example `performance/realistic/pathogen-musse-500.fasta`.

## Related Docs

- `realistic-performance-fixture-generation.md`
- `synthetic-performance-dataset-generation.md`
- `performance-dataset-strategy-for-bioinformaticians.md`
