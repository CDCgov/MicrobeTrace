import { Injectable } from '@angular/core';
import * as Papa from 'papaparse';

export type NodeColorAssignmentFormat = 'itol-colorstrip' | 'delimited-table';
export type ColorAssignmentMode = 'categorical' | 'continuous';

export interface NodeColorAssignmentParseIssue {
  line: number;
  message: string;
}

export interface ParsedNodeColorAssignments {
  format: NodeColorAssignmentFormat;
  datasetLabel?: string;
  mode?: ColorAssignmentMode;
  assignments: Record<string, string>;
  rowCount: number;
  duplicateCount: number;
  uniqueAssignmentCount: number;
  matchedSampleIdCount?: number;
}

export interface NodeColorAssignmentFileDescriptor {
  format: NodeColorAssignmentFormat;
  declaredField?: string;
}

interface ParsedItolRow {
  line: number;
  sampleId: string;
  color: string;
  value: string;
}

export class NodeColorAssignmentParseError extends Error {
  constructor(public readonly issues: NodeColorAssignmentParseIssue[]) {
    super(NodeColorAssignmentParseError.buildMessage(issues));
    this.name = 'NodeColorAssignmentParseError';
  }

  private static buildMessage(issues: NodeColorAssignmentParseIssue[]): string {
    if (!issues.length) {
      return 'The color assignment file could not be parsed.';
    }

    const visibleIssues = issues
      .slice(0, 3)
      .map(issue => `Line ${issue.line}: ${issue.message}`)
      .join(' ');
    const remainingCount = issues.length - 3;

    return remainingCount > 0
      ? `${visibleIssues} ${remainingCount} more error${remainingCount === 1 ? '' : 's'} found.`
      : visibleIssues;
  }
}

@Injectable({
  providedIn: 'root'
})
export class ColorAssignmentService {
  inspect(contents: string): NodeColorAssignmentFileDescriptor {
    const normalizedContents = String(contents ?? '').replace(/^\uFEFF/, '');
    const lines = normalizedContents.split(/\r?\n/);
    const firstContentLine = lines.find(line => {
      const trimmed = line.trim();
      return trimmed.length > 0 && !trimmed.startsWith('#');
    });

    if (!firstContentLine) {
      throw new NodeColorAssignmentParseError([
        { line: 1, message: 'The file is empty.' }
      ]);
    }

    if (firstContentLine.trim().toUpperCase() === 'DATASET_COLORSTRIP') {
      return {
        format: 'itol-colorstrip',
        declaredField: this.inspectItolDatasetLabel(lines)
      };
    }

    const result = Papa.parse<string[]>(normalizedContents, {
      delimiter: '',
      skipEmptyLines: 'greedy',
      preview: 1
    });
    const delimiter = result.meta.delimiter;
    if (delimiter !== ',' && delimiter !== '\t') {
      throw new NodeColorAssignmentParseError([
        { line: 1, message: 'Simple assignment tables must be comma- or tab-delimited.' }
      ]);
    }

    const declaredField = String(result.data?.[0]?.[0] ?? '').trim();
    if (!declaredField) {
      throw new NodeColorAssignmentParseError([
        { line: 1, message: 'The first column must identify the node field to color by.' }
      ]);
    }

    return {
      format: 'delimited-table',
      declaredField
    };
  }

  parse(
    contents: string,
    selectedField: string,
    nodes: ReadonlyArray<Record<string, any>> = []
  ): ParsedNodeColorAssignments {
    const normalizedContents = String(contents ?? '').replace(/^\uFEFF/, '');
    const lines = normalizedContents.split(/\r?\n/);
    const firstContentLine = lines.find(line => {
      const trimmed = line.trim();
      return trimmed.length > 0 && !trimmed.startsWith('#');
    });

    if (!firstContentLine) {
      throw new NodeColorAssignmentParseError([
        { line: 1, message: 'The file is empty.' }
      ]);
    }

    if (firstContentLine.trim().toUpperCase() === 'DATASET_COLORSTRIP') {
      return this.parseItolColorStrip(lines, selectedField, nodes);
    }

    return this.parseDelimitedTable(normalizedContents);
  }

  private parseItolColorStrip(
    lines: string[],
    selectedField: string,
    nodes: ReadonlyArray<Record<string, any>>
  ): ParsedNodeColorAssignments {
    const issues: NodeColorAssignmentParseIssue[] = [];
    let separator: ' ' | '\t' | ',' | null = null;
    let datasetLabel: string | undefined;
    let dataLineIndex = -1;

    for (let index = 0; index < lines.length; index++) {
      const trimmed = lines[index].trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      const separatorMatch = trimmed.match(/^SEPARATOR(?:\s+|,|\t)(SPACE|TAB|COMMA)$/i);
      if (separatorMatch) {
        const separatorName = separatorMatch[1].toUpperCase();
        separator = separatorName === 'SPACE' ? ' ' : separatorName === 'TAB' ? '\t' : ',';
        continue;
      }

      if (trimmed.toUpperCase() === 'DATA') {
        dataLineIndex = index;
        break;
      }

      if (separator && this.getItolKeyword(lines[index], separator) === 'DATASET_LABEL') {
        const fields = this.splitItolLine(lines[index], separator);
        datasetLabel = fields.slice(1).join(separator === ' ' ? ' ' : separator).trim() || undefined;
      }
    }

    if (!separator) {
      issues.push({ line: 2, message: 'A valid SEPARATOR SPACE, SEPARATOR TAB, or SEPARATOR COMMA declaration is required.' });
    }
    if (dataLineIndex < 0) {
      issues.push({ line: lines.length || 1, message: 'The required DATA section is missing.' });
    }
    if (issues.length) {
      throw new NodeColorAssignmentParseError(issues);
    }

    const parsedRows: ParsedItolRow[] = [];
    let rowCount = 0;

    for (let index = dataLineIndex + 1; index < lines.length; index++) {
      const trimmed = lines[index].trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      rowCount++;
      const fields = this.splitItolLine(lines[index], separator);
      const identifier = String(fields[0] ?? '').trim();
      const rawColor = String(fields[1] ?? '').trim();
      const value = separator === ' '
        ? fields.slice(2).join(' ').trim()
        : String(fields[2] ?? '').trim();

      if (fields.length < 3 || !identifier || !rawColor || !value) {
        issues.push({ line: index + 1, message: 'Expected a sample ID, color, and variable value.' });
        continue;
      }
      if (separator !== ' ' && fields.length > 3) {
        issues.push({ line: index + 1, message: 'Expected exactly three fields; quote values that contain the separator.' });
        continue;
      }

      const color = this.normalizeHexColor(rawColor);
      if (!color) {
        issues.push({ line: index + 1, message: `"${rawColor}" is not a valid #RGB or #RRGGBB color.` });
        continue;
      }

      parsedRows.push({ line: index + 1, sampleId: identifier, color, value });
    }

    if (rowCount === 0) {
      issues.push({ line: dataLineIndex + 1, message: 'The DATA section contains no assignment rows.' });
    }
    if (issues.length) {
      throw new NodeColorAssignmentParseError(issues);
    }

    const assignments = this.createAssignmentRecord();
    const nodesById = this.createNodeIdIndex(nodes);
    const useSampleIdAsValue = this.isNodeIdField(selectedField);
    let matchedSampleIdCount = 0;
    let duplicateCount = 0;

    parsedRows.forEach(row => {
      const matchedNode = nodesById.get(row.sampleId);
      if (matchedNode) {
        matchedSampleIdCount++;
      }

      const matchedFieldValue = matchedNode?.[selectedField];
      const normalizedMatchedFieldValue = matchedFieldValue === null || matchedFieldValue === undefined
        ? ''
        : String(matchedFieldValue).trim();
      const assignmentValue = useSampleIdAsValue
        ? row.sampleId
        : normalizedMatchedFieldValue || row.value;
      const duplicateResult = this.addAssignment(assignments, assignmentValue, row.color, row.line, issues);
      if (duplicateResult) {
        duplicateCount++;
      }
    });

    if (issues.length) {
      throw new NodeColorAssignmentParseError(issues);
    }

    return {
      format: 'itol-colorstrip',
      datasetLabel,
      mode: 'categorical',
      assignments,
      rowCount,
      duplicateCount,
      uniqueAssignmentCount: Object.keys(assignments).length,
      matchedSampleIdCount
    };
  }

  private inspectItolDatasetLabel(lines: string[]): string | undefined {
    let separator: ' ' | '\t' | ',' | null = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      const separatorMatch = trimmed.match(/^SEPARATOR(?:\s+|,|\t)(SPACE|TAB|COMMA)$/i);
      if (separatorMatch) {
        const separatorName = separatorMatch[1].toUpperCase();
        separator = separatorName === 'SPACE' ? ' ' : separatorName === 'TAB' ? '\t' : ',';
        continue;
      }

      if (separator && this.getItolKeyword(line, separator) === 'DATASET_LABEL') {
        const fields = this.splitItolLine(line, separator);
        return fields.slice(1).join(separator === ' ' ? ' ' : separator).trim() || undefined;
      }

      if (trimmed.toUpperCase() === 'DATA') {
        break;
      }
    }

    return undefined;
  }

  private createNodeIdIndex(nodes: ReadonlyArray<Record<string, any>>): Map<string, Record<string, any>> {
    const nodesById = new Map<string, Record<string, any>>();
    nodes.forEach(node => {
      const nodeId = String(node?._id ?? node?.id ?? '').trim();
      if (nodeId) {
        nodesById.set(nodeId, node);
      }
    });
    return nodesById;
  }

  private isNodeIdField(field: string): boolean {
    const normalizedField = String(field ?? '').trim().toLowerCase();
    return normalizedField === '_id' || normalizedField === 'id';
  }

  private parseDelimitedTable(contents: string): ParsedNodeColorAssignments {
    const result = Papa.parse<string[]>(contents, {
      delimiter: '',
      skipEmptyLines: 'greedy'
    });
    const parserIssues: NodeColorAssignmentParseIssue[] = result.errors.map(error => ({
      line: (error.row ?? 0) + 1,
      message: error.message
    }));
    const delimiter = result.meta.delimiter;
    const delimiterWasUndetectable = result.errors.some(error => error.code === 'UndetectableDelimiter');
    const issues: NodeColorAssignmentParseIssue[] = [];

    if (delimiterWasUndetectable || (delimiter !== ',' && delimiter !== '\t')) {
      issues.push({ line: 1, message: 'Simple assignment tables must be comma- or tab-delimited.' });
    } else {
      issues.push(...parserIssues);
    }

    const rows = result.data || [];
    const headers = (rows[0] || []).map(header => String(header ?? '').trim());
    const normalizedHeaders = headers.map(header => header.toLocaleLowerCase());
    const colorIndex = normalizedHeaders.indexOf('color');
    const modeIndex = normalizedHeaders.indexOf('mode');
    const valueIndex = 0;

    if (colorIndex < 0) {
      issues.push({ line: 1, message: 'A "color" column is required.' });
    }
    if (!headers[valueIndex]) {
      issues.push({ line: 1, message: 'The first column must identify values to match against the selected field.' });
    } else if (colorIndex === valueIndex) {
      issues.push({ line: 1, message: 'The first column must contain matching values, not colors.' });
    }
    if (rows.length < 2) {
      issues.push({ line: 1, message: 'The table contains no assignment rows.' });
    }
    if (issues.length) {
      throw new NodeColorAssignmentParseError(issues);
    }

    const declaredModes = rows
      .slice(1)
      .map((row, rowIndex) => ({
        line: rowIndex + 2,
        value: modeIndex < 0 ? '' : String(row[modeIndex] ?? '').trim().toLocaleLowerCase()
      }))
      .filter(entry => !!entry.value);
    let mode: ColorAssignmentMode | undefined;

    if (modeIndex >= 0) {
      if (!declaredModes.length) {
        issues.push({ line: 1, message: 'The "mode" column must declare "categorical" or "continuous".' });
      } else {
        declaredModes.forEach(entry => {
          if (entry.value !== 'categorical' && entry.value !== 'continuous') {
            issues.push({
              line: entry.line,
              message: `"${entry.value}" is not a valid color-assignment mode; expected "categorical" or "continuous".`
            });
          }
        });

        const validModes = declaredModes
          .map(entry => entry.value)
          .filter((value): value is ColorAssignmentMode => value === 'categorical' || value === 'continuous');
        if (new Set(validModes).size > 1) {
          issues.push({ line: 1, message: 'All populated "mode" cells must declare the same mode.' });
        } else {
          mode = validModes[0];
        }
      }
    }

    if (issues.length) {
      throw new NodeColorAssignmentParseError(issues);
    }

    const assignments = this.createAssignmentRecord();
    let rowCount = 0;
    let duplicateCount = 0;

    rows.slice(1).forEach((row, rowIndex) => {
      const line = rowIndex + 2;
      rowCount++;
      const rawValue = String(row[valueIndex] ?? '').trim();
      const rawColor = String(row[colorIndex] ?? '').trim();

      if (!rawValue || !rawColor) {
        issues.push({ line, message: 'Both the value and color fields are required.' });
        return;
      }

      const color = this.normalizeHexColor(rawColor);
      if (!color) {
        issues.push({ line, message: `"${rawColor}" is not a valid #RGB or #RRGGBB color.` });
        return;
      }

      let value = rawValue;
      if (mode === 'continuous') {
        const numericValue = Number(rawValue);
        if (!Number.isFinite(numericValue) || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(rawValue)) {
          issues.push({ line, message: `"${rawValue}" is not a finite numeric color-stop value.` });
          return;
        }
        value = String(numericValue);
      }

      const duplicateResult = this.addAssignment(assignments, value, color, line, issues);
      if (duplicateResult) {
        duplicateCount++;
      }
    });

    if (issues.length) {
      throw new NodeColorAssignmentParseError(issues);
    }

    if (mode === 'continuous' && Object.keys(assignments).length < 2) {
      throw new NodeColorAssignmentParseError([
        { line: 1, message: 'A continuous color ramp requires at least two distinct numeric stops.' }
      ]);
    }

    return {
      format: 'delimited-table',
      mode,
      assignments,
      rowCount,
      duplicateCount,
      uniqueAssignmentCount: Object.keys(assignments).length
    };
  }

  private getItolKeyword(line: string, separator: ' ' | '\t' | ','): string {
    return String(this.splitItolLine(line, separator)[0] ?? '').trim().toUpperCase();
  }

  private splitItolLine(line: string, separator: ' ' | '\t' | ','): string[] {
    if (separator === ' ') {
      return line.trim().split(/\s+/);
    }
    if (separator === '\t') {
      return line.split('\t').map(field => field.trim());
    }

    const parsed = Papa.parse<string[]>(line, { delimiter: ',' });
    return (parsed.data[0] || []).map(field => String(field ?? '').trim());
  }

  private normalizeHexColor(value: string): string | null {
    const match = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (!match) {
      return null;
    }

    const digits = match[1].toLowerCase();
    return digits.length === 3
      ? `#${digits.split('').map(character => `${character}${character}`).join('')}`
      : `#${digits}`;
  }

  private addAssignment(
    assignments: Record<string, string>,
    value: string,
    color: string,
    line: number,
    issues: NodeColorAssignmentParseIssue[]
  ): boolean {
    if (!Object.prototype.hasOwnProperty.call(assignments, value)) {
      assignments[value] = color;
      return false;
    }

    if (assignments[value] !== color) {
      issues.push({
        line,
        message: `Value "${value}" is assigned both ${assignments[value]} and ${color}.`
      });
    }

    return true;
  }

  private createAssignmentRecord(): Record<string, string> {
    return Object.create(null) as Record<string, string>;
  }
}
