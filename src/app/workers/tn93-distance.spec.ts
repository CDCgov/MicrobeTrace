import * as tn93 from 'tn93';

import {
  computeTn93AmbiguityFraction,
  tn93DistanceForStrategy,
  tn93DistanceOnInts,
  tn93PairMatchMode,
} from './tn93-distance';

describe('TN93 integer distance wrapper', () => {
  const ints = (sequence: string) => tn93.toInts(sequence);
  const distance = (source: string, target: string, mode: string) => (
    tn93DistanceOnInts(ints(source), ints(target), mode)
  );

  it('preserves package distances for non-RESOLVE ambiguity modes', () => {
    const source = ints('ACGTNNGT');
    const target = ints('AGGTRRGT');

    ['AVERAGE', 'SKIP', 'GAPMM'].forEach(mode => {
      expect(tn93DistanceOnInts(source, target, mode))
        .withContext(mode)
        .toBe(tn93.onInts(source, target, mode));
    });
  });

  it('computes RESOLVE without the package onInts ReferenceError', () => {
    expect(distance('ACGTACGT', 'AGGTACGT', 'RESOLVE'))
      .toBeCloseTo(0.13903291233808712, 12);
    expect(distance('ACGTACGT', 'AYGTACGT', 'RESOLVE'))
      .toBeCloseTo(0, 12);
    expect(distance('ACGTNNGT', 'AGGTRRGT', 'RESOLVE'))
      .toBeCloseTo(0.14253853215556697, 12);
  });

  it('matches the package string RESOLVE path for IUPAC, gaps, and lengths', () => {
    [
      ['ACGTNNGT', 'AGGTRRGT'],
      ['A-CGTYKV', 'ATCGTBDV'],
      ['ACGTAC', 'ACGTRYNN'],
      ['----ACGT', 'NNNNACGT'],
    ].forEach(([source, target]) => {
      const expected = (tn93 as any)(source, target, 'RESOLVE');
      const actual = distance(source, target, 'RESOLVE');
      if (Number.isNaN(expected)) {
        expect(actual).toBeNaN();
      } else {
        expect(actual)
          .withContext(`${source} / ${target}`)
          .toBeCloseTo(expected, 12);
      }
    });
  });

  it('uses strict HIVTRACE-G ambiguity-threshold pair semantics', () => {
    expect(tn93PairMatchMode('HIVTRACE-G', 0.01, 0.014, 0.015))
      .toBe('RESOLVE');
    expect(tn93PairMatchMode('HIVTRACE-G', 0.015, 0, 0.015))
      .toBe('AVERAGE');

    const source = ints('ACGTACGT');
    const target = ints('AYGTACGT');
    expect(tn93DistanceForStrategy(
      source,
      target,
      'HIVTRACE-G',
      0,
      0.01,
      0.015,
    )).toBe(tn93DistanceOnInts(source, target, 'RESOLVE'));
    expect(tn93DistanceForStrategy(
      source,
      target,
      'HIVTRACE-G',
      0,
      0.02,
      0.015,
    )).toBe(tn93DistanceOnInts(source, target, 'AVERAGE'));
  });

  it('computes ambiguity fractions before strategy selection', () => {
    expect(computeTn93AmbiguityFraction(ints('ACGTNR--'))).toBe(0.5);
    expect(computeTn93AmbiguityFraction(new Uint8Array())).toBe(0);
  });
});
