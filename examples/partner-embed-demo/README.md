# MicrobeTrace Partner Embed Demo

This proof of concept runs a local partner application on `http://127.0.0.1:4300` and loads the real MicrobeTrace embed SDK from `http://localhost:4200`.

Run it with two terminals:

```sh
npm start
npm run demo:partner-embed
```

Then open `http://127.0.0.1:4300`.

For the threaded-WebAssembly/COOP bridge proof of concept, open
`http://127.0.0.1:4300/isolated.html`. That page is served with
`Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp`, while
`/microbetrace-export.html` deliberately receives neither header. The isolated
page stages a tiny Newick handoff in same-origin IndexedDB and immediately opens
the bridge. A second click in the bridge invokes the normal MicrobeTrace SDK.

The demo server applies route-specific headers in
`scripts/serve-partner-embed-demo.js`. Production partners must implement the
same exception in their own hosting layer; copying the HTML alone is not enough.

The approved path intentionally omits `target`, so the SDK infers the MicrobeTrace root from the SDK script URL. The page also includes buttons that demonstrate two failure cases:

- an explicit cross-origin `target` rejected by the SDK before data is sent
- a script-like payload rejected by the receiver before MicrobeTrace loads the dataset

The demo uses the checked-in `local-dev` partner allowlist entry, which allows `http://localhost:4300` and `http://127.0.0.1:4300`.
