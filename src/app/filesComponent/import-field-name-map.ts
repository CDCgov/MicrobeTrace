import {
  GEOJSON_FEATURE_ID_FIELD,
  GEOJSON_LATITUDE_FIELD,
  GEOJSON_LONGITUDE_FIELD
} from '@app/contactTraceCommonServices/geojson-import';

export type ImportedTableRecordDomain = 'node' | 'link';

export const NODE_IMPORT_RESERVED_FIELDS: ReadonlySet<string> = new Set([
  'index',
  '_id',
  'id',
  'label',
  'selected',
  'cluster',
  'visible',
  'degree',
  'origin',
  '_originall',
  'mt_networks',
  'data',
  'hasdistance',
  'x',
  'y',
  'z',
  'vx',
  'vy',
  '_lat',
  '_lon',
  '_jlat',
  '_jlon',
  '_j',
  '_theta',
  'map_floorplan_x',
  'map_floorplan_y',
  'map_manual_latitude',
  'map_manual_longitude',
  'map_floorplan_boundary_id',
  'map_floorplan_boundary_x',
  'map_floorplan_boundary_y',
  GEOJSON_LATITUDE_FIELD.toLowerCase(),
  GEOJSON_LONGITUDE_FIELD.toLowerCase(),
  GEOJSON_FEATURE_ID_FIELD.toLowerCase(),
  'nodesize',
  'nodecolor',
  'bgopacity',
  'borderwidth',
  'mixedcolorimage',
  'iscollapsedaggregate',
  'collapsedmemberids',
  'totalcount',
  'counts',
  'meaninternaldistance',
  'internaldistancepaircount',
  'aggregaterenderedsize',
  'piebackgroundimage',
  'shape',
  'group',
  'parent',
  'isparent',
  'color',
  'size',
  'seq',
  '_diff',
  '_ambiguity',
  '_score',
  '_padding',
  '_cigar',
  '_seq',
  '_seqint',
  'foci'
]);

export const LINK_IMPORT_RESERVED_FIELDS: ReadonlySet<string> = new Set([
  'index',
  'id',
  'source',
  'target',
  'visible',
  'cluster',
  'origin',
  '_originall',
  'nn',
  'directed',
  'hasdistance',
  'distance',
  'distanceorigin',
  'distanceorigins',
  'mt_networks',
  'label',
  'mtrawlinklabel',
  'lineselectedcolor',
  'linecolor',
  'lineopacity',
  'width',
  'secondlink',
  'bidirectional',
  'length',
  'weight',
  'snps',
  'tn93',
  'genetic_distance',
  'mean_genetic_distance'
]);

export interface ImportFieldNameMapOptions {
  domain: ImportedTableRecordDomain;
  headers: any[];
  structuralFields: ReadonlySet<string>;
  aliases: Map<string, string>;
  sessionFields: readonly string[];
  sanitizeFieldName: (value: any) => string;
}

export function buildImportFieldNameMap({
  domain,
  headers,
  structuralFields,
  aliases,
  sessionFields,
  sanitizeFieldName
}: ImportFieldNameMapOptions): Map<string, string> {
  const reservedFields = domain === 'node'
    ? NODE_IMPORT_RESERVED_FIELDS
    : LINK_IMPORT_RESERVED_FIELDS;
  const usedFieldNames = new Set<string>();
  const fieldMap = new Map<string, string>();

  headers
    .map(rawHeader => ({
      rawHeader: String(rawHeader ?? ''),
      safeHeader: sanitizeFieldName(rawHeader)
    }))
    .filter(({ safeHeader }) => safeHeader && !structuralFields.has(safeHeader))
    .forEach(({ rawHeader, safeHeader }) => {
      const existingAlias = aliases.get(rawHeader);
      if (existingAlias && sessionFields.includes(existingAlias) && !usedFieldNames.has(existingAlias)) {
        usedFieldNames.add(existingAlias);
        fieldMap.set(rawHeader, existingAlias);
        return;
      }

      const baseFieldName = reservedFields.has(safeHeader.toLowerCase())
        ? `${safeHeader} (Imported)`
        : safeHeader;
      let mappedFieldName = baseFieldName;
      let suffix = 2;

      while (usedFieldNames.has(mappedFieldName) || sessionFields.includes(mappedFieldName)) {
        mappedFieldName = `${baseFieldName} ${suffix}`;
        suffix++;
      }

      usedFieldNames.add(mappedFieldName);
      fieldMap.set(rawHeader, mappedFieldName);
      aliases.set(rawHeader, mappedFieldName);
    });

  return fieldMap;
}
