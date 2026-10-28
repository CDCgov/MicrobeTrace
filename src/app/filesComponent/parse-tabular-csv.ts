import * as Papa from 'papaparse';
import { defineEnumerableOwnProperty } from '@app/contactTraceCommonServices/safe-object-properties';

/** Parse headers through neutral keys so Papa cannot invoke __proto__ setters. */
export function parseTabularCsv(contents: string, config: any = {}): any {
  const preview = Papa.parse(contents, {
    ...config,
    header: false,
    dynamicTyping: false,
    preview: 1,
    step: undefined,
    complete: undefined
  });
  const usedHeaders = new Set<string>();
  const headers = (preview.data[0] || []).map((value: any) => {
    const original = String(value ?? '');
    let header = original;
    let suffix = 1;
    while (usedHeaders.has(header)) header = `${original}_${suffix++}`;
    usedHeaders.add(header);
    return header;
  });
  const neutralPrefix = '__microbetrace_csv_header_';
  const restoreRow = (row: any): any => {
    const restored = {};
    Object.keys(row || {}).forEach(key => {
      const match = /^__microbetrace_csv_header_(\d+)__$/.exec(key);
      const header = match ? headers[Number(match[1])] : key;
      defineEnumerableOwnProperty(restored, header, row[key]);
    });
    return restored;
  };
  const restoreResult = (result: any): any => {
    result.data = Array.isArray(result.data)
      ? result.data.map(restoreRow)
      : restoreRow(result.data);
    if (result.meta) result.meta.fields = [...headers];
    return result;
  };
  const result = Papa.parse(contents, {
    ...config,
    header: true,
    transformHeader: (_header: string, index: number) => `${neutralPrefix}${index}__`,
    step: config.step
      ? (row: any, parser: any) => config.step(restoreResult(row), parser)
      : undefined,
    complete: config.complete
      ? (rows: any, file: any) => config.complete(restoreResult(rows), file)
      : undefined
  });
  return config.step || config.complete ? result : restoreResult(result);
}
