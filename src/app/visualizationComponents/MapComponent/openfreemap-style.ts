import type { StyleSpecification } from 'maplibre-gl';

export const OPENFREEMAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
export const OPENFREEMAP_ATTRIBUTION = '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> <a href="https://www.openmaptiles.org/" target="_blank">&copy; OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>';

// Prefer an English label when OpenStreetMap supplies one, then fall back to a
// Latin-script transliteration. Deliberately do not fall back to `name`, since
// that is commonly the local-script label in places such as Japan.
type EnglishMapNameExpression = [
    'coalesce',
    ['get', 'name:en'],
    ['get', 'name_en'],
    ['get', 'name:latin'],
    ''
];

export const ENGLISH_MAP_NAME_EXPRESSION: EnglishMapNameExpression = [
    'coalesce',
    ['get', 'name:en'],
    ['get', 'name_en'],
    ['get', 'name:latin'],
    ''
];

const MAP_NAME_PROPERTY = /^name(?::[a-z-]+|_[a-z-]+)?$/i;

function referencesMapName(value: unknown): boolean {
    if (typeof value === 'string') {
        return MAP_NAME_PROPERTY.test(value) || /\{name(?::[a-z-]+|_[a-z-]+)?\}/i.test(value);
    }

    return Array.isArray(value) && value.some(item => referencesMapName(item));
}

export function transformOpenFreeMapStyleToEnglish(style: StyleSpecification): StyleSpecification {
    return {
        ...style,
        layers: style.layers.map(layer => {
            if (layer.type !== 'symbol' || !layer.layout) {
                return layer;
            }

            const textField = layer.layout['text-field'];
            if (!referencesMapName(textField)) {
                return layer;
            }

            return {
                ...layer,
                layout: {
                    ...layer.layout,
                    'text-field': ENGLISH_MAP_NAME_EXPRESSION
                }
            };
        })
    };
}
