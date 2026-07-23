const FORMULA_PREFIXES = new Set(['=', '+', '-', '@']);

export function sanitizeExportCell(value: unknown): unknown {
    if (typeof value !== 'string' || !value) {
        return value;
    }

    if (value.charAt(0) === '\t' || value.charAt(0) === '\r') {
        return `'${value}`;
    }

    const firstMeaningfulCharacter = value.trimStart().charAt(0);

    return FORMULA_PREFIXES.has(firstMeaningfulCharacter) ? `'${value}` : value;
}

export function sanitizeExportRecord(record: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};

    Object.keys(record).forEach(key => {
        sanitized[key] = sanitizeExportCell(record[key]);
    });

    return sanitized;
}

export function sanitizeExportRows<T extends Record<string, unknown>>(rows: T[]): Record<string, unknown>[] {
    return rows.map(row => sanitizeExportRecord(row));
}

export function buildSafeCsvRow(values: unknown[]): string {
    return values.map(value => serializeCsvCell(sanitizeExportCell(value))).join(',');
}

function serializeCsvCell(value: unknown): string {
    if (value === null || value === undefined) {
        return '';
    }

    const text = String(value);
    const shouldQuote = /[",\r\n]/.test(text);
    const escaped = text.replace(/"/g, '""');

    return shouldQuote ? `"${escaped}"` : escaped;
}
