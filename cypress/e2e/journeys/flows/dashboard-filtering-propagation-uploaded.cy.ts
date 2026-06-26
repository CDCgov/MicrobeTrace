/// <reference types="cypress" />

import { computeExpectedAggregateRows, readRenderedAggregateRows } from '../../../support/aggregate-helpers';
import {
  assertRenderedCrosstabMatches,
  buildExpectedCrosstabModel,
} from '../../../support/crosstab-helpers';
import { selectTableDataset } from '../../../support/table-helpers';
import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  assertMetricCount,
  launchProfileToTwoD,
  openGlobalFilteringTab,
  readMetricCount,
  waitForProcessingDialogToClear,
} from '../../../support/journey-helpers';
import {
  assertNoDashboardRuntimeBanner,
  assertOpenDashboardTabs,
  configureDashboardMapZipcode,
  focusDashboardTab,
  openDashboardViews,
} from '../../../support/dashboard-helpers';
import { byTestId, testIds } from '../../../support/selectors';

type DashboardWindow = Window & {
  commonService: any;
};

type DashboardCounts = {
  clusters: number;
  nodes: number;
  singletons: number;
  visibleLinks: number;
};

type WaterfallClusterRow = {
  id: string;
  nodeCount: number;
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

const DASHBOARD_TABS = ['2D Network', 'Map', 'Bubble', 'Table', 'Aggregate', 'Crosstab', 'Waterfall'];

const getBubbleDataNodes = (bubble: any) =>
  bubble.cy.nodes().filter((node: any) => !node.hasClass('X_axis') && !node.hasClass('Y_axis'));

const getNodeId = (node: any): string => String(node?._id ?? node?.id ?? '');

const normalizeClusterRows = (rows: WaterfallClusterRow[]): WaterfallClusterRow[] => {
  return rows
    .map((row) => ({
      id: String(row.id),
      nodeCount: Number(row.nodeCount),
    }))
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
};

const buildExpectedWaterfallClusterRows = (typedWindow: DashboardWindow): WaterfallClusterRow[] => {
  const visibleNodes = typedWindow.commonService.getVisibleNodesIgnoringTimeline();
  const visibleNodeIds = new Set(visibleNodes.map((node: any) => getNodeId(node)));
  const nodeIndexById = Object.create(null) as Record<string, number>;
  const visibleLinks = (typedWindow.commonService.getVisibleLinksIgnoringTimeline() || []).filter((link: any) => (
    visibleNodeIds.has(String(link?.source ?? '')) &&
    visibleNodeIds.has(String(link?.target ?? ''))
  ));
  const uf = new UnionFind(visibleNodes.length);

  visibleNodes.forEach((node: any, index: number) => {
    nodeIndexById[getNodeId(node)] = index;
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
  const rows: WaterfallClusterRow[] = [];

  visibleNodes.forEach((_: any, index: number) => {
    const root = uf.find(index);
    let clusterId = rootToClusterId.get(root);

    if (clusterId === undefined) {
      clusterId = rows.length;
      rootToClusterId.set(root, clusterId);
      rows.push({
        id: String(clusterId),
        nodeCount: 0,
      });
    }

    rows[clusterId].nodeCount++;
  });

  return normalizeClusterRows(rows);
};

const closeDialogIfPresent = (title: string): void => {
  cy.get('body').then(($body) => {
    const dialogTitle = $body
      .find('.p-dialog-title')
      .toArray()
      .find((candidate) => String(candidate.textContent || '').trim() === title);

    if (!dialogTitle) {
      return;
    }

    cy.contains('.p-dialog-title', title)
      .parents('.p-dialog')
      .find('button.p-dialog-close-button')
      .click({ force: true });

    cy.contains('.p-dialog-title', title).should('not.exist');
  });
};

const readWaterfallClusterRows = (): Cypress.Chainable<WaterfallClusterRow[]> => {
  return cy.get('#waterfall-cluster-table-container tbody tr.ui-selectable-row', { timeout: 15000 })
    .then(($rows) => Array.from($rows).map((row) => {
      const cells = row.querySelectorAll('td');
      return {
        id: String(cells.item(0)?.textContent || '').trim(),
        nodeCount: Number(String(cells.item(1)?.textContent || '').trim()),
      };
    }));
};

const assertBubbleAlignedToVisibleNodes = (): void => {
  focusDashboardTab('Bubble');
  cy.window().should((win: unknown) => {
    const typedWindow = win as DashboardWindow;
    const bubble = typedWindow.commonService.visuals.bubble;
    const visibleNodes = typedWindow.commonService.getVisibleNodes();
    const renderedNodes = getBubbleDataNodes(bubble);

    expect(renderedNodes.length, 'Bubble rendered nodes').to.equal(visibleNodes.length);
  });
};

const assertMapAlignedToVisibleLocationSubset = (): void => {
  focusDashboardTab('Map');
  cy.window().should((win: unknown) => {
    const typedWindow = win as DashboardWindow;
    const visibleNodes = typedWindow.commonService.getVisibleNodes();
    const renderableNodeIds = new Set(
      visibleNodes
        .filter((node: any) => Number.isFinite(Number(node?._jlat)) && Number.isFinite(Number(node?._jlon)))
        .map((node: any) => String(node?._id ?? node?.id ?? '')),
    );

    const renderedNodes = typedWindow.commonService.visuals.gisMap.layers.featureGroup.getLayers();
    const renderedLinks = typedWindow.commonService.visuals.gisMap.layers.links.getLayers();
    const renderedLogicalLinks = new Set(
      renderedLinks
        .map((layer: any) => {
          const data = layer?.data;
          if (!data?.source || !data?.target) return null;
          const a = String(data.source);
          const b = String(data.target);
          return a < b ? `${a}-${b}` : `${b}-${a}`;
        })
        .filter(Boolean),
    );
    const expectedLinkCount = (typedWindow.commonService.session.data.links || []).filter((link: any) => (
      link.visible &&
      renderableNodeIds.has(String(link.source)) &&
      renderableNodeIds.has(String(link.target))
    )).length;

    expect(renderedNodes.length, 'Map rendered nodes').to.equal(renderableNodeIds.size);
    expect(renderedLogicalLinks.size, 'Map rendered logical links').to.equal(expectedLinkCount);
  });
};

const assertTableAlignedToVisibleNodes = (): void => {
  focusDashboardTab('Table');
  cy.window().should((win: unknown) => {
    const typedWindow = win as DashboardWindow;
    const visibleNodeCount = typedWindow.commonService.getVisibleNodes().length;
    const tableData = typedWindow.commonService.visuals.tableComp.SelectedTableData.data || [];

    expect(tableData.length, 'Table selected data length').to.equal(visibleNodeCount);
  });

  cy.get('.table-wrapper .p-datatable-tbody > tr', { timeout: 15000 })
    .should('have.length.greaterThan', 0);
};

const assertAggregateAlignedToVisibleData = (): void => {
  focusDashboardTab('Aggregate');
  cy.window().then((win: unknown) => {
    const typedWindow = win as DashboardWindow;
    const fields = typedWindow.commonService.visuals.aggregate.SelectedDataFields || [];

    expect(fields.length, 'Aggregate selected fields').to.be.greaterThan(0);

    fields.forEach((field: string, index: number) => {
      const expectedRows = computeExpectedAggregateRows(typedWindow as any, field);
      readRenderedAggregateRows(index).should((rows) => {
        expect(rows, `Aggregate rows for ${field}`).to.deep.equal(expectedRows);
      });
    });
  });
};

const assertCrosstabAlignedToVisibleData = (): void => {
  focusDashboardTab('Crosstab');
  cy.window().then((win: unknown) => {
    const typedWindow = win as DashboardWindow;
    const widgets = typedWindow.commonService.session.style.widgets;
    const expected = buildExpectedCrosstabModel(
      typedWindow as any,
      String(typedWindow.commonService.visuals.crossTab.xVariable || 'None'),
      String(typedWindow.commonService.visuals.crossTab.yVariable || 'None'),
      Boolean(widgets['crosstab-useProportion']),
    );

    assertRenderedCrosstabMatches(expected);
  });
};

const assertWaterfallAlignedToVisibleData = (): void => {
  focusDashboardTab('Waterfall');
  cy.get('#waterfall-cluster-table-container', { timeout: 15000 }).should('be.visible');

  cy.window().then((win: unknown) => {
    const typedWindow = win as DashboardWindow;
    const waterfall = typedWindow.commonService.visuals.waterfall;
    waterfall.onFilterDataChange?.();

    const expectedRows = buildExpectedWaterfallClusterRows(typedWindow);
    const renderedRows = normalizeClusterRows((waterfall.clusterTableData || []).map((row: any) => ({
      id: String(row.id),
      nodeCount: Number(row.nodeCount),
    })));
    const visibleNodesIgnoringTimeline = typedWindow.commonService.getVisibleNodesIgnoringTimeline();

    expect(renderedRows, 'Waterfall cluster rows').to.deep.equal(expectedRows);
    expect(
      renderedRows.reduce((sum: number, row: WaterfallClusterRow) => sum + Number(row.nodeCount || 0), 0),
      'Waterfall cluster node totals',
    ).to.equal(visibleNodesIgnoringTimeline.length);

    if (!expectedRows.length) {
      return;
    }

    const firstClusterRow = expectedRows[0];
    waterfall.selectedClusterRow = firstClusterRow;
    waterfall.onClusterRowSelect({ data: firstClusterRow });
    waterfall.cdref?.detectChanges?.();

    expect(
      (waterfall.nodeTableData || []).length,
      'Waterfall node drilldown row count for selected cluster',
    ).to.equal(Number(firstClusterRow.nodeCount));
  });
};

const assertDashboardFilteringPropagation = (): void => {
  assertOpenDashboardTabs(DASHBOARD_TABS);
  assertBubbleAlignedToVisibleNodes();
  assertMapAlignedToVisibleLocationSubset();
  assertTableAlignedToVisibleNodes();
  assertAggregateAlignedToVisibleData();
  assertCrosstabAlignedToVisibleData();
  assertWaterfallAlignedToVisibleData();
  assertNoDashboardRuntimeBanner();
};

const captureGlobalCounts = (alias: string): void => {
  readMetricCount('#numberOfNodes').then((nodes) => {
    readMetricCount('#numberOfVisibleLinks').then((visibleLinks) => {
      readMetricCount('#numberOfDisjointComponents').then((clusters) => {
        readMetricCount('#numberOfSingletonNodes').then((singletons) => {
          cy.wrap<DashboardCounts>({
            clusters,
            nodes,
            singletons,
            visibleLinks,
          }, { log: false }).as(alias);
        });
      });
    });
  });
};

const determineMinimumClusterSizeIncrease = (): Cypress.Chainable<number> => {
  return cy.window().then((win: unknown) => {
    const clusters = ((win as DashboardWindow).commonService.session.data.clusters || []) as any[];
    const sizes = clusters
      .filter((cluster) => cluster.visible && Number(cluster.nodes ?? cluster.nodeCount ?? 0) > 1)
      .map((cluster) => Number(cluster.nodes ?? cluster.nodeCount ?? 0))
      .sort((a, b) => a - b);

    expect(sizes.length, 'visible multi-node cluster sizes').to.be.greaterThan(0);
    return sizes[0] + 1;
  });
};

const setLinkThreshold = (value: number): void => {
  openGlobalFilteringTab();
  cy.get('#link-threshold')
    .then(($input) => {
      const input = $input.get(0) as HTMLInputElement;
      input.focus();
      input.value = String(value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.blur();
    });
  cy.closeGlobalSettings();
};

const setMinimumClusterSize = (value: number): void => {
  openGlobalFilteringTab();
  cy.get(byTestId(testIds.filterMinimumClusterSize))
    .then(($input) => {
      const input = $input.get(0) as HTMLInputElement;
      input.focus();
      input.value = String(value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.blur();
    });
  cy.closeGlobalSettings();
};

const prepareDashboard = (): void => {
  const profile = getProfile('map-covid-zipcode-threshold');

  launchProfileToTwoD(profile);
  assertAfterLaunchCounts(profile);
  openDashboardViews(['Map', 'Bubble', 'Table', 'Aggregate', 'Crosstab', 'Waterfall']);
  closeDialogIfPresent('Aggregate Settings');
  closeDialogIfPresent('Crosstab Settings');
  configureDashboardMapZipcode('Off');
  focusDashboardTab('Table');
  selectTableDataset('Node');
  waitForProcessingDialogToClear();
  assertOpenDashboardTabs(DASHBOARD_TABS);
  assertNoDashboardRuntimeBanner();
};

describe('Journey Flow - Dashboard filtering propagation', () => {
  it('keeps all open dashboard views synchronized through threshold, minimum-cluster-size, and reveal interactions', () => {
    prepareDashboard();
    assertDashboardFilteringPropagation();

    setLinkThreshold(24);
    waitForProcessingDialogToClear();

    cy.window().its('commonService.session.style.widgets.link-threshold').should('equal', 24);
    assertMetricCount('#numberOfNodes', 33);
    assertMetricCount('#numberOfVisibleLinks', 73);
    captureGlobalCounts('postThresholdCounts');
    assertDashboardFilteringPropagation();

    determineMinimumClusterSizeIncrease().then((minimumClusterSize) => {
      setMinimumClusterSize(minimumClusterSize);
      waitForProcessingDialogToClear();

      cy.window().its('commonService.session.style.widgets.cluster-minimum-size').should('equal', minimumClusterSize);
      cy.get<DashboardCounts>('@postThresholdCounts').then((thresholdCounts) => {
        readMetricCount('#numberOfNodes').should((nodeCount) => {
          expect(nodeCount, 'node count changes after minimum cluster size increase').to.be.lessThan(thresholdCounts.nodes);
        });
      });
      assertDashboardFilteringPropagation();
    });

    openGlobalFilteringTab();
    cy.get(byTestId(testIds.filterRevealEverything)).click({ force: true });
    cy.closeGlobalSettings();
    waitForProcessingDialogToClear();

    cy.window().its('commonService.session.style.widgets.cluster-minimum-size').should('equal', 1);
    cy.get<DashboardCounts>('@postThresholdCounts').then((thresholdCounts) => {
      assertMetricCount('#numberOfNodes', thresholdCounts.nodes);
      assertMetricCount('#numberOfVisibleLinks', thresholdCounts.visibleLinks);
      assertMetricCount('#numberOfDisjointComponents', thresholdCounts.clusters);
      assertMetricCount('#numberOfSingletonNodes', thresholdCounts.singletons);
    });
    assertDashboardFilteringPropagation();
  });
});
