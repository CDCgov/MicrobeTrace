const fs = require('fs');
const path = require('path');
const patristic = require('patristic');

function safeSegment(value) {
  return String(value || '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unknown';
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index++) {
    const entry = argv[index];
    if (!entry.startsWith('--')) continue;

    const key = entry.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    index++;
  }
  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function writeText(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${text.trimEnd()}\n`, 'utf8');
}

function listJsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((fileName) => fileName.endsWith('.json'))
    .sort()
    .map((fileName) => path.join(dir, fileName));
}

function resolveLatestRunId(baseDir) {
  if (!fs.existsSync(baseDir)) return null;
  const entries = fs.readdirSync(baseDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const fullPath = path.join(baseDir, entry.name);
      return {
        name: entry.name,
        mtimeMs: fs.statSync(fullPath).mtimeMs,
      };
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs);

  return entries[0]?.name || null;
}

function diffSorted(left, right) {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return {
    missing: left.filter((value) => !rightSet.has(value)),
    extra: right.filter((value) => !leftSet.has(value)),
  };
}

function canonicalPair(left, right) {
  const values = [String(left), String(right)].sort();
  return values;
}

function edgeKey(source, target) {
  const [left, right] = canonicalPair(source, target);
  return `${left}\t${right}`;
}

function normalizeEdgeSnapshot(snapshot) {
  const nodeIds = [...(snapshot.nodeIds || [])].map(String).sort();
  const edges = new Map();
  const duplicateEdges = [];

  for (const rawEdge of snapshot.visibleEdges || []) {
    const [source, target] = canonicalPair(rawEdge.source, rawEdge.target);
    const key = edgeKey(source, target);
    const distance = Number(rawEdge.distance);
    const edge = {
      source,
      target,
      distance: Number.isFinite(distance) ? distance : null,
      id: String(rawEdge.id || key),
    };

    if (edges.has(key)) {
      duplicateEdges.push(key);
    }
    edges.set(key, edge);
  }

  return {
    ...snapshot,
    nodeIds,
    edgeMap: edges,
    duplicateEdges,
  };
}

function compareEdgeSnapshots(leftSnapshot, rightSnapshot, options = {}) {
  const tolerance = Number(options.tolerance ?? 1e-6);
  const left = normalizeEdgeSnapshot(leftSnapshot);
  const right = normalizeEdgeSnapshot(rightSnapshot);
  const failures = [];
  const nodeDiff = diffSorted(left.nodeIds, right.nodeIds);
  const leftEdgeKeys = [...left.edgeMap.keys()].sort();
  const rightEdgeKeys = [...right.edgeMap.keys()].sort();
  const edgeDiff = diffSorted(leftEdgeKeys, rightEdgeKeys);
  const distanceDiffs = [];

  if (nodeDiff.missing.length || nodeDiff.extra.length) {
    failures.push(`Node set mismatch: ${nodeDiff.missing.length} missing, ${nodeDiff.extra.length} extra`);
  }

  if (edgeDiff.missing.length || edgeDiff.extra.length) {
    failures.push(`Visible edge set mismatch: ${edgeDiff.missing.length} missing, ${edgeDiff.extra.length} extra`);
  }

  if (left.duplicateEdges.length || right.duplicateEdges.length) {
    failures.push(`Duplicate visible edge keys found: ${left.duplicateEdges.length} left, ${right.duplicateEdges.length} right`);
  }

  for (const key of leftEdgeKeys) {
    if (!right.edgeMap.has(key)) continue;

    const leftDistance = left.edgeMap.get(key).distance;
    const rightDistance = right.edgeMap.get(key).distance;
    if (leftDistance === null || rightDistance === null) {
      if (leftDistance !== rightDistance) {
        distanceDiffs.push({ key, leftDistance, rightDistance, delta: null });
      }
      continue;
    }

    const delta = Math.abs(leftDistance - rightDistance);
    if (delta > tolerance) {
      distanceDiffs.push({ key, leftDistance, rightDistance, delta });
    }
  }

  if (distanceDiffs.length) {
    failures.push(`Distance mismatch: ${distanceDiffs.length} shared edges differ by more than ${tolerance}`);
  }

  return {
    scenarioId: leftSnapshot.scenarioId || rightSnapshot.scenarioId,
    threshold: leftSnapshot.threshold ?? rightSnapshot.threshold,
    passed: failures.length === 0,
    failures,
    counts: {
      leftNodes: left.nodeIds.length,
      rightNodes: right.nodeIds.length,
      leftVisibleEdges: leftEdgeKeys.length,
      rightVisibleEdges: rightEdgeKeys.length,
      sharedVisibleEdges: leftEdgeKeys.filter((key) => right.edgeMap.has(key)).length,
    },
    nodeDiff,
    edgeDiff,
    duplicateEdges: {
      left: left.duplicateEdges,
      right: right.duplicateEdges,
    },
    distanceDiffs: distanceDiffs.slice(0, 100),
    distanceDiffCount: distanceDiffs.length,
  };
}

function nodeLabel(node) {
  const value = node?.id ?? node?.name ?? node?.data?.id ?? node?.data?.name;
  return value === undefined || value === null ? '' : String(value).trim();
}

function sortedKey(values) {
  return [...values].map(String).sort().join('|');
}

function normalizeSplit(subsetValues, allLeaves) {
  const subset = new Set(subsetValues);
  const complementValues = allLeaves.filter((leaf) => !subset.has(leaf));
  const subsetSorted = [...subset].sort();
  const complementSorted = complementValues.sort();

  if (subsetSorted.length < complementSorted.length) return subsetSorted.join('|');
  if (complementSorted.length < subsetSorted.length) return complementSorted.join('|');

  const subsetKey = subsetSorted.join('|');
  const complementKey = complementSorted.join('|');
  return subsetKey <= complementKey ? subsetKey : complementKey;
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

function summarizeDeltas(values) {
  if (!values.length) {
    return {
      count: 0,
      maxAbs: null,
      meanAbs: null,
      p95Abs: null,
    };
  }

  const absValues = values.map((value) => Math.abs(value));
  let maxAbs = 0;
  let totalAbs = 0;
  for (const value of absValues) {
    if (value > maxAbs) maxAbs = value;
    totalAbs += value;
  }

  return {
    count: values.length,
    maxAbs,
    meanAbs: totalAbs / absValues.length,
    p95Abs: percentile(absValues, 95),
  };
}

function analyzeTree(newick) {
  const root = patristic.parseNewick(newick);
  const leaves = root.getLeaves().map(nodeLabel).filter(Boolean).sort();
  const allLeafSet = new Set(leaves);
  const internalSplits = new Set();
  const rootedBranches = new Map();

  function visit(node, isRoot) {
    const children = node.children || [];
    if (!children.length) {
      const label = nodeLabel(node);
      return label ? [label] : [];
    }

    const descendantLeaves = [];
    for (const child of children) {
      descendantLeaves.push(...visit(child, false));
    }

    if (!isRoot) {
      const uniqueDescendants = [...new Set(descendantLeaves)].sort();
      const descendantCount = uniqueDescendants.length;
      if (descendantCount > 0 && descendantCount < allLeafSet.size) {
        const rootedKey = sortedKey(uniqueDescendants);
        const branch = rootedBranches.get(rootedKey) || {
          key: rootedKey,
          lengths: [],
          count: 0,
        };
        branch.lengths.push(Number.isFinite(Number(node.length)) ? Number(node.length) : 0);
        branch.count++;
        rootedBranches.set(rootedKey, branch);

        if (descendantCount > 1 && descendantCount < allLeafSet.size - 1) {
          internalSplits.add(normalizeSplit(uniqueDescendants, leaves));
        }
      }
    }

    return descendantLeaves;
  }

  visit(root, true);

  const matrix = root.toMatrix();
  const distanceMap = new Map();
  const ids = matrix.ids.map(String);
  for (let i = 0; i < ids.length; i++) {
    for (let j = 0; j < i; j++) {
      distanceMap.set(edgeKey(ids[i], ids[j]), Number(matrix.matrix[i][j]));
    }
  }

  return {
    leafNames: leaves,
    internalSplits,
    rootedBranches,
    distanceMap,
  };
}

function compareNewickTrees(referenceNewick, generatedNewick, options = {}) {
  const tolerance = Number(options.tolerance ?? 1e-6);
  const failures = [];
  let reference;
  let generated;

  try {
    reference = analyzeTree(referenceNewick);
  } catch (error) {
    return {
      passed: false,
      failures: [`Reference Newick parse failed: ${error.message || error}`],
    };
  }

  try {
    generated = analyzeTree(generatedNewick);
  } catch (error) {
    return {
      passed: false,
      failures: [`Generated Newick parse failed: ${error.message || error}`],
    };
  }

  const leafDiff = diffSorted(reference.leafNames, generated.leafNames);
  if (leafDiff.missing.length || leafDiff.extra.length) {
    failures.push(`Leaf set mismatch: ${leafDiff.missing.length} missing, ${leafDiff.extra.length} extra`);
  }

  const referenceSplits = [...reference.internalSplits].sort();
  const generatedSplits = [...generated.internalSplits].sort();
  const splitDiff = diffSorted(referenceSplits, generatedSplits);
  const splitDenominator = referenceSplits.length + generatedSplits.length;
  const normalizedRfDistance = splitDenominator
    ? (splitDiff.missing.length + splitDiff.extra.length) / splitDenominator
    : 0;

  const branchLengthDeltas = [];
  for (const [key, referenceBranch] of reference.rootedBranches.entries()) {
    const generatedBranch = generated.rootedBranches.get(key);
    if (!generatedBranch || referenceBranch.count !== 1 || generatedBranch.count !== 1) continue;

    branchLengthDeltas.push(generatedBranch.lengths[0] - referenceBranch.lengths[0]);
  }

  const pairwiseDeltas = [];
  let pairwiseAboveTolerance = 0;
  if (!leafDiff.missing.length && !leafDiff.extra.length) {
    for (const [key, referenceDistance] of reference.distanceMap.entries()) {
      if (!generated.distanceMap.has(key)) continue;

      const generatedDistance = generated.distanceMap.get(key);
      const delta = generatedDistance - referenceDistance;
      pairwiseDeltas.push(delta);
      if (Math.abs(delta) > tolerance) pairwiseAboveTolerance++;
    }
  }

  return {
    passed: failures.length === 0,
    failures,
    leafDiff,
    counts: {
      referenceLeaves: reference.leafNames.length,
      generatedLeaves: generated.leafNames.length,
      referenceInternalSplits: referenceSplits.length,
      generatedInternalSplits: generatedSplits.length,
      sharedInternalSplits: referenceSplits.filter((key) => generated.internalSplits.has(key)).length,
      matchingRootedBranches: branchLengthDeltas.length,
      pairwiseDistances: pairwiseDeltas.length,
      pairwiseAboveTolerance,
    },
    topology: {
      missingReferenceSplits: splitDiff.missing,
      extraGeneratedSplits: splitDiff.extra,
      normalizedRfDistance,
    },
    branchLengths: summarizeDeltas(branchLengthDeltas),
    pairwisePatristicDistances: summarizeDeltas(pairwiseDeltas),
    tolerance,
  };
}

module.exports = {
  analyzeTree,
  compareEdgeSnapshots,
  compareNewickTrees,
  diffSorted,
  listJsonFiles,
  parseArgs,
  readJson,
  resolveLatestRunId,
  safeSegment,
  writeJson,
  writeText,
};
