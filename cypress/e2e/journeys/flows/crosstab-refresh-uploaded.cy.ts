/// <reference types="cypress" />

import {
  assertRenderedCrosstabMatches,
  buildExpectedCrosstabModel,
} from '../../../support/crosstab-helpers';
import {
  assertAfterLaunchCounts,
  assertMetricCount,
  goToCrosstabView,
  launchProfileToTwoD,
  openGlobalFilteringTab,
  waitForProcessingDialogToClear,
} from '../../../support/journey-helpers';
import { getProfile, resolveExpected } from '../datasets/profile';
import { byTestId, testIds } from '../../../support/selectors';

type WinWithMT = Window & {
  commonService: any;
};

describe('Journey Flow - Crosstab uploaded refresh', () => {
  const profile = getProfile('filtering-min-cluster-reveal-epi-linklist');

  it('recomputes the cluster Crosstab while minimum cluster size filtering and Reveal Everything change the visible graph', () => {
    const minimumClusterSize = profile.expectations.filtering?.minimumClusterSize;
    const afterCounts = resolveExpected(minimumClusterSize?.after, 'observed');
    const revealCounts = resolveExpected(minimumClusterSize?.reveal?.expectedCounts, 'observed');

    expect(minimumClusterSize, 'minimum cluster size expectation').to.exist;
    expect(afterCounts, 'post-filter counts').to.exist;
    expect(revealCounts, 'post-reveal counts').to.exist;

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    goToCrosstabView();
    cy.closeSettingsPane('Crosstab Settings');

    cy.window().then((rawWin: unknown) => {
      const expected = buildExpectedCrosstabModel(rawWin as WinWithMT, 'cluster', 'None', false);
      assertRenderedCrosstabMatches(expected);
    });

    openGlobalFilteringTab();
    cy.get(byTestId(testIds.filterMinimumClusterSize))
      .clear()
      .type(String(minimumClusterSize!.to))
      .blur();

    cy.window()
      .its('commonService.session.style.widgets.cluster-minimum-size')
      .should('equal', minimumClusterSize!.to);

    cy.closeGlobalSettings();

    assertMetricCount('#numberOfNodes', afterCounts!.nodes!);
    assertMetricCount('#numberOfVisibleLinks', afterCounts!.visibleLinks!);
    assertMetricCount('#numberOfDisjointComponents', afterCounts!.clusters!);
    assertMetricCount('#numberOfSingletonNodes', afterCounts!.singletons!);
    waitForProcessingDialogToClear();

    cy.window().then((rawWin: unknown) => {
      const win = rawWin as WinWithMT;
      const expected = buildExpectedCrosstabModel(win, 'cluster', 'None', false);

      assertRenderedCrosstabMatches(expected);
      expect(expected.footer[expected.footer.length - 1], 'filtered footer total').to.equal(
        String(win.commonService.getVisibleNodes().length),
      );
    });

    openGlobalFilteringTab();
    cy.get(byTestId(testIds.filterRevealEverything)).click({ force: true });
    cy.closeGlobalSettings();

    assertMetricCount('#numberOfNodes', revealCounts!.nodes!);
    assertMetricCount('#numberOfVisibleLinks', revealCounts!.visibleLinks!);
    assertMetricCount('#numberOfDisjointComponents', revealCounts!.clusters!);
    assertMetricCount('#numberOfSingletonNodes', revealCounts!.singletons!);
    waitForProcessingDialogToClear();

    cy.window().then((rawWin: unknown) => {
      const win = rawWin as WinWithMT;
      const expected = buildExpectedCrosstabModel(win, 'cluster', 'None', false);

      assertRenderedCrosstabMatches(expected);
      expect(expected.footer[expected.footer.length - 1], 'revealed footer total').to.equal(
        String(win.commonService.getVisibleNodes().length),
      );
    });
  });
});
