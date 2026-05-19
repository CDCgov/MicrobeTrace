#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const {
  compareNewickTrees,
  listJsonFiles,
  parseArgs,
  readJson,
  resolveLatestRunId,
  writeJson,
  writeText,
} = require('./newick-validation-utils');

const DEFAULT_DIR = path.join(process.cwd(), 'cypress', 'downloads', 'newick-validation');

function usage() {
  console.log(`Usage: node scripts/compare-newick-trees.js [options]

Compares MT-generated tree captures against their reference Newick fixtures.
Topology and branch metrics are report-first; parse and leaf-set failures make the command fail.

Options:
  --dir <path>             Validation artifact directory. Defaults to cypress/downloads/newick-validation.
  --run-id <id>            Run id. Defaults to latest run directory.
  --ref <name>             Capture ref directory. Defaults to current.
  --tolerance <number>     Patristic distance tolerance. Defaults to 1e-6.
  --scenario <ids>         Optional comma-separated capture scenario ids.
`);
}

function loadCaptures(dir, runId, ref) {
  const captureDir = path.join(dir, runId, ref, 'tree-capture');
  return listJsonFiles(captureDir)
    .map((filePath) => ({
      filePath,
      capture: readJson(filePath),
    }));
}

function formatNumber(value) {
  return value === null || value === undefined ? 'n/a' : String(value);
}

function buildMarkdownReport(report) {
  const lines = [
    '# Newick Tree Comparison',
    '',
    `Run id: ${report.runId}`,
    `Capture ref: ${report.ref}`,
    `Tolerance: ${report.tolerance}`,
    `Compared captures: ${report.comparedCount}`,
    `Hard failures: ${report.failureCount}`,
    '',
    '## Results',
    '',
  ];

  report.results.forEach((result) => {
    lines.push(`### ${result.scenarioId}`);
    lines.push('');
    lines.push(`Status: ${result.passed ? 'PASS' : 'FAIL'}`);
    lines.push(`Reference: ${result.referenceNewickFixture}`);
    if (result.failures.length) lines.push(`Failures: ${result.failures.join('; ')}`);
    if (result.counts) {
      lines.push(`Leaves: ${result.counts.referenceLeaves} reference vs ${result.counts.generatedLeaves} generated`);
      lines.push(`Internal splits: ${result.counts.referenceInternalSplits} reference vs ${result.counts.generatedInternalSplits} generated`);
      lines.push(`Shared internal splits: ${result.counts.sharedInternalSplits}`);
      lines.push(`Normalized RF-style distance: ${formatNumber(result.topology.normalizedRfDistance)}`);
      lines.push(`Matching rooted branches: ${result.counts.matchingRootedBranches}`);
      lines.push(`Branch length max abs delta: ${formatNumber(result.branchLengths.maxAbs)}`);
      lines.push(`Pairwise patristic max abs delta: ${formatNumber(result.pairwisePatristicDistances.maxAbs)}`);
      lines.push(`Pairwise distances above tolerance: ${result.counts.pairwiseAboveTolerance}`);
    }
    lines.push('');
  });

  return lines.join('\n');
}

function compareCapture(capture, options) {
  const referencePath = path.join(process.cwd(), 'cypress', 'fixtures', capture.referenceNewickFixture);
  const resultBase = {
    scenarioId: capture.scenarioId,
    title: capture.title,
    files: capture.files,
    referenceNewickFixture: capture.referenceNewickFixture,
    metric: capture.metric,
    threshold: capture.threshold,
    metadata: capture.metadata,
  };

  if (!fs.existsSync(referencePath)) {
    return {
      ...resultBase,
      passed: false,
      failures: [`Reference Newick fixture not found: ${capture.referenceNewickFixture}`],
    };
  }

  const referenceNewick = fs.readFileSync(referencePath, 'utf8');
  const comparison = compareNewickTrees(referenceNewick, capture.generatedNewick, options);

  return {
    ...resultBase,
    ...comparison,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }

  const dir = path.resolve(String(args.dir || DEFAULT_DIR));
  const runId = String(args['run-id'] || process.env.MT_NEWICK_VALIDATION_RUN_ID || resolveLatestRunId(dir) || '');
  if (!runId) {
    throw new Error(`No validation run id found under ${dir}. Pass --run-id.`);
  }

  const ref = String(args.ref || 'current');
  const tolerance = Number(args.tolerance ?? 1e-6);
  const scenarioFilter = String(args.scenario || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const captures = loadCaptures(dir, runId, ref)
    .map((entry) => entry.capture)
    .filter((capture) => !scenarioFilter.length || scenarioFilter.includes(capture.scenarioId));
  const results = captures.map((capture) => compareCapture(capture, { tolerance }));
  const emptyFailure = results.length === 0 ? 1 : 0;
  const failureCount = results.filter((result) => !result.passed).length + emptyFailure;
  const report = {
    runId,
    generatedAt: new Date().toISOString(),
    ref,
    tolerance,
    comparedCount: results.length,
    failureCount,
    results,
    note: results.length === 0 ? 'No matching tree captures were found to compare.' : undefined,
  };
  const outJson = path.join(dir, runId, 'newick-tree-comparison.json');
  const outMd = path.join(dir, runId, 'newick-tree-comparison.md');

  writeJson(outJson, report);
  writeText(outMd, buildMarkdownReport(report));

  console.log(`Compared ${results.length} MT-generated trees for run ${runId}`);
  console.log(`Wrote ${path.relative(process.cwd(), outJson)}`);
  console.log(`Wrote ${path.relative(process.cwd(), outMd)}`);

  if (results.length === 0) {
    console.error('No matching Newick tree captures were found to compare.');
  }

  if (failureCount > 0) {
    console.error(`${failureCount} Newick tree comparison(s) had hard failures.`);
    process.exitCode = 1;
  }
}

main();
