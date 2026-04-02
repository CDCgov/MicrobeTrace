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

const collectNodeSnapshots = (win: any, sampleSize?: number): NodeSnapshot[] => {
  const cyInstance = win.cytoscapeInstance;
  expect(cyInstance, 'cytoscapeInstance').to.exist;

  const nodes = cyInstance
    .nodes()
    .filter((node: any) => node.children().length === 0)
    .map((node: any) => ({
      id: node.id(),
      x: node.position('x'),
      y: node.position('y'),
    })) as NodeSnapshot[];

  return typeof sampleSize === 'number' ? nodes.slice(0, sampleSize) : nodes;
};

const readNodeSnapshots = (sampleSize?: number): Cypress.Chainable<NodeSnapshot[]> => {
  return cy.window().then((win: any) => collectNodeSnapshots(win, sampleSize));
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
      return distanceBetween(nodeBefore, nodeAfter as NodeSnapshot) > 0.05;
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

const waitForNodeMovementState = (
  before: NodeSnapshot[],
  expectation: 'moved' | 'still',
  sampleSize = before.length,
  timeout = 10000
): Cypress.Chainable<NodeSnapshot[]> => {
  return cy.window({ timeout })
    .should((win: any) => {
      expect(win.commonService.session.network.rendering, 'network rendering idle').to.equal(false);
      const after = collectNodeSnapshots(win, sampleSize);
      assertNodeMovement(before, after, expectation);
    })
    .then((win: any) => collectNodeSnapshots(win, sampleSize));
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

    readNodeSnapshots()
      .then((baselinePositions) => {
        setLinkLength(120);
        return waitForNodeMovementState(baselinePositions, 'moved');
      })
      .then((afterLengthChange) => {
        cy.get(recalculateButton).should('not.have.class', 'disabled');
        cy.get(recalculateButton).click({ force: true });
        return waitForNodeMovementState(afterLengthChange, 'moved');
      })
      .then((afterRecalculate) => {
        cy.get(pinAllButton).click({ force: true });
        cy.window().its('commonService.session.network.allPinned').should('equal', true);
        cy.get(recalculateButton).should('have.class', 'disabled');
        openLinksShapesPanel();
        cy.get(linkLengthSlider).should('be.disabled');
        closeTwoDSettingsDialog();

        return readNodeSnapshots().then((pinnedBeforeAction) => {
          setLinkLength(80, 120);
          cy.window().its('commonService.session.style.widgets.link-length').should('equal', 120);
          return waitForNodeMovementState(pinnedBeforeAction, 'still');
        });
      })
      .then((pinnedAfterLengthAttempt) => {
        cy.get(recalculateButton).click({ force: true });
        return waitForNodeMovementState(pinnedAfterLengthAttempt, 'still');
      })
      .then((pinnedAfterRecalculate) => {
        cy.get(pinAllButton).click({ force: true });
        cy.window().its('commonService.session.network.allPinned').should('equal', false);
        cy.get(recalculateButton).should('not.have.class', 'disabled');

        setLinkLength(95);
        return waitForNodeMovementState(pinnedAfterRecalculate, 'moved');
      });
  });
});
