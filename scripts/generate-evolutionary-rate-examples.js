'use strict';

const fs = require('fs');
const path = require('path');
const tn93 = require('tn93');

const outputPath = path.resolve(
  __dirname,
  '..',
  'examples',
  'evolutionary-rate',
  'tn93-outlier-example.csv'
);
const sequenceLength = 800;
const sampleCount = 12;
const referenceYear = 2014;
const outlierIndex = 6;
const outlierMutationCount = 10;
const expectedOutlierId = 'TN93_2020_DATE_MISMATCH';

function createSequence(mutationCount) {
  const sequence = 'ACGT'.repeat(sequenceLength / 4).split('');
  for (let index = 0; index < mutationCount; index++) {
    sequence[index * 4] = 'G';
  }
  return sequence.join('');
}

function createRows() {
  return Array.from({ length: sampleCount }, (_, index) => {
    const year = referenceYear + index;
    const mutationCount = index === outlierIndex ? outlierMutationCount : index;
    return {
      _id: index === 0
        ? 'TN93_2014_REFERENCE'
        : index === outlierIndex
          ? expectedOutlierId
          : `TN93_${year}`,
      sample_date: `${year}-01-01`,
      seq: createSequence(mutationCount),
      lineage: year < 2020 ? 'Clock_A' : 'Clock_B',
      location: year < 2018 ? 'North' : year < 2022 ? 'Central' : 'South',
      fixture_note: index === outlierIndex
        ? 'intentional_date_sequence_mismatch'
        : 'clock_series',
    };
  });
}

function calculateSummary(rows) {
  const referenceSequence = tn93.toInts(rows[0].seq);
  const distances = rows.map(row => tn93.onInts(
    referenceSequence,
    tn93.toInts(row.seq),
    'AVERAGE'
  ));
  const years = rows.map(row => Number(row.sample_date.slice(0, 4)));
  const meanYear = years.reduce((sum, year) => sum + year, 0) / years.length;
  const meanDistance = distances.reduce((sum, distance) => sum + distance, 0) / distances.length;
  const sumYearSquares = years.reduce((sum, year) => sum + ((year - meanYear) ** 2), 0);
  const sumProducts = distances.reduce(
    (sum, distance, index) => sum + ((years[index] - meanYear) * (distance - meanDistance)),
    0
  );
  const slope = sumProducts / sumYearSquares;
  const intercept = meanDistance - (slope * meanYear);
  const residuals = distances.map(
    (distance, index) => distance - (intercept + (slope * years[index]))
  );
  const rmse = Math.sqrt(
    residuals.reduce((sum, residual) => sum + (residual ** 2), 0) / residuals.length
  );
  const outlierIds = rows
    .filter((_, index) => Math.abs(residuals[index]) >= 2 * rmse)
    .map(row => row._id);

  return {
    distances,
    maxReferenceDistance: Math.max(...distances),
    slope,
    rmse,
    outlierIds,
  };
}

const rows = createRows();
if (rows.some(row => row.seq.length !== sequenceLength || !/^[ACGT]+$/.test(row.seq))) {
  throw new Error('Generated sequences must contain exactly 800 unambiguous bases.');
}

const summary = calculateSummary(rows);
if (summary.maxReferenceDistance > 0.015) {
  throw new Error(`Maximum TN93 distance ${summary.maxReferenceDistance} exceeds 0.015.`);
}
if (summary.outlierIds.length !== 1 || summary.outlierIds[0] !== expectedOutlierId) {
  throw new Error(`Expected only ${expectedOutlierId} to be flagged; got ${summary.outlierIds.join(', ')}.`);
}

const headers = ['_id', 'sample_date', 'seq', 'lineage', 'location', 'fixture_note'];
const csv = [
  headers.join(','),
  ...rows.map(row => headers.map(header => row[header]).join(',')),
].join('\n');

fs.writeFileSync(outputPath, `${csv}\n`, 'utf8');
console.log(JSON.stringify({
  outputPath,
  samples: rows.length,
  sequenceLength,
  maxReferenceDistance: summary.maxReferenceDistance,
  slope: summary.slope,
  rmse: summary.rmse,
  outlierIds: summary.outlierIds,
}, null, 2));
