import { aggregateNodeShapeCategories, getMixedNodeShapeDataUri, resolveNodeShapeForNode } from './node-shapes';

function decodeSvgDataUri(dataUri: string): string {
  return decodeURIComponent(dataUri.split(',')[1]);
}

describe('mixed node shape SVG helpers', () => {
  const segments = [
    { value: '2a', color: '#00aa00', alpha: 0.4, weight: 1 },
    { value: '3a', color: '#ffff00', alpha: 0.8, weight: 1 }
  ];

  it('emits diagonal stripe fills with the component colors', () => {
    const svg = decodeSvgDataUri(getMixedNodeShapeDataUri('triangle', '#ffffff', '#000000', 4, 1, segments));

    expect(svg).toContain('<pattern');
    expect(svg).toContain('patternTransform="rotate(45)"');
    expect(svg).toContain('fill="#00aa00"');
    expect(svg).toContain('fill="#ffff00"');
    expect(svg).toContain('width="100" height="100"');
    expect(svg).not.toContain('A 1 1 0');
  });

  it('does not emit a mixed pattern when fewer than two segments are supplied', () => {
    const svg = decodeSvgDataUri(getMixedNodeShapeDataUri(
      'triangle',
      '#ffffff',
      '#000000',
      4,
      1,
      [segments[0]]
    ));

    expect(svg).not.toContain('<pattern');
    expect(svg).toContain('fill="#ffffff"');
  });

  it('keeps stripe bands four screen pixels wide across rendered node sizes', () => {
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

    expect(smallSvg).toContain('width="120" height="120"');
    expect(largeSvg).toContain('width="60" height="60"');
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
    expect(svg).toContain('fill="url(#mixed-node-fill)"');
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
  });

  it('clips custom icon shapes to the selected path instead of using pie arcs', () => {
    const svg = decodeSvgDataUri(getMixedNodeShapeDataUri('virus', '#ffffff', '#000000', 8, 1, segments));

    expect(svg).toContain('<pattern');
    expect(svg).toContain('fill="url(#mixed-node-fill)"');
    expect(svg).not.toContain('A 1 1 0');
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

    expect(svg).toContain('fill="url(#mixed-node-fill)"');
    expect(svg).not.toContain('stroke-width="8"');
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
