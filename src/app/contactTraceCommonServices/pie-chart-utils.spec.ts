import {
  buildEvenMixedPieChartRingSegments,
  buildPieChartPathSlices,
  buildPieChartPatternDef,
  buildPieChartSliceSeparatorPaths,
  buildPieChartSlicesWithSegmentedFills,
  buildPieChartSvgDataUri,
  getMixedAggregateRingInnerRadius,
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

  it('keeps mixed aggregate slices hollow while ordinary slices stay solid', () => {
    const slices = buildPieChartSlicesWithSegmentedFills(
      [
        { label: '6/7a', count: 1 },
        { label: '2a', count: 2 }
      ],
      label => label === '6/7a'
        ? {
            color: '#ff0000',
            segments: [
              { value: '6', color: '#ff0000', weight: 3 },
              { value: '7a', color: '#0000ff', weight: 1 }
            ]
          }
        : { color: '#00aa00' }
    );
    const pattern = buildPieChartPatternDef('mixed-only', slices, 20);

    expect(pattern).toContain("<pattern id='mixed-only'");
    expect(pattern).toContain("fill='#ffffff' fill-opacity='1'");
    expect(pattern).toContain("data-mt-mixed-hollow-slice='true'");
    expect(pattern).toContain("fill='#ff0000'");
    expect(pattern).toContain("fill='#0000ff'");
    expect(pattern).toContain("fill='#00aa00'");
    expect(pattern).toContain("data-mt-solid-aggregate-slice='true'");
    expect((pattern.match(/data-mt-mixed-ring-segment=/g) || []).length).toBe(2);
    expect((pattern.match(/data-mt-aggregate-slice-separator=/g) || []).length).toBe(2);
    expect(pattern).toContain("stroke='#000000' stroke-width='0.1'");

    const pathSlices = buildPieChartPathSlices(slices, 0, 0, 1);
    const mixedSlice = pathSlices[0];
    expect(mixedSlice.endFraction - mixedSlice.startFraction).toBeCloseTo(1 / 3);

    const evenSegments = buildEvenMixedPieChartRingSegments(
      slices[0].segments || [],
      mixedSlice.startFraction,
      mixedSlice.endFraction,
      0,
      0,
      1,
      0.6
    );
    evenSegments.forEach(segment => {
      expect(segment.endFraction - segment.startFraction).toBeCloseTo(1 / 6);
    });
    expect(1 - getMixedAggregateRingInnerRadius(1)).toBe(0.5);

    const svg = atob(buildPieChartSvgDataUri('mixed-svg', 40, slices).split(',')[1]);
    expect(svg).toContain("data-mt-aggregate-outline='outer'");
    expect(svg).not.toContain("data-mt-aggregate-outline='inner'");
    expect(svg).toContain("data-mt-mixed-hollow-slice='true'");
    expect((svg.match(/data-mt-aggregate-slice-separator=/g) || []).length).toBe(2);
    expect(svg).not.toContain('data-mt-aggregate-mixed-indicator');

    expect(buildPieChartSliceSeparatorPaths([slices[0]], 0, 0, 1)).toEqual([]);
  });
});
