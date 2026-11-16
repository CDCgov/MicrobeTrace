/// <reference types="cypress" />

import {
  ensureTwoDNetworkView,
  launchAndWaitForProcessing,
  openGlobalStylingTab,
  visitAppAndAcceptEula,
} from '../../../support/journey-helpers';

type NodeColorStyle = {
  nodeColorsTable: Record<string, string[]>;
  nodeColorsTableKeys: Record<string, Array<string | number>>;
  nodeColorsTableHistory: Record<string, Record<string, string>>;
};

const selectPrimeOption = (selector: string, label: string): void => {
  cy.get(selector).click({ force: true });
  cy.contains('li[role="option"]', label, { timeout: 15000 }).click({ force: true });
};

const colorsByValue = (style: NodeColorStyle, field: string): Record<string, string> => {
  const keys = style.nodeColorsTableKeys[field] || [];
  const colors = style.nodeColorsTable[field] || [];

  return keys.reduce((assignments, value, index) => {
    assignments[String(value)] = colors[index];
    return assignments;
  }, {} as Record<string, string>);
};

describe('Journey Flow - Node color history is scoped by field', () => {
  it('keeps 12 colors unique after switching from an overlapping numeric domain', () => {
    visitAppAndAcceptEula();
    cy.loadFiles([
      { name: 'Cypress_NodeColorHistory_Nodes.csv', datatype: 'node', field1: '_id' },
      {
        name: 'Cypress_NodeColorHistory_Links.csv',
        datatype: 'link',
        field1: 'source',
        field2: 'target',
        field3: 'distance',
      },
    ]);
    launchAndWaitForProcessing();
    ensureTwoDNetworkView();
    openGlobalStylingTab();

    selectPrimeOption('#node-color-variable', 'Seedgroups');
    selectPrimeOption('#node-color-scale-mode', 'Categorical');

    cy.window().should((win: any) => {
      const style = win.commonService.session.style as NodeColorStyle;
      const assignments = colorsByValue(style, 'seed_groups');

      expect(Object.keys(assignments), 'seed group domain').to.deep.equal([
        '0', '1', '2', '3', '4', '6', '7', '8',
      ]);
      expect(assignments['6'], 'sixth seed-group palette assignment').to.equal('#96341c');
      expect(style.nodeColorsTableHistory.seed_groups['6']).to.equal('#96341c');
    });

    selectPrimeOption('#node-color-variable', 'Raremutations');
    selectPrimeOption('#node-color-scale-mode', 'Categorical');

    cy.window().should((win: any) => {
      const style = win.commonService.session.style as NodeColorStyle;
      const assignments = colorsByValue(style, 'rare_mutations');
      const domainColors = Object.values(assignments);

      expect(Object.keys(assignments), 'rare mutation domain').to.deep.equal([
        '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11',
      ]);
      expect(new Set(domainColors).size, 'unique rare mutation colors').to.equal(12);
      expect(assignments['5'], 'rare mutation 5 color').to.equal('#96341c');
      expect(assignments['6'], 'rare mutation 6 color').to.equal('#8ad8e8');
      expect(style.nodeColorsTableHistory.seed_groups['6'], 'seed group history').to.equal('#96341c');
      expect(style.nodeColorsTableHistory.rare_mutations['6'], 'rare mutation history').to.equal('#8ad8e8');
    });

    cy.get('#key-tables-node-table', { timeout: 15000 }).should(($table) => {
      const renderedColors: string[] = [];
      $table.find('td[data-value]').each((_, cell) => {
        const color = String(Cypress.$(cell).closest('tr').find('input[type="color"]').val() || '');
        renderedColors.push(color.toLowerCase());
      });

      expect(renderedColors, 'rendered rare mutation colors').to.have.length(12);
      expect(new Set(renderedColors).size, 'unique rendered colors').to.equal(12);
    });
  });
});
