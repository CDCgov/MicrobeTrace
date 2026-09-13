#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, '..', 'cypress', 'fixtures', 'performance');
const outputEol = process.platform === 'win32' ? '\r\n' : '\n';

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function makeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function csvEscape(value) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(fileName, rows) {
  const body = rows.map((row) => row.map(csvEscape).join(',')).join(outputEol);
  fs.writeFileSync(path.join(outDir, fileName), `${body}${outputEol}`, 'utf8');
}

function wrapSequence(sequence, width = 80) {
  const chunks = [];
  for (let index = 0; index < sequence.length; index += width) {
    chunks.push(sequence.slice(index, index + width));
  }
  return chunks.join(outputEol);
}

function buildGraphFixture({
  nodeCount,
  linkCount,
  nodeFile,
  linkFile,
  idPrefix,
  idPad,
  seed,
}) {
  const subtypes = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const nodes = [['_id', 'subtype', 'Diag date']];
  const nodeId = (index) => `${idPrefix}${String(index + 1).padStart(idPad, '0')}`;

  for (let index = 0; index < nodeCount; index++) {
    const day = (index % 28) + 1;
    const month = (Math.floor(index / 28) % 12) + 1;
    nodes.push([
      nodeId(index),
      subtypes[index % subtypes.length],
      `${month}/${day}/2024`,
    ]);
  }

  const links = [['source', 'target', 'distance']];
  const seen = new Set();
  const addLink = (a, b, distance) => {
    const sourceIndex = Math.min(a, b);
    const targetIndex = Math.max(a, b);
    const key = `${sourceIndex}:${targetIndex}`;
    if (sourceIndex === targetIndex || seen.has(key)) return false;
    seen.add(key);
    links.push([
      nodeId(sourceIndex),
      nodeId(targetIndex),
      distance.toFixed(3),
    ]);
    return true;
  };

  for (let index = 0; index < nodeCount; index++) {
    addLink(index, (index + 1) % nodeCount, 4 + (index % 8));
  }

  const random = makeRandom(seed);
  while (seen.size < linkCount) {
    const sourceIndex = Math.floor(random() * nodeCount);
    const offset = 2 + Math.floor(random() * 96);
    const targetIndex = (sourceIndex + offset) % nodeCount;
    const distance = 6 + Math.floor(random() * 7);
    addLink(sourceIndex, targetIndex, distance);
  }

  writeCsv(nodeFile, nodes);
  writeCsv(linkFile, links);
}

function buildGraphFixtures() {
  buildGraphFixture({
    nodeCount: 1600,
    linkCount: 3200,
    nodeFile: 'average-graph-nodes.csv',
    linkFile: 'average-graph-links.csv',
    idPrefix: 'P',
    idPad: 4,
    seed: 0x4d544750,
  });

  buildGraphFixture({
    nodeCount: 5000,
    linkCount: 10000,
    nodeFile: 'large-graph-nodes.csv',
    linkFile: 'large-graph-links.csv',
    idPrefix: 'LG',
    idPad: 5,
    seed: 0x4d544c47,
  });

  buildGraphFixture({
    nodeCount: 10000,
    linkCount: 25000,
    nodeFile: 'stress-graph-nodes.csv',
    linkFile: 'stress-graph-links.csv',
    idPrefix: 'SG',
    idPad: 5,
    seed: 0x4d545347,
  });
}

const DNA_ALPHABET = ['a', 'c', 'g', 't'];

function nextBase(current, step = 1) {
  const index = DNA_ALPHABET.indexOf(current);
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

function countSnps(sequenceA, sequenceB) {
  const limit = Math.min(sequenceA.length, sequenceB.length);
  let count = 0;

  for (let index = 0; index < limit; index++) {
    if (sequenceA[index] !== sequenceB[index]) {
      count++;
    }
  }

  return count + Math.abs(sequenceA.length - sequenceB.length);
}

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

function addUtcDays(date, days) {
  return new Date(date.getTime() + (days * MILLISECONDS_PER_DAY));
}

function formatIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function calendarDateToDecimalYear(date) {
  const year = date.getUTCFullYear();
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  return year + ((date.getTime() - start) / (end - start));
}

function decimalYearToIsoDate(value) {
  if (!Number.isFinite(value)) return null;
  const year = Math.floor(value);
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  const timestamp = start + ((value - year) * (end - start));
  return formatIsoDate(new Date(timestamp));
}

function roundNumber(value, digits = 12) {
  if (!Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function calculateRegression(points) {
  const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  let sumXX = 0;
  let sumYY = 0;
  let sumXY = 0;

  points.forEach((point) => {
    const deltaX = point.x - meanX;
    const deltaY = point.y - meanY;
    sumXX += deltaX * deltaX;
    sumYY += deltaY * deltaY;
    sumXY += deltaX * deltaY;
  });

  const slope = sumXY / sumXX;
  const intercept = meanY - (slope * meanX);
  const correlation = sumXY / Math.sqrt(sumXX * sumYY);
  const residualMeanSquared = points.reduce((sum, point) => {
    const residual = point.y - ((slope * point.x) + intercept);
    return sum + (residual * residual);
  }, 0) / points.length;

  return {
    slope: roundNumber(slope),
    intercept: roundNumber(intercept),
    tmrca: decimalYearToIsoDate(-intercept / slope),
    correlation: roundNumber(correlation),
    rSquared: roundNumber(correlation * correlation),
    residualMeanSquared: roundNumber(residualMeanSquared),
  };
}

function buildEvolutionaryRateFixture() {
  const fixtureDirectory = 'evolutionary-rate';
  const fixtureDir = path.join(outDir, fixtureDirectory);
  const sampleCount = 500;
  const sequenceLength = 2400;
  const samplingIntervalDays = 7;
  const seed = 0x45523530;
  const random = makeRandom(seed);
  const startDate = new Date(Date.UTC(2015, 0, 1));
  const reference = Array.from(
    { length: sequenceLength },
    () => DNA_ALPHABET[Math.floor(random() * DNA_ALPHABET.length)]
  );
  const mutationPositions = choosePositions(random, 256, sequenceLength, new Set());
  const fastaLines = [];
  const metadataRows = [[
    '_id',
    'sample_date',
    'region',
    'lineage',
    'expected_snp_distance',
    'expected_patristic_distance',
  ]];
  const newickLeaves = [];
  const records = [];
  const snpRegressionPoints = [];
  const patristicRegressionPoints = [];

  ensureDir(fixtureDir);

  for (let index = 0; index < sampleCount; index++) {
    const id = `ER500_${String(index + 1).padStart(4, '0')}`;
    const date = addUtcDays(startDate, index * samplingIntervalDays);
    const decimalYear = calendarDateToDecimalYear(date);
    const elapsedYears = decimalYear - calendarDateToDecimalYear(startDate);
    const snpNoise = index === 0 ? 0 : Math.round((random() - 0.5) * 8);
    const snpDistance = Math.max(0, Math.round((12 * elapsedYears) + snpNoise));
    const patristicNoise = (random() - 0.5) * 0.0003;
    const patristicDistance = Number((0.002 + (0.0012 * elapsedYears) + patristicNoise).toFixed(8));
    const sequence = reference.slice();

    if (snpDistance > mutationPositions.length) {
      throw new Error(`Evolutionary Rate fixture needs ${snpDistance} mutation positions but only ${mutationPositions.length} were reserved.`);
    }

    mutationPositions.slice(0, snpDistance).forEach((position) => {
      sequence[position] = nextBase(reference[position], 1 + (position % 3));
    });

    const sequenceText = sequence.join('');
    const region = ['North', 'Central', 'South', 'West'][index % 4];
    const lineage = `Lineage ${String(Math.floor(index / 100) + 1)}`;
    records.push({ id, sequence: sequenceText, snpDistance });
    fastaLines.push(`>${id}`);
    fastaLines.push(wrapSequence(sequenceText));
    metadataRows.push([
      id,
      formatIsoDate(date),
      region,
      lineage,
      snpDistance,
      patristicDistance.toFixed(8),
    ]);
    newickLeaves.push(`${id}:${patristicDistance.toFixed(8)}`);
    snpRegressionPoints.push({ x: decimalYear, y: snpDistance });
    patristicRegressionPoints.push({ x: decimalYear, y: patristicDistance });
  }

  const referenceSequence = records[0].sequence;
  const uniqueIds = new Set(records.map((record) => record.id));
  if (
    records.length !== sampleCount ||
    metadataRows.length !== sampleCount + 1 ||
    newickLeaves.length !== sampleCount ||
    uniqueIds.size !== sampleCount
  ) {
    throw new Error('Evolutionary Rate fixture did not generate 500 unique, matched FASTA, metadata, and Newick records.');
  }
  records.forEach((record) => {
    const actualDistance = countSnps(referenceSequence, record.sequence);
    if (actualDistance !== record.snpDistance) {
      throw new Error(`${record.id} expected ${record.snpDistance} reference SNPs but generated ${actualDistance}.`);
    }
    if (record.sequence.length !== sequenceLength) {
      throw new Error(`${record.id} expected sequence length ${sequenceLength} but generated ${record.sequence.length}.`);
    }
  });

  const fastaFile = `${fixtureDirectory}/evolutionary-rate-500.fasta`;
  const metadataFile = `${fixtureDirectory}/evolutionary-rate-500-nodes.csv`;
  const newickFile = `${fixtureDirectory}/evolutionary-rate-500.nwk`;
  const summaryFile = `${fixtureDirectory}/evolutionary-rate-500-summary.json`;
  const lastDate = addUtcDays(startDate, (sampleCount - 1) * samplingIntervalDays);
  const summary = {
    version: 1,
    id: 'evolutionary-rate-500',
    generator: 'scripts/generate-performance-fixtures.js',
    deterministic: true,
    seed: `0x${seed.toString(16)}`,
    purpose: 'Large dated fixture for Evolutionary Rate SNP and phylogenetic root-to-tip testing.',
    outputs: {
      fasta: `performance/${fastaFile}`,
      newick: `performance/${newickFile}`,
      nodeMetadata: `performance/${metadataFile}`,
      summary: `performance/${summaryFile}`,
    },
    counts: {
      nodes: sampleCount,
      sequences: sampleCount,
      leaves: sampleCount,
      sequenceLength,
      totalPairs: (sampleCount * (sampleCount - 1)) / 2,
    },
    sampling: {
      dateField: 'sample_date',
      earliestDate: formatIsoDate(startDate),
      latestDate: formatIsoDate(lastDate),
      intervalDays: samplingIntervalDays,
    },
    distances: {
      snp: {
        referenceId: records[0].id,
        targetRatePerYear: 12,
        observedRange: [
          Math.min(...records.map((record) => record.snpDistance)),
          Math.max(...records.map((record) => record.snpDistance)),
        ],
        regression: calculateRegression(snpRegressionPoints),
      },
      patristic: {
        targetRatePerYear: 0.0012,
        observedRange: [
          roundNumber(Math.min(...patristicRegressionPoints.map((point) => point.y))),
          roundNumber(Math.max(...patristicRegressionPoints.map((point) => point.y))),
        ],
        regression: calculateRegression(patristicRegressionPoints),
      },
    },
    knownLimitations: [
      'Sequences use deterministic nested SNP accumulation rather than a probabilistic substitution model.',
      'The Newick tree is a star phylogeny so its root-to-tip distances are easy to validate exactly.',
      'The data are synthetic engineering fixtures and have no epidemiological interpretation.',
    ],
  };

  fs.writeFileSync(path.join(outDir, fastaFile), `${fastaLines.join(outputEol)}${outputEol}`, 'utf8');
  writeCsv(metadataFile, metadataRows);
  fs.writeFileSync(path.join(outDir, newickFile), `(${newickLeaves.join(',')});${outputEol}`, 'utf8');
  const summaryText = JSON.stringify(summary, null, 2).replace(/\n/g, outputEol);
  fs.writeFileSync(path.join(outDir, summaryFile), `${summaryText}${outputEol}`, 'utf8');
}

function validateClusteredSequenceFixture({
  fileName,
  records,
  clusterCount,
  samplesPerCluster,
  threshold,
  expectedVisibleLinks,
}) {
  const expectedTotalLinks = (records.length * (records.length - 1)) / 2;
  const expectedWithinClusterLinks = clusterCount * ((samplesPerCluster * (samplesPerCluster - 1)) / 2);
  let visibleLinks = 0;
  let withinClusterLinks = 0;
  let maxWithinClusterSnps = 0;
  let minCrossClusterSnps = Number.POSITIVE_INFINITY;

  for (let sourceIndex = 0; sourceIndex < records.length; sourceIndex++) {
    const source = records[sourceIndex];
    for (let targetIndex = 0; targetIndex < sourceIndex; targetIndex++) {
      const target = records[targetIndex];
      const distance = countSnps(source.sequence, target.sequence);
      const sameCluster = source.cluster === target.cluster;
      const visible = distance <= threshold;

      if (sameCluster) {
        withinClusterLinks++;
        maxWithinClusterSnps = Math.max(maxWithinClusterSnps, distance);
        if (!visible) {
          throw new Error(`${fileName} has an above-threshold within-cluster pair: ${source.id}/${target.id} = ${distance}.`);
        }
      } else {
        minCrossClusterSnps = Math.min(minCrossClusterSnps, distance);
        if (visible) {
          throw new Error(`${fileName} has a threshold-visible cross-cluster pair: ${source.id}/${target.id} = ${distance}.`);
        }
      }

      if (visible) {
        visibleLinks++;
      }
    }
  }

  if (withinClusterLinks !== expectedWithinClusterLinks) {
    throw new Error(`${fileName} expected ${expectedWithinClusterLinks} within-cluster pairs but found ${withinClusterLinks}.`);
  }

  if (visibleLinks !== expectedVisibleLinks) {
    throw new Error(`${fileName} expected ${expectedVisibleLinks} threshold-visible links but found ${visibleLinks}.`);
  }

  return {
    totalLinks: expectedTotalLinks,
    visibleLinks,
    maxWithinClusterSnps,
    minCrossClusterSnps,
  };
}

function buildSequenceFixture({
  clusterCount,
  samplesPerCluster,
  sequenceLength,
  fileName,
  idPrefix,
  idPad,
  seed,
  threshold,
  clusterSignatureSnps,
  sampleMutationBase,
  sampleMutationSpread,
  expectedVisibleLinks,
}) {
  const random = makeRandom(seed);
  const reference = Array.from({ length: sequenceLength }, () => DNA_ALPHABET[Math.floor(random() * DNA_ALPHABET.length)]);
  const allSignaturePositions = new Set();
  const clusterSignatures = [];
  const lines = [];
  const records = [];

  for (let clusterIndex = 0; clusterIndex < clusterCount; clusterIndex++) {
    const signature = choosePositions(random, clusterSignatureSnps, sequenceLength, allSignaturePositions);
    signature.forEach((position) => allSignaturePositions.add(position));
    clusterSignatures.push(signature);
  }

  for (let clusterIndex = 0; clusterIndex < clusterCount; clusterIndex++) {
    const clusterReference = reference.slice();
    clusterSignatures[clusterIndex].forEach((position, signatureIndex) => {
      clusterReference[position] = nextBase(clusterReference[position], 1 + ((clusterIndex + signatureIndex) % 3));
    });

    for (let sampleIndex = 0; sampleIndex < samplesPerCluster; sampleIndex++) {
      const sequence = clusterReference.slice();
      const mutationCount = sampleMutationBase + ((clusterIndex + sampleIndex) % sampleMutationSpread);
      const mutationPositions = choosePositions(random, mutationCount, sequenceLength, allSignaturePositions);
      const globalIndex = clusterIndex * samplesPerCluster + sampleIndex;
      const id = `${idPrefix}${String(globalIndex + 1).padStart(idPad, '0')}`;

      mutationPositions.forEach((position, mutationIndex) => {
        sequence[position] = nextBase(sequence[position], 1 + ((clusterIndex + sampleIndex + mutationIndex) % 3));
      });

      const sequenceText = sequence.join('');
      records.push({
        id,
        cluster: clusterIndex,
        sequence: sequenceText,
      });
      lines.push(`>${id}`);
      lines.push(wrapSequence(sequenceText));
    }
  }

  validateClusteredSequenceFixture({
    fileName,
    records,
    clusterCount,
    samplesPerCluster,
    threshold,
    expectedVisibleLinks,
  });

  fs.writeFileSync(path.join(outDir, fileName), `${lines.join(outputEol)}${outputEol}`, 'utf8');
}

function buildSequenceFixtures() {
  buildSequenceFixture({
    clusterCount: 8,
    samplesPerCluster: 15,
    sequenceLength: 2400,
    fileName: 'average-sequences.fasta',
    idPrefix: 'SEQ',
    idPad: 4,
    seed: 0x53455150,
    threshold: 16,
    clusterSignatureSnps: 12,
    sampleMutationBase: 4,
    sampleMutationSpread: 3,
    expectedVisibleLinks: 840,
  });

  buildSequenceFixture({
    clusterCount: 15,
    samplesPerCluster: 20,
    sequenceLength: 1800,
    fileName: 'large-sequences.fasta',
    idPrefix: 'LSEQ',
    idPad: 4,
    seed: 0x4d544c53,
    threshold: 16,
    clusterSignatureSnps: 12,
    sampleMutationBase: 4,
    sampleMutationSpread: 3,
    expectedVisibleLinks: 2850,
  });

  buildSequenceFixture({
    clusterCount: 25,
    samplesPerCluster: 40,
    sequenceLength: 1800,
    fileName: 'expanded-large-sequences-1000.fasta',
    idPrefix: 'ELSEQ',
    idPad: 4,
    seed: 0x45534c31,
    threshold: 16,
    clusterSignatureSnps: 12,
    sampleMutationBase: 4,
    sampleMutationSpread: 3,
    expectedVisibleLinks: 19500,
  });

  buildSequenceFixture({
    clusterCount: 40,
    samplesPerCluster: 50,
    sequenceLength: 1800,
    fileName: 'stress-sequences-2000.fasta',
    idPrefix: 'SSEQ',
    idPad: 4,
    seed: 0x53535132,
    threshold: 16,
    clusterSignatureSnps: 12,
    sampleMutationBase: 4,
    sampleMutationSpread: 3,
    expectedVisibleLinks: 49000,
  });
}

function buildNewickFixture({
  fileName,
  leafPrefix,
  clusterCount,
  leavesPerCluster,
}) {
  const clusters = [];

  for (let clusterIndex = 0; clusterIndex < clusterCount; clusterIndex++) {
    const leaves = [];
    for (let leafIndex = 0; leafIndex < leavesPerCluster; leafIndex++) {
      const globalIndex = clusterIndex * leavesPerCluster + leafIndex + 1;
      const branchLength = leafIndex < leavesPerCluster / 2 ? '0.0010' : '0.0025';
      leaves.push(`${leafPrefix}${String(globalIndex).padStart(4, '0')}:${branchLength}`);
    }
    clusters.push(`(${leaves.join(',')}):0.0500`);
  }

  fs.writeFileSync(path.join(outDir, fileName), `(${clusters.join(',')});${outputEol}`, 'utf8');
}

function buildNewickFixtures() {
  buildNewickFixture({
    fileName: 'average-newick-500.nwk',
    leafPrefix: 'NWK',
    clusterCount: 10,
    leavesPerCluster: 50,
  });

  buildNewickFixture({
    fileName: 'large-newick-1000.nwk',
    leafPrefix: 'LNWK',
    clusterCount: 20,
    leavesPerCluster: 50,
  });

  buildNewickFixture({
    fileName: 'stress-newick-2000.nwk',
    leafPrefix: 'SNWK',
    clusterCount: 40,
    leavesPerCluster: 50,
  });
}

ensureDir(outDir);
buildGraphFixtures();
buildSequenceFixtures();
buildNewickFixtures();
buildEvolutionaryRateFixture();

console.log(`Generated performance fixtures in ${path.relative(process.cwd(), outDir)}`);
