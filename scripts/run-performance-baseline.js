#!/usr/bin/env node

const { spawnSync } = require('child_process');
const path = require('path');

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const nodeCommand = process.execPath;

function parseArgs(argv) {
  const args = {
    runs: 5,
    large: false,
    largeOnly: false,
    stress: false,
    stressOnly: false,
    real: false,
    realOnly: false,
    summary: true,
    minSamples: 5,
    dryRun: false,
  };

  for (let index = 2; index < argv.length; index++) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === '--runs' && next) {
      const parsed = Number(next);
      if (Number.isInteger(parsed) && parsed >= 0) {
        args.runs = parsed;
      } else {
        throw new Error(`Invalid --runs value: ${next}`);
      }
      index++;
    } else if (arg === '--large') {
      args.large = true;
    } else if (arg === '--large-only') {
      args.large = true;
      args.largeOnly = true;
    } else if (arg === '--stress') {
      args.stress = true;
    } else if (arg === '--stress-only') {
      args.stress = true;
      args.stressOnly = true;
    } else if (arg === '--real') {
      args.real = true;
    } else if (arg === '--real-only') {
      args.real = true;
      args.realOnly = true;
    } else if (arg === '--no-summary') {
      args.summary = false;
    } else if (arg === '--summary-only') {
      args.runs = 0;
      args.summary = true;
    } else if (arg === '--min-samples' && next) {
      const parsed = Number(next);
      if (Number.isInteger(parsed) && parsed > 0) {
        args.minSamples = parsed;
      } else {
        throw new Error(`Invalid --min-samples value: ${next}`);
      }
      index++;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
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
  console.log(`Usage: node scripts/run-performance-baseline.js [options]

Runs repeated Cypress performance baselines, then summarizes recorded artifacts.

Options:
  --runs <n>        Number of repeated runs. Defaults to 5. Use 0 to summarize only.
  --large          Run the opt-in large tier after each average run.
  --large-only     Run only the opt-in large tier.
  --stress         Run the manual-only stress tier after each average run.
  --stress-only    Run only the manual-only stress tier.
  --real           Run configured real-sample scenarios after each average run.
  --real-only      Run only configured real-sample scenarios.
  --summary-only   Do not run Cypress; regenerate the summary from existing artifacts.
  --no-summary     Skip summary generation after runs.
  --min-samples n  Minimum samples before a scenario is marked stable. Defaults to 5.
  --dry-run        Print planned commands without executing them.
`);
}

function runCommand(command, args, options) {
  const printable = [command, ...args].join(' ');
  console.log(`\n$ ${printable}`);

  if (options.dryRun) return;

  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: process.env,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    throw new Error(`Command failed with exit code ${result.status}: ${printable}`);
  }
}

function main() {
  const args = parseArgs(process.argv);
  const cwd = path.resolve(__dirname, '..');
  const plan = [];

  for (let runIndex = 1; runIndex <= args.runs; runIndex++) {
    if (!args.largeOnly && !args.stressOnly && !args.realOnly) {
      plan.push({
        label: `average run ${runIndex}/${args.runs}`,
        npmScript: 'e2e:perf',
      });
    }

    if (args.large) {
      plan.push({
        label: `large run ${runIndex}/${args.runs}`,
        npmScript: 'e2e:perf:large',
      });
    }

    if (args.stress) {
      plan.push({
        label: `stress run ${runIndex}/${args.runs}`,
        npmScript: 'e2e:perf:stress',
      });
    }

    if (args.real) {
      plan.push({
        label: `real-sample run ${runIndex}/${args.runs}`,
        npmScript: 'e2e:perf:real',
      });
    }
  }

  console.log('Performance baseline collection plan:');
  if (plan.length === 0) {
    console.log('- no Cypress runs');
  } else {
    plan.forEach((item) => console.log(`- ${item.label}: npm run ${item.npmScript}`));
  }

  if (args.summary) {
    console.log(`- summarize artifacts with min samples = ${args.minSamples}`);
  }

  plan.forEach((item) => {
    console.log(`\nStarting ${item.label}`);
    runCommand(npmCommand, ['run', item.npmScript], { cwd, dryRun: args.dryRun });
  });

  if (args.summary) {
    runCommand(
      nodeCommand,
      ['scripts/summarize-performance-runs.js', '--min-samples', String(args.minSamples)],
      { cwd, dryRun: args.dryRun }
    );
  }
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
