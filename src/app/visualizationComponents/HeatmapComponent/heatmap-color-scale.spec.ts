import { resolveHeatmapColorScale, scaleHeatmapColorConfig } from './heatmap-color-scale';

describe('Heatmap numeric color scale', () => {
  const colors: [string, string, string] = ['#313695', '#ffffbf', '#a50026'];
  const missing = '#d9d9d9';

  it('uses actual numeric cells for automatic bounds without treating missing cells as zero', () => {
    const scale = resolveHeatmapColorScale([[40, null], [80, 20]], undefined, colors, missing);

    expect(scale.resolved.domain).toEqual({ min: 20, max: 80 });
    expect(scale.colorscale).toEqual([[0, colors[0]], [0.5, colors[1]], [1, colors[2]]]);
    expect(scale.bounds).toEqual({ zmin: 20, zmax: 80, zauto: false });
    expect(scale.resolved.colorMap(null)).toBe(missing);
  });

  it('honors custom bounds and uneven stops without changing matrix values', () => {
    const matrix = [[-20, 40, 120, null]];
    const scale = resolveHeatmapColorScale(matrix, {
      domain: { kind: 'custom', min: 0, max: 100 },
      stops: [{ value: 0, color: '#000000' }, { value: 10, color: '#ff0000' }, { value: 100, color: '#ffffff' }],
    }, colors, missing);

    expect(scale.colorscale).toEqual([[0, '#000000'], [0.1, '#ff0000'], [1, '#ffffff']]);
    expect(scale.bounds).toEqual({ zmin: 0, zmax: 100, zauto: false });
    expect(scale.resolved.colorMap(-20)).toBe('rgb(0, 0, 0)');
    expect(scale.resolved.colorMap(120)).toBe('rgb(255, 255, 255)');
    expect(matrix).toEqual([[-20, 40, 120, null]]);
  });

  it('edits TN93 percentage units while preserving raw bounds for rendering and sessions', () => {
    const scale = resolveHeatmapColorScale([[0.01, null, 0.03]], {
      domain: { kind: 'custom', min: 0, max: 0.04 },
      stops: [{ value: 0, color: '#000000' }, { value: 0.04, color: '#ffffff' }],
    }, colors, missing, 100);

    expect(scale.config.domain).toEqual({ kind: 'custom', min: 0, max: 4 });
    expect(scale.resolved.domain).toEqual({ min: 0, max: 4 });
    expect(scale.bounds).toEqual({ zmin: 0, zmax: 0.04, zauto: false });
    expect(scaleHeatmapColorConfig(scale.config, 0.01).domain).toEqual({ kind: 'custom', min: 0, max: 0.04 });
  });

  it('preserves the three-stop gradient for constant data and keeps missing values gray', () => {
    for (const value of [0, 7, -3]) {
      const scale = resolveHeatmapColorScale([[value, null, value]], undefined, colors, missing);

      expect(scale.resolved.domain).toEqual({ min: value, max: value });
      expect(scale.resolved.constant).toBeTrue();
      expect(scale.colorscale).toEqual([[0, colors[0]], [0.5, colors[1]], [1, colors[2]]]);
      expect(scale.resolved.stops.map(stop => stop.value)).toEqual([value, value, value]);
      expect(scale.resolved.colorMap(value)).toBe(colors[1]);
      expect(scale.resolved.colorMap(null)).toBe(missing);
      expect(scale.bounds).toBeUndefined();
    }
  });

  it('preserves edited low, middle, and high colors for constant data', () => {
    const edited: [string, string, string] = ['#112233', '#445566', '#778899'];
    const scale = resolveHeatmapColorScale([[0, null]], undefined, edited, missing);

    expect(scale.colorscale).toEqual([[0, edited[0]], [0.5, edited[1]], [1, edited[2]]]);
  });

  it('retains configured gradient colors and stop positions when data becomes constant', () => {
    const scale = resolveHeatmapColorScale([[20, null, 20]], {
      domain: { kind: 'auto' },
      stops: [{ value: 0, color: '#000000' }, { value: 10, color: '#ff0000' }, { value: 100, color: '#ffffff' }],
    }, colors, missing);

    expect(scale.colorscale).toEqual([[0, '#000000'], [0.1, '#ff0000'], [1, '#ffffff']]);
  });

  it('does not invent a numeric domain for an empty or entirely missing matrix', () => {
    for (const matrix of [[], [[null, null]]]) {
      const scale = resolveHeatmapColorScale(matrix, undefined, colors, missing);
      expect(scale.resolved.domain).toBeNull();
      expect(scale.bounds).toBeUndefined();
    }
  });
});
