/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import { readRenderedAggregateRows } from '../../../support/aggregate-helpers';
import { readRenderedCrosstab } from '../../../support/crosstab-helpers';
import { readRenderedMapNodeStyle } from '../../../support/map-helpers';
import {
  assertAfterLaunchCounts,
  launchProfileToTwoD,
  openGlobalStylingTab,
  waitForProcessingDialogToClear,
} from '../../../support/journey-helpers';
import {
  assertNoDashboardRuntimeBanner,
  assertOpenDashboardTabs,
  configureDashboardMapZipcode,
  focusDashboardTab,
  openDashboardViews,
} from '../../../support/dashboard-helpers';

type DashboardWindow = Window & {
  commonService: any;
};

type NonTargetSnapshot = {
  aggregateRows: any[];
  crosstab: any;
  tableRows: string[][];
  waterfallRows: Array<{ id: string; nodeCount: number }>;
};

type NodeCategoryColorState = {
  bubbleControl: string;
  bubbleTarget: string;
  mapControl: string;
  twoDControl: string;
};

type LinkCategoryColorState = {
  mapControl: string;
  twoDControl: string;
};

const DASHBOARD_TABS = ['2D Network', 'Map', 'Bubble', 'Table', 'Aggregate', 'Crosstab', 'Waterfall'];

const normalizeColor = (value: string): string => String(value || '').replace(/\s+/g, '').toLowerCase();

const hexToRgbString = (hex: string): string => {
  const normalized = hex.replace('#', '');
  const expanded = normalized.length === 3
    ? normalized.split('').map((char) => `${char}${char}`).join('')
    : normalized;

  const red = parseInt(expanded.slice(0, 2), 16);
  const green = parseInt(expanded.slice(2, 4), 16);
  const blue = parseInt(expanded.slice(4, 6), 16);

  return `rgb(${red}, ${green}, ${blue})`;
};

const matchesExpectedColor = (actual: string, expectedHex: string): boolean => {
  const normalizedActual = normalizeColor(actual);
  return normalizedActual === normalizeColor(expectedHex) ||
    normalizedActual === normalizeColor(hexToRgbString(expectedHex));
};

const getBubbleDataNodes = (bubble: any) =>
  bubble.cy.nodes().filter((node: any) => !node.hasClass('X_axis') && !node.hasClass('Y_axis'));

const selectPrimeOption = (selector: string, label: string): void => {
  cy.get(selector).click({ force: true }).wait(100);
  cy.get('body').then(($body) => {
    const overlay = $body.find('.p-select-overlay:visible').last();

    expect(overlay.length, `visible PrimeNG overlay for ${selector}`).to.be.greaterThan(0);

    cy.wrap(overlay)
      .contains('li[role="option"]', label, { timeout: 15000 })
      .scrollIntoView()
      .click({ force: true });
  });
};

const changeColorTableEntry = (tableSelector: string, value: string, nextColor: string): void => {
  cy.get(`${tableSelector} td[data-value="${value}"]`, { timeout: 15000 })
    .closest('tr')
    .find('input[type="color"]')
    .should('have.length', 1)
    .then(($input) => {
      const input = $input.get(0) as HTMLInputElement;
      input.value = nextColor;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

  cy.get(`${tableSelector} td[data-value="${value}"]`)
    .closest('tr')
    .find('input[type="color"]')
    .should('have.value', nextColor);
};

const closeDialogIfPresent = (title: string): void => {
  cy.get('body').then(($body) => {
    const dialogTitle = $body
      .find('.p-dialog-title')
      .toArray()
      .find((candidate) => String(candidate.textContent || '').trim() === title);

    if (!dialogTitle) {
      return;
    }

    cy.contains('.p-dialog-title', title)
      .parents('.p-dialog')
      .find('button.p-dialog-close-button')
      .click({ force: true });

    cy.contains('.p-dialog-title', title).should('not.exist');
  });
};

const readRenderedTableRows = (): Cypress.Chainable<string[][]> => {
  return cy.get('.table-wrapper .p-datatable-tbody > tr', { timeout: 15000 }).then(($rows) =>
    Array.from($rows).map((row) =>
      Array.from(row.querySelectorAll('td')).map((cell) => String(cell.textContent || '').replace(/\s+/g, ' ').trim())),
  );
};

const readWaterfallClusterRows = (): Cypress.Chainable<Array<{ id: string; nodeCount: number }>> => {
  return cy.get('#waterfall-cluster-table-container tbody tr.ui-selectable-row', { timeout: 15000 })
    .then(($rows) => Array.from($rows).map((row) => {
      const cells = row.querySelectorAll('td');
      return {
        id: String(cells.item(0)?.textContent || '').trim(),
        nodeCount: Number(String(cells.item(1)?.textContent || '').trim()),
      };
    }));
};

const snapshotNonTargetViews = (alias = 'nonTargetBaseline'): void => {
  focusDashboardTab('Table');
  readRenderedTableRows().then((tableRows) => {
    expect(tableRows.length, 'dashboard Table baseline rows').to.be.greaterThan(0);

    focusDashboardTab('Aggregate');
    readRenderedAggregateRows(0).then((aggregateRows) => {
      expect(aggregateRows.length, 'dashboard Aggregate baseline rows').to.be.greaterThan(0);

      focusDashboardTab('Crosstab');
      readRenderedCrosstab().then((crosstab) => {
        expect(crosstab.body.length, 'dashboard Crosstab baseline rows').to.be.greaterThan(0);

        focusDashboardTab('Waterfall');
        readWaterfallClusterRows().then((waterfallRows) => {
          expect(waterfallRows.length, 'dashboard Waterfall baseline rows').to.be.greaterThan(0);

          cy.wrap<NonTargetSnapshot>({
            aggregateRows,
            crosstab,
            tableRows,
            waterfallRows,
          }, { log: false }).as(alias);
        });
      });
    });
  });
};

const assertNonTargetViewsStable = (alias = 'nonTargetBaseline'): void => {
  cy.get<NonTargetSnapshot>(`@${alias}`).then((baseline) => {
    focusDashboardTab('Table');
    readRenderedTableRows().should((rows) => {
      expect(rows, 'dashboard Table rows after styling').to.deep.equal(baseline.tableRows);
    });

    focusDashboardTab('Aggregate');
    readRenderedAggregateRows(0).should((rows) => {
      expect(rows, 'dashboard Aggregate rows after styling').to.deep.equal(baseline.aggregateRows);
    });

    focusDashboardTab('Crosstab');
    readRenderedCrosstab().should((rendered) => {
      expect(rendered, 'dashboard Crosstab after styling').to.deep.equal(baseline.crosstab);
    });

    focusDashboardTab('Waterfall');
    readWaterfallClusterRows().should((rows) => {
      expect(rows, 'dashboard Waterfall rows after styling').to.deep.equal(baseline.waterfallRows);
    });
  });
};

const assertAllVisibleTwoDNodeColors = (expectedHex: string): void => {
  focusDashboardTab('2D Network');
  cy.window().should((win: unknown) => {
    const cyInstance = (win as DashboardWindow).commonService.visuals.twoD.cy;
    const nodes = cyInstance.nodes(':visible').filter((node: any) => !node.hasClass('parent'));

    expect(nodes.length, 'visible 2D nodes').to.be.greaterThan(0);
    nodes.forEach((node: any) => {
      expect(
        matchesExpectedColor(String(node.style('background-color') || ''), expectedHex),
        `2D node color for ${node.id()}`,
      ).to.equal(true);
    });
  });
};

const assertAllVisibleBubbleNodeColors = (expectedHex: string): void => {
  focusDashboardTab('Bubble');
  cy.window().should((win: unknown) => {
    const bubble = (win as DashboardWindow).commonService.visuals.bubble;
    const nodes = getBubbleDataNodes(bubble);

    expect(nodes.length, 'visible Bubble nodes').to.be.greaterThan(0);
    nodes.forEach((node: any) => {
      expect(
        matchesExpectedColor(String(node.style('background-color') || ''), expectedHex),
        `Bubble node color for ${node.id()}`,
      ).to.equal(true);
    });
  });
};

const assertAllRenderedMapNodeColors = (expectedHex: string): void => {
  focusDashboardTab('Map');
  cy.window().should((win: unknown) => {
    const layers = (win as DashboardWindow).commonService.visuals.gisMap.layers.featureGroup.getLayers();

    expect(layers.length, 'rendered Map nodes').to.be.greaterThan(0);
    layers.forEach((layer: any) => {
      expect(
        matchesExpectedColor(readRenderedMapNodeStyle(layer).fillColor, expectedHex),
        `Map node color for ${String(layer?.data?._id || '')}`,
      ).to.equal(true);
    });
  });
};

const assertAllVisibleTwoDEdgeColors = (expectedHex: string): void => {
  focusDashboardTab('2D Network');
  cy.window().should((win: unknown) => {
    const cyInstance = (win as DashboardWindow).commonService.visuals.twoD.cy;
    const edges = cyInstance.edges(':visible');

    expect(edges.length, 'visible 2D edges').to.be.greaterThan(0);
    edges.forEach((edge: any) => {
      expect(
        matchesExpectedColor(String(edge.style('line-color') || ''), expectedHex),
        `2D edge color for ${edge.id()}`,
      ).to.equal(true);
    });
  });
};

const assertAllRenderedMapLinkColors = (expectedHex: string): void => {
  focusDashboardTab('Map');
  cy.window().should((win: unknown) => {
    const layers = (win as DashboardWindow).commonService.visuals.gisMap.layers.links.getLayers();

    expect(layers.length, 'rendered Map links').to.be.greaterThan(0);
    layers.forEach((layer: any) => {
      expect(
        matchesExpectedColor(String(layer.options.color || ''), expectedHex),
        `Map link color for ${String(layer?.data?.index || '')}`,
      ).to.equal(true);
    });
  });
};

const snapshotBubbleNodeColors = (): Cypress.Chainable<Record<string, string>> => {
  focusDashboardTab('Bubble');
  return cy.window().then((win: unknown) => {
    const bubble = (win as DashboardWindow).commonService.visuals.bubble;
    const nodes = getBubbleDataNodes(bubble);

    return nodes.reduce((acc: Record<string, string>, node: any) => {
      acc[String(node.id())] = normalizeColor(String(node.style('background-color') || ''));
      return acc;
    }, {});
  });
};

const assertBubbleNodeColorsStable = (baseline: Record<string, string>): void => {
  focusDashboardTab('Bubble');
  cy.window().should((win: unknown) => {
    const bubble = (win as DashboardWindow).commonService.visuals.bubble;
    const nodes = getBubbleDataNodes(bubble);

    nodes.forEach((node: any) => {
      const nodeId = String(node.id());
      expect(
        normalizeColor(String(node.style('background-color') || '')),
        `Bubble node color for ${nodeId}`,
      ).to.equal(baseline[nodeId]);
    });
  });
};

const getCommonLinkClusters = (): Cypress.Chainable<[string, string]> => {
  return cy.window().then((win: unknown) => {
    const typedWindow = win as DashboardWindow;
    const twoDClusters = new Set(
      typedWindow.commonService.visuals.twoD.cy
        .edges(':visible')
        .map((edge: any) => String(edge.data('cluster'))),
    );
    const mapClusters = new Set(
      typedWindow.commonService.visuals.gisMap.layers.links
        .getLayers()
        .map((layer: any) => String(layer?.data?.cluster)),
    );

    const common = [...twoDClusters]
      .filter((cluster) => mapClusters.has(cluster))
      .sort((a, b) => Number(a) - Number(b));

    expect(common.length, 'common link clusters across dashboard views').to.be.greaterThan(1);
    return [common[0], common[1]];
  });
};

const readUniformColor = (values: string[], label: string): string => {
  expect(values.length, `${label} values`).to.be.greaterThan(0);
  const normalized = values.map((value) => normalizeColor(value));
  normalized.forEach((value) => {
    expect(value, `${label} uniform color`).to.equal(normalized[0]);
  });
  return normalized[0];
};

const readNodeCategoryColorState = (
  field: string,
  targetValue: string,
  controlValue: string,
  bubbleTargetNodeId: string,
  bubbleControlNodeId: string,
): Cypress.Chainable<NodeCategoryColorState> => {
  return cy.window().then((win: unknown) => {
    const typedWindow = win as DashboardWindow;
    const twoD = typedWindow.commonService.visuals.twoD.cy;
    const bubble = typedWindow.commonService.visuals.bubble;
    const map = typedWindow.commonService.visuals.gisMap;

    const twoDControl = readUniformColor(
      twoD.nodes(':visible')
        .filter((node: any) => !node.hasClass('parent') && String(node.data(field)) === controlValue)
        .map((node: any) => String(node.style('background-color') || '')),
      `2D node ${field} ${controlValue}`,
    );
    readUniformColor(
      twoD.nodes(':visible')
        .filter((node: any) => !node.hasClass('parent') && String(node.data(field)) === targetValue)
        .map((node: any) => String(node.style('background-color') || '')),
      `2D node ${field} ${targetValue}`,
    );

    const bubbleControlNode = bubble.cy.getElementById(bubbleControlNodeId);
    const bubbleTargetNode = bubble.cy.getElementById(bubbleTargetNodeId);

    expect(bubbleControlNode.empty(), `Bubble control node ${bubbleControlNodeId} present`).to.equal(false);
    expect(bubbleTargetNode.empty(), `Bubble target node ${bubbleTargetNodeId} present`).to.equal(false);

    const bubbleControl = normalizeColor(String(bubbleControlNode.style('background-color') || ''));
    const bubbleTarget = normalizeColor(String(bubbleTargetNode.style('background-color') || ''));

    const mapControl = readUniformColor(
      map.layers.featureGroup
        .getLayers()
        .filter((layer: any) => String(layer?.data?.[field]) === controlValue)
        .map((layer: any) => readRenderedMapNodeStyle(layer).fillColor),
      `Map node ${field} ${controlValue}`,
    );
    readUniformColor(
      map.layers.featureGroup
        .getLayers()
        .filter((layer: any) => String(layer?.data?.[field]) === targetValue)
        .map((layer: any) => readRenderedMapNodeStyle(layer).fillColor),
      `Map node ${field} ${targetValue}`,
    );

    return {
      bubbleControl,
      bubbleTarget,
      mapControl,
      twoDControl,
    };
  });
};

const assertNodeCategoryColorUpdate = (
  field: string,
  targetValue: string,
  controlValue: string,
  expectedHex: string,
  before: NodeCategoryColorState,
  bubbleTargetNodeId: string,
  bubbleControlNodeId: string,
): void => {
  focusDashboardTab('2D Network');
  cy.window().should((win: unknown) => {
    const cyInstance = (win as DashboardWindow).commonService.visuals.twoD.cy;
    const targetColor = readUniformColor(
      cyInstance.nodes(':visible')
        .filter((node: any) => !node.hasClass('parent') && String(node.data(field)) === targetValue)
        .map((node: any) => String(node.style('background-color') || '')),
      `2D node ${field} ${targetValue} after edit`,
    );
    const controlColor = readUniformColor(
      cyInstance.nodes(':visible')
        .filter((node: any) => !node.hasClass('parent') && String(node.data(field)) === controlValue)
        .map((node: any) => String(node.style('background-color') || '')),
      `2D node ${field} ${controlValue} after edit`,
    );

    expect(matchesExpectedColor(targetColor, expectedHex), '2D target category recolored').to.equal(true);
    expect(controlColor, '2D control category preserved').to.equal(before.twoDControl);
  });

  focusDashboardTab('Bubble');
  cy.window().should((win: unknown) => {
    const bubble = (win as DashboardWindow).commonService.visuals.bubble;
    const bubbleTargetNode = bubble.cy.getElementById(bubbleTargetNodeId);
    const bubbleControlNode = bubble.cy.getElementById(bubbleControlNodeId);

    expect(bubbleTargetNode.empty(), `Bubble target node ${bubbleTargetNodeId} present after edit`).to.equal(false);
    expect(bubbleControlNode.empty(), `Bubble control node ${bubbleControlNodeId} present after edit`).to.equal(false);

    const targetColor = normalizeColor(String(bubbleTargetNode.style('background-color') || ''));
    const controlColor = normalizeColor(String(bubbleControlNode.style('background-color') || ''));

    expect(matchesExpectedColor(targetColor, expectedHex), 'Bubble target category recolored').to.equal(true);
    expect(targetColor, 'Bubble target category changed from baseline').to.not.equal(before.bubbleTarget);
    expect(controlColor, 'Bubble control category preserved').to.equal(before.bubbleControl);
  });

  focusDashboardTab('Map');
  cy.window().should((win: unknown) => {
    const map = (win as DashboardWindow).commonService.visuals.gisMap;
    const targetColor = readUniformColor(
      map.layers.featureGroup
        .getLayers()
        .filter((layer: any) => String(layer?.data?.[field]) === targetValue)
        .map((layer: any) => readRenderedMapNodeStyle(layer).fillColor),
      `Map node ${field} ${targetValue} after edit`,
    );
    const controlColor = readUniformColor(
      map.layers.featureGroup
        .getLayers()
        .filter((layer: any) => String(layer?.data?.[field]) === controlValue)
        .map((layer: any) => readRenderedMapNodeStyle(layer).fillColor),
      `Map node ${field} ${controlValue} after edit`,
    );

    expect(matchesExpectedColor(targetColor, expectedHex), 'Map target category recolored').to.equal(true);
    expect(controlColor, 'Map control category preserved').to.equal(before.mapControl);
  });
};

const readLinkCategoryColorState = (targetCluster: string, controlCluster: string): Cypress.Chainable<LinkCategoryColorState> => {
  return cy.window().then((win: unknown) => {
    const typedWindow = win as DashboardWindow;
    const twoD = typedWindow.commonService.visuals.twoD.cy;
    const map = typedWindow.commonService.visuals.gisMap;

    const twoDControl = readUniformColor(
      twoD.edges(':visible')
        .filter((edge: any) => String(edge.data('cluster')) === controlCluster)
        .map((edge: any) => String(edge.style('line-color') || '')),
      `2D link cluster ${controlCluster}`,
    );
    readUniformColor(
      twoD.edges(':visible')
        .filter((edge: any) => String(edge.data('cluster')) === targetCluster)
        .map((edge: any) => String(edge.style('line-color') || '')),
      `2D link cluster ${targetCluster}`,
    );

    const mapControl = readUniformColor(
      map.layers.links
        .getLayers()
        .filter((layer: any) => String(layer?.data?.cluster) === controlCluster)
        .map((layer: any) => String(layer.options.color || '')),
      `Map link cluster ${controlCluster}`,
    );
    readUniformColor(
      map.layers.links
        .getLayers()
        .filter((layer: any) => String(layer?.data?.cluster) === targetCluster)
        .map((layer: any) => String(layer.options.color || '')),
      `Map link cluster ${targetCluster}`,
    );

    return {
      mapControl,
      twoDControl,
    };
  });
};

const assertLinkCategoryColorUpdate = (
  targetCluster: string,
  controlCluster: string,
  expectedHex: string,
  before: LinkCategoryColorState,
): void => {
  focusDashboardTab('2D Network');
  cy.window().should((win: unknown) => {
    const cyInstance = (win as DashboardWindow).commonService.visuals.twoD.cy;
    const targetColor = readUniformColor(
      cyInstance.edges(':visible')
        .filter((edge: any) => String(edge.data('cluster')) === targetCluster)
        .map((edge: any) => String(edge.style('line-color') || '')),
      `2D link cluster ${targetCluster} after edit`,
    );
    const controlColor = readUniformColor(
      cyInstance.edges(':visible')
        .filter((edge: any) => String(edge.data('cluster')) === controlCluster)
        .map((edge: any) => String(edge.style('line-color') || '')),
      `2D link cluster ${controlCluster} after edit`,
    );

    expect(matchesExpectedColor(targetColor, expectedHex), '2D target link cluster recolored').to.equal(true);
    expect(controlColor, '2D control link cluster preserved').to.equal(before.twoDControl);
  });

  focusDashboardTab('Map');
  cy.window().should((win: unknown) => {
    const map = (win as DashboardWindow).commonService.visuals.gisMap;
    const targetColor = readUniformColor(
      map.layers.links
        .getLayers()
        .filter((layer: any) => String(layer?.data?.cluster) === targetCluster)
        .map((layer: any) => String(layer.options.color || '')),
      `Map link cluster ${targetCluster} after edit`,
    );
    const controlColor = readUniformColor(
      map.layers.links
        .getLayers()
        .filter((layer: any) => String(layer?.data?.cluster) === controlCluster)
        .map((layer: any) => String(layer.options.color || '')),
      `Map link cluster ${controlCluster} after edit`,
    );

    expect(matchesExpectedColor(targetColor, expectedHex), 'Map target link cluster recolored').to.equal(true);
    expect(controlColor, 'Map control link cluster preserved').to.equal(before.mapControl);
  });
};

const prepareDashboard = (): void => {
  const profile = getProfile('map-covid-zipcode-threshold');

  launchProfileToTwoD(profile);
  assertAfterLaunchCounts(profile);
  openDashboardViews(['Map', 'Bubble', 'Table', 'Aggregate', 'Crosstab', 'Waterfall']);
  closeDialogIfPresent('Aggregate Settings');
  closeDialogIfPresent('Crosstab Settings');
  configureDashboardMapZipcode('Off');
  assertOpenDashboardTabs(DASHBOARD_TABS);
  waitForProcessingDialogToClear();
  assertNoDashboardRuntimeBanner();
};

describe('Journey Flow - Dashboard global styling propagation', () => {
  it('propagates fixed and targeted node color changes only to 2D Map and Bubble while non-target dashboard views stay data-stable', () => {
    const fixedNodeColor = '#224466';
    const targetedNodeColor = '#336699';
    const nodeColorField = 'Profession';
    const targetCategory = 'Healthcare';
    const controlCategory = 'Education';
    const bubbleTargetNodeId = 'MZ797703';
    const bubbleControlNodeId = 'MZ797980';

    prepareDashboard();
    snapshotNonTargetViews('nodeStyleBaseline');

    openGlobalStylingTab();
    selectPrimeOption('#node-color-variable', 'None');
    cy.get('#node-color').invoke('val', fixedNodeColor).trigger('input').trigger('change');
    cy.window().its('commonService.session.style.widgets.node-color').should('equal', fixedNodeColor);
    cy.closeGlobalSettings();
    waitForProcessingDialogToClear();
    assertNoDashboardRuntimeBanner();

    assertAllVisibleTwoDNodeColors(fixedNodeColor);
    assertAllVisibleBubbleNodeColors(fixedNodeColor);
    assertAllRenderedMapNodeColors(fixedNodeColor);

    openGlobalStylingTab();
    selectPrimeOption('#node-color-variable', nodeColorField);
    cy.window().its('commonService.session.style.widgets.node-color-variable').should('equal', nodeColorField);
    cy.get('#key-tables-node-table', { timeout: 15000 }).should('be.visible');

    readNodeCategoryColorState(
      nodeColorField,
      targetCategory,
      controlCategory,
      bubbleTargetNodeId,
      bubbleControlNodeId,
    ).then((before) => {
      changeColorTableEntry('#key-tables-node-table', targetCategory, targetedNodeColor);
      cy.closeGlobalSettings();
      waitForProcessingDialogToClear();
      assertNoDashboardRuntimeBanner();
      assertNodeCategoryColorUpdate(
        nodeColorField,
        targetCategory,
        controlCategory,
        targetedNodeColor,
        before,
        bubbleTargetNodeId,
        bubbleControlNodeId,
      );
    });

    assertNonTargetViewsStable('nodeStyleBaseline');
  });

  it('propagates fixed and targeted link color changes only to 2D and Map while Bubble and non-target dashboard views stay stable', () => {
    const fixedLinkColor = '#884422';
    const targetedLinkColor = '#cc5500';

    prepareDashboard();
    snapshotNonTargetViews('linkStyleBaseline');

    snapshotBubbleNodeColors().then((bubbleBaselineColors) => {
      openGlobalStylingTab();
      selectPrimeOption('#link-tooltip-variable', 'None');
      cy.get('#link-color').invoke('val', fixedLinkColor).trigger('input').trigger('change');
      cy.window().its('commonService.session.style.widgets.link-color').should('equal', fixedLinkColor);
      cy.closeGlobalSettings();
      waitForProcessingDialogToClear();
      assertNoDashboardRuntimeBanner();

      assertAllVisibleTwoDEdgeColors(fixedLinkColor);
      assertAllRenderedMapLinkColors(fixedLinkColor);
      assertBubbleNodeColorsStable(bubbleBaselineColors);

      focusDashboardTab('2D Network');
      openGlobalStylingTab();
      selectPrimeOption('#link-tooltip-variable', 'Cluster');
      cy.window().its('commonService.session.style.widgets.link-color-variable').should('equal', 'cluster');
      cy.get('#key-tables-link-table', { timeout: 15000 }).should('be.visible');

      getCommonLinkClusters().then(([targetCluster, controlCluster]) => {
        readLinkCategoryColorState(targetCluster, controlCluster).then((before) => {
          changeColorTableEntry('#key-tables-link-table', targetCluster, targetedLinkColor);
          cy.closeGlobalSettings();
          waitForProcessingDialogToClear();
          assertNoDashboardRuntimeBanner();
          assertLinkCategoryColorUpdate(targetCluster, controlCluster, targetedLinkColor, before);
          assertBubbleNodeColorsStable(bubbleBaselineColors);
        });
      });
    });

    assertNonTargetViewsStable('linkStyleBaseline');
  });
});
