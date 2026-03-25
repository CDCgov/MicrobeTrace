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

  const openPhylogeneticTreeView = (): void => {
    cy.get(byTestId(testIds.appViewMenuButton), { timeout: 15000 }).click({ force: true });
    cy.get('.cdk-overlay-container', { timeout: 15000 })
      .contains('button', 'Phylogenetic Tree')
      .click({ force: true });
  };

  it('loads Nextstrain URL data and opens the phylogenetic tree view', () => {
    visitAppAndAcceptEula({
      extraQuery: { url: nextstrainUrl },
    });

    cy.wait(2000)
    waitForProcessingDialogToClear(120000);
    cy.wait(2000)
    cy.window({ timeout: 300000 })
      .its('commonService.session.network.isFullyLoaded')
      .should('equal', true);

    ensureTwoDNetworkView();

    cy.window().then((win: any) => {
      expect(win.commonService.session.data.nodes.length, 'nodes loaded from URL').to.be.eq(356);
      expect(win.commonService.session.data.links.filter(l => l.visible).length, 'links loaded from URL').to.be.eq(14374);
    });

    openPhylogeneticTreeView();
    cy.get('#phylocanvas', { timeout: 30000 }).should('be.visible');
  });
});
