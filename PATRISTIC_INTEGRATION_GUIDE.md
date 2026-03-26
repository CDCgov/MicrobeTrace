# Patristic Engine Integration Guide

## Files Created (Phase 1)

1. **`src/app/workers/patristic-engine.types.ts`** — Shared types for worker messages
2. **`src/app/workers/patristic-engine.worker.ts`** — Web Worker with flat tree, LCA, thresholded edge generation

## Files Modified (Phase 1)

3. **`src/app/workers/workModule.ts`** — Added `getPatristicWorker()` and `terminatePatristicWorker()`
4. **`src/app/contactTraceCommonServices/worker-compute.service.ts`** — Added `computePatristicEdges()`, `initPatristicTree()`, `buildPatristicEdges()`, `cancelPatristicJob()`

## Remaining Integration: files-plugin.component.ts

### What to change

The newick loading block at **lines 1271-1318** needs to be replaced with an async worker call.

### Current code (lines 1271-1318):

```typescript
} else { // if(file.format === 'newick'){

  this.commonService.resetData();
  let links = 0;
  let newLinks = 0;
  let newNodes = 0;
  this.commonService.session.data.newickString = file.contents;
  const tree = patristic.parseNewick(file.contents);                    // O(N)
  let m = tree.toMatrix(), matrix = m.matrix, labels = m.ids.map(...); // O(N^2) ← PROBLEM
  const maxRow = matrix.map(function(row){ return Math.max.apply(Math, row); });
  const maxMax = Math.max.apply(null, maxRow);
  if (maxMax > 1) {
    // ... set distance metric to snps ...
  }
  for (let i = 0; i < n; i++) {                                        // O(N^2) ← PROBLEM
    const source = labels[i];
    newNodes += this.commonService.addNode({ _id: source, origin: origin }, check);
    for (let j = 0; j < i; j++) {
      newLinks += this.commonService.addLink({
        source: source, target: labels[j], origin: origin,
        distance: parseFloat(matrix[i][j]),
        distanceOrigin: file.name, hasDistance: true
      }, check);
      links++;
    }
  }
  console.log('Newick Tree Parse time:', ...);
  this.showMessage(...);
  this.showMessage(...);
  if (fileNum === nFiles) this.processData();
}
```

### Step 1: Add WorkerComputeService injection

In the constructor (~line 102):

```typescript
constructor(
  @Inject(BaseComponentDirective.GoldenLayoutContainerInjectionToken) private container: ComponentContainer,
  elRef: ElementRef,
  private eventEmitterService: EventEmitterService,
  public commonService: CommonService,
  private cdr: ChangeDetectorRef,
  private store: CommonStoreService,
  private embedHandoffService: EmbedHandoffService,
  private ngZone: NgZone,
  private workerCompute: WorkerComputeService  // ← ADD THIS
) {
```

Add the import at the top of the file:

```typescript
import { WorkerComputeService } from '../contactTraceCommonServices/worker-compute.service';
```

### Step 2: Replace the newick block (lines 1271-1318)

```typescript
} else { // if(file.format === 'newick'){

  this.commonService.resetData();
  this.commonService.session.data.newickString = file.contents;

  // Get threshold for the worker
  const threshold = parseFloat(this.commonService.session.style.widgets['link-threshold'])
    || Infinity; // Use Infinity if no threshold set, to get all edges

  // Use the patristic engine worker instead of tree.toMatrix()
  this.workerCompute.computePatristicEdges(
    file.contents as string,
    threshold,
    this.commonService.addLink.bind(this.commonService),
    this.commonService.filterXSS,
    this.commonService.session
  ).then(({ newLinks, totalLinks, leafNames }) => {
    // Add nodes
    let newNodes = 0;
    for (let i = 0; i < leafNames.length; i++) {
      newNodes += this.commonService.addNode({
        _id: leafNames[i],
        origin: origin,
      }, check);
    }

    console.log('Newick Tree Parse time:', (Date.now() - start).toLocaleString(), 'ms');
    this.showMessage(` - Parsed ${newNodes} New, ${leafNames.length} Total Nodes from Newick Tree.`);
    this.showMessage(` - Parsed ${newLinks} New, ${totalLinks} Total Links from Newick Tree.`);
    if (fileNum === nFiles) this.processData();

  }).catch((err) => {
    console.error('Patristic engine error:', err);
    this.showMessage(` - Error processing Newick tree: ${err.message}`);
  });
}
```

### Important notes on the integration:

1. **The `maxMax > 1` SNP detection is removed.** With the worker, we don't have the full matrix to check max values. Options:
   - Have the worker report max distance in TREE_READY response (add `maxDistance` field)
   - Or: check after edges arrive — if any `batch.distances[k] > 1`, switch to SNPs mode
   - Simplest: add a max-distance field to TREE_READY. See below.

2. **The `origin` variable** comes from `const origin = [file.name]` at line 732. The worker-compute service currently hardcodes `['Newick Tree']` — change this to pass `origin` as a parameter.

3. **The `check` variable** comes from `const check = nFiles > 0` at line 721.

4. **`processData()` call** — since the worker is async, `processData()` will now be called in the `.then()` callback rather than synchronously. This means other files in the sort order may process before the newick edges arrive. If newick is always first (it's second in hierarchy after auspice), this should be fine.

### Step 3: Add maxDistance to worker (recommended)

To preserve the SNP-detection heuristic (`maxMax > 1`), add this to the worker's TREE_READY response:

In `patristic-engine.types.ts`, add to `PatristicTreeReadyResponse`:
```typescript
/** Maximum root-to-tip depth (useful for SNP vs. genetic distance detection). */
maxRootDepth: number;
```

In `patristic-engine.worker.ts`, in the INIT_TREE handler:
```typescript
// Compute max root depth for SNP detection heuristic
let maxDepth = 0;
for (let i = 0; i < currentTree.leafCount; i++) {
  const d = currentTree.rootDepth[currentTree.leafNodeIndex[i]];
  if (d > maxDepth) maxDepth = d;
}

respond({
  type: 'TREE_READY',
  jobId,
  leafCount: currentTree.leafCount,
  nodeCount: currentTree.nodeCount,
  leafNames: currentTree.leafNames,
  maxRootDepth: maxDepth,
});
```

Then in files-plugin.component.ts, check `treeReady.maxRootDepth * 2 > 1` to decide if distances are SNPs. (The maximum patristic distance between any two leaves is at most 2 * maxRootDepth.)

---

## Remaining Integration: auspiceHandler.ts

### Current code (lines 173-182):

```typescript
public run = (jsonObj) => {
  const newickString = this.treeToNewick(jsonObj.tree, false, true);
  const fullTree = this.parseAuspice(jsonObj);
  const distanceMatrix = patristic.parseNewick(newickString).toMatrix();  // ← PROBLEM
  const updatedTree = this.combineMutations(fullTree);
  this.makeLinksFromMatrix(distanceMatrix);                                // ← PROBLEM
  const bareNewickString = this.treeToNewick(jsonObj.tree, false, false);
  this.nodeList = this.addLatLong(this.nodeList, jsonObj.meta);
  return { nodes: this.nodeList, links: this.linkList, tree: updatedTree, newick: bareNewickString };
}
```

### Recommended change:

Stop computing the distance matrix in the auspice handler. Instead, return the newick string and let the same patristic worker handle edge generation:

```typescript
public run = (jsonObj) => {
  const newickString = this.treeToNewick(jsonObj.tree, false, true);
  const fullTree = this.parseAuspice(jsonObj);
  const updatedTree = this.combineMutations(fullTree);
  // Don't compute matrix here — let the patristic worker handle it
  const bareNewickString = this.treeToNewick(jsonObj.tree, false, false);
  this.nodeList = this.addLatLong(this.nodeList, jsonObj.meta);
  return { nodes: this.nodeList, links: [], tree: updatedTree, newick: bareNewickString, newickWithLabels: newickString };
}
```

Then in files-plugin.component.ts where auspice is processed (~line 733-796), after adding nodes, use the worker for edge generation:

```typescript
// After auspice processing adds nodes...
await this.workerCompute.computePatristicEdges(
  auspiceData.newickWithLabels,
  threshold,
  this.commonService.addLink.bind(this.commonService),
  this.commonService.filterXSS,
  this.commonService.session
);
```

---

## Testing Checklist

### Unit tests for patristic-engine.worker.ts:

- [ ] **Simple 3-leaf tree**: `((A:1,B:2):1,C:3);` — verify distances A-B=3, A-C=5, B-C=6
- [ ] **Star topology**: `(A:1,B:1,C:1);` — all pairwise = 2
- [ ] **Zero-length branches**: `((A:0,B:1):0,C:1);` — A-B=1, A-C=1, B-C=2
- [ ] **Single leaf**: `(A:1);` — no edges, no crash
- [ ] **Threshold filtering**: Tree with distances [1, 2, 5, 10], threshold=3 → only edges with d<=3
- [ ] **Batch streaming**: 100-leaf tree, batchSize=10 → multiple batches, last has `done=true`
- [ ] **Cancellation**: Start BUILD_EDGES, send CANCEL, verify no more batches
- [ ] **Duplicate leaf names**: Should return ERROR
- [ ] **Negative branch lengths**: Should return ERROR
- [ ] **Empty newick string**: Should return ERROR
- [ ] **Reroot invariance**: Same tree rerooted → identical pairwise distances

### Integration tests:

- [ ] Load a newick file → correct number of nodes and links appear
- [ ] Threshold slider change → re-queries worker, doesn't reparse tree
- [ ] Load auspice file → correct patristic edges
- [ ] Load newick then load different newick → old tree replaced
- [ ] .microbetrace export/import round-trip preserves edges

### Benchmark targets:

| Taxa | Current | Target (Phase 1) | Target (Phase 2+) |
|------|---------|-------------------|--------------------|
| 500  | ~5-10s  | < 2s              | < 1s               |
| 1000 | fails   | < 5s              | < 2s               |
| 2000 | fails   | < 15s             | < 5s               |
| 5000 | fails   | may be slow       | < 15s              |
