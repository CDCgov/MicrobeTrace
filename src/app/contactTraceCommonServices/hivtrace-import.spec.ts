import {
    expandCompactHIVTraceCollection,
    normalizeHIVTraceNetwork
} from './hivtrace-import';

describe('HIV-TRACE import normalization', () => {
    it('expands compact node and edge columns into records', () => {
        const normalized = normalizeHIVTraceNetwork({
            trace_results: {
                Settings: { compact_json: true },
                Nodes: {
                    cluster: [1, 1],
                    id: ['sample-a', 'sample-b'],
                    patient_attributes: [{ city: 'Atlanta' }, {}]
                },
                Edges: {
                    sequences: [['sample-a', 'sample-b']],
                    length: [0.0125],
                    directed: {
                        keys: { 0: false },
                        values: [0]
                    }
                }
            }
        });

        expect(normalized.nodes).toEqual([
            { cluster: 1, id: 'sample-a', patient_attributes: { city: 'Atlanta' } },
            { cluster: 1, id: 'sample-b', patient_attributes: {} }
        ]);
        expect(normalized.edges).toEqual([
            { sequences: ['sample-a', 'sample-b'], length: 0.0125, directed: false }
        ]);
    });

    it('leaves classic HIV-TRACE record arrays unchanged', () => {
        const nodes = [{ id: 'sample-a' }];
        const edges = [{ sequences: ['sample-a', 'sample-b'], length: 0.01 }];

        expect(normalizeHIVTraceNetwork({ trace_results: { Nodes: nodes, Edges: edges } }))
            .toEqual({ nodes, edges });
    });

    it('rejects compact columns with inconsistent lengths', () => {
        expect(() => expandCompactHIVTraceCollection({
            id: ['sample-a', 'sample-b'],
            cluster: [1]
        }, 'Nodes')).toThrowError(/expected 2/);
    });

    it('rejects compact value dictionaries that reference an unknown key', () => {
        expect(() => expandCompactHIVTraceCollection({
            directed: { keys: { 0: false }, values: [1] }
        }, 'Edges')).toThrowError(/references missing value 1/);
    });
});
