import { Injectable } from '@angular/core';
import * as Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { LocalStorageService } from '@shared/utils/local-storage.service';
import {
    CleanupEmbedHandoffResult,
    ConsumeEmbedHandoffResult,
    EMBED_HANDOFF_ALLOWED_KINDS,
    EMBED_HANDOFF_MAX_FILE_BYTES,
    EMBED_HANDOFF_MAX_FILES,
    EMBED_HANDOFF_MAX_TOTAL_BYTES,
    EMBED_HANDOFF_QUERY_PARAM,
    EMBED_HANDOFF_STORAGE_PREFIX,
    EMBED_HANDOFF_TTL_MS,
    EMBED_HANDOFF_VERSION,
    EmbedFileKind,
    EmbedFileOptionsV1,
    EmbedFileV1,
    EmbedPayloadMetadataV1,
    ImportedEmbedFile,
    StoredEmbedHandoffV1,
} from './embed-handoff.types';

const FORBIDDEN_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const ALLOWED_KINDS = new Set<string>(EMBED_HANDOFF_ALLOWED_KINDS);
const NODE_FILE_NAME_HINT = /(node|metadata|attribute|sample|case)/i;
const LINK_FILE_NAME_HINT = /(link|edge|network|pair)/i;
const MATRIX_FILE_NAME_HINT = /(matrix|distance|dist)/i;
const FASTA_EXTENSION_PATTERN = /^(?:fa|faa|fasta|fas|fna)$/i;
const NEWICK_EXTENSION_PATTERN = /^(?:nwk|newick|tree|tre)$/i;
const LINK_SOURCE_HEADERS = ['source', 'src', 'from'];
const LINK_TARGET_HEADERS = ['target', 'tgt', 'to'];
const NODE_ID_HEADERS = ['id', 'sampleid', 'sample_id', 'nodeid', 'node_id'];
const NODE_SEQUENCE_HEADERS = ['seq', 'sequence'];

type TabularPreview = {
    headers: string[];
    rows: Record<string, unknown>[];
};

@Injectable({
    providedIn: 'root',
})
export class EmbedHandoffService {

    constructor(private localStorageService: LocalStorageService) { }

    hasPendingHandoffInUrl(): boolean {
        return !!this.getPendingHandoffIdFromUrl();
    }

    getPendingHandoffIdFromUrl(): string | null {
        const queryParams = new URLSearchParams(window.location.search);
        const queryHandoffId = queryParams.get(EMBED_HANDOFF_QUERY_PARAM);

        if (queryHandoffId) {
            return queryHandoffId;
        }

        return this.getHandoffIdFromHash(window.location.hash);
    }

    clearHandoffQueryParams(): void {
        const url = new URL(window.location.href);
        url.searchParams.delete(EMBED_HANDOFF_QUERY_PARAM);
        url.searchParams.delete('skipDemoSession');
        const normalizedSearch = url.searchParams.toString();
        const normalizedHash = this.removeHandoffParamsFromHash(url.hash);
        const nextUrl = `${url.pathname}${normalizedSearch ? `?${normalizedSearch}` : ''}${normalizedHash}`;
        window.history.replaceState({}, document.title, nextUrl);
    }

    async cleanupExpiredHandoffs(now = Date.now()): Promise<CleanupEmbedHandoffResult> {
        const result: CleanupEmbedHandoffResult = { scanned: 0, removed: 0, errors: 0 };
        const keys = await this.localStorageService.keysAsync();
        const handoffKeys = keys.filter(key => key.startsWith(EMBED_HANDOFF_STORAGE_PREFIX));

        for (const key of handoffKeys) {
            result.scanned += 1;

            try {
                const stored = await this.localStorageService.getItemAsync<StoredEmbedHandoffV1 | string>(key);

                if (this.shouldRemoveStoredHandoff(stored, now)) {
                    await this.localStorageService.removeItemAsync(key);
                    result.removed += 1;
                }
            } catch {
                result.errors += 1;

                try {
                    await this.localStorageService.removeItemAsync(key);
                    result.removed += 1;
                } catch {
                    result.errors += 1;
                }
            }
        }

        return result;
    }

    async consumePendingHandoffFromUrl(): Promise<ConsumeEmbedHandoffResult> {
        const handoffId = this.getPendingHandoffIdFromUrl();

        if (!handoffId) {
            return { status: 'none' };
        }

        const storageKey = this.buildStorageKey(handoffId);

        try {
            const stored = await this.localStorageService.getItemAsync<StoredEmbedHandoffV1 | string>(storageKey);

            if (!stored) {
                throw new Error('The requested partner handoff was not found or has already been consumed.');
            }

            const handoff = this.validateStoredHandoff(stored, handoffId);
            const files = await this.normalizeImportedFiles(handoff.files);

            await this.localStorageService.removeItemAsync(storageKey);

            return {
                status: 'success',
                handoffId,
                handoff,
                files,
            };
        } catch (error) {
            await this.localStorageService.removeItemAsync(storageKey);

            return {
                status: 'error',
                handoffId,
                message: error instanceof Error ? error.message : 'Unable to load the partner handoff payload.',
            };
        }
    }

    private buildStorageKey(handoffId: string): string {
        return `${EMBED_HANDOFF_STORAGE_PREFIX}${handoffId}`;
    }

    private getHandoffIdFromHash(hash: string): string | null {
        const normalizedHash = hash.replace(/^#/, '');

        if (!normalizedHash) {
            return null;
        }

        const paramText = normalizedHash.includes('?')
            ? normalizedHash.slice(normalizedHash.indexOf('?') + 1)
            : normalizedHash;
        const hashParams = new URLSearchParams(paramText.replace(/^\?/, ''));

        return hashParams.get(EMBED_HANDOFF_QUERY_PARAM);
    }

    private removeHandoffParamsFromHash(hash: string): string {
        const normalizedHash = hash.replace(/^#/, '');

        if (!normalizedHash) {
            return '';
        }

        const routeIndex = normalizedHash.indexOf('?');
        const routePrefix = routeIndex >= 0 ? normalizedHash.slice(0, routeIndex) : '';
        const paramText = routeIndex >= 0 ? normalizedHash.slice(routeIndex + 1) : normalizedHash;
        const hashParams = new URLSearchParams(paramText.replace(/^\?/, ''));

        if (!hashParams.has(EMBED_HANDOFF_QUERY_PARAM) && !hashParams.has('skipDemoSession')) {
            return hash;
        }

        hashParams.delete(EMBED_HANDOFF_QUERY_PARAM);
        hashParams.delete('skipDemoSession');

        const nextParams = hashParams.toString();

        if (routePrefix) {
            return nextParams ? `#${routePrefix}?${nextParams}` : `#${routePrefix}`;
        }

        return nextParams ? `#${nextParams}` : '';
    }

    private shouldRemoveStoredHandoff(stored: StoredEmbedHandoffV1 | string | null, now: number): boolean {
        if (!stored) {
            return true;
        }

        try {
            const parsed = typeof stored === 'string' ? JSON.parse(stored) : stored;
            const sanitized = this.sanitizeObject(parsed, 'handoff');

            if (!this.isPlainObject(sanitized)) {
                return true;
            }

            const version = Number(sanitized.version);
            const createdAt = Number(sanitized.createdAt);
            const expiresAt = Number(sanitized.expiresAt);

            if (version !== EMBED_HANDOFF_VERSION) {
                return true;
            }

            if (!Number.isFinite(createdAt) || !Number.isFinite(expiresAt)) {
                return true;
            }

            if (expiresAt < now) {
                return true;
            }

            if (expiresAt - createdAt > EMBED_HANDOFF_TTL_MS) {
                return true;
            }

            return !Array.isArray(sanitized.files) || sanitized.files.length === 0;
        } catch {
            return true;
        }
    }

    private validateStoredHandoff(stored: StoredEmbedHandoffV1 | string, handoffId: string): StoredEmbedHandoffV1 {
        const parsed = typeof stored === 'string' ? JSON.parse(stored) : stored;
        const sanitized = this.sanitizeObject(parsed, 'handoff');

        if (!this.isPlainObject(sanitized)) {
            throw new Error('The partner handoff payload is malformed.');
        }

        if ('session' in sanitized || 'tabs' in sanitized) {
            throw new Error('Full session imports are not allowed in the partner handoff flow.');
        }

        const version = Number(sanitized.version);
        const partnerId = this.requireString(sanitized.partnerId, 'partnerId');
        const createdAt = Number(sanitized.createdAt);
        const expiresAt = Number(sanitized.expiresAt);
        const files = sanitized.files;

        if (version !== EMBED_HANDOFF_VERSION) {
            throw new Error(`Unsupported partner handoff version: ${version}.`);
        }

        if (!Number.isFinite(createdAt) || !Number.isFinite(expiresAt)) {
            throw new Error('The partner handoff is missing timestamps.');
        }

        if (expiresAt < Date.now()) {
            throw new Error('The partner handoff expired before it could be loaded.');
        }

        if (expiresAt - createdAt > EMBED_HANDOFF_TTL_MS) {
            throw new Error('The partner handoff exceeds the allowed lifetime.');
        }

        if (!Array.isArray(files) || files.length === 0) {
            throw new Error('The partner handoff did not include any files.');
        }

        if (files.length > EMBED_HANDOFF_MAX_FILES) {
            throw new Error(`The partner handoff exceeds the ${EMBED_HANDOFF_MAX_FILES} file limit.`);
        }

        return {
            version,
            partnerId,
            handoffId,
            createdAt,
            expiresAt,
            nonce: typeof sanitized.nonce === 'string' ? sanitized.nonce : undefined,
            metadata: this.normalizeMetadata(sanitized.metadata),
            files: files as EmbedFileV1[],
        };
    }

    private normalizeMetadata(metadata: unknown): EmbedPayloadMetadataV1 | undefined {
        if (!metadata || !this.isPlainObject(metadata)) {
            return undefined;
        }

        const normalized: EmbedPayloadMetadataV1 = {};

        if (typeof metadata.datasetName === 'string' && metadata.datasetName.trim()) {
            normalized.datasetName = metadata.datasetName.trim();
        }

        if (typeof metadata.sourceApp === 'string' && metadata.sourceApp.trim()) {
            normalized.sourceApp = metadata.sourceApp.trim();
        }

        return Object.keys(normalized).length ? normalized : undefined;
    }

    private async normalizeImportedFiles(files: EmbedFileV1[]): Promise<ImportedEmbedFile[]> {
        const normalizedFiles = await Promise.all(files.map((file, index) => this.normalizeImportedFile(file, index)));
        const totalSize = normalizedFiles.reduce((sum, file) => sum + this.measureBytes(file.contents), 0);

        if (totalSize > EMBED_HANDOFF_MAX_TOTAL_BYTES) {
            throw new Error(`The partner handoff exceeds the ${this.formatBytes(EMBED_HANDOFF_MAX_TOTAL_BYTES)} total payload limit.`);
        }

        return normalizedFiles;
    }

    private async normalizeImportedFile(file: unknown, index: number): Promise<ImportedEmbedFile> {
        const sanitized = this.sanitizeObject(file, `files[${index}]`);

        if (!this.isPlainObject(sanitized)) {
            throw new Error(`File ${index + 1} is malformed.`);
        }

        const extension = this.determineExtension(sanitized);
        const kind = await this.inferKind(sanitized, extension, index);
        const contents = this.normalizeContents(kind, extension, sanitized.contents);
        const bytes = this.measureBytes(contents);

        if (bytes > EMBED_HANDOFF_MAX_FILE_BYTES) {
            throw new Error(`File ${index + 1} exceeds the ${this.formatBytes(EMBED_HANDOFF_MAX_FILE_BYTES)} file size limit.`);
        }

        const fieldMapping = await this.inferFieldMapping(kind, extension, contents, sanitized.options as EmbedFileOptionsV1 | undefined);

        return {
            name: this.normalizeFileName(this.requireString(sanitized.name, `files[${index}].name`), kind, extension),
            extension,
            format: kind,
            type: this.determineMimeType(kind, extension, sanitized.mimeType),
            contents,
            ...fieldMapping,
        };
    }

    private determineExtension(file: Record<string, unknown>): string {
        const options = this.isPlainObject(file.options) ? file.options as EmbedFileOptionsV1 : undefined;
        const explicitExtension = typeof options?.extension === 'string' ? this.normalizeExtension(options.extension) : '';

        if (explicitExtension) {
            return explicitExtension;
        }

        const fileName = typeof file.name === 'string' ? file.name.trim() : '';
        const fromName = fileName.includes('.') ? this.normalizeExtension(fileName.split('.').pop() ?? '') : '';

        if (fromName) {
            return fromName;
        }

        if (typeof file.mimeType === 'string') {
            const mimeType = file.mimeType.toLowerCase();
            if (mimeType.includes('sheet') || mimeType.includes('excel')) {
                return 'xlsx';
            }
            if (mimeType.includes('json')) {
                return 'json';
            }
        }

        if (file.contents instanceof ArrayBuffer) {
            return 'xlsx';
        }

        if (typeof file.contents === 'string') {
            const trimmed = file.contents.trim();

            if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                return 'json';
            }

            if (trimmed.startsWith('>')) {
                return 'fasta';
            }

            if (this.looksLikeNewickText(trimmed)) {
                return 'nwk';
            }
        }

        return 'csv';
    }

    private normalizeExtension(extension: string): string {
        return extension.replace(/^\.+/, '').trim().toLowerCase();
    }

    private normalizeFileName(name: string, kind: EmbedFileKind, extension: string): string {
        const trimmed = name.trim() || `${kind}.${extension}`;
        const withoutControls = trimmed.replace(/[\u0000-\u001f\u007f]/g, '');
        const safeBase = withoutControls.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();
        const fallback = `${kind}.${extension}`;
        const normalized = safeBase || fallback;
        const hasExtension = normalized.toLowerCase().endsWith(`.${extension}`);

        return hasExtension ? normalized : `${normalized}.${extension}`;
    }

    private determineMimeType(kind: EmbedFileKind, extension: string, mimeType: unknown): string {
        if (typeof mimeType === 'string' && mimeType.trim()) {
            return mimeType.trim();
        }

        if (extension === 'json') {
            return 'application/json';
        }

        if (extension === 'xlsx') {
            return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        }

        if (extension === 'xls') {
            return 'application/vnd.ms-excel';
        }

        switch (kind) {
            case 'fasta':
                return 'text/x-fasta';
            case 'newick':
                return 'text/plain';
            default:
                return 'text/csv';
        }
    }

    private normalizeContents(kind: EmbedFileKind, extension: string, contents: unknown): string | ArrayBuffer | Record<string, unknown> {
        if (kind === 'auspice') {
            const parsed = typeof contents === 'string' ? JSON.parse(contents) : contents;
            const sanitized = this.sanitizeObject(parsed, 'auspice');

            if (!this.isPlainObject(sanitized) || !sanitized.meta || !sanitized.tree) {
                throw new Error('Auspice payloads must include both "meta" and "tree".');
            }

            return sanitized;
        }

        if (contents instanceof ArrayBuffer) {
            if (!this.isExcelExtension(extension)) {
                throw new Error(`Binary contents are only allowed for Excel-backed imports, not ".${extension}" files.`);
            }

            return contents;
        }

        if (typeof contents !== 'string') {
            throw new Error('Only text, Excel binaries, and Auspice objects are allowed in the partner handoff flow.');
        }

        const trimmed = contents.trim();

        if (!trimmed) {
            throw new Error('Partner handoff files may not be empty.');
        }

        if (this.containsBlockedMarkup(trimmed)) {
            throw new Error('HTML, SVG, and script-like payloads are not allowed in the partner handoff flow.');
        }

        return contents;
    }

    private async inferFieldMapping(
        kind: EmbedFileKind,
        extension: string,
        contents: string | ArrayBuffer | Record<string, unknown>,
        options?: EmbedFileOptionsV1
    ): Promise<Partial<ImportedEmbedFile>> {
        if (kind !== 'node' && kind !== 'link') {
            return {};
        }

        const headers = await this.extractHeaders(contents, extension);
        const field1 = this.resolveFieldSelection(headers, options?.field1, this.defaultFieldSelection(kind, headers, 0));
        const field2 = this.resolveFieldSelection(headers, options?.field2, this.defaultFieldSelection(kind, headers, 1));
        const field3 = kind === 'node'
            ? undefined
            : this.resolveFieldSelection(headers, options?.field3, this.defaultFieldSelection(kind, headers, 2));

        return {
            field1,
            field2,
            field3,
        };
    }

    private async extractHeaders(contents: string | ArrayBuffer | Record<string, unknown>, extension: string): Promise<string[]> {
        if (contents instanceof ArrayBuffer) {
            if (!this.isExcelExtension(extension)) {
                throw new Error(`Unable to infer headers from binary ".${extension}" contents.`);
            }

            const workbook = XLSX.read(contents, { type: 'array' });
            const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });

            if (!rows.length) {
                throw new Error('The imported spreadsheet did not contain any rows.');
            }

            return Object.keys(rows[0]).map(header => header.trim()).filter(Boolean);
        }

        if (typeof contents !== 'string') {
            throw new Error('Only string-backed node and link files can be inspected for headers.');
        }

        if (extension === 'json') {
            const parsed = JSON.parse(contents);
            const rows = Array.isArray(parsed) ? parsed : [parsed];

            if (!rows.length || !this.isPlainObject(rows[0])) {
                throw new Error('JSON-backed node and link handoffs must contain at least one object row.');
            }

            return Object.keys(rows[0]).map(header => header.trim()).filter(Boolean);
        }

        const parsed = Papa.parse<Record<string, unknown>>(contents, {
            header: true,
            preview: 1,
            skipEmptyLines: true,
        });

        const headers = (parsed.meta.fields || []).map(header => (header || '').trim()).filter(Boolean);

        if (!headers.length) {
            throw new Error('CSV-backed node and link handoffs must contain a header row.');
        }

        return headers;
    }

    private resolveFieldSelection(headers: string[], explicit: string | undefined, fallback: string): string {
        const requested = explicit?.trim();

        if (requested) {
            if (requested === 'None') {
                return requested;
            }

            if (!headers.includes(requested)) {
                throw new Error(`Requested field "${requested}" was not present in the imported dataset.`);
            }

            return requested;
        }

        return fallback;
    }

    private async inferKind(file: Record<string, unknown>, extension: string, index: number): Promise<EmbedFileKind> {
        const explicitKind = typeof file.kind === 'string' ? file.kind.trim().toLowerCase() : '';

        if (explicitKind && explicitKind !== 'auto') {
            return this.requireAllowedKind(explicitKind, index);
        }

        const inferredKind = await this.detectKind(file, extension);

        if (!inferredKind) {
            throw new Error(`File ${index + 1} did not declare a kind and MicrobeTrace could not infer one.`);
        }

        return inferredKind;
    }

    private async detectKind(file: Record<string, unknown>, extension: string): Promise<EmbedFileKind | null> {
        const name = typeof file.name === 'string' ? file.name.trim() : '';
        const contents = file.contents;

        if (this.looksLikeAuspicePayload(contents)) {
            return 'auspice';
        }

        if (FASTA_EXTENSION_PATTERN.test(extension) || this.looksLikeFastaText(contents) || /fasta/i.test(name)) {
            return 'fasta';
        }

        if (NEWICK_EXTENSION_PATTERN.test(extension) || this.looksLikeNewickText(contents) || /newick|phylo|tree/i.test(name)) {
            return 'newick';
        }

        const preview = await this.inspectTabularFile(contents, extension);

        if (!preview) {
            return null;
        }

        if (this.looksLikeMatrix(preview, name)) {
            return 'matrix';
        }

        if (this.looksLikeLink(preview.headers, name)) {
            return 'link';
        }

        if (this.looksLikeNode(preview.headers, name)) {
            return 'node';
        }

        return 'node';
    }

    private defaultFieldSelection(kind: EmbedFileKind, headers: string[], index: number): string {
        const first = headers[0] || 'None';
        const second = headers[1] || 'None';

        if (kind === 'node') {
            if (index === 0) {
                return this.firstHeaderMatch(headers, ['ID', 'Id', 'id']) || first;
            }

            if (index === 1) {
                return this.firstHeaderMatch(headers, ['SEQUENCE', 'SEQ', 'Sequence', 'sequence', 'seq']) || 'None';
            }

            return 'None';
        }

        if (index === 0) {
            return this.firstHeaderMatch(headers, ['SOURCE', 'Source', 'source']) || first;
        }

        if (index === 1) {
            return this.firstHeaderMatch(headers, ['TARGET', 'Target', 'target']) || second;
        }

        return this.firstHeaderMatch(headers, ['length', 'Length', 'distance', 'Distance', 'snps', 'SNPs', 'tn93', 'TN93']) || 'None';
    }

    private firstHeaderMatch(headers: string[], preferred: string[]): string | undefined {
        return preferred.find(header => headers.includes(header));
    }

    private measureBytes(contents: string | ArrayBuffer | Record<string, unknown>): number {
        if (contents instanceof ArrayBuffer) {
            return contents.byteLength;
        }

        const encoder = new TextEncoder();
        return encoder.encode(typeof contents === 'string' ? contents : JSON.stringify(contents)).length;
    }

    private formatBytes(bytes: number): string {
        return `${Math.round(bytes / (1024 * 1024))} MB`;
    }

    private containsBlockedMarkup(contents: string): boolean {
        return /^\s*<(?:!doctype|html|svg|script|body|iframe)/i.test(contents);
    }

    private isExcelExtension(extension: string): boolean {
        return extension === 'xlsx' || extension === 'xls';
    }

    private looksLikeAuspicePayload(contents: unknown): boolean {
        if (this.isPlainObject(contents)) {
            return !!contents.meta && !!contents.tree;
        }

        if (typeof contents !== 'string') {
            return false;
        }

        const trimmed = contents.trim();

        if (!trimmed.startsWith('{')) {
            return false;
        }

        try {
            const parsed = JSON.parse(trimmed);
            return this.isPlainObject(parsed) && !!parsed.meta && !!parsed.tree;
        } catch {
            return false;
        }
    }

    private looksLikeFastaText(contents: unknown): boolean {
        return typeof contents === 'string' && contents.trim().startsWith('>');
    }

    private looksLikeNewickText(contents: unknown): boolean {
        if (typeof contents !== 'string') {
            return false;
        }

        const trimmed = contents.trim();
        return trimmed.startsWith('(') && trimmed.endsWith(';');
    }

    private async inspectTabularFile(contents: unknown, extension: string): Promise<TabularPreview | null> {
        if (contents instanceof ArrayBuffer) {
            if (!this.isExcelExtension(extension)) {
                return null;
            }

            const workbook = XLSX.read(contents, { type: 'array' });
            const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });

            if (!rows.length) {
                return null;
            }

            return {
                headers: Object.keys(rows[0]).map(header => header.trim()),
                rows: rows.slice(0, 5),
            };
        }

        if (typeof contents !== 'string') {
            return null;
        }

        if (extension === 'json') {
            const parsed = JSON.parse(contents);
            const rows = Array.isArray(parsed) ? parsed : [parsed];

            if (!rows.length || !this.isPlainObject(rows[0])) {
                return null;
            }

            return {
                headers: Object.keys(rows[0]).map(header => header.trim()),
                rows: rows.slice(0, 5) as Record<string, unknown>[],
            };
        }

        const parsed = Papa.parse<Record<string, unknown>>(contents, {
            header: true,
            preview: 5,
            skipEmptyLines: true,
        });

        if (!(parsed.meta.fields || []).length) {
            return null;
        }

        return {
            headers: (parsed.meta.fields || []).map(header => (header || '').trim()),
            rows: parsed.data.slice(0, 5),
        };
    }

    private looksLikeMatrix(preview: TabularPreview, fileName: string): boolean {
        const headers = preview.headers.map(header => header.trim());
        const matrixHeaders = headers.slice(1).filter(Boolean);

        if (matrixHeaders.length < 2 || preview.rows.length < 2) {
            return false;
        }

        const firstHeader = headers[0];
        const rowLabels = preview.rows
            .map(row => String(row[firstHeader] ?? row[''] ?? '').trim())
            .filter(Boolean);
        const matchingRowLabels = rowLabels.filter(label => matrixHeaders.includes(label)).length;
        let numericCells = 0;
        let inspectedCells = 0;

        preview.rows.forEach(row => {
            matrixHeaders.slice(0, 3).forEach(header => {
                const value = row[header];
                const text = value === null || value === undefined ? '' : String(value).trim();

                if (!text) {
                    return;
                }

                inspectedCells += 1;
                if (!Number.isNaN(Number(text))) {
                    numericCells += 1;
                }
            });
        });

        if (matchingRowLabels >= Math.min(preview.rows.length, 2) && numericCells > 0 && numericCells === inspectedCells) {
            return true;
        }

        return MATRIX_FILE_NAME_HINT.test(fileName) && numericCells > 0 && numericCells === inspectedCells;
    }

    private looksLikeLink(headers: string[], fileName: string): boolean {
        const normalizedHeaders = headers.map(header => header.trim().toLowerCase()).filter(Boolean);
        const hasSource = LINK_SOURCE_HEADERS.some(header => normalizedHeaders.includes(header));
        const hasTarget = LINK_TARGET_HEADERS.some(header => normalizedHeaders.includes(header));

        if (hasSource && hasTarget) {
            return true;
        }

        return LINK_FILE_NAME_HINT.test(fileName) && normalizedHeaders.length >= 2;
    }

    private looksLikeNode(headers: string[], fileName: string): boolean {
        const normalizedHeaders = headers.map(header => header.trim().toLowerCase()).filter(Boolean);

        if (NODE_FILE_NAME_HINT.test(fileName)) {
            return true;
        }

        if (NODE_ID_HEADERS.some(header => normalizedHeaders.includes(header))) {
            return true;
        }

        if (NODE_SEQUENCE_HEADERS.some(header => normalizedHeaders.includes(header))) {
            return true;
        }

        return normalizedHeaders.length > 0;
    }

    private requireAllowedKind(kind: unknown, index: number): EmbedFileKind {
        if (typeof kind !== 'string' || !ALLOWED_KINDS.has(kind)) {
            throw new Error(`File ${index + 1} used an unsupported kind.`);
        }

        return kind as EmbedFileKind;
    }

    private requireString(value: unknown, fieldName: string): string {
        if (typeof value !== 'string' || !value.trim()) {
            throw new Error(`Missing required string field "${fieldName}".`);
        }

        return value.trim();
    }

    private sanitizeObject(value: unknown, path: string): any {
        if (value === null || value === undefined) {
            return value;
        }

        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            return value;
        }

        if (value instanceof ArrayBuffer) {
            return value;
        }

        if (Array.isArray(value)) {
            return value.map((item, index) => this.sanitizeObject(item, `${path}[${index}]`));
        }

        if (!this.isPlainObject(value)) {
            throw new Error(`Unsupported object type encountered at "${path}".`);
        }

        const output: Record<string, unknown> = {};
        Object.entries(value).forEach(([key, nestedValue]) => {
            if (!FORBIDDEN_OBJECT_KEYS.has(key)) {
                output[key] = this.sanitizeObject(nestedValue, `${path}.${key}`);
            }
        });
        return output;
    }

    private isPlainObject(value: unknown): value is Record<string, unknown> {
        if (!value || typeof value !== 'object' || Array.isArray(value) || value instanceof ArrayBuffer) {
            return false;
        }

        const prototype = Object.getPrototypeOf(value);
        return prototype === Object.prototype || prototype === null;
    }
}
