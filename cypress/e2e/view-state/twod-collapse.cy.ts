/// <reference types="cypress" />

import { ensureTwoDNetworkView, setGlobalDistanceMetric, setTN93DistanceDisplayFormat, visitAppAndAcceptEula } from '../../support/journey-helpers';
import { byTestId, testIds } from '../../support/selectors';

const selectors = {
  canvas: '#cy',
  settingsBtn: byTestId(testIds.twodSettingsButton),
  collapseToggle: '#network-node-collapse-enabled',
  collapseThresholdSlider: '#network-node-collapse-threshold',
  collapseThresholdInput: '#network-node-collapse-threshold-input',
};

const collapseGroupField = '__twodCollapseGroup';
const collapseShapeWarningText = 'All collapsed nodes will be displayed as circles';

function expectCollapseDistanceControl(label: string, step: string, max: string): void {
  cy.get('@dialogContainer')
    .find('label[for="network-node-collapse-threshold-input"]')
    .should('have.text', label);
  cy.get('@dialogContainer')
    .find(selectors.collapseThresholdInput)
    .should('have.value', '0');
  cy.get('@dialogContainer')
    .find(selectors.collapseThresholdInput)
    .should('be.disabled');
  cy.get('@dialogContainer')
    .find(selectors.collapseThresholdInput)
    .should('have.attr', 'min', '0');
  cy.get('@dialogContainer')
    .find(selectors.collapseThresholdInput)
    .should('have.attr', 'step', step);
  cy.get('@dialogContainer')
    .find(selectors.collapseThresholdInput)
    .should('have.attr', 'max', max);
}

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
      const distanceOrigins = win.commonService.getLinkDistanceOrigins?.(link) || [];
      const origins = Array.isArray(link.origin) ? link.origin : [];
      const hasDistanceOrigin = distanceOrigins.length > 0
        || origins.some((origin: any) => String(origin || '').toLowerCase().includes('distance'));

      return Boolean(source && target && source !== target && link.hasDistance === true && value !== null && hasDistanceOrigin);
    })
    .sort((a: any, b: any) => Number(a[metric]) - Number(b[metric]));
}

function internalDistanceSummaryForMembers(
  win: any,
  memberIds: string[],
  metric: string,
): { mean: number | null; pairCount: number } {
  const members = new Set(memberIds.map((id) => String(id)));
  const pairValues = new Map<string, number[]>();

  distanceLinksForMetric(win, metric).forEach((link: any) => {
    const source = linkEndpointId(link.source);
    const target = linkEndpointId(link.target);

    if (source === target || !members.has(source) || !members.has(target)) {
      return;
    }

    const value = metricValue(link, metric);
    if (value === null) {
      return;
    }

    const pairKey = JSON.stringify(source < target ? [source, target] : [target, source]);
    const values = pairValues.get(pairKey) || [];
    values.push(value);
    pairValues.set(pairKey, values);
  });

  const pairMeans = Array.from(pairValues.values())
    .map((values) => values.reduce((sum, value) => sum + value, 0) / values.length);

  if (pairMeans.length === 0) {
    return { mean: null, pairCount: 0 };
  }

  return {
    mean: pairMeans.reduce((sum, value) => sum + value, 0) / pairMeans.length,
    pairCount: pairMeans.length,
  };
}

function configureDeterministicCollapsePie(win: any): number {
  const commonService = win.commonService;
  const twoD = commonService.visuals.twoD;
  const widgets = commonService.session.style.widgets;
  const threshold = 0.001;
  const aboveThresholdDistance = 0.2;
  const [firstNode, secondNode, thirdNode] = (commonService.session.data.nodes || [])
    .filter((node: any) => String(node._id ?? node.id ?? '').length > 0);

  expect(firstNode, 'first collapse fixture node').to.exist;
  expect(secondNode, 'second collapse fixture node').to.exist;
  expect(thirdNode, 'third collapse fixture node').to.exist;

  const firstId = String(firstNode._id ?? firstNode.id);
  const secondId = String(secondNode._id ?? secondNode.id);
  const thirdId = String(thirdNode._id ?? thirdNode.id);
  const targetIds = new Set([firstId, secondId, thirdId]);
  const syntheticLinks = [
    { id: 'cypress-collapse-distance-ab', source: firstId, target: secondId, distance: threshold },
    { id: 'cypress-collapse-distance-bc', source: secondId, target: thirdId, distance: threshold },
    { id: 'cypress-collapse-distance-ac', source: firstId, target: thirdId, distance: aboveThresholdDistance },
  ];

  commonService.session.data.links = (commonService.session.data.links || [])
    .filter((link: any) => !String(link.id || '').startsWith('cypress-collapse-distance-'));
  syntheticLinks.forEach((link, index) => {
    commonService.session.data.links.push({
      index: commonService.session.data.links.length + index,
      ...link,
      visible: true,
      origin: ['Cypress Collapse Mean Distance', 'Genetic Distance'],
      hasDistance: true,
      distanceOrigin: 'Genetic Distance',
      directed: false,
    });
  });

  commonService.session.data.nodes.forEach((node: any) => {
    const id = String(node._id ?? node.id ?? '');
    node[collapseGroupField] = targetIds.has(id)
      ? `Pair ${id === firstId ? 'A' : id === secondId ? 'B' : 'C'}`
      : 'Outside Pair';
  });
  commonService.session.data.nodeFilteredValues.forEach((node: any) => {
    const id = String(node._id ?? node.id ?? '');
    node[collapseGroupField] = targetIds.has(id)
      ? `Pair ${id === firstId ? 'A' : id === secondId ? 'B' : 'C'}`
      : 'Outside Pair';
  });

  if (!commonService.session.data.nodeFields.includes(collapseGroupField)) {
    commonService.session.data.nodeFields.push(collapseGroupField);
  }

  widgets['node-color-variable'] = collapseGroupField;
  commonService.createNodeColorMap();
  twoD.updateNodeColors();

  return threshold;
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
      const meanInternalDistance = node.data('meanInternalDistance');

      return {
        id: node.id(),
        totalCount: Number(node.data('totalCount') || 0),
        collapsedMemberCount: collapsedMemberIds.length,
        collapsedMemberIds: collapsedMemberIds.map((id: any) => String(id)),
        counts: counts.map((count: any) => ({
          label: String(count.label),
          count: Number(count.count || 0),
        })),
        meanInternalDistance: meanInternalDistance === undefined || meanInternalDistance === null
          ? null
          : Number(meanInternalDistance),
        internalDistancePairCount: Number(node.data('internalDistancePairCount') || 0),
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

    cy.window().then((win: any) => {
      const app = win.commonService.visuals.microbeTrace;
      const selectedShape = app.getNodeShapeTreeSelection('ellipse');

      expect(selectedShape, 'circle node shape selection').to.exist;
      app.onNodeShapeByChanged(true, false, 'None');
      app.onNodeShapeTreeChange(selectedShape);
    });
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
    cy.get('@dialogContainer').find(selectors.collapseThresholdSlider).should('not.exist');
    cy.get('@dialogContainer').find(selectors.collapseThresholdInput).should('exist');

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
      expect(twoD.SelectedNodeCollapseMetricLabel).to.equal('TN93 (%)');

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
          .to.include.members(['Pair A', 'Pair B', 'Pair C']);
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

  it('increments the collapse distance and refreshes collapsed aggregates', () => {
    cy.get(selectors.settingsBtn).click();

    cy.contains('.p-dialog-title', '2D Network Settings')
      .should('be.visible')
      .parents('.p-dialog')
      .as('dialogContainer');

    cy.get('@dialogContainer').contains('.nav-link', 'Nodes').click();
    cy.get('@dialogContainer').contains('p-accordion-panel', 'Collapse Related Nodes').click();

    cy.window().then((win: any) => {
      const commonService = win.commonService;
      const twoD = commonService.visuals.twoD;

      configureDeterministicCollapsePie(win);
      commonService.session.data.links.forEach((link: any) => {
        if (!String(link.id || '').startsWith('cypress-collapse-distance-') && link.hasDistance === true) {
          link.distance = 0.2;
        }
      });
      twoD.onNodeCollapseThresholdDisplayedChange(0);
      twoD.onNodeCollapseEnabledChange(true);

      expect(commonService.session.style.widgets['network-node-collapse-threshold']).to.equal(0);
      cy.wrap(null, { timeout: 20000 }).should(() => {
        expect(commonService.session.network.rendering, 'network rendering before increment').to.equal(false);
        expect(getCollapseRenderSummary(win).aggregateCount, 'visible aggregate nodes before increment').to.equal(0);
      });
    });

    cy.get('@dialogContainer')
      .find(selectors.collapseThresholdInput)
      .should('be.enabled')
      .and('have.value', '0');
    cy.get('@dialogContainer')
      .find(selectors.collapseThresholdInput)
      .should('have.attr', 'step', '0.1');
    cy.get('@dialogContainer')
      .find(selectors.collapseThresholdInput)
      .type('{uparrow}')
      .should('have.value', '0.1');

    cy.window()
      .its('commonService.session.style.widgets.network-node-collapse-threshold')
      .should('equal', 0.001);

    cy.closeSettingsPane('2D Network Settings');

    cy.window().then((win: any) => {
      cy.wrap(null, { timeout: 20000 }).should(() => {
        expect(getCollapseRenderSummary(win).aggregateCount, 'visible aggregate nodes after increment').to.be.greaterThan(0);
      });
    });
  });

  it('separates overlapping collapsed aggregates when recalculating a no-link layout', () => {
    cy.window().then(async (win: any) => {
      const twoD = win.commonService.visuals.twoD;
      const aggregateRenderedSize = 72;
      const nodes = [
        {
          id: 'cypress-overlap-a',
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
          nodeSize: 80,
          aggregateRenderedSize,
          isCollapsedAggregate: true,
        },
        {
          id: 'cypress-overlap-b',
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
          nodeSize: 80,
          aggregateRenderedSize,
          isCollapsedAggregate: true,
        },
      ];

      win.commonService.session.network.allPinned = false;
      const result = await twoD.precomputePositionsWithD3(nodes, [], 30, false);
      const [first, second] = result.nodes;
      const separation = Math.hypot(first.x - second.x, first.y - second.y);

      expect(Number.isFinite(first.x), 'first aggregate x').to.equal(true);
      expect(Number.isFinite(first.y), 'first aggregate y').to.equal(true);
      expect(Number.isFinite(second.x), 'second aggregate x').to.equal(true);
      expect(Number.isFinite(second.y), 'second aggregate y').to.equal(true);
      expect(separation, 'aggregate center separation').to.be.at.least(aggregateRenderedSize);
    });
  });

  it('keeps collapsed aggregates within active grouping boundaries', () => {
    const groupingField = 'cluster';
    let sameGroupMemberIds: string[] = [];
    let differentGroupMemberId = '';

    cy.window().then((win: any) => {
      const commonService = win.commonService;
      const twoD = commonService.visuals.twoD;
      const threshold = configureDeterministicCollapsePie(win);
      const syntheticLinks = commonService.session.data.links
        .filter((link: any) => String(link.id || '').startsWith('cypress-collapse-distance-'));
      const [firstNode, secondNode, thirdNode] = commonService.session.data.nodes;
      const firstId = String(firstNode._id ?? firstNode.id);
      const secondId = String(secondNode._id ?? secondNode.id);
      const thirdId = String(thirdNode._id ?? thirdNode.id);

      sameGroupMemberIds = [firstId, thirdId].sort();
      differentGroupMemberId = secondId;

      syntheticLinks.forEach((link: any) => {
        link.distance = threshold;
      });
      commonService.session.data.links.forEach((link: any) => {
        if (!String(link.id || '').startsWith('cypress-collapse-distance-') && link.hasDistance === true) {
          link.distance = 0.2;
        }
      });

      commonService.session.data.nodes.forEach((node: any) => {
        const id = String(node._id ?? node.id ?? '');
        node[groupingField] = sameGroupMemberIds.includes(id)
          ? 'Group A'
          : id === differentGroupMemberId
            ? 'Group B'
            : 'Outside Group';
      });
      commonService.session.data.nodeFilteredValues.forEach((node: any) => {
        const id = String(node._id ?? node.id ?? '');
        node[groupingField] = sameGroupMemberIds.includes(id)
          ? 'Group A'
          : id === differentGroupMemberId
            ? 'Group B'
            : 'Outside Group';
      });

      twoD.onNodeCollapseThresholdDisplayedChange(
        commonService.toDisplayedDistanceValue(threshold, 'distance')
      );
      twoD.onNodeCollapseEnabledChange(true);
    });

    cy.window().then((win: any) => {
      cy.wrap(null, { timeout: 20000 }).should(() => {
        const aggregateNodes = win.commonService.visuals.twoD.cy.nodes(':visible')
          .filter((node: any) => node.data('isCollapsedAggregate') === true);
        const crossGroupAggregate = aggregateNodes
          .filter((node: any) => {
            const memberIds = (node.data('collapsedMemberIds') || []).map(String);
            return sameGroupMemberIds.every((id) => memberIds.includes(id))
              && memberIds.includes(differentGroupMemberId);
          });

        expect(crossGroupAggregate.length, 'aggregate spanning groups before grouping').to.equal(1);
      });
    });

    cy.window().then((win: any) => {
      const twoD = win.commonService.visuals.twoD;
      twoD.polygonsToggle(true);
      twoD.centerPolygons(groupingField);
    });

    cy.window().then((win: any) => {
      cy.wrap(null, { timeout: 20000 }).should(() => {
        const commonService = win.commonService;
        const cyInstance = commonService.visuals.twoD.cy;
        const nodeById = new Map<string, any>(
          commonService.session.data.nodes.map((node: any): [string, any] => [
            String(node._id ?? node.id),
            node,
          ])
        );
        const aggregateNodes = cyInstance.nodes(':visible')
          .filter((node: any) => node.data('isCollapsedAggregate') === true);
        const targetAggregate = aggregateNodes
          .filter((node: any) => {
            const memberIds = (node.data('collapsedMemberIds') || []).map(String).sort();
            return JSON.stringify(memberIds) === JSON.stringify(sameGroupMemberIds);
          });

        expect(commonService.session.network.rendering, 'network rendering after grouping').to.equal(false);
        expect(targetAggregate.length, 'same-group aggregate').to.equal(1);
        expect(targetAggregate[0].parent().id(), 'aggregate parent group').to.equal('group-Group A');

        aggregateNodes.forEach((node: any) => {
          const memberGroups = new Set(
            (node.data('collapsedMemberIds') || [])
              .map((id: any) => nodeById.get(String(id))?.[groupingField])
          );
          expect(memberGroups.size, `${node.id()} grouping values`).to.equal(1);
        });

        const hiddenGroupedNodes = cyInstance.nodes('.hidden')
          .filter((node: any) => node.parent().length > 0);
        expect(hiddenGroupedNodes.length, 'hidden originals inside group parents').to.equal(0);

        const staleAggregates = cyInstance.nodes()
          .filter((node: any) => (
            node.data('isCollapsedAggregate') === true
            && node.hasClass('hidden')
          ));
        expect(staleAggregates.length, 'stale hidden aggregates').to.equal(0);
      });
    });

    cy.window().then((win: any) => win.commonService.visuals.twoD.updateLayout());

    cy.window().then((win: any) => {
      const hiddenGroupedNodes = win.commonService.visuals.twoD.cy.nodes('.hidden')
        .filter((node: any) => node.parent().length > 0);
      expect(hiddenGroupedNodes.length, 'hidden originals after grouped recalculation').to.equal(0);
    });
  });

  it('warns that collapsed nodes render as circles when non-circle node shapes are active', () => {
    cy.get(selectors.settingsBtn).click();

    cy.contains('.p-dialog-title', '2D Network Settings')
      .should('be.visible')
      .parents('.p-dialog')
      .as('dialogContainer');

    cy.get('@dialogContainer').contains('.nav-link', 'Nodes').click();
    cy.get('@dialogContainer').contains('p-accordion-panel', 'Collapse Related Nodes').click();

    cy.window().then((win: any) => {
      const commonService = win.commonService;
      const app = commonService.visuals.microbeTrace;
      const twoD = commonService.visuals.twoD;
      const selectedShape = app.getNodeShapeTreeSelection('triangle');
      const threshold = configureDeterministicCollapsePie(win);
      const displayedThreshold = commonService.toDisplayedDistanceValue(threshold, 'distance');

      expect(selectedShape, 'triangle node shape selection').to.exist;
      app.onNodeShapeByChanged(true, false, 'None');
      app.onNodeShapeTreeChange(selectedShape);
      twoD.SelectedNodeCollapseThresholdDisplayedVariable = displayedThreshold;
      twoD.onNodeCollapseThresholdDisplayedChange(displayedThreshold);

      expect(commonService.session.style.widgets['node-symbol']).to.equal('triangle');
      expect(commonService.session.style.widgets['network-node-collapse-enabled']).to.equal(false);
    });

    cy.get('@dialogContainer').find(selectors.collapseToggle).contains('span', 'Show').click({ force: true });
    cy.contains('.p-dialog:visible', collapseShapeWarningText, { timeout: 15000 }).as('collapseShapeConfirmDialog');
    cy.get('@collapseShapeConfirmDialog').contains('button', 'Cancel').click({ force: true });
    cy.contains('.p-dialog:visible', collapseShapeWarningText).should('not.exist');
    cy.window().its('commonService.session.style.widgets.network-node-collapse-enabled').should('equal', false);
    cy.get('@dialogContainer').find(selectors.collapseThresholdInput).should('be.disabled');
    cy.wait(250);

    cy.get('@dialogContainer').find(selectors.collapseToggle).contains('span', 'Show').click({ force: true });
    cy.contains('.p-dialog:visible', collapseShapeWarningText, { timeout: 15000 }).as('collapseShapeConfirmDialog');
    cy.get('@collapseShapeConfirmDialog').contains('button', 'Confirm').click({ force: true });
    cy.contains('.p-dialog:visible', collapseShapeWarningText).should('not.exist');
    cy.window().its('commonService.session.style.widgets.network-node-collapse-enabled').should('equal', true);
    cy.closeSettingsPane('2D Network Settings');

    cy.window().then((win: any) => {
      cy.wrap(null, { timeout: 20000 }).should(() => {
        const aggregateNodes = win.commonService.visuals.twoD.cy.nodes(':visible')
          .filter((node: any) => node.data('isCollapsedAggregate') === true);

        expect(aggregateNodes.length, 'visible aggregate nodes').to.be.greaterThan(0);
        aggregateNodes.forEach((node: any) => {
          expect(String(node.data('shapeKey') || '').trim(), 'aggregate node shape key').to.equal('ellipse');
          expect(String(node.style('shape') || '').trim(), 'aggregate rendered shape').to.equal('ellipse');
        });
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
      const metric = 'distance';
      const collapseThreshold = Number(commonService.session.style.widgets['network-node-collapse-threshold']);
      const expectedInternalDistance = internalDistanceSummaryForMembers(win, pieNode.collapsedMemberIds, metric);
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
      expectedRows.push([
        `Mean Distance (${win.commonService.visuals.twoD.SelectedNodeCollapseMetricLabel})`,
        commonService.formatDisplayedDistanceValue(expectedInternalDistance.mean, metric),
        '',
      ]);

      expect(pieNode.internalDistancePairCount, 'internal distance pair count')
        .to.equal(expectedInternalDistance.pairCount);
      expect(expectedInternalDistance.pairCount, 'all pairwise member distances').to.be.at.least(3);
      if (expectedInternalDistance.mean === null) {
        expect(pieNode.meanInternalDistance, 'mean internal distance').to.equal(null);
      } else {
        expect(expectedInternalDistance.mean, 'mean includes above-threshold internal pair')
          .to.be.greaterThan(collapseThreshold);
        expect(pieNode.meanInternalDistance, 'mean internal distance')
          .to.be.closeTo(expectedInternalDistance.mean, 1e-12);
      }

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
    expectCollapseDistanceControl('Distance (TN93 (%))', '0.1', '1.5');
    cy.get('@dialogContainer').find(selectors.collapseThresholdSlider).should('not.exist');
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
    expectCollapseDistanceControl('Distance (TN93)', '0.001', '0.015');
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
    expectCollapseDistanceControl('Distance (SNPs)', '1', '16');
  });

  it('caps the collapse distance at the current filtering threshold', () => {
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
    cy.get('@dialogContainer')
      .find(selectors.collapseThresholdInput)
      .should('have.attr', 'max', '0.015');

    cy.window().then((win: any) => {
      win.commonService.session.style.widgets['network-node-collapse-threshold'] = 0.2;
      win.commonService.visuals.microbeTrace.onLinkThresholdChanged(0.002, true);
    });

    cy.get('@dialogContainer')
      .find(selectors.collapseThresholdInput)
      .should('have.attr', 'max', '0.002');
    cy.get('@dialogContainer')
      .find(selectors.collapseThresholdInput)
      .should('have.value', '0.002');

    cy.window()
      .its('commonService.session.style.widgets.network-node-collapse-threshold')
      .should('equal', 0.002);
  });
});
