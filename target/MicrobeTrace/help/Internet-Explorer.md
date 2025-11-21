MicrobeTrace is not compatible with Internet Explorer, and probably never will be.

(Please note that the remainder of this page is developer-focused documentation.)

## Why?

MicrobeTrace makes extensive use of ECMAScript 6 features. Internet Explorer's compatibility with these is [virtually non-existent](http://kangax.github.io/compat-table/es6/#ie11), and [unlikely to ever be implemented](https://www.microsoft.com/en-us/windowsforbusiness/end-of-ie-support).

## What about Polyfills?

We can [polyfill](https://en.wikipedia.org/wiki/Polyfill_(programming)) those features that don't alter the syntax of the language (for example, [`Array.prototype.includes`](https://tc39.github.io/ecma262/#sec-array.prototype.includes)), but MicrobeTrace uses non-polyfillable syntactic extensions to Javascript, like [Arrow Functions](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/Arrow_functions) and [template literals](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals).

## What about Babel?

Good Question! We could possibly build IE-compatibility by structuring a build system around the [Babel interpreter](https://babeljs.io/), which can be set to [target IE11](https://babeljs.io/docs/plugins/preset-env/#targetsbrowsers) (or even possibly earlier versions). If MicrobeTrace ever becomes IE-compatible, it will almost certainly because of Babel (or some sort of successor to it).

We've never built Babel into the production pipeline because we haven't needed to (yet). If you urgently need IE Support in MicrobeTrace for a cluster investigation, please [file an issue requesting it](https://github.com/CDCgov/MicrobeTrace/issues/new).