importScripts('../vendor/patristic.min.js');

onmessage = function(e){
  let start = Date.now();
  const matrix = e.data.matrix;
  const RNJ = patristic.parseMatrix(matrix, e.data.labels);
  console.log('Tree Compute time: ', (Date.now()-start).toLocaleString(), 'ms');
  start = Date.now();
  const encoder = new TextEncoder();
  const output = encoder.encode(JSON.stringify(RNJ.toObject())).buffer;
  postMessage({tree: output, start: start}, [output]);
  close();
};
