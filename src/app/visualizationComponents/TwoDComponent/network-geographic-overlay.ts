import type { NetworkGeographicProjection } from '@app/contactTraceCommonServices/network-geography.model';
import { prepareNetworkFeatureCanvas } from './network-node-feature-overlay';

export interface NetworkOverlayPoint {
  x: number;
  y: number;
}

export type NetworkGraphToViewport = (point: NetworkOverlayPoint) => NetworkOverlayPoint;

export function drawNetworkGeographicOverlay(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  projection: NetworkGeographicProjection | null,
  graphToViewport: NetworkGraphToViewport,
): void {
  const context = prepareNetworkFeatureCanvas(canvas, width, height);
  if (!context || !projection) return;

  const { graphBounds } = projection;
  const topLeft = graphToViewport({ x: graphBounds.minX, y: graphBounds.minY });
  const bottomRight = graphToViewport({ x: graphBounds.maxX, y: graphBounds.maxY });
  const left = Math.min(topLeft.x, bottomRight.x);
  const right = Math.max(topLeft.x, bottomRight.x);
  const top = Math.min(topLeft.y, bottomRight.y);
  const bottom = Math.max(topLeft.y, bottomRight.y);

  context.save();
  context.fillStyle = 'rgba(219, 234, 254, 0.18)';
  context.strokeStyle = 'rgba(71, 85, 105, 0.28)';
  context.lineWidth = 1;
  context.fillRect(left, top, right - left, bottom - top);
  context.strokeRect(left, top, right - left, bottom - top);
  context.setLineDash([4, 5]);
  context.font = '10px sans-serif';
  context.fillStyle = 'rgba(30, 41, 59, 0.78)';

  projection.longitudeTicks.forEach(tick => {
    const x = graphToViewport({ x: tick.graphCoordinate, y: graphBounds.minY }).x;
    context.beginPath();
    context.moveTo(x, top);
    context.lineTo(x, bottom);
    context.stroke();
    if (x >= -40 && x <= width + 40 && top >= -20 && top <= height + 10) {
      context.fillText(tick.label, x + 3, top + 12);
    }
  });

  projection.latitudeTicks.forEach(tick => {
    const y = graphToViewport({ x: graphBounds.minX, y: tick.graphCoordinate }).y;
    context.beginPath();
    context.moveTo(left, y);
    context.lineTo(right, y);
    context.stroke();
    if (y >= -10 && y <= height + 20 && left >= -55 && left <= width + 10) {
      context.fillText(tick.label, left + 3, y - 3);
    }
  });

  context.setLineDash([]);
  context.font = '600 11px sans-serif';
  context.fillText(
    `${projection.latitudeField} / ${projection.longitudeField}`,
    Math.max(4, left + 4),
    Math.min(height - 4, bottom - 6),
  );
  context.restore();
}
