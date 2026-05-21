const test = require('node:test');
const assert = require('node:assert/strict');
const {
  compareEdgeSnapshots,
  compareNewickTrees,
} = require('./newick-validation-utils');

function snapshot(overrides = {}) {
  return {
    scenarioId: 'example-threshold-1',
    threshold: 1,
    nodeIds: ['A', 'B', 'C'],
    visibleEdges: [
      { source: 'A', target: 'B', distance: 0.1, id: 'A-B' },
      { source: 'B', target: 'C', distance: 0.2, id: 'B-C' },
    ],
    ...overrides,
  };
}

test('edge parity accepts reordered nodes, edges, endpoints, and tiny distance noise', () => {
  const result = compareEdgeSnapshots(
    snapshot(),
    snapshot({
      nodeIds: ['C', 'A', 'B'],
      visibleEdges: [
        { source: 'C', target: 'B', distance: 0.2000004, id: 'C-B' },
        { source: 'B', target: 'A', distance: 0.1000004, id: 'B-A' },
      ],
    }),
    { tolerance: 1e-6 },
  );

  assert.equal(result.passed, true);
  assert.equal(result.distanceDiffCount, 0);
});

test('edge parity fails on missing nodes and edges', () => {
  const result = compareEdgeSnapshots(
    snapshot(),
    snapshot({
      nodeIds: ['A', 'B'],
      visibleEdges: [
        { source: 'A', target: 'B', distance: 0.1, id: 'A-B' },
      ],
    }),
  );

  assert.equal(result.passed, false);
  assert.equal(result.nodeDiff.missing.length, 1);
  assert.equal(result.edgeDiff.missing.length, 1);
});

test('edge parity fails when shared edge distance exceeds tolerance', () => {
  const result = compareEdgeSnapshots(
    snapshot(),
    snapshot({
      visibleEdges: [
        { source: 'A', target: 'B', distance: 0.1, id: 'A-B' },
        { source: 'B', target: 'C', distance: 0.3, id: 'B-C' },
      ],
    }),
    { tolerance: 1e-6 },
  );

  assert.equal(result.passed, false);
  assert.equal(result.distanceDiffCount, 1);
});

test('tree comparison accepts equivalent topology and distances with reordered Newick children', () => {
  const result = compareNewickTrees(
    '((A:1,B:1):2,C:3);',
    '(C:3,(B:1,A:1):2);',
  );

  assert.equal(result.passed, true);
  assert.equal(result.topology.normalizedRfDistance, 0);
  assert.equal(result.pairwisePatristicDistances.maxAbs, 0);
});

test('tree comparison reports topology differences without hard-failing matching leaf sets', () => {
  const result = compareNewickTrees(
    '((A:1,B:1):1,(C:1,D:1):1);',
    '((A:1,C:1):1,(B:1,D:1):1);',
  );

  assert.equal(result.passed, true);
  assert.equal(result.topology.normalizedRfDistance > 0, true);
  assert.equal(result.failures.length, 0);
});

test('tree comparison hard-fails leaf set mismatches', () => {
  const result = compareNewickTrees(
    '((A:1,B:1):1,C:1);',
    '((A:1,B:1):1,D:1);',
  );

  assert.equal(result.passed, false);
  assert.match(result.failures[0], /Leaf set mismatch/);
});
