/// <reference types="cypress" />

import { openGlobalFilteringTab, visitAppAndAcceptEula } from '../../../support/journey-helpers';

describe('Global Settings layout and reveal', () => {
  beforeEach(() => {
    visitAppAndAcceptEula({ skipDemoSession: false, dismissWelcomeOverlay: true });
    cy.window().its('commonService.session.data.nodes').should('have.length.greaterThan', 0);
  });

  it('keeps the same width across tabs and fits the viewport on desktop and narrow screens', () => {
    for (const [width, height] of [[1280, 900], [480, 800]]) {
      cy.viewport(width, height);
      cy.openGlobalSettings();
      let firstTabWidth = 0;

      for (const tab of ['Styling', 'Filtering', 'Timeline']) {
        cy.contains('#global-settings-modal .nav-link', tab).click();
        cy.get('#global-settings-modal .p-dialog').should(($dialog) => {
          const rect = $dialog[0].getBoundingClientRect();
          const content = $dialog[0].querySelector('.p-dialog-content') as HTMLElement;
          if (tab === 'Styling') firstTabWidth = rect.width;

          expect(rect.width, `${tab} width at ${width}px`).to.be.closeTo(firstTabWidth, 1);
          expect(rect.left, `${tab} left edge`).to.be.at.least(0);
          expect(rect.right, `${tab} right edge`).to.be.at.most(width);
          expect(content.scrollWidth, `${tab} horizontal overflow`).to.be.at.most(content.clientWidth + 1);
        });
        cy.contains('#global-settings-modal button', 'Done').should(($button) => {
          expect($button[0].getBoundingClientRect().bottom, 'Done remains in the viewport').to.be.at.most(height);
        });
      }
      cy.closeGlobalSettings();
    }
  });

  it('preserves docked, hidden, and floating color tables when revealing data', () => {
    for (const [nodeMode, linkMode] of [['Dock', 'Dock'], ['Dock', 'Hide'], ['Hide', 'Show'], ['Show', 'Dock']]) {
      cy.window().then((win: any) => {
        const app = win.commonService.visuals.microbeTrace;
        app.SelectedNodeColorTableTypesVariable = nodeMode;
        app.onNodeColorTableChanged();
        app.SelectedLinkColorTableTypesVariable = linkMode;
        app.onLinkColorTableChanged();
      });

      openGlobalFilteringTab();
      cy.get('#reveal-all').click();
      cy.window().should((win: any) => {
        const app = win.commonService.visuals.microbeTrace;
        expect(app.SelectedNodeColorTableTypesVariable, 'node color table mode').to.equal(nodeMode);
        expect(app.SelectedLinkColorTableTypesVariable, 'link color table mode').to.equal(linkMode);
      });
      for (const [target, mode] of [['node', nodeMode], ['link', linkMode]]) {
        cy.get(`#global-settings-${target}-color-table .p-dialog`)
          .should(mode === 'Show' ? 'be.visible' : 'not.exist');
        if (mode === 'Dock') {
          cy.get(`#key-tables-${target}-table`).should('be.visible');
        }
      }
      cy.closeGlobalSettings();
    }
  });
});
