import { TestBed } from '@angular/core/testing';
import { EmbedHandoffService } from './embed-handoff.service';
import { LocalStorageService } from '@shared/utils/local-storage.service';
import {
    EMBED_HANDOFF_MAX_FILE_BYTES,
    EMBED_HANDOFF_QUERY_PARAM,
    EMBED_HANDOFF_STORAGE_PREFIX,
    EMBED_HANDOFF_TTL_MS,
    EMBED_HANDOFF_VERSION,
} from './embed-handoff.types';

class LocalStorageServiceStub {
    store = new Map<string, unknown>();

    async getItemAsync<T>(key: string): Promise<T | null> {
        return (this.store.get(key) as T) ?? null;
    }

    async removeItemAsync(key: string): Promise<void> {
        this.store.delete(key);
    }

    async keysAsync(): Promise<string[]> {
        return Array.from(this.store.keys());
    }
}

describe('EmbedHandoffService', () => {
    let service: EmbedHandoffService;
    let storage: LocalStorageServiceStub;
    let originalHref: string;

    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [
                EmbedHandoffService,
                { provide: LocalStorageService, useClass: LocalStorageServiceStub },
            ],
        });

        service = TestBed.inject(EmbedHandoffService);
        storage = TestBed.inject(LocalStorageService) as unknown as LocalStorageServiceStub;
        originalHref = window.location.href;
    });

    afterEach(() => {
        window.history.replaceState({}, document.title, originalHref);
    });

    function setUrl(query: string): void {
        window.history.replaceState({}, document.title, `${window.location.pathname}${query}`);
    }

    function seedValidHandoff(overrides: Record<string, unknown> = {}, handoffId = 'handoff-test') {
        const createdAt = Date.now();
        const payload = {
            version: EMBED_HANDOFF_VERSION,
            partnerId: 'local-dev',
            handoffId,
            createdAt,
            expiresAt: createdAt + EMBED_HANDOFF_TTL_MS,
            files: [
                {
                    name: 'nodes.csv',
                    kind: 'node',
                    mimeType: 'text/csv',
                    contents: 'id,seq\nA,ACTG\n',
                },
                {
                    name: 'links.csv',
                    kind: 'link',
                    mimeType: 'text/csv',
                    contents: 'source,target,distance\nA,B,1\n',
                },
            ],
            ...overrides,
        };

        storage.store.set(`${EMBED_HANDOFF_STORAGE_PREFIX}${handoffId}`, payload);
        setUrl(`?${EMBED_HANDOFF_QUERY_PARAM}=${handoffId}&skipDemoSession=1`);

        return handoffId;
    }

    function seedRawHandoff(rawPayload: string, handoffId = 'handoff-test') {
        storage.store.set(`${EMBED_HANDOFF_STORAGE_PREFIX}${handoffId}`, rawPayload);
        setUrl(`?${EMBED_HANDOFF_QUERY_PARAM}=${handoffId}&skipDemoSession=1`);
        return handoffId;
    }

    it('returns none when there is no handoff query param', async () => {
        setUrl('');

        const result = await service.consumePendingHandoffFromUrl();

        expect(result).toEqual({ status: 'none' });
    });

    it('consumes a valid handoff and infers import metadata', async () => {
        const handoffId = seedValidHandoff();

        const result = await service.consumePendingHandoffFromUrl();

        expect(result.status).toBe('success');
        if (result.status !== 'success') {
            fail('Expected a successful handoff result.');
            return;
        }

        expect(result.handoffId).toBe(handoffId);
        expect(result.files.length).toBe(2);
        expect(result.files[0].format).toBe('node');
        expect(result.files[0].field1).toBe('id');
        expect(result.files[0].field2).toBe('seq');
        expect(result.files[0].fields).toEqual(['id', 'seq']);
        expect(result.files[1].format).toBe('link');
        expect(result.files[1].field1).toBe('source');
        expect(result.files[1].field2).toBe('target');
        expect(result.files[1].field3).toBe('distance');
        expect(result.handoff.launch).toBeUndefined();
        expect(storage.store.has(`${EMBED_HANDOFF_STORAGE_PREFIX}${handoffId}`)).toBeFalse();
    });

    it('accepts and normalizes curated launch options', async () => {
        seedValidHandoff({
            metadata: {
                datasetName: 'Legacy dataset name',
                sourceApp: 'Spec',
            },
            launch: {
                datasetName: ' Preferred dataset ',
                defaultView: 'Table',
                distanceMetric: 'TN93',
                linkThreshold: '0.02',
                ambiguityStrategy: 'resolve',
                ambiguityThreshold: '0.1',
                globalSettings: {
                    nodeColorBy: 'group',
                    linkColorBy: 'distance',
                    nodeShapeBy: 'seq',
                    nodeColor: '#123456',
                    linkColor: '#654321',
                    nodeShape: 'diamond',
                    selectedColor: '#ff00aa',
                    clusterMinimumSize: '3',
                    backgroundColor: '#abcdef',
                    tn93DistanceDisplayFormat: 'PERCENTAGE',
                },
            },
            files: [
                {
                    name: 'nodes.csv',
                    kind: 'node',
                    mimeType: 'text/csv',
                    contents: 'id,seq,group\nA,ACTG,alpha\n',
                },
                {
                    name: 'links.csv',
                    kind: 'link',
                    mimeType: 'text/csv',
                    contents: 'source,target,distance\nA,B,0.02\n',
                },
            ],
        });

        const result = await service.consumePendingHandoffFromUrl();

        expect(result.status).toBe('success');
        if (result.status !== 'success') {
            fail('Expected a successful handoff result.');
            return;
        }

        expect(result.handoff.launch).toEqual({
            datasetName: 'Preferred dataset',
            defaultView: 'Table',
            distanceMetric: 'tn93',
            linkThreshold: 0.02,
            ambiguityStrategy: 'RESOLVE',
            ambiguityThreshold: 0.1,
            globalSettings: {
                nodeColorBy: 'group',
                linkColorBy: 'distance',
                nodeShapeBy: 'seq',
                nodeColor: '#123456',
                linkColor: '#654321',
                nodeShape: 'diamond',
                selectedColor: '#ff00aa',
                clusterMinimumSize: 3,
                backgroundColor: '#abcdef',
                tn93DistanceDisplayFormat: 'percentage',
            },
        });
        expect(result.handoff.metadata?.datasetName).toBe('Legacy dataset name');
    });

    it('rejects invalid launch option values', async () => {
        seedValidHandoff({
            launch: {
                defaultView: 'Shell',
                distanceMetric: 'p-distance',
                linkThreshold: -1,
                ambiguityStrategy: 'BAD',
                ambiguityThreshold: Number.POSITIVE_INFINITY,
                globalSettings: {
                    backgroundColor: 'red',
                    nodeShape: 'circle',
                    tn93DistanceDisplayFormat: 'percent',
                },
            },
        });

        const result = await service.consumePendingHandoffFromUrl();

        expect(result.status).toBe('error');
        if (result.status !== 'error') {
            fail('Expected an error result.');
            return;
        }

        expect(result.message).toContain('defaultView');
    });

    it('rejects launch field settings that are not present in imported fields', async () => {
        seedValidHandoff({
            launch: {
                globalSettings: {
                    nodeColorBy: 'missing_node_field',
                },
            },
        });

        const result = await service.consumePendingHandoffFromUrl();

        expect(result.status).toBe('error');
        if (result.status !== 'error') {
            fail('Expected an error result.');
            return;
        }

        expect(result.message).toContain('missing_node_field');
    });

    it('rejects forbidden keys in handoff launch options', async () => {
        const createdAt = Date.now();
        seedRawHandoff(`{
            "version": ${EMBED_HANDOFF_VERSION},
            "partnerId": "local-dev",
            "handoffId": "handoff-test",
            "createdAt": ${createdAt},
            "expiresAt": ${createdAt + EMBED_HANDOFF_TTL_MS},
            "launch": {
                "globalSettings": {
                    "__proto__": { "polluted": true }
                }
            },
            "files": [
                {
                    "name": "nodes.csv",
                    "kind": "node",
                    "mimeType": "text/csv",
                    "contents": "id,seq\\nA,ACTG\\n"
                }
            ]
        }`);

        const result = await service.consumePendingHandoffFromUrl();

        expect(result.status).toBe('error');
        if (result.status !== 'error') {
            fail('Expected an error result.');
            return;
        }

        expect(result.message).toContain('Forbidden object key');
    });

    it('consumes a valid handoff from the URL hash', async () => {
        const handoffId = seedValidHandoff({}, 'hash-handoff');
        setUrl(`#${EMBED_HANDOFF_QUERY_PARAM}=${handoffId}`);

        const result = await service.consumePendingHandoffFromUrl();

        expect(result.status).toBe('success');
        if (result.status !== 'success') {
            fail('Expected a successful handoff result.');
            return;
        }

        expect(result.handoffId).toBe(handoffId);
        expect(storage.store.has(`${EMBED_HANDOFF_STORAGE_PREFIX}${handoffId}`)).toBeFalse();
    });

    it('infers node and link kinds when they are omitted', async () => {
        seedValidHandoff({
            files: [
                {
                    name: 'nodes.csv',
                    mimeType: 'text/csv',
                    contents: 'id,seq\nA,ACTG\n',
                },
                {
                    name: 'links.csv',
                    mimeType: 'text/csv',
                    contents: 'source,target,distance\nA,B,1\n',
                },
            ],
        });

        const result = await service.consumePendingHandoffFromUrl();

        expect(result.status).toBe('success');
        if (result.status !== 'success') {
            fail('Expected a successful handoff result.');
            return;
        }

        expect(result.files[0].format).toBe('node');
        expect(result.files[1].format).toBe('link');
    });

    it('treats kind auto as an inference request', async () => {
        seedValidHandoff({
            files: [
                {
                    name: 'distance-matrix.csv',
                    kind: 'auto',
                    mimeType: 'text/csv',
                    contents: ',A,B\nA,0,1\nB,1,0\n',
                },
            ],
        });

        const result = await service.consumePendingHandoffFromUrl();

        expect(result.status).toBe('success');
        if (result.status !== 'success') {
            fail('Expected a successful handoff result.');
            return;
        }

        expect(result.files[0].format).toBe('matrix');
    });

    it('rejects full session payloads', async () => {
        seedValidHandoff({ session: { files: [] } });

        const result = await service.consumePendingHandoffFromUrl();

        expect(result.status).toBe('error');
        if (result.status !== 'error') {
            fail('Expected an error result.');
            return;
        }

        expect(result.message).toContain('Full session imports');
    });

    it('rejects expired handoffs', async () => {
        const createdAt = Date.now() - EMBED_HANDOFF_TTL_MS - 1000;
        seedValidHandoff({
            createdAt,
            expiresAt: createdAt + 1000,
        });

        const result = await service.consumePendingHandoffFromUrl();

        expect(result.status).toBe('error');
        if (result.status !== 'error') {
            fail('Expected an error result.');
            return;
        }

        expect(result.message).toContain('expired');
    });

    it('rejects unsupported file kinds', async () => {
        seedValidHandoff({
            files: [
                {
                    name: 'payload.svg',
                    kind: 'svg',
                    mimeType: 'image/svg+xml',
                    contents: '<svg></svg>',
                },
            ],
        });

        const result = await service.consumePendingHandoffFromUrl();

        expect(result.status).toBe('error');
        if (result.status !== 'error') {
            fail('Expected an error result.');
            return;
        }

        expect(result.message).toContain('unsupported kind');
    });

    it('rejects oversized files', async () => {
        const hugeContents = 'A'.repeat(EMBED_HANDOFF_MAX_FILE_BYTES + 1);
        seedValidHandoff({
            files: [
                {
                    name: 'nodes.csv',
                    kind: 'node',
                    mimeType: 'text/csv',
                    contents: hugeContents,
                },
            ],
        });

        const result = await service.consumePendingHandoffFromUrl();

        expect(result.status).toBe('error');
        if (result.status !== 'error') {
            fail('Expected an error result.');
            return;
        }

        expect(result.message).toContain('file size limit');
    });

    it('clears handoff params from the URL', () => {
        setUrl('?handoff=abc&skipDemoSession=1&url=https://example.com/file.json');

        service.clearHandoffQueryParams();

        const params = new URLSearchParams(window.location.search);
        expect(params.get('handoff')).toBeNull();
        expect(params.get('skipDemoSession')).toBeNull();
        expect(params.get('url')).toBe('https://example.com/file.json');
    });

    it('clears handoff params from the URL hash', () => {
        setUrl('?url=https://example.com/file.json#handoff=abc&skipDemoSession=1&view=table');

        service.clearHandoffQueryParams();

        expect(window.location.search).toBe('?url=https%3A%2F%2Fexample.com%2Ffile.json');
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        expect(hashParams.get('handoff')).toBeNull();
        expect(hashParams.get('skipDemoSession')).toBeNull();
        expect(hashParams.get('view')).toBe('table');
    });

    it('removes expired and malformed handoffs during cleanup', async () => {
        const now = Date.now();
        const validId = 'valid-handoff';
        const expiredId = 'expired-handoff';
        seedValidHandoff({ createdAt: now, expiresAt: now + EMBED_HANDOFF_TTL_MS }, validId);
        storage.store.set(`${EMBED_HANDOFF_STORAGE_PREFIX}${expiredId}`, {
            version: EMBED_HANDOFF_VERSION,
            partnerId: 'local-dev',
            handoffId: expiredId,
            createdAt: now - EMBED_HANDOFF_TTL_MS - 1000,
            expiresAt: now - 1000,
            files: [{ name: 'nodes.csv', kind: 'node', contents: 'id\nA\n' }],
        });
        storage.store.set(`${EMBED_HANDOFF_STORAGE_PREFIX}malformed`, '{bad json');
        storage.store.set('unrelated', '{bad json');

        const result = await service.cleanupExpiredHandoffs(now);

        expect(result).toEqual({ scanned: 3, removed: 2, errors: 0 });
        expect(storage.store.has(`${EMBED_HANDOFF_STORAGE_PREFIX}${validId}`)).toBeTrue();
        expect(storage.store.has(`${EMBED_HANDOFF_STORAGE_PREFIX}${expiredId}`)).toBeFalse();
        expect(storage.store.has(`${EMBED_HANDOFF_STORAGE_PREFIX}malformed`)).toBeFalse();
        expect(storage.store.has('unrelated')).toBeTrue();
    });
});
