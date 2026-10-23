/// <reference types="cypress" />

import { Core } from 'cytoscape';
import {
  assertTwoDRendererReady,
  getTwoDNodeSnapshots,
  getTwoDEdgeSnapshots,
  rendererVisitOptions,
  TWO_D_RENDERER_CASES,
} from '../../support/twod-renderer-harness';
import {
  ensureTwoDNetworkView,
  openGlobalFilteringTab,
  setGlobalLinkThreshold,
  setTimelineRange,
  visitAppAndAcceptEula,
} from '../../support/journey-helpers';
import { byTestId, testIds } from '../../support/selectors';

interface RenderedComponentBounds {
  size: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  layoutWidth: number;
}

interface RenderedComponentRow {
  components: RenderedComponentBounds[];
  minY: number;
  maxY: number;
}

interface RenderedNodePosition {
  x: number;
  y: number;
}

const getRenderedNodePositions = (win: any): Map<string, RenderedNodePosition> => new Map(
  getTwoDNodeSnapshots(win).map(node => [node.id, { x: node.x, y: node.y }])
);

const getRenderedComponentBounds = (
  win: any,
  minimumComponentSize: number
): RenderedComponentBounds[] => {
  if (win.commonService.visuals.twoD.sigmaActive) {
    const nodes = getTwoDNodeSnapshots(win);
    const byId = new Map(nodes.map(node => [node.id, node]));
    const adjacency = new Map(nodes.map(node => [node.id, new Set<string>()]));
    getTwoDEdgeSnapshots(win).forEach(edge => {
      adjacency.get(edge.source)?.add(edge.target);
      adjacency.get(edge.target)?.add(edge.source);
    });
    const seen = new Set<string>();
    const components: RenderedComponentBounds[] = [];
    nodes.forEach(start => {
      if (seen.has(start.id)) return;
      const pending = [start.id];
      const members: typeof nodes = [];
      seen.add(start.id);
      while (pending.length) {
        const id = pending.pop()!;
        members.push(byId.get(id)!);
        adjacency.get(id)!.forEach(neighbor => {
          if (!seen.has(neighbor)) {
            seen.add(neighbor);
            pending.push(neighbor);
          }
        });
      }
      const minX = Math.min(...members.map(node => node.x));
      const maxX = Math.max(...members.map(node => node.x));
      components.push({
        size: members.reduce((sum, node) => sum + (node.raw.isCollapsedAggregate ? node.raw.totalCount : 1), 0),
        minX, maxX,
        // Sigma's graph Y axis points upward; test the order visible on screen.
        minY: Math.min(...members.map(node => -node.y)),
        maxY: Math.max(...members.map(node => -node.y)),
        layoutWidth: Math.max(minimumComponentSize,
          Math.max(...members.map(node => node.x + node.diameter / 2 + node.borderWidth))
          - Math.min(...members.map(node => node.x - node.diameter / 2 - node.borderWidth))),
      });
    });
    return components;
  }
  const cyInstance = win.cytoscapeInstance as Core;
  const nodes = cyInstance.nodes().filter((node: any) => (
    !node.hasClass('parent')
    && node.children().length === 0
    && !node.hasClass('hidden')
  ));
  const nodeIds = new Set(nodes.map(node => node.id()));
  const edges = cyInstance.edges().filter((edge: any) => (
    !edge.hasClass('hidden')
    && nodeIds.has(edge.source().id())
    && nodeIds.has(edge.target().id())
  ));

  return nodes.union(edges).components().map((component: any) => {
    const componentNodes = component.nodes();
    const xPositions = componentNodes.map((node: any) => node.position('x'));
    const yPositions = componentNodes.map((node: any) => node.position('y'));
    const bounds = componentNodes.boundingBox({
      includeLabels: false,
      includeOverlays: false
    });
    const size = componentNodes.reduce((count: number, node: any) => {
      const aggregateCount = Number(node.data('totalCount'));
      return count + (
        node.data('isCollapsedAggregate') === true
        && Number.isFinite(aggregateCount)
        && aggregateCount > 0
          ? aggregateCount
          : 1
      );
    }, 0);

    return {
      size,
      minX: Math.min(...xPositions),
      maxX: Math.max(...xPositions),
      minY: Math.min(...yPositions),
      maxY: Math.max(...yPositions),
      layoutWidth: Math.max(minimumComponentSize, bounds.w)
    };
  });
};

const getRenderedComponentRows = (
  win: any,
  minimumComponentSize: number
): RenderedComponentRow[] => {
  const rows: RenderedComponentRow[] = [];
  const overlapTolerance = 1;

  getRenderedComponentBounds(win, minimumComponentSize)
    .sort((left, right) => left.minY - right.minY || left.minX - right.minX)
    .forEach(component => {
      const row = rows.find(candidate => (
        component.minY <= candidate.maxY + overlapTolerance
        && component.maxY >= candidate.minY - overlapTolerance
      ));

      if (row) {
        row.components.push(component);
        row.minY = Math.min(row.minY, component.minY);
        row.maxY = Math.max(row.maxY, component.maxY);
        return;
      }

      rows.push({
        components: [component],
        minY: component.minY,
        maxY: component.maxY
      });
    });

  return rows
    .sort((left, right) => left.minY - right.minY)
    .map(row => ({
      ...row,
      components: row.components.sort((left, right) => left.minX - right.minX)
    }));
};

const getComponentGap = (
  left: RenderedComponentBounds,
  right: RenderedComponentBounds,
  spacing: number
): number => left.size === right.size ? spacing * 1.25 : spacing * 2;

const getRowLayoutWidth = (row: RenderedComponentRow, spacing: number): number => (
  row.components.reduce((width, component, index) => (
    width
    + component.layoutWidth
    + (index > 0 ? getComponentGap(row.components[index - 1], component, spacing) : 0)
  ), 0)
);

const assertOrderedNonOverlappingRows = (rows: RenderedComponentRow[]): void => {
  const orderedComponents = rows.flatMap(row => row.components);

  expect(orderedComponents.length, 'rendered connected components').to.be.greaterThan(1);
  orderedComponents.slice(1).forEach((component, index) => {
    const previousComponent = orderedComponents[index];
    expect(previousComponent.size, 'component sizes increase in row order').to.be.at.most(component.size);
  });
  rows.forEach(row => {
    row.components.slice(1).forEach((component, index) => {
      const previousComponent = row.components[index];
      expect(previousComponent.maxX, 'components do not overlap horizontally').to.be.lessThan(component.minX);
    });
  });
  rows.slice(1).forEach((row, index) => {
    const previousRow = rows[index];
    expect(previousRow.maxY, 'component rows do not overlap vertically').to.be.lessThan(row.minY);
  });
};

const selectOrderByClusterSizeLayout = (): void => {
  cy.get(byTestId(testIds.twodSettingsButton)).click();
  cy.contains('.p-dialog-title', '2D Network Settings')
    .should('be.visible')
    .parents('.p-dialog')
    .as('settingsDialog');

  cy.get('@settingsDialog').contains('.nav-link', 'Network').click();
  cy.get('@settingsDialog').find('.tab-pane.active').contains('p-accordion-header', 'Display').click();
  cy.get('@settingsDialog').find(byTestId(testIds.twodNetworkLayout)).click();
  cy.contains('li[role="option"]', 'Order clusters by size').click();
  cy.window().its('commonService.session.style.widgets.network-layout').should('equal', 'order-by-size');
};

TWO_D_RENDERER_CASES.forEach(({ label, mode }) => describe('2D Network - Cluster Size Layout - ' + label, () => {
  beforeEach(() => {
    cy.viewport(1280, 720);
    visitAppAndAcceptEula({ skipDemoSession: false, dismissWelcomeOverlay: true, ...rendererVisitOptions(mode) });
    ensureTwoDNetworkView();
    assertTwoDRendererReady(mode);
  });

  it('fills a horizontal size-ordered row before wrapping overflow', () => {
    let originalPositions: Map<string, RenderedNodePosition>;

    cy.window().then((win: any) => {
      originalPositions = getRenderedNodePositions(win);
    });

    cy.window().its('commonService.session.style.widgets.network-layout').should('equal', 'force-directed');
    selectOrderByClusterSizeLayout();
    cy.get('@settingsDialog').find(byTestId(testIds.twodNetworkLayout)).should('contain.text', 'Order clusters by size');

    cy.window().should((win: any) => {
      const spacing = Math.max(
        48,
        Number(win.commonService.session.style.widgets['node-radius'] || 20) * 3
      );
      const rows = getRenderedComponentRows(win, spacing);

      expect(rows.length, 'standard-width layout stays on one horizontal row').to.equal(1);
      assertOrderedNonOverlappingRows(rows);
    });

    cy.viewport(800, 720);
    cy.window().should((win: any) => {
      const spacing = Math.max(
        48,
        Number(win.commonService.session.style.widgets['node-radius'] || 20) * 3
      );
      const rows = getRenderedComponentRows(win, spacing);
      const orderedComponents = rows.flatMap(row => row.components);
      const container = win.document.querySelector(mode === 'sigma' ? '[data-testid="sigma-network"]' : '#cy');
      const containerWidth = container.getBoundingClientRect().width || 1;
      const minimumHorizontalScale = 0.75;
      const targetWidth = Math.max(
        ...orderedComponents.map(component => component.layoutWidth),
        (containerWidth - 60) / minimumHorizontalScale
      );

      expect(rows.length, 'narrow layout wraps onto multiple rows').to.be.greaterThan(1);
      expect(rows[0].components.length, 'first row fills horizontally before wrapping').to.be.greaterThan(1);
      assertOrderedNonOverlappingRows(rows);
      rows.slice(0, -1).forEach((row, index) => {
        const nextComponent = rows[index + 1].components[0];
        const lastComponent = row.components[row.components.length - 1];
        const widthWithNextComponent = getRowLayoutWidth(row, spacing)
          + getComponentGap(lastComponent, nextComponent, spacing)
          + nextComponent.layoutWidth;

        expect(widthWithNextComponent, 'row wraps only when the next component would overflow')
          .to.be.greaterThan(targetWidth);
      });
    });

    cy.window().should((win: any) => {
      const orderedPositions = getRenderedNodePositions(win);
      const movedNodeCount = Array.from(originalPositions.entries()).filter(([nodeId, originalPosition]) => {
        const orderedPosition = orderedPositions.get(nodeId);
        return orderedPosition && Math.hypot(
          orderedPosition.x - originalPosition.x,
          orderedPosition.y - originalPosition.y
        ) > 1;
      }).length;

      expect(movedNodeCount, 'nodes moved into wrapped size rows').to.be.greaterThan(0);
    });

    cy.get('@settingsDialog').find(byTestId(testIds.twodNetworkLayout)).click();
    cy.contains('li[role="option"]', 'Force directed').click();
    cy.window().its('commonService.session.style.widgets.network-layout').should('equal', 'force-directed');

    cy.window().should((win: any) => {
      const restoredPositions = getRenderedNodePositions(win);
      expect(restoredPositions.size, 'restored node count').to.equal(originalPositions.size);
      originalPositions.forEach((originalPosition, nodeId) => {
        const restoredPosition = restoredPositions.get(nodeId);
        expect(restoredPosition, `${nodeId} restored`).to.exist;
        if (!restoredPosition) return;
        expect(restoredPosition.x, `${nodeId} x position`).to.be.closeTo(originalPosition.x, 0.01);
        expect(restoredPosition.y, `${nodeId} y position`).to.be.closeTo(originalPosition.y, 0.01);
      });
    });
  });

  it('keeps ordered node positions stable as timeline nodes appear', () => {
    let initialPositions: Map<string, RenderedNodePosition>;

    selectOrderByClusterSizeLayout();
    cy.closeSettingsPane('2D Network Settings');

    cy.enableTimelineMode('Date of symptom onset Date');
    cy.closeGlobalSettings();
    setTimelineRange('2021-06-28', '2021-06-28');

    cy.window().should((win: any) => {
      const renderedPositions = getRenderedNodePositions(win);
      const expectedVisibleNodeCount = win.commonService.getVisibleNodes().length;

      expect(renderedPositions.size, 'rendered timeline-start nodes').to.equal(expectedVisibleNodeCount);
      expect(renderedPositions.size, 'timeline-start node count').to.be.greaterThan(0);
    }).then((win: any) => {
      initialPositions = getRenderedNodePositions(win);
    });

    setTimelineRange('2021-06-28', '2021-07-16');

    cy.window().should((win: any) => {
      const expandedPositions = getRenderedNodePositions(win);
      const expectedVisibleNodeCount = win.commonService.getVisibleNodes().length;

      expect(expandedPositions.size, 'rendered expanded-timeline nodes').to.equal(expectedVisibleNodeCount);
      expect(expandedPositions.size, 'new timeline nodes appeared').to.be.greaterThan(initialPositions.size);
      initialPositions.forEach((initialPosition, nodeId) => {
        const expandedPosition = expandedPositions.get(nodeId);
        expect(expandedPosition, `${nodeId} remains rendered`).to.exist;
        if (!expandedPosition) return;

        expect(expandedPosition.x, `${nodeId} x position`).to.be.closeTo(initialPosition.x, 0.01);
        expect(expandedPosition.y, `${nodeId} y position`).to.be.closeTo(initialPosition.y, 0.01);
      });
    });
  });

  it('settles merged components only after a threshold increase', () => {
    selectOrderByClusterSizeLayout();
    cy.closeSettingsPane('2D Network Settings');

    cy.window().then((win: any) => {
      cy.spy(win.commonService.visuals.twoD as any, '_partialUpdate').as('thresholdLayoutRefresh');
      cy.spy(win.commonService.visuals.twoD as any, 'precomputePositionsWithD3').as('thresholdLayoutSettle');
    });

    openGlobalFilteringTab();
    setGlobalLinkThreshold(25);
    cy.closeGlobalSettings();

    cy.window().should((win: any) => {
      const components = getRenderedComponentBounds(win, 48).sort((left, right) => left.size - right.size);

      expect(components.map(component => component.size), 'merged component sizes').to.deep.equal([14, 19]);
      expect(
        Math.max(components[0].maxX - components[0].minX, components[0].maxY - components[0].minY),
        'newly merged component is compact',
      ).to.be.lessThan(275);
    });

    if (mode === 'sigma') cy.get('@thresholdLayoutSettle').its('callCount').should('equal', 1);
    else cy.get('@thresholdLayoutRefresh').its('callCount').should('equal', 2);

    cy.get('@thresholdLayoutRefresh').then((refreshSpy: any) => refreshSpy.resetHistory());
    cy.get('@thresholdLayoutSettle').then((settleSpy: any) => settleSpy.resetHistory());
    openGlobalFilteringTab();
    setGlobalLinkThreshold(16);
    cy.closeGlobalSettings();

    if (mode === 'sigma') cy.get('@thresholdLayoutSettle').should('not.have.been.called');
    else cy.get('@thresholdLayoutRefresh').its('callCount').should('equal', 1);
  });

  it('disables layout changes while all nodes are pinned', () => {
    const positions = new Map<string, RenderedNodePosition>();
    cy.window().then((win: any) => getRenderedNodePositions(win).forEach((position, id) => positions.set(id, position)));
    cy.get(byTestId(testIds.twodPinAllButton)).click();
    cy.get(byTestId(testIds.twodSettingsButton)).click();
    cy.contains('.p-dialog-title', '2D Network Settings').parents('.p-dialog').as('settingsDialog');
    cy.get('@settingsDialog').contains('.nav-link', 'Network').click();
    cy.get('@settingsDialog').contains('p-accordion-header', 'Display').click();
    cy.get('@settingsDialog').find(byTestId(testIds.twodNetworkLayout))
      .find('[role="combobox"]').should('have.attr', 'aria-disabled', 'true');
    cy.window().should((win: any) => {
      expect(win.commonService.session.style.widgets['network-layout']).to.equal('force-directed');
      expect(Array.from(getRenderedNodePositions(win))).to.deep.equal(Array.from(positions));
    });
  });
}));
