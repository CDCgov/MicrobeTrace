import moment from 'moment';

export interface EvolutionaryRatePoint {
  id: string;
  node: any;
  date: Date;
  decimalYear: number;
  distance: number;
}

export interface EvolutionaryRateResidual {
  point: EvolutionaryRatePoint;
  fittedDistance: number;
  residual: number;
  absoluteResidual: number;
  residualScore: number | null;
  isOutlier: boolean;
}

export const EVOLUTIONARY_RATE_OUTLIER_RMSE_MULTIPLIER = 2;
export const EVOLUTIONARY_RATE_OUTLIER_MINIMUM_POINTS = 3;

export interface EvolutionaryRateAnalysis {
  points: EvolutionaryRatePoint[];
  includedCount: number;
  excludedCount: number;
  minDate: Date | null;
  maxDate: Date | null;
  dateSpanYears: number | null;
  slope: number | null;
  intercept: number | null;
  correlation: number | null;
  rSquared: number | null;
  residualMeanSquared: number | null;
  residualRootMeanSquared: number | null;
  outlierThreshold: number | null;
  residuals: EvolutionaryRateResidual[];
  outliers: EvolutionaryRateResidual[];
  tmrcaDate: Date | null;
}

function utcStartOfYear(year: number): Date {
  const date = new Date(0);
  date.setUTCFullYear(year, 0, 1);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

export function parseCalendarDate(value: any): Date | null {
  if (
    value === null ||
    value === undefined ||
    typeof value === 'boolean' ||
    Array.isArray(value) ||
    (typeof value === 'object' && !(value instanceof Date)) ||
    !['string', 'number', 'object'].includes(typeof value)
  ) {
    return null;
  }

  if (typeof value === 'string' && (value.trim() === '' || value.trim().toLowerCase() === 'null')) {
    return null;
  }

  const parsed = moment(value);
  if (!parsed.isValid()) {
    return null;
  }

  const normalized = new Date(0);
  normalized.setUTCFullYear(parsed.year(), parsed.month(), parsed.date());
  normalized.setUTCHours(0, 0, 0, 0);
  return Number.isFinite(normalized.getTime()) ? normalized : null;
}

export function calendarDateToDecimalYear(date: Date): number {
  const year = date.getUTCFullYear();
  const start = utcStartOfYear(year).getTime();
  const end = utcStartOfYear(year + 1).getTime();
  return year + ((date.getTime() - start) / (end - start));
}

export function decimalYearToCalendarDate(decimalYear: number): Date | null {
  if (!Number.isFinite(decimalYear)) {
    return null;
  }

  const year = Math.floor(decimalYear);
  if (year < 0 || year > 9999) {
    return null;
  }

  const start = utcStartOfYear(year).getTime();
  const end = utcStartOfYear(year + 1).getTime();
  const result = new Date(start + ((decimalYear - year) * (end - start)));
  return Number.isFinite(result.getTime()) ? result : null;
}

export function formatCalendarDate(date: Date | null | undefined): string {
  return date && Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : 'N/A';
}

export function scaleEvolutionaryRateForDisplay(
  analysis: EvolutionaryRateAnalysis,
  usePercentage: boolean
): EvolutionaryRateAnalysis {
  if (!usePercentage) {
    return analysis;
  }

  const residuals = analysis.residuals.map(item => ({
    ...item,
    point: {
      ...item.point,
      distance: item.point.distance * 100,
    },
    fittedDistance: item.fittedDistance * 100,
    residual: item.residual * 100,
    absoluteResidual: item.absoluteResidual * 100,
  }));

  return {
    ...analysis,
    points: analysis.points.map(point => ({
      ...point,
      distance: point.distance * 100,
    })),
    slope: analysis.slope === null ? null : analysis.slope * 100,
    intercept: analysis.intercept === null ? null : analysis.intercept * 100,
    residualMeanSquared: analysis.residualMeanSquared === null
      ? null
      : analysis.residualMeanSquared * 10000,
    residualRootMeanSquared: analysis.residualRootMeanSquared === null
      ? null
      : analysis.residualRootMeanSquared * 100,
    outlierThreshold: analysis.outlierThreshold === null
      ? null
      : analysis.outlierThreshold * 100,
    residuals,
    outliers: residuals.filter(item => item.isOutlier),
  };
}

export function coerceFiniteDistance(value: any): number | null {
  if (
    value === null ||
    value === undefined ||
    !['number', 'string'].includes(typeof value) ||
    (typeof value === 'string' && value.trim() === '')
  ) {
    return null;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

export function calculateEvolutionaryRate(
  points: EvolutionaryRatePoint[],
  totalVisibleNodes: number
): EvolutionaryRateAnalysis {
  const safePoints = (points || []).filter(point => (
    point?.date instanceof Date &&
    Number.isFinite(point.date.getTime()) &&
    Number.isFinite(point.decimalYear) &&
    Number.isFinite(point.distance)
  ));
  const includedCount = safePoints.length;
  const excludedCount = Math.max(0, Number(totalVisibleNodes || 0) - includedCount);

  const minDate = includedCount > 0
    ? new Date(Math.min(...safePoints.map(point => point.date.getTime())))
    : null;
  const maxDate = includedCount > 0
    ? new Date(Math.max(...safePoints.map(point => point.date.getTime())))
    : null;
  const dateSpanYears = minDate && maxDate
    ? calendarDateToDecimalYear(maxDate) - calendarDateToDecimalYear(minDate)
    : null;

  const emptyRegression = {
    points: safePoints,
    includedCount,
    excludedCount,
    minDate,
    maxDate,
    dateSpanYears,
    slope: null,
    intercept: null,
    correlation: null,
    rSquared: null,
    residualMeanSquared: null,
    residualRootMeanSquared: null,
    outlierThreshold: null,
    residuals: [],
    outliers: [],
    tmrcaDate: null,
  } satisfies EvolutionaryRateAnalysis;

  if (includedCount < 2) {
    return emptyRegression;
  }

  const meanX = safePoints.reduce((sum, point) => sum + point.decimalYear, 0) / includedCount;
  const meanY = safePoints.reduce((sum, point) => sum + point.distance, 0) / includedCount;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;

  safePoints.forEach(point => {
    const dx = point.decimalYear - meanX;
    const dy = point.distance - meanY;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  });

  if (!Number.isFinite(sxx) || sxx <= Number.EPSILON) {
    return emptyRegression;
  }

  const slope = sxy / sxx;
  const intercept = meanY - (slope * meanX);
  const rawCorrelation = syy > Number.EPSILON
    ? sxy / Math.sqrt(sxx * syy)
    : null;
  const correlation = rawCorrelation === null
    ? null
    : Math.max(-1, Math.min(1, rawCorrelation));
  const rSquared = correlation === null ? null : correlation * correlation;
  const residualValues = safePoints.map(point => {
    const fittedDistance = intercept + (slope * point.decimalYear);
    return {
      point,
      fittedDistance,
      residual: point.distance - fittedDistance,
    };
  });
  const residualMeanSquared = residualValues.reduce(
    (sum, item) => sum + (item.residual * item.residual),
    0
  ) / includedCount;
  const residualRootMeanSquared = Math.sqrt(residualMeanSquared);
  const residualTolerance = Math.max(
    1,
    ...residualValues.flatMap(item => [
      Math.abs(item.point.distance),
      Math.abs(item.fittedDistance),
    ])
  ) * 1e-12;
  const canClassifyOutliers = includedCount >= EVOLUTIONARY_RATE_OUTLIER_MINIMUM_POINTS
    && Number.isFinite(residualRootMeanSquared)
    && residualRootMeanSquared > residualTolerance;
  const outlierThreshold = canClassifyOutliers
    ? residualRootMeanSquared * EVOLUTIONARY_RATE_OUTLIER_RMSE_MULTIPLIER
    : null;
  const residuals: EvolutionaryRateResidual[] = residualValues.map(item => {
    const absoluteResidual = Math.abs(item.residual);
    const residualScore = canClassifyOutliers
      ? absoluteResidual / residualRootMeanSquared
      : null;
    return {
      ...item,
      absoluteResidual,
      residualScore,
      isOutlier: residualScore !== null
        && residualScore >= EVOLUTIONARY_RATE_OUTLIER_RMSE_MULTIPLIER,
    };
  });
  const outliers = residuals
    .filter(item => item.isOutlier)
    .sort((left, right) => (
      right.absoluteResidual - left.absoluteResidual
      || left.point.id.localeCompare(right.point.id)
    ));
  const tmrcaDecimalYear = Math.abs(slope) > 1e-12 ? -intercept / slope : Number.NaN;

  return {
    ...emptyRegression,
    slope: Number.isFinite(slope) ? slope : null,
    intercept: Number.isFinite(intercept) ? intercept : null,
    correlation: correlation !== null && Number.isFinite(correlation) ? correlation : null,
    rSquared: rSquared !== null && Number.isFinite(rSquared) ? rSquared : null,
    residualMeanSquared: Number.isFinite(residualMeanSquared) ? residualMeanSquared : null,
    residualRootMeanSquared: Number.isFinite(residualRootMeanSquared) ? residualRootMeanSquared : null,
    outlierThreshold,
    residuals,
    outliers,
    tmrcaDate: decimalYearToCalendarDate(tmrcaDecimalYear),
  };
}
