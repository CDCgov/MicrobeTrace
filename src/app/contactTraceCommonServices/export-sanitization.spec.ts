import { buildSafeCsvRow, sanitizeExportCell, sanitizeExportRows } from './export-sanitization';

describe('export sanitization', () => {
    it('escapes formula-leading string cells', () => {
        expect(sanitizeExportCell('=cmd()')).toBe("'=cmd()");
        expect(sanitizeExportCell(' +SUM(A1:A2)')).toBe("' +SUM(A1:A2)");
        expect(sanitizeExportCell('-10')).toBe("'-10");
        expect(sanitizeExportCell('@user')).toBe("'@user");
        expect(sanitizeExportCell('\t=cmd()')).toBe("'\t=cmd()");
        expect(sanitizeExportCell('\r=cmd()')).toBe("'\r=cmd()");
    });

    it('preserves non-formula cells and non-string values', () => {
        expect(sanitizeExportCell('alpha')).toBe('alpha');
        expect(sanitizeExportCell("'=already-text")).toBe("'=already-text");
        expect(sanitizeExportCell(42)).toBe(42);
        expect(sanitizeExportCell(null)).toBeNull();
    });

    it('sanitizes record rows without changing keys', () => {
        expect(sanitizeExportRows([{ id: '=A1', count: 3 }])).toEqual([{ id: "'=A1", count: 3 }]);
    });

    it('serializes sanitized CSV rows', () => {
        expect(buildSafeCsvRow(['=A1', 'a,b', 'plain'])).toBe("'=A1,\"a,b\",plain");
    });
});
