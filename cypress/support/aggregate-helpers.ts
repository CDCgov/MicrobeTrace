/// <reference types="cypress" />

import { byTestId, testIds } from './selectors';

type AggregateDataset = 'Node' | 'Link' | 'Cluster';

type WinWithMT = Window & {
  commonService: any;
};

export type AggregateFieldOption = {
  dataset: AggregateDataset;
  label: string;
  shortLabel: string;
  value: string;
};

export type AggregateRow = {
  groupName: string;
  count: number;
  percent: string;
};

const compareRows = (a: AggregateRow, b: AggregateRow): number => {
  if (a.groupName !== b.groupName) {
    return a.groupName.localeCompare(b.groupName, undefined, { numeric: true });
  }

  if (a.count !== b.count) {
    return a.count - b.count;
  }

  return a.percent.localeCompare(b.percent);
};

const normalizeGroupName = (value: unknown): string => {
  if (value === null || value === undefined) {
    return 'null';
  }

  if (typeof value === 'string') {
    const trimmedValue = value.trim();
    return trimmedValue === '' ? 'null' : trimmedValue;
  }

  return String(value);
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function computeExpectedAggregateRows(win: WinWithMT, fullField: string): AggregateRow[] {
  const [dataset, ...fieldParts] = fullField.split('-');
  const field = fieldParts.join('-');

  let rawData: any[] = [];

  if (dataset === 'Node') {
    rawData = win.commonService.getVisibleNodesIgnoringTimeline();
  } else if (dataset === 'Link') {
    rawData = win.commonService.getVisibleLinksIgnoringTimeline();
  } else if (dataset === 'Cluster') {
    rawData = win.commonService.getVisibleClustersIgnoringTimeline();
  } else {
    throw new Error(`Unsupported aggregate dataset: ${dataset}`);
  }

  const counts = new Map<string, number>();
  let total = 0;

  rawData.forEach((row) => {
    const groupName = normalizeGroupName(row?.[field]);
    counts.set(groupName, (counts.get(groupName) || 0) + 1);
    total += 1;
  });

  return Array.from(counts.entries())
    .map(([groupName, count]) => ({
      groupName,
      count,
      percent: `${((count * 100) / total).toFixed(2)}%`,
    }))
    .sort(compareRows);
}

export function readRenderedAggregateRows(index: number): Cypress.Chainable<AggregateRow[]> {
  return cy.get(byTestId(testIds.aggregateTable))
    .eq(index)
    .find('tbody tr')
    .then(($rows) => {
      const rows = Array.from($rows).map((row) => {
        const cells = Array.from(row.querySelectorAll('td')).map((cell) => String(cell.textContent || '').trim());

        return {
          groupName: cells[0] || '',
          count: Number(cells[1]),
          percent: cells[2] || '',
        };
      });

      return rows.sort(compareRows);
    });
}

export function readDisplayedAggregateRows(index: number): Cypress.Chainable<AggregateRow[]> {
  return cy.get(byTestId(testIds.aggregateTable))
    .eq(index)
    .find('tbody tr')
    .then(($rows) => {
      return Array.from($rows).map((row) => {
        const cells = Array.from(row.querySelectorAll('td')).map((cell) => String(cell.textContent || '').trim());

        return {
          groupName: cells[0] || '',
          count: Number(cells[1]),
          percent: cells[2] || '',
        };
      });
    });
}

export function assertAggregateTableMatchesModel(index: number, fullField: string): void {
  cy.window().then((win: unknown) => {
    const expectedRows = computeExpectedAggregateRows(win as WinWithMT, fullField);

    readRenderedAggregateRows(index).then((renderedRows) => {
      expect(renderedRows, `aggregate rows for ${fullField}`).to.deep.equal(expectedRows);
    });
  });
}

export function getAggregateFieldOption(fullField: string): Cypress.Chainable<AggregateFieldOption> {
  return cy.window().then((win: unknown) => {
    const fieldGroups = ((win as WinWithMT).commonService.visuals.aggregate.fieldOptions || []) as Array<{
      label: string;
      items?: Array<{ label?: string; short_label?: string; value?: string }>;
    }>;

    for (const group of fieldGroups) {
      const match = (group.items || []).find((item) => item?.value === fullField);
      if (match) {
        return {
          dataset: group.label as AggregateDataset,
          label: String(match.label || ''),
          shortLabel: String(match.short_label || ''),
          value: String(match.value || ''),
        };
      }
    }

    throw new Error(`Aggregate field option not found: ${fullField}`);
  });
}

export function selectAggregateField(index: number, optionLabel: string, expectedFullField: string): void {
  cy.get('@aggregateSettings')
    .find('p-select')
    .eq(index)
    .should('exist')
    .click({ force: true });

  cy.contains('li[role="option"]', new RegExp(`^${escapeRegExp(optionLabel)}$`))
    .click({ force: true });

  cy.window()
    .its('commonService.visuals.aggregate.SelectedDataFields')
    .should((fields: string[]) => {
      expect(fields[index], `aggregate field ${index}`).to.equal(expectedFullField);
    });
}

export function assertAggregateFieldOptionsVisible(index: number, expectedOptionLabels: string[]): void {
  cy.get('@aggregateSettings')
    .find('p-select')
    .eq(index)
    .should('exist')
    .click({ force: true });

  expectedOptionLabels.forEach((label) => {
    cy.contains('li[role="option"]', new RegExp(`^${escapeRegExp(label)}$`)).should('exist');
  });

  cy.get('body').type('{esc}');
}

export function assertAggregateTableCount(expectedCount: number): void {
  cy.get(byTestId(testIds.aggregateTable)).should(($tables) => {
    expect($tables.length, 'aggregate table count').to.equal(expectedCount);
  });
}

export function assertAggregateTableHeaders(index: number, expectedHeaders: string[]): void {
  cy.get(byTestId(testIds.aggregateTable))
    .eq(index)
    .find('thead th')
    .should('have.length', expectedHeaders.length)
    .then(($headers) => {
      const renderedHeaders = Array.from($headers).map((header) =>
        String(header.textContent || '').replace(/\s+/g, ' ').trim(),
      );

      expectedHeaders.forEach((expectedHeader, headerIndex) => {
        expect(renderedHeaders[headerIndex], `aggregate header ${headerIndex}`).to.contain(expectedHeader);
      });
    });
}

export function assertAggregateTableTitles(expectedTitles: string[]): void {
  cy.get(byTestId(testIds.aggregateTable))
    .should('have.length', expectedTitles.length)
    .then(($tables) => {
      const renderedTitles = Array.from($tables).map((table) =>
        String(table.querySelector('.p-datatable-header')?.textContent || '').replace(/\s+/g, ' ').trim(),
      );

      expect(renderedTitles, 'aggregate table titles').to.deep.equal(expectedTitles);
    });
}

export function assertAggregateSettingsFieldOrder(expectedShortLabels: string[]): void {
  cy.get('@aggregateSettings')
    .find('p-orderlist p-select')
    .should('have.length', expectedShortLabels.length)
    .then(($selects) => {
      const renderedLabels = Array.from($selects).map((select) =>
        String(select.textContent || '').replace(/\s+/g, ' ').trim(),
      );

      expectedShortLabels.forEach((expectedLabel, index) => {
        expect(renderedLabels[index], `aggregate settings field ${index}`).to.contain(expectedLabel);
      });
    });
}

export function selectAggregateSettingsTable(index: number): void {
  cy.get('@aggregateSettings')
    .find('p-orderlist p-select')
    .eq(index)
    .closest('[role="option"]')
    .click({ force: true });
}

export function moveSelectedAggregateSettingsTable(direction: 'up' | 'top' | 'down' | 'bottom'): void {
  const buttonIndexByDirection = {
    up: 0,
    top: 1,
    down: 2,
    bottom: 3,
  } as const;

  cy.get('@aggregateSettings')
    .find('.p-orderlist-controls button')
    .eq(buttonIndexByDirection[direction])
    .should('not.be.disabled')
    .click({ force: true });
}

export function addAggregateTable(): void {
  cy.get('@aggregateSettings')
    .contains('button', 'Add Table')
    .should('exist')
    .click({ force: true });
}

export function reorderAggregateTables(dragIndex: number, dropIndex: number): void {
  cy.window().then((win: unknown) => {
    const aggregate = (win as WinWithMT).commonService.visuals.aggregate as any;
    const fields = [...(aggregate.SelectedDataFields as string[])];
    const [movedField] = fields.splice(dragIndex, 1);

    fields.splice(dropIndex, 0, movedField);
    aggregate.SelectedDataFields = fields;
    aggregate.reordered({ dragIndex, dropIndex });
    aggregate.cdref?.detectChanges?.();
  });
}

export function getAggregateDatasetType(fullField: string): AggregateDataset {
  const [dataset] = fullField.split('-');

  if (dataset === 'Node' || dataset === 'Link' || dataset === 'Cluster') {
    return dataset;
  }

  throw new Error(`Unsupported aggregate dataset: ${fullField}`);
}
