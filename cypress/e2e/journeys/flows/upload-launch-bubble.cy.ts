/// <reference types="cypress" />

import type { DatasetProfile } from '../datasets/profile';
import { getProfilesByTag } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  goToBubbleView,
  launchProfileToTwoD,
} from '../../../support/journey-helpers';

type WinWithBubble = Window & {
  commonService: any;
};

const getBubbleDataNodes = (bubble: any) =>
  bubble.cy.nodes().filter((node: any) => !node.hasClass('X_axis') && !node.hasClass('Y_axis'));

describe('Journey - upload -> switch to Bubble view', () => {
  const profiles = getProfilesByTag('load-to-bubble');

  profiles.forEach((profile: DatasetProfile) => {
    it(`${profile.title} -> Bubble renders visible nodes without losing cluster grouping`, () => {
      launchProfileToTwoD(profile);
      assertAfterLaunchCounts(profile);
      goToBubbleView();

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
});
