#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const DEFAULT_INPUT_DIR = path.join(process.cwd(), 'cypress', 'downloads', 'performance');
const OBSOLETE_SCENARIO_IDS = new Set([
  'average-sequences-120',
  'large-sequences-300',
  'newick-refactor-after-average-500',
  'newick-refactor-before-average-500',
]);
const OBSOLETE_SCENARIO_PREFIXES = [
  'before-',
  'after-',
  'compare-',
];

function parseArgs(argv) {
  const args = {
    dir: DEFAULT_INPUT_DIR,
    out: null,
    markdown: null,
    scenarios: new Set(),
    includeObsolete: false,
    minSamples: 1,
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
    } else if (arg === '--scenario' && next) {
      args.scenarios.add(next);
      index++;
    } else if (arg === '--include-obsolete') {
      args.includeObsolete = true;
    } else if (arg === '--min-samples' && next) {
      const parsed = Number(next);
      if (Number.isFinite(parsed) && parsed > 0) {
        args.minSamples = parsed;
      }
      index++;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  if (!args.out) {
    args.out = path.join(args.dir, 'baseline-summary.json');
  }

  if (!args.markdown) {
    args.markdown = path.join(args.dir, 'baseline-summary.md');
  }

  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/summarize-performance-runs.js [options]

Options:
  --dir <path>          Performance artifact directory. Defaults to cypress/downloads/performance.
  --out <path>          JSON summary output path. Defaults to baseline-summary.json in the artifact directory.
  --markdown <path>     Markdown summary output path. Defaults to baseline-summary.md in the artifact directory.
  --scenario <id>       Include only a scenario id. Can be repeated.
  --include-obsolete    Include obsolete/historical scenario ids in summaries.
  --min-samples <n>     Mark scenarios with fewer samples as unstable. Defaults to 1.
`);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isSummaryFile(fileName) {
  return (
    fileName === 'latest-summary.json' ||
    fileName === 'baseline-summary.json' ||
    fileName === 'latest-baseline-summary.json' ||
    fileName.endsWith('-summary.json')
  );
}

function readArtifacts(inputDir, args) {
  if (!fs.existsSync(inputDir)) {
    throw new Error(`Performance artifact directory does not exist: ${inputDir}`);
  }

  return fs.readdirSync(inputDir)
    .filter((fileName) => fileName.endsWith('.json') && !isSummaryFile(fileName))
    .map((fileName) => path.join(inputDir, fileName))
    .map((filePath) => {
      const artifact = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return {
        ...artifact,
        artifactPath: filePath,
      };
    })
    .filter((artifact) => artifact.scenarioId || artifact.scenario?.id)
    .filter((artifact) => {
      const scenarioId = artifact.scenarioId || artifact.scenario?.id;
      if (!args.includeObsolete && OBSOLETE_SCENARIO_IDS.has(scenarioId)) return false;
      if (
        !args.includeObsolete &&
        OBSOLETE_SCENARIO_PREFIXES.some((prefix) => String(scenarioId).startsWith(prefix))
      ) {
        return false;
      }
      if (args.scenarios.size === 0) return true;
      return args.scenarios.has(scenarioId);
    })
    .sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')));
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

function round(value) {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 1000) / 1000;
}

function quantile(sortedValues, q) {
  if (sortedValues.length === 0) return null;
  if (sortedValues.length === 1) return sortedValues[0];

  const position = (sortedValues.length - 1) * q;
  const base = Math.floor(position);
  const rest = position - base;
  const next = sortedValues[base + 1];

  if (next === undefined) return sortedValues[base];
  return sortedValues[base] + rest * (next - sortedValues[base]);
}

function summarizeValues(values) {
  const sorted = values
    .filter((value) => typeof value === 'number' && Number.isFinite(value))
    .sort((a, b) => a - b);

  if (sorted.length === 0) return null;

  const sum = sorted.reduce((acc, value) => acc + value, 0);
  const mean = sum / sorted.length;
  const variance = sorted.reduce((acc, value) => acc + ((value - mean) ** 2), 0) / sorted.length;

  return {
    samples: sorted.length,
    min: round(sorted[0]),
    p50: round(quantile(sorted, 0.5)),
    p75: round(quantile(sorted, 0.75)),
    p90: round(quantile(sorted, 0.9)),
    p95: round(quantile(sorted, 0.95)),
    max: round(sorted[sorted.length - 1]),
    mean: round(mean),
    stdev: round(Math.sqrt(variance)),
  };
}

function addBucketValue(bucket, key, value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return;
  if (!bucket.has(key)) bucket.set(key, []);
  bucket.get(key).push(value);
}

function summarizeBucket(bucket) {
  return Object.fromEntries(
    Array.from(bucket.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, values]) => [key, summarizeValues(values)])
  );
}

function summarizeScenario(records, minSamples) {
  const metricBucket = new Map();
  const countBucket = new Map();
  const runIds = new Set();
  const browsers = new Set();
  const specs = new Set();

  records.forEach((record) => {
    runIds.add(record.runId || 'unknown');
    if (record.browser?.displayName) browsers.add(record.browser.displayName);
    if (record.browser?.version) browsers.add(`${record.browser.displayName || 'browser'} ${record.browser.version}`);
    if (record.spec?.relative) specs.add(record.spec.relative);

    const topLevelMetrics = flattenNumericValues(record.metrics || {});
    Object.entries(topLevelMetrics).forEach(([key, value]) => addBucketValue(metricBucket, key, value));

    const appMetrics = flattenNumericValues(record.app || {}, 'app');
    Object.entries(appMetrics).forEach(([key, value]) => addBucketValue(metricBucket, key, value));

    const heapMetrics = flattenNumericValues(record.heap || {}, 'heap');
    Object.entries(heapMetrics).forEach(([key, value]) => addBucketValue(metricBucket, key, value));

    const longTaskMetrics = flattenNumericValues(record.longTasks || {}, 'longTasks');
    Object.entries(longTaskMetrics).forEach(([key, value]) => addBucketValue(metricBucket, key, value));

    const counts = flattenNumericValues(record.counts || {});
    Object.entries(counts).forEach(([key, value]) => addBucketValue(countBucket, key, value));
  });

  const latest = records[records.length - 1];
  const timestamps = records
    .map((record) => record.timestamp)
    .filter(Boolean)
    .sort();

  return {
    scenarioId: latest.scenarioId || latest.scenario?.id,
    title: latest.scenario?.title || latest.title || latest.scenarioId,
    stableEnoughForBudgets: records.length >= minSamples,
    sampleCount: records.length,
    runCount: runIds.size,
    firstTimestamp: timestamps[0] || null,
    latestTimestamp: timestamps[timestamps.length - 1] || null,
    browsers: Array.from(browsers).sort(),
    specs: Array.from(specs).sort(),
    latestScenario: latest.scenario || null,
    latestCounts: latest.counts || null,
    counts: summarizeBucket(countBucket),
    metrics: summarizeBucket(metricBucket),
  };
}

function buildSummary(artifacts, args) {
  const grouped = new Map();

  artifacts.forEach((artifact) => {
    const scenarioId = artifact.scenarioId || artifact.scenario?.id;
    if (!grouped.has(scenarioId)) grouped.set(scenarioId, []);
    grouped.get(scenarioId).push(artifact);
  });

  const scenarios = Object.fromEntries(
    Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([scenarioId, records]) => [scenarioId, summarizeScenario(records, args.minSamples)])
  );

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    inputDir: path.relative(process.cwd(), args.dir) || '.',
    artifactCount: artifacts.length,
    scenarioCount: Object.keys(scenarios).length,
    filters: {
      scenarios: Array.from(args.scenarios).sort(),
      includeObsolete: args.includeObsolete,
      obsoleteScenarioIds: Array.from(OBSOLETE_SCENARIO_IDS).sort(),
      obsoleteScenarioPrefixes: OBSOLETE_SCENARIO_PREFIXES,
      minSamples: args.minSamples,
    },
    note: 'Descriptive baseline summary only. Do not use these values as CI budgets until each scenario has enough repeated samples on stable hardware.',
    scenarios,
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

function formatMetric(scenario, metricName, field) {
  return formatDuration(scenario.metrics?.[metricName]?.[field]);
}

function buildMarkdown(summary) {
  const lines = [
    '# Performance Baseline Summary',
    '',
    `Generated: ${summary.generatedAt}`,
    '',
    summary.note,
    '',
    '| Scenario | Samples | Runs | Stable | totalMeasured p50 | totalMeasured p95 | launchToLoaded p95 | max long tasks | Latest counts |',
    '| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | --- |',
  ];

  Object.values(summary.scenarios).forEach((scenario) => {
    const counts = scenario.latestCounts
      ? `${scenario.latestCounts.nodes ?? ''} nodes / ${scenario.latestCounts.totalLinks ?? ''} links / ${scenario.latestCounts.visibleLinks ?? ''} visible`
      : '';
    lines.push([
      scenario.scenarioId,
      scenario.sampleCount,
      scenario.runCount,
      scenario.stableEnoughForBudgets ? 'yes' : 'no',
      formatMetric(scenario, 'totalMeasuredMs', 'p50'),
      formatMetric(scenario, 'totalMeasuredMs', 'p95'),
      formatMetric(scenario, 'launchToFullyLoadedMs', 'p95'),
      formatMetric(scenario, 'longTasks.maxDurationMs', 'max'),
      counts,
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  });

  lines.push('');
  lines.push('## Notes');
  lines.push('');
  lines.push('- p50/p95 values are descriptive until each scenario has repeated samples from stable hardware or CI.');
  lines.push('- Large scenarios are opt-in with `npm run e2e:perf:large`.');
  lines.push('- Full phase-level metrics are available in `baseline-summary.json`.');
  lines.push('');

  return `${lines.join('\n')}\n`;
}

function writeOutputs(summary, args) {
  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  fs.writeFileSync(args.markdown, buildMarkdown(summary), 'utf8');

  const latestJson = path.join(path.dirname(args.out), 'latest-baseline-summary.json');
  const latestMarkdown = path.join(path.dirname(args.markdown), 'latest-baseline-summary.md');
  fs.writeFileSync(latestJson, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  fs.writeFileSync(latestMarkdown, buildMarkdown(summary), 'utf8');
}

function printConsoleSummary(summary, args) {
  console.log(`Read ${summary.artifactCount} performance artifacts from ${summary.inputDir}`);
  console.log(`Wrote ${path.relative(process.cwd(), args.out)}`);
  console.log(`Wrote ${path.relative(process.cwd(), args.markdown)}`);

  Object.values(summary.scenarios).forEach((scenario) => {
    const total = scenario.metrics.totalMeasuredMs;
    const launch = scenario.metrics.launchToFullyLoadedMs;
    console.log(
      `${scenario.scenarioId}: samples=${scenario.sampleCount}, runs=${scenario.runCount}, ` +
      `total p50=${formatDuration(total?.p50)}, total p95=${formatDuration(total?.p95)}, ` +
      `launch p95=${formatDuration(launch?.p95)}`
    );
  });
}

function main() {
  const args = parseArgs(process.argv);
  const artifacts = readArtifacts(args.dir, args);

  if (artifacts.length === 0) {
    throw new Error(`No performance result artifacts found in ${args.dir}`);
  }

  const summary = buildSummary(artifacts, args);
  writeOutputs(summary, args);
  printConsoleSummary(summary, args);
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
