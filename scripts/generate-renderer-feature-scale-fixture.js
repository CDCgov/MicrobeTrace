#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const repositoryRoot = path.resolve(__dirname, '..');
const sourcePath = path.join(
  repositoryRoot,
  'cypress',
  'fixtures',
  'performance',
  'average-graph-nodes.csv',
);
const outputPath = path.join(
  repositoryRoot,
  'cypress',
  'fixtures',
  'renderer-comparison',
  'feature-scale-nodes.csv',
);

const sourceLines = fs.readFileSync(sourcePath, 'utf8').trim().split(/\r?\n/);
const header = [
  ...sourceLines[0].split(','),
  'Case ID',
  'Specimen ID',
  'Entity Type',
  'Exposure',
  'QC Status',
  'QC Severity',
  'QC Reason',
  'Uncertainty',
  'Latitude',
  'Longitude',
];
const centers = [
  { latitude: 33.7490, longitude: -84.3880 },
  { latitude: 40.7128, longitude: -74.0060 },
  { latitude: 47.6062, longitude: -122.3321 },
  { latitude: 34.0522, longitude: -118.2437 },
];
const exposures = [
  'Food|Travel',
  'Healthcare',
  'Community|Healthcare|Travel',
  'Travel',
];
const qcStates = [
  { status: 'Pass', severity: 'none', reason: '' },
  { status: 'Review', severity: 'warning', reason: 'Mixed specimen signal' },
  { status: 'Failed', severity: 'error', reason: 'Low coverage' },
  { status: 'Pending', severity: 'info', reason: 'Awaiting replicate' },
  { status: 'Pass', severity: 'none', reason: '' },
];

const outputLines = [header.join(',')];
sourceLines.slice(1).forEach((line, index) => {
  const sourceColumns = line.split(',');
  const caseIndex = Math.floor(index / 40);
  const memberIndex = index % 40;
  const center = centers[caseIndex % centers.length];
  const qc = qcStates[index % qcStates.length];
  const latitudeOffset = ((memberIndex % 8) - 3.5) * 0.018 + Math.floor(caseIndex / 4) * 0.001;
  const longitudeOffset = (Math.floor(memberIndex / 8) - 2) * 0.022 + Math.floor(caseIndex / 4) * 0.001;
  const uncertainty = ((index * 7) % 100) / 100;

  outputLines.push([
    ...sourceColumns,
    `CASE-${String(caseIndex + 1).padStart(2, '0')}`,
    `SPEC-${String(caseIndex + 1).padStart(2, '0')}-${String(Math.floor(memberIndex / 10) + 1).padStart(2, '0')}`,
    'sequence',
    exposures[index % exposures.length],
    qc.status,
    qc.severity,
    qc.reason,
    uncertainty.toFixed(2),
    (center.latitude + latitudeOffset).toFixed(4),
    (center.longitude + longitudeOffset).toFixed(4),
  ].join(','));
});

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${outputLines.join('\n')}\n`, 'utf8');
console.log(`Wrote ${outputLines.length - 1} feature-rich nodes to ${path.relative(repositoryRoot, outputPath)}`);
