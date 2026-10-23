import { projectNetworkGeography } from './network-geography.model';

describe('renderer-neutral network geography', () => {
  it('projects longitude eastward and latitude northward with one shared scale', () => {
    const result = projectNetworkGeography([
      { id: 'atlanta', lat: 33.749, lon: -84.388 },
      { id: 'new-york', lat: 40.7128, lon: -74.006 },
      { id: 'seattle', lat: 47.6062, lon: -122.3321 },
    ], 'lat', 'lon');

    expect(result.projection).not.toBeNull();
    const atlanta = result.projection!.positions.get('atlanta')!;
    const newYork = result.projection!.positions.get('new-york')!;
    const seattle = result.projection!.positions.get('seattle')!;
    expect(seattle.x).toBeLessThan(atlanta.x);
    expect(atlanta.x).toBeLessThan(newYork.x);
    expect(seattle.y).toBeLessThan(newYork.y);
    expect(newYork.y).toBeLessThan(atlanta.y);
  });

  it('accepts hemisphere suffixes and isolates invalid coordinates in an unlocated tray', () => {
    const result = projectNetworkGeography([
      { id: 'valid', lat: '33.7N', lon: '84.3W' },
      { id: 'invalid', lat: 'unknown', lon: -84 },
    ], 'lat', 'lon');

    expect(result.projection!.positionedNodeIds).toEqual(['valid']);
    expect(result.projection!.invalidNodeIds).toEqual(['invalid']);
    expect(result.nodes.find(node => node.id === 'valid')!.geographicCoordinateValid).toBe(true);
    expect(result.nodes.find(node => node.id === 'invalid')!.geographicCoordinateValid).toBe(false);
  });

  it('falls back without activating an overlay when no coordinates are valid', () => {
    const result = projectNetworkGeography([{ id: 'a', lat: '', lon: '' }], 'lat', 'lon');
    expect(result.projection).toBeNull();
    expect(result.nodes[0].geographicCoordinateValid).toBe(false);
  });
});
