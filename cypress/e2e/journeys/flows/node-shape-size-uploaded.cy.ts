/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  expandAccordionTabByHeader,
  launchProfileToTwoD,
  openTwoDSettingsDialog,
} from '../../../support/journey-helpers';

const openNodeShapesPanel = (): void => {
  openTwoDSettingsDialog();
  cy.get('@twoDSettings').contains('.nav-link', 'Nodes').click({ force: true });
  cy.get('@twoDSettings')
    .find('.tab-pane:visible', { timeout: 15000 })
    .should('exist')
    .as('nodesTab');

  expandAccordionTabByHeader('@nodesTab', 'Shapes and Sizes');
};

const closeTwoDSettingsDialog = (): void => {
  cy.get('@twoDSettings')
    .find('button.p-dialog-close-button')
    .click({ force: true });

  cy.contains('.p-dialog-title', '2D Network Settings').should('not.exist');
};

const assertNodeSymbolTableVisibility = (shouldBeVisible: boolean): void => {
  if (shouldBeVisible) {
    cy.get('#nodeSymbolTable', { timeout: 15000 }).should('exist');
    return;
  }

  cy.get('body').then(($body) => {
    if (!$body.find('#nodeSymbolTable').length) return;
    cy.get('#nodeSymbolTable').should('not.be.visible');
  });
};

const getVisibleLeafNodeWidths = (): Cypress.Chainable<number[]> => {
  return cy.window().then((win: any) => {
    const cyInstance = win.cytoscapeInstance;
    expect(cyInstance, 'cytoscapeInstance').to.exist;

    return cyInstance
      .nodes(':visible')
      .filter((node: any) => node.children().length === 0)
      .map((node: any) => parseFloat(String(node.style('width'))))
      .filter((width: number) => Number.isFinite(width)) as number[];
  });
};

const renderedNodeWidthFromWidgetSize = (widgetSize: number): number => 10 + widgetSize * 0.4;

describe('Journey Flow - Uploaded node shapes and sizes without style', () => {
  const profile = getProfile('style-apply-cypress-test-style');

  it('sets node shape by variable and toggles the node symbol table from the 2D settings pane', () => {
    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);

    openNodeShapesPanel();

    cy.window().its('commonService.session.style.widgets.node-symbol-variable').should('equal', 'None');

    cy.get('@nodesTab').find('#node-symbol-variable').click({ force: true });
    cy.contains('li[role="option"]', 'Node type').click({ force: true });

    cy.window().its('commonService.session.style.widgets.node-symbol-variable').should('equal', 'Node type');
    cy.window().its('commonService.session.style.widgets.node-symbol-table-visible').should('equal', 'Show');
    assertNodeSymbolTableVisibility(true);

    cy.window().then((win: any) => {
      const cyInstance = win.cytoscapeInstance;
      const visibleNodes = cyInstance
        .nodes(':visible')
        .filter((node: any) => node.children().length === 0);

      const personNodes = visibleNodes.filter((node: any) => node.data('Node type') === 'Person');
      const facilityNodes = visibleNodes.filter((node: any) => node.data('Node type') === 'Facility');

      expect(personNodes.length, 'person nodes with uploaded data').to.be.greaterThan(0);
      expect(facilityNodes.length, 'facility nodes with uploaded data').to.be.greaterThan(0);

      const personShape = String(personNodes[0].style('shape'));
      const facilityShape = String(facilityNodes[0].style('shape'));

      expect(personShape, 'person shape').not.to.equal(facilityShape);
    });

    cy.get('@nodesTab')
      .find('#node-symbol-table-row')
      .contains('Hide')
      .click({ force: true });

    cy.window().its('commonService.session.style.widgets.node-symbol-table-visible').should('equal', 'Hide');
    assertNodeSymbolTableVisibility(false);

    cy.get('@nodesTab')
      .find('#node-symbol-table-row')
      .contains('Show')
      .click({ force: true });

    cy.window().its('commonService.session.style.widgets.node-symbol-table-visible').should('equal', 'Show');
    assertNodeSymbolTableVisibility(true);

    cy.get('body').type('{esc}');
    assertNodeSymbolTableVisibility(false);
    closeTwoDSettingsDialog();
  });

  it('applies node sizing by variable and respects min and max size controls on uploaded data', () => {
    const updatedMinSize = 25;
    const updatedMaxSize = 90;

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);

    openNodeShapesPanel();

    cy.window().its('commonService.session.style.widgets.node-radius-variable').should('equal', 'None');

    cy.get('@nodesTab').find('#node-radius-variable').click({ force: true });
    cy.contains('li[role="option"]', 'Degree').click({ force: true });

    cy.window().its('commonService.session.style.widgets.node-radius-variable').should('equal', 'degree');
    cy.get('@nodesTab').find('#node-radius-row').should('not.be.visible');
    cy.get('@nodesTab').find('#node-max-radius-row').should('be.visible');
    cy.get('@nodesTab').find('#node-min-radius-row').should('be.visible');

    cy.window().then((win: any) => {
      const cyInstance = win.cytoscapeInstance;
      const rankedByDegree = cyInstance
        .nodes(':visible')
        .filter((node: any) => node.children().length === 0)
        .map((node: any) => ({
          degree: Number(node.data('degree') ?? 0),
          width: parseFloat(String(node.style('width'))),
        }))
        .sort((a: any, b: any) => a.degree - b.degree);

      expect(rankedByDegree.length, 'visible nodes with computed degree').to.be.greaterThan(1);
      expect(rankedByDegree[rankedByDegree.length - 1].degree, 'degree range exists').to.be.greaterThan(rankedByDegree[0].degree);
      expect(rankedByDegree[rankedByDegree.length - 1].width, 'higher degree node renders larger').to.be.greaterThan(rankedByDegree[0].width);
    });

    cy.get('@nodesTab')
      .find('#node-radius-min')
      .invoke('val', String(updatedMinSize))
      .trigger('input', { force: true })
      .trigger('change', { force: true });

    cy.get('@nodesTab')
      .find('#node-radius-max')
      .invoke('val', String(updatedMaxSize))
      .trigger('input', { force: true })
      .trigger('change', { force: true });

    cy.window()
      .its('commonService.session.style.widgets')
      .should((widgets) => {
        expect(Number(widgets['node-radius-min']), 'node-radius-min widget').to.equal(updatedMinSize);
        expect(Number(widgets['node-radius-max']), 'node-radius-max widget').to.equal(updatedMaxSize);
      });

    closeTwoDSettingsDialog();

    getVisibleLeafNodeWidths().then((widths) => {
      expect(widths.length, 'visible node widths after size-by-variable update').to.be.greaterThan(0);
      expect(Math.min(...widths), 'rendered minimum node width').to.be.closeTo(renderedNodeWidthFromWidgetSize(updatedMinSize), 1);
      expect(Math.max(...widths), 'rendered maximum node width').to.be.closeTo(renderedNodeWidthFromWidgetSize(updatedMaxSize), 1);
    });
  });

  it('applies a fixed node size when Size By is None on uploaded data', () => {
    const updatedSize = 70;
    const expectedRenderedWidth = renderedNodeWidthFromWidgetSize(updatedSize);

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);

    openNodeShapesPanel();

    cy.window().its('commonService.session.style.widgets.node-radius-variable').should('equal', 'None');
    cy.get('@nodesTab').find('#node-radius-row').should('be.visible');
    cy.get('@nodesTab').find('#node-max-radius-row').should('not.be.visible');
    cy.get('@nodesTab').find('#node-min-radius-row').should('not.be.visible');

    cy.get('@nodesTab')
      .find('#node-radius')
      .invoke('val', String(updatedSize))
      .trigger('input', { force: true })
      .trigger('change', { force: true });

    cy.window()
      .its('commonService.session.style.widgets.node-radius')
      .should((value) => {
        expect(Number(value)).to.equal(updatedSize);
      });

    closeTwoDSettingsDialog();

    getVisibleLeafNodeWidths().then((widths) => {
      expect(widths.length, 'visible node widths after fixed-size update').to.be.greaterThan(0);
      widths.forEach((width) => {
        expect(width, 'rendered fixed node width').to.be.closeTo(expectedRenderedWidth, 1);
      });
    });
  });

  it('applies node border width on uploaded data', () => {
    const updatedBorderWidth = 5;

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);

    openNodeShapesPanel();

    cy.get('@nodesTab')
      .find('#node-border-width')
      .invoke('val', String(updatedBorderWidth))
      .trigger('input', { force: true })
      .trigger('change', { force: true });

    cy.window().its('commonService.session.style.widgets.node-border-width').should('equal', updatedBorderWidth);
    closeTwoDSettingsDialog();

    cy.window().then((win: any) => {
      const cyInstance = win.cytoscapeInstance;
      const visibleNode = cyInstance
        .nodes(':visible')
        .filter((node: any) => node.children().length === 0)
        .first();

      expect(visibleNode.empty(), 'visible uploaded node exists for border width check').to.equal(false);
      expect(parseFloat(String(visibleNode.style('border-width'))), 'rendered border width').to.be.closeTo(updatedBorderWidth, 0.2);
    });
  });
});
