import {
  CANVAS_FALLBACK_MAX_EDGES,
  CANVAS_FALLBACK_MAX_NODES,
  resolveNetworkRendererMode,
  shouldUseTableOnlyCanvasFallback,
} from './network-renderer-comparison';

describe('network renderer selection', () => {
  it('uses Sigma as the production default', () => {
    expect(resolveNetworkRendererMode('https://example.test/')).toBe('sigma');
    expect(resolveNetworkRendererMode('https://example.test/?unrelated=1')).toBe('sigma');
    expect(resolveNetworkRendererMode('not a valid absolute URL')).toBe('sigma');
  });

  it('recognizes explicit Sigma and Cytoscape compatibility modes', () => {
    expect(resolveNetworkRendererMode('https://example.test/?renderer=sigma')).toBe('sigma');
    expect(resolveNetworkRendererMode('https://example.test/?renderer=cytoscape-canvas'))
      .toBe('cytoscape-canvas');
    expect(resolveNetworkRendererMode('https://example.test/?renderer=cytoscape_canvas'))
      .toBe('cytoscape-canvas');
    expect(resolveNetworkRendererMode('https://example.test/?renderer=cytoscape'))
      .toBe('cytoscape-canvas');
    expect(resolveNetworkRendererMode('https://example.test/?renderer=cytoscape-webgl'))
      .toBe('cytoscape-webgl');
  });

  it('falls back to Sigma for unknown renderer values', () => {
    expect(resolveNetworkRendererMode('https://example.test/?renderer=unknown')).toBe('sigma');
  });

  it('protects the automatic Canvas fallback from unsafe graph sizes', () => {
    expect(shouldUseTableOnlyCanvasFallback(CANVAS_FALLBACK_MAX_NODES, CANVAS_FALLBACK_MAX_EDGES))
      .toBeFalse();
    expect(shouldUseTableOnlyCanvasFallback(CANVAS_FALLBACK_MAX_NODES + 1, 0)).toBeTrue();
    expect(shouldUseTableOnlyCanvasFallback(0, CANVAS_FALLBACK_MAX_EDGES + 1)).toBeTrue();
  });
});
