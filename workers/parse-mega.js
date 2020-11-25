const isblank = /^\s*$/;

onmessage = function (e) {
  let start = Date.now();
  let text = e.data;
  if (!text || text.length == 0) return [];
  let seqs = [], currentSeq = {};
  let lines = text.split(/[\r\n]+/g);
  let n = lines.length;
  let header = true;
  let firstSeq = true;
  for (let i = 0; i < n; i++) {
    let line = lines[i];
    if (isblank.test(line)) continue;

    if (header && line.match(/^title/i)) {
      header = false;
      continue;
    }

    if (!header) {
      if (line[0] == "#") {

        if (!firstSeq)
          seqs.push(currentSeq);
        else
          firstSeq = false;

        currentSeq = {
          id: line.slice(1),
          seq: '#'
        };

      } else {
        currentSeq.seq += line.toUpperCase();
      }
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
