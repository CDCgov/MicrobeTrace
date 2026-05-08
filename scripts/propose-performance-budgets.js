#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const DEFAULT_SUMMARY_PATH = path.join(process.cwd(), 'cypress', 'downloads', 'performance', 'baseline-summary.json');
const DEFAULT_OUT_PATH = path.join(process.cwd(), 'cypress', 'downloads', 'performance', 'budget-proposal.json');
const DEFAULT_MARKDOWN_PATH = path.join(process.cwd(), 'cypress', 'downloads', 'performance', 'budget-proposal.md');

const DEFAULT_METRICS = [
  'totalMeasuredMs',
  'launchToFullyLoadedMs',
  'targetViewReadyMs',
  'longTasks.maxDurationMs',
  'longTasks.totalDurationMs',
];

function parseArgs(argv) {
  const args = {
    summary: DEFAULT_SUMMARY_PATH,
    out: DEFAULT_OUT_PATH,
    markdown: DEFAULT_MARKDOWN_PATH,
    minSamples: 5,
    warningMultiplier: 1.25,
    failureMultiplier: 1.5,
    metrics: new Set(DEFAULT_METRICS),
  };

  for (let index = 2; index < argv.length; index++) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === '--summary' && next) {
      args.summary = path.resolve(next);
      index++;
    } else if (arg === '--out' && next) {
      args.out = path.resolve(next);
      index++;
    } else if (arg === '--markdown' && next) {
      args.markdown = path.resolve(next);
      index++;
    } else if (arg === '--min-samples' && next) {
      args.minSamples = parsePositiveNumber(next, '--min-samples');
      index++;
    } else if (arg === '--warning-multiplier' && next) {
      args.warningMultiplier = parsePositiveNumber(next, '--warning-multiplier');
      index++;
    } else if (arg === '--failure-multiplier' && next) {
      args.failureMultiplier = parsePositiveNumber(next, '--failure-multiplier');
      index++;
    } else if (arg === '--metric' && next) {
      args.metrics.add(next);
      index++;
    } else if (arg === '--only-metric' && next) {
      args.metrics = new Set([next]);
      index++;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function parsePositiveNumber(value, name) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${name} value: ${value}`);
  }
  return parsed;
}

function printHelp() {
  console.log(`Usage: node scripts/propose-performance-budgets.js [options]

Reads a descriptive baseline summary and writes budget candidates.
Scenarios are eligible only when they meet the sample threshold.

Options:
  --summary <path>              Baseline summary JSON path.
  --out <path>                  Budget proposal JSON output path.
  --markdown <path>             Budget proposal Markdown output path.
  --min-samples <n>             Minimum samples before budgets are proposed. Defaults to 5.
  --warning-multiplier <n>      Warning threshold multiplier from p95. Defaults to 1.25.
  --failure-multiplier <n>      Failure threshold multiplier from p95. Defaults to 1.5.
  --metric <name>               Add a metric to propose. Can be repeated.
  --only-metric <name>          Propose only this metric.
`);
}

function round(value) {
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 1000) / 1000;
}

function readSummary(summaryPath) {
  if (!fs.existsSync(summaryPath)) {
    throw new Error(`Baseline summary does not exist: ${summaryPath}`);
  }

  return JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
}

function proposeScenarioBudgets(scenario, args) {
  const stable = scenario.sampleCount >= args.minSamples;

  if (!stable) {
    return {
      scenarioId: scenario.scenarioId,
      title: scenario.title,
      eligible: false,
      reason: `requires at least ${args.minSamples} samples; found ${scenario.sampleCount}`,
      sampleCount: scenario.sampleCount,
      budgets: {},
    };
  }

  const budgets = {};
  Array.from(args.metrics).sort().forEach((metricName) => {
    const metric = scenario.metrics?.[metricName];
    if (!metric || typeof metric.p95 !== 'number') return;

    budgets[metricName] = {
      baselineP50: metric.p50,
      baselineP95: metric.p95,
      samples: metric.samples,
      warningMs: round(metric.p95 * args.warningMultiplier),
      failureMs: round(metric.p95 * args.failureMultiplier),
      warningMultiplier: args.warningMultiplier,
      failureMultiplier: args.failureMultiplier,
    };
  });

  return {
    scenarioId: scenario.scenarioId,
    title: scenario.title,
    eligible: Object.keys(budgets).length > 0,
    reason: Object.keys(budgets).length > 0 ? null : 'no selected metrics had p95 values',
    sampleCount: scenario.sampleCount,
    budgets,
  };
}

function buildProposal(summary, args) {
  const scenarios = Object.values(summary.scenarios || {}).map((scenario) => (
    proposeScenarioBudgets(scenario, args)
  ));
  const eligibleScenarioCount = scenarios.filter((scenario) => scenario.eligible).length;
  const budgetCount = scenarios.reduce((count, scenario) => count + Object.keys(scenario.budgets).length, 0);

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceSummary: path.relative(process.cwd(), args.summary) || args.summary,
    minSamples: args.minSamples,
    warningMultiplier: args.warningMultiplier,
    failureMultiplier: args.failureMultiplier,
    selectedMetrics: Array.from(args.metrics).sort(),
    scenarioCount: scenarios.length,
    eligibleScenarioCount,
    budgetCount,
    note: 'Budget proposal only. Review and commit a separate budget config before enforcing thresholds.',
    scenarios: Object.fromEntries(
      scenarios
        .sort((a, b) => a.scenarioId.localeCompare(b.scenarioId))
        .map((scenario) => [scenario.scenarioId, scenario])
    ),
  };
}

function formatNumber(value) {
  return value === null || value === undefined ? '' : String(round(value));
}

function formatDuration(value) {
  const rounded = round(value);
  if (rounded === null) return '';
  return `${rounded} ms (${round(rounded / 1000)} s)`;
}

function buildMarkdown(proposal) {
  const lines = [
    '# Performance Budget Proposal',
    '',
    `Generated: ${proposal.generatedAt}`,
    '',
    proposal.note,
    '',
    `Eligible scenarios: ${proposal.eligibleScenarioCount}/${proposal.scenarioCount}`,
    `Budget candidates: ${proposal.budgetCount}`,
    '',
    '| Scenario | Eligible | Metric | p50 | p95 | Warning | Failure | Samples |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |',
  ];

  Object.values(proposal.scenarios).forEach((scenario) => {
    const budgetEntries = Object.entries(scenario.budgets);

    if (budgetEntries.length === 0) {
      lines.push([
        scenario.scenarioId,
        'no',
        scenario.reason || '',
        '',
        '',
        '',
        '',
        scenario.sampleCount,
      ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
      return;
    }

    budgetEntries.forEach(([metricName, budget]) => {
      lines.push([
        scenario.scenarioId,
        'yes',
        metricName,
        formatDuration(budget.baselineP50),
        formatDuration(budget.baselineP95),
        formatDuration(budget.warningMs),
        formatDuration(budget.failureMs),
        budget.samples,
      ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
    });
  });

  lines.push('');
  lines.push('## Review Rules');
  lines.push('');
  lines.push('- Treat these as candidate thresholds, not enforced budgets.');
  lines.push('- Use warning thresholds first, then failure thresholds after CI stability is understood.');
  lines.push('- Recreate proposals after major performance refactors or dependency upgrades.');
  lines.push('');

  return `${lines.join('\n')}\n`;
}

function writeOutputs(proposal, args) {
  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, `${JSON.stringify(proposal, null, 2)}\n`, 'utf8');
  fs.writeFileSync(args.markdown, buildMarkdown(proposal), 'utf8');

  fs.writeFileSync(
    path.join(path.dirname(args.out), 'latest-budget-proposal.json'),
    `${JSON.stringify(proposal, null, 2)}\n`,
    'utf8'
  );
  fs.writeFileSync(
    path.join(path.dirname(args.markdown), 'latest-budget-proposal.md'),
    buildMarkdown(proposal),
    'utf8'
  );
}

function main() {
  const args = parseArgs(process.argv);
  const summary = readSummary(args.summary);
  const proposal = buildProposal(summary, args);
  writeOutputs(proposal, args);

  console.log(`Read ${path.relative(process.cwd(), args.summary)}`);
  console.log(`Wrote ${path.relative(process.cwd(), args.out)}`);
  console.log(`Wrote ${path.relative(process.cwd(), args.markdown)}`);
  console.log(`Eligible scenarios: ${proposal.eligibleScenarioCount}/${proposal.scenarioCount}`);
  console.log(`Budget candidates: ${proposal.budgetCount}`);
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
