/// <reference types="cypress" />

import { getProfile, resolveExpected } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  assertMetricCount,
  launchProfileToTwoD,
  openGlobalFilteringTab,
  waitForProcessingDialogToClear,
} from '../../../support/journey-helpers';

describe('Journey Flow - Mixed-Origin Nearest Neighbor', () => {
  const profile = getProfile('filtering-mixed-origin-nearest-neighbor');
  const mixedOrigin = profile.expectations.filtering?.mixedOriginNearestNeighbor;
  const confirmationText = 'It appears that you have links from two different sources';
  const epiOrigin = profile.files.find((file) => file.datatype === 'link')?.name ?? '';

  const assertMixedOriginLinks = (
    expectedTotal?: number,
    preservedLinkIds: string[] = [],
  ) => {
    cy.window().then((win: any) => {
      const links = win.commonService.session.data.links as any[];
      const multiOriginLinks = links.filter((link) => Array.isArray(link.origin) && link.origin.length > 1);

      if (expectedTotal !== undefined) {
        expect(multiOriginLinks.length, 'mixed-origin link count').to.equal(expectedTotal);
      }

      preservedLinkIds.forEach((id) => {
        const link = links.find(
          (candidate) => candidate.id === id || [candidate.source, candidate.target].sort().join('-') === id,
        );

        expect(link, `preserved mixed-origin link ${id}`).to.exist;
        expect(link.visible, `visibility for preserved mixed-origin link ${id}`).to.equal(true);
        expect(link.nn, `nn flag for preserved mixed-origin link ${id}`).to.equal(false);
        expect(link.origin, `origin array for preserved mixed-origin link ${id}`).to.include(epiOrigin);
      });
    });
  };

  const openNearestNeighborConfirmation = () => {
    openGlobalFilteringTab();
    cy.get('#filtering-epsilon-row').should('not.be.visible');
    cy.get('#prune-select').contains('span', 'Nearest Neighbor').click({ force: true });
    cy.contains('.p-dialog:visible', confirmationText, { timeout: 15000 }).as('nnConfirmDialog');
  };

  it('shows a confirmation dialog and leaves the network unchanged when canceled', () => {
    const cancelExpectation = resolveExpected(mixedOrigin?.cancel, 'observed');

    expect(mixedOrigin, 'mixed-origin nearest neighbor expectation').to.exist;
    expect(cancelExpectation?.visibleLinks, 'visible links after cancel').to.be.a('number');

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    assertMixedOriginLinks(mixedOrigin!.multiOriginLinks);

    openNearestNeighborConfirmation();
    cy.get('@nnConfirmDialog').contains('button', 'Cancel').click({ force: true });
    cy.contains('.p-dialog:visible', confirmationText).should('not.exist');

    cy.get('#filtering-epsilon-row').should('not.be.visible');
    cy.window().its('commonService.session.style.widgets.link-show-nn').should('equal', false);
    cy.closeGlobalSettings();

    assertMetricCount('#numberOfVisibleLinks', cancelExpectation!.visibleLinks);
    assertMixedOriginLinks(mixedOrigin!.multiOriginLinks);
  });

  it('confirms nearest neighbor and preserves epi-backed links that are not NN edges', () => {
    const confirmExpectation = resolveExpected(mixedOrigin?.confirm, 'observed');

    expect(mixedOrigin, 'mixed-origin nearest neighbor expectation').to.exist;
    expect(confirmExpectation?.visibleLinks, 'visible links after confirm').to.be.a('number');

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    assertMixedOriginLinks(mixedOrigin!.multiOriginLinks);

    openNearestNeighborConfirmation();
    cy.get('@nnConfirmDialog').contains('button', 'Confirm').click({ force: true });
    cy.contains('.p-dialog:visible', confirmationText).should('not.exist');

    cy.get('#filtering-epsilon-row').should('be.visible');
    cy.window().its('commonService.session.style.widgets.link-show-nn').should('equal', true);
    cy.closeGlobalSettings();

    waitForProcessingDialogToClear();
    assertMetricCount('#numberOfVisibleLinks', confirmExpectation!.visibleLinks);
    assertMixedOriginLinks(undefined, mixedOrigin!.preservedLinkIds);
  });
});
