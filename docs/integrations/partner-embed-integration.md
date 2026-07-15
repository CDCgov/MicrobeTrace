# MicrobeTrace Partner Embed Integration

This guide is for developers who want to add an `Open in MicrobeTrace` button to their own web application.

The embed flow is client-only. Your app opens a MicrobeTrace-owned receiver page in a popup or new tab, sends the dataset with `postMessage`, and MicrobeTrace stores that payload on the MicrobeTrace origin long enough to open it as a session.

Treat this flow as an authenticated data export from the partner application into MicrobeTrace. The MicrobeTrace button does not delegate the partner application's authentication, roles, row-level permissions, or audit context to MicrobeTrace. The partner application is responsible for deciding whether the signed-in user may export the selected data.

## Overview

The integration has three parts:

1. Your application includes the MicrobeTrace embed SDK.
2. Your button calls `MicrobeTraceEmbed.open(...)` or `MicrobeTraceEmbed.attachButton(...)` from a user click.
3. MicrobeTrace validates the payload, stores it as a one-time handoff, and launches the dataset.

## Prerequisites

- Your webapp origin must be allowlisted by the MicrobeTrace team.
- Your users must trigger the popup from a real click or tap. Browsers will block background popup attempts.
- Your data must fit within the partner handoff limits.
- Use the official SDK entry point instead of linking directly to the receiver page. The SDK passes your origin to the receiver so the `postMessage` handshake can use explicit target origins.
- If you pass `target`, it must be a hardcoded, approved MicrobeTrace deployment URL. Never derive it from a query string, form field, or other user-controlled value.
- Your application must authorize and audit the export before calling the SDK.
- MicrobeTrace partner handoff requires modern browsers with Web Crypto support.

The current defaults are defined in `src/assets/embed/partner-allowlist.json`:

- Max files: `10`
- Max file size: `20 MB`
- Max total payload: `50 MB`
- Handoff lifetime: `15 minutes`

## Quick Start

Add the SDK:

```html
<script src="https://microbetrace.cdc.gov/MicrobeTrace/assets/embed/microbetrace-embed.js"></script>
```

Add a button:

```html
<button id="open-microbetrace">Open In MicrobeTrace</button>
```

Wire it up:

```html
<script>
  const files = [
    {
      name: 'nodes.csv',
      mimeType: 'text/csv',
      contents: 'id,seq,group\nA,ACTG,alpha\nB,ACTA,beta\n'
    },
    {
      name: 'links.csv',
      mimeType: 'text/csv',
      kind: 'link', // optional parameter
      contents: 'source,target,distance\nA,B,1\n'
    }
  ];

  MicrobeTraceEmbed.attachButton('#open-microbetrace', {
    partnerId: 'your-partner-id',
    files,
    metadata: {
      datasetName: 'My dataset',
      sourceApp: 'My Web App'
    },
    launch: {
      datasetName: 'My dataset',
      defaultView: 'Table',
      distanceMetric: 'tn93',
      linkThreshold: 0.015,
      ambiguityStrategy: 'AVERAGE',
      globalSettings: {
        nodeColorBy: 'group',
        linkColorBy: 'distance',
        nodeColor: '#1f77b4',
        linkColor: '#a6cee3',
        nodeShape: 'ellipse',
        selectedColor: '#ff8300',
        clusterMinimumSize: 3,
        backgroundColor: '#ffffff',
        tn93DistanceDisplayFormat: 'decimal'
      }
    },
    onSuccess(result) {
      console.log('Stored handoff', result.handoffId);
    },
    onError(error) {
      console.error(error.message);
    }
  });
</script>
```

You can also call `MicrobeTraceEmbed.open(options)` directly if you want to control the button wiring yourself.

## Partner Checklist

Use this checklist before handing the integration to your users:

- Confirm your site origin is allowlisted for the correct `partnerId`.
- Confirm `target` is omitted for same-deployment SDK usage, or points at the correct MicrobeTrace deployment when explicitly supplied.
- Trigger the embed call from a direct user click or tap.
- Confirm the current user is authorized to export every row, column, sequence, identifier, and metadata value included in the payload.
- Show users that they are opening/exporting the selected dataset in MicrobeTrace; do not hide the action behind a generic or misleading control.
- Do not include session cookies, bearer tokens, API keys, signed URLs, CSRF tokens, or internal request headers in `files` or `metadata`.
- Do not include fields that are hidden in the UI unless the user is explicitly allowed to export them.
- Omit `target` when loading the SDK from the target MicrobeTrace deployment. If you must pass `target`, hardcode it and keep it on the same origin as the SDK unless `allowedTargetOrigins` has been explicitly reviewed.
- Pass conventional file names and headers when possible so auto-detection works cleanly.
- Add explicit `kind` or `options.field1/field2/field3` when your data shape is unusual.
- Use `launch` only for the curated launch defaults documented below. Do not send MicrobeTrace session JSON or raw `session.style.widgets`.
- Test one successful launch on a real browser before release.
- Test denial cases: unauthorized user, expired session, disabled export role, disallowed origin, oversized payload, and popup blocked.

## API

### `MicrobeTraceEmbed.open(options)`

Opens the receiver page, sends the payload, and resolves after MicrobeTrace stores the handoff.

Required fields:

- `partnerId`
  - The partner identifier assigned in the MicrobeTrace allowlist.
- `files`
  - One or more file payloads.

Optional fields:

- `target`
  - The root URL of your MicrobeTrace deployment.
  - Optional when the SDK is loaded from the same MicrobeTrace deployment because the SDK infers the root from its own script URL.
  - Example: `https://microbetrace.cdc.gov/MicrobeTrace/`
- `allowedTargetOrigins`
  - Exact target origins allowed when a reviewed self-hosted SDK copy must send to a different MicrobeTrace deployment.
  - Example: `['https://microbetrace.cdc.gov']`
- `metadata.datasetName`
  - Legacy dataset display name. If `launch.datasetName` is also supplied, MicrobeTrace uses `launch.datasetName` for this handoff launch.
- `metadata.sourceApp`
- `launch`
  - Curated launch defaults for the handed-off dataset.
  - Supported shape:

```js
{
  datasetName: 'My dataset',
  defaultView: '2D Network', // or Table, Map, Heatmap, Phylogenetic Tree, etc.
  distanceMetric: 'snps', // or tn93
  linkThreshold: 16,
  ambiguityStrategy: 'AVERAGE', // AVERAGE, RESOLVE, SKIP, GAPMM, HIVTRACE-G
  ambiguityThreshold: 0.015,
  globalSettings: {
    nodeColorBy: 'cluster',
    linkColorBy: 'distance',
    nodeShapeBy: 'None',
    nodeColor: '#1f77b4',
    linkColor: '#a6cee3',
    nodeShape: 'ellipse',
    selectedColor: '#ff8300',
    clusterMinimumSize: 3,
    backgroundColor: '#ffffff',
    tn93DistanceDisplayFormat: 'decimal'
  }
}
```

Supported launch settings:

| Setting | Type / allowed values | Effect |
| --- | --- | --- |
| `launch.datasetName` | string | Names this handed-off dataset. Preferred over `metadata.datasetName` when both are supplied. |
| `launch.defaultView` | `2D Network`, `Epi Curve`, `Sankey`, `Table`, `Crosstab`, `Map`, `Bubble`, `Gantt Chart`, `Phylogenetic Tree`, `Alignment View`, `Heatmap`, `Waterfall` | Chooses the first view MicrobeTrace opens after import. |
| `launch.distanceMetric` | `snps` or `tn93` | Sets the distance metric used for initial network construction. |
| `launch.linkThreshold` | non-negative number | Sets the initial filtering threshold. If both `distanceMetric` and `linkThreshold` are supplied, this custom threshold is preserved instead of being replaced by the metric default. |
| `launch.ambiguityStrategy` | `AVERAGE`, `RESOLVE`, `SKIP`, `GAPMM`, `HIVTRACE-G` | Sets the TN93 ambiguity handling strategy. |
| `launch.ambiguityThreshold` | non-negative number | Sets the ambiguity threshold used by applicable TN93 ambiguity strategies. |
| `launch.globalSettings.nodeColorBy` | `None`, generated node field such as `cluster`, or imported node field | Colors nodes by a field. |
| `launch.globalSettings.linkColorBy` | `None`, generated link field such as `origin` or `distance`, or imported link field | Colors links by a field. |
| `launch.globalSettings.nodeShapeBy` | `None`, generated node field such as `cluster`, or imported node field | Assigns node shapes by a field. |
| `launch.globalSettings.nodeColor` | 6-digit hex color, for example `#1f77b4` | Sets the fallback node color when `nodeColorBy` is `None`. |
| `launch.globalSettings.linkColor` | 6-digit hex color, for example `#a6cee3` | Sets the fallback link color when `linkColorBy` is `None`. |
| `launch.globalSettings.nodeShape` | `ellipse`, `triangle`, `rectangle`, `barrel`, `rhomboid`, `diamond`, `pentagon`, `hexagon`, `heptagon`, `octagon`, `star`, `tag`, `vee` | Sets the fallback node shape when `nodeShapeBy` is `None`. |
| `launch.globalSettings.selectedColor` | 6-digit hex color, for example `#ff8300` | Sets the selected/highlight color. |
| `launch.globalSettings.clusterMinimumSize` | non-negative number | Sets the minimum visible cluster size. |
| `launch.globalSettings.backgroundColor` | 6-digit hex color, for example `#ffffff` | Sets the initial visualization background. |
| `launch.globalSettings.tn93DistanceDisplayFormat` | `decimal` or `percentage` | Controls TN93 distance display formatting. |

If `distanceMetric` is supplied without `linkThreshold`, MicrobeTrace applies the metric's normal default threshold (`snps`: `16`, `tn93`: `0.015`). Field-based settings are validated after MicrobeTrace normalizes the imported files. If a requested node or link field is missing, the handoff fails instead of silently launching with a different setting. These launch defaults affect only this handoff. They are not persisted as the user's future MicrobeTrace defaults.
- `onSuccess(result)`
- `onError(error)`

Success result shape:

```js
{
  partnerId: 'your-partner-id',
  handoffId: '...',
  createdAt: 1782921600000,
  expiresAt: 1782922500000,
  receiverUrl: 'https://microbetrace.cdc.gov/MicrobeTrace/assets/embed/receiver.html?...',
  launch: {
    datasetName: 'My dataset',
    defaultView: 'Table',
    distanceMetric: 'tn93'
  },
  files: [
    { name: 'nodes.csv', kind: 'node', bytes: 42 }
  ]
}
```

The receipt is intentionally non-sensitive. It does not include file contents, row data, tokens, request headers, cookies, or arbitrary metadata.

### `MicrobeTraceEmbed.attachButton(selectorOrElement, options)`

Attaches the same behavior to one or more existing buttons or links.

## Framework Snippets

### React

This example assumes the SDK script is already loaded on the page.

```jsx
function OpenInMicrobeTraceButton({ nodesCsv, linksCsv }) {
  const handleClick = async () => {
    await window.MicrobeTraceEmbed.open({
      partnerId: 'your-partner-id',
      files: [
        { name: 'nodes.csv', mimeType: 'text/csv', contents: nodesCsv },
        { name: 'links.csv', mimeType: 'text/csv', contents: linksCsv }
      ],
      metadata: {
        datasetName: 'My dataset',
        sourceApp: 'My React App'
      }
    });
  };

  return <button onClick={handleClick}>Open In MicrobeTrace</button>;
}
```

### Vue

```html
<template>
  <button @click="openInMicrobeTrace">Open In MicrobeTrace</button>
</template>

<script>
export default {
  props: {
    nodesCsv: { type: String, required: true },
    linksCsv: { type: String, required: true }
  },
  methods: {
    async openInMicrobeTrace() {
      await window.MicrobeTraceEmbed.open({
        partnerId: 'your-partner-id',
        files: [
          { name: 'nodes.csv', mimeType: 'text/csv', contents: this.nodesCsv },
          { name: 'links.csv', mimeType: 'text/csv', contents: this.linksCsv }
        ],
        metadata: {
          datasetName: 'My dataset',
          sourceApp: 'My Vue App'
        }
      });
    }
  }
};
</script>
```

If you load the SDK dynamically instead of from a static `<script>` tag, ensure `window.MicrobeTraceEmbed` exists before rendering or wiring the button. If your dynamic loader prevents the SDK from detecting its script URL, either load the SDK from a normal script tag or supply a reviewed `target` with `allowedTargetOrigins`.

## File Payload Format

Each file uses this shape:

```js
{
  name: 'nodes.csv',
  kind: 'node', // optional
  mimeType: 'text/csv',
  contents: 'id,seq\nA,ACTG\n',
  options: {
    extension: 'csv',
    field1: 'id',
    field2: 'seq',
    field3: 'distance'
  }
}
```

Fields:

- `name`
  - Required.
- `kind`
  - Optional.
  - Allowed explicit values: `node`, `link`, `matrix`, `fasta`, `newick`, `auspice`
  - You may omit it, or set it to `auto`, and let MicrobeTrace infer it.
- `mimeType`
  - Optional but recommended.
- `contents`
  - Required.
  - Allowed content types:
    - string
    - `ArrayBuffer` for Excel-backed imports
    - object or JSON string for Auspice payloads
- `options.extension`
  - Optional override for file extension inference.
- `options.field1`, `options.field2`, `options.field3`
  - Optional overrides for ambiguous column mappings.

## Auto-Detection

If `kind` is omitted or set to `auto`, MicrobeTrace will infer the file type.

Current detection rules:

- Auspice
  - JSON object with `meta` and `tree`
- FASTA
  - text starting with `>`
  - or FASTA-style extension such as `fa`, `fas`, `fasta`, `fna`
- Newick
  - text that looks like a Newick tree
  - or tree-style extension such as `nwk`, `newick`, `tre`
- Matrix
  - square tabular data where row labels match column labels and cells are numeric
  - or matrix-like filenames such as `distance-matrix.csv`
- Link list
  - headers like `source/target`, `src/tgt`, or `from/to`
  - or link-like filenames such as `links.csv`
- Node list
  - tabular data with headers like `id` or `seq`
  - otherwise this is the fallback for remaining tabular files

If your dataset uses unusual column names, pass explicit `kind` or explicit `field1/field2/field3`.

## Column Mapping

For `node` and `link` files, MicrobeTrace also infers column mappings:

- Node defaults:
  - `field1` -> `id`
  - `field2` -> `seq` when present
- Link defaults:
  - `field1` -> `source`
  - `field2` -> `target`
  - `field3` -> `distance` when present

Override them when your headers do not follow the usual names:

```js
{
  name: 'pairs.csv',
  kind: 'link',
  mimeType: 'text/csv',
  contents: 'person_a,person_b,weight\nA,B,2\n',
  options: {
    field1: 'person_a',
    field2: 'person_b',
    field3: 'weight'
  }
}
```

## Supported Data Types

MicrobeTrace currently supports these import families through the embed handoff:

- Node list
- Link or edge list
- Distance matrix
- FASTA
- Newick
- Auspice JSON

The partner handoff does not allow:

- Full MicrobeTrace session objects
- HTML, SVG, or script-like payloads
- Zip files
- Arbitrary untyped binary blobs

## Security Model

The embed flow is intentionally restricted, but it is not an authentication or authorization protocol.

Current MicrobeTrace controls:

- The receiver only accepts messages from allowlisted partner origins.
- The SDK validates the receiver window, receiver origin, `partnerId`, and one-time nonce before sending data.
- The SDK infers the MicrobeTrace target from its own script URL by default, rejects non-HTTP(S) targets, and requires any cross-origin target to be explicitly listed in `allowedTargetOrigins`.
- The receiver validates the opener origin, `partnerId`, nonce, payload schema, supported file kinds, file count, file size, total size, and handoff lifetime.
- The receiver rejects full MicrobeTrace session objects, HTML/SVG/script-like text payloads, zip files, arbitrary untyped binary blobs, and prototype-pollution keys.
- The Angular import path validates the stored handoff again before loading it.
- Handoffs are stored in a separate browser-storage namespace on the MicrobeTrace origin.
- Handoffs are short-lived, deleted after successful read or error, and expired or malformed `handoff:*` records are cleaned up on app startup and before storing a new receiver handoff.
- Handoff launches put the handoff id in the URL fragment, such as `#handoff=...`, so it is not sent to servers as a query string. Query-form handoff URLs are also consumed and cleaned if encountered.
- Handoff launches disable Google Tag Manager initialization while a `handoff` query or fragment parameter is present.
- The receiver page has a restrictive CSP meta tag and refuses to run inside a frame.
- MicrobeTrace spreadsheet-style exports escape formula-leading string values to reduce CSV/XLSX formula injection risk.
- The WAR build includes Tomcat `HttpHeaderSecurityFilter` configuration for `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and HSTS on secure requests.

This means partner apps cannot write directly into MicrobeTrace browser storage. They must go through the official receiver flow.

Important boundaries:

- `partnerId` is an identifier, not a secret.
- The allowlist is origin-based. It does not distinguish paths or separate applications sharing the same origin.
- MicrobeTrace cannot tell which partner user is signed in, which role they have, or whether a specific dataset was approved for export.
- The handoff id in the MicrobeTrace URL fragment is a short-lived bearer reference to data already stored in the user's browser on the MicrobeTrace origin. It does not contain the data itself, but it should still be treated as sensitive.
- Expiration and cleanup reduce stale handoff exposure, but browser storage is still local browser storage rather than encrypted storage.

### Authenticated CDC Application Risk And Mitigation Matrix

When the button is embedded in a CDC application where the user is already authenticated, the user can cause data from that authenticated context to be serialized and opened in MicrobeTrace. Review these vulnerability classes for every partner integration.

| Risk | MicrobeTrace mitigation | Partner-required control | Real residual risk |
| --- | --- | --- | --- |
| Authenticated data exfiltration | MicrobeTrace treats the handoff as a user-initiated import, validates payload shape and limits, and does not request partner cookies, tokens, or API access. | Treat the button as an export feature. Authorize the export before serialization, limit the selected dataset, and audit the export. | A malicious or compromised authorized user can still export data they are allowed to access. |
| Authorization bypass | MicrobeTrace accepts only the files passed through the handoff and does not expand access through partner APIs. | Build the payload from an authorization-checked export path, not arbitrary client-side state. Do not include hidden columns or linked records unless the user can export them. | MicrobeTrace cannot independently verify partner user roles, row-level permissions, or policy decisions. |
| Confused deputy | Origin allowlisting only permits configured partner origins; MicrobeTrace does not treat `partnerId` as user authorization. | Keep authorization and consent in the partner app. Do not use MicrobeTrace allowlisting as a substitute for partner access control. | A fully trusted but over-permissive partner app can still export overbroad data. |
| User-controlled or spoofed target URL | The SDK infers the MicrobeTrace root from its own script URL by default, rejects empty, wildcard, credentialed, and non-HTTP(S) targets, and requires cross-origin targets to be listed in `allowedTargetOrigins`. The SDK also validates receiver origin, receiver window, `partnerId`, and nonce before sending data. | Omit `target` for normal same-deployment SDK use. If `target` is supplied, hardcode it in administrator-controlled configuration. Use `allowedTargetOrigins` only for reviewed self-hosted SDK cases. | A fully compromised approved MicrobeTrace deployment or approved self-hosted SDK location can still receive the data. |
| `postMessage` misuse | The receiver accepts messages only from exact allowlisted origins and validates `partnerId`, nonce, schema, size limits, and file kinds. The SDK ignores responses from unexpected windows, origins, partner IDs, or nonces. | Do not wrap the SDK with wildcard, suffix, substring, or user-controlled origin checks. Validate any partner-side message handling as untrusted input. | A compromised allowlisted origin can still send any data available in that origin's authenticated context. |
| Overbroad or shared-origin allowlist | `npm run verify:embed-security` validates exact origins, rejects wildcards and paths, rejects shared origins across partner IDs, and limits localhost to `local-dev`. | Use dedicated origins for apps with different trust levels or export rights. Avoid hosting unrelated apps with different security boundaries on the same scheme/host/port. | Browser origins do not enforce path-level trust boundaries; apps sharing an origin share this integration trust. |
| Third-party script supply chain | The SDK is a small static asset served from the MicrobeTrace deployment and defaults to same-origin target inference to reduce configuration mistakes. | Load the SDK only from the approved MicrobeTrace deployment, restrict `script-src`, and use SRI or a reviewed self-hosted copy if required by governance. | Any script loaded into the partner page executes with that page's JavaScript privileges. |
| XSS in partner app | Popup timing and SDK validation reduce silent background abuse, but MicrobeTrace cannot protect data already exposed to malicious script in the partner page. | Maintain partner-side output encoding, CSP, dependency hygiene, and XSS testing. Keep secrets out of JavaScript-readable state when possible. | XSS in the authenticated partner app can call the SDK with data the page can read. |
| Clickjacking or UI redress | The receiver refuses to run inside an embedded frame. WAR/Tomcat builds include `X-Frame-Options: DENY`, and deployment docs require `frame-ancestors 'none'`. | Protect the partner app with `frame-ancestors` or `X-Frame-Options`, and make the export action visibly name MicrobeTrace and the selected dataset. | A user can still be tricked by social engineering or compromised UI inside an already trusted page. |
| Reverse tabnabbing / opener exposure | The SDK uses opener messaging intentionally and validates the receiver before transfer. The receiver validates the opener origin before storing data. | Use only approved MicrobeTrace targets. Consider a partner-side intermediate export page if opener exposure is unacceptable for your application. | The opener relationship cannot be fully removed from this popup-based handoff design. |
| Token or secret leakage | The SDK success receipt includes only `partnerId`, `handoffId`, timestamps, receiver URL, and file summaries. Receiver and Angular validation ignore arbitrary metadata beyond approved fields. | Never include cookies, bearer tokens, API keys, CSRF tokens, signed URLs, internal request headers, or debug traces in `files` or `metadata`. Scrub exports before constructing the payload. | MicrobeTrace cannot know whether a partner-provided cell value or metadata field is a secret. |
| Browser storage exposure | Handoffs are stored under the `handoff:*` namespace on the MicrobeTrace origin, are one-time, short-lived, deleted after success/error, and expired or malformed records are cleaned up at startup and before new receiver storage. | Minimize payloads, prefer private windows for shared workstations, and use managed-device controls for sensitive workflows. | IndexedDB/localforage is local browser storage, not encrypted application storage; malware, local administrators, browser extensions, or MicrobeTrace-origin XSS can still inspect it. |
| Handoff id leakage or replay | Handoff launches use `#handoff=...` fragments instead of query strings, query-form handoffs are consumed and cleaned if encountered, and handoff records are one-time and TTL-bound. | Do not log, paste, screenshot, or share full MicrobeTrace URLs containing `handoff`. Consume handoffs promptly. | Fragments can still appear in browser history, screenshots, copied URLs, and support workflows. |
| Payload-borne content injection | The receiver rejects HTML, SVG, script-like payloads, full MicrobeTrace session objects, zip files, arbitrary untyped binary blobs, and prototype-pollution keys. The Angular import path validates the stored handoff again before loading. | Treat all exported values as untrusted. Avoid formulas or markup unless explicitly required and reviewed. | Future MicrobeTrace views and exports must continue rendering imported values as data, not executable content. |
| CSV or spreadsheet formula injection | MicrobeTrace escapes formula-leading string values in primary CSV/XLSX export paths for tables, aggregates, heatmaps, and cluster ZIP CSV exports. | Avoid exporting formula-like values unless they are required and reviewed. Warn users before opening downloaded exports in spreadsheet tools if the source data is untrusted. | Formula escaping reduces spreadsheet execution risk but cannot control every downstream tool or manually edited export. |
| Resource exhaustion | Receiver validation enforces file count, per-file size, total size, supported kinds, and handoff TTL before storing. | Keep partner-specific limits lower than defaults when needed, warn users for large exports, and test worst-case datasets. | A valid large dataset can still consume browser CPU, memory, or storage during analysis. |
| Analytics, telemetry, and logs | Handoff launches disable Google Tag Manager initialization while a `handoff` query or fragment parameter is present. The receipt avoids file contents and row data. | Do not log payload contents. Log only audit metadata such as user id, dataset id, timestamp, target URL, file count, and approximate size. | Partner support tools, screenshots, browser history, and error reporting can still leak URLs or analysis context. |
| CORS overexposure | The embed flow does not require MicrobeTrace to call partner APIs or receive broad partner CORS access. | Do not add broad CORS permissions for MicrobeTrace as part of this integration. Fetch and authorize data inside the partner app or backend, then serialize the approved export. | If the partner separately exposes permissive CORS APIs, this SDK cannot compensate for that exposure. |
| Unsupported browser randomness | The SDK and receiver require `crypto.randomUUID()` or `crypto.getRandomValues()` and fail closed when Web Crypto is unavailable. | Require modern browsers for this integration and treat Web Crypto errors as unsupported-browser failures. | Browsers without Web Crypto cannot use the handoff flow. |
| Security header drift | WAR builds package Tomcat `HttpHeaderSecurityFilter` for `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and HSTS on secure requests. Artifact verification checks embed assets and WAR `WEB-INF/web.xml`. | Ensure CDC infrastructure or reverse proxies also set CSP, `Referrer-Policy`, and `Cache-Control: no-store` for the receiver. Verify headers after deployment, not only in source. | Non-Tomcat hosting and upstream proxies can still omit or override headers if deployment configuration drifts. |
| Version drift | Verification includes allowlist validation through `verify:dist`; tests cover SDK/receiver security behavior and hash/query handoff handling. | Re-review this document and rerun embed tests when changing the SDK, receiver, Angular handoff service, allowlist, build packaging, or partner onboarding. | A deployment can drift from the reviewed SDK, receiver, docs, or allowlist if artifacts are not rebuilt and redeployed together. |

### Partner Security Checklist

Before production release from an authenticated CDC application:

- Document the data classification for every field included in the handoff.
- Confirm the export is allowed by policy for the partner app, target MicrobeTrace deployment, user role, and dataset type.
- Authorize the export server-side or through a centrally reviewed authorization layer before building the payload.
- Present an explicit user action that names MicrobeTrace and the selected dataset.
- Audit user id, application id, dataset id, timestamp, target MicrobeTrace URL, file count, and approximate size. Do not audit raw contents or secrets.
- Omit `target` for same-deployment SDK usage, or hardcode and review the `target` value when explicitly supplied.
- Keep `partnerId` stable but do not treat it as secret.
- Use exact HTTPS origins in `partner-allowlist.json`; do not use wildcards or shared low-trust origins.
- Set partner-app headers to reduce clickjacking and data leakage: `Content-Security-Policy` with tight `script-src` and `frame-ancestors`, `Referrer-Policy: no-referrer` or `strict-origin-when-cross-origin`, and appropriate cookie `SameSite` attributes.
- Review third-party script governance for the MicrobeTrace SDK, including SRI or vetted self-hosting if required by the partner's security authority.
- Test with the partner app signed out, signed in without export rights, signed in with partial data rights, and signed in with full export rights.

### MicrobeTrace Maintainer Checklist

Before adding or changing a production partner:

- Add only exact production origins to `src/assets/embed/partner-allowlist.json`.
- Prefer one `partnerId` per application/security boundary.
- Confirm the partner understands that origin allowlisting is not user authorization.
- Confirm the partner has a user-visible export action and audit plan.
- Review any partner-specific limits for `maxFiles`, `maxFileBytes`, and `maxTotalBytes`.
- Run `npm run verify:embed-security` after allowlist changes.
- Re-run the embed handoff unit tests and a browser smoke test after changing receiver, SDK, or allowlist behavior.
- Confirm the deployed receiver is served over HTTPS with appropriate HTTP security headers. The WAR build includes Tomcat header configuration, but reverse proxies and non-Tomcat hosts must still be configured explicitly.

### Deployment Headers

Angular can include a receiver-page CSP meta tag, and the WAR build packages `WEB-INF/web.xml` with Tomcat `HttpHeaderSecurityFilter`. CDC infrastructure or any reverse proxy in front of MicrobeTrace should still set these HTTP response headers:

- `Content-Security-Policy`
  - For `/assets/embed/receiver.html`, include at least `default-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`.
  - `frame-ancestors` must be an HTTP header; browsers ignore it in a meta CSP.
- `Referrer-Policy: no-referrer` for the receiver and `strict-origin-when-cross-origin` or stricter for the app.
- `Cache-Control: no-store` for `/assets/embed/receiver.html`.
- `X-Frame-Options: DENY` for legacy clients.
- `X-Content-Type-Options: nosniff`.
- `Strict-Transport-Security` on HTTPS deployments.

### Risks No App Can Fully Eliminate

Some risks remain even when MicrobeTrace and the partner application both implement their controls correctly:

- Malicious authorized users can copy, screenshot, transcribe, or re-enter data they are permitted to see.
- Compromised browsers, endpoints, local administrators, or privileged extensions can inspect browser-resident data.
- Browser, TLS, operating-system, or hardware isolation defects can undermine origin and storage protections.
- A fully compromised trusted partner origin or MicrobeTrace deployment can serve malicious code that passes origin checks.
- Legitimately exported fields can still reveal sensitive relationships through inference or linkage.
- Users can leak handoff URLs, screenshots, downloaded exports, or analysis results through tickets, chat, email, or shared drives.
- MicrobeTrace cannot enforce partner-specific downstream-use policy after export unless that policy is encoded in separate controls outside this SDK flow.

### Security References

- [OWASP HTML5 Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html)
- [OWASP Third Party Javascript Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Third_Party_Javascript_Management_Cheat_Sheet.html)
- [OWASP Clickjacking Defense Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Clickjacking_Defense_Cheat_Sheet.html)
- [OWASP Content Security Policy Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html)

## Local Development

The repository includes working examples:

- `examples/partner-embed-demo/index.html`
  - Partner-application proof of concept served from `http://127.0.0.1:4300`.
  - Loads the real SDK from `http://localhost:4200`, omits `target`, opens MicrobeTrace, and shows the non-sensitive receipt.
  - Includes failure buttons for rejected target handling and receiver-side blocked-payload validation.
- `src/assets/embed/smoke-auto.html`
  - Uses omitted `kind` and auto-detection.

Run the proof of concept locally with two terminals:

```sh
npm start
npm run demo:partner-embed
```

Then open `http://127.0.0.1:4300`.

The checked-in local allowlist currently includes:

- `http://localhost:4200`
- `http://127.0.0.1:4200`
- `http://localhost:4300`
- `http://127.0.0.1:4300`

## Troubleshooting

Common failures:

- `MicrobeTraceEmbed requires a modern browser with Web Crypto support.`
  - Use a current browser that supports `crypto.randomUUID()` or `crypto.getRandomValues()`.
- `MicrobeTraceEmbed.open target origin must match the SDK origin unless allowedTargetOrigins includes it.`
  - Load the SDK from the same MicrobeTrace deployment you are opening, or use a reviewed `allowedTargetOrigins` entry for self-hosted SDK deployments.
- `The partner handoff window was blocked by the browser.`
  - Ensure the SDK is called from a direct user gesture.
- `The calling origin is not approved for this partner handoff.`
  - Your origin is not yet allowlisted for the supplied `partnerId`.
- `File ... did not declare a kind and MicrobeTrace could not infer one.`
  - Pass an explicit `kind`.
- `Requested field ... was not present in the imported dataset.`
  - Update the mapping overrides to match the actual headers.

## Partner Onboarding

To onboard a real partner:

1. Assign a `partnerId`.
2. Add the partner origin or origins to `src/assets/embed/partner-allowlist.json`.
3. Confirm the SDK is loaded from the intended MicrobeTrace deployment, and confirm any explicit `target` or `allowedTargetOrigins` exception is reviewed.
4. Share this guide and a partner-specific example payload.

For unusual data shapes, prefer explicit metadata over relying on inference.
