/// <reference types="cypress" />

import {
  addAggregateTable,
  assertAggregateFieldOptionsVisible,
  assertAggregateSettingsFieldOrder,
  assertAggregateTableCount,
  assertAggregateTableMatchesModel,
  assertAggregateTableTitles,
  moveSelectedAggregateSettingsTable,
  readDisplayedAggregateRows,
  selectAggregateSettingsTable,
  selectAggregateField,
} from '../../support/aggregate-helpers';
import {
  assertAggregateReady,
  goToAggregateView,
  openAggregateSettingsDialog,
  visitAppAndAcceptEula,
} from '../../support/journey-helpers';
import { byTestId, testIds } from '../../support/selectors';

const assertSortedStrings = (values: string[], direction: 'asc' | 'desc'): void => {
  const sorted = [...values].sort((a, b) => a.localeCompare(b));
  expect(values).to.deep.equal(direction === 'asc' ? sorted : sorted.reverse());
};

const assertSortedNumbers = (values: number[], direction: 'asc' | 'desc'): void => {
  const sorted = [...values].sort((a, b) => a - b);
  expect(values).to.deep.equal(direction === 'asc' ? sorted : sorted.reverse());
};

describe('Aggregate View', () => {
  beforeEach(() => {
    visitAppAndAcceptEula({ skipDemoSession: false });
    goToAggregateView();
    assertAggregateReady();
  });

  it('renders the default aggregate table from the seeded sample dataset', () => {
    assertAggregateTableCount(1);
    assertAggregateTableMatchesModel(0, 'Node-cluster');
  });

  it('updates aggregate tables when settings change and supports add/delete table flows', () => {
    openAggregateSettingsDialog();
    assertAggregateFieldOptionsVisible(0, ['Cluster', 'Degree', 'Distance']);

    selectAggregateField(0, 'Degree', 'Node-degree');
    addAggregateTable();
    selectAggregateField(1, 'Distance', 'Link-distance');
    cy.closeSettingsPane('Aggregate Settings');

    assertAggregateTableCount(2);
    assertAggregateTableMatchesModel(0, 'Node-degree');
    assertAggregateTableMatchesModel(1, 'Link-distance');

    openAggregateSettingsDialog();
    cy.get('@aggregateSettings')
      .find('.deleteButton button')
      .eq(1)
      .click({ force: true });
    cy.closeSettingsPane('Aggregate Settings');

    assertAggregateTableCount(1);
    assertAggregateTableMatchesModel(0, 'Node-degree');
  });

  it('uses Node-selected as the default field when a new aggregate table is added', () => {
    openAggregateSettingsDialog();
    addAggregateTable();
    cy.closeSettingsPane('Aggregate Settings');

    assertAggregateTableCount(2);
    assertAggregateTableMatchesModel(0, 'Node-cluster');
    assertAggregateTableMatchesModel(1, 'Node-selected');
  });

  it('sorts aggregate rows by group, count, and percent from the table headers', () => {
    openAggregateSettingsDialog();
    selectAggregateField(0, 'Degree', 'Node-degree');
    cy.closeSettingsPane('Aggregate Settings');

    assertAggregateTableMatchesModel(0, 'Node-degree');

    const clickHeader = (index: number): void => {
      cy.get(byTestId(testIds.aggregateTable))
        .eq(0)
        .find('thead th')
        .eq(index)
        .click({ force: true });
    };

    clickHeader(0);
    readDisplayedAggregateRows(0).then((rows) => {
      assertSortedStrings(rows.map((row) => row.groupName), 'asc');
    });

    clickHeader(0);
    readDisplayedAggregateRows(0).then((rows) => {
      assertSortedStrings(rows.map((row) => row.groupName), 'desc');
    });

    clickHeader(1);
    readDisplayedAggregateRows(0).then((rows) => {
      assertSortedNumbers(rows.map((row) => row.count), 'asc');
    });

    clickHeader(1);
    readDisplayedAggregateRows(0).then((rows) => {
      assertSortedNumbers(rows.map((row) => row.count), 'desc');
    });

    clickHeader(2);
    readDisplayedAggregateRows(0).then((rows) => {
      assertSortedNumbers(rows.map((row) => Number.parseFloat(row.percent.replace('%', ''))), 'asc');
    });

    clickHeader(2);
    readDisplayedAggregateRows(0).then((rows) => {
      assertSortedNumbers(rows.map((row) => Number.parseFloat(row.percent.replace('%', ''))), 'desc');
    });
  });

  it('reorders Aggregate tables from the settings control and keeps rendered order aligned', () => {
    openAggregateSettingsDialog();
    addAggregateTable();
    selectAggregateField(1, 'Distance', 'Link-distance');
    addAggregateTable();
    selectAggregateField(2, 'Degree', 'Node-degree');

    assertAggregateSettingsFieldOrder(['Cluster', 'Distance', 'Degree']);

    selectAggregateSettingsTable(2);
    moveSelectedAggregateSettingsTable('top');

    cy.window()
      .its('commonService.visuals.aggregate.SelectedDataFields')
      .should('deep.equal', ['Node-degree', 'Node-cluster', 'Link-distance']);

    assertAggregateSettingsFieldOrder(['Degree', 'Cluster', 'Distance']);
    cy.closeSettingsPane('Aggregate Settings');

    assertAggregateTableCount(3);
    assertAggregateTableTitles(['Degree', 'Cluster', 'Distance']);
    assertAggregateTableMatchesModel(0, 'Node-degree');
    assertAggregateTableMatchesModel(1, 'Node-cluster');
    assertAggregateTableMatchesModel(2, 'Link-distance');
  });

  it('stays interactive through container hide, show, and resize events', () => {
    cy.window().then((win: any) => {
      const aggregate = win.commonService.visuals.aggregate;
      const parent = win.document.querySelector('.aggregate-wrapper')?.parentElement as HTMLElement | null;

      expect(aggregate, 'aggregate visual').to.exist;
      expect(parent, 'aggregate parent container').to.exist;

      const initialWidth = Number.parseFloat(String(aggregate.tableStyle?.width || '0'));

      aggregate.container.emit('hide');
      aggregate.cdref.detectChanges();
      expect(aggregate.viewActive, 'aggregate hidden state').to.equal(false);

      aggregate.container.emit('show');
      aggregate.cdref.detectChanges();
      expect(aggregate.viewActive, 'aggregate shown state').to.equal(true);

      if (parent) {
        parent.style.height = '980px';
        parent.style.width = '1400px';
      }

      const tablesContainer = win.document.getElementById('tablesContainer');
      if (tablesContainer) {
        tablesContainer.style.width = '1200px';
      }

      aggregate.container.emit('resize');
      aggregate.cdref.detectChanges();

      const containerWidth = Number(win.$('#tablesContainer').width()) - 40;
      const expectedTableWidth = containerWidth > 700 ? containerWidth * 0.7 : containerWidth;

      expect(aggregate.viewHeight, 'aggregate resized height').to.be.greaterThan(800);
      expect(Number.parseFloat(String(aggregate.tableStyle?.width || '0')), 'aggregate resized width')
        .to.be.closeTo(expectedTableWidth, 2);
      expect(Number.parseFloat(String(aggregate.tableStyle?.width || '0')), 'aggregate width remains positive')
        .to.be.greaterThan(initialWidth * 0.5);
    });

    assertAggregateReady();
    assertAggregateTableMatchesModel(0, 'Node-cluster');
  });
});
