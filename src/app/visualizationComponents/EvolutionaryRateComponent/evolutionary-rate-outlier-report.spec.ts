import {
  EvolutionaryRatePoint,
  calculateEvolutionaryRate,
  calendarDateToDecimalYear,
  parseCalendarDate,
} from './evolutionary-rate-analysis';
import {
  buildEvolutionaryRateOutlierReport,
  buildEvolutionaryRateOutlierReportMarkdown,
  buildEvolutionaryRateOutlierReportPdfDefinition,
} from './evolutionary-rate-outlier-report';

const REGRESSION_PLOT_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500"><line data-testid="evolutionary-rate-regression-line" x1="0" y1="400" x2="800" y2="100" /></svg>';

function point(id: string, year: number, distance: number): EvolutionaryRatePoint {
  const date = parseCalendarDate(`${year}-01-01`) as Date;
  return {
    id,
    node: { _id: id },
    date,
    decimalYear: calendarDateToDecimalYear(date),
    distance,
  };
}

function buildReport(distances: number[]) {
  const points = distances.map((distance, index) => point(`sample-${index}`, 2020 + index, distance));
  return buildEvolutionaryRateOutlierReport({
    analysis: calculateEvolutionaryRate(points, points.length + 1),
    generatedAt: new Date('2026-08-12T12:00:00.000Z'),
    scopeLabel: `${points.length + 1} visible nodes`,
    dateField: 'collectionDate',
    distanceSourceLabel: 'Best-fit patristic root-to-tip distance',
    distanceSourceKind: 'patristic',
    treeRootMethod: 'best-fit',
    usePercentageDistanceDisplay: false,
    regressionPlotSvg: REGRESSION_PLOT_SVG,
    excludedDataPoints: [{
      id: 'bad|sample<script>',
      dateValue: 'not-a-date',
      reason: 'Missing or invalid collectionDate value.',
    }],
  });
}

describe('evolutionary rate outlier report', () => {
  it('builds an attributed report with diagnostic guidance and ranked candidates', () => {
    const report = buildReport([0, 1, 2, 3, 4, 50, 6, 7, 8, 9]);

    expect(report.generatedAt).toBe('2026-08-12T12:00:00.000Z');
    expect(report.regressionPlotSvg).toBe(REGRESSION_PLOT_SVG);
    expect(report.candidates.map(candidate => candidate.id)).toEqual(['sample-5']);
    expect(report.candidates[0].direction).toBe('Higher divergence than fitted');
    expect(report.candidates[0].residualScore).toContain('RMSE');
    expect(report.resultSummary).toContain('1 potential outlier');
    expect(report.investigationGuidance.join(' ')).toContain('sequencing error');
    expect(report.nextSteps.join(' ')).toContain('rebuild the tree');
    expect(report.sourceUrl).toBe('https://beast.community/tempest_tutorial');
  });

  it('exports Markdown with safe table cells and a distinct excluded-data section', () => {
    const markdown = buildEvolutionaryRateOutlierReportMarkdown(
      buildReport([0, 1, 2, 3, 4, 50, 6, 7, 8, 9])
    );

    expect(markdown).toContain('# Evolutionary Rate Outlier Report');
    expect(markdown).toContain('## Regression plot');
    expect(markdown).toContain(REGRESSION_PLOT_SVG);
    expect(markdown).toContain('## Potential outliers');
    expect(markdown).toContain('| sample-5 |');
    expect(markdown).not.toContain('Suggested checks');
    expect(markdown).toContain('## Excluded data points');
    expect(markdown).toContain('bad\\|sample&lt;script&gt;');
    expect(markdown).toContain('not classified as outliers');
    expect(markdown).toContain('[BEAST Documentation: Using TempEst for data exploration](https://beast.community/tempest_tutorial)');
  });

  it('reports a clean fit without manufacturing candidates and creates a PDF definition', () => {
    const report = buildReport([0, 1, 2, 3]);
    const markdown = buildEvolutionaryRateOutlierReportMarkdown(report);
    const pdfDefinition = buildEvolutionaryRateOutlierReportPdfDefinition(report);

    expect(report.candidates).toEqual([]);
    expect(report.resultSummary).toContain('Residual variation is zero or too small');
    expect(markdown).toContain('No potential outliers were classified.');
    expect(pdfDefinition.pageOrientation).toBe('portrait');
    expect(pdfDefinition.content.some((item: any) => (
      item.svg === REGRESSION_PLOT_SVG && item.width === 500
    ))).toBeTrue();
    expect(pdfDefinition.content.some((item: any) => item.text === 'Potential outliers')).toBeTrue();
    expect(pdfDefinition.footer(1, 2).text).toBe('Page 1 of 2');
  });

  it('keeps the portrait PDF candidate table compact without duplicated checks', () => {
    const pdfDefinition = buildEvolutionaryRateOutlierReportPdfDefinition(
      buildReport([0, 1, 2, 3, 4, 50, 6, 7, 8, 9])
    );
    const candidateTable = pdfDefinition.content.find((item: any) => (
      item.table?.body?.[0]?.[0] === 'Sample ID'
      && item.table?.body?.[0]?.[1] === 'Date'
    ));

    expect(candidateTable.table.widths).toEqual(['*', 'auto', 'auto', 'auto', 'auto']);
    expect(candidateTable.table.body[0]).toEqual(['Sample ID', 'Date', 'Observed', 'Fitted', 'Residual']);
    expect(candidateTable.table.body[1]).toHaveSize(5);
  });
});
