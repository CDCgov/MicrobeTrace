// cypress/e2e/journeys/datasets/profile.ts
// Central registry for dataset profiles used by journey tests.
// Re-export types so flows can keep importing from this file.

export * from './types';

import type { DatasetProfile } from './types';

import { NN_PROFILES } from './profiles/nn';
import { STYLE_PROFILES } from './profiles/style';
import { GROUPING_PROFILES } from './profiles/grouping';

export const DATASET_PROFILES: DatasetProfile[] = [
  ...NN_PROFILES,
  ...STYLE_PROFILES,
  ...GROUPING_PROFILES,
];

export const DATASET_PROFILE_MAP: Record<string, DatasetProfile> = DATASET_PROFILES
  .reduce((acc, p) => {
    acc[p.id] = p;
    return acc;
  }, {} as Record<string, DatasetProfile>);

export function getProfile(id: string): DatasetProfile {
  const p = DATASET_PROFILE_MAP[id];
  if (!p) {
    throw new Error(`Unknown dataset profile id: ${id}`);
  }
  return p;
}

export function getProfilesByTag(tag: string): DatasetProfile[] {
  return DATASET_PROFILES.filter(p => p.tags.includes(tag));
}

export function getProfilesByTags(tags: string[]): DatasetProfile[] {
  return DATASET_PROFILES.filter(p => tags.every(t => p.tags.includes(t)));
}
