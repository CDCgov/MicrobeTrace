/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  applyPreLaunchFileSettings,
  assertAfterLaunchCounts,
  assertHeatmapReady,
  ensurePreLaunchProfileSynced,
  launchAndWaitForProcessing,
  openHeatmapSettingsDialog,
  visitAppAndAcceptEula,
} from '../../../support/journey-helpers';
import { byTestId, testIds } from '../../../support/selectors';

const openHeatmapExportDialog = (): void => {
  cy.get('heatmapcomponent #tool-btn-container a[title="Export Screen"]:visible', { timeout: 30000 })
    .click({ force: true });

  cy.contains('.p-dialog-title', 'Export Heatmap', { timeout: 15000 })
    .should('be.visible')
    .parents('.p-dialog')
    .as('heatmapExportDialog');
};

describe('Journey Flow - Heatmap large uploaded smoke', () => {
  const profile = getProfile('load-large-node-link-smoke');

  it('renders a large uploaded Heatmap and keeps core dialogs reachable', () => {
    visitAppAndAcceptEula();
    cy.loadFiles(profile.files);
    applyPreLaunchFileSettings(profile);
    ensurePreLaunchProfileSynced(profile);
    launchAndWaitForProcessing(120000);
    assertAfterLaunchCounts(profile);

    cy.get(byTestId(testIds.appViewMenuButton), { timeout: 15000 }).click({ force: true });
    cy.contains('button[mat-menu-item]', 'Heatmap', { timeout: 15000 }).click({ force: true });

    assertHeatmapReady(120000);

    cy.window({ timeout: 120000 }).should((win: any) => {
      const heatmapView = win.commonService.visuals.heatmap;
      const trace = heatmapView?.heatmapData?.[0];

      expect(heatmapView, 'heatmap visual').to.exist;
      expect(heatmapView.heatmapMetric, 'large-data heatmap metric').to.equal('SNPS');
      expect(trace, 'large-data heatmap trace').to.exist;
      expect(trace.type, 'large-data heatmap trace type').to.equal('heatmap');
      expect(trace.x.length, 'large-data heatmap x labels').to.equal(1600);
      expect(trace.y.length, 'large-data heatmap y labels').to.equal(1600);
      expect(trace.z.length, 'large-data heatmap row count').to.equal(1600);
      expect(trace.z[0].length, 'large-data heatmap column count').to.equal(1600);
      expect(trace.colorbar, 'large-data heatmap colorbar').to.exist;
      expect(trace.colorbar.tickvals, 'large-data heatmap colorbar tick values').to.be.an('array').and.not.be.empty;
      expect(
        trace.colorbar.tickvals.every((value: unknown) => Number.isFinite(Number(value))),
        'large-data heatmap colorbar tick values are finite',
      ).to.equal(true);
    });

    openHeatmapSettingsDialog();
    cy.closeSettingsPane('Heatmap Settings');

    openHeatmapExportDialog();
    cy.closeSettingsPane('Export Heatmap');
  });
});
