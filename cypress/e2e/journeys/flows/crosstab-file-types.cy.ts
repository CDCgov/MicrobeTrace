/// <reference types="cypress" />

import {
  buildExpectedCrosstabModel,
  chooseCrosstabFields,
  assertRenderedCrosstabMatches,
  selectCrosstabField,
} from '../../../support/crosstab-helpers';
import {
  assertAfterLaunchCounts,
  goToCrosstabView,
  launchProfileToTwoD,
} from '../../../support/journey-helpers';
import { getProfile } from '../datasets/profile';

type WinWithMT = Window & {
  commonService: any;
};

const CROSSTAB_LOAD_PROFILES = [
  'nn-snps16-edgelist',
  'nn-snps16-matrix',
  'nn-snps16-fasta',
  'style-apply-cypress-test-style',
  'grouping-tn93-sequences-subtype-colors-threshold',
  'load-twod-newick-tn93-angular-testing',
] as const;

describe('Journey Flow - Crosstab uploaded file-type smoke', () => {
  CROSSTAB_LOAD_PROFILES.forEach((profileId) => {
    const profile = getProfile(profileId);

    it(`opens Crosstab and renders deterministic totals after ${profile.title}`, () => {
      launchProfileToTwoD(profile);
      assertAfterLaunchCounts(profile);
      goToCrosstabView();

      cy.contains('.p-dialog-title', 'Crosstab Settings', { timeout: 10000 })
        .should('be.visible')
        .parents('.p-dialog')
        .as('crosstabSettings');

      cy.window().then((rawWin: unknown) => {
        const win = rawWin as WinWithMT;
        const { xField, yField } = chooseCrosstabFields(win);

        selectCrosstabField('@crosstabSettings', 'crosstab-x-variable', xField, 'crosstab-xVariable');
        selectCrosstabField('@crosstabSettings', 'crosstab-y-variable', yField, 'crosstab-yVariable');

        cy.window().then((nextRawWin: unknown) => {
          const nextWin = nextRawWin as WinWithMT;
          const expected = buildExpectedCrosstabModel(nextWin, xField, yField, false);

          assertRenderedCrosstabMatches(expected);
          expect(expected.footer[expected.footer.length - 1], 'crosstab total count').to.equal(
            String(nextWin.commonService.getVisibleNodes().length),
          );
        });
      });
    });
  });
});
