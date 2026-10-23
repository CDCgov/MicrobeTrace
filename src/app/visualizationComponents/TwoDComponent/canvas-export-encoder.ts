function encodeCanvasOnMainThread(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('Unable to encode the export canvas.'));
    }, mimeType, quality);
  });
}

/**
 * Encodes a completed 2D canvas through OffscreenCanvas when supported.
 * Chromium can otherwise spend a long native task in HTMLCanvasElement.toBlob(),
 * during which it may display its unresponsive-page prompt even though the
 * application is intentionally exporting.
 */
export async function encodeCanvasOffMainThread(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality?: number,
): Promise<Blob> {
  if (
    typeof OffscreenCanvas === 'undefined'
  ) {
    return encodeCanvasOnMainThread(canvas, mimeType, quality);
  }

  const offscreen = new OffscreenCanvas(canvas.width, canvas.height);
  const context = offscreen.getContext('2d');
  if (!context) {
    return encodeCanvasOnMainThread(canvas, mimeType, quality);
  }
  context.drawImage(canvas, 0, 0);
  return offscreen.convertToBlob({ type: mimeType, quality });
}
