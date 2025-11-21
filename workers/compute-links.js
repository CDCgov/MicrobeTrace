importScripts('../vendor/tn93.min.js');

const snps = (s1, s2) => {
  let n = Math.min(s1.length, s2.length);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    let c1 = s1[i];
    let c2 = s2[i];
    sum += (c1 != c2) && (c1 != 17) && (c2 != 17);
  }
  return sum;
};

onmessage = function(e) {
  let start = Date.now(),
    t = 0,
    output;
  const subset = e.data.nodes,
    n = subset.length,
    threshold = parseFloat(e.data.threshold),
    strategy = e.data.strategy.toUpperCase(),
    metric = e.data.metric;

  if(metric == 'snps'){

    output = new Uint16Array((n * n - n) / 2);
    for (let i = 0; i < n; i++) {
      let source = subset[i];
      for (let j = 0; j < i; j++) {
        output[t++] = snps(source['_seqInt'], subset[j]['_seqInt'])
      }
    }

  } else {

    output = new Float32Array((n * n - n) / 2);
    let onInts = tn93.onInts;

    if(strategy != "HIVTRACE-G"){
      for (let i = 0; i < n; i++) {
        let source = subset[i]['_seqInt'];
        for (let j = 0; j < i; j++) {
          output[t++] = onInts(source, subset[j]['_seqInt'], strategy);
        }
      }
    } else {
      for (let i = 0; i < n; i++) {
        let source = subset[i];
        let sourceInThreshold = source['_ambiguity'] < threshold;
        let sourceSeq = source['_seqInt'];
        for (let j = 0; j < i; j++) {
          let target = subset[j];
          output[t++] = onInts(sourceSeq, target['_seqInt'],
            ((sourceInThreshold && target['_ambiguity'] < threshold) ?
              "RESOLVE" : "AVERAGE"
            )
          );
        }
      }
    }

  }

  console.log('Links Compute time: ', (Date.now() - start).toLocaleString(), 'ms');
  start = Date.now();
  postMessage({ links: output.buffer, start }, [output.buffer]);
  close();
};
