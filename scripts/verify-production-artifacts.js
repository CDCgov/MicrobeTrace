#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const distRoot = path.resolve(process.cwd(), process.argv[2] || 'dist/MicrobeTrace');

if (!fs.existsSync(distRoot)) {
  console.error(`Production artifact verification failed: ${distRoot} does not exist.`);
  process.exit(1);
}

const violations = [];

for (const filePath of walk(distRoot)) {
  const relativePath = path.relative(distRoot, filePath);

  if (filePath.endsWith('.map')) {
    violations.push(`Source map published: ${relativePath}`);
    continue;
  }

  if (path.basename(filePath) === 'stats.json') {
    violations.push(`Build stats published: ${relativePath}`);
    continue;
  }

  if (!filePath.endsWith('.js')) {
    continue;
  }

  const contents = fs.readFileSync(filePath, 'utf8');

  const cardCandidates = findLuhnCandidates(contents);
  if (cardCandidates.length > 0) {
    violations.push(
      `Luhn-valid payment-card-like sequence(s) found in ${relativePath}: ${cardCandidates
        .slice(0, 5)
        .map(maskDigits)
        .join(', ')}`
    );
  }
}

if (violations.length > 0) {
  console.error('Production artifact verification failed:');
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log(`Production artifact verification passed for ${distRoot}.`);

function* walk(root) {
  const entries = fs.readdirSync(root, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      yield* walk(fullPath);
      continue;
    }

    yield fullPath;
  }
}

function findLuhnCandidates(text) {
  const candidates = [];
  const patterns = [
    /(?<![\d.])\d{13,19}(?![\d.eE])/g,
    /(?<!\d)\d{4}(?:[ -]\d{4}){2,4}(?!\d)/g,
    /(?<!\d)\d{4}[ -]\d{6}[ -]\d{5}(?!\d)/g,
  ];

  for (const pattern of patterns) {
    const matches = text.match(pattern) || [];

    for (const match of matches) {
      const digits = match.replace(/\D/g, '');
      if (digits.length < 13 || digits.length > 19) {
        continue;
      }

      if (new Set(digits).size === 1) {
        continue;
      }

      if (passesLuhn(digits)) {
        candidates.push(digits);
      }
    }
  }

  return [...new Set(candidates)];
}

function passesLuhn(digits) {
  let sum = 0;
  let doubleDigit = false;

  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let value = Number(digits[i]);

    if (doubleDigit) {
      value *= 2;
      if (value > 9) {
        value -= 9;
      }
    }

    sum += value;
    doubleDigit = !doubleDigit;
  }

  return sum % 10 === 0;
}

function maskDigits(digits) {
  return `${digits.slice(0, 4)}...${digits.slice(-4)}`;
}
