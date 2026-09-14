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
  let outerRadius = radius;

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
    outerRadius = donutRadius + lineWidth / 2;
  }

  if (features.uncertainty !== null && features.uncertainty > 0) {
    const uncertaintyRadius = outerRadius + 3;
    context.save();
    context.beginPath();
    context.arc(x, y, uncertaintyRadius, 0, Math.PI * 2);
    context.setLineDash([2.5, 3]);
    context.lineWidth = 1.5 + features.uncertainty;
    context.globalAlpha = 0.35 + features.uncertainty * 0.55;
    context.strokeStyle = '#7c3aed';
    context.stroke();
    context.restore();
    outerRadius = uncertaintyRadius + 2;
  }

  if (features.qc) {
    const badgeRadius = Math.max(4, Math.min(7, radius * 0.42));
    const badgeX = x + outerRadius * 0.72;
    const badgeY = y - outerRadius * 0.72;
    context.save();
    context.beginPath();
    context.arc(badgeX, badgeY, badgeRadius, 0, Math.PI * 2);
    context.fillStyle = features.qc.color;
    context.fill();
    context.lineWidth = 1.5;
    context.strokeStyle = '#ffffff';
    context.stroke();
    context.fillStyle = '#ffffff';
    context.font = `700 ${Math.max(8, badgeRadius * 1.6)}px sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(features.qc.symbol, badgeX, badgeY + 0.5);
    context.restore();
  }
}
