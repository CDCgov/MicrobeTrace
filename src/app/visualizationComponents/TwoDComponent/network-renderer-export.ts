export interface NetworkRendererExportMetadata {
  renderer: string;
  residentNodeCount: number;
  residentEdgeCount: number;
  drawnNodeCount: number;
  drawnEdgeCount: number;
  collapsedGroupIds: string[];
  geographicOverlayActive: boolean;
  mixedValueDonutNodeCount: number;
  qcOverlayNodeCount: number;
  uncertaintyOverlayNodeCount: number;
}

export interface NetworkRendererCompositeExport {
  width: number;
  height: number;
  pixelRatio: number;
  canvasLayerCount: number;
  pngDataUrl: string;
  svg: string;
  metadata: NetworkRendererExportMetadata;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function captureNetworkRendererComposite(
  host: HTMLElement,
  metadata: NetworkRendererExportMetadata,
  backgroundColor = '#ffffff',
  requestedPixelRatio = window.devicePixelRatio || 1,
): NetworkRendererCompositeExport {
  const hostBounds = host.getBoundingClientRect();
  const width = Math.max(1, Math.round(hostBounds.width));
  const height = Math.max(1, Math.round(hostBounds.height));
  const pixelRatio = Math.max(1, Math.min(4, Number(requestedPixelRatio) || 1));
  const output = document.createElement('canvas');
  output.width = Math.max(1, Math.round(width * pixelRatio));
  output.height = Math.max(1, Math.round(height * pixelRatio));
  const context = output.getContext('2d');
  if (!context) throw new Error('Unable to create the network export canvas.');
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.fillStyle = backgroundColor || '#ffffff';
  context.fillRect(0, 0, width, height);

  const layers = Array.from(host.querySelectorAll('canvas')).filter(layer => {
    const bounds = layer.getBoundingClientRect();
    const style = window.getComputedStyle(layer);
    return bounds.width > 0 && bounds.height > 0
      && style.display !== 'none'
      && style.visibility !== 'hidden'
      && Number(style.opacity || 1) > 0;
  });

  layers.forEach(layer => {
    const bounds = layer.getBoundingClientRect();
    const style = window.getComputedStyle(layer);
    context.save();
    context.globalAlpha = Math.max(0, Math.min(1, Number(style.opacity || 1)));
    context.drawImage(
      layer,
      bounds.left - hostBounds.left,
      bounds.top - hostBounds.top,
      bounds.width,
      bounds.height,
    );
    context.restore();
  });

  const pngDataUrl = output.toDataURL('image/png');
  const metadataJson = escapeXml(JSON.stringify(metadata));
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<metadata id="microbetrace-renderer-export-metadata">${metadataJson}</metadata>`,
    `<image width="${width}" height="${height}" href="${pngDataUrl}"/>`,
    '</svg>',
  ].join('');

  return {
    width,
    height,
    pixelRatio,
    canvasLayerCount: layers.length,
    pngDataUrl,
    svg,
    metadata,
  };
}
