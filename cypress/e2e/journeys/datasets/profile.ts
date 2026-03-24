// cypress/e2e/journeys/datasets/profile.ts
// Central registry for dataset profiles used by journey tests.
// Re-export types so flows can keep importing from this file.

export * from './types';

import type { DatasetProfile } from './types';

import { NN_PROFILES } from './profiles/nn';
import { STYLE_PROFILES } from './profiles/style';
import { GROUPING_PROFILES } from './profiles/grouping';
import { FILTERING_PROFILES } from './profiles/filtering';
import { NEWICK_PROFILES } from './profiles/newick';
import { LOAD_PROFILES } from './profiles/load';
import { LINK_PROFILES } from './profiles/links';
import { COLOR_BY_PROFILES } from './profiles/color-by';
import { TIMELINE_PROFILES } from './profiles/timeline';
import { MAP_PROFILES } from './profiles/map';

export const DATASET_PROFILES: DatasetProfile[] = [
  ...LOAD_PROFILES,
  ...NN_PROFILES,
  ...STYLE_PROFILES,
  ...GROUPING_PROFILES,
  ...FILTERING_PROFILES,
  ...NEWICK_PROFILES,
  ...LINK_PROFILES,
  ...COLOR_BY_PROFILES,
  ...TIMELINE_PROFILES,
  ...MAP_PROFILES,
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
