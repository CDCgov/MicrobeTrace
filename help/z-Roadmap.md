**Please note that this page is for developers and likely does not contain any information relevant to users of MicrobeTrace.**

Here is the broad roadmap for MicrobeTrace (as of September 2019):

## 1. MicroReact Replication

MicrobeTrace is designed to be a versatile visualization platform. One way of achieving that is by building out functionality available in less flexible platforms. One such example is [MicroReact](https://microreact.org/showcase). MicroReact provides the user with the means to visualize Trees, Maps, Epi-curves, and Tables, all of which interact with one another (by leveraging the [MVC](https://en.wikipedia.org/wiki/Model%E2%80%93view%E2%80%93controller) powers of [React](https://reactjs.org/)). MicrobeTrace, by contrast, provides the ability to generate each of these visualizations (and many others) and lay them out visually in a similar layout to MicroReact, but provides only limited interaction between them. We would like to build up the responsive interoperability between MicrobeTrace's views to the point that MicrobeTrace effectively subsumes all of MicroReact's functionality.

The timeline on this point is unclear. It may be achievable in as little as 3 months with no modifications to MicrobeTrace's data stack. However, MicrobeTrace does not currently employ a robust model architecture, so taking this route to achieving this functionality amounts to little more than a counter-productive shortcut. The better approach will be to adopt React (or a similar UI state-management library like Angular or Vue) into MicrobeTrace. Simply performing the appropriate refactoring will likely require three months, and reintegrating MicrobeTrace's existing functionality into this new regime will require 6-9 months of development.

## 2. Algorithmic Optimization

MicrobeTrace brings ease-of-use, one-step data integration, and attractive visualization by default to non-bioinformaticists and non-data-scientists. That said, its greatest deficiency (relative to [HIV-TRACE](https://github.com/veg/hivtrace)) is capacity. MicrobeTrace chokes on analyses exceeding 2000 sequences. There are many ways that MicrobeTrace could be optimized, and a concerted approach will likely yield the most favorable results. The Optimizations include:

* **Translating MicrobeTrace's core algorithms to WebAssembly.** MicrobeTrace performs some sophisticated computations in Javascript. However, these same computations are performed by HIV-TRACE with code written in the more efficient C++ environment. MicrobeTrace could gain some of this speed back by compiling HIV-TRACE's components to [WebAssembly](https://webassembly.org/), and leveraging those implementations instead of its own pure-JS implementations. Allot 2 months for setup and testing, 4 months for integration if testing suggests the results will be positive.
* **Translating MicrobeTrace to TypeScript.** In general, MicrobeTrace isn't type-safe because Javascript isn't type-safe. By leveraging [TypeScript](https://www.typescriptlang.org/), MicrobeTrace may be able to mine some performance gains from its Javascript algorithms. Allot 3 months for an initial implementation.
* **(Non-specific optimizations.)** See [Here](https://github.com/CDCgov/MicrobeTrace/wiki/z-Optimization).

Note that each of these optimizations may be pursued independent of the others.

## 3. UI Optimization

MicrobeTrace's Network renders each node as an SVG element which the browser must independently track. Ditto each link. The result is a very laggy experience with networks in excess of 10,000 elements (which is not uncommon in networks of ~1000 nodes). MicrobeTrace could improve this performance by:

1. [Transitioning from an SVG network](https://github.com/AABoyles/MicrobeTrace/issues/35) to a [blended SVG/Canvas view](https://engineering.mongodb.com/post/d3-round-two-how-to-blend-html5-canvas-with-svg-to-speed-up-rendering/). I predict a project like this will require at least 6 months to recover most of the existing functionality of the network visualization.
2. [Transfering Render computations off-screen](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas). Contingent upon completing the above, this should require another 3 months.
3. [Tapping the GPU for rendering](https://observablehq.com/@grantcuster/using-three-js-for-2d-data-visualization). May be completed without attempting 1 or 2 above, but not advised. Architecturally, it will require extensive modification of MicrobeTrace. Allot 4-5 months in any case.

