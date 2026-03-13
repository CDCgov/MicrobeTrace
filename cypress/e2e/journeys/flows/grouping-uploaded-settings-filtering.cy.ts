/// <reference types="cypress" />

import { getProfile, resolveExpected } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  assertGroupingMembershipFromProfile,
  assertMetricCount,
  assertVisibleNodeIds,
  enableGroupingShow,
  expandAccordionTabByHeader,
  launchProfileToTwoD,
  openGlobalFilteringTab,
  openTwoDSettingsDialog,
  waitForProcessingDialogToClear,
} from '../../../support/journey-helpers';
import { byTestId, testIds } from '../../../support/selectors';

const openGroupingTab = (): void => {
  openTwoDSettingsDialog();
  cy.get('@twoDSettings').contains('.nav-link', 'Grouping').click({ force: true });
  cy.get('@twoDSettings')
    .find('.tab-pane:visible', { timeout: 15000 })
    .should('exist')
    .as('groupingTab');
};

const closeTwoDSettingsDialog = (): void => {
  cy.get('@twoDSettings')
    .find('button.p-dialog-close-button')
    .click({ force: true });

  cy.contains('.p-dialog-title', '2D Network Settings').should('not.exist');
};

const assertVisibleParentNodes = (expectedVisibleParents: number): void => {
  cy.window().then((win: any) => {
    const cyInstance = win.cytoscapeInstance;
    const visibleParents = cyInstance
      .nodes('.parent')
      .filter((node: any) => node.visible());

    expect(visibleParents.length, 'visible grouping parent count').to.equal(expectedVisibleParents);

    visibleParents.forEach((parentNode: any) => {
      const visibleChildren = parentNode
        .children()
        .filter((child: any) => child.visible());

      expect(visibleChildren.length, `visible children for parent ${parentNode.id()}`).to.be.greaterThan(0);
    });
  });
};

describe('Journey Flow - Uploaded grouping settings and filtering', () => {
  const subtypeProfile = getProfile('grouping-tn93-sequences-subtype-colors-threshold');
  const clusterProfile = getProfile('grouping-basic-tn93-epi-linklist-cluster');
  const filteringProfile = getProfile('filtering-min-cluster-reveal-epi-linklist');

  it('updates group label size and orientation from the 2D settings pane on uploaded grouped data', () => {
    const newLabelSize = 34;
    const newOrientation = 'Right';

    launchProfileToTwoD(subtypeProfile);
    assertAfterLaunchCounts(subtypeProfile);

    openGroupingTab();

    expandAccordionTabByHeader('@groupingTab', 'Controls');
    cy.get('@groupingTab')
      .find('#polygons-controls')
      .within(() => {
        cy.get('#polygons-show-toggle').contains('Show').click({ force: true });
      });

    cy.window().its('commonService.session.style.widgets.polygons-show').should('equal', true);

    cy.get('@groupingTab').find('#polygons-foci').should('be.visible').click({ force: true });
    cy.contains('li[role="option"]', 'Subtype').click({ force: true });
    cy.window().its('commonService.session.style.widgets.polygons-foci').should('equal', 'subtype');

    expandAccordionTabByHeader('@groupingTab', 'Labels');
    cy.get('@groupingTab')
      .find('#polygons-label-visibility')
      .contains('Show')
      .click({ force: true });

    cy.window().its('commonService.session.style.widgets.polygons-label-show').should('equal', true);

    cy.get('@groupingTab')
      .find('#polygons-label-size')
      .invoke('val', String(newLabelSize))
      .trigger('input', { force: true })
      .trigger('change', { force: true });

    cy.window().its('commonService.session.style.widgets.polygons-label-size').should('equal', newLabelSize);

    cy.get('@groupingTab').find('#polygon-label-orientation').click({ force: true });
    cy.contains('li[role="option"]', newOrientation).click({ force: true });
    cy.window().its('commonService.session.style.widgets.polygon-label-orientation').should('equal', newOrientation);

    closeTwoDSettingsDialog();

    cy.window().then((win: any) => {
      const parents = win.cytoscapeInstance.nodes('.parent');

      expect(parents.length, 'rendered subtype parent nodes').to.be.greaterThan(0);

      parents.forEach((parentNode: any) => {
        expect(String(parentNode.style('label') || '').trim(), `group label for ${parentNode.id()}`)
          .to.not.equal('');
        expect(String(parentNode.style('font-size') || ''), `group label size for ${parentNode.id()}`)
          .to.contain(String(newLabelSize));
        expect(String(parentNode.style('text-halign') || ''), `group label horizontal alignment for ${parentNode.id()}`)
          .to.equal('right');
        expect(String(parentNode.style('text-valign') || ''), `group label vertical alignment for ${parentNode.id()}`)
          .to.equal('center');
      });
    });
  });

  it('keeps grouping coherent through Minimum Cluster Size filtering and Reveal Everything', () => {
    const minimumClusterSize = filteringProfile.expectations.filtering?.minimumClusterSize;
    const afterCounts = resolveExpected(minimumClusterSize?.after, 'observed');
    const revealCounts = resolveExpected(minimumClusterSize?.reveal?.expectedCounts, 'observed');

    expect(minimumClusterSize, 'minimum cluster size expectation').to.exist;
    expect(afterCounts, 'post-filter counts').to.exist;
    expect(revealCounts, 'post-reveal counts').to.exist;

    launchProfileToTwoD(filteringProfile);
    assertAfterLaunchCounts(filteringProfile);

    enableGroupingShow('cluster');
    assertGroupingMembershipFromProfile(clusterProfile);
    assertVisibleParentNodes(clusterProfile.expectations.afterLaunch.clusters!);

    cy.window().then((win: any) => {
      const visibleNodeIds = win.cytoscapeInstance
        .nodes(':visible')
        .filter((node: any) => node.children().length === 0)
        .map((node: any) => String(node.id()))
        .sort();

      cy.wrap(visibleNodeIds, { log: false }).as('initialVisibleNodeIds');
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

    cy.get('@initialVisibleNodeIds').then((initialVisibleNodeIds) => {
      const expectedVisible = (initialVisibleNodeIds as string[]).filter(
        (nodeId) => !minimumClusterSize!.hiddenNodeIds!.includes(nodeId),
      );

      assertVisibleNodeIds(expectedVisible);
    });

    assertGroupingMembershipFromProfile(clusterProfile);
    assertVisibleParentNodes(afterCounts!.clusters!);

    openGlobalFilteringTab();
    cy.get(byTestId(testIds.filterRevealEverything)).click({ force: true });
    cy.closeGlobalSettings();

    cy.window()
      .its('commonService.session.style.widgets.cluster-minimum-size')
      .should('equal', 1);

    assertMetricCount('#numberOfNodes', revealCounts!.nodes!);
    assertMetricCount('#numberOfVisibleLinks', revealCounts!.visibleLinks!);
    assertMetricCount('#numberOfDisjointComponents', revealCounts!.clusters!);
    assertMetricCount('#numberOfSingletonNodes', revealCounts!.singletons!);
    waitForProcessingDialogToClear();

    cy.get('@initialVisibleNodeIds').then((initialVisibleNodeIds) => {
      assertVisibleNodeIds(initialVisibleNodeIds as string[]);
    });

    assertGroupingMembershipFromProfile(clusterProfile);
    assertVisibleParentNodes(revealCounts!.clusters!);
  });
});
