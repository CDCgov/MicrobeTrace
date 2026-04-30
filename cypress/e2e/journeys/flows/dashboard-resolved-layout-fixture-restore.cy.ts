/// <reference types="cypress" />

import { visitAppAndAcceptEula, waitForProcessingDialogToClear } from '../../../support/journey-helpers';
import {
  assertDashboardViewReady,
  assertDistinctDashboardPaneRects,
  assertNoDashboardRuntimeBanner,
  captureDashboardPaneRects,
} from '../../../support/dashboard-helpers';

type DashboardPaneRects = Record<string, {
  x: number;
  y: number;
  width: number;
  height: number;
}>;

const fixtureName = 'dashboard-layout-2d-aggregate-bubble.microbetrace';

const loadDashboardSessionFixture = () => {
  cy.get('#fileDropRef', { timeout: 15000 })
    .selectFile(`${Cypress.config('fixturesFolder')}/${fixtureName}`, { force: true });

  waitForProcessingDialogToClear(90000);
};

const captureDashboardRestoreErrors = () => {
  cy.window().then((win: any) => {
    win.__dashboardLayoutRestoreErrors = [];
    const originalConsoleError = win.console.error.bind(win.console);

    cy.stub(win.console, 'error').callsFake((...args: unknown[]) => {
      win.__dashboardLayoutRestoreErrors.push(args.map(String).join(' '));
      return originalConsoleError(...args);
    });
  });
};

const assertNoDashboardRestoreErrors = () => {
  cy.window().then((win: any) => {
    const restoreErrors = (win.__dashboardLayoutRestoreErrors || []).filter((message: string) =>
      message.includes('Unable to restore the saved dashboard layout') ||
      message.includes('value2.trimStart is not a function') ||
      message.includes("Cannot read properties of null (reading 'notify')")
    );

    expect(restoreErrors, 'dashboard restore errors').to.deep.equal([]);
  });
};

const assertResolvedDashboardSessionLoaded = () => {
  cy.window({ timeout: 90000 }).should((win: any) => {
    const tabs = win.commonService.visuals.microbeTrace.homepageTabs.map((tab: any) => tab.label);

    expect(tabs, 'restored tabs').to.include.members(['2D Network', 'Aggregate', 'Bubble']);
    expect(win.commonService.session.data.nodes.length, 'session node count').to.equal(10);
    expect(win.commonService.session.data.links.length, 'session link count').to.equal(31);
  });

  assertNoDashboardRestoreErrors();

  assertDashboardViewReady('2D Network');
  cy.window({ timeout: 30000 }).should((win: any) => {
    const cyInstance = win.commonService.visuals.twoD.cy || win.cytoscapeInstance;

    expect(cyInstance.nodes().length, 'rendered 2D node count').to.equal(10);
  });
  assertDashboardViewReady('Aggregate');
  cy.window({ timeout: 30000 }).should((win: any) => {
    const aggregate = win.commonService.visuals.aggregate;
    const firstTableRows = aggregate.SelectedDataTables[0]?.data || [];
    const aggregateTotal = firstTableRows.reduce(
      (sum: number, row: any) => sum + Number(row.count || 0),
      0,
    );

    expect(aggregateTotal, 'Aggregate first table total count').to.equal(10);
  });

  assertDashboardViewReady('Bubble');
  cy.window({ timeout: 30000 }).should((win: any) => {
    const bubble = win.commonService.visuals.bubble;
    const home = win.commonService.visuals.microbeTrace;
    const liveBubbleCounts = Array.from(home._goldenLayoutHostComponent._componentRefMap.entries())
      .filter(([container]: any) => String(container?.componentType ?? '') === 'Bubble')
      .map(([, componentRef]: any) => componentRef.instance?.allData?.length);
    const sessionCounts = {
      nodes: win.commonService.session.data.nodes.length,
      filtered: win.commonService.session.data.nodeFilteredValues.length,
      visible: win.commonService.getVisibleNodes().length,
      liveBubble: liveBubbleCounts,
    };
    const dataNodes = bubble.cy.nodes().filter((node: any) =>
      !node.hasClass('X_axis') &&
      !node.hasClass('Y_axis')
    );
    const visibleTotal = bubble.visibleData.reduce(
      (sum: number, node: any) => sum + Number(node.totalCount || 1),
      0,
    );

    expect(sessionCounts, 'session and live Bubble data counts').to.deep.equal({
      nodes: 10,
      filtered: 10,
      visible: 10,
      liveBubble: [10],
    });
    expect(bubble.allData.length, 'Bubble source data count').to.equal(10);
    expect(dataNodes.length, 'Bubble rendered data node count').to.equal(10);
    expect(visibleTotal, 'Bubble visible total count').to.equal(10);
  });

  captureDashboardPaneRects(['2D Network', 'Aggregate', 'Bubble'], 'resolvedDashboardPaneRects');
  assertDistinctDashboardPaneRects('resolvedDashboardPaneRects', 3);

  cy.get<DashboardPaneRects>('@resolvedDashboardPaneRects').then((rects) => {
    expect(rects['2D Network'].x, '2D pane should be left of Aggregate').to.be.lessThan(rects.Aggregate.x);
    expect(rects.Bubble.y, 'Bubble pane should be below 2D').to.be.greaterThan(rects['2D Network'].y);
    expect(rects.Bubble.y, 'Bubble pane should be below Aggregate').to.be.greaterThan(rects.Aggregate.y);
  });

  assertNoDashboardRuntimeBanner();
};

describe('Journey Flow - Dashboard resolved layout fixture restore', () => {
  it('loads a saved 2D/Aggregate/Bubble split layout from a .microbetrace session', () => {
    visitAppAndAcceptEula();
    captureDashboardRestoreErrors();
    loadDashboardSessionFixture();
    assertResolvedDashboardSessionLoaded();
  });

  it('replaces an already-loaded default dataset when restoring a dashboard session', () => {
    visitAppAndAcceptEula({ skipDemoSession: false });

    cy.window({ timeout: 90000 }).should((win: any) => {
      expect(win.commonService.session.data.nodes.length, 'default dataset node count').to.be.greaterThan(10);
    });

    captureDashboardRestoreErrors();
    loadDashboardSessionFixture();
    assertResolvedDashboardSessionLoaded();
  });
});
