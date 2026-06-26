#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const DEFAULT_DIR = path.join(process.cwd(), 'cypress', 'downloads', 'performance');
const DEFAULT_CONFIG = path.join(process.cwd(), 'cypress', 'performance', 'budgets.json');
const DEFAULT_OUT = path.join(DEFAULT_DIR, 'budget-check.json');
const DEFAULT_MARKDOWN = path.join(DEFAULT_DIR, 'budget-check.md');

function parseArgs(argv) {
  const args = {
    dir: DEFAULT_DIR,
    config: DEFAULT_CONFIG,
    runId: 'latest',
    out: DEFAULT_OUT,
    markdown: DEFAULT_MARKDOWN,
    enforce: false,
    failOnWarning: false,
    requireConfig: false,
    scenarios: new Set(),
  };

  for (let index = 2; index < argv.length; index++) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === '--dir' && next) {
      args.dir = path.resolve(next);
      index++;
    } else if (arg === '--config' && next) {
      args.config = path.resolve(next);
      index++;
    } else if (arg === '--run-id' && next) {
      args.runId = next;
      index++;
    } else if (arg === '--out' && next) {
      args.out = path.resolve(next);
      index++;
    } else if (arg === '--markdown' && next) {
      args.markdown = path.resolve(next);
      index++;
    } else if (arg === '--scenario' && next) {
      args.scenarios.add(next);
      index++;
    } else if (arg === '--enforce') {
      args.enforce = true;
    } else if (arg === '--fail-on-warning') {
      args.failOnWarning = true;
      args.enforce = true;
    } else if (arg === '--require-config') {
      args.requireConfig = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/check-performance-budgets.js [options]

Checks the latest Cypress performance artifacts against reviewed budget thresholds.
Defaults to report-only mode; use --enforce to fail on failure thresholds.

Options:
  --config <path>        Budget config JSON. Defaults to cypress/performance/budgets.json.
  --dir <path>           Performance artifact directory. Defaults to cypress/downloads/performance.
  --run-id <id>          Run id to check. Defaults to latest.
  --scenario <id>        Include only a scenario. Can be repeated.
  --out <path>           JSON report output path.
  --markdown <path>      Markdown report output path.
  --enforce              Exit non-zero when failure thresholds are exceeded.
  --fail-on-warning      Exit non-zero when warning or failure thresholds are exceeded.
  --require-config       Exit non-zero when the budget config is missing.
`);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function round(value) {
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 1000) / 1000;
}

function flattenNumericValues(value, prefix = '', output = {}) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    output[prefix] = value;
    return output;
  }

  if (!isPlainObject(value)) return output;

  Object.entries(value).forEach(([key, child]) => {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    flattenNumericValues(child, nextPrefix, output);
  });

  return output;
}

function isSummaryFile(fileName) {
  return (
    fileName === 'latest-summary.json' ||
    fileName === 'baseline-summary.json' ||
    fileName === 'latest-baseline-summary.json' ||
    fileName === 'budget-proposal.json' ||
    fileName === 'latest-budget-proposal.json' ||
    fileName === 'budget-check.json' ||
    fileName === 'latest-budget-check.json' ||
    fileName.endsWith('-summary.json')
  );
}

function loadBudgetConfig(configPath, args) {
  if (!fs.existsSync(configPath)) {
    if (args.requireConfig) {
      throw new Error(`Performance budget config does not exist: ${configPath}`);
    }

    return {
      configured: false,
      configPath,
      budgets: {},
    };
  }

  const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const budgets = {};
  let skippedBudgetCount = 0;

  if (isPlainObject(raw.budgets)) {
    Object.entries(raw.budgets).forEach(([scenarioId, scenarioBudgets]) => {
      const normalized = normalizeScenarioBudgetMap(scenarioBudgets);
      budgets[scenarioId] = {
        ...(budgets[scenarioId] || {}),
        ...normalized.budgets,
      };
      skippedBudgetCount += normalized.skippedBudgetCount;
    });
  }

  if (isPlainObject(raw.scenarios)) {
    Object.entries(raw.scenarios).forEach(([scenarioId, scenario]) => {
      if (isPlainObject(scenario?.budgets)) {
        const normalized = normalizeScenarioBudgetMap(scenario.budgets);
        budgets[scenarioId] = {
          ...(budgets[scenarioId] || {}),
          ...normalized.budgets,
        };
        skippedBudgetCount += normalized.skippedBudgetCount;
      }
    });
  }

  return {
    configured: true,
    configPath,
    schemaVersion: raw.schemaVersion || null,
    mode: raw.mode || 'report-only',
    budgets,
    skippedBudgetCount,
  };
}

function normalizeScenarioBudgetMap(scenarioBudgets) {
  if (!isPlainObject(scenarioBudgets)) {
    return {
      budgets: {},
      skippedBudgetCount: 0,
    };
  }

  const budgets = {};
  let skippedBudgetCount = 0;
  const scenarioDisabled = scenarioBudgets.enabled === false;
  const metadataKeys = new Set(['description', 'enabled', 'note', 'title']);

  Object.entries(scenarioBudgets)
    .filter(([metricName]) => !metadataKeys.has(metricName))
    .forEach(([metricName, budget]) => {
      if (!isPlainObject(budget)) return;

      if (scenarioDisabled || budget.enabled === false) {
        skippedBudgetCount++;
        return;
      }

      const normalized = {
        warningMs: numberOrNull(budget.warningMs),
        failureMs: numberOrNull(budget.failureMs),
        note: budget.note || null,
      };

      if (normalized.warningMs === null && normalized.failureMs === null) {
        throw new Error(`Budget ${metricName} is missing warningMs and failureMs thresholds`);
      }

      budgets[metricName] = normalized;
    });

  return {
    budgets,
    skippedBudgetCount,
  };
}

function numberOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function resolveRunId(inputDir, requestedRunId) {
  if (requestedRunId !== 'latest') return requestedRunId;

  const latestSummaryPath = path.join(inputDir, 'latest-summary.json');
  if (!fs.existsSync(latestSummaryPath)) {
    throw new Error(`Cannot resolve latest run id; missing ${latestSummaryPath}`);
  }

  const summary = JSON.parse(fs.readFileSync(latestSummaryPath, 'utf8'));
  if (!summary.runId) {
    throw new Error(`Cannot resolve latest run id from ${latestSummaryPath}`);
  }

  return summary.runId;
}

function loadArtifacts(inputDir, runId, scenarioFilter) {
  if (!fs.existsSync(inputDir)) {
    throw new Error(`Performance artifact directory does not exist: ${inputDir}`);
  }

  return fs.readdirSync(inputDir)
    .filter((fileName) => fileName.endsWith('.json') && !isSummaryFile(fileName))
    .map((fileName) => path.join(inputDir, fileName))
    .map((filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8')))
    .filter((artifact) => artifact.runId === runId)
    .filter((artifact) => artifact.scenarioId || artifact.scenario?.id)
    .filter((artifact) => {
      if (scenarioFilter.size === 0) return true;
      return scenarioFilter.has(artifact.scenarioId || artifact.scenario?.id);
    });
}

function flattenArtifactMetrics(artifact) {
  return {
    ...flattenNumericValues(artifact.metrics || {}),
    ...flattenNumericValues(artifact.app || {}, 'app'),
    ...flattenNumericValues(artifact.counts || {}, 'counts'),
    ...flattenNumericValues(artifact.heap || {}, 'heap'),
    ...flattenNumericValues(artifact.longTasks || {}, 'longTasks'),
  };
}

function checkMetric(value, budget) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'missing';
  }

  if (budget.failureMs !== null && value > budget.failureMs) {
    return 'failure';
  }

  if (budget.warningMs !== null && value > budget.warningMs) {
    return 'warning';
  }

  return 'pass';
}

function buildReport(config, artifacts, runId, args) {
  const artifactsByScenario = new Map(
    artifacts.map((artifact) => [artifact.scenarioId || artifact.scenario?.id, artifact])
  );
  const scenarioIds = Object.keys(config.budgets).filter((scenarioId) => (
    args.scenarios.size === 0 || args.scenarios.has(scenarioId)
  ));
  const scenarioReports = {};
  let passCount = 0;
  let warningCount = 0;
  let failureCount = 0;
  let missingCount = 0;
  let budgetCount = 0;
  const skippedCount = config.skippedBudgetCount || 0;

  scenarioIds.sort().forEach((scenarioId) => {
    const artifact = artifactsByScenario.get(scenarioId);
    const metricValues = artifact ? flattenArtifactMetrics(artifact) : {};
    const checks = {};

    Object.entries(config.budgets[scenarioId] || {}).sort(([a], [b]) => a.localeCompare(b))
      .forEach(([metricName, budget]) => {
        const value = metricValues[metricName];
        const status = artifact ? checkMetric(value, budget) : 'missing';
        budgetCount++;

        if (status === 'pass') passCount++;
        if (status === 'warning') warningCount++;
        if (status === 'failure') failureCount++;
        if (status === 'missing') missingCount++;

        checks[metricName] = {
          status,
          actual: typeof value === 'number' && Number.isFinite(value) ? round(value) : null,
          actualMs: typeof value === 'number' && Number.isFinite(value) ? round(value) : null,
          warningMs: budget.warningMs,
          failureMs: budget.failureMs,
          note: budget.note,
        };
      });

    scenarioReports[scenarioId] = {
      scenarioId,
      title: artifact?.scenario?.title || scenarioId,
      artifactFound: Boolean(artifact),
      checks,
    };
  });

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    runId,
    configured: config.configured,
    configPath: path.relative(process.cwd(), config.configPath) || config.configPath,
    reportOnly: !args.enforce,
    enforced: args.enforce,
    mode: args.enforce ? (args.failOnWarning ? 'fail-on-warning' : 'enforce') : 'report-only',
    artifactCount: artifacts.length,
    scenarioCount: scenarioIds.length,
    budgetCount,
    passCount,
    warningCount,
    failureCount,
    missingCount,
    skippedCount,
    totals: {
      passed: passCount,
      warnings: warningCount,
      failures: failureCount,
      missing: missingCount,
      skipped: skippedCount,
    },
    exitWouldFail: args.enforce && (failureCount > 0 || missingCount > 0 || (args.failOnWarning && warningCount > 0)),
    scenarios: scenarioReports,
  };
}

function buildNoConfigReport(config, args) {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    runId: null,
    configured: false,
    configPath: path.relative(process.cwd(), config.configPath) || config.configPath,
    reportOnly: !args.enforce,
    enforced: args.enforce,
    mode: args.enforce ? (args.failOnWarning ? 'fail-on-warning' : 'enforce') : 'report-only',
    artifactCount: 0,
    scenarioCount: 0,
    budgetCount: 0,
    passCount: 0,
    warningCount: 0,
    failureCount: 0,
    missingCount: 0,
    skippedCount: 0,
    totals: {
      passed: 0,
      warnings: 0,
      failures: 0,
      missing: 0,
      skipped: 0,
    },
    exitWouldFail: false,
    scenarios: {},
    note: 'No reviewed performance budget config was found. Copy cypress/performance/budgets.example.json to cypress/performance/budgets.json after budget review.',
  };
}

function writeOutputs(report, args) {
  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(args.markdown, buildMarkdown(report), 'utf8');

  fs.writeFileSync(
    path.join(path.dirname(args.out), 'latest-budget-check.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8'
  );
  fs.writeFileSync(
    path.join(path.dirname(args.markdown), 'latest-budget-check.md'),
    buildMarkdown(report),
    'utf8'
  );
}

function buildMarkdown(report) {
  const lines = [
    '# Performance Budget Check',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    `Mode: ${report.mode}`,
    `Run id: ${report.runId || ''}`,
    `Config: ${report.configPath}`,
    '',
    `Configured: ${report.configured ? 'yes' : 'no'}`,
    `Budgets: ${report.budgetCount}`,
    `Pass: ${report.passCount}`,
    `Warnings: ${report.warningCount}`,
    `Failures: ${report.failureCount}`,
    `Missing: ${report.missingCount}`,
    `Skipped: ${report.skippedCount}`,
    '',
  ];

  if (!report.configured) {
    lines.push(report.note || 'No reviewed performance budget config was found.');
    lines.push('');
    return `${lines.join('\n')}\n`;
  }

  lines.push('| Scenario | Metric | Status | Actual | Warning | Failure |');
  lines.push('| --- | --- | --- | ---: | ---: | ---: |');

  Object.values(report.scenarios).forEach((scenario) => {
    Object.entries(scenario.checks).forEach(([metricName, check]) => {
      lines.push([
        scenario.scenarioId,
        metricName,
        check.status,
        formatDuration(check.actualMs),
        formatDuration(check.warningMs),
        formatDuration(check.failureMs),
      ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
    });
  });

  lines.push('');
  return `${lines.join('\n')}\n`;
}

function formatNumber(value) {
  return value === null || value === undefined ? '' : String(round(value));
}

function formatDuration(value) {
  const rounded = round(value);
  if (rounded === null) return '';
  return `${rounded} ms (${round(rounded / 1000)} s)`;
}

function main() {
  const args = parseArgs(process.argv);
  const config = loadBudgetConfig(args.config, args);
  const runId = config.configured ? resolveRunId(args.dir, args.runId) : null;
  const artifacts = config.configured ? loadArtifacts(args.dir, runId, args.scenarios) : [];
  const report = config.configured
    ? buildReport(config, artifacts, runId, args)
    : buildNoConfigReport(config, args);

  writeOutputs(report, args);

  console.log(`Configured: ${report.configured ? 'yes' : 'no'}`);
  console.log(`Wrote ${path.relative(process.cwd(), args.out)}`);
  console.log(`Wrote ${path.relative(process.cwd(), args.markdown)}`);
  console.log(`Budgets: ${report.budgetCount}, pass=${report.passCount}, warnings=${report.warningCount}, failures=${report.failureCount}, missing=${report.missingCount}, skipped=${report.skippedCount}`);

  if (report.exitWouldFail) {
    process.exit(1);
  }
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
