# Local Sigma layout performance

The opt-in `sigma-layout.perf.cy.ts` spec uses the existing performance capture,
artifact writer, and summarizer. It complements `sigma-scalability.perf.cy.ts`,
whose original connected-graph cases remain unchanged. No app behavior is changed.

| Dataset | Fresh load | Increasing threshold in one session |
| --- | --- | --- |
| Existing 1,600 / 5,000 / 10,000-node CSV graphs | Original 16; additional 4 | 4 → 8 → 12 |
| Frozen 4,409-node Nextstrain MicrobeTrace session | Independent 1, 5, 7 | 1 → 5 → 7 |

Every new fresh load and threshold step is followed by a separately measured
Recalculate Layout. A recalculation after an increase is therefore measured with
warm genetic-distance caches and current positions. The initial load of each
increasing path supplies its fresh-load measurement, avoiding duplicate uploads
of the same file at the same starting threshold. Each scenario has one sample per
repetition. The increasing path intentionally includes the preceding recalculation.

## Saved Nextstrain fixture

Use the original `Nextstrain-distance-1-no-positions.microbetrace` session supplied
for the layout review. Either copy it into `cypress/fixtures/performance/local/`
(ignored by Git) or provide its path with `--session`. There are no live Nextstrain
requests. The manifest `cypress/fixtures/performance/sigma-layout-nextstrain.json`
pins its SHA-256, node count, and independently computed visible-link counts:

| Threshold | Complete visible links |
| --- | ---: |
| 1 | 2,930 |
| 5 | 38,548 |
| 7 | 83,051 |
| 8, excluded | 109,425 |

The Node task checks the original file hash and absence of node positions and
saved camera state. It changes the requested threshold **before** restoring a
copy, and removes historical performance timestamps. The source file is unchanged.
The retained tree, genetic links, and other session contents stay intact.

## Running locally

The complete collection starts a dedicated app at port 4210, performs one
excluded warmup and five measured repetitions, and summarizes only measured data:

```powershell
npm run e2e:perf:sigma-layout
```

For a filtered run, start the app in one terminal:

```powershell
npm run start:local-cypress
```

Run the collector in another:

```powershell
npm run e2e:perf:sigma-layout:local -- --runs 5 --warmups 1 --label layout-after
npm run e2e:perf:sigma-layout:local -- --runs 1 --warmups 0 --tier average --case increase
npm run e2e:perf:sigma-layout:local -- --tier nextstrain --session "C:\path\Nextstrain-distance-1-no-positions.microbetrace"
```

`--tier` accepts `average`, `large`, `stress`, or `nextstrain`; omission selects all.
`--case` accepts `all`, `baseline` (original Sigma spec), `cold`, or `increase`.
The collector launches Chrome serially, disables retries, and limits retained
Cypress command history to reduce heap-measurement interference.

Allow roughly **45 minutes per commit** for the default collection on the review
laptop (about 7½ minutes per complete pass, one warmup plus five measured passes).
A two-commit comparison is approximately **90 minutes**, plus checkout/build time.
These scheduling estimates come from Windows/Chrome 157 validation on 2026-11-13;
they are not a performance-regression conclusion or a speed budget.

## Measurements and comparisons

Each operation waits for a **new completed Sigma render**, the requested threshold,
exact analytical/resident link counts, readiness flags, and (for actions) two
animation frames. This avoids timing only the handler return or a fixed wait.
Threshold changes call the shared `applyLinkThreshold` handler; recalculations call
`updateLayout`, also used by the toolbar. Camera animation is not a layout metric.
No compatibility-renderer or guardrail fallback qualifies as a valid result.

Artifacts include load-to-ready or action-to-ready duration, Sigma render duration,
genetic-edge lookup time, cluster/backbone counts, long tasks, heap snapshots,
and action frame gaps. Heap snapshots are **not peak memory**. Genetic-edge lookup
is timed separately from the complete render; cluster packing and member force
simulation are included in render duration rather than separately instrumented.
Test-only wrappers delegate unchanged to the app methods.

Each batch is isolated under
`cypress/downloads/performance/sigma-layout/<label>-<timestamp>/{warmups,measured}/`.
The measured folder contains the existing JSON/Markdown baseline summary; its
minimum stable sample count remains five. Commit, dirty state, browser version,
hardware, fixture hash, phase, and repetition are recorded with the artifacts.
Use medians and observed spread for five samples; tail percentiles are descriptive.

Compare `5fd4b4e` with `5d8570c8` using the **same test harness**, fixture, browser,
viewport, build mode, and hardware. Serve each checkout in turn on port 4210, with
one server and no concurrent benchmark. Transfer only the benchmark changes into
the baseline checkout, since those tests did not previously exist. The baseline
lacks the new merge-layout API; tests record that fact instead of requiring it.
On the updated app, multi-cluster cases must actually use the genetic merge
backbone. Inspect `sigmaRenderMs`, `mergeEdgeLookupMs`, `actionToReadyMs`, and
long-task durations alongside end-to-end load timing. A passing run verifies the
measurement and graph counts; it does not assert an unreviewed speed budget.
