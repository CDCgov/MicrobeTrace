import * as d3 from 'd3';

export type ColorScaleMode = 'auto' | 'categorical' | 'continuous';
export type VariableColorTarget = 'node' | 'link';

export interface ContinuousColorStop {
  value: number;
  color: string;
}

export type VariableColorScaleDomain =
  | { kind: 'auto' }
  | { kind: 'custom'; min: number; max: number };

export interface VariableColorScaleConfig {
  mode: ColorScaleMode;
  domain: VariableColorScaleDomain;
  stops?: ContinuousColorStop[];
  missingColor: string;
}

export interface VariableColorScaleState {
  version: 1;
  node: Record<string, VariableColorScaleConfig>;
  link: Record<string, VariableColorScaleConfig>;
}

export interface ContinuousNumericSummary {
  numericCount: number;
  missingCount: number;
  invalidCount: number;
  uniqueCount: number;
  min: number | null;
  max: number | null;
  canUseContinuous: boolean;
  autoUsesContinuous: boolean;
}

export interface ResolvedVariableColorScale {
  field: string;
  requestedMode: ColorScaleMode;
  mode: 'categorical' | 'continuous';
  summary: ContinuousNumericSummary;
  domain: { min: number; max: number } | null;
  stops: ContinuousColorStop[];
  missingColor: string;
  constant: boolean;
  colorMap: (value: unknown) => string;
}

export const VARIABLE_COLOR_SCALE_VERSION = 1 as const;
export const DEFAULT_CONTINUOUS_MISSING_COLOR = '#EAE553';
export const DEFAULT_CONTINUOUS_COLORS = ['#440154', '#21918c', '#fde725'] as const;

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const DECIMAL_NUMBER_PATTERN = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;

export function createDefaultVariableColorScaleConfig(mode: ColorScaleMode = 'auto'): VariableColorScaleConfig {
  return {
    mode,
    domain: { kind: 'auto' },
    missingColor: DEFAULT_CONTINUOUS_MISSING_COLOR
  };
}

export function createVariableColorScaleState(): VariableColorScaleState {
  return {
    version: VARIABLE_COLOR_SCALE_VERSION,
    node: {},
    link: {}
  };
}

export function normalizeHexColor(value: unknown, fallback: string): string {
  const color = typeof value === 'string' ? value.trim() : '';
  return HEX_COLOR_PATTERN.test(color) ? color : fallback;
}

export function parseContinuousNumber(value: unknown): { kind: 'number'; value: number } | { kind: 'missing' | 'invalid' } {
  if (value === null || value === undefined) {
    return { kind: 'missing' };
  }

  if (typeof value === 'number') {
    if (Number.isFinite(value)) {
      return { kind: 'number', value };
    }
    return Number.isNaN(value) ? { kind: 'missing' } : { kind: 'invalid' };
  }

  if (typeof value !== 'string') {
    return { kind: 'invalid' };
  }

  const trimmed = value.trim();
  const normalized = trimmed.toLowerCase();
  if (!trimmed || normalized === 'nan' || normalized === 'null') {
    return { kind: 'missing' };
  }

  if (!DECIMAL_NUMBER_PATTERN.test(trimmed)) {
    return { kind: 'invalid' };
  }

  const numericValue = Number(trimmed);
  return Number.isFinite(numericValue)
    ? { kind: 'number', value: numericValue }
    : { kind: 'invalid' };
}

export function inspectContinuousValues(items: any[], field: string): ContinuousNumericSummary {
  const numericValues: number[] = [];
  let missingCount = 0;
  let invalidCount = 0;

  (items || []).forEach(item => {
    const parsed = parseContinuousNumber(item?.[field]);
    if (parsed.kind === 'number') {
      numericValues.push(parsed.value);
    } else if (parsed.kind === 'missing') {
      missingCount += 1;
    } else {
      invalidCount += 1;
    }
  });

  const numericCount = numericValues.length;
  const uniqueCount = new Set(numericValues).size;
  const min = numericCount ? Math.min(...numericValues) : null;
  const max = numericCount ? Math.max(...numericValues) : null;

  return {
    numericCount,
    missingCount,
    invalidCount,
    uniqueCount,
    min,
    max,
    canUseContinuous: numericCount > 0,
    autoUsesContinuous: numericCount > 0 && invalidCount === 0
  };
}

export function normalizeVariableColorScaleConfig(value: unknown): VariableColorScaleConfig {
  const candidate = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Partial<VariableColorScaleConfig>
    : {};
  const mode: ColorScaleMode = candidate.mode === 'categorical' || candidate.mode === 'continuous'
    ? candidate.mode
    : 'auto';

  let domain: VariableColorScaleDomain = { kind: 'auto' };
  if (candidate.domain?.kind === 'custom') {
    const min = Number(candidate.domain.min);
    const max = Number(candidate.domain.max);
    if (Number.isFinite(min) && Number.isFinite(max) && min < max) {
      domain = { kind: 'custom', min, max };
    }
  }

  const stops = Array.isArray(candidate.stops)
    ? candidate.stops
      .map(stop => ({
        value: Number(stop?.value),
        color: normalizeHexColor(stop?.color, '')
      }))
      .filter(stop => Number.isFinite(stop.value) && !!stop.color)
      .sort((left, right) => left.value - right.value)
    : undefined;

  const hasStrictlyIncreasingStops = !!stops
    && stops.length >= 2
    && stops.every((stop, index) => index === 0 || stop.value > stops[index - 1].value);

  return {
    mode,
    domain,
    stops: hasStrictlyIncreasingStops ? stops : undefined,
    missingColor: normalizeHexColor(candidate.missingColor, DEFAULT_CONTINUOUS_MISSING_COLOR)
  };
}

export function normalizeVariableColorScaleState(value: unknown): VariableColorScaleState {
  const candidate = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Partial<VariableColorScaleState>
    : {};
  const state = createVariableColorScaleState();

  (['node', 'link'] as VariableColorTarget[]).forEach(target => {
    const targetValue = candidate[target];
    if (!targetValue || typeof targetValue !== 'object' || Array.isArray(targetValue)) {
      return;
    }

    Object.entries(targetValue).forEach(([field, config]) => {
      if (field) {
        state[target][field] = normalizeVariableColorScaleConfig(config);
      }
    });
  });

  return state;
}

function buildDefaultStops(min: number, max: number): ContinuousColorStop[] {
  if (min === max) {
    return [
      { value: min, color: DEFAULT_CONTINUOUS_COLORS[0] },
      { value: min, color: DEFAULT_CONTINUOUS_COLORS[1] },
      { value: min, color: DEFAULT_CONTINUOUS_COLORS[2] }
    ];
  }

  return [
    { value: min, color: DEFAULT_CONTINUOUS_COLORS[0] },
    { value: min + ((max - min) / 2), color: DEFAULT_CONTINUOUS_COLORS[1] },
    { value: max, color: DEFAULT_CONTINUOUS_COLORS[2] }
  ];
}

function resolveStops(config: VariableColorScaleConfig, min: number, max: number): ContinuousColorStop[] {
  const configuredStops = config.stops;
  if (!configuredStops || configuredStops.length < 2 || min === max) {
    return buildDefaultStops(min, max);
  }

  const sortedStops = configuredStops
    .filter(stop => Number.isFinite(stop.value) && HEX_COLOR_PATTERN.test(stop.color))
    .sort((left, right) => left.value - right.value);
  if (sortedStops.length < 2) {
    return buildDefaultStops(min, max);
  }

  const interiorStops = sortedStops
    .slice(1, -1)
    .filter(stop => stop.value > min && stop.value < max);

  return [
    { value: min, color: sortedStops[0].color },
    ...interiorStops,
    { value: max, color: sortedStops[sortedStops.length - 1].color }
  ];
}

export function resolveVariableColorScale(
  items: any[],
  field: string,
  rawConfig?: VariableColorScaleConfig
): ResolvedVariableColorScale {
  const config = normalizeVariableColorScaleConfig(rawConfig);
  const summary = inspectContinuousValues(items, field);
  const requestedMode = config.mode;
  const useContinuous = summary.canUseContinuous && (
    requestedMode === 'continuous'
    || (requestedMode === 'auto' && summary.autoUsesContinuous)
  );
  const missingColor = config.missingColor;

  if (!useContinuous || summary.min === null || summary.max === null) {
    return {
      field,
      requestedMode,
      mode: 'categorical',
      summary,
      domain: null,
      stops: [],
      missingColor,
      constant: false,
      colorMap: () => missingColor
    };
  }

  const min = config.domain.kind === 'custom' ? config.domain.min : summary.min;
  const max = config.domain.kind === 'custom' ? config.domain.max : summary.max;
  const constant = min === max;
  const stops = resolveStops(config, min, max);

  if (constant) {
    const midpointColor = stops[Math.floor(stops.length / 2)]?.color || DEFAULT_CONTINUOUS_COLORS[1];
    return {
      field,
      requestedMode,
      mode: 'continuous',
      summary,
      domain: { min, max },
      stops,
      missingColor,
      constant: true,
      colorMap: value => parseContinuousNumber(value).kind === 'number' ? midpointColor : missingColor
    };
  }

  const scale = d3.scaleLinear<string>()
    .domain(stops.map(stop => stop.value))
    .range(stops.map(stop => stop.color))
    .interpolate(d3.interpolateLab)
    .clamp(true);

  return {
    field,
    requestedMode,
    mode: 'continuous',
    summary,
    domain: { min, max },
    stops,
    missingColor,
    constant: false,
    colorMap: value => {
      const parsed = parseContinuousNumber(value);
      return parsed.kind === 'number' ? scale(parsed.value) : missingColor;
    }
  };
}

export function buildContinuousGradientCss(resolved: ResolvedVariableColorScale, sampleCount = 32): string {
  if (resolved.mode !== 'continuous' || !resolved.domain) {
    return resolved.missingColor;
  }

  if (resolved.constant) {
    return resolved.colorMap(resolved.domain.min);
  }

  const count = Math.max(2, sampleCount);
  const span = resolved.domain.max - resolved.domain.min;
  const samples = Array.from({ length: count }, (_, index) => {
    const fraction = index / (count - 1);
    const value = resolved.domain.min + span * fraction;
    return `${resolved.colorMap(value)} ${(fraction * 100).toFixed(2)}%`;
  });

  return `linear-gradient(to right, ${samples.join(', ')})`;
}
