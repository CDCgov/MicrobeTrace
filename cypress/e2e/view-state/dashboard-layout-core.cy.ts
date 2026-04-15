/// <reference types="cypress" />

import {
  visitAppAndAcceptEula,
} from '../../support/journey-helpers';
import {
  assertDashboardViewReady,
  assertOpenDashboardTabs,
  assertPaneRect,
  closeDashboardTab,
  dragGoldenLayoutSplitter,
  focusDashboardTab,
  loadDashboardSessionFixture,
  openDashboardViews,
} from '../../support/dashboard-helpers';
import { byTestId, testIds } from '../../support/selectors';

type PaneRect = {
  width: number;
  height: number;
};

const CORE_TABS = ['2D Network', 'Map', 'Bubble', 'Table'];

const readPaneRect = (selector: string): Cypress.Chainable<PaneRect> => {
  return cy.get(selector, { timeout: 15000 }).then(($element) => {
    const rect = $element.get(0)?.getBoundingClientRect();

    expect(rect, `pane rect for ${selector}`).to.exist;

    return {
      width: Number(rect?.width || 0),
      height: Number(rect?.height || 0),
    };
  });
};

describe('Dashboard View State - Golden Layout mechanics', () => {
  beforeEach(() => {
    visitAppAndAcceptEula();
    loadDashboardSessionFixture('dashboard-layout-core.microbetrace');
    assertOpenDashboardTabs(CORE_TABS);
  });

  it('renders the core 2x2 dashboard, survives real splitter drags, and keeps sibling panes healthy across close/reopen', () => {
    CORE_TABS.forEach((viewName) => {
      focusDashboardTab(viewName);
    });

    cy.window().its('commonService.visuals.gisMap.lmap').should('exist');
    cy.window().its('commonService.visuals.gisMap.layers').should('exist');

    assertPaneRect('#cy', 200, 160);
    assertPaneRect('.mapStyle', 200, 160);
    assertPaneRect(byTestId(testIds.bubbleCanvas), 200, 160);
    assertPaneRect('.table-wrapper', 200, 160);

    readPaneRect('#cy').as('twoDRectBeforeVertical');
    readPaneRect('.mapStyle').as('mapRectBeforeVertical');

    dragGoldenLayoutSplitter(0, 140, 0);

    cy.get<PaneRect>('@twoDRectBeforeVertical').then((before) => {
      readPaneRect('#cy').should((after) => {
        expect(Math.abs(after.width - before.width), '2D width changes after vertical drag').to.be.greaterThan(40);
      });
    });

    cy.get<PaneRect>('@mapRectBeforeVertical').then((before) => {
      readPaneRect('.mapStyle').should((after) => {
        expect(Math.abs(after.width - before.width), 'Map width changes after vertical drag').to.be.greaterThan(40);
      });
    });

    readPaneRect('#cy').as('twoDRectBeforeHorizontal');
    readPaneRect(byTestId(testIds.bubbleCanvas)).as('bubbleRectBeforeHorizontal');

    dragGoldenLayoutSplitter(0, 0, 110);

    cy.get<PaneRect>('@twoDRectBeforeHorizontal').then((before) => {
      readPaneRect('#cy').should((after) => {
        expect(Math.abs(after.height - before.height), '2D height changes after horizontal drag').to.be.greaterThan(40);
      });
    });

    cy.get<PaneRect>('@bubbleRectBeforeHorizontal').then((before) => {
      readPaneRect(byTestId(testIds.bubbleCanvas)).should((after) => {
        expect(Math.abs(after.height - before.height), 'Bubble height changes after horizontal drag').to.be.greaterThan(40);
      });
    });

    closeDashboardTab('Bubble');
    assertOpenDashboardTabs(['2D Network', 'Map', 'Table']);

    focusDashboardTab('2D Network');
    focusDashboardTab('Map');
    focusDashboardTab('Table');
    assertDashboardViewReady('Table');
    cy.get('.table-wrapper .p-datatable-tbody > tr', { timeout: 15000 })
      .should('have.length.greaterThan', 0);

    focusDashboardTab('2D Network');
    openDashboardViews(['Bubble']);
    assertOpenDashboardTabs(CORE_TABS);

    focusDashboardTab('Bubble');
    focusDashboardTab('2D Network');
    focusDashboardTab('Map');
    focusDashboardTab('Table');
    assertDashboardViewReady('Table');
    cy.get('.table-wrapper .p-datatable-tbody > tr', { timeout: 15000 })
      .should('have.length.greaterThan', 0);
  });
});
