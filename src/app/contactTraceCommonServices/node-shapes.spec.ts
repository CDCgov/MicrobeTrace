import { aggregateNodeShapeCategories, getMixedNodeRingWidth, getMixedNodeShapeDataUri, resolveNodeShapeForNode } from './node-shapes';
import { clearGeometryCenterMaskCache } from './geometry-center-mask';

function decodeSvgDataUri(dataUri: string): string {
  return decodeURIComponent(dataUri.split(',')[1]);
}

function countPixels(
  imageData: ImageData,
  predicate: (red: number, green: number, blue: number, alpha: number) => boolean
): number {
  let count = 0;
  for (let index = 0; index < imageData.data.length; index += 4) {
    if (predicate(
      imageData.data[index],
      imageData.data[index + 1],
      imageData.data[index + 2],
      imageData.data[index + 3]
    )) {
      count++;
    }
  }
  return count;
}

async function rasterizeSvgDataUri(dataUri: string, size: number = 300): Promise<ImageData> {
  const image = new Image();
  image.src = dataUri;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Unable to rasterize mixed node shape SVG'));
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

function wrapSvgImageDataUri(dataUri: string): string {
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="300" height="300" viewBox="0 0 300 300">',
    `<image href="${dataUri}" xlink:href="${dataUri}" x="0" y="0" width="300" height="300"/>`,
    '</svg>'
  ].join('');
  const documentNode = new DOMParser().parseFromString(svg, 'image/svg+xml');
  if (documentNode.getElementsByTagName('parsererror').length) {
    throw new Error('Unable to serialize nested mixed-node SVG');
  }
  const serializedSvg = new XMLSerializer().serializeToString(documentNode.documentElement);
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(serializedSvg)}`;
}

describe('mixed node shape SVG helpers', () => {
  const segments = [
    { value: '2a', color: '#00aa00', alpha: 0.4, weight: 3 },
    { value: '3a', color: '#ffff00', alpha: 0.8, weight: 1 }
  ];

  it('uses a white center and an evenly segmented outer ring for mixed values', () => {
    const svg = decodeSvgDataUri(getMixedNodeShapeDataUri('triangle', '#123456', '#000000', 4, 0.4, segments));

    expect(svg).not.toContain('<pattern');
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).not.toContain('fill="#123456"');
    expect(svg).toContain('stroke="#00aa00"');
    expect(svg).toContain('stroke="#ffff00"');
    expect(svg).toContain('stroke-dasharray="0.5 0.5"');
    expect(svg).toContain('data-mt-mixed-ring-segment="0"');
    expect(svg).toContain('data-mt-mixed-ring-width-radius-fraction="0.5"');
    expect(svg).not.toContain('stroke-dasharray="0.75 0.25"');
    expect(svg).not.toContain('A 1 1 0');
  });

  it('does not emit a mixed ring when fewer than two segments are supplied', () => {
    const svg = decodeSvgDataUri(getMixedNodeShapeDataUri(
      'triangle',
      '#ffffff',
      '#000000',
      4,
      1,
      [segments[0]]
    ));

    expect(svg).not.toContain('data-mt-mixed-ring-segment');
    expect(svg).toContain('fill="#ffffff"');
  });

  it('keeps the outer ring half a node radius wide across rendered node sizes', () => {
    const smallSvg = decodeSvgDataUri(getMixedNodeShapeDataUri(
      'ellipse',
      '#ffffff',
      '#000000',
      4,
      1,
      segments,
      null,
      { fillCanvas: true, includeStroke: false, renderedSize: 20 }
    ));
    const largeSvg = decodeSvgDataUri(getMixedNodeShapeDataUri(
      'ellipse',
      '#ffffff',
      '#000000',
      4,
      1,
      segments,
      null,
      { fillCanvas: true, includeStroke: false, renderedSize: 40 }
    ));

    expect(getMixedNodeRingWidth(20)).toBe(5);
    expect(getMixedNodeRingWidth(40)).toBe(10);
    expect(smallSvg).toContain('stroke-width="75"');
    expect(largeSvg).toContain('stroke-width="75"');
  });

  it('can provide a full-canvas fill without embedding an oversized Cytoscape border', () => {
    const svg = decodeSvgDataUri(getMixedNodeShapeDataUri(
      'ellipse',
      '#ffffff',
      '#000000',
      48,
      1,
      segments,
      null,
      { fillCanvas: true, includeStroke: false }
    ));

    expect(svg).toContain('<rect x="0" y="0" width="300" height="300"');
    expect(svg).toContain('viewBox="0 0 300 300"');
    expect(svg).toContain('data-mt-mixed-ring-segment="0"');
    expect(svg).not.toContain('stroke-width="48"');
  });

  it('can pad mixed basic shape view boxes so borders scale like single-color icons', () => {
    const svg = decodeSvgDataUri(getMixedNodeShapeDataUri(
      'triangle',
      '#ffffff',
      '#000000',
      16,
      1,
      segments,
      null,
      { basicShapeViewBoxPadding: 20 }
    ));

    expect(svg).toContain('viewBox="-20 -20 340 340"');
    expect(svg).toContain('stroke-width="16"');
    expect(svg).toContain('data-mt-mixed-ring-segment="0"');
  });

  it('clips equal angular sectors to custom silhouettes instead of dashing their paths', () => {
    const svg = decodeSvgDataUri(getMixedNodeShapeDataUri('virus', '#ffffff', '#000000', 8, 1, segments));

    expect(svg).toContain('data-mt-mixed-ring-segment="0"');
    expect(svg).toContain('fill="#00aa00"');
    expect(svg).toContain('fill="#ffff00"');
    expect(svg).toContain('data-mt-custom-mixed-ring="silhouette-sectors"');
    expect(svg).toContain('data-mt-mixed-ring-width-radius-fraction="0.5"');
    expect(svg).toContain('<clipPath');
    expect(svg).toContain('data-mt-mixed-ring-center-strategy="hole-filled-euclidean-distance-transform"');
    expect(svg).toContain('data-mt-mixed-ring-center="geometry-distance-mask"');
    expect(svg).toContain('data-mt-mixed-ring-center-radius-fraction="0.5"');
    expect(svg).toContain('data-mt-mixed-ring-center-minimum-readable-area-fraction="0.25"');
    expect(svg).toContain('data-mt-mixed-ring-center-threshold-policy="half-inradius-with-minimum-readable-center-area"');
    expect(svg).toContain('data-mt-mixed-ring-center-rasterization="canvas-path2d"');
    expect(Number(svg.match(/data-mt-mixed-ring-center-raster-width="(\d+)"/)?.[1] ?? 0))
      .toBeGreaterThanOrEqual(600);
    expect(svg).toContain('href="data:image/png;base64,');
    expect(svg).not.toContain('<feMorphology');
    expect(svg).not.toContain('stroke-dasharray');
  });

  it('can render custom icon mixed fills without embedding a stroke', () => {
    const svg = decodeSvgDataUri(getMixedNodeShapeDataUri(
      'virus',
      '#ffffff',
      '#000000',
      8,
      1,
      segments,
      null,
      { includeStroke: false, customShapePadding: 0, customShapeViewBoxPadding: 0 }
    ));

    expect(svg).toContain('data-mt-mixed-ring-segment="0"');
    expect(svg).toContain('<svg x="0" y="0" width="300" height="300" viewBox="0 0 300 300"');
    expect(svg).toContain('data-mt-custom-mixed-ring="silhouette-sectors"');
    expect(svg).not.toContain('stroke-width="8"');
    expect(svg).not.toContain('stroke-dasharray');
  });

  it('derives hollow centers from each custom geometry without per-shape replacement geometry', () => {
    const manSvg = decodeSvgDataUri(getMixedNodeShapeDataUri('man', '#ffffff', '#000000', 2, 1, segments));
    const parasiteSvg = decodeSvgDataUri(getMixedNodeShapeDataUri('parasite', '#ffffff', '#000000', 2, 1, segments));
    const virusSvg = decodeSvgDataUri(getMixedNodeShapeDataUri('virus', '#ffffff', '#000000', 2, 1, segments));

    [manSvg, parasiteSvg, virusSvg].forEach(svg => {
      expect(svg).toContain('data-mt-custom-mixed-ring="silhouette-sectors"');
      expect(svg).toContain('data-mt-mixed-ring-center="geometry-distance-mask"');
      expect(svg).toContain('data-mt-mixed-ring-center-strategy="hole-filled-euclidean-distance-transform"');
      expect(svg).toContain('data-mt-mixed-ring-center-radius-fraction="0.5"');
      expect(svg).toContain('data-mt-mixed-ring-center-minimum-readable-area-fraction="0.25"');
      expect((svg.match(/data-mt-mixed-ring-segment=/g) || []).length).toBe(2);
      expect(svg).not.toContain('<feMorphology');
      expect(svg).not.toContain('stroke-dasharray');
    });
    const holesFilled = Number(virusSvg.match(/data-mt-mixed-ring-center-holes-filled="(\d+)"/)?.[1] ?? 0);
    expect(holesFilled).toBeGreaterThan(0);
  });

  it('rasterizes representative custom geometries with transparent backgrounds, all colors, and white centers', async () => {
    const opaqueSegments = [
      { color: '#ff0000', alpha: 1 },
      { color: '#0000ff', alpha: 1 },
      { color: '#00ff00', alpha: 1 }
    ];

    for (const shape of ['man', 'woman', 'parasite', 'virus', 'mosquito', 'tick', 'fruits']) {
      const dataUri = getMixedNodeShapeDataUri(
        shape,
        '#ffffff',
        '#000000',
        2,
        1,
        opaqueSegments,
        null,
        { customShapePadding: 0, customShapeViewBoxPadding: 0 }
      );
      const imageData = await rasterizeSvgDataUri(dataUri);
      const near = (actual: number, expected: number) => Math.abs(actual - expected) <= 8;
      const colorCount = (red: number, green: number, blue: number) => countPixels(
        imageData,
        (r, g, b, a) => a > 240 && near(r, red) && near(g, green) && near(b, blue)
      );

      expect(colorCount(255, 0, 0)).withContext(`${shape} red sector`).toBeGreaterThan(20);
      expect(colorCount(0, 0, 255)).withContext(`${shape} blue sector`).toBeGreaterThan(20);
      expect(colorCount(0, 255, 0)).withContext(`${shape} green sector`).toBeGreaterThan(20);
      expect(colorCount(255, 255, 255)).withContext(`${shape} white center`).toBeGreaterThan(20);
      expect(countPixels(imageData, (_r, _g, _b, alpha) => alpha === 0))
        .withContext(`${shape} transparent background`)
        .toBeGreaterThan(20);

      const smallImageData = await rasterizeSvgDataUri(dataUri, 32);
      expect(countPixels(smallImageData, (r, g, b, a) => (
        a > 200 && r > 225 && g > 225 && b > 225
      )))
        .withContext(`${shape} visible white center at 32px`)
        .toBeGreaterThan(0);
      expect(countPixels(smallImageData, (r, g, b, a) => (
        a > 200 && ((r > 180 && g < 90 && b < 90)
          || (b > 180 && r < 90 && g < 90)
          || (g > 150 && r < 100 && b < 100))
      )))
        .withContext(`${shape} visible colored ring at 32px`)
        .toBeGreaterThan(2);
    }
  });

  it('does not turn enclosed Virus details into additional colored mini-rings', async () => {
    const imageData = await rasterizeSvgDataUri(getMixedNodeShapeDataUri(
      'virus',
      '#ffffff',
      '#000000',
      2,
      1,
      [
        { color: '#ff0000', alpha: 1 },
        { color: '#0000ff', alpha: 1 },
        { color: '#00ff00', alpha: 1 }
      ],
      null,
      { includeStroke: false, customShapePadding: 0, customShapeViewBoxPadding: 0 }
    ));
    const internalDetails = [
      { x: 131, y: 131, radius: 28 },
      { x: 178, y: 178, radius: 14 }
    ];

    internalDetails.forEach(detail => {
      let sampledPixels = 0;
      let whitePixels = 0;
      for (let y = 0; y < imageData.height; y++) {
        for (let x = 0; x < imageData.width; x++) {
          const distance = Math.hypot(x - detail.x, y - detail.y);
          if (distance < detail.radius + 2 || distance > detail.radius + 7) {
            continue;
          }
          sampledPixels++;
          const offset = (y * imageData.width + x) * 4;
          const red = imageData.data[offset];
          const green = imageData.data[offset + 1];
          const blue = imageData.data[offset + 2];
          const alpha = imageData.data[offset + 3];
          if (alpha > 240 && red > 245 && green > 245 && blue > 245) {
            whitePixels++;
          }
        }
      }

      expect(whitePixels / sampledPixels)
        .withContext(`white center surrounding Virus detail at ${detail.x},${detail.y}`)
        .toBeGreaterThan(0.6);
    });
  });

  it('survives the nested SVG image structure used by vector exports', async () => {
    const mixedVirus = getMixedNodeShapeDataUri(
      'virus',
      '#ffffff',
      '#000000',
      2,
      1,
      [
        { color: '#ff0000', alpha: 1 },
        { color: '#0000ff', alpha: 1 },
        { color: '#00ff00', alpha: 1 }
      ],
      null,
      { includeStroke: false, customShapePadding: 0, customShapeViewBoxPadding: 0 }
    );
    const imageData = await rasterizeSvgDataUri(wrapSvgImageDataUri(mixedVirus), 600);

    expect(countPixels(imageData, (r, g, b, a) => a > 240 && r > 245 && g > 245 && b > 245))
      .toBeGreaterThan(100);
    expect(countPixels(imageData, (r, g, b, a) => a > 240 && r > 220 && g < 40 && b < 40))
      .toBeGreaterThan(100);
    expect(countPixels(imageData, (r, g, b, a) => a > 240 && b > 220 && r < 40 && g < 40))
      .toBeGreaterThan(100);
    expect(countPixels(imageData, (r, g, b, a) => a > 240 && g > 220 && r < 40 && b < 40))
      .toBeGreaterThan(100);
    expect(countPixels(imageData, (_r, _g, _b, a) => a === 0)).toBeGreaterThan(100);
  });

  it('uses SVG geometry hit testing when Path2D is unavailable', async () => {
    const path2DDescriptor = Object.getOwnPropertyDescriptor(window, 'Path2D');
    const originalPath2D = window.Path2D;
    const fallbackDataUris: Array<{ shape: string; dataUri: string }> = [];
    clearGeometryCenterMaskCache();

    try {
      Object.defineProperty(window, 'Path2D', {
        configurable: true,
        writable: true,
        value: undefined
      });

      for (const shape of ['virus', 'parasite', 'man']) {
        const dataUri = getMixedNodeShapeDataUri(
          shape,
          '#ffffff',
          '#000000',
          2,
          1,
          [
            { color: '#ff0000', alpha: 1 },
            { color: '#0000ff', alpha: 1 }
          ],
          null,
          { includeStroke: false, customShapePadding: 0, customShapeViewBoxPadding: 0 }
        );
        const svg = decodeSvgDataUri(dataUri);
        expect(svg).withContext(`${shape} fallback strategy`)
          .toContain('data-mt-mixed-ring-center-strategy="hole-filled-euclidean-distance-transform"');
        expect(svg).withContext(`${shape} fallback center`)
          .toContain('data-mt-mixed-ring-center="geometry-distance-mask"');
        expect(svg).withContext(`${shape} SVG geometry rasterizer`)
          .toContain('data-mt-mixed-ring-center-rasterization="svg-is-point-in-fill"');
        expect(svg).not.toContain('<feMorphology');
        fallbackDataUris.push({ shape, dataUri });
      }
    } finally {
      if (path2DDescriptor) {
        Object.defineProperty(window, 'Path2D', path2DDescriptor);
      } else {
        Object.defineProperty(window, 'Path2D', {
          configurable: true,
          writable: true,
          value: originalPath2D
        });
      }
      clearGeometryCenterMaskCache();
    }

    for (const { shape, dataUri } of fallbackDataUris) {
      const imageData = await rasterizeSvgDataUri(dataUri);
      expect(countPixels(imageData, (r, g, b, a) => a > 220 && r > 235 && g > 235 && b > 235))
        .withContext(`${shape} fallback white center`)
        .toBeGreaterThan(10);
      expect(countPixels(imageData, (r, g, b, a) => (
        a > 220 && ((r > 180 && g < 90 && b < 90) || (b > 180 && r < 90 && g < 90))
      )))
        .withContext(`${shape} fallback colored ring`)
        .toBeGreaterThan(10);

      const smallImageData = await rasterizeSvgDataUri(dataUri, 32);
      expect(countPixels(smallImageData, (r, g, b, a) => (
        a > 180 && r > 215 && g > 215 && b > 215
      )))
        .withContext(`${shape} SVG fallback white center at 32px`)
        .toBeGreaterThan(0);
    }
  });

  it('keeps a visible hole-closing fallback when neither geometry API is available', async () => {
    const path2DDescriptor = Object.getOwnPropertyDescriptor(window, 'Path2D');
    const originalPath2D = window.Path2D;
    const geometryPrototype = SVGGeometryElement.prototype;
    const pointInFillDescriptor = Object.getOwnPropertyDescriptor(geometryPrototype, 'isPointInFill');
    const originalPointInFill = geometryPrototype.isPointInFill;
    let fallbackDataUri = '';
    clearGeometryCenterMaskCache();

    try {
      Object.defineProperty(window, 'Path2D', {
        configurable: true,
        writable: true,
        value: undefined
      });
      Object.defineProperty(geometryPrototype, 'isPointInFill', {
        configurable: true,
        writable: true,
        value: undefined
      });
      fallbackDataUri = getMixedNodeShapeDataUri(
        'virus',
        '#ffffff',
        '#000000',
        2,
        1,
        [
          { color: '#ff0000', alpha: 1 },
          { color: '#0000ff', alpha: 1 }
        ],
        null,
        { includeStroke: false, customShapePadding: 0, customShapeViewBoxPadding: 0 }
      );
      const svg = decodeSvgDataUri(fallbackDataUri);
      expect(svg).toContain('data-mt-mixed-ring-center-strategy="morphological-closing-fallback"');
      expect(svg).toContain('data-mt-mixed-ring-center="morphological-closing-fallback"');
      expect((svg.match(/<feMorphology/g) || []).length).toBe(2);
    } finally {
      if (path2DDescriptor) {
        Object.defineProperty(window, 'Path2D', path2DDescriptor);
      } else {
        Object.defineProperty(window, 'Path2D', {
          configurable: true,
          writable: true,
          value: originalPath2D
        });
      }
      if (pointInFillDescriptor) {
        Object.defineProperty(geometryPrototype, 'isPointInFill', pointInFillDescriptor);
      } else {
        Object.defineProperty(geometryPrototype, 'isPointInFill', {
          configurable: true,
          writable: true,
          value: originalPointInFill
        });
      }
      clearGeometryCenterMaskCache();
    }

    const imageData = await rasterizeSvgDataUri(fallbackDataUri);
    expect(countPixels(imageData, (r, g, b, a) => a > 220 && r > 235 && g > 235 && b > 235))
      .toBeGreaterThan(10);
    expect(countPixels(imageData, (r, g, b, a) => (
      a > 220 && ((r > 180 && g < 90 && b < 90) || (b > 180 && r < 90 && g < 90))
    ))).toBeGreaterThan(10);
  });
});

describe('node shape category normalization', () => {
  it('merges blank and N/A aliases into one empty table count', () => {
    const result = aggregateNodeShapeCategories([
      { visible: true, Genotype: undefined },
      { visible: true, Genotype: null },
      { visible: true, Genotype: 'N/A' },
      { visible: true, Genotype: 'n/a' },
      { visible: true, Genotype: '(Empty)' },
      { visible: true, Genotype: '2a' },
      { visible: false, Genotype: 'N/A' }
    ], 'Genotype');

    expect(Array.from(result.counts.entries())).toEqual([
      ['null', 5],
      ['2a', 1]
    ]);
    expect(result.visibleNodeCount).toBe(6);
  });

  it('resolves N/A aliases through the shared empty-category shape', () => {
    const widgets = {
      'node-symbol': 'ellipse',
      'node-symbol-variable': 'Genotype'
    };
    const style = {
      nodeSymbolsTableKeys: { Genotype: ['null', '2a'] },
      nodeSymbolsTable: { Genotype: ['triangle', 'square'] }
    };
    const nodeSymbolMap = (value: any) => value === 'null' ? 'triangle' : 'square';

    expect(resolveNodeShapeForNode({ Genotype: 'N/A' }, widgets, style, nodeSymbolMap)).toBe('triangle');
    expect(resolveNodeShapeForNode({ Genotype: 'n/a' }, widgets, style, nodeSymbolMap)).toBe('triangle');
    expect(resolveNodeShapeForNode({ Genotype: null }, widgets, style, nodeSymbolMap)).toBe('triangle');
    expect(resolveNodeShapeForNode({ Genotype: '2a' }, widgets, style, nodeSymbolMap)).toBe('rectangle');
  });
});
