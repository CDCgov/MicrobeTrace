#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { buildGraphFixture } = require('./generate-performance-fixtures');
const scenarios = require('../cypress/performance/threed-scenarios.json');

fs.mkdirSync(path.join(__dirname, '..', 'cypress', 'fixtures', 'performance', 'threed'), { recursive: true });
for (const { nodes, links } of scenarios) {
  const stem = `threed/${nodes}n-${links}l`;
  buildGraphFixture({
    nodeCount: nodes, linkCount: links,
    nodeFile: `${stem}-nodes.csv`, linkFile: `${stem}-links.csv`,
    idPrefix: 'TD', idPad: 5, seed: 0x4d543344 + nodes + links,
  });
}
console.log(`Generated ${scenarios.length} deterministic 3D graph fixtures.`);
