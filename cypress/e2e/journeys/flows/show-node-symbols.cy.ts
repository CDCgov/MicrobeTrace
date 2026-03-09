/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  applyStyleFromProfile,
  launchProfileToTwoD,
} from '../../../support/journey-helpers';

describe('Journey Flow - Show Node Symbols', () => {
  const profile = getProfile('style-apply-cypress-test-style');

  it(profile.title, () => {
    launchProfileToTwoD(profile);
    applyStyleFromProfile(profile);
    cy.closeGlobalSettings();

    cy.window()
      .its('commonService.session.style.widgets.node-symbol-table-visible')
      .should('equal', 'Show');

    cy.window().then((win: any) => {
      const cyInstance = win.cytoscapeInstance;
      const shapes = new Set(
        cyInstance.nodes()
          .filter((node: any) => !node.hasClass('parent'))
          .map((node: any) => node.style('shape'))
      );

      expect(shapes.size, 'multiple node shapes rendered').to.be.greaterThan(1);
    });
  });
});
