/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  assertAlignmentReady,
  expandAccordionTabByHeader,
  launchProfileToAlignment,
  openAlignmentSettingsDialog,
} from '../../../support/journey-helpers';

type AlignmentWindow = Window & {
  commonService: {
    visuals: {
      alignment: any;
    };
  };
};

const AA_LOGO_SELECTOR = '.R, .N, .D, .E, .Q, .H, .I, .L, .K, .M, .F, .P, .S, .W, .Y, .V';

describe('Journey Flow - Alignment uploaded controls', () => {
  const profile = getProfile('alignment-covid-node-link-excluded');
  const nodeListProfile = getProfile('alignment-angulartesting-sequence-node-list');

  it('keeps uploaded Alignment layout controls deterministic for mini-map visibility and top-display mode', () => {
    launchProfileToAlignment(profile);
    assertAfterLaunchCounts(profile);
    assertAlignmentReady();

    openAlignmentSettingsDialog();
    expandAccordionTabByHeader('@alignmentSettings', 'Layout');

    cy.get('@alignmentSettings')
      .find('#alignment-show-minimap')
      .contains('Hide')
      .click({ force: true });
    cy.get('#miniMapHolder').should('not.be.visible');

    cy.get('@alignmentSettings')
      .find('#alignment-show-minimap')
      .contains('Show')
      .click({ force: true });
    cy.get('#miniMapHolder').should('be.visible');

    cy.get('@alignmentSettings')
      .find('#alignment-top-display')
      .contains('Logo')
      .click({ force: true });

    cy.get('#alignmnetTopTitle').should('have.text', 'Logo');
    cy.get('#alignmentTop svg')
      .find('g.A, path.C, path.G, path.T')
      .its('length')
      .should('be.greaterThan', 0);

    cy.get('@alignmentSettings')
      .find('button.p-dialog-close-button')
      .click({ force: true });

    cy.contains('.p-dialog-title', 'Alignment View Settings').should('not.exist');
    assertAlignmentReady();
  });

  it('renders the amino-acid top display logo branch deterministically on uploaded Alignment data', () => {
    launchProfileToAlignment(nodeListProfile);
    assertAfterLaunchCounts(nodeListProfile);
    assertAlignmentReady();

    openAlignmentSettingsDialog();
    expandAccordionTabByHeader('@alignmentSettings', 'Data');

    cy.get('@alignmentSettings')
      .find('#alignment-start-position')
      .invoke('val', '2')
      .trigger('input')
      .trigger('change');
    cy.get('@alignmentSettings')
      .find('#alignment-end-position')
      .invoke('val', '52')
      .trigger('input')
      .trigger('change');

    cy.get('@alignmentSettings')
      .find('#alignment-seq-type')
      .contains('Amino Acids')
      .click({ force: true });

    assertAlignmentReady();

    cy.window().then((win: unknown) => {
      const alignment = (win as AlignmentWindow).commonService.visuals.alignment;
      expect(alignment.selectedSeqType, 'selected sequence type').to.equal('aa');
    });

    expandAccordionTabByHeader('@alignmentSettings', 'Layout');

    cy.get('@alignmentSettings')
      .find('#alignment-top-display')
      .contains('Logo')
      .click({ force: true });

    assertAlignmentReady();

    cy.get('#alignmnetTopTitle').should('have.text', 'Logo');
    cy.get('#alignmentTop svg')
      .find(AA_LOGO_SELECTOR)
      .its('length')
      .should('be.greaterThan', 0);

    cy.get('@alignmentSettings')
      .find('button.p-dialog-close-button')
      .click({ force: true });
    cy.contains('.p-dialog-title', 'Alignment View Settings').should('not.exist');
    assertAlignmentReady();
  });
});
