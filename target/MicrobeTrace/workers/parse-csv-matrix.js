importScripts("../vendor/papaparse.min.js");

onmessage = function(e) {
  let start = Date.now();
  const text = e.data;
  let nodeIDs, n;
  let links = [];
  Papa.parse(text, {
    skipEmptyLines: "greedy",
    fastMode: true,
    chunk: function(result) {
      let rowsInChunk = result.data.length;

      if (result.data[0][0].replace(/\"/g, '').replace(/\'/g, '')) {  // triangle matrix
        let topNodeIDs = [''];
        for (let rowInChunk = 0; rowInChunk < rowsInChunk; rowInChunk++) {
          const nodeID = result.data[rowInChunk][0];
          topNodeIDs.push(nodeID);
        }
        result.data.unshift(topNodeIDs);
        rowsInChunk++;
      }

      for (let rowInChunk = 0; rowInChunk < rowsInChunk; rowInChunk++) {
        const row = result.data[rowInChunk];
        if (nodeIDs) {
          const source = "" + row[0];
          for (let j = 1; j < n; j++) {
            const target = "" + nodeIDs[j];
            if (source == target) continue;
            links.push({
              source: source,
              target: target,
              distance: parseFloat(row[j])
            });
          }
        } else {
          nodeIDs = row;
          n = nodeIDs.length;
        }
      }
    },
    complete: function() {
      console.log("CSV Matrix Parse time: ", (Date.now() - start).toLocaleString(), "ms");
      start = Date.now();
      const encoder = new TextEncoder();
      const output = encoder.encode(
        JSON.stringify({
          links: links,
          nodes: nodeIDs.slice(1)
        })
      ).buffer;
      postMessage({ data: output, start: start }, [output]);
      close();
    }
  });
};
