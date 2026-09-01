/// <reference types="cypress" />

import type { DatasetProfile } from '../datasets/profile';
import {
  enableGroupingShow,
  ensureBubbleView,
  ensureMapView,
  goToPhyloTreeView,
  launchProfileToTwoD,
  openBubbleSettingsDialog,
  openGlobalFilteringTab,
  openGlobalStylingTab,
  setGlobalLinkThreshold,
} from '../../../support/journey-helpers';

type WinWithMicrobeTrace = Window & {
  commonService: any;
  cytoscapeInstance?: any;
};

const profile: DatasetProfile = {
  id: 'mixed-genotype-node-coloring',
  title: 'Mixed genotype node coloring',
  tags: ['color-by', 'mixed-node-colors', 'genotype', 'load-to-twod'],
  files: [
    {
      name: 'Cypress_MixedGenotype_Nodes.csv',
      datatype: 'node',
      field1: 'ID',
      field2: 'seq',
    },
    {
      name: 'Cypress_MixedGenotype_Links.csv',
      datatype: 'link',
      field1: 'source',
      field2: 'target',
    },
  ],
  preLaunch: {
    metric: 'snps',
    threshold: 16,
    defaultView: '2D Network',
  },
  expectations: {
    afterLaunch: {
      nodes: 4,
      visibleLinks: 3,
    },
  },
};

const linkOnlyProfile: DatasetProfile = {
  ...profile,
  id: 'mixed-genotype-node-coloring-link-only',
  files: [
    {
      name: 'Cypress_MixedGenotype_Nodes.csv',
      datatype: 'node',
      field1: 'ID',
      field2: 'None',
    },
    {
      name: 'Cypress_MixedGenotype_Links.csv',
      datatype: 'link',
      field1: 'source',
      field2: 'target',
    },
  ],
};

const selectPrimeOption = (selector: string, label: string): void => {
  cy.get(selector).click({ force: true });
  cy.contains('li[role="option"]', label, { timeout: 15000 }).click({ force: true });
};

const assertMixedStyleSegments = (expectedFirstColor?: string): void => {
  cy.window().then((win: unknown) => {
    const { commonService } = win as WinWithMicrobeTrace;
    const mixedNode = commonService.session.data.nodes.find((node: any) => node._id === 'sample-4');
    const singleNode = commonService.session.data.nodes.find((node: any) => node._id === 'sample-2');
    const mixedStyle = commonService.getNodeFillStyle(mixedNode);
    const singleStyle = commonService.getNodeFillStyle(singleNode);
    const color2a = String(commonService.temp.style.nodeColorMap('2a'));
    const color3a = String(commonService.temp.style.nodeColorMap('3a'));

    expect(mixedStyle.segments?.map((segment: any) => segment.value)).to.deep.equal(['2a', '3a']);
    expect(mixedStyle.segments?.map((segment: any) => segment.color)).to.deep.equal([color2a, color3a]);
    expect(singleStyle.segments).to.equal(undefined);

    if (expectedFirstColor) {
      expect(color2a.toLowerCase()).to.equal(expectedFirstColor);
      expect(mixedStyle.segments?.[0].color.toLowerCase()).to.equal(expectedFirstColor);
    }
  });
};

describe('Journey Flow - mixed node coloring', () => {
  it('renders mixed genotype nodes with component color segments across node views', () => {
    launchProfileToTwoD(profile);

    openGlobalStylingTab();
    cy.get('#node-mixed-colors-row').should('not.exist');
    cy.get('#node-mixed-colors-enabled').should('not.exist');
    selectPrimeOption('#node-color-variable', 'Genotype');
    cy.get('#node-mixed-colors-enabled')
      .should('be.enabled')
      .check({ force: true });
    cy.window().its('commonService.session.style.widgets.node-mixed-colors-enabled').should('equal', true);

    ['2a/3a', '6/7a'].forEach((mixedValue) => {
      cy.get(`#key-tables-node-table td[data-value="${mixedValue}"]`, { timeout: 15000 })
        .parents('tr')
        .within(() => {
          cy.get('.tableCount').should('have.text', '1');
          cy.get('[data-mixed-color-swatch="true"] [data-color-segment]').should('have.length', 2);
          cy.get('[data-mixed-color-swatch="true"] input[type="color"]')
            .should('have.length', 2);
        });
    });

    ['2a', '3a'].forEach((singleValue) => {
      cy.get(`#key-tables-node-table td[data-value="${singleValue}"]`)
        .parents('tr')
        .find('.tableCount')
        .should('have.text', '1');
    });
    ['6', '7a'].forEach((mixedOnlyComponent) => {
      cy.get(`#key-tables-node-table td[data-value="${mixedOnlyComponent}"]`).should('not.exist');
    });

    cy.get('#key-tables-node-table td[data-value="2a/3a"]')
      .parents('tr')
      .find('[data-mixed-alpha-trigger="true"]')
      .click({ force: true });
    cy.get('#key-tables-node-table input[aria-label="2a transparency"]')
      .should('have.value', '1')
      .invoke('val', '0.35')
      .trigger('input');
    cy.get('#key-tables-node-table td[data-value="2a"]')
      .parents('tr')
      .find('input[type="color"]')
      .should('have.css', 'opacity', '0.35');
    cy.window().should((win: unknown) => {
      const { commonService } = win as WinWithMicrobeTrace;
      const mixedStyle = commonService.getNodeFillStyle({ Genotype: '2a/3a' });
      expect(commonService.temp.style.nodeAlphaMap('2a')).to.equal(0.35);
      expect(mixedStyle.segments.map((segment: any) => [segment.value, segment.alpha])).to.deep.equal([
        ['2a', 0.35],
        ['3a', 1],
      ]);
    });

    cy.closeGlobalSettings();

    assertMixedStyleSegments();

    cy.window().then((win: unknown) => {
      const typedWindow = win as WinWithMicrobeTrace;
      const cyInstance = typedWindow.cytoscapeInstance;
      const mixedNode = cyInstance.getElementById('sample-4');
      const singleNode = cyInstance.getElementById('sample-2');

      expect(String(mixedNode.data('mixedColorImage') || '')).to.contain('data:image/svg+xml');
      const mixedNodeSvg = decodeURIComponent(String(mixedNode.data('mixedColorImage')).split(',')[1]);
      expect(mixedNodeSvg).to.contain('fill="#ffffff"');
      expect(mixedNodeSvg).to.contain('stroke-dasharray="0.5 0.5"');
      expect(singleNode.data('mixedColorImage')).to.equal(undefined);
    });

    cy.get('#key-tables-node-table td[data-value="2a/3a"]', { timeout: 15000 })
      .parents('tr')
      .find('[data-mixed-color-swatch="true"] input[data-color-segment="0"]')
      .invoke('val', '#00aa00')
      .trigger('input')
      .trigger('change');

    cy.get('#key-tables-node-table td[data-value="2a"]')
      .parents('tr')
      .find('input[type="color"]')
      .should('have.value', '#00aa00');

    assertMixedStyleSegments('#00aa00');

    openGlobalFilteringTab();
    setGlobalLinkThreshold(1);
    cy.closeGlobalSettings();

    cy.window().should((win: unknown) => {
      const { commonService } = win as WinWithMicrobeTrace;
      const clusterTotals = commonService.getVisibleNodes().reduce(
        (totals: Map<number, number>, node: any) => {
          totals.set(node.cluster, (totals.get(node.cluster) || 0) + 1);
          return totals;
        },
        new Map<number, number>(),
      );

      expect(Array.from(clusterTotals.entries())).to.deep.equal([[0, 7], [1, 2]]);
    });

    cy.window().then((win: unknown) => {
      const { commonService } = win as WinWithMicrobeTrace;
      const twoD = commonService.visuals.twoD;
      twoD.onNodeCollapseThresholdDisplayedChange(1);
      twoD.onNodeCollapseEnabledChange(true);
    });

    cy.window().should((win: unknown) => {
      const twoD = (win as WinWithMicrobeTrace).commonService.visuals.twoD;
      const renderedNodes = twoD.cy.nodes(':visible');
      const aggregates = renderedNodes
        .filter((node: any) => node.data('isCollapsedAggregate') === true)
        .toArray()
        .sort((a: any, b: any) => a.data('totalCount') - b.data('totalCount'));

      expect(renderedNodes.length, '2D rendered collapsed node count').to.equal(2);
      expect(aggregates.map((node: any) => node.data('totalCount'))).to.deep.equal([2, 7]);

      const mixedAggregate = aggregates[1];
      const pieSlices = twoD.getCollapsedPieSlices(mixedAggregate.data('counts'));
      expect(pieSlices.map((slice: any) => [slice.label, slice.count])).to.deep.equal([
        ['1a', 1],
        ['2a', 1],
        ['3a', 1],
        ['2a/3a', 1],
        ['6/7a', 1],
        ['null', 2],
      ]);
      expect(pieSlices.find((slice: any) => slice.label === '2a/3a').segments.map((segment: any) => segment.value))
        .to.deep.equal(['2a', '3a']);
      expect(pieSlices.find((slice: any) => slice.label === '6/7a').segments.map((segment: any) => segment.value))
        .to.deep.equal(['6', '7a']);
      expect(String(mixedAggregate.style('background-image'))).to.contain('data:image');
      const aggregateSvg = atob(String(mixedAggregate.data('pieBackgroundImage')).split(',')[1]);
      expect(aggregateSvg).to.contain("data-mt-aggregate-outline='outer'");
      expect(aggregateSvg).not.to.contain("data-mt-aggregate-outline='inner'");
      expect(aggregateSvg).to.contain("data-mt-mixed-hollow-slice='true'");
      expect(aggregateSvg).to.contain("data-mt-solid-aggregate-slice='true'");
      expect(aggregateSvg.match(/data-mt-mixed-ring-segment=/g)).to.have.length(4);
      expect(aggregateSvg.match(/data-mt-aggregate-slice-separator=/g)).to.have.length(6);
      expect(aggregateSvg).not.to.contain('data-mt-aggregate-mixed-indicator');
    });

    cy.window().then((win: unknown) => {
      (win as WinWithMicrobeTrace).commonService.visuals.twoD.onNodeCollapseEnabledChange(false);
    });

    cy.window().should((win: unknown) => {
      const renderedNodes = (win as WinWithMicrobeTrace).commonService.visuals.twoD.cy.nodes(':visible');
      expect(renderedNodes.length, '2D restored node count').to.equal(9);
      expect(renderedNodes.filter((node: any) => node.data('isCollapsedAggregate') === true).length).to.equal(0);
    });

    // Preserve the reported handoff state: related-node collapse remains on
    // at distance 1 when Bubble is opened and its own collapse is enabled.
    cy.window().then((win: unknown) => {
      (win as WinWithMicrobeTrace).commonService.visuals.twoD.onNodeCollapseEnabledChange(true);
    });

    enableGroupingShow('cluster');

    let expandedBubblePositions: Record<string, { xGroup: number; x: number; y: number }> = {};
    ensureBubbleView();
    cy.window().then((win: unknown) => {
      const bubble = (win as WinWithMicrobeTrace).commonService.visuals.bubble;
      const mixedBubbleNode = bubble.cy.getElementById('sample-4');
      expect(String(mixedBubbleNode.data('mixedColorImage') || '')).to.contain('data:image/svg+xml');

      expandedBubblePositions = Object.fromEntries(
        bubble.visibleData.map((node: any) => [
          String(node.id),
          { xGroup: Number(node.Xgroup), x: Number(node.x), y: Number(node.y) },
        ]),
      );
    });

    openBubbleSettingsDialog();
    cy.get('@bubbleSettings').find('#bubble-node-collapsing').contains('On').click({ force: true });
    cy.closeSettingsPane('Bubble Settings');

    cy.window().should((win: unknown) => {
      const { commonService } = win as WinWithMicrobeTrace;
      const bubble = commonService.visuals.bubble;
      const aggregates = [...bubble.visibleData].sort((a: any, b: any) => a.Xgroup - b.Xgroup);
      const renderedNodes = bubble.cy.nodes().filter((node: any) => node.classes().length === 0);

      expect(aggregates.map((node: any) => node.Xgroup)).to.deep.equal([0, 1]);
      expect(aggregates.map((node: any) => node.totalCount)).to.deep.equal([7, 2]);
      expect(
        aggregates.reduce((total: number, node: any) => total + Number(node.totalCount || 0), 0),
        'collapsed Bubble node total',
      ).to.equal(9);
      expect(aggregates[0].counts).to.deep.equal([
        { label: '1a', count: 1 },
        { label: '2a', count: 1 },
        { label: '3a', count: 1 },
        { label: '2a/3a', count: 1 },
        { label: '6/7a', count: 1 },
        { label: 'null', count: 2 },
      ]);
      expect(aggregates[1].counts).to.deep.equal([{ label: 'null', count: 2 }]);
      expect(renderedNodes.length, 'rendered collapsed Bubble count').to.equal(2);

      aggregates.forEach((aggregate: any) => {
        const renderedNode = bubble.cy.getElementById(aggregate.id);
        expect(renderedNode.empty(), `rendered aggregate ${aggregate.id}`).to.equal(false);
        expect(renderedNode.style('display'), `displayed aggregate ${aggregate.id}`).to.equal('element');
        expect(renderedNode.style('visibility'), `visible aggregate ${aggregate.id}`).to.equal('visible');
      });

      const pieSlices = bubble.getPieSlicesForCollapsedBubbleNode(aggregates[0]);
      expect(pieSlices.map((slice: any) => [slice.label, slice.count])).to.deep.equal([
        ['1a', 1],
        ['2a', 1],
        ['3a', 1],
        ['2a/3a', 1],
        ['6/7a', 1],
        ['null', 2],
      ]);
      expect(pieSlices.find((slice: any) => slice.label === '2a/3a').segments.map((segment: any) => segment.value))
        .to.deep.equal(['2a', '3a']);
      expect(pieSlices.find((slice: any) => slice.label === '6/7a').segments.map((segment: any) => segment.value))
        .to.deep.equal(['6', '7a']);
      expect(
        pieSlices.reduce((total: number, slice: any) => total + Number(slice.count || 0), 0),
        'cluster-0 pie total',
      ).to.equal(7);
    });

    // Cross-view cluster recomputation can invalidate Bubble's cached category
    // order while aggregates are displayed. Expanding must rebuild both axes
    // before restoring the individual node positions.
    cy.window().then((win: unknown) => {
      const bubble = (win as WinWithMicrobeTrace).commonService.visuals.bubble;
      bubble.X_categories = [...bubble.X_categories].reverse();
    });

    openBubbleSettingsDialog();
    cy.get('@bubbleSettings').find('#bubble-node-collapsing').contains('Off').click({ force: true });
    cy.closeSettingsPane('Bubble Settings');

    cy.window().should((win: unknown) => {
      const { commonService } = win as WinWithMicrobeTrace;
      const bubble = commonService.visuals.bubble;
      const visibleNodesById = new Map(
        commonService.getVisibleNodes().map((node: any) => [String(node._id ?? node.id), node]),
      );

      expect(bubble.X_categories, 'expanded Bubble cluster categories').to.deep.equal([0, 1]);
      expect(bubble.visibleData.length, 'expanded Bubble node count').to.equal(9);

      bubble.visibleData.forEach((node: any) => {
        const sourceNode = visibleNodesById.get(String(node.id));
        const before = expandedBubblePositions[String(node.id)];
        expect(sourceNode, `source node ${node.id}`).to.exist;
        expect(node.Xgroup, `current cluster position for ${node.id}`)
          .to.equal(bubble.X_categories.indexOf(sourceNode.cluster));
        expect(
          { xGroup: Number(node.Xgroup), x: Number(node.x), y: Number(node.y) },
          `restored Bubble position for ${node.id}`,
        ).to.deep.equal(before);
      });
    });

    openBubbleSettingsDialog();
    cy.get('@bubbleSettings').find('#bubble-node-collapsing').contains('On').click({ force: true });
    cy.closeSettingsPane('Bubble Settings');

    cy.window().then((win: unknown) => {
      const bubble = (win as WinWithMicrobeTrace).commonService.visuals.bubble;
      const clusterZero = bubble.visibleData.find((node: any) => node.Xgroup === 0);
      const renderedNode = bubble.cy.getElementById(clusterZero.id);
      renderedNode.emit('mouseover', renderedNode.renderedPosition());
    });

    cy.get('#bubbleTooltip', { timeout: 5000 })
      .should('be.visible')
      .within(() => {
        cy.contains('tr', '(Empty)').should('contain', '2');
        cy.contains('tr', 'Total').should('contain', '7');
      });

    openGlobalFilteringTab();
    setGlobalLinkThreshold(16);
    cy.closeGlobalSettings();

    cy.get('#bubbleTooltip').should('not.be.visible');
    cy.window().should((win: unknown) => {
      const bubble = (win as WinWithMicrobeTrace).commonService.visuals.bubble;
      expect(bubble.visibleData.map((node: any) => node.totalCount)).to.deep.equal([9]);
    });

    ensureMapView();
    cy.window().then((win: unknown) => {
      const map = (win as WinWithMicrobeTrace).commonService.visuals.gisMap;
      map.SelectedLatitude = 'lat';
      map.SelectedLongitude = 'long';
      map.onDataChange(null);
    });
    cy.window().should((win: unknown) => {
      const map = (win as WinWithMicrobeTrace).commonService.visuals.gisMap;
      const marker = map.mapNodeMarkersById['sample-4'];
      const iconUrl = String(marker?.options?.icon?.options?.iconUrl || '');
      expect(iconUrl).to.contain('data:image/svg+xml');
      expect(decodeURIComponent(iconUrl)).to.contain('#00aa00');
    });

    goToPhyloTreeView();
    cy.get('#phylocanvas g.tidytree-node-leaf circle[title="sample-4"]', { timeout: 30000 })
      .should('have.css', 'fill', 'rgb(255, 255, 255)')
      .parent()
      .find('circle.tidytree-node-mixed-ring[data-mt-mixed-ring="true"]')
      .should(($ringSegments) => {
        expect($ringSegments).to.have.length(2);
        const ringColors = [...$ringSegments].map((segment) => String(segment.getAttribute('stroke')).toLowerCase());
        expect(ringColors).to.include('#00aa00');
      });
  });

  it('keeps expanded Bubble colors tied to node IDs after related-node collapse renumbers indexes', () => {
    launchProfileToTwoD(linkOnlyProfile);

    openGlobalStylingTab();
    selectPrimeOption('#node-color-variable', 'Genotype');
    cy.get('#node-mixed-colors-enabled').check({ force: true });
    cy.closeGlobalSettings();

    enableGroupingShow('cluster');
    cy.window().then((win: unknown) => {
      const twoD = (win as WinWithMicrobeTrace).commonService.visuals.twoD;
      twoD.onNodeCollapseThresholdDisplayedChange(1);
      twoD.onNodeCollapseEnabledChange(true);
    });

    cy.window().should((win: unknown) => {
      const { commonService } = win as WinWithMicrobeTrace;
      const renderedNodes = commonService.visuals.twoD.cy.nodes(':visible').filter(
        (node: any) => !node.data('isParent') && node.children().length === 0,
      );
      const aggregate = renderedNodes.filter(
        (node: any) => node.data('isCollapsedAggregate') === true,
      );

      expect(renderedNodes.length, '2D related-node collapsed count').to.equal(6);
      expect(aggregate.length, '2D related-node aggregate count').to.equal(1);
      expect(aggregate[0].data('collapsedMemberIds')).to.deep.equal([
        'sample-1',
        'sample-2',
        'sample-3',
        'sample-4',
      ]);
    });

    ensureBubbleView();
    cy.window().should((win: unknown) => {
      const { commonService } = win as WinWithMicrobeTrace;
      const bubble = commonService.visuals.bubble;
      const sourceNodesById = new Map(
        commonService.session.data.nodeFilteredValues.map(
          (node: any) => [String(node._id ?? node.id), node],
        ),
      );

      expect(bubble.SelectedNodeCollapsingTypeVariable, 'Bubble collapse state').to.equal(false);
      expect(bubble.X_categories, 'Bubble cluster categories').to.deep.equal([0, 1, 2, 3, 4, 5]);

      bubble.visibleData.forEach((dataNode: any) => {
        const sourceNode = sourceNodesById.get(String(dataNode.id));
        expect(sourceNode, `source node ${dataNode.id}`).to.exist;
        const expectedStyle = commonService.getNodeFillStyle(sourceNode);
        expect(dataNode.color, `color for ${dataNode.id}`).to.equal(expectedStyle.color);
        expect(dataNode.opacity, `opacity for ${dataNode.id}`).to.equal(expectedStyle.alpha);
        expect(
          Boolean(dataNode.mixedColorImage),
          `mixed fill state for ${dataNode.id}`,
        ).to.equal(Array.isArray(expectedStyle.segments) && expectedStyle.segments.length > 1);
      });

      const mixedSingleton = bubble.visibleData.find((node: any) => node.id === 'sample-5');
      expect(mixedSingleton.Xgroup, 'mixed singleton cluster').to.equal(1);
      expect(String(mixedSingleton.mixedColorImage || '')).to.contain('data:image/svg+xml');

      ['sample-6', 'sample-7', 'sample-8', 'sample-9'].forEach((nodeId) => {
        const emptyNode = bubble.visibleData.find((node: any) => node.id === nodeId);
        const sourceNode = sourceNodesById.get(nodeId);
        const emptyStyle = commonService.getNodeFillStyle(sourceNode);
        expect(emptyNode.color, `empty color for ${nodeId}`).to.equal(emptyStyle.color);
        expect(emptyNode.mixedColorImage, `no mixed fill for ${nodeId}`).to.equal(undefined);
      });
    });

    cy.window().then((win: unknown) => {
      const bubble = (win as WinWithMicrobeTrace).commonService.visuals.bubble;
      bubble.SelectedNodeCollapsingTypeVariable = true;
      bubble.onNodeCollapsingChange();
    });

    cy.window().should((win: unknown) => {
      const bubble = (win as WinWithMicrobeTrace).commonService.visuals.bubble;
      const mixedSingleton = bubble.visibleData.find((node: any) => node.Xgroup === 1);
      const slices = bubble.getPieSlicesForCollapsedBubbleNode(mixedSingleton);
      const renderedNode = bubble.cy.getElementById(mixedSingleton.id);

      expect(mixedSingleton.totalCount, 'collapsed mixed singleton count').to.equal(1);
      expect(mixedSingleton.counts).to.deep.equal([{ label: '6/7a', count: 1 }]);
      expect(slices.map((slice: any) => [slice.label, slice.count])).to.deep.equal([['6/7a', 1]]);
      expect(slices[0].segments.map((segment: any) => segment.value)).to.deep.equal(['6', '7a']);
      expect(String(renderedNode.style('background-image'))).to.contain('data:image');
    });
  });
});
