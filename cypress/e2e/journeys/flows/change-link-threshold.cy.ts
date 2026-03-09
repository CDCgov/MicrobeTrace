/// <reference types="cypress" />

import { getProfile, resolveExpected } from '../datasets/profile';
import {
  applyTwoDGroupingFromProfile,
  launchProfileToTwoD,
  readMetricCount,
} from '../../../support/journey-helpers';

describe('Journey Flow - Change Link Threshold', () => {
  const profile = getProfile('grouping-tn93-polygons-subtype');

  it(profile.title, () => {
    const thresholdChange = profile.expectations.grouping?.thresholdChange;
    const beforeVisibleLinks = resolveExpected(profile.expectations.afterLaunch, 'observed')?.visibleLinks;
    const observedVisibleLinksAfter = resolveExpected(
      thresholdChange?.expectedVisibleLinksAfter,
      'observed',
    );
    expect(thresholdChange, 'threshold change expectation').to.exist;
    expect(beforeVisibleLinks, 'pre-threshold visible link count').to.be.a('number');
    expect(observedVisibleLinksAfter, 'observed post-threshold visible link count').to.be.a('number');

    launchProfileToTwoD(profile);
    applyTwoDGroupingFromProfile(profile);

    cy.window().then((win: any) => {
      const cyInstance = win.cytoscapeInstance;
      const initialParents = cyInstance.nodes('.parent').map((node: any) => node.id()).sort();
      cy.wrap(initialParents, { log: false }).as('initialParentIds');
    });

    readMetricCount('#numberOfVisibleLinks').should('equal', beforeVisibleLinks);

    cy.openGlobalSettings();
    cy.contains('#global-settings-modal .nav-link', 'Filtering').click();
    cy.get('#link-threshold').clear().type(String(thresholdChange!.to)).blur();
    cy.window().its('commonService.session.style.widgets.link-threshold').should('equal', thresholdChange!.to);
    cy.closeGlobalSettings();

    readMetricCount('#numberOfVisibleLinks')
      .should('equal', observedVisibleLinksAfter);

    if (thresholdChange!.expectPolygonsUnchanged) {
      cy.get('@initialParentIds').then((initialParentIds) => {
        cy.window().then((win: any) => {
          const cyInstance = win.cytoscapeInstance;
          const currentParentIds = cyInstance.nodes('.parent').map((node: any) => node.id()).sort();
          expect(currentParentIds).to.deep.equal(initialParentIds);
        });
      });
    }
  });
});
