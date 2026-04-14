/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  assertMetricCount,
  goToSankeyView,
  launchProfileToTwoD,
  openGlobalFilteringTab,
  setGlobalLinkThreshold,
  waitForProcessingDialogToClear,
} from '../../../support/journey-helpers';
import {
  addSankeyFields,
  aliasSankeySelection,
  assertRenderedSankey,
} from '../../../support/sankey-ui-helpers';

type ClusterState = {
  clusterIds: string[];
  nodeClusterById: Record<string, string>;
};

function readClusterState(win: any): ClusterState {
  const nodes = win.commonService.session.data.nodes as Array<Record<string, unknown>>;

  return {
    clusterIds: Array.from(new Set(nodes.map((node) => String(node.cluster)))).sort(),
    nodeClusterById: Object.fromEntries(
      nodes.map((node) => [String(node._id ?? node.id), String(node.cluster)]),
    ),
  };
}

describe('Journey Flow - Sankey cluster recompute after filtering', () => {
  const profile = getProfile('filtering-mixed-origin-nearest-neighbor');
  const thresholdFlow = profile.expectations.filtering?.mixedOriginNearestNeighbor?.thresholdFlow;
  const sankeyFields = ['cluster', 'subtype'];

  it('recomputes a cluster-based Sankey after threshold filtering changes cluster membership', () => {
    expect(thresholdFlow, 'mixed-origin threshold flow expectation').to.exist;

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    goToSankeyView();

    aliasSankeySelection('clusterSankeyBeforeThreshold', {
      explicitFields: sankeyFields,
    });
    addSankeyFields('@clusterSankeyBeforeThreshold');
    assertRenderedSankey('@clusterSankeyBeforeThreshold');
    cy.closeSettingsPane('Sankey Chart Settings');

    cy.window().then((win: any) => {
      cy.wrap(readClusterState(win), { log: false }).as('clusterStateBeforeThreshold');
    });

    openGlobalFilteringTab();
    setGlobalLinkThreshold(thresholdFlow!.toThreshold);
    cy.closeGlobalSettings();
    waitForProcessingDialogToClear();

    assertMetricCount('#numberOfVisibleLinks', thresholdFlow!.afterThreshold.visibleLinks!);

    aliasSankeySelection('clusterSankeyAfterThreshold', {
      explicitFields: sankeyFields,
    });
    assertRenderedSankey('@clusterSankeyAfterThreshold');

    cy.window().its('commonService.visuals.sankey.SankeyFieldNames').should('deep.equal', sankeyFields);

    cy.window().then((win: any) => {
      cy.wrap(readClusterState(win), { log: false }).as('clusterStateAfterThreshold');
    });

    cy.get('@clusterStateBeforeThreshold').then((beforeState) => {
      const before = beforeState as ClusterState;

      cy.get('@clusterStateAfterThreshold').then((afterState) => {
        const after = afterState as ClusterState;
        const changedNodeIds = Object.keys(after.nodeClusterById).filter(
          (nodeId) => after.nodeClusterById[nodeId] !== before.nodeClusterById[nodeId],
        );

        expect(changedNodeIds.length, 'node cluster assignments changed after threshold filtering')
          .to.be.greaterThan(0);
        expect(after.clusterIds, 'cluster ids after threshold').to.not.deep.equal(before.clusterIds);
      });
    });

    cy.get('@clusterSankeyBeforeThreshold').then((beforeSelection) => {
      const before = beforeSelection as any;

      cy.get('@clusterSankeyAfterThreshold').then((afterSelection) => {
        const after = afterSelection as any;

        expect(
          after.expected.nodeCount !== before.expected.nodeCount ||
          after.expected.positiveLinkCount !== before.expected.positiveLinkCount,
          'cluster Sankey expectation changed after threshold filtering',
        ).to.equal(true);
      });
    });
  });
});
