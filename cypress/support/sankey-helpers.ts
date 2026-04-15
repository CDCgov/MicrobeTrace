type SankeyFieldStat = {
  field: string;
  uniqueValues: string[];
  uniqueCount: number;
};

export type SankeyFieldSelection = {
  fields: string[];
  stats: SankeyFieldStat[];
};

export type SankeyGraphExpectation = {
  nodeCount: number;
  positiveLinkCount: number;
};

export const DEFAULT_SANKEY_FIELD_PREFERENCES = [
  'cluster',
  'subtype',
  'WHO_class',
  'Lineage',
  'Profession',
  'Node type',
  'Node_Class',
  'State',
  'Zip_code',
  'Collection_Date',
  '_id',
  'ID',
];

const EXCLUDED_FIELD_PATTERNS = [
  /^seq$/i,
  /^sequence$/i,
  /aligned/i,
  /^x$/i,
  /^y$/i,
  /^lat/i,
  /^lon/i,
];

function canonicalizeSankeyValue(value: unknown): string {
  return String(value);
}

function collectSankeyFieldStats(nodes: Record<string, unknown>[], fieldNames: string[]): SankeyFieldStat[] {
  return fieldNames
    .map((field) => {
      const uniqueValues = Array.from(
        new Set(nodes.map((node) => canonicalizeSankeyValue(node[field]))),
      );

      return {
        field,
        uniqueValues,
        uniqueCount: uniqueValues.length,
      };
    })
    .filter((stat) => stat.uniqueCount > 1);
}

function sortSankeyFieldStats(stats: SankeyFieldStat[], preferredFields: string[]): SankeyFieldStat[] {
  const preferenceRank = new Map(preferredFields.map((field, index) => [field, index]));

  return [...stats].sort((left, right) => {
    const leftRank = preferenceRank.get(left.field) ?? Number.MAX_SAFE_INTEGER;
    const rightRank = preferenceRank.get(right.field) ?? Number.MAX_SAFE_INTEGER;
    if (leftRank !== rightRank) return leftRank - rightRank;

    const leftBucket = left.uniqueCount <= 12 ? 0 : left.uniqueCount <= 40 ? 1 : 2;
    const rightBucket = right.uniqueCount <= 12 ? 0 : right.uniqueCount <= 40 ? 1 : 2;
    if (leftBucket !== rightBucket) return leftBucket - rightBucket;

    if (left.uniqueCount !== right.uniqueCount) return left.uniqueCount - right.uniqueCount;
    return left.field.localeCompare(right.field);
  });
}

export function pickSankeyFields(
  nodes: Record<string, unknown>[],
  fieldNames: string[],
  preferredFields: string[] = DEFAULT_SANKEY_FIELD_PREFERENCES,
): SankeyFieldSelection {
  const allStats = collectSankeyFieldStats(nodes, fieldNames);
  const filteredStats = allStats.filter((stat) => {
    return !EXCLUDED_FIELD_PATTERNS.some((pattern) => pattern.test(stat.field));
  });

  const ordered = sortSankeyFieldStats(filteredStats.length >= 2 ? filteredStats : allStats, preferredFields);
  if (ordered.length < 2) {
    throw new Error(`Unable to find two Sankey fields from node fields: ${fieldNames.join(', ')}`);
  }

  return {
    fields: ordered.slice(0, 2).map((stat) => stat.field),
    stats: ordered,
  };
}

export function computeExpectedSankeyGraph(
  nodes: Record<string, unknown>[],
  fields: string[],
): SankeyGraphExpectation {
  const uniqueNodeValues = fields.map((field) => {
    return new Set(nodes.map((node) => canonicalizeSankeyValue(node[field])));
  });

  let positiveLinkCount = 0;
  for (let index = 1; index < fields.length; index += 1) {
    const pairCounts = new Map<string, number>();

    nodes.forEach((node) => {
      const sourceValue = canonicalizeSankeyValue(node[fields[index - 1]]);
      const targetValue = canonicalizeSankeyValue(node[fields[index]]);
      const key = `${sourceValue}|||${targetValue}`;
      pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
    });

    positiveLinkCount += pairCounts.size;
  }

  return {
    nodeCount: uniqueNodeValues.reduce((sum, set) => sum + set.size, 0),
    positiveLinkCount,
  };
}
