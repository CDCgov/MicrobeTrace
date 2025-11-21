importScripts('../vendor/patristic.min.js');

onmessage = function(e){
  const start = Date.now();
  const links = e.data.links;
  const n = links.length;
  const tree = patristic.parseJSON(e.data.tree);
  let flips = new Uint8Array(n);
  for(let i = 0; i < n; i++){
    const link = links[i];
    const source = tree.getDescendant(link.source);
    const target = tree.getDescendant(link.target);
    if(source instanceof patristic.Branch && target instanceof patristic.Branch){
      if(target.sources(source)){
        flips[i] = 1;
      }
    }
  }
  console.log('Directionality Inference time: ', (Date.now()-start).toLocaleString(), 'ms');
  postMessage({output: flips.buffer, start: Date.now()}, [flips.buffer]);
  close();
};
