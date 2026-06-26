/// <reference types="cypress" />

import * as L from 'leaflet';

export type RenderedMapNodeStyle = {
  fillColor: string;
  strokeColor: string;
  strokeWidth?: number;
  opacity: number;
  fillOpacity: number;
};

export const normalizeMapColor = (value: string): string =>
  String(value || '').replace(/\s+/g, '').toLowerCase();

const decodeSvgDataUri = (value: string): string => {
  const dataUri = String(value || '');
  if (!dataUri.startsWith('data:image/svg+xml')) {
    return '';
  }

  const commaIndex = dataUri.indexOf(',');
  if (commaIndex === -1) {
    return '';
  }

  try {
    return decodeURIComponent(dataUri.slice(commaIndex + 1));
  } catch {
    return '';
  }
};

const readSvgAttribute = (svg: string, attribute: string): string => {
  const match = svg.match(new RegExp(`${attribute}="([^"]+)"`, 'i'));
  return match?.[1] ?? '';
};

const readSvgNumericAttribute = (svg: string, attribute: string): number | undefined => {
  const raw = readSvgAttribute(svg, attribute);
  if (!raw) {
    return undefined;
  }

  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
};

const getMarkerIconUrl = (layer: any): string =>
  String(layer?.options?.icon?.options?.iconUrl || layer?._icon?.getAttribute?.('src') || '');

const flattenLatLngs = (value: any): L.LatLng[] => {
  if (Array.isArray(value)) {
    return value.reduce((acc: L.LatLng[], entry: any) => acc.concat(flattenLatLngs(entry)), []);
  }

  if (value && Number.isFinite(value.lat) && Number.isFinite(value.lng)) {
    return [value as L.LatLng];
  }

  return [];
};

export function readRenderedMapNodeStyle(layer: any): RenderedMapNodeStyle {
  const iconSvg = decodeSvgDataUri(getMarkerIconUrl(layer));
  const opacityValue = layer?.options?.opacity ?? layer?._icon?.style?.opacity ?? 1;
  const opacity = Number(opacityValue);

  return {
    fillColor: normalizeMapColor(layer?.options?.fillColor || readSvgAttribute(iconSvg, 'fill')),
    strokeColor: normalizeMapColor(layer?.options?.color || readSvgAttribute(iconSvg, 'stroke')),
    strokeWidth: layer?.options?.weight ?? readSvgNumericAttribute(iconSvg, 'stroke-width'),
    opacity: Number.isFinite(opacity) ? opacity : 1,
    fillOpacity: Number(layer?.options?.fillOpacity ?? opacity),
  };
}

export function getRenderedMapNodeContainerPoint(lmap: L.Map, layer: any): L.Point {
  const rawPoint = layer?._point;
  if (rawPoint && Number.isFinite(rawPoint.x) && Number.isFinite(rawPoint.y)) {
    return L.point(rawPoint.x, rawPoint.y);
  }

  const latLng = layer?.getLatLng?.();
  if (latLng) {
    return lmap.latLngToContainerPoint(latLng);
  }

  throw new Error('Unable to determine rendered map node container point.');
}

export function getRenderedMapLinkContainerPoint(lmap: L.Map, layer: any): L.Point {
  const rawBounds = layer?._rawPxBounds;
  if (rawBounds?.min && rawBounds?.max) {
    return L.point(
      (rawBounds.min.x + rawBounds.max.x) / 2,
      (rawBounds.min.y + rawBounds.max.y) / 2,
    );
  }

  const bounds = layer?.getBounds?.();
  if (bounds?.isValid?.()) {
    return lmap.latLngToContainerPoint(bounds.getCenter());
  }

  const latLngs = flattenLatLngs(layer?.getLatLngs?.());
  if (latLngs.length >= 2) {
    const firstPoint = lmap.latLngToContainerPoint(latLngs[0]);
    const lastPoint = lmap.latLngToContainerPoint(latLngs[latLngs.length - 1]);
    return L.point(
      (firstPoint.x + lastPoint.x) / 2,
      (firstPoint.y + lastPoint.y) / 2,
    );
  }

  throw new Error('Unable to determine rendered map link container point.');
}
