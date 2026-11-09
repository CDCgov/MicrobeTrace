import {
  hasMixedValueDonut,
  type NetworkNodeVisualFeatures,
} from '@app/contactTraceCommonServices/network-node-features';

export interface NetworkNodeFeatureGlyph {
  x: number;
  y: number;
  radius: number;
  features: NetworkNodeVisualFeatures;
}

export function prepareNetworkFeatureCanvas(
  layer: HTMLCanvasElement,
  width: number,
  height: number,
): CanvasRenderingContext2D | null {
  const pixelRatio = window.devicePixelRatio || 1;
  const renderWidth = Math.max(1, Math.round(width * pixelRatio));
  const renderHeight = Math.max(1, Math.round(height * pixelRatio));
  if (layer.width !== renderWidth || layer.height !== renderHeight) {
    layer.width = renderWidth;
    layer.height = renderHeight;
  }
  layer.style.width = `${width}px`;
  layer.style.height = `${height}px`;
  const context = layer.getContext('2d');
  if (!context) return null;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, width, height);
  return context;
}

/** Draws identical MT-owned feature semantics over either graph renderer. */
export function drawNetworkNodeFeatureGlyph(
  context: CanvasRenderingContext2D,
  glyph: NetworkNodeFeatureGlyph,
): void {
  const { x, y, features } = glyph;
  const radius = Math.max(3, glyph.radius);

  if (hasMixedValueDonut(features)) {
    const donutRadius = radius + Math.max(2, radius * 0.18);
    const lineWidth = Math.max(2.5, Math.min(7, radius * 0.34));
    let startAngle = -Math.PI / 2;
    context.save();
    context.lineWidth = lineWidth;
    for (const segment of features.donutSegments) {
      const endAngle = startAngle + Math.PI * 2 * segment.fraction;
      context.beginPath();
      context.strokeStyle = segment.color;
      context.arc(x, y, donutRadius, startAngle, endAngle);
      context.stroke();
      startAngle = endAngle;
    }
    context.restore();
  }
}
