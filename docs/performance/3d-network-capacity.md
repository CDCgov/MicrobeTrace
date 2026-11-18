# 3D Network capacity benchmark

Historical default-style baseline: October 29, 2026, against `806c76ac` plus the working-tree trackball camera changes. The [November 16 styling comparison](#current-renderer-and-detailed-styling--november-16-2026) below measures the post-merge renderer before the latest shape upgrade. For the complete shape update, use the [direct original-six versus latest benchmark](3d-shape-original-vs-latest-2026-11-17.md): 36 fresh paired samples using the starting coarse meshes as the baseline. The [intermediate-refinement optimization benchmark](3d-shape-optimization-2026-11-17.md) and [original-to-first-refinement comparison](3d-shape-comparison-2026-11-17.md) describe separate stages; their results should not be combined into a direct original/latest estimate. Conservative size guidance remains unchanged.

## Recommendation

For this workstation and the default styling, use **about 750 visible nodes and 1,500 visible links** as the conservative recommendation for smooth navigation while the layout is calculating. All five samples met the chosen frame-time target. Rotation averaged 44–57 fps during layout and approximately 60 fps after freezing.

**1,000 nodes / 2,000 links** is a reasonable upper everyday tier, with less consistent layout responsiveness: 30–45 fps, and a worst p95 of 50.2 ms. Four of five samples met the strict frame-time target. Once frozen, navigation stayed approximately 60 fps.

For larger graphs, let the layout finish and use **Freeze Layout**. **2,000 nodes / 4,000 links** maintained approximately 60 fps for frozen navigation in all five samples, but layout-time rotation was only 14–18 fps. This is a conditional recommendation for inspecting an established layout.

Avoid recommending **5,000 nodes / 10,000 links** for fluid navigation with the current renderer: frozen rotation was 23–28 fps, and layout-time rotation was about 5 fps. The intermediate **2,000 / 10,000** tier was variable at 24–36 fps frozen. Use shared filters to show a smaller subset, or use 2D Network for broader exploration.

These counts refer to the visible graph after filtering. Node count alone is insufficient: 500 nodes with 5,000 links had less consistent layout performance than 750 nodes with 1,500 links. These are tested tiers, not exact maximum sizes or guarantees for every graph within a rectangular node/link limit.

Capacity also depends strongly on styling. With labels, shape frames, mixed-origin links, and arrows enabled together, start around **250 visible nodes / 500 links** on comparable hardware. The current measurements below explain this more conservative starting point for detailed figures.

## Current renderer and detailed styling — November 16, 2026

Measured against merge commit `bcdcd8fc` plus the pending 3D review refinements, camera stability while docking legends, and repairs enforcing exactly 150 deterministic layout steps. This is a focused comparison with **two samples per size/style combination**, using the existing generated fixtures and opt-in benchmark. It supplements the historical five-sample matrix.

Both profiles used headed Chrome **157.0.8103.51**, Cypress 15.16.0, the local development build, Intel Arc Graphics through ANGLE/Direct3D 11, an Intel Core Ultra 7 165H, and 31.5 GiB RAM. Every measurement recorded an application viewport of **1280 × 720**, a **883 × 573** canvas, and device pixel ratio **1**. No other task test browser ran concurrently.

The investigation profile applies six category colors and shapes, degree-mapped node sizes, 1.25-pixel shape frames, ID labels on every node, distance-mapped link widths, 35% link transparency, and distance labels on genetic links. One third of links have dual origins; contact-tracing links are directed, with a subset bidirectional. Canonical origin and distance metadata are enriched consistently so threshold filtering continues to exercise the real shared pipeline. Endpoints and graph size stay unchanged. These are synthetic networks with detailed investigation styling, rather than patient datasets.

Before measuring, the harness validates actual scene objects for labels, frames, origin overlays, and both arrowhead directions. For example, the 750-node profile had 750 node labels/frames, 1,000 distance labels, 500 origin overlays, 1,000 target arrows, and 200 source arrows. All 12 cases completed exactly **150 force steps**, retained the expected visible graph records, supported selection and threshold filtering/restoration, and finished with an intact WebGL context.

| Nodes / links | Styling | Layout orbit fps | Frozen orbit fps | Worst layout p95 | Worst frozen p95 | Qualified layout · frozen |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| 250 / 500 | Default | 60.0 | 60.0 | 16.8 ms | 16.8 ms | 2/2 · 2/2 |
| 250 / 500 | Investigation | 55.1 | 59.5 | 33.4 ms | 16.8 ms | 2/2 · 2/2 |
| 750 / 1,500 | Default | 59.0 | 60.0 | 16.8 ms | 16.8 ms | 2/2 · 2/2 |
| 750 / 1,500 | Investigation | 20.5 | 27.3 | 66.7 ms | 66.7 ms | 0/2 · 1/2 |
| 1,000 / 2,000 | Default | 52.1 | 60.0 | 33.5 ms | 16.8 ms | 2/2 · 2/2 |
| 1,000 / 2,000 | Investigation | 17.4 | 22.6 | 83.4 ms | 66.6 ms | 0/2 · 0/2 |

FPS is the median of the two per-run averages. The frozen p95 is the worst observation across orbit, pan, and zoom in both runs. Qualification uses the existing median gap ≤35 ms and p95 ≤50 ms criteria; it is separate from passing the benchmark's correctness checks. Investigation-style frozen orbit varied from 21.1 to 33.5 fps at 750 nodes, and from 22.2 to 23.0 fps at 1,000 nodes.

| Nodes / links | Default draw calls | Investigation draw calls | Default / investigation textures |
| --- | ---: | ---: | ---: |
| 250 / 500 | 750 | 2,552 | 0 / 259 |
| 750 / 1,500 | 2,250 | 7,650 | 0 / 759 |
| 1,000 / 2,000 | 3,000 | 10,202 | 0 / 1,009 |

These graphics counts matched across both samples and were captured before filtering. Investigation styling used 24 geometries at each size, compared with two for the default profile. Completing the full layout took 2.5–2.8 seconds at 250 styled nodes, 5.7–8.2 seconds at 750, and 7.8–8.2 seconds at 1,000. Default-style completion took 2.5–2.7 seconds across these sizes.

For detailed figures, **250 nodes / 500 links is the largest tested tier that consistently met the responsiveness target during layout and frozen navigation**. Use it as a starting point, then filter or reduce unnecessary labels, frames, and arrows when interaction becomes slow. Freeze an established layout to remove simulation work. At 750–1,000 richly styled nodes, freezing alone did not consistently meet the target. Keep 2D available for broad exploration and use 3D for focused inspection.

The counts between 250 and 750 were not measured with this profile, so 250 is not an established maximum. The default-style results remain consistent with the conservative 750/1,500 guidance. The advisory's size thresholds currently reflect graph counts; detailed styling can cause slowdown below the advisory threshold. Two repetitions, one workstation, one canvas size, and a combined styling profile do not establish universal limits or isolate the cost of each feature. The paired rendering counts and frozen results suggest rendering overhead matters alongside simulation work; a CPU/GPU profile would be needed to attribute that overhead precisely.

Probe version 5 adds the investigation profile, scene validation, selected-case order rotation, exact-step validation, and timing at the engine-stop event. To reproduce, use `perfThreeDCase=250n-500l+750n-1500l+1000n-2000l` with the command below, run each profile twice with distinct `MT_PERF_RUN_ID` values and sample indices, and reverse profile order for the second sample:

```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
$env:MT_PERF_RUN_ID = 'threed-styled-example-1'
npx.cmd cypress run --headed --browser chrome --config 'baseUrl=http://127.0.0.1:4210,trashAssetsBeforeRuns=false,numTestsKeptInMemory=0,video=false' --env 'perfMode=1,perfThreeD=1,perfThreeDStyle=investigation,perfThreeDCase=250n-500l+750n-1500l+1000n-2000l,perfThreeDSampleIndex=1' --spec cypress/e2e/performance/threed-scalability.perf.cy.ts
```

Use `perfThreeDStyle=default` for the comparison profile. All four final invocations passed **3/3**, for **12 passed, 0 failed, 0 pending, 0 skipped, 0 retries**. Cypress durations were 1m 02s (default 1), 1m 12s (investigation 1), 1m 42s (investigation 2), and 59s (default 2). Pre-repair iteration-count pilots and an incomplete run with missing synthetic direction/distance metadata are excluded. Logs, a combined summary, and raw JSON files from this historical run are retained outside the repository in the review archive, with result prefixes `threed-review-20261116-final-default-1` and `threed-review-20261116-styled-fixed-`.

## Repeated results

Five samples per row. FPS columns show the median of the five per-probe average frame rates, followed by the observed range. The frozen p95 column is the **worst** p95 across all five runs and all three frozen camera actions (orbit, pan, zoom). Qualification requires both median frame gap ≤35 ms and p95 ≤50 ms; the layout column tests active orbit, and the frozen column tests all three actions. Values are rounded only for display.

| Nodes | Links | Layout orbit fps, median (range) | Frozen orbit fps, median (range) | Worst layout p95 | Worst frozen p95 | Qualifying samples, layout / frozen |
| ---: | ---: | ---: | ---: | ---: | ---: | :---: |
| 250 | 500 | 59.3 (58–60) | 60.0 (60–60) | 17.1 ms | 17.1 ms | 5/5 · 5/5 |
| 250 | 2,500 | 56.7 (56.1–58.7) | 60.0 (60–60) | 16.9 ms | 17.0 ms | 5/5 · 5/5 |
| 500 | 1,000 | 57.3 (56.7–59.3) | 60.0 (60–60) | 16.9 ms | 17.1 ms | 5/5 · 5/5 |
| 500 | 2,000 | 57.3 (52.7–59.3) | 60.0 (60–60) | 33.4 ms | 17.0 ms | 5/5 · 5/5 |
| 500 | 5,000 | 40.2 (23.3–46.8) | 60.0 (58.7–60) | 133.3 ms | 33.3 ms | 3/5 · 5/5 |
| 750 | 1,500 | 55.3 (44.1–57.3) | 60.0 (60–60) | 33.3 ms | 17.1 ms | 5/5 · 5/5 |
| 1,000 | 2,000 | 39.6 (29.7–45.5) | 60.0 (59.7–60) | 50.2 ms | 17.0 ms | 4/5 · 5/5 |
| 1,000 | 4,000 | 27.4 (22.4–33.6) | 59.7 (56.7–60) | 66.9 ms | 33.3 ms | 2/5 · 5/5 |
| 2,000 | 4,000 | 16.5 (13.7–17.8) | 60.0 (59.7–60) | 116.6 ms | 16.9 ms | 0/5 · 5/5 |
| 2,000 | 10,000 | 9.5 (8.4–14.7) | 31.3 (24.2–36.1) | 383.3 ms | 50.1 ms | 0/5 · 4/5 |
| 5,000 | 10,000 | 5.3 (4.6–5.5) | 25.4 (23.3–27.5) | 533.5 ms | 50.1 ms | 0/5 · 0/5 |

The launch-to-first-observed-render medians ranged from 1.39 to 2.28 seconds across the tiers; the slowest individual observation was 3.12 seconds. These observations do not include force-layout cooldown or file-selection/settings interaction. Startup was not the main limiting factor in this matrix. Loading observations mix first-case lazy initialization with later cases and should not be treated as isolated renderer initialization timings.

The measurements support treating layout-time work as a major constraint: freezing greatly improved performance at the same graph size. This is an inference from the paired phases, not a CPU/GPU profiler attribution to a particular function.

### Larger-canvas check

Two additional cases used an explicitly set **1920 × 1080 application viewport**, producing a measured **1331 × 890 canvas**, with the same Intel Arc GPU and pixel ratio 1. Both passed the refined scene-object and rendered-frame validation. These are single supplementary samples, excluded from the five-run matrix.

| Nodes | Links | Layout orbit fps | Layout p95 | Frozen orbit fps | Worst frozen camera p95 |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 750 | 1,500 | 50.0 | 33.3 ms | 60.0 | 16.9 ms |
| 2,000 | 4,000 | 20.0 | 66.6 ms | 60.0 | 16.8 ms |

The recommended tiers held in these larger-canvas checks. The renderer painted each sampled camera frame, with all expected scene objects present. Immediately after the camera probes, the renderer reported 2,250 and 6,000 draw calls respectively, matching the full node-plus-link counts. This does not establish performance at higher device pixel ratios or on different GPUs.

## Measurement rules

The recommendation uses sustained camera responsiveness, rather than whether a graph can finish loading. The target chosen before the repeated runs was approximately 30 frames per second, with 95% of camera frame gaps at or below 50 ms. A median gap up to 35 ms allows for display refresh quantization around the 33.3 ms target. Camera orbit, pan, and zoom are measured separately. Layout calculation is measured separately from navigation after the layout stops.

This is a workstation-specific recommendation, not a hard application limit. There is no sampling or reduction of visible nodes or links in these tests.

## Environment and coverage

- Dell Precision 3490, Intel Core Ultra 7 165H, 31.5 GiB RAM, Windows 11.
- Headed Chrome 156.0.8078.73, Cypress 15.16.0, local Angular development build.
- WebGL reports **Intel Arc Graphics through ANGLE / Direct3D 11**. The laptop also has an NVIDIA RTX 500 Ada GPU, but Chrome did not use it in the pilot.
- Application viewport 1280 × 720, default docked color key, 3D canvas 883 × 530, device pixel ratio 1.
- Default sphere/cylinder detail, antialiasing and preserved drawing buffer enabled; no other network renderer is open.
- Eleven connected, deterministic synthetic CSV graphs, varying both node count and link density. Each graph has a ring backbone plus seeded additional undirected links, using the existing performance-fixture generator.
- Five independent Cypress invocations, each visiting a fresh application session for each graph. Scenario order rotates between invocations. Automatic retries are disabled for this spec.

Each case checks exact visible and renderer-owned graph record counts, then measures:

1. Launch click to the first observed WebGL render with all expected graph records loaded. This includes normal ingestion, view setup, and lazy loading; it excludes browser startup and file upload/settings interaction.
2. Continuous orbit for 1.5 seconds immediately after restarting the normal force layout. Engine ticks and cooldown are recorded.
3. After the engine stops, freeze the layout, fit the camera, and let the normal camera transition finish. Measure orbit for at least 3 seconds / 30 frame gaps, then pan and zoom for at least 1.5 seconds / 15 gaps each. Each phase has a 12-second observation cap.
4. Select one node, reduce the distance threshold, and restore it. Check selection, exact restored counts, and an intact WebGL context.

The camera probe updates the actual graph camera on every application animation frame. The measurements describe rendering under continuous camera changes; they do not measure physical mouse input latency. Frame percentiles use nearest rank within each probe. Repeated-run summaries distinguish the median result from the worst observed p95. JavaScript heap readings are descriptive snapshots without forced garbage collection and are not a memory-leak test.

The application now shows a large-network advisory before rendering graphs above 750 visible nodes or 1,500 links. Probe version 3 acknowledges this dialog through its Continue in 3D button before waiting for the first rendered frame. Future launch-to-first-paint measurements include that automated interaction and should not be compared directly with the timings recorded here, which predate the advisory. Camera responsiveness measurements still start after the graph has rendered.

Probe version 4 follows the deterministic layout update: the renderer now uses stable ordering, seeded initialization, and 150 simulation steps without the previous six-second wall-clock cutoff. The benchmark allows more time for the full calculation and records the renderer's actual cooldown settings (`null` denotes no time limit). The measurements above predate this change; they remain a historical capacity baseline, and layout duration and final arrangements have not been rebenchmarked under the new stopping rule.

The five-run matrix used probe version 1. A subsequent harness refinement adds explicit scene-object and rendered-frame checks, and takes graphics statistics before filtering, because the library applies topology changes asynchronously. The camera movement and sampling phases are unchanged. The main matrix's end-of-case draw-call statistics can describe the previous filtered frame and are intentionally excluded from the capacity analysis; selection/filter timings are also excluded from the recommendation.

## Run outcomes

All five matrix invocations completed: **55 passed, 0 failed, 0 pending, 0 skipped, 0 retries**. Every sample retained the expected graph records, supported selection and threshold filtering/restoration, and finished without a lost graphics context. Correct rendering and performance qualification are separate results.

| Sample | Cases passed | Invocation wall time, including Cypress startup |
| ---: | ---: | ---: |
| 1 | 11/11 | 253.7 s |
| 2 | 11/11 | 258.6 s |
| 3 | 11/11 | 255.2 s |
| 4 | 11/11 | 260.3 s |
| 5 | 11/11 | 256.8 s |

One preliminary pilot failed on an unsupported assertion spelling in the new benchmark. That assertion was corrected and the pilot passed before collecting the five repetitions. Pilots are excluded from the results above. No final failing spec or retry-only failure occurred in the matrix. Coverage is complete for the requested synthetic 3D capacity matrix; this was not a full application regression.

After the matrix, **2/2 default-viewport diagnostic checks** and **2/2 actual larger-canvas checks** passed, with no retries, pending, or skipped tests. The first attempt to request a larger viewport retained the e2e configuration's default dimensions; those two samples are used only for default-viewport diagnostic validation. The final benchmark explicitly sets viewport size when requested and records actual window/canvas dimensions.

The standalone TypeScript check did not pass because of existing shared Cypress helper typing errors (custom command return types, browser globals, Cytoscape collections, and an existing default-view union). The same shared errors reproduce when checking the existing Sigma performance spec; no error was reported in the new 3D benchmark after including the repository's command declarations. The benchmark itself transpiled and ran successfully through Cypress. This task did not change those unrelated helpers to resolve their existing type errors.

The benchmark server was stopped after the final checks. No task test browser or Cypress process remained, and port 4210 no longer had a listener. No unrelated same-day processes were stopped.

## Reproduce

Generate the opt-in fixtures (generated CSV files are ignored by Git):

```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
npm.cmd run fixtures:performance:3d
```

Follow the repository process-cleanup guidance: clear only stale Node/Cypress/Electron test processes from before the current date. Detect installed browsers first; these measurements use Chrome, not an Electron substitution.

```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
npx.cmd cypress info
```

Keep one server running for all repetitions, and verify that `http://127.0.0.1:4210` responds before starting the tests:

```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
npm.cmd run start:local-cypress
```

A single matrix run is available as `npm.cmd run e2e:perf:3d:local`. For five samples with unique artifact names and rotated order:

```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
foreach ($sample in 1..5) {
  Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
  $env:MT_PERF_RUN_ID = "threed-$(Get-Date -Format yyyyMMdd)-r$sample"
  npx.cmd cypress run --headed --browser chrome `
    --config "baseUrl=http://127.0.0.1:4210,trashAssetsBeforeRuns=false,numTestsKeptInMemory=0,video=false" `
    --env "perfMode=1,perfThreeD=1,perfThreeDSampleIndex=$($sample - 1)" `
    --spec cypress/e2e/performance/threed-scalability.perf.cy.ts
  if ($LASTEXITCODE -ne 0) { throw "Benchmark sample $sample failed" }
}
```

Use `perfThreeDCase=500n-2000l` in the environment argument to run just that graph, or join case names with `+` for a subset. Set `perfThreeDViewportWidth` and `perfThreeDViewportHeight` to explicitly measure another application viewport; the report records actual window and canvas dimensions. Both `perfMode` and `perfThreeD` must be enabled; the benchmark is skipped by ordinary test runs. A unique `MT_PERF_RUN_ID` is required for every repetition because the existing artifact writer names files by run and scenario.

The existing `perf:writeResult` task writes individual JSON artifacts and per-run summaries to `cypress/downloads/performance/`. Keep collected console logs and review artifacts outside the repository. To avoid mixing pilots or old measurements with the five repetitions, copy only the intended individual `*-threed-*.json` files into a dedicated external artifact folder before using `scripts/summarize-performance-runs.js --dir <folder> --min-samples 5`. The source manifest is `cypress/performance/threed-scenarios.json`.

Stop only the local server and test processes started for the benchmark when finished. Results apply to this build, browser, GPU, viewport, and default styling. High-DPI screens, larger canvases, different link widths/transparency, other graph structures, different hardware, and production builds need separate measurement.
