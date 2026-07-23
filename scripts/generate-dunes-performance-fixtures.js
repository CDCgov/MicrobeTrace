#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const yaml = require('js-yaml');

const repoRoot = path.join(__dirname, '..');
const defaultPreset = path.join(
  __dirname,
  'performance-fixtures',
  'dunes',
  'presets',
  'hiv-like-dunes-500.yaml'
);
const dunesSource = {
  repository: 'https://github.com/dacowan404/dunes',
  branch: 'master',
  release: '0.1.2',
};
const dunesDistributionChoices = ['simple', 'hiv'];
const defaultDunesDistribution = 'simple';

function parseArgs(argv) {
  const options = {
    preset: defaultPreset,
    dryRun: false,
    dunesJar: process.env.DUNES_JAR ? path.resolve(process.env.DUNES_JAR) : null,
  };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--preset') {
      options.preset = path.resolve(argv[++index]);
    } else if (arg.startsWith('--preset=')) {
      options.preset = path.resolve(arg.slice('--preset='.length));
    } else if (arg === '--dunes-jar') {
      options.dunesJar = path.resolve(argv[++index]);
    } else if (arg.startsWith('--dunes-jar=')) {
      options.dunesJar = path.resolve(arg.slice('--dunes-jar='.length));
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
  console.log(`Usage: node scripts/generate-dunes-performance-fixtures.js [options]

Options:
  --preset <path>     YAML preset to generate. Defaults to hiv-like-dunes-500.yaml.
  --dunes-jar <path>  Path to dunes.jar. Can also be provided with DUNES_JAR.
  --dry-run           Validate the preset and print the planned Java command.
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

function ensureStringArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a non-empty string array.`);
  }
  value.forEach((entry, index) => ensureString(entry, `${label}[${index}]`));
}

function ensureStringEnum(value, label, choices) {
  ensureString(value, label);
  const normalized = value.trim().toLowerCase();
  if (!choices.includes(normalized)) {
    throw new Error(`${label} must be one of: ${choices.join(', ')}.`);
  }
}

function ensureThresholdArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a non-empty number array.`);
  }
  value.forEach((entry, index) => ensureNumber(entry, `${label}[${index}]`, { min: 0 }));
}

function getDunesDistribution(preset) {
  return (preset.dunes.distribution || defaultDunesDistribution).trim().toLowerCase();
}

function validatePreset(preset) {
  ensureNumber(preset.version, 'version', { integer: true, min: 1 });
  ensureString(preset.id, 'id');
  ensureNumber(preset.seed, 'seed', { integer: true, min: 1 });

  ensureObject(preset.output, 'output');
  ensureString(preset.output.directory, 'output.directory');
  ensureString(preset.output.basename, 'output.basename');

  ensureObject(preset.reference, 'reference');
  if (preset.reference.fasta !== undefined) {
    ensureString(preset.reference.fasta, 'reference.fasta');
  } else {
    ensureNumber(preset.reference.sequenceCount, 'reference.sequenceCount', { integer: true, min: 1 });
    ensureNumber(preset.reference.sequenceLength, 'reference.sequenceLength', { integer: true, min: 1 });
    ensureString(preset.reference.idPrefix, 'reference.idPrefix');
    ensureNumber(preset.reference.idPad ?? 2, 'reference.idPad', { integer: true, min: 1 });
    ensureNumber(
      preset.reference.lineageSignatureSnps ?? 0,
      'reference.lineageSignatureSnps',
      { integer: true, min: 0 }
    );
  }

  ensureObject(preset.dunes, 'dunes');
  ensureNumber(preset.dunes.mutationRate, 'dunes.mutationRate', { min: 0 });
  ensureNumber(preset.dunes.years, 'dunes.years', { min: 0 });
  ensureNumber(preset.dunes.mutantsPerSequence, 'dunes.mutantsPerSequence', { integer: true, min: 1 });
  if (preset.dunes.distribution !== undefined) {
    ensureStringEnum(preset.dunes.distribution, 'dunes.distribution', dunesDistributionChoices);
  }

  ensureObject(preset.microbetrace, 'microbetrace');
  ensureObject(preset.microbetrace.thresholds, 'microbetrace.thresholds');
  ensureThresholdArray(preset.microbetrace.thresholds.snp, 'microbetrace.thresholds.snp');

  if (preset.metadata !== undefined) {
    ensureObject(preset.metadata, 'metadata');
    if (preset.metadata.locations !== undefined) {
      ensureStringArray(preset.metadata.locations, 'metadata.locations');
    }
    if (preset.metadata.sampleDateStart !== undefined) {
      ensureString(preset.metadata.sampleDateStart, 'metadata.sampleDateStart');
    }
  }

  if (preset.cypress !== undefined) {
    ensureObject(preset.cypress, 'cypress');
    if (preset.cypress.timeoutMs !== undefined) {
      ensureNumber(preset.cypress.timeoutMs, 'cypress.timeoutMs', { integer: true, min: 1 });
    }
  }
}

function resolveOutputPaths(preset) {
  const outputDir = path.resolve(repoRoot, preset.output.directory);
  const basename = preset.output.basename;
  return {
    outputDir,
    referenceFasta: path.join(outputDir, `${basename}-source.fasta`),
    fasta: path.join(outputDir, `${basename}.fasta`),
    metadata: path.join(outputDir, `${basename}-nodes.csv`),
    summary: path.join(outputDir, `${basename}-summary.json`),
  };
}

function executableNames(command) {
  return process.platform === 'win32' ? [command, `${command}.exe`, `${command}.cmd`, `${command}.bat`] : [command];
}

function findCommand(command) {
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
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

function captureVersion(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error || result.status !== 0) return null;
  return `${result.stdout || result.stderr}`.trim();
}

function makeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const DNA_ALPHABET = ['A', 'C', 'G', 'T'];

function nextBase(current, step = 1) {
  const index = DNA_ALPHABET.indexOf(current.toUpperCase());
  if (index === -1) return current;
  return DNA_ALPHABET[(index + step) % DNA_ALPHABET.length];
}

function choosePositions(random, count, sequenceLength, blockedPositions) {
  const positions = [];
  const chosen = new Set(blockedPositions);
  if (sequenceLength - chosen.size < count) {
    throw new Error(`Cannot choose ${count} positions from ${sequenceLength} bases with ${chosen.size} blocked positions.`);
  }
  while (positions.length < count) {
    const position = Math.floor(random() * sequenceLength);
    if (chosen.has(position)) continue;
    chosen.add(position);
    positions.push(position);
  }
  return positions;
}

function wrapSequence(sequence, width = 80) {
  const chunks = [];
  for (let index = 0; index < sequence.length; index += width) {
    chunks.push(sequence.slice(index, index + width));
  }
  return chunks.join('\n');
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

function writeFasta(filePath, records) {
  const lines = [];
  records.forEach((record) => {
    lines.push(`>${record.id}`);
    lines.push(wrapSequence(record.sequence));
  });
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
}

function generateReferenceRecords(preset) {
  const random = makeRandom(preset.seed);
  const reference = preset.reference;
  const locations = preset.metadata?.locations || ['Location A'];
  const sequenceLength = reference.sequenceLength;
  const base = Array.from(
    { length: sequenceLength },
    () => DNA_ALPHABET[Math.floor(random() * DNA_ALPHABET.length)]
  );
  const blockedPositions = new Set();
  const records = [];

  for (let index = 0; index < reference.sequenceCount; index++) {
    const sequence = base.slice();
    const positions = choosePositions(
      random,
      reference.lineageSignatureSnps || 0,
      sequenceLength,
      blockedPositions
    );
    positions.forEach((position, signatureIndex) => {
      blockedPositions.add(position);
      sequence[position] = nextBase(sequence[position], 1 + ((index + signatureIndex) % 3));
    });
    records.push({
      id: `${reference.idPrefix}${String(index + 1).padStart(reference.idPad || 2, '0')}`,
      sequence: sequence.join(''),
      sourceIndex: index + 1,
      sourceLocation: locations[index % locations.length],
    });
  }

  return records;
}

function prepareReferenceInput(preset, outputs) {
  if (preset.reference.fasta) {
    const inputFasta = path.resolve(repoRoot, preset.reference.fasta);
    if (!fs.existsSync(inputFasta)) {
      throw new Error(`reference.fasta not found: ${path.relative(repoRoot, inputFasta)}`);
    }
    const records = parseFasta(inputFasta).map((record, index) => ({
      ...record,
      sourceIndex: index + 1,
      sourceLocation: preset.metadata?.locations?.[index % preset.metadata.locations.length] || '',
    }));
    return {
      inputFasta,
      records,
      generated: false,
    };
  }

  const records = generateReferenceRecords(preset);
  writeFasta(outputs.referenceFasta, records);
  return {
    inputFasta: outputs.referenceFasta,
    records,
    generated: true,
  };
}

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsvObjects(filePath, rows, headers) {
  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(',')),
  ];
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
}

function parseDunesMutantId(id) {
  const match = id.match(/^(.*)_(\d+)$/);
  return {
    sourceSequence: match ? match[1] : '',
    mutantIndex: match ? match[2] : '',
  };
}

function addDays(dateText, offset) {
  const date = new Date(`${dateText || '2024-01-01'}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function buildNodeMetadata(outputRecords, referenceInfo, preset) {
  const sourceById = new Map(referenceInfo.records.map((record) => [record.id, record]));
  const sampleDateStart = preset.metadata?.sampleDateStart || '2024-01-01';

  return outputRecords.map((record, index) => {
    const parsed = parseDunesMutantId(record.id);
    const source = sourceById.get(parsed.sourceSequence);
    return {
      _id: record.id,
      seq_id: record.id,
      source_sequence: parsed.sourceSequence,
      mutant_index: parsed.mutantIndex,
      source_index: source?.sourceIndex || '',
      source_location: source?.sourceLocation || '',
      sample_date: addDays(sampleDateStart, index),
      generator: 'dunes',
      mutation_rate: preset.dunes.mutationRate,
      years: preset.dunes.years,
      distribution: getDunesDistribution(preset),
    };
  });
}

function countSnpsUpTo(a, b, maxThreshold) {
  const limit = Math.min(a.length, b.length);
  let count = Math.abs(a.length - b.length);
  if (count > maxThreshold) return count;
  for (let index = 0; index < limit; index++) {
    if (a[index] !== b[index]) {
      count++;
      if (count > maxThreshold) return count;
    }
  }
  return count;
}

function countPairLinks(records, thresholds) {
  const counts = Object.fromEntries(thresholds.map((threshold) => [String(threshold), 0]));
  const maxThreshold = Math.max(...thresholds);
  for (let i = 0; i < records.length; i++) {
    for (let j = 0; j < i; j++) {
      const distance = countSnpsUpTo(records[i].sequence, records[j].sequence, maxThreshold);
      thresholds.forEach((threshold) => {
        if (distance <= threshold) counts[String(threshold)]++;
      });
    }
  }
  return counts;
}

function fixtureRelative(filePath) {
  return path.relative(path.join(repoRoot, 'cypress', 'fixtures'), filePath).replace(/\\/g, '/');
}

function summarizeOutputs(preset, outputs, referenceInfo, records, metadataRows, tools, command, versions) {
  const thresholds = preset.microbetrace.thresholds.snp;
  const sequenceLengths = records.map((record) => record.sequence.length);
  const sourceDistribution = {};
  metadataRows.forEach((row) => {
    const source = row.source_sequence || '(unknown)';
    sourceDistribution[source] = (sourceDistribution[source] || 0) + 1;
  });

  return {
    version: 1,
    id: preset.id,
    generatedAt: new Date().toISOString(),
    generator: 'scripts/generate-dunes-performance-fixtures.js',
    preset,
    reproducibility: {
      referenceSeed: preset.seed,
      dunesSeed: null,
      note: 'DUNES does not expose a seed option; regenerate outputs and summary together.',
    },
    tools: {
      node: process.version,
      java: {
        path: tools.java,
        version: versions.java,
      },
      dunes: {
        jar: tools.dunesJar,
        version: versions.dunes,
        source: dunesSource,
      },
    },
    commands: {
      dunes: command,
    },
    outputs: {
      fasta: fixtureRelative(outputs.fasta),
      nodeMetadata: fixtureRelative(outputs.metadata),
      referenceFasta: referenceInfo.generated ? fixtureRelative(outputs.referenceFasta) : null,
      referenceInput: referenceInfo.generated ? null : path.relative(repoRoot, referenceInfo.inputFasta).replace(/\\/g, '/'),
      summary: fixtureRelative(outputs.summary),
    },
    counts: {
      nodes: metadataRows.length,
      sequences: records.length,
      requestedSequences: referenceInfo.records.length * preset.dunes.mutantsPerSequence,
      sourceSequences: referenceInfo.records.length,
      distribution: getDunesDistribution(preset),
      totalPairs: (records.length * (records.length - 1)) / 2,
      sequenceLength: {
        min: Math.min(...sequenceLengths),
        max: Math.max(...sequenceLengths),
      },
      sourceDistribution,
      snp: {
        thresholds,
        visibleLinksByThreshold: countPairLinks(records, thresholds),
      },
    },
    cypress: {
      snpThreshold: thresholds[0],
      timeoutMs: preset.cypress?.timeoutMs || 300000,
    },
  };
}

function assertToolsAvailable(tools) {
  const missing = [];
  if (!tools.java) missing.push('java');
  if (!tools.dunesJar) missing.push('dunes.jar via --dunes-jar or DUNES_JAR');
  if (tools.dunesJar && !fs.existsSync(tools.dunesJar)) missing.push(`dunes.jar not found at ${tools.dunesJar}`);
  if (missing.length > 0) {
    throw new Error(`Missing required host tool(s): ${missing.join('; ')}.`);
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const presetPath = path.resolve(options.preset);
  const preset = readPreset(presetPath);
  validatePreset(preset);

  const outputs = resolveOutputPaths(preset);
  const tools = {
    java: findCommand('java'),
    dunesJar: options.dunesJar,
  };
  const plannedInput = preset.reference.fasta
    ? path.resolve(repoRoot, preset.reference.fasta)
    : outputs.referenceFasta;
  const dunesArgs = [
    '-jar',
    tools.dunesJar || '<DUNES_JAR>',
    '-i',
    plannedInput,
    '-m',
    String(preset.dunes.mutationRate),
    '-y',
    String(preset.dunes.years),
    '-n',
    String(preset.dunes.mutantsPerSequence),
    '-d',
    getDunesDistribution(preset),
    '-o',
    outputs.fasta,
  ];
  const plannedCommand = commandText(tools.java || 'java', dunesArgs);

  if (options.dryRun) {
    console.log(JSON.stringify({
      preset: path.relative(repoRoot, presetPath),
      outputs: Object.fromEntries(
        Object.entries(outputs).map(([key, value]) => [key, path.relative(repoRoot, value)])
      ),
      tools: {
        java: tools.java || { missing: true, name: 'java' },
        dunesJar: tools.dunesJar || { missing: true, env: 'DUNES_JAR' },
        dunesSource,
      },
      commands: {
        dunes: plannedCommand,
      },
    }, null, 2));
    return;
  }

  assertToolsAvailable(tools);
  fs.mkdirSync(outputs.outputDir, { recursive: true });
  const referenceInfo = prepareReferenceInput(preset, outputs);
  const args = [
    '-jar',
    tools.dunesJar,
    '-i',
    referenceInfo.inputFasta,
    '-m',
    String(preset.dunes.mutationRate),
    '-y',
    String(preset.dunes.years),
    '-n',
    String(preset.dunes.mutantsPerSequence),
    '-d',
    getDunesDistribution(preset),
    '-o',
    outputs.fasta,
  ];
  const command = commandText(tools.java, args);

  runCommand(tools.java, args, 'DUNES mutation simulation');

  const outputRecords = parseFasta(outputs.fasta);
  const metadataRows = buildNodeMetadata(outputRecords, referenceInfo, preset);
  writeCsvObjects(outputs.metadata, metadataRows, [
    '_id',
    'seq_id',
    'source_sequence',
    'mutant_index',
    'source_index',
    'source_location',
    'sample_date',
    'generator',
    'mutation_rate',
    'years',
    'distribution',
  ]);

  const versions = {
    java: captureVersion(tools.java, ['-version']),
    dunes: captureVersion(tools.java, ['-jar', tools.dunesJar, '-V']),
  };
  const summary = summarizeOutputs(
    preset,
    outputs,
    referenceInfo,
    outputRecords,
    metadataRows,
    tools,
    command,
    versions
  );
  fs.writeFileSync(outputs.summary, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

  console.log(`Generated DUNES performance fixture: ${path.relative(repoRoot, outputs.summary)}`);
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
