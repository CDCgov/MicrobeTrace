import type { FlatTree } from './patristic-engine.types';

export interface PatristicBestFitRootResult {
  distances: Float64Array;
  optimized: boolean;
  includedTipCount: number;
  residualSumSquares: number | null;
  parentNodeIndex: number;
  childNodeIndex: number;
  distanceFromParent: number;
  branchLength: number;
}

interface RegressionContext {
  includedTipCount: number;
  centeredDates: Float64Array;
  centeredDateSum: number;
  centeredDateSumSquares: number;
}

const NUMERIC_TOLERANCE_MULTIPLIER = 128;

function importedRootDistances(tree: FlatTree): Float64Array {
  const distances = new Float64Array(tree.leafCount);
  for (let leafIndex = 0; leafIndex < tree.leafCount; leafIndex++) {
    distances[leafIndex] = tree.rootDepth[tree.leafNodeIndex[leafIndex]];
  }
  return distances;
}

function buildRegressionContext(decimalYears: ArrayLike<number>, leafCount: number): RegressionContext {
  if (decimalYears.length !== leafCount) {
    throw new Error(`Expected ${leafCount} tip dates, but received ${decimalYears.length}.`);
  }

  let includedTipCount = 0;
  let dateSum = 0;
  for (let leafIndex = 0; leafIndex < leafCount; leafIndex++) {
    const date = Number(decimalYears[leafIndex]);
    if (Number.isFinite(date)) {
      includedTipCount++;
      dateSum += date;
    }
  }

  const meanDate = includedTipCount > 0 ? dateSum / includedTipCount : 0;
  const centeredDates = new Float64Array(leafCount);
  centeredDates.fill(Number.NaN);
  let centeredDateSum = 0;
  let centeredDateSumSquares = 0;

  for (let leafIndex = 0; leafIndex < leafCount; leafIndex++) {
    const date = Number(decimalYears[leafIndex]);
    if (!Number.isFinite(date)) continue;
    const centeredDate = date - meanDate;
    centeredDates[leafIndex] = centeredDate;
    centeredDateSum += centeredDate;
    centeredDateSumSquares += centeredDate * centeredDate;
  }

  centeredDateSumSquares -= (centeredDateSum * centeredDateSum) / Math.max(1, includedTipCount);

  return {
    includedTipCount,
    centeredDates,
    centeredDateSum,
    centeredDateSumSquares,
  };
}

function nonNegativeResidual(value: number): number {
  if (!Number.isFinite(value)) return Number.POSITIVE_INFINITY;
  return Math.max(0, value);
}

function calculateResidualSumSquares(
  distances: ArrayLike<number>,
  context: RegressionContext
): number | null {
  const n = context.includedTipCount;
  const sxx = context.centeredDateSumSquares;
  if (n < 2 || !Number.isFinite(sxx) || sxx <= Number.EPSILON) return null;

  let distanceSum = 0;
  let distanceSumSquares = 0;
  let dateDistanceSum = 0;
  for (let leafIndex = 0; leafIndex < distances.length; leafIndex++) {
    const centeredDate = context.centeredDates[leafIndex];
    if (!Number.isFinite(centeredDate)) continue;
    const distance = Number(distances[leafIndex]);
    distanceSum += distance;
    distanceSumSquares += distance * distance;
    dateDistanceSum += centeredDate * distance;
  }

  const centeredDistanceSumSquares = distanceSumSquares - ((distanceSum * distanceSum) / n);
  const centeredDateDistanceSum = dateDistanceSum - (
    (context.centeredDateSum * distanceSum) / n
  );
  return nonNegativeResidual(
    centeredDistanceSumSquares - ((centeredDateDistanceSum * centeredDateDistanceSum) / sxx)
  );
}

function rootDistancesAlongEdge(
  tree: FlatTree,
  children: number[][],
  parentNodeIndex: number,
  childNodeIndex: number,
  distanceFromParent: number
): Float64Array {
  const nodeDistances = new Float64Array(tree.nodeCount);
  const visited = new Uint8Array(tree.nodeCount);
  const branchLength = tree.branchLength[childNodeIndex];
  const stack: Array<{ nodeIndex: number; distance: number }> = [
    { nodeIndex: parentNodeIndex, distance: distanceFromParent },
    { nodeIndex: childNodeIndex, distance: branchLength - distanceFromParent },
  ];

  visited[parentNodeIndex] = 1;
  visited[childNodeIndex] = 1;

  while (stack.length > 0) {
    const current = stack.pop()!;
    nodeDistances[current.nodeIndex] = current.distance;

    const parentIndex = tree.parent[current.nodeIndex];
    if (parentIndex >= 0 && !visited[parentIndex]) {
      visited[parentIndex] = 1;
      stack.push({
        nodeIndex: parentIndex,
        distance: current.distance + tree.branchLength[current.nodeIndex],
      });
    }

    for (const childIndex of children[current.nodeIndex]) {
      if (visited[childIndex]) continue;
      visited[childIndex] = 1;
      stack.push({
        nodeIndex: childIndex,
        distance: current.distance + tree.branchLength[childIndex],
      });
    }
  }

  const distances = new Float64Array(tree.leafCount);
  for (let leafIndex = 0; leafIndex < tree.leafCount; leafIndex++) {
    distances[leafIndex] = nodeDistances[tree.leafNodeIndex[leafIndex]];
  }
  return distances;
}

/**
 * Locate the point on the tree that minimizes the root-to-tip OLS residual sum
 * of squares for the supplied dated tips. The scan is linear in tree size:
 * subtree regression totals are accumulated once, then rerooted across every
 * edge. For a position t along an edge, the residual sum of squares is a
 * quadratic in t, so its minimum can be solved directly and clamped to the
 * branch endpoints.
 */
export function findPatristicBestFitRoot(
  tree: FlatTree,
  decimalYears: ArrayLike<number>
): PatristicBestFitRootResult {
  const importedDistances = importedRootDistances(tree);
  const context = buildRegressionContext(decimalYears, tree.leafCount);
  const importedResidual = calculateResidualSumSquares(importedDistances, context);
  const fallback = (): PatristicBestFitRootResult => ({
    distances: importedDistances,
    optimized: false,
    includedTipCount: context.includedTipCount,
    residualSumSquares: importedResidual,
    parentNodeIndex: -1,
    childNodeIndex: -1,
    distanceFromParent: 0,
    branchLength: 0,
  });

  const n = context.includedTipCount;
  const sxx = context.centeredDateSumSquares;
  if (n < 2 || importedResidual === null || !Number.isFinite(sxx) || sxx <= Number.EPSILON) {
    return fallback();
  }

  const rootIndex = tree.parent.findIndex(parentIndex => parentIndex < 0);
  if (rootIndex < 0) return fallback();

  const children: number[][] = Array.from({ length: tree.nodeCount }, () => []);
  for (let nodeIndex = 0; nodeIndex < tree.nodeCount; nodeIndex++) {
    const parentIndex = tree.parent[nodeIndex];
    if (parentIndex >= 0) children[parentIndex].push(nodeIndex);
  }

  const subtreeCount = new Float64Array(tree.nodeCount);
  const subtreeDateSum = new Float64Array(tree.nodeCount);
  const subtreeDistanceSum = new Float64Array(tree.nodeCount);
  const subtreeDistanceSumSquares = new Float64Array(tree.nodeCount);
  const subtreeDateDistanceSum = new Float64Array(tree.nodeCount);

  for (let leafIndex = 0; leafIndex < tree.leafCount; leafIndex++) {
    const centeredDate = context.centeredDates[leafIndex];
    if (!Number.isFinite(centeredDate)) continue;
    const nodeIndex = tree.leafNodeIndex[leafIndex];
    subtreeCount[nodeIndex] = 1;
    subtreeDateSum[nodeIndex] = centeredDate;
  }

  // Parent indices precede child indices in FlatTree, so reverse index order is postorder.
  for (let nodeIndex = tree.nodeCount - 1; nodeIndex >= 0; nodeIndex--) {
    const parentIndex = tree.parent[nodeIndex];
    if (parentIndex < 0) continue;
    const branchLength = tree.branchLength[nodeIndex];
    if (!Number.isFinite(branchLength) || branchLength < 0) {
      throw new Error('Best-fit rooting requires finite, non-negative branch lengths.');
    }

    const count = subtreeCount[nodeIndex];
    const distanceSum = subtreeDistanceSum[nodeIndex];
    subtreeCount[parentIndex] += count;
    subtreeDateSum[parentIndex] += subtreeDateSum[nodeIndex];
    subtreeDistanceSum[parentIndex] += distanceSum + (branchLength * count);
    subtreeDistanceSumSquares[parentIndex] += subtreeDistanceSumSquares[nodeIndex]
      + (2 * branchLength * distanceSum)
      + (branchLength * branchLength * count);
    subtreeDateDistanceSum[parentIndex] += subtreeDateDistanceSum[nodeIndex]
      + (branchLength * subtreeDateSum[nodeIndex]);
  }

  if (subtreeCount[rootIndex] !== n) return fallback();

  const totalDistanceSum = new Float64Array(tree.nodeCount);
  const totalDistanceSumSquares = new Float64Array(tree.nodeCount);
  const totalDateDistanceSum = new Float64Array(tree.nodeCount);
  totalDistanceSum[rootIndex] = subtreeDistanceSum[rootIndex];
  totalDistanceSumSquares[rootIndex] = subtreeDistanceSumSquares[rootIndex];
  totalDateDistanceSum[rootIndex] = subtreeDateDistanceSum[rootIndex];

  // Reroot the aggregate distance moments from each parent vertex to each child vertex.
  for (let nodeIndex = 0; nodeIndex < tree.nodeCount; nodeIndex++) {
    const parentIndex = tree.parent[nodeIndex];
    if (parentIndex < 0) continue;
    const branchLength = tree.branchLength[nodeIndex];
    const insideCount = subtreeCount[nodeIndex];
    const insideDistanceFromParent = subtreeDistanceSum[nodeIndex] + (branchLength * insideCount);

    totalDistanceSum[nodeIndex] = totalDistanceSum[parentIndex]
      + (branchLength * (n - (2 * insideCount)));
    totalDistanceSumSquares[nodeIndex] = totalDistanceSumSquares[parentIndex]
      + (2 * branchLength * (totalDistanceSum[parentIndex] - (2 * insideDistanceFromParent)))
      + (branchLength * branchLength * n);
    totalDateDistanceSum[nodeIndex] = totalDateDistanceSum[parentIndex]
      + (branchLength * (context.centeredDateSum - (2 * subtreeDateSum[nodeIndex])));
  }

  let bestResidual = importedResidual;
  let bestParentNodeIndex = -1;
  let bestChildNodeIndex = -1;
  let bestDistanceFromParent = 0;

  for (let childNodeIndex = 0; childNodeIndex < tree.nodeCount; childNodeIndex++) {
    const parentNodeIndex = tree.parent[childNodeIndex];
    if (parentNodeIndex < 0) continue;
    const branchLength = tree.branchLength[childNodeIndex];
    const insideCount = subtreeCount[childNodeIndex];
    const insideDistanceFromParent = subtreeDistanceSum[childNodeIndex]
      + (branchLength * insideCount);
    const distanceSum = totalDistanceSum[parentNodeIndex];
    const signedTipCount = n - (2 * insideCount);
    const signedDistanceSum = distanceSum - (2 * insideDistanceFromParent);
    const signedDateSum = context.centeredDateSum - (2 * subtreeDateSum[childNodeIndex]);

    const centeredDistanceSumSquares = totalDistanceSumSquares[parentNodeIndex]
      - ((distanceSum * distanceSum) / n);
    const centeredDateDistanceSum = totalDateDistanceSum[parentNodeIndex]
      - ((context.centeredDateSum * distanceSum) / n);
    const distanceLinearTerm = signedDistanceSum - ((distanceSum * signedTipCount) / n);
    const dateDistanceLinearTerm = signedDateSum
      - ((context.centeredDateSum * signedTipCount) / n);

    const quadraticConstant = centeredDistanceSumSquares
      - ((centeredDateDistanceSum * centeredDateDistanceSum) / sxx);
    const quadraticLinear = 2 * (
      distanceLinearTerm
      - ((centeredDateDistanceSum * dateDistanceLinearTerm) / sxx)
    );
    const quadraticCoefficient = (n - ((signedTipCount * signedTipCount) / n))
      - ((dateDistanceLinearTerm * dateDistanceLinearTerm) / sxx);
    const coefficientTolerance = Number.EPSILON * NUMERIC_TOLERANCE_MULTIPLIER * Math.max(
      1,
      Math.abs(quadraticCoefficient),
      Math.abs(n - ((signedTipCount * signedTipCount) / n))
    );
    const distanceFromParent = quadraticCoefficient > coefficientTolerance
      ? Math.max(0, Math.min(branchLength, -quadraticLinear / (2 * quadraticCoefficient)))
      : 0;
    const residual = nonNegativeResidual(
      quadraticConstant
      + (quadraticLinear * distanceFromParent)
      + (quadraticCoefficient * distanceFromParent * distanceFromParent)
    );
    const comparisonTolerance = Number.EPSILON * NUMERIC_TOLERANCE_MULTIPLIER * Math.max(
      1,
      Math.abs(bestResidual),
      Math.abs(residual)
    );

    if (residual < bestResidual - comparisonTolerance) {
      bestResidual = residual;
      bestParentNodeIndex = parentNodeIndex;
      bestChildNodeIndex = childNodeIndex;
      bestDistanceFromParent = distanceFromParent;
    }
  }

  const distances = bestChildNodeIndex >= 0
    ? rootDistancesAlongEdge(
      tree,
      children,
      bestParentNodeIndex,
      bestChildNodeIndex,
      bestDistanceFromParent
    )
    : importedDistances;

  return {
    distances,
    optimized: true,
    includedTipCount: n,
    residualSumSquares: calculateResidualSumSquares(distances, context),
    parentNodeIndex: bestParentNodeIndex,
    childNodeIndex: bestChildNodeIndex,
    distanceFromParent: bestDistanceFromParent,
    branchLength: bestChildNodeIndex >= 0 ? tree.branchLength[bestChildNodeIndex] : 0,
  };
}
