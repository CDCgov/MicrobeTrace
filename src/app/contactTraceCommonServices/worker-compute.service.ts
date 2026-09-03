import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import * as patristic from 'patristic';
import { WorkerModule } from '../workers/workModule';
import type {
  PatristicWorkerRequest,
  PatristicWorkerResponse,
  PatristicEdgeBatchResponse,
  PatristicTreeReadyResponse,
  PatristicNearestNeighborBatchResponse,
  PatristicProgressResponse,
  PatristicErrorResponse,
} from '../workers/patristic-engine.types';
import type {
  ExhaustiveFallbackResult,
  SequenceLinkComputationResult,
  Tn93AmbiguityStrategy,
  Tn93ComputeTimings,
  Tn93DistanceBatch,
  Tn93DistanceBatchResponse,
  Tn93DistanceCompletionResult,
  Tn93DistanceStatus,
  Tn93InitialDoneResponse,
  Tn93PlanReadyResponse,
  Tn93PlanTimings,
  Tn93PromotionDoneResponse,
  Tn93WorkerRequest,
  Tn93WorkerResponse,
} from '../workers/tn93-engine.types';
import type { PackedTn93Sequences } from '../workers/tn93-worker-payload';
import { packedTn93Transferables } from '../workers/tn93-worker-payload';

export type { ExhaustiveFallbackResult } from '../workers/tn93-engine.types';

export interface StartTn93DistanceJobOptions {
  packedSequences: PackedTn93Sequences;
  strategy: Tn93AmbiguityStrategy;
  ambiguityThreshold: number;
  threshold: number;
  loadGeneration: number;
  inputSignature: string;
  batchSize?: number;
  chunkSize?: number;
  maxInFlightBatches?: number;
  minimumProgressivePairCount?: number;
  maximumCandidateRatio?: number;
  onBatch: (batch: Tn93DistanceBatch) => void | number | Promise<void | number>;
  onStatus?: (status: Tn93DistanceStatus) => void;
  fallbackToExhaustive?: (cause: Error) => Promise<ExhaustiveFallbackResult>;
}

export interface Tn93DistanceJobIdentity {
  runId?: number;
  loadGeneration?: number;
  inputSignature?: string;
}

export interface Tn93ThresholdPromotionResult {
  runId: number;
  loadGeneration: number;
  inputSignature: string;
  threshold: number;
  promotedPairs: number;
  computedPairs: number;
  candidatePairs: number;
  totalPairs: number;
}

export interface Tn93CoordinatorTelemetry {
  cancelledJobs: number;
  staleResponses: number;
  batchMergeFailures: number;
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: any) => void;
  settled: boolean;
}

interface PendingTn93Promotion {
  requestId: number;
  threshold: number;
  deferred: Deferred<Tn93ThresholdPromotionResult>;
}

interface ActiveTn93DistanceJob {
  worker: Worker;
  runId: number;
  loadGeneration: number;
  inputSignature: string;
  options: StartTn93DistanceJobOptions;
  initial: Deferred<SequenceLinkComputationResult>;
  background: Deferred<Tn93DistanceCompletionResult>;
  promotions: Map<number, PendingTn93Promotion>;
  messageHandler: (event: MessageEvent<Tn93WorkerResponse>) => void;
  errorHandler: (event: ErrorEvent) => void;
  latestStatus: Tn93DistanceStatus;
  plan?: Tn93PlanReadyResponse;
  backgroundStarted: boolean;
  initialSettled: boolean;
  provisional: boolean;
  handlingFailure: boolean;
  finished: boolean;
  maxCoveredThreshold: number;
  initialLinkCount: number;
}

interface CompletedTn93DistanceJob {
  completion: Tn93DistanceCompletionResult;
  candidatePairs: number;
}

export class Tn93DistanceJobCancelledError extends Error {
  constructor(message = 'TN93 distance computation was cancelled.') {
    super(message);
    this.name = 'Tn93DistanceJobCancelledError';
  }
}

export class Tn93StaleDistanceJobError extends Error {
  constructor(message = 'The TN93 distance job no longer matches the active input.') {
    super(message);
    this.name = 'Tn93StaleDistanceJobError';
  }
}

function createDeferred<T>(): Deferred<T> {
  let resolvePromise: (value: T) => void;
  let rejectPromise: (reason?: any) => void;
  const deferred: Deferred<T> = {
    promise: new Promise<T>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    }),
    resolve: (value: T) => {
      if (deferred.settled) return;
      deferred.settled = true;
      resolvePromise(value);
    },
    reject: (reason?: any) => {
      if (deferred.settled) return;
      deferred.settled = true;
      rejectPromise(reason);
    },
    settled: false,
  };
  return deferred;
}
import {
  BOOTSTRAP_DEFAULT_STABILITY_TOLERANCE_PERCENT,
  buildSupportSnapshot,
  isSupportStable,
  mergeSplitCounts,
  normalizeBootstrapReplicateCount,
  supportPercentBySplitKey,
} from '../workers/phylogenetic-bootstrap-utils';
import type {
  PhylogeneticBootstrapBatchResponse,
  PhylogeneticBootstrapComputeOptions,
  PhylogeneticBootstrapComputeResult,
  PhylogeneticBootstrapErrorResponse,
  PhylogeneticBootstrapProgress,
  PhylogeneticBootstrapWorkerRequest,
  PhylogeneticBootstrapWorkerResponse,
} from '../workers/phylogenetic-bootstrap.types';
import type {
  NetworkStatisticsRequest,
  NetworkStatisticsResult,
} from './network-statistics';

interface ComputePatristicOptions {
  origin?: string[];
  distanceOrigin?: string;
  check?: any;
  maxEdges?: number;
  batchSize?: number;
  isCurrent?: () => boolean;
}

interface PatristicVisibleEdgeGuardrails {
  warningThreshold: number;
  hardLimit: number;
}

interface PatristicGuardrailResult {
  warningThreshold: number;
  hardLimit: number;
  matchedEdgeCount: number;
  warningHit: boolean;
  hardLimitHit: boolean;
  threshold: number;
  message: string;
  fallbackApplied?: boolean;
  fallbackLinkCount?: number;
  fallbackType?: 'nearest-neighbor-backbone';
}

interface PatristicMergeResult {
  newLinks: number;
  totalLinks: number;
  leafNames: string[];
  guardrail?: PatristicGuardrailResult;
  fallback?: {
    type: 'nearest-neighbor-backbone';
    newLinks: number;
    totalLinks: number;
    selectedLinks: number;
    epsilon: number;
    timings?: PatristicNearestNeighborBatchResponse['timings'];
  };
}

interface PatristicNearestNeighborMergeResult {
  newLinks: number;
  totalLinks: number;
  leafNames: string[];
  selectedLinks: number;
}

interface PatristicAnalysisEdge {
  sourceIndex: number;
  targetIndex: number;
  value: number;
}

export interface PatristicDistanceAnalysisProgress {
  completedPairs: number;
  totalPairs: number;
  percent: number;
}

export interface PatristicDistanceAnalysisResult {
  edges: PatristicAnalysisEdge[];
  totalPairs: number;
  skipped: boolean;
  skipReason?: string;
}

interface CollectPatristicDistanceAnalysisOptions {
  maxPairs?: number;
  batchSize?: number;
  bypassPairLimit?: boolean;
  onProgress?: (progress: PatristicDistanceAnalysisProgress) => void;
}

const DEFAULT_NEWICK_VISIBLE_LINK_WARNING_THRESHOLD = 75000;
const DEFAULT_NEWICK_VISIBLE_LINK_HARD_LIMIT = 100000;
const DEFAULT_NEWICK_THRESHOLD_ANALYSIS_PAIR_LIMIT = 500000;

/**
 * This service delegates all Worker-based computations.
 * It expects a 'session' object with the same structure
 * that CommonService uses (so we can push nodeFields, etc.).
 */
@Injectable({
  providedIn: 'root'
})
export class WorkerComputeService {

  private tn93RunId = 0;
  private tn93PromotionRequestId = 0;
  private activeTn93Job: ActiveTn93DistanceJob | null = null;
  private completedTn93Job: CompletedTn93DistanceJob | null = null;
  private tn93CoordinatorTelemetry: Tn93CoordinatorTelemetry = {
    cancelledJobs: 0,
    staleResponses: 0,
    batchMergeFailures: 0,
  };

  constructor(private computer: WorkerModule) {}

  /**
   * Helper that converts a Worker’s events into an RxJS Observable.
   */
  private fromWorker(worker: any): Observable<MessageEvent<any>> {
    return new Observable(observer => {
      // If the worker implements addEventListener, use it.
      if (typeof worker.addEventListener === 'function') {
        const messageHandler = (event: MessageEvent<any>) => observer.next(event);
        const errorHandler = (error: ErrorEvent) => observer.error(error);
        worker.addEventListener('message', messageHandler);
        worker.addEventListener('error', errorHandler);
  
        return () => {
          worker.removeEventListener('message', messageHandler);
          worker.removeEventListener('error', errorHandler);
          worker.terminate();
        };
      } else {
        // Fallback for InlineWorker (or any non-standard worker)
        // Use the onmessage and onerror properties.
        worker.onmessage = (event: MessageEvent<any>) => observer.next(event);
        worker.onerror = (error: ErrorEvent) => observer.error(error);
        
        return () => {
          // If your InlineWorker provides a terminate() method, call it.
          if (typeof worker.terminate === 'function') {
            worker.terminate();
          }
        };
      }
    });
  }

  /**
   * Align sequences using a worker.
   * We push the extra node fields (“_score”, “_padding”, “_cigar”)
   * just like the old CommonService code did.
   */
  public align(session: any, params: any): Promise<any> {
    return new Promise(resolve => {
      if (params.aligner === 'none') {
        return resolve(params.nodes);
      }

      const n = params.nodes.length;
      const referenceLength = params.reference.length;

      const alignWorker = this.computer.getAlignWorker() as unknown as Worker;
      alignWorker.postMessage(params);

      const sub = this.fromWorker(alignWorker).subscribe(response => {
        const decoder = new TextDecoder('utf-8');
        const subset = JSON.parse(decoder.decode(new Uint8Array(response.data.nodes)));

        if (session.debugMode) {
          console.log(
            'Alignment transit time: ',
            (Date.now() - response.data.start).toLocaleString(),
            'ms'
          );
        }

        const start = Date.now();
        let minPadding = Infinity;
        for (let i = 0; i < n; i++) {
          const d = subset[i];
          if (!d._seq) d._seq = '';
          if (minPadding > d._padding) {
            minPadding = d._padding;
          }
        }

        // Pad all sequences
        for (let j = 0; j < n; j++) {
          const d = subset[j];
          d._seq = '-'.repeat(d._padding - minPadding) + d._seq;
          if (d._seq.length > referenceLength) {
            d._seq = d._seq.substring(0, referenceLength);
          } else {
            d._seq = d._seq.padEnd(referenceLength, '-');
          }
        }

        // Just like in old code, push the new nodeFields
        session.data.nodeFields.push('_score', '_padding', '_cigar');

        if (session.debugMode) {
          console.log(
            'Alignment Padding time: ',
            (Date.now() - start).toLocaleString(),
            'ms'
          );
        }

        resolve(subset);

        alignWorker.terminate();
        sub.unsubscribe();
      });
    });
  }

  /**
   * Compute consensus from a set of nodes that have .seq.
   */
  public computeConsensus(session: any, nodes: any[]): Promise<any> {
    return new Promise(resolve => {
      const consensusWorker = this.computer.getConsensusWorker() as unknown as Worker;
      consensusWorker.postMessage({ data: nodes });

      const sub = this.fromWorker(consensusWorker).subscribe(response => {
        if (session.debugMode) {
          console.log(
            'Consensus Transit time: ',
            (Date.now() - response.data.start).toLocaleString(),
            'ms'
          );
        }

        const decoder = new TextDecoder('utf-8');
        const consensus = decoder.decode(new Uint8Array(response.data.consensus));

        resolve(consensus);
        consensusWorker.terminate();
        sub.unsubscribe();
      });
    });
  }

  /**
   * Compute ambiguity counts. Also push "_ambiguity" into nodeFields
   * like the old code did.
   */
  public computeAmbiguityCounts(session: any): Promise<void> {
    return new Promise<void>(resolve => {
      const nodes = session.data.nodes;
      const subset = nodes.filter((d: any) => d.seq);
      const subsetLength = subset.length;

      const ambiguityWorker = this.computer.getAmbiguityCountsWorker() as unknown as Worker;
      ambiguityWorker.postMessage(subset);

      const sub = this.fromWorker(ambiguityWorker).subscribe(response => {
        if (session.debugMode) {
          console.log(
            'Ambiguity Count Transit time: ',
            (Date.now() - response.data.start).toLocaleString(),
            'ms'
          );
        }
        const start = Date.now();
        const dists = new Float32Array(response.data.counts);

        // Assign each node’s ._ambiguity
        for (let j = 0; j < subsetLength; j++) {
          nodes[subset[j].index]._ambiguity = dists[j];
        }
        // In old code, we also do: session.data.nodeFields.push('_ambiguity');
        session.data.nodeFields.push('_ambiguity');

        if (session.debugMode) {
          console.log(
            'Ambiguity Count Merge time: ',
            (Date.now() - start).toLocaleString(),
            'ms'
          );
        }

        resolve();
        ambiguityWorker.terminate();
        sub.unsubscribe();
      });
    });
  }

  /**
   * Compute consensus distances. Also push "_diff" field.
   */
  public computeConsensusDistances(session: any): Promise<void> {
    return new Promise<void>(resolve => {
      const start = Date.now();
      const nodes = session.data.nodes;
      const subset: any[] = [];

      // Build subset array
      for (let i = 0; i < nodes.length; i++) {
        subset.push({ index: i, seq: nodes[i].seq || '' });
      }

      const consensusWorker = this.computer.getConsensusWorker() as unknown as Worker;
      consensusWorker.postMessage({
        data: {
          consensus: session.data['consensus'] || null, // or pass actual consensus if you have it
          subset: subset,
          start: start
        }
      });

      const sub = this.fromWorker(consensusWorker).subscribe(response => {
        const dists = new Uint16Array(response.data.dists);
        if (session.debugMode) {
          console.log(
            'Consensus Difference Transit time: ',
            (Date.now() - response.data.start).toLocaleString(),
            'ms'
          );
        }
        const mergeStart = Date.now();
        for (let j = 0; j < subset.length; j++) {
          nodes[subset[j].index]._diff = dists[j];
        }
        // old code: session.data.nodeFields.push('_diff');
        session.data.nodeFields.push('_diff');

        if (session.debugMode) {
          console.log(
            'Consensus Difference Merge time: ',
            (Date.now() - mergeStart).toLocaleString(),
            'ms'
          );
        }
        resolve();
        consensusWorker.terminate();
        sub.unsubscribe();
      });
    });
  }

  /**
   * Compute links using default-distance-metric. 
   * The old code used subset plus calls addLink on session.
   * So we do the same: we loop through the pairs and call session.addLink(...) for each distance.
   */
 /**
   * Compute links using a worker.
   * Note: We now pass an addLink callback so that we can call
   * the original addLink logic from CommonService.
   */
  public computeLinks(
    session: any,
    subset: any[],
    addLink: (link: any, check: any) => number
  ): Promise<any> {
    return new Promise(resolve => {
      let k = 0;
      const metric = session.style.widgets['default-distance-metric'];
      const linksWorker = this.computer.getLinksWorker() as unknown as Worker;
      linksWorker.postMessage({
        nodes: subset,
        metric: metric,
        strategy: session.style.widgets["ambiguity-resolution-strategy"],
        threshold: session.style.widgets["ambiguity-threshold"]
      });

      const sub = this.fromWorker(linksWorker).subscribe((response: MessageEvent<any>) => {
        // Choose the proper typed array based on metric
        const dists = metric.toLowerCase() === 'snps'
          ? new Uint16Array(response.data.links)
          : new Float32Array(response.data.links);

        if (session.debugMode) {
          console.log(
            'Links Transit time: ',
            (Date.now() - response.data.start).toLocaleString(),
            'ms'
          );
        }
        const start = Date.now();
        const checkFlag = session.files.length > 1;
        let l = 0;
        // For each pair (i,j) with i > j, add a link using the provided addLink callback.
        for (let i = 0; i < subset.length; i++) {
          const sourceID = subset[i]._id;
          for (let j = 0; j < i; j++) {
            k += addLink({
              source: sourceID,
              target: subset[j]._id,
              distance: dists[l++],
              origin: ['Genetic Distance'],
              distanceOrigin: 'Genetic Distance',
              hasDistance: true,
              directed: false
            }, checkFlag);
          }
        }
        if (session.debugMode) {
          console.log(
            'Links Merge time: ',
            (Date.now() - start).toLocaleString(),
            'ms'
          );
        }
        resolve(k);
        linksWorker.terminate();
        sub.unsubscribe();
      });
    });
  }

  /**
   * Start a stateful, progressive TN93 distance job.
   *
   * The returned promise resolves only after all foreground batches have been
   * merged and acknowledged. The caller owns the first render and then calls
   * result.startBackground() to release the worker to compute the complement.
   */
  public startTn93DistanceJob(
    options: StartTn93DistanceJobOptions
  ): Promise<SequenceLinkComputationResult> {
    this.validateTn93StartOptions(options);
    this.cancelTn93DistanceJob('superseded by a new TN93 distance job');
    this.completedTn93Job = null;

    const totalPairs = this.getPackedTn93PairCount(options.packedSequences);
    const worker = this.computer.getTn93DistanceWorker();
    const runId = ++this.tn93RunId;
    const initial = createDeferred<SequenceLinkComputationResult>();
    const background = createDeferred<Tn93DistanceCompletionResult>();

    // A foreground failure can reject this promise before it is handed to a
    // caller. Attach a noop rejection observer while retaining the rejecting
    // promise for consumers that receive it through the initial result.
    void background.promise.catch(() => undefined);

    const initialStatus: Tn93DistanceStatus = {
      phase: 'planning',
      runId,
      loadGeneration: options.loadGeneration,
      inputSignature: options.inputSignature,
      threshold: options.threshold,
      computedPairs: 0,
      candidatePairs: 0,
      totalPairs,
      provisional: true,
    };

    const job = {} as ActiveTn93DistanceJob;
    job.worker = worker;
    job.runId = runId;
    job.loadGeneration = options.loadGeneration;
    job.inputSignature = options.inputSignature;
    job.options = options;
    job.initial = initial;
    job.background = background;
    job.promotions = new Map<number, PendingTn93Promotion>();
    job.latestStatus = initialStatus;
    job.backgroundStarted = false;
    job.initialSettled = false;
    job.provisional = false;
    job.handlingFailure = false;
    job.finished = false;
    job.maxCoveredThreshold = options.threshold;
    job.initialLinkCount = 0;
    job.messageHandler = (event: MessageEvent<Tn93WorkerResponse>) => {
      this.handleTn93WorkerResponse(job, event.data);
    };
    job.errorHandler = (event: ErrorEvent) => {
      const error = event?.error instanceof Error
        ? event.error
        : new Error(event?.message || 'The TN93 distance worker failed.');
      void this.handleTn93JobFailure(job, error, !job.initialSettled);
    };

    this.activeTn93Job = job;
    worker.addEventListener('message', job.messageHandler);
    worker.addEventListener('error', job.errorHandler);
    this.emitTn93Status(job, initialStatus);

    const request: Tn93WorkerRequest = {
      type: 'INIT',
      runId,
      loadGeneration: options.loadGeneration,
      inputSignature: options.inputSignature,
      sequences: options.packedSequences,
      strategy: options.strategy,
      ambiguityThreshold: options.ambiguityThreshold,
      threshold: options.threshold,
      batchSize: options.batchSize,
      chunkSize: options.chunkSize,
      maxInFlightBatches: options.maxInFlightBatches,
      minimumProgressivePairCount: options.minimumProgressivePairCount,
      maximumCandidateRatio: options.maximumCandidateRatio,
    };

    try {
      worker.postMessage(request, packedTn93Transferables(options.packedSequences));
    } catch (cause) {
      void this.handleTn93JobFailure(
        job,
        this.asError(cause, 'Unable to start the TN93 distance worker.'),
        true
      );
    }

    return initial.promise;
  }

  /**
   * Prioritize any not-yet-computed pairs newly eligible at a higher threshold.
   * Lower/equal thresholds reuse the already computed foreground superset.
   */
  public ensureTn93CandidatesForThreshold(
    threshold: number,
    expected: Tn93DistanceJobIdentity = {}
  ): Promise<Tn93ThresholdPromotionResult | null> {
    if (!Number.isFinite(threshold) || threshold < 0) {
      return Promise.reject(new Error(`Invalid TN93 link threshold: ${threshold}`));
    }

    const job = this.activeTn93Job;
    if (!job || job.finished) {
      const completed = this.completedTn93Job;
      if (!completed || !this.tn93IdentityMatches(completed.completion, expected)) {
        return Promise.resolve(null);
      }

      return Promise.resolve({
        runId: completed.completion.runId,
        loadGeneration: completed.completion.loadGeneration,
        inputSignature: completed.completion.inputSignature,
        threshold,
        promotedPairs: 0,
        computedPairs: completed.completion.computedPairs,
        candidatePairs: completed.candidatePairs,
        totalPairs: completed.completion.totalPairs,
      });
    }

    if (!this.tn93IdentityMatches(job, expected)) {
      return Promise.reject(new Tn93StaleDistanceJobError());
    }

    if (
      threshold <= job.maxCoveredThreshold
      || (job.plan !== undefined && !job.provisional)
    ) {
      return Promise.resolve(this.buildNoopTn93PromotionResult(job, threshold));
    }

    const coveringPromotion = Array.from(job.promotions.values())
      .filter((promotion) => promotion.threshold >= threshold)
      .sort((source, target) => source.threshold - target.threshold)[0];
    if (coveringPromotion) {
      return coveringPromotion.deferred.promise;
    }

    const requestId = ++this.tn93PromotionRequestId;
    const deferred = createDeferred<Tn93ThresholdPromotionResult>();
    const promotion: PendingTn93Promotion = {
      requestId,
      threshold,
      deferred,
    };
    job.promotions.set(requestId, promotion);

    this.emitTn93Status(job, {
      ...job.latestStatus,
      phase: 'promoting',
      threshold,
      provisional: true,
    });

    try {
      this.postTn93Request(job, {
        type: 'PRIORITIZE_THRESHOLD',
        runId: job.runId,
        loadGeneration: job.loadGeneration,
        inputSignature: job.inputSignature,
        requestId,
        threshold,
      });
    } catch (cause) {
      job.promotions.delete(requestId);
      deferred.reject(this.asError(cause, 'Unable to prioritize the TN93 threshold.'));
      void this.handleTn93JobFailure(
        job,
        this.asError(cause, 'Unable to prioritize the TN93 threshold.'),
        !job.initialSettled
      );
    }

    return deferred.promise;
  }

  /**
   * Cancel and terminate the owned TN93 worker. Calling this during a
   * provisional run rejects backgroundCompletion but leaves already merged
   * distances untouched for the caller to replace or discard.
   */
  public cancelTn93DistanceJob(reason = 'TN93 distance computation cancelled'): void {
    const job = this.activeTn93Job;
    this.completedTn93Job = null;

    if (!job || job.finished) {
      this.computer.terminateTn93DistanceWorker();
      return;
    }

    this.tn93CoordinatorTelemetry.cancelledJobs++;
    const cancellation = new Tn93DistanceJobCancelledError(reason);

    try {
      this.postTn93Request(job, {
        type: 'CANCEL',
        runId: job.runId,
        loadGeneration: job.loadGeneration,
        inputSignature: job.inputSignature,
        reason,
      });
    } catch {
      // Termination below is the authoritative cancellation path.
    }

    this.emitTn93Status(job, {
      ...job.latestStatus,
      phase: 'cancelled',
      provisional: job.provisional,
    });
    job.initial.reject(cancellation);
    job.background.reject(cancellation);
    this.rejectTn93Promotions(job, cancellation);
    this.finishTn93Job(job);
  }

  public getTn93CoordinatorTelemetry(): Tn93CoordinatorTelemetry {
    return { ...this.tn93CoordinatorTelemetry };
  }

  private validateTn93StartOptions(options: StartTn93DistanceJobOptions): void {
    if (!options || typeof options !== 'object') {
      throw new Error('TN93 distance job options are required.');
    }
    if (!options.packedSequences) {
      throw new Error('Packed TN93 sequences are required.');
    }
    if (!Number.isFinite(options.loadGeneration)) {
      throw new Error('A finite TN93 load generation is required.');
    }
    if (!options.inputSignature) {
      throw new Error('A TN93 input signature is required.');
    }
    if (typeof options.onBatch !== 'function') {
      throw new Error('A TN93 distance batch merge callback is required.');
    }
  }

  private getPackedTn93PairCount(sequences: PackedTn93Sequences): number {
    const offsets = new Uint32Array(sequences.sequenceOffsets);
    const sequenceCount = Math.max(0, offsets.length - 1);
    return (sequenceCount * (sequenceCount - 1)) / 2;
  }

  private handleTn93WorkerResponse(
    job: ActiveTn93DistanceJob,
    response: Tn93WorkerResponse
  ): void {
    if (!this.isCurrentTn93Response(job, response)) {
      this.tn93CoordinatorTelemetry.staleResponses++;
      return;
    }

    switch (response.type) {
      case 'PLAN_READY':
        this.handleTn93PlanReady(job, response);
        break;
      case 'PROGRESS':
        this.emitTn93Status(job, {
          phase: response.phase,
          runId: job.runId,
          loadGeneration: job.loadGeneration,
          inputSignature: job.inputSignature,
          threshold: response.threshold,
          computedPairs: response.computedPairs,
          candidatePairs: response.candidatePairs,
          totalPairs: response.totalPairs,
          provisional: response.provisional,
          fallbackReason: job.plan?.fallbackReason,
        });
        break;
      case 'DISTANCE_BATCH':
        void this.mergeAndAcknowledgeTn93Batch(job, response);
        break;
      case 'INITIAL_DONE':
        this.handleTn93InitialDone(job, response);
        break;
      case 'PROMOTION_DONE':
        this.handleTn93PromotionDone(job, response);
        break;
      case 'COMPLETE':
        this.completeTn93Job(job, {
          runId: response.runId,
          loadGeneration: response.loadGeneration,
          inputSignature: response.inputSignature,
          computedPairs: response.computedPairs,
          totalPairs: response.totalPairs,
          correctedBelowThresholdLinks: response.correctedBelowThresholdLinks,
          timings: response.timings,
        });
        break;
      case 'CANCELLED': {
        const cancellation = new Tn93DistanceJobCancelledError(
          response.reason || 'TN93 distance computation was cancelled.'
        );
        this.emitTn93Status(job, {
          ...job.latestStatus,
          phase: 'cancelled',
          computedPairs: response.computedPairs,
          totalPairs: response.totalPairs,
          provisional: job.provisional,
        });
        job.initial.reject(cancellation);
        job.background.reject(cancellation);
        this.rejectTn93Promotions(job, cancellation);
        this.finishTn93Job(job);
        break;
      }
      case 'ERROR':
        void this.handleTn93JobFailure(
          job,
          new Error(response.message),
          response.beforeInitial || !job.initialSettled
        );
        break;
    }
  }

  private handleTn93PlanReady(
    job: ActiveTn93DistanceJob,
    response: Tn93PlanReadyResponse
  ): void {
    job.plan = response;
    job.provisional = response.provisional;
    job.maxCoveredThreshold = Math.max(job.maxCoveredThreshold, response.threshold);
    this.emitTn93Status(job, {
      phase: 'foreground',
      runId: job.runId,
      loadGeneration: job.loadGeneration,
      inputSignature: job.inputSignature,
      threshold: response.threshold,
      computedPairs: 0,
      candidatePairs: response.candidatePairs,
      totalPairs: response.totalPairs,
      provisional: response.provisional,
      fallbackReason: response.fallbackReason,
    });
  }

  private async mergeAndAcknowledgeTn93Batch(
    job: ActiveTn93DistanceJob,
    response: Tn93DistanceBatchResponse
  ): Promise<void> {
    try {
      const mergedLinks = await job.options.onBatch({
        batchId: response.batchId,
        stage: response.stage,
        sources: response.sources,
        targets: response.targets,
        distances: response.distances,
      });
      if (
        response.stage === 'foreground'
        && typeof mergedLinks === 'number'
        && Number.isFinite(mergedLinks)
      ) {
        job.initialLinkCount += mergedLinks;
      }

      if (!this.isCurrentTn93Response(job, response)) {
        this.tn93CoordinatorTelemetry.staleResponses++;
        return;
      }

      const phase = response.stage === 'foreground'
        ? 'foreground'
        : response.stage === 'promoting'
          ? 'promoting'
          : 'background';
      this.emitTn93Status(job, {
        ...job.latestStatus,
        phase,
        computedPairs: Math.max(job.latestStatus.computedPairs, response.totalComputed),
        provisional: job.provisional,
      });
      this.postTn93Request(job, {
        type: 'ACK',
        runId: job.runId,
        loadGeneration: job.loadGeneration,
        inputSignature: job.inputSignature,
        batchId: response.batchId,
      });
    } catch (cause) {
      this.tn93CoordinatorTelemetry.batchMergeFailures++;
      void this.handleTn93JobFailure(
        job,
        this.asError(cause, `Unable to merge TN93 ${response.stage} batch ${response.batchId}.`),
        !job.initialSettled
      );
    }
  }

  private handleTn93InitialDone(
    job: ActiveTn93DistanceJob,
    response: Tn93InitialDoneResponse
  ): void {
    if (job.initialSettled) return;

    job.initialSettled = true;
    job.provisional = response.provisional;
    job.maxCoveredThreshold = Math.max(job.maxCoveredThreshold, response.threshold);

    const startBackground = () => {
      if (
        !response.provisional ||
        job.backgroundStarted ||
        job.finished ||
        this.activeTn93Job !== job
      ) {
        return;
      }

      job.backgroundStarted = true;
      this.emitTn93Status(job, {
        ...job.latestStatus,
        phase: 'background',
        provisional: true,
      });
      try {
        this.postTn93Request(job, {
          type: 'START_BACKGROUND',
          runId: job.runId,
          loadGeneration: job.loadGeneration,
          inputSignature: job.inputSignature,
        });
      } catch (cause) {
        void this.handleTn93JobFailure(
          job,
          this.asError(cause, 'Unable to start background TN93 computation.'),
          false
        );
      }
    };

    const result: SequenceLinkComputationResult = {
      runId: job.runId,
      loadGeneration: job.loadGeneration,
      inputSignature: job.inputSignature,
      initialComputedPairs: response.initialComputedPairs,
      initialLinkCount: job.initialLinkCount,
      candidatePairs: response.candidatePairs,
      deferredPairs: response.deferredPairs,
      totalPairs: response.totalPairs,
      provisional: response.provisional,
      fallbackReason: response.fallbackReason,
      timings: response.timings,
      startBackground,
      backgroundCompletion: job.background.promise,
    };

    this.emitTn93Status(job, {
      phase: response.provisional ? 'provisional' : 'complete',
      runId: job.runId,
      loadGeneration: job.loadGeneration,
      inputSignature: job.inputSignature,
      threshold: response.threshold,
      computedPairs: response.initialComputedPairs,
      candidatePairs: response.candidatePairs,
      totalPairs: response.totalPairs,
      provisional: response.provisional,
      fallbackReason: response.fallbackReason,
    });
    job.initial.resolve(result);

    if (!response.provisional) {
      this.completeTn93Job(job, {
        runId: job.runId,
        loadGeneration: job.loadGeneration,
        inputSignature: job.inputSignature,
        computedPairs: response.initialComputedPairs,
        totalPairs: response.totalPairs,
        correctedBelowThresholdLinks: 0,
        timings: response.computeTimings,
      });
    }
  }

  private handleTn93PromotionDone(
    job: ActiveTn93DistanceJob,
    response: Tn93PromotionDoneResponse
  ): void {
    const promotion = job.promotions.get(response.requestId);
    if (!promotion) {
      this.tn93CoordinatorTelemetry.staleResponses++;
      return;
    }

    job.promotions.delete(response.requestId);
    job.maxCoveredThreshold = Math.max(job.maxCoveredThreshold, response.threshold);

    const result: Tn93ThresholdPromotionResult = {
      runId: response.runId,
      loadGeneration: response.loadGeneration,
      inputSignature: response.inputSignature,
      threshold: response.threshold,
      promotedPairs: response.promotedPairs,
      computedPairs: response.computedPairs,
      candidatePairs: response.candidatePairs,
      totalPairs: response.totalPairs,
    };
    promotion.deferred.resolve(result);

    this.emitTn93Status(job, {
      phase: job.backgroundStarted ? 'background' : 'provisional',
      runId: job.runId,
      loadGeneration: job.loadGeneration,
      inputSignature: job.inputSignature,
      threshold: job.maxCoveredThreshold,
      computedPairs: response.computedPairs,
      candidatePairs: response.candidatePairs,
      totalPairs: response.totalPairs,
      provisional: true,
      fallbackReason: job.plan?.fallbackReason,
    });
  }

  private completeTn93Job(
    job: ActiveTn93DistanceJob,
    completion: Tn93DistanceCompletionResult
  ): void {
    if (job.finished) return;

    if (!job.initialSettled) {
      const plan = job.plan;
      const result: SequenceLinkComputationResult = {
        runId: job.runId,
        loadGeneration: job.loadGeneration,
        inputSignature: job.inputSignature,
        initialComputedPairs: completion.computedPairs,
        initialLinkCount: job.initialLinkCount,
        candidatePairs: plan?.candidatePairs ?? completion.totalPairs,
        deferredPairs: 0,
        totalPairs: completion.totalPairs,
        provisional: false,
        fallbackReason: plan?.fallbackReason,
        timings: plan?.timings ?? this.emptyTn93PlanTimings(),
        startBackground: () => undefined,
        backgroundCompletion: job.background.promise,
      };
      job.initialSettled = true;
      job.initial.resolve(result);
    }

    job.provisional = false;
    this.emitTn93Status(job, {
      phase: 'complete',
      runId: job.runId,
      loadGeneration: job.loadGeneration,
      inputSignature: job.inputSignature,
      threshold: job.maxCoveredThreshold,
      computedPairs: completion.computedPairs,
      candidatePairs: job.latestStatus.candidatePairs || completion.totalPairs,
      totalPairs: completion.totalPairs,
      provisional: false,
      fallbackReason: job.plan?.fallbackReason,
    });
    job.background.resolve(completion);
    this.resolveTn93PromotionsAtCompletion(job, completion);
    this.completedTn93Job = {
      completion,
      candidatePairs: job.latestStatus.candidatePairs || completion.totalPairs,
    };
    this.finishTn93Job(job);
  }

  private async handleTn93JobFailure(
    job: ActiveTn93DistanceJob,
    cause: Error,
    beforeInitial: boolean
  ): Promise<void> {
    if (job.finished || job.handlingFailure || this.activeTn93Job !== job) return;
    job.handlingFailure = true;

    if (beforeInitial && job.options.fallbackToExhaustive) {
      this.detachTn93Worker(job);
      try {
        const fallback = await job.options.fallbackToExhaustive(cause);
        if (job.finished || this.activeTn93Job !== job) return;
        this.validateExhaustiveFallback(job, fallback);

        const planTimings = this.planTimingsFromFallback(fallback.timings);
        const computeTimings = this.computeTimingsFromFallback(fallback.timings);
        const completion: Tn93DistanceCompletionResult = {
          runId: job.runId,
          loadGeneration: job.loadGeneration,
          inputSignature: job.inputSignature,
          computedPairs: fallback.computedPairs,
          totalPairs: fallback.totalPairs,
          correctedBelowThresholdLinks: 0,
          timings: computeTimings,
        };
        const result: SequenceLinkComputationResult = {
          runId: job.runId,
          loadGeneration: job.loadGeneration,
          inputSignature: job.inputSignature,
          initialComputedPairs: fallback.computedPairs,
          initialLinkCount: fallback.initialLinkCount,
          candidatePairs: fallback.totalPairs,
          deferredPairs: 0,
          totalPairs: fallback.totalPairs,
          provisional: false,
          timings: planTimings,
          startBackground: () => undefined,
          backgroundCompletion: job.background.promise,
        };

        job.initialSettled = true;
        job.provisional = false;
        this.emitTn93Status(job, {
          phase: 'complete',
          runId: job.runId,
          loadGeneration: job.loadGeneration,
          inputSignature: job.inputSignature,
          threshold: job.latestStatus.threshold,
          computedPairs: fallback.computedPairs,
          candidatePairs: fallback.totalPairs,
          totalPairs: fallback.totalPairs,
          provisional: false,
        });
        job.background.resolve(completion);
        job.initial.resolve(result);
        this.completedTn93Job = {
          completion,
          candidatePairs: fallback.totalPairs,
        };
        this.resolveTn93PromotionsAtCompletion(job, completion);
        this.finishTn93Job(job);
        return;
      } catch (fallbackCause) {
        cause = this.asError(fallbackCause, 'Exhaustive TN93 fallback failed.');
      }
    }

    this.emitTn93Status(job, {
      ...job.latestStatus,
      phase: 'error',
      provisional: job.provisional,
      error: cause.message,
    });
    job.initial.reject(cause);
    job.background.reject(cause);
    this.rejectTn93Promotions(job, cause);
    this.finishTn93Job(job);
  }

  private emitTn93Status(
    job: ActiveTn93DistanceJob,
    status: Tn93DistanceStatus
  ): void {
    job.latestStatus = status;
    try {
      job.options.onStatus?.({ ...status });
    } catch (cause) {
      console.error('TN93 distance status callback failed:', cause);
    }
  }

  private isCurrentTn93Response(
    job: ActiveTn93DistanceJob,
    response: Pick<Tn93WorkerResponse, 'runId' | 'loadGeneration' | 'inputSignature'>
  ): boolean {
    return !job.finished
      && this.activeTn93Job === job
      && response.runId === job.runId
      && response.loadGeneration === job.loadGeneration
      && response.inputSignature === job.inputSignature;
  }

  private tn93IdentityMatches(
    identity: { runId: number; loadGeneration: number; inputSignature: string },
    expected: Tn93DistanceJobIdentity
  ): boolean {
    return (expected.runId === undefined || expected.runId === identity.runId)
      && (expected.loadGeneration === undefined || expected.loadGeneration === identity.loadGeneration)
      && (expected.inputSignature === undefined || expected.inputSignature === identity.inputSignature);
  }

  private postTn93Request(job: ActiveTn93DistanceJob, request: Tn93WorkerRequest): void {
    if (
      job.finished ||
      this.activeTn93Job !== job ||
      request.runId !== job.runId ||
      request.loadGeneration !== job.loadGeneration ||
      request.inputSignature !== job.inputSignature
    ) {
      throw new Tn93StaleDistanceJobError();
    }
    job.worker.postMessage(request);
  }

  private buildNoopTn93PromotionResult(
    job: ActiveTn93DistanceJob,
    threshold: number
  ): Tn93ThresholdPromotionResult {
    return {
      runId: job.runId,
      loadGeneration: job.loadGeneration,
      inputSignature: job.inputSignature,
      threshold,
      promotedPairs: 0,
      computedPairs: job.latestStatus.computedPairs,
      candidatePairs: job.latestStatus.candidatePairs,
      totalPairs: job.latestStatus.totalPairs,
    };
  }

  private rejectTn93Promotions(job: ActiveTn93DistanceJob, reason: Error): void {
    job.promotions.forEach((promotion) => promotion.deferred.reject(reason));
    job.promotions.clear();
  }

  private resolveTn93PromotionsAtCompletion(
    job: ActiveTn93DistanceJob,
    completion: Tn93DistanceCompletionResult
  ): void {
    job.promotions.forEach((promotion) => {
      promotion.deferred.resolve({
        runId: completion.runId,
        loadGeneration: completion.loadGeneration,
        inputSignature: completion.inputSignature,
        threshold: promotion.threshold,
        promotedPairs: 0,
        computedPairs: completion.computedPairs,
        candidatePairs: completion.totalPairs,
        totalPairs: completion.totalPairs,
      });
    });
    job.promotions.clear();
  }

  private detachTn93Worker(job: ActiveTn93DistanceJob): void {
    job.worker.removeEventListener('message', job.messageHandler);
    job.worker.removeEventListener('error', job.errorHandler);
    this.computer.terminateTn93DistanceWorker();
  }

  private finishTn93Job(job: ActiveTn93DistanceJob): void {
    if (job.finished) return;
    job.finished = true;
    this.detachTn93Worker(job);
    if (this.activeTn93Job === job) {
      this.activeTn93Job = null;
    }
  }

  private validateExhaustiveFallback(
    job: ActiveTn93DistanceJob,
    fallback: ExhaustiveFallbackResult
  ): void {
    if (
      !fallback ||
      !Number.isFinite(fallback.computedPairs) ||
      !Number.isFinite(fallback.totalPairs) ||
      fallback.computedPairs !== fallback.totalPairs ||
      fallback.totalPairs !== job.latestStatus.totalPairs
    ) {
      throw new Error('Exhaustive TN93 fallback returned an incomplete distance matrix.');
    }
  }

  private emptyTn93PlanTimings(): Tn93PlanTimings {
    return {
      ambiguityMs: 0,
      consensusMs: 0,
      radialDistanceMs: 0,
      sortAndWindowMs: 0,
      totalPlanningMs: 0,
    };
  }

  private planTimingsFromFallback(_timings?: Partial<Tn93ComputeTimings>): Tn93PlanTimings {
    return this.emptyTn93PlanTimings();
  }

  private computeTimingsFromFallback(timings?: Partial<Tn93ComputeTimings>): Tn93ComputeTimings {
    return {
      foregroundMs: this.finiteTiming(timings?.foregroundMs ?? timings?.totalWorkerMs),
      backgroundMs: 0,
      promotionMs: 0,
      totalWorkerMs: this.finiteTiming(timings?.totalWorkerMs ?? timings?.foregroundMs),
      batches: this.finiteTiming(timings?.batches),
      payloadBytes: this.finiteTiming(timings?.payloadBytes),
      longTasks: this.finiteTiming(timings?.longTasks),
    };
  }

  private finiteTiming(value: number | undefined): number {
    return Number.isFinite(value) ? Number(value) : 0;
  }

  private asError(cause: unknown, fallbackMessage: string): Error {
    if (cause instanceof Error) return cause;
    if (typeof cause === 'string' && cause) return new Error(cause);
    return new Error(fallbackMessage);
  }

  /**
   * Rebuild old getDM logic. 
   * If session.data['newick'], parse. Otherwise build matrix from session.temp.matrix.
   */
  public getDM(session: any): Promise<any> {
    return new Promise(resolve => {
      const start = Date.now();
      let dm: any;

      if (session.data['newick']) {
        const treeObj = patristic.parseNewick(session.data['newick']);
        dm = treeObj.toMatrix();
      } else {
        let labels = session.data.nodes.map((d: any) => d._id).sort();
        const metric = session.style.widgets['link-sort-variable'];
        const n = labels.length;
        dm = new Array(n);

        for (let i = 0; i < n; i++) {
          dm[i] = new Array(n);
          dm[i][i] = 0;
          const source = labels[i];
          const row = session.temp.matrix[source];
          if (!row) {
            console.error(`Incompletely populated temp.matrix! Could not find: ${source}`);
            continue;
          }
          for (let j = 0; j < i; j++) {
            const link = row[labels[j]];
            if (link) {
              dm[i][j] = dm[j][i] = link[metric];
            } else {
              dm[i][j] = dm[j][i] = null;
            }
          }
        }
      }

      if (session.debugMode) {
        console.log(
          'DM Compute time: ',
          (Date.now() - start).toLocaleString(),
          'ms'
        );
      }
      resolve(dm);
    });
  }

  /**
   * Compute an NJ/UPGMA tree. 
   * We do the same patristic-based approach from the old code. 
   */
  public computeTree(session: any): Promise<any> {
    return new Promise(resolve => {
      if (session.temp.treeObj) {
        // If we already have a treeObj, just use it
        return resolve(session.temp.treeObj.toNewick());
      } else if (session.data['newick']) {
        // If we already have a newick string
        return resolve(session.data['newick']);
      } else {
        // Otherwise, build from DM
        this.getDM(session).then(dm => {
          const treeWorker = this.computer.getTreeWorker() as unknown as Worker;
          treeWorker.postMessage({
            labels: session.data.nodes.map((a: any) => a._id),
            matrix: dm,
            round: session.style.widgets["tree-round"]
          });

          const sub = this.fromWorker(treeWorker).subscribe(response => {
            const decoder = new TextDecoder('utf-8');
            const treeObjJSON = decoder.decode(new Uint8Array(response.data.tree));
            const treeString = patristic.parseJSON(treeObjJSON).toNewick();

            if (session.debugMode) {
              console.log(
                'Tree Transit time: ',
                (Date.now() - response.data.start).toLocaleString(),
                'ms'
              );
            }

            resolve(treeString);
            treeWorker.terminate();
            sub.unsubscribe();
          });
        });
      }
    });
  }

  /**
   * Compute directionality, flipping links if needed. 
   */
  public computeDirectionality(session: any): Promise<void> {
    return new Promise<void>(resolve => {
      const directionalityWorker = this.computer.getDirectionalityWorker() as unknown as Worker;
      directionalityWorker.postMessage({
        links: session.data.links,
        tree: session.temp.tree
      });

      const sub = this.fromWorker(directionalityWorker).subscribe(response => {
        const flips = new Uint8Array(response.data.output);

        if (session.debugMode) {
          console.log(
            'Directionality Transit time: ',
            (Date.now() - response.data.start).toLocaleString(),
            'ms'
          );
        }

        const start = Date.now();
        for (let i = 0; i < flips.length; i++) {
          if (flips[i]) {
            const fliplink = session.data.links[i];
            const fliptemp = fliplink.source;
            fliplink.source = fliplink.target;
            fliplink.target = fliptemp;
            fliplink.directed = true;
          }
        }

        if (session.debugMode) {
          console.log(
            'Directionality Integration time: ',
            (Date.now() - start).toLocaleString(),
            'ms'
          );
        }
        resolve();
        directionalityWorker.terminate();
        sub.unsubscribe();
      });
    });
  }

  /**
   * Compute MST, storing an nn:true property on any MST edges, like old code.
   */
  public computeMST(session: any, temp: any): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const mstWorker = this.computer.getMSTWorker() as unknown as Worker;
      mstWorker.postMessage({
        links: session.data.links,
        matrix: temp.matrix,
        epsilon: session.style.widgets["filtering-epsilon"],
        metric: session.style.widgets['link-sort-variable']
      });

      const sub = this.fromWorker(mstWorker).subscribe(response => {
        if (response.data === "Error") {
          return reject('MST washed out');
        }
        const output = new Uint8Array(response.data.links);
        if (session.debugMode) {
          console.log(
            'MST Transit time: ',
            (Date.now() - response.data.start).toLocaleString(),
            'ms'
          );
        }
        const start = Date.now();
        for (let i = 0; i < session.data.links.length; i++) {
          session.data.links[i].nn = output[i] ? true : false;
        }
        if (session.debugMode) {
          console.log(
            'MST Merge time: ',
            (Date.now() - start).toLocaleString(),
            'ms'
          );
        }
        resolve();
        mstWorker.terminate();
        sub.unsubscribe();
      });
    });
  }

  /**
   * Compute NN, storing nn:true on the nearest neighbor edges.
   */
  public computeNN(session: any, temp: any): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const nnWorker = this.computer.getNNWorker() as unknown as Worker;
      nnWorker.postMessage({
        links: session.data.links,
        matrix: temp.matrix,  // use temp.matrix (not session.temp)
        epsilon: session.style.widgets["filtering-epsilon"],
        metric: session.style.widgets["link-sort-variable"]
      });
  
      const sub = this.fromWorker(nnWorker).subscribe((response: MessageEvent<any>) => {
        if (response.data === 'Error') {
          return reject('Nearest Neighbor washed out');
        }
        const output = new Uint8Array(response.data.links);
  
        if (session.debugMode) {
          console.log(
            'NN Transit time: ',
            (Date.now() - response.data.start).toLocaleString(),
            'ms'
          );
        }
        const start = Date.now();
        // Loop over all links in session.data.links and update the nn property.
        for (let i = 0; i < session.data.links.length; i++) {
          session.data.links[i].nn = output[i] ? true : false;
        }
        if (session.debugMode) {
          console.log(
            'NN Merge time: ',
            (Date.now() - start).toLocaleString(),
            'ms'
          );
        }
        resolve();
        nnWorker.terminate();
        sub.unsubscribe();
      });
    });
  }

  // --- Phylogenetic Bootstrap Worker Pool -----------------------------------

  private phylogeneticBootstrapJobId = 0;
  private phylogeneticBootstrapWorkers: Worker[] = [];
  private phylogeneticBootstrapCancel: (() => void) | null = null;

  private terminatePhylogeneticBootstrapWorkers(): void {
    this.phylogeneticBootstrapWorkers.forEach(worker => {
      try {
        worker.terminate();
      } catch {
        // Ignore cleanup errors from already-terminated workers.
      }
    });
    this.phylogeneticBootstrapWorkers = [];
  }

  private chooseBootstrapWorkerCount(requestedReplicates: number, batchSize: number, workerCount?: number): number {
    const requestedWorkers = Math.round(Number(workerCount));
    if (Number.isFinite(requestedWorkers) && requestedWorkers > 0) {
      return Math.min(Math.ceil(requestedReplicates / batchSize), Math.max(1, requestedWorkers));
    }

    const hardwareConcurrency = typeof navigator !== 'undefined'
      ? Number(navigator.hardwareConcurrency || 0)
      : 0;
    const defaultWorkers = Number.isFinite(hardwareConcurrency) && hardwareConcurrency > 1
      ? Math.min(4, hardwareConcurrency - 1)
      : 2;

    return Math.min(Math.ceil(requestedReplicates / batchSize), Math.max(1, defaultWorkers));
  }

  public cancelPhylogeneticBootstrapJob(): void {
    const jobId = this.phylogeneticBootstrapJobId;
    this.phylogeneticBootstrapWorkers.forEach(worker => {
      try {
        worker.postMessage({ type: 'CANCEL', jobId } as PhylogeneticBootstrapWorkerRequest);
      } catch {
        // The worker may already be gone.
      }
    });

    if (this.phylogeneticBootstrapCancel) {
      this.phylogeneticBootstrapCancel();
    } else {
      this.terminatePhylogeneticBootstrapWorkers();
    }
  }

  public computePhylogeneticBootstrap(
    options: PhylogeneticBootstrapComputeOptions,
  ): Promise<PhylogeneticBootstrapComputeResult> {
    this.cancelPhylogeneticBootstrapJob();

    const labels = Array.isArray(options.labels) ? options.labels.map(label => String(label)) : [];
    const sequences = Array.isArray(options.sequences) ? options.sequences.map(sequence => String(sequence).toUpperCase()) : [];
    const baseSplitKeys = Array.isArray(options.baseSplitKeys) ? [...options.baseSplitKeys] : [];
    const requestedReplicates = normalizeBootstrapReplicateCount(options.replicates);
    const batchSize = Math.max(1, Math.min(50, Math.round(Number(options.batchSize) || 10)));
    const stabilityWindow = Math.max(1, Math.round(Number(options.stabilityWindow) || 100));
    const stabilityTolerancePercent = Number.isFinite(Number(options.stabilityTolerancePercent))
      ? Math.max(0, Number(options.stabilityTolerancePercent))
      : BOOTSTRAP_DEFAULT_STABILITY_TOLERANCE_PERCENT;

    if (labels.length !== sequences.length) {
      return Promise.reject(new Error('Bootstrap labels and sequences must have the same length.'));
    }
    if (labels.length < 3) {
      return Promise.reject(new Error('Bootstrap requires at least 3 taxa.'));
    }
    if (!baseSplitKeys.length) {
      return Promise.reject(new Error('The current tree has no internal splits that can receive bootstrap support.'));
    }

    const splitCounts: Record<string, number> = {};
    baseSplitKeys.forEach(key => { splitCounts[key] = 0; });

    const jobId = ++this.phylogeneticBootstrapJobId;
    const workerTotal = this.chooseBootstrapWorkerCount(requestedReplicates, batchSize, options.workerCount);
    const workers = Array.from({ length: workerTotal }, () => this.computer.getPhylogeneticBootstrapWorker());
    this.phylogeneticBootstrapWorkers = workers;

    return new Promise<PhylogeneticBootstrapComputeResult>((resolve, reject) => {
      let nextBatchId = 0;
      let remainingReplicates = requestedReplicates;
      let activeBatches = 0;
      let completedReplicates = 0;
      let settled = false;
      const snapshots: Array<{ replicates: number; support: Record<string, number> }> = [];

      const reportProgress = (stable: boolean, stoppedEarly: boolean): void => {
        const progress: PhylogeneticBootstrapProgress = {
          completedReplicates,
          requestedReplicates,
          progressPercent: Math.min(100, (completedReplicates / requestedReplicates) * 100),
          stoppedEarly,
          stable,
        };
        options.onProgress?.(progress);
      };

      const cleanup = (): void => {
        this.phylogeneticBootstrapCancel = null;
        this.terminatePhylogeneticBootstrapWorkers();
      };

      const finish = (stable: boolean, stoppedEarly: boolean): void => {
        if (settled) return;
        settled = true;
        const supportBySplitKey = supportPercentBySplitKey(baseSplitKeys, splitCounts, completedReplicates);
        cleanup();
        resolve({
          requestedReplicates,
          completedReplicates,
          stoppedEarly,
          stable,
          splitCounts: { ...splitCounts },
          supportBySplitKey,
        });
      };

      const fail = (error: Error): void => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };

      this.phylogeneticBootstrapCancel = () => fail(new Error('Bootstrap calculation cancelled.'));

      const maybeStopWhenStable = (): boolean => {
        if (!options.stopWhenStable || completedReplicates < stabilityWindow) {
          return false;
        }

        const currentSupport = buildSupportSnapshot(baseSplitKeys, splitCounts, completedReplicates);
        const previous = snapshots
          .filter(snapshot => snapshot.replicates > 0 && snapshot.replicates <= completedReplicates - stabilityWindow)
          .sort((a, b) => b.replicates - a.replicates)[0];

        snapshots.push({ replicates: completedReplicates, support: currentSupport });
        if (!previous) {
          return false;
        }

        return isSupportStable(baseSplitKeys, previous.support, currentSupport, stabilityTolerancePercent);
      };

      const dispatchNext = (worker: Worker): void => {
        if (settled || remainingReplicates <= 0) {
          if (!settled && activeBatches === 0 && completedReplicates >= requestedReplicates) {
            reportProgress(false, false);
            finish(false, false);
          }
          return;
        }

        const replicates = Math.min(batchSize, remainingReplicates);
        remainingReplicates -= replicates;
        activeBatches++;
        const batchId = ++nextBatchId;
        const seed = (Date.now() + jobId * 1000003 + batchId * 9176 + Math.floor(Math.random() * 0xffffffff)) >>> 0;

        worker.postMessage({
          type: 'RUN_BATCH',
          jobId,
          batchId,
          labels,
          sequences,
          baseSplitKeys,
          replicates,
          seed,
        } as PhylogeneticBootstrapWorkerRequest);
      };

      const handleBatchComplete = (worker: Worker, msg: PhylogeneticBootstrapBatchResponse): void => {
        activeBatches--;
        completedReplicates += msg.replicates;
        mergeSplitCounts(splitCounts, msg.splitCounts, baseSplitKeys);

        const stable = maybeStopWhenStable();
        const stoppedEarly = stable && completedReplicates < requestedReplicates;
        reportProgress(stable, stoppedEarly);

        if (stable) {
          finish(true, stoppedEarly);
          return;
        }

        if (remainingReplicates <= 0 && activeBatches === 0) {
          finish(false, false);
          return;
        }

        dispatchNext(worker);
      };

      const handleWorkerMessage = (worker: Worker, event: MessageEvent<PhylogeneticBootstrapWorkerResponse>): void => {
        const msg = event.data;
        if (!msg || msg.jobId !== jobId || settled) return;

        if (msg.type === 'ERROR') {
          const error = msg as PhylogeneticBootstrapErrorResponse;
          fail(new Error(error.message));
          return;
        }

        handleBatchComplete(worker, msg);
      };

      workers.forEach(worker => {
        worker.addEventListener('message', (event: MessageEvent<PhylogeneticBootstrapWorkerResponse>) => {
          handleWorkerMessage(worker, event);
        });
        worker.addEventListener('error', (error: ErrorEvent) => {
          fail(new Error(error.message || 'Phylogenetic bootstrap worker failed.'));
        });
      });

      reportProgress(false, false);
      workers.forEach(dispatchNext);
    });
  }

  public computeNetworkStatistics(request: NetworkStatisticsRequest): Promise<NetworkStatisticsResult> {
    return new Promise<NetworkStatisticsResult>((resolve, reject) => {
      const statisticsWorker = this.computer.getNetworkStatisticsWorker() as unknown as Worker;
      statisticsWorker.postMessage(request);

      const sub = this.fromWorker(statisticsWorker).subscribe({
        next: (response: MessageEvent<any>) => {
          try {
            const decoder = new TextDecoder('utf-8');
            const result = JSON.parse(decoder.decode(new Uint8Array(response.data.networkStatistics)));
            resolve(result);
          } catch (error) {
            reject(error);
          } finally {
            statisticsWorker.terminate();
            sub.unsubscribe();
          }
        },
        error: (error) => {
          reject(error);
          statisticsWorker.terminate();
          sub.unsubscribe();
        }
      });
    });
  }

  // ─── Patristic Distance Engine ───────────────────────────────────────────

  /** Currently active patristic job ID for cancellation. */
  private patristicJobId = 0;
  /** Leaf names from the last initialized tree (set by TREE_READY). */
  private patristicLeafNames: string[] = [];
  private patristicNewickString = '';
  private patristicGeneratedMaxThreshold = -Infinity;
  private patristicMaxDistance = Infinity;
  private patristicOrigin: string[] = ['Newick Tree'];
  private patristicDistanceOrigin = 'Newick Tree';
  private patristicTreeInitCount = 0;
  private patristicGuardrailFallbackThresholds = new Set<string>();

  private recordPatristicPerformance(session: any, patch: any): void {
    if (!session?.meta) return;
    if (!session.meta.performance) {
      session.meta.performance = {};
    }

    const current = session.meta.performance.patristic || {};
    session.meta.performance.patristic = {
      ...current,
      ...patch,
      treeInitCount: this.patristicTreeInitCount,
      updatedAt: Date.now(),
    };
  }

  private treeReadyTelemetry(treeReady: PatristicTreeReadyResponse): any {
    return {
      leafCount: treeReady.leafCount,
      nodeCount: treeReady.nodeCount,
      maxDistance: treeReady.maxDistance,
      maxRootDepth: treeReady.maxRootDepth,
      timings: treeReady.timings,
    };
  }

  private getPatristicVisibleEdgeGuardrails(session?: any): PatristicVisibleEdgeGuardrails {
    const overrides = session?.meta?.guardrails || {};
    const overrideWarning = Number(overrides.newickVisibleLinkWarningThreshold);
    const overrideHardLimit = Number(overrides.newickVisibleLinkHardLimit);
    const hardLimit = Number.isFinite(overrideHardLimit) && overrideHardLimit > 0
      ? Math.floor(overrideHardLimit)
      : DEFAULT_NEWICK_VISIBLE_LINK_HARD_LIMIT;
    const warningThreshold = Number.isFinite(overrideWarning) && overrideWarning > 0
      ? Math.floor(overrideWarning)
      : DEFAULT_NEWICK_VISIBLE_LINK_WARNING_THRESHOLD;

    return {
      hardLimit,
      warningThreshold: Math.min(warningThreshold, hardLimit),
    };
  }

  private formatCount(value: number): string {
    return Math.floor(value).toLocaleString();
  }

  private buildPatristicGuardrailResult(
    threshold: number,
    matchedEdgeCount: number,
    guardrails: PatristicVisibleEdgeGuardrails,
    hardLimitHit: boolean,
  ): PatristicGuardrailResult | undefined {
    const warningHit = hardLimitHit || matchedEdgeCount >= guardrails.warningThreshold;
    if (!warningHit) return undefined;

    const message = hardLimitHit
      ? `Newick threshold ${threshold} exceeded the ${this.formatCount(guardrails.hardLimit)} visible-link browser guardrail. MicrobeTrace did not add the additional Newick links for this threshold; lower the threshold, filter the network, or subset the tree before rendering.`
      : `Newick threshold ${threshold} produced ${this.formatCount(matchedEdgeCount)} visible links, which may render slowly in the browser. Consider filtering, subsetting, or using a stricter threshold.`;

    return {
      warningThreshold: guardrails.warningThreshold,
      hardLimit: guardrails.hardLimit,
      matchedEdgeCount,
      warningHit,
      hardLimitHit,
      threshold,
      message,
    };
  }

  private clearPatristicGuardrailWarnings(session: any, thresholdToKeep?: number): void {
    if (!session || !Array.isArray(session.warnings)) return;

    session.warnings = session.warnings.filter((warning: any) => {
      if (warning?.type !== 'newick-visible-link-guardrail') {
        return true;
      }

      return thresholdToKeep !== undefined && Number(warning.threshold) === Number(thresholdToKeep);
    });
  }

  private recordPatristicGuardrailWarning(session: any, guardrail?: PatristicGuardrailResult): void {
    if (!session || !guardrail?.message) {
      this.clearPatristicGuardrailWarnings(session);
      return;
    }

    if (!Array.isArray(session.warnings)) {
      session.warnings = [];
    }

    const id = `newick-visible-link-guardrail-${guardrail.threshold}-${guardrail.hardLimit}`;
    const existingIndex = session.warnings.findIndex((warning: any) => warning?.id === id);
    const warning = {
      id,
      type: 'newick-visible-link-guardrail',
      severity: guardrail.hardLimitHit ? 'error' : 'warning',
      message: guardrail.message,
      threshold: guardrail.threshold,
      matchedEdgeCount: guardrail.matchedEdgeCount,
      warningThreshold: guardrail.warningThreshold,
      hardLimit: guardrail.hardLimit,
      hardLimitHit: guardrail.hardLimitHit,
      fallbackApplied: guardrail.fallbackApplied,
      fallbackLinkCount: guardrail.fallbackLinkCount,
      fallbackType: guardrail.fallbackType,
      updatedAt: Date.now(),
    };

    if (existingIndex >= 0) {
      session.warnings[existingIndex] = warning;
    } else {
      session.warnings.push(warning);
    }
  }

  private getPatristicNearestNeighborEpsilon(session?: any): number {
    const rawEpsilon = Number(session?.style?.widgets?.["filtering-epsilon"]);
    return Number.isFinite(rawEpsilon) ? Math.pow(10, rawEpsilon) : 0;
  }

  private buildPatristicGuardrailFallbackKey(
    threshold: number,
    distanceOrigin: string,
    hardLimit: number
  ): string {
    return `${distanceOrigin}|${threshold}|${hardLimit}`;
  }

  private linkHasDistanceOrigin(link: any, distanceOrigin: string): boolean {
    if (!link?.hasDistance) {
      return false;
    }

    if (link.distanceOrigin === distanceOrigin) {
      return true;
    }

    return Array.isArray(link.distanceOrigins) && link.distanceOrigins.includes(distanceOrigin);
  }

  private hasExistingPatristicDistanceLinks(session: any, distanceOrigin: string): boolean {
    return Array.isArray(session?.data?.links)
      && session.data.links.some((link: any) => this.linkHasDistanceOrigin(link, distanceOrigin));
  }

  private async mergePatristicNearestNeighborBackbone(
    addLink: (link: any, check: any) => number,
    filterXSS: (s: string) => string,
    session?: any,
    options: ComputePatristicOptions = {}
  ): Promise<NonNullable<PatristicMergeResult['fallback']>> {
    const leafNames = this.patristicLeafNames.map(filterXSS);
    const origin = options.origin?.length ? options.origin : this.patristicOrigin;
    const distanceOrigin = options.distanceOrigin || this.patristicDistanceOrigin;
    const check = options.check ?? true;
    const epsilon = this.getPatristicNearestNeighborEpsilon(session);

    return new Promise((resolve, reject) => {
      let newLinks = 0;
      let totalLinks = 0;
      let selectedLinks = 0;
      let finalTimings: PatristicNearestNeighborBatchResponse['timings'] | undefined;

      this.buildPatristicNearestNeighborEdges(epsilon, options.batchSize).subscribe({
        next: (batch) => {
          const n = batch.sources.length;
          for (let k = 0; k < n; k++) {
            newLinks += addLink({
              source: leafNames[batch.sources[k]],
              target: leafNames[batch.targets[k]],
              origin: [...origin],
              distance: batch.distances[k],
              distanceOrigin,
              hasDistance: true,
              nn: true,
            }, check);
            totalLinks++;
            selectedLinks++;
          }
          if (batch.done) {
            finalTimings = batch.timings;
          }
        },
        error: (err) => reject(err),
        complete: () => {
          resolve({
            type: 'nearest-neighbor-backbone',
            newLinks,
            totalLinks,
            selectedLinks,
            epsilon,
            timings: finalTimings,
          });
        },
      });
    });
  }

  private getPatristicThresholdAnalysisPairLimit(session?: any): number {
    const overrideLimit = Number(session?.meta?.guardrails?.newickThresholdAnalysisPairLimit);
    return Number.isFinite(overrideLimit) && overrideLimit > 0
      ? Math.floor(overrideLimit)
      : DEFAULT_NEWICK_THRESHOLD_ANALYSIS_PAIR_LIMIT;
  }

  /**
   * Initialize the patristic engine with a Newick string.
   * This preprocesses the tree (flatten, LCA build) in the worker.
   * The preprocessing is cached in the worker across threshold changes.
   *
   * @returns Promise that resolves with tree metadata when ready.
   */
  public initPatristicTree(newickString: string): Promise<PatristicTreeReadyResponse> {
    return new Promise((resolve, reject) => {
      const worker = this.computer.getPatristicWorker();
      const jobId = ++this.patristicJobId;

      const handler = (event: MessageEvent<PatristicWorkerResponse>) => {
        const msg = event.data;
        if (msg.jobId !== jobId) return;

        switch (msg.type) {
          case 'TREE_READY':
            this.patristicLeafNames = msg.leafNames;
            this.patristicNewickString = newickString;
            this.patristicGeneratedMaxThreshold = -Infinity;
            this.patristicMaxDistance = Number.isFinite(msg.maxDistance) ? msg.maxDistance : Infinity;
            this.patristicGuardrailFallbackThresholds.clear();
            this.patristicTreeInitCount++;
            worker.removeEventListener('message', handler);
            resolve(msg);
            break;
          case 'ERROR':
            worker.removeEventListener('message', handler);
            reject(new Error(msg.message));
            break;
          // Ignore PROGRESS for now
        }
      };

      worker.addEventListener('message', handler);
      worker.postMessage({
        type: 'INIT_TREE',
        jobId,
        newickString,
      } as PatristicWorkerRequest);
    });
  }

  public async ensurePatristicTreeInitialized(newickString: string, session?: any): Promise<string[]> {
    if (typeof newickString !== 'string' || newickString.trim().length === 0) {
      throw new Error('No Newick tree is available for pairwise distance calculation.');
    }

    if (newickString !== this.patristicNewickString || this.patristicLeafNames.length === 0) {
      const treeReady = await this.initPatristicTree(newickString);
      this.recordPatristicPerformance(session, {
        treeReady: this.treeReadyTelemetry(treeReady),
      });
    }

    return [...this.patristicLeafNames];
  }

  /**
   * Request thresholded patristic edges from the worker.
   * The tree must have been initialized via initPatristicTree() first.
   *
   * Streams edge batches as an Observable. Each batch contains:
   * - sources: Uint32Array of leaf indices
   * - targets: Uint32Array of leaf indices
   * - distances: Float32Array of patristic distances
   * - done: boolean indicating if this is the last batch
   *
   * Use getPatristicLeafNames() to map leaf indices to node IDs.
   *
   * @param threshold - Maximum patristic distance to include
   * @param maxEdges - Optional cap on total edges
   * @param batchSize - Edges per batch (default 10000)
   * @returns Observable of edge batches
   */
  public buildPatristicEdges(
    threshold: number,
    maxEdges?: number,
    batchSize?: number
  ): Observable<PatristicEdgeBatchResponse> {
    const subject = new Subject<PatristicEdgeBatchResponse>();
    const worker = this.computer.getPatristicWorker();
    const jobId = ++this.patristicJobId;

    const handler = (event: MessageEvent<PatristicWorkerResponse>) => {
      const msg = event.data;
      if (msg.jobId !== jobId) return;

      switch (msg.type) {
        case 'EDGE_BATCH':
          subject.next(msg);
          if (msg.done) {
            worker.removeEventListener('message', handler);
            subject.complete();
          }
          break;
        case 'ERROR':
          worker.removeEventListener('message', handler);
          subject.error(new Error(msg.message));
          break;
        // Ignore PROGRESS for now (can be added to a separate subject)
      }
    };

    worker.addEventListener('message', handler);
    worker.postMessage({
      type: 'BUILD_EDGES',
      jobId,
      threshold,
      maxEdges,
      batchSize,
    } as PatristicWorkerRequest);

    return subject.asObservable();
  }

  public buildPatristicNearestNeighborEdges(
    epsilon: number,
    batchSize?: number
  ): Observable<PatristicNearestNeighborBatchResponse> {
    const subject = new Subject<PatristicNearestNeighborBatchResponse>();
    const worker = this.computer.getPatristicWorker();
    const jobId = ++this.patristicJobId;

    const handler = (event: MessageEvent<PatristicWorkerResponse>) => {
      const msg = event.data;
      if (msg.jobId !== jobId) return;

      switch (msg.type) {
        case 'NN_EDGE_BATCH':
          subject.next(msg);
          if (msg.done) {
            worker.removeEventListener('message', handler);
            subject.complete();
          }
          break;
        case 'ERROR':
          worker.removeEventListener('message', handler);
          subject.error(new Error(msg.message));
          break;
        // Ignore PROGRESS for now
      }
    };

    worker.addEventListener('message', handler);
    worker.postMessage({
      type: 'BUILD_NEAREST_NEIGHBOR_EDGES',
      jobId,
      epsilon,
      batchSize,
    } as PatristicWorkerRequest);

    return subject.asObservable();
  }

  public setPatristicMetadata(origin?: string[], distanceOrigin?: string): void {
    if (origin?.length) {
      this.patristicOrigin = [...origin];
    }
    if (distanceOrigin) {
      this.patristicDistanceOrigin = distanceOrigin;
    }
  }

  private async mergePatristicEdges(
    threshold: number,
    addLink: (link: any, check: any) => number,
    filterXSS: (s: string) => string,
    session?: any,
    options: ComputePatristicOptions = {}
  ): Promise<PatristicMergeResult> {
    const leafNames = this.patristicLeafNames.map(filterXSS);
    const origin = options.origin?.length ? options.origin : this.patristicOrigin;
    const distanceOrigin = options.distanceOrigin || this.patristicDistanceOrigin;
    const check = options.check ?? true;
    const edgeStart = Date.now();
    const guardrails = this.getPatristicVisibleEdgeGuardrails(session);
    const usingGuardrailLimit = options.maxEdges === undefined;
    const effectiveMaxEdges = usingGuardrailLimit ? guardrails.hardLimit + 1 : options.maxEdges;

    return new Promise((resolve, reject) => {
      let newLinks = 0;
      let totalLinks = 0;
      let finalTimings: PatristicEdgeBatchResponse['timings'] | undefined;
      const pendingLinks: any[] = [];

      this.buildPatristicEdges(threshold, effectiveMaxEdges, options.batchSize).subscribe({
        next: (batch) => {
          const n = batch.sources.length;
          for (let k = 0; k < n; k++) {
            const sourceIdx = batch.sources[k];
            const targetIdx = batch.targets[k];
            pendingLinks.push({
              source: leafNames[sourceIdx],
              target: leafNames[targetIdx],
              origin: [...origin],
              distance: batch.distances[k],
              distanceOrigin,
              hasDistance: true,
            });
          }
          if (batch.done) {
            finalTimings = batch.timings;
          }
        },
        error: (err) => reject(err),
        complete: async () => {
          const matchedEdgeCount = finalTimings?.emittedEdgeCount ?? pendingLinks.length;
          const hardLimitHit =
            (usingGuardrailLimit && Boolean(finalTimings?.maxEdgesHit)) ||
            matchedEdgeCount > guardrails.hardLimit;
          let guardrail = this.buildPatristicGuardrailResult(
            threshold,
            matchedEdgeCount,
            guardrails,
            hardLimitHit,
          );
          let fallback: PatristicMergeResult['fallback'];

          if (!hardLimitHit) {
            for (const link of pendingLinks) {
              newLinks += addLink(link, check);
              totalLinks++;
            }
            this.patristicGeneratedMaxThreshold = Math.max(
              this.patristicGeneratedMaxThreshold,
              threshold
            );
          } else if (!this.hasExistingPatristicDistanceLinks(session, distanceOrigin)) {
            try {
              fallback = await this.mergePatristicNearestNeighborBackbone(
                addLink,
                filterXSS,
                session,
                options
              );
              newLinks = fallback.newLinks;
              totalLinks = fallback.totalLinks;
              this.patristicGuardrailFallbackThresholds.add(
                this.buildPatristicGuardrailFallbackKey(threshold, distanceOrigin, guardrails.hardLimit)
              );

              if (guardrail) {
                guardrail = {
                  ...guardrail,
                  fallbackApplied: true,
                  fallbackLinkCount: fallback.totalLinks,
                  fallbackType: fallback.type,
                  message: `${guardrail.message} MicrobeTrace rendered a nearest-neighbor tree backbone instead so the 2D network is not blank.`,
                };
              }
            } catch (fallbackError) {
              reject(fallbackError);
              return;
            }
          }

          this.recordPatristicGuardrailWarning(session, guardrail);

          if (session?.debugMode) {
            console.log(
              'Patristic edge generation + merge time:',
              (Date.now() - edgeStart).toLocaleString(),
              'ms',
              `(${totalLinks} edges added below threshold ${threshold}${fallback ? ' via nearest-neighbor fallback' : ''})`
            );
          }
          this.recordPatristicPerformance(session, {
            edgeGeneration: {
              threshold,
              newLinks,
              totalLinks,
              matchedEdgeCount,
              mergeMs: Date.now() - edgeStart,
              timings: finalTimings,
              guardrail,
              fallback,
            },
          });
          resolve({ newLinks, totalLinks, leafNames, guardrail, fallback });
        },
      });
    });
  }

  /**
   * Convenience method: Initialize tree and build edges in one call.
   * Returns all qualifying edges as flat arrays once complete.
   *
   * This is the main integration point for files-plugin.component.ts.
   *
   * @param newickString - Newick format tree string
   * @param threshold - Maximum patristic distance to include
   * @param addLink - Callback to add each link to session (CommonService.addLink)
   * @param filterXSS - Callback to sanitize leaf names
   * @param session - Session object for debug logging
   * @returns Promise resolving to { newLinks, totalLinks, leafNames }
   */
  public async computePatristicEdges(
    newickString: string,
    threshold: number,
    addLink: (link: any, check: any) => number,
    filterXSS: (s: string) => string,
    session?: any,
    options: ComputePatristicOptions = {}
  ): Promise<PatristicMergeResult & { treeReady: PatristicTreeReadyResponse }> {
    const start = Date.now();
    this.setPatristicMetadata(options.origin, options.distanceOrigin);

    // Step 1: Initialize tree (flatten + LCA)
    const treeReady = await this.initPatristicTree(newickString);
    this.recordPatristicPerformance(session, {
      treeReady: this.treeReadyTelemetry(treeReady),
    });

    if (session?.debugMode) {
      console.log(
        'Patristic tree preprocessing time:',
        (Date.now() - start).toLocaleString(),
        'ms',
        `(${treeReady.leafCount} leaves, ${treeReady.nodeCount} nodes)`
      );
    }

    // Step 2: Stream thresholded edges
    const merged = await this.mergePatristicEdges(
      threshold,
      addLink,
      filterXSS,
      session,
      { ...options, check: options.check ?? false }
    );
    return { ...merged, treeReady };
  }

  public async computePatristicNearestNeighborEdges(
    newickString: string,
    addLink: (link: any, check: any) => number,
    filterXSS: (s: string) => string,
    session: any,
    temp: any,
    options: ComputePatristicOptions = {}
  ): Promise<PatristicNearestNeighborMergeResult & { treeReady?: PatristicTreeReadyResponse }> {
    if (!newickString) {
      return {
        newLinks: 0,
        totalLinks: 0,
        selectedLinks: 0,
        leafNames: [],
      };
    }

    const start = Date.now();
    const isCurrent = () => !options.isCurrent || options.isCurrent();
    if (!isCurrent()) {
      throw new Error('Discarded stale patristic nearest-neighbor computation.');
    }
    this.setPatristicMetadata(options.origin, options.distanceOrigin);

    let treeReady: PatristicTreeReadyResponse | undefined;
    if (newickString !== this.patristicNewickString || this.patristicLeafNames.length === 0) {
      treeReady = await this.initPatristicTree(newickString);
      if (!isCurrent()) {
        throw new Error('Discarded stale patristic nearest-neighbor computation.');
      }
      this.recordPatristicPerformance(session, {
        treeReady: this.treeReadyTelemetry(treeReady),
      });
    }

    const leafNames = this.patristicLeafNames.map(filterXSS);
    const origin = options.origin?.length ? options.origin : this.patristicOrigin;
    const distanceOrigin = options.distanceOrigin || this.patristicDistanceOrigin;
    const check = options.check ?? true;
    const rawEpsilon = Number(session?.style?.widgets?.["filtering-epsilon"]);
    const epsilon = Number.isFinite(rawEpsilon) ? Math.pow(10, rawEpsilon) : 0;

    if (!isCurrent()) {
      throw new Error('Discarded stale patristic nearest-neighbor computation.');
    }
    for (const link of session?.data?.links || []) {
      link.nn = false;
    }

    return new Promise((resolve, reject) => {
      let newLinks = 0;
      let totalLinks = 0;
      let selectedLinks = 0;
      let finalTimings: PatristicNearestNeighborBatchResponse['timings'] | undefined;
      let settled = false;
      let subscription: any;
      const fail = (error: any) => {
        if (settled) return;
        settled = true;
        subscription?.unsubscribe();
        reject(error instanceof Error ? error : new Error(String(error)));
      };

      subscription = this.buildPatristicNearestNeighborEdges(epsilon, options.batchSize).subscribe({
        next: (batch) => {
          if (!isCurrent()) {
            fail(new Error('Discarded stale patristic nearest-neighbor result.'));
            return;
          }
          const n = batch.sources.length;
          for (let k = 0; k < n; k++) {
            const source = leafNames[batch.sources[k]];
            const target = leafNames[batch.targets[k]];
            const link = {
              source,
              target,
              origin: [...origin],
              distance: batch.distances[k],
              distanceOrigin,
              hasDistance: true,
            };
            newLinks += addLink(link, check);
            totalLinks++;
            selectedLinks++;

            const normalizedLink =
              temp?.matrix?.[source]?.[target] ??
              temp?.matrix?.[target]?.[source];
            if (normalizedLink) {
              normalizedLink.nn = true;
            }
          }
          if (batch.done) {
            finalTimings = batch.timings;
          }
        },
        error: (err) => fail(err),
        complete: () => {
          if (settled) return;
          if (!isCurrent()) {
            fail(new Error('Discarded stale patristic nearest-neighbor result.'));
            return;
          }
          if (session?.debugMode) {
            console.log(
              'Patristic nearest-neighbor generation + merge time:',
              (Date.now() - start).toLocaleString(),
              'ms',
              `(${selectedLinks} selected Newick edges)`
            );
          }
          this.recordPatristicPerformance(session, {
            nearestNeighbor: {
              epsilon,
              newLinks,
              totalLinks,
              selectedLinks,
              mergeMs: Date.now() - start,
              timings: finalTimings,
            },
          });
          settled = true;
          subscription?.unsubscribe();
          resolve({ newLinks, totalLinks, selectedLinks, leafNames, treeReady });
        },
      });
    });
  }

  public async ensurePatristicEdgesForThreshold(
    threshold: number,
    addLink: (link: any, check: any) => number,
    filterXSS: (s: string) => string,
    session?: any,
    options: ComputePatristicOptions & { newickString?: string } = {}
  ): Promise<PatristicMergeResult | null> {
    const newickString = options.newickString || this.patristicNewickString;
    if (!newickString || !Number.isFinite(threshold) || threshold < 0) {
      return null;
    }

    this.setPatristicMetadata(options.origin, options.distanceOrigin);
    const distanceOrigin = options.distanceOrigin || this.patristicDistanceOrigin;
    const guardrails = this.getPatristicVisibleEdgeGuardrails(session);
    const fallbackKey = this.buildPatristicGuardrailFallbackKey(
      threshold,
      distanceOrigin,
      guardrails.hardLimit
    );

    if (newickString !== this.patristicNewickString || this.patristicLeafNames.length === 0) {
      const treeReady = await this.initPatristicTree(newickString);
      this.recordPatristicPerformance(session, {
        treeReady: this.treeReadyTelemetry(treeReady),
      });
    }

    if (
      this.patristicGuardrailFallbackThresholds.has(fallbackKey) &&
      this.hasExistingPatristicDistanceLinks(session, distanceOrigin)
    ) {
      return {
        newLinks: 0,
        totalLinks: 0,
        leafNames: this.patristicLeafNames.map(filterXSS),
      };
    }

    const generatedAllKnownDistances =
      Number.isFinite(this.patristicMaxDistance) &&
      this.patristicGeneratedMaxThreshold >= this.patristicMaxDistance;

    if (generatedAllKnownDistances || threshold <= this.patristicGeneratedMaxThreshold) {
      this.clearPatristicGuardrailWarnings(session, threshold);
      return {
        newLinks: 0,
        totalLinks: 0,
        leafNames: this.patristicLeafNames.map(filterXSS),
      };
    }

    return this.mergePatristicEdges(
      threshold,
      addLink,
      filterXSS,
      session,
      { ...options, check: options.check ?? true }
    );
  }

  public collectPatristicDistanceAnalysisEdges(
    session?: any,
    options: CollectPatristicDistanceAnalysisOptions = {}
  ): Promise<PatristicDistanceAnalysisResult> {
    const leafCount = this.patristicLeafNames.length;
    const totalPairs = (leafCount * (leafCount - 1)) / 2;
    const maxPairs = options.bypassPairLimit
      ? Number.POSITIVE_INFINITY
      : Number.isFinite(Number(options.maxPairs))
      ? Number(options.maxPairs)
      : this.getPatristicThresholdAnalysisPairLimit(session);

    if (!leafCount || totalPairs <= 0) {
      options.onProgress?.({ completedPairs: totalPairs, totalPairs, percent: 100 });
      return Promise.resolve({ edges: [], totalPairs, skipped: false });
    }

    if (totalPairs > maxPairs) {
      return Promise.resolve({
        edges: [],
        totalPairs,
        skipped: true,
        skipReason: `Newick threshold analysis skipped ${this.formatCount(totalPairs)} pairwise distances above the ${this.formatCount(maxPairs)} analysis limit.`,
      });
    }

    return new Promise((resolve, reject) => {
      const edges: PatristicAnalysisEdge[] = [];
      options.onProgress?.({ completedPairs: 0, totalPairs, percent: 0 });

      this.buildPatristicEdges(Number.POSITIVE_INFINITY, totalPairs + 1, options.batchSize).subscribe({
        next: (batch) => {
          const n = batch.sources.length;
          for (let k = 0; k < n; k++) {
            edges.push({
              sourceIndex: batch.sources[k],
              targetIndex: batch.targets[k],
              value: batch.distances[k],
            });
          }
          options.onProgress?.({
            completedPairs: edges.length,
            totalPairs,
            percent: Math.min(100, Math.floor((edges.length / totalPairs) * 100)),
          });
        },
        error: (err) => reject(err),
        complete: () => resolve({ edges, totalPairs, skipped: false }),
      });
    });
  }

  /**
   * Cancel any active patristic computation.
   */
  public cancelPatristicJob(): void {
    const worker = this.computer.getPatristicWorker();
    worker.postMessage({
      type: 'CANCEL',
      jobId: this.patristicJobId,
    } as PatristicWorkerRequest);
  }

  /**
   * Get leaf names from the last initialized patristic tree.
   * Useful for mapping leaf indices in edge batches to node IDs.
   */
  public getPatristicLeafNames(): string[] {
    return this.patristicLeafNames;
  }

  /**
   * Terminate the patristic worker entirely.
   * Call when loading a new session or cleaning up.
   */
  public terminatePatristicWorker(): void {
    this.computer.terminatePatristicWorker();
    this.patristicLeafNames = [];
    this.patristicNewickString = '';
    this.patristicGeneratedMaxThreshold = -Infinity;
    this.patristicMaxDistance = Infinity;
    this.patristicGuardrailFallbackThresholds.clear();
    this.patristicTreeInitCount = 0;
  }
}
