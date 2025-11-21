const isblank = /^\s*$/;

onmessage = function (e) {
  let start = Date.now();
  let text = e.data;
  if (!text || text.length == 0) return [];
  let seqs = [], currentSeq = {};
  let lines = text.split(/[\r\n]+/g);
  let n = lines.length;
  for (let i = 0; i < n; i++) {
    let line = lines[i];
    if (isblank.test(line) || line[0] == ';') continue;
    if (line[0] == '#') {
      if (i > 0) seqs.push(currentSeq);
      currentSeq = {
        id: line.slice(1),
        seq: '#'
      };
    } else {
      currentSeq.seq += line.toUpperCase();
    }
  }
  seqs.push(currentSeq);
  console.log('MEGA Parse time: ', (Date.now() - start).toLocaleString(), 'ms');
  start = Date.now();
  let encoder = new TextEncoder();
  let output = encoder.encode(JSON.stringify(seqs)).buffer;
  postMessage({ nodes: output, start: start }, [output]);
  close();
};
