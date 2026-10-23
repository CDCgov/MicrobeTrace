import {
  buildCategoricalComposition,
  type CategoricalCompositionSegment,
} from './network-grouping.model';

export interface NetworkNodeFeatureFields {
  compositionField?: string | null;
}

export interface NetworkDonutSegment extends CategoricalCompositionSegment {
  color: string;
  alpha?: number;
}

export interface NetworkCompositionSegmentInput {
  value: string;
  color: string;
  alpha?: number;
  weight?: number;
}

export interface NetworkNodeVisualFeatures {
  compositionField: string | null;
  donutSegments: NetworkDonutSegment[];
  accessibleLabel: string;
}

export const EMPTY_NETWORK_NODE_VISUAL_FEATURES: NetworkNodeVisualFeatures = {
  compositionField: null,
  donutSegments: [],
  accessibleLabel: '',
};

const DONUT_PALETTE = [
  '#2563eb', '#db2777', '#16a34a', '#ea580c', '#7c3aed',
  '#0891b2', '#ca8a04', '#be123c', '#4f46e5', '#0f766e',
];

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function configuredField(field: string | null | undefined): string | null {
  const normalized = String(field ?? '').trim();
  return !normalized || normalized.toLowerCase() === 'none' ? null : normalized;
}

/**
 * Accepts native arrays, JSON-array strings from MT JSON ingestion, and the
 * pipe/semicolon-delimited values commonly found in tabular metadata.
 */
export function parseNetworkCategoricalValues(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return value === undefined || value === null ? [] : [value];

  const trimmed = value.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Treat malformed JSON-looking values as ordinary metadata below.
    }
  }

  const delimiter = trimmed.includes('|') ? '|' : trimmed.includes(';') ? ';' : null;
  return delimiter
    ? trimmed.split(delimiter).map(item => item.trim()).filter(Boolean)
    : [trimmed];
}

export function colorForNetworkCategory(value: string): string {
  return DONUT_PALETTE[stableHash(value) % DONUT_PALETTE.length];
}

function buildAccessibleLabel(
  compositionField: string | null,
  donutSegments: NetworkDonutSegment[],
): string {
  const accessibleParts: string[] = [];
  if (compositionField && donutSegments.length > 1) {
    accessibleParts.push(`${compositionField}: ${donutSegments.map(segment =>
      `${segment.value} ${Math.round(segment.fraction * 100)}%`).join(', ')}`);
  }
  return accessibleParts.join('; ');
}

/**
 * Replaces the generic composition parsing with the application's canonical
 * mixed-color segments, preserving configured colors, alpha, and weights.
 */
export function applyNetworkNodeCompositionSegments(
  features: NetworkNodeVisualFeatures,
  compositionField: string | null | undefined,
  segments: NetworkCompositionSegmentInput[] | null | undefined,
): NetworkNodeVisualFeatures {
  const configuredCompositionField = configuredField(compositionField);
  const validSegments = (segments || []).filter(segment => (
    Boolean(String(segment?.value ?? '').trim())
    && Boolean(String(segment?.color ?? '').trim())
  ));
  const totalWeight = validSegments.reduce((sum, segment) => {
    const weight = Number(segment.weight);
    return sum + (Number.isFinite(weight) && weight > 0 ? weight : 1);
  }, 0);
  const donutSegments = validSegments.length > 1 && totalWeight > 0
    ? validSegments.map(segment => {
        const requestedWeight = Number(segment.weight);
        const weight = Number.isFinite(requestedWeight) && requestedWeight > 0
          ? requestedWeight
          : 1;
        return {
          value: String(segment.value),
          count: weight,
          fraction: weight / totalWeight,
          color: String(segment.color),
          alpha: Number.isFinite(Number(segment.alpha))
            ? Math.max(0, Math.min(1, Number(segment.alpha)))
            : 1,
        };
      })
    : [];

  return {
    ...features,
    compositionField: configuredCompositionField,
    donutSegments,
    accessibleLabel: buildAccessibleLabel(
      configuredCompositionField,
      donutSegments,
    ),
  };
}

export function buildNetworkNodeVisualFeatures(
  values: Record<string, unknown>,
  fields: NetworkNodeFeatureFields,
): NetworkNodeVisualFeatures {
  const compositionField = configuredField(fields.compositionField);

  const donutSegments = compositionField
    ? buildCategoricalComposition(parseNetworkCategoricalValues(values[compositionField]))
      .map(segment => ({ ...segment, color: colorForNetworkCategory(segment.value) }))
    : [];

  return {
    compositionField,
    donutSegments,
    accessibleLabel: buildAccessibleLabel(compositionField, donutSegments),
  };
}

export function hasMixedValueDonut(features: NetworkNodeVisualFeatures): boolean {
  return features.donutSegments.length > 1;
}

export function hasNetworkNodeVisualFeatures(features: NetworkNodeVisualFeatures): boolean {
  return hasMixedValueDonut(features);
}
