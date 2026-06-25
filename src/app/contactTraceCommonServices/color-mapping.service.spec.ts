<<<<<<< HEAD
import { ColorMappingService, getMixedNodeColorSegments, parseMixedNodeColorValue } from './color-mapping.service';

describe('mixed node color helpers', () => {
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
    expect(parseMixedNodeColorValue([' 2a ', '2a/3a', '', null, undefined, NaN, 'nan', 'NULL', 'undefined'])).toEqual([
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
=======
import { ColorMappingService } from './color-mapping.service';

describe('ColorMappingService mixed node colors', () => {
  let service: ColorMappingService;

  beforeEach(() => {
    service = new ColorMappingService();
  });

  it('splits mixed values on supported delimiters', () => {
    expect(service.parseMixedColorValue('1a/2a, 3a;4a+5a|6a and 7a'))
      .toEqual(['1a', '2a', '3a', '4a', '5a', '6a', '7a']);
  });

  it('deduplicates parts and ignores null-like tokens', () => {
    expect(service.parseMixedColorValue(['2a / 2A', null, 'nan', '3a', 'null', '']))
      .toEqual(['2a', '3a']);
  });

  it('falls back to a normalized scalar category when mixed parsing finds no parts', () => {
    expect(service.getNodeColorCategoriesForValue(null, true)).toEqual(['null']);
    expect(service.getNodeColorCategoriesForValue('  ', true)).toEqual(['null']);
    expect(service.getNodeColorCategoriesForValue('2a', true)).toEqual(['2a']);
  });

  it('aggregates mixed node values by component categories when enabled', () => {
    const result = service.createNodeColorMap(
      [
        { visible: true, Genotype: '1a' },
        { visible: true, Genotype: '2a/3a' },
        { visible: true, Genotype: '2a and 3a' },
        { visible: false, Genotype: '4a/5a' },
      ],
      'Genotype',
      ['#111111', '#222222', '#333333'],
      [1, 1, 1],
>>>>>>> 660c7154f44e9ff241dcee8b5abe4e2d72d6de52
      {},
      {},
      {},
      false,
      true
    );

<<<<<<< HEAD
    expect(result.aggregates['2a']).toBeCloseTo(1.5);
    expect(result.aggregates['3a']).toBeCloseTo(1.5);
    expect(result.updatedColorsTableKeys.Genotype).toEqual(['2a', '3a']);
    expect(result.updatedColorsTableKeys.Genotype).not.toContain('2a/3a');
=======
    expect(result.aggregates).toEqual({
      '1a': 1,
      '2a': 1,
      '3a': 1,
    });
    expect(result.updatedColorsTableKeys.Genotype).toEqual(['1a', '2a', '3a']);
    expect(result.colorMap('2a')).toBe('#222222');
    expect(result.colorMap('3a')).toBe('#333333');
>>>>>>> 660c7154f44e9ff241dcee8b5abe4e2d72d6de52
  });
});
