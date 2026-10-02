/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  applyStyleFromProfile,
  assertAfterLaunchCounts,
  assertStyleTablesFromProfile,
  launchProfileToTwoD,
} from '../../../support/journey-helpers';

describe('Journey Flow - Apply Style in 2D Network', () => {
  const profile = getProfile('style-apply-cypress-test-style');
  const getRenderedShapeKey = (node: any): string => String(node.data('shapeKey') || node.style('shape') || '').trim();

  const applyIssue1686Style = (): void => {
    cy.openGlobalSettings();
    cy.contains('.nav-link:visible', 'Styling').click({ force: true });
    cy.fixture('Cypress_Test_Style.style', 'utf8').then((contents) => {
      const style = JSON.parse(String(contents));
      Object.assign(style.widgets, {
        'polygons-show': true,
        'polygons-foci': 'State',
        'polygons-color-show': true,
        'polygon-color-table-visible': 'Show',
      });

      cy.get('#apply-style').selectFile({
        contents: Cypress.Buffer.from(JSON.stringify(style)),
        fileName: 'issue-1686.style',
        mimeType: 'application/json',
      }, { force: true });
    });
  };

  it(profile.title, () => {
    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    applyStyleFromProfile(profile);
    cy.closeGlobalSettings();

    cy.window().then((win: any) => {
      const cyInstance = win.cytoscapeInstance;
      const visibleNodes = cyInstance.nodes().filter((node: any) => !node.hasClass('parent') && node.visible());
      const visibleEdges = cyInstance.edges().filter((edge: any) => edge.visible());

      expect(visibleNodes.length, 'visible nodes present').to.be.greaterThan(0);
      expect(visibleEdges.length, 'visible edges present').to.be.greaterThan(0);

      const healthcareNodes = visibleNodes.filter((node: any) => node.data('Profession') === 'Healthcare');
      const educationNodes = visibleNodes.filter((node: any) => node.data('Profession') === 'Education');
      expect(healthcareNodes.length, 'healthcare nodes present').to.be.greaterThan(0);
      expect(educationNodes.length, 'education nodes present').to.be.greaterThan(0);

      const healthcareColor = healthcareNodes[0].style('background-color');
      const educationColor = educationNodes[0].style('background-color');
      healthcareNodes.forEach((node: any) => {
        expect(node.style('background-color')).to.equal(healthcareColor);
      });
      educationNodes.forEach((node: any) => {
        expect(node.style('background-color')).to.equal(educationColor);
      });
      expect(healthcareColor, 'different professions render different node colors').not.to.equal(educationColor);

      const personNodes = visibleNodes.filter((node: any) => node.data('Node type') === 'Person');
      const facilityNodes = visibleNodes.filter((node: any) => node.data('Node type') === 'Facility');
      expect(personNodes.length, 'person nodes present').to.be.greaterThan(0);
      expect(facilityNodes.length, 'facility nodes present').to.be.greaterThan(0);

      const personShape = getRenderedShapeKey(personNodes[0]);
      const facilityShape = getRenderedShapeKey(facilityNodes[0]);
      personNodes.forEach((node: any) => {
        expect(getRenderedShapeKey(node)).to.equal(personShape);
      });
      facilityNodes.forEach((node: any) => {
        expect(getRenderedShapeKey(node)).to.equal(facilityShape);
      });
      expect(personShape, 'different node types render different shapes').not.to.equal(facilityShape);

      const rankedByDegree = visibleNodes
        .map((node: any) => ({
          degree: Number(node.data('degree') ?? 0),
          width: parseFloat(node.style('width')),
        }))
        .sort((a: any, b: any) => a.degree - b.degree);

      const smallest = rankedByDegree[0];
      const largest = rankedByDegree[rankedByDegree.length - 1];
      expect(largest.degree, 'range of node degrees').to.be.greaterThan(smallest.degree);
      expect(largest.width, 'higher degree node renders larger').to.be.greaterThan(smallest.width);

      const sportsTeamEdges = visibleEdges.filter((edge: any) => edge.data('Contact type') === 'sports team');
      const classroomEdges = visibleEdges.filter((edge: any) => edge.data('Contact type') === 'classroom');
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
      expect(sportsTeamColor, 'different contact types render different link colors').not.to.equal(classroomColor);
    });

    assertStyleTablesFromProfile(profile);
  });

  it('restores degree sizing, grouping, and the group color table together', () => {
    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    applyIssue1686Style();
    cy.closeGlobalSettings();

    cy.window().then((win: any) => {
      const widgets = win.commonService.session.style.widgets;
      const cyInstance = win.cytoscapeInstance;
      const visibleNodes = cyInstance.nodes().filter((node: any) => !node.hasClass('parent') && node.visible());
      const rankedByDegree = visibleNodes
        .map((node: any) => ({
          degree: Number(node.data('degree') ?? 0),
          width: parseFloat(String(node.style('width'))),
        }))
        .sort((a: any, b: any) => a.degree - b.degree);
      const largest = rankedByDegree[rankedByDegree.length - 1];

      expect(widgets['node-radius-variable']).to.equal('degree');
      expect(widgets['polygons-show']).to.equal(true);
      expect(widgets['polygons-foci']).to.equal('State');
      expect(widgets['polygons-color-show']).to.equal(true);
      expect(widgets['polygon-color-table-visible']).to.equal('Show');
      expect(largest.degree).to.be.greaterThan(rankedByDegree[0].degree);
      expect(largest.width).to.be.greaterThan(rankedByDegree[0].width);

      const expectedGroups = Array.from(
        new Set(
          visibleNodes
            .map((node: any) => String(node.data('State') ?? '').trim())
            .filter((value: string) => value && value.toLowerCase() !== 'null'),
        ),
      ).sort();
      const renderedGroups = Array.from(
        new Set(cyInstance.nodes('.parent').map((node: any) => String(node.data('label')))),
      ).sort();
      expect(renderedGroups).to.deep.equal(expectedGroups);
    });

    cy.get('#polygon-color-table', { timeout: 15000 }).should('be.visible');
    cy.get('#polygon-color-table td[data-value]').should('have.length.greaterThan', 0);
  });
});
