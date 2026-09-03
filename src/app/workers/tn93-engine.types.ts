import type { PackedTn93Sequences } from './tn93-worker-payload';

export type Tn93AmbiguityStrategy =
  | 'AVERAGE'
  | 'RESOLVE'
  | 'SKIP'
  | 'GAPMM'
  | 'HIVTRACE-G';

export type Tn93MatchMode = Exclude<Tn93AmbiguityStrategy, 'HIVTRACE-G'>;

export type Tn93DistancePhase =
  | 'planning'
  | 'foreground'
  | 'provisional'
  | 'background'
  | 'promoting'
  | 'complete'
  | 'cancelled'
  | 'error';

export type Tn93DistanceBatchStage =
  | 'foreground'
  | 'promoting'
  | 'background';

export type Tn93AdaptiveFallbackReason =
  | 'below-minimum-pair-count'
  | 'candidate-ratio-too-high'
  | 'invalid-threshold'
  | 'no-valid-consensus-sequences';

export interface Tn93PlanTimings {
  ambiguityMs: number;
  consensusMs: number;
  radialDistanceMs: number;
  sortAndWindowMs: number;
  totalPlanningMs: number;
}

export interface Tn93ComputeTimings {
  foregroundMs: number;
  backgroundMs: number;
  promotionMs: number;
  totalWorkerMs: number;
  batches: number;
  payloadBytes: number;
  longTasks: number;
}

export interface Tn93DistanceStatus {
  phase: Tn93DistancePhase;
  runId: number;
  loadGeneration: number;
  inputSignature: string;
  threshold: number;
  computedPairs: number;
  candidatePairs: number;
  totalPairs: number;
  provisional: boolean;
  fallbackReason?: Tn93AdaptiveFallbackReason;
  error?: string;
}

export type Tn93NetworkRevisionReason =
  | 'foreground'
  | 'threshold-promotion'
  | 'complete'
  | 'cancelled'
  | 'error';

export interface Tn93NetworkDataRevision {
  revision: number;
  reason: Tn93NetworkRevisionReason;
  runId: number | null;
  loadGeneration: number | null;
  inputSignature: string | null;
  recordedAt: number;
}

export interface Tn93DistanceBatch {
  batchId: number;
  stage: Tn93DistanceBatchStage;
  sources: Uint32Array;
  targets: Uint32Array;
  distances: Float32Array;
}

export interface Tn93DistanceCompletionResult {
  runId: number;
  loadGeneration: number;
  inputSignature: string;
  computedPairs: number;
  totalPairs: number;
  correctedBelowThresholdLinks: number;
  timings: Tn93ComputeTimings;
}

export interface ExhaustiveFallbackResult {
  computedPairs: number;
  totalPairs: number;
  initialLinkCount?: number;
  timings?: Partial<Tn93ComputeTimings>;
  fallbackReason?: string;
}

/**
 * Main-thread result returned after the initial TN93 stage has been merged.
 * Background work is deliberately caller-started so the first view can render
 * before the worker begins the complement.
 */
export interface SequenceLinkComputationResult {
  runId: number;
  loadGeneration: number;
  inputSignature: string;
  initialComputedPairs: number;
  initialLinkCount?: number;
  candidatePairs: number;
  deferredPairs: number;
  totalPairs: number;
  provisional: boolean;
  fallbackReason?: Tn93AdaptiveFallbackReason;
  timings: Tn93PlanTimings;
  startBackground: () => void;
  backgroundCompletion: Promise<Tn93DistanceCompletionResult>;
}

interface Tn93WorkerRequestContext {
  runId: number;
  loadGeneration: number;
  inputSignature: string;
}

export interface Tn93InitRequest extends Tn93WorkerRequestContext {
  type: 'INIT';
  sequences: PackedTn93Sequences;
  strategy: Tn93AmbiguityStrategy;
  ambiguityThreshold: number;
  threshold: number;
  batchSize?: number;
  chunkSize?: number;
  maxInFlightBatches?: number;
  minimumProgressivePairCount?: number;
  maximumCandidateRatio?: number;
}

export interface Tn93StartBackgroundRequest extends Tn93WorkerRequestContext {
  type: 'START_BACKGROUND';
}

export interface Tn93PrioritizeThresholdRequest extends Tn93WorkerRequestContext {
  type: 'PRIORITIZE_THRESHOLD';
  requestId: number;
  threshold: number;
}

export interface Tn93BatchAckRequest extends Tn93WorkerRequestContext {
  type: 'ACK';
  batchId: number;
}

export interface Tn93CancelRequest extends Tn93WorkerRequestContext {
  type: 'CANCEL';
  reason?: string;
}

export type Tn93WorkerRequest =
  | Tn93InitRequest
  | Tn93StartBackgroundRequest
  | Tn93PrioritizeThresholdRequest
  | Tn93BatchAckRequest
  | Tn93CancelRequest;

interface Tn93WorkerResponseContext {
  runId: number;
  loadGeneration: number;
  inputSignature: string;
}

export interface Tn93PlanReadyResponse extends Tn93WorkerResponseContext {
  type: 'PLAN_READY';
  threshold: number;
  totalPairs: number;
  candidatePairs: number;
  foregroundPairs: number;
  deferredPairs: number;
  candidateRatio: number;
  provisional: boolean;
  fallbackReason?: Tn93AdaptiveFallbackReason;
  timings: Tn93PlanTimings;
}

export interface Tn93DistanceProgressResponse extends Tn93WorkerResponseContext {
  type: 'PROGRESS';
  phase: Exclude<Tn93DistancePhase, 'complete' | 'cancelled' | 'error'>;
  threshold: number;
  computedPairs: number;
  candidatePairs: number;
  totalPairs: number;
  percent: number;
  provisional: boolean;
}

export interface Tn93DistanceBatchResponse
  extends Tn93WorkerResponseContext, Tn93DistanceBatch {
  type: 'DISTANCE_BATCH';
  totalComputed: number;
  payloadBytes: number;
}

export interface Tn93InitialDoneResponse extends Tn93WorkerResponseContext {
  type: 'INITIAL_DONE';
  threshold: number;
  initialComputedPairs: number;
  candidatePairs: number;
  deferredPairs: number;
  totalPairs: number;
  provisional: boolean;
  fallbackReason?: Tn93AdaptiveFallbackReason;
  timings: Tn93PlanTimings;
  computeTimings: Tn93ComputeTimings;
}

export interface Tn93PromotionDoneResponse extends Tn93WorkerResponseContext {
  type: 'PROMOTION_DONE';
  requestId: number;
  threshold: number;
  promotedPairs: number;
  computedPairs: number;
  candidatePairs: number;
  totalPairs: number;
}

export interface Tn93CompleteResponse extends Tn93WorkerResponseContext {
  type: 'COMPLETE';
  threshold: number;
  computedPairs: number;
  totalPairs: number;
  correctedBelowThresholdLinks: number;
  timings: Tn93ComputeTimings;
}

export interface Tn93CancelledResponse extends Tn93WorkerResponseContext {
  type: 'CANCELLED';
  computedPairs: number;
  totalPairs: number;
  reason?: string;
}

export interface Tn93ErrorResponse extends Tn93WorkerResponseContext {
  type: 'ERROR';
  message: string;
  beforeInitial: boolean;
}

export type Tn93WorkerResponse =
  | Tn93PlanReadyResponse
  | Tn93DistanceProgressResponse
  | Tn93DistanceBatchResponse
  | Tn93InitialDoneResponse
  | Tn93PromotionDoneResponse
  | Tn93CompleteResponse
  | Tn93CancelledResponse
  | Tn93ErrorResponse;
