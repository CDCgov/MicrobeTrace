onmessage = function(e){
  let start = Date.now();
  let m = e.data.matrix;
  let n = m.length;
  for(let i = 0; i < n; i++){
    for(let j = 0; j < i; j++){
      let missingCell = m[i][j];
      if(typeof missingCell == 'number') continue;
      let minRange = Infinity, min = Infinity;
      for(let k = 0; k < i; k++){
        let companionA = m[i][k];
        if(typeof companionA != 'number') continue;
        for(let l = j+1; l < n; l++){
          let companionB = m[l][j];
          if(typeof companionB != 'number') continue;
          let diff = Math.abs(companionA - companionB);
          if(minRange > diff){
            minRange = diff;
            min = Math.min(companionA, companionB);
          }
        }
      }
      if(minRange < Infinity){
        let newVal = min + minRange/2;
        m[i][j] = newVal;
        m[j][i] = newVal;
      }
    }
  }
  console.log('Triangulation Compute time: ', (Date.now()-start).toLocaleString(), 'ms');
  start = Date.now();
  let encoder = new TextEncoder();
  let output = encoder.encode(JSON.stringify(m)).buffer;
  postMessage({matrix: output, start: start}, [output]);
  close();
};
