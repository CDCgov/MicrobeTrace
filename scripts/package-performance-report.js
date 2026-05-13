#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const DEFAULT_DIR = path.join(process.cwd(), 'cypress', 'downloads', 'performance');

function parseArgs(argv) {
  const args = {
    dir: DEFAULT_DIR,
    out: null,
    markdown: null,
    githubStepSummary: false,
  };

  for (let index = 2; index < argv.length; index++) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === '--dir' && next) {
      args.dir = path.resolve(next);
      index++;
    } else if (arg === '--out' && next) {
      args.out = path.resolve(next);
      index++;
    } else if (arg === '--markdown' && next) {
      args.markdown = path.resolve(next);
      index++;
    } else if (arg === '--github-step-summary') {
      args.githubStepSummary = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!args.out) {
    args.out = path.join(args.dir, 'performance-report.json');
  }

  if (!args.markdown) {
    args.markdown = path.join(args.dir, 'performance-report.md');
  }

  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/package-performance-report.js [options]

Packages Cypress performance outputs into a compact JSON and Markdown report.

Options:
  --dir <path>               Performance artifact directory. Defaults to cypress/downloads/performance.
  --out <path>               JSON report output path.
  --markdown <path>          Markdown report output path.
  --github-step-summary      Append Markdown to $GITHUB_STEP_SUMMARY when available.
`);
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function round(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Math.round(value * 1000) / 1000;
}

function formatNumber(value) {
  const rounded = round(value);
  return rounded === null ? '' : String(rounded);
}

function formatMs(value) {
  const rounded = round(value);
  return rounded === null ? '' : `${rounded} ms (${round(rounded / 1000)} s)`;
}

function pickMetrics(metrics = {}) {
  return {
    uploadToLaunchMs: round(metrics.uploadToLaunchMs),
    launchToFullyLoadedMs: round(metrics.launchToFullyLoadedMs),
    targetViewReadyMs: round(metrics.targetViewReadyMs),
    totalMeasuredMs: round(metrics.totalMeasuredMs),
    alignmentViewReadyMs: round(metrics.alignmentViewReadyMs),
    phylogeneticTreeViewReadyMs: round(metrics.phylogeneticTreeViewReadyMs),
  };
}

function pickCounts(counts = {}) {
  return {
    nodes: counts.nodes ?? null,
    totalLinks: counts.totalLinks ?? null,
    visibleLinks: counts.visibleLinks ?? null,
    sequencesWithData: counts.sequencesWithData ?? null,
    cytoscapeVisibleEdges: counts.cytoscapeVisibleEdges ?? null,
  };
}

function summarizeLatestRun(latestSummary) {
  if (!latestSummary) return null;

  const results = Array.isArray(latestSummary.results) ? latestSummary.results : [];
  return {
    runId: latestSummary.runId || null,
    generatedAt: latestSummary.generatedAt || null,
    resultCount: latestSummary.resultCount ?? results.length,
    scenarios: results.map((result) => ({
      scenarioId: result.scenarioId,
      title: result.title || result.scenarioId,
      timestamp: result.timestamp || null,
      metrics: pickMetrics(result.metrics),
      counts: pickCounts(result.counts),
    })),
  };
}

function metricStats(metrics, metricName) {
  const metric = metrics?.[metricName];
  if (!metric) return null;

  return {
    samples: metric.samples ?? 0,
    p50: round(metric.p50),
    p95: round(metric.p95),
    max: round(metric.max),
  };
}

function summarizeBaseline(baselineSummary) {
  if (!baselineSummary) return null;

  const scenarios = Object.values(baselineSummary.scenarios || {});
  const stableScenarioCount = scenarios.filter((scenario) => scenario.stableEnoughForBudgets).length;

  return {
    generatedAt: baselineSummary.generatedAt || null,
    artifactCount: baselineSummary.artifactCount || 0,
    scenarioCount: baselineSummary.scenarioCount || scenarios.length,
    stableScenarioCount,
    minSamples: baselineSummary.filters?.minSamples ?? null,
    scenarios: scenarios
      .sort((a, b) => String(a.scenarioId).localeCompare(String(b.scenarioId)))
      .map((scenario) => ({
        scenarioId: scenario.scenarioId,
        title: scenario.title || scenario.scenarioId,
        sampleCount: scenario.sampleCount || 0,
        stableEnoughForBudgets: Boolean(scenario.stableEnoughForBudgets),
        totalMeasuredMs: metricStats(scenario.metrics, 'totalMeasuredMs'),
        launchToFullyLoadedMs: metricStats(scenario.metrics, 'launchToFullyLoadedMs'),
        targetViewReadyMs: metricStats(scenario.metrics, 'targetViewReadyMs'),
        longTaskMaxMs: metricStats(scenario.metrics, 'longTasks.maxDurationMs'),
      })),
  };
}

function summarizeBudgetCheck(budgetCheck) {
  if (!budgetCheck) return null;

  return {
    generatedAt: budgetCheck.generatedAt || null,
    runId: budgetCheck.runId || null,
    configured: Boolean(budgetCheck.configured),
    mode: budgetCheck.mode || null,
    configPath: budgetCheck.configPath || null,
    artifactCount: budgetCheck.artifactCount || 0,
    scenarioCount: budgetCheck.scenarioCount || 0,
    budgetCount: budgetCheck.budgetCount || 0,
    totals: budgetCheck.totals || {
      passed: budgetCheck.passCount || 0,
      warnings: budgetCheck.warningCount || 0,
      failures: budgetCheck.failureCount || 0,
      missing: budgetCheck.missingCount || 0,
      skipped: budgetCheck.skippedCount || 0,
    },
    exitWouldFail: Boolean(budgetCheck.exitWouldFail),
  };
}

function summarizeBudgetProposal(budgetProposal) {
  if (!budgetProposal) return null;

  return {
    generatedAt: budgetProposal.generatedAt || null,
    sourceSummary: budgetProposal.sourceSummary || null,
    minSamples: budgetProposal.minSamples || null,
    scenarioCount: budgetProposal.scenarioCount || 0,
    eligibleScenarioCount: budgetProposal.eligibleScenarioCount || 0,
    budgetCount: budgetProposal.budgetCount || 0,
  };
}

function buildReport(args) {
  const latestSummary = readJsonIfExists(path.join(args.dir, 'latest-summary.json'));
  const baselineSummary = readJsonIfExists(path.join(args.dir, 'latest-baseline-summary.json')) ||
    readJsonIfExists(path.join(args.dir, 'baseline-summary.json'));
  const budgetCheck = readJsonIfExists(path.join(args.dir, 'latest-budget-check.json')) ||
    readJsonIfExists(path.join(args.dir, 'budget-check.json'));
  const budgetProposal = readJsonIfExists(path.join(args.dir, 'latest-budget-proposal.json')) ||
    readJsonIfExists(path.join(args.dir, 'budget-proposal.json'));

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    artifactDir: path.relative(process.cwd(), args.dir) || '.',
    latestRun: summarizeLatestRun(latestSummary),
    baseline: summarizeBaseline(baselineSummary),
    budgetCheck: summarizeBudgetCheck(budgetCheck),
    budgetProposal: summarizeBudgetProposal(budgetProposal),
  };
}

function buildMarkdown(report) {
  const lines = [
    '# Cypress Performance Report',
    '',
    `Generated: ${report.generatedAt}`,
    `Artifact dir: ${report.artifactDir}`,
    '',
  ];

  appendLatestRun(lines, report.latestRun);
  appendBaseline(lines, report.baseline);
  appendBudgetCheck(lines, report.budgetCheck);
  appendBudgetProposal(lines, report.budgetProposal);

  return `${lines.join('\n')}\n`;
}

function appendLatestRun(lines, latestRun) {
  lines.push('## Latest Run');
  lines.push('');

  if (!latestRun) {
    lines.push('No latest Cypress performance run summary was found.');
    lines.push('');
    return;
  }

  lines.push(`Run id: ${latestRun.runId || ''}`);
  lines.push(`Results: ${latestRun.resultCount}`);
  lines.push('');
  lines.push('| Scenario | Total | Launch to Loaded | View Ready | Nodes | Links | Visible Links | Sequences |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');

  latestRun.scenarios.forEach((scenario) => {
    lines.push([
      scenario.scenarioId,
      formatMs(scenario.metrics.totalMeasuredMs),
      formatMs(scenario.metrics.launchToFullyLoadedMs),
      formatMs(scenario.metrics.targetViewReadyMs),
      formatNumber(scenario.counts.nodes),
      formatNumber(scenario.counts.totalLinks),
      formatNumber(scenario.counts.visibleLinks),
      formatNumber(scenario.counts.sequencesWithData),
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  });

  lines.push('');
}

function appendBaseline(lines, baseline) {
  lines.push('## Baseline Summary');
  lines.push('');

  if (!baseline) {
    lines.push('No baseline summary was found.');
    lines.push('');
    return;
  }

  lines.push(`Artifacts: ${baseline.artifactCount}`);
  lines.push(`Stable scenarios: ${baseline.stableScenarioCount}/${baseline.scenarioCount}`);
  lines.push(`Minimum samples: ${baseline.minSamples ?? ''}`);
  lines.push('');
  lines.push('| Scenario | Samples | Stable | Total p50 | Total p95 | Launch p95 | Long Task Max p95 |');
  lines.push('| --- | ---: | --- | ---: | ---: | ---: | ---: |');

  baseline.scenarios.forEach((scenario) => {
    lines.push([
      scenario.scenarioId,
      scenario.sampleCount,
      scenario.stableEnoughForBudgets ? 'yes' : 'no',
      formatMs(scenario.totalMeasuredMs?.p50),
      formatMs(scenario.totalMeasuredMs?.p95),
      formatMs(scenario.launchToFullyLoadedMs?.p95),
      formatMs(scenario.longTaskMaxMs?.p95),
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  });

  lines.push('');
}

function appendBudgetCheck(lines, budgetCheck) {
  lines.push('## Budget Check');
  lines.push('');

  if (!budgetCheck) {
    lines.push('No budget check report was found.');
    lines.push('');
    return;
  }

  lines.push(`Mode: ${budgetCheck.mode || ''}`);
  lines.push(`Configured: ${budgetCheck.configured ? 'yes' : 'no'}`);
  lines.push(`Config: ${budgetCheck.configPath || ''}`);
  lines.push('');
  lines.push('| Budgets | Passed | Warnings | Failures | Missing | Skipped | Exit Would Fail |');
  lines.push('| ---: | ---: | ---: | ---: | ---: | ---: | --- |');
  lines.push([
    budgetCheck.budgetCount,
    budgetCheck.totals.passed,
    budgetCheck.totals.warnings,
    budgetCheck.totals.failures,
    budgetCheck.totals.missing,
    budgetCheck.totals.skipped,
    budgetCheck.exitWouldFail ? 'yes' : 'no',
  ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  lines.push('');
}

function appendBudgetProposal(lines, budgetProposal) {
  lines.push('## Budget Proposal');
  lines.push('');

  if (!budgetProposal) {
    lines.push('No budget proposal was found.');
    lines.push('');
    return;
  }

  lines.push(`Eligible scenarios: ${budgetProposal.eligibleScenarioCount}/${budgetProposal.scenarioCount}`);
  lines.push(`Budget candidates: ${budgetProposal.budgetCount}`);
  lines.push(`Minimum samples: ${budgetProposal.minSamples ?? ''}`);
  lines.push('');
}

function writeOutputs(report, markdown, args) {
  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(args.markdown, markdown, 'utf8');
  fs.writeFileSync(
    path.join(path.dirname(args.out), 'latest-performance-report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8'
  );
  fs.writeFileSync(
    path.join(path.dirname(args.markdown), 'latest-performance-report.md'),
    markdown,
    'utf8'
  );

  if (args.githubStepSummary && process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`, 'utf8');
  }
}

function main() {
  const args = parseArgs(process.argv);
  const report = buildReport(args);
  const markdown = buildMarkdown(report);
  writeOutputs(report, markdown, args);

  console.log(`Wrote ${path.relative(process.cwd(), args.out)}`);
  console.log(`Wrote ${path.relative(process.cwd(), args.markdown)}`);

  if (args.githubStepSummary && !process.env.GITHUB_STEP_SUMMARY) {
    console.log('GITHUB_STEP_SUMMARY is not set; skipped appending the Markdown report.');
  }
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
