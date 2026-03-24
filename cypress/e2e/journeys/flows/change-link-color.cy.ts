/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  applyStyleFromProfile,
  launchProfileToTwoD,
} from '../../../support/journey-helpers';

describe('Journey Flow - Change Link Color', () => {
  const profile = getProfile('style-apply-cypress-test-style');

  it(profile.title, () => {
    launchProfileToTwoD(profile);
    applyStyleFromProfile(profile);
    cy.closeGlobalSettings();

    cy.window().then((win: any) => {
      const cyInstance = win.cytoscapeInstance;
      const sportsTeamEdges = cyInstance.edges().filter((edge: any) => edge.data('Contact type') === 'sports team');
      const classroomEdges = cyInstance.edges().filter((edge: any) => edge.data('Contact type') === 'classroom');

      expect(sportsTeamEdges.length, 'sports team edges present').to.be.greaterThan(0);
      expect(classroomEdges.length, 'classroom edges present').to.be.greaterThan(0);

      const sportsTeamColor = sportsTeamEdges[0].style('line-color');
      const classroomColor = classroomEdges[0].style('line-color');

      sportsTeamEdges.forEach((edge: any) => {
        expect(edge.style('line-color')).to.equal(sportsTeamColor);
      });

      classroomEdges.forEach((edge: any) => {
        expect(edge.style('line-color')).to.equal(classroomColor);
      });

      expect(sportsTeamColor, 'different contact types should render different colors')
        .not.to.equal(classroomColor);
    });
  });
});
