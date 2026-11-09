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
    const isAlreadyOpen = $body.find('.p-dialog-title:contains("Transmission Chain Explorer Settings"):visible').length > 0;
    if (!isAlreadyOpen) {
      cy.get(byTestId(testIds.transmissionChainSettingsButton), { timeout: 15000 }).click({ force: true });
    }

    cy.contains('.p-dialog-title', 'Transmission Chain Explorer Settings', { timeout: 15000 })
      .should('be.visible')
      .parents('.p-dialog')
      .as('dialogContainer');
  });
};

const selectDateField = (): void => {
  cy.get('@dialogContainer').contains('.nav-link', 'Layout').click({ force: true });
  cy.get('@dialogContainer').find('#transmission-chain-date-field', { timeout: 10000 }).click({ force: true });
  cy.get('.p-select-overlay:visible', { timeout: 10000 })
    .last()
    .find('.p-select-option')
    .filter((_index, option) => String(option.textContent || '').trim() === dateField)
    .should('have.length', 1)
    .click({ force: true });
  cy.get('.p-select-overlay:visible').should('not.exist');
  cy.window().its('commonService.visuals.transmissionChain.widgets.transmission-chain-date-field').should('equal', dateField);
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
  cy.window().its('commonService.visuals.transmissionChain.widgets.transmission-chain-y-axis-field').should('equal', yAxisField);
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
  cy.window().its('commonService.visuals.transmissionChain.widgets.transmission-chain-line-style').should('equal', value);
};

const openNodeSizePanel = (): void => {
  cy.get('@dialogContainer').contains('.nav-link', 'Nodes').click({ force: true });
  cy.get('@dialogContainer').find('.tab-pane.active')
    .contains('p-accordion-header', 'Shapes and Sizes')
    .click({ force: true });
  cy.get('@dialogContainer').find('.tab-pane.active #transmission-chain-node-radius').then(($input) => {
    if ($input.css('visibility') === 'hidden' || !$input.is(':visible')) {
      cy.get('@dialogContainer').find('.tab-pane.active #transmission-chain-node-radius-variable').click({ force: true });
      cy.get('.p-select-overlay:visible', { timeout: 10000 })
        .last()
        .find('.p-select-option')
        .filter((_index, option) => String(option.textContent || '').trim() === 'None')
        .should('have.length', 1)
        .click({ force: true });
    }
  });
  cy.get('.p-select-overlay:visible').should('not.exist');
  cy.get('@dialogContainer').find('.tab-pane.active #transmission-chain-node-radius', { timeout: 10000 }).should('be.visible');
};

const openLinkSizePanel = (): void => {
  cy.get('@dialogContainer').contains('.nav-link', 'Links').click({ force: true });
  cy.get('@dialogContainer').find('.tab-pane.active')
    .contains('p-accordion-header', 'Shapes and Sizes')
    .click({ force: true });
  cy.get('@dialogContainer').find('.tab-pane.active #transmission-chain-link-width').then(($input) => {
    if ($input.css('visibility') === 'hidden' || !$input.is(':visible')) {
      cy.get('@dialogContainer').find('.tab-pane.active #transmission-chain-link-width-variable').click({ force: true });
      cy.get('.p-select-overlay:visible', { timeout: 10000 })
        .last()
        .find('.p-select-option')
        .filter((_index, option) => String(option.textContent || '').trim() === 'None')
        .should('have.length', 1)
        .click({ force: true });
    }
  });
  cy.get('.p-select-overlay:visible').should('not.exist');
  cy.get('@dialogContainer').find('.tab-pane.active #transmission-chain-link-width', { timeout: 10000 }).should('be.visible');
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

const getTimelinePlotArea = (cyInstance: Core) => {
  const timelineOverlay = cyInstance.container()?.parentElement
    ?.querySelector('.timeline-axis-overlay:not(.hidden)');
  const baseline = timelineOverlay?.querySelector('.timeline-axis-baseline');
  const axisY = Number(baseline?.getAttribute('y1'));
  expect(baseline, 'timeline axis baseline').to.exist;
  expect(Number.isFinite(axisY), 'timeline axis y coordinate').to.equal(true);
  const insets = (cyInstance.container()?.style.clipPath.match(/[\d.]+(?=px)/g) ?? []).map(Number);
  expect(insets, 'network is clipped to its drawing area').to.have.length(4);
  const [top, right, bottom, left] = insets;
  const container = cyInstance.container()!;
  const toolbar = container.ownerDocument.getElementById('transmission-chain-tool-btn-container')!;
  const drawingTop = container.getBoundingClientRect().top + top;
  for (const element of [toolbar, ...Array.from(toolbar.querySelectorAll('.btn-icon'))]) {
    expect(drawingTop, 'drawing area stays below the whole toolbar row')
      .to.be.greaterThan(element.getBoundingClientRect().bottom);
  }
  const x2 = cyInstance.width() - right;
  const y2 = cyInstance.height() - bottom;
  expect(y2, 'drawing area stays above the date axis').to.be.lessThan(axisY);
  return { x1: left, y1: top, x2, y2, width: x2 - left, height: y2 - top };
};

const expectVisibleNodesWithinTimelineAxes = (cyInstance: Core): void => {
  const area = getTimelinePlotArea(cyInstance);

  leafNodes(cyInstance).forEach((node) => {
    const bounds = node.renderedBoundingBox({ includeLabels: false, includeOverlays: false });

    expect(bounds.x1, `${node.id()} left edge`).to.be.at.least(area.x1 - 0.5);
    expect(bounds.x2, `${node.id()} right edge`).to.be.at.most(area.x2 + 0.5);
    expect(bounds.y1, `${node.id()} top edge`).to.be.at.least(area.y1 - 0.5);
    expect(bounds.y2, `${node.id()} bottom edge`).to.be.at.most(area.y2 + 0.5);
  });
};

const expectVisiblePlotWithinTimelineAxes = (cyInstance: Core): void => {
  const area = getTimelinePlotArea(cyInstance);
  const plotElements = cyInstance.elements(':visible').filter((element) => !element.hasClass('hidden'));
  const bounds = plotElements.renderedBoundingBox({ includeLabels: true, includeOverlays: false });

  expect(bounds.x1, 'plot left edge').to.be.at.least(area.x1 - 0.5);
  expect(bounds.x2, 'plot right edge').to.be.at.most(area.x2 + 0.5);
  expect(bounds.y1, 'plot top edge').to.be.at.least(area.y1 - 0.5);
  expect(bounds.y2, 'plot bottom edge').to.be.at.most(area.y2 + 0.5);
};

const expectVisiblePlotFillsTimelineAxes = (cyInstance: Core): void => {
  const area = getTimelinePlotArea(cyInstance);
  const plotElements = cyInstance.elements(':visible').filter((element) => !element.hasClass('hidden'));
  const bounds = plotElements.renderedBoundingBox({ includeLabels: true, includeOverlays: false });

  expect(bounds.w / area.width, 'plot uses about 90% of the width between the axes')
    .to.be.closeTo(0.9, 0.02);
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

describe('Transmission Chain Explorer', () => {
  beforeEach(() => {
    visitAppAndAcceptEula({ skipDemoSession: false, dismissWelcomeOverlay: true });
    goToTransmissionChainView();
    openSettings();
  });

  it('opens as a dedicated view with transmission chain settings', () => {
    cy.get('.lm_tab.lm_active', { timeout: 20000 }).should('contain.text', 'Transmission Chain Explorer');
    cy.get('#transmission-chain-network-statistics-wrapper').should('not.exist');
    cy.get('#transmission-chain-tool-btn-container')
      .should('have.css', 'top', '15px')
      .and('have.css', 'left', '15px');
    cy.get('@dialogContainer').should($dialog => expect($dialog[0].getBoundingClientRect().width, 'compact settings width').to.be.at.most(450));
    cy.get('@dialogContainer').find('#transmission-chain-link-length').should('not.exist');
    cy.get('@dialogContainer').find('[role="tablist"] > .nav-item > .nav-link').should(($tabs) => {
      expect($tabs.toArray().map((tab) => String(tab.textContent || '').trim()), 'settings tab order')
        .to.deep.equal(['Layout', 'Nodes', 'Links', 'Network']);
    });
    cy.get('@dialogContainer').contains('.nav-link', 'Layout').should('exist');
    cy.get('@dialogContainer').contains('.nav-link', 'Grouping').should('not.exist');
    cy.get(`${byTestId(testIds.twodRecalculateLayoutButton)}:visible`).should('not.exist');
    cy.get('@dialogContainer').find('#transmission-chain-date-field').should('exist');
    cy.get('@dialogContainer').find('#transmission-chain-y-axis-field').should('exist');
    cy.get('@dialogContainer').find('#transmission-chain-axis-label-size')
      .should('have.attr', 'min', '10')
      .and('have.attr', 'max', '32');
    cy.get('@dialogContainer').find('#transmission-chain-axis-label-size').then($slider => {
      const linkLists = $slider.closest('.tab-pane').find('#transmission-chain-link-origins')[0];
      expect(linkLists.compareDocumentPosition($slider[0]) & Node.DOCUMENT_POSITION_FOLLOWING,
        'axis label slider follows Link Lists').not.to.equal(0);
    });
    cy.get('@dialogContainer').find('#transmission-chain-link-origins').should('exist');
    cy.get('@dialogContainer').find('#transmission-chain-link-origins input[type="checkbox"]').should('have.length.greaterThan', 0);
    cy.get('@dialogContainer').find('#transmission-chain-vertical-spacing').should('not.exist');
    openDisplayPanel();
    cy.get('@dialogContainer').find('#transmission-chain-line-style').should('contain.text', 'Stepped');
    cy.get('@dialogContainer').find('#transmission-chain-line-style').click({ force: true });
    cy.contains('li[role="option"]', 'Stepped').should('be.visible');
    cy.contains('li[role="option"]', 'Straight').should('be.visible');
    cy.contains('li[role="option"]', 'Curved').should('be.visible');
    cy.contains('li[role="option"]', 'Fan-out Curves').should('be.visible');
    cy.get('body').type('{esc}');
    cy.window().its('commonService.visuals.transmissionChain.widgets.transmission-chain-line-style').should('equal', 'Stepped');
    cy.get('@dialogContainer').find('#transmission-chain-network-node-collapse-enabled').should('not.exist');
    getTransmissionCy().should((cyInstance) => {
      expect(cyInstance.nodes(':visible').length, 'blank startup nodes').to.equal(0);
      expect(cyInstance.edges(':visible').length, 'blank startup edges').to.equal(0);
    });
    cy.window().its('commonService.visuals.twoD').should('exist');
    cy.window().its('commonService.visuals.transmissionChain').should('exist');
    cy.get('#transmission-chain-cy').should('have.class', 'cytoscape-viewport');
    cy.get('#cy, #sigma-network').should('exist');
    cy.get('@dialogContainer').contains('.nav-link', 'Layout').click({ force: true });
    cy.screenshot('explorer-compact-settings-toolbar', { capture: 'runner', disableTimersAndAnimations: false });
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

  it('uses larger view-specific defaults for nodes and links', () => {
    selectDateField();

    cy.window().then((win: any) => {
      const widgets = win.commonService.session.style.widgets;
      const chainWidgets = win.commonService.visuals.transmissionChain.widgets;

      expect(chainWidgets['transmission-chain-node-radius'], 'transmission chain node size').to.equal(50);
      expect(chainWidgets['transmission-chain-link-width'], 'transmission chain link width').to.equal(12);
      expect(chainWidgets['link-tooltip-variable'], 'link tooltips default to None').to.deep.equal([]);
      expect(widgets['node-radius'], '2D Network node size').to.equal(20);
      expect(widgets['link-width'], '2D Network link width').to.equal(3);
    });

    getTransmissionCy().then((cyInstance) => {
      expect(cyInstance.edges(':visible').length, 'visible chain links').to.be.greaterThan(0);
      expectTransmissionChainSizing(cyInstance, 50, 12);
    });
  });

  it('centers the first date layout and keeps its separated chains stable on Center Screen', () => {
    cy.viewport(1000, 500);
    selectDateField();

    getTransmissionCy().then((cyInstance) => {
      expectSeparatedClusterBands(cyInstance);
      expectVisiblePlotWithinTimelineAxes(cyInstance);
      expectVisiblePlotFillsTimelineAxes(cyInstance);
      const positions = leafNodes(cyInstance).map((currentNode) => ({
        id: currentNode.id(),
        x: currentNode.position('x'),
        y: currentNode.position('y'),
      }));
      cy.wrap(positions, { log: false }).as('initialCenteredPositions');
      cy.wrap(cyInstance.zoom(), { log: false }).as('initialCenteredZoom');
    });

    cy.window().then((win: any) => {
      win.commonService.visuals.transmissionChain.cy.viewport(win.JSON.parse(JSON.stringify({
        zoom: 1.5,
        pan: { x: 0, y: 0 },
      })));
    });

    cy.get(byTestId(testIds.transmissionChainCenterButton)).click({ force: true });

    cy.get<Array<{ id: string; x: number; y: number }>>('@initialCenteredPositions').then((initialPositions) => {
      cy.get<number>('@initialCenteredZoom').then((initialZoom) => {
        getTransmissionCy().then((cyInstance) => {
          const initialPositionById = new Map(initialPositions.map((position) => [position.id, position]));
          const centeredPositions = leafNodes(cyInstance).map((node) => ({
            id: node.id(),
            x: node.position('x'),
            y: node.position('y'),
          }));
          centeredPositions.forEach((position) => {
            const initial = initialPositionById.get(position.id)!;
            expect(position.x, `${position.id} timeline x`).to.be.closeTo(initial.x, 0.01);
            expect(position.y, `${position.id} initial centered y`).to.be.closeTo(initial.y, 0.01);
          });
          expect(cyInstance.zoom(), 'initial date selection already fits the plot').to.be.closeTo(initialZoom, 0.0001);
          expectSeparatedClusterBands(cyInstance);
          expectVisiblePlotWithinTimelineAxes(cyInstance);
          expectVisiblePlotFillsTimelineAxes(cyInstance);

          cy.wrap(centeredPositions, { log: false }).as('centeredPositions');
          cy.wrap(cyInstance.zoom(), { log: false }).as('centeredZoom');
        });
      });
    });

    cy.get(byTestId(testIds.transmissionChainCenterButton)).click({ force: true });
    cy.get<Array<{ id: string; x: number; y: number }>>('@centeredPositions').then((centeredPositions) => {
      cy.get<number>('@centeredZoom').then((centeredZoom) => {
        getTransmissionCy().should((cyInstance) => {
          const repeatedPositions = new Map(
            leafNodes(cyInstance).map((node) => [node.id(), node.position()]),
          );

          centeredPositions.forEach((position) => {
            const repeatedPosition = repeatedPositions.get(position.id)!;
            expect(repeatedPosition.x, `${position.id} repeated x`).to.be.closeTo(position.x, 0.01);
            expect(repeatedPosition.y, `${position.id} repeated y`).to.be.closeTo(position.y, 0.01);
          });
          expect(cyInstance.zoom(), 'repeated Center Screen zoom').to.be.closeTo(centeredZoom, 0.0001);
          expectVisiblePlotWithinTimelineAxes(cyInstance);
          expectVisiblePlotFillsTimelineAxes(cyInstance);
        });
      });
    });
  });

  it('refits chains when the viewport or only the drawing container changes size', () => {
    cy.viewport(1200, 700);
    selectDateField();
    selectYAxisField();
    cy.closeSettingsPane('Transmission Chain Explorer Settings');
    let graph: Core;
    let originalWidth = 0;
    let originalHeight = 0;
    let originalCount = 0;
    getTransmissionCy().then(cyInstance => {
      graph = cyInstance;
      originalWidth = cyInstance.width();
      originalHeight = cyInstance.height();
      originalCount = leafNodes(cyInstance).length;
    });

    cy.viewport(850, 500);
    getTransmissionCy().should(cyInstance => {
      expect(cyInstance, 'resize retains the renderer').to.equal(graph);
      expect(cyInstance.width(), 'narrower viewport').to.be.lessThan(originalWidth - 100);
      expect(cyInstance.height(), 'shorter viewport').to.be.lessThan(originalHeight - 100);
      expect(leafNodes(cyInstance).length, 'all dated nodes remain visible').to.equal(originalCount);
      expectVisiblePlotWithinTimelineAxes(cyInstance);
      expectVisiblePlotFillsTimelineAxes(cyInstance);
    });

    cy.viewport(1200, 900);
    getTransmissionCy().should(cyInstance => {
      expect(cyInstance.height(), 'taller viewport').to.be.greaterThan(originalHeight + 100);
      expectVisiblePlotWithinTimelineAxes(cyInstance);
      expectVisiblePlotFillsTimelineAxes(cyInstance);
    });

    // Dashboard panes can change the available drawing width independently of
    // the browser window. Exercise that ResizeObserver path without a reload.
    cy.get('#transmission-chain-cy').parent().invoke('css', 'width', '70%');
    getTransmissionCy().should(cyInstance => {
      expect(cyInstance.width(), 'container-only width change').to.be.lessThan(originalWidth * 0.8);
      expect(leafNodes(cyInstance).length).to.equal(originalCount);
      expectVisiblePlotWithinTimelineAxes(cyInstance);
      expectVisiblePlotFillsTimelineAxes(cyInstance);
    });

    cy.get('#transmission-chain-cy').parent().invoke('css', 'width', '100%');
    cy.viewport(1200, 700);
    getTransmissionCy().should(cyInstance => {
      expect(cyInstance.width(), 'original pane width restored').to.be.closeTo(originalWidth, 1);
      expect(cyInstance.height(), 'original pane height restored').to.be.closeTo(originalHeight, 1);
      expectVisiblePlotWithinTimelineAxes(cyInstance);
      expectVisiblePlotFillsTimelineAxes(cyInstance);
    });
  });

  it('keeps every node within the timeline axes after changing node size', () => {
    cy.viewport(1000, 500);
    selectDateField();

    openNodeSizePanel();
    cy.get('@dialogContainer').find('.tab-pane.active #transmission-chain-node-radius')
      .invoke('val', 100)
      .trigger('change', { force: true });
    cy.get(byTestId(testIds.transmissionChainCenterButton)).click({ force: true });

    getTransmissionCy().should((cyInstance) => {
      expectVisiblePlotWithinTimelineAxes(cyInstance);
    });
  });

  it('preserves a zoomed camera and node positions when changing sizes and borders', () => {
    selectDateField();
    openNodeSizePanel();
    let before: any;
    cy.window().then((win: any) => {
      const component = win.commonService.visuals.transmissionChain;
      const camera = component.getRendererViewState();
      component.setRendererViewState({
        ...camera, centerX: camera.centerX + 100, graphUnitsPerPixel: camera.graphUnitsPerPixel / 3,
      });
      before = {
        camera: component.getRendererViewState(),
        positions: leafNodes(component.cy).map(node => ({ id: node.id(), ...node.position() })),
      };
    });
    const expectUnchangedViewport = (): void => {
      cy.window().should((win: any) => {
        const component = win.commonService.visuals.transmissionChain;
        expect(component.getRendererViewState(), 'zoom and pan are preserved').to.deep.equal(before.camera);
        expect(leafNodes(component.cy).map(node => ({ id: node.id(), ...node.position() })), 'nodes retain their positions')
          .to.deep.equal(before.positions);
      });
    };
    cy.get('#transmission-chain-node-radius').invoke('val', 100)
      .trigger('input', { force: true }).trigger('change', { force: true });
    getTransmissionCy().should(graph => expect(leafNodes(graph).first().width(), 'node size changes').to.equal(50));
    expectUnchangedViewport();
    cy.get('#transmission-chain-node-border-width').clear().type('5');
    getTransmissionCy().should(graph => expect(parseFloat(leafNodes(graph).first().style('border-width'))).to.equal(5));
    expectUnchangedViewport();
    cy.get('#transmission-chain-node-radius-variable').click({ force: true });
    cy.get('.p-select-overlay:visible').last().find('.p-select-option')
      .filter((_index, option) => String(option.textContent || '').trim() === 'Degree').click({ force: true });
    cy.get('.p-select-overlay:visible').should('not.exist');
    cy.window().its('commonService.visuals.transmissionChain.widgets.node-radius-variable').should('equal', 'degree');
    expectUnchangedViewport();
    for (const [selector, value] of [['#transmission-chain-node-radius-min', 25], ['#transmission-chain-node-radius-max', 95]] as const) {
      cy.get(selector).invoke('val', value).trigger('input', { force: true }).trigger('change', { force: true });
      expectUnchangedViewport();
    }
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
        .and('contain.text', 'omitted from Transmission Chain Explorer')
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
      ).to.satisfy((positions: number[]) => positions.every((position) => position > 0 && position === positions[0]));

      const firstLabel = $labels.get(0).getBoundingClientRect();
      const toolbar = Cypress.$(byTestId(testIds.transmissionChainSettingsButton))
        .closest('#transmission-chain-tool-btn-container')
        .get(0)
        .getBoundingClientRect();
      expect(firstLabel.top, 'first Y-axis label starts below the toolbar')
        .to.be.greaterThan(toolbar.bottom);
    });
    cy.get('.timeline-x-axis-title').should('have.text', dateField);

    cy.get('@dialogContainer').find('#transmission-chain-axis-label-size')
      .invoke('val', 24)
      .trigger('input', { force: true });
    cy.get('.timeline-axis-label').first().should('have.css', 'font-size', '24px');
    cy.get('.timeline-y-axis-label').first().should('have.css', 'font-size', '24px');
    cy.get('.timeline-x-axis-title').should('have.css', 'font-size', '28px');
    cy.get('.timeline-y-axis-title').should('have.css', 'font-size', '28px');
    getTransmissionCy().should(cyInstance => {
      expectVisiblePlotWithinTimelineAxes(cyInstance);
      const area = getTimelinePlotArea(cyInstance);
      const labels = cyInstance.container()?.parentElement?.querySelectorAll<SVGTextElement>('.timeline-y-axis-label');
      labels?.forEach(label => {
        const bounds = label.getBBox();
        expect(bounds.x + bounds.width, 'category labels stay left of the chains').to.be.lessThan(area.x1);
      });
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
      node.position('x', timelineX + 500);
      node.position('y', groups[0].centerY);

      expect(node.position('x'), 'node remains locked to its timeline date').to.equal(timelineX);
      expect(node.position('y'), 'node remains inside its categorical band')
        .to.be.within(group.boundaryMinY + nodeHalfHeight, group.boundaryMaxY - nodeHalfHeight);
      expect(node.position('y'), 'drag reaches the categorical boundary')
        .to.be.closeTo(group.boundaryMinY + nodeHalfHeight, 0.5);
      expect(node.position('y'), 'node does not enter the first category band')
        .to.not.equal(groups[0].centerY);

      const zoom = component.cy.zoom();
      const panY = component.cy.pan().y;
      const expectedStartLineY = (group.boundaryMinY * zoom) + panY;
      cy.get(`.timeline-grid-overlay .timeline-y-axis-boundary-start[data-y-axis-value="${group.label}"]`)
        .should($line => expect(Number($line.attr('y1')), 'category indicator matches the movement boundary')
          .to.be.closeTo(expectedStartLineY, 0.5));
    });
  });

  it('renders node and link tooltips in the Transmission Chain Explorer instance', () => {
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

  it('keeps the toolbar row free of the network and axes during panning and zooming without a Y-axis field', () => {
    selectDateField();
    cy.closeSettingsPane('Transmission Chain Explorer Settings');
    cy.window().its('commonService.visuals.transmissionChain.widgets.transmission-chain-y-axis-field').should('equal', 'None');
    getTransmissionCy().then(graph => {
      const area = getTimelinePlotArea(graph);
      const container = graph.container()!;
      const document = container.ownerDocument;
      const button = document.querySelector('[data-testid="transmission-chain-settings-button"]')!;
      const buttonRect = button.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const node = leafNodes(graph).first();
      const position = node.renderedPosition();
      graph.panBy('x', buttonRect.left + (buttonRect.width / 2) - containerRect.left - position.x);
      graph.panBy('y', buttonRect.top + (buttonRect.height / 2) - containerRect.top - position.y);
      expect(node.renderedPosition().y, 'node panned into the reserved toolbar row').to.be.lessThan(area.y1);
      graph.zoom(graph.zoom() * 1.2);
      getTimelinePlotArea(graph);
      for (const selector of ['.timeline-grid-overlay', '.timeline-axis-overlay']) {
        const overlay = container.parentElement!.querySelector<SVGSVGElement>(selector)!;
        const clipTop = Number(overlay.style.clipPath.match(/[\d.]+(?=px)/)?.[0]);
        expect(clipTop, `${selector} stays out of the toolbar row`).to.equal(area.y1);
      }
    });
  });

  it('shows bidirectional arrows on links marked bidirectional', () => {
    selectDateField();
    openLinkSizePanel();

    cy.get('@dialogContainer').find('#transmission-chain-link-bidirectional-row').should('not.be.visible');
    cy.get('@dialogContainer').find('#transmission-chain-link-directed-undirected').contains('Show').click({ force: true });
    cy.get('@dialogContainer').find('#transmission-chain-link-bidirectional-row').should('be.visible');
    cy.get('@dialogContainer').find('#transmission-chain-link-bidirectional').contains('Show').click({ force: true });
    cy.window().its('commonService.visuals.transmissionChain.widgets.link-directed').should('equal', true);
    cy.window().its('commonService.visuals.transmissionChain.widgets.link-bidirectional').should('equal', true);

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

  it('centers the current Y-axis layout after panning and zooming', () => {
    selectDateField();
    selectYAxisField();

    cy.window().then((win: any) => {
      const component = win.commonService.visuals.transmissionChain;
      component.cy.viewport(win.JSON.parse(JSON.stringify({ zoom: 0.75, pan: { x: 10000, y: -10000 } })));
    });

    cy.get(byTestId(testIds.transmissionChainCenterButton)).click({ force: true });

    getTransmissionCy().should((cyInstance) => {
      expectVisiblePlotWithinTimelineAxes(cyInstance);
    });
  });

  it('stays static during global timeline playback and refreshes without the playback date filter', () => {
    selectDateField();
    selectYAxisField();
    cy.closeSettingsPane('Transmission Chain Explorer Settings');
    cy.enableTimelineMode(dateField);
    cy.closeGlobalSettings();
    cy.window().should((win: any) => {
      expect(win.$('#global-timeline-wrapper').is(':animated'), 'timeline toolbar finished opening').to.equal(false);
    });
    getTransmissionCy().should(graph => {
      expect(graph.height(), 'renderer resized for the timeline toolbar')
        .to.be.closeTo(graph.container()!.clientHeight, 1);
      expectVisiblePlotWithinTimelineAxes(graph);
    });

    let baseline: any;
    let startTime = 0;
    const snapshot = (component: any) => ({
      nodes: leafNodes(component.cy).map(node => ({ id: node.id(), ...node.position() })),
      links: component.cy.edges().map(edge => edge.id()),
      camera: component.getRendererViewState(),
      dateField: component.widgets['transmission-chain-date-field'],
      yAxisField: component.widgets['transmission-chain-y-axis-field'],
      excluded: component.nodesWithoutTimelineDate.map(node => node.ID),
    });
    cy.window().then((win: any) => {
      const service = win.commonService;
      const component = service.visuals.transmissionChain;
      baseline = snapshot(component);
      startTime = new Date(service.session.state.timeEnd).getTime();
      expect(service.getVisibleNodes().length, 'playback filters its target views')
        .to.be.lessThan(service.getVisibleNodesIgnoringTimeline().length);
      cy.spy(component, '_rerender').as('explorerTimelineRender');
    });

    cy.get('#timeline-play-button').click().should('contain', 'Pause');
    cy.window().should((win: any) => {
      expect(new Date(win.commonService.session.state.timeEnd).getTime(), 'timeline advances')
        .to.be.greaterThan(startTime);
    });
    cy.get('#timeline-play-button').click().should('contain', 'Play');
    cy.window().then((win: any) => {
      expect(snapshot(win.commonService.visuals.transmissionChain), 'Explorer ignores timeline ticks')
        .to.deep.equal(baseline);
    });
    cy.get('@explorerTimelineRender').should('not.have.been.called');

    cy.window().then((win: any) => {
      const service = win.commonService;
      service.visuals.microbeTrace.update(new win.Date(service.session.state.timeStart));
      return service.visuals.transmissionChain.updateLayout();
    });
    cy.window().should((win: any) => {
      const component = win.commonService.visuals.transmissionChain;
      expect(leafNodes(component.cy).map(node => node.id()).sort(), 'refresh retains every Explorer node')
        .to.deep.equal(baseline.nodes.map(node => node.id).sort());
      expect(component.cy.edges().map(edge => edge.id()).sort(), 'refresh retains every Explorer link')
        .to.deep.equal([...baseline.links].sort());
    });

    cy.get('@explorerTimelineRender').invoke('resetHistory');
    cy.enableTimelineMode('None');
    cy.closeGlobalSettings();
    cy.get('@explorerTimelineRender').should('not.have.been.called');
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
    cy.get('@dialogContainer').find('.tab-pane.active #transmission-chain-node-radius')
      .invoke('val', nodeSize)
      .trigger('change', { force: true });
    cy.window().its('commonService.visuals.transmissionChain.widgets.transmission-chain-node-radius').should('equal', nodeSize);

    openLinkSizePanel();
    cy.get('@dialogContainer').find('.tab-pane.active #transmission-chain-link-width')
      .invoke('val', linkWidth)
      .trigger('change', { force: true });
    cy.window().its('commonService.visuals.transmissionChain.widgets.transmission-chain-link-width').should('equal', linkWidth);

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
            .length;

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
    let originalOrigin = '';
    let selectedSource = '';
    let selectedTarget = '';
    getTransmissionCy().then((cyInstance) => {
      const renderedLink = cyInstance.edges(':visible').first();
      const source = String(renderedLink.data('source'));
      const target = String(renderedLink.data('target'));
      selectedSource = source;
      selectedTarget = target;

      cy.window().then((win: any) => {
        const link = win.commonService.session.data.links.find((candidate: any) => (
          String(candidate.source) === source && String(candidate.target) === target
        ));
        expect(link, 'rendered link for synthetic origin').to.exist;
        originalOrigin = String(
          (Array.isArray(link.origin) ? link.origin : [link.origin]).find(Boolean),
        );
        link.origin = [originalOrigin, syntheticOrigin];
        win.commonService.visuals.transmissionChain.onTransmissionChainLinkOriginsChange([
          originalOrigin,
          syntheticOrigin,
        ]);
      });
    });

    getTransmissionCy().should((cyInstance) => {
      const duoEdges = cyInstance.edges(':visible')
        .filter((edge) => (
          edge.source().id() === selectedSource
          && edge.target().id() === selectedTarget
        ))
        .toArray();

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

    cy.window().then((win: any) => {
      win.commonService.visuals.transmissionChain.onTransmissionChainLinkOriginsChange([syntheticOrigin]);
    });

    getTransmissionCy().should((cyInstance) => {
      const remainingEdges = cyInstance.edges(':visible').toArray();

      expect(remainingEdges.length, 'single rendered edge after deselecting one origin').to.equal(1);
      expect(
        remainingEdges.filter((edge) => Boolean(edge.data('secondLink'))).length,
        'no dashed overlay edge',
      ).to.equal(0);
      expect(remainingEdges[0].data('origin'), 'only the selected origin remains')
        .to.deep.equal([syntheticOrigin]);
      expect(remainingEdges[0].data('origin'), 'deselected origin is removed')
        .not.to.include(originalOrigin);
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
