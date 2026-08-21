import { expandPieChartSlicesBySegments, getPieChartTotalCount } from './pie-chart-utils';

describe('segmented pie chart slices', () => {
  it('places matching rendered colors together without merging slice contributions', () => {
    const slices = expandPieChartSlicesBySegments(
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
      { label: '2a', count: 0.5, color: '#ff0000', alpha: 1 },
      { label: '2a', count: 1, color: '#ff0000', alpha: 1 },
      { label: '2b', count: 0.5, color: '#0000ff', alpha: 0.5 }
    ]);
    expect(getPieChartTotalCount(slices)).toBe(2);
  });
});
