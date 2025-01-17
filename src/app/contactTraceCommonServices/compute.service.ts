import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { SessionService } from './session.service';
import { DataManagementService } from './data-management.service';
import { WorkerModule } from '../workers/workModule';

@Injectable({
  providedIn: 'root'
})
export class ComputeService {

  computer: WorkerModule;

  constructor(
    private sessionSvc: SessionService,
    private dataSvc: DataManagementService
  ) {
    this.computer = new WorkerModule();
  }

  parseFASTA(text: string): Promise<any[]> {
    return new Promise((resolve) => {
      this.computer.compute_parse_fastaWorker.postMessage(text);
      this.computer.compute_parse_fastaWorker.onmessage().subscribe((response) => {
        // decode, parse, etc.
        resolve(JSON.parse(this.decode(new Uint8Array(response.data.nodes))));
      });
    });
  }

  parseCSVMatrix(file): Promise<{ nn: number; nl: number; tn: number; tl: number }> {
    return new Promise((resolve, reject) => {
      this.computer.compute_parse_csv_matrixWorker.postMessage(file.contents);
      this.fromWorker(this.computer.compute_parse_csv_matrixWorker).subscribe({
        next: (response) => {
          // do your merging logic, e.g. dataSvc.addNode(...) or addLink(...)
          // Then resolve the summary
          resolve({ nn: 0, nl: 0, tn: 0, tl: 0 }); // example
        },
        error: (err) => reject(err)
      });
    });
  }

  /** 
   * Utility to convert from a worker to an RxJS Observable 
   */
  private fromWorker(worker: Worker): Observable<any> {
    return new Observable((obs) => {
      const msgHandler = (e: MessageEvent) => obs.next(e);
      const errHandler = (error: ErrorEvent) => obs.error(error);
      worker.addEventListener('message', msgHandler);
      worker.addEventListener('error', errHandler);

      return () => {
        worker.removeEventListener('message', msgHandler);
        worker.removeEventListener('error', errHandler);
        worker.terminate();
      };
    });
  }

  decode(x: ArrayBuffer): string {
    return new TextDecoder('utf-8').decode(x);
  }

  /** 
   * Example: compute alignment via a worker 
   */
  align(params): Promise<any> {
    return new Promise((resolve) => {
      if (params.aligner === 'none') {
        resolve(params.nodes);
      }
      // ...
      this.computer.compute_align_swWorker.postMessage(params);

      this.computer.compute_align_swWorker.onmessage().subscribe((resp) => {
        let subset = JSON.parse(this.decode(new Uint8Array(resp.data.nodes)));
        resolve(subset);
      });
    });
  }

  computeConsensus(nodes = null): Promise<any> {


    if (!nodes) nodes = this.sessionSvc.data.nodes.filter(d => d.seq);

    return new Promise(resolve => {

        this.computer.compute_consensusWorker.postMessage({ data: nodes });

        const sub = this.computer.compute_consensusWorker.onmessage().subscribe((response) => {

            if(this.debugMode) {
                console.log("Consensus Transit time: ", (Date.now() - response.data.start).toLocaleString(), "ms");
            }
            resolve(this.decode(new Uint8Array(response.data.consensus)));
            sub.unsubscribe();
        });

        //let computer: WorkerModule = new WorkerModule();
        //let response = computer.compute_consensus({ data: nodes });


        //console.log("Consensus Transit time: ", (Date.now() - response.data.start).toLocaleString(), "ms");
        //resolve(this.decode(new Uint8Array(response.data.consensus)));

    });

};

computeAmbiguityCounts(): Promise<void> {
    return new Promise(resolve => {
        let nodes = this.session.data.nodes;
        let subset = nodes.filter(d => d.seq);
        const subsetLength = subset.length;

        this.computer.compute_ambiguity_countsWorker.postMessage(subset);

        const sub = this.computer.compute_ambiguity_countsWorker.onmessage().subscribe((response) => {

            console.log("Ambiguity Count Transit time: ", (Date.now() - response.data.start).toLocaleString(), "ms");
            const start = Date.now();
            const dists = new Float32Array(response.data.counts);
            for (let j = 0; j < subsetLength; j++) {
                nodes[subset[j].index]._ambiguity = dists[j];
            }
            this.sessionSvc.data.nodeFields.push('_ambiguity');
            console.log("Ambiguity Count Merge time: ", (Date.now() - start).toLocaleString(), "ms");
            resolve();
            sub.unsubscribe();
        });

        //let computer: WorkerModule = new WorkerModule();
        //let response = computer.compute_ambiguity_counts(subset);


        //console.log("Ambiguity Count Transit time: ", (Date.now() - response.data.start).toLocaleString(), "ms");
        //let start = Date.now();
        //const dists = new Float32Array(response.data.counts);
        //for (let j = 0; j < subsetLength; j++) {
        //    nodes[subset[j].index]._ambiguity = dists[j];
        //}
        //this.session.data.nodeFields.push('_ambiguity');
        //console.log("Ambiguity Count Merge time: ", (Date.now() - start).toLocaleString(), "ms");
        //resolve();

    });
};


computeConsensusDistances(): Promise<void> {

    return new Promise(resolve => {
        let start = Date.now();
        let nodes = this.sessionSvc.data.nodes;
        let nodesLength = nodes.length;
        let subset = [];
        for (let i = 0; i < nodesLength; i++) {
            const node = nodes[i];
            if (node.seq) {
                subset.push({
                    index: i,
                    seq: node.seq
                });
            } else {
                subset.push({
                    index: i,
                    seq: ""
                });
            }
        }

        let subsetLength = subset.length;
        this.computer.compute_consensusWorker.postMessage({
            data: {
                consensus: this.session.data['consensus'],
                subset: subset,
                start: start
            }
        });

        const sub = this.computer.compute_consensusWorker.onmessage().subscribe((response) => {

            const dists = new Uint16Array(response.data.dists);
            console.log("Consensus Difference Transit time: ", (Date.now() - response.data.start).toLocaleString(), "ms");
            start = Date.now();
            for (let j = 0; j < subsetLength; j++) {
                nodes[subset[j].index]._diff = dists[j];
            }
            this.session.data.nodeFields.push('_diff');
            console.log("Consensus Difference Merge time: ", (Date.now() - start).toLocaleString(), "ms");
            resolve();
            sub.unsubscribe();
        });
    });
};

/**
 * Asychronously uses a worker to calculate snp or tn93 distances between each set of nodes and then add links
 * @param subset an array of nodes
 * @returns a promise that resolves to the number of new links added from this.addLink()
 */
computeLinks(subset): Promise<any> {
    return new Promise(resolve => {

        let k = 0;

        this.computer.compute_linksWorker.postMessage({
            nodes: subset,
            metric: this.sessionSvc.style.widgets['default-distance-metric'],
            strategy: this.sessionSvc.style.widgets["ambiguity-resolution-strategy"],
            threshold: this.sessionSvc.style.widgets["ambiguity-threshold"]
        });

        const sub = this.computer.compute_linksWorker.onmessage().subscribe((response) => {

            let dists = this.session.style.widgets['default-distance-metric'].toLowerCase() == 'snps' ?
                new Uint16Array(response.data.links) :
                new Float32Array(response.data.links);
                if(this.debugMode) {
                    console.log("Links Transit time: ", (Date.now() - response.data.start).toLocaleString(), "ms");
                }
            let start = Date.now();
            let check = this.session.files.length > 1;
            let n = subset.length;
            let l = 0;
            console.log('link same compute---', n);
            for (let i = 0; i < n; i++) {
                const sourceID = subset[i]._id;
                for (let j = 0; j < i; j++) {
                    let targetID = subset[j]._id;
                    console.log('link same compute')
                    k += this.addLink({
                        source: sourceID,
                        target: targetID,
                        distance: dists[l++],
                        origin: ['Genetic Distance'],
                        distanceOrigin: 'Genetic Distance',
                        hasDistance: true,
                        directed: false
                    }, check);
                }
            }
            if(this.debugMode) {
                console.log("Links Merge time: ", (Date.now() - start).toLocaleString(), "ms");
            }
            resolve(k);
            sub.unsubscribe(); // remove the subscription once done
        });
    });
};

getDM(): Promise<any> {
    const start = Date.now();
    return new Promise(resolve => {
        let dm : any = '';
        if (this.session.data['newick']){
            let treeObj = patristic.parseNewick(this.session.data['newick']);
            dm = treeObj.toMatrix();
        } else {
            let labels = this.session.data.nodes.map(d => d._id);
            labels = labels.sort();
            let metric = this.session.style.widgets['link-sort-variable'];
            const n = labels.length;
            dm = new Array(n);
            const m = new Array(n);
            for (let i = 0; i < n; i++) {
                dm[i] = new Array(n);
                dm[i][i] = 0;
                let source = labels[i];
                let row = this.temp.matrix[source];
                if (!row) {
                    console.error('Incompletely populated temp.matrix! Couldn\'t find ' + source);
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
        // console.log('matrixx: ',  JSON.stringify(this.temp.matrix));

        if(this.debugMode) {
            console.log("DM Compute time: ", (Date.now() - start).toLocaleString(), "ms");
        }
        resolve(dm);
    });
};

computeTree(): Promise<any> {

    if(this.debugMode) {
        console.log('computing tree')
    }
    return new Promise(resolve => {

      if (this.temp.treeObj) {
        resolve(this.temp.treeObj.toNewick());
      } else if(this.session.data['newick']){
        resolve(this.session.data['newick']);
      } else {
        this.getDM().then(dm => {
            this.computer.compute_treeWorker.postMessage({
                // labels: Object.keys(this.temp.matrix).sort(), <- This doesn't work because temp.matrix retains blank objects
                labels: this.session.data.nodes.map(a => a._id),
                matrix: dm,
                round: this.session.style.widgets["tree-round"]
            });


            const sub = this.computer.compute_treeWorker.onmessage().subscribe((response) => {

              const treeObj = this.decode(new Uint8Array(response.data.tree));

              const treeString = patristic.parseJSON(treeObj).toNewick();

              if(this.debugMode) {
                console.log('Tree Transit time: ', (Date.now() - response.data.start).toLocaleString(), 'ms');
              }
              resolve(treeString);

          });

        });
      }
    })
};


computeDirectionality(): Promise<void> {
    return new Promise(resolve => {

        this.computer.compute_directionalityWorker.postMessage({
            links: this.session.data.links,
            tree: this.temp.tree
        });

        const sub = this.computer.compute_directionalityWorker.onmessage().subscribe((response) => {

            const flips = new Uint8Array(response.data.output);
            if(this.debugMode) {
                console.log("Directionality Transit time: ", (Date.now() - response.data.start).toLocaleString(), "ms");
            }
            const start = Date.now();
            const n = flips.length;
            for (let i = 0; i < n; i++) {
                if (flips[i]) {
                    let fliplink = this.session.data.links[i];
                    let fliptemp = fliplink.source;
                    fliplink.source = fliplink.target;
                    fliplink.target = fliptemp;
                    fliplink.directed = true;
                }
            }
            if(this.debugMode) {
                console.log("Directionality Integration time: ", (Date.now() - start).toLocaleString(), "ms");
            }
            resolve();

        });

    });
};

computeMST(): Promise<void> {
    return new Promise((resolve, reject) => {

        this.computer.compute_mstWorker.postMessage({
            links: this.session.data.links,
            matrix: this.temp.matrix,
            epsilon: this.session.style.widgets["filtering-epsilon"],
            metric: this.session.style.widgets['link-sort-variable']
        });

        const sub = this.computer.compute_mstWorker.onmessage().subscribe((response) => {
        if (response.data == "Error") {
          return reject("MST washed out");
        }
        const output = new Uint8Array(response.data.links);
        if(this.debugMode) {
            console.log("MST Transit time: ", (Date.now() - response.data.start).toLocaleString(), "ms");
        }
        const start = Date.now();
        let links = this.session.data.links;
        const numLinks = links.length;
        for (let i = 0; i < numLinks; i++) {
          links[i].nn = output[i] ? true : false;
        }
        if(this.debugMode) {
            console.log("MST Merge time: ", (Date.now() - start).toLocaleString(), "ms");
        }
        resolve();
        sub.unsubscribe();
      });
    });
  };


computeNN(): Promise<void> {
    return new Promise((resolve, reject) => {

        this.computer.compute_nnWorker.postMessage({
            links: this.session.data.links,
            matrix: this.temp.matrix,
            epsilon: this.session.style.widgets["filtering-epsilon"],
            metric: this.session.style.widgets['link-sort-variable']
        });

        const sub = this.computer.compute_nnWorker.onmessage().subscribe((response) => {

            if (response.data == "Error") {
                return reject("Nearest Neighbor washed out");
            }
            const output = new Uint8Array(response.data.links);
            if(this.debugMode) {
                console.log("NN Transit time: ", (Date.now() - response.data.start).toLocaleString(), "ms");
            }
            const start = Date.now();
            let links = this.session.data.links;
            const numLinks = links.length;
            for (let i = 0; i < numLinks; i++) {
                links[i].nn = output[i] ? true : false;
            }
            if(this.debugMode) {
                console.log("NN Merge time: ", (Date.now() - start).toLocaleString(), "ms");
            }
            resolve();
            sub.unsubscribe();
        });
    });
};

computeTriangulation(): Promise<void> {
    return new Promise((resolve, reject) => {

        const metric = this.session.style.widgets['link-sort-variable'];
        this.getDM().then(dm => {
            this.computer.compute_triangulationWorker.postMessage({
                matrix: dm
            });

            const sub = this.computer.compute_triangulationWorker.onmessage().subscribe((response) => {

                if (response.data == "Error") return reject("Triangulation washed out");
                if(this.debugMode) {
                    console.log("Triangulation Transit time: ", (Date.now() - response.data.start).toLocaleString(), "ms");
                }
                let start = Date.now();
                let matrix = JSON.parse(this.decode(new Uint8Array(response.data.matrix)));
                let labels = Object.keys(this.temp.matrix);
                const n = labels.length;
                for (let i = 0; i < n; i++) {
                    let source = labels[i];
                    let row = this.temp.matrix[source];
                    for (let j = 0; j < i; j++) {
                        const target = labels[j];
                        if (!row[target]) {
                            this.addLink({
                                source: source,
                                target: target,
                                origin: ['Triangulation'],
                                visible: false
                            });
                        }
                        row[target][metric] = matrix[i][j];
                    }
                }
                if(this.debugMode) {
                    console.log("Triangulation Merge time: ", (Date.now() - start).toLocaleString(), "ms");
                }
                resolve();
                sub.unsubscribe();
            })
        });
    });
};

  /**
   * Similarly, implement computeConsensus, computeAmbiguityCounts, etc.
   */
}
