/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  assertMetricCount,
  computeOracleForProfile,
  getOracleSnapshot,
  launchProfileToWaterfall,
  openGlobalFilteringTab,
  setGlobalLinkThreshold,
  setTimelineDate,
  setTimelineField,
  waitForProcessingDialogToClear,
} from '../../../support/journey-helpers';
import type { OracleSnapshot, OracleStep } from '../../../oracle/types';
import { byTestId, testIds } from '../../../support/selectors';

type WaterfallWindow = Window & {
  commonService: any;
};

type WaterfallClusterRow = {
  id: string;
  nodeCount: number;
};

type WaterfallNodeRow = {
  id: string;
  degree: number;
};

type WaterfallLinkRow = {
  id: string;
  distance: string;
};

type WaterfallDrilldownCase = {
  clusterId: string;
  nodeId: string;
  linkPeerId: string;
  linkIndex: number;
};

type VisibleGraphCluster = {
  id: string;
  nodeCount: number;
  memberIds: string[];
};

class UnionFind {
  private readonly parent: number[];
  private readonly sizes: number[];

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, index) => index);
    this.sizes = Array.from({ length: size }, () => 1);
  }

  find(index: number): number {
    let root = index;
    while (this.parent[root] !== root) {
      root = this.parent[root];
    }

    let current = index;
    while (this.parent[current] !== current) {
      const next = this.parent[current];
      this.parent[current] = root;
      current = next;
    }

    return root;
  }

  union(a: number, b: number): void {
    let rootA = this.find(a);
    let rootB = this.find(b);

    if (rootA === rootB) {
      return;
    }

    if (this.sizes[rootA] < this.sizes[rootB]) {
      [rootA, rootB] = [rootB, rootA];
    }

    this.parent[rootB] = rootA;
    this.sizes[rootA] += this.sizes[rootB];
  }
}

function getNodeId(node: any): string {
  return String(node?._id ?? node?.id ?? '');
}

function normalizeClusterRows(rows: Array<{ id: string; nodeCount: number }>): WaterfallClusterRow[] {
  return rows
    .map((row) => ({
      id: String(row.id),
      nodeCount: Number(row.nodeCount),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function normalizeNodeRows(rows: Array<{ id: string; degree: number }>): WaterfallNodeRow[] {
  return rows
    .map((row) => ({
      id: String(row.id),
      degree: Number(row.degree),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function normalizeLinkRows(rows: Array<{ id: string; distance: string }>): WaterfallLinkRow[] {
  return rows
    .map((row) => ({
      id: String(row.id),
      distance: String(row.distance).trim(),
    }))
    .sort((a, b) => (
      a.id.localeCompare(b.id, undefined, { numeric: true }) ||
      a.distance.localeCompare(b.distance, undefined, { numeric: true })
    ));
}

function getVisibleWaterfallLinks(win: WaterfallWindow): any[] {
  const visibleNodeIds = new Set(win.commonService.getVisibleNodes().map((node: any) => getNodeId(node)));

  return (win.commonService.session.data.links || []).filter((link: any) => (
    link.visible &&
    visibleNodeIds.has(String(link.source)) &&
    visibleNodeIds.has(String(link.target))
  ));
}

function buildVisibleGraphClusters(win: WaterfallWindow): VisibleGraphCluster[] {
  const commonService = win.commonService;
  const visibleNodes = commonService.getVisibleNodes();
  const nodeIds = visibleNodes.map((node: any) => getNodeId(node));
  const nodeIndexById = Object.create(null) as Record<string, number>;
  const visibleLinks = getVisibleWaterfallLinks(win);
  const uf = new UnionFind(nodeIds.length);

  nodeIds.forEach((nodeId, index) => {
    nodeIndexById[nodeId] = index;
  });

  visibleLinks.forEach((link: any) => {
    const sourceIndex = nodeIndexById[String(link.source)];
    const targetIndex = nodeIndexById[String(link.target)];

    if (
      sourceIndex === undefined ||
      targetIndex === undefined ||
      sourceIndex === targetIndex
    ) {
      return;
    }

    uf.union(sourceIndex, targetIndex);
  });

  const rootToClusterId = new Map<number, number>();
  const clusters: VisibleGraphCluster[] = [];

  visibleNodes.forEach((node: any, index: number) => {
    const root = uf.find(index);
    let clusterId = rootToClusterId.get(root);

    if (clusterId === undefined) {
      clusterId = clusters.length;
      rootToClusterId.set(root, clusterId);
      clusters.push({
        id: String(clusterId),
        nodeCount: 0,
        memberIds: [],
      });
    }

    clusters[clusterId].nodeCount++;
    clusters[clusterId].memberIds.push(getNodeId(node));
  });

  return clusters.map((cluster) => ({
    ...cluster,
    memberIds: [...cluster.memberIds].sort(),
  }));
}

function buildVisibleClusterRows(win: WaterfallWindow): WaterfallClusterRow[] {
  return normalizeClusterRows(
    buildVisibleGraphClusters(win).map((cluster) => ({
      id: cluster.id,
      nodeCount: cluster.nodeCount,
    })),
  );
}

function readRenderedClusterRows(): Cypress.Chainable<WaterfallClusterRow[]> {
  return cy.get('#waterfall-cluster-table-container tbody tr.ui-selectable-row').then(($rows) => {
    const rows = Cypress.$.makeArray($rows).map((row) => {
      const cells = Cypress.$(row).find('td');
      return {
        id: String(cells.eq(0).text()).trim(),
        nodeCount: Number(String(cells.eq(1).text()).trim()),
      };
    });

    return normalizeClusterRows(rows);
  });
}

function readRenderedNodeRows(): Cypress.Chainable<WaterfallNodeRow[]> {
  return cy.get('#waterfall-node-table-container tbody tr.ui-selectable-row').then(($rows) => {
    const rows = Cypress.$.makeArray($rows).map((row) => {
      const cells = Cypress.$(row).find('td');
      return {
        id: String(cells.eq(0).text()).trim(),
        degree: Number(String(cells.eq(1).text()).trim()),
      };
    });

    return normalizeNodeRows(rows);
  });
}

function readRenderedLinkRows(): Cypress.Chainable<WaterfallLinkRow[]> {
  return cy.get('#waterfall-link-table-container tbody tr.ui-selectable-row').then(($rows) => {
    const rows = Cypress.$.makeArray($rows).map((row) => {
      const cells = Cypress.$(row).find('td');
      return {
        id: String(cells.eq(0).text()).trim(),
        distance: String(cells.eq(1).text()).trim(),
      };
    });

    return normalizeLinkRows(rows);
  });
}

function assertWaterfallClusterRowsMatchVisibleGraph(): void {
  cy.window().then((win: unknown) => {
    const expectedRows = buildVisibleClusterRows(win as WaterfallWindow);

    cy.window()
      .its('commonService.visuals.waterfall.clusterTableData')
      .should((clusterTableData: any[]) => {
        expect(normalizeClusterRows(clusterTableData), 'Waterfall clusterTableData').to.deep.equal(expectedRows);
      });

    readRenderedClusterRows().should((renderedRows) => {
      expect(renderedRows, 'rendered Waterfall cluster rows').to.deep.equal(expectedRows);
    });
  });
}

function assertTimelineMetricsMatchOracleSnapshot(snapshot: OracleSnapshot): void {
  assertMetricCount('#numberOfNodes', snapshot.visibleNodes);
  assertMetricCount('#numberOfVisibleLinks', snapshot.visibleLinks);
  assertMetricCount('#numberOfDisjointComponents', snapshot.components);
  assertMetricCount('#numberOfSingletonNodes', snapshot.singletons);
}

function assertWaterfallClusterRowsStayEqual(expectedRows: WaterfallClusterRow[]): void {
  cy.window()
    .its('commonService.visuals.waterfall.clusterTableData')
    .should((clusterTableData: any[]) => {
      expect(normalizeClusterRows(clusterTableData), 'Waterfall clusterTableData').to.deep.equal(expectedRows);
    });

  readRenderedClusterRows().should((renderedRows) => {
    expect(renderedRows, 'rendered Waterfall cluster rows').to.deep.equal(expectedRows);
  });
}

function buildWaterfallDrilldownCase(win: WaterfallWindow): WaterfallDrilldownCase {
  const commonService = win.commonService;
  const visibleNodes = commonService.getVisibleNodes();
  const visibleLinks = getVisibleWaterfallLinks(win);
  const cluster = buildVisibleGraphClusters(win).find((candidate) => candidate.nodeCount > 1);

  expect(cluster, 'Waterfall drilldown cluster').to.exist;

  const clusterNodeIds = new Set(cluster.memberIds);
  const clusterNodes = visibleNodes.filter((node: any) => clusterNodeIds.has(getNodeId(node)));
  const node = clusterNodes.find((candidate: any) => (
    visibleLinks.some((link: any) => link.source === getNodeId(candidate) || link.target === getNodeId(candidate))
  ));

  expect(node, 'Waterfall drilldown node').to.exist;

  const nodeId = getNodeId(node);
  const link = visibleLinks.find((candidate: any) => candidate.source === nodeId || candidate.target === nodeId);

  expect(link, 'Waterfall drilldown link').to.exist;

  return {
    clusterId: String(cluster.id),
    nodeId,
    linkPeerId: String(link.source === nodeId ? link.target : link.source),
    linkIndex: Number(link.index),
  };
}

function prepareWaterfallDrilldownCase(alias = 'waterfallDrilldownCase'): void {
  cy.window().then((win: unknown) => {
    cy.wrap(buildWaterfallDrilldownCase(win as WaterfallWindow), { log: false }).as(alias);
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

describe('Journey Flow - Waterfall uploaded refresh and timeline behavior', () => {
  const timelineProfile = getProfile('timeline-covid-node-link');
  const thresholdProfile = getProfile('nn-angulartesting-tn93-edgelist');
  const minimumClusterProfile = getProfile('filtering-min-cluster-reveal-epi-linklist');

  it('keeps the Waterfall cluster summary isolated while deterministic uploaded timeline checkpoints change the visible graph', () => {
    const timeline = timelineProfile.expectations.timeline;
    expect(timeline, 'timeline expectation').to.exist;

    const oracleSteps: OracleStep[] = [
      {
        id: 'timeline-enabled',
        kind: 'set-timeline-field',
        field: timeline!.field,
      },
      ...timeline!.checkpoints.map((checkpoint) => ({
        id: checkpoint.id,
        kind: 'set-timeline-date' as const,
        date: checkpoint.date,
      })),
      {
        id: 'timeline-disabled',
        kind: 'set-timeline-field',
        field: 'None',
      },
    ];

    computeOracleForProfile(timelineProfile, oracleSteps);

    launchProfileToWaterfall(timelineProfile);
    assertAfterLaunchCounts(timelineProfile);

    readRenderedClusterRows().then((baselineRows) => {
      expect(baselineRows, 'baseline Waterfall cluster rows').to.have.length.greaterThan(0);
      cy.wrap(baselineRows, { log: false }).as('waterfallClusterBaselineRows');
    });

    const assertCheckpointLeavesWaterfallStable = (snapshotId?: string) => {
      getOracleSnapshot('oracleResult', snapshotId).then((snapshot) => {
        assertTimelineMetricsMatchOracleSnapshot(snapshot);

        cy.get<WaterfallClusterRow[]>('@waterfallClusterBaselineRows').then((baselineRows) => {
          assertWaterfallClusterRowsStayEqual(baselineRows);
        });
      });
    };

    getOracleSnapshot().then((snapshot) => {
      assertTimelineMetricsMatchOracleSnapshot(snapshot);
      assertWaterfallClusterRowsMatchVisibleGraph();
    });

    setTimelineField(timeline!.field);
    assertCheckpointLeavesWaterfallStable('timeline-enabled');

    setTimelineDate(timeline!.checkpoints[0].date);
    waitForProcessingDialogToClear();
    assertCheckpointLeavesWaterfallStable(timeline!.checkpoints[0].id);

    timeline!.checkpoints.slice(1).forEach((checkpoint) => {
      setTimelineDate(checkpoint.date);
      waitForProcessingDialogToClear();
      assertCheckpointLeavesWaterfallStable(checkpoint.id);
    });

    setTimelineField('None');
    getOracleSnapshot('oracleResult', 'timeline-disabled').then((snapshot) => {
      assertTimelineMetricsMatchOracleSnapshot(snapshot);
      cy.get<WaterfallClusterRow[]>('@waterfallClusterBaselineRows').then((baselineRows) => {
        assertWaterfallClusterRowsStayEqual(baselineRows);
      });
    });
  });

  it('preserves Waterfall drilldown data when timeline checkpoints remove the selected graph membership', () => {
    const timeline = timelineProfile.expectations.timeline;
    expect(timeline, 'timeline expectation').to.exist;

    const firstCheckpoint = timeline!.checkpoints[0];
    const firstCheckpointDate = new Date(firstCheckpoint.date).getTime();
    expect(Number.isNaN(firstCheckpointDate), 'valid first checkpoint date').to.equal(false);

    launchProfileToWaterfall(timelineProfile);
    assertAfterLaunchCounts(timelineProfile);

    cy.window().then((win: unknown) => {
      const typedWindow = win as WaterfallWindow;
      const visibleNodes = typedWindow.commonService.getVisibleNodes();
      const visibleLinks = getVisibleWaterfallLinks(typedWindow);
      const nodesById = new Map(visibleNodes.map((node: any) => [getNodeId(node), node]));
      const removedCluster = buildVisibleGraphClusters(typedWindow).find((cluster) => {
        return cluster.memberIds.length > 0 && cluster.memberIds.every((nodeId) => {
          const rawDate = nodesById.get(nodeId)?.[timeline!.field];
          if (rawDate == null || rawDate === '') return false;
          return new Date(String(rawDate)).getTime() > firstCheckpointDate;
        });
      });

      expect(removedCluster, 'cluster removed by first timeline checkpoint').to.exist;

      const clusterNodeIds = new Set(removedCluster.memberIds);
      const clusterNodes = visibleNodes.filter((node: any) => clusterNodeIds.has(getNodeId(node)));
      const node = clusterNodes.find((candidate: any) => (
        visibleLinks.some((link: any) => link.source === getNodeId(candidate) || link.target === getNodeId(candidate))
      ));

      expect(node, 'node in removed cluster').to.exist;

      const nodeId = getNodeId(node);
      const link = visibleLinks.find((candidate: any) => candidate.source === nodeId || candidate.target === nodeId);

      expect(link, 'link in removed cluster').to.exist;

      cy.wrap({
        clusterId: String(removedCluster.id),
        nodeId,
        linkPeerId: String(link.source === nodeId ? link.target : link.source),
        linkIndex: Number(link.index),
      }, { log: false }).as('timelineRemovedClusterCase');
    });

    cy.get<WaterfallDrilldownCase>('@timelineRemovedClusterCase').then((waterfallCase) => {
      selectCluster(waterfallCase.clusterId);
      selectNode(waterfallCase.nodeId);
      selectLink(waterfallCase.linkPeerId);
    });

    readRenderedNodeRows().then((baselineRows) => {
      expect(baselineRows, 'baseline Waterfall node rows').to.have.length.greaterThan(0);
      cy.wrap(baselineRows, { log: false }).as('waterfallNodeBaselineRows');
    });

    readRenderedLinkRows().then((baselineRows) => {
      expect(baselineRows, 'baseline Waterfall link rows').to.have.length.greaterThan(0);
      cy.wrap(baselineRows, { log: false }).as('waterfallLinkBaselineRows');
    });

    setTimelineField(timeline!.field);
    setTimelineDate(firstCheckpoint.date);
    waitForProcessingDialogToClear();

    assertMetricCount('#numberOfNodes', firstCheckpoint.after.nodes!);
    assertMetricCount('#numberOfVisibleLinks', firstCheckpoint.after.visibleLinks!);

    cy.get<WaterfallDrilldownCase>('@timelineRemovedClusterCase').then((waterfallCase) => {
      cy.window().should((win: any) => {
        const visibleNodeIds = win.commonService.getVisibleNodes().map((node: any) => getNodeId(node));
        expect(visibleNodeIds, 'timeline-visible node ids').not.to.include(waterfallCase.nodeId);
      });

      cy.window().then((win: any) => {
        const waterfall = win.commonService.visuals.waterfall;
        expect(String(waterfall.selectedClusterRow?.id), 'selected Waterfall cluster').to.equal(waterfallCase.clusterId);
        expect(String(waterfall.selectedNodeRow?.id), 'selected Waterfall node').to.equal(waterfallCase.nodeId);
        expect(Number(waterfall.selectedLinkRow?.index), 'selected Waterfall link').to.equal(waterfallCase.linkIndex);
      });

      cy.get<WaterfallNodeRow[]>('@waterfallNodeBaselineRows').then((baselineRows) => {
        readRenderedNodeRows().should((renderedRows) => {
          expect(renderedRows, 'rendered Waterfall node rows').to.deep.equal(baselineRows);
        });
      });

      cy.get<WaterfallLinkRow[]>('@waterfallLinkBaselineRows').then((baselineRows) => {
        readRenderedLinkRows().should((renderedRows) => {
          expect(renderedRows, 'rendered Waterfall link rows').to.deep.equal(baselineRows);
        });
      });
    });
  });

  it('recomputes Waterfall node and link tables when threshold changes only the visible links', () => {
    launchProfileToWaterfall(thresholdProfile);
    assertAfterLaunchCounts(thresholdProfile);

    cy.window().then((win: any) => {
      const commonService = win.commonService;
      const visibleNodes = commonService.getVisibleNodes();
      const visibleLinks = (commonService.session.data.links || []).filter((link: any) => link.visible);
      const nextThreshold = 0.0144;
      const nextVisibleLinkIds = new Set(
        visibleLinks
          .filter((link: any) => Number(link.distance) <= nextThreshold)
          .map((link: any) => String(link.id || [link.source, link.target].sort().join('-'))),
      );

      const selectedNode = visibleNodes.find((node: any) => {
        const nodeId = getNodeId(node);
        const currentLinks = visibleLinks.filter((link: any) => link.source === nodeId || link.target === nodeId);
        const nextLinks = currentLinks.filter((link: any) => nextVisibleLinkIds.has(String(link.id || [link.source, link.target].sort().join('-'))));
        return currentLinks.length > nextLinks.length && nextLinks.length > 0;
      });

      expect(selectedNode, 'node whose visible degree shrinks at threshold 0.0144').to.exist;

      const selectedNodeId = getNodeId(selectedNode);
      const clusterId = buildVisibleGraphClusters(win)
        .find((cluster) => cluster.memberIds.includes(selectedNodeId))
        ?.id;
      const nextDegree = visibleLinks.filter((link: any) => (
        (link.source === selectedNodeId || link.target === selectedNodeId) &&
        nextVisibleLinkIds.has(String(link.id || [link.source, link.target].sort().join('-')))
      )).length;

      expect(clusterId, 'Waterfall cluster containing the selected node').to.exist;

      cy.wrap({
        clusterId: String(clusterId),
        nodeId: selectedNodeId,
        nextDegree,
      }, { log: false }).as('thresholdRefreshCase');
    });

    cy.get<{ clusterId: string; nodeId: string; nextDegree: number }>('@thresholdRefreshCase').then((refreshCase) => {
      selectCluster(refreshCase.clusterId);
      selectNode(refreshCase.nodeId);

      openGlobalFilteringTab();
      setGlobalLinkThreshold(0.0144);
      cy.closeGlobalSettings();
      waitForProcessingDialogToClear();

      assertMetricCount('#numberOfNodes', 14);
      assertMetricCount('#numberOfVisibleLinks', 16);
      assertMetricCount('#numberOfDisjointComponents', 2);
      assertMetricCount('#numberOfSingletonNodes', 2);

      cy.contains('#waterfall-node-table-container tbody tr.ui-selectable-row', refreshCase.nodeId)
        .find('td')
        .eq(1)
        .should('contain', String(refreshCase.nextDegree));

      cy.get('#waterfall-link-table-container tbody tr.ui-selectable-row')
        .should('have.length', refreshCase.nextDegree);
    });
  });

  it('refreshes Waterfall cluster rows when Minimum Cluster Size changes and Reveal Everything restores them', () => {
    const minimumClusterSize = minimumClusterProfile.expectations.filtering?.minimumClusterSize;

    expect(minimumClusterSize, 'minimum cluster size expectation').to.exist;

    launchProfileToWaterfall(minimumClusterProfile);
    assertAfterLaunchCounts(minimumClusterProfile);
    assertWaterfallClusterRowsMatchVisibleGraph();

    openGlobalFilteringTab();
    cy.get(byTestId(testIds.filterMinimumClusterSize))
      .then(($input) => {
        const input = $input.get(0) as HTMLInputElement;
        input.focus();
        input.value = String(minimumClusterSize!.to);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.blur();
      });
    cy.closeGlobalSettings();
    waitForProcessingDialogToClear();

    cy.window().its('commonService.session.style.widgets.cluster-minimum-size').should('equal', minimumClusterSize!.to);
    assertMetricCount('#numberOfNodes', minimumClusterSize!.after.nodes!);
    assertMetricCount('#numberOfVisibleLinks', minimumClusterSize!.after.visibleLinks!);
    assertMetricCount('#numberOfDisjointComponents', minimumClusterSize!.after.clusters!);
    assertMetricCount('#numberOfSingletonNodes', minimumClusterSize!.after.singletons!);
    assertWaterfallClusterRowsMatchVisibleGraph();

    openGlobalFilteringTab();
    cy.get(byTestId(testIds.filterRevealEverything)).click({ force: true });
    cy.closeGlobalSettings();
    waitForProcessingDialogToClear();

    cy.window().its('commonService.session.style.widgets.cluster-minimum-size').should('equal', 1);
    assertMetricCount('#numberOfNodes', minimumClusterSize!.reveal!.expectedCounts.nodes!);
    assertMetricCount('#numberOfVisibleLinks', minimumClusterSize!.reveal!.expectedCounts.visibleLinks!);
    assertMetricCount('#numberOfDisjointComponents', minimumClusterSize!.reveal!.expectedCounts.clusters!);
    assertMetricCount('#numberOfSingletonNodes', minimumClusterSize!.reveal!.expectedCounts.singletons!);
    assertWaterfallClusterRowsMatchVisibleGraph();
  });
});
