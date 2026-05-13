/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  expandAccordionTabByHeader,
  launchProfileToTwoD,
  openGlobalFilteringTab,
  openGlobalStylingTab,
  openTwoDSettingsDialog,
  readMetricCount,
} from '../../../support/journey-helpers';
import { byTestId, testIds } from '../../../support/selectors';

type WinWithCy = Window & {
  commonService: any;
  cytoscapeInstance?: any;
};

type ColorTableRow = {
  value: string;
  count: number;
  color: string;
};

type SymbolTableRow = {
  value: string;
  count: number;
  shapeKey: string;
};

const nodeShapeTableSelector = '#node-shape-table, #key-tables-node-shape-table, #nodeSymbolTable';

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

const selectPrimeOption = (selector: string, label: string): void => {
  cy.get(selector).click({ force: true });
  cy.contains('li[role="option"]', label, { timeout: 15000 }).click({ force: true });
};

const closeDialogIfVisible = (dialogTitle: string): void => {
  cy.get('body').then(($body) => {
    const hasVisibleDialog =
      $body.find(`.p-dialog:visible .p-dialog-title:contains("${dialogTitle}")`).length > 0;

    if (hasVisibleDialog) {
      cy.closeSettingsPane(dialogTitle);
    }
  });
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

const openGlobalShapeSettingsFromTwoD = (): void => {
  openTwoDSettingsDialog();
  cy.get('@twoDSettings').contains('.nav-link', 'Nodes').click({ force: true });
  cy.get('@twoDSettings')
    .find('.tab-pane:visible', { timeout: 15000 })
    .should('exist')
    .as('nodesTab');

  expandAccordionTabByHeader('@nodesTab', 'Shapes and Sizes');
  cy.get('@nodesTab').find('#open-global-shape-settings').click({ force: true });

  closeTwoDSettingsDialog();

  cy.contains('.p-dialog-title', 'Global Settings', { timeout: 15000 })
    .should('be.visible')
    .parents('.p-dialog')
    .as('globalSettings');

  cy.get('@globalSettings').contains('.nav-link', 'Styling').click({ force: true });
  cy.get('@globalSettings').find('#node-symbol-variable', { timeout: 15000 }).should('exist');
};

const applyMinimumClusterSize = (size: number): void => {
  openGlobalFilteringTab();
  cy.get(byTestId(testIds.filterMinimumClusterSize))
    .should('not.be.disabled')
    .clear()
    .wait(50)
    .type(String(size))
    .then(($input) => {
      const input = $input.get(0);
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new Event('blur', { bubbles: true }));
    });

  cy.window()
    .its('commonService.session.style.widgets.cluster-minimum-size')
    .should((value) => {
      expect(Number(value)).to.equal(size);
    });

  cy.closeGlobalSettings();
};

const extractColorTableRows = ($table: JQuery<HTMLElement>): ColorTableRow[] => {
  const rows: ColorTableRow[] = [];

  $table.find('tr').each((index, row) => {
    if (index === 0) return;

    const $row = Cypress.$(row);
    const value = String($row.find('td[data-value]').attr('data-value') || '');
    if (!value) return;

    const countText = String($row.find('td.tableCount').first().text() || '').trim();
    const count = parseInt(countText.replace(/,/g, ''), 10);
    const colorInputValue = String($row.find('input[type="color"]').val() || '');

    rows.push({
      value,
      count,
      color: normalizeColor(hexToRgbString(colorInputValue)),
    });
  });

  return rows;
};

const assertNodeColorTableMatchesVisibleNodes = (field: string): void => {
  cy.window().then((win: unknown) => {
    const typedWindow = win as WinWithCy;
    const cyInstance = typedWindow.cytoscapeInstance;

    expect(cyInstance, 'cytoscapeInstance').to.exist;

    cy.get('#node-color-table', { timeout: 15000 }).should(($table) => {
      const rows = extractColorTableRows($table);
      const visibleByValue: Record<string, { count: number; colors: string[] }> = {};
      cyInstance
        .nodes(':visible')
        .filter((node: any) => node.children().length === 0)
        .forEach((node: any) => {
          const value = String(node.data(field));
          if (!visibleByValue[value]) {
            visibleByValue[value] = { count: 0, colors: [] };
          }

          visibleByValue[value].count += 1;
          visibleByValue[value].colors.push(normalizeColor(node.style('background-color')));
        });

      expect(Object.keys(visibleByValue).sort(), 'visible node categories')
        .to.deep.equal(rows.map((row) => row.value).sort());

      rows.forEach((row) => {
        const group = visibleByValue[row.value];
        expect(group, `visible node group ${row.value}`).to.exist;
        expect(group.count, `node table count for ${row.value}`).to.equal(row.count);

        const uniqueColors = [...new Set(group.colors)];
        expect(uniqueColors, `rendered node colors for ${row.value}`).to.have.length(1);
        expect(uniqueColors[0], `table color for ${row.value}`).to.equal(row.color);
      });
    });
  });
};

const assertLinkColorTableMatchesVisibleLinks = (field: string): void => {
  cy.window().then((win: unknown) => {
    const typedWindow = win as WinWithCy;
    const cyInstance = typedWindow.cytoscapeInstance;

    expect(cyInstance, 'cytoscapeInstance').to.exist;

    cy.get('#link-color-table', { timeout: 15000 }).should(($table) => {
      const rows = extractColorTableRows($table);
      const visibleByValue: Record<string, { count: number; colors: string[] }> = {};
      cyInstance
        .edges(':visible')
        .forEach((edge: any) => {
          const value = String(edge.data(field));
          if (!visibleByValue[value]) {
            visibleByValue[value] = { count: 0, colors: [] };
          }

          visibleByValue[value].count += 1;
          visibleByValue[value].colors.push(normalizeColor(edge.style('line-color')));
        });

      expect(Object.keys(visibleByValue).sort(), 'visible link categories')
        .to.deep.equal(rows.map((row) => row.value).sort());

      rows.forEach((row) => {
        const group = visibleByValue[row.value];
        expect(group, `visible link group ${row.value}`).to.exist;
        expect(group.count, `link table count for ${row.value}`).to.equal(row.count);

        const uniqueColors = [...new Set(group.colors)];
        expect(uniqueColors, `rendered link colors for ${row.value}`).to.have.length(1);
        expect(uniqueColors[0], `table color for ${row.value}`).to.equal(row.color);
      });
    });
  });
};

const symbolTextToShapeKey: Array<{ marker: string; shapeKey: string }> = [
  { marker: '(Circle)', shapeKey: 'ellipse' },
  { marker: '(Triangle)', shapeKey: 'triangle' },
  { marker: '(Square)', shapeKey: 'rectangle' },
  { marker: '(Rhombus)', shapeKey: 'rhomboid' },
  { marker: '(Diamond)', shapeKey: 'diamond' },
  { marker: '(Heptagon)', shapeKey: 'heptagon' },
  { marker: '(Pentagon)', shapeKey: 'pentagon' },
  { marker: '(Hexagon)', shapeKey: 'hexagon' },
  { marker: '(Barrel)', shapeKey: 'barrel' },
  { marker: '(Octagon)', shapeKey: 'octagon' },
  { marker: '(Star)', shapeKey: 'star' },
  { marker: '(Tag)', shapeKey: 'tag' },
  { marker: '(Vee)', shapeKey: 'vee' },
];

const normalizeSymbolCategoryValue = (value: unknown): string => {
  const normalized = String(value ?? '').trim();

  if (!normalized || normalized.toLowerCase() === 'null' || normalized.toLowerCase() === 'undefined') {
    return '(Empty)';
  }

  return normalized;
};

const extractNodeSymbolTableRows = ($table: JQuery<HTMLElement>): SymbolTableRow[] => {
  const rows: SymbolTableRow[] = [];

  $table.find('tr').each((index, row) => {
    if (index === 0) return;

    const $row = Cypress.$(row);
    const value = String($row.find('td').first().text() || '').trim();
    if (!value) return;

    const countText = String($row.find('td.tableCount').first().text() || '').trim();
    const count = parseInt(countText.replace(/,/g, ''), 10);
    const rowText = normalizeSymbolCategoryValue($row.text());
    const selectedText = String($row.find('.p-select-label, .p-dropdown-label').first().text() || '').trim();
    const symbol = symbolTextToShapeKey.find((entry) =>
      selectedText.includes(entry.marker) || rowText.includes(entry.marker)
    );

    expect(symbol, `node symbol table shape for ${value}`).to.exist;

    rows.push({
      value,
      count,
      shapeKey: symbol!.shapeKey,
    });
  });

  return rows;
};

const assertNodeSymbolTableMatchesVisibleNodes = (field: string): void => {
  cy.window().then((win: unknown) => {
    const typedWindow = win as WinWithCy;
    const cyInstance = typedWindow.cytoscapeInstance;

    expect(cyInstance, 'cytoscapeInstance').to.exist;

    cy.get(nodeShapeTableSelector, { timeout: 15000 }).filter(':visible').first().should(($table) => {
      const rows = extractNodeSymbolTableRows($table);
      const visibleByValue: Record<string, { count: number; shapes: string[] }> = {};
      cyInstance
        .nodes(':visible')
        .filter((node: any) => node.children().length === 0)
        .forEach((node: any) => {
          const value = normalizeSymbolCategoryValue(node.data(field));
          if (!visibleByValue[value]) {
            visibleByValue[value] = { count: 0, shapes: [] };
          }

          visibleByValue[value].count += 1;
          visibleByValue[value].shapes.push(String(node.data('shapeKey') || node.style('shape') || '').trim());
        });

      expect(Object.keys(visibleByValue).sort(), 'visible symbol categories')
        .to.deep.equal(rows.map((row) => row.value).sort());

      rows.forEach((row) => {
        const group = visibleByValue[row.value];
        expect(group, `visible symbol group ${row.value}`).to.exist;
        expect(group.count, `node symbol table count for ${row.value}`).to.equal(row.count);

        const uniqueShapes = [...new Set(group.shapes)];
        expect(uniqueShapes, `rendered node shapes for ${row.value}`).to.have.length(1);
        expect(uniqueShapes[0], `table symbol for ${row.value}`).to.equal(row.shapeKey);
      });
    });
  });
};

const closeTwoDSettingsDialog = (): void => {
  cy.contains('.p-dialog-title', '2D Network Settings')
    .parents('.p-dialog')
    .find('button.p-dialog-close-button')
    .click({ force: true });

  cy.contains('.p-dialog-title', '2D Network Settings').should('not.exist');
};

describe('Journey Flow - Filtering keeps style tables coherent', () => {
  const colorProfile = getProfile('color-by-uploaded-categorical');
  const symbolProfile = getProfile('style-apply-cypress-test-style');

  afterEach(() => {
    closeGlobalSettingsIfVisible();
    closeDialogIfVisible('Node Color Table');
    closeDialogIfVisible('Link Color Table');
    closeDialogIfVisible('Node Symbol Table');
    closeDialogIfVisible('2D Network Settings');
  });

  it('keeps node and link color tables aligned with visible rendered categories after filtering', () => {
    launchProfileToTwoD(colorProfile);
    assertAfterLaunchCounts(colorProfile);

    let launchNodeCount = 0;
    let launchLinkCount = 0;

    readMetricCount('#numberOfNodes').then((count) => {
      launchNodeCount = count;
    });
    readMetricCount('#numberOfVisibleLinks').then((count) => {
      launchLinkCount = count;
    });

    openGlobalStylingTab();
    selectPrimeOption('#node-color-variable', 'Profession');
    selectPrimeOption('#link-tooltip-variable', 'Contact type');
    cy.window().its('commonService.session.style.widgets.node-color-variable').should('equal', 'Profession');
    cy.window().its('commonService.session.style.widgets.link-color-variable').should('equal', 'Contact type');
    cy.get('#global-settings-node-color-table', { timeout: 15000 }).should('be.visible');
    cy.get('#global-settings-link-color-table', { timeout: 15000 }).should('be.visible');
    cy.closeGlobalSettings();

    assertNodeColorTableMatchesVisibleNodes('Profession');
    assertLinkColorTableMatchesVisibleLinks('Contact type');

    applyMinimumClusterSize(2);

    readMetricCount('#numberOfNodes').then((count) => {
      expect(count, 'nodes reduced after filtering').to.be.lessThan(launchNodeCount);
    });
    readMetricCount('#numberOfVisibleLinks').then((count) => {
      expect(count, 'links not increased after filtering').to.be.at.most(launchLinkCount);
    });

    cy.get('#global-settings-node-color-table', { timeout: 15000 }).should('be.visible');
    cy.get('#global-settings-link-color-table', { timeout: 15000 }).should('be.visible');
    assertNodeColorTableMatchesVisibleNodes('Profession');
    assertLinkColorTableMatchesVisibleLinks('Contact type');
  });

  it('keeps the node symbol table aligned with visible rendered symbols after filtering', () => {
    launchProfileToTwoD(symbolProfile);
    assertAfterLaunchCounts(symbolProfile);

    let launchNodeCount = 0;
    readMetricCount('#numberOfNodes').then((count) => {
      launchNodeCount = count;
    });

    openGlobalShapeSettingsFromTwoD();
    cy.get('@globalSettings').find('#node-symbol-variable').click({ force: true });
    cy.contains('li[role="option"]', 'Node type').click({ force: true });

    cy.window().its('commonService.session.style.widgets.node-symbol-variable').should('equal', 'Node type');
    cy.window().its('commonService.session.style.widgets.node-symbol-table-visible').should('equal', 'Show');
    cy.get(nodeShapeTableSelector, { timeout: 15000 }).should('exist');
    cy.closeGlobalSettings();

    assertNodeSymbolTableMatchesVisibleNodes('Node type');

    applyMinimumClusterSize(2);

    readMetricCount('#numberOfNodes').then((count) => {
      expect(count, 'nodes reduced after symbol filtering').to.be.lessThan(launchNodeCount);
    });

    cy.get(nodeShapeTableSelector, { timeout: 15000 }).should('exist');
    assertNodeSymbolTableMatchesVisibleNodes('Node type');
  });
});
