/// <reference types="cypress" />

import {
  expandAccordionTabByHeader,
  openTwoDSettingsDialog,
  waitForProcessingDialogToClear,
} from '../../../support/journey-helpers';

const nodeFile = 'Cypress_PersonPlace_GroupByNull_Nodes.csv';
const placeNodeIds = ['PL001', 'PL002', 'PL003'];
const expectedGroups: Record<string, string[]> = {
  'Household contact': ['P001', 'P004'],
  'Workplace contact': ['P002'],
  'Community exposure': ['P003'],
  'undefined': ['P005'],
  'None': ['P006'],
};
const missingGroupTokens = new Set([
  'null',
  'group-null',
  '(empty)',
  'group-(empty)',
  '__ungrouped__',
  'group-__ungrouped__',
]);

const launchPersonPlaceDataset = (linkFile: string): void => {
  cy.visit('/?skipEula=1&skipDemoSession=1');
  cy.get('#fileDropRef', { timeout: 15000 }).should('exist');

  cy.loadFiles([
    { name: nodeFile, datatype: 'node', field1: '_id' },
    { name: linkFile, datatype: 'link', field1: 'source', field2: 'target', field3: 'None' },
  ]);

  cy.get('#launch', { timeout: 20000 }).should('not.be.disabled').click({ force: true });
  cy.get('.lm_tab.lm_active', { timeout: 20000 }).should('contain.text', '2D Network');
  cy.window().its('commonService.session.data.nodes').should('have.length', 9);
  waitForProcessingDialogToClear();
};

const enableRiskFactorGrouping = (): void => {
  openTwoDSettingsDialog();

  cy.get('@twoDSettings').contains('.nav-link', 'Grouping').click({ force: true });
  cy.get('@twoDSettings')
    .find('.tab-pane:visible', { timeout: 15000 })
    .should('exist')
    .as('groupingTab');

  expandAccordionTabByHeader('@groupingTab', 'Controls');
  cy.get('@groupingTab')
    .find('#polygons-controls')
    .within(() => {
      cy.get('#polygons-show-toggle')
        .contains('Show')
        .click({ force: true });
    });

  cy.window().its('commonService.session.style.widgets.polygons-show').should('equal', true);

  cy.get('@groupingTab').find('#polygons-foci').should('be.visible').click({ force: true });
  cy.contains('li[role="option"]', 'Risk factor').click({ force: true });
  cy.window().its('commonService.session.style.widgets.polygons-foci').should('equal', 'Risk factor');

  cy.get('@twoDSettings')
    .find('button.p-dialog-close-button')
    .click({ force: true });
  cy.contains('.p-dialog-title', '2D Network Settings').should('not.exist');
};

const assertRiskFactorGroupingExcludesMissingPlaceValues = (): void => {
  cy.window().should((win: any) => {
    const cyInstance = win.cytoscapeInstance;
    expect(cyInstance, 'cytoscape instance').to.exist;

    const parents = cyInstance.nodes('.parent');
    expect(parents.length, 'parent group count').to.equal(Object.keys(expectedGroups).length);

    parents.forEach((parentNode: any) => {
      const parentId = String(parentNode.id()).trim().toLowerCase();
      const parentLabel = String(parentNode.data('label') ?? '').trim().toLowerCase();

      expect(missingGroupTokens.has(parentId), `missing parent id ${parentNode.id()}`).to.equal(false);
      expect(missingGroupTokens.has(parentLabel), `missing parent label ${parentNode.data('label')}`).to.equal(false);
    });

    const polygonGroups = win.commonService.temp.polygonGroups || [];
    const polygonGroupKeys = polygonGroups.map((group: any) => String(group.key));

    expect(polygonGroupKeys, 'polygon group keys').to.have.members(Object.keys(expectedGroups));
    polygonGroupKeys.forEach((key: string) => {
      expect(missingGroupTokens.has(key.trim().toLowerCase()), `missing temp polygon group ${key}`).to.equal(false);
    });

    Object.entries(expectedGroups).forEach(([groupKey, expectedChildren]) => {
      const parent = cyInstance.getElementById(`group-${groupKey}`);

      expect(parent.empty(), `parent group exists: ${groupKey}`).to.equal(false);
      expect(parent.children().map((child: any) => String(child.id())).sort(), `children for ${groupKey}`)
        .to.deep.equal([...expectedChildren].sort());
    });

    placeNodeIds.forEach((nodeId) => {
      const node = cyInstance.getElementById(nodeId);

      expect(node.empty(), `place node exists: ${nodeId}`).to.equal(false);
      expect(node.parent().empty(), `place node remains ungrouped: ${nodeId}`).to.equal(true);
    });
  });
};

describe('Journey Flow - Grouping skips blank place fields', () => {
  [
    {
      title: 'person-place-only links',
      linkFile: 'Cypress_PersonPlace_GroupByNull_Links_person_place_only.csv',
    },
    {
      title: 'mixed person-person and person-place links',
      linkFile: 'Cypress_PersonPlace_GroupByNull_Links_mixed.csv',
    },
  ].forEach(({ title, linkFile }) => {
    it(`keeps place nodes outside Risk factor groups with ${title}`, () => {
      launchPersonPlaceDataset(linkFile);
      enableRiskFactorGrouping();
      assertRiskFactorGroupingExcludesMissingPlaceValues();
    });
  });
});
