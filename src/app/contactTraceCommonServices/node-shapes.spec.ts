import { aggregateNodeShapeCategories, getMixedNodeRingWidth, getMixedNodeShapeDataUri, resolveNodeShapeForNode } from './node-shapes';

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

  it('uses a white center and a proportionally segmented outer ring for mixed values', () => {
    const svg = decodeSvgDataUri(getMixedNodeShapeDataUri('triangle', '#123456', '#000000', 4, 0.4, segments));

    expect(svg).not.toContain('<pattern');
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).not.toContain('fill="#123456"');
    expect(svg).toContain('stroke="#00aa00"');
    expect(svg).toContain('stroke="#ffff00"');
    expect(svg).toContain('stroke-dasharray="0.75 0.25"');
    expect(svg).toContain('stroke-dasharray="0.25 0.75"');
    expect(svg).toContain('data-mt-segment-end-fraction="0.75"');
    expect(svg).toContain('data-mt-segment-end-fraction="1"');
    expect(svg).toContain('data-mt-mixed-ring-segment="0"');
    expect(svg).toContain('data-mt-mixed-ring-width-radius-fraction="0.5"');
    expect(svg).not.toContain('A 1 1 0');
  });

  it('fills Star and Vee silhouettes with mixed-color sectors instead of white centers', async () => {
    const opaqueSegments = [
      { color: '#ff0000', alpha: 1 },
      { color: '#0000ff', alpha: 1 }
    ];

    for (const shape of ['star', 'vee']) {
      const dataUri = getMixedNodeShapeDataUri(
        shape,
        '#ffffff',
        '#000000',
        2,
        1,
        opaqueSegments,
        null,
        { fillCanvas: true, includeStroke: false }
      );
      const svg = decodeSvgDataUri(dataUri);
      const imageData = await rasterizeSvgDataUri(dataUri);

      expect(svg).withContext(`${shape} full-silhouette marker`)
        .toContain('data-mt-basic-mixed-fill="silhouette-sectors"');
      expect(svg).withContext(`${shape} has no white center`)
        .not.toContain('data-mt-mixed-ring-center="basic-shape"');
      expect(svg).withContext(`${shape} uses filled sectors`).not.toContain('stroke-dasharray');
      expect(countPixels(imageData, (r, g, b, a) => a > 240 && r > 220 && g < 40 && b < 40))
        .withContext(`${shape} red sector`)
        .toBeGreaterThan(20);
      expect(countPixels(imageData, (r, g, b, a) => a > 240 && b > 220 && r < 40 && g < 40))
        .withContext(`${shape} blue sector`)
        .toBeGreaterThan(20);
      expect(countPixels(imageData, (r, g, b, a) => a > 240 && r > 245 && g > 245 && b > 245))
        .withContext(`${shape} white center pixels`)
        .toBe(0);
    }
  });

  it('lets Cytoscape clip 2D Star and Vee mixed colors to their native shapes', async () => {
    const opaqueSegments = [
      { color: '#ff0000', alpha: 1 },
      { color: '#0000ff', alpha: 1 }
    ];

    for (const shape of ['star', 'vee']) {
      const dataUri = getMixedNodeShapeDataUri(
        shape,
        '#ffffff',
        '#000000',
        2,
        1,
        opaqueSegments,
        null,
        { fillCanvas: true, includeStroke: false, useNativeShapeClip: true }
      );
      const svg = decodeSvgDataUri(dataUri);
      const imageData = await rasterizeSvgDataUri(dataUri);
      const cornerAlphaIndexes = [
        0,
        (imageData.width - 1) * 4,
        (imageData.width * (imageData.height - 1)) * 4,
        ((imageData.width * imageData.height) - 1) * 4
      ];

      expect(svg).withContext(`${shape} native clipping marker`)
        .toContain('data-mt-basic-mixed-fill="native-shape-sectors"');
      expect(svg).withContext(`${shape} has no SVG silhouette clip`).not.toContain('<clipPath');
      cornerAlphaIndexes.forEach(index => {
        expect(imageData.data[index + 3]).withContext(`${shape} covers the source canvas`).toBeGreaterThan(240);
      });
    }
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

  it('leaves translucent regular-node ring segments transparent to the visualization background', async () => {
    const translucentSegments = [
      { color: '#ff0000', alpha: 0.35, weight: 3 },
      { color: '#0000ff', alpha: 1, weight: 1 }
    ];
    const renderCases = [
      {
        shape: 'ellipse',
        options: { fillCanvas: true, includeStroke: false, renderedSize: 24 }
      },
      {
        shape: 'virus',
        options: { includeStroke: false, customShapePadding: 0, customShapeViewBoxPadding: 0, renderedSize: 24 }
      }
    ];

    for (const renderCase of renderCases) {
      const dataUri = getMixedNodeShapeDataUri(
        renderCase.shape,
        '#ffffff',
        '#000000',
        2,
        1,
        translucentSegments,
        null,
        renderCase.options
      );
      const svg = decodeSvgDataUri(dataUri);
      const imageData = await rasterizeSvgDataUri(dataUri);
      const translucentRedPixels = countPixels(
        imageData,
        (red, green, blue, alpha) => alpha > 40 && alpha < 180 && red > green + 40 && red > blue + 40
      );

      expect(svg).withContext(`${renderCase.shape} segment opacity`).toContain('opacity="0.35"');
      expect(svg)
        .withContext(`${renderCase.shape} has no opaque full-canvas backing`)
        .not.toContain('<rect x="0" y="0" width="300" height="300" fill="#ffffff" fill-opacity="1"');
      expect(translucentRedPixels)
        .withContext(`${renderCase.shape} translucent ring pixels`)
        .toBeGreaterThan(20);
    }
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

  it('can fit a mixed basic ring to the full canvas without an opaque backing or oversized Cytoscape border', () => {
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

    expect(svg).not.toContain('<rect x="0" y="0" width="300" height="300"');
    expect(svg).toContain('data-mt-mixed-ring-center="basic-shape"');
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

  it('clips proportional angular sectors across full custom silhouettes instead of dashing their paths', () => {
    const svg = decodeSvgDataUri(getMixedNodeShapeDataUri('virus', '#ffffff', '#000000', 8, 1, segments));

    expect(svg).toContain('data-mt-mixed-ring-segment="0"');
    expect(svg).toContain('data-mt-segment-end-fraction="0.75"');
    expect(svg).toContain('data-mt-segment-end-fraction="1"');
    expect(svg).toContain('fill="#00aa00"');
    expect(svg).toContain('fill="#ffff00"');
    expect(svg).toContain('data-mt-custom-mixed-fill="silhouette-sectors"');
    expect(svg).toContain('<clipPath');
    expect(svg).toContain('fill="none" stroke="#000000" stroke-width="8"');
    expect(svg).not.toContain('data-mt-mixed-ring-center=');
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
    expect(svg).toContain('data-mt-custom-mixed-fill="silhouette-sectors"');
    expect(svg).not.toContain('stroke-width="8"');
    expect(svg).not.toContain('stroke-dasharray');
  });

  it('fills each custom geometry with sectors without adding white center masks', () => {
    const manSvg = decodeSvgDataUri(getMixedNodeShapeDataUri('man', '#ffffff', '#000000', 2, 1, segments));
    const parasiteSvg = decodeSvgDataUri(getMixedNodeShapeDataUri('parasite', '#ffffff', '#000000', 2, 1, segments));
    const virusSvg = decodeSvgDataUri(getMixedNodeShapeDataUri('virus', '#ffffff', '#000000', 2, 1, segments));

    [manSvg, parasiteSvg, virusSvg].forEach(svg => {
      expect(svg).toContain('data-mt-custom-mixed-fill="silhouette-sectors"');
      expect(svg).not.toContain('data-mt-mixed-ring-center=');
      expect((svg.match(/data-mt-mixed-ring-segment=/g) || []).length).toBe(2);
      expect(svg).not.toContain('<feMorphology');
      expect(svg).not.toContain('stroke-dasharray');
    });
  });

  it('rasterizes representative custom geometries with transparent backgrounds and full-silhouette colors', async () => {
    const opaqueSegments = [
      { color: '#ff0000', alpha: 1 },
      { color: '#0000ff', alpha: 1 },
      { color: '#00ff00', alpha: 1 }
    ];

    for (const shape of ['man', 'woman', 'person', 'parasite', 'virus', 'mosquito', 'tick', 'flea', 'fruits']) {
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
      expect(colorCount(255, 255, 255)).withContext(`${shape} has no white center`).toBe(0);
      expect(countPixels(imageData, (_r, _g, _b, alpha) => alpha === 0))
        .withContext(`${shape} transparent background`)
        .toBeGreaterThan(20);

      const smallRenderCases = [
        {
          sourceRenderedSize: 16,
          outputSize: 16,
          customShapeViewBoxPadding: 20,
          context: '16px fixed marker with Map padding'
        },
        {
          sourceRenderedSize: 20,
          outputSize: 10,
          customShapeViewBoxPadding: 0,
          context: '20px node at 0.5x zoom'
        }
      ];
      for (const renderCase of smallRenderCases) {
        const smallDataUri = getMixedNodeShapeDataUri(
          shape,
          '#ffffff',
          '#000000',
          2,
          1,
          opaqueSegments,
          null,
          {
            customShapePadding: 0,
            customShapeViewBoxPadding: renderCase.customShapeViewBoxPadding,
            renderedSize: renderCase.sourceRenderedSize
          }
        );
        const smallImageData = await rasterizeSvgDataUri(smallDataUri, renderCase.outputSize);
        const smallColorCount = (dominantChannel: 'red' | 'green' | 'blue') => countPixels(
          smallImageData,
          (r, g, b, a) => {
            if (a <= 100) {
              return false;
            }
            if (dominantChannel === 'red') {
              return r > g + 30 && r > b + 30;
            }
            if (dominantChannel === 'green') {
              return g > r + 30 && g > b + 30;
            }
            return b > r + 30 && b > g + 30;
          }
        );
        expect(smallColorCount('red'))
          .withContext(`${shape} red mixed segment for ${renderCase.context}`)
          .toBeGreaterThan(0);
        expect(smallColorCount('blue'))
          .withContext(`${shape} blue mixed segment for ${renderCase.context}`)
          .toBeGreaterThan(0);
        expect(smallColorCount('green'))
          .withContext(`${shape} green mixed segment for ${renderCase.context}`)
          .toBeGreaterThan(0);
      }
    }
  });

  it('does not add white center bands around enclosed Virus details', async () => {
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
        .withContext(`no white center surrounding Virus detail at ${detail.x},${detail.y}`)
        .toBeLessThan(0.05);
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
      .toBeLessThan(100);
    expect(countPixels(imageData, (r, g, b, a) => a > 240 && r > 220 && g < 40 && b < 40))
      .toBeGreaterThan(100);
    expect(countPixels(imageData, (r, g, b, a) => a > 240 && b > 220 && r < 40 && g < 40))
      .toBeGreaterThan(100);
    expect(countPixels(imageData, (r, g, b, a) => a > 240 && g > 220 && r < 40 && b < 40))
      .toBeGreaterThan(100);
    expect(countPixels(imageData, (_r, _g, _b, a) => a === 0)).toBeGreaterThan(100);
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
