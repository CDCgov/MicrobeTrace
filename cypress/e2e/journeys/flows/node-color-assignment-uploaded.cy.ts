/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  launchProfileToTwoD,
  openGlobalStylingTab,
  saveSessionFromFileMenu,
} from '../../../support/journey-helpers';

type WinWithMT = Window & {
  commonService?: any;
  cytoscapeInstance?: any;
};

const fixturePath = (name: string): string => `${Cypress.config('fixturesFolder')}/${name}`;
const normalizeColor = (value: string): string => String(value || '').replace(/\s+/g, '').toLowerCase();

const selectNodeColorField = (label: string): void => {
  cy.get('#node-color-variable').click({ force: true });
  cy.contains('li[role="option"]', label, { timeout: 15000 }).click({ force: true });
};

const uploadColorAssignments = (fixture: string): void => {
  cy.get('[data-testid="node-color-assignment-file"]')
    .selectFile(fixturePath(fixture), { force: true });
};

const assertRenderedNodeColor = (field: string, value: string, expectedColor: string): void => {
  cy.window().should((rawWindow: unknown) => {
    const win = rawWindow as WinWithMT;
    const nodes = win.cytoscapeInstance
      ?.nodes(':visible')
      .filter((node: any) => node.children().length === 0 && node.data(field) === value);

    expect(nodes?.length, `${field}=${value} nodes`).to.be.greaterThan(0);
    nodes.forEach((node: any) => {
      expect(normalizeColor(node.style('background-color'))).to.equal(normalizeColor(expectedColor));
    });
  });
};

describe('Journey Flow - Node color assignment file import', () => {
  const profile = getProfile('color-by-uploaded-categorical');

  afterEach(() => {
    cy.get('body').then(($body) => {
      if ($body.find('.p-dialog:visible .p-dialog-title:contains("Global Settings")').length) {
        cy.closeGlobalSettings();
      }
    });
  });

  it('selects the iTOL-declared field, applies assignments, and saves unused mappings', () => {
    const sessionFileBase = `color_assignments_${Date.now()}`;
    const sessionFilePath = `${Cypress.config('downloadsFolder')}/${sessionFileBase}.microbetrace`;

    launchProfileToTwoD(profile);
    openGlobalStylingTab();
    cy.get('[data-testid="node-color-assignment-file"]').should('exist');
    cy.get('#node-color-assignment-row')
      .should('contain.text', 'Apply Color Assignment File')
      .and('contain.text', 'Choose File');
    uploadColorAssignments('Cypress_Color_Assignments_iTOL.txt');

    cy.get('[data-testid="node-color-assignment-status"]', { timeout: 15000 })
      .should('contain.text', 'Applied 3 color assignments')
      .and('contain.text', 'set Color Nodes By to Lineage')
      .and('contain.text', '1 retained for future data');
    cy.window().its('commonService.session.style.widgets.node-color-variable').should('equal', 'Lineage');

    cy.window().should((rawWindow: unknown) => {
      const assignments = (rawWindow as WinWithMT).commonService?.session?.style?.nodeColorAssignments?.Lineage;
      expect(assignments?.['B.1.617.2']).to.equal('#123456');
      expect(assignments?.['B.1.617.1']).to.equal('#abcdef');
      expect(assignments?.['FUTURE.LINEAGE']).to.equal('#fedcba');
    });
    cy.get('#key-tables-node-table td[data-value="B.1.617.2"]')
      .closest('tr')
      .find('input[type="color"]')
      .should('have.value', '#123456');
    assertRenderedNodeColor('Lineage', 'B.1.617.2', 'rgb(18,52,86)');

    selectNodeColorField('Profession');
    selectNodeColorField('Lineage');
    assertRenderedNodeColor('Lineage', 'B.1.617.2', 'rgb(18,52,86)');

    cy.closeGlobalSettings();
    saveSessionFromFileMenu(sessionFileBase);
    cy.readFile(sessionFilePath, 'utf8', { timeout: 30000 }).then((contents) => {
      const saved = JSON.parse(contents);
      expect(saved.session.style.nodeColorAssignments.Lineage['B.1.617.2']).to.equal('#123456');
      expect(saved.session.style.nodeColorAssignments.Lineage['FUTURE.LINEAGE']).to.equal('#fedcba');
    });
  });

  it('rejects an unavailable declared field and switches to the field declared by a table', () => {
    launchProfileToTwoD(profile);
    openGlobalStylingTab();
    selectNodeColorField('Profession');

    uploadColorAssignments('Cypress_Color_Assignments_Mismatch.txt');
    cy.get('.p-confirmdialog').should('not.exist');
    cy.get('[data-testid="node-color-assignment-status"]')
      .should('have.attr', 'role', 'alert')
      .and('contain.text', 'MLST')
      .and('contain.text', 'not available');
    cy.window().its('commonService.session.style.widgets.node-color-variable').should('equal', 'Profession');

    uploadColorAssignments('Cypress_Color_Assignments_Table.csv');
    cy.get('[data-testid="node-color-assignment-status"]')
      .should('contain.text', 'set Color Nodes By to Lineage');
    cy.window().should((rawWindow: unknown) => {
      expect((rawWindow as WinWithMT).commonService?.session?.style?.widgets?.['node-color-variable']).to.equal('Lineage');
      const assignments = (rawWindow as WinWithMT).commonService?.session?.style?.nodeColorAssignments?.Lineage;
      expect(assignments?.['B.1.617.2']).to.equal('#654321');
    });
    assertRenderedNodeColor('Lineage', 'B.1.617.2', 'rgb(101,67,33)');
  });

  it('selects the node ID field from an iTOL ID alias and uses the first data column', () => {
    launchProfileToTwoD(profile);
    openGlobalStylingTab();
    selectNodeColorField('Lineage');

    uploadColorAssignments('Cypress_Color_Assignments_ID_iTOL.txt');
    cy.get('[data-testid="node-color-assignment-status"]')
      .should('contain.text', '1 matched current value')
      .and('contain.text', '0 retained for future data');
    cy.window().its('commonService.session.style.widgets.node-color-variable').should('equal', '_id');
    cy.window().should((rawWindow: unknown) => {
      const assignments = (rawWindow as WinWithMT).commonService?.session?.style?.nodeColorAssignments?._id;
      expect(assignments?.['375596']).to.equal('#00daff');
      expect(assignments?.['Example isolate']).to.not.exist;
    });
    assertRenderedNodeColor('_id', '375596', 'rgb(0,218,255)');
  });

  it('rejects conflicting rows without changing existing assignments', () => {
    launchProfileToTwoD(profile);
    openGlobalStylingTab();
    selectNodeColorField('Lineage');
    uploadColorAssignments('Cypress_Color_Assignments_Table.csv');
    cy.window().should((rawWindow: unknown) => {
      const assignments = (rawWindow as WinWithMT).commonService?.session?.style?.nodeColorAssignments?.Lineage;
      expect(assignments?.['B.1.617.2']).to.equal('#654321');
    });

    uploadColorAssignments('Cypress_Color_Assignments_Invalid.csv');
    cy.get('[data-testid="node-color-assignment-status"]')
      .should('have.attr', 'role', 'alert')
      .and('contain.text', 'assigned both');
    cy.window().should((rawWindow: unknown) => {
      const assignments = (rawWindow as WinWithMT).commonService?.session?.style?.nodeColorAssignments?.Lineage;
      expect(assignments?.['B.1.617.2']).to.equal('#654321');
    });
    assertRenderedNodeColor('Lineage', 'B.1.617.2', 'rgb(101,67,33)');
  });
});
