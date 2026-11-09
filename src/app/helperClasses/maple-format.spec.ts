import { looksLikeMapleAlignment, parseMapleAlignment } from './maple-format';

describe('MAPLE alignment format', () => {
  const maple = [
    '>REF',
    'AACCGGTT',
    '>same-as-reference',
    '>changed',
    'T\t2',
    'N\t5\t2',
    '>deleted',
    '-\t3\t3',
  ].join('\n');

  it('expands substitutions, missing runs, deletions, and reference-identical samples', () => {
    const parsed = parseMapleAlignment(maple);

    expect(parsed.referenceId).toBe('REF');
    expect(parsed.reference).toBe('AACCGGTT');
    expect(parsed.sequences).toEqual([
      { id: 'same-as-reference', seq: 'AACCGGTT' },
      { id: 'changed', seq: 'ATCCNNTT' },
      { id: 'deleted', seq: 'AA---GTT' },
    ]);
  });

  it('detects MAPLE without mistaking ordinary FASTA for it', () => {
    expect(looksLikeMapleAlignment(maple)).toBeTrue();
    expect(looksLikeMapleAlignment('>one\nAACCGGTT\n>two\nAACCGGTA')).toBeFalse();
  });

  it('rejects overlapping and out-of-range changes', () => {
    expect(() => parseMapleAlignment('>REF\nAAAA\n>sample\nN 2 2\nT 3')).toThrowError(/overlapping/);
    expect(() => parseMapleAlignment('>REF\nAAAA\n>sample\nN 4 2')).toThrowError(/beyond the reference/);
  });

  it('enforces the expanded alignment safety limit', () => {
    expect(() => parseMapleAlignment(maple, 8)).toThrowError(/safety limit/);
  });
});
