/// <reference lib="webworker" />

import {
  createTn93CandidatePlan,
  createTn93PairBitset,
  enumerateTn93CandidatePairIndices,
  hasTn93Pair,
  markTn93Pair,
  tn93PairCount,
  tn93PairCoordinates,
} from './tn93-candidate-planner';
import { tn93DistanceForStrategy } from './tn93-distance';
import type {
  Tn93CompleteResponse,
  Tn93ComputeTimings,
  Tn93DistanceBatchStage,
  Tn93DistanceProgressResponse,
  Tn93InitRequest,
  Tn93PrioritizeThresholdRequest,
  Tn93WorkerRequest,
  Tn93WorkerResponse,
} from './tn93-engine.types';
import {
  unpackTn93Sequences,
  type UnpackedTn93Sequence,
} from './tn93-worker-payload';

const DEFAULT_BATCH_SIZE = 4096;
const DEFAULT_CHUNK_SIZE = 2048;
const DEFAULT_MAX_IN_FLIGHT_BATCHES = 2;
const LONG_TASK_THRESHOLD_MS = 50;
const PROGRESS_INTERVAL_MS = 100;

interface PriorityRequest {
  requestId: number;
  threshold: number;
}

interface Tn93WorkerState {
  request: Tn93InitRequest;
  sequences: UnpackedTn93Sequence[];
  plan: ReturnType<typeof createTn93CandidatePlan>;
  computed: Uint8Array;
  computedPairs: number;
  candidatePairs: number;
  candidateThreshold: number;
  initialThreshold: number;
  batchSize: number;
  chunkSize: number;
  maxInFlightBatches: number;
  nextBatchId: number;
  outstandingBatches: Set<number>;
  capacityWaiters: Array<() => void>;
  pendingPriorities: PriorityRequest[];
  backgroundCursor: number;
  backgroundStarted: boolean;
  backgroundRunning: boolean;
  initialDone: boolean;
  completeSent: boolean;
  cancelled: boolean;
  cancelResponseSent: boolean;
  cancelReason?: string;
  correctedBelowThresholdLinks: number;
  timings: Tn93ComputeTimings;
  startedAt: number;
  lastProgressAt: number;
}

let currentState: Tn93WorkerState | null = null;

function now(): number {
  return typeof performance !== 'undefined' && performance.now
    ? performance.now()
    : Date.now();
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed)
    ? Math.max(minimum, Math.min(maximum, parsed))
    : fallback;
}

function responseContext(state: Tn93WorkerState) {
  return {
    runId: state.request.runId,
    loadGeneration: state.request.loadGeneration,
    inputSignature: state.request.inputSignature,
  };
}

function respond(message: Tn93WorkerResponse): void {
  postMessage(message);
}

function isCurrentContext(
  request: Pick<
    Tn93WorkerRequest,
    'runId' | 'loadGeneration' | 'inputSignature'
  >,
  state: Tn93WorkerState | null = currentState,
): state is Tn93WorkerState {
  return !!state
    && request.runId === state.request.runId
    && request.loadGeneration === state.request.loadGeneration
    && request.inputSignature === state.request.inputSignature;
}

function yieldToWorkerMessages(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function wakeCapacityWaiters(state: Tn93WorkerState): void {
  const waiters = state.capacityWaiters.splice(0);
  waiters.forEach(resolve => resolve());
}

async function waitForBatchCapacity(state: Tn93WorkerState): Promise<void> {
  while (
    !state.cancelled
    && state.outstandingBatches.size >= state.maxInFlightBatches
  ) {
    await new Promise<void>(resolve => state.capacityWaiters.push(resolve));
  }
}

async function waitForBatchDrain(state: Tn93WorkerState): Promise<void> {
  while (!state.cancelled && state.outstandingBatches.size > 0) {
    await new Promise<void>(resolve => state.capacityWaiters.push(resolve));
  }
}

function emitProgress(
  state: Tn93WorkerState,
  phase: Tn93DistanceProgressResponse['phase'],
  force = false,
): void {
  const timestamp = now();
  if (!force && timestamp - state.lastProgressAt < PROGRESS_INTERVAL_MS) {
    return;
  }
  state.lastProgressAt = timestamp;

  const totalPairs = state.plan.totalPairs;
  respond({
    type: 'PROGRESS',
    ...responseContext(state),
    phase,
    threshold: state.candidateThreshold,
    computedPairs: state.computedPairs,
    candidatePairs: state.candidatePairs,
    totalPairs,
    percent: totalPairs === 0
      ? 100
      : Math.min(100, state.computedPairs / totalPairs * 100),
    provisional: state.computedPairs < totalPairs,
  });
}

async function emitDistanceBatch(
  state: Tn93WorkerState,
  stage: Tn93DistanceBatchStage,
  sources: Uint32Array,
  targets: Uint32Array,
  distances: Float32Array,
): Promise<void> {
  if (sources.length === 0 || state.cancelled) return;
  await waitForBatchCapacity(state);
  if (state.cancelled) return;

  const batchId = state.nextBatchId++;
  const payloadBytes = sources.byteLength
    + targets.byteLength
    + distances.byteLength;
  state.outstandingBatches.add(batchId);
  state.timings.batches++;
  state.timings.payloadBytes += payloadBytes;

  const response = {
    type: 'DISTANCE_BATCH' as const,
    ...responseContext(state),
    batchId,
    stage,
    sources,
    targets,
    distances,
    totalComputed: state.computedPairs,
    payloadBytes,
  };
  postMessage(response, [
    sources.buffer,
    targets.buffer,
    distances.buffer,
  ]);
}

function computePairIntoBatch(
  state: Tn93WorkerState,
  pairIndex: number,
  sources: Uint32Array,
  targets: Uint32Array,
  distances: Float32Array,
  outputIndex: number,
  stage: Tn93DistanceBatchStage,
): boolean {
  if (!markTn93Pair(state.computed, pairIndex)) return false;

  const { sourceIndex, targetIndex } = tn93PairCoordinates(pairIndex);
  const source = state.sequences[sourceIndex];
  const target = state.sequences[targetIndex];
  const distance = tn93DistanceForStrategy(
    source._seqInt,
    target._seqInt,
    state.request.strategy,
    source._ambiguity,
    target._ambiguity,
    state.request.ambiguityThreshold,
  );

  sources[outputIndex] = sourceIndex;
  targets[outputIndex] = targetIndex;
  distances[outputIndex] = distance;
  state.computedPairs++;
  if (
    stage !== 'foreground'
    && Number.isFinite(distances[outputIndex])
    && distances[outputIndex] <= state.initialThreshold
  ) {
    state.correctedBelowThresholdLinks++;
  }
  return true;
}

function trimBatch<T extends Uint32Array | Float32Array>(
  values: T,
  length: number,
): T {
  return (length === values.length ? values : values.slice(0, length)) as T;
}

async function computeIndexedPairs(
  state: Tn93WorkerState,
  pairIndices: ArrayLike<number>,
  stage: Tn93DistanceBatchStage,
): Promise<number> {
  let inputIndex = 0;
  let computedForStage = 0;
  const phase = stage === 'foreground' ? 'foreground' : 'promoting';

  while (inputIndex < pairIndices.length && !state.cancelled) {
    const chunkStartedAt = now();
    const chunkLimit = Math.min(
      pairIndices.length,
      inputIndex + state.chunkSize,
    );
    const maximumOutput = Math.min(
      state.batchSize,
      chunkLimit - inputIndex,
    );
    const sources = new Uint32Array(maximumOutput);
    const targets = new Uint32Array(maximumOutput);
    const distances = new Float32Array(maximumOutput);
    let outputIndex = 0;

    while (
      inputIndex < chunkLimit
      && outputIndex < state.batchSize
      && !state.cancelled
    ) {
      if (computePairIntoBatch(
        state,
        pairIndices[inputIndex++],
        sources,
        targets,
        distances,
        outputIndex,
        stage,
      )) {
        outputIndex++;
        computedForStage++;
      }
    }

    if (outputIndex > 0) {
      await emitDistanceBatch(
        state,
        stage,
        trimBatch(sources, outputIndex),
        trimBatch(targets, outputIndex),
        trimBatch(distances, outputIndex),
      );
    }
    if (now() - chunkStartedAt >= LONG_TASK_THRESHOLD_MS) {
      state.timings.longTasks++;
    }
    emitProgress(state, phase);
    await yieldToWorkerMessages();
  }

  return computedForStage;
}

function finishCancelled(state: Tn93WorkerState): void {
  if (state.cancelResponseSent) return;
  state.cancelResponseSent = true;
  respond({
    type: 'CANCELLED',
    ...responseContext(state),
    computedPairs: state.computedPairs,
    totalPairs: state.plan.totalPairs,
    reason: state.cancelReason,
  });
}

async function finishComplete(state: Tn93WorkerState): Promise<void> {
  if (state.completeSent || state.cancelled) return;
  await waitForBatchDrain(state);
  if (state.cancelled || state.completeSent) return;

  state.completeSent = true;
  state.timings.totalWorkerMs = now() - state.startedAt;
  const response: Tn93CompleteResponse = {
    type: 'COMPLETE',
    ...responseContext(state),
    threshold: state.candidateThreshold,
    computedPairs: state.computedPairs,
    totalPairs: state.plan.totalPairs,
    correctedBelowThresholdLinks: state.correctedBelowThresholdLinks,
    timings: { ...state.timings },
  };
  respond(response);
}

async function processPriorityRequest(
  state: Tn93WorkerState,
  priority: PriorityRequest,
): Promise<void> {
  if (state.cancelled) return;
  const promotionStartedAt = now();
  let promotedPairs = 0;

  if (
    Number.isFinite(priority.threshold)
    && priority.threshold >= 0
    && priority.threshold > state.candidateThreshold
  ) {
    const candidates = enumerateTn93CandidatePairIndices(
      state.plan.radii,
      priority.threshold,
    );
    state.candidateThreshold = priority.threshold;
    state.candidatePairs = candidates.length;

    const uncomputed = new Uint32Array(candidates.length);
    let uncomputedCount = 0;
    for (let index = 0; index < candidates.length; index++) {
      if (!hasTn93Pair(state.computed, candidates[index])) {
        uncomputed[uncomputedCount++] = candidates[index];
      }
    }
    promotedPairs = await computeIndexedPairs(
      state,
      uncomputedCount === uncomputed.length
        ? uncomputed
        : uncomputed.slice(0, uncomputedCount),
      'promoting',
    );
  }

  state.timings.promotionMs += now() - promotionStartedAt;
  await waitForBatchDrain(state);
  if (state.cancelled) return;
  respond({
    type: 'PROMOTION_DONE',
    ...responseContext(state),
    requestId: priority.requestId,
    threshold: priority.threshold,
    promotedPairs,
    computedPairs: state.computedPairs,
    candidatePairs: state.candidatePairs,
    totalPairs: state.plan.totalPairs,
  });
  emitProgress(
    state,
    state.computedPairs < state.plan.totalPairs
      ? 'provisional'
      : 'promoting',
    true,
  );
}

async function computeBackgroundChunk(
  state: Tn93WorkerState,
): Promise<void> {
  const chunkStartedAt = now();
  const sources = new Uint32Array(
    Math.min(state.batchSize, state.chunkSize),
  );
  const targets = new Uint32Array(sources.length);
  const distances = new Float32Array(sources.length);
  let outputIndex = 0;
  let inspected = 0;

  while (
    state.backgroundCursor < state.plan.totalPairs
    && inspected < state.chunkSize
    && outputIndex < state.batchSize
    && !state.cancelled
  ) {
    const pairIndex = state.backgroundCursor++;
    inspected++;
    if (hasTn93Pair(state.computed, pairIndex)) continue;
    if (computePairIntoBatch(
      state,
      pairIndex,
      sources,
      targets,
      distances,
      outputIndex,
      'background',
    )) {
      outputIndex++;
    }
  }

  if (outputIndex > 0) {
    await emitDistanceBatch(
      state,
      'background',
      trimBatch(sources, outputIndex),
      trimBatch(targets, outputIndex),
      trimBatch(distances, outputIndex),
    );
  }
  if (now() - chunkStartedAt >= LONG_TASK_THRESHOLD_MS) {
    state.timings.longTasks++;
  }
  emitProgress(state, 'background');
  await yieldToWorkerMessages();
}

async function runDeferredScheduler(state: Tn93WorkerState): Promise<void> {
  if (state.backgroundRunning || state.cancelled || state.completeSent) return;
  state.backgroundRunning = true;

  try {
    while (!state.cancelled && !state.completeSent) {
      while (state.pendingPriorities.length > 0 && !state.cancelled) {
        await processPriorityRequest(
          state,
          state.pendingPriorities.shift()!,
        );
      }
      if (state.cancelled) break;
      if (state.computedPairs >= state.plan.totalPairs) {
        await finishComplete(state);
        break;
      }
      if (!state.backgroundStarted) break;

      const backgroundStartedAt = now();
      await computeBackgroundChunk(state);
      state.timings.backgroundMs += now() - backgroundStartedAt;
    }
  } catch (error) {
    respond({
      type: 'ERROR',
      ...responseContext(state),
      message: error instanceof Error ? error.message : String(error),
      beforeInitial: !state.initialDone,
    });
  } finally {
    state.backgroundRunning = false;
    if (state.cancelled) finishCancelled(state);
  }
}

async function initialize(request: Tn93InitRequest): Promise<void> {
  if (currentState && !currentState.completeSent && !currentState.cancelled) {
    currentState.cancelled = true;
    currentState.cancelReason = 'superseded';
    wakeCapacityWaiters(currentState);
    finishCancelled(currentState);
  }

  let state: Tn93WorkerState | null = null;
  try {
    const startedAt = now();
    const sequences = unpackTn93Sequences(request.sequences);
    const placeholderPlan = createTn93CandidatePlan(
      [],
      request.strategy,
      request.ambiguityThreshold,
      request.threshold,
      request.minimumProgressivePairCount,
      request.maximumCandidateRatio,
    );
    placeholderPlan.totalPairs = tn93PairCount(sequences.length);
    placeholderPlan.deferredPairs = placeholderPlan.totalPairs;
    placeholderPlan.candidateRatio = placeholderPlan.totalPairs === 0 ? 1 : 0;
    state = {
      request,
      sequences,
      plan: placeholderPlan,
      computed: new Uint8Array(),
      computedPairs: 0,
      candidatePairs: 0,
      candidateThreshold: request.threshold,
      initialThreshold: request.threshold,
      batchSize: boundedInteger(
        request.batchSize,
        DEFAULT_BATCH_SIZE,
        1,
        50000,
      ),
      chunkSize: boundedInteger(
        request.chunkSize,
        DEFAULT_CHUNK_SIZE,
        1,
        50000,
      ),
      maxInFlightBatches: boundedInteger(
        request.maxInFlightBatches,
        DEFAULT_MAX_IN_FLIGHT_BATCHES,
        1,
        16,
      ),
      nextBatchId: 1,
      outstandingBatches: new Set(),
      capacityWaiters: [],
      pendingPriorities: [],
      backgroundCursor: 0,
      backgroundStarted: false,
      backgroundRunning: false,
      initialDone: false,
      completeSent: false,
      cancelled: false,
      cancelResponseSent: false,
      correctedBelowThresholdLinks: 0,
      timings: {
        foregroundMs: 0,
        backgroundMs: 0,
        promotionMs: 0,
        totalWorkerMs: 0,
        batches: 0,
        payloadBytes: 0,
        longTasks: 0,
      },
      startedAt,
      lastProgressAt: 0,
    };
    currentState = state;
    emitProgress(state, 'planning', true);

    state.plan = createTn93CandidatePlan(
      sequences,
      request.strategy,
      request.ambiguityThreshold,
      request.threshold,
      request.minimumProgressivePairCount,
      request.maximumCandidateRatio,
    );
    state.computed = createTn93PairBitset(state.plan.totalPairs);
    state.candidatePairs = state.plan.candidatePairs;

    respond({
      type: 'PLAN_READY',
      ...responseContext(state),
      threshold: request.threshold,
      totalPairs: state.plan.totalPairs,
      candidatePairs: state.plan.candidatePairs,
      foregroundPairs: state.plan.foregroundPairIndices.length,
      deferredPairs: state.plan.deferredPairs,
      candidateRatio: state.plan.candidateRatio,
      provisional: state.plan.progressive,
      fallbackReason: state.plan.fallbackReason,
      timings: state.plan.timings,
    });

    const foregroundStartedAt = now();
    await computeIndexedPairs(
      state,
      state.plan.foregroundPairIndices,
      'foreground',
    );
    state.timings.foregroundMs = now() - foregroundStartedAt;
    await waitForBatchDrain(state);
    if (state.cancelled) {
      finishCancelled(state);
      return;
    }

    state.initialDone = true;
    state.timings.totalWorkerMs = now() - state.startedAt;
    respond({
      type: 'INITIAL_DONE',
      ...responseContext(state),
      threshold: request.threshold,
      initialComputedPairs: state.computedPairs,
      candidatePairs: state.plan.candidatePairs,
      deferredPairs: state.plan.totalPairs - state.computedPairs,
      totalPairs: state.plan.totalPairs,
      provisional: state.computedPairs < state.plan.totalPairs,
      fallbackReason: state.plan.fallbackReason,
      timings: state.plan.timings,
      computeTimings: { ...state.timings },
    });
    emitProgress(
      state,
      state.computedPairs < state.plan.totalPairs
        ? 'provisional'
        : 'foreground',
      true,
    );

    if (state.computedPairs >= state.plan.totalPairs) {
      await finishComplete(state);
    } else if (
      state.backgroundStarted
      || state.pendingPriorities.length > 0
    ) {
      void runDeferredScheduler(state);
    }
  } catch (error) {
    if (!state) {
      respond({
        type: 'ERROR',
        runId: request.runId,
        loadGeneration: request.loadGeneration,
        inputSignature: request.inputSignature,
        message: error instanceof Error ? error.message : String(error),
        beforeInitial: true,
      });
      return;
    }
    respond({
      type: 'ERROR',
      ...responseContext(state),
      message: error instanceof Error ? error.message : String(error),
      beforeInitial: !state.initialDone,
    });
  }
}

function handlePriorityRequest(
  state: Tn93WorkerState,
  request: Tn93PrioritizeThresholdRequest,
): void {
  if (state.completeSent) {
    respond({
      type: 'PROMOTION_DONE',
      ...responseContext(state),
      requestId: request.requestId,
      threshold: request.threshold,
      promotedPairs: 0,
      computedPairs: state.computedPairs,
      candidatePairs: state.candidatePairs,
      totalPairs: state.plan.totalPairs,
    });
    return;
  }

  state.pendingPriorities.push({
    requestId: request.requestId,
    threshold: request.threshold,
  });
  if (state.initialDone) void runDeferredScheduler(state);
}

addEventListener('message', ({ data }: MessageEvent<Tn93WorkerRequest>) => {
  switch (data.type) {
    case 'INIT':
      void initialize(data);
      break;
    case 'ACK':
      if (!isCurrentContext(data)) return;
      if (currentState.outstandingBatches.delete(data.batchId)) {
        wakeCapacityWaiters(currentState);
      }
      break;
    case 'START_BACKGROUND':
      if (!isCurrentContext(data) || currentState.cancelled) return;
      currentState.backgroundStarted = true;
      if (currentState.initialDone) void runDeferredScheduler(currentState);
      break;
    case 'PRIORITIZE_THRESHOLD':
      if (!isCurrentContext(data) || currentState.cancelled) return;
      handlePriorityRequest(currentState, data);
      break;
    case 'CANCEL':
      if (!isCurrentContext(data) || currentState.cancelled) return;
      currentState.cancelled = true;
      currentState.cancelReason = data.reason;
      wakeCapacityWaiters(currentState);
      finishCancelled(currentState);
      break;
  }
});
