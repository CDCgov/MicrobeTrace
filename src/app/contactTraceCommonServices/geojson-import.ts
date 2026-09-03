export const GEOJSON_LATITUDE_FIELD = 'GeoJSON Latitude';
export const GEOJSON_LONGITUDE_FIELD = 'GeoJSON Longitude';
export const GEOJSON_FEATURE_ID_FIELD = 'GeoJSON Feature ID';

export interface GeoJSONFeatureLocation {
  id: string;
  latitude: number;
  longitude: number;
  feature: any;
}

export interface GeoJSONLocationExtraction {
  featureCount: number;
  locations: GeoJSONFeatureLocation[];
  skippedWithoutId: number;
  skippedWithoutLocation: number;
}

export function parseGeoJSONContent(contents: any): any {
  if (typeof contents === 'string') {
    return JSON.parse(contents);
  }

  return contents;
}

export function isGeoJSONData(data: any): boolean {
  return !!data && typeof data === 'object'
    && (data.type === 'FeatureCollection' || data.type === 'Feature');
}

export function validateGeoJSONLocationData(data: any): void {
  if (!data || typeof data !== 'object') {
    throw new Error('GeoJSON file must contain a JSON object.');
  }

  if (!isGeoJSONData(data)) {
    throw new Error('GeoJSON location files must be a FeatureCollection or Feature.');
  }

  const features = getGeoJSONFeatures(data);
  if (!features.length) {
    throw new Error('GeoJSON file does not contain any features.');
  }

  if (!features.some(feature => getGeoJSONFeatureCenter(feature) !== null)) {
    throw new Error('GeoJSON file does not contain any features with finite coordinates.');
  }
}

export function getGeoJSONFeatures(data: any): any[] {
  if (!data || typeof data !== 'object') {
    return [];
  }

  if (data.type === 'FeatureCollection') {
    return Array.isArray(data.features) ? data.features.filter(feature => !!feature) : [];
  }

  if (data.type === 'Feature') {
    return [data];
  }

  return [];
}

export function getGeoJSONIdFields(data: any): string[] {
  const fields: string[] = [];
  const addField = (field: string) => {
    if (field && !fields.includes(field)) {
      fields.push(field);
    }
  };

  getGeoJSONFeatures(data).forEach(feature => {
    if (feature && feature.id !== undefined && feature.id !== null) {
      addField('id');
    }

    const properties = feature?.properties;
    if (properties && typeof properties === 'object' && !Array.isArray(properties)) {
      Object.keys(properties).forEach(addField);
    }
  });

  return fields;
}

export function getGeoJSONFeatureId(feature: any, idField: string): string | null {
  const properties = feature?.properties;
  if (idField && idField !== 'None' && properties && typeof properties === 'object') {
    const value = properties[idField];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }

  if (feature?.id !== undefined && feature.id !== null && String(feature.id).trim()) {
    return String(feature.id).trim();
  }

  return null;
}

export function extractGeoJSONFeatureLocations(data: any, idField: string): GeoJSONLocationExtraction {
  const features = getGeoJSONFeatures(data);
  let skippedWithoutId = 0;
  let skippedWithoutLocation = 0;
  const locations: GeoJSONFeatureLocation[] = [];

  features.forEach(feature => {
    const id = getGeoJSONFeatureId(feature, idField);
    if (!id) {
      skippedWithoutId++;
      return;
    }

    const center = getGeoJSONFeatureCenter(feature);
    if (!center) {
      skippedWithoutLocation++;
      return;
    }

    locations.push({
      id,
      latitude: center.latitude,
      longitude: center.longitude,
      feature
    });
  });

  return {
    featureCount: features.length,
    locations,
    skippedWithoutId,
    skippedWithoutLocation
  };
}

export function getGeoJSONFeatureCenter(feature: any): { latitude: number; longitude: number } | null {
  const coordinates: Array<[number, number]> = [];
  collectGeometryCoordinates(feature?.geometry, coordinates);

  if (!coordinates.length) {
    return null;
  }

  if (coordinates.length === 1) {
    return {
      longitude: coordinates[0][0],
      latitude: coordinates[0][1]
    };
  }

  let minLongitude = coordinates[0][0];
  let maxLongitude = coordinates[0][0];
  let minLatitude = coordinates[0][1];
  let maxLatitude = coordinates[0][1];

  coordinates.forEach(([longitude, latitude]) => {
    minLongitude = Math.min(minLongitude, longitude);
    maxLongitude = Math.max(maxLongitude, longitude);
    minLatitude = Math.min(minLatitude, latitude);
    maxLatitude = Math.max(maxLatitude, latitude);
  });

  return {
    longitude: (minLongitude + maxLongitude) / 2,
    latitude: (minLatitude + maxLatitude) / 2
  };
}

function collectGeometryCoordinates(geometry: any, output: Array<[number, number]>): void {
  if (!geometry || typeof geometry !== 'object') {
    return;
  }

  if (geometry.type === 'GeometryCollection') {
    (Array.isArray(geometry.geometries) ? geometry.geometries : [])
      .forEach(childGeometry => collectGeometryCoordinates(childGeometry, output));
    return;
  }

  collectCoordinatePairs(geometry.coordinates, output);
}

function collectCoordinatePairs(coordinates: any, output: Array<[number, number]>): void {
  if (!Array.isArray(coordinates)) {
    return;
  }

  if (
    coordinates.length >= 2
    && typeof coordinates[0] === 'number'
    && typeof coordinates[1] === 'number'
  ) {
    const longitude = Number(coordinates[0]);
    const latitude = Number(coordinates[1]);
    if (Number.isFinite(longitude) && Number.isFinite(latitude)) {
      output.push([longitude, latitude]);
    }
    return;
  }

  coordinates.forEach(child => collectCoordinatePairs(child, output));
}
