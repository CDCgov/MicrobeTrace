/// <reference types="cypress" />

import type { DatasetProfile } from '../datasets/profile';
import { getProfilesByTag, resolveExpected } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  assertMetricCount,
  launchProfileToTwoD,
  openGlobalFilteringTab,
  setGlobalDistanceMetric,
  setTwoDLinkLabelVariable,
} from '../../../support/journey-helpers';

const contractMode =
  Cypress.env('contractMode') === true ||
  Cypress.env('contractMode') === '1' ||
  Cypress.env('contractMode') === 1;

(contractMode ? describe : describe.skip)('Journey Contracts - Post-launch Distance Metric Switch', () => {
  const profiles = getProfilesByTag('metric-switch');

  const assertVisibleDistanceLabels = () => {
    cy.window().then((win: any) => {
      const cyInstance = win.cytoscapeInstance;
      const labeledVisibleEdges = cyInstance
        .edges(':visible')
        .filter((edge: any) => /\d/.test(String(edge.data('label') || '')));

      expect(labeledVisibleEdges.length, 'visible edges labeled with distance').to.be.greaterThan(0);
    });
  };

  profiles.forEach((profile: DatasetProfile) => {
    it(profile.title, () => {
      const metricSwitch = profile.expectations.filtering?.metricSwitch;

      expect(metricSwitch, 'metric-switch expectation').to.exist;
      expect(metricSwitch?.steps.length, 'metric-switch step count').to.be.greaterThan(0);

      launchProfileToTwoD(profile);
      assertAfterLaunchCounts(profile);

      setTwoDLinkLabelVariable('distance');
      assertVisibleDistanceLabels();

      metricSwitch!.steps.forEach((step) => {
        const expectedAfter = resolveExpected(step.after, 'observed');

        expect(expectedAfter?.visibleLinks, `visible links after switch to ${step.toMetric}`).to.be.a('number');

        openGlobalFilteringTab();
        setGlobalDistanceMetric(step.toMetric);
        cy.closeGlobalSettings();

        cy.get('#numberOfVisibleLinks', { timeout: 20000 }).should('be.visible');
        cy.window()
          .its('commonService.session.style.widgets.link-threshold')
          .should((threshold) => {
            expect(Number(threshold)).to.equal(step.expectedThreshold);
          });
        cy.window()
          .its('commonService.GlobalSettingsModel.SelectedLinkThresholdVariable')
          .should((threshold) => {
            expect(Number(threshold)).to.equal(step.expectedThreshold);
          });
        cy.get('#link-threshold').should('have.value', String(step.expectedThreshold));

        assertMetricCount('#numberOfVisibleLinks', expectedAfter!.visibleLinks);
        assertVisibleDistanceLabels();
      });
    });
  });
});
