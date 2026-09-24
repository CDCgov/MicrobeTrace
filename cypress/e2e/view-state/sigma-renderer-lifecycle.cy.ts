/// <reference types="cypress" />

import {
  closeDashboardTab,
  focusDashboardTab,
  openDashboardViews,
} from '../../support/dashboard-helpers';

const loadSampleDataset = (): void => {
  cy.contains('button', 'Continue with Sample Dataset', { timeout: 15000 })
    .should('be.visible')
    .click({ force: true });
  cy.get('#overlay', { timeout: 15000 }).should('not.be.visible');
  cy.get('[data-testid="network-render-summary"]', { timeout: 30000 })
    .should('contain.text', '33 nodes')
    .and('contain.text', '74 available links');
};

describe('Sigma renderer lifecycle', () => {
  it('releases renderer and graph resources across repeated close and reopen cycles', () => {
    cy.visit('/?skipEula=1');
    loadSampleDataset();

    Cypress._.times(5, cycle => {
      cy.window().then(win => {
        const appWindow = win as any;
        const twoD = appWindow.commonService.visuals.twoD;
        const adapter = twoD?.sigmaRenderer;
        const retiredAdapters = appWindow.__sigmaRetiredAdapters ||= [];

        expect(adapter, `active Sigma adapter in cycle ${cycle + 1}`).to.exist;
        expect(adapter.getRenderer(), `active Sigma renderer in cycle ${cycle + 1}`).to.exist;
        expect(adapter.hasActiveWebglContext(), `active WebGL context in cycle ${cycle + 1}`)
          .to.equal(true);
        expect(adapter.getGraph().order, `resident nodes in cycle ${cycle + 1}`).to.equal(33);
        expect(adapter.getGraph().size, `resident links in cycle ${cycle + 1}`).to.equal(74);
        expect(retiredAdapters, 'a fresh adapter is created for each reopened view')
          .not.to.include(adapter);
        retiredAdapters.push(adapter);
      });

      closeDashboardTab('2D Network');
      cy.get('[data-testid="sigma-network"]').should('not.exist');
      cy.window({ timeout: 15000 }).should(win => {
        const appWindow = win as any;
        expect(appWindow.commonService.visuals.twoD, `component released in cycle ${cycle + 1}`)
          .to.equal(null);
        for (const adapter of appWindow.__sigmaRetiredAdapters) {
          expect(adapter.getRenderer(), 'retired Sigma renderer').to.equal(null);
          expect(adapter.hasActiveWebglContext(), 'retired WebGL context').to.equal(false);
          expect(adapter.getGraph().order, 'retired resident graph nodes').to.equal(0);
          expect(adapter.getGraph().size, 'retired resident graph links').to.equal(0);
          expect(adapter.getDisplayGraph().order, 'retired display graph nodes').to.equal(0);
          expect(adapter.getDisplayGraph().size, 'retired display graph links').to.equal(0);
        }
      });

      openDashboardViews(['2D Network']);
      cy.get('[data-testid="network-render-summary"]', { timeout: 30000 })
        .should('contain.text', '33 nodes')
        .and('contain.text', '74 available links');
    });

    cy.window().then(win => {
      const appWindow = win as any;
      const retiredAdapters = appWindow.__sigmaRetiredAdapters as any[];
      const activeAdapter = appWindow.commonService.visuals.twoD.sigmaRenderer;

      expect(retiredAdapters).to.have.length(5);
      expect(new Set(retiredAdapters).size, 'unique retired adapters').to.equal(5);
      expect(retiredAdapters).not.to.include(activeAdapter);
      expect(activeAdapter.getGraph().order).to.equal(33);
      expect(activeAdapter.getGraph().size).to.equal(74);
      expect(activeAdapter.hasActiveWebglContext()).to.equal(true);
    });
  });

  it('releases and restores resources across sustained tab switches and style rerenders', () => {
    cy.visit('/?skipEula=1');
    loadSampleDataset();

    cy.window().then(win => {
      const appWindow = win as any;
      appWindow.__sigmaSwitchRetiredAdapters = [];
      appWindow.__sigmaLongSessionCanvasCount = win.document
        .querySelectorAll('[data-testid="sigma-network"] canvas').length;

      expect(appWindow.__sigmaLongSessionCanvasCount, 'initial Sigma canvas layers')
        .to.be.greaterThan(0);
    });

    Cypress._.times(12, cycle => {
      cy.window().then(win => {
        const appWindow = win as any;
        const twoD = appWindow.commonService.visuals.twoD;
        const adapter = twoD.sigmaRenderer;
        const renderer = adapter.getRenderer();

        expect(adapter, `active adapter before switch ${cycle + 1}`).to.exist;
        expect(renderer, `active renderer before switch ${cycle + 1}`).to.exist;
        expect(appWindow.__sigmaSwitchRetiredAdapters).not.to.include(adapter);
        expect(adapter.hasActiveWebglContext()).to.equal(true);
        expect(adapter.getGraph().order).to.equal(33);
        expect(adapter.getGraph().size).to.equal(74);

        twoD.onNodeBorderWidthChange((cycle % 4) + 1);
        twoD.onLinkWidthChange((cycle % 3) + 1);
        expect(adapter.getRenderer(), `style rerender reuses renderer in cycle ${cycle + 1}`)
          .to.equal(renderer);
        appWindow.__sigmaSwitchRetiredAdapters.push(adapter);
      });

      focusDashboardTab('Table');
      cy.get('.table-wrapper', { timeout: 30000 }).should('be.visible');
      focusDashboardTab('2D Network');
      cy.get('[data-testid="network-render-summary"]', { timeout: 30000 })
        .should('contain.text', '33 nodes')
        .and('contain.text', '74 available links');

      cy.window().then(win => {
        const appWindow = win as any;
        const twoD = appWindow.commonService.visuals.twoD;
        const adapter = twoD.sigmaRenderer;
        const retiredAdapters = appWindow.__sigmaSwitchRetiredAdapters as any[];
        const retiredAdapter = retiredAdapters[retiredAdapters.length - 1];
        const canvasCount = win.document
          .querySelectorAll('[data-testid="sigma-network"] canvas').length;

        expect(retiredAdapter.getRenderer(), `renderer released after switch ${cycle + 1}`)
          .to.equal(null);
        expect(retiredAdapter.hasActiveWebglContext(), `WebGL released after switch ${cycle + 1}`)
          .to.equal(false);
        expect(retiredAdapter.getGraph().order, `graph released after switch ${cycle + 1}`)
          .to.equal(0);
        expect(retiredAdapter.getDisplayGraph().order, `display graph released after switch ${cycle + 1}`)
          .to.equal(0);
        expect(retiredAdapters, `fresh adapter after switch ${cycle + 1}`)
          .not.to.include(adapter);
        expect(adapter.getRenderer(), `restored renderer after switch ${cycle + 1}`).to.exist;
        expect(adapter.hasActiveWebglContext(), `WebGL active after switch ${cycle + 1}`)
          .to.equal(true);
        expect(adapter.getGraph().order).to.equal(33);
        expect(adapter.getGraph().size).to.equal(74);
        expect(canvasCount, `stable canvas layer count after switch ${cycle + 1}`)
          .to.equal(appWindow.__sigmaLongSessionCanvasCount);
      });
    });

    cy.window().then(win => {
      const appWindow = win as any;
      const adapter = appWindow.commonService.visuals.twoD.sigmaRenderer;
      const finalCanvasCount = win.document
        .querySelectorAll('[data-testid="sigma-network"] canvas').length;

      expect(appWindow.__sigmaSwitchRetiredAdapters).to.have.length(12);
      expect(new Set(appWindow.__sigmaSwitchRetiredAdapters).size, 'unique switch adapters')
        .to.equal(12);
      expect(appWindow.__sigmaSwitchRetiredAdapters).not.to.include(adapter);
      expect(adapter.getRenderer()).to.exist;
      expect(finalCanvasCount, 'Sigma canvas layers remain stable')
        .to.equal(appWindow.__sigmaLongSessionCanvasCount);
      expect(adapter.getGraph().order).to.equal(33);
      expect(adapter.getGraph().size).to.equal(74);
    });
  });
});
