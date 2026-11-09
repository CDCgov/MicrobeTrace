export interface MapleChange {
  symbol: string;
  position: number;
  length: number;
}

export interface MapleSequence {
  id: string;
  seq: string;
}

export interface ParsedMapleAlignment {
  referenceId: string;
  reference: string;
  sequences: MapleSequence[];
}

const MAPLE_SYMBOL_PATTERN = /^[ACGTRYSWKMBDHVN-]$/i;
const REFERENCE_SEQUENCE_PATTERN = /^[ACGTRYSWKMBDHVN-]+$/i;
const DEFAULT_MAX_EXPANDED_BASES = 250_000_000;

function parseHeader(line: string, lineNumber: number): string {
  const id = line.slice(1).trim();
  if (!id) {
    throw new Error(`MAPLE header on line ${lineNumber} is missing an identifier.`);
  }
  return id;
}

function parseChange(line: string, lineNumber: number, referenceLength: number): MapleChange {
  const fields = line.trim().split(/\s+/);
  if (fields.length < 2 || fields.length > 3) {
    throw new Error(`MAPLE change on line ${lineNumber} must contain a symbol, position, and optional length.`);
  }

  const symbol = fields[0].toUpperCase();
  const position = Number(fields[1]);
  const length = fields.length === 3 ? Number(fields[2]) : 1;

  if (!MAPLE_SYMBOL_PATTERN.test(symbol)) {
    throw new Error(`MAPLE change on line ${lineNumber} used unsupported symbol "${fields[0]}".`);
  }
  if (!Number.isSafeInteger(position) || position < 1) {
    throw new Error(`MAPLE change on line ${lineNumber} has an invalid 1-based position.`);
  }
  if (!Number.isSafeInteger(length) || length < 1) {
    throw new Error(`MAPLE change on line ${lineNumber} has an invalid length.`);
  }
  if (position + length - 1 > referenceLength) {
    throw new Error(`MAPLE change on line ${lineNumber} extends beyond the reference sequence.`);
  }

  return { symbol, position, length };
}

function materializeSequence(reference: string, changes: MapleChange[], sampleId: string): string {
  const sortedChanges = [...changes].sort((left, right) => left.position - right.position);
  let previousEnd = 0;

  sortedChanges.forEach(change => {
    if (change.position <= previousEnd) {
      throw new Error(`MAPLE sample "${sampleId}" contains overlapping changes.`);
    }
    previousEnd = change.position + change.length - 1;
  });

  if (!sortedChanges.length) {
    return reference;
  }

  const sequence = reference.split('');
  sortedChanges.forEach(change => {
    const start = change.position - 1;
    for (let offset = 0; offset < change.length; offset++) {
      sequence[start + offset] = change.symbol;
    }
  });
  return sequence.join('');
}

/**
 * Expands a MAPLE sparse alignment into the aligned sequence records used by
 * MicrobeTrace's existing SNP, TN93, tree, and alignment-view pipelines.
 * MAPLE positions are one-based and optional run lengths are inclusive.
 */
export function parseMapleAlignment(
  text: string,
  maxExpandedBases: number = DEFAULT_MAX_EXPANDED_BASES
): ParsedMapleAlignment {
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('MAPLE input is empty.');
  }

  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  let cursor = 0;
  while (cursor < lines.length && !lines[cursor].trim()) cursor++;

  if (cursor >= lines.length || !lines[cursor].trim().startsWith('>')) {
    throw new Error('MAPLE input must begin with a reference header.');
  }

  const referenceId = parseHeader(lines[cursor].trim(), cursor + 1);
  cursor++;
  const referenceParts: string[] = [];

  while (cursor < lines.length) {
    const line = lines[cursor].trim();
    if (!line) {
      cursor++;
      continue;
    }
    if (line.startsWith('>')) break;
    if (!REFERENCE_SEQUENCE_PATTERN.test(line)) {
      throw new Error(`MAPLE reference on line ${cursor + 1} contains invalid characters.`);
    }
    referenceParts.push(line.toUpperCase());
    cursor++;
  }

  const reference = referenceParts.join('');
  if (!reference) {
    throw new Error('MAPLE input is missing its reference sequence.');
  }

  const sparseSamples: Array<{ id: string; changes: MapleChange[] }> = [];
  const sampleIds = new Set<string>();

  while (cursor < lines.length) {
    while (cursor < lines.length && !lines[cursor].trim()) cursor++;
    if (cursor >= lines.length) break;

    const header = lines[cursor].trim();
    if (!header.startsWith('>')) {
      throw new Error(`Expected a MAPLE sample header on line ${cursor + 1}.`);
    }
    const id = parseHeader(header, cursor + 1);
    if (sampleIds.has(id)) {
      throw new Error(`MAPLE sample identifier "${id}" is duplicated.`);
    }
    sampleIds.add(id);
    cursor++;

    const changes: MapleChange[] = [];
    while (cursor < lines.length) {
      const line = lines[cursor].trim();
      if (!line) {
        cursor++;
        continue;
      }
      if (line.startsWith('>')) break;
      changes.push(parseChange(line, cursor + 1, reference.length));
      cursor++;
    }
    sparseSamples.push({ id, changes });
  }

  if (!sparseSamples.length) {
    throw new Error('MAPLE input must contain at least one sample after the reference.');
  }

  const expandedBases = reference.length * sparseSamples.length;
  if (!Number.isFinite(expandedBases) || expandedBases > maxExpandedBases) {
    throw new Error(
      `MAPLE alignment expands to ${expandedBases.toLocaleString()} bases, above MicrobeTrace's ` +
      `${maxExpandedBases.toLocaleString()}-base in-browser safety limit.`
    );
  }

  return {
    referenceId,
    reference,
    sequences: sparseSamples.map(sample => ({
      id: sample.id,
      seq: materializeSequence(reference, sample.changes, sample.id),
    })),
  };
}

export function looksLikeMapleAlignment(contents: unknown): boolean {
  if (typeof contents !== 'string') return false;
  const lines = contents.replace(/^\uFEFF/, '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length < 3 || !lines[0].startsWith('>') || !REFERENCE_SEQUENCE_PATTERN.test(lines[1])) {
    return false;
  }

  const secondHeaderIndex = lines.findIndex((line, index) => index > 1 && line.startsWith('>'));
  if (secondHeaderIndex < 0) return false;
  const afterSecondHeader = lines[secondHeaderIndex + 1];

  return !afterSecondHeader || afterSecondHeader.startsWith('>') || /^[ACGTRYSWKMBDHVN-]\s+\d+(?:\s+\d+)?$/i.test(afterSecondHeader);
}
