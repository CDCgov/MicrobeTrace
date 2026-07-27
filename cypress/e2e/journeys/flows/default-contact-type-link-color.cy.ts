/// <reference types="cypress" />

import {
  ensureTwoDNetworkView,
  openGlobalStylingTab,
  visitAppAndAcceptEula,
} from '../../../support/journey-helpers';
import { byTestId, testIds } from '../../../support/selectors';

type WinWithCy = Window & {
  commonService?: any;
  cytoscapeInstance?: any;
};

type LinkColorTableRow = {
  value: string;
  label: string;
  count: number;
  colorHex: string;
  colorRgb: string;
};

const contactTypeField = 'Contact type';
const emptyValueKey = 'null';

const normalizeColor = (value: string): string => String(value || '').replace(/\s+/g, '').toLowerCase();

const hexToRgbString = (hex: string): string => {
  const normalized = String(hex || '').replace('#', '');
  const expanded = normalized.length === 3
    ? normalized.split('').map((char) => `${char}${char}`).join('')
    : normalized;

  const red = parseInt(expanded.slice(0, 2), 16);
  const green = parseInt(expanded.slice(2, 4), 16);
  const blue = parseInt(expanded.slice(4, 6), 16);

  return `rgb(${red}, ${green}, ${blue})`;
};

const normalizeCssColor = (value: string): string => {
  const normalized = normalizeColor(value);

  if (/^#[0-9a-f]{6}$/.test(normalized) || /^#[0-9a-f]{3}$/.test(normalized)) {
    return normalizeColor(hexToRgbString(normalized));
  }

  return normalized;
};

const normalizeContactTypeValue = (value: unknown): string => {
  if (value === undefined || value === null) {
    return emptyValueKey;
  }

  if (typeof value === 'number' && Number.isNaN(value)) {
    return emptyValueKey;
  }

  if (typeof value === 'string') {
    const trimmedValue = value.trim().toLowerCase();
    if (trimmedValue === '' || trimmedValue === 'nan') {
      return emptyValueKey;
    }
  }

  return String(value);
};

const selectPrimeOption = (selector: string, label: string): void => {
  cy.get(selector).click({ force: true });
  cy.contains('li[role="option"]', label, { timeout: 15000 }).click({ force: true });
};

const closeSampleDatasetOverlay = (): void => {
  cy.get('body').then(($body) => {
    const continueButton = $body.find(`${byTestId(testIds.appSampleDatasetButton)}:visible`);
    if (!continueButton.length) return;

    cy.get(byTestId(testIds.appSampleDatasetButton), { timeout: 120000 })
      .should('be.visible')
      .click({ force: true });
  });

  cy.get('#overlay', { timeout: 15000 }).should('not.be.visible');
};

const readLinkColorTableRows = ($table: JQuery<HTMLElement>): LinkColorTableRow[] => {
  const rows: LinkColorTableRow[] = [];

  $table.find('tr').each((index, row) => {
    if (index === 0) return;

    const $row = Cypress.$(row);
    const $valueCell = $row.find('td[data-value]').first();
    const value = String($valueCell.attr('data-value') || '');
    if (!value) return;

    const countText = String($row.find('td.tableCount').first().text() || '').trim();
    const count = Number(countText.replace(/,/g, ''));
    const colorHex = String($row.find('input[type="color"]').first().val() || '').toLowerCase();

    expect(countText, `count text for ${value}`).not.to.equal('');
    expect(countText, `count text for ${value}`).not.to.equal('NaN');
    expect(Number.isFinite(count), `numeric count for ${value}`).to.equal(true);
    expect(colorHex, `table color for ${value}`).to.match(/^#[0-9a-f]{6}$/);

    rows.push({
      value,
      label: String($valueCell.text() || '').trim(),
      count,
      colorHex,
      colorRgb: normalizeCssColor(colorHex),
    });
  });

  return rows;
};

const countVisibleLinksByContactType = (cyInstance: any): Record<string, number> => {
  const counts: Record<string, number> = {};

  cyInstance.edges(':visible').forEach((edge: any) => {
    const value = normalizeContactTypeValue(edge.data(contactTypeField));
    counts[value] = (counts[value] || 0) + 1;
  });

  return counts;
};

const assignedLinkColorsByContactType = (cyInstance: any): Record<string, string[]> => {
  const colorsByValue: Record<string, string[]> = {};

  cyInstance.edges(':visible').forEach((edge: any) => {
    const value = normalizeContactTypeValue(edge.data(contactTypeField));
    if (!colorsByValue[value]) {
      colorsByValue[value] = [];
    }

    colorsByValue[value].push(normalizeCssColor(String(edge.data('lineColor') || '')));
  });

  return colorsByValue;
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

describe('Journey Flow - Default contact-type link colors', () => {
  afterEach(() => {
    closeGlobalSettingsIfVisible();
  });

  it('counts and colors Contact type links, including the empty bucket', () => {
    visitAppAndAcceptEula({ skipDemoSession: false });
    ensureTwoDNetworkView();

    cy.window({ timeout: 120000 }).should((win: unknown) => {
      const typedWindow = win as WinWithCy;
      expect(typedWindow.commonService?.session?.data?.links?.length || 0, 'default links loaded')
        .to.be.greaterThan(0);
      expect(typedWindow.cytoscapeInstance?.edges?.().length || 0, '2D edges rendered')
        .to.be.greaterThan(0);
    });

    closeSampleDatasetOverlay();

    openGlobalStylingTab();
    selectPrimeOption('#link-tooltip-variable', contactTypeField);

    cy.window().its('commonService.session.style.widgets.link-color-variable')
      .should('equal', contactTypeField);
    cy.get('#key-tables-link-table', { timeout: 15000 }).should('be.visible');

    cy.window({ timeout: 15000 }).should((win: unknown) => {
      const typedWindow = win as WinWithCy;
      const cyInstance = typedWindow.cytoscapeInstance;

      expect(cyInstance, 'cytoscapeInstance').to.exist;

      const expectedCounts = countVisibleLinksByContactType(cyInstance);
      const assignedColors = assignedLinkColorsByContactType(cyInstance);
      const $table = Cypress.$('#key-tables-link-table');

      expect($table.length, 'link color table exists').to.equal(1);
      expect($table.is(':visible'), 'link color table visible').to.equal(true);

      const rows = readLinkColorTableRows($table);
      const tableValues = rows.map((row) => row.value).sort();
      const expectedValues = Object.keys(expectedCounts).sort();

      expect(tableValues, 'link color table categories').to.deep.equal(expectedValues);

      const emptyRow = rows.find((row) => row.value === emptyValueKey);
      expect(emptyRow, '(Empty) link color row').to.exist;
      expect(emptyRow!.label, '(Empty) row label').to.equal('(Empty)');
      expect(emptyRow!.count, '(Empty) row count').to.equal(expectedCounts[emptyValueKey]);
      expect(emptyRow!.count, '(Empty) row count is visible').to.be.greaterThan(0);

      const uniqueTableColors = new Set(rows.map((row) => row.colorHex));
      expect(uniqueTableColors.size, 'unique contact type table colors').to.equal(rows.length);

      rows.forEach((row) => {
        expect(row.count, `table count for ${row.value}`).to.equal(expectedCounts[row.value]);

        const uniqueAssignedColors = [...new Set(assignedColors[row.value] || [])];
        expect(uniqueAssignedColors, `assigned render colors for ${row.value}`).to.have.length(1);
        expect(uniqueAssignedColors[0], `assigned render color matches table for ${row.value}`)
          .to.equal(row.colorRgb);
      });
    });
  });
});
