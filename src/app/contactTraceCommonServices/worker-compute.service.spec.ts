import { packTn93Sequences } from '../workers/tn93-worker-payload';
import type {
  Tn93DistanceBatch,
  Tn93PlanTimings,
  Tn93WorkerResponse,
} from '../workers/tn93-engine.types';
import {
  StartTn93DistanceJobOptions,
  Tn93DistanceJobCancelledError,
  WorkerComputeService,
} from './worker-compute.service';

const PLAN_TIMINGS: Tn93PlanTimings = {
  ambiguityMs: 1,
  consensusMs: 2,
  radialDistanceMs: 3,
  sortAndWindowMs: 4,
  totalPlanningMs: 10,
};

const COMPUTE_TIMINGS = {
  foregroundMs: 5,
  backgroundMs: 6,
  promotionMs: 0,
  totalWorkerMs: 11,
  batches: 2,
  payloadBytes: 36,
  longTasks: 0,
};

class FakeTn93Worker {
  posted: any[] = [];
  terminated = false;
  private messageListeners = new Set<(event: MessageEvent<Tn93WorkerResponse>) => void>();
  private errorListeners = new Set<(event: ErrorEvent) => void>();

  postMessage(message: any, transferables?: Transferable[]): void {
    this.posted.push({ message, transferables });
  }

  addEventListener(type: string, listener: any): void {
    if (type === 'message') {
      this.messageListeners.add(listener);
    } else if (type === 'error') {
      this.errorListeners.add(listener);
    }
  }

  removeEventListener(type: string, listener: any): void {
    if (type === 'message') {
      this.messageListeners.delete(listener);
    } else if (type === 'error') {
      this.errorListeners.delete(listener);
    }
  }

  emit(response: Tn93WorkerResponse): void {
    this.messageListeners.forEach((listener) => listener({ data: response } as MessageEvent<Tn93WorkerResponse>));
  }

  emitError(message: string): void {
    this.errorListeners.forEach((listener) => listener({ message } as ErrorEvent));
  }
}

class FakeWorkerModule {
  worker = new FakeTn93Worker();
  terminateCalls = 0;

  getTn93DistanceWorker(): Worker {
    this.worker.terminated = false;
    return this.worker as unknown as Worker;
  }

  terminateTn93DistanceWorker(): void {
    this.terminateCalls++;
    this.worker.terminated = true;
  }
}

function contextFrom(worker: FakeTn93Worker) {
  const init = worker.posted.find((entry) => entry.message.type === 'INIT').message;
  return {
    runId: init.runId,
    loadGeneration: init.loadGeneration,
    inputSignature: init.inputSignature,
  };
}

function options(
  onBatch: (batch: Tn93DistanceBatch) => void | Promise<void> = () => undefined,
  overrides: Partial<StartTn93DistanceJobOptions> = {}
): StartTn93DistanceJobOptions {
  return {
    packedSequences: packTn93Sequences([
      { _id: 'a', _seqInt: new Uint8Array([0, 1, 2]) },
      { _id: 'b', _seqInt: new Uint8Array([0, 1, 3]) },
    ]),
    strategy: 'AVERAGE',
    ambiguityThreshold: 0.015,
    threshold: 0.015,
    loadGeneration: 7,
    inputSignature: 'signature-7',
    onBatch,
    ...overrides,
  };
}

function emitPlan(worker: FakeTn93Worker, provisional = true): void {
  worker.emit({
    type: 'PLAN_READY',
    ...contextFrom(worker),
    threshold: 0.015,
    totalPairs: 1,
    candidatePairs: provisional ? 1 : 1,
    foregroundPairs: 1,
    deferredPairs: provisional ? 0 : 0,
    candidateRatio: 1,
    provisional,
    timings: PLAN_TIMINGS,
  });
}

function emitInitialDone(worker: FakeTn93Worker, provisional = true): void {
  worker.emit({
    type: 'INITIAL_DONE',
    ...contextFrom(worker),
    threshold: 0.015,
    initialComputedPairs: provisional ? 1 : 1,
    candidatePairs: 1,
    deferredPairs: provisional ? 0 : 0,
    totalPairs: 1,
    provisional,
    timings: PLAN_TIMINGS,
    computeTimings: COMPUTE_TIMINGS,
  });
}

describe('WorkerComputeService progressive TN93 coordinator', () => {
  let module: FakeWorkerModule;
  let service: WorkerComputeService;

  beforeEach(() => {
    module = new FakeWorkerModule();
    service = new WorkerComputeService(module as any);
  });

  it('acknowledges a distance batch only after its async merge completes', async () => {
    let releaseMerge: () => void;
    const mergePromise = new Promise<void>((resolve) => {
      releaseMerge = resolve;
    });
    const start = service.startTn93DistanceJob(options(() => mergePromise));
    const context = contextFrom(module.worker);
    emitPlan(module.worker);

    module.worker.emit({
      type: 'DISTANCE_BATCH',
      ...context,
      batchId: 3,
      stage: 'foreground',
      sources: new Uint32Array([1]),
      targets: new Uint32Array([0]),
      distances: new Float32Array([0.01]),
      totalComputed: 1,
      payloadBytes: 12,
    });

    expect(module.worker.posted.some((entry) => entry.message.type === 'ACK')).toBeFalse();
    releaseMerge();
    await Promise.resolve();
    await Promise.resolve();
    expect(module.worker.posted.find((entry) => entry.message.type === 'ACK')?.message.batchId).toBe(3);

    emitInitialDone(module.worker);
    const initial = await start;
    expect(initial.provisional).toBeTrue();
    initial.startBackground();
    expect(module.worker.posted.some((entry) => entry.message.type === 'START_BACKGROUND')).toBeTrue();

    module.worker.emit({
      type: 'COMPLETE',
      ...context,
      threshold: 0.015,
      computedPairs: 1,
      totalPairs: 1,
      correctedBelowThresholdLinks: 0,
      timings: COMPUTE_TIMINGS,
    });
    await expectAsync(initial.backgroundCompletion).toBeResolved();
  });

  it('reuses lower thresholds and prioritizes a higher threshold', async () => {
    const start = service.startTn93DistanceJob(options());
    emitPlan(module.worker);
    emitInitialDone(module.worker);
    const initial = await start;

    const postsBeforeLowerThreshold = module.worker.posted.length;
    const lower = await service.ensureTn93CandidatesForThreshold(0.01, {
      runId: initial.runId,
      loadGeneration: initial.loadGeneration,
      inputSignature: initial.inputSignature,
    });
    expect(lower.promotedPairs).toBe(0);
    expect(module.worker.posted.length).toBe(postsBeforeLowerThreshold);

    const higherPromise = service.ensureTn93CandidatesForThreshold(0.02);
    const priority = module.worker.posted.find((entry) => entry.message.type === 'PRIORITIZE_THRESHOLD').message;
    module.worker.emit({
      type: 'PROMOTION_DONE',
      ...contextFrom(module.worker),
      requestId: priority.requestId,
      threshold: 0.02,
      promotedPairs: 1,
      computedPairs: 1,
      candidatePairs: 1,
      totalPairs: 1,
    });

    const promoted = await higherPromise;
    expect(promoted.threshold).toBe(0.02);
    expect(promoted.promotedPairs).toBe(1);
    service.cancelTn93DistanceJob('test cleanup');
  });

  it('queues a higher threshold while candidate planning is still in progress', async () => {
    const start = service.startTn93DistanceJob(options());
    const promotion = service.ensureTn93CandidatesForThreshold(0.02, {
      loadGeneration: 7,
      inputSignature: 'signature-7',
    });
    const priority = module.worker.posted.find(
      (entry) => entry.message.type === 'PRIORITIZE_THRESHOLD'
    )?.message;

    expect(priority).toBeDefined();
    expect(priority.threshold).toBe(0.02);

    emitPlan(module.worker);
    emitInitialDone(module.worker);
    const initial = await start;
    module.worker.emit({
      type: 'PROMOTION_DONE',
      ...contextFrom(module.worker),
      requestId: priority.requestId,
      threshold: 0.02,
      promotedPairs: 1,
      computedPairs: 1,
      candidatePairs: 1,
      totalPairs: 1,
    });

    expect((await promotion)?.promotedPairs).toBe(1);
    initial.startBackground();
    service.cancelTn93DistanceJob('test cleanup');
  });

  it('falls back to exhaustive computation when the worker fails before INITIAL_DONE', async () => {
    const start = service.startTn93DistanceJob(options(
      () => undefined,
      {
        fallbackToExhaustive: async () => ({
          computedPairs: 1,
          totalPairs: 1,
          timings: { totalWorkerMs: 12 },
          fallbackReason: 'worker-error',
        }),
      }
    ));
    const queuedPromotion = service.ensureTn93CandidatesForThreshold(0.02, {
      loadGeneration: 7,
      inputSignature: 'signature-7',
    });

    module.worker.emit({
      type: 'ERROR',
      ...contextFrom(module.worker),
      message: 'foreground failed',
      beforeInitial: true,
    });

    const result = await start;
    expect(result.provisional).toBeFalse();
    expect(result.initialComputedPairs).toBe(1);
    expect(result.deferredPairs).toBe(0);
    await expectAsync(result.backgroundCompletion).toBeResolved();
    await expectAsync(queuedPromotion).toBeResolvedTo(jasmine.objectContaining({
      computedPairs: 1,
      totalPairs: 1,
      promotedPairs: 0,
    }));
  });

  it('rejects background completion when the worker fails after the provisional result', async () => {
    const start = service.startTn93DistanceJob(options());
    emitPlan(module.worker);
    emitInitialDone(module.worker);
    const result = await start;

    module.worker.emit({
      type: 'ERROR',
      ...contextFrom(module.worker),
      message: 'background failed',
      beforeInitial: false,
    });

    await expectAsync(result.backgroundCompletion).toBeRejectedWithError('background failed');
    expect(result.provisional).toBeTrue();
  });

  it('rejects stale worker responses and cancellation terminates the job', async () => {
    const start = service.startTn93DistanceJob(options());
    let initialSettled = false;
    void start.finally(() => {
      initialSettled = true;
    }).catch(() => undefined);
    const cancellation = expectAsync(start).toBeRejectedWithError(Tn93DistanceJobCancelledError);
    const context = contextFrom(module.worker);

    module.worker.emit({
      type: 'PLAN_READY',
      ...context,
      inputSignature: 'stale-signature',
      threshold: 0.015,
      totalPairs: 1,
      candidatePairs: 1,
      foregroundPairs: 1,
      deferredPairs: 0,
      candidateRatio: 1,
      provisional: false,
      timings: PLAN_TIMINGS,
    });

    expect(service.getTn93CoordinatorTelemetry().staleResponses).toBe(1);
    await Promise.resolve();
    expect(initialSettled).toBeFalse();
    service.cancelTn93DistanceJob('new load');
    await cancellation;
    expect(module.terminateCalls).toBeGreaterThan(0);
  });
});
