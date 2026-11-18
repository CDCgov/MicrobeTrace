# 3D shape performance comparison — November 17, 2026

Historical **original coarse → first refinement** comparison. For the current grouped renderer and adjusted proportions, use the [later refinement → optimization benchmark](3d-shape-optimization-2026-11-17.md). The results below describe the first refinement and do not represent current optimized performance.

Measured inside the MicrobeTrace application, comparing the six earlier shapes with their six updated counterparts. This is separate from the standalone Shape Lab measurements.

## Interpretation

The updated shapes retain approximately 60 fps frozen navigation for simple 250- and 750-node networks on this workstation. They add measurable rendering work. In the detailed 750-node profile, frozen orbit fell from 26.0 to 20.4 fps (21.5% lower); the three per-run ranges do not overlap. At 1,000 detailed nodes, both versions are slow and their ranges overlap, so the small median difference is not a clear separate regression.

The outlines-off control reduced the old/new CPU-render difference to 4.9 → 5.1 ms, versus 6.9 → 9.9 ms with outlines in the simple 750-node profile. This suggests outline work is a substantial optimization target; it does not isolate GPU cost or every change.

For detailed figures, start around 250 visible nodes / 500 links and filter larger networks or reduce unnecessary styling. Freezing removes layout work, but neither version met the frozen responsiveness target at 750–1,000 detailed nodes. Simple styling supports larger focused networks. These are tested starting points on one workstation, not hard limits. Retain 2D for broader exploration.

## Results

Three accepted samples per size/style/version. FPS is the median of per-run averages. Arrows show **earlier → updated**. CPU render time measures CPU submission inside Three.js renderer.render, not GPU completion or all application work.

| Nodes / links | Styling | Orbit while layout runs, fps | Frozen orbit, fps | Frozen fps change | Frozen CPU render, median |
| --- | --- | ---: | ---: | ---: | ---: |
| 250 / 500 | Simple with outlines | 60.0 → 60.0 | 60.0 → 60.0 | 0.0% | 2.7 → 3.2 ms |
| 250 / 500 | Detailed | 58.7 → 54.7 | 60.0 → 57.4 | -4.4% | 9.2 → 11.3 ms |
| 750 / 1,500 | Simple with outlines | 42.0 → 36.0 | 60.0 → 60.0 | 0.0% | 6.9 → 9.9 ms |
| 750 / 1,500 | Detailed | 18.7 → 15.5 | 26.0 → 20.4 | -21.5% | 34.5 → 37.7 ms |
| 1000 / 2,000 | Simple with outlines | 30.0 → 25.4 | 60.0 → 56.7 | -5.6% | 13.0 → 15.4 ms |
| 1000 / 2,000 | Detailed | 12.9 → 13.0 | 17.4 → 16.8 | -3.2% | 49.0 → 51.9 ms |

| Nodes · styling | Layout fps range, earlier → updated | Frozen fps range, earlier → updated | Worst frozen p95 gap | Frozen target met |
| --- | --- | --- | ---: | ---: |
| 250 · Simple with outlines | 60.0–60.0 → 57.4–60.0 | 60.0–60.0 → 60.0–60.0 | 16.8 → 16.8 ms | 3/3 → 3/3 |
| 250 · Detailed | 50.0–60.0 → 30.0–58.7 | 60.0–60.0 → 57.0–60.0 | 33.2 → 17.1 ms | 3/3 → 3/3 |
| 750 · Simple with outlines | 38.9–46.8 → 34.9–41.1 | 60.0–60.0 → 60.0–60.0 | 16.8 → 16.8 ms | 3/3 → 3/3 |
| 750 · Detailed | 15.7–18.9 → 15.3–18.1 | 24.9–26.0 → 17.9–23.1 | 99.9 → 100.7 ms | 0/3 → 0/3 |
| 1000 · Simple with outlines | 28.7–31.3 → 23.3–30.0 | 56.7–60.0 → 53.0–58.0 | 33.2 → 33.3 ms | 3/3 → 3/3 |
| 1000 · Detailed | 10.5–13.2 → 12.8–13.4 | 16.9–20.0 → 16.1–18.2 | 66.8 → 83.3 ms | 0/3 → 0/3 |

The target reused from the existing capacity benchmark is median frame gap ≤35 ms and p95 ≤50 ms. Frozen qualification requires all three actions—orbit, pan, zoom—to meet it. A test that completes with correct graph records is distinct from meeting the responsiveness target. Refresh-capped results around 60 fps cannot establish equal rendering cost. Three repetitions do not establish statistical significance or universal capacity.

## Rendering work

| Nodes · styling | Draw calls, earlier → updated | Change | Rendered triangles, earlier → updated | Change |
| --- | ---: | ---: | ---: | ---: |
| 250 · Simple with outlines | 1,000 → 1,208 | 20.8% | 74,192 → 89,464 | 20.6% |
| 250 · Detailed | 2,552 → 2,760 | 8.2% | 100,214 → 115,486 | 15.2% |
| 750 · Simple with outlines | 3,000 → 3,625 | 20.8% | 221,500 → 267,000 | 20.5% |
| 750 · Detailed | 7,650 → 8,275 | 8.2% | 299,400 → 344,900 | 15.2% |
| 1000 · Simple with outlines | 4,000 → 4,833 | 20.8% | 295,692 → 356,464 | 20.6% |
| 1000 · Detailed | 10,202 → 11,035 | 8.2% | 399,614 → 460,386 | 15.2% |

The updated presentation increases curved-surface resolution, normalizes shape prominence, adds subtle face tones, and uses silhouette plus structural-edge rendering. Smooth internal grids are removed. These costs are measured together, matching the intended shape presentation. Both versions use Lambert and the same current ambient/key/fill lighting, so the comparison isolates node presentation rather than a different renderer or light rig.

## Outline control at 750 nodes / 1,500 links

Three samples per version, the same simple profile with border width set to zero. Earlier → updated: layout **48.8 → 49.5 fps**, frozen orbit **60.0 → 60.0 fps**, CPU render **4.9 → 5.1 ms**, draw calls **2250 → 2250**, rendered triangles **62500 → 112500**. This control helps distinguish mesh changes from the additional outline pass; it does not isolate each individual feature or measure GPU shader time.

## Torus, pill, and star

These have no earlier app counterparts. Three supplemental samples per style at 750 nodes / 1,500 links repeat the three new families equally, retaining the same coordinates, colors, nominal sizing, links, camera, and scene checks. These are comparisons with the updated six, not a historical baseline.

| Styling | Updated six: layout / frozen fps | Torus, pill, star: layout / frozen fps | New-family draw calls / triangles |
| --- | ---: | ---: | ---: |
| Simple with outlines | 36.0 / 60.0 | 42.2 / 60.0 | 3,250 / 639,000 |
| Detailed | 15.5 / 20.4 | 17.6 / 25.2 | 7,900 / 716,900 |

## Method and controls

- Headed Chrome 157.0.8103.79, Intel Arc Graphics through ANGLE/Direct3D 11, Intel Core Ultra 7 165H, 31.5 GiB RAM, Windows, DPR 1. App viewport 1280 × 720; measured 3D canvas 883 × 573. Local development build on branch 995-3d_network over bcdcd8fc plus current working-tree refinements.
- The same real app renderer, force engine, link/arrow rendering, DOM, and settings pipeline are used for both variants. A temporary browser-only module swaps in the earlier ThreeDNodeObjects class extracted from HEAD; the updated class comes from the running app. It does not modify product source or reload an earlier whole application.
- Existing deterministic CSV fixtures at 250/500, 750/1500, and 1000/2000 nodes/links. Launch uses the normal file input, File Settings, and 3D view. No background 2D pane is opened. Each graph size gets a fresh page. This is synthetic connected data, not a patient dataset.
- The existing investigation helper supplies six category colors/shapes, degree-based node sizes 2–6, 1.25 px frames, 10 px node labels, distance-based link widths, 9 px distance labels, 35% link transparency, mixed origins, and single/bidirectional arrows. The simple profile retains six colors/shapes and the same links, uses size 4 and 1 px outlines, and omits labels, origin overlays, and arrows. It is a shape-focused profile, not the app's default sphere-only profile.
- The existing Cypress capacity cameraProbe function is reused verbatim. Orbit runs 1.5 s during recalculation, followed by exactly 150 force steps. Frozen orbit runs at least 3 s / 30 gaps; pan and zoom each run at least 1.5 s / 15 gaps. Each probe has the existing 12-second cap. Cameras reset to an identical saved pose for each phase; automatic fit on recalculation is suppressed for this comparison.
- Actual attached graph records, all expected shape families, detailed scene layers, updated silhouette count, painted frames, tab visibility, graphics context, and exactly equal final layout coordinates are validated. Styling waits for deferred custom-link objects before warm-up/timing. Node resources from the retired implementation are disposed between variants.
- Three repetitions alternate old/new order and reverse style order in the middle repetition. A 600 ms warm-up precedes timing. CPU render instrumentation is identical for both versions. The first 250-node simple pair overlapped the end of a diagnostic logging command and was excluded as a pair, then repeated as sample 4. Pilots and incomplete setup attempts are excluded.
- 48 accepted samples: 36 primary, 6 outline-control, and 6 additional-family samples. This is scoped A/B performance validation. It does not measure startup/loading, real mouse input latency, long-duration memory use, Standard materials, higher DPR, different hardware, other network densities, all nine families together, or a production build.

## Reproducibility and cleanup

Temporary harnesses, exact legacy code, source hashes, per-case console logs, raw samples, and summary JSON are retained in an external review archive, rather than in the repository. The harness reused `cypress/support/threed-helpers.ts` and the camera probe from `cypress/e2e/performance/threed-scalability.perf.cy.ts`; those maintained test sources remain in the repository. No Cypress commands were run for this comparison; its ordinary regression suites are separate.

At the time of measurement, the existing application server on port 4202 was reused, and the dedicated benchmark browser was closed after collection.
