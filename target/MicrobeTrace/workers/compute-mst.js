onmessage = function(e){
    const start = Date.now();
    const links = e.data.links;
    const dm = e.data.matrix;
    const labels = Object.keys(dm);
    const epsilon = Math.pow(10, e.data.epsilon);
    const metric = e.data.metric;
    const n = labels.length
    const m = links.length;
    let output = new Uint8Array(m);
    let matrix = [];
    let map = [];
    for (let i = 0; i < n; i++) {
        let minDist = Number.MAX_VALUE;
        let targets = [];
        const nodeid = labels[i];
        const row = dm[nodeid];
        for (let j = 0; j < n; j++) {
          let cell = row[labels[j]];
          if(!cell) {
            targets.push(0);
            continue;
          };
          let value = cell[metric];
          targets.push(value);
        }
        matrix.push(targets);
        map.push(nodeid);
    }

    const mst = primMST(matrix);
    const nng = nearest_neighbour_graph(matrix, mst, epsilon);

    for (let i = 0; i < n; i++) {
      const source = map[i];
      nng[i].push(mst[i]);
      Array.from(new Set(nng[i])).forEach((u, index) => {
        const target = map[u];
        for(let k = 0; k < m; k++){
          let l = links[k];
          if((l.source == source && l.target == target) || (l.source == target && l.target == source)) {
            output[k] = 1;
          }
        }
      })
    }
    console.log('MST Compute time: ', (Date.now()-start).toLocaleString(), 'ms');
    postMessage({links: output.buffer, start: Date.now()}, [output.buffer]);
    close();
};

const minKey = (key, mstSet, V) => {
  let min = Number.MAX_VALUE;
  let min_index = -1;
  for (let v = 0; v < V; v++)
    if (!mstSet[v] && key[v] < min) {
        min = key[v];
        min_index = v;
    }
  return min_index;
}

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
  for (let count = 0; count < V-1; count++) {
      let u = minKey(key, mstSet, V);
      if (u < 0) continue;
      mstSet[u] = true;

      if (graph[u].reduce((a, b) => a + b, 0) === 0 && u != 0) continue;

      for (let v = 0; v < V; v++) {
          if (graph[u][v] >= 0 && !mstSet[v] && graph[u][v] <  key[v]) {
              parent[v]  = u;
              key[v] = graph[u][v];
          }
      }
  }
  return parent;
}

const nearest_neighbour_graph = (graph, mst_parents, epsilon) => {
  const V = graph.length;
  let mst = [];
  for (let i=0; i<V; ++i) {
    mst.push([]);
  }
  for (let i=1; i<V; ++i) {
    mst[i].push(mst_parents[i]);
    mst[mst_parents[i]].push(i);
  }
  let nng = [];
  let longest_edge = [];
  for (let i=0; i<V; ++i) {
    nng.push([]);
    longest_edge.push([]);
    for (let j=0; j<V; ++j) {
        longest_edge[i][j] = 0;
    }
  }
  for (let i=0; i<V; ++i) {
    bfs_update_matrix(mst, graph, i, longest_edge);
  }
  for (let i=0; i<V; ++i) {
    for (let j=0; j<V; ++j) {
      if ((graph[i][j] > 0 ) && (graph[i][j] <= (longest_edge[i][j] * (1.0 + epsilon)))) {
          nng[i].push(j);
          nng[j].push(i);
      } 
    }
  }
  return nng;
}

const bfs_update_matrix = (mst, weights, root, longest_edge) => {
  let visited = [];
  let queue = [];
  queue.push(root);
  while (queue.length) {
    let v = queue.shift();
    visited[v] = true;
    mst[v].forEach((u, index) => {
      if(visited[u]) return;
      queue.push(u);
      const value = Math.max(weights[v][u], Math.max(longest_edge[root][u], longest_edge[root][v]));
      longest_edge[root][u] = value;
      longest_edge[u][root] = value;
    })
  }
}