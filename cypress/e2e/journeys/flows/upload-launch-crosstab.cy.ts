/// <reference types="cypress" />

import {
  assertRenderedCrosstabMatches,
  buildExpectedCrosstabModel,
} from '../../../support/crosstab-helpers';
import {
  launchProfileToCrosstab,
} from '../../../support/journey-helpers';
import { getProfile, type DatasetProfile } from '../datasets/profile';

type WinWithMT = Window & {
  commonService: any;
};

const CROSSTAB_LAUNCH_PROFILE_IDS = [
  'nn-snps16-edgelist',
  'nn-snps16-matrix',
  'nn-snps16-fasta',
  'style-apply-cypress-test-style',
  'grouping-tn93-sequences-subtype-colors-threshold',
  'load-twod-newick-tn93-angular-testing',
] as const;

describe('Journey - upload -> launch -> Crosstab', () => {
  CROSSTAB_LAUNCH_PROFILE_IDS.forEach((profileId) => {
    const profile = getProfile(profileId) as DatasetProfile;

    it(`${profile.title} launches directly into Crosstab with the default cluster view`, () => {
      launchProfileToCrosstab(profile);

      cy.window().then((rawWin: unknown) => {
        const win = rawWin as WinWithMT;
        const crossTab = win.commonService.visuals.crossTab;

        expect(crossTab.xVariable, 'default launch x field').to.equal('cluster');
        expect(crossTab.yVariable, 'default launch y field').to.equal('None');
        expect(win.commonService.session.style.widgets['default-view'], 'launch default view widget').to.equal('Crosstab');

        const expected = buildExpectedCrosstabModel(win, 'cluster', 'None', false);
        assertRenderedCrosstabMatches(expected);
        expect(expected.footer[expected.footer.length - 1], 'launch footer total').to.equal(
          String(win.commonService.getVisibleNodes().length),
        );
      });
    });
  });
});
