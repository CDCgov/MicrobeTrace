/// <reference types="cypress" />

import type { Core } from 'cytoscape';
import { getProfile } from '../datasets/profile';
import { assertAfterLaunchCounts, launchProfileToTwoD } from '../../../support/journey-helpers';

describe('Journey Flow - Uploaded node drag sync', () => {
  const profile = getProfile('nn-angulartesting-tn93-edgelist');

  it('updates both rendered position and backing model when a node is dragged', () => {
    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);

    cy.window().then((win: any) => {
      const cyInstance = win.cytoscapeInstance as Core;
      const draggableNode = cyInstance
        .nodes(':visible')
        .filter((node) => node.children().length === 0)
        .first();

      expect(draggableNode.empty(), 'visible draggable node exists').to.equal(false);
      cy.wrap(String(draggableNode.id()), { log: false }).as('dragNodeId');
    });

    cy.get('@dragNodeId').then((nodeId) => {
      const targetNodeId = String(nodeId);

      cy.window().then((win: any) => {
        const cyInstance = win.cytoscapeInstance as Core;
        const node = cyInstance.getElementById(targetNodeId);

        expect(node.empty(), `node ${targetNodeId} should exist in Cytoscape`).to.equal(false);
        expect(node.children().length, 'drag target should not be a compound parent').to.equal(0);
        expect(node.hasClass('parent'), 'drag target should not have parent class').to.equal(false);
        expect(node.hasClass('hidden'), 'drag target should not be hidden').to.equal(false);

        const initial = { ...node.position() };
        const after = win.Cypress.test.dragNodeDelta(targetNodeId, 90, 45);

        expect(after, 'drag helper returned a position').to.not.be.null;
        expect(after.x, 'rendered X').to.be.closeTo(initial.x + 90, 1);
        expect(after.y, 'rendered Y').to.be.closeTo(initial.y + 45, 1);

        const backingNode = win.commonService.session.data.nodes.find((n: any) => n._id === targetNodeId);
        expect(backingNode, `backing node ${targetNodeId}`).to.exist;
        expect(backingNode.x, 'model X').to.be.closeTo(after.x, 1);
        expect(backingNode.y, 'model Y').to.be.closeTo(after.y, 1);
      });
    });
  });
});
