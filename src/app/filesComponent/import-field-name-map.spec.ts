import {
  buildImportFieldNameMap,
  LINK_IMPORT_RESERVED_FIELDS,
  NODE_IMPORT_RESERVED_FIELDS
} from './import-field-name-map';
import {
  GEOJSON_FEATURE_ID_FIELD,
  GEOJSON_LATITUDE_FIELD,
  GEOJSON_LONGITUDE_FIELD
} from '@app/contactTraceCommonServices/geojson-import';

const sanitizeFieldName = (value: any): string => String(value ?? '');

const mapFields = (
  domain: 'node' | 'link',
  headers: string[],
  structuralFields: string[] = [],
  sessionFields: string[] = [],
  aliases = new Map<string, string>()
): Map<string, string> => buildImportFieldNameMap({
  domain,
  headers,
  structuralFields: new Set(structuralFields),
  aliases,
  sessionFields,
  sanitizeFieldName
});

describe('import field-name mapping', () => {
  [
    { domain: 'node' as const, reservedFields: NODE_IMPORT_RESERVED_FIELDS },
    { domain: 'link' as const, reservedFields: LINK_IMPORT_RESERVED_FIELDS }
  ].forEach(({ domain, reservedFields }) => {
    it(`aliases every ${domain} reserved field case-insensitively`, () => {
      reservedFields.forEach(field => {
        const mixedCaseField = field.toUpperCase();
        const fieldMap = mapFields(domain, [mixedCaseField]);

        expect(fieldMap.get(mixedCaseField))
          .withContext(`${domain} field ${mixedCaseField}`)
          .toBe(`${mixedCaseField} (Imported)`);
      });
    });

    it(`reuses ${domain} aliases across files and suffixes only distinct colliding headers`, () => {
      const reservedField = domain === 'node' ? '_id' : 'distance';
      const importedAlias = `${reservedField} (Imported)`;
      const aliases = new Map<string, string>();
      const sessionFields: string[] = [];

      const firstFileMap = mapFields(domain, [reservedField], [], sessionFields, aliases);
      expect(firstFileMap.get(reservedField)).toBe(importedAlias);
      sessionFields.push(importedAlias);

      const secondFileMap = mapFields(domain, [reservedField], [], sessionFields, aliases);
      expect(secondFileMap.get(reservedField)).toBe(importedAlias);

      const distinctHeaderMap = mapFields(domain, [importedAlias], [], sessionFields, aliases);
      expect(distinctHeaderMap.get(importedAlias)).toBe(`${importedAlias} 2`);
    });
  });

  it('protects Map positioning and generated node rendering fields', () => {
    const fields = [
      'map_floorplan_x',
      'map_floorplan_y',
      'map_manual_latitude',
      'map_manual_longitude',
      'map_floorplan_boundary_id',
      'map_floorplan_boundary_x',
      'map_floorplan_boundary_y',
      'mixedColorImage'
    ];
    const fieldMap = mapFields('node', fields);

    expect(Array.from(fieldMap.entries())).toEqual(
      fields.map(field => [field, `${field} (Imported)`])
    );
  });

  it('protects GeoJSON enrichment fields while retaining tabular values', () => {
    const fields = [
      GEOJSON_LATITUDE_FIELD,
      GEOJSON_LONGITUDE_FIELD,
      GEOJSON_FEATURE_ID_FIELD
    ];
    const fieldMap = mapFields('node', fields);

    expect(Array.from(fieldMap.entries())).toEqual(
      fields.map(field => [field, `${field} (Imported)`])
    );
  });

  it('protects collapsed-node state and summaries', () => {
    const fields = ['isCollapsedAggregate', 'collapsedMemberIds', 'totalCount', 'counts',
      'meanInternalDistance', 'internalDistancePairCount', 'aggregateRenderedSize', 'pieBackgroundImage'];
    expect(Array.from(mapFields('node', fields).entries())).toEqual(
      fields.map(field => [field, `${field} (Imported)`])
    );
  });

  it('preserves whitespace in identifiers and excludes exact structural selections', () => {
    const fields = [' case_id ', 'Lat', ' Lat ', 'seq '];
    expect(Array.from(mapFields('node', fields, [' case_id ', 'seq ']).entries()))
      .toEqual([['Lat', 'Lat'], [' Lat ', ' Lat ']]);
  });

  it('keeps non-conflicting names and excludes selected structural fields', () => {
    const nodeMap = mapFields('node', ['case_id', 'seq', 'safe_status'], ['case_id', 'seq']);
    const linkMap = mapFields(
      'link',
      ['source', 'target', 'distance', 'Contact'],
      ['source', 'target', 'distance']
    );

    expect(Array.from(nodeMap.entries())).toEqual([['safe_status', 'safe_status']]);
    expect(Array.from(linkMap.entries())).toEqual([['Contact', 'Contact']]);
  });
});
