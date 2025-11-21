#!/bin/sh

echo 'Compressing Large Files...'

npx gzipper --brotli components/
npx gzipper components/
npx gzipper --brotli data/
npx gzipper data/
npx gzipper --brotli dist/
npx gzipper dist/
npx gzipper --brotli vendor/
npx gzipper vendor/
npx gzipper --brotli workers/
npx gzipper workers/
