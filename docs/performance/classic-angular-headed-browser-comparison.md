# Classic vs Angular headed-browser performance comparison

Date: October 6-7, 2026  
Branch and commit: `dev` at `007bb0fc`  
Status: exploratory single-machine evidence, not a release benchmark or a universal product limit

## Executive summary

The Angular application supports materially larger datasets while retaining real post-load interaction. These results come from visible Microsoft Edge sessions, not parser-only or headless capacity probes.

- At the same 5,000 nodes and 50,000 links, Angular's worst threshold-update frame gap was **1.17 seconds**, compared with **6.13 seconds** in Classic: about **5.25x lower**. Angular pan, zoom, node drag, and box selection stayed below 0.24 seconds at this tier.
- At the same 5,000 nodes and 100,000 links, Angular's threshold gap was **2.50 seconds**, compared with **12.68 seconds** in Classic: about **5.1x lower**.
- Angular completed the full interaction suite at **25,000 nodes / 50,000 links** with a 3.53-second worst gap. Classic's 7,500-node / 15,000-link threshold change completed but froze for 6.67 seconds, and Classic failed at 8,750 nodes with a recursive DFS stack overflow.
- Angular remained practical in this run at **32,000 Newick leaves**; Classic completed 1,000 leaves but did not reach paint at 2,000 leaves after more than 26 minutes.
- Angular loaded **64,000 FASTA sequences** and retained responsive post-load node interaction. Classic's last passing FASTA tier was 2,000 sequences; its 4,000-sequence threshold action exceeded the 8-second interaction gate. This is an input-workflow comparison, not a dense-link comparison: the synthetic Angular FASTA fixture produced no threshold-visible links.
- Five repeated 5,000-node / 10,000-link cycles completed in each application without a crash or progressive slowdown. After explicit browser garbage collection, retained JavaScript heap drift from cycle 1 to cycle 5 was about 11.6 MiB for Angular and 1.6 MiB for Classic.

A concise update sentence supported by these tests is:

> In visible Edge testing on the same workstation, the Angular MicrobeTrace application remained interaction-capable at 25,000 graph nodes, 32,000 Newick leaves, and 64,000 FASTA sequences, while reducing threshold-update stalls by about fivefold on matched 50,000- and 100,000-link networks compared with Classic.

## What "usable" means here

The tests separate loading capacity from interaction quality:

- **Comfortable:** the view painted, every required probe completed, and the largest measured post-load frame gap was at most about 1.5 seconds.
- **Upper usable:** every required probe completed and the largest gap was no more than 5 seconds. A user will notice the pause.
- **Borderline / not practical:** the view painted or the action eventually completed, but a post-load gap exceeded 5 seconds.
- **Capacity only:** the view painted, but it was not interaction-qualified.
- **Failed:** the application threw an error, timed out, or did not reach paint in the observation window.

The five-second boundary is an explicit interpretation guardrail for this exploratory report, not an established MicrobeTrace UX service-level objective.

For Angular graph and Newick runs, the interaction suite exercised pan, zoom, node drag, box selection, and a threshold change. The Classic harness measured the threshold change because it is the expensive, data-dependent interaction common to both applications. FASTA runs also exercised the four direct-manipulation actions, but threshold timing is not meaningful where the synthetic fixture produced zero visible edges.

## Results

### Matched CSV graph: link density

Every row used the same deterministic node and link CSV in both applications where a direct comparison is shown.

| Nodes | Links | Application | End-to-end measured time | Worst threshold frame gap | Other interaction gaps | Interpretation |
|---:|---:|---|---:|---:|---|---|
| 5,000 | 10,000 | Classic | 6.76 s to paint | 2.27 s | Not collected | Usable with a noticeable threshold pause |
| 5,000 | 10,000 | Angular, five-cycle run | 14.5-15.4 s per measured cycle | 0.45-0.53 s | Usually <=0.15 s; one box-select cycle was 0.95 s | Comfortable and stable |
| 5,000 | 50,000 | Classic | 17.05 s to paint | 6.13 s | Not collected | Not practical |
| 5,000 | 50,000 | Angular | 21.47 s | 1.17 s | Pan/zoom/drag/box <=0.24 s | Comfortable boundary |
| 5,000 | 100,000 | Classic | 34.83 s to paint | 12.68 s | Not collected | Not practical |
| 5,000 | 100,000 | Angular | 37.20 s | 2.50 s | Pan/zoom/drag/box <=0.67 s | Upper usable |
| 5,000 | 150,000 | Angular | 45.24 s | 3.35 s | Pan/zoom/drag/box <=0.75 s | Upper usable |
| 5,000 | 200,000 | Angular | 64.70 s | 4.40 s | Pan/zoom/drag/box <=0.92 s | Upper usable, near the guardrail |
| 5,000 | 300,000 | Classic | Painted | Did not finish within 30 s | Not collected | Capacity only / not practical |
| 5,000 | 300,000 | Angular | 280.31 s | 21.50 s | Pan 3.87 s; drag 3.17 s; box 4.58 s | Completed, but not practical |

The strongest apples-to-apples result is not a claim about an absolute maximum. It is that Angular preserved substantially better interaction responsiveness at the same link count. At 200,000 links Angular was still under the exploratory five-second guardrail, while 300,000 links was clearly outside it.

### Node scale

| Application | Nodes / links | Observed behavior | Interpretation |
|---|---:|---|---|
| Classic | 5,000 / 10,000 | Threshold gap 2.27 s | Practical tested tier |
| Classic | 7,500 / 15,000 | Painted; threshold gap 6.67 s | Completes, but not practical |
| Classic | 8,750 / 17,500 | `RangeError: Maximum call stack size exceeded` in recursive DFS | Failed |
| Angular | 10,000 / 25,000 | Full interaction suite; worst gap 2.65 s | Upper usable |
| Angular | 25,000 / 50,000 | Full interaction suite; worst gap 3.53 s | Upper usable; largest interaction-qualified node tier tested |
| Angular | 50,000 / 100,000 | Painted after about 12 minutes; no interaction qualification | Capacity only and excluded from usable claims |

Under the report's interaction guardrail, Angular demonstrated a **fivefold larger practical node tier** than Classic: 25,000 versus 5,000 nodes at the same two-links-per-node fixture density. The 50,000-node Angular paint result is intentionally not used as a usability claim.

### Newick

| Application | Leaves | End-to-end measured time | Worst post-load gap | Interpretation |
|---|---:|---:|---:|---|
| Classic | 1,000 | 108.99 s | 0.55 s threshold gap | Passed, but initial load included a 104.5 s long task |
| Classic | 2,000 | No paint after >26 min | Not reached | CPU-bound non-completion; manually stopped |
| Angular | 32,000 | 69.35 s | 1.97 s | Practical interaction-qualified tier |
| Angular | 64,000 | 192.48 s | 5.10 s threshold; 1.42 s node drag | Borderline; completed but excluded from practical claim |

The 32,000-versus-1,000 comparison is **32x by input leaf count**. It should not be interpreted as 32x identical internal graph work: Classic and Angular materialize and retain phylogenetic relationships differently.

At 64,000 leaves, the largest Edge process was observed at approximately 2.95 GiB private memory during the run. The browser did not crash, but the load and interaction delays make that tier unsuitable for a "comfortable performance" statement.

### FASTA

The deterministic fixture used 500-base sequences with 30 mutations per sample and a threshold of 16.

| Application | Sequences | End-to-end measured time | Post-load behavior | Interpretation |
|---|---:|---:|---|---|
| Classic | 1,000 | 6.98 s | Threshold gap 0.85 s | Passed |
| Classic | 2,000 | 17.75 s | Threshold gap 3.26 s | Upper usable |
| Classic | 4,000 | Painted, but threshold action exceeded 8 s | Interaction gate failed | Not practical |
| Angular | 32,000 | 158.25 s | Pan/zoom/drag/box <=0.15 s | Passed |
| Angular | 64,000 | 152.78 s | Pan/zoom/drag/box <=0.35 s | Passed; largest tested sequence tier |

The 64,000-versus-2,000 result is **32x by input sequence count**. This comparison primarily measures FASTA ingestion, distance processing, node creation, and node interaction. The generated Angular runs retained zero links at the configured threshold, so they do not establish dense-link performance; the matched CSV tests above do that.

The non-monotonic single-run time at 32,000 and 64,000 sequences demonstrates why these results should be treated as capacity evidence, not statistically stable speed estimates. Multiple clean-machine repetitions would be needed for publication-quality timing.

### Repeated-session stability

Each cycle ran in the same visible Edge process as a separate Cypress test so Cypress command snapshots from the previous cycle could be released. Browser garbage collection was explicitly requested before the retained-heap sample.

| Application | Completed cycles | Post-GC heap, cycle 1 | Post-GC heap, cycle 5 | Drift | Interaction trend |
|---|---:|---:|---:|---:|---|
| Classic | 5/5 | 84.7 MiB | 86.3 MiB | +1.6 MiB | Threshold completion remained 2.57-2.65 s |
| Angular | 5/5 | 300.8 MiB | 312.5 MiB | +11.6 MiB | Threshold gap remained 0.45-0.53 s; no progressive slowdown |

This test did not show runaway retained heap in either application. Angular's steady-state heap was higher, so the result supports stability, not lower memory use.

## Environment and method

- Dell Pro Max 14 MC14250
- Intel Core Ultra 7 265H, 16 logical processors
- 31.5 GiB system RAM
- Windows 11 Enterprise, version 10.0.26200
- Microsoft Edge 153.0.4234.32, visible/headed, 1280 x 720 test viewport
- Cypress 15.16.0
- Angular development server at `http://127.0.0.1:4210`
- Classic static application at `http://127.0.0.1:4300`

The Classic source tree was not modified. Its local test server applied one response-time compatibility substitution, changing `data-toggle="buttons"` to `data-toggle="classic-buttons"`, to prevent an old Bootstrap handler from blocking the application in current Edge. The network implementation and data-processing code were unchanged.

The browser was considered ready only after the real 2D network element existed with nonzero dimensions. Visible screenshots were captured before and after interaction probes. JavaScript heap, long tasks, animation-frame gaps, and selected OS process memory were collected where available. A live renderer consuming multiple GiB was observed at the high tiers, so these tests include actual browser memory pressure.

## Limitations

- Most scenarios are single runs on one workstation. They show feasibility and order-of-magnitude differences, not a confidence interval.
- Angular ran from a development server and Classic from a static server; these are not production-build page-load comparisons.
- The applications have different internal data models and rendering strategies. Input count is comparable, but internal work is not necessarily identical for FASTA and Newick.
- Cypress instrumentation adds overhead. The same browser and machine reduce, but do not eliminate, that effect.
- Paint-only and earlier headless stress results are excluded from usability claims. In particular, a headless 2.4-million-link Classic attempt exceeded roughly 10 GiB private renderer memory and never finished; it is not reported as a product capacity result.
- The numbers are not global guardrails. Hardware, topology, browser version, labels/styles, and the number of visible links can materially change behavior.

## Raw evidence

Machine-readable artifacts are kept locally under `cypress/downloads/performance/` and intentionally remain uncommitted. The most important files are:

- `2026-10-07T05-05-58-324Z-angular-threshold-5000n-50000l.json`
- `classic-threshold-5000n-50000l.json`
- `2026-10-07T02-33-04-450Z-angular-threshold-5000n-100000l.json`
- `classic-threshold-5000n-100000l.json`
- `2026-10-07T04-48-36-540Z-angular-threshold-5000n-200000l.json`
- `2026-10-07T02-47-42-615Z-angular-threshold-5000n-300000l.json`
- `2026-10-07T04-15-27-764Z-angular-threshold-25000n-50000l.json`
- `2026-10-07T04-50-57-115Z-angular-newick-capacity-32000.json`
- `2026-10-07T04-57-14-615Z-angular-newick-capacity-64000.json`
- `classic-newick-1000.json`
- `2026-10-07T05-01-55-836Z-angular-fasta-capacity-64000.json`
- `classic-fasta-2000.json`
- `angular-repeat-5000n-10000l.json`
- `classic-repeat-5000n-10000l.json`

The headed before/after screenshots are preserved locally under `cypress/downloads/performance/headed-screenshots/`.
