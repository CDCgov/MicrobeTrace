# MicrobeTrace Partner Embed Demo

This proof of concept runs a local partner application on `http://127.0.0.1:4300` and loads the real MicrobeTrace embed SDK from `http://localhost:4200`.

Run it with two terminals:

```sh
npm start
npm run demo:partner-embed
```

Then open `http://127.0.0.1:4300`.

The approved path intentionally omits `target`, so the SDK infers the MicrobeTrace root from the SDK script URL. The page also includes buttons that demonstrate two failure cases:

- an explicit cross-origin `target` rejected by the SDK before data is sent
- a script-like payload rejected by the receiver before MicrobeTrace loads the dataset

The demo uses the checked-in `local-dev` partner allowlist entry, which allows `http://localhost:4300` and `http://127.0.0.1:4300`.
