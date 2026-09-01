import { MIXED_NODE_RING_WIDTH_RADIUS_FRACTION } from './node-shapes';

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
  startFraction: number;
  endFraction: number;
}

export interface MixedPieChartRingPathSegment extends PieChartFillSegment {
  path: string;
  startFraction: number;
  endFraction: number;
}

export const MIXED_AGGREGATE_RING_WIDTH_RADIUS_FRACTION = MIXED_NODE_RING_WIDTH_RADIUS_FRACTION;
export const PIE_CHART_SLICE_SEPARATOR_WIDTH_PX = 1;

export function getMixedAggregateRingInnerRadius(outerRadius: number): number {
  const safeOuterRadius = Math.max(0, Number(outerRadius) || 0);
  return safeOuterRadius * (1 - MIXED_AGGREGATE_RING_WIDTH_RADIUS_FRACTION);
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
      startFraction: 0,
      endFraction: 1,
      path: `M ${centerX} ${topY} A ${safeRadius} ${safeRadius} 0 1 1 ${centerX} ${bottomY} A ${safeRadius} ${safeRadius} 0 1 1 ${centerX} ${topY} Z`
    }];
  }

  let cumulative = 0;
  let previousAngle = -Math.PI / 2;

  return validSlices.map(slice => {
    const startFraction = cumulative;
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
      startFraction,
      endFraction: cumulative,
      path: `M ${centerX} ${centerY} L ${startX} ${startY} A ${safeRadius} ${safeRadius} 0 ${largeArcFlag} 1 ${endX} ${endY} Z`
    };
  });
}

function formatPieChartNumber(value: number): string {
  return Number(value.toFixed(6)).toString();
}

export function buildPieChartSliceSeparatorPaths(
  slices: PieChartSlice[],
  centerX: number,
  centerY: number,
  radius: number
): string[] {
  const pathSlices = buildPieChartPathSlices(slices, centerX, centerY, radius);
  if (pathSlices.length <= 1) {
    return [];
  }

  return pathSlices.map(slice => {
    const angle = -Math.PI / 2 + slice.startFraction * 2 * Math.PI;
    const outerX = centerX + radius * Math.cos(angle);
    const outerY = centerY + radius * Math.sin(angle);
    return `M ${formatPieChartNumber(centerX)} ${formatPieChartNumber(centerY)} L ${formatPieChartNumber(outerX)} ${formatPieChartNumber(outerY)}`;
  });
}

export function buildAnnularPieChartSlicePath(
  centerX: number,
  centerY: number,
  outerRadius: number,
  innerRadius: number,
  startFraction: number,
  endFraction: number
): string {
  const safeOuterRadius = Math.max(0, Number(outerRadius) || 0);
  const safeInnerRadius = Math.max(0, Math.min(safeOuterRadius, Number(innerRadius) || 0));
  const safeStartFraction = Math.max(0, Math.min(1, Number(startFraction) || 0));
  const safeEndFraction = Math.max(safeStartFraction, Math.min(1, Number(endFraction) || 0));
  const fraction = safeEndFraction - safeStartFraction;

  if (safeOuterRadius <= 0 || fraction <= 0) {
    return '';
  }

  if (safeInnerRadius <= 0) {
    const startAngle = -Math.PI / 2 + safeStartFraction * 2 * Math.PI;
    const endAngle = -Math.PI / 2 + safeEndFraction * 2 * Math.PI;
    const startX = centerX + safeOuterRadius * Math.cos(startAngle);
    const startY = centerY + safeOuterRadius * Math.sin(startAngle);
    const endX = centerX + safeOuterRadius * Math.cos(endAngle);
    const endY = centerY + safeOuterRadius * Math.sin(endAngle);
    const largeArcFlag = fraction > 0.5 ? 1 : 0;
    return `M ${formatPieChartNumber(centerX)} ${formatPieChartNumber(centerY)} L ${formatPieChartNumber(startX)} ${formatPieChartNumber(startY)} A ${formatPieChartNumber(safeOuterRadius)} ${formatPieChartNumber(safeOuterRadius)} 0 ${largeArcFlag} 1 ${formatPieChartNumber(endX)} ${formatPieChartNumber(endY)} Z`;
  }

  if (fraction >= 1 - Number.EPSILON) {
    const outerTopY = centerY - safeOuterRadius;
    const outerBottomY = centerY + safeOuterRadius;
    const innerTopY = centerY - safeInnerRadius;
    const innerBottomY = centerY + safeInnerRadius;
    return [
      `M ${formatPieChartNumber(centerX)} ${formatPieChartNumber(outerTopY)}`,
      `A ${formatPieChartNumber(safeOuterRadius)} ${formatPieChartNumber(safeOuterRadius)} 0 1 1 ${formatPieChartNumber(centerX)} ${formatPieChartNumber(outerBottomY)}`,
      `A ${formatPieChartNumber(safeOuterRadius)} ${formatPieChartNumber(safeOuterRadius)} 0 1 1 ${formatPieChartNumber(centerX)} ${formatPieChartNumber(outerTopY)}`,
      `L ${formatPieChartNumber(centerX)} ${formatPieChartNumber(innerTopY)}`,
      `A ${formatPieChartNumber(safeInnerRadius)} ${formatPieChartNumber(safeInnerRadius)} 0 1 0 ${formatPieChartNumber(centerX)} ${formatPieChartNumber(innerBottomY)}`,
      `A ${formatPieChartNumber(safeInnerRadius)} ${formatPieChartNumber(safeInnerRadius)} 0 1 0 ${formatPieChartNumber(centerX)} ${formatPieChartNumber(innerTopY)}`,
      'Z'
    ].join(' ');
  }

  const startAngle = -Math.PI / 2 + safeStartFraction * 2 * Math.PI;
  const endAngle = -Math.PI / 2 + safeEndFraction * 2 * Math.PI;
  const outerStartX = centerX + safeOuterRadius * Math.cos(startAngle);
  const outerStartY = centerY + safeOuterRadius * Math.sin(startAngle);
  const outerEndX = centerX + safeOuterRadius * Math.cos(endAngle);
  const outerEndY = centerY + safeOuterRadius * Math.sin(endAngle);
  const innerStartX = centerX + safeInnerRadius * Math.cos(startAngle);
  const innerStartY = centerY + safeInnerRadius * Math.sin(startAngle);
  const innerEndX = centerX + safeInnerRadius * Math.cos(endAngle);
  const innerEndY = centerY + safeInnerRadius * Math.sin(endAngle);
  const largeArcFlag = fraction > 0.5 ? 1 : 0;

  return [
    `M ${formatPieChartNumber(outerStartX)} ${formatPieChartNumber(outerStartY)}`,
    `A ${formatPieChartNumber(safeOuterRadius)} ${formatPieChartNumber(safeOuterRadius)} 0 ${largeArcFlag} 1 ${formatPieChartNumber(outerEndX)} ${formatPieChartNumber(outerEndY)}`,
    `L ${formatPieChartNumber(innerEndX)} ${formatPieChartNumber(innerEndY)}`,
    `A ${formatPieChartNumber(safeInnerRadius)} ${formatPieChartNumber(safeInnerRadius)} 0 ${largeArcFlag} 0 ${formatPieChartNumber(innerStartX)} ${formatPieChartNumber(innerStartY)}`,
    'Z'
  ].join(' ');
}

export function buildEvenMixedPieChartRingSegments(
  segments: PieChartFillSegment[],
  startFraction: number,
  endFraction: number,
  centerX: number,
  centerY: number,
  outerRadius: number,
  innerRadius: number
): MixedPieChartRingPathSegment[] {
  const validSegments = (segments || []).filter(segment => typeof segment?.color === 'string' && !!segment.color);
  if (validSegments.length < 2) {
    return [];
  }

  const sliceFraction = Math.max(0, endFraction - startFraction);
  return validSegments.map((segment, index) => {
    const segmentStartFraction = startFraction + sliceFraction * index / validSegments.length;
    const segmentEndFraction = index === validSegments.length - 1
      ? endFraction
      : startFraction + sliceFraction * (index + 1) / validSegments.length;
    return {
      ...segment,
      startFraction: segmentStartFraction,
      endFraction: segmentEndFraction,
      path: buildAnnularPieChartSlicePath(
        centerX,
        centerY,
        outerRadius,
        innerRadius,
        segmentStartFraction,
        segmentEndFraction
      )
    };
  });
}

export function buildPieChartPatternDef(patternId: string, slices: PieChartSlice[], renderedSize: number = 24): string {
  const totalCount = getPieChartTotalCount(slices);
  const validSlices = getValidPieChartSlices(slices);

  if (!patternId || totalCount <= 0 || validSlices.length === 0) {
    return '';
  }

  const pathSlices = buildPieChartPathSlices(validSlices, 0, 0, 1);
  const mixedRingInnerRadius = getMixedAggregateRingInnerRadius(1);
  const paths = pathSlices.map((slice) => {
    const alpha = Number(slice.alpha);
    const fillOpacity = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1;
    const mixedRingSegments = buildEvenMixedPieChartRingSegments(
      slice.segments || [],
      slice.startFraction,
      slice.endFraction,
      0,
      0,
      1,
      mixedRingInnerRadius
    );

    if (mixedRingSegments.length < 2) {
      return `<path d='${slice.path}' fill='${slice.color}' fill-opacity='${fillOpacity}' data-mt-solid-aggregate-slice='true' />`;
    }

    const hollowSlice = `<path d='${slice.path}' fill='#ffffff' fill-opacity='1' data-mt-contains-mixed-infection='true' data-mt-mixed-hollow-slice='true' />`;
    const ringSegments = mixedRingSegments.map((segment, index) => {
      const segmentAlpha = Number(segment.alpha ?? slice.alpha);
      const segmentOpacity = Number.isFinite(segmentAlpha) ? Math.max(0, Math.min(1, segmentAlpha)) : 1;
      return `<path d='${segment.path}' fill='${segment.color}' fill-opacity='${segmentOpacity}' data-mt-mixed-ring-segment='${index}' />`;
    }).join('');
    return `${hollowSlice}${ringSegments}`;
  }).join('');

  const safeRenderedSize = Math.max(1, Number(renderedSize) || 1);
  const separatorStrokeWidth = 2 * PIE_CHART_SLICE_SEPARATOR_WIDTH_PX / safeRenderedSize;
  const sliceSeparators = buildPieChartSliceSeparatorPaths(validSlices, 0, 0, 1)
    .map((path, index) => `<path d='${path}' fill='none' stroke='#000000' stroke-width='${formatPieChartNumber(separatorStrokeWidth)}' stroke-linecap='butt' data-mt-aggregate-slice-separator='${index}' />`)
    .join('');

  return `<pattern id='${patternId}' viewBox='-1 -1 2 2' width='100%' height='100%'>${paths}${sliceSeparators}</pattern>`;
}

export function buildPieChartSvgDataUri(patternId: string, size: number, slices: PieChartSlice[]): string {
  const safeSize = Math.max(1, Number(size) || 1);
  const patternDef = buildPieChartPatternDef(patternId, slices, safeSize);

  if (!patternDef) {
    return '';
  }

  const center = safeSize / 2;
  const outlineWidth = Math.min(3, Math.max(1.5, safeSize * 0.055));
  const outerOutlineRadius = Math.max(0, center - (outlineWidth / 2));
  const aggregateOutline = `<circle data-mt-aggregate-outline='outer' fill='none' stroke='#222222' stroke-width='${outlineWidth}' cx='${center}' cy='${center}' r='${outerOutlineRadius}'/>`;
  const svgPattern = `<svg width='${safeSize}' height='${safeSize}' xmlns='http://www.w3.org/2000/svg'><defs>${patternDef}</defs><circle fill="url(#${patternId})" cx='${center}' cy='${center}' r='${center}'/>${aggregateOutline}</svg>`;
  return 'data:image/svg+xml;base64,' + btoa(svgPattern);
}
