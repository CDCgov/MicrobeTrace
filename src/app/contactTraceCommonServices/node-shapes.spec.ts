import { getMixedNodeShapeDataUri } from './node-shapes';

function decodeSvgDataUri(dataUri: string): string {
  return decodeURIComponent(dataUri.split(',')[1]);
}

describe('mixed node shape SVG helpers', () => {
  const segments = [
    { value: '2a', color: '#00aa00', alpha: 0.4, weight: 1 },
    { value: '3a', color: '#ffff00', alpha: 0.8, weight: 1 }
  ];

  it('emits hard-stop band fills with the component colors', () => {
    const svg = decodeSvgDataUri(getMixedNodeShapeDataUri('triangle', '#ffffff', '#000000', 4, 1, segments));

    expect(svg).toContain('<linearGradient');
    expect(svg).toContain('stop-color="#00aa00"');
    expect(svg).toContain('stop-color="#ffff00"');
    expect(svg).toContain('offset="50%"');
    expect(svg).not.toContain('A 1 1 0');
  });

  it('does not emit a mixed gradient when fewer than two segments are supplied', () => {
    const svg = decodeSvgDataUri(getMixedNodeShapeDataUri(
      'triangle',
      '#ffffff',
      '#000000',
      4,
      1,
      [segments[0]]
    ));

    expect(svg).not.toContain('<linearGradient');
    expect(svg).toContain('fill="#ffffff"');
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

    expect(svg).toContain('<linearGradient');
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
