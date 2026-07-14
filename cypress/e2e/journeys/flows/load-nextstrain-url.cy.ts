/// <reference types="cypress" />

import {
  ensureTwoDNetworkView,
  openGlobalFilteringTab,
  setGlobalLinkThreshold,
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
      expect(visibleLinks.length, 'links generated from stubbed Nextstrain URL').to.equal(3);
      expect(win.commonService.session.files[0]?.format, 'Nextstrain URL file format').to.equal('auspice');
      expect(win.commonService.session.data.newickSource, 'Newick source marker').to.equal('auspice');
      expect(win.commonService.session.style.widgets['default-distance-metric'], 'decimal divergence metric').to.equal('tn93');
      expect(Number(win.commonService.session.style.widgets['link-threshold']), 'decimal divergence threshold').to.equal(0.015);
    });

    openGlobalFilteringTab();
    setGlobalLinkThreshold(0.025);
    cy.closeGlobalSettings();
    waitForProcessingDialogToClear(60000);

    cy.window().then((win: any) => {
      const links = win.commonService.session.data.links;
      const visibleLinks = links.filter(l => l.visible);

      expect(links.length, 'links materialized after raising Nextstrain threshold').to.equal(6);
      expect(visibleLinks.length, 'visible links after raising Nextstrain threshold').to.equal(6);
      expect(
        win.commonService.session.meta.performance.patristic.edgeGeneration.threshold,
        'patristic re-query threshold',
      ).to.equal(0.025);
    });

    openPhylogeneticTreeView();
    cy.get('#phylocanvas', { timeout: 30000 }).should('be.visible');
  });

  it('loads Nextstrain URL data when geo resolutions omit referenced demes', () => {
    cy.fixture(fixtureName).then((dataset) => {
      const datasetWithMissingDeme = Cypress._.cloneDeep(dataset);
      datasetWithMissingDeme.meta.geo_resolutions = [
        {
          key: 'region',
          demes: {
            Americas: {
              latitude: 12.34,
              longitude: -56.78,
            },
          },
        },
      ];

      cy.intercept('GET', nextstrainUrl, datasetWithMissingDeme).as('loadNextstrainDatasetWithMissingDeme');
    });

    visitAppAndAcceptEula({
      extraQuery: { url: nextstrainUrl },
    });

    cy.wait('@loadNextstrainDatasetWithMissingDeme', { timeout: 30000 });
    waitForProcessingDialogToClear(120000);
    cy.window({ timeout: 300000 })
      .its('commonService.session.network.isFullyLoaded')
      .should('equal', true);

    cy.window().then((win: any) => {
      const nodes = win.commonService.session.data.nodes;
      const americaNode = nodes.find((node: any) => node._id === 'YF_A');
      const africaNode = nodes.find((node: any) => node._id === 'YF_C');

      expect(nodes.length, 'nodes loaded despite missing geospatial deme').to.equal(4);
      expect(americaNode.latitude, 'known deme latitude').to.equal(12.34);
      expect(americaNode.longitude, 'known deme longitude').to.equal(-56.78);
      expect(africaNode.latitude, 'missing deme latitude').to.be.oneOf([null, undefined]);
      expect(africaNode.longitude, 'missing deme longitude').to.be.oneOf([null, undefined]);
      expect(win.commonService.session.data.nodeFields, 'latitude field').to.include('latitude');
      expect(win.commonService.session.data.nodeFields, 'longitude field').to.include('longitude');
    });
  });
});
