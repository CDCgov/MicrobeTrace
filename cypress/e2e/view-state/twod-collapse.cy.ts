/// <reference types="cypress" />

import { ensureTwoDNetworkView, visitAppAndAcceptEula } from '../../support/journey-helpers';
import { byTestId, testIds } from '../../support/selectors';

const selectors = {
  canvas: '#cy',
  settingsBtn: byTestId(testIds.twodSettingsButton),
  collapseToggle: '#network-node-collapse-enabled',
  collapseThreshold: '#network-node-collapse-threshold',
  collapseThresholdInput: '#network-node-collapse-threshold-input',
};

const collapseGroupField = '__twodCollapseGroup';

function linkEndpointId(endpoint: any): string {
  if (endpoint === undefined || endpoint === null) return '';
  if (typeof endpoint === 'object') return String(endpoint._id ?? endpoint.id ?? endpoint.data?.id ?? '');
  return String(endpoint);
}

function metricValue(link: any, metric: string): number | null {
  const value = Number(link?.[metric]);
  return Number.isFinite(value) ? value : null;
}

function distanceLinksForMetric(win: any, metric: string): any[] {
  return (win.commonService.session.data.links || [])
    .filter((link: any) => {
      const value = metricValue(link, metric);
      const source = linkEndpointId(link.source);
      const target = linkEndpointId(link.target);
      return Boolean(source && target && source !== target && link.hasDistance === true && value !== null);
    })
    .sort((a: any, b: any) => Number(a[metric]) - Number(b[metric]));
}

function configureDeterministicCollapsePie(win: any): number {
  const commonService = win.commonService;
  const twoD = commonService.visuals.twoD;
  const widgets = commonService.session.style.widgets;
  const metric = String(widgets['link-sort-variable'] || widgets['default-distance-metric'] || 'distance');
  const distanceLinks = distanceLinksForMetric(win, metric);

  expect(distanceLinks.length, 'sample dataset distance links').to.be.greaterThan(0);

  const seedLink = distanceLinks[0];
  const threshold = metricValue(seedLink, metric);
  expect(threshold, 'collapse threshold').to.be.a('number');

  const firstId = linkEndpointId(seedLink.source);
  const secondId = linkEndpointId(seedLink.target);
  const targetIds = new Set([firstId, secondId]);

  commonService.session.data.nodes.forEach((node: any) => {
    const id = String(node._id ?? node.id ?? '');
    node[collapseGroupField] = targetIds.has(id) ? `Pair ${id === firstId ? 'A' : 'B'}` : 'Outside Pair';
  });
  commonService.session.data.nodeFilteredValues.forEach((node: any) => {
    const id = String(node._id ?? node.id ?? '');
    node[collapseGroupField] = targetIds.has(id) ? `Pair ${id === firstId ? 'A' : 'B'}` : 'Outside Pair';
  });

  if (!commonService.session.data.nodeFields.includes(collapseGroupField)) {
    commonService.session.data.nodeFields.push(collapseGroupField);
  }

  widgets['node-color-variable'] = collapseGroupField;
  commonService.createNodeColorMap();
  twoD.updateNodeColors();

  return threshold as number;
}

function getCollapseRenderSummary(win: any) {
  const cyInstance = win.commonService.visuals.twoD.cy;
  const aggregateNodes = cyInstance.nodes(':visible')
    .filter((node: any) => node.data('isCollapsedAggregate') === true);
  const pieNodes = aggregateNodes
    .map((node: any) => {
      const counts = node.data('counts') || [];
      const pieBackgroundImage = String(node.data('pieBackgroundImage') || '');
      const collapsedMemberIds = node.data('collapsedMemberIds') || [];

      return {
        id: node.id(),
        totalCount: Number(node.data('totalCount') || 0),
        collapsedMemberCount: collapsedMemberIds.length,
        labels: counts.map((count: any) => String(count.label)),
        pieBackgroundImage,
        renderedBackgroundImage: String(node.style('background-image') || ''),
      };
    })
    .filter((node: any) => node.labels.length > 1 && node.pieBackgroundImage.startsWith('data:image/svg+xml;base64,'));
  const selfEdgeIds = cyInstance.edges(':visible')
    .filter((edge: any) => edge.source().id() === edge.target().id())
    .map((edge: any) => edge.id());

  return {
    aggregateCount: aggregateNodes.length,
    pieNodes,
    selfEdgeIds,
  };
}

describe('2D Network - Collapse Related Nodes', () => {
  beforeEach(() => {
    visitAppAndAcceptEula({ skipDemoSession: false });
    ensureTwoDNetworkView();
    cy.get(selectors.canvas, { timeout: 15000 }).should('be.visible');
  });

  it('collapses threshold-connected nodes into aggregate pie nodes and restores individual nodes', () => {
    cy.get(selectors.settingsBtn).click();

    cy.contains('.p-dialog-title', '2D Network Settings')
      .should('be.visible')
      .parents('.p-dialog')
      .as('dialogContainer');

    cy.get('@dialogContainer').contains('.nav-link', 'Nodes').click();
    cy.get('@dialogContainer').contains('p-accordion-panel', 'Collapse Related Nodes').click();
    cy.get('@dialogContainer').find(selectors.collapseToggle).should('exist');
    cy.get('@dialogContainer').find(selectors.collapseThreshold).should('exist');
    cy.get('@dialogContainer').find(selectors.collapseThresholdInput).should('exist');
    cy.closeSettingsPane('2D Network Settings');

    cy.window().then((win: any) => {
      const commonService = win.commonService;
      const twoD = commonService.visuals.twoD;
      const threshold = configureDeterministicCollapsePie(win);
      const metric = String(commonService.session.style.widgets['link-sort-variable'] || commonService.session.style.widgets['default-distance-metric'] || 'distance');
      const displayedThreshold = commonService.toDisplayedDistanceValue(threshold, metric);

      twoD.SelectedNodeCollapseThresholdDisplayedVariable = displayedThreshold;
      twoD.onNodeCollapseThresholdDisplayedChange(displayedThreshold);
      twoD.onNodeCollapseEnabledChange(true);

      expect(commonService.session.style.widgets['network-node-collapse-enabled']).to.equal(true);
      expect(commonService.session.style.widgets['network-node-collapse-threshold']).to.equal(threshold);
    });

    cy.window().then((win: any) => {
      cy.wrap(null, { timeout: 20000 }).should(() => {
        const summary = getCollapseRenderSummary(win);
        const pieNode = summary.pieNodes[0];

        expect(summary.aggregateCount, 'visible aggregate nodes').to.be.greaterThan(0);
        expect(summary.pieNodes.length, 'aggregate nodes with pie backgrounds').to.be.greaterThan(0);
        expect(pieNode.collapsedMemberCount, 'collapsed member ids').to.be.greaterThan(1);
        expect(pieNode.totalCount, 'total count').to.equal(pieNode.collapsedMemberCount);
        expect(pieNode.labels, 'pie labels')
          .to.include.members(['Pair A', 'Pair B']);
        expect(pieNode.renderedBackgroundImage, 'rendered pie background').to.include('data:image');
        expect(summary.selfEdgeIds, 'self edges').to.deep.equal([]);
      });
    });

    cy.window().then((win: any) => {
      win.commonService.visuals.twoD.onNodeCollapseEnabledChange(false);
      expect(win.commonService.session.style.widgets['network-node-collapse-enabled']).to.equal(false);
    });

    cy.window().then((win: any) => {
      cy.wrap(null, { timeout: 20000 }).should(() => {
        expect(getCollapseRenderSummary(win).aggregateCount, 'visible aggregate nodes after disable').to.equal(0);
      });
    });
  });
});
