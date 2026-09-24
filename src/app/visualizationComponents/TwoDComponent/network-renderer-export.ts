import { encodeCanvasOffMainThread } from './canvas-export-encoder';

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
  canvas: HTMLCanvasElement;
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

function canvasToPngDataUrl(canvas: HTMLCanvasElement): Promise<string> {
  return encodeCanvasOffMainThread(canvas, 'image/png').then(blob => (
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error ?? new Error('Unable to read the network export image.'));
      reader.readAsDataURL(blob);
    })
  ));
}

export async function captureNetworkRendererComposite(
  host: HTMLElement,
  metadata: NetworkRendererExportMetadata,
  backgroundColor = '#ffffff',
  requestedPixelRatio = window.devicePixelRatio || 1,
  encodePng = true,
): Promise<NetworkRendererCompositeExport> {
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

  // Canvas.toDataURL performs PNG compression synchronously and can keep the
  // browser's main thread busy long enough to trigger an "unresponsive page"
  // warning for a large/high-DPI export. toBlob schedules the encoder
  // asynchronously so the progress UI and browser event loop stay responsive.
  const pngDataUrl = encodePng ? await canvasToPngDataUrl(output) : '';
  const metadataJson = escapeXml(JSON.stringify(metadata));
  const svg = encodePng
    ? [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
        `<metadata id="microbetrace-renderer-export-metadata">${metadataJson}</metadata>`,
        `<image width="${width}" height="${height}" href="${pngDataUrl}"/>`,
        '</svg>',
      ].join('')
    : '';

  return {
    width,
    height,
    pixelRatio,
    canvasLayerCount: layers.length,
    canvas: output,
    pngDataUrl,
    svg,
    metadata,
  };
}
