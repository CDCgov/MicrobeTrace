# Genetic Distance Refactor Performance Comparison

This document captures the before/after performance comparison for the genetic-distance and Newick/patristic refactor work. The original generated artifacts were written under `cypress/downloads/performance/`, which is ignored runtime output. This document preserves the shareable results in versioned docs.

## Test Setup

- Before commit: `2f0eecb0`
- After commit: `6f70b4df`
- Runner: Cypress with headless Chrome
- Samples: 5 successful runs per scenario
- Comparison method: same deterministic fixture or configured real sample, same Cypress driver, separate before/after app servers
- Date collected: May 11, 2026 local performance runs

These numbers are comparison evidence, not timing budgets. Budgets should still come from repeated baseline runs on stable hardware or CI.

## What Changed

Newick uploads now parse and cache the tree, preserve Newick metadata, and delegate patristic edge generation to the worker. Threshold changes re-query the cached tree instead of depending on only the initially visible edge set.

The refactor also preserves session/export compatibility, keeps generated edge metadata, preserves SNP/TN93 behavior from the matrix path, and includes regression coverage for invalid Newick inputs such as duplicate taxa.

## Headline Results

The largest gains are on generated Newick/patristic workloads because those are the datasets that exercise tree-to-link generation directly.

500-leaf Newick:

- Total measured p50 improved from 9.76s to 6.74s, about 31% faster.
- Launch-to-loaded p50 improved from 4.91s to 1.48s, about 70% faster.
- Startup links dropped from 124,750 to 3,000.

1,000-leaf Newick:

- Total measured p50 improved from 16.68s to 7.20s, about 57% faster.
- Launch-to-loaded p50 improved from 11.97s to 1.52s, about 87% faster.
- Startup links dropped from 499,500 to 6,000.

2,000-leaf stress Newick:

- Total measured p50 improved from 68.10s to 9.64s, about 86% faster.
- Launch-to-loaded p50 improved from 63.25s to 1.57s, about 98% faster.
- Startup links dropped from 1,999,000 to 12,000.

The generated clustered FASTA scenarios also improved, but link counts stayed unchanged because the fixture shape did not change:

- 120-sequence clustered FASTA total measured p50 improved from 8.36s to 6.38s, about 24% faster.
- 120-sequence clustered FASTA launch-to-loaded p50 improved from 3.60s to 1.52s, about 58% faster.
- 300-sequence clustered FASTA total measured p50 improved from 8.67s to 6.66s, about 23% faster.
- 300-sequence clustered FASTA launch-to-loaded p50 improved from 3.96s to 1.68s, about 58% faster.

The configured real 1,600-node distance-list scenarios improved less than generated Newick because they exercise an uploaded explicit edge-list path rather than tree-to-link generation:

- Real distance edge-list total measured p50 improved from 10.51s to 8.55s, about 19% faster.
- Real distance edge-list launch-to-loaded p50 improved from 5.68s to 2.49s, about 56% faster.
- Real distance edge-list total links stayed at 118,282, which is expected because the app preserves uploaded edges.
- Real distance plus epi-link scenario total measured p50 improved from 10.39s to 8.42s, about 19% faster.
- Real distance plus epi-link scenario launch-to-loaded p50 improved from 5.69s to 2.53s, about 56% faster.
- Real distance plus epi-link total links stayed at 118,282.

## Interaction Results

Threshold-change action time improved sharply on generated Newick workloads:

- 500-leaf Newick threshold action p50 improved from 29.6ms to 1.8ms, about 94% faster.
- 1,000-leaf Newick threshold action p50 improved from 113.4ms to 3.0ms, about 97% faster.
- 2,000-leaf stress Newick threshold action p50 improved from 460.6ms to 4.1ms, about 99% faster.

The stress Newick interaction path still has a responsiveness risk during the heavier repaint/restore window. The threshold action itself is fast after the refactor, but the browser can still show large frame gaps while the 2D network updates many visible elements. That should be tracked separately from the patristic worker improvement.

## Why Link Counts Changed in Newick but Not Explicit Edge Lists

Generated Newick fixtures create graph links from tree distances. Before the refactor, the old path could materialize all pairwise links up front. After the refactor, startup only emits links that pass the current threshold, then re-queries the cached tree when the threshold changes.

Uploaded distance-list datasets are different. The file already contains the user-provided edges. The app should preserve those edges and apply thresholding as a visibility operation, so total link counts staying unchanged is expected and correct.

## Interpretation

The primary performance win is not just lower wall-clock time. The more important structural change is that Newick/patristic processing no longer pushes the full pairwise graph into session state at startup.

For the team, the concise summary is:

```text
The Newick/patristic refactor made tree-derived graph loading much faster and much lighter. In 5-run local Cypress/Chrome comparisons, 500-leaf Newick improved about 31% total p50, 1,000-leaf improved about 57%, and 2,000-leaf stress Newick improved about 86%. Launch-to-loaded time improved 70-98% across those Newick tiers, mainly because startup no longer materializes every pairwise patristic link. Explicit uploaded distance-list datasets also improved, but less dramatically, because their user-provided link counts are intentionally preserved.
```

## Validation Coverage

Focused Cypress coverage was added for:

- Newick worker launch parity
- threshold re-query upward and downward
- session/export reload behavior
- SNP/TN93 metric preservation
- invalid Newick failure behavior
- generated FASTA/Newick 2D interaction probes
- real distance-list opt-in scenarios

Affected downstream views were also validated during the refactor work, including Phylogenetic Tree, Table, Aggregate, Crosstab, Sankey, Waterfall, and Heatmap.

## Reproducing the Comparison

The commit-to-commit comparison harness is described in `performance-baseline-plan.md` under "Before/After Comparisons". The spec is:

```text
cypress/e2e/performance/genetic-compare.perf.cy.ts
```

The helper script used to summarize the local before/after artifact set was:

```text
tmp/summarize_genetic_compare.js
```

That script writes `genetic-compare-summary.md` and `genetic-compare-summary.json` under `cypress/downloads/performance/` when the comparison artifacts are present.
