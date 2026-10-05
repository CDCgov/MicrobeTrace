import * as d3 from 'd3';
import {
  DEFAULT_CONTINUOUS_MISSING_COLOR,
  createDefaultVariableColorScaleConfig,
  inspectContinuousValues,
  normalizeVariableColorScaleConfig,
  normalizeVariableColorScaleState,
  parseContinuousNumber,
  resolveVariableColorScale,
} from './variable-color-scale';

describe('variable color scales', () => {
  it('accepts finite numbers and fully numeric strings', () => {
    expect(parseContinuousNumber(3)).toEqual({ kind: 'number', value: 3 });
    expect(parseContinuousNumber(' -1.25e2 ')).toEqual({ kind: 'number', value: -125 });
    expect(parseContinuousNumber('.5')).toEqual({ kind: 'number', value: 0.5 });
    expect(parseContinuousNumber('1px')).toEqual({ kind: 'invalid' });
    expect(parseContinuousNumber(Number.POSITIVE_INFINITY)).toEqual({ kind: 'invalid' });
  });

  it('distinguishes blanks and NaN-like values from mixed invalid values', () => {
    const summary = inspectContinuousValues([
      { value: 1 },
      { value: '2' },
      { value: '' },
      { value: null },
      { value: 'NaN' },
      { value: 'two' },
    ], 'value');

    expect(summary).toEqual(jasmine.objectContaining({
      numericCount: 2,
      missingCount: 3,
      invalidCount: 1,
      min: 1,
      max: 2,
      canUseContinuous: true,
      autoUsesContinuous: false,
    }));
  });

  it('uses continuous Auto mode for numeric-or-missing fields', () => {
    const resolved = resolveVariableColorScale([
      { value: '-2' },
      { value: null },
      { value: 8, visible: false },
    ], 'value', createDefaultVariableColorScaleConfig());

    expect(resolved.mode).toBe('continuous');
    expect(resolved.domain).toEqual({ min: -2, max: 8 });
    expect(resolved.stops.map(stop => stop.value)).toEqual([-2, 3, 8]);
    expect(resolved.colorMap(null)).toBe(DEFAULT_CONTINUOUS_MISSING_COLOR);
  });

  it('keeps mixed fields categorical in Auto and permits a continuous override', () => {
    const values = [{ value: 0 }, { value: 'unknown' }, { value: 10 }];
    const automatic = resolveVariableColorScale(values, 'value', createDefaultVariableColorScaleConfig());
    const forced = resolveVariableColorScale(values, 'value', {
      ...createDefaultVariableColorScaleConfig(),
      mode: 'continuous',
      missingColor: '#123456',
    });

    expect(automatic.mode).toBe('categorical');
    expect(forced.mode).toBe('continuous');
    expect(forced.colorMap('unknown')).toBe('#123456');
  });

  it('honors categorical overrides without changing numeric detection', () => {
    const resolved = resolveVariableColorScale([{ value: 1 }, { value: 2 }], 'value', {
      ...createDefaultVariableColorScaleConfig(),
      mode: 'categorical',
    });

    expect(resolved.mode).toBe('categorical');
    expect(resolved.summary.autoUsesContinuous).toBeTrue();
  });

  it('uses custom bounds, arbitrary stops, CIELAB interpolation, and clamping', () => {
    const resolved = resolveVariableColorScale([{ value: -100 }, { value: 100 }], 'value', {
      mode: 'continuous',
      domain: { kind: 'custom', min: 0, max: 20 },
      stops: [
        { value: 0, color: '#000000' },
        { value: 5, color: '#ff0000' },
        { value: 20, color: '#ffffff' },
      ],
      missingColor: '#abcdef',
    });

    expect(resolved.domain).toEqual({ min: 0, max: 20 });
    expect(d3.color(resolved.colorMap(-5))?.hex()).toBe('#000000');
    expect(d3.color(resolved.colorMap(5))?.hex()).toBe('#ff0000');
    expect(d3.color(resolved.colorMap(25))?.hex()).toBe('#ffffff');
    expect(resolved.colorMap(undefined)).toBe('#abcdef');
  });

  it('uses the middle ramp color and a single-value domain for constant fields', () => {
    const resolved = resolveVariableColorScale([{ value: 7 }, { value: '7' }], 'value');

    expect(resolved.constant).toBeTrue();
    expect(resolved.domain).toEqual({ min: 7, max: 7 });
    expect(resolved.colorMap(7).toLowerCase()).toBe('#21918c');
    expect(resolved.colorMap(999).toLowerCase()).toBe('#21918c');
  });

  it('normalizes malformed persisted settings safely', () => {
    const config = normalizeVariableColorScaleConfig({
      mode: 'rainbow',
      domain: { kind: 'custom', min: 5, max: 1 },
      stops: [
        { value: 1, color: 'red' },
        { value: 1, color: '#123456' },
      ],
      missingColor: 'yellow',
    });
    const state = normalizeVariableColorScaleState({
      version: 99,
      node: { score: config },
      link: [],
    });

    expect(config).toEqual(jasmine.objectContaining(createDefaultVariableColorScaleConfig()));
    expect(config.stops).toBeUndefined();
    expect(state.version).toBe(1);
    expect(state.node.score).toEqual(jasmine.objectContaining(createDefaultVariableColorScaleConfig()));
    expect(state.node.score.stops).toBeUndefined();
    expect(state.link).toEqual({});
  });
});
