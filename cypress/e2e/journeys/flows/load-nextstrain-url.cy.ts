/// <reference types="cypress" />

import {
  assertTwoDNetworkReady,
  ensureTwoDNetworkView,
  waitForProcessingDialogToClear,
  visitAppAndAcceptEula,
} from '../../../support/journey-helpers';
import { byTestId, testIds } from '../../../support/selectors';

describe('Journey Flow - Load Nextstrain URL', () => {
  const nextstrainUrl = 'https://nextstrain.org/yellow-fever/genome';
  const fixtureName = 'nextstrain-yellow-fever-small.json';

  const openPhylogeneticTreeView = (): void => {
    cy.get(byTestId(testIds.appViewMenuButton), { timeout: 15000 }).click({ force: true });
    cy.get('.cdk-overlay-container', { timeout: 15000 })
      .contains('button', 'Phylogenetic Tree')
      .click({ force: true });
  };

  it('loads Nextstrain URL data and opens the phylogenetic tree view', () => {
    cy.intercept('GET', nextstrainUrl, { fixture: fixtureName }).as('loadNextstrainDataset');

    visitAppAndAcceptEula({
      extraQuery: { url: nextstrainUrl },
    });

    cy.wait('@loadNextstrainDataset', { timeout: 30000 });
    cy.wait(2000)
    waitForProcessingDialogToClear(120000);
    cy.wait(2000)
    cy.window({ timeout: 300000 })
      .its('commonService.session.network.isFullyLoaded')
      .should('equal', true);

    ensureTwoDNetworkView();

    cy.window().then((win: any) => {
      const nodes = win.commonService.session.data.nodes;
      const visibleLinks = win.commonService.session.data.links.filter(l => l.visible);

      expect(nodes.length, 'nodes loaded from stubbed Nextstrain URL').to.equal(4);
      expect(visibleLinks.length, 'links generated from stubbed Nextstrain URL').to.equal(6);
      expect(win.commonService.session.style.widgets['default-distance-metric'], 'decimal divergence metric').to.equal('tn93');
      expect(Number(win.commonService.session.style.widgets['link-threshold']), 'decimal divergence threshold').to.equal(0.015);
    });

    openPhylogeneticTreeView();
    cy.get('#phylocanvas', { timeout: 30000 }).should('be.visible');
  });
});
