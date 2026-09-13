import {
  EVOLUTIONARY_RATE_OUTLIER_MINIMUM_POINTS,
  EVOLUTIONARY_RATE_OUTLIER_RMSE_MULTIPLIER,
  EvolutionaryRateAnalysis,
  formatCalendarDate,
  scaleEvolutionaryRateForDisplay,
} from './evolutionary-rate-analysis';

export interface EvolutionaryRateReportExcludedPoint {
  id: string;
  dateValue: string;
  reason: string;
}

export interface EvolutionaryRateOutlierReportContext {
  analysis: EvolutionaryRateAnalysis;
  generatedAt?: Date;
  scopeLabel: string;
  dateField: string;
  distanceSourceLabel: string;
  distanceSourceKind: 'metric' | 'patristic';
  treeRootMethod: 'as-provided' | 'best-fit';
  usePercentageDistanceDisplay: boolean;
  regressionPlotSvg: string;
  excludedDataPoints: EvolutionaryRateReportExcludedPoint[];
}

export interface EvolutionaryRateOutlierReportCandidate {
  id: string;
  collectionDate: string;
  observedDistance: string;
  fittedDistance: string;
  residual: string;
  residualScore: string;
  direction: string;
}

export interface EvolutionaryRateOutlierReport {
  title: string;
  generatedAt: string;
  regressionPlotSvg: string;
  contextRows: Array<{ label: string; value: string }>;
  statisticRows: Array<{ label: string; value: string }>;
  methodSummary: string;
  resultSummary: string;
  candidates: EvolutionaryRateOutlierReportCandidate[];
  excludedDataPoints: EvolutionaryRateReportExcludedPoint[];
  investigationGuidance: string[];
  nextSteps: string[];
  limitations: string[];
  sourceLabel: string;
  sourceUrl: string;
}

const TEMPEST_TUTORIAL_URL = 'https://beast.community/tempest_tutorial';

function formatNumber(value: number | null, digits = 6): string {
  if (value === null || !Number.isFinite(value)) return 'N/A';
  if (value === 0) return '0';
  const absoluteValue = Math.abs(value);
  if (absoluteValue >= 100000 || absoluteValue < 0.0001) {
    return value.toExponential(4);
  }
  return Number(value.toFixed(digits)).toString();
}

function formatSignedNumber(value: number): string {
  const formatted = formatNumber(value);
  return value > 0 ? `+${formatted}` : formatted;
}

function formatDateRange(analysis: EvolutionaryRateAnalysis): string {
  if (!analysis.minDate || !analysis.maxDate || analysis.dateSpanYears === null) return 'N/A';
  return `${formatCalendarDate(analysis.minDate)} – ${formatCalendarDate(analysis.maxDate)} (${analysis.dateSpanYears.toFixed(2)} years)`;
}

function describeMethodResult(analysis: EvolutionaryRateAnalysis): string {
  if (analysis.slope === null || analysis.intercept === null) {
    return 'A valid regression could not be calculated, so no potential outliers were classified.';
  }
  if (analysis.points.length < EVOLUTIONARY_RATE_OUTLIER_MINIMUM_POINTS) {
    return `At least ${EVOLUTIONARY_RATE_OUTLIER_MINIMUM_POINTS} analyzable points are required to classify potential outliers; this analysis contains ${analysis.points.length}.`;
  }
  if (analysis.outlierThreshold === null) {
    return 'Residual variation is zero or too small to classify potential outliers.';
  }
  if (analysis.outliers.length === 0) {
    return 'No points met the potential-outlier threshold.';
  }
  return `${analysis.outliers.length} potential outlier${analysis.outliers.length === 1 ? '' : 's'} met the threshold and should be investigated.`;
}

export function buildEvolutionaryRateOutlierReport(
  context: EvolutionaryRateOutlierReportContext
): EvolutionaryRateOutlierReport {
  const displayAnalysis = scaleEvolutionaryRateForDisplay(
    context.analysis,
    context.usePercentageDistanceDisplay
  );
  const distanceUnit = context.usePercentageDistanceDisplay ? 'percent' : 'plot units';
  const rootMethod = context.distanceSourceKind === 'patristic'
    ? context.treeRootMethod === 'best-fit'
      ? 'Best-fit root (minimum regression residuals)'
      : 'Root as provided by the tree'
    : 'Not applicable';

  return {
    title: 'Evolutionary Rate Outlier Report',
    generatedAt: (context.generatedAt || new Date()).toISOString(),
    regressionPlotSvg: context.regressionPlotSvg,
    contextRows: [
      { label: 'Analysis scope', value: context.scopeLabel },
      { label: 'Collection date field', value: context.dateField },
      { label: 'Distance source', value: context.distanceSourceLabel },
      { label: 'Tree rooting', value: rootMethod },
      { label: 'Included points', value: String(context.analysis.includedCount) },
      { label: 'Excluded data points', value: String(context.excludedDataPoints.length) },
    ],
    statisticRows: [
      { label: 'Date range', value: formatDateRange(context.analysis) },
      { label: `Slope (rate, ${distanceUnit}/year)`, value: formatNumber(displayAnalysis.slope) },
      { label: 'X-intercept (TMRCA)', value: formatCalendarDate(context.analysis.tmrcaDate) },
      { label: 'Correlation coefficient', value: formatNumber(context.analysis.correlation, 4) },
      { label: 'R squared', value: formatNumber(context.analysis.rSquared, 4) },
      { label: 'Residual RMSE', value: formatNumber(displayAnalysis.residualRootMeanSquared) },
      { label: 'Outlier threshold', value: displayAnalysis.outlierThreshold === null
        ? 'N/A'
        : `|residual| ≥ ${formatNumber(displayAnalysis.outlierThreshold)} (${EVOLUTIONARY_RATE_OUTLIER_RMSE_MULTIPLIER} × RMSE)` },
    ],
    methodSummary: `Potential outliers are treated as diagnostic flags. A point is flagged when its absolute evolutionary-rate regression residual is at least ${EVOLUTIONARY_RATE_OUTLIER_RMSE_MULTIPLIER} times the residual root mean square error (RMSE).`,
    resultSummary: describeMethodResult(context.analysis),
    candidates: displayAnalysis.outliers.map(item => ({
      id: item.point.id,
      collectionDate: formatCalendarDate(item.point.date),
      observedDistance: formatNumber(item.point.distance),
      fittedDistance: formatNumber(item.fittedDistance),
      residual: formatSignedNumber(item.residual),
      residualScore: item.residualScore === null ? 'N/A' : `${formatNumber(item.residualScore, 2)} × RMSE`,
      direction: item.residual > 0
        ? 'Higher divergence than fitted'
        : 'Lower divergence than fitted',
    })),
    excludedDataPoints: context.excludedDataPoints.map(point => ({ ...point })),
    investigationGuidance: [
      'Check that collection dates were parsed correctly and that sample labels and metadata are accurate.',
      'Compare each flagged sequence with nearby samples in the tree and alignment for possible contamination or mislabelling.',
      'For unexpectedly high divergence, investigate sequencing error, degraded samples, host restriction-factor editing, alignment issues, and recombination.',
      'Short deviations and points close to the regression gradient are less likely to be problematic.',
    ],
    nextSteps: [
      'Do not remove a sequence solely because it is flagged by this report; first examine the supporting tree, alignment, metadata, and laboratory context.',
      'If a sequence is confirmed to be problematic, remove it from the alignment, rebuild the tree, and rerun the evolutionary-rate analysis to compare the temporal signal.',
      'If the data combine distinct lineages, consider analyzing those lineages separately because a single regression can obscure their individual patterns.',
    ],
    limitations: [
      'The cutoff used here is a transparent MicrobeTrace heuristic; the TempEst tutorial recommends inspecting the points furthest from the regression line but does not prescribe an automatic threshold.',
      'Residuals identify unusual temporal divergence patterns, not their cause. The suggested checks are possibilities rather than diagnoses.',
      context.distanceSourceKind === 'patristic'
        ? 'Interpretation assumes the loaded tree and its branch lengths are appropriate for root-to-tip temporal exploration.'
        : 'TempEst guidance is designed for patristic root-to-tip distances from a phylogenetic tree. This report uses genetic distance from a reference sample, so interpret it as exploratory screening.',
    ],
    sourceLabel: 'BEAST Documentation: Using TempEst for data exploration',
    sourceUrl: TEMPEST_TUTORIAL_URL,
  };
}

function escapeMarkdownCell(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\|/g, '\\|')
    .replace(/[\r\n]+/g, ' ');
}

function markdownTable(
  headers: string[],
  rows: string[][]
): string[] {
  return [
    `| ${headers.map(escapeMarkdownCell).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map(row => `| ${row.map(escapeMarkdownCell).join(' | ')} |`),
  ];
}

export function buildEvolutionaryRateOutlierReportMarkdown(
  report: EvolutionaryRateOutlierReport
): string {
  const lines = [
    `# ${report.title}`,
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '## Analysis context',
    '',
    ...markdownTable(
      ['Field', 'Value'],
      report.contextRows.map(row => [row.label, row.value])
    ),
    '',
    '## Regression plot',
    '',
    report.regressionPlotSvg,
    '',
    '## Regression statistics',
    '',
    ...markdownTable(
      ['Statistic', 'Value'],
      report.statisticRows.map(row => [row.label, row.value])
    ),
    '',
    '## Method',
    '',
    report.methodSummary,
    '',
    report.resultSummary,
    '',
    '## Potential outliers',
    '',
  ];

  if (report.candidates.length === 0) {
    lines.push('No potential outliers were classified.', '');
  } else {
    lines.push(
      ...markdownTable(
        ['Sample ID', 'Collection date', 'Observed distance', 'Fitted distance', 'Residual', 'Score', 'Pattern'],
        report.candidates.map(candidate => [
          candidate.id,
          candidate.collectionDate,
          candidate.observedDistance,
          candidate.fittedDistance,
          candidate.residual,
          candidate.residualScore,
          candidate.direction,
        ])
      ),
      ''
    );
  }

  lines.push('## What to check', '');
  report.investigationGuidance.forEach(item => lines.push(`- ${item}`));
  lines.push('', '## Recommended next steps', '');
  report.nextSteps.forEach(item => lines.push(`- ${item}`));
  lines.push('', '## Important limitations', '');
  report.limitations.forEach(item => lines.push(`- ${item}`));

  lines.push('', '## Excluded data points', '');
  if (report.excludedDataPoints.length === 0) {
    lines.push('No records were excluded because of missing or invalid analysis inputs.', '');
  } else {
    lines.push(
      'These records were not part of the residual analysis and are not classified as outliers.',
      '',
      ...markdownTable(
        ['Sample ID', 'Collection date value', 'Reason excluded'],
        report.excludedDataPoints.map(point => [point.id, point.dateValue, point.reason])
      ),
      ''
    );
  }

  lines.push(
    '## Source',
    '',
    `Guidance adapted from [${report.sourceLabel}](${report.sourceUrl}).`,
    ''
  );
  return lines.join('\n');
}

export function buildEvolutionaryRateOutlierReportPdfDefinition(
  report: EvolutionaryRateOutlierReport
): any {
  const keyValueTable = (rows: Array<{ label: string; value: string }>) => ({
    table: {
      headerRows: 1,
      widths: ['40%', '60%'],
      body: [
        ['Field', 'Value'],
        ...rows.map(row => [row.label, row.value]),
      ],
    },
    layout: 'lightHorizontalLines',
    margin: [0, 0, 0, 14],
  });
  const bullets = (items: string[]) => ({ ul: items, margin: [0, 0, 0, 12] });
  const candidateContent = report.candidates.length === 0
    ? [{ text: 'No potential outliers were classified.', margin: [0, 0, 0, 12] }]
    : [{
        table: {
          headerRows: 1,
          widths: ['*', 'auto', 'auto', 'auto', 'auto'],
          body: [
            ['Sample ID', 'Date', 'Observed', 'Fitted', 'Residual'],
            ...report.candidates.map(candidate => [
              candidate.id,
              candidate.collectionDate,
              candidate.observedDistance,
              candidate.fittedDistance,
              `${candidate.residual} (${candidate.residualScore})`,
            ]),
          ],
        },
        layout: 'lightHorizontalLines',
        fontSize: 8,
        margin: [0, 0, 0, 14],
      }];
  const excludedContent = report.excludedDataPoints.length === 0
    ? [{ text: 'No records were excluded because of missing or invalid analysis inputs.', margin: [0, 0, 0, 12] }]
    : [
        { text: 'These records were not part of the residual analysis and are not classified as outliers.', margin: [0, 0, 0, 6] },
        {
          table: {
            headerRows: 1,
            widths: ['25%', '25%', '50%'],
            body: [
              ['Sample ID', 'Collection date value', 'Reason excluded'],
              ...report.excludedDataPoints.map(point => [point.id, point.dateValue, point.reason]),
            ],
          },
          layout: 'lightHorizontalLines',
          fontSize: 8,
          margin: [0, 0, 0, 14],
        },
      ];

  return {
    pageOrientation: 'portrait',
    pageMargins: [36, 42, 36, 42],
    content: [
      { text: report.title, style: 'title' },
      { text: `Generated: ${report.generatedAt}`, style: 'generated' },
      { text: 'Analysis context', style: 'heading' },
      keyValueTable(report.contextRows),
      { text: 'Regression plot', style: 'heading' },
      {
        svg: report.regressionPlotSvg,
        width: 500,
        alignment: 'center',
        margin: [0, 0, 0, 14],
      },
      { text: 'Regression statistics', style: 'heading' },
      keyValueTable(report.statisticRows),
      { text: 'Method', style: 'heading' },
      { text: report.methodSummary, margin: [0, 0, 0, 6] },
      { text: report.resultSummary, bold: true, margin: [0, 0, 0, 12] },
      { text: 'Potential outliers', style: 'heading' },
      ...candidateContent,
      { text: 'What to check', style: 'heading' },
      bullets(report.investigationGuidance),
      { text: 'Recommended next steps', style: 'heading' },
      bullets(report.nextSteps),
      { text: 'Important limitations', style: 'heading' },
      bullets(report.limitations),
      { text: 'Excluded data points', style: 'heading' },
      ...excludedContent,
      { text: 'Source', style: 'heading' },
      {
        text: `Guidance adapted from ${report.sourceLabel}.`,
        link: report.sourceUrl,
        color: '#005DAA',
        decoration: 'underline',
      },
    ],
    footer: (currentPage: number, pageCount: number) => ({
      text: `Page ${currentPage} of ${pageCount}`,
      alignment: 'center',
      fontSize: 8,
      margin: [0, 12, 0, 0],
    }),
    styles: {
      title: { fontSize: 20, bold: true, color: '#005DAA', margin: [0, 0, 0, 4] },
      generated: { fontSize: 9, color: '#666666', margin: [0, 0, 0, 14] },
      heading: { fontSize: 13, bold: true, margin: [0, 10, 0, 6] },
    },
    defaultStyle: { fontSize: 9, lineHeight: 1.2 },
  };
}
