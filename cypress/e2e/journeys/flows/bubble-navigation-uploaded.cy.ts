/// <reference types="cypress" />

import { byTestId, testIds } from '../../../support/selectors';
import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  goToBubbleView,
  launchProfileToTwoD,
} from '../../../support/journey-helpers';

type BubbleViewport = {
  zoom: number;
  panX: number;
  panY: number;
};

type WinWithBubble = Window & {
  commonService: any;
};

const readBubbleViewport = (win: WinWithBubble): BubbleViewport => {
  const bubbleCy = win.commonService.visuals.bubble.cy;
  const pan = bubbleCy.pan();

  return {
    zoom: bubbleCy.zoom(),
    panX: pan.x,
    panY: pan.y,
  };
};

describe('Journey Flow - Bubble navigation controls on uploaded data', () => {
  const profile = getProfile('color-by-uploaded-categorical');

  it('restores the fitted Bubble viewport after zoom drift via Center Screen', () => {
    let baselineViewport: BubbleViewport;

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    goToBubbleView();

    cy.window().then((win: unknown) => {
      baselineViewport = readBubbleViewport(win as WinWithBubble);
      const bubbleCy = (win as WinWithBubble).commonService.visuals.bubble.cy;

      expect(bubbleCy.panBy, 'Bubble Cytoscape panBy').to.be.a('function');
      bubbleCy.zoom(2);
      bubbleCy.panBy({ x: 160, y: -120 });
    });

    cy.window().should((win: unknown) => {
      const viewport = readBubbleViewport(win as WinWithBubble);
      const zoomDelta = Math.abs(viewport.zoom - baselineViewport.zoom);

      expect(zoomDelta, 'Bubble zoom changed').to.be.greaterThan(0.1);
    });

    cy.get(byTestId(testIds.bubbleCenterButton), { timeout: 15000 }).click({ force: true });

    cy.window().should((win: unknown) => {
      const viewport = readBubbleViewport(win as WinWithBubble);

      expect(viewport.zoom, 'Bubble zoom restored by Center Screen').to.be.closeTo(baselineViewport.zoom, 0.05);
      expect(viewport.panX, 'Bubble panX restored by Center Screen').to.be.closeTo(baselineViewport.panX, 2);
      expect(viewport.panY, 'Bubble panY restored by Center Screen').to.be.closeTo(baselineViewport.panY, 2);
    });
  });
});
