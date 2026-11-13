/** Translate a viewport without changing its size or exposing cells outside the matrix. */
export function translateHeatmapRange(range: readonly [number, number], shift: number, count: number): [number, number] {
  if (count <= 0) return [...range];
  const min = -0.5;
  const max = count - 0.5;
  const span = Math.min(Math.abs(range[1] - range[0]), count);
  const start = Math.max(min, Math.min(max - span, Math.min(...range) + shift));
  return range[0] > range[1] ? [start + span, start] : [start, start + span];
}

/** Keep both axes at the same relative size as the visible matrix grows. */
export function resolveHeatmapLabelSize(
  scale: number, xCount: number, yCount: number,
  xRange?: readonly number[], yRange?: readonly number[],
): number {
  const zoom = (count: number, range?: readonly number[]) => {
    const span = range?.length === 2 ? Math.abs(range[1] - range[0]) : count;
    return count > 0 && span > 0 ? Math.max(1, count / span) : 1;
  };
  // Grow gradually so larger text still leaves room for the matrix and its labels.
  const zoomFactor = Math.pow(zoom(xCount, xRange) * zoom(yCount, yRange), 0.25);
  // Prevent extreme zoom levels from letting text take over the entire view.
  return Math.round(Math.min(72, 12 * scale * zoomFactor) * 10) / 10;
}
