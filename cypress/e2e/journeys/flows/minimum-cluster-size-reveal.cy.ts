/// <reference types="cypress" />

import { getProfile, resolveExpected } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  assertMetricCount,
  assertVisibleNodeIds,
  launchProfileToTwoD,
  openGlobalFilteringTab,
  waitForProcessingDialogToClear,
} from '../../../support/journey-helpers';
import { byTestId, testIds } from '../../../support/selectors';

describe('Journey Flow - Minimum Cluster Size and Reveal Everything', () => {
  const profile = getProfile('filtering-min-cluster-reveal-epi-linklist');

  it(profile.title, () => {
    const minimumClusterSize = profile.expectations.filtering?.minimumClusterSize;
    const afterCounts = resolveExpected(minimumClusterSize?.after, 'observed');
    const revealCounts = resolveExpected(minimumClusterSize?.reveal?.expectedCounts, 'observed');

    expect(minimumClusterSize, 'minimum cluster size expectation').to.exist;
    expect(afterCounts, 'post-filter counts').to.exist;
    expect(revealCounts, 'post-reveal counts').to.exist;

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    cy.get('#link-threshold-statistic').should('not.be.visible');
    cy.get('#currentLinkThreshold').should('have.text', '');

    cy.window().then((win: any) => {
      const cyInstance = win.cytoscapeInstance;
      const initialVisibleNodeIds = cyInstance
        .nodes(':visible')
        .filter((node: any) => node.children().length === 0)
        .map((node: any) => String(node.id()))
        .sort();

      cy.wrap(initialVisibleNodeIds, { log: false }).as('initialVisibleNodeIds');
    });

    openGlobalFilteringTab();
    cy.get('[data-testid="distance-controls-unavailable"]')
      .should('be.visible')
      .and('contain.text', 'no molecular-distance data');
    cy.get('#default-distance-metric').should('be.disabled');
    cy.get('#prune-select [role="button"]')
      .should('have.length', 2)
      .and('have.attr', 'data-p-disabled', 'true');
    cy.get('#link-threshold').should('be.disabled');
    cy.get('[data-testid="threshold-stability-toggle"]').should('be.disabled');
    cy.get(byTestId(testIds.filterMinimumClusterSize)).should('be.enabled');
    cy.get(byTestId(testIds.filterMinimumClusterSize))
      .clear()
      .wait(200)
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

    if (minimumClusterSize!.hiddenNodeIds?.length) {
      cy.get('@initialVisibleNodeIds').then((initialVisibleNodeIds) => {
        const expectedVisible = (initialVisibleNodeIds as string[]).filter(
          (nodeId) => !minimumClusterSize!.hiddenNodeIds!.includes(nodeId),
        );
        assertVisibleNodeIds(expectedVisible);
      });
    }

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

    if (minimumClusterSize!.reveal?.restoredNodeIds?.length) {
      cy.get('@initialVisibleNodeIds').then((initialVisibleNodeIds) => {
        assertVisibleNodeIds(initialVisibleNodeIds as string[]);
      });
    }
  });

  it('keeps Minimum Cluster Size active while distance controls are unavailable', () => {
    const minimumClusterSize = profile.expectations.filtering?.minimumClusterSize;

    expect(minimumClusterSize, 'minimum cluster size expectation').to.exist;

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);

    cy.window().then((win: any) => {
      const initialVisibleNodeIds = win.cytoscapeInstance
        .nodes(':visible')
        .filter((node: any) => node.children().length === 0)
        .map((node: any) => String(node.id()))
        .sort();

      cy.wrap(initialVisibleNodeIds, { log: false }).as('initialVisibleNodeIds');
    });

    openGlobalFilteringTab();
    cy.get('#link-threshold').should('be.disabled');
    cy.get('[data-testid="threshold-stability-toggle"]').should('be.disabled');
    cy.get(byTestId(testIds.filterMinimumClusterSize))
      .clear()
      .type(String(minimumClusterSize!.to))
      .blur();

    cy.window()
      .its('commonService.session.style.widgets.cluster-minimum-size')
      .should('equal', minimumClusterSize!.to);

    cy.closeGlobalSettings();
    waitForProcessingDialogToClear();

    cy.get('@initialVisibleNodeIds').then((initialVisibleNodeIds) => {
      const expectedVisibleNodeIds = (initialVisibleNodeIds as string[]).filter(
        (nodeId) => !minimumClusterSize!.hiddenNodeIds!.includes(nodeId),
      );

      cy.wrap(expectedVisibleNodeIds, { log: false }).as('clusterFilteredNodeIds');
      assertVisibleNodeIds(expectedVisibleNodeIds);
    });

    cy.window()
      .its('commonService.session.style.widgets.cluster-minimum-size')
      .should('equal', minimumClusterSize!.to);

    cy.get('@clusterFilteredNodeIds').then((clusterFilteredNodeIds) => {
      assertVisibleNodeIds(clusterFilteredNodeIds as string[]);
    });

    // Optional sanity that counts stay coherent with the filter state.
    assertMetricCount('#numberOfNodes', minimumClusterSize!.after.nodes!);
  });
});
