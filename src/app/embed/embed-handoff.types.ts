export const EMBED_HANDOFF_VERSION = 1;
export const EMBED_HANDOFF_STORAGE_PREFIX = 'handoff:';
export const EMBED_HANDOFF_QUERY_PARAM = 'handoff';
export const EMBED_HANDOFF_TTL_MS = 15 * 60 * 1000;
export const EMBED_HANDOFF_MAX_FILES = 10;
export const EMBED_HANDOFF_MAX_FILE_BYTES = 20 * 1024 * 1024;
export const EMBED_HANDOFF_MAX_TOTAL_BYTES = 50 * 1024 * 1024;
export const EMBED_HANDOFF_ALLOWED_KINDS = ['node', 'link', 'matrix', 'fasta', 'newick', 'auspice'] as const;
export const EMBED_HANDOFF_ALLOWED_DEFAULT_VIEWS = [
    '2D Network',
    'Epi Curve',
    'Sankey',
    'Table',
    'Crosstab',
    'Map',
    'Bubble',
    'Gantt Chart',
    'Phylogenetic Tree',
    'Alignment View',
    'Heatmap',
    'Waterfall',
] as const;
export const EMBED_HANDOFF_ALLOWED_DISTANCE_METRICS = ['snps', 'tn93'] as const;
export const EMBED_HANDOFF_ALLOWED_AMBIGUITY_STRATEGIES = ['AVERAGE', 'RESOLVE', 'SKIP', 'GAPMM', 'HIVTRACE-G'] as const;
export const EMBED_HANDOFF_ALLOWED_NODE_SHAPES = [
    'ellipse',
    'triangle',
    'rectangle',
    'barrel',
    'rhomboid',
    'diamond',
    'pentagon',
    'hexagon',
    'heptagon',
    'octagon',
    'star',
    'tag',
    'vee',
] as const;
export const EMBED_HANDOFF_ALLOWED_TN93_DISTANCE_DISPLAY_FORMATS = ['decimal', 'percentage'] as const;

export type EmbedFileKind = typeof EMBED_HANDOFF_ALLOWED_KINDS[number];
export type EmbedFileKindInput = EmbedFileKind | 'auto';
export type EmbedLaunchDefaultView = typeof EMBED_HANDOFF_ALLOWED_DEFAULT_VIEWS[number];
export type EmbedLaunchDistanceMetric = typeof EMBED_HANDOFF_ALLOWED_DISTANCE_METRICS[number];
export type EmbedLaunchAmbiguityStrategy = typeof EMBED_HANDOFF_ALLOWED_AMBIGUITY_STRATEGIES[number];
export type EmbedLaunchNodeShape = typeof EMBED_HANDOFF_ALLOWED_NODE_SHAPES[number];
export type EmbedLaunchTN93DistanceDisplayFormat = typeof EMBED_HANDOFF_ALLOWED_TN93_DISTANCE_DISPLAY_FORMATS[number];

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

export interface EmbedContinuousColorStopV1 {
    value: number;
    color: string;
}

export interface EmbedVariableColorScaleV1 {
    mode: 'auto' | 'categorical' | 'continuous';
    domain?: {
        min: number;
        max: number;
    };
    stops?: EmbedContinuousColorStopV1[];
    missingColor?: string;
}

export interface EmbedLaunchGlobalSettingsV1 {
    nodeColorBy?: string;
    linkColorBy?: string;
    nodeColorScale?: EmbedVariableColorScaleV1;
    linkColorScale?: EmbedVariableColorScaleV1;
    nodeShapeBy?: string;
    nodeColor?: string;
    linkColor?: string;
    nodeShape?: EmbedLaunchNodeShape;
    selectedColor?: string;
    clusterMinimumSize?: number;
    backgroundColor?: string;
    tn93DistanceDisplayFormat?: EmbedLaunchTN93DistanceDisplayFormat;
}

export interface EmbedLaunchOptionsV1 {
    datasetName?: string;
    defaultView?: EmbedLaunchDefaultView;
    distanceMetric?: EmbedLaunchDistanceMetric;
    linkThreshold?: number;
    ambiguityStrategy?: EmbedLaunchAmbiguityStrategy;
    ambiguityThreshold?: number;
    globalSettings?: EmbedLaunchGlobalSettingsV1;
}

export interface EmbedPayloadV1 {
    version: number;
    partnerId: string;
    nonce?: string;
    metadata?: EmbedPayloadMetadataV1;
    launch?: EmbedLaunchOptionsV1;
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
    launch?: EmbedLaunchOptionsV1;
    files: EmbedHandoffFileReceiptV1[];
}

export interface ImportedEmbedFile {
    name: string;
    extension: string;
    format: EmbedFileKind;
    type: string;
    contents: string | ArrayBuffer | Record<string, unknown>;
    fields?: string[];
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
