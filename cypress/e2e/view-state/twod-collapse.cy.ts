/// <reference types="cypress" />

import { ensureTwoDNetworkView, setGlobalDistanceMetric, setTN93DistanceDisplayFormat, visitAppAndAcceptEula } from '../../support/journey-helpers';
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
  const metric = 'distance';
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
        counts: counts.map((count: any) => ({
          label: String(count.label),
          count: Number(count.count || 0),
        })),
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
    cy.openGlobalSettings();
    cy.contains('#global-settings-modal .nav-link', 'Filtering').click({ force: true });
    setGlobalDistanceMetric('tn93');
    setTN93DistanceDisplayFormat('percentage');
    cy.closeGlobalSettings();
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
    cy.get('@dialogContainer').find('#network-node-collapse-threshold-readout').should('not.exist');

    cy.window().then((win: any) => {
      const commonService = win.commonService;
      const twoD = commonService.visuals.twoD;
      const threshold = configureDeterministicCollapsePie(win);
      const metric = 'distance';
      const displayedThreshold = commonService.toDisplayedDistanceValue(threshold, metric);

      twoD.SelectedNodeCollapseThresholdDisplayedVariable = displayedThreshold;
      twoD.onNodeCollapseThresholdDisplayedChange(displayedThreshold);
      twoD.onNodeCollapseEnabledChange(true);

      expect(commonService.session.style.widgets['network-node-collapse-enabled']).to.equal(true);
      expect(commonService.session.style.widgets['network-node-collapse-threshold']).to.equal(threshold);
      expect(twoD.SelectedNodeCollapseMetricLabel).to.equal('TN93');

      cy.get('@dialogContainer').find(selectors.collapseThresholdInput).should('have.value', String(displayedThreshold));
    });

    cy.closeSettingsPane('2D Network Settings');

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

  it('shows Bubble-style table content for collapsed aggregate node tooltips', () => {
    cy.window().then((win: any) => {
      const commonService = win.commonService;
      const twoD = commonService.visuals.twoD;
      const threshold = configureDeterministicCollapsePie(win);
      const displayedThreshold = commonService.toDisplayedDistanceValue(threshold, 'distance');

      twoD.SelectedNodeCollapseThresholdDisplayedVariable = displayedThreshold;
      twoD.onNodeCollapseThresholdDisplayedChange(displayedThreshold);
      twoD.onNodeCollapseEnabledChange(true);
    });

    cy.window().then((win: any) => {
      cy.wrap(null, { timeout: 20000 }).should(() => {
        expect(getCollapseRenderSummary(win).pieNodes.length, 'aggregate nodes with pie backgrounds').to.be.greaterThan(0);
      });
    });

    cy.window().then((win: any) => {
      const commonService = win.commonService;
      const summary = getCollapseRenderSummary(win);
      const pieNode = summary.pieNodes[0];
      const expectedHeaders = [
        commonService.capitalize(commonService.session.style.widgets['node-color-variable']),
        'Count',
        '%',
      ];
      const expectedRows = pieNode.counts.map((count: any) => [
        count.label,
        String(count.count),
        `${(count.count / pieNode.totalCount * 100).toFixed(1)}%`,
      ]);
      expectedRows.push(['Total', String(pieNode.totalCount), '']);

      win.Cypress.test.tooltip('show', pieNode.id);

      cy.get('#tooltip #tooltip-table', { timeout: 1000 }).should('be.visible').within(() => {
        cy.get('thead th').then(($headers) => {
          expect($headers.toArray().map((header) => header.textContent?.trim() || '')).to.deep.equal(expectedHeaders);
        });
        cy.get('tbody tr').should('have.length', expectedRows.length).each(($row, index) => {
          const cells = $row.find('td').toArray().map((cell) => cell.textContent?.trim() || '');
          expect(cells).to.deep.equal(expectedRows[index]);
        });
      });

      win.Cypress.test.tooltip('hide', pieNode.id);
    });
  });

  it('preserves collapsed pie images in SVG export content', () => {
    cy.window().then((win: any) => {
      const commonService = win.commonService;
      const twoD = commonService.visuals.twoD;
      const threshold = configureDeterministicCollapsePie(win);
      const displayedThreshold = commonService.toDisplayedDistanceValue(threshold, 'distance');

      twoD.SelectedNodeCollapseThresholdDisplayedVariable = displayedThreshold;
      twoD.onNodeCollapseThresholdDisplayedChange(displayedThreshold);
      twoD.onNodeCollapseEnabledChange(true);
    });

    cy.window().then((win: any) => {
      cy.wrap(null, { timeout: 20000 }).should(() => {
        expect(getCollapseRenderSummary(win).pieNodes.length, 'aggregate nodes with pie backgrounds').to.be.greaterThan(0);
      });
    });

    cy.window().then((win: any) => {
      const twoD = win.commonService.visuals.twoD;
      cy.stub(twoD.exportService, 'requestSVGExport').as('requestSVGExport');
      twoD.SelectedNetworkExportFileTypeListVariable = 'svg';
      twoD.exportVisualization(new win.Event('click'));
    });

    cy.get('@requestSVGExport').should('have.been.calledOnce');
    cy.get('@requestSVGExport').then((stub: any) => {
      const svgContent = String(stub.getCall(0).args[1] || '');
      const doc = new DOMParser().parseFromString(svgContent, 'image/svg+xml');
      const pieImages = Array.from(doc.getElementsByTagName('image'))
        .filter((image: any) => {
          const href = String(image.getAttribute('href') || image.getAttribute('xlink:href') || '');
          return href.startsWith('data:image/');
        });
      const pieOutlines = Array.from(doc.querySelectorAll('circle[data-microbetrace-collapsed-pie-outline="true"]'));

      expect(svgContent, 'svg export contains image elements').to.include('<image');
      expect(svgContent, 'svg export contains pie image data').to.include('data:image/');
      expect(pieImages.length, 'exported collapsed pie images').to.be.greaterThan(0);
      expect(pieOutlines.length, 'collapsed pie outlines').to.equal(pieImages.length);
      expect(svgContent, 'svg export does not contain vectorized collapsed pies')
        .not.to.include('data-microbetrace-collapsed-pie-export');
    });
  });

  it('updates collapse distance controls from global metric and format selections', () => {
    cy.get(selectors.settingsBtn).click();

    cy.contains('.p-dialog-title', '2D Network Settings')
      .should('be.visible')
      .parents('.p-dialog')
      .as('dialogContainer');

    cy.get('@dialogContainer').contains('.nav-link', 'Nodes').click();
    cy.get('@dialogContainer').contains('p-accordion-panel', 'Collapse Related Nodes').click();
    cy.get('@dialogContainer').find(selectors.collapseThresholdInput).should('have.value', '0');
    cy.get('@dialogContainer').find(selectors.collapseThreshold).should('have.attr', 'step', '0.1');
    cy.get('@dialogContainer').find('#network-node-collapse-threshold-readout').should('not.exist');
    cy.closeSettingsPane('2D Network Settings');

    cy.openGlobalSettings();
    cy.contains('#global-settings-modal .nav-link', 'Filtering').click({ force: true });
    setTN93DistanceDisplayFormat('decimal');
    cy.closeGlobalSettings();

    cy.get(selectors.settingsBtn).click();
    cy.contains('.p-dialog-title', '2D Network Settings')
      .should('be.visible')
      .parents('.p-dialog')
      .as('dialogContainer');

    cy.get('@dialogContainer').contains('.nav-link', 'Nodes').click();
    cy.get('@dialogContainer').contains('p-accordion-panel', 'Collapse Related Nodes').click();
    cy.get('@dialogContainer').find(selectors.collapseThresholdInput).should('have.value', '0');
    cy.get('@dialogContainer').find(selectors.collapseThreshold).should('have.attr', 'step', '0.001');
    cy.get('@dialogContainer').find('#network-node-collapse-threshold-readout').should('not.exist');
    cy.closeSettingsPane('2D Network Settings');

    cy.openGlobalSettings();
    cy.contains('#global-settings-modal .nav-link', 'Filtering').click({ force: true });
    setGlobalDistanceMetric('snps');
    cy.closeGlobalSettings();

    cy.window()
      .its('commonService.session.style.widgets.network-node-collapse-threshold', { timeout: 20000 })
      .should('equal', 0);

    cy.get(selectors.settingsBtn).click();
    cy.contains('.p-dialog-title', '2D Network Settings')
      .should('be.visible')
      .parents('.p-dialog')
      .as('dialogContainer');

    cy.get('@dialogContainer').contains('.nav-link', 'Nodes').click();
    cy.get('@dialogContainer').contains('p-accordion-panel', 'Collapse Related Nodes').click();
    cy.get('@dialogContainer').find(selectors.collapseThresholdInput).should('have.value', '0');
    cy.get('@dialogContainer').find(selectors.collapseThreshold).should('have.attr', 'step', '1');
    cy.get('@dialogContainer').find('#network-node-collapse-threshold-readout').should('not.exist');
  });
});
