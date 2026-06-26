/// <reference types="cypress" />

import { openGlobalStylingTab, visitAppAndAcceptEula, waitForProcessingDialogToClear } from '../../../support/journey-helpers';
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

const normalizeColor = (value: string): string => String(value || '').replace(/\s+/g, '').toLowerCase();

const normalizeExpectedColor = (value: string): string => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized.startsWith('#')) {
    return normalizeColor(normalized);
  }

  const expanded = normalized.length === 4
    ? normalized.slice(1).split('').map((char) => `${char}${char}`).join('')
    : normalized.slice(1);
  const red = parseInt(expanded.slice(0, 2), 16);
  const green = parseInt(expanded.slice(2, 4), 16);
  const blue = parseInt(expanded.slice(4, 6), 16);

  return normalizeColor(`rgb(${red}, ${green}, ${blue})`);
};

const selectPrimeOption = (selector: string, label: string): void => {
  cy.get(selector, { timeout: 15000 }).click({ force: true });
  cy.get('.p-select-overlay:visible, .p-dropdown-panel:visible', { timeout: 15000 })
    .last()
    .contains('li[role="option"]', label, { timeout: 15000 })
    .scrollIntoView()
    .click({ force: true });
};

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
    cy.contains('#file-table .file-name', fileName)
      .scrollIntoView()
      .should('be.visible');
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

const assertNodeClassificationColorsInTwoDAndBubble = (): void => {
  cy.window().its('commonService.session.style.widgets.node-color-variable')
    .should('equal', 'Classification');

  assertDashboardViewReady('2D Network');
  cy.window().should((win: any) => {
    const commonService = win.commonService;
    const nodeColorMap = commonService.temp.style.nodeColorMap;
    const cyInstance = commonService.visuals.twoD.cy || win.cytoscapeInstance;
    const dataNodes = cyInstance.nodes(':visible').filter((node: any) =>
      node.children().length === 0 &&
      !node.hasClass('parent')
    );

    expect(dataNodes.length, 'visible 2D data nodes').to.be.greaterThan(0);
    dataNodes.forEach((node: any) => {
      const fullNode = commonService.session.data.nodes.find((candidate: any) =>
        String(candidate._id ?? candidate.id) === String(node.id())
      );
      expect(fullNode, `restored session node for 2D node ${node.id()}`).to.exist;
      const classification = String(fullNode.Classification);
      const expectedColor = normalizeExpectedColor(String(nodeColorMap(classification) || ''));

      expect(expectedColor, `expected 2D node color for ${node.id()}`).not.to.equal('');
      expect(
        normalizeColor(String(node.style('background-color') || '')),
        `2D node color for ${node.id()}`,
      ).to.equal(expectedColor);
    });
  });

  assertDashboardViewReady('Bubble');
  cy.window().should((win: any) => {
    const commonService = win.commonService;
    const bubble = commonService.visuals.bubble;
    const nodeColorMap = commonService.temp.style.nodeColorMap;
    const dataNodes = bubble.cy.nodes().filter((node: any) =>
      !node.hasClass('X_axis') &&
      !node.hasClass('Y_axis')
    );

    expect(dataNodes.length, 'visible Bubble data nodes').to.be.greaterThan(0);
    dataNodes.forEach((node: any) => {
      const fullNode = commonService.session.data.nodes.find((candidate: any) =>
        String(candidate._id ?? candidate.id) === String(node.id())
      );
      expect(fullNode, `restored session node for Bubble node ${node.id()}`).to.exist;
      const classification = String(fullNode.Classification);
      const expectedColor = normalizeExpectedColor(String(nodeColorMap(classification) || ''));

      expect(expectedColor, `expected Bubble node color for ${node.id()}`).not.to.equal('');
      expect(
        normalizeColor(String(node.style('background-color') || '')),
        `Bubble node color for ${node.id()}`,
      ).to.equal(expectedColor);
    });
  });
};

const assertTwoDLinksColoredByOrigin = (): void => {
  assertDashboardViewReady('2D Network');
  cy.window().should((win: any) => {
    const commonService = win.commonService;
    const cyInstance = commonService.visuals.twoD.cy || win.cytoscapeInstance;
    const edges = cyInstance.edges(':visible');
    const secondLinkEdges = edges.filter((edge: any) => Boolean(edge.data('secondLink')));

    expect(edges.length, 'visible 2D edges after coloring by origin').to.be.greaterThan(0);
    expect(secondLinkEdges.length, 'split mixed-origin 2D edges').to.be.greaterThan(0);

    edges.forEach((edge: any) => {
      const rawOrigins = edge.data('origin');
      const origins = Array.isArray(rawOrigins) ? rawOrigins.map(String) : [String(rawOrigins)];

      expect(origins, `rendered origin for edge ${edge.id()}`).to.have.length(1);

      const expectedColor = normalizeExpectedColor(String(commonService.temp.style.linkColorMap(origins[0]) || ''));
      expect(expectedColor, `expected origin link color for ${edge.id()}`).not.to.equal('');
      expect(
        normalizeColor(String(edge.style('line-color') || '')),
        `2D origin link color for ${edge.id()}`,
      ).to.equal(expectedColor);
    });
  });
};

describe('Journey Flow - Dashboard resolved layout fixture restore', () => {
  it('loads a saved 2D/Aggregate/Bubble split layout from a .microbetrace session', () => {
    visitAppAndAcceptEula({ skipDemoSession: false });
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

  it('restores node color-by styling in 2D and Bubble and updates 2D link colors by origin', () => {
    visitAppAndAcceptEula();
    captureDashboardRestoreErrors();
    loadDashboardSessionFixture();
    assertNoDashboardRestoreErrors();

    cy.closeSettingsPane('Aggregate Settings');
    assertNodeClassificationColorsInTwoDAndBubble();

    focusDashboardTab('2D Network');
    openGlobalStylingTab();
    selectPrimeOption('#link-tooltip-variable', 'Origin');
    cy.window().its('commonService.session.style.widgets.link-color-variable').should('equal', 'origin');
    cy.closeGlobalSettings();
    waitForProcessingDialogToClear();

    assertTwoDLinksColoredByOrigin();
    assertNoDashboardRuntimeBanner();
  });
});
