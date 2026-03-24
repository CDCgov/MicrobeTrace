/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  expandAccordionTabByHeader,
  launchProfileToTwoD,
  openTwoDSettingsDialog,
} from '../../../support/journey-helpers';

const openLinkShapesPanel = (): void => {
  openTwoDSettingsDialog();
  cy.get('@twoDSettings').contains('.nav-link', 'Links').click({ force: true });
  cy.get('@twoDSettings')
    .find('.tab-pane:visible', { timeout: 15000 })
    .should('exist')
    .as('linksTab');

  expandAccordionTabByHeader('@linksTab', 'Shapes and Sizes');
};

const closeTwoDSettingsDialog = (): void => {
  cy.get('@twoDSettings')
    .find('button.p-dialog-close-button')
    .click({ force: true });

  cy.contains('.p-dialog-title', '2D Network Settings').should('not.exist');
};

type ArrowState = {
  target: string;
  source: string;
};

const readArrowState = (edgeId: string): Cypress.Chainable<ArrowState> => {
  return cy.window().then((win: any) => {
    const cyInstance = win.cytoscapeInstance;
    const edge = cyInstance.getElementById(edgeId);

    expect(edge.empty(), `edge exists: ${edgeId}`).to.equal(false);

    return {
      target: String(edge.style('target-arrow-shape')).trim(),
      source: String(edge.style('source-arrow-shape')).trim(),
    };
  });
};

describe('Journey Flow - Uploaded directed and bidirectional arrows', () => {
  const profile = getProfile('links-directed-arrows-uploaded');

  it('renders one-way and bidirectional arrows correctly from uploaded link data', () => {
    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);

    cy.window().then((win: any) => {
      const cyInstance = win.cytoscapeInstance;
      const bidirectionalEdge = cyInstance.getElementById('A-B');
      const directedEdge = cyInstance.getElementById('C-D');

      expect(bidirectionalEdge.empty(), 'bidirectional edge exists').to.equal(false);
      expect(directedEdge.empty(), 'directed-only edge exists').to.equal(false);

      expect(Boolean(bidirectionalEdge.data('directed')), 'bidirectional edge marked directed').to.equal(true);
      expect(Boolean(bidirectionalEdge.data('bidirectional')), 'bidirectional edge marked bidirectional').to.equal(true);
      expect(Boolean(directedEdge.data('directed')), 'directed-only edge marked directed').to.equal(true);
      expect(Boolean(directedEdge.data('bidirectional')), 'directed-only edge not marked bidirectional').to.equal(false);
    });

    readArrowState('A-B').should((state) => {
      expect(state.target, 'default target arrow when arrows are hidden').to.equal('none');
      expect(state.source, 'default source arrow when arrows are hidden').to.equal('none');
    });

    openLinkShapesPanel();

    cy.window().its('commonService.session.style.widgets.link-directed').should('equal', false);
    cy.window().its('commonService.session.style.widgets.link-bidirectional').should('equal', false);
    cy.get('@linksTab').find('#link-bidirectional-row').should('not.be.visible');

    cy.get('@linksTab')
      .find('#link-directed-undirected')
      .contains('Show')
      .click({ force: true });

    cy.window().its('commonService.session.style.widgets.link-directed').should('equal', true);
    cy.get('@linksTab').find('#link-bidirectional-row').should('be.visible');

    readArrowState('A-B').should((state) => {
      expect(state.target, 'bidirectional edge target arrow when directed arrows shown').to.equal('triangle');
      expect(state.source, 'bidirectional edge source arrow before bidirectional toggle').to.equal('none');
    });

    readArrowState('C-D').should((state) => {
      expect(state.target, 'directed-only edge target arrow when directed arrows shown').to.equal('triangle');
      expect(state.source, 'directed-only edge source arrow before bidirectional toggle').to.equal('none');
    });

    cy.get('@linksTab')
      .find('#link-bidirectional')
      .contains('Show')
      .click({ force: true });

    cy.window().its('commonService.session.style.widgets.link-bidirectional').should('equal', true);

    readArrowState('A-B').should((state) => {
      expect(state.target, 'bidirectional edge target arrow when bidirectional arrows shown').to.equal('triangle');
      expect(state.source, 'bidirectional edge source arrow when bidirectional arrows shown').to.equal('triangle');
    });

    readArrowState('C-D').should((state) => {
      expect(state.target, 'directed-only edge target arrow after bidirectional toggle').to.equal('triangle');
      expect(state.source, 'directed-only edge source arrow remains hidden').to.equal('none');
    });

    cy.get('@linksTab')
      .find('#link-directed-undirected')
      .contains('Hide')
      .click({ force: true });

    cy.window().its('commonService.session.style.widgets.link-directed').should('equal', false);
    cy.get('@linksTab').find('#link-bidirectional-row').should('not.be.visible');

    readArrowState('A-B').should((state) => {
      expect(state.target, 'target arrow hidden again').to.equal('none');
      expect(state.source, 'source arrow hidden again').to.equal('none');
    });

    readArrowState('C-D').should((state) => {
      expect(state.target, 'directed-only target arrow hidden again').to.equal('none');
      expect(state.source, 'directed-only source arrow hidden again').to.equal('none');
    });

    closeTwoDSettingsDialog();
  });
});
