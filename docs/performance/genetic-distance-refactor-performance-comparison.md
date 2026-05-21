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

The review follow-up is to keep the performance conclusion and the output-correctness conclusion separate. The timing comparison shows that the Newick/patristic refactor improved scaling. The output validation harness described below is the stricter check that the optimized path produces the same visible 2D Newick network as the pre-refactor path for the same file, metric, and threshold.

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

In this report, "validated" means automated evidence unless a row explicitly says otherwise. No manual-only confirmation is counted as validation evidence in the table below.

| Area | Evidence type | Coverage |
| --- | --- | --- |
| Newick worker launch, threshold re-query, session reload, SNP/TN93 metric behavior, invalid duplicate-tip input, invalid negative-branch input, and browser guardrail behavior | Automated Cypress journey regression | `cypress/e2e/journeys/flows/patristic-newick-worker.cy.ts` |
| Genetic-distance and patristic before/after timing comparison | Automated Cypress performance harness | `cypress/e2e/performance/genetic-compare.perf.cy.ts` |
| Generated FASTA/Newick 2D interaction responsiveness | Automated Cypress performance harness | `cypress/e2e/performance/interaction-genetic-average.perf.cy.ts`, `interaction-genetic-large.perf.cy.ts`, and `interaction-genetic-stress.perf.cy.ts` |
| Newick visible 2D output parity between pre-refactor and current builds | Automated strict parity capture and Node comparator | `cypress/e2e/performance/newick-parity-capture.perf.cy.ts` and `scripts/compare-newick-parity.js` |
| MT-generated tree compared with reference `.nwk` files | Automated report-first capture and Node comparator | `cypress/e2e/performance/newick-tree-capture.perf.cy.ts` and `scripts/compare-newick-trees.js` |
| Phylogenetic Tree downstream behavior | Automated Cypress journey and view-state regression | `upload-launch-phylo.cy.ts`, `upload-launch-phylo-direct.cy.ts`, `phylogenetic-view-export.cy.ts`, `phylogenetic-computed-export.cy.ts`, `phylogenetic-controls-uploaded.cy.ts`, `phylogenetic-metadata-uploaded.cy.ts`, `phylogenetic-session-roundtrip.cy.ts`, and `cypress/e2e/view-state/phylogenetic-view.cy.ts` |
| Table downstream behavior | Automated Cypress journey regression | `table-load-uploaded.cy.ts`, `table-direct-launch-uploaded.cy.ts`, `table-columns-uploaded.cy.ts`, `table-controls-uploaded.cy.ts`, `table-refresh-uploaded.cy.ts`, `table-selection-uploaded.cy.ts`, `table-export-uploaded.cy.ts`, `table-filter-operators-uploaded.cy.ts`, and `table-empty-state.cy.ts` |
| Aggregate and Crosstab downstream behavior | Automated Cypress journey and view-state regression | `aggregate-view-uploaded.cy.ts`, `aggregate-controls-uploaded.cy.ts`, `aggregate-export-uploaded.cy.ts`, `aggregate-large-uploaded.cy.ts`, `upload-launch-crosstab.cy.ts`, `crosstab-file-types.cy.ts`, `crosstab-refresh-uploaded.cy.ts`, `cypress/e2e/view-state/aggregate-view.cy.ts`, `crosstab-view.cy.ts`, and `crosstab-export.cy.ts` |
| Sankey, Waterfall, and Heatmap downstream behavior | Automated Cypress journey and view-state regression | `upload-launch-sankey.cy.ts`, `sankey-direct-launch-uploaded.cy.ts`, `sankey-controls-uploaded.cy.ts`, `sankey-cluster-filtering-uploaded.cy.ts`, `sankey-large-uploaded.cy.ts`, `waterfall-load-uploaded.cy.ts`, `waterfall-direct-launch-uploaded.cy.ts`, `waterfall-session-roundtrip.cy.ts`, `waterfall-refresh-uploaded.cy.ts`, `waterfall-drilldown-uploaded.cy.ts`, `waterfall-details-uploaded.cy.ts`, `upload-launch-heatmap.cy.ts`, `heatmap-direct-launch-uploaded.cy.ts`, `heatmap-controls-uploaded.cy.ts`, `heatmap-session-roundtrip.cy.ts`, `heatmap-large-uploaded.cy.ts`, and `cypress/e2e/view-state/heatmap-view.cy.ts` |
| Manual confirmation | Not used as validation evidence in this report | Any future manual review should be labeled separately from automated regression coverage. |

The downstream-view rows mean the views have automated regression coverage that exercises uploaded data and persisted state around the refactor. They are not visual-only manual confirmations.

## Newick Output Validation

Newick refactor validation uses automated parity testing rather than manual visual inspection. The same Newick fixture is loaded in the pre-refactor and refactored builds using the same metric and threshold. Cypress captures normalized snapshots of the visible 2D network, including node IDs, visible edge source/target pairs, and patristic distance values. A Node comparator sorts and compares these snapshots and fails on missing nodes, extra nodes, missing edges, extra edges, or patristic distance differences greater than `1e-6`. This confirms that the optimized Newick worker path produces the same threshold-visible 2D network as the pre-refactor implementation for the tested inputs.

Downstream view validation refers to automated Cypress journey/view-state checks unless explicitly labeled as manual. Manual inspection is not counted as validation evidence.

The formal Newick validation layer has two parts:

- strict visible-2D parity for the refactor output
- report-first tree comparison for FASTA/full-data tree reconstruction

### Strict 2D Parity Coverage

The parity capture spec is `cypress/e2e/performance/newick-parity-capture.perf.cy.ts`; the comparator is `scripts/compare-newick-parity.js`. This path intentionally compares visible 2D network output rather than `session.data.links.length`, because the refactor changed startup behavior to avoid materializing all above-threshold Newick edge candidates.

| Fixture | Metric | Thresholds | Expected nodes | Expected visible links | Tree shape covered | Strict assertion status |
| --- | --- | --- | ---: | --- | --- | --- |
| `AngularTesting_seqs_TN93_BS.nwk` | TN93/patristic | `0.015`, `0.02`, `0.001` | 14 | 14, 45, 2 | small curated regression Newick with known topology and branch lengths | strict pre-refactor/current parity |
| `performance/average-newick-500.nwk` | TN93/patristic | `0.003`, `0.006` | 500 | 3,000, 12,250 | deterministic generated clustered tree; 10 clusters x 50 leaves; fixed terminal branch lengths and long root attachments | strict pre-refactor/current parity |
| `performance/large-newick-1000.nwk` | TN93/patristic | `0.003` | 1,000 | 6,000 | deterministic generated clustered tree; 20 clusters x 50 leaves; same branch-length pattern as average fixture | strict pre-refactor/current parity |
| `performance/stress-newick-2000.nwk` | TN93/patristic | `0.003`, `0.006` | 2,000 | 12,000, 49,000 | deterministic generated clustered tree; 40 clusters x 50 leaves; manual stress tier | implemented behind `parityStress=1`; manual opt-in run because of runtime |

In the first implemented pre-refactor versus current run, the strict parity comparator compared six snapshots across the AngularTesting, average Newick, and large Newick scenarios with zero parity failures. The stress Newick parity scenario is available as an opt-in stress run and should be reported separately when executed.

### Newick Worker Regression Coverage

The journey regression spec `cypress/e2e/journeys/flows/patristic-newick-worker.cy.ts` adds strict assertions for the main Newick worker behaviors:

| File | Thresholds or condition | Strict automated assertion |
| --- | --- | --- |
| `AngularTesting_seqs_TN93_BS.nwk` | launch at `0.015` | expected node/link counts, stored Newick string, numeric visible distances, and Newick file metadata on visible edges |
| `AngularTesting_seqs_TN93_BS.nwk` | threshold sequence `0.015` -> `0.02` -> `0.001` -> `0.015` | visible Cytoscape edge counts recover exactly as 14 -> 45 -> 2 -> 14 |
| `AngularTesting_seqs_TN93_BS.nwk` | forced browser guardrail limit of 20 visible links, then threshold `0.02` | warning appears, visible edge count stays at 14, and guardrail telemetry is recorded |
| `AngularTesting_seqs_TN93_BS.nwk` | save/reload after threshold `0.02` | saved session reloads with threshold `0.02`, 45 visible links, and preserved Newick string |
| `PatristicSynthetic_snp_gt1.nwk` | SNP-scale Newick distances greater than one | metric switches to SNP, threshold becomes 16, three visible links render with numeric distances |
| `PatristicDuplicateTips.nwk` | duplicate leaf/tip labels | upload is rejected and no corrupt network links are created |
| `PatristicNegativeBranch.nwk` | invalid negative branch length | upload is rejected with branch context and no corrupt network links are created |

### Report-First Tree Comparison Coverage

The tree-comparison path is report-first rather than strict pass/fail. It loads paired FASTA/full-data scenarios, captures the Newick exported from MicrobeTrace's Phylogenetic Tree view, and compares it with the reference `.nwk` by:

- leaf-set differences
- shared and missing topology splits
- normalized RF-style topology distance
- matching-split branch-length deltas
- pairwise patristic distance deltas

Tree string equality is not used. An inferred tree built from FASTA or distance data may legitimately differ from the original reference tree depending on the distance metric, tree-building method, rounding, and model mismatch. Hard failures should stay limited to parse errors and leaf-set mismatches until bioinformatics reviewers approve acceptable topology and branch-length thresholds.

| Input data | Reference tree | Metric/threshold | Comparison mode |
| --- | --- | --- | --- |
| `AngularTesting_seqs_TN93_BS.fasta` | `AngularTesting_seqs_TN93_BS.nwk` | TN93 at `0.015` | report-first tree reconstruction comparison |
| `performance/realistic/pathogen-musse-500-nodes.csv` plus `performance/realistic/pathogen-musse-500.fasta` | `performance/realistic/pathogen-musse-500.nwk` | SNP at `16` | report-first tree reconstruction comparison |

The first tree-comparison report completed for both scenarios with zero hard failures.

### Downstream View Coverage

Downstream view coverage is automated Cypress coverage, not manual visual inspection. These checks exercise view readiness, rendered data model assertions, export/session behavior, or uploaded-data smoke paths after the refactor.

| View family | Automated coverage files |
| --- | --- |
| Phylogenetic Tree | `upload-launch-phylo.cy.ts`, `upload-launch-phylo-direct.cy.ts`, `phylogenetic-view-export.cy.ts`, `phylogenetic-computed-export.cy.ts`, `phylogenetic-controls-uploaded.cy.ts`, `phylogenetic-metadata-uploaded.cy.ts`, `phylogenetic-session-roundtrip.cy.ts`, `cypress/e2e/view-state/phylogenetic-view.cy.ts` |
| Table | `table-load-uploaded.cy.ts`, `table-direct-launch-uploaded.cy.ts`, `table-columns-uploaded.cy.ts`, `table-controls-uploaded.cy.ts`, `table-refresh-uploaded.cy.ts`, `table-selection-uploaded.cy.ts`, `table-export-uploaded.cy.ts`, `table-filter-operators-uploaded.cy.ts`, `table-empty-state.cy.ts` |
| Aggregate and Crosstab | `aggregate-view-uploaded.cy.ts`, `aggregate-controls-uploaded.cy.ts`, `aggregate-export-uploaded.cy.ts`, `aggregate-large-uploaded.cy.ts`, `upload-launch-crosstab.cy.ts`, `crosstab-file-types.cy.ts`, `crosstab-refresh-uploaded.cy.ts`, `cypress/e2e/view-state/aggregate-view.cy.ts`, `crosstab-view.cy.ts`, `crosstab-export.cy.ts` |
| Sankey | `upload-launch-sankey.cy.ts`, `sankey-direct-launch-uploaded.cy.ts`, `sankey-controls-uploaded.cy.ts`, `sankey-cluster-filtering-uploaded.cy.ts`, `sankey-large-uploaded.cy.ts` |
| Waterfall | `waterfall-load-uploaded.cy.ts`, `waterfall-direct-launch-uploaded.cy.ts`, `waterfall-session-roundtrip.cy.ts`, `waterfall-refresh-uploaded.cy.ts`, `waterfall-drilldown-uploaded.cy.ts`, `waterfall-details-uploaded.cy.ts` |
| Heatmap | `upload-launch-heatmap.cy.ts`, `heatmap-direct-launch-uploaded.cy.ts`, `heatmap-controls-uploaded.cy.ts`, `heatmap-session-roundtrip.cy.ts`, `heatmap-large-uploaded.cy.ts`, `cypress/e2e/view-state/heatmap-view.cy.ts` |

## Review Follow-Up Items

The current report is strong local before/after evidence, but it should not be treated as a final performance budget. Follow-up reports should add:

- p75, p90 or p95, min, max, and run count, not only p50
- failed or timed-out run counts
- peak heap, retained heap after load, heap after threshold re-query, and heap after reload/export when browser APIs expose memory data
- worker timing separated from graph-state update, Cytoscape element update, layout, and frame-gap timing
- larger browser-scoped Newick baselines, especially 5,000 leaves and manual 10,000-leaf stress
- 1,000+ sequence FASTA baselines before making sequence-scaling claims
- explicit labels for automated versus manual downstream validation

For browser-based MicrobeTrace, the revised stress guidance is that 10,000-leaf Newick and 5,000-sequence FASTA fixtures are manual stress tests, while 25,000+ Newick leaves or 10,000+ FASTA sequences are failure-mode tests for warning, throttling, crash resistance, or subsetting guidance rather than routine performance targets.

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
