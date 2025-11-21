onmessage = function(e){
  var start = Date.now();
  var subset = e.data;
  var n = subset.length;
  var output = [];
  for(var i = 0; i < n; i++){
    var seq = subset[i].seq.toUpperCase();
    for(var j = 0; j < seq.length; j++){
      if(!output[j]) output.push({A: 0, C: 0, G: 0, T: 0, '-': 0});
      output[j][seq[j]]++;
    }
  }
  var consensus = "";
  var m = output.length;
  var entry, maxKey, maxVal;
  for(var k = 0; k < m; k++){
    entry = output[k];
    maxKey = 'A';
    maxVal = entry[maxKey];
    Object.keys(entry).forEach(char => {
      if(maxVal <= entry[char]){
        maxVal = entry[char];
        maxKey = char;
      }
    });
    consensus += maxKey;
  }
  console.log('Consensus Compute time: ', (Date.now()-start).toLocaleString(), 'ms');
  start = Date.now();
  var encoder = new TextEncoder();
  consensus = encoder.encode(consensus).buffer;
  postMessage({consensus: consensus, start: start}, [consensus]);
  close();
};
