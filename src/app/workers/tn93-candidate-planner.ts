import type {
  Tn93AdaptiveFallbackReason,
  Tn93AmbiguityStrategy,
  Tn93PlanTimings,
} from './tn93-engine.types';
import {
  computeTn93AmbiguityFraction,
  tn93DistanceForStrategy,
} from './tn93-distance';

export const DEFAULT_TN93_PROGRESSIVE_MINIMUM_PAIR_COUNT = 5000;
export const DEFAULT_TN93_PROGRESSIVE_MAXIMUM_CANDIDATE_RATIO = 0.8;

export interface Tn93PlannerSequence {
  _seqInt: Uint8Array;
  _ambiguity?: number;
  validForConsensus?: boolean;
}

export interface Tn93CandidatePlan {
  consensus: Uint8Array;
  ambiguities: Float64Array;
  radii: Float64Array;
  totalPairs: number;
  candidatePairs: number;
  candidateRatio: number;
  foregroundPairIndices: Uint32Array;
  deferredPairs: number;
  progressive: boolean;
  fallbackReason?: Tn93AdaptiveFallbackReason;
  timings: Tn93PlanTimings;
}

export interface Tn93ProgressiveDecision {
  progressive: boolean;
  fallbackReason?: Tn93AdaptiveFallbackReason;
}

function clockNow(): number {
  return typeof performance !== 'undefined' && performance.now
    ? performance.now()
    : Date.now();
}

export function tn93PairCount(sequenceCount: number): number {
  const count = Math.max(0, Math.floor(sequenceCount));
  return count * (count - 1) / 2;
}

export function tn93PairIndex(
  sourceIndex: number,
  targetIndex: number,
): number {
  const source = Math.max(sourceIndex, targetIndex);
  const target = Math.min(sourceIndex, targetIndex);
  if (
    source === target
    || source < 0
    || target < 0
    || !Number.isInteger(source)
    || !Number.isInteger(target)
  ) {
    throw new Error('TN93 pair coordinates must be distinct non-negative integers');
  }
  return source * (source - 1) / 2 + target;
}

export function tn93PairCoordinates(
  pairIndex: number,
): { sourceIndex: number; targetIndex: number } {
  if (!Number.isInteger(pairIndex) || pairIndex < 0) {
    throw new Error('TN93 pair index must be a non-negative integer');
  }

  const sourceIndex = Math.floor((1 + Math.sqrt(1 + 8 * pairIndex)) / 2);
  return {
    sourceIndex,
    targetIndex: pairIndex - sourceIndex * (sourceIndex - 1) / 2,
  };
}

export function createTn93PairBitset(totalPairs: number): Uint8Array {
  return new Uint8Array(Math.ceil(Math.max(0, totalPairs) / 8));
}

export function hasTn93Pair(
  bitset: Uint8Array,
  pairIndex: number,
): boolean {
  return (bitset[pairIndex >>> 3] & (1 << (pairIndex & 7))) !== 0;
}

export function markTn93Pair(
  bitset: Uint8Array,
  pairIndex: number,
): boolean {
  const byteIndex = pairIndex >>> 3;
  const mask = 1 << (pairIndex & 7);
  const wasMarked = (bitset[byteIndex] & mask) !== 0;
  bitset[byteIndex] |= mask;
  return !wasMarked;
}

/**
 * Reproduces the existing consensus tie-breaking order (A, C, G, T, gap;
 * later values win ties), while excluding synthetic placeholder records.
 */
export function buildTn93Consensus(
  sequences: ArrayLike<Tn93PlannerSequence>,
): Uint8Array {
  let consensusLength = 0;
  let validCount = 0;
  for (let index = 0; index < sequences.length; index++) {
    if (sequences[index].validForConsensus === false) continue;
    validCount++;
    consensusLength = Math.max(
      consensusLength,
      sequences[index]._seqInt.length,
    );
  }
  if (validCount === 0) return new Uint8Array();

  const consensus = new Uint8Array(consensusLength);
  for (let site = 0; site < consensusLength; site++) {
    const counts = [0, 0, 0, 0, 0];
    for (let index = 0; index < sequences.length; index++) {
      const sequence = sequences[index];
      if (
        sequence.validForConsensus === false
        || site >= sequence._seqInt.length
      ) {
        continue;
      }

      const base = sequence._seqInt[site];
      if (base < 4) counts[base]++;
      else if (base === 17) counts[4]++;
    }

    let selected = 0;
    let maximum = counts[0];
    for (let candidate = 1; candidate < counts.length; candidate++) {
      if (maximum <= counts[candidate]) {
        maximum = counts[candidate];
        selected = candidate;
      }
    }
    consensus[site] = selected === 4 ? 17 : selected;
  }

  return consensus;
}

export function computeTn93Ambiguities(
  sequences: ArrayLike<Tn93PlannerSequence>,
): Float64Array {
  const ambiguities = new Float64Array(sequences.length);
  for (let index = 0; index < sequences.length; index++) {
    const supplied = Number(sequences[index]._ambiguity);
    ambiguities[index] = Number.isFinite(supplied)
      ? supplied
      : Math.fround(computeTn93AmbiguityFraction(sequences[index]._seqInt));
  }
  return ambiguities;
}

export function computeTn93ConsensusRadii(
  sequences: ArrayLike<Tn93PlannerSequence>,
  consensus: Uint8Array,
  ambiguities: Float64Array,
  strategy: Tn93AmbiguityStrategy,
  ambiguityThreshold: number,
): Float64Array {
  const radii = new Float64Array(sequences.length);
  const consensusAmbiguity = Math.fround(
    computeTn93AmbiguityFraction(consensus),
  );

  for (let index = 0; index < sequences.length; index++) {
    radii[index] = tn93DistanceForStrategy(
      sequences[index]._seqInt,
      consensus,
      strategy,
      ambiguities[index],
      consensusAmbiguity,
      ambiguityThreshold,
    );
  }
  return radii;
}

/**
 * Stable radial sort plus a two-pointer window. The result contains every
 * finite-radius pair whose raw Float64 difference is <= threshold and every
 * pair involving a non-finite radius.
 */
export function enumerateTn93CandidatePairIndices(
  radii: ArrayLike<number>,
  threshold: number,
): Uint32Array {
  const count = radii.length;
  const totalPairs = tn93PairCount(count);
  if (!Number.isFinite(threshold) || threshold < 0) {
    const allPairs = new Uint32Array(totalPairs);
    for (let pairIndex = 0; pairIndex < totalPairs; pairIndex++) {
      allPairs[pairIndex] = pairIndex;
    }
    return allPairs;
  }

  const finite: Array<{ index: number; radius: number }> = [];
  const nonFinite: number[] = [];
  for (let index = 0; index < count; index++) {
    const radius = radii[index];
    if (Number.isFinite(radius)) finite.push({ index, radius });
    else nonFinite.push(index);
  }
  finite.sort((left, right) => (
    left.radius - right.radius || left.index - right.index
  ));

  const candidates: number[] = [];
  let windowEnd = 1;
  for (let windowStart = 0; windowStart < finite.length; windowStart++) {
    windowEnd = Math.max(windowEnd, windowStart + 1);
    while (
      windowEnd < finite.length
      && finite[windowEnd].radius - finite[windowStart].radius <= threshold
    ) {
      windowEnd++;
    }
    for (
      let candidateIndex = windowStart + 1;
      candidateIndex < windowEnd;
      candidateIndex++
    ) {
      candidates.push(tn93PairIndex(
        finite[windowStart].index,
        finite[candidateIndex].index,
      ));
    }
  }

  // Finite/non-finite and non-finite/non-finite sets are disjoint from the
  // finite radial-window set, so no deduplication scan over all pairs is needed.
  for (const nonFiniteIndex of nonFinite) {
    for (const finiteEntry of finite) {
      candidates.push(tn93PairIndex(nonFiniteIndex, finiteEntry.index));
    }
  }
  for (let source = 1; source < nonFinite.length; source++) {
    for (let target = 0; target < source; target++) {
      candidates.push(tn93PairIndex(
        nonFinite[source],
        nonFinite[target],
      ));
    }
  }

  return Uint32Array.from(candidates);
}

export function complementTn93PairIndices(
  totalPairs: number,
  included: ArrayLike<number>,
): Uint32Array {
  const bitset = createTn93PairBitset(totalPairs);
  for (let index = 0; index < included.length; index++) {
    markTn93Pair(bitset, included[index]);
  }

  const complement = new Uint32Array(totalPairs - included.length);
  let outputIndex = 0;
  for (let pairIndex = 0; pairIndex < totalPairs; pairIndex++) {
    if (!hasTn93Pair(bitset, pairIndex)) {
      complement[outputIndex++] = pairIndex;
    }
  }
  return outputIndex === complement.length
    ? complement
    : complement.slice(0, outputIndex);
}

export function decideTn93ProgressiveMode(
  totalPairs: number,
  candidatePairs: number,
  threshold: number,
  hasValidConsensusSequence: boolean,
  minimumPairCount = DEFAULT_TN93_PROGRESSIVE_MINIMUM_PAIR_COUNT,
  maximumCandidateRatio =
    DEFAULT_TN93_PROGRESSIVE_MAXIMUM_CANDIDATE_RATIO,
): Tn93ProgressiveDecision {
  if (!Number.isFinite(threshold) || threshold < 0) {
    return { progressive: false, fallbackReason: 'invalid-threshold' };
  }
  if (!hasValidConsensusSequence) {
    return {
      progressive: false,
      fallbackReason: 'no-valid-consensus-sequences',
    };
  }
  if (totalPairs < minimumPairCount) {
    return {
      progressive: false,
      fallbackReason: 'below-minimum-pair-count',
    };
  }

  const ratio = totalPairs === 0 ? 1 : candidatePairs / totalPairs;
  if (ratio > maximumCandidateRatio) {
    return {
      progressive: false,
      fallbackReason: 'candidate-ratio-too-high',
    };
  }
  return { progressive: true };
}

export function createTn93CandidatePlan(
  sequences: ArrayLike<Tn93PlannerSequence>,
  strategy: Tn93AmbiguityStrategy,
  ambiguityThreshold: number,
  threshold: number,
  minimumPairCount = DEFAULT_TN93_PROGRESSIVE_MINIMUM_PAIR_COUNT,
  maximumCandidateRatio =
    DEFAULT_TN93_PROGRESSIVE_MAXIMUM_CANDIDATE_RATIO,
): Tn93CandidatePlan {
  const planningStartedAt = clockNow();

  const ambiguityStartedAt = clockNow();
  const ambiguities = computeTn93Ambiguities(sequences);
  const ambiguityMs = clockNow() - ambiguityStartedAt;

  const consensusStartedAt = clockNow();
  const consensus = buildTn93Consensus(sequences);
  const consensusMs = clockNow() - consensusStartedAt;

  const radialStartedAt = clockNow();
  const radii = computeTn93ConsensusRadii(
    sequences,
    consensus,
    ambiguities,
    strategy,
    ambiguityThreshold,
  );
  const radialDistanceMs = clockNow() - radialStartedAt;

  const sortStartedAt = clockNow();
  const candidatePairIndices = enumerateTn93CandidatePairIndices(
    radii,
    threshold,
  );
  const sortAndWindowMs = clockNow() - sortStartedAt;
  const totalPairs = tn93PairCount(sequences.length);
  const candidatePairs = candidatePairIndices.length;
  const candidateRatio = totalPairs === 0 ? 1 : candidatePairs / totalPairs;
  let hasValidConsensusSequence = false;
  for (let index = 0; index < sequences.length; index++) {
    if (sequences[index].validForConsensus !== false) {
      hasValidConsensusSequence = true;
      break;
    }
  }
  const decision = decideTn93ProgressiveMode(
    totalPairs,
    candidatePairs,
    threshold,
    hasValidConsensusSequence,
    minimumPairCount,
    maximumCandidateRatio,
  );
  const foregroundPairIndices = decision.progressive
    ? candidatePairIndices
    : (() => {
      const allPairs = new Uint32Array(totalPairs);
      for (let pairIndex = 0; pairIndex < totalPairs; pairIndex++) {
        allPairs[pairIndex] = pairIndex;
      }
      return allPairs;
    })();

  return {
    consensus,
    ambiguities,
    radii,
    totalPairs,
    candidatePairs,
    candidateRatio,
    foregroundPairIndices,
    deferredPairs: totalPairs - foregroundPairIndices.length,
    progressive: decision.progressive,
    fallbackReason: decision.fallbackReason,
    timings: {
      ambiguityMs,
      consensusMs,
      radialDistanceMs,
      sortAndWindowMs,
      totalPlanningMs: clockNow() - planningStartedAt,
    },
  };
}
