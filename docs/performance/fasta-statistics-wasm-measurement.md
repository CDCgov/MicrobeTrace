# FASTA and statistics Wasm measurement

Date collected: May 22, 2026 local Chrome/Cypress performance runs.

These numbers are one-sample evidence from local development hardware. They are useful for deciding the next optimization direction, but they are not timing budgets. Stable budgets should still come from repeated baseline collection.

## What changed

The performance harness now separates FASTA sequence work from browser/rendering work:

- sequence prep timings under `session.meta.performance.sequence`
- pairwise link worker, round-trip, transit, and merge timings under `session.meta.performance.load.computeLinks`
- statistics refresh timings under `session.meta.performance.statistics.updateStatistics`
- existing render timings under `session.meta.performance.render`

Two larger deterministic FASTA fixtures were added:

| Scenario | Sequences | Pairwise links | Visible links at SNP 16 |
| --- | ---: | ---: | ---: |
| `expanded-large-clustered-sequences-1000` | 1,000 | 499,500 | 19,500 |
| `stress-clustered-sequences-2000` | 2,000 | 1,999,000 | 49,000 |

## Initial findings

| Scenario | Total measured | FASTA process | Link worker compute | Link merge | 2D position prep | Cytoscape create | Heap delta | Statistics |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 120 sequences | 6.35s | 81ms | 22ms | 4ms | 380ms | 58ms | 136 MB | 0ms |
| 300 sequences | 6.74s | 181ms | 96ms | 22ms | 520ms | 127ms | 223 MB | 1ms |
| 1,000 sequences | 11.16s | 1.43s | 1.03s | 294ms | 2.70s | 632ms | 298 MB | 1ms |
| 2,000 sequences | 19.97s | 5.45s | 4.06s | 1.23s | 5.35s | 1.45s | 931 MB | 3ms |

## Recommendation

Wasm is worth keeping on the table for the FASTA pairwise-distance worker, because the worker compute cost becomes material at 1,000-2,000 sequences. It should not be the first or only optimization, because rendering/layout, link-object merge, and heap growth are still major costs.

Recommended order:

1. Reduce 2D layout/render cost for large visible edge sets.
2. Reduce pairwise link object creation and retained graph memory.
3. Prototype Wasm only for the measured FASTA distance worker path, then compare against the same Cypress artifacts.
4. Keep statistics work in the normal TypeScript path unless new statistics features add a measured CPU-heavy calculation.

Current statistics refresh is not a Wasm candidate in these scenarios.

## Validation

Commands run:

```bash
node scripts/generate-performance-fixtures.js
npx start-server-and-test start:local-cypress http://127.0.0.1:4210 "npx cypress run --headless --browser chrome --config baseUrl=http://127.0.0.1:4210,trashAssetsBeforeRuns=false --env perfMode=1,perfLarge=1 --spec cypress/e2e/performance/sequence-expanded-large.perf.cy.ts"
npx start-server-and-test start:local-cypress http://127.0.0.1:4210 "npx cypress run --headless --browser chrome --config baseUrl=http://127.0.0.1:4210,trashAssetsBeforeRuns=false --env perfMode=1,perfStress=1 --spec cypress/e2e/performance/sequence-stress.perf.cy.ts"
npx start-server-and-test start:local-cypress http://127.0.0.1:4210 "npx cypress run --headless --browser chrome --config baseUrl=http://127.0.0.1:4210,trashAssetsBeforeRuns=false --env perfMode=1,perfLarge=1 --spec cypress/e2e/performance/sequence-average.perf.cy.ts,cypress/e2e/performance/sequence-large.perf.cy.ts"
npm run e2e:perf:summarize
```
