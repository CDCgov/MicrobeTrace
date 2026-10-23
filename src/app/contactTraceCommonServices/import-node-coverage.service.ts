import { Injectable } from '@angular/core';
import * as Papa from 'papaparse';
import * as patristic from 'patristic';
import * as XLSX from 'xlsx';
import { GraphMLService } from './graphml.service';

export const IMPORT_NODE_COVERAGE_DISPLAY_LIMIT = 100;

export interface ImportNodeCoverageGroup {
  total: number;
  ids: string[];
  hidden: number;
}

export interface ImportNodeCoverageSummary {
  missingNodeData: ImportNodeCoverageGroup;
  missingLinkInformation: ImportNodeCoverageGroup;
}

export type ImportNodeCoverageAnalysis =
  | { status: 'complete'; summary: ImportNodeCoverageSummary }
  | { status: 'skipped' }
  | { status: 'unavailable'; error: unknown };

interface ImportCoverageAccumulator {
  nodeIds: Set<string>;
  topologyIds: Set<string>;
  hasExplicitTopology: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class ImportNodeCoverageService {
  constructor(private graphMLService: GraphMLService) {}

  analyze(files: ReadonlyArray<any>): ImportNodeCoverageAnalysis {
    const coverage: ImportCoverageAccumulator = {
      nodeIds: new Set<string>(),
      topologyIds: new Set<string>(),
      hasExplicitTopology: false,
    };

    try {
      for (const file of files || []) {
        this.addFileCoverage(file, coverage);
      }
    } catch (error) {
      console.warn('Unable to complete the missing-node import preflight.', error);
      return { status: 'unavailable', error };
    }

    if (!coverage.hasExplicitTopology) {
      return { status: 'skipped' };
    }

    const missingNodeData = Array.from(coverage.topologyIds)
      .filter(id => !coverage.nodeIds.has(id));
    const missingLinkInformation = Array.from(coverage.nodeIds)
      .filter(id => !coverage.topologyIds.has(id));

    return {
      status: 'complete',
      summary: {
        missingNodeData: this.summarize(missingNodeData),
        missingLinkInformation: this.summarize(missingLinkInformation),
      }
    };
  }

  private addFileCoverage(file: any, coverage: ImportCoverageAccumulator): void {
    const format = String(file?.format ?? '').toLowerCase();

    switch (format) {
      case 'node':
        this.addNodeTableCoverage(file, coverage);
        return;
      case 'link':
        this.addLinkTableCoverage(file, coverage);
        return;
      case 'matrix':
        this.addMatrixCoverage(file, coverage);
        return;
      case 'fasta':
        this.addFastaCoverage(file, coverage);
        return;
      case 'newick':
        this.addNewickCoverage(file, coverage);
        return;
      case 'auspice':
        this.addAuspiceCoverage(file, coverage);
        return;
      case 'network':
      case 'graphml':
        this.addNetworkDocumentCoverage(file, coverage);
        return;
      // GeoJSON enriches nodes that another source creates. Session/style and
      // unknown files likewise do not define either side of this comparison.
      case 'geojson':
      default:
        return;
    }
  }

  private addNodeTableCoverage(file: any, coverage: ImportCoverageAccumulator): void {
    const idField = String(file?.field1 ?? '');
    this.readTableRecords(file).forEach(record => {
      this.addId(coverage.nodeIds, record?.[idField]);
    });
  }

  private addLinkTableCoverage(file: any, coverage: ImportCoverageAccumulator): void {
    coverage.hasExplicitTopology = true;
    const sourceField = String(file?.field1 ?? '');
    const targetField = String(file?.field2 ?? '');

    this.readTableRecords(file).forEach(record => {
      this.addTopologyPair(
        coverage.topologyIds,
        record?.[sourceField],
        record?.[targetField],
      );
    });
  }

  private addMatrixCoverage(file: any, coverage: ImportCoverageAccumulator): void {
    coverage.hasExplicitTopology = true;
    const rows = this.readMatrixRows(file);
    if (!rows.length) {
      return;
    }

    const ids = new Set<string>();
    rows[0].slice(1).forEach(value => this.addId(ids, value));
    rows.slice(1).forEach(row => this.addId(ids, row?.[0]));
    ids.forEach(id => {
      coverage.nodeIds.add(id);
      coverage.topologyIds.add(id);
    });
  }

  private addFastaCoverage(file: any, coverage: ImportCoverageAccumulator): void {
    const contents = String(file?.contents ?? '');
    contents.split(/[\r\n]+/g).forEach(line => {
      if (line.startsWith('>')) {
        this.addId(coverage.nodeIds, line.slice(1));
      }
    });
  }

  private addNewickCoverage(file: any, coverage: ImportCoverageAccumulator): void {
    coverage.hasExplicitTopology = true;
    const tree = patristic.parseNewick(String(file?.contents ?? ''));
    tree.getLeaves().forEach(leaf => {
      const id = this.normalizeId(leaf?.id);
      if (!id) {
        return;
      }

      coverage.nodeIds.add(id);
      coverage.topologyIds.add(id);
    });
  }

  private addAuspiceCoverage(file: any, coverage: ImportCoverageAccumulator): void {
    coverage.hasExplicitTopology = true;
    const contents = typeof file?.contents === 'string'
      ? JSON.parse(file.contents)
      : file?.contents;
    const root = contents?.tree;
    if (!root || typeof root !== 'object') {
      throw new Error(`Auspice file ${file?.name || ''} does not contain a tree.`);
    }

    const visit = (node: any): void => {
      const children = Array.isArray(node?.children) ? node.children : [];
      if (!children.length) {
        const id = this.normalizeId(node?.name);
        if (id) {
          coverage.nodeIds.add(id);
          coverage.topologyIds.add(id);
        }
        return;
      }

      children.forEach(visit);
    };

    visit(root);
  }

  private addNetworkDocumentCoverage(file: any, coverage: ImportCoverageAccumulator): void {
    coverage.hasExplicitTopology = true;
    const document = this.graphMLService.importNetworkDocument(file?.contents, {
      sourceName: file?.name,
    });

    document.nodes
      .filter(node => node?.mt_generated_endpoint !== true && node?.dot_implicit_node !== true)
      .forEach(node => this.addId(coverage.nodeIds, node?._id ?? node?.id));
    document.links.forEach(link => {
      this.addTopologyPair(coverage.topologyIds, link?.source, link?.target);
    });
  }

  private readTableRecords(file: any): any[] {
    const extension = this.getExtension(file);
    if (extension === 'xls' || extension === 'xlsx') {
      const workbook = XLSX.read(file?.contents, {
        type: 'array',
        cellDates: true,
        dateNF: 'mm/dd/yyyy',
      });
      return XLSX.utils.sheet_to_json(
        workbook.Sheets[workbook.SheetNames[0]],
        { raw: false, dateNF: 'mm/dd/yyyy' },
      );
    }

    if (extension === 'json') {
      const parsed = typeof file?.contents === 'string'
        ? JSON.parse(file.contents)
        : file?.contents;
      if (Array.isArray(parsed)) {
        return parsed;
      }
      return parsed && typeof parsed === 'object' ? [parsed] : [];
    }

    const result = Papa.parse<Record<string, any>>(String(file?.contents ?? ''), {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
    });
    return result.data;
  }

  private readMatrixRows(file: any): any[][] {
    const extension = this.getExtension(file);
    if (extension === 'xls' || extension === 'xlsx') {
      const workbook = XLSX.read(file?.contents, {
        type: 'array',
        cellDates: true,
        dateNF: 'mm/dd/yyyy',
      });
      return XLSX.utils.sheet_to_json(
        workbook.Sheets[workbook.SheetNames[0]],
        { header: 1, raw: true, dateNF: 'mm/dd/yyyy' },
      ) as any[][];
    }

    const result = Papa.parse<any[]>(String(file?.contents ?? ''), {
      skipEmptyLines: 'greedy',
    });
    return result.data;
  }

  private getExtension(file: any): string {
    const explicit = String(file?.extension ?? '').toLowerCase();
    if (explicit) {
      return explicit;
    }

    const name = String(file?.name ?? '');
    return name.includes('.') ? name.split('.').pop()?.toLowerCase() || '' : '';
  }

  private addTopologyPair(ids: Set<string>, rawSource: any, rawTarget: any): void {
    const source = this.normalizeId(rawSource);
    const target = this.normalizeId(rawTarget);
    if (!source || !target || source === target) {
      return;
    }

    ids.add(source);
    ids.add(target);
  }

  private addId(ids: Set<string>, rawValue: any): void {
    const id = this.normalizeId(rawValue);
    if (id) {
      ids.add(id);
    }
  }

  private normalizeId(value: any): string | null {
    if (value === null || value === undefined) {
      return null;
    }

    const id = String(value).trim();
    return id.length ? id : null;
  }

  private summarize(ids: string[]): ImportNodeCoverageGroup {
    const sorted = [...ids].sort((left, right) => left.localeCompare(
      right,
      'en',
      { numeric: true, sensitivity: 'variant' },
    ));
    const displayed = sorted.slice(0, IMPORT_NODE_COVERAGE_DISPLAY_LIMIT);

    return {
      total: sorted.length,
      ids: displayed,
      hidden: sorted.length - displayed.length,
    };
  }
}
