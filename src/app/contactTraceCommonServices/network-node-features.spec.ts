import {
  applyNetworkNodeCompositionSegments,
  buildNetworkNodeVisualFeatures,
  colorForNetworkCategory,
  parseNetworkCategoricalValues,
} from './network-node-features';
import { createFieldOptionValue, INTERNAL_FIELD_OPTION_VALUES } from './internal-field-options';

describe('renderer-neutral network node features', () => {
  ['None', 'constructor', '__proto__', ' exposure '].forEach(field => {
    it(`reads the exact composition field ${JSON.stringify(field)}`, () => {
      const values = { [field]: 'Food | Travel' };
      const optionValue = createFieldOptionValue(field, ['None']);
      const features = buildNetworkNodeVisualFeatures(values, { compositionField: optionValue });

      expect(features.compositionField).toBe(field);
      expect(features.donutSegments.map(segment => segment.value)).toEqual(['Food', 'Travel']);
      expect(features.accessibleLabel).toContain(`${field}: Food 50%, Travel 50%`);

      const styledFeatures = applyNetworkNodeCompositionSegments(features, optionValue, [
        { value: 'Food', color: '#00aa00' },
        { value: 'Travel', color: '#663399' },
      ]);
      expect(styledFeatures.compositionField).toBe(field);
      expect(styledFeatures.accessibleLabel).toContain(`${field}:`);
    });
  });

  ['None', INTERNAL_FIELD_OPTION_VALUES.none].forEach(optionValue => {
    it(`does not use the real None field for the no-field option ${optionValue}`, () => {
      const features = buildNetworkNodeVisualFeatures(
        { None: 'Food | Travel' },
        { compositionField: optionValue },
      );
      expect(features.compositionField).toBeNull();
      expect(features.donutSegments).toEqual([]);
    });
  });

  it('does not read inherited properties as composition metadata', () => {
    const features = buildNetworkNodeVisualFeatures({}, {
      compositionField: createFieldOptionValue('constructor'),
    });
    expect(features.donutSegments).toEqual([]);
  });

  it('normalizes native, serialized, and delimited mixed values', () => {
    expect(parseNetworkCategoricalValues(['A', 'B'])).toEqual(['A', 'B']);
    expect(parseNetworkCategoricalValues('["A","B","A"]')).toEqual(['A', 'B', 'A']);
    expect(parseNetworkCategoricalValues('A | B | A')).toEqual(['A', 'B', 'A']);
    expect(parseNetworkCategoricalValues('A; B')).toEqual(['A', 'B']);
  });

  it('builds stable mixed-value and accessible semantics', () => {
    const features = buildNetworkNodeVisualFeatures({
      exposure: 'Food | Travel | Food',
    }, {
      compositionField: 'exposure',
    });

    expect(features.donutSegments).toEqual([
      { value: 'Food', count: 2, fraction: 2 / 3, color: colorForNetworkCategory('Food') },
      { value: 'Travel', count: 1, fraction: 1 / 3, color: colorForNetworkCategory('Travel') },
    ]);
    expect(features.accessibleLabel).toContain('exposure: Food 67%, Travel 33%');
  });

  it('does not classify a single categorical value as a donut', () => {
    const features = buildNetworkNodeVisualFeatures(
      { exposure: 'Food' },
      { compositionField: 'exposure' },
    );
    expect(features.donutSegments).toHaveSize(1);
    expect(features.accessibleLabel).toBe('');
  });

  it('uses canonical weighted colors and alpha for renderer composition segments', () => {
    const base = buildNetworkNodeVisualFeatures({}, {
      compositionField: 'Genotype',
    });

    const features = applyNetworkNodeCompositionSegments(base, 'Genotype', [
      { value: '2a', color: '#00aa00', alpha: 0.35, weight: 3 },
      { value: '3a', color: '#663399', alpha: 1, weight: 1 },
    ]);

    expect(features.donutSegments).toEqual([
      { value: '2a', count: 3, fraction: 0.75, color: '#00aa00', alpha: 0.35 },
      { value: '3a', count: 1, fraction: 0.25, color: '#663399', alpha: 1 },
    ]);
    expect(features.accessibleLabel).toContain('Genotype: 2a 75%, 3a 25%');
  });
});
