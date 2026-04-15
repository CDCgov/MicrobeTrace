/// <reference types="cypress" />

import { byTestId, testIds } from './selectors';

type WinWithMT = Window & {
  commonService: any;
};

export type CrosstabModel = {
  headers: string[];
  body: string[][];
  footer: string[];
  title: string;
};

export type CrosstabExportModel = {
  displayHeaders: string[];
  fieldHeaders: string[];
  rows: string[][];
  footer: string[];
  jsonRows: Array<Record<string, unknown>>;
};

const normalizeCell = (value: unknown): string => {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  return String(value);
};

const getVisibleNodes = (win: WinWithMT): any[] => {
  return win.commonService.getVisibleNodesIgnoringTimeline();
};

const getFieldList = (win: WinWithMT): Array<{ label: string; value: string }> => {
  return win.commonService.visuals.crossTab.fieldList || [];
};

const uniqueValueCount = (rows: any[], field: string): number => {
  return new Set(rows.map((row) => normalizeCell(row[field]))).size;
};

export const getCrosstabFieldLabel = (win: WinWithMT, fieldValue: string): string => {
  if (fieldValue === 'None') return 'None';

  const match = getFieldList(win).find((field) => field.value === fieldValue);
  return match?.label ?? fieldValue;
};

export const chooseCrosstabFields = (win: WinWithMT): { xField: string; yField: string } => {
  const rows = getVisibleNodes(win);
  const fieldValues = getFieldList(win)
    .map((field) => field.value)
    .filter((value) => value !== 'None');

  const xField = fieldValues.includes('cluster')
    ? 'cluster'
    : fieldValues.find((field) => uniqueValueCount(rows, field) > 1) ?? fieldValues[0] ?? 'None';

  const yField = fieldValues.find((field) => field !== xField && uniqueValueCount(rows, field) > 1) ?? 'None';

  return { xField, yField };
};

export const buildExpectedCrosstabModel = (
  win: WinWithMT,
  xField: string,
  yField: string,
  useProportion = false,
): CrosstabModel => {
  const rows = getVisibleNodes(win);
  let xValues: unknown[] = [];

  rows.forEach((row) => {
    const value = row[xField];
    if (!xValues.includes(value)) {
      xValues.push(value);
    }
  });

  xValues.push('Total');

  const totalRow: Record<string, unknown> = { col: 'Total' };
  xValues.forEach((value) => {
    totalRow[normalizeCell(value)] = 0;
  });

  const data: Array<Record<string, unknown>> = [];

  rows.forEach((row) => {
    const rowKey = row[yField];
    const columnKey = normalizeCell(row[xField]);
    const match = data.find((candidate) => candidate.col === rowKey);

    if (match) {
      match[columnKey] = Number(match[columnKey] || 0) + 1;
      match.Total = Number(match.Total || 0) + 1;
    } else {
      const newRow: Record<string, unknown> = { col: rowKey };
      xValues.forEach((value) => {
        newRow[normalizeCell(value)] = 0;
      });
      newRow[columnKey] = Number(newRow[columnKey] || 0) + 1;
      newRow.Total = 1;
      data.push(newRow);
    }

    totalRow[columnKey] = Number(totalRow[columnKey] || 0) + 1;
  });

  totalRow.Total = Object.keys(totalRow)
    .filter((key) => key !== 'col')
    .reduce((sum, key) => sum + Number(totalRow[key] || 0), 0);

  data.forEach((row) => {
    row.col = normalizeCell(row.col);
  });

  if (useProportion) {
    const total = Number(totalRow.Total || 0);

    data.forEach((row) => {
      Object.keys(row).forEach((key) => {
        if (key === 'col') return;
        row[key] = (Number(row[key] || 0) / total).toFixed(3);
      });
    });

    Object.keys(totalRow).forEach((key) => {
      if (key === 'col') return;
      totalRow[key] = (Number(totalRow[key] || 0) / total).toFixed(3);
    });
  }

  const headers = [''].concat(xValues.map((value) => normalizeCell(value)));
  const body = data.map((row) => headers.map((header, index) => {
    if (index === 0) return normalizeCell(row.col);
    return normalizeCell(row[header]);
  }));
  const footer = headers.map((header, index) => {
    if (index === 0) return normalizeCell(totalRow.col);
    return normalizeCell(totalRow[header]);
  });

  const formatField = (field: string): string => {
    if (field === 'None') return '';
    return win.commonService.capitalize(String(field).replace('_', ''));
  };

  let title = '';
  if (xField !== 'None' && yField !== 'None') {
    title = `${formatField(xField)} vs ${formatField(yField)}`;
  } else if (xField !== 'None') {
    title = formatField(xField);
  } else if (yField !== 'None') {
    title = formatField(yField);
  }

  return { headers, body, footer, title };
};

export const buildExpectedCrosstabExportModel = (win: WinWithMT): CrosstabExportModel => {
  const crossTab = win.commonService.visuals.crossTab;
  const tableColumns = crossTab.SelectedTableData.tableColumns || [];
  const fieldHeaders = tableColumns.map((column: { field: unknown }) => normalizeCell(column.field));
  const displayHeaders = tableColumns.map((column: { header: unknown }) => normalizeCell(column.header));
  const rows = (crossTab.SelectedTableData.data || []).map((row: Record<string, unknown>) =>
    fieldHeaders.map((field) => normalizeCell(row[field])),
  );
  const footer = fieldHeaders.map((field) => normalizeCell(crossTab.totalRow[field]));
  const jsonRows = (crossTab.SelectedTableData.data || []).map((row: Record<string, unknown>) => {
    const output: Record<string, unknown> = {};

    fieldHeaders.forEach((field) => {
      if (field === 'Total') return;
      output[field] = row[field] === 'null' ? null : row[field];
    });

    return output;
  });

  return {
    displayHeaders,
    fieldHeaders,
    rows,
    footer,
    jsonRows,
  };
};

type RenderedCrosstab = {
  headers: string[];
  body: string[][];
  footer: string[];
  title: string;
};

export const readRenderedCrosstab = (): Cypress.Chainable<RenderedCrosstab> => {
  return cy.get(byTestId(testIds.crosstabTable)).then(($table) => {
    const $root = Cypress.$($table);

    const headers = $root
      .find('thead.p-datatable-thead')
      .first()
      .find('th')
      .toArray()
      .map((cell) => normalizeCell(Cypress.$(cell).text().trim()));

    const body = $root
      .find('tbody.p-datatable-tbody')
      .first()
      .find('tr')
      .toArray()
      .map((row) => Cypress.$(row)
        .find('td')
        .toArray()
        .map((cell) => normalizeCell(Cypress.$(cell).text().trim())));

    const footer = $root
      .find('tfoot.p-datatable-tfoot')
      .first()
      .find('td')
      .toArray()
      .map((cell) => normalizeCell(Cypress.$(cell).text().trim()));

    const title = normalizeCell($root.find('.p-datatable-header').first().text().trim());

    return {
      headers,
      body,
      footer,
      title,
    };
  });
};

export const assertRenderedCrosstabMatches = (expected: CrosstabModel): void => {
  readRenderedCrosstab().then((actual) => {
    expect(actual.title, 'crosstab title').to.equal(expected.title);
    expect(actual.headers, 'crosstab headers').to.deep.equal(expected.headers);
    expect(actual.body, 'crosstab body').to.deep.equal(expected.body);
    expect(actual.footer, 'crosstab footer').to.deep.equal(expected.footer);
  });
};

export const selectCrosstabField = (
  dialogAlias: string,
  selectId: string,
  fieldValue: string,
  expectedWidgetKey: string,
): void => {
  cy.window().then((rawWin: unknown) => {
    const win = rawWin as WinWithMT;
    const label = getCrosstabFieldLabel(win, fieldValue);

    cy.get(dialogAlias)
      .find(`#${selectId}`)
      .should('be.visible')
      .click({ force: true });

    cy.contains('li[role="option"]', label, { timeout: 15000 }).click({ force: true });

    cy.window()
      .its(`commonService.session.style.widgets.${expectedWidgetKey}`)
      .should('equal', fieldValue);
  });
};
