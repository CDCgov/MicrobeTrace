import { Injectable } from '@angular/core';
import * as d3 from 'd3';

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
   * @param nodeColorsTableHistory used to persist color assignments over time
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
    debugMode: boolean
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
    let updatedColorsTableHistory = nodeColorsTableHistory || { 'null': '#EAE553' };

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
    updatedNodeColors = updatedNodeColors.map((candidateColor, index) => {
      if (typeof candidateColor === 'string') {
        return candidateColor;
      }

      const fallbackKey = String(storedKeysForVariable[index] ?? '');
      const fallbackHistoryColor = updatedColorsTableHistory?.[fallbackKey];
      if (typeof fallbackHistoryColor === 'string') {
        return fallbackHistoryColor;
      }

      const paletteColor = nodeColors[index % Math.max(nodeColors.length, 1)];
      return typeof paletteColor === 'string' ? paletteColor : '#1f77b4';
    });

    // Compute aggregates by scanning all node values
    const aggregates: Record<string, number> = {};
    nodes.forEach(d => {
      const val = d[nodeColorVariable];
      if (!d.visible) {
        // If node is not visible, you can decide to skip or do aggregates[val] = 0;
        return;
      }
      aggregates[val] = (aggregates[val] || 0) + 1;
    });

    const distinctValues = Object.keys(aggregates);

    // Expand color array if needed
    if (distinctValues.length > updatedNodeColors.length) {
      let expandedColors: string[] = [];
      let neededTimes = Math.ceil(distinctValues.length / updatedNodeColors.length);
      while (neededTimes-- > 0) {
        expandedColors = expandedColors.concat(updatedNodeColors);
      }
      updatedNodeColors = expandedColors;
    }

    // Expand alpha array if needed
    if (distinctValues.length > updatedNodeAlphas.length) {
      updatedNodeAlphas = updatedNodeAlphas.concat(
        new Array(distinctValues.length - updatedNodeAlphas.length).fill(1)
      );
    }

    // For each distinct value, see if we have a color in the “history”
    distinctValues.forEach((val, i) => {
      const historyColor = updatedColorsTableHistory[val];
      
      if (typeof historyColor === 'string') {
        updatedNodeColors[i] = historyColor;
        return;
      }
      if (val === 'null') {
        updatedNodeColors[i] = '#EAE553';
      }

      updatedColorsTableHistory[val] = updatedNodeColors[i];
    });

    // We store this updated array back into the “table”
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
      aggregates,
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

    // If no existing color array for the chosen link variable
    if (!updatedLinkColorsTable[linkColorVariable]) {
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

    const ensureAggregateKey = (value: any): string | null => {
      if (value === undefined || value === null || value === '') {
        return null;
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
          .map(ensureAggregateKey)
          .filter((key): key is string => key !== null);

        if (originKeys.length > 1) {
          multiLinkCount++;
        } else if (originKeys.length === 1) {
          aggregates[originKeys[0]] += 1;
        }

      } else {
        const val = ensureAggregateKey(l[linkColorVariable]);
        if (val !== null) {
          aggregates[val] += 1;
        }
      }
    });

    if (multiLinkCount > 0) {
      aggregates["Duo-Link"] = multiLinkCount;
    }

    const isOriginColorVariable = String(linkColorVariable).toLowerCase() === 'origin';
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
    const basePalette = uniqueCandidatePalette.length > 1
      ? uniqueCandidatePalette
      : defaultLinkPalette;
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
    const repairDuplicateOriginColors = isOriginColorVariable;

    distinctValues.forEach((val) => {
      const existingColor = colorsByKey.get(val);
      if (existingColor) {
        if (resetExpandedOriginColors) {
          delete updatedLinkColorsTableHistory[val];
          return;
        }

        if (repairDuplicateOriginColors && usedColors.has(existingColor)) {
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
