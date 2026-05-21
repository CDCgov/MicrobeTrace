#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const yaml = require('js-yaml');
const patristic = require('patristic');

const repoRoot = path.join(__dirname, '..');
const defaultPreset = path.join(
  __dirname,
  'performance-fixtures',
  'realistic',
  'presets',
  'pathogen-musse-500.yaml'
);
const rScriptPath = path.join(__dirname, 'simulate-musse-tree.R');

function parseArgs(argv) {
  const options = {
    preset: defaultPreset,
    dryRun: false,
    keepTemp: false,
  };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--keep-temp') {
      options.keepTemp = true;
    } else if (arg === '--preset') {
      options.preset = path.resolve(argv[++index]);
    } else if (arg.startsWith('--preset=')) {
      options.preset = path.resolve(arg.slice('--preset='.length));
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/generate-realistic-performance-fixtures.js [options]

Options:
  --preset <path>  YAML preset to generate. Defaults to pathogen-musse-500.yaml.
  --dry-run        Validate the preset and print commands without running R/IQ-TREE.
  --keep-temp      Keep temporary command/config files after generation.
`);
}

function readPreset(presetPath) {
  if (!fs.existsSync(presetPath)) {
    throw new Error(`Preset not found: ${path.relative(repoRoot, presetPath)}`);
  }
  const preset = yaml.load(fs.readFileSync(presetPath, 'utf8'));
  if (!preset || typeof preset !== 'object') {
    throw new Error('Preset YAML must contain an object.');
  }
  return preset;
}

function ensureObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
}

function ensureString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string.`);
  }
}

function ensureNumber(value, label, { integer = false, min = 0 } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min) {
    throw new Error(`${label} must be a finite number >= ${min}.`);
  }
  if (integer && !Number.isInteger(value)) {
    throw new Error(`${label} must be an integer.`);
  }
}

function ensureNumberArray(value, label, length) {
  if (!Array.isArray(value) || value.length !== length) {
    throw new Error(`${label} must contain ${length} numbers.`);
  }
  value.forEach((entry, index) => ensureNumber(entry, `${label}[${index}]`, { min: 0 }));
}

function ensureThresholdArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a non-empty number array.`);
  }
  value.forEach((entry, index) => ensureNumber(entry, `${label}[${index}]`, { min: 0 }));
}

function ensureBoolean(value, label) {
  if (typeof value !== 'boolean') {
    throw new Error(`${label} must be a boolean.`);
  }
}

function ensureStringArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a non-empty string array.`);
  }
  value.forEach((entry, index) => ensureString(entry, `${label}[${index}]`));
}

function validatePreset(preset) {
  ensureNumber(preset.version, 'version', { integer: true, min: 1 });
  ensureString(preset.id, 'id');
  ensureNumber(preset.seed, 'seed', { integer: true, min: 1 });
  ensureNumber(preset.taxa, 'taxa', { integer: true, min: 2 });
  ensureNumber(preset.maxAttempts ?? 50, 'maxAttempts', { integer: true, min: 1 });

  ensureObject(preset.output, 'output');
  ensureString(preset.output.directory, 'output.directory');
  ensureString(preset.output.basename, 'output.basename');
  ensureString(preset.output.tipPrefix, 'output.tipPrefix');

  ensureObject(preset.traits, 'traits');
  ensureString(preset.traits.name, 'traits.name');
  if (!Array.isArray(preset.traits.states) || preset.traits.states.length < 2) {
    throw new Error('traits.states must contain at least two states.');
  }
  preset.traits.states.forEach((state, index) => ensureString(state, `traits.states[${index}]`));
  ensureString(preset.traits.initialState, 'traits.initialState');
  if (!preset.traits.states.includes(preset.traits.initialState)) {
    throw new Error('traits.initialState must match one of traits.states.');
  }

  ensureObject(preset.musse, 'musse');
  ensureNumberArray(preset.musse.birthRates, 'musse.birthRates', preset.traits.states.length);
  ensureNumberArray(preset.musse.extinctionRates, 'musse.extinctionRates', preset.traits.states.length);
  ensureObject(preset.musse.transitionRates, 'musse.transitionRates');
  preset.traits.states.forEach((source) => {
    ensureObject(preset.musse.transitionRates[source], `musse.transitionRates.${source}`);
    preset.traits.states.forEach((target) => {
      if (source === target) return;
      ensureNumber(
        preset.musse.transitionRates[source][target],
        `musse.transitionRates.${source}.${target}`,
        { min: 0 }
      );
    });
  });

  ensureObject(preset.alignment, 'alignment');
  if (preset.alignment.simulator !== 'alisim') {
    throw new Error('alignment.simulator must be "alisim" for v1.');
  }
  ensureString(preset.alignment.model, 'alignment.model');
  ensureNumber(preset.alignment.length, 'alignment.length', { integer: true, min: 1 });
  ensureNumber(preset.alignment.treeScale ?? 1, 'alignment.treeScale', { min: Number.EPSILON });
  if ((preset.alignment.outputFormat || 'fasta') !== 'fasta') {
    throw new Error('alignment.outputFormat must be "fasta" for MicrobeTrace performance fixtures.');
  }

  ensureObject(preset.microbetrace, 'microbetrace');
  ensureObject(preset.microbetrace.thresholds, 'microbetrace.thresholds');
  ensureThresholdArray(preset.microbetrace.thresholds.snp, 'microbetrace.thresholds.snp');
  ensureThresholdArray(preset.microbetrace.thresholds.patristic, 'microbetrace.thresholds.patristic');

  if (preset.validation !== undefined) {
    ensureObject(preset.validation, 'validation');

    if (preset.validation.linkCounts !== undefined) {
      ensureObject(preset.validation.linkCounts, 'validation.linkCounts');
      ensureBoolean(preset.validation.linkCounts.enabled, 'validation.linkCounts.enabled');
      ensureBoolean(
        preset.validation.linkCounts.hardFailOnMismatch,
        'validation.linkCounts.hardFailOnMismatch'
      );
    }

    if (preset.validation.newickParity !== undefined) {
      ensureObject(preset.validation.newickParity, 'validation.newickParity');
      ensureBoolean(preset.validation.newickParity.enabled, 'validation.newickParity.enabled');
      ensureBoolean(
        preset.validation.newickParity.hardFailOnMismatch,
        'validation.newickParity.hardFailOnMismatch'
      );
      ensureNumber(preset.validation.newickParity.tolerance, 'validation.newickParity.tolerance', { min: 0 });
      ensureStringArray(preset.validation.newickParity.compare, 'validation.newickParity.compare');
    }

    if (preset.validation.treeComparison !== undefined) {
      ensureObject(preset.validation.treeComparison, 'validation.treeComparison');
      ensureBoolean(preset.validation.treeComparison.enabled, 'validation.treeComparison.enabled');
      ensureStringArray(
        preset.validation.treeComparison.hardFailures,
        'validation.treeComparison.hardFailures'
      );
      ensureStringArray(
        preset.validation.treeComparison.reportOnlyMetrics,
        'validation.treeComparison.reportOnlyMetrics'
      );
    }
  }
}

function resolveOutputPaths(preset) {
  const outputDir = path.resolve(repoRoot, preset.output.directory);
  const basename = preset.output.basename;
  return {
    outputDir,
    newick: path.join(outputDir, `${basename}.nwk`),
    fasta: path.join(outputDir, `${basename}.fasta`),
    metadata: path.join(outputDir, `${basename}-nodes.csv`),
    summary: path.join(outputDir, `${basename}-summary.json`),
  };
}

function executableNames(command) {
  return process.platform === 'win32' ? [command, `${command}.exe`, `${command}.cmd`, `${command}.bat`] : [command];
}

function findCommand(command) {
  const pathValue = process.env.PATH || '';
  const dirs = pathValue.split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    for (const name of executableNames(command)) {
      const candidate = path.join(dir, name);
      try {
        fs.accessSync(candidate, fs.constants.X_OK);
        return candidate;
      } catch {
        // Continue searching PATH.
      }
    }
  }
  return null;
}

function testAliSimCommand(commandPath) {
  const prefix = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mt-alisim-smoke-')), 'smoke');
  try {
    const result = spawnSync(commandPath, [
      '--alisim',
      prefix,
      '-m',
      'JC',
      '-t',
      'RANDOM{yh,4}',
      '--length',
      '12',
      '--out-format',
      'fasta',
      '-seed',
      '1',
      '-redo',
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return !result.error && result.status === 0 && fs.existsSync(`${prefix}.fa`);
  } finally {
    fs.rmSync(path.dirname(prefix), { recursive: true, force: true });
  }
}

function discoverTools({ validateAliSim = false } = {}) {
  const rscript = findCommand('Rscript');
  const iqtreeCandidates = ['iqtree3', 'iqtree2', 'iqtree']
    .map((name) => ({ name, path: findCommand(name) }))
    .filter((candidate) => candidate.path);
  const iqtree = validateAliSim
    ? iqtreeCandidates.find((candidate) => testAliSimCommand(candidate.path))
    : iqtreeCandidates[0];
  return {
    rscript: rscript ? { name: 'Rscript', path: rscript } : null,
    iqtree: iqtree || null,
  };
}

function shellQuote(value) {
  const text = String(value);
  if (/^[a-zA-Z0-9_./:=+-]+$/.test(text)) return text;
  return `'${text.replace(/'/g, "'\\''")}'`;
}

function commandText(command, args) {
  return [command, ...args].map(shellQuote).join(' ');
}

function runCommand(command, args, label) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'inherit',
  });
  if (result.error) {
    throw new Error(`${label} failed to start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`${label} exited with status ${result.status}.`);
  }
}

function captureVersion(command, argSets) {
  for (const args of argSets) {
    const result = spawnSync(command, args, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (!result.error && result.status === 0) {
      return `${result.stdout || result.stderr}`.trim();
    }
  }
  return null;
}

function buildRConfig(preset, outputs, treeInfoPath) {
  return {
    ...preset,
    output: {
      ...preset.output,
      newickPath: outputs.newick,
      metadataPath: outputs.metadata,
      treeInfoPath,
    },
  };
}

function findAliSimFasta(prefix) {
  const dir = path.dirname(prefix);
  const base = path.basename(prefix);
  const candidates = [
    `${prefix}.fa`,
    `${prefix}.fasta`,
    `${prefix}.fas`,
    `${prefix}.phy`,
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (found) return found;

  const produced = fs.readdirSync(dir)
    .filter((fileName) => fileName.startsWith(base))
    .map((fileName) => path.join(dir, fileName));
  const producedFasta = produced.find((fileName) => /\.(fa|fas|fasta)$/i.test(fileName));
  if (producedFasta) return producedFasta;

  throw new Error(`AliSim did not produce a FASTA output for prefix ${prefix}. Produced: ${produced.join(', ') || 'none'}`);
}

function parseFasta(filePath) {
  const records = [];
  let current = null;
  fs.readFileSync(filePath, 'utf8').split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (trimmed.startsWith('>')) {
      current = {
        id: trimmed.slice(1).trim().split(/\s+/)[0],
        sequence: '',
      };
      records.push(current);
    } else if (current) {
      current.sequence += trimmed.toUpperCase();
    }
  });
  if (records.length === 0) {
    throw new Error(`No FASTA records found in ${filePath}`);
  }
  return records;
}

function countSnps(a, b) {
  const limit = Math.min(a.length, b.length);
  let count = 0;
  for (let index = 0; index < limit; index++) {
    if (a[index] !== b[index]) count++;
  }
  return count + Math.abs(a.length - b.length);
}

function countPairLinks(records, thresholds, distanceFn) {
  const counts = Object.fromEntries(thresholds.map((threshold) => [String(threshold), 0]));
  for (let i = 0; i < records.length; i++) {
    for (let j = 0; j < i; j++) {
      const distance = distanceFn(records[i], records[j]);
      thresholds.forEach((threshold) => {
        if (distance <= threshold) counts[String(threshold)]++;
      });
    }
  }
  return counts;
}

function parseCsvRows(filePath) {
  const text = fs.readFileSync(filePath, 'utf8').trim();
  if (!text) return [];
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        index++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }
  row.push(field);
  rows.push(row);

  const [header, ...body] = rows;
  return body.map((values) => Object.fromEntries(header.map((key, index) => [key, values[index] || ''])));
}

function collectLeafPaths(newickPath) {
  const tree = patristic.parseNewick(fs.readFileSync(newickPath, 'utf8'));
  const leaves = [];

  function visit(node, pathEntries, distance) {
    const currentPath = pathEntries.concat({ node, distance });
    const children = node.children || [];
    if (children.length === 0) {
      leaves.push({
        id: node.id,
        distance,
        path: currentPath,
      });
      return;
    }
    children.forEach((child) => visit(child, currentPath, distance + Number(child.length || 0)));
  }

  visit(tree, [], Number(tree.length || 0));
  return leaves;
}

function patristicDistance(a, b) {
  const limit = Math.min(a.path.length, b.path.length);
  let lcaDistance = 0;
  for (let index = 0; index < limit; index++) {
    if (a.path[index].node !== b.path[index].node) break;
    lcaDistance = a.path[index].distance;
  }
  return a.distance + b.distance - (2 * lcaDistance);
}

function summarizeOutputs(preset, outputs, treeInfo, tools, commands, versions) {
  const fastaRecords = parseFasta(outputs.fasta);
  const metadataRows = parseCsvRows(outputs.metadata);
  const leaves = collectLeafPaths(outputs.newick);
  const snpThresholds = preset.microbetrace.thresholds.snp;
  const patristicThresholds = preset.microbetrace.thresholds.patristic;
  const stateDistribution = {};

  metadataRows.forEach((row) => {
    const state = row[preset.traits.name] || row.location || '(empty)';
    stateDistribution[state] = (stateDistribution[state] || 0) + 1;
  });

  const sequenceLengths = fastaRecords.map((record) => record.sequence.length);
  const totalPairs = (fastaRecords.length * (fastaRecords.length - 1)) / 2;

  return {
    version: 1,
    id: preset.id,
    generatedAt: new Date().toISOString(),
    generator: 'scripts/generate-realistic-performance-fixtures.js',
    preset,
    validation: preset.validation || null,
    tools: {
      node: process.version,
      rscript: {
        path: tools.rscript.path,
        version: versions.rscript,
      },
      iqtree: {
        name: tools.iqtree.name,
        path: tools.iqtree.path,
        version: versions.iqtree,
      },
    },
    commands,
    outputs: {
      fasta: path.relative(path.join(repoRoot, 'cypress', 'fixtures'), outputs.fasta).replace(/\\/g, '/'),
      newick: path.relative(path.join(repoRoot, 'cypress', 'fixtures'), outputs.newick).replace(/\\/g, '/'),
      nodeMetadata: path.relative(path.join(repoRoot, 'cypress', 'fixtures'), outputs.metadata).replace(/\\/g, '/'),
      summary: path.relative(path.join(repoRoot, 'cypress', 'fixtures'), outputs.summary).replace(/\\/g, '/'),
    },
    tree: treeInfo,
    counts: {
      nodes: metadataRows.length,
      sequences: fastaRecords.length,
      leaves: leaves.length,
      totalPairs,
      sequenceLength: {
        min: Math.min(...sequenceLengths),
        max: Math.max(...sequenceLengths),
      },
      stateDistribution,
      snp: {
        thresholds: snpThresholds,
        visibleLinksByThreshold: countPairLinks(
          fastaRecords,
          snpThresholds,
          (a, b) => countSnps(a.sequence, b.sequence)
        ),
      },
      patristic: {
        thresholds: patristicThresholds,
        visibleLinksByThreshold: countPairLinks(leaves, patristicThresholds, patristicDistance),
      },
    },
    cypress: {
      snpThreshold: snpThresholds[0],
      patristicThreshold: patristicThresholds[0],
      timeoutMs: 300000,
    },
  };
}

function assertToolsAvailable(tools) {
  const missing = [];
  if (!tools.rscript) missing.push('Rscript');
  if (!tools.iqtree) missing.push('iqtree3, iqtree2, or iqtree');
  if (missing.length > 0) {
    throw new Error(
      `Missing required host tool(s): ${missing.join('; ')}. Install them before running the real generator, or use --dry-run to validate the preset.`
    );
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const presetPath = path.resolve(options.preset);
  const preset = readPreset(presetPath);
  validatePreset(preset);

  const outputs = resolveOutputPaths(preset);
  const tools = discoverTools({ validateAliSim: !options.dryRun });
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-realistic-fixture-'));
  const rConfigPath = path.join(tempDir, `${preset.id}-r-config.json`);
  const treeInfoPath = path.join(tempDir, `${preset.id}-tree-info.json`);
  const alisimPrefix = path.join(tempDir, `${preset.id}-alignment`);
  const rArgs = [rScriptPath, rConfigPath];
  const iqArgs = [
    '--alisim',
    alisimPrefix,
    '-m',
    preset.alignment.model,
    '-t',
    outputs.newick,
    '--length',
    String(preset.alignment.length),
    '--out-format',
    'fasta',
    '--keep-seq-order',
    '-seed',
    String(preset.seed),
  ];

  const dryRunPayload = {
    preset: path.relative(repoRoot, presetPath),
    validation: preset.validation || null,
    outputs: Object.fromEntries(Object.entries(outputs).map(([key, value]) => [key, path.relative(repoRoot, value)])),
    tools: {
      rscript: tools.rscript || { missing: true, name: 'Rscript' },
      iqtree: tools.iqtree || { missing: true, names: ['iqtree3', 'iqtree2', 'iqtree'] },
    },
    commands: {
      rscript: commandText(tools.rscript?.path || 'Rscript', rArgs),
      iqtree: commandText(tools.iqtree?.path || 'iqtree3', iqArgs),
    },
  };

  if (options.dryRun) {
    console.log(JSON.stringify(dryRunPayload, null, 2));
    fs.rmSync(tempDir, { recursive: true, force: true });
    return;
  }

  try {
    assertToolsAvailable(tools);
    fs.mkdirSync(outputs.outputDir, { recursive: true });
    fs.writeFileSync(rConfigPath, `${JSON.stringify(buildRConfig(preset, outputs, treeInfoPath), null, 2)}\n`, 'utf8');

    const commands = {
      rscript: commandText(tools.rscript.path, rArgs),
      iqtree: commandText(tools.iqtree.path, iqArgs),
    };

    runCommand(tools.rscript.path, rArgs, 'MuSSE tree simulation');
    runCommand(tools.iqtree.path, iqArgs, 'AliSim alignment simulation');

    const alisimFasta = findAliSimFasta(alisimPrefix);
    fs.copyFileSync(alisimFasta, outputs.fasta);

    const versions = {
      rscript: captureVersion(tools.rscript.path, [['--version']]),
      iqtree: captureVersion(tools.iqtree.path, [['--version'], ['-version'], ['-h']]),
    };
    const treeInfo = JSON.parse(fs.readFileSync(treeInfoPath, 'utf8'));
    const summary = summarizeOutputs(preset, outputs, treeInfo, tools, commands, versions);
    fs.writeFileSync(outputs.summary, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

    console.log(`Generated realistic performance fixture: ${path.relative(repoRoot, outputs.summary)}`);
  } finally {
    if (options.keepTemp) {
      console.log(`Kept temporary directory: ${tempDir}`);
    } else {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
