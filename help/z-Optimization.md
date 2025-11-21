## You probably don't need to optimize

Seriously! Take a breath, think about it for awhile, go for a walk. Meditate on this:

![Premature Optimization is the Root of All Evil - Don Knuth](https://media.licdn.com/dms/image/C4E12AQEGu74JtFhsow/article-cover_image-shrink_423_752/0?e=1570060800&v=beta&t=my5SUt4RLtsAZ0IKl58f-EaiOQi2O2DtrTfNhXF5dYc)

Trying to optimize your code is very likely to get you nowhere at all, cost you considerable development time and effort, and make your code less readable in the process.

Not convinced? OK, fine. But if you waste a bunch of effort for millisecond speedups that the users will never notice, **don't say I didn't warn you**.

## Why you might need to optimize your code

Modern Javascript is a surprisingly quick language. But "surprisingly quick" doesn't protect you from doing some stupid O(n^2) operation. MicrobeTrace operations are often O(n^2) in the number of nodes, so we must be careful about what kinds of data manipulations we're kicking off.

## Start with Benchmarking

Software development is, fundamentally, the scientific method shrunk down to teeny, tiny cycles. You want an outcome, hypothesize that a given change in the code will accomplish that, implement the change, and run the code to see if the hypothesis was correct. Just because it's a very small, very fast cycle doesn't excuse us from doing _good_ science. **If you want to optimize, you must benchmark**. Otherwise, you have ~50% chance of making your code _slower_ with any given change. (That's why MicrobeTrace logs a bunch of benchmarks to the console every time it runs.)

If you want to test something out, there are a ton of good benchmarking libraries and tools in Javascript. Under the hood, most of them are doing the following:

1. Run `let start = Date.now();`
2. Do the thing you're measuring the speed of.
3. Run `let end = Date.now();`
4. Store/Report the value of `end-start`, which will be your thing's runtime, in milliseconds.

So there's no need to build an elaborate pipeline with unit-test style benchmarking. You can run experiments right in your browser, using this approach. Here's a snippet to get you started:

```javascript
let start = Date.now();
/* Do your thing here*/
console.log("Your thing took:", Date.now() - start, "ms");
```

## Things to Try

### Cache stuff with abandon

In general, MicrobeTrace is more compute-constrained than memory constrained. So, whenever possible, we should trade computational costs for memory costs. (That's the entire point of the global `temp` object, by the way.)

For example, calling `session.data.nodes` on every iteration of a loop is a hell of a lot slower than caching it outside the loop and calling the reference:

```javascript
for(let i = 0; i < session.data.nodes.length; i++){
  console.log(session.data.nodes[i].id);
}
```

There are two good opportunities for caching above. The obvious one is the call to `session.data.nodes` inside the loop. Let's fix that:

```javascript
let nodes = session.data.nodes;
for(let i = 0; i < nodes.length; i++){
  console.log(nodes[i].id);
}
```

The second is in looping logic: we're looking up the length of the array on every single iteration. It's much faster to just look up an integer we leave hanging around for this:

```javascript
let nodes = session.data.nodes;
let numNodes = nodes.length;
for(let i = 0; i < numNodes; i++){
  console.log(nodes[i].id);
}
```
And there you go.

### Replace Functional Code with Procedural Equivalents

I know, I know, everyone loves functional programming. Sometimes it seems like you can't learn a smidgen of it without jumping on the [lodash](https://lodash.com/) bandwagon, and then that's too softcore so you start using [Ramda](https://ramdajs.com/), and before you know it, you're writing all your web apps in [Clojure](https://clojurescript.org/). Or something like that.

Don't get me wrong, functional code is great! It can really help to clarify your code, whether that's a simple call to `Array.filter` or totally buying in to [Haskell](https://www.haskell.org/). But in Javascript (in 2019), **native functional operations are slower than procedural equivalents**. To see this, try running:

```javascript
let visibleLinks = session.data.links.filter(link => link.visible);
```

Returns just the visible links, right? Simple, elegant, and annoyingly slow. Compare to this clunky monster (inspired by the above)

```javascript
let links = session.data.links;
let numLinks = links.length;
let visibleLinks = [];
for(let i = 0; i < numLinks; i++){
  let link = links[i];
  if(link.visible) visibleLinks.push(link);
}
```
Ends up with a usable `visibleLinks`, right? If you're going for speed, it's a clear winner. This is especially clear when you would ordinarily perform chained operations, like so:

```javascript
var sumDistances = session.data.links
  .filter(link => link.visible)
  .map(link => link.distance)
  .reduce((a, b) => a + b)
```
...Versus...

```javascript
let links = session.data.links;
let numLinks = links.length;
let sumDistances = 0;
for(let i = 0; i < numLinks; i++){
  let link = links[i];
  if(link.visible){
    sumDistances = sumDistances + link.distance;
  }
}
```
In the functional version, we had to loop over the data three times: once to filter out the visible links, once to get just the distances, and once to reduce them into a single value. In the procedural version, all these operations are crammed into a single loop.

(Note that if you use [chaining in Lodash](https://lodash.com/docs/4.17.15#chain), a lot of this advantage dissipates, because [Lodash chains use Lazy evaluation](http://filimanjaro.com/blog/2014/introducing-lazy-evaluation/).)

Plus procedural loops can be broken as soon as you find the thing you need, get the amount you need, or finish just enough of your process. Functional loops have to finish their entire cycle through the data. That alone can make a huge (linear) difference.

### Reduce the stack of your function calls

One reason that procedural code runs faster that functional code is that functional code uses, well, functions, which need to be pulled off the call stack. In a loop, those instructions are already hot in your machine's core. This call-stack-as-bottleneck can occur anytime we call a function. So, if you can avoid it, don't call that function! If the logic is only used there, drop the function's logic there and save yourself the function call.

## Last resorts

### Do it on a Canvas

A lot of MicrobeTrace's slowness comes from its reliance on SVG elements (especially in the 2D Network). If you can render your visualization on a Canvas instead, the browser only needs to track a single DOM node. You can (hopefully) imagine what an advantage this would be. There are a ton of other issues that come with canvas rendering, so it's a dangerous tack. You have been warned!

### Does this need to be done *now*?

If you're working on a computation that the user won't interact with immediately, then you can shove it off to a [Web Worker](https://developer.mozilla.org/en-US/docs/Web/API/Worker). Then you just make any widgets related to this data invisible until the Web Worker returns.

All best practices apply in Web worker world, with one additional nuance: Odds are you'll be transferring a lot of data, so be sure to store your data in a [Transferable](https://developer.mozilla.org/en-US/docs/Web/API/Transferable) data type.

### Maybe don't do that?

MicrobeTrace is designed to work on datasets on the order of ~100 nodes. It's also designed to scale up to datasets of up to ~2500 nodes. Making a thing that works well on 100 nodes doesn't mean that it will continue to work well north of 500. So, maybe you can write a condition into the feature that will prevent it from running if it's going to hog resources and make the damn thing unusable.