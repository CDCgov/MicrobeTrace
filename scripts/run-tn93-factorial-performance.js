#!/usr/bin/env node

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const esbuild = require('esbuild');

const temporaryDirectory = fs.mkdtempSync(
  path.join(os.tmpdir(), 'microbetrace-tn93-factorial-'),
);
const outputFile = path.join(
  temporaryDirectory,
  'tn93-factorial-performance.cjs',
);

try {
  esbuild.buildSync({
    entryPoints: [
      path.join(__dirname, 'run-tn93-factorial-performance.ts'),
    ],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: outputFile,
    logLevel: 'warning',
  });
  const result = spawnSync(
    process.execPath,
    [outputFile, ...process.argv.slice(2)],
    {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
    },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
