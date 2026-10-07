/// <reference lib="webworker" />

import * as patristic from 'patristic';
import {
  countMatchingTreeSplits,
  mergeSplitCounts,
} from './phylogenetic-bootstrap-utils';
import type {
  PhylogeneticBootstrapBatchRequest,
  PhylogeneticBootstrapWorkerRequest,
  PhylogeneticBootstrapWorkerResponse,
} from './phylogenetic-bootstrap.types';

const cancelledJobs = new Set<number>();

function createPrng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function postResponse(response: PhylogeneticBootstrapWorkerResponse): void {
  postMessage(response);
}

function validateBatch(request: PhylogeneticBootstrapBatchRequest): void {
  if (!Array.isArray(request.labels) || !Array.isArray(request.sequences)) {
    throw new Error('Bootstrap worker requires labels and sequences.');
  }
  if (request.labels.length !== request.sequences.length) {
    throw new Error('Bootstrap labels and sequences must have the same length.');
  }
  if (request.labels.length < 3) {
    throw new Error('Bootstrap requires at least 3 taxa.');
  }
  if (!request.baseSplitKeys.length) {
    throw new Error('The current tree has no internal splits that can receive bootstrap support.');
  }

  const sequenceLength = request.sequences[0]?.length ?? 0;
  if (sequenceLength === 0) {
    throw new Error('Bootstrap requires non-empty aligned sequences.');
  }

  request.sequences.forEach((sequence, index) => {
    if (typeof sequence !== 'string' || sequence.length !== sequenceLength) {
      throw new Error(`Sequence ${request.labels[index] || index} does not match the alignment length.`);
    }
  });
}

function sampleColumns(sequenceLength: number, random: () => number): Int32Array {
  const columns = new Int32Array(sequenceLength);
  for (let i = 0; i < sequenceLength; i++) {
    columns[i] = Math.floor(random() * sequenceLength);
  }
  return columns;
}

function bootstrapSnpDistance(source: string, target: string, columns: Int32Array): number {
  let distance = 0;
  for (let i = 0; i < columns.length; i++) {
    const position = columns[i];
    const sourceChar = source.charCodeAt(position);
    const targetChar = target.charCodeAt(position);
    if (sourceChar !== targetChar && sourceChar !== 45 && targetChar !== 45) {
      distance++;
    }
  }
  return distance;
}

function buildBootstrapMatrix(sequences: string[], columns: Int32Array): number[][] {
  const n = sequences.length;
  const matrix: number[][] = new Array(n);
  for (let i = 0; i < n; i++) {
    matrix[i] = new Array(n);
    matrix[i][i] = 0;
  }

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < i; j++) {
      const distance = bootstrapSnpDistance(sequences[i], sequences[j], columns);
      matrix[i][j] = distance;
      matrix[j][i] = distance;
    }
  }

  return matrix;
}

function runBatch(request: PhylogeneticBootstrapBatchRequest): void {
  const startedAt = Date.now();
  validateBatch(request);

  const random = createPrng(request.seed || Date.now());
  const splitCounts: Record<string, number> = {};
  request.baseSplitKeys.forEach(key => { splitCounts[key] = 0; });

  for (let replicate = 0; replicate < request.replicates; replicate++) {
    if (cancelledJobs.has(request.jobId)) return;

    const columns = sampleColumns(request.sequences[0].length, random);
    const matrix = buildBootstrapMatrix(request.sequences, columns);
    const tree = patristic.parseMatrix(matrix, request.labels);
    const replicateCounts = countMatchingTreeSplits(tree, request.baseSplitKeys, request.labels);
    mergeSplitCounts(splitCounts, replicateCounts, request.baseSplitKeys);
  }

  postResponse({
    type: 'BATCH_COMPLETE',
    jobId: request.jobId,
    batchId: request.batchId,
    replicates: request.replicates,
    splitCounts,
    computeDurationMs: Date.now() - startedAt,
  });
}

addEventListener('message', ({ data }: { data: PhylogeneticBootstrapWorkerRequest }) => {
  try {
    if (data.type === 'CANCEL') {
      cancelledJobs.add(data.jobId);
      return;
    }

    cancelledJobs.delete(data.jobId);
    runBatch(data);
  } catch (error: any) {
    postResponse({
      type: 'ERROR',
      jobId: data?.jobId ?? 0,
      batchId: (data as any)?.batchId,
      message: error?.message || String(error),
    });
  }
});
