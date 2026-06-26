# Performance Dataset Strategy for Bioinformatics Review

This note explains how MicrobeTrace performance testing uses synthetic and real datasets, why both are needed, and what information we need from bioinformaticians to keep the tests representative of real work.

For the exact generation recipes behind the committed deterministic graph, FASTA, and Newick performance fixtures, see `synthetic-performance-dataset-generation.md`. For the optional forked DUNES FASTA workflow, see `dunes-performance-fixture-generation.md`. For the optional trait-aware MuSSE + AliSim workflow that generates more bio-realistic simulated fixtures, see `realistic-performance-fixture-generation.md`.

## Short Summary

Synthetic datasets are our controlled measuring stick. They are generated the same way every time, so they are best for repeatable performance baselines, before/after comparisons, and finding regressions.

Real datasets are our calibration layer. They show whether the synthetic datasets look enough like actual user data and whether real metadata, file shapes, and edge cases still behave correctly.

We should not replace synthetic performance fixtures with real files. Instead, we should use real datasets to decide what the synthetic fixtures should model.

## What Each Dataset Type Proves

Synthetic graph fixtures prove baseline graph loading and 2D rendering behavior for known node and edge counts. They help us track CSV parsing, graph merge, Cytoscape creation, layout, and interaction responsiveness.

Synthetic FASTA fixtures prove sequence parsing, sequence-derived distance/link creation, Alignment readiness, and downstream 2D rendering. These fixtures should include intentional clusters so the expected link density is predictable instead of accidental.

Synthetic Newick fixtures prove tree parsing, patristic preprocessing, thresholded edge generation, cached threshold re-query behavior, and downstream rendering. These are the main fixtures for measuring patristic algorithm improvements.

Real sample datasets prove that representative user data still works with realistic metadata, file formatting, missing values, distance distributions, and multi-file workflows. They are especially valuable for catching cases that deterministic generated data may miss.

Simple sequence-simulation fixtures sit between deterministic generated FASTA and the full bio-realistic workflow. The `dacowan404/dunes` fork mutates an input FASTA with a selectable substitution distribution and gives us a lightweight FASTA-only fixture for routine validation without requiring R, MuSSE, IQ-TREE, or AliSim.

Bio-realistic simulated fixtures sit between deterministic generated fixtures and real samples. They are synthetic and reproducible, but their tree, trait transitions, and sequences are generated with external bioinformatics simulation tools so bioinformaticians can tune the model parameters directly.

Stress fixtures probe upper-limit behavior. They are not normal user expectations or default CI budgets. They are used to find failure modes, memory pressure, and interaction responsiveness risks.

## What "Representative" Should Mean

Synthetic datasets do not need to copy real datasets exactly. They need to match the important shape characteristics that drive performance.

For graph datasets, representative shape includes:

- node count
- edge count
- visible edge count at common thresholds
- degree distribution
- number of isolated nodes
- number and size of connected components
- metadata column count
- common grouping fields and category counts

For FASTA or aligned sequence datasets, representative shape includes:

- sequence count
- sequence length
- number of clusters or transmission groups
- within-cluster SNP distance distribution
- between-cluster SNP distance distribution
- ambiguous bases or missing sequence regions
- expected visible links at standard thresholds

For Newick datasets, representative shape includes:

- leaf count
- tree balance versus highly skewed tree shape
- branch-length range
- branch-length precision
- number and size of clusters at common patristic thresholds
- expected visible links at those thresholds
- edge cases such as duplicate labels, zero-length branches, very small branch lengths, and invalid negative branch lengths

For interaction performance, representative shape includes:

- visible node count
- visible edge count
- selected node degree
- group-by category count
- number of nodes affected by threshold changes
- whether a threshold change adds/removes a small or large number of visible links

## How Bioinformaticians Can Help

Bioinformaticians can help most by reviewing whether our generated fixtures behave like realistic epidemiology, sequence, and phylogenetic datasets.

Useful input includes:

- examples of typical average, large, and unusually large dataset sizes
- common SNP or patristic thresholds used in practice
- expected number of clusters at those thresholds
- expected number of links within and across clusters
- whether branch lengths around zero are common and how they should be displayed or validated
- examples of real metadata columns used for grouping, filtering, coloring, and Sankey/Aggregate views
- anonymized or shareable files that exercise real-world quirks

If real data cannot be committed to the repo, a shape summary is still useful. For example:

```text
Dataset type: Newick
Leaves: 1,850
Typical threshold: 0.003
Visible links at threshold: about 11,000
Clusters: about 35
Largest cluster: about 90 leaves
Branch lengths: 0 to 0.018, many values below 0.00001
Known quirks: repeated sample prefixes, occasional zero-length branches
```

That kind of summary lets us generate a deterministic synthetic fixture with similar performance characteristics without storing sensitive data.

## Recommended Testing Model

Use deterministic synthetic fixtures as the default baseline suite:

- average tier for daily-use expectations
- large tier for upper-normal workflows
- stress tier for manual upper-limit testing

Use real datasets as opt-in validation scenarios:

- to confirm the generated fixtures are realistic
- to catch file-format and metadata issues
- to verify important real workflows after performance refactors
- to recalibrate what average, large, and stress should mean

Use bio-realistic simulated datasets as opt-in calibration scenarios:

- to review a transparent model recipe without committing sensitive data
- to exercise FASTA, Newick, and metadata together from one known simulation
- to tune transition rates, tree scale, sequence model, and thresholds with bioinformatics input

Use DUNES simulated datasets as opt-in routine sequence scenarios:

- to generate a FASTA-only mutation workload from a reviewed source sequence
- to avoid the MuSSE + AliSim toolchain when tree and trait simulation are not needed
- to tune mutation rate, elapsed years, mutants per source, mutation distribution, and SNP thresholds directly

Use before/after comparisons only when the datasets exercise the changed code path. For example, a Newick/patristic refactor should be judged primarily with Newick fixtures, while a CSV edge-list optimization should be judged with explicit link-list fixtures.

## Browser-Based Tier Guidance

MicrobeTrace runs in the browser, so the tier definitions should reflect browser memory, rendering, and main-thread responsiveness limits. Stress tiers are for finding limits and guardrails, not for promising that every workflow will feel smooth.

| Tier | Graph CSV | FASTA | Newick | Expected use |
| --- | --- | --- | --- | --- |
| Smoke | 500 nodes / 1,000 links | 50-100 sequences | 100-500 leaves | CI sanity check |
| Average | 2,000-5,000 nodes / 5,000-20,000 links | 300-1,000 sequences | 500-1,000 leaves | should feel smooth |
| Large | 5,000-10,000 nodes / 20,000-50,000 links | 2,000 sequences | 2,000-5,000 leaves | should work, may be slower |
| Stress | 25,000+ nodes / 75,000+ links | 5,000 sequences | 10,000 leaves | manual scalability test |
| Failure-mode | 50,000+ nodes / 100,000+ links | 10,000+ sequences | 25,000+ leaves | warning, throttling, and crash-resistance testing |

For both FASTA and Newick, visible link count should be reported with sequence or leaf count. The browser cost of rendering a dense visible network can dominate the algorithm cost.

Practical Newick targets:

| Scenario | Target |
| --- | --- |
| 500 leaves | usable in <= 3s |
| 1,000 leaves | usable in <= 3-5s |
| 2,000 leaves | usable in <= 5-10s |
| 5,000 leaves | usable in <= 15s if visible links are controlled |
| 10,000 leaves | manual stress; should not crash; warning acceptable |

Practical FASTA targets:

| Scenario | Target |
| --- | --- |
| 300 sequences | usable in <= 5-8s |
| 500 sequences | usable in <= 10s |
| 1,000 sequences | usable in <= 15-20s |
| 2,000 sequences | usable in <= 30s |
| 5,000 sequences | manual stress; <= 1-2 minutes would be useful, but not a routine expectation |

The application now treats very large FASTA pairwise-link generation as a guarded browser operation. By default it warns at 1,000,000 pairwise genetic links and skips browser link materialization above 2,000,000 pairs, so 5,000+ sequence tests should be run as explicit manual stress or failure-mode checks rather than ordinary baseline scenarios.

## Minimum Fixture Metadata

Each committed performance fixture should have a small manifest or documented shape summary so reviewers know what it is intended to prove.

Minimum useful fields:

- fixture name and file names
- dataset type and tier
- node, link, sequence, or leaf count
- active metric and threshold
- expected visible node and link counts at important thresholds
- expected component or cluster counts when relevant
- known edge cases
- intended code paths, such as parse, distance worker, threshold query, Cytoscape render, Alignment readiness, or Phylogenetic Tree readiness
- known limitations, including whether the fixture is computationally representative rather than biologically realistic

## What Future Reports Should Include

For Newick and FASTA tiers, future performance reports should include:

- p50, p75, and p95 load-to-usable time
- max time and run count
- visible node and visible link counts
- worker or algorithm time
- Cytoscape render time
- peak memory when available
- long-task or frame-gap measurements for browser responsiveness

This keeps algorithm improvements separate from browser repaint or layout costs. For Newick, that distinction is important because a fast cached patristic threshold query can still be followed by a slow Cytoscape repaint if the threshold exposes many visible edges.

## How to Interpret Future Results

When a generated fixture improves more than a real sample, first check whether both datasets exercise the same code path. A refactor can be very effective for one data type while having a smaller effect on another because the expensive work is different.

When an uploaded edge-list workflow keeps the same total link count before and after a refactor, that is usually correct. The app is preserving user-provided edges. Performance improvements on that path normally come from shared loading, visibility, rendering, or interaction improvements rather than changing the graph shape.

When synthetic and real datasets disagree, that does not automatically mean one is wrong. It means the workload is different. The next step is to identify which data shape feature explains the difference, then decide whether the synthetic fixture should be adjusted.

## Practical Rule

For performance decisions, use synthetic fixtures to measure controlled changes and use real datasets to keep those measurements honest.
