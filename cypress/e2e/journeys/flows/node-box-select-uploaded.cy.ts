/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  launchProfileToTwoD,
} from '../../../support/journey-helpers';

type WinWithCy = Window & {
  cytoscapeInstance?: any;
  Cypress?: any;
  commonService?: any;
};

type SelectionBox = {
  expectedIds: string[];
  left: number;
  right: number;
  top: number;
  bottom: number;
};

const sortIds = (ids: string[]): string[] => [...ids].sort();

describe('Journey Flow - Uploaded node box select', () => {
  const profile = getProfile('nn-angulartesting-tn93-edgelist');

  it('selects multiple uploaded nodes inside a rendered selection box and syncs the app model', () => {
    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);

    cy.window().then((win: unknown) => {
      const typedWindow = win as WinWithCy;
      const cyInstance = typedWindow.cytoscapeInstance;
      const visibleLeafNodes = cyInstance
        .nodes(':visible')
        .filter((node: any) => !node.hasClass('parent') && node.children().length === 0);

      expect(visibleLeafNodes.length, 'visible uploaded nodes').to.be.greaterThan(1);

      let closestPair: [any, any] | null = null;
      let closestDistance = Number.POSITIVE_INFINITY;

      for (let index = 0; index < visibleLeafNodes.length; index += 1) {
        for (let innerIndex = index + 1; innerIndex < visibleLeafNodes.length; innerIndex += 1) {
          const firstNode = visibleLeafNodes[index];
          const secondNode = visibleLeafNodes[innerIndex];
          const firstPosition = firstNode.renderedPosition();
          const secondPosition = secondNode.renderedPosition();
          const distance = Math.hypot(firstPosition.x - secondPosition.x, firstPosition.y - secondPosition.y);

          if (distance < closestDistance) {
            closestDistance = distance;
            closestPair = [firstNode, secondNode];
          }
        }
      }

      expect(closestPair, 'closest visible node pair').to.not.equal(null);

      const [firstNode, secondNode] = closestPair as [any, any];
      const margin = 18;
      const left = Math.min(firstNode.renderedPosition('x'), secondNode.renderedPosition('x')) - margin;
      const right = Math.max(firstNode.renderedPosition('x'), secondNode.renderedPosition('x')) + margin;
      const top = Math.min(firstNode.renderedPosition('y'), secondNode.renderedPosition('y')) - margin;
      const bottom = Math.max(firstNode.renderedPosition('y'), secondNode.renderedPosition('y')) + margin;

      const expectedIds = sortIds(
        visibleLeafNodes
          .filter((node: any) => {
            const position = node.renderedPosition();
            return (
              position.x >= left &&
              position.x <= right &&
              position.y >= top &&
              position.y <= bottom
            );
          })
          .map((node: any) => String(node.id())),
      );

      expect(expectedIds.length, 'nodes inside rendered selection box').to.be.greaterThan(1);

      const selectedIds = sortIds(
        typedWindow.Cypress.test.selectNodesInRenderedBox(left, top, right, bottom) as string[],
      );

      expect(selectedIds, 'selected ids returned by box helper').to.deep.equal(expectedIds);

      cy.wrap<SelectionBox>({ expectedIds, left, right, top, bottom }).as('selectionBox');
    });

    cy.get<SelectionBox>('@selectionBox').then(({ expectedIds }) => {
      cy.window().should((win: unknown) => {
        const typedWindow = win as WinWithCy;
        const cyInstance = typedWindow.cytoscapeInstance;

        const selectedIds = sortIds(
          cyInstance
            .nodes(':selected')
            .map((node: any) => String(node.id())),
        );

        const selectedInModel = sortIds(
          typedWindow.commonService.session.data.nodes
            .filter((node: any) => node.selected)
            .map((node: any) => String(node._id || node.id)),
        );

        expect(selectedIds, 'cytoscape selected ids').to.deep.equal(expectedIds);
        expect(selectedInModel, 'app-model selected ids').to.deep.equal(expectedIds);
      });
    });
  });
});
