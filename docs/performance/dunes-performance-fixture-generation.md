# DUNES Performance Fixture Generation

This workflow adds a simpler sequence-generation tier for routine MicrobeTrace validation. It does not replace the MuSSE + AliSim workflow. Use MuSSE + AliSim when reviewers need a trait-aware tree plus sequence simulation, and use DUNES when the goal is a fast FASTA-only mutation fixture.

The default preset is:

```text
scripts/performance-fixtures/dunes/presets/hiv-like-dunes-500.yaml
```

When DUNES is available locally, it produces:

- `cypress/fixtures/performance/dunes/hiv-like-dunes-500-source.fasta`
- `cypress/fixtures/performance/dunes/hiv-like-dunes-500.fasta`
- `cypress/fixtures/performance/dunes/hiv-like-dunes-500-nodes.csv`
- `cypress/fixtures/performance/dunes/hiv-like-dunes-500-summary.json`

## Prerequisites

DUNES is a Java command-line tool for mutating DNA sequences from an input FASTA. Download `dunes.jar` from the upstream project at https://github.com/Sergey-Knyazev/dunes or compile it from source, then point the wrapper at the jar.

The wrapper expects:

- Java on `PATH`
- `dunes.jar`, provided with `--dunes-jar path/to/dunes.jar` or `DUNES_JAR=path/to/dunes.jar`

Useful upstream commands:

```bash
java -jar dunes.jar -h
java -jar dunes.jar -i input.fasta -m 0.0041 -y 0.25 -n 50 -o output.fasta
```

## Commands

Validate the preset and print the planned Java command:

```bash
npm run fixtures:performance:dunes:dry-run
```

Generate the fixture:

```bash
DUNES_JAR=/path/to/dunes.jar npm run fixtures:performance:dunes
```

Or:

```bash
node scripts/generate-dunes-performance-fixtures.js --dunes-jar /path/to/dunes.jar
```

Run the opt-in Cypress performance spec after outputs exist:

```bash
npm run e2e:perf:dunes
```

## Preset Behavior

The default preset generates 10 deterministic source sequences of HIV-like length, then asks DUNES to generate 50 mutants per source sequence. That requests 500 mutated records, but DUNES can emit fewer records when duplicate mutant sequences collapse in its output set. The wrapper records both `counts.requestedSequences` and the actual emitted `counts.sequences` in the summary JSON, and Cypress asserts against the actual emitted count.

You can also provide a reviewed source FASTA instead of generated source sequences:

```yaml
reference:
  fasta: path/to/source.fasta
```

The summary JSON records the actual generated sequence count, source distribution, sequence length range, SNP thresholds, expected visible links at those thresholds, tool paths, and the exact DUNES command. Cypress reads those measured counts from the summary rather than assuming a fixed visible-link count.

## Reproducibility Note

The MicrobeTrace wrapper deterministically generates the source FASTA when `reference.fasta` is not set. DUNES itself does not expose a seed option, so DUNES output can vary between generations. Regenerate and commit the FASTA, metadata CSV, and summary JSON together whenever the DUNES preset is rerun.

## Review Points

Bioinformaticians should tune:

- source FASTA choice or generated source count
- source sequence length
- DUNES mutation rate
- years of evolution
- mutants per source sequence
- MicrobeTrace SNP thresholds
- expected visible-link density in the generated summary

This tier is intentionally FASTA-only. It does not produce a reference Newick tree, trait transition metadata, or an explicit substitution model comparable to AliSim.
