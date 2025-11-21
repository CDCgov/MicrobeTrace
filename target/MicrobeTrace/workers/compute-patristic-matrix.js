importScripts('../vendor/patristic.min.js');

onmessage = function(e){
  var start = Date.now();
  var tree = patristic.parseNewick(e.data.newick);
  var output = {
    labels: tree.getDescendants().map(d => d.id),
    matrix: tree.toMatrix()
  };
  console.log('Patristic Matrix Compute time: ' + ((Date.now()-start)/1000).toLocaleString() + 's');
  start = Date.now();
  var encoder = new TextEncoder();
  output = encoder.encode(JSON.stringify(output)).buffer;
  postMessage({output: output, start: start}, [output]);
  close();
};
