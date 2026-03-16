# MicrobeTrace Partner Embed Integration

This guide is for developers who want to add an `Open in MicrobeTrace` button to their own web application.

The embed flow is client-only. Your app opens a MicrobeTrace-owned receiver page in a popup or new tab, sends the dataset with `postMessage`, and MicrobeTrace stores that payload on the MicrobeTrace origin long enough to open it as a session.

## Overview

The integration has three parts:

1. Your application includes the MicrobeTrace embed SDK.
2. Your button calls `MicrobeTraceEmbed.open(...)` or `MicrobeTraceEmbed.attachButton(...)` from a user click.
3. MicrobeTrace validates the payload, stores it as a one-time handoff, and launches the dataset.

## Prerequisites

- Your webapp origin must be allowlisted by the MicrobeTrace team.
- Your users must trigger the popup from a real click or tap. Browsers will block background popup attempts.
- Your data must fit within the partner handoff limits.

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
    target: 'https://microbetrace.cdc.gov/MicrobeTrace/',
    partnerId: 'your-partner-id',
    files,
    metadata: {
      datasetName: 'My dataset',
      sourceApp: 'My Web App'
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
- Confirm the `target` points at the correct MicrobeTrace deployment.
- Trigger the embed call from a direct user click or tap.
- Pass conventional file names and headers when possible so auto-detection works cleanly.
- Add explicit `kind` or `options.field1/field2/field3` when your data shape is unusual.
- Test one successful launch on a real browser before release.

## API

### `MicrobeTraceEmbed.open(options)`

Opens the receiver page, sends the payload, and resolves after MicrobeTrace stores the handoff.

Required fields:

- `target`
  - The root URL of your MicrobeTrace deployment.
  - Example: `https://microbetrace.cdc.gov/MicrobeTrace/`
- `partnerId`
  - The partner identifier assigned in the MicrobeTrace allowlist.
- `files`
  - One or more file payloads.

Optional fields:

- `metadata.datasetName`
- `metadata.sourceApp`
- `onSuccess(result)`
- `onError(error)`

### `MicrobeTraceEmbed.attachButton(selectorOrElement, options)`

Attaches the same behavior to one or more existing buttons or links.

## Framework Snippets

### React

This example assumes the SDK script is already loaded on the page.

```jsx
function OpenInMicrobeTraceButton({ nodesCsv, linksCsv }) {
  const handleClick = async () => {
    await window.MicrobeTraceEmbed.open({
      target: 'https://microbetrace.cdc.gov/MicrobeTrace/',
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
        target: 'https://microbetrace.cdc.gov/MicrobeTrace/',
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

If you load the SDK dynamically instead of from a static `<script>` tag, ensure `window.MicrobeTraceEmbed` exists before rendering or wiring the button.

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

The embed flow is intentionally restricted:

- The receiver only accepts messages from allowlisted partner origins.
- The handoff uses a one-time nonce and a one-time handoff id.
- Payloads are schema-validated and size-limited.
- Handoffs are stored in a separate browser-storage namespace on the MicrobeTrace origin.
- Handoffs are deleted after read or on error.

This means partner apps cannot write directly into MicrobeTrace browser storage. They must go through the official receiver flow.

## Local Development

The repository includes working examples:

- `src/assets/embed/smoke-auto.html`
  - Uses omitted `kind` and auto-detection.
- `tmp/embed-smoke/index.html`
  - Uses explicit `node` and `link` kinds.

The checked-in local allowlist currently includes:

- `http://localhost:4200`
- `http://127.0.0.1:4200`
- `http://localhost:4300`
- `http://127.0.0.1:4300`

## Troubleshooting

Common failures:

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
3. Confirm the correct MicrobeTrace deployment URL for `target`.
4. Share this guide and a partner-specific example payload.

For unusual data shapes, prefer explicit metadata over relying on inference.
