import {
  buildEvenMixedPieChartRingSegments,
  buildPieChartPathSlices,
  buildPieChartPatternDef,
  buildPieChartSliceSeparatorPaths,
  buildPieChartSlicesWithSegmentedFills,
  buildPieChartSvgDataUri,
  getCollapsedAggregateBorderWidth,
  getCollapsedAggregateMinimumRenderedSize,
  getMixedAggregateRingInnerRadius,
  getPieChartTotalCount,
  hasCompositePieChartFill
} from './pie-chart-utils';

async function rasterizePieChart(dataUri: string, size: number): Promise<ImageData> {
  const image = new Image();
  image.src = dataUri;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Unable to rasterize collapsed-node pie SVG'));
  });

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas 2D context is unavailable');
  }
  context.drawImage(image, 0, 0, size, size);
  return context.getImageData(0, 0, size, size);
}

function countPiePixels(
  imageData: ImageData,
  predicate: (red: number, green: number, blue: number, alpha: number, x: number, y: number) => boolean
): number {
  let count = 0;
  for (let index = 0; index < imageData.data.length; index += 4) {
    const pixelIndex = index / 4;
    if (predicate(
      imageData.data[index],
      imageData.data[index + 1],
      imageData.data[index + 2],
      imageData.data[index + 3],
      pixelIndex % imageData.width,
      Math.floor(pixelIndex / imageData.width)
    )) {
      count++;
    }
  }
  return count;
}

function addCollapsedAggregateBorder(dataUri: string, size: number, borderWidth: number): string {
  const center = size / 2;
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`,
    `<image href="${dataUri}" x="0" y="0" width="${size}" height="${size}"/>`,
    `<circle cx="${center}" cy="${center}" r="${center}" fill="none" stroke="#000000" stroke-width="${borderWidth}"/>`,
    '</svg>'
  ].join('');
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

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

    const translucentPattern = buildPieChartPatternDef('translucent-mixed', slices, 20);
    expect(translucentPattern).toContain("fill='#0000ff' fill-opacity='0.5'");
    expect(translucentPattern).toContain("fill='none' fill-opacity='0' data-mt-contains-mixed-infection='true'");
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
    expect(pattern).toContain("fill='none' fill-opacity='0' data-mt-contains-mixed-infection='true'");
    expect(pattern).not.toContain("fill='#ffffff' fill-opacity='1' data-mt-contains-mixed-infection='true'");
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
    expect(svg).not.toContain('data-mt-aggregate-outline');
    expect(svg).toContain("data-mt-mixed-hollow-slice='true'");
    expect((svg.match(/data-mt-aggregate-slice-separator=/g) || []).length).toBe(2);
    expect(svg).not.toContain('data-mt-aggregate-mixed-indicator');

    expect(buildPieChartSliceSeparatorPaths([slices[0]], 0, 0, 1)).toEqual([]);
  });

  it('keeps the aggregate cue thicker than ordinary borders without scaling it by node size', () => {
    expect(getCollapsedAggregateBorderWidth(0)).toBe(4);
    expect(getCollapsedAggregateBorderWidth(2)).toBe(4);
    expect(getCollapsedAggregateBorderWidth(3)).toBe(5);
    expect(getCollapsedAggregateBorderWidth(8)).toBe(10);
    expect(getCollapsedAggregateMinimumRenderedSize(3)).toBe(18);
    expect(getCollapsedAggregateMinimumRenderedSize(8)).toBe(28);
  });

  it('keeps mixed holes transparent and readable at minimum aggregate size and at 0.5x zoom', async () => {
    const slices = buildPieChartSlicesWithSegmentedFills(
      [
        { label: '2a/3a', count: 1 },
        { label: '4a', count: 2 }
      ],
      label => label === '2a/3a'
        ? {
            color: '#ff0000',
            segments: [
              { value: '2a', color: '#ff0000' },
              { value: '3a', color: '#0000ff' }
            ]
          }
        : { color: '#00cc00' }
    );

    const sourceSize = getCollapsedAggregateMinimumRenderedSize(3);
    const borderWidth = getCollapsedAggregateBorderWidth(3);
    const borderedAggregate = addCollapsedAggregateBorder(
      buildPieChartSvgDataUri('small-collapsed', sourceSize, slices),
      sourceSize,
      borderWidth
    );

    for (const size of [sourceSize, sourceSize / 2]) {
      const imageData = await rasterizePieChart(
        borderedAggregate,
        size
      );
      const center = size / 2;
      const radius = size / 2;
      const transparentHolePixels = countPiePixels(imageData, (red, green, blue, alpha, x, y) => {
        const offsetX = x + 0.5 - center;
        const offsetY = y + 0.5 - center;
        const distance = Math.hypot(offsetX, offsetY);
        const angle = Math.atan2(offsetY, offsetX);
        return distance >= radius * 0.15
          && distance <= radius * 0.4
          && angle >= -5 * Math.PI / 12
          && angle <= Math.PI / 12
          && alpha < 80;
      });
      const transparentSolidInteriorPixels = countPiePixels(imageData, (red, green, blue, alpha, x, y) => {
        const offsetX = x + 0.5 - center;
        const offsetY = y + 0.5 - center;
        const distance = Math.hypot(offsetX, offsetY);
        const angle = Math.atan2(offsetY, offsetX);
        return distance >= radius * 0.15
          && distance <= radius * 0.4
          && angle >= 2 * Math.PI / 3
          && angle <= Math.PI
          && alpha < 80;
      });
      const redPixels = countPiePixels(imageData, (red, green, blue, alpha) => (
        alpha > 180 && red > 140 && green < 120 && blue < 120
      ));
      const bluePixels = countPiePixels(imageData, (red, green, blue, alpha) => (
        alpha > 180 && blue > 140 && red < 120 && green < 120
      ));
      const greenPixels = countPiePixels(imageData, (red, green, blue, alpha) => (
        alpha > 180 && green > 120 && red < 140 && blue < 140
      ));

      expect(transparentHolePixels).withContext(`transparent mixed hollow portion at ${size}px`).toBeGreaterThan(0);
      expect(transparentSolidInteriorPixels).withContext(`opaque solid aggregate portion at ${size}px`).toBe(0);
      expect(redPixels).withContext(`first mixed segment at ${size}px`).toBeGreaterThan(0);
      expect(bluePixels).withContext(`second mixed segment at ${size}px`).toBeGreaterThan(0);
      expect(greenPixels).withContext(`solid aggregate segment at ${size}px`).toBeGreaterThan(0);
      expect(countPiePixels(imageData, (red, green, blue, alpha) => (
        alpha > 180 && red < 50 && green < 50 && blue < 50
      )))
        .withContext(`aggregate border at ${size}px`)
        .toBeGreaterThan(2);
    }
  });
});
