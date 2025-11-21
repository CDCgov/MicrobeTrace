**Please note that this page is for developers and system administrators, and likely does not contain any information relevant to users of MicrobeTrace.**

This is the MicrobeTrace API (as of 2019-05). All functions are accessed through the `app` global (e.g. `app.DFS`).

In general, these are stateless functions, but there are a few exceptions. These are exceptions indicated by a *.

* `ab2str(buf)`:
* `addLink(newLink, check)`:
* `addNode(newNode)`:
* `align(params, callback)`:
* `applyGHOST(ghost)`:
* `applyHIVTrace(hivtrace)`:
* `applySession(data, startTime)`:
* `applyStyle(style)`:
* `blobifySVG(svgString, width, height, callback)`:
* `cacheLayout(contentItem)` - 
* `capitalize(c)` - 
* `componentCache`*: {}
* `computeConsensus(callback)`:
* `computeConsensusDistances(callback)`
* `computeDM(callback)`
* `computeDegree()`
* `computeDirectionality(callback)`
* `computeLinks(subset, callback)`
* `computeNN(metric, callback)`
* `computePatristicMatrix(type, callback)`
* `computeTree(type, callback)`
* `computeTriangulation(metric, callback)`
* `contrastColor(hexcolor)`
* `createLinkColorMap()`
* `createNodeColorMap()`
* `dataSkeleton()`
* `decoder`*: TextDecoder
* `defaultLink()`
* `defaultNode()`
* `defaultWidgets`*: {...}
* `DFS(id)`
* `exportHIVTRACE()`
* `finishUp(oldSession)`
* `generateSeqs(idPrefix, count, snps, seed)`
* `geoDM()`
* `getHelp(target, callback)`
* `getMapData(type, callback)`
* `getVisibleClusters(copy)`
* `getVisibleLinks(copy)`
* `getVisibleNodes(copy)`
* `haversine(a, b)`
* `launchView(view, callback)`
* `loadLayout(component, parent)`
* `manifest`*: {} - literally just a parsed copy of [`package.json`](https://github.com/CDCgov/MicrobeTrace/blob/master/package.json)
* `mapData`*: {} - caches the GeoJSON required by the Map and Globe views. Data is lazy-loaded, so this should be empty until such a view is launched.
* `parseFASTA(text, callback)`
* `processJSON(json, extension)`
* `processSVG(svg)`
* `r01()` - a mask on Math.random to help my automated security scanner chill out.
* `reset()`
* `sessionSkeleton()`
* `setLinkVisibility()`
* `setNodeVisibility()`
* `str2ab(str)`
* `tagClusters()`
* `tempSkeleton()`
* `titleize(title)`
* `unparseDM(dm)`
* `unparseFASTA(nodes)`
* `unparseMEGA(nodes)`
* `unparseSVG(svgNode)`
* `updateNetwork(hideSingletons)`
* `updateStatistics()`
* `updateThresholdHistogram()`
* `watermark`*: data-encoded string of [the MicrobeTrace logo](https://github.com/CDCgov/MicrobeTrace/blob/master/img/image256.png)