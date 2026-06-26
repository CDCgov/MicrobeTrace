/// <reference types="cypress" />

import type { DatasetProfile } from '../datasets/profile';
import { getProfilesByTag } from '../datasets/profile';
import {
  assertNetworkMatchesOracleSnapshot,
  computeOracleForProfile,
  getOracleSnapshot,
  launchProfileToTwoD,
  openGlobalFilteringTab,
  setGlobalDistanceMetric,
  setTwoDLinkLabelVariable,
} from '../../../support/journey-helpers';
import type { OracleStep } from '../../../oracle/types';

describe('Journey Flow - Post-launch Distance Metric Switch', () => {
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

      const oracleSteps: OracleStep[] = metricSwitch!.steps.map((step, index) => ({
        id: `metric-switch-${index}`,
        kind: 'set-distance-metric',
        metric: step.toMetric,
      }));
      computeOracleForProfile(profile, oracleSteps);

      launchProfileToTwoD(profile);
      getOracleSnapshot().then((snapshot) => {
        assertNetworkMatchesOracleSnapshot(snapshot);
      });

      setTwoDLinkLabelVariable('distance');
      assertVisibleDistanceLabels();

      metricSwitch!.steps.forEach((step, index) => {
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

        getOracleSnapshot('oracleResult', `metric-switch-${index}`).then((snapshot) => {
          assertNetworkMatchesOracleSnapshot(snapshot);
        });
        assertVisibleDistanceLabels();
      });
    });
  });
});
