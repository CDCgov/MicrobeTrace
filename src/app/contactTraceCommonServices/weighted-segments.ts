export interface WeightedSegmentLike {
  weight?: number;
}

export interface WeightedSegmentRange<T extends WeightedSegmentLike> {
  segment: T;
  startFraction: number;
  endFraction: number;
  weight: number;
}

export function buildNormalizedWeightedSegmentRanges<T extends WeightedSegmentLike>(
  segments: T[],
  isValid: (segment: T) => boolean = () => true
): WeightedSegmentRange<T>[] {
  const validSegments = (segments || [])
    .filter(isValid)
    .map(segment => {
      const requestedWeight = Number(segment?.weight);
      return {
        segment,
        weight: Number.isFinite(requestedWeight) && requestedWeight > 0
          ? requestedWeight
          : 1
      };
    });

  if (validSegments.length < 2) {
    return [];
  }

  const totalWeight = validSegments.reduce((total, entry) => total + entry.weight, 0);
  let cumulativeWeight = 0;

  return validSegments.map((entry, index) => {
    const startFraction = cumulativeWeight / totalWeight;
    cumulativeWeight += entry.weight;
    return {
      ...entry,
      startFraction,
      endFraction: index === validSegments.length - 1
        ? 1
        : cumulativeWeight / totalWeight
    };
  });
}
