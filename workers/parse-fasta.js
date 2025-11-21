const isblank = /^\s*$/;

onmessage = function(e){
  let start = Date.now();
  let text = e.data;
  if(!text || text.length == 0) return [];
  let seqs = [], currentSeq = {};
  let lines = text.split(/[\r\n]+/g);
  let n = lines.length;
  for(let i = 0; i < n; i++){
    let line = lines[i].trim();  // issue 189, 190
    if(isblank.test(line) || line[0] == ';') continue;
    if(line[0] == '>'){
      if(i > 0) {
        currentSeq.seq = currentSeq.seq.replace(/N/g, "-");   // replace all "N" with "-"
        seqs.push(currentSeq);
      }
      currentSeq = {
        id: line.slice(1),
        seq: ''
      };
    } else {
      currentSeq.seq += line.toUpperCase();
    }
  }
  currentSeq.seq = currentSeq.seq.replace(/N/g, "-");   // replace all "N" with "-"
  seqs.push(currentSeq);
  console.log('FASTA Parse time: ', (Date.now()-start).toLocaleString(), 'ms');
  start = Date.now();
  let encoder = new TextEncoder();
  let output = encoder.encode(JSON.stringify(seqs)).buffer;
  postMessage({nodes: output, start: start}, [output]);
  close();
};
