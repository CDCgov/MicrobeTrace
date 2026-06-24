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
      {},
      {},
      {},
      false,
      true
    );

    expect(result.aggregates).toEqual({
      '1a': 1,
      '2a': 1,
      '3a': 1,
    });
    expect(result.updatedColorsTableKeys.Genotype).toEqual(['1a', '2a', '3a']);
    expect(result.colorMap('2a')).toBe('#222222');
    expect(result.colorMap('3a')).toBe('#333333');
  });
});
