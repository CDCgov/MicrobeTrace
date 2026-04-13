/// <reference types="cypress" />

import type { DatasetProfile } from '../datasets/profile';
import { getProfile } from '../datasets/profile';
import {
  applyPreLaunchFileSettings,
  assertBubbleReady,
  assertSessionAfterLaunchCounts,
  ensurePreLaunchProfileSynced,
  visitAppAndAcceptEula,
} from '../../../support/journey-helpers';

type WinWithBubble = Window & {
  commonService: any;
};

const getBubbleDataNodes = (bubble: any) =>
  bubble.cy.nodes().filter((node: any) => !node.hasClass('X_axis') && !node.hasClass('Y_axis'));

const asDirectBubbleProfile = (profile: DatasetProfile): DatasetProfile => ({
  ...profile,
  preLaunch: {
    ...profile.preLaunch,
    defaultView: 'Bubble',
  },
});

const launchProfileDirectToBubble = (profile: DatasetProfile): void => {
  visitAppAndAcceptEula();
  cy.loadFiles(profile.files);
  applyPreLaunchFileSettings(profile);
  ensurePreLaunchProfileSynced(profile);
  cy.get('#launch', { timeout: 15000 }).should('not.be.disabled').click({ force: true });
  cy.window({ timeout: 120000 })
    .its('commonService.session.network.isFullyLoaded')
    .should('equal', true);
  assertBubbleReady(120000);
};

describe('Journey Flow - Bubble direct launch uploaded-data smoke matrix', () => {
  const profile = asDirectBubbleProfile(getProfile('color-by-uploaded-categorical'));

  it('launches uploaded node and link files directly into an interactive Bubble view from File Settings', () => {
    launchProfileDirectToBubble(profile);
    assertSessionAfterLaunchCounts(profile);

    cy.window()
      .its('commonService.session.style.widgets.default-view')
      .should('equal', 'Bubble');

    cy.window().should((win: unknown) => {
      const typedWindow = win as WinWithBubble;
      const bubble = typedWindow.commonService.visuals.bubble;
      const visibleNodes = typedWindow.commonService.getVisibleNodes();
      const expectedClusterCount = new Set(
        visibleNodes.map((node: any) => String(node.cluster)),
      ).size;

      const dataNodes = getBubbleDataNodes(bubble);
      const xAxisNodes = bubble.cy.nodes('.X_axis')
        .filter((node: any) => node.id() !== 'x_axis_Label');
      const yAxisNodes = bubble.cy.nodes('.Y_axis')
        .filter((node: any) => node.id() !== 'y_axis_Label');

      expect(String(bubble.widgets['bubble-x']), 'default Bubble X widget').to.equal('cluster');
      expect(String(bubble.widgets['bubble-y']), 'default Bubble Y widget').to.equal('None');
      expect(Boolean(bubble.SelectedNodeCollapsingTypeVariable), 'Bubble starts uncollapsed').to.equal(false);

      expect(dataNodes.length, 'Bubble rendered node count').to.equal(visibleNodes.length);
      expect(xAxisNodes.length, 'Bubble cluster axis count').to.equal(expectedClusterCount);
      expect(yAxisNodes.length, 'Bubble Y-axis stays empty when Y=None').to.equal(0);
    });
  });
});
