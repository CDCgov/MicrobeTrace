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

    function seedValidHandoff(overrides: Record<string, unknown> = {}) {
        const handoffId = 'handoff-test';
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
        expect(result.files[1].format).toBe('link');
        expect(result.files[1].field1).toBe('source');
        expect(result.files[1].field2).toBe('target');
        expect(result.files[1].field3).toBe('distance');
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
});
