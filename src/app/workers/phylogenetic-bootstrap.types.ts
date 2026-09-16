export interface PhylogeneticBootstrapBatchRequest {
  type: 'RUN_BATCH';
  jobId: number;
  batchId: number;
  labels: string[];
  sequences: string[];
  baseSplitKeys: string[];
  replicates: number;
  seed: number;
}

export interface PhylogeneticBootstrapCancelRequest {
  type: 'CANCEL';
  jobId: number;
}

export type PhylogeneticBootstrapWorkerRequest =
  | PhylogeneticBootstrapBatchRequest
  | PhylogeneticBootstrapCancelRequest;

export interface PhylogeneticBootstrapBatchResponse {
  type: 'BATCH_COMPLETE';
  jobId: number;
  batchId: number;
  replicates: number;
  splitCounts: Record<string, number>;
  computeDurationMs: number;
}

export interface PhylogeneticBootstrapErrorResponse {
  type: 'ERROR';
  jobId: number;
  batchId?: number;
  message: string;
}

export type PhylogeneticBootstrapWorkerResponse =
  | PhylogeneticBootstrapBatchResponse
  | PhylogeneticBootstrapErrorResponse;

export interface PhylogeneticBootstrapProgress {
  completedReplicates: number;
  requestedReplicates: number;
  progressPercent: number;
  stoppedEarly: boolean;
  stable: boolean;
}

export interface PhylogeneticBootstrapComputeOptions {
  labels: string[];
  sequences: string[];
  baseSplitKeys: string[];
  replicates: number;
  stopWhenStable: boolean;
  batchSize?: number;
  workerCount?: number;
  stabilityWindow?: number;
  stabilityTolerancePercent?: number;
  onProgress?: (progress: PhylogeneticBootstrapProgress) => void;
}

export interface PhylogeneticBootstrapComputeResult {
  requestedReplicates: number;
  completedReplicates: number;
  stoppedEarly: boolean;
  stable: boolean;
  splitCounts: Record<string, number>;
  supportBySplitKey: Record<string, number>;
}
