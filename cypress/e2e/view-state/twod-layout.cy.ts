/// <reference types="cypress" />

import { Core } from 'cytoscape';
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

const getRenderedNodePositions = (cyInstance: Core): Map<string, RenderedNodePosition> => new Map(
  cyInstance.nodes()
    .filter(node => !node.hasClass('parent') && !node.hasClass('hidden') && node.children().length === 0)
    .map(node => [node.id(), { ...node.position() }])
);

const getRenderedComponentBounds = (
  cyInstance: Core,
  minimumComponentSize: number
): RenderedComponentBounds[] => {
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
  cyInstance: Core,
  minimumComponentSize: number
): RenderedComponentRow[] => {
  const rows: RenderedComponentRow[] = [];
  const overlapTolerance = 1;

  getRenderedComponentBounds(cyInstance, minimumComponentSize)
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
  cy.get('@settingsDialog').find('.tab-pane.active').contains('p-accordion-panel', 'Display').click();
  cy.get('@settingsDialog').find(byTestId(testIds.twodNetworkLayout)).click();
  cy.contains('li[role="option"]', 'Order clusters by size').click();
  cy.window().its('commonService.session.style.widgets.network-layout').should('equal', 'order-by-size');
};

describe('2D Network - Cluster Size Layout', () => {
  beforeEach(() => {
    cy.viewport(1024, 720);
    visitAppAndAcceptEula({ skipDemoSession: false, dismissWelcomeOverlay: true });
    ensureTwoDNetworkView();
    cy.get('#cy', { timeout: 15000 }).should('be.visible');
    cy.window({ timeout: 15000 }).should('have.property', 'cytoscapeInstance');
  });

  it('fills a horizontal size-ordered row before wrapping overflow', () => {
    let originalPositions: Map<string, RenderedNodePosition>;

    cy.window().then((win: any) => {
      originalPositions = getRenderedNodePositions(win.cytoscapeInstance as Core);
    });

    cy.window().its('commonService.session.style.widgets.network-layout').should('equal', 'force-directed');
    selectOrderByClusterSizeLayout();
    cy.get('@settingsDialog').find(byTestId(testIds.twodNetworkLayout)).should('contain.text', 'Order clusters by size');

    cy.window().should((win: any) => {
      const cyInstance = win.cytoscapeInstance as Core;
      const spacing = Math.max(
        48,
        Number(win.commonService.session.style.widgets['node-radius'] || 20) * 3
      );
      const rows = getRenderedComponentRows(cyInstance, spacing);

      expect(rows.length, 'standard-width layout stays on one horizontal row').to.equal(1);
      assertOrderedNonOverlappingRows(rows);
    });

    cy.viewport(800, 720);
    cy.window().should((win: any) => {
      const cyInstance = win.cytoscapeInstance as Core;
      const spacing = Math.max(
        48,
        Number(win.commonService.session.style.widgets['node-radius'] || 20) * 3
      );
      const rows = getRenderedComponentRows(cyInstance, spacing);
      const orderedComponents = rows.flatMap(row => row.components);
      const containerWidth = cyInstance.container()?.getBoundingClientRect().width || 1;
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
      const orderedPositions = getRenderedNodePositions(win.cytoscapeInstance as Core);
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
      const restoredPositions = getRenderedNodePositions(win.cytoscapeInstance as Core);
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
      const renderedPositions = getRenderedNodePositions(win.cytoscapeInstance as Core);
      const expectedVisibleNodeCount = win.commonService.getVisibleNodes().length;

      expect(renderedPositions.size, 'rendered timeline-start nodes').to.equal(expectedVisibleNodeCount);
      expect(renderedPositions.size, 'timeline-start node count').to.be.greaterThan(0);
    }).then((win: any) => {
      initialPositions = getRenderedNodePositions(win.cytoscapeInstance as Core);
    });

    setTimelineRange('2021-06-28', '2021-07-16');

    cy.window().should((win: any) => {
      const expandedPositions = getRenderedNodePositions(win.cytoscapeInstance as Core);
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

  it('compacts components once after a threshold increase merges them', () => {
    selectOrderByClusterSizeLayout();
    cy.closeSettingsPane('2D Network Settings');

    cy.window().then((win: any) => {
      cy.spy(win.commonService.visuals.twoD as any, '_partialUpdate').as('thresholdLayoutRefresh');
    });

    openGlobalFilteringTab();
    setGlobalLinkThreshold(25);
    cy.closeGlobalSettings();

    cy.window().should((win: any) => {
      const cyInstance = win.cytoscapeInstance as Core;
      const nodes = cyInstance.nodes()
        .filter(node => !node.hasClass('parent') && !node.hasClass('hidden'));
      const nodeIds = new Set(nodes.map(node => node.id()));
      const edges = cyInstance.edges().filter((edge: any) => (
        !edge.hasClass('hidden')
        && nodeIds.has(edge.source().id())
        && nodeIds.has(edge.target().id())
      ));
      const components = nodes.union(edges).components()
        .map((component: any) => ({
          size: component.nodes().length,
          bounds: component.nodes().boundingBox({
            includeLabels: false,
            includeOverlays: false,
          }),
        }))
        .sort((left, right) => left.size - right.size);

      expect(components.map(component => component.size), 'merged component sizes').to.deep.equal([14, 19]);
      expect(
        Math.max(components[0].bounds.w, components[0].bounds.h),
        'newly merged component is compact',
      ).to.be.lessThan(275);
    });

    cy.get('@thresholdLayoutRefresh').should('have.been.calledOnce');
  });
});
