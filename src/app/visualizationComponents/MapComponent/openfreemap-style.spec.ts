import type { StyleSpecification } from 'maplibre-gl';
import { ENGLISH_MAP_NAME_EXPRESSION, transformOpenFreeMapStyleToEnglish } from './openfreemap-style';

describe('OpenFreeMap English label style', () => {
    it('replaces local-script name expressions with English and Latin fallbacks', () => {
        const style = {
            version: 8,
            sources: {},
            layers: [
                {
                    id: 'places',
                    type: 'symbol',
                    source: 'openmaptiles',
                    'source-layer': 'place',
                    layout: {
                        'text-field': [
                            'case',
                            ['has', 'name:nonlatin'],
                            ['concat', ['get', 'name:latin'], '\n', ['get', 'name:nonlatin']],
                            ['coalesce', ['get', 'name_en'], ['get', 'name']]
                        ]
                    }
                }
            ]
        } as StyleSpecification;

        const transformed = transformOpenFreeMapStyleToEnglish(style);

        expect(transformed.layers[0].layout['text-field']).toEqual(ENGLISH_MAP_NAME_EXPRESSION);
        expect(style.layers[0].layout['text-field']).not.toEqual(ENGLISH_MAP_NAME_EXPRESSION);
    });

    it('leaves non-name labels and non-symbol layers unchanged', () => {
        const style = {
            version: 8,
            sources: {},
            layers: [
                {
                    id: 'house-numbers',
                    type: 'symbol',
                    source: 'openmaptiles',
                    'source-layer': 'housenumber',
                    layout: { 'text-field': ['get', 'housenumber'] }
                },
                {
                    id: 'water',
                    type: 'fill',
                    source: 'openmaptiles',
                    'source-layer': 'water'
                }
            ]
        } as StyleSpecification;

        const transformed = transformOpenFreeMapStyleToEnglish(style);

        expect(transformed.layers).toEqual(style.layers);
    });
});
