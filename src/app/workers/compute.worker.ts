/// <reference lib="webworker" />

import * as bioseq from 'bioseq';
import * as patristic from 'patristic';
import * as tn93 from 'tn93';

import type { ComputeWorkerRequest } from './compute-worker.types';

function postBufferResponse(
  field: string,
  buffer: ArrayBufferLike,
  start: number,
  jobId: number,
  extra: Record<string, unknown> = {},
): void {
  postMessage({ [field]: buffer, start, data: buffer, jobId, ...extra }, [buffer]);
}

function postJsonResponse(
  field: string,
  value: unknown,
  start: number,
  jobId: number,
  extra: Record<string, unknown> = {},
): void {
  const buffer = new TextEncoder().encode(JSON.stringify(value)).buffer;
  postBufferResponse(field, buffer, start, jobId, extra);
}

function computeConsensusString(nodes: Array<{ seq?: string }>): string {
  const output: Array<Record<string, number>> = [];
  const n = nodes.length;

  for (let i = 0; i < n; i++) {
    const seq = (nodes[i].seq || '').toUpperCase();
    for (let j = 0; j < seq.length; j++) {
      if (!output[j]) {
        output[j] = { A: 0, C: 0, G: 0, T: 0, '-': 0 };
      }
      const char = seq[j];
      if (Object.prototype.hasOwnProperty.call(output[j], char)) {
        output[j][char]++;
      }
    }
  }

  let consensus = '';
  const m = output.length;
  for (let k = 0; k < m; k++) {
    const entry = output[k];
    let maxKey = 'A';
    let maxVal = entry[maxKey];
    Object.keys(entry).forEach((char) => {
      if (maxVal <= entry[char]) {
        maxVal = entry[char];
        maxKey = char;
      }
    });
    consensus += maxKey;
  }

  return consensus;
}

function computeConsensusDifferences(consensus: string, subset: Array<{ seq?: string }>): Uint16Array {
  const output = new Uint16Array(subset.length);
  const normalizedConsensus = (consensus || '').toUpperCase();

  for (let i = 0; i < subset.length; i++) {
    const sequence = (subset[i].seq || '').toUpperCase();
    const maxLength = Math.max(sequence.length, normalizedConsensus.length);
    let diff = 0;

    for (let j = 0; j < maxLength; j++) {
      const source = normalizedConsensus[j] ?? '-';
      const target = sequence[j] ?? '-';
      if (source !== target) {
        diff++;
      }
    }

    output[i] = diff;
  }

  return output;
}

function handleAlign(payload: any, jobId: number): void {
  const subset = payload.nodes;
  const reference = payload.reference;
  const n = subset.length;

  for (let i = 0; i < n; i++) {
    const node = subset[i];
    const rst = bioseq.align(reference, node.seq, false, payload.match, payload.gap);
    const fmt = bioseq.cigar2gaps(reference, node.seq, rst.position, rst.CIGAR, true);
    node._score = rst.score;
    node._padding = rst.position;
    node._cigar = rst.CIGAR;
    node._seq = fmt[1];
  }

  postJsonResponse('nodes', subset, Date.now(), jobId);
}

function handleConsensus(payload: any, jobId: number): void {
  const computeStart = Date.now();
  const data = payload?.data ?? payload;

  if (Array.isArray(data)) {
    const consensus = computeConsensusString(data);
    const buffer = new TextEncoder().encode(consensus).buffer;
    const workerFinishedAt = Date.now();
    postMessage({
      consensus: buffer,
      start: workerFinishedAt,
      data: buffer,
      jobId,
      computeDurationMs: workerFinishedAt - computeStart,
    }, [buffer]);
    return;
  }

  const subset = Array.isArray(data?.subset) ? data.subset : [];
  const consensus = typeof data?.consensus === 'string' && data.consensus.length > 0
    ? data.consensus
    : computeConsensusString(subset);
  const dists = computeConsensusDifferences(consensus, subset);
  const workerFinishedAt = Date.now();
  postBufferResponse('dists', dists.buffer, workerFinishedAt, jobId, {
    computeDurationMs: workerFinishedAt - computeStart,
  });
}

function handleAmbiguityCounts(payload: any, jobId: number): void {
  const computeStart = Date.now();
  const subset = payload?.data ?? payload;
  const n = subset.length;
  const output = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    const sequence = subset[i]._seqInt;
    const sequenceLength = sequence.length;
    let count = 0;
    for (let j = 0; j < sequenceLength; j++) {
      count += sequence[j] > 3 ? 1 : 0;
    }
    output[i] = sequenceLength === 0 ? 0 : count / sequenceLength;
  }

  const workerFinishedAt = Date.now();
  postBufferResponse('counts', output.buffer, workerFinishedAt, jobId, {
    computeDurationMs: workerFinishedAt - computeStart,
  });
}

function snps(s1: Uint8Array, s2: Uint8Array): number {
  const n = Math.min(s1.length, s2.length);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const c1 = s1[i];
    const c2 = s2[i];
    sum += c1 !== c2 && c1 !== 17 && c2 !== 17 ? 1 : 0;
  }
  return sum;
}

function handleLinks(payload: any, jobId: number): void {
  const computeStart = Date.now();
  const subset = payload.nodes;
  const n = subset.length;
  const threshold = parseFloat(payload.threshold);
  const strategy = payload.strategy.toUpperCase();
  const metric = payload.metric;
  let output: Uint16Array | Float32Array;
  let t = 0;

  if (metric === 'snps') {
    output = new Uint16Array((n * n - n) / 2);
    for (let i = 0; i < n; i++) {
      const source = subset[i];
      for (let j = 0; j < i; j++) {
        output[t++] = snps(source._seqInt, subset[j]._seqInt);
      }
    }
  } else {
    output = new Float32Array((n * n - n) / 2);
    if (strategy !== 'HIVTRACE-G') {
      for (let i = 0; i < n; i++) {
        const source = subset[i]._seqInt;
        for (let j = 0; j < i; j++) {
          output[t++] = tn93.onInts(source, subset[j]._seqInt, strategy);
        }
      }
    } else {
      for (let i = 0; i < n; i++) {
        const source = subset[i];
        const sourceInThreshold = source._ambiguity < threshold;
        const sourceSeq = source._seqInt;
        for (let j = 0; j < i; j++) {
          const target = subset[j];
          const mode = sourceInThreshold && target._ambiguity < threshold ? 'RESOLVE' : 'AVERAGE';
          output[t++] = tn93.onInts(sourceSeq, target._seqInt, mode);
        }
      }
    }
  }

  const workerFinishedAt = Date.now();
  postBufferResponse('links', output.buffer, workerFinishedAt, jobId, {
    computeDurationMs: workerFinishedAt - computeStart,
  });
}

function handleTree(payload: any, jobId: number): void {
  try {
    const tree = patristic.parseMatrix(payload.matrix, payload.labels);
    postJsonResponse('tree', tree.toObject(), Date.now(), jobId);
  } catch {
    postJsonResponse('tree', {}, Date.now(), jobId);
  }
}

function handleDirectionality(payload: any, jobId: number): void {
  const links = payload.links;
  const tree = patristic.parseJSON(payload.tree);
  const flips = new Uint8Array(links.length);

  for (let i = 0; i < links.length; i++) {
    const link = links[i];
    const source = tree.getDescendant(link.source);
    const target = tree.getDescendant(link.target);
    if (source && target && typeof target.sources === 'function' && target.sources(source)) {
      flips[i] = 1;
    }
  }

  postBufferResponse('output', flips.buffer, Date.now(), jobId);
}

function handleMst(payload: any, jobId: number): void {
  const links = payload.links;
  const dm = payload.matrix;
  const labels = Object.keys(dm);
  const epsilon = Math.pow(10, payload.epsilon);
  const metric = payload.metric;
  const n = labels.length;
  const m = links.length;
  const output = new Uint8Array(m);
  const matrix: number[][] = [];
  const map: string[] = [];

  for (let i = 0; i < n; i++) {
    const nodeid = labels[i];
    const row = dm[nodeid];
    const targets: number[] = [];
    for (let j = 0; j < n; j++) {
      const cell = row[labels[j]];
      targets.push(cell ? cell[metric] : 0);
    }
    matrix.push(targets);
    map.push(nodeid);
  }

  const minKey = (key: number[], mstSet: boolean[], size: number): number => {
    let min = Number.MAX_VALUE;
    let minIndex = -1;
    for (let v = 0; v < size; v++) {
      if (!mstSet[v] && key[v] < min) {
        min = key[v];
        minIndex = v;
      }
    }
    return minIndex;
  };

  const primMST = (graph: number[][]): number[] => {
    const size = graph.length;
    const parent: number[] = [];
    const key: number[] = [];
    const mstSet: boolean[] = [];

    for (let i = 0; i < size; i++) {
      key[i] = Number.MAX_VALUE;
      mstSet[i] = false;
    }

    key[0] = 0;
    parent[0] = -1;

    for (let count = 0; count < size - 1; count++) {
      const u = minKey(key, mstSet, size);
      if (u < 0) {
        continue;
      }
      mstSet[u] = true;
      if (graph[u].reduce((a, b) => a + b, 0) === 0 && u !== 0) {
        continue;
      }
      for (let v = 0; v < size; v++) {
        if (graph[u][v] >= 0 && !mstSet[v] && graph[u][v] < key[v]) {
          parent[v] = u;
          key[v] = graph[u][v];
        }
      }
    }

    return parent;
  };

  const bfsUpdateMatrix = (
    mst: number[][],
    weights: number[][],
    root: number,
    longestEdge: number[][]
  ): void => {
    const visited: boolean[] = [];
    const queue: number[] = [root];

    while (queue.length) {
      const v = queue.shift();
      if (v === undefined) {
        continue;
      }
      visited[v] = true;
      mst[v].forEach((u) => {
        if (visited[u]) {
          return;
        }
        queue.push(u);
        const value = Math.max(weights[v][u], Math.max(longestEdge[root][u], longestEdge[root][v]));
        longestEdge[root][u] = value;
        longestEdge[u][root] = value;
      });
    }
  };

  const nearestNeighbourGraph = (graph: number[][], mstParents: number[], localEpsilon: number): number[][] => {
    const size = graph.length;
    const mst: number[][] = Array.from({ length: size }, () => []);
    for (let i = 1; i < size; ++i) {
      mst[i].push(mstParents[i]);
      mst[mstParents[i]].push(i);
    }

    const nng: number[][] = Array.from({ length: size }, () => []);
    const longestEdge: number[][] = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => 0)
    );

    for (let i = 0; i < size; ++i) {
      bfsUpdateMatrix(mst, matrix, i, longestEdge);
    }

    for (let i = 0; i < size; ++i) {
      for (let j = 0; j < size; ++j) {
        if (graph[i][j] > 0 && graph[i][j] <= longestEdge[i][j] * (1 + localEpsilon)) {
          nng[i].push(j);
          nng[j].push(i);
        }
      }
    }

    return nng;
  };

  const mst = primMST(matrix);
  const nng = nearestNeighbourGraph(matrix, mst, epsilon);

  for (let i = 0; i < n; i++) {
    const source = map[i];
    nng[i].push(mst[i]);
    Array.from(new Set(nng[i])).forEach((u) => {
      const target = map[parseInt(String(u), 10)];
      for (let k = 0; k < m; k++) {
        const link = links[k];
        if (
          (link.source === source && link.target === target) ||
          (link.source === target && link.target === source)
        ) {
          output[k] = 1;
        }
      }
    });
  }

  postBufferResponse('links', output.buffer, Date.now(), jobId);
}

function handleNn(payload: any, jobId: number): void {
  const links = payload.links;
  const dm = payload.matrix;
  const labels = Object.keys(dm);
  const epsilon = Math.pow(10, payload.epsilon);
  const metric = payload.metric;
  const n = labels.length;
  const m = links.length;
  const output = new Uint8Array(m);

  for (let i = 0; i < n; i++) {
    let minDist = Number.MAX_VALUE;
    const targets: string[] = [];
    const nodeid = labels[i];
    const row = dm[nodeid];

    for (let j = 0; j < i; j++) {
      const cell = row[labels[j]];
      if (!cell) {
        continue;
      }
      const value = cell[metric];
      if (typeof value !== 'number' || Number.isNaN(value)) {
        continue;
      }
      if (value < minDist) {
        minDist = value;
      }
    }

    for (let h = 0; h < i; h++) {
      const node = labels[h];
      const cell = row[node];
      if (!cell) {
        continue;
      }
      const value = cell[metric];
      if (typeof value !== 'number' || Number.isNaN(value)) {
        continue;
      }
      if (Math.abs(value - minDist) < epsilon) {
        targets.push(node);
      }
    }

    for (let k = 0; k < m; k++) {
      const link = links[k];
      if (
        (link.source === nodeid && targets.includes(link.target)) ||
        (link.target === nodeid && targets.includes(link.source))
      ) {
        output[k] = 1;
      }
    }
  }

  postBufferResponse('links', output.buffer, Date.now(), jobId);
}

function handleTriangulation(payload: any, jobId: number): void {
  const matrix = payload.matrix;
  const n = matrix.length;

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < i; j++) {
      const missingCell = matrix[i][j];
      if (typeof missingCell === 'number') {
        continue;
      }
      let minRange = Infinity;
      let min = Infinity;
      for (let k = 0; k < i; k++) {
        const companionA = matrix[i][k];
        if (typeof companionA !== 'number') {
          continue;
        }
        for (let l = j + 1; l < n; l++) {
          const companionB = matrix[l][j];
          if (typeof companionB !== 'number') {
            continue;
          }
          const diff = Math.abs(companionA - companionB);
          if (minRange > diff) {
            minRange = diff;
            min = Math.min(companionA, companionB);
          }
        }
      }
      if (minRange < Infinity) {
        const newVal = min + minRange / 2;
        matrix[i][j] = newVal;
        matrix[j][i] = newVal;
      }
    }
  }

  postJsonResponse('matrix', matrix, Date.now(), jobId);
}

function handleParseFasta(payload: any, jobId: number): void {
  const text = typeof payload?.data === 'string' ? payload.data : payload;
  if (!text || text.length === 0) {
    postJsonResponse('nodes', [], Date.now(), jobId);
    return;
  }

  const seqs: Array<{ id: string; seq: string }> = [];
  let currentSeq: { id?: string; seq?: string } = {};
  const lines = text.split(/[\r\n]+/g);
  const isBlank = /^\s*$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isBlank.test(line) || line[0] === ';') {
      continue;
    }
    if (line[0] === '>') {
      if (i > 0 && currentSeq.id) {
        seqs.push({ id: currentSeq.id, seq: currentSeq.seq || '' });
      }
      currentSeq = { id: line.slice(1), seq: '' };
    } else {
      currentSeq.seq = `${currentSeq.seq || ''}${line.toUpperCase()}`;
    }
  }

  if (currentSeq.id) {
    seqs.push({ id: currentSeq.id, seq: currentSeq.seq || '' });
  }

  postJsonResponse('nodes', seqs, Date.now(), jobId);
}

addEventListener('message', ({ data }) => {
  const request = data as ComputeWorkerRequest;

  switch (request.task) {
    case 'align':
      handleAlign(request.payload, request.jobId);
      break;
    case 'consensus':
      handleConsensus(request.payload, request.jobId);
      break;
    case 'ambiguityCounts':
      handleAmbiguityCounts(request.payload, request.jobId);
      break;
    case 'links':
      handleLinks(request.payload, request.jobId);
      break;
    case 'tree':
      handleTree(request.payload, request.jobId);
      break;
    case 'directionality':
      handleDirectionality(request.payload, request.jobId);
      break;
    case 'mst':
      handleMst(request.payload, request.jobId);
      break;
    case 'nn':
      handleNn(request.payload, request.jobId);
      break;
    case 'triangulation':
      handleTriangulation(request.payload, request.jobId);
      break;
    case 'parseFasta':
      handleParseFasta(request.payload, request.jobId);
      break;
    default:
      throw new Error(`Unknown compute worker task: ${(request as any).task}`);
  }
});
