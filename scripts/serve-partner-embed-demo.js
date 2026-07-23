#!/usr/bin/env node
'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');

const root = path.resolve(__dirname, '..', 'examples', 'partner-embed-demo');
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 4300);

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8']
]);

function send(response, status, body, headers = {}) {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers
  });
  response.end(body);
}

function resolveRequestPath(requestPath) {
  const decodedPath = decodeURIComponent(requestPath);
  const relativePath = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^\/+/, '');
  const filePath = path.resolve(root, relativePath);

  if (filePath !== root && !filePath.startsWith(root + path.sep)) {
    return null;
  }

  return filePath;
}

const server = http.createServer((request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    send(response, 405, 'Method not allowed', { Allow: 'GET, HEAD' });
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host || `${host}:${port}`}`);
  if (url.pathname === '/healthz') {
    send(response, 200, request.method === 'HEAD' ? '' : 'ok\n', { 'Content-Type': 'text/plain; charset=utf-8' });
    return;
  }

  const filePath = resolveRequestPath(url.pathname);
  if (!filePath) {
    send(response, 403, 'Forbidden');
    return;
  }

  fs.stat(filePath, (statError, stats) => {
    if (statError || !stats.isFile()) {
      send(response, 404, 'Not found');
      return;
    }

    const headers = {
      'Content-Type': contentTypes.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream'
    };

    if (request.method === 'HEAD') {
      send(response, 200, '', headers);
      return;
    }

    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers
    });
    fs.createReadStream(filePath).pipe(response);
  });
});

server.listen(port, host, () => {
  console.log(`Partner embed demo available at http://${host}:${port}`);
  console.log('Start MicrobeTrace separately with: npm start');
});
