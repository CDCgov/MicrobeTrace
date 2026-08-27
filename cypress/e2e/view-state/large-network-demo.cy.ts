/// <reference types="cypress" />

import { assertMetricCount } from '../../support/journey-helpers';

describe('Built-in large network demo', () => {
  it('loads the above-guardrail network and keeps full counts visible', () => {
    cy.visit('/?skipEula=1&skipDemoSession=1&largeDemo=1');

    cy.get('[data-testid="large-network-demo-summary"]', { timeout: 15000 })
      .should('contain.text', '500 nodes')
      .and('contain.text', '124,750 threshold-qualified links');

    cy.get('[data-testid="app-sample-dataset-button"]')
      .should('contain.text', 'Continue with Large Network Demo')
      .click({ force: true });

    assertMetricCount('#numberOfNodes', 500, 120000);
    assertMetricCount('#numberOfVisibleLinks', 124750, 120000);
    cy.get('[data-testid="adaptive-network-view-row"]', { timeout: 120000 })
      .should('be.visible')
      .and('contain.text', 'Drawn nodes / link bundles');

    cy.window().should((win: any) => {
      const view = win.commonService.session.meta.adaptiveNetwork.lastView;
      expect(view.representedNodeCount).to.equal(500);
      expect(view.representedLinkCount).to.equal(124750);
      expect(view.drawnNodeCount).to.be.at.most(200);
      expect(view.drawnEdgeCount).to.be.at.most(20000);
      expect(view.representationComplete).to.equal(true);
    });
  });
});
