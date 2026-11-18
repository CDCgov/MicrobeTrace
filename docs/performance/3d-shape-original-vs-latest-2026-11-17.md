# Original versus latest 3D shapes — November 17, 2026

The measurements below precede the subsequent contrast-only lighting adjustment (stronger oblique key, lower ambient/fill). Geometry, materials, and light count are unchanged, but these exact lighting values have not been re-benchmarked. Current comparison screenshots use the stronger lighting; the paired performance tests used the recorded neutral rig on both versions.

This is a fresh direct comparison of the **original six shapes we started with → latest optimized six**. The baseline is the node-object implementation from revision bcdcd8fc, with coarse meshes, equal enclosing-radius sizing, and dense legacy edge frames. It predates all shape refinements. It is not the intermediate refinement or a Classic/production baseline.

The [intermediate-to-optimized report](3d-shape-optimization-2026-11-17.md) and [original-to-first-refinement report](3d-shape-comparison-2026-11-17.md) remain historical stage comparisons. Their medians should not be combined to estimate this direct original-to-latest result.

## Results

Three repetitions per version/size/style, showing **original → latest optimized**. FPS is the median of per-run averages; CPU time includes the current renderer wrapper and batch synchronization, without waiting for asynchronous GPU completion. A 60 fps display cap hides remaining headroom.

| Nodes / links | Styling | Active-layout orbit fps | Frozen orbit fps | Frozen CPU render median | Draw calls |
| --- | --- | ---: | ---: | ---: | ---: |
| 250 / 500 | Simple with frames | 60.0 → 60.0 | 60.0 → 60.0 | 2.0 → 1.4 ms | 1000 → 514 |
| 250 / 500 | Detailed | 60.0 → 60.0 | 60.0 → 60.0 | 5.2 → 5.4 ms | 2552 → 2066 |
| 750 / 1500 | Simple with frames | 60.0 → 60.0 | 60.0 → 60.0 | 4.7 → 2.8 ms | 3000 → 1514 |
| 750 / 1500 | Detailed | 29.0 → 33.3 | 35.8 → 45.3 | 23.7 → 18.5 ms | 7650 → 6164 |
| 1000 / 2000 | Simple with frames | 43.5 → 58.0 | 60.0 → 60.0 | 7.0 → 3.8 ms | 4000 → 2014 |
| 1000 / 2000 | Detailed | 17.6 → 24.0 | 27.5 → 34.9 | 31.2 → 24.0 ms | 10202 → 8216 |

| Nodes · styling | Frozen fps ranges, original → latest | Layout target met | All frozen actions target met |
| --- | --- | --- | --- |
| 250 · simple | 60.0–60.0 → 60.0–60.0 | 3/3 → 3/3 | 3/3 → 3/3 |
| 250 · investigation | 60.0–60.0 → 60.0–60.0 | 3/3 → 3/3 | 3/3 → 3/3 |
| 750 · simple | 60.0–60.0 → 60.0–60.0 | 3/3 → 3/3 | 3/3 → 3/3 |
| 750 · investigation | 35.1–41.4 → 41.1–48.7 | 2/3 → 3/3 | 3/3 → 3/3 |
| 1000 · simple | 60.0–60.0 → 60.0–60.0 | 3/3 → 3/3 | 3/3 → 3/3 |
| 1000 · investigation | 24.6–28.4 → 33.1–35.9 | 0/3 → 0/3 | 2/3 → 2/3 |

The existing target is median frame gap ≤35 ms and p95 ≤50 ms for active orbit, and for every frozen orbit/pan/zoom probe. These performance targets are separate from a sample's correctness pass. Three repetitions give descriptive results, not a statistically precise speedup claim.

## Method and interpretation

- **36 accepted measurements**, zero correctness failures; two pilot samples excluded. All retained the expected graph, matched final layout coordinates, exactly 150 force steps, and intact graphics contexts.
- Original node-object source was compared with git revision bcdcd8fc before bundling. Its sphere has 112 triangles, versus 440 at latest Balanced detail. Original shapes use equal outer radius; latest shapes use mean projected-area normalization, including the taller diamond and cleaner structural edges. These geometry, sizing, opacity, and grouped-rendering differences are measured together.
- Same current neutral lighting, data, camera movement, force/layout pipeline, link rendering, nominal settings, and viewport for both performance versions. This isolates the node-rendering tradeoff; it is not a whole-app historical-revision benchmark. Screenshot comparisons separately use original/default lighting on the original shapes and current lighting on latest shapes.
- Existing generated fixtures, the opt-in Cypress camera probe, and shared investigation-styling helper were reused through Playwright. **No Cypress suite was run.**
- Simple style uses six shape families and frames. Detailed adds node/link labels, size/width mappings, mixed-origin bands, 35% link transparency, arrows, and reverse arrows. All expected scene layers and six families are checked.
- Headed Chrome 157, Intel Arc via ANGLE/Direct3D11, DPR 1, 1280 × 720 browser and 883 × 573 canvas, local development build, one workstation. No other task test browser or build ran during measurement.

Keep a conservative starting point of **250 visible nodes / 500 links for richly styled figures**, then filter or reduce styling when needed. Freezing removes force work while drawing costs remain. The existing roughly 750 / 1,500 default-style guidance is a starting point on comparable hardware, not a hard limit. This run does not retest larger tiers or heavy transparent-node/dimming scenarios. Adaptive and Fine are not part of this paired comparison.

Torus, capsule, and star have no original counterparts and are not included in these original/latest pairs. Their optimized-only or intermediate comparisons in other reports must be labeled separately. Human recognition and perceived prominence still need review.

## Evidence

The external review archive contains the performance summary and samples, source hashes, per-sample logs, the verified original module, full-app screenshot pairs, comparison page, and temporary generators. The existing performance probe, shared styling helper, and fixture generator remain in the repository. This was a local review harness, not an additional committed regression suite.
