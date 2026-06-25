<<<<<<< HEAD
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
=======
import { getSegmentedNodeShapeDataUri } from './node-shapes';

function decodeSvgDataUri(dataUri: string): string {
  return decodeURIComponent(dataUri.split(',')[1] ?? '');
}

describe('segmented node shapes', () => {
  it('renders segmented borders on the selected non-circle shape outline', () => {
    const svg = decodeSvgDataUri(getSegmentedNodeShapeDataUri(
>>>>>>> 660c7154f44e9ff241dcee8b5abe4e2d72d6de52
      'triangle',
      '#ffffff',
      '#000000',
      4,
      1,
<<<<<<< HEAD
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
    expect(svg).toContain('fill="url(#mixed-node-fill)"');
    expect(svg).not.toContain('stroke-width="48"');
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
=======
      [
        { color: '#00aa00', weight: 1 },
        { color: '#ffff00', weight: 1 },
      ]
    ));

    expect(svg).toContain('M 150 35 L 262 245 L 38 245 Z');
    expect(svg).toContain('pathLength="100"');
    expect(svg).toContain('stroke-dasharray');
    expect(svg).not.toContain('A 124 124');
  });

  it('renders complex custom shape borders as a segmented halo around the icon', () => {
    const svg = decodeSvgDataUri(getSegmentedNodeShapeDataUri(
      'virus',
      '#ffffff',
      '#000000',
      10,
      1,
      [
        { color: '#00aa00', weight: 1 },
        { color: '#ffff00', weight: 1 },
      ],
      null,
      { customShapePadding: 12 }
    ));

    expect(svg).toContain('x="12"');
    expect(svg).toContain('width="276"');
    expect(svg).toContain('<rect');
    expect(svg).toContain('pathLength="100"');
    expect(svg).toContain('stroke-dasharray="50 50"');
  });

  it('keeps circle shapes as circular segmented borders', () => {
    const svg = decodeSvgDataUri(getSegmentedNodeShapeDataUri(
      'ellipse',
      '#ffffff',
      '#000000',
      4,
      1,
      [
        { color: '#00aa00', weight: 1 },
        { color: '#ffff00', weight: 1 },
      ]
    ));

    expect(svg).toContain('A 124 124');
>>>>>>> 660c7154f44e9ff241dcee8b5abe4e2d72d6de52
  });
});
