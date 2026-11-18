#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const source = path.resolve(
  process.cwd(),
  'node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs'
);
const target = path.resolve(
  process.cwd(),
  'src/assets/maplibre/maplibre-gl-worker.js'
);

if (!fs.existsSync(source)) {
  console.error(`MapLibre worker source is missing: ${source}`);
  process.exit(1);
}

const sourceSize = fs.statSync(source).size;
if (sourceSize === 0) {
  console.error(`MapLibre worker source is empty: ${source}`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(target), {recursive: true});
fs.copyFileSync(source, target);

console.log(
  `Copied MapLibre worker to a .js asset for servers without an .mjs MIME mapping (${sourceSize} bytes).`
);
