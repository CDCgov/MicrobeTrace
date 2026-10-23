import { normalizeNetworkRendererViewState } from './network-renderer-view-state';

describe('normalizeNetworkRendererViewState', () => {
  it('preserves a valid renderer-neutral camera and edge detail mode', () => {
    expect(normalizeNetworkRendererViewState({
      centerX: '120',
      centerY: -80,
      graphUnitsPerPixel: 2,
      edgeDetailMode: 'all',
    })).toEqual({
      centerX: 120,
      centerY: -80,
      graphUnitsPerPixel: 2,
      edgeDetailMode: 'all',
    });
  });

  it('uses overview for unknown edge detail modes', () => {
    expect(normalizeNetworkRendererViewState({
      centerX: 0,
      centerY: 0,
      graphUnitsPerPixel: 1,
      edgeDetailMode: 'unknown',
    })?.edgeDetailMode).toBe('overview');
  });

  it('rejects non-finite centers and non-positive scale', () => {
    expect(normalizeNetworkRendererViewState({
      centerX: Number.NaN,
      centerY: 0,
      graphUnitsPerPixel: 1,
    })).toBeNull();
    expect(normalizeNetworkRendererViewState({
      centerX: 0,
      centerY: 0,
      graphUnitsPerPixel: 0,
    })).toBeNull();
  });
});
