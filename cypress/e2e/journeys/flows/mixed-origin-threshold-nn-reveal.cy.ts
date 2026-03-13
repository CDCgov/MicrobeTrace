/// <reference types="cypress" />

import { getProfile, resolveExpected } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  assertMetricCount,
  launchProfileToTwoD,
  openGlobalFilteringTab,
  setGlobalLinkThreshold,
  waitForProcessingDialogToClear,
} from '../../../support/journey-helpers';
import { byTestId, testIds } from '../../../support/selectors';

describe('Journey Flow - Mixed-Origin threshold, nearest neighbor, and reveal', () => {
  const profile = getProfile('filtering-mixed-origin-nearest-neighbor');
  const mixedOrigin = profile.expectations.filtering?.mixedOriginNearestNeighbor;
  const thresholdFlow = mixedOrigin?.thresholdFlow;
  const confirmationText = 'It appears that you have links from two different sources';
  const epiOrigin = profile.files.find((file) => file.datatype === 'link')?.name ?? '';

  const findLinkById = (links: any[], id: string) => {
    return links.find(
      (candidate) => candidate.id === id || [candidate.source, candidate.target].sort().join('-') === id,
    );
  };

  const assertThresholdCloseTo = (expectedThreshold: number): void => {
    cy.window()
      .its('commonService.session.style.widgets.link-threshold')
      .should((value) => {
        expect(Number(value), 'link threshold widget').to.be.closeTo(expectedThreshold, 0.00001);
      });
  };

  const assertMixedOriginLaunchState = (expectedTotal?: number): void => {
    cy.window().then((win: any) => {
      const links = win.commonService.session.data.links as any[];
      const mixedOriginLinks = links.filter((link) => Array.isArray(link.origin) && link.origin.length > 1);

      if (expectedTotal !== undefined) {
        expect(mixedOriginLinks.length, 'mixed-origin link count at launch').to.equal(expectedTotal);
      }

      mixedOriginLinks.forEach((link) => {
        expect(link.origin, `launch origin array for ${link.id ?? `${link.source}-${link.target}`}`)
          .to.include(epiOrigin);
      });
    });
  };

  const assertThresholdPreservedMergedLinks = (
    preservedLinkIds: string[],
    threshold: number,
  ): void => {
    cy.window().then((win: any) => {
      const links = win.commonService.session.data.links as any[];

      preservedLinkIds.forEach((id) => {
        const link = findLinkById(links, id);

        expect(link, `preserved mixed-origin link ${id}`).to.exist;
        expect(link.visible, `visibility for preserved mixed-origin link ${id}`).to.equal(true);
        expect(link.origin, `origin array for preserved mixed-origin link ${id}`).to.include(epiOrigin);
        expect(Number(link.distance), `distance for preserved mixed-origin link ${id}`)
          .to.be.greaterThan(threshold);
      });
    });
  };

  const assertNearestNeighborPreservedLinks = (preservedLinkIds: string[]): void => {
    cy.window().then((win: any) => {
      const links = win.commonService.session.data.links as any[];

      preservedLinkIds.forEach((id) => {
        const link = findLinkById(links, id);

        expect(link, `preserved mixed-origin non-NN link ${id}`).to.exist;
        expect(link.visible, `visibility for preserved mixed-origin non-NN link ${id}`).to.equal(true);
        expect(link.origin, `origin array for preserved mixed-origin non-NN link ${id}`).to.include(epiOrigin);
        expect(link.nn, `nn flag for preserved mixed-origin non-NN link ${id}`).to.equal(false);
      });
    });
  };

  const snapshotVisibleLinkIds = (): Cypress.Chainable<string[]> => {
    return cy.window().then((win: any) => {
      const links = win.commonService.session.data.links as any[];

      return links
        .filter((link) => link.visible)
        .map((link) => String(link.id ?? [link.source, link.target].sort().join('-')))
        .sort();
    });
  };

  it('keeps merged-origin links coherent through thresholding, nearest neighbor, and reveal', () => {
    const afterThreshold = resolveExpected(thresholdFlow?.afterThreshold, 'observed');
    const afterNearestNeighbor = resolveExpected(thresholdFlow?.afterNearestNeighbor, 'observed');
    const afterReveal = resolveExpected(thresholdFlow?.afterReveal, 'observed');

    expect(mixedOrigin, 'mixed-origin nearest neighbor expectation').to.exist;
    expect(thresholdFlow, 'mixed-origin threshold flow expectation').to.exist;
    expect(afterThreshold?.visibleLinks, 'visible links after threshold').to.be.a('number');
    expect(afterNearestNeighbor?.visibleLinks, 'visible links after nearest neighbor').to.be.a('number');
    expect(afterReveal?.visibleLinks, 'visible links after reveal').to.be.a('number');

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    assertMixedOriginLaunchState(mixedOrigin!.multiOriginLinks);

    openGlobalFilteringTab();
    setGlobalLinkThreshold(thresholdFlow!.toThreshold);
    assertThresholdCloseTo(thresholdFlow!.toThreshold);
    waitForProcessingDialogToClear();
    cy.closeGlobalSettings();

    assertMetricCount('#numberOfVisibleLinks', afterThreshold!.visibleLinks);
    assertThresholdPreservedMergedLinks(
      thresholdFlow!.thresholdPreservedLinkIds ?? [],
      thresholdFlow!.toThreshold,
    );

    openGlobalFilteringTab();
    cy.get('#prune-select').contains('span', 'Nearest Neighbor').click({ force: true });
    cy.contains('.p-dialog:visible', confirmationText)
      .contains('button', 'Confirm')
      .click({ force: true });

    cy.window().its('commonService.session.style.widgets.link-show-nn').should('equal', true);
    assertThresholdCloseTo(thresholdFlow!.toThreshold);
    waitForProcessingDialogToClear();
    cy.closeGlobalSettings();

    assertMetricCount('#numberOfVisibleLinks', afterNearestNeighbor!.visibleLinks);
    assertThresholdPreservedMergedLinks(
      thresholdFlow!.thresholdPreservedLinkIds ?? [],
      thresholdFlow!.toThreshold,
    );
    assertNearestNeighborPreservedLinks(mixedOrigin!.preservedLinkIds ?? []);

    snapshotVisibleLinkIds().as('afterNearestNeighborVisibleLinkIds');

    openGlobalFilteringTab();
    cy.get(byTestId(testIds.filterRevealEverything)).click({ force: true });
    cy.window().its('commonService.session.style.widgets.link-show-nn').should('equal', true);
    assertThresholdCloseTo(thresholdFlow!.toThreshold);
    waitForProcessingDialogToClear();
    cy.closeGlobalSettings();

    assertMetricCount('#numberOfVisibleLinks', afterReveal!.visibleLinks);
    assertThresholdPreservedMergedLinks(
      thresholdFlow!.thresholdPreservedLinkIds ?? [],
      thresholdFlow!.toThreshold,
    );
    assertNearestNeighborPreservedLinks(mixedOrigin!.preservedLinkIds ?? []);

    cy.get<string[]>('@afterNearestNeighborVisibleLinkIds').then((afterNearestNeighborVisibleLinkIds) => {
      snapshotVisibleLinkIds().should((afterRevealVisibleLinkIds) => {
        expect(afterRevealVisibleLinkIds, 'visible link ids after reveal with same filters active')
          .to.deep.equal(afterNearestNeighborVisibleLinkIds);
      });
    });
  });
});
