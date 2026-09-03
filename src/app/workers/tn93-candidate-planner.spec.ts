import * as tn93 from 'tn93';

import {
  buildTn93Consensus,
  complementTn93PairIndices,
  computeTn93Ambiguities,
  computeTn93ConsensusRadii,
  createTn93CandidatePlan,
  createTn93PairBitset,
  decideTn93ProgressiveMode,
  enumerateTn93CandidatePairIndices,
  hasTn93Pair,
  markTn93Pair,
  tn93PairCount,
  tn93PairCoordinates,
  tn93PairIndex,
} from './tn93-candidate-planner';
import { tn93DistanceForStrategy } from './tn93-distance';
import { TN93_CONSENSUS_WINDOW_COUNTEREXAMPLE } from './tn93-counterexample.fixture';

describe('TN93 consensus-window candidate planner', () => {
  const sequence = (
    value: string,
    validForConsensus = true,
    ambiguity?: number,
  ) => ({
    _seqInt: tn93.toInts(value),
    validForConsensus,
    _ambiguity: ambiguity,
  });

  it('builds consensus only from valid records with stable legacy ties', () => {
    const consensus = buildTn93Consensus([
      sequence('AAAA'),
      sequence('CCCC'),
      sequence('TTTT', false),
      sequence('----', false),
    ]);

    // C wins each A/C tie because the legacy consensus chooses later symbols.
    expect(Array.from(consensus)).toEqual(Array.from(tn93.toInts('CCCC')));
  });

  it('computes ambiguities before exact Float64 consensus radii', () => {
    const sources = [
      sequence('ACGTACGT'),
      sequence('AYGTACGT'),
    ];
    const consensus = buildTn93Consensus(sources);
    const ambiguities = computeTn93Ambiguities(sources);

    expect(ambiguities[1]).toBe(Math.fround(1 / 8));
    ['AVERAGE', 'RESOLVE', 'SKIP', 'GAPMM', 'HIVTRACE-G'].forEach(strategy => {
      const radii = computeTn93ConsensusRadii(
        sources,
        consensus,
        ambiguities,
        strategy as any,
        0.015,
      );
      expect(radii).toEqual(jasmine.any(Float64Array));
      expect(radii[1]).toBe(tn93DistanceForStrategy(
        sources[1]._seqInt,
        consensus,
        strategy as any,
        ambiguities[1],
        0,
        0.015,
      ));
    });
  });

  it('includes raw-threshold equality and all tied radii', () => {
    expect(Array.from(enumerateTn93CandidatePairIndices(
      [0, 0.015, 0.2],
      0.015,
    ))).toEqual([tn93PairIndex(0, 1)]);
    expect(Array.from(enumerateTn93CandidatePairIndices(
      [0.2, 0.1, 0.2, 0.3],
      0,
    ))).toEqual([tn93PairIndex(0, 2)]);
  });

  it('conservatively foregrounds every pair with a non-finite radius', () => {
    const candidates = Array.from(enumerateTn93CandidatePairIndices(
      [0, 0.1, Number.NaN, Number.POSITIVE_INFINITY],
      0.01,
    )).sort((left, right) => left - right);

    expect(candidates).toEqual([1, 2, 3, 4, 5]);
  });

  it('partitions candidate and complement pairs without overlap', () => {
    const candidates = enumerateTn93CandidatePairIndices(
      [0, 0.01, 0.5, 0.51],
      0.02,
    );
    const complement = complementTn93PairIndices(6, candidates);
    const all = [...Array.from(candidates), ...Array.from(complement)]
      .sort((left, right) => left - right);

    expect(all).toEqual([0, 1, 2, 3, 4, 5]);
    expect(new Set(all).size).toBe(6);
  });

  it('defers a qualifying TN93 counterexample only while the matrix is provisional', () => {
    const fixture = TN93_CONSENSUS_WINDOW_COUNTEREXAMPLE;
    const sources = fixture.sequences.map(value => sequence(value));
    const consensus = buildTn93Consensus(sources);
    const ambiguities = computeTn93Ambiguities(sources);
    const radii = computeTn93ConsensusRadii(
      sources,
      consensus,
      ambiguities,
      'AVERAGE',
      0.015,
    );
    const pairIndex = tn93PairIndex(
      fixture.qualifyingSourceIndex,
      fixture.qualifyingTargetIndex,
    );
    const directDistance = tn93DistanceForStrategy(
      sources[fixture.qualifyingSourceIndex]._seqInt,
      sources[fixture.qualifyingTargetIndex]._seqInt,
      'AVERAGE',
      ambiguities[fixture.qualifyingSourceIndex],
      ambiguities[fixture.qualifyingTargetIndex],
      0.015,
    );
    const candidates = enumerateTn93CandidatePairIndices(
      radii,
      fixture.threshold,
    );
    const complement = complementTn93PairIndices(
      tn93PairCount(sources.length),
      candidates,
    );

    expect(directDistance).toBeLessThanOrEqual(fixture.threshold);
    expect(Math.abs(
      radii[fixture.qualifyingSourceIndex]
      - radii[fixture.qualifyingTargetIndex]
    )).toBeGreaterThan(fixture.threshold);
    expect(Array.from(candidates)).not.toContain(pairIndex);
    expect(Array.from(complement)).toContain(pairIndex);
  });

  it('activates at 5000 pairs and a candidate ratio of at most 80%', () => {
    expect(decideTn93ProgressiveMode(4999, 1, 0.015, true))
      .toEqual({
        progressive: false,
        fallbackReason: 'below-minimum-pair-count',
      });
    expect(decideTn93ProgressiveMode(5000, 4000, 0.015, true).progressive)
      .toBeTrue();
    expect(decideTn93ProgressiveMode(5000, 4001, 0.015, true))
      .toEqual({
        progressive: false,
        fallbackReason: 'candidate-ratio-too-high',
      });
  });

  it('falls back when there is no valid consensus input', () => {
    const plan = createTn93CandidatePlan(
      [sequence('----', false), sequence('----', false)],
      'AVERAGE',
      0.015,
      0.015,
      0,
    );

    expect(plan.progressive).toBeFalse();
    expect(plan.fallbackReason).toBe('no-valid-consensus-sequences');
    expect(plan.foregroundPairIndices.length).toBe(1);
  });

  it('round-trips triangular indices and tracks computed pairs compactly', () => {
    expect(tn93PairCoordinates(0)).toEqual({
      sourceIndex: 1,
      targetIndex: 0,
    });
    expect(tn93PairCoordinates(9)).toEqual({
      sourceIndex: 4,
      targetIndex: 3,
    });

    const bitset = createTn93PairBitset(10);
    expect(markTn93Pair(bitset, 9)).toBeTrue();
    expect(markTn93Pair(bitset, 9)).toBeFalse();
    expect(hasTn93Pair(bitset, 9)).toBeTrue();
    expect(bitset.length).toBe(2);
  });
});
