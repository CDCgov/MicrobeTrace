/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  launchProfileToWaterfall,
} from '../../../support/journey-helpers';

type WaterfallWindow = Window & {
  commonService: any;
};

type DrilldownExpectation = {
  clusterId: string;
  clusterNodeCount: number;
  nodeRowCount: number;
  nodeId: string;
  nodeDegree: number;
  linkRowCount: number;
  linkIndex: number;
  linkPeerId: string;
  linkDistanceText: string;
};

function getNodeId(node: any): string {
  return String(node?._id ?? node?.id ?? '');
}

function buildDrilldownExpectation(win: WaterfallWindow): DrilldownExpectation {
  const commonService = win.commonService;
  const clusters = commonService.session.data.clusters || [];
  const visibleNodes = commonService.session.data.nodeFilteredValues || [];
  const visibleLinks = (commonService.session.data.links || []).filter((link: any) => link.visible);

  const cluster = clusters.find((candidate: any) => Number(candidate.nodes) > 1) || clusters[0];
  expect(cluster, 'waterfall drilldown cluster').to.exist;

  const clusterId = String(cluster.id);
  const clusterNodes = visibleNodes.filter((node: any) => String(node.cluster) === clusterId);
  const node = clusterNodes.find((candidate: any) => (
    visibleLinks.some((link: any) => link.source === getNodeId(candidate) || link.target === getNodeId(candidate))
  )) || clusterNodes[0];
  expect(node, 'waterfall drilldown node').to.exist;

  const nodeId = getNodeId(node);
  const nodeLinks = visibleLinks.filter((link: any) => link.source === nodeId || link.target === nodeId);
  const link = nodeLinks[0];
  expect(link, 'waterfall drilldown link').to.exist;

  return {
    clusterId,
    clusterNodeCount: Number(cluster.nodes),
    nodeRowCount: clusterNodes.length,
    nodeId,
    nodeDegree: nodeLinks.length,
    linkRowCount: nodeLinks.length,
    linkIndex: Number(link.index),
    linkPeerId: String(link.source === nodeId ? link.target : link.source),
    linkDistanceText: Number(link.distance).toLocaleString(),
  };
}

describe('Journey Flow - Waterfall uploaded drilldown', () => {
  const profile = getProfile('nn-angulartesting-tn93-edgelist');

  it('selects a cluster, then a node, then a visible link and keeps the three waterfall tables in sync', () => {
    launchProfileToWaterfall(profile);
    assertAfterLaunchCounts(profile);

    cy.window().then((win: unknown) => {
      cy.wrap(buildDrilldownExpectation(win as WaterfallWindow)).as('drilldownExpectation');
    });

    cy.get<DrilldownExpectation>('@drilldownExpectation').then((expected) => {
      cy.get('#waterfall-cluster-table-container tbody tr.ui-selectable-row')
        .should(($rows) => {
          expect($rows.length, 'waterfall cluster rows').to.be.greaterThan(0);
        });

      cy.contains('#waterfall-cluster-table-container tbody tr.ui-selectable-row', expected.clusterId)
        .as('clusterRow');

      cy.get('@clusterRow').find('td').eq(1).should('contain', String(expected.clusterNodeCount));
      cy.get('@clusterRow').click();

      cy.window().its('commonService.visuals.waterfall.selectedClusterRow').should((selected: any) => {
        expect(String(selected?.id), 'selected cluster id').to.equal(expected.clusterId);
      });

      cy.get('#waterfall-node-table-container tbody tr.ui-selectable-row', { timeout: 20000 })
        .should('have.length', expected.nodeRowCount);

      cy.contains('#waterfall-node-table-container tbody tr.ui-selectable-row', expected.nodeId)
        .as('nodeRow');

      cy.get('@nodeRow').find('td').eq(1).should('contain', String(expected.nodeDegree));
      cy.get('@nodeRow').click();

      cy.window().its('commonService.visuals.waterfall.selectedNodeRow').should((selected: any) => {
        expect(String(selected?.id), 'selected node id').to.equal(expected.nodeId);
      });

      cy.get('#waterfall-link-table-container tbody tr.ui-selectable-row', { timeout: 20000 })
        .should('have.length', expected.linkRowCount);

      cy.contains('#waterfall-link-table-container tbody tr.ui-selectable-row', expected.linkPeerId)
        .as('linkRow');

      cy.get('@linkRow').find('td').eq(1).should('contain', expected.linkDistanceText);
      cy.get('@linkRow').click();

      cy.window().its('commonService.visuals.waterfall.selectedLinkRow').should((selected: any) => {
        expect(Number(selected?.index), 'selected link index').to.equal(expected.linkIndex);
      });
    });
  });
});
