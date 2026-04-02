import * as patristic from 'patristic';
import {
  buildLcaIndex,
  collectThresholdedEdgeBatches,
  flattenTree,
  patristicDistance,
  validateTree,
} from './patristic-engine.worker';

const buildLeafIndex = (leafNames: string[]): Map<string, number> =>
  new Map(leafNames.map((name, index) => [name, index]));

const getDistance = (
  treeNames: string[],
  lca: ReturnType<typeof buildLcaIndex>,
  tree: ReturnType<typeof flattenTree>,
  from: string,
  to: string,
): number => {
  const leafIndex = buildLeafIndex(treeNames);
  const fromIdx = leafIndex.get(from);
  const toIdx = leafIndex.get(to);

  expect(fromIdx).toBeDefined();
  expect(toIdx).toBeDefined();

  return patristicDistance(fromIdx as number, toIdx as number, tree, lca);
};

const edgePairLabels = (batchSources: Uint32Array, batchTargets: Uint32Array, tree: ReturnType<typeof flattenTree>): string[] => {
  const labeledPairs: string[] = [];
  for (let i = 0; i < batchSources.length; i++) {
    const source = tree.leafNames[batchSources[i]];
    const target = tree.leafNames[batchTargets[i]];
    labeledPairs.push(`${source}->${target}`);
  }
  return labeledPairs;
};

const normalizePair = (label: string): string => {
  const [left, right] = label.split('->');
  return left < right ? `${left}-${right}` : `${right}-${left}`;
};

const buildStarNewick = (leafCount: number): string =>
  `(${Array.from({ length: leafCount }, (_, index) => `L${index}:0.1`).join(',')});`;

const buildPrunableBalancedNewick = (): string =>
  '(((A:0.02,B:0.02):0.03,(C:0.02,D:0.02):0.03):0.2,((E:0.02,F:0.02):0.03,(G:0.02,H:0.02):0.03):0.2);';

const collectNaivePairs = (
  tree: ReturnType<typeof flattenTree>,
  lca: ReturnType<typeof buildLcaIndex>,
  threshold: number,
): string[] => {
  const pairs: string[] = [];

  for (let sourceIndex = 0; sourceIndex < tree.leafCount; sourceIndex++) {
    for (let targetIndex = 0; targetIndex < sourceIndex; targetIndex++) {
      const distance = patristicDistance(sourceIndex, targetIndex, tree, lca);
      if (distance <= threshold) {
        pairs.push(normalizePair(`${tree.leafNames[sourceIndex]}->${tree.leafNames[targetIndex]}`));
      }
    }
  }

  return pairs.sort();
};

describe('patristic-engine.worker', () => {
  const buildDistanceContext = (newick: string) => {
    const parsed = patristic.parseNewick(newick);
    const tree = flattenTree(parsed);
    const lca = buildLcaIndex(tree);
    return { tree, lca };
  };

  it('computes pairwise distances for a simple 3-leaf Newick tree', () => {
    const { tree, lca } = buildDistanceContext('((A:1,B:2):1,C:3);');

    expect(tree.leafCount).toBe(3);
    expect(getDistance(tree.leafNames, lca, tree, 'A', 'B')).toBeCloseTo(3, 10);
    expect(getDistance(tree.leafNames, lca, tree, 'A', 'C')).toBeCloseTo(5, 10);
    expect(getDistance(tree.leafNames, lca, tree, 'B', 'C')).toBeCloseTo(6, 10);
  });

  it('computes equal distance for all pairs in a star topology', () => {
    const { tree, lca } = buildDistanceContext('(A:1,B:1,C:1);');

    expect(tree.leafCount).toBe(3);
    expect(getDistance(tree.leafNames, lca, tree, 'A', 'B')).toBeCloseTo(2, 10);
    expect(getDistance(tree.leafNames, lca, tree, 'A', 'C')).toBeCloseTo(2, 10);
    expect(getDistance(tree.leafNames, lca, tree, 'B', 'C')).toBeCloseTo(2, 10);
  });

  it('respects zero-length branches in distance computations', () => {
    const { tree, lca } = buildDistanceContext('((A:0,B:1):0,C:1);');

    expect(tree.leafCount).toBe(3);
    expect(getDistance(tree.leafNames, lca, tree, 'A', 'B')).toBeCloseTo(1, 10);
    expect(getDistance(tree.leafNames, lca, tree, 'A', 'C')).toBeCloseTo(1, 10);
    expect(getDistance(tree.leafNames, lca, tree, 'B', 'C')).toBeCloseTo(2, 10);
  });

  it('filters thresholded edges to only include qualifying distances', () => {
    const parsed = patristic.parseNewick('(A:1,B:1,C:5,D:1);');
    const tree = flattenTree(parsed);
    const lca = buildLcaIndex(tree);

    const edgeBatches = collectThresholdedEdgeBatches(tree, lca, 2.5, { batchSize: 10 });
    const pairs = edgeBatches.flatMap((batch) =>
      edgePairLabels(batch.sources, batch.targets, tree).map(normalizePair)
    );

    expect(edgeBatches[edgeBatches.length - 1].done).toBeTrue();
    expect(pairs).toContain('A-B');
    expect(pairs).toContain('A-D');
    expect(pairs).toContain('B-D');
    expect(pairs).not.toContain('A-C');
    expect(pairs).not.toContain('B-C');
    expect(pairs).not.toContain('C-D');
    expect(edgeBatches.flatMap((batch) => batch.sources.length).reduce((sum, current) => sum + current, 0)).toBe(3);
  });

  it('prunes non-qualifying sibling subtrees without changing qualifying edges', () => {
    const { tree, lca } = buildDistanceContext(buildPrunableBalancedNewick());
    const threshold = 0.12;

    const edgeBatches = collectThresholdedEdgeBatches(tree, lca, threshold, { batchSize: 4 });
    const actualPairs = edgeBatches
      .flatMap((batch) => edgePairLabels(batch.sources, batch.targets, tree).map(normalizePair))
      .sort();
    const expectedPairs = collectNaivePairs(tree, lca, threshold);
    const finalBatch = edgeBatches[edgeBatches.length - 1];

    expect(actualPairs).toEqual(expectedPairs);
    expect(finalBatch.done).toBeTrue();
    expect(finalBatch.buildStats).toEqual(
      jasmine.objectContaining({
        totalLeafPairs: 28,
        accountedLeafPairs: 28,
        evaluatedLeafPairs: 12,
        prunedLeafPairs: 16,
        prunedSubtreeComparisons: 1,
      })
    );
  });

  it('streams batches and marks final batch as done', () => {
    const parsed = patristic.parseNewick(buildStarNewick(100));
    const tree = flattenTree(parsed);
    const lca = buildLcaIndex(tree);

    const batchSize = 10;
    const batches = collectThresholdedEdgeBatches(tree, lca, 0.25, { batchSize });

    expect(batches.length).toBeGreaterThan(1);
    expect(batches[batches.length - 1].done).toBeTrue();
    expect(batches[batches.length - 1].sources.length).toBeLessThanOrEqual(batchSize);

    const emitted = batches.reduce((sum, batch) => sum + batch.sources.length, 0);
    expect(emitted).toBe(4950);
  });

  it('caps emitted edges when maxEdges is provided and reports the cap in build stats', () => {
    const parsed = patristic.parseNewick(buildStarNewick(150));
    const tree = flattenTree(parsed);
    const lca = buildLcaIndex(tree);

    const batches = collectThresholdedEdgeBatches(tree, lca, 0.25, {
      batchSize: 128,
      maxEdges: 10000,
    });
    const emitted = batches.reduce((sum, batch) => sum + batch.sources.length, 0);
    const finalBatch = batches[batches.length - 1];

    expect(emitted).toBe(10000);
    expect(finalBatch.done).toBeTrue();
    expect(finalBatch.buildStats).toEqual(
      jasmine.objectContaining({
        totalLeafPairs: 11175,
        maxEdgesReached: true,
      })
    );
  });

  it('returns identical distance matrices for equivalent rerooted trees', () => {
    const first = buildDistanceContext('((A:1,B:1):1,C:1);');
    const second = buildDistanceContext('(C:1,(A:1,B:1):1);');

    const firstNames = buildLeafIndex(first.tree.leafNames);
    const secondNames = buildLeafIndex(second.tree.leafNames);

    for (const [a, aIdx] of firstNames) {
      for (const [b, bIdx] of firstNames) {
        if (aIdx >= bIdx) {
          continue;
        }
        const distanceA = patristicDistance(aIdx, bIdx, first.tree, first.lca);
        const bndx = secondNames.get(a);
        const b2 = secondNames.get(b);

        expect(bndx).toBeDefined();
        expect(b2).toBeDefined();
        const distanceB = patristicDistance(bndx as number, b2 as number, second.tree, second.lca);

        expect(distanceB).toBeCloseTo(distanceA, 10);
      }
    }
  });

  it('flags invalid tree state for duplicate leaf names', () => {
    const tree = flattenTree(patristic.parseNewick('(A:1,A:1);'));
    expect(validateTree(tree)).toContain('Duplicate leaf name');
  });

  it('handles single-leaf trees without emitting pair distances', () => {
    const { tree, lca } = buildDistanceContext('(A:1);');
    expect(tree.leafCount).toBe(1);

    expect(getDistance(tree.leafNames, lca, tree, 'A', 'A')).toBeCloseTo(0, 10);
  });

  it('returns errors for negative branch lengths', () => {
    const tree = flattenTree(patristic.parseNewick('(A:-1,B:1);'));
    expect(validateTree(tree)).toContain('Negative branch length');
  });

  it('errors when parsing an empty Newick string', () => {
    const tree = flattenTree(patristic.parseNewick(''));
    expect(validateTree(tree)).toContain('Empty Newick');
  });
});
