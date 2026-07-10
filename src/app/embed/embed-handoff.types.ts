export const EMBED_HANDOFF_VERSION = 1;
export const EMBED_HANDOFF_STORAGE_PREFIX = 'handoff:';
export const EMBED_HANDOFF_QUERY_PARAM = 'handoff';
export const EMBED_HANDOFF_TTL_MS = 15 * 60 * 1000;
export const EMBED_HANDOFF_MAX_FILES = 10;
export const EMBED_HANDOFF_MAX_FILE_BYTES = 20 * 1024 * 1024;
export const EMBED_HANDOFF_MAX_TOTAL_BYTES = 50 * 1024 * 1024;
export const EMBED_HANDOFF_ALLOWED_KINDS = ['node', 'link', 'matrix', 'fasta', 'newick', 'auspice'] as const;

export type EmbedFileKind = typeof EMBED_HANDOFF_ALLOWED_KINDS[number];
export type EmbedFileKindInput = EmbedFileKind | 'auto';

export interface EmbedFileOptionsV1 {
    extension?: string;
    field1?: string;
    field2?: string;
    field3?: string;
}

export interface EmbedFileV1 {
    name: string;
    kind?: EmbedFileKindInput;
    mimeType?: string;
    contents: string | ArrayBuffer | Record<string, unknown>;
    options?: EmbedFileOptionsV1;
}

export interface EmbedPayloadMetadataV1 {
    datasetName?: string;
    sourceApp?: string;
}

export interface EmbedPayloadV1 {
    version: number;
    partnerId: string;
    nonce?: string;
    metadata?: EmbedPayloadMetadataV1;
    files: EmbedFileV1[];
}

export interface StoredEmbedHandoffV1 extends EmbedPayloadV1 {
    handoffId: string;
    createdAt: number;
    expiresAt: number;
}

export interface EmbedHandoffFileReceiptV1 {
    name: string;
    kind?: EmbedFileKindInput;
    bytes: number;
}

export interface EmbedHandoffReceiptV1 {
    partnerId: string;
    handoffId: string;
    createdAt: number;
    expiresAt: number;
    receiverUrl: string;
    files: EmbedHandoffFileReceiptV1[];
}

export interface ImportedEmbedFile {
    name: string;
    extension: string;
    format: EmbedFileKind;
    type: string;
    contents: string | ArrayBuffer | Record<string, unknown>;
    field1?: string;
    field2?: string;
    field3?: string;
}

export type ConsumeEmbedHandoffResult =
    | {
        status: 'none';
      }
    | {
        status: 'success';
        handoffId: string;
        handoff: StoredEmbedHandoffV1;
        files: ImportedEmbedFile[];
      }
    | {
        status: 'error';
        handoffId: string | null;
        message: string;
      };

export interface CleanupEmbedHandoffResult {
    scanned: number;
    removed: number;
    errors: number;
}
