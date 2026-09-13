import {
  EvolutionaryRatePoint,
  calculateEvolutionaryRate,
  calendarDateToDecimalYear,
  coerceFiniteDistance,
  decimalYearToCalendarDate,
  formatCalendarDate,
  parseCalendarDate,
  scaleEvolutionaryRateForDisplay,
} from './evolutionary-rate-analysis';

function point(id: string, dateText: string, distance: number): EvolutionaryRatePoint {
  const date = parseCalendarDate(dateText) as Date;
  return {
    id,
    node: { _id: id },
    date,
    decimalYear: calendarDateToDecimalYear(date),
    distance,
  };
}

describe('evolutionary rate analysis', () => {
  it('normalizes valid sample dates to UTC calendar days', () => {
    const date = parseCalendarDate('2020-02-29 15:45:12');

    expect(formatCalendarDate(date)).toBe('2020-02-29');
    expect(date?.getUTCHours()).toBe(0);
    expect(parseCalendarDate('')).toBeNull();
    expect(parseCalendarDate('2020-02-30')).toBeNull();
    expect(parseCalendarDate(true)).toBeNull();
    expect(parseCalendarDate([])).toBeNull();
    expect(parseCalendarDate({ year: 2020 })).toBeNull();
  });

  it('converts calendar dates to and from fractional years, including leap years', () => {
    const start = parseCalendarDate('2020-01-01') as Date;
    const midpoint = parseCalendarDate('2020-07-02') as Date;

    expect(calendarDateToDecimalYear(start)).toBe(2020);
    expect(calendarDateToDecimalYear(midpoint)).toBeCloseTo(2020.5, 10);
    expect(formatCalendarDate(decimalYearToCalendarDate(2020.5))).toBe('2020-07-02');
    expect(decimalYearToCalendarDate(Number.NaN)).toBeNull();
  });

  it('rejects invalid distance values without coercing blanks or booleans', () => {
    expect(coerceFiniteDistance('1.25')).toBe(1.25);
    expect(coerceFiniteDistance(0)).toBe(0);
    expect(coerceFiniteDistance('')).toBeNull();
    expect(coerceFiniteDistance('   ')).toBeNull();
    expect(coerceFiniteDistance(null)).toBeNull();
    expect(coerceFiniteDistance(false)).toBeNull();
    expect(coerceFiniteDistance([])).toBeNull();
    expect(coerceFiniteDistance(new Date())).toBeNull();
    expect(coerceFiniteDistance('one')).toBeNull();
    expect(coerceFiniteDistance(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('calculates OLS slope, TMRCA, Pearson correlation, R squared, and date range', () => {
    const result = calculateEvolutionaryRate([
      point('a', '2020-01-01', 0),
      point('b', '2021-01-01', 2),
      point('c', '2022-01-01', 4),
    ], 4);

    expect(result.includedCount).toBe(3);
    expect(result.excludedCount).toBe(1);
    expect(result.slope).toBeCloseTo(2, 10);
    expect(result.intercept).toBeCloseTo(-4040, 8);
    expect(formatCalendarDate(result.tmrcaDate)).toBe('2020-01-01');
    expect(result.correlation).toBeCloseTo(1, 10);
    expect(result.rSquared).toBeCloseTo(1, 10);
    expect(result.residualMeanSquared).toBeCloseTo(0, 10);
    expect(result.residualRootMeanSquared).toBeCloseTo(0, 10);
    expect(result.residuals).toHaveSize(3);
    expect(result.outlierThreshold).toBeNull();
    expect(result.outliers).toEqual([]);
    expect(result.dateSpanYears).toBeCloseTo(2, 10);
  });

  it('calculates the mean of squared OLS residuals', () => {
    const result = calculateEvolutionaryRate([
      point('a', '2020-01-01', 0),
      point('b', '2021-01-01', 2),
      point('c', '2022-01-01', 5),
    ], 3);

    expect(result.residualMeanSquared).toBeCloseTo(1 / 18, 10);
    expect(result.residualRootMeanSquared).toBeCloseTo(Math.sqrt(1 / 18), 10);
    expect(result.residuals.map(item => item.point.id)).toEqual(['a', 'b', 'c']);
  });

  it('flags and ranks potential outliers at two residual RMSEs', () => {
    const points = Array.from({ length: 10 }, (_, index) => point(
      `sample-${index}`,
      `${2020 + index}-01-01`,
      index === 5 ? 50 : index
    ));
    const result = calculateEvolutionaryRate(points, points.length);

    expect(result.outlierThreshold).toBeCloseTo((result.residualRootMeanSquared as number) * 2, 10);
    expect(result.outliers.map(item => item.point.id)).toEqual(['sample-5']);
    expect(result.outliers[0].residualScore).toBeGreaterThanOrEqual(2);
    expect(result.outliers[0].residual).toBeGreaterThan(0);
  });

  it('filters malformed analysis points and reports them as excluded', () => {
    const malformed = {
      ...point('bad', '2021-01-01', 1),
      distance: Number.NaN,
    };
    const result = calculateEvolutionaryRate([
      point('a', '2020-01-01', 0),
      malformed,
      point('c', '2022-01-01', 4),
    ], 5);

    expect(result.includedCount).toBe(2);
    expect(result.excludedCount).toBe(3);
    expect(result.slope).toBeCloseTo(2, 10);
  });

  it('returns N/A-compatible null results for duplicate dates and zero variance', () => {
    const duplicateDates = calculateEvolutionaryRate([
      point('a', '2020-01-01', 1),
      point('b', '2020-01-01', 2),
    ], 2);
    expect(duplicateDates.slope).toBeNull();
    expect(duplicateDates.intercept).toBeNull();
    expect(duplicateDates.correlation).toBeNull();
    expect(duplicateDates.rSquared).toBeNull();
    expect(duplicateDates.residualMeanSquared).toBeNull();
    expect(duplicateDates.residualRootMeanSquared).toBeNull();
    expect(duplicateDates.outlierThreshold).toBeNull();
    expect(duplicateDates.residuals).toEqual([]);
    expect(duplicateDates.outliers).toEqual([]);
    expect(duplicateDates.tmrcaDate).toBeNull();

    const constantDistance = calculateEvolutionaryRate([
      point('a', '2020-01-01', 3),
      point('b', '2021-01-01', 3),
    ], 2);
    expect(constantDistance.slope).toBeCloseTo(0, 10);
    expect(constantDistance.intercept).toBeCloseTo(3, 10);
    expect(constantDistance.correlation).toBeNull();
    expect(constantDistance.rSquared).toBeNull();
    expect(constantDistance.residualMeanSquared).toBeCloseTo(0, 10);
    expect(constantDistance.residualRootMeanSquared).toBeCloseTo(0, 10);
    expect(constantDistance.outlierThreshold).toBeNull();
    expect(constantDistance.residuals).toHaveSize(2);
    expect(constantDistance.residuals.every(item => item.residualScore === null)).toBeTrue();
    expect(constantDistance.outliers).toEqual([]);
    expect(constantDistance.tmrcaDate).toBeNull();
  });

  it('scales only displayed TN93 distances, slope, and intercept to percentages', () => {
    const raw = calculateEvolutionaryRate([
      point('a', '2020-01-01', 0.01),
      point('b', '2021-01-01', 0.02),
    ], 2);
    const displayed = scaleEvolutionaryRateForDisplay(raw, true);

    expect(raw.points[0].distance).toBe(0.01);
    expect(displayed.points.map(item => item.distance)).toEqual([1, 2]);
    expect(displayed.slope).toBeCloseTo((raw.slope as number) * 100, 10);
    expect(displayed.intercept).toBeCloseTo((raw.intercept as number) * 100, 8);
    expect(displayed.tmrcaDate).toBe(raw.tmrcaDate);
    expect(displayed.correlation).toBe(raw.correlation);
    expect(displayed.rSquared).toBe(raw.rSquared);
    expect(displayed.residualMeanSquared).toBeCloseTo((raw.residualMeanSquared as number) * 10000, 10);
    expect(displayed.residualRootMeanSquared).toBeCloseTo((raw.residualRootMeanSquared as number) * 100, 10);
    expect(displayed.residuals[0].fittedDistance).toBeCloseTo(raw.residuals[0].fittedDistance * 100, 10);
    expect(displayed.residuals[0].residual).toBeCloseTo(raw.residuals[0].residual * 100, 10);
    expect(displayed.residuals[0].residualScore).toBe(raw.residuals[0].residualScore);
  });
});
