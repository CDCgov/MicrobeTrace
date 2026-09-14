# MicrobeTrace Network Display Comparison

## Plain-language summary

This report compares two tuned options for displaying MicrobeTrace networks: Cytoscape WebGL and Sigma. Both were tested with the same data, node positions, visible connections, and feature requirements.

Sigma is the leading option for the feature-rich network display. It was smoother while moving through the network, opened the feature-rich view sooner, and used less complete browser and graphics memory. Cytoscape was faster for immediate selection and group collapse.

The scientific grouping rules should remain part of MicrobeTrace instead of belonging to either display library. That lets the same case, specimen, and sequence relationships support networks, tables, filters, maps, statistics, exports, and saved sessions.

## What we tested

| Test network | Size | What it represents | Why it matters |
| --- | --- | --- | --- |
| Distance network | 1,600 nodes; 537 connections | A committed MicrobeTrace genetic-distance dataset | Normal, relatively sparse network |
| Distance plus epidemiologic links | 1,600 nodes; 596 connections | The same network with 59 added epidemiologic links | Mixed connection types |
| Feature-rich network | 1,600 nodes; 3,200 connections | 40 groups, donut nodes, QC flags, uncertainty, and locations | Future MicrobeTrace display needs |

The main tests used Chrome 152. Each result is the middle value from five runs, followed by the lowest and highest values in brackets. A test failed if the requested WebGL display stopped working or if required nodes or connections were missing.

## Feature-rich network results

| Measure | Cytoscape WebGL | Sigma | Better result | What a user would notice |
| --- | ---: | ---: | --- | --- |
| Network ready | 3.65 sec [3.55-4.02] | 1.20 sec [1.16-2.68] | Sigma | The view becomes usable sooner |
| Pan smoothness | 40.2 FPS [35.7-43.2] | 60.1 FPS [60.1-60.2] | Sigma | Smoother movement |
| Zoom smoothness | 45.9 FPS [42.9-60.1] | 60.3 FPS [60.2-60.3] | Sigma | Smoother zooming |
| Selection response | 2.2 ms [1.9-2.4] | 13.2 ms [12.3-15.6] | Cytoscape | Both feel immediate; Cytoscape updates faster |
| Export | 11.9 ms [11.3-41.4] | 8.8 ms [8.2-10.7] | Sigma | Both are fast; Sigma is more consistent |
| Collapse 40 groups | 60.0 ms [52.4-71.9] | 93.4 ms [88.5-102.1] | Cytoscape | Both feel immediate |
| Reopen all groups | 316.6 ms [252.9-487.6] | 191.2 ms [181.4-211.5] | Sigma | Grouped data returns sooner |

Sigma stayed at roughly 60 FPS for every pan and zoom run. This was the clearest performance difference between the two tuned implementations.

## Complete browser and graphics memory

These measurements use five fresh Chrome processes per renderer on Windows. Each run tracks the complete seven-process Chrome group: the browser, page renderers, utilities, GPU process, and crash handler. Readings were taken before loading the dataset and at four later checkpoints. The largest checkpoint is called "peak observed"; it is not a continuous maximum.

| Complete Chrome memory | Cytoscape WebGL | Sigma | Difference |
| --- | ---: | ---: | --- |
| Starting working memory | 1,029.8 MiB [1,026.8-1,047.3] | 1,041.2 MiB [1,026.5-1,073.9] | Similar starting point |
| Added working memory | 1,153.6 MiB [1,034.6-1,184.6] | 553.8 MiB [295.1-626.5] | Sigma used about 600 MiB less |
| Final working memory | 2,186.1 MiB [2,061.4-2,213.5] | 1,595.0 MiB [1,369.0-1,667.5] | Sigma used about 27% less overall |
| Added private memory | 1,131.2 MiB [1,010.7-1,160.9] | 531.4 MiB [266.0-601.8] | Sigma used about 53% less added memory |
| Peak observed working memory | 2,186.1 MiB [2,076.9-2,213.5] | 1,596.8 MiB [1,483.3-1,667.5] | Sigma used about 589 MiB less |

| Graphics memory | Cytoscape WebGL | Sigma | Difference |
| --- | ---: | ---: | --- |
| Starting graphics memory | 125.4 MiB [121.9-138.5] | 141.1 MiB [139.7-162.6] | Similar starting range |
| Added graphics memory | 510.7 MiB [390.8-529.8] | 328.2 MiB [117.6-333.3] | Sigma used about 183 MiB less |
| Final graphics memory | 649.2 MiB [512.6-657.9] | 470.9 MiB [280.2-474.3] | Sigma used about 28% less overall |
| Peak observed graphics memory | 656.1 MiB [535.5-684.3] | 470.9 MiB [282.2-474.3] | Sigma used about 185 MiB less |

This computer uses shared graphics memory, so its dedicated GPU reading was zero. The table reports the shared memory actively assigned to Chrome. We also measured JavaScript memory separately: Cytoscape added 83.1 MiB [82.6-84.5], while Sigma added 41.2 MiB [41.1-42.5]. JavaScript memory is useful for diagnosis, but it is only one part of the complete browser total.

## Representative MicrobeTrace networks

The representative networks have fewer visible connections than the feature-rich network. The two display systems performed similarly for opening and moving around these networks.

| Network | Measure | Cytoscape WebGL | Sigma | Plain-language result |
| --- | --- | ---: | ---: | --- |
| Distance | Network ready | 1.22 sec [0.92-1.43] | 1.19 sec [0.81-2.16] | No meaningful typical difference |
| Distance | Pan smoothness | 55.3 FPS [3.7-60.2] | 53.0 FPS [47.2-60.2] | Similar medians; Cytoscape had one large pause |
| Distance | Zoom smoothness | 55.6 FPS [46.1-60.4] | 54.1 FPS [46.8-60.2] | Similar |
| Distance | Selection response | 0.8 ms [0.7-1.0] | 6.4 ms [5.7-6.9] | Cytoscape is faster; both feel immediate |
| Distance plus epidemiologic links | Network ready | 1.23 sec [0.80-1.82] | 1.31 sec [0.93-3.33] | No meaningful typical difference |
| Distance plus epidemiologic links | Pan smoothness | 51.9 FPS [43.5-60.1] | 49.5 FPS [21.0-58.3] | Similar medians; both had occasional pauses |
| Distance plus epidemiologic links | Zoom smoothness | 51.9 FPS [44.6-60.5] | 49.2 FPS [33.3-59.0] | Similar |
| Distance plus epidemiologic links | Selection response | 0.8 ms [0.7-1.0] | 6.3 ms [6.2-16.5] | Cytoscape is faster; both feel immediate |

Both systems showed all required connections. The important performance difference appears when richer visual features and more connections are added.

## Feature and reliability scorecard

| User need | Cytoscape WebGL | Sigma | Current result |
| --- | --- | --- | --- |
| Mixed-value donut nodes | Added Canvas drawing layer | Custom WebGL symbols | Both pass; Sigma is smoother at feature scale |
| Groups and cluster outlines | Built-in parent/child groups plus shared collapse rules | Custom outlines plus shared collapse rules | Membership, dragging, selection, and statistics pass |
| QC and uncertainty markers | Added Canvas drawing layer | Custom WebGL symbols | Both pass for all 1,600 nodes |
| Collapse and reopen groups | Shared MicrobeTrace rules | Same rules | Data, selections, and statistics are preserved |
| Geographic positions | Shared positions and reference overlay | Same | Positions, group centers, export, and restore pass |
| Selection and highlighting | Fast built-in selection | Targeted partial update | Mouse, keyboard, group, neighbor, and cross-view behavior pass |
| Export and saved sessions | Complete image/SVG export and session restore | Same | Expanded and collapsed views restore correctly |
| Accessibility | Shared keyboard controls and text descriptions | Same | Automated checks pass; manual screen-reader check remains |
| WebGL interruption | Switches to a Canvas display | Recreates the WebGL display | Both retain the network and selection state |
| Browser coverage | Chrome full run; Edge secondary check | Same | Both current target browsers pass |

Both systems create complete PNG and SVG exports. The SVG contains the complete image, but its individual shapes are not fully editable. That only matters if editable artwork is a requirement.

## Grouping should belong to MicrobeTrace

Cytoscape can store parent/child relationships inside its display library. Sigma cannot do that by itself. MicrobeTrace does not need to choose a display library based only on this difference.

MicrobeTrace now owns the grouping rules and asks each library to draw the result. The same case, specimen, and sequence relationships can therefore support tables, filters, maps, statistics, exports, and saved sessions.

| MicrobeTrace controls | Cytoscape displays | Sigma displays |
| --- | --- | --- |
| Which records belong to each group | Parent/child nodes or a collapsed group | A group outline or a collapsed group |
| Group counts, donut values, and location centers | The calculated group result | The same calculated group result |
| Which groups are open or closed | The matching visible nodes and connections | The same visible nodes and connections |
| Selections and saved state | The matching highlight and camera position | The matching highlight and camera position |

## Main tradeoffs and recommendation

| Consideration | Advantage | Why |
| --- | --- | --- |
| Smooth feature-rich networks | Sigma | Its custom WebGL symbols avoid repeatedly drawing node features in an added Canvas layer |
| Complete measured memory | Sigma | It added about 600 MiB less Chrome working memory and about 183 MiB less graphics memory |
| Built-in parent/child graph support | Cytoscape | The capability is already part of Cytoscape |
| Immediate selection and collapse | Cytoscape | Its measured response times were lower |
| Customization and isolation | Sigma | Its display code is separate and easier to extend |
| Fallback without WebGL | Cytoscape | It can continue with its Canvas display; Sigma currently recreates WebGL |

Continue with Sigma as the leading option for the next MicrobeTrace network display. Keep grouping and scientific rules in MicrobeTrace so the application is not tied to either library.

## Test record

- Representative performance: 20 measurements passed.
- Feature-rich performance: 10 measurements passed.
- Complete fresh-browser and graphics memory: 10 measurements passed on September 14, 2026.
- Feature, accessibility, saved-session, and WebGL-recovery checks: 5 automated tests passed.
- Memory result IDs: `2026-09-14T15-55-34-090Z` through `2026-09-14T16-06-59-073Z`.
