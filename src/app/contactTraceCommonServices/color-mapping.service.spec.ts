import { ColorMappingService } from './color-mapping.service';
import { createDefaultVariableColorScaleConfig } from './variable-color-scale';

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
      false,
      createDefaultVariableColorScaleConfig('categorical')
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
      false,
      createDefaultVariableColorScaleConfig('categorical')
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
      false,
      createDefaultVariableColorScaleConfig('categorical')
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
      false,
      createDefaultVariableColorScaleConfig('categorical')
    );

    expect(otherResult.colorMap('8')).toBe('#123456');
    expect(history.Other['8']).toBe('#123456');
    expect(history.MLST['8']).toBe('#cc9999');
  });

  it('prefers field-specific link assignments over stored colors', () => {
    const result = service.createLinkColorMap(
      [{ visible: true, setting: 'household' }],
      'setting',
      ['#111111'],
      [1],
      { setting: ['#222222'] },
      { setting: ['household'] },
      { household: '#333333' },
      false,
      createDefaultVariableColorScaleConfig('categorical'),
      [{ visible: true, setting: 'household' }],
      { household: '#444444' }
    );

    expect(result.colorMap('household')).toBe('#444444');
    expect(result.updatedLinkColorsTable.setting).toEqual(['#444444']);
    expect(result.updatedLinkColorsTableHistory.household).toBe('#444444');
  });
});
