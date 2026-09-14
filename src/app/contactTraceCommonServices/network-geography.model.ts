const MAX_MERCATOR_LATITUDE = 85.05112878;
const DEFAULT_GRAPH_SPAN = 1000;

export interface NetworkGeographicPosition {
  id: string;
  latitude: number;
  longitude: number;
  x: number;
  y: number;
}

export interface NetworkGeographicTick {
  value: number;
  graphCoordinate: number;
  label: string;
}

export interface NetworkGeographicProjection {
  latitudeField: string;
  longitudeField: string;
  positionedNodeIds: string[];
  invalidNodeIds: string[];
  positions: Map<string, NetworkGeographicPosition>;
  longitudeTicks: NetworkGeographicTick[];
  latitudeTicks: NetworkGeographicTick[];
  graphBounds: { minX: number; maxX: number; minY: number; maxY: number };
}

export interface ProjectedNetworkGeographicNode<T> {
  node: T & {
    x: number;
    y: number;
    geographicCoordinateValid: boolean;
    geographicLatitude?: number;
    geographicLongitude?: number;
  };
  position: NetworkGeographicPosition | null;
}

export interface ProjectNetworkGeographyResult<T> {
  nodes: Array<T & {
    x: number;
    y: number;
    geographicCoordinateValid: boolean;
    geographicLatitude?: number;
    geographicLongitude?: number;
  }>;
  projection: NetworkGeographicProjection | null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function mercatorY(latitude: number): number {
  const radians = clamp(latitude, -MAX_MERCATOR_LATITUDE, MAX_MERCATOR_LATITUDE) * Math.PI / 180;
  return Math.log(Math.tan(Math.PI / 4 + radians / 2));
}

function coordinate(value: unknown, positiveHemisphere: string, negativeHemisphere: string): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const normalized = String(value ?? '').trim().toUpperCase();
  if (!normalized) return null;
  const hemisphere = normalized.match(new RegExp(`[${positiveHemisphere}${negativeHemisphere}]$`))?.[0];
  const parsed = Number(normalized.replace(/[NSEW]$/, '').trim());
  if (!Number.isFinite(parsed)) return null;
  return hemisphere === negativeHemisphere ? -Math.abs(parsed) : parsed;
}

function tickValues(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (Math.abs(max - min) < 1e-9) return [min];
  return Array.from({ length: count }, (_, index) => min + (max - min) * index / (count - 1));
}

function coordinateLabel(value: number, positive: string, negative: string): string {
  const suffix = value < 0 ? negative : positive;
  return `${Math.abs(value).toFixed(1)}°${suffix}`;
}

export function projectNetworkGeography<T extends Record<string, any>>(
  sourceNodes: T[],
  latitudeField: string,
  longitudeField: string,
  graphSpan = DEFAULT_GRAPH_SPAN,
): ProjectNetworkGeographyResult<T> {
  const valid = sourceNodes.map(node => {
    const id = String(node._id ?? node.id ?? '');
    const latitude = coordinate(node[latitudeField], 'N', 'S');
    const longitude = coordinate(node[longitudeField], 'E', 'W');
    if (
      !id || latitude === null || longitude === null ||
      latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180
    ) return null;
    return { id, latitude, longitude, mercatorX: longitude * Math.PI / 180, mercatorY: mercatorY(latitude) };
  }).filter(Boolean) as Array<{
    id: string;
    latitude: number;
    longitude: number;
    mercatorX: number;
    mercatorY: number;
  }>;

  if (!valid.length) {
    return {
      nodes: sourceNodes.map((node, index) => ({
        ...node,
        x: Number.isFinite(Number(node.x)) ? Number(node.x) : index * 20,
        y: Number.isFinite(Number(node.y)) ? Number(node.y) : 0,
        geographicCoordinateValid: false,
      })),
      projection: null,
    };
  }

  const minMercatorX = Math.min(...valid.map(point => point.mercatorX));
  const maxMercatorX = Math.max(...valid.map(point => point.mercatorX));
  const minMercatorY = Math.min(...valid.map(point => point.mercatorY));
  const maxMercatorY = Math.max(...valid.map(point => point.mercatorY));
  const centerX = (minMercatorX + maxMercatorX) / 2;
  const centerY = (minMercatorY + maxMercatorY) / 2;
  const mercatorSpan = Math.max(maxMercatorX - minMercatorX, maxMercatorY - minMercatorY, 1e-6);
  const scale = graphSpan / mercatorSpan;
  const positions = new Map<string, NetworkGeographicPosition>();
  valid.forEach(point => {
    positions.set(point.id, {
      id: point.id,
      latitude: point.latitude,
      longitude: point.longitude,
      x: (point.mercatorX - centerX) * scale,
      // Graph/SVG y increases downward, so northern coordinates are smaller.
      y: (centerY - point.mercatorY) * scale,
    });
  });

  const invalidNodeIds: string[] = [];
  const unlocatedStartY = graphSpan * 0.62;
  const unlocatedColumns = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, sourceNodes.length - valid.length))));
  const nodes = sourceNodes.map((node, index) => {
    const id = String(node._id ?? node.id ?? '');
    const position = positions.get(id);
    if (position) {
      return {
        ...node,
        x: position.x,
        y: position.y,
        geographicCoordinateValid: true,
        geographicLatitude: position.latitude,
        geographicLongitude: position.longitude,
      };
    }

    invalidNodeIds.push(id);
    const invalidIndex = invalidNodeIds.length - 1;
    return {
      ...node,
      x: -graphSpan / 2 + (invalidIndex % unlocatedColumns) * 35,
      y: unlocatedStartY + Math.floor(invalidIndex / unlocatedColumns) * 35,
      geographicCoordinateValid: false,
    };
  });

  const minLongitude = Math.min(...valid.map(point => point.longitude));
  const maxLongitude = Math.max(...valid.map(point => point.longitude));
  const minLatitude = Math.min(...valid.map(point => point.latitude));
  const maxLatitude = Math.max(...valid.map(point => point.latitude));
  const toGraphX = (longitude: number) => (longitude * Math.PI / 180 - centerX) * scale;
  const toGraphY = (latitude: number) => (centerY - mercatorY(latitude)) * scale;
  const graphBounds = {
    minX: toGraphX(minLongitude),
    maxX: toGraphX(maxLongitude),
    minY: toGraphY(maxLatitude),
    maxY: toGraphY(minLatitude),
  };

  return {
    nodes,
    projection: {
      latitudeField,
      longitudeField,
      positionedNodeIds: valid.map(point => point.id),
      invalidNodeIds,
      positions,
      longitudeTicks: tickValues(minLongitude, maxLongitude).map(value => ({
        value,
        graphCoordinate: toGraphX(value),
        label: coordinateLabel(value, 'E', 'W'),
      })),
      latitudeTicks: tickValues(minLatitude, maxLatitude).map(value => ({
        value,
        graphCoordinate: toGraphY(value),
        label: coordinateLabel(value, 'N', 'S'),
      })),
      graphBounds,
    },
  };
}
