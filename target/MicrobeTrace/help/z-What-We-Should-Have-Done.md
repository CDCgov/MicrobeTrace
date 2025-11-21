All software development is compromise. You must balance the skills of the team you have against the challenges of the requirements put before them. You must select a technology stack which they are either familiar with, or possess the meta-skills necessary to become fluent in time to deliver a finished product. Such was the case with MicrobeTrace.

## What We Should've Used

This is intended as a post-mortem. Writing in 2019, we have the benefit of understanding which technologies from 2017 would still be standing. But we couldn't reasonably expect to be able to predict this in advance. Even so, imagining we could, this is the technology stack we might adopt:

### [WebAssembly](https://webassembly.org/)

Much of MicrobeTrace's heavy-duty computation is Javascript which has been ported (by hand) from equivalent C, C++, or Python code. But for that C code, we could instead just transpile it using [Emscripten](https://emscripten.org/). In fact, this has been done for [libtn93](https://github.com/sdwfrost/libtn93/blob/master/emscripten/libtn93wasm.js).

### [Typescript](https://www.typescriptlang.org/)

MicrobeTrace has a lot of non-type-safe interactions. Javascript and the Browser sort of invite these shenanigans (with foolish architectural oddities like setting the `value` attribute of `<input type="number">` to a string instead of a number.

### [React](https://reactjs.org/) [(with JSX)](https://reactjs.org/docs/introducing-jsx.html)

MicrobeTrace is jQuery Spaghetti. I'm slightly ashamed of this fact, but there's no sense trying to deny it. After all, it's all over the repo (which is Open Source). In 2017, the preferred method of avoiding this was to write the app with React.

### [Babel](https://babeljs.io/)

By default, browsers don't run Typescript or JSX--they run Javascript. So, any project leveraging a Javascript-analog needs a Transpiler. And basically everyone uses Babel. If MicrobeTrace were to adopt an advanced toolset requiring transpilation, then Babel would be that transpiler. But we haven't yet!

### [Webpack](https://webpack.js.org/)

MicrobeTrace is built by concatenating minified versions of Browser-targeted versions of javascript libraries into large script packages. Those packages are then committed into the repo. This is ...not best practice. There are some reasons for it! To integrate with one of our partners, we needed to develop the ability to consolidate the entire application into the smallest possible footprint. This approach was the most expedient way to do that. However, it is not the best. In particular, it precludes us from leveraging some advanced technologies for reducing the code base, like [tree shaking](https://webpack.js.org/guides/tree-shaking/).

Incidentally, MicrobeTrace might benefit _a lot_ from tree shaking, if it could leverage it. The most obvious case here is [Plot.ly](https://plot.ly/javascript/), which takes up a hefty 3.1MB uncompressed. But that includes WebGL code for 3D plots, MapBox integration code for Maps, and a wide array of plot types MicrobeTrace doesn't touch. The code for just MicrobeTrace would be closer to plotly-cartesian, weighing in at around 1MB. The only reason we aren't using it is that we need plotly-sankey, which isn't included in the cartesian build.

(The above paragraph is only sort-of true. MicrobeTrace hacks the plotly-cartesian build to include platly-sankey, shaving off those 2MB without tree shaking. But it's a useful example and the point stands.)

## What we got right

This isn't all self-flagellation. MicrobeTrace has adopted some cutting-edge technologies that have served it very well. Namely...

### [D3](https://d3js.org/)

D3 is amazing and wonderful and basically Mike Bostock is a God.

### [WebWorkers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API)

Don't lock the main thread! If you're gonna think for awhile, do it behind the scenes! It isn't trivial to get WebWorkers up and running, but once you get the hang of it, you can really improve your performance. MicrobeTrace did!

### ES5+

We thought about building MicrobeTrace with support for IE9+. We really did. But at some point, we needed a thing it couldn't do, and we didn't care enough to try to save it. We still don't. If you're using IE, you're literally doing the internet wrong and I can't be responsible for getting you to do it properly.

Developing MicrobeTrace got a lot easier when we started just using newer Javascript Features and not worrying about whether or not our users browsers were prepared to support them.

## Dead Ends We Tried

Some new technologies we did try, but they didn't work (or didn't work for us). They are...

### Multiple Parallelization

At some point in MicrobeTrace's history, we moved from a single-threaded architecture to a Multi-threaded architecture (see [WebWorkers](#WebWorkers) above). In conjunction with this effort, we attempted to distribute jobs across as many threads as the user's machine had cores (a la [hamsters](https://hamsters.io/)). The only problem is that Browsers (at least at the time, mid-2018) don't seem to let you abuse them in this way. We got a speedup by moving off the DOM thread, but a major speed loss by attempting to distribute the work between many cores.

### [GPU.js](http://gpu.rocks/)

There's nothing in principle that prevents GPU-based implementations of large matrix operations from being faster than equivalent CPU code, but there is a translation cost.

The Javascript port of TensorFlow uses this technology to good effect ([they claim](https://www.tensorflow.org/js/guide/platform_environment#webgl_backend) a ~100x speedup over performing the same computations on the CPU)
