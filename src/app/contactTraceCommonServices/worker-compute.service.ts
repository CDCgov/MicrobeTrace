import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import * as patristic from 'patristic';
import { WorkerModule } from '../workers/workModule';
import type {
  PatristicWorkerRequest,
  PatristicWorkerResponse,
  PatristicEdgeBatchResponse,
  PatristicTreeReadyResponse,
  PatristicProgressResponse,
  PatristicErrorResponse,
} from '../workers/patristic-engine.types';

interface ComputePatristicOptions {
  origin?: string[];
  distanceOrigin?: string;
  check?: any;
  maxEdges?: number;
  batchSize?: number;
}

/**
 * This service delegates all Worker-based computations.
 * It expects a 'session' object with the same structure
 * that CommonService uses (so we can push nodeFields, etc.).
 */
@Injectable({
  providedIn: 'root'
})
export class WorkerComputeService {
  
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

  // ─── Patristic Distance Engine ───────────────────────────────────────────

  /** Currently active patristic job ID for cancellation. */
  private patristicJobId = 0;
  /** Leaf names from the last initialized tree (set by TREE_READY). */
  private patristicLeafNames: string[] = [];
  private patristicNewickString = '';
  private patristicGeneratedMaxThreshold = -Infinity;
  private patristicOrigin: string[] = ['Newick Tree'];
  private patristicDistanceOrigin = 'Newick Tree';
  private patristicTreeInitCount = 0;

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
  ): Promise<{ newLinks: number; totalLinks: number; leafNames: string[] }> {
    const leafNames = this.patristicLeafNames.map(filterXSS);
    const origin = options.origin?.length ? options.origin : this.patristicOrigin;
    const distanceOrigin = options.distanceOrigin || this.patristicDistanceOrigin;
    const check = options.check ?? true;
    const edgeStart = Date.now();

    return new Promise((resolve, reject) => {
      let newLinks = 0;
      let totalLinks = 0;
      let finalTimings: PatristicEdgeBatchResponse['timings'] | undefined;

      this.buildPatristicEdges(threshold, options.maxEdges, options.batchSize).subscribe({
        next: (batch) => {
          const n = batch.sources.length;
          for (let k = 0; k < n; k++) {
            const sourceIdx = batch.sources[k];
            const targetIdx = batch.targets[k];
            newLinks += addLink(
              {
                source: leafNames[sourceIdx],
                target: leafNames[targetIdx],
                origin: [...origin],
                distance: batch.distances[k],
                distanceOrigin,
                hasDistance: true,
              },
              check
            );
            totalLinks++;
          }
          if (batch.done) {
            finalTimings = batch.timings;
          }
        },
        error: (err) => reject(err),
        complete: () => {
          this.patristicGeneratedMaxThreshold = Math.max(
            this.patristicGeneratedMaxThreshold,
            threshold
          );
          if (session?.debugMode) {
            console.log(
              'Patristic edge generation + merge time:',
              (Date.now() - edgeStart).toLocaleString(),
              'ms',
            `(${totalLinks} edges below threshold ${threshold})`
          );
          }
          this.recordPatristicPerformance(session, {
            edgeGeneration: {
              threshold,
              newLinks,
              totalLinks,
              mergeMs: Date.now() - edgeStart,
              timings: finalTimings,
            },
          });
          resolve({ newLinks, totalLinks, leafNames });
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
  ): Promise<{ newLinks: number; totalLinks: number; leafNames: string[]; treeReady: PatristicTreeReadyResponse }> {
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

  public async ensurePatristicEdgesForThreshold(
    threshold: number,
    addLink: (link: any, check: any) => number,
    filterXSS: (s: string) => string,
    session?: any,
    options: ComputePatristicOptions & { newickString?: string } = {}
  ): Promise<{ newLinks: number; totalLinks: number; leafNames: string[] } | null> {
    const newickString = options.newickString || this.patristicNewickString;
    if (!newickString || !Number.isFinite(threshold) || threshold < 0) {
      return null;
    }

    this.setPatristicMetadata(options.origin, options.distanceOrigin);

    if (newickString !== this.patristicNewickString || this.patristicLeafNames.length === 0) {
      const treeReady = await this.initPatristicTree(newickString);
      this.recordPatristicPerformance(session, {
        treeReady: this.treeReadyTelemetry(treeReady),
      });
    }

    if (threshold <= this.patristicGeneratedMaxThreshold) {
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
    this.patristicTreeInitCount = 0;
  }
}
