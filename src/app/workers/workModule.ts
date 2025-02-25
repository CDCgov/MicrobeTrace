import { OnInit, NgModule } from '@angular/core';
import { InlineWorker } from '../helperClasses/inlineWorker';
import Papa from 'papaparse';
import * as bioseq from 'bioseq';

@NgModule({})
export class WorkerModule implements OnInit {

  // This one is still a traditional worker.
  public compute_parse_csv_matrixWorker: Worker;

  constructor() {
    this.compute_parse_csv_matrixWorker = new Worker('assets/parse-csv-matrix.js');
  }

  ngOnInit() {}

  // Factory method for align worker
  public getAlignWorker(): InlineWorker {
    return new InlineWorker(() => {
      const compute_align_sw = (e): any => {
        let start = Date.now();
        let subset = e.nodes;
        let reference = e.reference;
        let n = subset.length;
        for (let i = 0; i < n; i++) {
          let node = subset[i];
          let rst = bioseq.align(reference, node.seq, false, e.match, e.gap);
          let fmt = bioseq.cigar2gaps(reference, node.seq, rst.position, rst.CIGAR, true);
          node._score = rst.score;
          node._padding = rst.position;
          node._cigar = rst.CIGAR;
          node._seq = fmt[1];
        }
        console.log("Alignment time: ", (Date.now() - start).toLocaleString(), "ms");
        start = Date.now();
        let encoder = new TextEncoder();
        let output = encoder.encode(JSON.stringify(subset)).buffer;
        const response = { data: output, start: start };
        postMessage(response, null, null);
      };
      onmessage = (evt) => {
        compute_align_sw(evt.data);
      };
    });
  }

  // Factory method for consensus worker
  public getConsensusWorker(): InlineWorker {
    return new InlineWorker(() => {
      const compute_consensus = (e): any => {
        let start = Date.now();
        let subset = (e.data !== undefined ? e.data : e);
        let n = subset.length;
        let output = [];
        for (let i = 0; i < n; i++) {
          let seq = subset[i].seq.toUpperCase();
          for (let j = 0; j < seq.length; j++) {
            if (!output[j]) output.push({ A: 0, C: 0, G: 0, T: 0, '-': 0 });
            output[j][seq[j]]++;
          }
        }
        let consensus: any = "";
        let m = output.length;
        let entry, maxKey, maxVal;
        for (let k = 0; k < m; k++) {
          entry = output[k];
          maxKey = 'A';
          maxVal = entry[maxKey];
          Object.keys(entry).forEach(char => {
            if (maxVal <= entry[char]) {
              maxVal = entry[char];
              maxKey = char;
            }
          });
          consensus += maxKey;
        }
        console.log('Consensus Compute time: ', (Date.now() - start).toLocaleString(), 'ms');
        start = Date.now();
        let encoder = new TextEncoder();
        consensus = encoder.encode(consensus).buffer;
        let response = { consensus: consensus, start: start, data: consensus };
        postMessage(response, null, null);
      };
      onmessage = (evt) => {
        compute_consensus(evt.data);
      };
    });
  }

  // Factory method for ambiguity counts worker
  public getAmbiguityCountsWorker(): InlineWorker {
    return new InlineWorker(() => {
      const compute_ambiguity_counts = (e): any => {
        const start = Date.now();
        const subset = (e.data !== undefined ? e.data : e);
        const n = subset.length;
        let output = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          const sequence = subset[i]["_seqInt"];
          const sequenceLength = sequence.length;
          let count = 0;
          for (let j = 0; j < sequenceLength; j++) {
            count += (sequence[j] > 3 ? 1 : 0);
          }
          output[i] = count / sequenceLength;
        }
        console.log("Ambiguity Count time: ", (Date.now() - start).toLocaleString(), "ms");
        let response = { counts: output.buffer, start: Date.now(), data: output.buffer };
        postMessage(response, null, null);
      };
      onmessage = (evt) => {
        compute_ambiguity_counts(evt.data);
      };
    });
  }

  // Factory method for links worker
  public getLinksWorker(): InlineWorker {
    return new InlineWorker(() => {
      const compute_links = (e): any => {
        const snps = (s1, s2) => {
          let n = Math.min(s1.length, s2.length);
          let sum = 0;
          for (let i = 0; i < n; i++) {
            let c1 = s1[i];
            let c2 = s2[i];
            sum += ((c1 !== c2) && (c1 !== 17) && (c2 !== 17) ? 1 : 0);
          }
          return sum;
        };
        let start = Date.now(), t = 0, output;
        const subset = e.nodes,
              n = subset.length,
              threshold = parseFloat(e.threshold),
              strategy = e.strategy.toUpperCase(),
              metric = e.metric;
        if (metric === 'snps') {
          output = new Uint16Array((n * n - n) / 2);
          for (let i = 0; i < n; i++) {
            let source = subset[i];
            for (let j = 0; j < i; j++) {
              output[t++] = snps(source['_seqInt'], subset[j]['_seqInt']);
            }
          }
        } else {
          output = new Float32Array((n * n - n) / 2);
          if (strategy !== "HIVTRACE-G") {
            for (let i = 0; i < n; i++) {
              let source = subset[i]['_seqInt'];
              for (let j = 0; j < i; j++) {
                // @ts-ignore
                output[t++] = tn93.onInts(source, subset[j]['_seqInt'], strategy);
              }
            }
          } else {
            for (let i = 0; i < n; i++) {
              let source = subset[i];
              let sourceInThreshold = source['_ambiguity'] < threshold;
              let sourceSeq = source['_seqInt'];
              for (let j = 0; j < i; j++) {
                let target = subset[j];
                // @ts-ignore
                output[t++] = tn93.onInts(sourceSeq, target['_seqInt'], (sourceInThreshold && target['_ambiguity'] < threshold ? "RESOLVE" : "AVERAGE"));
              }
            }
          }
        }
        console.log('Links Compute time: ', (Date.now() - start).toLocaleString(), 'ms');
        start = Date.now();
        let response = { links: output.buffer, start, data: output.buffer };
        postMessage(response, null, null);
      };
      onmessage = (evt) => {
        compute_links(evt.data);
      };
    });
  }

  // Factory method for tree worker
  public getTreeWorker(): InlineWorker {
    return new InlineWorker((patristic, tn93) => {
      const compute_tree = (e): any => {
        let start = Date.now();
        const matrix = e.matrix;
        console.log('parsingggg');
        let output;
        try {
          console.log('matrix', matrix);
          console.log('labels', e.labels);
          // @ts-ignore
          const RNJ = parseMatrix(matrix, e.labels);
          console.log('RNJ', RNJ);
          console.log('Tree Compute time: ', (Date.now() - start).toLocaleString(), 'ms');
          start = Date.now();
          const encoder = new TextEncoder();
          output = encoder.encode(JSON.stringify(RNJ.toObject())).buffer;
        } catch {
          console.log('unable to compute tree');
          const encoder = new TextEncoder();
          output = encoder.encode(JSON.stringify({})).buffer;
        }
        let response = { tree: output, start: start, data: output };
        postMessage(response, null, null);
      };
      onmessage = (evt) => {
        compute_tree(evt.data);
      };
    });
  }

  // Factory method for directionality worker
  public getDirectionalityWorker(): InlineWorker {
    return new InlineWorker(() => {
      const compute_directionality = (e): any => {
        const start = Date.now();
        const links = e.links;
        const n = links.length;
        // @ts-ignore
        const tree = parseJSON(e.tree);
        let flips = new Uint8Array(n);
        for (let i = 0; i < n; i++) {
          const link = links[i];
          const source = tree.getDescendant(link.source);
          const target = tree.getDescendant(link.target);
          // @ts-ignore
          if (source instanceof Branch && target instanceof Branch) {
            if (target.sources(source)) {
              flips[i] = 1;
            }
          }
        }
        console.log('Directionality Inference time: ', (Date.now() - start).toLocaleString(), 'ms');
        let response = { output: flips.buffer, start: Date.now(), data: flips.buffer };
        postMessage(response, null, null);
      };
      onmessage = (evt) => {
        compute_directionality(evt.data);
      };
    });
  }

  // Factory method for MST worker
  public getMSTWorker(): InlineWorker {
    return new InlineWorker(() => {
      const compute_mst = (e): any => {
        const start = Date.now();
        const links = e.links;
        const dm = e.matrix;
        const labels = Object.keys(dm);
        const epsilon = Math.pow(10, e.epsilon);
        const metric = e.metric;
        const n = labels.length;
        const m = links.length;
        let output = new Uint8Array(m);
        let matrix = [];
        let map: string[] = [];
        for (let i = 0; i < n; i++) {
          let minDist = Number.MAX_VALUE;
          let targets = [];
          const nodeid = labels[i];
          const row = dm[nodeid];
          for (let j = 0; j < n; j++) {
            let cell = row[labels[j]];
            if (!cell) {
              targets.push(0);
              continue;
            }
            let value = cell[metric];
            targets.push(value);
          }
          matrix.push(targets);
          map.push(nodeid);
        }
        const minKey = (key, mstSet, V) => {
          let min = Number.MAX_VALUE;
          let min_index = -1;
          for (let v = 0; v < V; v++) {
            if (!mstSet[v] && key[v] < min) {
              min = key[v];
              min_index = v;
            }
          }
          return min_index;
        };
        const primMST = (graph) => {
          const V = graph.length;
          let parent = [];
          let key = [];
          let mstSet = [];
          for (let i = 0; i < V; i++) {
            key[i] = Number.MAX_VALUE;
            mstSet[i] = false;
          }
          key[0] = 0.0;
          parent[0] = -1;
          for (let count = 0; count < V - 1; count++) {
            let u = minKey(key, mstSet, V);
            if (u < 0) continue;
            mstSet[u] = true;
            if (graph[u].reduce((a, b) => a + b, 0) === 0 && u !== 0) continue;
            for (let v = 0; v < V; v++) {
              if (graph[u][v] >= 0 && !mstSet[v] && graph[u][v] < key[v]) {
                parent[v] = u;
                key[v] = graph[u][v];
              }
            }
          }
          return parent;
        };
        const nearest_neighbour_graph = (graph, mst_parents, epsilon) => {
          const V = graph.length;
          let mst = [];
          for (let i = 0; i < V; ++i) {
            mst.push([]);
          }
          for (let i = 1; i < V; ++i) {
            mst[i].push(mst_parents[i]);
            mst[mst_parents[i]].push(i);
          }
          let nng = [];
          let longest_edge = [];
          for (let i = 0; i < V; ++i) {
            nng.push([]);
            longest_edge.push([]);
            for (let j = 0; j < V; ++j) {
              longest_edge[i][j] = 0;
            }
          }
          for (let i = 0; i < V; ++i) {
            bfs_update_matrix(mst, matrix, i, longest_edge);
          }
          for (let i = 0; i < V; ++i) {
            for (let j = 0; j < V; ++j) {
              if (graph[i][j] > 0 && graph[i][j] <= (longest_edge[i][j] * (1.0 + epsilon))) {
                nng[i].push(j);
                nng[j].push(i);
              }
            }
          }
          return nng;
        };
        const bfs_update_matrix = (mst, weights, root, longest_edge) => {
          let visited = [];
          let queue = [];
          queue.push(root);
          while (queue.length) {
            let v = queue.shift();
            visited[v] = true;
            mst[v].forEach((u) => {
              if (visited[u]) return;
              queue.push(u);
              const value = Math.max(weights[v][u], Math.max(longest_edge[root][u], longest_edge[root][v]));
              longest_edge[root][u] = value;
              longest_edge[u][root] = value;
            });
          }
        };
        const mst = primMST(matrix);
        const nng = nearest_neighbour_graph(matrix, mst, epsilon);
        for (let i = 0; i < n; i++) {
          const source = map[i];
          nng[i].push(mst[i]);
          Array.from(new Set(nng[i])).forEach((u) => {
            const target = map[parseInt(u as string)];
            for (let k = 0; k < m; k++) {
              let l = links[k];
              if ((l.source === source && l.target === target) || (l.source === target && l.target === source)) {
                output[k] = 1;
              }
            }
          });
        }
        console.log('MST Compute time: ', (Date.now() - start).toLocaleString(), 'ms');
        let response = { links: output.buffer, start: Date.now(), data: output.buffer };
        postMessage(response, null, null);
      };
      onmessage = (evt) => {
        compute_mst(evt.data);
      };
    });
  }

  // Factory method for NN worker
  public getNNWorker(): InlineWorker {
    return new InlineWorker(() => {
      const compute_nn = (e): any => {
        const includes = (container: any, value: any) => {
          return container.indexOf(value) >= 0;
        };
        const start = Date.now();
        const links = e.links, dm = e.matrix, labels = Object.keys(dm),
              epsilon = Math.pow(10, e.epsilon), metric = e.metric;
        const n = labels.length, m = links.length;
        let output = new Uint8Array(m);
        for (let i = 0; i < n; i++) {
          let minDist = Number.MAX_VALUE;
          let targets = [];
          const nodeid = labels[i];
          const row = dm[nodeid];
          for (let j = 0; j < i; j++) {
            let cell = row[labels[j]];
            if (!cell) continue;
            let value = cell[metric];
            if (typeof value !== 'number' || isNaN(value)) continue;
            if (value < minDist) minDist = value;
          }
          for (let h = 0; h < i; h++) {
            let node = labels[h];
            let cell = row[node];
            if (!cell) continue;
            let value = cell[metric];
            if (typeof value !== 'number' || isNaN(value)) continue;
            if (Math.abs(value - minDist) < epsilon) {
              targets.push(node);
            }
          }
          for (let k = 0; k < m; k++) {
            let l = links[k];
            if ((l.source === nodeid && includes(targets, l.target)) ||
                (l.target === nodeid && includes(targets, l.source))) {
              output[k] = 1;
            }
          }
        }
        console.log('NN Compute time: ', (Date.now() - start).toLocaleString(), 'ms');
        let response = { links: output.buffer, start: Date.now(), data: output.buffer };
        postMessage(response, null, null);
      };
      onmessage = (evt) => {
        compute_nn(evt.data);
      };
    });
  }

  // Factory method for triangulation worker
  public getTriangulationWorker(): InlineWorker {
    return new InlineWorker(() => {
      const compute_triangulation = (e): any => {
        let start = Date.now();
        let m = e.matrix;
        let n = m.length;
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < i; j++) {
            let missingCell = m[i][j];
            if (typeof missingCell === 'number') continue;
            let minRange = Infinity, min = Infinity;
            for (let k = 0; k < i; k++) {
              let companionA = m[i][k];
              if (typeof companionA !== 'number') continue;
              for (let l = j + 1; l < n; l++) {
                let companionB = m[l][j];
                if (typeof companionB !== 'number') continue;
                let diff = Math.abs(companionA - companionB);
                if (minRange > diff) {
                  minRange = diff;
                  min = Math.min(companionA, companionB);
                }
              }
            }
            if (minRange < Infinity) {
              let newVal = min + minRange / 2;
              m[i][j] = newVal;
              m[j][i] = newVal;
            }
          }
        }
        console.log('Triangulation Compute time: ', (Date.now() - start).toLocaleString(), 'ms');
        start = Date.now();
        let encoder = new TextEncoder();
        let output = encoder.encode(JSON.stringify(m)).buffer;
        let response = { matrix: output, start: start, data: output };
        postMessage(response, null, null);
      };
      onmessage = (evt) => {
        compute_triangulation(evt.data);
      };
    });
  }

  // Factory method for parse FASTA worker
  // Factory method for parse FASTA worker
public getParseFastaWorker(): InlineWorker {
  return new InlineWorker(() => {
    const compute_parse_fasta = (e): any => {
      let start = Date.now();
      // Check if e.data is an object with a "data" property; otherwise, use e.data directly.
      let text = (typeof e.data === 'object' && e.data.data) ? e.data.data : e.data;
      if (!text || text.length === 0) return [];
      
      let seqs: any = [];
      let currentSeq: any = {};
      let lines = text.split(/[\r\n]+/g);
      let n = lines.length;
      let isblank = /^\s*$/;
      for (let i = 0; i < n; i++) {
        let line = lines[i];
        if (isblank.test(line) || line[0] === ';') continue;
        if (line[0] === '>') {
          if (i > 0) seqs.push(currentSeq);
          currentSeq = { id: line.slice(1), seq: '' };
        } else {
          currentSeq.seq += line.toUpperCase();
        }
      }
      seqs.push(currentSeq);
      console.log('FASTA Parse time: ', (Date.now() - start).toLocaleString(), 'ms');
      start = Date.now();
      let encoder = new TextEncoder();
      let output = encoder.encode(JSON.stringify(seqs)).buffer;
      let response = { nodes: output, start: start, data: output };
      postMessage(response, null, null);
    };

    onmessage = (evt) => {
      compute_parse_fasta(evt);
    };
  });
}


}
