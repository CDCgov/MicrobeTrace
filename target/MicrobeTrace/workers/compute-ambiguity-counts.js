onmessage = function(e) {
  const start = Date.now();
  const subset = e.data;
  const n = subset.length;
  let output = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const sequence = subset[i]["_seqInt"];
    const sequenceLength = sequence.length;
    let count = 0;
    for (let j = 0; j < sequenceLength; j++){
      count += (sequence[j] > 3);
    }
    output[i] = count/sequenceLength;
  }
  console.log("Ambiguity Count time: ", (Date.now() - start).toLocaleString(), "ms");
  postMessage({ counts: output.buffer, start: Date.now() }, [output.buffer]);
  close();
};
