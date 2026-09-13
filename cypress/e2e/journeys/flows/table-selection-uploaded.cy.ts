/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  goTo2DNetworkView,
  goToTableView,
  launchProfileToTwoD,
} from '../../../support/journey-helpers';
import {
  assertFirstVisibleRowValue,
  assertTableDatasetMatchesSession,
  assertTableVisibleRowCount,
  clearTableFilterValue,
  clickFirstVisibleTableRow,
  openTableSettingsDialog,
  selectTableDataset,
  setTableFilterValue,
} from '../../../support/table-helpers';

const assertSelectedNodeIds = (expectedIds: string[]): void => {
  cy.window()
    .its('commonService.session.data.nodes')
    .should((nodes: any[]) => {
      const selectedIds = nodes
        .filter((node) => node.selected)
        .map((node) => String(node._id ?? node.ID ?? ''))
        .sort();

      expect(selectedIds, 'selected node ids').to.deep.equal([...expectedIds].sort());
    });
};

const normalizeCssColor = (value: string): string => String(value || '').replace(/\s+/g, '');

const hexToRgb = (hex: string): string => {
  const value = hex.replace('#', '');
  return `rgb(${parseInt(value.slice(0, 2), 16)},${parseInt(value.slice(2, 4), 16)},${parseInt(value.slice(4, 6), 16)})`;
};

const assertRenderedSelectedNodeIds = (expectedIds: string[]): void => {
  cy.window().should((win: any) => {
    const cyInstance = win.commonService.visuals.twoD?.cy || win.cytoscapeInstance;
    expect(cyInstance, '2D Cytoscape instance').to.exist;

    const selectedNodes = cyInstance.nodes(':selected');
    const selectedIds = selectedNodes.map((node: any) => node.id()).sort();
    expect(selectedIds, 'rendered selected node ids').to.deep.equal([...expectedIds].sort());

    const selectedColor = String(win.commonService.session.style.widgets['selected-color']);
    selectedNodes.forEach((node: any) => {
      expect(parseFloat(node.style('border-width')), `selected border width for ${node.id()}`).to.equal(3);
      expect(normalizeCssColor(node.style('border-color')), `selected border color for ${node.id()}`)
        .to.equal(hexToRgb(selectedColor));
    });
  });
};

describe('Journey Flow - Table uploaded selection', () => {
  const profile = getProfile('map-color-by-uploaded');

  it('keeps link rows non-selectable, applies cluster selection, and restores node row order after deselection', () => {
    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);
    goToTableView();

    openTableSettingsDialog();
    cy.get('@tableSettings')
      .find('.p-selectbutton .p-togglebutton-label')
      .contains('Large')
      .click({ force: true });
    cy.window()
      .its('commonService.visuals.tableComp.selectedSize')
      .should('equal', 'p-datatable-lg');
    cy.closeSettingsPane('Table Settings');

    setTableFilterValue('Id', 'D');
    assertTableVisibleRowCount(1);
    assertFirstVisibleRowValue('Id', 'D');

    clickFirstVisibleTableRow();
    assertSelectedNodeIds(['D']);

    selectTableDataset('Link');
    assertTableDatasetMatchesSession('Link');
    setTableFilterValue('Source', 'A');
    assertTableVisibleRowCount(2);
    clickFirstVisibleTableRow();
    assertSelectedNodeIds(['D']);

    selectTableDataset('Cluster');
    assertTableDatasetMatchesSession('Cluster');
    clickFirstVisibleTableRow();
    assertSelectedNodeIds(['A', 'B', 'C', 'D']);
    assertRenderedSelectedNodeIds(['A', 'B', 'C', 'D']);

    cy.get('.lm_tab[title="2D Network"]>.lm_close_tab', { timeout: 15000 }).click({ force: true });
    cy.window().its('commonService.visuals.twoD').should('not.exist');
    goTo2DNetworkView();
    assertRenderedSelectedNodeIds(['A', 'B', 'C', 'D']);

    cy.get('.lm_tab[title="Table"]', { timeout: 15000 }).click({ force: true });
    cy.get('.table-wrapper', { timeout: 15000 }).should('be.visible');
    clickFirstVisibleTableRow();
    assertSelectedNodeIds([]);
    assertRenderedSelectedNodeIds([]);

    selectTableDataset('Node');
    assertSelectedNodeIds([]);
    assertTableVisibleRowCount(1);
    assertFirstVisibleRowValue('Id', 'D');
    clickFirstVisibleTableRow();
    assertSelectedNodeIds(['D']);
    cy.window()
      .its('commonService.visuals.tableComp.SelectedTableData.data')
      .should((rows: any[]) => {
        expect(rows[0]?.id ?? rows[0]?._id ?? rows[0]?.ID).to.equal('D');
      });
    cy.window()
      .its('commonService.visuals.tableComp.dataTable.filteredValue')
      .should((rows: any[] | null) => {
        expect(rows?.length).to.equal(1);
        expect(rows?.[0]?.id ?? rows?.[0]?._id ?? rows?.[0]?.ID).to.equal('D');
      });
    assertTableVisibleRowCount(1);
    assertFirstVisibleRowValue('Id', 'D');
    clearTableFilterValue('Id');
    assertTableVisibleRowCount(4);
    assertFirstVisibleRowValue('Id', 'D');
    clickFirstVisibleTableRow();
    assertSelectedNodeIds([]);
    assertFirstVisibleRowValue('Id', 'A');
  });
});
