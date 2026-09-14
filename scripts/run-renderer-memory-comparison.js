#!/usr/bin/env node

const { spawnSync } = require('child_process');
const path = require('path');

const repositoryRoot = path.resolve(__dirname, '..');
const cypressCli = path.join(repositoryRoot, 'node_modules', 'cypress', 'bin', 'cypress');

function parseArguments(argv) {
  const options = {
    browser: 'chrome',
    samples: 5,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];
    if (argument === '--browser' && value) {
      options.browser = value;
      index += 1;
    } else if (argument === '--samples' && value) {
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 20) {
        throw new Error(`Invalid --samples value: ${value}`);
      }
      options.samples = parsed;
      index += 1;
    } else if (argument === '--help' || argument === '-h') {
      console.log('Usage: node scripts/run-renderer-memory-comparison.js [--browser chrome|edge] [--samples 1-20]');
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  return options;
}

function runRenderer(browser, renderer, sampleIndex, sampleCount) {
  console.log(
    `Memory sample ${sampleIndex + 1}/${sampleCount}: ${renderer} in a fresh ${browser} process (heap + full process tree + GPU)`,
  );
  const result = spawnSync(process.execPath, [
    cypressCli,
    'run',
    '--headless',
    '--browser',
    browser,
    '--config',
    'baseUrl=http://127.0.0.1:4210,trashAssetsBeforeRuns=false',
    '--env',
    `perfMode=1,rendererFeatureScale=1,rendererMemory=1,rendererSamples=1,rendererMode=${renderer}`,
    '--spec',
    'cypress/e2e/performance/renderer-feature-scale.perf.cy.ts',
  ], {
    cwd: repositoryRoot,
    env: process.env,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    const detail = result.error ? `: ${result.error.message}` : '';
    throw new Error(
      `${renderer} memory sample ${sampleIndex + 1} failed with exit code ${result.status}${detail}`,
    );
  }
}

function main() {
  const options = parseArguments(process.argv);
  const renderers = ['cytoscape-webgl', 'sigma'];
  for (let sampleIndex = 0; sampleIndex < options.samples; sampleIndex += 1) {
    const orderedRenderers = sampleIndex % 2 === 0 ? renderers : [...renderers].reverse();
    orderedRenderers.forEach(renderer => (
      runRenderer(options.browser, renderer, sampleIndex, options.samples)
    ));
  }
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
