import {
  applyBootstrapSupportToTree,
  buildSupportSnapshot,
  canonicalSplitKey,
  collectTreeSplitKeys,
  countMatchingTreeSplits,
  formatBootstrapSupportLabel,
  hasBootstrapSupportLabels,
  isSupportStable,
  normalizeBootstrapSupportThreshold,
  parseBootstrapSupportPercent,
  splitTaxaFromKey,
} from './phylogenetic-bootstrap-utils';

describe('phylogenetic bootstrap utilities', () => {
  const allTaxa = ['A', 'B', 'C', 'D', 'E'];

  it('canonicalizes topological splits by the smaller side', () => {
    const key = canonicalSplitKey(['A', 'B', 'C'], allTaxa);
    expect(splitTaxaFromKey(key!)).toEqual(['D', 'E']);
  });

  it('uses lexical order when split sides are the same size', () => {
    const key = canonicalSplitKey(['C', 'D'], ['A', 'B', 'C', 'D']);
    expect(splitTaxaFromKey(key!)).toEqual(['A', 'B']);
  });

  it('rejects terminal and whole-tree splits', () => {
    expect(canonicalSplitKey(['A'], allTaxa)).toBeNull();
    expect(canonicalSplitKey(allTaxa, allTaxa)).toBeNull();
  });

  it('counts each matching split once per tree', () => {
    const tree: any = {
      children: [
        { children: [{ id: 'A' }, { id: 'B' }] },
        { children: [{ id: 'C' }, { id: 'D' }] },
      ],
    };
    const key = canonicalSplitKey(['A', 'B'], ['A', 'B', 'C', 'D'])!;

    expect(collectTreeSplitKeys(tree, ['A', 'B', 'C', 'D'])).toEqual([key]);
    expect(countMatchingTreeSplits(tree, [key], ['A', 'B', 'C', 'D'])[key]).toBe(1);
  });

  it('formats support values without a percent sign and with a bounded decimal length', () => {
    expect(formatBootstrapSupportLabel(85.234, 1)).toBe('85.2');
    expect(formatBootstrapSupportLabel(85.234, 10)).toBe('85.234');
    expect(formatBootstrapSupportLabel(120, 0)).toBe('100');
  });

  it('normalizes imported fractional and percentage support labels', () => {
    expect(parseBootstrapSupportPercent('0.8095238095238095')).toBeCloseTo(80.95238095238095);
    expect(parseBootstrapSupportPercent('85.25')).toBe(85.25);
    expect(parseBootstrapSupportPercent('91.5%')).toBe(91.5);
    expect(parseBootstrapSupportPercent('clade-a')).toBeNull();
    expect(parseBootstrapSupportPercent('-0.5')).toBeNull();
    expect(parseBootstrapSupportPercent('101')).toBeNull();
  });

  it('detects valid bootstrap values on non-root internal nodes', () => {
    ['0.8095', '85.25', '91.5%'].forEach(id => {
      const tree: any = {
        id: '100',
        children: [
          { id, children: [{ id: 'A' }, { id: 'B' }] },
          { id: 'C' },
        ],
      };

      expect(hasBootstrapSupportLabels(tree)).withContext(id).toBeTrue();
    });
  });

  it('ignores named, out-of-range, leaf-only, and root-only numeric labels', () => {
    const namedInternalNode: any = {
      children: [
        { id: 'clade-a', children: [{ id: 'A' }, { id: 'B' }] },
        { id: 'C' },
      ],
    };
    const outOfRangeInternalNode: any = {
      children: [
        { id: '101', children: [{ id: 'A' }, { id: 'B' }] },
        { id: 'C' },
      ],
    };
    const numericLeavesOnly: any = {
      children: [{ id: '0.8' }, { id: '95' }],
    };
    const numericRootOnly: any = {
      id: '0.95',
      children: [{ id: 'A' }, { id: 'B' }],
    };

    expect(hasBootstrapSupportLabels(namedInternalNode)).toBeFalse();
    expect(hasBootstrapSupportLabels(outOfRangeInternalNode)).toBeFalse();
    expect(hasBootstrapSupportLabels(numericLeavesOnly)).toBeFalse();
    expect(hasBootstrapSupportLabels(numericRootOnly)).toBeFalse();
  });

  it('bounds bootstrap support thresholds to percentages', () => {
    expect(normalizeBootstrapSupportThreshold(-10)).toBe(0);
    expect(normalizeBootstrapSupportThreshold(70)).toBe(70);
    expect(normalizeBootstrapSupportThreshold(120)).toBe(100);
    expect(normalizeBootstrapSupportThreshold('not-a-number')).toBe(0);
  });

  it('detects stable support snapshots within tolerance', () => {
    const splitKeys = ['A', 'B'];
    const previous = { A: 80, B: 55 };
    const current = { A: 80.4, B: 54.6 };
    const shifted = { A: 81, B: 55 };

    expect(isSupportStable(splitKeys, previous, current, 0.5)).toBeTrue();
    expect(isSupportStable(splitKeys, previous, shifted, 0.5)).toBeFalse();
  });

  it('stores raw support labels in the tree and formats display labels separately', () => {
    const tree: any = {
      children: [
        { children: [{ id: 'A' }, { id: 'B' }] },
        { children: [{ id: 'C' }, { id: 'D' }] },
      ],
    };
    const key = canonicalSplitKey(['A', 'B'], ['A', 'B', 'C', 'D'])!;
    const support = buildSupportSnapshot([key], { [key]: 17 }, 21);

    applyBootstrapSupportToTree(tree, support, ['A', 'B', 'C', 'D']);

    expect(tree.children[0].id).toBe('0.8095238095238095');
    expect(tree.children[1].id).toBe('0.8095238095238095');
    expect(formatBootstrapSupportLabel(support[key], 1)).toBe('81.0');
  });
});
