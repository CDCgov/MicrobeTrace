/// <reference types="cypress" />

export type TableDataset = 'Node' | 'Link' | 'Cluster';

type WinWithMT = Window & {
  commonService: any;
};

type TableColumnOption = {
  label: string;
  value: {
    field: string;
    header: string;
  };
  disabled?: boolean;
};

const TABLE_ROOT = '.table-wrapper';

const tableOptionLabelByDataset: Record<TableDataset, string> = {
  Node: 'Nodes',
  Link: 'Links',
  Cluster: 'Clusters',
};

const sessionKeyByDataset: Record<TableDataset, 'nodes' | 'links' | 'clusters'> = {
  Node: 'nodes',
  Link: 'links',
  Cluster: 'clusters',
};

const normalizeText = (value: string): string => String(value || '').replace(/\s+/g, ' ').trim();

export function openTableSettingsDialog(): void {
  cy.get(`${TABLE_ROOT} a[title="Settings"]`, { timeout: 15000 })
    .should('exist')
    .click({ force: true });

  cy.contains('.p-dialog-title', 'Table Settings', { timeout: 15000 })
    .should('be.visible')
    .parents('.p-dialog')
    .as('tableSettings');
}

export function openTableExportDialog(): void {
  cy.get(`${TABLE_ROOT} a[title="Export Screen"]`, { timeout: 15000 })
    .should('exist')
    .click({ force: true });

  cy.contains('.p-dialog-title', 'Export Table', { timeout: 15000 })
    .should('be.visible')
    .parents('.p-dialog')
    .as('tableExport');
}

export function openTableColumnPicker(): void {
  cy.get(`${TABLE_ROOT} p-multiselect`, { timeout: 15000 })
    .should('exist')
    .click({ force: true });

  cy.get('.p-multiselect-overlay:visible', { timeout: 15000 })
    .should('exist')
    .as('tableColumnPicker');
}

export function selectTableDataset(dataset: TableDataset): void {
  cy.get(`${TABLE_ROOT} #dataType .p-select`, { timeout: 15000 }).click({ force: true });
  cy.contains('li[role="option"]', tableOptionLabelByDataset[dataset], { timeout: 15000 })
    .click({ force: true });

  cy.window()
    .its('commonService.visuals.tableComp.TableType')
    .should('equal', dataset.toLowerCase());
}

export function assertTableDatasetMatchesSession(dataset: TableDataset): void {
  let renderedRows = 0;

  cy.window().should((win: unknown) => {
    const typedWindow = win as WinWithMT;
    const tableComp = typedWindow.commonService.visuals.tableComp;
    const sessionRows =
      dataset === 'Node'
        ? typedWindow.commonService.getVisibleNodes()
        : dataset === 'Link'
          ? typedWindow.commonService.getVisibleLinksForCurrentTimeline()
          : typedWindow.commonService.session.data.clusters.filter((cluster: { visible: boolean }) => cluster.visible);
    const expectedRows = sessionRows.length;
    renderedRows = Math.min(expectedRows, Number(tableComp.selectedRows) || 10);

    expect(tableComp.SelectedTableData.tableType, `${dataset} table type`).to.equal(dataset.toLowerCase());
    expect(tableComp.SelectedTableData.data.length, `${dataset} table data length`).to.equal(expectedRows);
    expect(expectedRows, `${dataset} session rows`).to.be.greaterThan(0);
  }).then(() => {
    cy.get(`${TABLE_ROOT} .p-datatable-tbody > tr`, { timeout: 15000 })
      .should('have.length', renderedRows);
  });
}

export function getTableColumnIndex(headerText: string): Cypress.Chainable<number> {
  return cy.get(`${TABLE_ROOT} .p-datatable-thead tr`, { timeout: 15000 })
    .first()
    .find('th')
    .then(($headers) => {
      const index = Array.from($headers).findIndex(
        (header) => normalizeText(header.textContent || '') === headerText
      );

      expect(index, `table column index for ${headerText}`).to.be.greaterThan(-1);
      return index;
    });
}

export function getVisibleTableHeaders(): Cypress.Chainable<string[]> {
  return cy.get(`${TABLE_ROOT} .p-datatable-thead tr`, { timeout: 15000 })
    .first()
    .find('th')
    .then(($headers) =>
      Array.from($headers).map((header) => normalizeText(header.textContent || ''))
    );
}

export function assertVisibleTableHeaders(expectedHeaders: string[]): void {
  getVisibleTableHeaders().should((headers) => {
    expect(headers, 'visible table headers').to.deep.equal(expectedHeaders);
  });
}

export function findTableFilterTypeSelectByHeader(headerText: string): Cypress.Chainable<JQuery<HTMLSelectElement>> {
  return getTableColumnIndex(headerText).then((index) =>
    cy.get(`${TABLE_ROOT} .p-datatable-thead tr`, { timeout: 15000 })
      .eq(1)
      .find('select.filterType')
      .eq(index) as Cypress.Chainable<JQuery<HTMLSelectElement>>
  );
}

export function findTableFilterInputByHeader(headerText: string): Cypress.Chainable<JQuery<HTMLInputElement>> {
  return getTableColumnIndex(headerText).then((index) =>
    cy.get(`${TABLE_ROOT} .p-datatable-thead tr`, { timeout: 15000 })
      .eq(1)
      .find('input[type="text"], input.p-column-filter')
      .eq(index) as Cypress.Chainable<JQuery<HTMLInputElement>>
  );
}

export function setTableFilterType(headerText: string, optionLabel: string): void {
  findTableFilterTypeSelectByHeader(headerText)
    .select(optionLabel, { force: true });
}

export function setTableFilterValue(headerText: string, value: string): void {
  findTableFilterInputByHeader(headerText)
    .clear()
    .type(value, { force: true });
}

export function clearTableFilterValue(headerText: string): void {
  findTableFilterInputByHeader(headerText)
    .clear({ force: true });
}

export function assertTableFilterValue(headerText: string, expectedValue: string): void {
  findTableFilterInputByHeader(headerText).should('have.value', expectedValue);
}

export function assertTableFilterType(headerText: string, expectedLabel: string): void {
  findTableFilterTypeSelectByHeader(headerText)
    .find('option:selected')
    .should(($option) => {
      expect(normalizeText($option.text())).to.equal(expectedLabel);
    });
}

export function assertTableVisibleRowCount(expectedRows: number): void {
  cy.get(`${TABLE_ROOT} .p-datatable-tbody > tr`, { timeout: 15000 })
    .should('have.length', expectedRows);
}

export function assertTableAllRowsState(expectedRows: number): void {
  cy.window()
    .its('commonService.visuals.tableComp.SelectedTableData.data.length')
    .should('equal', expectedRows);

  cy.window()
    .its('commonService.visuals.tableComp.selectedRows')
    .should('equal', expectedRows);

  cy.get(`${TABLE_ROOT} .p-paginator-rpp-dropdown .p-select-label`, { timeout: 15000 })
    .should(($label) => {
      expect(normalizeText($label.text()), 'rows-per-page label').to.equal('All');
    });

  cy.contains(`${TABLE_ROOT} .p-paginator-current`, '1 of 1', { timeout: 15000 })
    .should('be.visible');
}

export function assertSingleVisibleRowValue(headerText: string, expectedValue: string): void {
  getTableColumnIndex(headerText).then((index) => {
    cy.get(`${TABLE_ROOT} .p-datatable-tbody > tr`, { timeout: 15000 })
      .should('have.length', 1);

    cy.get(`${TABLE_ROOT} .p-datatable-tbody > tr`, { timeout: 15000 })
      .first()
      .find('td')
      .eq(index)
      .should(($cell) => {
        expect(normalizeText($cell.text())).to.equal(expectedValue);
      });
  });
}

export function assertFirstVisibleRowValue(headerText: string, expectedValue: string): void {
  getTableColumnIndex(headerText).then((index) => {
    cy.get(`${TABLE_ROOT} .p-datatable-tbody > tr`, { timeout: 15000 })
      .first()
      .find('td')
      .eq(index)
      .should(($cell) => {
        expect(normalizeText($cell.text())).to.equal(expectedValue);
      });
  });
}

export function assertTableRowValueByMatch(
  matchHeaderText: string,
  matchValue: string,
  targetHeaderText: string,
  expectedValue: string,
): void {
  getTableColumnIndex(matchHeaderText).then((matchIndex) => {
    getTableColumnIndex(targetHeaderText).then((targetIndex) => {
      cy.get(`${TABLE_ROOT} .p-datatable-tbody > tr`, { timeout: 15000 })
        .should(($rows) => {
          const matchedRow = Array.from($rows).find((row) => {
            const cells = row.querySelectorAll('td');
            return normalizeText(cells.item(matchIndex)?.textContent || '') === matchValue;
          });

          expect(matchedRow, `row matching ${matchHeaderText}=${matchValue}`).to.exist;
          const matchedCells = matchedRow!.querySelectorAll('td');

          expect(
            normalizeText(matchedCells.item(targetIndex)?.textContent || ''),
            `${targetHeaderText} value for ${matchHeaderText}=${matchValue}`,
          ).to.equal(expectedValue);
        });
    });
  });
}

export function setVisibleTableColumns(desiredHeaders: string[]): void {
  openTableColumnPicker();

  cy.window().then((win: unknown) => {
    const typedWindow = win as WinWithMT;
    const selectedTableData = typedWindow.commonService.visuals.tableComp.SelectedTableData;
    const availableColumns = selectedTableData.availableColumns as TableColumnOption[];
    const currentHeaders = selectedTableData.tableColumns.map((column: { header: string }) => column.header);
    const forcedHeaders = availableColumns
      .filter((column) => column.disabled)
      .map((column) => column.label);
    const desiredSet = new Set([...desiredHeaders, ...forcedHeaders]);

    desiredHeaders.forEach((header) => {
      expect(
        availableColumns.map((column) => column.label),
        `available table columns include ${header}`,
      ).to.include(header);
    });

    currentHeaders
      .filter((header) => !desiredSet.has(header))
      .forEach((header) => {
        cy.get('@tableColumnPicker').contains('li[role="option"]', header).click({ force: true });
      });

    availableColumns.forEach((column) => {
      if (!desiredSet.has(column.label) || currentHeaders.includes(column.label) || column.disabled) return;

      cy.get('@tableColumnPicker').contains('li[role="option"]', column.label).click({ force: true });
    });

    const expectedHeaders = availableColumns
      .filter((column) => desiredSet.has(column.label))
      .map((column) => column.label);

    cy.wrap(expectedHeaders, { log: false }).as('expectedTableHeaders');
  });

  cy.get('body').click(5, 5);

  cy.get<string[]>('@expectedTableHeaders').then((expectedHeaders) => {
    assertVisibleTableHeaders(expectedHeaders);

    cy.window()
      .its('commonService.visuals.tableComp.SelectedTableData.tableColumns')
      .should((columns: Array<{ header: string }>) => {
        expect(
          columns.map((column) => column.header),
          'selected table columns',
        ).to.deep.equal(expectedHeaders);
      });
  });
}

export function setTableRowsPerPage(rows: number | 'All'): void {
  cy.get(`${TABLE_ROOT} .p-paginator-rpp-dropdown`, { timeout: 15000 })
    .should('exist')
    .click({ force: true });

  cy.contains('li[role="option"]', String(rows), { timeout: 15000 })
    .click({ force: true });
}

export function clickFirstVisibleTableRow(): void {
  cy.get(`${TABLE_ROOT} .p-datatable-tbody > tr`, { timeout: 15000 })
    .first()
    .click({ force: true });
}
