export type NetworkRendererMode = 'cytoscape-canvas' | 'cytoscape-webgl' | 'sigma';

export interface NetworkRendererDiagnostics {
  requestedMode: NetworkRendererMode;
  activeMode: NetworkRendererMode;
  webglRequested: boolean;
  webglActive: boolean;
  fallbackReason: string | null;
  residentNodeCount: number;
  residentEdgeCount: number;
  drawnNodeCount: number;
  drawnEdgeCount: number;
  groupCount: number;
  renderedGroupHullCount: number;
  compoundNodeCount: number;
  geographicOverlayActive: boolean;
  geographicPositionedNodeCount: number;
  mixedValueDonutNodeCount: number;
  qcOverlayNodeCount: number;
  uncertaintyOverlayNodeCount: number;
  nodeFeatureRenderingMode: 'canvas-overlay' | 'sigma-webgl-program';
}

export function resolveNetworkRendererMode(url: string): NetworkRendererMode {
  try {
    const renderer = new URL(url).searchParams.get('renderer')?.toLowerCase();
    if (renderer === 'sigma') return 'sigma';
    if (renderer === 'cytoscape-webgl' || renderer === 'cytoscape_webgl') {
      return 'cytoscape-webgl';
    }
  } catch {
    // An invalid or incomplete URL should retain the production renderer.
  }

  return 'cytoscape-canvas';
}

export function canCreateWebGL2Context(documentRef: Document): boolean {
  try {
    const canvas = documentRef.createElement('canvas');
    return Boolean(canvas.getContext('webgl2'));
  } catch {
    return false;
  }
}
