import { buildMixedNodeStripePatternDefinition } from './node-shapes';

export interface PieChartSlice {
  label: string;
  count: number;
  color: string;
  alpha?: number;
  segments?: PieChartFillSegment[];
}

export interface PieChartFillSegment {
  value?: any;
  color: string;
  alpha?: number;
  weight?: number;
}

export interface SegmentedPieChartStyle {
  color: string;
  alpha?: number;
  segments?: PieChartFillSegment[];
}

export interface PieChartPathSlice extends PieChartSlice {
  path: string;
}

export function buildPieChartSlicesWithSegmentedFills(
  counts: Array<{ label: any; count: number }>,
  resolveStyle: (label: any) => SegmentedPieChartStyle
): PieChartSlice[] {
  const slices: PieChartSlice[] = [];

  (counts || []).forEach(countEntry => {
    const count = Number(countEntry?.count);
    if (!Number.isFinite(count) || count <= 0) {
      return;
    }

    const style = resolveStyle(countEntry.label);
    const segments = (style?.segments || [])
      .map(segment => {
        const rawWeight = Number(segment?.weight);
        return {
          ...segment,
          weight: Number.isFinite(rawWeight) && rawWeight > 0 ? rawWeight : 1
        };
      })
      .filter(segment => typeof segment.color === 'string' && segment.color && segment.weight > 0);

    slices.push({
      label: String(countEntry.label ?? ''),
      count,
      color: style.color,
      alpha: style.alpha,
      segments: segments.length > 1
        ? segments.map(segment => ({
            ...segment,
            alpha: segment.alpha ?? style.alpha
          }))
        : undefined
    });
  });

  return slices;
}

export function getPieChartTotalCount(slices: PieChartSlice[]): number {
  return (slices || []).reduce((total, slice) => {
    const count = Number(slice?.count);
    return Number.isFinite(count) && count > 0 ? total + count : total;
  }, 0);
}

export function getValidPieChartSlices(slices: PieChartSlice[]): PieChartSlice[] {
  return (slices || []).filter(slice => {
    const count = Number(slice?.count);
    return Number.isFinite(count) && count > 0;
  });
}

export function hasCompositePieChartFill(slices: PieChartSlice[]): boolean {
  const validSlices = getValidPieChartSlices(slices);
  return validSlices.length > 1
    || validSlices.some(slice => (slice.segments || []).length > 1);
}

export function buildPieChartPathSlices(
  slices: PieChartSlice[],
  centerX: number,
  centerY: number,
  radius: number
): PieChartPathSlice[] {
  const totalCount = getPieChartTotalCount(slices);
  const validSlices = getValidPieChartSlices(slices);
  const safeRadius = Math.max(0, Number(radius) || 0);

  if (totalCount <= 0 || safeRadius <= 0) {
    return [];
  }

  if (validSlices.length === 1) {
    const topY = centerY - safeRadius;
    const bottomY = centerY + safeRadius;
    return [{
      ...validSlices[0],
      path: `M ${centerX} ${topY} A ${safeRadius} ${safeRadius} 0 1 1 ${centerX} ${bottomY} A ${safeRadius} ${safeRadius} 0 1 1 ${centerX} ${topY} Z`
    }];
  }

  let cumulative = 0;
  let previousAngle = -Math.PI / 2;

  return validSlices.map(slice => {
    const proportion = Number(slice.count) / totalCount;
    cumulative += proportion;
    const endAngle = (-Math.PI / 2) + (2 * Math.PI * cumulative);
    const startX = centerX + (safeRadius * Math.cos(previousAngle));
    const startY = centerY + (safeRadius * Math.sin(previousAngle));
    const endX = centerX + (safeRadius * Math.cos(endAngle));
    const endY = centerY + (safeRadius * Math.sin(endAngle));
    const largeArcFlag = proportion > 0.5 ? 1 : 0;
    previousAngle = endAngle;

    return {
      ...slice,
      path: `M ${centerX} ${centerY} L ${startX} ${startY} A ${safeRadius} ${safeRadius} 0 ${largeArcFlag} 1 ${endX} ${endY} Z`
    };
  });
}

export function buildPieChartPatternDef(patternId: string, slices: PieChartSlice[], renderedSize: number = 24): string {
  const totalCount = getPieChartTotalCount(slices);
  const validSlices = getValidPieChartSlices(slices);

  if (!patternId || totalCount <= 0 || !hasCompositePieChartFill(validSlices)) {
    return '';
  }

  const pathSlices = buildPieChartPathSlices(validSlices, 0, 0, 1);
  const stripedFillDefs: string[] = [];
  const paths = pathSlices.map((slice, sliceIndex) => {
    const segments = (slice.segments || []).filter(segment => {
      const weight = Number(segment?.weight ?? 1);
      return typeof segment?.color === 'string' && !!segment.color && Number.isFinite(weight) && weight > 0;
    });
    const alpha = Number(slice.alpha);
    const fillOpacity = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1;

    if (segments.length < 2) {
      return `<path d='${slice.path}' fill='${slice.color}' fill-opacity='${fillOpacity}' />`;
    }

    const stripedPatternId = `${patternId}-stripes-${sliceIndex}`;
    stripedFillDefs.push(buildMixedNodeStripePatternDefinition(
      stripedPatternId,
      segments,
      fillOpacity,
      2,
      renderedSize
    ));
    return `<path d='${slice.path}' fill='url(#${stripedPatternId})' fill-opacity='1' />`;
  }).join('');

  return `${stripedFillDefs.join('')}<pattern id='${patternId}' viewBox='-1 -1 2 2' width='100%' height='100%'>${paths}</pattern>`;
}

export function buildPieChartSvgDataUri(patternId: string, size: number, slices: PieChartSlice[]): string {
  const safeSize = Math.max(1, Number(size) || 1);
  const patternDef = buildPieChartPatternDef(patternId, slices, safeSize);

  if (!patternDef) {
    return '';
  }

  const svgPattern = `<svg width='${safeSize}' height='${safeSize}' xmlns='http://www.w3.org/2000/svg'><defs>${patternDef}</defs><circle fill="url(#${patternId})" cx='${safeSize / 2}' cy='${safeSize / 2}' r='${safeSize / 2}'/></svg>`;
  return 'data:image/svg+xml;base64,' + btoa(svgPattern);
}
