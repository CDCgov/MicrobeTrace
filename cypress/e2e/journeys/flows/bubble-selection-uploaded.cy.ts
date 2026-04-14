/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  goToBubbleView,
  launchProfileToTwoD,
  openBubbleSettingsDialog,
} from '../../../support/journey-helpers';

type WinWithBubbleAndTwoD = Window & {
  commonService: any;
  cytoscapeInstance?: any;
};

describe('Journey Flow - Bubble uploaded selection sync', () => {
  const profile = getProfile('color-by-uploaded-categorical');
  const selectedNodeIds = ['797703', '797748'];
  const selectedNodeId = selectedNodeIds[0];
  const selectedBorderColor = /rgb\(255,\s*131,\s*0\)/;
  const unselectedBorderColor = /rgb\(0,\s*0,\s*0\)/;

  function findSessionNode(win: WinWithBubbleAndTwoD, nodeId: string) {
    return win.commonService.session.data.nodes
      .find((node: any) => String(node._id ?? node.id) === nodeId);
  }

  function getBubbleNode(win: WinWithBubbleAndTwoD, nodeId: string) {
    return win.commonService.visuals.bubble.cy.getElementById(nodeId);
  }

  function getTwoDNode(win: WinWithBubbleAndTwoD, nodeId: string) {
    return win.cytoscapeInstance?.getElementById(nodeId);
  }

  function countSelectedTwoDNodes(win: WinWithBubbleAndTwoD) {
    return win.cytoscapeInstance?.nodes(':selected').length ?? 0;
  }

  function expectBubbleSelectionState(
    win: WinWithBubbleAndTwoD,
    nodeId: string,
    expectedSelected: boolean,
  ) {
    const bubbleNode = getBubbleNode(win, nodeId);
    expect(bubbleNode.selected(), `Bubble selection for ${nodeId}`).to.equal(expectedSelected);
    expect(bubbleNode.style('border-color'), `Bubble border color for ${nodeId}`)
      .to.match(expectedSelected ? selectedBorderColor : unselectedBorderColor);
  }

  it('selects an uploaded Bubble node and syncs the selection back into session state and 2D', () => {
    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    goToBubbleView();

    cy.window().should((win: unknown) => {
      const typedWindow = win as WinWithBubbleAndTwoD;
      const sessionNode = findSessionNode(typedWindow, selectedNodeId);
      const bubbleNode = getBubbleNode(typedWindow, selectedNodeId);
      const twoDNode = getTwoDNode(typedWindow, selectedNodeId);

      expect(sessionNode?.selected, 'session node starts unselected').to.equal(false);
      expect(bubbleNode.selected(), 'Bubble node starts unselected').to.equal(false);
      expect(twoDNode?.selected(), '2D node starts unselected').to.equal(false);
    });

    cy.window().then((win: unknown) => {
      const bubbleNode = (win as WinWithBubbleAndTwoD).commonService.visuals.bubble.cy
        .getElementById(selectedNodeId);
      bubbleNode.emit('select');
    });

    cy.window().should((win: unknown) => {
      const typedWindow = win as WinWithBubbleAndTwoD;
      const sessionNode = findSessionNode(typedWindow, selectedNodeId);
      const bubbleNode = getBubbleNode(typedWindow, selectedNodeId);
      const twoDNode = getTwoDNode(typedWindow, selectedNodeId);

      expect(sessionNode?.selected, 'Bubble selection propagates to session').to.equal(true);
      expect(bubbleNode.selected(), 'Bubble node becomes selected').to.equal(true);
      expect(twoDNode?.selected(), '2D node receives the synced selection').to.equal(true);
      expect(bubbleNode.style('border-color'), 'Bubble selected border color')
        .to.match(selectedBorderColor);
      expect(twoDNode?.style('border-color'), '2D selected border color')
        .to.match(selectedBorderColor);
    });
  });

  it('unselects an uploaded Bubble node and clears the synced selection from session state and 2D', () => {
    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    goToBubbleView();

    cy.window().then((win: unknown) => {
      const bubbleNode = (win as WinWithBubbleAndTwoD).commonService.visuals.bubble.cy
        .getElementById(selectedNodeId);
      bubbleNode.select();
    });

    cy.window().should((win: unknown) => {
      const typedWindow = win as WinWithBubbleAndTwoD;
      const sessionNode = findSessionNode(typedWindow, selectedNodeId);
      const bubbleNode = getBubbleNode(typedWindow, selectedNodeId);
      const twoDNode = getTwoDNode(typedWindow, selectedNodeId);

      expect(sessionNode?.selected, 'selected session node before Bubble unselect').to.equal(true);
      expect(bubbleNode.selected(), 'Bubble node before unselect').to.equal(true);
      expect(twoDNode?.selected(), '2D node before Bubble unselect').to.equal(true);
    });

    cy.window().then((win: unknown) => {
      const bubbleNode = (win as WinWithBubbleAndTwoD).commonService.visuals.bubble.cy
        .getElementById(selectedNodeId);
      bubbleNode.unselect();
    });

    cy.window().should((win: unknown) => {
      const typedWindow = win as WinWithBubbleAndTwoD;
      const sessionNode = findSessionNode(typedWindow, selectedNodeId);
      const bubbleNode = getBubbleNode(typedWindow, selectedNodeId);
      const twoDNode = getTwoDNode(typedWindow, selectedNodeId);

      expect(sessionNode?.selected, 'Bubble unselect clears session state').to.equal(false);
      expect(bubbleNode.selected(), 'Bubble node becomes unselected').to.equal(false);
      expect(twoDNode?.selected(), '2D node clears the synced selection').to.equal(false);
      expect(bubbleNode.style('border-color'), 'Bubble unselected border color')
        .to.match(unselectedBorderColor);
      expect(twoDNode?.style('border-color'), '2D unselected border color')
        .to.match(unselectedBorderColor);
    });
  });

  it('responds to external session selection changes after node-selected events on uploaded data', () => {
    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    goToBubbleView();

    cy.window().then((win: unknown) => {
      const typedWindow = win as WinWithBubbleAndTwoD;
      typedWindow.commonService.session.data.nodes.forEach((node: any) => {
        node.selected = false;
      });
    });
    cy.document().trigger('node-selected');

    cy.window().should((win: unknown) => {
      const typedWindow = win as WinWithBubbleAndTwoD;
      selectedNodeIds.forEach((nodeId) => {
        expectBubbleSelectionState(typedWindow, nodeId, false);
      });
    });

    cy.window().then((win: unknown) => {
      const typedWindow = win as WinWithBubbleAndTwoD;
      const externallySelectedNode = findSessionNode(typedWindow, selectedNodeId);
      expect(externallySelectedNode, `session node ${selectedNodeId}`).to.exist;
      externallySelectedNode.selected = true;
    });
    cy.document().trigger('node-selected');

    cy.window().should((win: unknown) => {
      const typedWindow = win as WinWithBubbleAndTwoD;
      expect(findSessionNode(typedWindow, selectedNodeId)?.selected, 'externally selected session node')
        .to.equal(true);
      expectBubbleSelectionState(typedWindow, selectedNodeId, true);
      expectBubbleSelectionState(typedWindow, selectedNodeIds[1], false);
    });

    cy.window().then((win: unknown) => {
      const typedWindow = win as WinWithBubbleAndTwoD;
      selectedNodeIds.forEach((nodeId) => {
        const sessionNode = findSessionNode(typedWindow, nodeId);
        expect(sessionNode, `session node ${nodeId}`).to.exist;
        sessionNode.selected = true;
      });
    });
    cy.document().trigger('node-selected');

    cy.window().should((win: unknown) => {
      const typedWindow = win as WinWithBubbleAndTwoD;
      selectedNodeIds.forEach((nodeId) => {
        expect(findSessionNode(typedWindow, nodeId)?.selected, `session selected for ${nodeId}`)
          .to.equal(true);
        expectBubbleSelectionState(typedWindow, nodeId, true);
      });
    });

    cy.window().then((win: unknown) => {
      const typedWindow = win as WinWithBubbleAndTwoD;
      selectedNodeIds.forEach((nodeId) => {
        const sessionNode = findSessionNode(typedWindow, nodeId);
        expect(sessionNode, `session node ${nodeId}`).to.exist;
        sessionNode.selected = false;
      });
    });
    cy.document().trigger('node-selected');

    cy.window().should((win: unknown) => {
      const typedWindow = win as WinWithBubbleAndTwoD;
      selectedNodeIds.forEach((nodeId) => {
        expect(findSessionNode(typedWindow, nodeId)?.selected, `session unselected for ${nodeId}`)
          .to.equal(false);
        expectBubbleSelectionState(typedWindow, nodeId, false);
      });
    });
  });

  it('selects multiple uploaded Bubble nodes and syncs them into session state and 2D', () => {
    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    goToBubbleView();

    cy.window().should((win: unknown) => {
      const typedWindow = win as WinWithBubbleAndTwoD;
      selectedNodeIds.forEach((nodeId) => {
        const sessionNode = findSessionNode(typedWindow, nodeId);
        const bubbleNode = getBubbleNode(typedWindow, nodeId);
        const twoDNode = getTwoDNode(typedWindow, nodeId);

        expect(sessionNode?.selected, `session node ${nodeId} starts unselected`).to.equal(false);
        expect(bubbleNode.selected(), `Bubble node ${nodeId} starts unselected`).to.equal(false);
        expect(twoDNode?.selected(), `2D node ${nodeId} starts unselected`).to.equal(false);
      });
    });

    cy.window().then((win: unknown) => {
      const typedWindow = win as WinWithBubbleAndTwoD;
      selectedNodeIds.forEach((nodeId) => {
        getBubbleNode(typedWindow, nodeId).select();
      });
    });

    cy.window().should((win: unknown) => {
      const typedWindow = win as WinWithBubbleAndTwoD;
      const selectedSessionIds = typedWindow.commonService.getVisibleNodes()
        .filter((node: any) => node.selected)
        .map((node: any) => String(node._id ?? node.id));

      selectedNodeIds.forEach((nodeId) => {
        const sessionNode = findSessionNode(typedWindow, nodeId);
        const twoDNode = getTwoDNode(typedWindow, nodeId);

        expect(selectedSessionIds, `selected session ids include ${nodeId}`).to.include(nodeId);
        expect(sessionNode?.selected, `session node ${nodeId} becomes selected`).to.equal(true);
        expectBubbleSelectionState(typedWindow, nodeId, true);
        expect(twoDNode?.selected(), `2D node ${nodeId} receives multi-select sync`).to.equal(true);
        expect(twoDNode?.style('border-color'), `2D border color for ${nodeId}`)
          .to.match(selectedBorderColor);
      });
    });
  });

  it('does not propagate collapsed aggregate selection into session state or 2D', () => {
    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    goToBubbleView();

    openBubbleSettingsDialog();
    cy.get('@bubbleSettings').find('#bubble-node-collapsing').contains('On').click({ force: true });
    cy.window().its('commonService.visuals.bubble.SelectedNodeCollapsingTypeVariable').should('equal', true);
    cy.closeSettingsPane('Bubble Settings');

    cy.window().should((win: unknown) => {
      const typedWindow = win as WinWithBubbleAndTwoD;
      const bubble = typedWindow.commonService.visuals.bubble;
      const collapsedAggregate = bubble.visibleData.find((node: any) => Number(node.totalCount || 0) > 1);
      const selectedSessionNodes = typedWindow.commonService.getVisibleNodes().filter((node: any) => node.selected);

      expect(collapsedAggregate, 'collapsed Bubble aggregate with totalCount > 1').to.exist;
      expect(selectedSessionNodes.length, 'selected session nodes before collapsed select').to.equal(0);
      expect(countSelectedTwoDNodes(typedWindow), 'selected 2D nodes before collapsed select').to.equal(0);
    });

    cy.window().then((win: unknown) => {
      const typedWindow = win as WinWithBubbleAndTwoD;
      const bubble = typedWindow.commonService.visuals.bubble;
      const collapsedAggregate = bubble.visibleData.find((node: any) => Number(node.totalCount || 0) > 1);

      bubble.cy.getElementById(collapsedAggregate.id).select();
    });

    cy.window().should((win: unknown) => {
      const typedWindow = win as WinWithBubbleAndTwoD;
      const bubble = typedWindow.commonService.visuals.bubble;
      const collapsedAggregate = bubble.visibleData.find((node: any) => Number(node.totalCount || 0) > 1);
      const renderedAggregate = bubble.cy.getElementById(collapsedAggregate.id);
      const selectedSessionNodes = typedWindow.commonService.getVisibleNodes().filter((node: any) => node.selected);

      expect(renderedAggregate.empty(), `rendered collapsed Bubble aggregate ${collapsedAggregate.id}`).to.equal(false);
      expect(renderedAggregate.selected(), `collapsed Bubble aggregate ${collapsedAggregate.id} receives the local selection`).to.equal(true);
      expect(selectedSessionNodes.length, 'collapsed aggregate selection does not mark session nodes selected').to.equal(0);
      expect(countSelectedTwoDNodes(typedWindow), 'collapsed aggregate selection does not select 2D nodes').to.equal(0);
    });
  });
});
