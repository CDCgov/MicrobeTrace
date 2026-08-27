#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, '..', 'cypress', 'fixtures', 'performance');

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
  const body = rows.map((row) => row.map(csvEscape).join(',')).join('\n');
  fs.writeFileSync(path.join(outDir, fileName), `${body}\n`, 'utf8');
}

function wrapSequence(sequence, width = 80) {
  const chunks = [];
  for (let index = 0; index < sequence.length; index += width) {
    chunks.push(sequence.slice(index, index + width));
  }
  return chunks.join('\n');
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

  fs.writeFileSync(path.join(outDir, fileName), `${lines.join('\n')}\n`, 'utf8');
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

  fs.writeFileSync(path.join(outDir, fileName), `(${clusters.join(',')});\n`, 'utf8');
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

  // All 500 leaves qualify at threshold 0.006, producing 124,750 links.
  // This fixture intentionally exceeds the default 100,000 exact-link
  // drawing guardrail while remaining small enough for repeated worker tests.
  buildNewickFixture({
    fileName: 'dense-newick-500-above-guardrail.nwk',
    leafPrefix: 'DNWK',
    clusterCount: 1,
    leavesPerCluster: 500,
  });
}

ensureDir(outDir);
buildGraphFixtures();
buildSequenceFixtures();
buildNewickFixtures();

console.log(`Generated performance fixtures in ${path.relative(process.cwd(), outDir)}`);
