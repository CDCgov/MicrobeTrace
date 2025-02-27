import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import * as patristic from 'patristic';
import { WorkerModule } from '../workers/workModule';

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
  private fromWorker(worker: Worker): Observable<MessageEvent<any>> {
    return new Observable(observer => {
      const messageHandler = (event: MessageEvent<any>) => observer.next(event);
      const errorHandler = (error: ErrorEvent) => observer.error(error);

      worker.addEventListener('message', messageHandler);
      worker.addEventListener('error', errorHandler);

      return () => {
        worker.removeEventListener('message', messageHandler);
        worker.removeEventListener('error', errorHandler);
        worker.terminate();
      };
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
  public computeMST(session: any): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const mstWorker = this.computer.getMSTWorker() as unknown as Worker;
      mstWorker.postMessage({
        links: session.data.links,
        matrix: session.temp.matrix,
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
  public computeNN(session: any): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const nnWorker = this.computer.getNNWorker() as unknown as Worker;
      nnWorker.postMessage({
        links: session.data.links,
        matrix: session.temp.matrix,
        epsilon: session.style.widgets["filtering-epsilon"],
        metric: session.style.widgets['link-sort-variable']
      });

      const sub = this.fromWorker(nnWorker).subscribe(response => {
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

  /**
   * Compute Triangulation, adding invisible placeholders for missing edges, etc.
   */
  public computeTriangulation(session: any): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const metric = session.style.widgets['link-sort-variable'];
      this.getDM(session).then(dm => {
        const triangulationWorker = this.computer.getTriangulationWorker() as unknown as Worker;
        triangulationWorker.postMessage({ matrix: dm });

        const sub = this.fromWorker(triangulationWorker).subscribe(response => {
          if (response.data === 'Error') {
            return reject('Triangulation washed out');
          }
          if (session.debugMode) {
            console.log(
              'Triangulation Transit time: ',
              (Date.now() - response.data.start).toLocaleString(),
              'ms'
            );
          }
          const start = Date.now();
          const decoder = new TextDecoder('utf-8');
          const matrixObj = JSON.parse(decoder.decode(new Uint8Array(response.data.matrix)));

          const labels = Object.keys(session.temp.matrix);
          const n = labels.length;
          for (let i = 0; i < n; i++) {
            const source = labels[i];
            const row = session.temp.matrix[source];
            for (let j = 0; j < i; j++) {
              const target = labels[j];
              // If missing link, add one
              if (!row[target]) {
                if (session.addLink) {
                  session.addLink({
                    source: source,
                    target: target,
                    origin: ['Triangulation'],
                    visible: false
                  });
                }
              }
              row[target][metric] = matrixObj[i][j];
            }
          }

          if (session.debugMode) {
            console.log(
              'Triangulation Merge time: ',
              (Date.now() - start).toLocaleString(),
              'ms'
            );
          }
          resolve();
          triangulationWorker.terminate();
          sub.unsubscribe();
        });
      });
    });
  }
}