/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  launchProfileToWaterfall,
} from '../../../support/journey-helpers';
import { byTestId, testIds } from '../../../support/selectors';

type WaterfallWindow = Window & {
  commonService: any;
};

type ExpansionRow = {
  key: string;
  value: string;
};

type ClusterDetailCase = {
  clusterId: string;
  expectedRows: ExpansionRow[];
};

type WaterfallStyleCase = {
  clusterAId: string;
  clusterBId: string;
  clusterBNodeCount: number;
  nodeAId: string;
  nodeARows: ExpansionRow[];
  nodeBId: string;
  nodeBLinkCount: number;
  linkAPeerId: string;
  linkARows: ExpansionRow[];
};

const META_DATA_TO_SKIP = [
  'index',
  'id',
  'visible',
  'degree',
  'seq',
  'cluster',
  'directed',
  'source',
  'target',
  'x',
  'y',
  'vx',
  'vy',
  'nodeSize',
] as const;

const PREFERRED_CLUSTER_ROWS = ['Links Per Node', 'Mean Genetic Distance'];
const PREFERRED_NODE_ROWS = ['Profession', 'Node Type', 'State', 'Lineage'];
const PREFERRED_LINK_ROWS = ['Contact Type', 'Exposure', 'Case Status Confirmed?'];

function getNodeId(node: any): string {
  return String(node?._id ?? node?.id ?? '');
}

function buildExpansionRows(commonService: any, source: Record<string, any>): ExpansionRow[] {
  return Object.keys(source)
    .filter((key) => !(
      META_DATA_TO_SKIP.includes(key as (typeof META_DATA_TO_SKIP)[number]) ||
      key.charAt(0) === '_' ||
      typeof source[key] === 'object'
    ))
    .map((key) => {
      const rawValue = key === 'mean_genetic_distance' || key === 'links_per_node'
        ? Number(source[key]).toFixed(3)
        : String(source[key]);

      return {
        key: String(commonService.titleize(key)),
        value: rawValue,
      };
    });
}

function normalizeExpansionRows(rows: any[]): ExpansionRow[] {
  return rows.map((row) => ({
    key: String(row?.key ?? ''),
    value: String(row?.value ?? ''),
  }));
}

function pickPreferredRows(rows: ExpansionRow[], preferredKeys: string[], minimumCount = 2): ExpansionRow[] {
  const preferred = preferredKeys
    .map((key) => rows.find((row) => row.key === key && row.value !== ''))
    .filter(Boolean) as ExpansionRow[];

  if (preferred.length >= minimumCount) {
    return preferred.slice(0, minimumCount);
  }

  const fallback = rows.filter((row) => row.value !== '');
  return fallback.slice(0, Math.min(fallback.length, minimumCount));
}

function buildClusterDetailCase(win: WaterfallWindow): ClusterDetailCase {
  const commonService = win.commonService;
  const clusters = commonService.session.data.clusters || [];

  const cluster = clusters.find((candidate: any) => {
    const rows = buildExpansionRows(commonService, candidate);
    return PREFERRED_CLUSTER_ROWS.every((key) => rows.some((row) => row.key === key));
  }) || clusters.find((candidate: any) => buildExpansionRows(commonService, candidate).length > 0);

  expect(cluster, 'cluster with expansion details').to.exist;

  const allRows = buildExpansionRows(commonService, cluster);
  const expectedRows = pickPreferredRows(allRows, PREFERRED_CLUSTER_ROWS);

  expect(expectedRows.length, 'cluster expansion rows').to.be.greaterThan(0);

  return {
    clusterId: String(cluster.id),
    expectedRows,
  };
}

function buildWaterfallStyleCase(win: WaterfallWindow): WaterfallStyleCase {
  const commonService = win.commonService;
  const visibleNodes = commonService.getVisibleNodes();
  const visibleLinks = (commonService.session.data.links || []).filter((link: any) => link.visible);
  const multiNodeClusters = (commonService.session.data.clusters || []).filter((cluster: any) => Number(cluster.nodes) > 1);

  const clusterA = multiNodeClusters.find((candidate: any) => {
    const memberIds = visibleNodes
      .filter((node: any) => String(node.cluster) === String(candidate.id))
      .map((node: any) => getNodeId(node));

    const linkedMemberIds = memberIds.filter((nodeId: string) => (
      visibleLinks.some((link: any) => link.source === nodeId || link.target === nodeId)
    ));

    return linkedMemberIds.length >= 2;
  });

  expect(clusterA, 'primary multi-node cluster').to.exist;

  const clusterB = multiNodeClusters.find((candidate: any) => String(candidate.id) !== String(clusterA.id));
  expect(clusterB, 'secondary multi-node cluster').to.exist;

  const clusterAMembers = visibleNodes.filter((node: any) => String(node.cluster) === String(clusterA.id));
  const linkedClusterAMembers = clusterAMembers.filter((node: any) => (
    visibleLinks.some((link: any) => link.source === getNodeId(node) || link.target === getNodeId(node))
  ));

  const nodeA = linkedClusterAMembers.find((candidate: any) => (
    pickPreferredRows(buildExpansionRows(commonService, candidate), PREFERRED_NODE_ROWS).length >= 2
  )) || linkedClusterAMembers[0];
  const nodeB = linkedClusterAMembers.find((candidate: any) => getNodeId(candidate) !== getNodeId(nodeA));

  expect(nodeA, 'primary node in cluster A').to.exist;
  expect(nodeB, 'secondary node in cluster A').to.exist;

  const nodeALinks = visibleLinks.filter((link: any) => (
    link.source === getNodeId(nodeA) || link.target === getNodeId(nodeA)
  ));
  const nodeBLinks = visibleLinks.filter((link: any) => (
    link.source === getNodeId(nodeB) || link.target === getNodeId(nodeB)
  ));

  const linkA = nodeALinks.find((candidate: any) => (
    pickPreferredRows(buildExpansionRows(commonService, candidate), PREFERRED_LINK_ROWS).length >= 2
  )) || nodeALinks[0];
  expect(linkA, 'primary visible link for node A').to.exist;

  const nodeARows = pickPreferredRows(buildExpansionRows(commonService, nodeA), PREFERRED_NODE_ROWS);
  const linkARows = pickPreferredRows(buildExpansionRows(commonService, linkA), PREFERRED_LINK_ROWS);

  expect(nodeARows.length, 'node detail rows').to.be.greaterThan(0);
  expect(linkARows.length, 'link detail rows').to.be.greaterThan(0);

  const clusterBMembers = visibleNodes.filter((node: any) => String(node.cluster) === String(clusterB.id));

  return {
    clusterAId: String(clusterA.id),
    clusterBId: String(clusterB.id),
    clusterBNodeCount: clusterBMembers.length,
    nodeAId: getNodeId(nodeA),
    nodeARows,
    nodeBId: getNodeId(nodeB),
    nodeBLinkCount: nodeBLinks.length,
    linkAPeerId: String(linkA.source === getNodeId(nodeA) ? linkA.target : linkA.source),
    linkARows,
  };
}

function prepareClusterDetailCase(alias = 'clusterDetailCase'): void {
  cy.window().then((win: unknown) => {
    cy.wrap(buildClusterDetailCase(win as WaterfallWindow), { log: false }).as(alias);
  });
}

function prepareWaterfallStyleCase(alias = 'waterfallStyleCase'): void {
  cy.window().then((win: unknown) => {
    cy.wrap(buildWaterfallStyleCase(win as WaterfallWindow), { log: false }).as(alias);
  });
}

function selectCluster(clusterId: string): void {
  cy.contains('#waterfall-cluster-table-container tbody tr.ui-selectable-row', clusterId)
    .should('exist')
    .click();
}

function selectNode(nodeId: string): void {
  cy.contains('#waterfall-node-table-container tbody tr.ui-selectable-row', nodeId)
    .should('exist')
    .click();
}

function selectLink(peerId: string): void {
  cy.contains('#waterfall-link-table-container tbody tr.ui-selectable-row', peerId)
    .should('exist')
    .click();
}

function assertExpandedRows(
  statePath: string,
  expectedRows: ExpansionRow[],
): void {
  cy.window().its(statePath).should((rows: any[]) => {
    const normalizedRows = normalizeExpansionRows(rows);

    expectedRows.forEach((expectedRow) => {
      expect(normalizedRows, `expansion row ${expectedRow.key}`).to.deep.include(expectedRow);
    });
  });
}

function assertExpandedRowsVisible(
  expansionTestId: typeof testIds.waterfallClusterExpansion
    | typeof testIds.waterfallNodeExpansion
    | typeof testIds.waterfallLinkExpansion,
  expectedRows: ExpansionRow[],
): void {
  cy.get(byTestId(expansionTestId), { timeout: 10000 }).should('be.visible');

  expectedRows.forEach((expectedRow) => {
    cy.get(byTestId(expansionTestId))
      .should('contain.text', `${expectedRow.key}: ${expectedRow.value}`);
  });
}

describe('Journey Flow - Waterfall uploaded detail expansions and selection resets', () => {
  const clusterProfile = getProfile('nn-angulartesting-tn93-edgelist');
  const styleProfile = getProfile('style-apply-cypress-test-style');

  it('renders cluster expansion metadata with formatted summary values', () => {
    launchProfileToWaterfall(clusterProfile);
    assertAfterLaunchCounts(clusterProfile);
    prepareClusterDetailCase();

    cy.get<ClusterDetailCase>('@clusterDetailCase').then((waterfallCase) => {
      selectCluster(waterfallCase.clusterId);

      assertExpandedRows(
        'commonService.visuals.waterfall.expandedClusterRowData',
        waterfallCase.expectedRows,
      );
      assertExpandedRowsVisible(testIds.waterfallClusterExpansion, waterfallCase.expectedRows);

      waterfallCase.expectedRows
        .filter((row) => PREFERRED_CLUSTER_ROWS.includes(row.key))
        .forEach((row) => {
          expect(row.value, `${row.key} formatting`).to.match(/^-?\d+\.\d{3}$/);
        });
    });
  });

  it('renders uploaded node metadata in the node expansion row', () => {
    launchProfileToWaterfall(styleProfile);
    assertAfterLaunchCounts(styleProfile);
    prepareWaterfallStyleCase();

    cy.get<WaterfallStyleCase>('@waterfallStyleCase').then((waterfallCase) => {
      selectCluster(waterfallCase.clusterAId);
      selectNode(waterfallCase.nodeAId);

      assertExpandedRows(
        'commonService.visuals.waterfall.expandedNodeRowData',
        waterfallCase.nodeARows,
      );
      assertExpandedRowsVisible(testIds.waterfallNodeExpansion, waterfallCase.nodeARows);
    });
  });

  it('renders uploaded link metadata in the link expansion row', () => {
    launchProfileToWaterfall(styleProfile);
    assertAfterLaunchCounts(styleProfile);
    prepareWaterfallStyleCase();

    cy.get<WaterfallStyleCase>('@waterfallStyleCase').then((waterfallCase) => {
      selectCluster(waterfallCase.clusterAId);
      selectNode(waterfallCase.nodeAId);
      selectLink(waterfallCase.linkAPeerId);

      assertExpandedRows(
        'commonService.visuals.waterfall.expandedLinkRowData',
        waterfallCase.linkARows,
      );
      assertExpandedRowsVisible(testIds.waterfallLinkExpansion, waterfallCase.linkARows);
    });
  });

  it('clears stale node and link drilldown when a different cluster is selected', () => {
    launchProfileToWaterfall(styleProfile);
    assertAfterLaunchCounts(styleProfile);
    prepareWaterfallStyleCase();

    cy.get<WaterfallStyleCase>('@waterfallStyleCase').then((waterfallCase) => {
      selectCluster(waterfallCase.clusterAId);
      selectNode(waterfallCase.nodeAId);
      selectLink(waterfallCase.linkAPeerId);

      selectCluster(waterfallCase.clusterBId);

      cy.window().then((win: any) => {
        const waterfall = win.commonService.visuals.waterfall;
        expect(waterfall.selectedNodeRow).to.equal(null);
        expect(waterfall.selectedLinkRow).to.equal(null);
        expect(waterfall.expandedNodeRowData).to.deep.equal([]);
        expect(waterfall.expandedLinkRowData).to.deep.equal([]);
      });

      cy.get('#waterfall-node-table-container tbody tr.ui-selectable-row')
        .should('have.length', waterfallCase.clusterBNodeCount);
      cy.get('#waterfall-link-table-container tbody tr.ui-selectable-row').should('have.length', 0);

      cy.contains('#waterfall-node-table-container tbody tr.ui-selectable-row', waterfallCase.nodeAId)
        .should('not.exist');
    });
  });

  it('clears stale link selection when a different node is selected', () => {
    launchProfileToWaterfall(styleProfile);
    assertAfterLaunchCounts(styleProfile);
    prepareWaterfallStyleCase();

    cy.get<WaterfallStyleCase>('@waterfallStyleCase').then((waterfallCase) => {
      selectCluster(waterfallCase.clusterAId);
      selectNode(waterfallCase.nodeAId);
      selectLink(waterfallCase.linkAPeerId);

      selectNode(waterfallCase.nodeBId);

      cy.window().then((win: any) => {
        const waterfall = win.commonService.visuals.waterfall;
        expect(String(waterfall.selectedNodeRow?.id ?? '')).to.equal(waterfallCase.nodeBId);
        expect(waterfall.selectedLinkRow).to.equal(null);
        expect(waterfall.expandedLinkRowData).to.deep.equal([]);
      });

      cy.get('#waterfall-link-table-container tbody tr.ui-selectable-row')
        .should('have.length', waterfallCase.nodeBLinkCount);
    });
  });
});
