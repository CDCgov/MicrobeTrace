/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  launchProfileToTwoD,
  openGlobalStylingTab,
} from '../../../support/journey-helpers';

type WinWithCy = Window & {
  commonService?: any;
  cytoscapeInstance?: any;
};

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
  const optionIdPrefix = selector.replace(/^#/, '');
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  cy.get(selector).click({ force: true });
  cy.contains(
    `.p-select-overlay:visible li[role="option"][id^="${optionIdPrefix}_"]`,
    new RegExp(`^\\s*${escapedLabel}\\s*$`),
    { timeout: 15000 }
  )
    .scrollIntoView()
    .should('be.visible')
    .click({ force: true });
};

const closeColorTables = (): void => {
  cy.get('body').then(($body) => {
    const hasVisibleNodeTable =
      $body.find('.p-dialog:visible .p-dialog-title:contains("Node Color Table")').length > 0;

    if (hasVisibleNodeTable) {
      cy.closeSettingsPane('Node Color Table');
    }
  });

  cy.get('body').then(($body) => {
    const hasVisibleLinkTable =
      $body.find('.p-dialog:visible .p-dialog-title:contains("Link Color Table")').length > 0;

    if (hasVisibleLinkTable) {
      cy.closeSettingsPane('Link Color Table');
    }
  });
};

const getVisibleLeafNodesByValue = (win: WinWithCy, field: string, value: string) => {
  const cyInstance = win.cytoscapeInstance;

  expect(cyInstance, 'cytoscapeInstance').to.exist;

  return cyInstance
    .nodes(':visible')
    .filter((node: any) => node.children().length === 0 && node.data(field) === value);
};

const getVisibleEdgesByValue = (win: WinWithCy, field: string, value: string) => {
  const cyInstance = win.cytoscapeInstance;

  expect(cyInstance, 'cytoscapeInstance').to.exist;

  return cyInstance
    .edges(':visible')
    .filter((edge: any) => edge.data(field) === value);
};

const assertNodeCategoryColors = (field: string, firstValue: string, secondValue: string): void => {
  cy.window().should((win: unknown) => {
    const typedWindow = win as WinWithCy;
    const firstNodes = getVisibleLeafNodesByValue(typedWindow, field, firstValue);
    const secondNodes = getVisibleLeafNodesByValue(typedWindow, field, secondValue);

    expect(firstNodes.length, `${firstValue} nodes present`).to.be.greaterThan(0);
    expect(secondNodes.length, `${secondValue} nodes present`).to.be.greaterThan(0);

    const firstColor = normalizeColor(firstNodes[0].style('background-color'));
    const secondColor = normalizeColor(secondNodes[0].style('background-color'));

    firstNodes.forEach((node: any) => {
      expect(normalizeColor(node.style('background-color')), `${firstValue} node color`).to.equal(firstColor);
    });

    secondNodes.forEach((node: any) => {
      expect(normalizeColor(node.style('background-color')), `${secondValue} node color`).to.equal(secondColor);
    });

    expect(firstColor, 'distinct node categories render different colors').not.to.equal(secondColor);
  });
};

const assertLinkCategoryColors = (field: string, firstValue: string, secondValue: string): void => {
  cy.window().should((win: unknown) => {
    const typedWindow = win as WinWithCy;
    const firstEdges = getVisibleEdgesByValue(typedWindow, field, firstValue);
    const secondEdges = getVisibleEdgesByValue(typedWindow, field, secondValue);

    expect(firstEdges.length, `${firstValue} edges present`).to.be.greaterThan(0);
    expect(secondEdges.length, `${secondValue} edges present`).to.be.greaterThan(0);

    const firstColor = normalizeColor(firstEdges[0].style('line-color'));
    const secondColor = normalizeColor(secondEdges[0].style('line-color'));

    firstEdges.forEach((edge: any) => {
      expect(normalizeColor(edge.style('line-color')), `${firstValue} edge color`).to.equal(firstColor);
    });

    secondEdges.forEach((edge: any) => {
      expect(normalizeColor(edge.style('line-color')), `${secondValue} edge color`).to.equal(secondColor);
    });

    expect(firstColor, 'distinct link categories render different colors').not.to.equal(secondColor);
  });
};

const changeColorTableEntry = (tableSelector: string, value: string, nextColor: string): void => {
  cy.get(`${tableSelector} td[data-value="${value}"]`, { timeout: 15000 })
    .closest('tr')
    .find('input[type="color"]')
    .should('have.length', 1)
    .then(($input) => {
      const input = $input.get(0) as HTMLInputElement;
      input.value = nextColor;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

  cy.get(`${tableSelector} td[data-value="${value}"]`)
    .closest('tr')
    .find('input[type="color"]')
    .should('have.value', nextColor);
};

describe('Journey Flow - Uploaded color-by controls', () => {
  const profile = getProfile('color-by-uploaded-categorical');

  afterEach(() => {
    closeColorTables();
    cy.get('body').then(($body) => {
      const hasVisibleGlobalSettings =
        $body.find('.p-dialog:visible .p-dialog-title:contains("Global Settings")').length > 0;

      if (hasVisibleGlobalSettings) {
        cy.closeGlobalSettings();
      }
    });
  });

  it('colors uploaded nodes and links by categorical variables from Global Settings', () => {
    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);

    openGlobalStylingTab();

    cy.window().its('commonService.session.style.widgets.node-color-variable').should('equal', 'None');
    cy.window().its('commonService.session.style.widgets.link-color-variable').should('equal', 'origin');

    selectPrimeOption('#node-color-variable', 'Profession');

    cy.window().its('commonService.session.style.widgets.node-color-variable').should('equal', 'Profession');
    cy.get('#node-color-table-row').scrollIntoView().should('be.visible');
    cy.get('#key-tables-node-table', { timeout: 15000 }).should('be.visible');
    cy.get('#key-tables-node-table tr').should(($rows) => {
      expect($rows.length, 'node color table rows').to.be.greaterThan(2);
    });
    assertNodeCategoryColors('Profession', 'Healthcare', 'Education');

    selectPrimeOption('#link-tooltip-variable', 'Contact type');

    cy.window().its('commonService.session.style.widgets.link-color-variable').should('equal', 'Contact type');
    cy.get('#link-color-table-row').scrollIntoView().should('be.visible');
    cy.get('#key-tables-link-table', { timeout: 15000 }).should('be.visible');
    cy.get('#key-tables-link-table tr').should(($rows) => {
      expect($rows.length, 'link color table rows').to.be.greaterThan(2);
    });
    assertLinkCategoryColors('Contact type', 'sports team', 'classroom');
  });

  it('updates individual node and link color table entries and leaves other categories unchanged', () => {
    const updatedHealthcareColor = '#123456';
    const updatedSportsTeamColor = '#654321';
    const expectedHealthcareColor = normalizeColor(hexToRgbString(updatedHealthcareColor));
    const expectedSportsTeamColor = normalizeColor(hexToRgbString(updatedSportsTeamColor));
    let educationBaseline = '';
    let classroomBaseline = '';

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);

    openGlobalStylingTab();
    selectPrimeOption('#node-color-variable', 'Profession');
    selectPrimeOption('#link-tooltip-variable', 'Contact type');

    cy.window().then((win: unknown) => {
      const typedWindow = win as WinWithCy;
      const educationNodes = getVisibleLeafNodesByValue(typedWindow, 'Profession', 'Education');
      const classroomEdges = getVisibleEdgesByValue(typedWindow, 'Contact type', 'classroom');

      expect(educationNodes.length, 'education nodes present').to.be.greaterThan(0);
      expect(classroomEdges.length, 'classroom edges present').to.be.greaterThan(0);

      educationBaseline = normalizeColor(educationNodes[0].style('background-color'));
      classroomBaseline = normalizeColor(classroomEdges[0].style('line-color'));
    });

    changeColorTableEntry('#key-tables-node-table', 'Healthcare', updatedHealthcareColor);

    cy.window().should((win: unknown) => {
      const typedWindow = win as WinWithCy;
      const healthcareNodes = getVisibleLeafNodesByValue(typedWindow, 'Profession', 'Healthcare');
      const educationNodes = getVisibleLeafNodesByValue(typedWindow, 'Profession', 'Education');

      expect(healthcareNodes.length, 'healthcare nodes present').to.be.greaterThan(0);
      expect(educationNodes.length, 'education nodes present').to.be.greaterThan(0);

      healthcareNodes.forEach((node: any) => {
        expect(normalizeColor(node.style('background-color')), 'updated healthcare node color').to.equal(expectedHealthcareColor);
      });

      educationNodes.forEach((node: any) => {
        expect(normalizeColor(node.style('background-color')), 'unchanged education node color').to.equal(educationBaseline);
      });
    });

    changeColorTableEntry('#key-tables-link-table', 'sports team', updatedSportsTeamColor);

    cy.window().should((win: unknown) => {
      const typedWindow = win as WinWithCy;
      const sportsTeamEdges = getVisibleEdgesByValue(typedWindow, 'Contact type', 'sports team');
      const classroomEdges = getVisibleEdgesByValue(typedWindow, 'Contact type', 'classroom');

      expect(sportsTeamEdges.length, 'sports team edges present').to.be.greaterThan(0);
      expect(classroomEdges.length, 'classroom edges present').to.be.greaterThan(0);

      sportsTeamEdges.forEach((edge: any) => {
        expect(normalizeColor(edge.style('line-color')), 'updated sports team edge color').to.equal(expectedSportsTeamColor);
      });

      classroomEdges.forEach((edge: any) => {
        expect(normalizeColor(edge.style('line-color')), 'unchanged classroom edge color').to.equal(classroomBaseline);
      });
    });
  });

  it('preserves raw origin labels in style key tables and keeps link edits across views', () => {
    const nodeOriginName = 'TestStyleNodelist_snp.csv';
    const linkOriginName = 'TestStyleEdgelist_snp.csv';
    const renamedOriginName = 'Renamed origin';

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);

    openGlobalStylingTab();
    selectPrimeOption('#node-color-variable', 'Origin');
    cy.window().its('commonService.session.style.widgets.node-color-variable').should('equal', 'origin');
    cy.get(`#key-tables-node-table td[data-value="${nodeOriginName}"]`, { timeout: 15000 })
      .should('have.text', nodeOriginName);

    selectPrimeOption('#node-symbol-variable', 'Origin');
    cy.window().its('commonService.session.style.widgets.node-symbol-variable').should('equal', 'origin');
    cy.get(`#key-tables-node-shape-table td[data-value="${nodeOriginName}"]`, { timeout: 15000 })
      .should('have.text', nodeOriginName);

    selectPrimeOption('#link-tooltip-variable', 'Origin');
    cy.window().its('commonService.session.style.widgets.link-color-variable').should('equal', 'origin');

    const originCellSelector = `#key-tables-link-table td[data-value="${linkOriginName}"]`;

    cy.get('#key-tables-link-table', { timeout: 15000 }).should('be.visible');
    cy.get(originCellSelector, { timeout: 15000 })
      .should('have.text', linkOriginName)
      .then(($cell) => {
        const cell = $cell.get(0);
        const eventWindow = cell.ownerDocument.defaultView ?? window;

        cell.dispatchEvent(new eventWindow.MouseEvent('dblclick', { bubbles: true }));
        cell.focus();
        expect(cell.getAttribute('contenteditable'), 'link label edit mode').to.equal('true');
        expect(cell.ownerDocument.activeElement, 'focused link label cell').to.equal(cell);

        cell.textContent = renamedOriginName;
        cell.dispatchEvent(new eventWindow.FocusEvent('blur'));
        cell.dispatchEvent(new eventWindow.Event('focusout', { bubbles: true }));
      });

    cy.window().should((win: unknown) => {
      const linkValueNames = (win as WinWithCy).commonService?.session?.style?.linkValueNames;
      expect(linkValueNames?.[linkOriginName], 'stored edited link origin label').to.equal(renamedOriginName);
    });
    cy.get(originCellSelector)
      .should('have.text', renamedOriginName);

    cy.closeGlobalSettings();

    cy.get('[data-testid="app-view-menu-button"]').click({ force: true });
    cy.get('[data-testid="app-view-menu-table"]').click({ force: true });
    cy.window().its('commonService.activeTab').should('equal', 'Table');

    cy.get('[data-testid="app-view-menu-button"]').click({ force: true });
    cy.get('[data-testid="app-view-menu-2d-network"]').click({ force: true });
    cy.window().its('commonService.activeTab').should('equal', '2D Network');

    cy.get('#key-tables-link-table', { timeout: 15000 }).should('be.visible');
    cy.get(originCellSelector, { timeout: 15000 })
      .should('have.text', renamedOriginName);
    cy.get('#key-tables-link-table').should('not.contain.text', linkOriginName);
  });
});
