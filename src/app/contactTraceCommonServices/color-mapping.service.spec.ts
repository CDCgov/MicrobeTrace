import { buildCanonicalNodeColorCounts, canonicalizeMixedNodeColorComponents, ColorMappingService, formatMixedNodeColorDisplayName, getMixedNodeColorLegendEntries, getMixedNodeColorSegments, normalizeNodeStyleCategoryValue, parseMixedNodeColorValue, parseWeightedMixedNodeColorValue } from './color-mapping.service';

describe('mixed node color helpers', () => {
  it('normalizes null-like aliases to the shared empty category', () => {
    expect([
      undefined,
      null,
      '',
      ' null ',
      'N/A',
      'n/a',
      'NaN',
      'undefined',
      '(Empty)'
    ].map(normalizeNodeStyleCategoryValue)).toEqual(new Array(9).fill('null'));
    expect(normalizeNodeStyleCategoryValue(' 2a ')).toBe('2a');
  });

  it('splits strings on supported delimiters', () => {
    expect(parseMixedNodeColorValue('1a/2a, 3a;4a+5a|6a and 7a')).toEqual([
      '1a',
      '2a',
      '3a',
      '4a',
      '5a',
      '6a',
      '7a'
    ]);
  });

  it('accepts arrays, trims values, removes duplicates, and ignores null-like values', () => {
    expect(parseMixedNodeColorValue([' 2a ', '2a/3a', 'N/A', 'n/a', '2a/N/A', '', null, undefined, NaN, 'nan', 'NULL', 'undefined'])).toEqual([
      '2a',
      '3a'
    ]);
  });

  it('maps mixed segments through the existing color and alpha maps', () => {
    const colors = { '2a': '#00aa00', '3a': '#ffff00' };
    const alphas = { '2a': 0.4, '3a': 0.8 };

    expect(getMixedNodeColorSegments(
      '2a/3a',
      value => colors[value],
      value => alphas[value],
      '#000000',
      1
    )).toEqual([
      { value: '2a', color: '#00aa00', alpha: 0.4, weight: 0.5 },
      { value: '3a', color: '#ffff00', alpha: 0.8, weight: 0.5 }
    ]);
  });

  it('normalizes count, decimal, and percentage weights to the same proportions', () => {
    const expected = {
      components: [
        { value: '2a', weight: 0.7 },
        { value: '3a', weight: 0.3 }
      ],
      hasExplicitWeights: true,
      invalidWeights: false
    };

    ['2a:7/3a:3', '2a:0.7/3a:0.3', '2a:70%/3a:30%', '2a:70%/3a:0.3'].forEach(value => {
      expect(parseWeightedMixedNodeColorValue(value)).toEqual(expected);
    });
  });

  it('accepts every supported separator for weighted values', () => {
    ['/', ',', ';', '+', '|', ' and '].forEach(separator => {
      expect(parseWeightedMixedNodeColorValue(`2a:3${separator}3a:1`).components).toEqual([
        { value: '2a', weight: 0.75 },
        { value: '3a', weight: 0.25 }
      ]);
    });
  });

  it('sums duplicate weighted labels before normalization', () => {
    expect(parseWeightedMixedNodeColorValue('2a:20/3a:50/2a:30')).toEqual({
      components: [
        { value: '2a', weight: 0.5 },
        { value: '3a', weight: 0.5 }
      ],
      hasExplicitWeights: true,
      invalidWeights: false
    });
  });

  it('falls back to equal weights when annotations are partial or invalid', () => {
    ['2a:70/3a', '2a:0/3a:1', '2a:-1/3a:2', '2a:nope/3a:30', '2a:Infinity/3a:30'].forEach(value => {
      expect(parseWeightedMixedNodeColorValue(value)).toEqual({
        components: [
          { value: '2a', weight: 0.5 },
          { value: '3a', weight: 0.5 }
        ],
        hasExplicitWeights: true,
        invalidWeights: true
      });
    });
  });

  it('uses the persisted color-domain order for mixed segments regardless of source order', () => {
    const colors = { '2a': '#00aa00', '3a': '#ffff00' };

    expect(getMixedNodeColorSegments(
      '3a/2a',
      value => colors[value],
      () => 1,
      '#000000',
      1,
      ['2a', '3a']
    ).map(segment => segment.value)).toEqual(['2a', '3a']);
  });

  it('uses natural alphanumeric ordering for components absent from the color domain', () => {
    expect(canonicalizeMixedNodeColorComponents('10a/2a', [])).toEqual(['2a', '10a']);
  });

  it('builds one legend entry for each distinct mixed value', () => {
    expect(getMixedNodeColorLegendEntries([
      { Genotype: '2a/3a' },
      { Genotype: '2a, 3a' },
      { Genotype: '6/7a' },
      { Genotype: '2a' },
      { Genotype: 'N/A' },
      { Genotype: null }
    ], 'Genotype')).toEqual([
      { value: '2a:0.5/3a:0.5', components: ['2a', '3a'], weights: [0.5, 0.5], count: 2, hasExplicitWeights: false, invalidWeights: false },
      { value: '6:0.5/7a:0.5', components: ['6', '7a'], weights: [0.5, 0.5], count: 1, hasExplicitWeights: false, invalidWeights: false }
    ]);
  });

  it('merges equivalent mixed legend values whose source order differs', () => {
    expect(getMixedNodeColorLegendEntries([
      { Genotype: '3a/2a' },
      { Genotype: '2a, 3a' }
    ], 'Genotype', ['2a', '3a'])).toEqual([
      { value: '2a:0.5/3a:0.5', components: ['2a', '3a'], weights: [0.5, 0.5], count: 2, hasExplicitWeights: false, invalidWeights: false }
    ]);
  });

  it('groups reordered and proportionally equivalent weighted legend values', () => {
    expect(getMixedNodeColorLegendEntries([
      { Genotype: '3a:3/2a:7' },
      { Genotype: '2a:70%/3a:30%' },
      { Genotype: '2a:1/3a:1' }
    ], 'Genotype', ['2a', '3a'])).toEqual([
      { value: '2a:0.5/3a:0.5', components: ['2a', '3a'], weights: [0.5, 0.5], count: 1, hasExplicitWeights: true, invalidWeights: false },
      { value: '2a:0.7/3a:0.3', components: ['2a', '3a'], weights: [0.7, 0.3], count: 2, hasExplicitWeights: true, invalidWeights: false }
    ]);
  });

  it('appends one grouped percentage list only when mixed values explicitly include weights', () => {
    expect(formatMixedNodeColorDisplayName(['A', 'B', 'C'], [0.2, 0.3, 0.5], false))
      .toBe('A/B/C');
    expect(formatMixedNodeColorDisplayName(['A', 'B', 'C'], [0.2, 0.3, 0.5], true))
      .toBe('A/B/C (20%/30%/50%)');
  });

  it('uses the same case-sensitive category identity for domains, rings, and legends', () => {
    const service = new ColorMappingService();
    expect(parseMixedNodeColorValue('A/a/B')).toEqual(['A', 'a', 'B']);
    expect(service.getNodeColorCategoriesForValue('A/a/B', true, ['A', 'a', 'B']))
      .toEqual(['A', 'a', 'B']);
    expect(getMixedNodeColorSegments(
      'A/a/B',
      value => value,
      () => 1,
      '#000000',
      1,
      ['A', 'a', 'B']
    ).map(segment => segment.value)).toEqual(['A', 'a', 'B']);
  });

  it('builds stable aggregate counts when member order and mixed delimiters differ', () => {
    const preferredOrder = ['1a', '2a', '3a'];
    const forwardValues = ['3a', '3a/2a', '1a', '2a', '2a, 3a'];
    const reversedValues = [...forwardValues].reverse();
    const expected = [
      { label: '1a', count: 1 },
      { label: '2a', count: 1 },
      { label: '2a:0.5/3a:0.5', count: 2 },
      { label: '3a', count: 1 }
    ];

    expect(buildCanonicalNodeColorCounts(forwardValues, preferredOrder)).toEqual(expected);
    expect(buildCanonicalNodeColorCounts(reversedValues, preferredOrder)).toEqual(expected);
  });

  it('keeps delimiter-containing categories atomic when mixed colors are disabled', () => {
    expect(buildCanonicalNodeColorCounts(
      ['Clinic, East', 'Clinic, East', 'Clinic West'],
      [],
      false
    )).toEqual([
      { label: 'Clinic West', count: 1 },
      { label: 'Clinic, East', count: 2 }
    ]);
  });

  it('preserves persisted ordering for integer-like genotype labels', () => {
    expect(buildCanonicalNodeColorCounts(['2', '10'], ['10', '2'])).toEqual([
      { label: '10', count: 1 },
      { label: '2', count: 1 }
    ]);
  });

  it('keeps mixed components in the color domain without adding fractional component counts', () => {
    const service = new ColorMappingService();
    const result = service.createNodeColorMap(
      [
        { visible: true, Genotype: '2a' },
        { visible: true, Genotype: '2a/3a' },
        { visible: true, Genotype: '3a' }
      ],
      'Genotype',
      ['#00aa00', '#ffff00'],
      [1, 1],
      {},
      {},
      {},
      {},
      false,
      true
    );

    expect(result.aggregates['2a']).toBe(1);
    expect(result.aggregates['3a']).toBe(1);
    expect(result.updatedColorsTableKeys.Genotype).toEqual(['2a', '3a']);
    expect(result.updatedColorsTableKeys.Genotype).not.toContain('2a/3a');
    expect(result.invalidMixedWeightCount).toBe(0);
  });

  it('reports visible invalid weighted values while preserving equal component colors', () => {
    const service = new ColorMappingService();
    const result = service.createNodeColorMap(
      [
        { visible: true, Genotype: '2a:70/3a' },
        { visible: false, Genotype: '2a:0/3a:1' },
        { visible: true, Genotype: '2a:3/3a:1' }
      ],
      'Genotype',
      ['#00aa00', '#ffff00'],
      [1, 1],
      {},
      {},
      {},
      {},
      false,
      true
    );

    expect(result.invalidMixedWeightCount).toBe(1);
    expect(getMixedNodeColorSegments(
      '2a:70/3a',
      result.colorMap,
      result.alphaMap,
      '#000000'
    ).map(segment => [segment.value, segment.weight])).toEqual([
      ['2a', 0.5],
      ['3a', 0.5]
    ]);
  });

  it('keeps components that only occur inside mixed values in the color table domain', () => {
    const service = new ColorMappingService();
    const result = service.createNodeColorMap(
      [
        { visible: true, Genotype: '1a' },
        { visible: true, Genotype: '2a' },
        { visible: true, Genotype: '3a' },
        { visible: true, Genotype: '2a/3a' },
        { visible: true, Genotype: '6/7a' },
        { visible: true, Genotype: 'N/A' },
        { visible: true, Genotype: null }
      ],
      'Genotype',
      ['#111111', '#222222', '#333333', '#444444', '#555555', '#666666'],
      [1, 1, 1, 1, 1, 1],
      {},
      {},
      {},
      {},
      false,
      true
    );

    expect(result.aggregates['6']).toBe(0);
    expect(result.aggregates['7a']).toBe(0);
    expect(result.aggregates['null']).toBe(2);
    expect(result.updatedColorsTableKeys.Genotype).toContain('6');
    expect(result.updatedColorsTableKeys.Genotype).toContain('7a');
    expect(result.updatedColorsTableKeys.Genotype).toContain('null');
    expect(result.updatedColorsTableKeys.Genotype).not.toContain('6/7a');
    expect(result.updatedColorsTableKeys.Genotype).not.toContain('N');
    expect(result.updatedColorsTableKeys.Genotype).not.toContain('A');
    expect(result.updatedColorsTableKeys.Genotype).not.toContain('N/A');
  });
});

describe('ColorMappingService node assignments', () => {
  let service: ColorMappingService;

  beforeEach(() => {
    service = new ColorMappingService();
  });

  it('prefers field-specific assignments over stored colors and legacy history', () => {
    const history = { MLST: { '8': '#333333' } };
    const result = service.createNodeColorMap(
      [{ visible: true, MLST: '8' }],
      'MLST',
      ['#111111'],
      [1],
      { MLST: ['#222222'] },
      { MLST: ['8'] },
      history,
      { '8': '#444444' },
      false
    );

    expect(result.colorMap('8')).toBe('#444444');
    expect(result.updatedColorsTable.MLST).toEqual(['#444444']);
    expect(history.MLST['8']).toBe('#444444');
  });

  it('keeps unmapped values on their stored colors during a partial import', () => {
    const result = service.createNodeColorMap(
      [
        { visible: true, MLST: '8' },
        { visible: true, MLST: '84' }
      ],
      'MLST',
      ['#111111', '#222222'],
      [1],
      { MLST: ['#aaaaaa', '#bbbbbb'] },
      { MLST: ['8', '84'] },
      {},
      { '8': '#cccccc' },
      false
    );

    expect(result.colorMap('8')).toBe('#cccccc');
    expect(result.colorMap('84')).toBe('#bbbbbb');
  });

  it('does not leak imported assignments into another field with the same value', () => {
    const history: Record<string, Record<string, string>> = {};
    service.createNodeColorMap(
      [{ visible: true, MLST: '8' }],
      'MLST',
      ['#111111'],
      [1],
      {},
      {},
      history,
      { '8': '#cc9999' },
      false
    );
    expect(history.MLST['8']).toBe('#cc9999');

    const otherResult = service.createNodeColorMap(
      [{ visible: true, Other: '8' }],
      'Other',
      ['#123456'],
      [1],
      {},
      {},
      history,
      {},
      false
    );

    expect(otherResult.colorMap('8')).toBe('#123456');
    expect(history.Other['8']).toBe('#123456');
    expect(history.MLST['8']).toBe('#cc9999');
  });
});
