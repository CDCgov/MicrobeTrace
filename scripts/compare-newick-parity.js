#!/usr/bin/env node

const path = require('path');
const {
  compareEdgeSnapshots,
  listJsonFiles,
  parseArgs,
  readJson,
  resolveLatestRunId,
  writeJson,
  writeText,
} = require('./newick-validation-utils');

const DEFAULT_DIR = path.join(process.cwd(), 'cypress', 'downloads', 'newick-validation');

function usage() {
  console.log(`Usage: node scripts/compare-newick-parity.js [options]

Compares visible 2D Newick edge snapshots captured from two app builds.

Options:
  --dir <path>             Validation artifact directory. Defaults to cypress/downloads/newick-validation.
  --run-id <id>            Shared run id. Defaults to latest run directory.
  --left-ref <name>        Baseline ref directory. Defaults to pre-refactor.
  --right-ref <name>       Candidate ref directory. Defaults to current.
  --tolerance <number>     Distance tolerance. Defaults to 1e-6.
  --scenario <ids>         Optional comma-separated snapshot scenario ids.
`);
}

function loadSnapshots(dir, runId, ref) {
  const snapshotDir = path.join(dir, runId, ref, 'edge-snapshot');
  const snapshots = new Map();

  for (const filePath of listJsonFiles(snapshotDir)) {
    const snapshot = readJson(filePath);
    snapshots.set(snapshot.scenarioId, {
      filePath,
      snapshot,
    });
  }

  return snapshots;
}

function formatDiffList(values, limit = 12) {
  if (!values.length) return 'none';
  const suffix = values.length > limit ? `, and ${values.length - limit} more` : '';
  return `${values.slice(0, limit).join(', ')}${suffix}`;
}

function buildMarkdownReport(report) {
  const lines = [
    '# Newick 2D Edge Parity Comparison',
    '',
    `Run id: ${report.runId}`,
    `Left ref: ${report.leftRef}`,
    `Right ref: ${report.rightRef}`,
    `Tolerance: ${report.tolerance}`,
    `Compared snapshots: ${report.comparedCount}`,
    `Failures: ${report.failureCount}`,
    '',
    '## Results',
    '',
  ];

  report.results.forEach((result) => {
    lines.push(`### ${result.scenarioId}`);
    lines.push('');
    lines.push(`Status: ${result.passed ? 'PASS' : 'FAIL'}`);
    lines.push(`Threshold: ${result.threshold}`);
    lines.push(`Nodes: ${result.counts.leftNodes} vs ${result.counts.rightNodes}`);
    lines.push(`Visible edges: ${result.counts.leftVisibleEdges} vs ${result.counts.rightVisibleEdges}`);
    lines.push(`Shared visible edges: ${result.counts.sharedVisibleEdges}`);
    if (result.failures.length) {
      lines.push(`Failures: ${result.failures.join('; ')}`);
      lines.push(`Missing nodes: ${formatDiffList(result.nodeDiff.missing)}`);
      lines.push(`Extra nodes: ${formatDiffList(result.nodeDiff.extra)}`);
      lines.push(`Missing edges: ${formatDiffList(result.edgeDiff.missing)}`);
      lines.push(`Extra edges: ${formatDiffList(result.edgeDiff.extra)}`);
      if (result.distanceDiffCount) {
        lines.push(`Distance mismatches shown: ${result.distanceDiffs.length} of ${result.distanceDiffCount}`);
      }
    }
    lines.push('');
  });

  return lines.join('\n');
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

  const leftRef = String(args['left-ref'] || 'pre-refactor');
  const rightRef = String(args['right-ref'] || 'current');
  const tolerance = Number(args.tolerance ?? 1e-6);
  const scenarioFilter = String(args.scenario || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  const leftSnapshots = loadSnapshots(dir, runId, leftRef);
  const rightSnapshots = loadSnapshots(dir, runId, rightRef);
  const leftIds = [...leftSnapshots.keys()].sort();
  const rightIds = [...rightSnapshots.keys()].sort();
  const allIds = [...new Set([...leftIds, ...rightIds])]
    .filter((id) => !scenarioFilter.length || scenarioFilter.includes(id))
    .sort();
  const results = [];

  allIds.forEach((scenarioId) => {
    const left = leftSnapshots.get(scenarioId);
    const right = rightSnapshots.get(scenarioId);

    if (!left || !right) {
      results.push({
        scenarioId,
        passed: false,
        threshold: left?.snapshot.threshold ?? right?.snapshot.threshold,
        failures: [`Missing snapshot for ${!left ? leftRef : rightRef}`],
        counts: {
          leftNodes: left?.snapshot.nodeIds?.length ?? 0,
          rightNodes: right?.snapshot.nodeIds?.length ?? 0,
          leftVisibleEdges: left?.snapshot.visibleEdges?.length ?? 0,
          rightVisibleEdges: right?.snapshot.visibleEdges?.length ?? 0,
          sharedVisibleEdges: 0,
        },
        nodeDiff: { missing: [], extra: [] },
        edgeDiff: { missing: [], extra: [] },
        distanceDiffs: [],
        distanceDiffCount: 0,
      });
      return;
    }

    results.push(compareEdgeSnapshots(left.snapshot, right.snapshot, { tolerance }));
  });

  const emptyFailure = results.length === 0 ? 1 : 0;
  const failureCount = results.filter((result) => !result.passed).length + emptyFailure;
  const report = {
    runId,
    generatedAt: new Date().toISOString(),
    leftRef,
    rightRef,
    tolerance,
    comparedCount: results.length,
    failureCount,
    results,
    note: results.length === 0 ? 'No matching edge snapshots were found to compare.' : undefined,
  };
  const outJson = path.join(dir, runId, 'newick-parity-comparison.json');
  const outMd = path.join(dir, runId, 'newick-parity-comparison.md');

  writeJson(outJson, report);
  writeText(outMd, buildMarkdownReport(report));

  console.log(`Compared ${results.length} Newick edge snapshots for run ${runId}`);
  console.log(`Wrote ${path.relative(process.cwd(), outJson)}`);
  console.log(`Wrote ${path.relative(process.cwd(), outMd)}`);

  if (results.length === 0) {
    console.error('No matching Newick edge snapshots were found to compare.');
  }

  if (failureCount > 0) {
    console.error(`${failureCount} Newick parity comparison(s) failed.`);
    process.exitCode = 1;
  }
}

main();
