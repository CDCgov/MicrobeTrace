/// <reference types="cypress" />

import { getProfile, type DatasetProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  goToSankeyView,
  launchProfileToTwoD,
} from '../../../support/journey-helpers';
import {
  addSankeyFields,
  aliasSankeySelection,
  assertRenderedSankey,
} from '../../../support/sankey-ui-helpers';

const SANKEY_SMOKE_PROFILE_IDS = [
  'nn-snps16-edgelist',
  'nn-snps16-matrix',
  'nn-snps16-fasta',
  'style-apply-cypress-test-style',
  'filtering-metric-switch-sequence-node-list',
  'load-twod-newick-tn93-angular-testing',
  'filtering-mixed-origin-nearest-neighbor',
] as const;

describe('Journey - upload -> launch -> Sankey', () => {
  SANKEY_SMOKE_PROFILE_IDS.forEach((profileId) => {
    const profile = getProfile(profileId) as DatasetProfile;

    it(`${profile.title} -> Sankey render`, () => {
      launchProfileToTwoD(profile);
      assertAfterLaunchCounts(profile);
      goToSankeyView();

      aliasSankeySelection();
      addSankeyFields();
      assertRenderedSankey();
    });
  });
});
