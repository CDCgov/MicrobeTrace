import {
  ColorAssignmentService,
  NodeColorAssignmentParseError
} from './color-assignment.service';

describe('ColorAssignmentService', () => {
  let service: ColorAssignmentService;

  beforeEach(() => {
    service = new ColorAssignmentService();
  });

  it('parses the synthetic iTOL color strip and collapses identical duplicates', () => {
    const contents = `DATASET_COLORSTRIP
SEPARATOR SPACE
DATASET_LABEL MLST
#LEGEND_TITLE Example
# FIELD_COLORS #ffffff
COLOR #00ff00
# FIELD_SHAPES 2
BORDER_WIDTH 1
BORDER_COLOR #ffffff
STRIP_WIDTH 100
MARGIN 0
# SHOW_INTERNAL 0
# LABEL_ROTATION 0
# STRAIGHT_LABELS 0
# ALIGN_TO_TREE 0
SIZE_FACTOR 1.0
# SYMBOL_SPACING 10
DATA
GCWGS-1 #ffffff 967
GCWGS-2 #f8da6a 84
GCWGS-3 #CC9999 8
GCWGS-4 #bababa 902
GCWGS-5 #cbf7cb 189
GCWGS-6 #CC9999 8`;
    const descriptor = service.inspect(contents);
    const result = service.parse(contents, 'MLST');

    expect(descriptor).toEqual({ format: 'itol-colorstrip', declaredField: 'MLST' });
    expect(result.format).toBe('itol-colorstrip');
    expect(result.datasetLabel).toBe('MLST');
    expect(result.rowCount).toBe(6);
    expect(result.duplicateCount).toBe(1);
    expect(result.uniqueAssignmentCount).toBe(5);
    expect(result.assignments['967']).toBe('#ffffff');
    expect(result.assignments['84']).toBe('#f8da6a');
    expect(result.assignments['8']).toBe('#cc9999');
    expect(result.assignments['902']).toBe('#bababa');
    expect(result.assignments['189']).toBe('#cbf7cb');
  });

  it('supports TAB and COMMA iTOL separators', () => {
    const tabResult = service.parse(
      'DATASET_COLORSTRIP\nSEPARATOR TAB\nDATASET_LABEL\tMLST\nDATA\nA\t#123\t1',
      'MLST'
    );
    const commaResult = service.parse(
      'DATASET_COLORSTRIP\nSEPARATOR COMMA\nDATASET_LABEL,MLST\nDATA\nA,#abcdef,1',
      'MLST'
    );

    expect(tabResult.assignments['1']).toBe('#112233');
    expect(commaResult.assignments['1']).toBe('#abcdef');
  });

  it('uses the fixed first iTOL column as the assignment key for node ID fields', () => {
    const result = service.parse(
      'DATASET_COLORSTRIP\nSEPARATOR TAB\nDATASET_LABEL\tisolate\nDATA\n46200\t#00daff\tNCTCtest\n46267\t#ffb700\t2023HQ-00151',
      '_id',
      [{ _id: '46200' }, { _id: '46267' }]
    );

    expect(result.assignments['46200']).toBe('#00daff');
    expect(result.assignments['46267']).toBe('#ffb700');
    expect(result.assignments['NCTCtest']).toBeUndefined();
    expect(result.matchedSampleIdCount).toBe(2);
  });

  it('resolves matched iTOL sample IDs through the selected field and retains unmatched row values', () => {
    const result = service.parse(
      'DATASET_COLORSTRIP\nSEPARATOR SPACE\nDATASET_LABEL MLST\nDATA\nGCWGS-1 #ffffff 967\nGCWGS-2 #f8da6a 84',
      'MLST',
      [{ _id: 'GCWGS-1', MLST: '967' }]
    );

    expect(result.assignments['967']).toBe('#ffffff');
    expect(result.assignments['84']).toBe('#f8da6a');
    expect(result.matchedSampleIdCount).toBe(1);
  });

  it('uses the first table column as the matching value and the named color column as its color', () => {
    expect(service.inspect('MLST\textra\tcolor\n8\tignored\t#CC9999'))
      .toEqual({ format: 'delimited-table', declaredField: 'MLST' });
    const genericResult = service.parse('id,value,color\nA,8,#123\nB,84,#abcdef', 'MLST');
    const fieldResult = service.parse('MLST\textra\tcolor\n8\tignored\t#CC9999', 'MLST');

    expect(genericResult.format).toBe('delimited-table');
    expect(genericResult.assignments['A']).toBe('#112233');
    expect(genericResult.assignments['B']).toBe('#abcdef');
    expect(genericResult.assignments['8']).toBeUndefined();
    expect(fieldResult.assignments['8']).toBe('#cc9999');
  });

  it('parses explicitly continuous table assignments as normalized numeric ramp stops', () => {
    const result = service.parse(
      'RiskScore,color,mode\n5.0,#440154,continuous\n50,#21918c,\n9.6e1,#fde725,continuous',
      'RiskScore'
    );

    expect(result.mode).toBe('continuous');
    expect(result.uniqueAssignmentCount).toBe(3);
    expect(result.assignments).toEqual(jasmine.objectContaining({
      '5': '#440154',
      '50': '#21918c',
      '96': '#fde725'
    }));
  });

  it('rejects invalid or underspecified continuous ramp declarations', () => {
    expect(() => service.parse('RiskScore,color,mode\nlow,#440154,continuous\n10,#fde725,', 'RiskScore'))
      .toThrowError(NodeColorAssignmentParseError, /finite numeric color-stop value/);
    expect(() => service.parse('RiskScore,color,mode\n10,#440154,continuous', 'RiskScore'))
      .toThrowError(NodeColorAssignmentParseError, /at least two distinct numeric stops/);
    expect(() => service.parse('RiskScore,color,mode\n0,#440154,continuous\n10,#fde725,categorical', 'RiskScore'))
      .toThrowError(NodeColorAssignmentParseError, /same mode/);
  });

  it('parses the supplied ID-first table layout for the selected internal _id field', () => {
    const result = service.parse(
      'id\tMLST\tcolor\tnotes\n' +
      'SAMPLE-001\t8\t#cc9999\toptional columns are ignored\n' +
      'SAMPLE-002\t84\t#f8da6a\toptional columns are ignored\n' +
      'SAMPLE-003\t967\t#09f\toptional columns are ignored',
      '_id'
    );

    expect(result.assignments['SAMPLE-001']).toBe('#cc9999');
    expect(result.assignments['SAMPLE-002']).toBe('#f8da6a');
    expect(result.assignments['SAMPLE-003']).toBe('#0099ff');
  });

  it('rejects conflicting duplicate assignments atomically', () => {
    expect(() => service.parse('value,color\n8,#ffffff\n8,#000000', 'MLST'))
      .toThrowError(NodeColorAssignmentParseError, /assigned both/);
  });

  it('rejects malformed rows, invalid colors, and unsupported files', () => {
    expect(() => service.parse('DATASET_COLORSTRIP\nSEPARATOR SPACE\nDATA\nA #ffffff', 'MLST'))
      .toThrowError(NodeColorAssignmentParseError, /sample ID, color, and variable value/);
    expect(() => service.parse('value,color\n8,red', 'MLST'))
      .toThrowError(NodeColorAssignmentParseError, /valid #RGB or #RRGGBB/);
    expect(() => service.parse('one column only\n8', 'MLST'))
      .toThrowError(NodeColorAssignmentParseError, /comma- or tab-delimited/);
    expect(() => service.parse('color,value\n#ffffff,8', 'MLST'))
      .toThrowError(NodeColorAssignmentParseError, /first column must contain matching values/);
  });
});
