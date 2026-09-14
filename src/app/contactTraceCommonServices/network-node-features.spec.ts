import {
  buildNetworkNodeVisualFeatures,
  colorForNetworkCategory,
  parseNetworkCategoricalValues,
} from './network-node-features';

describe('renderer-neutral network node features', () => {
  it('normalizes native, serialized, and delimited mixed values', () => {
    expect(parseNetworkCategoricalValues(['A', 'B'])).toEqual(['A', 'B']);
    expect(parseNetworkCategoricalValues('["A","B","A"]')).toEqual(['A', 'B', 'A']);
    expect(parseNetworkCategoricalValues('A | B | A')).toEqual(['A', 'B', 'A']);
    expect(parseNetworkCategoricalValues('A; B')).toEqual(['A', 'B']);
  });

  it('builds stable donut, QC, uncertainty, and accessible semantics', () => {
    const features = buildNetworkNodeVisualFeatures({
      exposure: 'Food | Travel | Food',
      qcStatus: 'Review',
      qcSeverity: 'warning',
      qcReason: 'Mixed specimen signal',
      uncertainty: 0.7,
    }, {
      compositionField: 'exposure',
      qcStatusField: 'qcStatus',
      qcSeverityField: 'qcSeverity',
      qcReasonField: 'qcReason',
      uncertaintyField: 'uncertainty',
    });

    expect(features.donutSegments).toEqual([
      { value: 'Food', count: 2, fraction: 2 / 3, color: colorForNetworkCategory('Food') },
      { value: 'Travel', count: 1, fraction: 1 / 3, color: colorForNetworkCategory('Travel') },
    ]);
    expect(features.qc).toEqual({
      status: 'Review',
      severity: 'warning',
      reason: 'Mixed specimen signal',
      color: '#d97706',
      symbol: '!',
    });
    expect(features.uncertainty).toBe(0.7);
    expect(features.accessibleLabel).toContain('exposure: Food 67%, Travel 33%');
    expect(features.accessibleLabel).toContain('QC Review: Mixed specimen signal');
    expect(features.accessibleLabel).toContain('uncertainty 70%');
  });

  it('does not classify a single categorical value as a donut', () => {
    const features = buildNetworkNodeVisualFeatures(
      { exposure: 'Food' },
      { compositionField: 'exposure' },
    );
    expect(features.donutSegments).toHaveSize(1);
    expect(features.accessibleLabel).toBe('');
  });
});
