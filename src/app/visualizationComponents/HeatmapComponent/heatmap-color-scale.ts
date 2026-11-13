import {
  normalizeVariableColorScaleConfig,
  parseContinuousNumber,
  ResolvedVariableColorScale,
  resolveVariableColorScale,
  VariableColorScaleConfig,
} from '../../contactTraceCommonServices/variable-color-scale';

/** Convert editor values to/from display units without changing saved or exported data. */
export function scaleHeatmapColorConfig(config: VariableColorScaleConfig, factor: number): VariableColorScaleConfig {
  return {
    ...config,
    domain: config.domain.kind === 'custom'
      ? { kind: 'custom', min: config.domain.min * factor, max: config.domain.max * factor }
      : { kind: 'auto' },
    stops: config.stops?.map(stop => ({ ...stop, value: stop.value * factor })),
  };
}

export function resolveHeatmapColorScale(
  matrix: (number | null)[][],
  savedConfig: unknown,
  legacyColors: [string, string, string],
  missingColor: string,
  displayFactor = 1,
): {
  config: VariableColorScaleConfig;
  resolved: ResolvedVariableColorScale;
  colorscale: [number, string][];
  bounds?: { zmin: number; zmax: number; zauto: false };
} {
  const values: { value: number }[] = [];
  for (const row of matrix) {
    for (const value of row) {
      // Null must not become zero: missing cells never contribute to the domain.
      if (value !== null && Number.isFinite(value)) values.push({ value: value * displayFactor });
    }
  }
  let config = scaleHeatmapColorConfig(normalizeVariableColorScaleConfig({
    ...(savedConfig && typeof savedConfig === 'object' ? savedConfig : {}),
    mode: 'continuous',
    missingColor,
  }), displayFactor);
  let resolved = resolveVariableColorScale(values, 'value', config);
  const legacyScale: [number, string][] = legacyColors.map((color, index) => [index / 2, color]);
  if (!resolved.domain) return { config, resolved, colorscale: legacyScale };

  const { min, max } = resolved.domain;
  if (!config.stops) {
    config = { ...config, stops: legacyColors.map((color, index) => ({ value: min + (max - min) * index / 2, color })) };
    resolved = resolveVariableColorScale(values, 'value', config);
  }
  if (resolved.constant) {
    const colors = config.stops!.map(stop => stop.color);
    const middleColor = colors[Math.floor(colors.length / 2)];
    resolved = {
      ...resolved,
      stops: colors.map(color => ({ value: min, color })),
      colorMap: value => parseContinuousNumber(value).kind === 'number' ? middleColor : missingColor,
    };
    return { config, resolved, colorscale: [[0, middleColor], [1, middleColor]] };
  }
  return {
    config,
    resolved,
    colorscale: resolved.stops.map(stop => [Number(((stop.value - min) / (max - min)).toPrecision(12)), stop.color]),
    bounds: { zmin: min / displayFactor, zmax: max / displayFactor, zauto: false },
  };
}
