importScripts("../vendor/bioseq.min.js");
onmessage = function(e) {
  let start = Date.now();
  let subset = e.data.nodes;
  let reference = e.data.reference;
  let n = subset.length;
  for (let i = 0; i < n; i++) {
    let node = subset[i];
    let rst = bioseq.align(
      reference,
      node.seq,
      false,
      e.data.match,
      e.data.gap
    );
    let fmt = bioseq.cigar2gaps(
      reference,
      node.seq,
      rst.position,
      rst.CIGAR,
      true
    );
    node._score = rst.score;
    node._padding = rst.position;
    node._cigar = rst.CIGAR;
    node._seq = fmt[1];
  }
  console.log("Alignment time: ", (Date.now() - start).toLocaleString(), "ms");
  start = Date.now();
  let encoder = new TextEncoder();
  let output = encoder.encode(JSON.stringify(subset)).buffer;
  postMessage({ nodes: output, start: start }, [output]);
  close();
};
