import { Injectable } from '@angular/core';
import * as d3 from 'd3';

export interface NodeColorSegment {
  value: string;
  color: string;
  alpha: number;
  weight: number;
}

export interface NodeFillStyle {
  color: string;
  alpha: number;
  segments?: NodeColorSegment[];
}

export interface MixedNodeColorLegendEntry {
  value: string;
  components: string[];
  count: number;
}

export interface NodeColorCategoryCount {
  label: string;
  count: number;
}

const nodeColorCategoryCollator = new Intl.Collator('en', {
  numeric: true,
  sensitivity: 'base'
});

export function isNullLikeNodeColorValue(value: any): boolean {
  if (value === undefined || value === null) {
    return true;
  }

  if (typeof value === 'number' && Number.isNaN(value)) {
    return true;
  }

  const textValue = String(value).trim();
  const normalizedValue = textValue.toLowerCase();
  return !textValue
    || normalizedValue === 'null'
    || normalizedValue === 'undefined'
    || normalizedValue === 'nan'
    || normalizedValue === 'n/a'
    || normalizedValue === '(empty)';
}

export function normalizeNodeStyleCategoryValue(value: any): string {
  if (isNullLikeNodeColorValue(value)) {
    return 'null';
  }

  return typeof value === 'string' ? value.trim() : String(value);
}

function splitMixedNodeColorText(value: string): string[] {
  return value
    .replace(/\bn\/a\b/ig, '')
    .split(/\s+(?:and)\s+|[/,;+|]/i)
    .map(token => token.trim())
    .filter(token => !isNullLikeNodeColorValue(token));
}

export function parseMixedNodeColorValue(value: any): string[] {
  const values = Array.isArray(value) ? value : [value];
  const seen = new Set<string>();
  const tokens: string[] = [];

  values.forEach(item => {
    if (isNullLikeNodeColorValue(item)) {
      return;
    }

    splitMixedNodeColorText(String(item)).forEach(token => {
      if (seen.has(token)) {
        return;
      }

      seen.add(token);
      tokens.push(token);
    });
  });

  return tokens;
}

function getPreferredNodeColorCategoryRanks(preferredOrder: any[] = []): Map<string, number> {
  const ranks = new Map<string, number>();
  preferredOrder.forEach((value, index) => {
    const key = normalizeNodeStyleCategoryValue(value);
    if (!ranks.has(key)) {
      ranks.set(key, index);
    }
  });
  return ranks;
}

function getPreferredNodeColorCategoryLabels(preferredOrder: any[] = []): Map<string, string> {
  const labels = new Map<string, string>();
  preferredOrder.forEach(value => {
    const label = normalizeNodeStyleCategoryValue(value);
    if (!labels.has(label)) {
      labels.set(label, label);
    }
  });
  return labels;
}

function compareAtomicNodeColorCategories(
  left: string,
  right: string,
  preferredRanks: Map<string, number>
): number {
  const leftRank = preferredRanks.get(left);
  const rightRank = preferredRanks.get(right);

  if (leftRank !== undefined || rightRank !== undefined) {
    if (leftRank === undefined) {
      return 1;
    }
    if (rightRank === undefined) {
      return -1;
    }
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }
  }

  const naturalComparison = nodeColorCategoryCollator.compare(left, right);
  return naturalComparison !== 0
    ? naturalComparison
    : left < right
      ? -1
      : left > right
        ? 1
        : 0;
}

export function canonicalizeMixedNodeColorComponents(
  value: any,
  preferredOrder: any[] = []
): string[] {
  const preferredRanks = getPreferredNodeColorCategoryRanks(preferredOrder);
  const preferredLabels = getPreferredNodeColorCategoryLabels(preferredOrder);
  return parseMixedNodeColorValue(value)
    .map(token => preferredLabels.get(token) || token)
    .sort((left, right) => compareAtomicNodeColorCategories(left, right, preferredRanks));
}

export function canonicalizeNodeColorCategoryValue(
  value: any,
  preferredOrder: any[] = []
): string {
  const components = canonicalizeMixedNodeColorComponents(value, preferredOrder);
  return components.length > 0
    ? components.join('/')
    : normalizeNodeStyleCategoryValue(value);
}

export function compareNodeColorCategoryValues(
  left: any,
  right: any,
  preferredOrder: any[] = []
): number {
  const preferredRanks = getPreferredNodeColorCategoryRanks(preferredOrder);
  const getComponents = (value: any): string[] => {
    const components = canonicalizeMixedNodeColorComponents(value, preferredOrder);
    return components.length > 0 ? components : [normalizeNodeStyleCategoryValue(value)];
  };
  const leftComponents = getComponents(left);
  const rightComponents = getComponents(right);
  const sharedLength = Math.min(leftComponents.length, rightComponents.length);

  for (let index = 0; index < sharedLength; index++) {
    const comparison = compareAtomicNodeColorCategories(
      leftComponents[index],
      rightComponents[index],
      preferredRanks
    );
    if (comparison !== 0) {
      return comparison;
    }
  }

  return leftComponents.length - rightComponents.length;
}

export function sortNodeColorCategoryValues(
  values: any[],
  preferredOrder: any[] = []
): string[] {
  return (values || [])
    .map(value => canonicalizeNodeColorCategoryValue(value, preferredOrder))
    .sort((left, right) => compareNodeColorCategoryValues(left, right, preferredOrder));
}

export function sortAtomicNodeColorCategoryValues(
  values: any[],
  preferredOrder: any[] = []
): string[] {
  const preferredRanks = getPreferredNodeColorCategoryRanks(preferredOrder);
  return (values || [])
    .map(value => normalizeNodeStyleCategoryValue(value))
    .sort((left, right) => compareAtomicNodeColorCategories(left, right, preferredRanks));
}

export function buildCanonicalNodeColorCounts(
  values: any[],
  preferredOrder: any[] = [],
  splitMixedValues: boolean = true
): NodeColorCategoryCount[] {
  const counts = new Map<string, number>();
  (values || []).forEach(value => {
    const label = splitMixedValues
      ? canonicalizeNodeColorCategoryValue(value, preferredOrder)
      : normalizeNodeStyleCategoryValue(value);
    counts.set(label, (counts.get(label) || 0) + 1);
  });

  const orderedLabels = splitMixedValues
    ? sortNodeColorCategoryValues(Array.from(counts.keys()), preferredOrder)
    : sortAtomicNodeColorCategoryValues(Array.from(counts.keys()), preferredOrder);
  return orderedLabels.map(label => ({ label, count: counts.get(label) || 0 }));
}

export function getMixedNodeColorLegendEntries(
  nodes: any[],
  variable: string,
  preferredOrder: any[] = []
): MixedNodeColorLegendEntry[] {
  if (!variable || variable === 'None') {
    return [];
  }

  const entries = new Map<string, MixedNodeColorLegendEntry>();

  (nodes || []).forEach(node => {
    const components = canonicalizeMixedNodeColorComponents(node?.[variable], preferredOrder);
    if (components.length < 2) {
      return;
    }

    const key = components.join('\u001f');
    const existingEntry = entries.get(key);
    if (existingEntry) {
      existingEntry.count += 1;
      return;
    }

    entries.set(key, {
      value: components.join('/'),
      components,
      count: 1
    });
  });

  return Array.from(entries.values())
    .sort((left, right) => compareNodeColorCategoryValues(left.value, right.value, preferredOrder));
}

export function getMixedNodeColorSegments(
  value: any,
  colorMap: ((value: any) => string) | null | undefined,
  alphaMap: ((value: any) => number) | null | undefined,
  fallbackColor: string,
  fallbackAlpha: number = 1,
  preferredOrder: any[] = []
): NodeColorSegment[] {
  return canonicalizeMixedNodeColorComponents(value, preferredOrder).map(token => {
    let color = fallbackColor;
    let alpha = fallbackAlpha;

    try {
      color = colorMap?.(token) || fallbackColor;
    } catch {
      color = fallbackColor;
    }

    try {
      alpha = alphaMap?.(token) ?? fallbackAlpha;
    } catch {
      alpha = fallbackAlpha;
    }

    return {
      value: token,
      color,
      alpha,
      weight: 1
    };
  });
}

/**
 * A dedicated service for node, link, polygon color mapping.
 * It is "pure" in that it does NOT own or mutate your session object.
 * Instead, it expects all required data (arrays, color config, etc.)
 * as method parameters and returns color scales or any updated arrays.
 */
@Injectable({
  providedIn: 'root'
})
export class ColorMappingService {

  constructor() {}

  public normalizeStyleCategoryValue(value: any): string {
    return normalizeNodeStyleCategoryValue(value);
  }

  public parseMixedColorValue(value: any): string[] {
    return parseMixedNodeColorValue(value);
  }

  public getNodeColorCategoriesForValue(
    value: any,
    mixedColorsEnabled: boolean,
    preferredOrder: any[] = []
  ): string[] {
    if (mixedColorsEnabled) {
      const mixedValues = sortNodeColorCategoryValues(
        this.parseMixedColorValue(value),
        preferredOrder
      );
      if (mixedValues.length > 0) {
        return mixedValues;
      }
    }

    return [this.normalizeStyleCategoryValue(value)];
  }

  /**
   * Creates a node color-mapping scale based on a specified "nodeColorVariable"
   * and a set of node items. Rather than referencing session or temp directly,
   * we accept them as parameters.
   *
   * @param nodes An array of node objects
   * @param nodeColorVariable The property name used to categorize node colors
   * @param nodeColors The current palette of colors (e.g. d3.schemeCategory10)
   * @param nodeAlphas The array of alpha (transparency) values
   * @param nodeColorsTable existing table of (variable -> list of assigned colors)
   * @param nodeColorsTableKeys existing table of (variable -> keys domain)
   * @param nodeColorsTableHistory used to persist color assignments by variable over time
   * @param debugMode to enable/disable console logging
   * @returns an object containing:
   *    {
   *      aggregates: Record<string, number>;
   *      colorMap: d3.ScaleOrdinal<string, string>;
   *      alphaMap: d3.ScaleOrdinal<string, number>;
   *      updatedNodeColors: string[];   // possibly expanded to handle more categories
   *      updatedNodeAlphas: number[];   // same as above
   *      updatedColorsTable: any;       // the updated nodeColorsTable
   *      updatedColorsTableKeys: any;   // the updated nodeColorsTableKeys
   *      updatedColorsTableHistory: any;// updated nodeColorsTableHistory
   *    }
   */
  public createNodeColorMap(
    nodes: any[],
    nodeColorVariable: string,
    nodeColors: string[],
    nodeAlphas: number[],
    nodeColorsTable: any,
    nodeColorsTableKeys: any,
    nodeColorsTableHistory: any,
    nodeColorAssignments: Record<string, string>,
    debugMode: boolean,
    splitMixedValues: boolean = false
  ): {
    aggregates: Record<string, number>;
    colorMap: d3.ScaleOrdinal<string, string>;
    alphaMap: d3.ScaleOrdinal<string, number>;
    updatedNodeColors: string[];
    updatedNodeAlphas: number[];
    updatedColorsTable: any;
    updatedColorsTableKeys: any;
    updatedColorsTableHistory: any;
  } {

    // If user hasn't chosen a variable, just return a single uniform color mapping
    if (nodeColorVariable === 'None') {
      const uniformMap = () => nodeColors[0] || '#1f77b4';
      return {
        aggregates: {},
        colorMap: d3.scaleOrdinal([uniformMap()]).domain([]),
        alphaMap: d3.scaleOrdinal([1]).domain([]),
        updatedNodeColors: nodeColors,
        updatedNodeAlphas: nodeAlphas,
        updatedColorsTable: nodeColorsTable,
        updatedColorsTableKeys: nodeColorsTableKeys,
        updatedColorsTableHistory: nodeColorsTableHistory
      };
    }

    if (debugMode) {
      console.log('[createNodeColorMap] Starting with variable =', nodeColorVariable);
    }

    // Make sure the color tables exist
    const updatedColorsTable = nodeColorsTable || {};
    const updatedColorsTableKeys = nodeColorsTableKeys || {};
    let updatedNodeColors = [...nodeColors];  // we may expand this array
    let updatedNodeAlphas = [...nodeAlphas];  // same reason
    const updatedColorsTableHistory = nodeColorsTableHistory || {};
    const explicitAssignments = nodeColorAssignments || {};

    // If we already have a stored array of colors for this particular variable
    // (like "nodeColorsTable[myVariable]"), let’s reuse them
    if (!updatedColorsTable[nodeColorVariable]) {
      updatedColorsTable[nodeColorVariable] = updatedNodeColors;
    } else {
      updatedNodeColors = [...updatedColorsTable[nodeColorVariable]];
    }

    const storedKeysForVariable = Array.isArray(updatedColorsTableKeys[nodeColorVariable])
      ? updatedColorsTableKeys[nodeColorVariable]
      : [];
    const storedColorsByValue: Record<string, string> = {};

    storedKeysForVariable.forEach((key, index) => {
      const storedColor = updatedNodeColors[index];
      if (typeof storedColor === 'string') {
        storedColorsByValue[String(key)] = storedColor;
      }
    });

    const storedVariableHistory = updatedColorsTableHistory[nodeColorVariable];
    const variableHistory: Record<string, string> = storedVariableHistory
      && typeof storedVariableHistory === 'object'
      && !Array.isArray(storedVariableHistory)
      ? storedVariableHistory
      : {};

    // Legacy sessions stored history as { value: color }. Start a scoped history
    // from the per-variable color table instead of reusing those ambiguous keys.
    updatedColorsTableHistory[nodeColorVariable] = variableHistory;

    updatedNodeColors = updatedNodeColors.map((candidateColor, index) => {
      if (typeof candidateColor === 'string') {
        return candidateColor;
      }

      const fallbackKey = String(storedKeysForVariable[index] ?? '');
      const fallbackHistoryColor = variableHistory[fallbackKey];
      if (typeof fallbackHistoryColor === 'string') {
        return fallbackHistoryColor;
      }

      const paletteColor = nodeColors[index % Math.max(nodeColors.length, 1)];
      return typeof paletteColor === 'string' ? paletteColor : '#1f77b4';
    });

    // Compute aggregates by scanning all node values
    const aggregates: Record<string, number> = {};
    nodes.forEach(d => {
      if (!d.visible) {
        // If node is not visible, you can decide to skip or do aggregates[val] = 0;
        return;
      }

      const categories = this.getNodeColorCategoriesForValue(
        d[nodeColorVariable],
        splitMixedValues,
        storedKeysForVariable
      );
      const isMixedValue = splitMixedValues && categories.length > 1;

      categories.forEach(category => {
        // Mixed components must remain in the scale domain so each segment has
        // a stable color, but the combined node is counted only by its mixed
        // legend entry rather than fractionally against every component.
        if (!Object.prototype.hasOwnProperty.call(aggregates, category)) {
          aggregates[category] = 0;
        }

        if (!isMixedValue) {
          aggregates[category] += 1;
        }
      });
    });

    const distinctValues = splitMixedValues
      ? sortNodeColorCategoryValues(Object.keys(aggregates), storedKeysForVariable)
      : sortAtomicNodeColorCategoryValues(Object.keys(aggregates), storedKeysForVariable);

    const fallbackPalette = updatedNodeColors.length > 0
      ? [...updatedNodeColors]
      : ['#1f77b4'];

    // Expand alpha array if needed
    if (distinctValues.length > updatedNodeAlphas.length) {
      updatedNodeAlphas = updatedNodeAlphas.concat(
        new Array(distinctValues.length - updatedNodeAlphas.length).fill(1)
      );
    }

    // For each distinct value, prefer an explicit field assignment, then the
    // stored table color and field-scoped history.
    const reservedColors = new Set<string>();
    distinctValues.forEach((value) => {
      const explicitColor = explicitAssignments[value];
      const existingColor = Object.prototype.hasOwnProperty.call(explicitAssignments, value)
        && typeof explicitColor === 'string'
        ? explicitColor
        : storedColorsByValue[value] ?? variableHistory[value];
      if (typeof existingColor === 'string') {
        reservedColors.add(existingColor);
      }
    });

    const usedColors = new Set<string>();
    const mappedColors = distinctValues.map((value, index) => {
      const explicitColor = explicitAssignments[value];
      const existingColor = Object.prototype.hasOwnProperty.call(explicitAssignments, value)
        && typeof explicitColor === 'string'
        ? explicitColor
        : storedColorsByValue[value] ?? variableHistory[value];
      if (typeof existingColor === 'string') {
        variableHistory[value] = existingColor;
        usedColors.add(existingColor);
        return existingColor;
      }

      if (value === 'null') {
        variableHistory[value] = '#EAE553';
        usedColors.add(variableHistory[value]);
        return variableHistory[value];
      }

      const preferredColor = fallbackPalette[index % fallbackPalette.length];
      const availableColor = fallbackPalette.find((color) =>
        !reservedColors.has(color) && !usedColors.has(color)
      );
      const nextColor = !reservedColors.has(preferredColor) && !usedColors.has(preferredColor)
        ? preferredColor
        : availableColor ?? preferredColor;

      variableHistory[value] = nextColor;
      usedColors.add(nextColor);
      return nextColor;
    });

    const colorTableLength = Math.max(updatedNodeColors.length, mappedColors.length);
    updatedNodeColors = Array.from({ length: colorTableLength }, (_, index) =>
      mappedColors[index] ?? fallbackPalette[index % fallbackPalette.length]
    );

    // Keep the table domain limited to current values. Assignments for values
    // absent from this dataset remain in session.style.nodeColorAssignments.
    updatedColorsTableKeys[nodeColorVariable] = distinctValues;
    updatedColorsTable[nodeColorVariable] = updatedNodeColors;

    // Create the scale functions
    const colorMap = d3
      .scaleOrdinal<string, string>(updatedNodeColors)
      .domain(distinctValues);

    const alphaMap = d3
      .scaleOrdinal<string, number>(updatedNodeAlphas)
      .domain(distinctValues);

    if (debugMode) {
      console.log('[createNodeColorMap] Done. Distinct values:', distinctValues);
    }

    return {
      aggregates: distinctValues.reduce((orderedAggregates, value) => {
        orderedAggregates[value] = aggregates[value];
        return orderedAggregates;
      }, {} as Record<string, number>),
      colorMap,
      alphaMap,
      updatedNodeColors,
      updatedNodeAlphas,
      updatedColorsTable,
      updatedColorsTableKeys,
      updatedColorsTableHistory
    };
  }

  /**
   * Very similar approach for Link Color Mapping
   */
  public createLinkColorMap(
    links: any[],
    linkColorVariable: string,
    linkColors: string[],
    linkAlphas: number[],
    linkColorsTable: any,
    linkColorsTableKeys: any,
    linkColorsTableHistory: any,
    debugMode: boolean
  ): {
    aggregates: Record<string, number>;
    colorMap: d3.ScaleOrdinal<string, string>;
    alphaMap: d3.ScaleOrdinal<string, number>;
    updatedLinkColors: string[];
    updatedLinkAlphas: number[];
    updatedLinkColorsTable: any;
    updatedLinkColorsTableKeys: any;
    updatedLinkColorsTableHistory: any;
  } {
    

    // If user hasn't chosen a variable
    if (linkColorVariable === 'None') {
      const uniformLinkColor = linkColors[0] || '#a6cee3';
      return {
        aggregates: {},
        colorMap: d3.scaleOrdinal([uniformLinkColor]).domain([]),
        alphaMap: d3.scaleOrdinal([1]).domain([]),
        updatedLinkColors: linkColors,
        updatedLinkAlphas: linkAlphas,
        updatedLinkColorsTable: linkColorsTable,
        updatedLinkColorsTableKeys: linkColorsTableKeys,
        updatedLinkColorsTableHistory: linkColorsTableHistory
      };
    }
    

    if (debugMode) {
      console.log('[createLinkColorMap] Starting, var =', linkColorVariable);
    }

    const updatedLinkColorsTable = linkColorsTable || {};
    const updatedLinkColorsTableKeys = linkColorsTableKeys || {};
    let updatedLinkColorsTableHistory = linkColorsTableHistory || {};
    let updatedLinkColors = [...linkColors];
    let updatedLinkAlphas = [...linkAlphas];

    const hasLinkColorsTableForVariable = Array.isArray(updatedLinkColorsTable[linkColorVariable]);

    // If no existing color array for the chosen link variable
    if (!hasLinkColorsTableForVariable) {
      updatedLinkColorsTable[linkColorVariable] = updatedLinkColors;
    } else {
      updatedLinkColors = [...updatedLinkColorsTable[linkColorVariable]];
    }

    const storedKeysForVariable = Array.isArray(updatedLinkColorsTableKeys[linkColorVariable])
      ? updatedLinkColorsTableKeys[linkColorVariable]
      : [];
    updatedLinkColors = updatedLinkColors.map((candidateColor, index) => {
      if (typeof candidateColor === 'string') {
        return candidateColor;
      }

      const fallbackKey = String(storedKeysForVariable[index] ?? '');
      const fallbackHistoryColor = updatedLinkColorsTableHistory?.[fallbackKey];
      if (typeof fallbackHistoryColor === 'string') {
        return fallbackHistoryColor;
      }

      const paletteColor = linkColors[index % Math.max(linkColors.length, 1)];
      return typeof paletteColor === 'string' ? paletteColor : '#a6cee3';
    });

    let multiLinkCount = 0;
    const emptyValueKey = 'null';
    const emptyValueColor = '#EAE553';
    const isOriginColorVariable = String(linkColorVariable).toLowerCase() === 'origin';

    const ensureAggregateKey = (value: any, includeEmpty = false): string | null => {
      const trimmedStringValue = typeof value === 'string' ? value.trim().toLowerCase() : null;
      const isEmptyValue = value === undefined ||
        value === null ||
        (typeof value === 'number' && Number.isNaN(value)) ||
        trimmedStringValue === '' ||
        trimmedStringValue === 'nan';

      if (isEmptyValue) {
        if (!includeEmpty) {
          return null;
        }

        if (!Object.prototype.hasOwnProperty.call(aggregates, emptyValueKey)) {
          aggregates[emptyValueKey] = 0;
        }

        return emptyValueKey;
      }

      const key = String(value);
      if (!Object.prototype.hasOwnProperty.call(aggregates, key)) {
        aggregates[key] = 0;
      }

      return key;
    };

    // Collect aggregates
    const aggregates: Record<string, number> = {};
    links.forEach(l => {
      if (!l.visible) return;
      if (linkColorVariable.toLowerCase() === 'origin') {
        const origins = Array.isArray(l.origin)
          ? l.origin
          : [l.origin];
        const originKeys = origins
          .map(origin => ensureAggregateKey(origin))
          .filter((key): key is string => key !== null);

        if (originKeys.length > 1) {
          multiLinkCount++;
        } else if (originKeys.length === 1) {
          aggregates[originKeys[0]] += 1;
        }

      } else {
        const val = ensureAggregateKey(l[linkColorVariable], true);
        if (val !== null) {
          aggregates[val] += 1;
        }
      }
    });

    if (multiLinkCount > 0) {
      aggregates["Duo-Link"] = multiLinkCount;
    }

    let distinctValues = Object.keys(aggregates);
    if (isOriginColorVariable) {
      const originRank = (value: string): number => {
        if (value === 'Duo-Link') return 2;
        if (value === 'Genetic Distance') return 1;
        return 0;
      };

      distinctValues = distinctValues.sort((left, right) => originRank(left) - originRank(right));
    }



    // Possibly handle “multi-link” or other specifics if needed
    // For now, we skip that for clarity. If needed, you can replicate your duo-link logic.

    const defaultLinkPalette = linkColorVariable === 'source' || linkColorVariable === 'target'
      ? [d3.schemeCategory10[0]].concat(d3.schemeCategory10.slice(2))
      : d3.schemePaired;
    const candidatePalette = linkColors.filter((color): color is string => typeof color === 'string');
    const uniqueCandidatePalette = Array.from(new Set(candidatePalette));
    const needsDefaultPalette = uniqueCandidatePalette.length <= 1 ||
      (!hasLinkColorsTableForVariable && uniqueCandidatePalette.length < distinctValues.length);
    const basePalette = needsDefaultPalette ? defaultLinkPalette : uniqueCandidatePalette;
    const fallbackPalette = basePalette.length ? basePalette : ['#a6cee3'];
    const colorsByKey = new Map<string, string>();
    const resetExpandedOriginColors = isOriginColorVariable &&
      distinctValues.length > 1 &&
      uniqueCandidatePalette.length <= 1;

    storedKeysForVariable.forEach((key, index) => {
      const color = updatedLinkColors[index];
      if (typeof color === 'string') {
        colorsByKey.set(String(key), color);
      }
    });

    Object.entries(updatedLinkColorsTableHistory || {}).forEach(([key, color]) => {
      if (typeof color === 'string') {
        colorsByKey.set(key, color);
      }
    });

    const existingColorsByValue = new Map<string, string>();
    const usedColors = new Set<string>();
    const repairDuplicateColors = isOriginColorVariable || uniqueCandidatePalette.length < distinctValues.length;

    distinctValues.forEach((val) => {
      const existingColor = colorsByKey.get(val);
      if (existingColor) {
        if (resetExpandedOriginColors) {
          delete updatedLinkColorsTableHistory[val];
          return;
        }

        if (repairDuplicateColors && usedColors.has(existingColor)) {
          delete updatedLinkColorsTableHistory[val];
          return;
        }

        existingColorsByValue.set(val, existingColor);
        usedColors.add(existingColor);
        updatedLinkColorsTableHistory[val] = existingColor;
      }
    });

    updatedLinkColors = distinctValues.map((val, index) => {
      const existingColor = existingColorsByValue.get(val);
      if (existingColor) {
        return existingColor;
      }

      if (val === emptyValueKey && !usedColors.has(emptyValueColor)) {
        usedColors.add(emptyValueColor);
        updatedLinkColorsTableHistory[val] = emptyValueColor;
        return emptyValueColor;
      }

      const preferredPalette = fallbackPalette
        .slice(index)
        .concat(fallbackPalette.slice(0, index));
      const nextColor = preferredPalette.find(color => !usedColors.has(color))
        || fallbackPalette[index % fallbackPalette.length]
        || '#a6cee3';

      usedColors.add(nextColor);
      updatedLinkColorsTableHistory[val] = nextColor;
      return nextColor;
    });

    // Expand link alphas if needed
    if (distinctValues.length > updatedLinkAlphas.length) {
      updatedLinkAlphas = updatedLinkAlphas.concat(
        new Array(distinctValues.length - updatedLinkAlphas.length).fill(1)
      );
    }

    updatedLinkColorsTableKeys[linkColorVariable] = distinctValues;
    updatedLinkColorsTable[linkColorVariable] = updatedLinkColors;

    const colorMap = d3
      .scaleOrdinal<string, string>(updatedLinkColors)
      .domain(distinctValues);

    const alphaMap = d3
      .scaleOrdinal<string, number>(updatedLinkAlphas)
      .domain(distinctValues);

    if (debugMode) {
      console.log('[createLinkColorMap] Done. Distinct values:', distinctValues);
    }

    return {
      aggregates,
      colorMap,
      alphaMap,
      updatedLinkColors,
      updatedLinkAlphas,
      updatedLinkColorsTable,
      updatedLinkColorsTableKeys,
      updatedLinkColorsTableHistory
    };
  }

  /**
   * Example: A polygon color map for grouping clusters or polygons, if relevant.
   */
  public createPolygonColorMap(
    polygonGroups: { key: string, index?: number, values: any[] }[],
    polygonColors: string[],
    polygonAlphas: number[],
    debugMode: boolean
  ): {
    colorMap: d3.ScaleOrdinal<string, string>;
    alphaMap: d3.ScaleOrdinal<string, number>;
    updatedPolygonColors: string[];
    updatedPolygonAlphas: number[];
  } {

    // If no polygon groups, treat as uniform color
    if (!polygonGroups || polygonGroups.length === 0) {
      return {
        colorMap: d3.scaleOrdinal([ polygonColors[0] || '#bbccee' ]).domain([]),
        alphaMap: d3.scaleOrdinal([ 0.5 ]).domain([]),
        updatedPolygonColors: polygonColors,
        updatedPolygonAlphas: polygonAlphas
      };
    }

    const distinctValues = polygonGroups.sort((a, b) => b.values.length - a.values.length).map(g => `${g.key}`);
    polygonGroups.forEach((group, index) => group.index = index);

    let updatedPolygonColors = [...polygonColors];
    let updatedPolygonAlphas = [...polygonAlphas];

    // Expand if necessary
    if (distinctValues.length > updatedPolygonColors.length) {
      let expanded: string[] = [];
      let neededTimes = Math.ceil(distinctValues.length / updatedPolygonColors.length);
      while (neededTimes-- > 0) {
        expanded = expanded.concat(updatedPolygonColors);
      }
      updatedPolygonColors = expanded;
    }
    if (distinctValues.length > updatedPolygonAlphas.length) {
      updatedPolygonAlphas = updatedPolygonAlphas.concat(
        new Array(distinctValues.length - updatedPolygonAlphas.length).fill(0.5)
      );
    }

    const colorMap = d3
      .scaleOrdinal<string, string>(updatedPolygonColors)
      .domain(distinctValues);
    const alphaMap = d3
      .scaleOrdinal<string, number>(updatedPolygonAlphas)
      .domain(distinctValues);

    if (debugMode) {
      console.log('[createPolygonColorMap] done. Distinct values:', distinctValues);
    }

    return {
      colorMap,
      alphaMap,
      updatedPolygonColors,
      updatedPolygonAlphas
    };
  }

  /**
   * If you had a “contrastColor” function, just keep it simple:
   */
  public contrastColor(hexcolor: string): string {
    const r = parseInt(hexcolor.substr(1, 2), 16);
    const g = parseInt(hexcolor.substr(3, 2), 16);
    const b = parseInt(hexcolor.substr(5, 2), 16);
    const yiq = r * 299 + g * 587 + b * 114;
    return yiq >= 128000 ? '#000000' : '#ffffff';
  }

}
