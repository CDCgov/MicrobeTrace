#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const cypress = require('cypress');

async function main() {
  const args = { runs: 5, warmups: 1, tier: '', case: 'all', label: '', session: '' };
  for (let i = 2; i < process.argv.length; i++) {
    const flag = process.argv[i];
    if (flag === '--help') {
      console.log('Usage: npm run e2e:perf:sigma-layout:local -- [--runs 5] [--warmups 1] [--tier average|large|stress|nextstrain] [--case all|baseline|cold|increase] [--label NAME] [--session PATH]\nRequires the local Cypress app on http://127.0.0.1:4210. Runs serially; warmups and measured artifacts are separate.');
      return;
    }
    const key = flag.slice(2);
    const value = process.argv[++i];
    if (!flag.startsWith('--') || !(key in args) || value === undefined) throw new Error(`Invalid option: ${flag}`);
    args[key] = ['runs', 'warmups'].includes(key) ? Number(value) : value;
  }
  if (!Number.isInteger(args.runs) || args.runs < 1 || !Number.isInteger(args.warmups) || args.warmups < 0) throw new Error('Use --runs >= 1 and --warmups >= 0.');
  if (!['', 'average', 'large', 'stress', 'nextstrain'].includes(args.tier)) throw new Error('Unknown --tier.');
  if (!['all', 'baseline', 'cold', 'increase'].includes(args.case)) throw new Error('Unknown --case.');
  if (args.tier === 'nextstrain' && args.case === 'baseline') throw new Error('The original baseline has no Nextstrain scenario.');
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const dirty = !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
  const label = (args.label || commit.slice(0, 12)).replace(/[^a-zA-Z0-9._-]/g, '-');
  const batch = `${label}-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const root = path.join('sigma-layout', batch);
  const specs = [];
  if (args.case === 'all' || args.case === 'baseline') {
    if (args.tier !== 'nextstrain') specs.push('cypress/e2e/performance/sigma-scalability.perf.cy.ts');
  }
  if (args.case !== 'baseline') specs.push('cypress/e2e/performance/sigma-layout.perf.cy.ts');
  const manifest = require('../cypress/fixtures/performance/sigma-layout-nextstrain.json');
  const session = path.resolve(args.session || path.join('cypress', 'fixtures', manifest.file));
  if (args.case !== 'baseline' && (!args.tier || args.tier === 'nextstrain') && !fs.existsSync(session)) {
    throw new Error(`Saved Nextstrain session is missing. Supply --session PATH or copy it to ${session}`);
  }
  const context = { commit, dirty, label, platform: process.platform, arch: process.arch,
    cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length, totalMemoryBytes: os.totalmem(),
    nodeVersion: process.version, fixtureSha256: manifest.sha256, runs: args.runs, warmups: args.warmups };
  const output = path.join('cypress', 'downloads', 'performance', root);
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'batch.json'), JSON.stringify({ ...context, args, specs }, null, 2));
  console.log(`Serial Sigma layout benchmark: ${args.warmups} warmup(s), ${args.runs} measured run(s).\nResults: ${path.resolve(output)}`);
  const timings = [];
  for (let index = 0; index < args.warmups + args.runs; index++) {
    const warmup = index < args.warmups;
    const repetition = warmup ? index + 1 : index - args.warmups + 1;
    const phase = warmup ? 'warmups' : 'measured';
    console.log(`\n${phase} repetition ${repetition}`);
    const startedAt = Date.now();
    const result = await cypress.run({
      browser: 'chrome', headless: true, spec: specs.join(','),
      config: { baseUrl: 'http://127.0.0.1:4210', trashAssetsBeforeRuns: false, retries: 0, numTestsKeptInMemory: 0, video: false },
      env: { perfMode: 1, perfSigma: 1, perfSigmaLayout: 1, perfSigmaTier: args.tier,
        perfSigmaLayoutCase: args.case, perfSigmaSession: session,
        perfOutputSubdir: path.join(root, phase), perfRunId: `${batch}-${phase}-${repetition}`,
        perfBenchmark: { ...context, phase, repetition } },
    });
    timings.push({ phase, repetition, wallTimeMs: Date.now() - startedAt,
      specTimeMs: result.totalDuration, tests: result.totalTests, passed: result.totalPassed, failed: result.totalFailed });
    fs.writeFileSync(path.join(output, 'timings.json'), JSON.stringify(timings, null, 2));
    if (result.status === 'failed' || result.totalFailed || !result.totalTests || result.totalPassed !== result.totalTests) {
      throw new Error(`Benchmark ${phase} ${repetition} failed; partial artifacts remain in ${output}.`);
    }
  }
  execFileSync(process.execPath, ['scripts/summarize-performance-runs.js', '--dir', path.join(output, 'measured'), '--min-samples', '5'], { stdio: 'inherit' });
  console.log(`\nMeasured summary: ${path.resolve(output, 'measured', 'baseline-summary.md')}`);
}
main().catch(error => { console.error(error.message || error); process.exitCode = 1; });
