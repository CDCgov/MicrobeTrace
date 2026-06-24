import { getSegmentedNodeShapeDataUri } from './node-shapes';

function decodeSvgDataUri(dataUri: string): string {
  return decodeURIComponent(dataUri.split(',')[1] ?? '');
}

describe('segmented node shapes', () => {
  it('renders segmented borders on the selected non-circle shape outline', () => {
    const svg = decodeSvgDataUri(getSegmentedNodeShapeDataUri(
      'triangle',
      '#ffffff',
      '#000000',
      4,
      1,
      [
        { color: '#00aa00', weight: 1 },
        { color: '#ffff00', weight: 1 },
      ]
    ));

    expect(svg).toContain('M 150 35 L 262 245 L 38 245 Z');
    expect(svg).toContain('stroke-dasharray');
    expect(svg).not.toContain('A 124 124');
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
  });
});
