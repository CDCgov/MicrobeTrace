import {
  buildCategoricalComposition,
  type CategoricalCompositionSegment,
} from './network-grouping.model';

export type NetworkQcSeverity = 'none' | 'info' | 'warning' | 'error';

export interface NetworkNodeFeatureFields {
  compositionField?: string | null;
  qcStatusField?: string | null;
  qcSeverityField?: string | null;
  qcReasonField?: string | null;
  uncertaintyField?: string | null;
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

export interface NetworkQcOverlay {
  status: string;
  severity: NetworkQcSeverity;
  reason: string | null;
  color: string;
  symbol: string;
}

export interface NetworkNodeVisualFeatures {
  compositionField: string | null;
  donutSegments: NetworkDonutSegment[];
  qc: NetworkQcOverlay | null;
  uncertainty: number | null;
  accessibleLabel: string;
}

export const EMPTY_NETWORK_NODE_VISUAL_FEATURES: NetworkNodeVisualFeatures = {
  compositionField: null,
  donutSegments: [],
  qc: null,
  uncertainty: null,
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

function normalizedText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized ? normalized : null;
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

function resolveQcSeverity(status: string | null, value: unknown): NetworkQcSeverity {
  const normalized = String(value ?? status ?? '').trim().toLowerCase();
  if (!normalized) return 'none';
  if (/fail|failed|error|critical|invalid|reject|high/.test(normalized)) return 'error';
  if (/warn|warning|review|caution|medium|uncertain/.test(normalized)) return 'warning';
  if (/info|note|low|pending|unknown/.test(normalized)) return 'info';
  return 'none';
}

function qcPresentation(severity: NetworkQcSeverity): Pick<NetworkQcOverlay, 'color' | 'symbol'> {
  switch (severity) {
    case 'error': return { color: '#dc2626', symbol: '!' };
    case 'warning': return { color: '#d97706', symbol: '!' };
    case 'info': return { color: '#2563eb', symbol: 'i' };
    default: return { color: '#16a34a', symbol: '✓' };
  }
}

function normalizeUncertainty(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return Math.max(0, Math.min(1, numeric));
  const normalized = String(value).trim().toLowerCase();
  if (/high|very uncertain/.test(normalized)) return 0.85;
  if (/medium|moderate|uncertain/.test(normalized)) return 0.5;
  if (/low|minor/.test(normalized)) return 0.25;
  return null;
}

function buildAccessibleLabel(
  compositionField: string | null,
  donutSegments: NetworkDonutSegment[],
  qc: NetworkQcOverlay | null,
  uncertainty: number | null,
): string {
  const accessibleParts: string[] = [];
  if (compositionField && donutSegments.length > 1) {
    accessibleParts.push(`${compositionField}: ${donutSegments.map(segment =>
      `${segment.value} ${Math.round(segment.fraction * 100)}%`).join(', ')}`);
  }
  if (qc) {
    accessibleParts.push(`QC ${qc.status}${qc.reason ? `: ${qc.reason}` : ''}`);
  }
  if (uncertainty !== null) {
    accessibleParts.push(`uncertainty ${Math.round(uncertainty * 100)}%`);
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
      features.qc,
      features.uncertainty,
    ),
  };
}

export function buildNetworkNodeVisualFeatures(
  values: Record<string, unknown>,
  fields: NetworkNodeFeatureFields,
): NetworkNodeVisualFeatures {
  const compositionField = configuredField(fields.compositionField);
  const qcStatusField = configuredField(fields.qcStatusField);
  const qcSeverityField = configuredField(fields.qcSeverityField);
  const qcReasonField = configuredField(fields.qcReasonField);
  const uncertaintyField = configuredField(fields.uncertaintyField);

  const donutSegments = compositionField
    ? buildCategoricalComposition(parseNetworkCategoricalValues(values[compositionField]))
      .map(segment => ({ ...segment, color: colorForNetworkCategory(segment.value) }))
    : [];

  const status = qcStatusField ? normalizedText(values[qcStatusField]) : null;
  const explicitSeverity = qcSeverityField ? values[qcSeverityField] : null;
  const reason = qcReasonField ? normalizedText(values[qcReasonField]) : null;
  const hasQcValue = Boolean(status || normalizedText(explicitSeverity) || reason);
  const severity = resolveQcSeverity(status, explicitSeverity);
  const qc = hasQcValue
    ? {
      status: status || severity,
      severity,
      reason,
      ...qcPresentation(severity),
    }
    : null;
  const uncertainty = uncertaintyField ? normalizeUncertainty(values[uncertaintyField]) : null;

  return {
    compositionField,
    donutSegments,
    qc,
    uncertainty,
    accessibleLabel: buildAccessibleLabel(compositionField, donutSegments, qc, uncertainty),
  };
}

export function hasMixedValueDonut(features: NetworkNodeVisualFeatures): boolean {
  return features.donutSegments.length > 1;
}

export function hasNetworkNodeVisualFeatures(features: NetworkNodeVisualFeatures): boolean {
  return hasMixedValueDonut(features) || Boolean(features.qc) || features.uncertainty !== null;
}
