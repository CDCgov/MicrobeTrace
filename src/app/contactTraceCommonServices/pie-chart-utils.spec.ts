import {
  buildPieChartPatternDef,
  buildPieChartSlicesWithSegmentedFills,
  getPieChartTotalCount,
  hasCompositePieChartFill
} from './pie-chart-utils';

describe('segmented pie chart slices', () => {
  it('keeps a mixed value as one count with a segmented fill', () => {
    const slices = buildPieChartSlicesWithSegmentedFills(
      [
        { label: '2a/2b', count: 1 },
        { label: '2a', count: 1 }
      ],
      label => label === '2a/2b'
        ? {
            color: '#ff0000',
            alpha: 1,
            segments: [
              { value: '2a', color: '#ff0000', alpha: 1, weight: 1 },
              { value: '2b', color: '#0000ff', alpha: 0.5, weight: 1 }
            ]
          }
        : { color: '#ff0000', alpha: 1 }
    );

    expect(slices).toEqual([
      {
        label: '2a/2b',
        count: 1,
        color: '#ff0000',
        alpha: 1,
        segments: [
          { value: '2a', color: '#ff0000', alpha: 1, weight: 1 },
          { value: '2b', color: '#0000ff', alpha: 0.5, weight: 1 }
        ]
      },
      { label: '2a', count: 1, color: '#ff0000', alpha: 1, segments: undefined }
    ]);
    expect(getPieChartTotalCount(slices)).toBe(2);
    expect(hasCompositePieChartFill(slices)).toBe(true);
  });

  it('renders a lone mixed value as one full striped circle', () => {
    const slices = buildPieChartSlicesWithSegmentedFills(
      [{ label: '6/7a', count: 1 }],
      () => ({
        color: '#ff0000',
        segments: [
          { value: '6', color: '#ff0000', weight: 1 },
          { value: '7a', color: '#0000ff', weight: 1 }
        ]
      })
    );
    const pattern = buildPieChartPatternDef('mixed-only', slices, 20);

    expect(pattern).toContain('<pattern id="mixed-only-stripes-0"');
    expect(pattern).toContain('width="0.8" height="0.8"');
    expect(pattern).toContain('patternTransform="rotate(45)"');
    expect(pattern).toContain('fill="#ff0000"');
    expect(pattern).toContain('fill="#0000ff"');
    expect(pattern).toContain("fill='url(#mixed-only-stripes-0)'");
    expect((pattern.match(/<path /g) || []).length).toBe(1);

    const largerPattern = buildPieChartPatternDef('mixed-large', slices, 40);
    expect(largerPattern).toContain('width="0.4" height="0.4"');
  });
});
