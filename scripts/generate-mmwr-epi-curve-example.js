const fs = require('fs');
const path = require('path');

const start = new Date(Date.UTC(2025, 0, 1));
const end = new Date(Date.UTC(2025, 8, 30));

const caseCounts = {
  '2025-02-09': 4,
  '2025-02-10': 6,
  '2025-02-11': 1,
  '2025-02-12': 1,
  '2025-02-13': 1,
  '2025-02-15': 2,
  '2025-02-16': 1,
  '2025-02-17': 5,
  '2025-02-18': 1,
  '2025-02-26': 2,
  '2025-03-03': 2,
  '2025-03-06': 3,
  '2025-03-11': 2,
  '2025-03-13': 1,
  '2025-03-15': 1,
  '2025-03-18': 3,
  '2025-03-19': 1,
  '2025-03-26': 1,
  '2025-03-27': 1,
  '2025-03-28': 1,
  '2025-03-30': 2,
  '2025-04-01': 2,
  '2025-04-03': 2,
  '2025-04-05': 2,
  '2025-04-07': 1,
  '2025-04-09': 1,
  '2025-04-12': 1,
  '2025-04-16': 1,
  '2025-04-20': 1,
  '2025-04-24': 1,
  '2025-04-28': 1,
  '2025-05-05': 1,
  '2025-05-06': 3,
  '2025-05-07': 1,
  '2025-05-13': 1,
  '2025-05-14': 1,
  '2025-05-20': 1,
  '2025-05-22': 1,
  '2025-05-29': 1,
  '2025-06-21': 1,
  '2025-06-22': 2,
  '2025-06-23': 4,
  '2025-06-24': 4,
  '2025-06-25': 2,
  '2025-06-29': 1,
  '2025-07-21': 1,
  '2025-07-30': 1,
  '2025-08-11': 1,
  '2025-08-12': 2,
};

const rows = [];
for (let date = new Date(start); date <= end; date.setUTCDate(date.getUTCDate() + 1)) {
  rows.push({ date: new Date(date), dateKey: date.toISOString().slice(0, 10) });
}

function scaledCumulativeValues(target, incrementForIndex) {
  const cumulative = [0];
  for (let index = 1; index < rows.length; index += 1) {
    cumulative.push(cumulative[index - 1] + incrementForIndex(index));
  }
  const rawTotal = cumulative[cumulative.length - 1];
  return cumulative.map(value => Math.round((value / rawTotal) * target));
}

const cumulative2025 = scaledCumulativeValues(61000, index =>
  index <= 44
    ? 125 + ((index * 37) % 51)
    : 210 + ((index * 29) % 71));
const cumulative2024 = scaledCumulativeValues(39500, index =>
  115 + ((index * 17) % 61));

const headers = [
  'ID',
  'No. of measles cases in 2025',
  'Measles case count',
  'No. of MMR doses administered in 2025',
  'Cumulative MMR doses administered in 2025',
  'No. of MMR doses administered during the same period in 2024',
  'Cumulative MMR doses administered during the same period in 2024',
];

function escapeCsv(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const csvRows = rows.map((row, index) => [
  `NM-2025-${String(index + 1).padStart(3, '0')}`,
  row.dateKey,
  caseCounts[row.dateKey] || 0,
  row.dateKey,
  cumulative2025[index],
  row.dateKey,
  cumulative2024[index],
]);

const output = [headers, ...csvRows]
  .map(row => row.map(escapeCsv).join(','))
  .join('\n');
const outputPath = path.join(__dirname, '..', 'examples', 'example_files', 'MMWR_measles_epi_curve.csv');
fs.writeFileSync(outputPath, `${output}\n`, 'utf8');
console.log(`Wrote ${csvRows.length} daily rows to ${outputPath}`);

