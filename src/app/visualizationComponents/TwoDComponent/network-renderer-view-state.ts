import type { SigmaEdgeDetailMode } from './sigma-network-renderer.adapter';

export interface NetworkRendererViewState {
  centerX: number;
  centerY: number;
  graphUnitsPerPixel: number;
  edgeDetailMode: SigmaEdgeDetailMode;
}

export function normalizeNetworkRendererViewState(value: any): NetworkRendererViewState | null {
  const centerX = Number(value?.centerX);
  const centerY = Number(value?.centerY);
  const graphUnitsPerPixel = Number(value?.graphUnitsPerPixel);
  const edgeDetailMode = value?.edgeDetailMode;
  if (
    !Number.isFinite(centerX) || !Number.isFinite(centerY)
    || !Number.isFinite(graphUnitsPerPixel) || graphUnitsPerPixel <= 0
  ) return null;
  return {
    centerX,
    centerY,
    graphUnitsPerPixel,
    edgeDetailMode: edgeDetailMode === 'detail' || edgeDetailMode === 'all'
      ? edgeDetailMode
      : 'overview',
  };
}
