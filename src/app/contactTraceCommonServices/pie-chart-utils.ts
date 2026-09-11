export interface PieChartSlice {
  label: string;
  count: number;
  color: string;
  alpha?: number;
}

export interface PieChartPathSlice extends PieChartSlice {
  path: string;
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

export function buildPieChartPatternDef(patternId: string, slices: PieChartSlice[]): string {
  const totalCount = getPieChartTotalCount(slices);
  const validSlices = getValidPieChartSlices(slices);

  if (!patternId || totalCount <= 0 || validSlices.length < 2) {
    return '';
  }

  const coordinates: Array<[number, number]> = [];
  const proportions: number[] = [];
  let cumulative = 0;

  validSlices.forEach(slice => {
    const proportion = Number(slice.count) / totalCount;
    cumulative += proportion;
    proportions.push(proportion);
    coordinates.push([
      Math.cos(2 * Math.PI * cumulative),
      Math.sin(2 * Math.PI * cumulative)
    ]);
  });

  let patternString = `<pattern id='${patternId}' viewBox='-1 -1 2 2' style='transform: rotate(-.25turn)' width='100%' height='100%'>`;

  for (let i = 0; i < coordinates.length; i++) {
    const arcStart = i === 0 ? '1 0' : `${coordinates[i - 1][0]} ${coordinates[i - 1][1]}`;
    const largeArcFlag = proportions[i] > 0.5 ? 1 : 0;
    const arcEnd = i === coordinates.length - 1 ? '1 0' : `${coordinates[i][0]} ${coordinates[i][1]}`;
    const alpha = Number(validSlices[i].alpha);
    const fillOpacity = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1;
    patternString += `<path d='M 0 0 L ${arcStart} A 1 1 0 ${largeArcFlag} 1 ${arcEnd} L 0 0' fill='${validSlices[i].color}' fill-opacity='${fillOpacity}' />`;
  }

  patternString += '</pattern>';
  return patternString;
}

export function buildPieChartSvgDataUri(patternId: string, size: number, slices: PieChartSlice[]): string {
  const safeSize = Math.max(1, Number(size) || 1);
  const patternDef = buildPieChartPatternDef(patternId, slices);

  if (!patternDef) {
    return '';
  }

  const svgPattern = `<svg width='${safeSize}' height='${safeSize}' xmlns='http://www.w3.org/2000/svg'><defs>${patternDef}</defs><circle fill="url(#${patternId})" cx='${safeSize / 2}' cy='${safeSize / 2}' r='${safeSize / 2}'/></svg>`;
  return 'data:image/svg+xml;base64,' + btoa(svgPattern);
}
