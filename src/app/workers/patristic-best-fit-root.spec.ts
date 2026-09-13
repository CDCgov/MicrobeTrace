import { findPatristicBestFitRoot } from './patristic-best-fit-root';
import type { FlatTree } from './patristic-engine.types';

function threeTipStar(): FlatTree {
  return {
    nodeCount: 4,
    leafCount: 3,
    parent: new Int32Array([-1, 0, 0, 0]),
    branchLength: new Float64Array([0, 1, 2, 4]),
    rootDepth: new Float64Array([0, 1, 2, 4]),
    isLeaf: new Uint8Array([0, 1, 1, 1]),
    leafNodeIndex: new Int32Array([1, 2, 3]),
    leafNames: ['a', 'b', 'c'],
    nodeNames: ['', 'a', 'b', 'c'],
  };
}

describe('patristic best-fit root', () => {
  it('finds the point along a branch that minimizes regression residuals', () => {
    const result = findPatristicBestFitRoot(
      threeTipStar(),
      new Float64Array([2020, 2021, 2022])
    );

    expect(result.optimized).toBeTrue();
    expect(result.parentNodeIndex).toBe(0);
    expect(result.childNodeIndex).toBe(1);
    expect(result.distanceFromParent).toBeCloseTo(0.5, 10);
    expect(result.distances[0]).toBeCloseTo(0.5, 10);
    expect(result.distances[1]).toBeCloseTo(2.5, 10);
    expect(result.distances[2]).toBeCloseTo(4.5, 10);
    expect(result.residualSumSquares).toBeCloseTo(0, 12);
  });

  it('ignores undated leaves when fitting but returns distances for every tree tip', () => {
    const result = findPatristicBestFitRoot(
      threeTipStar(),
      new Float64Array([2020, Number.NaN, 2022])
    );

    expect(result.optimized).toBeTrue();
    expect(result.includedTipCount).toBe(2);
    expect(result.distances.length).toBe(3);
    expect(Array.from(result.distances).every(Number.isFinite)).toBeTrue();
    expect(result.residualSumSquares).toBeCloseTo(0, 12);
  });

  it('keeps the provided root when distinct dated tips are insufficient', () => {
    const result = findPatristicBestFitRoot(
      threeTipStar(),
      new Float64Array([2020, 2020, Number.NaN])
    );

    expect(result.optimized).toBeFalse();
    expect(result.childNodeIndex).toBe(-1);
    expect(result.residualSumSquares).toBeNull();
    expect(Array.from(result.distances)).toEqual([1, 2, 4]);
  });

  it('rejects a date vector that does not match the tree tips', () => {
    expect(() => findPatristicBestFitRoot(threeTipStar(), [2020, 2021]))
      .toThrowError('Expected 3 tip dates, but received 2.');
  });
});
