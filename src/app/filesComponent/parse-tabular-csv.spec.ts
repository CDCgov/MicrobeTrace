import { parseTabularCsv } from './parse-tabular-csv';

describe('tabular CSV parsing', () => {
  const contents = 'id,__proto__,constructor, Lat ,flag,score\nA,keep-proto,keep-constructor,2,true,1.5\n';

  it('retains prototype-sensitive columns as own properties with normal CSV types', () => {
    const result = parseTabularCsv(contents, { dynamicTyping: true, skipEmptyLines: true });
    const row = result.data[0];
    expect(Object.getPrototypeOf(row)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(row, '__proto__')).toBeTrue();
    expect(row['__proto__']).toBe('keep-proto');
    expect(row.constructor).toBe('keep-constructor');
    expect(row[' Lat ']).toBe(2);
    expect(row.flag).toBeTrue();
    expect(row.score).toBe(1.5);
    expect(result.meta.fields).toEqual(['id', '__proto__', 'constructor', ' Lat ', 'flag', 'score']);
  });

  it('preserves quoted headers, duplicate columns, and names resembling temporary keys', () => {
    const result = parseTabularCsv('id,"a,b",__proto__,__proto__,__microbetrace_csv_header_0__\nA,quoted,first,second,original\n',
      { skipEmptyLines: true });
    expect(result.data[0]['a,b']).toBe('quoted');
    expect(result.data[0]['__proto__']).toBe('first');
    expect(result.data[0]['__proto___1']).toBe('second');
    expect(result.data[0]['__microbetrace_csv_header_0__']).toBe('original');
  });

  it('restores streamed rows and completion metadata', () => {
    const rows: any[] = [];
    let completed = false;
    parseTabularCsv(contents, {
      dynamicTyping: true,
      skipEmptyLines: true,
      step: result => {
        rows.push(result.data);
        expect(result.meta.fields).toContain('__proto__');
      },
      complete: result => {
        completed = true;
        expect(result.meta.fields).toContain('__proto__');
      }
    });
    expect(completed).toBeTrue();
    expect(rows.length).toBe(1);
    expect(rows[0]['__proto__']).toBe('keep-proto');
  });
});
