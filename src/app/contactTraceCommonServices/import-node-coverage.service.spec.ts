import * as XLSX from 'xlsx';
import { GraphMLService } from './graphml.service';
import {
  IMPORT_NODE_COVERAGE_DISPLAY_LIMIT,
  ImportNodeCoverageService,
} from './import-node-coverage.service';

describe('ImportNodeCoverageService', () => {
  let service: ImportNodeCoverageService;

  beforeEach(() => {
    service = new ImportNodeCoverageService(new GraphMLService());
  });

  it('finds normalized, deduplicated mismatches in both directions', () => {
    const result = service.analyze([
      {
        name: 'nodes.csv',
        extension: 'csv',
        format: 'node',
        field1: 'sample',
        contents: 'sample,value\n A ,one\nB,two\nB,duplicate\nC,three\n,blank',
      },
      {
        name: 'links.csv',
        extension: 'csv',
        format: 'link',
        field1: 'from',
        field2: 'to',
        contents: 'from,to\nA,B\nB,D\nD,D\n,ignored',
      },
    ]);

    expect(result.status).toBe('complete');
    if (result.status !== 'complete') return;

    expect(result.summary.missingNodeData).toEqual({
      total: 1,
      ids: ['D'],
      hidden: 0,
    });
    expect(result.summary.missingLinkInformation).toEqual({
      total: 1,
      ids: ['C'],
      hidden: 0,
    });
  });

  it('honors remapped JSON fields and preserves case', () => {
    const result = service.analyze([
      {
        name: 'nodes.json',
        extension: 'json',
        format: 'node',
        field1: 'chosenId',
        contents: JSON.stringify([
          { ignored: 'wrong-1', chosenId: 'CaseA' },
          { ignored: 'wrong-2', chosenId: 'casea' },
        ]),
      },
      {
        name: 'links.json',
        extension: 'json',
        format: 'link',
        field1: 'left',
        field2: 'right',
        contents: JSON.stringify([{ left: 'CaseA', right: 'Other' }]),
      },
    ]);

    expect(result.status).toBe('complete');
    if (result.status !== 'complete') return;

    expect(result.summary.missingNodeData.ids).toEqual(['Other']);
    expect(result.summary.missingLinkInformation.ids).toEqual(['casea']);
  });

  it('caps each displayed mismatch group at 100 sorted IDs', () => {
    const nodeRows = Array.from(
      { length: IMPORT_NODE_COVERAGE_DISPLAY_LIMIT + 5 },
      (_, index) => `N${index + 1}`,
    );
    const result = service.analyze([
      {
        name: 'nodes.csv',
        extension: 'csv',
        format: 'node',
        field1: 'id',
        contents: `id\n${nodeRows.join('\n')}`,
      },
      {
        name: 'links.csv',
        extension: 'csv',
        format: 'link',
        field1: 'source',
        field2: 'target',
        contents: 'source,target\nA,B',
      },
    ]);

    expect(result.status).toBe('complete');
    if (result.status !== 'complete') return;

    expect(result.summary.missingLinkInformation.total).toBe(105);
    expect(result.summary.missingLinkInformation.ids.length).toBe(100);
    expect(result.summary.missingLinkInformation.hidden).toBe(5);
    expect(result.summary.missingLinkInformation.ids.slice(0, 3)).toEqual(['N1', 'N2', 'N3']);
  });

  it('skips node and FASTA inputs when no explicit topology exists', () => {
    const result = service.analyze([
      {
        name: 'nodes.csv',
        extension: 'csv',
        format: 'node',
        field1: 'id',
        contents: 'id\nA\nB',
      },
      {
        name: 'sequences.fasta',
        extension: 'fasta',
        format: 'fasta',
        contents: '>A\nAAAA\n>B\nCCCC',
      },
      {
        name: 'locations.geojson',
        extension: 'geojson',
        format: 'geojson',
        contents: '{"type":"FeatureCollection","features":[]}',
      },
    ]);

    expect(result).toEqual({ status: 'skipped' });
  });

  it('treats matrices, Newick, and Auspice leaves as node and topology coverage', () => {
    const result = service.analyze([
      {
        name: 'matrix.csv',
        extension: 'csv',
        format: 'matrix',
        contents: ',M1,M2\nM1,0,1\nM2,1,0',
      },
      {
        name: 'tree.nwk',
        extension: 'nwk',
        format: 'newick',
        contents: '(N1:1,N2:1);',
      },
      {
        name: 'auspice.json',
        extension: 'json',
        format: 'auspice',
        contents: {
          tree: {
            name: 'root',
            children: [{ name: 'A1' }, { name: 'A2' }],
          },
        },
      },
    ]);

    expect(result.status).toBe('complete');
    if (result.status !== 'complete') return;

    expect(result.summary.missingNodeData.total).toBe(0);
    expect(result.summary.missingLinkInformation.total).toBe(0);
  });

  it('reads remapped Excel node and link identifiers', () => {
    const makeWorkbook = (rows: Record<string, any>[]) => {
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Sheet1');
      return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
    };
    const result = service.analyze([
      {
        name: 'nodes.xlsx',
        extension: 'xlsx',
        format: 'node',
        field1: 'chosen',
        contents: makeWorkbook([{ other: 'wrong', chosen: 'X1' }]),
      },
      {
        name: 'links.xlsx',
        extension: 'xlsx',
        format: 'link',
        field1: 'left',
        field2: 'right',
        contents: makeWorkbook([{ left: 'X1', right: 'X2' }]),
      },
    ]);

    expect(result.status).toBe('complete');
    if (result.status !== 'complete') return;

    expect(result.summary.missingNodeData.ids).toEqual(['X2']);
    expect(result.summary.missingLinkInformation.total).toBe(0);
  });

  it('compares declared nodes and endpoints in supported network documents', () => {
    const result = service.analyze([
      {
        name: 'network.dot',
        extension: 'dot',
        format: 'network',
        contents: 'graph G { A; B; C; A -- B; }',
      },
    ]);

    expect(result.status).toBe('complete');
    if (result.status !== 'complete') return;

    expect(result.summary.missingNodeData.total).toBe(0);
    expect(result.summary.missingLinkInformation.ids).toEqual(['C']);
  });

  it('does not count generated network endpoint nodes as declarations', () => {
    const result = service.analyze([
      {
        name: 'network.graphml',
        extension: 'graphml',
        format: 'network',
        contents: [
          '<graphml xmlns="http://graphml.graphdrawing.org/xmlns">',
          '<graph id="G" edgedefault="undirected">',
          '<node id="declared"/>',
          '<edge source="declared" target="endpoint-only"/>',
          '</graph>',
          '</graphml>',
        ].join(''),
      },
    ]);

    expect(result.status).toBe('complete');
    if (result.status !== 'complete') return;

    expect(result.summary.missingNodeData.ids).toEqual(['endpoint-only']);
    expect(result.summary.missingLinkInformation.total).toBe(0);
  });

  it('analyzes each supported network document family through the shared importer', () => {
    const documents = [
      {
        name: 'network.graphml',
        contents: '<graphml xmlns="http://graphml.graphdrawing.org/xmlns"><graph id="G" edgedefault="undirected"><node id="1"/><node id="2"/><node id="3"/><edge source="1" target="2"/></graph></graphml>',
      },
      {
        name: 'network.gexf',
        contents: '<gexf xmlns="http://gexf.net/1.3"><graph defaultedgetype="undirected"><nodes><node id="1"/><node id="2"/><node id="3"/></nodes><edges><edge id="e1" source="1" target="2"/></edges></graph></gexf>',
      },
      {
        name: 'network.xgmml',
        contents: '<graph id="G" directed="0" xmlns="http://www.cs.rpi.edu/XGMML"><node id="1"/><node id="2"/><node id="3"/><edge source="1" target="2"/></graph>',
      },
      {
        name: 'network.cx2',
        contents: JSON.stringify([
          { CXVersion: '2.0' },
          { nodes: [{ id: 1 }, { id: 2 }, { id: 3 }] },
          { edges: [{ id: 1, s: 1, t: 2 }] },
          { status: [{ success: true }] },
        ]),
      },
      {
        name: 'network.dot',
        contents: 'graph G { 1; 2; 3; 1 -- 2; }',
      },
      {
        name: 'network.gv',
        contents: 'graph G { 1; 2; 3; 1 -- 2; }',
      },
      {
        name: 'network.gml',
        contents: 'graph [ node [ id 1 ] node [ id 2 ] node [ id 3 ] edge [ source 1 target 2 ] ]',
      },
    ];

    documents.forEach(document => {
      const result = service.analyze([{
        ...document,
        extension: document.name.split('.').pop(),
        format: 'network',
      }]);

      expect(result.status).withContext(document.name).toBe('complete');
      if (result.status !== 'complete') return;
      expect(result.summary.missingNodeData.total).withContext(document.name).toBe(0);
      expect(result.summary.missingLinkInformation.ids).withContext(document.name).toEqual(['3']);
    });
  });

  it('returns unavailable instead of a partial result when a contributing file cannot be parsed', () => {
    const result = service.analyze([
      {
        name: 'nodes.csv',
        extension: 'csv',
        format: 'node',
        field1: 'id',
        contents: 'id\nA',
      },
      {
        name: 'broken.json',
        extension: 'json',
        format: 'link',
        field1: 'source',
        field2: 'target',
        contents: '{not json}',
      },
    ]);

    expect(result.status).toBe('unavailable');
  });
});
