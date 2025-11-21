onmessage = function(e){
  const start = Date.now();
  const links = e.data.links,
      dm = e.data.matrix,
      labels = Object.keys(dm),
      epsilon = Math.pow(10, e.data.epsilon),
      metric = e.data.metric;
  const n = labels.length, m = links.length;
  let output = new Uint8Array(m);
  for(let i = 0; i < n; i++){
    let minDist = Number.MAX_VALUE;
    let targets = [];
    const nodeid = labels[i];
    const row = dm[nodeid];
    for(let j = 0; j < n; j++){
      let cell = row[labels[j]];
      if(!cell) continue;
      let value = cell[metric];
      if(typeof value != 'number' || isNaN(value)) continue;
      if(value < minDist) minDist = value;
    }
    for(let h = 0; h < n; h++){
      let node = labels[h];
      let cell = row[node];
      if(!cell) continue;
      let value = cell[metric];
      if(typeof value != 'number' || isNaN(value)) continue;
      if(Math.abs(value - minDist) < epsilon){
        targets.push(node);
      }
    }
    for(let k = 0; k < m; k++){
      let l = links[k];
      if((l.source == nodeid && targets.includes(l.target)) ||
         (l.target == nodeid && targets.includes(l.source))){
        output[k] = 1;
      }
    }
  }
  console.log('NN Compute time: ', (Date.now()-start).toLocaleString(), 'ms');
  postMessage({links: output.buffer, start: Date.now()}, [output.buffer]);
  close();
};
