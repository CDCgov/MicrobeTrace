/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  expandAccordionTabByHeader,
  launchProfileToTwoD,
  openGlobalStylingTab,
  openTwoDSettingsDialog,
} from '../../../support/journey-helpers';

type KeyTableName = 'node-color' | 'link-color' | 'node-shape';
type KeyTableDisplayMode = 'Show' | 'Dock' | 'Hide';

type WinWithMT = Window & {
  commonService: any;
  cytoscapeInstance?: any;
};

type DockState = Record<KeyTableName, boolean>;

const FLOATING_DIALOG_SELECTORS: Record<KeyTableName, string> = {
  'node-color': '#global-settings-node-color-table',
  'link-color': '#global-settings-link-color-table',
  'node-shape': '#global-settings-node-shape-table',
};

const DOCKED_CARD_TITLES: Record<KeyTableName, string> = {
  'node-color': 'Node Colors',
  'link-color': 'Link Colors',
  'node-shape': 'Node Shapes',
};

const profile = getProfile('color-by-uploaded-categorical');
const groupingProfile = getProfile('grouping-tn93-sequences-subtype-colors-threshold');

const DOCKED_GROUP_COLOR_TABLE_SELECTOR = '#key-tables-polygon-color-table';
const DOCKED_GROUP_COLOR_CARD_TITLE = '2D Group Colors';
const FLOATING_GROUP_COLOR_TABLE_SELECTOR = '#polygon-color-table';

const normalizeColor = (value: string): string => String(value || '').replace(/\s+/g, '').toLowerCase();

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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

const getApp = (win: WinWithMT) => {
  const app = win.commonService?.visuals?.microbeTrace;

  expect(app, 'microbeTrace host app').to.exist;
  expect(app?._goldenLayoutHostComponent, 'golden layout host').to.exist;

  return app;
};

const clickVisiblePrimeOption = (label: string): void => {
  cy.get('.p-select-overlay:visible, .p-dropdown-panel:visible', { timeout: 15000 })
    .last()
    .contains('li[role="option"]', new RegExp(`^${escapeRegExp(label)}$`), { timeout: 15000 })
    .scrollIntoView()
    .should('be.visible')
    .click({ force: true });
};

const selectPrimeOption = (selector: string, label: string): void => {
  cy.get(selector).click({ force: true });
  clickVisiblePrimeOption(label);
};

const closeGlobalSettingsIfVisible = (): void => {
  cy.get('body').then(($body) => {
    const hasVisibleGlobalSettings =
      $body.find('.p-dialog:visible .p-dialog-title:contains("Global Settings")').length > 0;

    if (hasVisibleGlobalSettings) {
      cy.closeGlobalSettings();
    }
  });
};

const closeTwoDSettingsIfVisible = (): void => {
  cy.get('body').then(($body) => {
    const hasVisibleTwoDSettings =
      $body.find('.p-dialog:visible .p-dialog-title:contains("2D Network Settings")').length > 0;

    if (hasVisibleTwoDSettings) {
      cy.contains('.p-dialog-title', '2D Network Settings')
        .parents('.p-dialog')
        .find('button.p-dialog-close-button')
        .click({ force: true });
      cy.contains('.p-dialog-title', '2D Network Settings').should('not.exist');
    }
  });
};

const assertFloatingDialogVisible = (table: KeyTableName, shouldBeVisible: boolean): void => {
  const selector = FLOATING_DIALOG_SELECTORS[table];

  if (shouldBeVisible) {
    cy.get(selector, { timeout: 15000 }).should('be.visible');
    return;
  }

  cy.get('body').then(($body) => {
    if (!$body.find(selector).length) return;
    cy.get(selector).should('not.be.visible');
  });
};

const assertFloatingGroupColorTableVisible = (shouldBeVisible: boolean): void => {
  if (shouldBeVisible) {
    cy.get(FLOATING_GROUP_COLOR_TABLE_SELECTOR, { timeout: 15000 }).should('be.visible');
    return;
  }

  cy.get('body').then(($body) => {
    if (!$body.find(FLOATING_GROUP_COLOR_TABLE_SELECTOR).length) return;
    cy.get(FLOATING_GROUP_COLOR_TABLE_SELECTOR).should('not.be.visible');
  });
};

const assertDockedState = (expected: DockState): void => {
  cy.window().should((win: unknown) => {
    const app = getApp(win as WinWithMT);

    (Object.keys(expected) as KeyTableName[]).forEach((table) => {
      expect(app.isKeyTableDocked(table), `docked state for ${table}`).to.equal(expected[table]);
    });
  });
};

const assertGroupColorTableDockedState = (shouldBeDocked: boolean): void => {
  cy.window().should((win: unknown) => {
    const typedWindow = win as WinWithMT;
    expect(
      !!typedWindow.commonService.visuals.twoD?.isPolygonColorTableDocked,
      'group color table docked state',
    ).to.equal(shouldBeDocked);
  });
};

const assertDockedViewOpen = (shouldBeOpen: boolean): void => {
  cy.window().should((win: unknown) => {
    const app = getApp(win as WinWithMT);
    const hasDockedTab = app.homepageTabs.some((tab: any) => tab.label === 'Docked Key Tables');

    expect(hasDockedTab, 'Docked Key Tables tab open').to.equal(shouldBeOpen);
  });
};

const assertActiveTab = (expectedTab: string): void => {
  cy.window().its('commonService.activeTab').should('equal', expectedTab);
};

const focusAppTab = (tabLabel: string): void => {
  cy.window().then((win: unknown) => {
    const typedWindow = win as WinWithMT;
    const app = getApp(typedWindow);
    const tabIndex = app.homepageTabs.findIndex((tab: any) => tab.label === tabLabel);

    expect(tabIndex, `tab index for ${tabLabel}`).to.be.greaterThan(-1);

    app._goldenLayoutHostComponent.focusComponent(tabLabel);
    app.setActiveTabProperties(tabIndex);
  });

  cy.wait(50, { log: false });
  assertActiveTab(tabLabel);
};

const TABLE_MODE_ROW_SELECTORS: Record<KeyTableName, string> = {
  'node-color': '#node-color-table-row',
  'link-color': '#link-color-table-row',
  'node-shape': '#node-shape-table-row',
};

const setGlobalKeyTableMode = (table: KeyTableName, mode: KeyTableDisplayMode): void => {
  cy.get(TABLE_MODE_ROW_SELECTORS[table], { timeout: 15000 })
    .scrollIntoView()
    .should('be.visible')
    .contains('.p-togglebutton-label', mode)
    .click({ force: true });
};

const assertKeyTableDisplayModes = (expectedMode: KeyTableDisplayMode): void => {
  cy.window().should((win: unknown) => {
    const app = getApp(win as WinWithMT);

    expect(app.SelectedNodeColorTableTypesVariable, 'node color display mode').to.equal(expectedMode);
    expect(app.SelectedLinkColorTableTypesVariable, 'link color display mode').to.equal(expectedMode);
    expect(app.SelectedNodeShapeTableTypesVariable, 'node shape display mode').to.equal(expectedMode);
    expect(
      (win as WinWithMT).commonService.session.style.widgets['node-symbol-table-visible'],
      'node shape widget display mode',
    ).to.equal(expectedMode);
  });
};

const enableKeyTablesFromGlobalSettings = (mode: KeyTableDisplayMode = 'Dock'): void => {
  openGlobalStylingTab();
  selectPrimeOption('#node-color-variable', 'State');
  selectPrimeOption('#link-tooltip-variable', 'Contact type');
  selectPrimeOption('#node-symbol-variable', 'State');

  if (mode !== 'Dock') {
    setGlobalKeyTableMode('node-color', mode);
    setGlobalKeyTableMode('link-color', mode);
    setGlobalKeyTableMode('node-shape', mode);
  }

  cy.window()
    .its('commonService.session.style.widgets')
    .should((widgets) => {
      expect(widgets['node-color-variable']).to.equal('State');
      expect(widgets['link-color-variable']).to.equal('Contact type');
      expect(widgets['node-symbol-variable']).to.equal('State');
    });
  assertKeyTableDisplayModes(mode);

  cy.closeGlobalSettings();
};

const dockFloatingTable = (table: KeyTableName): void => {
  cy.get(FLOATING_DIALOG_SELECTORS[table], { timeout: 15000 })
    .should('be.visible')
    .find('button[title="Dock table"]')
    .click({ force: true });
};

const getDockedCard = (table: KeyTableName): Cypress.Chainable<JQuery<HTMLElement>> => {
  return cy.contains('.key-table-card__header h5', DOCKED_CARD_TITLES[table], { timeout: 15000 })
    .parents('.key-table-card')
    .first();
};

const floatDockedTable = (table: KeyTableName): void => {
  getDockedCard(table)
    .find('button[title="Float table"]')
    .click({ force: true });
};

const dockFloatingGroupColorTable = (): void => {
  cy.get(FLOATING_GROUP_COLOR_TABLE_SELECTOR, { timeout: 15000 })
    .should('be.visible')
    .parents('.p-dialog')
    .find('button[title="Dock table"]')
    .click({ force: true });
};

const getDockedGroupColorCard = (): Cypress.Chainable<JQuery<HTMLElement>> => {
  return cy.contains('.key-table-card__header h5', DOCKED_GROUP_COLOR_CARD_TITLE, { timeout: 15000 })
    .parents('.key-table-card')
    .first();
};

const floatDockedGroupColorTable = (): void => {
  getDockedGroupColorCard()
    .find('button[title="Float table"]')
    .click({ force: true });
};

const selectDockedCardVariable = (table: KeyTableName, optionLabel: string): void => {
  cy.window().then((win: unknown) => {
    const typedWindow = win as WinWithMT;
    const keyTables = typedWindow.commonService.visuals.keyTables;

    expect(keyTables, 'Docked key tables component').to.exist;

    if (table === 'node-color') {
      keyTables.onNodeColorByChange(optionLabel);
    } else if (table === 'link-color') {
      keyTables.onLinkColorByChange(optionLabel);
    } else {
      keyTables.onNodeShapeByChange(optionLabel);
    }
  });

  getDockedCard(table)
    .find('.p-select-label')
    .should('contain', optionLabel);
};

const readDockedColorTableValues = (selector: '#key-tables-node-table' | '#key-tables-link-table') => {
  return cy.get(selector, { timeout: 15000 }).then(($table) =>
    $table.find('td[data-value]')
      .toArray()
      .map((cell) => String(cell.getAttribute('data-value') || ''))
      .filter(Boolean),
  );
};

const readDockedNodeShapeValues = () => {
  return cy.get('#key-tables-node-shape-table', { timeout: 15000 }).then(($table) =>
    $table.find('tr')
      .toArray()
      .slice(1)
      .map((row) => String(row.querySelector('td')?.textContent || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean),
  );
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

const editTableLabel = (tableSelector: string, value: string, nextLabel: string): void => {
  cy.get(`${tableSelector} td[data-value="${value}"]`, { timeout: 15000 })
    .should('have.length.at.least', 1)
    .first()
    .scrollIntoView()
    .should('be.visible')
    .then(($cell) => {
      const cell = $cell.get(0);
      const eventWindow = cell.ownerDocument.defaultView ?? window;
      cell.setAttribute('contenteditable', 'true');
      cell.focus();
      cell.textContent = nextLabel;
      cell.dispatchEvent(new eventWindow.FocusEvent('blur'));
      cell.dispatchEvent(new eventWindow.Event('focusout', { bubbles: true }));
    });

  cy.get(`${tableSelector} td[data-value="${value}"]`, { timeout: 15000 })
    .should('have.length.at.least', 1)
    .first()
    .scrollIntoView()
    .should('be.visible')
    .should(($cell) => {
      expect(String($cell.text()).replace(/\s+/g, ' ').trim()).to.equal(nextLabel);
    });
};

const assertTableLabel = (tableSelector: string, value: string, expectedLabel: string): void => {
  cy.get(`${tableSelector} td[data-value="${value}"]`, { timeout: 15000 })
    .should('have.length.at.least', 1)
    .first()
    .scrollIntoView()
    .should('be.visible')
    .should(($cell) => {
      const tableId = $cell.closest('table').attr('id') || '(no table)';
      const cardTitle = $cell.closest('.key-table-card').find('.key-table-card__header h5').text().trim();
      const details = `${tableId}:${cardTitle || '(no card)'}:${String($cell.text()).replace(/\s+/g, ' ').trim()}`;

      expect(
        String($cell.text()).replace(/\s+/g, ' ').trim(),
        `label for ${tableSelector} ${value}: ${details}`,
      ).to.equal(expectedLabel);
    });
};

const renderedHeaderCells = ($cells: JQuery<HTMLElement>, tableSelector: string): JQuery<HTMLElement> => (
  $cells.filter((_index, cell) => {
    const $table = Cypress.$(cell).closest('table');

    return $table.is(tableSelector) && (
      $table.is(':visible') ||
      $table.find('td:visible, input:visible, select:visible').length > 0
    );
  }) as JQuery<HTMLElement>
);

const editTableHeader = (
  tableSelector: string,
  tableKey: string,
  columnKey: string,
  nextLabel: string,
): void => {
  cy.get(`${tableSelector} [data-table-key="${tableKey}"][data-column-key="${columnKey}"]`, { timeout: 15000 })
    .should(($cells) => {
      expect(renderedHeaderCells($cells, tableSelector).length).to.be.at.least(1);
    })
    .then(($cells) => {
      const cell = renderedHeaderCells($cells, tableSelector).get(0);
      const eventWindow = cell.ownerDocument.defaultView ?? window;
      cell.focus();
      cell.textContent = nextLabel;
      cell.dispatchEvent(new eventWindow.FocusEvent('blur'));
      cell.dispatchEvent(new eventWindow.Event('focusout', { bubbles: true }));
    });

  assertTableHeader(tableSelector, tableKey, columnKey, nextLabel);
};

const assertTableHeader = (
  tableSelector: string,
  tableKey: string,
  columnKey: string,
  expectedLabel: string,
): void => {
  cy.get(`${tableSelector} [data-table-key="${tableKey}"][data-column-key="${columnKey}"]`, { timeout: 15000 })
    .should(($cells) => {
      expect(renderedHeaderCells($cells, tableSelector).length).to.be.at.least(1);
    })
    .should(($cells) => {
      const $headers = renderedHeaderCells($cells, tableSelector);
      const details = $headers.toArray().map((cell, index) => {
        const $cell = Cypress.$(cell);
        const tableId = $cell.closest('table').attr('id') || '(no table)';
        const text = String($cell.text()).replace(/\s+/g, ' ').trim();

        return `${index}:${tableId}:${text}`;
      }).join(' | ');

      $headers.toArray().forEach((cell) => {
        expect(
          String(Cypress.$(cell).text()).replace(/\s+/g, ' ').trim(),
          `rendered headers for ${tableSelector} ${tableKey}.${columnKey}: ${details}`,
        ).to.equal(expectedLabel);
      });
    });
};

const getVisibleLeafNodesByValue = (win: WinWithMT, field: string, value: string) => {
  const cyInstance = win.cytoscapeInstance;

  expect(cyInstance, 'cytoscapeInstance').to.exist;

  return cyInstance
    .nodes(':visible')
    .filter((node: any) => node.children().length === 0 && String(node.data(field)) === value);
};

const setFirstVisibleLeafNodeFieldToNull = (field: string): Cypress.Chainable<string> => {
  return cy.window().then((win: unknown) => {
    const typedWindow = win as WinWithMT;
    const cyInstance = typedWindow.cytoscapeInstance;

    expect(cyInstance, 'cytoscapeInstance').to.exist;

    const leafNode = cyInstance
      .nodes(':visible')
      .filter((node: any) => node.children().length === 0)
      .first();

    expect(leafNode.empty(), `visible leaf node for ${field} null bucket`).to.equal(false);

    const nodeId = String(leafNode.id());
    const sessionNode = typedWindow.commonService.session.data.nodes.find((node: any) =>
      String(node.id ?? node._id) === nodeId || String(node._id ?? node.id) === nodeId,
    );

    expect(sessionNode, `session node for ${nodeId}`).to.exist;

    sessionNode[field] = null;
    leafNode.data(field, null);

    return nodeId;
  });
};

const getVisibleEdgesByValue = (win: WinWithMT, field: string, value: string) => {
  const cyInstance = win.cytoscapeInstance;

  expect(cyInstance, 'cytoscapeInstance').to.exist;

  return cyInstance
    .edges(':visible')
    .filter((edge: any) => String(edge.data(field)) === value);
};

const getParentGroupNode = (win: WinWithMT, groupKey: string) => {
  const cyInstance = win.cytoscapeInstance;

  expect(cyInstance, 'cytoscapeInstance').to.exist;

  const direct = cyInstance.getElementById(String(groupKey));
  if (direct && !direct.empty()) return direct;

  return cyInstance.getElementById(`group-${String(groupKey)}`);
};

const getRenderedShapeKey = (node: any): string => String(node.data('shapeKey') || node.style('shape') || '').trim();

const assertNodeColorTableState = (variable: string, value: string, expectedColor: string): void => {
  cy.window().should((win: unknown) => {
    const typedWindow = win as WinWithMT;
    const keys = typedWindow.commonService.session.style.nodeColorsTableKeys?.[variable] || [];
    const colors = typedWindow.commonService.session.style.nodeColorsTable?.[variable] || [];
    const index = keys.findIndex((candidate: any) => String(candidate) === value);

    expect(index, `node color table index for ${value}`).to.be.greaterThan(-1);
    expect(String(colors[index] || '').toLowerCase(), `stored node color for ${value}`)
      .to.equal(expectedColor.toLowerCase());
  });
};

const assertLinkColorTableState = (variable: string, value: string, expectedColor: string): void => {
  cy.window().should((win: unknown) => {
    const typedWindow = win as WinWithMT;
    const keys = typedWindow.commonService.session.style.linkColorsTableKeys?.[variable] || [];
    const colors = typedWindow.commonService.session.style.linkColorsTable?.[variable] || [];
    const index = keys.findIndex((candidate: any) => String(candidate) === value);

    expect(index, `link color table index for ${value}`).to.be.greaterThan(-1);
    expect(String(colors[index] || '').toLowerCase(), `stored link color for ${value}`)
      .to.equal(expectedColor.toLowerCase());
  });
};

const assertNodeShapeTableState = (variable: string, value: string, expectedShapeKey: string): void => {
  cy.window().should((win: unknown) => {
    const typedWindow = win as WinWithMT;
    const keys = typedWindow.commonService.session.style.nodeSymbolsTableKeys?.[variable] || [];
    const shapes = typedWindow.commonService.session.style.nodeSymbolsTable?.[variable] || [];
    const index = keys.findIndex((candidate: any) => String(candidate) === value);

    expect(index, `node shape table index for ${value}`).to.be.greaterThan(-1);
    expect(String(shapes[index] || ''), `stored node shape for ${value}`).to.equal(expectedShapeKey);
  });
};

const assertNodeValueName = (value: string, expectedName: string): void => {
  cy.window().should((win: unknown) => {
    const typedWindow = win as WinWithMT;
    expect(
      typedWindow.commonService.session.style.nodeValueNames?.[value],
      `stored display name for ${value}`,
    ).to.equal(expectedName);
  });
};

const assertPolygonValueName = (value: string, expectedName: string): void => {
  cy.window().should((win: unknown) => {
    const typedWindow = win as WinWithMT;
    expect(
      typedWindow.commonService.session.style.polygonValueNames?.[value],
      `stored group display name for ${value}`,
    ).to.equal(expectedName);
  });
};

const assertKeyTableColumnName = (table: string, column: string, expectedName: string): void => {
  cy.window().should((win: unknown) => {
    const typedWindow = win as WinWithMT;
    expect(
      typedWindow.commonService.session.style.keyTableColumnNames?.[`${table}.${column}`],
      `stored column name for ${table}.${column}`,
    ).to.equal(expectedName);
  });
};

const assertGroupColorTableState = (groupValue: string, expectedColor: string): void => {
  cy.window().should((win: unknown) => {
    const typedWindow = win as WinWithMT;
    const groupDefinitions = typedWindow.commonService.temp.polygonGroups || [];
    const groupColors = typedWindow.commonService.session.style.polygonColors || [];
    const index = groupDefinitions.findIndex((group: any) => String(group.key) === groupValue);

    expect(index, `group color table index for ${groupValue}`).to.be.greaterThan(-1);
    expect(String(groupColors[index] || '').toLowerCase(), `stored group color for ${groupValue}`)
      .to.equal(expectedColor.toLowerCase());
    expect(
      String(typedWindow.commonService.temp.style.polygonColorMap(groupValue) || '').toLowerCase(),
      `group color map value for ${groupValue}`,
    ).to.equal(expectedColor.toLowerCase());
  });
};

const updateDockedNodeShapeEntry = (groupValue: string, nextShapeKey: string): void => {
  cy.window().then((win: unknown) => {
    const typedWindow = win as WinWithMT;
    const app = getApp(typedWindow);
    const keyTables = typedWindow.commonService.visuals.keyTables;
    const selectedNode = app.getNodeShapeTreeSelection(nextShapeKey);

    expect(selectedNode, `shape tree selection for ${nextShapeKey}`).to.exist;
    expect(keyTables, 'Docked key tables component').to.exist;

    keyTables.onNodeShapeTableTreeChange(selectedNode, groupValue);
    typedWindow.commonService.visuals.twoD?.updateNodeShapes?.();
    keyTables.refreshTables?.();
  });
};

const openTwoDGroupingTab = (): void => {
  openTwoDSettingsDialog();
  cy.get('@twoDSettings').contains('.nav-link', 'Grouping').click({ force: true });
  cy.get('@twoDSettings')
    .find('.tab-pane:visible', { timeout: 15000 })
    .should('exist')
    .as('groupingTab');
};

const enableFloatingGroupColorTable = (groupByLabel: 'Subtype' | 'Cluster' = 'Subtype'): void => {
  openTwoDGroupingTab();

  expandAccordionTabByHeader('@groupingTab', 'Controls');
  cy.get('@groupingTab')
    .find('#polygons-controls')
    .should('exist')
    .within(() => {
      cy.get('#polygons-show-toggle').contains('Show').click({ force: true });
    });

  cy.window().its('commonService.session.style.widgets.polygons-show').should('equal', true);

  if (groupByLabel === 'Subtype') {
    selectPrimeOption('#polygons-foci', 'Subtype');
    cy.window().its('commonService.session.style.widgets.polygons-foci').should('equal', 'subtype');
  } else {
    cy.window().its('commonService.session.style.widgets.polygons-foci').should('equal', 'cluster');
  }

  expandAccordionTabByHeader('@groupingTab', 'Colors');
  cy.get('@groupingTab')
    .find('#colorPolygons')
    .contains('Show')
    .click({ force: true });
  cy.window().its('commonService.session.style.widgets.polygons-color-show').should('equal', true);

  cy.get('@groupingTab')
    .find('#polygon-color-table-row')
    .scrollIntoView()
    .should('exist')
    .within(() => {
      cy.get('#polygon-color-table-toggle').contains('Show').click({ force: true });
    });

  cy.window().its('commonService.session.style.widgets.polygon-color-table-visible').should('equal', 'Show');
  closeTwoDSettingsIfVisible();
  assertFloatingGroupColorTableVisible(true);
};

const clearNodeLinkShapeKeyTables = (): void => {
  cy.window().then((win: unknown) => {
    getApp(win as WinWithMT).resetKeyTablesForNewDataset?.();
  });

  assertDockedViewOpen(false);
};

describe('Journey Flow - Docked key tables on uploaded data', () => {
  afterEach(() => {
    closeGlobalSettingsIfVisible();
    closeTwoDSettingsIfVisible();
  });

  it('docks key tables by default and supports independent dock and float controls', () => {
    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);

    enableKeyTablesFromGlobalSettings('Dock');

    assertActiveTab('2D Network');
    assertDockedState({
      'node-color': true,
      'link-color': true,
      'node-shape': true,
    });
    assertDockedViewOpen(true);
    assertFloatingDialogVisible('node-color', false);
    assertFloatingDialogVisible('link-color', false);
    assertFloatingDialogVisible('node-shape', false);

    focusAppTab('Docked Key Tables');
    cy.get('.key-tables-view', { timeout: 15000 }).should('be.visible');

    floatDockedTable('node-color');
    assertDockedState({
      'node-color': false,
      'link-color': true,
      'node-shape': true,
    });
    assertDockedViewOpen(true);
    assertFloatingDialogVisible('node-color', true);

    floatDockedTable('link-color');
    assertDockedState({
      'node-color': false,
      'link-color': false,
      'node-shape': true,
    });
    assertDockedViewOpen(true);
    assertFloatingDialogVisible('link-color', true);

    floatDockedTable('node-shape');
    assertDockedState({
      'node-color': false,
      'link-color': false,
      'node-shape': false,
    });
    assertDockedViewOpen(false);
    assertFloatingDialogVisible('node-color', true);
    assertFloatingDialogVisible('link-color', true);
    assertFloatingDialogVisible('node-shape', true);
    assertKeyTableDisplayModes('Show');

    dockFloatingTable('node-color');
    assertDockedState({
      'node-color': true,
      'link-color': false,
      'node-shape': false,
    });
    assertDockedViewOpen(true);
    assertActiveTab('2D Network');
    assertFloatingDialogVisible('node-color', false);
    assertFloatingDialogVisible('link-color', true);
    assertFloatingDialogVisible('node-shape', true);

    dockFloatingTable('link-color');
    assertDockedState({
      'node-color': true,
      'link-color': true,
      'node-shape': false,
    });
    assertDockedViewOpen(true);
    assertActiveTab('2D Network');
    assertFloatingDialogVisible('node-color', false);
    assertFloatingDialogVisible('link-color', false);
    assertFloatingDialogVisible('node-shape', true);

    dockFloatingTable('node-shape');
    assertDockedState({
      'node-color': true,
      'link-color': true,
      'node-shape': true,
    });
    assertDockedViewOpen(true);
    assertActiveTab('2D Network');
    assertFloatingDialogVisible('node-color', false);
    assertFloatingDialogVisible('link-color', false);
    assertFloatingDialogVisible('node-shape', false);
    assertKeyTableDisplayModes('Dock');
  });

  it('lets docked node-color, link-color, and node-shape cards switch their backing variables', () => {
    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);

    enableKeyTablesFromGlobalSettings('Dock');
    assertDockedState({
      'node-color': true,
      'link-color': true,
      'node-shape': true,
    });

    selectDockedCardVariable('node-color', 'State');
    cy.window().its('commonService.session.style.widgets.node-color-variable').should('equal', 'State');
    readDockedColorTableValues('#key-tables-node-table').should((values) => {
      expect(values, 'node-color State categories').to.include('Florida');
      expect(values, 'node-color State categories').to.include('Texas');
    });

    selectDockedCardVariable('node-color', 'Profession');
    cy.window().its('commonService.session.style.widgets.node-color-variable').should('equal', 'Profession');
    readDockedColorTableValues('#key-tables-node-table').should((values) => {
      expect(values, 'node-color Profession categories').to.include('Healthcare');
      expect(values, 'node-color Profession categories').to.include('Education');
      expect(values, 'node-color Profession categories').not.to.include('Florida');
    });

    selectDockedCardVariable('link-color', 'Contact type');
    cy.window().its('commonService.session.style.widgets.link-color-variable').should('equal', 'Contact type');
    readDockedColorTableValues('#key-tables-link-table').should((values) => {
      expect(values, 'link-color Contact type categories').to.include('sports team');
      expect(values, 'link-color Contact type categories').to.include('classroom');
    });

    selectDockedCardVariable('link-color', 'Exposure');
    cy.window().its('commonService.session.style.widgets.link-color-variable').should('equal', 'Exposure');
    readDockedColorTableValues('#key-tables-link-table').should((values) => {
      expect(values, 'link-color Exposure categories').to.include('high');
      expect(values, 'link-color Exposure categories').to.include('low');
      expect(values, 'link-color Exposure categories').not.to.include('sports team');
    });

    selectDockedCardVariable('node-shape', 'State');
    cy.window().its('commonService.session.style.widgets.node-symbol-variable').should('equal', 'State');
    readDockedNodeShapeValues().should((values) => {
      expect(values, 'node-shape State categories').to.include('Florida');
      expect(values, 'node-shape State categories').to.include('Texas');
    });

    selectDockedCardVariable('node-shape', 'Node type');
    cy.window().its('commonService.session.style.widgets.node-symbol-variable').should('equal', 'Node type');
    readDockedNodeShapeValues().should((values) => {
      expect(values, 'node-shape Node type categories').to.include('Person');
      expect(values, 'node-shape Node type categories').to.include('Facility');
      expect(values, 'node-shape Node type categories').not.to.include('Florida');
    });

    assertFloatingDialogVisible('node-color', false);
    assertFloatingDialogVisible('link-color', false);
    assertFloatingDialogVisible('node-shape', false);
  });

  it('lets docked cards edit category-specific node colors, link colors, and node shapes', () => {
    const updatedFloridaColor = '#ff0000';
    const updatedSportsTeamColor = '#0055aa';
    const updatedFloridaShape = 'diamond';
    const expectedFloridaColor = normalizeColor(hexToRgbString(updatedFloridaColor));
    const expectedSportsTeamColor = normalizeColor(hexToRgbString(updatedSportsTeamColor));
    let texasBaselineColor = '';
    let texasBaselineShape = '';
    let classroomBaselineColor = '';

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);

    enableKeyTablesFromGlobalSettings('Dock');
    selectDockedCardVariable('node-color', 'State');
    selectDockedCardVariable('link-color', 'Contact type');
    selectDockedCardVariable('node-shape', 'State');

    cy.window().then((win: unknown) => {
      const typedWindow = win as WinWithMT;
      const floridaNodes = getVisibleLeafNodesByValue(typedWindow, 'State', 'Florida');
      const texasNodes = getVisibleLeafNodesByValue(typedWindow, 'State', 'Texas');
      const classroomEdges = getVisibleEdgesByValue(typedWindow, 'Contact type', 'classroom');

      expect(floridaNodes.length, 'Florida nodes present').to.be.greaterThan(0);
      expect(texasNodes.length, 'Texas nodes present').to.be.greaterThan(0);
      expect(classroomEdges.length, 'classroom edges present').to.be.greaterThan(0);

      texasBaselineColor = normalizeColor(String(texasNodes[0].style('background-color') || ''));
      texasBaselineShape = getRenderedShapeKey(texasNodes[0]);
      classroomBaselineColor = normalizeColor(String(classroomEdges[0].style('line-color') || ''));
    });

    changeColorTableEntry('#key-tables-node-table', 'Florida', updatedFloridaColor);
    assertNodeColorTableState('State', 'Florida', updatedFloridaColor);

    changeColorTableEntry('#key-tables-link-table', 'sports team', updatedSportsTeamColor);
    assertLinkColorTableState('Contact type', 'sports team', updatedSportsTeamColor);

    updateDockedNodeShapeEntry('Florida', updatedFloridaShape);
    assertNodeShapeTableState('State', 'Florida', updatedFloridaShape);

    // Hidden-tab shape updates can lag briefly on slower Windows hosts.
    cy.wait(500);

    focusAppTab('2D Network');
    cy.wait(500);

    cy.window().should((win: unknown) => {
      const typedWindow = win as WinWithMT;
      const floridaNodes = getVisibleLeafNodesByValue(typedWindow, 'State', 'Florida');
      const texasNodes = getVisibleLeafNodesByValue(typedWindow, 'State', 'Texas');
      const sportsTeamEdges = getVisibleEdgesByValue(typedWindow, 'Contact type', 'sports team');
      const classroomEdges = getVisibleEdgesByValue(typedWindow, 'Contact type', 'classroom');

      expect(floridaNodes.length, 'Florida nodes after docked edit').to.be.greaterThan(0);
      expect(texasNodes.length, 'Texas nodes after docked edit').to.be.greaterThan(0);
      expect(sportsTeamEdges.length, 'sports team edges after docked edit').to.be.greaterThan(0);
      expect(classroomEdges.length, 'classroom edges after docked edit').to.be.greaterThan(0);

      floridaNodes.forEach((node: any) => {
        expect(
          normalizeColor(String(node.style('background-color') || '')),
          `updated Florida node color for ${node.id()}`,
        ).to.equal(expectedFloridaColor);
        expect(
          getRenderedShapeKey(node),
          `updated Florida node shape for ${node.id()}`,
        ).to.equal(updatedFloridaShape);
      });

      texasNodes.forEach((node: any) => {
        expect(
          normalizeColor(String(node.style('background-color') || '')),
          `unchanged Texas node color for ${node.id()}`,
        ).to.equal(texasBaselineColor);
        expect(
          getRenderedShapeKey(node),
          `unchanged Texas node shape for ${node.id()}`,
        ).to.equal(texasBaselineShape);
      });

      sportsTeamEdges.forEach((edge: any) => {
        expect(
          normalizeColor(String(edge.style('line-color') || '')),
          `updated sports team edge color for ${edge.id()}`,
        ).to.equal(expectedSportsTeamColor);
      });

      classroomEdges.forEach((edge: any) => {
        expect(
          normalizeColor(String(edge.style('line-color') || '')),
          `unchanged classroom edge color for ${edge.id()}`,
        ).to.equal(classroomBaselineColor);
      });
    });
  });

  it('keeps docked node color edits for the (Empty) bucket after table refreshes', () => {
    const updatedEmptyColor = '#00aa88';
    const expectedEmptyColor = normalizeColor(hexToRgbString(updatedEmptyColor));
    let emptyNodeId = '';

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);

    setFirstVisibleLeafNodeFieldToNull('State').then((nodeId) => {
      emptyNodeId = nodeId;
    });

    enableKeyTablesFromGlobalSettings('Dock');
    selectDockedCardVariable('node-color', 'State');
    focusAppTab('Docked Key Tables');

    cy.get('#key-tables-node-table td[data-value="null"]', { timeout: 15000 })
      .should('contain.text', '(Empty)');

    changeColorTableEntry('#key-tables-node-table', 'null', updatedEmptyColor);
    assertNodeColorTableState('State', 'null', updatedEmptyColor);

    cy.window().then((win: unknown) => {
      const typedWindow = win as WinWithMT;
      typedWindow.commonService.visuals.keyTables?.refreshTables?.();
    });

    cy.get('#key-tables-node-table td[data-value="null"]')
      .closest('tr')
      .find('input[type="color"]')
      .should('have.value', updatedEmptyColor);

    focusAppTab('2D Network');

    cy.window().should((win: unknown) => {
      const typedWindow = win as WinWithMT;
      const emptyNode = typedWindow.cytoscapeInstance.getElementById(emptyNodeId);

      expect(emptyNode.empty(), 'empty-bucket node still rendered').to.equal(false);
      expect(
        String(typedWindow.commonService.temp.style.nodeColorMap(null) || '').toLowerCase(),
        'empty-bucket node color map',
      ).to.equal(updatedEmptyColor);
      expect(
        normalizeColor(String(emptyNode.style('background-color') || '')),
        'rendered empty-bucket node color',
      ).to.equal(expectedEmptyColor);
    });
  });

  it('keeps node color and node shape display names across table rebuilds', () => {
    const floridaLabel = 'Florida retained label';
    const personDockedLabel = 'r';
    const personFloatingLabel = 'w';
    const nodeColorHeader = 'Patient State Header';
    const nodeColorCountHeader = 'Patient Count Header';
    const linkColorHeader = 'Exposure Link Header';
    const nodeShapeHeader = 'Node Type Shape Header';
    const updatedFloridaColor = '#cc3300';

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);

    enableKeyTablesFromGlobalSettings('Dock');
    selectDockedCardVariable('node-color', 'State');
    selectDockedCardVariable('link-color', 'Contact type');
    selectDockedCardVariable('node-shape', 'Node type');
    focusAppTab('Docked Key Tables');

    editTableHeader('#key-tables-node-table', 'node-color', 'value', nodeColorHeader);
    editTableHeader('#key-tables-node-table', 'node-color', 'count', nodeColorCountHeader);
    editTableHeader('#key-tables-link-table', 'link-color', 'value', linkColorHeader);
    editTableHeader('#key-tables-node-shape-table', 'node-shape', 'value', nodeShapeHeader);
    assertKeyTableColumnName('node-color', 'value', nodeColorHeader);
    assertKeyTableColumnName('node-color', 'count', nodeColorCountHeader);
    assertKeyTableColumnName('link-color', 'value', linkColorHeader);
    assertKeyTableColumnName('node-shape', 'value', nodeShapeHeader);

    editTableLabel('#key-tables-node-table', 'Florida', floridaLabel);
    assertNodeValueName('Florida', floridaLabel);

    changeColorTableEntry('#key-tables-node-table', 'Florida', updatedFloridaColor);
    assertTableLabel('#key-tables-node-table', 'Florida', floridaLabel);
    assertTableHeader('#key-tables-node-table', 'node-color', 'value', nodeColorHeader);
    assertTableHeader('#key-tables-node-table', 'node-color', 'count', nodeColorCountHeader);

    floatDockedTable('node-color');
    assertFloatingDialogVisible('node-color', true);
    assertTableLabel('#node-color-table', 'Florida', floridaLabel);
    assertTableHeader('#node-color-table', 'node-color', 'value', nodeColorHeader);

    dockFloatingTable('node-color');
    focusAppTab('Docked Key Tables');
    assertTableLabel('#key-tables-node-table', 'Florida', floridaLabel);
    assertTableHeader('#key-tables-node-table', 'node-color', 'value', nodeColorHeader);

    selectDockedCardVariable('node-color', 'Profession');
    selectDockedCardVariable('node-color', 'State');
    assertTableLabel('#key-tables-node-table', 'Florida', floridaLabel);
    assertTableHeader('#key-tables-node-table', 'node-color', 'value', nodeColorHeader);

    selectDockedCardVariable('link-color', 'Exposure');
    selectDockedCardVariable('link-color', 'Contact type');
    assertTableHeader('#key-tables-link-table', 'link-color', 'value', linkColorHeader);

    cy.window().then((win: unknown) => {
      const app = getApp(win as WinWithMT);
      app.onTimelineChanged('Collection_Date');
      app.refreshDockedKeyTablesView?.();
    });
    cy.window().its('commonService.session.style.widgets.node-timeline-variable').should('equal', 'Collection_Date');
    assertTableLabel('#key-tables-node-table', 'Florida', floridaLabel);
    assertTableHeader('#key-tables-node-table', 'node-color', 'value', nodeColorHeader);

    editTableLabel('#key-tables-node-shape-table', 'Person', personDockedLabel);
    assertNodeValueName('Person', personDockedLabel);
    assertTableHeader('#key-tables-node-shape-table', 'node-shape', 'value', nodeShapeHeader);

    floatDockedTable('node-shape');
    assertFloatingDialogVisible('node-shape', true);
    assertTableLabel('#node-shape-table', 'Person', personDockedLabel);
    assertTableHeader('#node-shape-table', 'node-shape', 'value', nodeShapeHeader);

    editTableLabel('#node-shape-table', 'Person', personFloatingLabel);
    assertNodeValueName('Person', personFloatingLabel);

    dockFloatingTable('node-shape');
    focusAppTab('Docked Key Tables');
    assertNodeValueName('Person', personFloatingLabel);
    assertTableLabel('#key-tables-node-shape-table', 'Person', personFloatingLabel);
    assertTableHeader('#key-tables-node-shape-table', 'node-shape', 'value', nodeShapeHeader);

    selectDockedCardVariable('node-color', 'Profession');
    selectDockedCardVariable('node-color', 'State');
    assertTableLabel('#key-tables-node-shape-table', 'Person', personFloatingLabel);
    assertTableHeader('#key-tables-node-shape-table', 'node-shape', 'value', nodeShapeHeader);
    assertNodeValueName('Florida', floridaLabel);
    assertNodeValueName('Person', personFloatingLabel);
    assertKeyTableColumnName('node-color', 'value', nodeColorHeader);
    assertKeyTableColumnName('node-color', 'count', nodeColorCountHeader);
    assertKeyTableColumnName('link-color', 'value', linkColorHeader);
    assertKeyTableColumnName('node-shape', 'value', nodeShapeHeader);
  });

  it('lets the 2D group color table dock, stay grouped by the 2D settings selection, and edit group colors', () => {
    const updatedSubtypeBColor = '#ff8800';
    const floatingSubtypeBLabel = 'Subtype B retained label';
    const dockedSubtypeBLabel = 'Subtype B docked label';
    const floatingGroupHeader = 'Subtype Group Header';
    const dockedGroupHeader = 'Docked Group Header';
    const expectedSubtypeBColor = normalizeColor(hexToRgbString(updatedSubtypeBColor));
    let subtypeDBaselineColor = '';

    launchProfileToTwoD(groupingProfile);
    assertAfterLaunchCounts(groupingProfile);

    clearNodeLinkShapeKeyTables();
    enableFloatingGroupColorTable('Subtype');

    assertActiveTab('2D Network');
    assertGroupColorTableDockedState(false);
    assertDockedViewOpen(false);
    assertFloatingGroupColorTableVisible(true);
    editTableHeader(FLOATING_GROUP_COLOR_TABLE_SELECTOR, 'polygon-color', 'value', floatingGroupHeader);
    assertKeyTableColumnName('polygon-color', 'value', floatingGroupHeader);
    editTableLabel(FLOATING_GROUP_COLOR_TABLE_SELECTOR, 'B', floatingSubtypeBLabel);
    assertPolygonValueName('B', floatingSubtypeBLabel);

    cy.window().then((win: unknown) => {
      const typedWindow = win as WinWithMT;
      const subtypeBParent = getParentGroupNode(typedWindow, 'B');
      const subtypeDParent = getParentGroupNode(typedWindow, 'D');

      expect(subtypeBParent.empty(), 'Subtype B parent present').to.equal(false);
      expect(subtypeDParent.empty(), 'Subtype D parent present').to.equal(false);
      expect(subtypeBParent.visible(), 'Subtype B parent visible').to.equal(true);
      expect(subtypeDParent.visible(), 'Subtype D parent visible').to.equal(true);

      subtypeDBaselineColor = normalizeColor(String(subtypeDParent.style('background-color') || ''));
    });

    dockFloatingGroupColorTable();
    assertGroupColorTableDockedState(true);
    assertDockedViewOpen(true);
    assertActiveTab('2D Network');
    assertFloatingGroupColorTableVisible(false);

    focusAppTab('Docked Key Tables');
    cy.wait(500);
    getDockedGroupColorCard().should('be.visible');
    getDockedGroupColorCard().find('.p-select').should('not.exist');
    getDockedGroupColorCard().contains('span', '2D Network').should('exist');
    cy.get(DOCKED_GROUP_COLOR_TABLE_SELECTOR, { timeout: 15000 }).within(() => {
      cy.get('td[data-value="B"]', { timeout: 15000 }).should('exist');
      cy.get('td[data-value="D"]', { timeout: 15000 }).should('exist');
    });
    assertTableHeader(DOCKED_GROUP_COLOR_TABLE_SELECTOR, 'polygon-color', 'value', floatingGroupHeader);
    assertTableLabel(DOCKED_GROUP_COLOR_TABLE_SELECTOR, 'B', floatingSubtypeBLabel);
    cy.window().its('commonService.session.style.widgets.polygons-foci').should('equal', 'subtype');

    focusAppTab('2D Network');
    openTwoDGroupingTab();
    cy.get('@groupingTab').find('#polygons-foci').should('be.visible');
    cy.window().its('commonService.session.style.widgets.polygons-foci').should('equal', 'subtype');
    closeTwoDSettingsIfVisible();

    focusAppTab('Docked Key Tables');
    changeColorTableEntry(DOCKED_GROUP_COLOR_TABLE_SELECTOR, 'B', updatedSubtypeBColor);
    assertGroupColorTableState('B', updatedSubtypeBColor);
    assertTableLabel(DOCKED_GROUP_COLOR_TABLE_SELECTOR, 'B', floatingSubtypeBLabel);
    assertTableHeader(DOCKED_GROUP_COLOR_TABLE_SELECTOR, 'polygon-color', 'value', floatingGroupHeader);
    editTableHeader(DOCKED_GROUP_COLOR_TABLE_SELECTOR, 'polygon-color', 'value', dockedGroupHeader);
    assertKeyTableColumnName('polygon-color', 'value', dockedGroupHeader);
    editTableLabel(DOCKED_GROUP_COLOR_TABLE_SELECTOR, 'B', dockedSubtypeBLabel);
    assertPolygonValueName('B', dockedSubtypeBLabel);

    // Hidden-tab group color refreshes can lag briefly on slower Windows hosts.
    cy.wait(500);

    focusAppTab('2D Network');
    cy.wait(500);

    cy.window().should((win: unknown) => {
      const typedWindow = win as WinWithMT;
      const subtypeBParent = getParentGroupNode(typedWindow, 'B');
      const subtypeDParent = getParentGroupNode(typedWindow, 'D');

      expect(subtypeBParent.empty(), 'Subtype B parent after docked edit').to.equal(false);
      expect(subtypeDParent.empty(), 'Subtype D parent after docked edit').to.equal(false);
      expect(
        String(subtypeBParent.data('nodeColor') || '').toLowerCase(),
        'stored subtype B group color',
      ).to.equal(updatedSubtypeBColor);
      expect(
        normalizeColor(String(subtypeBParent.style('background-color') || '')),
        'rendered subtype B group color',
      ).to.equal(expectedSubtypeBColor);
      expect(
        normalizeColor(String(subtypeDParent.style('background-color') || '')),
        'unchanged subtype D group color',
      ).to.equal(subtypeDBaselineColor);
    });

    focusAppTab('Docked Key Tables');
    floatDockedGroupColorTable();
    assertGroupColorTableDockedState(false);
    assertDockedViewOpen(false);
    assertFloatingGroupColorTableVisible(true);
    assertTableHeader(FLOATING_GROUP_COLOR_TABLE_SELECTOR, 'polygon-color', 'value', dockedGroupHeader);
    assertTableLabel(FLOATING_GROUP_COLOR_TABLE_SELECTOR, 'B', dockedSubtypeBLabel);
  });
});
