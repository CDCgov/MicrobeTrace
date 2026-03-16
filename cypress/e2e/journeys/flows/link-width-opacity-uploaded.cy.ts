/// <reference types="cypress" />

import { getProfile } from '../datasets/profile';
import {
  assertAfterLaunchCounts,
  expandAccordionTabByHeader,
  launchProfileToTwoD,
  openTwoDSettingsDialog,
} from '../../../support/journey-helpers';

const openLinkShapesPanel = (): void => {
  openTwoDSettingsDialog();
  cy.get('@twoDSettings').contains('.nav-link', 'Links').click({ force: true });
  cy.get('@twoDSettings')
    .find('.tab-pane:visible', { timeout: 15000 })
    .should('exist')
    .as('linksTab');

  expandAccordionTabByHeader('@linksTab', 'Shapes and Sizes');
};

const closeTwoDSettingsDialog = (): void => {
  cy.get('@twoDSettings')
    .find('button.p-dialog-close-button')
    .click({ force: true });

  cy.contains('.p-dialog-title', '2D Network Settings').should('not.exist');
};

const getVisibleEdgeWidths = (): Cypress.Chainable<number[]> => {
  return cy.window().then((win: any) => {
    const cyInstance = win.cytoscapeInstance;
    expect(cyInstance, 'cytoscapeInstance').to.exist;

    return cyInstance
      .edges(':visible')
      .map((edge: any) => parseFloat(String(edge.style('width'))))
      .filter((width: number) => Number.isFinite(width)) as number[];
  });
};

const getVisibleEdgeOpacities = (): Cypress.Chainable<number[]> => {
  return cy.window().then((win: any) => {
    const cyInstance = win.cytoscapeInstance;
    expect(cyInstance, 'cytoscapeInstance').to.exist;

    return cyInstance
      .edges(':visible')
      .map((edge: any) => parseFloat(String(edge.style('line-opacity'))))
      .filter((opacity: number) => Number.isFinite(opacity)) as number[];
  });
};

const getVisibleEdgeWidthRange = (): Cypress.Chainable<{ min: number; max: number }> => {
  return getVisibleEdgeWidths().then((widths) => {
    expect(widths.length, 'visible link widths available for range check').to.be.greaterThan(0);

    return {
      min: Math.min(...widths),
      max: Math.max(...widths),
    };
  });
};

describe('Journey Flow - Uploaded link fixed width and transparency controls', () => {
  const profile = getProfile('nn-angulartesting-tn93-edgelist');

  it('applies a fixed link width on uploaded data when Width By is None', () => {
    const updatedWidth = 12;

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);

    getVisibleEdgeWidths().as('initialLinkWidths');

    openLinkShapesPanel();

    cy.window().its('commonService.session.style.widgets.link-width-variable').should('equal', 'None');
    cy.get('@linksTab').find('#link-width-row').should('be.visible');
    cy.get('@linksTab').find('#link-max-width-row').should('not.be.visible');
    cy.get('@linksTab').find('#link-min-width-row').should('not.be.visible');

    cy.get('@linksTab')
      .find('#link-width')
      .invoke('val', String(updatedWidth))
      .trigger('input', { force: true })
      .trigger('change', { force: true });

    cy.window()
      .its('commonService.session.style.widgets.link-width')
      .should((value) => {
        expect(Number(value)).to.equal(updatedWidth);
      });

    closeTwoDSettingsDialog();

    getVisibleEdgeWidths().then((updatedWidths) => {
      expect(updatedWidths.length, 'visible link widths after fixed-width change').to.be.greaterThan(0);
      updatedWidths.forEach((width) => {
        expect(width, 'rendered fixed link width').to.be.closeTo(updatedWidth, 0.5);
      });

      cy.get<number[]>('@initialLinkWidths').then((initialWidths) => {
        const changed = updatedWidths.some((width, index) => Math.abs(width - initialWidths[index]) > 0.5);
        expect(changed, 'at least one rendered width changed from the initial state').to.equal(true);
      });
    });
  });

  it('applies link transparency on uploaded data', () => {
    const updatedOpacity = 0.45;

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);

    openLinkShapesPanel();

    cy.window()
      .its('commonService.session.style.widgets.link-opacity')
      .should((value) => {
        expect(Number(value)).to.equal(0);
      });

    cy.get('@linksTab')
      .find('#link-opacity')
      .invoke('val', String(updatedOpacity))
      .trigger('input', { force: true })
      .trigger('change', { force: true });

    cy.window()
      .its('commonService.session.style.widgets.link-opacity')
      .should((value) => {
        expect(Number(value)).to.equal(updatedOpacity);
      });

    closeTwoDSettingsDialog();

    getVisibleEdgeOpacities().then((updatedOpacities) => {
      expect(updatedOpacities.length, 'visible link opacities after transparency change').to.be.greaterThan(0);
      updatedOpacities.forEach((opacity) => {
        expect(opacity, 'rendered link opacity').to.be.closeTo(updatedOpacity, 0.02);
      });
    });
  });

  it('applies min and max link widths when sizing uploaded links by distance', () => {
    const updatedMinWidth = 2.4;
    const updatedMaxWidth = 18.6;

    launchProfileToTwoD(profile);
    assertAfterLaunchCounts(profile);

    openLinkShapesPanel();

    cy.get('@linksTab').find('#link-width-variable').click({ force: true });
    cy.contains('li[role="option"]', 'Distance').click({ force: true });

    cy.window().its('commonService.session.style.widgets.link-width-variable').should('equal', 'distance');
    cy.get('@linksTab').find('#link-width-row').should('not.be.visible');
    cy.get('@linksTab').find('#link-max-width-row').should('be.visible');
    cy.get('@linksTab').find('#link-min-width-row').should('be.visible');

    cy.get('@linksTab')
      .find('#link-width-min')
      .invoke('val', String(updatedMinWidth))
      .trigger('input', { force: true })
      .trigger('change', { force: true });

    cy.get('@linksTab')
      .find('#link-width-max')
      .invoke('val', String(updatedMaxWidth))
      .trigger('input', { force: true })
      .trigger('change', { force: true });

    cy.window()
      .its('commonService.session.style.widgets')
      .should((widgets) => {
        expect(Number(widgets['link-width-min']), 'link-width-min widget').to.equal(updatedMinWidth);
        expect(Number(widgets['link-width-max']), 'link-width-max widget').to.equal(updatedMaxWidth);
      });

    closeTwoDSettingsDialog();

    getVisibleEdgeWidthRange().then((range) => {
      expect(range.min, 'rendered minimum edge width').to.be.closeTo(updatedMinWidth, 0.5);
      expect(range.max, 'rendered maximum edge width').to.be.closeTo(updatedMaxWidth, 0.5);
      expect(range.max - range.min, 'rendered width range expands beyond a flat width').to.be.greaterThan(5);
    });
  });
});
