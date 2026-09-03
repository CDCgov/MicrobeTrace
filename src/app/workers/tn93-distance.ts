import * as tn93 from 'tn93';

import type {
  Tn93AmbiguityStrategy,
  Tn93MatchMode,
} from './tn93-engine.types';

function finishTn93(pairwiseCounts: number[][]): number {
  const nucleotideFrequencies = [0, 0, 0, 0];
  for (let sourceBase = 0; sourceBase < 4; sourceBase++) {
    for (let targetBase = 0; targetBase < 4; targetBase++) {
      const count = pairwiseCounts[sourceBase][targetBase];
      nucleotideFrequencies[sourceBase] += count;
      nucleotideFrequencies[targetBase] += count;
    }
  }

  const total = nucleotideFrequencies.reduce((sum, value) => sum + value, 0);
  const totalNonGap = 2 / total;
  let ag = (pairwiseCounts[0][2] + pairwiseCounts[2][0]) * totalNonGap;
  let ct = (pairwiseCounts[1][3] + pairwiseCounts[3][1]) * totalNonGap;
  let transversions = 1 - (
    (
      pairwiseCounts[0][0]
      + pairwiseCounts[1][1]
      + pairwiseCounts[2][2]
      + pairwiseCounts[3][3]
    ) * totalNonGap
    + ag
    + ct
  );

  if (nucleotideFrequencies.some(value => value === 0)) {
    ag = 1 - 2 * (ag + ct) - transversions;
    ct = 1 - 2 * transversions;
    return ag > 0 && ct > 0
      ? -0.5 * Math.log(ag) - 0.25 * Math.log(ct)
      : 1;
  }

  const frequencies = nucleotideFrequencies.map(value => value / total);
  const purines = frequencies[0] + frequencies[2];
  const pyrimidines = frequencies[1] + frequencies[3];
  const k1 = 2 * frequencies[0] * frequencies[2] / purines;
  const k2 = 2 * frequencies[1] * frequencies[3] / pyrimidines;
  const k3 = 2 * (
    purines * pyrimidines
    - frequencies[0] * frequencies[2] * pyrimidines / purines
    - frequencies[1] * frequencies[3] * purines / pyrimidines
  );

  ag = 1 - ag / k1 - 0.5 * transversions / purines;
  ct = 1 - ct / k2 - 0.5 * transversions / pyrimidines;
  transversions = 1 - 0.5 * transversions / pyrimidines / purines;

  return -k1 * Math.log(ag)
    - k2 * Math.log(ct)
    - k3 * Math.log(transversions);
}

/**
 * tn93 0.3.5's integer RESOLVE path references an undeclared variable before
 * it reaches the otherwise-valid implementation. This is the package's
 * algorithm, isolated here so RESOLVE remains safe on packed Uint8Array input.
 */
function resolveTn93OnInts(source: Uint8Array, target: Uint8Array): number {
  const resolutions: number[][] = (tn93 as any).resolutions;
  const resolutionWeights: number[] = (tn93 as any).resolutionsCount;
  const length = Math.min(source.length, target.length);
  const pairwiseCounts = Array.from({ length: 4 }, () => [0, 0, 0, 0]);

  for (let site = 0; site < length; site++) {
    const sourceBase = source[site];
    const targetBase = target[site];
    if (sourceBase < 4 && targetBase < 4) {
      pairwiseCounts[sourceBase][targetBase] += 1;
      continue;
    }
    if (sourceBase === 17 || targetBase === 17) {
      continue;
    }

    if (sourceBase < 4) {
      if (resolutionWeights[targetBase] > 0) {
        if (resolutions[targetBase][sourceBase]) {
          pairwiseCounts[sourceBase][sourceBase] += 1;
          continue;
        }
        for (let resolvedTarget = 0; resolvedTarget < 4; resolvedTarget++) {
          if (resolutions[targetBase][resolvedTarget]) {
            pairwiseCounts[sourceBase][resolvedTarget]
              += resolutionWeights[targetBase];
          }
        }
      }
      continue;
    }

    if (targetBase < 4) {
      if (resolutionWeights[sourceBase] > 0) {
        if (resolutions[sourceBase][targetBase]) {
          pairwiseCounts[targetBase][targetBase] += 1;
          continue;
        }
        for (let resolvedSource = 0; resolvedSource < 4; resolvedSource++) {
          if (resolutions[sourceBase][resolvedSource]) {
            pairwiseCounts[resolvedSource][targetBase]
              += resolutionWeights[sourceBase];
          }
        }
      }
      continue;
    }

    const weight = resolutionWeights[sourceBase] * resolutionWeights[targetBase];
    if (weight <= 0) continue;

    const sharedResolutions: number[] = [];
    for (let base = 0; base < 4; base++) {
      if (resolutions[sourceBase][base] && resolutions[targetBase][base]) {
        sharedResolutions.push(base);
      }
    }
    if (sharedResolutions.length > 0) {
      const sharedWeight = 1 / sharedResolutions.length;
      for (const base of sharedResolutions) {
        pairwiseCounts[base][base] += sharedWeight;
      }
      continue;
    }

    for (let resolvedSource = 0; resolvedSource < 4; resolvedSource++) {
      if (!resolutions[sourceBase][resolvedSource]) continue;
      for (let resolvedTarget = 0; resolvedTarget < 4; resolvedTarget++) {
        if (resolutions[targetBase][resolvedTarget]) {
          pairwiseCounts[resolvedSource][resolvedTarget] += weight;
        }
      }
    }
  }

  return finishTn93(pairwiseCounts);
}

export function computeTn93AmbiguityFraction(sequence: Uint8Array): number {
  if (sequence.length === 0) return 0;

  let ambiguousSites = 0;
  for (let site = 0; site < sequence.length; site++) {
    if (sequence[site] > 3) ambiguousSites++;
  }
  return ambiguousSites / sequence.length;
}

export function normalizeTn93Strategy(
  strategy: string,
): Tn93AmbiguityStrategy {
  const normalized = String(strategy || 'AVERAGE').toUpperCase();
  switch (normalized) {
    case 'RESOLVE':
    case 'SKIP':
    case 'GAPMM':
    case 'HIVTRACE-G':
      return normalized;
    default:
      return 'AVERAGE';
  }
}

export function tn93PairMatchMode(
  strategy: Tn93AmbiguityStrategy,
  sourceAmbiguity: number,
  targetAmbiguity: number,
  ambiguityThreshold: number,
): Tn93MatchMode {
  if (strategy !== 'HIVTRACE-G') return strategy;

  return sourceAmbiguity < ambiguityThreshold
    && targetAmbiguity < ambiguityThreshold
    ? 'RESOLVE'
    : 'AVERAGE';
}

export function tn93DistanceOnInts(
  source: Uint8Array,
  target: Uint8Array,
  matchMode: Tn93MatchMode | string,
): number {
  const normalizedMode = normalizeTn93Strategy(matchMode);
  if (normalizedMode === 'RESOLVE') {
    return resolveTn93OnInts(source, target);
  }

  const concreteMode = normalizedMode === 'HIVTRACE-G'
    ? 'AVERAGE'
    : normalizedMode;
  return tn93.onInts(source, target, concreteMode);
}

export function tn93DistanceForStrategy(
  source: Uint8Array,
  target: Uint8Array,
  strategy: Tn93AmbiguityStrategy,
  sourceAmbiguity: number,
  targetAmbiguity: number,
  ambiguityThreshold: number,
): number {
  return tn93DistanceOnInts(
    source,
    target,
    tn93PairMatchMode(
      strategy,
      sourceAmbiguity,
      targetAmbiguity,
      ambiguityThreshold,
    ),
  );
}
