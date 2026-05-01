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
const restoredFileMappings = [
  {
    name: 'Numbers_epi_arrows.csv',
    format: 'link',
    fields: ['Source', 'Target', 'None'],
  },
  {
    name: 'Numbers_node 1.csv',
    format: 'node',
    fields: ['Accession ID', 'None', 'Transmission source'],
  },
  {
    name: 'Numbers_fasta 1.fas',
    format: 'fasta',
    fields: ['id', 'seq', 'None'],
  },
];
const restoredFileNames = restoredFileMappings.map((file) => file.name);

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

const focusDashboardTab = (title: string) => {
  cy.contains('.lm_tab', title, { timeout: 15000 }).click({ force: true });
};

const assertRestoredFilesTabPopulated = () => {
  focusDashboardTab('Files');

  cy.get('#file-prompt').should('not.exist');
  cy.get('#file-table .file-table-row', { timeout: 15000 })
    .should('have.length', restoredFileNames.length);

  restoredFileNames.forEach((fileName) => {
    cy.contains('#file-table .file-name', fileName).should('be.visible');
  });

  restoredFileMappings.forEach((fileMapping) => {
    cy.contains('#file-table .file-name', fileMapping.name)
      .parents('.file-table-row')
      .then(($row) => {
        const selectedFields = $row.find('select').toArray().map((select) =>
          (select as HTMLSelectElement).value
        );

        expect($row.find('input[type="radio"]:checked').data('type'), `${fileMapping.name} format`)
          .to.equal(fileMapping.format);
        expect(selectedFields, `${fileMapping.name} selected fields`).to.deep.equal(fileMapping.fields);
      });
  });

  focusDashboardTab('2D Network');
};

const assertResolvedDashboardSessionLoaded = () => {
  cy.window({ timeout: 90000 }).should((win: any) => {
    const tabs = win.commonService.visuals.microbeTrace.homepageTabs.map((tab: any) => tab.label);

    expect(tabs, 'restored tabs').to.include.members(['Files', '2D Network', 'Aggregate', 'Bubble']);
    expect(
      win.commonService.session.files.map((file: any) => file.name),
      'restored session files',
    ).to.deep.equal(restoredFileNames);
    expect(
      win.commonService.session.files.map((file: any) => ({
        name: file.name,
        format: file.format,
        fields: [file.field1, file.field2, file.field3],
      })),
      'restored session file mappings',
    ).to.deep.equal(restoredFileMappings);
    expect(win.commonService.session.data.nodes.length, 'session node count').to.equal(10);
    expect(win.commonService.session.data.links.length, 'session link count').to.equal(31);
  });

  assertNoDashboardRestoreErrors();
  assertRestoredFilesTabPopulated();

  assertDashboardViewReady('2D Network');
  cy.window({ timeout: 30000 }).should((win: any) => {
    const cyInstance = win.commonService.visuals.twoD.cy || win.cytoscapeInstance;
    const isDestroyed = typeof cyInstance.destroyed === 'function' && cyInstance.destroyed();

    expect(isDestroyed, '2D Cytoscape instance should be live').to.equal(false);

    const container = cyInstance.container();
    const containerRect = container.getBoundingClientRect();
    const renderedDataNodes = cyInstance.nodes(':visible').filter((node: any) =>
      node.children().length === 0 &&
      !node.hasClass('parent')
    );
    const pan = cyInstance.pan();
    const zoom = cyInstance.zoom();
    const nodesInViewport = renderedDataNodes.filter((node: any) => {
      const position = node.position();
      const size = parseFloat(node.style('width')) || 0;
      const renderedX = position.x * zoom + pan.x;
      const renderedY = position.y * zoom + pan.y;

      return (
        size > 0 &&
        renderedX + size / 2 > 0 &&
        renderedY + size / 2 > 0 &&
        renderedX - size / 2 < containerRect.width &&
        renderedY - size / 2 < containerRect.height
      );
    });
    const visibleCanvas = Array.from(container.querySelectorAll<HTMLCanvasElement>('canvas')).some((canvas) =>
      canvas.width > 0 &&
      canvas.height > 0
    );

    expect(cyInstance.nodes().length, 'rendered 2D node count').to.equal(10);
    expect(containerRect.width, '2D Cytoscape container width').to.be.greaterThan(100);
    expect(containerRect.height, '2D Cytoscape container height').to.be.greaterThan(100);
    expect(visibleCanvas, '2D Cytoscape canvas has drawable dimensions').to.equal(true);
    expect(nodesInViewport.length, '2D nodes rendered inside viewport').to.be.greaterThan(0);
    expect(
      parseFloat(nodesInViewport.first().style('background-opacity')),
      '2D rendered node background opacity',
    ).to.be.greaterThan(0);
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
