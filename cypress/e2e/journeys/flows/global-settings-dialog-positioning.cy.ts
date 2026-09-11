/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  expandAccordionTabByHeader,
  launchProfileToTwoD,
  openTwoDSettingsDialog,
} from '../../../support/journey-helpers';

function getOverlapArea(first: DOMRect, second: DOMRect): number {
  const overlapWidth = Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left));
  const overlapHeight = Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));

  return overlapWidth * overlapHeight;
}

function getEffectiveZIndex(element: HTMLElement): number {
  let current: HTMLElement | null = element;

  while (current) {
    const zIndex = current.ownerDocument.defaultView?.getComputedStyle(current).zIndex;
    const numericZIndex = zIndex && zIndex !== 'auto' ? Number(zIndex) : NaN;

    if (Number.isFinite(numericZIndex)) {
      return numericZIndex;
    }

    current = current.parentElement;
  }

  return 0;
}

function expectRectInsideViewport(rect: DOMRect, win: Window, label: string): void {
  expect(rect.left, `${label} left`).to.be.at.least(0);
  expect(rect.top, `${label} top`).to.be.at.least(0);
  expect(rect.right, `${label} right`).to.be.at.most(win.innerWidth);
  expect(rect.bottom, `${label} bottom`).to.be.at.most(win.innerHeight);
}

describe('Journey Flow - Global Settings dialog positioning', () => {
  const profile = getProfile('color-by-uploaded-categorical');

  it('opens linked Global Settings above and beside the 2D Network Settings dialog', () => {
    cy.viewport(1800, 900);

    launchProfileToTwoD(profile);
    openTwoDSettingsDialog();

    cy.get('@twoDSettings').contains('.nav-link', 'Nodes').click({ force: true });
    cy.get('@twoDSettings')
      .find('.tab-pane:visible', { timeout: 15000 })
      .should('exist')
      .as('nodesTab');

    expandAccordionTabByHeader('@nodesTab', 'Colors');
    cy.get('@nodesTab').contains('button', 'Show Colors').scrollIntoView().click({ force: true });

    cy.contains('.p-dialog-title', 'Global Settings', { timeout: 15000 })
      .should('be.visible')
      .parents('.p-dialog')
      .should('be.visible')
      .as('globalSettings');

    cy.get('@twoDSettings').should('be.visible');
    cy.get('@globalSettings').should('be.visible');

    cy.get('@twoDSettings').then(($sourceDialog) => {
      cy.get('@globalSettings').then(($globalSettingsDialog) => {
        const sourceDialog = $sourceDialog[0] as HTMLElement;
        const globalSettingsDialog = $globalSettingsDialog[0] as HTMLElement;
        const win = globalSettingsDialog.ownerDocument.defaultView;

        expect(win, 'dialog window').to.exist;

        const sourceRect = sourceDialog.getBoundingClientRect();
        const globalRect = globalSettingsDialog.getBoundingClientRect();

        expectRectInsideViewport(sourceRect, win!, '2D Network Settings');
        expectRectInsideViewport(globalRect, win!, 'Global Settings');

        expect(getEffectiveZIndex(globalSettingsDialog), 'Global Settings z-index')
          .to.be.greaterThan(getEffectiveZIndex(sourceDialog));

        const centerX = Math.min(Math.max(globalRect.left + globalRect.width / 2, 1), win!.innerWidth - 1);
        const centerY = Math.min(Math.max(globalRect.top + globalRect.height / 2, 1), win!.innerHeight - 1);
        const topmostElement = globalSettingsDialog.ownerDocument.elementFromPoint(centerX, centerY);

        expect(
          topmostElement === globalSettingsDialog || globalSettingsDialog.contains(topmostElement),
          'Global Settings is topmost at its center point',
        ).to.equal(true);

        expect(getOverlapArea(sourceRect, globalRect), 'dialog overlap area on a wide viewport')
          .to.be.lessThan(1);
      });
    });
  });
});
