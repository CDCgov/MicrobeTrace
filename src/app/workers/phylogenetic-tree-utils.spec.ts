import { clampNegativeBranchLengthsToZero } from './phylogenetic-tree-utils';

describe('phylogenetic tree utilities', () => {
  it('clamps all negative branch lengths in a generated tree', () => {
    const tree: any = {
      length: 0,
      children: [
        { id: 'A', length: -0.25 },
        {
          id: 'internal',
          length: -0.1,
          children: [
            { id: 'B', length: 0.2 },
            { id: 'C', length: -0.05 },
          ],
        },
      ],
    };

    expect(clampNegativeBranchLengthsToZero(tree)).toBe(3);
    expect(tree.children[0].length).toBe(0);
    expect(tree.children[1].length).toBe(0);
    expect(tree.children[1].children[0].length).toBe(0.2);
    expect(tree.children[1].children[1].length).toBe(0);
  });

  it('can normalize terminal negatives while preserving invalid internal branches for validation', () => {
    const tree: any = {
      children: [
        { id: 'A', length: -0.25 },
        {
          id: 'BAD_INTERNAL',
          length: -0.1,
          children: [
            { id: 'B', length: 0.2 },
            { id: 'C', length: 0.3 },
          ],
        },
      ],
    };

    expect(clampNegativeBranchLengthsToZero(tree, { terminalOnly: true })).toBe(1);
    expect(tree.children[0].length).toBe(0);
    expect(tree.children[1].length).toBe(-0.1);
  });
});
