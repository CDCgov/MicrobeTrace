/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  launchProfileToTwoD,
  openTwoDSettingsDialog,
  expandAccordionTabByHeader,
  waitForProcessingDialogToClear,
} from '../../../support/journey-helpers';
import { byTestId, testIds } from '../../../support/selectors';

type NodeSnapshot = {
  id: string;
  x: number;
  y: number;
};

const pinAllButton = byTestId(testIds.twodPinAllButton);
const recalculateButton = byTestId(testIds.twodRecalculateLayoutButton);
const linkLengthSlider = '#link-length';

const readNodeSnapshots = (sampleSize = 4): Cypress.Chainable<NodeSnapshot[]> => {
  return cy.window().then((win: any) => {
    const cyInstance = win.cytoscapeInstance;
    expect(cyInstance, 'cytoscapeInstance').to.exist;

    return cyInstance
      .nodes()
      .filter((node: any) => node.children().length === 0)
      .slice(0, sampleSize)
      .map((node: any) => ({
        id: node.id(),
        x: node.position('x'),
        y: node.position('y'),
      })) as NodeSnapshot[];
  });
};

const distanceBetween = (a: NodeSnapshot, b: NodeSnapshot): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt((dx * dx) + (dy * dy));
};

const assertNodeMovement = (before: NodeSnapshot[], after: NodeSnapshot[], expectation: 'moved' | 'still'): void => {
  const afterById = new Map(after.map((node) => [node.id, node]));

  if (expectation === 'moved') {
    const moved = before.some((nodeBefore) => {
      const nodeAfter = afterById.get(nodeBefore.id);
      expect(nodeAfter, `node still present after action: ${nodeBefore.id}`).to.exist;
      return distanceBetween(nodeBefore, nodeAfter as NodeSnapshot) > 0.2;
    });
    expect(moved, 'at least one sampled node moved').to.equal(true);
    return;
  }

  const unchanged = before.every((nodeBefore) => {
    const nodeAfter = afterById.get(nodeBefore.id);
    expect(nodeAfter, `node still present after action: ${nodeBefore.id}`).to.exist;
    return distanceBetween(nodeBefore, nodeAfter as NodeSnapshot) < 0.05;
  });
  expect(unchanged, 'sampled nodes remain stable').to.equal(true);
};

const openLinksShapesPanel = (): void => {
  openTwoDSettingsDialog();

  cy.get('@twoDSettings').contains('.nav-link', 'Links').click({ force: true });
  cy.get('@twoDSettings')
    .find('.tab-pane:visible', { timeout: 15000 })
    .should('exist')
    .as('linksTab');

  expandAccordionTabByHeader('@linksTab', 'Shapes and Sizes');
  cy.get('@linksTab').find(linkLengthSlider).should('exist');
};

const closeTwoDSettingsDialog = (): void => {
  cy.get('@twoDSettings')
    .find('button.p-dialog-close-button')
    .click({ force: true });

  cy.contains('.p-dialog-title', '2D Network Settings').should('not.exist');
};

const setLinkLength = (targetLength: number, expectedLength = targetLength): void => {
  openLinksShapesPanel();
  cy.get('#link-length').invoke('val', targetLength).trigger('change', { force: true });
  cy.window()
    .its('commonService.session.style.widgets.link-length')
    .then((value) => expect(Number(value)).to.equal(expectedLength));
  closeTwoDSettingsDialog();
};

describe('Journey Flow - Link Length, Pinning, and Recalculate Layout', () => {
  const profile = getProfile('nn-angulartesting-tn93-edgelist');

  it('recalculates layout when unpinned and keeps pinned state from link-length/layout changes', () => {
    launchProfileToTwoD(profile);
    waitForProcessingDialogToClear();

    readNodeSnapshots(4)
      .then((baselinePositions) => {
        setLinkLength(120);
        cy.wait(600);
        return readNodeSnapshots(4).then((afterLengthChange) => {
          assertNodeMovement(baselinePositions, afterLengthChange, 'moved');
          return afterLengthChange;
        });
      })
      .then((afterLengthChange) => {
        cy.get(recalculateButton).should('not.have.class', 'disabled');
        cy.get(recalculateButton).click({ force: true });
        cy.wait(600);
        return readNodeSnapshots(4).then((afterRecalculate) => {
          assertNodeMovement(afterLengthChange, afterRecalculate, 'moved');
          return afterRecalculate;
        });
      })
      .then((afterRecalculate) => {
        cy.get(pinAllButton).click({ force: true });
        cy.window().its('commonService.session.network.allPinned').should('equal', true);
        cy.get(recalculateButton).should('have.class', 'disabled');
        openLinksShapesPanel();
        cy.get(linkLengthSlider).should('be.disabled');
        closeTwoDSettingsDialog();

        return readNodeSnapshots(4).then((pinnedBeforeAction) => {
          setLinkLength(80, 120);
          cy.wait(600);
          cy.window().its('commonService.session.style.widgets.link-length').should('equal', 120);
          return readNodeSnapshots(4).then((pinnedAfterLengthAttempt) => {
            assertNodeMovement(pinnedBeforeAction, pinnedAfterLengthAttempt, 'still');
            return pinnedAfterLengthAttempt;
          });
        });
      })
      .then((pinnedAfterLengthAttempt) => {
        cy.get(recalculateButton).click({ force: true });
        return readNodeSnapshots(4).then((pinnedAfterRecalculate) => {
          assertNodeMovement(pinnedAfterLengthAttempt, pinnedAfterRecalculate, 'still');
          return pinnedAfterRecalculate;
        });
      })
      .then((pinnedAfterRecalculate) => {
        cy.get(pinAllButton).click({ force: true });
        cy.window().its('commonService.session.network.allPinned').should('equal', false);
        cy.get(recalculateButton).should('not.have.class', 'disabled');

        setLinkLength(95);
        cy.wait(600);
        return readNodeSnapshots(4).then((afterUnpin) => {
          assertNodeMovement(pinnedAfterRecalculate, afterUnpin, 'moved');
        });
      });
  });
});
