/// <reference types="cypress" />

import type { DistanceMetric } from '../datasets/profile';
import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  assertHeatmapMatchesBackingMatrix,
  launchProfileToHeatmap,
  openGlobalFilteringTab,
  setGlobalDistanceMetric,
} from '../../../support/journey-helpers';

type MetricSwitchCase = {
  expectedThreshold: number;
  nextMetric: DistanceMetric;
  profileId: string;
  title: string;
};

const METRIC_SWITCH_CASES: MetricSwitchCase[] = [
  {
    profileId: 'heatmap-snps-fasta',
    nextMetric: 'tn93',
    expectedThreshold: 0.015,
    title: 'recomputes the active Heatmap from SNPs to TN93 on uploaded FASTA data',
  },
  {
    profileId: 'heatmap-tn93-sequence-node-list',
    nextMetric: 'snps',
    expectedThreshold: 16,
    title: 'recomputes the active Heatmap from TN93 to SNPs on an uploaded sequence node list',
  },
];

describe('Journey Flow - Heatmap post-launch distance metric switch', () => {
  METRIC_SWITCH_CASES.forEach((metricSwitchCase: MetricSwitchCase) => {
    const profile = getProfile(metricSwitchCase.profileId);

    it(metricSwitchCase.title, () => {
      launchProfileToHeatmap(profile);
      assertAfterLaunchCounts(profile);
      assertHeatmapMatchesBackingMatrix({
        metric: profile.preLaunch.metric,
        labelsVisible: false,
      });

      openGlobalFilteringTab();
      setGlobalDistanceMetric(metricSwitchCase.nextMetric);
      cy.closeGlobalSettings();

      cy.window()
        .its('commonService.session.style.widgets.default-distance-metric')
        .should('equal', metricSwitchCase.nextMetric);
      cy.window()
        .its('commonService.session.style.widgets.link-threshold')
        .should((threshold) => {
          expect(Number(threshold)).to.equal(metricSwitchCase.expectedThreshold);
        });
      cy.window({ timeout: 30000 })
        .its('commonService.visuals.heatmap.heatmapMetric')
        .should('equal', metricSwitchCase.nextMetric.toUpperCase());

      assertHeatmapMatchesBackingMatrix({
        metric: metricSwitchCase.nextMetric,
        labelsVisible: false,
      });
    });
  });
});
