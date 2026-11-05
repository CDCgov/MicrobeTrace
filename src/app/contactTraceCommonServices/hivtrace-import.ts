type CompactValueDictionary = {
    keys: Record<string, any>;
    values: any[];
};

export interface NormalizedHIVTraceNetwork {
    nodes: any[];
    edges: any[];
}

function isCompactValueDictionary(value: any): value is CompactValueDictionary {
    return value !== null
        && typeof value === 'object'
        && !Array.isArray(value)
        && value.keys !== null
        && typeof value.keys === 'object'
        && Array.isArray(value.values);
}

function expandCompactField(fieldName: string, fieldValues: any): any[] {
    if (Array.isArray(fieldValues)) {
        return fieldValues;
    }

    if (!isCompactValueDictionary(fieldValues)) {
        throw new Error(`HIV-TRACE compact field "${fieldName}" is not an array or value dictionary.`);
    }

    return fieldValues.values.map(valueIndex => {
        const key = String(valueIndex);
        if (!Object.prototype.hasOwnProperty.call(fieldValues.keys, key)) {
            throw new Error(`HIV-TRACE compact field "${fieldName}" references missing value ${key}.`);
        }
        return fieldValues.keys[key];
    });
}

export function expandCompactHIVTraceCollection(collection: any, collectionName: string): any[] {
    if (Array.isArray(collection)) {
        return collection;
    }

    if (collection === null || typeof collection !== 'object') {
        throw new Error(`HIV-TRACE ${collectionName} must be an array or compact object.`);
    }

    const fields = Object.keys(collection);
    if (!fields.length) {
        return [];
    }

    const expandedFields = fields.map(field => ({
        field,
        values: expandCompactField(field, collection[field])
    }));
    const rowCount = expandedFields[0].values.length;

    expandedFields.forEach(({ field, values }) => {
        if (values.length !== rowCount) {
            throw new Error(
                `HIV-TRACE compact ${collectionName} field "${field}" has ${values.length} values; expected ${rowCount}.`
            );
        }
    });

    return Array.from({ length: rowCount }, (_, rowIndex) => {
        const row: Record<string, any> = {};
        expandedFields.forEach(({ field, values }) => {
            row[field] = values[rowIndex];
        });
        return row;
    });
}

export function normalizeHIVTraceNetwork(hivtrace: any): NormalizedHIVTraceNetwork {
    const traceResults = hivtrace?.trace_results;
    if (traceResults === null || typeof traceResults !== 'object') {
        throw new Error('HIV-TRACE output is missing trace_results.');
    }

    return {
        nodes: expandCompactHIVTraceCollection(traceResults.Nodes, 'Nodes'),
        edges: expandCompactHIVTraceCollection(traceResults.Edges, 'Edges')
    };
}
