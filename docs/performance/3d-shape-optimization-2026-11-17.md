# Optimized 3D shapes — November 17, 2026

This is the current **earlier refinement → optimized** comparison inside MicrobeTrace. It supersedes the first refinement's performance conclusions for the current renderer. The [historical original → refined report](3d-shape-comparison-2026-11-17.md) remains available; the baselines are different and these runs should not be combined into a direct original-to-optimized estimate.

## Findings

Repeated opaque nodes now share instanced surfaces and silhouettes, and one combined structural-edge buffer per shape/detail/width group. Faceted shapes omit the duplicate silhouette pass. Transparent and neighbor-dimmed nodes retain individual meshes. At 750 and 1,000 nodes, simple scenes submitted about 58% fewer draw calls and detailed scenes about 26% fewer.

At 750 detailed nodes, median frozen rotation rose from **33.0 to 41.4 fps** (25.7%); at 1,000 detailed nodes, **28.2 to 33.3 fps** (18.1%). Small cases stayed near the display's 60 fps ceiling. These are descriptive results from three repetitions, without an inferential significance claim. The broader shape proportions and grouping changed together, so this is not an isolated instancing experiment.

Keep **250 visible nodes / 500 links** as a conservative starting point for richly styled figures; larger graphs still have less consistent active-layout responsiveness. Filtering or reducing labels/arrows/frames remains useful, and freezing stops force work. Default-style guidance remains around 750 / 1,500 on comparable hardware. This focused run does not retest 2,000+ nodes or establish new hard limits.

## Paired Balanced-detail results

Three repetitions per version/size/style. Entries show **earlier refined → optimized**; fps is the median of per-run average frame rates. CPU render time includes the optimized batch synchronization inside the renderer wrapper, but does not wait for asynchronous GPU completion.

| Nodes / links | Styling | Active-layout rotation, fps | Frozen rotation, fps | Frozen CPU render median | Draw calls |
| --- | --- | ---: | ---: | ---: | ---: |
| 250 / 500 | Simple with frames | 60.0 → 60.0 | 60.0 → 60.0 | 2.2 → 1.4 ms | 1208 → 514 |
| 250 / 500 | Detailed | 60.0 → 60.0 | 60.0 → 60.0 | 5.7 → 4.6 ms | 2760 → 2066 |
| 750 / 1500 | Simple with frames | 60.0 → 60.0 | 60.0 → 60.0 | 6.1 → 2.9 ms | 3625 → 1514 |
| 750 / 1500 | Detailed | 25.1 → 29.4 | 33.0 → 41.4 | 23.3 → 20.3 ms | 8275 → 6164 |
| 1000 / 2000 | Simple with frames | 40.0 → 56.0 | 60.0 → 60.0 | 8.6 → 4.1 ms | 4833 → 2014 |
| 1000 / 2000 | Detailed | 18.5 → 22.8 | 28.2 → 33.3 | 31.0 → 25.0 ms | 11035 → 8216 |

| Nodes · styling | Frozen fps range, earlier → optimized | Layout target met | All frozen actions target met |
| --- | --- | --- | --- |
| 250 · simple | 60.0–60.0 → 60.0–60.0 | 3/3 → 3/3 | 3/3 → 3/3 |
| 250 · investigation | 60.0–60.0 → 60.0–60.0 | 3/3 → 3/3 | 3/3 → 3/3 |
| 750 · simple | 60.0–60.0 → 60.0–60.0 | 3/3 → 3/3 | 3/3 → 3/3 |
| 750 · investigation | 26.4–36.1 → 40.8–41.8 | 1/3 → 3/3 | 2/3 → 3/3 |
| 1000 · simple | 60.0–60.0 → 55.4–60.0 | 3/3 → 3/3 | 3/3 → 3/3 |
| 1000 · investigation | 24.3–28.4 → 31.3–33.8 | 0/3 → 0/3 | 1/3 → 2/3 |

The existing responsiveness target is median frame gap ≤35 ms and p95 ≤50 ms, checked for active orbit and for every frozen orbit/pan/zoom probe. A completed measurement is a correctness pass; meeting this performance target is reported separately.

## New families and Adaptive detail

At 750 nodes / 1,500 links, the torus/capsule/star mix used three repetitions of each version/style. Simple frozen rotation was about 60 fps for both; active-layout rotation improved from 44.0 to 60.0 fps. Detailed frozen rotation improved from 33.2 to 37.1 fps (12.0%), with per-run ranges 30.2–34.8 and 32.8–41.4 fps; these ranges overlap. Detailed active rotation improved from 24.8 to 28.4 fps.

A separate optimized-only Adaptive check at 750 nodes used three samples per style. Detailed frozen rotation was 46.4 fps (range 42.8–49.7), versus 41.4 fps for Balanced in the paired run. Detailed active rotation was 29.7 fps. Adaptive samples were collected after the paired runs, so this is indicative rather than an interleaved causal comparison. Fine detail, camera-following lighting, heavy selection dimming, and broadly translucent node categories were not performance-benchmarked.

## Method and evidence

- **54 completed samples**, no correctness failures: 36 primary paired, 12 additional-family paired, six Adaptive. The two pilot samples are excluded.
- Headed Chrome 157, Intel Arc through ANGLE / Direct3D11, DPR 1, browser 1280 × 720, canvas 883 × 573, local development build. One benchmark browser, with no concurrent task test browser or build.
- Existing generated CSV fixtures, existing opt-in Cypress camera probe, and shared investigation-styling helper reused through Playwright. **No Cypress suite was run for this change.**
- Same current neutral ambient/key/fill lights for both paired versions to isolate geometry/rendering work. Before/after screenshots instead show each style's own lighting. Same data, force seed, initial positions, camera movements, thresholds, and 150 force ticks; final coordinates are checked equal.
- Simple style has six families and 1.25 px frames. Detailed style adds mapped node sizes, ID/distance labels, mapped widths, 35% link transparency, mixed-origin bands, directed arrows and some reverse arrows. Scene layers and graph counts are validated before measurement. All graphics contexts remained intact.
- Baseline node-object and geometry sources were preserved before optimization. Source hashes, per-sample JSON/logs, raw summaries, and temporary generators are in ignored local artifacts. These inputs are not a permanent deployable version switch or fixture.

Raw evidence, reference sources, and temporary generators are retained outside the repository in the review archive. It includes the summary, source manifest, and main/additional/adaptive sample results. The maintained performance probe, shared styling helper, and fixture generator remain in the repository. This was a local exploratory benchmark, not an additional committed test suite.

Viewport, device, graph topology, labels, opacity, and browser refresh rate affect these numbers. Sixty fps does not establish equal rendering cost. Human recognition and perceived prominence remain unvalidated.
