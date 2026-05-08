# Performance Baseline Plan

This plan defines how MicrobeTrace should discover current performance, decide what is reasonable for users, and turn stable measurements into future budgets.

## Goals

- Establish repeatable baseline measurements for representative uploaded datasets.
- Separate loading performance from post-load interaction responsiveness.
- Identify the slow phases before choosing optimization work.
- Delay hard pass/fail timing budgets until the baseline is stable across repeated runs.
- Keep performance scenarios outside the normal Cypress journey/view-state suites.

## Dataset Tiers

Use deterministic generated fixtures for repeatability and real user-like samples for validation.

| Tier | Purpose | Starting shape |
| --- | --- | --- |
| Average | Expected daily-use dataset | 1600 nodes / 3200 links; 120 clustered aligned sequences; 500 Newick leaves |
| Large | Upper-normal user dataset | 5000 nodes / 10000-25000 links; 300 clustered aligned sequences; 1000-2000 Newick leaves |
| Stress | Probe failure modes and guardrails | 10000 nodes / 25000 links; 2000 Newick leaves |

Every performance artifact should record dataset shape:

- file names and file sizes
- node count, total link count, visible link count
- sequence count and sequence length when present
- Newick leaf count and emitted patristic edge count when present
- selected distance metric, threshold, and default view

## Measurement Model

Measure phases rather than only total elapsed time.

For all uploaded-data scenarios:

- file attach/read time
- file-settings-to-launch time
- launch-to-fully-loaded time
- fully-loaded-to-target-view-ready time
- total measured time
- node/link/visible-link counts
- heap delta when Chrome exposes `performance.memory`
- long-task count, max duration, and total duration

For Newick/patristic scenarios:

- Newick parse time
- tree flattening time
- validation time
- LCA preprocessing time
- pair scan time
- emitted edge count
- threshold re-query time
- whether threshold changes reuse the cached tree

Next instrumentation targets:

- CSV parse and node/link merge timing
- FASTA parse and sequence-distance worker timing
- `addNode` / `addLink` merge cost
- `setLinkVisibility`, `tagClusters`, and cluster visibility timing
- Cytoscape element creation, layout, and first interactive render timing
- Table/Aggregate/Heatmap data preparation timing

## UX Targets

Initial targets are guidance, not hard budgets.

| Experience | Target band |
| --- | --- |
| Instant/simple UI feedback | under 1s |
| Acceptable lightweight operation | 1-3s |
| Acceptable load with clear progress | 3-10s |
| Heavy load requiring specific progress text | 10-30s |
| Very heavy load requiring cancel/warning/progressive behavior | over 30s |

Starting expectations for average datasets:

- generated graph load to 2D: under 5-8s after optimization
- generated sequence load plus Alignment readiness: under 10-15s after optimization
- generated Newick/patristic load to 2D: under 5-10s after optimization
- switching to an already-loaded view: under 1-3s

These targets should be revised after several baseline runs on stable hardware and CI.

## Interaction Responsiveness

Loading and interaction must be measured separately. The generated graph performance suite now includes 2D interaction probes for both the average and large graph tiers:

- 2D pan and zoom
- node drag
- box select
- threshold change

Additional interaction probes to add after the graph baseline is stable:

- hover tooltip
- style changes
- grouping toggles
- view switching
- dashboard pane resize

Use these starting responsiveness bands:

| Metric | Interpretation |
| --- | --- |
| p95 input-to-update under 100ms | good |
| 100-250ms | acceptable for heavier UI |
| 250-500ms | sluggish |
| over 500ms | should be treated as a product problem unless the operation is explicitly heavy |

Add an app-side `requestAnimationFrame` probe for interaction tests so Cypress can record frame gaps during pan/zoom/drag flows. Cypress alone can prove correctness and high-level timing, but frame-gap probes are better for perceived smoothness.

## Implementation Phases

### Phase 1: Baseline Harness

- Keep `cypress/e2e/performance/**/*.perf.cy.ts` out of normal journey/view-state runs.
- Run performance specs only with `perfMode=1`.
- Write one JSON artifact per scenario and one summary artifact under `cypress/downloads/performance/`.
- Commit deterministic generated fixtures for average graph, sequence, and Newick scenarios.
- Fail only on correctness, missing metrics, app errors, or Cypress timeouts.

### Phase 2: Phase-Level App Instrumentation

- Add lightweight timing collectors around CSV, FASTA, distance computation, graph merge, visibility, clustering, and Cytoscape render phases.
- Store latest timings under `session.meta.performance` so Cypress can collect them without scraping console output.
- Keep instrumentation always safe in production builds, but only assert/report it in perf-mode Cypress.

### Phase 3: Large Dataset Scenarios

- Add generated large graph, large sequence, and large Newick fixtures behind `perfLarge=1`.
- Add generated stress graph and stress Newick fixtures behind manual-only `perfStress=1`.
- Add real sample scenarios behind an opt-in env flag such as `perfRealSamples=1`.
- Add view-switch and dashboard-readiness measurements for large loaded datasets.

### Phase 4: Interaction Probes

- Add controlled Cypress interaction specs for pan/zoom, drag, select, threshold, style, grouping, and dashboard resize.
- Add frame-gap and long-task summaries for each interaction.
- Record p50/p95/max interaction latency where the probe can measure it reliably.

### Phase 5: Budgets

- Run each scenario 5-10 times on stable hardware and CI.
- Use p50 as the expected experience and p95 as the budget baseline.
- Generate a descriptive baseline summary with `npm run e2e:perf:summarize` before proposing budgets.
- Generate candidate budget thresholds with `npm run e2e:perf:budgets:propose`; only scenarios meeting the sample threshold are eligible.
- Start with warning thresholds before failing CI.
- After stability, set:
  - warning threshold: p95 x 1.25
  - failure threshold: p95 x 1.5
- Review budgets after major performance refactors or dependency upgrades.

## Optimization Workflow

For each performance issue:

1. Reproduce with a deterministic perf scenario.
2. Identify the slowest measured phase.
3. Profile that phase in Chrome DevTools or targeted app instrumentation.
4. Make one optimization at a time.
5. Rerun the same perf scenario and compare artifacts.
6. Only promote the improvement to a budget after repeated stable runs.

Document issue-specific investigations as short case studies when they identify a concrete bottleneck and fix. The `problem_10k.csv` node-only investigation is captured in `docs/problem-10k-node-only-performance.md`.

Likely optimization areas:

- reducing `addLink` per-link overhead
- reducing duplicate link/matrix/Cytoscape data structures
- avoiding full rendered edge materialization when threshold hides most links
- caching Newick preprocessing across threshold changes
- moving large raw file contents out of long-lived JS heap
- reducing heavy synchronous work during styling/filtering changes
- deferring or virtualizing expensive view data preparation

## Baseline Summaries

After one or more perf runs, summarize artifacts with:

- `npm run e2e:perf:summarize`

To collect repeated baseline samples and summarize them in one command, use:

- `npm run e2e:perf:collect -- --runs 5`
- `npm run e2e:perf:collect -- --runs 5 --large`
- `npm run e2e:perf:collect -- --runs 5 --large-only`
- `npm run e2e:perf:collect -- --runs 5 --stress`
- `npm run e2e:perf:collect -- --runs 5 --stress-only`
- `npm run e2e:perf:collect -- --runs 5 --real`
- `npm run e2e:perf:collect -- --runs 5 --real-only`

The summarizer reads per-scenario JSON files from `cypress/downloads/performance/`, ignores aggregate `*-summary.json` files, and writes:

- `cypress/downloads/performance/baseline-summary.json`
- `cypress/downloads/performance/baseline-summary.md`
- `cypress/downloads/performance/latest-baseline-summary.json`
- `cypress/downloads/performance/latest-baseline-summary.md`

The JSON summary includes p50, p75, p90, p95, min, max, mean, and standard deviation for top-level Cypress timings, heap/long-task metrics, and app-side phase timings under `app.performance.*`.

The summarizer excludes obsolete or one-off historical scenario IDs by default so renamed fixtures and comparison experiments do not appear as active baseline work. Use `--include-obsolete` only when intentionally reviewing historical local artifacts.

The perf npm scripts set `trashAssetsBeforeRuns=false` so Cypress keeps prior performance artifacts. This is intentional for baseline comparison; run artifacts remain ignored under `cypress/downloads/performance/`.

The npm summarizer command uses `--min-samples 5`. Scenarios with fewer samples remain useful for debugging, but should not be treated as stable enough for budget decisions. Override the threshold only for local experiments.

## Budget Proposals

After enough repeated samples are collected, generate candidate budgets with:

- `npm run e2e:perf:budgets:propose`

The proposal reads `cypress/downloads/performance/baseline-summary.json` and writes:

- `cypress/downloads/performance/budget-proposal.json`
- `cypress/downloads/performance/budget-proposal.md`
- `cypress/downloads/performance/latest-budget-proposal.json`
- `cypress/downloads/performance/latest-budget-proposal.md`

By default, budget candidates are produced only for scenarios with at least 5 samples. Thresholds are calculated from p95 values using:

- warning: `p95 * 1.25`
- failure: `p95 * 1.5`

This is a proposal step only. Do not enforce these numbers until they have been reviewed against stable hardware or CI runs.

## Budget Checks

Reviewed thresholds live in `cypress/performance/budgets.json`. Start from `cypress/performance/budgets.example.json` or a generated proposal, then copy only the thresholds that are stable enough to enforce.

Check the latest perf run against reviewed budgets with:

- `npm run e2e:perf:budgets:check`

The checker writes:

- `cypress/downloads/performance/budget-check.json`
- `cypress/downloads/performance/budget-check.md`
- `cypress/downloads/performance/latest-budget-check.json`
- `cypress/downloads/performance/latest-budget-check.md`

By default, missing `budgets.json` is not an error and checks are report-only. This lets the workflow run locally or in CI before any timing gates are committed.

Use stricter modes only after the budget config is reviewed:

- `npm run e2e:perf:budgets:check -- --require-config` to fail when no reviewed budget config exists.
- `npm run e2e:perf:budgets:check:enforce` to fail on budget failures or missing configured metrics.
- `npm run e2e:perf:budgets:check -- --fail-on-warning` to fail on warnings, failures, or missing configured metrics.

The checker accepts both the reviewed `budgets.json` shape and the generated proposal shape, so a proposal can be sanity-checked directly before manually curating the committed config.

## CI Reporting

Package the latest performance outputs into a compact report with:

- `npm run e2e:perf:report`

The report packager reads the latest Cypress summary, baseline summary, budget proposal, and budget check when present, then writes:

- `cypress/downloads/performance/performance-report.json`
- `cypress/downloads/performance/performance-report.md`
- `cypress/downloads/performance/latest-performance-report.json`
- `cypress/downloads/performance/latest-performance-report.md`

For a one-command local CI-style pass, use:

- `npm run e2e:perf:ci`

That command runs the average generated performance suite, summarizes artifacts, checks reviewed budgets in report-only mode, and packages the final report.

The repository also includes a manual GitHub Actions workflow, `.github/workflows/performance-baseline.yml`. Trigger it with `workflow_dispatch` to run one or more baseline samples on GitHub-hosted hardware, optionally include large, stress, or real-sample scenarios, upload `cypress/downloads/performance/**`, and append the Markdown report to the job summary. Budget enforcement remains off unless the workflow input `enforce_budgets` is set to `true`.

## Real Sample Scenarios

Real samples are opt-in so deterministic generated fixtures remain the default baseline. To enable real samples:

1. Copy `cypress/fixtures/performance/real-samples.example.json` to `cypress/fixtures/performance/real-samples.json`.
2. Place sample files under `cypress/fixtures/performance/real-samples/` or use fixture-relative paths in each file entry.
3. Fill in expected counts and field mappings.
4. Set `enabled` to `true` for each scenario that should run.
5. Run `npm run e2e:perf:real`.

The real-sample manifest supports:

- `files`: same upload metadata shape used by generated performance scenarios.
- `preLaunch`: metric, threshold, and default view.
- `expected`: required node count plus optional total links, visible links, and sequence count.
- `viewChecks`: optional `alignment` and `phylogeneticTree` readiness measurements.
- `timeoutMs`: optional per-scenario timeout for larger files.

When `perfRealSamples=1` is set, Cypress validates the manifest and referenced files before upload. Missing files or invalid enabled scenarios fail the real-sample spec. If no manifest or no enabled scenarios exist, the opt-in spec logs that nothing is configured and exits without producing artifacts.

## Current Starting Point

The initial baseline harness includes:

- average graph: 1600 nodes / 3200 links
- average sequences: 120 aligned FASTA sequences in 8 deterministic SNP clusters, 7140 total links, 840 visible links at SNP threshold 16
- average Newick: 500 leaves with clustered patristic distances
- opt-in large graph: 5000 nodes / 10000 links
- opt-in large sequences: 300 aligned FASTA sequences in 15 deterministic SNP clusters, 44850 total links, 2850 visible links at SNP threshold 16
- opt-in large Newick: 1000 leaves with clustered patristic distances
- manual-only stress graph: 10000 nodes / 25000 links
- manual-only stress Newick: 2000 leaves with clustered patristic distances, including threshold re-query from 12000 to 49000 visible links
- patristic worker telemetry for preprocessing and edge generation
- app-side ingestion/load/network timings under `session.meta.performance`
- 2D Cytoscape render timings under `session.meta.performance.render`
- adaptive D3 precompute batching for 2D layout, with dense generated graphs kept on smaller tick batches to avoid long-task regressions
- optimized initial 2D element validation to use set lookups and keep large debug object logs behind `debugMode`
- initial 2D Cytoscape render finalization via constructor `preset` readiness instead of a second explicit preset layout run
- average and opt-in large 2D interaction frame-gap metrics for pan, zoom, drag, box select, and threshold change
- manual-only stress 2D interaction frame-gap metrics for pan, zoom, drag, box select, and threshold change
- opt-in real-sample manifest support through `perfRealSamples=1`
- aggregate JSON summary output in `cypress/downloads/performance/latest-summary.json`
- descriptive p50/p95 summaries via `npm run e2e:perf:summarize`

Use:

- `npm run e2e:perf` for the default average baseline.
- `npm run e2e:perf:large` for the opt-in upper-normal large dataset tier.
- `npm run e2e:perf:stress` for the manual-only stress graph and Newick tier.
- `npm run e2e:perf:real` for configured real sample scenarios.
- `npm run e2e:perf:summarize` to compare recorded artifacts across runs.
- `npm run e2e:perf:budgets:propose` to generate candidate warning/failure thresholds after enough samples exist.
- `npm run e2e:perf:budgets:check` to compare the latest run against reviewed budgets in report-only mode.
- `npm run e2e:perf:report` to package the latest run, summary, proposal, and budget check for CI or manual review.
- `npm run e2e:perf:ci` for a local average-run report-only CI pass.
- `npm run e2e:perf:collect -- --runs 5 --large` to collect candidate budget samples.
- `npm run e2e:perf:collect -- --runs 5 --stress-only` to collect manual stress samples without mixing in average/large runs.

Do not use the first few timing values as budgets. Use them to verify the harness, expose missing instrumentation, and identify which phases need attention first.
