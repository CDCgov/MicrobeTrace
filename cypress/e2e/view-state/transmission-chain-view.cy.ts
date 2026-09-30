/// <reference types="cypress" />

import { Core } from 'cytoscape';
import {
  goToTransmissionChainView,
  launchAndWaitForProcessing,
  visitAppAndAcceptEula,
} from '../../support/journey-helpers';
import { byTestId, testIds } from '../../support/selectors';

const dateField = 'Date of symptom onset Date';
const yAxisField = 'State';

const getTransmissionCy = () =>
  cy.window({ log: false })
    .its('commonService.visuals.transmissionChain.cy') as Cypress.Chainable<Core>;

const leafNodes = (cyInstance: Core) =>
  cyInstance
    .nodes(':visible')
    .filter((node) => node.children().length === 0 && !node.hasClass('parent') && !node.hasClass('hidden'));

const getDataNodeId = (node: any): string =>
  String(node?._id ?? node?.id ?? node?.Id ?? node?.ID ?? node?.name ?? node?.Name ?? '');

const getTransmissionClusterValue = (node: any): string =>
  String(
    node.data('display_cluster')
    ?? node.data('displayCluster')
    ?? node.data('DisplayCluster')
    ?? node.data('Display Cluster')
    ?? node.data('cluster')
    ?? node.data('Cluster')
    ?? node.data('foci')
    ?? '',
  ).trim();

const collectClusterBands = (cyInstance: Core): Array<[string, { minY: number; maxY: number; count: number }]> => {
  const clusterBounds = new Map<string, { minY: number; maxY: number; count: number }>();

  leafNodes(cyInstance).forEach((node) => {
    const cluster = getTransmissionClusterValue(node);
    if (!cluster) {
      return;
    }

    const renderedHeight = parseFloat(String(node.style('height'))) || 0;
    const halfHeight = Math.max(1, renderedHeight / 2);
    const y = node.position('y');
    const current = clusterBounds.get(cluster) ?? {
      minY: Number.POSITIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
      count: 0,
    };

    current.minY = Math.min(current.minY, y - halfHeight);
    current.maxY = Math.max(current.maxY, y + halfHeight);
    current.count += 1;
    clusterBounds.set(cluster, current);
  });

  return Array.from(clusterBounds.entries())
    .filter(([, bounds]) => bounds.count > 0)
    .sort((a, b) => a[1].minY - b[1].minY);
};

const expectSeparatedClusterBands = (cyInstance: Core, minimumGap = 0): void => {
  const bands = collectClusterBands(cyInstance);

  expect(bands.length, 'cluster bands').to.be.greaterThan(1);
  for (let index = 1; index < bands.length; index++) {
    const [previousCluster, previousBounds] = bands[index - 1];
    const [currentCluster, currentBounds] = bands[index];
    const gap = currentBounds.minY - previousBounds.maxY;

    expect(
      gap,
      `${currentCluster} gap below ${previousCluster}`,
    ).to.be.greaterThan(minimumGap);
  }
};

const openSettings = (): void => {
  cy.get('body').then(($body) => {
    const isAlreadyOpen = $body.find('.p-dialog-title:contains("Transmission Chain View Settings"):visible').length > 0;
    if (!isAlreadyOpen) {
      cy.get(byTestId(testIds.transmissionChainSettingsButton), { timeout: 15000 }).click({ force: true });
    }

    cy.contains('.p-dialog-title', 'Transmission Chain View Settings', { timeout: 15000 })
      .should('be.visible')
      .parents('.p-dialog')
      .as('dialogContainer');
  });
};

const selectDateField = (): void => {
  cy.get('@dialogContainer').contains('.nav-link', 'Layout').click({ force: true });
  cy.get('@dialogContainer').find('#transmission-chain-date-field', { timeout: 10000 }).click({ force: true });
  cy.contains('li[role="option"]', dateField, { timeout: 10000 }).click({ force: true });
  cy.window().its('commonService.session.style.widgets.transmission-chain-date-field').should('equal', dateField);
  cy.get('.timeline-axis-overlay:not(.hidden)', { timeout: 20000 }).should('exist');
};

const selectYAxisField = (): void => {
  cy.get('@dialogContainer').contains('.nav-link', 'Layout').click({ force: true });
  cy.get('body').then(($body) => {
    if ($body.find('.p-select-overlay:visible').length) {
      cy.get('body').type('{esc}', { force: true });
    }
  });
  cy.get('@dialogContainer').find('#transmission-chain-y-axis-field', { timeout: 10000 }).click({ force: true });
  cy.get('.p-select-overlay:visible', { timeout: 10000 }).last().then(($overlay) => {
    const scrollable = $overlay
      .find('.p-select-list-container, .p-virtualscroller, .p-select-items-wrapper')
      .filter((_index, element) => element.scrollHeight > element.clientHeight)
      .first();

    if (scrollable.length) {
      scrollable.get(0).scrollTop = scrollable.get(0).scrollHeight * 0.3;
      scrollable.get(0).dispatchEvent(new Event('scroll', { bubbles: true }));
    }
  });
  cy.get('.p-select-overlay:visible', { timeout: 10000 })
    .last()
    .find('.p-select-option')
    .filter((_index, option) => String(option.textContent || '').trim() === yAxisField)
    .should('have.length', 1)
    .click({ force: true });
  cy.window().its('commonService.session.style.widgets.transmission-chain-y-axis-field').should('equal', yAxisField);
  cy.get('.timeline-y-axis', { timeout: 20000 }).should('exist');
};

const openDisplayPanel = (): void => {
  cy.get('@dialogContainer').contains('.nav-link', 'Network').click({ force: true });
  cy.get('@dialogContainer').then(($dialog) => {
    if ($dialog.find('#transmission-chain-line-style:visible').length === 0) {
      cy.wrap($dialog).contains('p-accordion-header', 'Display').click({ force: true });
    }
  });
  cy.get('@dialogContainer').find('#transmission-chain-line-style', { timeout: 10000 }).should('be.visible');
};

const selectLineStyle = (label: string, value: string): void => {
  openDisplayPanel();
  cy.get('@dialogContainer').find('#transmission-chain-line-style').click({ force: true });
  cy.contains('li[role="option"]', label, { timeout: 10000 }).click({ force: true });
  cy.window().its('commonService.session.style.widgets.transmission-chain-line-style').should('equal', value);
};

const openNodeSizePanel = (): void => {
  cy.get('@dialogContainer').contains('.nav-link', 'Nodes').click({ force: true });
  cy.get('@dialogContainer').find('.tab-pane.active')
    .contains('p-accordion-header', 'Shapes and Sizes')
    .click({ force: true });
  cy.get('@dialogContainer').find('.tab-pane.active #node-radius').then(($input) => {
    if ($input.css('visibility') === 'hidden' || !$input.is(':visible')) {
      cy.get('@dialogContainer').find('.tab-pane.active #node-radius-variable').click({ force: true });
      cy.contains('li[role="option"]', 'None', { timeout: 10000 }).click({ force: true });
    }
  });
  cy.get('@dialogContainer').find('.tab-pane.active #node-radius', { timeout: 10000 }).should('be.visible');
};

const openLinkSizePanel = (): void => {
  cy.get('@dialogContainer').contains('.nav-link', 'Links').click({ force: true });
  cy.get('@dialogContainer').find('.tab-pane.active')
    .contains('p-accordion-header', 'Shapes and Sizes')
    .click({ force: true });
  cy.get('@dialogContainer').find('.tab-pane.active #link-width').then(($input) => {
    if ($input.css('visibility') === 'hidden' || !$input.is(':visible')) {
      cy.get('@dialogContainer').find('.tab-pane.active #link-width-variable').click({ force: true });
      cy.contains('li[role="option"]', 'None', { timeout: 10000 }).click({ force: true });
    }
  });
  cy.get('@dialogContainer').find('.tab-pane.active #link-width', { timeout: 10000 }).should('be.visible');
};

const expectTransmissionChainSizing = (
  cyInstance: Core,
  expectedNodeSize: number,
  expectedLinkWidth: number,
): void => {
  const node = leafNodes(cyInstance).first() as any;
  const edge = cyInstance.edges(':visible').first() as any;
  const expectedRenderedNodeWidth = (expectedNodeSize / 100 * 40) + 10;

  expect(Number(node.data('nodeSize')), 'node size data').to.equal(expectedNodeSize);
  expect(parseFloat(node.style('width')), 'rendered node width').to.be.closeTo(expectedRenderedNodeWidth, 0.5);
  expect(Number(edge.data('width')), 'link width data').to.equal(expectedLinkWidth);
  expect(parseFloat(edge.style('width')), 'rendered link width').to.be.closeTo(expectedLinkWidth, 0.5);
};

const expectVisibleNodesWithinTimelineAxes = (cyInstance: Core): void => {
  const timelineOverlay = cyInstance.container()?.parentElement
    ?.querySelector('.timeline-axis-overlay:not(.hidden)');
  const baseline = timelineOverlay?.querySelector('.timeline-axis-baseline');
  const axisY = Number(baseline?.getAttribute('y1'));
  const plotBottom = axisY - 8;
  const width = cyInstance.width();

  expect(baseline, 'timeline axis baseline').to.exist;
  expect(Number.isFinite(axisY), 'timeline axis y coordinate').to.equal(true);

  leafNodes(cyInstance).forEach((node) => {
    const bounds = node.renderedBoundingBox({ includeLabels: false, includeOverlays: false });

    expect(bounds.x1, `${node.id()} left edge`).to.be.at.least(0);
    expect(bounds.x2, `${node.id()} right edge`).to.be.at.most(width);
    expect(bounds.y1, `${node.id()} top edge`).to.be.at.least(0);
    expect(bounds.y2, `${node.id()} bottom edge`).to.be.at.most(plotBottom);
  });
};

const getFirstVisibleOrigin = (): Cypress.Chainable<string> =>
  cy.window().then((win: any) => {
    const origins = (win.commonService.getVisibleLinks(true) || [])
      .flatMap((link: any) => Array.isArray(link.origin) ? link.origin : [link.origin])
      .map((origin: any) => String(origin || '').trim())
      .filter(Boolean);

    expect(origins.length, 'visible link origins').to.be.greaterThan(0);
    return origins[0];
  });

describe('Transmission Chain View', () => {
  beforeEach(() => {
    visitAppAndAcceptEula({ skipDemoSession: false, dismissWelcomeOverlay: true });
    goToTransmissionChainView();
    openSettings();
  });

  it('opens as a dedicated view with transmission chain settings', () => {
    cy.get('.lm_tab.lm_active', { timeout: 20000 }).should('contain.text', 'Transmission Chain View');
    cy.get('@dialogContainer').contains('.nav-link', 'Layout').should('exist');
    cy.get('@dialogContainer').contains('.nav-link', 'Grouping').should('not.exist');
    cy.get(`${byTestId(testIds.twodRecalculateLayoutButton)}:visible`).should('not.exist');
    cy.get('@dialogContainer').find('#transmission-chain-date-field').should('exist');
    cy.get('@dialogContainer').find('#transmission-chain-y-axis-field').should('exist');
    cy.get('@dialogContainer').find('#transmission-chain-link-origins').should('exist');
    cy.get('@dialogContainer').find('#transmission-chain-link-origins input[type="checkbox"]').should('have.length.greaterThan', 0);
    cy.get('@dialogContainer').find('#transmission-chain-vertical-spacing').should('exist');
    openDisplayPanel();
    cy.get('@dialogContainer').find('#transmission-chain-line-style').should('contain.text', 'Stepped');
    cy.get('@dialogContainer').find('#transmission-chain-line-style').click({ force: true });
    cy.contains('li[role="option"]', 'Stepped').should('be.visible');
    cy.contains('li[role="option"]', 'Straight').should('be.visible');
    cy.contains('li[role="option"]', 'Curved').should('be.visible');
    cy.contains('li[role="option"]', 'Fan-out Curves').should('be.visible');
    cy.get('body').type('{esc}');
    cy.window().its('commonService.session.style.widgets.transmission-chain-line-style').should('equal', 'Stepped');
    cy.get('@dialogContainer').find('#network-layout-mode').should('not.exist');
    cy.get('@dialogContainer').find('#network-node-collapse-enabled').should('not.exist');
    getTransmissionCy().should((cyInstance) => {
      expect(cyInstance.nodes(':visible').length, 'blank startup nodes').to.equal(0);
      expect(cyInstance.edges(':visible').length, 'blank startup edges').to.equal(0);
    });
    cy.window().its('commonService.visuals.twoD').should('exist');
    cy.window().its('commonService.visuals.transmissionChain').should('exist');
    cy.get('#transmission-chain-cy').should('have.class', 'cytoscape-viewport');
    cy.get('#cy').should('have.class', 'cytoscape-viewport');
  });

  it('arranges dated nodes from left to right and renders the timeline axis', () => {
    selectDateField();

    getTransmissionCy().then((cyInstance) => {
      const datedNodes = leafNodes(cyInstance)
        .toArray()
        .map((node) => ({
          id: node.id(),
          x: node.position('x'),
          time: Date.parse(String(node.data(dateField))),
        }))
        .filter((node) => Number.isFinite(node.time))
        .sort((a, b) => a.time - b.time);

      expect(datedNodes.length, 'dated nodes').to.be.greaterThan(1);
      expect(datedNodes[0].x, `${datedNodes[0].id} should be left of ${datedNodes[datedNodes.length - 1].id}`)
        .to.be.lessThan(datedNodes[datedNodes.length - 1].x);
      const visibleEdges = cyInstance.edges(':visible');
      expect(visibleEdges.length, 'visible chain links').to.be.greaterThan(0);
      expect(visibleEdges.first().style('curve-style'), 'edge routing').to.equal('taxi');
    });
  });

  it('keeps every node within the timeline axes after resizing and changing node size', () => {
    cy.viewport(1000, 500);
    selectDateField();

    getTransmissionCy().should((cyInstance) => {
      expectVisibleNodesWithinTimelineAxes(cyInstance);
    });

    openNodeSizePanel();
    cy.get('@dialogContainer').find('.tab-pane.active #node-radius')
      .invoke('val', 100)
      .trigger('change', { force: true });

    getTransmissionCy().should((cyInstance) => {
      expectVisibleNodesWithinTimelineAxes(cyInstance);
    });
  });

  it('omits nodes without timeline dates and explains why they were excluded', () => {
    cy.window().then((win: any) => {
      const node = win.commonService.getVisibleNodes()[0];
      expect(node, 'node to make undated').to.exist;

      node[dateField] = null;
      node._rawDateValues = {
        ...(node._rawDateValues || {}),
        [dateField]: '',
      };
      cy.wrap(getDataNodeId(node), { log: false }).as('undatedNodeId');
    });

    selectDateField();

    cy.get<string>('@undatedNodeId').then((undatedNodeId) => {
      getTransmissionCy().should((cyInstance) => {
        const excludedNode = cyInstance.getElementById(undatedNodeId);
        expect(
          excludedNode.empty() || excludedNode.hasClass('hidden'),
          `${undatedNodeId} excluded from the timeline`,
        ).to.equal(true);
        const linksToExcludedNode = cyInstance.edges().filter((edge) => (
          edge.source().id() === undatedNodeId || edge.target().id() === undatedNodeId
        ));
        expect(linksToExcludedNode.length, 'links to excluded node')
          .to.equal(0);
      });

      cy.get('.timeline-axis-no-date-label').should('not.exist');
      cy.get(byTestId(testIds.transmissionChainExcludedNodesButton))
        .should('be.visible')
        .invoke('text')
        .then((text) => expect(Number(text.trim()), 'excluded node count').to.be.greaterThan(0));
      cy.get(byTestId(testIds.transmissionChainExcludedNodesButton)).click({ force: true });
      cy.get('.transmission-chain-excluded-nodes-dialog')
        .should('be.visible')
        .and('contain.text', dateField)
        .and('contain.text', undatedNodeId)
        .and('contain.text', 'omitted from Transmission Chain View')
        .then(($dialog) => {
          const mask = $dialog.parent('.p-dialog-mask');
          expect(mask, 'excluded-node dialog mask').to.have.length(1);
          expect(mask.parent()[0]?.tagName, 'dialog overlay is attached to the document body')
            .to.equal('BODY');
        });
    });
  });

  it('keeps rendered clusters in separate vertical bands', () => {
    selectDateField();

    getTransmissionCy().should((cyInstance) => {
      expectSeparatedClusterBands(cyInstance);
    });
  });

  it('uses a selected node field for labeled Y-axis bands', () => {
    selectDateField();

    cy.window().then((win: any) => {
      const component = win.commonService.visuals.transmissionChain;
      component.timelineCompleteFitBoundingBox = leafNodes(component.cy).boundingBox({
        includeLabels: false,
        includeOverlays: false,
      });
      win.commonService.session.style.widgets['timeline-date-field'] = dateField;
    });

    selectYAxisField();

    getTransmissionCy().should((cyInstance) => {
      expectVisibleNodesWithinTimelineAxes(cyInstance);
      const bands = new Map<string, { minY: number; maxY: number }>();
      leafNodes(cyInstance).forEach((node) => {
        const label = String(node.data(yAxisField) ?? '').trim() || `(No ${yAxisField})`;
        const y = node.position('y');
        const band = bands.get(label) ?? { minY: y, maxY: y };
        band.minY = Math.min(band.minY, y);
        band.maxY = Math.max(band.maxY, y);
        bands.set(label, band);
      });

      const orderedBands = Array.from(bands.entries()).sort((a, b) => a[1].minY - b[1].minY);
      expect(orderedBands.length, 'Y-axis bands').to.be.greaterThan(1);
      for (let index = 1; index < orderedBands.length; index++) {
        expect(
          orderedBands[index][1].minY,
          `${orderedBands[index][0]} starts below ${orderedBands[index - 1][0]}`,
        ).to.be.greaterThan(orderedBands[index - 1][1].maxY);
      }
    });

    cy.get('.timeline-y-axis-title').should('contain.text', yAxisField);
    cy.get('.timeline-y-axis-group').should('have.length.greaterThan', 1);
    cy.get('.timeline-y-axis-label').then(($labels) => {
      const labels = [...$labels].map((label) => label.textContent?.trim()).filter(Boolean);
      expect(labels, 'rendered Y-axis labels').to.include('Texas');
      expect(
        [...$labels].map((label) => Number(label.getAttribute('x'))),
        'Y-axis labels remain left-aligned',
      ).to.satisfy((positions: number[]) => positions.every((position) => position === 30));

      const firstLabel = $labels.get(0).getBoundingClientRect();
      const toolbar = Cypress.$(byTestId(testIds.transmissionChainSettingsButton))
        .closest('#tool-btn-container')
        .get(0)
        .getBoundingClientRect();
      expect(firstLabel.top, 'first Y-axis label starts below the toolbar')
        .to.be.greaterThan(toolbar.bottom);
    });
  });

  it('keeps dragged nodes inside their selected categorical Y-axis band', () => {
    selectDateField();
    selectYAxisField();

    cy.window().then((win: any) => {
      const component = win.commonService.visuals.transmissionChain;
      const groups = component.timelineLayoutMetadata.yAxisGroups;
      const groupIndex = groups.findIndex((group: any) => group.label === 'Texas');
      const group = groups[groupIndex];
      const node = leafNodes(component.cy)
        .filter((candidate) => String(candidate.data(yAxisField)) === group.label)
        .first();
      const nodeHalfHeight = node.outerHeight() / 2;
      const timelineX = Number(node.data('timelineX'));

      expect(group, 'Texas Y-axis band').to.exist;
      expect(node.empty(), 'Texas node').to.equal(false);
      node.position({ x: timelineX + 500, y: groups[0].centerY });

      expect(node.position('x'), 'node remains locked to its timeline date').to.equal(timelineX);
      expect(node.position('y'), 'node remains inside its categorical band')
        .to.be.within(group.boundaryMinY + nodeHalfHeight, group.boundaryMaxY - nodeHalfHeight);
      expect(node.position('y'), 'node does not enter the first category band')
        .to.not.equal(groups[0].centerY);

      const zoom = component.cy.zoom();
      const panY = component.cy.pan().y;
      const band = Cypress.$(`.timeline-y-axis-group[data-y-axis-value="${group.label}"]`);
      const startLineY = Number(band.find('.timeline-y-axis-boundary-start').attr('y1'));
      const expectedStartLineY = (group.boundaryMinY * zoom) + panY;

      expect(startLineY, 'category indicator matches the movement boundary')
        .to.be.closeTo(expectedStartLineY, 0.5);
    });
  });

  it('renders node and link tooltips in the Transmission Chain View instance', () => {
    selectDateField();

    cy.window().then((win: any) => {
      const component = win.commonService.visuals.transmissionChain;
      const node = leafNodes(component.cy).first();

      component.widgets['node-tooltip-variable'] = ['_id'];
      component.showNodeTooltip(
        component.getFullNodeDataForCyNode(node),
        { clientX: 120, clientY: 120 },
      );
      cy.wrap(node.id(), { log: false }).as('tooltipNodeId');
    });

    cy.get<string>('@tooltipNodeId').then((nodeId) => {
      cy.get('#transmission-chain-tooltip')
        .should('have.css', 'z-index', '1000')
        .and('contain.text', nodeId);
      cy.get('#tooltip').should('not.contain.text', nodeId);
    });

    cy.window().then((win: any) => {
      const component = win.commonService.visuals.transmissionChain;
      const edge = component.cy.edges(':visible').first();

      component.SelectedLinkTooltipVariable = ['source_id', 'target_id'];
      component.showLinkTooltip(edge.data(), { clientX: 300, clientY: 300 });
      cy.wrap(String(edge.data('source')), { log: false }).as('tooltipSourceId');
      cy.wrap(String(edge.data('target')), { log: false }).as('tooltipTargetId');
    });

    cy.get<string>('@tooltipSourceId').then((sourceId) => {
      cy.get('#transmission-chain-tooltip').should('contain.text', sourceId);
      cy.get('#tooltip').should('not.contain.text', sourceId);
    });
    cy.get<string>('@tooltipTargetId').then((targetId) => {
      cy.get('#transmission-chain-tooltip').should('contain.text', targetId);
    });
  });

  it('uses the Length slider to change categorical timeline spacing', () => {
    let initialSpan = 0;

    selectDateField();
    selectYAxisField();
    getTransmissionCy().then((cyInstance) => {
      const positions = leafNodes(cyInstance).map((node) => node.position('y'));
      initialSpan = Math.max(...positions) - Math.min(...positions);
    });

    openLinkSizePanel();
    cy.get('@dialogContainer').find('#link-length')
      .invoke('val', 95)
      .trigger('input', { force: true })
      .trigger('change', { force: true });
    cy.window().its('commonService.session.style.widgets.link-length').should('equal', 95);

    getTransmissionCy().should((cyInstance) => {
      const positions = leafNodes(cyInstance).map((node) => node.position('y'));
      const updatedSpan = Math.max(...positions) - Math.min(...positions);

      expect(updatedSpan, 'timeline vertical span after increasing link length')
        .to.be.greaterThan(initialSpan);
    });
  });

  it('shows bidirectional arrows on links marked bidirectional', () => {
    selectDateField();
    openLinkSizePanel();

    cy.get('@dialogContainer').find('#link-bidirectional-row').should('not.be.visible');
    cy.get('@dialogContainer').find('#link-directed-undirected').contains('Show').click({ force: true });
    cy.get('@dialogContainer').find('#link-bidirectional-row').should('be.visible');
    cy.get('@dialogContainer').find('#link-bidirectional').contains('Show').click({ force: true });
    cy.window().its('commonService.session.style.widgets.link-directed').should('equal', true);
    cy.window().its('commonService.session.style.widgets.link-bidirectional').should('equal', true);

    getTransmissionCy().should((cyInstance) => {
      const bidirectionalEdges = cyInstance.edges(':visible')
        .filter((edge) => Boolean(edge.data('bidirectional')));

      expect(bidirectionalEdges.length, 'links marked bidirectional').to.be.greaterThan(0);
      bidirectionalEdges.forEach((edge) => {
        expect(edge.style('target-arrow-shape'), `${edge.id()} target arrow`).to.equal('triangle');
        expect(edge.style('source-arrow-shape'), `${edge.id()} source arrow`).to.equal('triangle');
      });
    });
  });

  it('centers the current Y-axis layout instead of a stale timeline fit', () => {
    selectDateField();
    selectYAxisField();

    cy.window().then((win: any) => {
      const component = win.commonService.visuals.transmissionChain;
      const bounds = leafNodes(component.cy).boundingBox({
        includeLabels: false,
        includeOverlays: false,
      });
      const centerY = (bounds.y1 + bounds.y2) / 2;

      component.timelineCompleteFitBoundingBox = {
        x1: bounds.x1,
        x2: bounds.x2,
        y1: centerY - (bounds.h / 4),
        y2: centerY + (bounds.h / 4),
      };
      component.cy.viewport({ zoom: 0.75, pan: { x: 0, y: 0 } });
    });

    cy.get(byTestId(testIds.transmissionChainCenterButton)).click({ force: true });

    cy.window().should((win: any) => {
      expect(
        win.commonService.visuals.transmissionChain.timelineCompleteFitBoundingBox,
        'stale timeline fit bounds',
      ).to.equal(null);
    });
    getTransmissionCy().should((cyInstance) => {
      expectVisibleNodesWithinTimelineAxes(cyInstance);
    });
  });

  it('routes stepped links as source-stem paths', () => {
    selectDateField();

    getTransmissionCy().should((cyInstance) => {
      const visibleEdges = cyInstance.edges(':visible');

      expect(visibleEdges.length, 'visible chain links').to.be.greaterThan(0);
      visibleEdges.forEach((edge) => {
        expect(edge.style('curve-style'), `${edge.id()} curve style`).to.equal('taxi');
        expect(edge.style('taxi-direction'), `${edge.id()} taxi direction`).to.equal('vertical');
        expect(edge.data('transmissionChainTaxiTurn'), `${edge.id()} taxi turn`).to.equal('0px');
      });
    });
  });

  it('renders the curved line style with manual curve offsets', () => {
    selectDateField();
    selectLineStyle('Curved', 'Curved');

    getTransmissionCy().should((cyInstance) => {
      const visibleEdges = cyInstance.edges(':visible');
      const firstEdge = visibleEdges.first() as any;

      expect(visibleEdges.length, 'visible chain links').to.be.greaterThan(0);
      expect(firstEdge.style('curve-style'), 'curved edge routing').to.equal('unbundled-bezier');
      expect(Math.abs(Number(firstEdge.data('transmissionChainCurveDistance'))), 'curved chain link distance')
        .to.be.greaterThan(0);
    });
  });

  it('preserves node size and link width when changing line style', () => {
    const nodeSize = 75;
    const linkWidth = 15;

    selectDateField();
    openNodeSizePanel();
    cy.get('@dialogContainer').find('.tab-pane.active #node-radius')
      .invoke('val', nodeSize)
      .trigger('change', { force: true });
    cy.window().its('commonService.session.style.widgets.node-radius').should('equal', nodeSize);

    openLinkSizePanel();
    cy.get('@dialogContainer').find('.tab-pane.active #link-width')
      .invoke('val', linkWidth)
      .trigger('change', { force: true });
    cy.window().its('commonService.session.style.widgets.link-width').should('equal', linkWidth);

    getTransmissionCy().should((cyInstance) => {
      expect(cyInstance.edges(':visible').length, 'visible chain links').to.be.greaterThan(0);
      expectTransmissionChainSizing(cyInstance, nodeSize, linkWidth);
    });

    selectLineStyle('Curved', 'Curved');

    getTransmissionCy().should((cyInstance) => {
      const firstEdge = cyInstance.edges(':visible').first() as any;

      expect(firstEdge.style('curve-style'), 'curved edge routing').to.equal('unbundled-bezier');
      expectTransmissionChainSizing(cyInstance, nodeSize, linkWidth);
    });
  });

  it('fans out shared-endpoint chain links', () => {
    selectDateField();
    selectLineStyle('Fan-out Curves', 'Fanout');

    const syntheticOrigin = 'Synthetic Fanout Links';
    cy.window().then((win: any) => {
      const datedNodes = win.commonService.session.data.nodes
        .filter((node: any) => getDataNodeId(node) && Number.isFinite(Date.parse(String(node[dateField]))));

      expect(datedNodes.length, 'dated source and targets for fanout links').to.be.greaterThan(2);
      const [sourceNode, firstTargetNode, secondTargetNode] = datedNodes;
      const source = getDataNodeId(sourceNode);
      const firstTarget = getDataNodeId(firstTargetNode);
      const secondTarget = getDataNodeId(secondTargetNode);

      win.commonService.session.data.links.push(
        {
          id: 'transmission-chain-fanout-a',
          source,
          target: firstTarget,
          origin: [syntheticOrigin],
          visible: true,
          distance: 0,
        },
        {
          id: 'transmission-chain-fanout-b',
          source,
          target: secondTarget,
          origin: [syntheticOrigin],
          visible: true,
          distance: 0,
        },
      );
      win.commonService.visuals.transmissionChain.onTransmissionChainLinkOriginsChange([syntheticOrigin]);
    });

    getTransmissionCy().should((cyInstance) => {
      const fannedEdges = cyInstance.edges(':visible')
        .filter((edge) => String(edge.id()).startsWith('transmission-chain-fanout-'));
      const distances = fannedEdges.toArray()
        .map((edge) => Number(edge.data('transmissionChainCurveDistance')));

      expect(fannedEdges.length, 'synthetic fanout edges').to.equal(2);
      expect(distances.every((distance) => Math.abs(distance) > 0), 'nonzero fanout distances').to.equal(true);
      expect(new Set(distances).size, 'distinct fanout distances').to.be.greaterThan(1);
      fannedEdges.forEach((edge) => {
        expect(edge.style('curve-style'), `${edge.id()} routing`).to.equal('unbundled-bezier');
        expect(edge.data('transmissionChainFanoutGroupSize'), `${edge.id()} fanout group size`).to.equal(2);
      });
    });
  });

  it('uses selected link lists for rendered chain links', () => {
    selectDateField();

    getFirstVisibleOrigin().then((origin) => {
      let expectedRenderedEdges = 0;
      getTransmissionCy().then((cyInstance) => {
        const renderedNodeIds = new Set(cyInstance.nodes(':visible').map((node) => node.id()));

        cy.window().then((win: any) => {
          expectedRenderedEdges = win.commonService.getVisibleLinks(true)
            .filter((link: any) => (
              renderedNodeIds.has(String(link.source))
              && renderedNodeIds.has(String(link.target))
              && (Array.isArray(link.origin) ? link.origin : [link.origin])
                .some((linkOrigin: any) => String(linkOrigin || '').trim() === origin)
            ))
            .reduce((count: number, link: any) => {
              const origins = Array.isArray(link.origin) ? link.origin : [link.origin];
              return count + Math.max(1, origins.filter(Boolean).length);
            }, 0);

          win.commonService.visuals.transmissionChain.onTransmissionChainLinkOriginsChange([origin]);
        });
      });

      getTransmissionCy().should((cyInstance) => {
        expect(cyInstance.edges(':visible').length, `visible rendered edges for ${origin}`)
          .to.equal(expectedRenderedEdges);
      });
    });
  });

  it('renders nodes with no edges when all link lists are cleared', () => {
    selectDateField();

    cy.window().then((win: any) => {
      win.commonService.visuals.transmissionChain.onTransmissionChainLinkOriginsChange([]);
    });

    getTransmissionCy().should((cyInstance) => {
      expect(leafNodes(cyInstance).length, 'nodes remain visible').to.be.greaterThan(0);
      expect(cyInstance.edges(':visible').length, 'visible links').to.equal(0);
    });
  });

  it('renders a selected multi-origin link as a solid-and-dashed duo-link', () => {
    selectDateField();

    const syntheticOrigin = 'Synthetic Transmission Origin';
    getTransmissionCy().then((cyInstance) => {
      const renderedLink = cyInstance.edges(':visible').first();
      const source = String(renderedLink.data('source'));
      const target = String(renderedLink.data('target'));

      cy.window().then((win: any) => {
        const link = win.commonService.session.data.links.find((candidate: any) => (
          String(candidate.source) === source && String(candidate.target) === target
        ));
        expect(link, 'rendered link for synthetic origin').to.exist;
        const originalOrigin = String(
          (Array.isArray(link.origin) ? link.origin : [link.origin]).find(Boolean),
        );
        link.origin = [originalOrigin, syntheticOrigin];
        win.commonService.visuals.transmissionChain.onTransmissionChainLinkOriginsChange([syntheticOrigin]);
      });
    });

    getTransmissionCy().should((cyInstance) => {
      const duoEdges = cyInstance.edges(':visible').toArray();

      expect(duoEdges.length, 'rendered halves of the selected duo-link').to.equal(2);
      expect(
        duoEdges.filter((edge) => Boolean(edge.data('secondLink'))).length,
        'dashed overlay edge',
      ).to.equal(1);
      expect(
        duoEdges.map((edge) => edge.style('line-style')).sort(),
        'solid and dashed origin styles',
      ).to.deep.equal(['dashed', 'solid']);
      expect(
        duoEdges.flatMap((edge) => edge.data('origin')).sort(),
        'both link origins retained',
      ).to.include(syntheticOrigin);
    });
  });
});

describe('Transmission Chain example fixture layout', () => {
  beforeEach(() => {
    visitAppAndAcceptEula();
    cy.loadFiles([
      { name: 'TransmissionChainExampleNodes.csv', datatype: 'node' },
      { name: 'TransmissionChainExampleLinks.csv', datatype: 'link', field1: 'source', field2: 'target' },
    ]);
    launchAndWaitForProcessing(60000);
    goToTransmissionChainView();
    openSettings();
  });

  it('renders display clusters as separated source-stem chains', () => {
    selectDateField();

    getTransmissionCy().should((cyInstance) => {
      const nodes = leafNodes(cyInstance);
      const visibleEdges = cyInstance.edges(':visible');
      const bands = collectClusterBands(cyInstance);

      expect(nodes.length, 'example nodes').to.equal(47);
      expect(visibleEdges.length, 'example transmission links').to.equal(39);
      expect(bands.map(([cluster]) => cluster).sort(), 'display clusters').to.deep.equal([
        'cl_1',
        'cl_2',
        'cl_3',
        'cl_4',
        'cl_5',
        'cl_6',
        'cl_7',
        'cl_8',
      ]);
      expectSeparatedClusterBands(cyInstance, 24);

      visibleEdges.forEach((edge) => {
        expect(edge.style('curve-style'), `${edge.id()} curve style`).to.equal('taxi');
        expect(edge.style('taxi-direction'), `${edge.id()} taxi direction`).to.equal('vertical');
        expect(edge.data('transmissionChainTaxiTurn'), `${edge.id()} taxi turn`).to.equal('0px');
      });
    });
  });
});

describe('Transmission Chain legacy migration', () => {
  it('migrates legacy 2D timeline sessions to Transmission Chain View', () => {
    visitAppAndAcceptEula({ skipDemoSession: false, dismissWelcomeOverlay: true });

    cy.window().then((win: any) => {
      const legacySession = JSON.parse(JSON.stringify(win.commonService.session));
      legacySession.style.widgets['default-view'] = '2D Network';
      legacySession.style.widgets['network-layout-mode'] = 'Timeline';
      legacySession.style.widgets['network-timeline-date-field'] = dateField;
      legacySession.style.widgets['network-timeline-vertical-spacing'] = 180;
      legacySession.layout = {
        type: 'stack',
        content: [{ type: '2D Network' }],
      };

      win.commonService['migrateLegacyTimelineLayoutSession'](legacySession);

      expect(legacySession.style.widgets['default-view']).to.equal('Transmission Chain View');
      expect(legacySession.style.widgets['network-layout-mode']).to.equal('Force Directed');
      expect(legacySession.style.widgets['transmission-chain-date-field']).to.equal(dateField);
      expect(legacySession.style.widgets['transmission-chain-y-axis-field']).to.equal('None');
      expect(legacySession.style.widgets['transmission-chain-vertical-spacing']).to.equal(180);
      expect(legacySession.layout.content[0].type).to.equal('Transmission Chain View');
    });
  });
});
