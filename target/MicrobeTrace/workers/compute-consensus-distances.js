onmessage = function(e) {
  let start = Date.now();
  let consensus = e.data.consensus;
  const consensusLength = consensus.length;
  let subset = e.data.subset;
  let n = subset.length;
  let output = new Uint16Array(n);
  for (let i = 0; i < n; i++) {
    let s1 = subset[i]["seq"];
    let j = Math.min(s1.length, consensusLength);
    let sum = Math.abs(s1.length - consensusLength);
    while (--j >= 0) sum += (s1[j] !== consensus[j] || s1[j] == "-");
    output[i] = sum;
  }
  console.log("Consensus Difference Compute time: ", (Date.now() - start).toLocaleString(), "ms");
  start = Date.now();
  postMessage({ dists: output.buffer, start }, [output.buffer]);
  close();
};
