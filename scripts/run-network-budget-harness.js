#!/usr/bin/env node

const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_MANIFEST = path.join('tmp', 'network-budget-fixtures', 'network-budget-manifest.csv');
const DEFAULT_OUTPUT_DIR = path.join('tmp', 'network-budget-results');
const DEFAULT_BASE_URL = 'http://127.0.0.1:4210';
const DEFAULT_BROWSER = 'chrome';
const DEFAULT_SPEC = 'cypress/e2e/journeys/flows/network-budget-harness.cy.ts';
const DEFAULT_SETTLE_MS = 1000;
const DEFAULT_TIMEOUT_MS = 120000;
const DEFAULT_THRESHOLD = 999999;
const DEFAULT_PROCESS_SAMPLE_MS = 500;

function printHelp() {
  console.log(`
Run the Cypress network budget harness against generated node/link CSV datasets.

Examples:
  node scripts/run-network-budget-harness.js --manifest tmp/network-budget-fixtures/network-budget-manifest.csv
  node scripts/run-network-budget-harness.js --manifest tmp/network-budget-fixtures/network-budget-manifest.csv --dataset network-budget-5000n-20000e
  node scripts/run-network-budget-harness.js --manifest tmp/network-budget-fixtures/network-budget-manifest.csv --output-dir tmp/network-budget-results/chrome
  node scripts/run-network-budget-harness.js --manifest tmp/network-budget-fixtures/network-budget-manifest.csv --headed

Options:
  --manifest <path>             Manifest CSV from generate-network-budget-fixtures.js.
  --dataset <name[,name]>       Optional comma-separated dataset names to run from the manifest.
  --output-dir <path>           Directory for per-run JSON and aggregate CSV/JSON.
  --base-url <url>              App base URL. Default: http://127.0.0.1:4210.
  --browser <name>              Cypress browser name. Default: chrome.
  --spec <path>                 Cypress spec path. Default: cypress/e2e/journeys/flows/network-budget-harness.cy.ts.
  --threshold <number>          Override launch threshold for every dataset.
  --settle-ms <int>             Extra settle delay after render before the final memory snapshot. Default: 1000.
  --timeout-ms <int>            Launch/render timeout per dataset. Default: 120000.
  --process-sample-ms <int>     OS process memory sampling interval. Default: 500.
  --headed                      Run Cypress in headed mode instead of headless.
  --help                        Show this message.

Notes:
  - This harness expects the app to already be running.
  - Each dataset is benchmarked in its own Cypress run so browser memory starts clean each time.
  - Reports include JS heap, page memory when Chrome exposes it, and RSS sampled from the Chrome processes for that run.
`);
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      throw new Error(`Unexpected argument: ${token}`);
    }

    const key = token.slice(2);
    if (key === 'help' || key === 'headed') {
      args[key] = true;
      continue;
    }

    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Missing value for --${key}`);
    }

    args[key] = value;
    index += 1;
  }

  return args;
}

function parseInteger(value, flagName) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`--${flagName} must be a positive integer. Received: ${value}`);
  }
  return parsed;
}

function parseNumber(value, flagName) {
  const parsed = Number.parseFloat(String(value));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`--${flagName} must be a positive number. Received: ${value}`);
  }
  return parsed;
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) {
    return [];
  }

  const headers = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const values = line.split(',');
    return headers.reduce((row, header, index) => {
      row[header] = values[index] ?? '';
      return row;
    }, {});
  });
}

function sanitizeDatasetName(value) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_');
}

function resolveThreshold(datasetRow, args) {
  if (args.threshold) {
    return parseNumber(args.threshold, 'threshold');
  }

  const manifestMax = Number.parseFloat(datasetRow.distance_max || '');
  if (Number.isFinite(manifestMax) && manifestMax > 0) {
    return manifestMax;
  }

  return DEFAULT_THRESHOLD;
}

function getHeapValue(report, label) {
  const snapshot = (report.heapSnapshots || []).find((entry) => entry.label === label);
  return snapshot ? snapshot.usedJSHeapSize : null;
}

function getPeakHeap(report) {
  const usedValues = (report.heapSnapshots || [])
    .map((entry) => entry.usedJSHeapSize)
    .filter((value) => Number.isFinite(value));

  if (!usedValues.length) {
    return null;
  }

  return Math.max(...usedValues);
}

function getPageMemoryValue(report, label) {
  const snapshot = (report.pageMemorySnapshots || []).find((entry) => entry.label === label);
  return snapshot ? snapshot.bytes : null;
}

function getPeakPageMemory(report) {
  const usedValues = (report.pageMemorySnapshots || [])
    .map((entry) => entry.bytes)
    .filter((value) => Number.isFinite(value));

  if (!usedValues.length) {
    return null;
  }

  return Math.max(...usedValues);
}

function getProcessMemoryPeak(report, key) {
  return report.processMemory && report.processMemory.summary
    ? report.processMemory.summary[key] ?? null
    : null;
}

function getStorageSnapshotValue(report, label, key) {
  const snapshot = (report.storageSnapshots || []).find((entry) => entry.label === label);
  return snapshot ? snapshot[key] ?? null : null;
}

function getStorageDelta(report, key) {
  const start = getStorageSnapshotValue(report, 'after-page-ready', key);
  const end = getStorageSnapshotValue(report, 'after-render-settled', key)
    ?? getStorageSnapshotValue(report, 'after-render-ready', key)
    ?? getStorageSnapshotValue(report, 'after-files-ready', key);

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return null;
  }

  return end - start;
}

function writeSummaryFiles(outputDir, results) {
  const summaryJsonPath = path.join(outputDir, 'summary.json');
  fs.writeFileSync(summaryJsonPath, `${JSON.stringify(results, null, 2)}\n`, 'utf8');

  const header = [
    'dataset',
    'node_count',
    'edge_count',
    'threshold',
    'status',
    'failure_reason',
    'page_ready_ms',
    'upload_select_ms',
    'file_rows_ready_ms',
    'launch_to_loaded_ms',
    'loaded_to_render_ms',
    'render_settle_ms',
    'total_dataset_to_render_ms',
    'total_dataset_to_settled_ms',
    'dom_nodes',
    'dom_visible_links',
    'session_nodes',
    'session_links',
    'cytoscape_nodes',
    'cytoscape_edges',
    'heap_after_page_ready_bytes',
    'heap_after_files_ready_bytes',
    'heap_after_render_ready_bytes',
    'heap_after_render_settled_bytes',
    'heap_peak_bytes',
    'heap_memory_supported',
    'page_memory_after_page_ready_bytes',
    'page_memory_after_files_ready_bytes',
    'page_memory_after_render_ready_bytes',
    'page_memory_after_render_settled_bytes',
    'page_memory_peak_bytes',
    'page_memory_supported',
    'storage_after_render_settled_usage_bytes',
    'storage_after_render_settled_indexeddb_bytes',
    'storage_after_render_settled_caches_bytes',
    'storage_usage_delta_bytes',
    'storage_indexeddb_delta_bytes',
    'storage_caches_delta_bytes',
    'storage_supported',
    'chrome_process_peak_rss_bytes',
    'renderer_process_peak_rss_bytes',
    'renderer_single_peak_rss_bytes',
    'browser_process_peak_rss_bytes',
    'gpu_process_peak_rss_bytes',
    'utility_process_peak_rss_bytes',
    'process_memory_supported',
    'process_memory_sample_count',
    'result_path',
  ];

  const rows = results.map((entry) => {
    const report = entry.report;
    const heapMemorySupported = (report.heapSnapshots || []).some((snapshot) => snapshot.supported);
    const pageMemorySupported = (report.pageMemorySnapshots || []).some((snapshot) => snapshot.supported);
    const processMemorySupported = Boolean(report.processMemory && report.processMemory.supported);
    const storageSupported = (report.storageSnapshots || []).some((snapshot) => snapshot.supported);

    return [
      report.dataset,
      report.expected.nodeCount,
      report.expected.edgeCount,
      report.expected.threshold,
      report.status ?? 'pass',
      report.failure && report.failure.reason ? report.failure.reason : '',
      report.timingsMs.pageReadyMs ?? '',
      report.timingsMs.uploadSelectMs ?? '',
      report.timingsMs.fileRowsReadyMs ?? '',
      report.timingsMs.launchToLoadedMs ?? '',
      report.timingsMs.loadedToRenderMs ?? '',
      report.timingsMs.renderSettleMs ?? '',
      report.timingsMs.totalDatasetToRenderMs ?? '',
      report.timingsMs.totalDatasetToSettledMs ?? '',
      report.counters.domNodes ?? '',
      report.counters.domVisibleLinks ?? '',
      report.counters.sessionNodes ?? '',
      report.counters.sessionLinks ?? '',
      report.counters.cytoscapeNodes ?? '',
      report.counters.cytoscapeEdges ?? '',
      getHeapValue(report, 'after-page-ready') ?? '',
      getHeapValue(report, 'after-files-ready') ?? '',
      getHeapValue(report, 'after-render-ready') ?? '',
      getHeapValue(report, 'after-render-settled') ?? '',
      getPeakHeap(report) ?? '',
      heapMemorySupported,
      getPageMemoryValue(report, 'after-page-ready') ?? '',
      getPageMemoryValue(report, 'after-files-ready') ?? '',
      getPageMemoryValue(report, 'after-render-ready') ?? '',
      getPageMemoryValue(report, 'after-render-settled') ?? '',
      getPeakPageMemory(report) ?? '',
      pageMemorySupported,
      getStorageSnapshotValue(report, 'after-render-settled', 'usageBytes')
        ?? getStorageSnapshotValue(report, 'after-render-ready', 'usageBytes')
        ?? getStorageSnapshotValue(report, 'after-files-ready', 'usageBytes')
        ?? '',
      getStorageSnapshotValue(report, 'after-render-settled', 'indexedDbBytes')
        ?? getStorageSnapshotValue(report, 'after-render-ready', 'indexedDbBytes')
        ?? getStorageSnapshotValue(report, 'after-files-ready', 'indexedDbBytes')
        ?? '',
      getStorageSnapshotValue(report, 'after-render-settled', 'cachesBytes')
        ?? getStorageSnapshotValue(report, 'after-render-ready', 'cachesBytes')
        ?? getStorageSnapshotValue(report, 'after-files-ready', 'cachesBytes')
        ?? '',
      getStorageDelta(report, 'usageBytes') ?? '',
      getStorageDelta(report, 'indexedDbBytes') ?? '',
      getStorageDelta(report, 'cachesBytes') ?? '',
      storageSupported,
      getProcessMemoryPeak(report, 'peakTotalRssBytes') ?? '',
      getProcessMemoryPeak(report, 'peakRendererRssBytes') ?? '',
      getProcessMemoryPeak(report, 'peakSingleRendererRssBytes') ?? '',
      getProcessMemoryPeak(report, 'peakBrowserRssBytes') ?? '',
      getProcessMemoryPeak(report, 'peakGpuRssBytes') ?? '',
      getProcessMemoryPeak(report, 'peakUtilityRssBytes') ?? '',
      processMemorySupported,
      report.processMemory && report.processMemory.summary
        ? report.processMemory.summary.sampleCount ?? ''
        : '',
      entry.resultPath,
    ].join(',');
  });

  const summaryCsvPath = path.join(outputDir, 'summary.csv');
  fs.writeFileSync(summaryCsvPath, `${header.join(',')}\n${rows.join('\n')}\n`, 'utf8');

  return { summaryJsonPath, summaryCsvPath };
}

function ensureServerReachable(baseUrl) {
  return new Promise((resolve, reject) => {
    const url = new URL(baseUrl);
    const client = url.protocol === 'https:' ? https : http;
    const request = client.request(
      {
        method: 'GET',
        hostname: url.hostname,
        port: url.port,
        path: url.pathname || '/',
        timeout: 5000,
      },
      (response) => {
        response.resume();
        resolve(response.statusCode || 0);
      },
    );

    request.on('timeout', () => {
      request.destroy(new Error(`Timed out connecting to ${baseUrl}`));
    });
    request.on('error', reject);
    request.end();
  });
}

function listProcessIdsForUserDataDir(userDataDir) {
  const result = spawnSync('pgrep', ['-f', userDataDir], { encoding: 'utf8' });
  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    return [];
  }

  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => Number.parseInt(line, 10))
    .filter((value) => Number.isFinite(value));
}

function listChildProcessIds(ppid) {
  const result = spawnSync('pgrep', ['-P', String(ppid)], { encoding: 'utf8' });
  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    return [];
  }

  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => Number.parseInt(line, 10))
    .filter((value) => Number.isFinite(value));
}

function parseProcessType(argsText) {
  const match = argsText.match(/(?:^|\s)--type=([^\s]+)/);
  return match ? match[1] : 'browser';
}

function listChromeRunProcesses(userDataDir) {
  const rootPids = listProcessIdsForUserDataDir(userDataDir);
  const discoveredPids = new Set(rootPids);
  const queue = [...rootPids];

  while (queue.length) {
    const currentPid = queue.shift();
    const childPids = listChildProcessIds(currentPid);
    for (const childPid of childPids) {
      if (discoveredPids.has(childPid)) {
        continue;
      }
      discoveredPids.add(childPid);
      queue.push(childPid);
    }
  }

  const pids = [...discoveredPids];
  const processes = [];

  for (const pid of pids) {
    const result = spawnSync(
      'ps',
      ['-o', 'pid=', '-o', 'ppid=', '-o', 'rss=', '-o', 'args=', '-p', String(pid)],
      { encoding: 'utf8' },
    );

    if (result.error) {
      throw result.error;
    }

    if (result.status !== 0) {
      continue;
    }

    const line = result.stdout
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .find(Boolean);

    if (!line) {
      continue;
    }

    const match = line.match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/);
    if (!match) {
      continue;
    }

    const argsText = match[4];
    processes.push({
      pid: Number.parseInt(match[1], 10),
      ppid: Number.parseInt(match[2], 10),
      rssBytes: Number.parseInt(match[3], 10) * 1024,
      args: argsText,
      processType: parseProcessType(argsText),
    });
  }

  return processes;
}

function captureProcessMemorySample(userDataDir, startedAtMs) {
  const processes = listChromeRunProcesses(userDataDir);
  const renderers = processes.filter((entry) => entry.processType === 'renderer');
  const browserProcesses = processes.filter((entry) => entry.processType === 'browser');
  const gpuProcesses = processes.filter((entry) => entry.processType === 'gpu-process');
  const utilityProcesses = processes.filter((entry) => entry.processType === 'utility');

  return {
    sampleTimeMs: Date.now() - startedAtMs,
    processCount: processes.length,
    rendererProcessCount: renderers.length,
    totalRssBytes: processes.reduce((sum, entry) => sum + entry.rssBytes, 0),
    rendererRssBytes: renderers.reduce((sum, entry) => sum + entry.rssBytes, 0),
    maxRendererRssBytes: renderers.reduce((max, entry) => Math.max(max, entry.rssBytes), 0),
    browserRssBytes: browserProcesses.reduce((sum, entry) => sum + entry.rssBytes, 0),
    gpuRssBytes: gpuProcesses.reduce((sum, entry) => sum + entry.rssBytes, 0),
    utilityRssBytes: utilityProcesses.reduce((sum, entry) => sum + entry.rssBytes, 0),
  };
}

function peakValue(samples, key) {
  const values = samples
    .map((entry) => entry[key])
    .filter((value) => Number.isFinite(value));

  if (!values.length) {
    return null;
  }

  return Math.max(...values);
}

function startProcessMemorySampler(userDataDir, sampleIntervalMs) {
  const startedAtMs = Date.now();
  const samples = [];
  const errors = [];

  const sample = () => {
    try {
      samples.push(captureProcessMemorySample(userDataDir, startedAtMs));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  };

  sample();
  const timer = setInterval(sample, sampleIntervalMs);
  if (typeof timer.unref === 'function') {
    timer.unref();
  }

  return {
    stop() {
      clearInterval(timer);
      sample();

      return {
        supported: errors.length === 0,
        userDataDir,
        sampleIntervalMs,
        summary: {
          sampleCount: samples.length,
          matchedSampleCount: samples.filter((entry) => entry.processCount > 0).length,
          peakTotalRssBytes: peakValue(samples, 'totalRssBytes'),
          peakRendererRssBytes: peakValue(samples, 'rendererRssBytes'),
          peakSingleRendererRssBytes: peakValue(samples, 'maxRendererRssBytes'),
          peakBrowserRssBytes: peakValue(samples, 'browserRssBytes'),
          peakGpuRssBytes: peakValue(samples, 'gpuRssBytes'),
          peakUtilityRssBytes: peakValue(samples, 'utilityRssBytes'),
        },
        samples,
        errors,
      };
    },
  };
}

function runChildProcess(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, options);
    child.on('error', reject);
    child.on('exit', (status, signal) => resolve({ status, signal }));
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const manifestPath = path.resolve(ROOT_DIR, args.manifest || DEFAULT_MANIFEST);
  const outputDir = path.resolve(ROOT_DIR, args['output-dir'] || DEFAULT_OUTPUT_DIR);
  const baseUrl = args['base-url'] || DEFAULT_BASE_URL;
  const browser = args.browser || DEFAULT_BROWSER;
  const spec = args.spec || DEFAULT_SPEC;
  const settleMs = parseInteger(args['settle-ms'] || String(DEFAULT_SETTLE_MS), 'settle-ms');
  const timeoutMs = parseInteger(args['timeout-ms'] || String(DEFAULT_TIMEOUT_MS), 'timeout-ms');
  const processSampleMs = parseInteger(
    args['process-sample-ms'] || String(DEFAULT_PROCESS_SAMPLE_MS),
    'process-sample-ms',
  );
  const requestedDatasets = args.dataset
    ? new Set(String(args.dataset).split(',').map((item) => item.trim()).filter(Boolean))
    : null;

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest not found: ${manifestPath}`);
  }

  await ensureServerReachable(baseUrl);

  const manifestRows = parseCsv(fs.readFileSync(manifestPath, 'utf8'));
  const selectedRows = manifestRows.filter((row) => (
    !requestedDatasets || requestedDatasets.has(row.dataset)
  ));

  if (!selectedRows.length) {
    throw new Error(`No datasets selected from manifest: ${manifestPath}`);
  }

  fs.mkdirSync(outputDir, { recursive: true });

  const manifestDir = path.dirname(manifestPath);
  const chromeProfilesDir = path.join(outputDir, '.chrome-user-data');
  fs.mkdirSync(chromeProfilesDir, { recursive: true });

  const results = [];
  let hadFailures = false;

  for (const row of selectedRows) {
    const nodePath = path.resolve(manifestDir, row.node_file);
    const linkPath = path.resolve(manifestDir, row.link_file);
    const resultPath = path.join(outputDir, `${sanitizeDatasetName(row.dataset)}.json`);
    const threshold = resolveThreshold(row, args);
    const chromeUserDataDir = path.join(chromeProfilesDir, sanitizeDatasetName(row.dataset));

    fs.rmSync(chromeUserDataDir, { recursive: true, force: true });
    fs.mkdirSync(chromeUserDataDir, { recursive: true });

    console.log([
      '',
      `Running ${row.dataset}`,
      `  nodes: ${Number(row.node_count).toLocaleString()}`,
      `  edges: ${Number(row.edge_count).toLocaleString()}`,
      `  threshold: ${threshold}`,
      `  node file: ${nodePath}`,
      `  link file: ${linkPath}`,
    ].join('\n'));

    const childEnv = {
      ...process.env,
      CYPRESS_benchmarkDataset: row.dataset,
      CYPRESS_benchmarkNodeFile: nodePath,
      CYPRESS_benchmarkLinkFile: linkPath,
      CYPRESS_benchmarkResultsPath: resultPath,
      CYPRESS_benchmarkThreshold: String(threshold),
      CYPRESS_benchmarkExpectedNodes: String(row.node_count),
      CYPRESS_benchmarkExpectedLinks: String(row.edge_count),
      CYPRESS_benchmarkSettleMs: String(settleMs),
      CYPRESS_benchmarkTimeoutMs: String(timeoutMs),
      CYPRESS_benchmarkChromeUserDataDir: chromeUserDataDir,
    };

    const cypressArgs = [
      'cypress',
      'run',
      args.headed ? '--headed' : '--headless',
      '--browser',
      browser,
      '--config',
      `baseUrl=${baseUrl}`,
      '--spec',
      spec,
    ];

    const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const sampler = startProcessMemorySampler(chromeUserDataDir, processSampleMs);
    const result = await runChildProcess(command, cypressArgs, {
      cwd: ROOT_DIR,
      env: childEnv,
      stdio: 'inherit',
    });
    const processMemory = sampler.stop();

    let report;
    if (result.status !== 0) {
      hadFailures = true;
      report = fs.existsSync(resultPath)
        ? JSON.parse(fs.readFileSync(resultPath, 'utf8'))
        : {
            dataset: row.dataset,
            generatedAt: new Date().toISOString(),
            browser: {
              name: browser,
              channel: 'unknown',
              isHeaded: Boolean(args.headed),
              userAgent: null,
            },
            files: {
              nodePath,
              linkPath,
              nodeFile: path.basename(nodePath),
              linkFile: path.basename(linkPath),
            },
            expected: {
              nodeCount: Number(row.node_count),
              edgeCount: Number(row.edge_count),
              threshold,
              settleMs,
              timeoutMs,
            },
            navigationTiming: {},
            timingsMs: {},
            counters: {},
            heapSnapshots: [],
            pageMemorySnapshots: [],
            storageSnapshots: [],
          };
      report.processMemory = processMemory;
      report.status = 'failed';
      report.failure = {
        reason: `cypress exit ${result.status}${result.signal ? ` (${result.signal})` : ''}`,
      };
      fs.writeFileSync(resultPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
      results.push({ dataset: row.dataset, resultPath, report });

      console.error([
        `Failed ${row.dataset}`,
        `  reason: ${report.failure.reason}`,
        `  renderer RSS peak: ${getProcessMemoryPeak(report, 'peakRendererRssBytes') ?? 'n/a'} bytes`,
        `  chrome run RSS peak: ${getProcessMemoryPeak(report, 'peakTotalRssBytes') ?? 'n/a'} bytes`,
      ].join('\n'));
      continue;
    }

    report = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
    report.processMemory = processMemory;
    report.status = 'pass';
    fs.writeFileSync(resultPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    results.push({ dataset: row.dataset, resultPath, report });

    console.log([
      `Completed ${row.dataset}`,
      `  file rows ready: ${report.timingsMs.fileRowsReadyMs ?? 'n/a'}ms`,
      `  launch to loaded: ${report.timingsMs.launchToLoadedMs ?? 'n/a'}ms`,
      `  loaded to render: ${report.timingsMs.loadedToRenderMs ?? 'n/a'}ms`,
      `  total to settled: ${report.timingsMs.totalDatasetToSettledMs ?? 'n/a'}ms`,
      `  heap peak: ${getPeakHeap(report) ?? 'n/a'} bytes`,
      `  page memory peak: ${getPeakPageMemory(report) ?? 'n/a'} bytes`,
      `  renderer RSS peak: ${getProcessMemoryPeak(report, 'peakRendererRssBytes') ?? 'n/a'} bytes`,
      `  chrome run RSS peak: ${getProcessMemoryPeak(report, 'peakTotalRssBytes') ?? 'n/a'} bytes`,
    ].join('\n'));
  }

  const { summaryJsonPath, summaryCsvPath } = writeSummaryFiles(outputDir, results);

  console.log([
    '',
    `Benchmark summary JSON: ${summaryJsonPath}`,
    `Benchmark summary CSV: ${summaryCsvPath}`,
  ].join('\n'));

  if (hadFailures) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
