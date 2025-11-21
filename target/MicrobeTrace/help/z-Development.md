**Please note that this page is for developers and likely does not contain any information relevant to users of MicrobeTrace.**

## Architecture

MicrobeTrace is a static web application. Accordingly, everything is written in HTML, CSS, and Javascript. There is a nodejs-based express server designed for development, testing, and deploying to Heroku, but this is purely a convenience script and not required to deploy or use MicrobeTrace.

## Requirements

To develop, you're going to need a computer with:

* [git](https://git-scm.com)
* [node](https://nodejs.org/en/) and [npm](https://www.npmjs.com)
* [A good text editor](https://atom.io)

## Getting Started

To jump right to development, [Fork the repository](https://github.com/CDCgov/MicrobeTrace#fork-destination-box). Once Github finishes, open up your terminal emulator, `cd` over to your favorite projects directory, and clone your fork of the repository. i.e., run 

    git clone https://github.com/<your-github-username>/MicrobeTrace.git

This will download this repo. Next, enter the repository:

    cd MicrobeTrace

... and install the dependencies:

    npm install

This will download all of the development dependencies for this project. Note that this will download several hundred megabytes. Luckily, the dev dependencies are much, much larger than the prod dependencies, so the distribution file that should be output will only take up a few tens of megabytes.

Next, issue the following command to your command prompt:

    npm start

This will launch the server, but not your browser. Open your preferred browser and go to http://localhost:5000/ to see MicrobeTrace. Now, time for that text editor!

## Design

The basic design of MicrobeTrace works like this: first, the browser loads the [`index.html`](https://github.com/CDCgov/MicrobeTrace/blob/master/index.html) file. That file contains the core DOM for the app, as well as link and script tags for all the dependencies in the app. It also sets up the DOM components which must be [procedurally constructed](http://golden-layout.com/). Finally, it loads the contents of [`components/files.html`](https://github.com/CDCgov/MicrobeTrace/blob/master/components/files.html).

Each file in the `components/` directory mirrors the structure of `index.html`. At the top is the DOM content, followed by an in-line Javascript to set up the view's interactive features. Note that *the files in the `components/` directory are not complete HTML documents by themselves*. They aren't intended to be loaded in independent windows, but to loaded into GoldenLayout [panes](http://golden-layout.com/docs/Item.html) within the same window.

## Data

Under the hood, MicrobeTrace tracks everything it needs in three global objects: `MT`, `session`, and `temp`. `MT` contains all the mechanical functions which are required globally, but are not provided by other libraries. `session` contains all the information required to reconstruct that session of MicrobeTrace. In particular, `session.data` contains all the data used to construct the network. Finally `temp` includes stuff that must be computed on-the-fly and cannot be readily stored away in text (e.g. dynamically-created functions).

### `MT`, in detail

`MT` is almost completely created by the `scripts/common.js` file, which was used in earlier versions of MicrobeTrace to make code portable across windows. Now it is simply included in `index.html` (along with all the requisite libraries).

### `session` in detail

`session` contains all the information that is unique to that session of MicrobeTrace. Specifically:

```javascript
session.data - all the data, as Javascript objects
session.data.nodes - an array of distinct nodes (i.e. with a unique "id") as a Javascript object
session.data.links - an array of distinct, non-directed links. While we may be able to paint arrows on links, link objects are deduplicated by checking for (a.source === b.source && a.target === b.target) || (a.source === b.target && a.target === b.source), meaning we cannot represent two directed links between two nodes.
session.data.distance_matrix - an object containing an array of labels, and two-dimensional arrays of tn93s and snps.
session.data.trees - an object containing newick strings (mapped to tn93 and snps).
session.style - everything needed to color, draw and style your session.
```

## Getting your feet wet

1. Check out what's going on [in the issues](https://github.com/CDCgov/MicrobeTrace/issues). This is where we keep up-to-date documentation on bugs, feature requests, and development goals. Try [picking a feature request](https://github.com/CDCgov/MicrobeTrace/issues?q=is%3Aissue+is%3Aopen+label%3A%22%5Bissue-type%5D+enhancement%22) and see if you can implement it.
2. Testing - [(Our testing regime)](https://github.com/CDCgov/MicrobeTrace/tree/master/test) leaves something to be desired. We need to develop a battery of Unit tests, E2E tests, and adversarial tests, along with an automated testing infrastructure to verify application consistency before deployment.

### Adding a new type of view

[Follow these directions](https://github.com/CDCgov/MicrobeTrace/wiki/z-Create-a-New-View).

## Diving in headfirst

If you're interested in paying down some technical debt, here
are some good places to start.

1. The DOM Architecture - This is a biggie. Right now, this project is mostly
powered by jQuery spaghetti. It works if you (the developer) catch all the edge
cases, but there are a lot of things that can go wrong. Basically, we should probably
transition views away from jQuery towards more MV*. Try taking a view and converting
all of its functionality to React.
2. The UI - I'm no UX designer. I like to make things that look clean and friendly,
but it's easy to take pot-shots at UI design without having any substantive criticism,
so a lot of people do. Accordingly, I don't have a strong set of beliefs about whether
the UI is good or not. My suspicion is not, but changing that is hard, when this was
the best I could do to begin with. If you can take
[Bootstrap 4](https://getbootstrap.com/docs/4.1/getting-started/introduction/)
and do amazing things with it, be my guest.
3. The Algorithm - We're computing a distance matrix, which is an O(kN^2) operation, where N is the number of sequences and k is the length of the sequences. However, all we need is actually to know whether any two nodes are within some threshold of each other, not the exact distance. Accordingly, we may be able to compute a consensus sequence and distance from each node to the consensus. Then, in lieu of computing each pairwise distance, we can compute the difference and sum of their consensus distances, and if that range covers the default threshold value, only then do we know we need to compute the actual genetic distance. (Huge Hat tip to @Sergey-Knyazev for designing this scheme). Now we just need to implement it.
4. The Output - The network is rendered to the browser using [D3](https://d3js.org/), generating SVG. However, SVG is extremely costly for large networks (>1e4 elements). We should transition to [a blend](https://engineering.mongodb.com/post/d3-round-two-how-to-blend-html5-canvas-with-svg-to-speed-up-rendering) of SVG (for selection identifiers) and Canvas (for everything else) to keep the DOM from dragging.
5. The Data Architecture - we've come close to a writing fully-featured network library in javascript. It's primary components can be found in the `app` global (from `scripts/common.js`), but we've toyed with the idea of spinning it out for others to use.
6. Data Security - Being a browser-based, offline application, MicrobeTrace is pretty secure by default. However, we have some ideas about ways that data could be compromised. Most of these are (far) outside of MicrobeTrace's control, but maybe some aren't. This is a topic worth investigating, but we'd prefer to discuss it offline (for obvious reasons).

## Packaging your changes

If (and ONLY IF) you add any new libraries to MicrobeTrace, you should do the following:

1. Develop your changes however is convenient. However, please *do not* commit new script tags or css links directly into any html files. Instead:
2. Add the Javascript and CSS files to the commands in the [bundle.sh](https://github.com/CDCgov/MicrobeTrace/blob/master/bundle.sh) script. The run that script using `./bundle.sh` or `npm run build`
3. Commit the new versions of stylesheets/bundle.css, stylesheets/bundle.min.css, scripts/bundle.js, and scripts/bundle.min.js along with your changes.

## Contribute to other Open Source Projects to Help MicrobeTrace

### [NtSeq](https://github.com/keithwhor/NtSeq)

This is the library that MicrobeTrace has sometimes used for ungapped alignments. It's [blisteringly fast](http://keithwhor.github.io/NtSeq/#benchmarks-and-tests) because [it uses binary encoding and bitwise comparisons for nucleotides.](https://medium.com/@keithwhor/nbeam-how-i-wrote-an-ultra-fast-dna-sequence-alignment-algorithm-in-javascript-c199e936da). Right now, MicrobeTrace uses it sort of like this:

![](https://imgs.xkcd.com/comics/software_development.png)

MicrobeTrace could leverage this encoding scheme for faster computations, but sadly, NtSeq doesn't do much else besides Ungapped Alignments. I believe we could gain a substantial speed advantage by extending it to subsume the tasks of tn93 and bioseq (see below). 

## Libraries we built Specifically for MicrobeTrace

In addition to MicrobeTrace, several related Open Source projects have been employed, developed or improved-upon in support of MicrobeTrace. These are:

### [tn93.js](https://www.npmjs.com/package/tn93)

This is a javascript port I (Tony Boyles) wrote of
[libtn93](https://github.com/sdwfrost/libtn93), itself a C port of [TN93
implementation](https://github.com/veg/tn93) used in the original
[HIVTrace](https://github.com/veg/hivtrace). An earlier version of this project
used hivtrace along with [NetworkX](https://networkx.github.io/) to compute a
bounded minimum spanning tree of tn93 distances. Unfortunately, this
architecture proved much too cumbersome to ship with a viable product. The
javascript alternative has its downsides (most conspicuously, it's slower than
the C version). However, the Javascript solution is comparatively quick (given
that it's performing an O(n^2) operation and there's literally nothing we can
do about that).

Anyway, I've maintained tn93.js in [a separate repository](http://github.com/aaboyles/tn93.js). It works well, but its [much slower](https://twitter.com/sdwfrost/status/991971722915086336) than the version that was [transpiled from C to WebAssembly](https://github.com/sdwfrost/libtn93/tree/master/emscripten). I found the C interface to be failure-prone, but we might reconsider using it at some point in the future.

### [bioseq.js](https://github.com/AABoyles/bioseq-js)

This is the library that MicrobeTrace uses for gapped alignments. I didn't code it originally, but I added the scaffolding to make it work in Node and in Browser, and [published it on NPM](https://www.npmjs.com/package/bioseq). It's generally fine, but you should know what it is (just in case).

### [AlignmentViewer](https://github.com/AABoyles/AlignmentViewer)

In past iterations, MicrobeTrace used [MSAViewer](http://msa.biojs.net/) to show sequences. However, MSAViewer's esoteric handling of its dependencies made it a bad candidate for inclusion in a larger application like MicrobeTrace. However, there weren't any other viable alternatives, so we wrote one. It's OK, but feature-limited and possibly a bit slower than absolutely necessary.

### [patristic](https://cdcgov.github.io/patristic/)

Patristic is a phylogeny toolkit for javascript. It's pretty complete for our purposes, but it could use a more extensive testing regime. It's the data backbone for...

### [TidyTree](https://cdcgov.github.io/TidyTree/)

TidyTree is the Phylogenetic Tree Renderer we wrote for MicrobeTrace. All the others were varying degrees of terrible, and we'd had enough of it. TidyTree is not terrible, but [it can be improved](https://github.com/CDCgov/TidyTree/issues)!