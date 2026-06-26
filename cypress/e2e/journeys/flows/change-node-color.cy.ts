/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  applyStyleFromProfile,
  launchProfileToTwoD,
} from '../../../support/journey-helpers';

describe('Journey Flow - Change Node Color', () => {
  const profile = getProfile('style-apply-cypress-test-style');

  it(profile.title, () => {
    launchProfileToTwoD(profile);
    applyStyleFromProfile(profile);
    cy.closeGlobalSettings();

    cy.window().then((win: any) => {
      const cyInstance = win.cytoscapeInstance;
      const educationNodes = cyInstance.nodes().filter((node: any) => node.data('Profession') === 'Education');

      expect(educationNodes.length, 'education nodes present').to.be.greaterThan(0);
      educationNodes.forEach((node: any) => {
        expect(node.style('background-color')).to.match(/rgb\(242,\s*32,\s*32\)/);
      });
    });
  });
});
