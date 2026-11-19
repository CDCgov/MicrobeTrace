import { resolveHeatmapLabelSize, translateHeatmapRange } from './heatmap-viewport';

describe('bounded heatmap panning', () => {
  it('moves within the matrix without changing the zoom level', () => {
    expect(translateHeatmapRange([2, 6], 1, 10)).toEqual([3, 7]);
  });

  it('stops at either edge while preserving the viewport width', () => {
    expect(translateHeatmapRange([2, 6], -20, 10)).toEqual([-0.5, 3.5]);
    expect(translateHeatmapRange([2, 6], 20, 10)).toEqual([5.5, 9.5]);
  });

  it('keeps the full matrix in place until the user zooms in', () => {
    expect(translateHeatmapRange([-0.5, 9.5], 20, 10)).toEqual([-0.5, 9.5]);
  });

  it('preserves reversed axes and handles an empty matrix', () => {
    expect(translateHeatmapRange([6, 2], 20, 10)).toEqual([9.5, 5.5]);
    expect(translateHeatmapRange([0, 1], 20, 0)).toEqual([0, 1]);
  });
});

describe('zoom-relative heatmap labels', () => {
  it('uses the slider scale at the full matrix extent', () => {
    expect(resolveHeatmapLabelSize(0.5, 10, 20, [-0.5, 9.5], [-0.5, 19.5])).toEqual(6);
    expect(resolveHeatmapLabelSize(2, 10, 20, [-0.5, 9.5], [-0.5, 19.5])).toEqual(24);
  });

  it('grows both labels with zoom and reduces them again at the full extent', () => {
    expect(resolveHeatmapLabelSize(1, 10, 20, [2, 7], [5, 15])).toEqual(17);
    expect(resolveHeatmapLabelSize(1, 10, 20, [-0.5, 9.5], [-0.5, 19.5])).toEqual(12);
  });

  it('keeps font sizes stable during panning and reversed axes', () => {
    expect(resolveHeatmapLabelSize(1, 10, 20, [2, 7], [5, 15])).toEqual(resolveHeatmapLabelSize(1, 10, 20, [9.5, 4.5], [19.5, 9.5]));
  });

  it('keeps extreme zoom readable and handles an empty matrix', () => {
    expect(resolveHeatmapLabelSize(2, 1000, 1000, [0, 1], [0, 1])).toEqual(72);
    expect(resolveHeatmapLabelSize(1, 0, 0)).toEqual(12);
  });
});
