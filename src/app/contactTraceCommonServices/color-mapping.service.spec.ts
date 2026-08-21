import { ColorMappingService, getMixedNodeColorSegments, normalizeNodeStyleCategoryValue, parseMixedNodeColorValue } from './color-mapping.service';

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
      { value: '2a', color: '#00aa00', alpha: 0.4, weight: 1 },
      { value: '3a', color: '#ffff00', alpha: 0.8, weight: 1 }
    ]);
  });

  it('splits mixed values into component color table rows instead of adding combination rows', () => {
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

    expect(result.aggregates['2a']).toBeCloseTo(1.5);
    expect(result.aggregates['3a']).toBeCloseTo(1.5);
    expect(result.updatedColorsTableKeys.Genotype).toEqual(['2a', '3a']);
    expect(result.updatedColorsTableKeys.Genotype).not.toContain('2a/3a');
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

    expect(result.aggregates['6']).toBeCloseTo(0.5);
    expect(result.aggregates['7a']).toBeCloseTo(0.5);
    expect(result.aggregates['null']).toBeCloseTo(2);
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
