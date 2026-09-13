import { validateStyleFileSchema } from './style-file.schema';

describe('MicrobeTrace style-file schema', () => {
  it('accepts legacy style files without color-scale state', () => {
    const result = validateStyleFileSchema({
      widgets: {
        'node-color-variable': 'degree',
        'link-color-variable': 'distance'
      },
      nodeColors: ['#123456'],
      linkColors: ['#abcdef']
    });

    expect(result).toEqual({ valid: true, errors: [], warnings: [] });
  });

  it('accepts a valid versioned continuous scale', () => {
    const result = validateStyleFileSchema({
      widgets: { 'node-color-variable': 'score' },
      variableColorScales: {
        version: 1,
        node: {
          score: {
            mode: 'continuous',
            domain: { kind: 'custom', min: 0, max: 10 },
            stops: [
              { value: 0, color: '#000000' },
              { value: 10, color: '#ffffff' }
            ],
            missingColor: '#eae553'
          }
        },
        link: {}
      }
    });

    expect(result).toEqual({ valid: true, errors: [], warnings: [] });
  });

  it('rejects invalid style envelopes and legacy property types', () => {
    expect(validateStyleFileSchema([]).errors).toContain('style must be object.');
    expect(validateStyleFileSchema({}).errors).toContain('widgets is required.');
    const errors = validateStyleFileSchema({ widgets: [], nodeColors: '#123456' }).errors;
    expect(errors).toContain('widgets must be object.');
    expect(errors).toContain('nodeColors must be array.');
  });

  it('reports the repairs used for malformed ramp settings', () => {
    const result = validateStyleFileSchema({
      widgets: { 'node-color-variable': 'score' },
      variableColorScales: {
        node: {
          score: {
            mode: 'rainbow',
            domain: { kind: 'custom', min: 10, max: 0 },
            stops: [
              { value: 0, color: 'black' },
              { value: 0, color: '#ffffff' }
            ],
            missingColor: 'yellow'
          }
        }
      }
    });

    expect(result.valid).toBeTrue();
    expect(result.errors).toEqual([]);
    expect(result.warnings).toContain('variableColorScales.version is missing; version 1 was assumed.');
    expect(result.warnings).toContain('variableColorScales.link is missing; an empty link scale collection was used.');
    expect(result.warnings).toContain('variableColorScales.node.score.mode is invalid or missing; Auto mode was used.');
    expect(result.warnings).toContain('variableColorScales.node.score.domain must have finite values with min less than max; the automatic data domain was used.');
    expect(result.warnings).toContain('variableColorScales.node.score.missingColor is invalid or missing; the default missing-value color was used.');
    expect(result.warnings).toContain('variableColorScales.node.score.stops had 1 invalid entry removed.');
    expect(result.warnings).toContain('variableColorScales.node.score.stops has fewer than two valid stops; the default ramp was used.');
  });

  it('distinguishes sortable stops from duplicate stops', () => {
    const baseStyle: any = {
      widgets: {},
      variableColorScales: {
        version: 1,
        node: {},
        link: {}
      }
    };
    const makeConfig = (stops: Array<{ value: number; color: string }>) => ({
      mode: 'continuous',
      domain: { kind: 'auto' },
      stops,
      missingColor: '#eae553'
    });
    const sortable = JSON.parse(JSON.stringify(baseStyle));
    sortable.variableColorScales.node.score = makeConfig([
      { value: 10, color: '#ffffff' },
      { value: 0, color: '#000000' }
    ]);
    const duplicate = JSON.parse(JSON.stringify(baseStyle));
    duplicate.variableColorScales.node.score = makeConfig([
      { value: 0, color: '#000000' },
      { value: 0, color: '#ffffff' }
    ]);

    expect(validateStyleFileSchema(sortable).warnings).toContain(
      'variableColorScales.node.score.stops was out of order and was sorted by value.'
    );
    expect(validateStyleFileSchema(duplicate).warnings).toContain(
      'variableColorScales.node.score.stops contains duplicate values; the default ramp was used.'
    );
  });

  it('reports numeric-string conversion without claiming the values were discarded', () => {
    const result = validateStyleFileSchema({
      widgets: {},
      variableColorScales: {
        version: 1,
        node: {
          score: {
            mode: 'continuous',
            domain: { kind: 'custom', min: '0', max: '10' },
            stops: [
              { value: '0', color: '#000000' },
              { value: '10', color: '#ffffff' }
            ],
            missingColor: '#eae553'
          }
        },
        link: {}
      }
    });

    expect(result.valid).toBeTrue();
    expect(result.warnings).toContain('variableColorScales.node.score.domain had 2 bounds converted to numbers.');
    expect(result.warnings).toContain('variableColorScales.node.score.stops had 2 numeric values converted to numbers.');
    expect(result.warnings.some(warning => warning.includes('automatic data domain was used'))).toBeFalse();
    expect(result.warnings.some(warning => warning.includes('default ramp was used'))).toBeFalse();
  });
});
